/**
 * gpu-primes-waves.js
 *
 * WebGL2 Real-Time Cinematic Simulation: "Primes from waves"
 * (Chebyshev Explicit Formula for Prime Powers via Riemann Zeta Zeros).
 *
 * Implements:
 *   - CPU Double-Precision Mathematical Core (shared/lib/zeta-math.js + shared/lib/zeta-zeros.js)
 *   - Grid uniform in u = ln(x) (8,192 desktop, 4,096 mobile) with exact 1/gamma wave amplitudes
 *   - 3-Layer 3D Architecture:
 *       1. Left: Critical line rod Re(s) = 1/2 with glowing zero beads at gamma_k
 *       2. Middle: Receding wave stack ribbons at depth z_k in atmospheric fog (born from beads)
 *       3. Front: Sum ribbon psi_N(x), ghost Chebyshev staircase, and residual error ribbon
 *   - Looping Geometric Timeline with smooth easing and hold at N = 500
 *   - Interactive Cursor Scrubbing across x with hairline readout
 *   - Click to toggle Cesàro mode (Gibbs ringing elimination)
 *   - Responsive camera and frustum adaptation for mobile and desktop
 *   - Near-black cosmic stage following black hole art direction
 *   - Adaptive frame-time quality scaling, prefers-reduced-motion support, clean disposal
 *   - Shared GFX WebGL2 context (maintains <= 2 contexts site-wide)
 */

