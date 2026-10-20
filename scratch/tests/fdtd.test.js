"use strict";

/**
 * scratch/tests/fdtd.test.js
 *
 * CPU Reference Test for 2D FDTD Yee-Grid TE_z Electrodynamics
 * Fields: E_z, H_x, H_y
 * Maxwell's curl equations (vacuum, mu0 = eps0 = c = 1):
 *   dH_x/dt = -dE_z/dy
 *   dH_y/dt =  dE_z/dx
 *   dE_z/dt = (dH_y/dx - dH_x/dy) - sigma * E_z
 *
 * Courant stability: S = c * dt / dx <= 1 / sqrt(2) approx 0.707.
 * Here dt = 0.5 * dx / c (S = 0.5).
 *
 * Requirements:
 *   1. Measured wave phase speed is within 2% of c at 20 cells per wavelength.
 *   2. Total electromagnetic field energy stays bounded over 10,000 steps with absorbing boundary layer.
 */

const assert = require("assert");

const NX = 160;
const NY = 160;
const DX = 1.0;
const C = 1.0;
const DT = 0.5 * DX / C; // S = 0.5

const Ez = new Float64Array(NX * NY);
const Hx = new Float64Array(NX * NY);
const Hy = new Float64Array(NX * NY);

// Absorbing boundary damping profile sigma(x, y)
const sigma = new Float64Array(NX * NY);
const BORDER = 20;
for (let y = 0; y < NY; y++) {
    for (let x = 0; x < NX; x++) {
        const dLeft = x, dRight = NX - 1 - x;
        const dBottom = y, dTop = NY - 1 - y;
        const dMin = Math.min(dLeft, dRight, dBottom, dTop);
        if (dMin < BORDER) {
            const factor = (BORDER - dMin) / BORDER;
            sigma[y * NX + x] = 0.28 * Math.pow(factor, 3);
        }
    }
}

// 1. Measure wave propagation speed between probe 1 at x = 50 and probe 2 at x = 110 (distance 60 DX)
const srcX = 35, srcY = NY / 2;
const probe1X = 55, probe2X = 115;
const probeY = NY / 2;
const distProbes = (probe2X - probe1X) * DX; // 60.0

// Source: Gaussian modulated sinusoidal pulse at lambda = 20 cells (freq = c / lambda = 0.05)
const lambda = 20.0 * DX;
const freq = C / lambda;
const omega = 2.0 * Math.PI * freq;
const t0 = 35.0 * DT;
const tau = 18.0 * DT;

function sourceVal(t) {
    if (t > 4.0 * t0) return 0.0;
    const g = Math.exp(-Math.pow((t - t0) / tau, 2));
    return g * Math.sin(omega * t);
}

let tPeak1 = -1, tPeak2 = -1;
let maxVal1 = -Infinity, maxVal2 = -Infinity;

// Step loop
let maxEnergy = 0;
const STEPS = 10000;

for (let step = 1; step <= STEPS; step++) {
    const t = step * DT;

    // Update Hx: dH_x/dt = -dE_z/dy
    for (let y = 0; y < NY - 1; y++) {
        for (let x = 0; x < NX; x++) {
            const idx = y * NX + x;
            Hx[idx] -= (DT / DX) * (Ez[(y + 1) * NX + x] - Ez[idx]);
        }
    }

    // Update Hy: dH_y/dt = dE_z/dx
    for (let y = 0; y < NY; y++) {
        for (let x = 0; x < NX - 1; x++) {
            const idx = y * NX + x;
            Hy[idx] += (DT / DX) * (Ez[idx + 1] - Ez[idx]);
        }
    }

    // Update Ez: dE_z/dt = (dH_y/dx - dH_x/dy) - sigma * E_z
    for (let y = 1; y < NY; y++) {
        for (let x = 1; x < NX; x++) {
            const idx = y * NX + x;
            const curlH = (Hy[idx] - Hy[idx - 1]) - (Hx[idx] - Hx[(y - 1) * NX + x]);
            const s = sigma[idx];
            Ez[idx] = (Ez[idx] * (1.0 - 0.5 * s * DT) + (DT / DX) * curlH) / (1.0 + 0.5 * s * DT);
        }
    }

    // Soft source injection
    Ez[srcY * NX + srcX] += sourceVal(t);

    // Track peaks for phase speed
    const val1 = Ez[probeY * NX + probe1X];
    const val2 = Ez[probeY * NX + probe2X];
    if (val1 > maxVal1) { maxVal1 = val1; tPeak1 = t; }
    if (val2 > maxVal2) { maxVal2 = val2; tPeak2 = t; }

    // Energy monitoring: E_tot = 0.5 * sum(Ez^2 + Hx^2 + Hy^2)
    if (step % 200 === 0) {
        let energy = 0;
        for (let i = 0; i < NX * NY; i++) {
            energy += 0.5 * (Ez[i] * Ez[i] + Hx[i] * Hx[i] + Hy[i] * Hy[i]);
        }
        if (energy > maxEnergy) maxEnergy = energy;
        if (Number.isNaN(energy) || !Number.isFinite(energy)) {
            assert.fail(`FDTD energy exploded to NaN or Infinity at step ${step}!`);
        }
    }
}

// Check wave speed: v = distance / (tPeak2 - tPeak1)
const dtTravel = tPeak2 - tPeak1;
const measuredC = distProbes / dtTravel;
const speedErr = Math.abs(measuredC - C) / C;

console.log(`[fdtd] Wave speed test (lambda = 20 cells):`);
console.log(`  Probe 1 peak at t=${tPeak1.toFixed(2)}, Probe 2 peak at t=${tPeak2.toFixed(2)}, deltaT=${dtTravel.toFixed(2)}`);
console.log(`  Measured speed c: ${measuredC.toFixed(4)} (true c = 1.0000), error = ${(speedErr * 100).toFixed(2)}% (target < 2%)`);

console.log(`[fdtd] Energy boundedness: max energy observed = ${maxEnergy.toFixed(4)} over ${STEPS} steps`);

assert(speedErr < 0.02, `Wave speed error ${(speedErr * 100).toFixed(2)}% >= 2%`);
assert(Number.isFinite(maxEnergy) && maxEnergy < 1000.0, "Energy exploded or unstable!");
console.log("[fdtd.test.js] ALL PASS");
