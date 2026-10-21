/**
 * cs-computation.test.js
 *
 * Mathematical and bitwise verification test suite for
 * Universal Computation Hyper-Structure (Computer Science Hero).
 */

"use strict";

const path = require("path");
const C = require(path.join(__dirname, "../../shared/lib/cs-computation-math.js"));

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
console.log("  Universal Computation Hyper-Structure (Maths Test Suite)");
console.log("=======================================================\n");

// 1. Rule 110 Transition Table Exactness
(() => {
    const expected = [
        { l: 1, c: 1, r: 1, out: 0 },
        { l: 1, c: 1, r: 0, out: 1 },
        { l: 1, c: 0, r: 1, out: 1 },
        { l: 1, c: 0, r: 0, out: 0 },
        { l: 0, c: 1, r: 1, out: 1 },
        { l: 0, c: 1, r: 0, out: 1 },
        { l: 0, c: 0, r: 1, out: 1 },
        { l: 0, c: 0, r: 0, out: 0 }
    ];

    let match = true;
    for (const item of expected) {
        if (C.rule110Lookup(item.l, item.c, item.r) !== item.out) {
            match = false;
        }
    }

    assert(match,
        `Rule 110 lookup table verified: all 8 elementary binary transitions match binary 01101110_2 = 110_10`);
})();

// 2. Matthew Cook's Ether Vacuum Invariant (Period 14 Space, Period 7 Time)
(() => {
    // Repeat ether pattern across 4 tiles (56 cells)
    const N = 56;
    const row0 = C.createEtherRow(N);
    let row = new Uint8Array(row0);

    // Evolve exactly 7 time steps
    for (let t = 0; t < 7; t++) {
        row = C.stepRule110(row);
    }

    // After 7 time steps, Cook's ether returns identically to initial state
    let matchExact = true;
    for (let i = 0; i < N; i++) {
        if (row[i] !== row0[i]) {
            matchExact = false;
        }
    }

    assert(matchExact,
        `Matthew Cook Ether vacuum invariant verified: space period 14, time period 7 (exact cyclic recurrence)`);
})();

// 3. Langton's Lambda Parameter Evaluation
(() => {
    const lambda = C.langtonLambda(110);
    const expected = 5.0 / 8.0;
    const err = Math.abs(lambda - expected);

    assert(err < 1e-10 && lambda === 0.625,
        `Langton's parameter: λ = ${lambda.toFixed(3)} exactly matches Wolfram Class IV critical edge-of-chaos boundary (5/8)`);
})();

// 4. Shannon Information Entropy (Single-Cell & Triplet Block Entropy)
(() => {
    const N = 128;
    let row = new Uint8Array(N);
    row[N - 2] = 1; // Single seed cell

    // Evolve for 160 steps into fully developed Class IV computational tapestry
    for (let t = 0; t < 160; t++) {
        row = C.stepRule110(row);
    }

    const H1 = C.shannonEntropy(row);
    const H3 = C.tripletBlockEntropy(row);

    assert(H1 > 0.85 && H1 < 0.99 && H3 > 2.6 && H3 < 2.98,
        `Shannon information entropy: H_1 = ${H1.toFixed(3)} bits (near-maximal single-cell), H_3 = ${H3.toFixed(3)} / 3.0 bits (triplet block entropy)`);
})();

// 5. Lempel–Ziv Algorithmic Complexity (Class IV Signature)
(() => {
    const N = 280;
    // 1. Periodic string (Class I/II)
    const periodicRow = C.createEtherRow(N);
    const cPeriodic = C.lempelZivComplexity(periodicRow);

    // 2. White noise random string (Class III)
    const prng = C.createPrng(12345);
    const randomRow = new Uint8Array(N);
    for (let i = 0; i < N; i++) randomRow[i] = prng() > 0.5 ? 1 : 0;
    const cRandom = C.lempelZivComplexity(randomRow);

    // 3. Rule 110 evolution from seed (Class IV)
    let ruleRow = new Uint8Array(N);
    ruleRow[N - 2] = 1;
    for (let t = 0; t < 120; t++) ruleRow = C.stepRule110(ruleRow);
    const cRule110 = C.lempelZivComplexity(ruleRow);

    assert(cPeriodic < 0.25 && cRandom > 0.95 && cRule110 > 0.38 && cRule110 < 0.70,
        `Lempel–Ziv complexity: periodic = ${cPeriodic.toFixed(2)}, random = ${cRandom.toFixed(2)}, Rule 110 = ${cRule110.toFixed(2)} (Class IV intermediate complex regime)`);
})();

