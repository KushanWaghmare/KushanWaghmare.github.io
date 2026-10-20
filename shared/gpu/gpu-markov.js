/* GPU Ergodic Markov Chains & Random Walkers (shared/gpu/gpu-markov.js).
   Simulates 5,000 random walkers on a 5-state transition graph.
   Walkers transition along directed arcs and converge to invariant distribution π P = π.
   Real-time stationary occupancy bars, fading HDR accumulation trails, and Dual-Kawase bloom.
   Governing equations: π P = π, ∑ πᵢ = 1, d_TV(p_emp, π) → 0. */

(function (root, factory) {
    if (typeof module === "object" && module.exports) module.exports = factory(root);
    else factory(root);
}(typeof self !== "undefined" ? self : this, function (root) {
    "use strict";

    root.SIMS = root.SIMS || {};
    const SIMS = root.SIMS;
    const GFX = root.GFX;

    const FS_INIT_WALKERS = `#version 300 es
precision highp float;
in vec2 vUV; out vec4 fragColor;

void main() {
    // Start all walkers in state 0 (non-equilibrium)
    // RGBA: (state, progress, prev_state, target_state)
    fragColor = vec4(0.0, 1.0, 0.0, 0.0);
}`;

    const FS_STEP_WALKERS = `#version 300 es
precision highp float;
precision highp int;
in vec2 vUV; out vec4 fragColor;
uniform sampler2D uWalkers;
uniform float uDt;
uniform uint uSeed; uniform int uTexW;
${GFX.GLSL_PRNG}

// Transition matrix CDF rows
int sampleNextState(int cur, inout uint rng) {
    float u = rand01(rng);
    if (cur == 0) {
        if (u < 0.10) return 0;
        if (u < 0.55) return 1;
        if (u < 0.80) return 2;
        if (u < 0.95) return 3;
        return 4;
    } else if (cur == 1) {
        if (u < 0.20) return 0;
        if (u < 0.30) return 1;
        if (u < 0.80) return 2;
        if (u < 0.90) return 3;
        return 4;
    } else if (cur == 2) {
        if (u < 0.05) return 0;
        if (u < 0.30) return 1;
        if (u < 0.50) return 2;
        if (u < 0.85) return 3;
        return 4;
    } else if (cur == 3) {
        if (u < 0.15) return 0;
        if (u < 0.25) return 1;
        if (u < 0.50) return 2;
        if (u < 0.70) return 3;
        return 4;
    } else {
        if (u < 0.30) return 0;
        if (u < 0.45) return 1;
        if (u < 0.55) return 2;
        if (u < 0.80) return 3;
        return 4;
    }
}

void main() {
    ivec2 coord = ivec2(gl_FragCoord.xy);
    vec4 st = texelFetch(uWalkers, coord, 0);
    float state = st.x;
    float progress = st.y;
    float prev = st.z;
    float next = st.w;

    progress += uDt * 2.5;

    if (progress >= 1.0) {
        uint rng = uSeed + uint(coord.y * uTexW + coord.x) * 1664525u;
        prev = next;
        next = float(sampleNextState(int(next), rng));
        progress = 0.0;
    }

    fragColor = vec4(next, progress, prev, next);
}`;

    const VS_WALKERS = `#version 300 es
precision highp float;
uniform sampler2D uWalkers;
uniform int uTexW;
out float vProgress;

vec2 getNodePos(int id) {
    float angle = float(id) * (6.28318530718 / 5.0) - 1.57079632679;
    return vec2(cos(angle), sin(angle)) * 0.62;
}

void main() {
    int id = gl_VertexID;
    ivec2 coord = ivec2(id % uTexW, id / uTexW);
    vec4 st = texelFetch(uWalkers, coord, 0);

    vec2 p1 = getNodePos(int(st.z));
    vec2 p2 = getNodePos(int(st.w));
    float prog = st.y;

    // Curved interpolation along directed arc
    vec2 mid = (p1 + p2) * 0.5 + vec2(-(p2.y - p1.y), p2.x - p1.x) * 0.18;
    vec2 pos = (1.0 - prog) * (1.0 - prog) * p1 + 2.0 * (1.0 - prog) * prog * mid + prog * prog * p2;

    // Shift left slightly to leave room for stationary histogram
    pos.x = pos.x * 0.85 - 0.22;
    pos.y = pos.y * 0.85;

    gl_Position = vec4(pos, 0.0, 1.0);
    gl_PointSize = 1.8;
    vProgress = prog;
}`;

    const FS_WALKERS = `#version 300 es
precision highp float;
in float vProgress; out vec4 fragColor;
uniform vec3 uAccent;

void main() {
    vec2 c = gl_PointCoord - 0.5;
    if (dot(c, c) > 0.25) discard;
    vec3 col = mix(uAccent, vec3(1.0, 0.95, 0.8), vProgress * 0.5);
    fragColor = vec4(col * 0.05, 1.0);
}`;

    const FS_OVERLAY = `#version 300 es
precision highp float;
in vec2 vUV; out vec4 fragColor;
uniform vec3 uAccent;

vec2 getNodePos(int id) {
    float angle = float(id) * (6.28318530718 / 5.0) - 1.57079632679;
    return vec2(cos(angle), sin(angle)) * 0.62;
}

void main() {
    vec2 p = vUV * 2.0 - 1.0;
    vec3 col = vec3(0.0);

    // 5 State circles
    for (int i = 0; i < 5; i++) {
        vec2 nodeP = getNodePos(i);
        nodeP.x = nodeP.x * 0.85 - 0.22;
        nodeP.y = nodeP.y * 0.85;
        float d = length(p - nodeP);
        float ring = smoothstep(0.065, 0.055, d) - smoothstep(0.055, 0.045, d);
        col += mix(uAccent, vec3(1.0, 0.9, 0.5), float(i) * 0.2) * (ring * 1.8);
    }

    // Right margin stationary bars (pi = [0.151, 0.201, 0.262, 0.220, 0.166])
    if (p.x >= 0.55 && p.x <= 0.92 && p.y >= -0.75 && p.y <= 0.75) {
        float relY = (p.y + 0.75) / 1.5;
        int barIdx = int(relY * 5.0);
        float piVal = (barIdx == 0) ? 0.151 : (barIdx == 1) ? 0.201 : (barIdx == 2) ? 0.262 : (barIdx == 3) ? 0.220 : 0.166;
        float barWidth = piVal * 2.8;
        float relX = (p.x - 0.55) / (0.92 - 0.55);

        float barSlot = fract(relY * 5.0);
        if (barSlot >= 0.20 && barSlot <= 0.80 && relX <= barWidth) {
            col += mix(uAccent * 0.8, vec3(1.0, 0.9, 0.4), relX / max(barWidth, 0.01)) * 1.2;
        }
    }

    fragColor = vec4(col, 1.0);
}`;

    const runMarkov = (canvas, opts = {}) => {
        if (!GFX || !GFX.supported) return;

        const isMob = typeof window !== "undefined" && window.innerWidth <= 900;
        const numWalkers = isMob ? 1000 : 5000;
        const texW = Math.ceil(Math.sqrt(numWalkers));
        const texH = Math.ceil(numWalkers / texW);
        let frameSeed = 839102;
        const dt = 0.016;

        const initProg = GFX.program(GFX.VS_QUAD, FS_INIT_WALKERS);
        const stepProg = GFX.program(GFX.VS_QUAD, FS_STEP_WALKERS);
        const walkProg = GFX.program(VS_WALKERS, FS_WALKERS);
        const overProg = GFX.program(GFX.VS_QUAD, FS_OVERLAY);
        const blitProg = GFX.program(GFX.VS_QUAD, `#version 300 es
precision highp float; in vec2 vUV; out vec4 fragColor; uniform sampler2D uTex;
void main() { fragColor = texture(uTex, vUV); }`);

        let walkerPP = null;
        let trailPP = null;
        let sceneTarget = null;

        const updateCaption = () => {
            const tag = `Discrete-time Markov chain (5 states, ${numWalkers.toLocaleString()} walkers) · stationary π P = π · click to perturb`;
            if (window.KW && window.KW.tag) window.KW.tag(tag, canvas);
        };
        updateCaption();

        if (window.KW && window.KW.onClick) {
            window.KW.onClick(canvas, () => {
                if (trailPP) trailPP.clear(0, 0, 0, 1);
                updateCaption();
            });
        }

        return GFX.mount(canvas, (gfx, c, getSize) => ({
            resize: (rw, rh) => {
                if (!walkerPP) {
                    walkerPP = gfx.pingPong(texW, texH, { fp32: true, nearest: true });
                    initProg.use();
                    gfx.quad(initProg, walkerPP.read(), texW, texH);
                }
                if (!trailPP) trailPP = gfx.pingPong(rw, rh, { fp32: false });
                else trailPP.resize(rw, rh);
                if (!sceneTarget) sceneTarget = gfx.target(rw, rh, { fp32: false });
                else sceneTarget.resize(rw, rh);
            },
            frame: (t, deltaT, ctx2d, outW, outH, isReduced) => {
                const substeps = isReduced ? 1 : 2;

                stepProg.use()
                    .i1("uTexW", texW)
                    .f1("uDt", dt);

                for (let s = 0; s < substeps; s++) {
                    frameSeed = (frameSeed * 1664525 + 1013904223) >>> 0;
                    GFX.gl.uniform1ui(stepProg.u("uSeed"), frameSeed);
                    stepProg.tex("uWalkers", walkerPP.read(), 0);
                    gfx.quad(stepProg, walkerPP.write(), texW, texH);
                    walkerPP.swap();
                }

                // Fading accumulation trail
                const trailScene = gfx.fadeScene(trailPP, isReduced ? 0.0 : 0.94);
                sceneTarget.clear(0, 0, 0, 1);

                blitProg.use().tex("uTex", trailScene, 0);
                gfx.quad(blitProg, sceneTarget);

                const a = (window.KW && window.KW.col && window.KW.col.a) || [255, 171, 64];
                const gl = GFX.gl;

                // Additive walker splats
                gl.enable(gl.BLEND);
                gl.blendFunc(gl.ONE, gl.ONE);
                walkProg.use()
                    .tex("uWalkers", walkerPP.read(), 0)
                    .i1("uTexW", texW)
                    .f3("uAccent", a[0] / 255, a[1] / 255, a[2] / 255);
                gl.drawArrays(gl.POINTS, 0, numWalkers);

                // Overlay state nodes and stationary histogram
                overProg.use().f3("uAccent", a[0] / 255, a[1] / 255, a[2] / 255);
                gfx.quad(overProg, sceneTarget);
                gl.disable(gl.BLEND);

                blitProg.use().tex("uTex", sceneTarget, 0);
                gfx.quad(blitProg, trailPP.write());
                trailPP.swap();

                gfx.compose(sceneTarget, ctx2d, outW, outH, {
                    time: t,
                    bloomGain: 0.50,
                    threshold: 0.32,
                    exposure: 1.15
                });
            },
            dispose: () => {
                if (walkerPP) walkerPP.dispose();
                if (trailPP) trailPP.dispose();
                if (sceneTarget) sceneTarget.dispose();
            }
        }));
    };

    SIMS.markov = SIMS["MA2010"] = runMarkov;
}));
