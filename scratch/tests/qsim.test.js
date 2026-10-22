/**
 * scratch/tests/qsim.test.js
 *
 * Double-precision mathematical verification suite for shared/lib/qsim-math.js.
 * Verifies all 9 Phase 1 requirements to 1e-12 tolerance.
 */

"use strict";

const assert = require("assert");
const { performance } = require("perf_hooks");
const Q = require("../../shared/lib/qsim-math.js");

const TOL = 1e-12;
const results = [];

const record = (name, passed, detail) => {
    results.push({ name, passed, detail });
    if (!passed) throw new Error(`FAIL [${name}]: ${detail}`);
};

/* ---------- 1. Unitarity and Group Law ---------- */
(() => {
    const prng = Q.mulberry32(1001);
    const st = Q.createState(8);
    let maxNormErr = 0.0;

    for (let step = 0; step < 10000; step++) {
        const gType = step % 3;
        const s = prng() * 2.0 - 0.5;
        if (gType === 0) {
            const q = Math.floor(prng() * 8);
            Q.applyH(st, q, s);
        } else if (gType === 1) {
            const c = Math.floor(prng() * 8);
            const t = (c + 1 + Math.floor(prng() * 7)) % 8;
            const phi = (prng() * 2.0 - 1.0) * Math.PI;
            Q.applyCP(st, c, t, phi, s);
        } else {
            const a = Math.floor(prng() * 8);
            const b = (a + 1 + Math.floor(prng() * 7)) % 8;
            Q.applySWAP(st, a, b, s);
        }
        if (step % 250 === 249 || step === 9999) {
            const err = Math.abs(Q.normSquared(st) - 1.0);
            if (err > maxNormErr) maxNormErr = err;
        }
    }
    assert(maxNormErr < TOL, `10,000 gate norm error ${maxNormErr} >= ${TOL}`);

    // H^0 = I, H^1 = H, and H^s * H^t = H^{s+t}
    const m0 = Q.hadamardMatrix(0.0);
    const errH0 = Math.max(
        Math.abs(m0[0] - 1.0), Math.abs(m0[1]), Math.abs(m0[2]), Math.abs(m0[3]),
        Math.abs(m0[4]), Math.abs(m0[5]), Math.abs(m0[6] - 1.0), Math.abs(m0[7])
    );
    assert(errH0 < TOL, `H^0 != I: ${errH0}`);

    const m1 = Q.hadamardMatrix(1.0);
    const s2 = Math.SQRT1_2;
    const errH1 = Math.max(
        Math.abs(m1[0] - s2), Math.abs(m1[1]), Math.abs(m1[2] - s2), Math.abs(m1[3]),
        Math.abs(m1[4] - s2), Math.abs(m1[5]), Math.abs(m1[6] + s2), Math.abs(m1[7])
    );
    assert(errH1 < TOL, `H^1 != H: ${errH1}`);

    let maxGroupErr = 0.0;
    let maxFracNormErr = 0.0;
    for (let i = 0; i < 200; i++) {
        const s = prng(), t = prng();
        const a = Q.cloneState(st);
        const b = Q.cloneState(st);
        const q = i % 8;
        Q.applyH(a, q, s);
        const fErr = Math.abs(Q.normSquared(a) - 1.0);
        if (fErr > maxFracNormErr) maxFracNormErr = fErr;
        Q.applyH(a, q, t);
        Q.applyH(b, q, s + t);
        for (let k = 0; k < 256; k++) {
            const d = Math.hypot(a.re[k] - b.re[k], a.im[k] - b.im[k]);
            if (d > maxGroupErr) maxGroupErr = d;
        }
    }
    assert(maxGroupErr < TOL, `H^s H^t != H^{s+t}: ${maxGroupErr}`);
    assert(maxFracNormErr < TOL, `Fractional s norm error: ${maxFracNormErr}`);

    record("1. Unitarity & group law", true, `10k-gate norm err = ${maxNormErr.toExponential(3)}, H^s*H^t err = ${maxGroupErr.toExponential(3)}`);
})();

