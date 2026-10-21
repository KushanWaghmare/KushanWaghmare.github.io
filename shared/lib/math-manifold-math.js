/**
 * math-manifold-math.js
 *
 * Mathematical core for the Mathematics hero: The Gauss–Bonnet Riemannian Manifold.
 * Differential geometry of 4D non-orientable topological immersion (Klein / Figure-8),
 * first and second fundamental forms, Theorema Egregium (Gaussian curvature K),
 * Christoffel symbols, and RK4 geodesic flow.
 *
 * UMD module: usable in Node.js (CommonJS) and browser (window.MathManifoldMath).
 * Code style: 4-space indent, const/arrow functions, zero external dependencies.
 */

(function (root, factory) {
    if (typeof module === "object" && module.exports) {
        module.exports = factory();
    } else {
        root.MathManifoldMath = factory();
    }
}(typeof self !== "undefined" ? self : this, function () {
    "use strict";

    const TAU = 2.0 * Math.PI;

    /* ---------- PRNG & Determinism (mulberry32) ---------- */
    const createPrng = (seed = 42891337) => {
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

    /* ---------- 4D Topological Immersion (Klein Manifold) ---------- */
    // Evaluates point in R^4 with major radius R and minor radius r
    const point4D = (u, v, R = 2.2, r = 0.90) => {
        const cosV = Math.cos(v);
        const sinV = Math.sin(v);
        const cosU = Math.cos(u);
        const sinU = Math.sin(u);
        const halfU = 0.5 * u;

        const x1 = (R + r * cosV) * cosU;
        const x2 = (R + r * cosV) * sinU;
        const x3 = r * sinV * Math.cos(halfU);
        const x4 = r * sinV * Math.sin(halfU);

        return [x1, x2, x3, x4];
    };

    // Projection into R^3 under 4D rotation angle alpha
    const point3D = (u, v, alpha = 0.45, R = 2.2, r = 0.90) => {
        const p4 = point4D(u, v, R, r);
        const cosA = Math.cos(alpha);
        const sinA = Math.sin(alpha);
        const z = p4[2] * cosA - p4[3] * sinA;
        return [p4[0], p4[1], z];
    };

    /* ---------- Metric Tensor & Fundamental Forms ---------- */
    // Exact intrinsic Riemannian metric from 4D immersion:
    // E(v) = (R + r cos v)^2 + (r^2 / 4) sin^2 v
    // F = 0 (orthogonal coordinate patch)
    // G = r^2 (constant)
    // Metric determinant: g = E * G - F^2 = r^2 * E > 0 everywhere
    const metricTensor = (u, v, R = 2.2, r = 0.90) => {
        const cosV = Math.cos(v);
        const sinV = Math.sin(v);
        const sin2V = Math.sin(2.0 * v);
        const cos2V = Math.cos(2.0 * v);

        const rCosV = r * cosV;
        const R_plus_rCosV = R + rCosV;

        const E = R_plus_rCosV * R_plus_rCosV + 0.25 * r * r * sinV * sinV;
        const F = 0.0;
        const G = r * r;
        const g = E * G;

        // Metric derivatives with respect to v
        const Ev = -2.0 * r * R * sinV - 0.75 * r * r * sin2V;
        const Evv = -2.0 * r * R * cosV - 1.5 * r * r * cos2V;

        return { E, F, G, g, Ev, Evv };
    };

    // Gaussian curvature K via Gauss's Theorema Egregium for orthogonal metric
    const gaussianCurvature = (u, v, R = 2.2, r = 0.90) => {
        const { E, Ev, Evv } = metricTensor(u, v, R, r);
        // K = -(2 E E_vv - E_v^2) / (4 r^2 E^2)
        return -(2.0 * E * Evv - Ev * Ev) / (4.0 * r * r * E * E);
    };

    // Normal vector and 3D visual projection derivatives for WebGL lighting
    const visual3D = (u, v, alpha = 0.45, R = 2.2, r = 0.90) => {
        const cosU = Math.cos(u);
        const sinU = Math.sin(u);
        const cosV = Math.cos(v);
        const sinV = Math.sin(v);
        const halfU_plus_alpha = 0.5 * u + alpha;
        const cosHalfAngle = Math.cos(halfU_plus_alpha);
        const sinHalfAngle = Math.sin(halfU_plus_alpha);

        const R_plus_rCosV = R + r * cosV;

        const pos = [
            R_plus_rCosV * cosU,
            R_plus_rCosV * sinU,
            r * sinV * cosHalfAngle
        ];

        const Xu = [
            -R_plus_rCosV * sinU,
            R_plus_rCosV * cosU,
            -0.5 * r * sinV * sinHalfAngle
        ];

        const Xv = [
            -r * sinV * cosU,
            -r * sinV * sinU,
            r * cosV * cosHalfAngle
        ];

        // Analytic cross product Xu x Xv
        const nx = r * R_plus_rCosV * cosU * cosV * cosHalfAngle - 0.5 * r * r * sinV * sinV * sinU * sinHalfAngle;
        const ny = 0.5 * r * r * sinV * sinV * cosU * sinHalfAngle + r * R_plus_rCosV * sinU * cosV * cosHalfAngle;
        const nz = r * R_plus_rCosV * sinV;

        const lenN = Math.hypot(nx, ny, nz);
        const normal = lenN > 1e-7 ? [nx / lenN, ny / lenN, nz / lenN] : [0.0, 0.0, 1.0];

        return { pos, Xu, Xv, normal };
    };

    // Comprehensive fundamental forms combining intrinsic metric and 3D visual projection
    const fundamentalForms = (u, v, alpha = 0.45, R = 2.2, r = 0.90) => {
        const m = metricTensor(u, v, R, r);
        const K = gaussianCurvature(u, v, R, r);
        const vis = visual3D(u, v, alpha, R, r);

        return {
            E: m.E,
            F: m.F,
            G: m.G,
            g: m.g,
            K,
            H: 0.5 * K,
            normal: vis.normal,
            pos: vis.pos,
            Xu: vis.Xu,
            Xv: vis.Xv
        };
    };

    /* ---------- Christoffel Symbols of the Second Kind ---------- */
    // Exact analytical Christoffel symbols for intrinsic metric:
    // Gamma^1_12 = Gamma^1_21 = Ev / (2 E)
    // Gamma^2_11 = -Ev / (2 G) = -Ev / (2 r^2)
    // All other components are identically zero
    const christoffelSymbols = (u, v, alpha = 0.45, R = 2.2, r = 0.90) => {
        const m = metricTensor(u, v, R, r);
        const Gamma12_1 = m.Ev / (2.0 * m.E);
        const Gamma11_2 = -m.Ev / (2.0 * m.G);

        return {
            Gamma11_1: 0.0,
            Gamma12_1,
            Gamma22_1: 0.0,
            Gamma11_2,
            Gamma12_2: 0.0,
            Gamma22_2: 0.0,
            E: m.E,
            F: m.F,
            G: m.G,
            g: m.g
        };
    };

    /* ---------- Geodesic Flow Equation & RK4 Integrator ---------- */
    // Accel: d^2 u^k / ds^2 = -Gamma^k_ij * (du^i/ds) * (du^j/ds)
    // d^2 u / ds^2 = -2.0 * Gamma^1_12 * du * dv
    // d^2 v / ds^2 = -Gamma^2_11 * du * du
    const geodesicDerivatives = (u, v, du, dv, alpha = 0.45, R = 2.2, r = 0.90) => {
        const C = christoffelSymbols(u, v, alpha, R, r);
        const d2u = -2.0 * C.Gamma12_1 * du * dv;
        const d2v = -C.Gamma11_2 * du * du;
        return { du, dv, d2u, d2v };
    };

    const stepGeodesicRK4 = (state, ds = 0.05, alpha = 0.45, R = 2.2, r = 0.90) => {
        const { u, v, du, dv } = state;

        const k1 = geodesicDerivatives(u, v, du, dv, alpha, R, r);

        const u2 = u + 0.5 * ds * k1.du;
        const v2 = v + 0.5 * ds * k1.dv;
        const du2 = du + 0.5 * ds * k1.d2u;
        const dv2 = dv + 0.5 * ds * k1.d2v;
        const k2 = geodesicDerivatives(u2, v2, du2, dv2, alpha, R, r);

        const u3 = u + 0.5 * ds * k2.du;
        const v3 = v + 0.5 * ds * k2.dv;
        const du3 = du + 0.5 * ds * k2.d2u;
        const dv3 = dv + 0.5 * ds * k2.d2v;
        const k3 = geodesicDerivatives(u3, v3, du3, dv3, alpha, R, r);

        const u4 = u + ds * k3.du;
        const v4 = v + ds * k3.dv;
        const du4 = du + ds * k3.d2u;
        const dv4 = dv + ds * k3.d2v;
        const k4 = geodesicDerivatives(u4, v4, du4, dv4, alpha, R, r);

        let nextU = u + (ds / 6.0) * (k1.du + 2.0 * k2.du + 2.0 * k3.du + k4.du);
        let nextV = v + (ds / 6.0) * (k1.dv + 2.0 * k2.dv + 2.0 * k3.dv + k4.dv);
        let nextDu = du + (ds / 6.0) * (k1.d2u + 2.0 * k2.d2u + 2.0 * k3.d2u + k4.d2u);
        let nextDv = dv + (ds / 6.0) * (k1.d2v + 2.0 * k2.d2v + 2.0 * k3.d2v + k4.d2v);

        // Keep coordinates within canonical periodic torus domain [0, TAU)
        nextU = ((nextU % TAU) + TAU) % TAU;
        nextV = ((nextV % TAU) + TAU) % TAU;

        return { u: nextU, v: nextV, du: nextDu, dv: nextDv };
    };

    /* ---------- Gauss–Bonnet Numerical Integration ---------- */
    // Evaluates \iint_M K dA = \int_0^{2\pi} \int_0^{2\pi} K(u,v) \sqrt{g} du dv
    const integrateGaussBonnet = (uSteps = 48, vSteps = 48, alpha = 0.45, R = 2.2, r = 0.90) => {
        const du = TAU / uSteps;
        const dv = TAU / vSteps;
        let totalCurvature = 0.0;
        let totalArea = 0.0;
        let minK = Infinity;
        let maxK = -Infinity;

        for (let i = 0; i < uSteps; i++) {
            const u = (i + 0.5) * du;
            for (let j = 0; j < vSteps; j++) {
                const v = (j + 0.5) * dv;
                const ff = fundamentalForms(u, v, alpha, R, r);
                const dA = Math.sqrt(Math.max(0.0, ff.g)) * du * dv;
                totalCurvature += ff.K * dA;
                totalArea += dA;
                if (ff.K < minK) minK = ff.K;
                if (ff.K > maxK) maxK = ff.K;
            }
        }

        const chi = totalCurvature / TAU; // Euler characteristic chi = 1/(2pi) \iint K dA
        return { totalCurvature, totalArea, minK, maxK, chi };
    };

    /* ---------- Telemetry Formatter ---------- */
    const formatTelemetry = (alpha, uSteps = 24, vSteps = 24, R = 2.2, r = 0.90) => {
        const gb = integrateGaussBonnet(uSteps, vSteps, alpha, R, r);
        const alphaPi = (alpha / Math.PI).toFixed(2);
        return {
            alpha,
            chi: Math.round(gb.chi),
            minK: gb.minK,
            maxK: gb.maxK,
            totalCurvature: gb.totalCurvature,
            totalArea: gb.totalArea,
            tagString: `Gauss–Bonnet Manifold · χ(M) = ${Math.round(gb.chi)} · K ∈ [${gb.minK.toFixed(2)}, +${gb.maxK.toFixed(2)}] · ∬ K dA = ${gb.totalCurvature.toFixed(3)} · 4D angle α = ${alphaPi}π · click shoots geodesic pulse`
        };
    };

    return {
        createPrng,
        fnv1a,
        point4D,
        point3D,
        metricTensor,
        gaussianCurvature,
        visual3D,
        fundamentalForms,
        christoffelSymbols,
        geodesicDerivatives,
        stepGeodesicRK4,
        integrateGaussBonnet,
        formatTelemetry
    };
}));
