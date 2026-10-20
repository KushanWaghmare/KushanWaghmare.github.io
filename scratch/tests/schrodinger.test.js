"use strict";

/**
 * scratch/tests/schrodinger.test.js
 *
 * CPU Reference Test for 2D Split-Step Fourier Schrödinger Equation
 * i hbar dpsi/dt = [-hbar^2/(2m) nabla^2 + V(r)] psi
 * Units: hbar = 1, m = 1.
 * Strang splitting:
 *   psi(t+dt) = exp(-i V dt / 2) * IFFT[ exp(-i k^2 dt / 2) * FFT[ exp(-i V dt / 2) * psi(t) ] ]
 *
 * Requirements:
 *   1. 2D Radix-2 FFT round-trip relative error < 1e-5.
 *   2. Wavefunction norm ||psi||_2 conserved within 1e-3 over 2000 steps with V = 0.
 *   3. Free Gaussian packet dispersion: width sigma(t) matches sigma0 * sqrt(1 + (t / (2 sigma0^2))^2) within 1%.
 *   4. Highest-k kinetic phase advance per step: phi_max = 0.5 * k_max^2 * dt < pi.
 */

const assert = require("assert");

// 1D Radix-2 FFT (Cooley-Tukey / Stockham equivalent)
function fft1D(re, im, inverse = false) {
    const n = re.length;
    // Bit reversal
    let j = 0;
    for (let i = 0; i < n - 1; i++) {
        if (i < j) {
            let tr = re[i]; re[i] = re[j]; re[j] = tr;
            let ti = im[i]; im[i] = im[j]; im[j] = ti;
        }
        let k = n >> 1;
        while (k <= j) {
            j -= k;
            k >>= 1;
        }
        j += k;
    }

    const sign = inverse ? 1 : -1;
    for (let len = 2; len <= n; len <<= 1) {
        const half = len >> 1;
        const ang = (sign * 2.0 * Math.PI) / len;
        const wstepR = Math.cos(ang), wstepI = Math.sin(ang);
        for (let i = 0; i < n; i += len) {
            let wR = 1.0, wI = 0.0;
            for (let k = 0; k < half; k++) {
                const uR = re[i + k], uI = im[i + k];
                const vR = re[i + k + half] * wR - im[i + k + half] * wI;
                const vI = re[i + k + half] * wI + im[i + k + half] * wR;
                re[i + k] = uR + vR;
                im[i + k] = uI + vI;
                re[i + k + half] = uR - vR;
                im[i + k + half] = uI - vI;
                const nextWR = wR * wstepR - wI * wstepI;
                wI = wR * wstepI + wI * wstepR;
                wR = nextWR;
            }
        }
    }

    if (inverse) {
        for (let i = 0; i < n; i++) {
            re[i] /= n;
            im[i] /= n;
        }
    }
}

// 2D FFT on N x N grid
function fft2D(re, im, n, inverse = false) {
    const rowR = new Float64Array(n), rowI = new Float64Array(n);
    // Rows
    for (let y = 0; y < n; y++) {
        const offset = y * n;
        for (let x = 0; x < n; x++) {
            rowR[x] = re[offset + x];
            rowI[x] = im[offset + x];
        }
        fft1D(rowR, rowI, inverse);
        for (let x = 0; x < n; x++) {
            re[offset + x] = rowR[x];
            im[offset + x] = rowI[x];
        }
    }
    // Columns
    const colR = new Float64Array(n), colI = new Float64Array(n);
    for (let x = 0; x < n; x++) {
        for (let y = 0; y < n; y++) {
            colR[y] = re[y * n + x];
            colI[y] = im[y * n + x];
        }
        fft1D(colR, colI, inverse);
        for (let y = 0; y < n; y++) {
            re[y * n + x] = colR[y];
            im[y * n + x] = colI[y];
        }
    }
}

// Test 1: 2D FFT round-trip accuracy on 64x64 grid
const N = 64;
const origR = new Float64Array(N * N), origI = new Float64Array(N * N);
const testR = new Float64Array(N * N), testI = new Float64Array(N * N);
for (let i = 0; i < N * N; i++) {
    origR[i] = Math.sin(i * 0.13) * Math.cos(i * 0.07);
    origI[i] = Math.cos(i * 0.17);
    testR[i] = origR[i];
    testI[i] = origI[i];
}

fft2D(testR, testI, N, false);
fft2D(testR, testI, N, true);

let maxFftErr = 0;
for (let i = 0; i < N * N; i++) {
    const err = Math.hypot(testR[i] - origR[i], testI[i] - origI[i]);
    if (err > maxFftErr) maxFftErr = err;
}
console.log(`[schrodinger] 2D FFT round-trip max error: ${maxFftErr.toExponential(4)} (target < 1e-5)`);
assert(maxFftErr < 1e-5, `FFT round-trip error ${maxFftErr} >= 1e-5`);

// Test 2 & 3: Split-step integration, norm conservation, and packet dispersion
// Grid: N = 128, domain [-L/2, L/2], L = 16.0, dx = L / N
const N_SIM = 128;
const L = 16.0;
const dx = L / N_SIM;
const dt = 0.002; // Small enough that max k^2 * dt / 2 < pi

