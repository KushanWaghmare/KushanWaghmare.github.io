/**
 * scratch/gen-zeros.js
 *
 * Computes the first 500 non-trivial zeros of the Riemann zeta function
 * on the critical line s = 1/2 + i*gamma by root-finding on the Riemann–Siegel
 * Z-function: bracketing sign changes on a uniform grid with step dt = 0.01,
 * then refining with Brent's method to < 1e-12 tolerance in double precision.
 *
 * Emits shared/lib/zeta-zeros.js formatted with 17 significant digits.
 */

"use strict";

const fs = require("fs");
const path = require("path");

function makeZ() {
    const bern = [
        1.0 / 12.0, -1.0 / 720.0, 1.0 / 30240.0, -1.0 / 1209600.0,
        1.0 / 47900160.0, -691.0 / 1307674368000.0, 1.0 / 74724249600.0,
        -3617.0 / 10670622842880000.0
    ];
    const maxN = 2000;
    const lns = new Float64Array(maxN + 1);
    const invSqrts = new Float64Array(maxN + 1);
    for (let n = 1; n <= maxN; n++) {
        lns[n] = Math.log(n);
        invSqrts[n] = 1.0 / Math.sqrt(n);
    }

    function theta(t) {
        if (t < 10.0) {
            let wre = 0.25, wim = 0.5 * t;
            let logProdRe = 0, logProdIm = 0;
            for (let k = 0; k < 8; k++) {
                const r = Math.hypot(wre, wim);
                const a = Math.atan2(wim, wre);
                logProdRe += Math.log(r);
                logProdIm += a;
                wre += 1.0;
            }
            const rw = Math.hypot(wre, wim);
            const aw = Math.atan2(wim, wre);
            const lnRw = Math.log(rw);
            let gamIm = (wre - 0.5) * aw + wim * lnRw - wim;
            const den = 12.0 * (wre * wre + wim * wim);
            gamIm -= (12.0 * wim) / den;
            return (gamIm - logProdIm) - 0.5 * t * Math.log(Math.PI);
        } else {
            const invT = 1.0 / t;
            const invT2 = invT * invT;
            let val = (t * 0.5) * Math.log(t / (2.0 * Math.PI)) - (t * 0.5) - (Math.PI / 8.0);
            val += (1.0 / 48.0) * invT;
            val += (7.0 / 5760.0) * invT * invT2;
            val += (31.0 / 80640.0) * invT * (invT2 * invT2);
            val += (127.0 / 4300800.0) * invT * (invT2 * invT2 * invT2);
            val += (511.0 / 121651200.0) * invT * (invT2 * invT2 * invT2 * invT2);
            return val;
        }
    }

    function Z(t) {
        const th = theta(t);
        const N = Math.min(maxN, Math.max(30, (t * 1.5 + 30) | 0));
        let sumRe = 0.0, sumIm = 0.0;
        for (let n = 1; n < N; n++) {
            const phase = t * lns[n];
            const c = Math.cos(phase), s = Math.sin(phase);
            const f = invSqrts[n];
            sumRe += f * c;
            sumIm -= f * s;
        }

        const phaseN = t * lns[N];
        const cN = Math.cos(phaseN), sN = Math.sin(phaseN);
        const fN = invSqrts[N];
        const nNegSRe = fN * cN;
        const nNegSIm = -fN * sN;
        sumRe += 0.5 * nNegSRe;
        sumIm += 0.5 * nNegSIm;

        const sqrtN = Math.sqrt(N);
        const n1sRe = sqrtN * cN;
        const n1sIm = -sqrtN * sN;
        const sDen = 0.25 + t * t;
        sumRe += (n1sRe * (-0.5) + n1sIm * t) / sDen;
        sumIm += (n1sIm * (-0.5) - n1sRe * t) / sDen;

        let termRe = 0.5, termIm = t;
        const invN2 = 1.0 / (N * N);
        let currNRe = nNegSRe / N, currNIm = nNegSIm / N;
        for (let k = 0; k < 6; k++) {
            const b = bern[k];
            const pRe = termRe * currNRe - termIm * currNIm;
            const pIm = termRe * currNIm + termIm * currNRe;
            sumRe += b * pRe;
            sumIm += b * pIm;

            const a1 = 2 * k + 1.5, a2 = 2 * k + 2.5;
            const mRe = a1 * a2 - t * t;
            const mIm = (a1 + a2) * t;
            const nextTermRe = termRe * mRe - termIm * mIm;
            const nextTermIm = termRe * mIm + termIm * mRe;
            termRe = nextTermRe;
            termIm = nextTermIm;
            currNRe *= invN2;
            currNIm *= invN2;
        }

        const cosTh = Math.cos(th), sinTh = Math.sin(th);
        return cosTh * sumRe - sinTh * sumIm;
    }
    return { theta, Z };
}

