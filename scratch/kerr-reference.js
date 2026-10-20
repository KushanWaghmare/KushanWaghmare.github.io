/**
 * kerr-reference.js
 *
 * Physically grounded Kerr (spinning) black hole ray tracer reference implementation.
 * CPU reference in Node.js with double-precision arithmetic.
 *
 * Conventions & Units:
 *   - Units: G = c = M = 1 (geometrised units).
 *   - Metric: Kerr metric in Boyer–Lindquist coordinates (t, r, θ, φ) with signature (-, +, +, +).
 *   - Spin parameter: a = J/M ∈ [0, 1) (dimensionless spin).
 *   - Spin axis: site's +y axis (corresponding to the BL polar axis θ = 0).
 *   - Accretion disk: thin Novikov–Thorne disk in the equatorial plane (θ = π/2), prograde rotation (Ω > 0).
 *   - Observer: placed at (r_obs ≥ 50, θ_obs, φ_obs = 0) looking towards the black hole origin.
 *   - Screen coordinates: (α, β) Bardeen impact parameters.
 *       α: horizontal impact parameter perpendicular to the spin axis.
 *          α < 0 corresponds to the approaching (blueshifted) side of the prograde disk.
 *          α > 0 corresponds to the receding (redshifted) side.
 *       β: vertical impact parameter parallel to the spin axis.
 */

'use strict';

/**
 * Metric quantities in Boyer–Lindquist coordinates.
 */
const sigma = (r, theta, a) => {
    const cosT = Math.cos(theta);
    return r * r + a * a * cosT * cosT;
};

const delta = (r, a) => {
    return r * r - 2 * r + a * a;
};

const horizon = (a) => {
    if (Math.abs(a) > 1) {
        throw new Error(`Kerr spin |a| must be <= 1, got ${a}`);
    }
    return 1 + Math.sqrt(1 - a * a);
};

const innerHorizon = (a) => {
    if (Math.abs(a) > 1) {
        throw new Error(`Kerr spin |a| must be <= 1, got ${a}`);
    }
    return 1 - Math.sqrt(1 - a * a);
};

/**
 * Circular photon orbit radius r_ph.
 * For prograde: r_ph = 2 * [1 + cos((2/3) * arccos(-a))]
 * For retrograde: r_ph = 2 * [1 + cos((2/3) * arccos(a))]
 */
const photonOrbit = (a, prograde = true) => {
    const s = prograde ? -a : a;
    const clamped = Math.max(-1, Math.min(1, s));
    return 2 * (1 + Math.cos((2 / 3) * Math.acos(clamped)));
};

/**
 * Innermost Stable Circular Orbit (ISCO) radius.
 * r_isco = 3 + Z2 ∓ √((3 - Z1)(3 + Z1 + 2*Z2))
 * Upper sign (-) for prograde, lower sign (+) for retrograde.
 */
const isco = (a, prograde = true) => {
    const absA = Math.min(1, Math.abs(a));
    const term1 = Math.cbrt(1 + absA);
    const term2 = Math.cbrt(Math.max(0, 1 - absA));
    const z1 = 1 + Math.cbrt(Math.max(0, 1 - absA * absA)) * (term1 + term2);
    const z2 = Math.sqrt(3 * absA * absA + z1 * z1);
    const radical = Math.max(0, (3 - z1) * (3 + z1 + 2 * z2));
    const sign = prograde ? -1 : 1;
    return 3 + z2 + sign * Math.sqrt(radical);
};

/**
 * Keplerian orbital angular velocity Ω for equatorial circular prograde orbits:
 * Ω = 1 / (r^(3/2) + a)
 */
const keplerianOmega = (r, a) => {
    return 1 / (Math.pow(r, 1.5) + a);
};

/**
 * Four-velocity time component u^t for equatorial circular orbits:
 * u^t = 1 / √(-(g_tt + 2*g_tφ*Ω + g_φφ*Ω²))
 * At θ = π/2:
 *   g_tt = -(1 - 2/r)
 *   g_tφ = -2a/r
 *   g_φφ = r² + a² + 2a²/r
 */