/* ---------- 2. QFT ---------- */
(() => {
    const gates = Q.buildQftCircuit(8);
    const nH = gates.filter((g) => g.type === "H").length;
    const nCP = gates.filter((g) => g.type === "CP").length;
    const nSWAP = gates.filter((g) => g.type === "SWAP").length;
    assert.strictEqual(nH, 8, `Expected 8 H gates, got ${nH}`);
    assert.strictEqual(nCP, 28, `Expected 28 CP gates, got ${nCP}`);
    assert.strictEqual(nSWAP, 4, `Expected 4 SWAP gates, got ${nSWAP}`);

    const prng = Q.mulberry32(2002);
    const st = Q.createState(8);
    let norm = 0.0;
    for (let i = 0; i < 256; i++) {
        st.re[i] = prng() * 2.0 - 1.0;
        st.im[i] = prng() * 2.0 - 1.0;
        norm += st.re[i] * st.re[i] + st.im[i] * st.im[i];
    }
    const invNorm = 1.0 / Math.sqrt(norm);
    for (let i = 0; i < 256; i++) { st.re[i] *= invNorm; st.im[i] *= invNorm; }

    const orig = Q.cloneState(st);
    Q.applyQFT(st, 8, true);

    // Direct DFT sum: (1/16) * sum_x psi_x * exp(+2*pi*i*x*m / 256)
    let maxDftErr = 0.0;
    for (let m = 0; m < 256; m++) {
        let sumR = 0.0, sumI = 0.0;
        for (let x = 0; x < 256; x++) {
            const ang = (Q.TAU * x * m) / 256.0;
            const c = Math.cos(ang), s = Math.sin(ang);
            const rx = orig.re[x], ix = orig.im[x];
            sumR += rx * c - ix * s;
            sumI += rx * s + ix * c;
        }
        sumR /= 16.0; sumI /= 16.0;
        const err = Math.hypot(st.re[m] - sumR, st.im[m] - sumI);
        if (err > maxDftErr) maxDftErr = err;
    }
    assert(maxDftErr < TOL, `QFT vs direct DFT error ${maxDftErr}`);

    // Inverse QFT round-trip
    Q.applyInverseQFT(st, 8);
    let maxRoundTripErr = 0.0;
    for (let i = 0; i < 256; i++) {
        const err = Math.hypot(st.re[i] - orig.re[i], st.im[i] - orig.im[i]);
        if (err > maxRoundTripErr) maxRoundTripErr = err;
    }
    assert(maxRoundTripErr < TOL, `QFT round-trip error ${maxRoundTripErr}`);

    // QFT of delta at x0
    let maxDeltaErr = 0.0;
    for (const x0 of [0, 1, 37, 128, 255]) {
        Q.resetBasis(st, x0);
        Q.applyQFT(st, 8, true);
        for (let m = 0; m < 256; m++) {
            const ang = (Q.TAU * x0 * m) / 256.0;
            const expR = Math.cos(ang) / 16.0, expI = Math.sin(ang) / 16.0;
            const err = Math.hypot(st.re[m] - expR, st.im[m] - expI);
            if (err > maxDeltaErr) maxDeltaErr = err;
        }
    }
    assert(maxDeltaErr < TOL, `QFT delta error ${maxDeltaErr}`);

    record("2. QFT circuit & inverse", true, `gates = 8H/28CP/4SWAP, DFT err = ${maxDftErr.toExponential(3)}, round-trip err = ${maxRoundTripErr.toExponential(3)}, delta err = ${maxDeltaErr.toExponential(3)}`);
})();

