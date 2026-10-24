/**
 * gpu-qsim.js
 *
 * WebGL2 Scene for the Computer Science hero: "Quantum search and period finding."
 * Evolves an 8-qubit (Grover) and 12-qubit (Shor N=15, a=7, 2, 4, 11, 13) state vector
 * in double precision on the CPU along exact continuous fractional-gate unitaries,
 * uploading Float32 instance attributes each frame to the shared GFX WebGL2 context.
 *
 * Enhanced Shor Simulation:
 *   - Interactive 5-stage stepper (Superposition -> ModExp -> Work Collapse -> QFT -> Factors)
 *   - Luminous 3D entanglement arcs connecting counting states x to residues y = a^x mod 15
 *   - Periodic comb visualization with 64 resonant preimage bridges upon work register collapse
 *   - Resonant QFT frequency beacon columns at m in {0, 64, 128, 192} (s * Q / r)
 *   - Live quantum measurement sampling with continued fractions expansion p/q -> r
 *   - Classical post-processing: gcd(a^(r/2) ± 1, 15) recovering prime factors 3 and 5
 *   - Selectable coprime base a in {7, 2, 4, 11, 13}
 *   - Dynamic hero equation toggle between Grover and Shor formulations
 *   - On-canvas interactive glass controls HUD & keyboard hotkeys (1-5, Space, A, M, R)
 */

