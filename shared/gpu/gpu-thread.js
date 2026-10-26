/* Unified Single-Buffer Particle Engine & 3D Stage Controller (shared/gpu/gpu-thread.js).
   Mounts ONE fixed full-viewport WebGL canvas (#stage-canvas) with ONE THREE.Points and
   ONE shared particle buffer (N = 60k desktop, 20k mobile). Particle i keeps its identity
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
        mulberry32
    } = TM;

    const isMobileDevice = () =>
        window.innerWidth <= 768 || /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent || "");

    const INITIAL_N = isMobileDevice() ? 20000 : 60000;
    const MIN_ADAPTIVE_N = isMobileDevice() ? 10000 : 24000;
    let bufferReallocations = 0;

    /* ---------- Single Shared Particle Buffer (Allocated ONCE, Never Reallocated) ---------- */
    const positions = new Float32Array(INITIAL_N * 3);
    const colours = new Float32Array(INITIAL_N * 3);
    const sizes = new Float32Array(INITIAL_N);
    const seeds = new Float32Array(INITIAL_N * 4);

    // Deterministic per-particle identity seeds (Particle i keeps its identity forever)
    const rand = mulberry32(0x4B573236);
    for (let i = 0; i < INITIAL_N; i++) {
        const i4 = i * 4;
        seeds[i4] = rand();
        seeds[i4 + 1] = rand();
        seeds[i4 + 2] = rand();
        seeds[i4 + 3] = rand();
        sizes[i] = 1.6 + 0.8 * seeds[i4 + 3];
    }

    const sharedBuffer = {
        maxCount: INITIAL_N,
        count: INITIAL_N,
        positions,
        colours,
        sizes,
        seeds,
        get reallocations() { return bufferReallocations; }
    };

    /* ---------- THREE Scene & Points Setup ---------- */
    const scene = new Scene();
    const camera = new PerspectiveCamera(46, window.innerWidth / Math.max(1, window.innerHeight), 0.1, 600);
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new BufferAttribute(positions, 3, true));
    geometry.setAttribute("colour", new BufferAttribute(colours, 3, true));
    geometry.setAttribute("size", new BufferAttribute(sizes, 1, true));
    geometry.setAttribute("seed", new BufferAttribute(seeds, 4, false));
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

    let gl = stageCanvas.getContext("webgl2", {
        alpha: true,
        depth: true,
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

    /* ---------- Shader Compilation & Single Shared VAO/VBO Setup ---------- */
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

    let pointProg = null;
    let pointUniforms = {};
    let sharedVAO = null;
    let posVBO = null, colVBO = null, sizeVBO = null, seedVBO = null;
    let contextLost = false;

    const initGLResources = () => {
        pointProg = createProgram(TS.VS_SHARED_POINTS, TS.FS_SHARED_POINTS);
        if (!pointProg) return false;

        pointUniforms = {
            uViewProj: gl.getUniformLocation(pointProg, "uViewProj"),
            uCamPos: gl.getUniformLocation(pointProg, "uCamPos"),
            uViewport: gl.getUniformLocation(pointProg, "uViewport"),
            uDpr: gl.getUniformLocation(pointProg, "uDpr"),
            uHeroBoost: gl.getUniformLocation(pointProg, "uHeroBoost"),
            uIsLight: gl.getUniformLocation(pointProg, "uIsLight")
        };

        sharedVAO = gl.createVertexArray();
        gl.bindVertexArray(sharedVAO);

        // Location 0: aPosition (vec3, DYNAMIC_DRAW)
        posVBO = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, posVBO);
        gl.bufferData(gl.ARRAY_BUFFER, positions.byteLength, gl.DYNAMIC_DRAW);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, positions);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);

        // Location 1: aColour (vec3, DYNAMIC_DRAW)
        colVBO = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, colVBO);
        gl.bufferData(gl.ARRAY_BUFFER, colours.byteLength, gl.DYNAMIC_DRAW);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, colours);
        gl.enableVertexAttribArray(1);
        gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);

        // Location 2: aSize (float, DYNAMIC_DRAW)
        sizeVBO = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, sizeVBO);
        gl.bufferData(gl.ARRAY_BUFFER, sizes.byteLength, gl.DYNAMIC_DRAW);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, sizes);
        gl.enableVertexAttribArray(2);
        gl.vertexAttribPointer(2, 1, gl.FLOAT, false, 0, 0);

        // Location 3: aSeed (vec4, STATIC_DRAW — immutable particle identity)
        seedVBO = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, seedVBO);
        gl.bufferData(gl.ARRAY_BUFFER, seeds, gl.STATIC_DRAW);
        gl.enableVertexAttribArray(3);
        gl.vertexAttribPointer(3, 4, gl.FLOAT, false, 0, 0);

        gl.bindVertexArray(null);
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

    /* ---------- Pointer & Visibility State ---------- */
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
        if (e.target && e.target.closest && e.target.closest("a, button, input, .nav, .snap-pager, .card, .pill")) return;
        const activeForm = formations[currentIndex];
        if (activeForm && typeof activeForm.onClick === "function") {
            activeForm.onClick(e, ctxState);
        }
    });

    /* ---------- Section & Formation Management ---------- */
    let sections = [];
    let formations = [];
    let currentIndex = 0;

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
        currentIndex = 0;
        const active = formations[currentIndex];
        if (active) {
            active.init(sharedBuffer, ctxState);
            camera.position.set(active.origin.x, active.origin.y, active.origin.z + 13.5);
            camera.target.copy(active.origin);
        }
    };

    refreshSections();

    /* ---------- Adaptive Frame Rate & Render Loop ---------- */
    let lastTime = performance.now();
    let simTime = 0;
    let fps = 60;
    let slowFrames = 0;

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

        // Adaptive particle count N if frame time > 20 ms (never reallocates buffer)
        if (rawDt > 0.021 && sharedBuffer.count > MIN_ADAPTIVE_N) {
            slowFrames++;
            if (slowFrames > 35) {
                sharedBuffer.count = Math.max(MIN_ADAPTIVE_N, Math.floor(sharedBuffer.count * 0.9));
                geometry.setDrawRange(0, sharedBuffer.count);
                slowFrames = 0;
            }
        } else {
            slowFrames = Math.max(0, slowFrames - 1);
        }

        ctxState.isMobile = isMobileDevice();
        ctxState.isLight = document.documentElement.dataset.theme === "light";
        ctxState.pointerX += (ctxState.targetPointerX - ctxState.pointerX) * 0.08;
        ctxState.pointerY += (ctxState.targetPointerY - ctxState.pointerY) * 0.08;

        const active = formations[currentIndex];
        if (active) {
            active.update(dt, simTime, sharedBuffer, ctxState);
            camera.position.set(
                active.origin.x + ctxState.pointerX * 0.55,
                active.origin.y - ctxState.pointerY * 0.45,
                active.origin.z + 13.5
            );
            camera.target.set(
                active.origin.x + ctxState.pointerX * 0.15,
                active.origin.y - ctxState.pointerY * 0.15,
                active.origin.z
            );
        }

        camera.updateMatrices();

        // Render single shared particle buffer on #stage-canvas
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, stageCanvas.width, stageCanvas.height);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

        gl.enable(gl.BLEND);
        if (ctxState.isLight) {
            gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        } else {
            // Additive blending
            gl.blendFunc(gl.ONE, gl.ONE);
        }
        gl.disable(gl.DEPTH_TEST);

        gl.useProgram(pointProg);
        gl.uniformMatrix4fv(pointUniforms.uViewProj, false, camera.viewProjectionMatrix.elements);
        gl.uniform3f(pointUniforms.uCamPos, camera.position.x, camera.position.y, camera.position.z);
        gl.uniform2f(pointUniforms.uViewport, width, height);
        gl.uniform1f(pointUniforms.uDpr, dpr);
        gl.uniform1f(pointUniforms.uHeroBoost, 0.0);
        gl.uniform1f(pointUniforms.uIsLight, ctxState.isLight ? 1.0 : 0.0);

        gl.bindVertexArray(sharedVAO);
        const N = sharedBuffer.count;

        gl.bindBuffer(gl.ARRAY_BUFFER, posVBO);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, positions.subarray(0, N * 3));

        gl.bindBuffer(gl.ARRAY_BUFFER, colVBO);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, colours.subarray(0, N * 3));

        gl.bindBuffer(gl.ARRAY_BUFFER, sizeVBO);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, sizes.subarray(0, N));

        gl.drawArrays(gl.POINTS, 0, N);
        gl.bindVertexArray(null);
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
        get currentFormation() { return formations[currentIndex] ? formations[currentIndex].id : "hub:intro"; },
        get fps() { return fps; },
        get heroPosition() { return new Vector3(positions[0], positions[1], positions[2]); },
        refreshSections,
        goToSection(idx) {
            currentIndex = clamp(idx | 0, 0, Math.max(0, formations.length - 1));
        }
    };
}));