/* ---------- 3. Uniform Preparation ---------- */
(() => {
    const st = Q.createState(8);
    const supports = [];
    for (let j = 1; j <= 8; j++) {
        const q = 8 - j; // MSB-first: 7, 6, ..., 0
        Q.applyH(st, q, 1.0);
        const supp = Q.supportSize(st, 1e-12);
        supports.push(supp);
        assert.strictEqual(supp, 1 << j, `After ${j} H gates expected support ${1 << j}, got ${supp}`);
    }
    let maxAmpErr = 0.0;
    for (let i = 0; i < 256; i++) {
        const err = Math.hypot(st.re[i] - 0.0625, st.im[i]);
        if (err > maxAmpErr) maxAmpErr = err;
    }
    assert(maxAmpErr < TOL, `Uniform amplitude error ${maxAmpErr}`);

    record("3. Uniform preparation (MSB-first)", true, `supports = [${supports.join(",")}], max |psi - 1/16| = ${maxAmpErr.toExponential(3)}`);
})();

/* ---------- 4. Grover Closed Forms ---------- */
(() => {
    const st = Q.createState(8);
    const targets = [0, 1, 77, 255];
    let maxGroverErr = 0.0;
    const probs = new Float64Array(25);

    for (const w of targets) {
        Q.resetBasis(st, 0);
        for (let q = 7; q >= 0; q--) Q.applyH(st, q, 1.0);

        for (let k = 0; k <= 50; k++) {
            const cf = Q.groverClosedForm(256, k);
            if (w === 77 && k <= 24) probs[k] = st.re[w] * st.re[w] + st.im[w] * st.im[w];
            for (let j = 0; j < 256; j++) {
                const expected = (j === w) ? cf.markedAmp : cf.unmarkedAmp;
                const err = Math.hypot(st.re[j] - expected, st.im[j]);
                if (err > maxGroverErr) maxGroverErr = err;
            }
            Q.applyGroverOracle(st, w, 1.0);
            Q.applyGroverDiffusion(st, 1.0);
        }
    }
    assert(maxGroverErr < TOL, `Grover closed-form error ${maxGroverErr}`);

    const exactP12 = Math.pow(Math.sin(25.0 * Math.asin(1.0 / 16.0)), 2);
    const p12Diff = Math.abs(probs[12] - exactP12);
    assert(p12Diff < TOL, `P_12 mismatch: ${p12Diff}`);

    let argmax = 0;
    for (let k = 1; k <= 24; k++) {
        if (probs[k] > probs[argmax]) argmax = k;
    }
    assert.strictEqual(argmax, 12, `Expected argmax k = 12, got ${argmax}`);
    assert(probs[13] < probs[12], `Expected P_13 (${probs[13]}) < P_12 (${probs[12]})`);

    record("4. Grover closed forms", true, `max amp err = ${maxGroverErr.toExponential(3)}, P_12 = ${probs[12].toFixed(9)} (exact ${exactP12.toFixed(9)}), P_13 = ${probs[13].toFixed(6)}, argmax = ${argmax}`);
})();

