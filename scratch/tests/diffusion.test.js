/**
 * diffusion.test.js
 *
 * Physical & mathematical verification suite for 3-D score-based diffusion model.
 * Imports shared/lib/diffusion-math.js directly (same code executed in browser).
 * Uses deterministic mulberry32 PRNG.
 */

"use strict";

const path = require("path");
const DM = require("../../shared/lib/diffusion-math");

console.log("=== SCORE-BASED DIFFUSION MATHEMATICS VERIFICATION SUITE ===\n");

const SEED = 4281903;
const rng = DM.mulberry32(SEED);
const normal = DM.createNormalSampler(rng);

let totalPassed = 0;
let totalFailed = 0;

function assert(condition, message, details = "") {
    if (condition) {
        console.log(`[PASS] ${message}${details ? " -> " + details : ""}`);
        totalPassed++;
    } else {
        console.error(`[FAIL] ${message}${details ? " -> " + details : ""}`);
        totalFailed++;
    }
}

function relFrob(covA, covB) {
    let diffSq = 0, normSq = 0;
    for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 3; c++) {
            const d = covA[r][c] - covB[r][c];
            diffSq += d * d;
            normSq += covB[r][c] * covB[r][c];
        }
    }
    return Math.sqrt(diffSq) / Math.sqrt(normSq);
}

function meanError(mA, mB, covB) {
    const dx = mA[0] - mB[0];
    const dy = mA[1] - mB[1];
    const dz = mA[2] - mB[2];
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    const scale = Math.sqrt((covB[0][0] + covB[1][1] + covB[2][2]) / 3.0);
    return dist / scale;
}

const targetGalaxy = DM.getGalaxyTarget(192);
const targetTrefoil = DM.getTrefoilTarget(192);
const targetTorus = DM.getTorusTarget(192);

// ============================================================================
// TEST 1: Score matches central finite difference of log p_t (h = 1e-5)
// ============================================================================
console.log("Test 1: Score vs Central Finite Difference of log p_t (h = 1e-5)");
{
    const h = 1e-5;
    const inv2h = 1.0 / (2.0 * h);
    const testTimes = [0.05, 0.3, 0.7, 1.0];
    const numPoints = 1000;
    let maxRelError = 0.0;

    for (const t of testTimes) {
        for (let i = 0; i < numPoints; i++) {
            const x = [
                (rng() - 0.5) * 3.0,
                (rng() - 0.5) * 3.0,
                (rng() - 0.5) * 3.0
            ];

            const sAnalytic = DM.score(x, t, targetGalaxy);

            const lpXPlus  = DM.logDensity([x[0] + h, x[1], x[2]], t, targetGalaxy);
            const lpXMinus = DM.logDensity([x[0] - h, x[1], x[2]], t, targetGalaxy);
            const lpYPlus  = DM.logDensity([x[0], x[1] + h, x[2]], t, targetGalaxy);
            const lpYMinus = DM.logDensity([x[0], x[1] - h, x[2]], t, targetGalaxy);
            const lpZPlus  = DM.logDensity([x[0], x[1], x[2] + h], t, targetGalaxy);
            const lpZMinus = DM.logDensity([x[0], x[1], x[2] - h], t, targetGalaxy);

            const sFD = [
                (lpXPlus - lpXMinus) * inv2h,
                (lpYPlus - lpYMinus) * inv2h,
                (lpZPlus - lpZMinus) * inv2h
            ];

            const diffNorm = Math.hypot(
                sAnalytic[0] - sFD[0],
                sAnalytic[1] - sFD[1],
                sAnalytic[2] - sFD[2]
            );
            const sNorm = Math.hypot(sAnalytic[0], sAnalytic[1], sAnalytic[2]);
            const relErr = diffNorm / Math.max(sNorm, 1e-4);

            if (relErr > maxRelError) maxRelError = relErr;
        }
    }

    assert(
        maxRelError < 1e-6,
        "Closed-form score matches central finite difference of log p_t to relative error < 1e-6",
        `Max relative error: ${maxRelError.toExponential(4)} across 4,000 evaluations`
    );
}

