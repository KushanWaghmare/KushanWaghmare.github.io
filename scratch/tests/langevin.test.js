"use strict";

/**
 * scratch/tests/langevin.test.js
 *
 * CPU Reference Test for Overdamped Langevin Diffusion on a Potential Landscape
 * Dynamics:
 *   d\theta = -nabla U(\theta) * dt + sqrt(2 * T * dt) * \xi,  \xi ~ N(0, I)
 *
 * Potential: Symmetric 1D/2D Double Well
 *   U(x) = (x^2 - 1)^2 = x^4 - 2x^2 + 1
 *   nabla U(x) = 4x^3 - 4x = 4x(x^2 - 1)
 *
 * Stationary Distribution: Gibbs-Boltzmann
 *   p_eq(x) = (1 / Z) * exp(-U(x) / T)
 *
 * Requirement:
 *   Over N = 20,000 particles at fixed temperature T = 0.6 and dt = 0.005,
 *   after equilibration the empirical histogram matches exp(-U/T) with
 *   Kullback-Leibler divergence D_KL(P || Q) < 0.02.
 */

const assert = require("assert");

const N_PARTICLES = 20000;
const T = 0.6;
const DT = 0.005;
const STEPS = 2500;

function gradU(x) {
    return 4.0 * x * (x * x - 1.0);
}

function U(x) {
    const x2 = x * x;
    return (x2 - 1.0) * (x2 - 1.0);
}

// PRNG
let seed = 120481;
function pcg() {
    seed = (Math.imul(seed >>> 0, 747796405) + 2891336453) >>> 0;
    const shift = ((seed >>> 28) + 4) >>> 0;
    const word = Math.imul(((seed >>> shift) ^ seed) >>> 0, 277803737) >>> 0;
    return (((word >>> 22) ^ word) >>> 0) / 4294967296.0;
}

function randn() {
    let u1 = pcg(), u2 = pcg();
    while (u1 <= 1e-7) u1 = pcg();
    return Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
}

// Initialise particles uniformly in [-1.5, 1.5]
const x = new Float64Array(N_PARTICLES);
for (let i = 0; i < N_PARTICLES; i++) {
    x[i] = (pcg() * 2.0 - 1.0) * 1.5;
}

const noiseScale = Math.sqrt(2.0 * T * DT);

// Integrate Euler-Maruyama
for (let step = 0; step < STEPS; step++) {
    for (let i = 0; i < N_PARTICLES; i++) {
        const xi = x[i];
        x[i] = xi - gradU(xi) * DT + noiseScale * randn();
    }
}

// Discretize into bins in [-2.0, 2.0]
const NUM_BINS = 32;
const X_MIN = -2.0, X_MAX = 2.0;
const BIN_WIDTH = (X_MAX - X_MIN) / NUM_BINS;
const counts = new Float64Array(NUM_BINS);

for (let i = 0; i < N_PARTICLES; i++) {
    const val = x[i];
    if (val >= X_MIN && val < X_MAX) {
        const bin = Math.floor((val - X_MIN) / BIN_WIDTH);
        counts[bin]++;
    }
}

// Empirical probabilities P
const P = new Float64Array(NUM_BINS);
for (let b = 0; b < NUM_BINS; b++) {
    P[b] = counts[b] / N_PARTICLES;
}

// Theoretical Boltzmann distribution Q
const Q = new Float64Array(NUM_BINS);
let zSum = 0.0;
for (let b = 0; b < NUM_BINS; b++) {
    const xMid = X_MIN + (b + 0.5) * BIN_WIDTH;
    const prob = Math.exp(-U(xMid) / T) * BIN_WIDTH;
    Q[b] = prob;
    zSum += prob;
}
for (let b = 0; b < NUM_BINS; b++) {
    Q[b] /= zSum;
}

// Compute KL divergence: D_KL(P || Q) = sum P[i] * ln(P[i] / Q[i])
let klDiv = 0.0;
for (let b = 0; b < NUM_BINS; b++) {
    if (P[b] > 1e-6 && Q[b] > 1e-6) {
        klDiv += P[b] * Math.log(P[b] / Q[b]);
    }
}

console.log(`[langevin] Overdamped Langevin (N=${N_PARTICLES.toLocaleString()} particles, T=${T}, dt=${DT}):`);
console.log(`  Measured KL divergence D_KL(P || Q): ${klDiv.toFixed(5)} (target < 0.02)`);

assert(klDiv < 0.02, `KL divergence ${klDiv.toFixed(5)} >= 0.02`);
console.log("[langevin.test.js] ALL PASS");
