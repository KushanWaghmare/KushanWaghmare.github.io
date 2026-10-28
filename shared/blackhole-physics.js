/**
 * blackhole-physics.js
 *
 * CPU physics engine for Kerr black hole calculations and accretion disk models.
 * Ported from scratch/kerr-reference.js.
 *
 * Units & Conventions:
 *   - Units: G = c = M = 1 (geometrised units).
 *   - Kerr metric in Boyer–Lindquist coordinates (t, r, θ, φ).
 *   - Spin parameter: a = J/M ∈ [0, 1).
 *   - Spin axis: site's +y axis (θ = 0).
 *   - Thin Novikov–Thorne disk in equatorial plane (θ = π/2), prograde rotation.
 */

'use strict';

((root) => {
    const horizon = (a) => {
        const absA = Math.min(1.0, Math.abs(a));
        return 1.0 + Math.sqrt(Math.max(0.0, 1.0 - absA * absA));
    };

    /**
     * Tanner Helland blackbody colour approximation (hoisted to module scope).
     */
    const blackbodyCol = (tempK) => {
        const t = Math.max(1000, Math.min(40000, tempK)) * 0.01;
        const tA = Math.max(t - 60, 1.0);
        const tB = Math.max(t - 10, 1.0);
        const r = t <= 66 ? 1.0 : Math.min(1.0, Math.max(0, 329.698727 * Math.pow(tA, -0.1332047592) / 255.0));
        const g = t <= 66
            ? Math.min(1.0, Math.max(0, (99.4708025861 * Math.log(t) - 161.1195681661) / 255.0))
            : Math.min(1.0, Math.max(0, 288.1221695283 * Math.pow(tA, -0.0755148492) / 255.0));
        const b = t >= 66 ? 1.0 : (t <= 19 ? 0.0 : Math.min(1.0, Math.max(0, (138.5177312231 * Math.log(tB) - 305.0447927307) / 255.0)));
        return [r, g, b];
    };

    /**
     * Innermost Stable Circular Orbit (ISCO) radius.
     */
    const isco = (a, prograde = true) => {
        const absA = Math.min(1.0, Math.abs(a));
        const term1 = Math.cbrt(1.0 + absA);
        const term2 = Math.cbrt(Math.max(0.0, 1.0 - absA));
        const z1 = 1.0 + Math.cbrt(Math.max(0.0, 1.0 - absA * absA)) * (term1 + term2);
        const z2 = Math.sqrt(3.0 * absA * absA + z1 * z1);
        const radical = Math.max(0.0, (3.0 - z1) * (3.0 + z1 + 2.0 * z2));
        const sign = prograde ? -1.0 : 1.0;
        return 3.0 + z2 + sign * Math.sqrt(radical);
    };

    /**
     * Keplerian orbital angular velocity Ω for equatorial circular prograde orbits.
     */
    const keplerianOmega = (r, a) => {
        return 1.0 / (Math.pow(r, 1.5) + a);
    };

    /**
     * Four-velocity time component u^t for equatorial circular orbits.
     */
    const fourVelocityUt = (r, a) => {
        const omega = keplerianOmega(r, a);
        const g_tt = -(1.0 - 2.0 / r);
        const g_tphi = -2.0 * a / r;
        const g_phiphi = r * r + a * a + 2.0 * a * a / r;
        const denom = -(g_tt + 2.0 * g_tphi * omega + g_phiphi * omega * omega);
        if (denom <= 0.0) return 0.0;
        return 1.0 / Math.sqrt(denom);
    };

    /**
     * Page–Thorne (1974) radiative flux F(r) with zero torque at ISCO.
     */
    const pageThorneFlux = (r, a) => {
        const rIn = isco(a, true);
        if (r <= rIn) return 0.0;

        const x = Math.sqrt(r);
        const x0 = Math.sqrt(rIn);

        // Schwarzschild limit (a = 0)
        if (Math.abs(a) < 1e-7) {
            const sq3 = Math.sqrt(3.0);
            const sq6 = Math.sqrt(6.0);
            const logArg = ((x - sq3) / (x + sq3)) * ((sq6 + sq3) / (sq6 - sq3));
            if (logArg <= 0.0) return 0.0;
            const j = x - sq6 - (sq3 / 2.0) * Math.log(logArg);
            const denom = (r * r * r) * (1.0 - 3.0 / r);
            if (denom <= 0.0) return 0.0;
            return Math.max(0.0, j / denom);
        }

        // Kerr case: roots of x³ - 3x + 2a = 0
        const clampedA = Math.max(-1.0, Math.min(1.0, a));
        const psi = Math.acos(clampedA) / 3.0;
        const x1 = 2.0 * Math.cos(psi - Math.PI / 3.0);
        const x2 = 2.0 * Math.cos(psi + Math.PI / 3.0);
        const x3 = -2.0 * Math.cos(psi);

        const roots = [x1, x2, x3];
        let sumTerms = 0.0;
        for (let i = 0; i < 3; i++) {
            const xi = roots[i];
            const xj = roots[(i + 1) % 3];
            const xk = roots[(i + 2) % 3];
            const num = 3.0 * (xi - a) * (xi - a);
            const den = xi * (xi - xj) * (xi - xk);
            const ratio = (x - xi) / (x0 - xi);
            if (ratio > 0.0) {
                sumTerms += (num / den) * Math.log(ratio);
            }
        }

        const j = x - x0 - 1.5 * a * Math.log(x / x0) - sumTerms;
        const denom = x * x * x * x * (x * x * x - 3.0 * x + 2.0 * a);
        if (denom <= 0.0) return 0.0;
        return Math.max(0.0, j / denom);
    };

    /**
     * Precomputes 1-D disk lookup table data across 512 texels from r_isco to r_out.
     * Channels: [ R: normalized flux F/Fmax, G: Ω, B: u^t, A: temperature scale ]
     */
    const generateDiskLUT = (a, r_isco, r_out, width = 512) => {
        const data = new Float32Array(width * 4);
        let maxFlux = 0.0;

        // First pass: find maximum flux for normalization
        for (let i = 0; i < width; i++) {
            const u = (i + 0.5) / width;
            const r = r_isco + u * (r_out - r_isco);
            const flux = pageThorneFlux(r, a);
            if (flux > maxFlux) maxFlux = flux;
        }
        if (maxFlux <= 0.0) maxFlux = 1.0;

        // Second pass: fill texture data
        for (let i = 0; i < width; i++) {
            const u = (i + 0.5) / width;
            const r = r_isco + u * (r_out - r_isco);
            const flux = pageThorneFlux(r, a);
            const omega = keplerianOmega(r, a);
            const ut = fourVelocityUt(r, a);
            const normFlux = flux / maxFlux;
            const tempScale = Math.pow(normFlux, 0.25);

            const idx = i * 4;
            data[idx + 0] = normFlux;
            data[idx + 1] = omega;
            data[idx + 2] = ut;
            data[idx + 3] = tempScale;
        }

        return { data, maxFlux, width };
    };

    /**
     * Procedural starfield cubemap generator.
     */
    const bakeStarfieldFaces = (size = 1024, accent = [0.22, 0.74, 0.97]) => {
        const faces = [];
        for (let f = 0; f < 6; f++) {
            faces.push(new Float32Array(size * size * 4));
        }

        let seed = 133742;
        const rand = () => {
            let t = (seed += 0x6d2b79f5);
            t = Math.imul(t ^ (t >>> 15), t | 1);
            t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };

        const smoothstep = (e0, e1, x) => {
            const t = Math.max(0.0, Math.min(1.0, (x - e0) / Math.max(1e-5, e1 - e0)));
            return t * t * (3.0 - 2.0 * t);
        };

        const nGal = [0.35, 0.82, 0.45];
        const nGalLen = Math.hypot(...nGal);
        nGal[0] /= nGalLen; nGal[1] /= nGalLen; nGal[2] /= nGalLen;

        const gc = [-0.85, 0.25, 0.45];
        const gcLen = Math.hypot(...gc);
        gc[0] /= gcLen; gc[1] /= gcLen; gc[2] /= gcLen;

        const n0 = nGal[0], n1 = nGal[1], n2 = nGal[2];

        const e1Len = Math.hypot(n2, 0.0, -n0);
        const e1x = n2 / e1Len, e1y = 0.0, e1z = -n0 / e1Len;
        const e2x = n1 * e1z - n2 * e1y;
        const e2y = n2 * e1x - n0 * e1z;
        const e2z = n0 * e1y - n1 * e1x;

        const numStars = 14000;
        for (let i = 0; i < numStars; i++) {
            let dx, dy, dz;
            let isGalactic = false;
            if (rand() < 0.55) {
                const z = rand() * 2.0 - 1.0;
                const phi = rand() * 2.0 * Math.PI;
                const rxy = Math.sqrt(Math.max(0, 1.0 - z * z));
                dx = rxy * Math.cos(phi);
                dy = z;
                dz = rxy * Math.sin(phi);
            } else {
                isGalactic = true;
                const phi = rand() * 2.0 * Math.PI;
                const b = ((rand() + rand() + rand() + rand()) - 2.0) * 0.18;
                const rxy = Math.cos(b);
                const sinB = Math.sin(b);
                const cPhi = rxy * Math.cos(phi), sPhi = rxy * Math.sin(phi);
                dx = cPhi * e1x + sinB * n0 + sPhi * e2x;
                dy = cPhi * e1y + sinB * n1 + sPhi * e2y;
                dz = cPhi * e1z + sinB * n2 + sPhi * e2z;
            }

            const u = Math.max(1e-4, rand());
            let brightness = 0.20 * Math.pow(u, -0.68);

            if (isGalactic) {
                const galDist = Math.abs(dx * n0 + dy * n1 + dz * n2);
                const dustLane = smoothstep(0.015, 0.065, galDist);
                brightness *= (0.45 + 0.55 * dustLane);
            }
            const clampedB = Math.min(36.0, brightness);

            const uT = rand();
            const tempK = 2400 + (34000 - 2400) * uT * uT * uT;
            const [cr, cg, cb] = blackbodyCol(tempK);

            const ax = Math.abs(dx), ay = Math.abs(dy), az = Math.abs(dz);
            let face = 0, sc = 0, tc = 0, ma = 1;
            if (ax >= ay && ax >= az) {
                if (dx > 0) { face = 0; sc = -dz; tc = -dy; ma = ax; }
                else { face = 1; sc = dz; tc = -dy; ma = ax; }
            } else if (ay >= ax && ay >= az) {
                if (dy > 0) { face = 2; sc = dx; tc = dz; ma = ay; }
                else { face = 3; sc = dx; tc = -dz; ma = ay; }
            } else {
                if (dz > 0) { face = 4; sc = dx; tc = -dy; ma = az; }
                else { face = 5; sc = -dx; tc = -dy; ma = az; }
            }

            const px = 0.5 * (sc / ma + 1.0) * size - 0.5;
            const py = 0.5 * (tc / ma + 1.0) * size - 0.5;
            const ix = Math.floor(px), iy = Math.floor(py);

            if (ix >= 0 && ix < size - 1 && iy >= 0 && iy < size - 1) {
                const fx = px - ix, fy = py - iy;
                const w00 = (1.0 - fx) * (1.0 - fy);
                const w10 = fx * (1.0 - fy);
                const w01 = (1.0 - fx) * fy;
                const w11 = fx * fy;
                const rVal = cr * clampedB, gVal = cg * clampedB, bVal = cb * clampedB;

                const data = faces[face];
                const idx00 = (iy * size + ix) * 4;
                const idx10 = idx00 + 4;
                const idx01 = idx00 + size * 4;
                const idx11 = idx01 + 4;

                data[idx00] += rVal * w00; data[idx00 + 1] += gVal * w00; data[idx00 + 2] += bVal * w00;
                data[idx10] += rVal * w10; data[idx10 + 1] += gVal * w10; data[idx10 + 2] += bVal * w10;
                data[idx01] += rVal * w01; data[idx01 + 1] += gVal * w01; data[idx01 + 2] += bVal * w01;
                data[idx11] += rVal * w11; data[idx11 + 1] += gVal * w11; data[idx11 + 2] += bVal * w11;
            }
        }

        return { faces, size };
    };

    let cachedLUT = null;
    const getDiskLUT = (a, r_isco, r_out, width = 512) => {
        if (cachedLUT && cachedLUT.a === a && cachedLUT.r_isco === r_isco && cachedLUT.r_out === r_out && cachedLUT.width === width) {
            return cachedLUT;
        }
        const res = generateDiskLUT(a, r_isco, r_out, width);
        cachedLUT = { ...res, a, r_isco, r_out, width };
        return cachedLUT;
    };

    let cachedStarfield = null;
    const getStarfieldData = (size = 1024, accent = [0.22, 0.74, 0.97]) => {
        if (cachedStarfield && cachedStarfield.size === size) {
            return cachedStarfield;
        }
        cachedStarfield = bakeStarfieldFaces(size, accent);
        return cachedStarfield;
    };

    const verifyConservationDrift = (spin = 0.95, inclinationDeg = 78.0) => {
        const a = Math.max(-0.998, Math.min(0.998, spin));
        const a2 = a * a;
        const thetaObs = inclinationDeg * Math.PI / 180.0;
        const sinObs = Math.sin(thetaObs), cosObs = Math.cos(thetaObs);
        const rObs = 50.0;
        const r_plus = 1.0 + Math.sqrt(Math.max(0.0, 1.0 - a2));
        const r_absorb = r_plus * 1.035;

        const testRays = [
            { alpha: 6.0, beta: 3.0 },
            { alpha: 10.0, beta: 5.0 },
            { alpha: -5.0, beta: 2.0 },
            { alpha: 7.0, beta: -3.5 },
            { alpha: 8.0, beta: 0.0 }
        ];

        let worstDriftH = 0.0;
        let worstDriftQ = 0.0;

        testRays.forEach(({ alpha, beta }) => {
            const L = -alpha * sinObs;
            const Q0 = beta * beta + (alpha * alpha - a2) * cosObs * cosObs;
            const c1 = -(Q0 + L * L - a2);
            const c2 = -2.0 * a2;

            const delObs = rObs * rObs - 2.0 * rObs + a2;
            const pObs = rObs * rObs + a2 - a * L;
            const rad = Math.max(0.0, (pObs * pObs) / delObs - (Q0 + (L - a) * (L - a)));
            const prObs = -Math.sqrt(rad / delObs);
            const puObs = sinObs * beta;

            let s = [rObs, cosObs, prObs, puObs];

            const derivs = (st) => {
                const r = st[0], u = Math.max(-0.9998, Math.min(0.9998, st[1])), pr = st[2], pu = st[3];
                const r2 = r * r;
                const invSig = 1.0 / (r2 + a2 * u * u);
                const del = Math.max(1e-5, r2 - 2.0 * r + a2);
                const pOverDel = (r2 + a2 - a * L) / del;
                const dr = del * pr * invSig;
                const du = pu * invSig;
                const dpr = (2.0 * r * pOverDel - (r - 1.0) * (pr * pr + pOverDel * pOverDel)) * invSig;
                const dpu = (c1 * u + c2 * u * u * u) * invSig;
                return [dr, du, dpr, dpu];
            };

            for (let step = 0; step < 220; step++) {
                const r = s[0], u = s[1];
                if (r <= r_absorb || (r >= rObs + 2.0 && s[2] > 0.0)) break;

                const distH = Math.max(1e-4, r - r_plus);
                let dl = (r > 25.0)
                    ? Math.min(6.0, (r - 20.0) * 0.45 + 1.2)
                    : Math.max(0.001, Math.min(2.5, 0.12 * distH));
                if (Math.abs(u) < 0.08 && r < 25.0) dl *= 0.65;

                const sig = r * r + a2 * u * u;
                const del = Math.max(1e-5, r * r - 2.0 * r + a2);
                const p = r * r + a2 - a * L;
                const Q_cur = s[3] * s[3] - c1 * u * u - 0.5 * c2 * u * u * u * u;
                const twoSigH = del * s[2] * s[2] - (p * p) / del + Q_cur + (L - a) * (L - a);
                const curH = Math.abs(twoSigH / (2.0 * sig));
                const driftQ = Math.abs(Q_cur - Q0) / Math.max(1.0, Math.abs(Q0));

                if (r > r_plus * 1.08) {
                    if (curH > worstDriftH) worstDriftH = curH;
                    if (driftQ > worstDriftQ) worstDriftQ = driftQ;
                }

                const k1 = derivs(s);
                const s2 = s.map((v, i) => v + 0.5 * dl * k1[i]);
                const k2 = derivs(s2);
                const s3 = s.map((v, i) => v + 0.5 * dl * k2[i]);
                const k3 = derivs(s3);
                const s4 = s.map((v, i) => v + dl * k3[i]);
                const k4 = derivs(s4);

                s = s.map((v, i) => v + (dl / 6.0) * (k1[i] + 2.0 * k2[i] + 2.0 * k3[i] + k4[i]));
            }
        });

        const passed = worstDriftH < 1e-3;
        console.log(
            `[Kerr Geodesics] Conserved quantities verified (a = ${a.toFixed(2)}, θ = ${inclinationDeg.toFixed(1)}°): ` +
            `max |H| = ${worstDriftH.toExponential(3)}, max ΔQ/Q = ${worstDriftQ.toExponential(3)} (threshold: 1.0e-3, status: ${passed ? "PASS" : "WARN"})`
        );
        return { worstDriftH, worstDriftQ, passed };
    };

    const generateBlackbodyLUT = (width = 512) => {
        const data = new Float32Array(width * 4);
        for (let i = 0; i < width; i++) {
            const u = i / (width - 1);
            const tempK = 1000.0 + u * (32000.0 - 1000.0);
            const [r, g, b] = blackbodyCol(tempK);

            let cr = r, cg = g, cb = b;
            if (tempK < 3500.0) {
                const w = (tempK - 1000.0) / 2500.0;
                cr = 0.55 * (1.0 - w) + r * w;
                cg = 0.12 * (1.0 - w) + g * w;
                cb = 0.02 * (1.0 - w) + b * w;
            }

            const idx = i * 4;
            data[idx + 0] = cr;
            data[idx + 1] = cg;
            data[idx + 2] = cb;
            data[idx + 3] = 1.0;
        }
        return { data, width };
    };

    const api = {
        horizon,
        blackbodyCol,
        isco,
        keplerianOmega,
        fourVelocityUt,
        pageThorneFlux,
        generateDiskLUT,
        getDiskLUT,
        bakeStarfieldFaces,
        getStarfieldData,
        verifyConservationDrift,
        generateBlackbodyLUT
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (typeof root !== 'undefined') {
        root.BLACKHOLE_PHYSICS = api;
    }
})(typeof window !== 'undefined' ? window : globalThis);
