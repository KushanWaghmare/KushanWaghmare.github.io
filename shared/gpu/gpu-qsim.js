/**
 * gpu-qsim.js
 *
 * WebGL2 Scene for the Computer Science hero: "Quantum search and period finding."
 * Evolves an 8-qubit (Grover) and 12-qubit (Shor N=15, a=7) state vector in
 * double precision on the CPU along exact continuous fractional-gate unitaries,
 * uploading Float32 instance attributes each frame to the shared GFX WebGL2 context.
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
    const smoothstep = (x) => {
        const t = Math.max(0.0, Math.min(1.0, x));
        return t * t * (3.0 - 2.0 * t);
    };
    const bitRev8 = (v) => {
        let r = 0;
        for (let b = 0; b < 8; b++) if ((v >> b) & 1) r |= (1 << (7 - b));
        return r;
    };

    const mat4Perspective = (out, fovy, aspect, near, far) => {
        const f = 1.0 / Math.tan(fovy * 0.5), nf = 1.0 / (near - far);
        out.fill(0);
        out[0] = f / aspect;
        out[5] = f;
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

            const lpBufData = new Float32Array(512 * 7);
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

            /* ---------- Unified Fractional-Gate Schedule Runner ---------- */
            let mode = "grover", cycleTime = 0.0, doneIdx = -1, steps = [], flash = 0.0;
            let targetW = 77, measuredW = 77, groverIter = 0, groverP = 1 / 256, groverAngle = Math.asin(1 / 16);
            let shorY = 13, shorM = 192, shorSwapSlide = 0.0, activeCircuitGate = 0, totalCircuitGates = 20;
            let hoverIdx = -1, lastTagMs = 0, lockedStage = false;

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
                list.push({ t0: 4.0, t1: 4.0, gateIdx: 0, run: (st) => QMod.applyModExpOracle(st, 8, 4, 7, 15, tmpModRe, tmpModIm) });
                list.push({ t0: 6.2, t1: 6.2, gateIdx: 0, run: (st) => { QMod.measureWorkRegister(st, 8, 4, shorY); flash = 0.75; } });
                for (let g = 0; g < 36; g++) {
                    const t0 = 9.0 + g * 0.6;
                    list.push({ t0, t1: t0 + 0.6, gateIdx: g, run: (st, s) => QMod.applyGate(st, qftGates[g], s) });
                }
                list.push({
                    t0: 30.6, t1: 30.6, gateIdx: 36,
                    run: (st) => { for (let g = 36; g < 40; g++) QMod.applyGate(st, qftGates[g], 1.0); }
                });
                return list;
            };

            const resetGrover = (newW) => {
                mode = "grover"; cycleTime = 0.0; doneIdx = -1; flash = 0.0; totalCircuitGates = 20;
                targetW = typeof newW === "number" ? (newW & 255) : Math.floor(prng() * 256);
                measuredW = targetW; groverIter = 0;
                QMod.resetBasis(st8Base, 0); QMod.resetBasis(st8Live, 0);
                workProbs.fill(0.0);
                steps = buildGroverSchedule();
            };

            const resetShor = (forcedY) => {
                mode = "shor"; cycleTime = 0.0; doneIdx = -1; flash = 0.0; shorSwapSlide = 0.0; totalCircuitGates = 40;
                shorY = typeof forcedY === "number" ? forcedY : [1, 7, 4, 13][Math.floor(prng() * 4)];
                shorM = 192;
                QMod.resetBasis(st12Base, 0); QMod.resetBasis(st12Live, 0);
                workProbs.fill(0.0); workProbs[0] = 1.0;
                steps = buildShorSchedule();
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
                }
            };

            const setExactStage = (cfg = {}) => {
                lockedStage = !!cfg.lock;
                if (cfg.mode === "shor") {
                    resetShor(cfg.y ?? 13);
                    const map = { comb: 7.8, "mid-qft": 12.3, peaks: 36.0 };
                    cycleTime = map[cfg.stage] ?? cfg.time ?? 7.8;
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
                for (let j = 0; j < 256; j++) {
                    let r = 0.0, im = 0.0;
                    if (!isShor) { r = st8Live.re[j]; im = st8Live.im[j]; }
                    else if (cycleTime < 4.0) { r = st12Live.re[j]; im = st12Live.im[j]; }
                    else if (cycleTime < 6.2) {
                        const yb = QMod.modPow(7, j, 15) << 8;
                        r = st12Live.re[yb | j]; im = st12Live.im[yb | j];
                    } else { r = st12Live.re[ySlice | j]; im = st12Live.im[ySlice | j]; }

                    sumR += r; sumI += im;
                    const prob = r * r + im * im, mag = Math.sqrt(prob);
                    let ph = Math.atan2(im, r);
                    if (ph < 0) ph += TAU;
                    const rev = bitRev8(j);
                    const renderIdx = (isShor && cycleTime >= 30.6) ? (rev + (j - rev) * shorSwapSlide) : j;
                    const isMarked = (!isShor && j === targetW) || (j === hoverIdx);
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
                    instBufData.set([
                        ang, py * 0.16, ang, py * 0.22,
                        R_INNER, 0.036, (isShor && y === shorY && cycleTime >= 6.2) ? 0.45 : 0.0, 1.0
                    ], (256 + y) * 8);
                }
                gl.bindBuffer(gl.ARRAY_BUFFER, vboInst);
                gl.bufferSubData(gl.ARRAY_BUFFER, 0, instBufData);
            };

            const updateCaption = (nowMs) => {
                if (nowMs - lastTagMs < 250 && lastTagMs !== 0) return;
                lastTagMs = nowMs;
                let text = mode === "grover"
                    ? `Grover search · 8 simulated qubits (exact classical simulation, not a quantum device) · N = 256 · k = ${groverIter} · P(marked) = ${groverP.toFixed(4)} · optimal k = 12 · 12 oracle queries vs ≈ 128 classically${cycleTime >= 24.6 ? ` · found w = ${measuredW}` : ""}`
                    : `Shor's algorithm · 12 simulated qubits (exact classical simulation, not a quantum device) · N = 15, a = 7 · y = ${shorY} · measured m = ${shorM} → ${shorM}/256 = ${shorM / QMod.gcd(shorM, 256)}/${256 / QMod.gcd(shorM, 256)} → r = 4 → gcd(7² ± 1, 15) = 3, 5`;
                if (hoverIdx >= 0 && hoverIdx < 256) {
                    const off = hoverIdx * 8;
                    text += ` · index j = ${hoverIdx}: |ψ| = ${instBufData[off + 1].toFixed(4)}, phase = ${(instBufData[off + 2] / Math.PI).toFixed(2)}π, P = ${instBufData[off + 3].toFixed(4)}`;
                }
                if (root.KW && root.KW.tag) root.KW.tag(text, canvas);
            };

            if (root.KW && root.KW.onClick) {
                root.KW.onClick(canvas, () => {
                    lockedStage = false;
                    if (mode === "grover") resetShor(13);
                    else resetGrover();
                    lastTagMs = 0;
                });
            }
            canvas.__qsimSetStage = setExactStage;
            canvas.__qsimGetState = () => ({ mode, cycleTime, groverIter, groverP, targetW, shorY, shorM });

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

                    if (!lockedStage) {
                        cycleTime += dt;
                        if (mode === "grover" && cycleTime >= 28.0) resetShor(13);
                        else if (mode === "shor" && cycleTime >= 37.0) resetGrover();
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

                    mat4Perspective(matProj, sz.isMobile ? 0.92 : 0.72, sz.w / Math.max(1, sz.h), 0.1, 45.0);
                    const orbitAng = t * 0.11;
                    const px = hoverIdx >= 0 ? Math.cos((hoverIdx / 256) * TAU) * 0.18 : 0.0;
                    const py = hoverIdx >= 0 ? Math.sin((hoverIdx / 256) * TAU) * 0.12 : 0.0;
                    const eye = [Math.sin(orbitAng) * 0.55 + px, sz.isMobile ? 3.25 : (2.55 + py * 0.5), (sz.isMobile ? 9.1 : 6.1) * Math.cos(orbitAng * 0.35)];
                    mat4LookAt(matView, eye, [sz.isMobile ? 0.0 : -0.82, sz.isMobile ? 0.15 : 0.32, 0.0], [0, 1, 0]);
                    mat4Mul(matVP, matProj, matView);

                    const aCol = (root.KW && root.KW.col && root.KW.col.a) || [172, 132, 255];
                    const acc = [aCol[0] / 255, aCol[1] / 255, aCol[2] / 255];
                    const focalDist = Math.hypot(eye[0], eye[1] - 0.35, eye[2]);

                    sceneTarget.clear(0.0, 0.0, 0.0, 1.0);
                    gl.bindFramebuffer(gl.FRAMEBUFFER, sceneTarget.fbo);
                    gl.viewport(0, 0, sceneTarget.w, sceneTarget.h);
                    gl.enable(gl.DEPTH_TEST);

                    gl.enable(gl.BLEND);
                    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
                    progSpikes.use().mat4("uViewProj", matVP).mat4("uView", matView)
                        .f1("uHeightScale", H_SCALE).f1("uMirror", -1.0).f1("uFocalDist", focalDist)
                        .f3("uAccent", acc[0], acc[1], acc[2]).f3("uCamPos", eye[0], eye[1], eye[2]).f1("uFlash", flash);
                    gl.bindVertexArray(vaoSpikes);
                    gl.drawArraysInstanced(gl.TRIANGLES, 0, spikeVertCount, MAX_INST);

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

                    gl.disable(gl.BLEND);
                    progSpikes.use().f1("uMirror", 1.0);
                    gl.bindVertexArray(vaoSpikes);
                    gl.drawArraysInstanced(gl.TRIANGLES, 0, spikeVertCount, MAX_INST);

                    gl.enable(gl.BLEND);
                    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
                    let ptr = 0;
                    const pushV = (x, y, z, r, g, b, a) => {
                        lpBufData.set([x, y, z, r, g, b, a], ptr);
                        ptr += 7;
                    };
                    const cx0 = -1.45, cx1 = 1.45, cy0 = -0.16, cz = 2.42;
                    for (let w = 0; w < 8; w++) {
                        pushV(cx0, cy0 - w * 0.042, cz, acc[0], acc[1], acc[2], 0.38);
                        pushV(cx1, cy0 - w * 0.042, cz, acc[0], acc[1], acc[2], 0.38);
                    }
                    const curX = cx0 + ((activeCircuitGate + 0.5) / totalCircuitGates) * (cx1 - cx0);
                    pushV(curX, cy0 + 0.035, cz, 1.0, 0.85, 0.35, 0.95);
                    pushV(curX, cy0 - 7 * 0.042 - 0.035, cz, 1.0, 0.85, 0.35, 0.95);
                    const lineCount = ptr / 7;

                    for (let g = 0; g < totalCircuitGates; g++) {
                        const gx = cx0 + ((g + 0.5) / totalCircuitGates) * (cx1 - cx0);
                        const wIdx = mode === "shor" && qftGates[g] ? (qftGates[g].q ?? qftGates[g].t ?? qftGates[g].a ?? 0) : (g % 8);
                        const hot = g === activeCircuitGate;
                        pushV(gx, cy0 - (7 - wIdx) * 0.042, cz, hot ? 1.0 : acc[0], hot ? 0.88 : acc[1], hot ? 0.38 : acc[2], hot ? 9.5 : 4.2);
                    }
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

                    gfx.compose(sceneTarget, ctx2d, outW, outH, {
                        bloomGain: sz.isMobile ? 0.36 : 0.48,
                        threshold: 0.42,
                        exposure: 1.18 + flash * 0.35,
                        time: t,
                        accent: aCol
                    });
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
                }
            };
        }, fallback2D);
    };
}));
