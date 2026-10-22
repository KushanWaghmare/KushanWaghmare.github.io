/**
 * primes-waves.test.js
 *
 * Double-precision mathematical verification test suite for
 * "Primes from waves" (Explicit formula for Chebyshev psi_0(x)).
 *
 * Covers all 8 Phase 1 requirements:
 *   1. Staircase exactness & BigInt lcm(1..n) identity
 *   2. Zero table integrity, golden values, Z(gamma) root tests, and Riemann–von Mangoldt check
 *   3. Wave term closed-form real vs complex equivalence
 *   4. Convergence of psi_N to psi_0 (RMS decay across checkpoints, log-log slope)
 *   5. Locking onto primes at N = 500 (mid-level crossing within 0.5 of q)
 *   6. Cesàro summability & Gibbs overshoot reduction at x = 97
 *   7. Incremental grid update / rollback reversibility
 *   8. Computational performance (< 5 ms per zero on 8,192 samples)
 */

"use strict";

const path = require("path");
const ZM = require(path.join(__dirname, "../../shared/lib/zeta-math.js"));
const zeros = require(path.join(__dirname, "../../shared/lib/zeta-zeros.js"));

let numPassed = 0;
let numTotal = 0;

const assert = (cond, msg) => {
    numTotal++;
    if (!cond) {
        console.error(`  FAIL [Test ${numTotal}]: ${msg}`);
        throw new Error(msg);
    }
    console.log(`  ✓ ${numTotal}. ${msg}`);
    numPassed++;
};

console.log("\n=======================================================");
console.log("  Primes from Waves (Double-Precision Mathematical Core)");
console.log("=======================================================\n");

/* -------------------------------------------------------------------------
 * Test 1: Staircase Exactness & BigInt LCM Identity
 * ------------------------------------------------------------------------- */
(() => {
    console.log("--- 1. Staircase Exactness & Chebyshev Identity ---");
    let maxRelError = 0.0;
    let primePowerJumpsValid = true;

    for (let n = 1; n <= 200; n++) {
        let sumLambda = 0.0;
        for (let m = 2; m <= n; m++) {
            sumLambda += ZM.vonMangoldt(m);
        }
        const lcm = ZM.lcmBigInt(n);
        const lnLcm = ZM.lnBigInt(lcm);

        const diff = Math.abs(sumLambda - lnLcm);
        const rel = n === 1 ? diff : diff / sumLambda;
        if (rel > maxRelError) maxRelError = rel;

        // Check jump at n
        const pp = ZM.factorPrimePower(n);
        const expectedJump = pp ? Math.log(pp.p) : 0.0;
        const actualJump = ZM.vonMangoldt(n);
        if (Math.abs(expectedJump - actualJump) > 1e-15) {
            primePowerJumpsValid = false;
        }
    }

    assert(maxRelError < 1e-12,
        `Staircase exactness: sum_{m<=n} Lambda(m) equals ln(lcm(1..n)) to ${maxRelError.toExponential(4)} rel (< 1e-12) for n=1..200`);
    assert(primePowerJumpsValid,
        `Every prime power p^k shows a jump of exactly ln(p) while composite numbers with multiple prime factors show 0`);
})();

/* -------------------------------------------------------------------------
 * Test 2: Zero Table Integrity & Riemann–von Mangoldt Count Check
 * ------------------------------------------------------------------------- */
