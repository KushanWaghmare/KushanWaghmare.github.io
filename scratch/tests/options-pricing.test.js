"use strict";

/**
 * scratch/tests/options-pricing.test.js
 *
 * CPU Reference Test for Monte Carlo European Call Option Pricing
 * Geometric Brownian Motion (GBM):
 *   S(t+dt) = S(t) * exp((r - 0.5 * sigma^2) * dt + sigma * sqrt(dt) * Z),  Z ~ N(0, 1)
 *
 * Terminal payoff for call with strike K:
 *   Payoff = max(S(T) - K, 0)
 *   Discounted price: C_MC = exp(-r * T) * E[Payoff]
 *   Standard error: SE = exp(-r * T) * std(Payoff) / sqrt(N)
 *
 * Black-Scholes closed form:
 *   d1 = (ln(S0 / K) + (r + 0.5 * sigma^2) * T) / (sigma * sqrt(T))
 *   d2 = d1 - sigma * sqrt(T)
 *   C_BS = S0 * Phi(d1) - K * exp(-r * T) * Phi(d2)
 *
 * Requirement:
 *   |C_MC - C_BS| <= 3 * SE over N = 100,000 paths.
 */

const assert = require("assert");

function cdfNormal(x) {
    // Abramowitz and Stegun 7.1.26 approximation for standard normal CDF
    const p = 0.2316419;
    const b1 = 0.319381530;
    const b2 = -0.356563782;
    const b3 = 1.781477937;
    const b4 = -1.821255978;
    const b5 = 1.330274429;

    const t = 1.0 / (1.0 + p * Math.abs(x));
    const z = (1.0 / Math.sqrt(2.0 * Math.PI)) * Math.exp(-0.5 * x * x);
    const poly = t * (b1 + t * (b2 + t * (b3 + t * (b4 + t * b5))));
    const cdf = 1.0 - z * poly;
    return x >= 0 ? cdf : 1.0 - cdf;
}

function blackScholesCall(S0, K, r, sigma, T) {
    const d1 = (Math.log(S0 / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * Math.sqrt(T));
    const d2 = d1 - sigma * Math.sqrt(T);
    return S0 * cdfNormal(d1) - K * Math.exp(-r * T) * cdfNormal(d2);
}

// Parameters
const S0 = 100.0;
const K = 105.0;
const r = 0.05;
const sigma = 0.25;
const T = 1.0;
const N = 100000;

const cBs = blackScholesCall(S0, K, r, sigma, T);

// Exact terminal generation:
let seed = 94821;
function pcg() {
    seed = (Math.imul(seed >>> 0, 747796405) + 2891336453) >>> 0;
    const shift = ((seed >>> 28) + 4) >>> 0;
    const word = Math.imul(((seed >>> shift) ^ seed) >>> 0, 277803737) >>> 0;
    return (((word >>> 22) ^ word) >>> 0) / 4294967296.0;
}

let sumPayoff = 0.0;
let sumPayoffSq = 0.0;
const drift = (r - 0.5 * sigma * sigma) * T;
const volSqrtT = sigma * Math.sqrt(T);

for (let i = 0; i < N; i += 2) {
    // Box-Muller pair
    let u1 = pcg(), u2 = pcg();
    while (u1 <= 1e-7) u1 = pcg();
    const radius = Math.sqrt(-2.0 * Math.log(u1));
    const theta = 2.0 * Math.PI * u2;
    const z1 = radius * Math.cos(theta);
    const z2 = radius * Math.sin(theta);

    const sT1 = S0 * Math.exp(drift + volSqrtT * z1);
    const p1 = Math.max(sT1 - K, 0.0);
    sumPayoff += p1;
    sumPayoffSq += p1 * p1;

    const sT2 = S0 * Math.exp(drift + volSqrtT * z2);
    const p2 = Math.max(sT2 - K, 0.0);
    sumPayoff += p2;
    sumPayoffSq += p2 * p2;
}

const meanPayoff = sumPayoff / N;
const varPayoff = (sumPayoffSq / N) - (meanPayoff * meanPayoff);
const discount = Math.exp(-r * T);
const cMc = discount * meanPayoff;
const se = discount * Math.sqrt(varPayoff / N);

const diff = Math.abs(cMc - cBs);
const zScore = diff / se;

console.log(`[options-pricing] Black-Scholes closed form: ${cBs.toFixed(4)}`);
console.log(`[options-pricing] Monte Carlo (N=${N.toLocaleString()}): ${cMc.toFixed(4)} +- ${se.toFixed(4)} (SE)`);
console.log(`[options-pricing] Difference: ${diff.toFixed(4)}, z-score: ${zScore.toFixed(3)} SE (target <= 3.0)`);

assert(zScore <= 3.0, `MC price differs from Black-Scholes by ${zScore.toFixed(2)} SE (> 3 SE threshold)`);
console.log("[options-pricing.test.js] ALL PASS");
