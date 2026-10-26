/* Section Formation Interface & Registry (shared/gpu/gpu-thread-formations.js).
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
    const { Vector3, Formation, sectionOrigin, clamp } = TM;

    const registry = new Map();

    const registerFormation = (key, Ctor) => {
        registry.set(key, Ctor);
    };

    /* ============================================================================
       0. INTRO FORMATION — Lorenz Strange Attractor (σ = 10, ρ = 28, β = 8/3, RK4)
       Each particle integrates the real Lorenz ODE from its own initial condition
       on the attractor manifold. Coloured by instantaneous phase-space speed.
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
            this.yaw = 0.25;
            this.pitch = -0.32;
        }

        _rk4Lorenz(x, y, z, h) {
            const s = this.sigma, r = this.rho, b = this.beta;
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

            // Pre-integrate a 2048-point reference backbone on the real Lorenz attractor
            const backboneLen = 2048;
            const bx = new Float32Array(backboneLen);
            const by = new Float32Array(backboneLen);
            const bz = new Float32Array(backboneLen);
            let rx = 0.1, ry = 0.0, rz = 0.0;
            for (let k = 0; k < 600; k++) {
                const next = this._rk4Lorenz(rx, ry, rz, 0.006);
                rx = next[0]; ry = next[1]; rz = next[2];
            }
            for (let k = 0; k < backboneLen; k++) {
                const next = this._rk4Lorenz(rx, ry, rz, 0.0055);
                rx = next[0]; ry = next[1]; rz = next[2];
                bx[k] = rx; by[k] = ry; bz[k] = rz;
            }

            for (let i = 0; i < N; i++) {
                const i3 = i * 3, i4 = i * 4;
                const u1 = seeds[i4], u2 = seeds[i4 + 1], u3 = seeds[i4 + 2], u4 = seeds[i4 + 3];
                const bIdx = ((i * 7 + ((u1 * backboneLen) | 0)) % backboneLen);
                let px = bx[bIdx] + (u1 - 0.5) * 1.15;
                let py = by[bIdx] + (u2 - 0.5) * 1.15;
                let pz = bz[bIdx] + (u3 - 0.5) * 1.15;

                const subSteps = 4 + ((u4 * 10) | 0);
                let spd = 20.0;
                for (let s = 0; s < subSteps; s++) {
                    const step = this._rk4Lorenz(px, py, pz, 0.005);
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
            const tmpState = new Float32Array(N * 3);
            const tmpSpd = new Float32Array(N);
            for (let i = 0; i < N; i++) {
                const src = perm[i];
                const i3 = i * 3, s3 = src * 3;
                tmpState[i3] = this.state[s3];
                tmpState[i3 + 1] = this.state[s3 + 1];
                tmpState[i3 + 2] = this.state[s3 + 2];
                tmpSpd[i] = this.speeds[src];
            }
            this.state.set(tmpState);
            this.speeds.set(tmpSpd);
        }

        _projectPoint(lx, ly, lz, cosY, sinY, cosP, sinP, offsetX, out, i3) {
            const cx = lx;
            const cy = ly;
            const cz = lz - 25.0;

            const rx = cx * cosY - cy * sinY;
            const ry = cx * sinY + cy * cosY;
            const rz = cz;

            const py = ry * cosP - rz * sinP;
            const pz = ry * sinP + rz * cosP;

            const scale = 0.21;
            out[i3] = this.origin.x + offsetX + rx * scale;
            out[i3 + 1] = this.origin.y + py * scale;
            out[i3 + 2] = this.origin.z + pz * scale;
        }

        onClick() {
            this.aizawaMode = !this.aizawaMode;
            const tag = typeof document !== "undefined" ? document.querySelector('#intro .sim-tag') : null;
            if (tag) {
                tag.textContent = this.aizawaMode
                    ? "Aizawa torus-chaos attractor · RK4 integration (click to toggle Lorenz)"
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

            const h = clamp(dt, 0.001, 0.022) * 0.28;
            const s = this.sigma, r = this.rho, b = this.beta;

            const ptrX = (ctx && ctx.pointerX) || 0;
            const ptrY = (ctx && ctx.pointerY) || 0;
            this.yaw = t * 0.14 + ptrX * 0.42;
            this.pitch = -0.34 + ptrY * 0.26;

            const cosY = Math.cos(this.yaw), sinY = Math.sin(this.yaw);
            const cosP = Math.cos(this.pitch), sinP = Math.sin(this.pitch);
            const offsetX = (ctx && ctx.isMobile) ? 0.0 : 2.15;

            for (let i = 0; i < N; i++) {
                const i3 = i * 3;
                let x = state[i3], y = state[i3 + 1], z = state[i3 + 2];

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

                if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z) || Math.abs(x) > 80) {
                    x = (seeds[i * 4] - 0.5) * 16.0;
                    y = (seeds[i * 4 + 1] - 0.5) * 16.0;
                    z = 25.0 + (seeds[i * 4 + 2] - 0.5) * 14.0;
                }

                state[i3] = x;
                state[i3 + 1] = y;
                state[i3 + 2] = z;

                const speed = Math.hypot(dx1, dy1, dz1);
                const vNorm = clamp((speed - 6.0) / 58.0, 0.0, 1.0);
                this.speeds[i] = vNorm;

                this._projectPoint(x, y, z, cosY, sinY, cosP, sinP, offsetX, pos, i3);

                const v2 = vNorm * vNorm;
                col[i3]     = 0.16 + 0.36 * vNorm + 0.46 * v2;
                col[i3 + 1] = 0.34 + 0.44 * vNorm + 0.18 * v2;
                col[i3 + 2] = 0.72 + 0.26 * (1.0 - 0.35 * v2);

                sz[i] = 1.45 + 1.15 * vNorm + 0.45 * seeds[i * 4 + 3];
            }
        }

        targetFor(i, out = new Vector3()) {
            if (!this.initialized || !this.state) {
                return out.copy(this.origin);
            }
            const idx = clamp(i | 0, 0, (this.state.length / 3) - 1);
            const i3 = idx * 3;
            const cosY = Math.cos(this.yaw), sinY = Math.sin(this.yaw);
            const cosP = Math.cos(this.pitch), sinP = Math.sin(this.pitch);
            const tmp = [0, 0, 0];
            this._projectPoint(this.state[i3], this.state[i3 + 1], this.state[i3 + 2], cosY, sinY, cosP, sinP, 2.15, tmp, 0);
            return out.set(tmp[0], tmp[1], tmp[2]);
        }
    }

    /* ============================================================================
       1. MATHEMATICS FORMATION — Quintic Calabi–Yau Cross-Section (z₁ⁿ + z₂ⁿ = 1)
       Wraps shared/lib/cy-math.js (CYMath.evalPatch & project). Particles sample
       the welded n² complex branch patches and branch seams, animating with α(t)
       and 3D rotation. Also provides a faint wireframe/surface shell in the same
       scene that fades in after particle arrival.
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
            this.coords4D = null;   // Float32Array(N * 4): (re1, im1, re2, im2)
            this.baseCols = null;   // Float32Array(N * 3): patch palette colour
            this.seamMask = null;   // Float32Array(N): 1 on branch locus seams, 0 inside patch
            this.auxLines = null;   // Float32Array for same-scene wireframe shell (x,y,z, r,g,b,a)
            this.auxVertexCount = 0;
            this.alpha = 0.65;
            this.yaw = 0.3;
            this.pitch = 0.38;
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

                // 22% of particles sample the branch locus seams (b ≈ 0 or a ≈ 0, π/2) for crisp structural edges
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
                    // Luminous violet-gold seam accent
                    this.baseCols[i3]     = Math.min(1.0, pal[0] * 0.55 + 0.45);
                    this.baseCols[i3 + 1] = Math.min(1.0, pal[1] * 0.55 + 0.38);
                    this.baseCols[i3 + 2] = Math.min(1.0, pal[2] * 0.55 + 0.48);
                } else {
                    this.baseCols[i3]     = pal[0];
                    this.baseCols[i3 + 1] = pal[1];
                    this.baseCols[i3 + 2] = pal[2];
                }
            }
        }

        init(buffer, _ctx) {
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

            const scale = 2.55;
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

            // Continuous 4D -> 3D projection sweep α(t) and 3D rotation
            this.alpha = 0.58 + 0.36 * Math.sin(t * 0.27);
            this.yaw = t * 0.21 + ptrX * 0.48;
            this.pitch = 0.36 + ptrY * 0.32;

            const cosA = Math.cos(this.alpha), sinA = Math.sin(this.alpha);
            const cosY = Math.cos(this.yaw), sinY = Math.sin(this.yaw);
            const cosP = Math.cos(this.pitch), sinP = Math.sin(this.pitch);
            const offsetX = (ctx && ctx.isMobile) ? 0.0 : 2.15;

            for (let i = 0; i < N; i++) {
                const i3 = i * 3, i4 = i * 4;
                const lw = this._project4DtoWorld(
                    c4[i4], c4[i4 + 1], c4[i4 + 2], c4[i4 + 3],
                    cosA, sinA, cosY, sinY, cosP, sinP, offsetX,
                    pos, i3
                );

                // 4D depth shading (w-coordinate iridescence + seam brilliance)
                const shade = clamp(0.76 + 0.32 * lw, 0.42, 1.28);
                const isSeam = seam[i];
                col[i3]     = clamp(bCol[i3] * shade, 0.05, 1.0);
                col[i3 + 1] = clamp(bCol[i3 + 1] * shade, 0.05, 1.0);
                col[i3 + 2] = clamp(bCol[i3 + 2] * shade, 0.05, 1.0);

                sz[i] = (isSeam > 0.5 ? 2.15 : 1.48) + 0.45 * seeds[i4 + 3];
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

    registerFormation("hub:intro", LorenzFormation);
    registerFormation("hub:domain-math", MathematicsFormation);
    registerFormation("domain:math:0", MathematicsFormation);
    registerFormation("default", LorenzFormation);

    const createFormation = (simKey, sectionIndex, params = {}) => {
        const origin = sectionOrigin(sectionIndex);
        const Ctor = registry.get(simKey) || registry.get("default") || Formation;
        return new Ctor(origin, simKey, params, sectionIndex);
    };

    return {
        Formation,
        LorenzFormation,
        MathematicsFormation,
        registerFormation,
        createFormation,
        registry
    };
}));
