"use strict";

/**
 * Node reference test for the 32-bit PCG hash PRNG and Box-Muller transform
 * used in shared/gfx.js.
 * Verifies that over 1,000,000 samples the Box-Muller output has:
 *   |mean| < 0.01  and  |variance - 1| < 0.01 (within 1%).
 */

const assert = require("assert");

const pcgHash = (v) => {
    let state = (Math.imul(v >>> 0, 747796405) + 2891336453) >>> 0;
    const shift = ((state >>> 28) + 4) >>> 0;
    const word = Math.imul(((state >>> shift) ^ state) >>> 0, 277803737) >>> 0;
    return ((word >>> 22) ^ word) >>> 0;
};

const runBoxMullerTest = (numSamples = 1000000) => {
    let seed = 13374201 >>> 0;
    let sum = 0.0;
    let sumSq = 0.0;
    const pairs = numSamples >> 1;

    for (let i = 0; i < pairs; i++) {
        seed = pcgHash((seed + i * 2) >>> 0);
        const u1 = Math.max(seed / 4294967296.0, 1e-7);
        seed = pcgHash((seed + i * 2 + 1) >>> 0);
        const u2 = seed / 4294967296.0;

        const r = Math.sqrt(-2.0 * Math.log(u1));
        const th = 2.0 * Math.PI * u2;
        const z0 = r * Math.cos(th);
        const z1 = r * Math.sin(th);

        sum += z0 + z1;
        sumSq += z0 * z0 + z1 * z1;
    }

    const mean = sum / numSamples;
    const variance = sumSq / numSamples - mean * mean;
    return { numSamples, mean, variance };
};

const res = runBoxMullerTest(1000000);
console.log(
    `[gfx-prng.test.js] N=${res.numSamples}: mean=${res.mean.toFixed(6)}, variance=${res.variance.toFixed(6)}`
);

assert(Math.abs(res.mean) < 0.01, `Expected |mean| < 0.01, got ${res.mean}`);
assert(Math.abs(res.variance - 1.0) < 0.01, `Expected |variance - 1| < 0.01, got ${res.variance}`);
console.log("[gfx-prng.test.js] PASS");
