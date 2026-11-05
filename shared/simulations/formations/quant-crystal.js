    class QuantCrystalFormation extends Formation {
        constructor(origin, simKey = "hub:domain-quant", params = {}, sectionIndex = 4) {
            super(origin, simKey);
            this.params = params || {};
            this.sectionIndex = sectionIndex;
            this.cameraDistance = 14.0;
            this.cycleDuration = 8.0;

            // Geometry buffers
            this.roles = null;        // 0 = Volatility Mountain, 1 = Jump-Diffusion Ribbon, 2 = LOB Depth
            this.coords3D = null;     // Local base (x, y, z)
            this.strataMask = null;   // 1.0 for quantized contour ridge particles
            this.auxPositions = new Float32Array(2048 * 3);
            this.auxColours = new Float32Array(2048 * 4);
            this.auxLineCount = 0;
        }

        init(buffer, _ctx) {
            const N = buffer.maxCount;
            const seeds = buffer.seeds;

            this.roles = new Uint8Array(N);
            this.coords3D = new Float32Array(N * 3);
            this.strataMask = new Float32Array(N);

            const nMountain = Math.floor(N * 0.64);
            const nRibbons = Math.floor(N * 0.20);

            for (let i = 0; i < N; i++) {
                const i3 = i * 3, i4 = i * 4;
                const u1 = Math.max(1e-5, seeds[i4]);
                const u2 = seeds[i4 + 1];
                const u3 = seeds[i4 + 2];
                const u4 = seeds[i4 + 3];

                if (i < nMountain) {
                    // -------------------------------------------------------------
                    // ROLE 0: Volatility Surface Mountain & Contour Strata
                    // -------------------------------------------------------------
                    this.roles[i] = 0;

                    // Radial density distribution biased toward central peak
                    const rad = Math.pow(u1, 0.62) * 2.85;
                    const ang = u2 * Math.PI * 2.0;
                    const lx = rad * Math.cos(ang) * 1.15;
                    const lz = rad * Math.sin(ang) * 0.78;

                    // Heavy-tailed Student-t / Pareto peak profile
                    const r2 = Math.pow(lx * 0.90, 2) + Math.pow(lz * 1.35, 2);
                    const basePeak = 3.65 / (1.0 + r2 * 1.65);

                    // Rough Bergomi multi-scale fractal roughness
                    const fbm = 0.52 * Math.sin(lx * 3.2 + lz * 1.9)
                              + 0.30 * Math.cos(lx * 6.8 - lz * 4.4)
                              + 0.18 * Math.sin(lx * 13.5 + lz * 8.6);

                    // Sharp asymmetric skew ridge along the moneyness axis
                    const skewRidge = Math.exp(-Math.abs(lx * 1.15 - lz * 0.35) * 1.4) * 1.75;
                    let ly = -0.65 + basePeak * (0.65 + 0.35 * fbm) + skewRidge;

                    // 35% of particles lock onto discrete level-set contour shelves
                    let isStrata = 0.0;
                    if (u3 < 0.35) {
                        const deltaY = 0.22;
                        ly = Math.round(ly / deltaY) * deltaY + (u4 - 0.5) * 0.025;
                        isStrata = 1.0;
                    }

                    this.coords3D[i3]     = lx;
                    this.coords3D[i3 + 1] = ly;
                    this.coords3D[i3 + 2] = lz;
                    this.strataMask[i]   = isStrata;

                } else if (i < nMountain + nRibbons) {
                    // -------------------------------------------------------------
                    // ROLE 1: Correlated Jump-Diffusion Time-Series Sparklines
                    // -------------------------------------------------------------
                    this.roles[i] = 1;
                    const ribbonIdx = i % 5; // 5 parallel asset price paths
                    const sX = (u1 - 0.5) * 5.8; // Time-axis sweep
                    const laneZ = -1.6 + ribbonIdx * 0.8;
                    const laneY = -1.65 - ribbonIdx * 0.12;

                    this.coords3D[i3]     = sX;
                    this.coords3D[i3 + 1] = laneY;
                    this.coords3D[i3 + 2] = laneZ;
                    this.strataMask[i]   = ribbonIdx;

                } else {
                    // -------------------------------------------------------------
                    // ROLE 2: Limit Order Book (LOB) Depth Spikes & Histograms
                    // -------------------------------------------------------------
                    this.roles[i] = 2;
                    const barIdx = (i % 38);
                    const barX = -2.6 + barIdx * 0.14 + (u1 - 0.5) * 0.035;
                    const barZ = 1.35 + (u2 - 0.5) * 0.35;
                    const baseY = -2.35;

                    this.coords3D[i3]     = barX;
                    this.coords3D[i3 + 1] = baseY;
                    this.coords3D[i3 + 2] = barZ;
                    this.strataMask[i]   = barIdx;
                }
            }

            // Generate terminal coordinate grid lines for auxPositions (sub-scene overlay)
            this._buildCoordinateGrid();
            this.initialized = true;
        }

        _buildCoordinateGrid() {
            let ptr = 0;
            const pos = this.auxPositions;
            const col = this.auxColours;

            const addLine = (x0, y0, z0, x1, y1, z1, aAlpha = 0.12) => {
                if (ptr >= 2040) return;
                pos[ptr * 3]     = x0; pos[ptr * 3 + 1] = y0; pos[ptr * 3 + 2] = z0;
                col[ptr * 4]     = 0.745; col[ptr * 4 + 1] = 0.843; col[ptr * 4 + 2] = 1.0; col[ptr * 4 + 3] = aAlpha;
                ptr++;
                pos[ptr * 3]     = x1; pos[ptr * 3 + 1] = y1; pos[ptr * 3 + 2] = z1;
                col[ptr * 4]     = 0.745; col[ptr * 4 + 1] = 0.843; col[ptr * 4 + 2] = 1.0; col[ptr * 4 + 3] = aAlpha;
                ptr++;
            };

            // Ground plane grid lines
            const yG = -2.35;
            for (let x = -2.8; x <= 2.8; x += 0.8) {
                addLine(x, yG, -2.0, x, yG, 2.0, 0.08);
            }
            for (let z = -2.0; z <= 2.0; z += 0.8) {
                addLine(-2.8, yG, z, 2.8, yG, z, 0.08);
            }

            // Bounding strike and maturity ruler axes
            addLine(-2.8, yG, -2.0, 2.8, yG, -2.0, 0.16); // Strike axis
            addLine(-2.8, yG, -2.0, -2.8, yG, 2.0, 0.16); // Maturity axis
            addLine(-2.8, yG, -2.0, -2.8, 1.8, -2.0, 0.16); // Volatility vertical gauge

            // Tick marks along the vertical gauge
            for (let y = yG; y <= 1.8; y += 0.5) {
                addLine(-2.8, y, -2.0, -2.65, y, -2.0, 0.14);
            }

            this.auxLineCount = ptr;
        }

        applyPermutation(perm, count) {
            if (!this.coords3D) return;
            const N = count | 0;
            const tmpRoles = new Uint8Array(N);
            const tmpCoords = new Float32Array(N * 3);
            const tmpStrata = new Float32Array(N);

            for (let i = 0; i < N; i++) {
                const s = perm[i];
                tmpRoles[i] = this.roles[s];
                tmpStrata[i] = this.strataMask[s];
                tmpCoords[i * 3]     = this.coords3D[s * 3];
                tmpCoords[i * 3 + 1] = this.coords3D[s * 3 + 1];
                tmpCoords[i * 3 + 2] = this.coords3D[s * 3 + 2];
            }
            this.roles.set(tmpRoles);
            this.strataMask.set(tmpStrata);
            this.coords3D.set(tmpCoords);
        }

        update(_dt, t, buffer, ctx) {
            if (!this.initialized || !this.coords3D) this.init(buffer, ctx);

            const N = buffer.count;
            const pos = buffer.positions;
            const col = buffer.colours;
            const sz = buffer.sizes;
            const seeds = buffer.seeds;
            const c3D = this.coords3D;
            const roles = this.roles;
            const strata = this.strataMask;

            const ptrX = (ctx && ctx.pointerX) || 0;
            const ptrY = (ctx && ctx.pointerY) || 0;

            // Slow isometric terminal orbit + Laniakea pointer parallax
            const yaw = -0.42 + 0.34 * Math.sin(t * 0.11) + ptrX * 0.55;
            const pitch = 0.36 + 0.16 * Math.sin(t * 0.083 + 1.0) + ptrY * 0.30;
            const cosY = Math.cos(yaw), sinY = Math.sin(yaw);
            const cosP = Math.cos(pitch), sinP = Math.sin(pitch);
            const offsetX = ((ctx && ctx.isMobile) ? 0.0 : 1.45) * (1.0 - 0.45 * (this.insideness || 0));
            const scale = 1.35 * (1.0 + 0.25 * (this.insideness || 0));
            const lens = (ctx && ctx.cursorLens) ? ctx.cursorLens(this.origin.x + offsetX, this.origin.y, this.origin.z) : null;

            // Volatility induction wave sweeping along the strike axis
            const wavePhase = (t * 0.6) % (Math.PI * 2.0);

            for (let i = 0; i < N; i++) {
                const i3 = i * 3, i4 = i * 4;
                const role = roles[i];
                let lx = c3D[i3];
                let ly = c3D[i3 + 1];
                let lz = c3D[i3 + 2];

                let rC = 0.35, gC = 0.42, bC = 0.40;
                let pSize = 1.15;

                if (role === 0) {
                    // ---------------------------------------------------------
                    // Mountain Shading & Real-Time Wave Induction
                    // ---------------------------------------------------------
                    const waveDist = Math.sin(lx * 1.2 - wavePhase);
                    const waveGlow = Math.exp(-Math.pow(waveDist, 2) * 5.0);

                    // Height-dependent brightness within Laniakea budget
                    const hNorm = clamp((ly + 0.6) / 3.4, 0.0, 1.0);
                    const peakGlow = Math.pow(hNorm, 2.4);

                    if (strata[i] > 0.5) {
                        // Level-set contour lines glow sharp silver
                        rC = 0.42 + 0.32 * peakGlow + 0.22 * waveGlow;
                        gC = 0.46 + 0.28 * peakGlow + 0.18 * waveGlow;
                        bC = 0.50 + 0.24 * peakGlow + 0.22 * waveGlow;
                        pSize = 1.15 + 0.85 * peakGlow;
                    } else {
                        // Terrain slope stipples
                        rC = 0.16 + 0.32 * peakGlow + 0.14 * waveGlow;
                        gC = 0.24 + 0.30 * peakGlow + 0.18 * waveGlow;
                        bC = 0.28 + 0.28 * peakGlow + 0.18 * waveGlow;
                        pSize = 0.85 + 0.70 * hNorm;
                    }

                    // Hero Particle (i = 0): white-hot beacon on the peak
                    if (i === 0) {
                        lx = 0.05 * Math.sin(t * 1.2);
                        lz = 0.05 * Math.cos(t * 1.2);
                        ly = 2.95 + 0.08 * Math.sin(t * 2.4);
                        rC = 1.85; gC = 2.10; bC = 2.40;
                        pSize = 5.8;
                    }

                } else if (role === 1) {
                    // ---------------------------------------------------------
                    // Jump-Diffusion Ribbon Undulation
                    // ---------------------------------------------------------
                    const ribbonIdx = strata[i];
                    const seedX = seeds[i4 + 3];

                    // Correlated Brownian motion + Poisson jump kicks
                    const brownian = Math.sin(lx * 2.2 + t * (1.2 + ribbonIdx * 0.3)) * 0.18
                                   + Math.cos(lx * 5.4 - t * 0.8) * 0.08;
                    const jumpPhase = Math.sin(lx * 0.8 - t * 0.7 + ribbonIdx * 1.7);
                    const jumpKick = (jumpPhase > 0.88) ? (jumpPhase - 0.88) * 2.4 : 0.0;

                    ly += brownian + jumpKick;

                    const isHead = Math.abs(((lx / 5.8 + 0.5 + t * 0.15) % 1.0) - 0.5) < 0.04;
                    if (isHead) {
                        rC = 0.65; gC = 0.85; bC = 0.92;
                        pSize = 2.1;
                    } else {
                        rC = 0.16 + 0.14 * seedX;
                        gC = 0.36 + 0.14 * seedX;
                        bC = 0.34 + 0.14 * seedX;
                        pSize = 1.05;
                    }

                } else {
                    // ---------------------------------------------------------
                    // LOB Depth Histogram Spikes
                    // ---------------------------------------------------------
                    const barIdx = strata[i];
                    const uFrac = seeds[i4];
                    // Dynamic market volume profile: high near the center (spread), taper outward
                    const distCenter = Math.abs(barIdx - 19) / 19.0;
                    const barHeight = (0.25 + 1.65 * Math.exp(-distCenter * 2.2)) * (0.85 + 0.15 * Math.sin(t * 4.0 + barIdx));
                    ly += uFrac * barHeight;

                    const isTip = (uFrac > 0.92);
                    if (isTip) {
                        rC = 0.58; gC = 0.82; bC = 0.76;
                        pSize = 1.65;
                    } else {
                        rC = 0.14; gC = 0.32; bC = 0.28;
                        pSize = 0.95;
                    }
                }

                // 3D Isometric View Projection
                const rx = lx * cosY - lz * sinY;
                const rz = lx * sinY + lz * cosY;
                const ry = ly * cosP - rz * sinP;
                const rz2 = ly * sinP + rz * cosP;

                pos[i3]     = this.origin.x + offsetX + rx * scale;
                pos[i3 + 1] = this.origin.y + ry * scale;
                pos[i3 + 2] = this.origin.z + rz2 * scale;
                if (lens && lens.active && i > 0) ctx.applyLens(pos, i3, lens);

                col[i3]     = clamp(rC, 0.0, 2.4);
                col[i3 + 1] = clamp(gC, 0.0, 2.4);
                col[i3 + 2] = clamp(bC, 0.0, 2.4);

                sz[i] = pSize;
            }
        }

        targetFor(i, out = new Vector3()) {
            if (!this.initialized || !this.coords3D) return out.copy(this.origin);
            const idx = clamp(i | 0, 0, (this.coords3D.length / 3) - 1);
            const i3 = idx * 3;
            const lx = this.coords3D[i3];
            const ly = this.coords3D[i3 + 1];
            const lz = this.coords3D[i3 + 2];

            const yaw = -0.42;
            const pitch = 0.36;
            const cosY = Math.cos(yaw), sinY = Math.sin(yaw);
            const cosP = Math.cos(pitch), sinP = Math.sin(pitch);
            const scale = 1.35;

            const rx = lx * cosY - lz * sinY;
            const rz = lx * sinY + lz * cosY;
            const ry = ly * cosP - rz * sinP;
            const rz2 = ly * sinP + rz * cosP;

            return out.set(
                this.origin.x + 1.45 + rx * scale,
                this.origin.y + ry * scale,
                this.origin.z + rz2 * scale
            );
        }
    }
/* ============================================================================
       5. COMPUTER SCIENCE FORMATION — Grover Search (8 Qubits, N=256) & Shor Period Finding (N=15)
       Wraps shared/lib/qsim-math.js (initUniform, groverStep, applyModExp15, qft8FromJoint,
       phaseToRGB). Particles form the 256 counting-register amplitude columns, the 16
       work-register spikes, and the 3D modular-exponentiation entanglement arcs.
       ============================================================================ */
