/**
 * quant-singularity-math.js
 *
 * Mathematical core for the Quantitative Finance hero: The Market Singularity.
 * Connects the Kerr spacetime metric in Boyer–Lindquist coordinates with
 * Black–Scholes option theory, Breeden–Litzenberger risk-neutral density,
 * and order-flow frame dragging.
 *
 * UMD module: usable in Node.js (CommonJS) and browser (window.QuantSingularityMath).
 * Code style: 4-space indent, const/arrow functions, zero external dependencies.
 */

(function (root, factory) {
    if (typeof module === "object" && module.exports) {
        module.exports = factory();
    } else {
        root.QuantSingularityMath = factory();
    }
}(typeof self !== "undefined" ? self : this, function () {
    "use strict";

    /* ---------- PRNG & Determinism (mulberry32) ---------- */
    const createPrng = (seed = 13374201) => {
        let s = seed >>> 0;
        return () => {
            s = (s + 0x6D2B79F5) >>> 0;
            let t = Math.imul(s ^ (s >>> 15), 1 | s);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    };

    const fnv1a = (str) => {
        let h = 0x811c9dc5;
        for (let i = 0; i < str.length; i++) {
            h ^= str.charCodeAt(i);
            h = Math.imul(h, 0x01000193);
        }
        return h >>> 0;
    };

    /* ---------- Kerr Spacetime Metric (Boyer–Lindquist Coordinates) ---------- */
    // G = c = M = 1 (geometrised market units).
    // a in (-1, 1): Market Spin parameter (Order Flow Imbalance OFI).
    const sigma = (r, theta, a) => {
        const cosT = Math.cos(theta);
        return r * r + a * a * cosT * cosT;
    };

    const delta = (r, a) => {
        return r * r - 2.0 * r + a * a;
    };

    const horizon = (a) => {
        const absA = Math.abs(a);
        if (absA >= 1.0) {
            throw new Error(`Market spin |a| must be < 1.0 for a non-naked singularity, received: ${a}`);
        }
        return 1.0 + Math.sqrt(Math.max(0.0, 1.0 - absA * absA));
    };

    const innerHorizon = (a) => {
        const absA = Math.abs(a);
        if (absA >= 1.0) {
            throw new Error(`Market spin |a| must be < 1.0, received: ${a}`);
        }
        return 1.0 - Math.sqrt(Math.max(0.0, 1.0 - absA * absA));
    };

    const ergosphere = (theta, a) => {
        const cosT = Math.cos(theta);
        return 1.0 + Math.sqrt(Math.max(0.0, 1.0 - a * a * cosT * cosT));
    };

    // Circular photon orbit radius r_ph (Bardeen 1972)
    const photonOrbit = (a, prograde = true) => {
        const s = prograde ? -a : a;
        const clamped = Math.max(-1.0, Math.min(1.0, s));
        return 2.0 * (1.0 + Math.cos((2.0 / 3.0) * Math.acos(clamped)));
    };

    // Innermost Stable Circular Orbit (ISCO) radius (Bardeen, Press & Teukolsky 1972)
    const isco = (a, prograde = true) => {
        const absA = Math.min(0.99999, Math.abs(a));
        const term1 = Math.cbrt(1.0 + absA);
        const term2 = Math.cbrt(Math.max(0.0, 1.0 - absA));
        const z1 = 1.0 + Math.cbrt(Math.max(0.0, 1.0 - absA * absA)) * (term1 + term2);
        const z2 = Math.sqrt(3.0 * absA * absA + z1 * z1);
        const radical = Math.max(0.0, (3.0 - z1) * (3.0 + z1 + 2.0 * z2));
        const sign = prograde ? (a >= 0 ? -1.0 : 1.0) : (a >= 0 ? 1.0 : -1.0);
        return 3.0 + z2 + sign * Math.sqrt(radical);
    };

    // Frame-dragging angular velocity omega(r, theta, a)
    const frameDraggingOmega = (r, theta, a) => {
        const sinT = Math.sin(theta);
        const d = delta(r, a);
        const denom = Math.pow(r * r + a * a, 2.0) - a * a * d * sinT * sinT;
        return (2.0 * a * r) / Math.max(denom, 1e-9);
    };

    // Keplerian angular velocity in the equatorial plane (theta = pi/2)
    const keplerianOmega = (r, a) => {
        return 1.0 / (Math.pow(r, 1.5) + a);
    };

    // Fluid 4-velocity time component u^t in circular equatorial orbit
    const fluidUt = (r, a) => {
        const denom = 1.0 - 3.0 / r + 2.0 * a / Math.pow(r, 1.5);
        if (denom <= 0.0) return 0.0;
        return 1.0 / Math.sqrt(denom);
    };

    // Relativistic Doppler beaming boost factor g = E_obs / E_emit
    const dopplerFactor = (r, a, bz) => {
        const ut = fluidUt(r, a);
        if (ut <= 0.0) return 1.0;
        const omega = keplerianOmega(r, a);
        const denom = ut * (1.0 - omega * bz);
        if (Math.abs(denom) < 1e-9) return 1.0;
        return 1.0 / denom;
    };

    // Liouville radiance transformation: I_obs = g^4 * I_emit
    const beamedRadiance = (I_emit, g) => {
        const clampedG = Math.max(0.01, Math.min(10.0, g));
        return I_emit * Math.pow(clampedG, 4.0);
    };

    /* ---------- Black–Scholes & Breeden–Litzenberger Analytics ---------- */
    const SQRT_2PI = Math.sqrt(2.0 * Math.PI);
    const pdfNormal = (x) => Math.exp(-0.5 * x * x) / SQRT_2PI;

    // Error function approximation (Abramowitz & Stegun formula 7.1.26, max err 1.5e-7)
    const erf = (x) => {
        const sign = x >= 0 ? 1 : -1;
        const absX = Math.abs(x);
        const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741, a4 = -1.453152027, a5 = 1.061405429;
        const p = 0.3275911;
        const t = 1.0 / (1.0 + p * absX);
        const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-absX * absX);
        return sign * y;
    };

    const cdfNormal = (x) => 0.5 * (1.0 + erf(x / Math.SQRT2));

    const blackScholesGreeks = (S, K, T, rRate = 0.02, vol = 0.20) => {
        const safeT = Math.max(1e-5, T);
        const safeVol = Math.max(1e-4, vol);
        const sqrtT = Math.sqrt(safeT);
        const d1 = (Math.log(S / K) + (rRate + 0.5 * safeVol * safeVol) * safeT) / (safeVol * sqrtT);
        const d2 = d1 - safeVol * sqrtT;
        const discount = Math.exp(-rRate * safeT);

        const callPrice = S * cdfNormal(d1) - K * discount * cdfNormal(d2);
        const deltaCall = cdfNormal(d1);
        const gamma = pdfNormal(d1) / (S * safeVol * sqrtT);
        const vega = S * pdfNormal(d1) * sqrtT;
        const theta = -(S * pdfNormal(d1) * safeVol) / (2.0 * sqrtT) - rRate * K * discount * cdfNormal(d2);

        return { callPrice, delta: deltaCall, gamma, vega, theta, d1, d2 };
    };

    // Breeden–Litzenberger risk-neutral probability density q(K) = e^(rT) * d^2 C / dK^2
    const breedenLitzenberger = (S, K, T, rRate = 0.02, vol = 0.20) => {
        const safeT = Math.max(1e-5, T);
        const safeVol = Math.max(1e-4, vol);
        const sqrtT = Math.sqrt(safeT);
        const d2 = (Math.log(S / K) + (rRate - 0.5 * safeVol * safeVol) * safeT) / (safeVol * sqrtT);
        return pdfNormal(d2) / (K * safeVol * sqrtT);
    };

    /* ---------- Accretion Disk Physics: Novikov–Thorne with Gamma Peak ---------- */
    // Page–Thorne relativistic flux profile for thin equatorial disk
    const novikovThorneProfile = (r, a) => {
        const rIsco = isco(a, true);
        if (r < rIsco) return 0.0;
        const sqrtR = Math.sqrt(r);
        const sqrtIsco = Math.sqrt(rIsco);
        const fZeroTorque = Math.max(0.0, 1.0 - Math.sqrt(sqrtIsco / sqrtR));
        // Radiative decay r^(-3/4) in temperature, r^(-3) in flux
        return Math.pow(r, -3.0) * fZeroTorque;
    };

    const diskRadiance = (r, a, S = 100.0, K = 100.0, T = 0.25, vol = 0.22) => {
        const rIsco = isco(a, true);
        if (r < rIsco) return 0.0;
        const nt = novikovThorneProfile(r, a);
        // Map radial distance to effective option moneyness
        const strikeEquiv = K * (r / rIsco);
        const greeks = blackScholesGreeks(S, strikeEquiv, T, 0.02, vol);
        // Boost disk inner edge with Black–Scholes Gamma spike
        const gammaBoost = Math.log(1.0 + greeks.gamma * 25.0);
        return nt * (1.0 + gammaBoost * 4.0);
    };

    /* ---------- Geodesic Conserved Quantities & Hamiltonian ---------- */
    const conservedQuantities = (alpha, beta, thetaObs, a) => {
        const clampedTheta = Math.max(0.05, Math.min(Math.PI - 0.05, thetaObs));
        const sinT = Math.sin(clampedTheta);
        const cosT = Math.cos(clampedTheta);
        const E = 1.0;
        const Lz = -alpha * sinT;
        const Q = beta * beta + cosT * cosT * (alpha * alpha - a * a);
        return { E, Lz, Q };
    };

    const hamiltonian = (r, theta, pr, ptheta, a, L) => {
        const sig = sigma(r, theta, a);
        const del = delta(r, a);
        const rawSinT = Math.sin(theta);
        const sinT = Math.abs(rawSinT) < 1e-7 ? (rawSinT >= 0 ? 1e-7 : -1e-7) : rawSinT;
        if (Math.abs(del) < 1e-12) return 0.0;
        const p = r * r + a * a - a * L;
        const termTheta = Math.pow(L - a * sinT * sinT, 2.0) / (sinT * sinT);
        const h0 = del * pr * pr + ptheta * ptheta + termTheta - (p * p) / del;
        return h0 / (2.0 * sig);
    };

    const canonicalDerivatives = (state, a, L) => {
        const { r, theta, pr, ptheta } = state;
        const sig = sigma(r, theta, a);
        const del = delta(r, a);
        const rawSinT = Math.sin(theta);
        const sinT = Math.abs(rawSinT) < 1e-7 ? (rawSinT >= 0 ? 1e-7 : -1e-7) : rawSinT;
        const cosT = Math.cos(theta);
        const p = r * r + a * a - a * L;
        const h = hamiltonian(r, theta, pr, ptheta, a, L);

        const dr = (del * pr) / sig;
        const dtheta = ptheta / sig;
        const sinT2 = sinT * sinT;
        const dphi = ((L - a * sinT2) / sinT2 + (a * p) / del) / sig;
        const dt = (a * (L - a * sinT2) + ((r * r + a * a) * p) / del) / sig;

        const delPrime = 2.0 * (r - 1.0);
        const pPrime = 2.0 * r;
        const dH0_dr = delPrime * pr * pr - (2.0 * p * pPrime * del - p * p * delPrime) / (del * del);
        const dpr = -dH0_dr / (2.0 * sig) + (h / sig) * (2.0 * r);

        const dH0_dtheta = -2.0 * cosT * ((L * L) / (sinT2 * sinT) - a * a * sinT);
        const dptheta = -dH0_dtheta / (2.0 * sig) - (h / sig) * (a * a * Math.sin(2.0 * theta));

        return { dr, dtheta, dphi, dt, dpr, dptheta, h };
    };

    const rk4Step = (state, ds, a, L) => {
        const k1 = canonicalDerivatives(state, a, L);
        const s2 = {
            r: state.r + 0.5 * ds * k1.dr,
            theta: state.theta + 0.5 * ds * k1.dtheta,
            phi: state.phi + 0.5 * ds * k1.dphi,
            t: state.t + 0.5 * ds * k1.dt,
            pr: state.pr + 0.5 * ds * k1.dpr,
            ptheta: state.ptheta + 0.5 * ds * k1.dptheta
        };
        const k2 = canonicalDerivatives(s2, a, L);
        const s3 = {
            r: state.r + 0.5 * ds * k2.dr,
            theta: state.theta + 0.5 * ds * k2.dtheta,
            phi: state.phi + 0.5 * ds * k2.dphi,
            t: state.t + 0.5 * ds * k2.dt,
            pr: state.pr + 0.5 * ds * k2.dpr,
            ptheta: state.ptheta + 0.5 * ds * k2.dptheta
        };
        const k3 = canonicalDerivatives(s3, a, L);
        const s4 = {
            r: state.r + ds * k3.dr,
            theta: state.theta + ds * k3.dtheta,
            phi: state.phi + ds * k3.dphi,
            t: state.t + ds * k3.dt,
            pr: state.pr + ds * k3.dpr,
            ptheta: state.ptheta + ds * k3.dptheta
        };
        const k4 = canonicalDerivatives(s4, a, L);

        return {
            r: state.r + (ds / 6.0) * (k1.dr + 2.0 * k2.dr + 2.0 * k3.dr + k4.dr),
            theta: state.theta + (ds / 6.0) * (k1.dtheta + 2.0 * k2.dtheta + 2.0 * k3.dtheta + k4.dtheta),
            phi: state.phi + (ds / 6.0) * (k1.dphi + 2.0 * k2.dphi + 2.0 * k3.dphi + k4.dphi),
            t: state.t + (ds / 6.0) * (k1.dt + 2.0 * k2.dt + 2.0 * k3.dt + k4.dt),
            pr: state.pr + (ds / 6.0) * (k1.dpr + 2.0 * k2.dpr + 2.0 * k3.dpr + k4.dpr),
            ptheta: state.ptheta + (ds / 6.0) * (k1.dptheta + 2.0 * k2.dptheta + 2.0 * k3.dptheta + k4.dptheta)
        };
    };

    /* ---------- Numerical Geodesic Ray-Tracer ---------- */
    const traceRay = (alpha, beta, thetaObs, a, maxSteps = 450, rOut = 28.0) => {
        const clampedTheta = Math.max(0.05, Math.min(Math.PI - 0.05, thetaObs));
        const sinObs = Math.sin(clampedTheta);
        const cosObs = Math.cos(clampedTheta);
        const L = -alpha * sinObs;
        const Q = beta * beta + cosObs * cosObs * (alpha * alpha - a * a);

        const rObs = 40.0;
        const delObs = delta(rObs, a);
        const pObs = rObs * rObs + a * a - a * L;
        const radObs = (pObs * pObs) / delObs - (Q + Math.pow(L - a, 2.0));
        const prInit = -Math.sqrt(Math.max(0.0, radObs / delObs));

        let s = { r: rObs, theta: clampedTheta, phi: 0.0, t: 0.0, pr: prInit, ptheta: beta };
        const rPlus = horizon(a);
        const rIsco = isco(a, true);

        let numCrossings = 0;
        let firstHitR = 0.0;
        let firstHitG = 1.0;
        let totalRadiance = 0.0;

        for (let step = 0; step < maxSteps; step++) {
            if (s.r <= rPlus + 0.02) {
                return { hitHorizon: true, numCrossings, firstHitR, firstHitG, radiance: 0.0, finalR: s.r };
            }
            if (s.r >= rObs + 5.0 && s.pr > 0.0) {
                return { hitHorizon: false, numCrossings, firstHitR, firstHitG, radiance: totalRadiance, finalR: s.r };
            }

            const distH = Math.max(0.001, s.r - rPlus);
            const ds = Math.max(0.008, Math.min(0.24, 0.035 * distH + 0.015));

            const sNext = rk4Step(s, ds, a, L);

            // Equatorial crossing check (theta crosses pi/2)
            const cPrev = Math.cos(s.theta);
            const cNext = Math.cos(sNext.theta);
            if (cPrev * cNext <= 0.0 && s.r > rPlus) {
                const frac = Math.abs(cPrev) / Math.max(1e-6, Math.abs(cPrev - cNext));
                const hitR = s.r + (sNext.r - s.r) * frac;
                if (hitR >= rIsco && hitR <= rOut) {
                    numCrossings++;
                    const g = dopplerFactor(hitR, a, L);
                    const I_emit = diskRadiance(hitR, a);
                    const I_beamed = beamedRadiance(I_emit, g);
                    totalRadiance += I_beamed;
                    if (numCrossings === 1) {
                        firstHitR = hitR;
                        firstHitG = g;
                    }
                }
            }

            s = sNext;
        }

        return { hitHorizon: false, numCrossings, firstHitR, firstHitG, radiance: totalRadiance, finalR: s.r };
    };

    /* ---------- Telemetry Formatter ---------- */
    const formatTelemetry = (a, S0 = 100.0, atmVol = 0.22) => {
        const safeA = Math.max(-0.999, Math.min(0.999, a));
        const rPlus = horizon(safeA);
        const rIsco = isco(safeA, true);
        const rPh = photonOrbit(safeA, true);
        const gMax = dopplerFactor(rIsco, safeA, -1.5);
        const greeks = blackScholesGreeks(S0, S0, 0.20, 0.02, atmVol);
        const gammaPeak = greeks.gamma * 100.0;

        return {
            spin: safeA,
            horizonRadius: rPlus,
            iscoRadius: rIsco,
            photonOrbit: rPh,
            maxDoppler: gMax,
            gammaPeak,
            tagString: `Market Singularity · Kerr a = ${safeA >= 0 ? "+" : ""}${safeA.toFixed(2)} · r₊ = ${rPlus.toFixed(2)} r_g · r_isco = ${rIsco.toFixed(2)} r_g · g_max = ${gMax.toFixed(2)} · Γ_peak = ${gammaPeak.toFixed(1)} · Breeden–Litzenberger disk · click shocks regime`
        };
    };

    return {
        createPrng,
        fnv1a,
        sigma,
        delta,
        horizon,
        innerHorizon,
        ergosphere,
        photonOrbit,
        isco,
        frameDraggingOmega,
        keplerianOmega,
        fluidUt,
        dopplerFactor,
        beamedRadiance,
        pdfNormal,
        cdfNormal,
        erf,
        blackScholesGreeks,
        breedenLitzenberger,
        novikovThorneProfile,
        diskRadiance,
        conservedQuantities,
        hamiltonian,
        canonicalDerivatives,
        rk4Step,
        traceRay,
        formatTelemetry
    };
}));
