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
     * Bakes 6 faces (RGBA16F Float32Array) at initialisation with:
     *   - Poisson-distributed stars with power-law magnitude distribution and blackbody colours
     *   - Inclined Milky Way galactic band with central bulge and dark dust lanes
     *   - Faint diffuse emission nebula tinted with KW.col.a accent colour
     */
    const bakeStarfieldFaces = (size = 1024, accent = [0.22, 0.74, 0.97]) => {
        const faces = [];
        for (let f = 0; f < 6; f++) {
            faces.push(new Float32Array(size * size * 4));
        }

        // Seeded deterministic pseudo-random number generator (Mulberry32)
        let seed = 133742;
        const rand = () => {
            let t = (seed += 0x6d2b79f5);
            t = Math.imul(t ^ (t >>> 15), t | 1);
            t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };

        // Tanner Helland blackbody colour approximation
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

        // Galactic coordinate vectors (tilted relative to black hole spin axis)
        const nGal = [0.35, 0.82, 0.45];
        const nGalLen = Math.hypot(...nGal);
        nGal[0] /= nGalLen; nGal[1] /= nGalLen; nGal[2] /= nGalLen;

        const gc = [-0.85, 0.25, 0.45];
        const gcLen = Math.hypot(...gc);
        gc[0] /= gcLen; gc[1] /= gcLen; gc[2] /= gcLen;

        const n0 = nGal[0], n1 = nGal[1], n2 = nGal[2];

        // Orthonormal basis (e1, nGal, e2) for galactic plane star placement
        const e1Len = Math.hypot(n2, 0.0, -n0);
        const e1x = n2 / e1Len, e1y = 0.0, e1z = -n0 / e1Len;
        const e2x = n1 * e1z - n2 * e1y;
        const e2y = n2 * e1x - n0 * e1z;
        const e2z = n0 * e1y - n1 * e1x;

        // Poisson-distributed stars with power-law magnitude and blackbody colours on pitch-black space
        const numStars = 8500;
        for (let i = 0; i < numStars; i++) {
            let dx, dy, dz;
            // 65% isotropic distribution across the sphere, 35% smoothly concentrated along galactic plane
            if (rand() < 0.65) {
                const z = rand() * 2.0 - 1.0;
                const phi = rand() * 2.0 * Math.PI;
                const rxy = Math.sqrt(Math.max(0, 1.0 - z * z));
                dx = rxy * Math.cos(phi);
                dy = z;
                dz = rxy * Math.sin(phi);
            } else {
                const phi = rand() * 2.0 * Math.PI;
                // Smooth bell-shaped latitude distribution (sum of 4 uniforms) to avoid hard strip edges
                const b = ((rand() + rand() + rand() + rand()) - 2.0) * 0.22;
                const rxy = Math.cos(b);
                const sinB = Math.sin(b);
                const cPhi = rxy * Math.cos(phi), sPhi = rxy * Math.sin(phi);
                dx = cPhi * e1x + sinB * n0 + sPhi * e2x;
                dy = cPhi * e1y + sinB * n1 + sPhi * e2y;
                dz = cPhi * e1z + sinB * n2 + sPhi * e2z;
            }

            // Power-law magnitude distribution (Pareto): most stars faint, few prominent
            const u = Math.max(1e-4, rand());
            const brightness = 0.22 * Math.pow(u, -0.65);
            const clampedB = Math.min(32.0, brightness);

            // Blackbody temperature: IMF heavily skewed toward cooler dwarf stars
            const uT = rand();
            const tempK = 2600 + (32000 - 2600) * uT * uT * uT;
            const [cr, cg, cb] = blackbodyCol(tempK);

            // Determine cubemap face and UV projection
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
    /**
     * Cached accessor for disk LUT, rebuilt only when spin, isco, or rout changes.
     */
    const getDiskLUT = (a, r_isco, r_out, width = 512) => {
        if (cachedLUT && cachedLUT.a === a && cachedLUT.r_isco === r_isco && cachedLUT.r_out === r_out && cachedLUT.width === width) {
            return cachedLUT;
        }
        const res = generateDiskLUT(a, r_isco, r_out, width);
        cachedLUT = { ...res, a, r_isco, r_out, width };
        return cachedLUT;
    };

    let cachedStarfield = null;
    /**
     * Cached accessor for baked starfield cubemap data.
     */
    const getStarfieldData = (size = 1024, accent = [0.22, 0.74, 0.97]) => {
        if (cachedStarfield && cachedStarfield.size === size) {
            return cachedStarfield;
        }
        cachedStarfield = bakeStarfieldFaces(size, accent);
        return cachedStarfield;
    };

    const api = {
        horizon,
        isco,
        keplerianOmega,
        fourVelocityUt,
        pageThorneFlux,
        generateDiskLUT,
        getDiskLUT,
        bakeStarfieldFaces,
        getStarfieldData
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (typeof root !== 'undefined') {
        root.BLACKHOLE_PHYSICS = api;
    }
})(typeof window !== 'undefined' ? window : globalThis);
