/* GPU Score-Based Diffusion Simulation (shared/gpu/gpu-diffusion.js).
   3-D Variance-Preserving SDE with closed-form Gaussian mixture score,
   ping-pong RGBA32F particle state, flow accumulation buffer, Dual-Kawase bloom,
   ACES tonemapping, cursor re-noising interaction, and async NLL caption readback. */

(function (root, factory) {
    if (typeof module === "object" && module.exports) module.exports = factory(root);
    else factory(root);
}(typeof self !== "undefined" ? self : this, function (root) {
    "use strict";

    root.SIMS = root.SIMS || {};
    const SIMS = root.SIMS;
    const GFX = root.GFX;
    let DM = root.DiffusionMath;

    const ensureDM = () => {
        if (DM) return Promise.resolve(DM);
        if (root.DiffusionMath) { DM = root.DiffusionMath; return Promise.resolve(DM); }
        if (typeof document === "undefined") return Promise.resolve(null);
        return new Promise((resolve) => {
            const s = document.createElement("script");
            s.src = "shared/lib/diffusion-math.js?v=36";
            s.onload = () => { DM = root.DiffusionMath; resolve(DM); };
            s.onerror = () => resolve(null);
            document.head.appendChild(s);
        });
    };

    /* =========================================================================
       1. GLSL Shaders: Physics Update, Particle Splats, Accumulation Fade
       ========================================================================= */

    const VS_QUAD = `#version 300 es
layout(location = 0) in vec2 aPos; out vec2 vUV;
void main() { vUV = aPos * 0.5 + 0.5; gl_Position = vec4(aPos, 0.0, 1.0); }`;

    const GLSL_COMMON_SCORE = `
const float BETA_MIN = 0.1;
const float BETA_MAX = 20.0;

float calcBeta(float t) {
    return BETA_MIN + t * (BETA_MAX - BETA_MIN);
}

float calcAlpha(float t) {
    float exponent = -0.5 * BETA_MIN * t - 0.25 * (BETA_MAX - BETA_MIN) * t * t;
    return exp(exponent);
}

float calcSigma2(float t) {
    float a = calcAlpha(t);
    return max(0.0, 1.0 - a * a);
}

vec3 calcScore(vec3 x, float t, sampler2D mixTex, int K) {
    float at = calcAlpha(t);
    float at2 = at * at;
    float st2 = calcSigma2(t);

    float maxC = -1e20;
    for (int k = 0; k < K; k++) {
        vec4 p = texelFetch(mixTex, ivec2(k, 0), 0);
        vec3 mu = p.xyz;
        float sk = p.w;
        float logW = texelFetch(mixTex, ivec2(k, 1), 0).y;

        float vk = at2 * (sk * sk) + st2;
        vec3 d = x - at * mu;
        float distSq = dot(d, d);
        float ck = logW - 1.5 * log(vk) - distSq / (2.0 * vk);
        if (ck > maxC) maxC = ck;
    }

    float sumExp = 0.0;
    vec3 gradSum = vec3(0.0);
    for (int k = 0; k < K; k++) {
        vec4 p = texelFetch(mixTex, ivec2(k, 0), 0);
        vec3 mu = p.xyz;
        float sk = p.w;
        float logW = texelFetch(mixTex, ivec2(k, 1), 0).y;

        float vk = at2 * (sk * sk) + st2;
        vec3 d = x - at * mu;
        float distSq = dot(d, d);
        float ck = logW - 1.5 * log(vk) - distSq / (2.0 * vk);
        float rk = exp(ck - maxC);
        sumExp += rk;
        gradSum += rk * ((at * mu - x) / vk);
    }

    return gradSum / max(sumExp, 1e-12);
}
`;

    // 1. Simulation Stepper Fragment Shader
    const FS_UPDATE = `#version 300 es
precision highp float;
precision highp int;
in vec2 vUV;
out vec4 fragColor;

uniform sampler2D uState;       // rgb: position, a: current particle time t_i
uniform sampler2D uNoise;       // rgb: fixed epsilon_i, a: initial anchor time
uniform sampler2D uAnchor;      // rgb: converged x_0, a: unused
uniform sampler2D uMixtureTex;  // row 0: mu.xyz, s_k; row 1: w_k, log(w_k)
uniform int uK;
uniform float uGlobalTime;      // global schedule time t
uniform float uStepDt;          // simulation step dt in diffusion time scale
uniform int uPhase;             // 0: hold structure, 1: dissolve to noise, 2: hold noise, 3: reverse
uniform int uIsODE;             // 0: reverse SDE, 1: probability-flow ODE
uniform uint uSeed;
uniform vec3 uClickCenter;
uniform float uClickRadius;
uniform int uDoRenoise;

${GFX.GLSL_PRNG}
${GLSL_COMMON_SCORE}

void main() {
    ivec2 p = ivec2(gl_FragCoord.xy);
    vec4 state = texelFetch(uState, p, 0);
    vec3 pos = state.xyz;
    float t_i = state.w;

    vec3 eps_i = texelFetch(uNoise, p, 0).xyz;
    vec3 x0_i = texelFetch(uAnchor, p, 0).xyz;

    uint s = uSeed + uint(p.y * 2048 + p.x) * 17u;

    // Interactive re-noising if clicked
    if (uDoRenoise == 1) {
        float d = distance(pos, uClickCenter);
        if (d <= uClickRadius && t_i < 0.5) {
            float as_ = calcAlpha(t_i);
            float at = calcAlpha(0.5);
            float gamma = at / max(as_, 1e-5);
            float varTrans = max(0.0, calcSigma2(0.5) - gamma * gamma * calcSigma2(t_i));
            vec2 bm1 = boxMuller(s);
            vec2 bm2 = boxMuller(s);
            vec3 randZ = vec3(bm1.x, bm1.y, bm2.x);
            pos = gamma * pos + sqrt(varTrans) * randZ;
            t_i = 0.5;
            fragColor = vec4(pos, t_i);
            return;
        }
    }

    if (uPhase == 0) {
        // Hold structure at t = epsilon
        pos = x0_i;
        t_i = 0.001;
    } else if (uPhase == 1) {
        // Dissolve to noise via exact forward kernel with fixed epsilon_i
        float at = calcAlpha(uGlobalTime);
        float st = sqrt(calcSigma2(uGlobalTime));
        pos = at * x0_i + st * eps_i;
        t_i = uGlobalTime;
    } else if (uPhase == 2) {
        // Hold noise at t = 1.0
        pos = eps_i;
        t_i = 1.0;
    } else if (uPhase == 3) {
        // Reverse SDE or probability-flow ODE step
        if (t_i > 0.001) {
            float b = calcBeta(t_i);
            vec3 sc = calcScore(pos, t_i, uMixtureTex, uK);

            if (uIsODE == 1) {
                // ODE: dx/dt = -0.5 * beta * x - 0.5 * beta * score
                vec3 drift = -0.5 * b * pos - 0.5 * b * sc;
                pos -= drift * uStepDt;
            } else {
                // SDE: dx = [-0.5 * beta * x - beta * score] dt + sqrt(beta) * dW
                vec3 drift = -0.5 * b * pos - b * sc;
                vec2 bm1 = boxMuller(s);
                vec2 bm2 = boxMuller(s);
                vec3 randZ = vec3(bm1.x, bm1.y, bm2.x);
                float diff = sqrt(b * uStepDt);
                pos -= drift * uStepDt - diff * randZ;
            }

            t_i = max(0.001, t_i - uStepDt);
        }
    }

    fragColor = vec4(pos, t_i);
}
`;

    // 2. Particle Splat Vertex Shader
    const VS_SPLATS = `#version 300 es
layout(location = 0) in vec2 aDummy;
uniform sampler2D uState;
uniform sampler2D uPrevState;
uniform mat4 uViewProj;
uniform vec3 uEyePos;
uniform float uPointScale;
uniform int uTexW;

out vec3 vColor;
out float vSpeed;
out float vForm;

void main() {
    int id = gl_VertexID;
    ivec2 coord = ivec2(id % uTexW, id / uTexW);
    vec4 state = texelFetch(uState, coord, 0);
    vec4 prevState = texelFetch(uPrevState, coord, 0);

    vec3 pos = state.xyz;
    float t_i = state.w;

    float speed = length(pos - prevState.xyz);
    vSpeed = speed;

    gl_Position = uViewProj * vec4(pos, 1.0);

    // Size with subtle distance attenuation
    gl_PointSize = clamp(uPointScale / max(gl_Position.w * 0.35, 0.32), 1.6, 5.2);

    // Colour: cool desaturated tint at noise -> warming to domain accent as structure forms
    float form = 1.0 - smoothstep(0.001, 0.75, t_i);
    vForm = form;
    vec3 coolNoise = vec3(0.55, 0.70, 0.95);
    vec3 warmBase  = vec3(1.0, 0.88, 0.48);
    vColor = mix(coolNoise, warmBase, form);
}
`;

    // 3. Particle Splat Fragment Shader (smooth radial Gaussian)
    const FS_SPLATS = `#version 300 es
precision highp float;
in vec3 vColor;
in float vSpeed;
in float vForm;
uniform vec3 uAccent;
out vec4 fragColor;

void main() {
    vec2 circ = gl_PointCoord - 0.5;
    float distSq = dot(circ, circ);
    if (distSq > 0.25) discard;
    float alpha = smoothstep(0.25, 0.0, distSq);

    float normSpd = clamp(vSpeed * 14.0, 0.0, 1.0);
    vec3 col = mix(vColor, uAccent * 1.35 + vec3(0.28, 0.22, 0.16), 0.70);
    col = mix(col, vec3(1.0, 0.98, 0.92), normSpd * 0.45);

    // Boosted particle luminous opacity along trajectories
    float luminous = (0.075 + 0.14 * normSpd) * alpha;
    fragColor = vec4(col * luminous, 1.0);
}
`;

    const FS_BLIT = `#version 300 es
precision highp float; in vec2 vUV; out vec4 fragColor; uniform sampler2D uTex;
void main() { fragColor = texture(uTex, vUV); }`;

    /* =========================================================================
       2. Scene Controller Factory
       ========================================================================= */

    function createDiffusionSim(canvas, opts = {}) {
        if (!GFX || !GFX.supported) {
            if (typeof SIMS !== "undefined" && SIMS["langevin-loss-landscapes"]) {
                return SIMS["langevin-loss-landscapes"](canvas, opts);
            }
            return;
        }

        const isMob = typeof window !== "undefined" && window.innerWidth <= 900;
        const side = isMob ? 128 : 256;
        const numParticles = side * side; // 16,384 mobile, 65,536 desktop
        const K = isMob ? 96 : 192;

        let activeTargetIdx = 0;
        let targets = null;

        let statePP = null;
        let noiseTex = null;
        let anchorTex = null;
        let mixtureTex = null;
        let trailPP = null;
        let sceneTarget = null;
        let updateProg = null;
        let splatProg = null;
        let blitProg = null;

        let isODE = 0; // 0: reverse SDE, 1: probability-flow ODE
        let cycleTime = 0.0;
        let simT = 0.001;
        let phase = 0; // 0: hold structure (2s), 1: dissolve (3.5s), 2: hold noise (0.5s), 3: reverse (6s)
        let lastTagTime = 0;
        let doRenoise = 0;
        let clickCenter = [0, 0, 0];
        let clickRadius = 0.65;
        let currentNLL = 0.0;

        // PBO for asynchronous NLL readback
        let nllPBO = null;
        let nllFence = null;
        const SUBSAMPLE_W = 64;
        const SUBSAMPLE_H = 32;
        const SUBSAMPLE_COUNT = SUBSAMPLE_W * SUBSAMPLE_H; // 2,048 particles
        const pboDataBuf = new Float32Array(SUBSAMPLE_COUNT * 4);
        const pboParticlesDbl = new Float64Array(SUBSAMPLE_COUNT * 3);

        const updateCaption = (force = false) => {
            const now = performance.now() * 0.001;
            if (!force && now - lastTagTime < 0.25) return; // <= 4 Hz live caption rate
            lastTagTime = now;

            if (!targets) return;
            const curTarget = targets[activeTargetIdx];
            const a_t = DM ? DM.alpha(simT) : 1.0;
            const s_t2 = DM ? DM.sigma2(simT) : 0.0;
            const snr = (a_t * a_t) / Math.max(s_t2, 1e-4);
            const modeStr = isODE === 1 ? "Probability-flow ODE" : "Reverse-time SDE";
            const nllStr = currentNLL ? currentNLL.toFixed(2) : "…";

            const tag = `${modeStr} · closed-form Gaussian-mixture score · ${curTarget.name} · t = ${simT.toFixed(2)} · SNR = ${snr < 100 ? snr.toFixed(2) : "∞"} · NLL = ${nllStr} · click re-noises · press 'M' to toggle ODE`;
            if (window.KW && window.KW.tag) window.KW.tag(tag, canvas);
        };

        const onKeyDown = (e) => {
            if (e.key === "m" || e.key === "M") {
                isODE = 1 - isODE;
                updateCaption(true);
            }
        };
        if (typeof window !== "undefined") {
            window.addEventListener("keydown", onKeyDown);
        }

        if (window.KW && window.KW.onClick) {
            window.KW.onClick(canvas, (e) => {
                const rect = canvas.getBoundingClientRect();
                const cx = (e.clientX - rect.left) / rect.width * 2.0 - 1.0;
                const cy = 1.0 - (e.clientY - rect.top) / rect.height * 2.0;

                // Approximate unprojection onto world z=0 plane
                clickCenter = [(cx + 0.35) * 1.5, cy * 1.5, 0.0];
                clickRadius = 0.68;
                doRenoise = 1;
            });
        }

        return GFX.mount(canvas, (gfx, c, getSize) => {
            const gl = GFX.gl;
            if (!DM && root.DiffusionMath) DM = root.DiffusionMath;

            targets = [
                DM.getTorusTarget(K),
                DM.getGalaxyTarget(K),
                DM.getTrefoilTarget(K)
            ];

            updateProg = gfx.program(VS_QUAD, FS_UPDATE);
            splatProg = gfx.program(VS_SPLATS, FS_SPLATS);
            blitProg = gfx.program(VS_QUAD, FS_BLIT);

            const uploadMixtureTexture = (target) => {
                const kCount = target.K;
                const data = new Float32Array(kCount * 2 * 4);
                for (let i = 0; i < kCount; i++) {
                    const mu = target.means[i];
                    const sk = target.stds[i];
                    const w = target.weights[i];
                    const idx0 = i * 4;
                    data[idx0]     = mu[0];
                    data[idx0 + 1] = mu[1];
                    data[idx0 + 2] = mu[2];
                    data[idx0 + 3] = sk;
                    const idx1 = (kCount + i) * 4;
                    data[idx1]     = w;
                    data[idx1 + 1] = Math.log(w);
                    data[idx1 + 2] = 0.0;
                    data[idx1 + 3] = 1.0;
                }
                if (!mixtureTex) {
                    mixtureTex = gfx.target(kCount, 2, { fp32: true, nearest: true, data });
                } else {
                    mixtureTex.resize(kCount, 2);
                    mixtureTex.upload(data);
                }
            };

            const initParticleData = (target) => {
                const prng = DM.mulberry32(1048577);
                const norm = DM.createNormalSampler(prng);

                const initPos = DM.sampleP0(target, numParticles, prng);
                const stateData = new Float32Array(numParticles * 4);
                const noiseData = new Float32Array(numParticles * 4);
                const anchorData = new Float32Array(numParticles * 4);

                for (let i = 0; i < numParticles; i++) {
                    const i3 = i * 3;
                    const i4 = i * 4;

                    stateData[i4]     = initPos[i3];
                    stateData[i4 + 1] = initPos[i3 + 1];
                    stateData[i4 + 2] = initPos[i3 + 2];
                    stateData[i4 + 3] = 0.001; // initial t_i

                    anchorData[i4]     = initPos[i3];
                    anchorData[i4 + 1] = initPos[i3 + 1];
                    anchorData[i4 + 2] = initPos[i3 + 2];
                    anchorData[i4 + 3] = 0.0;

                    noiseData[i4]     = norm();
                    noiseData[i4 + 1] = norm();
                    noiseData[i4 + 2] = norm();
                    noiseData[i4 + 3] = prng();
                }

                statePP = gfx.pingPong(side, side, { fp32: true, nearest: true, data: stateData });
                noiseTex = gfx.target(side, side, { fp32: true, nearest: true, data: noiseData });
                anchorTex = gfx.target(side, side, { fp32: true, nearest: true, data: anchorData });
            };

            uploadMixtureTexture(targets[activeTargetIdx]);
            initParticleData(targets[activeTargetIdx]);
            updateCaption(true);

            return {
                resize: (rw, rh) => {
                    if (!trailPP) trailPP = gfx.pingPong(rw, rh, { fp32: false });
                    else trailPP.resize(rw, rh);

                    if (!sceneTarget) sceneTarget = gfx.target(rw, rh, { fp32: false });
                    else sceneTarget.resize(rw, rh);
                },

                frame: (t, dt, ctx2d, outW, outH, isReduced) => {
                    if (isReduced) {
                        phase = 0;
                        simT = 0.001;
                    } else {
                        cycleTime = (cycleTime + dt) % 12.0;

                        if (cycleTime < 2.0) {
                            phase = 0;
                            simT = 0.001;
                        } else if (cycleTime < 5.5) {
                            phase = 1;
                            const u = (cycleTime - 2.0) / 3.5;
                            simT = 0.001 + (1.0 - 0.001) * (u * u * (3.0 - 2.0 * u));
                        } else if (cycleTime < 6.0) {
                            if (phase !== 2) {
                                activeTargetIdx = (activeTargetIdx + 1) % targets.length;
                                uploadMixtureTexture(targets[activeTargetIdx]);
                            }
                            phase = 2;
                            simT = 1.0;
                        } else {
                            phase = 3;
                            const u = (cycleTime - 6.0) / 6.0;
                            simT = 1.0 - (1.0 - 0.001) * u;
                        }
                    }

                    // 1. Simulation Step (Ping-pong RGBA32F)
                    const substeps = isReduced ? 1 : 2;
                    // In 6.0s reverse phase, delta t_i is (0.999 / 6.0) * dt
                    const stepDt = (dt / substeps) * (0.999 / 6.0);
                    const seed = (Math.floor(t * 1000) ^ 0x9e3779b9) >>> 0;

                    for (let s = 0; s < substeps; s++) {
                        updateProg.use()
                            .tex("uState", statePP.read(), 0)
                            .tex("uNoise", noiseTex, 1)
                            .tex("uAnchor", anchorTex, 2)
                            .tex("uMixtureTex", mixtureTex, 3)
                            .i1("uK", targets[activeTargetIdx].K)
                            .f1("uGlobalTime", simT)
                            .f1("uStepDt", stepDt)
                            .i1("uPhase", phase)
                            .i1("uIsODE", isODE)
                            .i1("uDoRenoise", doRenoise)
                            .f3("uClickCenter", clickCenter[0], clickCenter[1], clickCenter[2])
                            .f1("uClickRadius", clickRadius)
                            .i1("uSeed", seed + s);

                        gfx.quad(updateProg, statePP.write(), side, side);
                        statePP.swap();
                        doRenoise = 0;
                    }

                    // 2. Camera View & Projection Matrix
                    const cursor = window.KW && window.KW.local ? window.KW.local(canvas) : { x: -1000, y: -1000 };
                    const hasMouse = cursor.x > -500;
                    const parX = hasMouse ? (cursor.x / (canvas.clientWidth || 800) - 0.5) * 0.7 : 0.0;
                    const parY = hasMouse ? (cursor.y / (canvas.clientHeight || 600) - 0.5) * 0.4 : 0.0;

                    const camTheta = t * 0.14 + parX;
                    const camPhi = 0.38 + 0.14 * Math.sin(t * 0.20) + parY;
                    const camDist = 3.8;

                    // Shift camera target to the left (-0.52) so object sits at cx ≈ 0.68 on desktop
                    const targetX = isMob ? 0.0 : -0.55;
                    const targetY = 0.0;
                    const targetZ = 0.0;

                    const eyeX = targetX + camDist * Math.cos(camTheta) * Math.cos(camPhi);
                    const eyeY = targetY + camDist * Math.sin(camPhi);
                    const eyeZ = targetZ + camDist * Math.sin(camTheta) * Math.cos(camPhi);

                    const aspect = (outW || 800) / Math.max(1, outH || 600);
                    const fov = 46.0 * (Math.PI / 180.0);
                    const f = 1.0 / Math.tan(fov / 2.0);
                    const near = 0.1, far = 20.0;

                    // View matrix
                    const zx = eyeX - targetX, zy = eyeY - targetY, zz = eyeZ - targetZ;
                    const zLen = Math.hypot(zx, zy, zz) || 1.0;
                    const z0 = zx / zLen, z1 = zy / zLen, z2 = zz / zLen;

                    const xx = -z2, xy = 0.0, xz = z0;
                    const xLen = Math.hypot(xx, xy, xz) || 1.0;
                    const x0 = xx / xLen, x1 = xy / xLen, x2 = xz / xLen;

                    const y0 = z1 * x2 - z2 * x1;
                    const y1 = z2 * x0 - z0 * x2;
                    const y2 = z0 * x1 - z1 * x0;

                    const v0 = x0, v1 = y0, v2 = z0;
                    const v4 = x1, v5 = y1, v6 = z1;
                    const v8 = x2, v9 = y2, v10 = z2;
                    const v12 = -(x0 * eyeX + x1 * eyeY + x2 * eyeZ);
                    const v13 = -(y0 * eyeX + y1 * eyeY + y2 * eyeZ);
                    const v14 = -(z0 * eyeX + z1 * eyeY + z2 * eyeZ);

                    const p0 = f / aspect, p5 = f;
                    const p10 = (far + near) / (near - far);
                    const p11 = -1.0;
                    const p14 = (2.0 * far * near) / (near - far);

                    const vp = new Float32Array(16);
                    vp[0] = p0 * v0;  vp[4] = p0 * v4;  vp[8] = p0 * v8;   vp[12] = p0 * v12;
                    vp[1] = p5 * v1;  vp[5] = p5 * v5;  vp[9] = p5 * v9;   vp[13] = p5 * v13;
                    vp[2] = p10 * v2; vp[6] = p10 * v6; vp[10] = p10 * v10; vp[14] = p10 * v14 + p14;
                    vp[3] = -v2;      vp[7] = -v6;      vp[11] = -v10;     vp[15] = -v14;

                    // 3. Fading Accumulation Trails Pass
                    const trailScene = gfx.fadeScene(trailPP, isReduced ? 0.0 : 0.94);
                    sceneTarget.clear(0, 0, 0, 1);

                    // Copy faded trail into sceneTarget
                    blitProg.use().tex("uTex", trailScene, 0);
                    gfx.quad(blitProg, sceneTarget);

                    // Additive particle splats
                    const aCol = (window.KW && window.KW.col && window.KW.col.a) || [245, 166, 35];
                    const aR = aCol[0] / 255.0, aG = aCol[1] / 255.0, aB = aCol[2] / 255.0;

                    splatProg.use()
                        .tex("uState", statePP.read(), 0)
                        .tex("uPrevState", statePP.write(), 1)
                        .mat4("uViewProj", vp)
                        .f3("uEyePos", eyeX, eyeY, eyeZ)
                        .f1("uPointScale", isMob ? 2.6 : 3.4)
                        .i1("uTexW", side)
                        .f3("uAccent", aR, aG, aB);

                    gfx.drawPoints(splatProg, sceneTarget, numParticles);

                    // Copy sceneTarget into trail write buffer for next frame
                    blitProg.use().tex("uTex", sceneTarget, 0);
                    gfx.quad(blitProg, trailPP.write());
                    trailPP.swap();

                    // 4. Tonemap, Bloom, and Blit to Slide Canvas
                    gfx.compose(sceneTarget, ctx2d, outW, outH, {
                        time: t,
                        bloomGain: 0.55,
                        threshold: 0.32,
                        exposure: 1.25,
                        accent: aCol
                    });

                    // 5. Asynchronous NLL Readback (PBO + sync fence, non-blocking at <= 4 Hz)
                    if (gl && !nllPBO) {
                        nllPBO = gl.createBuffer();
                        gl.bindBuffer(gl.PIXEL_PACK_BUFFER, nllPBO);
                        gl.bufferData(gl.PIXEL_PACK_BUFFER, SUBSAMPLE_COUNT * 4 * 4, gl.STREAM_READ);
                        gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
                    }

                    if (gl && nllFence) {
                        const status = gl.clientWaitSync(nllFence, 0, 0);
                        if (status === gl.ALREADY_SIGNALED || status === gl.CONDITION_SATISFIED) {
                            gl.deleteSync(nllFence);
                            nllFence = null;
                            gl.bindBuffer(gl.PIXEL_PACK_BUFFER, nllPBO);
                            gl.getBufferSubData(gl.PIXEL_PACK_BUFFER, 0, pboDataBuf);
                            gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);

                            for (let i = 0; i < SUBSAMPLE_COUNT; i++) {
                                pboParticlesDbl[i * 3]     = pboDataBuf[i * 4];
                                pboParticlesDbl[i * 3 + 1] = pboDataBuf[i * 4 + 1];
                                pboParticlesDbl[i * 3 + 2] = pboDataBuf[i * 4 + 2];
                            }
                            if (DM) {
                                currentNLL = DM.readoutNLL(pboParticlesDbl, targets[activeTargetIdx]);
                            }
                        }
                    }

                    const nowSec = performance.now() * 0.001;
                    if (gl && !nllFence && nllPBO && (nowSec - lastTagTime >= 0.25)) {
                        gl.bindFramebuffer(gl.FRAMEBUFFER, statePP.read().fbo);
                        gl.bindBuffer(gl.PIXEL_PACK_BUFFER, nllPBO);
                        gl.readPixels(0, 0, SUBSAMPLE_W, SUBSAMPLE_H, gl.RGBA, gl.FLOAT, 0);
                        gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
                        nllFence = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
                    }

                    updateCaption();
                },

                dispose: () => {
                    if (typeof window !== "undefined") {
                        window.removeEventListener("keydown", onKeyDown);
                    }
                    if (gl) {
                        if (nllFence) gl.deleteSync(nllFence);
                        if (nllPBO) gl.deleteBuffer(nllPBO);
                    }
                    if (statePP) statePP.dispose();
                    if (noiseTex) noiseTex.dispose();
                    if (anchorTex) anchorTex.dispose();
                    if (mixtureTex) mixtureTex.dispose();
                    if (trailPP) trailPP.dispose();
                    if (sceneTarget) sceneTarget.dispose();
                }
            };
        });
    }

    SIMS["diffusion"] = SIMS["noise-to-structure"] = SIMS.datascience = createDiffusionSim;
}));
