/* Particle Thread Stage Controller (shared/gpu/gpu-thread.js).
   Manages the persistent particle pool (N = 65,536 desktop, 16,384 mobile).
   Single 2-D viewport stage canvas blitting from shared GFX WebGL2 context.
   Scrub-exact transition, lazy formation creation/disposal, text legibility dimming,
   pointer soft radial displacement, native fade CSS variable injection, and adaptive scaling. */

(function (root, factory) {
    if (typeof module === "object" && module.exports) {
        module.exports = factory(root);
    } else {
        root.THREAD_STAGE = factory(root);
    }
}(typeof self !== "undefined" ? self : this, function (root) {
    "use strict";

    const TM = root.THREAD_MATH || (typeof require === "function" ? require("../lib/thread-math.js") : null);
    const TS = root.THREAD_SHADERS || (typeof require === "function" ? require("./gpu-thread-shaders.js") : null);
    const TF = root.THREAD_FORMATIONS || (typeof require === "function" ? require("./gpu-thread-formations.js") : null);

    const FORMATION_FACTORIES = [
        (n) => TF.createIntroFormation(n),
        (n) => TF.createMathsFormation(n),
        (n) => TF.createPhysicsFormation(n)
    ];

    const mat4Perspective = (fovRad, aspect, near, far) => {
        const f = 1.0 / Math.tan(fovRad / 2.0);
        const nf = 1.0 / (near - far);
        return new Float32Array([
            f / aspect, 0, 0, 0,
            0, f, 0, 0,
            0, 0, (far + near) * nf, -1,
            0, 0, 2.0 * far * near * nf, 0
        ]);
    };

    const mat4LookAt = (eye, center, up) => {
        let z0 = eye[0] - center[0], z1 = eye[1] - center[1], z2 = eye[2] - center[2];
        let len = 1.0 / Math.hypot(z0, z1, z2);
        z0 *= len; z1 *= len; z2 *= len;
        let x0 = up[1] * z2 - up[2] * z1, x1 = up[2] * z0 - up[0] * z2, x2 = up[0] * z1 - up[1] * z0;
        len = 1.0 / Math.hypot(x0, x1, x2);
        x0 *= len; x1 *= len; x2 *= len;
        let y0 = z1 * x2 - z2 * x1, y1 = z2 * x0 - z0 * x2, y2 = z0 * x1 - z1 * x0;
        return new Float32Array([
            x0, y0, z0, 0,
            x1, y1, z1, 0,
            x2, y2, z2, 0,
            -(x0 * eye[0] + x1 * eye[1] + x2 * eye[2]),
            -(y0 * eye[0] + y1 * eye[1] + y2 * eye[2]),
            -(z0 * eye[0] + z1 * eye[1] + z2 * eye[2]),
            1
        ]);
    };

    const mat4Mul = (a, b) => {
        const out = new Float32Array(16);
        for (let i = 0; i < 4; i++) {
            for (let j = 0; j < 4; j++) {
                out[j * 4 + i] = a[i] * b[j * 4] + a[i + 4] * b[j * 4 + 1] + a[i + 8] * b[j * 4 + 2] + a[i + 12] * b[j * 4 + 3];
            }
        }
        return out;
    };

    const StageController = () => {
        const GFX = root.GFX;
        if (!GFX || !GFX.supported) return null;
        const gl = GFX.gl;
        if (!gl) return null;

        const isMob = GFX.isMobile();
        const texW = isMob ? 128 : 256;
        const texH = isMob ? 128 : 256;
        const count = texW * texH;

        // Ensure 2-D stage canvas exists outside #main in <body>
        let stageCanvas = document.getElementById("stage-canvas");
        if (!stageCanvas && typeof document !== "undefined") {
            stageCanvas = document.createElement("canvas");
            stageCanvas.id = "stage-canvas";
            stageCanvas.className = "stage-canvas";
            stageCanvas.setAttribute("aria-hidden", "true");
            stageCanvas.style.cssText = "position:fixed;inset:0;width:100vw;height:100vh;pointer-events:none;z-index:0;display:block;";
            document.body.prepend(stageCanvas);
        }
        const ctx2d = stageCanvas ? stageCanvas.getContext("2d") : null;

        // Shader programs
        const morphProg = GFX.program(TS.VS_QUAD, TS.FS_MORPH);
        const renderProg = GFX.program(TS.VS_RENDER, TS.FS_RENDER);
        const flowProg = GFX.program(TS.VS_QUAD, TS.FS_FLOW_STEP);

        // Persistent morph position target
        const morphTarget = GFX.target(texW, texH, { fp32: true, nearest: true });

        // Lazy formation cache: Map of index -> GPU formation
        const cache = new Map();

        const loadFormation = (idx) => {
            if (cache.has(idx)) return cache.get(idx);
            if (idx < 0 || idx >= FORMATION_FACTORIES.length) return null;
            const data = FORMATION_FACTORIES[idx](count);

            const posTex = GFX.target(texW, texH, { fp32: true, nearest: true, data: data.posData });
            const colTex = GFX.target(texW, texH, { fp32: false, nearest: true, data: data.colData });
            let pingPong = null;
            if (data.type === "flow") {
                pingPong = GFX.pingPong(texW, texH, { fp32: true, nearest: true, data: data.posData });
            }

            const item = { ...data, posTex, colTex, pingPong };
            cache.set(idx, item);
            return item;
        };

        const disposeFormation = (idx) => {
            if (!cache.has(idx)) return;
            const item = cache.get(idx);
            if (item.posTex) item.posTex.dispose();
            if (item.colTex) item.colTex.dispose();
            if (item.pingPong) item.pingPong.dispose();
            cache.delete(idx);
        };

        // Screen size & adaptive resolution scaling
        let W = 1440, H = 900, dpr = 1.0, scale = isMob ? 0.65 : 0.85;
        let rw = 1200, rh = 750, ema = 16.0, fc = 0, lastTime = performance.now();
        let running = true, rAF = null;

        const updateResolution = () => {
            if (!stageCanvas) return;
            W = window.innerWidth || 1440;
            H = window.innerHeight || 900;
            dpr = Math.min(window.devicePixelRatio || 1.0, 1.5);
            stageCanvas.width = Math.round(W * dpr);
            stageCanvas.height = Math.round(H * dpr);
            rw = Math.max(64, Math.round(W * dpr * scale));
            rh = Math.max(64, Math.round(H * dpr * scale));
        };
        updateResolution();
        window.addEventListener("resize", updateResolution, { passive: true });

        // Cursor tracking in normalized screen coordinates [-1, 1]
        let mouseX = -10.0, mouseY = -10.0, mouseActive = 0.0;
        window.addEventListener("pointermove", (e) => {
            mouseX = (e.clientX / Math.max(W, 1)) * 2.0 - 1.0;
            mouseY = 1.0 - (e.clientY / Math.max(H, 1)) * 2.0;
            mouseActive = 1.0;
        }, { passive: true });
        document.addEventListener("mouseleave", () => { mouseActive = 0.0; });

        // Continuous section coordinate s
        const getContinuousS = () => {
            const vh = window.innerHeight || 800;
            return Math.max(0.0, window.scrollY / vh);
        };

        // Text rectangle for active section
        const getTextRect = (secIdx) => {
            const sections = document.querySelectorAll(".snap-section");
            const sec = sections[secIdx] || sections[0];
            if (!sec) return [-0.9, -0.9, -0.1, 0.9];
            const inner = sec.querySelector(".snap-inner");
            if (!inner) return [-0.9, -0.9, -0.1, 0.9];
            const r = inner.getBoundingClientRect();
            return [
                (r.left / W) * 2.0 - 1.0,
                1.0 - (r.bottom / H) * 2.0,
                (r.right / W) * 2.0 - 1.0,
                1.0 - (r.top / H) * 2.0
            ];
        };

        // Settle & native visual fade injection via CSS variable
        const updateNativeOpacities = (s) => {
            const sections = document.querySelectorAll(".snap-section");
            sections.forEach((sec, idx) => {
                const sigma = TM.settle(s, idx);
                sec.style.setProperty("--native-opacity", sigma > 0.001 ? sigma.toFixed(3) : "0");
            });
        };

        // Step flow simulation for active formation
        const stepFlowFormation = (form, dt) => {
            if (!form || form.type !== "flow" || !form.pingPong) return;
            flowProg.use()
                .tex("uState", form.pingPong.read(), 0)
                .f1("uDt", dt)
                .i1("uFlowType", form.flowType)
                .f1("uTime", performance.now() * 0.001);
            GFX.quad(flowProg, form.pingPong.write(), texW, texH);
            form.pingPong.swap();
        };

        // Main animation frame
        const renderFrame = (now) => {
            if (!running) return;
            rAF = requestAnimationFrame(renderFrame);
            if (document.hidden) return;

            const dtMs = Math.min(100, Math.max(1, now - lastTime));
            lastTime = now;
            const t = now * 0.001;
            const dt = Math.min(0.033, dtMs * 0.001);

            // Adaptive scale moving average and hysteresis
            ema += (dtMs - ema) * 0.08;
            if (++fc % 45 === 0 && !root.KW?.REDUCED) {
                if (ema > 22.0 && scale > (isMob ? 0.5 : 0.55)) {
                    scale = Math.max(isMob ? 0.5 : 0.55, scale * 0.88);
                    updateResolution();
                } else if (ema < 10.0 && scale < (isMob ? 0.85 : 1.0)) {
                    scale = Math.min(isMob ? 0.85 : 1.0, scale * 1.05);
                    updateResolution();
                }
            }

            const s = getContinuousS();
            updateNativeOpacities(s);

            const maxSec = FORMATION_FACTORIES.length - 1;
            const clampedS = Math.min(maxSec, Math.max(0.0, s));
            const secA = Math.min(maxSec, Math.floor(clampedS));
            const secB = Math.min(maxSec, secA + 1);
            const frac = clampedS - secA;
            const w = secA === secB ? 0.0 : TM.smoothstep(0.15, 0.85, frac);

            // Lazy creation of formations within 1 section of current s
            const formA = loadFormation(secA);
            const formB = loadFormation(secB);

            // Step flow formations
            if (!root.KW?.REDUCED) {
                stepFlowFormation(formA, dt);
                if (secB !== secA) stepFlowFormation(formB, dt);
            }

            // Dispose formations >= 2 sections away
            for (const key of Array.from(cache.keys())) {
                if (Math.abs(key - s) >= 2.0) disposeFormation(key);
            }

            const texPosA = formA.pingPong ? formA.pingPong.read() : formA.posTex;
            const texPosB = formB.pingPong ? formB.pingPong.read() : formB.posTex;

            // 1. Morph Compute Pass (evaluates x_i = mix + swirl * curlNoise into morphTarget)
            morphProg.use()
                .tex("uPosA", texPosA, 0)
                .tex("uPosB", texPosB, 1)
                .f1("uBlend", root.KW?.REDUCED ? 0.0 : w)
                .f1("uTime", t)
                .f1("uSwirl", 0.28)
                .i1("uTexW", texW);
            GFX.quad(morphProg, morphTarget, texW, texH);

            // 2. Camera pose interpolation
            const camA = formA.camera, camB = formB.camera;
            const ew = TM.ease(w);
            const eye = [
                camA.eye[0] + (camB.eye[0] - camA.eye[0]) * ew,
                camA.eye[1] + (camB.eye[1] - camA.eye[1]) * ew,
                camA.eye[2] + (camB.eye[2] - camA.eye[2]) * ew
            ];
            const target = [0.0, 0.0, 0.0];
            const up = [0.0, 1.0, 0.0];
            const aspect = W / Math.max(H, 1);
            const fov = ((camA.fov + (camB.fov - camA.fov) * ew) * Math.PI) / 180.0;
            const projMat = mat4Perspective(fov, aspect, 0.1, 100.0);
            const viewMat = mat4LookAt(eye, target, up);
            const vpMat = mat4Mul(projMat, viewMat);

            // 3. Native settle dimming & text bounds
            const activeSecIdx = Math.round(clampedS);
            const activeForm = activeSecIdx === secB ? formB : formA;
            const sigmaActive = TM.settle(s, activeSecIdx);
            const nativeFade = activeForm.native === null ? 1.0 : (1.0 - 0.75 * sigmaActive);
            const textRect = getTextRect(activeSecIdx);

            // 4. Render particles to offscreen canvas
            const glCanvas = GFX.gl.canvas;
            if (glCanvas.width !== rw || glCanvas.height !== rh) {
                glCanvas.width = rw; glCanvas.height = rh;
            }
            gl.bindFramebuffer(gl.FRAMEBUFFER, null);
            gl.viewport(0, 0, rw, rh);
            gl.clearColor(0.0, 0.0, 0.0, 0.0);
            gl.clear(gl.COLOR_BUFFER_BIT);

            gl.enable(gl.BLEND);
            gl.blendFunc(gl.ONE, gl.ONE); // HDR additive luminous accumulation

            renderProg.use()
                .tex("uMorphPos", morphTarget, 0)
                .tex("uColA", formA.colTex, 1)
                .tex("uColB", formB.colTex, 2)
                .mat4("uViewProj", vpMat)
                .f2("uMouse", mouseX, mouseY)
                .f1("uMouseActive", mouseActive)
                .i1("uTexW", texW)
                .f4("uTextRect", textRect[0], textRect[1], textRect[2], textRect[3])
                .f1("uNativeFade", nativeFade);

            GFX.drawPoints(renderProg, null, count);
            gl.disable(gl.BLEND);

            // 5. Blit from WebGL2 canvas to 2-D stage canvas
            if (ctx2d) {
                ctx2d.clearRect(0, 0, stageCanvas.width, stageCanvas.height);
                ctx2d.drawImage(glCanvas, 0, 0, stageCanvas.width, stageCanvas.height);
            }
        };

        rAF = requestAnimationFrame(renderFrame);

        const dispose = () => {
            running = false;
            if (rAF) cancelAnimationFrame(rAF);
            window.removeEventListener("resize", updateResolution);
            for (const key of Array.from(cache.keys())) disposeFormation(key);
            if (morphTarget) morphTarget.dispose();
            if (stageCanvas && stageCanvas.parentNode) stageCanvas.parentNode.removeChild(stageCanvas);
        };

        return {
            get morphTarget() { return morphTarget; },
            get gl() { return gl; },
            get count() { return count; },
            get texW() { return texW; },
            get cache() { return cache; },
            loadFormation,
            getContinuousS,
            updateResolution,
            renderFrame,
            dispose
        };
    };

    const initStage = () => {
        if (root.__stageController) return root.__stageController;
        const ctrl = StageController();
        root.__stageController = ctrl;
        return ctrl;
    };

    if (typeof window !== "undefined") {
        if (document.readyState === "loading") {
            document.addEventListener("DOMContentLoaded", initStage, { once: true });
        } else {
            initStage();
        }
    }

    return {
        StageController,
        initStage
    };
}));
