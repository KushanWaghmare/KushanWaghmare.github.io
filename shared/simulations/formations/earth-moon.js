    class EarthMoonContactFormation extends Formation {
        /* ============================================================================
           PIXEL-ART EARTH & MOON (matches the supplied 100x100 pixel-art reference)
           - Every visible particle is ONE flat square "pixel" on a global screen grid (the point shader snaps
             particles to that grid and draws hard squares when formation.pixelArt is true).
           - 12-colour palette sampled from the reference; flat navy background (34,32,53).
           - Earth: 25-cell-radius disc, light from the upper right: ocean / dark-blue night crescent (lower left),
             green + teal land, lilac and white clouds (some floating past the limb), cyan atmosphere rim and shallows.
           - Earth spins on its tilted axis (real coastlines, so India is where it should be).
             Hero Particle 0 is pinned to India (21.5N, 78.5E) with a pixel radar ring and rides the rotation.
           - A small yellow cratered Moon starts upper-right (as in the reference), revolves around the Earth,
             transits in front of it and is hidden (painter's order) when it goes behind it.
           - Cursor lens is applied as an inverse-mapped pixel lens, so pixels never overlap or leave holes.
           ============================================================================ */
        constructor(origin, simKey = "hub:contact", params = {}, sectionIndex = 6) {
            super(origin, simKey);
            this.params = params || {};
            this.sectionIndex = sectionIndex;
            this.cameraDistance = 13.5;
            this.pixelArt = true;          // point shader: hard squares on a global pixel grid, flat colours; composite: flat pitch-black, no bloom/ACES/grain
            this.disableTwinkle = true;
            this.lookOverride = {
                bloomStrength: 0.0,
                bloomThreshold: 9.0,
                trailDecay: 0.001,         // no motion trails: crisp pixels
                streakScale: 0.001,
                celestialBrightness: 0.0,  // the pixel art draws its own stars
                backgroundTone: [0.0, 0.0, 0.0]
            };
            this.bloomStrength = this.lookOverride.bloomStrength;
            this.bloomThreshold = this.lookOverride.bloomThreshold;
            this.streakScale = this.lookOverride.streakScale;
            this.trailDecay = this.lookOverride.trailDecay;
            this.preserveHeroPosition = true;  // idleFrame() must not pull Hero Particle 0 off India
            this.preserveHeroColour = true;
            this.slotMap = null;
            this.nHeroBeacon = 25;

            // India (21.5N, 78.5E). Internal azimuth = -longitude so EAST is to the RIGHT when seen from space.
            const latInd = 21.5 * EM.D2R, lonInd = 78.5 * EM.D2R;
            this.indiaUnit = [Math.cos(latInd) * Math.cos(-lonInd), Math.sin(latInd), Math.cos(latInd) * Math.sin(-lonInd)];
            this.tilt = -0.25;                          // axial tilt (rad)
            this.spinRate = 0.10;                       // Earth rotation (rad/s): one turn ~63 s
            this.baseSpin = -lonInd - 84 * EM.D2R;      // India enters just right of centre
            this.moonRate = 0.10;                       // Moon revolution (rad/s)
            this.moonTheta0 = 0.0;                      // upper-right, as in the reference
            this.light = (() => { const v = [0.48, 0.50, 0.72], l = Math.hypot(v[0], v[1], v[2]); return [v[0] / l, v[1] / l, v[2] / l]; })();

            this.shift = { x: 0, y: 0 };
            this._fitted = false; this._dist = 13.5; this._pxw = 100;
            this._cx = 0; this._cy = 0; this._jac = [1, 0, 0, -1];   // screen = P0 + J*(dx,dy)
            this._cell = 9; this._cellDev = 9; this._dpr = 1; this._Rc = 25; this._ci = 0; this._cj = 0;
            this._grid = null; this._gridW = 0; this._gridH = 0; this._out = null;
            this._tgt = null; this._CE = [0, 0, 0];
            this.initialized = false;
        }

        applyPreset(preset) { this.localePreset = preset; }

        init(buffer, _ctx) {
            const N = buffer.maxCount || buffer.count || 90000;
            this.slotMap = new Int32Array(N);
            for (let i = 0; i < N; i++) this.slotMap[i] = i;
            this._tgt = new Float32Array(N * 3);
            this._N = N;
            const rgb = (r, g, b) => [r / 255, g / 255, b / 255];
            // palette indices: 1 ocean 2 dark ocean 3 green 4 teal 5 lilac 6 cyan 7 white 8 light blue 9 star 10 moon 11 crater 12-14 hero
            const P = [[0, 0, 0], rgb(100, 155, 255), rgb(90, 110, 225), rgb(107, 190, 48), rgb(56, 148, 111), rgb(203, 219, 252), rgb(95, 205, 228), rgb(255, 255, 255), rgb(77, 170, 235), rgb(244, 198, 160), rgb(249, 241, 58), rgb(237, 196, 150), rgb(255, 255, 255), rgb(255, 160, 60), rgb(235, 70, 70)];
            this.PAL = new Float32Array(P.length * 3);
            P.forEach((c, i) => { this.PAL[i * 3] = c[0]; this.PAL[i * 3 + 1] = c[1]; this.PAL[i * 3 + 2] = c[2]; });
            this.LM = EM.landMask();
            // deterministic star field in screen fractions
            const rnd = (function (s) { return function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; })(0x9E3779);
            this.stars = new Float32Array(160 * 2);
            for (let k = 0; k < 160; k++) { this.stars[k * 2] = rnd(); this.stars[k * 2 + 1] = rnd(); }
            // Moon craters (unit vectors, angular radius)
            this.craters = [];
            for (let q = 0; q < 12; q++) { const y = 1 - 2 * ((q + 0.5) / 12), rr = Math.sqrt(1 - y * y), ph = q * 2.399963 + 0.7; this.craters.push([rr * Math.cos(ph), y, rr * Math.sin(ph), 0.34 + 0.12 * ((q * 5) % 3) / 2]); }   // caps spread over the whole Moon
            this.initialized = true;
        }

        applyPermutation(perm, count) {
            if (!this.slotMap) return;
            const N = count | 0, tmp = new Int32Array(N);
            for (let i = 0; i < N; i++) tmp[i] = this.slotMap[perm[i]];
            this.slotMap.set(tmp);
        }

        /* Place the Earth centre on a pixel-grid cell and measure the screen<->world mapping */
        _fit(ctx, ins) {
            const W = window.innerWidth, H = window.innerHeight;
            const dpr = Math.max(1, (ctx && ctx.dpr) || Math.min(window.devicePixelRatio || 1, 2));
            const mob = (ctx && ctx.isMobile) || W < 820;
            const base = mob ? Math.min(W * 0.30, H * 0.19) : H * 0.285;
            const cellDev = Math.max(3, Math.round(base * dpr / 25));
            const cell = cellDev / dpr;
            this._cell = cell; this._cellDev = cellDev; this._dpr = dpr; this._mob = mob;
            this._Rc = Math.round(25 + 9 * ins);
            const tx = (mob ? 0.5 : 0.62 - 0.12 * ins) * W, ty = (mob ? 0.42 : 0.5) * H;
            this._ci = Math.round(tx / cell - 0.5); this._cj = Math.round((H - ty) / cell - 0.5);
            const sx = (this._ci + 0.5) * cell, sy = H - (this._cj + 0.5) * cell;
            const cam = ctx && ctx.camera;
            if (cam && cam.position) this._dist = Math.max(1.5, Math.hypot(cam.position.x - this.origin.x - this.shift.x, cam.position.y - this.origin.y - this.shift.y, cam.position.z - this.origin.z));
            if (!ctx || !ctx.project) { this.shift.x = 1.55 * (1 - ins); this._cx = sx; this._cy = sy; return; }
            if (ctx.transActive && this._fitted) {
                const P0 = ctx.project(this.origin.x + this.shift.x, this.origin.y + this.shift.y, this.origin.z);
                if (P0) { this._cx = P0[0]; this._cy = P0[1]; }
                return;
            }
            const iters = this._fitted ? 3 : 18;
            for (let it = 0; it < iters; it++) {
                const cx = this.origin.x + this.shift.x, cy = this.origin.y + this.shift.y, cz = this.origin.z;
                const P0 = ctx.project(cx, cy, cz), Px = ctx.project(cx + 1, cy, cz), Py = ctx.project(cx, cy + 1, cz);
                if (!P0 || !Px || !Py) return;
                const ax = Px[0] - P0[0], ay = Px[1] - P0[1], bx = Py[0] - P0[0], by = Py[1] - P0[1];
                const det = ax * by - ay * bx;
                if (Math.abs(det) < 1e-9) return;
                this._jac = [ax, bx, ay, by]; this._pxw = 0.5 * (Math.hypot(ax, ay) + Math.hypot(bx, by));
                this._cx = P0[0]; this._cy = P0[1];
                const ex = sx - P0[0], ey = sy - P0[1], f = this._fitted ? 0.6 : 0.8;
                this.shift.x += ((ex * by - ey * bx) / det) * f;
                this.shift.y += ((ax * ey - ay * ex) / det) * f;
            }
            const cx = this.origin.x + this.shift.x, cy = this.origin.y + this.shift.y, cz = this.origin.z;
            const P0 = ctx.project(cx, cy, cz), Px = ctx.project(cx + 1, cy, cz), Py = ctx.project(cx, cy + 1, cz);
            if (P0 && Px && Py) { this._cx = P0[0]; this._cy = P0[1]; this._jac = [Px[0] - P0[0], Py[0] - P0[0], Px[1] - P0[1], Py[1] - P0[1]]; }
            this._fitted = true;
        }

        // Circular lunar orbit in the camera frame, in units of the Earth radius. Inclined so the Moon transits in front and is occulted behind.
        _moonRel(theta, mob, Rpx, W) {
            const a = mob ? Math.max(1.35, Math.min(2.0, W * 0.5 / Rpx - 0.3)) : 2.02;
            const rho = (mob ? 62 : 42.6) * EM.D2R, inc = 14 * EM.D2R;
            const e1x = Math.cos(rho), e1y = Math.sin(rho);
            const sI = Math.sin(inc), cI = Math.cos(inc);
            const e2x = -Math.sin(rho) * sI, e2y = Math.cos(rho) * sI, e2z = cI;
            const ct = Math.cos(theta), st = Math.sin(theta);
            return [a * (ct * e1x + st * e2x), a * (ct * e1y + st * e2y), a * st * e2z];
        }

        update(_dt, t, buffer, ctx) {
            if (!this.initialized) this.init(buffer, ctx);
            const ins = this.insideness || 0;
            this._fit(ctx, ins);
            const W = window.innerWidth, H = window.innerHeight;
            const cell = this._cell, Rc = this._Rc, ci = this._ci, cj = this._cj;
            const gw = Math.ceil(W / cell) + 2, gh = Math.ceil(H / cell) + 2;
            if (!this._grid || this._gridW !== gw || this._gridH !== gh) { this._grid = new Uint8Array(gw * gh); this._out = new Uint8Array(gw * gh); this._gridW = gw; this._gridH = gh; }
            const G = this._grid; G.fill(0);
            const put = (i, j, v) => { if (i >= 0 && j >= 0 && i < gw && j < gh) G[j * gw + i] = v; };

            // Earth frame: v_cam = Re * v_earth, Re = Rz(tilt) * Ry(spin)
            const spin = this.baseSpin + t * this.spinRate;
            const cT = Math.cos(this.tilt), sT = Math.sin(this.tilt), cS = Math.cos(spin), sS = Math.sin(spin);
            const e0 = cT * cS, e1 = -sT, e2 = cT * sS, e3 = sT * cS, e4 = cT, e5 = sT * sS, e6 = -sS, e7 = 0, e8 = cS;
            const L = this.light, LM = this.LM, fbm = EM.fbm, D2R = EM.D2R;
            const drift = t * 0.03;

            /* ---- stars (screen-fixed, one cell each) ---- */
            const nStars = Math.min(160, Math.round(gw * gh * 0.002));
            for (let k = 0; k < nStars; k++) put(Math.floor(this.stars[k * 2] * gw), Math.floor(this.stars[k * 2 + 1] * gh), 9);

            /* ---- Moon ---- */
            const Rpx = Rc * cell;
            const theta = this.moonTheta0 + t * this.moonRate;
            const mv = this._moonRel(theta, this._mob, Rpx, W);
            const mox = mv[0], moy = mv[1], moz = mv[2];
            const mci = Math.round(ci + mox * Rc), mcj = Math.round(cj + moy * Rc);
            const MR = 4.55, psi = Math.atan2(moz, -mox), mcs = Math.cos(psi), msn = Math.sin(psi);
            const drawMoon = () => {
                const cr = this.craters;
                for (let dj = -5; dj <= 5; dj++) for (let di = -5; di <= 5; di++) {
                    const d2 = di * di + dj * dj; if (d2 > MR * MR) continue;
                    const nx = di / MR, ny = dj / MR, nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
                    const lx = nx * mcs - nz * msn, lz = nx * msn + nz * mcs;      // into the Moon's locked frame
                    let v = 10;
                    for (let c = 0; c < cr.length; c++) { if (Math.acos(Math.min(1, lx * cr[c][0] + ny * cr[c][1] + lz * cr[c][2])) < cr[c][3]) { v = 11; break; } }
                    put(mci + di, mcj + dj, v);
                }
            };
            if (moz < 0) drawMoon();                                              // behind the Earth: painted first, then covered

            /* ---- Earth: per-cell sphere shading in flat palette tones, plus cloud shell past the limb ---- */
            const R2 = Rc * Rc, shellR = 1.12;
            for (let dj = -Rc - 5; dj <= Rc + 5; dj++) {
                for (let di = -Rc - 5; di <= Rc + 5; di++) {
                    const nx = di / Rc, ny = dj / Rc, rho2 = nx * nx + ny * ny;
                    if (rho2 > shellR * shellR) continue;
                    const inside = di * di + dj * dj <= R2;
                    let px, py, pz, pr;
                    if (inside) { pr = 1.0; px = nx; py = ny; pz = Math.sqrt(Math.max(0, 1 - rho2)); }
                    else { pr = shellR; px = nx / pr; py = ny / pr; pz = Math.sqrt(Math.max(0, 1 - rho2 / (pr * pr))); }
                    const ex = e0 * px + e3 * py + e6 * pz, ey = e1 * px + e4 * py + e7 * pz, ez = e2 * px + e5 * py + e8 * pz;   // Earth-frame direction
                    const lat = Math.asin(Math.max(-1, Math.min(1, ey))) / D2R, lon = -Math.atan2(ez, ex) / D2R, al = Math.abs(lat);
                    const lit = px * L[0] + py * L[1] + pz * L[2];
                    let cn = fbm(ex * 3.1 + 7 + drift, ey * 3.1 + 2, ez * 3.1 + 4, 3);
                    cn += 0.22 * Math.max(0, Math.min(1, (al - 68) / 18));         // polar cloud caps
                    const cthr = inside ? 0.645 : 0.715;
                    if (!inside) {                                                 // floating cloud puffs beyond the limb: low-frequency noise -> chunky blobs
                        if (fbm(ex * 1.7 + 3 + drift, ey * 1.7, ez * 1.7 + 9, 2) > 0.62 && fbm(ex * 4 + 1, ey * 4, ez * 4, 2) > 0.45) put(ci + di, cj + dj, lit > 0.3 ? 7 : 5);
                        continue;
                    }
                    if (cn > cthr) { put(ci + di, cj + dj, (cn > cthr + 0.045 && lit > 0.45) ? 7 : 5); continue; }
                    const xi = ((Math.floor((lon + 180) / 360 * 720) % 720) + 720) % 720, yi = Math.min(359, Math.max(0, Math.floor((90 - lat) / 180 * 360)));
                    const land = LM.m[yi * 720 + xi], sf = LM.s[yi * 720 + xi];
                    const hf = fbm(ex * 9 + 1, ey * 9, ez * 9 + 3, 2);
                    let v;
                    if (land) {
                        if (al > 68) v = 5;
                        else if (hf > 0.78) v = 8;                                  // lakes / rivers
                        else v = lit < 0.36 ? 4 : 3;
                    } else {
                        if (al > 74 && hf > 0.45) v = 6;
                        else if (sf > 0.20) v = 6;                                  // shallows
                        else if (sf > 0.10) v = 8;
                        else if (lit < 0.36) v = 2;
                        else if (fbm(ex * 6, ey * 24, ez * 6, 2) > 0.74) v = 6;     // wave streaks
                        else v = 1;
                    }
                    if (rho2 > 0.67 && lit > 0.30 && v !== 5 && v !== 7) v = 6;     // cyan atmosphere rim on the lit limb
                    put(ci + di, cj + dj, v);
                }
            }
            if (moz >= 0) drawMoon();                                             // in front of the Earth

            /* ---- Hero Particle 0 + pixel radar ring, pinned to India ---- */
            const ui = this.indiaUnit;
            const hx = e0 * ui[0] + e1 * ui[1] + e2 * ui[2], hy = e3 * ui[0] + e4 * ui[1] + e5 * ui[2], hz = e6 * ui[0] + e7 * ui[1] + e8 * ui[2];
            const heroVis = hz > 0.06;
            const hn = Math.hypot(hx, hy) || 1, k = heroVis ? 1.0 : 1.0 / hn;             // behind the limb: the anchor slides along the limb
            const hi = Math.round(ci + hx * k * Rc), hj = Math.round(cj + hy * k * Rc);
            const ringOn = Math.sin(t * 5.0) > -0.2;
            if (heroVis) {
                for (let r = 0; r < 24; r++) {
                    let oi, oj;
                    if (r < 8) { const a = [[-1, -1], [0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0]][r]; oi = a[0]; oj = a[1]; if (!ringOn && (r & 1)) continue; }
                    else { const q = r - 8, side = Math.floor(q / 4), s = q % 4; if (side === 0) { oi = -2 + s; oj = -2; } else if (side === 1) { oi = 2; oj = -2 + s; } else if (side === 2) { oi = 2 - s; oj = 2; } else { oi = -2; oj = 2 - s; } if (!ringOn) continue; }
                    put(hi + oi, hj + oj, r < 8 ? 13 : 14);
                }
                put(hi, hj, 12);
            }

            /* ---- Cursor lens (inverse-mapped on the pixel grid) ---- */
            let Gout = G;
            const lens = (ctx && ctx.cursorLens) ? ctx.cursorLens(this.origin.x + this.shift.x, this.origin.y + this.shift.y, this.origin.z) : null;
            if (lens && lens.active) {
                const O = this._out; O.set(G); Gout = O;
                const lcx = lens.x / cell, lcy = (H - lens.y) / cell, rL = 54 / cell, rL2 = rL * rL, kk = lens.k, box = Math.ceil(rL * 3);
                const i0 = Math.max(0, Math.floor(lcx - box)), i1 = Math.min(gw - 1, Math.ceil(lcx + box)), j0 = Math.max(0, Math.floor(lcy - box)), j1 = Math.min(gh - 1, Math.ceil(lcy + box));
                for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
                    const dx = i + 0.5 - lcx, dy = j + 0.5 - lcy;
                    let rx = dx, ry = dy;
                    for (let it = 0; it < 4; it++) { const kq = Math.min(1.3, rL2 * kk * 0.95 / (rx * rx + ry * ry + rL2 * 0.25)); rx = dx / (1 + kq); ry = dy / (1 + kq); }
                    const si = Math.floor(lcx + rx), sj = Math.floor(lcy + ry);
                    O[j * gw + i] = (si >= 0 && sj >= 0 && si < gw && sj < gh) ? G[sj * gw + si] : 0;
                }
            }

            /* ---- Assign one particle per lit cell ---- */
            const N = buffer.count, pos = buffer.positions, col = buffer.colours, szb = buffer.sizes, slot = this.slotMap, PAL = this.PAL, tgt = this._tgt;
            const CEx = this.origin.x + this.shift.x, CEy = this.origin.y + this.shift.y, CEz = this.origin.z;
            this._CE = [CEx, CEy, CEz];
            const J = this._jac, det = J[0] * J[3] - J[1] * J[2], P0x = this._cx, P0y = this._cy;
            const wmap = (sx, sy) => { const ex = sx - P0x, ey = sy - P0y; return [CEx + (ex * J[3] - ey * J[1]) / det, CEy + (J[0] * ey - J[2] * ex) / det]; };
            for (let g = 0; g < N; g++) { const raw = slot ? slot[g] : g; szb[raw] = 0; }
            const nHero = this.nHeroBeacon;
            // hero particle 0 anchor (kept at India even when hidden so HUD labels follow it)
            { const wp = wmap((hi + 0.5) * cell, H - (hj + 0.5) * cell), raw0 = slot ? slot[0] : 0;
              pos[raw0 * 3] = wp[0]; pos[raw0 * 3 + 1] = wp[1]; pos[raw0 * 3 + 2] = CEz;
              col[raw0 * 3] = 1; col[raw0 * 3 + 1] = 1; col[raw0 * 3 + 2] = 1; tgt[0] = wp[0]; tgt[1] = wp[1]; tgt[2] = CEz; }
            let g = nHero, used = 0;                                                // slots 0..24 belong to the hero; one particle per lit cell after that
            const total = gw * gh;
            for (let idx = 0; idx < total && g < N; idx++) {
                const v = Gout[idx]; if (!v || v === 12) continue;                  // v === 12 is the hero's own cell (particle 0)
                const i = idx % gw, j = (idx / gw) | 0;
                const wp = wmap((i + 0.5) * cell, H - (j + 0.5) * cell);
                const gi = g;
                const raw = slot ? slot[gi] : gi, p3 = raw * 3;
                pos[p3] = wp[0]; pos[p3 + 1] = wp[1]; pos[p3 + 2] = CEz;
                col[p3] = PAL[v * 3]; col[p3 + 1] = PAL[v * 3 + 1]; col[p3 + 2] = PAL[v * 3 + 2];
                szb[raw] = cell;
                tgt[gi * 3] = wp[0]; tgt[gi * 3 + 1] = wp[1]; tgt[gi * 3 + 2] = CEz;
                g = gi + 1; used++;
            }
            // hero centre cell is particle 0 (drawn as a hero-coloured pixel)
            if (heroVis) { const raw0 = slot ? slot[0] : 0; szb[raw0] = cell; }
            // park unused particles (incl. spare beacon slots) at the Earth centre (transitions read targetFor)
            for (let q = 1; q < nHero; q++) { tgt[q * 3] = CEx; tgt[q * 3 + 1] = CEy; tgt[q * 3 + 2] = CEz; }
            for (let q = g; q < N; q++) { tgt[q * 3] = CEx; tgt[q * 3 + 1] = CEy; tgt[q * 3 + 2] = CEz; }
        }

        targetFor(i, out = new Vector3()) {
            if (!this._tgt || i * 3 + 2 >= this._tgt.length) return out.copy(this.origin);
            return out.set(this._tgt[i * 3], this._tgt[i * 3 + 1], this._tgt[i * 3 + 2]);
        }
    }

