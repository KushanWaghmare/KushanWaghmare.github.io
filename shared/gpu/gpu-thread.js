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
        computeHopArcControls,
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

    let pointProg = null, starProg = null, auxProg = null, kerrProg = null, ringProg = null, ambientDustProg = null;
    let trailDecayProg = null, blitAddProg = null, brightPassProg = null, blurProg = null, compositeProg = null;
    let pointUniforms = {}, starUniforms = {}, auxUniforms = {}, kerrUniforms = {}, ringUniforms = {}, ambientDustUniforms = {};
    let trailDecayUniforms = {}, blitAddUniforms = {}, brightPassUniforms = {}, blurUniforms = {}, compositeUniforms = {};

    let sharedVAO = null, auxVAO = null, quadVAO = null, ringVAO = null, ambientDustVAO = null;
    let posVBO = null, prevPosVBO = null, colVBO = null, sizeVBO = null, seedVBO = null;
    let auxPosVBO = null, auxColVBO = null, quadVBO = null, ringVBO = null, ambientDustOffsetVBO = null, ambientDustSeedVBO = null;
    const AMBIENT_DUST_COUNT = 1024;

    const tmpThresholdPos = new Vector3();
    const tmpThresholdTan = new Vector3();
    const tmpRingColour = [1.0, 1.0, 1.0];
    let ringOpacity = 0.0;
    let fovSpike = 0.0;

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
        if (TS.VS_THRESHOLD_RING && TS.FS_THRESHOLD_RING) {
            ringProg = createProgram(TS.VS_THRESHOLD_RING, TS.FS_THRESHOLD_RING);
        }
        if (TS.VS_AMBIENT_DUST && TS.FS_AMBIENT_DUST) {
            ambientDustProg = createProgram(TS.VS_AMBIENT_DUST, TS.FS_AMBIENT_DUST);
        }
        trailDecayProg = createProgram(TS.VS_POST_QUAD, TS.FS_TRAIL_DECAY);
        blitAddProg = createProgram(TS.VS_POST_QUAD, TS.FS_BLIT_ADD);
        brightPassProg = createProgram(TS.VS_POST_QUAD, TS.FS_BRIGHT_PASS);
        blurProg = createProgram(TS.VS_POST_QUAD, TS.FS_BLUR_9TAP);
        compositeProg = createProgram(TS.VS_POST_QUAD, TS.FS_POST_COMPOSITE);

        if (!pointProg || !compositeProg) return false;

        pointUniforms = getUniforms(pointProg, [
            "uViewProj", "uCamPos", "uViewport", "uDpr", "uTime",
            "uHeroBoost", "uIsLight", "uStreakScale", "uMaxStreakPx", "uTrailGain", "uFogTint",
            "uInside", "uHeroScale", "uWorldGrow"
        ]);
        starUniforms = getUniforms(starProg, [
            "uRes", "uBhScreenCentre", "uBhScale", "uTilt", "uTime", "uIsLight", "uBrightness"
        ]);
        auxUniforms = getUniforms(auxProg, ["uViewProj", "uAuxOpacity", "uIsLight"]);
        kerrUniforms = getUniforms(kerrProg, [
            "uRes", "uBhScreenCentre", "uBhScale", "uSpin", "uTilt", "uTime", "uAuxOpacity", "uIsLight", "uDebugMode"
        ]);
        if (ringProg) {
            ringUniforms = getUniforms(ringProg, [
                "uViewProj", "uRingPos", "uRingNormal", "uRingRadius", "uTime", "uOpacity", "uColour", "uRiftNoise"
            ]);
        }
        if (ambientDustProg) {
            ambientDustUniforms = getUniforms(ambientDustProg, [
                "uViewProj", "uCamPos", "uTravelDir", "uSpeedN", "uInside", "uColour", "uTime", "uDpr", "uViewport"
            ]);
        }
        trailDecayUniforms = getUniforms(trailDecayProg, ["uPrevTex", "uDecay"]);
        blitAddUniforms = getUniforms(blitAddProg, ["uTex"]);
        brightPassUniforms = getUniforms(brightPassProg, ["uSceneTex", "uThreshold"]);
        blurUniforms = getUniforms(blurProg, ["uTex", "uTexelStep"]);
        compositeUniforms = getUniforms(compositeProg, [
            "uSceneTex", "uBloomTex", "uRes", "uTime", "uBloomStrength", "uBloomTint",
            "uVignette", "uGrain", "uCaStrength", "uWarpStrength", "uWarpCentre", "uFogTint",
            "uShockwave", "uShockwaveRadius", "uIsLight", "uDebugMode", "uInside", "uInnerTint"
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

        // 5. Threshold Rift Ring VAO
        ringVAO = gl.createVertexArray();
        gl.bindVertexArray(ringVAO);
        ringVBO = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, ringVBO);
        const ringVerts = new Float32Array([
            -1.25, -1.25,  1.25, -1.25, -1.25,  1.25,
            -1.25,  1.25,  1.25, -1.25,  1.25,  1.25
        ]);
        gl.bufferData(gl.ARRAY_BUFFER, ringVerts, gl.STATIC_DRAW);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
        gl.bindVertexArray(null);

        // 6. Volumetric Interior Ambient Dust VAO (pooled field in local camera volume)
        if (ambientDustProg) {
            ambientDustVAO = gl.createVertexArray();
            gl.bindVertexArray(ambientDustVAO);

            const dustOffsets = new Float32Array(AMBIENT_DUST_COUNT * 3);
            const dustSeeds = new Float32Array(AMBIENT_DUST_COUNT * 2);
            const rnd = mulberry32(1337);
            for (let i = 0; i < AMBIENT_DUST_COUNT; i++) {
                dustOffsets[i * 3 + 0] = (rnd() - 0.5) * 24.0;
                dustOffsets[i * 3 + 1] = (rnd() - 0.5) * 24.0;
                dustOffsets[i * 3 + 2] = (rnd() - 0.5) * 24.0;
                dustSeeds[i * 2 + 0] = rnd();
                dustSeeds[i * 2 + 1] = rnd();
            }

            ambientDustOffsetVBO = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, ambientDustOffsetVBO);
            gl.bufferData(gl.ARRAY_BUFFER, dustOffsets, gl.STATIC_DRAW);
            gl.enableVertexAttribArray(0);
            gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);

            ambientDustSeedVBO = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, ambientDustSeedVBO);
            gl.bufferData(gl.ARRAY_BUFFER, dustSeeds, gl.STATIC_DRAW);
            gl.enableVertexAttribArray(1);
            gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 0, 0);

            gl.bindVertexArray(null);
        }

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

    const insideOrbit = {
        yaw: 0.0,
        pitch: 0.0,
        zoom: 1.0,
        targetYaw: 0.0,
        targetPitch: 0.0,
        targetZoom: 1.0
    };

    let isPointerDragging = false;
    let lastDragX = 0, lastDragY = 0;

    window.addEventListener("pointerdown", (e) => {
        if (e.target && e.target.closest && e.target.closest("a, button, input, .nav, .snap-pager, .card, .pill, .stage-debug-hud")) return;
        isPointerDragging = true;
        lastDragX = e.clientX;
        lastDragY = e.clientY;
    });

    window.addEventListener("pointermove", (e) => {
        ctxState.targetPointerX = ((e.clientX / Math.max(1, width)) - 0.5) * 2.0;
        ctxState.targetPointerY = ((e.clientY / Math.max(1, height)) - 0.5) * 2.0;

        if (isPointerDragging && appMode === "INSIDE") {
            const dx = e.clientX - lastDragX;
            const dy = e.clientY - lastDragY;
            lastDragX = e.clientX;
            lastDragY = e.clientY;
            insideOrbit.targetYaw += dx * 0.005;
            insideOrbit.targetPitch = clamp(insideOrbit.targetPitch - dy * 0.005, -0.65, 0.65);
        }
    }, { passive: true });

    window.addEventListener("pointerup", () => { isPointerDragging = false; });
    window.addEventListener("pointercancel", () => { isPointerDragging = false; });

    window.addEventListener("click", (e) => {
        const ctaBtn = e.target && e.target.closest && e.target.closest(".snap-cta-btn");
        if (ctaBtn) {
            e.preventDefault();
            e.stopPropagation();
            const sec = ctaBtn.closest(".snap-section");
            if (sec && sections) {
                const sIdx = sections.indexOf(sec);
                if (sIdx !== -1) {
                    currentDimIndex = sIdx;
                    currentIndex = sIdx;
                }
            }
            enterSimulation();
            return;
        }

        const backBtn = e.target && e.target.closest && e.target.closest("#sim-back-btn");
        if (backBtn) {
            e.preventDefault();
            e.stopPropagation();
            exitSimulation();
            return;
        }

        const subItem = e.target && e.target.closest && e.target.closest("[data-sim], [data-sim-index], [data-sim-id], [data-locale], [data-locale-index], [data-locale-id], a[href*='/']");
        if (subItem) {
            const simVal = subItem.dataset.simIndex || subItem.dataset.simId || subItem.dataset.sim ||
                           subItem.dataset.localeIndex || subItem.dataset.localeId || subItem.dataset.locale;
            if (simVal !== undefined) {
                e.preventDefault();
                goToSim(simVal);
                return;
            }
            const href = subItem.getAttribute("href");
            if (href && href.startsWith("#") && href.includes("/")) {
                const parsed = parseHash(href);
                if (parsed) {
                    e.preventDefault();
                    if (parsed.dimIndex !== currentDimIndex) {
                        goToDimension(parsed.dimIndex, parsed.simIndex, parsed.inside);
                    } else if (parsed.inside && appMode !== "INSIDE") {
                        if (parsed.simIndex !== currentSimIndex) goToSim(parsed.simIndex);
                        enterSimulation();
                    } else {
                        goToSim(parsed.simIndex);
                    }
                    return;
                }
            }
        }
        if (e.target && e.target.closest && e.target.closest("a, button, input, .nav, .snap-pager, .card, .pill, .stage-debug-hud")) return;
        if (appMode === "INSIDE") {
            postState.shockwave = 0.02;
            postState.shockwaveRadius = 0.0;
        }
        const activeForm = formations[currentIndex];
        if (activeForm && typeof activeForm.onClick === "function") {
            activeForm.onClick(e, ctxState);
        }
    }, { capture: true });

    window.addEventListener("keydown", (e) => {
        if (e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
        if (e.key === "ArrowRight") {
            e.preventDefault();
            stepSim(1);
            return;
        } else if (e.key === "ArrowLeft") {
            e.preventDefault();
            stepSim(-1);
            return;
        } else if (e.key === "Escape" && appMode === "INSIDE") {
            e.preventDefault();
            exitSimulation();
            return;
        }
        const activeForm = formations[currentIndex];
        if (activeForm && typeof activeForm.onKeyDown === "function") {
            activeForm.onKeyDown(e, ctxState);
        }
    });

    /* ---------- Section & Formation State ---------- */
    let sections = [];
    let formations = [];
    let currentIndex = 0;

    /* ---------- Navigation State Machine (Inter & Intra) ---------- */
    // States: "IDLE" | "INTRA_HOP" | "INTER_FLIGHT" | "ARRIVING"
    let navState = "IDLE";
    let currentDimIndex = 0;
    let currentSimIndex = 0;
    let currentLocaleIndex = 0;
    let appMode = "VIEW"; // "VIEW" | "INSIDE"

    const intraHop = {
        active: false,
        u: 0.0,
        duration: 1.15,
        fromLocaleIndex: 0,
        toLocaleIndex: 0,
        fromSimIndex: 0,
        toSimIndex: 0,
        fromPos: new Vector3(),
        toPos: new Vector3(),
        arc: { p0: new Vector3(), p1: new Vector3(), p2: new Vector3(), p3: new Vector3() },
        exiting: false,
        crossing: false,
        ins0: 0.0,
        insT: 0.0,
        chord: 1.0,
        ph: 0.0,
        scaleAmp: 1.0,
        fovAmp: 10.0,
        vel: new Vector3(),
        bend: new Vector3(),
        bend2: new Vector3(),
        bankSign: 1.0,
        camStartPos: new Vector3(),
        camStartTarget: new Vector3(),
        camEndPos: new Vector3(),
        camEndTarget: new Vector3(),
        queuedLocaleIndex: -1
    };

    /* ---------- Interior ("entering the dimension") State ----------
       Depth layers: OUTER (overview) -> SHELL (membrane) -> INTERIOR (locale).
       `value` is the insideness uniform: 0 = outside, 1 = deep inside. */
    const inside = {
        isInside: false,
        value: 0.0,
        shift: 0.0,          // 0..1 world-scale shift amount (peaks mid-dive)
        localScale: 1.0,     // 1 -> 0.15 -> 1
        heroScale: 1.0,
        worldGrow: 1.0,
        shell: 0.0,
        starBright: 1.0,
        streakMul: 1.0,
        speedN: 0.0,
        tint: [0.5, 0.7, 1.0]
    };
    let pendingEnter = -1;
    let ringRadiusDraw = 3.2;
    let ringNoiseDraw = 1.0;

    // Per-dimension interior camera rig and ambient behaviour.
    // dust: 0 drifting motes, 1 orbital swirl, 2 downward score-flow, 3 lattice slabs, 4 breathing rings
    const INTERIOR = [
        { cx: 3.22, dist: 7.8, lift: 0.4,  side: 0.0,  fov: 9.0,  dust: 0 },   // Introduction (Lorenz)
        { cx: 2.15, dist: 6.8, lift: 0.2,  side: 1.1,  fov: 11.0, dust: 0 },   // Mathematics (Calabi-Yau folds)
        { cx: 2.35, dist: 8.6, lift: 0.7,  side: 0.0,  fov: 10.0, dust: 1 },   // Physics (Kerr disc)
        { cx: 2.15, dist: 6.6, lift: -0.3, side: -0.6, fov: 10.0, dust: 2 },   // Data science (score flow)
        { cx: 2.15, dist: 7.2, lift: 0.1,  side: 0.5,  fov: 8.0,  dust: 3 },   // Quant (lattice layers)
        { cx: 2.15, dist: 7.0, lift: 0.0,  side: 0.0,  fov: 12.0, dust: 4 },   // Computer science (amplitude rings)
        { cx: 1.85, dist: 8.0, lift: 0.3,  side: 0.0,  fov: 9.0,  dust: 0 }    // Contact (three-body)
    ];
    const interiorCfg = (i) => INTERIOR[i] || INTERIOR[0];

    const heroVel = new Vector3();
    const lastHeroPos = new Vector3();
    const formHero = new Vector3();
    const camVel = new Vector3();
    const lastCamPos = new Vector3();
    const poseA = new Vector3();
    const poseB = new Vector3();
    const poseAnchor = new Vector3();
    const diveTan = new Vector3(0, 0, -1);
    const diveTmpTan = new Vector3();
    const diveChasePos = new Vector3();
    const diveChaseTarget = new Vector3();
    const diveBaseCamPos = new Vector3();
    const diveBaseCamTarget = new Vector3();
    const idleVec = new Vector3();

    const easeDive = (u) => {
        // Smoothest ramp-up / cruise / brake, with a small non-zero launch speed so
        // the hero leaves its live velocity instead of starting from a dead stop.
        const sm = u * u * u * (u * (u * 6.0 - 15.0) + 10.0);
        const k = 0.3 * Math.pow(1.0 - u, 4.0);
        return sm * (1.0 - k) + u * k;
    };

    /* ---------- Transition State (Inter-Dimensional) ---------- */
    const trans = {
        active: false,
        phase: "IDLE",
        u: 0.0,
        duration: 2.4,
        fromIndex: 0,
        toIndex: 0,
        interrupted: false,
        dimBlend: 0.0,
        initialBlend: 0.0,
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
        bloomTint: [1.0, 1.0, 1.0],
        fogTint: [0.022, 0.056, 0.145],
        fogDensity: 0.0035,
        shockwave: 0.0,
        shockwaveRadius: 0.0,
        caExtra: 0.0,
        trailDecay: 0.82,
        streakScale: 1.65
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
        updateIntraIndicator(idx, currentLocaleIndex);
    };

    /* ---------- Intra-Dimensional Navigation & Indicator ---------- */
    const getSite = () => (typeof window !== "undefined" && window.SITE ? window.SITE : (typeof SITE !== "undefined" ? SITE : null));
    const getDimensions = () => { const s = getSite(); return (s && s.dimensions) || []; };

    const hexToRgb01 = (hex) => {
        let c = String(hex || "").replace("#", "");
        if (c.length === 3) c = c[0] + c[0] + c[1] + c[1] + c[2] + c[2];
        const num = parseInt(c, 16);
        if (isNaN(num)) return [1.0, 1.0, 1.0];
        return [(num >> 16 & 255) / 255.0, (num >> 8 & 255) / 255.0, (num & 255) / 255.0];
    };

    const parsedProfiles = [];
    const getProfile = (dimIdx) => {
        if (parsedProfiles[dimIdx]) return parsedProfiles[dimIdx];
        const dims = getDimensions();
        const dim = dims[dimIdx];
        const p = (dim && dim.profile) || {};
        const parsed = {
            palette: (p.palette || []).map(hexToRgb01),
            bloomStrength: (p.bloom && typeof p.bloom.strength === "number") ? p.bloom.strength : 0.88,
            bloomThreshold: (p.bloom && typeof p.bloom.threshold === "number") ? p.bloom.threshold : 0.78,
            bloomTint: (p.bloom && Array.isArray(p.bloom.tint)) ? p.bloom.tint.slice() : [1.0, 1.0, 1.0],
            fogColour: (p.fog && Array.isArray(p.fog.colour)) ? p.fog.colour.slice() : [0.022, 0.056, 0.145],
            fogDensity: (p.fog && typeof p.fog.density === "number") ? p.fog.density : 0.0035,
            fov: (typeof p.fov === "number") ? p.fov : 52.0,
            cameraDamping: (typeof p.cameraDamping === "number") ? p.cameraDamping : 0.08,
            heroColour: (p.hero && Array.isArray(p.hero.colour)) ? p.hero.colour.slice() : [0.45, 0.75, 1.0],
            heroSize: (p.hero && typeof p.hero.size === "number") ? p.hero.size : 5.5,
            audio: p.audio || null
        };
        parsedProfiles[dimIdx] = parsed;
        return parsed;
    };

    const ensureIntraIndicator = () => {
        if (typeof document === "undefined") return null;
        let el = document.getElementById("intra-indicator");
        if (!el) {
            el = document.createElement("nav");
            el.id = "intra-indicator";
            el.className = "intra-indicator";
            el.setAttribute("aria-label", "Locales navigation");
            document.body.appendChild(el);
        }
        return el;
    };

    const updateIntraIndicator = (dimIdx, locIdx) => {
        const ind = ensureIntraIndicator();
        if (!ind) return;
        const dims = getDimensions();
        const dim = dims[dimIdx];
        if (!dim || !dim.locales || dim.locales.length <= 1) {
            ind.style.display = "none";
            return;
        }
        ind.style.display = "inline-flex";

        ind.innerHTML = dim.locales.map((loc, idx) => {
            const isActive = idx === locIdx;
            return `<button class="intra-locale-btn${isActive ? " active" : ""}" data-locale-index="${idx}" aria-label="${loc.name}">` +
                   `<span class="intra-dot"></span>` +
                   `<span class="intra-label">${loc.short}</span>` +
                   `</button>`;
        }).join("");

        ind.querySelectorAll(".intra-locale-btn").forEach((btn) => {
            btn.addEventListener("click", (e) => {
                e.preventDefault();
                e.stopPropagation();
                const idx = parseInt(btn.dataset.localeIndex, 10);
                if (!isNaN(idx)) {
                    goToLocale(idx);
                }
            });
        });
    };

    const updateLocaleContent = (dimIdx, locIdx) => {
        const dims = getDimensions();
        const dim = dims[dimIdx];
        if (!dim || !dim.locales || !dim.locales[locIdx]) return;
        const loc = dim.locales[locIdx];
        const sec = sections[dimIdx];
        if (!sec || !loc.content) return;
        const tag = sec.querySelector(".sim-tag");
        if (tag && loc.content.tag) {
            tag.textContent = loc.content.tag;
        }
    };

    /* World-space rest anchor of a simulation (hero position excluding its idle sway).
       Offset from the dimension anchor by sim.localAnchor (spaced ~25-40 units apart). */
    const anchorWorld = (dimIdx, simIdx, insOrMode, out) => {
        const f = formations[dimIdx];
        const dim = getDimensions()[dimIdx];
        const sims = (dim && (dim.sims || dim.locales)) || [];
        const sim = sims[simIdx] || sims[0];
        const la = (sim && sim.localAnchor) || [0, 0, 0];
        const o = f ? f.origin : { x: 0, y: 0, z: 0 };
        return out.set(o.x + la[0], o.y + la[1], o.z + la[2]);
    };

    const sampleIdle = (dimIdx, simIdx, out) => {
        const dim = getDimensions()[dimIdx];
        const sims = (dim && (dim.sims || dim.locales)) || [];
        const sim = sims[simIdx] || sims[0];
        if (sim && typeof sim.idle === "function") {
            const v = sim.idle(simTime);
            return out.set(v[0], v[1], v[2]);
        }
        return out.set(0, 0, 0);
    };

    /* Idle camera pose as a pure function of (dimension, simulation, mode/insideness, time).
       Hops end on exactly this pose, so there is no discontinuity at arrival. */
    const idlePose = (dimIdx, simIdx, modeOrIns, outPos, outTgt) => {
        const f = formations[dimIdx];
        if (!f) return;
        const dim = getDimensions()[dimIdx];
        const sims = (dim && (dim.sims || dim.locales)) || [];
        const sim = sims[simIdx] || sims[0];
        anchorWorld(dimIdx, simIdx, modeOrIns, poseAnchor);

        const camDist = f.cameraDistance || 13.5;
        const ox = Math.sin(simTime * 0.19) * 0.36;
        const oy = Math.cos(simTime * 0.14) * 0.24;
        const oz = Math.sin(simTime * 0.11) * 0.28;
        const px = ctxState.pointerX, py = ctxState.pointerY;

        const vPx = poseAnchor.x + ox + px * 0.62;
        const vPy = poseAnchor.y + oy - py * 0.48;
        const vPz = poseAnchor.z + camDist + oz;
        const vTx = poseAnchor.x + px * 0.16;
        const vTy = poseAnchor.y - py * 0.16;
        const vTz = poseAnchor.z;

        insideOrbit.yaw += (insideOrbit.targetYaw - insideOrbit.yaw) * 0.12;
        insideOrbit.pitch += (insideOrbit.targetPitch - insideOrbit.pitch) * 0.12;
        insideOrbit.zoom += (insideOrbit.targetZoom - insideOrbit.zoom) * 0.12;

        const imm = (sim && sim.immersiveCamera) || { offset: [0, 0.6, 3.5], target: [0, 0, 0], fov: 64 };
        const io = imm.offset || [0, 0.6, 3.5];
        const it = imm.target || [0, 0, 0];
        const zm = insideOrbit.zoom;

        const cyaw = Math.cos(insideOrbit.yaw), syaw = Math.sin(insideOrbit.yaw);
        const cpitch = Math.cos(insideOrbit.pitch), spitch = Math.sin(insideOrbit.pitch);

        const oxCam = (io[0] * cyaw - io[2] * syaw) * zm;
        const ozCam = (io[0] * syaw + io[2] * cyaw) * zm;
        const oyCam = (io[1] * cpitch - ozCam * spitch) * zm;
        const finalZ = (io[1] * spitch + ozCam * cpitch);

        const iPx = poseAnchor.x + oxCam + ox * 0.2 + px * 0.2;
        const iPy = poseAnchor.y + oyCam + oy * 0.2 - py * 0.15;
        const iPz = poseAnchor.z + finalZ + oz * 0.2;
        const iTx = poseAnchor.x + it[0] + px * 0.1;
        const iTy = poseAnchor.y + it[1] - py * 0.08;
        const iTz = poseAnchor.z + it[2];

        if (modeOrIns === "INSIDE" || modeOrIns === 1.0) {
            outPos.set(iPx, iPy, iPz);
            outTgt.set(iTx, iTy, iTz);
        } else if (modeOrIns === "VIEW" || modeOrIns === 0.0 || modeOrIns === undefined || modeOrIns === null) {
            outPos.set(vPx, vPy, vPz);
            outTgt.set(vTx, vTy, vTz);
        } else {
            const ins = clamp(Number(modeOrIns) || 0.0, 0.0, 1.0);
            outPos.set(vPx + (iPx - vPx) * ins, vPy + (iPy - vPy) * ins, vPz + (iPz - vPz) * ins);
            outTgt.set(vTx + (iTx - vTx) * ins, vTy + (iTy - vTy) * ins, vTz + (iTz - vTz) * ins);
        }
    };

    const updateDiveControls = (h) => {
        const p0 = h.arc.p0, p1 = h.arc.p1, p2 = h.arc.p2, p3 = h.arc.p3;
        const cx = p3.x - p0.x, cy = p3.y - p0.y, cz = p3.z - p0.z;
        const len = Math.max(0.05, Math.hypot(cx, cy, cz));
        h.chord = len;
        p1.set(
            p0.x + cx * 0.33 + h.bend.x * len + h.vel.x * 0.08,
            p0.y + cy * 0.33 + h.bend.y * len + h.vel.y * 0.08,
            p0.z + cz * 0.33 + h.bend.z * len + h.vel.z * 0.08
        );
        p2.set(
            p0.x + cx * 0.70 + h.bend2.x * len,
            p0.y + cy * 0.70 + h.bend2.y * len,
            p0.z + cz * 0.70 + h.bend2.z * len
        );
    };

    /* Intra-dimensional hop between simulations within the active section.
       Detaches hero from live position, flies curved 3D Bezier arc (1.0-1.6s) to destination sim anchor.
       Previous sim recedes (1 -> 0.15), new sim blossoms (0 -> 1 over 1.2s). Active pill highlights immediately. */
    const startIntraHop = (targetSimIdx) => {
        const dims = getDimensions();
        const dim = dims[currentDimIndex];
        const active = formations[currentDimIndex];
        const sims = (dim && (dim.sims || dim.locales)) || [];
        if (!dim || sims.length === 0 || !active) return;
        const target = clamp(targetSimIdx | 0, 0, sims.length - 1);
        if (target === currentSimIndex && !intraHop.active) return;

        const h = intraHop;
        const reduced = isReducedMotion();

        h.fromSimIndex = currentSimIndex;
        h.toSimIndex = target;
        currentSimIndex = target;
        currentLocaleIndex = target;
        h.isDive = false;
        h.presetApplied = false;

        // Exact live start state: hero position and velocity
        h.fromPos.set(positions[0], positions[1], positions[2]);
        h.vel.copy(heroVel);
        const vl = h.vel.length();
        if (vl > 6.0) h.vel.multiplyScalar(6.0 / vl);

        anchorWorld(currentDimIndex, h.toSimIndex, appMode, h.toPos);

        const cx = h.toPos.x - h.fromPos.x, cy = h.toPos.y - h.fromPos.y, cz = h.toPos.z - h.fromPos.z;
        const len = Math.max(0.05, Math.hypot(cx, cy, cz));
        h.bankSign = (target % 2 === 0) ? 1.0 : -1.0;

        const sx = cz / len, sz = -cx / len;
        const sl = Math.max(1e-3, Math.hypot(sx, sz));
        const bs = 0.22 * h.bankSign;
        h.bend.set((sx / sl) * bs, 0.12, (sz / sl) * bs);
        h.bend2.set((sx / sl) * bs * 0.8, 0.08, (sz / sl) * bs * 0.8);
        h.ph = h.toSimIndex * 1.7 + simTime * 0.37;

        h.arc.p0.copy(h.fromPos);
        h.arc.p3.copy(h.toPos);
        updateDiveControls(h);

        if (h.vel.length() > 0.05) diveTan.copy(h.vel).normalize();
        else diveTan.set(cx / len, cy / len, cz / len);

        h.camStartPos.copy(camera.position);
        h.camStartTarget.copy(camera.target);

        // 1.0 - 1.6s duration; 0.4s for reduced motion; 1.6s if already inside
        h.duration = reduced ? 0.4 : (appMode === "INSIDE" ? 1.6 : 1.25);
        h.u = 0.0;
        h.active = true;
        navState = "INTRA_HOP";

        // Active pill highlights immediately at departure!
        updateIntraIndicator(currentDimIndex, currentSimIndex);
        updateLocaleContent(currentDimIndex, currentSimIndex);
        if (appMode === "INSIDE") updateInsideHud(currentDimIndex, currentSimIndex);
        updateUrlHash(currentDimIndex, currentSimIndex);
    };

    const goToSim = (simIdx) => {
        const dims = getDimensions();
        const dim = dims[currentDimIndex];
        const sims = (dim && (dim.sims || dim.locales)) || [];
        if (!dim || sims.length === 0) return;
        let target = 0;
        if (typeof simIdx === "string") {
            const clean = simIdx.toLowerCase().trim();
            const idx = sims.findIndex(s =>
                (s.id && s.id.toLowerCase() === clean) ||
                (s.short && s.short.toLowerCase() === clean) ||
                (s.label && s.label.toLowerCase() === clean) ||
                (s.name && s.name.toLowerCase() === clean)
            );
            target = idx !== -1 ? idx : (parseInt(clean, 10) || 0);
        } else {
            target = clamp(simIdx | 0, 0, sims.length - 1);
        }
        target = clamp(target, 0, sims.length - 1);

        if (trans.active) {
            currentSimIndex = target;
            currentLocaleIndex = target;
            return;
        }

        if (intraHop.active) {
            if (target === intraHop.toSimIndex) return;
            if (intraHop.u < 0.12) {
                intraHop.queuedSimIndex = target;
                intraHop.queuedLocaleIndex = target;
                return;
            }
            startIntraHop(target); // retarget from the live state mid-flight
            return;
        }

        if (target === currentSimIndex) return;
        startIntraHop(target);
    };

    const goToLocale = goToSim;

    const stepSim = (delta) => {
        const dims = getDimensions();
        const dim = dims[currentDimIndex];
        const sims = (dim && (dim.sims || dim.locales)) || [];
        if (!dim || sims.length <= 1) return;
        const base = intraHop.active ? intraHop.toSimIndex : currentSimIndex;
        const target = clamp(base + delta, 0, sims.length - 1);
        if (target !== base) {
            goToSim(target);
        }
    };

    const stepLocale = stepSim;

    const ensureInsideHud = () => {
        if (typeof document === "undefined") return null;
        let hud = document.getElementById("sim-inside-hud");
        if (!hud) {
            hud = document.createElement("div");
            hud.id = "sim-inside-hud";
            hud.className = "sim-inside-hud";
            hud.setAttribute("aria-label", "Simulation View HUD");
            hud.innerHTML = `
                <button id="sim-back-btn" class="sim-back-btn glass" aria-label="Exit simulation (Esc)">
                    <span class="arr">←</span> <span>Back</span>
                </button>
                <div class="sim-hud-meta">
                    <span class="sim-hud-name"></span>
                    <span class="sim-hud-params"></span>
                </div>
            `;
            document.body.appendChild(hud);
            const btn = hud.querySelector("#sim-back-btn");
            if (btn) {
                btn.addEventListener("click", (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    exitSimulation();
                });
            }
        }
        return hud;
    };

    const updateInsideHud = (dimIdx, simIdx) => {
        const hud = ensureInsideHud();
        if (!hud) return;
        const dims = getDimensions();
        const dim = dims[dimIdx];
        const sims = (dim && (dim.sims || dim.locales)) || [];
        const sim = sims[simIdx] || sims[0];
        if (!sim) return;

        const nameEl = hud.querySelector(".sim-hud-name");
        if (nameEl) nameEl.textContent = `${dim.name} · ${sim.label || sim.short}`;

        const paramsEl = hud.querySelector(".sim-hud-params");
        if (paramsEl && sim.content && sim.content.tag) {
            paramsEl.textContent = sim.content.tag;
        }
    };

    const enterSimulation = () => {
        if (trans.active) return;
        if (appMode === "INSIDE" && !intraHop.active) return;

        const dims = getDimensions();
        const dim = dims[currentDimIndex];
        const sims = (dim && (dim.sims || dim.locales)) || [];
        const sim = sims[currentSimIndex] || sims[0];
        if (!sim) return;

        const h = intraHop;
        const reduced = isReducedMotion();

        h.isDive = true;
        h.exiting = false;
        h.fromSimIndex = currentSimIndex;
        h.toSimIndex = currentSimIndex;
        h.fromPos.set(positions[0], positions[1], positions[2]);
        h.vel.copy(heroVel);

        anchorWorld(currentDimIndex, currentSimIndex, "INSIDE", h.toPos);

        const cx = h.toPos.x - h.fromPos.x, cy = h.toPos.y - h.fromPos.y, cz = h.toPos.z - h.fromPos.z;
        const len = Math.max(0.05, Math.hypot(cx, cy, cz));
        h.bankSign = 1.0;

        h.bend.set(0.0, 0.15, 0.0);
        h.bend2.set(0.0, 0.08, 0.0);
        h.ph = simTime * 0.4;

        h.arc.p0.copy(h.fromPos);
        h.arc.p3.copy(h.toPos);
        updateDiveControls(h);

        diveTan.set(cx / len, cy / len, cz / len);
        h.camStartPos.copy(camera.position);
        h.camStartTarget.copy(camera.target);

        h.duration = reduced ? 0.6 : 2.4; // 2.4s forward dive into simulation
        h.u = 0.0;
        h.active = true;
        navState = "INTRA_HOP";
        appMode = "INSIDE";

        if (typeof document !== "undefined") {
            document.body.classList.add("is-inside");
            const sec = sections[currentDimIndex];
            if (sec) sec.classList.add("is-inside");
        }
        updateInsideHud(currentDimIndex, currentSimIndex);
        updateUrlHash(currentDimIndex, currentSimIndex);
    };

    const exitSimulation = () => {
        if (trans.active) return;
        if (appMode !== "INSIDE" && !intraHop.active) return;

        const dims = getDimensions();
        const dim = dims[currentDimIndex];
        const sims = (dim && (dim.sims || dim.locales)) || [];
        const sim = sims[currentSimIndex] || sims[0];
        if (!sim) return;

        const h = intraHop;
        const reduced = isReducedMotion();

        h.isDive = true;
        h.exiting = true;
        h.fromSimIndex = currentSimIndex;
        h.toSimIndex = currentSimIndex;
        h.fromPos.set(positions[0], positions[1], positions[2]);
        h.vel.copy(heroVel);

        anchorWorld(currentDimIndex, currentSimIndex, "VIEW", h.toPos);

        const cx = h.toPos.x - h.fromPos.x, cy = h.toPos.y - h.fromPos.y, cz = h.toPos.z - h.fromPos.z;
        const len = Math.max(0.05, Math.hypot(cx, cy, cz));
        h.bankSign = -1.0;

        h.bend.set(0.0, -0.10, 0.0);
        h.bend2.set(0.0, -0.05, 0.0);
        h.ph = simTime * 0.4;

        h.arc.p0.copy(h.fromPos);
        h.arc.p3.copy(h.toPos);
        updateDiveControls(h);

        diveTan.set(cx / len, cy / len, cz / len);
        h.camStartPos.copy(camera.position);
        h.camStartTarget.copy(camera.target);

        h.duration = reduced ? 0.6 : 1.8; // 1.8s exit back to VIEW
        h.u = 0.0;
        h.active = true;
        navState = "INTRA_HOP";
        appMode = "VIEW";
        insideOrbit.targetYaw = 0.0;
        insideOrbit.targetPitch = 0.0;
        insideOrbit.targetZoom = 1.0;

        if (typeof document !== "undefined") {
            document.body.classList.remove("is-inside");
            const sec = sections[currentDimIndex];
            if (sec) sec.classList.remove("is-inside");
        }
        updateUrlHash(currentDimIndex, currentSimIndex);
    };

    const exitToOverview = exitSimulation;

    const parseHash = (hashStr) => {
        if (!hashStr || typeof hashStr !== "string") return null;
        const clean = hashStr.replace(/^#\/?/, "").trim().toLowerCase();
        if (!clean) return null;
        const parts = clean.split("/");
        const dimPart = parts[0];
        const simPart = parts[1] || null;
        const insidePart = parts[2] || (parts[1] === "inside" ? "inside" : null);

        const dims = getDimensions();
        let targetDimIdx = -1;
        let targetSimIdx = 0;

        for (let i = 0; i < dims.length; i++) {
            const d = dims[i];
            const dSlug = (d.slug || "").toLowerCase();
            const dId = (d.id || "").toLowerCase();
            const dIdTrimmed = dId.replace(/^domain-/, "");
            if (dSlug === dimPart || dId === dimPart || dIdTrimmed === dimPart) {
                targetDimIdx = i;
                break;
            }
        }

        if (targetDimIdx === -1 && typeof document !== "undefined") {
            const sec = document.querySelector("#" + dimPart) || document.querySelector("#domain-" + dimPart);
            if (sec && sections) {
                targetDimIdx = sections.indexOf(sec);
            }
        }

        if (targetDimIdx === -1) return null;

        const targetDim = dims[targetDimIdx];
        let foundSim = false;
        const sims = (targetDim && (targetDim.sims || targetDim.locales)) || [];
        if (simPart && simPart !== "inside" && sims.length > 0) {
            for (let j = 0; j < sims.length; j++) {
                const s = sims[j];
                const sId = (s.id || "").toLowerCase();
                const sLabel = (s.label || s.name || "").toLowerCase();
                const sShort = (s.short || "").toLowerCase();
                if (sId === simPart || sLabel === simPart || sShort === simPart) {
                    targetSimIdx = j;
                    foundSim = true;
                    break;
                }
            }
        }

        const isInside = insidePart === "inside" || parts[1] === "inside";
        return {
            dimIndex: targetDimIdx,
            simIndex: targetSimIdx,
            localeIndex: targetSimIdx,
            inside: isInside
        };
    };

    let isHandlingHistoryEvent = false;
    const updateUrlHash = (dimIdx, simIdx, replace = false) => {
        if (isHandlingHistoryEvent) return;
        if (typeof window === "undefined" || !window.history) return;
        const dims = getDimensions();
        const dim = dims[dimIdx];
        if (!dim) return;
        const sims = dim.sims || dim.locales || [];
        const sim = (simIdx !== null && simIdx !== undefined && sims[simIdx]) ? sims[simIdx] : null;
        let hash = `#${dim.slug}`;
        if (sim) {
            hash += `/${sim.id}`;
            if (appMode === "INSIDE") hash += `/inside`;
        } else if (appMode === "INSIDE") {
            hash += `/inside`;
        }
        if (window.location.hash !== hash) {
            if (replace) {
                window.history.replaceState(null, "", hash);
            } else {
                window.history.pushState(null, "", hash);
            }
        }
    };

    const goToDimension = (targetIdx, targetLocaleIdx = 0, enterInside = false) => {
        const maxIdx = Math.max(0, formations.length - 1);
        const clampedTarget = clamp(targetIdx | 0, 0, maxIdx);
        if (clampedTarget === currentDimIndex && !trans.active) {
            if (targetLocaleIdx !== currentLocaleIndex) {
                goToLocale(targetLocaleIdx);
            }
            return;
        }
        currentLocaleIndex = targetLocaleIdx | 0;
        startTransition(clampedTarget);
        pendingEnter = enterInside ? currentLocaleIndex : -1;
        updateUrlHash(clampedTarget, enterInside ? currentLocaleIndex : null);
    };

    const getNavState = () => ({
        state: navState,
        dimensionIndex: currentDimIndex,
        dimIndex: currentDimIndex,
        simIndex: currentSimIndex,
        localeIndex: currentSimIndex,
        mode: appMode,
        dimBlend: trans.dimBlend !== undefined ? trans.dimBlend : 0.0,
        flightProgress: trans.active ? trans.u : (intraHop.active ? intraHop.u : 0.0),
        isTransitioning: trans.active || intraHop.active,
        simTime: simTime
    });

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
        if (intraHop.active) {
            intraHop.active = false;
            intraHop.queuedLocaleIndex = -1;
        }
        inside.isInside = false; // insideness then decays smoothly while crossing dimensions
        pendingEnter = -1;

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

        if (wasMidFlight) {
            // Continuing or reversing: blend smoothly from live value without a pop
            trans.initialBlend = (clampedTarget === trans.fromIndex) ? clamp(1.0 - trans.dimBlend, 0.0, 1.0) : trans.dimBlend;
            trans.fromIndex = trans.toIndex;
        } else {
            trans.initialBlend = 0.0;
            trans.dimBlend = 0.0;
            trans.fromIndex = currentIndex;
        }
        trans.toIndex = clampedTarget;
        trans.interrupted = wasMidFlight;
        trans.u = 0.0;
        trans.duration = isReducedMotion() ? 0.80 : (jumpSpan > 1 ? 2.65 : 2.40);
        trans.active = true;
        trans.phase = "DETACH";
        navState = "INTER_FLIGHT";
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
        if (appMode === "INSIDE") {
            e.preventDefault();
            insideOrbit.targetZoom = clamp(insideOrbit.targetZoom + e.deltaY * 0.002, 0.6, 2.0);
            return;
        }
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
        if (Math.abs(dx) > Math.abs(dy) * 1.2) {
            if (!touchConsumed && Math.abs(dx) >= 38) {
                touchConsumed = true;
                e.preventDefault();
                stepLocale(Math.sign(dx));
            }
            return;
        }
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
        let startLocIdx = 0;
        let startInside = false;
        if (typeof location !== "undefined" && location.hash) {
            const parsed = parseHash(location.hash);
            if (parsed) {
                startIdx = parsed.dimIndex;
                startLocIdx = parsed.localeIndex;
                startInside = !!parsed.inside;
            } else {
                const targetSec = document.querySelector(location.hash);
                const found = sections.indexOf(targetSec);
                if (found !== -1) startIdx = found;
            }
        }
        currentIndex = startIdx;
        currentDimIndex = currentIndex;
        currentLocaleIndex = startLocIdx;
        // Deep link #dimension/locale restores the "inside" state directly, shell already crossed
        inside.isInside = startInside;
        inside.value = startInside ? 1.0 : 0.0;
        inside.shift = 0.0;
        navState = "IDLE";
        intraHop.active = false;
        intraHop.u = 0.0;
        intraHop.queuedLocaleIndex = -1;
        trans.active = false;
        trans.phase = "IDLE";
        trans.u = 0;
        trans.queuedIndex = -1;
        trans.auxOpacity = 1.0;
        trans.warpStrength = 0.0;

        const active = formations[currentIndex];
        if (active) {
            active.insideness = inside.value;
            active.init(sharedBuffer, ctxState);
            const dims = getDimensions();
            const curDim = dims[currentDimIndex];
            if (curDim && curDim.locales && curDim.locales[currentLocaleIndex]) {
                const loc = curDim.locales[currentLocaleIndex];
                if (loc.simPreset && typeof active.applyPreset === "function") {
                    active.applyPreset(loc.simPreset);
                }
            }
            active.update(0.016, 0.016, sharedBuffer, ctxState);
            prevPositions.set(positions);
            const prof = getProfile(currentIndex);
            camera.fov = prof.fov;
            if (startInside) {
                idlePose(currentIndex, currentLocaleIndex, 1.0, poseA, poseB);
                camera.position.copy(poseA);
                camera.target.copy(poseB);
                anchorWorld(currentIndex, currentLocaleIndex, 1.0, poseAnchor);
                sampleIdle(currentIndex, currentLocaleIndex, idleVec);
                positions[0] = poseAnchor.x + idleVec.x;
                positions[1] = poseAnchor.y + idleVec.y;
                positions[2] = poseAnchor.z + idleVec.z;
                camera.near = 0.05;
                camera.far = 450.0;
            } else {
                const camDist = active.cameraDistance || 13.5;
                camera.position.set(active.origin.x, active.origin.y, active.origin.z + camDist);
                camera.target.copy(active.origin);
                camera.near = 0.1;
                camera.far = 600.0;
            }
            postState.bloomStrength = prof.bloomStrength;
            postState.bloomThreshold = prof.bloomThreshold;
            postState.bloomTint[0] = prof.bloomTint[0];
            postState.bloomTint[1] = prof.bloomTint[1];
            postState.bloomTint[2] = prof.bloomTint[2];
            postState.fogTint[0] = prof.fogColour[0];
            postState.fogTint[1] = prof.fogColour[1];
            postState.fogTint[2] = prof.fogColour[2];
            postState.fogDensity = prof.fogDensity;
            postState.trailDecay = active.trailDecay || 0.68;
            postState.streakScale = active.streakScale || 1.25;
            colours[0] = prof.heroColour[0];
            colours[1] = prof.heroColour[1];
            colours[2] = prof.heroColour[2];
            sizes[0] = prof.heroSize;
        }
        trailNeedsReset = true;
        applyDomSectionVisibility(currentIndex, currentIndex, 1.0, false);
        updateThemeAndDots(currentIndex);
        updateIntraIndicator(currentDimIndex, currentLocaleIndex);
        updateLocaleContent(currentDimIndex, currentLocaleIndex);
        if (location.hash) updateUrlHash(currentDimIndex, startInside ? currentLocaleIndex : null, true);
    };

    refreshSections();

    if (typeof window !== "undefined") {
        const handleHashOrHistory = () => {
            const parsed = parseHash(window.location.hash);
            if (parsed) {
                isHandlingHistoryEvent = true;
                try {
                    if (parsed.dimIndex !== currentDimIndex) {
                        goToDimension(parsed.dimIndex, parsed.localeIndex, parsed.inside);
                    } else if (parsed.inside) {
                        goToLocale(parsed.localeIndex);
                    } else {
                        exitToOverview();
                    }
                } finally {
                    isHandlingHistoryEvent = false;
                }
            }
        };
        window.addEventListener("popstate", handleHashOrHistory);
        window.addEventListener("hashchange", handleHashOrHistory);
    }

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
    let lastFrameDt = 0.016;
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
                    <span>DIMENSION TELEMETRY</span>
                    <span id="dbg-fps-tag" style="color:#8af;">60 FPS</span>
                </div>
                <div style="margin-bottom:8px;padding:6px 8px;background:rgba(255,255,255,0.04);border-radius:6px;border:1px solid rgba(255,255,255,0.08);">
                    <div style="display:flex;justify-content:space-between;margin-bottom:4px;font-size:10px;color:#8aa2c2;">
                        <span>Flight Scrubber:</span>
                        <span id="dbg-u-val" style="color:#fff;font-family:monospace;">0.000</span>
                    </div>
                    <input id="dbg-scrubber" type="range" min="0" max="1" step="0.002" value="0" style="width:100%;cursor:pointer;">
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

            const scrubber = debugEl.querySelector("#dbg-scrubber");
            if (scrubber) {
                scrubber.addEventListener("input", (e) => {
                    const val = parseFloat(e.target.value);
                    if (trans.active) {
                        trans.u = val;
                    } else if (intraHop.active) {
                        intraHop.u = val;
                    }
                });
            }

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

        const liveVelX = positions[0] - prevPositions[0];
        const liveVelY = positions[1] - prevPositions[1];
        const liveVelZ = positions[2] - prevPositions[2];
        const heroSpeed = (lastFrameDt > 1e-4) ? (Math.hypot(liveVelX, liveVelY, liveVelZ) / lastFrameDt) : 0.0;
        const flightU = trans.active ? trans.u : (intraHop.active ? intraHop.u : 0.0);
        const curBlend = trans.active ? trans.dimBlend : 0.0;
        const dims = getDimensions();
        const dimSlug = (dims[currentDimIndex] && dims[currentDimIndex].slug) || "intro";
        const locId = (dims[currentDimIndex] && dims[currentDimIndex].locales && dims[currentDimIndex].locales[currentLocaleIndex])
            ? dims[currentDimIndex].locales[currentLocaleIndex].id
            : "0";

        const scrubber = debugEl.querySelector("#dbg-scrubber");
        const uValEl = debugEl.querySelector("#dbg-u-val");
        if (scrubber && !scrubber.matches(":active")) {
            scrubber.value = flightU;
        }
        if (uValEl) {
            uValEl.textContent = `${flightU.toFixed(3)} (${(flightU * 100).toFixed(1)}%)`;
        }

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
                `state      : ${navState}\n` +
                `dimIndex   : #${currentDimIndex} (${dimSlug})\n` +
                `localeIndex: #${currentLocaleIndex} (${locId})\n` +
                `dimBlend   : ${curBlend.toFixed(3)}\n` +
                `flight u   : ${flightU.toFixed(3)}\n` +
                `speed      : ${heroSpeed.toFixed(2)} u/s\n` +
                `FOV        : ${camera.fov.toFixed(1)}°\n` +
                `formation  : ${formName}\n` +
                `inclination: ${curInc}\n` +
                `spin a     : ${curSpin}\n` +
                `particles  : ${sharedBuffer.count} (reallocs: ${bufferReallocations})\n` +
                `hero #0    : (${hx}, ${hy}, ${hz})`;
        }
    };

    /* ---------- Interior frame logic ---------- */
    let diveBoost = 0.0;

    const innerTint = (dimIdx, out) => {
        const p = getProfile(dimIdx);
        const c = p.palette[1] || p.palette[0] || p.heroColour;
        out[0] = c[0] * 0.7 + 0.3;
        out[1] = c[1] * 0.7 + 0.3;
        out[2] = c[2] * 0.7 + 0.3;
    };

    const finishDive = (curProf) => {
        const h = intraHop;
        h.active = false;
        navState = "IDLE";
        const dims = getDimensions();
        const dim = dims[currentDimIndex];
        const sims = (dim && (dim.sims || dim.locales)) || [];
        const curSim = sims[currentSimIndex] || sims[0];

        if (h.isDive) {
            inside.value = h.insT;
            inside.isInside = !h.exiting;
            appMode = h.exiting ? "VIEW" : "INSIDE";
        }
        inside.shift = 0.0;
        inside.localScale = 1.0;
        inside.heroScale = 1.0;
        inside.worldGrow = 1.0;
        inside.shell = 0.0;
        inside.starBright = 1.0;
        postState.shockwave = 0.0;
        postState.shockwaveRadius = 0.0;

        camera.fov = (appMode === "INSIDE" && curSim && curSim.immersiveCamera) ? curSim.immersiveCamera.fov : curProf.fov;
        camera.up.set(0, 1, 0);
        camera.near = (appMode === "INSIDE") ? 0.05 : 0.1;
        camera.far = (appMode === "INSIDE") ? 450.0 : 600.0;

        const active = formations[currentDimIndex];
        if (active) {
            active.setIntensity(1.0);
            active.setReveal(1.0);
        }

        const nextTarget = h.queuedSimIndex !== -1 ? h.queuedSimIndex : h.queuedLocaleIndex;
        h.queuedSimIndex = -1;
        h.queuedLocaleIndex = -1;
        if (nextTarget !== -1 && nextTarget !== currentSimIndex) {
            startIntraHop(nextTarget);
        }
    };

    const diveFrame = (curProf, dt) => {
        const h = intraHop;
        const u = h.u;
        const hu = smoothstep(0.0, 1.0, u);
        const reduced = isReducedMotion();
        const dimIdx = currentDimIndex;
        const active = formations[dimIdx];
        const dim = getDimensions()[dimIdx];
        const sims = (dim && (dim.sims || dim.locales)) || [];
        const destSim = sims[h.toSimIndex] || sims[0];

        if (!h.isDive) {
            /* ===== INTRA-DIMENSIONAL HOP (between simulations within active section) ===== */
            anchorWorld(dimIdx, h.toSimIndex, appMode, h.arc.p3);
            updateDiveControls(h);
            evalBezier3D(h.arc.p0, h.arc.p1, h.arc.p2, h.arc.p3, hu, tmpHeroPos);
            evalBezierTangent3D(h.arc.p0, h.arc.p1, h.arc.p2, h.arc.p3, hu, diveTmpTan);

            const tk = 1.0 - Math.exp(-8.0 * dt);
            diveTan.x += (diveTmpTan.x - diveTan.x) * tk;
            diveTan.y += (diveTmpTan.y - diveTan.y) * tk;
            diveTan.z += (diveTmpTan.z - diveTan.z) * tk;
            diveTan.normalize();

            // Blend into destination idle motion near landing
            if (destSim && typeof destSim.idle === "function") {
                const idl = destSim.idle(simTime);
                const blendW = smoothstep(0.70, 1.0, u);
                tmpHeroPos.x += idl[0] * blendW;
                tmpHeroPos.y += idl[1] * blendW;
                tmpHeroPos.z += idl[2] * blendW;
            }

            positions[0] = tmpHeroPos.x;
            positions[1] = tmpHeroPos.y;
            positions[2] = tmpHeroPos.z;

            // Previous sim recedes (1 -> 0.15), new sim blossoms outward from landing point (0 -> 1 over 1.2s)
            if (active) {
                if (u < 0.45) {
                    active.setIntensity(1.0 - 0.85 * (u / 0.45));
                } else {
                    if (!h.presetApplied) {
                        if (destSim && destSim.simPreset && typeof active.applyPreset === "function") {
                            active.applyPreset(destSim.simPreset);
                        }
                        if (destSim && destSim.localAnchor && dim && dim.anchor) {
                            active.origin.set(
                                dim.anchor[0] + destSim.localAnchor[0],
                                dim.anchor[1] + destSim.localAnchor[1],
                                dim.anchor[2] + destSim.localAnchor[2]
                            );
                        }
                        h.presetApplied = true;
                    }
                    const revProgress = smoothstep(0.45, 1.0, u);
                    active.setReveal(revProgress);
                    active.setIntensity(0.15 + 0.85 * smoothstep(0.75, 1.0, u));
                }
            }

            // No threshold ring, no shockwave ripple, background starfield identical
            inside.shell = 0.0;
            inside.starBright = 1.0;
            postState.shockwave = 0.0;
            postState.shockwaveRadius = 0.0;
            diveBoost = 0.0;

            // Tangent-frame chase camera
            idlePose(dimIdx, h.toSimIndex, appMode, poseA, poseB);
            diveBaseCamPos.lerpVectors(h.camStartPos, poseA, hu);
            diveBaseCamTarget.lerpVectors(h.camStartTarget, poseB, hu);

            if (!reduced) {
                const chaseDist = (appMode === "INSIDE" ? 3.2 : 9.0) + (1.0 - hu) * 2.5;
                diveChasePos.set(
                    tmpHeroPos.x - diveTan.x * chaseDist,
                    tmpHeroPos.y - diveTan.y * chaseDist * 0.7 + (appMode === "INSIDE" ? 0.3 : 0.8),
                    tmpHeroPos.z - diveTan.z * chaseDist
                );
                diveChaseTarget.set(
                    tmpHeroPos.x + diveTan.x * 2.0,
                    tmpHeroPos.y + diveTan.y * 1.0,
                    tmpHeroPos.z + diveTan.z * 2.0
                );
                const cruiseW = Math.sin(Math.PI * u) * 0.65;
                camera.position.lerpVectors(diveBaseCamPos, diveChasePos, cruiseW);
                camera.target.lerpVectors(diveBaseCamTarget, diveChaseTarget, cruiseW * 0.8);

                const bankAngle = h.bankSign * Math.sin(Math.PI * u) * 0.06;
                camera.up.set(Math.sin(bankAngle), Math.cos(bankAngle), 0.0);

                const fovTarget = (appMode === "INSIDE" && destSim && destSim.immersiveCamera) ? destSim.immersiveCamera.fov : curProf.fov;
                const fovBreath = Math.sin(Math.PI * u) * (appMode === "INSIDE" ? 3.0 : 6.0);
                camera.fov = fovTarget + fovBreath;
            } else {
                camera.position.copy(diveBaseCamPos);
                camera.target.copy(diveBaseCamTarget);
                camera.up.set(0, 1, 0);
                camera.fov = (appMode === "INSIDE" && destSim && destSim.immersiveCamera) ? destSim.immersiveCamera.fov : curProf.fov;
            }
        } else {
            /* ===== DIVE / EXIT (Explore button enters active simulation) ===== */
            if (h.exiting) h.arc.p3.copy(formHero);
            else anchorWorld(dimIdx, h.toSimIndex, 1.0, h.arc.p3);
            updateDiveControls(h);
            evalBezier3D(h.arc.p0, h.arc.p1, h.arc.p2, h.arc.p3, hu, tmpHeroPos);
            evalBezierTangent3D(h.arc.p0, h.arc.p1, h.arc.p2, h.arc.p3, hu, diveTmpTan);
            const tk = 1.0 - Math.exp(-8.0 * dt);
            diveTan.x += (diveTmpTan.x - diveTan.x) * tk;
            diveTan.y += (diveTmpTan.y - diveTan.y) * tk;
            diveTan.z += (diveTmpTan.z - diveTan.z) * tk;
            diveTan.normalize();

            if (!h.exiting && destSim && typeof destSim.idle === "function") {
                const idl = destSim.idle(simTime);
                const w = smoothstep(0.60, 1.0, u);
                tmpHeroPos.x += idl[0] * w;
                tmpHeroPos.y += idl[1] * w;
                tmpHeroPos.z += idl[2] * w;
            }
            positions[0] = tmpHeroPos.x;
            positions[1] = tmpHeroPos.y;
            positions[2] = tmpHeroPos.z;

            idlePose(dimIdx, h.toSimIndex, h.exiting ? (1.0 - hu) : hu, poseA, poseB);
            diveBaseCamPos.lerpVectors(h.camStartPos, poseA, hu);
            diveBaseCamTarget.lerpVectors(h.camStartTarget, poseB, hu);

            if (!reduced) {
                const chaseDist = (h.exiting ? 7.5 : 4.5) + (1.0 - hu) * 3.0;
                diveChasePos.set(
                    tmpHeroPos.x - diveTan.x * chaseDist,
                    tmpHeroPos.y - diveTan.y * chaseDist * 0.7 + 0.6,
                    tmpHeroPos.z - diveTan.z * chaseDist
                );
                diveChaseTarget.set(
                    tmpHeroPos.x + diveTan.x * 2.5,
                    tmpHeroPos.y + diveTan.y * 1.0,
                    tmpHeroPos.z + diveTan.z * 2.5
                );
                const cruiseW = Math.sin(Math.PI * u) * 0.70;
                camera.position.lerpVectors(diveBaseCamPos, diveChasePos, cruiseW);
                camera.target.lerpVectors(diveBaseCamTarget, diveChaseTarget, cruiseW * 0.85);

                const bankAngle = h.bankSign * Math.sin(Math.PI * u) * 0.08;
                camera.up.set(Math.sin(bankAngle), Math.cos(bankAngle), 0.0);

                const baseFov = h.exiting ? (curProf.fov) : ((destSim.immersiveCamera && destSim.immersiveCamera.fov) || 64.0);
                const fovBoost = Math.sin(Math.PI * u) * 10.0;
                camera.fov = baseFov + fovBoost;
            } else {
                camera.position.copy(diveBaseCamPos);
                camera.target.copy(diveBaseCamTarget);
                camera.up.set(0, 1, 0);
                camera.fov = curProf.fov;
            }
        }

        if (u >= 1.0) finishDive(curProf);
    };

    const idleFrame = (curProf, dt, pLerp) => {
        const isInside = (appMode === "INSIDE" || inside.isInside);
        const dims = getDimensions();
        const dim = dims[currentIndex];
        const sims = (dim && (dim.sims || dim.locales)) || [];
        const curSim = sims[currentSimIndex] || sims[0];

        idlePose(currentIndex, currentSimIndex, isInside ? "INSIDE" : "VIEW", poseA, poseB);
        camera.position.copy(poseA);
        camera.target.copy(poseB);
        camera.up.set(0, 1, 0);

        const targetFov = (isInside && curSim && curSim.immersiveCamera) ? curSim.immersiveCamera.fov : curProf.fov;
        camera.fov += (targetFov - camera.fov) * pLerp;
        camera.near = isInside ? 0.05 : 0.1;
        camera.far = isInside ? 450.0 : 600.0;
        inside.shift = 0.0;
        inside.localScale = 1.0;
        inside.heroScale = 1.0;
        inside.worldGrow = 1.0;
        inside.shell = 0.0;
        inside.starBright = 1.0;
        postState.shockwave = 0.0;
        postState.shockwaveRadius = 0.0;
        diveBoost = 0.0;
        if (isInside) {
            // Inside: the hero rests near the sim anchor and eases through its idle sway
            anchorWorld(currentIndex, currentSimIndex, "INSIDE", poseAnchor);
            sampleIdle(currentIndex, currentSimIndex, idleVec);
            positions[0] = poseAnchor.x + idleVec.x;
            positions[1] = poseAnchor.y + idleVec.y;
            positions[2] = poseAnchor.z + idleVec.z;
        }
    };

    const applyHeroLocalPalette = (curProf) => {
        // The dimension's own light becomes the hero's lighting as insideness rises
        const c = curProf.palette[1] || curProf.heroColour;
        const k = 0.6 * inside.value;
        colours[0] = curProf.heroColour[0] * (1.0 - k) + (c[0] * 0.6 + 0.4) * k;
        colours[1] = curProf.heroColour[1] * (1.0 - k) + (c[1] * 0.6 + 0.4) * k;
        colours[2] = curProf.heroColour[2] * (1.0 - k) + (c[2] * 0.6 + 0.4) * k;
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
        lastFrameDt = dt;
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
                ringOpacity = 0.0;
                ringRadiusDraw = 3.2;
                ringNoiseDraw = 1.0;

                // Advance dive progress and insideness BEFORE the formation updates, so its frame matches
                if (intraHop.active) {
                    intraHop.u = clamp(intraHop.u + dt / intraHop.duration, 0.0, 1.0);
                    inside.value = intraHop.ins0 + (intraHop.insT - intraHop.ins0) * smoothstep(0.30, 0.70, intraHop.u);
                }
                active.insideness = inside.value;
                active.update(dt, simTime, sharedBuffer, ctxState);
                formHero.set(positions[0], positions[1], positions[2]);

                const curProf = getProfile(currentIndex);
                const pLerp = clamp(dt * 4.0, 0.02, 0.25);

                if (intraHop.active) {
                    diveFrame(curProf, dt);
                } else {
                    idleFrame(curProf, dt, pLerp);
                }
                if (inside.value > 0.002) applyHeroLocalPalette(curProf);
                innerTint(currentIndex, inside.tint);

                // Smoothly converge post-processing parameters to active section profile
                postState.bloomStrength += (curProf.bloomStrength - postState.bloomStrength) * pLerp;
                postState.bloomThreshold += (curProf.bloomThreshold - postState.bloomThreshold) * pLerp;
                postState.bloomTint[0] += (curProf.bloomTint[0] - postState.bloomTint[0]) * pLerp;
                postState.bloomTint[1] += (curProf.bloomTint[1] - postState.bloomTint[1]) * pLerp;
                postState.bloomTint[2] += (curProf.bloomTint[2] - postState.bloomTint[2]) * pLerp;
                postState.fogTint[0] += (curProf.fogColour[0] - postState.fogTint[0]) * pLerp;
                postState.fogTint[1] += (curProf.fogColour[1] - postState.fogTint[1]) * pLerp;
                postState.fogTint[2] += (curProf.fogColour[2] - postState.fogTint[2]) * pLerp;
                postState.fogDensity += (curProf.fogDensity - postState.fogDensity) * pLerp;
                postState.trailDecay += ((active.trailDecay || 0.68) - postState.trailDecay) * pLerp;
                postState.streakScale += ((active.streakScale || 1.25) - postState.streakScale) * pLerp;

                if (typeof window !== "undefined" && window.SOUND && typeof window.SOUND.setDimensionAmbient === "function") {
                    window.SOUND.setDimensionAmbient(curProf.audio, curProf.audio, 1.0);
                }
            }
            trans.auxOpacity = Math.min(1.0, trans.auxOpacity + dt * 2.5);
            trans.warpStrength = 0.0;
            heroBoost = Math.max(heroBoost, diveBoost);
        } else {
            /* ---------- 5-PHASE TRANSITION ENGINE ---------- */
            trans.u = clamp(trans.u + dt / trans.duration, 0.0, 1.0);
            const u = trans.u;
            trans.phase = getPhaseName(u);

            // The interior fades out smoothly while crossing dimensions (never snaps)
            ringRadiusDraw = 3.2;
            ringNoiseDraw = 1.0;
            inside.value = Math.max(0.0, inside.value - dt / Math.min(0.9, trans.duration * 0.6));
            inside.shift = Math.max(0.0, inside.shift - dt * 3.0);
            inside.shell = 0.0;
            inside.starBright += (1.0 - inside.starBright) * Math.min(1.0, dt * 6.0);
            inside.streakMul += (1.0 - inside.streakMul) * Math.min(1.0, dt * 3.0);
            diveBoost = 0.0;

            const fromProf = getProfile(trans.fromIndex);
            const toProf = getProfile(trans.toIndex);

            // TRANSFORM (50-80%): dimBlend ramps 0 -> 1 smoothly, tracking live value on interrupt/reverse
            const blendFactor = isReducedMotion() ? smootherstep(0.0, 1.0, u) : smoothstep(0.50, 0.80, u);
            trans.dimBlend = clamp(trans.initialBlend + (1.0 - trans.initialBlend) * blendFactor, 0.0, 1.0);
            const dimBlend = trans.dimBlend;

            if (typeof window !== "undefined" && window.SOUND && typeof window.SOUND.setDimensionAmbient === "function") {
                window.SOUND.setDimensionAmbient(fromProf.audio, toProf.audio, dimBlend);
            }

            const fromForm = formations[trans.fromIndex];
            const toForm = formations[trans.toIndex];
            if (fromForm) fromForm.insideness = inside.value;
            if (toForm) toForm.insideness = 0.0;

            // Simulation rule blending: origin sim ramps to 0.15 behind, destination ramps from neutral
            const fromSimIntensity = clamp(1.0 - (1.0 - 0.15) * dimBlend, 0.15, 1.0);
            if (fromForm) {
                if (typeof fromForm.setIntensity === "function") fromForm.setIntensity(fromSimIntensity);
                fromForm.update(dt * fromSimIntensity, simTime, fromScratchBuffer, ctxState);
            }

            if (u >= 0.50 && toForm) {
                const toSimIntensity = clamp(dimBlend, 0.0, 1.0);
                if (typeof toForm.setIntensity === "function") toForm.setIntensity(toSimIntensity);
                if (typeof toForm.setReveal === "function") toForm.setReveal(toSimIntensity);
                toForm.update(dt * Math.max(0.15, toSimIntensity), simTime, nextScratchBuffer, ctxState);
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

            // Hero particle chromatic & size morph driven by dimBlend
            colours[0] = fromProf.heroColour[0] + (toProf.heroColour[0] - fromProf.heroColour[0]) * dimBlend;
            colours[1] = fromProf.heroColour[1] + (toProf.heroColour[1] - fromProf.heroColour[1]) * dimBlend;
            colours[2] = fromProf.heroColour[2] + (toProf.heroColour[2] - fromProf.heroColour[2]) * dimBlend;
            sizes[0] = fromProf.heroSize + (toProf.heroSize - fromProf.heroSize) * dimBlend;

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

            // THRESHOLD ring forms ahead of hero along path tangent around u = 0.55
            if (!reduced && u >= 0.42 && u <= 0.68) {
                ringOpacity = smoothstep(0.42, 0.52, u) * (1.0 - smoothstep(0.58, 0.68, u));
                evalFlightPath(0.55, tmpThresholdPos);
                evalFlightTangent(0.55, tmpThresholdTan);

                tmpRingColour[0] = fromProf.heroColour[0] * (1.0 - dimBlend) + toProf.heroColour[0] * dimBlend;
                tmpRingColour[1] = fromProf.heroColour[1] * (1.0 - dimBlend) + toProf.heroColour[1] * dimBlend;
                tmpRingColour[2] = fromProf.heroColour[2] * (1.0 - dimBlend) + toProf.heroColour[2] * dimBlend;
            } else {
                ringOpacity = 0.0;
            }

            // On crossing (u in [0.52, 0.66]): brief shockwave ripple, short FOV spike, quick chromatic split
            if (!reduced && u >= 0.52 && u <= 0.66) {
                const spike = Math.exp(-Math.pow((u - 0.55) / 0.024, 2.0));
                const shockProg = clamp((u - 0.54) / 0.10, 0.0, 1.0);
                postState.shockwave = (1.0 - shockProg) * 0.042 * smoothstep(0.54, 0.56, u);
                postState.shockwaveRadius = shockProg * 0.72;
                postState.caExtra = 0.016 * spike;
                fovSpike = 4.5 * spike;
            } else {
                postState.shockwave = 0.0;
                postState.shockwaveRadius = 0.0;
                postState.caExtra = 0.0;
                fovSpike = 0.0;
            }

            const baseFov = fromProf.fov + (toProf.fov - fromProf.fov) * dimBlend;

            if (reduced) {
                const cm = smootherstep(0.0, 1.0, u);
                camera.fov = baseFov;
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
                camera.fov = baseFov + 8.5 * breath + fovSpike;
            }

            // DimensionProfile continuous blend driven by dimBlend
            postState.bloomStrength = fromProf.bloomStrength + (toProf.bloomStrength - fromProf.bloomStrength) * dimBlend;
            postState.bloomThreshold = fromProf.bloomThreshold + (toProf.bloomThreshold - fromProf.bloomThreshold) * dimBlend;
            postState.bloomTint[0] = fromProf.bloomTint[0] + (toProf.bloomTint[0] - fromProf.bloomTint[0]) * dimBlend;
            postState.bloomTint[1] = fromProf.bloomTint[1] + (toProf.bloomTint[1] - fromProf.bloomTint[1]) * dimBlend;
            postState.bloomTint[2] = fromProf.bloomTint[2] + (toProf.bloomTint[2] - fromProf.bloomTint[2]) * dimBlend;

            postState.fogTint[0] = fromProf.fogColour[0] + (toProf.fogColour[0] - fromProf.fogColour[0]) * dimBlend;
            postState.fogTint[1] = fromProf.fogColour[1] + (toProf.fogColour[1] - fromProf.fogColour[1]) * dimBlend;
            postState.fogTint[2] = fromProf.fogColour[2] + (toProf.fogColour[2] - fromProf.fogColour[2]) * dimBlend;
            postState.fogDensity = fromProf.fogDensity + (toProf.fogDensity - fromProf.fogDensity) * dimBlend;

            const fD = (fromForm && fromForm.trailDecay) || 0.68;
            const tD = (toForm && toForm.trailDecay) || 0.68;
            postState.trailDecay = (fD + (tD - fD) * dimBlend) * 0.72;

            trans.auxOpacity = smoothstep(0.88, 1.00, u);

            if (u >= 1.0) {
                currentIndex = trans.toIndex;
                currentDimIndex = currentIndex;
                trans.active = false;
                trans.phase = "IDLE";
                navState = "IDLE";
                trans.u = 0.0;
                trans.dimBlend = 0.0;
                trans.initialBlend = 0.0;
                trans.interrupted = false;
                trans.auxOpacity = 1.0;
                trans.warpStrength = 0.0;
                applyDomSectionVisibility(currentIndex, currentIndex, 1.0, false);
                updateThemeAndDots(currentIndex);
                inside.value = 0.0;
                inside.isInside = false;
                inside.shift = 0.0;
                updateIntraIndicator(currentDimIndex, currentLocaleIndex);
                updateLocaleContent(currentDimIndex, currentLocaleIndex);

                const dims = getDimensions();
                const curDim = dims[currentDimIndex];
                if (curDim && curDim.locales && curDim.locales[currentLocaleIndex]) {
                    const destLoc = curDim.locales[currentLocaleIndex];
                    if (destLoc.simPreset && formations[currentDimIndex] && typeof formations[currentDimIndex].applyPreset === "function") {
                        formations[currentDimIndex].applyPreset(destLoc.simPreset);
                    }
                }

                if (trans.queuedIndex !== -1 && trans.queuedIndex !== currentIndex) {
                    const nextQ = trans.queuedIndex;
                    trans.queuedIndex = -1;
                    startTransition(nextQ);
                } else {
                    trans.queuedIndex = -1;
                    if (pendingEnter >= 0) {
                        const pe = pendingEnter;
                        pendingEnter = -1;
                        startIntraHop(pe);
                    }
                }
            }
        }

        // Live hero and camera velocities (smoothed) for hop continuity and speed-driven streaks
        {
            const inv = 1.0 / Math.max(dt, 1e-3);
            heroVel.x += ((positions[0] - lastHeroPos.x) * inv - heroVel.x) * 0.5;
            heroVel.y += ((positions[1] - lastHeroPos.y) * inv - heroVel.y) * 0.5;
            heroVel.z += ((positions[2] - lastHeroPos.z) * inv - heroVel.z) * 0.5;
            lastHeroPos.set(positions[0], positions[1], positions[2]);
            camVel.x += ((camera.position.x - lastCamPos.x) * inv - camVel.x) * 0.35;
            camVel.y += ((camera.position.y - lastCamPos.y) * inv - camVel.y) * 0.35;
            camVel.z += ((camera.position.z - lastCamPos.z) * inv - camVel.z) * 0.35;
            lastCamPos.copy(camera.position);
            inside.speedN += (clamp(camVel.length() / 14.0, 0.0, 1.0) - inside.speedN) * 0.25;
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
        gl.uniform1f(pointUniforms.uInside, inside.value);
        gl.uniform1f(pointUniforms.uHeroScale, inside.heroScale);
        gl.uniform1f(pointUniforms.uWorldGrow, inside.worldGrow);

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
            gl.uniform1f(starUniforms.uBrightness, inside.starBright);
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

        // 2d. Threshold Rift Ring (luminous ring formed ahead of hero during 42% - 68% of inter-dimensional flight)
        if (ringOpacity > 0.005 && ringProg && ringVAO) {
            gl.useProgram(ringProg);
            gl.uniformMatrix4fv(ringUniforms.uViewProj, false, camera.viewProjectionMatrix.elements);
            gl.uniform3f(ringUniforms.uRingPos, tmpThresholdPos.x, tmpThresholdPos.y, tmpThresholdPos.z);
            gl.uniform3f(ringUniforms.uRingNormal, tmpThresholdTan.x, tmpThresholdTan.y, tmpThresholdTan.z);
            gl.uniform1f(ringUniforms.uRingRadius, ringRadiusDraw);
            gl.uniform1f(ringUniforms.uTime, simTime);
            gl.uniform1f(ringUniforms.uOpacity, ringOpacity);
            gl.uniform3f(ringUniforms.uColour, tmpRingColour[0], tmpRingColour[1], tmpRingColour[2]);
            gl.uniform1f(ringUniforms.uRiftNoise, ringNoiseDraw);

            gl.bindVertexArray(ringVAO);
            gl.drawArrays(gl.TRIANGLES, 0, 6);
            gl.bindVertexArray(null);
        }

        // 2e. Composite persistent trailed particle swarm into sceneRT (suppressed during geodesic debugging)
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

        // 2f. Volumetric Interior Ambient Dust (pooled field around camera, denser as insideness rises)
        if (inside.value > 0.005 && ambientDustProg && ambientDustVAO) {
            gl.enable(gl.BLEND);
            if (isLight) {
                gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
            } else {
                gl.blendFunc(gl.ONE, gl.ONE);
            }
            gl.useProgram(ambientDustProg);
            gl.uniformMatrix4fv(ambientDustUniforms.uViewProj, false, camera.viewProjectionMatrix.elements);
            gl.uniform3f(ambientDustUniforms.uCamPos, camera.position.x, camera.position.y, camera.position.z);
            gl.uniform3f(ambientDustUniforms.uTravelDir, diveTan.x, diveTan.y, diveTan.z);
            gl.uniform1f(ambientDustUniforms.uSpeedN, inside.speedN);
            gl.uniform1f(ambientDustUniforms.uInside, inside.value);
            gl.uniform3f(ambientDustUniforms.uColour, inside.tint[0], inside.tint[1], inside.tint[2]);
            gl.uniform1f(ambientDustUniforms.uTime, simTime);
            gl.uniform1f(ambientDustUniforms.uDpr, dpr);
            gl.uniform2f(ambientDustUniforms.uViewport, width, height);

            gl.bindVertexArray(ambientDustVAO);
            gl.drawArrays(gl.POINTS, 0, AMBIENT_DUST_COUNT);
            gl.bindVertexArray(null);
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
        {
            // Insideness shifts the bloom tint towards the dimension's inner palette and deepens the vignette
            const kb = 0.4 * inside.value;
            gl.uniform3f(
                compositeUniforms.uBloomTint,
                postState.bloomTint[0] * (1.0 - kb) + inside.tint[0] * kb,
                postState.bloomTint[1] * (1.0 - kb) + inside.tint[1] * kb,
                postState.bloomTint[2] * (1.0 - kb) + inside.tint[2] * kb
            );
        }
        gl.uniform1f(compositeUniforms.uInside, inside.value);
        gl.uniform3f(compositeUniforms.uInnerTint, inside.tint[0], inside.tint[1], inside.tint[2]);
        gl.uniform1f(compositeUniforms.uVignette, 0.36 + 0.26 * inside.value);
        gl.uniform1f(compositeUniforms.uGrain, 0.020);
        gl.uniform1f(compositeUniforms.uCaStrength, isReducedMotion() ? 0.0 : (0.0018 + postState.caExtra));
        gl.uniform1f(compositeUniforms.uShockwave, isReducedMotion() ? 0.0 : postState.shockwave);
        gl.uniform1f(compositeUniforms.uShockwaveRadius, postState.shockwaveRadius);
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
        get currentDimIndex() { return currentDimIndex; },
        get dimensionIndex() { return currentDimIndex; },
        get currentLocaleIndex() { return currentLocaleIndex; },
        get currentSimIndex() { return currentSimIndex; },
        get simIndex() { return currentSimIndex; },
        get mode() { return appMode; },
        get navState() { return navState; },
        get dimBlend() { return trans.dimBlend || 0.0; },
        get currentFormation() {
            const f = formations[trans.active ? trans.toIndex : currentIndex];
            return f ? f.id : "hub:intro";
        },
        get phase() { return trans.phase; },
        get progress() { return trans.u; },
        get isTransitioning() { return trans.active || intraHop.active; },
        get fps() { return fps; },
        get simTime() { return simTime; },
        get intraHop() { return intraHop; },
        get inside() { return inside; },
        get postState() { return postState; },
        get camVelocity() { return camVel; },
        exitToOverview,
        enterSimulation,
        exitSimulation,
        goToSim,
        stepSim,
        get heroPosition() { return new Vector3(positions[0], positions[1], positions[2]); },
        get formations() { return formations; },
        get trans() { return trans; },
        getNavState,
        goToDimension,
        goToLocale,
        stepLocale,
        refreshSections,
        goToSection: goToDimension,
        triggerStep
    };
}));
