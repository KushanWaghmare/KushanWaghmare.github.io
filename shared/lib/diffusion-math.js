/**
 * diffusion-math.js
 *
 * Exact closed-form mathematics for score-based generative diffusion in 3-D.
 * Implements a Variance-Preserving (VP) Stochastic Differential Equation (SDE)
 * with an analytic Gaussian mixture score function (Song et al. 2020 / Anderson 1982).
 *
 * Pure UMD module (Node.js & browser), zero dependencies, deterministic via mulberry32.
 */

(function (root, factory) {
    if (typeof module === "object" && module.exports) {
        module.exports = factory();
    } else {
        root.DiffusionMath = factory();
    }
}(typeof self !== "undefined" ? self : this, function () {
    "use strict";

    /* =========================================================================
       1. Deterministic PRNG & Normal Sampler (mulberry32 + Box-Muller)
       ========================================================================= */

    function mulberry32(seed) {
        let a = (seed >>> 0) || 1;
        return function () {
            a |= 0;
            a = (a + 0x6D2B79F5) | 0;
            let t = Math.imul(a ^ (a >>> 15), 1 | a);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }

    function createNormalSampler(rng) {
        let hasSpare = false;
        let spare = 0;
        return function () {
            if (hasSpare) {
                hasSpare = false;
                return spare;
            }
            let u = 0, v = 0;
            while (u === 0) u = rng();
            while (v === 0) v = rng();
            const r = Math.sqrt(-2.0 * Math.log(u));
            const theta = 2.0 * Math.PI * v;
            spare = r * Math.sin(theta);
            hasSpare = true;
            return r * Math.cos(theta);
        };
    }

    /* =========================================================================
       2. Variance-Preserving SDE Schedule
       ========================================================================= */

    const BETA_MIN = 0.1;
    const BETA_MAX = 20.0;
    const EPSILON = 1e-3;

    function beta(t) {
        return BETA_MIN + t * (BETA_MAX - BETA_MIN);
    }

    function alpha(t) {
        // Integral of beta(tau) from 0 to t is beta_min * t + 0.5 * (beta_max - beta_min) * t^2
        const exponent = -0.5 * BETA_MIN * t - 0.25 * (BETA_MAX - BETA_MIN) * t * t;
        return Math.exp(exponent);
    }

    function sigma2(t) {
        const a = alpha(t);
        return Math.max(0.0, 1.0 - a * a);
    }

    function sigma(t) {
        return Math.sqrt(sigma2(t));
    }

    /**
     * Exact transition kernel from s to t (s < t):
     * x_t = (alpha_t / alpha_s) * x_s + sqrt(sigma_t^2 - (alpha_t / alpha_s)^2 * sigma_s^2) * eps
     */
    function transitionParams(s, t) {
        if (s <= 0) {
            const at = alpha(t);
            const st = sigma(t);
            return { meanCoeff: at, std: st, var: st * st };
        }
        const as_ = alpha(s);
        const at = alpha(t);
        const gamma = at / as_;
        const varTrans = Math.max(0.0, sigma2(t) - gamma * gamma * sigma2(s));
        return {
            meanCoeff: gamma,
            var: varTrans,
            std: Math.sqrt(varTrans)
        };
    }

    /* =========================================================================
       3. Target Gaussian Mixtures (K <= 192, normalised into [-1.5, 1.5]^3)
       ========================================================================= */

    /**
     * Target 1: Two-arm logarithmic spiral galaxy disk in 3-D.
     * Components are placed symmetrically on two spiralling arms with subtle vertical flare.
     */
    function getGalaxyTarget(K = 192) {
        const half = Math.floor(K / 2);
        const means = [];
        const stds = [];
        const weights = [];
        const w = 1.0 / (2 * half);

        for (let arm = 0; arm < 2; arm++) {
            const phase = arm * Math.PI;
            for (let i = 0; i < half; i++) {
                const u = (i + 0.5) / half; // [0.005, 0.995]
                const r = 0.22 + 1.15 * Math.sqrt(u); // radial distance in [0.22, 1.37]
                const theta = 2.85 * Math.pow(u, 0.85) + phase;
                const x = r * Math.cos(theta);
                const y = 0.16 * (1.0 - u * 0.7) * Math.sin(3.0 * theta);
                const z = r * Math.sin(theta);
                means.push([x, y, z]);
                stds.push(0.045);
                weights.push(w);
            }
        }

        return { name: "Two-arm spiral galaxy disk", K: means.length, means, stds, weights };
    }

    /**
     * Target 2: Trefoil knot tube in 3-D.
     * Parametric (2,3)-torus knot normalised strictly within [-1.35, 1.35]^3.
     */
    function getTrefoilTarget(K = 192) {
        const means = [];
        const stds = [];
        const weights = [];
        const w = 1.0 / K;
        const scale = 0.45; // Maximum unscaled radius is 3.0; 0.45 * 3.0 = 1.35

        for (let i = 0; i < K; i++) {
            const phi = (2.0 * Math.PI * i) / K;
            const x = scale * (Math.sin(phi) + 2.0 * Math.sin(2.0 * phi));
            const y = scale * (Math.cos(phi) - 2.0 * Math.cos(2.0 * phi));
            const z = scale * (-Math.sin(3.0 * phi));
            means.push([x, y, z]);
            stds.push(0.040);
            weights.push(w);
        }

        return { name: "Trefoil knot tube", K, means, stds, weights };
    }

    /**
     * Target 3: Torus in 3-D.
     * Major radius R = 1.02, minor radius r = 0.40, wound in a dense (1, 3) toroidal spiral.
     */
    function getTorusTarget(K = 192) {
        const means = [];
        const stds = [];
        const weights = [];
        const w = 1.0 / K;
        const R = 1.02;
        const r = 0.40;

        for (let i = 0; i < K; i++) {
            const u = (2.0 * Math.PI * i) / K;
            const v = 3.0 * u;
            const x = (R + r * Math.cos(v)) * Math.cos(u);
            const y = r * Math.sin(v);
            const z = (R + r * Math.cos(v)) * Math.sin(u);
            means.push([x, y, z]);
            stds.push(0.042);
            weights.push(w);
        }

        return { name: "Torus manifold", K, means, stds, weights };
    }

    function getTarget(name = "galaxy", K = 192) {
        if (name === "trefoil") return getTrefoilTarget(K);
        if (name === "torus") return getTorusTarget(K);
        return getGalaxyTarget(K);
    }

    /* =========================================================================
       4. Marginal Distribution, Responsibilities & Closed-Form Score
       ========================================================================= */

    /**
     * Evaluates unnormalised log responsibilities:
     * c_k = log(w_k) - (d/2) * log(v_k) - ||x - alpha_t * mu_k||^2 / (2 * v_k)
     * where v_k = alpha_t^2 * s_k^2 + sigma_t^2, d = 3.
     */
    function logResponsibilities(x, t, target) {
        const at = alpha(t);
        const at2 = at * at;
        const st2 = sigma2(t);
        const K = target.K;
        const c = new Float64Array(K);
        let maxC = -Infinity;

        for (let k = 0; k < K; k++) {
            const mu = target.means[k];
            const sk2 = target.stds[k] * target.stds[k];
            const vk = at2 * sk2 + st2;
            const dx = x[0] - at * mu[0];
            const dy = x[1] - at * mu[1];
            const dz = x[2] - at * mu[2];
            const distSq = dx * dx + dy * dy + dz * dz;

            // log(w_k) - 1.5 * log(v_k) - distSq / (2.0 * v_k)
            const logW = Math.log(target.weights[k]);
            const val = logW - 1.5 * Math.log(vk) - distSq / (2.0 * vk);
            c[k] = val;
            if (val > maxC) maxC = val;
        }

        return { c, maxC };
    }

    /**
     * Closed-form score: nabla log p_t(x) = sum_k r_k(x) * (alpha_t * mu_k - x) / v_k
     */
    function score(x, t, target) {
        const at = alpha(t);
        const at2 = at * at;
        const st2 = sigma2(t);
        const K = target.K;
        const { c, maxC } = logResponsibilities(x, t, target);

        // Softmax with log-sum-exp
        let sumExp = 0.0;
        const r = new Float64Array(K);
        for (let k = 0; k < K; k++) {
            const expVal = Math.exp(c[k] - maxC);
            r[k] = expVal;
            sumExp += expVal;
        }
        const invSum = 1.0 / sumExp;

        let sx = 0.0, sy = 0.0, sz = 0.0;
        for (let k = 0; k < K; k++) {
            const rk = r[k] * invSum;
            const mu = target.means[k];
            const sk2 = target.stds[k] * target.stds[k];
            const vk = at2 * sk2 + st2;
            const invVk = 1.0 / vk;

            sx += rk * (at * mu[0] - x[0]) * invVk;
            sy += rk * (at * mu[1] - x[1]) * invVk;
            sz += rk * (at * mu[2] - x[2]) * invVk;
        }

        return [sx, sy, sz];
    }

    /**
     * Exact marginal log density log p_t(x) evaluated via log-sum-exp.
     * log p_t(x) = -1.5 * log(2 * pi) + maxC + log(sum_k exp(c_k - maxC))
     */
    function logDensity(x, t, target) {
        const { c, maxC } = logResponsibilities(x, t, target);
        const K = target.K;
        let sumExp = 0.0;
        for (let k = 0; k < K; k++) {
            sumExp += Math.exp(c[k] - maxC);
        }
        const LOG_2PI_1_5 = 1.5 * Math.log(2.0 * Math.PI);
        return maxC + Math.log(sumExp) - LOG_2PI_1_5;
    }

    /**
     * Exact closed-form mixture moments at time t:
     * Mean m_t = sum_k w_k * alpha_t * mu_k
     * Covariance Sigma_t = sum_k w_k * [v_k * I + alpha_t^2 * (mu_k - m_0)(mu_k - m_0)^T]
     */
    function marginalMoments(t, target) {
        const at = alpha(t);
        const at2 = at * at;
        const st2 = sigma2(t);
        const K = target.K;

        // Base mixture mean m_0
        let m0x = 0, m0y = 0, m0z = 0;
        for (let k = 0; k < K; k++) {
            const w = target.weights[k];
            const mu = target.means[k];
            m0x += w * mu[0];
            m0y += w * mu[1];
            m0z += w * mu[2];
        }

        const mt = [at * m0x, at * m0y, at * m0z];

        // Covariance 3x3
        const cov = [
            [0, 0, 0],
            [0, 0, 0],
            [0, 0, 0]
        ];

        for (let k = 0; k < K; k++) {
            const w = target.weights[k];
            const mu = target.means[k];
            const sk2 = target.stds[k] * target.stds[k];
            const vk = at2 * sk2 + st2;

            const dx = mu[0] - m0x;
            const dy = mu[1] - m0y;
            const dz = mu[2] - m0z;

            cov[0][0] += w * (vk + at2 * dx * dx);
            cov[0][1] += w * (at2 * dx * dy);
            cov[0][2] += w * (at2 * dx * dz);

            cov[1][0] += w * (at2 * dy * dx);
            cov[1][1] += w * (vk + at2 * dy * dy);
            cov[1][2] += w * (at2 * dy * dz);

            cov[2][0] += w * (at2 * dz * dx);
            cov[2][1] += w * (at2 * dz * dy);
            cov[2][2] += w * (vk + at2 * dz * dz);
        }

        return { mean: mt, cov };
    }

    /* =========================================================================
       5. Sampling & Trajectory Steppers (Forward, Transition, Reverse SDE & ODE)
       ========================================================================= */

    /**
     * Exact sampling from target mixture p_0.
     */
    function sampleP0(target, numSamples, rng) {
        const normal = createNormalSampler(rng);
        const samples = new Float64Array(numSamples * 3);
        const K = target.K;

        // Cumulative weights for categorical sampling
        const cdf = new Float64Array(K);
        let cum = 0;
        for (let k = 0; k < K; k++) {
            cum += target.weights[k];
            cdf[k] = cum;
        }

        for (let i = 0; i < numSamples; i++) {
            const u = rng();
            let k = 0;
            while (k < K - 1 && u > cdf[k]) k++;

            const mu = target.means[k];
            const s = target.stds[k];
            const idx = i * 3;
            samples[idx]     = mu[0] + s * normal();
            samples[idx + 1] = mu[1] + s * normal();
            samples[idx + 2] = mu[2] + s * normal();
        }

        return samples;
    }

    /**
     * Exact forward kernel: x_t = alpha_t * x_0 + sigma_t * eps
     */
    function forwardStepExact(x0, t, normal) {
        const at = alpha(t);
        const st = sigma(t);
        const n = x0.length / 3;
        const xt = new Float64Array(x0.length);
        for (let i = 0; i < n; i++) {
            const idx = i * 3;
            xt[idx]     = at * x0[idx]     + st * normal();
            xt[idx + 1] = at * x0[idx + 1] + st * normal();
            xt[idx + 2] = at * x0[idx + 2] + st * normal();
        }
        return xt;
    }

    /**
     * Exact transition from s to t (s < t):
     * x_t = gamma * x_s + sigma_{t|s} * eps
     */
    function transitionStepExact(xs, s, t, normal) {
        const tp = transitionParams(s, t);
        const gamma = tp.meanCoeff;
        const std = tp.std;
        const n = xs.length / 3;
        const xt = new Float64Array(xs.length);
        for (let i = 0; i < n; i++) {
            const idx = i * 3;
            xt[idx]     = gamma * xs[idx]     + std * normal();
            xt[idx + 1] = gamma * xs[idx + 1] + std * normal();
            xt[idx + 2] = gamma * xs[idx + 2] + std * normal();
        }
        return xt;
    }

    /**
     * Forward Euler-Maruyama SDE simulation from 0 to tTarget.
     */
    function forwardSDE(x0, tTarget, numSteps, rng) {
        const normal = createNormalSampler(rng);
        const dt = tTarget / numSteps;
        const sqrtDt = Math.sqrt(dt);
        const n = x0.length / 3;
        const x = new Float64Array(x0);

        for (let step = 0; step < numSteps; step++) {
            const t = step * dt;
            const b = beta(t);
            const driftCoeff = -0.5 * b * dt;
            const diffCoeff = Math.sqrt(b) * sqrtDt;

            for (let i = 0; i < n; i++) {
                const idx = i * 3;
                x[idx]     += driftCoeff * x[idx]     + diffCoeff * normal();
                x[idx + 1] += driftCoeff * x[idx + 1] + diffCoeff * normal();
                x[idx + 2] += driftCoeff * x[idx + 2] + diffCoeff * normal();
            }
        }

        return x;
    }

    /**
     * Reverse SDE: dx = [-0.5 * beta * x - beta * nabla log p_t(x)] dt + sqrt(beta) * dW_bar
     * Stepped backwards with Euler-Maruyama from t = 1 to EPSILON in numSteps.
     */
    function reverseSDE(x1, numSteps, target, rng) {
        const normal = createNormalSampler(rng);
        const dt = (1.0 - EPSILON) / numSteps;
        const sqrtDt = Math.sqrt(dt);
        const n = x1.length / 3;
        const x = new Float64Array(x1);

        for (let step = 0; step < numSteps; step++) {
            const t = 1.0 - step * dt;
            const b = beta(t);

            for (let i = 0; i < n; i++) {
                const idx = i * 3;
                const pos = [x[idx], x[idx + 1], x[idx + 2]];
                const sc = score(pos, t, target);

                // Backward step: x(t - dt) = x(t) - drift * dt + diff * sqrt(dt) * noise
                const driftX = -0.5 * b * pos[0] - b * sc[0];
                const driftY = -0.5 * b * pos[1] - b * sc[1];
                const driftZ = -0.5 * b * pos[2] - b * sc[2];

                const diff = Math.sqrt(b) * sqrtDt;

                x[idx]     -= driftX * dt - diff * normal();
                x[idx + 1] -= driftY * dt - diff * normal();
                x[idx + 2] -= driftZ * dt - diff * normal();
            }
        }

        return x;
    }

    /**
     * Probability-flow ODE: dx = [-0.5 * beta * x - 0.5 * beta * nabla log p_t(x)] dt
     */
    function reverseODE(x1, numSteps, target) {
        const dt = (1.0 - EPSILON) / numSteps;
        const n = x1.length / 3;
        const x = new Float64Array(x1);

        for (let step = 0; step < numSteps; step++) {
            const t = 1.0 - step * dt;
            const b = beta(t);

            for (let i = 0; i < n; i++) {
                const idx = i * 3;
                const pos = [x[idx], x[idx + 1], x[idx + 2]];
                const sc = score(pos, t, target);

                const driftX = -0.5 * b * pos[0] - 0.5 * b * sc[0];
                const driftY = -0.5 * b * pos[1] - 0.5 * b * sc[1];
                const driftZ = -0.5 * b * pos[2] - 0.5 * b * sc[2];

                x[idx]     -= driftX * dt;
                x[idx + 1] -= driftY * dt;
                x[idx + 2] -= driftZ * dt;
            }
        }

        return x;
    }

    /**
     * Per-particle re-noising:
     * Particles within radius of centre are re-noised to targetTime = 0.5 using
     * the exact transition kernel from their current time t_k.
     */
    function renoiseParticles(particles, currentTimes, targetTime = 0.5, centre = [0, 0, 0], radius = 0.65, rng) {
        const normal = createNormalSampler(rng);
        const n = particles.length / 3;
        const r2 = radius * radius;
        const updated = new Uint8Array(n);

        for (let i = 0; i < n; i++) {
            const idx = i * 3;
            const dx = particles[idx]     - centre[0];
            const dy = particles[idx + 1] - centre[1];
            const dz = particles[idx + 2] - centre[2];

            if (dx * dx + dy * dy + dz * dz <= r2) {
                const s = currentTimes[i];
                if (s < targetTime) {
                    const tp = transitionParams(s, targetTime);
                    particles[idx]     = tp.meanCoeff * particles[idx]     + tp.std * normal();
                    particles[idx + 1] = tp.meanCoeff * particles[idx + 1] + tp.std * normal();
                    particles[idx + 2] = tp.meanCoeff * particles[idx + 2] + tp.std * normal();
                    currentTimes[i] = targetTime;
                    updated[i] = 1;
                }
            }
        }

        return updated;
    }

    /* =========================================================================
       6. Evaluation Metrics: Moments, NLL Readout, Sliced Wasserstein
       ========================================================================= */

    /**
     * Empirical mean and 3x3 covariance of a flat particle buffer (length = 3*n).
     */
    function empiricalMoments(particles) {
        const n = particles.length / 3;
        let mx = 0, my = 0, mz = 0;
        for (let i = 0; i < n; i++) {
            const idx = i * 3;
            mx += particles[idx];
            my += particles[idx + 1];
            mz += particles[idx + 2];
        }
        mx /= n; my /= n; mz /= n;

        const cov = [
            [0, 0, 0],
            [0, 0, 0],
            [0, 0, 0]
        ];

        for (let i = 0; i < n; i++) {
            const idx = i * 3;
            const dx = particles[idx]     - mx;
            const dy = particles[idx + 1] - my;
            const dz = particles[idx + 2] - mz;

            cov[0][0] += dx * dx;
            cov[0][1] += dx * dy;
            cov[0][2] += dx * dz;

            cov[1][0] += dy * dx;
            cov[1][1] += dy * dy;
            cov[1][2] += dy * dz;

            cov[2][0] += dz * dx;
            cov[2][1] += dz * dy;
            cov[2][2] += dz * dz;
        }

        const invN = 1.0 / (n - 1);
        for (let r = 0; r < 3; r++) {
            for (let c = 0; c < 3; c++) {
                cov[r][c] *= invN;
            }
        }

        return { mean: [mx, my, mz], cov };
    }

    /**
     * Readout metric: Mean Negative Log-Likelihood (NLL) of particles under target p_0.
     */
    function readoutNLL(particles, target) {
        const n = particles.length / 3;
        let sumNLL = 0.0;
        for (let i = 0; i < n; i++) {
            const idx = i * 3;
            const lp = logDensity([particles[idx], particles[idx + 1], particles[idx + 2]], 0.0, target);
            sumNLL -= lp;
        }
        return sumNLL / n;
    }

    /**
     * Sliced Wasserstein-1 distance (SW-1) across numProjections random 3-D directions.
     */
    function slicedWasserstein1(samplesA, samplesB, numProjections = 64, rng) {
        const normal = createNormalSampler(rng);
        const na = samplesA.length / 3;
        const nb = samplesB.length / 3;
        const n = Math.min(na, nb);

        const projA = new Float64Array(n);
        const projB = new Float64Array(n);
        let totalW1 = 0.0;

        for (let p = 0; p < numProjections; p++) {
            // Sample uniform direction on S^2
            let z1 = normal(), z2 = normal(), z3 = normal();
            const norm = Math.hypot(z1, z2, z3) || 1.0;
            const thx = z1 / norm, thy = z2 / norm, thz = z3 / norm;

            for (let i = 0; i < n; i++) {
                const ia = i * 3;
                const ib = i * 3;
                projA[i] = samplesA[ia] * thx + samplesA[ia + 1] * thy + samplesA[ia + 2] * thz;
                projB[i] = samplesB[ib] * thx + samplesB[ib + 1] * thy + samplesB[ib + 2] * thz;
            }

            projA.sort();
            projB.sort();

            let w1 = 0.0;
            for (let i = 0; i < n; i++) {
                w1 += Math.abs(projA[i] - projB[i]);
            }
            totalW1 += w1 / n;
        }

        return totalW1 / numProjections;
    }

    /* =========================================================================
       Export API
       ========================================================================= */

    return {
        BETA_MIN,
        BETA_MAX,
        EPSILON,
        mulberry32,
        createNormalSampler,
        beta,
        alpha,
        sigma2,
        sigma,
        transitionParams,
        getGalaxyTarget,
        getTrefoilTarget,
        getTorusTarget,
        getTarget,
        logResponsibilities,
        score,
        logDensity,
        marginalMoments,
        sampleP0,
        forwardStepExact,
        transitionStepExact,
        forwardSDE,
        reverseSDE,
        reverseODE,
        renoiseParticles,
        empiricalMoments,
        readoutNLL,
        slicedWasserstein1
    };
}));
