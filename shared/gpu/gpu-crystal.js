/**
 * shared/gpu/gpu-crystal.js
 *
 * WebGL2 Scene for the Quantitative Finance section:
 * "The Option-Pricing Crystal."
 *
 * A two-asset binomial lattice grown as a 3-D glowing crystal, stacked into
 * a square pyramid with root apex at the bottom and expiry at the top.
 *
 * Features:
 *   - Double-precision CPU backward induction pricing (Boyle–Evnine–Gibbs 1989)
 *   - Luminous additive HDR node point cloud with cool-to-hot value ramp
 *   - Active backward induction sweep wave traveling from expiry face down to root
 *   - Luminous diagonal exercise hinge ribbon on top face where S₁ = S₂
 *   - Adjacent Value Lens: 3-D heightfield displaying the active layer's V_t slice,
 *     visibly smoothing out the payoff kink as the wave reaches the root
 *   - Timeline: Grow (5s) -> Expiry (2s) -> Backward Induction Wave (8s) -> Root Flash (3.5s) -> Refine (1.5s)
 *   - Live pointer interaction via KW.local setting correlation ρ ∈ [-0.9, 0.9]
 *   - Gentle cursor parallax
 *   - Click interaction via KW.onClick skipping to next n (600 ms cooldown)
 *   - Live caption (≤ 4 Hz) with exact price comparison against Margrabe closed-form
 *   - Hotkey 'B' toggling 1-asset Black–Scholes reduction
 *   - Fallback preservation of 2-D sim under SIMS["options-pricing-2d"]
 *   - WebGL2 HDR pipeline with Dual-Kawase bloom and ACES tonemapping via GFX
 */

