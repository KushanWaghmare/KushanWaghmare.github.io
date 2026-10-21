/**
 * market.test.js
 *
 * Deterministic double-precision test suite for quantitative finance mathematics:
 * Tests MarketMath from shared/lib/market-math.js.
 *
 * 1. Sample correlation vs analytic factor-model correlation (200,000 simulated days, max error < 0.01).
 * 2. Mantegna metric exactness d_ij = ||r_tilde_i - r_tilde_j|| to 1e-9 and triangle inequality for all triples.
 * 3. Kruskal MST vs Prim MST on 30 random matrices and brute-force N=8 tree enumeration.
 * 4. Jacobi eigensolver on pure i.i.d. noise returns (N=100, T=500, 20 seeds) matching Marchenko-Pastur bounds.
 * 5. Regime shift: calm -> crisis increases rho_bar and lambda_1/N, and decreases L.
 * 6. SMACOF stress monotonicity: non-increasing at every single iteration (tolerance 1e-12).
 * 7. Layout continuity: smooth regime ramp moves no node > 5% of layout diameter.
 * 8. Matrix reconstruction: V * diag(lambda) * V^T recovers C to < 1e-9 and sum(lambda_i) = N to 1e-9.
 */

const assert = require("assert");
const M = require("../../shared/lib/market-math.js");

console.log("=== Running Market Maths Verification Suite (scratch/tests/market.test.js) ===");

const suiteStart = Date.now();
let passedTests = 0;

/* =========================================================================
   Test 1: Sample correlation vs Analytic factor-model correlation
   ========================================================================= */
{
    console.log("\n[Test 1] Sample correlation vs Analytic factor-model (200,000 days)...");
    const t0 = Date.now();
    const assets = M.createAssetUniverse(42);
    const N = assets.length;
    const T = 200000;
    const rng = M.mulberry32(12345);
    const normal = M.createNormalSampler(rng);

    const history = new Float64Array(T * N);
    for (let t = 0; t < T; t++) {
        const ret = M.sampleDailyReturns(assets, M.SIGMA_M_CALM, normal);
        const offset = t * N;
        for (let i = 0; i < N; i++) history[offset + i] = ret[i];
    }

    const { C: sampleC } = M.computeCorrelationMatrix(history, T, N);
    const { C: analyticC } = M.analyticCorrelationMatrix(assets, M.SIGMA_M_CALM);

    let maxError = 0.0;
    for (let i = 0; i < N; i++) {
        for (let j = 0; j < N; j++) {
            const err = Math.abs(sampleC[i][j] - analyticC[i][j]);
            if (err > maxError) maxError = err;
        }
    }

    console.log(`  Measured max-element error: ${maxError.toExponential(4)} (threshold: 0.01) [${Date.now() - t0} ms]`);
    assert(maxError < 0.01, `Max element error ${maxError} exceeded 0.01`);
    passedTests++;
}

/* =========================================================================
   Test 2: Mantegna metric exactness and Triangle inequality
   ========================================================================= */
{
    console.log("\n[Test 2] Mantegna metric: d_ij = ||r_tilde_i - r_tilde_j|| and Triangle inequality...");
    const assets = M.createAssetUniverse(42);
    const N = assets.length;
    const T = 90;
    const rng = M.mulberry32(777);
    const normal = M.createNormalSampler(rng);

    const history = new Float64Array(T * N);
    for (let t = 0; t < T; t++) {
        const ret = M.sampleDailyReturns(assets, M.SIGMA_M_CALM, normal);
        const offset = t * N;
        for (let i = 0; i < N; i++) history[offset + i] = ret[i];
    }

    const { C, means, stds } = M.computeCorrelationMatrix(history, T, N);
    const D = M.computeDistanceMatrix(C);

    // Standardised return vectors: r_tilde[i] scaled by 1 / sqrt(T - 1)
    const rTilde = Array.from({ length: N }, () => new Float64Array(T));
    for (let i = 0; i < N; i++) {
        const scale = 1.0 / (stds[i] * Math.sqrt(T - 1));
        for (let t = 0; t < T; t++) {
            rTilde[i][t] = (history[t * N + i] - means[i]) * scale;
        }
    }

    // 1. Check d_ij = ||r_tilde_i - r_tilde_j||
    let maxDistDiff = 0.0;
    for (let i = 0; i < N; i++) {
        for (let j = 0; j < N; j++) {
            let l2Sq = 0.0;
            for (let t = 0; t < T; t++) {
                const diff = rTilde[i][t] - rTilde[j][t];
                l2Sq += diff * diff;
            }
            const vecDist = Math.sqrt(l2Sq);
            const mantegnaDist = D[i][j];
            const err = Math.abs(vecDist - mantegnaDist);
            if (err > maxDistDiff) maxDistDiff = err;
        }
    }

    console.log(`  Measured max Mantegna distance difference: ${maxDistDiff.toExponential(4)} (threshold: 1e-9)`);
    assert(maxDistDiff < 1e-9, `Mantegna distance difference ${maxDistDiff} exceeded 1e-9`);

    // 2. Triangle inequality for all triples (i, j, k): d_ik <= d_ij + d_jk
    let maxTriangleViolation = 0.0;
    let totalTriples = 0;
    for (let i = 0; i < N; i++) {
        for (let j = 0; j < N; j++) {
            for (let k = 0; k < N; k++) {
                totalTriples++;
                const violation = D[i][k] - (D[i][j] + D[j][k]);
                if (violation > maxTriangleViolation) maxTriangleViolation = violation;
            }
        }
    }

    console.log(`  Checked ${totalTriples} triples; max triangle violation: ${maxTriangleViolation.toExponential(4)} (threshold: 1e-9)`);
    assert(maxTriangleViolation <= 1e-9, `Triangle inequality violation ${maxTriangleViolation} exceeded 1e-9`);
    passedTests++;
}

