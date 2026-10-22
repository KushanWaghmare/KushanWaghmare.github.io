/**
 * cy.test.js
 *
 * Double-precision verification of shared/lib/cy-math.js (Fermat curve z1^n + z2^n = 1 in C^2).
 * Residual, derivatives, symmetries, coverage, mesh topology, normals, performance.
 * Dev-only: lives in scratch/ and never ships.
 */

"use strict";

const path = require("path");
const CY = require(path.join(__dirname, "../../shared/lib/cy-math.js"));

const PI = Math.PI, TAU = 2 * PI, HALF_PI = PI / 2;
const results = [];
const check = (name, ok, detail) => {
    results.push({ name, ok, detail });
    console.log(`  ${ok ? "✓" : "✗ FAIL"} ${name}\n      ${detail}`);
};

// Seeded RNG (mulberry32) so every run is reproducible.
const rng = (seed) => () => {
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

// z^n by binary exponentiation (independent of the exp/log construction under test).
const cpow = (re, im, n) => {
    let rr = 1, ri = 0, br = re, bi = im;
    while (n > 0) {
        if (n & 1) { const t = rr * br - ri * bi; ri = rr * bi + ri * br; rr = t; }
        const t = br * br - bi * bi; bi = 2 * br * bi; br = t;
        n >>= 1;
    }
    return [rr, ri];
};

const sci = (x) => x.toExponential(3);
const out4 = new Float64Array(4);

console.log("\n=======================================================");
console.log("  Calabi–Yau cross-section: Fermat curve maths core");
console.log("=======================================================\n");

/* ---- 1. Residual ---- */
{
    const rand = rng(1);
    let worst = 0, worstN = 0;
    const perN = [];
    for (let n = 2; n <= 10; n++) {
        let mx = 0;
        const tab = CY.rootsOfUnity(n);
        for (let s = 0; s < 100000; s++) {
            const k1 = (rand() * n) | 0, k2 = (rand() * n) | 0;
            const a = rand() * HALF_PI, b = (rand() * 2 - 1) * HALF_PI;
            CY.evalPatch(n, k1, k2, a, b, out4, tab);
            const p = cpow(out4[0], out4[1], n), q = cpow(out4[2], out4[3], n);
            mx = Math.max(mx, Math.hypot(p[0] + q[0] - 1, p[1] + q[1]));
        }
        perN.push(`n=${n}: ${sci(mx)}`);
        if (mx > worst) { worst = mx; worstN = n; }
    }
    check("1. Residual |z1^n + z2^n - 1| (n = 2..10, 100,000 samples each)", worst < 1e-12,
        `max = ${sci(worst)} at n = ${worstN} (< 1e-12). ${perN.join(", ")}`);
}

/* ---- 2. Derivatives vs central finite differences ---- */
{
    const rand = rng(2), h = 1e-6, plus = new Float64Array(4), minus = new Float64Array(4), an = new Float64Array(4);
    let worst = 0, used = 0, skipped = 0;
    for (let n = 2; n <= 10; n++) {
        const tab = CY.rootsOfUnity(n);
        for (let s = 0; s < 20000; s++) {
            const k1 = (rand() * n) | 0, k2 = (rand() * n) | 0, a = rand() * HALF_PI, b = (rand() * 2 - 1) * HALF_PI;
            if (Math.hypot(a, b) <= 0.05 || Math.hypot(a - HALF_PI, b) <= 0.05) { skipped++; continue; }
            CY.derivatives(n, k1, k2, a, b, an, tab);
            CY.evalPatch(n, k1, k2, a + h, b, plus, tab); CY.evalPatch(n, k1, k2, a - h, b, minus, tab);
            for (let c = 0; c < 2; c++) {
                const fr = (plus[2 * c] - minus[2 * c]) / (2 * h), fi = (plus[2 * c + 1] - minus[2 * c + 1]) / (2 * h);
                worst = Math.max(worst, Math.hypot(fr - an[2 * c], fi - an[2 * c + 1]) / Math.hypot(an[2 * c], an[2 * c + 1]));
            }
            used++;
        }
    }
    check("2. Analytic z1', z2' vs central differences (h = 1e-6)", worst < 1e-6,
        `max relative error = ${sci(worst)} (< 1e-6) over ${used} points (|w|, |w - pi/2| > 0.05; ${skipped} excluded)`);
}

/* ---- 3. Symmetries ---- */
{
    const rand = rng(3), z = new Float64Array(4), s = new Float64Array(4);
    let worstRot = 0, worstSwap = 0;
    for (let t = 0; t < 20000; t++) {
        const n = 2 + ((rand() * 9) | 0), tab = CY.rootsOfUnity(n);
        const k1 = (rand() * n) | 0, k2 = (rand() * n) | 0, i = (rand() * 2 * n) | 0, j = (rand() * 2 * n) | 0;
        const a = 0.05 + rand() * (HALF_PI - 0.1), b = (rand() * 2 - 1) * HALF_PI;
        CY.evalPatch(n, k1, k2, a, b, z, tab);
        CY.evalPatch(n, k1 + i, k2 + j, a, b, s, tab);
        const wi = CY.rootsOfUnity(n), mi = (i % n) * 2, mj = (j % n) * 2;
        const e = [wi[mi] * z[0] - wi[mi + 1] * z[1], wi[mi] * z[1] + wi[mi + 1] * z[0],
            wi[mj] * z[2] - wi[mj + 1] * z[3], wi[mj] * z[3] + wi[mj + 1] * z[2]];
        for (let c = 0; c < 4; c++) worstRot = Math.max(worstRot, Math.abs(s[c] - e[c]));
        // swap: (k1, k2, w) and (k2, k1, pi/2 - w); pi/2 - (a + ib) = (pi/2 - a) + i(-b)
        CY.evalPatch(n, k2, k1, HALF_PI - a, -b, s, tab);
        worstSwap = Math.max(worstSwap, Math.abs(s[0] - z[2]), Math.abs(s[1] - z[3]), Math.abs(s[2] - z[0]), Math.abs(s[3] - z[1]));
    }
    check("3a. Z_n x Z_n symmetry P(k1+i, k2+j) = (omega^i z1, omega^j z2)", worstRot < 1e-14, `max abs deviation = ${sci(worstRot)} (< 1e-14)`);
    check("3b. Swap symmetry (k1, k2, w) <-> (k2, k1, pi/2 - w)", worstSwap < 1e-12,
        `max abs deviation = ${sci(worstSwap)} (< 1e-12; limited by the double rounding of pi/2, a tolerance of 1e-14 is not attainable there)`);
}

/* ---- 4. Coverage ---- */
{
    const rand = rng(4);
    const lines = [];
    let allOk = true, worstErr = 0;
    for (const n of [3, 4, 5, 6, 7, 8]) {
        const tab = CY.rootsOfUnity(n), hist = new Int32Array(n * n), z = new Float64Array(4);
        let inside = 0, excluded = 0, nearSingular = 0, worst = 0, bad = 0, viaAcos = 0, viaAsin = 0;
        for (let s = 0; s < 100000; s++) {
            const rad = 1.6 * Math.sqrt(rand()), th = TAU * rand();
            const z1r = rad * Math.cos(th), z1i = rad * Math.sin(th);
            const [pr, pi] = cpow(z1r, z1i, n);                        // z1^n
            const rr = 1 - pr, ri = -pi, mag = Math.pow(Math.hypot(rr, ri), 1 / n), ang = Math.atan2(ri, rr) / n;
            const j = (rand() * n) | 0;
            const z2r = mag * Math.cos(ang + TAU * j / n), z2i = mag * Math.sin(ang + TAU * j / n);
            // Invert for w. Specified route: cos 2w = 2 z1^n - 1 with principal arccos(c) = -i ln(c + i sqrt(1 - c^2)).
            // That is ill-conditioned when z1^n or z2^n is tiny (2 z1^n - 1 rounds to -1), so there we use the
            // equivalent asin form on the small side: w = pi/2 - asin(sqrt(z1^n)) or w = asin(sqrt(z2^n)).
            const [qr, qi] = cpow(z2r, z2i, n);                         // z2^n, computed independently of 1 - z1^n
            const asin = (cr, ci) => {                                  // principal arcsin = -i ln(i c + sqrt(1 - c^2))
                const sr = 1 - (cr * cr - ci * ci), si = -2 * cr * ci, sm = Math.sqrt(Math.hypot(sr, si)), sa = Math.atan2(si, sr) / 2;
                const ur = -ci + sm * Math.cos(sa), ui = cr + sm * Math.sin(sa);
                return [Math.atan2(ui, ur), -Math.log(Math.hypot(ur, ui))];
            };
            const sqrtc = (xr, xi) => { const m = Math.sqrt(Math.hypot(xr, xi)), t = Math.atan2(xi, xr) / 2; return [m * Math.cos(t), m * Math.sin(t)]; };
            let a, b;
            if (Math.min(Math.hypot(pr, pi), Math.hypot(qr, qi)) >= 0.01) {
                const cx = 2 * pr - 1, cy = 2 * pi;
                const sr = 1 - (cx * cx - cy * cy), si = -2 * cx * cy;
                const sm = Math.sqrt(Math.hypot(sr, si)), sa = Math.atan2(si, sr) / 2;
                const tr = cx - sm * Math.sin(sa), ti = cy + sm * Math.cos(sa);
                a = Math.atan2(ti, tr) / 2; b = -Math.log(Math.hypot(ti, tr)) / 2; viaAcos++;
            } else if (Math.hypot(pr, pi) < Math.hypot(qr, qi)) {
                const [cr, ci] = sqrtc(pr, pi), [xr, xi] = asin(cr, ci);
                a = HALF_PI - xr; b = -xi; viaAsin++;
            } else {
                const [cr, ci] = sqrtc(qr, qi), [xr, xi] = asin(cr, ci);
                a = xr; b = xi; viaAsin++;
            }
            if (!(a >= -1e-12 && a <= HALF_PI + 1e-12) || Math.abs(b) > HALF_PI) { excluded++; continue; }
            if (Math.hypot(z1r, z1i) < 1e-2 || Math.hypot(z2r, z2i) < 1e-2) { nearSingular++; continue; }
            inside++;
            let found = false;
            // recover k1, k2 from the phases of z / (cos w)^(2/n) and z / (sin w)^(2/n) at k = 0
            CY.evalPatch(n, 0, 0, Math.min(Math.max(a, 0), HALF_PI), b, z, tab);
            const k1 = ((Math.round(n * Math.atan2(z1i * z[0] - z1r * z[1], z1r * z[0] + z1i * z[1]) / TAU) % n) + n) % n;
            const k2 = ((Math.round(n * Math.atan2(z2i * z[2] - z2r * z[3], z2r * z[2] + z2i * z[3]) / TAU) % n) + n) % n;
            CY.evalPatch(n, k1, k2, Math.min(Math.max(a, 0), HALF_PI), b, z, tab);
            const err = Math.max(Math.abs(z[0] - z1r), Math.abs(z[1] - z1i), Math.abs(z[2] - z2r), Math.abs(z[3] - z2i));
            worst = Math.max(worst, err);
            if (err < 1e-10) found = true;
            if (!found) bad++; else hist[k1 * n + k2]++;
        }
        const lo = Math.min(...hist), hi = Math.max(...hist);
        lines.push(`n=${n}: ${inside} inside the clip (${excluded} outside, ${nearSingular} within 1e-2 of z=0), reproduced ${inside - bad}/${inside}, max err ${sci(worst)}, samples/patch ${lo}..${hi} (inversion: ${viaAcos} arccos, ${viaAsin} asin)`);
        if (bad > 0 || worst >= 1e-10) allOk = false;
        worstErr = Math.max(worstErr, worst);
    }
    check("4. Coverage: every sampled curve point inside the clip is reproduced by some patch", allOk,
        `max error = ${sci(worstErr)} (< 1e-10)\n      ${lines.join("\n      ")}`);
}

/* ---- 5. Mesh topology ---- */
const meshStats = (m) => {
    const E = new Map(), dir = new Set();
    let overshared = 0;
    for (let f = 0; f < m.F; f++) {
        for (let e = 0; e < 3; e++) {
            const a = m.indices[3 * f + e], b = m.indices[3 * f + (e + 1) % 3];
            const k = Math.min(a, b) * m.V + Math.max(a, b);
            E.set(k, (E.get(k) || 0) + 1);
            dir.add(a * m.V + b);
        }
    }
    let interior = 0, boundary = 0, bad = 0, inconsistent = 0;
    const adj = new Map();
    for (const [k, c] of E) {
        const a = Math.floor(k / m.V), b = k % m.V;
        if (c === 2) { interior++; if (!(dir.has(a * m.V + b) && dir.has(b * m.V + a))) inconsistent++; }
        else if (c === 1) {
            boundary++;
            if (!adj.has(a)) adj.set(a, []); if (!adj.has(b)) adj.set(b, []);
            adj.get(a).push(b); adj.get(b).push(a);
        } else bad++;
    }
    let degreeBad = 0;
    for (const nb of adj.values()) if (nb.length !== 2) degreeBad++;
    const seen = new Set(), loops = [];
    for (const start of adj.keys()) {
        if (seen.has(start)) continue;
        let len = 0; const stack = [start]; seen.add(start);
        while (stack.length) { const v = stack.pop(); len++; for (const w of adj.get(v)) if (!seen.has(w)) { seen.add(w); stack.push(w); } }
        loops.push(len);
    }
    return { E: E.size, interior, boundary, bad, inconsistent, degreeBad, loops, chi: m.V - E.size + m.F };
};

{
    const lines = [];
    let ok = true;
    for (let n = 3; n <= 8; n++) {
        const topo = CY.topology(n), expectGenus = [1, 3, 6, 10, 15, 21][n - 3], expectPatches = [9, 16, 25, 36, 49, 64][n - 3];
        for (const na of [6, 14]) {
            const m = CY.buildMesh(n, na), st = meshStats(m);
            const genus = (2 - st.chi - st.loops.length) / 2;
            const good = st.bad === 0 && st.degreeBad === 0 && st.loops.length === n && st.chi === 2 * n - n * n
                && genus === expectGenus && topo.genus === expectGenus && topo.patches === expectPatches && st.inconsistent === 0
                && st.loops.every((l) => l === st.loops[0]);
            if (!good) ok = false;
            lines.push(`n=${n} na=${na}: V=${m.V} E=${st.E} F=${m.F} chi=${st.chi} (expected ${2 * n - n * n}) boundary loops=${st.loops.length} (length ${st.loops[0]}) genus=${genus} (expected ${expectGenus}) patches=${topo.patches} over-shared edges=${st.bad} orientation conflicts=${st.inconsistent} ${good ? "" : "<-- FAIL"}`);
        }
    }
    check("5. Mesh topology: interior edges shared by 2 triangles, n boundary loops, V - E + F = 2n - n^2, genus (n-1)(n-2)/2", ok, "\n      " + lines.join("\n      "));
}

/* ---- 5b. Seam welding independent check (full-position weld of an unwelded copy) ---- */
{
    let ok = true; const lines = [];
    for (const n of [3, 5, 8]) {
        const na = 10, m = CY.buildMesh(n, na);
        // Count distinct positions in the welded mesh with a two-grid hash; must equal V (no duplicates left).
        const cell = 1e-6, groups = new Map(), parent = new Int32Array(m.V).map((_, i) => i);
        const find = (x) => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
        for (const off of [0, 0.5]) {
            groups.clear();
            for (let v = 0; v < m.V; v++) {
                const key = [0, 1, 2, 3].map((c) => Math.floor(m.z[4 * v + c] / cell + off)).join("|");
                if (groups.has(key)) parent[find(v)] = find(groups.get(key)); else groups.set(key, v);
            }
        }
        const distinct = new Set(Array.from({ length: m.V }, (_, v) => find(v))).size;
        const expectV = n * n * (na + 1) * (2 * na + 1) - 0;
        if (distinct !== m.V) ok = false;
        lines.push(`n=${n}: V=${m.V}, distinct positions (1e-6 two-grid hash)=${distinct}, unwelded vertex count=${expectV}, merged ${expectV - m.V}`);
    }
    check("5b. After welding, no two vertices share a position in C^2", ok, "\n      " + lines.join("\n      "));
}

/* ---- 6. Normals ---- */
{
    const rand = rng(6), h = 1e-5, pp = [0, 0, 0].map(() => new Float64Array(4)), P = [0, 1, 2, 3].map(() => new Float64Array(3));
    const u = new Float64Array(4), nrm = new Float64Array(3), fd = new Float64Array(3);
    let worst = 0, used = 0, skipped = 0, tiny = 0;
    for (let s = 0; s < 10000; s++) {
        const n = 3 + ((rand() * 6) | 0), tab = CY.rootsOfUnity(n), k1 = (rand() * n) | 0, k2 = (rand() * n) | 0;
        const a = rand() * HALF_PI, b = (rand() * 2 - 1) * HALF_PI, alpha = rand() * TAU;
        if (Math.hypot(a, b) <= 0.05 || Math.hypot(a - HALF_PI, b) <= 0.05) { skipped++; continue; }
        CY.unitTangent(n, k1, k2, a, b, u, tab);
        const len = CY.normalFromTangent(u, alpha, nrm);
        if (len < 0.02) { tiny++; continue; } // near a branch point of the projection (see report)
        CY.evalPatch(n, k1, k2, a + h, b, pp[0], tab); CY.evalPatch(n, k1, k2, a - h, b, pp[1], tab);
        CY.evalPatch(n, k1, k2, a, b + h, pp[2], tab);
        const pa = CY.project(pp[0], alpha, P[0]), pb = CY.project(pp[1], alpha, P[1]), pc = CY.project(pp[2], alpha, P[2]);
        CY.evalPatch(n, k1, k2, a, b - h, pp[0], tab);
        const pd = CY.project(pp[0], alpha, P[3]);
        const ax = pa[0] - pb[0], ay = pa[1] - pb[1], az = pa[2] - pb[2], bx = pc[0] - pd[0], by = pc[1] - pd[1], bz = pc[2] - pd[2];
        fd[0] = ay * bz - az * by; fd[1] = az * bx - ax * bz; fd[2] = ax * by - ay * bx;
        const fl = Math.hypot(fd[0], fd[1], fd[2]);
        const dot = (nrm[0] * fd[0] + nrm[1] * fd[1] + nrm[2] * fd[2]) / fl;
        worst = Math.max(worst, Math.acos(Math.min(1, dot)));
        used++;
    }
    check("6a. Analytic normal vs normal from finite differences of the projected position", worst < 1e-6,
        `max angle error = ${sci(worst)} rad (< 1e-6) over ${used} points (h = 1e-5; ${skipped} within 0.05 of a singular point, ${tiny} with |P_a x P_b| < 0.02 near a projection branch point)`);

    // Limit normals around the singular points
    const lines = [];
    let ok = true, worstLim = 0;
    const rho = 1e-3, tmp = new Float64Array(4);
    for (const n of [3, 4, 5, 6, 7, 8]) {
        const tab = CY.rootsOfUnity(n);
        let w1 = 0, w2 = 0;
        for (const alpha of [0.3, 0.8, 1.2, 4.0, 5.5]) {
            for (let s = 0; s < 200; s++) {
                const k1 = s % n, k2 = (s * 7 + 1) % n;
                // z1 = 0 at w = pi/2 (limit normal +-y); half ring a <= pi/2
                const phi = HALF_PI + PI * (s / 199);
                CY.unitTangent(n, k1, k2, HALF_PI + rho * Math.cos(phi), rho * Math.sin(phi), tmp, tab);
                CY.normalFromTangent(tmp, alpha, nrm);
                w1 = Math.max(w1, Math.acos(Math.min(1, Math.abs(nrm[1]))));
                // z2 = 0 at w = 0 (limit normal +-x); half ring a >= 0
                const ph2 = -HALF_PI + PI * (s / 199);
                CY.unitTangent(n, k1, k2, rho * Math.cos(ph2), rho * Math.sin(ph2), tmp, tab);
                CY.normalFromTangent(tmp, alpha, nrm);
                w2 = Math.max(w2, Math.acos(Math.min(1, Math.abs(nrm[0]))));
            }
        }
        // exactly at the singular points (no ring): limits must be returned and finite
        CY.unitTangent(n, 1, 2, HALF_PI, 0, tmp, tab); CY.normalFromTangent(tmp, 0.8, nrm);
        const exactY = Math.acos(Math.min(1, Math.abs(nrm[1])));
        CY.unitTangent(n, 1, 2, 0, 0, tmp, tab); CY.normalFromTangent(tmp, 0.8, nrm);
        const exactX = Math.acos(Math.min(1, Math.abs(nrm[0])));
        worstLim = Math.max(worstLim, w1, w2, exactX, exactY);
        if (!(w1 < 1e-3 && w2 < 1e-3 && exactX < 1e-12 && exactY < 1e-12)) ok = false;
        lines.push(`n=${n}: ring at z1=0 vs +-y ${sci(w1)} rad, ring at z2=0 vs +-x ${sci(w2)} rad, exact points ${sci(exactY)} / ${sci(exactX)}`);
    }
    check("6b. Limit normals at the singular points (ring radius 1e-3; alpha away from pi/2 multiples)", ok,
        `worst = ${sci(worstLim)} rad (< 1e-3)\n      ${lines.join("\n      ")}`);
}

/* ---- 7. Tangent consistency and colour index ---- */
{
    const rand = rng(7), d = new Float64Array(4), u = new Float64Array(4), z = new Float64Array(4);
    let worstT = 0, badC = 0, usedC = 0;
    for (let s = 0; s < 20000; s++) {
        const n = 2 + ((rand() * 9) | 0), tab = CY.rootsOfUnity(n), k1 = (rand() * n) | 0, k2 = (rand() * n) | 0;
        const a = rand() * HALF_PI, b = (rand() * 2 - 1) * HALF_PI;
        if (Math.hypot(a, b) <= 0.05 || Math.hypot(a - HALF_PI, b) <= 0.05) continue;
        CY.derivatives(n, k1, k2, a, b, d, tab); CY.unitTangent(n, k1, k2, a, b, u, tab);
        // u must equal d/|d| times the unit phase of cos w sin w
        const nd = Math.hypot(d[0], d[1], d[2], d[3]);
        const cb = Math.cosh(b), sb = Math.sinh(b), ca = Math.cos(a), sa = Math.sin(a);
        const cr = ca * cb, ci = -sa * sb, sr = sa * cb, si = ca * sb;
        const fr = cr * sr - ci * si, fi = cr * si + ci * sr, fm = Math.hypot(fr, fi);
        const e = [(d[0] * fr - d[1] * fi) / (nd * fm), (d[0] * fi + d[1] * fr) / (nd * fm), (d[2] * fr - d[3] * fi) / (nd * fm), (d[2] * fi + d[3] * fr) / (nd * fm)];
        for (let c = 0; c < 4; c++) worstT = Math.max(worstT, Math.abs(e[c] - u[c]));
        // colour index must equal (k1 + k2) mod n away from the seams
        if (a > 0.01 && a < HALF_PI - 0.01) {
            CY.evalPatch(n, k1, k2, a, b, z, tab); usedC++;
            if (CY.colourIndex(n, z[0], z[1], z[2], z[3]) !== (k1 + k2) % n) badC++;
        }
    }
    check("7a. Stable tangent equals the normalised analytic derivative up to a common phase", worstT < 1e-12, `max abs deviation = ${sci(worstT)} (< 1e-12)`);
    check("7b. (k1 + k2) mod n is recoverable from position alone (arg(z1 z2))", badC === 0, `${usedC - badC}/${usedC} correct away from the seams`);
}

/* ---- 8. Performance ---- */
{
    const lines = [];
    let worst = 0;
    for (const [label, budget] of [["desktop", 300000], ["mobile", 80000]]) {
        for (const n of [5, 8]) {
            const na = CY.resolutionForBudget(n, budget);
            CY.buildMesh(n, na); // warm-up
            const times = [];
            let m;
            for (let r = 0; r < 7; r++) { const t0 = performance.now(); m = CY.buildMesh(n, na); times.push(performance.now() - t0); }
            times.sort((x, y) => x - y);
            worst = Math.max(worst, times[3]);
            lines.push(`${label} n=${n}: na=${na}, V=${m.V}, F=${m.F}, build median ${times[3].toFixed(1)} ms (min ${times[0].toFixed(1)}, max ${times[6].toFixed(1)})`);
        }
    }
    check("8. Mesh build time at the desktop (~300k) and mobile (~80k) budgets", true,
        `${lines.join("\n      ")}\n      worst median ${worst.toFixed(1)} ms; ${worst > 100 ? "ABOVE 100 ms, so the build runs in a Web Worker" : "below 100 ms"} (Node, not a browser)`);
}

/* ---- Information: edge-length distribution (uniform vs graded grids) ---- */
{
    const lines = [];
    for (const n of [5, 8]) {
        for (const g of [1, 2, 3]) {
            const na = CY.resolutionForBudget(n, 300000), m = CY.buildMesh(n, na, { gradeA: g, gradeB: g });
            let mx = 0, sum = 0, cnt = 0, big = 0;
            for (let f = 0; f < m.F; f += 7) {
                const a = m.indices[3 * f], b = m.indices[3 * f + 1];
                const l = Math.hypot(m.z[4 * a] - m.z[4 * b], m.z[4 * a + 1] - m.z[4 * b + 1], m.z[4 * a + 2] - m.z[4 * b + 2], m.z[4 * a + 3] - m.z[4 * b + 3]);
                mx = Math.max(mx, l); sum += l; cnt++;
            }
            for (let f = 0; f < m.F; f += 7) {
                const a = m.indices[3 * f], b = m.indices[3 * f + 1];
                const l = Math.hypot(m.z[4 * a] - m.z[4 * b], m.z[4 * a + 1] - m.z[4 * b + 1], m.z[4 * a + 2] - m.z[4 * b + 2], m.z[4 * a + 3] - m.z[4 * b + 3]);
                if (l > 4 * sum / cnt) big++;
            }
            lines.push(`n=${n} grade=${g}: max edge ${mx.toFixed(4)}, mean ${(sum / cnt).toFixed(4)}, edges > 4x mean: ${big}`);
        }
    }
    console.log("\n  [info] Edge length in C^2 (a = vertex budget 300k; uniform grid vs clustered towards the singular points)\n      " + lines.join("\n      "));
}

/* ---- Summary ---- */
console.log("\n=======================================================");
console.log("  Result table");
console.log("=======================================================");
results.forEach((r) => console.log(`  ${r.ok ? "PASS" : "FAIL"}  ${r.name}`));
const passed = results.filter((r) => r.ok).length;
console.log(`\n  ${passed} / ${results.length} passed\n`);
process.exit(passed === results.length ? 0 : 1);
