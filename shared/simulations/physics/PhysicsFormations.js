(function (root) {
    "use strict";
    const TM = root.THREAD_MATH || (typeof require === "function" ? require("../core/thread-math.js") : null);
    const TF = root.THREAD_FORMATIONS || (typeof require === "function" ? require("../core/gpu-thread-formations.js") : null);
    const { Vector3, Formation, sectionOrigin, clamp, smoothstep } = TM;
    const { LOOK, registerFormation } = TF;

    /* ============================================================================
       2. PHYSICS FORMATION — Kerr Black Hole (a/M = 0.99) & Relativistic Accretion Disc
       Wraps shared/blackhole-physics.js (isco, keplerianOmega, fourVelocityUt, pageThorneFlux).
       Shared buffer particles orbit in the Novikov–Thorne accretion disc with Keplerian
       differential rotation, gravitational redshift, g^4 Doppler beaming, and lensed
       Einstein-ring warps. Heavy lensing/photon-ring shader renders in the SAME scene
       and fades in via uAuxOpacity only after particles have settled.
       ============================================================================ */
    class BlackHoleFormation extends Formation {
        constructor(origin, simKey = "hub:domain-physics", params = {}, sectionIndex = 2) {
            super(origin, simKey);
            this.params = params || {};
            this.sectionIndex = sectionIndex;
            this.spin = 0.95;
            this.rIsco = 1.937;
            this.rOut = 15.0;
            this.radii = null;
            this.phi0 = null;
            this.omega = null;
            this.ut = null;
            this.tempScale = null;
            this.role = null;
            this.tilt = 1.38; // ~79 deg inclination
            this.cameraDistance = 13.5;
            this.kerrOverlay = {
                screenX: 0.66,
                screenY: 0.50,
                scale: 34.0,
                spin: 0.95,
                tilt: 1.38
            };
            this.presetTilt = null;
            this.presetSpin = null;
            this.intensity = 1.0;
            this.reveal = 1.0;
        }

        setIntensity(val) {
            this.intensity = clamp(typeof val === "number" ? val : 1.0, 0.0, 1.0);
        }

        setReveal(val) {
            this.reveal = clamp(typeof val === "number" ? val : 1.0, 0.0, 1.0);
        }

        applyPreset(preset) {
            this.localePreset = preset;
            if (preset) {
                if (typeof preset.inclination === "number") {
                    this.presetTilt = (preset.inclination * Math.PI) / 180.0;
                }
                if (typeof preset.spin === "number") {
                    this.presetSpin = preset.spin;
                    this.spin = preset.spin;
                    this.kerrOverlay.spin = preset.spin;
                }
            }
        }

        _blackbodyRGB(T, out, i3) {
            const t = clamp(T, 1000.0, 35000.0) * 0.01;
            const tA = Math.max(t - 60.0, 1.0);
            const tB = Math.max(t - 10.0, 1.0);
            out[i3] = t <= 66.0 ? 1.0 : clamp((329.6987 * Math.pow(tA, -0.1332)) / 255.0, 0.0, 1.0);
            out[i3 + 1] = t <= 66.0
                ? clamp((99.4708 * Math.log(t) - 161.1196) / 255.0, 0.0, 1.0)
                : clamp((288.1222 * Math.pow(tA, -0.0755)) / 255.0, 0.0, 1.0);
            out[i3 + 2] = t >= 66.0 ? 1.0 : (t <= 19.0 ? 0.0 : clamp((138.5177 * Math.log(tB) - 305.0448) / 255.0, 0.0, 1.0));
        }

        init(buffer, _ctx) {
            const BP = root.BLACKHOLE_PHYSICS || (typeof require === "function" ? require("../blackhole/blackhole-physics.js") : null);
            const N = buffer.maxCount;
            this.radii = new Float32Array(N);
            this.phi0 = new Float32Array(N);
            this.omega = new Float32Array(N);
            this.ut = new Float32Array(N);
            this.tempScale = new Float32Array(N);
            this.role = new Uint8Array(N);

            const a = this.spin;
            this.rIsco = (BP && BP.isco) ? BP.isco(a, 1) : 1.937;
            const rIsco = this.rIsco;
            const rOut = this.rOut;

            let fMax = 1e-6;
            if (BP && BP.pageThorneFlux) {
                for (let k = 1; k <= 128; k++) {
                    const rk = rIsco + (rOut - rIsco) * (k / 128);
                    const fk = BP.pageThorneFlux(rk, a, rIsco);
                    if (fk > fMax) fMax = fk;
                }
            }

            const seeds = buffer.seeds;
            for (let i = 0; i < N; i++) {
                const i4 = i * 4;
                const u1 = seeds[i4], u2 = seeds[i4 + 1];
                // Keep glints outside the event horizon shadow (r >= 6.2 M) so they never draw flat dashes across the shadow!
                const rMinSafe = Math.max(rIsco + 4.2, 6.2);
                const r = (i === 0)
                    ? 6.8
                    : (rMinSafe + (rOut - rMinSafe) * Math.pow(u1, 1.25));
                this.radii[i] = r;
                this.phi0[i] = u2 * Math.PI * 2.0 + 1.25 * Math.log(Math.max(1.0, r));

                const om = (BP && BP.keplerianOmega) ? BP.keplerianOmega(r, a, 1) : (1.0 / (Math.pow(r, 1.5) + a));
                const utVal = (BP && BP.fourVelocityUt) ? BP.fourVelocityUt(r, a, om) : 1.15;
                const flux = (BP && BP.pageThorneFlux) ? (BP.pageThorneFlux(r, a, rIsco) / fMax) : Math.exp(-(r - rIsco) * 0.35);

                this.omega[i] = om;
                this.ut[i] = Number.isFinite(utVal) ? utVal : 1.2;
                this.tempScale[i] = Math.pow(clamp(flux, 0.05, 1.0), 0.25);
                this.role[i] = 0;
            }

            this.initialized = true;
        }

        applyPermutation(perm, count) {
            if (!this.radii) return;
            const N = count | 0;
            const rTmp = new Float32Array(N);
            const pTmp = new Float32Array(N);
            const oTmp = new Float32Array(N);
            const uTmp = new Float32Array(N);
            const tTmp = new Float32Array(N);
            const roleTmp = new Uint8Array(N);
            for (let i = 0; i < N; i++) {
                const s = perm[i];
                rTmp[i] = this.radii[s];
                pTmp[i] = this.phi0[s];
                oTmp[i] = this.omega[s];
                uTmp[i] = this.ut[s];
                tTmp[i] = this.tempScale[s];
                roleTmp[i] = this.role[s];
            }
            this.radii.set(rTmp);
            this.phi0.set(pTmp);
            this.omega.set(oTmp);
            this.ut.set(uTmp);
            this.tempScale.set(tTmp);
            this.role.set(roleTmp);
        }

        _evalParticleState(i, t, sinObs, cosObs, offsetX, seeds, outPos, i3, outCol, outSz) {
            const i4 = i * 4;
            const r = this.radii[i];
            const om = this.omega[i];
            const ut = this.ut[i];
            const tScale = this.tempScale[i];

            const phi = this.phi0[i] + om * t * 5.2;
            const cosPhi = Math.cos(phi);
            const sinPhi = Math.sin(phi);

            const alphaImpact = -r * cosPhi;
            const L = -alphaImpact * sinObs;
            const denom = ut * (1.0 - om * L);
            const g = denom > 1e-4 ? clamp(1.0 / denom, 0.25, 2.65) : 1.0;

            const scale = 0.42 * (1.0 + 0.25 * (this.insideness || 0));
            const diskH = (seeds[i4 + 3] - 0.5) * 0.04 * r;
            const xDisk = -r * cosPhi;
            const zDisk = r * sinPhi;
            const lx = xDisk;
            const ly = zDisk * cosObs + diskH * sinObs;
            const lz = zDisk * sinObs - diskH * cosObs;

            outPos[i3]     = this.origin.x + offsetX + lx * scale;
            outPos[i3 + 1] = this.origin.y + ly * scale;
            outPos[i3 + 2] = this.origin.z + lz * scale;

            // Projected impact radius in units of M: hide any glint passing across the central shadow (b < 5.6 M)
            const bProj = Math.hypot(lx, ly);
            const shadowMask = smoothstep(5.4, 6.8, bProj);

            if (outCol) {
                const gEff = Math.pow(g, 0.58);
                const Tobs = 8200.0 * tScale * gEff;
                this._blackbodyRGB(Tobs, outCol, i3);
                const boost = clamp(Math.pow(g, 2.1) * (0.35 + 0.65 * tScale), 0.10, 1.25) * shadowMask;
                outCol[i3]     = clamp(outCol[i3] * boost, 0.0, 1.0);
                outCol[i3 + 1] = clamp(outCol[i3 + 1] * boost, 0.0, 1.0);
                outCol[i3 + 2] = clamp(outCol[i3 + 2] * boost, 0.0, 1.0);
            }
            if (outSz) {
                outSz[i] = (1.15 + 0.85 * tScale * clamp(g, 0.6, 1.5)) * (0.8 + 0.4 * seeds[i4 + 3]) * shadowMask;
            }
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
            const dbg = (typeof window !== "undefined") ? window.__KERR_DEBUG__ : null;
            if (dbg && dbg.inc !== null && dbg.inc !== undefined) {
                this.tilt = (dbg.inc * Math.PI) / 180.0;
            } else {
                const idleDrift = 0.045 * Math.sin(t * 0.35);
                const neutralTilt = (typeof this.presetTilt === "number") ? this.presetTilt : 1.36;
                const baseInclination = neutralTilt + idleDrift * 0.6 - ptrY * 0.30;
                const targetTilt = clamp(baseInclination, 0.15, 1.48);

                const dtSec = clamp(_dt || 0.016, 0.001, 0.1);
                const prevTilt = this.tilt;
                const damp = 1.0 - Math.exp(-7.5 * dtSec);
                this.tilt += (targetTilt - this.tilt) * damp;

                const tiltDeltaDeg = Math.abs(this.tilt - prevTilt) * (180.0 / Math.PI);
                if (tiltDeltaDeg > 0.2 && typeof window !== "undefined") {
                    window.__KERR_TILT_FAST__ = true;
                }
            }

            const ins = this.insideness || 0;
            const sinObs = Math.sin(this.tilt);
            const cosObs = Math.cos(this.tilt);
            const offsetX = ((ctx && (ctx.isMobile || ctx.centred)) ? 0.0 : 2.25) * (1.0 - 0.35 * ins);

            const isMob = (ctx && ctx.isMobile) || (typeof window !== "undefined" && window.innerWidth <= 768);
            const targetScreenX = isMob ? 0.50 : (0.60 - ptrX * 0.015);
            const centreScreenX = isMob ? 0.50 : 0.60;
            this.kerrOverlay.screenX = targetScreenX * (1.0 - 0.25 * ins) + centreScreenX * (0.25 * ins);
            this.kerrOverlay.screenY = isMob ? 0.62 : (0.50 + ptrY * 0.02);

            // Accretion disk & photon ring scale: unified to match Laniakea visual size
            const baseScale = isMob ? 44.0 : 42.0;
            const insideScale = isMob ? 34.0 : 26.0;
            this.kerrOverlay.scale = (dbg && dbg.scale !== undefined && dbg.scale !== null)
                ? dbg.scale
                : (baseScale * (1.0 - ins) + insideScale * ins);
            this.kerrOverlay.tilt = this.tilt;
            this.kerrOverlay.spin = (dbg && dbg.spin !== null && dbg.spin !== undefined) ? dbg.spin : this.spin;

            // Render subtle outer-corona glints (N_GLINTS = 48) + Hero Particle (i = 0)
            // Keep dormant particles on bounded coordinates with size = 0 so transition ranks never break
            const N_GLINTS = Math.min(48, N);
            const worldScale = 0.42 * (1.0 + 0.25 * ins);
            const lens = (ctx && ctx.cursorLens) ? ctx.cursorLens(this.origin.x + offsetX, this.origin.y, this.origin.z) : null;
            for (let i = 0; i < N_GLINTS; i++) {
                const i3 = i * 3;
                this._evalParticleState(i, t, sinObs, cosObs, offsetX, seeds, pos, i3, col, sz);
                if (lens && lens.active && i > 0) ctx.applyLens(pos, i3, lens);
                if (i === 0) {
                    sz[0] = 5.5;
                }
            }
            for (let i = N_GLINTS; i < N; i++) {
                const i3 = i * 3;
                const rDormant = this.radii[i];
                const phiDormant = this.phi0[i];
                pos[i3]     = this.origin.x + offsetX - rDormant * Math.cos(phiDormant) * worldScale;
                pos[i3 + 1] = this.origin.y + rDormant * Math.sin(phiDormant) * cosObs * worldScale;
                pos[i3 + 2] = this.origin.z + rDormant * Math.sin(phiDormant) * sinObs * worldScale;
                if (col) { col[i3] = 0.0; col[i3 + 1] = 0.0; col[i3 + 2] = 0.0; }
                if (sz) { sz[i] = 0.0; }
            }
        }

        targetFor(i, out = new Vector3()) {
            if (!this.initialized || !this.radii) return out.copy(this.origin);
            const idx = clamp(i | 0, 0, this.radii.length - 1);
            const sinObs = Math.sin(this.tilt), cosObs = Math.cos(this.tilt);
            const tmp = [0, 0, 0];
            this._evalParticleState(idx, 0.0, sinObs, cosObs, 2.35, [0.5, 0.5, 0.5, 0.5], tmp, 0, null, null);
            return out.set(tmp[0], tmp[1], tmp[2]);
        }
    }

    /* ============================================================================
       2B. GRAVITATIONAL N-BODY FORMATION (domain:physics:1)
       Symplectic Kick-Drift-Kick (KDK) self-gravitating spiral disc & Plummer core.
       ============================================================================ */
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
            const offsetX = ((ctx && (ctx.isMobile || ctx.centred)) ? 0.0 : 2.25) * (1.0 - 0.45 * (this.insideness || 0));
            const scale = 1.25 * (1.0 + 0.25 * (this.insideness || 0));
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
            const offsetX = ((ctx && (ctx.isMobile || ctx.centred)) ? 0.0 : 2.25) * (1.0 - 0.45 * (this.insideness || 0));
            const scale = 1.25 * (1.0 + 0.25 * (this.insideness || 0));
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

    registerFormation("hub:domain-physics", BlackHoleFormation);
    registerFormation("domain:physics:0", BlackHoleFormation);
    registerFormation("domain:physics:1", NBodyFormation);
    registerFormation("domain:physics:2", SchrodingerFormation);
    TF.BlackHoleFormation = BlackHoleFormation;
    TF.NBodyFormation = NBodyFormation;
    TF.SchrodingerFormation = SchrodingerFormation;
}(typeof self !== "undefined" ? self : globalThis));
