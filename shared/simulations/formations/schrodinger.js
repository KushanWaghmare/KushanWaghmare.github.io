    class SchrodingerFormation extends Formation {
        constructor(origin, simKey = "domain:physics:2", params = {}, sectionIndex = 2) {
            super(origin, simKey);
            this.params = params || {};
            this.sectionIndex = sectionIndex;
            this.cameraDistance = 12.5;
        }

        init(_buffer, _ctx) {
            this.initialized = true;
        }

        update(_dt, t, buffer, ctx) {
            const N = buffer.count;
            const pos = buffer.positions;
            const col = buffer.colours;
            const sz = buffer.sizes;
            const seeds = buffer.seeds;

            const ptrX = (ctx && ctx.pointerX) || 0;
            const ptrY = (ctx && ctx.pointerY) || 0;
            const yaw = -0.32 + t * 0.16 + 0.34 * Math.sin(t * 0.11) + ptrX * 0.55;
            const pitch = 0.42 + 0.16 * Math.sin(t * 0.083 + 1.0) + ptrY * 0.30;
            const cosY = Math.cos(yaw), sinY = Math.sin(yaw);
            const cosP = Math.cos(pitch), sinP = Math.sin(pitch);
            const offsetX = ((ctx && ctx.isMobile) ? 0.0 : 1.65) * (1.0 - 0.45 * (this.insideness || 0));
            const scale = 1.22 * (1.0 + 0.25 * (this.insideness || 0));
            const lens = (ctx && ctx.cursorLens) ? ctx.cursorLens(this.origin.x + offsetX, this.origin.y, this.origin.z) : null;

            for (let i = 0; i < N; i++) {
                const i3 = i * 3, i4 = i * 4;
                const u1 = seeds[i4], u2 = seeds[i4 + 1], u3 = seeds[i4 + 2], u4 = seeds[i4 + 3];
                const lx = (u1 - 0.5) * 5.6;
                const lz = (u2 - 0.5) * 5.6;

                const d1x = lx - 1.1 * Math.cos(t * 0.7), d1z = lz - 1.1 * Math.sin(t * 0.7);
                const d2x = lx + 1.1 * Math.cos(t * 0.7), d2z = lz + 1.1 * Math.sin(t * 0.7);
                const env1 = Math.exp(-(d1x * d1x + d1z * d1z) * 0.65);
                const env2 = Math.exp(-(d2x * d2x + d2z * d2z) * 0.65);
                const ph1 = 3.2 * (lx * Math.sin(t * 0.7) - lz * Math.cos(t * 0.7)) - t * 2.4;
                const ph2 = -3.2 * (lx * Math.sin(t * 0.7) - lz * Math.cos(t * 0.7)) - t * 2.4;

                const re = env1 * Math.cos(ph1) + env2 * Math.cos(ph2);
                const im = env1 * Math.sin(ph1) + env2 * Math.sin(ph2);
                const prob = re * re + im * im;
                const ly = -1.1 + prob * 1.45 + (u3 - 0.5) * 0.12;

                const rx = lx * cosY - lz * sinY;
                const rz = lx * sinY + lz * cosY;
                const ry = ly * cosP - rz * sinP;
                const rz2 = ly * sinP + rz * cosP;

                pos[i3]     = this.origin.x + offsetX + rx * scale;
                pos[i3 + 1] = this.origin.y + ry * scale;
                pos[i3 + 2] = this.origin.z + rz2 * scale;
                if (lens && lens.active && i > 0) ctx.applyLens(pos, i3, lens);

                const phaseAngle = (Math.atan2(im, re) / (2.0 * Math.PI) + 1.0) % 1.0;
                const boost = clamp((0.17 + 0.42 * Math.sqrt(prob)) * (0.75 + 0.35 * u4), 0.06, 0.78);
                col[i3]     = clamp((0.5 + 0.5 * Math.cos(6.283 * (phaseAngle + 0.0))) * boost, 0.04, 0.80);
                col[i3 + 1] = clamp((0.5 + 0.5 * Math.cos(6.283 * (phaseAngle + 0.33))) * boost, 0.04, 0.80);
                col[i3 + 2] = clamp((0.5 + 0.5 * Math.cos(6.283 * (phaseAngle + 0.67))) * boost, 0.04, 0.80);
                sz[i] = (i === 0) ? 5.8 : (0.85 + 0.85 * clamp(prob, 0.0, 1.2) + 0.40 * u4);
            }
        }
    }

    /* ============================================================================
       3. DATA SCIENCE FORMATION — Score-Based Reverse-Time Diffusion SDE
       Wraps shared/lib/diffusion-math.js (alpha, sigma2, beta, score, getGalaxyTarget,
       getTrefoilTarget, getTorusTarget). Particles evolve under the real reverse-time
       VP-SDE / probability-flow ODE from isotropic Gaussian noise to structured manifolds.
       ============================================================================ */
