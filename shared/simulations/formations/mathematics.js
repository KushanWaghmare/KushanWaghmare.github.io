    class MathematicsFormation extends Formation {
        constructor(origin, simKey = "hub:domain-math", params = {}, sectionIndex = 1) {
            super(origin, simKey);
            this.params = params || {};
            this.sectionIndex = sectionIndex;
            this.degrees = [5, 6, 7, 8, 3, 4];
            this.degIdx = 0;
            this.n = (params && Number.isInteger(params.n) && params.n >= 3 && params.n <= 8) ? params.n : 5;
            this.coords4D = null;
            this.baseCols = null;
            this.seamMask = null;
            this.auxLines4D = null;
            this.auxPositions = new Float32Array(2400 * 3);
            this.auxColours = new Float32Array(2400 * 4);
            this.auxLineCount = 0;
            this.alpha = 0.65;
            this.yaw = 0.3;
            this.pitch = 0.38;
            this.cameraDistance = 13.5;
        }

        applyPreset(preset) {
            this.localePreset = preset;
            if (preset && typeof preset.power === "number") {
                const targetN = clamp(preset.power | 0, 3, 8);
                if (this.n !== targetN) {
                    this.n = targetN;
                    if (Array.isArray(this.degrees)) {
                        this.degIdx = Math.max(0, this.degrees.indexOf(targetN));
                    }
                    if (this._lastBuffer) {
                        this._rebuildSurfaceSamples(this._lastBuffer.maxCount, this._lastBuffer.seeds);
                    }
                }
            }
        }

        _rebuildSurfaceSamples(N, seeds) {
            const CY = root.CYMath || (typeof require === "function" ? require("../math/cy-math.js") : null);
            if (!this.coords4D || this.coords4D.length !== N * 4) {
                this.coords4D = new Float32Array(N * 4);
                this.baseCols = new Float32Array(N * 3);
                this.seamMask = new Float32Array(N);
            }

            const n = this.n;
            const n2 = n * n;
            const out4 = new Float32Array(4);
            const tab = (CY && CY.rootsOfUnity) ? CY.rootsOfUnity(n) : null;
            const limit = 1.15;
            const halfPi = Math.PI * 0.5;

            for (let i = 0; i < N; i++) {
                const i3 = i * 3, i4 = i * 4;
                const u1 = seeds[i4], u2 = seeds[i4 + 1], u3 = seeds[i4 + 2], u4 = seeds[i4 + 3];
                const patchIdx = (i + ((u3 * n2) | 0)) % n2;
                const k1 = (patchIdx / n) | 0;
                const k2 = patchIdx % n;

                let a, b, isSeam = 0.0;
                if (u4 < 0.22) {
                    a = (u4 < 0.11) ? (u1 < 0.5 ? 0.01 : halfPi - 0.01) : (u1 * halfPi);
                    b = (u4 < 0.11) ? ((u2 * 2.0 - 1.0) * limit) : ((u2 - 0.5) * 0.03);
                    isSeam = 1.0;
                } else {
                    a = u1 * halfPi;
                    b = (u2 * 2.0 - 1.0) * limit;
                }

                if (CY && CY.evalPatch) {
                    CY.evalPatch(n, k1, k2, a, b, out4, tab);
                } else {
                    out4[0] = Math.cos(a); out4[1] = b; out4[2] = Math.cos(k1); out4[3] = Math.sin(k2);
                }

                this.coords4D[i4]     = out4[0];
                this.coords4D[i4 + 1] = out4[1];
                this.coords4D[i4 + 2] = out4[2];
                this.coords4D[i4 + 3] = out4[3];
                this.seamMask[i] = isSeam;

                const pal = CY_PATCH_PALETTE[patchIdx % CY_PATCH_PALETTE.length];
                if (isSeam > 0.5) {
                    this.baseCols[i3]     = Math.min(1.0, pal[0] * 0.55 + 0.45);
                    this.baseCols[i3 + 1] = Math.min(1.0, pal[1] * 0.55 + 0.38);
                    this.baseCols[i3 + 2] = Math.min(1.0, pal[2] * 0.55 + 0.48);
                } else {
                    this.baseCols[i3]     = pal[0];
                    this.baseCols[i3 + 1] = pal[1];
                    this.baseCols[i3 + 2] = pal[2];
                }
            }

            // Build auxiliary same-scene wireframe lines along patch boundaries (fades in after particle arrival)
            const segs = 12;
            const maxLines = Math.min(n2 * segs * 2, 2400);
            this.auxLines4D = new Float32Array(maxLines * 4);
            let ptr = 0;
            for (let k1 = 0; k1 < n && ptr < maxLines - 2; k1++) {
                for (let k2 = 0; k2 < n && ptr < maxLines - 2; k2++) {
                    const pal = CY_PATCH_PALETTE[(k1 * n + k2) % CY_PATCH_PALETTE.length];
                    for (let s = 0; s < segs && ptr < maxLines - 2; s++) {
                        const a0 = (s / segs) * halfPi;
                        const a1 = ((s + 1) / segs) * halfPi;
                        if (CY && CY.evalPatch) {
                            CY.evalPatch(n, k1, k2, a0, 0.0, out4, tab);
                            this.auxLines4D.set(out4, ptr * 4);
                            this.auxColours.set([0.745, 0.843, 1.0, 0.12], ptr * 4);
                            ptr++;
                            CY.evalPatch(n, k1, k2, a1, 0.0, out4, tab);
                            this.auxLines4D.set(out4, ptr * 4);
                            this.auxColours.set([0.745, 0.843, 1.0, 0.12], ptr * 4);
                            ptr++;
                        }
                    }
                }
            }
            this.auxLineCount = ptr;
        }

        init(buffer, _ctx) {
            this._lastBuffer = buffer;
            this._rebuildSurfaceSamples(buffer.maxCount, buffer.seeds);
            this.initialized = true;
        }

        applyPermutation(perm, count) {
            if (!this.coords4D) return;
            const N = count | 0;
            const tmp4 = new Float32Array(N * 4);
            const tmpCol = new Float32Array(N * 3);
            const tmpSeam = new Float32Array(N);
            for (let i = 0; i < N; i++) {
                const src = perm[i];
                const i4 = i * 4, s4 = src * 4;
                const i3 = i * 3, s3 = src * 3;
                tmp4[i4] = this.coords4D[s4];
                tmp4[i4 + 1] = this.coords4D[s4 + 1];
                tmp4[i4 + 2] = this.coords4D[s4 + 2];
                tmp4[i4 + 3] = this.coords4D[s4 + 3];
                tmpCol[i3] = this.baseCols[s3];
                tmpCol[i3 + 1] = this.baseCols[s3 + 1];
                tmpCol[i3 + 2] = this.baseCols[s3 + 2];
                tmpSeam[i] = this.seamMask[src];
            }
            this.coords4D.set(tmp4);
            this.baseCols.set(tmpCol);
            this.seamMask.set(tmpSeam);
        }

        onClick() {
            this.degIdx = (this.degIdx + 1) % this.degrees.length;
            this.n = this.degrees[this.degIdx];
            if (this._lastBuffer) {
                this._rebuildSurfaceSamples(this._lastBuffer.maxCount, this._lastBuffer.seeds);
            }
            const supMap = { 3: "³", 4: "⁴", 5: "⁵", 6: "⁶", 7: "⁷", 8: "⁸" };
            const sup = supMap[this.n] || `^${this.n}`;
            const tag = typeof document !== "undefined" ? document.querySelector('#domain-math .sim-tag, [data-sim="hub:domain-math"] .sim-tag') : null;
            if (tag) {
                tag.textContent = `Fermat curve · z₁${sup} + z₂${sup} = 1 in ℂ² · n² = ${this.n * this.n} patches (click to cycle)`;
            }
        }

        _project4DtoWorld(re1, im1, re2, im2, cosA, sinA, cosY, sinY, cosP, sinP, offsetX, out, i3) {
            const lx = re1;
            const ly = re2;
            const lz = im1 * cosA + im2 * sinA;
            const lw = -im1 * sinA + im2 * cosA;

            const rx = lx * cosY - lz * sinY;
            const rz = lx * sinY + lz * cosY;
            const ry = ly * cosP - rz * sinP;
            const rz2 = ly * sinP + rz * cosP;

            const scale = 2.55 * (1.0 + 0.95 * (this.insideness || 0));
            out[i3]     = this.origin.x + offsetX + rx * scale;
            out[i3 + 1] = this.origin.y + ry * scale;
            out[i3 + 2] = this.origin.z + rz2 * scale;
            return lw;
        }

        update(_dt, t, buffer, ctx) {
            this._lastBuffer = buffer;
            if (!this.initialized || !this.coords4D) this.init(buffer, ctx);

            const N = buffer.count;
            const pos = buffer.positions;
            const col = buffer.colours;
            const sz = buffer.sizes;
            const seeds = buffer.seeds;
            const c4 = this.coords4D;
            const bCol = this.baseCols;
            const seam = this.seamMask;

            const ptrX = (ctx && ctx.pointerX) || 0;
            const ptrY = (ctx && ctx.pointerY) || 0;

            this.alpha = 0.58 + 0.36 * Math.sin(t * 0.27);
            this.yaw = t * 0.21 + 0.34 * Math.sin(t * 0.11) + ptrX * 0.55;
            this.pitch = 0.36 + 0.16 * Math.sin(t * 0.083 + 1.0) + ptrY * 0.30;

            const cosA = Math.cos(this.alpha), sinA = Math.sin(this.alpha);
            const cosY = Math.cos(this.yaw), sinY = Math.sin(this.yaw);
            const cosP = Math.cos(this.pitch), sinP = Math.sin(this.pitch);
            const offsetX = ((ctx && ctx.isMobile) ? 0.0 : 2.15) * (1.0 - 0.85 * (this.insideness || 0));
            const lens = (ctx && ctx.cursorLens) ? ctx.cursorLens(this.origin.x + offsetX, this.origin.y, this.origin.z) : null;

            for (let i = 0; i < N; i++) {
                const i3 = i * 3, i4 = i * 4;
                const lw = this._project4DtoWorld(
                    c4[i4], c4[i4 + 1], c4[i4 + 2], c4[i4 + 3],
                    cosA, sinA, cosY, sinY, cosP, sinP, offsetX,
                    pos, i3
                );
                if (lens && lens.active && i > 0) ctx.applyLens(pos, i3, lens);

                const isSeam = seam[i];
                const b = 0.17 + 0.26 * seeds[i4 + 3] * seeds[i4 + 3] + (isSeam > 0.5 ? 0.14 : 0.0);
                const shade = clamp((0.76 + 0.32 * lw) * b, 0.08, 0.72);
                col[i3]     = clamp(bCol[i3] * shade, 0.04, 0.85);
                col[i3 + 1] = clamp(bCol[i3 + 1] * shade, 0.04, 0.85);
                col[i3 + 2] = clamp(bCol[i3 + 2] * shade, 0.04, 0.85);

                sz[i] = (isSeam > 0.5 ? 1.45 : 0.85) + 0.80 * seeds[i4 + 3];
                if (i === 0) {
                    col[0] = 1.85; col[1] = 1.35; col[2] = 2.25;
                    sz[0] = 5.8;
                }
            }

            if (this.auxLines4D && this.auxLineCount > 0) {
                for (let k = 0; k < this.auxLineCount; k++) {
                    const k4 = k * 4, k3 = k * 3;
                    this._project4DtoWorld(
                        this.auxLines4D[k4], this.auxLines4D[k4 + 1], this.auxLines4D[k4 + 2], this.auxLines4D[k4 + 3],
                        cosA, sinA, cosY, sinY, cosP, sinP, offsetX,
                        this.auxPositions, k3
                    );
                }
            }
        }

        targetFor(i, out = new Vector3()) {
            if (!this.initialized || !this.coords4D) return out.copy(this.origin);
            const idx = clamp(i | 0, 0, (this.coords4D.length / 4) - 1);
            const i4 = idx * 4;
            const cosA = Math.cos(this.alpha), sinA = Math.sin(this.alpha);
            const cosY = Math.cos(this.yaw), sinY = Math.sin(this.yaw);
            const cosP = Math.cos(this.pitch), sinP = Math.sin(this.pitch);
            const tmp = [0, 0, 0];
            this._project4DtoWorld(
                this.coords4D[i4], this.coords4D[i4 + 1], this.coords4D[i4 + 2], this.coords4D[i4 + 3],
                cosA, sinA, cosY, sinY, cosP, sinP, 2.15,
                tmp, 0
            );
            return out.set(tmp[0], tmp[1], tmp[2]);
        }
    }

    /* ============================================================================
       1B. MÖBIUS FORMATION — Non-Orientable Manifold r(u, v)
       Surface: r(u, v) = ((R + v*cos(k*u/2))*cos(u), (R + v*cos(k*u/2))*sin(u), v*sin(k*u/2))
       Normal vector transport around non-orientable loop: n(2pi, v) = -n(0, -v).
       ============================================================================ */
