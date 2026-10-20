/* GPU Galaxy Collision Simulation (shared/gpu/gpu-nbody.js).
   Toomre restricted model: 2 massive softened cores integrated with KDK leapfrog,
   and 200,000 massless tracers (50,000 on mobile) in circumstellar rings.
   Symplectic kick-drift-kick integrator with Plummer softening epsilon = 0.05.
   Additive HDR splats coloured by progenitor galaxy and speed; tidal tails and bridges. */

(function (root, factory) {
    if (typeof module === "object" && module.exports) module.exports = factory(root);
    else factory(root);
}(typeof self !== "undefined" ? self : this, function (root) {
    "use strict";

    root.SIMS = root.SIMS || {};
    const SIMS = root.SIMS;
    const GFX = root.GFX;

    const EPS_SQ = 0.05 * 0.05; // Plummer softening epsilon = 0.05

    // Initial tracer disc generation around two cores
    const FS_INIT = `#version 300 es
precision highp float;
precision highp int;
in vec2 vUV;
out vec4 fragColor;
uniform int uTexW;
uniform vec4 uCore1; // (x, y, vx, vy)
uniform vec4 uCore2;
uniform int uOutput; // 0 = position, 1 = velocity
${GFX.GLSL_PRNG}

void main() {
    ivec2 p = ivec2(gl_FragCoord.xy);
    int idx = p.y * uTexW + p.x;
    int halfCount = (uTexW * uTexW) / 2;
    int gId = idx < halfCount ? 1 : 2; // Galaxy 1 or 2
    uint s = uint(idx) * 23971u + 13u;

    vec2 cPos = gId == 1 ? uCore1.xy : uCore2.xy;
    vec2 cVel = gId == 1 ? uCore1.zw : uCore2.zw;

    // Concentric ring distribution r in [0.15, 0.85]
    float u = rand01(s);
    float r = 0.15 + 0.70 * sqrt(u);
    float angle = rand01(s) * 6.28318530718;

    // Keplerian circular speed v = sqrt(M / (r^2 + eps^2)^0.5)
    float vCirc = sqrt(1.0 / sqrt(r * r + 0.0025));
    // Inclination tilt: galaxy 1 prograde in plane, galaxy 2 retrograde/inclined
    vec2 rPos = vec2(cos(angle), sin(angle)) * r;
    vec2 rVel = vec2(-sin(angle), cos(angle)) * vCirc;

    if (gId == 2) {
        rPos.y *= 0.72; // Inclination projection
        rVel.y *= 0.72;
    }

    if (uOutput == 0) {
        // Position: (x, y, z, galaxyID)
        fragColor = vec4(cPos + rPos, 0.0, float(gId));
    } else {
        // Velocity: (vx, vy, vz, speed)
        fragColor = vec4(cVel + rVel, 0.0, vCirc);
    }
}`;

    // Velocity Half-Kick: v += 0.5 * dt * a(r)
    const FS_KICK = `#version 300 es
precision highp float;
in vec2 vUV;
out vec4 fragColor;
uniform sampler2D uPos;
uniform sampler2D uVel;
uniform vec2 uCore1Pos;
uniform vec2 uCore2Pos;
uniform float uHalfDt;

void main() {
    ivec2 coord = ivec2(gl_FragCoord.xy);
    vec4 p = texelFetch(uPos, coord, 0);
    vec4 v = texelFetch(uVel, coord, 0);

    vec2 d1 = uCore1Pos - p.xy;
    float r1_sq = dot(d1, d1) + 0.0025; // Plummer softening eps = 0.05
    vec2 a1 = d1 / (r1_sq * sqrt(r1_sq));

    vec2 d2 = uCore2Pos - p.xy;
    float r2_sq = dot(d2, d2) + 0.0025;
    vec2 a2 = d2 / (r2_sq * sqrt(r2_sq));

    vec2 newV = v.xy + (a1 + a2) * uHalfDt;
    fragColor = vec4(newV, 0.0, length(newV));
}`;

    // Position Drift: r += dt * v
    const FS_DRIFT = `#version 300 es
precision highp float;
in vec2 vUV;
out vec4 fragColor;
uniform sampler2D uPos;
uniform sampler2D uVel;
uniform float uDt;

void main() {
    ivec2 coord = ivec2(gl_FragCoord.xy);
    vec4 p = texelFetch(uPos, coord, 0);
    vec4 v = texelFetch(uVel, coord, 0);
    fragColor = vec4(p.xy + v.xy * uDt, p.z, p.w);
}`;

    // Particle Splat Vertex Shader
    const VS_TRACERS = `#version 300 es
precision highp float;
precision highp int;
uniform sampler2D uPos;
uniform sampler2D uVel;
uniform int uTexW;
uniform float uAspect;
uniform vec2 uPan;
uniform float uZoom;
out float vSpeed;
out float vGalaxy;

void main() {
    ivec2 uv = ivec2(gl_VertexID % uTexW, gl_VertexID / uTexW);
    vec4 pos = texelFetch(uPos, uv, 0);
    vec4 vel = texelFetch(uVel, uv, 0);
    vSpeed = vel.w;
    vGalaxy = pos.w;

    vec2 p = (pos.xy - uPan) * uZoom;
    gl_Position = vec4(p.x / uAspect, p.y, 0.0, 1.0);
    gl_PointSize = 1.6;
}`;

    // Particle Splat Fragment Shader
    const FS_TRACERS = `#version 300 es
precision highp float;
in float vSpeed; in float vGalaxy; out vec4 fragColor; uniform vec3 uAccent;
void main() {
    vec2 circ = gl_PointCoord - 0.5;
    float d2 = dot(circ, circ);
    if (d2 > 0.25) discard;
    float alpha = smoothstep(0.25, 0.0, d2);
    vec3 galCol = vGalaxy < 1.5 ? uAccent : mix(vec3(0.95, 0.45, 0.25), vec3(1.0, 0.85, 0.4), 0.5);
    float spdNorm = clamp(vSpeed * 0.35, 0.0, 1.0);
    vec3 col = mix(galCol * 0.8, vec3(1.0), pow(spdNorm, 1.5));
    fragColor = vec4(col * (0.045 + 0.08 * spdNorm) * alpha, 1.0);
}`;

    SIMS["nbody-leapfrog"] = (canvas, opts = {}) => {
        if (!GFX || !GFX.supported) {
            if (root.ENGINES && root.ENGINES.nbody) {
                return root.ENGINES.nbody(canvas, { mode: "colliding-clusters", n: 180 });
            }
            return null;
        }

        const isMob = GFX.isMobile();
        const texW = isMob ? 224 : 448;
        const count = texW * texW; // 50,176 mobile, 200,704 desktop
        const dt = 0.0035;

        // Core Pair Initial Conditions (eccentric encounter)
        let c1x = -1.6, c1y = -0.45, c1vx =  0.42, c1vy =  0.22;
        let c2x =  1.6, c2y =  0.45, c2vx = -0.42, c2vy = -0.22;

        const initProg = GFX.program(GFX.VS_QUAD, FS_INIT);
        const kickProg = GFX.program(GFX.VS_QUAD, FS_KICK);
        const driftProg = GFX.program(GFX.VS_QUAD, FS_DRIFT);
        const drawProg = GFX.program(VS_TRACERS, FS_TRACERS);

        let parts = null, trailPP = null, sceneTarget = null, acc = 0;

        const resetSim = () => {
            c1x = -1.6; c1y = -0.45; c1vx =  0.42; c1vy =  0.22;
            c2x =  1.6; c2y =  0.45; c2vx = -0.42; c2vy = -0.22;
            if (!parts) parts = GFX.particles(texW, texW, { dual: true });
            initProg.use()
                .i1("uTexW", texW)
                .f4("uCore1", c1x, c1y, c1vx, c1vy)
                .f4("uCore2", c2x, c2y, c2vx, c2vy)
                .i1("uOutput", 0);
            GFX.quad(initProg, parts.state.read(), texW, texW);
            initProg.use().i1("uOutput", 1);
            GFX.quad(initProg, parts.aux.read(), texW, texW);
            if (trailPP) trailPP.clear(0, 0, 0, 1);
        };

        KW.tag("Galaxy collision · 200k particles · Symplectic KDK leapfrog · Toomre restricted model · click to restart", canvas);
        KW.onClick(canvas, resetSim);

        // Core pair symplectic KDK step
        const stepCores = (subDt) => {
            let dx = c2x - c1x, dy = c2y - c1y;
            let invR3 = 1.0 / Math.pow(dx * dx + dy * dy + EPS_SQ, 1.5);
            c1vx += 0.5 * subDt * dx * invR3; c1vy += 0.5 * subDt * dy * invR3;
            c2vx -= 0.5 * subDt * dx * invR3; c2vy -= 0.5 * subDt * dy * invR3;
            c1x += subDt * c1vx; c1y += subDt * c1vy;
            c2x += subDt * c2vx; c2y += subDt * c2vy;
            dx = c2x - c1x; dy = c2y - c1y;
            invR3 = 1.0 / Math.pow(dx * dx + dy * dy + EPS_SQ, 1.5);
            c1vx += 0.5 * subDt * dx * invR3; c1vy += 0.5 * subDt * dy * invR3;
            c2vx -= 0.5 * subDt * dx * invR3; c2vy -= 0.5 * subDt * dy * invR3;
        };

        return GFX.mount(canvas, (gfx, c, getSize) => ({
            resize: (rw, rh) => {
                resetSim();
                if (!trailPP) trailPP = gfx.pingPong(rw, rh, { fp32: false });
                else trailPP.resize(rw, rh);
                if (!sceneTarget) sceneTarget = gfx.target(rw, rh, { fp32: false });
                else sceneTarget.resize(rw, rh);
            },
            frame: (t, deltaT, ctx2d, outW, outH, isReduced) => {
                acc = Math.min(acc + deltaT, 0.05);
                const steps = isReduced ? 1 : Math.floor(acc / dt);

                for (let s = 0; s < steps; s++) {
                    // 1. Kick aux (v) reading state (pos)
                    kickProg.use()
                        .tex("uPos", parts.state.read(), 0)
                        .tex("uVel", parts.aux.read(), 1)
                        .f2("uCore1Pos", c1x, c1y)
                        .f2("uCore2Pos", c2x, c2y)
                        .f1("uHalfDt", 0.5 * dt);
                    gfx.quad(kickProg, parts.aux.write(), texW, texW);
                    parts.aux.swap();

                    // 2. Drift state (pos) reading aux (v)
                    driftProg.use()
                        .tex("uPos", parts.state.read(), 0)
                        .tex("uVel", parts.aux.read(), 1)
                        .f1("uDt", dt);
                    gfx.quad(driftProg, parts.state.write(), texW, texW);
                    parts.state.swap();

                    stepCores(dt);

                    // 3. Kick aux (v) reading updated state (pos)
                    kickProg.use()
                        .tex("uPos", parts.state.read(), 0)
                        .tex("uVel", parts.aux.read(), 1)
                        .f2("uCore1Pos", c1x, c1y)
                        .f2("uCore2Pos", c2x, c2y)
                        .f1("uHalfDt", 0.5 * dt);
                    gfx.quad(kickProg, parts.aux.write(), texW, texW);
                    parts.aux.swap();

                    acc -= dt;
                }

                // Render with fading trail accumulation
                const trailScene = gfx.fadeScene(trailPP, isReduced ? 0.0 : 0.93);
                sceneTarget.clear(0, 0, 0, 1);

                const blit = gfx.program(gfx.VS_QUAD, `#version 300 es
precision highp float; in vec2 vUV; out vec4 fragColor; uniform sampler2D uTex;
void main() { fragColor = texture(uTex, vUV); }`);
                blit.use().tex("uTex", trailScene, 0);
                gfx.quad(blit, sceneTarget);

                // Additive tracers
                const a = KW.col.a;
                const aspect = sceneTarget.w / Math.max(1, sceneTarget.h);
                const cursor = KW.local(canvas);
                const panX = cursor.x > -500 ? (cursor.x / (canvas.clientWidth || 800) - 0.5) * 0.4 : 0.0;
                const panY = cursor.y > -500 ? (cursor.y / (canvas.clientHeight || 600) - 0.5) * -0.4 : 0.0;

                parts.draw(drawProg, (p) => {
                    p.tex("uVel", parts.aux.read(), 1)
                     .f1("uAspect", aspect)
                     .f2("uPan", panX, panY)
                     .f1("uZoom", 0.36)
                     .f3("uAccent", a[0] / 255, a[1] / 255, a[2] / 255);
                }, sceneTarget, count);

                blit.use().tex("uTex", sceneTarget, 0);
                gfx.quad(blit, trailPP.write());
                trailPP.swap();

                gfx.compose(sceneTarget, ctx2d, outW, outH, {
                    time: t,
                    bloomGain: 0.52,
                    threshold: 0.30,
                    exposure: 1.25
                });
            },
            dispose: () => {
                if (parts) parts.dispose();
                if (trailPP) trailPP.dispose();
                if (sceneTarget) sceneTarget.dispose();
            }
        }));
    };
}));