/* ---------- 5. Continuous Paths ---------- */
(() => {
    const prng = Q.mulberry32(5005);
    const st = Q.createState(8);
    for (let q = 7; q >= 0; q--) Q.applyH(st, q, 1.0);

    let maxPathNormErr = 0.0;
    for (let i = 0; i < 1000; i++) {
        const s = prng() * 2.0 - 0.5;
        const w = Math.floor(prng() * 256);
        if (i % 2 === 0) Q.applyGroverOracle(st, w, s);
        else Q.applyGroverDiffusion(st, s);
        const err = Math.abs(Q.normSquared(st) - 1.0);
        if (err > maxPathNormErr) maxPathNormErr = err;
    }
    assert(maxPathNormErr < TOL, `Continuous path norm error ${maxPathNormErr}`);

    // Dense 16x16 explicit matrix check for N = 16 (4 qubits)
    const N = 16;
    const w = 5;
    const st4 = Q.createState(4);
    let norm = 0.0;
    for (let i = 0; i < N; i++) {
        st4.re[i] = prng() * 2.0 - 1.0;
        st4.im[i] = prng() * 2.0 - 1.0;
        norm += st4.re[i] * st4.re[i] + st4.im[i] * st4.im[i];
    }
    for (let i = 0; i < N; i++) { st4.re[i] /= Math.sqrt(norm); st4.im[i] /= Math.sqrt(norm); }

    // Dense O(1) = I - 2|w><w| and D(1) = 2|s><s| - I
    const testSValues = [0.0, 0.27, 0.63, 1.0];
    let maxDenseErr = 0.0;
    for (const s of testSValues) {
        const c = Math.cos(Math.PI * s), sn = Math.sin(Math.PI * s);
        // Check O(s) = I + (e^{i*pi*s} - 1)|w><w|
        const aO = Q.cloneState(st4);
        Q.applyGroverOracle(aO, w, s);
        for (let i = 0; i < N; i++) {
            let sumR = 0.0, sumI = 0.0;
            for (let j = 0; j < N; j++) {
                // O_{ij}(s) = delta_{ij} + (c - 1 + i*sn) * delta_{iw} * delta_{jw}
                const mR = (i === j ? 1.0 : 0.0) + (i === w && j === w ? (c - 1.0) : 0.0);
                const mI = (i === w && j === w) ? sn : 0.0;
                sumR += mR * st4.re[j] - mI * st4.im[j];
                sumI += mR * st4.im[j] + mI * st4.re[j];
            }
            const err = Math.hypot(aO.re[i] - sumR, aO.im[i] - sumI);
            if (err > maxDenseErr) maxDenseErr = err;
        }

        // Check D(s) = P + e^{i*pi*s}(I - P), where P_{ij} = 1/N
        // At s = 1, e^{i*pi} = -1 => D(1) = 2P - I = 2|s><s| - I
        const aD = Q.cloneState(st4);
        Q.applyGroverDiffusion(aD, s);
        for (let i = 0; i < N; i++) {
            let sumR = 0.0, sumI = 0.0;
            for (let j = 0; j < N; j++) {
                const pIJ = 1.0 / N;
                const dIJ = i === j ? 1.0 : 0.0;
                const mR = (s === 1.0) ? (2.0 * pIJ - dIJ) : (pIJ + c * (dIJ - pIJ));
                const mI = (s === 1.0) ? 0.0 : (sn * (dIJ - pIJ));
                sumR += mR * st4.re[j] - mI * st4.im[j];
                sumI += mR * st4.im[j] + mI * st4.re[j];
            }
            const err = Math.hypot(aD.re[i] - sumR, aD.im[i] - sumI);
            if (err > maxDenseErr) maxDenseErr = err;
        }
    }
    assert(maxDenseErr < TOL, `Dense N=16 matrix vs amplitude path error ${maxDenseErr}`);

    record("5. Continuous paths O(s) & D(s)", true, `1k random s norm err = ${maxPathNormErr.toExponential(3)}, dense N=16 matrix err = ${maxDenseErr.toExponential(3)}`);
})();

