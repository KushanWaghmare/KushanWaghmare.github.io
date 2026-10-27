/* Unified Single-Buffer Particle Engine, HDR Post Pipeline & 3D Transition Stage Controller
   (shared/gpu/gpu-thread.js).
   Mounts ONE fixed full-viewport WebGL2 canvas (#stage-canvas) with ONE THREE.Points and
   ONE shared particle buffer (N = 90k desktop, 30k mobile). Particle i keeps its identity
   for the entire session and is never respawned or reallocated. */

(function (root, factory) {
    if (typeof module === "object" && module.exports) module.exports = factory(root);
    else root.THREAD_STAGE = factory(root);
}(typeof self !== "undefined" ? self : this, function (root) {
    "use strict";

    const TM = root.THREAD_MATH || (typeof require === "function" ? require("../lib/thread-math.js") : null);
    const TS = root.THREAD_SHADERS || (typeof require === "function" ? require("./gpu-thread-shaders.js") : null);
    const TF = root.THREAD_FORMATIONS || (typeof require === "function" ? require("./gpu-thread-formations.js") : null);

    if (typeof window === "undefined" || typeof document === "undefined") {
        return { supported: false };
    }

    const {
        THREE,
        Vector3,
        PerspectiveCamera,
        BufferAttribute,
        BufferGeometry,
        Points,
        Scene,
        clamp,
        smoothstep,
        smootherstep,
        mulberry32,
        evalBezier3D,
        evalBezierTangent3D,
        computeArcControls,
        evalWaypointSpline,
        computeSpatialMatching
    } = TM;

    const isMobileDevice = () =>
        window.innerWidth <= 768 || /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent || "");

    const isReducedMotion = () =>
        window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const INITIAL_N = isMobileDevice() ? 30000 : 90000;
    const MIN_ADAPTIVE_N = isMobileDevice() ? 15000 : 36000;

    let bufferReallocations = 0;

    /* ---------- Single Shared Particle Buffer (Allocated ONCE, Never Reallocated) ---------- */
    const positions = new Float32Array(INITIAL_N * 3);
    const prevPositions = new Float32Array(INITIAL_N * 3);
    const colours = new Float32Array(INITIAL_N * 3);
    const sizes = new Float32Array(INITIAL_N);
    const seeds = new Float32Array(INITIAL_N * 4);

    // Pre-allocated scratch buffers for zero-allocation transition & handoff blending
    const fromPositions = new Float32Array(INITIAL_N * 3);
    const fromColours = new Float32Array(INITIAL_N * 3);
    const fromSizes = new Float32Array(INITIAL_N);

    const nextPositions = new Float32Array(INITIAL_N * 3);
    const nextColours = new Float32Array(INITIAL_N * 3);
    const nextSizes = new Float32Array(INITIAL_N);

    const rawTargetPositions = new Float32Array(INITIAL_N * 3);
    const matchedTargetPositions = new Float32Array(INITIAL_N * 3);
    const particleRanks = new Float32Array(INITIAL_N);
    const mortonPerm = new Int32Array(INITIAL_N);

    const scratchSrcCodes = new Uint32Array(INITIAL_N);
    const scratchDstCodes = new Uint32Array(INITIAL_N);
    const scratchSrcOrder = new Int32Array(INITIAL_N);
    const scratchDstOrder = new Int32Array(INITIAL_N);
    const rankDistScratch = new Float32Array(INITIAL_N);

    // Deterministic per-particle identity seeds (Particle i keeps its identity forever)
    const rand = mulberry32(0x4B573236);
    for (let i = 0; i < INITIAL_N; i++) {
        const i4 = i * 4;
        seeds[i4] = rand();
        seeds[i4 + 1] = rand();
        seeds[i4 + 2] = rand();
        seeds[i4 + 3] = rand();
        sizes[i] = 1.5 + 0.8 * seeds[i4 + 3];
        mortonPerm[i] = i;
    }

    const sharedBuffer = {
        maxCount: INITIAL_N,
        count: INITIAL_N,
        positions,
        prevPositions,
        colours,
        sizes,
        seeds,
        get reallocations() { return bufferReallocations; }
    };

    const fromScratchBuffer = {
        maxCount: INITIAL_N,
        get count() { return sharedBuffer.count; },
        positions: fromPositions,
        colours: fromColours,
        sizes: fromSizes,
        seeds
    };

    const nextScratchBuffer = {
        maxCount: INITIAL_N,
        get count() { return sharedBuffer.count; },
        positions: nextPositions,
        colours: nextColours,
        sizes: nextSizes,
        seeds
    };

    /* ---------- THREE Scene & Points Setup ---------- */
    const scene = new Scene();
    const camera = new PerspectiveCamera(52, window.innerWidth / Math.max(1, window.innerHeight), 0.1, 600);
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new BufferAttribute(positions, 3, true));
    geometry.setAttribute("colour", new BufferAttribute(colours, 3, true));
    geometry.setAttribute("size", new BufferAttribute(sizes, 1, true));
    geometry.setAttribute("seed", new BufferAttribute(seeds, 4, false));
    geometry.setAttribute("prevPosition", new BufferAttribute(prevPositions, 3, true));
    geometry.setDrawRange(0, INITIAL_N);

    const points = new Points(geometry, { type: "SharedParticleMaterial", blending: "AdditiveBlending" });
    scene.add(points);

    /* ---------- Single WebGL2 Stage Canvas Setup ---------- */
    let stageCanvas = document.getElementById("stage-canvas");
    if (!stageCanvas) {
        stageCanvas = document.createElement("canvas");
        stageCanvas.id = "stage-canvas";
        stageCanvas.className = "stage-canvas";
        stageCanvas.setAttribute("aria-hidden", "true");
        document.body.prepend(stageCanvas);
    }

    const gl = stageCanvas.getContext("webgl2", {
        alpha: true,
        depth: false,
        stencil: false,
        antialias: false,
        premultipliedAlpha: true,
        preserveDrawingBuffer: false,
        powerPreference: "high-performance"
    });

    if (!gl) {
        console.warn("[THREAD_STAGE] WebGL2 not available on #stage-canvas.");
        return { supported: false };
    }

    let dpr = 1;
    let width = 1, height = 1;

    const resizeStage = () => {
        const maxDpr = isMobileDevice() ? 1.5 : 2.0;
        dpr = Math.min(window.devicePixelRatio || 1, maxDpr);
        width = Math.max(1, window.innerWidth);
        height = Math.max(1, window.innerHeight);
        const pw = Math.round(width * dpr);
        const ph = Math.round(height * dpr);
        if (stageCanvas.width !== pw || stageCanvas.height !== ph) {
            stageCanvas.width = pw;
            stageCanvas.height = ph;
        }
        camera.aspect = width / height;
    };
    resizeStage();
    window.addEventListener("resize", resizeStage, { passive: true });

    /* ---------- Shader Compilation, VAO/VBOs & HDR Render Targets ---------- */
    const compileShader = (type, src) => {
        const s = gl.createShader(type);
        gl.shaderSource(s, src);
        gl.compileShader(s);
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
            console.error("[THREAD_STAGE] Shader compile error:", gl.getShaderInfoLog(s));
            gl.deleteShader(s);
            return null;
        }
        return s;
    };

    const createProgram = (vsSrc, fsSrc) => {
        const vs = compileShader(gl.VERTEX_SHADER, vsSrc);
        const fs = compileShader(gl.FRAGMENT_SHADER, fsSrc);
        if (!vs || !fs) return null;
        const p = gl.createProgram();
        gl.attachShader(p, vs);
        gl.attachShader(p, fs);
        gl.linkProgram(p);
        gl.deleteShader(vs);
        gl.deleteShader(fs);
        if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
            console.error("[THREAD_STAGE] Program link error:", gl.getProgramInfoLog(p));
            gl.deleteProgram(p);
            return null;
        }
        return p;
    };

    let pointProg = null, starProg = null, auxProg = null, kerrProg = null;
    let trailDecayProg = null, blitAddProg = null, brightPassProg = null, blurProg = null, compositeProg = null;
    let pointUniforms = {}, starUniforms = {}, auxUniforms = {}, kerrUniforms = {};
    let trailDecayUniforms = {}, blitAddUniforms = {}, brightPassUniforms = {}, blurUniforms = {}, compositeUniforms = {};

    let sharedVAO = null, auxVAO = null, quadVAO = null;
    let posVBO = null, prevPosVBO = null, colVBO = null, sizeVBO = null, seedVBO = null;
    let auxPosVBO = null, auxColVBO = null, quadVBO = null;

    let hdrSupported = false;
    let rtWidth = 0, rtHeight = 0;
    let trailRT = [null, null];
    let trailReadIdx = 0;
    let trailNeedsReset = true;
    let sceneRT = null, kerrRT = null, bloomBrightRT = null, bloomPingRT = null, bloomPongRT = null;
    let postQuality = 2; // 2 = dual-pass wide bloom, 1 = single-pass bloom under load
    let contextLost = false;

    const deleteRenderTarget = (rt) => {
        if (!rt) return;
        if (rt.fbo) gl.deleteFramebuffer(rt.fbo);
        if (rt.tex) gl.deleteTexture(rt.tex);
    };

    const createRenderTarget = (w, h, useHalfFloat) => {
        const tex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

        const fbo = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);

        let complete = false;
        if (useHalfFloat) {
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
            gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
            complete = (gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE);
        }
        if (!complete) {
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
            gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
        }

        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.bindTexture(gl.TEXTURE_2D, null);
        return { fbo, tex, width: w, height: h };
    };

    const ensurePostTargets = (pw, ph) => {
        if (rtWidth === pw && rtHeight === ph && sceneRT && trailRT[0]) return;
        deleteRenderTarget(trailRT[0]);
        deleteRenderTarget(trailRT[1]);
        deleteRenderTarget(sceneRT);
        deleteRenderTarget(kerrRT);
        deleteRenderTarget(bloomBrightRT);
        deleteRenderTarget(bloomPingRT);
        deleteRenderTarget(bloomPongRT);

        rtWidth = pw;
        rtHeight = ph;
        const hw = Math.max(1, pw >> 1), hh = Math.max(1, ph >> 1);
        const qw = Math.max(1, pw >> 2), qh = Math.max(1, ph >> 2);

        // Optimal ray tracer resolution: 1.0x CSS resolution on desktop, 0.85x on mobile
        const isMob = isMobileDevice();
        const kerrScale = isMob ? 0.85 : Math.min(1.0, dpr);
        const kw = Math.max(1, Math.round(width * kerrScale));
        const kh = Math.max(1, Math.round(height * kerrScale));

        trailRT[0] = createRenderTarget(pw, ph, hdrSupported);
        trailRT[1] = createRenderTarget(pw, ph, hdrSupported);
        sceneRT = createRenderTarget(pw, ph, hdrSupported);
        kerrRT = createRenderTarget(kw, kh, hdrSupported);
        bloomBrightRT = createRenderTarget(hw, hh, hdrSupported);
        bloomPingRT = createRenderTarget(qw, qh, hdrSupported);
        bloomPongRT = createRenderTarget(qw, qh, hdrSupported);
        trailNeedsReset = true;
    };

    const getUniforms = (prog, names) => {
        const out = {};
        if (!prog) return out;
        for (let i = 0; i < names.length; i++) {
            out[names[i]] = gl.getUniformLocation(prog, names[i]);
        }
        return out;
    };

    const initGLResources = () => {
        hdrSupported = !!gl.getExtension("EXT_color_buffer_float");
        gl.getExtension("OES_texture_float_linear");

        pointProg = createProgram(TS.VS_SHARED_POINTS, TS.FS_SHARED_POINTS);
        starProg = createProgram(TS.VS_STARFIELD, TS.FS_STARFIELD);
        auxProg = createProgram(TS.VS_AUX_SCENE, TS.FS_AUX_SCENE);
        kerrProg = createProgram(TS.VS_KERR_SCENE, TS.FS_KERR_SCENE);
        trailDecayProg = createProgram(TS.VS_POST_QUAD, TS.FS_TRAIL_DECAY);
        blitAddProg = createProgram(TS.VS_POST_QUAD, TS.FS_BLIT_ADD);
        brightPassProg = createProgram(TS.VS_POST_QUAD, TS.FS_BRIGHT_PASS);
        blurProg = createProgram(TS.VS_POST_QUAD, TS.FS_BLUR_9TAP);
        compositeProg = createProgram(TS.VS_POST_QUAD, TS.FS_POST_COMPOSITE);

        if (!pointProg || !compositeProg) return false;

        pointUniforms = getUniforms(pointProg, [
            "uViewProj", "uCamPos", "uViewport", "uDpr", "uTime",
            "uHeroBoost", "uIsLight", "uStreakScale", "uMaxStreakPx", "uTrailGain", "uFogTint"
        ]);
        starUniforms = getUniforms(starProg, [
            "uRes", "uBhScreenCentre", "uBhScale", "uTilt", "uTime", "uIsLight"
        ]);
        auxUniforms = getUniforms(auxProg, ["uViewProj", "uAuxOpacity", "uIsLight"]);
        kerrUniforms = getUniforms(kerrProg, [
            "uRes", "uBhScreenCentre", "uBhScale", "uSpin", "uTilt", "uTime", "uAuxOpacity", "uIsLight", "uDebugMode"
        ]);
        trailDecayUniforms = getUniforms(trailDecayProg, ["uPrevTex", "uDecay"]);
        blitAddUniforms = getUniforms(blitAddProg, ["uTex"]);
        brightPassUniforms = getUniforms(brightPassProg, ["uSceneTex", "uThreshold"]);
        blurUniforms = getUniforms(blurProg, ["uTex", "uTexelStep"]);
        compositeUniforms = getUniforms(compositeProg, [
            "uSceneTex", "uBloomTex", "uRes", "uTime", "uBloomStrength",
            "uVignette", "uGrain", "uCaStrength", "uWarpStrength", "uWarpCentre", "uFogTint", "uIsLight", "uDebugMode"
        ]);

        // 1. Single Shared Swarm VAO
        sharedVAO = gl.createVertexArray();
        gl.bindVertexArray(sharedVAO);

        posVBO = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, posVBO);
        gl.bufferData(gl.ARRAY_BUFFER, positions.byteLength, gl.DYNAMIC_DRAW);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, positions);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);

        colVBO = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, colVBO);
        gl.bufferData(gl.ARRAY_BUFFER, colours.byteLength, gl.DYNAMIC_DRAW);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, colours);
        gl.enableVertexAttribArray(1);
        gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);

        sizeVBO = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, sizeVBO);
        gl.bufferData(gl.ARRAY_BUFFER, sizes.byteLength, gl.DYNAMIC_DRAW);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, sizes);
        gl.enableVertexAttribArray(2);
        gl.vertexAttribPointer(2, 1, gl.FLOAT, false, 0, 0);

        seedVBO = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, seedVBO);
        gl.bufferData(gl.ARRAY_BUFFER, seeds, gl.STATIC_DRAW);
        gl.enableVertexAttribArray(3);
        gl.vertexAttribPointer(3, 4, gl.FLOAT, false, 0, 0);

        prevPosVBO = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, prevPosVBO);
        gl.bufferData(gl.ARRAY_BUFFER, prevPositions.byteLength, gl.DYNAMIC_DRAW);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, prevPositions);
        gl.enableVertexAttribArray(4);
        gl.vertexAttribPointer(4, 3, gl.FLOAT, false, 0, 0);

        gl.bindVertexArray(null);

        // 2. Auxiliary same-scene geometry VAO
        auxVAO = gl.createVertexArray();
        gl.bindVertexArray(auxVAO);
        auxPosVBO = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, auxPosVBO);
        gl.bufferData(gl.ARRAY_BUFFER, 8192 * 3 * 4, gl.DYNAMIC_DRAW);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);

        auxColVBO = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, auxColVBO);
        gl.bufferData(gl.ARRAY_BUFFER, 8192 * 4 * 4, gl.DYNAMIC_DRAW);
        gl.enableVertexAttribArray(1);
        gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 0, 0);
        gl.bindVertexArray(null);

        // 4. Fullscreen quad VAO for post passes & Kerr lensing
        quadVAO = gl.createVertexArray();
        gl.bindVertexArray(quadVAO);
        quadVBO = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, quadVBO);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
        gl.bindVertexArray(null);

        rtWidth = 0;
        rtHeight = 0;
        ensurePostTargets(stageCanvas.width, stageCanvas.height);

        return true;
    };

    initGLResources();

    stageCanvas.addEventListener("webglcontextlost", (e) => {
        e.preventDefault();
        contextLost = true;
    });
    stageCanvas.addEventListener("webglcontextrestored", () => {
        contextLost = false;
        initGLResources();
    });

    /* ---------- Pointer, Keyboard & Interaction Context ---------- */
    const ctxState = {
        pointerX: 0,
        pointerY: 0,
        targetPointerX: 0,
        targetPointerY: 0,
        isMobile: isMobileDevice(),
        isLight: false
    };

    window.addEventListener("pointermove", (e) => {
        ctxState.targetPointerX = ((e.clientX / Math.max(1, width)) - 0.5) * 2.0;
        ctxState.targetPointerY = ((e.clientY / Math.max(1, height)) - 0.5) * 2.0;
    }, { passive: true });

    window.addEventListener("click", (e) => {
        if (e.target && e.target.closest && e.target.closest("a, button, input, .nav, .snap-pager, .card, .pill, .stage-debug-hud")) return;
        const activeForm = formations[currentIndex];
        if (activeForm && typeof activeForm.onClick === "function") {
            activeForm.onClick(e, ctxState);
        }
    });

    window.addEventListener("keydown", (e) => {
        if (e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
        const activeForm = formations[currentIndex];
        if (activeForm && typeof activeForm.onKeyDown === "function") {
            activeForm.onKeyDown(e, ctxState);
        }
    });

    /* ---------- Section & Formation State ---------- */
    let sections = [];
    let formations = [];
    let currentIndex = 0;

    /* ---------- Transition State ---------- */
    const trans = {
        active: false,
        phase: "IDLE",
        u: 0.0,
        duration: 2.4,
        fromIndex: 0,
        toIndex: 0,
        interrupted: false,
        queuedIndex: -1,
        heroStart: new Vector3(),
        heroEnd: new Vector3(),
        arc: null,
        waypoints: null,
        camStartPos: new Vector3(),
        camStartTarget: new Vector3(),
        camEndPos: new Vector3(),
        camEndTarget: new Vector3(),
        domScrolledToTarget: false,
        auxOpacity: 1.0,
        warpStrength: 0.0
    };

    // Smoothed per-section post parameters
    const postState = {
        bloomStrength: 0.92,
        bloomThreshold: 0.78,
        trailDecay: 0.82,
        streakScale: 1.65,
        fogTint: [0.022, 0.056, 0.145]
    };

    const getPhaseName = (u) => {
        if (!trans.active) return "IDLE";
        if (u < 0.15) return "DETACH";
        if (u < 0.35) return "COLLAPSE";
        if (u < 0.72) return "FLIGHT";
        if (u < 0.86) return "NUCLEATE";
        return "HANDOFF";
    };

    const applyDomSectionVisibility = (fromIdx, toIdx, u, isActive) => {
        for (let i = 0; i < sections.length; i++) {
            const sec = sections[i];
            if (!sec) continue;
            const inner = sec.querySelector(".snap-inner");
            const tag = sec.querySelector(".sim-tag");
            const cue = sec.querySelector(".snap-cue");

            let alpha = 0.0;
            let shiftY = 0.0;

            if (!isActive) {
                alpha = (i === currentIndex) ? 1.0 : 0.0;
                shiftY = 0.0;
            } else if (i === fromIdx) {
                const fadeOut = 1.0 - smoothstep(0.02, 0.32, u);
                alpha = fadeOut;
                shiftY = (1.0 - fadeOut) * (toIdx > fromIdx ? -28.0 : 28.0);
            } else if (i === toIdx) {
                const fadeIn = smoothstep(0.70, 0.98, u);
                alpha = fadeIn;
                shiftY = (1.0 - fadeIn) * (toIdx > fromIdx ? 28.0 : -28.0);
            }

            const opStr = alpha.toFixed(3);
            const trStr = Math.abs(shiftY) > 0.05 ? `translate3d(0, ${shiftY.toFixed(1)}px, 0)` : "none";
            if (inner) {
                inner.style.opacity = opStr;
                inner.style.transform = trStr;
                inner.style.pointerEvents = alpha > 0.5 ? "auto" : "none";
            }
            if (tag) tag.style.opacity = opStr;
            if (cue) {
                cue.style.opacity = (alpha * 0.75).toFixed(3);
                cue.style.pointerEvents = alpha > 0.5 ? "auto" : "none";
            }
        }
    };

    const updateThemeAndDots = (idx) => {
        const sec = sections[idx];
        if (!sec) return;
        const d = sec.dataset.domain;
        if (d && document.documentElement.dataset.domain !== d) {
            document.documentElement.dataset.domain = d;
            if (root.KW && root.KW.refresh) root.KW.refresh();
            window.dispatchEvent(new Event("themechange"));
        }
        const id = sec.id;
        document.querySelectorAll(".snap-dot").forEach((dot) => {
            dot.classList.toggle("active", dot.getAttribute("href") === "#" + id);
        });
        sec.querySelectorAll("[data-reveal], [data-hero]").forEach((el) => el.classList.add("revealed"));
    };

    const computeParticleRanks = (srcPos, count, heroStart) => {
        const N = count | 0;
        const hx = heroStart.x, hy = heroStart.y, hz = heroStart.z;
        let maxD = 1e-5;
        for (let i = 0; i < N; i++) {
            const i3 = i * 3;
            const d = Math.hypot(srcPos[i3] - hx, srcPos[i3 + 1] - hy, srcPos[i3 + 2] - hz);
            rankDistScratch[i] = d;
            if (d > maxD) maxD = d;
        }
        const invMax = 1.0 / maxD;
        particleRanks[0] = 0.0;
        for (let i = 1; i < N; i++) {
            const dNorm = rankDistScratch[i] * invMax;
            particleRanks[i] = clamp(0.82 * dNorm + 0.18 * seeds[i * 4 + 2], 0.0, 1.0);
        }
    };

    const startTransition = (targetIdx) => {
        const maxIdx = Math.max(0, formations.length - 1);
        const clampedTarget = clamp(targetIdx | 0, 0, maxIdx);

        if (!trans.active && clampedTarget === currentIndex) return;
        if (trans.active && clampedTarget === trans.toIndex) return;

        const N = sharedBuffer.count;
        const wasMidFlight = trans.active;

        fromPositions.set(positions);
        fromColours.set(colours);
        fromSizes.set(sizes);

        trans.heroStart.set(positions[0], positions[1], positions[2]);

        const fromIdx = wasMidFlight ? trans.toIndex : currentIndex;
        const toForm = formations[clampedTarget];
        if (!toForm.initialized) {
            toForm.init(nextScratchBuffer, ctxState);
        }

        toForm.update(0.016, simTime, nextScratchBuffer, ctxState);
        rawTargetPositions.set(nextPositions);

        computeSpatialMatching(
            fromPositions,
            rawTargetPositions,
            N,
            matchedTargetPositions,
            mortonPerm,
            scratchSrcCodes,
            scratchDstCodes,
            scratchSrcOrder,
            scratchDstOrder
        );

        if (typeof toForm.applyPermutation === "function") {
            toForm.applyPermutation(mortonPerm, N);
            toForm.update(0.001, simTime, nextScratchBuffer, ctxState);
        }

        trans.heroEnd.set(nextPositions[0], nextPositions[1], nextPositions[2]);
        computeParticleRanks(fromPositions, N, trans.heroStart);

        const jumpSpan = Math.abs(clampedTarget - (wasMidFlight ? currentIndex : fromIdx));
        if (jumpSpan > 1 && !wasMidFlight) {
            const wps = [trans.heroStart.clone()];
            const step = clampedTarget > fromIdx ? 1 : -1;
            for (let k = fromIdx + step; k !== clampedTarget; k += step) {
                if (formations[k]) wps.push(formations[k].origin.clone());
            }
            wps.push(trans.heroEnd.clone());
            trans.waypoints = wps;
            trans.arc = computeArcControls(trans.heroStart, trans.heroEnd, Math.min(fromIdx, clampedTarget));
        } else {
            trans.waypoints = null;
            trans.arc = computeArcControls(trans.heroStart, trans.heroEnd, Math.min(fromIdx, clampedTarget));
        }

        trans.camStartPos.copy(camera.position);
        trans.camStartTarget.copy(camera.target);
        const camDist = toForm.cameraDistance || 13.5;
        trans.camEndPos.set(toForm.origin.x, toForm.origin.y, toForm.origin.z + camDist);
        trans.camEndTarget.copy(toForm.origin);

        trans.fromIndex = wasMidFlight ? trans.fromIndex : currentIndex;
        trans.toIndex = clampedTarget;
        trans.interrupted = wasMidFlight;
        trans.u = 0.0;
        trans.duration = isReducedMotion() ? 0.45 : (jumpSpan > 1 ? 2.65 : 2.40);
        trans.active = true;
        trans.phase = "DETACH";
        trans.domScrolledToTarget = false;
        trans.auxOpacity = 0.0;
    };

    /* ---------- Gesture Handling ---------- */
    let lastGestureTime = 0;
    const GESTURE_LOCK_MS = 460;

    const triggerStep = (deltaStep) => {
        const now = performance.now();
        if (trans.active) {
            const currentDir = Math.sign(trans.toIndex - trans.fromIndex) || 1;
            if (Math.sign(deltaStep) !== currentDir) {
                trans.queuedIndex = -1;
                startTransition(clamp(trans.toIndex + deltaStep, 0, formations.length - 1));
                lastGestureTime = now;
                return;
            }
            if (trans.u > 0.35 && trans.queuedIndex === -1) {
                trans.queuedIndex = clamp(trans.toIndex + deltaStep, 0, formations.length - 1);
            }
            return;
        }

        if (now - lastGestureTime < GESTURE_LOCK_MS) return;
        const nextIdx = clamp(currentIndex + deltaStep, 0, formations.length - 1);
        if (nextIdx !== currentIndex) {
            lastGestureTime = now;
            startTransition(nextIdx);
        }
    };

    const isAtSectionScrollBoundary = (sec, dir) => {
        if (!sec) return true;
        const r = sec.getBoundingClientRect();
        if (dir > 0 && r.bottom > window.innerHeight + 24) return false;
        if (dir < 0 && r.top < -24) return false;
        return true;
    };

    window.addEventListener("wheel", (e) => {
        if (!sections.length) return;
        if (e.ctrlKey || e.metaKey) return;
        const dy = e.deltaY;
        const dir = Math.sign(dy);
        if (dir === 0) return;

        const activeSec = sections[currentIndex];
        if (!trans.active && !isAtSectionScrollBoundary(activeSec, dir)) return;

        e.preventDefault();
        if (Math.abs(dy) >= 24) triggerStep(dir);
    }, { passive: false });

    let touchStartY = null, touchStartX = null, touchConsumed = false;
    window.addEventListener("touchstart", (e) => {
        if (e.touches.length !== 1) return;
        touchStartY = e.touches[0].clientY;
        touchStartX = e.touches[0].clientX;
        touchConsumed = false;
    }, { passive: true });

    window.addEventListener("touchmove", (e) => {
        if (touchStartY === null || e.touches.length !== 1) return;
        const dy = touchStartY - e.touches[0].clientY;
        const dx = touchStartX - e.touches[0].clientX;
        if (Math.abs(dx) > Math.abs(dy) * 1.2) return;
        const dir = Math.sign(dy);
        if (dir === 0) return;

        const activeSec = sections[currentIndex];
        if (!trans.active && !isAtSectionScrollBoundary(activeSec, dir)) return;

        e.preventDefault();
        if (!touchConsumed && Math.abs(dy) >= 34) {
            touchConsumed = true;
            triggerStep(dir);
        }
    }, { passive: false });

    window.addEventListener("touchend", () => {
        touchStartY = null;
        touchStartX = null;
        touchConsumed = false;
    }, { passive: true });

    let simTime = 0;

    const refreshSections = () => {
        sections = Array.from(document.querySelectorAll(".snap-section"));
        formations.forEach((f) => { if (f && f.dispose) f.dispose(); });
        formations = sections.map((sec, idx) => {
            const simKey = sec.dataset.sim || "hub:intro";
            const slideCfg = (root.SLIDE_SIMS && root.SLIDE_SIMS[simKey]) || {};
            return TF.createFormation(simKey, idx, slideCfg.params || {});
        });
        if (formations.length === 0) {
            formations = [TF.createFormation("hub:intro", 0, {})];
        }

        let startIdx = 0;
        if (location.hash) {
            const targetSec = document.querySelector(location.hash);
            const found = sections.indexOf(targetSec);
            if (found !== -1) startIdx = found;
        }
        currentIndex = startIdx;
        trans.active = false;
        trans.phase = "IDLE";
        trans.u = 0;
        trans.queuedIndex = -1;
        trans.auxOpacity = 1.0;
        trans.warpStrength = 0.0;

        const active = formations[currentIndex];
        if (active) {
            active.init(sharedBuffer, ctxState);
            active.update(0.016, 0.016, sharedBuffer, ctxState);
            prevPositions.set(positions);
            const camDist = active.cameraDistance || 13.5;
            camera.fov = 52.0;
            camera.position.set(active.origin.x, active.origin.y, active.origin.z + camDist);
            camera.target.copy(active.origin);
            postState.bloomStrength = active.bloomStrength || 0.78;
            postState.bloomThreshold = active.bloomThreshold || 0.80;
            postState.trailDecay = active.trailDecay || 0.68;
            postState.streakScale = active.streakScale || 1.25;
            if (active.fogTint) {
                postState.fogTint[0] = active.fogTint[0];
                postState.fogTint[1] = active.fogTint[1];
                postState.fogTint[2] = active.fogTint[2];
            }
        }
        trailNeedsReset = true;
        applyDomSectionVisibility(currentIndex, currentIndex, 1.0, false);
        updateThemeAndDots(currentIndex);
    };

    refreshSections();

    /* ---------- ?debug Telemetry HUD & Kerr Geodesic Diagnostics ---------- */
    window.__KERR_DEBUG__ = window.__KERR_DEBUG__ || {
        mode: 0,
        inc: null,
        spin: null
    };

    const parseUrlDebug = () => {
        try {
            const sp = new URLSearchParams(location.search);
            if (sp.has("debug")) {
                const modeStr = (sp.get("mode") || "").toLowerCase();
                const modeMap = {
                    "a": 0, "final": 0, "0": 0,
                    "b": 1, "term": 1, "1": 1,
                    "c": 2, "steps": 2, "2": 2,
                    "d": 3, "order": 3, "3": 3,
                    "e": 4, "radius": 4, "4": 4,
                    "f": 5, "drift": 5, "5": 5,
                    "g": 6, "accum": 6, "6": 6,
                    "h": 7, "bounds": 7, "7": 7
                };
                if (modeStr in modeMap) {
                    window.__KERR_DEBUG__.mode = modeMap[modeStr];
                }
                if (sp.has("inc")) {
                    const incVal = parseFloat(sp.get("inc"));
                    if (!isNaN(incVal)) window.__KERR_DEBUG__.inc = incVal;
                }
                if (sp.has("spin")) {
                    const spinVal = parseFloat(sp.get("spin"));
                    if (!isNaN(spinVal)) window.__KERR_DEBUG__.spin = spinVal;
                }
                if (sp.has("scale")) {
                    const scaleVal = parseFloat(sp.get("scale"));
                    if (!isNaN(scaleVal)) window.__KERR_DEBUG__.scale = scaleVal;
                }
            }
        } catch (_e) {}
    };
    parseUrlDebug();

    let debugEl = null;
    const isDebugEnabled = () => {
        try {
            return new URLSearchParams(location.search).has("debug") || (window.__KERR_DEBUG__ && window.__KERR_DEBUG__.active);
        } catch (_e) {
            return false;
        }
    };

    const DEBUG_MODES_INFO = [
        { key: "a", id: 0, label: "Final" },
        { key: "b", id: 1, label: "Term Reason" },
        { key: "c", id: 2, label: "Step Heatmap" },
        { key: "d", id: 3, label: "Crossing Order" },
        { key: "e", id: 4, label: "Hit Radius r" },
        { key: "f", id: 5, label: "Conserved |H|" },
        { key: "g", id: 6, label: "Accumulation" },
        { key: "h", id: 7, label: "Viewport Seams" }
    ];

    const updateDebugHud = () => {
        if (!isDebugEnabled()) {
            if (debugEl) { debugEl.remove(); debugEl = null; }
            return;
        }
        if (!debugEl) {
            debugEl = document.createElement("div");
            debugEl.className = "stage-debug-hud";
            debugEl.style.cssText = "position:fixed;top:68px;right:16px;z-index:9999;padding:12px 14px;border-radius:10px;background:rgba(8,12,20,0.92);border:1px solid rgba(124,184,255,0.32);color:#e6eefc;font:500 11px/1.5 var(--mono,monospace);pointer-events:auto;backdrop-filter:blur(10px);box-shadow:0 8px 24px rgba(0,0,0,0.5);width:340px;user-select:none;";
            debugEl.innerHTML = `
                <div style="font-weight:700;letter-spacing:0.06em;color:#7cb8ff;margin-bottom:8px;display:flex;justify-content:space-between;align-items:center;">
                    <span>KERR GEODESIC TELEMETRY</span>
                    <span id="dbg-fps-tag" style="color:#8af;">60 FPS</span>
                </div>
                <div style="margin-bottom:6px;font-size:10px;color:#8aa2c2;text-transform:uppercase;letter-spacing:0.04em;">Telemetry Mode:</div>
                <div id="dbg-modes" style="display:grid;grid-template-columns:repeat(4,1fr);gap:4px;margin-bottom:10px;"></div>
                <div style="margin-bottom:6px;font-size:10px;color:#8aa2c2;text-transform:uppercase;letter-spacing:0.04em;">Inclination (θ):</div>
                <div id="dbg-incs" style="display:flex;gap:4px;margin-bottom:10px;"></div>
                <div style="margin-bottom:6px;font-size:10px;color:#8aa2c2;text-transform:uppercase;letter-spacing:0.04em;">Metric & Verification Presets:</div>
                <div id="dbg-presets" style="display:flex;gap:4px;margin-bottom:10px;"></div>
                <pre id="dbg-stats" style="margin:0;font:inherit;color:#a8c4ea;border-top:1px solid rgba(255,255,255,0.1);padding-top:8px;font-size:10.5px;"></pre>
            `;
            document.body.appendChild(debugEl);

            const modesContainer = debugEl.querySelector("#dbg-modes");
            DEBUG_MODES_INFO.forEach((m) => {
                const btn = document.createElement("button");
                btn.type = "button";
                btn.dataset.mode = m.id;
                btn.textContent = `${m.key}: ${m.label}`;
                btn.style.cssText = "padding:3px 4px;font:500 9.5px var(--mono,monospace);background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.15);color:#d0e2ff;border-radius:4px;cursor:pointer;text-align:center;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;";
                btn.addEventListener("click", (e) => {
                    e.stopPropagation();
                    window.__KERR_DEBUG__.mode = m.id;
                    updateDebugHud();
                });
                modesContainer.appendChild(btn);
            });

            const incsContainer = debugEl.querySelector("#dbg-incs");
            const incPresets = [
                { label: "0°", val: 0 },
                { label: "17°", val: 17 },
                { label: "45°", val: 45 },
                { label: "80°", val: 80 },
                { label: "Auto", val: null }
            ];
            incPresets.forEach((p) => {
                const btn = document.createElement("button");
                btn.type = "button";
                btn.dataset.inc = p.val === null ? "auto" : p.val;
                btn.textContent = p.label;
                btn.style.cssText = "flex:1;padding:3px 2px;font:500 10px var(--mono,monospace);background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.15);color:#d0e2ff;border-radius:4px;cursor:pointer;text-align:center;";
                btn.addEventListener("click", (e) => {
                    e.stopPropagation();
                    window.__KERR_DEBUG__.inc = p.val;
                    updateDebugHud();
                });
                incsContainer.appendChild(btn);
            });

            const presetsContainer = debugEl.querySelector("#dbg-presets");
            const testPresets = [
                { label: "Schwarzschild (0°)", spin: 0.0, inc: 0.001 },
                { label: "Kerr 17°", spin: 0.95, inc: 17.0 },
                { label: "Kerr 80°", spin: 0.95, inc: 80.0 }
            ];
            testPresets.forEach((tp) => {
                const btn = document.createElement("button");
                btn.type = "button";
                btn.textContent = tp.label;
                btn.style.cssText = "flex:1;padding:3px 2px;font:500 9.5px var(--mono,monospace);background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.15);color:#d0e2ff;border-radius:4px;cursor:pointer;text-align:center;";
                btn.addEventListener("click", (e) => {
                    e.stopPropagation();
                    window.__KERR_DEBUG__.spin = tp.spin;
                    window.__KERR_DEBUG__.inc = tp.inc;
                    updateDebugHud();
                });
                presetsContainer.appendChild(btn);
            });
        }

        const activeForm = formations[trans.active ? trans.toIndex : currentIndex];
        const formName = activeForm ? activeForm.id : "hub:intro";
        const hx = positions[0].toFixed(2), hy = positions[1].toFixed(2), hz = positions[2].toFixed(2);
        const curMode = (window.__KERR_DEBUG__ && window.__KERR_DEBUG__.mode !== undefined) ? window.__KERR_DEBUG__.mode : 0;
        const curInc = (window.__KERR_DEBUG__ && window.__KERR_DEBUG__.inc !== null) ? `${window.__KERR_DEBUG__.inc}° (override)` : "Auto (tilt pointer)";
        const curSpin = (window.__KERR_DEBUG__ && window.__KERR_DEBUG__.spin !== null) ? window.__KERR_DEBUG__.spin : 0.95;

        // Update button highlights
        debugEl.querySelectorAll("#dbg-modes button").forEach((b) => {
            const isActive = parseInt(b.dataset.mode, 10) === curMode;
            b.style.background = isActive ? "rgba(124,184,255,0.3)" : "rgba(255,255,255,0.06)";
            b.style.borderColor = isActive ? "#7cb8ff" : "rgba(255,255,255,0.15)";
            b.style.color = isActive ? "#ffffff" : "#d0e2ff";
        });
        debugEl.querySelectorAll("#dbg-incs button").forEach((b) => {
            const isAuto = b.dataset.inc === "auto";
            const isMatch = isAuto ? (window.__KERR_DEBUG__.inc === null) : (window.__KERR_DEBUG__.inc === parseFloat(b.dataset.inc));
            b.style.background = isMatch ? "rgba(124,184,255,0.3)" : "rgba(255,255,255,0.06)";
            b.style.borderColor = isMatch ? "#7cb8ff" : "rgba(255,255,255,0.15)";
            b.style.color = isMatch ? "#ffffff" : "#d0e2ff";
        });

        const fpsTag = debugEl.querySelector("#dbg-fps-tag");
        if (fpsTag) fpsTag.textContent = `${fps.toFixed(1)} FPS (${hdrSupported ? "HDR16F" : "8b"})`;

        const statsEl = debugEl.querySelector("#dbg-stats");
        if (statsEl) {
            statsEl.textContent =
                `formation : ${formName} (#${currentIndex})\n` +
                `active mode: [${DEBUG_MODES_INFO[curMode].key}] ${DEBUG_MODES_INFO[curMode].label}\n` +
                `inclination: ${curInc}\n` +
                `spin a     : ${curSpin} (ISCO ~1.94M)\n` +
                `progress   : ${(trans.u * 100).toFixed(1)}% | fov: ${camera.fov.toFixed(1)}°\n` +
                `particles  : ${sharedBuffer.count} (reallocs: ${bufferReallocations})\n` +
                `hero #0    : (${hx}, ${hy}, ${hz})`;
        }
    };

    /* ---------- Main Simulation, Transition & HDR Post-Processing Loop ---------- */
    let lastTime = performance.now();
    let fps = 60;
    let slowFrames = 0;
    let lastThemeLight = document.documentElement.dataset.theme === "light";

    const tmpHeroPos = new Vector3();
    const tmpHeroTan = new Vector3();
    const tmpStreamPos = new Vector3();
    const tanTmpA = new Vector3();
    const tanTmpB = new Vector3();
    const LUT_STEPS = 64;
    const curveLutX = new Float32Array(LUT_STEPS + 1);
    const curveLutY = new Float32Array(LUT_STEPS + 1);
    const curveLutZ = new Float32Array(LUT_STEPS + 1);

    const evalFlightPath = (s, out) => {
        if (trans.waypoints && trans.waypoints.length > 2) {
            return evalWaypointSpline(trans.waypoints, s, out);
        }
        const a = trans.arc;
        return evalBezier3D(a.p0, a.p1, a.p2, a.p3, s, out);
    };

    const evalFlightTangent = (s, out) => {
        if (trans.waypoints && trans.waypoints.length > 2) {
            const eps = 0.01;
            evalWaypointSpline(trans.waypoints, Math.max(0, s - eps), tanTmpA);
            evalWaypointSpline(trans.waypoints, Math.min(1, s + eps), tanTmpB);
            return out.subVectors(tanTmpB, tanTmpA).normalize();
        }
        const a = trans.arc;
        return evalBezierTangent3D(a.p0, a.p1, a.p2, a.p3, s, out);
    };

    const drawQuad = () => {
        gl.bindVertexArray(quadVAO);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        gl.bindVertexArray(null);
    };

    const tick = (now) => {
        requestAnimationFrame(tick);
        if (contextLost || document.hidden) {
            lastTime = now;
            return;
        }

        const rawDt = (now - lastTime) * 0.001;
        lastTime = now;
        const dt = clamp(rawDt, 0.001, 0.05);
        simTime += dt;

        const instFps = 1.0 / Math.max(1e-4, rawDt);
        fps = fps * 0.92 + instFps * 0.08;

        // Adaptive particle count & post quality if frame time > 20 ms sustained (never reallocates buffer)
        if (rawDt > 0.0205) {
            slowFrames++;
            if (slowFrames > 30) {
                if (sharedBuffer.count > MIN_ADAPTIVE_N) {
                    sharedBuffer.count = Math.max(MIN_ADAPTIVE_N, Math.floor(sharedBuffer.count * 0.88));
                    geometry.setDrawRange(0, sharedBuffer.count);
                } else {
                    postQuality = 1;
                }
                slowFrames = 0;
            }
        } else {
            slowFrames = Math.max(0, slowFrames - 1);
            if (fps > 56 && postQuality < 2) postQuality = 2;
        }

        ctxState.isMobile = isMobileDevice();
        ctxState.isLight = document.documentElement.dataset.theme === "light";
        if (ctxState.isLight !== lastThemeLight) {
            lastThemeLight = ctxState.isLight;
            trailNeedsReset = true;
        }
        ctxState.pointerX += (ctxState.targetPointerX - ctxState.pointerX) * 0.08;
        ctxState.pointerY += (ctxState.targetPointerY - ctxState.pointerY) * 0.08;

        const N = sharedBuffer.count;
        // Snapshot previous frame positions before advancing simulation for velocity-aligned ribbons
        prevPositions.subarray(0, N * 3).set(positions.subarray(0, N * 3));

        let heroBoost = 0.0;

        if (!trans.active) {
            /* ---------- STEADY STATE: Only current formation's update() runs ---------- */
            const active = formations[currentIndex];
            if (active) {
                active.update(dt, simTime, sharedBuffer, ctxState);
                const camDist = active.cameraDistance || 13.5;
                camera.fov = 52.0;
                // Gentle cinematic idle camera orbit + pointer parallax
                const camOrbitX = Math.sin(simTime * 0.19) * 0.36;
                const camOrbitY = Math.cos(simTime * 0.14) * 0.24;
                const camOrbitZ = Math.sin(simTime * 0.11) * 0.28;
                camera.position.set(
                    active.origin.x + camOrbitX + ctxState.pointerX * 0.62,
                    active.origin.y + camOrbitY - ctxState.pointerY * 0.48,
                    active.origin.z + camDist + camOrbitZ
                );
                camera.target.set(
                    active.origin.x + ctxState.pointerX * 0.16,
                    active.origin.y - ctxState.pointerY * 0.16,
                    active.origin.z
                );

                // Smoothly converge post-processing parameters to active section
                const pLerp = clamp(dt * 4.0, 0.02, 0.25);
                postState.bloomStrength += ((active.bloomStrength || 0.78) - postState.bloomStrength) * pLerp;
                postState.bloomThreshold += ((active.bloomThreshold || 0.80) - postState.bloomThreshold) * pLerp;
                postState.trailDecay += ((active.trailDecay || 0.68) - postState.trailDecay) * pLerp;
                postState.streakScale += ((active.streakScale || 1.25) - postState.streakScale) * pLerp;
                if (active.fogTint) {
                    postState.fogTint[0] += (active.fogTint[0] - postState.fogTint[0]) * pLerp;
                    postState.fogTint[1] += (active.fogTint[1] - postState.fogTint[1]) * pLerp;
                    postState.fogTint[2] += (active.fogTint[2] - postState.fogTint[2]) * pLerp;
                }
            }
            trans.auxOpacity = Math.min(1.0, trans.auxOpacity + dt * 2.5);
            trans.warpStrength = 0.0;
        } else {
            /* ---------- 5-PHASE TRANSITION ENGINE ---------- */
            trans.u = clamp(trans.u + dt / trans.duration, 0.0, 1.0);
            const u = trans.u;
            trans.phase = getPhaseName(u);

            const fromForm = formations[trans.fromIndex];
            const toForm = formations[trans.toIndex];

            const fromSimBlend = trans.interrupted ? 0.0 : (1.0 - smoothstep(0.10, 0.40, u));
            if (fromSimBlend > 0.001 && fromForm) {
                fromForm.update(dt * fromSimBlend, simTime, fromScratchBuffer, ctxState);
            }

            if (u >= 0.55 && toForm) {
                toForm.update(dt, simTime, nextScratchBuffer, ctxState);
            }

            if (!trans.domScrolledToTarget && u >= 0.70) {
                trans.domScrolledToTarget = true;
                const targetSec = sections[trans.toIndex];
                if (targetSec) {
                    window.scrollTo({ top: targetSec.offsetTop, behavior: "instant" });
                }
                updateThemeAndDots(trans.toIndex);
            }
            applyDomSectionVisibility(trans.fromIndex, trans.toIndex, u, true);

            const sHero = smootherstep(0.0, 0.86, u);
            evalFlightPath(sHero, tmpHeroPos);
            evalFlightTangent(sHero, tmpHeroTan);

            const lambda = smoothstep(0.75, 1.00, u);
            const nu = smoothstep(0.66, 0.94, u);

            const hEndX = nextPositions[0], hEndY = nextPositions[1], hEndZ = nextPositions[2];
            const hFlightX = tmpHeroPos.x + (hEndX - trans.heroEnd.x) * sHero;
            const hFlightY = tmpHeroPos.y + (hEndY - trans.heroEnd.y) * sHero;
            const hFlightZ = tmpHeroPos.z + (hEndZ - trans.heroEnd.z) * sHero;

            positions[0] = hFlightX + (hEndX - hFlightX) * lambda;
            positions[1] = hFlightY + (hEndY - hFlightY) * lambda;
            positions[2] = hFlightZ + (hEndZ - hFlightZ) * lambda;

            colours[0] = fromColours[0] + (nextColours[0] - fromColours[0]) * smoothstep(0.15, 0.90, u);
            colours[1] = fromColours[1] + (nextColours[1] - fromColours[1]) * smoothstep(0.15, 0.90, u);
            colours[2] = fromColours[2] + (nextColours[2] - fromColours[2]) * smoothstep(0.15, 0.90, u);
            sizes[0] = fromSizes[0] + (nextSizes[0] - fromSizes[0]) * lambda;

            heroBoost = smoothstep(0.0, 0.12, u) * (1.0 - smoothstep(0.78, 0.98, u));

            const hx0 = trans.heroStart.x, hy0 = trans.heroStart.y, hz0 = trans.heroStart.z;
            const hx1 = trans.heroEnd.x, hy1 = trans.heroEnd.y, hz1 = trans.heroEnd.z;

            for (let k = 0; k <= LUT_STEPS; k++) {
                evalFlightPath(k / LUT_STEPS, tmpStreamPos);
                curveLutX[k] = tmpStreamPos.x;
                curveLutY[k] = tmpStreamPos.y;
                curveLutZ[k] = tmpStreamPos.z;
            }

            const reduced = isReducedMotion();

            for (let i = 1; i < N; i++) {
                const i3 = i * 3, i4 = i * 4;
                const rank = particleRanks[i];

                const fx = fromPositions[i3], fy = fromPositions[i3 + 1], fz = fromPositions[i3 + 2];
                const tx = nextPositions[i3], ty = nextPositions[i3 + 1], tz = nextPositions[i3 + 2];

                if (reduced) {
                    const m = smootherstep(0.0, 1.0, u);
                    positions[i3]     = fx + (tx - fx) * m;
                    positions[i3 + 1] = fy + (ty - fy) * m;
                    positions[i3 + 2] = fz + (tz - fz) * m;
                    colours[i3]       = fromColours[i3] + (nextColours[i3] - fromColours[i3]) * m;
                    colours[i3 + 1]   = fromColours[i3 + 1] + (nextColours[i3 + 1] - fromColours[i3 + 1]) * m;
                    colours[i3 + 2]   = fromColours[i3 + 2] + (nextColours[i3 + 2] - fromColours[i3 + 2]) * m;
                    sizes[i]          = fromSizes[i] + (nextSizes[i] - fromSizes[i]) * m;
                    continue;
                }

                const uStart = 0.07 + 0.19 * rank;
                const uEnd = 0.72 + 0.16 * rank;
                const si = smootherstep(uStart, uEnd, u);
                const oneMinusS = 1.0 - si;

                const lutCoord = si * LUT_STEPS;
                const lutIdx = Math.min(LUT_STEPS - 1, lutCoord | 0);
                const lutFrac = lutCoord - lutIdx;
                const bx = curveLutX[lutIdx] + (curveLutX[lutIdx + 1] - curveLutX[lutIdx]) * lutFrac;
                const by = curveLutY[lutIdx] + (curveLutY[lutIdx + 1] - curveLutY[lutIdx]) * lutFrac;
                const bz = curveLutZ[lutIdx] + (curveLutZ[lutIdx + 1] - curveLutZ[lutIdx]) * lutFrac;

                const wSrc = oneMinusS * oneMinusS;
                const dStartX = fx - hx0, dStartY = fy - hy0, dStartZ = fz - hz0;

                const streamEnv = 4.0 * si * oneMinusS;
                const phase = seeds[i4] * 6.2831853 + si * 9.5 - simTime * 2.4;
                const tubeRad = (0.35 + 1.45 * rank) * streamEnv;
                const cx = Math.cos(phase) * tubeRad + Math.sin(seeds[i4 + 1] * 12.0 + si * 5.0) * 0.45 * streamEnv;
                const cy = Math.sin(phase) * tubeRad + Math.cos(seeds[i4 + 2] * 12.0 - si * 4.5) * 0.45 * streamEnv;
                const cz = Math.sin(phase * 0.7 + seeds[i4 + 3] * 6.28) * tubeRad * 0.8;

                const wDst = si * si * nu;
                const dEndX = tx - hx1, dEndY = ty - hy1, dEndZ = tz - hz1;

                const flightX = bx + wSrc * dStartX + cx + wDst * dEndX;
                const flightY = by + wSrc * dStartY + cy + wDst * dEndY;
                const flightZ = bz + wSrc * dStartZ + cz + wDst * dEndZ;

                positions[i3]     = flightX + (tx - flightX) * lambda;
                positions[i3 + 1] = flightY + (ty - flightY) * lambda;
                positions[i3 + 2] = flightZ + (tz - flightZ) * lambda;

                const colBlend = clamp(si * 0.72 + lambda * 0.28, 0.0, 1.0);
                const streamGlow = streamEnv * 0.22;
                colours[i3]     = fromColours[i3] + (nextColours[i3] - fromColours[i3]) * colBlend + streamGlow * 0.6;
                colours[i3 + 1] = fromColours[i3 + 1] + (nextColours[i3 + 1] - fromColours[i3 + 1]) * colBlend + streamGlow * 0.8;
                colours[i3 + 2] = fromColours[i3 + 2] + (nextColours[i3 + 2] - fromColours[i3 + 2]) * colBlend + streamGlow;

                sizes[i] = fromSizes[i] + (nextSizes[i] - fromSizes[i]) * colBlend + streamEnv * 0.45;
            }

            if (reduced) {
                const cm = smootherstep(0.0, 1.0, u);
                camera.fov = 52.0;
                camera.position.lerpVectors(trans.camStartPos, trans.camEndPos, cm);
                camera.target.lerpVectors(trans.camStartTarget, trans.camEndTarget, cm);
            } else {
                const railWeight = smoothstep(0.06, 0.28, u) * (1.0 - smoothstep(0.68, 0.96, u));
                const baseLerp = smootherstep(0.0, 1.0, u);

                const baseCamX = trans.camStartPos.x + (trans.camEndPos.x - trans.camStartPos.x) * baseLerp;
                const baseCamY = trans.camStartPos.y + (trans.camEndPos.y - trans.camStartPos.y) * baseLerp;
                const baseCamZ = trans.camStartPos.z + (trans.camEndPos.z - trans.camStartPos.z) * baseLerp;

                const baseTgtX = trans.camStartTarget.x + (trans.camEndTarget.x - trans.camStartTarget.x) * baseLerp;
                const baseTgtY = trans.camStartTarget.y + (trans.camEndTarget.y - trans.camStartTarget.y) * baseLerp;
                const baseTgtZ = trans.camStartTarget.z + (trans.camEndTarget.z - trans.camStartTarget.z) * baseLerp;

                const railCamX = tmpHeroPos.x - tmpHeroTan.x * 6.5;
                const railCamY = tmpHeroPos.y - tmpHeroTan.y * 4.0 + 2.8;
                const railCamZ = tmpHeroPos.z + 14.5;

                camera.position.set(
                    baseCamX + (railCamX - baseCamX) * railWeight * 0.65,
                    baseCamY + (railCamY - baseCamY) * railWeight * 0.65,
                    baseCamZ + (railCamZ - baseCamZ) * railWeight * 0.65
                );
                camera.target.set(
                    baseTgtX + (tmpHeroPos.x - baseTgtX) * railWeight * 0.72,
                    baseTgtY + (tmpHeroPos.y - baseTgtY) * railWeight * 0.72,
                    baseTgtZ + (tmpHeroPos.z - baseTgtZ) * railWeight * 0.72
                );

                const breath = Math.sin(Math.PI * smoothstep(0.10, 0.90, u));
                camera.fov = 52.0 + 8.5 * breath;
            }

            if (toForm) {
                const m = smoothstep(0.15, 0.85, u);
                const fB = (fromForm && fromForm.bloomStrength) || 0.78;
                const tB = toForm.bloomStrength || 0.78;
                postState.bloomStrength = fB + (tB - fB) * m;
                const fD = (fromForm && fromForm.trailDecay) || 0.68;
                const tD = toForm.trailDecay || 0.68;
                postState.trailDecay = (fD + (tD - fD) * m) * 0.72;
                if (toForm.fogTint && fromForm && fromForm.fogTint) {
                    postState.fogTint[0] = fromForm.fogTint[0] + (toForm.fogTint[0] - fromForm.fogTint[0]) * m;
                    postState.fogTint[1] = fromForm.fogTint[1] + (toForm.fogTint[1] - fromForm.fogTint[1]) * m;
                    postState.fogTint[2] = fromForm.fogTint[2] + (toForm.fogTint[2] - fromForm.fogTint[2]) * m;
                }
            }

            trans.auxOpacity = smoothstep(0.88, 1.00, u);

            if (u >= 1.0) {
                currentIndex = trans.toIndex;
                trans.active = false;
                trans.phase = "IDLE";
                trans.u = 0.0;
                trans.interrupted = false;
                trans.auxOpacity = 1.0;
                trans.warpStrength = 0.0;
                applyDomSectionVisibility(currentIndex, currentIndex, 1.0, false);
                updateThemeAndDots(currentIndex);

                if (trans.queuedIndex !== -1 && trans.queuedIndex !== currentIndex) {
                    const nextQ = trans.queuedIndex;
                    trans.queuedIndex = -1;
                    startTransition(nextQ);
                } else {
                    trans.queuedIndex = -1;
                }
            }
        }

        camera.updateMatrices();
        updateDebugHud();

        /* ---------- HDR Multi-Pass Render Graph on Single #stage-canvas ---------- */
        const pw = stageCanvas.width;
        const ph = stageCanvas.height;
        ensurePostTargets(pw, ph);

        gl.disable(gl.DEPTH_TEST);
        const isLight = ctxState.isLight;
        const activeRenderForm = formations[trans.active ? trans.toIndex : currentIndex];

        // Pass 1: Persistent Motion-Trail Decay + Single Shared Swarm Draw into trailRT[writeIdx]
        const trailWriteIdx = 1 - trailReadIdx;
        gl.bindFramebuffer(gl.FRAMEBUFFER, trailRT[trailWriteIdx].fbo);
        gl.viewport(0, 0, pw, ph);

        if (typeof window !== "undefined" && window.__KERR_TILT_FAST__) {
            trailNeedsReset = true;
            window.__KERR_TILT_FAST__ = false;
        }
        const effDecay = (trailNeedsReset || isLight || isReducedMotion()) ? 0.0 : clamp(postState.trailDecay, 0.0, 0.93);
        trailNeedsReset = false;

        gl.disable(gl.BLEND);
        gl.useProgram(trailDecayProg);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, trailRT[trailReadIdx].tex);
        gl.uniform1i(trailDecayUniforms.uPrevTex, 0);
        gl.uniform1f(trailDecayUniforms.uDecay, effDecay);
        drawQuad();

        gl.enable(gl.BLEND);
        if (isLight) {
            gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        } else {
            gl.blendFunc(gl.ONE, gl.ONE);
        }

        const trailGain = isLight ? 0.85 : clamp(1.0 - effDecay * 0.56, 0.36, 1.0);
        const maxStreakPx = trans.active ? 48.0 : 20.0;

        gl.useProgram(pointProg);
        gl.uniformMatrix4fv(pointUniforms.uViewProj, false, camera.viewProjectionMatrix.elements);
        gl.uniform3f(pointUniforms.uCamPos, camera.position.x, camera.position.y, camera.position.z);
        gl.uniform2f(pointUniforms.uViewport, width, height);
        gl.uniform1f(pointUniforms.uDpr, dpr);
        gl.uniform1f(pointUniforms.uTime, simTime);
        gl.uniform1f(pointUniforms.uHeroBoost, heroBoost);
        gl.uniform1f(pointUniforms.uIsLight, isLight ? 1.0 : 0.0);
        gl.uniform1f(pointUniforms.uStreakScale, isReducedMotion() ? 0.0 : postState.streakScale);
        gl.uniform1f(pointUniforms.uMaxStreakPx, maxStreakPx);
        gl.uniform1f(pointUniforms.uTrailGain, trailGain);
        gl.uniform3f(pointUniforms.uFogTint, postState.fogTint[0], postState.fogTint[1], postState.fogTint[2]);

        gl.bindVertexArray(sharedVAO);

        gl.bindBuffer(gl.ARRAY_BUFFER, posVBO);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, positions.subarray(0, N * 3));

        gl.bindBuffer(gl.ARRAY_BUFFER, prevPosVBO);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, prevPositions.subarray(0, N * 3));

        gl.bindBuffer(gl.ARRAY_BUFFER, colVBO);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, colours.subarray(0, N * 3));

        gl.bindBuffer(gl.ARRAY_BUFFER, sizeVBO);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, sizes.subarray(0, N));

        gl.drawArrays(gl.POINTS, 0, N);
        gl.bindVertexArray(null);

        trailReadIdx = trailWriteIdx;

        // Pass 2: Assemble Linear HDR Scene in sceneRT (Parallax Starfield + Same-Scene Aux + Trailed Swarm)
        gl.bindFramebuffer(gl.FRAMEBUFFER, sceneRT.fbo);
        gl.viewport(0, 0, pw, ph);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);

        gl.enable(gl.BLEND);
        if (isLight) {
            gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        } else {
            gl.blendFunc(gl.ONE, gl.ONE);
        }

        // 2a. Celestial background starfield & Milky Way layer (matches Black Hole celestial sphere exactly)
        if (starProg) {
            const isMob = isMobileDevice();
            const baseScreenX = isMob ? 0.50 : (0.66 - ctxState.pointerX * 0.015);
            const baseScreenY = isMob ? 0.68 : (0.50 + ctxState.pointerY * 0.02);
            const baseScale = isMob ? 44.0 : 34.0;
            const currentTilt = 1.41 + ctxState.pointerY * 0.08;
            const currentScreenX = baseScreenX;
            const currentScreenY = baseScreenY;
            const currentScale = baseScale;

            gl.disable(gl.BLEND);
            gl.useProgram(starProg);
            gl.uniform2f(starUniforms.uRes, pw, ph);
            gl.uniform2f(starUniforms.uBhScreenCentre, currentScreenX, currentScreenY);
            gl.uniform1f(starUniforms.uBhScale, currentScale);
            gl.uniform1f(starUniforms.uTilt, currentTilt);
            gl.uniform1f(starUniforms.uTime, simTime);
            gl.uniform1f(starUniforms.uIsLight, isLight ? 1.0 : 0.0);
            drawQuad();

            gl.enable(gl.BLEND);
            if (isLight) {
                gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
            } else {
                gl.blendFunc(gl.ONE, gl.ONE);
            }
        }

        // 2b. Optional same-scene Kerr Black Hole lensing & photon ring shader
        const debugState = window.__KERR_DEBUG__ || { mode: 0, inc: null, spin: null };
        const debugMode = (debugState.mode !== undefined && debugState.mode !== null) ? debugState.mode : 0;
        const debugTilt = (debugState.inc !== undefined && debugState.inc !== null) ? (debugState.inc * Math.PI / 180.0) : null;
        const debugSpin = (debugState.spin !== undefined && debugState.spin !== null) ? debugState.spin : null;
        const debugScale = (debugState.scale !== undefined && debugState.scale !== null) ? debugState.scale : null;

        if (activeRenderForm && activeRenderForm.kerrOverlay && trans.auxOpacity > 0.005 && kerrProg && kerrRT) {
            // Render Kerr Black Hole ray tracer into kerrRT at optimal resolution
            gl.bindFramebuffer(gl.FRAMEBUFFER, kerrRT.fbo);
            gl.viewport(0, 0, kerrRT.width, kerrRT.height);
            gl.clearColor(0, 0, 0, 0);
            gl.clear(gl.COLOR_BUFFER_BIT);

            const ko = activeRenderForm.kerrOverlay;
            gl.useProgram(kerrProg);
            gl.uniform2f(kerrUniforms.uRes, kerrRT.width, kerrRT.height);
            gl.uniform2f(kerrUniforms.uBhScreenCentre, ko.screenX, ko.screenY);
            gl.uniform1f(kerrUniforms.uBhScale, debugScale !== null ? debugScale : ko.scale);
            gl.uniform1f(kerrUniforms.uSpin, debugSpin !== null ? debugSpin : ko.spin);
            gl.uniform1f(kerrUniforms.uTilt, debugTilt !== null ? debugTilt : ko.tilt);
            gl.uniform1f(kerrUniforms.uTime, simTime);
            gl.uniform1f(kerrUniforms.uAuxOpacity, trans.auxOpacity);
            gl.uniform1f(kerrUniforms.uIsLight, isLight ? 1.0 : 0.0);
            gl.uniform1i(kerrUniforms.uDebugMode, debugMode);
            drawQuad();

            // Blit kerrRT into sceneRT with linear hardware filtering and premultiplied alpha masking
            gl.bindFramebuffer(gl.FRAMEBUFFER, sceneRT.fbo);
            gl.viewport(0, 0, pw, ph);
            gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
            gl.useProgram(blitAddProg);
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, kerrRT.tex);
            gl.uniform1i(blitAddUniforms.uTex, 0);
            drawQuad();
            if (!isLight) gl.blendFunc(gl.ONE, gl.ONE);
        }

        // 2c. Optional same-scene auxiliary line/surface overlay
        if (activeRenderForm && activeRenderForm.auxLineCount > 0 && trans.auxOpacity > 0.005 && auxProg) {
            gl.useProgram(auxProg);
            gl.uniformMatrix4fv(auxUniforms.uViewProj, false, camera.viewProjectionMatrix.elements);
            gl.uniform1f(auxUniforms.uAuxOpacity, trans.auxOpacity);
            gl.uniform1f(auxUniforms.uIsLight, isLight ? 1.0 : 0.0);

            gl.bindVertexArray(auxVAO);
            const vCount = Math.min(8192, activeRenderForm.auxLineCount);
            gl.bindBuffer(gl.ARRAY_BUFFER, auxPosVBO);
            gl.bufferSubData(gl.ARRAY_BUFFER, 0, activeRenderForm.auxPositions.subarray(0, vCount * 3));
            gl.bindBuffer(gl.ARRAY_BUFFER, auxColVBO);
            gl.bufferSubData(gl.ARRAY_BUFFER, 0, activeRenderForm.auxColours.subarray(0, vCount * 4));
            gl.drawArrays(gl.LINES, 0, vCount);
            gl.bindVertexArray(null);
        }

        // 2d. Composite persistent trailed particle swarm into sceneRT (suppressed during geodesic debugging)
        if (debugMode === 0) {
            if (isLight) {
                gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
            } else {
                gl.blendFunc(gl.ONE, gl.ONE);
            }
            gl.useProgram(blitAddProg);
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, trailRT[trailReadIdx].tex);
            gl.uniform1i(blitAddUniforms.uTex, 0);
            drawQuad();
        }

        // Pass 3: Selective HDR Bloom (Bright-Pass + Separable 9-Tap Gaussian Blur)
        gl.disable(gl.BLEND);
        if (!isLight && brightPassProg && blurProg) {
            gl.bindFramebuffer(gl.FRAMEBUFFER, bloomBrightRT.fbo);
            gl.viewport(0, 0, bloomBrightRT.width, bloomBrightRT.height);
            gl.useProgram(brightPassProg);
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, sceneRT.tex);
            gl.uniform1i(brightPassUniforms.uSceneTex, 0);
            gl.uniform1f(brightPassUniforms.uThreshold, postState.bloomThreshold);
            drawQuad();

            const bw = bloomPingRT.width, bh = bloomPingRT.height;
            gl.viewport(0, 0, bw, bh);
            gl.useProgram(blurProg);
            gl.uniform1i(blurUniforms.uTex, 0);

            // Iteration 1: tight core bloom
            gl.bindFramebuffer(gl.FRAMEBUFFER, bloomPingRT.fbo);
            gl.bindTexture(gl.TEXTURE_2D, bloomBrightRT.tex);
            gl.uniform2f(blurUniforms.uTexelStep, 1.0 / bw, 0.0);
            drawQuad();

            gl.bindFramebuffer(gl.FRAMEBUFFER, bloomPongRT.fbo);
            gl.bindTexture(gl.TEXTURE_2D, bloomPingRT.tex);
            gl.uniform2f(blurUniforms.uTexelStep, 0.0, 1.0 / bh);
            drawQuad();

            // Iteration 2: wide atmospheric halo (adaptive)
            if (postQuality >= 2) {
                gl.bindFramebuffer(gl.FRAMEBUFFER, bloomPingRT.fbo);
                gl.bindTexture(gl.TEXTURE_2D, bloomPongRT.tex);
                gl.uniform2f(blurUniforms.uTexelStep, 2.1 / bw, 0.0);
                drawQuad();

                gl.bindFramebuffer(gl.FRAMEBUFFER, bloomPongRT.fbo);
                gl.bindTexture(gl.TEXTURE_2D, bloomPingRT.tex);
                gl.uniform2f(blurUniforms.uTexelStep, 0.0, 2.1 / bh);
                drawQuad();
            }
        }

        // Pass 4: Final ACES Filmic Tone-Mapped Composite onto #stage-canvas
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, pw, ph);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);

        if (isLight) {
            gl.enable(gl.BLEND);
            gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
        } else {
            gl.disable(gl.BLEND);
        }

        gl.useProgram(compositeProg);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, sceneRT.tex);
        gl.uniform1i(compositeUniforms.uSceneTex, 0);

        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, bloomPongRT.tex);
        gl.uniform1i(compositeUniforms.uBloomTex, 1);

        gl.uniform2f(compositeUniforms.uRes, pw, ph);
        gl.uniform1f(compositeUniforms.uTime, simTime);
        gl.uniform1f(compositeUniforms.uBloomStrength, postState.bloomStrength);
        gl.uniform1f(compositeUniforms.uVignette, 0.36);
        gl.uniform1f(compositeUniforms.uGrain, 0.020);
        gl.uniform1f(compositeUniforms.uCaStrength, isReducedMotion() ? 0.0 : 0.0018);
        gl.uniform1f(compositeUniforms.uWarpStrength, isReducedMotion() ? 0.0 : trans.warpStrength);
        gl.uniform2f(compositeUniforms.uWarpCentre, 0.5, 0.5);
        gl.uniform3f(compositeUniforms.uFogTint, postState.fogTint[0], postState.fogTint[1], postState.fogTint[2]);
        gl.uniform1f(compositeUniforms.uIsLight, isLight ? 1.0 : 0.0);
        gl.uniform1i(compositeUniforms.uDebugMode, debugMode);

        drawQuad();
        gl.activeTexture(gl.TEXTURE0);
    };

    requestAnimationFrame(tick);

    console.info(`[THREAD_STAGE] Initialised single shared particle buffer: N=${INITIAL_N}, bufferReallocations=${bufferReallocations}`);

    return {
        supported: true,
        THREE,
        scene,
        camera,
        points,
        buffer: sharedBuffer,
        get bufferReallocations() { return bufferReallocations; },
        get currentIndex() { return currentIndex; },
        get currentFormation() {
            const f = formations[trans.active ? trans.toIndex : currentIndex];
            return f ? f.id : "hub:intro";
        },
        get phase() { return trans.phase; },
        get progress() { return trans.u; },
        get isTransitioning() { return trans.active; },
        get fps() { return fps; },
        get heroPosition() { return new Vector3(positions[0], positions[1], positions[2]); },
        get formations() { return formations; },
        get trans() { return trans; },
        refreshSections,
        goToSection: startTransition,
        triggerStep
    };
}));
