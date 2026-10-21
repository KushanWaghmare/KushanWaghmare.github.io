/**
 * cs-computation-math.js
 *
 * Mathematical core for the Computer Science hero: Universal Computation Hyper-Structure.
 * Implements:
 *   - Wolfram Rule 110 (Turing-complete elementary cellular automaton)
 *   - Matthew Cook's Ether background vacuum dynamics (period 14 in space, period 7 in time)
 *   - Langton's lambda parameter (\lambda = 5/8 = 0.625, Class IV phase boundary)
 *   - Shannon information entropy (single-cell and 3-block triplet entropy)
 *   - Lempel–Ziv algorithmic complexity proxy
 *   - Glider defect detection and soliton collision logic
 *   - Continuous 2D Turing hyper-lattice convolution kernel
 *
 * UMD module: usable in Node.js (CommonJS) and browser (window.CsComputationMath).
 * Code style: 4-space indent, const/arrow functions, zero external dependencies.
 */

(function (root, factory) {
    if (typeof module === "object" && module.exports) {
        module.exports = factory();
    } else {
        root.CsComputationMath = factory();
    }
}(typeof self !== "undefined" ? self : this, function () {
    "use strict";

    /* ---------- PRNG & Determinism (mulberry32) ---------- */
    const createPrng = (seed = 42891337) => {
        let s = seed >>> 0;
        return () => {
            s = (s + 0x6D2B79F5) >>> 0;
            let t = Math.imul(s ^ (s >>> 15), 1 | s);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    };

    const fnv1a = (input) => {
        let h = 0x811c9dc5;
        if (typeof input === "string") {
            for (let i = 0; i < input.length; i++) {
                h ^= input.charCodeAt(i);
                h = Math.imul(h, 0x01000193);
            }
        } else if (input instanceof Uint8Array || Array.isArray(input)) {
            for (let i = 0; i < input.length; i++) {
                h ^= input[i];
                h = Math.imul(h, 0x01000193);
            }
        }
        return h >>> 0;
    };

    /* ---------- Wolfram Rule 110 Elementary Cellular Automaton ---------- */
    // Rule 110: 01101110_2
    // Transitions: 111->0, 110->1, 101->1, 100->0, 011->1, 010->1, 001->1, 000->0
    const rule110Lookup = (left, center, right) => {
        const idx = ((left & 1) << 2) | ((center & 1) << 1) | (right & 1);
        return (110 >> idx) & 1;
    };

    // Generic elementary cellular automaton rule lookup for rule in [0, 255]
    const elementaryRule = (ruleNum, left, center, right) => {
        const idx = ((left & 1) << 2) | ((center & 1) << 1) | (right & 1);
        return (ruleNum >> idx) & 1;
    };

    // Single step evolution across 1D array with periodic boundary conditions
    const stepRule110 = (row, out = null) => {
        const n = row.length;
        const result = out || new Uint8Array(n);
        for (let i = 0; i < n; i++) {
            const left = row[(i - 1 + n) % n];
            const center = row[i];
            const right = row[(i + 1) % n];
            result[i] = rule110Lookup(left, center, right);
        }
        return result;
    };

    // Multi-generation evolution returning 2D history buffer
    const evolveRule110 = (initialRow, numSteps) => {
        const n = initialRow.length;
        const history = [new Uint8Array(initialRow)];
        let current = new Uint8Array(initialRow);

        for (let t = 0; t < numSteps; t++) {
            current = stepRule110(current);
            history.push(new Uint8Array(current));
        }
        return history;
    };

    /* ---------- Matthew Cook's Ether Background Vacuum ---------- */
    // The canonical 14-cell spatial ether tile from Cook (2004)
    // Evolves with spatial displacement delta_x = 2 every 7 time steps
    const ETHER_PATTERN = Object.freeze([0, 0, 0, 1, 0, 0, 1, 1, 0, 1, 1, 1, 1, 1]);

    const createEtherRow = (length) => {
        const row = new Uint8Array(length);
        const pLen = ETHER_PATTERN.length;
        for (let i = 0; i < length; i++) {
            row[i] = ETHER_PATTERN[i % pLen];
        }
        return row;
    };

    /* ---------- Langton's Lambda Parameter ---------- */
    // Fraction of non-quiescent state transitions
    const langtonLambda = (ruleNum = 110) => {
        let nonQuiescent = 0;
        for (let i = 0; i < 8; i++) {
            if ((ruleNum >> i) & 1) nonQuiescent++;
        }
        return nonQuiescent / 8.0; // Rule 110 has 5 ones out of 8 = 0.625
    };

    /* ---------- Shannon Information Entropy ---------- */
    // Single-cell Shannon entropy: H = -p0 log2(p0) - p1 log2(p1) in [0, 1]
    const shannonEntropy = (row) => {
        const n = row.length;
        if (n === 0) return 0.0;
        let count1 = 0;
        for (let i = 0; i < n; i++) {
            if (row[i] & 1) count1++;
        }
        const p1 = count1 / n;
        const p0 = 1.0 - p1;
        if (p0 <= 0.0 || p1 <= 0.0) return 0.0;
        return -(p0 * Math.log2(p0) + p1 * Math.log2(p1));
    };

    // 3-Block Triplet Entropy: H_3 = -sum p(b) log2 p(b) in [0, 3] bits
    const tripletBlockEntropy = (row) => {
        const n = row.length;
        if (n === 0) return 0.0;
        const counts = new Uint32Array(8);

        for (let i = 0; i < n; i++) {
            const left = row[(i - 1 + n) % n] & 1;
            const center = row[i] & 1;
            const right = row[(i + 1) % n] & 1;
            const idx = (left << 2) | (center << 1) | right;
            counts[idx]++;
        }

        let h3 = 0.0;
        for (let k = 0; k < 8; k++) {
            if (counts[k] > 0) {
                const p = counts[k] / n;
                h3 -= p * Math.log2(p);
            }
        }
        return h3;
    };

    /* ---------- Lempel–Ziv Algorithmic Complexity Proxy ---------- */
    // Normalized Lempel-Ziv complexity C_LZ(s) = (c(s) * log2(|s|)) / |s|
    const lempelZivComplexity = (row) => {
        const n = row.length;
        if (n <= 1) return 0.0;

        // Convert array to binary string for LZW prefix parsing
        let str = "";
        for (let i = 0; i < n; i++) {
            str += (row[i] & 1) ? "1" : "0";
        }

        let i = 0, k = 1, l = 1;
        let k_max = 1;
        let c = 1;

        while (true) {
            if (str[i + k - 1] === str[l + k - 1]) {
                k++;
                if (l + k > n) {
                    c++;
                    break;
                }
            } else {
                if (k > k_max) k_max = k;
                i++;
                if (i === l) {
                    c++;
                    l += k_max;
                    if (l + 1 > n) break;
                    i = 0;
                    k = 1;
                    k_max = 1;
                } else {
                    k = 1;
                }
            }
        }

        return (c * Math.log2(n)) / n;
    };

    /* ---------- Glider Soliton Detection ---------- */
    // Compares a row against the expected ether vacuum phase
    // Returns indices where defects (glider solitons) exist
    const detectGliders = (row, phase = 0) => {
        const n = row.length;
        const pLen = ETHER_PATTERN.length;
        const defects = [];

        for (let i = 0; i < n; i++) {
            const expected = ETHER_PATTERN[(i + phase) % pLen];
            if ((row[i] & 1) !== expected) {
                defects.push(i);
            }
        }
        return defects;
    };

    /* ---------- Continuous 2D Turing Kernel ---------- */
    // Gaussian-annular convolution kernel for 2D universal hyper-lattice
    const continuous2DKernel = (radius = 12) => {
        const size = radius * 2 + 1;
        const kernel = new Float32Array(size * size);
        const mu = radius * 0.55;
        const sigma = radius * 0.18;
        let sum = 0.0;

        let ptr = 0;
        for (let y = -radius; y <= radius; y++) {
            for (let x = -radius; x <= radius; x++) {
                const dist = Math.hypot(x, y);
                const dMu = dist - mu;
                const weight = Math.exp(-(dMu * dMu) / (2.0 * sigma * sigma));
                kernel[ptr++] = weight;
                sum += weight;
            }
        }

        // Normalize sum to 1.0
        const invSum = 1.0 / Math.max(1e-7, sum);
        for (let k = 0; k < kernel.length; k++) {
            kernel[k] *= invSum;
        }

        return { kernel, size, radius };
    };

    /* ---------- Telemetry Formatter ---------- */
    const formatTelemetry = (step, activeRatio, entropy, lzwComplexity) => {
        const lambda = langtonLambda(110);
        return {
            step,
            activeRatio,
            entropy,
            lzwComplexity,
            lambda,
            tagString: `Universal Computation · Rule 110 · H = ${entropy.toFixed(3)} bits · C_LZ = ${lzwComplexity.toFixed(2)} · Turing Class IV (λ = ${lambda.toFixed(3)}) · click triggers logic cascade`
        };
    };

    return {
        createPrng,
        fnv1a,
        rule110Lookup,
        elementaryRule,
        stepRule110,
        evolveRule110,
        ETHER_PATTERN,
        createEtherRow,
        langtonLambda,
        shannonEntropy,
        tripletBlockEntropy,
        lempelZivComplexity,
        detectGliders,
        continuous2DKernel,
        formatTelemetry
    };
}));