// Maximum wavenumber k_max = pi / dx
const kMax = Math.PI / dx;
const maxPhaseAdvance = 0.5 * (kMax * kMax + kMax * kMax) * dt;
console.log(`[schrodinger] kMax=${kMax.toFixed(2)}, max kinetic phase step per dt: ${maxPhaseAdvance.toFixed(4)} rad (< pi = ${Math.PI.toFixed(4)})`);
assert(maxPhaseAdvance < Math.PI, "Kinetic phase advance exceeds Nyquist limit pi!");

// Precompute kinetic propagators: exp(-i * (kx^2 + ky^2) * dt / 2)
const kinCos = new Float64Array(N_SIM * N_SIM);
const kinSin = new Float64Array(N_SIM * N_SIM);
for (let y = 0; y < N_SIM; y++) {
    const ky = (y < N_SIM / 2 ? y : y - N_SIM) * (2.0 * Math.PI / L);
    for (let x = 0; x < N_SIM; x++) {
        const kx = (x < N_SIM / 2 ? x : x - N_SIM) * (2.0 * Math.PI / L);
        const k2 = kx * kx + ky * ky;
        const phase = -0.5 * k2 * dt;
        kinCos[y * N_SIM + x] = Math.cos(phase);
        kinSin[y * N_SIM + x] = Math.sin(phase);
    }
}

// Initial state: Gaussian wave packet at center, sigma0 = 0.8
const sigma0 = 0.8;
const psiR = new Float64Array(N_SIM * N_SIM);
const psiI = new Float64Array(N_SIM * N_SIM);

let initNormSq = 0;
for (let y = 0; y < N_SIM; y++) {
    const py = (y - N_SIM / 2) * dx;
    for (let x = 0; x < N_SIM; x++) {
        const px = (x - N_SIM / 2) * dx;
        const r2 = px * px + py * py;
        const val = Math.exp(-r2 / (4.0 * sigma0 * sigma0));
        psiR[y * N_SIM + x] = val;
        psiI[y * N_SIM + x] = 0.0;
        initNormSq += val * val * dx * dx;
    }
}
const norm0 = Math.sqrt(initNormSq);
for (let i = 0; i < N_SIM * N_SIM; i++) {
    psiR[i] /= norm0;
    psiI[i] /= norm0;
}

// Helper to compute norm
function computeNorm(r, im) {
    let sum = 0;
    for (let i = 0; i < N_SIM * N_SIM; i++) {
        sum += (r[i] * r[i] + im[i] * im[i]) * dx * dx;
    }
    return Math.sqrt(sum);
}

// Helper to compute position standard deviation sigma_x
function computeSigmaX(r, im) {
    let sumP = 0, sumX2 = 0;
    for (let y = 0; y < N_SIM; y++) {
        for (let x = 0; x < N_SIM; x++) {
            const px = (x - N_SIM / 2) * dx;
            const prob = (r[y * N_SIM + x] ** 2 + im[y * N_SIM + x] ** 2) * dx * dx;
            sumP += prob;
            sumX2 += px * px * prob;
        }
    }
    return Math.sqrt(sumX2 / sumP);
}

// Evolve for 2000 steps with V = 0
const STEPS = 2000;
let maxNormDev = 0;

for (let s = 1; s <= STEPS; s++) {
    // 1. FFT
    fft2D(psiR, psiI, N_SIM, false);
    // 2. Kinetic multiplication
    for (let i = 0; i < N_SIM * N_SIM; i++) {
        const c = kinCos[i], s = kinSin[i];
        const pr = psiR[i], pi = psiI[i];
        psiR[i] = pr * c - pi * s;
        psiI[i] = pr * s + pi * c;
    }
    // 3. IFFT
    fft2D(psiR, psiI, N_SIM, true);

    const norm = computeNorm(psiR, psiI);
    const dev = Math.abs(norm - 1.0);
    if (dev > maxNormDev) maxNormDev = dev;
}

const totalTime = STEPS * dt;
const finalSigma = computeSigmaX(psiR, psiI);
// Analytic dispersion for hbar = 1, m = 1: sigma(t) = sigma0 * sqrt(1 + (t / (2 * sigma0^2))^2)
const analyticSigma = sigma0 * Math.sqrt(1.0 + Math.pow(totalTime / (2.0 * sigma0 * sigma0), 2));
const dispersionErr = Math.abs(finalSigma - analyticSigma) / analyticSigma;

console.log(`[schrodinger] Over ${STEPS} steps (t=${totalTime}s):`);
console.log(`  Norm max deviation: ${maxNormDev.toExponential(4)} (target < 1e-3)`);
console.log(`  Measured sigma(t): ${finalSigma.toFixed(4)}, Analytic: ${analyticSigma.toFixed(4)}, Relative error: ${(dispersionErr * 100).toFixed(3)}% (target < 1%)`);

assert(maxNormDev < 1e-3, `Norm deviation ${maxNormDev} >= 1e-3`);
assert(dispersionErr < 0.01, `Dispersion error ${dispersionErr} >= 1%`);
console.log("[schrodinger.test.js] ALL PASS");
