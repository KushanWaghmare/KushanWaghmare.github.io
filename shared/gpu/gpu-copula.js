/**
 * gpu-copula.js
 *
 * WebGL2 Scene for the Quantitative Finance section:
 * "Same correlation, different crashes."
 *
 * Three assets are represented as 100,000 glowing points inside the unit cube (0, 1)^3.
 * Three copulas with the identical Kendall's tau (tau = 0.50) morph continuously into one another:
 *   - Gaussian copula: symmetric elliptical cigar, zero tail dependence (lambda_L = 0)
 *   - Student-t (nu = 3) copula: heavy-tailed cross, lambda_L = 0.454
 *   - Clayton (theta = 2) copula: asymmetric crash corner pile-up, lambda_L = 0.707,
 *     generating a 231x joint crash probability amplification at q = 0.05.
 *
 * Uses the shared WebGL2 HDR context from GFX, preallocated GPU buffers,
 * zero per-frame allocation, authored slow camera orbit, cursor parallax,
 * and adaptive resolution scaling with hysteresis.
 */

(function (root, factory) {
    if (typeof module === "object" && module.exports) module.exports = factory(root);
    else factory(root);
}(typeof self !== "undefined" ? self : this, function (root) {
    "use strict";

    const SIMS = (root.SIMS = root.SIMS || {});
    const ENGINES = (root.ENGINES = root.ENGINES || {});
    const CMath = root.CopulaMath || (typeof require !== "undefined" ? require("../lib/copula-math.js") : null);
    const CShaders = root.CopulaShaders || (typeof require !== "undefined" ? require("./gpu-copula-shaders.js") : null);

    const CUBE_SCALE = 1.60; // Half-width of unit cube in 3D world space
    const FLOOR_Y = -CUBE_SCALE - 0.35;
    const DEFAULT_Q = 0.05;

    /* ---------- Matrix Helpers (Allocated Once, Zero Per-Frame GC) ---------- */
    const mat4Perspective = (out, fovy, aspect, near, far, sx = 0.0) => {
        const f = 1.0 / Math.tan(fovy * 0.5), nf = 1.0 / (near - far);
        out.fill(0);
        out[0] = f / aspect;
        out[5] = f;
        out[8] = sx;
        out[10] = (far + near) * nf;
        out[11] = -1.0;
        out[14] = 2.0 * far * near * nf;
    };

    const mat4LookAt = (out, eye, ctr, up) => {
        let z0 = eye[0] - ctr[0], z1 = eye[1] - ctr[1], z2 = eye[2] - ctr[2];
        let len = 1.0 / (Math.hypot(z0, z1, z2) || 1.0);
        z0 *= len; z1 *= len; z2 *= len;
        let x0 = up[1] * z2 - up[2] * z1, x1 = up[2] * z0 - up[0] * z2, x2 = up[0] * z1 - up[1] * z0;
        len = 1.0 / (Math.hypot(x0, x1, x2) || 1.0);
        x0 *= len; x1 *= len; x2 *= len;
        const y0 = z1 * x2 - z2 * x1, y1 = z2 * x0 - z0 * x2, y2 = z0 * x1 - z1 * x0;
        out.set([
            x0, y0, z0, 0,
            x1, y1, z1, 0,
            x2, y2, z2, 0,
            -(x0 * eye[0] + x1 * eye[1] + x2 * eye[2]),
            -(y0 * eye[0] + y1 * eye[1] + y2 * eye[2]),
            -(z0 * eye[0] + z1 * eye[1] + z2 * eye[2]),
            1.0
        ]);
    };

    const mat4Mul = (out, a, b) => {
        for (let i = 0; i < 4; i++) {
            const b0 = b[i * 4], b1 = b[i * 4 + 1], b2 = b[i * 4 + 2], b3 = b[i * 4 + 3];
            for (let j = 0; j < 4; j++) {
                out[i * 4 + j] = b0 * a[j] + b1 * a[4 + j] + b2 * a[8 + j] + b3 * a[12 + j];
            }
        }
    };

    /* ---------- Wireframe Geometry Builders ---------- */
    // Builds the 12 edges of the bounding cube plus the crash orthant sub-box
    const buildWireframeCage = (scale, q) => {
        const lines = [];
        const pushLine = (x0, y0, z0, x1, y1, z1, r, g, b, a) => {
            lines.push(x0, y0, z0, r, g, b, a, x1, y1, z1, r, g, b, a);
        };

        const s = scale;
        // Bounding cube [-s, s]^3 (12 edges)
        const cCol = [0.45, 0.52, 0.65, 0.28];
        const corners = [
            [-s, -s, -s], [s, -s, -s], [s, s, -s], [-s, s, -s],
            [-s, -s,  s], [s, -s,  s], [s, s,  s], [-s, s,  s]
        ];
        const edgePairs = [
            [0, 1], [1, 2], [2, 3], [3, 0], // Bottom loop
            [4, 5], [5, 6], [6, 7], [7, 4], // Top loop
            [0, 4], [1, 5], [2, 6], [3, 7]  // Vertical pillars
        ];
        for (let k = 0; k < edgePairs.length; k++) {
            const p0 = corners[edgePairs[k][0]], p1 = corners[edgePairs[k][1]];
            pushLine(p0[0], p0[1], p0[2], p1[0], p1[1], p1[2], cCol[0], cCol[1], cCol[2], cCol[3]);
        }

        // Lower crash orthant [0, q]^3 in centered world coordinates:
        // [-s, -s + 2*s*q]^3
        const qEnd = -s + 2.0 * s * q;
        const qCorners = [
            [-s, -s, -s], [qEnd, -s, -s], [qEnd, qEnd, -s], [-s, qEnd, -s],
            [-s, -s, qEnd], [qEnd, -s, qEnd], [qEnd, qEnd, qEnd], [-s, qEnd, qEnd]
        ];
        const qCol = [1.0, 0.32, 0.12, 0.85]; // Radiant amber-crimson crash orthant
        for (let k = 0; k < edgePairs.length; k++) {
            const p0 = qCorners[edgePairs[k][0]], p1 = qCorners[edgePairs[k][1]];
            pushLine(p0[0], p0[1], p0[2], p1[0], p1[1], p1[2], qCol[0], qCol[1], qCol[2], qCol[3]);
        }

        return new Float32Array(lines);
    };

    /* ---------- Fallback 2D Simulation ---------- */
    const fallback2D = (canvas, opts = {}) => {
        const E = root.ENGINES;
        return E && (E["copula-2d"] || E.orbit) ? (E["copula-2d"] || E.orbit)(canvas, opts) : null;
    };

    /* ---------- Core WebGL2 Mount Implementation ---------- */
    const createCopulaSim = (canvas, opts = {}) => {
        const GFX = root.GFX;
        const M = CMath || root.CopulaMath;
        const S = CShaders || root.CopulaShaders;

        if (!GFX || !GFX.supported || !M || !S) return fallback2D(canvas, opts);

        return GFX.mount(canvas, (gfx, cvs, getSize) => {
            const gl = gfx.gl;

            const progPoints = gfx.program(S.VS_COPULA_POINTS, S.FS_COPULA_POINTS);
            const progCage   = gfx.program(S.VS_CAGE, S.FS_CAGE);
            const progFloor  = gfx.program(S.VS_FLOOR, S.FS_FLOOR);

            if (!progPoints || !progCage || !progFloor) return null;

            // Determine point count tier: 100k desktop, 30k mobile
            const szInit = getSize();
            const N = szInit.isMobile ? 30000 : 100000;

            // Generate and align the three point clouds using 3D space-filling curve
            const { gaussianPts, studentPts, claytonPts } = M.generateAlignedPointClouds(N, opts.seed || 0x51514D32);

            // Create index attribute buffer [0, 1, ..., N-1]
            const indexArr = new Float32Array(N);
            for (let i = 0; i < N; i++) indexArr[i] = i / N;

            // GPU Vertex Buffers for point clouds
            const vboGaussian = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, vboGaussian);
            gl.bufferData(gl.ARRAY_BUFFER, gaussianPts, gl.STATIC_DRAW);

            const vboStudent = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, vboStudent);
            gl.bufferData(gl.ARRAY_BUFFER, studentPts, gl.STATIC_DRAW);

            const vboClayton = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, vboClayton);
            gl.bufferData(gl.ARRAY_BUFFER, claytonPts, gl.STATIC_DRAW);

            const vboIndices = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, vboIndices);
            gl.bufferData(gl.ARRAY_BUFFER, indexArr, gl.STATIC_DRAW);

            // VAO Pairs for the 3 transitions:
            // Transition 0: Gaussian -> Student-t
            // Transition 1: Student-t -> Clayton
            // Transition 2: Clayton -> Gaussian
            const vaoTrans = [gl.createVertexArray(), gl.createVertexArray(), gl.createVertexArray()];
            const pairVBOs = [
                [vboGaussian, vboStudent],
                [vboStudent,  vboClayton],
                [vboClayton,  vboGaussian]
            ];

            for (let t = 0; t < 3; t++) {
                gl.bindVertexArray(vaoTrans[t]);

                // Location 0: aPosA
                gl.bindBuffer(gl.ARRAY_BUFFER, pairVBOs[t][0]);
                gl.enableVertexAttribArray(0);
                gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);

                // Location 1: aPosB
                gl.bindBuffer(gl.ARRAY_BUFFER, pairVBOs[t][1]);
                gl.enableVertexAttribArray(1);
                gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);

                // Location 2: aIndex
                gl.bindBuffer(gl.ARRAY_BUFFER, vboIndices);
                gl.enableVertexAttribArray(2);
                gl.vertexAttribPointer(2, 1, gl.FLOAT, false, 0, 0);
            }
            gl.bindVertexArray(null);

            // Wireframe Bounding Cube & Crash Box
            let activeQ = DEFAULT_Q;
            const cageData = buildWireframeCage(CUBE_SCALE, activeQ);
            const vboCage = gl.createBuffer();
            const vaoCage = gl.createVertexArray();
            gl.bindVertexArray(vaoCage);
            gl.bindBuffer(gl.ARRAY_BUFFER, vboCage);
            gl.bufferData(gl.ARRAY_BUFFER, cageData, gl.DYNAMIC_DRAW);
            gl.enableVertexAttribArray(0);
            gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 28, 0);
            gl.enableVertexAttribArray(1);
            gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 28, 12);
            gl.bindVertexArray(null);

            // Floor Quad
            const floorQuad = new Float32Array([-1, -1,  1, -1,  1,  1, -1, -1,  1,  1, -1,  1]);
            const vboFloor = gl.createBuffer();
            const vaoFloor = gl.createVertexArray();
            gl.bindVertexArray(vaoFloor);
            gl.bindBuffer(gl.ARRAY_BUFFER, vboFloor);
            gl.bufferData(gl.ARRAY_BUFFER, floorQuad, gl.STATIC_DRAW);
            gl.enableVertexAttribArray(0);
            gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
            gl.bindVertexArray(null);

            // State and Timing Variables
            const HOLD_DURATION = 5.0;  // 5 seconds dwell per copula
            const MORPH_DURATION = 3.0; // 3 seconds smooth transition
            const PHASE_TOTAL = HOLD_DURATION + MORPH_DURATION; // 8.0s per copula (24s cycle)

            let simTime = 0.0;
            let paused = false;
            let lockedCopula = -1; // -1 for auto cycle, 0: Gaussian, 1: Student-t, 2: Clayton
            let userCamYaw = 0.0, userCamPitch = 0.28;
            let isDragging = false, dragStartX = 0, dragStartY = 0;
            let lastTagMs = 0;

            // Check reduced motion preference
            const prefersReducedMotion = typeof window !== "undefined"
                && window.matchMedia
                && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

            if (prefersReducedMotion) {
                lockedCopula = 2; // Render single converged Clayton copula
                simTime = 16.0;
            }

            // Interactive Controls: Click or tap cycles copula modes
            if (root.KW && root.KW.onClick) {
                root.KW.onClick(canvas, () => {
                    if (lockedCopula === -1) lockedCopula = 1; // Snap to Student-t
                    else if (lockedCopula === 0) lockedCopula = 1;
                    else if (lockedCopula === 1) lockedCopula = 2; // Snap to Clayton
                    else lockedCopula = -1; // Resume auto morphing
                    lastTagMs = 0;
                });
            }

            // Interactive Drag Orbit
            const onDown = (e) => {
                isDragging = true;
                dragStartX = e.clientX || (e.touches && e.touches[0].clientX) || 0;
                dragStartY = e.clientY || (e.touches && e.touches[0].clientY) || 0;
            };
            const onMove = (e) => {
                if (!isDragging) return;
                const cx = e.clientX || (e.touches && e.touches[0].clientX) || 0;
                const cy = e.clientY || (e.touches && e.touches[0].clientY) || 0;
                const dx = cx - dragStartX, dy = cy - dragStartY;
                dragStartX = cx; dragStartY = cy;
                userCamYaw += dx * 0.008;
                userCamPitch = Math.max(-0.6, Math.min(1.1, userCamPitch + dy * 0.008));
            };
            const onUp = () => { isDragging = false; };

            canvas.addEventListener("mousedown", onDown, { passive: true });
            canvas.addEventListener("mousemove", onMove, { passive: true });
            window.addEventListener("mouseup", onUp, { passive: true });
            canvas.addEventListener("touchstart", onDown, { passive: true });
            canvas.addEventListener("touchmove", onMove, { passive: true });
            window.addEventListener("touchend", onUp, { passive: true });

            // Readout & Caption Updater
            const updateCaption = (nowMs, activeStage, morphVal, q, isMob) => {
                if (nowMs - lastTagMs < 200 && lastTagMs !== 0) return;
                lastTagMs = nowMs;

                let modeTitle, lambdaStr, crashProbStr;
                const indepProb = (q * q * q * 100.0).toFixed(4);

                if (activeStage === 0 && morphVal < 0.05) {
                    modeTitle = isMob ? "Gaussian" : "Gaussian copula";
                    lambdaStr = "0.00";
                    const pG = (M.tailGaussian(q) * 100.0).toFixed(3);
                    crashProbStr = isMob ? `P(crash)=${pG}%` : `P(crash) = ${pG}%`;
                } else if (activeStage === 1 && morphVal < 0.05) {
                    modeTitle = isMob ? "Student-t (ν=3)" : "Student-t copula (ν = 3)";
                    lambdaStr = "0.45";
                    const pT = (M.tailStudentT(q) * 100.0).toFixed(3);
                    crashProbStr = isMob ? `P(crash)=${pT}%` : `P(crash) = ${pT}% (fat joint tails)`;
                } else if (activeStage === 2 && morphVal < 0.05) {
                    modeTitle = isMob ? "Clayton (θ=2)" : "Clayton copula (θ = 2)";
                    lambdaStr = "0.71";
                    const pC = (M.tailClayton3D(q) * 100.0).toFixed(3);
                    const ratio = (M.tailClayton3D(q) / (q * q * q)).toFixed(0);
                    crashProbStr = isMob ? `P(crash)=${pC}% (${ratio}×)` : `P(crash) = ${pC}% (${ratio}× risk amplification!)`;
                } else {
                    const fromStr = activeStage === 0 ? "Gaussian" : (activeStage === 1 ? "Student-t" : "Clayton");
                    const toStr   = activeStage === 0 ? "Student-t" : (activeStage === 1 ? "Clayton" : "Gaussian");
                    modeTitle = isMob ? `${fromStr}→${toStr}` : `Morphing: ${fromStr} → ${toStr} (${Math.round(morphVal * 100)}%)`;
                    lambdaStr = activeStage === 0 ? "0.00→0.45" : (activeStage === 1 ? "0.45→0.71" : "0.71→0.00");
                    crashProbStr = isMob ? `q=${q.toFixed(2)}` : `Threshold q = ${q.toFixed(2)} (indep = ${indepProb}%)`;
                }

                const caption = isMob
                    ? `${modeTitle} · τ = 0.50 · λ_L = ${lambdaStr} · ${crashProbStr}`
                    : `${modeTitle} · Kendall’s τ = 0.50 (identical) · lower tail dependence λ_L = ${lambdaStr} · ${crashProbStr} · click to cycle`;
                if (root.KW && root.KW.tag) root.KW.tag(caption, canvas);
            };

            let sceneTarget = null;
            const matProj = new Float32Array(16);
            const matView = new Float32Array(16);
            const matVP   = new Float32Array(16);

            return {
                resize: (rw, rh) => {
                    if (!sceneTarget) sceneTarget = gfx.target(rw, rh, { depth: true });
                    else sceneTarget.resize(rw, rh);
                },
                frame: (t, dt, ctx2d, outW, outH) => {
                    const sz = getSize();
                    if (!sceneTarget) sceneTarget = gfx.target(sz.w, sz.h, { depth: true });

                    if (!paused && !prefersReducedMotion) {
                        simTime += dt;
                    }

                    // Compute current transition stage and morph factor
                    let activeStage = 0;
                    let morphFactor = 0.0;

                    if (lockedCopula >= 0) {
                        activeStage = lockedCopula;
                        morphFactor = 0.0;
                    } else {
                        const totalCycle = 3.0 * PHASE_TOTAL; // 24.0s
                        const modT = simTime % totalCycle;
                        activeStage = Math.floor(modT / PHASE_TOTAL); // 0, 1, or 2
                        const phaseT = modT - activeStage * PHASE_TOTAL;
                        if (phaseT > HOLD_DURATION) {
                            morphFactor = (phaseT - HOLD_DURATION) / MORPH_DURATION;
                        } else {
                            morphFactor = 0.0;
                        }
                    }

                    // Cursor parallax offset
                    let parallaxX = 0.0, parallaxY = 0.0;
                    if (root.KW && root.KW.local) {
                        const p = root.KW.local(canvas);
                        if (p.x >= 0 && p.x <= sz.cssW && p.y >= 0 && p.y <= sz.cssH) {
                            parallaxX = (p.x / sz.cssW - 0.5) * 0.45;
                            parallaxY = (p.y / sz.cssH - 0.5) * 0.35;
                        }
                    }

                    updateCaption(performance.now(), activeStage, morphFactor, activeQ, sz.isMobile);

                    // Camera Orbit & View-Projection Setup
                    const autoOrbit = simTime * 0.09;
                    const totalYaw = autoOrbit + userCamYaw + parallaxX;
                    const totalPitch = userCamPitch + parallaxY;
                    const camDist = sz.isMobile ? 5.8 : 4.65;

                    const eyeX = camDist * Math.cos(totalPitch) * Math.sin(totalYaw);
                    const eyeY = camDist * Math.sin(totalPitch) + 0.35;
                    const eyeZ = camDist * Math.cos(totalPitch) * Math.cos(totalYaw);
                    const eye = [eyeX, eyeY, eyeZ];

                    const sx = sz.isMobile ? 0.0 : -0.22; // subtle shift for portfolio hero alignment
                    mat4Perspective(matProj, sz.isMobile ? 0.85 : 0.68, sz.w / Math.max(1, sz.h), 0.1, 40.0, sx);
                    mat4LookAt(matView, eye, [0.0, -0.05, 0.0], [0, 1, 0]);
                    mat4Mul(matVP, matProj, matView);

                    // Domain Accent Colour (Amber / Gold for Quant)
                    const aCol = (root.KW && root.KW.col && root.KW.col.a) || [245, 185, 55];
                    const acc = [aCol[0] / 255.0, aCol[1] / 255.0, aCol[2] / 255.0];
                    const focalDist = Math.hypot(eye[0], eye[1], eye[2]);

                    // Render to HDR Offscreen Target
                    sceneTarget.clear(0.0, 0.0, 0.0, 1.0);
                    gl.bindFramebuffer(gl.FRAMEBUFFER, sceneTarget.fbo);
                    gl.viewport(0, 0, sceneTarget.w, sceneTarget.h);
                    gl.enable(gl.DEPTH_TEST);

                    // 1. Render Glossy Floor Reflection Plane
                    gl.enable(gl.BLEND);
                    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
                    progFloor.use()
                        .mat4("uViewProj", matVP)
                        .f3("uCenter", 0.0, FLOOR_Y, 0.0)
                        .f1("uRadius", 3.8)
                        .f3("uAccent", acc[0], acc[1], acc[2])
                        .f1("uCrashIntensity", activeStage === 2 ? 1.0 : (activeStage === 1 ? 0.35 : 0.08));
                    gl.bindVertexArray(vaoFloor);
                    gl.drawArrays(gl.TRIANGLES, 0, 6);
                    gl.bindVertexArray(null);

                    // 2. Render Wireframe Bounding Cube & Lower Crash Orthant
                    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
                    progCage.use()
                        .mat4("uViewProj", matVP)
                        .mat4("uView", matView)
                        .f1("uFocalDist", focalDist);
                    gl.bindVertexArray(vaoCage);
                    gl.drawArrays(gl.LINES, 0, cageData.length / 7);
                    gl.bindVertexArray(null);

                    // 3. Render 100,000 Additive Glowing Copula Point Splats
                    gl.bindVertexArray(vaoTrans[activeStage]);
                    progPoints.use()
                        .mat4("uViewProj", matVP)
                        .mat4("uView", matView)
                        .f1("uMorph", morphFactor)
                        .f1("uThresholdQ", activeQ)
                        .f1("uScale", CUBE_SCALE)
                        .f1("uFocalDist", focalDist)
                        .f1("uPointScale", sz.isMobile ? 12.0 : 15.5)
                        .f3("uAccent", acc[0], acc[1], acc[2])
                        .f1("uMorphStage", activeStage)
                        .f1("uThemeLight", 0.0);
                    gl.drawArrays(gl.POINTS, 0, N);
                    gl.bindVertexArray(null);

                    gl.disable(gl.BLEND);
                    gl.disable(gl.DEPTH_TEST);

                    // 4. HDR 5-level Dual-Kawase Bloom, Tonemapping & Compose
                    gfx.compose(sceneTarget, ctx2d, outW, outH, {
                        bloomGain: sz.isMobile ? 0.38 : 0.46,
                        threshold: 0.38,
                        exposure: 1.15,
                        time: t,
                        accent: aCol
                    });
                },
                dispose: () => {
                    if (sceneTarget) sceneTarget.dispose();
                    canvas.removeEventListener("mousedown", onDown);
                    canvas.removeEventListener("mousemove", onMove);
                    window.removeEventListener("mouseup", onUp);
                    canvas.removeEventListener("touchstart", onDown);
                    canvas.removeEventListener("touchmove", onMove);
                    window.removeEventListener("touchend", onUp);

                    gl.deleteBuffer(vboGaussian);
                    gl.deleteBuffer(vboStudent);
                    gl.deleteBuffer(vboClayton);
                    gl.deleteBuffer(vboIndices);
                    for (let k = 0; k < 3; k++) gl.deleteVertexArray(vaoTrans[k]);
                    gl.deleteBuffer(vboCage);
                    gl.deleteVertexArray(vaoCage);
                    gl.deleteBuffer(vboFloor);
                    gl.deleteVertexArray(vaoFloor);
                }
            };
        }, fallback2D);
    };

    SIMS.copula = SIMS["same-correlation-different-crashes"] = ENGINES.copula = createCopulaSim;
}));
