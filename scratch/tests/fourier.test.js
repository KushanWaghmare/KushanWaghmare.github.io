"use strict";

/**
 * scratch/tests/fourier.test.js
 *
 * CPU Reference Test for Fourier Epicycles & Spectral Decomposition
 *
 * Requirements:
 *   1. DFT Reconstruction Error:
 *      For an arbitrary complex closed path z_n (N points), the round-trip error
 *      max |z_n - IDFT(DFT(z))_n| < 1e-10.
 *
 *   2. Gibbs Phenomenon:
 *      The Fourier series partial sum of a square wave f(x) = sgn(sin(x))
 *      exhibits an asymptotic peak overshoot approaching:
 *        (2/pi) * Si(pi) - 1.0 approx 0.089490 (approx 8.95% approx 9%).
 *      Check that for N = 99 harmonics, the peak overshoot is within 8.5% to 9.5%.
 */

const assert = require("assert");

// 1. 1D Complex DFT and IDFT
function dft1D(samples) {
    const N = samples.length;
    const out = new Array(N);
    for (let k = 0; k < N; k++) {
        let re = 0.0, im = 0.0;
        for (let n = 0; n < N; n++) {
            const angle = (-2.0 * Math.PI * k * n) / N;
            const cos = Math.cos(angle);
            const sin = Math.sin(angle);
            re += samples[n].re * cos - samples[n].im * sin;
            im += samples[n].re * sin + samples[n].im * cos;
        }
        out[k] = { re: re / N, im: im / N };
    }
    return out;
}

function idft1D(coeffs) {
    const N = coeffs.length;
    const out = new Array(N);
    for (let n = 0; n < N; n++) {
        let re = 0.0, im = 0.0;
        for (let k = 0; k < N; k++) {
            const angle = (2.0 * Math.PI * k * n) / N;
            const cos = Math.cos(angle);
            const sin = Math.sin(angle);
            re += coeffs[k].re * cos - coeffs[k].im * sin;
            im += coeffs[k].re * sin + coeffs[k].im * cos;
        }
        out[n] = { re, im };
    }
    return out;
}

function testDftReconstruction() {
    // Arbitrary closed curve: cardioid + harmonic perturbation
    const N = 128;
    const samples = new Array(N);
    for (let n = 0; n < N; n++) {
        const t = (2.0 * Math.PI * n) / N;
        const r = 1.0 - Math.sin(t) + 0.35 * Math.cos(3.0 * t);
        samples[n] = {
            re: r * Math.cos(t),
            im: r * Math.sin(t)
        };
    }

    const coeffs = dft1D(samples);
    const reconstructed = idft1D(coeffs);

    let maxError = 0.0;
    for (let n = 0; n < N; n++) {
        const errRe = Math.abs(samples[n].re - reconstructed[n].re);
        const errIm = Math.abs(samples[n].im - reconstructed[n].im);
        const err = Math.hypot(errRe, errIm);
        if (err > maxError) maxError = err;
    }

    console.log(`[fourier] DFT round-trip max error (N=${N}): ${maxError.toExponential(4)} (target < 1e-10)`);
    assert(maxError < 1e-10, `DFT reconstruction error exceeded 1e-10: got ${maxError}`);
}

function testGibbsOvershoot() {
    // Square wave f(x) = +1 for x in (0, pi), -1 for x in (-pi, 0)
    // Partial sum: S_M(x) = (4/pi) * sum_{m=0}^M sin((2m+1)*x) / (2m+1)
    const M = 50; // 50 odd harmonics up to 99th harmonic
    const peakX = Math.PI / (2 * M + 1); // Location of first overshoot peak

    let sum = 0.0;
    for (let m = 0; m < M; m++) {
        const k = 2 * m + 1;
        sum += Math.sin(k * peakX) / k;
    }
    const peakVal = (4.0 / Math.PI) * sum;
    // Total jump discontinuity is from -1 to +1 (jump = 2.0)
    // Gibbs overshoot is defined as fraction of total jump height:
    // (peakVal - 1.0) / 2.0 approx 0.089490 (8.95% approx 9%)
    const jump = 2.0;
    const overshootPercent = ((peakVal - 1.0) / jump) * 100.0;

    console.log(`[fourier] Square wave peak value (M=${M} harmonics): ${peakVal.toFixed(6)}`);
    console.log(`  Measured Gibbs overshoot: ${overshootPercent.toFixed(3)}% of jump (target ~9%)`);

    assert(Math.abs(overshootPercent - 8.95) < 0.5, `Gibbs overshoot expected ~8.95%: got ${overshootPercent}%`);
}

function runAll() {
    testDftReconstruction();
    testGibbsOvershoot();
    console.log("[fourier.test.js] ALL PASS");
}

runAll();
