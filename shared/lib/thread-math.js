/* Shared Particle Thread Mathematics (shared/lib/thread-math.js).
   Provides 3-D Hilbert curve key generation, scrub-reversible transition maths,
   analytical divergence-free curl noise, settle evaluation, and section coordinate mapping.
   Plain script with UMD wrapper for Node.js test runners and browser runtime. */

(function (root, factory) {
    if (typeof module === "object" && module.exports) {
        module.exports = factory();
    } else {
        root.THREAD_MATH = factory();
    }
}(typeof self !== "undefined" ? self : this, function () {
    "use strict";

    const clamp = (x, minVal, maxVal) => Math.max(minVal, Math.min(maxVal, x));

    /* Hermite cubic smoothstep */
    const smoothstep = (edge0, edge1, x) => {
        const t = clamp((x - edge0) / (edge1 - edge0), 0.0, 1.0);
        return t * t * (3.0 - 2.0 * t);
    };

    /* Deterministic 32-bit integer hash mapping integer index i to [0, 1) */
    const hash01 = (i) => {
        let x = (i ^ 0x61c88647) >>> 0;
        x = Math.imul(x ^ (x >>> 16), 0x85ebca6b) >>> 0;
        x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35) >>> 0;
        return ((x ^ (x >>> 16)) >>> 0) * (1.0 / 4294967296.0);
    };

    /* Per-particle transition stagger tau_i in [0, 0.3] */
    const stagger = (i) => hash01(i) * 0.3;

    /* S-curve easing */
    const ease = (p) => p * p * (3.0 - 2.0 * p);

    /* Local particle progress p_i = clamp((w - tau_i) / (1.0 - 0.3), 0, 1) */
    const localProgress = (w, tau) => clamp((w - tau) / 0.7, 0.0, 1.0);

    /* 3-D Hilbert curve key from normalised coordinates (x, y, z) in [0, 1]^3.
       Uses Skilling (2004) compact bit-transposition algorithm.
       For order = 10, key is a 30-bit integer fitting safely within standard 32-bit integer. */
    const hilbert3D = (x, y, z, order = 10) => {
        const maxCoord = (1 << order) - 1;
        const X = clamp(Math.floor(x * (1 << order)), 0, maxCoord);
        const Y = clamp(Math.floor(y * (1 << order)), 0, maxCoord);
        const Z = clamp(Math.floor(z * (1 << order)), 0, maxCoord);

        const t = [X, Y, Z];
        const n = 3;
        const M = 1 << (order - 1);
        // Inverse transpose
        for (let Q = M; Q > 1; Q >>= 1) {
            const P = Q - 1;
            for (let i = 0; i < n; i++) {
                if ((t[i] & Q) !== 0) {
                    t[0] ^= P; // Invert
                } else {
                    const a = (t[0] ^ t[i]) & P;
                    t[0] ^= a;
                    t[i] ^= a;
                }
            }
        }
        // Gray decode
        for (let i = 1; i < n; i++) t[i] ^= t[i - 1];
        let tr = 0;
        for (let Q = M; Q > 1; Q >>= 1) {
            if ((t[n - 1] & Q) !== 0) tr ^= (Q - 1);
        }
        for (let i = 0; i < n; i++) t[i] ^= tr;

        let h = 0;
        for (let s = order - 1; s >= 0; s--) {
            h = (h << 3) | (((t[0] >> s) & 1) << 2) | (((t[1] >> s) & 1) << 1) | ((t[2] >> s) & 1);
        }
        return h;
    };

    /* Computes the Hilbert ordering permutation for N 3-D points.
       points: Float32Array of length N * 3 (or array of [x, y, z]).
       bbox: optional [minX, minY, minZ, maxX, maxY, maxZ]. If omitted, computes bounds.
       Returns Uint32Array of length N containing indices sorted by Hilbert key. */
    const hilbertOrder = (points, N, bbox = null) => {
        let minX = Infinity, minY = Infinity, minZ = Infinity;
        let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

        if (bbox) {
            minX = bbox[0]; minY = bbox[1]; minZ = bbox[2];
            maxX = bbox[3]; maxY = bbox[4]; maxZ = bbox[5];
        } else {
            for (let i = 0; i < N; i++) {
                const px = points[i * 3], py = points[i * 3 + 1], pz = points[i * 3 + 2];
                if (px < minX) minX = px; if (px > maxX) maxX = px;
                if (py < minY) minY = py; if (py > maxY) maxY = py;
                if (pz < minZ) minZ = pz; if (pz > maxZ) maxZ = pz;
            }
        }

        const spanX = Math.max(1e-6, maxX - minX);
        const spanY = Math.max(1e-6, maxY - minY);
        const spanZ = Math.max(1e-6, maxZ - minZ);

        const keys = new Float64Array(N);
        const indices = new Uint32Array(N);

        for (let i = 0; i < N; i++) {
            indices[i] = i;
            const nx = (points[i * 3] - minX) / spanX;
            const ny = (points[i * 3 + 1] - minY) / spanY;
            const nz = (points[i * 3 + 2] - minZ) / spanZ;
            keys[i] = hilbert3D(nx, ny, nz, 10);
        }

        indices.sort((i, j) => keys[i] - keys[j]);
        return indices;
    };

    /* Exact analytical divergence-free curl noise.
       Constructed via the curl of three harmonic vector potentials:
       psi = sum_k A_k * sin(k_k . x + omega_k * t)
       curl(psi) = sum_k (k_k x A_k) * cos(k_k . x + omega_k * t)
       Strictly satisfies div(curl(psi)) = 0 everywhere.
       Identical in CPU JS and GPU GLSL. */
    const curlNoise = (x, y, z, t) => {
        const k1x = 1.8, k1y = 1.2, k1z = 1.4;
        const k2x = -1.3, k2y = 2.1, k2z = 1.1;
        const k3x = 1.4, k3y = -1.6, k3z = 2.2;

        // Precomputed cross products: k x A
        // Wave 1: A = [0.0, 1.0, -0.8] -> c1 = [-2.36, 1.44, 1.80]
        const c1x = -2.36, c1y = 1.44, c1z = 1.80;
        // Wave 2: A = [1.0, 0.0, 1.2]  -> c2 = [2.52, 2.66, -2.10]
        const c2x = 2.52, c2y = 2.66, c2z = -2.10;
        // Wave 3: A = [-0.9, 1.1, 0.0] -> c3 = [-2.42, -1.98, 0.10]
        const c3x = -2.42, c3y = -1.98, c3z = 0.10;

        const p1 = (x * k1x + y * k1y + z * k1z) * 1.5 + t * 0.4;
        const p2 = (x * k2x + y * k2y + z * k2z) * 1.5 + t * 0.5;
        const p3 = (x * k3x + y * k3y + z * k3z) * 1.5 + t * 0.35;

        const cos1 = Math.cos(p1), cos2 = Math.cos(p2), cos3 = Math.cos(p3);
        const scale = 0.22;

        return [
            (c1x * cos1 + c2x * cos2 + c3x * cos3) * scale,
            (c1y * cos1 + c2y * cos2 + c3y * cos3) * scale,
            (c1z * cos1 + c2z * cos2 + c3z * cos3) * scale
        ];
    };

    /* Continuous transition position function (CPU reference identical to shader).
       xA, xB: [x, y, z] vectors for particle i in formations A and B.
       i: particle index (0 ... N-1).
       w: section transition blend in [0, 1].
       t: elapsed time in seconds.
       swirl: turbulence magnitude (default 0.28). */
    const transitionPosition = (xA, xB, i, w, t, swirl = 0.28) => {
        const tau = stagger(i);
        const p = localProgress(w, tau);

        // At transition boundaries, return exact endpoints without evaluation drift
        if (p <= 0.0) return [xA[0], xA[1], xA[2]];
        if (p >= 1.0) return [xB[0], xB[1], xB[2]];

        const ep = ease(p);
        const mx = xA[0] + (xB[0] - xA[0]) * ep;
        const my = xA[1] + (xB[1] - xA[1]) * ep;
        const mz = xA[2] + (xB[2] - xA[2]) * ep;

        const curl = curlNoise(mx, my, mz, t);
        const s = swirl * Math.sin(Math.PI * p);

        return [
            mx + s * curl[0],
            my + s * curl[1],
            mz + s * curl[2]
        ];
    };

    /* Transition colour function blending colA and colB */
    const transitionColour = (colA, colB, i, w) => {
        const tau = stagger(i);
        const p = localProgress(w, tau);
        if (p <= 0.0) return [colA[0], colA[1], colA[2], colA[3]];
        if (p >= 1.0) return [colB[0], colB[1], colB[2], colB[3]];
        const ep = ease(p);
        return [
            colA[0] + (colB[0] - colA[0]) * ep,
            colA[1] + (colB[1] - colA[1]) * ep,
            colA[2] + (colB[2] - colA[2]) * ep,
            colA[3] + (colB[3] - colA[3]) * ep
        ];
    };

    /* Settle function: sigma_i(s) = smoothstep(0, 1, 1 - |s - i| / 0.25).
       Equals 1.0 at s = i, drops smoothly to 0.0 for |s - i| >= 0.25.
       Intervals are non-overlapping between sections, so sum_i sigma_i <= 1.0 everywhere. */
    const settle = (s, i) => {
        const dist = Math.abs(s - i);
        if (dist >= 0.25) return 0.0;
        const u = 1.0 - (dist / 0.25);
        return smoothstep(0.0, 1.0, u);
    };

    /* Section coordinate mapping from continuous scroll offset.
       s = scrollY / sectionHeight. */
    const sectionCoordinate = (scrollY, sectionHeight) => {
        if (!sectionHeight || sectionHeight <= 0) return 0.0;
        return Math.max(0.0, scrollY / sectionHeight);
    };

    /* Mean travel distance calculation for benchmarks. */
    const meanTravel = (ptsA, ptsB, N, mapping = null) => {
        let sum = 0.0;
        for (let i = 0; i < N; i++) {
            const bi = mapping ? mapping[i] : i;
            const dx = ptsA[i * 3] - ptsB[bi * 3];
            const dy = ptsA[i * 3 + 1] - ptsB[bi * 3 + 1];
            const dz = ptsA[i * 3 + 2] - ptsB[bi * 3 + 2];
            sum += Math.hypot(dx, dy, dz);
        }
        return sum / N;
    };

    return {
        clamp,
        smoothstep,
        hash01,
        stagger,
        ease,
        localProgress,
        hilbert3D,
        hilbertOrder,
        curlNoise,
        transitionPosition,
        transitionColour,
        settle,
        sectionCoordinate,
        meanTravel
    };
}));
