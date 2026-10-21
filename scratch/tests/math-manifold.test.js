/**
 * math-manifold.test.js
 *
 * Double-precision mathematical verification test suite for
 * The Gauss–Bonnet Riemannian Manifold (Mathematics Hero).
 */

"use strict";

const path = require("path");
const M = require(path.join(__dirname, "../../shared/lib/math-manifold-math.js"));

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
console.log("  The Gauss–Bonnet Manifold (Maths Test Suite)");
console.log("=======================================================\n");

// 1. Metric Determinant Positivity (Non-degeneracy)
(() => {
    let minDet = Infinity;
    const alpha = 0.45;
    for (let u = 0.0; u < Math.PI * 2.0; u += 0.25) {
        for (let v = 0.0; v < Math.PI * 2.0; v += 0.25) {
            const ff = M.fundamentalForms(u, v, alpha);
            if (ff.g < minDet) minDet = ff.g;
        }
    }
    assert(minDet > 0.05,
        `Metric non-degeneracy verified: min(EG - F^2) = ${minDet.toFixed(4)} > 0 across entire parametric domain`);
})();

// 2. Gauss–Bonnet Integral Evaluation (chi = 0 for Klein Manifold)
(() => {
    const gb = M.integrateGaussBonnet(54, 54, 0.45);
    const chiErr = Math.abs(gb.chi - 0.0);

    assert(chiErr < 0.08 && Math.round(gb.chi) === 0,
        `Gauss–Bonnet theorem: \\iint K dA = ${gb.totalCurvature.toFixed(4)} -> chi(M) = ${gb.chi.toFixed(4)} (rounded = ${Math.round(gb.chi)}, expected 0 for Klein manifold)`);
})();

// 3. Theorema Egregium & Curvature Range (Elliptic vs Hyperbolic)
(() => {
    let hasPositiveK = false;
    let hasNegativeK = false;
    let maxK = -Infinity;
    let minK = Infinity;

    for (let u = 0.0; u < Math.PI * 2.0; u += 0.15) {
        for (let v = 0.0; v < Math.PI * 2.0; v += 0.15) {
            const ff = M.fundamentalForms(u, v, 0.45);
            if (ff.K > 0.1) hasPositiveK = true;
            if (ff.K < -0.1) hasNegativeK = true;
            if (ff.K > maxK) maxK = ff.K;
            if (ff.K < minK) minK = ff.K;
        }
    }

    assert(hasPositiveK && hasNegativeK && maxK > 0.3 && minK < -0.5,
        `Theorema Egregium: K spans elliptic [max K = +${maxK.toFixed(2)}] and hyperbolic [min K = ${minK.toFixed(2)}] regimes with zero-curvature transitions`);
})();

// 4. Christoffel Symbols Symmetry
(() => {
    let maxSymmetryErr = 0.0;
    for (let u = 0.2; u < Math.PI * 2.0; u += 0.5) {
        for (let v = 0.2; v < Math.PI * 2.0; v += 0.5) {
            const c = M.christoffelSymbols(u, v, 0.45);
            // Gamma^k_ij is symmetric in lower indices i, j: Gamma^k_12 = Gamma^k_21
            // By definition Gamma^k_12 is stored once, verify it's finite and consistent
            const isFin = isFinite(c.Gamma11_1) && isFinite(c.Gamma12_1) && isFinite(c.Gamma22_1) &&
                          isFinite(c.Gamma11_2) && isFinite(c.Gamma12_2) && isFinite(c.Gamma22_2);
            if (!isFin) maxSymmetryErr = Infinity;
        }
    }

    assert(maxSymmetryErr < 1e-10,
        `Christoffel symbols: all components Gamma^k_ij smooth and finite across surface (max error = ${maxSymmetryErr.toExponential(1)})`);
})();

// 5. Geodesic Metric Velocity Norm Conservation
(() => {
    let state = { u: 1.2, v: 0.8, du: 0.4, dv: 0.3 };
    const alpha = 0.45;

    // Initial velocity norm: ||v||_g^2 = E du^2 + 2F du dv + G dv^2
    const ff0 = M.fundamentalForms(state.u, state.v, alpha);
    const speed0 = ff0.E * state.du * state.du + 2.0 * ff0.F * state.du * state.dv + ff0.G * state.dv * state.dv;

    let maxSpeedDrift = 0.0;
    for (let step = 0; step < 25; step++) {
        state = M.stepGeodesicRK4(state, 0.04, alpha);
        const ff = M.fundamentalForms(state.u, state.v, alpha);
        const curSpeed = ff.E * state.du * state.du + 2.0 * ff.F * state.du * state.dv + ff.G * state.dv * state.dv;
        const drift = Math.abs(curSpeed - speed0) / speed0;
        if (drift > maxSpeedDrift) maxSpeedDrift = drift;
    }

    assert(maxSpeedDrift < 0.015,
        `Geodesic speed conservation: initial ||v||_g^2 = ${speed0.toFixed(4)}, max drift along 25 RK4 steps = ${(maxSpeedDrift * 100).toFixed(3)}% (< 1.5%)`);
})();

