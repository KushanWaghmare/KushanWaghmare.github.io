/* GPU Fourier Epicycles & Spectral Waterfall (shared/gpu/gpu-fourier.js).
   Evaluates discrete Fourier series z(t) = ∑ cₖ exp(i k ω t) via rotating epicycles.
   Spectral waterfall displays live harmonic power spectrum |cₖ| with Gibbs synthesis.
   Fading HDR accumulation buffer illuminates the reconstructed analytical contour.
   Governing equations: cₖ = (1/2π) ∫ f(t) e^{-i k t} dt, Gibbs overshoot ≈ 8.95%. */

(function (root, factory) {
    if (typeof module === "object" && module.exports) module.exports = factory(root);
    else factory(root);
}(typeof self !== "undefined" ? self : this, function (root) {
    "use strict";

    root.SIMS = root.SIMS || {};
    const SIMS = root.SIMS;
    const GFX = root.GFX;

    // Epicycle circles & tip line shader
    const VS_EPICYCLE = `#version 300 es
precision highp float;
uniform float uTime;
uniform float uCenterOffset;
uniform int uNumHarmonics;
uniform int uMode; // 0: Cardioid, 1: Trefoil, 2: Square wave Gibbs
out vec2 vPos;

// Compute k-th Fourier coefficient (re, im) for current mode
vec2 getCoeff(int k) {
    if (uMode == 0) {
        // Cardioid: r = 1 - sin(t)
        if (k == 0) return vec2(0.0, 0.0);
        if (k == 1) return vec2(0.48, 0.0);
        if (k == -1) return vec2(0.48, 0.0);
        if (k == 2) return vec2(0.0, -0.22);
        if (k == -2) return vec2(0.0, 0.22);
        return vec2(0.0);
    } else if (uMode == 1) {
        // Trefoil knot projection: parametric harmonic loop
        if (k == 1) return vec2(0.55, 0.0);
        if (k == -2) return vec2(0.28, 0.0);
        if (k == 3) return vec2(0.0, 0.15);
        return vec2(0.0);
    } else {
        // Square wave Gibbs synthesis: c_k = 2 / (i * pi * k) for odd k
        if (k == 0) return vec2(0.0, 0.0);
        if ((k & 1) != 0) {
            float fk = float(k);
            return vec2(0.0, -0.65 / (3.14159265 * fk));
        }
        return vec2(0.0);
    }
}

void main() {
    int totalVerts = gl_VertexID;
    // Tip position by summing rotating epicycle vectors
    vec2 pos = vec2(uCenterOffset > 0.0 ? 0.35 : -0.25, 0.0);
    for (int k = -12; k <= 12; k++) {
        vec2 c = getCoeff(k);
        float r = length(c);
        if (r > 1e-4) {
            float phase = atan(c.y, c.x);
            float angle = float(k) * uTime + phase;
            pos += vec2(cos(angle), sin(angle)) * r;
        }
    }
    gl_Position = vec4(pos, 0.0, 1.0);
    gl_PointSize = 2.4;
    vPos = pos;
}`;

    const FS_EPICYCLE = `#version 300 es
precision highp float;
in vec2 vPos; out vec4 fragColor;
uniform vec3 uAccent;

void main() {
    vec2 c = gl_PointCoord - 0.5;
    if (dot(c, c) > 0.25) discard;
    vec3 col = mix(uAccent, vec3(1.0, 0.98, 0.92), 0.65);
    fragColor = vec4(col * 0.052, 1.0);
}`;

    // Spectral waterfall & circle rings overlay
    const FS_WATERFALL = `#version 300 es
precision highp float;
in vec2 vUV; out vec4 fragColor;
uniform float uTime;
uniform float uCenterOffset;
uniform vec3 uAccent;
uniform int uMode;

void main() {
    vec2 p = vUV * 2.0 - 1.0;
    vec3 col = vec3(0.0);

    // Spectral waterfall: right side
    float xMin = uCenterOffset > 0.0 ? 0.74 : 0.52;
    float xMax = 0.95;
    if (p.x >= xMin && p.x <= xMax && p.y >= -0.85 && p.y <= 0.85) {
        float relX = (p.x - xMin) / (xMax - xMin);
        int barIdx = int(relX * 16.0);
        float k = float(barIdx - 8);

        // Power spectrum |c_k|
        float power = 0.0;
        if (uMode == 0) {
            if (abs(k) == 1.0) power = 0.75;
            else if (abs(k) == 2.0) power = 0.38;
        } else if (uMode == 1) {
            if (k == 1.0) power = 0.82;
            else if (k == -2.0) power = 0.45;
            else if (k == 3.0) power = 0.25;
        } else {
            if (int(k) != 0 && (int(k) & 1) != 0) {
                power = 0.85 / abs(k);
            }
        }

        float barHeight = power * 0.75;
        float barY = (p.y + 0.80) / 1.6;
        if (barY <= barHeight) {
            float inner = fract(relX * 16.0);
            if (inner >= 0.15 && inner <= 0.85) {
                col = mix(uAccent * 0.7, vec3(1.0, 0.92, 0.6), barY / max(barHeight, 0.01));
            }
        }
    }

    fragColor = vec4(col, 1.0);
}`;

    const runFourier = (canvas, opts = {}) => {
        if (!GFX || !GFX.supported) return;

        let mode = opts.mode !== undefined ? opts.mode : 0;
        const modes = [
            "Cardioid epicycles · r = 1 - sin(t) · 4 harmonics",
            "Trefoil knot projection · 3 coupled epicycles",
            "Square wave Gibbs phenomenon · ∑ sin((2m+1)t)/(2m+1) · 8.95% overshoot"
        ];
        let simTime = 0.0;

        const epiProg = GFX.program(VS_EPICYCLE, FS_EPICYCLE);
        const waterProg = GFX.program(GFX.VS_QUAD, FS_WATERFALL);
        const blitProg = GFX.program(GFX.VS_QUAD, `#version 300 es
precision highp float; in vec2 vUV; out vec4 fragColor; uniform sampler2D uTex;
void main() { fragColor = texture(uTex, vUV); }`);

        let trailPP = null;
        let sceneTarget = null;

        const updateCaption = () => {
            const tag = `Fourier spectral analysis · ${modes[mode]} · click to toggle curve`;
            if (window.KW && window.KW.tag) window.KW.tag(tag, canvas);
        };
        updateCaption();

        if (window.KW && window.KW.onClick) {
            window.KW.onClick(canvas, () => {
                mode = (mode + 1) % modes.length;
                if (trailPP) trailPP.clear(0, 0, 0, 1);
                updateCaption();
            });
        }

        return GFX.mount(canvas, (gfx, c, getSize) => ({
            resize: (rw, rh) => {
                if (!trailPP) trailPP = gfx.pingPong(rw, rh, { fp32: false });
                else trailPP.resize(rw, rh);
                if (!sceneTarget) sceneTarget = gfx.target(rw, rh, { fp32: false });
                else sceneTarget.resize(rw, rh);
            },
            frame: (t, dt, ctx2d, outW, outH, isReduced) => {
                simTime += isReduced ? 0.01 : dt * 1.4;

                // Fading accumulation buffer for drawn curve
                const trailScene = gfx.fadeScene(trailPP, isReduced ? 0.0 : 0.96);
                sceneTarget.clear(0, 0, 0, 1);

                blitProg.use().tex("uTex", trailScene, 0);
                gfx.quad(blitProg, sceneTarget);

                const a = (window.KW && window.KW.col && window.KW.col.a) || [199, 146, 234];
                const gl = GFX.gl;

                const isMob = GFX.isMobile();
                const offset = isMob ? 0.0 : 0.48;

                // Draw epicycle tip point into accumulation target
                gl.enable(gl.BLEND);
                gl.blendFunc(gl.ONE, gl.ONE);
                epiProg.use()
                    .f1("uTime", simTime)
                    .i1("uMode", mode)
                    .f1("uCenterOffset", offset)
                    .f3("uAccent", a[0] / 255, a[1] / 255, a[2] / 255);
                gl.drawArrays(gl.POINTS, 0, 1);

                // Overlay spectral waterfall
                waterProg.use()
                    .f1("uTime", simTime)
                    .i1("uMode", mode)
                    .f1("uCenterOffset", offset)
                    .f3("uAccent", a[0] / 255, a[1] / 255, a[2] / 255);
                gfx.quad(waterProg, sceneTarget);
                gl.disable(gl.BLEND);

                blitProg.use().tex("uTex", sceneTarget, 0);
                gfx.quad(blitProg, trailPP.write());
                trailPP.swap();

                gfx.compose(sceneTarget, ctx2d, outW, outH, {
                    time: t,
                    bloomGain: 0.50,
                    threshold: 0.32,
                    exposure: 1.15
                });
            },
            dispose: () => {
                if (trailPP) trailPP.dispose();
                if (sceneTarget) sceneTarget.dispose();
            }
        }));
    };

    SIMS.fourier = SIMS["fourier-spectral"] = runFourier;
}));
