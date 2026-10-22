/**
 * shared/lib/lattice-math.js
 *
 * Mathematical core for the bivariate binomial option-pricing crystal.
 *
 * Implements:
 *   - High-precision Normal CDF Φ(x) (W. J. Cody rational Chebyshev erfc, accurate to 1e-15)
 *   - Margrabe (1978) closed-form exchange option pricing and Black–Scholes reduction
 *   - Boyle–Evnine–Gibbs (1989) bivariate binomial lattice probabilities and admissibility
 *   - Rolling-array backward induction (O(n²) memory, double precision)
 *   - Full 3-D crystal node coordinate and value generation for GPU upload
 *   - Forward induction lattice probability propagation
 *   - One-dimensional binomial lattice (Cox–Ross–Rubinstein / degenerate one-asset tree)
 *   - Brute-force path enumerator (4ⁿ paths for validation)
 *   - Seeded correlated-GBM Monte Carlo sampler with antithetic variates (mulberry32)
 *
 * Pure JavaScript, no dependencies, UMD pattern.
 */

(function (root, factory) {
    if (typeof module === "object" && module.exports) module.exports = factory();
    else root.LatticeMath = factory();
}(typeof self !== "undefined" ? self : this, function () {
    "use strict";

    /* ---------- High-Precision Complementary Error Function (FDLIBM / Cody) ---------- */
    // Double-precision complementary error function ported from FDLIBM 5.3 (s_erf.c)
    // Accurate to ~1e-15 across the full IEEE-754 range.
    const erfc = (() => {
        const tiny = 1e-300;
        const half = 0.5;
        const one = 1.0;
        const two = 2.0;
        const erx = 8.45062911510467529297e-01;
        const pp0 = 1.28379167095512558561e-01;
        const pp1 = -3.25042107247001499370e-01;
        const pp2 = -2.84817495755985104766e-02;
        const pp3 = -5.77027029648944159157e-03;
        const pp4 = -2.37630166566501626084e-05;
        const qq1 = 3.97917223959155352819e-01;
        const qq2 = 6.50222499887672944485e-02;
        const qq3 = 5.08130628187576562776e-03;
        const qq4 = 1.32494738004321644526e-04;
        const qq5 = -3.96022827877536812320e-06;

        const pa0 = -2.36211856075265944077e-03;
        const pa1 = 4.14856118683748331666e-01;
        const pa2 = -3.72207876035701323847e-01;
        const pa3 = 3.18346619901161753674e-01;
        const pa4 = -1.10894694282396677476e-01;
        const pa5 = 3.54783043256182359371e-02;
        const pa6 = -2.16637559486879084300e-03;
        const qa1 = 1.06420880400844228286e-01;
        const qa2 = 5.40397917702171048937e-01;
        const qa3 = 7.18286544141962662868e-02;
        const qa4 = 1.26171219808761642112e-01;
        const qa5 = 1.36370839120290507362e-02;
        const qa6 = 1.19844998467991074170e-02;

        const ra0 = -9.86494403484714822705e-03;
        const ra1 = -6.93858572707181764372e-01;
        const ra2 = -1.05586262253232909814e+01;
        const ra3 = -6.23753324503260060396e+01;
        const ra4 = -1.62396669462573470355e+02;
        const ra5 = -1.84605092906711035994e+02;
        const ra6 = -8.12874355063065934246e+01;
        const ra7 = -9.81432934416914548592e+00;
        const sa1 = 1.96512716674392571292e+01;
        const sa2 = 1.37657754143519042600e+02;
        const sa3 = 4.34565877475229228821e+02;
        const sa4 = 6.45387271733267880336e+02;
        const sa5 = 4.29008140027567833386e+02;
        const sa6 = 1.08635005541779435134e+02;
        const sa7 = 6.57024977031928170135e+00;
        const sa8 = -6.04244152148580987438e-02;

        const rb0 = -9.86494292470009928597e-03;
        const rb1 = -7.99283237680523006574e-01;
        const rb2 = -1.77579549177547519889e+01;
        const rb3 = -1.60636384855821916062e+02;
        const rb4 = -6.37566443368389627722e+02;
        const rb5 = -1.02509513161107724954e+03;
        const rb6 = -4.83519191608651397019e+02;
        const sb1 = 3.03380607434824582924e+01;
        const sb2 = 3.25792512996573918826e+02;
        const sb3 = 1.53672958608443695994e+03;
        const sb4 = 3.19985821950859553908e+03;
        const sb5 = 2.55305040643316442583e+03;
        const sb6 = 4.74528541206955367215e+02;
        const sb7 = -2.24409524465858183362e+01;

        return (x) => {
            if (Number.isNaN(x)) return NaN;
            if (x === Infinity) return 0.0;
            if (x === -Infinity) return 2.0;

            const ax = Math.abs(x);
            if (ax < 0.84375) {
                if (ax < 1.3877787807814457e-17) return one - x; // 2^-56
                const z = x * x;
                const r = pp0 + z * (pp1 + z * (pp2 + z * (pp3 + z * pp4)));
                const s = one + z * (qq1 + z * (qq2 + z * (qq3 + z * (qq4 + z * qq5))));
                const y = r / s;
                if (x < 0.25) return one - (x + x * y);
                return half - (x * y + (x - half));
            }
            if (ax < 1.25) {
                const s = ax - one;
                const P = pa0 + s * (pa1 + s * (pa2 + s * (pa3 + s * (pa4 + s * (pa5 + s * pa6)))));
                const Q = one + s * (qa1 + s * (qa2 + s * (qa3 + s * (qa4 + s * (qa5 + s * qa6)))));
                if (x >= 0) return (one - erx) - P / Q;
                return one + (erx + P / Q);
            }
            if (ax < 28.0) {
                const s = one / (ax * ax);
                let R, S;
                if (ax < 2.857142857142857) { // 1/0.35
                    R = ra0 + s * (ra1 + s * (ra2 + s * (ra3 + s * (ra4 + s * (ra5 + s * (ra6 + s * ra7))))));
                    S = one + s * (sa1 + s * (sa2 + s * (sa3 + s * (sa4 + s * (sa5 + s * (sa6 + s * (sa7 + s * sa8)))))));
                } else {
                    if (x < -6.0) return two - tiny;
                    R = rb0 + s * (rb1 + s * (rb2 + s * (rb3 + s * (rb4 + s * (rb5 + s * rb6)))));
                    S = one + s * (sb1 + s * (sb2 + s * (sb3 + s * (sb4 + s * (sb5 + s * (sb6 + s * sb7))))));
                }
                const z = Math.fround(ax);
                const r = Math.exp(-z * z - 0.5625) * Math.exp((z - ax) * (z + ax) + R / S);
                if (x > 0) return r / ax;
                return two - r / ax;
            }
            if (x > 0) return tiny * tiny;
            return two - tiny;
        };
    })();

    const phiCdf = (z) => 0.5 * erfc(-z * Math.SQRT1_2);

    const normalPdf = (x) => Math.exp(-0.5 * x * x) / Math.sqrt(2.0 * Math.PI);

    /* ---------- Seeded PRNG: Mulberry32 & Box–Muller ---------- */
    const mulberry32 = (seed) => {
        let s = seed >>> 0;
        return () => {
            s = (s + 0x6D2B79F5) >>> 0;
            let t = Math.imul(s ^ (s >>> 15), 1 | s);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    };

    const boxMuller = (rng) => {
        const u1 = Math.max(rng(), 1e-15), u2 = rng();
        const r = Math.sqrt(-2.0 * Math.log(u1)), th = 2.0 * Math.PI * u2;
        return [r * Math.cos(th), r * Math.sin(th)];
    };

    /* ---------- Closed-Form Pricing: Margrabe (1978) & Black–Scholes ---------- */
    /**
     * Margrabe European exchange option pricing formula: max(S1 - S2, 0) at expiry T.
     * Independent of risk-free rate r.
     */
    const margrabe = (S1, S2, sigma1, sigma2, rho, r = 0.0, T = 1.0) => {
        if (T <= 1e-15) return Math.max(S1 - S2, 0.0);
        const sigSq = sigma1 * sigma1 + sigma2 * sigma2 - 2.0 * rho * sigma1 * sigma2;
        if (sigSq <= 1e-15) return Math.max(S1 - S2, 0.0);
        const sig = Math.sqrt(sigSq);
        const sqrtT = Math.sqrt(T);
        const d1 = (Math.log(S1 / S2) + 0.5 * sigSq * T) / (sig * sqrtT);
        const d2 = d1 - sig * sqrtT;
        return S1 * phiCdf(d1) - S2 * phiCdf(d2);
    };

    /**
     * Black–Scholes European call option formula on a single asset.
     */
    const blackScholes = (S, K, r, sigma, T) => {
        if (T <= 1e-15 || sigma <= 1e-15) return Math.max(S - K * Math.exp(-r * T), 0.0);
        const sqrtT = Math.sqrt(T);
        const d1 = (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * sqrtT);
        const d2 = d1 - sigma * sqrtT;
        return S * phiCdf(d1) - K * Math.exp(-r * T) * phiCdf(d2);
    };

    /* ---------- Boyle–Evnine–Gibbs (1989) Bivariate Binomial Lattice ---------- */
    /**
     * Joint transition probabilities and step parameters for BEG lattice.
     */
    const begProbabilities = (params, n) => {
        const { sigma1, sigma2, rho, r, T } = params;
        const dt = T / n;
        const sqrtDt = Math.sqrt(dt);
        const u1 = Math.exp(sigma1 * sqrtDt), d1 = 1.0 / u1;
        const u2 = Math.exp(sigma2 * sqrtDt), d2 = 1.0 / u2;
        const mu1 = r - 0.5 * sigma1 * sigma1;
        const mu2 = r - 0.5 * sigma2 * sigma2;
        const a1 = sqrtDt * mu1 / sigma1;
        const a2 = sqrtDt * mu2 / sigma2;

        const puu = 0.25 * (1.0 + rho + a1 + a2);
        const pud = 0.25 * (1.0 - rho + a1 - a2);
        const pdu = 0.25 * (1.0 - rho - a1 + a2);
        const pdd = 0.25 * (1.0 + rho - a1 - a2);

        return { dt, sqrtDt, u1, d1, u2, d2, mu1, mu2, a1, a2, puu, pud, pdu, pdd };
    };

    /**
     * Checks whether all four BEG probabilities fall strictly within [0, 1].
     */
    const admissible = (params, n) => {
        if (n < 1) return false;
        const { puu, pud, pdu, pdd } = begProbabilities(params, n);
        const eps = -1e-14;
        return (
            puu >= eps && puu <= 1.0 - eps &&
            pud >= eps && pud <= 1.0 - eps &&
            pdu >= eps && pdu <= 1.0 - eps &&
            pdd >= eps && pdd <= 1.0 - eps
        );
    };

    /**
     * Finds the smallest integer n >= 1 for which the BEG lattice is admissible.
     */
    const minAdmissibleN = (params) => {
        const { sigma1, sigma2, rho, r, T } = params;
        const mu1 = r - 0.5 * sigma1 * sigma1;
        const mu2 = r - 0.5 * sigma2 * sigma2;
        const c1 = mu1 / sigma1;
        const c2 = mu2 / sigma2;

        // Condition 1: |a1 + a2| <= 1 + rho => sqrt(T/n) * |c1 + c2| <= 1 + rho
        // Condition 2: |a1 - a2| <= 1 - rho => sqrt(T/n) * |c1 - c2| <= 1 - rho
        let minN = 1;
        const denom1 = 1.0 + rho;
        const denom2 = 1.0 - rho;

        if (denom1 <= 1e-7 || denom2 <= 1e-7) return 10000;

        const req1 = Math.pow(Math.abs(c1 + c2) / denom1, 2) * T;
        const req2 = Math.pow(Math.abs(c1 - c2) / denom2, 2) * T;
        minN = Math.max(1, Math.ceil(Math.max(req1, req2) - 1e-12));

        while (minN > 1 && admissible(params, minN - 1)) {
            minN--;
        }
        while (minN < 10000 && !admissible(params, minN)) {
            minN++;
        }
        return minN;
    };

    /* ---------- Backward Induction Lattice Pricing ---------- */
    /**
     * Fast pricing using two rolling Float64Arrays (O(n²) memory, double precision).
     */
    const priceLattice = (params, n) => {
        const { S1, S2, r } = params;
        const prob = begProbabilities(params, n);
        const { dt, u1, u2, puu, pud, pdu, pdd } = prob;
        const disc = Math.exp(-r * dt);

        let curr = new Float64Array((n + 1) * (n + 1));
        let next = new Float64Array((n + 1) * (n + 1));

        // Terminal payoff at expiry t = n: max(S1 - S2, 0)
        for (let k1 = 0; k1 <= n; k1++) {
            const s1_val = S1 * Math.pow(u1, 2 * k1 - n);
            const row = k1 * (n + 1);
            for (let k2 = 0; k2 <= n; k2++) {
                const s2_val = S2 * Math.pow(u2, 2 * k2 - n);
                curr[row + k2] = Math.max(s1_val - s2_val, 0.0);
            }
        }

        // Backward induction sweeps layer by layer down to t = 0
        for (let t = n - 1; t >= 0; t--) {
            const tmp = curr; curr = next; next = tmp;
            const strideNext = t + 2;
            const strideCurr = t + 1;
            for (let k1 = 0; k1 <= t; k1++) {
                const rowNext1 = (k1 + 1) * strideNext;
                const rowNext0 = k1 * strideNext;
                const rowCurr = k1 * strideCurr;
                for (let k2 = 0; k2 <= t; k2++) {
                    curr[rowCurr + k2] = disc * (
                        puu * next[rowNext1 + (k2 + 1)] +
                        pud * next[rowNext1 + k2] +
                        pdu * next[rowNext0 + (k2 + 1)] +
                        pdd * next[rowNext0 + k2]
                    );
                }
            }
        }
        return curr[0];
    };

    /**
     * Builds full pyramid geometry and per-node values for GPU rendering.
     * Output packed into a single Float32Array: [x, y, z, value, t, k1, k2, s1_s2_diff]
     */
    const buildLattice = (params, n, width = 1.0, height = 1.5) => {
        const { S1, S2, r } = params;
        const prob = begProbabilities(params, n);
        const { dt, u1, u2, puu, pud, pdu, pdd } = prob;
        const disc = Math.exp(-r * dt);

        const totalNodes = ((n + 1) * (n + 2) * (2 * n + 3)) / 6;
        const layers = new Array(n + 1);

        // Preallocate layer values
        for (let t = 0; t <= n; t++) {
            layers[t] = new Float64Array((t + 1) * (t + 1));
        }

        // Terminal payoff at t = n
        const terminal = layers[n];
        for (let k1 = 0; k1 <= n; k1++) {
            const s1_val = S1 * Math.pow(u1, 2 * k1 - n);
            const row = k1 * (n + 1);
            for (let k2 = 0; k2 <= n; k2++) {
                const s2_val = S2 * Math.pow(u2, 2 * k2 - n);
                terminal[row + k2] = Math.max(s1_val - s2_val, 0.0);
            }
        }

        // Backward induction down to root
        for (let t = n - 1; t >= 0; t--) {
            const curr = layers[t];
            const next = layers[t + 1];
            const strideNext = t + 2;
            const strideCurr = t + 1;
            for (let k1 = 0; k1 <= t; k1++) {
                const rowNext1 = (k1 + 1) * strideNext;
                const rowNext0 = k1 * strideNext;
                const rowCurr = k1 * strideCurr;
                for (let k2 = 0; k2 <= t; k2++) {
                    curr[rowCurr + k2] = disc * (
                        puu * next[rowNext1 + (k2 + 1)] +
                        pud * next[rowNext1 + k2] +
                        pdu * next[rowNext0 + (k2 + 1)] +
                        pdd * next[rowNext0 + k2]
                    );
                }
            }
        }

        // Pack flat Float32 buffer for GPU: 8 floats per vertex
        // [posX, posY, posZ, value, tNorm, k1Norm, k2Norm, hingeDiff]
        const STRIDE = 8;
        const flatBuffer = new Float32Array(totalNodes * STRIDE);
        let ptr = 0;

        for (let t = 0; t <= n; t++) {
            const vals = layers[t];
            const y = (t / n) * height;
            const tNorm = t / n;
            for (let k1 = 0; k1 <= t; k1++) {
                const x = ((2.0 * k1 - t) / n) * width;
                const s1_val = S1 * Math.pow(u1, 2 * k1 - t);
                for (let k2 = 0; k2 <= t; k2++) {
                    const z = ((2.0 * k2 - t) / n) * width;
                    const s2_val = S2 * Math.pow(u2, 2 * k2 - t);
                    const val = vals[k1 * (t + 1) + k2];

                    flatBuffer[ptr]     = x;
                    flatBuffer[ptr + 1] = y;
                    flatBuffer[ptr + 2] = z;
                    flatBuffer[ptr + 3] = val;
                    flatBuffer[ptr + 4] = tNorm;
                    flatBuffer[ptr + 5] = t > 0 ? (k1 / t) : 0.5;
                    flatBuffer[ptr + 6] = t > 0 ? (k2 / t) : 0.5;
                    flatBuffer[ptr + 7] = (s1_val - s2_val) / Math.max(1.0, S1);
                    ptr += STRIDE;
                }
            }
        }

        return {
            price: layers[0][0],
            totalNodes,
            layers,
            flatBuffer,
            stride: STRIDE
        };
    };

    /* ---------- Forward Induction (Marginal Consistency Verification) ---------- */
    /**
     * Propagates state probabilities forward from root node (0, 0) to layer n.
     */
    const forwardInduction = (params, n) => {
        const { puu, pud, pdu, pdd } = begProbabilities(params, n);
        const layers = new Array(n + 1);
        layers[0] = new Float64Array([1.0]);

        for (let t = 0; t < n; t++) {
            const curr = layers[t];
            const next = new Float64Array((t + 2) * (t + 2));
            const strideCurr = t + 1;
            const strideNext = t + 2;

            for (let k1 = 0; k1 <= t; k1++) {
                const rowCurr = k1 * strideCurr;
                for (let k2 = 0; k2 <= t; k2++) {
                    const p = curr[rowCurr + k2];
                    if (p === 0.0) continue;
                    next[(k1 + 1) * strideNext + (k2 + 1)] += p * puu;
                    next[(k1 + 1) * strideNext + k2]       += p * pud;
                    next[k1 * strideNext + (k2 + 1)]       += p * pdu;
                    next[k1 * strideNext + k2]             += p * pdd;
                }
            }
            layers[t + 1] = next;
        }
        return layers;
    };

    /* ---------- One-Dimensional Binomial Lattice (Black–Scholes Reduction) ---------- */
    /**
     * Standard 1D binomial tree for European call: max(S - K, 0).
     */
    const price1DLattice = (S0, K, r, sigma, T, n) => {
        const dt = T / n;
        const sqrtDt = Math.sqrt(dt);
        const u = Math.exp(sigma * sqrtDt), d = 1.0 / u;
        const mu = r - 0.5 * sigma * sigma;
        const a = sqrtDt * mu / sigma;
        const pu = 0.5 * (1.0 + a);
        const pd = 0.5 * (1.0 - a);
        const disc = Math.exp(-r * dt);

        let V = new Float64Array(n + 1);
        for (let k = 0; k <= n; k++) {
            V[k] = Math.max(S0 * Math.pow(u, 2 * k - n) - K, 0.0);
        }

        for (let t = n - 1; t >= 0; t--) {
            const nextV = V;
            V = new Float64Array(t + 1);
            for (let k = 0; k <= t; k++) {
                V[k] = disc * (pu * nextV[k + 1] + pd * nextV[k]);
            }
        }
        return V[0];
    };

    /**
     * Degenerate 2D case: asset 2 is a deterministic strike bond S2 = K·e^{-rT} (sigma2 = 0).
     */
    const priceDegenerateLattice = (S1_0, K, r, sigma1, T, n) => {
        return price1DLattice(S1_0, K, r, sigma1, T, n);
    };

    /* ---------- Brute-Force Path Enumerator (for n <= 8) ---------- */
    /**
     * Computes the exact discounted expectation across all 4ⁿ paths.
     */
    const priceBruteForce = (params, n) => {
        if (n > 10) throw new Error("Brute force enumerator restricted to n <= 10");
        const { S1, S2, r, T } = params;
        const prob = begProbabilities(params, n);
        const { u1, u2, puu, pud, pdu, pdd } = prob;

        const pVec = [puu, pud, pdu, pdd];
        const moves = [
            [1, 1], // uu
            [1, 0], // ud
            [0, 1], // du
            [0, 0]  // dd
        ];

        let sum = 0.0, c = 0.0;
        const totalPaths = Math.pow(4, n);

        for (let p = 0; p < totalPaths; p++) {
            let temp = p;
            let k1 = 0, k2 = 0;
            let pathProb = 1.0;
            for (let step = 0; step < n; step++) {
                const m = temp & 3;
                temp >>= 2;
                pathProb *= pVec[m];
                k1 += moves[m][0];
                k2 += moves[m][1];
            }
            const s1_val = S1 * Math.pow(u1, 2 * k1 - n);
            const s2_val = S2 * Math.pow(u2, 2 * k2 - n);
            const val = pathProb * Math.max(s1_val - s2_val, 0.0);

            // Kahan summation for double-precision preservation across 4ⁿ terms
            const y = val - c;
            const t = sum + y;
            c = (t - sum) - y;
            sum = t;
        }
        const disc = Math.pow(Math.exp(-r * (T / n)), n);
        return disc * sum;
    };

    /* ---------- Seeded Monte Carlo Correlated-GBM Sampler ---------- */
    /**
     * 4 million antithetic draws of risk-neutral correlated GBM for Margrabe cross-check.
     */
    const monteCarloExchange = (params, numDraws = 4000000, seed = 12345) => {
        const { S1, S2, sigma1, sigma2, rho, r, T } = params;
        const rng = mulberry32(seed);
        const sqrtT = Math.sqrt(T);
        const mu1 = (r - 0.5 * sigma1 * sigma1) * T;
        const mu2 = (r - 0.5 * sigma2 * sigma2) * T;
        const s1T = sigma1 * sqrtT;
        const s2T = sigma2 * sqrtT;
        const rhoComp = Math.sqrt(Math.max(0.0, 1.0 - rho * rho));
        const disc = Math.exp(-r * T);

        const numPairs = Math.floor(numDraws / 2);
        let sum = 0.0, sumSq = 0.0;

        for (let i = 0; i < numPairs; i++) {
            const [z1, z2_indep] = boxMuller(rng);
            const z2 = rho * z1 + rhoComp * z2_indep;

            // Direct variate (+Z)
            const s1_a = S1 * Math.exp(mu1 + s1T * z1);
            const s2_a = S2 * Math.exp(mu2 + s2T * z2);
            const pay_a = Math.max(s1_a - s2_a, 0.0);

            // Antithetic variate (-Z)
            const s1_b = S1 * Math.exp(mu1 - s1T * z1);
            const s2_b = S2 * Math.exp(mu2 - s2T * z2);
            const pay_b = Math.max(s1_b - s2_b, 0.0);

            const pairMean = 0.5 * (pay_a + pay_b);
            sum += pairMean;
            sumSq += pairMean * pairMean;
        }

        const mean = sum / numPairs;
        const variance = (sumSq / numPairs - mean * mean) / numPairs;
        const se = disc * Math.sqrt(Math.max(0.0, variance));
        const price = disc * mean;

        return { price, se, numDraws: numPairs * 2 };
    };

    return {
        erfc,
        phiCdf,
        normalPdf,
        mulberry32,
        boxMuller,
        margrabe,
        blackScholes,
        begProbabilities,
        admissible,
        minAdmissibleN,
        priceLattice,
        buildLattice,
        forwardInduction,
        price1DLattice,
        priceDegenerateLattice,
        priceBruteForce,
        monteCarloExchange
    };
}));