(() => {
    console.log("\n--- 2. Zero Table Verification ---");
    
    // (a) Golden values
    const golden = [
        { k: 1, val: 14.134725141734693, z: zeros[0] },
        { k: 2, val: 21.022039638771555, z: zeros[1] },
        { k: 3, val: 25.010857580145689, z: zeros[2] },
        { k: 4, val: 30.424876125859513, z: zeros[3] },
        { k: 5, val: 32.935061587739190, z: zeros[4] },
        { k: 10, val: 49.773832477672302, z: zeros[9] },
        { k: 100, val: 236.52422966581621, z: zeros[99] },
    ];
    let maxGoldenDiff = 0.0;
    for (const g of golden) {
        const diff = Math.abs(g.val - g.z);
        if (diff > maxGoldenDiff) maxGoldenDiff = diff;
    }
    assert(maxGoldenDiff < 1e-9,
        `Golden zero values agree: max diff = ${maxGoldenDiff.toExponential(4)} (< 1e-9)`);

    // (b) |Z(gamma_k)| < 1e-7 and sign change across +/- 1e-6
    let maxAbsZ = 0.0;
    let allSignChanges = true;
    for (let k = 0; k < zeros.length; k++) {
        const g = zeros[k];
        const zg = Math.abs(ZM.Z(g));
        if (zg > maxAbsZ) maxAbsZ = zg;
        const zMinus = ZM.Z(g - 1e-6);
        const zPlus = ZM.Z(g + 1e-6);
        if (zMinus * zPlus > 0.0) {
            allSignChanges = false;
        }
    }
    assert(maxAbsZ < 1e-7 && allSignChanges,
        `Root condition on Z(t): max |Z(gamma_k)| = ${maxAbsZ.toExponential(4)} (< 1e-7) and sign change verified across +/- 1e-6 for all 500 zeros`);

    // (c) Independently re-running the root-finder reproduces the whole table to 1e-9
    const tStart = 9.0;
    const tEnd = zeros[zeros.length - 1] + 1.0;
    const freshZeros = ZM.findZeros(tStart, tEnd, 0.01, zeros.length);
    let maxReproduceDiff = 0.0;
    for (let k = 0; k < zeros.length; k++) {
        const diff = Math.abs(freshZeros[k] - zeros[k]);
        if (diff > maxReproduceDiff) maxReproduceDiff = diff;
    }
    assert(freshZeros.length === zeros.length && maxReproduceDiff < 1e-9,
        `Independent re-run of root-finder reproduced all 500 zeros: max diff = ${maxReproduceDiff.toExponential(4)} (< 1e-9)`);

    // (d) Strictly increasing with minimum gap > 0.05
    let strictlyIncreasing = true;
    let minGap = Infinity;
    for (let k = 1; k < zeros.length; k++) {
        const gap = zeros[k] - zeros[k - 1];
        if (gap <= 0) strictlyIncreasing = false;
        if (gap < minGap) minGap = gap;
    }
    assert(strictlyIncreasing && minGap > 0.05,
        `Monotonicity and spacing: strictly increasing with minimum gap = ${minGap.toFixed(4)} > 0.05`);

    // (e) Riemann–von Mangoldt checkpoint comparison
    // Note: This is a consistency check against the asymptotic zero-counting function N(T) ~ theta(T)/pi + 1,
    // not a formal proof of completeness (no Lehmer pairs missed).
    const maxT = zeros[zeros.length - 1] + 1.0;
    let maxCountDiff = 0.0;
    const checkpointDetails = [];
    for (let T = 100; T <= maxT; T += 100) {
        let count = 0;
        for (let i = 0; i < zeros.length; i++) {
            if (zeros[i] <= T) count++;
            else break;
        }
        const est = ZM.estimateZeroCount(T);
        const diff = Math.abs(count - est);
        if (diff > maxCountDiff) maxCountDiff = diff;
        checkpointDetails.push(`T=${T}: N=${count}, est=${est.toFixed(3)}, |diff|=${diff.toFixed(3)}`);
    }
    assert(maxCountDiff <= 1.0,
        `Riemann–von Mangoldt consistency check: zero counts match theta(T)/pi + 1 within ${maxCountDiff.toFixed(3)} <= 1 at checkpoints [${checkpointDetails.join("; ")}] (consistency check, not a formal completeness proof)`);
})();

/* -------------------------------------------------------------------------
 * Test 3: Wave Term Equivalence (Real Closed-Form vs Complex Arithmetic)
 * ------------------------------------------------------------------------- */
