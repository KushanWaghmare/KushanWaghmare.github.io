"use strict";

/**
 * scratch/tests/mobius.test.js
 *
 * CPU Reference Test for Möbius Strip Geometry
 * Surface map:
 *   x(u, v) = ((R + v * cos(u / 2)) * cos(u),
 *              (R + v * cos(u / 2)) * sin(u),
 *              v * sin(u / 2))
 *   for u in [0, 2*pi], v in [-w, w].
 *
 * Requirements:
 *   1. Seam closure with flip: x(2*pi, v) = x(0, -v) to 1e-12.
 *   2. Non-orientability / holonomy: Unit normal vector on the centerline (v = 0)
 *      returns reversed after one full turn: N(2*pi) = -N(0) to 1e-12.
 */

const assert = require("assert");

const R = 2.0;
const W = 0.8;

function mobiusPoint(u, v) {
    const halfU = 0.5 * u;
    const rad = R + v * Math.cos(halfU);
    return [
        rad * Math.cos(u),
        rad * Math.sin(u),
        v * Math.sin(halfU)
    ];
}

function mobiusNormal(u, v) {
    // Analytic tangents:
    // dx/du = ( -rad * sin(u) - 0.5 * v * sin(halfU) * cos(u),
    //            rad * cos(u) - 0.5 * v * sin(halfU) * sin(u),
    //            0.5 * v * cos(halfU) )
    // dx/dv = ( cos(halfU) * cos(u), cos(halfU) * sin(u), sin(halfU) )
    const halfU = 0.5 * u;
    const rad = R + v * Math.cos(halfU);
    const cosU = Math.cos(u), sinU = Math.sin(u);
    const cosHalf = Math.cos(halfU), sinHalf = Math.sin(halfU);

    const xu = [
        -rad * sinU - 0.5 * v * sinHalf * cosU,
        rad * cosU - 0.5 * v * sinHalf * sinU,
        0.5 * v * cosHalf
    ];

    const xv = [
        cosHalf * cosU,
        cosHalf * sinU,
        sinHalf
    ];

    // Cross product: xu x xv
    const nx = xu[1] * xv[2] - xu[2] * xv[1];
    const ny = xu[2] * xv[0] - xu[0] * xv[2];
    const nz = xu[0] * xv[1] - xu[1] * xv[0];

    const len = Math.hypot(nx, ny, nz);
    return [nx / len, ny / len, nz / len];
}

// 1. Check x(2*pi, v) == x(0, -v) for diverse values of v in [-w, w]
const vSamples = [-W, -0.5 * W, -0.1, 0.0, 0.2, 0.5 * W, W];
let maxSeamErr = 0;

for (const v of vSamples) {
    const pEnd = mobiusPoint(2.0 * Math.PI, v);
    const pStartFlip = mobiusPoint(0.0, -v);
    const err = Math.hypot(pEnd[0] - pStartFlip[0], pEnd[1] - pStartFlip[1], pEnd[2] - pStartFlip[2]);
    if (err > maxSeamErr) maxSeamErr = err;
}

console.log(`[mobius] Max seam position error ||x(2*pi, v) - x(0, -v)||: ${maxSeamErr.toExponential(4)} (target < 1e-12)`);
assert(maxSeamErr < 1e-12, `Seam mismatch error ${maxSeamErr} >= 1e-12`);

// 2. Check centerline normal inversion: N(2*pi) == -N(0)
const n0 = mobiusNormal(0.0, 0.0);
const n2pi = mobiusNormal(2.0 * Math.PI, 0.0);

const normalRevErr = Math.hypot(n2pi[0] + n0[0], n2pi[1] + n0[1], n2pi[2] + n0[2]);
console.log(`[mobius] Centerline normal inversion error ||N(2*pi) + N(0)||: ${normalRevErr.toExponential(4)} (target < 1e-12)`);
assert(normalRevErr < 1e-12, `Normal inversion error ${normalRevErr} >= 1e-12`);

console.log("[mobius.test.js] ALL PASS");
