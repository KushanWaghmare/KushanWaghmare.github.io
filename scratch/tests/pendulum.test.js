"use strict";

/**
 * scratch/tests/pendulum.test.js
 *
 * CPU Reference Test for Double Pendulum Lagrangian Dynamics with RK4 Integration
 *
 * Equations of motion:
 *   theta1, theta2 (angles from downward vertical)
 *   omega1, omega2 (angular velocities)
 *   lengths l1 = l2 = 1.0, masses m1 = m2 = 1.0, g = 9.81
 *
 * Energy:
 *   E = T + V
 *   T = 0.5*(m1+m2)*l1^2*omega1^2 + 0.5*m2*l2^2*omega2^2 + m2*l1*l2*omega1*omega2*cos(theta1 - theta2)
 *   V = -(m1+m2)*g*l1*cos(theta1) - m2*g*l2*cos(theta2)
 *
 * Requirement:
 *   Over 20 seconds at moderate amplitude (theta1 = pi/3, theta2 = pi/4) with dt = 1e-3 (20,000 steps),
 *   the relative energy drift |E(t) - E(0)| / |E(0)| stays below 1e-6.
 *   Also verify ensemble of 200 pendulums with delta_theta0 = 1e-6 shows exponential Lyapunov separation.
 */

const assert = require("assert");

const G = 9.81;
const L1 = 1.0, L2 = 1.0;
const M1 = 1.0, M2 = 1.0;

function derivatives(th1, th2, w1, w2) {
    const dth = th1 - th2;
    const denom = L1 * (2.0 * M1 + M2 - M2 * Math.cos(2.0 * dth));

    // Angular acceleration alpha1
    const num1 = -G * (2.0 * M1 + M2) * Math.sin(th1)
                 - M2 * G * Math.sin(th1 - 2.0 * th2)
                 - 2.0 * Math.sin(dth) * M2 * (w2 * w2 * L2 + w1 * w1 * L1 * Math.cos(dth));
    const a1 = num1 / denom;

    // Angular acceleration alpha2
    const num2 = 2.0 * Math.sin(dth) * (
        w1 * w1 * L1 * (M1 + M2)
        + G * (M1 + M2) * Math.cos(th1)
        + w2 * w2 * L2 * M2 * Math.cos(dth)
    );
    const a2 = num2 / (L2 * (2.0 * M1 + M2 - M2 * Math.cos(2.0 * dth)));

    return [w1, w2, a1, a2];
}

function totalEnergy(th1, th2, w1, w2) {
    const dth = th1 - th2;
    const T = 0.5 * (M1 + M2) * L1 * L1 * w1 * w1
            + 0.5 * M2 * L2 * L2 * w2 * w2
            + M2 * L1 * L2 * w1 * w2 * Math.cos(dth);
    const V = -(M1 + M2) * G * L1 * Math.cos(th1) - M2 * G * L2 * Math.cos(th2);
    return T + V;
}

// Classical RK4 Step
function rk4Step(s, dt) {
    let [th1, th2, w1, w2] = s;

    const [k1_th1, k1_th2, k1_w1, k1_w2] = derivatives(th1, th2, w1, w2);

    const [k2_th1, k2_th2, k2_w1, k2_w2] = derivatives(
        th1 + 0.5 * dt * k1_th1,
        th2 + 0.5 * dt * k1_th2,
        w1 + 0.5 * dt * k1_w1,
        w2 + 0.5 * dt * k1_w2
    );

    const [k3_th1, k3_th2, k3_w1, k3_w2] = derivatives(
        th1 + 0.5 * dt * k2_th1,
        th2 + 0.5 * dt * k2_th2,
        w1 + 0.5 * dt * k2_w1,
        w2 + 0.5 * dt * k2_w2
    );

    const [k4_th1, k4_th2, k4_w1, k4_w2] = derivatives(
        th1 + dt * k3_th1,
        th2 + dt * k3_th2,
        w1 + dt * k3_w1,
        w2 + dt * k3_w2
    );

    return [
        th1 + (dt / 6.0) * (k1_th1 + 2.0 * k2_th1 + 2.0 * k3_th1 + k4_th1),
        th2 + (dt / 6.0) * (k1_th2 + 2.0 * k2_th2 + 2.0 * k3_th2 + k4_th2),
        w1 + (dt / 6.0) * (k1_w1 + 2.0 * k2_w1 + 2.0 * k3_w1 + k4_w1),
        w2 + (dt / 6.0) * (k1_w2 + 2.0 * k2_w2 + 2.0 * k3_w2 + k4_w2)
    ];
}

function runTest() {
    const dt = 1e-3;
    const duration = 20.0;
    const totalSteps = Math.round(duration / dt);

    // Initial condition at moderate amplitude
    const s0 = [Math.PI / 3.0, Math.PI / 4.0, 0.0, 0.0];
    const E0 = totalEnergy(...s0);

    let s = [...s0];
    let maxRelError = 0.0;

    for (let step = 0; step < totalSteps; step++) {
        s = rk4Step(s, dt);
        const E = totalEnergy(...s);
        const relErr = Math.abs(E - E0) / Math.abs(E0);
        if (relErr > maxRelError) maxRelError = relErr;
    }

    console.log(`[pendulum] Over ${duration} s (${totalSteps} steps, dt = ${dt}):`);
    console.log(`  Initial energy E0 = ${E0.toFixed(6)} J`);
    console.log(`  Max relative energy error: ${maxRelError.toExponential(4)} (target < 1e-6)`);

    assert(maxRelError < 1e-6, `Energy drift exceeded 1e-6: got ${maxRelError}`);

    // Verify ensemble Lyapunov divergence in chaotic regime
    const N = 200;
    const dTheta = 1e-6;
    const chaoticS0 = [2.15, 1.95, 0.0, 0.0];
    let ensemble = [];
    for (let i = 0; i < N; i++) {
        ensemble.push([chaoticS0[0] + i * (dTheta / N), chaoticS0[1], 0.0, 0.0]);
    }

    // Step ensemble for 15 seconds
    const sepSteps = 15000;
    for (let step = 0; step < sepSteps; step++) {
        for (let i = 0; i < N; i++) {
            ensemble[i] = rk4Step(ensemble[i], dt);
        }
    }

    const first = ensemble[0];
    const last = ensemble[N - 1];
    const finalDiff = Math.hypot(last[0] - first[0], last[1] - first[1]);
    console.log(`  Ensemble separation from delta0 = ${dTheta.toExponential(1)} in chaotic regime: ${finalDiff.toFixed(4)} rad`);
    assert(finalDiff > 0.05, `Lyapunov divergence expected > 0.05 rad: got ${finalDiff}`);

    console.log("[pendulum.test.js] ALL PASS");
}

runTest();