(() => {
    console.log("\n--- 3. Wave Term Closed-Form vs Complex Arithmetic ---");
    let maxDiff = 0.0;
    const numTrials = 10000;
    for (let i = 0; i < numTrials; i++) {
        const x = 2.0 + Math.random() * 98.0; // x in [2, 100]
        const gamma = 10.0 + Math.random() * 800.0; // gamma in [10, 810]
        const realForm = ZM.waveTerm(x, gamma);
        const compForm = ZM.waveTermComplex(x, gamma);
        const diff = Math.abs(realForm - compForm);
        if (diff > maxDiff) maxDiff = diff;
    }
    assert(maxDiff < 1e-12,
        `Real closed-form waveTerm matches -2*Re(x^rho/rho) to ${maxDiff.toExponential(4)} (< 1e-12) over 10,000 random (x, gamma) pairs`);
})();

/* -------------------------------------------------------------------------
 * Test 4: Convergence (The Key Test)
 * ------------------------------------------------------------------------- */
(() => {
    console.log("\n--- 4. Explicit Formula Convergence Across Checkpoints ---");
    const K = 20000;
    const xMin = 2.0, xMax = 100.0;
    const dx = (xMax - xMin) / (K - 1);
    const xs = new Float64Array(K);
    const psiExact = new Float64Array(K);
    const psiApprox = new Float64Array(K);

    for (let i = 0; i < K; i++) {
        const x = xMin + i * dx;
        xs[i] = x;
        psiExact[i] = ZM.chebyshevPsi0(x);
        psiApprox[i] = ZM.smoothCurve(x);
    }

    const checkpoints = [0, 1, 2, 5, 10, 20, 50, 100, 200, 500];
    let currentN = 0;
    const rmsResults = [];

    for (const targetN of checkpoints) {
        while (currentN < targetN) {
            const gamma = zeros[currentN];
            for (let i = 0; i < K; i++) {
                psiApprox[i] += ZM.waveTerm(xs[i], gamma);
            }
            currentN++;
        }
        let sumSq = 0.0;
        for (let i = 0; i < K; i++) {
            const diff = psiApprox[i] - psiExact[i];
            sumSq += diff * diff;
        }
        const rms = Math.sqrt(sumSq / K);
        const gammaN = targetN > 0 ? zeros[targetN - 1] : 0.0;
        rmsResults.push({ N: targetN, gammaN, rms });
    }

    // Check strictly decreasing
    let strictlyDecreasing = true;
    for (let i = 1; i < rmsResults.length; i++) {
        if (rmsResults[i].rms >= rmsResults[i - 1].rms) {
            strictlyDecreasing = false;
        }
    }

    const E0 = rmsResults[0].rms;
    const E500 = rmsResults[rmsResults.length - 1].rms;
    const ratio = E500 / E0;

    // Log-log slope of E against gamma_N for N >= 1
    const positiveCheckpoints = rmsResults.filter(r => r.N >= 1);
    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
    const nPts = positiveCheckpoints.length;
    for (const r of positiveCheckpoints) {
        const lx = Math.log(r.gammaN);
        const ly = Math.log(r.rms);
        sumX += lx; sumY += ly; sumXY += lx * ly; sumX2 += lx * lx;
    }
    const logLogSlope = (nPts * sumXY - sumX * sumY) / (nPts * sumX2 - sumX * sumX);

    console.log("   Convergence table (N, gamma_N, RMS):");
    for (const r of rmsResults) {
        console.log(`     N = ${String(r.N).padStart(3)}: gamma_N = ${r.gammaN.toFixed(2).padStart(6)}, RMS = ${r.rms.toFixed(6)}`);
    }
    console.log(`   Log-log slope of E vs gamma_N: ${logLogSlope.toFixed(4)} (theoretical expectation ~ -0.5)`);

    assert(strictlyDecreasing,
        `RMS error E_N is strictly decreasing across all checkpoints {0, 1, 2, 5, 10, 20, 50, 100, 200, 500}`);
    assert(ratio < 0.25,
        `E_500 / E_0 = ${ratio.toFixed(4)} = ${(ratio * 100).toFixed(2)}% < 25% (E_0 = ${E0.toFixed(4)}, E_500 = ${E500.toFixed(4)})`);
})();