/* ---------- 6. Shor, N = 15, a in {2, 7, 8, 13} ---------- */
(() => {
    const bases = [2, 7, 8, 13];
    let maxMarginalErr = 0.0;
    let maxCombErr = 0.0;
    let maxPeakProbErr = 0.0;
    let maxOffPeakProb = 0.0;
    let maxPhaseErr = 0.0;

    for (const a of bases) {
        const st = Q.createState(12); // 8 counting + 4 work
        for (let q = 7; q >= 0; q--) Q.applyH(st, q, 1.0);
        Q.applyModExpOracle(st, 8, 4, a, 15);

        const probs = Q.workRegisterMarginals(st, 8, 4);
        const expectedY = [1, a % 15, (a * a) % 15, (a * a * a) % 15];
        for (let y = 0; y < 16; y++) {
            const targetP = expectedY.includes(y) ? 0.25 : 0.0;
            const err = Math.abs(probs[y] - targetP);
            if (err > maxMarginalErr) maxMarginalErr = err;
        }

        // Test collapse for each k in {0, 1, 2, 3}
        for (let k = 0; k < 4; k++) {
            const yVal = expectedY[k];
            const branch = Q.cloneState(st);
            Q.measureWorkRegister(branch, 8, 4, yVal);

            // Extract counting register slice for yVal and verify comb of 64 spikes of 1/8
            const base = yVal << 8;
            let combCount = 0;
            for (let x = 0; x < 256; x++) {
                const re = branch.re[base | x], im = branch.im[base | x];
                if (x % 4 === k) {
                    combCount++;
                    const err = Math.hypot(re - 0.125, im);
                    if (err > maxCombErr) maxCombErr = err;
                } else {
                    const err = Math.hypot(re, im);
                    if (err > maxCombErr) maxCombErr = err;
                }
            }
            assert.strictEqual(combCount, 64, `Expected 64 comb spikes, got ${combCount}`);

            // Apply 8-qubit QFT on the counting register qubits [0..7]
            Q.applyQFT(branch, 8, true);

            for (let m = 0; m < 256; m++) {
                const re = branch.re[base | m], im = branch.im[base | m];
                const p = re * re + im * im;
                if (m % 64 === 0) {
                    const pErr = Math.abs(p - 0.25);
                    if (pErr > maxPeakProbErr) maxPeakProbErr = pErr;

                    const expectedAng = (Q.TAU * k * m) / 256.0;
                    const expR = 0.5 * Math.cos(expectedAng);
                    const expI = 0.5 * Math.sin(expectedAng);
                    const phErr = Math.hypot(re - expR, im - expI);
                    if (phErr > maxPhaseErr) maxPhaseErr = phErr;
                } else {
                    if (p > maxOffPeakProb) maxOffPeakProb = p;
                }
            }
        }
    }

    assert(maxMarginalErr < TOL, `Work marginal error ${maxMarginalErr}`);
    assert(maxCombErr < TOL, `Comb amplitude error ${maxCombErr}`);
    assert(maxPeakProbErr < TOL, `QFT peak prob error ${maxPeakProbErr}`);
    assert(maxOffPeakProb < 1e-20, `QFT off-peak prob ${maxOffPeakProb} >= 1e-20`);
    assert(maxPhaseErr < TOL, `QFT peak phase error ${maxPhaseErr}`);

    record("6. Shor N=15, a in {2,7,8,13}", true, `marginal err = ${maxMarginalErr.toExponential(3)}, comb err = ${maxCombErr.toExponential(3)}, peak prob err = ${maxPeakProbErr.toExponential(3)}, off-peak max = ${maxOffPeakProb.toExponential(3)}, phase err = ${maxPhaseErr.toExponential(3)}`);
})();

