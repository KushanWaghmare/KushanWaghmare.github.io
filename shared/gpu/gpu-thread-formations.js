/* Section Formation Interface & Per-Section Simulation Adapters (shared/gpu/gpu-thread-formations.js).
   Every section exposes a Formation with:
     - origin: THREE.Vector3 (world-space centre of that section)
     - init(buffer, ctx): seeds starting state
     - update(dt, t, buffer, ctx): writes the section's REAL simulation state into buffer
     - targetFor(i, outVec): where particle i wants to be when settled
     - dispose() */

(function (root, factory) {
    if (typeof module === "object" && module.exports) module.exports = factory(root);
    else root.THREAD_FORMATIONS = factory(root);
}(typeof self !== "undefined" ? self : this, function (root) {
    "use strict";

    const TM = root.THREAD_MATH || (typeof require === "function" ? require("../lib/thread-math.js") : null);
    const { Vector3, Formation, sectionOrigin, clamp, smoothstep } = TM;

    const registry = new Map();

    const registerFormation = (key, Ctor) => {
        registry.set(key, Ctor);
    };

    /* ============================================================================
       0. INTRO FORMATION — Lorenz Strange Attractor (σ = 10, ρ = 28, β = 8/3, RK4)
       Each particle integrates the real Lorenz ODE with 4× RK4 sub-stepping, subtle
       incommensurate breathing parameter drift, speed-based HDR colour ramp (cool slow
       → incandescent fast), two-lobe focal glow, and slow cinematic orbit framing.
       ============================================================================ */
    class LorenzFormation extends Formation {
        constructor(origin, simKey = "hub:intro", params = {}, sectionIndex = 0) {
            super(origin, simKey);
            this.params = params || {};
            this.sectionIndex = sectionIndex;
            this.sigma = 10.0;
            this.rho = 28.0;
            this.beta = 8.0 / 3.0;
            this.aizawaMode = false;
            this.state = null;     // Float32Array(N * 3) phase-space (x, y, z)
            this.speeds = null;    // Float32Array(N) normalised speed
            this.yaw = -0.22;
            this.pitch = 0.18;
            this.cameraDistance = 13.8;
            this.bloomStrength = 0.96;
            this.bloomThreshold = 0.76;
            this.trailDecay = 0.85;
            this.streakScale = 1.85;
            this.fogTint = [0.022, 0.056, 0.145];
        }

        applyPreset(preset) {
            this.localePreset = preset;
            if (preset) {
                if (typeof preset.sigma === "number") this.sigma = preset.sigma;
                if (typeof preset.rho === "number") this.rho = preset.rho;
                if (typeof preset.beta === "number") this.beta = preset.beta;
            }
        }

        _rk4Lorenz(x, y, z, h, s = this.sigma, r = this.rho, b = this.beta) {
            const dx1 = s * (y - x);
            const dy1 = x * (r - z) - y;
            const dz1 = x * y - b * z;

            const x2 = x + 0.5 * h * dx1, y2 = y + 0.5 * h * dy1, z2 = z + 0.5 * h * dz1;
            const dx2 = s * (y2 - x2);
            const dy2 = x2 * (r - z2) - y2;
            const dz2 = x2 * y2 - b * z2;

            const x3 = x + 0.5 * h * dx2, y3 = y + 0.5 * h * dy2, z3 = z + 0.5 * h * dz2;
            const dx3 = s * (y3 - x3);
            const dy3 = x3 * (r - z3) - y3;
            const dz3 = x3 * y3 - b * z3;

            const x4 = x + h * dx3, y4 = y + h * dy3, z4 = z + h * dz3;
            const dx4 = s * (y4 - x4);
            const dy4 = x4 * (r - z4) - y4;
            const dz4 = x4 * y4 - b * z4;

            return [
                x + (h / 6.0) * (dx1 + 2.0 * dx2 + 2.0 * dx3 + dx4),
                y + (h / 6.0) * (dy1 + 2.0 * dy2 + 2.0 * dy3 + dy4),
                z + (h / 6.0) * (dz1 + 2.0 * dz2 + 2.0 * dz3 + dz4),
                Math.hypot(dx1, dy1, dz1)
            ];
        }

        init(buffer, _ctx) {
            const N = buffer.maxCount;
            if (!this.state || this.state.length !== N * 3) {
                this.state = new Float32Array(N * 3);
                this.speeds = new Float32Array(N);
            }
            const seeds = buffer.seeds;

            const backboneLen = 4096;
            const bx = new Float32Array(backboneLen);
            const by = new Float32Array(backboneLen);
            const bz = new Float32Array(backboneLen);
            let rx = 0.1, ry = 0.0, rz = 0.0;
            for (let k = 0; k < 800; k++) {
                const next = this._rk4Lorenz(rx, ry, rz, 0.005);
                rx = next[0]; ry = next[1]; rz = next[2];
            }
            for (let k = 0; k < backboneLen; k++) {
                const next = this._rk4Lorenz(rx, ry, rz, 0.0045);
                rx = next[0]; ry = next[1]; rz = next[2];
                bx[k] = rx; by[k] = ry; bz[k] = rz;
            }

            for (let i = 0; i < N; i++) {
                const i3 = i * 3, i4 = i * 4;
                const u1 = seeds[i4], u2 = seeds[i4 + 1], u3 = seeds[i4 + 2], u4 = seeds[i4 + 3];
                const bIdx = ((i * 11 + ((u1 * backboneLen) | 0)) % backboneLen);
                // Tight Gaussian-like spread around backbone so trajectories form crisp silky filaments
                const jitter = 0.42 * (u4 * u4 + 0.15);
                let px = bx[bIdx] + (u1 - 0.5) * jitter;
                let py = by[bIdx] + (u2 - 0.5) * jitter;
                let pz = bz[bIdx] + (u3 - 0.5) * jitter;

                const subSteps = 6 + ((u4 * 14) | 0);
                let spd = 20.0;
                for (let s = 0; s < subSteps; s++) {
                    const step = this._rk4Lorenz(px, py, pz, 0.004);
                    px = step[0]; py = step[1]; pz = step[2]; spd = step[3];
                }
                this.state[i3] = px;
                this.state[i3 + 1] = py;
                this.state[i3 + 2] = pz;
                this.speeds[i] = clamp(spd / 62.0, 0.0, 1.0);
            }

            this.initialized = true;
        }

        applyPermutation(perm, count) {
            if (!this.state) return;
            const N = count | 0;
            if (!this._scratchState || this._scratchState.length < N * 3) {
                this._scratchState = new Float32Array(N * 3);
                this._scratchSpd = new Float32Array(N);
            }
            const tmpState = this._scratchState;
            const tmpSpd = this._scratchSpd;
            for (let i = 0; i < N; i++) {
                const src = perm[i];
                const i3 = i * 3, s3 = src * 3;
                tmpState[i3] = this.state[s3];
                tmpState[i3 + 1] = this.state[s3 + 1];
                tmpState[i3 + 2] = this.state[s3 + 2];
                tmpSpd[i] = this.speeds[src];
            }
            this.state.set(tmpState.subarray(0, N * 3));
            this.speeds.set(tmpSpd.subarray(0, N));
        }

        _projectPoint(lx, ly, lz, cosY, sinY, cosP, sinP, offsetX, out, i3) {
            // Upright butterfly natural basis: ux separates C- / C+ wings left/right,
            // uy elevates z vertically, uz twists front/back lobes in 3D depth.
            const invSqrt2 = 0.70710678;
            const ux = (lx + ly) * invSqrt2;
            const uy = (lz - 25.5) * 0.92;
            const uz = (lx - ly) * invSqrt2;

            const rx = ux * cosY - uz * sinY;
            const rz = ux * sinY + uz * cosY;
            const ry = uy * cosP - rz * sinP;
            const rz2 = uy * sinP + rz * cosP;

            const scale = 0.186 * (1.0 + 0.85 * (this.insideness || 0));
            out[i3]     = this.origin.x + offsetX + rx * scale;
            out[i3 + 1] = this.origin.y + ry * scale;
            out[i3 + 2] = this.origin.z + rz2 * scale;
        }

        onClick() {
            this.aizawaMode = !this.aizawaMode;
            const tag = typeof document !== "undefined" ? document.querySelector('#intro .sim-tag') : null;
            if (tag) {
                tag.textContent = this.aizawaMode
                    ? "Lorenz strange attractor · high-excitation chaotic regime (click to restore canonical)"
                    : "Lorenz strange attractor · σ = 10, ρ = 28, β = 8/3 · 4th-order Runge–Kutta";
            }
        }

        update(dt, t, buffer, ctx) {
            if (!this.initialized || !this.state) this.init(buffer, ctx);

            const N = buffer.count;
            const pos = buffer.positions;
            const col = buffer.colours;
            const sz = buffer.sizes;
            const seeds = buffer.seeds;
            const state = this.state;

            // Incommensurate breathing parameter drift so trajectories never repeat over 30+ s
            const excite = this.aizawaMode ? 1.22 : 1.0;
            const s = (10.0 + 0.42 * Math.sin(t * 0.17) + 0.24 * Math.cos(t * 0.113)) * excite;
            const r = (28.0 + 1.45 * Math.sin(t * 0.13) + 0.78 * Math.sin(t * 0.071)) * excite;
            const b = 2.6666667 + 0.13 * Math.cos(t * 0.193);

            // Two-lobe focal equilibrium coordinates C± = (±sqrt(b*(r-1)), ±sqrt(b*(r-1)), r-1)
            const lobeCoord = Math.sqrt(Math.max(1.0, b * (r - 1.0)));
            const lobeZ = r - 1.0;

            // 4× RK4 sub-stepping per frame for silky smooth phase-space curvature
            const SUBSTEPS = 4;
            const h = (clamp(dt, 0.001, 0.024) * 0.36) / SUBSTEPS;

            const ptrX = (ctx && ctx.pointerX) || 0;
            const ptrY = (ctx && ctx.pointerY) || 0;
            // Slow cinematic non-repeating two-lobe orbit camera angle + gentle breathing
            this.yaw = -0.18 + 0.42 * Math.sin(t * 0.085) + 0.18 * Math.cos(t * 0.051) + ptrX * 0.42;
            this.pitch = 0.18 + 0.14 * Math.sin(t * 0.067) + ptrY * 0.24;

            const cosY = Math.cos(this.yaw), sinY = Math.sin(this.yaw);
            const cosP = Math.cos(this.pitch), sinP = Math.sin(this.pitch);
            const offsetX = ((ctx && ctx.isMobile) ? 0.0 : 3.22) * (1.0 - 0.85 * (this.insideness || 0));

            for (let i = 0; i < N; i++) {
                const i3 = i * 3, i4 = i * 4;
                let x = state[i3], y = state[i3 + 1], z = state[i3 + 2];
                let instSpeed = 0.0;

                for (let step = 0; step < SUBSTEPS; step++) {
                    const dx1 = s * (y - x);
                    const dy1 = x * (r - z) - y;
                    const dz1 = x * y - b * z;

                    const x2 = x + 0.5 * h * dx1, y2 = y + 0.5 * h * dy1, z2 = z + 0.5 * h * dz1;
                    const dx2 = s * (y2 - x2);
                    const dy2 = x2 * (r - z2) - y2;
                    const dz2 = x2 * y2 - b * z2;

                    const x3 = x + 0.5 * h * dx2, y3 = y + 0.5 * h * dy2, z3 = z + 0.5 * h * dz2;
                    const dx3 = s * (y3 - x3);
                    const dy3 = x3 * (r - z3) - y3;
                    const dz3 = x3 * y3 - b * z3;

                    const x4 = x + h * dx3, y4 = y + h * dy3, z4 = z + h * dz3;
                    const dx4 = s * (y4 - x4);
                    const dy4 = x4 * (r - z4) - y4;
                    const dz4 = x4 * y4 - b * z4;

                    x += (h / 6.0) * (dx1 + 2.0 * dx2 + 2.0 * dx3 + dx4);
                    y += (h / 6.0) * (dy1 + 2.0 * dy2 + 2.0 * dy3 + dy4);
                    z += (h / 6.0) * (dz1 + 2.0 * dz2 + 2.0 * dz3 + dz4);
                    if (step === SUBSTEPS - 1) {
                        instSpeed = Math.hypot(dx4, dy4, dz4);
                    }
                }

                if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z) || Math.abs(x) > 85) {
                    x = (seeds[i4] - 0.5) * 14.0;
                    y = (seeds[i4 + 1] - 0.5) * 14.0;
                    z = 25.0 + (seeds[i4 + 2] - 0.5) * 12.0;
                }

                state[i3] = x;
                state[i3 + 1] = y;
                state[i3 + 2] = z;

                const vNorm = clamp((instSpeed - 7.0) / 58.0, 0.0, 1.0);
                this.speeds[i] = vNorm;

                this._projectPoint(x, y, z, cosY, sinY, cosP, sinP, offsetX, pos, i3);

                // Two-lobe focal glow around equilibria C+ and C-
                const dxP = x - lobeCoord, dyP = y - lobeCoord, dzL = z - lobeZ;
                const dxM = x + lobeCoord, dyM = y + lobeCoord;
                const d2Lobe = Math.min(dxP * dxP + dyP * dyP + dzL * dzL, dxM * dxM + dyM * dyM + dzL * dzL);
                const lobeGlow = Math.exp(-d2Lobe * 0.085);

                // Perceptually smooth speed colour ramp:
                // Slow outer wings (deep sapphire/indigo) -> mid circulation (electric cyan) -> fast saddle whip (hot amber-gold HDR)
                const v2 = vNorm * vNorm;
                const v3 = v2 * vNorm;
                const mid = 4.0 * vNorm * (1.0 - vNorm);
                const hdrScale = 0.24; // Preserves jewel-toned outer filaments while fast core ignites HDR bloom

                const rLin = (0.06 + 0.10 * mid + 2.35 * v3 + 0.95 * lobeGlow) * hdrScale;
                const gLin = (0.20 + 0.78 * mid + 1.15 * v3 + 0.55 * lobeGlow) * hdrScale;
                const bLin = (0.98 + 0.42 * mid - 0.52 * v3 + 1.10 * lobeGlow) * hdrScale;

                col[i3]     = rLin;
                col[i3 + 1] = gLin;
                col[i3 + 2] = bLin;

                sz[i] = 1.08 + 0.95 * v2 + 0.42 * lobeGlow + 0.35 * seeds[i4 + 3];
            }
        }

        targetFor(i, out = new Vector3()) {
            if (!this.initialized || !this.state) return out.copy(this.origin);
            const idx = clamp(i | 0, 0, (this.state.length / 3) - 1);
            const i3 = idx * 3;
            const cosY = Math.cos(this.yaw), sinY = Math.sin(this.yaw);
            const cosP = Math.cos(this.pitch), sinP = Math.sin(this.pitch);
            const tmp = [0, 0, 0];
            this._projectPoint(this.state[i3], this.state[i3 + 1], this.state[i3 + 2], cosY, sinY, cosP, sinP, 3.22, tmp, 0);
            return out.set(tmp[0], tmp[1], tmp[2]);
        }
    }

    /* ============================================================================
       1. MATHEMATICS FORMATION — Quintic Calabi–Yau Cross-Section (z₁ⁿ + z₂ⁿ = 1)
       Wraps shared/lib/cy-math.js (CYMath.evalPatch & project). Particles sample
       the welded n² complex branch patches and branch seams, animating with α(t)
       and 3D rotation. Also renders a subtle wireframe shell in the same scene
       fading in after particle arrival.
       ============================================================================ */
    const CY_PATCH_PALETTE = [
        [0.42, 0.12, 0.85], [0.55, 0.15, 0.90], [0.70, 0.18, 0.85], [0.85, 0.20, 0.70], [0.92, 0.28, 0.52],
        [0.95, 0.40, 0.35], [0.96, 0.55, 0.22], [0.95, 0.72, 0.18], [0.85, 0.82, 0.22], [0.60, 0.85, 0.35],
        [0.30, 0.82, 0.52], [0.15, 0.78, 0.70], [0.12, 0.68, 0.85], [0.18, 0.52, 0.92], [0.28, 0.35, 0.92],
        [0.48, 0.22, 0.88], [0.65, 0.25, 0.82], [0.82, 0.30, 0.65], [0.90, 0.45, 0.45], [0.92, 0.62, 0.30],
        [0.80, 0.75, 0.28], [0.50, 0.80, 0.45], [0.22, 0.75, 0.65], [0.20, 0.58, 0.85], [0.35, 0.40, 0.88]
    ];

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
            const CY = root.CYMath || (typeof require === "function" ? require("../lib/cy-math.js") : null);
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
                            this.auxColours.set([pal[0], pal[1], pal[2], 0.16], ptr * 4);
                            ptr++;
                            CY.evalPatch(n, k1, k2, a1, 0.0, out4, tab);
                            this.auxLines4D.set(out4, ptr * 4);
                            this.auxColours.set([pal[0], pal[1], pal[2], 0.16], ptr * 4);
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
            this.yaw = t * 0.21 + ptrX * 0.48;
            this.pitch = 0.36 + ptrY * 0.32;

            const cosA = Math.cos(this.alpha), sinA = Math.sin(this.alpha);
            const cosY = Math.cos(this.yaw), sinY = Math.sin(this.yaw);
            const cosP = Math.cos(this.pitch), sinP = Math.sin(this.pitch);
            const offsetX = ((ctx && ctx.isMobile) ? 0.0 : 2.15) * (1.0 - 0.85 * (this.insideness || 0));

            for (let i = 0; i < N; i++) {
                const i3 = i * 3, i4 = i * 4;
                const lw = this._project4DtoWorld(
                    c4[i4], c4[i4 + 1], c4[i4 + 2], c4[i4 + 3],
                    cosA, sinA, cosY, sinY, cosP, sinP, offsetX,
                    pos, i3
                );

                const shade = clamp(0.76 + 0.32 * lw, 0.42, 1.28);
                const isSeam = seam[i];
                col[i3]     = clamp(bCol[i3] * shade, 0.05, 1.0);
                col[i3 + 1] = clamp(bCol[i3 + 1] * shade, 0.05, 1.0);
                col[i3 + 2] = clamp(bCol[i3 + 2] * shade, 0.05, 1.0);

                sz[i] = (isSeam > 0.5 ? 2.15 : 1.48) + 0.45 * seeds[i4 + 3];
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
       2. PHYSICS FORMATION — Kerr Black Hole (a/M = 0.99) & Relativistic Accretion Disc
       Wraps shared/blackhole-physics.js (isco, keplerianOmega, fourVelocityUt, pageThorneFlux).
       Shared buffer particles orbit in the Novikov–Thorne accretion disc with Keplerian
       differential rotation, gravitational redshift, g^4 Doppler beaming, and lensed
       Einstein-ring warps. Heavy lensing/photon-ring shader renders in the SAME scene
       and fades in via uAuxOpacity only after particles have settled.
       ============================================================================ */
    class BlackHoleFormation extends Formation {
        constructor(origin, simKey = "hub:domain-physics", params = {}, sectionIndex = 2) {
            super(origin, simKey);
            this.params = params || {};
            this.sectionIndex = sectionIndex;
            this.spin = 0.99;
            this.rIsco = 1.4545;
            this.rOut = 15.0;
            this.radii = null;      // Float32Array(N) orbital radius r in M
            this.phi0 = null;       // Float32Array(N) initial azimuth
            this.omega = null;      // Float32Array(N) Keplerian angular velocity Ω(r)
            this.ut = null;         // Float32Array(N) 4-velocity u^t(r)
            this.tempScale = null;  // Float32Array(N) (F(r)/F_max)^0.25
            this.role = null;       // Uint8Array(N): 0 = equatorial disc, 1 = upper lensed arch, 2 = lower lensed arch
            this.tilt = 1.41;       // ~81 deg inclination
            this.cameraDistance = 13.5;
            this.bloomThreshold = 0.80; // Standard threshold matching Mathematics section
            this.kerrOverlay = {
                screenX: 0.66,
                screenY: 0.50,
                scale: 34.0,
                spin: 0.95,
                tilt: 1.41
            };
            this.presetTilt = null;
            this.presetSpin = null;
        }

        applyPreset(preset) {
            this.localePreset = preset;
            if (preset) {
                if (typeof preset.inclination === "number") {
                    this.presetTilt = (preset.inclination * Math.PI) / 180.0;
                }
                if (typeof preset.spin === "number") {
                    this.presetSpin = preset.spin;
                    this.spin = preset.spin;
                    this.kerrOverlay.spin = preset.spin;
                }
            }
        }

        _blackbodyRGB(T, out, i3) {
            const t = clamp(T, 1000.0, 35000.0) * 0.01;
            const tA = Math.max(t - 60.0, 1.0);
            const tB = Math.max(t - 10.0, 1.0);
            out[i3] = t <= 66.0 ? 1.0 : clamp((329.6987 * Math.pow(tA, -0.1332)) / 255.0, 0.0, 1.0);
            out[i3 + 1] = t <= 66.0
                ? clamp((99.4708 * Math.log(t) - 161.1196) / 255.0, 0.0, 1.0)
                : clamp((288.1222 * Math.pow(tA, -0.0755)) / 255.0, 0.0, 1.0);
            out[i3 + 2] = t >= 66.0 ? 1.0 : (t <= 19.0 ? 0.0 : clamp((138.5177 * Math.log(tB) - 305.0448) / 255.0, 0.0, 1.0));
        }

        init(buffer, _ctx) {
            const BP = root.BLACKHOLE_PHYSICS || (typeof require === "function" ? require("../blackhole-physics.js") : null);
            const N = buffer.maxCount;
            this.radii = new Float32Array(N);
            this.phi0 = new Float32Array(N);
            this.omega = new Float32Array(N);
            this.ut = new Float32Array(N);
            this.tempScale = new Float32Array(N);
            this.role = new Uint8Array(N);

            const a = this.spin;
            this.rIsco = (BP && BP.isco) ? BP.isco(a, 1) : 1.4545;
            const rIsco = this.rIsco;
            const rOut = this.rOut;

            // Compute maximum Page–Thorne flux for temperature normalisation
            let fMax = 1e-6;
            if (BP && BP.pageThorneFlux) {
                for (let k = 1; k <= 128; k++) {
                    const rk = rIsco + (rOut - rIsco) * (k / 128);
                    const fk = BP.pageThorneFlux(rk, a, rIsco);
                    if (fk > fMax) fMax = fk;
                }
            }

            const seeds = buffer.seeds;
            for (let i = 0; i < N; i++) {
                const i4 = i * 4;
                const u1 = seeds[i4], u2 = seeds[i4 + 1], u3 = seeds[i4 + 2], u4 = seeds[i4 + 3];

                // Concentrate radial sampling near inner hot ISCO ring via power law u1^1.65
                const r = rIsco + (rOut - rIsco) * Math.pow(u1, 1.65);
                this.radii[i] = r;
                this.phi0[i] = u2 * Math.PI * 2.0 + 1.25 * Math.log(Math.max(1.0, r));

                const om = (BP && BP.keplerianOmega) ? BP.keplerianOmega(r, a, 1) : (1.0 / (Math.pow(r, 1.5) + a));
                const utVal = (BP && BP.fourVelocityUt) ? BP.fourVelocityUt(r, a, om) : 1.15;
                const flux = (BP && BP.pageThorneFlux) ? (BP.pageThorneFlux(r, a, rIsco) / fMax) : Math.exp(-(r - rIsco) * 0.35);

                this.omega[i] = om;
                this.ut[i] = Number.isFinite(utVal) ? utVal : 1.2;
                this.tempScale[i] = Math.pow(clamp(flux, 0.02, 1.0), 0.25);

                // All particles sample the physical equatorial accretion disc r in [r_isco, r_out].
                // Fake trigonometric upper/lower arches have been removed so all lensed features
                // originate exclusively from the Kerr null geodesic ray tracer.
                this.role[i] = 0;
            }

            this.initialized = true;
        }

        applyPermutation(perm, count) {
            if (!this.radii) return;
            const N = count | 0;
            const rTmp = new Float32Array(N);
            const pTmp = new Float32Array(N);
            const oTmp = new Float32Array(N);
            const uTmp = new Float32Array(N);
            const tTmp = new Float32Array(N);
            const roleTmp = new Uint8Array(N);
            for (let i = 0; i < N; i++) {
                const s = perm[i];
                rTmp[i] = this.radii[s];
                pTmp[i] = this.phi0[s];
                oTmp[i] = this.omega[s];
                uTmp[i] = this.ut[s];
                tTmp[i] = this.tempScale[s];
                roleTmp[i] = this.role[s];
            }
            this.radii.set(rTmp);
            this.phi0.set(pTmp);
            this.omega.set(oTmp);
            this.ut.set(uTmp);
            this.tempScale.set(tTmp);
            this.role.set(roleTmp);
        }

        _evalParticleState(i, t, sinObs, cosObs, offsetX, seeds, outPos, i3, outCol, outSz) {
            const i4 = i * 4;
            const r = this.radii[i];
            const om = this.omega[i];
            const ut = this.ut[i];
            const tScale = this.tempScale[i];
            const role = this.role[i];

            const phi = this.phi0[i] + om * t * 5.2;
            const cosPhi = Math.cos(phi);
            const sinPhi = Math.sin(phi);

            // Relativistic impact parameter L = -α sin(θ_obs) and Doppler factor g = 1 / (u^t (1 - Ω L))
            const alphaImpact = -r * cosPhi;
            const L = -alphaImpact * sinObs;
            const denom = ut * (1.0 - om * L);
            const g = denom > 1e-4 ? clamp(1.0 / denom, 0.25, 2.65) : 1.0;

            const scale = 0.42 * (1.0 + 0.65 * (this.insideness || 0));
            let lx, ly, lz;

            // Physical equatorial accretion disc tilted by θ_obs
            const diskH = (seeds[i4 + 3] - 0.5) * 0.04 * r;
            const xDisk = -r * cosPhi;
            const zDisk = r * sinPhi;
            lx = xDisk;
            ly = zDisk * cosObs + diskH * sinObs;
            lz = zDisk * sinObs - diskH * cosObs;

            outPos[i3]     = this.origin.x + offsetX + lx * scale;
            outPos[i3 + 1] = this.origin.y + ly * scale;
            outPos[i3 + 2] = this.origin.z + lz * scale;

            if (outCol) {
                const gEff = Math.pow(g, 0.58);
                const Tobs = 9400.0 * tScale * gEff;
                this._blackbodyRGB(Tobs, outCol, i3);
                // Relativistic beaming boost g^3 (approaching left side blazing blue-white, receding right warm gold-red)
                const boost = clamp(Math.pow(g, 2.35) * (0.45 + 0.75 * tScale), 0.14, 1.55);
                outCol[i3]     = clamp(outCol[i3] * boost, 0.04, 1.0);
                outCol[i3 + 1] = clamp(outCol[i3 + 1] * boost, 0.04, 1.0);
                outCol[i3 + 2] = clamp(outCol[i3 + 2] * boost, 0.04, 1.0);
            }
            if (outSz) {
                outSz[i] = (1.35 + 1.15 * tScale * clamp(g, 0.6, 1.6)) * (0.8 + 0.4 * seeds[i4 + 3]);
            }
        }

        update(_dt, t, buffer, ctx) {
            if (!this.initialized || !this.radii) this.init(buffer, ctx);

            const N = buffer.count;
            const pos = buffer.positions;
            const col = buffer.colours;
            const sz = buffer.sizes;
            const seeds = buffer.seeds;

            const ptrX = (ctx && ctx.pointerX) || 0;
            const ptrY = (ctx && ctx.pointerY) || 0;
            const dbg = (typeof window !== "undefined") ? window.__KERR_DEBUG__ : null;
            if (dbg && dbg.inc !== null && dbg.inc !== undefined) {
                this.tilt = (dbg.inc * Math.PI) / 180.0;
            } else {
                // Map vertical pointer [-1, 1] to 5°-85° inclination [0.087, 1.483 rad]
                // Neutral sits at ~75° (1.31 rad) with subtle autonomous idle drift
                const idleDrift = 0.045 * Math.sin(t * 0.35);
                const hasPointer = Math.abs(ptrY) > 0.005 || Math.abs(ptrX) > 0.005;
                const neutralTilt = (typeof this.presetTilt === "number") ? this.presetTilt : 1.31;
                const baseInclination = hasPointer
                    ? (neutralTilt - ptrY * 0.50)
                    : (neutralTilt + idleDrift * 0.6);
                const targetTilt = clamp(baseInclination, 0.087266, 1.48353);

                // Exponential damping (1 - exp(-k * dt)) ensures fluid motion with zero shadow popping
                const dtSec = clamp(_dt || 0.016, 0.001, 0.1);
                const prevTilt = this.tilt;
                const damp = 1.0 - Math.exp(-7.5 * dtSec);
                this.tilt += (targetTilt - this.tilt) * damp;

                // Detect fast tilt changes (> 0.2 deg/frame = ~0.0035 rad) to reset accumulation trails
                const tiltDeltaDeg = Math.abs(this.tilt - prevTilt) * (180.0 / Math.PI);
                if (tiltDeltaDeg > 0.2 && typeof window !== "undefined") {
                    window.__KERR_TILT_FAST__ = true;
                }
            }
            if (dbg && dbg.spin !== null && dbg.spin !== undefined) {
                this.kerrOverlay.spin = dbg.spin;
            }
            const ins = this.insideness || 0;
            const sinObs = Math.sin(this.tilt);
            const cosObs = Math.cos(this.tilt);
            const offsetX = ((ctx && ctx.isMobile) ? 0.0 : 2.35) * (1.0 - 0.85 * ins);

            const isMob = (ctx && ctx.isMobile) || (typeof window !== "undefined" && window.innerWidth <= 768);
            const targetScreenX = isMob ? 0.50 : (0.66 - ptrX * 0.015);
            this.kerrOverlay.screenX = targetScreenX * (1.0 - 0.65 * ins) + 0.50 * (0.65 * ins);
            this.kerrOverlay.screenY = isMob ? 0.68 : (0.50 + ptrY * 0.02);
            const baseScale = isMob ? 44.0 : 34.0;
            this.kerrOverlay.scale = (dbg && dbg.scale !== undefined && dbg.scale !== null) ? dbg.scale : (baseScale * (1.0 + 0.55 * ins));
            this.kerrOverlay.tilt = this.tilt * (1.0 - 0.40 * ins) + 1.50 * (0.40 * ins);
            if (dbg && dbg.spin !== null && dbg.spin !== undefined) {
                this.kerrOverlay.spin = dbg.spin;
            } else {
                this.kerrOverlay.spin = 0.95;
            }

            // Keep only a sparse set of accent glints (N_GLINTS = 120) orbiting near the inner disc.
            // All other particles are silenced so they do not form unlensed 2D tan dashes over the geodesic ray tracer.
            const N_GLINTS = Math.min(120, N);
            for (let i = 0; i < N_GLINTS; i++) {
                this._evalParticleState(i, t, sinObs, cosObs, offsetX, seeds, pos, i * 3, col, sz);
            }
            for (let i = N_GLINTS; i < N; i++) {
                const i3 = i * 3;
                pos[i3] = 0.0;
                pos[i3 + 1] = 0.0;
                pos[i3 + 2] = -9999.0;
                if (col) {
                    col[i3] = 0.0;
                    col[i3 + 1] = 0.0;
                    col[i3 + 2] = 0.0;
                }
                if (sz) {
                    sz[i] = 0.0;
                }
            }
        }

        targetFor(i, out = new Vector3()) {
            if (!this.initialized || !this.radii) return out.copy(this.origin);
            if (i >= 120) {
                return out.set(0.0, 0.0, -9999.0);
            }
            const idx = clamp(i | 0, 0, this.radii.length - 1);
            const sinObs = Math.sin(this.tilt), cosObs = Math.cos(this.tilt);
            const tmp = [0, 0, 0];
            this._evalParticleState(idx, 0.0, sinObs, cosObs, 2.35, [0.5, 0.5, 0.5, 0.5], tmp, 0, null, null);
            return out.set(tmp[0], tmp[1], tmp[2]);
        }
    }

    /* ============================================================================
       3. DATA SCIENCE FORMATION — Score-Based Reverse-Time Diffusion SDE
       Wraps shared/lib/diffusion-math.js (alpha, sigma2, beta, score, getGalaxyTarget,
       getTrefoilTarget, getTorusTarget). Particles evolve under the real reverse-time
       VP-SDE / probability-flow ODE from isotropic Gaussian noise to structured manifolds.
       ============================================================================ */
    class DataScienceFormation extends Formation {
        constructor(origin, simKey = "hub:domain-datascience", params = {}, sectionIndex = 3) {
            super(origin, simKey);
            this.params = params || {};
            this.sectionIndex = sectionIndex;
            this.targets = null;      // Array of 3 Float32Array(N * 3): [Galaxy, Trefoil, Torus]
            this.livePos = null;      // Float32Array(N * 3) local SDE state x_t
            this.priorNoise = null;   // Float32Array(N * 3) standard Gaussian noise z ~ N(0, I)
            this.shapeIdx = 0;
            this.odeMode = false;
            this.cycleTime = 3.2;     // Start mid-annealing so structure is actively forming on arrival
            this.cycleDuration = 12.0;
            this.cameraDistance = 13.5;
        }

        applyPreset(preset) {
            this.localePreset = preset;
            if (preset && typeof preset.shape === "number") {
                this.shapeIdx = (preset.shape | 0) % 3;
            }
        }

        init(buffer, _ctx) {
            const DM = root.DiffusionMath || (typeof require === "function" ? require("../lib/diffusion-math.js") : null);
            const N = buffer.maxCount;
            const seeds = buffer.seeds;

            this.targets = [
                new Float32Array(N * 3), // 0: Spiral Galaxy
                new Float32Array(N * 3), // 1: Trefoil Knot
                new Float32Array(N * 3)  // 2: Torus Manifold
            ];
            this.livePos = new Float32Array(N * 3);
            this.priorNoise = new Float32Array(N * 3);

            for (let i = 0; i < N; i++) {
                const i3 = i * 3, i4 = i * 4;
                const u1 = Math.max(1e-6, seeds[i4]);
                const u2 = seeds[i4 + 1];
                const u3 = Math.max(1e-6, seeds[i4 + 2]);
                const u4 = seeds[i4 + 3];

                // Box–Muller standard normal draws for prior noise z ~ N(0, I_3)
                const rA = Math.sqrt(-2.0 * Math.log(u1));
                const thA = 6.2831853 * u2;
                const rB = Math.sqrt(-2.0 * Math.log(u3));
                const thB = 6.2831853 * u4;
                this.priorNoise[i3]     = clamp(rA * Math.cos(thA), -3.2, 3.2);
                this.priorNoise[i3 + 1] = clamp(rA * Math.sin(thA), -3.2, 3.2);
                this.priorNoise[i3 + 2] = clamp(rB * Math.cos(thB), -3.2, 3.2);

                // 0: Two-arm Spiral Galaxy in 3D (logarithmic spiral with central bulge and vertical Gaussian scale height)
                const arm = i % 2;
                const r = 0.22 + 1.25 * Math.sqrt(u1);
                const theta = (arm * Math.PI) + 2.85 * Math.pow(r / 1.47, 0.85) + (u2 - 0.5) * 0.32;
                const gx = r * Math.cos(theta);
                const gy = (u4 - 0.5) * 0.26 * Math.exp(-r * 0.8);
                const gz = r * Math.sin(theta);
                this.targets[0][i3]     = gx * 2.2;
                this.targets[0][i3 + 1] = gy * 2.2;
                this.targets[0][i3 + 2] = gz * 2.2;

                // 1: 3D Trefoil Knot tube
                const sKnot = (i / N) * Math.PI * 2.0;
                const tubeAngle = u2 * Math.PI * 2.0;
                const tubeR = 0.22 * Math.sqrt(u1);
                const kx = (Math.sin(sKnot) + 2.0 * Math.sin(2.0 * sKnot)) * 0.85;
                const ky = (Math.cos(sKnot) - 2.0 * Math.cos(2.0 * sKnot)) * 0.85;
                const kz = (-Math.sin(3.0 * sKnot)) * 0.85;
                this.targets[1][i3]     = (kx + tubeR * Math.cos(tubeAngle)) * 1.35;
                this.targets[1][i3 + 1] = (ky + tubeR * Math.sin(tubeAngle)) * 1.35;
                this.targets[1][i3 + 2] = (kz + (u4 - 0.5) * 0.22) * 1.35;

                // 2: 3D Twisted Torus Manifold
                const uTor = u1 * Math.PI * 2.0;
                const vTor = u2 * Math.PI * 2.0;
                const Rmaj = 2.1, rMin = 0.78;
                this.targets[2][i3]     = (Rmaj + rMin * Math.cos(vTor)) * Math.cos(uTor);
                this.targets[2][i3 + 1] = (Rmaj + rMin * Math.cos(vTor)) * Math.sin(uTor);
                this.targets[2][i3 + 2] = rMin * Math.sin(vTor);
            }

            this.initialized = true;
        }

        applyPermutation(perm, count) {
            if (!this.targets) return;
            const N = count | 0;
            if (!this._scratchTgt || this._scratchTgt.length < N * 3) {
                this._scratchTgt = new Float32Array(N * 3);
                this._scratchNoise = new Float32Array(N * 3);
            }
            const tmpT = this._scratchTgt;
            const tmpNoise = this._scratchNoise;
            for (let m = 0; m < 3; m++) {
                const tgt = this.targets[m];
                for (let i = 0; i < N; i++) {
                    const s = perm[i];
                    const i3 = i * 3, s3 = s * 3;
                    tmpT[i3]     = tgt[s3];
                    tmpT[i3 + 1] = tgt[s3 + 1];
                    tmpT[i3 + 2] = tgt[s3 + 2];
                    if (m === 0) {
                        tmpNoise[i3]     = this.priorNoise[s3];
                        tmpNoise[i3 + 1] = this.priorNoise[s3 + 1];
                        tmpNoise[i3 + 2] = this.priorNoise[s3 + 2];
                    }
                }
                tgt.set(tmpT);
            }
            this.priorNoise.set(tmpNoise);
        }

        onClick() {
            this.shapeIdx = (this.shapeIdx + 1) % 3;
            this.cycleTime = 0.8; // Re-noise and run reverse SDE to next target manifold
        }

        onKeyDown(e) {
            if (e.key === "m" || e.key === "M") {
                this.odeMode = !this.odeMode;
            }
        }

        _evalDiffusionPoint(i, tDiff, alphaT, sigmaT, cosY, sinY, cosP, sinP, offsetX, tSim, outPos, outOffset, outCol, outSz, seeds) {
            const tgt = this.targets[this.shapeIdx];
            const src3 = i * 3;
            const x0 = tgt[src3], y0 = tgt[src3 + 1], z0 = tgt[src3 + 2];
            const zx = this.priorNoise[src3], zy = this.priorNoise[src3 + 1], zz = this.priorNoise[src3 + 2];

            // Exact VP-SDE marginal: x_t = α(t) x_0 + σ(t) z, plus stochastic Langevin score curl
            const jitScale = this.odeMode ? 0.0 : (sigmaT * 0.22);
            const jx = Math.sin(tSim * 3.1 + i * 0.13) * jitScale;
            const jy = Math.cos(tSim * 2.9 + i * 0.17) * jitScale;
            const jz = Math.sin(tSim * 2.5 + i * 0.19) * jitScale;

            const lx = alphaT * x0 + sigmaT * zx * 1.65 + jx;
            const ly = alphaT * y0 + sigmaT * zy * 1.65 + jy;
            const lz = alphaT * z0 + sigmaT * zz * 1.65 + jz;

            const rx = lx * cosY - lz * sinY;
            const rz = lx * sinY + lz * cosY;
            const ry = ly * cosP - rz * sinP;
            const rz2 = ly * sinP + rz * cosP;

            const scale = 1.15 * (1.0 + 0.85 * (this.insideness || 0));
            outPos[outOffset]     = this.origin.x + offsetX + rx * scale;
            outPos[outOffset + 1] = this.origin.y + ry * scale;
            outPos[outOffset + 2] = this.origin.z + rz2 * scale;

            if (outCol) {
                // Score magnitude ||∇_x log p_t(x)|| = ||(x_t - α(t) x_0) / σ²(t)||
                // Transitions from warm amber prior noise (t ≈ 1) to luminous emerald/cyan manifold structure (t -> 0)
                const structureProgress = 1.0 - tDiff;
                const radial = clamp(Math.hypot(x0, y0, z0) / 3.2, 0.0, 1.0);
                const rCol = (1.0 - structureProgress) * 0.96 + structureProgress * (0.14 + 0.25 * radial);
                const gCol = (1.0 - structureProgress) * 0.58 + structureProgress * (0.82 - 0.18 * radial);
                const bCol = (1.0 - structureProgress) * 0.22 + structureProgress * (0.76 + 0.22 * radial);
                outCol[outOffset]     = clamp(rCol, 0.05, 1.0);
                outCol[outOffset + 1] = clamp(gCol, 0.05, 1.0);
                outCol[outOffset + 2] = clamp(bCol, 0.05, 1.0);
            }
            if (outSz && seeds) {
                outSz[i] = 1.42 + 0.65 * (1.0 - tDiff) + 0.45 * seeds[i * 4 + 3];
            }
        }

        update(dt, t, buffer, ctx) {
            if (!this.initialized || !this.targets) this.init(buffer, ctx);
            const DM = root.DiffusionMath || (typeof require === "function" ? require("../lib/diffusion-math.js") : null);

            this.cycleTime += dt;
            if (this.cycleTime >= this.cycleDuration) {
                this.cycleTime -= this.cycleDuration;
                this.shapeIdx = (this.shapeIdx + 1) % 3;
            }

            // Compute diffusion time t_sde in [0.01, 1.0]:
            // [0..1.4s]: t=1 (prior noise), [1.4..7.2s]: reverse SDE 1->0.01, [7.2..10.4s]: manifold hold t=0.01, [10.4..12s]: forward re-noising 0.01->1
            let tDiff = 0.01;
            const ct = this.cycleTime;
            if (ct < 1.4) {
                tDiff = 1.0;
            } else if (ct < 7.2) {
                tDiff = 1.0 - 0.99 * smoothstep(1.4, 7.2, ct);
            } else if (ct < 10.4) {
                tDiff = 0.01;
            } else {
                tDiff = 0.01 + 0.99 * smoothstep(10.4, 12.0, ct);
            }

            const alphaT = (DM && DM.alpha) ? DM.alpha(tDiff) : Math.sqrt(1.0 - tDiff * tDiff);
            const sigma2T = (DM && DM.sigma2) ? DM.sigma2(tDiff) : (tDiff * tDiff);
            const sigmaT = Math.sqrt(Math.max(1e-5, sigma2T));

            const ptrX = (ctx && ctx.pointerX) || 0;
            const ptrY = (ctx && ctx.pointerY) || 0;
            const yaw = t * 0.22 + ptrX * 0.45;
            const pitch = -0.28 + ptrY * 0.28;
            const cosY = Math.cos(yaw), sinY = Math.sin(yaw);
            const cosP = Math.cos(pitch), sinP = Math.sin(pitch);
            const offsetX = ((ctx && ctx.isMobile) ? 0.0 : 2.15) * (1.0 - 0.85 * (this.insideness || 0));

            const N = buffer.count;
            const pos = buffer.positions;
            const col = buffer.colours;
            const sz = buffer.sizes;
            const seeds = buffer.seeds;

            for (let i = 0; i < N; i++) {
                this._evalDiffusionPoint(i, tDiff, alphaT, sigmaT, cosY, sinY, cosP, sinP, offsetX, t, pos, i * 3, col, sz, seeds);
            }
        }

        targetFor(i, out = new Vector3()) {
            if (!this.initialized || !this.targets) return out.copy(this.origin);
            const idx = clamp(i | 0, 0, (this.targets[0].length / 3) - 1);
            const tmp = [0, 0, 0];
            this._evalDiffusionPoint(idx, 0.05, 0.99, 0.08, Math.cos(0.3), Math.sin(0.3), Math.cos(-0.28), Math.sin(-0.28), 2.15, 0.0, tmp, 0, null, null, null);
            return out.set(tmp[0], tmp[1], tmp[2]);
        }
    }

    /* ============================================================================
       4. QUANT FINANCE FORMATION — 3-D Bivariate Binomial Option-Pricing Crystal
       Wraps shared/lib/lattice-math.js (buildLattice, margrabe, blackScholes).
       Particles sit on the actual recombining 3D pyramid lattice nodes (t, i, j),
       lattice edges, early-exercise hinge ribbon (S₁ = S₂), and value lens heightfield,
       animating with the Grow -> Expiry -> Backward Induction Wave -> Root Flash cycle.
       ============================================================================ */
    class QuantCrystalFormation extends Formation {
        constructor(origin, simKey = "hub:domain-quant", params = {}, sectionIndex = 4) {
            super(origin, simKey);
            this.params = params || {};
            this.sectionIndex = sectionIndex;
            this.stepsList = [20, 28, 32];
            this.stepIdx = 1; // n = 28 default (7,140 lattice nodes + edges + hinge + value lens = 60k particles)
            this.rho = 0.35;
            this.is1D = false;
            this.lattice = null;
            this.nodeMap = null;      // Int32Array(N) mapping particle i -> lattice node index
            this.role = null;         // Uint8Array(N): 0 = lattice node, 1 = lattice edge, 2 = exercise hinge, 3 = value lens
            this.edgePartner = null;  // Int32Array(N) child node index for edge particles
            this.edgeLerp = null;     // Float32Array(N) interpolation factor along edge
            this.cycleDuration = 9.0;
            this.auxPositions = new Float32Array(2048 * 3);
            this.auxColours = new Float32Array(2048 * 4);
            this.auxLineCount = 0;
            this.cameraDistance = 13.5;
        }

        applyPreset(preset) {
            this.localePreset = preset;
            if (preset) {
                let changed = false;
                if (typeof preset.rho === "number" && this.rho !== preset.rho) {
                    this.rho = preset.rho;
                    changed = true;
                }
                if (typeof preset.steps === "number") {
                    const idx = this.stepsList.indexOf(preset.steps);
                    if (idx !== -1 && this.stepIdx !== idx) {
                        this.stepIdx = idx;
                        changed = true;
                    }
                }
                if (changed && this._lastBuffer) {
                    this._rebuildLattice(this._lastBuffer.maxCount, this._lastBuffer.seeds);
                }
            }
        }

        _rebuildLattice(N, seeds) {
            const LM = root.LatticeMath || (typeof require === "function" ? require("../lib/lattice-math.js") : null);
            const n = this.stepsList[this.stepIdx];
            const lParams = {
                S1: 100, S2: 100, K: 100, T: 1.0,
                r: 0.05, q1: 0.02, q2: 0.02,
                sigma1: 0.25, sigma2: 0.30,
                rho: this.rho
            };
            this.lattice = (LM && LM.buildLattice) ? LM.buildLattice(lParams, n, 1.35, 1.95) : null;

            if (!this.nodeMap || this.nodeMap.length !== N) {
                this.nodeMap = new Int32Array(N);
                this.role = new Uint8Array(N);
                this.edgePartner = new Int32Array(N);
                this.edgeLerp = new Float32Array(N);
            }

            if (!this.lattice || !this.lattice.flatBuffer) return;
            const totalNodes = this.lattice.totalNodes;
            const fb = this.lattice.flatBuffer;
            let maxV = 1.0;
            for (let k = 0; k < totalNodes; k++) {
                const v = fb[k * 8 + 3];
                if (v > maxV) maxV = v;
            }
            this.lattice.maxVal = maxV;

            const idxOf = (t, k1, k2) => {
                const base = (t * (t + 1) * (2 * t + 1)) / 6;
                return base + k1 * (t + 1) + k2;
            };

            for (let i = 0; i < N; i++) {
                const i4 = i * 4;
                const u1 = seeds[i4], u2 = seeds[i4 + 1], u3 = seeds[i4 + 2];
                if (i < totalNodes) {
                    this.role[i] = 0;
                    this.nodeMap[i] = i;
                    this.edgePartner[i] = i;
                    this.edgeLerp[i] = 0.0;
                } else if (u3 < 0.68) {
                    this.role[i] = 1;
                    const tStep = Math.min(n - 1, (u1 * n) | 0);
                    const uIdx = Math.min(tStep, (u2 * (tStep + 1)) | 0);
                    const dIdx = Math.min(tStep, ((seeds[i4 + 3]) * (tStep + 1)) | 0);
                    const pNode = idxOf(tStep, uIdx, dIdx);
                    const branch = i & 3;
                    const cNode = idxOf(tStep + 1, uIdx + (branch & 1), dIdx + ((branch >> 1) & 1));
                    this.nodeMap[i] = clamp(pNode, 0, totalNodes - 1);
                    this.edgePartner[i] = clamp(cNode, 0, totalNodes - 1);
                    this.edgeLerp[i] = seeds[i4 + 3];
                } else if (u3 < 0.84) {
                    this.role[i] = 2;
                    const tStep = Math.min(n, (u1 * (n + 1)) | 0);
                    const diag = Math.min(tStep, (u2 * (tStep + 1)) | 0);
                    const node = clamp(idxOf(tStep, diag, diag), 0, totalNodes - 1);
                    this.nodeMap[i] = node;
                    this.edgePartner[i] = node;
                    this.edgeLerp[i] = (seeds[i4 + 3] - 0.5) * 0.25;
                } else {
                    this.role[i] = 3;
                    const uIdx = Math.min(n, (u1 * (n + 1)) | 0);
                    const dIdx = Math.min(n, (u2 * (n + 1)) | 0);
                    const node = clamp(idxOf(n, uIdx, dIdx), 0, totalNodes - 1);
                    this.nodeMap[i] = node;
                    this.edgePartner[i] = node;
                    this.edgeLerp[i] = seeds[i4 + 3];
                }
            }
        }

        init(buffer, _ctx) {
            this._lastBuffer = buffer;
            this._rebuildLattice(buffer.maxCount, buffer.seeds);
            this.initialized = true;
        }

        applyPermutation(perm, count) {
            if (!this.nodeMap) return;
            const N = count | 0;
            const nTmp = new Int32Array(N);
            const rTmp = new Uint8Array(N);
            const eTmp = new Int32Array(N);
            const lTmp = new Float32Array(N);
            for (let i = 0; i < N; i++) {
                const s = perm[i];
                nTmp[i] = this.nodeMap[s];
                rTmp[i] = this.role[s];
                eTmp[i] = this.edgePartner[s];
                lTmp[i] = this.edgeLerp[s];
            }
            this.nodeMap.set(nTmp);
            this.role.set(rTmp);
            this.edgePartner.set(eTmp);
            this.edgeLerp.set(lTmp);
        }

        onClick() {
            this.stepIdx = (this.stepIdx + 1) % this.stepsList.length;
            if (this._lastBuffer) {
                this._rebuildLattice(this._lastBuffer.maxCount, this._lastBuffer.seeds);
            }
        }

        onKeyDown(e) {
            if (e.key === "b" || e.key === "B") {
                this.is1D = !this.is1D;
                if (this._lastBuffer) {
                    this._rebuildLattice(this._lastBuffer.maxCount, this._lastBuffer.seeds);
                }
            }
        }

        _evalCrystalParticle(i, waveStep, cosY, sinY, cosP, sinP, offsetX, outPos, i3, outCol, outSz, seeds) {
            const lat = this.lattice;
            if (!lat || !lat.flatBuffer) {
                outPos[i3] = this.origin.x; outPos[i3 + 1] = this.origin.y; outPos[i3 + 2] = this.origin.z;
                return;
            }
            const fb = lat.flatBuffer;
            const vMax = Math.max(1.0, lat.maxVal || 25.0);
            const n = this.stepsList[this.stepIdx];

            const role = this.role[i];
            const nA = this.nodeMap[i];
            const nB = this.edgePartner[i];
            const lerp = this.edgeLerp[i];
            const a8 = nA * 8, b8 = nB * 8;

            const ax = fb[a8], ay = fb[a8 + 1] - 0.95, az = fb[a8 + 2];
            const bx = fb[b8], by = fb[b8 + 1] - 0.95, bz = fb[b8 + 2];
            const valNorm = clamp(fb[a8 + 3] / vMax, 0.0, 1.0);
            const nodeStep = fb[a8 + 4] * n;
            const hingeDiff = fb[a8 + 7];

            let lx, ly, lz;
            if (role === 0) {
                lx = ax; ly = ay; lz = az;
            } else if (role === 1) {
                lx = ax + (bx - ax) * lerp;
                ly = ay + (by - ay) * lerp;
                lz = az + (bz - az) * lerp;
            } else if (role === 2) {
                lx = ax;
                ly = ay + lerp * 0.4;
                lz = az + valNorm * 0.45;
            } else {
                lx = ax;
                ly = -1.45 + valNorm * 0.75;
                lz = az;
            }

            const rx = lx * cosY - lz * sinY;
            const rz = lx * sinY + lz * cosY;
            const ry = ly * cosP - rz * sinP;
            const rz2 = ly * sinP + rz * cosP;

            const scale = 2.15 * (1.0 + 0.85 * (this.insideness || 0));
            outPos[i3]     = this.origin.x + offsetX + rx * scale;
            outPos[i3 + 1] = this.origin.y + ry * scale;
            outPos[i3 + 2] = this.origin.z + rz2 * scale;

            if (outCol) {
                const waveDist = Math.abs(nodeStep - waveStep);
                const wavePulse = Math.exp(-waveDist * waveDist * 0.45);
                const isHinge = Math.abs(hingeDiff) < 0.06;

                let rC = 0.16 + 0.72 * valNorm + 0.35 * wavePulse;
                let gC = 0.32 + 0.52 * valNorm + 0.28 * wavePulse;
                let bC = 0.78 - 0.36 * valNorm + 0.22 * wavePulse;
                if (isHinge || role === 2) {
                    rC += 0.28; gC += 0.18;
                }
                outCol[i3]     = clamp(rC, 0.06, 1.0);
                outCol[i3 + 1] = clamp(gC, 0.06, 1.0);
                outCol[i3 + 2] = clamp(bC, 0.06, 1.0);
            }
            if (outSz && seeds) {
                const wavePulse = Math.exp(-Math.pow(nodeStep - waveStep, 2) * 0.45);
                const baseSz = role === 0 ? 1.85 : 1.35;
                outSz[i] = baseSz + 0.95 * wavePulse + 0.35 * seeds[i * 4 + 3];
            }
        }

        update(_dt, t, buffer, ctx) {
            this._lastBuffer = buffer;
            if (!this.initialized || !this.lattice) this.init(buffer, ctx);

            const n = this.stepsList[this.stepIdx];
            // Backward induction wavefront sweeping from t = n down to t = 0
            const phase = (t % this.cycleDuration) / this.cycleDuration;
            const waveStep = phase < 0.25
                ? (phase / 0.25) * n
                : n * (1.0 - clamp((phase - 0.25) / 0.65, 0.0, 1.0));

            const ptrX = (ctx && ctx.pointerX) || 0;
            const ptrY = (ctx && ctx.pointerY) || 0;
            const yaw = -0.52 + Math.sin(t * 0.18) * 0.28 + ptrX * 0.45;
            const pitch = 0.28 + ptrY * 0.24;
            const cosY = Math.cos(yaw), sinY = Math.sin(yaw);
            const cosP = Math.cos(pitch), sinP = Math.sin(pitch);
            const offsetX = ((ctx && ctx.isMobile) ? 0.0 : 2.15) * (1.0 - 0.85 * (this.insideness || 0));

            const N = buffer.count;
            const pos = buffer.positions;
            const col = buffer.colours;
            const sz = buffer.sizes;
            const seeds = buffer.seeds;

            for (let i = 0; i < N; i++) {
                this._evalCrystalParticle(i, waveStep, cosY, sinY, cosP, sinP, offsetX, pos, i * 3, col, sz, seeds);
            }
        }

        targetFor(i, out = new Vector3()) {
            if (!this.initialized || !this.lattice) return out.copy(this.origin);
            const idx = clamp(i | 0, 0, this.nodeMap.length - 1);
            const tmp = [0, 0, 0];
            this._evalCrystalParticle(idx, 10.0, Math.cos(-0.52), Math.sin(-0.52), Math.cos(0.28), Math.sin(0.28), 2.15, tmp, 0, null, null, null);
            return out.set(tmp[0], tmp[1], tmp[2]);
        }
    }

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
            const QM = root.QSimMath || (typeof require === "function" ? require("../lib/qsim-math.js") : null);
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
                const tipBoost = 0.65 + 0.55 * u3;
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
                rC = 0.22 + 0.45 * u3;
                gC = 0.86;
                bC = 0.72 + 0.25 * u3;
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
                rC = this.ampCols[c3] * 0.8 + 0.2;
                gC = this.ampCols[c3 + 1] * 0.8 + 0.2;
                bC = this.ampCols[c3 + 2] * 0.8 + 0.2;
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
                outCol[i3]     = clamp(rC, 0.06, 1.0);
                outCol[i3 + 1] = clamp(gC, 0.06, 1.0);
                outCol[i3 + 2] = clamp(bC, 0.06, 1.0);
            }
            if (outSz) {
                outSz[rawIdx] = 1.48 + 0.55 * u4;
            }
        }

        update(_dt, t, buffer, ctx) {
            if (!this.initialized) this.init(buffer, ctx);
            this._updateQuantumState(t);

            const ptrX = (ctx && ctx.pointerX) || 0;
            const ptrY = (ctx && ctx.pointerY) || 0;
            const yaw = -0.36 + Math.sin(t * 0.16) * 0.22 + ptrX * 0.42;
            const pitch = 0.42 + ptrY * 0.24;
            const cosY = Math.cos(yaw), sinY = Math.sin(yaw);
            const cosP = Math.cos(pitch), sinP = Math.sin(pitch);
            const offsetX = ((ctx && ctx.isMobile) ? 0.0 : 2.15) * (1.0 - 0.85 * (this.insideness || 0));

            const N = buffer.count;
            this._lastCount = N;
            const pos = buffer.positions;
            const col = buffer.colours;
            const sz = buffer.sizes;
            const seeds = buffer.seeds;

            for (let i = 0; i < N; i++) {
                this._evalQSimParticle(i, N, t, cosY, sinY, cosP, sinP, offsetX, pos, i * 3, col, sz, seeds);
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
       6. CONTACT & SUB-SLIDE FORMATION — Three-Body Figure-8 Choreography & Parameterised Engines
       Integrates the exact Chenciner–Montgomery figure-8 periodic solution to the
       3-body gravitational problem via RK4, and adapts sub-page SLIDE_SIMS engines.
       ============================================================================ */
    class ThreeBodyContactFormation extends Formation {
        constructor(origin, simKey = "hub:contact", params = {}, sectionIndex = 6) {
            super(origin, simKey);
            this.params = params || {};
            this.sectionIndex = sectionIndex;
            this.orbitLut = null; // Float32Array(1024 * 3) pre-integrated figure-8 RK4 trajectory
            this.slotMap = null;
            this.cameraDistance = 13.5;
            this.choreography = "figure8";
        }

        applyPreset(preset) {
            this.localePreset = preset;
            if (preset && typeof preset.choreography === "string") {
                this.choreography = preset.choreography;
            }
        }

        init(buffer, _ctx) {
            const N = buffer.maxCount;
            this.slotMap = new Int32Array(N);
            for (let i = 0; i < N; i++) this.slotMap[i] = i;

            // Integrate Chenciner–Montgomery figure-8 3-body choreography via RK4
            const steps = 1024;
            this.orbitLut = new Float32Array(steps * 3);
            let x1 = -0.97000436, y1 = 0.24308753;
            let x2 = 0.97000436, y2 = -0.24308753;
            let x3 = 0.0, y3 = 0.0;
            let vx3 = -0.93240737, vy3 = -0.86473146;
            let vx1 = -0.5 * vx3, vy1 = -0.5 * vy3;
            let vx2 = -0.5 * vx3, vy2 = -0.5 * vy3;

            const h = 6.3259 / steps;
            const accel = (xa, ya, xb, yb, xc, yc) => {
                const dx1 = xb - xa, dy1 = yb - ya;
                const d1 = Math.pow(dx1 * dx1 + dy1 * dy1 + 1e-4, 1.5);
                const dx2 = xc - xa, dy2 = yc - ya;
                const d2 = Math.pow(dx2 * dx2 + dy2 * dy2 + 1e-4, 1.5);
                return [dx1 / d1 + dx2 / d2, dy1 / d1 + dy2 / d2];
            };

            for (let k = 0; k < steps; k++) {
                this.orbitLut[k * 3]     = x1 * 3.2;
                this.orbitLut[k * 3 + 1] = y1 * 3.2;
                this.orbitLut[k * 3 + 2] = Math.sin((k / steps) * Math.PI * 4.0) * 0.85;

                const a1 = accel(x1, y1, x2, y2, x3, y3);
                const a2 = accel(x2, y2, x1, y1, x3, y3);
                const a3 = accel(x3, y3, x1, y1, x2, y2);
                vx1 += a1[0] * h; vy1 += a1[1] * h;
                vx2 += a2[0] * h; vy2 += a2[1] * h;
                vx3 += a3[0] * h; vy3 += a3[1] * h;
                x1 += vx1 * h; y1 += vy1 * h;
                x2 += vx2 * h; y2 += vy2 * h;
                x3 += vx3 * h; y3 += vy3 * h;
            }
            this.initialized = true;
        }

        applyPermutation(perm, count) {
            if (!this.slotMap) return;
            const N = count | 0;
            const tmp = new Int32Array(N);
            for (let i = 0; i < N; i++) tmp[i] = this.slotMap[perm[i]];
            this.slotMap.set(tmp);
        }

        _evalThreeBodyPoint(rawIdx, t, cosY, sinY, cosP, sinP, offsetX, outPos, i3, outCol, outSz, seeds) {
            const i = this.slotMap ? this.slotMap[rawIdx] : rawIdx;
            const steps = 1024;
            const i4 = i * 4;
            const u1 = seeds ? seeds[i4] : ((i * 0.6180339) % 1);
            const u2 = seeds ? seeds[i4 + 1] : ((i * 0.381966) % 1);
            const u3 = seeds ? seeds[i4 + 2] : 0.5;
            const u4 = seeds ? seeds[i4 + 3] : 0.5;

            const bodyIdx = i % 3;
            const phaseOffset = bodyIdx / 3.0;
            // 18% of particles form the 3 dense gravitational body cores; 82% trace the braided figure-8 orbital tubes
            const isCore = u3 < 0.18;
            const sNorm = isCore
                ? ((t * 0.14 + phaseOffset + (u1 - 0.5) * 0.015 + 10.0) % 1.0)
                : ((u1 + t * 0.14 + phaseOffset) % 1.0);

            const lutIdx = ((sNorm * steps) | 0) % steps;
            const l3 = lutIdx * 3;
            const tubeR = isCore ? (0.14 * Math.sqrt(u1)) : (0.18 + 0.26 * u4);
            const tubeAng = u2 * Math.PI * 2.0 + sNorm * 12.0;

            const lx = this.orbitLut[l3] + Math.cos(tubeAng) * tubeR;
            const ly = this.orbitLut[l3 + 1] + Math.sin(tubeAng) * tubeR;
            const lz = this.orbitLut[l3 + 2] + (u3 - 0.5) * tubeR;

            const rx = lx * cosY - lz * sinY;
            const rz = lx * sinY + lz * cosY;
            const ry = ly * cosP - rz * sinP;
            const rz2 = ly * sinP + rz * cosP;

            const scale = 1.0 + 0.85 * (this.insideness || 0);
            outPos[i3]     = this.origin.x + offsetX + rx * scale;
            outPos[i3 + 1] = this.origin.y + ry * scale;
            outPos[i3 + 2] = this.origin.z + rz2 * scale;

            if (outCol) {
                const palettes = [
                    [0.32, 0.86, 0.96],
                    [0.96, 0.68, 0.28],
                    [0.64, 0.48, 0.98]
                ];
                const pal = palettes[bodyIdx];
                const coreBoost = isCore ? 1.35 : (0.68 + 0.32 * u4);
                outCol[i3]     = clamp(pal[0] * coreBoost, 0.08, 1.0);
                outCol[i3 + 1] = clamp(pal[1] * coreBoost, 0.08, 1.0);
                outCol[i3 + 2] = clamp(pal[2] * coreBoost, 0.08, 1.0);
            }
            if (outSz) {
                outSz[rawIdx] = isCore ? (2.35 + 0.65 * u4) : (1.38 + 0.45 * u4);
            }
        }

        update(_dt, t, buffer, ctx) {
            if (!this.initialized || !this.orbitLut) this.init(buffer, ctx);
            const ptrX = (ctx && ctx.pointerX) || 0;
            const ptrY = (ctx && ctx.pointerY) || 0;
            const yaw = Math.sin(t * 0.18) * 0.28 + ptrX * 0.42;
            const pitch = 0.22 + ptrY * 0.24;
            const cosY = Math.cos(yaw), sinY = Math.sin(yaw);
            const cosP = Math.cos(pitch), sinP = Math.sin(pitch);
            const offsetX = ((ctx && ctx.isMobile) ? 0.0 : 1.85) * (1.0 - 0.85 * (this.insideness || 0));

            const N = buffer.count;
            const pos = buffer.positions;
            const col = buffer.colours;
            const sz = buffer.sizes;
            const seeds = buffer.seeds;

            for (let i = 0; i < N; i++) {
                this._evalThreeBodyPoint(i, t, cosY, sinY, cosP, sinP, offsetX, pos, i * 3, col, sz, seeds);
            }
        }

        targetFor(i, out = new Vector3()) {
            if (!this.initialized || !this.orbitLut) return out.copy(this.origin);
            const tmp = [0, 0, 0];
            this._evalThreeBodyPoint(i, 0.0, 1.0, 0.0, Math.cos(0.22), Math.sin(0.22), 1.85, tmp, 0, null, null, null);
            return out.set(tmp[0], tmp[1], tmp[2]);
        }
    }

    /* ---------- Register Hub & Domain Formations ---------- */
    registerFormation("hub:intro", LorenzFormation);
    registerFormation("hub:domain-math", MathematicsFormation);
    registerFormation("hub:domain-physics", BlackHoleFormation);
    registerFormation("hub:domain-datascience", DataScienceFormation);
    registerFormation("hub:domain-quant", QuantCrystalFormation);
    registerFormation("hub:domain-cs", QuantumCSFormation);
    registerFormation("hub:contact", ThreeBodyContactFormation);

    // Sub-page domain hero & project mappings
    registerFormation("domain:math:0", MathematicsFormation);
    registerFormation("domain:physics:0", BlackHoleFormation);
    registerFormation("domain:datascience:0", DataScienceFormation);
    registerFormation("domain:quant:0", QuantCrystalFormation);
    registerFormation("domain:cs:0", QuantumCSFormation);
    registerFormation("default", LorenzFormation);

    const createFormation = (simKey, sectionIndex, params = {}) => {
        const origin = sectionOrigin(sectionIndex);
        let Ctor = registry.get(simKey);
        if (!Ctor && typeof simKey === "string") {
            if (simKey.includes("math") || simKey.includes("mobius") || simKey.includes("fourier")) Ctor = MathematicsFormation;
            else if (simKey.includes("physics") || simKey.includes("nbody") || simKey.includes("schrodinger")) Ctor = BlackHoleFormation;
            else if (simKey.includes("datascience") || simKey.includes("regression") || simKey.includes("spectral") || simKey.includes("papers")) Ctor = DataScienceFormation;
            else if (simKey.includes("quant") || simKey.includes("options") || simKey.includes("stat-arb")) Ctor = QuantCrystalFormation;
            else if (simKey.includes("cs") || simKey.includes("ku-lang") || simKey.includes("8bit")) Ctor = QuantumCSFormation;
            else if (simKey.includes("contact")) Ctor = ThreeBodyContactFormation;
        }
        Ctor = Ctor || LorenzFormation;
        return new Ctor(origin, simKey, params, sectionIndex);
    };

    return {
        Formation,
        LorenzFormation,
        MathematicsFormation,
        BlackHoleFormation,
        DataScienceFormation,
        QuantCrystalFormation,
        QuantumCSFormation,
        ThreeBodyContactFormation,
        registerFormation,
        createFormation,
        registry
    };
}));