/* =========================================================================
   Test 3: Minimum Spanning Tree: Kruskal vs Prim and N=8 Brute-Force
   ========================================================================= */
{
    console.log("\n[Test 3] MST: Kruskal vs Prim (30 random matrices) & Brute-Force (N=8)...");
    const rng = M.mulberry32(101);
    let maxKruskalPrimDiff = 0.0;

    for (let trial = 0; trial < 30; trial++) {
        const N = 24;
        const D = Array.from({ length: N }, () => new Float64Array(N));
        for (let i = 0; i < N; i++) {
            for (let j = i + 1; j < N; j++) {
                const w = 0.1 + rng() * 10.0;
                D[i][j] = w;
                D[j][i] = w;
            }
        }
        const kruskal = M.computeMST(D).totalWeight;
        const prim = M.computeMSTPrim(D);
        const diff = Math.abs(kruskal - prim);
        if (diff > maxKruskalPrimDiff) maxKruskalPrimDiff = diff;
    }

    console.log(`  30 random matrices: max |Kruskal - Prim| = ${maxKruskalPrimDiff.toExponential(4)} (threshold: 1e-12)`);
    assert(maxKruskalPrimDiff < 1e-12, `Kruskal vs Prim diff ${maxKruskalPrimDiff} exceeded 1e-12`);

    // Brute-force N = 8 tree enumeration via Cayley's Prufer sequence (8^(8-2) = 262,144 trees)
    const N8 = 8;
    const D8 = Array.from({ length: N8 }, () => new Float64Array(N8));
    for (let i = 0; i < N8; i++) {
        for (let j = i + 1; j < N8; j++) {
            const w = 0.1 + rng() * 5.0;
            D8[i][j] = w;
            D8[j][i] = w;
        }
    }

    const kruskal8Weight = M.computeMST(D8).totalWeight;

    function treeWeightFromPrufer(seq, n, dist) {
        const degree = new Int32Array(n).fill(1);
        for (let i = 0; i < seq.length; i++) degree[seq[i]]++;
        let weight = 0;
        for (let i = 0; i < seq.length; i++) {
            const u = seq[i];
            for (let v = 0; v < n; v++) {
                if (degree[v] === 1) {
                    weight += dist[u][v];
                    degree[u]--;
                    degree[v]--;
                    break;
                }
            }
        }
        let u = -1, v = -1;
        for (let i = 0; i < n; i++) {
            if (degree[i] === 1) {
                if (u === -1) u = i;
                else { v = i; break; }
            }
        }
        weight += dist[u][v];
        return weight;
    }

    let minTreeWeight = Infinity;
    const seq = new Int32Array(6);

    function enumeratePrufer(depth) {
        if (depth === 6) {
            const w = treeWeightFromPrufer(seq, N8, D8);
            if (w < minTreeWeight) minTreeWeight = w;
            return;
        }
        for (let val = 0; val < 8; val++) {
            seq[depth] = val;
            enumeratePrufer(depth + 1);
        }
    }
    enumeratePrufer(0);

    const bruteDiff = Math.abs(kruskal8Weight - minTreeWeight);
    console.log(`  N=8 brute-force (262,144 trees): Kruskal = ${kruskal8Weight.toFixed(6)}, Brute = ${minTreeWeight.toFixed(6)}, diff = ${bruteDiff.toExponential(4)}`);
    assert(bruteDiff < 1e-12, `Kruskal vs Brute-force diff ${bruteDiff} exceeded 1e-12`);
    passedTests++;
}