/* ---------- 7. Post-Processing ---------- */
(() => {
    const p64 = Q.shorPostProcess(64, 256, 15, 7, true);
    const p192 = Q.shorPostProcess(192, 256, 15, 7, true);
    const p128Direct = Q.shorPostProcess(128, 256, 15, 7, false);
    const p128Mult = Q.shorPostProcess(128, 256, 15, 7, true);
    const p0 = Q.shorPostProcess(0, 256, 15, 7, true);

    assert.strictEqual(p64.directR, 4, "m=64 should give r=4 directly");
    assert.deepStrictEqual(p64.factors, [3, 5]);
    assert.strictEqual(p192.directR, 4, "m=192 should give r=4 directly");
    assert.deepStrictEqual(p192.factors, [3, 5]);

    assert.strictEqual(p128Direct.candidateQ, 2, "m=128 should have candidate denominator 2");
    assert.strictEqual(p128Direct.directR, null, "m=128 direct candidate 2 must fail verification");
    assert.strictEqual(p128Mult.r, 4, "m=128 with multiples must recover r=4");
    assert.deepStrictEqual(p128Mult.factors, [3, 5]);

    assert.strictEqual(p0.r, null, "m=0 must give nothing");
    assert.strictEqual(p0.factors, null);

    // Compute recovery probability from simulated post-QFT state for N=15, a=7
    const st = Q.createState(12);
    for (let q = 7; q >= 0; q--) Q.applyH(st, q, 1.0);
    Q.applyModExpOracle(st, 8, 4, 7, 15);
    Q.measureWorkRegister(st, 8, 4, 13); // y = 13
    Q.applyQFT(st, 8, true);

    const base = 13 << 8;
    let probDirect = 0.0, probMult = 0.0;
    for (let m = 0; m < 256; m++) {
        const pm = st.re[base | m] * st.re[base | m] + st.im[base | m] * st.im[base | m];
        if (pm > 1e-15) {
            if (Q.shorPostProcess(m, 256, 15, 7, false).directR === 4) probDirect += pm;
            if (Q.shorPostProcess(m, 256, 15, 7, true).r === 4) probMult += pm;
        }
    }
    assert(Math.abs(probDirect - 0.5) < 1e-9, `Expected direct prob 0.5, got ${probDirect}`);
    assert(Math.abs(probMult - 0.75) < 1e-9, `Expected multiples prob 0.75, got ${probMult}`);

    // a = 4 (order 2): m = 128 gives r = 2 directly and factors [3, 5]
    const pA4 = Q.shorPostProcess(128, 256, 15, 4, false);
    assert.strictEqual(pA4.directR, 2, "a=4, m=128 should give r=2 directly");
    assert.deepStrictEqual(pA4.factors, [3, 5], "a=4, r=2 should yield factors [3, 5]");

    // gcd(a, 15) > 1 (e.g. a = 3, 5, 6, 9, 10, 12): classical GCD shortcut
    const pGcd = Q.shorPostProcess(0, 256, 15, 6, true);
    assert.strictEqual(pGcd.trivialGcd, 3, "gcd(6, 15) = 3");
    assert.deepStrictEqual(pGcd.factors, [3, 5]);

    record("7. Continued-fraction post-processing", true, `P(direct) = ${probDirect.toFixed(9)}, P(multiples) = ${probMult.toFixed(9)}, factors = [3, 5], a=4 & gcd>1 verified`);
})();

/* ---------- 8. Determinism ---------- */
(() => {
    const runA = Q.measurementParityHash(0x51514D32, 20);
    const runB = Q.measurementParityHash(0x51514D32, 20);
    assert.strictEqual(runA.hash, runB.hash, "Identical seeds must produce identical measurement hash");
    assert.deepStrictEqual(runA.outcomes, runB.outcomes);

    record("8. Determinism (mulberry32)", true, `20-measurement FNV-1a hash = ${runA.hash}`);
})();

/* ---------- 9. Performance (12-qubit gate < 1 ms) ---------- */
(() => {
    const st12 = Q.createState(12); // 4,096 complex amplitudes
    // Warm up JIT
    for (let i = 0; i < 50; i++) Q.applyH(st12, i % 12, 0.5);

    const trials = 1000;
    const t0 = performance.now();
    for (let i = 0; i < trials; i++) {
        Q.applyH(st12, i % 12, 0.37);
    }
    const elapsedMs = performance.now() - t0;
    const msPerGate = elapsedMs / trials;
    assert(msPerGate < 1.0, `12-qubit gate took ${msPerGate.toFixed(4)} ms >= 1.0 ms`);

    record("9. Performance (12-qubit gate)", true, `${msPerGate.toFixed(4)} ms / gate (averaged over ${trials} fractional H gates on 4,096 amplitudes)`);
})();

console.log("\n=== Phase 1: qsim.test.js Results ===");
for (const r of results) {
    console.log(`[PASS] ${r.name}: ${r.detail}`);
}
