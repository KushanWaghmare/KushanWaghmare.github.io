/* GPU Physics Simulations Loader (shared/gpu/gpu-physics.js).
   Loads and delegates to split-step Schrödinger (gpu-schrodinger.js),
   N-body galaxy collision (gpu-nbody.js), 2-D Ising model (gpu-ising.js),
   2-D FDTD wave optics (gpu-fdtd.js), and double pendulum (gpu-pendulum.js). */

(function (root, factory) {
    if (typeof module === "object" && module.exports) module.exports = factory(root);
    else factory(root);
}(typeof self !== "undefined" ? self : this, function (root) {
    "use strict";

    root.SIMS = root.SIMS || {};
    const SIMS = root.SIMS;
    const GFX = root.GFX;

    const loadSubModule = (name) => {
        if (typeof document === "undefined") return Promise.resolve(null);
        return new Promise((resolve, reject) => {
            const s = document.createElement("script");
            s.src = `shared/gpu/gpu-${name}.js?v=36`;
            s.async = true;
            s.onload = () => resolve(root.SIMS);
            s.onerror = reject;
            document.head.appendChild(s);
        });
    };

    const pSchrodinger = loadSubModule("schrodinger");
    const pNbody = loadSubModule("nbody");
    const pIsing = loadSubModule("ising");
    const pFdtd = loadSubModule("fdtd");
    const pPendulum = loadSubModule("pendulum");

    // Deferred forwarding wrappers in case called before sub-modules finish loading
    const oldSchrodinger = SIMS["split-step-schrodinger"];
    SIMS["split-step-schrodinger"] = (canvas, opts) => {
        if (oldSchrodinger) return oldSchrodinger(canvas, opts);
        pSchrodinger.then(() => {
            if (SIMS["split-step-schrodinger"] && SIMS["split-step-schrodinger"] !== oldSchrodinger) {
                SIMS["split-step-schrodinger"](canvas, opts);
            }
        });
    };

    const oldNbody = SIMS["nbody-leapfrog"];
    SIMS["nbody-leapfrog"] = (canvas, opts) => {
        if (oldNbody) return oldNbody(canvas, opts);
        pNbody.then(() => {
            if (SIMS["nbody-leapfrog"] && SIMS["nbody-leapfrog"] !== oldNbody) {
                SIMS["nbody-leapfrog"](canvas, opts);
            }
        });
    };

    const oldIsing = SIMS["ising-model"];
    SIMS["ising-model"] = SIMS["PH2040"] = (canvas, opts) => {
        if (oldIsing) return oldIsing(canvas, opts);
        pIsing.then(() => {
            if (SIMS["ising-model"] && SIMS["ising-model"] !== oldIsing) {
                SIMS["ising-model"](canvas, opts);
            }
        });
    };

    const oldFdtd = SIMS["fdtd-wave-optics"];
    SIMS["fdtd-wave-optics"] = SIMS["PH3010"] = (canvas, opts) => {
        if (oldFdtd) return oldFdtd(canvas, opts);
        pFdtd.then(() => {
            if (SIMS["fdtd-wave-optics"] && SIMS["fdtd-wave-optics"] !== oldFdtd) {
                SIMS["fdtd-wave-optics"](canvas, opts);
            }
        });
    };

    const oldPendulum = SIMS.pendulum || SIMS["double-pendulum"];
    SIMS.pendulum = SIMS["double-pendulum"] = SIMS["PH2010"] = (canvas, opts) => {
        if (oldPendulum) return oldPendulum(canvas, opts);
        pPendulum.then(() => {
            if (SIMS.pendulum && SIMS.pendulum !== oldPendulum) {
                SIMS.pendulum(canvas, opts);
            }
        });
    };
}));