// ============================================================================
// TEST 2: Forward marginals match closed-form mixture moments within 1%
// ============================================================================
console.log("\nTest 2: Forward Marginals (200,000 samples) vs Analytic Mixture Moments");
{
    const N = 200000;
    const x0 = DM.sampleP0(targetGalaxy, N, rng);
    const testTimes = [0.1, 0.3, 0.6, 1.0];
    let maxMeanErr = 0;
    let maxCovErr = 0;

    for (const t of testTimes) {
        const xt = DM.forwardStepExact(x0, t, normal);
        const emp = DM.empiricalMoments(xt);
        const exact = DM.marginalMoments(t, targetGalaxy);

        const mErr = meanError(emp.mean, exact.mean, exact.cov);
        const cErr = relFrob(emp.cov, exact.cov);

        if (mErr > maxMeanErr) maxMeanErr = mErr;
        if (cErr > maxCovErr) maxCovErr = cErr;
    }

    assert(
        maxCovErr < 0.01 && maxMeanErr < 0.01,
        "Exact forward kernel matches analytic mixture mean and covariance within 1% (Frobenius)",
        `Max cov error: ${(maxCovErr * 100).toFixed(3)}%, max mean error: ${(maxMeanErr * 100).toFixed(3)}%`
    );
}

// ============================================================================
// TEST 3: Forward Euler-Maruyama SDE matches exact kernel moments within 2%
// ============================================================================
console.log("\nTest 3: Forward Euler-Maruyama SDE (400 steps) vs Exact Kernel Moments");
{
    const N = 100000;
    const tTarget = 0.8;
    const x0 = DM.sampleP0(targetGalaxy, N, rng);
    const xSDE = DM.forwardSDE(x0, tTarget, 400, rng);

    const empSDE = DM.empiricalMoments(xSDE);
    const exact = DM.marginalMoments(tTarget, targetGalaxy);

    const mErr = meanError(empSDE.mean, exact.mean, exact.cov);
    const cErr = relFrob(empSDE.cov, exact.cov);

    assert(
        cErr < 0.02 && mErr < 0.02,
        "Forward Euler-Maruyama SDE matches exact kernel moments within 2%",
        `Cov error: ${(cErr * 100).toFixed(3)}%, mean error: ${(mErr * 100).toFixed(3)}%`
    );
}

// ============================================================================
// TEST 4: Reverse SDE from N(0, I) at t = 1 (N = 180 steps, 20,000 particles)
// ============================================================================
console.log("\nTest 4: Reverse SDE (180 steps, 20,000 particles) vs Target p_0");
{
    const N = 20000;
    const x1 = new Float64Array(N * 3);
    for (let i = 0; i < N * 3; i++) {
        x1[i] = normal();
    }

    console.log("  Running reverse SDE (180 Euler-Maruyama steps on 20,000 particles)...");
    const t0 = Date.now();
    const x0Gen = DM.reverseSDE(x1, 180, targetGalaxy, rng);
    const elapsedMs = Date.now() - t0;
    console.log(`  Completed in ${(elapsedMs / 1000).toFixed(2)}s.`);

    const empGen = DM.empiricalMoments(x0Gen);
    const exactP0 = DM.marginalMoments(0.0, targetGalaxy);

    const mErr = meanError(empGen.mean, exactP0.mean, exactP0.cov);
    const cErr = relFrob(empGen.cov, exactP0.cov);

    // Baseline Wasserstein-1 distance between two independent fresh p0 sample sets
    const refSamples1 = DM.sampleP0(targetGalaxy, N, rng);
    const refSamples2 = DM.sampleP0(targetGalaxy, N, rng);
    const baselineSW1 = DM.slicedWasserstein1(refSamples1, refSamples2, 64, rng);
    const genSW1 = DM.slicedWasserstein1(x0Gen, refSamples1, 64, rng);

    console.log(`  Moments: mean error = ${(mErr * 100).toFixed(3)}%, cov error = ${(cErr * 100).toFixed(3)}%`);
    console.log(`  Sliced Wasserstein-1: generated vs target = ${genSW1.toFixed(5)}, baseline = ${baselineSW1.toFixed(5)}`);

    const momentPass = cErr < 0.03 && mErr < 0.03;
    const sw1Pass = genSW1 <= 2.0 * baselineSW1 + 1e-3;

    assert(
        momentPass,
        "Reverse SDE final mean and covariance match target p_0 within 3%",
        `Cov error: ${(cErr * 100).toFixed(2)}%, mean error: ${(mErr * 100).toFixed(2)}%`
    );

    assert(
        sw1Pass,
        "Reverse SDE Sliced-Wasserstein-1 distance is <= 2x baseline distance + 1e-3",
        `Gen SW1: ${genSW1.toFixed(5)} <= Threshold: ${(2.0 * baselineSW1 + 1e-3).toFixed(5)}`
    );
}

