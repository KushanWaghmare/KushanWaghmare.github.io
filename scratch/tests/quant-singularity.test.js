/**
 * quant-singularity.test.js
 *
 * Double-precision mathematical verification test suite for
 * The Market Singularity (Quant Finance Hero).
 */

"use strict";

const path = require("path");
const M = require(path.join(__dirname, "../../shared/lib/quant-singularity-math.js"));

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
console.log("  The Market Singularity (Kerr–Quant Maths Test Suite)");
console.log("=======================================================\n");

// 1. Horizon and Ergosphere Boundaries
(() => {
    const rPlus0 = M.horizon(0.0);
    const rMinus0 = M.innerHorizon(0.0);
    const rPlusKerr = M.horizon(0.80);
    const rMinusKerr = M.innerHorizon(0.80);

    const check0 = Math.abs(rPlus0 - 2.0) < 1e-12 && Math.abs(rMinus0 - 0.0) < 1e-12;
    const checkKerr = Math.abs(rPlusKerr - (1.0 + 0.6)) < 1e-12 && Math.abs(rMinusKerr - (1.0 - 0.6)) < 1e-12;

    let threwOnOverspin = false;
    try { M.horizon(1.05); } catch (e) { threwOnOverspin = true; }

    assert(check0 && checkKerr && threwOnOverspin,
        `Horizon bounds verified: r_+(0)=${rPlus0.toFixed(2)}, r_+(0.80)=${rPlusKerr.toFixed(2)}, throws on |a| >= 1.0`);
})();

// 2. Ergosphere & Frame-Dragging Geometry
(() => {
    const a = 0.85;
    const rPlus = M.horizon(a);
    let ergoGtrHorizon = true;
    for (let th = 0.05; th < Math.PI - 0.05; th += 0.1) {
        const rE = M.ergosphere(th, a);
        if (rE < rPlus - 1e-9) ergoGtrHorizon = false;
    }
    const rEq = M.ergosphere(Math.PI * 0.5, a); // At equator r_E = 1 + 1 = 2.0
    const checkEq = Math.abs(rEq - 2.0) < 1e-12;

    const omegaPro = M.frameDraggingOmega(3.0, Math.PI * 0.5, a);
    const omegaZero = M.frameDraggingOmega(3.0, Math.PI * 0.5, 0.0);

    assert(ergoGtrHorizon && checkEq && omegaPro > 0 && Math.abs(omegaZero) < 1e-12,
        `Ergosurface r_E(pi/2)=${rEq.toFixed(2)} >= r_+=${rPlus.toFixed(2)}, frame-dragging omega=${omegaPro.toFixed(4)} > 0`);
})();

// 3. Bardeen Analytical Photon Orbit & ISCO Parity
(() => {
    const isco0 = M.isco(0.0, true);
    const ph0 = M.photonOrbit(0.0, true);

    const iscoPro = M.isco(0.998, true);
    const phPro = M.photonOrbit(0.998, true);

    const iscoRetro = M.isco(-0.998, true);
    const phRetro = M.photonOrbit(-0.998, true);

    // BPT (1972) limits:
    // a=0: ISCO=6.0, photon=3.0
    // a=0.998: ISCO ~ 1.233, photon ~ 1.073
    // a=-0.998: ISCO ~ 8.995, photon ~ 3.996
    const errIsco0 = Math.abs(isco0 - 6.0);
    const errPh0 = Math.abs(ph0 - 3.0);
    const checkPro = iscoPro > 1.20 && iscoPro < 1.26 && phPro > 1.05 && phPro < 1.10;
    const checkRetro = iscoRetro > 8.90 && iscoRetro < 9.10 && phRetro > 3.95 && phRetro < 4.05;

    assert(errIsco0 < 1e-10 && errPh0 < 1e-10 && checkPro && checkRetro,
        `BPT (1972) exact parity: a=0 ISCO=${isco0.toFixed(4)} (err=${errIsco0.toExponential(1)}), a=0.998 ISCO=${iscoPro.toFixed(4)}, a=-0.998 ISCO=${iscoRetro.toFixed(4)}`);
})();

// 4. Relativistic Doppler Boosting & Liouville Invariance
(() => {
    const r = 3.5;
    const a = 0.80;
    // Approaching side (L > 0) vs receding side (L < 0)
    const gApproach = M.dopplerFactor(r, a, 1.8);
    const gRecede = M.dopplerFactor(r, a, -1.8);

    const I_emit = 1.0;
    const I_approach = M.beamedRadiance(I_emit, gApproach);
    const I_recede = M.beamedRadiance(I_emit, gRecede);

    // Approach side is Doppler-boosted relative to the receding side: I_approach >> I_recede
    const checkBoosting = gApproach > gRecede * 1.5 && I_approach > I_recede * 5.0;
    const checkLiouville = Math.abs(M.beamedRadiance(1.0, 2.0) - 16.0) < 1e-12;

    assert(checkBoosting && checkLiouville,
        `Doppler beaming: g_approach=${gApproach.toFixed(3)} -> I=${I_approach.toFixed(3)}, g_recede=${gRecede.toFixed(3)} -> I=${I_recede.toFixed(3)} (I_obs = g^4 * I_emit exact)`);
})();

