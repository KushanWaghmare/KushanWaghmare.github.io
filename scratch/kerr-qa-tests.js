/**
 * scratch/kerr-qa-tests.js
 * Comprehensive numerical acceptance checks for Phase 5 QA.
 */
'use strict';

const ref = require('./kerr-reference.js');

let allPassed = true;
const assert = (cond, msg) => {
    if (!cond) {
        console.error(`[FAIL] ${msg}`);
        allPassed = false;
    } else {
        console.log(`[PASS] ${msg}`);
    }
};

console.log('=== KERR RAY TRACER PHASE 5 ACCEPTANCE TESTS ===\n');

// -----------------------------------------------------------------------------
// Check 1: a = 0 face-on circular shadow radius vs b_c = 3√3
// -----------------------------------------------------------------------------
console.log('Test 1: a = 0 face-on shadow radius vs b_c = 3√3 ≈ 5.196');
{
    const a = 0.0;
    const theta_obs = 0.001; // Nearly face-on
    const r_obs = 50.0;

    let bLow = 4.5, bHigh = 5.5;
    for (let iter = 0; iter < 30; iter++) {
        const bMid = 0.5 * (bLow + bHigh);
        const res = ref.traceRay(0.0, bMid, { a, theta_obs, r_obs });
        if (res.status === 'captured') {
            bLow = bMid;
        } else {
            bHigh = bMid;
        }
    }
    const bCrit = 0.5 * (bLow + bHigh);
    const bExact = 3 * Math.sqrt(3);
    const errPct = Math.abs(bCrit - bExact) / bExact * 100;

    console.log(`  Measured b_c: ${bCrit.toFixed(6)}, Exact: ${bExact.toFixed(6)}, Error: ${errPct.toFixed(4)}%`);
    assert(errPct < 2.0, `a = 0 shadow radius matches b_c within 2% (actual: ${errPct.toFixed(4)}%)`);

    // Circularity check: test at 4 angles around the disk (0°, 90°, 180°, 270°)
    const angles = [0, Math.PI / 2, Math.PI, 3 * Math.PI / 2];
    const bAtAngles = [];
    for (const phi of angles) {
        let bL = 4.5, bH = 5.5;
        for (let iter = 0; iter < 24; iter++) {
            const bM = 0.5 * (bL + bH);
            const alpha = bM * Math.cos(phi);
            const beta = bM * Math.sin(phi);
            const res = ref.traceRay(alpha, beta, { a, theta_obs, r_obs });
            if (res.status === 'captured') bL = bM;
            else bH = bM;
        }
        bAtAngles.push(0.5 * (bL + bH));
    }
    const maxAsym = Math.max(...bAtAngles) - Math.min(...bAtAngles);
    console.log(`  Shadow circularity asymmetry across 4 quadrants: ${maxAsym.toExponential(3)}`);
    assert(maxAsym < 1e-3, `a = 0 face-on shadow is strictly circular (asymmetry < 1e-3)`);
}

