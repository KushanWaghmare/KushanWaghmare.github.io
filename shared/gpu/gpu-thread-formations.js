/* Section Formation Interface & Registry (shared/gpu/gpu-thread-formations.js).
   Every section exposes a Formation with:
     - origin: THREE.Vector3 (world-space centre of that section)
     - init(buffer, ctx): optional, seeds starting state
     - update(dt, t, buffer, ctx): writes the section's REAL simulation state into buffer
     - targetFor(i, outVec): where particle i wants to be when settled
     - dispose() */

(function (root, factory) {
    if (typeof module === "object" && module.exports) module.exports = factory(root);
    else root.THREAD_FORMATIONS = factory(root);
}(typeof self !== "undefined" ? self : this, function (root) {
    "use strict";

    const TM = root.THREAD_MATH || (typeof require === "function" ? require("../lib/thread-math.js") : null);
    const { Vector3, Formation, sectionOrigin } = TM;

    const registry = new Map();

    const registerFormation = (key, Ctor) => {
        registry.set(key, Ctor);
    };

    const createFormation = (simKey, sectionIndex, params = {}) => {
        const origin = sectionOrigin(sectionIndex);
        const Ctor = registry.get(simKey) || registry.get("default") || Formation;
        return new Ctor(origin, simKey, params, sectionIndex);
    };

    return {
        Formation,
        registerFormation,
        createFormation,
        registry
    };
}));
