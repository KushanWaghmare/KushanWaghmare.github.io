"use strict";

/**
 * scratch/tests/nbody.test.js
 *
 * CPU Reference Test for Symplectic KDK Leapfrog N-Body Integrator
 * (Toomre Galaxy Collision Core Pair)
 *
 * Model:
 *   Two massive cores (M1 = M2 = 1.0, G = 1.0) with Plummer softening epsilon = 0.05.
 *   Eccentric Keplerian orbit with eccentricity e = 0.5.
 *   Semi-major axis a = 1.0, period T = 2 * pi * sqrt(a^3 / (G * (M1 + M2))) = 2 * pi / sqrt(2) approx 4.44288.
 *   400 steps per orbit => dt = T / 400.
 *
 * Requirements:
 *   1. Symplectic Kick-Drift-Kick (KDK) leapfrog preserves relative energy:
 *      max |E(t) - E(0)| / |E(0)| < 5e-3 over 100 orbits (40,000 steps).
 *   2. Strictly zero secular energy drift (bounded oscillation around initial energy).
 */

const assert = require("assert");

const G = 1.0;
const M1 = 1.0;
const M2 = 1.0;
const M_TOT = M1 + M2;
const EPS = 0.05; // Plummer softening epsilon
const EPS_SQ = EPS * EPS;

const ECC = 0.5;
const A = 1.0;
const R_PERI = A * (1.0 - ECC); // Periastron distance = 0.5
// Vis-viva at periastron: v_rel^2 = G * M_tot * (2/r - 1/a) = 2.0 * (4.0 - 1.0) = 6.0
const V_REL = Math.sqrt(G * M_TOT * (2.0 / R_PERI - 1.0 / A));
const PERIOD = 2.0 * Math.PI * Math.sqrt((A * A * A) / (G * M_TOT));
const STEPS_PER_ORBIT = 400;
const DT = PERIOD / STEPS_PER_ORBIT;
const NUM_ORBITS = 100;
const TOTAL_STEPS = NUM_ORBITS * STEPS_PER_ORBIT;

// Positions and velocities in center-of-mass frame
let x1 = -0.5 * R_PERI, y1 = 0.0, vx1 = 0.0, vy1 = -0.5 * V_REL;
let x2 =  0.5 * R_PERI, y2 = 0.0, vx2 = 0.0, vy2 =  0.5 * V_REL;

function computeAcc(x1, y1, x2, y2) {
    const dx = x2 - x1, dy = y2 - y1;
    const r2_soft = dx * dx + dy * dy + EPS_SQ;
    const invR3 = 1.0 / (r2_soft * Math.sqrt(r2_soft));
    // Force on 1 toward 2: F12 = G * M1 * M2 * invR3 * (x2 - x1)
    const ax1 = G * M2 * dx * invR3;
    const ay1 = G * M2 * dy * invR3;
    const ax2 = -G * M1 * dx * invR3;
    const ay2 = -G * M1 * dy * invR3;
    return [ax1, ay1, ax2, ay2];
}

function computeEnergy(x1, y1, vx1, vy1, x2, y2, vx2, vy2) {
    const kin = 0.5 * M1 * (vx1 * vx1 + vy1 * vy1) + 0.5 * M2 * (vx2 * vx2 + vy2 * vy2);
    const dx = x2 - x1, dy = y2 - y1;
    const pot = -G * M1 * M2 / Math.sqrt(dx * dx + dy * dy + EPS_SQ);
    return kin + pot;
}

const E0 = computeEnergy(x1, y1, vx1, vy1, x2, y2, vx2, vy2);
console.log(`[nbody] Initial orbital energy E0 = ${E0.toFixed(6)}, dt = ${DT.toFixed(6)}, total steps = ${TOTAL_STEPS}`);

let [ax1, ay1, ax2, ay2] = computeAcc(x1, y1, x2, y2);
let maxRelErr = 0;
const orbitEndErrors = [];

for (let s = 1; s <= TOTAL_STEPS; s++) {
    // 1. Kick: half-step velocity update
    vx1 += 0.5 * DT * ax1; vy1 += 0.5 * DT * ay1;
    vx2 += 0.5 * DT * ax2; vy2 += 0.5 * DT * ay2;

    // 2. Drift: full-step position update
    x1 += DT * vx1; y1 += DT * vy1;
    x2 += DT * vx2; y2 += DT * vy2;

    // Recompute accelerations at new positions
    [ax1, ay1, ax2, ay2] = computeAcc(x1, y1, x2, y2);

    // 3. Kick: second half-step velocity update
    vx1 += 0.5 * DT * ax1; vy1 += 0.5 * DT * ay1;
    vx2 += 0.5 * DT * ax2; vy2 += 0.5 * DT * ay2;

    const E = computeEnergy(x1, y1, vx1, vy1, x2, y2, vx2, vy2);
    const relErr = Math.abs(E - E0) / Math.abs(E0);
    if (relErr > maxRelErr) maxRelErr = relErr;

    if (s % STEPS_PER_ORBIT === 0) {
        orbitEndErrors.push(relErr);
    }
}

// Check secular drift: linear regression slope of energy errors at orbit ends
const nOrb = orbitEndErrors.length;
let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
for (let i = 0; i < nOrb; i++) {
    sumX += i;
    sumY += orbitEndErrors[i];
    sumXY += i * orbitEndErrors[i];
    sumXX += i * i;
}
const driftSlope = (nOrb * sumXY - sumX * sumY) / (nOrb * sumXX - sumX * sumX);

console.log(`[nbody] Over ${NUM_ORBITS} orbits (${TOTAL_STEPS} steps):`);
console.log(`  Max relative energy error: ${maxRelErr.toExponential(4)} (target < 5e-3)`);
console.log(`  Energy drift slope per orbit: ${driftSlope.toExponential(4)} (bounded symplectic invariant)`);

assert(maxRelErr < 5e-3, `Max relative energy error ${maxRelErr} >= 5e-3`);
assert(Math.abs(driftSlope) < 1e-6, `Significant secular energy drift detected: ${driftSlope}`);
console.log("[nbody.test.js] ALL PASS");
