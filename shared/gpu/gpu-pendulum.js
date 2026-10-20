/* GPU Chaotic Double Pendulum Ensemble (shared/gpu/gpu-pendulum.js).
   200 double pendulums (50 on mobile) with initial angles differing by Δθ₀ = 10⁻⁶.
   Euler-Lagrange equations integrated via 4th-order Runge-Kutta (RK4) at dt = 1e-3.
   Fading HDR accumulation buffer illuminates exponential Lyapunov phase divergence.
   Governing equations: d/dt(∂L/∂θ̇ᵢ) - ∂L/∂θᵢ = 0, L = T - V. */

(function (root, factory) {
    if (typeof module === "object" && module.exports) module.exports = factory(root);
    else factory(root);
}(typeof self !== "undefined" ? self : this, function (root) {
    "use strict";

    root.SIMS = root.SIMS || {};
    const SIMS = root.SIMS;
    const GFX = root.GFX;

    const FS_INIT_STATE = `#version 300 es
precision highp float;
in vec2 vUV; out vec4 fragColor;
uniform float uTh1, uTh2;
uniform int uCount;

void main() {
    int id = int(gl_FragCoord.x);
    float pert = (float(id) / float(uCount)) * 1.0e-6;
    // RGBA: (theta1, theta2, omega1, omega2)
    fragColor = vec4(uTh1 + pert, uTh2, 0.0, 0.0);
}`;

    const FS_RK4_STEP = `#version 300 es
precision highp float;
in vec2 vUV; out vec4 fragColor;
uniform sampler2D uState;
uniform float uDt;

vec4 derivatives(vec4 s) {
    float th1 = s.x, th2 = s.y, w1 = s.z, w2 = s.w;
    float dth = th1 - th2;
    float g = 9.81;

    // m1 = m2 = 1.0, l1 = l2 = 1.0
    float denom = 3.0 - cos(2.0 * dth);

    float num1 = -g * 3.0 * sin(th1) - g * sin(th1 - 2.0 * th2)
                 - 2.0 * sin(dth) * (w2 * w2 + w1 * w1 * cos(dth));
    float a1 = num1 / denom;

    float num2 = 2.0 * sin(dth) * (w1 * w1 * 2.0 + 2.0 * g * cos(th1) + w2 * w2 * cos(dth));
    float a2 = num2 / denom;

    return vec4(w1, w2, a1, a2);
}

void main() {
    ivec2 coord = ivec2(gl_FragCoord.xy);
    vec4 s = texelFetch(uState, coord, 0);

    vec4 k1 = derivatives(s);
    vec4 k2 = derivatives(s + 0.5 * uDt * k1);
    vec4 k3 = derivatives(s + 0.5 * uDt * k2);
    vec4 k4 = derivatives(s + uDt * k3);

    vec4 nextState = s + (uDt / 6.0) * (k1 + 2.0 * k2 + 2.0 * k3 + k4);
    fragColor = nextState;
}`;

    const VS_SPLATS = `#version 300 es
precision highp float;
uniform sampler2D uState;
uniform int uCount;
out float vIdx;

void main() {
    int id = gl_VertexID;
    vec4 s = texelFetch(uState, ivec2(id, 0), 0);
    float th1 = s.x, th2 = s.y;

    // Cartesian coordinates of second bob (tip):
    // x = sin(th1) + sin(th2), y = -cos(th1) - cos(th2)
    float x = sin(th1) + sin(th2);
    float y = -cos(th1) - cos(th2);

    // Map configuration space [-2.1, 2.1] to NDC [-0.85, 0.85]
    vec2 ndc = vec2(x, y) * (0.85 / 2.1);
    gl_Position = vec4(ndc, 0.0, 1.0);
    gl_PointSize = 2.2;
    vIdx = float(id) / float(uCount);
}
`;

    const FS_SPLATS = `#version 300 es
precision highp float;
in float vIdx; out vec4 fragColor;
uniform vec3 uAccent;

void main() {
    vec2 c = gl_PointCoord - 0.5;
    if (dot(c, c) > 0.25) discard;
    vec3 col = mix(uAccent, vec3(1.0, 0.95, 0.8), vIdx * 0.7);
    fragColor = vec4(col * 0.045, 1.0);
}`;

    const runPendulum = (canvas, opts = {}) => {
        if (!GFX || !GFX.supported) return;

        const isMob = typeof window !== "undefined" && window.innerWidth <= 900;
        const count = isMob ? 50 : 200;
        let th1 = opts.th1 || 2.15;
        let th2 = opts.th2 || 1.95;
        const dtFixed = 0.001;
        let acc = 0;

        const initProg = GFX.program(GFX.VS_QUAD, FS_INIT_STATE);
        const rk4Prog = GFX.program(GFX.VS_QUAD, FS_RK4_STEP);
        const drawProg = GFX.program(VS_SPLATS, FS_SPLATS);
        const blitProg = GFX.program(GFX.VS_QUAD, `#version 300 es
precision highp float; in vec2 vUV; out vec4 fragColor; uniform sampler2D uTex;
void main() { fragColor = texture(uTex, vUV); }`);

        let statePP = null;
        let trailPP = null;
        let sceneTarget = null;

        const resetEnsemble = (initTh1, initTh2) => {
            th1 = initTh1; th2 = initTh2;
            if (statePP) {
                initProg.use().f1("uTh1", th1).f1("uTh2", th2).i1("uCount", count);
                GFX.quad(initProg, statePP.read(), count, 1);
            }
            if (trailPP) trailPP.clear(0, 0, 0, 1);
            updateCaption();
        };

        const updateCaption = () => {
            const tag = `Double pendulum (${count} trajectories) · Δθ₀ = 10⁻⁶ · RK4 fixed-step (dt = 1e-3) · Lyapunov divergence · click to perturb`;
            if (window.KW && window.KW.tag) window.KW.tag(tag, canvas);
        };
        updateCaption();

        if (window.KW && window.KW.onClick) {
            window.KW.onClick(canvas, () => {
                resetEnsemble(2.0 + Math.random() * 0.4, 1.8 + Math.random() * 0.5);
            });
        }

        return GFX.mount(canvas, (gfx, c, getSize) => ({
            resize: (rw, rh) => {
                if (!statePP) {
                    statePP = gfx.pingPong(count, 1, { fp32: true, nearest: true });
                    initProg.use().f1("uTh1", th1).f1("uTh2", th2).i1("uCount", count);
                    gfx.quad(initProg, statePP.read(), count, 1);
                }
                if (!trailPP) trailPP = gfx.pingPong(rw, rh, { fp32: false });
                else trailPP.resize(rw, rh);
                if (!sceneTarget) sceneTarget = gfx.target(rw, rh, { fp32: false });
                else sceneTarget.resize(rw, rh);
            },
            frame: (t, dt, ctx2d, outW, outH, isReduced) => {
                acc = Math.min(acc + dt, 0.05);
                const steps = isReduced ? 1 : Math.max(1, Math.floor(acc / dtFixed));

                rk4Prog.use().f1("uDt", dtFixed);
                for (let s = 0; s < Math.min(steps, 8); s++) {
                    rk4Prog.tex("uState", statePP.read(), 0);
                    gfx.quad(rk4Prog, statePP.write(), count, 1);
                    statePP.swap();
                    acc -= dtFixed;
                }

                // Fading accumulation trail
                const trailScene = gfx.fadeScene(trailPP, isReduced ? 0.0 : 0.94);
                sceneTarget.clear(0, 0, 0, 1);

                blitProg.use().tex("uTex", trailScene, 0);
                gfx.quad(blitProg, sceneTarget);

                // Additive pendulum tip splats
                const a = (window.KW && window.KW.col && window.KW.col.a) || [138, 180, 248];
                const gl = GFX.gl;
                gl.enable(gl.BLEND);
                gl.blendFunc(gl.ONE, gl.ONE);
                drawProg.use()
                    .tex("uState", statePP.read(), 0)
                    .i1("uCount", count)
                    .f3("uAccent", a[0] / 255, a[1] / 255, a[2] / 255);
                gl.drawArrays(gl.POINTS, 0, count);
                gl.disable(gl.BLEND);

                blitProg.use().tex("uTex", sceneTarget, 0);
                gfx.quad(blitProg, trailPP.write());
                trailPP.swap();

                gfx.compose(sceneTarget, ctx2d, outW, outH, {
                    time: t,
                    bloomGain: 0.52,
                    threshold: 0.32,
                    exposure: 1.18
                });
            },
            dispose: () => {
                if (statePP) statePP.dispose();
                if (trailPP) trailPP.dispose();
                if (sceneTarget) sceneTarget.dispose();
            }
        }));
    };

    SIMS.pendulum = SIMS["double-pendulum"] = SIMS["PH2010"] = runPendulum;
}));
