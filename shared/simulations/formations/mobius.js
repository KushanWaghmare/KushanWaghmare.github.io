    class MobiusFormation extends Formation {
        constructor(origin, simKey = "domain:math:1", params = {}, sectionIndex = 1) {
            super(origin, simKey);
            this.params = params || {};
            this.sectionIndex = sectionIndex;
            this.R = (params && typeof params.r === "number") ? params.r : 2.05;
            this.width = (params && typeof params.width === "number") ? params.width : 0.85;
            this.k = (params && typeof params.k === "number") ? params.k : 1;
            this.yaw = 0.45;
            this.pitch = 0.35;
            this.roll = 0.0;
            this.cameraDistance = 12.0;
            this.uCoords = null;
            this.vCoords = null;
            this.baseCols = null;
        }

        init(buffer, _ctx) {
            const N = buffer.maxCount;
            const seeds = buffer.seeds;
            if (!this.uCoords || this.uCoords.length !== N) {
                this.uCoords = new Float32Array(N);
                this.vCoords = new Float32Array(N);
                this.baseCols = new Float32Array(N * 3);
            }

            const MM = root.MobiusMath || (typeof require === "function" ? require("../math/mobius-math.js") : null);
            const TAU = Math.PI * 2.0;
            const halfW = this.width * 0.5;

            // Mathematics palette: Rose-crimson [1.0, 0.36, 0.44] -> soft blush [1.0, 0.72, 0.78]
            for (let i = 0; i < N; i++) {
                const i4 = i * 4, i3 = i * 3;
                const u = seeds[i4] * TAU;
                const v = (seeds[i4 + 1] * 2.0 - 1.0) * halfW;
                this.uCoords[i] = u;
                this.vCoords[i] = v;

                const grad = (v / halfW) * 0.5 + 0.5;
                const ribbonGrad = 0.5 + 0.5 * Math.sin(u * 0.5);
                this.baseCols[i3]     = 1.0;
                this.baseCols[i3 + 1] = 0.34 + 0.38 * (grad * 0.6 + ribbonGrad * 0.4);
                this.baseCols[i3 + 2] = 0.42 + 0.36 * (grad * 0.4 + ribbonGrad * 0.6);
            }
            this.initialized = true;
        }

        update(_dt, t, buffer, ctx) {
            if (!this.initialized || !this.uCoords) this.init(buffer, ctx);
            const N = buffer.count;
            const pos = buffer.positions;
            const col = buffer.colours;
            const sz = buffer.sizes;
            const seeds = buffer.seeds;

            const ptrX = (ctx && ctx.pointerX) || 0;
            const ptrY = (ctx && ctx.pointerY) || 0;

            this.yaw = t * 0.28 + 0.34 * Math.sin(t * 0.11) + ptrX * 0.55;
            this.pitch = 0.38 + 0.16 * Math.sin(t * 0.083 + 1.0) + ptrY * 0.30;

            const cosY = Math.cos(this.yaw), sinY = Math.sin(this.yaw);
            const cosP = Math.cos(this.pitch), sinP = Math.sin(this.pitch);

            const R = this.R;
            const k = this.k;
            const TAU = Math.PI * 2.0;
            const halfW = this.width * 0.5;
            const flowOffset = t * 0.15;

            const scale = 1.35 * (1.0 + 0.25 * (this.insideness || 0));
            const lens = (ctx && ctx.cursorLens) ? ctx.cursorLens(this.origin.x, this.origin.y, this.origin.z) : null;

            for (let i = 0; i < N; i++) {
                const i3 = i * 3, i4 = i * 4;
                const u = (this.uCoords[i] + flowOffset) % TAU;
                const v = this.vCoords[i];

                const a = 0.5 * k * u;
                const ca = Math.cos(a), sa = Math.sin(a);
                const cu = Math.cos(u), su = Math.sin(u);
                const rho = R + v * ca;

                const lx = rho * cu;
                const ly = rho * su;
                const lz = v * sa;

                // Orbit rotation (yaw & pitch)
                const rx = lx * cosY - lz * sinY;
                const rz = lx * sinY + lz * cosY;
                const ry = ly * cosP - rz * sinP;
                const rz2 = ly * sinP + rz * cosP;

                pos[i3]     = this.origin.x + rx * scale;
                pos[i3 + 1] = this.origin.y + ry * scale;
                pos[i3 + 2] = this.origin.z + rz2 * scale;
                if (lens && lens.active && i > 0) ctx.applyLens(pos, i3, lens);

                const b = 0.17 + 0.30 * seeds[i4 + 3] * seeds[i4 + 3];
                const shade = clamp((0.72 + 0.28 * (lz / halfW)) * b, 0.08, 0.65);
                col[i3]     = clamp(this.baseCols[i3] * shade, 0.04, 0.80);
                col[i3 + 1] = clamp(this.baseCols[i3 + 1] * shade, 0.04, 0.80);
                col[i3 + 2] = clamp(this.baseCols[i3 + 2] * shade, 0.04, 0.80);

                sz[i] = 0.85 + 1.15 * seeds[i4 + 3];
                if (i === 0) {
                    col[0] = 2.05; col[1] = 1.35; col[2] = 1.55;
                    sz[0] = 5.8;
                }
            }
        }

        targetFor(i, out = new Vector3()) {
            if (!this.initialized || !this.uCoords) return out.copy(this.origin);
            const idx = clamp(i | 0, 0, this.uCoords.length - 1);
            const u = this.uCoords[idx];
            const v = this.vCoords[idx];
            const a = 0.5 * this.k * u;
            const ca = Math.cos(a), sa = Math.sin(a);
            const cu = Math.cos(u), su = Math.sin(u);
            const rho = this.R + v * ca;

            const lx = rho * cu;
            const ly = rho * su;
            const lz = v * sa;

            const cosY = Math.cos(this.yaw), sinY = Math.sin(this.yaw);
            const cosP = Math.cos(this.pitch), sinP = Math.sin(this.pitch);

            const rx = lx * cosY - lz * sinY;
            const rz = lx * sinY + lz * cosY;
            const ry = ly * cosP - rz * sinP;
            const rz2 = ly * sinP + rz * cosP;

            const scale = 1.35;
            return out.set(
                this.origin.x + rx * scale,
                this.origin.y + ry * scale,
                this.origin.z + rz2 * scale
            );
        }
    }

    /* ============================================================================
       1C. FOURIER FORMATION — Cooley–Tukey Radix-2 FFT & Epicycle Spectral Manifold
       3D harmonic helix & butterfly twiddle factor W_N^k = exp(-2πi k/N) manifold.
       ============================================================================ */