/* =========================================================================
   Test 4: Jacobi eigensolver on pure i.i.d. noise matching Marchenko-Pastur
   ========================================================================= */
{
    console.log("\n[Test 4] Jacobi eigensolver on i.i.d. noise (N=100, T=500, 20 seeds) vs Marchenko-Pastur...");
    const N = 100;
    const T = 500;
    const { lambdaPlus, lambdaMinus } = M.marchenkoPasturBounds(N, T);
    console.log(`  Theoretical bounds: lambda_+ = ${lambdaPlus.toFixed(4)}, lambda_- = ${lambdaMinus.toFixed(4)}`);

    let totalEigenvalues = 0;
    let inBoundsEigenvalues = 0;
    let minMaxRatio = Infinity;
    let maxMaxRatio = -Infinity;

    for (let seed = 1; seed <= 20; seed++) {
        const rng = M.mulberry32(seed * 997);
        const normal = M.createNormalSampler(rng);
        const history = new Float64Array(T * N);
        for (let t = 0; t < T; t++) {
            for (let i = 0; i < N; i++) history[t * N + i] = normal();
        }
        const { C } = M.computeCorrelationMatrix(history, T, N);
        const { values } = M.jacobiEigenvalues(C);

        const maxEig = values[0];
        const ratio = maxEig / lambdaPlus;
        if (ratio < minMaxRatio) minMaxRatio = ratio;
        if (ratio > maxMaxRatio) maxMaxRatio = ratio;

        assert(ratio >= 0.92 && ratio <= 1.08, `Seed ${seed} max eigenvalue ratio ${ratio} outside [0.92, 1.08]`);

        for (let i = 0; i < N; i++) {
            totalEigenvalues++;
            if (values[i] >= lambdaMinus - 0.05 && values[i] <= lambdaPlus + 0.05) {
                inBoundsEigenvalues++;
            }
        }
    }

    const pctInBounds = (inBoundsEigenvalues / totalEigenvalues) * 100;
    console.log(`  Max eigenvalue ratio range: [${minMaxRatio.toFixed(4)}, ${maxMaxRatio.toFixed(4)}] in [0.92, 1.08]`);
    console.log(`  Eigenvalues in [lambda_- - 0.05, lambda_+ + 0.05]: ${pctInBounds.toFixed(2)}% (threshold: >= 97.0%)`);
    assert(pctInBounds >= 97.0, `Only ${pctInBounds}% of eigenvalues fell within bounds`);
    passedTests++;
}