const fourVelocityUt = (r, a) => {
    const omega = keplerianOmega(r, a);
    const g_tt = -(1 - 2 / r);
    const g_tphi = -2 * a / r;
    const g_phiphi = r * r + a * a + 2 * a * a / r;
    const denom = -(g_tt + 2 * g_tphi * omega + g_phiphi * omega * omega);
    if (denom <= 0) return 0;
    return 1 / Math.sqrt(denom);
};

/**
 * Gravitational redshift and Doppler factor:
 * g = E_obs / E_em = 1 / (u^t * (1 - Ω * L))
 */
const redshiftFactor = (r, a, L) => {
    const ut = fourVelocityUt(r, a);
    if (ut <= 0) return 0;
    const omega = keplerianOmega(r, a);
    const factor = ut * (1 - omega * L);
    if (factor <= 0) return 0;
    return 1 / factor;
};

/**
 * Page–Thorne (1974) radiative flux F(r) for a Kerr thin accretion disk
 * with zero-torque inner boundary condition at the ISCO.
 * Normalized such that prefactor 3*Mdot/(8*pi) = 1.
 */
const pageThorneFlux = (r, a) => {
    const rIn = isco(a, true);
    if (r <= rIn) return 0;

    const x = Math.sqrt(r);
    const x0 = Math.sqrt(rIn);

    // Schwarzschild limit (a = 0)
    if (Math.abs(a) < 1e-7) {
        const sq3 = Math.sqrt(3);
        const sq6 = Math.sqrt(6);
        const logArg = ((x - sq3) / (x + sq3)) * ((sq6 + sq3) / (sq6 - sq3));
        if (logArg <= 0) return 0;
        const j = x - sq6 - (sq3 / 2) * Math.log(logArg);
        const denom = (r * r * r) * (1 - 3 / r);
        if (denom <= 0) return 0;
        return Math.max(0, j / denom);
    }

    // Kerr case: roots of x³ - 3x + 2a = 0
    const clampedA = Math.max(-1, Math.min(1, a));
    const psi = Math.acos(clampedA) / 3;
    const x1 = 2 * Math.cos(psi - Math.PI / 3);
    const x2 = 2 * Math.cos(psi + Math.PI / 3);
    const x3 = -2 * Math.cos(psi);

    const roots = [x1, x2, x3];
    let sumTerms = 0;
    for (let i = 0; i < 3; i++) {
        const xi = roots[i];
        const xj = roots[(i + 1) % 3];
        const xk = roots[(i + 2) % 3];
        const num = 3 * (xi - a) * (xi - a);
        const den = xi * (xi - xj) * (xi - xk);
        const ratio = (x - xi) / (x0 - xi);
        if (ratio > 0) {
            sumTerms += (num / den) * Math.log(ratio);
        }
    }

    const j = x - x0 - 1.5 * a * Math.log(x / x0) - sumTerms;
    const denom = x * x * x * x * (x * x * x - 3 * x + 2 * a);
    if (denom <= 0) return 0;
    return Math.max(0, j / denom);
};

/**
 * Super-Hamiltonian H for null geodesics:
 * 2Σ * H = Δ*p_r² + p_θ² + (L - a*sin²θ)² / sin²θ - (r² + a² - a*L)² / Δ = 0
 */
const hamiltonian = (r, theta, pr, ptheta, a, L) => {
    const sig = sigma(r, theta, a);
    const del = delta(r, a);
    const rawSinT = Math.sin(theta);
    const sinT = Math.abs(rawSinT) < 1e-7 ? (rawSinT >= 0 ? 1e-7 : -1e-7) : rawSinT;
    if (Math.abs(del) < 1e-12) return 0;

    const p = r * r + a * a - a * L;
    const termTheta = Math.pow(L - a * sinT * sinT, 2) / (sinT * sinT);
    const h0 = del * pr * pr + ptheta * ptheta + termTheta - (p * p) / del;
    return h0 / (2 * sig);
};

/**
 * Carter's constant of motion Q:
 * Q = p_θ² + cos²θ * (L² / sin²θ - a²)
 */
const carterQ = (theta, ptheta, a, L) => {
    const rawSinT = Math.sin(theta);
    const sinT = Math.abs(rawSinT) < 1e-7 ? (rawSinT >= 0 ? 1e-7 : -1e-7) : rawSinT;
    const cosT = Math.cos(theta);
    return ptheta * ptheta + cosT * cosT * ((L * L) / (sinT * sinT) - a * a);
};

