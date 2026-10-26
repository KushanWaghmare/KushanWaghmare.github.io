/* Unified Single-Buffer Particle Engine & 3D Transition Stage Controller (shared/gpu/gpu-thread.js).
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
        smoothstep,
        smootherstep,
        mulberry32,
        evalBezier3D,
        evalBezierTangent3D,
        computeArcControls,
        evalWaypointSpline,
        curlNoise3D,
        computeSpatialMatching
    } = TM;

    const isMobileDevice = () =>
        window.innerWidth <= 768 || /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent || "");

    const isReducedMotion = () =>
        window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const INITIAL_N = isMobileDevice() ? 20000 : 60000;
    const MIN_ADAPTIVE_N = isMobileDevice() ? 10000 : 24000;
    let bufferReallocations = 0;

    /* ---------- Single Shared Particle Buffer (Allocated ONCE, Never Reallocated) ---------- */
    const positions = new Float32Array(INITIAL_N * 3);
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
    const rankOrderScratch = new Int32Array(INITIAL_N);
    const rankDistScratch = new Float32Array(INITIAL_N);

    // Deterministic per-particle identity seeds (Particle i keeps its identity forever)
    const rand = mulberry32(0x4B573236);
    for (let i = 0; i < INITIAL_N; i++) {
        const i4 = i * 4;
        seeds[i4] = rand();
        seeds[i4 + 1] = rand();
        seeds[i4 + 2] = rand();
        seeds[i4 + 3] = rand();
        sizes[i] = 1.6 + 0.8 * seeds[i4 + 3];
        mortonPerm[i] = i;
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

    const gl = stageCanvas.getContext("webgl2", {
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

    let pointProg = null, auxProg = null, kerrProg = null;
    let pointUniforms = {}, auxUniforms = {}, kerrUniforms = {};
    let sharedVAO = null, auxVAO = null, quadVAO = null;
    let posVBO = null, colVBO = null, sizeVBO = null, seedVBO = null;
    let auxPosVBO = null, auxColVBO = null, quadVBO = null;
    let contextLost = false;

    const initGLResources = () => {
        pointProg = createProgram(TS.VS_SHARED_POINTS, TS.FS_SHARED_POINTS);
        auxProg = createProgram(TS.VS_AUX_SCENE, TS.FS_AUX_SCENE);
        kerrProg = createProgram(TS.VS_KERR_SCENE, TS.FS_KERR_SCENE);
        if (!pointProg) return false;

        pointUniforms = {
            uViewProj: gl.getUniformLocation(pointProg, "uViewProj"),
            uCamPos: gl.getUniformLocation(pointProg, "uCamPos"),
            uViewport: gl.getUniformLocation(pointProg, "uViewport"),
            uDpr: gl.getUniformLocation(pointProg, "uDpr"),
            uHeroBoost: gl.getUniformLocation(pointProg, "uHeroBoost"),
            uIsLight: gl.getUniformLocation(pointProg, "uIsLight")
        };

        if (auxProg) {
            auxUniforms = {
                uViewProj: gl.getUniformLocation(auxProg, "uViewProj"),
                uAuxOpacity: gl.getUniformLocation(auxProg, "uAuxOpacity"),
                uIsLight: gl.getUniformLocation(auxProg, "uIsLight")
            };
        }

        if (kerrProg) {
            kerrUniforms = {
                uRes: gl.getUniformLocation(kerrProg, "uRes"),
                uBhScreenCentre: gl.getUniformLocation(kerrProg, "uBhScreenCentre"),
                uBhScale: gl.getUniformLocation(kerrProg, "uBhScale"),
                uSpin: gl.getUniformLocation(kerrProg, "uSpin"),
                uTilt: gl.getUniformLocation(kerrProg, "uTilt"),
                uTime: gl.getUniformLocation(kerrProg, "uTime"),
                uAuxOpacity: gl.getUniformLocation(kerrProg, "uAuxOpacity"),
                uIsLight: gl.getUniformLocation(kerrProg, "uIsLight")
            };
        }

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

        gl.bindVertexArray(null);

        // Auxiliary same-scene geometry VAO
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

        // Fullscreen billboard quad VAO for Kerr black hole lensing in same scene
        quadVAO = gl.createVertexArray();
        gl.bindVertexArray(quadVAO);
        quadVBO = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, quadVBO);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
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
        if (e.target && e.target.closest && e.target.closest("a, button, input, .nav, .snap-pager, .card, .pill")) return;
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

    /* ---------- 5-Phase Transition State Machine ----------
       Phases:
         IDLE
         DETACH   (0.00 - 0.15)
         COLLAPSE (0.10 - 0.40)
         FLIGHT   (0.30 - 0.80)
         NUCLEATE (0.70 - 1.00)
         HANDOFF  (last ~0.6 s: u in [0.75, 1.00])
    */
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
        auxOpacity: 1.0
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
                // Outgoing section content fades & slides out during DETACH/COLLAPSE (0 - 35%)
                const fadeOut = 1.0 - smoothstep(0.02, 0.32, u);
                alpha = fadeOut;
                shiftY = (1.0 - fadeOut) * (toIdx > fromIdx ? -28.0 : 28.0);
            } else if (i === toIdx) {
                // Arriving section content fades/slides in ONLY during NUCLEATE (70% - 100%), NOT before
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
        // Reveal elements in the target section
        sec.querySelectorAll("[data-reveal], [data-hero]").forEach((el) => el.classList.add("revealed"));
    };

    /**
     * Ranks all particles i in [0, N-1] by Euclidean distance from heroStart
     * so closest particles detach first during COLLAPSE and trail in rank order during FLIGHT.
     */
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
            // Blend normalised distance with deterministic seed jitter so ranks are smoothly distributed in [0, 1]
            const dNorm = rankDistScratch[i] * invMax;
            particleRanks[i] = clamp(0.82 * dNorm + 0.18 * seeds[i * 4 + 2], 0.0, 1.0);
        }
    };

    /**
     * Starts or retargets a transition to targetIdx.
     * If called mid-flight, captures CURRENT live positions (fromPositions = positions)
     * and current Hero #0 position without snapping or restarting.
     */
    const startTransition = (targetIdx) => {
        const maxIdx = Math.max(0, formations.length - 1);
        const clampedTarget = clamp(targetIdx | 0, 0, maxIdx);

        if (!trans.active && clampedTarget === currentIndex) return;

        // If already transitioning toward this exact target, ignore duplicate trigger
        if (trans.active && clampedTarget === trans.toIndex) return;

        const N = sharedBuffer.count;
        const wasMidFlight = trans.active;

        // Capture live current state into fromPositions / fromColours / fromSizes
        fromPositions.set(positions);
        fromColours.set(colours);
        fromSizes.set(sizes);

        // Hero Particle #0 starts at its EXACT live position from the last rendered frame
        trans.heroStart.set(positions[0], positions[1], positions[2]);

        const fromIdx = wasMidFlight ? trans.toIndex : currentIndex;
        const toForm = formations[clampedTarget];
        if (!toForm.initialized) {
            toForm.init(nextScratchBuffer, ctxState);
        }

        // Advance next formation once at current simTime so its target positions are fresh
        toForm.update(0.016, simTime, nextScratchBuffer, ctxState);
        rawTargetPositions.set(nextPositions);

        // Compute 3D Morton space-filling curve matching between live positions and next formation targets
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

        // Apply Morton permutation to target formation so particle i's state in `toForm` matches slot π(i)
        if (typeof toForm.applyPermutation === "function") {
            toForm.applyPermutation(mortonPerm, N);
            toForm.update(0.001, simTime, nextScratchBuffer, ctxState);
        }

        // Hero #0 landing seed at target formation's particle #0
        trans.heroEnd.set(nextPositions[0], nextPositions[1], nextPositions[2]);

        // Rank particles by distance to Hero #0 for staggered COLLAPSE & comet-tail delay
        computeParticleRanks(fromPositions, N, trans.heroStart);

        // Construct 3D cubic Bézier arc (or multi-origin waypoint spline for multi-section nav jumps)
        const jumpSpan = Math.abs(clampedTarget - (wasMidFlight ? currentIndex : fromIdx));
        if (jumpSpan > 1 && !wasMidFlight) {
            const wps = [trans.heroStart.clone()];
            const step = clampedTarget > fromIdx ? 1 : -1;
            for (let k = fromIdx + step; k !== clampedTarget; k += step) {
                if (formations[k]) {
                    wps.push(formations[k].origin.clone());
                }
            }
            wps.push(trans.heroEnd.clone());
            trans.waypoints = wps;
            trans.arc = computeArcControls(trans.heroStart, trans.heroEnd, Math.min(fromIdx, clampedTarget));
        } else {
            trans.waypoints = null;
            trans.arc = computeArcControls(trans.heroStart, trans.heroEnd, Math.min(fromIdx, clampedTarget));
        }

        // Camera rail endpoints
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

    /* ---------- Gesture Handling (Wheel, Touch Swipe, Keyboard, Nav Clicks) ---------- */
    let lastGestureTime = 0;
    const GESTURE_LOCK_MS = 460;

    const triggerStep = (deltaStep) => {
        const now = performance.now();
        if (trans.active) {
            const currentDir = Math.sign(trans.toIndex - trans.fromIndex) || 1;
            if (Math.sign(deltaStep) !== currentDir) {
                // Immediate reversal mid-flight: retarget from live positions without jump!
                trans.queuedIndex = -1;
                startTransition(clamp(trans.toIndex + deltaStep, 0, formations.length - 1));
                lastGestureTime = now;
                return;
            }
            // Same direction mid-flight: allow 1 queued input if past 35% of flight
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
        if (!trans.active && !isAtSectionScrollBoundary(activeSec, dir)) {
            return; // Allow internal scroll within oversized section
        }

        e.preventDefault();
        if (Math.abs(dy) >= 24) {
            triggerStep(dir);
        }
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

        // Check URL hash on load
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

        const active = formations[currentIndex];
        if (active) {
            active.init(sharedBuffer, ctxState);
            active.update(0.016, 0.016, sharedBuffer, ctxState);
            const camDist = active.cameraDistance || 13.5;
            camera.position.set(active.origin.x, active.origin.y, active.origin.z + camDist);
            camera.target.copy(active.origin);
        }
        applyDomSectionVisibility(currentIndex, currentIndex, 1.0, false);
        updateThemeAndDots(currentIndex);
    };

    refreshSections();

    /* ---------- ?debug Telemetry HUD ---------- */
    let debugEl = null;
    const isDebugEnabled = () => {
        try {
            return new URLSearchParams(location.search).has("debug");
        } catch (e) {
            return false;
        }
    };

    const updateDebugHud = () => {
        if (!isDebugEnabled()) {
            if (debugEl) { debugEl.remove(); debugEl = null; }
            return;
        }
        if (!debugEl) {
            debugEl = document.createElement("div");
            debugEl.className = "stage-debug-hud";
            document.body.appendChild(debugEl);
        }
        const activeForm = formations[trans.active ? trans.toIndex : currentIndex];
        const formName = activeForm ? activeForm.id : "hub:intro";
        const hx = positions[0].toFixed(2), hy = positions[1].toFixed(2), hz = positions[2].toFixed(2);
        debugEl.textContent =
            `formation : ${formName} (#${currentIndex}${trans.active ? " → #" + trans.toIndex : ""})\n` +
            `phase     : ${trans.phase}\n` +
            `progress  : ${(trans.u * 100).toFixed(1)}%\n` +
            `fps       : ${fps.toFixed(1)}\n` +
            `particles : ${sharedBuffer.count} (reallocs: ${bufferReallocations})\n` +
            `hero #0   : (${hx}, ${hy}, ${hz})`;
    };

    /* ---------- Main Simulation & Transition Render Loop ---------- */
    let lastTime = performance.now();
    let simTime = 0;
    let fps = 60;
    let slowFrames = 0;

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

        // Adaptive particle count if frame time > 20 ms sustained (never reallocates buffer)
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

        const N = sharedBuffer.count;
        let heroBoost = 0.0;

        if (!trans.active) {
            /* ---------- STEADY STATE: Only current formation's update() runs ---------- */
            const active = formations[currentIndex];
            if (active) {
                active.update(dt, simTime, sharedBuffer, ctxState);
                const camDist = active.cameraDistance || 13.5;
                camera.fov = 46.0;
                camera.position.set(
                    active.origin.x + ctxState.pointerX * 0.55,
                    active.origin.y - ctxState.pointerY * 0.45,
                    active.origin.z + camDist
                );
                camera.target.set(
                    active.origin.x + ctxState.pointerX * 0.15,
                    active.origin.y - ctxState.pointerY * 0.15,
                    active.origin.z
                );
            }
            trans.auxOpacity = Math.min(1.0, trans.auxOpacity + dt * 2.5);
        } else {
            /* ---------- 5-PHASE TRANSITION ENGINE ---------- */
            trans.u = clamp(trans.u + dt / trans.duration, 0.0, 1.0);
            const u = trans.u;
            trans.phase = getPhaseName(u);

            const fromForm = formations[trans.fromIndex];
            const toForm = formations[trans.toIndex];

            // 1. Outgoing simulation keeps running during DETACH (0-15%) and COLLAPSE (10-40%)
            //    with blend factor ramping 1 -> 0 (if not mid-flight interrupted)
            const fromSimBlend = trans.interrupted ? 0.0 : (1.0 - smoothstep(0.10, 0.40, u));
            if (fromSimBlend > 0.001 && fromForm) {
                fromForm.update(dt * fromSimBlend, simTime, fromScratchBuffer, ctxState);
            }

            // 2. Arriving simulation runs during NUCLEATE & HANDOFF (u >= 0.55)
            //    so its live state is ready for smooth handoff
            if (u >= 0.55 && toForm) {
                toForm.update(dt, simTime, nextScratchBuffer, ctxState);
            }

            // 3. Scroll DOM to target section at start of NUCLEATE (u >= 0.70) so DOM fades in at NUCLEATE
            if (!trans.domScrolledToTarget && u >= 0.70) {
                trans.domScrolledToTarget = true;
                const targetSec = sections[trans.toIndex];
                if (targetSec) {
                    window.scrollTo({ top: targetSec.offsetTop, behavior: "instant" });
                }
                updateThemeAndDots(trans.toIndex);
            }
            applyDomSectionVisibility(trans.fromIndex, trans.toIndex, u, true);

            // 4. Hero Particle #0 trajectory along 3D cubic Bézier arc
            const sHero = smootherstep(0.0, 0.86, u);
            evalFlightPath(sHero, tmpHeroPos);
            evalFlightTangent(sHero, tmpHeroTan);

            // HANDOFF blend factor λ = smoothstep(0 -> 1) over the last ~0.6 s (u in [0.75, 1.00])
            const lambda = smoothstep(0.75, 1.00, u);
            // Nucleation outward expansion factor from Hero seed during NUCLEATE (70-100%)
            const nu = smoothstep(0.66, 0.94, u);

            // Hero #0 position, colour, size (index 0)
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

            // Hero glow boost: ramps up in DETACH (0-15%), stays bright in FLIGHT, settles in HANDOFF
            heroBoost = smoothstep(0.0, 0.12, u) * (1.0 - smoothstep(0.78, 0.98, u));

            // 5. Swarm Particles (i = 1 .. N-1):
            //    Staggered release by distance rank -> curl-noise stream collapse -> comet tail -> Morton nucleation -> λ handoff
            const hx0 = trans.heroStart.x, hy0 = trans.heroStart.y, hz0 = trans.heroStart.z;
            const hx1 = trans.heroEnd.x, hy1 = trans.heroEnd.y, hz1 = trans.heroEnd.z;

            // Pre-sample 64 points along the 3D flight curve into pre-allocated LUT for fast O(1) comet-tail lookup
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

                const fx = fromPositions[i3];
                const fy = fromPositions[i3 + 1];
                const fz = fromPositions[i3 + 2];

                const tx = nextPositions[i3];
                const ty = nextPositions[i3 + 1];
                const tz = nextPositions[i3 + 2];

                if (reduced) {
                    // Direct morph for prefers-reduced-motion
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

                // Staggered release window by distance rank to Hero #0:
                // Closest particles release at u = 0.08; farthest release at u = 0.26
                const uStart = 0.07 + 0.19 * rank;
                const uEnd = 0.72 + 0.16 * rank;
                const si = smootherstep(uStart, uEnd, u);
                const oneMinusS = 1.0 - si;

                // Evaluate B(si) from LUT with linear interpolation
                const lutCoord = si * LUT_STEPS;
                const lutIdx = Math.min(LUT_STEPS - 1, lutCoord | 0);
                const lutFrac = lutCoord - lutIdx;
                const bx = curveLutX[lutIdx] + (curveLutX[lutIdx + 1] - curveLutX[lutIdx]) * lutFrac;
                const by = curveLutY[lutIdx] + (curveLutY[lutIdx + 1] - curveLutY[lutIdx]) * lutFrac;
                const bz = curveLutZ[lutIdx] + (curveLutZ[lutIdx + 1] - curveLutZ[lutIdx]) * lutFrac;

                // Outgoing offset from Hero #0 contracts as (1 - si)^2 during COLLAPSE
                const wSrc = oneMinusS * oneMinusS;
                const dStartX = fx - hx0;
                const dStartY = fy - hy0;
                const dStartZ = fz - hz0;

                // Divergence-free curl-noise & helical comet-stream perturbation active during COLLAPSE/FLIGHT
                const streamEnv = 4.0 * si * oneMinusS; // 0 at si=0 and si=1, peaks at si=0.5
                const phase = seeds[i4] * 6.2831853 + si * 9.5 - simTime * 2.4;
                const tubeRad = (0.35 + 1.45 * rank) * streamEnv;
                const cx = Math.cos(phase) * tubeRad + Math.sin(seeds[i4 + 1] * 12.0 + si * 5.0) * 0.45 * streamEnv;
                const cy = Math.sin(phase) * tubeRad + Math.cos(seeds[i4 + 2] * 12.0 - si * 4.5) * 0.45 * streamEnv;
                const cz = Math.sin(phase * 0.7 + seeds[i4 + 3] * 6.28) * tubeRad * 0.8;

                // Arriving offset from Hero #0 expands outward from the landing seed during NUCLEATE
                const wDst = si * si * nu;
                const dEndX = tx - hx1;
                const dEndY = ty - hy1;
                const dEndZ = tz - hz1;

                const flightX = bx + wSrc * dStartX + cx + wDst * dEndX;
                const flightY = by + wSrc * dStartY + cy + wDst * dEndY;
                const flightZ = bz + wSrc * dStartZ + cz + wDst * dEndZ;

                // HANDOFF: pos = mix(flightPos, simPos, λ) over the last ~0.6 s
                positions[i3]     = flightX + (tx - flightX) * lambda;
                positions[i3 + 1] = flightY + (ty - flightY) * lambda;
                positions[i3 + 2] = flightZ + (tz - flightZ) * lambda;

                const colBlend = clamp(si * 0.72 + lambda * 0.28, 0.0, 1.0);
                const streamGlow = streamEnv * 0.22;
                colours[i3]     = clamp(fromColours[i3] + (nextColours[i3] - fromColours[i3]) * colBlend + streamGlow * 0.6, 0.0, 1.0);
                colours[i3 + 1] = clamp(fromColours[i3 + 1] + (nextColours[i3 + 1] - fromColours[i3 + 1]) * colBlend + streamGlow * 0.8, 0.0, 1.0);
                colours[i3 + 2] = clamp(fromColours[i3 + 2] + (nextColours[i3 + 2] - fromColours[i3 + 2]) * colBlend + streamGlow, 0.0, 1.0);

                sizes[i] = fromSizes[i] + (nextSizes[i] - fromSizes[i]) * colBlend + streamEnv * 0.45;
            }

            // 6. Camera Rail: rides slightly behind and above the hero during FLIGHT with gentle FOV breath,
            //    then settles smoothly into the arriving section's camera pose during NUCLEATE/HANDOFF
            if (reduced) {
                const cm = smootherstep(0.0, 1.0, u);
                camera.fov = 46.0;
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

                // Camera rail offset behind & above the Hero particle along the 3D arc
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

                // Gentle FOV breath peaking mid-flight
                const breath = Math.sin(Math.PI * smoothstep(0.10, 0.90, u));
                camera.fov = 46.0 + 8.5 * breath;
            }

            // Auxiliary scene shaders (e.g. Kerr black hole lensing, wireframe overlays) fade in only at the very end of HANDOFF
            trans.auxOpacity = smoothstep(0.88, 1.00, u);

            // 7. Complete Transition at u = 1.0
            if (u >= 1.0) {
                currentIndex = trans.toIndex;
                trans.active = false;
                trans.phase = "IDLE";
                trans.u = 0.0;
                trans.interrupted = false;
                trans.auxOpacity = 1.0;
                applyDomSectionVisibility(currentIndex, currentIndex, 1.0, false);
                updateThemeAndDots(currentIndex);

                // If one input was queued during flight, start it now
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

        /* ---------- WebGL Render Pass on Single #stage-canvas ---------- */
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, stageCanvas.width, stageCanvas.height);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

        gl.enable(gl.BLEND);
        if (ctxState.isLight) {
            gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        } else {
            gl.blendFunc(gl.ONE, gl.ONE);
        }
        gl.disable(gl.DEPTH_TEST);

        const activeRenderForm = formations[trans.active ? trans.toIndex : currentIndex];

        // 1. Optional same-scene Kerr Black Hole lensing & photon ring shader (fades in via uAuxOpacity only after particles settle)
        if (activeRenderForm && activeRenderForm.kerrOverlay && trans.auxOpacity > 0.005 && kerrProg) {
            const ko = activeRenderForm.kerrOverlay;
            gl.useProgram(kerrProg);
            gl.uniform2f(kerrUniforms.uRes, stageCanvas.width, stageCanvas.height);
            gl.uniform2f(kerrUniforms.uBhScreenCentre, ko.screenX, ko.screenY);
            gl.uniform1f(kerrUniforms.uBhScale, ko.scale);
            gl.uniform1f(kerrUniforms.uSpin, ko.spin);
            gl.uniform1f(kerrUniforms.uTilt, ko.tilt);
            gl.uniform1f(kerrUniforms.uTime, simTime);
            gl.uniform1f(kerrUniforms.uAuxOpacity, trans.auxOpacity);
            gl.uniform1f(kerrUniforms.uIsLight, ctxState.isLight ? 1.0 : 0.0);
            gl.bindVertexArray(quadVAO);
            gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
            gl.bindVertexArray(null);
        }

        // 2. Optional same-scene auxiliary line/surface overlay (fades in via uAuxOpacity only after particles settle)
        if (activeRenderForm && activeRenderForm.auxLineCount > 0 && trans.auxOpacity > 0.005 && auxProg) {
            gl.useProgram(auxProg);
            gl.uniformMatrix4fv(auxUniforms.uViewProj, false, camera.viewProjectionMatrix.elements);
            gl.uniform1f(auxUniforms.uAuxOpacity, trans.auxOpacity);
            gl.uniform1f(auxUniforms.uIsLight, ctxState.isLight ? 1.0 : 0.0);

            gl.bindVertexArray(auxVAO);
            const vCount = Math.min(8192, activeRenderForm.auxLineCount);
            gl.bindBuffer(gl.ARRAY_BUFFER, auxPosVBO);
            gl.bufferSubData(gl.ARRAY_BUFFER, 0, activeRenderForm.auxPositions.subarray(0, vCount * 3));
            gl.bindBuffer(gl.ARRAY_BUFFER, auxColVBO);
            gl.bufferSubData(gl.ARRAY_BUFFER, 0, activeRenderForm.auxColours.subarray(0, vCount * 4));
            gl.drawArrays(gl.LINES, 0, vCount);
            gl.bindVertexArray(null);
        }

        // 3. Single Shared THREE.Points Particle Draw Call
        gl.useProgram(pointProg);
        gl.uniformMatrix4fv(pointUniforms.uViewProj, false, camera.viewProjectionMatrix.elements);
        gl.uniform3f(pointUniforms.uCamPos, camera.position.x, camera.position.y, camera.position.z);
        gl.uniform2f(pointUniforms.uViewport, width, height);
        gl.uniform1f(pointUniforms.uDpr, dpr);
        gl.uniform1f(pointUniforms.uHeroBoost, heroBoost);
        gl.uniform1f(pointUniforms.uIsLight, ctxState.isLight ? 1.0 : 0.0);

        gl.bindVertexArray(sharedVAO);

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
        refreshSections,
        goToSection: startTransition,
        triggerStep
    };
}));
