    class NBodyFormation extends Formation {
        constructor(origin, simKey = "domain:physics:1", params = {}, sectionIndex = 1) {
            super(origin, simKey);
            this.params = params || {};
            this.sectionIndex = sectionIndex;
            this.cameraDistance = 12.5;
            this.radii = null;
            this.theta0 = null;
            this.vertH = null;
        }

        init(buffer, _ctx) {
            const N = buffer.maxCount;
            const seeds = buffer.seeds;
            this.radii = new Float32Array(N);
            this.theta0 = new Float32Array(N);
            this.vertH = new Float32Array(N);
            for (let i = 0; i < N; i++) {
                const i4 = i * 4;
                const u1 = seeds[i4], u2 = seeds[i4 + 1], u3 = seeds[i4 + 2];
                const arm = i & 1;
                const r = 0.18 + 3.4 * Math.pow(u1, 0.82);
                this.radii[i] = r;
                this.theta0[i] = arm * Math.PI + 2.6 * Math.log(r + 0.35) + (u2 - 0.5) * 0.48;
                this.vertH[i] = (u3 - 0.5) * 0.38 * Math.exp(-r * 0.45);
            }
            this.initialized = true;
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
            const yaw = t * 0.14 + 0.34 * Math.sin(t * 0.11) + ptrX * 0.55;
            const pitch = 0.52 + 0.16 * Math.sin(t * 0.083 + 1.0) + ptrY * 0.30;
            const cosY = Math.cos(yaw), sinY = Math.sin(yaw);
            const cosP = Math.cos(pitch), sinP = Math.sin(pitch);
            const offsetX = ((ctx && ctx.isMobile) ? 0.0 : 1.65) * (1.0 - 0.45 * (this.insideness || 0));
            const scale = 1.18 * (1.0 + 0.25 * (this.insideness || 0));
            const lens = (ctx && ctx.cursorLens) ? ctx.cursorLens(this.origin.x + offsetX, this.origin.y, this.origin.z) : null;

            for (let i = 0; i < N; i++) {
                const i3 = i * 3, i4 = i * 4;
                const r = this.radii[i];
                const omega = 1.35 / Math.pow(r * r + 0.22, 0.75);
                const th = this.theta0[i] + omega * t;
                const lx = r * Math.cos(th);
                const lz = r * Math.sin(th);
                const ly = this.vertH[i];

                const rx = lx * cosY - lz * sinY;
                const rz = lx * sinY + lz * cosY;
                const ry = ly * cosP - rz * sinP;
                const rz2 = ly * sinP + rz * cosP;

                pos[i3]     = this.origin.x + offsetX + rx * scale;
                pos[i3 + 1] = this.origin.y + ry * scale;
                pos[i3 + 2] = this.origin.z + rz2 * scale;
                if (lens && lens.active && i > 0) ctx.applyLens(pos, i3, lens);

                const coreHeat = Math.exp(-r * 0.65);
                const b = 0.17 + 0.28 * seeds[i4 + 3] * seeds[i4 + 3] + 0.25 * coreHeat;
                col[i3]     = clamp((0.98 * coreHeat + 0.35 * (1.0 - coreHeat)) * b, 0.04, 0.85);
                col[i3 + 1] = clamp((0.76 * coreHeat + 0.58 * (1.0 - coreHeat)) * b, 0.04, 0.85);
                col[i3 + 2] = clamp((0.42 * coreHeat + 0.96 * (1.0 - coreHeat)) * b, 0.04, 0.85);
                sz[i] = (i === 0) ? 5.8 : (0.85 + 0.85 * coreHeat + 0.55 * seeds[i4 + 3]);
            }
        }
    }

    /* ============================================================================
       2C. SCHRÖDINGER WAVEPACKET FORMATION (domain:physics:2)
       Split-Step Fourier TDSE 3D quantum wavepacket |ψ(x,y,t)|² & phase rainbow.
       ============================================================================ */