/**
 * Canonical equations of motion derived from the Hamiltonian:
 * dr/dλ = ∂H/∂p_r = Δ*p_r / Σ
 * dθ/dλ = ∂H/∂p_θ = p_θ / Σ
 * dφ/dλ = ∂H/∂L = ( (L - a*sin²θ)/sin²θ + a*P/Δ ) / Σ
 * dt/dλ = ( a*(L - a*sin²θ) + (r² + a²)*P/Δ ) / Σ
 * dp_r/dλ = -∂H/∂r
 * dp_θ/dλ = -∂H/∂θ
 */
const canonicalDerivatives = (state, a, L) => {
    const { r, theta, pr, ptheta } = state;
    const sig = sigma(r, theta, a);
    const del = delta(r, a);

    const rawSinT = Math.sin(theta);
    const sinT = Math.abs(rawSinT) < 1e-7 ? (rawSinT >= 0 ? 1e-7 : -1e-7) : rawSinT;
    const cosT = Math.cos(theta);
    const p = r * r + a * a - a * L;

    // Exact value of H along trajectory
    const h = hamiltonian(r, theta, pr, ptheta, a, L);

    // dr/dlambda, dtheta/dlambda
    const dr = (del * pr) / sig;
    const dtheta = ptheta / sig;

    // dphi/dlambda, dt/dlambda
    const sinT2 = sinT * sinT;
    const angPart = (L - a * sinT2) / sinT2;
    const dphi = (angPart + (a * p) / del) / sig;
    const dt = (a * (L - a * sinT2) + ((r * r + a * a) * p) / del) / sig;

    // dp_r/dlambda = -∂H/∂r = -(1 / 2Σ) ∂H0/∂r + (H / Σ) ∂Σ/∂r
    const delPrime = 2 * (r - 1);
    const pPrime = 2 * r;
    const dH0_dr = delPrime * pr * pr - (2 * p * pPrime * del - p * p * delPrime) / (del * del);
    const dsig_dr = 2 * r;
    const dpr = -dH0_dr / (2 * sig) + (h / sig) * dsig_dr;

    // dp_θ/dlambda = -∂H/∂θ = -(1 / 2Σ) ∂H0/∂θ + (H / Σ) ∂Σ/∂θ
    const dH0_dtheta = -2 * cosT * ((L * L) / (sinT2 * sinT) - a * a * sinT);
    const dsig_dtheta = -a * a * Math.sin(2 * theta);
    const dptheta = -dH0_dtheta / (2 * sig) + (h / sig) * dsig_dtheta;

    return { dr, dtheta, dphi, dt, dpr, dptheta, h };
};

/**
 * Bardeen initialisation for a distant observer at (r_obs ≥ 50, θ_obs).
 * Screen impact parameters (α, β):
 *   L = -α * sin(θ_obs)
 *   Q = β² + (α² - a²) * cos²(θ_obs)
 *   p_θ = β
 *   p_r = -√[ (P² / Δ - (Q + (L - a)²)) / Δ ]
 */
const bardeenRayInit = (alpha, beta, r_obs, theta_obs, a) => {
    // Clamping θ_obs to [0.05, π - 0.05] as required to handle polar axis safely
    const clampedTheta = Math.max(0.05, Math.min(Math.PI - 0.05, theta_obs));
    const sinObs = Math.sin(clampedTheta);
    const cosObs = Math.cos(clampedTheta);

    const L = -alpha * sinObs;
    const Q = beta * beta + (alpha * alpha - a * a) * cosObs * cosObs;

    const del = delta(r_obs, a);
    const p = r_obs * r_obs + a * a - a * L;

    const rad = (p * p) / del - (Q + Math.pow(L - a, 2));
    const prSq = rad / del;
    const pr = -Math.sqrt(Math.max(0, prSq));
    const ptheta = beta;

    return {
        state: {
            r: r_obs,
            theta: clampedTheta,
            phi: 0,
            t: 0,
            pr,
            ptheta
        },
        L,
        Q
    };
};

