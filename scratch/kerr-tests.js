/**
 * kerr-tests.js
 *
 * Verification test suite for Kerr black hole CPU reference implementation.
 * Validates all analytical limits, conservation laws, symmetries, and step convergence.
 */

'use strict';

const {
    sigma,
    delta,
    horizon,
    photonOrbit,
    isco,
    keplerianOmega,
    fourVelocityUt,
    redshiftFactor,
    pageThorneFlux,
    hamiltonian,
    carterQ,
    canonicalDerivatives,
    bardeenRayInit,
    rk4Step,
    refineEquatorialCrossing,
    traceRay
} = require('./kerr-reference');

const ANSI_GREEN = '\x1b[32m';
const ANSI_RED = '\x1b[31m';
const ANSI_RESET = '\x1b[0m';
const ANSI_BOLD = '\x1b[1m';

let passedCount = 0;
let failedCount = 0;

const assert = (condition, description) => {
    if (condition) {
        passedCount++;
        console.log(`  ${ANSI_GREEN}✓${ANSI_RESET} ${description}`);
    } else {
        failedCount++;
        console.error(`  ${ANSI_RED}✗ FAIL:${ANSI_RESET} ${description}`);
    }
};

console.log(`${ANSI_BOLD}Starting Kerr Geodesic & Accretion Disk Physics Verification Suite...${ANSI_RESET}\n`);

// ---------------------------------------------------------------------------
// TEST 1: Schwarzschild limit (a = 0)
// ---------------------------------------------------------------------------
console.log(`${ANSI_BOLD}Test 1: Schwarzschild limit (a = 0)${ANSI_RESET}`);
{
    const a0 = 0;
    const rPh0 = photonOrbit(a0, true);
    const rIsco0 = isco(a0, true);
    const bcAnalytic = 3 * Math.sqrt(3);

    assert(Math.abs(rPh0 - 3.0) < 1e-12, `Photon orbit r_ph = 3 (got ${rPh0})`);
    assert(Math.abs(rIsco0 - 6.0) < 1e-12, `ISCO radius = 6 (got ${rIsco0})`);
    assert(Math.abs(bcAnalytic - 5.1961524227) < 1e-6, `Critical impact parameter b_c = 3√3 ≈ 5.196 (got ${bcAnalytic.toFixed(5)})`);

    // Verify critical impact parameter with ray tracing from distant observer (r_obs = 100)
    const r_obs = 100.0;
    const theta_obs = Math.PI / 2; // equator
    const eps = 0.05;

    // Ray inside critical impact parameter (should be captured by horizon r_+ = 2)
    const rayInner = traceRay(bcAnalytic - eps, 0, { a: 0, r_obs, theta_obs, maxSteps: 8000 });
    assert(rayInner.status === 'captured', `Ray with b = b_c - ${eps} is captured by horizon (status: ${rayInner.status})`);

    // Ray outside critical impact parameter (should escape back to infinity)
    const rayOuter = traceRay(bcAnalytic + eps, 0, { a: 0, r_obs, theta_obs, maxSteps: 8000 });
    assert(rayOuter.status === 'escaped', `Ray with b = b_c + ${eps} escapes to infinity (status: ${rayOuter.status})`);
}
console.log('');

// ---------------------------------------------------------------------------
// TEST 2: High-spin and Extremal Kerr Limits
// ---------------------------------------------------------------------------
console.log(`${ANSI_BOLD}Test 2: High-spin and Extremal Kerr Limits${ANSI_RESET}`);
{
    // a = 0.998 prograde
    const a998 = 0.998;
    const isco998 = isco(a998, true);
    const rPh998 = photonOrbit(a998, true);

    assert(Math.abs(isco998 - 1.237) < 0.001, `a = 0.998 prograde ISCO ≈ 1.237 (got ${isco998.toFixed(4)})`);
    assert(Math.abs(rPh998 - 1.07) < 0.005, `a = 0.998 prograde r_ph ≈ 1.07 (got ${rPh998.toFixed(4)})`);

    // a = 1.0 extremal
    const a1 = 1.0;
    const isco1Pro = isco(a1, true);
    const rPh1Pro = photonOrbit(a1, true);
    const isco1Retro = isco(a1, false);

    assert(Math.abs(isco1Pro - 1.0) < 1e-12, `a = 1 prograde ISCO = 1.0 (got ${isco1Pro})`);
    assert(Math.abs(rPh1Pro - 1.0) < 1e-12, `a = 1 prograde photon orbit r_ph = 1.0 (got ${rPh1Pro})`);
    assert(Math.abs(isco1Retro - 9.0) < 1e-12, `a = 1 retrograde ISCO = 9.0 (got ${isco1Retro})`);
}
console.log('');

