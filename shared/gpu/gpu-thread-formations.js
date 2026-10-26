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
            // Burn-in 600 steps to settle onto the strange attractor manifold
            for (let k = 0; k < 600; k++) {
                const next = this._rk4Lorenz(rx, ry, rz, 0.006);
                rx = next[0]; ry = next[1]; rz = next[2];
            }
            for (let k = 0; k < backboneLen; k++) {
                const next = this._rk4Lorenz(rx, ry, rz, 0.0055);
                rx = next[0]; ry = next[1]; rz = next[2];
                bx[k] = rx; by[k] = ry; bz[k] = rz;
            }

            // Seed each particle i from a slightly different initial condition along the attractor
            // and integrate forward by a deterministic number of RK4 steps
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

                // RK4 integration of the real Lorenz ODE: dx/dt = σ(y-x), dy/dt = x(ρ-z)-y, dz/dt = xy - βz
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

                // Guard against numerical divergence
                if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z) || Math.abs(x) > 80) {
                    x = (seeds[i * 4] - 0.5) * 16.0;
                    y = (seeds[i * 4 + 1] - 0.5) * 16.0;
                    z = 25.0 + (seeds[i * 4 + 2] - 0.5) * 14.0;
                }

                state[i3] = x;
                state[i3 + 1] = y;
                state[i3 + 2] = z;

                // Instantaneous speed ||dx/dt|| for velocity-based colour mapping
                const speed = Math.hypot(dx1, dy1, dz1);
                const vNorm = clamp((speed - 6.0) / 58.0, 0.0, 1.0);
                this.speeds[i] = vNorm;

                // Project to world coordinates around this.origin
                this._projectPoint(x, y, z, cosY, sinY, cosP, sinP, offsetX, pos, i3);

                // Speed-to-colour ramp: deep sapphire lobe centres -> electric cyan-blue -> warm incandescent gold wing tips
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

        dispose() {
            super.dispose();
        }
    }

    registerFormation("hub:intro", LorenzFormation);
    registerFormation("default", LorenzFormation);

    const createFormation = (simKey, sectionIndex, params = {}) => {
        const origin = sectionOrigin(sectionIndex);
        const Ctor = registry.get(simKey) || registry.get("default") || Formation;
        return new Ctor(origin, simKey, params, sectionIndex);
    };

    return {
        Formation,
        LorenzFormation,
        registerFormation,
        createFormation,
        registry
    };
}));
