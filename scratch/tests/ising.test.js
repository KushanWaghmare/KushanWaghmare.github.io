"use strict";

/**
 * scratch/tests/ising.test.js
 *
 * CPU Reference Test for 2D Ising Model via Checkerboard Metropolis
 * Hamiltonian:
 *   H = -J * sum_{<i,j>} s_i * s_j,  s_i in {-1, +1},  J = 1, k_B = 1.
 *
 * Critical temperature (Onsager):
 *   T_c = 2 / ln(1 + sqrt(2)) approx 2.269185
 *
 * Spontaneous magnetization below T_c (Yang / Onsager closed form):
 *   M(T) = (1 - sinh(2 * J / (k_B * T))^(-4))^(1/8)
 *   At T = 2.0, J = 1: M(2.0) approx 0.9113
 *
 * Requirement:
 *   On a 128x128 lattice initialized fully ordered (+1) at T = 2.0,
 *   the mean equilibrium magnetization |<M>| matches 0.911 within 0.02.
 */

const assert = require("assert");

const L = 128;
const N = L * L;
const T = 2.0;
const BETA = 1.0 / T;

// Onsager exact value
const sinhVal = Math.sinh(2.0 / T);
const onsagerM = Math.pow(1.0 - Math.pow(sinhVal, -4), 1.0 / 8.0);
console.log(`[ising] Theoretical Onsager magnetization at T=2.0: ${onsagerM.toFixed(4)}`);

// Initialise fully ordered: s_i = +1
const spins = new Int8Array(N);
spins.fill(1);

// Fast PCG PRNG
let seed = 48201;
function pcg() {
    seed = (Math.imul(seed >>> 0, 747796405) + 2891336453) >>> 0;
    const shift = ((seed >>> 28) + 4) >>> 0;
    const word = Math.imul(((seed >>> shift) ^ seed) >>> 0, 277803737) >>> 0;
    return (((word >>> 22) ^ word) >>> 0) / 4294967296.0;
}

// Precompute Boltzmann factors: exp(-beta * deltaE) for deltaE in {-8, -4, 0, 4, 8}
const expTable = {};
for (const dE of [-8, -4, 0, 4, 8]) {
    expTable[dE] = Math.exp(-BETA * dE);
}

// Checkerboard Metropolis sweep: color = 0 (even), color = 1 (odd)
function checkerboardSweep(color) {
    for (let y = 0; y < L; y++) {
        const yOffset = y * L;
        const up = ((y + 1) % L) * L;
        const down = ((y - 1 + L) % L) * L;
        for (let x = 0; x < L; x++) {
            if (((x + y) & 1) !== color) continue;
            const idx = yOffset + x;
            const left = yOffset + ((x - 1 + L) % L);
            const right = yOffset + ((x + 1) % L);

            const s = spins[idx];
            const sumNeighbors = spins[up + x] + spins[down + x] + spins[left] + spins[right];
            const dE = 2 * s * sumNeighbors;

            if (dE <= 0 || pcg() < expTable[dE]) {
                spins[idx] = -s;
            }
        }
    }
}

// Equilibration: 400 full sweeps (color 0 then color 1)
const warmupSweeps = 400;
for (let sw = 0; sw < warmupSweeps; sw++) {
    checkerboardSweep(0);
    checkerboardSweep(1);
}

// Measurement: average magnetization over 300 sweeps
const sampleSweeps = 300;
let sumM = 0;

for (let sw = 0; sw < sampleSweeps; sw++) {
    checkerboardSweep(0);
    checkerboardSweep(1);
    let totalSpin = 0;
    for (let i = 0; i < N; i++) totalSpin += spins[i];
    sumM += Math.abs(totalSpin) / N;
}

const measuredM = sumM / sampleSweeps;
const diff = Math.abs(measuredM - onsagerM);

console.log(`[ising] 128x128 lattice at T=2.0 (equilibrated ${warmupSweeps} sweeps, sampled ${sampleSweeps} sweeps):`);
console.log(`  Measured |<M>|: ${measuredM.toFixed(4)}, Onsager: ${onsagerM.toFixed(4)}, Difference: ${diff.toFixed(4)} (target < 0.02)`);

assert(diff < 0.02, `Measured magnetization ${measuredM.toFixed(4)} differs from Onsager ${onsagerM.toFixed(4)} by ${diff.toFixed(4)} >= 0.02`);
console.log("[ising.test.js] ALL PASS");
