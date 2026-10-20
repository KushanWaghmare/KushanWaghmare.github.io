"use strict";

/**
 * scratch/tests/markov.test.js
 *
 * CPU Reference Test for Ergodic Markov Chains & Random Walkers
 *
 * Requirements:
 *   For an irreducible, aperiodic K=5 transition matrix P:
 *   1. The stationary distribution pi satisfies pi * P = pi and sum(pi) = 1.0.
 *   2. An ensemble of N = 10,000 random walkers integrated over 1,000 steps
 *      converges to pi with total variation distance d_TV(p_emp, pi) < 0.015.
 */

const assert = require("assert");

// K=5 ergodic transition matrix
const P = [
    [0.10, 0.45, 0.25, 0.15, 0.05],
    [0.20, 0.10, 0.50, 0.10, 0.10],
    [0.05, 0.25, 0.20, 0.35, 0.15],
    [0.15, 0.10, 0.25, 0.20, 0.30],
    [0.30, 0.15, 0.10, 0.25, 0.20]
];

// Compute exact stationary distribution via power iteration / matrix solve
function solveStationary(P, tol = 1e-14, maxIter = 1000) {
    const K = P.length;
    let pi = new Float64Array(K).fill(1.0 / K);

    for (let iter = 0; iter < maxIter; iter++) {
        const next = new Float64Array(K);
        for (let j = 0; j < K; j++) {
            let sum = 0.0;
            for (let i = 0; i < K; i++) sum += pi[i] * P[i][j];
            next[j] = sum;
        }

        let maxDiff = 0.0;
        for (let j = 0; j < K; j++) {
            const diff = Math.abs(next[j] - pi[j]);
            if (diff > maxDiff) maxDiff = diff;
        }

        pi = next;
        if (maxDiff < tol) break;
    }

    return pi;
}

// PRNG
let seed = 839215;
function rand01() {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296.0;
}

function runWalkers(P, piTrue, N = 10000, steps = 1000) {
    const K = P.length;

    // Cumulative transition probabilities for fast sampling
    const cumP = P.map(row => {
        const cum = new Float64Array(K);
        let acc = 0.0;
        for (let j = 0; j < K; j++) {
            acc += row[j];
            cum[j] = acc;
        }
        cum[K - 1] = 1.0;
        return cum;
    });

    // Start all walkers concentrated in state 0 (non-equilibrium initial state)
    const walkers = new Int32Array(N).fill(0);

    for (let s = 0; s < steps; s++) {
        for (let i = 0; i < N; i++) {
            const curState = walkers[i];
            const u = rand01();
            const cRow = cumP[curState];
            let nextState = 0;
            while (nextState < K - 1 && u > cRow[nextState]) {
                nextState++;
            }
            walkers[i] = nextState;
        }
    }

    // Empirical state counts
    const counts = new Int32Array(K);
    for (let i = 0; i < N; i++) counts[walkers[i]]++;

    const pEmp = Array.from(counts, c => c / N);

    // Total variation distance d_TV = 0.5 * sum |p_emp - pi|
    let dTV = 0.0;
    for (let j = 0; j < K; j++) {
        dTV += 0.5 * Math.abs(pEmp[j] - piTrue[j]);
    }

    return { pEmp, dTV };
}

function runTest() {
    const piTrue = solveStationary(P);
    console.log(`[markov] Analytical stationary distribution pi:`);
    console.log(`  [${Array.from(piTrue).map(v => v.toFixed(4)).join(", ")}]`);

    // Verify pi * P = pi
    const K = P.length;
    let maxEigenErr = 0.0;
    for (let j = 0; j < K; j++) {
        let sum = 0.0;
        for (let i = 0; i < K; i++) sum += piTrue[i] * P[i][j];
        const err = Math.abs(sum - piTrue[j]);
        if (err > maxEigenErr) maxEigenErr = err;
    }
    console.log(`  Invariance check ||pi * P - pi||_inf: ${maxEigenErr.toExponential(4)} (target < 1e-12)`);
    assert(maxEigenErr < 1e-12, `Stationary distribution invariance failed: ${maxEigenErr}`);

    // Walker simulation
    const N = 10000, steps = 1000;
    const { pEmp, dTV } = runWalkers(P, piTrue, N, steps);

    console.log(`[markov] Empirical walker distribution (N=${N}, steps=${steps}):`);
    console.log(`  [${pEmp.map(v => v.toFixed(4)).join(", ")}]`);
    console.log(`  Total Variation Distance d_TV(p_emp, pi): ${dTV.toFixed(5)} (target < 0.015)`);

    assert(dTV < 0.015, `Total variation distance exceeded 0.015: got ${dTV}`);

    console.log("[markov.test.js] ALL PASS");
}

runTest();