/**
 * 4th-order Runge–Kutta step.
 */
const rk4Step = (s, dt, a, L) => {
    const k1 = canonicalDerivatives(s, a, L);
    const s2 = {
        r: s.r + 0.5 * dt * k1.dr,
        theta: s.theta + 0.5 * dt * k1.dtheta,
        phi: s.phi + 0.5 * dt * k1.dphi,
        t: s.t + 0.5 * dt * k1.dt,
        pr: s.pr + 0.5 * dt * k1.dpr,
        ptheta: s.ptheta + 0.5 * dt * k1.dptheta
    };
    const k2 = canonicalDerivatives(s2, a, L);
    const s3 = {
        r: s.r + 0.5 * dt * k2.dr,
        theta: s.theta + 0.5 * dt * k2.dtheta,
        phi: s.phi + 0.5 * dt * k2.dphi,
        t: s.t + 0.5 * dt * k2.dt,
        pr: s.pr + 0.5 * dt * k2.dpr,
        ptheta: s.ptheta + 0.5 * dt * k2.dptheta
    };
    const k3 = canonicalDerivatives(s3, a, L);
    const s4 = {
        r: s.r + dt * k3.dr,
        theta: s.theta + dt * k3.dtheta,
        phi: s.phi + dt * k3.dphi,
        t: s.t + dt * k3.dt,
        pr: s.pr + dt * k3.dpr,
        ptheta: s.ptheta + dt * k3.dptheta
    };
    const k4 = canonicalDerivatives(s4, a, L);

    return {
        r: s.r + (dt / 6) * (k1.dr + 2 * k2.dr + 2 * k3.dr + k4.dr),
        theta: s.theta + (dt / 6) * (k1.dtheta + 2 * k2.dtheta + 2 * k3.dtheta + k4.dtheta),
        phi: s.phi + (dt / 6) * (k1.dphi + 2 * k2.dphi + 2 * k3.dphi + k4.dphi),
        t: s.t + (dt / 6) * (k1.dt + 2 * k2.dt + 2 * k3.dt + k4.dt),
        pr: s.pr + (dt / 6) * (k1.dpr + 2 * k2.dpr + 2 * k3.dpr + k4.dpr),
        ptheta: s.ptheta + (dt / 6) * (k1.dptheta + 2 * k2.dptheta + 2 * k3.dptheta + k4.dptheta)
    };
};

/**
 * Adaptive RK4 step with error estimation and conservation control.
 */
const adaptiveRk4Step = (s, dtTarget, a, L, Q0, tol = 1e-8) => {
    let dt = dtTarget;
    for (let tryCount = 0; tryCount < 8; tryCount++) {
        const s1 = rk4Step(s, dt, a, L);
        const sHalf = rk4Step(s, 0.5 * dt, a, L);
        const s2 = rk4Step(sHalf, 0.5 * dt, a, L);

        const errR = Math.abs(s2.r - s1.r);
        const errT = Math.abs(s2.theta - s1.theta);
        const errPr = Math.abs(s2.pr - s1.pr);
        const errPt = Math.abs(s2.ptheta - s1.ptheta);
        const q2 = carterQ(s2.theta, s2.ptheta, a, L);
        const errQ = Math.abs(q2 - Q0);
        const maxErr = Math.max(errR, errT, errPr, errPt, errQ * 0.05);

        if (maxErr < tol || dt < 1e-5) {
            const factor = maxErr > 0 ? Math.max(0.2, Math.min(2.0, 0.9 * Math.pow(tol / maxErr, 0.2))) : 1.5;
            return { s: s2, nextDt: dt * factor, dtUsed: dt };
        }
        dt *= Math.max(0.1, 0.85 * Math.pow(tol / maxErr, 0.2));
    }
    return { s: rk4Step(s, dt, a, L), nextDt: dt, dtUsed: dt };
};

/**
 * Refines equatorial crossing (θ = π/2) using secant iteration.
 */