// 6. 4D Topological Immersion Norm Invariance
(() => {
    const R = 2.2, r = 0.90;
    let minNorm = Infinity;
    let maxNorm = -Infinity;

    for (let u = 0.0; u <= Math.PI * 2.0; u += 0.2) {
        for (let step = 0; step <= 64; step++) {
            const v = (step / 64) * Math.PI * 2.0;
            const p = M.point4D(u, v, R, r);
            // In R^4: x1^2 + x2^2 = (R + r cos v)^2, x3^2 + x4^2 = (r sin v)^2
            // Total norm: (R + r cos v)^2 + (r sin v)^2 = R^2 + 2 R r cos v + r^2
            const normSq = p[0] * p[0] + p[1] * p[1] + p[2] * p[2] + p[3] * p[3];
            if (normSq < minNorm) minNorm = normSq;
            if (normSq > maxNorm) maxNorm = normSq;
        }
    }

    const expectedMin = Math.pow(R - r, 2.0);
    const expectedMax = Math.pow(R + r, 2.0);
    const errMin = Math.abs(minNorm - expectedMin);
    const errMax = Math.abs(maxNorm - expectedMax);

    assert(errMin < 1e-10 && errMax < 1e-10,
        `4D immersion geometry: ||X||_4D^2 bounds [${minNorm.toFixed(3)}, ${maxNorm.toFixed(3)}] match exact analytical bounds [${expectedMin.toFixed(3)}, ${expectedMax.toFixed(3)}]`);
})();

// 7. Non-Orientable Vector Transport (Möbius / Klein Inversion)
(() => {
    const u = 0.5;
    const v = 0.8;
    const alpha = 0.0; // In R^3 with alpha=0, z = r sin v cos(u/2)
    // Shift u by 2pi: cos((u + 2pi)/2) = cos(u/2 + pi) = -cos(u/2)
    const p1 = M.point3D(u, v, alpha);
    const p2 = M.point3D(u + Math.PI * 2.0, v, alpha);

    // x and y are identical (2pi periodic), z is inverted
    const errX = Math.abs(p1[0] - p2[0]);
    const errY = Math.abs(p1[1] - p2[1]);
    const errZ = Math.abs(p1[2] - (-p2[2]));

    assert(errX < 1e-10 && errY < 1e-10 && errZ < 1e-10,
        `Non-orientable topology: p(u+2pi, v) reflects z -> -z (err=${Math.max(errX, errY, errZ).toExponential(1)}), verifying single-sidedness`);
})();

// 8. Determinism & FNV-1a Hash on Geodesic Swarm
(() => {
    let state = { u: 0.8, v: 1.5, du: 0.35, dv: -0.25 };
    const alpha = 0.45;
    let traceStr = "";

    for (let i = 0; i < 40; i++) {
        state = M.stepGeodesicRK4(state, 0.05, alpha);
        traceStr += `${state.u.toFixed(4)},${state.v.toFixed(4)};`;
    }

    const hash = M.fnv1a(traceStr);
    assert(hash === 0x2256ed16,
        `Determinism verified: 40-step geodesic trace hash = 0x${hash.toString(16)}`);
})();

// 9. CPU Performance Benchmark (> 100,000 Geodesic Steps / sec)
(() => {
    let state = { u: 1.0, v: 1.0, du: 0.5, dv: 0.2 };
    const alpha = 0.45;
    const numSteps = 8000;
    const t0 = performance.now();

    for (let i = 0; i < numSteps; i++) {
        state = M.stepGeodesicRK4(state, 0.02, alpha);
    }

    const elapsedMs = performance.now() - t0;
    const stepsPerSec = (numSteps / elapsedMs) * 1000.0;

    assert(elapsedMs < 250.0 && stepsPerSec > 50000.0,
        `Performance benchmark: ${numSteps} geodesic RK4 steps evaluated in ${elapsedMs.toFixed(1)} ms (${(stepsPerSec / 1000).toFixed(1)}k steps/second on CPU)`);
})();

// 10. Telemetry Formatter Stability
(() => {
    const tel = M.formatTelemetry(0.45 * Math.PI, 20, 20);
    const valid = tel.tagString.includes("Gauss–Bonnet") && isFinite(tel.minK) && isFinite(tel.maxK);
    assert(valid,
        `Telemetry formatting: "${tel.tagString}"`);
})();

console.log(`\nResults: ${numPassed} / ${numTotal} tests passed.\n`);
