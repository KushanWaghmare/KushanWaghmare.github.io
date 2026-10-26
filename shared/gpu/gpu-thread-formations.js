/* Particle Thread Formations Library (shared/gpu/gpu-thread-formations.js).
   Defines exact mathematical point sets and flow seeds for the particle thread across
   all 9 hub page sections. Each formation provides N points in [-1, 1]^3, per-particle
   phase tau_i in [0, 0.3], RGBA colours, camera pose, and Hilbert curve ordering. */

(function (root, factory) {
    if (typeof module === "object" && module.exports) {
        module.exports = factory(require("../lib/thread-math.js"));
    } else {
        root.THREAD_FORMATIONS = factory(root.THREAD_MATH);
    }
}(typeof self !== "undefined" ? self : this, function (TM) {
    "use strict";

    const SHARED_BBOX = [-1.0, -1.0, -1.0, 1.0, 1.0, 1.0];

    const assemble = (meta, rawPts, rawCol, N) => {
        const ord = TM.hilbertOrder(rawPts, N, SHARED_BBOX);
        const posData = new Float32Array(N * 4);
        const colData = new Float32Array(N * 4);
        for (let i = 0; i < N; i++) {
            const s = ord[i];
            posData[i * 4] = rawPts[s * 3];
            posData[i * 4 + 1] = rawPts[s * 3 + 1];
            posData[i * 4 + 2] = rawPts[s * 3 + 2];
            posData[i * 4 + 3] = TM.stagger(i);
            colData[i * 4] = rawCol[s * 4];
            colData[i * 4 + 1] = rawCol[s * 4 + 1];
            colData[i * 4 + 2] = rawCol[s * 4 + 2];
            colData[i * 4 + 3] = rawCol[s * 4 + 3];
        }
        return { ...meta, N, posData, colData, rawPts };
    };

    /* 0. Intro: Lorenz Strange Attractor (flow, native: null) */
    const createIntroFormation = (N) => {
        const rawPts = new Float32Array(N * 3), rawCol = new Float32Array(N * 4);
        for (let i = 0; i < N; i++) {
            const v = TM.hash01(i * 4 + 1), w = TM.hash01(i * 4 + 2);
            const q = i % 4, th = v * Math.PI * 2.0, r = Math.sqrt(w) * 0.42;
            const lx = 0.35 + r * Math.cos(th), ly = 0.35 + r * Math.sin(th);
            const lz = (TM.hash01(i * 4 + 3) - 0.5) * 0.60;
            let rx = lx, ry = ly;
            if (q === 1) { rx = -ly; ry = lx; }
            else if (q === 2) { rx = -lx; ry = -ly; }
            else if (q === 3) { rx = ly; ry = -lx; }
            rawPts[i * 3] = rx; rawPts[i * 3 + 1] = ry; rawPts[i * 3 + 2] = lz;
            const spd = Math.hypot(rx, ry, lz) / 0.85;
            rawCol[i * 4] = 0.38 + 0.50 * spd;
            rawCol[i * 4 + 1] = 0.61 + 0.35 * spd;
            rawCol[i * 4 + 2] = 1.0;
            rawCol[i * 4 + 3] = 0.88;
        }
        return assemble({
            id: "hub:intro", name: "Intro (Lorenz Attractor)", type: "flow", flowType: 0, native: null,
            camera: { eye: [0.0, 0.0, 3.2], target: [0, 0, 0], up: [0, 1, 0], fov: 45.0 }
        }, rawPts, rawCol, N);
    };

    /* 1. Maths: Calabi-Yau Fermat Quintic Cross-Section (points, native: hub:domain-math) */
    const createMathsFormation = (N) => {
        const rawPts = new Float32Array(N * 3), rawCol = new Float32Array(N * 4);
        for (let i = 0; i < N; i++) {
            const u = TM.hash01(i * 5), a = TM.hash01(i * 5 + 2) * Math.PI * 2.0;
            const patch = i % 25, p = patch % 5, q = Math.floor(patch / 5);
            const t = u * (Math.PI * 0.5);
            const r1 = Math.pow(Math.sin(t), 0.4), r2 = Math.pow(Math.cos(t), 0.4);
            const th1 = (2 * Math.PI * p + a) / 5.0, th2 = (2 * Math.PI * q - a) / 5.0;
            const quad = i % 4;
            let x = r1 * Math.cos(th1) * 0.82, y = r1 * Math.sin(th1) * 0.82, z = r2 * Math.cos(th2) * 0.58;
            if (quad === 1) { const tmp = x; x = -y; y = tmp; }
            else if (quad === 2) { x = -x; y = -y; }
            else if (quad === 3) { const tmp = x; x = y; y = -tmp; }
            rawPts[i * 3] = x; rawPts[i * 3 + 1] = y; rawPts[i * 3 + 2] = z;
            rawCol[i * 4] = 1.0; rawCol[i * 4 + 1] = 0.36 + 0.35 * u;
            rawCol[i * 4 + 2] = 0.44 + 0.30 * r1; rawCol[i * 4 + 3] = 0.88;
        }
        return assemble({
            id: "hub:domain-math", name: "Maths (Calabi–Yau Quintic)", type: "points", flowType: 0, native: "hub:domain-math",
            camera: { eye: [0.0, 0.0, 3.0], target: [0, 0, 0], up: [0, 1, 0], fov: 45.0 }
        }, rawPts, rawCol, N);
    };

    /* 2. Physics: Keplerian Accretion Disk & Infall (flow, native: hub:domain-physics) */
    const createPhysicsFormation = (N) => {
        const rawPts = new Float32Array(N * 3), rawCol = new Float32Array(N * 4);
        const rIsco = 0.22, rMax = 0.88;
        for (let i = 0; i < N; i++) {
            const u = TM.hash01(i * 4), v = TM.hash01(i * 4 + 1);
            const isErgo = i % 5 === 0;
            let r, th, z;
            if (isErgo) {
                r = 0.08 + (rIsco - 0.08) * Math.sqrt(u); th = v * Math.PI * 4.0; z = (u - 0.5) * 0.45;
            } else {
                r = rIsco + (rMax - rIsco) * Math.sqrt(u); th = v * Math.PI * 2.0;
                z = (TM.hash01(i * 4 + 3) - 0.5) * 0.25 * (1.0 - r / rMax);
            }
            rawPts[i * 3] = r * Math.cos(th); rawPts[i * 3 + 1] = r * Math.sin(th); rawPts[i * 3 + 2] = z;
            const dop = 0.5 + 0.5 * Math.sin(th);
            rawCol[i * 4] = 0.13 + 0.70 * dop; rawCol[i * 4 + 1] = 0.82 + 0.18 * dop;
            rawCol[i * 4 + 2] = 0.93; rawCol[i * 4 + 3] = 0.88;
        }
        return assemble({
            id: "hub:domain-physics", name: "Physics (Keplerian Accretion)", type: "flow", flowType: 1, native: "hub:domain-physics",
            camera: { eye: [0.0, 0.55, 2.7], target: [0, 0, 0], up: [0, 1, 0], fov: 45.0 }
        }, rawPts, rawCol, N);
    };

    /* 3. Data Science: Reverse Diffusion Logarithmic Spiral (flow, native: null) */
    const createDataScienceFormation = (N) => {
        const rawPts = new Float32Array(N * 3), rawCol = new Float32Array(N * 4);
        for (let i = 0; i < N; i++) {
            const arm = i % 2, u = TM.hash01(i * 4), v = TM.hash01(i * 4 + 1);
            const th = arm * Math.PI + u * Math.PI * 3.6;
            const r = 0.16 + 0.68 * Math.pow(u, 0.75);
            const noise = (1.0 - u) * 0.22;
            const nx = (TM.hash01(i * 4 + 2) - 0.5) * noise, ny = (TM.hash01(i * 4 + 3) - 0.5) * noise;
            rawPts[i * 3] = r * Math.cos(th) + nx; rawPts[i * 3 + 1] = r * Math.sin(th) + ny;
            rawPts[i * 3 + 2] = (v - 0.5) * 0.35 * (1.0 - u * 0.6);
            rawCol[i * 4] = 0.96; rawCol[i * 4 + 1] = 0.65 + 0.28 * u;
            rawCol[i * 4 + 2] = 0.14 + 0.50 * (1.0 - u); rawCol[i * 4 + 3] = 0.88;
        }
        return assemble({
            id: "hub:domain-datascience", name: "Data Science (Diffusion Spiral)", type: "flow", flowType: 2, native: null,
            camera: { eye: [0.0, 0.0, 3.2], target: [0, 0, 0], up: [0, 1, 0], fov: 45.0 }
        }, rawPts, rawCol, N);
    };

    /* 4. Quant: Market Galaxy Star Dust Halos (points, native: hub:domain-quant) */
    const createQuantFormation = (N) => {
        const rawPts = new Float32Array(N * 3), rawCol = new Float32Array(N * 4);
        const K = 12, centers = [];
        for (let k = 0; k < K; k++) {
            const a = (k / K) * Math.PI * 2.0;
            centers.push([Math.cos(a) * 0.58, Math.sin(a) * 0.38, Math.sin(a * 2) * 0.18]);
        }
        for (let i = 0; i < N; i++) {
            const sec = i % K, c = centers[sec];
            const u = TM.hash01(i * 4), v = TM.hash01(i * 4 + 1), w = TM.hash01(i * 4 + 2);
            const dr = 0.18 * Math.sqrt(-Math.log(Math.max(1e-4, 1.0 - 0.92 * u)));
            const th = v * Math.PI * 2.0;
            rawPts[i * 3] = c[0] + dr * Math.cos(th) * 0.75;
            rawPts[i * 3 + 1] = c[1] + dr * Math.sin(th) * 0.65;
            rawPts[i * 3 + 2] = c[2] + (w - 0.5) * 0.24;
            rawCol[i * 4] = 0.12 + 0.40 * u; rawCol[i * 4 + 1] = 0.79 + 0.18 * v;
            rawCol[i * 4 + 2] = 0.57 + 0.35 * w; rawCol[i * 4 + 3] = 0.88;
        }
        return assemble({
            id: "hub:domain-quant", name: "Quant (Market Galaxy Halos)", type: "points", flowType: 0, native: "hub:domain-quant",
            camera: { eye: [0.0, 0.40, 2.9], target: [0, 0, 0], up: [0, 1, 0], fov: 45.0 }
        }, rawPts, rawCol, N);
    };

    /* 5. CS: 4D Hypercube / Tesseract Projection (points, native: hub:domain-cs) */
    const createCSFormation = (N) => {
        const rawPts = new Float32Array(N * 3), rawCol = new Float32Array(N * 4);
        const verts = [], edges = [];
        for (let m = 0; m < 16; m++) {
            verts.push([(m & 1 ? 0.52 : -0.52), (m & 2 ? 0.52 : -0.52), (m & 4 ? 0.52 : -0.52), (m & 8 ? 0.52 : -0.52)]);
        }
        for (let i = 0; i < 16; i++) {
            for (let b = 0; b < 4; b++) {
                const j = i ^ (1 << b);
                if (i < j) edges.push([verts[i], verts[j]]);
            }
        }
        const ca = Math.cos(Math.PI / 6), sa = Math.sin(Math.PI / 6);
        for (let i = 0; i < N; i++) {
            const [vA, vB] = edges[i % edges.length], t = TM.hash01(i * 3);
            const p4 = [vA[0] + (vB[0] - vA[0]) * t, vA[1] + (vB[1] - vA[1]) * t, vA[2] + (vB[2] - vA[2]) * t, vA[3] + (vB[3] - vA[3]) * t];
            const x4 = p4[0] * ca - p4[3] * sa, w4 = p4[0] * sa + p4[3] * ca, d = 1.55 - w4;
            rawPts[i * 3] = (x4 / d) * 1.15; rawPts[i * 3 + 1] = (p4[1] / d) * 1.15; rawPts[i * 3 + 2] = (p4[2] / d) * 1.15;
            rawCol[i * 4] = 0.67 + 0.30 * t; rawCol[i * 4 + 1] = 0.52 + 0.35 * t;
            rawCol[i * 4 + 2] = 1.0; rawCol[i * 4 + 3] = 0.88;
        }
        return assemble({
            id: "hub:domain-cs", name: "CS (4D Hypercube)", type: "points", flowType: 0, native: "hub:domain-cs",
            camera: { eye: [0.0, 0.0, 3.2], target: [0, 0, 0], up: [0, 1, 0], fov: 45.0 }
        }, rawPts, rawCol, N);
    };

    /* 6. Papers: Exact (3, 7) Torus Knot Space Curve (points, native: hub:papers) */
    const createPapersFormation = (N) => {
        const rawPts = new Float32Array(N * 3), rawCol = new Float32Array(N * 4);
        const p = 3, q = 7, R = 0.60, r = 0.24;
        for (let i = 0; i < N; i++) {
            const u = (i / N) * Math.PI * 2.0;
            const xc = (R + r * Math.cos(q * u)) * Math.cos(p * u);
            const yc = (R + r * Math.cos(q * u)) * Math.sin(p * u);
            const zc = -r * Math.sin(q * u);
            const v = TM.hash01(i * 4) * Math.PI * 2.0;
            const rt = 0.065 * Math.sqrt(TM.hash01(i * 4 + 1));
            rawPts[i * 3] = xc + rt * Math.cos(v); rawPts[i * 3 + 1] = yc + rt * Math.sin(v);
            rawPts[i * 3 + 2] = zc + (TM.hash01(i * 4 + 2) - 0.5) * 0.08;
            rawCol[i * 4] = 0.64 + 0.30 * Math.sin(u); rawCol[i * 4 + 1] = 0.90 + 0.08 * Math.cos(u);
            rawCol[i * 4 + 2] = 0.21 + 0.35 * (1.0 - Math.sin(u)); rawCol[i * 4 + 3] = 0.88;
        }
        return assemble({
            id: "hub:papers", name: "Papers (Torus Knot)", type: "points", flowType: 0, native: "hub:papers",
            camera: { eye: [0.0, 0.0, 3.0], target: [0, 0, 0], up: [0, 1, 0], fov: 44.0 }
        }, rawPts, rawCol, N);
    };

    /* 7. Courses: Prerequisite Curriculum DAG Layout (points, native: hub:courses) */
    const createCoursesFormation = (N) => {
        const rawPts = new Float32Array(N * 3), rawCol = new Float32Array(N * 4);
        const tiers = [
            [-0.75, [-0.55, -0.20, 0.20, 0.55]],
            [-0.25, [-0.60, -0.30, 0.0, 0.30, 0.60]],
            [0.25, [-0.50, -0.18, 0.18, 0.50]],
            [0.75, [-0.35, 0.0, 0.35]]
        ];
        const nodes = [];
        tiers.forEach((t, tIdx) => { t[1].forEach(y => nodes.push({ x: t[0], y, tIdx })); });
        const edges = [];
        for (let a = 0; a < nodes.length; a++) {
            for (let b = 0; b < nodes.length; b++) {
                if (nodes[b].tIdx === nodes[a].tIdx + 1 && Math.abs(nodes[b].y - nodes[a].y) <= 0.45) {
                    edges.push([nodes[a], nodes[b]]);
                }
            }
        }
        for (let i = 0; i < N; i++) {
            if (i % 3 === 0) {
                const nd = nodes[i % nodes.length], r = 0.06 * Math.sqrt(TM.hash01(i * 4));
                const th = TM.hash01(i * 4 + 1) * Math.PI * 2.0;
                rawPts[i * 3] = nd.x + r * Math.cos(th); rawPts[i * 3 + 1] = nd.y + r * Math.sin(th);
                rawPts[i * 3 + 2] = (TM.hash01(i * 4 + 2) - 0.5) * 0.15;
            } else {
                const [nA, nB] = edges[i % edges.length], t = TM.hash01(i * 4);
                rawPts[i * 3] = nA.x + (nB.x - nA.x) * t;
                rawPts[i * 3 + 1] = nA.y + (nB.y - nA.y) * (t * t * (3 - 2 * t)) + (TM.hash01(i * 4 + 1) - 0.5) * 0.04;
                rawPts[i * 3 + 2] = (TM.hash01(i * 4 + 2) - 0.5) * 0.12;
            }
            rawCol[i * 4] = 0.96; rawCol[i * 4 + 1] = 0.41 + 0.35 * TM.hash01(i * 4 + 2);
            rawCol[i * 4 + 2] = 0.69 + 0.25 * TM.hash01(i * 4 + 3); rawCol[i * 4 + 3] = 0.88;
        }
        return assemble({
            id: "hub:courses", name: "Courses (Curriculum DAG)", type: "points", flowType: 0, native: "hub:courses",
            camera: { eye: [0.0, 0.0, 2.9], target: [0, 0, 0], up: [0, 1, 0], fov: 45.0 }
        }, rawPts, rawCol, N);
    };

    /* 8. Contact: Calm 3D Curl-Noise Circulation (flow, native: null) */
    const createContactFormation = (N) => {
        const rawPts = new Float32Array(N * 3), rawCol = new Float32Array(N * 4);
        const R0 = 0.62, r0 = 0.28;
        for (let i = 0; i < N; i++) {
            const u = TM.hash01(i * 4), v = TM.hash01(i * 4 + 1);
            const th = u * Math.PI * 2.0, phi = v * Math.PI * 2.0;
            const cr = r0 + (TM.hash01(i * 4 + 2) - 0.5) * 0.12;
            rawPts[i * 3] = (R0 + cr * Math.cos(phi)) * Math.cos(th);
            rawPts[i * 3 + 1] = (R0 + cr * Math.cos(phi)) * Math.sin(th);
            rawPts[i * 3 + 2] = cr * Math.sin(phi);
            rawCol[i * 4] = 0.14 + 0.40 * u; rawCol[i * 4 + 1] = 0.78 + 0.18 * v;
            rawCol[i * 4 + 2] = 0.71 + 0.25 * u; rawCol[i * 4 + 3] = 0.88;
        }
        return assemble({
            id: "hub:contact", name: "Contact (Calm Circulation)", type: "flow", flowType: 3, native: null,
            camera: { eye: [0.0, 0.0, 3.4], target: [0, 0, 0], up: [0, 1, 0], fov: 45.0 }
        }, rawPts, rawCol, N);
    };

    const ALL_FACTORIES = [
        createIntroFormation,
        createMathsFormation,
        createPhysicsFormation,
        createDataScienceFormation,
        createQuantFormation,
        createCSFormation,
        createPapersFormation,
        createCoursesFormation,
        createContactFormation
    ];

    const getFormationByKey = (key, N) => {
        if (typeof key === "number") {
            const fn = ALL_FACTORIES[Math.min(ALL_FACTORIES.length - 1, Math.max(0, key))];
            return fn ? fn(N) : createIntroFormation(N);
        }
        const s = String(key || "").toLowerCase();
        if (s.includes("intro")) return createIntroFormation(N);
        if (s.includes("math") || s.includes("cy-")) return createMathsFormation(N);
        if (s.includes("physics") || s.includes("blackhole") || s.includes("schrodinger")) return createPhysicsFormation(N);
        if (s.includes("datascience") || s.includes("diffusion") || s.includes("flock") || s.includes("regression") || s.includes("spectral")) return createDataScienceFormation(N);
        if (s.includes("quant") || s.includes("market") || s.includes("paths") || s.includes("copula") || s.includes("lob") || s.includes("options")) return createQuantFormation(N);
        if (s.includes("cs") || s.includes("qsim") || s.includes("rule") || s.includes("computer") || s.includes("lang")) return createCSFormation(N);
        if (s.includes("papers") || s.includes("paper") || s.includes("surface") || s.includes("poincare")) return createPapersFormation(N);
        if (s.includes("courses") || s.includes("track") || s.includes("graph") || s.includes("curriculum")) return createCoursesFormation(N);
        if (s.includes("contact") || s.includes("nbody") || s.includes("explore")) return createContactFormation(N);
        return createIntroFormation(N);
    };

    return {
        createIntroFormation,
        createMathsFormation,
        createPhysicsFormation,
        createDataScienceFormation,
        createQuantFormation,
        createCSFormation,
        createPapersFormation,
        createCoursesFormation,
        createContactFormation,
        ALL_FACTORIES,
        getFormationByKey
    };
}));
