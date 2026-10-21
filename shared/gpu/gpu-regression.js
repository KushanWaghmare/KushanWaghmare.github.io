/* GPU Regularised Regression Loss Surfaces (shared/gpu/gpu-regression.js).
   Visualises 3-D quadratic loss paraboloid L(β) = (1/2) (β - β_ols)^T Q (β - β_ols).
   Renders analytical Lasso L1 diamond (|β₁| + |β₂| ≤ t) and Ridge L2 disk (β₁² + β₂² ≤ t²).
   Descent trajectory settles on sparse corners, illustrating KKT non-smooth sparsity.
   Governing equations: min (1/2n) ||y - Xβ||₂² + λ₁||β||₁ + (λ₂/2)||β||₂². */

(function (root, factory) {
    if (typeof module === "object" && module.exports) module.exports = factory(root);
    else factory(root);
}(typeof self !== "undefined" ? self : this, function (root) {
    "use strict";

    root.SIMS = root.SIMS || {};
    const SIMS = root.SIMS;
    const GFX = root.GFX;

    const FS_SURFACE = `#version 300 es
precision highp float;
in vec2 vUV; out vec4 fragColor;
uniform float uTime;
uniform float uCenterOffset;
uniform int uMode; // 0: Lasso L1 diamond, 1: Ridge L2 disk, 2: Elastic Net
uniform vec3 uAccent;

// Quadratic loss function centred at OLS minimum (0.75, 0.65)
float loss(vec2 b) {
    vec2 d = b - vec2(0.72, 0.62);
    // Anisotropic Hessian Q = [[1.8, 0.7], [0.7, 1.2]]
    return 0.5 * (1.8 * d.x * d.x + 1.2 * d.y * d.y + 1.4 * d.x * d.y);
}

void main() {
    // Domain [-1.6, 1.6]
    vec2 ndc = vUV * 2.0 - 1.0;
    vec2 b = (ndc - vec2(uCenterOffset, 0.0)) * 1.55;
    float l = loss(b);

    // Analytical gradient of loss
    vec2 d = b - vec2(0.72, 0.62);
    vec2 grad = vec2(1.8 * d.x + 0.7 * d.y, 1.2 * d.y + 0.7 * d.x);
    vec3 norm = normalize(vec3(-grad.x, -grad.y, 1.5));

    // Directional lighting
    vec3 lightDir = normalize(vec3(0.5, 0.8, 1.2));
    float diff = max(dot(norm, lightDir), 0.0);

    // Loss elliptical contour rings
    float contour = abs(fract(l * 2.5 - 0.5) - 0.5);
    float line = smoothstep(0.04, 0.005, contour);

    // Constraint boundary
    float tRadius = 0.58;
    float distConstraint = 0.0;
    if (uMode == 0) {
        // L1 Diamond: |b1| + |b2| = t
        distConstraint = abs(abs(b.x) + abs(b.y) - tRadius);
    } else if (uMode == 1) {
        // L2 Disk: sqrt(b1^2 + b2^2) = t
        distConstraint = abs(length(b) - tRadius);
    } else {
        // Elastic Net: 0.6*L1 + 0.4*L2
        float l1 = abs(b.x) + abs(b.y);
        float l2 = length(b);
        distConstraint = abs(0.65 * l1 + 0.35 * l2 - tRadius);
    }
    float constraintGlow = smoothstep(0.035, 0.005, distConstraint);

    // Optimization trajectory from initial point to corner
    float alpha = clamp(fract(uTime * 0.22) * 1.3, 0.0, 1.0);
    vec2 p0 = vec2(1.3, 1.1);
    // Target sparse corner at (tRadius, 0.0) for Lasso
    vec2 targetCorner = (uMode == 0) ? vec2(tRadius, 0.0) : vec2(0.42, 0.38);
    vec2 trajPoint = mix(p0, targetCorner, alpha * alpha);
    float distTraj = length(b - trajPoint);
    float pointGlow = smoothstep(0.05, 0.005, distTraj);

    vec3 bgBase = vec3(0.0);
    vec3 surfaceCol = mix(bgBase, vec3(0.015, 0.02, 0.035) * diff, clamp(l * 0.8, 0.0, 1.0));

    // Contour lines in subtle accent
    surfaceCol += uAccent * (line * 0.14);

    // Constraint boundary in bright luminous accent
    vec3 constrCol = mix(uAccent, vec3(1.0, 0.9, 0.4), 0.5);
    surfaceCol += constrCol * (constraintGlow * 1.6);

    // Trajectory settling dot
    vec3 dotCol = vec3(1.0, 0.98, 0.95);
    surfaceCol += dotCol * (pointGlow * 3.2);

    fragColor = vec4(surfaceCol, 1.0);
}`;

    const runRegression = (canvas, opts = {}) => {
        if (!GFX || !GFX.supported) return;

        let mode = opts.mode !== undefined ? opts.mode : 0;
        const modeNames = [
            "Lasso L1 penalty (|β₁| + |β₂| ≤ t) · exact sparse corner KKT point",
            "Ridge L2 penalty (β₁² + β₂² ≤ t²) · smooth proportional shrinkage",
            "Elastic Net convex combination (α L1 + (1-α) L2)"
        ];
        let simTime = 0.0;

        const surfProg = GFX.program(GFX.VS_QUAD, FS_SURFACE);
        let sceneTarget = null;

        const updateCaption = () => {
            const tag = `Regularised regression · ${modeNames[mode]} · click to toggle penalty`;
            if (window.KW && window.KW.tag) window.KW.tag(tag, canvas);
        };
        updateCaption();

        if (window.KW && window.KW.onClick) {
            window.KW.onClick(canvas, () => {
                mode = (mode + 1) % modeNames.length;
                updateCaption();
            });
        }

        return GFX.mount(canvas, (gfx, c, getSize) => ({
            resize: (rw, rh) => {
                if (!sceneTarget) sceneTarget = gfx.target(rw, rh, { fp32: false });
                else sceneTarget.resize(rw, rh);
            },
            frame: (t, dt, ctx2d, outW, outH, isReduced) => {
                simTime += isReduced ? 0.01 : dt;

                const a = (window.KW && window.KW.col && window.KW.col.a) || [89, 217, 166];
                const isMob = typeof window !== "undefined" && window.innerWidth <= 900;
                const offset = isMob ? 0.0 : 0.48;
                surfProg.use()
                    .f1("uTime", simTime)
                    .i1("uMode", mode)
                    .f1("uCenterOffset", offset)
                    .f3("uAccent", a[0] / 255, a[1] / 255, a[2] / 255);
                gfx.quad(surfProg, sceneTarget);

                gfx.compose(sceneTarget, ctx2d, outW, outH, {
                    time: t,
                    bloomGain: 0.52,
                    threshold: 0.35,
                    exposure: 1.18
                });
            },
            dispose: () => {
                if (sceneTarget) sceneTarget.dispose();
            }
        }));
    };

    SIMS["regularised-regression"] = SIMS["DS3001"] = runRegression;
}));
