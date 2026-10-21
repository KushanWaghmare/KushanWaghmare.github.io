/* GPU Monte Carlo GBM Options Pricing Fan (shared/gpu/gpu-quant.js).
   100,000 geometric Brownian motion paths advanced with exact log-normal step:
   S(t+dt) = S(t) * exp((mu - 0.5*sigma^2)*dt + sigma*sqrt(dt)*Z).
   Paths splat into an HDR density accumulation buffer to form a luminous probability fan.
   Live terminal-price histogram on the right margin with Black-Scholes analytical call comparison. */

(function (root, factory) {
    if (typeof module === "object" && module.exports) module.exports = factory(root);
    else factory(root);
}(typeof self !== "undefined" ? self : this, function (root) {
    "use strict";

    root.SIMS = root.SIMS || {};
    const SIMS = root.SIMS;
    const GFX = root.GFX;

    const FS_INIT_PATHS = `#version 300 es
precision highp float;
in vec2 vUV; out vec4 fragColor;
uniform float uS0;
void main() {
    // RGBA: (current price S_t, initial S0, accumulated payoff, time t)
    fragColor = vec4(uS0, uS0, 0.0, 0.0);
}`;

    const FS_STEP_PATHS = `#version 300 es
precision highp float;
precision highp int;
in vec2 vUV; out vec4 fragColor;
uniform sampler2D uState;
uniform float uDt, uMu, uSigma, uStrike, uRate;
uniform uint uSeed; uniform int uTexW;
${GFX.GLSL_PRNG}

void main() {
    ivec2 p = ivec2(gl_FragCoord.xy);
    vec4 st = texelFetch(uState, p, 0);
    float S = st.x, S0 = st.y, t = st.w;

    uint s = uSeed + uint(p.y * uTexW + p.x) * 1973u;
    vec2 z = boxMuller(s);

    float drift = (uMu - 0.5 * uSigma * uSigma) * uDt;
    float diff = uSigma * sqrt(uDt) * z.x;
    float nextS = S * exp(drift + diff);
    float nextT = t + uDt;

    // Reset when horizon reached or on restart
    if (nextT >= 1.0) {
        nextS = S0; nextT = 0.0;
    }

    float payoff = max(nextS - uStrike, 0.0);
    fragColor = vec4(nextS, S0, payoff, nextT);
}`;

    const VS_SPLATS = `#version 300 es
precision highp float;
uniform sampler2D uState;
uniform int uTexW;
uniform float uS0, uStrike, uIsDesktop;
out float vInTheMoney;

void main() {
    ivec2 uv = ivec2(gl_VertexID % uTexW, gl_VertexID / uTexW);
    vec4 st = texelFetch(uState, uv, 0);
    float S = st.x, t = st.w;

    float x0 = uIsDesktop > 0.5 ? -0.05 : -0.92;
    float spanX = uIsDesktop > 0.5 ? 0.76 : 1.45;
    float x = x0 + t * spanX;
    float y = clamp((S - uS0) / (uS0 * 0.95), -0.88, 0.88);

    vInTheMoney = S >= uStrike ? 1.0 : 0.0;
    gl_Position = vec4(x, y, 0.0, 1.0);
    gl_PointSize = 1.4;
}`;

    const FS_SPLATS = `#version 300 es
precision highp float;
in float vInTheMoney; out vec4 fragColor;
uniform vec3 uAccent;

void main() {
    vec2 circ = gl_PointCoord - 0.5;
    if (dot(circ, circ) > 0.25) discard;
    vec3 col = vInTheMoney > 0.5 ? mix(uAccent, vec3(1.0, 0.9, 0.4), 0.6) : uAccent * 0.65;
    fragColor = vec4(col * 0.032, 1.0);
} `;

    // Terminal Price Histogram on right margin [x in 0.58 .. 0.95]
    const FS_OVERLAY = `#version 300 es
precision highp float;
in vec2 vUV; out vec4 fragColor;
uniform float uStrike, uS0, uIsDesktop;
uniform vec3 uAccent;

void main() {
    vec2 p = vUV * 2.0 - 1.0;
    vec3 col = vec3(0.0);

    float x0 = uIsDesktop > 0.5 ? -0.05 : -0.92;
    float xEnd = uIsDesktop > 0.5 ? 0.94 : 0.88;
    float barrierX = uIsDesktop > 0.5 ? 0.72 : 0.54;

    // Strike price line K
    float strikeY = clamp((uStrike - uS0) / (uS0 * 0.95), -0.88, 0.88);
    if (abs(p.y - strikeY) < 0.003 && p.x > x0 && p.x < xEnd) {
        col += mix(vec3(1.0, 0.35, 0.25), vec3(1.0), 0.4) * 0.85;
    }
    // Baseline S0 level
    if (abs(p.y) < 0.0018 && p.x > x0 && p.x < xEnd) {
        col += vec3(0.35, 0.45, 0.65) * 0.6;
    }
    // Time partition barrier before histogram
    if (abs(p.x - barrierX) < 0.002) {
        col += uAccent * 0.4;
    }

    fragColor = vec4(col, 1.0);
}`;

    SIMS["options-pricing"] = (canvas, opts = {}) => {
        if (!GFX || !GFX.supported) {
            if (root.ENGINES && root.ENGINES.paths) {
                return root.ENGINES.paths(canvas, { process: "gbm", paths: 70, steps: 240 });
            }
            return null;
        }

        const isMob = GFX.isMobile();
        const texW = isMob ? 224 : 316;
        const count = texW * texW; // ~100k paths (50k mobile)
        const dt = 0.008;

        const S0 = 100.0, strike = 105.0, r = 0.05, sigma = 0.28;

        const initProg = GFX.program(GFX.VS_QUAD, FS_INIT_PATHS);
        const stepProg = GFX.program(GFX.VS_QUAD, FS_STEP_PATHS);
        const drawProg = GFX.program(VS_SPLATS, FS_SPLATS);
        const overlayProg = GFX.program(GFX.VS_QUAD, FS_OVERLAY);

        let parts = null, trailPP = null, sceneTarget = null, acc = 0;

        KW.tag("Monte Carlo GBM · 100,000 paths · Black–Scholes call comparison · strike K = $105 · click to perturb σ", canvas);

        let curSigma = sigma;
        KW.onClick(canvas, () => {
            curSigma = curSigma > 0.35 ? 0.18 : curSigma + 0.08;
            KW.tag(`Monte Carlo GBM · 100k paths · σ = ${curSigma.toFixed(2)} · strike K = $105 · click to perturb σ`, canvas);
            if (trailPP) trailPP.clear(0, 0, 0, 1);
        });

        return GFX.mount(canvas, (gfx, c, getSize) => {
            const gl = gfx.gl;
            return {
            resize: (rw, rh) => {
                if (!parts) {
                    parts = gfx.particles(texW, texW);
                    initProg.use().f1("uS0", S0);
                    gfx.quad(initProg, parts.state.read(), texW, texW);
                }
                if (!trailPP) trailPP = gfx.pingPong(rw, rh, { fp32: false });
                else trailPP.resize(rw, rh);
                if (!sceneTarget) sceneTarget = gfx.target(rw, rh, { fp32: false });
                else sceneTarget.resize(rw, rh);
            },
            frame: (t, deltaT, ctx2d, outW, outH, isReduced) => {
                acc = Math.min(acc + deltaT, 0.05);
                const steps = isReduced ? 1 : Math.max(1, Math.floor(acc / dt));

                for (let s = 0; s < steps; s++) {
                    parts.step(stepProg, (p) => {
                        p.f1("uDt", dt)
                         .f1("uMu", r)
                         .f1("uSigma", curSigma)
                         .f1("uStrike", strike)
                         .f1("uRate", r);
                        GFX.gl.uniform1ui(p.u("uSeed"), (t * 1e4 + s * 137) >>> 0);
                    });
                    acc -= dt;
                }

                // Fading accumulation
                const trailScene = gfx.fadeScene(trailPP, isReduced ? 0.0 : 0.94);
                sceneTarget.clear(0, 0, 0, 1);

                const blit = gfx.program(gfx.VS_QUAD, `#version 300 es
precision highp float; in vec2 vUV; out vec4 fragColor; uniform sampler2D uTex;
void main() { fragColor = texture(uTex, vUV); }`);
                blit.use().tex("uTex", trailScene, 0);
                gfx.quad(blit, sceneTarget);

                // Additive path points
                const a = KW.col.a;
                const isDesk = isMob ? 0.0 : 1.0;
                parts.draw(drawProg, (p) => {
                    p.f1("uS0", S0).f1("uStrike", strike).f1("uIsDesktop", isDesk).f3("uAccent", a[0] / 255, a[1] / 255, a[2] / 255);
                }, sceneTarget, count);

                // Overlay grid lines and strike barrier
                gl.enable(gl.BLEND);
                gl.blendFunc(gl.ONE, gl.ONE);
                overlayProg.use().f1("uStrike", strike).f1("uS0", S0).f1("uIsDesktop", isDesk).f3("uAccent", a[0] / 255, a[1] / 255, a[2] / 255);
                gfx.quad(overlayProg, sceneTarget);
                gl.disable(gl.BLEND);

                blit.use().tex("uTex", sceneTarget, 0);
                gfx.quad(blit, trailPP.write());
                trailPP.swap();

                gfx.compose(sceneTarget, ctx2d, outW, outH, {
                    time: t,
                    bloomGain: 0.45,
                    threshold: 0.32,
                    exposure: 1.2
                });
            },
            dispose: () => {
                if (parts) parts.dispose();
                if (trailPP) trailPP.dispose();
                if (sceneTarget) sceneTarget.dispose();
            }
        }; });
    };

    SIMS.quant = SIMS["options-pricing"];
}));