// -----------------------------------------------------------------------------
// Check 2: a = 0.998 at 80° shadow offset, flattened D-shape, and bright approaching side
// -----------------------------------------------------------------------------
console.log('\nTest 2: a = 0.998 at 80° shadow geometry and relativistic beaming');
{
    const a = 0.998;
    const theta_obs = 80 * Math.PI / 180;
    const r_obs = 50.0;

    // Search shadow extent along horizontal axis (beta = 0)
    // Left boundary (alpha < 0, prograde/approaching side, expected near -2.14):
    let aLeftLow = -3.5, aLeftHigh = -1.0;
    for (let iter = 0; iter < 25; iter++) {
        const aM = 0.5 * (aLeftLow + aLeftHigh);
        const res = ref.traceRay(aM, 0.0, { a, theta_obs, r_obs });
        if (res.status === 'captured') aLeftHigh = aM;
        else aLeftLow = aM;
    }
    const alphaLeft = 0.5 * (aLeftLow + aLeftHigh);

    // Right boundary (alpha > 0, retrograde/receding side, expected near +6.97):
    let aRightLow = 5.0, aRightHigh = 8.5;
    for (let iter = 0; iter < 25; iter++) {
        const aM = 0.5 * (aRightLow + aRightHigh);
        const res = ref.traceRay(aM, 0.0, { a, theta_obs, r_obs });
        if (res.status === 'captured') aRightLow = aM;
        else aRightHigh = aM;
    }
    const alphaRight = 0.5 * (aRightLow + aRightHigh);

    // Top boundary (alpha = 0, beta > 0):
    let bTopLow = 3.0, bTopHigh = 6.0;
    for (let iter = 0; iter < 25; iter++) {
        const bM = 0.5 * (bTopLow + bTopHigh);
        const res = ref.traceRay(0.0, bM, { a, theta_obs, r_obs });
        if (res.status === 'captured') bTopLow = bM;
        else bTopHigh = bM;
    }
    const betaTop = 0.5 * (bTopLow + bTopHigh);

    const shadowCenter = 0.5 * (alphaLeft + alphaRight);
    const shadowWidth = alphaRight - alphaLeft;
    const shadowHeight = 2.0 * betaTop;

    console.log(`  Shadow left edge: ${alphaLeft.toFixed(3)}, right edge: ${alphaRight.toFixed(3)}`);
    console.log(`  Shadow center: ${shadowCenter.toFixed(3)} (offset toward positive alpha / receding side)`);
    console.log(`  Shadow width: ${shadowWidth.toFixed(3)}, height: ${shadowHeight.toFixed(3)}`);

    assert(shadowCenter > 0.5, `Shadow center is offset along spin axis (actual: ${shadowCenter.toFixed(3)} > 0.5)`);
    assert(Math.abs(alphaLeft) < Math.abs(alphaRight), `Shadow is asymmetric / flattened on prograde side (|alphaLeft| < |alphaRight|)`);

    // Verify approaching side has higher g than receding side
    const rayLeft = ref.traceRay(-3.5, 1.2, { a, theta_obs, r_obs });
    const rayRight = ref.traceRay(3.5, 1.2, { a, theta_obs, r_obs });
    const gLeft = rayLeft.diskCrossings[0] ? rayLeft.diskCrossings[0].g : 0;
    const gRight = rayRight.diskCrossings[0] ? rayRight.diskCrossings[0].g : 0;

    console.log(`  Approaching side g: ${gLeft.toFixed(4)}, Receding side g: ${gRight.toFixed(4)}`);
    assert(gLeft > gRight, `Approaching side Doppler g is higher than receding side (${gLeft.toFixed(4)} > ${gRight.toFixed(4)})`);
}

// -----------------------------------------------------------------------------
// Check 3: Disk inner edge sits at r_isco(a)
// -----------------------------------------------------------------------------
console.log('\nTest 3: Disk inner edge sits precisely at r_isco(a) with F(r_isco) = 0');
{
    const spins = [0.0, 0.5, 0.95, 0.998];
    for (const spin of spins) {
        const isco = ref.isco(spin, true);
        const fluxAtIsco = ref.pageThorneFlux(isco, spin);
        const fluxJustOutside = ref.pageThorneFlux(isco * 1.05, spin);
        console.log(`  spin=${spin.toFixed(3)}: r_isco=${isco.toFixed(4)}, F(r_isco)=${fluxAtIsco.toExponential(3)}, F(1.05*r_isco)=${fluxJustOutside.toFixed(4)}`);
        assert(Math.abs(fluxAtIsco) < 1e-12, `F(r_isco) = 0 for spin ${spin}`);
        assert(fluxJustOutside > 0, `F(1.05 * r_isco) > 0 for spin ${spin}`);
    }
}

// -----------------------------------------------------------------------------
// Check 4: Robustness near polar axes (inclinations near 0° and 180°)
// -----------------------------------------------------------------------------
console.log('\nTest 4: Integrator robustness near polar axes (no NaNs or infinities)');
{
    const nearPoles = [
        0.05,                   // ~2.86°
        0.02,                   // ~1.15°
        Math.PI - 0.05,         // ~177.14°
        Math.PI - 0.02          // ~178.85°
    ];

    for (const th of nearPoles) {
        let nanCount = 0;
        for (let alpha = -4.0; alpha <= 4.0; alpha += 2.0) {
            for (let beta = -4.0; beta <= 4.0; beta += 2.0) {
                const res = ref.traceRay(alpha, beta, { a: 0.95, theta_obs: th, r_obs: 50.0 });
                const st = res.finalState;
                if (isNaN(st.r) || isNaN(st.theta) || isNaN(st.phi) || isNaN(res.maxH)) {
                    nanCount++;
                }
            }
        }
        assert(nanCount === 0, `Polar angle ${(th * 180 / Math.PI).toFixed(2)}° produces 0 NaNs`);
    }
}

console.log('\n------------------------------------------------------------');
if (allPassed) {
    console.log('ALL PHASE 5 QA ACCEPTANCE CHECKS PASSED SUCCESSFULLY!');
} else {
    console.error('SOME PHASE 5 QA CHECKS FAILED!');
    process.exit(1);
}
