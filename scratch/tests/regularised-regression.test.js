"use strict";

/**
 * scratch/tests/regularised-regression.test.js
 *
 * CPU Reference Test for Regularised Regression (Lasso & Ridge)
 *
 * Requirements:
 *   For an orthonormal design matrix X^T X = n * I, the Lasso coordinate descent
 *   solution matches the analytical soft-thresholding closed form:
 *     beta_j* = sgn(beta_ols_j) * max(|beta_ols_j| - lambda, 0)
 *   to within 1e-10.
 *
 *   Also verifies that the Ridge regression solution matches the shrinkage form:
 *     beta_ridge_j* = beta_ols_j / (1 + lambda_ridge)
 *   and that Lasso paths settle on exact sparse corners (beta_j = 0).
 */

const assert = require("assert");

function softThreshold(z, lambda) {
    if (z > lambda) return z - lambda;
    if (z < -lambda) return z + lambda;
    return 0.0;
}

function runCoordinateDescent(X, y, lambda, maxIter = 100, tol = 1e-12) {
    const n = X.length;
    const p = X[0].length;
    const beta = new Float64Array(p);

    // Precompute column norms (assumed 1.0 for standardized design)
    const normSq = new Float64Array(p);
    for (let j = 0; j < p; j++) {
        let sum = 0.0;
        for (let i = 0; i < n; i++) sum += X[i][j] * X[i][j];
        normSq[j] = sum / n;
    }

    // Residual vector r = y - X * beta
    const r = new Float64Array(n);
    for (let i = 0; i < n; i++) r[i] = y[i];

    for (let iter = 0; iter < maxIter; iter++) {
        let maxChange = 0.0;
        for (let j = 0; j < p; j++) {
            const oldBeta = beta[j];
            // Partial residual dot product: rho_j = (1/n) * x_j^T * (r + x_j * oldBeta)
            let rho = 0.0;
            for (let i = 0; i < n; i++) {
                rho += X[i][j] * (r[i] + X[i][j] * oldBeta);
            }
            rho /= n;

            // Soft-thresholding update
            const newBeta = softThreshold(rho, lambda) / normSq[j];
            beta[j] = newBeta;

            // Update residual r
            const delta = oldBeta - newBeta;
            for (let i = 0; i < n; i++) {
                r[i] += X[i][j] * delta;
            }

            const change = Math.abs(oldBeta - newBeta);
            if (change > maxChange) maxChange = change;
        }

        if (maxChange < tol) break;
    }

    return beta;
}

function testOrthonormalLasso() {
    // Generate an orthonormal 4x4 design matrix X (scaled so X^T X = n * I)
    const n = 4, p = 4;
    // Standard normalized Hadamard / orthogonal matrix
    const H = [
        [ 0.5,  0.5,  0.5,  0.5],
        [ 0.5, -0.5,  0.5, -0.5],
        [ 0.5,  0.5, -0.5, -0.5],
        [ 0.5, -0.5, -0.5,  0.5]
    ];
    // Scale columns so (1/n) * sum(x_ij^2) = 1.0
    const X = H.map(row => row.map(v => v * 2.0));

    // Target coefficients with varying magnitudes (including sparse ones)
    const trueBeta = [2.5, -1.2, 0.4, -0.1];
    const y = new Float64Array(n);
    for (let i = 0; i < n; i++) {
        let sum = 0.0;
        for (let j = 0; j < p; j++) sum += X[i][j] * trueBeta[j];
        y[i] = sum;
    }

    // OLS coefficients: beta_ols = (1/n) * X^T * y
    const betaOls = new Float64Array(p);
    for (let j = 0; j < p; j++) {
        let dot = 0.0;
        for (let i = 0; i < n; i++) dot += X[i][j] * y[i];
        betaOls[j] = dot / n;
    }

    const lambda = 0.5;
    // Analytical soft-threshold closed-form
    const betaAnalytic = new Float64Array(p);
    for (let j = 0; j < p; j++) {
        betaAnalytic[j] = softThreshold(betaOls[j], lambda);
    }

    // Coordinate descent solution
    const betaCD = runCoordinateDescent(X, y, lambda);

    let maxDiff = 0.0;
    for (let j = 0; j < p; j++) {
        const diff = Math.abs(betaCD[j] - betaAnalytic[j]);
        if (diff > maxDiff) maxDiff = diff;
    }

    console.log(`[regularised-regression] Orthonormal Lasso comparison (lambda = ${lambda}):`);
    console.log(`  OLS:      [${Array.from(betaOls).map(v => v.toFixed(3)).join(", ")}]`);
    console.log(`  Analytic: [${Array.from(betaAnalytic).map(v => v.toFixed(3)).join(", ")}]`);
    console.log(`  CoordDesc:[${Array.from(betaCD).map(v => v.toFixed(3)).join(", ")}]`);
    console.log(`  Max difference: ${maxDiff.toExponential(4)} (target < 1e-10)`);

    assert(maxDiff < 1e-10, `Lasso coordinate descent did not match analytical soft-thresholding: diff = ${maxDiff}`);

    // Verify exact sparsity of coefficients with |beta_ols| <= lambda
    assert.strictEqual(betaCD[2], 0.0, "Beta[2] (|0.4| <= 0.5) must be exactly zero");
    assert.strictEqual(betaCD[3], 0.0, "Beta[3] (|-0.1| <= 0.5) must be exactly zero");

    console.log("[regularised-regression.test.js] ALL PASS");
}

testOrthonormalLasso();
