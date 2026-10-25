/* Particle Thread Formations Library (shared/gpu/gpu-thread-formations.js).
   Defines exact mathematical point sets and flow seeds for the particle thread.
   Each formation provides N points in [-1, 1]^3, per-particle phase tau_i in [0, 0.3],
   RGBA colours, camera pose, and Hilbert curve ordering. */

(function (root, factory) {
    if (typeof module === "object" && module.exports) {
        module.exports = factory(require("../lib/thread-math.js"));
    } else {
        root.THREAD_FORMATIONS = factory(root.THREAD_MATH);
    }
}(typeof self !== "undefined" ? self : this, function (TM) {
    "use strict";

    const SHARED_BBOX = [-1.0, -1.0, -1.0, 1.0, 1.0, 1.0];

    /* 1. Intro Formation: Lorenz Strange Attractor with 4 Domain Lobes (flow, native: null) */
    const createIntroFormation = (N) => {
        const rawPts = new Float32Array(N * 3);
        const rawCol = new Float32Array(N * 4);

        for (let i = 0; i < N; i++) {
            const u = TM.hash01(i * 4), v = TM.hash01(i * 4 + 1), w = TM.hash01(i * 4 + 2);
            const q = i % 4;
            const th = v * Math.PI * 2.0;
            const r = Math.sqrt(w) * 0.42;

            const lx = 0.35 + r * Math.cos(th);
            const ly = 0.35 + r * Math.sin(th);
            const lz = (TM.hash01(i * 4 + 3) - 0.5) * 0.60;

            let rx = lx, ry = ly;
            if (q === 1) { rx = -ly; ry = lx; }
            else if (q === 2) { rx = -lx; ry = -ly; }
            else if (q === 3) { rx = ly; ry = -lx; }

            rawPts[i * 3] = rx;
            rawPts[i * 3 + 1] = ry;
            rawPts[i * 3 + 2] = lz;

            // Sapphire blue palette ramping towards luminous highlight
            const spd = Math.hypot(rx, ry, lz) / 0.85;
            rawCol[i * 4] = 0.38 + 0.50 * spd;
            rawCol[i * 4 + 1] = 0.61 + 0.35 * spd;
            rawCol[i * 4 + 2] = 1.0;
            rawCol[i * 4 + 3] = 0.88;
        }

        // Apply 3-D Hilbert curve ordering in shared space
        const ord = TM.hilbertOrder(rawPts, N, SHARED_BBOX);
        const posData = new Float32Array(N * 4);
        const colData = new Float32Array(N * 4);

        for (let i = 0; i < N; i++) {
            const src = ord[i];
            posData[i * 4] = rawPts[src * 3];
            posData[i * 4 + 1] = rawPts[src * 3 + 1];
            posData[i * 4 + 2] = rawPts[src * 3 + 2];
            posData[i * 4 + 3] = TM.stagger(i); // tau_i

            colData[i * 4] = rawCol[src * 4];
            colData[i * 4 + 1] = rawCol[src * 4 + 1];
            colData[i * 4 + 2] = rawCol[src * 4 + 2];
            colData[i * 4 + 3] = rawCol[src * 4 + 3];
        }

        return {
            id: "hub:intro",
            name: "Intro (Lorenz Attractor Flow)",
            type: "flow",
            flowType: 0,
            native: null,
            N,
            posData,
            colData,
            rawPts,
            camera: { eye: [0.0, 0.0, 2.8], target: [0.0, 0.0, 0.0], up: [0.0, 1.0, 0.0], fov: 45.0 }
        };
    };

    /* 2. Maths Formation: Fermat Quintic Calabi–Yau Cross-Section (points, native: hub:domain-math) */
    const createMathsFormation = (N) => {
        const rawPts = new Float32Array(N * 3);
        const rawCol = new Float32Array(N * 4);
        const nExp = 5;

        for (let i = 0; i < N; i++) {
            const u = TM.hash01(i * 5) * Math.PI * 2.0;
            const v = TM.hash01(i * 5 + 1) * Math.PI * 2.0;
            const patch = Math.floor(TM.hash01(i * 5 + 2) * 25);
            const p1 = Math.floor(patch / 5), p2 = patch % 5;

            const r1 = Math.pow(Math.max(1e-4, Math.abs(Math.cos(u))), 2.0 / nExp);
            const r2 = Math.pow(Math.max(1e-4, Math.abs(Math.sin(u))), 2.0 / nExp);
            const phi1 = (2.0 * Math.PI * p1 + v) / nExp;
            const phi2 = (2.0 * Math.PI * p2 - v) / nExp;

            rawPts[i * 3] = r1 * Math.cos(phi1) * 0.65;
            rawPts[i * 3 + 1] = r1 * Math.sin(phi1) * 0.65;
            rawPts[i * 3 + 2] = r2 * Math.cos(phi2) * 0.65;

            // Crimson rose palette with patch phase tinting
            const tint = patch / 25.0;
            rawCol[i * 4] = 1.0;
            rawCol[i * 4 + 1] = 0.36 + 0.20 * Math.sin(tint * Math.PI * 2.0);
            rawCol[i * 4 + 2] = 0.44 + 0.15 * Math.cos(tint * Math.PI * 2.0);
            rawCol[i * 4 + 3] = 0.88;
        }

        const ord = TM.hilbertOrder(rawPts, N, SHARED_BBOX);
        const posData = new Float32Array(N * 4);
        const colData = new Float32Array(N * 4);

        for (let i = 0; i < N; i++) {
            const src = ord[i];
            posData[i * 4] = rawPts[src * 3];
            posData[i * 4 + 1] = rawPts[src * 3 + 1];
            posData[i * 4 + 2] = rawPts[src * 3 + 2];
            posData[i * 4 + 3] = TM.stagger(i);

            colData[i * 4] = rawCol[src * 4];
            colData[i * 4 + 1] = rawCol[src * 4 + 1];
            colData[i * 4 + 2] = rawCol[src * 4 + 2];
            colData[i * 4 + 3] = rawCol[src * 4 + 3];
        }

        return {
            id: "hub:domain-math",
            name: "Maths (Calabi–Yau Threefold)",
            type: "points",
            flowType: null,
            native: "hub:domain-math",
            N,
            posData,
            colData,
            rawPts,
            camera: { eye: [0.0, 0.0, 3.0], target: [0.0, 0.0, 0.0], up: [0.0, 1.0, 0.0], fov: 45.0 }
        };
    };

    /* 3. Physics Formation: Keplerian Accretion Rings & Ergosphere Infall (flow, native: hub:domain-physics) */
    const createPhysicsFormation = (N) => {
        const rawPts = new Float32Array(N * 3);
        const rawCol = new Float32Array(N * 4);

        for (let i = 0; i < N; i++) {
            const r = (0.20 + 0.55 * Math.sqrt(TM.hash01(i * 3)));
            const phi = TM.hash01(i * 3 + 1) * Math.PI * 2.0;
            const zh = (TM.hash01(i * 3 + 2) - 0.5) * 0.45;

            rawPts[i * 3] = r * Math.cos(phi);
            rawPts[i * 3 + 1] = r * Math.sin(phi);
            rawPts[i * 3 + 2] = zh;

            // Electric cyan palette with relativistic Doppler beaming
            const blueshift = Math.sin(phi);
            rawCol[i * 4] = 0.13 + 0.45 * Math.max(0.0, blueshift);
            rawCol[i * 4 + 1] = 0.83 + 0.15 * Math.max(0.0, blueshift);
            rawCol[i * 4 + 2] = 0.93 + 0.07 * Math.max(0.0, blueshift);
            rawCol[i * 4 + 3] = 0.88;
        }

        const ord = TM.hilbertOrder(rawPts, N, SHARED_BBOX);
        const posData = new Float32Array(N * 4);
        const colData = new Float32Array(N * 4);

        for (let i = 0; i < N; i++) {
            const src = ord[i];
            posData[i * 4] = rawPts[src * 3];
            posData[i * 4 + 1] = rawPts[src * 3 + 1];
            posData[i * 4 + 2] = rawPts[src * 3 + 2];
            posData[i * 4 + 3] = TM.stagger(i);

            colData[i * 4] = rawCol[src * 4];
            colData[i * 4 + 1] = rawCol[src * 4 + 1];
            colData[i * 4 + 2] = rawCol[src * 4 + 2];
            colData[i * 4 + 3] = rawCol[src * 4 + 3];
        }

        return {
            id: "hub:domain-physics",
            name: "Physics (Keplerian Accretion Rings)",
            type: "flow",
            flowType: 1,
            native: "hub:domain-physics",
            N,
            posData,
            colData,
            rawPts,
            camera: { eye: [0.0, 0.6, 2.8], target: [0.0, 0.0, 0.0], up: [0.0, 1.0, 0.0], fov: 45.0 }
        };
    };

    return {
        createIntroFormation,
        createMathsFormation,
        createPhysicsFormation
    };
}));