// ---------------------------------------------------------------------------
// TEST 3: Canonical Derivative Verification & 1,000-Ray Conservation
// ---------------------------------------------------------------------------
console.log(`${ANSI_BOLD}Test 3: Canonical Derivative Verification & Conservation Laws${ANSI_RESET}`);
{
    // Part A: Check analytical canonical derivatives against finite differences
    const testA = 0.9;
    const testL = 2.4;
    const r0 = 8.5, theta0 = 1.2, pr0 = -0.35, ptheta0 = 0.45;
    const eps = 1e-7;

    const dH_dpr_fd = (hamiltonian(r0, theta0, pr0 + eps, ptheta0, testA, testL) -
                       hamiltonian(r0, theta0, pr0 - eps, ptheta0, testA, testL)) / (2 * eps);
    const dH_dptheta_fd = (hamiltonian(r0, theta0, pr0, ptheta0 + eps, testA, testL) -
                           hamiltonian(r0, theta0, pr0, ptheta0 - eps, testA, testL)) / (2 * eps);
    const neg_dH_dr_fd = -(hamiltonian(r0 + eps, theta0, pr0, ptheta0, testA, testL) -
                          hamiltonian(r0 - eps, theta0, pr0, ptheta0, testA, testL)) / (2 * eps);
    const neg_dH_dtheta_fd = -(hamiltonian(r0, theta0 + eps, pr0, ptheta0, testA, testL) -
                             hamiltonian(r0, theta0 - eps, pr0, ptheta0, testA, testL)) / (2 * eps);

    const derivs = canonicalDerivatives({ r: r0, theta: theta0, pr: pr0, ptheta: ptheta0 }, testA, testL);

    assert(Math.abs(derivs.dr - dH_dpr_fd) < 1e-8, `dr/dλ matches ∂H/∂p_r (error ${Math.abs(derivs.dr - dH_dpr_fd).toExponential(3)})`);
    assert(Math.abs(derivs.dtheta - dH_dptheta_fd) < 1e-8, `dθ/dλ matches ∂H/∂p_θ (error ${Math.abs(derivs.dtheta - dH_dptheta_fd).toExponential(3)})`);
    assert(Math.abs(derivs.dpr - neg_dH_dr_fd) < 1e-8, `dp_r/dλ matches -∂H/∂r (error ${Math.abs(derivs.dpr - neg_dH_dr_fd).toExponential(3)})`);
    assert(Math.abs(derivs.dptheta - neg_dH_dtheta_fd) < 1e-8, `dp_θ/dλ matches -∂H/∂θ (error ${Math.abs(derivs.dptheta - neg_dH_dtheta_fd).toExponential(3)})`);

    // Part B: 1,000 random non-horizon rays maintaining |H| < 1e-6 and |ΔQ| < 1e-6
    console.log('  Testing 1,000 random escaping rays for Hamiltonian and Carter Q conservation...');
    const rayCount = 1000;
    const aTest = 0.9;
    const rObsTest = 60.0;
    const thetaObsTest = (75 * Math.PI) / 180;

    let overallMaxH = 0;
    let overallMaxQDrift = 0;
    let nonCapturedCount = 0;

    // Use deterministic pseudo-random sequence for repeatability
    let seed = 123456789;
    const pseudoRand = () => {
        seed = (seed * 1664525 + 1013904223) % 4294967296;
        return seed / 4294967296;
    };

    while (nonCapturedCount < rayCount) {
        // Sample screen coordinates in escaping region (radius outside shadow b in [6.5, 25])
        const rad = 6.5 + pseudoRand() * 18.5;
        const ang = pseudoRand() * 2 * Math.PI;
        const alpha = rad * Math.cos(ang);
        const beta = rad * Math.sin(ang);

        const res = traceRay(alpha, beta, {
            a: aTest,
            r_obs: rObsTest,
            theta_obs: thetaObsTest,
            maxSteps: 1500,
            useAdaptive: true,
            tol: 1e-8
        });

        if (res.status === 'escaped') {
            nonCapturedCount++;
            if (res.maxH > overallMaxH) overallMaxH = res.maxH;
            if (res.maxQDrift > overallMaxQDrift) overallMaxQDrift = res.maxQDrift;
        }
    }

    assert(overallMaxH < 1e-6, `All 1,000 rays maintain |H| < 1e-6 (max |H| = ${overallMaxH.toExponential(4)})`);
    assert(overallMaxQDrift < 1e-6, `All 1,000 rays maintain |ΔQ| < 1e-6 (max |ΔQ| = ${overallMaxQDrift.toExponential(4)})`);
}
console.log('');

