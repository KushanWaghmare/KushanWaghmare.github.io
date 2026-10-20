"use strict";

/**
 * scratch/tests/spectral-clustering.test.js
 *
 * CPU Reference Test for Graph Laplacian Spectral Decomposition & Clustering
 *
 * Requirements:
 *   1. Smallest Laplacian Eigenvalue:
 *      For any connected graph, the smallest eigenvalue of the unnormalised Laplacian
 *      L = D - A satisfies lambda_1 = 0.0 to within 1e-10.
 *
 *   2. Fiedler Vector Partitioning:
 *      On a planted two-block Stochastic Block Model (SBM) graph (n1 = n2 = 25,
 *      p_in = 0.65, p_out = 0.04), the Fiedler vector v2 (second smallest eigenvector)
 *      partitions the graph into the two planted communities with 100% accuracy.
 */

const assert = require("assert");

// Generate planted 2-block Stochastic Block Model
function generateSBM(n1, n2, pIn, pOut, seed = 4219) {
    const N = n1 + n2;
    const A = Array.from({ length: N }, () => new Float64Array(N));

    let s = seed >>> 0;
    const rand = () => {
        s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
        return s / 4294967296.0;
    };

    for (let i = 0; i < N; i++) {
        for (let j = i + 1; j < N; j++) {
            const sameBlock = (i < n1 && j < n1) || (i >= n1 && j >= n1);
            const prob = sameBlock ? pIn : pOut;
            if (rand() < prob) {
                A[i][j] = 1.0;
                A[j][i] = 1.0;
            }
        }
    }
    return A;
}

// Compute Graph Laplacian L = D - A
function computeLaplacian(A) {
    const N = A.length;
    const L = Array.from({ length: N }, () => new Float64Array(N));
    const degrees = new Float64Array(N);

    for (let i = 0; i < N; i++) {
        let deg = 0.0;
        for (let j = 0; j < N; j++) deg += A[i][j];
        degrees[i] = deg;
    }

    for (let i = 0; i < N; i++) {
        for (let j = 0; j < N; j++) {
            L[i][j] = (i === j ? degrees[i] : 0.0) - A[i][j];
        }
    }

    return { L, degrees };
}

// Symmetric matrix eigensolver via Cyclic Jacobi algorithm
function jacobiEigen(M, maxSweeps = 60, tol = 1e-13) {
    const n = M.length;
    const A = M.map(row => Float64Array.from(row));
    const V = Array.from({ length: n }, (_, i) => {
        const row = new Float64Array(n);
        row[i] = 1.0;
        return row;
    });

    for (let sweep = 0; sweep < maxSweeps; sweep++) {
        let maxOff = 0.0;

        for (let p = 0; p < n; p++) {
            for (let q = p + 1; q < n; q++) {
                const Apq = A[p][q];
                const absApq = Math.abs(Apq);
                if (absApq > maxOff) maxOff = absApq;

                if (absApq < 1e-15) continue;

                const App = A[p][p], Aqq = A[q][q];
                const theta = 0.5 * Math.atan2(2.0 * Apq, App - Aqq);
                const c = Math.cos(theta), s = Math.sin(theta);

                // Rotate A
                for (let k = 0; k < n; k++) {
                    if (k !== p && k !== q) {
                        const Akp = A[k][p], Akq = A[k][q];
                        A[k][p] = A[p][k] = c * Akp + s * Akq;
                        A[k][q] = A[q][k] = -s * Akp + c * Akq;
                    }
                }
                A[p][p] = c * c * App + 2.0 * s * c * Apq + s * s * Aqq;
                A[q][q] = s * s * App - 2.0 * s * c * Apq + c * c * Aqq;
                A[p][q] = A[q][p] = 0.0;

                // Rotate V
                for (let k = 0; k < n; k++) {
                    const Vkp = V[k][p], Vkq = V[k][q];
                    V[k][p] = c * Vkp + s * Vkq;
                    V[k][q] = -s * Vkp + c * Vkq;
                }
            }
        }

        if (maxOff < tol) break;
    }

    const eig = [];
    for (let i = 0; i < n; i++) {
        const vec = new Float64Array(n);
        for (let k = 0; k < n; k++) vec[k] = V[k][i];
        eig.push({ val: A[i][i], vec });
    }
    eig.sort((a, b) => a.val - b.val);

    return eig;
}

function runTest() {
    const n1 = 25, n2 = 25;
    const pIn = 0.65, pOut = 0.04;
    const A = generateSBM(n1, n2, pIn, pOut);
    const { L } = computeLaplacian(A);

    const eig = jacobiEigen(L);

    const lambda1 = Math.abs(eig[0].val);
    const lambda2 = eig[1].val;
    const fiedler = eig[1].vec;

    console.log(`[spectral-clustering] Graph Laplacian eigenvalues:`);
    console.log(`  Smallest eigenvalue lambda1 = ${lambda1.toExponential(4)} (target < 1e-10)`);
    console.log(`  Algebraic connectivity lambda2 = ${lambda2.toFixed(4)}`);

    assert(lambda1 < 1e-10, `Smallest eigenvalue must be 0 to 1e-10: got ${lambda1}`);
    assert(lambda2 > 0.05, `Graph must be connected: lambda2 = ${lambda2}`);

    // Check Fiedler vector community partition:
    // Block 1 should have uniform sign, Block 2 opposite sign
    let b1Pos = 0, b2Pos = 0;
    for (let i = 0; i < n1; i++) {
        if (fiedler[i] > 0) b1Pos++;
    }
    for (let i = n1; i < n1 + n2; i++) {
        if (fiedler[i] > 0) b2Pos++;
    }

    const accuracy = Math.max(
        (b1Pos + (n2 - b2Pos)) / (n1 + n2),
        ((n1 - b1Pos) + b2Pos) / (n1 + n2)
    );

    console.log(`  Fiedler community partition accuracy: ${(accuracy * 100).toFixed(1)}% (target: 100%)`);
    assert.strictEqual(accuracy, 1.0, `Fiedler vector did not achieve 100% community separation: got ${accuracy}`);

    console.log("[spectral-clustering.test.js] ALL PASS");
}

runTest();
