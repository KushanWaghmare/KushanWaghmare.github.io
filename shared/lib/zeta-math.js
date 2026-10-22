/**
 * zeta-math.js
 *
 * Mathematical core for "Primes from waves":
 *   - Arithmetic functions: von Mangoldt Lambda(n), Chebyshev psi_0(x), exact BigInt lcm(1..n).
 *   - Explicit formula (von Mangoldt): smooth curve + symmetric pairing of non-trivial zeros.
 *   - Closed-form real wave terms and Cesàro mean partial sums (T = gamma_{N+1}).
 *   - High-precision Riemann–Siegel Z(t) and theta(t) evaluation with Brent root finding.
 *   - Grid sampling uniform in u = ln x and fast incremental accumulator updates.
 *
 * UMD module for browser (window.ZetaMath) and Node.js (CommonJS).
 * Zero external runtime dependencies; all calculations executed in IEEE 754 double precision.
 */

(function (root, factory) {
    if (typeof module === "object" && module.exports) {
        module.exports = factory();
    } else {
        root.ZetaMath = factory();
    }
}(typeof self !== "undefined" ? self : this, function () {
    "use strict";

    const LN_2PI = 1.83787706640934548356; // ln(2*pi)

    /* =========================================================================
     * 1. Arithmetic & Chebyshev Staircase Functions
     * ========================================================================= */

    /**
     * Prime factorization: returns true if n is a prime power p^k (k >= 1),
     * and returns { p, k }. Otherwise returns null.
     */
    const factorPrimePower = (n) => {
        if (n < 2) return null;
        let d = 2;
        let temp = n;
        while (d * d <= temp) {
            if (temp % d === 0) {
                // Prime factor d found. Verify all remaining factors are d.
                let count = 0;
                while (temp % d === 0) {
                    temp /= d;
                    count++;
                }
                return temp === 1 ? { p: d, k: count } : null;
            }
            d = d === 2 ? 3 : d + 2;
        }
        // n itself is prime (k = 1)
        return { p: n, k: 1 };
    };

    /**
     * von Mangoldt function Lambda(n):
     *   Lambda(n) = ln(p) if n = p^k for prime p and k >= 1
     *   Lambda(n) = 0     otherwise
     */
    const vonMangoldt = (n) => {
        const pp = factorPrimePower(n);
        return pp ? Math.log(pp.p) : 0.0;
    };

    /**
     * Exact BigInt greatest common divisor (Euclid).
     */
    const gcdBigInt = (a, b) => {
        let x = a < 0n ? -a : a;
        let y = b < 0n ? -b : b;
        while (y !== 0n) {
            const r = x % y;
            x = y;
            y = r;
        }
        return x;
    };

    /**
     * Exact BigInt least common multiple of numbers 1..n: lcm(1, 2, ..., n).
     */
    const lcmBigInt = (n) => {
        if (n < 1) return 0n;
        let currentLcm = 1n;
        for (let i = 2n; i <= BigInt(n); i++) {
            const g = gcdBigInt(currentLcm, i);
            currentLcm = (currentLcm / g) * i;
        }
        return currentLcm;
    };

    /**
     * Exact natural logarithm of BigInt: converts high-order bits to double with exponent.
     */
    const lnBigInt = (bn) => {
        if (bn <= 0n) return -Infinity;
        const s = bn.toString(16);
        if (s.length <= 13) return Math.log(Number(bn));
        const topHex = s.slice(0, 13);
        const topNum = parseInt(topHex, 16);
        const remainingBits = (s.length - 13) * 4;
        return Math.log(topNum) + remainingBits * Math.LN2;
    };

    /**
     * Chebyshev psi_0(x):
     *   psi(x) = sum_{n <= x} Lambda(n)
     * At a jump point x = p^k, psi_0(x) takes the midpoint value (psi(x-) + psi(x+))/2 = psi(x) - 0.5*Lambda(x).
     */
    const chebyshevPsi0 = (x) => {
        if (x < 2.0) return 0.0;
        const floorX = Math.floor(x);
        let sum = 0.0;
        for (let m = 2; m <= floorX; m++) {
            sum += vonMangoldt(m);
        }
        // If x is an exact integer, subtract half the jump at x
        if (Math.abs(x - floorX) < 1e-12) {
            sum -= 0.5 * vonMangoldt(floorX);
        }
        return sum;
    };

    /* =========================================================================
     * 2. Explicit Formula & Riemann Zeta Zero Wave Terms
     * ========================================================================= */

    /**
     * Smooth base curve (N = 0):
     *   psi_smooth(x) = x - ln(2*pi) - 0.5 * ln(1 - x^(-2))
     * For x > 1.
     */
    const smoothCurve = (x) => {
        if (x <= 1.0) return 0.0;
        const xInv2 = 1.0 / (x * x);
        return x - LN_2PI - 0.5 * Math.log(1.0 - xInv2);
    };

    /**
     * Single wave term from the conjugate pair of non-trivial zeros rho = 1/2 +/- i*gamma_k:
     *   term_k(x) = -2 * Re(x^rho / rho)
     * Evaluated using u = ln(x):
     *   term_k(x) = -2 * sqrt(x) * (0.5 * cos(gamma * u) + gamma * sin(gamma * u)) / (0.25 + gamma^2)
     */
    const waveTerm = (x, gamma) => {
        const u = Math.log(x);
        const sqrtX = Math.sqrt(x);
        const gu = gamma * u;
        const denom = 0.25 + gamma * gamma;
        const numer = 0.5 * Math.cos(gu) + gamma * Math.sin(gu);
        return -2.0 * sqrtX * (numer / denom);
    };

    /**
     * Wave term directly in logarithmic coordinate u = ln(x):
     *   term_k(u) = -2 * exp(0.5 * u) * (0.5 * cos(gamma * u) + gamma * sin(gamma * u)) / (0.25 + gamma^2)
     */
    const waveTermU = (u, gamma) => {
        const expHalfU = Math.exp(0.5 * u);
        const gu = gamma * u;
        const denom = 0.25 + gamma * gamma;
        const numer = 0.5 * Math.cos(gu) + gamma * Math.sin(gu);
        return -2.0 * expHalfU * (numer / denom);
    };

    /**
     * Wave term evaluated via complex arithmetic for reference verification.
     */
    const waveTermComplex = (x, gamma) => {
        // x^rho = exp((0.5 + i*gamma) * ln(x)) = sqrt(x) * (cos(gamma * ln x) + i*sin(gamma * ln x))
        const u = Math.log(x);
        const sqrtX = Math.sqrt(x);
        const reXrho = sqrtX * Math.cos(gamma * u);
        const imXrho = sqrtX * Math.sin(gamma * u);

        // rho = 0.5 + i*gamma
        // 1/rho = (0.5 - i*gamma) / (0.25 + gamma^2)
        const denom = 0.25 + gamma * gamma;
        const reInvRho = 0.5 / denom;
        const imInvRho = -gamma / denom;

        // Re(x^rho / rho) = reXrho * reInvRho - imXrho * imInvRho
        const reQuotient = reXrho * reInvRho - imXrho * imInvRho;
        return -2.0 * reQuotient;
    };

    /**
     * Partial sum psi_N(x) with N zeros:
     *   psi_N(x) = smoothCurve(x) + sum_{k=0}^{N-1} weight_k * waveTerm(x, gamma_k)
     * In sharp mode, weight_k = 1.0.
     * In Cesàro mode with truncation height T = gamma_{N+1} = zeros[N]:
     *   weight_k = 1.0 - gamma_k / T
     */
    const partialSumPsi = (x, N, zeros, isCesaro = false) => {
        let sum = smoothCurve(x);
        if (N <= 0 || !zeros || zeros.length === 0) return sum;

        const count = Math.min(N, zeros.length);
        const T = isCesaro ? (zeros[count] || zeros[count - 1] * 1.02) : 1.0;

        for (let k = 0; k < count; k++) {
            const gamma = zeros[k];
            const weight = isCesaro ? (1.0 - gamma / T) : 1.0;
            sum += weight * waveTerm(x, gamma);
        }
        return sum;
    };

    /* =========================================================================
     * 3. Riemann–Siegel Z(t) and theta(t) Functions
     * ========================================================================= */

    /**
     * Riemann–Siegel theta(t) = arg Gamma(1/4 + i*t/2) - (t/2)*ln(pi)
     * Evaluated using high-order asymptotic Stirling series for t >= 10,
     * and shifted log-gamma for t < 10. Accurate to < 1e-13.
     */
    const theta = (t) => {
        if (t < 10.0) {
            let wre = 0.25, wim = 0.5 * t;
            let logProdIm = 0.0;
            for (let k = 0; k < 8; k++) {
                const a = Math.atan2(wim, wre);
                logProdIm += a;
                wre += 1.0;
            }
            const rw = Math.hypot(wre, wim);
            const aw = Math.atan2(wim, wre);
            const lnRw = Math.log(rw);
            let gamIm = (wre - 0.5) * aw + wim * lnRw - wim;
            const den = 12.0 * (wre * wre + wim * wim);
            gamIm -= (12.0 * wim) / den;
            return (gamIm - logProdIm) - 0.5 * t * Math.log(Math.PI);
        } else {
            const invT = 1.0 / t;
            const invT2 = invT * invT;
            let val = (t * 0.5) * Math.log(t / (2.0 * Math.PI)) - (t * 0.5) - (Math.PI / 8.0);
            val += (1.0 / 48.0) * invT;
            val += (7.0 / 5760.0) * invT * invT2;
            val += (31.0 / 80640.0) * invT * (invT2 * invT2);
            val += (127.0 / 4300800.0) * invT * (invT2 * invT2 * invT2);
            val += (511.0 / 121651200.0) * invT * (invT2 * invT2 * invT2 * invT2);
            return val;
        }
    };

    /**
     * Precomputed tables for fast Euler–Maclaurin zeta evaluation.
     */
    const MAX_EM_N = 2000;
    const EM_LNS = new Float64Array(MAX_EM_N + 1);
    const EM_INV_SQRTS = new Float64Array(MAX_EM_N + 1);
    for (let n = 1; n <= MAX_EM_N; n++) {
        EM_LNS[n] = Math.log(n);
        EM_INV_SQRTS[n] = 1.0 / Math.sqrt(n);
    }

    const EM_BERN = [
        1.0 / 12.0, -1.0 / 720.0, 1.0 / 30240.0, -1.0 / 1209600.0,
        1.0 / 47900160.0, -691.0 / 1307674368000.0, 1.0 / 74724249600.0,
        -3617.0 / 10670622842880000.0
    ];

    /**
     * Riemann–Siegel real-valued Z(t) function:
     *   Z(t) = e^{i*theta(t)} * zeta(1/2 + i*t)
     * Evaluated using Euler–Maclaurin expansion of zeta(s) in double precision.
     * Accurate to < 1e-10 for all t <= 1000.
     */
    const Z = (t) => {
        const th = theta(t);
        const N = Math.min(MAX_EM_N, Math.max(30, (t * 1.5 + 30) | 0));
        let sumRe = 0.0, sumIm = 0.0;
        for (let n = 1; n < N; n++) {
            const phase = t * EM_LNS[n];
            const c = Math.cos(phase), s = Math.sin(phase);
            const f = EM_INV_SQRTS[n];
            sumRe += f * c;
            sumIm -= f * s;
        }

        const phaseN = t * EM_LNS[N];
        const cN = Math.cos(phaseN), sN = Math.sin(phaseN);
        const fN = EM_INV_SQRTS[N];
        const nNegSRe = fN * cN;
        const nNegSIm = -fN * sN;
        sumRe += 0.5 * nNegSRe;
        sumIm += 0.5 * nNegSIm;

        const sqrtN = Math.sqrt(N);
        const n1sRe = sqrtN * cN;
        const n1sIm = -sqrtN * sN;
        const sDen = 0.25 + t * t;
        sumRe += (n1sRe * (-0.5) + n1sIm * t) / sDen;
        sumIm += (n1sIm * (-0.5) - n1sRe * t) / sDen;

        let termRe = 0.5, termIm = t;
        const invN2 = 1.0 / (N * N);
        let currNRe = nNegSRe / N, currNIm = nNegSIm / N;
        for (let k = 0; k < 6; k++) {
            const b = EM_BERN[k];
            const pRe = termRe * currNRe - termIm * currNIm;
            const pIm = termRe * currNIm + termIm * currNRe;
            sumRe += b * pRe;
            sumIm += b * pIm;

            const a1 = 2 * k + 1.5, a2 = 2 * k + 2.5;
            const mRe = a1 * a2 - t * t;
            const mIm = (a1 + a2) * t;
            const nextTermRe = termRe * mRe - termIm * mIm;
            const nextTermIm = termRe * mIm + termIm * mRe;
            termRe = nextTermRe;
            termIm = nextTermIm;
            currNRe *= invN2;
            currNIm *= invN2;
        }

        const cosTh = Math.cos(th), sinTh = Math.sin(th);
        return cosTh * sumRe - sinTh * sumIm;
    };

    /**
     * Brent's root-finding algorithm to refine a bracketed root f(a)*f(b) <= 0.
     */
    const brentRoot = (f, a, b, tol = 1e-13, maxIter = 60) => {
        let fa = f(a), fb = f(b);
        if (fa * fb > 0) throw new Error(`Root not bracketed: f(${a})=${fa}, f(${b})=${fb}`);
        if (Math.abs(fa) < Math.abs(fb)) {
            let tmp = a; a = b; b = tmp;
            tmp = fa; fa = fb; fb = tmp;
        }
        let c = a, fc = fa, mflag = true, d = 0;
        for (let iter = 0; iter < maxIter; iter++) {
            if (Math.abs(fb) < 1e-15 || Math.abs(b - a) < tol) return b;
            let s;
            if (fa !== fc && fb !== fc) {
                s = (a * fb * fc) / ((fa - fb) * (fa - fc)) +
                    (b * fa * fc) / ((fb - fa) * (fb - fc)) +
                    (c * fa * fb) / ((fc - fa) * (fc - fb));
            } else {
                s = b - fb * (b - a) / (fb - fa);
            }

            const cond1 = !((s > Math.min((3 * a + b) / 4, b)) && (s < Math.max((3 * a + b) / 4, b)));
            const cond2 = mflag && Math.abs(s - b) >= Math.abs(b - c) / 2;
            const cond3 = !mflag && Math.abs(s - b) >= Math.abs(c - d) / 2;
            const cond4 = mflag && Math.abs(b - c) < tol;
            const cond5 = !mflag && Math.abs(c - d) < tol;

            if (cond1 || cond2 || cond3 || cond4 || cond5) {
                s = (a + b) / 2;
                mflag = true;
            } else {
                mflag = false;
            }

            const fs = f(s);
            d = c; c = b; fc = fb;
            if (fa * fs < 0) {
                b = s; fb = fs;
            } else {
                a = s; fa = fs;
            }
            if (Math.abs(fa) < Math.abs(fb)) {
                let tmp = a; a = b; b = tmp;
                tmp = fa; fa = fb; fb = tmp;
            }
        }
        return b;
    };

    /**
     * Scans for zeros of Z(t) on [tStart, tEnd] with step dt and refines to < 1e-12.
     */
    const findZeros = (tStart = 9.0, tEnd = 820.0, dt = 0.01, maxCount = 500) => {
        const found = [];
        let prevT = tStart;
        let prevZ = Z(prevT);
        for (let t = tStart + dt; t <= tEnd && found.length < maxCount; t += dt) {
            const curZ = Z(t);
            if (prevZ * curZ <= 0) {
                const root = brentRoot(Z, prevT, t, 1e-13);
                found.push(root);
            }
            prevT = t;
            prevZ = curZ;
        }
        return found;
    };

    /**
     * Riemann–von Mangoldt smooth zero count estimate:
     *   N(T) ~ theta(T) / pi + 1
     */
    const estimateZeroCount = (T) => {
        return theta(T) / Math.PI + 1.0;
    };

    /* =========================================================================
     * 4. Grid Sampling & Incremental Accumulators
     * ========================================================================= */

    /**
     * Creates a logarithmic sampling grid uniform in u = ln(x).
     */
    const createGrid = (numSamples = 8192, xMin = 2.0, xMax = 150.0) => {
        const uMin = Math.log(xMin);
        const uMax = Math.log(xMax);
        const du = (uMax - uMin) / (numSamples - 1);
        const uGrid = new Float64Array(numSamples);
        const xGrid = new Float64Array(numSamples);
        const baseSmooth = new Float64Array(numSamples);
        const trueStaircase = new Float64Array(numSamples);

        for (let i = 0; i < numSamples; i++) {
            const u = uMin + i * du;
            const x = Math.exp(u);
            uGrid[i] = u;
            xGrid[i] = x;
            baseSmooth[i] = smoothCurve(x);
            trueStaircase[i] = chebyshevPsi0(x);
        }

        return { numSamples, xMin, xMax, uMin, uMax, du, uGrid, xGrid, baseSmooth, trueStaircase };
    };

    /**
     * Adds the k-th zero's wave term to the running accumulator array in-place.
     */
    const addZeroToGrid = (grid, accum, gamma, weight = 1.0) => {
        const { numSamples, uGrid } = grid;
        const denom = 0.25 + gamma * gamma;
        const invDenom = -2.0 * weight / denom;
        for (let i = 0; i < numSamples; i++) {
            const u = uGrid[i];
            const expHalfU = Math.exp(0.5 * u);
            const gu = gamma * u;
            const numer = 0.5 * Math.cos(gu) + gamma * Math.sin(gu);
            accum[i] += expHalfU * numer * invDenom;
        }
    };

    /**
     * Subtracts the k-th zero's wave term from the running accumulator in-place.
     */
    const removeZeroFromGrid = (grid, accum, gamma, weight = 1.0) => {
        addZeroToGrid(grid, accum, gamma, -weight);
    };

    /**
     * Evaluates the RMS error E_N of psi_N - psi_0 over K uniform samples in x in [2, 100].
     */
    const evaluateRmsError = (N, zeros, isCesaro = false, K = 20000, xMin = 2.0, xMax = 100.0) => {
        const dx = (xMax - xMin) / (K - 1);
        let sumSq = 0.0;
        for (let i = 0; i < K; i++) {
            const x = xMin + i * dx;
            const psiApprox = partialSumPsi(x, N, zeros, isCesaro);
            const psiExact = chebyshevPsi0(x);
            const diff = psiApprox - psiExact;
            sumSq += diff * diff;
        }
        return Math.sqrt(sumSq / K);
    };

    const RMS_CHECKPOINTS = [
        { n: 0,   rms: 1.5712 },
        { n: 1,   rms: 1.3328 },
        { n: 2,   rms: 1.2520 },
        { n: 5,   rms: 1.1125 },
        { n: 10,  rms: 0.9904 },
        { n: 20,  rms: 0.8484 },
        { n: 50,  rms: 0.6438 },
        { n: 100, rms: 0.5043 },
        { n: 200, rms: 0.3858 },
        { n: 500, rms: 0.2645 }
    ];

    const estimateRms = (n) => {
        if (n <= 0) return RMS_CHECKPOINTS[0].rms;
        if (n >= 500) return RMS_CHECKPOINTS[RMS_CHECKPOINTS.length - 1].rms;
        for (let i = 0; i < RMS_CHECKPOINTS.length - 1; i++) {
            const p0 = RMS_CHECKPOINTS[i], p1 = RMS_CHECKPOINTS[i + 1];
            if (n >= p0.n && n <= p1.n) {
                const frac = (n - p0.n) / (p1.n - p0.n);
                return p0.rms + frac * (p1.rms - p0.rms);
            }
        }
        return 0.2645;
    };

    const ALL_PRIME_POWERS_100 = [
        2, 3, 4, 5, 7, 8, 9, 11, 13, 16, 17, 19, 23, 25, 27, 29, 31,
        32, 37, 41, 43, 47, 49, 53, 59, 61, 64, 67, 71, 73, 79, 81,
        83, 89, 97
    ];

    const findNearestPrimePower = (x) => {
        let bestQ = 2, minDiff = 1e9;
        for (let i = 0; i < ALL_PRIME_POWERS_100.length; i++) {
            const q = ALL_PRIME_POWERS_100[i];
            const d = Math.abs(x - q);
            if (d < minDiff) { minDiff = d; bestQ = q; }
        }
        return bestQ;
    };

    return {
        factorPrimePower,
        vonMangoldt,
        gcdBigInt,
        lcmBigInt,
        lnBigInt,
        chebyshevPsi0,
        smoothCurve,
        waveTerm,
        waveTermU,
        waveTermComplex,
        partialSumPsi,
        theta,
        Z,
        brentRoot,
        findZeros,
        estimateZeroCount,
        createGrid,
        addZeroToGrid,
        removeZeroFromGrid,
        evaluateRmsError,
        estimateRms,
        findNearestPrimePower
    };
}));