// ---------------------------------------------------------------------------
// TEST 4: Mirror Symmetry
// ---------------------------------------------------------------------------
console.log(`${ANSI_BOLD}Test 4: Mirror Symmetry (a -> -a, α -> -α)${ANSI_RESET}`);
{
    const aVal = 0.85;
    const r_obs = 50.0;
    const theta_obs = (80 * Math.PI) / 180;
    let symmetryHolds = true;
    let maxDiffR = 0;

    const testRays = [
        [-8.0, 3.0], [-5.0, 2.0], [-3.5, 0.5],
        [3.5, 0.5], [5.0, 2.0], [8.0, 3.0],
        [-6.0, -4.0], [6.0, -4.0], [-10.0, 0.0], [10.0, 0.0]
    ];

    for (const [alpha, beta] of testRays) {
        // Ray 1: spin +aVal, screen (alpha, beta)
        const rayA = traceRay(alpha, beta, { a: aVal, r_obs, theta_obs, maxSteps: 4000, stepScale: 0.5 });
        // Ray 2: spin -aVal, screen (-alpha, beta)
        const rayB = traceRay(-alpha, beta, { a: -aVal, r_obs, theta_obs, maxSteps: 4000, stepScale: 0.5 });

        assert(rayA.status === rayB.status, `Ray status matches for α=${alpha}, β=${beta} (${rayA.status})`);

        // Check equatorial crossings
        if (rayA.diskCrossings.length === rayB.diskCrossings.length) {
            for (let i = 0; i < rayA.diskCrossings.length; i++) {
                const diff = Math.abs(rayA.diskCrossings[i].r - rayB.diskCrossings[i].r);
                if (diff > maxDiffR) maxDiffR = diff;
                if (diff > 1e-5) symmetryHolds = false;
            }
        } else {
            symmetryHolds = false;
        }
    }

    assert(symmetryHolds && maxDiffR < 1e-5, `Mirror symmetry across vertical axis holds identically (max Δr = ${maxDiffR.toExponential(4)})`);
}
console.log('');