// 6. Glider Soliton Defect Detection in Ether Background
(() => {
    const N = 56;
    const row = C.createEtherRow(N);

    // No defects in pure ether
    const defects0 = C.detectGliders(row, 0);

    // Inject a single defect (soliton seed) at index 28
    row[28] ^= 1;
    const defects1 = C.detectGliders(row, 0);

    assert(defects0.length === 0 && defects1.length === 1 && defects1[0] === 28,
        `Soliton defect detection: 0 defects in ground ether, localized defect isolated at index ${defects1[0]}`);
})();

// 7. Deterministic 32-bit FNV-1a State Trace Hash
(() => {
    const N = 128;
    let row = new Uint8Array(N);
    row[N - 2] = 1;

    let traceBytes = [];
    for (let t = 0; t < 64; t++) {
        row = C.stepRule110(row);
        for (let i = 0; i < N; i += 8) {
            let byte = 0;
            for (let b = 0; b < 8; b++) {
                byte = (byte << 1) | (row[i + b] & 1);
            }
            traceBytes.push(byte);
        }
    }

    const hash = C.fnv1a(traceBytes);
    assert(hash === 0x3396441d,
        `Determinism verified: 64-step 128-cell trace hash = 0x${hash.toString(16)}`);
})();

// 8. Continuous 2D Turing Kernel Normalization & Symmetry
(() => {
    const radius = 10;
    const { kernel, size } = C.continuous2DKernel(radius);
    let sum = 0.0;
    for (let i = 0; i < kernel.length; i++) sum += kernel[i];

    // Check radial symmetry: kernel[center + (x, y)] == kernel[center + (-x, -y)]
    const center = radius * size + radius;
    const p1 = kernel[center + 3];
    const p2 = kernel[center - 3];
    const symErr = Math.abs(p1 - p2);

    assert(Math.abs(sum - 1.0) < 1e-6 && symErr < 1e-6,
        `Continuous 2D Turing kernel: sum = ${sum.toFixed(6)}, radial symmetry error = ${symErr.toExponential(1)}`);
})();

// 9. CPU Performance Benchmark (> 1,000,000 cell updates / sec)
(() => {
    const N = 512;
    let row = new Uint8Array(N);
    row[N - 2] = 1;

    const numSteps = 4000; // 4000 * 512 = 2,048,000 cell updates
    const t0 = performance.now();

    for (let t = 0; t < numSteps; t++) {
        row = C.stepRule110(row);
    }

    const elapsedMs = performance.now() - t0;
    const totalUpdates = numSteps * N;
    const updatesPerSec = (totalUpdates / elapsedMs) * 1000.0;

    assert(elapsedMs < 250.0 && updatesPerSec > 1000000.0,
        `CPU throughput benchmark: ${totalUpdates.toLocaleString()} cell updates in ${elapsedMs.toFixed(1)} ms (${(updatesPerSec / 1000000.0).toFixed(2)}M cells/second)`);
})();

// 10. Live Telemetry Formatter Stability
(() => {
    const tel = C.formatTelemetry(120, 0.64, 0.942, 0.49);
    const valid = tel.tagString.includes("Universal Computation") &&
                  tel.tagString.includes("Rule 110") &&
                  tel.tagString.includes("Turing Class IV");

    assert(valid,
        `Telemetry formatting: "${tel.tagString}"`);
})();

console.log(`\nResults: ${numPassed} / ${numTotal} tests passed.\n`);
