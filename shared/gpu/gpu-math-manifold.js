/**
 * gpu-math-manifold.js
 *
 * Full-screen Gauss–Bonnet Riemannian Manifold (Mathematics Hero).
 * Renders a 4D topological immersion of the non-orientable Klein manifold
 * on the shared GFX WebGL2 context, with Levi-Civita Christoffel geodesic flow,
 * Theorema Egregium Gaussian curvature colour mapping, and cursor-driven
 * 4D rotation parallax.
 *
 * Adheres strictly to the 2-context ceiling, pitch-black background, and UK English captions.
 */

(function (root, factory) {
    if (typeof module === "object" && module.exports) module.exports = factory(root);
    else factory(root);
}(typeof self !== "undefined" ? self : this, function (root) {
    "use strict";

    const SIMS = (root.SIMS = root.SIMS || {});
    const M = root.MathManifoldMath || (typeof require !== "undefined" ? require("../lib/math-manifold-math.js") : null);
    const S = root.MathManifoldShaders || (typeof require !== "undefined" ? require("./gpu-math-manifold-shaders.js") : null);

    const isMobile = () => (typeof window !== "undefined" ? window.innerWidth < 900 : false);
    const TAU = 2.0 * Math.PI;

    /* ---------- Float32 Matrix Helpers ---------- */
    const mat4Perspective = (out, fovy, aspect, near, far, sx = 0.0) => {
        const f = 1.0 / Math.tan(fovy * 0.5);
        const nf = 1.0 / (near - far);
        out.fill(0);
        out[0] = f / aspect;
        out[5] = f;
        out[8] = sx;
        out[10] = (far + near) * nf;
        out[11] = -1.0;
        out[14] = 2.0 * far * near * nf;
        return out;
    };

    const mat4LookAt = (out, eye, center, up) => {
        let x0, x1, x2, y0, y1, y2, z0, z1, z2, len;
        z0 = eye[0] - center[0]; z1 = eye[1] - center[1]; z2 = eye[2] - center[2];
        len = 1.0 / Math.hypot(z0, z1, z2);
        z0 *= len; z1 *= len; z2 *= len;

        x0 = up[1] * z2 - up[2] * z1; x1 = up[2] * z0 - up[0] * z2; x2 = up[0] * z1 - up[1] * z0;
        len = Math.hypot(x0, x1, x2);
        if (len > 0) { len = 1.0 / len; x0 *= len; x1 *= len; x2 *= len; }

        y0 = z1 * x2 - z2 * x1; y1 = z2 * x0 - z0 * x2; y2 = z0 * x1 - z1 * x0;

        out[0] = x0; out[1] = y0; out[2] = z0; out[3] = 0;
        out[4] = x1; out[5] = y1; out[6] = z1; out[7] = 0;
        out[8] = x2; out[9] = y2; out[10] = z2; out[11] = 0;
        out[12] = -(x0 * eye[0] + x1 * eye[1] + x2 * eye[2]);
        out[13] = -(y0 * eye[0] + y1 * eye[1] + y2 * eye[2]);
        out[14] = -(z0 * eye[0] + z1 * eye[1] + z2 * eye[2]);
        out[15] = 1.0;
        return out;
    };

    const mat4Multiply = (out, a, b) => {
        const a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3];
        const a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7];
        const a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11];
        const a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15];

        for (let i = 0; i < 4; i++) {
            const b0 = b[i * 4], b1 = b[i * 4 + 1], b2 = b[i * 4 + 2], b3 = b[i * 4 + 3];
            out[i * 4] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
            out[i * 4 + 1] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
            out[i * 4 + 2] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
            out[i * 4 + 3] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;
        }
        return out;
    };

    const mat4Identity = (out) => {
        out.fill(0);
        out[0] = out[5] = out[10] = out[15] = 1.0;
        return out;
    };

    const mat4RotateX = (out, rad) => {
        mat4Identity(out);
        const c = Math.cos(rad), s = Math.sin(rad);
        out[5] = c; out[6] = s;
        out[9] = -s; out[10] = c;
        return out;
    };

    const mat4RotateY = (out, rad) => {
        mat4Identity(out);
        const c = Math.cos(rad), s = Math.sin(rad);
        out[0] = c; out[2] = -s;
        out[8] = s; out[10] = c;
        return out;
    };

    const mat4RotateZ = (out, rad) => {
        mat4Identity(out);
        const c = Math.cos(rad), s = Math.sin(rad);
        out[0] = c; out[1] = s;
        out[4] = -s; out[5] = c;
        return out;
    };

    /* ---------- Main Simulation Mount ---------- */
    SIMS["gauss-bonnet-manifold"] = SIMS["math-manifold"] = (canvas, opts = {}) => {
        const GFX = root.GFX;
        if (!GFX || !GFX.supported) return fallbackSurface(canvas, opts);

        const shaders = S || root.MathManifoldShaders;
        const math = M || root.MathManifoldMath;
        if (!shaders || !math) return fallbackSurface(canvas, opts);

        return GFX.mount(canvas, (gfx, cvs, getSize) => {
            const gl = gfx.gl;
            const mob = gfx.isMobile();

            // Compile shaders
            const progManifold = gfx.program(shaders.VS_MANIFOLD, shaders.FS_MANIFOLD);
            const progParticles = gfx.program(shaders.VS_GEODESIC_PARTICLES, shaders.FS_GEODESIC_PARTICLES);
            if (!progManifold || !progParticles) return null;

            // Geometry resolution (u double cover [0, 4pi) for closed Klein immersion)
            const uSegments = mob ? 128 : 192;
            const vSegments = mob ? 64 : 96;
            const numVertices = (uSegments + 1) * (vSegments + 1);
            const numIndices = uSegments * vSegments * 6;

            // Preallocate parametric mesh buffer (aUV: u, v)
            const meshUVs = new Float32Array(numVertices * 2);
            let ptr = 0;
            const TWO_TAU = 2.0 * TAU;
            for (let i = 0; i <= uSegments; i++) {
                const u = (i / uSegments) * TWO_TAU;
                for (let j = 0; j <= vSegments; j++) {
                    const v = (j / vSegments) * TAU;
                    meshUVs[ptr++] = u;
                    meshUVs[ptr++] = v;
                }
            }

            // Preallocate indices
            const meshIndices = new Uint16Array(numIndices);
            let iptr = 0;
            const rowStride = vSegments + 1;
            for (let i = 0; i < uSegments; i++) {
                for (let j = 0; j < vSegments; j++) {
                    const i0 = i * rowStride + j;
                    const i1 = (i + 1) * rowStride + j;
                    const i2 = i * rowStride + (j + 1);
                    const i3 = (i + 1) * rowStride + (j + 1);

                    meshIndices[iptr++] = i0;
                    meshIndices[iptr++] = i1;
                    meshIndices[iptr++] = i2;

                    meshIndices[iptr++] = i2;
                    meshIndices[iptr++] = i1;
                    meshIndices[iptr++] = i3;
                }
            }

            // Create VAO and Buffers for Manifold Surface
            const vaoManifold = gl.createVertexArray();
            gl.bindVertexArray(vaoManifold);

            const vboManifold = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, vboManifold);
            gl.bufferData(gl.ARRAY_BUFFER, meshUVs, gl.STATIC_DRAW);
            gl.enableVertexAttribArray(0);
            gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 8, 0);

            const eboManifold = gl.createBuffer();
            gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, eboManifold);
            gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, meshIndices, gl.STATIC_DRAW);
            gl.bindVertexArray(null);

            // Geodesic Particle Swarm (Levi-Civita Christoffel Flow)
            const numParticles = mob ? 180 : 320;
            const prng = math.createPrng(982451653);
            const particles = [];
            for (let k = 0; k < numParticles; k++) {
                const u = prng() * TWO_TAU;
                const v = prng() * TAU;
                const speed = 0.5 + prng() * 1.8;
                const heading = prng() * TAU;
                particles.push({
                    u,
                    v,
                    du: Math.cos(heading) * speed * 0.45,
                    dv: Math.sin(heading) * speed * 0.65,
                    speed,
                    age: prng(),
                    lifeSpan: 6.0 + prng() * 6.0
                });
            }

            const particleUploadBuf = new Float32Array(numParticles * 4); // (u, v, speed, age)
            const vaoParticles = gl.createVertexArray();
            gl.bindVertexArray(vaoParticles);
            const vboParticles = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, vboParticles);
            gl.bufferData(gl.ARRAY_BUFFER, particleUploadBuf.byteLength, gl.DYNAMIC_DRAW);
            gl.enableVertexAttribArray(0);
            gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 16, 0);
            gl.bindVertexArray(null);

            // Offscreen render target
            let sceneTarget = null;
            let targetW = 0, targetH = 0;
            const ensureTarget = (w, h) => {
                const tw = Math.max(2, Math.floor(w));
                const th = Math.max(2, Math.floor(h));
                if (sceneTarget && targetW === tw && targetH === th) return;
                if (sceneTarget) sceneTarget.dispose();
                sceneTarget = gfx.target(tw, th, { fp32: false, depth: true });
                targetW = tw;
                targetH = th;
            };

            // Matrices
            const matProj = new Float32Array(16);
            const matView = new Float32Array(16);
            const matViewProj = new Float32Array(16);
            const matModel = new Float32Array(16);
            const matRotX = new Float32Array(16);
            const matRotY = new Float32Array(16);
            const matRotZ = new Float32Array(16);
            const matTemp = new Float32Array(16);

            // 4D Rotation and Camera State
            let curAlpha = 0.45 * Math.PI;
            let targetAlpha = 0.45 * Math.PI;
            let curAzimuth = 0.0;
            let targetAzimuth = 0.0;
            let curElevation = 0.42;
            let targetElevation = 0.42;

            // Click Shock Pulse State
            let shockStartTime = -100.0;
            let shockCenter = [Math.PI, Math.PI];

            const host = canvas.closest ? (canvas.closest(".snap-section") || canvas) : canvas;

            const triggerPulse = () => {
                shockStartTime = performance.now() * 0.001;
                shockCenter = [Math.random() * TAU, Math.random() * TAU];

                // Burst 36 particles outward from impulse center
                const burstCount = Math.min(36, particles.length);
                for (let b = 0; b < burstCount; b++) {
                    const p = particles[b];
                    p.u = shockCenter[0] + (Math.random() - 0.5) * 0.2;
                    p.v = shockCenter[1] + (Math.random() - 0.5) * 0.2;
                    const angle = (b / burstCount) * TAU;
                    const burstSpeed = 2.2 + Math.random() * 1.5;
                    p.du = Math.cos(angle) * burstSpeed;
                    p.dv = Math.sin(angle) * burstSpeed;
                    p.speed = burstSpeed;
                    p.age = 0.0;
                }
            };

            host.addEventListener("click", triggerPulse);
            if (root.KW && root.KW.onClick) {
                root.KW.onClick(canvas, triggerPulse);
            }

            // Live Telemetry HUD element
            let simTagEl = host ? host.querySelector(".sim-tag") : null;
            let lastTelemetryTime = 0;

            const instObj = {
                step: (dt, t) => {
                    // Cursor tracking via KW.local
                    if (root.KW && root.KW.local) {
                        const m = root.KW.local(canvas);
                        const rect = canvas.getBoundingClientRect();
                        if (m.x >= 0 && m.x <= rect.width && m.y >= 0 && m.y <= rect.height) {
                            const nx = m.x / Math.max(1, rect.width) - 0.5;
                            const ny = m.y / Math.max(1, rect.height) - 0.5;
                            targetAlpha = 0.45 * Math.PI + nx * Math.PI * 0.95;
                            targetAzimuth = nx * 1.4;
                            targetElevation = 0.42 + ny * 0.45;
                        }
                    }

                    // Smooth relaxation
                    curAlpha += (targetAlpha - curAlpha) * Math.min(1.0, dt * 4.0);
                    curAzimuth += (targetAzimuth - curAzimuth) * Math.min(1.0, dt * 4.0);
                    curElevation += (targetElevation - curElevation) * Math.min(1.0, dt * 4.0);

                    // Step Geodesic Particle Swarm (Christoffel RK4 flow)
                    const particleDt = Math.min(0.04, dt);
                    for (let k = 0; k < numParticles; k++) {
                        const p = particles[k];
                        p.age += particleDt / p.lifeSpan;

                        // Advance geodesic trajectory
                        const nextState = math.stepGeodesicRK4(p, particleDt * 1.4, curAlpha);
                        p.u = nextState.u;
                        p.v = nextState.v;
                        p.du = nextState.du;
                        p.dv = nextState.dv;

                        // Recompute speed norm ||v||_g
                        const mTensor = math.metricTensor(p.u, p.v);
                        p.speed = Math.sqrt(Math.max(0.01, mTensor.E * p.du * p.du + mTensor.G * p.dv * p.dv));

                        // Respawn aged particles
                        if (p.age >= 1.0) {
                            p.u = Math.random() * (2.0 * TAU);
                            p.v = Math.random() * TAU;
                            const heading = Math.random() * TAU;
                            const spd = 0.5 + Math.random() * 1.8;
                            p.du = Math.cos(heading) * spd * 0.45;
                            p.dv = Math.sin(heading) * spd * 0.65;
                            p.speed = spd;
                            p.age = 0.0;
                            p.lifeSpan = 6.0 + Math.random() * 6.0;
                        }

                        // Write to upload buffer
                        particleUploadBuf[k * 4] = p.u;
                        particleUploadBuf[k * 4 + 1] = p.v;
                        particleUploadBuf[k * 4 + 2] = p.speed;
                        particleUploadBuf[k * 4 + 3] = p.age;
                    }

                    // Update live telemetry HUD once every 120 ms
                    const now = performance.now();
                    if (now - lastTelemetryTime > 120) {
                        lastTelemetryTime = now;
                        const telemetry = math.formatTelemetry(curAlpha, 24, 24);
                        if (simTagEl) simTagEl.textContent = telemetry.tagString;
                        if (root.KW && root.KW.tag) root.KW.tag(telemetry.tagString, canvas);
                    }
                },

                render: (outCtx2d, outW, outH, t) => {
                    ensureTarget(outW, outH);
                    if (!sceneTarget) return;

                    const isLight = (root.KW && root.KW.col && root.KW.col.light) ? 1.0 : 0.0;
                    const aCol = (root.KW && root.KW.col && root.KW.col.a) || [230, 57, 70];
                    const normAccent = [aCol[0] / 255.0, aCol[1] / 255.0, aCol[2] / 255.0];

                    const shockTime = shockStartTime > 0.0 ? Math.max(0.0, t - shockStartTime) : -1.0;

                    // Camera Orbit
                    const aspect = sceneTarget.w / Math.max(1, sceneTarget.h);
                    const camDist = 6.8;
                    const cosEl = Math.cos(curElevation);
                    const sinEl = Math.sin(curElevation);
                    const cosAz = Math.cos(curAzimuth + t * 0.04);
                    const sinAz = Math.sin(curAzimuth + t * 0.04);

                    const eye = [
                        camDist * cosEl * sinAz,
                        camDist * sinEl,
                        camDist * cosEl * cosAz
                    ];
                    const target = [0.0, 0.0, 0.0];
                    const up = [0.0, 1.0, 0.0];

                    const sx = mob ? 0.0 : -0.38;
                    mat4Perspective(matProj, (48.0 * Math.PI) / 180.0, aspect, 0.1, 40.0, sx);
                    mat4LookAt(matView, eye, target, up);
                    mat4Multiply(matViewProj, matProj, matView);

                    // Model tilt: subtle continuous tumble
                    mat4RotateX(matRotX, 0.35 + Math.sin(t * 0.12) * 0.08);
                    mat4RotateY(matRotY, curAzimuth * 0.25);
                    mat4RotateZ(matRotZ, 0.38 + Math.cos(t * 0.09) * 0.06);
                    mat4Multiply(matTemp, matRotY, matRotX);
                    mat4Multiply(matModel, matRotZ, matTemp);

                    // 1. Render Manifold Surface to RGBA16F offscreen target
                    gl.bindFramebuffer(gl.FRAMEBUFFER, sceneTarget.fbo);
                    gl.viewport(0, 0, sceneTarget.w, sceneTarget.h);
                    gl.clearColor(0.0, 0.0, 0.0, 1.0); // Pitch-black
                    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
                    gl.enable(gl.DEPTH_TEST);
                    gl.depthFunc(gl.LEQUAL);
                    gl.disable(gl.CULL_FACE);
                    gl.disable(gl.BLEND);

                    progManifold.use()
                        .mat4("uViewProj", matViewProj)
                        .mat4("uModel", matModel)
                        .f3("uCamPos", eye[0], eye[1], eye[2])
                        .f1("uTime", t)
                        .f1("uAlpha", curAlpha)
                        .f1("uShockTime", shockTime)
                        .f2("uShockCenter", shockCenter[0], shockCenter[1])
                        .f1("uR", 1.95)
                        .f1("ur", 1.20)
                        .f3("uAccent", normAccent[0], normAccent[1], normAccent[2])
                        .f1("uLightMode", isLight);

                    gl.bindVertexArray(vaoManifold);
                    gl.drawElements(gl.TRIANGLES, numIndices, gl.UNSIGNED_SHORT, 0);

                    // 2. Render Geodesic Particle Swarm (Additive Blending)
                    gl.bindBuffer(gl.ARRAY_BUFFER, vboParticles);
                    gl.bufferSubData(gl.ARRAY_BUFFER, 0, particleUploadBuf);

                    gl.enable(gl.BLEND);
                    gl.blendFunc(gl.ONE, gl.ONE);
                    gl.depthMask(false);

                    progParticles.use()
                        .mat4("uViewProj", matViewProj)
                        .mat4("uModel", matModel)
                        .f1("uAlpha", curAlpha)
                        .f1("uR", 1.95)
                        .f1("ur", 1.20)
                        .f3("uAccent", normAccent[0], normAccent[1], normAccent[2]);

                    gl.bindVertexArray(vaoParticles);
                    gl.drawArrays(gl.POINTS, 0, numParticles);

                    gl.depthMask(true);
                    gl.disable(gl.BLEND);
                    gl.disable(gl.DEPTH_TEST);
                    gl.bindVertexArray(null);

                    // 3. Film Tone-Mapping and Celestial Bloom via GFX.compose
                    gfx.compose(sceneTarget, outCtx2d, outW, outH, {
                        bloomGain: mob ? 0.36 : 0.48,
                        exposure: 1.14,
                        time: t,
                        accent: aCol,
                        isLight: isLight > 0.5
                    });
                },

                frame: (t, dt, ctx2d, outW, outH, isReduced) => {
                    instObj.step(dt, t);
                    instObj.render(ctx2d, outW, outH, t);
                },

                resize: (nw, nh) => {
                    ensureTarget(nw, nh);
                },

                dispose: () => {
                    if (host) host.removeEventListener("click", triggerPulse);
                    if (vaoManifold) gl.deleteVertexArray(vaoManifold);
                    if (vboManifold) gl.deleteBuffer(vboManifold);
                    if (eboManifold) gl.deleteBuffer(eboManifold);
                    if (vaoParticles) gl.deleteVertexArray(vaoParticles);
                    if (vboParticles) gl.deleteBuffer(vboParticles);
                    if (sceneTarget) {
                        sceneTarget.dispose();
                        sceneTarget = null;
                    }
                }
            };

            return instObj;
        }, fallbackSurface);
    };

    const fallbackSurface = (canvas, opts = {}) => {
        if (root.ENGINES && root.ENGINES.surface) {
            return root.ENGINES.surface(canvas, {
                fn: "klein",
                scale: 1.2,
                wireframe: true
            });
        }
        return null;
    };
}));
