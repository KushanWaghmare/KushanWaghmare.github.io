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

    console.info(`[THREAD_STAGE] Initialised single shared particle buffer: N=${INITIAL_N}, bufferReallocations=${bufferReallocations}`);

    return {
        supported: true,
        THREE,
        scene,
        camera,
        points,
        buffer: sharedBuffer,
        get bufferReallocations() { return bufferReallocations; },
        refreshSections() {},
        goToSection() {}
    };
}));