/* -------------------------------------------------------------------------
 * Test 5: Locking Onto Primes at N = 500
 * ------------------------------------------------------------------------- */
(() => {
    console.log("\n--- 5. Locking Onto Primes (Mid-level Crossing) ---");
    const N = 500;
    const primePowers = [];
    for (let n = 2; n <= 100; n++) {
        const pp = ZM.factorPrimePower(n);
        if (pp) primePowers.push({ q: n, p: pp.p, k: pp.k });
    }

    let maxDeviation = 0.0;
    for (const { q } of primePowers) {
        const midLevel = ZM.chebyshevPsi0(q);
        const f = (x) => ZM.partialSumPsi(x, N, zeros, false) - midLevel;

        // Search for bracket in [q - 0.5, q + 0.5]
        const a = q - 0.5, b = q + 0.5;
        const step = 0.01;
        let root = null;
        let prevX = a, prevF = f(a);
        for (let x = a + step; x <= b + 1e-9; x += step) {
            const curF = f(x);
            if (prevF * curF <= 0.0) {
                root = ZM.brentRoot(f, prevX, x, 1e-9);
                break;
            }
            prevX = x;
            prevF = curF;
        }

        if (root === null) {
            throw new Error(`Failed to bracket mid-level crossing near prime power q = ${q}`);
        }
        const dev = Math.abs(root - q);
        if (dev > maxDeviation) maxDeviation = dev;
    }

    assert(maxDeviation < 0.5,
        `Locking onto primes: for all ${primePowers.length} prime powers q <= 100, mid-level crossing lies within ${maxDeviation.toFixed(4)} of q (< 0.5)`);
})();

/* -------------------------------------------------------------------------
 * Test 6: Cesàro Mode & Gibbs Overshoot Reduction
 * ------------------------------------------------------------------------- */
(() => {
    console.log("\n--- 6. Cesàro Mode & Gibbs Overshoot Reduction ---");
    // (a) Cesàro weights equal continuous average (1/T) \int_0^T psi_t(x) dt to 1e-12
    const N_test = 60;
    const T = zeros[N_test];
    const sampleX = 42.0;
    const cesaroSum = ZM.partialSumPsi(sampleX, N_test, zeros, true);

    let intVal = zeros[0] * ZM.smoothCurve(sampleX);
    let currentSharp = ZM.smoothCurve(sampleX);
    for (let k = 0; k < N_test; k++) {
        currentSharp += ZM.waveTerm(sampleX, zeros[k]);
        const dt = (k === N_test - 1 ? T : zeros[k + 1]) - zeros[k];
        intVal += dt * currentSharp;
    }
    const avgVal = intVal / T;
    const diffAvg = Math.abs(cesaroSum - avgVal);

    assert(diffAvg < 1e-12,
        `Cesàro partial sum equals (1/T) \\int_0^T psi_t(x) dt to ${diffAvg.toExponential(4)} (< 1e-12)`);

    // (b) Gibbs overshoot at x = 97
    const N = 500;
    const q = 97;
    const jump = Math.log(q);
    const psiPost = ZM.chebyshevPsi0(q) + 0.5 * jump; // psi(97+)

    let maxSharp = -Infinity;
    let maxCesaro = -Infinity;
    for (let x = 97.001; x <= 98.0; x += 0.0005) {
        const s = ZM.partialSumPsi(x, N, zeros, false);
        const c = ZM.partialSumPsi(x, N, zeros, true);
        if (s > maxSharp) maxSharp = s;
        if (c > maxCesaro) maxCesaro = c;
    }

    const overSharp = Math.max(0.0, maxSharp - psiPost);
    const overCesaro = Math.max(0.0, maxCesaro - psiPost);
    const fracSharp = overSharp / jump;
    const fracCesaro = overCesaro / jump;
    const reduction = (overSharp - overCesaro) / overSharp;

    console.log(`   Overshoot at x = 97 (jump height = ${jump.toFixed(4)}):`);
    console.log(`     Sharp mode : max = ${maxSharp.toFixed(4)}, overshoot = ${overSharp.toFixed(4)} (${(fracSharp * 100).toFixed(2)}% of jump)`);
    console.log(`     Cesàro mode: max = ${maxCesaro.toFixed(4)}, overshoot = ${overCesaro.toFixed(4)} (${(fracCesaro * 100).toFixed(2)}% of jump)`);
    console.log(`     Overshoot reduction: ${(reduction * 100).toFixed(2)}% (requirement: >= 50%)`);

    assert(reduction >= 0.50,
        `Cesàro mode reduces Gibbs overshoot at x = 97 by ${(reduction * 100).toFixed(2)}% (>= 50%, sharp = ${(fracSharp * 100).toFixed(2)}%, Cesàro = ${(fracCesaro * 100).toFixed(2)}%)`);
})();

