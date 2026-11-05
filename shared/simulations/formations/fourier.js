    class FourierFormation extends Formation {
        constructor(origin, simKey = "domain:math:2", params = {}, sectionIndex = 2) {
            super(origin, simKey);
            this.params = params || {};
            this.sectionIndex = sectionIndex;
            this.cameraDistance = 12.5;
            this.sigMode = 0; // 0: Square wave odd harmonics, 1: Sawtooth, 2: Triangle
        }

        onClick() {
            this.sigMode = (this.sigMode + 1) % 3;
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
            const yaw = t * 0.22 + 0.34 * Math.sin(t * 0.11) + ptrX * 0.55;
            const pitch = 0.28 + 0.16 * Math.sin(t * 0.083 + 1.0) + ptrY * 0.30;
            const cosY = Math.cos(yaw), sinY = Math.sin(yaw);
            const cosP = Math.cos(pitch), sinP = Math.sin(pitch);

            const TAU = Math.PI * 2.0;
            const K = 8; // 8 harmonic frequency bins / FFT butterfly rings
            const scale = 1.25 * (1.0 + 0.25 * (this.insideness || 0));
            const lens = (ctx && ctx.cursorLens) ? ctx.cursorLens(this.origin.x, this.origin.y, this.origin.z) : null;

            for (let i = 0; i < N; i++) {
                const i3 = i * 3, i4 = i * 4;
                const u1 = seeds[i4], u2 = seeds[i4 + 1], u3 = seeds[i4 + 2], u4 = seeds[i4 + 3];
                const k = (i % K) + 1;
                const harm = this.sigMode === 1 ? k : (2 * k - 1);
                const amp = this.sigMode === 2 ? (1.8 / (harm * harm)) : (1.55 / Math.pow(harm, 0.78));

                let lx, ly, lz;
                if (u3 < 0.62) {
                    // Harmonic phasor rings & 3D time-frequency spectral helix
                    const zSpan = (u1 - 0.5) * 5.2;
                    const ph = u2 * TAU + harm * (zSpan * 0.85 - t * 0.9);
                    const ringR = amp * (0.85 + 0.3 * u4);
                    lx = zSpan;
                    ly = ringR * Math.cos(ph) + ((k - 4.5) * 0.28);
                    lz = ringR * Math.sin(ph);
                } else {
                    // Cooley-Tukey butterfly cross-strands connecting even E_k and odd W_N^k O_k stages
                    const stage = i & 3;
                    const sLerp = (u1 + t * 0.35) % 1.0;
                    const x0 = -2.4 + stage * 1.6;
                    const x1 = x0 + 1.6;
                    const bA = ((k - 4.5) * 0.52);
                    const bB = ((((k ^ (1 << (stage & 1))) % K) - 4.5) * 0.52);
                    const twiddle = TAU * sLerp + t * 1.2;
                    lx = x0 + (x1 - x0) * sLerp;
                    ly = bA + (bB - bA) * sLerp + Math.sin(twiddle) * 0.18;
                    lz = Math.cos(twiddle) * (0.45 + 0.35 * u2);
                }

                const rx = lx * cosY - lz * sinY;
                const rz = lx * sinY + lz * cosY;
                const ry = ly * cosP - rz * sinP;
                const rz2 = ly * sinP + rz * cosP;

                pos[i3]     = this.origin.x + rx * scale;
                pos[i3 + 1] = this.origin.y + ry * scale;
                pos[i3 + 2] = this.origin.z + rz2 * scale;
                if (lens && lens.active && i > 0) ctx.applyLens(pos, i3, lens);

                const freqNorm = (k - 1) / (K - 1);
                const pulse = (0.78 + 0.26 * Math.sin(u1 * TAU - t * 2.2)) * (0.17 + 0.32 * u4 * u4);
                col[i3]     = clamp((1.0 - 0.22 * freqNorm) * pulse, 0.04, 0.78);
                col[i3 + 1] = clamp((0.32 + 0.52 * freqNorm) * pulse, 0.04, 0.78);
                col[i3 + 2] = clamp((0.48 + 0.46 * (1.0 - freqNorm)) * pulse, 0.04, 0.78);

                sz[i] = 0.85 + 1.20 * u4;
                if (i === 0) {
                    col[0] = 2.05; col[1] = 1.45; col[2] = 1.65;
                    sz[0] = 5.8;
                }
            }
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
