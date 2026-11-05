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
            // Slow cinematic non-repeating two-lobe orbit camera angle + Laniakea pointer parallax
            this.yaw = -0.18 + 0.34 * Math.sin(t * 0.11) + ptrX * 0.55;
            this.pitch = 0.18 + 0.16 * Math.sin(t * 0.083 + 1.0) + ptrY * 0.30;

            const cosY = Math.cos(this.yaw), sinY = Math.sin(this.yaw);
            const cosP = Math.cos(this.pitch), sinP = Math.sin(this.pitch);
            const offsetX = ((ctx && ctx.isMobile) ? 0.0 : 3.22) * (1.0 - 0.85 * (this.insideness || 0));
            const lens = (ctx && ctx.cursorLens) ? ctx.cursorLens(this.origin.x + offsetX, this.origin.y, this.origin.z) : null;

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
                if (lens && lens.active && i > 0) ctx.applyLens(pos, i3, lens);

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

                sz[i] = 0.85 + 0.95 * v2 + 0.35 * lobeGlow + 0.30 * seeds[i4 + 3];
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