(function (root, factory) {
    if (typeof module === "object" && module.exports) module.exports = factory(root);
    else factory(root);
}(typeof self !== "undefined" ? self : this, function (root) {
    "use strict";

    const SIMS = (root.SIMS = root.SIMS || {});
    const Q = root.QSimMath || (typeof require !== "undefined" ? require("../lib/qsim-math.js") : null);
    const S = root.QSimShaders || (typeof require !== "undefined" ? require("./gpu-qsim-shaders.js") : null);

    const TAU = Math.PI * 2.0, R_RING = 2.35, R_INNER = 0.78, H_SCALE = 2.60;
    const COPRIME_BASES = [7, 2, 4, 11, 13];

    const smoothstep = (x) => {
        const t = Math.max(0.0, Math.min(1.0, x));
        return t * t * (3.0 - 2.0 * t);
    };

    const bitRev8 = (v) => {
        let r = 0;
        for (let b = 0; b < 8; b++) if ((v >> b) & 1) r |= (1 << (7 - b));
        return r;
    };

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
        let len = 1.0 / Math.hypot(z0, z1, z2);
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

    const buildSpikeMesh = () => {
        const sides = 6, verts = [];
        const pushTri = (p0, p1, p2, n) => verts.push(...p0, ...n, ...p1, ...n, ...p2, ...n);
        for (let i = 0; i < sides; i++) {
            const a0 = (i / sides) * TAU, a1 = ((i + 1) / sides) * TAU, am = 0.5 * (a0 + a1);
            const c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1);
            const nSide = [Math.cos(am), 0.15, Math.sin(am)];
            pushTri([c0, 0, s0], [c1, 0, s1], [c1, 1, s1], nSide);
            pushTri([c0, 0, s0], [c1, 1, s1], [c0, 1, s0], nSide);
            pushTri([0, 1.04, 0], [c0, 1, s0], [c1, 1, s1], [0, 1, 0]);
        }
        return new Float32Array(verts);
    };

    const fallback2D = (canvas, opts = {}) => {
        const E = root.ENGINES;
        return E && (E["cs-2d"] || E.automaton) ? (E["cs-2d"] || E.automaton)(canvas, opts) : null;
    };

    const eqGrover = String.raw`$$|\psi_{k+1}\rangle = (2|\psi\rangle\langle\psi| - \hat I)\,\hat O\,|\psi_k\rangle,\qquad \hat O = \hat I - 2|\omega\rangle\langle\omega|$$`;
    const eqShor = String.raw`$$\operatorname{QFT}_Q \left(\frac{1}{\sqrt{Q/r}}\sum_{k=0}^{Q/r - 1}\lvert x_0 + kr \rangle\right) = \frac{1}{\sqrt r}\sum_{s=0}^{r-1} e^{2\pi i s x_0 / r} \left\lvert s \frac{Q}{r} \right\rangle,\qquad \gcd(a^{r/2} \pm 1, N) \in \{3, 5\}$$`;

    const updateHeroEq = (canvas, m) => {
        const sec = canvas.closest("section") || (typeof document !== "undefined" ? (document.getElementById("domain-intro") || document.getElementById("domain-cs")) : null);
        const eqEl = sec ? sec.querySelector(".hero-eq") : null;
        if (eqEl) {
            eqEl.textContent = (m === "grover" ? eqGrover : eqShor);
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

    SIMS.cs = SIMS.qsim = SIMS["quantum-search-period"] = (canvas, opts = {}) => {
        const GFX = root.GFX, QMod = Q || root.QSimMath, SMod = S || root.QSimShaders;
        if (!GFX || !GFX.supported || !QMod || !SMod) return fallback2D(canvas, opts);

        return GFX.mount(canvas, (gfx, cvs, getSize) => {
            const gl = gfx.gl;
            const progSpikes = gfx.program(SMod.VS_SPIKES, SMod.FS_SPIKES);
            const progDisc = gfx.program(SMod.VS_DISC, SMod.FS_DISC);
            const progLP = gfx.program(SMod.VS_LINES_POINTS, SMod.FS_LINES_POINTS);
            if (!progSpikes || !progDisc || !progLP) return null;

            const prng = QMod.mulberry32(opts.seed || 0x51514D32);
            const st8Base = QMod.createState(8), st8Live = QMod.createState(8);
            const st12Base = QMod.createState(12), st12Live = QMod.createState(12);
            const tmpModRe = new Float64Array(4096), tmpModIm = new Float64Array(4096);
            const workProbs = new Float64Array(16);
            const qftGates = QMod.buildQftCircuit(8);

            const spikeMesh = buildSpikeMesh(), spikeVertCount = spikeMesh.length / 6;
            const MAX_INST = 272, instBufData = new Float32Array(MAX_INST * 8);
            const vaoSpikes = gl.createVertexArray(), vboMesh = gl.createBuffer(), vboInst = gl.createBuffer();
            gl.bindVertexArray(vaoSpikes);
            gl.bindBuffer(gl.ARRAY_BUFFER, vboMesh);
            gl.bufferData(gl.ARRAY_BUFFER, spikeMesh, gl.STATIC_DRAW);
            gl.enableVertexAttribArray(0);
            gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 24, 0);
            gl.enableVertexAttribArray(1);
            gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 24, 12);
            gl.bindBuffer(gl.ARRAY_BUFFER, vboInst);
            gl.bufferData(gl.ARRAY_BUFFER, instBufData.byteLength, gl.DYNAMIC_DRAW);
            gl.enableVertexAttribArray(2);
            gl.vertexAttribPointer(2, 4, gl.FLOAT, false, 32, 0);
            gl.vertexAttribDivisor(2, 1);
            gl.enableVertexAttribArray(3);
            gl.vertexAttribPointer(3, 4, gl.FLOAT, false, 32, 16);
            gl.vertexAttribDivisor(3, 1);

            const vaoDisc = gl.createVertexArray(), vboDisc = gl.createBuffer();
            gl.bindVertexArray(vaoDisc);
            gl.bindBuffer(gl.ARRAY_BUFFER, vboDisc);
            gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
            gl.enableVertexAttribArray(0);
            gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

            const LP_MAX_VERTS = 4096;
            const lpBufData = new Float32Array(LP_MAX_VERTS * 7);
            const vaoLP = gl.createVertexArray(), vboLP = gl.createBuffer();
            gl.bindVertexArray(vaoLP);
            gl.bindBuffer(gl.ARRAY_BUFFER, vboLP);
            gl.bufferData(gl.ARRAY_BUFFER, lpBufData.byteLength, gl.DYNAMIC_DRAW);
            gl.enableVertexAttribArray(0);
            gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 28, 0);
            gl.enableVertexAttribArray(1);
            gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 28, 12);
            gl.bindVertexArray(null);

            const dustSeeds = Array.from({ length: 110 }, (_, i) => ({
                x: (prng() - 0.5) * 9.0, y: 0.15 + prng() * 3.4, z: (prng() - 0.5) * 7.5,
                ph: prng() * TAU, sz: 2.8 + (i % 5) * 1.1
            }));

            /* ---------- Shor & Grover Simulation State ---------- */
            let mode = "grover", cycleTime = 0.0, doneIdx = -1, steps = [], flash = 0.0;
            let targetW = 77, measuredW = 77, groverIter = 0, groverP = 1 / 256, groverAngle = Math.asin(1 / 16);

            let shorA = 7, shorY = 13, shorM = 192, shorR = 4, shorSwapSlide = 0.0;
            let shorPost = null;
            let activeCircuitGate = 0, totalCircuitGates = 20;
            let hoverIdx = -1, lastTagMs = 0, lockedStage = false, isPaused = false;
            let currentStageIdx = 0;

            const SHOR_STAGES = [
                { id: "super", num: 1, name: "Superposition", t0: 0.0, tTarget: 2.0 },
                { id: "modexp", num: 2, name: "ModExp", t0: 4.0, tTarget: 5.2 },
                { id: "collapse", num: 3, name: "Work Collapse", t0: 6.2, tTarget: 7.5 },
                { id: "qft", num: 4, name: "QFT Phase", t0: 9.0, tTarget: 15.0 },
                { id: "factors", num: 5, name: "Factors", t0: 31.0, tTarget: 33.5 }
            ];

            const sampleShorMeasurement = () => {
                let rExpected = 1;
                while (QMod.modPow(shorA, rExpected, 15) !== 1) rExpected++;
                shorR = rExpected;

                const possiblePeaks = [];
                const step = 256 / rExpected;
                for (let s = 0; s < rExpected; s++) possiblePeaks.push(Math.round(s * step));

                // Sample from quantum interference peaks
                const u = prng();
                if (possiblePeaks.length > 1 && u > 0.15) {
                    const nonZero = possiblePeaks.filter(p => p > 0);
                    shorM = nonZero[Math.floor(prng() * nonZero.length)];
                } else {
                    shorM = possiblePeaks[Math.floor(prng() * possiblePeaks.length)];
                }

                shorPost = QMod.shorPostProcess(shorM, 256, 15, shorA);
                flash = 1.0;
            };

            const buildGroverSchedule = () => {
                const list = [];
                for (let i = 0; i < 8; i++) {
                    const q = 7 - i, t0 = 0.8 + i * 0.6;
                    list.push({ t0, t1: t0 + 0.6, gateIdx: i, k: 0, run: (st, s) => QMod.applyH(st, q, s) });
                }
                let tCur = 5.6;
                for (let k = 0; k < 12; k++) {
                    const half = k < 4 ? 0.9 : 0.6;
                    list.push({ t0: tCur, t1: tCur + half, gateIdx: 8 + k, k, run: (st, s) => QMod.applyGroverOracle(st, targetW, s) });
                    list.push({ t0: tCur + half, t1: tCur + 2 * half, gateIdx: 8 + k, k: k + 1, run: (st, s) => QMod.applyGroverDiffusion(st, s) });
                    tCur += 2 * half;
                }
                list.push({
                    t0: tCur + 2.2, t1: tCur + 2.2, gateIdx: 19, k: 12,
                    run: (st) => { measuredW = QMod.measureState(st, prng).index; flash = 1.0; }
                });
                return list;
            };

            const buildShorSchedule = () => {
                const list = [];
                for (let i = 0; i < 8; i++) {
                    const q = 7 - i, t0 = i * 0.5;
                    list.push({ t0, t1: t0 + 0.5, gateIdx: i, run: (st, s) => QMod.applyH(st, q, s) });
                }
                list.push({
                    t0: 4.0, t1: 4.0, gateIdx: 0,
                    run: (st) => QMod.applyModExpOracle(st, 8, 4, shorA, 15, tmpModRe, tmpModIm)
                });
                list.push({
                    t0: 6.2, t1: 6.2, gateIdx: 0,
                    run: (st) => { QMod.measureWorkRegister(st, 8, 4, shorY); flash = 0.85; }
                });
                for (let g = 0; g < 36; g++) {
                    const t0 = 9.0 + g * 0.6;
                    list.push({ t0, t1: t0 + 0.6, gateIdx: g, run: (st, s) => QMod.applyGate(st, qftGates[g], s) });
                }
                list.push({
                    t0: 30.6, t1: 30.6, gateIdx: 36,
                    run: (st) => {
                        for (let g = 36; g < 40; g++) QMod.applyGate(st, qftGates[g], 1.0);
                        sampleShorMeasurement();
                    }
                });
                return list;
            };

            const resetGrover = (newW, startAtUniform = true) => {
                mode = "grover"; doneIdx = -1; flash = 0.0; totalCircuitGates = 20;
                targetW = typeof newW === "number" ? (newW & 255) : Math.floor(prng() * 256);
                measuredW = targetW; groverIter = 0;
                QMod.resetBasis(st8Base, 0); QMod.resetBasis(st8Live, 0);
                workProbs.fill(0.0);
                steps = buildGroverSchedule();
                if (startAtUniform) {
                    cycleTime = 5.6;
                    evaluateAt(5.6);
                } else {
                    cycleTime = 0.0;
                }
                updateHeroEq(canvas, "grover");
                lastTagMs = 0;
            };

            const resetShor = (forcedY, baseA = shorA) => {
                mode = "shor"; cycleTime = 0.0; doneIdx = -1; flash = 0.0; shorSwapSlide = 0.0; totalCircuitGates = 40;
                shorA = baseA;
                const residues = QMod.getShorResidues ? QMod.getShorResidues(shorA, 15) : [1, 7, 4, 13];
                shorY = typeof forcedY === "number" ? forcedY : residues[Math.floor(prng() * residues.length)];
                shorM = 192;
                shorPost = null;
                sampleShorMeasurement();
                QMod.resetBasis(st12Base, 0); QMod.resetBasis(st12Live, 0);
                workProbs.fill(0.0); workProbs[0] = 1.0;
                steps = buildShorSchedule();
                updateHeroEq(canvas, "shor");
                lastTagMs = 0;
            };

            const cycleBaseA = () => {
                const idx = COPRIME_BASES.indexOf(shorA);
                const nextA = COPRIME_BASES[(idx + 1) % COPRIME_BASES.length];
                resetShor(null, nextA);
                cycleTime = 7.5; // Jump to comb collapse so new period and residue are visible immediately
                evaluateAt(cycleTime);
                flash = 0.75;
            };

            const evaluateAt = (ct) => {
                const base = mode === "grover" ? st8Base : st12Base;
                const live = mode === "grover" ? st8Live : st12Live;
                while (doneIdx + 1 < steps.length && ct >= steps[doneIdx + 1].t1 - 1e-7) {
                    doneIdx++;
                    steps[doneIdx].run(base, 1.0);
                }
                live.re.set(base.re);
                live.im.set(base.im);
                const next = steps[doneIdx + 1];
                if (next && ct > next.t0 + 1e-7 && next.t1 > next.t0) {
                    next.run(live, smoothstep((ct - next.t0) / (next.t1 - next.t0)));
                    activeCircuitGate = next.gateIdx;
                    if (mode === "grover") groverIter = next.k;
                } else if (doneIdx >= 0) {
                    activeCircuitGate = steps[doneIdx].gateIdx;
                    if (mode === "grover") groverIter = steps[doneIdx].k ?? groverIter;
                }

                if (mode === "grover") {
                    const rw = st8Live.re[targetW], iw = st8Live.im[targetW];
                    groverP = rw * rw + iw * iw;
                    groverAngle = (2.0 * groverIter + 1.0) * Math.asin(1.0 / 16.0);
                } else {
                    if (ct < 9.5) QMod.workRegisterMarginals(st12Live, 8, 4, workProbs);
                    shorSwapSlide = ct >= 30.6 ? smoothstep((ct - 30.6) / 3.4) : 0.0;
                    if (ct >= 31.0 && !shorPost) sampleShorMeasurement();
                    // Compute current stage index
                    if (ct < 4.0) currentStageIdx = 0;
                    else if (ct < 6.2) currentStageIdx = 1;
                    else if (ct < 9.0) currentStageIdx = 2;
                    else if (ct < 31.0) currentStageIdx = 3;
                    else currentStageIdx = 4;
                }
            };

            const jumpToShorStage = (stageIdx) => {
                if (mode !== "shor") resetShor(shorY, shorA);
                const s = SHOR_STAGES[Math.max(0, Math.min(SHOR_STAGES.length - 1, stageIdx))];
                resetShor(shorY, shorA);
                cycleTime = s.tTarget;
                evaluateAt(cycleTime);
                flash = 0.6;
                lastTagMs = 0;
            };

            const stepShorStage = (dir = 1) => {
                if (mode !== "shor") { resetShor(); return; }
                const next = (currentStageIdx + dir + SHOR_STAGES.length) % SHOR_STAGES.length;
                jumpToShorStage(next);
            };

            const setExactStage = (cfg = {}) => {
                lockedStage = !!cfg.lock;
                if (cfg.mode === "shor") {
                    resetShor(cfg.y ?? 13, cfg.a ?? 7);
                    const map = { super: 2.0, modexp: 5.2, comb: 7.5, collapse: 7.5, "mid-qft": 15.0, qft: 15.0, peaks: 34.0, factors: 34.0 };
                    cycleTime = map[cfg.stage] ?? cfg.time ?? 7.5;
                } else {
                    resetGrover(cfg.w ?? 77);
                    const k = cfg.k ?? 12;
                    let t0 = 5.6;
                    for (let i = 0; i < k; i++) t0 += (i < 4 ? 1.8 : 1.2);
                    cycleTime = k === 0 ? 5.6 : t0;
                }
                evaluateAt(cycleTime);
                lastTagMs = 0;
            };

            if (root.KW && root.KW.REDUCED) setExactStage({ mode: "grover", k: 12, w: 77, lock: true });
            else resetGrover(77);

            let meanMag = 0.0, meanPhase = 0.0;
            const updateInstanceBuffer = () => {
                let sumR = 0.0, sumI = 0.0;
                const isShor = mode === "shor", ySlice = shorY << 8;
                const peakStep = isShor ? (256 / (shorR || 4)) : 64;

                for (let j = 0; j < 256; j++) {
                    let r = 0.0, im = 0.0;
                    if (!isShor) { r = st8Live.re[j]; im = st8Live.im[j]; }
                    else if (cycleTime < 4.0) { r = st12Live.re[j]; im = st12Live.im[j]; }
                    else if (cycleTime < 6.2) {
                        const yb = QMod.modPow(shorA, j, 15) << 8;
                        r = st12Live.re[yb | j]; im = st12Live.im[yb | j];
                    } else { r = st12Live.re[ySlice | j]; im = st12Live.im[ySlice | j]; }

                    sumR += r; sumI += im;
                    const prob = r * r + im * im, mag = Math.sqrt(prob);
                    let ph = Math.atan2(im, r);
                    if (ph < 0) ph += TAU;
                    const rev = bitRev8(j);
                    const renderIdx = (isShor && cycleTime >= 30.6) ? (rev + (j - rev) * shorSwapSlide) : j;

                    // Highlight logic
                    let isMarked = false;
                    if (!isShor) {
                        isMarked = (j === targetW) || (j === hoverIdx);
                    } else {
                        if (cycleTime >= 30.6) {
                            const isPeak = (j % peakStep === 0);
                            isMarked = (j === shorM) || isPeak || (j === hoverIdx);
                        } else if (cycleTime >= 6.2) {
                            const matchesY = (QMod.modPow(shorA, j, 15) === shorY);
                            isMarked = matchesY || (j === hoverIdx);
                        } else {
                            isMarked = (j === hoverIdx);
                        }
                    }

                    const off = j * 8;
                    instBufData.set([
                        (renderIdx / 256.0) * TAU, mag, ph, prob,
                        R_RING, isMarked ? 0.028 : 0.019, isMarked ? 1.0 : 0.0, 0.0
                    ], off);
                }
                meanMag = Math.hypot(sumR, sumI) / 256.0;
                meanPhase = (Math.atan2(sumI, sumR) + TAU) % TAU;

                for (let y = 0; y < 16; y++) {
                    const py = isShor ? workProbs[y] : 0.0, ang = (y / 16.0) * TAU;
                    const isMeasuredY = isShor && y === shorY && cycleTime >= 6.2;
                    instBufData.set([
                        ang, py * 0.16, ang, py * 0.22,
                        R_INNER, isMeasuredY ? 0.048 : 0.034, isMeasuredY ? 1.0 : 0.0, 1.0
                    ], (256 + y) * 8);
                }
                gl.bindBuffer(gl.ARRAY_BUFFER, vboInst);
                gl.bufferSubData(gl.ARRAY_BUFFER, 0, instBufData);
            };

            const updateCaption = (nowMs) => {
                if (nowMs - lastTagMs < 250 && lastTagMs !== 0) return;
                lastTagMs = nowMs;
                let text = "";
                if (mode === "grover") {
                    text = `Grover search · 8 simulated qubits (exact classical simulation, not a quantum device) · N = 256 · k = ${groverIter} · P(marked) = ${groverP.toFixed(4)} · optimal k = 12 · 12 oracle queries vs ≈ 128 classically${cycleTime >= 24.6 ? ` · found w = ${measuredW}` : ""}`;
                } else {
                    const stage = SHOR_STAGES[currentStageIdx];
                    text = `Shor's algorithm (N=15, a=${shorA}) · Stage ${stage.num}/5: ${stage.name}`;
                    if (currentStageIdx === 0) {
                        text += " · Uniform superposition |+⟩^⊗8 (256 basis states) · Work register |0⟩";
                    } else if (currentStageIdx === 1) {
                        text += ` · Modular exponentiation |x⟩|${shorA}ˣ mod 15⟩ · 3D entanglement arcs to work register`;
                    } else if (currentStageIdx === 2) {
                        text += ` · Work register collapsed to residue y=${shorY} · periodic comb formed (r=${shorR}, 64 preimages)`;
                    } else if (currentStageIdx === 3) {
                        text += ` · QFT gate ${activeCircuitGate}/36 · constructive interference building resonance peaks at multiples of Q/r = ${256 / shorR}`;
                    } else {
                        if (shorPost && shorPost.factors) {
                            text += ` · Measured peak m = ${shorM} → ${shorM}/256 = ${shorM / QMod.gcd(shorM, 256)}/${256 / QMod.gcd(shorM, 256)} → r = ${shorR} → gcd(${shorA}^${shorR/2} ± 1, 15) = ${shorPost.factors[0]}, ${shorPost.factors[1]}`;
                        } else {
                            text += ` · Measured peak m = 0 (trivial phase 0/256) · click 'Re-sample' or press 'R' to measure non-zero peak`;
                        }
                    }
                }
                if (hoverIdx >= 0 && hoverIdx < 256) {
                    const off = hoverIdx * 8;
                    text += ` · index j = ${hoverIdx}: |ψ| = ${instBufData[off + 1].toFixed(4)}, phase = ${(instBufData[off + 2] / Math.PI).toFixed(2)}π, P = ${instBufData[off + 3].toFixed(4)}`;
                }
                if (root.KW && root.KW.tag) root.KW.tag(text, canvas);
            };

            /* ---------- On-Canvas Buttons & Event Wiring ---------- */
            const buttons = [];
            const mousePos = { x: -1000, y: -1000 };

            const onPointerMove = (e) => {
                const rect = canvas.getBoundingClientRect();
                mousePos.x = e.clientX - rect.left;
                mousePos.y = e.clientY - rect.top;
            };
            const onPointerLeave = () => {
                mousePos.x = -1000;
                mousePos.y = -1000;
            };

            canvas.addEventListener("pointermove", onPointerMove);
            canvas.addEventListener("pointerleave", onPointerLeave);

            let lastClickTime = 0;
            if (root.KW && root.KW.onClick) {
                root.KW.onClick(canvas, (evt) => {
                    const now = performance.now();
                    if (now - lastClickTime < 220) return;
                    lastClickTime = now;

                    const rect = canvas.getBoundingClientRect();
                    const mx = evt.clientX - rect.left;
                    const my = evt.clientY - rect.top;

                    // Check button hit targets
                    for (const btn of buttons) {
                        if (btn.bounds && mx >= btn.bounds.x && mx <= btn.bounds.x + btn.bounds.w &&
                            my >= btn.bounds.y && my <= btn.bounds.y + btn.bounds.h) {
                            btn.action();
                            return;
                        }
                    }

                    // Clicked outside buttons: cycle mode or advance stage
                    if (mode === "grover") {
                        resetShor(13, shorA);
                    } else {
                        stepShorStage(1);
                    }
                    lastTagMs = 0;
                });
            }

            const onKeyDown = (e) => {
                if (e.target && (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA")) return;
                if (e.key >= "1" && e.key <= "5") {
                    jumpToShorStage(parseInt(e.key, 10) - 1);
                } else if (e.key === " " || e.key === "p" || e.key === "P") {
                    isPaused = !isPaused;
                    lastTagMs = 0;
                } else if (e.key === "a" || e.key === "A") {
                    if (mode === "shor") cycleBaseA();
                } else if (e.key === "m" || e.key === "M") {
                    if (mode === "grover") resetShor(13, shorA);
                    else resetGrover();
                } else if (e.key === "r" || e.key === "R") {
                    if (mode === "shor") sampleShorMeasurement();
                    else resetGrover();
                } else if (e.key === "ArrowRight") {
                    stepShorStage(1);
                } else if (e.key === "ArrowLeft") {
                    stepShorStage(-1);
                }
            };
            if (typeof window !== "undefined") window.addEventListener("keydown", onKeyDown);

            canvas.__qsimSetStage = setExactStage;
            canvas.__qsimGetState = () => ({ mode, cycleTime, groverIter, groverP, targetW, shorA, shorY, shorM, shorR, stage: currentStageIdx });

            let sceneTarget = null;
            const matProj = new Float32Array(16), matView = new Float32Array(16), matVP = new Float32Array(16);

            return {
                resize: (rw, rh) => {
                    if (!sceneTarget) sceneTarget = gfx.target(rw, rh, { depth: true });
                    else sceneTarget.resize(rw, rh);
                },
                frame: (t, dt, ctx2d, outW, outH) => {
                    const sz = getSize();
                    if (!sceneTarget) sceneTarget = gfx.target(sz.w, sz.h, { depth: true });
                    flash = Math.max(0.0, flash - dt * 1.4);

                    if (!lockedStage && !isPaused) {
                        cycleTime += dt;
                        if (mode === "grover" && cycleTime >= 28.0) resetShor(13, shorA);
                        else if (mode === "shor" && cycleTime >= 37.5) {
                            // Hold on factors stage, then smoothly cycle
                            resetGrover();
                        }
                        evaluateAt(cycleTime);
                    }

                    hoverIdx = -1;
                    if (root.KW && root.KW.local) {
                        const p = root.KW.local(canvas);
                        if (p.x >= 0 && p.x <= sz.cssW && p.y >= 0 && p.y <= sz.cssH) {
                            const dx = p.x - sz.cssW * (sz.isMobile ? 0.5 : 0.66), dy = (p.y - sz.cssH * 0.52) * 1.75;
                            const dist = Math.hypot(dx, dy), ringPx = Math.min(sz.cssW, sz.cssH) * 0.32;
                            if (dist > ringPx * 0.45 && dist < ringPx * 1.45) {
                                hoverIdx = Math.floor((((Math.atan2(dy, dx) + TAU) % TAU) / TAU) * 256.0) & 255;
                            }
                        }
                    }

                    updateInstanceBuffer();
                    updateCaption(performance.now());

                    const sx = sz.isMobile ? 0.0 : -0.42;
                    mat4Perspective(matProj, sz.isMobile ? 0.92 : 0.70, sz.w / Math.max(1, sz.h), 0.1, 45.0, sx);
                    const orbitAng = t * 0.11;
                    const px = hoverIdx >= 0 ? Math.cos((hoverIdx / 256) * TAU) * 0.18 : 0.0;
                    const py = hoverIdx >= 0 ? Math.sin((hoverIdx / 256) * TAU) * 0.12 : 0.0;
                    const eye = [Math.sin(orbitAng) * 0.55 + px, sz.isMobile ? 3.25 : (2.55 + py * 0.5), (sz.isMobile ? 9.1 : 6.3) * Math.cos(orbitAng * 0.35)];
                    mat4LookAt(matView, eye, [0.0, sz.isMobile ? 0.15 : 0.28, 0.0], [0, 1, 0]);
                    mat4Mul(matVP, matProj, matView);

                    const aCol = (root.KW && root.KW.col && root.KW.col.a) || [172, 132, 255];
                    const acc = [aCol[0] / 255, aCol[1] / 255, aCol[2] / 255];
                    const focalDist = Math.hypot(eye[0], eye[1] - 0.35, eye[2]);

                    sceneTarget.clear(0.0, 0.0, 0.0, 1.0);
                    gl.bindFramebuffer(gl.FRAMEBUFFER, sceneTarget.fbo);
                    gl.viewport(0, 0, sceneTarget.w, sceneTarget.h);
                    gl.enable(gl.DEPTH_TEST);

                    // Floor reflection
                    gl.enable(gl.BLEND);
                    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
                    progSpikes.use().mat4("uViewProj", matVP).mat4("uView", matView)
                        .f1("uHeightScale", H_SCALE).f1("uMirror", -1.0).f1("uFocalDist", focalDist)
                        .f3("uAccent", acc[0], acc[1], acc[2]).f3("uCamPos", eye[0], eye[1], eye[2]).f1("uFlash", flash);
                    gl.bindVertexArray(vaoSpikes);
                    gl.drawArraysInstanced(gl.TRIANGLES, 0, spikeVertCount, MAX_INST);

                    // Discs: Floor + Mean + Phase Wheel + Grover Inset
                    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
                    gl.bindVertexArray(vaoDisc);
                    progDisc.use().mat4("uViewProj", matVP).f3("uCenter", 0, 0, 0)
                        .f3("uAxisU", 1, 0, 0).f3("uAxisV", 0, 0, 1).f1("uRadius", 3.4)
                        .i1("uDiscMode", 0).f3("uAccent", acc[0], acc[1], acc[2]);
                    gl.drawArrays(gl.TRIANGLES, 0, 6);
                    progDisc.use().f3("uCenter", 0, Math.max(0.01, meanMag * H_SCALE), 0)
                        .f1("uRadius", R_RING).i1("uDiscMode", 1).f1("uMeanPhase", meanPhase).f1("uAlpha", 0.72);
                    gl.drawArrays(gl.TRIANGLES, 0, 6);
                    progDisc.use().f3("uCenter", 2.15, 0.62, 0.65)
                        .f3("uAxisU", 1, 0, 0).f3("uAxisV", 0, 0.85, 0.52).f1("uRadius", 0.30).i1("uDiscMode", 2);
                    gl.drawArrays(gl.TRIANGLES, 0, 6);
                    if (mode === "grover") {
                        progDisc.use().f3("uCenter", 1.82, 1.32, -0.35)
                            .f3("uAxisU", 1, 0, 0).f3("uAxisV", 0, 1, 0).f1("uRadius", 0.40)
                            .i1("uDiscMode", 3).f1("uGroverAngle", groverAngle).f1("uAlpha", 0.92);
                        gl.drawArrays(gl.TRIANGLES, 0, 6);
                    }

                    // Direct Spikes
                    gl.disable(gl.BLEND);
                    progSpikes.use().f1("uMirror", 1.0);
                    gl.bindVertexArray(vaoSpikes);
                    gl.drawArraysInstanced(gl.TRIANGLES, 0, spikeVertCount, MAX_INST);

                    // Dynamic Lines & Points Buffer: Arcs, Beacons, Wires & Dust
                    gl.enable(gl.BLEND);
                    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
                    let ptr = 0;
                    const pushV = (x, y, z, r, g, b, a) => {
                        if (ptr + 7 > lpBufData.length) return;
                        lpBufData[ptr] = x; lpBufData[ptr + 1] = y; lpBufData[ptr + 2] = z;
                        lpBufData[ptr + 3] = r; lpBufData[ptr + 4] = g; lpBufData[ptr + 5] = b;
                        lpBufData[ptr + 6] = a;
                        ptr += 7;
                    };

                    // 1. Quantum circuit strip wires
                    const cx0 = -1.45, cx1 = 1.45, cy0 = -0.16, cz = 2.42;
                    for (let w = 0; w < 8; w++) {
                        pushV(cx0, cy0 - w * 0.042, cz, acc[0], acc[1], acc[2], 0.38);
                        pushV(cx1, cy0 - w * 0.042, cz, acc[0], acc[1], acc[2], 0.38);
                    }
                    const curX = cx0 + ((activeCircuitGate + 0.5) / totalCircuitGates) * (cx1 - cx0);
                    pushV(curX, cy0 + 0.035, cz, 1.0, 0.85, 0.35, 0.95);
                    pushV(curX, cy0 - 7 * 0.042 - 0.035, cz, 1.0, 0.85, 0.35, 0.95);

                    // 2. Shor Entanglement Arcs (Stage 2: ModExp & Stage 3: Comb Collapse)
                    if (mode === "shor" && cycleTime >= 3.8 && cycleTime <= 11.5) {
                        const isCollapse = (cycleTime >= 6.2);
                        const arcAlpha = isCollapse
                            ? Math.min(1.0, Math.max(0.0, 1.0 - (cycleTime - 8.8) / 2.2)) * 0.88
                            : Math.min(1.0, (cycleTime - 3.8) / 0.8) * 0.32;

                        const stepArc = isCollapse ? 1 : 2; // In collapse, draw all 64 matching arcs; in modexp draw 128
                        for (let x = 0; x < 256; x += stepArc) {
                            const yx = QMod.modPow(shorA, x, 15);
                            if (isCollapse && yx !== shorY) continue; // Only preimages of collapsed residue remain

                            const aOut = (x / 256.0) * TAU, aIn = (yx / 16.0) * TAU;
                            const x0 = R_RING * Math.cos(aOut), z0 = R_RING * Math.sin(aOut);
                            const x3 = R_INNER * Math.cos(aIn), z3 = R_INNER * Math.sin(aIn);
                            const hPeak = isCollapse ? (0.58 + 0.08 * Math.sin(t * 3.5 + x)) : 0.42;

                            const x1 = x0 * 0.67 + x3 * 0.33, z1 = z0 * 0.67 + z3 * 0.33, y1 = hPeak * 0.85;
                            const x2 = x0 * 0.33 + x3 * 0.67, z2 = z0 * 0.33 + z3 * 0.67, y2 = hPeak * 0.85;

                            const ar = isCollapse ? 1.0 : 0.68;
                            const ag = isCollapse ? 0.88 : 0.52;
                            const ab = isCollapse ? 0.38 : 1.0;

                            pushV(x0, 0.02, z0, ar, ag, ab, arcAlpha);
                            pushV(x1, y1, z1, ar, ag, ab, arcAlpha);
                            pushV(x1, y1, z1, ar, ag, ab, arcAlpha);
                            pushV(x2, y2, z2, ar, ag, ab, arcAlpha);
                            pushV(x2, y2, z2, ar, ag, ab, arcAlpha);
                            pushV(x3, 0.02, z3, ar, ag, ab, arcAlpha);
                        }
                    }

                    // 3. Resonant QFT Frequency Beacons (Stage 4: QFT Peaks & Stage 5: Factors)
                    if (mode === "shor" && cycleTime >= 26.0) {
                        const peakFade = Math.min(1.0, (cycleTime - 26.0) / 3.0);
                        const rVal = shorR || 4;
                        const numPeaks = rVal;
                        const stepM = 256 / numPeaks;

                        for (let s = 0; s < numPeaks; s++) {
                            const mVal = Math.round(s * stepM);
                            const pAng = (mVal / 256.0) * TAU;
                            const bx = R_RING * Math.cos(pAng), bz = R_RING * Math.sin(pAng);
                            const isChosen = (mVal === shorM && cycleTime >= 31.0);

                            const br = isChosen ? 1.0 : acc[0];
                            const bg = isChosen ? 0.94 : acc[1];
                            const bb = isChosen ? 0.78 : acc[2];
                            const ba = (isChosen ? (0.95 + 0.15 * Math.sin(t * 8.0)) : 0.55) * peakFade;
                            const bH = isChosen ? 2.4 : 1.85;

                            // Vertical beacon pillar
                            pushV(bx, 0.02, bz, br, bg, bb, ba);
                            pushV(bx, bH, bz, br, bg, bb, ba);

                            // Top cross
                            const crSize = isChosen ? 0.08 : 0.045;
                            pushV(bx - crSize, bH, bz, br, bg, bb, ba);
                            pushV(bx + crSize, bH, bz, br, bg, bb, ba);
                            pushV(bx, bH, bz - crSize, br, bg, bb, ba);
                            pushV(bx, bH, bz + crSize, br, bg, bb, ba);

                            // Circular ring on floor around beacon base
                            const ringR = isChosen ? 0.12 : 0.07;
                            for (let c = 0; c < 8; c++) {
                                const ca0 = (c / 8.0) * TAU, ca1 = ((c + 1) / 8.0) * TAU;
                                pushV(bx + ringR * Math.cos(ca0), 0.02, bz + ringR * Math.sin(ca0), br, bg, bb, ba * 0.75);
                                pushV(bx + ringR * Math.cos(ca1), 0.02, bz + ringR * Math.sin(ca1), br, bg, bb, ba * 0.75);
                            }
                        }
                    }

                    const lineCount = ptr / 7;

                    // 4. Hot Circuit Gate Indicator Points & Beacon Halos
                    for (let g = 0; g < totalCircuitGates; g++) {
                        const gx = cx0 + ((g + 0.5) / totalCircuitGates) * (cx1 - cx0);
                        const wIdx = mode === "shor" && qftGates[g] ? (qftGates[g].q ?? qftGates[g].t ?? qftGates[g].a ?? 0) : (g % 8);
                        const hot = g === activeCircuitGate;
                        pushV(gx, cy0 - (7 - wIdx) * 0.042, cz, hot ? 1.0 : acc[0], hot ? 0.88 : acc[1], hot ? 0.38 : acc[2], hot ? 9.5 : 4.2);
                    }

                    // 5. Ambient Quantum Vacuum Dust Particles
                    const dustCount = sz.isMobile ? 56 : 110;
                    for (let i = 0; i < dustCount; i++) {
                        const d = dustSeeds[i];
                        pushV(d.x + Math.sin(t * 0.25 + d.ph) * 0.2, d.y + Math.cos(t * 0.2 + d.ph) * 0.15, d.z, acc[0], acc[1], acc[2], d.sz);
                    }

                    gl.bindBuffer(gl.ARRAY_BUFFER, vboLP);
                    gl.bufferSubData(gl.ARRAY_BUFFER, 0, lpBufData.subarray(0, ptr));
                    gl.bindVertexArray(vaoLP);
                    progLP.use().mat4("uViewProj", matVP).mat4("uView", matView).f1("uFocalDist", focalDist).f1("uIsPoints", 0.0);
                    gl.drawArrays(gl.LINES, 0, lineCount);
                    progLP.use().f1("uIsPoints", 1.0);
                    gl.drawArrays(gl.POINTS, lineCount, (ptr / 7) - lineCount);
                    gl.bindVertexArray(null);
                    gl.disable(gl.BLEND);
                    gl.disable(gl.DEPTH_TEST);

                    // Post-processing HDR Compose
                    gfx.compose(sceneTarget, ctx2d, outW, outH, {
                        bloomGain: sz.isMobile ? 0.36 : 0.48,
                        threshold: 0.42,
                        exposure: 1.18 + flash * 0.35,
                        time: t,
                        accent: aCol
                    });

                    // Interactive 2D Glass HUD & Controls Over Canvas
                    if (ctx2d) {
                        ctx2d.save();
                        buttons.length = 0;
                        const cssW = sz.cssW, cssH = sz.cssH;
                        const btnH = 24, btnPad = 9;
                        ctx2d.font = "11px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
                        ctx2d.textBaseline = "middle";

                        const drawPill = (id, text, x, y, active = false, action = null) => {
                            const tw = ctx2d.measureText(text).width;
                            const bw = tw + btnPad * 2;
                            const isHover = mousePos.x >= x && mousePos.x <= x + bw && mousePos.y >= y && mousePos.y <= y + btnH;

                            if (action) buttons.push({ id, label: text, bounds: { x, y, w: bw, h: btnH }, action });

                            ctx2d.beginPath();
                            if (ctx2d.roundRect) ctx2d.roundRect(x, y, bw, btnH, 6);
                            else ctx2d.rect(x, y, bw, btnH);

                            ctx2d.fillStyle = active
                                ? `rgba(${aCol[0]}, ${aCol[1]}, ${aCol[2]}, ${isHover ? 0.45 : 0.30})`
                                : `rgba(16, 20, 30, ${isHover ? 0.90 : 0.78})`;
                            ctx2d.fill();

                            ctx2d.lineWidth = active ? 1.5 : 1;
                            ctx2d.strokeStyle = active
                                ? `rgba(${aCol[0]}, ${aCol[1]}, ${aCol[2]}, 0.85)`
                                : (isHover ? "rgba(255, 255, 255, 0.35)" : "rgba(255, 255, 255, 0.14)");
                            ctx2d.stroke();

                            ctx2d.fillStyle = active ? "#ffffff" : (isHover ? "#ffffff" : "rgba(225, 232, 248, 0.85)");
                            ctx2d.fillText(text, x + btnPad, y + btnH * 0.5);
                            return bw;
                        };

                        if (mode === "shor") {
                            // Top controls
                            let topX = sz.isMobile ? 12 : (cssW * 0.44);
                            const topY = 14;
                            topX += drawPill("mode", `Mode: Shor (N=15, a=${shorA})`, topX, topY, true, () => resetGrover()) + 8;
                            topX += drawPill("baseA", `Base a: ${shorA} ▾`, topX, topY, false, () => cycleBaseA()) + 8;
                            topX += drawPill("pause", isPaused ? "▶ Play" : "⏸ Pause", topX, topY, isPaused, () => { isPaused = !isPaused; lastTagMs = 0; }) + 8;
                            if (currentStageIdx === 4) {
                                topX += drawPill("resample", "Re-sample ⟳", topX, topY, false, () => sampleShorMeasurement()) + 8;
                            }

                            // Bottom Stage Stepper Bar
                            let btmX = cssW - 14;
                            const btmY = cssH - 34;
                            for (let s = SHOR_STAGES.length - 1; s >= 0; s--) {
                                const stg = SHOR_STAGES[s];
                                const label = sz.isMobile ? `${stg.num}` : `${stg.num}: ${stg.name}`;
                                const tw = ctx2d.measureText(label).width;
                                const bw = tw + btnPad * 2;
                                btmX -= bw;
                                drawPill(`stage-${s}`, label, btmX, btmY, currentStageIdx === s, () => jumpToShorStage(s));
                                btmX -= 6;
                            }

                            // Factors summary card when in Stage 5
                            if (currentStageIdx === 4 && shorPost && shorPost.factors) {
                                const cardW = sz.isMobile ? 260 : 310;
                                const cardH = 92;
                                const cardX = cssW - cardW - 14;
                                const cardY = 14;

                                ctx2d.beginPath();
                                if (ctx2d.roundRect) ctx2d.roundRect(cardX, cardY, cardW, cardH, 10);
                                else ctx2d.rect(cardX, cardY, cardW, cardH);
                                ctx2d.fillStyle = "rgba(12, 16, 26, 0.88)";
                                ctx2d.fill();
                                ctx2d.lineWidth = 1;
                                ctx2d.strokeStyle = `rgba(${aCol[0]}, ${aCol[1]}, ${aCol[2]}, 0.50)`;
                                ctx2d.stroke();

                                ctx2d.font = "bold 11px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
                                ctx2d.fillStyle = `rgb(${aCol[0]}, ${aCol[1]}, ${aCol[2]})`;
                                ctx2d.fillText("SHOR FACTORING · PERIOD FOUND", cardX + 14, cardY + 18);

                                ctx2d.font = "11px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
                                ctx2d.fillStyle = "rgba(235, 240, 255, 0.90)";
                                ctx2d.fillText(`Measured frequency: m = ${shorM} (P = 25%)`, cardX + 14, cardY + 36);
                                ctx2d.fillText(`Fraction: ${shorM}/256 → Period r = ${shorR}`, cardX + 14, cardY + 54);

                                const f1 = shorPost.factors[0], f2 = shorPost.factors[1];
                                ctx2d.font = "bold 12px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
                                ctx2d.fillStyle = "#20c991";
                                ctx2d.fillText(`Prime Factors: 15 = ${f1} × ${f2}`, cardX + 14, cardY + 74);
                            }
                        } else {
                            // Grover controls
                            let topX = sz.isMobile ? 12 : (cssW * 0.44);
                            const topY = 14;
                            topX += drawPill("mode", "Mode: Grover (N=256)", topX, topY, true, () => resetShor(13, shorA)) + 8;
                            topX += drawPill("shor", "Switch to Shor →", topX, topY, false, () => resetShor(13, shorA)) + 8;
                            topX += drawPill("target", `Target w: ${targetW} ⟳`, topX, topY, false, () => resetGrover()) + 8;
                        }

                        ctx2d.restore();
                    }
                },
                dispose: () => {
                    if (sceneTarget) sceneTarget.dispose();
                    gl.deleteBuffer(vboMesh);
                    gl.deleteBuffer(vboInst);
                    gl.deleteVertexArray(vaoSpikes);
                    gl.deleteBuffer(vboDisc);
                    gl.deleteVertexArray(vaoDisc);
                    gl.deleteBuffer(vboLP);
                    gl.deleteVertexArray(vaoLP);
                    canvas.removeEventListener("pointermove", onPointerMove);
                    canvas.removeEventListener("pointerleave", onPointerLeave);
                    if (typeof window !== "undefined") window.removeEventListener("keydown", onKeyDown);
                }
            };
        }, fallback2D);
    };
}));