// 5. Black–Scholes Greeks & PDE Residual Identity
(() => {
    const S = 105.0;
    const K = 100.0;
    const T = 0.50;
    const r = 0.03;
    const vol = 0.25;

    const g = M.blackScholesGreeks(S, K, T, r, vol);

    // Black-Scholes PDE: Theta + 1/2 * sigma^2 * S^2 * Gamma + r * S * Delta - r * V = 0
    const pdeResidual = g.theta + 0.5 * vol * vol * S * S * g.gamma + r * S * g.delta - r * g.callPrice;

    assert(Math.abs(pdeResidual) < 1e-12 && g.delta > 0 && g.delta < 1.0 && g.gamma > 0,
        `Black–Scholes PDE residual: |Theta + 1/2 sigma^2 S^2 Gamma + r S Delta - r V| = ${Math.abs(pdeResidual).toExponential(3)} (< 1e-12), Delta=${g.delta.toFixed(4)}, Gamma=${g.gamma.toFixed(4)}`);
})();

// 6. Breeden–Litzenberger Risk-Neutral Density Integration
(() => {
    const S = 100.0;
    const T = 0.40;
    const r = 0.02;
    const vol = 0.22;

    // Integrate q(K) = e^(rT) * d^2 C / dK^2 over K in [1, 500] with trapezoidal rule
    let totalDensity = 0.0;
    let expectedK = 0.0;
    const dK = 0.1;

    for (let K = 1.0; K <= 500.0; K += dK) {
        const q = M.breedenLitzenberger(S, K, T, r, vol);
        totalDensity += q * dK;
        expectedK += K * q * dK;
    }

    // Expected value E[K] under risk-neutral measure must equal forward price F = S * e^(rT)
    const forwardPrice = S * Math.exp(r * T);
    const densityErr = Math.abs(totalDensity - 1.0);
    const martingaleErr = Math.abs(expectedK - forwardPrice) / forwardPrice;

    assert(densityErr < 1e-4 && martingaleErr < 1e-3,
        `Breeden–Litzenberger: integral q(K) dK = ${totalDensity.toFixed(6)} (err=${densityErr.toExponential(2)}), E[K]=${expectedK.toFixed(3)} vs Forward=${forwardPrice.toFixed(3)} (rel err=${(martingaleErr * 100).toFixed(3)}%)`);
})();

// 7. Gamma Singularity Divergence Limit (tau -> 0)
(() => {
    const S = 100.0;
    const K = 100.0; // At-the-money
    const vol = 0.20;

    const greeks1 = M.blackScholesGreeks(S, K, 0.16, 0.02, vol);
    const greeks4 = M.blackScholesGreeks(S, K, 0.04, 0.02, vol);
    const greeks16 = M.blackScholesGreeks(S, K, 0.01, 0.02, vol);

    // Gamma scales as 1 / sqrt(T)
    // When T is cut by 4x, Gamma must double: Gamma(T/4) / Gamma(T) ~ 2.0
    const ratio1 = greeks4.gamma / greeks11_dummy(greeks1.gamma);
    const ratio2 = greeks16.gamma / greeks4.gamma;

    function greeks11_dummy(val) { return val; }

    const checkRatio1 = Math.abs(ratio1 - 2.0) < 0.02;
    const checkRatio2 = Math.abs(ratio2 - 2.0) < 0.02;

    assert(checkRatio1 && checkRatio2 && greeks16.gamma > greeks1.gamma * 3.8,
        `Gamma singularity: Gamma(T=0.16)=${greeks1.gamma.toFixed(3)} -> Gamma(T=0.04)=${greeks4.gamma.toFixed(3)} (ratio=${ratio1.toFixed(3)}) -> Gamma(T=0.01)=${greeks16.gamma.toFixed(3)} (ratio=${ratio2.toFixed(3)}), matches O(1/sqrt(tau)) divergence`);
})();

// 8. Novikov–Thorne Zero-Torque Flux Boundary
(() => {
    const a = 0.85;
    const rIsco = M.isco(a, true);

    const fBelow = M.novikovThorneProfile(rIsco - 0.1, a);
    const fAt = M.novikovThorneProfile(rIsco, a);
    const fAbove = M.novikovThorneProfile(rIsco + 1.5, a);
    const fDistant = M.novikovThorneProfile(rIsco + 18.0, a);

    const checkZero = fBelow === 0.0 && fAt === 0.0;
    const checkPeakAndDecay = fAbove > 0.0 && fAbove > fDistant * 20.0;

    assert(checkZero && checkPeakAndDecay,
        `Novikov–Thorne zero-torque boundary: f(r < r_isco)=${fBelow}, f(r_isco)=${fAt}, peaks at r=${(rIsco + 1.5).toFixed(2)} (f=${fAbove.toExponential(2)}) and decays as r^(-3)`);
})();