(function (root, factory) {
    if (typeof module === "object" && module.exports) {
        module.exports = factory(root);
    } else {
        factory(root);
    }
}(typeof self !== "undefined" ? self : this, function (root) {
    "use strict";

    root.SIMS = root.SIMS || {};
    const SIMS = root.SIMS;

    const ZM = root.ZetaMath || (typeof require !== "undefined" ? require("../lib/zeta-math.js") : null);
    const ZEROS = root.ZetaZeros || (typeof require !== "undefined" ? require("../lib/zeta-zeros.js") : null);
    const SHADERS = root.PrimesWavesShaders || (typeof require !== "undefined" ? require("./gpu-primes-waves-shaders.js") : null);

    const isMobile = () => (typeof window !== "undefined" ? window.innerWidth <= 900 : false);

    /* ---------- Float32 4x4 Matrix Helpers ---------- */
    const mat4Perspective = (out, fovy, aspect, near, far) => {
        const f = 1.0 / Math.tan(fovy * 0.5);
        const nf = 1.0 / (near - far);
        out.fill(0);
        out[0] = f / aspect;
        out[5] = f;
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

    /* Geometric Schedule of Zero Stages */
    const SCHEDULE = [
        0, 1, 2, 3, 4, 5, 6, 8, 10, 13, 16, 20, 25, 32, 40,
        50, 63, 80, 100, 126, 159, 200, 252, 317, 400, 500
    ];

    /**
     * Main Primes from Waves Scene Runner
     */
    const runPrimesWaves = (canvas, params = {}) => {
        const GFX = root.GFX;
        if (!GFX || !GFX.supported) {
            if (root.ENGINES && (root.ENGINES["fourier-2d"] || root.ENGINES.fourier)) {
                return (root.ENGINES["fourier-2d"] || root.ENGINES.fourier)(canvas, params);
            }
            return;
        }

        const KW = root.KW || {};
        const gl = GFX.gl;
        const mob = isMobile();
        const numSamples = mob ? 4096 : 8192;

        /* ---------- 1. Mathematical State Setup ---------- */
        const xMin = 2.0;
        const xMaxGlobal = 150.0;
        const grid = ZM.createGrid(numSamples, xMin, xMaxGlobal);
        const zeros = ZEROS;

        // Running double-precision accumulator for partial sums
        const accumDouble = new Float64Array(numSamples);
        let currentZeroCount = 0;
        let isCesaro = false;
        let paused = false;

        // Window easing: xMax spans from 24 up to 146
        let curXMax = 24.0;
        let targetXMax = 24.0;

        // Timeline state
        let scheduleIdx = 0;
        let stageTimer = 0.0;
        let fadeFactor = 1.0;
        let isRewinding = false;
        let rewindTimer = 0.0;

        // Prefers-reduced-motion check
        const prefersReducedMotion = typeof window !== "undefined" &&
            window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

        if (prefersReducedMotion) {
            while (currentZeroCount < 500) {
                ZM.addZeroToGrid(grid, accumDouble, zeros[currentZeroCount]);
                currentZeroCount++;
            }
            scheduleIdx = SCHEDULE.length - 1;
            curXMax = targetXMax = Math.min(146.0, Math.max(24.0, 0.18 * zeros[499]));
        }

        /* ---------- 2. Shader Program Initialisation ---------- */
        const progRibbon = GFX.program(SHADERS.VS_RIBBON, SHADERS.FS_RIBBON);
        const progRod = GFX.program(SHADERS.VS_CRITICAL_ROD, SHADERS.FS_CRITICAL_ROD);
        const progBeads = GFX.program(SHADERS.VS_BEADS, SHADERS.FS_BEADS);
        const progStaircase = GFX.program(SHADERS.VS_STAIRCASE, SHADERS.FS_STAIRCASE);
        const progResidual = GFX.program(SHADERS.VS_RESIDUAL, SHADERS.FS_RESIDUAL);
        const progHairline = GFX.program(SHADERS.VS_HAIRLINE, SHADERS.FS_HAIRLINE);

        /* ---------- 3. Preallocated GPU Vertex Buffers ---------- */
        const STRIDE_BYTES = 28;
        const STRIDE_FLOATS = 7;
        const ribbonVertCount = numSamples * 2;
        const ribbonUploadBuf = new Float32Array(ribbonVertCount * STRIDE_FLOATS);

        const vaoRibbon = gl.createVertexArray();
        const vboRibbon = gl.createBuffer();
        gl.bindVertexArray(vaoRibbon);
        gl.bindBuffer(gl.ARRAY_BUFFER, vboRibbon);
        gl.bufferData(gl.ARRAY_BUFFER, ribbonUploadBuf.byteLength, gl.DYNAMIC_DRAW);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 3, gl.FLOAT, false, STRIDE_BYTES, 0);
        gl.enableVertexAttribArray(1);
        gl.vertexAttribPointer(1, 3, gl.FLOAT, false, STRIDE_BYTES, 12);
        gl.enableVertexAttribArray(2);
        gl.vertexAttribPointer(2, 1, gl.FLOAT, false, STRIDE_BYTES, 24);
        gl.bindVertexArray(null);

        // Preallocated Stack Ribbon Buffer for secondary waves
        const vaoStack = gl.createVertexArray();
        const vboStack = gl.createBuffer();
        gl.bindVertexArray(vaoStack);
        gl.bindBuffer(gl.ARRAY_BUFFER, vboStack);
        gl.bufferData(gl.ARRAY_BUFFER, ribbonUploadBuf.byteLength, gl.DYNAMIC_DRAW);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 3, gl.FLOAT, false, STRIDE_BYTES, 0);
        gl.enableVertexAttribArray(1);
        gl.vertexAttribPointer(1, 3, gl.FLOAT, false, STRIDE_BYTES, 12);
        gl.enableVertexAttribArray(2);
        gl.vertexAttribPointer(2, 1, gl.FLOAT, false, STRIDE_BYTES, 24);
        gl.bindVertexArray(null);

        // Critical Line Vertical Rod Buffer
        const rodVerts = new Float32Array([
            -3.5, -2.1, 0.0,
            -3.5,  2.1, 0.0
        ]);
        const vaoRod = gl.createVertexArray();
        const vboRod = gl.createBuffer();
        gl.bindVertexArray(vaoRod);
        gl.bindBuffer(gl.ARRAY_BUFFER, vboRod);
        gl.bufferData(gl.ARRAY_BUFFER, rodVerts, gl.DYNAMIC_DRAW);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
        gl.bindVertexArray(null);

        // Zero Beads Buffer: up to 500 beads along the critical line
        const maxBeads = Math.min(500, zeros.length);
        const beadData = new Float32Array(maxBeads * 6);
        const g1 = zeros[0];
        const gLast = zeros[maxBeads - 1];
        const sqrtG1 = Math.sqrt(g1);
        const sqrtGLast = Math.sqrt(gLast);

        // Precompute bead heights for wave origin connection
        const beadY = new Float32Array(maxBeads);
        for (let k = 0; k < maxBeads; k++) {
            const g = zeros[k];
            const frac = (Math.sqrt(g) - sqrtG1) / (sqrtGLast - sqrtG1);
            const y = -1.75 + frac * 3.5;
            beadY[k] = y;
            const off = k * 6;
            beadData[off + 0] = -3.5;
            beadData[off + 1] = y;
            beadData[off + 2] = -0.04 * Math.min(k, 45);
            beadData[off + 3] = g;
            beadData[off + 4] = 0.0;
            beadData[off + 5] = 0.25;
        }

        const vaoBeads = gl.createVertexArray();
        const vboBeads = gl.createBuffer();
        gl.bindVertexArray(vaoBeads);
        gl.bindBuffer(gl.ARRAY_BUFFER, vboBeads);
        gl.bufferData(gl.ARRAY_BUFFER, beadData, gl.DYNAMIC_DRAW);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 24, 0);
        gl.enableVertexAttribArray(1);
        gl.vertexAttribPointer(1, 1, gl.FLOAT, false, 24, 12);
        gl.enableVertexAttribArray(2);
        gl.vertexAttribPointer(2, 1, gl.FLOAT, false, 24, 16);
        gl.enableVertexAttribArray(3);
        gl.vertexAttribPointer(3, 1, gl.FLOAT, false, 24, 20);
        gl.bindVertexArray(null);

        // Staircase Buffer: prime power jumps as quad strips
        const maxStairVerts = 1200;
        const stairData = new Float32Array(maxStairVerts * 8);
        let stairVertCount = 0;

        const vaoStaircase = gl.createVertexArray();
        const vboStaircase = gl.createBuffer();
        gl.bindVertexArray(vaoStaircase);
        gl.bindBuffer(gl.ARRAY_BUFFER, vboStaircase);
        gl.bufferData(gl.ARRAY_BUFFER, stairData.byteLength, gl.DYNAMIC_DRAW);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 32, 0);
        gl.enableVertexAttribArray(1);
        gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 32, 12);
        gl.enableVertexAttribArray(2);
        gl.vertexAttribPointer(2, 1, gl.FLOAT, false, 32, 24);
        gl.enableVertexAttribArray(3);
        gl.vertexAttribPointer(3, 1, gl.FLOAT, false, 32, 28);
        gl.bindVertexArray(null);

        // Residual Ribbon Buffer (numSamples * 2 vertices)
        const vaoResidual = gl.createVertexArray();
        const vboResidual = gl.createBuffer();
        const residualUploadBuf = new Float32Array(numSamples * 2 * 4); // x, y, z, aSide
        gl.bindVertexArray(vaoResidual);
        gl.bindBuffer(gl.ARRAY_BUFFER, vboResidual);
        gl.bufferData(gl.ARRAY_BUFFER, residualUploadBuf.byteLength, gl.DYNAMIC_DRAW);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 16, 0);
        gl.enableVertexAttribArray(1);
        gl.vertexAttribPointer(1, 1, gl.FLOAT, false, 16, 12);
        gl.bindVertexArray(null);

        // Hairline Vertical Cursor Buffer (2 vertices)
        const hairlineData = new Float32Array([0, -2.2, 0.05, 0, 2.2, 0.05]);
        const vaoHairline = gl.createVertexArray();
        const vboHairline = gl.createBuffer();
        gl.bindVertexArray(vaoHairline);
        gl.bindBuffer(gl.ARRAY_BUFFER, vboHairline);
        gl.bufferData(gl.ARRAY_BUFFER, hairlineData, gl.DYNAMIC_DRAW);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
        gl.bindVertexArray(null);

        /* ---------- 4. Matrices and Render Targets ---------- */
        const matProj = new Float32Array(16);
        const matView = new Float32Array(16);
        const matViewProj = new Float32Array(16);
        const matModel = new Float32Array(16);
        mat4Identity(matModel);

        let sceneTarget = null;
        let lastTagTime = 0.0;
        let frameMovingAvgMs = 16.0;
        let maxStackDrawCount = mob ? 16 : 48;

        /* ---------- 5. Interactive Event Listeners ---------- */
        let cursorNormX = 0.5;
        let cursorNormY = 0.5;
        let isHovered = false;

        const updateReadout = () => {
            const activeN = currentZeroCount;
            const activeGamma = activeN > 0 ? zeros[activeN - 1].toFixed(1) : "0.0";
            const rmsVal = (ZM.estimateRms ? ZM.estimateRms(activeN) : 0.41).toFixed(2);
            const modeStr = isCesaro ? "Cesàro sum (click to toggle sharp)" : "sharp sum (click to toggle Cesàro)";
            const windowNote = curXMax < 99.5 ? ` (window x ∈ [2, ${curXMax.toFixed(0)}], RMS over [2, 100])` : "";
            const rhNote = " · wave envelope √x (zeros on Re s = ½; checked by sign changes of Z, consistent with RH)";

            let readout;
            if (isHovered) {
                const probeX = 2.0 + cursorNormX * (curXMax - 2.0);
                const psiVal = ZM.partialSumPsi(probeX, activeN, zeros, isCesaro);
                const psiExact = ZM.chebyshevPsi0(probeX);
                const nearestPP = ZM.findNearestPrimePower ? ZM.findNearestPrimePower(probeX) : Math.round(probeX);
                readout = `Explicit formula ψ(x) = x − Σ x^ρ/ρ − ln 2π − ½ ln(1 − x⁻²) · N = ${activeN} zeros (γ_N = ${activeGamma}) · RMS error = ${rmsVal}${windowNote} · ${modeStr} · x = ${probeX.toFixed(1)} · ψ = ${psiExact.toFixed(1)} · ψ_N = ${psiVal.toFixed(1)} · nearest prime power ${nearestPP}${rhNote}`;
            } else {
                readout = `Explicit formula ψ(x) = x − Σ x^ρ/ρ − ln 2π − ½ ln(1 − x⁻²) · N = ${activeN} zeros (γ_N = ${activeGamma}) · RMS error = ${rmsVal}${windowNote} · ${modeStr}${rhNote}`;
            }

            if (KW.tag) KW.tag(readout, canvas);
        };

        const onMouseMove = (e) => {
            const rect = canvas.getBoundingClientRect();
            if (rect.width <= 0 || rect.height <= 0) return;
            const px = e.clientX - rect.left;
            const py = e.clientY - rect.top;
            cursorNormX = Math.max(0.0, Math.min(1.0, px / rect.width));
            cursorNormY = Math.max(0.0, Math.min(1.0, py / rect.height));
            isHovered = true;
            updateReadout();
        };

        const onMouseLeave = () => {
            isHovered = false;
            updateReadout();
        };

        const toggleCesaro = () => {
            isCesaro = !isCesaro;
            accumDouble.fill(0);
            const count = currentZeroCount;
            const T = zeros[Math.min(count, zeros.length - 1)];
            for (let k = 0; k < count; k++) {
                const gamma = zeros[k];
                const w = isCesaro ? (1.0 - gamma / T) : 1.0;
                ZM.addZeroToGrid(grid, accumDouble, gamma, w);
            }
            updateReadout();
        };

        const togglePause = () => {
            paused = !paused;
            updateReadout();
        };

        const setTargetZeroCount = (n) => {
            n = Math.max(0, Math.min(500, n | 0));
            accumDouble.fill(0);
            currentZeroCount = n;
            const T = zeros[Math.min(n, zeros.length - 1)];
            for (let k = 0; k < n; k++) {
                const gamma = zeros[k];
                const w = isCesaro ? (1.0 - gamma / T) : 1.0;
                ZM.addZeroToGrid(grid, accumDouble, gamma, w);
            }
            targetXMax = Math.min(146.0, Math.max(24.0, 0.18 * (zeros[Math.max(0, n - 1)] || zeros[0])));
            curXMax = targetXMax;
            fadeFactor = 1.0;
            for (let i = 0; i < SCHEDULE.length; i++) {
                if (SCHEDULE[i] >= n) {
                    scheduleIdx = i;
                    break;
                }
            }
            updateReadout();
        };

        const onTagClick = (e) => {
            if (e && e.stopPropagation) e.stopPropagation();
            toggleCesaro();
        };

        const secEl = (canvas && canvas.closest) ? (canvas.closest(".snap-section, .hero") || canvas.parentElement) : null;
        const tagEl = secEl ? secEl.querySelector(".sim-tag") : null;
        if (tagEl) {
            tagEl.style.cursor = "pointer";
            tagEl.addEventListener("click", onTagClick);
        }

        if (KW.onClick) {
            KW.onClick(canvas, () => {
                toggleCesaro();
            });
        } else {
            canvas.addEventListener("click", toggleCesaro);
        }

        canvas.addEventListener("dblclick", togglePause);
        canvas.addEventListener("mousemove", onMouseMove);
        canvas.addEventListener("mouseleave", onMouseLeave);

        canvas.__setZeroCount = setTargetZeroCount;
        canvas.__toggleCesaro = toggleCesaro;
        canvas.__getState = () => ({
            zeroCount: currentZeroCount,
            isCesaro,
            paused,
            curXMax
        });

        /* ---------- 6. Incremental Timeline Logic ---------- */
        const advanceSchedule = (dt) => {
            if (paused || prefersReducedMotion) return;

            if (isRewinding) {
                rewindTimer += dt;
                const rewindFrac = Math.min(1.0, rewindTimer / 1.5);
                const targetZeros = Math.round((1.0 - rewindFrac) * 500);
                while (currentZeroCount > targetZeros) {
                    currentZeroCount--;
                    const gamma = zeros[currentZeroCount];
                    const T = zeros[Math.min(currentZeroCount + 1, zeros.length - 1)];
                    const w = isCesaro ? (1.0 - gamma / T) : 1.0;
                    ZM.removeZeroFromGrid(grid, accumDouble, gamma, w);
                }
                if (rewindFrac >= 1.0) {
                    isRewinding = false;
                    rewindTimer = 0.0;
                    scheduleIdx = 0;
                    stageTimer = 0.0;
                    accumDouble.fill(0);
                    currentZeroCount = 0;
                }
                return;
            }

            stageTimer += dt;
            const targetN = SCHEDULE[scheduleIdx];

            // Add zeros up to targetN
            if (currentZeroCount < targetN) {
                if (targetN <= 8) {
                    fadeFactor = Math.min(1.0, stageTimer / 0.6);
                    if (stageTimer >= 0.6) {
                        while (currentZeroCount < targetN) {
                            const gamma = zeros[currentZeroCount];
                            const T = zeros[Math.min(targetN, zeros.length - 1)];
                            const w = isCesaro ? (1.0 - gamma / T) : 1.0;
                            ZM.addZeroToGrid(grid, accumDouble, gamma, w);
                            currentZeroCount++;
                        }
                    }
                } else {
                    fadeFactor = 1.0;
                    while (currentZeroCount < targetN) {
                        const gamma = zeros[currentZeroCount];
                        const T = zeros[Math.min(targetN, zeros.length - 1)];
                        const w = isCesaro ? (1.0 - gamma / T) : 1.0;
                        ZM.addZeroToGrid(grid, accumDouble, gamma, w);
                        currentZeroCount++;
                    }
                }
            }

            let holdDuration = 0.55;
            if (scheduleIdx === 0) holdDuration = 2.0;
            else if (targetN <= 6) holdDuration = 1.1;
            else if (targetN === 500) holdDuration = 4.0;

            if (stageTimer >= holdDuration) {
                stageTimer = 0.0;
                fadeFactor = 0.0;
                if (scheduleIdx < SCHEDULE.length - 1) {
                    scheduleIdx++;
                    const nextN = SCHEDULE[scheduleIdx];
                    targetXMax = Math.min(146.0, Math.max(24.0, 0.18 * (zeros[nextN - 1] || zeros[0])));
                } else {
                    isRewinding = true;
                    rewindTimer = 0.0;
                    targetXMax = 24.0;
                }
            }
        };

        /* ---------- 7. Mesh Generation & Upload Helpers ---------- */
        const updateStaircaseMesh = (xOffset, spanX, xMaxLimit) => {
            let idx = 0;
            let curPsi = 0.0;
            let prevX = 2.0;

            const addQuad = (x0, y0, x1, y1, normX, normY, isRiser, jump) => {
                const wx0 = xOffset + ((x0 - 2.0) / (xMaxLimit - 2.0)) * spanX;
                const wy0 = -1.35 + (y0 / xMaxLimit) * 3.0;
                const wx1 = xOffset + ((x1 - 2.0) / (xMaxLimit - 2.0)) * spanX;
                const wy1 = -1.35 + (y1 / xMaxLimit) * 3.0;

                // Triangle 1
                stairData[idx++] = wx0; stairData[idx++] = wy0; stairData[idx++] = -0.02;
                stairData[idx++] = -normX; stairData[idx++] = -normY; stairData[idx++] = 0.0;
                stairData[idx++] = isRiser; stairData[idx++] = jump;

                stairData[idx++] = wx0; stairData[idx++] = wy0; stairData[idx++] = -0.02;
                stairData[idx++] = normX; stairData[idx++] = normY; stairData[idx++] = 0.0;
                stairData[idx++] = isRiser; stairData[idx++] = jump;

                stairData[idx++] = wx1; stairData[idx++] = wy1; stairData[idx++] = -0.02;
                stairData[idx++] = -normX; stairData[idx++] = -normY; stairData[idx++] = 0.0;
                stairData[idx++] = isRiser; stairData[idx++] = jump;

                // Triangle 2
                stairData[idx++] = wx0; stairData[idx++] = wy0; stairData[idx++] = -0.02;
                stairData[idx++] = normX; stairData[idx++] = normY; stairData[idx++] = 0.0;
                stairData[idx++] = isRiser; stairData[idx++] = jump;

                stairData[idx++] = wx1; stairData[idx++] = wy1; stairData[idx++] = -0.02;
                stairData[idx++] = normX; stairData[idx++] = normY; stairData[idx++] = 0.0;
                stairData[idx++] = isRiser; stairData[idx++] = jump;

                stairData[idx++] = wx1; stairData[idx++] = wy1; stairData[idx++] = -0.02;
                stairData[idx++] = -normX; stairData[idx++] = -normY; stairData[idx++] = 0.0;
                stairData[idx++] = isRiser; stairData[idx++] = jump;
            };

            for (let n = 2; n <= Math.floor(xMaxLimit); n++) {
                const pp = ZM.factorPrimePower(n);
                if (pp) {
                    const jump = Math.log(pp.p);
                    addQuad(prevX, curPsi, n, curPsi, 0.0, 1.0, 0.0, 0.0);
                    addQuad(n, curPsi, n, curPsi + jump, 1.0, 0.0, 1.0, jump);
                    curPsi += jump;
                    prevX = n;
                }
            }
            addQuad(prevX, curPsi, xMaxLimit, curPsi, 0.0, 1.0, 0.0, 0.0);
            stairVertCount = idx / 8;

            gl.bindBuffer(gl.ARRAY_BUFFER, vboStaircase);
            gl.bufferSubData(gl.ARRAY_BUFFER, 0, stairData.subarray(0, idx));
        };

        const uploadRibbonMesh = (vbo, yFunc, zDepth, xOffset, spanX, xMaxLimit) => {
            let ptr = 0;
            let activeSamples = 0;

            for (let i = 0; i < numSamples; i++) {
                const xVal = grid.xGrid[i];
                if (xVal > xMaxLimit && activeSamples > 10) break;
                activeSamples++;

                const wx = xOffset + ((xVal - 2.0) / (xMaxLimit - 2.0)) * spanX;
                const rawY = yFunc(i, xVal);
                const wy = -1.35 + (rawY / xMaxLimit) * 3.0;

                let tx = 1.0, ty = 0.0;
                if (i < numSamples - 1) {
                    const nextX = grid.xGrid[i + 1];
                    const nextWX = xOffset + ((nextX - 2.0) / (xMaxLimit - 2.0)) * spanX;
                    const nextWY = -1.35 + (yFunc(i + 1, nextX) / xMaxLimit) * 3.0;
                    tx = nextWX - wx;
                    ty = nextWY - wy;
                    const tLen = Math.hypot(tx, ty);
                    if (tLen > 1e-5) { tx /= tLen; ty /= tLen; }
                }

                ribbonUploadBuf[ptr++] = wx; ribbonUploadBuf[ptr++] = wy; ribbonUploadBuf[ptr++] = zDepth;
                ribbonUploadBuf[ptr++] = tx; ribbonUploadBuf[ptr++] = ty; ribbonUploadBuf[ptr++] = 0.0;
                ribbonUploadBuf[ptr++] = -1.0;

                ribbonUploadBuf[ptr++] = wx; ribbonUploadBuf[ptr++] = wy; ribbonUploadBuf[ptr++] = zDepth;
                ribbonUploadBuf[ptr++] = tx; ribbonUploadBuf[ptr++] = ty; ribbonUploadBuf[ptr++] = 0.0;
                ribbonUploadBuf[ptr++] = 1.0;
            }

            gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
            gl.bufferSubData(gl.ARRAY_BUFFER, 0, ribbonUploadBuf.subarray(0, ptr));
            return activeSamples * 2;
        };

        // Builds individual wave ribbon in the stack:
        // Positioned at its zero bead height Y_k, rippling across screen
        const uploadWaveStackMesh = (vbo, k, gamma, zDepth, xCritPos, xOffset, spanX, xMaxLimit, isActiveZero) => {
            const yOrigin = beadY[k];
            let ptr = 0;
            let activeSamples = 0;

            const uniformGain = 0.16;
            const yWaveStart = yOrigin + ZM.waveTerm(2.0, gamma) * uniformGain;

            if (isActiveZero) {
                const filamentSteps = 12;
                for (let s = 0; s <= filamentSteps; s++) {
                    const frac = s / filamentSteps;
                    const wx = xCritPos + frac * (xOffset - xCritPos);
                    const smoothF = frac * frac * (3.0 - 2.0 * frac);
                    const wy = yOrigin + smoothF * (yWaveStart - yOrigin);

                    ribbonUploadBuf[ptr++] = wx; ribbonUploadBuf[ptr++] = wy; ribbonUploadBuf[ptr++] = zDepth;
                    ribbonUploadBuf[ptr++] = 1.0; ribbonUploadBuf[ptr++] = 0.0; ribbonUploadBuf[ptr++] = 0.0;
                    ribbonUploadBuf[ptr++] = -1.0;

                    ribbonUploadBuf[ptr++] = wx; ribbonUploadBuf[ptr++] = wy; ribbonUploadBuf[ptr++] = zDepth;
                    ribbonUploadBuf[ptr++] = 1.0; ribbonUploadBuf[ptr++] = 0.0; ribbonUploadBuf[ptr++] = 0.0;
                    ribbonUploadBuf[ptr++] = 1.0;
                    activeSamples++;
                }
            }

            for (let i = 0; i < numSamples; i++) {
                const xVal = grid.xGrid[i];
                if (xVal > xMaxLimit && activeSamples > 15) break;
                activeSamples++;

                const wx = xOffset + ((xVal - 2.0) / (xMaxLimit - 2.0)) * spanX;
                const wy = yOrigin + ZM.waveTerm(xVal, gamma) * uniformGain;

                let tx = 1.0, ty = 0.0;
                if (i < numSamples - 1) {
                    const nextX = grid.xGrid[i + 1];
                    const nextWX = xOffset + ((nextX - 2.0) / (xMaxLimit - 2.0)) * spanX;
                    const nextWY = yOrigin + ZM.waveTerm(nextX, gamma) * uniformGain;
                    tx = nextWX - wx; ty = nextWY - wy;
                    const tLen = Math.hypot(tx, ty);
                    if (tLen > 1e-5) { tx /= tLen; ty /= tLen; }
                }

                ribbonUploadBuf[ptr++] = wx; ribbonUploadBuf[ptr++] = wy; ribbonUploadBuf[ptr++] = zDepth;
                ribbonUploadBuf[ptr++] = tx; ribbonUploadBuf[ptr++] = ty; ribbonUploadBuf[ptr++] = 0.0;
                ribbonUploadBuf[ptr++] = -1.0;

                ribbonUploadBuf[ptr++] = wx; ribbonUploadBuf[ptr++] = wy; ribbonUploadBuf[ptr++] = zDepth;
                ribbonUploadBuf[ptr++] = tx; ribbonUploadBuf[ptr++] = ty; ribbonUploadBuf[ptr++] = 0.0;
                ribbonUploadBuf[ptr++] = 1.0;
            }

            gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
            gl.bufferSubData(gl.ARRAY_BUFFER, 0, ribbonUploadBuf.subarray(0, ptr));
            return activeSamples * 2;
        };

        // Builds residual ribbon mesh: psi_N(x) - psi_0(x) at Y = -1.55 (safe inside view frustum)
        const uploadResidualMesh = (xOffset, spanX, xMaxLimit) => {
            const yBase = -1.55;
            let ptr = 0;
            let count = 0;

            for (let i = 0; i < numSamples; i++) {
                const xVal = grid.xGrid[i];
                if (xVal > xMaxLimit && count > 10) break;
                count++;

                const wx = xOffset + ((xVal - 2.0) / (xMaxLimit - 2.0)) * spanX;
                const psiApprox = grid.baseSmooth[i] + accumDouble[i];
                const psiExact = grid.trueStaircase[i];
                const diff = (psiApprox - psiExact) / xMaxLimit;
                const wy = yBase + diff * 1.2;

                residualUploadBuf[ptr++] = wx; residualUploadBuf[ptr++] = wy; residualUploadBuf[ptr++] = 0.0; residualUploadBuf[ptr++] = -1.0;
                residualUploadBuf[ptr++] = wx; residualUploadBuf[ptr++] = wy; residualUploadBuf[ptr++] = 0.0; residualUploadBuf[ptr++] = 1.0;
            }

            gl.bindBuffer(gl.ARRAY_BUFFER, vboResidual);
            gl.bufferSubData(gl.ARRAY_BUFFER, 0, residualUploadBuf.subarray(0, ptr));
            return count * 2;
        };

        // Updates zero beads buffer (active zero pulses)
        const updateBeadsBuffer = (xCritPos) => {
            const activeK = currentZeroCount > 0 ? (currentZeroCount - 1) : -1;
            for (let k = 0; k < maxBeads; k++) {
                const off = k * 6;
                const isAct = (k === activeK && stageTimer < 0.8) ? 1.0 : 0.0;
                const isVisible = k < currentZeroCount ? 1.0 : 0.18;
                beadData[off + 0] = xCritPos;
                beadData[off + 4] = isAct;
                beadData[off + 5] = isVisible;
            }
            gl.bindBuffer(gl.ARRAY_BUFFER, vboBeads);
            gl.bufferSubData(gl.ARRAY_BUFFER, 0, beadData);
        };

        /* ---------- 8. Main Render Loop ---------- */
        let outW = 0, outH = 0;
        const outCtx2d = canvas.getContext("2d");

        KW.fit(canvas, (w, h, dpr) => {
            outW = w; outH = h;
            outCtx2d.setTransform(dpr, 0, 0, dpr, 0, 0);
        });

        let lastFrameTime = performance.now();

        const loopHandle = KW.loop(canvas, (t) => {
            const now = performance.now();
            const dt = Math.min(0.1, (now - lastFrameTime) * 0.001);
            lastFrameTime = now;

            // Frame-time moving average for adaptive quality
            const frameMs = dt * 1000.0;
            frameMovingAvgMs = frameMovingAvgMs * 0.92 + frameMs * 0.08;
            if (frameMovingAvgMs > 20.0 && maxStackDrawCount > 16) {
                maxStackDrawCount = Math.max(12, maxStackDrawCount - 2);
            } else if (frameMovingAvgMs < 15.0 && maxStackDrawCount < (mob ? 20 : 64)) {
                maxStackDrawCount++;
            }

            advanceSchedule(dt);

            curXMax += (targetXMax - curXMax) * Math.min(1.0, dt * 4.5);

            if (!sceneTarget || sceneTarget.w !== outW || sceneTarget.h !== outH) {
                if (sceneTarget) sceneTarget.dispose();
                sceneTarget = GFX.target(outW, outH, { depth: true });
            }

            const aspect = Math.max(0.1, outW / Math.max(1, outH));
            // Adaptive FOV and distance for mobile vs desktop
            const fovy = aspect < 1.0 ? ((52.0 * Math.PI) / 180.0) : ((46.0 * Math.PI) / 180.0);
            mat4Perspective(matProj, fovy, aspect, 0.1, 50.0);

            // Responsive horizontal layout adapting to aspect ratio
            const spanX = aspect < 1.0 ? Math.min(3.8, aspect * 4.8) : Math.min(6.8, aspect * 7.0);
            const xOffset = -spanX * 0.44;
            const xCritPos = -spanX * 0.54;

            // Update Critical Rod position
            rodVerts[0] = xCritPos; rodVerts[3] = xCritPos;
            gl.bindBuffer(gl.ARRAY_BUFFER, vboRod);
            gl.bufferSubData(gl.ARRAY_BUFFER, 0, rodVerts);

            const camDist = aspect < 1.0 ? 5.8 : 5.0;
            const camT = t * 0.18;
            const pxOffset = isHovered ? (cursorNormX - 0.5) * 0.35 : 0.0;
            const pyOffset = isHovered ? (cursorNormY - 0.5) * 0.25 : 0.0;
            const eye = [
                Math.sin(camT) * 0.15 + pxOffset,
                0.12 - pyOffset,
                camDist
            ];
            const center = [0.10, -0.05, -0.4];
            const up = [0.0, 1.0, 0.0];
            mat4LookAt(matView, eye, center, up);
            mat4Multiply(matViewProj, matProj, matView);

            const aCol = KW.col ? KW.col.a : [0, 220, 255];
            const normAccent = [aCol[0] / 255.0, aCol[1] / 255.0, aCol[2] / 255.0];

            sceneTarget.clear(0.0, 0.0, 0.0, 1.0);
            gl.bindFramebuffer(gl.FRAMEBUFFER, sceneTarget.fbo);
            gl.viewport(0, 0, outW, outH);

            gl.enable(gl.DEPTH_TEST);
            gl.depthFunc(gl.LEQUAL);

            /* ----- 8A. Render Left Layer: Critical Line & Beads ----- */
            progRod.use()
                .mat4("uViewProj", matViewProj)
                .mat4("uModel", matModel)
                .f3("uColor", normAccent[0], normAccent[1], normAccent[2])
                .f1("uAlpha", 0.75)
                .f1("uTime", t);
            gl.bindVertexArray(vaoRod);
            gl.lineWidth(2.0);
            gl.drawArrays(gl.LINES, 0, 2);

            updateBeadsBuffer(xCritPos);
            gl.enable(gl.BLEND);
            gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
            progBeads.use()
                .mat4("uViewProj", matViewProj)
                .mat4("uModel", matModel)
                .f3("uAccent", normAccent[0], normAccent[1], normAccent[2])
                .f1("uPointSize", mob ? 7.0 : 10.0)
                .f1("uTime", t);
            gl.bindVertexArray(vaoBeads);
            gl.drawArrays(gl.POINTS, 0, maxBeads);
            gl.disable(gl.BLEND);

            /* ----- 8B. Render Middle Layer: Wave Stack Ribbons ----- */
            if (currentZeroCount > 0) {
                const startK = currentZeroCount <= 64 ? 0 : Math.max(0, currentZeroCount - 24);

                gl.enable(gl.BLEND);
                gl.blendFunc(gl.SRC_ALPHA, gl.ONE);

                for (let k = startK; k < currentZeroCount; k++) {
                    const gamma = zeros[k];
                    const age = currentZeroCount - 1 - k;
                    const zDepth = -0.15 - 0.06 * Math.min(age, 35);
                    const isActiveZero = (k === currentZeroCount - 1 && stageTimer < 0.8);

                    const stackVerts = uploadWaveStackMesh(vboStack, k, gamma, zDepth, xCritPos, xOffset, spanX, curXMax, isActiveZero);

                    const freqFrac = Math.min(1.0, gamma / 600.0);
                    const waveCol = [
                        normAccent[0] * (1.0 - 0.35 * freqFrac) + 0.35 * freqFrac,
                        normAccent[1] * (0.85 + 0.15 * freqFrac),
                        normAccent[2] * (0.6 + 0.4 * freqFrac)
                    ];

                    const stackAlpha = isActiveZero ? 0.95 : Math.max(0.08, 0.45 / Math.sqrt(age + 1.5));

                    progRibbon.use()
                        .mat4("uViewProj", matViewProj)
                        .mat4("uModel", matModel)
                        .mat4("uView", matView)
                        .f3("uCamPos", eye[0], eye[1], eye[2])
                        .f1("uWidth", 0.009)
                        .f1("uTime", t)
                        .f3("uColor", waveCol[0], waveCol[1], waveCol[2])
                        .f1("uAlpha", stackAlpha)
                        .f1("uCoreBoost", 1.8)
                        .f1("uFogNear", 4.8)
                        .f1("uFogFar", 8.2)
                        .f1("uCesaro", isCesaro ? 1.0 : 0.0);

                    gl.bindVertexArray(vaoStack);
                    gl.drawArrays(gl.TRIANGLE_STRIP, 0, stackVerts);
                }
                gl.disable(gl.BLEND);
            }

            /* ----- 8C. Render Front Plane: Staircase, Sum Ribbon, Residual ----- */
            // 1. Prime power ghost staircase
            updateStaircaseMesh(xOffset, spanX, curXMax);
            progStaircase.use()
                .mat4("uViewProj", matViewProj)
                .mat4("uModel", matModel)
                .f3("uAccent", normAccent[0], normAccent[1], normAccent[2])
                .f1("uTreadWidth", 0.005)
                .f1("uRiserWidth", 0.012)
                .f1("uAlpha", 0.75)
                .f1("uTime", t);
            gl.bindVertexArray(vaoStaircase);
            gl.drawArrays(gl.TRIANGLES, 0, stairVertCount);

            // 2. Sum ribbon psi_N(x)
            const sumVerts = uploadRibbonMesh(vboRibbon, (i, x) => {
                let sumVal = grid.baseSmooth[i] + accumDouble[i];
                if (currentZeroCount < 8 && fadeFactor > 0.0 && fadeFactor < 1.0) {
                    const activeGamma = zeros[currentZeroCount];
                    sumVal += fadeFactor * ZM.waveTerm(x, activeGamma);
                }
                return sumVal;
            }, 0.0, xOffset, spanX, curXMax);

            progRibbon.use()
                .mat4("uViewProj", matViewProj)
                .mat4("uModel", matModel)
                .mat4("uView", matView)
                .f3("uCamPos", eye[0], eye[1], eye[2])
                .f1("uWidth", 0.014)
                .f1("uTime", t)
                .f3("uColor", normAccent[0] * 1.3, normAccent[1] * 1.3, normAccent[2] * 1.4)
                .f1("uAlpha", 1.0)
                .f1("uCoreBoost", 3.2)
                .f1("uFogNear", 4.8)
                .f1("uFogFar", 15.0)
                .f1("uCesaro", isCesaro ? 1.0 : 0.0);

            gl.bindVertexArray(vaoRibbon);
            gl.drawArrays(gl.TRIANGLE_STRIP, 0, sumVerts);

            // 3. Thin residual error ribbon psi_N(x) - psi_0(x)
            const resVerts = uploadResidualMesh(xOffset, spanX, curXMax);
            progResidual.use()
                .mat4("uViewProj", matViewProj)
                .mat4("uModel", matModel)
                .f1("uWidth", 0.008)
                .f3("uColor", 0.95, 0.42, 0.30)
                .f1("uAlpha", 0.85);
            gl.bindVertexArray(vaoResidual);
            gl.drawArrays(gl.TRIANGLE_STRIP, 0, resVerts);

            // 4. Interactive Cursor Hairline Probe
            if (isHovered) {
                const probeWX = xOffset + cursorNormX * spanX;
                hairlineData[0] = probeWX; hairlineData[1] = -2.2; hairlineData[2] = 0.05;
                hairlineData[3] = probeWX; hairlineData[4] =  2.2; hairlineData[5] = 0.05;
                gl.bindBuffer(gl.ARRAY_BUFFER, vboHairline);
                gl.bufferSubData(gl.ARRAY_BUFFER, 0, hairlineData);

                progHairline.use()
                    .mat4("uViewProj", matViewProj)
                    .mat4("uModel", matModel)
                    .f3("uColor", 1.0, 1.0, 1.0)
                    .f1("uAlpha", 0.45);
                gl.bindVertexArray(vaoHairline);
                gl.drawArrays(gl.LINES, 0, 2);
            }

            gl.disable(gl.DEPTH_TEST);
            gl.bindVertexArray(null);

            // Post-Processing: Filmic ACES Tone Mapping & Bloom
            GFX.compose(sceneTarget, outCtx2d, outW, outH, {
                bloomGain: mob ? 0.32 : 0.42,
                threshold: 0.30,
                exposure: 1.15,
                time: t,
                accent: aCol
            });

            // Numerical Readout via KW.tag (<= 4 Hz Throttle)
            if (t - lastTagTime >= 0.25) {
                lastTagTime = t;
                updateReadout();
            }
        });

        /* ---------- 9. Clean Disposal Protocol ---------- */
        canvas.__dispose = () => {
            if (loopHandle && loopHandle.stop) loopHandle.stop();
            canvas.removeEventListener("dblclick", togglePause);
            canvas.removeEventListener("mousemove", onMouseMove);
            canvas.removeEventListener("mouseleave", onMouseLeave);
            if (tagEl) {
                tagEl.removeEventListener("click", onTagClick);
            }

            gl.deleteVertexArray(vaoRibbon); gl.deleteBuffer(vboRibbon);
            gl.deleteVertexArray(vaoStack); gl.deleteBuffer(vboStack);
            gl.deleteVertexArray(vaoRod); gl.deleteBuffer(vboRod);
            gl.deleteVertexArray(vaoBeads); gl.deleteBuffer(vboBeads);
            gl.deleteVertexArray(vaoStaircase); gl.deleteBuffer(vboStaircase);
            gl.deleteVertexArray(vaoResidual); gl.deleteBuffer(vboResidual);
            gl.deleteVertexArray(vaoHairline); gl.deleteBuffer(vboHairline);

            if (sceneTarget) {
                sceneTarget.dispose();
                sceneTarget = null;
            }
        };

        return canvas.__dispose;
    };

    SIMS["primes-waves"] = runPrimesWaves;
    SIMS["primes-from-waves"] = runPrimesWaves;
}));
