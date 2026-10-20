"use strict";

/**
 * scratch/tests/hub-lorenz.test.js
 *
 * CPU Reference Test for Lorenz Attractor (Hub Sim)
 * Governing equations:
 *   dx/dt = sigma * (y - x)
 *   dy/dt = x * (rho - z) - y
 *   dz/dt = x * y - beta * z
 *
 * Standard parameters: sigma = 10, rho = 28, beta = 8/3.
 * Requirements:
 *   1. Largest Lyapunov exponent via Benettin et al. algorithm: lambda_1 = 0.906 +- 0.05.
 *   2. Trajectory stays bounded on the attractor for 10^4 steps with chosen RK4 dt.
 */

const assert = require("assert");

const SIGMA = 10.0;
const RHO = 28.0;
const BETA = 8.0 / 3.0;
const DT = 0.005;

function lorenzDeriv(x, y, z) {
    return [
        SIGMA * (y - x),
        x * (RHO - z) - y,
        x * y - BETA * z
    ];
}

function rk4Step(x, y, z, dt) {
    const [k1x, k1y, k1z] = lorenzDeriv(x, y, z);

    const x2 = x + 0.5 * dt * k1x;
    const y2 = y + 0.5 * dt * k1y;
    const z2 = z + 0.5 * dt * k1z;
    const [k2x, k2y, k2z] = lorenzDeriv(x2, y2, z2);

    const x3 = x + 0.5 * dt * k2x;
    const y3 = y + 0.5 * dt * k2y;
    const z3 = z + 0.5 * dt * k2z;
    const [k3x, k3y, k3z] = lorenzDeriv(x3, y3, z3);

    const x4 = x + dt * k3x;
    const y4 = y + dt * k3y;
    const z4 = z + dt * k3z;
    const [k4x, k4y, k4z] = lorenzDeriv(x4, y4, z4);

    return [
        x + (dt / 6.0) * (k1x + 2.0 * k2x + 2.0 * k3x + k4x),
        y + (dt / 6.0) * (k1y + 2.0 * k2y + 2.0 * k3y + k4y),
        z + (dt / 6.0) * (k1z + 2.0 * k2z + 2.0 * k3z + k4z)
    ];
}

// 1. Test boundedness over 10^4 steps
let [x, y, z] = [1.0, 1.0, 1.0];
// Warm up onto attractor
for (let i = 0; i < 2000; i++) {
    [x, y, z] = rk4Step(x, y, z, DT);
}

let minR = Infinity, maxR = -Infinity;
for (let i = 0; i < 10000; i++) {
    [x, y, z] = rk4Step(x, y, z, DT);
    const r = Math.hypot(x, y, z);
    if (r < minR) minR = r;
    if (r > maxR) maxR = r;
}

console.log(`[hub-lorenz] Boundedness over 10,000 steps: minRadius=${minR.toFixed(2)}, maxRadius=${maxR.toFixed(2)}`);
assert(maxR < 60.0 && minR > 1.0 && !Number.isNaN(maxR), "Trajectory diverged or collapsed!");

// 2. Benettin estimate of largest Lyapunov exponent
// Integrate base trajectory and perturbed trajectory, renormalizing separation d0 = 1e-8
const d0 = 1e-8;
let [xb, yb, zb] = [x, y, z];
let [xp, yp, zp] = [xb + d0, yb, zb];

let lyapSum = 0;
const warmupSteps = 5000;
const evalSteps = 40000;

for (let i = 0; i < warmupSteps; i++) {
    [xb, yb, zb] = rk4Step(xb, yb, zb, DT);
    [xp, yp, zp] = rk4Step(xp, yp, zp, DT);
    const dx = xp - xb, dy = yp - yb, dz = zp - zb;
    const d1 = Math.hypot(dx, dy, dz);
    xp = xb + (d0 / d1) * dx;
    yp = yb + (d0 / d1) * dy;
    zp = zb + (d0 / d1) * dz;
}

for (let i = 0; i < evalSteps; i++) {
    [xb, yb, zb] = rk4Step(xb, yb, zb, DT);
    [xp, yp, zp] = rk4Step(xp, yp, zp, DT);
    const dx = xp - xb, dy = yp - yb, dz = zp - zb;
    const d1 = Math.hypot(dx, dy, dz);
    lyapSum += Math.log(d1 / d0);
    xp = xb + (d0 / d1) * dx;
    yp = yb + (d0 / d1) * dy;
    zp = zb + (d0 / d1) * dz;
}

const lambda1 = lyapSum / (evalSteps * DT);
console.log(`[hub-lorenz] Benettin largest Lyapunov exponent estimate: ${lambda1.toFixed(4)} (target: 0.906 +- 0.05)`);

assert(Math.abs(lambda1 - 0.906) <= 0.05, `Lyapunov exponent ${lambda1} out of expected range [0.856, 0.956]`);
console.log("[hub-lorenz.test.js] ALL PASS");
