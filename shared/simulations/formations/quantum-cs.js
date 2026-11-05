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

            let lx = 0, ly = 0, lz = 0;
            let rC = 0.25, gC = 0.85, bC = 0.65;

            if (i < nCountParticles) {
                // 256 Counting-register amplitude columns on a 16x16 3D lattice
                const colIdx = i % 256;
                const gx = (colIdx & 15) - 7.5;
                const gz = ((colIdx >> 4) & 15) - 7.5;
                const h = this.ampHeight[colIdx];
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
            } else if (i < nWorkParticles) {
                // 16 Modular-exponentiation work-register columns |a^x mod 15⟩
                const wIdx = i & 15;
                const wx = (wIdx - 7.5) * 0.42 + (u1 - 0.5) * 0.16;
                const wz = -3.4 + (u2 - 0.5) * 0.16;
                const wh = this.workHeight[wIdx] * 1.65;
                lx = wx;
                lz = wz;
                ly = -1.45 + u3 * wh;
                rC = 0.12 + 0.25 * u3;
                gC = 0.48 + 0.18 * u3;
                bC = 0.40 + 0.16 * u3;
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

                const sArc = (u1 + t * 0.28) % 1.0;
                lx = sx + (ex - sx) * sArc;
                lz = sz + (ez - sz) * sArc;
                ly = -1.1 + 4.0 * sArc * (1.0 - sArc) * (1.15 + 0.55 * this.ampHeight[xState]);

                const c3 = xState * 3;
                rC = this.ampCols[c3] * 0.42 + 0.08;
                gC = this.ampCols[c3 + 1] * 0.42 + 0.08;
                bC = this.ampCols[c3 + 2] * 0.42 + 0.08;
            }

            const rx = lx * cosY - lz * sinY;
            const rz = lx * sinY + lz * cosY;
            const ry = ly * cosP - rz * sinP;
            const rz2 = ly * sinP + rz * cosP;

            const scale = 1.0 + 0.85 * (this.insideness || 0);
            outPos[i3]     = this.origin.x + offsetX + rx * scale;
            outPos[i3 + 1] = this.origin.y + ry * scale;
            outPos[i3 + 2] = this.origin.z + rz2 * scale;

            if (outCol) {
                outCol[i3]     = clamp(rC, 0.04, 0.85);
                outCol[i3 + 1] = clamp(gC, 0.04, 0.85);
                outCol[i3 + 2] = clamp(bC, 0.04, 0.85);
            }
            if (outSz) {
                outSz[rawIdx] = 0.85 + 1.15 * u4;
            }
            if (rawIdx === 0) {
                const colIdx0 = this.markedTarget & 255;
                const gx0 = (colIdx0 & 15) - 7.5;
                const gz0 = ((colIdx0 >> 4) & 15) - 7.5;
                const lx0 = gx0 * 0.42;
                const lz0 = gz0 * 0.42 + 0.6;
                const ly0 = -1.45 + this.ampHeight[colIdx0] + 0.18;
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

        update(_dt, t, buffer, ctx) {
            if (!this.initialized) this.init(buffer, ctx);
            this._updateQuantumState(t);

            const ptrX = (ctx && ctx.pointerX) || 0;
            const ptrY = (ctx && ctx.pointerY) || 0;
            const yaw = -0.36 + 0.34 * Math.sin(t * 0.11) + ptrX * 0.55;
            const pitch = 0.42 + 0.16 * Math.sin(t * 0.083 + 1.0) + ptrY * 0.30;
            const cosY = Math.cos(yaw), sinY = Math.sin(yaw);
            const cosP = Math.cos(pitch), sinP = Math.sin(pitch);
            const offsetX = ((ctx && ctx.isMobile) ? 0.0 : 2.15) * (1.0 - 0.85 * (this.insideness || 0));
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

    /* ============================================================================
       6. CONTACT FORMATION — Cel-shaded Earth & Moon (Wildseed Kids / Counterfeit Cat reference)
       Rebuilt to match the reference artwork:
       - Solid cel-shaded Earth: cobalt oceans (12,93,211), deep coast outlines (0,64,144),
         cyan-white cloud masses (181,223,235), muted green land (62,136,102), tan deserts
         (169,153,128), cyan limb rim (183,225,249), thin black night crescent on the lower right
         that carries only dark contour lines.
       - Earth spins on its tilted axis. Hero Particle 0 (+ radar rings 1..24) is pinned to
         India (21.5°N, 78.5°E) and rides the rotation; it fades out when India turns behind the limb.
       - Cratered grey Moon revolves around the Earth on an inclined orbit (starts upper-left,
         exactly where the reference has it), is tidally locked, and is occluded by the Earth.
       - Starfield, 6-spoke sparkles, tiny red planet, amber dot and faint outlined asteroids
         placed like the reference.
       - Every body is drawn as a solid disc: sprite size and brightness are computed from the
         live camera (ctx.project / ctx.camera) so the particles fuse into a flat cel-shaded fill
         instead of a dot lattice. Back-facing and occluded particles are culled (size 0) because
         the stage has no depth buffer.
       ============================================================================ */
    const EM = (function () {
        const lin = (c) => Math.pow(c / 255, 2.2);
        // Inverse of the composite pass (ACES fit + gamma 2.2): display colour -> HDR scene radiance.
        const invAces = (m) => {
            m = Math.min(Math.max(m, 0.0), 0.975);
            const A = 2.51 - 2.43 * m, B = 0.03 - 0.59 * m, C = -0.14 * m;
            return (-B + Math.sqrt(B * B - 4 * A * C)) / (2 * A);
        };
        const hdr = (r, g, b) => [invAces(lin(r)), invAces(lin(g)), invAces(lin(b))];

        const hash3 = (x, y, z) => {
            let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(z, 1274126177);
            h = Math.imul(h ^ (h >>> 13), 1274126177);
            h ^= h >>> 16;
            return (h >>> 0) / 4294967295;
        };
        const vnoise = (x, y, z) => {
            const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
            let fx = x - xi, fy = y - yi, fz = z - zi;
            fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy); fz = fz * fz * (3 - 2 * fz);
            const l = (a, b, t) => a + (b - a) * t;
            return l(
                l(l(hash3(xi, yi, zi), hash3(xi + 1, yi, zi), fx), l(hash3(xi, yi + 1, zi), hash3(xi + 1, yi + 1, zi), fx), fy),
                l(l(hash3(xi, yi, zi + 1), hash3(xi + 1, yi, zi + 1), fx), l(hash3(xi, yi + 1, zi + 1), hash3(xi + 1, yi + 1, zi + 1), fx), fy),
                fz);
        };
        const fbm = (x, y, z, oct) => {
            let a = 0.5, s = 0.0, n = 0.0;
            for (let o = 0; o < oct; o++) { s += a * vnoise(x, y, z); n += a; x *= 2.03; y *= 2.03; z *= 2.03; a *= 0.5; }
            return s / n;
        };

        // Mean of the point-sprite energy profile over its disc (matches FS_SHARED_POINTS, no streak)
        let avgf = 0.0;
        for (let k = 0; k < 400; k++) {
            const r = (k + 0.5) / 400, r2 = r * r;
            const core = Math.exp(-r2 * 4.6), halo = (1 - r2) * (1 - r2) * 0.40;
            avgf += (0.48 + 0.82 * core) * (core * 0.85 + halo) * 2 * r / 400;
        }

        // Natural Earth 1:50m land, rasterised to 720x360 (0.5 deg), run-length encoded (base36, alternating ocean/land)
        const MASK_RLE = "6vy,h,ha,7,2,8,1,1,17,18,gs,13,1,1,t,1g,g9,1k,3,25,2,2,fy,1l,4,29,1,4,3,b,3s,6,5,4,b5,8,1,4g,3e,2,7,a,1,4,4,3,1c,5,2,8,99,1m,1,2y,39,f,3,o,q,4,o,b,8z,4,3,1k,3,2w,1r,2,1,k,7,6,o,b,1,j,1n,h,8w,4,3,1h,a,2p,1j,y,19,3,e,3,w,4,q,j,8j,9,b,18,1,1,9,2s,1m,v,2t,1,w,e,1,8,7y,7,8,b,2,6,2,15,3,2y,1o,o,7,8,3p,i,7r,2,1,9,8,c,1,8,3,10,4,2w,3,2,1n,h,1,7,47,d,1,4,7i,2,1,c,6,3,5,8,2,9,3,3,3,q,6,32,1q,a,4,9,44,3,4,7,7g,a,4,6,8,4,f,6,4,4,1,m,b,31,1s,8,5,7,2f,1,16,2,a,4,8,e,79,c,1,4,6,4,6,3,3,9,1,13,c,2z,1v,4,2n,8,1h,2,1,2,1,1,3,p,1y,3,4v,m,3,6,1,3,1,f,2,10,i,2u,4d,i,1b,16,1c,5,2,3,k,1,4o,2,1,x,2,k,3,b,1,f,o,1,c,2b,49,i,v,1,f,1c,17,2,1,h,1,2,5a,p,1,3,5,g,1,q,15,2c,41,e,11,3,8,1j,16,l,1,a,4u,2,a,d,1,5,d,1,3,a,1,r,17,25,2,1,20,2,20,b,1b,1,1,1i,1e,c,7,8,4o,h,5,3,r,3,4,9,5,2,1,1,1,1,6,2,1c,25,23,2,1y,a,19,6,2,1d,1,5,17,3,7,3,58,j,g,5,5,b,1,c,3,8,1,e,15,21,43,9,p,2,8,2,8,1k,2,j,8,9,h,1,7,7,53,m,6,1,4,8,3,d,1,a,3,r,14,1z,43,8,p,5,4,6,4,1,1,29,4,e,k,8,52,y,1,6,4,n,3,t,12,1x,45,8,p,8,2,4,2,6,1,2q,m,a,4x,16,6,c,1,4,7,w,10,1w,43,9,p,9,3,32,j,m,1o,4,2w,c,2,u,7,8,1,6,5,12,v,1x,41,a,n,a,2,34,5,3,3,3,1,s,1l,7,13,6,1p,7,4,t,9,3,2,9,5,13,u,1w,p,3,1s,4,2,2,1a,a,k,3k,2,16,5,7,14,5,11,i,1,1,1,2,15,2,i,w,3,2,6,a,5,17,q,1o,1,6,o,3,1n,j,18,a,g,e,2,4u,z,3,z,z,1,4,n,3,2,4,3,2,d,z,6,b,5,18,o,1v,28,p,1i,5,c,d,1,4u,f,1,3,3,1e,1e,8,h,1,3,1,6,6,y,3,h,6,2,1,12,o,1u,26,x,u,2,i,c,4,d,1,55,2,5,1,f,5,1,v,1h,3,10,2,18,1,c,6,9,3,3,1,m,o,5,1,1j,26,18,m,5,7,1,8,2,1,d,1,1,1,a,1,5c,2,n,n,3m,1,2,1,o,3,a,3,2,3,j,s,1k,27,1c,a,6,4,4,3,6,1,q,1,6e,j,31,6,d,8,n,1,b,4,2,3,p,m,1g,28,1k,7,5,6,7j,l,4a,1,c,7,s,j,18,2h,2,2,1h,6,6,1,1g,2,6a,h,4m,7,5,4,n,f,16,2m,1j,4,5,3,1d,3,6g,b,3,1,4j,f,q,e,15,y,2,1l,1l,1,2,2,85,5,4p,g,q,f,13,l,6,1,1,1,a,1h,19,1,8n,2,4r,h,f,2,8,h,z,n,m,1e,1b,9,7v,1,2,2,a,8,4h,1,7,a,n,2,5,k,r,u,m,1f,k,5,l,1,1,1,3,3,7u,7,8,a,4g,1,a,6,r,2,1,m,p,v,m,1c,m,5,m,1,1,1,7z,b,5,d,2,2,2,2,44,2,c,5,r,o,p,y,i,1c,o,2,r,1,7v,j,4,f,1,1,42,2,8,1,6,4,3,7,i,o,n,z,e,1c,q,2,8q,i,7,7,45,9,3,6,2,3,5,9,g,p,l,17,3,1e,q,2,8t,1,1,j,1,8,46,d,5,7,3,3,3,4,f,q,j,2n,q,4,8u,s,43,h,4,3,3,1,c,6,8,1,2,r,h,1x,3,m,q,6,7x,1,p,4,2,s,44,o,3,1,e,9,2,1,2,t,g,1y,1,m,q,7,8k,12,41,v,i,7,2,v,e,1y,1,m,q,7,7k,5,5,3,k,q,2,e,3z,u,k,1,2,5,1,w,c,29,3,b,r,5,7j,6,4,1,l,s,3,9,42,x,h,2,2,4,3,11,5,2a,2,b,t,1,h,1,71,c,e,3,3,18,3,2,o,1,a,4,2,4,2n,s,2,3,h,8,4,12,3,2b,1,c,s,7,3,1,5,2,72,b,a,1,1,7,1,1i,i,3,3,l,2j,w,j,6,6,3b,3,e,s,7,72,1,b,8,b,1t,l,r,2j,s,m,2,9,34,1,1,6,g,9,2,e,7,6p,i,4,c,c,1z,2,1,8,1,4,s,2i,s,x,31,3,1,5,h,7,4,c,9,6n,x,a,27,c,u,2h,p,1,5,v,2z,d,m,3,1,b,2,3,4,3,2,6h,w,e,1g,1,m,6,2,6,w,2k,k,1,5,w,2y,d,k,i,1,2,4,6m,x,d,1i,2,i,7,3,3,10,2n,g,2,4,w,2y,c,k,6,2,a,2,1,5,6k,x,g,1y,7,6,1,13,2o,d,4,3,x,30,8,l,6,2,a,8,6j,y,g,1w,8,5,1,17,2p,a,3,3,z,2z,a,j,d,d,6h,10,d,1w,a,1e,2w,7,14,2s,f,i,f,a,6k,y,d,7,2,1l,6,3,1,1,1,1f,2v,4,1a,2o,h,h,c,5,5,1,6m,y,e,7,5,1d,6,2,1,1m,4,1,2q,4,1a,2l,l,h,77,1,4,3,2,p,b,1p,5,1t,4,1,2q,5,1b,2j,9,5,8,b,7i,3,1,p,9,1q,5,1v,3,2,2u,1,1b,2i,9,2,b,8,7q,p,9,o,1,w,1,1,3,20,3,3,2q,3,1b,2j,8,2,e,5,7q,p,6,q,4,c,1,6,9,28,2,4,2o,2,1d,2i,9,2,e,4,7r,p,6,s,2,7,1,3,2,2,5,1,1,2f,1,5,43,2h,6,4,e,3,7t,p,5,11,6,2v,42,2j,2,9,c,1,7q,2,4,o,4,16,1,2w,3v,3,5,2s,c,1,7r,2,4,m,4,45,3u,3,5,2r,5,9,7s,2,4,m,3,48,3e,4,4,8,a,2t,1,1,2,2,7u,2,5,k,1,4c,3h,1,5,6,a,2t,7z,3,5,k,1,4e,3g,9,d,2o,83,2,3,2,2,h,2,4h,3e,a,d,2n,83,3,2,54,3e,4,2,3,e,2o,81,3,3,j,2,4k,3c,1,1,2,2,2,1,7,8,2r,2z,3,4v,4,4,h,1,4m,3f,4,2,7,3,1,4,2s,2v,9,4r,5,5,f,2,4m,3h,1,4,38,1t,1,8,4,m,a,4q,6,2,1,2,b,3,4q,3l,38,1s,4,6,4,j,1,1,9,1,1,4p,7,2,c,4,4r,3j,3a,t,1,x,5,t,1,1,9,1,1,4o,6,4,a,3,4t,3h,3d,t,1,x,6,5,3,j,b,4q,9,4,6,3,4v,36,2,6,7,1,38,s,4,t,9,2,7,h,9,4r,a,6,1,4,4x,33,5,4,8,2,2u,7,2,1,4,k,3,8,2,s,k,g,9,4p,a,c,4x,31,3d,x,4,1,1,8,4,p,m,f,a,4m,a,d,4x,31,3e,q,a,c,4,n,q,c,c,4j,a,b,51,31,3e,p,a,3,2,8,7,j,a,1,3,1,c,d,c,4a,g,4,2,3,54,32,3d,p,a,2,5,9,5,j,7,9,a,d,d,48,i,4,3,1,54,32,3d,n,b,4,5,a,3,12,1,2,2,h,c,46,k,3,58,2x,3i,k,e,4,7,a,1,i,1,15,c,46,j,5,57,2u,3l,j,6,2,7,4,9,8,1,b,1,1c,8,3r,2,g,k,5,58,2s,2d,1,17,j,4,5,7,4,b,3,2,1,2,9,2,1,1,1a,a,3o,2,e,n,5,58,2s,2d,1,17,j,2,2,1,2,9,4,c,3,4,9,3,1a,b,3n,3,3,5,6,n,5,58,2r,2j,4,z,k,1,2,c,2,d,4,6,9,1,1a,b,3k,6,2,6,7,m,5,59,2p,2k,2,11,j,p,9,6,a,1,1a,b,3m,b,9,i,8,5a,2o,2q,2,w,h,p,9,8,1k,b,3n,1,5,4,a,2,1,c,1,1,7,5c,2m,2s,1,w,f,f,4,2,5,3,5,c,4,1,4,1,19,a,3u,6,7,2,1,b,a,5c,2m,2s,1,11,a,5,n,3,3,c,4,1,1h,8,3t,6,7,e,9,5e,2l,3u,3,a,m,6,1,f,3,3,1,4,2,1,4,2,5,2,4r,a,8,6,1,5,a,5f,2l,3u,2,7,q,5,2,h,2,5,2,c,2,1,4q,b,8,5,h,5f,2l,3u,z,o,6,1,1,9,5,2,4p,c,7,5,h,5h,2i,3v,10,q,2,d,5,2,4p,c,7,4,h,5j,2e,3x,z,1e,4q,b,3,3,1,2,d,5p,2,2,2a,3v,13,1b,4s,b,1,5,e,5r,4,1,25,3w,16,1a,4s,a,2,4,b,2,1,7,1,5m,2,1,24,3g,2,e,1d,b,6,m,4t,f,a,62,23,u,1,32,1e,9,a,j,4v,f,5,66,21,3x,1g,7,e,8,3,4,4w,f,4,67,5,1,1u,3y,1j,5,i,1,55,g,3,68,4,2,1t,3y,1l,3,5o,h,2,69,3,3,1s,3y,7d,f,2,6a,5,1,1d,5,a,3x,3b,2,41,6m,1,5,5,1,10,5,6,b,6,3p,2,5,3a,4,3z,6n,1,7,13,b,1,c,5,3g,2,2,1,3,2,4,3c,4,3z,f,1,6d,1,1,4,1,w,q,5,3h,6,1,2,2,3f,4,3y,e,2,6d,7,1,u,r,6,3f,2,3,2,3,2o,1,t,4,3v,f,2,6f,6,2,s,s,6,3p,2n,3,t,5,3t,6y,6,2,q,t,5,2,4,3i,2p,3,t,5,3r,e,2,r,1,5t,4,3,p,t,5,5,1,3h,2q,4,u,9,1,1,3i,f,1,6n,3,3,p,u,4,5,2,3f,2s,3,v,7,2,1,3i,73,4,2,p,v,3,3,5,3e,2s,3,v,6,3,5,3e,2,2,6z,4,4,m,v,3,4,3,1,2,3c,2t,4,u,4,5,k,2x,3,3,4,1,1,1,6t,5,3,l,12,2,3,4,38,2w,2,u,1,9,k,2v,4,3,3,2,6x,3,5,j,13,1,2,4,39,2w,4,16,h,2t,4,4,73,3,4,j,t,5,9,3,38,2x,5,16,i,2p,6,3,74,2,6,i,q,d,6,3,36,2y,4,17,i,2n,7,3,4c,3,2y,h,p,4,1,a,6,4,33,30,4,16,h,2k,b,2,4d,3,1,2,2t,1,1,i,g,4,4,5,4,7,7,4,31,30,3,17,i,17,2,17,f,1,4h,4,2u,h,d,8,6,2,7,7,3,2,33,32,3,15,l,y,a,w,2,5,52,4,2r,i,d,8,g,8,1,2,33,32,3,14,m,4,1,t,a,w,3,3,l,1,4k,1,2r,j,c,8,h,8,2,1,34,30,4,13,r,t,b,t,5,3,l,2,4i,4,2q,j,a,8,i,7,2,8,2y,30,5,10,t,s,c,s,5,5,55,3,2q,k,8,9,b,1,g,8,2w,31,6,z,t,p,g,q,5,5,k,2,4k,1,2g,2,c,k,3,b,j,1,6,d,1,1,5,1,2n,31,6,y,t,p,g,q,5,5,j,4,1a,1,64,x,i,5,3,d,1,7,1,2,2k,33,4,w,v,o,j,p,4,4,k,4,1a,1,67,u,j,4,8,2,7,4,1,1,5,1,2i,33,5,u,x,l,l,q,q,5,7k,s,1d,1,1,1,20,2,g,34,4,s,z,k,m,r,p,6,7l,p,4,1,1a,3,1z,3,2,1,c,34,4,p,1,1,10,j,n,s,o,5,7p,m,2,3,1b,2,21,1,2,1,b,37,4,l,14,j,n,5,1,n,m,6,1a,1,6g,6,2,l,17,2,24,1,b,37,4,k,16,g,p,4,3,n,l,5,81,l,17,1,21,3,c,37,4,j,17,e,y,n,l,6,1a,1,6q,k,17,2,1z,3,b,3b,2,g,1b,d,y,o,l,5,1a,1,6s,i,17,2,2e,3a,2,e,1d,d,y,o,l,7,1,1,15,1,6u,h,17,2,2f,3n,1g,c,p,1,9,n,l,9,14,1,6z,c,18,1,2,2,2c,3k,1j,c,o,2,9,n,l,9,14,1,72,9,q,2,2x,3h,f,4,13,c,o,1,a,4,1,i,m,4,1,5,86,8,m,3,1,5,c,1,2h,3d,j,3,15,b,o,2,8,6,3,f,k,d,86,7,l,4,1,3,2x,3c,d,3,1b,a,p,2,9,4,4,f,k,2,2,9,88,5,h,7,1,6,7,2,5,1,2g,3d,6,9,16,1,5,9,p,1,a,4,5,e,j,2,4,8,29,1,5y,5,g,j,1,1,1,8,2i,3c,1,d,1c,9,o,2,a,3,7,b,l,3,2,8,89,6,e,r,1,3,2k,3o,1d,8,10,3,8,8,m,3,3,1,1,8,87,7,5,2,6,u,2m,3m,1e,6,1,2,z,5,8,5,m,2,6,9,n,1,7m,6,1,7,2,w,2m,3l,1e,a,n,1,a,5,8,4,m,3,7,3,1,4,n,1,7n,1d,2k,3k,1g,4,2,4,x,5,8,2,2,1,k,3,9,7,8b,8,1,15,2j,3k,19,1,6,4,2,4,n,2,8,5,w,2,9,9,8f,4,3,14,2j,3i,1n,5,m,1,9,5,w,2,9,a,f,1,7y,1,1,2,4,14,2i,3i,1n,5,n,1,a,4,w,1,8,4,1,6,f,1,x,1,x,1,4,2,64,15,2j,3f,1o,5,n,1,b,5,s,4,7,2,2,6,1r,1,q,1,65,15,2k,3d,1p,4,z,6,r,5,4,4,3,5,2e,1,68,1e,2e,n,7,2g,1q,2,s,2,8,6,p,7,3,2,6,3,2f,1,69,1f,2d,j,a,2g,2k,6,4,7,m,c,2c,1,6n,1g,2e,5,7,2,d,2f,2l,7,4,6,k,b,f,1,8m,1i,2e,2,p,4,2,27,1e,2,17,6,4,6,9,1,a,b,f,1,43,1,4j,1h,3b,27,2o,7,2,6,9,1,9,a,e,2,1,1,8m,1j,39,2,1,23,1g,1,1b,6,2,5,4,2,c,b,f,1,a,1,2a,1,61,1k,3c,22,2q,2,1,7,1,7,2,1,5,1,4,e,e,1,5,2,43,1,4c,1m,3b,22,2r,1,1,e,b,1,2,f,i,3,42,2,4b,1o,35,1,4,1z,2w,1,2,c,9,j,c,2,4,3,2f,2,5y,1o,39,1z,2x,2,1,d,7,l,3,4,3,3,3,4,2f,2,5w,1p,3a,1y,2y,2,2,c,7,l,1,b,4,4,2f,2,59,2,l,1r,32,2,4,1w,32,1,1,a,1,1,7,j,3,a,5,5,7p,4,j,1t,36,1w,32,2,1,c,7,h,4,2,2,1,a,3,1,5,1,2,1v,1,5n,5,g,1x,32,1w,33,2,2,a,8,i,3,2,1,5,7,3,3,d,1o,1,5,1,8,2,57,3,i,21,2y,1v,35,2,1,9,9,h,3,a,6,2,5,9,1,2,2,1,n,1,1d,1,5s,21,2z,1u,35,2,2,c,4,1,1,f,4,f,1,3,2,2,2,6,1,9,e,2,4,1,76,22,1,2,2v,1t,38,1,1,c,7,e,4,6,4,2,1,2,7,1,3,5,3,a,b,3,3,2,23,1,52,2a,2q,1r,39,2,1,f,3,e,3,8,a,6,2,7,1,d,g,5,20,1,50,2c,2q,1p,3b,1,2,b,1,2,4,c,4,8,7,a,3,n,e,4,70,2e,2p,1n,3g,8,b,1,5,4,4,a,5,6,2,2,3,p,e,2,1x,1,1,1,v,2,42,2g,2p,1m,3h,7,h,1,2,1,6,2,2,4,i,3,1,m,c,5,1q,1,4,1,51,2i,2o,1l,u,2,2m,6,r,2,1,5,o,m,9,5,6y,2l,2m,1k,3g,1,2,5,q,3,2,5,i,1,2,1,4,i,2,b,4,1,2q,1,44,2l,2m,1j,3l,5,1,1,a,1,c,4,3,1,1,2,g,2,1,2,6,s,5,2,6u,2m,2l,1k,3n,7,3,2,h,2,6,1,j,2,6,k,2,5,6,3,6v,2k,2m,1i,3n,j,1,2,10,2,7,j,e,5,6t,2j,2m,1j,1s,1,1v,h,c,1,f,1,4,2,c,j,g,1,1,3,15,1,5n,2i,14,1,1i,1i,3r,e,m,4,4,1,2,2,b,l,h,2,1,3,6q,2i,2n,1h,3y,10,2,1,1,2,c,d,4,5,5,1,a,3,1,3,1,1,y,1,1,1,g,1,1r,2,3d,2g,2n,1i,44,s,p,8,4,6,4,1,2,1,8,3,1,5,z,1,i,1,1p,1,3e,2g,2n,1j,49,3,1,4,6,6,s,6,6,6,1,2,3,1,c,5,3a,2,3c,2e,2p,1i,4d,5,5,3,18,9,g,5,39,2,3c,2d,2q,1j,3m,1,r,3,1,1,2,4,y,1,a,8,j,3,39,1,3d,2b,2s,1j,3l,1,v,1,1,2,i,1,i,2,d,3,l,2,6,2,2b,1,43,2a,2t,1j,4,1,4t,7,5,2,a,2,k,3,a,2,6s,29,2t,1j,4,1,4t,3,1,6,1,3,9,4,j,2,b,3,b,1,6f,28,2u,1j,5,3,7,3,4h,d,9,4,1v,1,5v,26,2t,1l,8,1,6,3,4g,e,9,4,1v,1,c,1,6,2,5b,24,2u,1l,e,4,4g,e,9,5,2e,4,59,24,2u,1l,d,6,47,3,4,f,8,6,1a,2,r,1,c,3,58,24,2t,1m,d,6,45,6,2,g,9,7,18,2,6g,22,2u,1m,c,7,45,m,b,8,16,2,1,1,6g,22,2t,1m,b,8,43,p,a,8,16,4,2k,1,3w,21,1t,1,y,1m,9,b,43,r,7,9,16,2,1,1,n,1,1v,2,4,2,3s,1z,1t,1,y,1m,7,c,41,v,2,2,2,9,17,3,k,4,1j,2,e,2,3w,1w,2t,1l,8,d,3z,10,2,a,16,3,j,7,1l,1,4a,1v,2t,1j,9,d,40,10,1,c,1p,3,1,2,1,3,1k,2,g,1,3u,1t,2t,1h,b,c,41,1d,17,2,g,5,3,1,23,1,6,3,3m,1r,2u,1f,e,b,40,1e,1p,5,1,1,a,2,7,1,1u,1,3n,1q,2v,1e,e,b,40,1e,18,2,h,1,3,1,1,1,h,1,5i,1q,2w,1b,g,b,3z,1i,n,1,i,1,g,2,66,1q,2w,19,i,a,h,1,3e,1n,15,1,6o,1p,2y,18,i,a,g,2,3c,1r,t,2,3,1,5,1,m,1,27,1,3s,1p,2y,18,h,a,d,2,2,2,36,1,2,1u,t,3,1,3,y,2,t,1,4y,1o,30,18,g,a,d,2,3a,1x,u,4,1,3,6q,1o,30,18,f,b,3m,20,v,4,1,2,c,1,6d,1n,32,18,e,a,3n,23,u,3,6s,1m,33,18,e,a,3n,23,w,2,6q,1j,37,17,g,9,3n,24,7n,1g,3a,18,f,9,3m,25,4g,1,36,1d,3d,17,g,8,3n,27,7l,1b,3g,16,g,8,3o,28,7j,1b,3g,13,k,6,3p,28,7j,1a,3h,11,o,2,3p,2a,7j,1a,3h,11,4g,29,7j,19,3j,10,4h,28,5e,1,24,1a,3i,10,4i,28,7h,1b,3j,z,4i,27,7i,1a,3k,z,4i,28,7g,1b,3l,x,4k,27,7h,19,3n,u,4m,26,7i,17,3q,t,4m,26,7h,18,3q,s,4n,26,7h,17,3s,q,4p,25,7h,17,3s,p,4q,25,7h,16,3u,n,4s,23,7i,14,3w,n,4s,q,7,1,1,14,7i,13,3w,m,4u,l,g,11,7j,13,3w,l,4v,i,j,10,76,1,d,12,3y,j,4u,j,l,y,7k,12,3z,b,1,4,4x,b,u,3,1,t,16,2,6c,u,1,6,42,3,5a,7,w,2,2,s,17,2,6b,w,9n,4,10,t,18,3,69,w,ar,s,19,4,68,x,aq,3,2,n,1a,5,65,y,aw,m,1b,4,64,y,ax,l,1d,3,64,y,ay,k,1d,9,5y,x,b0,f,1h,8,5z,u,b7,3,1,5,1i,9,60,o,bj,1,1i,9,60,o,bf,2,6,2,1e,8,61,o,bf,3,5,2,1c,1,4,4,62,o,bh,3,1,4,1b,5,1,3,63,i,1,4,bi,8,1b,9,62,j,bn,8,19,7,1,1,64,m,bl,7,19,7,66,m,bl,7,18,7,67,l,bn,5,17,8,j,2,5m,k,bq,3,16,a,j,2,5m,k,cy,8,69,k,cx,9,6b,j,cw,a,6a,h,cy,a,6b,g,6m,1,6d,8,6b,i,5t,1,77,5,6f,i,cy,2,6g,k,jf,l,jf,j,7i,3,bw,h,7k,5,bu,h,7k,4,bw,f,jl,d,d1,2,6k,d,g,7,j0,e,e,8,j0,f,e,6,cm,1,6f,e,7u,1,5b,1,6g,d,7u,2,bs,d,1n,2,hz,f,1j,5,at,1,76,h,1h,3,as,1,78,a,jv,3,2u9,1,2qw,2,jf,3,jr,2,jt,1,1,5,jp,2,1,4,6,1,jm,1,3,1,4,7,jm,1,1,b,jj,f,jk,a,1,1,2,1,jl,7,8y,3,2,2,ak,c,69,7,21,2,e,8,e,6,9y,1,1,b,65,f,25,3,1,2,2,f,6,a,j,4,5,h,1c,2,74,b,1,1,65,3,1,f,1j,1q,7,2,3,b,3,r,1,2,11,2,72,a,65,3,1,r,17,3g,13,1,6z,9,62,1g,k,3q,z,1,73,6,1,3,5s,1l,h,42,4,2,7f,4,5,9,3,2,56,4,a,1p,g,4b,7b,7,1,f,58,6,8,1p,c,4n,6x,4,2,o,49,3,v,c,1,1p,7,4v,6v,3,5,l,32,2,4,2,6,2,3,1,1,2,4,6,4,b,1,3,3,3,2,2,2,3,4,29,4,1,1,4y,1,2,6o,7,4,n,2r,1,4,5,3,4,9,1b,1,2e,4,5d,6f,w,2o,8,1,f,1,3u,4,5g,2,1,4u,d,15,f,1,e,2o,4h,3,1,1,5l,4t,e,1,1,13,e,1,e,2g,1,6,4h,1,5p,4o,2,2,3,1,2,4,5,1,4,3,8,e,2,8,4,2,8,2,g,2e,2,3,aa,3g,4,14,2,2,11,7,6,2,8,1,r,2e,ad,3h,7,1,a,4,1,2,2,m,2d,26,2,7,a8,4,2,36,5,4,3,2,5,1,5,1,e,2,4,g,2b,24,5,5,a6,38,1h,h,29,2d,a8,2w,1,2,4c,2d,1,2,a4,2t,4l,23,aj,2m,4o,22,ao,2k,4j,26,ar,25,4o,28,b1,4,7,1r,4t,1d,7,i,b4,3,7,1t,4i,1,5,d,2,x,d,e,bd,1j,6,a,44,1,a,c,8,w,g,d,bc,1k,a,9,44,1,9,8,a,w,h,b,b0,1,1,1x,a,5,4,7,45,8,5,3,5,8,4,f,j,j,as,2g,3,5,47,h,g,9,n,l,ar,2p,4i,1,1,6,c,a,b,k,2,2,b0,1y,7,6,54,1b,ba,24,2,2,2,6,56,m,7,1,2,6,bh,24,2,7,57,9,ca,15,7,e,4,d,59,6,cj,1,1,13,l,1,3,3,ib,13,j6,8,k0,8,1,7,w,jx,3,5io";
        let _mask = null;
        const landMask = () => {
            if (_mask) return _mask;
            const W = 720, H = 360, m = new Uint8Array(W * H);
            let p = 0, v = 0; const runs = MASK_RLE.split(",");
            for (let r = 0; r < runs.length; r++) { const n = parseInt(runs[r], 36); if (v) m.fill(1, p, p + n); p += n; v ^= 1; }
            let a = new Float32Array(W * H), b = new Float32Array(W * H);
            for (let i = 0; i < W * H; i++) a[i] = m[i];
            const R = 6;                                   // ~3 deg box blur, two passes: coast-distance proxy for shelf depth
            for (let pass = 0; pass < 2; pass++) {
                for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { let acc = 0; for (let k = -R; k <= R; k++) acc += a[y * W + ((x + k + W) % W)]; b[y * W + x] = acc / (2 * R + 1); }
                for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { let acc = 0; for (let k = -R; k <= R; k++) acc += b[Math.min(H - 1, Math.max(0, y + k)) * W + x]; a[y * W + x] = acc / (2 * R + 1); }
            }
            _mask = { W, H, m, s: a };
            return _mask;
        };
        const sample = (arr, lat, lon) => {
            const W = 720, H = 360, x = (lon + 180) / 360 * W - 0.5, y = (90 - lat) / 180 * H - 0.5;
            const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
            const xa = ((x0 % W) + W) % W, xb = (xa + 1) % W, ya = Math.min(H - 1, Math.max(0, y0)), yb = Math.min(H - 1, Math.max(0, y0 + 1));
            return (arr[ya * W + xa] * (1 - fx) + arr[ya * W + xb] * fx) * (1 - fy) + (arr[yb * W + xa] * (1 - fx) + arr[yb * W + xb] * fx) * fy;
        };
        const al = (r, g, b) => [lin(r), lin(g), lin(b)];            // sRGB albedo -> linear reflectance
        const PR = {
            oceanDeep: al(5, 24, 62), oceanMid: al(13, 52, 104), shallow: al(34, 112, 146),
            forest: al(30, 56, 32), grass: al(74, 92, 50), savanna: al(120, 112, 70), taiga: al(44, 62, 48), tundra: al(112, 116, 100),
            desert: al(178, 144, 102), desertRed: al(152, 104, 74), mountain: al(116, 104, 92), snow: al(240, 244, 250), ice: al(228, 236, 246),
            cloud: [0.80, 0.82, 0.86],
            moonHigh: al(128, 124, 118), moonMare: al(44, 44, 47), moonNight: [0.010, 0.013, 0.026]
        };

        return {
            D2R: Math.PI / 180, hdr, fbm, vnoise, avgf, landMask, sample, PR, SUN: 1.9,
            COL: {
                ocean: [0.015, 0.14, 0.72], shallow: [0.035, 0.22, 0.88], coast: [0.005, 0.08, 0.42],
                cloud: [0.55, 0.85, 0.95], cloudRim: [0.35, 0.70, 0.90], cloudHi: [0.65, 0.92, 0.98],
                green: [0.10, 0.42, 0.18], greenDark: [0.07, 0.32, 0.14], india: [0.12, 0.48, 0.22],
                tan: [0.45, 0.38, 0.28], rim: [0.35, 0.82, 1.10], glow: [0.08, 0.35, 0.95],
                line: [0.08, 0.18, 0.55], night: [0.04, 0.09, 0.28],
                moon: [0.58, 0.62, 0.70], moonCrater: [0.30, 0.32, 0.40], moonRim: [0.22, 0.24, 0.32],
                moonNight: [0.20, 0.22, 0.28],
                white: [1.05, 1.05, 1.12], violet: [0.85, 0.72, 1.25], warm: [1.2, 0.98, 0.62],
                red: [0.82, 0.15, 0.06], amber: [0.95, 0.72, 0.32], rock: [0.22, 0.24, 0.55]
            }
        };
    })();