const refineEquatorialCrossing = (sPrev, sNext, a, L, dt) => {
    let s0 = sPrev;
    let s1 = sNext;
    let c0 = Math.cos(s0.theta);
    let c1 = Math.cos(s1.theta);

    for (let iter = 0; iter < 4; iter++) {
        const denom = c0 - c1;
        if (Math.abs(denom) < 1e-15) break;
        const frac = c0 / denom;
        const stepSize = frac * dt;
        const sMid = rk4Step(s0, stepSize, a, L);
        const cMid = Math.cos(sMid.theta);
        if (Math.abs(cMid) < 1e-12) return sMid;
        if (c0 * cMid <= 0) {
            s1 = sMid;
            c1 = cMid;
        } else {
            s0 = sMid;
            c0 = cMid;
        }
    }
    const frac = Math.abs(c0) / (Math.abs(c0) + Math.abs(c1));
    return {
        r: s0.r + frac * (s1.r - s0.r),
        theta: Math.PI / 2,
        phi: s0.phi + frac * (s1.phi - s0.phi),
        t: s0.t + frac * (s1.t - s0.t),
        pr: s0.pr + frac * (s1.pr - s0.pr),
        ptheta: s0.ptheta + frac * (s1.ptheta - s0.ptheta)
    };
};

/**
 * Full ray tracer tracing a single screen ray backwards in time.
 */
const traceRay = (alpha, beta, opts = {}) => {
    const a = opts.a ?? 0.9;
    const r_obs = opts.r_obs ?? 50.0;
    const theta_obs = opts.theta_obs ?? (80 * Math.PI) / 180;
    const r_out = opts.r_out ?? 25.0;
    const maxSteps = opts.maxSteps ?? 5000;
    const stepScale = opts.stepScale ?? 1.0;
    const epsilonHorizon = opts.epsilonHorizon ?? 0.02;
    const useAdaptive = opts.useAdaptive ?? false;
    const tol = opts.tol ?? 1e-8;

    const r_plus = horizon(a);
    const r_isco = isco(a, true);
    const { state: initS, L, Q } = bardeenRayInit(alpha, beta, r_obs, theta_obs, a);

    let s = initS;
    let maxH = 0;
    let maxQDrift = 0;
    let status = 'in_flight';
    const diskCrossings = [];
    let curDt = 0.12 * stepScale;

    for (let step = 0; step < maxSteps; step++) {
        let sNext;
        let dtUsed;

        if (useAdaptive) {
            const res = adaptiveRk4Step(s, curDt, a, L, Q, tol);
            sNext = res.s;
            dtUsed = res.dtUsed;
            curDt = res.nextDt;
        } else {
            const distH = Math.max(0.001, s.r - r_plus);
            const baseDt = Math.max(0.005, Math.min(0.2, 0.02 * distH + 0.01));
            dtUsed = baseDt * stepScale;
            sNext = rk4Step(s, dtUsed, a, L);
        }

        // Conservation metrics
        const d = canonicalDerivatives(sNext, a, L);
        maxH = Math.max(maxH, Math.abs(d.h));
        const curQ = carterQ(sNext.theta, sNext.ptheta, a, L);
        maxQDrift = Math.max(maxQDrift, Math.abs(curQ - Q));

        // Equatorial crossing detection (θ = π/2)
        const cPrev = Math.cos(s.theta);
        const cNext = Math.cos(sNext.theta);
        if (cPrev * cNext <= 0 && s.r > r_plus) {
            const refined = refineEquatorialCrossing(s, sNext, a, L, dtUsed);
            if (refined.r >= r_isco && refined.r <= r_out) {
                const g = redshiftFactor(refined.r, a, L);
                const flux = pageThorneFlux(refined.r, a);
                diskCrossings.push({
                    order: diskCrossings.length + 1,
                    r: refined.r,
                    phi: refined.phi,
                    t: refined.t,
                    g,
                    flux
                });
            }
        }

        s = sNext;

        // Termination conditions
        if (s.r <= r_plus + epsilonHorizon) {
            status = 'captured';
            break;
        }
        if (s.r >= r_obs + 5 && s.pr > 0) {
            status = 'escaped';
            break;
        }
    }

    return {
        status,
        finalState: s,
        L,
        Q,
        maxH,
        maxQDrift,
        diskCrossings
    };
};

module.exports = {
    sigma,
    delta,
    horizon,
    innerHorizon,
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
    adaptiveRk4Step,
    refineEquatorialCrossing,
    traceRay
};
