/* GPU Strange Attractor (shared/gpu/gpu-hub.js).
   262,144 particles (65,536 on mobile) integrated with RK4 on the Lorenz system
   (sigma = 10, rho = 28, beta = 8/3) with click-toggle Aizawa mode.
   Additive HDR splats, fading accumulation trails, speed-to-accent palette ramp,
   slow camera orbit and cursor parallax. */

(function (root, factory) {
    if (typeof module === "object" && module.exports) module.exports = factory(root);
    else factory(root);
}(typeof self !== "undefined" ? self : this, function (root) {
    "use strict";

    root.SIMS = root.SIMS || {};
    const SIMS = root.SIMS;
    const GFX = root.GFX;

    const FS_INIT = `#version 300 es
precision highp float;
precision highp int;
in vec2 vUV;
out vec4 fragColor;
uniform uint uSeed;
${GFX.GLSL_PRNG}
void main() {
    ivec2 p = ivec2(gl_FragCoord.xy);
    uint s = uSeed + uint(p.y * 1024 + p.x) * 1973u;
    vec2 b1 = boxMuller(s);
    vec2 b2 = boxMuller(s);
    // Initial cluster around attractor lobe
    fragColor = vec4(1.0 + b1.x * 3.0, 1.0 + b1.y * 3.0, 20.0 + b2.x * 5.0, 0.0);
}`;

    const FS_STEP = `#version 300 es
precision highp float;
precision highp int;
in vec2 vUV;
out vec4 fragColor;
uniform sampler2D uState;
uniform float uDt;
uniform int uMode; // 0 = Lorenz, 1 = Aizawa
uniform uint uSeed;
${GFX.GLSL_PRNG}

vec3 deriv(vec3 p) {
    if (uMode == 0) {
        return vec3(10.0 * (p.y - p.x), p.x * (28.0 - p.z) - p.y, p.x * p.y - (8.0 / 3.0) * p.z);
    } else {
        float x = p.x, y = p.y, z = p.z;
        return vec3((z - 0.7) * x - 3.5 * y, 3.5 * x + (z - 0.7) * y,
                    0.6 + 0.95 * z - (z * z * z) / 3.0 - (x * x + y * y) * (1.0 + 0.25 * z) + 0.1 * z * (x * x * x));
    }
}

void main() {
    ivec2 coord = ivec2(gl_FragCoord.xy);
    vec4 st = texelFetch(uState, coord, 0);
    vec3 p = st.xyz;
    float dt = uDt;

    // RK4 integration
    vec3 k1 = deriv(p);
    vec3 k2 = deriv(p + 0.5 * dt * k1);
    vec3 k3 = deriv(p + 0.5 * dt * k2);
    vec3 k4 = deriv(p + dt * k3);
    vec3 nextP = p + (dt / 6.0) * (k1 + 2.0 * k2 + 2.0 * k3 + k4);
    float speed = length(k4);

    // Escape or singularity detection -> respawn
    float r = length(nextP);
    if (isnan(r) || isinf(r) || r > (uMode == 0 ? 90.0 : 5.0) || r < 0.05) {
        uint s = uSeed + uint(coord.y * 1024 + coord.x) + uint(uDt * 1e6);
        vec2 b = boxMuller(s);
        if (uMode == 0) {
            nextP = vec3(0.5 + b.x * 2.0, 0.5 + b.y * 2.0, 20.0 + rand01(s) * 8.0);
        } else {
            nextP = vec3(0.1 + b.x * 0.2, 0.1 + b.y * 0.2, 0.1);
        }
        speed = 0.0;
    }

    fragColor = vec4(nextP, speed);
}`;

    const VS_SPLATS = `#version 300 es
precision highp float;
precision highp int;
uniform sampler2D uState;
uniform int uTexW;
uniform mat4 uViewProj;
uniform int uMode;
out float vSpeed;

void main() {
    ivec2 uv = ivec2(gl_VertexID % uTexW, gl_VertexID / uTexW);
    vec4 st = texelFetch(uState, uv, 0);
    vec3 pos = st.xyz;
    vSpeed = st.w;

    if (uMode == 0) {
        pos.z -= 25.0; // Center Lorenz attractor at origin
        pos *= 0.055;
    } else {
        pos.z -= 0.5;
        pos *= 1.35;
    }

    gl_Position = uViewProj * vec4(pos, 1.0);
    // Point size with subtle depth attenuation
    gl_PointSize = clamp(2.2 / max(gl_Position.w * 0.5, 0.5), 1.2, 3.2);
}`;

    const FS_SPLATS = `#version 300 es
precision highp float;
precision highp int;
in float vSpeed;
out vec4 fragColor;
uniform vec3 uAccent;
uniform int uMode;

void main() {
    vec2 circ = gl_PointCoord - 0.5;
    float distSq = dot(circ, circ);
    if (distSq > 0.25) discard;
    float alpha = smoothstep(0.25, 0.0, distSq);

    float maxSpd = uMode == 0 ? 80.0 : 4.5;
    float normSpd = clamp(vSpeed / maxSpd, 0.0, 1.0);

    // Accent-to-white speed ramp
    vec3 col = mix(uAccent * 0.8, vec3(1.0, 0.98, 0.95), pow(normSpd, 1.4));
    // High dynamic range luminous splat
    fragColor = vec4(col * (0.038 + 0.065 * normSpd) * alpha, 1.0);
}`;

    SIMS.hub = (canvas, opts = {}) => {
        if (!GFX || !GFX.supported) {
            if (root.ENGINES && root.ENGINES.orbit) {
                return root.ENGINES.orbit(canvas, { system: "lorenz", sigma: 10, rho: 28, beta: 8/3, dt: 0.005, scale: 16 });
            }
            return null;
        }

        const isMob = GFX.isMobile();
        const texW = isMob ? 256 : 512;
        const texH = isMob ? 256 : 512; // 65,536 mobile, 262,144 desktop
        const count = texW * texH;

        const initProg = GFX.program(GFX.VS_QUAD, FS_INIT);
        const stepProg = GFX.program(GFX.VS_QUAD, FS_STEP);
        const drawProg = GFX.program(VS_SPLATS, FS_SPLATS);
        const gl = GFX.gl;

        let parts = null;
        let trailPP = null;
        let sceneTarget = null;
        let mode = 0; // 0 = Lorenz, 1 = Aizawa
        let camYaw = 0.6, camPitch = 0.28;
        let acc = 0;
        const dtFixed = 0.004;

        const tagLorenz = "Lorenz attractor · 262k GPU particles · RK4 · click to toggle Aizawa · cursor orbits";
        const tagAizawa = "Aizawa attractor · 262k GPU particles · RK4 · click to toggle Lorenz · cursor orbits";
        const eqLorenz = String.raw`$$\dot x=\sigma(y-x),\quad\dot y=x(\rho-z)-y,\quad\dot z=xy-\beta z$$`;
        const eqAizawa = String.raw`$$\dot x=(z-0.7)x-3.5y,\quad\dot y=3.5x+(z-0.7)y,\quad\dot z=0.6+0.95z-\tfrac{z^3}{3}-(x^2+y^2)(1+0.25z)+0.1zx^3$$`;

        const updateHeroEq = (m) => {
            const sec = canvas.closest("section") || (typeof document !== "undefined" ? document.getElementById("intro") : null);
            const eqEl = sec ? sec.querySelector(".hero-eq") : null;
            if (eqEl) {
                eqEl.textContent = (m === 0 ? eqLorenz : eqAizawa);
                if (typeof window !== "undefined" && window.renderMathInElement) {
                    try {
                        window.renderMathInElement(eqEl, {
                            delimiters: [
                                { left: "$$", right: "$$", display: true },
                                { left: "$", right: "$", display: false }
                            ],
                            throwOnError: false
                        });
                    } catch (e) {}
                }
            }
        };

        KW.tag(tagLorenz, canvas);
        KW.onClick(canvas, () => {
            mode = 1 - mode;
            KW.tag(mode === 0 ? tagLorenz : tagAizawa, canvas);
            updateHeroEq(mode);
            if (trailPP) trailPP.clear(0, 0, 0, 1);
        });

        return GFX.mount(canvas, (gfx, c, getSize) => ({
            resize: (rw, rh) => {
                if (!parts) {
                    parts = gfx.particles(texW, texH);
                    initProg.use();
                    gl.uniform1ui(initProg.u("uSeed"), 94821);
                    gfx.quad(initProg, parts.state.read());
                }
                if (!trailPP) trailPP = gfx.pingPong(rw, rh, { fp32: false });
                else trailPP.resize(rw, rh);
                if (!sceneTarget) sceneTarget = gfx.target(rw, rh, { fp32: false });
                else sceneTarget.resize(rw, rh);
            },
            frame: (t, dt, ctx2d, outW, outH, isReduced) => {
                const cursor = KW.local(canvas);
                const aspect = sceneTarget.w / Math.max(1, sceneTarget.h);
                const hasMouse = cursor.x > -500;

                // Smooth camera motion with cursor parallax
                const targetYaw = hasMouse ? (cursor.x / (canvas.clientWidth || 800) - 0.5) * 2.2 : Math.sin(t * 0.15) * 0.8;
                const targetPitch = hasMouse ? (cursor.y / (canvas.clientHeight || 600) - 0.5) * 1.2 : 0.25 + 0.15 * Math.cos(t * 0.18);
                camYaw += (targetYaw - camYaw) * Math.min(1.0, dt * 3.5);
                camPitch += (targetPitch - camPitch) * Math.min(1.0, dt * 3.5);

                const orbitR = mode === 0 ? 3.6 : 3.8;
                const camX = orbitR * Math.sin(camYaw) * Math.cos(camPitch);
                const camY = orbitR * Math.sin(camPitch);
                const camZ = orbitR * Math.cos(camYaw) * Math.cos(camPitch);

                // View-Projection Matrix
                const fov = 48.0 * (Math.PI / 180.0);
                const near = 0.1, far = 20.0;
                const f = 1.0 / Math.tan(fov * 0.5);
                const isMob = typeof window !== "undefined" && window.innerWidth <= 900;
                const sx = isMob ? 0.0 : -0.48;
                const proj = new Float32Array([
                    f / aspect, 0, 0, 0,
                    0, f, 0, 0,
                    sx, 0, (far + near) / (near - far), -1,
                    0, 0, (2.0 * far * near) / (near - far), 0
                ]);

                // LookAt matrix
                const zLen = Math.hypot(camX, camY, camZ);
                const zAxis = [camX / zLen, camY / zLen, camZ / zLen];
                const up = [0, 1, 0];
                const xRaw = [up[1] * zAxis[2] - up[2] * zAxis[1], up[2] * zAxis[0] - up[0] * zAxis[2], up[0] * zAxis[1] - up[1] * zAxis[0]];
                const xLen = Math.hypot(...xRaw);
                const xAxis = [xRaw[0] / xLen, xRaw[1] / xLen, xRaw[2] / xLen];
                const yAxis = [zAxis[1] * xAxis[2] - zAxis[2] * xAxis[1], zAxis[2] * xAxis[0] - zAxis[0] * xAxis[2], zAxis[0] * xAxis[1] - zAxis[1] * xAxis[0]];

                const view = new Float32Array([
                    xAxis[0], yAxis[0], zAxis[0], 0,
                    xAxis[1], yAxis[1], zAxis[1], 0,
                    xAxis[2], yAxis[2], zAxis[2], 0,
                    -(xAxis[0] * camX + xAxis[1] * camY + xAxis[2] * camZ),
                    -(yAxis[0] * camX + yAxis[1] * camY + yAxis[2] * camZ),
                    -(zAxis[0] * camX + zAxis[1] * camY + zAxis[2] * camZ), 1
                ]);

                // vp = view * proj
                const vp = new Float32Array(16);
                for (let i = 0; i < 4; i++) {
                    for (let j = 0; j < 4; j++) {
                        let sum = 0;
                        for (let k = 0; k < 4; k++) sum += view[i * 4 + k] * proj[k * 4 + j];
                        vp[i * 4 + j] = sum;
                    }
                }

                // Fixed-timestep integration with accumulator
                const simSteps = isReduced ? 100 : 0;
                if (isReduced) {
                    for (let s = 0; s < simSteps; s++) {
                        parts.step(stepProg, (p) => {
                            p.f1("uDt", dtFixed).i1("uMode", mode);
                            gl.uniform1ui(p.u("uSeed"), (12345 + s * 17) >>> 0);
                        });
                    }
                } else {
                    acc = Math.min(acc + dt, 0.06);
                    let stepCount = 0;
                    while (acc >= dtFixed && stepCount < 4) {
                        parts.step(stepProg, (p) => {
                            p.f1("uDt", dtFixed).i1("uMode", mode);
                            gl.uniform1ui(p.u("uSeed"), (t * 1e4 + stepCount * 97) >>> 0);
                        });
                        acc -= dtFixed;
                        stepCount++;
                    }
                }

                // Fading accumulation trail pass
                const trailScene = gfx.fadeScene(trailPP, isReduced ? 0.0 : 0.94);
                sceneTarget.clear(0, 0, 0, 1);

                // Copy faded trail into sceneTarget
                const blitProg = gfx.program(gfx.VS_QUAD, `#version 300 es
precision highp float; in vec2 vUV; out vec4 fragColor; uniform sampler2D uTex;
void main() { fragColor = texture(uTex, vUV); }`);
                blitProg.use().tex("uTex", trailScene, 0);
                gfx.quad(blitProg, sceneTarget);

                // Additive particle splats
                const a = KW.col.a;
                parts.draw(drawProg, (p) => {
                    p.mat4("uViewProj", vp)
                     .f3("uAccent", a[0] / 255, a[1] / 255, a[2] / 255)
                     .i1("uMode", mode);
                }, sceneTarget, count);

                // Copy sceneTarget into trail write buffer for next frame
                blitProg.use().tex("uTex", sceneTarget, 0);
                gfx.quad(blitProg, trailPP.write());
                trailPP.swap();

                // Post-process: Dual-Kawase bloom, ACES tonemap, vignette, grain
                gfx.compose(sceneTarget, ctx2d, outW, outH, {
                    time: t,
                    bloomGain: 0.48,
                    threshold: 0.38,
                    exposure: 1.22
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