/* -------------------------------------------------------------------------
 * Test 7: Incremental Accumulator Update & Rollback Reversibility
 * ------------------------------------------------------------------------- */
(() => {
    console.log("\n--- 7. Incremental Grid Accumulator Integrity ---");
    const grid = ZM.createGrid(8192, 2.0, 150.0);
    const accum = new Float64Array(8192);

    // 500 additions
    for (let k = 0; k < 500; k++) {
        ZM.addZeroToGrid(grid, accum, zeros[k]);
    }

    // Compare with direct fresh evaluation
    let maxFreshDiff = 0.0;
    for (let i = 0; i < 8192; i++) {
        const fresh = ZM.partialSumPsi(grid.xGrid[i], 500, zeros, false) - grid.baseSmooth[i];
        const diff = Math.abs(accum[i] - fresh);
        if (diff > maxFreshDiff) maxFreshDiff = diff;
    }

    // 500 removals (rollback)
    for (let k = 499; k >= 0; k--) {
        ZM.removeZeroFromGrid(grid, accum, zeros[k]);
    }

    let maxResidual = 0.0;
    for (let i = 0; i < 8192; i++) {
        const diff = Math.abs(accum[i]);
        if (diff > maxResidual) maxResidual = diff;
    }

    assert(maxFreshDiff < 1e-9,
        `Incremental addition of 500 zeros matches fresh evaluation to ${maxFreshDiff.toExponential(4)} (< 1e-9)`);
    assert(maxResidual < 1e-9,
        `Complete rollback (500 additions + 500 removals) returns to zero to ${maxResidual.toExponential(4)} (< 1e-9)`);
})();

/* -------------------------------------------------------------------------
 * Test 8: Performance Benchmark
 * ------------------------------------------------------------------------- */
(() => {
    console.log("\n--- 8. Incremental Wave Addition Benchmark ---");
    const grid = ZM.createGrid(8192, 2.0, 150.0);
    const accum = new Float64Array(8192);

    // Warm-up
    for (let i = 0; i < 50; i++) {
        ZM.addZeroToGrid(grid, accum, zeros[i % 50]);
    }

    const iters = 1000;
    const start = process.hrtime.bigint();
    for (let i = 0; i < iters; i++) {
        ZM.addZeroToGrid(grid, accum, zeros[i % zeros.length]);
    }
    const end = process.hrtime.bigint();
    const totalMs = Number(end - start) / 1e6;
    const avgMs = totalMs / iters;

    console.log(`   Incremental add of one zero on 8,192 grid points: ${avgMs.toFixed(4)} ms (requirement: < 5 ms)`);
    assert(avgMs < 5.0,
        `Performance verified: single-zero incremental addition takes ${avgMs.toFixed(4)} ms (< 5 ms threshold)`);
})();

console.log("\n=======================================================");
console.log(`  All ${numPassed} / ${numTotal} Tests Passed Successfully!`);
console.log("=======================================================\n");