/* =========================================================================
   Test 5: Regime shift: Calm vs Crisis metrics
   ========================================================================= */
{
    console.log("\n[Test 5] Regime shift: Calm vs Crisis metrics...");
    const assets = M.createAssetUniverse(42);
    const N = assets.length;
    const T = M.ROLLING_WINDOW;

    // 1. Analytic metrics
    const { C: C_calm } = M.analyticCorrelationMatrix(assets, M.SIGMA_M_CALM);
    const D_calm = M.computeDistanceMatrix(C_calm);
    const statsCalm = M.computeMarketStats(C_calm, D_calm, T);

    const { C: C_crisis } = M.analyticCorrelationMatrix(assets, M.SIGMA_M_CRISIS);
    const D_crisis = M.computeDistanceMatrix(C_crisis);
    const statsCrisis = M.computeMarketStats(C_crisis, D_crisis, T);

    console.log(`  [Analytic Factor Model]`);
    console.log(`    Calm:   rho_bar = ${statsCalm.rhoBar.toFixed(4)}, lambda_1/N = ${statsCalm.absorptionRatio.toFixed(4)}, L = ${statsCalm.normalisedTreeLength.toFixed(4)}`);
    console.log(`    Crisis: rho_bar = ${statsCrisis.rhoBar.toFixed(4)}, lambda_1/N = ${statsCrisis.absorptionRatio.toFixed(4)}, L = ${statsCrisis.normalisedTreeLength.toFixed(4)}`);

    // Verify regime shift directions
    assert(statsCrisis.rhoBar > statsCalm.rhoBar, "Crisis rho_bar must exceed Calm rho_bar");
    assert(statsCrisis.absorptionRatio > statsCalm.absorptionRatio, "Crisis absorption ratio must exceed Calm absorption ratio");
    assert(statsCrisis.normalisedTreeLength < statsCalm.normalisedTreeLength, "Crisis normalised tree length L must be smaller than Calm L");

    // Check sector correlation tuning
    let withinCalm = 0, withinCalmCount = 0;
    let crossCalm = 0, crossCalmCount = 0;
    for (let i = 0; i < N; i++) {
        for (let j = i + 1; j < N; j++) {
            if (assets[i].sector === assets[j].sector) {
                withinCalm += C_calm[i][j]; withinCalmCount++;
            } else {
                crossCalm += C_calm[i][j]; crossCalmCount++;
            }
        }
    }
    const meanWithinCalm = withinCalm / withinCalmCount;
    const meanCrossCalm = crossCalm / crossCalmCount;

    console.log(`    Calm within-sector rho = ${meanWithinCalm.toFixed(4)} (requirement: > 0.45)`);
    console.log(`    Calm cross-sector rho  = ${meanCrossCalm.toFixed(4)} (requirement: < 0.20)`);
    console.log(`    Crisis mean rho        = ${statsCrisis.rhoBar.toFixed(4)} (requirement: > 0.60)`);

    assert(meanWithinCalm > 0.45, `Calm within-sector mean ${meanWithinCalm} not > 0.45`);
    assert(meanCrossCalm < 0.20, `Calm cross-sector mean ${meanCrossCalm} not < 0.20`);
    assert(statsCrisis.rhoBar > 0.60, `Crisis mean correlation ${statsCrisis.rhoBar} not > 0.60`);

    // 2. Sample returns (T = 90 days rolling window)
    const rng = M.mulberry32(20261021);
    const normal = M.createNormalSampler(rng);
    const histCalm = new Float64Array(T * N);
    for (let t = 0; t < T; t++) {
        const r = M.sampleDailyReturns(assets, M.SIGMA_M_CALM, normal);
        for (let i = 0; i < N; i++) histCalm[t * N + i] = r[i];
    }
    const { C: C_s_calm } = M.computeCorrelationMatrix(histCalm, T, N);
    const D_s_calm = M.computeDistanceMatrix(C_s_calm);
    const sStatsCalm = M.computeMarketStats(C_s_calm, D_s_calm, T);

    const histCrisis = new Float64Array(T * N);
    for (let t = 0; t < T; t++) {
        const r = M.sampleDailyReturns(assets, M.SIGMA_M_CRISIS, normal);
        for (let i = 0; i < N; i++) histCrisis[t * N + i] = r[i];
    }
    const { C: C_s_crisis } = M.computeCorrelationMatrix(histCrisis, T, N);
    const D_s_crisis = M.computeDistanceMatrix(C_s_crisis);
    const sStatsCrisis = M.computeMarketStats(C_s_crisis, D_s_crisis, T);

    console.log(`  [Sample Returns T=90]`);
    console.log(`    Calm:   rho_bar = ${sStatsCalm.rhoBar.toFixed(4)}, lambda_1/N = ${sStatsCalm.absorptionRatio.toFixed(4)}, L = ${sStatsCalm.normalisedTreeLength.toFixed(4)}`);
    console.log(`    Crisis: rho_bar = ${sStatsCrisis.rhoBar.toFixed(4)}, lambda_1/N = ${sStatsCrisis.absorptionRatio.toFixed(4)}, L = ${sStatsCrisis.normalisedTreeLength.toFixed(4)}`);

    assert(sStatsCrisis.rhoBar > sStatsCalm.rhoBar, "Sample crisis rho_bar must exceed calm rho_bar");
    assert(sStatsCrisis.absorptionRatio > sStatsCalm.absorptionRatio, "Sample crisis absorption ratio must exceed calm");
    assert(sStatsCrisis.normalisedTreeLength < sStatsCalm.normalisedTreeLength, "Sample crisis L must be less than calm L");
    passedTests++;
}

/* =========================================================================
   Test 6: SMACOF Stress Monotonicity
   ========================================================================= */
{
    console.log("\n[Test 6] SMACOF: Stress non-increasing at every single iteration (tolerance 1e-12)...");
    const assets = M.createAssetUniverse(42);
    const { C } = M.analyticCorrelationMatrix(assets, M.SIGMA_M_CALM);
    const D = M.computeDistanceMatrix(C);
    const N = D.length;

    let maxStressIncrease = 0.0;

    for (let trial = 0; trial < 10; trial++) {
        const rng = M.mulberry32(trial * 333 + 7);
        let X = Array.from({ length: N }, () => new Float64Array([
            (rng() - 0.5) * 3,
            (rng() - 0.5) * 3,
            (rng() - 0.5) * 3
        ]));

        let prevStress = M.computeStress(X, D);

        for (let iter = 0; iter < 25; iter++) {
            X = M.smacofStep(X, D, 1);
            const currStress = M.computeStress(X, D);
            const delta = currStress - prevStress;
            if (delta > maxStressIncrease) maxStressIncrease = delta;
            assert(delta <= 1e-12, `Stress increased by ${delta} at trial ${trial}, iter ${iter}`);
            prevStress = currStress;
        }
    }

    console.log(`  Tested 10 trials x 25 iterations: max stress change delta <= ${maxStressIncrease.toExponential(4)}`);
    passedTests++;
}

