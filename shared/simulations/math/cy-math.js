/**
 * cy-math.js
 *
 * Mathematical core for the Calabi–Yau cross-section scene (Fermat curve z1^n + z2^n = 1 in C^2):
 *   - Patch evaluation z1 = w^k1 (cos w)^(2/n), z2 = w^k2 (sin w)^(2/n) on principal branches,
 *     where w = a + ib and the phase factor is the n-th root of unity omega^k.
 *   - Analytic holomorphic derivatives, the jointly normalised tangent (stable at z1 = 0, z2 = 0),
 *     the 4-D to 3-D projection with angle alpha, and the surface normal.
 *   - Welded triangle meshes for all n^2 patches (seams welded by position in C^2).
 *   - Topology bookkeeping (genus, Euler characteristic, patch count).
 *
 * UMD module for browser (window.CYMath) and Node.js (CommonJS).
 * No runtime dependencies; every calculation runs in IEEE 754 double precision.
 */

(function (root, factory) {
    if (typeof module === "object" && module.exports) {
        module.exports = factory();
    } else {
        root.CYMath = factory();
    }
}(typeof self !== "undefined" ? self : this, function () {
    "use strict";

    const HALF_PI = Math.PI / 2, TAU = Math.PI * 2, B_MAX = HALF_PI;
    const WELD_TOL = 1e-9, WELD_CELL = 1e-7;

    /* =========================================================================
     * 1. Topology
     * ========================================================================= */

    /** Genus, Euler characteristics and patch count for the degree-n Fermat curve. */
    const topology = (n) => ({
        n, patches: n * n, genus: (n - 1) * (n - 2) / 2,
        chiCompleted: 3 * n - n * n, chiDrawn: 2 * n - n * n, boundaryLoops: n
    });

    /** Roots of unity table: [cos(2 pi m / n), sin(2 pi m / n)] for m = 0..n-1. */
    const rootsOfUnity = (n) => {
        const t = new Float64Array(2 * n);
        for (let m = 0; m < n; m++) { t[2 * m] = Math.cos(TAU * m / n); t[2 * m + 1] = Math.sin(TAU * m / n); }
        return t;
    };
    const wrap = (k, n) => ((k % n) + n) % n;

    /* =========================================================================
     * 2. Patch evaluation, derivatives, tangent, projection, normal
     * ========================================================================= */

    /** Principal power (re + i im)^e written into out[o], out[o+1]. Zero maps to zero. */
    const powPrincipal = (re, im, e, out, o) => {
        const r = Math.hypot(re, im);
        if (r === 0) { out[o] = 0; out[o + 1] = 0; return; }
        const m = Math.exp(e * Math.log(r)), t = e * Math.atan2(im, re);
        out[o] = m * Math.cos(t); out[o + 1] = m * Math.sin(t);
    };

    /**
     * Phase-free base quantities for grid point (sin a, cos a, b), written to o[0..7]:
     * c1 = (cos w)^(2/n), c2 = (sin w)^(2/n), and the unit vector (p, q) proportional to
     * (-c1 sin^2 w, c2 cos^2 w). This equals (z1', z2') scaled by the common complex factor
     * (n/2) cos w sin w, so the normal direction is unchanged, and it stays finite where
     * cos w = 0 or sin w = 0. Every patch is obtained by multiplying by omega^k1, omega^k2.
     */
    const evalBase = (n, sa, ca, b, o) => {
        const cb = Math.cosh(b), sb = Math.sinh(b), e = 2 / n;
        const cr = ca * cb, ci = -sa * sb, sr = sa * cb, si = ca * sb; // cos w, sin w
        powPrincipal(cr, ci, e, o, 0); powPrincipal(sr, si, e, o, 2);
        const s2r = sr * sr - si * si, s2i = 2 * sr * si, c2r = cr * cr - ci * ci, c2i = 2 * cr * ci;
        const pr = -(o[0] * s2r - o[1] * s2i), pi = -(o[0] * s2i + o[1] * s2r);
        const qr = o[2] * c2r - o[3] * c2i, qi = o[2] * c2i + o[3] * c2r;
        const nrm = Math.hypot(Math.hypot(pr, pi), Math.hypot(qr, qi));
        if (nrm > 1e-290) {
            o[4] = pr / nrm; o[5] = pi / nrm; o[6] = qr / nrm; o[7] = qi / nrm;
        } else if (cr === 0 && ci === 0) { // limit at z1 = 0: tangent lies along the z1 direction
            o[4] = -1; o[5] = 0; o[6] = 0; o[7] = 0;
        } else { // limit at z2 = 0
            o[4] = 0; o[5] = 0; o[6] = 1; o[7] = 0;
        }
    };

    const _base = new Float64Array(8);

    /** Patch point (k1, k2, a, b): out = [Re z1, Im z1, Re z2, Im z2]. Valid for any real a. */
    const evalPatch = (n, k1, k2, a, b, out, tab = rootsOfUnity(n)) => {
        evalBase(n, Math.sin(a), Math.cos(a), b, _base);
        const m1 = wrap(k1, n) * 2, m2 = wrap(k2, n) * 2;
        out[0] = tab[m1] * _base[0] - tab[m1 + 1] * _base[1]; out[1] = tab[m1] * _base[1] + tab[m1 + 1] * _base[0];
        out[2] = tab[m2] * _base[2] - tab[m2 + 1] * _base[3]; out[3] = tab[m2] * _base[3] + tab[m2 + 1] * _base[2];
        return out;
    };

    /** Analytic w-derivatives z1' = -(2/n) z1 tan w, z2' = (2/n) z2 cot w: out = [Re, Im, Re, Im]. */
    const derivatives = (n, k1, k2, a, b, out, tab = rootsOfUnity(n)) => {
        evalPatch(n, k1, k2, a, b, out, tab);
        const cb = Math.cosh(b), sb = Math.sinh(b), ca = Math.cos(a), sa = Math.sin(a);
        const cr = ca * cb, ci = -sa * sb, sr = sa * cb, si = ca * sb;
        const dc = cr * cr + ci * ci, ds = sr * sr + si * si, f = 2 / n;
        const tr = (sr * cr + si * ci) / dc, ti = (si * cr - sr * ci) / dc;   // tan w
        const kr = (cr * sr + ci * si) / ds, ki = (ci * sr - cr * si) / ds;   // cot w
        const z1r = out[0], z1i = out[1], z2r = out[2], z2i = out[3];
        out[0] = -f * (z1r * tr - z1i * ti); out[1] = -f * (z1r * ti + z1i * tr);
        out[2] = f * (z2r * kr - z2i * ki); out[3] = f * (z2r * ki + z2i * kr);
        return out;
    };

    /** Jointly normalised tangent for patch (k1, k2) at (a, b): out = [Re u1, Im u1, Re u2, Im u2]. */
    const unitTangent = (n, k1, k2, a, b, out, tab = rootsOfUnity(n)) => {
        evalBase(n, Math.sin(a), Math.cos(a), b, _base);
        const m1 = wrap(k1, n) * 2, m2 = wrap(k2, n) * 2;
        out[0] = tab[m1] * _base[4] - tab[m1 + 1] * _base[5]; out[1] = tab[m1] * _base[5] + tab[m1 + 1] * _base[4];
        out[2] = tab[m2] * _base[6] - tab[m2 + 1] * _base[7]; out[3] = tab[m2] * _base[7] + tab[m2 + 1] * _base[6];
        return out;
    };

    /** Projection to 3-D with angle alpha: (Re z1, Re z2, cos(alpha) Im z1 + sin(alpha) Im z2). */
    const project = (z, alpha, out) => {
        out[0] = z[0]; out[1] = z[2]; out[2] = Math.cos(alpha) * z[1] + Math.sin(alpha) * z[3];
        return out;
    };

    /**
     * Unit surface normal from a (jointly normalised) tangent u = [Re u1, Im u1, Re u2, Im u2].
     * Returns the cross-product length |P_a x P_b| (zero where the projection degenerates);
     * out is the unit normal, or zero there.
     */
    const normalFromTangent = (u, alpha, out) => {
        const ca = Math.cos(alpha), sa = Math.sin(alpha);
        const ax = u[0], ay = u[2], az = ca * u[1] + sa * u[3];
        const bx = -u[1], by = -u[3], bz = ca * u[0] + sa * u[2];
        const nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
        const len = Math.hypot(nx, ny, nz);
        if (len < 1e-12) { out[0] = out[1] = out[2] = 0; return 0; }
        out[0] = nx / len; out[1] = ny / len; out[2] = nz / len;
        return len;
    };

    /** (k1 + k2) mod n recovered from position alone: arg(z1 z2) lies within pi/n of 2 pi (k1 + k2) / n. */
    const colourIndex = (n, z1r, z1i, z2r, z2i) =>
        wrap(Math.round(n * Math.atan2(z1r * z2i + z1i * z2r, z1r * z2r - z1i * z2i) / TAU), n);

    /* =========================================================================
     * 3. Mesh generation with seam welding
     * ========================================================================= */

    /** Grid a_i in [0, pi/2] (uniform if grade = 1); the same grid is shared by every patch. */
    const gridA = (na, grade) => {
        const a = new Float64Array(na + 1), sa = new Float64Array(na + 1), ca = new Float64Array(na + 1);
        for (let i = 0; i <= na; i++) {
            const t = i / na, f = t <= 0.5 ? 0.5 * Math.pow(2 * t, grade) : 1 - 0.5 * Math.pow(2 * (1 - t), grade);
            a[i] = HALF_PI * f; sa[i] = Math.sin(a[i]); ca[i] = Math.cos(a[i]);
        }
        sa[0] = 0; ca[0] = 1; sa[na] = 1; ca[na] = 0; // exact at the seams, so z = 0 exactly at the singular points
        return { a, sa, ca };
    };

    /** Symmetric grid b_j, j = -nb..nb (b = 0 included, b_{-j} = -b_j exactly), clustered at 0 if grade > 1. */
    const gridB = (nb, bMax, grade) => {
        const b = new Float64Array(2 * nb + 1);
        for (let j = 0; j <= nb; j++) {
            const v = bMax * Math.pow(j / nb, grade);
            b[nb + j] = v; b[nb - j] = -v;
        }
        return b;
    };

    /** Patch-grid resolution (intervals along a) for a total vertex budget: (na + 1)(2 na + 1) vertices per patch. */
    const resolutionForBudget = (n, budget) => Math.max(4, Math.floor(Math.sqrt(budget / (2 * n * n))));

    /**
     * Build the welded mesh of all n^2 patches.
     * Returns { n, na, V, F, z (V x 4 doubles), attr (V x 11 floats), indices (3F uint32) } where attr is
     * [Re z1, Im z1, Re z2, Im z2, Re u1, Im u1, Re u2, Im u2, a, b, patch label k1 * n + k2].
     */
    const buildMesh = (n, na, opts = {}) => {
        const gradeA = opts.gradeA || 1, gradeB = opts.gradeB || 1, bMax = opts.bMax || B_MAX, nb = opts.nb || na;
        const ga = gridA(na, gradeA), gb = gridB(nb, bMax, gradeB), tab = rootsOfUnity(n);
        const w = 2 * nb + 1, per = (na + 1) * w, total = n * n * per;
        const base = new Float64Array(8 * per);
        for (let i = 0; i <= na; i++) {
            for (let j = 0; j < w; j++) evalBase(n, ga.sa[i], ga.ca[i], gb[j], _base), base.set(_base, 8 * (i * w + j));
        }
        const z = new Float64Array(4 * total), attr = new Float32Array(11 * total);
        const lookup = new Int32Array(total), indices = new Uint32Array(6 * n * n * na * (2 * nb));
        const seam = new Map(), cand = new Int32Array(4), alt = new Int32Array(4);
        let V = 0, F = 0;

        const findSeam = (x, y, zz, ww) => {
            const q = [x / WELD_CELL, y / WELD_CELL, zz / WELD_CELL, ww / WELD_CELL], tol = WELD_TOL / WELD_CELL;
            for (let c = 0; c < 4; c++) {
                const f = Math.floor(q[c]), fr = q[c] - f;
                cand[c] = f; alt[c] = fr < tol ? f - 1 : (fr > 1 - tol ? f + 1 : f);
            }
            for (let mask = 0; mask < 16; mask++) {
                let skip = false;
                for (let c = 0; c < 4; c++) if ((mask >> c) & 1 && alt[c] === cand[c]) { skip = true; break; }
                if (skip) continue;
                const key = ((mask & 1 ? alt[0] : cand[0]) + "|" + (mask & 2 ? alt[1] : cand[1]) + "|"
                    + (mask & 4 ? alt[2] : cand[2]) + "|" + (mask & 8 ? alt[3] : cand[3]));
                const hit = seam.get(key);
                if (hit !== undefined && Math.max(Math.abs(z[4 * hit] - x), Math.abs(z[4 * hit + 1] - y),
                    Math.abs(z[4 * hit + 2] - zz), Math.abs(z[4 * hit + 3] - ww)) <= WELD_TOL) return hit;
            }
            return -1;
        };

        for (let k1 = 0; k1 < n; k1++) {
            for (let k2 = 0; k2 < n; k2++) {
                const start = (k1 * n + k2) * per, m1 = k1 * 2, m2 = k2 * 2;
                for (let i = 0; i <= na; i++) {
                    for (let j = 0; j < w; j++) {
                        const li = i * w + j, o = 8 * li;
                        const z1r = tab[m1] * base[o] - tab[m1 + 1] * base[o + 1], z1i = tab[m1] * base[o + 1] + tab[m1 + 1] * base[o];
                        const z2r = tab[m2] * base[o + 2] - tab[m2 + 1] * base[o + 3], z2i = tab[m2] * base[o + 3] + tab[m2 + 1] * base[o + 2];
                        let id = -1;
                        const onSeam = i === 0 || i === na;
                        if (onSeam) id = findSeam(z1r, z1i, z2r, z2i);
                        if (id < 0) {
                            id = V++;
                            z[4 * id] = z1r; z[4 * id + 1] = z1i; z[4 * id + 2] = z2r; z[4 * id + 3] = z2i;
                            const p = 11 * id;
                            attr[p] = z1r; attr[p + 1] = z1i; attr[p + 2] = z2r; attr[p + 3] = z2i;
                            attr[p + 4] = tab[m1] * base[o + 4] - tab[m1 + 1] * base[o + 5];
                            attr[p + 5] = tab[m1] * base[o + 5] + tab[m1 + 1] * base[o + 4];
                            attr[p + 6] = tab[m2] * base[o + 6] - tab[m2 + 1] * base[o + 7];
                            attr[p + 7] = tab[m2] * base[o + 7] + tab[m2 + 1] * base[o + 6];
                            attr[p + 8] = ga.a[i]; attr[p + 9] = gb[j]; attr[p + 10] = k1 * n + k2;
                            if (onSeam) seam.set(cand[0] + "|" + cand[1] + "|" + cand[2] + "|" + cand[3], id); // cand still holds this vertex's cell
                        }
                        lookup[start + li] = id;
                    }
                }
                for (let i = 0; i < na; i++) {
                    for (let j = 0; j < w - 1; j++) {
                        const v00 = lookup[start + i * w + j], v10 = lookup[start + (i + 1) * w + j];
                        const v01 = lookup[start + i * w + j + 1], v11 = lookup[start + (i + 1) * w + j + 1];
                        indices[3 * F] = v00; indices[3 * F + 1] = v10; indices[3 * F + 2] = v11; F++;
                        indices[3 * F] = v00; indices[3 * F + 1] = v11; indices[3 * F + 2] = v01; F++;
                    }
                }
            }
        }
        return { n, na, nb, V, F, z: z.subarray(0, 4 * V), attr: attr.subarray(0, 11 * V), indices: indices.subarray(0, 3 * F) };
    };

    return {
        HALF_PI, B_MAX, WELD_TOL, topology, rootsOfUnity, powPrincipal, evalBase, evalPatch, derivatives,
        unitTangent, project, normalFromTangent, colourIndex, gridA, gridB, resolutionForBudget, buildMesh
    };
}));
