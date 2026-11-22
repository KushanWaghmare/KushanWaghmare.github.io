/* Section Formation Registry & Factory (shared/simulations/core/gpu-thread-formations.js).
   Per-section formations live in shared/simulations/<section>/ and register via registerFormation(key, Ctor).
   Every section exposes a Formation with:
     - origin: THREE.Vector3 (world-space centre of that section)
     - init(buffer, ctx): seeds starting state
     - update(dt, t, buffer, ctx): writes the section's simulation state into buffer
     - targetFor(i, outVec): where particle i wants to be when settled
     - dispose() */

(function (root, factory) {
    if (typeof module === "object" && module.exports) module.exports = factory(root);
    else root.THREAD_FORMATIONS = factory(root);
}(typeof self !== "undefined" ? self : this, function (root) {
    "use strict";

    const TM = root.THREAD_MATH || (typeof require === "function" ? require("./thread-math.js") : null);
    const { Formation, sectionOrigin } = TM;
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
    const api = { LOOK, Formation, registry };

    const registerFormation = (key, Ctor) => {
        registry.set(key, Ctor);
    };

    const KEYWORD_FALLBACKS = [
        ["mobius", "domain:math:1"],
        ["fourier", "domain:math:2"],
        ["nbody", "domain:physics:1"],
        ["schrodinger", "domain:physics:2"],
        ["math", "hub:domain-math"],
        ["physics", "hub:domain-physics"],
        ["datascience", "hub:domain-datascience"],
        ["regression", "hub:domain-datascience"],
        ["spectral", "hub:domain-datascience"],
        ["papers", "hub:domain-datascience"],
        ["quant", "hub:domain-quant"],
        ["options", "hub:domain-quant"],
        ["stat-arb", "hub:domain-quant"],
        ["cs", "hub:domain-cs"],
        ["ku-lang", "hub:domain-cs"],
        ["8bit", "hub:domain-cs"],
        ["contact", "hub:contact"]
    ];

    const createFormation = (simKey, sectionIndex, params = {}) => {
        const origin = sectionOrigin(sectionIndex);
        let Ctor = registry.get(simKey);
        if (!Ctor && typeof simKey === "string") {
            const match = KEYWORD_FALLBACKS.find(([kw]) => simKey.includes(kw));
            if (match) Ctor = registry.get(match[1]);
        }
        Ctor = Ctor || registry.get("default") || Formation;
        return new Ctor(origin, simKey, params, sectionIndex);
    };

    api.registerFormation = registerFormation;
    api.createFormation = createFormation;
    return api;
}));
