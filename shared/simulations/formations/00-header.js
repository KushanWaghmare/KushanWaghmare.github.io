/* Section Formation Interface & Per-Section Simulation Adapters (shared/gpu/gpu-thread-formations.js).
   Every section exposes a Formation with:
     - origin: THREE.Vector3 (world-space centre of that section)
     - init(buffer, ctx): seeds starting state
     - update(dt, t, buffer, ctx): writes the section's REAL simulation state into buffer
     - targetFor(i, outVec): where particle i wants to be when settled
     - dispose() */

(function (root, factory) {
    if (typeof module === "object" && module.exports) module.exports = factory(root);
    else root.THREAD_FORMATIONS = factory(root);
}(typeof self !== "undefined" ? self : this, function (root) {
    "use strict";

    const TM = root.THREAD_MATH || (typeof require === "function" ? require("./thread-math.js") : null);
    const { Vector3, Formation,
        sectionOrigin, clamp, smoothstep } = TM;
    const LOOK = (TM && TM.LOOK) || {
        bloomStrength: 1.05,
        bloomThreshold: 1.0,
        trailDecay: 0.84,
        streakScale: 3.0,
        particleSizeRange: [0.85, 2.25],
        brightnessBudget: [0.17, 0.53],
        backgroundTone: [0.006, 0.012, 0.03]
    };

    const registry = new Map();

    const registerFormation = (key, Ctor) => {
        registry.set(key, Ctor);
    };