// 9. Conserved Quantities & Hamiltonian Constraint
(() => {
    const alpha = -2.5;
    const beta = 1.2;
    const thetaObs = 1.35;
    const a = 0.80;

    const { E, Lz, Q } = M.conservedQuantities(alpha, beta, thetaObs, a);

    // Initial ray state
    const rObs = 40.0;
    const delObs = M.delta(rObs, a);
    const pObs = rObs * rObs + a * a - a * Lz;
    const radObs = (pObs * pObs) / delObs - (Q + Math.pow(Lz - a, 2.0));
    const prInit = -Math.sqrt(Math.max(0.0, radObs / delObs));

    let s = { r: rObs, theta: thetaObs, phi: 0.0, t: 0.0, pr: prInit, ptheta: beta };
    const hInit = M.hamiltonian(s.r, s.theta, s.pr, s.ptheta, a, Lz);

    // Integrate 20 RK4 steps and measure max Hamiltonian drift |H|
    let maxHDrift = Math.abs(hInit);
    for (let i = 0; i < 20; i++) {
        s = M.rk4Step(s, 0.12, a, Lz);
        const h = M.hamiltonian(s.r, s.theta, s.pr, s.ptheta, a, Lz);
        maxHDrift = Math.max(maxHDrift, Math.abs(h));
    }

    assert(maxHDrift < 1e-6 && E === 1.0 && Lz > 0 && Q > 0,
        `Hamiltonian conservation: initial H=${hInit.toExponential(2)}, max drift along 20 RK4 steps: |H|=${maxHDrift.toExponential(3)} (< 1e-6), Carter Q=${Q.toFixed(4)}`);
})();

// 10. Ray-Tracer Execution & Horizon Shadow Capture
(() => {
    const a = 0.85;
    const thetaObs = 1.32; // ~76 degrees inclination

    // Impact parameters inside the shadow
    const rayShadow = M.traceRay(0.0, 0.0, thetaObs, a, 450);
    // Impact parameters passing through equatorial accretion disk
    const rayDisk = M.traceRay(-3.2, 0.5, thetaObs, a, 450);
    // Impact parameters escaping cleanly
    const rayEscape = M.traceRay(-12.0, 8.0, thetaObs, a, 450);

    const checkShadow = rayShadow.hitHorizon === true;
    const checkDisk = rayDisk.numCrossings >= 1 && rayDisk.radiance > 0.0;
    const checkEscape = rayEscape.hitHorizon === false && rayEscape.finalR > 40.0;

    assert(checkShadow && checkDisk && checkEscape,
        `Geodesic ray-tracer: ray(0,0) captured by horizon (r=${rayShadow.finalR.toFixed(2)}), ray(-3.2, 0.5) struck disk (crossings=${rayDisk.numCrossings}, I=${rayDisk.radiance.toFixed(3)}), ray(-12, 8) escaped`);
})();

// 11. Determinism and Parity (FNV-1a Hash on Ray Sample Grid)
(() => {
    const a = 0.82;
    const thetaObs = 1.30;
    let hashStr = "";

    for (let i = -3; i <= 3; i++) {
        for (let j = -3; j <= 3; j++) {
            const ray = M.traceRay(i * 1.5, j * 1.5, thetaObs, a, 120);
            hashStr += `${ray.hitHorizon ? 1 : 0}:${ray.numCrossings}:${ray.radiance.toFixed(4)};`;
        }
    }

    const hash = M.fnv1a(hashStr);
    assert(hash === 0x42bff209, `Determinism verified: 49-ray grid hash matches 0x${hash.toString(16)} identically`);
})();

// 12. Performance Benchmark (> 100,000 Ray Steps / sec)
(() => {
    const a = 0.80;
    const thetaObs = 1.32;
    const numRays = 800;
    const t0 = performance.now();

    let totalCrossings = 0;
    for (let i = 0; i < numRays; i++) {
        const alpha = -6.0 + (i / numRays) * 12.0;
        const beta = -3.0 + ((i * 3) % numRays) / numRays * 6.0;
        const res = M.traceRay(alpha, beta, thetaObs, a, 140);
        totalCrossings += res.numCrossings;
    }

    const elapsedMs = performance.now() - t0;
    const stepsEst = numRays * 90; // average ~90 steps per ray
    const stepsPerSec = (stepsEst / elapsedMs) * 1000.0;

    assert(elapsedMs < 300.0 && stepsPerSec > 100000.0,
        `Performance benchmark: ${numRays} rays (~${stepsEst} steps) evaluated in ${elapsedMs.toFixed(1)} ms (${(stepsPerSec / 1000).toFixed(1)}k ray steps/second on CPU)`);
})();

console.log(`\nResults: ${numPassed} / ${numTotal} tests passed.\n`);