// ============================================================================
// TEST 5: Probability-Flow ODE gives same moment match as Test 4
// ============================================================================
console.log("\nTest 5: Probability-Flow ODE (180 steps, 20,000 particles) vs Target p_0");
{
    const N = 20000;
    const x1 = new Float64Array(N * 3);
    for (let i = 0; i < N * 3; i++) {
        x1[i] = normal();
    }

    console.log("  Running probability-flow ODE (180 steps on 20,000 particles)...");
    const t0 = Date.now();
    const x0ODE = DM.reverseODE(x1, 180, targetGalaxy);
    const elapsedMs = Date.now() - t0;
    console.log(`  Completed in ${(elapsedMs / 1000).toFixed(2)}s.`);

    const empODE = DM.empiricalMoments(x0ODE);
    const exactP0 = DM.marginalMoments(0.0, targetGalaxy);

    const mErr = meanError(empODE.mean, exactP0.mean, exactP0.cov);
    const cErr = relFrob(empODE.cov, exactP0.cov);

    assert(
        cErr < 0.03 && mErr < 0.03,
        "Probability-flow ODE final mean and covariance match target p_0 within 3%",
        `Cov error: ${(cErr * 100).toFixed(2)}%, mean error: ${(mErr * 100).toFixed(2)}%`
    );
}

// ============================================================================
// TEST 6: Transition kernel composition s -> a -> b vs direct s -> b
// ============================================================================
console.log("\nTest 6: Transition Kernel Composition & Variance Non-Negativity");
{
    const grid = [
        [0.01, 0.25, 0.70],
        [0.05, 0.40, 0.90],
        [0.10, 0.50, 0.95],
        [0.20, 0.60, 0.99]
    ];

    let allNonNegative = true;
    let maxMeanDiff = 0;
    let maxVarDiff = 0;

    for (const [s, a, b] of grid) {
        const direct = DM.transitionParams(s, b);
        const trans1 = DM.transitionParams(s, a);
        const trans2 = DM.transitionParams(a, b);

        if (direct.var < 0 || trans1.var < 0 || trans2.var < 0) {
            allNonNegative = false;
        }

        // Composite mean coefficient: gamma_{a->b} * gamma_{s->a} == gamma_{s->b}
        const compMeanCoeff = trans2.meanCoeff * trans1.meanCoeff;
        const meanDiff = Math.abs(compMeanCoeff - direct.meanCoeff);
        if (meanDiff > maxMeanDiff) maxMeanDiff = meanDiff;

        // Composite variance: gamma_{a->b}^2 * var_{s->a} + var_{a->b} == var_{s->b}
        const compVar = trans2.meanCoeff * trans2.meanCoeff * trans1.var + trans2.var;
        const varDiff = Math.abs(compVar - direct.var);
        if (varDiff > maxVarDiff) maxVarDiff = varDiff;
    }

    assert(
        allNonNegative,
        "Conditional variance sigma^2_{b|a} is strictly non-negative across all test pairs",
        "sigma^2 >= 0 verified"
    );

    assert(
        maxMeanDiff < 1e-12 && maxVarDiff < 1e-12,
        "Transition kernel composition s -> a -> b identically reproduces direct s -> b",
        `Max mean coeff error: ${maxMeanDiff.toExponential(3)}, max variance error: ${maxVarDiff.toExponential(3)}`
    );
}

// ============================================================================
// TEST 7: Readout function (mean negative log-density) is finite & exact
// ============================================================================
console.log("\nTest 7: Readout Function (Mean Negative Log-Density) Evaluation");
{
    const N = 2048;
    const testSamples = DM.sampleP0(targetGalaxy, N, rng);

    const nllReadout = DM.readoutNLL(testSamples, targetGalaxy);

    let sumDirectNLL = 0;
    let allFinite = true;
    for (let i = 0; i < N; i++) {
        const pt = [testSamples[i * 3], testSamples[i * 3 + 1], testSamples[i * 3 + 2]];
        const lp = DM.logDensity(pt, 0.0, targetGalaxy);
        if (!Number.isFinite(lp)) allFinite = false;
        sumDirectNLL -= lp;
    }
    const directMean = sumDirectNLL / N;
    const diff = Math.abs(nllReadout - directMean);

    assert(
        allFinite && Number.isFinite(nllReadout),
        "Readout function produces strictly finite values for particle sets",
        `Sample NLL: ${nllReadout.toFixed(4)}`
    );

    assert(
        diff < 1e-12,
        "Readout function exactly equals the mean negative log-density to < 1e-12",
        `Absolute error: ${diff.toExponential(4)}`
    );
}

console.log("\n============================================================");
console.log(`TOTAL TESTS: ${totalPassed + totalFailed} | PASSED: ${totalPassed} | FAILED: ${totalFailed}`);
console.log("============================================================\n");

if (totalFailed > 0) {
    process.exit(1);
}