(function (root, factory) {
    if (typeof module === "object" && module.exports) module.exports = factory(root);
    else factory(root);
}(typeof self !== "undefined" ? self : this, function (root) {
    "use strict";

    const SIMS = (root.SIMS = root.SIMS || {});
    const ENGINES = (root.ENGINES = root.ENGINES || {});
    const M = root.LatticeMath || (typeof require !== "undefined" ? require("../lib/lattice-math.js") : null);
    const Shaders = root.CrystalShaders || (typeof require !== "undefined" ? require("./gpu-crystal-shaders.js") : null);

    // Preserve existing 2-D sim as fallback if present
    if (SIMS["options-pricing"] && !SIMS["options-pricing-2d"]) {
        SIMS["options-pricing-2d"] = SIMS["options-pricing"];
    }

    const PYRAMID_W = 1.35; // Half-width of pyramid base at top
    const PYRAMID_H = 1.80; // Total height of pyramid

    /* ---------- Matrix Helpers (Allocated Once, Zero Per-Frame GC) ---------- */
    const mat4Perspective = (out, fovy, aspect, near, far) => {
        const f = 1.0 / Math.tan(fovy * 0.5), nf = 1.0 / (near - far);
        out.fill(0);
        out[0] = f / aspect;
        out[5] = f;
        out[10] = (far + near) * nf;
        out[11] = -1.0;
        out[14] = 2.0 * far * near * nf;
    };

    const mat4LookAt = (out, eye, ctr, up) => {
        let z0 = eye[0] - ctr[0], z1 = eye[1] - ctr[1], z2 = eye[2] - ctr[2];
        let len = 1.0 / (Math.hypot(z0, z1, z2) || 1.0);
        z0 *= len; z1 *= len; z2 *= len;
        let x0 = up[1] * z2 - up[2] * z1, x1 = up[2] * z0 - up[0] * z2, x2 = up[0] * z1 - up[1] * z0;
        len = 1.0 / (Math.hypot(x0, x1, x2) || 1.0);
        x0 *= len; x1 *= len; x2 *= len;
        const y0 = z1 * x2 - z2 * x1, y1 = z2 * x0 - z0 * x2, y2 = z0 * x1 - z1 * x0;
        out.set([
            x0, y0, z0, 0,
            x1, y1, z1, 0,
            x2, y2, z2, 0,
            -(x0 * eye[0] + x1 * eye[1] + x2 * eye[2]),
            -(y0 * eye[0] + y1 * eye[1] + y2 * eye[2]),
            -(z0 * eye[0] + z1 * eye[1] + z2 * eye[2]),
            1.0
        ]);
    };

    const mat4Mul = (out, a, b) => {
        for (let i = 0; i < 4; i++) {
            const b0 = b[i * 4], b1 = b[i * 4 + 1], b2 = b[i * 4 + 2], b3 = b[i * 4 + 3];
            for (let j = 0; j < 4; j++) {
                out[i * 4 + j] = b0 * a[j] + b1 * a[4 + j] + b2 * a[8 + j] + b3 * a[12 + j];
            }
        }
    };

    /* ---------- Wireframe Geometry Builders ---------- */
    // Builds the 4 ridge edges and top square perimeter of the pyramid
    const buildPyramidOutline = (w, h) => {
        const lines = [];
        const pushLine = (x0, y0, z0, x1, y1, z1, r, g, b, a) => {
            lines.push(x0, y0, z0, r, g, b, a, x1, y1, z1, r, g, b, a);
        };
        const yBot = -h * 0.5;
        const yTop = h * 0.5;
        const cRidge = [0.30, 0.45, 0.65, 0.25];
        const cBase  = [0.40, 0.55, 0.80, 0.35];

        // 4 corner ridge edges from apex (0, yBot, 0) to top base corners
        pushLine(0, yBot, 0, -w, yTop, -w, ...cRidge);
        pushLine(0, yBot, 0,  w, yTop, -w, ...cRidge);
        pushLine(0, yBot, 0,  w, yTop,  w, ...cRidge);
        pushLine(0, yBot, 0, -w, yTop,  w, ...cRidge);

        // 4 top base perimeter edges
        pushLine(-w, yTop, -w,  w, yTop, -w, ...cBase);
        pushLine( w, yTop, -w,  w, yTop,  w, ...cBase);
        pushLine( w, yTop,  w, -w, yTop,  w, ...cBase);
        pushLine(-w, yTop,  w, -w, yTop, -w, ...cBase);

        return new Float32Array(lines);
    };

    // Builds a glowing diagonal ribbon on the top expiry face (y = H/2, line x = z)
    const buildHingeRibbon = (w, h) => {
        const yTop = h * 0.5 + 0.005;
        const eps = 0.035; // Half-width of ribbon
        // Normal in horizontal plane perpendicular to diagonal x = z
        const nx = -0.7071 * eps;
        const nz =  0.7071 * eps;

        const x0 = -w, z0 = -w;
        const x1 =  w, z1 =  w;

        return new Float32Array([
            // Triangle 1
            x0 - nx, yTop, z0 - nz, 0.0, 0.0,
            x0 + nx, yTop, z0 + nz, 1.0, 0.0,
            x1 - nx, yTop, z1 - nz, 0.0, 1.0,

            // Triangle 2
            x0 + nx, yTop, z0 + nz, 1.0, 0.0,
            x1 + nx, yTop, z1 + nz, 1.0, 1.0,
            x1 - nx, yTop, z1 - nz, 0.0, 1.0
        ]);
    };

    // Builds preallocated 17x17 grid for the adjacent Value Lens heightfield
    const LENS_RES = 17;
    const buildLensGrid = () => {
        const verts = [];
        for (let i = 0; i < LENS_RES; i++) {
            const u = i / (LENS_RES - 1);
            const x = (u - 0.5) * 2.0;
            for (let j = 0; j < LENS_RES; j++) {
                const v = j / (LENS_RES - 1);
                const z = (v - 0.5) * 2.0;
                // [posX, posY, posZ, elevation, uvU, uvV]
                verts.push(x, 0.0, z, 0.0, u, v);
            }
        }
        return new Float32Array(verts);
    };

    // Builds triangle indices for the 17x17 Value Lens heightfield
    const buildLensIndices = () => {
        const indices = [];
        for (let r = 0; r < LENS_RES - 1; r++) {
            for (let c = 0; c < LENS_RES - 1; c++) {
                const i0 = r * LENS_RES + c;
                const i1 = r * LENS_RES + (c + 1);
                const i2 = (r + 1) * LENS_RES + c;
                const i3 = (r + 1) * LENS_RES + (c + 1);

                // Quad as 2 triangles
                indices.push(i0, i1, i2);
                indices.push(i1, i3, i2);
            }
        }
        return new Uint16Array(indices);
    };

    // Builds ambient floating volumetric dust particles
    const buildDustParticles = (count = 200) => {
        const data = [];
        let s = 987654321;
        const rng = () => {
            s = (s + 0x6D2B79F5) >>> 0;
            let t = Math.imul(s ^ (s >>> 15), 1 | s);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };

        for (let i = 0; i < count; i++) {
            const px = (rng() - 0.5) * 5.5;
            const py = (rng() - 0.5) * 4.0;
            const pz = (rng() - 0.5) * 5.5;
            const phase = rng() * Math.PI * 2.0;
            const size = 1.5 + rng() * 3.5;
            data.push(px, py, pz, phase, size);
        }
        return new Float32Array(data);
    };

    /* ---------- Scene Factory mounted through GFX ---------- */
    const createCrystalSim = (canvas, opts = {}) => {
        const GFX = root.GFX;
        const S = Shaders || root.CrystalShaders;
        const MathLib = M || root.LatticeMath;
        const fallback2D = SIMS["options-pricing-2d"] || ENGINES["options-pricing-2d"];

        if (!GFX || !GFX.supported || !S || !MathLib) {
            return fallback2D ? fallback2D(canvas, opts) : null;
        }

        return GFX.mount(canvas, (gfx, cvs, getSize) => {
            const gl = gfx.gl;

            // Shader Program Compilations
            const progNodes = gfx.program(S.VS_CRYSTAL_NODES, S.FS_CRYSTAL_NODES);
            const progLines = gfx.program(S.VS_CRYSTAL_LINES, S.FS_CRYSTAL_LINES);
            const progHinge = gfx.program(S.VS_HINGE_PLANE, S.FS_HINGE_PLANE);
            const progLens  = gfx.program(S.VS_VALUE_LENS, S.FS_VALUE_LENS);
            const progDust  = gfx.program(S.VS_DUST, S.FS_DUST);

            if (!progNodes || !progLines || !progHinge || !progLens || !progDust) {
                console.error("[gpu-crystal] Shader compilation failed");
                return null;
            }

            // Default Financial Parameters (Boyle–Evnine–Gibbs / Margrabe standard)
            const defaultParams = {
                S1: 100.0,
                S2: 100.0,
                sigma1: 0.30,
                sigma2: 0.20,
                rho: 0.30,
                r: 0.03,
                T: 1.0
            };

            const isMob = gfx.isMobile();
            const N_STEPS = isMob ? [8, 16, 32] : [8, 16, 32, 64];
            let stepIdx = isMob ? 2 : 2; // Default to n = 32
            let curN = N_STEPS[stepIdx];

            let curRho = defaultParams.rho;
            let targetRho = defaultParams.rho;
            let lastPricedRho = curRho;
            let lastPricedN = curN;

            // Mathematical State
            let latticeData = null;
            let margrabeExact = MathLib.margrabe(defaultParams.S1, defaultParams.S2, defaultParams.sigma1, defaultParams.sigma2, curRho, defaultParams.r, defaultParams.T);
            let latticePrice = 0.0;
            let priceError = 0.0;
            let errorPct = 0.0;

            // Preallocated GPU Buffers
            // 1. Crystal Nodes: capacity for 100,000 vertices (8 floats each)
            const MAX_NODES = 100000;
            const vboNodes = gl.createBuffer();
            const vaoNodes = gl.createVertexArray();
            gl.bindVertexArray(vaoNodes);
            gl.bindBuffer(gl.ARRAY_BUFFER, vboNodes);
            gl.bufferData(gl.ARRAY_BUFFER, MAX_NODES * 8 * 4, gl.DYNAMIC_DRAW);

            // [posX, posY, posZ, value, tNorm, k1Norm, k2Norm, hingeDiff]
            const STRIDE_NODES = 32; // 8 * 4 bytes
            gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, STRIDE_NODES, 0);  // aPos
            gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 1, gl.FLOAT, false, STRIDE_NODES, 12); // aValue
            gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 1, gl.FLOAT, false, STRIDE_NODES, 16); // aLayerNorm
            gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 1, gl.FLOAT, false, STRIDE_NODES, 20); // aK1Norm
            gl.enableVertexAttribArray(4); gl.vertexAttribPointer(4, 1, gl.FLOAT, false, STRIDE_NODES, 24); // aK2Norm
            gl.enableVertexAttribArray(5); gl.vertexAttribPointer(5, 1, gl.FLOAT, false, STRIDE_NODES, 28); // aHingeDiff
            gl.bindVertexArray(null);

            // 2. Structural Lines (Outline + Active Layer Box + Connectors + Beam)
            const outlineData = buildPyramidOutline(PYRAMID_W, PYRAMID_H);
            const MAX_LINE_FLOATS = outlineData.length + 300 * 7;
            const lineBuffer = new Float32Array(MAX_LINE_FLOATS);
            lineBuffer.set(outlineData, 0);

            const vboLines = gl.createBuffer();
            const vaoLines = gl.createVertexArray();
            gl.bindVertexArray(vaoLines);
            gl.bindBuffer(gl.ARRAY_BUFFER, vboLines);
            gl.bufferData(gl.ARRAY_BUFFER, lineBuffer.byteLength, gl.DYNAMIC_DRAW);
            gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 28, 0);  // aPos
            gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 28, 12); // aColor
            gl.bindVertexArray(null);

            // 3. Exercise Hinge Ribbon (Top Expiry Face)
            const hingeData = buildHingeRibbon(PYRAMID_W, PYRAMID_H);
            const vboHinge = gl.createBuffer();
            const vaoHinge = gl.createVertexArray();
            gl.bindVertexArray(vaoHinge);
            gl.bindBuffer(gl.ARRAY_BUFFER, vboHinge);
            gl.bufferData(gl.ARRAY_BUFFER, hingeData, gl.STATIC_DRAW);
            gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 20, 0);  // aPos
            gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 20, 12); // aUV
            gl.bindVertexArray(null);

            // 4. Value Lens Heightfield (Mesh with Triangles)
            const lensBaseData = buildLensGrid();
            const lensDynamicData = new Float32Array(lensBaseData);
            const lensIndices = buildLensIndices();

            const vboLens = gl.createBuffer();
            const iboLens = gl.createBuffer();
            const vaoLens = gl.createVertexArray();
            gl.bindVertexArray(vaoLens);
            gl.bindBuffer(gl.ARRAY_BUFFER, vboLens);
            gl.bufferData(gl.ARRAY_BUFFER, lensDynamicData.byteLength, gl.DYNAMIC_DRAW);
            gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, iboLens);
            gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, lensIndices, gl.STATIC_DRAW);
            gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 24, 0);  // aPos
            gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 1, gl.FLOAT, false, 24, 12); // aValue
            gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 2, gl.FLOAT, false, 24, 16); // aGridUV
            gl.bindVertexArray(null);

            // 5. Dust Particles
            const dustData = buildDustParticles(isMob ? 90 : 200);
            const vboDust = gl.createBuffer();
            const vaoDust = gl.createVertexArray();
            gl.bindVertexArray(vaoDust);
            gl.bindBuffer(gl.ARRAY_BUFFER, vboDust);
            gl.bufferData(gl.ARRAY_BUFFER, dustData, gl.STATIC_DRAW);
            gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 20, 0);  // aPos
            gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 1, gl.FLOAT, false, 20, 12); // aPhase
            gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 1, gl.FLOAT, false, 20, 16); // aSize
            gl.bindVertexArray(null);

            let isOneAssetMode = false;
            let bsExact = MathLib.blackScholes(defaultParams.S1, 100.0, defaultParams.r, defaultParams.sigma1, defaultParams.T);

            cvs.tabIndex = 0; // Focusable for hotkey toggle without window listeners
            const onKeyDown = (e) => {
                if (e.key === "b" || e.key === "B" || e.key === "1") {
                    isOneAssetMode = !isOneAssetMode;
                    updatePricing(true);
                    lastTagMs = 0;
                }
            };
            cvs.addEventListener("keydown", onKeyDown);

            const onGlobalKey = (e) => {
                if (e.target && e.target.closest && e.target.closest("input, textarea, select")) return;
                if (e.key === "b" || e.key === "B") {
                    const r = cvs.getBoundingClientRect();
                    if (r.top < window.innerHeight && r.bottom > 0) {
                        isOneAssetMode = !isOneAssetMode;
                        updatePricing(true);
                        lastTagMs = 0;
                    }
                }
            };
            window.addEventListener("keydown", onGlobalKey);

            // Re-price on CPU and upload lattice buffers
            const updatePricing = (force = false) => {
                if (!force && Math.abs(curRho - lastPricedRho) < 0.01 && curN === lastPricedN) {
                    return;
                }
                lastPricedRho = curRho;
                lastPricedN = curN;

                if (isOneAssetMode) {
                    // One-asset Black-Scholes reduction (asset 2 is deterministic strike bond)
                    bsExact = MathLib.blackScholes(defaultParams.S1, 100.0, defaultParams.r, defaultParams.sigma1, defaultParams.T);
                    latticePrice = MathLib.price1DLattice(defaultParams.S1, 100.0, defaultParams.r, defaultParams.sigma1, defaultParams.T, curN);
                    priceError = Math.abs(latticePrice - bsExact);
                    errorPct = (priceError / bsExact) * 100.0;

                    // Build flattened 2-D tree vertices
                    const totalNodes = ((curN + 1) * (curN + 2)) / 2;
                    const flat1D = new Float32Array(totalNodes * 8);
                    const dt = defaultParams.T / curN;
                    const u1 = Math.exp(defaultParams.sigma1 * Math.sqrt(dt));
                    const a1 = Math.sqrt(dt) * (defaultParams.r - 0.5 * defaultParams.sigma1 * defaultParams.sigma1) / defaultParams.sigma1;
                    const pu = 0.5 * (1.0 + a1), pd = 0.5 * (1.0 - a1);
                    const disc = Math.exp(-defaultParams.r * dt);

                    const layers1D = new Array(curN + 1);
                    layers1D[curN] = new Float64Array(curN + 1);
                    for (let k = 0; k <= curN; k++) {
                        layers1D[curN][k] = Math.max(defaultParams.S1 * Math.pow(u1, 2 * k - curN) - 100.0, 0.0);
                    }
                    for (let t = curN - 1; t >= 0; t--) {
                        layers1D[t] = new Float64Array(t + 1);
                        for (let k = 0; k <= t; k++) {
                            layers1D[t][k] = disc * (pu * layers1D[t + 1][k + 1] + pd * layers1D[t + 1][k]);
                        }
                    }

                    let ptr = 0;
                    for (let t = 0; t <= curN; t++) {
                        const y = -PYRAMID_H * 0.5 + (t / curN) * PYRAMID_H;
                        for (let k = 0; k <= t; k++) {
                            const x = ((2.0 * k - t) / curN) * PYRAMID_W;
                            flat1D[ptr]     = x;
                            flat1D[ptr + 1] = y;
                            flat1D[ptr + 2] = 0.0; // Flat in z
                            flat1D[ptr + 3] = layers1D[t][k];
                            flat1D[ptr + 4] = t / curN;
                            flat1D[ptr + 5] = t > 0 ? (k / t) : 0.5;
                            flat1D[ptr + 6] = 0.5;
                            flat1D[ptr + 7] = (defaultParams.S1 * Math.pow(u1, 2 * k - t) - 100.0) / defaultParams.S1;
                            ptr += 8;
                        }
                    }

                    latticeData = {
                        price: latticePrice,
                        totalNodes,
                        flatBuffer: flat1D,
                        layers: layers1D.map((arr) => {
                            const len = arr.length;
                            const res = new Float64Array(len * len);
                            for (let i = 0; i < len; i++) {
                                for (let j = 0; j < len; j++) res[i * len + j] = arr[i];
                            }
                            return res;
                        })
                    };

                    gl.bindBuffer(gl.ARRAY_BUFFER, vboNodes);
                    gl.bufferSubData(gl.ARRAY_BUFFER, 0, flat1D);
                    return;
                }

                const params = {
                    ...defaultParams,
                    rho: curRho
                };

                // Ensure admissibility
                const minN = MathLib.minAdmissibleN(params);
                if (curN < minN) curN = minN;

                margrabeExact = MathLib.margrabe(params.S1, params.S2, params.sigma1, params.sigma2, params.rho, params.r, params.T);
                latticeData = MathLib.buildLattice(params, curN, PYRAMID_W, PYRAMID_H);
                latticePrice = latticeData.price;
                priceError = Math.abs(latticePrice - margrabeExact);
                errorPct = (priceError / margrabeExact) * 100.0;

                gl.bindBuffer(gl.ARRAY_BUFFER, vboNodes);
                gl.bufferSubData(gl.ARRAY_BUFFER, 0, latticeData.flatBuffer);
            };

            updatePricing(true);

            // Timeline Parameters (Total: 20.0s)
            const DUR_GROW   = 5.0;  // 5.0s: crystal layers assemble from root upward
            const DUR_EXPIRY = 2.0;  // 2.0s: terminal exercise hinge glows on top face & lens
            const DUR_WAVE   = 8.0;  // 8.0s: backward induction wave sweeps down to root
            const DUR_RESULT = 3.5;  // 3.5s: golden flash at root & numerical comparison
            const DUR_REFINE = 1.5;  // 1.5s: n doubles, crystal crossfades
            const CYCLE_TOTAL = DUR_GROW + DUR_EXPIRY + DUR_WAVE + DUR_RESULT + DUR_REFINE;

            let simTime = 0.0;
            let lastClickMs = 0;
            let lastTagMs = 0;
            let userCamYaw = 0.0, userCamPitch = 0.22;

            const prefersReducedMotion = typeof window !== "undefined"
                && window.matchMedia
                && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

            if (prefersReducedMotion) {
                curN = 32;
                updatePricing(true);
            }

            // Click Interaction: Advance to next step count (600 ms cooldown)
            if (root.KW && root.KW.onClick) {
                root.KW.onClick(cvs, () => {
                    const now = performance.now();
                    if (now - lastClickMs < 600) return;
                    lastClickMs = now;
                    stepIdx = (stepIdx + 1) % N_STEPS.length;
                    curN = N_STEPS[stepIdx];
                    updatePricing(true);
                    lastTagMs = 0;
                });
            }

            let sceneTarget = null;
            const matProj = new Float32Array(16);
            const matView = new Float32Array(16);
            const matVP   = new Float32Array(16);

            // Caption Updater (<= 4 Hz)
            const updateCaption = (nowMs) => {
                if (nowMs - lastTagMs < 250 && lastTagMs !== 0) return;
                lastTagMs = nowMs;

                let caption;
                if (isOneAssetMode) {
                    const nodeCount = latticeData ? latticeData.totalNodes : (((curN + 1) * (curN + 2)) / 2);
                    caption = `European call option (one asset) · binomial lattice · n = ${curN} · ${nodeCount.toLocaleString("en-GB")} nodes · lattice ${latticePrice.toFixed(2)} · Black–Scholes exact ${bsExact.toFixed(2)} · error ${priceError.toFixed(2)} (${errorPct.toFixed(2)}%) · strike bond K = $100 · press B: toggle Margrabe crystal · Illustrative: S=100, σ=30%, r=3%, T=1y`;
                } else {
                    const nodeCount = latticeData ? latticeData.totalNodes : (((curN + 1) * (curN + 2) * (2 * curN + 3)) / 6);
                    caption = `Exchange option on two assets · bivariate binomial lattice · n = ${curN} · ${nodeCount.toLocaleString("en-GB")} nodes · lattice ${latticePrice.toFixed(2)} · Margrabe exact ${margrabeExact.toFixed(2)} · error ${priceError.toFixed(2)} (${errorPct.toFixed(2)}%) · ρ = ${curRho.toFixed(2)} (move pointer) · click: double steps · Illustrative: S₁=S₂=100, σ₁=30%, σ₂=20%, r=3%, T=1y`;
                }
                if (root.KW && root.KW.tag) root.KW.tag(caption, cvs);
            };

            return {
                resize: (rw, rh) => {
                    if (!sceneTarget) sceneTarget = gfx.target(rw, rh, { fp32: false, depth: true });
                    else sceneTarget.resize(rw, rh);
                },

                frame: (t, dt, ctx2d, outW, outH, isReduced) => {
                    const nowMs = performance.now();

                    // Pointer input via KW.local
                    if (root.KW && root.KW.local && !isReduced) {
                        const m = root.KW.local(cvs);
                        const rectW = cvs.clientWidth || 800;
                        const rectH = cvs.clientHeight || 600;
                        if (m && typeof m.x === "number" && !Number.isNaN(m.x) && m.x >= 0 && m.x <= rectW && m.y >= 0 && m.y <= rectH) {
                            const normX = Math.max(0.0, Math.min(1.0, m.x / Math.max(1, rectW)));
                            const normY = Math.max(0.0, Math.min(1.0, m.y / Math.max(1, rectH)));
                            // Map horizontal pointer position to rho in [-0.9, 0.9]
                            targetRho = -0.9 + normX * 1.8;

                            // Gentle cursor parallax
                            const dx = normX - 0.5;
                            const dy = normY - 0.5;
                            userCamYaw += (dx * 0.40 - userCamYaw) * 0.08;
                            userCamPitch += ((0.22 - dy * 0.28) - userCamPitch) * 0.08;
                        }
                    }

                    // Damped correlation update
                    if (!isReduced) {
                        curRho += (targetRho - curRho) * 0.10;
                    }
                    updatePricing(false);

                    // Timeline calculation
                    let growVal = 1.0;
                    let waveY = 0.0;
                    let waveActive = 0.0;
                    let rootFlash = 0.0;
                    let refineFade = 1.0;
                    let lensSharpness = 1.0;
                    let hingeIntensity = 0.0;

                    if (!isReduced) {
                        simTime += dt;
                        const phaseTime = simTime % CYCLE_TOTAL;

                        if (phaseTime < DUR_GROW) {
                            // Phase 1: Grow (0 - 5s)
                            const u = phaseTime / DUR_GROW;
                            growVal = Math.min(1.0, u * 1.02);
                            waveY = 1.0;
                            waveActive = 0.0;
                            lensSharpness = 1.0;
                            hingeIntensity = 0.0;
                        } else if (phaseTime < DUR_GROW + DUR_EXPIRY) {
                            // Phase 2: Expiry (5 - 7s)
                            growVal = 1.0;
                            waveY = 1.0;
                            waveActive = 0.0;
                            lensSharpness = 1.0;
                            const tau = (phaseTime - DUR_GROW) / DUR_EXPIRY;
                            hingeIntensity = Math.min(1.0, tau * 2.0);
                        } else if (phaseTime < DUR_GROW + DUR_EXPIRY + DUR_WAVE) {
                            // Phase 3: Backward Induction Wave (7 - 15s)
                            growVal = 1.0;
                            const tau = (phaseTime - (DUR_GROW + DUR_EXPIRY)) / DUR_WAVE;
                            waveY = 1.0 - tau;
                            waveActive = 1.0;
                            lensSharpness = waveY; // Sharp kink at expiry, smooths continuously to root
                            hingeIntensity = 0.65;
                        } else if (phaseTime < DUR_GROW + DUR_EXPIRY + DUR_WAVE + DUR_RESULT) {
                            // Phase 4: Root Flash & Result Comparison (15 - 18.5s)
                            growVal = 1.0;
                            waveY = 0.0;
                            waveActive = 0.0;
                            lensSharpness = 0.0;
                            hingeIntensity = 0.35;
                            const tau = (phaseTime - (DUR_GROW + DUR_EXPIRY + DUR_WAVE));
                            rootFlash = Math.exp(-tau * 2.2);
                        } else {
                            // Phase 5: Refine (n doubles with crossfade, 18.5 - 20s)
                            const tau = (phaseTime - (DUR_GROW + DUR_EXPIRY + DUR_WAVE + DUR_RESULT)) / DUR_REFINE;
                            growVal = 1.0;
                            waveY = 0.0;
                            waveActive = 0.0;
                            lensSharpness = 0.0;
                            hingeIntensity = 0.20;
                            refineFade = 0.5 + 0.5 * Math.cos(tau * Math.PI);

                            if (tau > 0.48 && tau < 0.52) {
                                stepIdx = (stepIdx + 1) % N_STEPS.length;
                                curN = N_STEPS[stepIdx];
                                updatePricing(true);
                            }
                        }
                    } else {
                        // prefers-reduced-motion: one converged frame
                        growVal = 1.0;
                        waveY = 0.0;
                        waveActive = 0.0;
                        rootFlash = 0.0;
                        refineFade = 1.0;
                        lensSharpness = 0.0;
                        hingeIntensity = 0.5;
                    }

                    const activeLayerIdx = Math.max(0, Math.min(curN, Math.round(waveY * curN)));

                    // Update Value Lens Heightfield from Active Layer Slice
                    if (latticeData && latticeData.layers) {
                        const activeVals = latticeData.layers[activeLayerIdx];
                        const stride = activeLayerIdx + 1;

                        for (let i = 0; i < LENS_RES; i++) {
                            const u = i / (LENS_RES - 1);
                            const k1 = Math.min(activeLayerIdx, Math.round(u * activeLayerIdx));
                            for (let j = 0; j < LENS_RES; j++) {
                                const v = j / (LENS_RES - 1);
                                const k2 = Math.min(activeLayerIdx, Math.round(v * activeLayerIdx));
                                const val = activeVals ? (activeVals[k1 * stride + k2] || 0.0) : 0.0;
                                const idx = (i * LENS_RES + j) * 6 + 3;
                                lensDynamicData[idx] = val;
                            }
                        }
                        gl.bindBuffer(gl.ARRAY_BUFFER, vboLens);
                        gl.bufferSubData(gl.ARRAY_BUFFER, 0, lensDynamicData);
                    }

                    // Camera Matrix Setup
                    const camRadius = isMob ? 6.2 : 4.8;
                    const autoYaw = isReduced ? 0.42 : (simTime * 0.11);
                    const camYaw = autoYaw + userCamYaw;
                    const camPitch = userCamPitch;

                    const eyeX = camRadius * Math.sin(camYaw) * Math.cos(camPitch);
                    const eyeY = camRadius * Math.sin(camPitch);
                    const eyeZ = camRadius * Math.cos(camYaw) * Math.cos(camPitch);

                    mat4Perspective(matProj, 42.0 * Math.PI / 180.0, outW / outH, 0.1, 50.0);
                    mat4LookAt(matView, [eyeX, eyeY, eyeZ], [0.25, 0.0, 0.0], [0.0, 1.0, 0.0]);
                    mat4Mul(matVP, matProj, matView);

                    // Dynamic Lines: Active Layer Bounding Box + Connecting Beam + Wave Crease
                    const activeY = -PYRAMID_H * 0.5 + waveY * PYRAMID_H;
                    const layerFrac = activeLayerIdx / Math.max(1, curN);
                    const curLayerW = PYRAMID_W * layerFrac;
                    const lensOrigin = [PYRAMID_W + 1.05, -0.15 + (waveY - 0.5) * 0.70, 0.0];
                    const lensScale = 0.65 * Math.max(0.08, (waveY + 0.12) / 1.12);

                    let lPtr = 0;
                    const pushDynLine = (x0, y0, z0, x1, y1, z1, r, g, b, a) => {
                        lineBuffer[lPtr++] = x0; lineBuffer[lPtr++] = y0; lineBuffer[lPtr++] = z0;
                        lineBuffer[lPtr++] = r;  lineBuffer[lPtr++] = g;  lineBuffer[lPtr++] = b;  lineBuffer[lPtr++] = a;
                        lineBuffer[lPtr++] = x1; lineBuffer[lPtr++] = y1; lineBuffer[lPtr++] = z1;
                        lineBuffer[lPtr++] = r;  lineBuffer[lPtr++] = g;  lineBuffer[lPtr++] = b;  lineBuffer[lPtr++] = a;
                    };

                    if (isOneAssetMode) {
                        const yBot = -PYRAMID_H * 0.5, yTop = PYRAMID_H * 0.5;
                        const cRidge = [0.30, 0.45, 0.65, 0.25];
                        const cBase  = [0.40, 0.55, 0.80, 0.35];
                        pushDynLine(0, yBot, 0, -PYRAMID_W, yTop, 0, ...cRidge);
                        pushDynLine(0, yBot, 0,  PYRAMID_W, yTop, 0, ...cRidge);
                        pushDynLine(-PYRAMID_W, yTop, 0, PYRAMID_W, yTop, 0, ...cBase);
                    } else {
                        lineBuffer.set(outlineData, 0);
                        lPtr = outlineData.length;
                    }

                    // Active layer perimeter frame (glowing bounding rectangle)
                    if (waveActive > 0.05 && layerFrac > 0.03 && !isOneAssetMode) {
                        const cBox = [0.55, 0.75, 1.0, waveActive * 0.55];
                        pushDynLine(-curLayerW, activeY, -curLayerW,  curLayerW, activeY, -curLayerW, ...cBox);
                        pushDynLine( curLayerW, activeY, -curLayerW,  curLayerW, activeY,  curLayerW, ...cBox);
                        pushDynLine( curLayerW, activeY,  curLayerW, -curLayerW, activeY,  curLayerW, ...cBox);
                        pushDynLine(-curLayerW, activeY,  curLayerW, -curLayerW, activeY, -curLayerW, ...cBox);

                        // Active layer diagonal hinge line (S1 = S2)
                        const cHinge = [1.2, 1.1, 0.9, waveActive * 0.75];
                        pushDynLine(-curLayerW, activeY, -curLayerW, curLayerW, activeY, curLayerW, ...cHinge);
                    }

                    // Luminous connecting beam linking active layer to Value Lens
                    if (waveActive > 0.02 && !isOneAssetMode) {
                        const cBeam = [0.50, 0.80, 1.0, waveActive * 0.80];
                        pushDynLine(curLayerW, activeY, 0.0, lensOrigin[0] - lensScale, lensOrigin[1], 0.0, ...cBeam);
                    }

                    gl.bindBuffer(gl.ARRAY_BUFFER, vboLines);
                    gl.bufferSubData(gl.ARRAY_BUFFER, 0, lineBuffer.subarray(0, lPtr));

                    // Accent Colour from KW.col.a
                    const aCol = (root.KW && root.KW.col && root.KW.col.a) ? root.KW.col.a : [56, 189, 248];
                    const accent = [aCol[0] / 255, aCol[1] / 255, aCol[2] / 255];
                    const dpr = Math.min(typeof window !== "undefined" ? (window.devicePixelRatio || 1) : 1, 2);

                    // -------------------------------------------------------------
                    // RENDER PASS: Offscreen HDR Target
                    // -------------------------------------------------------------
                    sceneTarget.clear(0, 0, 0, 1);
                    gl.enable(gl.DEPTH_TEST);
                    gl.depthMask(false); // Additive volumetric look: depth test without write

                    // 1. Dust Particles
                    gl.enable(gl.BLEND);
                    gl.blendFunc(gl.ONE, gl.ONE);
                    progDust.use()
                        .mat4("uViewProj", matVP)
                        .f1("uTime", simTime)
                        .f3("uAccent", accent[0], accent[1], accent[2]);
                    gl.bindVertexArray(vaoDust);
                    gl.drawArrays(gl.POINTS, 0, isMob ? 90 : 200);

                    // 2. Structural Wireframe Lines, Active Frame & Connecting Beam
                    progLines.use()
                        .mat4("uViewProj", matVP)
                        .f1("uAlpha", 1.0);
                    gl.bindVertexArray(vaoLines);
                    gl.drawArrays(gl.LINES, 0, lPtr / 7);

                    // 3. Exercise Hinge Ribbon on Top Expiry Face
                    if (hingeIntensity > 0.01 && !isOneAssetMode) {
                        progHinge.use()
                            .mat4("uViewProj", matVP)
                            .f1("uTopY", PYRAMID_H * 0.5 + 0.005)
                            .f1("uIntensity", hingeIntensity)
                            .f3("uAccent", accent[0], accent[1], accent[2])
                            .f1("uTime", simTime);
                        gl.bindVertexArray(vaoHinge);
                        gl.drawArrays(gl.TRIANGLES, 0, 6);
                    }

                    // 4. Value Lens Heightfield Mesh
                    if (!isOneAssetMode) {
                        progLens.use()
                            .mat4("uViewProj", matVP)
                            .f3("uLensOrigin", lensOrigin[0], lensOrigin[1], lensOrigin[2])
                            .f1("uScale", lensScale)
                            .f1("uHeightScale", 0.009)
                            .f3("uAccent", accent[0], accent[1], accent[2])
                            .f1("uTime", simTime)
                            .f1("uSharpness", lensSharpness)
                            .f1("uAlpha", 0.90);
                        gl.bindVertexArray(vaoLens);
                        gl.drawElements(gl.TRIANGLES, (LENS_RES - 1) * (LENS_RES - 1) * 6, gl.UNSIGNED_SHORT, 0);
                    }

                    // 5. Crystal Nodes Point Cloud
                    const numNodes = latticeData ? latticeData.totalNodes : 1;
                    const maxPayoff = Math.max(10.0, defaultParams.S1 * 0.40);
                    progNodes.use()
                        .mat4("uViewProj", matVP)
                        .mat4("uView", matView)
                        .f1("uTime", simTime)
                        .f3("uAccent", accent[0], accent[1], accent[2])
                        .f1("uGrow", growVal)
                        .f1("uWaveY", waveY)
                        .f1("uWaveActive", waveActive)
                        .f1("uRootFlash", rootFlash)
                        .f1("uRefineFade", refineFade)
                        .f1("uMaxVal", maxPayoff)
                        .f1("uN", curN)
                        .f1("uDPR", dpr)
                        .f1("uFocalDist", camRadius);

                    gl.bindVertexArray(vaoNodes);
                    gl.drawArrays(gl.POINTS, 0, numNodes);

                    gl.disable(gl.DEPTH_TEST);
                    gl.disable(gl.BLEND);
                    gl.bindVertexArray(null);

                    // -------------------------------------------------------------
                    // POST-PROCESSING: 5-Level Bloom & Filmic Tonemapping
                    // -------------------------------------------------------------
                    gfx.compose(sceneTarget, ctx2d, outW, outH, {
                        time: simTime,
                        bloomGain: 0.35,
                        bloomRadius: 1.05,
                        exposure: 1.02,
                        grain: 0.032,
                        dither: true
                    });

                    // Live Numerical Readout
                    updateCaption(nowMs);
                },

                dispose: () => {
                    cvs.removeEventListener("keydown", onKeyDown);
                    window.removeEventListener("keydown", onGlobalKey);
                    if (sceneTarget) sceneTarget.destroy();
                    gl.deleteBuffer(vboNodes);
                    gl.deleteVertexArray(vaoNodes);
                    gl.deleteBuffer(vboLines);
                    gl.deleteVertexArray(vaoLines);
                    gl.deleteBuffer(vboHinge);
                    gl.deleteVertexArray(vaoHinge);
                    gl.deleteBuffer(vboLens);
                    gl.deleteBuffer(iboLens);
                    gl.deleteVertexArray(vaoLens);
                    gl.deleteBuffer(vboDust);
                    gl.deleteVertexArray(vaoDust);
                }
            };
        }, fallback2D);
    };

    // Register engine and bind simulation key
    ENGINES["crystal"] = createCrystalSim;
    SIMS["options-pricing"] = createCrystalSim;
}));
