/**
 * gpu-quant-singularity.js
 *
 * Full-screen Kerr–Financial Market Singularity (Quant Finance Hero).
 * Renders a relativistic ray-marched spacetime black hole with an equatorial
 * Breeden–Litzenberger capital accretion disk, Black–Scholes Gamma caustic ring,
 * and relativistic Doppler beaming on the shared GFX WebGL2 context.
 *
 * Adheres strictly to the 2-context ceiling, pitch-black background, and UK English captions.
 */

(function (root) {
    "use strict";

    const SIMS = (root.SIMS = root.SIMS || {});
    const M = root.QuantSingularityMath || (typeof require !== "undefined" ? require("../lib/quant-singularity-math.js") : null);
    const S = root.QuantSingularityShaders || (typeof require !== "undefined" ? require("./gpu-quant-singularity-shaders.js") : null);

    const isMobile = () => (typeof window !== "undefined" ? window.innerWidth < 900 : false);

    SIMS["market-singularity"] = SIMS["quant-singularity"] = (canvas, opts = {}) => {
        const GFX = root.GFX;
        if (!GFX || !GFX.supported) {
            return fallbackGbm(canvas, opts);
        }

        const shaders = S || root.QuantSingularityShaders;
        const math = M || root.QuantSingularityMath;
        if (!shaders || !math) {
            return fallbackGbm(canvas, opts);
        }

        return GFX.mount(canvas, (glCanvas, gfx) => {
            const gl = gfx.gl;
            const prog = gfx.program(shaders.VS_QUAD, shaders.FS_MARKET_SINGULARITY);
            if (!prog) return null;

            let sceneTarget = null;
            let targetW = 0, targetH = 0;
            let currentScale = isMobile() ? 0.65 : 1.0;
            let maxSteps = isMobile() ? 110 : 185;

            // Cinematic camera & market spin state
            let curSpin = 0.82;      // Default prograde momentum a = +0.82
            let targetSpin = 0.82;
            let curTilt = 1.32;      // ~76 degrees inclination
            let targetTilt = 1.32;

            let shockStartTime = -100.0;
            let lastFrameTime = performance.now();
            let avgFrameTime = 16.6;

            const host = canvas.closest ? (canvas.closest(".snap-section") || canvas) : canvas;

            // Volatility shock trigger
            const triggerShock = () => {
                shockStartTime = performance.now() * 0.001;
                // Momentarily surge spin towards extremal limit
                targetSpin = targetSpin >= 0 ? 0.95 : -0.95;
            };

            host.addEventListener("click", triggerShock);
            if (root.KW && root.KW.onClick) {
                root.KW.onClick(canvas, triggerShock);
            }

            // HUD telemetry element
            let simTagEl = null;
            if (host) {
                simTagEl = host.querySelector(".sim-tag");
            }
            let lastTelemetryTime = 0;

            const ensureTarget = (w, h) => {
                const tw = Math.max(2, Math.floor(w * currentScale));
                const th = Math.max(2, Math.floor(h * currentScale));
                if (sceneTarget && targetW === tw && targetH === th) return;
                if (sceneTarget) sceneTarget.dispose();
                sceneTarget = gfx.target(tw, th, { fp32: false });
                targetW = tw;
                targetH = th;
            };

            const instObj = {
                step: (dt, t) => {
                    // Cursor tracking via KW.local
                    if (root.KW && root.KW.local) {
                        const m = root.KW.local(canvas);
                        const rect = canvas.getBoundingClientRect();
                        if (m.x >= 0 && m.x <= rect.width && m.y >= 0 && m.y <= rect.height) {
                            const nx = m.x / Math.max(1, rect.width) - 0.5;
                            const ny = m.y / Math.max(1, rect.height) - 0.5;
                            targetSpin = Math.max(-0.94, Math.min(0.94, nx * 2.1));
                            targetTilt = Math.max(1.08, Math.min(1.48, 1.32 - ny * 0.36));
                        }
                    }

                    // Smooth relaxation of market spin and observer inclination
                    curSpin += (targetSpin - curSpin) * Math.min(1.0, dt * 3.5);
                    curTilt += (targetTilt - curTilt) * Math.min(1.0, dt * 3.5);

                    // Adaptive quality from frame-time moving average with hysteresis
                    const now = performance.now();
                    const frameDt = Math.max(1.0, now - lastFrameTime);
                    lastFrameTime = now;
                    avgFrameTime = avgFrameTime * 0.95 + frameDt * 0.05;

                    if (avgFrameTime > 24.0 && currentScale > 0.52) {
                        currentScale = Math.max(0.50, currentScale - 0.05);
                        maxSteps = Math.max(90, maxSteps - 15);
                    } else if (avgFrameTime < 13.5 && currentScale < (isMobile() ? 0.70 : 1.0)) {
                        currentScale = Math.min(isMobile() ? 0.70 : 1.0, currentScale + 0.04);
                        maxSteps = Math.min(isMobile() ? 120 : 185, maxSteps + 10);
                    }

                    // Update live telemetry HUD once every 120 ms
                    if (now - lastTelemetryTime > 120) {
                        lastTelemetryTime = now;
                        const telemetry = math.formatTelemetry(curSpin, 100.0, 0.22);
                        if (simTagEl) {
                            simTagEl.textContent = telemetry.tagString;
                        }
                        if (root.KW && root.KW.tag) {
                            root.KW.tag(telemetry.tagString, canvas);
                        }
                    }
                },

                render: (outCtx2d, outW, outH, t) => {
                    ensureTarget(outW, outH);
                    if (!sceneTarget) return;

                    const aCol = (root.KW && root.KW.col && root.KW.col.a) || [32, 201, 145];
                    const normAccent = [aCol[0] / 255.0, aCol[1] / 255.0, aCol[2] / 255.0];

                    const shockTime = shockStartTime > 0.0 ? Math.max(0.0, t - shockStartTime) : -1.0;

                    // 1. Ray-march Kerr–Financial Singularity into RGBA16F target
                    gl.bindFramebuffer(gl.FRAMEBUFFER, sceneTarget.fbo);
                    gl.viewport(0, 0, sceneTarget.w, sceneTarget.h);

                    prog.use()
                        .f2("uRes", sceneTarget.w, sceneTarget.h)
                        .f1("uTime", t)
                        .f1("uSpin", curSpin)
                        .f1("uTilt", curTilt)
                        .f1("uCamDist", 36.0)
                        .f1("uFovScale", 1.85)
                        .f1("uRout", 26.0)
                        .i1("uMaxSteps", maxSteps)
                        .f3("uAccent", normAccent[0], normAccent[1], normAccent[2])
                        .f1("uShockTime", shockTime);

                    gfx.quad(prog, sceneTarget);

                    // 2. Film tone-mapping and celestial bloom via GFX.compose
                    gfx.compose(sceneTarget, outCtx2d, outW, outH, {
                        bloomGain: isMobile() ? 0.38 : 0.50,
                        exposure: 1.16,
                        time: t,
                        accent: aCol
                    });
                },

                frame: (t, dt, ctx2d, outW, outH, isReduced) => {
                    instObj.step(dt, t);
                    instObj.render(ctx2d, outW, outH, t);
                },

                dispose: () => {
                    if (host) {
                        host.removeEventListener("click", triggerShock);
                    }
                    if (sceneTarget) {
                        sceneTarget.dispose();
                        sceneTarget = null;
                    }
                }
            };
            return instObj;
        }, fallbackGbm);
    };

    const fallbackGbm = (canvas, opts = {}) => {
        if (root.ENGINES && root.ENGINES.paths) {
            return root.ENGINES.paths(canvas, {
                model: "gbm",
                s0: 100,
                mu: 0.05,
                sigma: 0.22,
                dt: 0.004,
                nPaths: 70,
                steps: 220
            });
        }
        return null;
    };
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
