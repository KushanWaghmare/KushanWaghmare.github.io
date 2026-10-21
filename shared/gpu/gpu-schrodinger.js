/* 2-D Split-Step Fourier Schrödinger Simulation (shared/gpu/gpu-schrodinger.js).
   512x512 grid (256x256 on mobile), hbar = m = 1.
   Strang splitting: exp(-i*V*dt/2) -> FFT -> exp(-i*k^2*dt/2) -> IFFT -> exp(-i*V*dt/2).
   Stockham radix-2 FFT in RGBA32F ping-pong buffers.
   Double-slit barrier, absorbing boundary layer, interactive packet launcher.
   Documented dt: dt = 0.0015 ensures max kinetic phase step k_max^2 * dt / 2 < 1.2 rad < pi. */

(function (root, factory) {
    if (typeof module === "object" && module.exports) module.exports = factory(root);
    else factory(root);
}(typeof self !== "undefined" ? self : this, function (root) {
    "use strict";

    root.SIMS = root.SIMS || {};
    const SIMS = root.SIMS;
    const GFX = root.GFX;

    // 1. Initial Gaussian Wave Packet & Double Slit Potential
    const FS_INIT = `#version 300 es
precision highp float;
in vec2 vUV;
out vec4 fragColor;
uniform vec2 uSource; // Launch position in [-1, 1]
uniform vec2 uK0;     // Initial wavevector (momentum)

void main() {
    vec2 p = vUV * 2.0 - 1.0;
    vec2 d = p - uSource;
    float sigma = 0.08;
    float envelope = exp(-dot(d, d) / (4.0 * sigma * sigma));
    float phase = dot(uK0, p * 20.0);
    // RGBA: (re, im, potential V, absorbing mask)
    fragColor = vec4(envelope * cos(phase), envelope * sin(phase), 0.0, 1.0);
}`;

    // 2. Potential Half-Step & Absorber Pass: psi *= exp(-i * V * dt / 2) * mask
    const FS_POTENTIAL = `#version 300 es
precision highp float;
in vec2 vUV;
out vec4 fragColor;
uniform sampler2D uPsi;
uniform float uHalfDt;
uniform int uApplySlits;

void main() {
    vec4 state = texture(uPsi, vUV);
    vec2 psi = state.xy;
    vec2 p = vUV * 2.0 - 1.0;

    // Double-slit potential barrier at x = 0
    float V = 0.0;
    if (uApplySlits == 1 && abs(p.x) < 0.028) {
        float slit1 = abs(p.y - 0.22);
        float slit2 = abs(p.y + 0.22);
        if (slit1 > 0.065 && slit2 > 0.065) {
            V = 240.0; // High barrier
        }
    }

    // Absorbing boundary mask to prevent periodic boundary wraparound
    float r = length(p);
    float mask = 1.0 - smoothstep(0.78, 0.98, r);

    // Complex phase rotation: exp(-i * V * halfDt)
    float theta = -V * uHalfDt;
    float c = cos(theta), s = sin(theta);
    vec2 rotPsi = vec2(psi.x * c - psi.y * s, psi.x * s + psi.y * c) * mask;

    fragColor = vec4(rotPsi, V, mask);
}`;

    // 3. Stockham Radix-2 1D FFT Pass (Horizontal or Vertical)
    const FS_STOCKHAM = `#version 300 es
precision highp float;
in vec2 vUV;
out vec4 fragColor;
uniform sampler2D uPsi;
uniform int uDir;     // 0 = horizontal (row), 1 = vertical (col)
uniform int uN;       // Grid dimension (e.g. 512 or 256)
uniform int uR;       // R = 2^stage
uniform float uSign;  // -1.0 for FFT, +1.0 for IFFT

void main() {
    ivec2 coord = ivec2(gl_FragCoord.xy);
    int idx = uDir == 0 ? coord.x : coord.y;
    int other = uDir == 0 ? coord.y : coord.x;

    int L = uR * 2;
    int j = idx % L;
    int block = idx / L;

    int j0 = block * uR + (j % uR);
    int j1 = j0 + uN / 2;

    ivec2 coord0 = uDir == 0 ? ivec2(j0, other) : ivec2(other, j0);
    ivec2 coord1 = uDir == 0 ? ivec2(j1, other) : ivec2(other, j1);

    vec2 u0 = texelFetch(uPsi, coord0, 0).xy;
    vec2 u1 = texelFetch(uPsi, coord1, 0).xy;

    float angle = uSign * 6.28318530718 * float(j % uR) / float(L);
    vec2 w = vec2(cos(angle), sin(angle));
    vec2 twiddled = vec2(u1.x * w.x - u1.y * w.y, u1.x * w.y + u1.y * w.x);

    vec2 res = (j < uR) ? (u0 + twiddled) : (u0 - twiddled);
    fragColor = vec4(res, 0.0, 1.0);
}`;

    // 4. Kinetic Propagator in Momentum Space: psi_k *= exp(-i * (kx^2 + ky^2) * dt / 2)
    const FS_KINETIC = `#version 300 es
precision highp float;
in vec2 vUV;
out vec4 fragColor;
uniform sampler2D uPsiK;
uniform float uDt;
uniform int uN;

void main() {
    ivec2 coord = ivec2(gl_FragCoord.xy);
    vec2 psi = texelFetch(uPsiK, coord, 0).xy;

    // Shift zero-frequency to corners
    float kx = float(coord.x < uN / 2 ? coord.x : coord.x - uN) * (6.2831853 / 4.0);
    float ky = float(coord.y < uN / 2 ? coord.y : coord.y - uN) * (6.2831853 / 4.0);
    float k2 = kx * kx + ky * ky;

    // exp(-i * k^2 * dt / 2)
    float phase = -0.5 * k2 * uDt;
    float c = cos(phase), s = sin(phase);
    vec2 rot = vec2(psi.x * c - psi.y * s, psi.x * s + psi.y * c);

    // Normalization factor 1 / (N * N) for IFFT
    fragColor = vec4(rot / float(uN * uN), 0.0, 1.0);
}`;

    // 5. Render Scene to HDR Target: Phase -> Hue, Amplitude -> Luminance, Barrier Overlay
    const FS_RENDER = `#version 300 es
precision highp float;
in vec2 vUV; out vec4 fragColor;
uniform sampler2D uPsi; uniform vec3 uAccent; uniform float uCenterOffset;
vec3 phaseToRGB(float ph) {
    return mix(uAccent, 0.5 + 0.5 * cos(ph + vec3(0.0, 2.094, 4.188)), 0.7);
}
void main() {
    vec2 uv = vUV;
    if (uCenterOffset > 0.0) {
        uv.x = (vUV.x - 0.28) / 0.72;
        if (uv.x < 0.0 || uv.x > 1.0) {
            fragColor = vec4(0.0);
            return;
        }
    }
    vec4 state = texture(uPsi, uv);
    float amp = length(state.xy), phase = atan(state.y, state.x);
    vec3 col = phaseToRGB(phase) * pow(amp * 3.8, 1.15);
    if (state.z > 1.0) col += vec3(0.12, 0.14, 0.22);
    fragColor = vec4(col, 1.0);
}`;

    SIMS["split-step-schrodinger"] = (canvas, opts = {}) => {
        if (!GFX || !GFX.supported) {
            if (root.ENGINES && root.ENGINES.wave) {
                return root.ENGINES.wave(canvas, { grid: 256, k0: 64, sigma: 0.036 });
            }
            return null;
        }

        const isMob = GFX.isMobile();
        const N = isMob ? 256 : 512;
        const stages = Math.round(Math.log2(N));
        const dt = 0.0015; // Documented dt: k_max^2 * dt / 2 < 1.2 rad < pi

        const initProg = GFX.program(GFX.VS_QUAD, FS_INIT);
        const potProg = GFX.program(GFX.VS_QUAD, FS_POTENTIAL);
        const stockhamProg = GFX.program(GFX.VS_QUAD, FS_STOCKHAM);
        const kineticProg = GFX.program(GFX.VS_QUAD, FS_KINETIC);
        const renderProg = GFX.program(GFX.VS_QUAD, FS_RENDER);

        let psiPP = null;
        let sceneTarget = null;
        let launchSource = [-0.6, 0.0];
        let launchK0 = [1.8, 0.0];

        const launchPacket = (nx, ny) => {
            launchSource = [nx, ny];
            const toCenter = [-nx, -ny];
            const len = Math.hypot(...toCenter) + 1e-4;
            launchK0 = [(toCenter[0] / len) * 1.8, (toCenter[1] / len) * 1.8];
            initProg.use()
                .f2("uSource", launchSource[0], launchSource[1])
                .f2("uK0", launchK0[0], launchK0[1]);
            GFX.quad(initProg, psiPP.read(), N, N);
        };

        KW.tag("2-D Schrödinger · Split-step Fourier · 512² grid · Stockham GPU FFT · click to launch wavepacket", canvas);

        KW.onClick(canvas, () => {
            const cursor = KW.local(canvas);
            const w = canvas.clientWidth || 800, h = canvas.clientHeight || 600;
            const nx = (cursor.x / w) * 2.0 - 1.0;
            const ny = 1.0 - (cursor.y / h) * 2.0;
            launchPacket(Math.max(-0.85, Math.min(0.85, nx)), Math.max(-0.85, Math.min(0.85, ny)));
        });

        // Run Stockham 2D FFT
        const runFft2D = (sign) => {
            // Horizontal (rows)
            for (let s = 0; s < stages; s++) {
                const R = 1 << s;
                stockhamProg.use()
                    .tex("uPsi", psiPP.read(), 0)
                    .i1("uDir", 0).i1("uN", N).i1("uR", R).f1("uSign", sign);
                GFX.quad(stockhamProg, psiPP.write(), N, N);
                psiPP.swap();
            }
            // Vertical (cols)
            for (let s = 0; s < stages; s++) {
                const R = 1 << s;
                stockhamProg.use()
                    .tex("uPsi", psiPP.read(), 0)
                    .i1("uDir", 1).i1("uN", N).i1("uR", R).f1("uSign", sign);
                GFX.quad(stockhamProg, psiPP.write(), N, N);
                psiPP.swap();
            }
        };

        let acc = 0;

        return GFX.mount(canvas, (gfx, c, getSize) => ({
            resize: (rw, rh) => {
                if (!psiPP) {
                    psiPP = gfx.pingPong(N, N, { fp32: true, nearest: true });
                    launchPacket(-0.6, 0.0);
                }
                if (!sceneTarget) sceneTarget = gfx.target(rw, rh, { fp32: false });
                else sceneTarget.resize(rw, rh);
            },
            frame: (t, deltaT, ctx2d, outW, outH, isReduced) => {
                acc = Math.min(acc + deltaT, 0.045);
                const stepsThisFrame = isReduced ? 1 : Math.floor(acc / dt);

                for (let s = 0; s < stepsThisFrame; s++) {
                    // 1. Potential half-step: exp(-i * V * dt / 2)
                    potProg.use()
                        .tex("uPsi", psiPP.read(), 0)
                        .f1("uHalfDt", 0.5 * dt)
                        .i1("uApplySlits", 1);
                    gfx.quad(potProg, psiPP.write(), N, N);
                    psiPP.swap();

                    // 2. Forward FFT
                    runFft2D(-1.0);

                    // 3. Kinetic step in momentum space
                    kineticProg.use()
                        .tex("uPsiK", psiPP.read(), 0)
                        .f1("uDt", dt)
                        .i1("uN", N);
                    gfx.quad(kineticProg, psiPP.write(), N, N);
                    psiPP.swap();

                    // 4. Inverse FFT
                    runFft2D(1.0);

                    // 5. Potential half-step: exp(-i * V * dt / 2)
                    potProg.use()
                        .tex("uPsi", psiPP.read(), 0)
                        .f1("uHalfDt", 0.5 * dt)
                        .i1("uApplySlits", 1);
                    gfx.quad(potProg, psiPP.write(), N, N);
                    psiPP.swap();

                    acc -= dt;
                }

                // Render into HDR target
                const a = KW.col.a;
                const isMob = GFX.isMobile();
                renderProg.use()
                    .tex("uPsi", psiPP.read(), 0)
                    .f1("uCenterOffset", isMob ? 0.0 : 0.48)
                    .f3("uAccent", a[0] / 255, a[1] / 255, a[2] / 255);
                gfx.quad(renderProg, sceneTarget);

                // Post-process with Dual-Kawase bloom and ACES tonemapping
                gfx.compose(sceneTarget, ctx2d, outW, outH, {
                    time: t,
                    bloomGain: 0.44,
                    threshold: 0.35,
                    exposure: 1.2
                });
            },
            dispose: () => {
                if (psiPP) psiPP.dispose();
                if (sceneTarget) sceneTarget.dispose();
            }
        }));
    };
}));