function brent(f, a, b, tol = 1e-13, maxIter = 60) {
    let fa = f(a), fb = f(b);
    if (fa * fb > 0) throw new Error("Root not bracketed");
    if (Math.abs(fa) < Math.abs(fb)) {
        let tmp = a; a = b; b = tmp;
        tmp = fa; fa = fb; fb = tmp;
    }
    let c = a, fc = fa, mflag = true, d = 0;
    for (let iter = 0; iter < maxIter; iter++) {
        if (Math.abs(fb) < 1e-15 || Math.abs(b - a) < tol) return b;
        let s;
        if (fa !== fc && fb !== fc) {
            s = (a * fb * fc) / ((fa - fb) * (fa - fc)) +
                (b * fa * fc) / ((fb - fa) * (fb - fc)) +
                (c * fa * fb) / ((fc - fa) * (fc - fb));
        } else {
            s = b - fb * (b - a) / (fb - fa);
        }

        const cond1 = !((s > Math.min((3 * a + b) / 4, b)) && (s < Math.max((3 * a + b) / 4, b)));
        const cond2 = mflag && Math.abs(s - b) >= Math.abs(b - c) / 2;
        const cond3 = !mflag && Math.abs(s - b) >= Math.abs(c - d) / 2;
        const cond4 = mflag && Math.abs(b - c) < tol;
        const cond5 = !mflag && Math.abs(c - d) < tol;

        if (cond1 || cond2 || cond3 || cond4 || cond5) {
            s = (a + b) / 2;
            mflag = true;
        } else {
            mflag = false;
        }

        const fs = f(s);
        d = c; c = b; fc = fb;
        if (fa * fs < 0) {
            b = s; fb = fs;
        } else {
            a = s; fa = fs;
        }
        if (Math.abs(fa) < Math.abs(fb)) {
            let tmp = a; a = b; b = tmp;
            tmp = fa; fa = fb; fb = tmp;
        }
    }
    return b;
}

const { Z } = makeZ();
const TARGET_ZEROS = 500;
const zeros = [];
console.log(`Scanning for first ${TARGET_ZEROS} zeros of Z(t)...`);
const t0 = performance.now();

let prevT = 9.0;
let prevZ = Z(prevT);
const dt = 0.01;

for (let t = 9.0 + dt; zeros.length < TARGET_ZEROS && t < 850.0; t += dt) {
    const curZ = Z(t);
    if (prevZ * curZ <= 0) {
        const root = brent(Z, prevT, t, 1e-13);
        zeros.push(root);
        if (zeros.length % 50 === 0) {
            console.log(`  Found zero ${zeros.length}: gamma_${zeros.length} = ${root.toFixed(12)} (t = ${t.toFixed(2)})`);
        }
    }
    prevT = t;
    prevZ = curZ;
}

const elapsedMs = performance.now() - t0;
console.log(`Scan complete: found ${zeros.length} zeros in ${(elapsedMs / 1000).toFixed(2)} s.`);

// Format output to shared/lib/zeta-zeros.js with 17 significant digits
const outputPath = path.join(__dirname, "../shared/lib/zeta-zeros.js");
const header = `/**
 * zeta-zeros.js
 *
 * First 500 non-trivial zeros (imaginary parts gamma_k) of the Riemann zeta function
 * on the critical line s = 1/2 + i*gamma_k, computed via Brent refinement on the
 * Riemann–Siegel Z(t) function to < 1e-12 tolerance.
 *
 * Formatted with 17 significant digits (full IEEE 754 float64 precision).
 * UMD module for browser and Node.js environments.
 */

(function (root, factory) {
    if (typeof module === "object" && module.exports) {
        module.exports = factory();
    } else {
        root.ZETA_ZEROS = factory();
        root.ZetaZeros = root.ZETA_ZEROS;
    }
}(typeof self !== "undefined" ? self : this, function () {
    "use strict";

    const ZETA_ZEROS = [
`;

const lines = [];
for (let i = 0; i < zeros.length; i++) {
    // 17 significant digits via toPrecision(17)
    const valStr = zeros[i].toPrecision(17);
    lines.push(`        ${valStr}${i < zeros.length - 1 ? "," : ""} // Zero ${i + 1}`);
}

const footer = `    ];

    return ZETA_ZEROS;
}));
`;

const fileContent = header + lines.join("\n") + "\n" + footer;
fs.writeFileSync(outputPath, fileContent, "utf8");
console.log(`Wrote ${zeros.length} zeros to ${outputPath}`);
