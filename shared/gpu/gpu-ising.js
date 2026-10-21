/* GPU 2-D Ising Model (shared/gpu/gpu-ising.js).
   512x512 lattice (256x256 on mobile) integrated via GPU checkerboard Metropolis.
   Sub-lattice red-black decomposition preserves exact detailed balance in parallel.
   Domain walls luminesce into HDR bloom with ACES tonemapping and film grain.
   Interactive temperature modulation centred on Onsager critical point Tc ≈ 2.269. */

(function (root, factory) {
    if (typeof module === "object" && module.exports) module.exports = factory(root);
    else factory(root);
}(typeof self !== "undefined" ? self : this, function (root) {
    "use strict";

    root.SIMS = root.SIMS || {};
    const SIMS = root.SIMS;
    const GFX = root.GFX;

    const FS_INIT_SPINS = `#version 300 es
precision highp float;
precision highp int;
in vec2 vUV; out vec4 fragColor;
uniform uint uSeed; uniform int uDim;
${GFX.GLSL_PRNG}
void main() {
    ivec2 p = ivec2(gl_FragCoord.xy);
    uint s = uSeed + uint(p.y * uDim + p.x) * 1664525u;
    float r = rand01(s);
    float spin = r > 0.5 ? 1.0 : -1.0;
    fragColor = vec4(spin, 0.0, 0.0, 1.0);
}`;

    const FS_METROPOLIS = `#version 300 es
precision highp float;
precision highp int;
in vec2 vUV; out vec4 fragColor;
uniform sampler2D uSpins;
uniform int uParity; uniform int uDim;
uniform float uBeta; uniform uint uSeed;
${GFX.GLSL_PRNG}

void main() {
    ivec2 p = ivec2(gl_FragCoord.xy);
    float s = texelFetch(uSpins, p, 0).r;
    int parity = (p.x + p.y) & 1;

    if (parity != uParity) {
        fragColor = vec4(s, 0.0, 0.0, 1.0);
        return;
    }

    ivec2 up = ivec2(p.x, (p.y + 1) % uDim);
    ivec2 dn = ivec2(p.x, (p.y - 1 + uDim) % uDim);
    ivec2 lf = ivec2((p.x - 1 + uDim) % uDim, p.y);
    ivec2 rg = ivec2((p.x + 1) % uDim, p.y);

    float sumNeighbours = texelFetch(uSpins, up, 0).r
                        + texelFetch(uSpins, dn, 0).r
                        + texelFetch(uSpins, lf, 0).r
                        + texelFetch(uSpins, rg, 0).r;

    float dE = 2.0 * s * sumNeighbours;
    uint rng = uSeed + uint(p.y * uDim + p.x) * 2891336453u;
    float u = rand01(rng);

    if (dE <= 0.0 || u < exp(-dE * uBeta)) {
        s = -s;
    }

    fragColor = vec4(s, 0.0, 0.0, 1.0);
}`;

    const FS_RENDER_LATTICE = `#version 300 es
precision highp float;
in vec2 vUV; out vec4 fragColor;
uniform sampler2D uSpins;
uniform vec3 uAccent;
uniform int uDim;
uniform float uCenterOffset;

void main() {
    vec2 uv = vUV;
    if (uCenterOffset > 0.0) {
        uv.x = (vUV.x - 0.28) / 0.72;
        if (uv.x < 0.0 || uv.x > 1.0) {
            fragColor = vec4(0.012, 0.014, 0.022, 1.0);
            return;
        }
    }
    ivec2 p = ivec2(uv * float(uDim));
    float s = texelFetch(uSpins, p, 0).r;

    ivec2 up = ivec2(p.x, min(p.y + 1, uDim - 1));
    ivec2 dn = ivec2(p.x, max(p.y - 1, 0));
    ivec2 lf = ivec2(max(p.x - 1, 0), p.y);
    ivec2 rg = ivec2(min(p.x + 1, uDim - 1), p.y);

    float sUp = texelFetch(uSpins, up, 0).r;
    float sDn = texelFetch(uSpins, dn, 0).r;
    float sLf = texelFetch(uSpins, lf, 0).r;
    float sRg = texelFetch(uSpins, rg, 0).r;

    float wall = 0.25 * (abs(s - sUp) + abs(s - sDn) + abs(s - sLf) + abs(s - sRg));

    vec3 colUp = mix(uAccent, vec3(1.0, 0.96, 0.88), 0.35);
    vec3 colDn = vec3(0.005, 0.006, 0.010);
    vec3 baseCol = (s > 0.0) ? colUp : colDn;

    vec3 wallGlow = mix(uAccent, vec3(1.0, 0.8, 0.5), 0.7) * (wall * 2.8);
    vec3 hdr = baseCol * 0.45 + wallGlow;

    fragColor = vec4(hdr, 1.0);
}`;

    SIMS["ising-model"] = SIMS["PH2040"] = (canvas, opts = {}) => {
        if (!GFX || !GFX.supported) return;

        const isMob = typeof window !== "undefined" && window.innerWidth <= 900;
        const gridDim = isMob ? 256 : 512;
        let T = opts.temp || 2.269;
        const TC = 2.269185;
        let frameSeed = 1013904223;

        const initProg = GFX.program(GFX.VS_QUAD, FS_INIT_SPINS);
        const metroProg = GFX.program(GFX.VS_QUAD, FS_METROPOLIS);
        const renderProg = GFX.program(GFX.VS_QUAD, FS_RENDER_LATTICE);

        let spinsPP = null;
        let sceneTarget = null;

        const updateCaption = () => {
            const phase = T < TC - 0.08 ? "Ferromagnetic order (M > 0)" : (T > TC + 0.08 ? "Paramagnetic disorder (M ≈ 0)" : "Critical point fluctuations (scale-invariant)");
            const tag = `Ising 2-D lattice (${gridDim}²) · T = ${T.toFixed(3)} (T_c = 2.269) · ${phase} · drag vertically to modulate T`;
            if (window.KW && window.KW.tag) window.KW.tag(tag, canvas);
        };
        updateCaption();

        let dragging = false;
        const onDown = (e) => { dragging = true; onMove(e); };
        const onMove = (e) => {
            if (!dragging && e.type === "pointermove" && !e.buttons) return;
            const rect = canvas.getBoundingClientRect();
            const relY = 1.0 - Math.min(1.0, Math.max(0.0, (e.clientY - rect.top) / Math.max(1, rect.height)));
            T = 1.2 + relY * 2.6;
            updateCaption();
        };
        const onUp = () => { dragging = false; };

        canvas.addEventListener("pointerdown", onDown);
        canvas.addEventListener("pointermove", onMove);
        if (typeof window !== "undefined") window.addEventListener("pointerup", onUp);

        return GFX.mount(canvas, (gfx, c, getSize) => ({
            resize: (rw, rh) => {
                if (!spinsPP) {
                    spinsPP = gfx.pingPong(gridDim, gridDim, { fp32: true, nearest: true });
                    initProg.use()
                        .i1("uDim", gridDim);
                    GFX.gl.uniform1ui(initProg.u("uSeed"), 94821);
                    gfx.quad(initProg, spinsPP.read(), gridDim, gridDim);
                }
                if (!sceneTarget) sceneTarget = gfx.target(rw, rh, { fp32: false });
                else sceneTarget.resize(rw, rh);
            },
            frame: (t, dt, ctx2d, outW, outH, isReduced) => {
                const steps = isReduced ? 1 : 4;
                const gl = GFX.gl;

                metroProg.use()
                    .i1("uDim", gridDim)
                    .f1("uBeta", 1.0 / Math.max(T, 0.1));

                for (let s = 0; s < steps; s++) {
                    // Parity 0 (even)
                    frameSeed = (frameSeed * 1664525 + 1013904223) >>> 0;
                    metroProg.tex("uSpins", spinsPP.read(), 0)
                             .i1("uParity", 0);
                    gl.uniform1ui(metroProg.u("uSeed"), frameSeed);
                    gfx.quad(metroProg, spinsPP.write(), gridDim, gridDim);
                    spinsPP.swap();

                    // Parity 1 (odd)
                    frameSeed = (frameSeed * 1664525 + 1013904223) >>> 0;
                    metroProg.tex("uSpins", spinsPP.read(), 0)
                             .i1("uParity", 1);
                    gl.uniform1ui(metroProg.u("uSeed"), frameSeed);
                    gfx.quad(metroProg, spinsPP.write(), gridDim, gridDim);
                    spinsPP.swap();
                }

                // Render lattice into sceneTarget
                const a = (window.KW && window.KW.col && window.KW.col.a) || [115, 217, 184];
                renderProg.use()
                    .tex("uSpins", spinsPP.read(), 0)
                    .i1("uDim", gridDim)
                    .f1("uCenterOffset", isMob ? 0.0 : 0.48)
                    .f3("uAccent", a[0] / 255, a[1] / 255, a[2] / 255);
                gfx.quad(renderProg, sceneTarget);

                gfx.compose(sceneTarget, ctx2d, outW, outH, {
                    time: t,
                    bloomGain: 0.55,
                    threshold: 0.35,
                    exposure: 1.15
                });
            },
            dispose: () => {
                canvas.removeEventListener("pointerdown", onDown);
                canvas.removeEventListener("pointermove", onMove);
                if (typeof window !== "undefined") window.removeEventListener("pointerup", onUp);
                if (spinsPP) spinsPP.dispose();
                if (sceneTarget) sceneTarget.dispose();
            }
        }));
    };
}));
