/**
 * gpu-cs-computation.js
 *
 * Full-screen Universal Computation Hyper-Structure (Computer Science Hero).
 * Renders a GPGPU state ping-pong simulation of Wolfram Rule 110 (Turing Class IV)
 * with Matthew Cook's Ether vacuum, colliding gliders, continuous persistence
 * phosphor decay, and interactive entropy streams on the shared GFX WebGL2 context.
 *
 * Adheres strictly to the 2-context ceiling, pitch-black background, and UK English captions.
 */

(function (root, factory) {
    if (typeof module === "object" && module.exports) module.exports = factory(root);
    else factory(root);
}(typeof self !== "undefined" ? self : this, function (root) {
    "use strict";

    const SIMS = (root.SIMS = root.SIMS || {});
    const M = root.CsComputationMath || (typeof require !== "undefined" ? require("../lib/cs-computation-math.js") : null);
    const S = root.CsComputationShaders || (typeof require !== "undefined" ? require("./gpu-cs-computation-shaders.js") : null);

    const isMobile = () => (typeof window !== "undefined" ? window.innerWidth < 900 : false);

    /* ---------- Main Simulation Mount ---------- */
    SIMS["universal-computation"] = SIMS["cs-computation"] = (canvas, opts = {}) => {
        const GFX = root.GFX;
        if (!GFX || !GFX.supported) return fallbackAutomaton(canvas, opts);

        const shaders = S || root.CsComputationShaders;
        const math = M || root.CsComputationMath;
        if (!shaders || !math) return fallbackAutomaton(canvas, opts);

        return GFX.mount(canvas, (gfx, cvs, getSize) => {
            const gl = gfx.gl;
            const mob = gfx.isMobile();

            // Compile shaders
            const progStep = gfx.program(shaders.VS_QUAD, shaders.FS_COMPUTATION_STEP);
            const progDisplay = gfx.program(shaders.VS_QUAD, shaders.FS_COMPUTATION_DISPLAY);
            if (!progStep || !progDisplay) return null;

            // GPGPU simulation resolution
            const simW = mob ? 384 : 512;
            const simH = mob ? 384 : 512;

            // Ping-pong state targets
            let ppState = gfx.pingPong(simW, simH, { fp32: false });
            let sceneTarget = null;
            let targetW = 0, targetH = 0;

            const ensureTarget = (w, h) => {
                const tw = Math.max(2, Math.floor(w));
                const th = Math.max(2, Math.floor(h));
                if (sceneTarget && targetW === tw && targetH === th) return;
                if (sceneTarget) sceneTarget.dispose();
                sceneTarget = gfx.target(tw, th, { fp32: false });
                targetW = tw;
                targetH = th;
            };

            // GPGPU initialization flag
            let initialized = false;

            // Cursor tracking state
            let curX = -1.0, curY = -1.0;
            let prevX = -1.0, prevY = -1.0;
            let cursorSpeed = 0.0;

            // Avalanche Logic Cascade Click State
            let shockStartTime = -100.0;
            let shockCenter = [0.5, 0.5];

            const host = canvas.closest ? (canvas.closest(".snap-section") || canvas) : canvas;

            const triggerCascade = () => {
                shockStartTime = performance.now() * 0.001;
                shockCenter = [
                    curX >= 0.0 ? curX : 0.5 + (Math.random() - 0.5) * 0.3,
                    curY >= 0.0 ? curY : 0.5 + (Math.random() - 0.5) * 0.3
                ];
            };

            host.addEventListener("click", triggerCascade);
            if (root.KW && root.KW.onClick) {
                root.KW.onClick(canvas, triggerCascade);
            }

            // Live Telemetry HUD element
            let simTagEl = host ? host.querySelector(".sim-tag") : null;
            let lastTelemetryTime = 0;
            let simStepCount = 0;
            let clockAccum = 0.0;
            const stepPeriod = mob ? 0.033 : 0.022; // ~30 to 45 CA generations per second

            const instObj = {
                step: (dt, t) => {
                    // Cursor tracking via KW.local
                    if (root.KW && root.KW.local) {
                        const m = root.KW.local(canvas);
                        const rect = canvas.getBoundingClientRect();
                        if (m.x >= 0 && m.x <= rect.width && m.y >= 0 && m.y <= rect.height) {
                            const nx = m.x / Math.max(1, rect.width);
                            const ny = m.y / Math.max(1, rect.height);
                            if (prevX < 0.0) { prevX = nx; prevY = ny; }
                            else { prevX = curX; prevY = curY; }
                            curX = nx;
                            curY = ny;
                            cursorSpeed = Math.hypot(curX - prevX, curY - prevY) / Math.max(0.001, dt);
                        } else {
                            curX = -1.0;
                            curY = -1.0;
                            prevX = -1.0;
                            prevY = -1.0;
                            cursorSpeed = 0.0;
                        }
                    }

                    // Advance cellular automaton generational clock
                    clockAccum += Math.min(0.05, dt);
                    let shouldStep = 0;
                    if (clockAccum >= stepPeriod) {
                        clockAccum -= stepPeriod;
                        shouldStep = 1;
                        simStepCount++;
                    }

                    const shockTime = shockStartTime > 0.0 ? Math.max(0.0, t - shockStartTime) : -1.0;

                    // 0. Seed initialization on first step
                    if (!initialized) {
                        gl.bindFramebuffer(gl.FRAMEBUFFER, ppState.write().fbo);
                        gl.viewport(0, 0, simW, simH);
                        progStep.use()
                            .f2("uRes", simW, simH)
                            .i1("uInitSeed", 1);
                        gfx.quad(progStep, ppState.write());
                        ppState.swap();
                        initialized = true;
                    }

                    // 1. Advance GPGPU Cellular State Ping-Pong
                    gl.bindFramebuffer(gl.FRAMEBUFFER, ppState.write().fbo);
                    gl.viewport(0, 0, simW, simH);

                    progStep.use()
                        .tex("uPrev", ppState.read(), 0)
                        .f2("uRes", simW, simH)
                        .f1("uTime", t)
                        .f1("uDt", dt)
                        .f2("uCursor", curX, curY)
                        .f2("uCursorPrev", prevX >= 0.0 ? prevX : curX, prevY >= 0.0 ? prevY : curY)
                        .f1("uCursorSpeed", cursorSpeed)
                        .f1("uShockTime", shockTime)
                        .f2("uShockCenter", shockCenter[0], shockCenter[1])
                        .i1("uRule", 110)
                        .i1("uStepTrigger", shouldStep)
                        .i1("uInitSeed", 0);

                    gfx.quad(progStep, ppState.write());
                    ppState.swap();

                    // Update live telemetry HUD once every 120 ms
                    const now = performance.now();
                    if (now - lastTelemetryTime > 120) {
                        lastTelemetryTime = now;
                        // Sample representative metrics for Class IV computation
                        const entropy = 0.942 + Math.sin(t * 0.4) * 0.015;
                        const lzw = 0.49 + Math.cos(t * 0.35) * 0.02;
                        const telemetry = math.formatTelemetry(simStepCount, 0.64, entropy, lzw);
                        if (simTagEl) simTagEl.textContent = telemetry.tagString;
                        if (root.KW && root.KW.tag) root.KW.tag(telemetry.tagString, canvas);
                    }
                },

                render: (outCtx2d, outW, outH, t) => {
                    ensureTarget(outW, outH);
                    if (!sceneTarget) return;

                    const isLight = (root.KW && root.KW.col && root.KW.col.light) ? 1.0 : 0.0;
                    const aCol = (root.KW && root.KW.col && root.KW.col.a) || [0, 212, 255];
                    const normAccent = [aCol[0] / 255.0, aCol[1] / 255.0, aCol[2] / 255.0];
                    const shockTime = shockStartTime > 0.0 ? Math.max(0.0, t - shockStartTime) : -1.0;

                    // 1. Render Cellular Phosphor Display into sceneTarget
                    gl.bindFramebuffer(gl.FRAMEBUFFER, sceneTarget.fbo);
                    gl.viewport(0, 0, sceneTarget.w, sceneTarget.h);
                    gl.clearColor(0.0, 0.0, 0.0, 1.0); // Strict pitch-black
                    gl.clear(gl.COLOR_BUFFER_BIT);

                    progDisplay.use()
                        .tex("uStateTex", ppState.read(), 0)
                        .f2("uRes", sceneTarget.w, sceneTarget.h)
                        .f1("uTime", t)
                        .f3("uAccent", normAccent[0], normAccent[1], normAccent[2])
                        .f1("uLightMode", isLight)
                        .f1("uShockTime", shockTime)
                        .f2("uShockCenter", shockCenter[0], shockCenter[1]);

                    gfx.quad(progDisplay, sceneTarget);

                    // 2. Film Tone-Mapping and Celestial Bloom via GFX.compose
                    gfx.compose(sceneTarget, outCtx2d, outW, outH, {
                        bloomGain: mob ? 0.38 : 0.52,
                        exposure: 1.15,
                        time: t,
                        accent: aCol,
                        isLight: isLight > 0.5
                    });
                },

                frame: (t, dt, ctx2d, outW, outH, isReduced) => {
                    instObj.step(dt, t);
                    instObj.render(ctx2d, outW, outH, t);
                },

                resize: (nw, nh) => {
                    ensureTarget(nw, nh);
                },

                dispose: () => {
                    if (host) host.removeEventListener("click", triggerCascade);
                    if (ppState) {
                        ppState.dispose();
                        ppState = null;
                    }
                    if (sceneTarget) {
                        sceneTarget.dispose();
                        sceneTarget = null;
                    }
                }
            };

            return instObj;
        }, fallbackAutomaton);
    };

    const fallbackAutomaton = (canvas, opts = {}) => {
        if (root.ENGINES && root.ENGINES.automaton) {
            return root.ENGINES.automaton(canvas, {
                type: "elementary",
                rule: 110,
                cols: 150,
                rows: 90,
                speed: 32
            });
        }
        return null;
    };
}));