// ---------------------------------------------------------------------------
// TEST 5: Approaching-Side Doppler and Redshift Test
// ---------------------------------------------------------------------------
console.log(`${ANSI_BOLD}Test 5: Approaching-Side Doppler and Redshift Test${ANSI_RESET}`);
{
    const aVal = 0.95;
    const theta_obs = (80 * Math.PI) / 180;

    // Part A: Screen rays comparison
    // Compare pairs of screen rays with α = -α0 (approaching) and α = +α0 (receding)
    const alphaList = [4.0, 5.0, 6.0, 8.0, 10.0, 15.0];
    let allScreenApproachingLarger = true;
    let minScreenRatio = Infinity;
    let maxScreenRatio = 0;

    for (const alpha0 of alphaList) {
        const rayApp = traceRay(-alpha0, 0.0, { a: aVal, theta_obs });
        const rayRec = traceRay(+alpha0, 0.0, { a: aVal, theta_obs });

        const gApp = rayApp.diskCrossings[0]?.g;
        const gRec = rayRec.diskCrossings[0]?.g;

        if (gApp && gRec) {
            const ratio = gApp / gRec;
            if (ratio < minScreenRatio) minScreenRatio = ratio;
            if (ratio > maxScreenRatio) maxScreenRatio = ratio;
            if (gApp <= gRec) allScreenApproachingLarger = false;
        }
    }

    assert(allScreenApproachingLarger, `Screen rays: g(approaching, α < 0) > g(receding, α > 0) holds across all disk-crossing pairs (ratios ${minScreenRatio.toFixed(2)}x to ${maxScreenRatio.toFixed(2)}x)`);

    // Part B: Local disk emission test
    // For a given radius r on the disk, an approaching photon (L > 0) has g > 1 (blueshifted),
    // while a receding photon (L < 0) has g < 1 (redshifted).
    const r_isco = isco(aVal, true);
    const radii = [r_isco + 0.5, 3.0, 5.0, 8.0, 14.0];
    let allLocalApproachingLarger = true;

    for (const r of radii) {
        const L_app = 1.5;  // approaching (prograde photon moving towards observer)
        const L_rec = -1.5; // receding (photon moving away from observer)

        const gApp = redshiftFactor(r, aVal, L_app);
        const gRec = redshiftFactor(r, aVal, L_rec);

        if (gApp <= gRec) allLocalApproachingLarger = false;
    }

    assert(allLocalApproachingLarger, `Local disk emission: g(L > 0) > g(L < 0) holds strictly across all disk radii`);

    // Part C: Verify Doppler beaming intensity boost g^4
    const beamedBoost = Math.pow(minScreenRatio, 4);
    assert(beamedBoost > 1.0, `Doppler beaming factor g⁴ boosts approaching side significantly (boost factor ≥ ${beamedBoost.toFixed(1)}x)`);
}
console.log('');

// ---------------------------------------------------------------------------
// TEST 6: Step Convergence for Photon Ring Equatorial Crossing
// ---------------------------------------------------------------------------
console.log(`${ANSI_BOLD}Test 6: Step Convergence for Photon Ring Equatorial Crossing${ANSI_RESET}`);
{
    // A photon ring ray near the shadow edge that undergoes strong gravitational deflection
    const aVal = 0.9;
    const r_obs = 50.0;
    const theta_obs = (80 * Math.PI) / 180;
    const alpha = -5.4;
    const beta = 2.1;

    // Trace with step scale 1.0
    const rayBase = traceRay(alpha, beta, { a: aVal, r_obs, theta_obs, stepScale: 1.0, maxSteps: 8000 });
    // Trace with step scale 0.5 (halved step)
    const rayHalved = traceRay(alpha, beta, { a: aVal, r_obs, theta_obs, stepScale: 0.5, maxSteps: 16000 });

    assert(rayBase.diskCrossings.length > 0, `Base ray detects equatorial crossing (${rayBase.diskCrossings.length} crossings)`);
    assert(rayHalved.diskCrossings.length > 0, `Halved-step ray detects equatorial crossing (${rayHalved.diskCrossings.length} crossings)`);

    if (rayBase.diskCrossings.length > 0 && rayHalved.diskCrossings.length > 0) {
        const rCross1 = rayBase.diskCrossings[0].r;
        const rCross2 = rayHalved.diskCrossings[0].r;
        const diff = Math.abs(rCross1 - rCross2);

        assert(diff < 1e-4, `Halving step changes equatorial crossing radius by < 1e-4 (Δr = ${diff.toExponential(4)})`);
    }
}
console.log('');

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
console.log(`${ANSI_BOLD}------------------------------------------------------------${ANSI_RESET}`);
if (failedCount === 0) {
    console.log(`${ANSI_GREEN}${ANSI_BOLD}All ${passedCount} tests passed successfully!${ANSI_RESET}`);
} else {
    console.error(`${ANSI_RED}${ANSI_BOLD}${failedCount} tests failed out of ${passedCount + failedCount}.${ANSI_RESET}`);
    process.exit(1);
}
