/* GPU 2-D FDTD Wave Optics (shared/gpu/gpu-fdtd.js).
   Yee-grid TEz (Ez, Hx, Hy) electrodynamics at Courant limit dt = 0.5*dx/c.
   Double-slit PEC diffraction screen, continuous harmonic dipole source,
   and quadratic absorbing sponge boundary layer.
   Displays instantaneous electric field Ez with click-toggle for time-averaged intensity <Ez^2>. */

(function (root, factory) {
    if (typeof module === "object" && module.exports) module.exports = factory(root);
    else factory(root);
}(typeof self !== "undefined" ? self : this, function (root) {
    "use strict";

    root.SIMS = root.SIMS || {};
    const SIMS = root.SIMS;
    const GFX = root.GFX;

    const FS_UPDATE_H = `#version 300 es
precision highp float;
in vec2 vUV; out vec4 fragColor;
uniform sampler2D uTexE;
uniform sampler2D uTexH;
uniform int uDim;
uniform float uDt;

void main() {
    ivec2 p = ivec2(gl_FragCoord.xy);
    vec2 h = texelFetch(uTexH, p, 0).xy;

    float ezCenter = texelFetch(uTexE, p, 0).r;
    float ezUp     = texelFetch(uTexE, ivec2(p.x, min(p.y + 1, uDim - 1)), 0).r;
    float ezRight  = texelFetch(uTexE, ivec2(min(p.x + 1, uDim - 1), p.y), 0).r;

    h.x -= uDt * (ezUp - ezCenter);
    h.y += uDt * (ezRight - ezCenter);

    fragColor = vec4(h.x, h.y, 0.0, 1.0);
}`;

    const FS_UPDATE_E = `#version 300 es
precision highp float;
in vec2 vUV; out vec4 fragColor;
uniform sampler2D uTexE;
uniform sampler2D uTexH;
uniform int uDim;
uniform float uDt, uTime;
uniform vec2 uSourcePos;
uniform float uOmega;

void main() {
    ivec2 p = ivec2(gl_FragCoord.xy);
    vec2 stateE = texelFetch(uTexE, p, 0).xy;
    float ez = stateE.x;
    float avgI = stateE.y;

    vec2 hCenter = texelFetch(uTexH, p, 0).xy;
    float hyLeft = texelFetch(uTexH, ivec2(max(p.x - 1, 0), p.y), 0).y;
    float hxDown = texelFetch(uTexH, ivec2(p.x, max(p.y - 1, 0)), 0).x;

    ez += uDt * ((hCenter.y - hyLeft) - (hCenter.x - hxDown));

    int wallX = int(float(uDim) * 0.34);
    int slit1Y = int(float(uDim) * 0.44);
    int slit2Y = int(float(uDim) * 0.56);
    int slitW = int(float(uDim) * 0.024);

    if (p.x == wallX) {
        bool inSlit1 = abs(p.y - slit1Y) <= slitW;
        bool inSlit2 = abs(p.y - slit2Y) <= slitW;
        if (!inSlit1 && !inSlit2) {
            ez = 0.0;
        }
    }

    ivec2 srcP = ivec2(uSourcePos * float(uDim));
    if (abs(p.x - srcP.x) <= 1 && abs(p.y - srcP.y) <= 1) {
        float d = length(vec2(p - srcP));
        float srcVal = sin(uOmega * uTime) * exp(-d * d * 1.5);
        ez += srcVal * 0.75;
    }

    float border = 28.0;
    float dx = min(float(p.x), float(uDim - 1 - p.x));
    float dy = min(float(p.y), float(uDim - 1 - p.y));
    float dEdge = min(dx, dy);
    if (dEdge < border) {
        float f = dEdge / border;
        float damp = 0.92 + 0.08 * (f * f);
        ez *= damp;
    }

    avgI = mix(avgI, ez * ez, 0.015);
    fragColor = vec4(ez, avgI, 0.0, 1.0);
}`;

    const FS_RENDER_WAVE = `#version 300 es
precision highp float;
in vec2 vUV; out vec4 fragColor;
uniform sampler2D uTexE;
uniform vec3 uAccent;
uniform int uDim;
uniform int uMode;

void main() {
    vec2 uv = vUV;
    ivec2 p = ivec2(uv * float(uDim));
    vec2 stateE = texelFetch(uTexE, p, 0).xy;
    float ez = stateE.x;
    float avgI = stateE.y;

    vec3 col = vec3(0.0);
    if (uMode == 0) {
        vec3 colPos = mix(uAccent, vec3(1.0, 0.98, 0.92), 0.45);
        vec3 colNeg = vec3(0.12, 0.35, 0.85);
        float pos = clamp(ez * 2.2, 0.0, 1.0);
        float neg = clamp(-ez * 2.2, 0.0, 1.0);
        col = colPos * pos + colNeg * neg;
    } else {
        float iNorm = clamp(avgI * 6.5, 0.0, 1.0);
        col = mix(vec3(0.0), uAccent * 1.6 + vec3(0.4, 0.35, 0.2), iNorm * iNorm);
    }

    fragColor = vec4(col, 1.0);
}`;

    SIMS["fdtd-wave-optics"] = SIMS["PH3010"] = (canvas, opts = {}) => {
        if (!GFX || !GFX.supported) return;

        const isMob = typeof window !== "undefined" && window.innerWidth <= 900;
        const gridDim = isMob ? 256 : 512;
        let simTime = 0.0;
        let showAverage = false;
        const dt = 0.5;
        const omega = 0.22;

        const hProg = GFX.program(GFX.VS_QUAD, FS_UPDATE_H);
        const eProg = GFX.program(GFX.VS_QUAD, FS_UPDATE_E);
        const renderProg = GFX.program(GFX.VS_QUAD, FS_RENDER_WAVE);

        let ePP = null;
        let hTgt = null;
        let sceneTarget = null;

        const updateCaption = () => {
            const modeName = showAverage ? "Time-averaged intensity ⟨Ez²⟩ (interference fringes)" : "Instantaneous Ez field";
            const tag = `2-D FDTD Yee grid (${gridDim}²) · double-slit PEC diffraction · ${modeName} · click to toggle intensity mode`;
            if (window.KW && window.KW.tag) window.KW.tag(tag, canvas);
        };
        updateCaption();

        if (window.KW && window.KW.onClick) {
            window.KW.onClick(canvas, () => {
                showAverage = !showAverage;
                updateCaption();
            });
        }

        return GFX.mount(canvas, (gfx, c, getSize) => ({
            resize: (rw, rh) => {
                let fresh = false;
                if (!ePP) {
                    ePP = gfx.pingPong(gridDim, gridDim, { fp32: true, nearest: true });
                    ePP.clear(0, 0, 0, 1);
                    fresh = true;
                }
                if (!hTgt) {
                    hTgt = gfx.target(gridDim, gridDim, { fp32: true, nearest: true });
                    hTgt.clear(0, 0, 0, 1);
                }
                if (fresh) {
                    for (let step = 0; step < 160; step++) {
                        simTime += dt;
                        hProg.use()
                            .tex("uTexE", ePP.read(), 0)
                            .tex("uTexH", hTgt, 1)
                            .i1("uDim", gridDim)
                            .f1("uDt", dt);
                        gfx.quad(hProg, hTgt, gridDim, gridDim);

                        eProg.use()
                            .tex("uTexE", ePP.read(), 0)
                            .tex("uTexH", hTgt, 1)
                            .i1("uDim", gridDim)
                            .f1("uDt", dt)
                            .f1("uTime", simTime)
                            .f2("uSourcePos", 0.16, 0.50)
                            .f1("uOmega", omega);
                        gfx.quad(eProg, ePP.write(), gridDim, gridDim);
                        ePP.swap();
                    }
                }
                if (!sceneTarget) sceneTarget = gfx.target(rw, rh, { fp32: false });
                else sceneTarget.resize(rw, rh);
            },
            frame: (t, frameDt, ctx2d, outW, outH, isReduced) => {
                const substeps = isReduced ? 1 : 4;

                for (let s = 0; s < substeps; s++) {
                    simTime += dt;

                    // 1. Update H
                    hProg.use()
                        .tex("uTexE", ePP.read(), 0)
                        .tex("uTexH", hTgt, 1)
                        .i1("uDim", gridDim)
                        .f1("uDt", dt);
                    gfx.quad(hProg, hTgt, gridDim, gridDim);

                    // 2. Update E
                    eProg.use()
                        .tex("uTexE", ePP.read(), 0)
                        .tex("uTexH", hTgt, 1)
                        .i1("uDim", gridDim)
                        .f1("uDt", dt)
                        .f1("uTime", simTime)
                        .f2("uSourcePos", 0.16, 0.50)
                        .f1("uOmega", omega);
                    gfx.quad(eProg, ePP.write(), gridDim, gridDim);
                    ePP.swap();
                }

                // Render wave into sceneTarget
                const a = (window.KW && window.KW.col && window.KW.col.a) || [97, 199, 242];
                renderProg.use()
                    .tex("uTexE", ePP.read(), 0)
                    .i1("uDim", gridDim)
                    .i1("uMode", showAverage ? 1 : 0)
                    .f3("uAccent", a[0] / 255, a[1] / 255, a[2] / 255);
                gfx.quad(renderProg, sceneTarget);

                gfx.compose(sceneTarget, ctx2d, outW, outH, {
                    time: t,
                    bloomGain: 0.50,
                    threshold: 0.32,
                    exposure: 1.12
                });
            },
            dispose: () => {
                if (ePP) ePP.dispose();
                if (hTgt) hTgt.dispose();
                if (sceneTarget) sceneTarget.dispose();
            }
        }));
    };
}));