/* =========================================================================
   Test 7: Layout Continuity on Smooth Regime Ramp
   ========================================================================= */
{
    console.log("\n[Test 7] Layout continuity: Node movement <= 5% of layout diameter on smooth ramp...");
    const assets = M.createAssetUniverse(42);
    const N = assets.length;

    // Start with pre-converged calm layout
    let X = M.createInitialLayout(assets, 1.35, 20);

    const numSteps = 100;
    let maxDisplacementRatio = 0.0;

    for (let step = 0; step < numSteps; step++) {
        // Smooth sine ramp between calm and crisis
        const factor = Math.sin((step / numSteps) * Math.PI);
        const sigmaM = M.SIGMA_M_CALM + factor * (M.SIGMA_M_CRISIS - M.SIGMA_M_CALM);
        const { C } = M.analyticCorrelationMatrix(assets, sigmaM);
        const D = M.computeDistanceMatrix(C);

        // 2 warm-started SMACOF iterations + Procrustes rigid alignment
        const nextXRaw = M.smacofStep(X, D, 2);
        const nextX = M.procrustesAlign(nextXRaw, X);

        // Diameter of current layout
        let diameter = 0.0;
        for (let i = 0; i < N; i++) {
            for (let j = i + 1; j < N; j++) {
                const dx = X[i][0] - X[j][0];
                const dy = X[i][1] - X[j][1];
                const dz = X[i][2] - X[j][2];
                const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
                if (d > diameter) diameter = d;
            }
        }

        // Max node displacement between consecutive frames
        let maxNodeDisp = 0.0;
        for (let i = 0; i < N; i++) {
            const dx = nextX[i][0] - X[i][0];
            const dy = nextX[i][1] - X[i][1];
            const dz = nextX[i][2] - X[i][2];
            const disp = Math.sqrt(dx * dx + dy * dy + dz * dz);
            if (disp > maxNodeDisp) maxNodeDisp = disp;
        }

        const ratio = maxNodeDisp / diameter;
        if (ratio > maxDisplacementRatio) maxDisplacementRatio = ratio;

        X = nextX;
    }

    console.log(`  Measured max node displacement ratio: ${(maxDisplacementRatio * 100).toFixed(3)}% (threshold: <= 5.0%)`);
    assert(maxDisplacementRatio <= 0.05, `Max node displacement ratio ${maxDisplacementRatio} exceeded 0.05`);
    passedTests++;
}

/* =========================================================================
   Test 8: Matrix Reconstruction & Trace Preservation
   ========================================================================= */
{
    console.log("\n[Test 8] Matrix reconstruction: V * diag(lambda) * V^T = C and sum(lambda_i) = N...");
    const assets = M.createAssetUniverse(42);
    const { C } = M.analyticCorrelationMatrix(assets, M.SIGMA_M_CALM);
    const N = C.length;
    const { values, vectors } = M.jacobiEigenvalues(C);

    let maxRecError = 0.0;
    for (let i = 0; i < N; i++) {
        for (let j = 0; j < N; j++) {
            let rec = 0.0;
            for (let k = 0; k < N; k++) {
                rec += vectors[i][k] * values[k] * vectors[j][k];
            }
            const err = Math.abs(rec - C[i][j]);
            if (err > maxRecError) maxRecError = err;
        }
    }

    let traceSum = 0.0;
    for (let i = 0; i < N; i++) traceSum += values[i];
    const traceError = Math.abs(traceSum - N);

    console.log(`  Reconstruction max element error: ${maxRecError.toExponential(4)} (threshold: 1e-9)`);
    console.log(`  Trace sum error |sum(lambda_i) - N|: ${traceError.toExponential(4)} (threshold: 1e-9)`);

    assert(maxRecError < 1e-9, `Reconstruction error ${maxRecError} exceeded 1e-9`);
    assert(traceError < 1e-9, `Trace sum error ${traceError} exceeded 1e-9`);
    passedTests++;
}

console.log(`\n=== All ${passedTests} / 8 Market Maths Tests Passed Successfully in ${Date.now() - suiteStart} ms ===\n`);
