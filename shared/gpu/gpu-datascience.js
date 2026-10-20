/* GPU Langevin Dynamics on Loss Landscape (shared/gpu/gpu-datascience.js).
   20,000 particles (5,000 on mobile) integrated via overdamped Langevin SDE:
   dθ = -∇U(θ)*dt + sqrt(2*T*dt)*ξ,   ξ ~ N(0, I).
   Shaded non-convex loss topography with analytical contour lines.
   Particles luminesce into HDR bloom, demonstrating Kramers saddle-point escape
   and Gibbs-Boltzmann stationary concentration p(θ) ∝ exp(-U(θ)/T). */

(function (root, factory) {
    if (typeof module === "object" && module.exports) module.exports = factory(root);
    else factory(root);
}(typeof self !== "undefined" ? self : this, function (root) {
    "use strict";

    root.SIMS = root.SIMS || {};
    const SIMS = root.SIMS;
    const GFX = root.GFX;

    const FS_INIT_PARTICLES = `#version 300 es
precision highp float;
precision highp int;
in vec2 vUV; out vec4 fragColor;
uniform uint uSeed; uniform int uTexW;
${GFX.GLSL_PRNG}

void main() {
    ivec2 p = ivec2(gl_FragCoord.xy);
    uint s = uSeed + uint(p.y * uTexW + p.x) * 1973u;
    vec2 r1 = boxMuller(s);
    vec2 pos = clamp(r1 * 0.95, vec2(-2.0), vec2(2.0));
    fragColor = vec4(pos, 0.0, 1.0);
}`;

    const FS_STEP_LANGEVIN = `#version 300 es
precision highp float;
precision highp int;
in vec2 vUV; out vec4 fragColor;
uniform sampler2D uState;
uniform float uDt, uTemp;
uniform uint uSeed; uniform int uTexW;
${GFX.GLSL_PRNG}

vec2 computeGrad(vec2 p) {
    float gx = 4.0 * p.x * (p.x * p.x - 1.0) - 0.22 * 3.6 * sin(3.6 * p.x) * cos(3.6 * p.y);
    float gy = 2.5 * p.y - 0.22 * 3.6 * cos(3.6 * p.x) * sin(3.6 * p.y);
    return vec2(gx, gy);
}

void main() {
    ivec2 coord = ivec2(gl_FragCoord.xy);
    vec4 st = texelFetch(uState, coord, 0);
    vec2 pos = st.xy;

    uint s = uSeed + uint(coord.y * uTexW + coord.x) * 2654435761u;
    vec2 xi = boxMuller(s);

    vec2 grad = computeGrad(pos);
    float diffCoeff = sqrt(max(2.0 * uTemp * uDt, 0.0));

    vec2 nextPos = pos - grad * uDt + diffCoeff * xi;

    if (abs(nextPos.x) > 2.4) nextPos.x = clamp(nextPos.x, -2.4, 2.4) * 0.96;
    if (abs(nextPos.y) > 2.4) nextPos.y = clamp(nextPos.y, -2.4, 2.4) * 0.96;

    fragColor = vec4(nextPos, 0.0, 1.0);
}`;

    const FS_LANDSCAPE = `#version 300 es
precision highp float;
in vec2 vUV; out vec4 fragColor;
uniform vec3 uAccent;

float potential(vec2 p) {
    return (p.x * p.x - 1.0) * (p.x * p.x - 1.0) + 1.25 * p.y * p.y + 0.22 * cos(3.6 * p.x) * cos(3.6 * p.y);
}

void main() {
    vec2 p = (vUV * 2.0 - 1.0) * 2.4;
    float u = potential(p);

    float eps = 0.01;
    float du_dx = (potential(p + vec2(eps, 0.0)) - potential(p - vec2(eps, 0.0))) / (2.0 * eps);
    float du_dy = (potential(p + vec2(0.0, eps)) - potential(p - vec2(0.0, eps))) / (2.0 * eps);
    vec3 norm = normalize(vec3(-du_dx, -du_dy, 1.4));

    vec3 lightDir = normalize(vec3(0.5, 0.8, 1.2));
    float diff = max(dot(norm, lightDir), 0.0);

    float contour = abs(fract(u * 1.5 - 0.5) - 0.5);
    float line = smoothstep(0.04, 0.005, contour);

    vec3 bgBase = vec3(0.008, 0.010, 0.018);
    vec3 basinCol = mix(bgBase, uAccent * 0.18, clamp(1.2 - u * 0.45, 0.0, 1.0));
    vec3 ridgeCol = vec3(0.03, 0.035, 0.05) * diff;

    vec3 col = mix(basinCol, ridgeCol, clamp(u * 0.25, 0.0, 1.0));
    col += uAccent * (line * 0.16);

    fragColor = vec4(col, 1.0);
}`;

    const VS_PARTICLES = `#version 300 es
precision highp float;
uniform sampler2D uState;
uniform int uTexW;

void main() {
    ivec2 coord = ivec2(gl_VertexID % uTexW, gl_VertexID / uTexW);
    vec2 pos = texelFetch(uState, coord, 0).xy;

    vec2 ndc = (pos / 2.4) * 0.92;
    gl_Position = vec4(ndc, 0.0, 1.0);
    gl_PointSize = 1.8;
}`;

    const FS_PARTICLES = `#version 300 es
precision highp float;
out vec4 fragColor;
uniform vec3 uAccent;

void main() {
    vec2 c = gl_PointCoord - 0.5;
    if (dot(c, c) > 0.25) discard;
    vec3 col = mix(uAccent, vec3(1.0, 0.95, 0.85), 0.55);
    fragColor = vec4(col * 0.055, 1.0);
}`;

    SIMS["langevin-loss-landscapes"] = SIMS["paper:langevin-loss-landscapes:hero"] = SIMS.datascience = (canvas, opts = {}) => {
        if (!GFX || !GFX.supported) return;

        const isMobile = typeof window !== "undefined" && window.innerWidth <= 900;
        const numParticles = isMobile ? 5000 : 20000;
        const texW = Math.ceil(Math.sqrt(numParticles));
        const texH = Math.ceil(numParticles / texW);
        let frameSeed = 987654321;
        let T = opts.temp || 0.60;
        let annealing = false;
        const dt = 0.005;

        const initProg = GFX.program(GFX.VS_QUAD, FS_INIT_PARTICLES);
        const stepProg = GFX.program(GFX.VS_QUAD, FS_STEP_LANGEVIN);
        const landProg = GFX.program(GFX.VS_QUAD, FS_LANDSCAPE);
        const partProg = GFX.program(VS_PARTICLES, FS_PARTICLES);

        let parts = null;
        let sceneTarget = null;

        const updateCaption = () => {
            const regime = annealing ? "Simulated annealing (cooling)" : (T > 0.85 ? "High T: Kramers barrier crossing" : (T < 0.25 ? "Low T: Gibbs basin condensation" : "Equilibrium exploration"));
            const tag = `Langevin SDE (${numParticles.toLocaleString()} particles) · T = ${T.toFixed(2)} · ${regime} · drag to set T / click to anneal`;
            if (window.KW && window.KW.tag) window.KW.tag(tag, canvas);
        };
        updateCaption();

        let dragging = false;
        const onDown = (e) => { dragging = true; annealing = false; onMove(e); };
        const onMove = (e) => {
            if (!dragging && e.type === "pointermove" && !e.buttons) return;
            const rect = canvas.getBoundingClientRect();
            const relY = 1.0 - Math.min(1.0, Math.max(0.0, (e.clientY - rect.top) / Math.max(1, rect.height)));
            T = 0.08 + relY * 1.8;
            updateCaption();
        };
        const onUp = () => { dragging = false; };
        const onClick = () => {
            annealing = !annealing;
            if (annealing && T < 0.6) T = 1.6;
            updateCaption();
        };

        canvas.addEventListener("pointerdown", onDown);
        canvas.addEventListener("pointermove", onMove);
        if (typeof window !== "undefined") window.addEventListener("pointerup", onUp);
        canvas.addEventListener("click", onClick);

        return GFX.mount(canvas, (gfx, c, getSize) => ({
            resize: (rw, rh) => {
                if (!parts) {
                    parts = gfx.particles(texW, texH);
                    initProg.use()
                        .i1("uTexW", texW);
                    GFX.gl.uniform1ui(initProg.u("uSeed"), 94821);
                    gfx.quad(initProg, parts.state.read(), texW, texH);
                }
                if (!sceneTarget) sceneTarget = gfx.target(rw, rh, { fp32: false });
                else sceneTarget.resize(rw, rh);
            },
            frame: (t, frameDt, ctx2d, outW, outH, isReduced) => {
                if (annealing && T > 0.08) {
                    T = Math.max(0.08, T * 0.994);
                    updateCaption();
                }

                const substeps = isReduced ? 1 : 4;
                const gl = GFX.gl;

                stepProg.use()
                    .i1("uTexW", texW)
                    .f1("uDt", dt)
                    .f1("uTemp", T);

                for (let s = 0; s < substeps; s++) {
                    frameSeed = (frameSeed * 1664525 + 1013904223) >>> 0;
                    gl.uniform1ui(stepProg.u("uSeed"), frameSeed);
                    parts.step(stepProg);
                }

                const a = (window.KW && window.KW.col && window.KW.col.a) || [89, 217, 166];

                // 1. Shaded topography
                landProg.use().f3("uAccent", a[0] / 255, a[1] / 255, a[2] / 255);
                gfx.quad(landProg, sceneTarget);

                // 2. Additive particle splats
                parts.draw(partProg, (p) => {
                    p.i1("uTexW", texW).f3("uAccent", a[0] / 255, a[1] / 255, a[2] / 255);
                }, sceneTarget, numParticles);

                gfx.compose(sceneTarget, ctx2d, outW, outH, {
                    time: t,
                    bloomGain: 0.52,
                    threshold: 0.35,
                    exposure: 1.18
                });
            },
            dispose: () => {
                canvas.removeEventListener("pointerdown", onDown);
                canvas.removeEventListener("pointermove", onMove);
                if (typeof window !== "undefined") window.removeEventListener("pointerup", onUp);
                canvas.removeEventListener("click", onClick);
                if (parts) parts.dispose();
                if (sceneTarget) sceneTarget.dispose();
            }
        }));
    };
}));
