(function (root) {
    "use strict";
    const TM = root.THREAD_MATH || (typeof require === "function" ? require("../core/thread-math.js") : null);
    const TF = root.THREAD_FORMATIONS || (typeof require === "function" ? require("../core/gpu-thread-formations.js") : null);
    const { Vector3, Formation, sectionOrigin, clamp, smoothstep } = TM;
    const { LOOK, registerFormation } = TF;

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
            const DM = root.DiffusionMath || (typeof require === "function" ? require("../math/diffusion-math.js") : null);
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
            const dw = this._dw || 0;
            const vw = this._vw || 0;

            // Exact VP-SDE marginal: x_t = α(t) x_0 + σ(t) z, plus stochastic Langevin score curl
            const jitScale = (this.odeMode ? 0.0 : (sigmaT * 0.22)) + dw * (0.12 + 0.22 * sigmaT);
            const tJit = tSim + (this._dwPhase || 0);
            const jx = Math.sin(tJit * 3.1 + i * 0.13) * jitScale;
            const jy = Math.cos(tJit * 2.9 + i * 0.17) * jitScale;
            const jz = Math.sin(tJit * 2.5 + i * 0.19) * jitScale;

            const lx = alphaT * x0 + sigmaT * zx * 1.65 + jx;
            const ly = alphaT * y0 + sigmaT * zy * 1.65 + jy;
            const lz = alphaT * z0 + sigmaT * zz * 1.65 + jz;

            const rx = lx * cosY - lz * sinY;
            const rz = lx * sinY + lz * cosY;
            const ry = ly * cosP - rz * sinP;
            const rz2 = ly * sinP + rz * cosP;

            const scale = 1.25 * (1.0 + 0.85 * (this.insideness || 0));
            outPos[outOffset]     = this.origin.x + offsetX + rx * scale;
            outPos[outOffset + 1] = this.origin.y + ry * scale;
            outPos[outOffset + 2] = this.origin.z + rz2 * scale;

            if (outCol) {
                // Score magnitude ||∇_x log p_t(x)|| = ||(x_t - α(t) x_0) / σ²(t)||
                // Transitions from warm amber prior noise (t ≈ 1) to luminous emerald/cyan manifold structure (t -> 0)
                const structureProgress = 1.0 - tDiff;
                const radial = clamp(Math.hypot(x0, y0, z0) / 3.2, 0.0, 1.0);
                const s4 = seeds ? seeds[i * 4 + 3] : 0.5;
                const b = 0.17 + 0.30 * s4 * s4 + 0.12 * structureProgress;
                let rCol = ((1.0 - structureProgress) * 0.96 + structureProgress * (0.14 + 0.25 * radial)) * b;
                let gCol = ((1.0 - structureProgress) * 0.58 + structureProgress * (0.82 - 0.18 * radial)) * b;
                let bCol = ((1.0 - structureProgress) * 0.22 + structureProgress * (0.76 + 0.22 * radial)) * b;
                if (vw > 1e-3) {
                    const cyanBoost = vw * (0.35 + 0.65 * structureProgress);
                    rCol += cyanBoost * 0.08;
                    gCol += cyanBoost * 0.26;
                    bCol += cyanBoost * 0.38;
                }
                if (dw > 1e-3) {
                    const amberBoost = dw * (0.45 + 0.55 * tDiff);
                    rCol += amberBoost * 0.34;
                    gCol += amberBoost * 0.20;
                    bCol += amberBoost * 0.04;
                }
                outCol[outOffset]     = clamp(rCol, 0.04, 0.95);
                outCol[outOffset + 1] = clamp(gCol, 0.04, 0.95);
                outCol[outOffset + 2] = clamp(bCol, 0.04, 0.95);
            }
            if (outSz && seeds) {
                outSz[i] = 0.85 + 0.65 * (1.0 - tDiff) + 0.65 * seeds[i * 4 + 3] + 0.35 * vw * (1.0 - tDiff) + 0.30 * dw;
            }
            if (i === 0) {
                const scale0 = 1.15 * (1.0 + 0.85 * (this.insideness || 0));
                const rx0 = x0 * cosY - z0 * sinY;
                const rz0 = x0 * sinY + z0 * cosY;
                const ry0 = y0 * cosP - rz0 * sinP;
                const rz20 = y0 * sinP + rz0 * cosP;
                outPos[outOffset]     = this.origin.x + offsetX + rx0 * scale0;
                outPos[outOffset + 1] = this.origin.y + ry0 * scale0;
                outPos[outOffset + 2] = this.origin.z + rz20 * scale0;
                if (outCol) {
                    outCol[outOffset]     = 1.55;
                    outCol[outOffset + 1] = 2.15;
                    outCol[outOffset + 2] = 1.85;
                }
                if (outSz) outSz[0] = 5.8;
            }
        }

        update(dt, t, buffer, ctx) {
            if (!this.initialized || !this.targets) this.init(buffer, ctx);
            const DM = root.DiffusionMath || (typeof require === "function" ? require("../math/diffusion-math.js") : null);

            const dtSec = dt || 0.016;
            const eqObj = (typeof window !== "undefined") && window.__SECTION_EQ_MODE__;
            const eqMode = (eqObj && (!eqObj.sim || eqObj.sim === this.id)) ? (eqObj.mode || 0) : 0;
            this._dw = (this._dw || 0) + (((eqMode === 1 ? 1 : 0) - (this._dw || 0)) * Math.min(1, dtSec * 6));
            this._vw = (this._vw || 0) + (((eqMode === 2 ? 1 : 0) - (this._vw || 0)) * Math.min(1, dtSec * 6));
            this._dwPhase = (this._dwPhase || 0) + dtSec * this._dw * 2.4;

            this.cycleTime += dtSec * (1.0 + 0.85 * this._vw);
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
            if (this._vw > 1e-3) {
                tDiff = Math.max(0.01, tDiff * (1.0 - 0.45 * this._vw));
            }

            const alphaT = (DM && DM.alpha) ? DM.alpha(tDiff) : Math.sqrt(1.0 - tDiff * tDiff);
            const sigma2T = (DM && DM.sigma2) ? DM.sigma2(tDiff) : (tDiff * tDiff);
            const sigmaT = Math.sqrt(Math.max(1e-5, sigma2T));

            const ptrX = (ctx && ctx.pointerX) || 0;
            const ptrY = (ctx && ctx.pointerY) || 0;
            const yaw = t * 0.22 + 0.34 * Math.sin(t * 0.11) + ptrX * 0.55;
            const pitch = -0.28 + 0.16 * Math.sin(t * 0.083 + 1.0) + ptrY * 0.30;
            const cosY = Math.cos(yaw), sinY = Math.sin(yaw);
            const cosP = Math.cos(pitch), sinP = Math.sin(pitch);
            const offsetX = ((ctx && (ctx.isMobile || ctx.centred)) ? 0.0 : 2.25) * (1.0 - 0.85 * (this.insideness || 0));
            const lens = (ctx && ctx.cursorLens) ? ctx.cursorLens(this.origin.x + offsetX, this.origin.y, this.origin.z) : null;

            const N = buffer.count;
            const pos = buffer.positions;
            const col = buffer.colours;
            const sz = buffer.sizes;
            const seeds = buffer.seeds;

            for (let i = 0; i < N; i++) {
                this._evalDiffusionPoint(i, tDiff, alphaT, sigmaT, cosY, sinY, cosP, sinP, offsetX, t, pos, i * 3, col, sz, seeds);
                if (lens && lens.active && i > 0) ctx.applyLens(pos, i * 3, lens);
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

    registerFormation("hub:domain-datascience", DataScienceFormation);
    registerFormation("domain:datascience:0", DataScienceFormation);
    TF.DataScienceFormation = DataScienceFormation;
}(typeof self !== "undefined" ? self : globalThis));
