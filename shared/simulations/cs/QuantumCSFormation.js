(function (root) {
    "use strict";
    const TM = root.THREAD_MATH || (typeof require === "function" ? require("../core/thread-math.js") : null);
    const TF = root.THREAD_FORMATIONS || (typeof require === "function" ? require("../core/gpu-thread-formations.js") : null);
    const { Vector3, Formation, sectionOrigin, clamp, smoothstep } = TM;
    const { LOOK, registerFormation } = TF;

/* ============================================================================
       5. COMPUTER SCIENCE FORMATION — Grover Search (8 Qubits, N=256) & Shor Period Finding (N=15)
       Wraps shared/lib/qsim-math.js (initUniform, groverStep, applyModExp15, qft8FromJoint,
       phaseToRGB). Particles form the 256 counting-register amplitude columns, the 16
       work-register spikes, and the 3D modular-exponentiation entanglement arcs.
       ============================================================================ */
    class QuantumCSFormation extends Formation {
        constructor(origin, simKey = "hub:domain-cs", params = {}, sectionIndex = 5) {
            super(origin, simKey);
            this.params = params || {};
            this.sectionIndex = sectionIndex;
            this.N_COUNT = 256;
            this.N_WORK = 16;
            this.st8 = null;
            this.ampHeight = new Float32Array(256);
            this.ampCols = new Float32Array(256 * 3);
            this.workHeight = new Float32Array(16);
            this.coprimes = [7, 2, 4, 11, 13];
            this.coprimeIdx = 0;
            this.markedTarget = 173;
            this.mode = "shor";
            this.cameraDistance = 13.5;
            this.presetMode = null;
        }

        applyPreset(preset) {
            this.localePreset = preset;
            if (preset && typeof preset.mode === "string") {
                this.presetMode = preset.mode;
            }
        }

        _phaseToRGB(re, im, out, j3) {
            const angle = Math.atan2(im, re); // [-π, π]
            const h = (angle / (2.0 * Math.PI) + 1.0) % 1.0;
            const p = h * 6.0;
            const c = 0.88, x = c * (1.0 - Math.abs((p % 2.0) - 1.0)), m = 0.12;
            let r = 0, g = 0, b = 0;
            if (p < 1) { r = c; g = x; }
            else if (p < 2) { r = x; g = c; }
            else if (p < 3) { g = c; b = x; }
            else if (p < 4) { g = x; b = c; }
            else if (p < 5) { r = x; b = c; }
            else { r = c; b = x; }
            out[j3] = r + m;
            out[j3 + 1] = g + m;
            out[j3 + 2] = b + m;
        }

        _updateQuantumState(t) {
            const QM = root.QSimMath || (typeof require === "function" ? require("../quantum/qsim-math.js") : null);
            if (!QM) return;
            if (!this.st8) this.st8 = QM.createState(8);

            const cycle = t % 16.0;
            const a = this.coprimes[this.coprimeIdx];

            const isGrover = this.presetMode ? (this.presetMode === "grover") : (cycle < 8.0);

            if (isGrover) {
                this.mode = "grover";
                const kIter = Math.min(6, Math.floor((cycle / 8.0) * 7));
                QM.resetBasis(this.st8, 0);
                for (let q = 0; q < 8; q++) QM.applyH(this.st8, q, 1.0);
                for (let k = 0; k < kIter; k++) {
                    QM.applyGroverOracle(this.st8, this.markedTarget, 1.0);
                    QM.applyGroverDiffusion(this.st8, 1.0);
                }
                const subS = ((cycle / 8.0) * 7) - kIter;
                if (subS > 0.05 && kIter < 6) {
                    QM.applyGroverOracle(this.st8, this.markedTarget, Math.min(1.0, subS * 2.0));
                }
                for (let w = 0; w < 16; w++) {
                    this.workHeight[w] = (w === (this.markedTarget & 15)) ? 0.95 : 0.14;
                }
            } else {
                this.mode = "shor";
                const shorSub = cycle - 8.0;
                const residues = QM.getShorResidues ? QM.getShorResidues(a, 15) : [1, 7, 4, 13];
                const rPeriod = residues.length || 4;
                for (let w = 0; w < 16; w++) {
                    this.workHeight[w] = residues.includes(w) ? 1.05 : 0.08;
                }

                const re = this.st8.re, im = this.st8.im;
                re.fill(0); im.fill(0);
                if (shorSub < 3.5) {
                    // Periodic comb in counting register after work-register measurement: |x0 + m*r⟩
                    const x0 = 1;
                    let cnt = 0;
                    for (let x = x0; x < 256; x += rPeriod) cnt++;
                    const norm = 1.0 / Math.sqrt(Math.max(1, cnt));
                    for (let x = x0; x < 256; x += rPeriod) {
                        const ph = (x / 256.0) * Math.PI * 2.0;
                        re[x] = norm * Math.cos(ph);
                        im[x] = norm * Math.sin(ph);
                    }
                } else {
                    // Post-QFT_256 interference peaks at k * (256 / rPeriod)
                    const qftBlend = smoothstep(3.5, 5.2, shorSub);
                    for (let j = 0; j < 256; j++) {
                        let sumR = 0, sumI = 0;
                        for (let m = 0; m < 64; m++) {
                            const x = 1 + m * rPeriod;
                            if (x >= 256) break;
                            const ang = (2.0 * Math.PI * x * j) / 256.0;
                            sumR += Math.cos(ang);
                            sumI += Math.sin(ang);
                        }
                        re[j] = (1.0 - qftBlend) * 0.0625 + qftBlend * (sumR / 128.0);
                        im[j] = qftBlend * (sumI / 128.0);
                    }
                }
            }

            const re = this.st8.re, im = this.st8.im;
            for (let j = 0; j < 256; j++) {
                const rVal = re[j], iVal = im[j];
                const mag = Math.hypot(rVal, iVal);
                this.ampHeight[j] = clamp(Math.sqrt(mag) * 2.85, 0.08, 2.65);
                this._phaseToRGB(rVal, iVal, this.ampCols, j * 3);
            }
        }

        init(buffer, _ctx) {
            const N = buffer.maxCount;
            this.slotMap = new Int32Array(N);
            for (let i = 0; i < N; i++) this.slotMap[i] = i;
            this._updateQuantumState(0.0);
            this.initialized = true;
        }

        applyPermutation(perm, count) {
            if (!this.slotMap) return;
            const N = count | 0;
            const tmp = new Int32Array(N);
            for (let i = 0; i < N; i++) tmp[i] = this.slotMap[perm[i]];
            this.slotMap.set(tmp);
        }

        onClick() {
            this.coprimeIdx = (this.coprimeIdx + 1) % this.coprimes.length;
            this.markedTarget = (this.markedTarget * 73 + 29) & 255;
        }

        _evalQSimParticle(rawIdx, N, t, cosY, sinY, cosP, sinP, offsetX, outPos, i3, outCol, outSz, seeds) {
            const i = this.slotMap ? this.slotMap[rawIdx] : rawIdx;
            const i4 = i * 4;
            const u1 = seeds ? seeds[i4] : ((i * 0.6180339) % 1);
            const u2 = seeds ? seeds[i4 + 1] : ((i * 0.381966) % 1);
            const u3 = seeds ? seeds[i4 + 2] : 0.5;
            const u4 = seeds ? seeds[i4 + 3] : 0.5;

            const nCountParticles = Math.floor(N * 0.72);
            const nWorkParticles = Math.floor(N * 0.84);
            const dw = this._dw || 0;
            const vw = this._vw || 0;

            let lx = 0, ly = 0, lz = 0;
            let rC = 0.25, gC = 0.85, bC = 0.65;
            let szBoost = 0.0;

            if (i < nCountParticles) {
                // 256 Counting-register amplitude columns on a 16x16 3D lattice
                const colIdx = i % 256;
                const gx = (colIdx & 15) - 7.5;
                const gz = ((colIdx >> 4) & 15) - 7.5;
                const isMarked = (colIdx === (this.markedTarget & 255)) ? 1.0 : 0.0;
                const ampNorm = clamp((this.ampHeight[colIdx] - 0.35) / 1.5, 0.0, 1.0);
                const markedWeight = Math.max(isMarked, ampNorm);
                const h = this.ampHeight[colIdx] * (1.0 + (0.38 + 0.65 * markedWeight) * vw);
                const jitterX = (u1 - 0.5) * 0.14;
                const jitterZ = (u2 - 0.5) * 0.14;

                lx = gx * 0.42 + jitterX;
                lz = gz * 0.42 + jitterZ + 0.6;
                ly = -1.45 + u3 * h;

                const c3 = colIdx * 3;
                const tipBoost = 0.22 + 0.42 * u3;
                rC = this.ampCols[c3] * tipBoost;
                gC = this.ampCols[c3 + 1] * tipBoost;
                bC = this.ampCols[c3 + 2] * tipBoost;
                if (vw > 0.01) {
                    const vDim = 1.0 - 0.70 * vw * (1.0 - markedWeight);
                    rC *= vDim; gC *= vDim; bC *= vDim;
                    const surge = vw * markedWeight * (0.55 + 1.15 * u3);
                    rC += 0.28 * surge;
                    gC += 0.92 * surge;
                    bC += 1.25 * surge;
                    szBoost += vw * (0.25 + 0.65 * markedWeight) * u3;
                }
                if (dw > 0.01) {
                    const dDim = 1.0 - 0.65 * dw;
                    rC *= dDim; gC *= dDim; bC *= dDim;
                }
            } else if (i < nWorkParticles) {
                // 16 Modular-exponentiation work-register columns |a^x mod 15⟩
                const wIdx = i & 15;
                const wx = (wIdx - 7.5) * 0.42 + (u1 - 0.5) * 0.16;
                const wz = -3.4 + (u2 - 0.5) * 0.16;
                const wh = this.workHeight[wIdx] * 1.65 * (1.0 + 0.48 * dw);
                lx = wx;
                lz = wz;
                ly = -1.45 + u3 * wh;
                rC = 0.12 + 0.25 * u3;
                gC = 0.48 + 0.18 * u3;
                bC = 0.40 + 0.16 * u3;
                if (vw > 0.01) {
                    const vDim = 1.0 - 0.70 * vw;
                    rC *= vDim; gC *= vDim; bC *= vDim;
                }
                if (dw > 0.01) {
                    const isPeriodSpike = this.workHeight[wIdx] > 0.5 ? 1.0 : 0.25;
                    const wSurge = dw * isPeriodSpike * (0.65 + 1.05 * u3);
                    rC += 1.25 * wSurge;
                    gC += 0.78 * wSurge;
                    bC += 0.14 * wSurge;
                    szBoost += dw * 0.75 * isPeriodSpike * u3;
                }
            } else {
                // 3D Parabolic Quantum Entanglement Arcs linking counting state |x⟩ to residue |a^x mod 15⟩
                const xState = i & 255;
                const a = this.coprimes[this.coprimeIdx];
                // Compute a^x mod 15 for the 4-cycle
                let residue = 1;
                for (let r = 0; r < (xState & 3); r++) residue = (residue * a) % 15;

                const sx = ((xState & 15) - 7.5) * 0.42;
                const sz = (((xState >> 4) & 15) - 7.5) * 0.42 + 0.6;
                const ex = (residue - 7.5) * 0.42;
                const ez = -3.4;

                const sArc = (u1 + t * (0.28 + 0.35 * dw)) % 1.0;
                lx = sx + (ex - sx) * sArc;
                lz = sz + (ez - sz) * sArc;
                ly = -1.1 + 4.0 * sArc * (1.0 - sArc) * (1.15 + 0.55 * this.ampHeight[xState] + 0.42 * dw);

                const c3 = xState * 3;
                rC = this.ampCols[c3] * 0.42 + 0.08;
                gC = this.ampCols[c3 + 1] * 0.42 + 0.08;
                bC = this.ampCols[c3 + 2] * 0.42 + 0.08;
                if (vw > 0.01) {
                    const vDim = 1.0 - 0.70 * vw;
                    rC *= vDim; gC *= vDim; bC *= vDim;
                }
                if (dw > 0.01) {
                    const arcGlow = dw * (0.75 + 0.95 * Math.sin(sArc * Math.PI));
                    rC += 1.20 * arcGlow;
                    gC += 0.74 * arcGlow;
                    bC += 0.14 * arcGlow;
                    szBoost += dw * 0.65;
                }
            }

            const rx = lx * cosY - lz * sinY;
            const rz = lx * sinY + lz * cosY;
            const ry = ly * cosP - rz * sinP;
            const rz2 = ly * sinP + rz * cosP;

            const scale = 1.25 * (1.0 + 0.85 * (this.insideness || 0));
            outPos[i3]     = this.origin.x + offsetX + rx * scale;
            outPos[i3 + 1] = this.origin.y + ry * scale;
            outPos[i3 + 2] = this.origin.z + rz2 * scale;

            if (outCol) {
                const maxCol = 0.85 + 1.25 * Math.max(dw, vw);
                outCol[i3]     = clamp(rC, 0.04, maxCol);
                outCol[i3 + 1] = clamp(gC, 0.04, maxCol);
                outCol[i3 + 2] = clamp(bC, 0.04, maxCol);
            }
            if (outSz) {
                outSz[rawIdx] = 0.85 + 1.15 * u4 + szBoost;
            }
            if (rawIdx === 0) {
                const colIdx0 = this.markedTarget & 255;
                const gx0 = (colIdx0 & 15) - 7.5;
                const gz0 = ((colIdx0 >> 4) & 15) - 7.5;
                const lx0 = gx0 * 0.42;
                const lz0 = gz0 * 0.42 + 0.6;
                const ly0 = -1.45 + this.ampHeight[colIdx0] * (1.0 + 0.38 * vw) + 0.18;
                const rx0 = lx0 * cosY - lz0 * sinY;
                const rz0 = lx0 * sinY + lz0 * cosY;
                const ry0 = ly0 * cosP - rz0 * sinP;
                const rz20 = ly0 * sinP + rz0 * cosP;
                outPos[i3]     = this.origin.x + offsetX + rx0 * scale;
                outPos[i3 + 1] = this.origin.y + ry0 * scale;
                outPos[i3 + 2] = this.origin.z + rz20 * scale;
                if (outCol) {
                    outCol[i3]     = 1.65;
                    outCol[i3 + 1] = 2.15;
                    outCol[i3 + 2] = 2.45;
                }
                if (outSz) outSz[0] = 6.0;
            }
        }

        update(dt, t, buffer, ctx) {
            if (!this.initialized) this.init(buffer, ctx);

            const eqObj = (typeof window !== "undefined") && window.__SECTION_EQ_MODE__;
            const eqMode = (eqObj && (!eqObj.sim || eqObj.sim === this.id)) ? (eqObj.mode || 0) : 0;
            const kEq = Math.min(1, (dt || 0.016) * 6);
            this._dw = (this._dw || 0) + (((eqMode === 1 ? 1 : 0) - (this._dw || 0)) * kEq);
            this._vw = (this._vw || 0) + (((eqMode === 2 ? 1 : 0) - (this._vw || 0)) * kEq);

            this._updateQuantumState(t);

            const ptrX = (ctx && ctx.pointerX) || 0;
            const ptrY = (ctx && ctx.pointerY) || 0;
            const yaw = -0.36 + 0.34 * Math.sin(t * 0.11) + ptrX * 0.55;
            const pitch = 0.42 + 0.16 * Math.sin(t * 0.083 + 1.0) + ptrY * 0.30;
            const cosY = Math.cos(yaw), sinY = Math.sin(yaw);
            const cosP = Math.cos(pitch), sinP = Math.sin(pitch);
            const offsetX = ((ctx && (ctx.isMobile || ctx.centred)) ? 0.0 : 2.25) * (1.0 - 0.85 * (this.insideness || 0));
            const lens = (ctx && ctx.cursorLens) ? ctx.cursorLens(this.origin.x + offsetX, this.origin.y, this.origin.z) : null;

            const N = buffer.count;
            this._lastCount = N;
            const pos = buffer.positions;
            const col = buffer.colours;
            const sz = buffer.sizes;
            const seeds = buffer.seeds;

            for (let i = 0; i < N; i++) {
                this._evalQSimParticle(i, N, t, cosY, sinY, cosP, sinP, offsetX, pos, i * 3, col, sz, seeds);
                if (lens && lens.active && i > 0) ctx.applyLens(pos, i * 3, lens);
            }
        }

        targetFor(i, out = new Vector3()) {
            if (!this.initialized) return out.copy(this.origin);
            const tmp = [0, 0, 0];
            this._evalQSimParticle(i, this._lastCount || 90000, 0.0, Math.cos(-0.36), Math.sin(-0.36), Math.cos(0.42), Math.sin(0.42), 2.15, tmp, 0, null, null, null);
            return out.set(tmp[0], tmp[1], tmp[2]);
        }
    }

    registerFormation("hub:domain-cs", QuantumCSFormation);
    registerFormation("domain:cs:0", QuantumCSFormation);
    TF.QuantumCSFormation = QuantumCSFormation;
}(typeof self !== "undefined" ? self : globalThis));
