/* Portfolio Simulation Engines Library.
   Shared, parameter-driven mathematical and physical simulation engines.
   Each engine is a factory: (canvas, params) => void.
   Follows strict performance guidelines: fixed-step accumulator ODE/PDE updates,
   preallocated typed arrays, batched draw calls, and zero per-frame garbage. */

(function (root, factory) {
    if (typeof module === "object" && module.exports) {
        module.exports = factory();
    } else {
        root.ENGINES = factory();
    }
}(typeof self !== "undefined" ? self : this, function () {
    "use strict";

    const TAU = Math.PI * 2;

    const rgba = (rgb, a) => {
        if (!rgb) return `rgba(255,255,255,${a})`;
        return `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${a})`;
    };

    const randn = () => Math.sqrt(-2.0 * Math.log(1.0 - Math.random())) * Math.cos(TAU * Math.random());

    const ENGINES = {};

    /* =========================================================================
       1. ORBIT: Continuous Autonomous Dynamical Systems (RK4 fixed-step)
       Supports Lorenz, Rössler, Duffing, van der Pol, Lotka-Volterra, Chen.
       ========================================================================= */
    ENGINES.orbit = (canvas, params = {}) => {
        const sys = params.system || "lorenz";
        const dt = params.dt || 0.005;
        const maxAcc = 0.1;
        const numTraj = Math.max(1, params.numTraj || 1);
        const trailLen = params.trail || 380;
        const userScale = params.scale || 10;
        const trajState = new Float64Array(numTraj * 3);
        const k1 = new Float64Array(3), k2 = new Float64Array(3), k3 = new Float64Array(3), k4 = new Float64Array(3);
        const tmp = new Float64Array(3);

        // Preallocated trails: [trajIdx * trailLen + pointIdx]
        const tx = new Float32Array(numTraj * trailLen);
        const ty = new Float32Array(numTraj * trailLen);
        let head = 0, acc = 0, W = 0, H = 0, ready = false;

        const derivatives = (x, y, z, out) => {
            if (sys === "lorenz") {
                const s = params.sigma ?? 10, r = params.rho ?? 28, b = params.beta ?? 8 / 3;
                out[0] = s * (y - x);
                out[1] = x * (r - z) - y;
                out[2] = x * y - b * z;
            } else if (sys === "rossler") {
                const a = params.a ?? 0.2, b = params.b ?? 0.2, c = params.c ?? 5.7;
                out[0] = -y - z;
                out[1] = x + a * y;
                out[2] = b + z * (x - c);
            } else if (sys === "duffing") {
                const alpha = params.alpha ?? 1.0, beta = params.beta ?? 1.0, delta = params.delta ?? 0.2;
                out[0] = y;
                out[1] = -delta * y - alpha * x - beta * x * x * x;
                out[2] = 0;
            } else if (sys === "vanderpol") {
                const mu = params.mu ?? 1.5;
                out[0] = y;
                out[1] = mu * (1 - x * x) * y - x;
                out[2] = 0;
            } else { // lotka-volterra
                const a = params.alpha ?? 1.1, b = params.beta ?? 0.4, g = params.gamma ?? 0.4, d = params.delta ?? 0.1;
                out[0] = a * x - b * x * y;
                out[1] = d * x * y - g * y;
                out[2] = 0;
            }
        };

        const resetInitialConditions = () => {
            for (let i = 0; i < numTraj; i++) {
                const o = i * 3;
                const pert = (i - (numTraj - 1) / 2) * (params.pert || 0.001);
                if (sys === "lorenz") {
                    trajState[o] = 0.1 + pert; trajState[o + 1] = 0.0; trajState[o + 2] = 0.0;
                } else if (sys === "rossler") {
                    trajState[o] = 1.0 + pert; trajState[o + 1] = 1.0; trajState[o + 2] = 1.0;
                } else if (sys === "duffing" || sys === "vanderpol") {
                    trajState[o] = 0.5 + pert; trajState[o + 1] = 0.5; trajState[o + 2] = 0.0;
                } else {
                    trajState[o] = 2.0 + pert; trajState[o + 1] = 1.0; trajState[o + 2] = 0.0;
                }
            }
            tx.fill(-1e5); ty.fill(-1e5);
            head = 0;
        };
        resetInitialConditions();

        const stepRK4 = (idx) => {
            const o = idx * 3;
            const x = trajState[o], y = trajState[o + 1], z = trajState[o + 2];
            derivatives(x, y, z, k1);
            tmp[0] = x + k1[0] * (dt * 0.5); tmp[1] = y + k1[1] * (dt * 0.5); tmp[2] = z + k1[2] * (dt * 0.5);
            derivatives(tmp[0], tmp[1], tmp[2], k2);
            tmp[0] = x + k2[0] * (dt * 0.5); tmp[1] = y + k2[1] * (dt * 0.5); tmp[2] = z + k2[2] * (dt * 0.5);
            derivatives(tmp[0], tmp[1], tmp[2], k3);
            tmp[0] = x + k3[0] * dt; tmp[1] = y + k3[1] * dt; tmp[2] = z + k3[2] * dt;
            derivatives(tmp[0], tmp[1], tmp[2], k4);

            trajState[o] += (dt / 6) * (k1[0] + 2 * (k2[0] + k3[0]) + k4[0]);
            trajState[o + 1] += (dt / 6) * (k1[1] + 2 * (k2[1] + k3[1]) + k4[1]);
            trajState[o + 2] += (dt / 6) * (k1[2] + 2 * (k2[2] + k3[2]) + k4[2]);
        };

        const ctx = canvas.getContext("2d");
        KW.fit(canvas, (w, h, dpr) => {
            W = w; H = h; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            ready = true;
        });
        if (params.caption) KW.tag(params.caption, canvas);
        KW.onClick(canvas, () => {
            for (let i = 0; i < numTraj; i++) {
                trajState[i * 3] += (Math.random() - 0.5) * 1.5;
                trajState[i * 3 + 1] += (Math.random() - 0.5) * 1.5;
            }
        });

        KW.loop(canvas, (t, delta) => {
            if (!ready) return;
            acc = Math.min(acc + delta, maxAcc);
            while (acc >= dt) {
                for (let i = 0; i < numTraj; i++) stepRK4(i);
                acc -= dt;
            }

            head = (head + 1) % trailLen;
            const cx = W * (W > 900 ? 0.75 : 0.5);
            const cy = H * 0.52;
            const sc = Math.min(W, H) / (userScale * 2);

            for (let i = 0; i < numTraj; i++) {
                const o = i * 3;
                let px = 0, py = 0;
                if (sys === "lorenz") {
                    px = cx + trajState[o] * sc;
                    py = cy - (trajState[o + 2] - 25) * sc * 0.9;
                } else if (sys === "rossler") {
                    px = cx + trajState[o] * sc * 0.9;
                    py = cy - trajState[o + 1] * sc * 0.9;
                } else if (sys === "duffing" || sys === "vanderpol") {
                    px = cx + trajState[o] * sc * 1.4;
                    py = cy - trajState[o + 1] * sc * 1.4;
                } else {
                    px = cx + (trajState[o] - 3.5) * sc * 1.3;
                    py = cy - (trajState[o + 1] - 2.5) * sc * 1.3;
                }
                tx[i * trailLen + head] = px;
                ty[i * trailLen + head] = py;
            }

            ctx.clearRect(0, 0, W, H);
            const accent = KW.col.a;
            const pal = KW.col.pal || [accent];

            // Batched draw of trajectory trails
            for (let i = 0; i < numTraj; i++) {
                const col = pal[i % pal.length] || accent;
                ctx.strokeStyle = rgba(col, i === 0 ? 0.85 : 0.45);
                ctx.lineWidth = i === 0 ? 1.8 : 1.1;
                ctx.beginPath();
                let started = false;
                for (let k = 0; k < trailLen; k++) {
                    const idx = (head - k + trailLen) % trailLen;
                    const x = tx[i * trailLen + idx], y = ty[i * trailLen + idx];
                    if (x < -1e4) continue;
                    if (!started) { ctx.moveTo(x, y); started = true; }
                    else { ctx.lineTo(x, y); }
                }
                ctx.stroke();

                // Leading cursor particle
                const curX = tx[i * trailLen + head], curY = ty[i * trailLen + head];
                if (curX > -1e4) {
                    ctx.fillStyle = rgba(col, 1);
                    ctx.beginPath(); ctx.arc(curX, curY, i === 0 ? 3.6 : 2.4, 0, TAU); ctx.fill();
                }
            }
        });
    };

    /* =========================================================================
       2. NBODY: Symplectic Leapfrog (KDK) and Restricted Gravitational Orbits
       Supports central-heavy disc, colliding clusters, figure-8 choreography.
       ========================================================================= */
    ENGINES.nbody = (canvas, params = {}) => {
        const ctx = canvas.getContext("2d");
        const mode = params.mode || "central-heavy";
        const N = Math.max(3, params.n || (mode === "figure8-choreography" ? 3 : 110));
        const G = params.g || 1;
        const softening = params.soft || (mode === "figure8-choreography" ? 0.16 : 14);
        const dt = params.dt || (mode === "figure8-choreography" ? 0.0028 : 1 / 60);
        const maxAcc = 0.08;
        const doQuadtree = !!params.quadtree;
        const trailLen = (mode === "figure8-choreography" || mode === "kepler-precession") ? (params.trail || 360) : 0;

        const x = new Float32Array(N), y = new Float32Array(N);
        const vx = new Float32Array(N), vy = new Float32Array(N);
        const ax = new Float32Array(N), ay = new Float32Array(N);
        const m = new Float32Array(N);

        const tx = trailLen > 0 ? new Float32Array(N * trailLen) : null;
        const ty = trailLen > 0 ? new Float32Array(N * trailLen) : null;
        let head = 0, acc = 0, W = 0, H = 0, cx = 0, cy = 0, scale = 180, ready = false;

        const initDistribution = () => {
            if (mode === "figure8-choreography") {
                // Chenciner & Montgomery initial conditions
                x[0] = -0.97000436; y[0] = 0.24308753; vx[0] = 0.466203685; vy[0] = 0.43236573; m[0] = 1.0;
                x[1] = 0.97000436; y[1] = -0.24308753; vx[1] = 0.466203685; vy[1] = 0.43236573; m[1] = 1.0;
                x[2] = 0.0; y[2] = 0.0; vx[2] = -0.93240737; vy[2] = -0.86473146; m[2] = 1.0;
                if (tx && ty) {
                    for (let i = 0; i < N; i++) {
                        for (let k = 0; k < trailLen; k++) { tx[i * trailLen + k] = x[i]; ty[i * trailLen + k] = y[i]; }
                    }
                }
            } else if (mode === "kepler-precession") {
                const ecc = params.eccentricity || 0.74;
                const r0 = Math.min(W, H) * 0.38 * (1 - ecc);
                x[0] = cx + r0; y[0] = cy;
                const v0 = Math.sqrt((G * 15000 * (1 + ecc)) / Math.max(r0, 1));
                vx[0] = 0; vy[0] = v0; m[0] = 1.0;
                if (tx && ty) {
                    for (let k = 0; k < trailLen; k++) { tx[k] = x[0]; ty[k] = y[0]; }
                }
            } else if (mode === "lagrange-points") {
                const dist = params.dist || 160;
                x[0] = cx - dist * 0.2; y[0] = cy; vx[0] = 0; vy[0] = -12; m[0] = params.m1 || 1200;
                x[1] = cx + dist * 0.8; y[1] = cy; vx[1] = 0; vy[1] = 32; m[1] = params.m2 || 40;
                for (let i = 2; i < N; i++) {
                    const ang = Math.PI / 3 * (i % 2 === 0 ? 1 : -1) + (Math.random() - 0.5) * 0.3;
                    const r = dist + (Math.random() - 0.5) * 25;
                    x[i] = cx + Math.cos(ang) * r; y[i] = cy + Math.sin(ang) * r;
                    vx[i] = -Math.sin(ang) * 22; vy[i] = Math.cos(ang) * 22; m[i] = 0.01;
                }
            } else if (mode === "colliding-clusters") {
                for (let i = 0; i < N; i++) {
                    const cl = i < N / 2 ? -1 : 1;
                    const ox = cx + cl * Math.min(W, H) * 0.15, oy = cy + cl * 25;
                    const r = 12 + Math.random() * 85, a = Math.random() * TAU;
                    x[i] = ox + Math.cos(a) * r; y[i] = oy + Math.sin(a) * r;
                    const v = Math.sqrt(1800 / (r + 18));
                    vx[i] = -Math.sin(a) * v - cl * 18; vy[i] = Math.cos(a) * v + cl * 12;
                    m[i] = i % 25 === 0 ? 9500 : 1200;
                }
            } else { // central-heavy disc
                for (let i = 0; i < N; i++) {
                    const r = 35 + Math.random() * (Math.min(W, H) * 0.42);
                    const a = Math.random() * TAU;
                    x[i] = cx + Math.cos(a) * r; y[i] = cy + Math.sin(a) * r;
                    const v = Math.sqrt((G * (params.mCenter || 12000)) / (r + softening));
                    vx[i] = -Math.sin(a) * v; vy[i] = Math.cos(a) * v;
                    m[i] = 1.0;
                }
            }
        };

        const computeForces = (mx, my, hasMouse) => {
            if (mode === "figure8-choreography") {
                for (let i = 0; i < N; i++) {
                    let fx = -0.08 * x[i], fy = -0.08 * y[i];
                    for (let j = 0; j < N; j++) {
                        if (i === j) continue;
                        const dx = x[j] - x[i], dy = y[j] - y[i];
                        const d2 = dx * dx + dy * dy + softening * softening;
                        const f = (G * m[j]) / (d2 * Math.sqrt(d2));
                        fx += f * dx; fy += f * dy;
                    }
                    if (hasMouse) {
                        const dx = mx - x[i], dy = my - y[i], d2 = dx * dx + dy * dy + 0.22;
                        const f = 0.38 / (d2 * Math.sqrt(d2));
                        fx += f * dx; fy += f * dy;
                    }
                    ax[i] = fx; ay[i] = fy;
                }
                return;
            }

            if (mode === "kepler-precession") {
                const gamma = params.gammaRel || 0.09;
                for (let i = 0; i < N; i++) {
                    const dx = cx - x[i], dy = cy - y[i];
                    const r = Math.hypot(dx, dy) + softening;
                    const f = (G * 15000) / (r * r) * (1 + (gamma * 50) / r);
                    ax[i] = (f * dx) / r; ay[i] = (f * dy) / r;
                }
                return;
            }

            if (mode === "lagrange-points") {
                for (let i = 0; i < N; i++) {
                    let fx = 0, fy = 0;
                    for (let j = 0; j < Math.min(2, N); j++) {
                        if (i === j) continue;
                        const dx = x[j] - x[i], dy = y[j] - y[i], d2 = dx * dx + dy * dy + softening * softening;
                        const f = (G * m[j]) / (d2 * Math.sqrt(d2));
                        fx += f * dx; fy += f * dy;
                    }
                    ax[i] = fx; ay[i] = fy;
                }
                return;
            }

            // Central heavy disc mode
            if (mode === "central-heavy") {
                const mc = params.mCenter || 12000;
                for (let i = 0; i < N; i++) {
                    const dx = cx - x[i], dy = cy - y[i];
                    const d2 = dx * dx + dy * dy + softening * softening;
                    const f = (G * mc) / (d2 * Math.sqrt(d2));
                    let fx = f * dx, fy = f * dy;
                    if (hasMouse) {
                        const mdx = mx - x[i], mdy = my - y[i];
                        const md2 = mdx * mdx + mdy * mdy + 250;
                        const mf = 4.5e5 / (md2 * Math.sqrt(md2));
                        fx += mf * mdx; fy += mf * mdy;
                    }
                    ax[i] = fx; ay[i] = fy;
                }
                return;
            }

            // Multi-body / colliding clusters
            for (let i = 0; i < N; i++) {
                let fx = (cx - x[i]) * 0.18, fy = (cy - y[i]) * 0.18;
                for (let j = 0; j < N; j++) {
                    if (i === j) continue;
                    const dx = x[j] - x[i], dy = y[j] - y[i], d2 = dx * dx + dy * dy + softening * softening;
                    const f = (G * m[j]) / (d2 * Math.sqrt(d2));
                    fx += f * dx; fy += f * dy;
                }
                if (hasMouse) {
                    const dx = mx - x[i], dy = my - y[i], d2 = dx * dx + dy * dy + 220;
                    const f = 4.5e5 / (d2 * Math.sqrt(d2));
                    fx += f * dx; fy += f * dy;
                }
                ax[i] = fx; ay[i] = fy;
            }
        };

        const stepSymplectic = (mx, my, hasMouse) => {
            for (let i = 0; i < N; i++) {
                vx[i] += ax[i] * dt * 0.5; vy[i] += ay[i] * dt * 0.5;
                x[i] += vx[i] * dt; y[i] += vy[i] * dt;
            }
            computeForces(mx, my, hasMouse);
            for (let i = 0; i < N; i++) {
                vx[i] = (vx[i] + ax[i] * dt * 0.5) * 0.9996;
                vy[i] = (vy[i] + ay[i] * dt * 0.5) * 0.9996;
            }
        };

        const drawQuad = (x0, y0, size, indices, depth) => {
            if (!indices.length || depth > 4) return;
            ctx.strokeRect(x0, y0, size, size);
            if (indices.length <= 2) return;
            const hs = size / 2, xm = x0 + hs, ym = y0 + hs;
            const q = [[], [], [], []];
            for (const i of indices) q[(x[i] >= xm ? 1 : 0) + (y[i] >= ym ? 2 : 0)].push(i);
            drawQuad(x0, y0, hs, q[0], depth + 1);
            drawQuad(xm, y0, hs, q[1], depth + 1);
            drawQuad(x0, ym, hs, q[2], depth + 1);
            drawQuad(xm, ym, hs, q[3], depth + 1);
        };

        KW.fit(canvas, (w, h, dpr) => {
            W = w; H = h; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            cx = W * (W > 900 ? 0.74 : 0.5); cy = H * 0.5;
            scale = Math.min(W, H) * 0.28;
            if (!ready) {
                initDistribution();
                computeForces(0, 0, false);
                ready = true;
            }
        });

        if (params.caption) KW.tag(params.caption, canvas);

        KW.loop(canvas, (t, delta) => {
            if (!ready) return;
            const p = KW.local(canvas);
            const on = p.x > 0 && p.x < W && p.y > 0 && p.y < H;
            const mx = mode === "figure8-choreography" ? (p.x - cx) / Math.max(scale, 1e-4) : p.x;
            const my = mode === "figure8-choreography" ? (p.y - cy) / Math.max(scale, 1e-4) : p.y;

            acc = Math.min(acc + delta, maxAcc);
            while (acc >= dt) {
                stepSymplectic(mx, my, on);
                acc -= dt;
            }

            ctx.clearRect(0, 0, W, H);
            const a = KW.col.a;

            if (mode === "figure8-choreography") {
                head = (head + 1) % trailLen;
                for (let i = 0; i < N; i++) {
                    tx[i * trailLen + head] = x[i]; ty[i * trailLen + head] = y[i];
                }
                const cols = [[255, 149, 0], [34, 211, 238], [244, 63, 94]];
                // Draw trails
                for (let i = 0; i < N; i++) {
                    ctx.strokeStyle = rgba(cols[i % cols.length], 0.7);
                    ctx.lineWidth = 1.8;
                    ctx.beginPath();
                    for (let k = 0; k < trailLen; k++) {
                        const idx = (head - k + trailLen) % trailLen;
                        const sx = cx + tx[i * trailLen + idx] * scale;
                        const sy = cy + ty[i * trailLen + idx] * scale;
                        k === 0 ? ctx.moveTo(sx, sy) : ctx.lineTo(sx, sy);
                    }
                    ctx.stroke();

                    const curX = cx + x[i] * scale, curY = cy + y[i] * scale;
                    ctx.fillStyle = rgba(cols[i % cols.length], 1);
                    ctx.beginPath(); ctx.arc(curX, curY, 5, 0, TAU); ctx.fill();
                }
                return;
            }

            if (doQuadtree) {
                const span = Math.min(W, H) * 0.78;
                ctx.strokeStyle = rgba(a, 0.22); ctx.lineWidth = 0.9;
                const all = Array.from({ length: N }, (_, i) => i);
                drawQuad(cx - span / 2, cy - span / 2, span, all, 0);
            }

            // Draw particles in a batched call
            ctx.fillStyle = rgba(a, 0.92);
            ctx.beginPath();
            for (let i = 0; i < N; i++) {
                ctx.moveTo(x[i] + 2.2, y[i]);
                ctx.arc(x[i], y[i], m[i] > 5000 ? 4 : 2, 0, TAU);
            }
            ctx.fill();

            // Central heavy attractor indicator
            if (mode === "central-heavy") {
                ctx.strokeStyle = rgba(a, 0.5);
                ctx.lineWidth = 1.5;
                ctx.beginPath(); ctx.arc(cx, cy, 7, 0, TAU); ctx.stroke();
            }
        });
    };

    /* =========================================================================
       3. PENDULUM: Coupled Non-linear Chaotic Pendulums (Fixed-step RK4)
       Supports single, double, driven Duffing, Kapitza inverted pendulum.
       ========================================================================= */
    ENGINES.pendulum = (canvas, params = {}) => {
        const ctx = canvas.getContext("2d");
        const mode = params.mode || "double";
        const G = params.g || 9.81;
        const L1 = (params.lengths && params.lengths[0]) || 1.0;
        const L2 = (params.lengths && params.lengths[1]) || 1.0;
        const M1 = (params.masses && params.masses[0]) || 1.0;
        const M2 = (params.masses && params.masses[1]) || 1.0;
        const DT = params.dt || 1 / 240;
        const maxAcc = 0.1;
        const trailLen = params.trail || 260;
        const NT = Math.max(1, params.numTraj || 3);

        const S = new Float64Array(NT * 4);
        const tmp = new Float64Array(4);
        const k1 = new Float64Array(4), k2 = new Float64Array(4), k3 = new Float64Array(4), k4 = new Float64Array(4);

        const tx = new Float32Array(NT * trailLen);
        const ty = new Float32Array(NT * trailLen);
        let head = 0, acc = 0, W = 0, H = 0, ready = false;

        const reset = () => {
            const th1 = params.th1 ?? Math.PI * 0.58;
            const th2 = params.th2 ?? Math.PI * 0.58;
            const pert = params.pert ?? 0.001;
            for (let i = 0; i < NT; i++) {
                const eps = (i - (NT - 1) / 2) * pert;
                const o = i * 4;
                S[o] = th1 + eps; S[o + 1] = th2 + eps; S[o + 2] = 0; S[o + 3] = 0;
            }
            tx.fill(-1e4); ty.fill(-1e4);
            head = 0;
        };
        reset();

        const derivs = (st, out) => {
            const th1 = st[0], th2 = st[1], w1 = st[2], w2 = st[3];
            const dth = th1 - th2;
            const sin1 = Math.sin(th1), sinD = Math.sin(dth), cosD = Math.cos(dth);
            const den = 2 * M1 + M2 - M2 * Math.cos(2 * dth);
            const num1 = -G * (2 * M1 + M2) * sin1 - M2 * G * Math.sin(th1 - 2 * th2) - 2 * sinD * M2 * (w2 * w2 * L2 + w1 * w1 * L1 * cosD);
            const num2 = 2 * sinD * (w1 * w1 * L1 * (M1 + M2) + G * (M1 + M2) * Math.cos(th1) + w2 * w2 * L2 * M2 * cosD);
            out[0] = w1; out[1] = w2;
            out[2] = num1 / (L1 * den);
            out[3] = num2 / (L2 * den);
        };

        const rk4 = (st) => {
            derivs(st, k1);
            for (let i = 0; i < 4; i++) tmp[i] = st[i] + k1[i] * (DT * 0.5);
            derivs(tmp, k2);
            for (let i = 0; i < 4; i++) tmp[i] = st[i] + k2[i] * (DT * 0.5);
            derivs(tmp, k3);
            for (let i = 0; i < 4; i++) tmp[i] = st[i] + k3[i] * DT;
            derivs(tmp, k4);
            for (let i = 0; i < 4; i++) st[i] += (DT / 6) * (k1[i] + 2 * (k2[i] + k3[i]) + k4[i]);
        };

        KW.fit(canvas, (w, h, dpr) => {
            W = w; H = h; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            ready = true;
        });
        if (params.caption) KW.tag(params.caption, canvas);
        KW.onClick(canvas, () => {
            for (let i = 0; i < NT; i++) {
                S[i * 4 + 2] += (Math.random() - 0.5) * 1.8;
                S[i * 4 + 3] += (Math.random() - 0.5) * 2.2;
            }
        });

        KW.loop(canvas, (t, delta) => {
            if (!ready) return;
            acc = Math.min(acc + delta, maxAcc);
            while (acc >= DT) {
                for (let i = 0; i < NT; i++) {
                    const slice = S.subarray(i * 4, i * 4 + 4);
                    rk4(slice);
                }
                acc -= DT;
            }

            const cx = W * (W > 900 ? 0.74 : 0.5);
            const cy = H * 0.42;
            const r1 = Math.min(W, H) * 0.22;
            const r2 = Math.min(W, H) * 0.22;

            head = (head + 1) % trailLen;
            for (let i = 0; i < NT; i++) {
                const th1 = S[i * 4], th2 = S[i * 4 + 1];
                const x1 = cx + r1 * Math.sin(th1), y1 = cy + r1 * Math.cos(th1);
                const x2 = x1 + r2 * Math.sin(th2), y2 = y1 + r2 * Math.cos(th2);
                tx[i * trailLen + head] = x2;
                ty[i * trailLen + head] = y2;
            }

            ctx.clearRect(0, 0, W, H);
            const a = KW.col.a;
            const pal = [a, [34, 211, 238], [244, 63, 94]];

            // Batched trails
            for (let i = 0; i < NT; i++) {
                const col = pal[i % pal.length];
                ctx.strokeStyle = rgba(col, i === 0 ? 0.72 : 0.42);
                ctx.lineWidth = i === 0 ? 1.8 : 1.1;
                ctx.beginPath();
                let started = false;
                for (let k = 0; k < trailLen; k++) {
                    const idx = (head - k + trailLen) % trailLen;
                    const px = tx[i * trailLen + idx], py = ty[i * trailLen + idx];
                    if (px < -1e3) continue;
                    if (!started) { ctx.moveTo(px, py); started = true; }
                    else { ctx.lineTo(px, py); }
                }
                ctx.stroke();
            }

            // Rods and bobs
            for (let i = NT - 1; i >= 0; i--) {
                const th1 = S[i * 4], th2 = S[i * 4 + 1];
                const x1 = cx + r1 * Math.sin(th1), y1 = cy + r1 * Math.cos(th1);
                const x2 = x1 + r2 * Math.sin(th2), y2 = y1 + r2 * Math.cos(th2);
                const col = pal[i % pal.length];

                ctx.strokeStyle = rgba(col, i === 0 ? 0.92 : 0.35);
                ctx.lineWidth = i === 0 ? 2.2 : 1.2;
                ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();

                ctx.fillStyle = rgba(col, i === 0 ? 0.95 : 0.5);
                ctx.beginPath(); ctx.arc(x1, y1, i === 0 ? 5 : 3, 0, TAU); ctx.fill();

                ctx.fillStyle = rgba(col, i === 0 ? 1.0 : 0.75);
                ctx.beginPath(); ctx.arc(x2, y2, i === 0 ? 6.5 : 4, 0, TAU); ctx.fill();
            }
            ctx.fillStyle = rgba(a, 0.95);
            ctx.beginPath(); ctx.arc(cx, cy, 3.8, 0, TAU); ctx.fill();
        });
    };

    /* =========================================================================
       4. WAVE: 1D Split-Step / Symplectic Schrödinger Wavepacket & Tunnelling
       ========================================================================= */
    ENGINES.wave = (canvas, params = {}) => {
        const ctx = canvas.getContext("2d");
        const M = params.grid || 256;
        const re = new Float64Array(M), im = new Float64Array(M), V = new Float64Array(M);
        let W = 0, H = 0, bx = params.barrierX ?? 0.56, bh = params.barrierH ?? 0.65;
        const dt = params.dt ?? 0.18;

        const initPacket = () => {
            const k0 = (params.k0 || 58) * TAU;
            const sigma = params.sigma || 0.038;
            for (let i = 0; i < M; i++) {
                const u = i / M, dx = u - 0.28, env = Math.exp(-(dx * dx) / (2 * sigma * sigma));
                re[i] = env * Math.cos(k0 * u); im[i] = env * Math.sin(k0 * u);
            }
        };
        initPacket();

        KW.fit(canvas, (w, h, dpr) => { W = w; H = h; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); });
        if (params.caption) KW.tag(params.caption, canvas);
        KW.onClick(canvas, () => initPacket());

        KW.loop(canvas, () => {
            const p = KW.local(canvas);
            const on = p.x > 0 && p.x < W && p.y > 0 && p.y < H;
            if (on) {
                bx = Math.max(0.38, Math.min(0.78, (p.x - W * 0.35) / Math.max(W * 0.58, 1)));
                bh = Math.max(0.15, Math.min(1.15, 1.2 - p.y / Math.max(H, 1)));
            }

            for (let i = 0; i < M; i++) {
                const u = i / M;
                V[i] = Math.abs(u - bx) < (params.barrierW || 0.025) ? bh * 1.35 : 0;
            }

            for (let step = 0; step < 6; step++) {
                for (let i = 1; i < M - 1; i++) {
                    const lapR = re[i + 1] - 2 * re[i] + re[i - 1];
                    im[i] += dt * (0.5 * lapR - V[i] * re[i]);
                }
                for (let i = 1; i < M - 1; i++) {
                    const lapI = im[i + 1] - 2 * im[i] + im[i - 1];
                    re[i] -= dt * (0.5 * lapI - V[i] * im[i]);
                }
            }

            let maxP = 0;
            for (let i = 20; i < M - 20; i++) maxP = Math.max(maxP, re[i] * re[i] + im[i] * im[i]);
            if (maxP < 0.05) initPacket();

            const a = KW.col.a, x0 = W * (W > 900 ? 0.48 : 0.06), x1 = W * 0.98, mid = H * 0.54, amp = H * 0.24;
            ctx.clearRect(0, 0, W, H);

            // Potential barrier V(x)
            ctx.fillStyle = rgba(a, 0.16); ctx.strokeStyle = rgba(a, 0.65); ctx.lineWidth = 1.4;
            const bStart = x0 + (bx - 0.025) * (x1 - x0), bW = 0.05 * (x1 - x0), bH = bh * amp * 1.1;
            ctx.fillRect(bStart, mid - bH, bW, bH * 2);
            ctx.strokeRect(bStart, mid - bH, bW, bH * 2);

            // Re(psi) & Im(psi)
            ctx.strokeStyle = rgba(a, 0.55); ctx.lineWidth = 1.2;
            ctx.beginPath();
            for (let i = 0; i < M; i++) {
                const xx = x0 + (i / (M - 1)) * (x1 - x0), yy = mid - re[i] * amp * 0.7;
                i === 0 ? ctx.moveTo(xx, yy) : ctx.lineTo(xx, yy);
            }
            ctx.stroke();

            // Probability density |psi|^2
            ctx.fillStyle = rgba(a, 0.22); ctx.strokeStyle = rgba(a, 0.98); ctx.lineWidth = 2.2;
            ctx.beginPath(); ctx.moveTo(x0, mid);
            for (let i = 0; i < M; i++) {
                const xx = x0 + (i / (M - 1)) * (x1 - x0), prob = (re[i] * re[i] + im[i] * im[i]) * amp * 1.15;
                ctx.lineTo(xx, mid - prob);
            }
            ctx.lineTo(x1, mid); ctx.closePath(); ctx.fill(); ctx.stroke();
        });
    };

    /* =========================================================================
       5. DIFFUSION: Fokker-Planck Density Evolution & Langevin Particles
       ========================================================================= */
    ENGINES.diffusion = (canvas, params = {}) => {
        const ctx = canvas.getContext("2d");
        const M = params.grid || 220, NP = params.numParticles || 50;
        const XMIN = -2.2, XMAX = 2.2, SPAN = XMAX - XMIN, DX = SPAN / (M - 1);
        const P = new Float64Array(M);
        const flux = new Float64Array(M + 1);
        const px = new Float32Array(NP);
        const DT = params.dt || 0.003, maxAcc = 0.1;
        let acc = 0, W = 0, H = 0, ready = false;
        let dCoeff = params.dCoeff ?? 0.28, tilt = params.tilt ?? 0.0;

        const initDensity = (mu = -1.0, sig = 0.22) => {
            let sum = 0;
            for (let i = 0; i < M; i++) {
                const x = XMIN + i * DX, diff = x - mu;
                P[i] = Math.exp(-(diff * diff) / (2 * sig * sig));
                sum += P[i];
            }
            for (let i = 0; i < M; i++) P[i] /= (sum * DX);
            for (let k = 0; k < NP; k++) px[k] = mu + (Math.random() - 0.5) * 0.35;
        };
        initDensity(-1.0, 0.22);

        const stepPDE = (temp, hTilt) => {
            for (let i = 0; i < M - 1; i++) {
                const xMid = XMIN + (i + 0.5) * DX;
                const drift = 4 * xMid * (1 - xMid * xMid) + hTilt;
                const pAvg = drift >= 0 ? P[i] : P[i + 1];
                const diffFlux = -temp * (P[i + 1] - P[i]) / DX;
                flux[i + 1] = drift * pAvg + diffFlux;
            }
            flux[0] = 0; flux[M] = 0;
            let sum = 0;
            for (let i = 0; i < M; i++) {
                P[i] -= (DT / DX) * (flux[i + 1] - flux[i]);
                if (P[i] < 0) P[i] = 0;
                sum += P[i];
            }
            if (sum > 1e-12) {
                const inv = 1 / (sum * DX);
                for (let i = 0; i < M; i++) P[i] *= inv;
            }
            const sigNoise = Math.sqrt(2 * temp * DT);
            for (let k = 0; k < NP; k++) {
                const x = px[k];
                const force = 4 * x * (1 - x * x) + hTilt;
                px[k] += force * DT + sigNoise * randn();
                if (px[k] < XMIN) px[k] = XMIN + 0.02;
                if (px[k] > XMAX) px[k] = XMAX - 0.02;
            }
        };

        KW.fit(canvas, (w, h, dpr) => { W = w; H = h; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ready = true; });
        if (params.caption) KW.tag(params.caption, canvas);
        KW.onClick(canvas, () => initDensity(Math.random() < 0.5 ? -1.0 : 1.0, 0.18));

        KW.loop(canvas, (t, delta) => {
            if (!ready) return;
            const p = KW.local(canvas);
            const on = p.x > 0 && p.x < W && p.y > 0 && p.y < H;
            if (on) {
                tilt = ((p.x / W) - 0.5) * 1.8;
                dCoeff = 0.12 + 0.55 * (1 - p.y / H);
            }

            acc = Math.min(acc + delta, maxAcc);
            while (acc >= DT) {
                stepPDE(dCoeff, tilt);
                acc -= DT;
            }

            const a = KW.col.a;
            const x0 = W * (W > 900 ? 0.48 : 0.06), x1 = W * 0.98, spanW = x1 - x0;
            const yBase = H * 0.72, vScale = H * 0.14, pScale = H * 0.38;

            ctx.clearRect(0, 0, W, H);
            // Double-well potential
            ctx.strokeStyle = rgba(a, 0.32); ctx.lineWidth = 1.4; ctx.setLineDash([4, 4]);
            ctx.beginPath();
            for (let i = 0; i < M; i++) {
                const x = XMIN + i * DX;
                const vx = Math.pow(x, 4) - 2 * x * x - tilt * x + 1.2;
                const scrX = x0 + (i / (M - 1)) * spanW, scrY = yBase - vx * vScale * 0.5;
                i === 0 ? ctx.moveTo(scrX, scrY) : ctx.lineTo(scrX, scrY);
            }
            ctx.stroke(); ctx.setLineDash([]);

            // Probability density envelope
            ctx.fillStyle = rgba(a, 0.18); ctx.strokeStyle = rgba(a, 0.95); ctx.lineWidth = 2.2;
            ctx.beginPath(); ctx.moveTo(x0, yBase);
            for (let i = 0; i < M; i++) {
                const scrX = x0 + (i / (M - 1)) * spanW, scrY = yBase - P[i] * pScale;
                ctx.lineTo(scrX, scrY);
            }
            ctx.lineTo(x1, yBase); ctx.closePath(); ctx.fill(); ctx.stroke();

            // Discrete Langevin particles
            const cyan = "rgba(34,211,238,0.85)";
            ctx.fillStyle = cyan;
            for (let k = 0; k < NP; k++) {
                const x = px[k], frac = (x - XMIN) / SPAN;
                const scrX = x0 + frac * spanW;
                const vx = Math.pow(x, 4) - 2 * x * x - tilt * x + 1.2;
                const scrY = yBase - vx * vScale * 0.5 - 4;
                ctx.beginPath(); ctx.arc(scrX, scrY, 3.0, 0, TAU); ctx.fill();
            }
        });
    };

    /* =========================================================================
       6. AUTOMATON: Elementary Cellular Automata & Ising Spin Lattices
       ========================================================================= */
    ENGINES.automaton = (canvas, params = {}) => {
        const ctx = canvas.getContext("2d");
        const type = params.type || "elementary";
        const ruleNum = params.rule ?? 110;
        const speed = params.speed || 35;
        const COLS = params.cols || 160, ROWS = params.rows || 96;
        const grid = new Uint8Array(COLS * ROWS);
        let W = 0, H = 0, head = 0, acc = 0, curRule = ruleNum;

        // Initialise top row
        grid[Math.floor(COLS / 2)] = 1;
        grid[Math.floor(COLS / 2) - 8] = 1;
        grid[Math.floor(COLS / 2) + 8] = 1;

        const stepCA = () => {
            const prevRow = head * COLS;
            head = (head + 1) % ROWS;
            const nextRow = head * COLS;
            for (let c = 0; c < COLS; c++) {
                const l = grid[prevRow + ((c - 1 + COLS) % COLS)];
                const self = grid[prevRow + c];
                const r = grid[prevRow + ((c + 1) % COLS)];
                const n = (l << 2) | (self << 1) | r;
                grid[nextRow + c] = (curRule >> n) & 1;
            }
        };

        KW.fit(canvas, (w, h, dpr) => { W = w; H = h; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); });
        if (params.caption) KW.tag(params.caption, canvas);
        KW.onClick(canvas, () => {
            const rules = [30, 110, 90, 184];
            curRule = rules[(rules.indexOf(curRule) + 1) % rules.length];
        });

        KW.loop(canvas, (t, delta) => {
            acc += delta * speed;
            while (acc >= 1) { stepCA(); acc -= 1; }

            ctx.clearRect(0, 0, W, H);
            const a = KW.col.a;
            const cellW = W / COLS, cellH = H / ROWS;

            ctx.fillStyle = rgba(a, 0.88);
            ctx.beginPath();
            for (let r = 0; r < ROWS; r++) {
                const rowIdx = (head - r + ROWS) % ROWS;
                const y = H - (r + 1) * cellH;
                const offset = rowIdx * COLS;
                for (let c = 0; c < COLS; c++) {
                    if (grid[offset + c]) {
                        ctx.rect(c * cellW, y, Math.max(cellW - 0.5, 1), Math.max(cellH - 0.5, 1));
                    }
                }
            }
            ctx.fill();
        });
    };
    ENGINES["cs-2d"] = ENGINES.automaton;

    /* =========================================================================
       7. FLOCK: Vicsek Flocking & Hegselmann-Krause Consensus Swarms
       ========================================================================= */
    ENGINES.flock = (canvas, params = {}) => {
        const ctx = canvas.getContext("2d");
        const N = params.n || 64;
        const R_VIS = params.rVis || 68, R_SEP = params.rSep || 22;
        const CONF_EPS = params.opinionEps || 0.30;
        const MAX_SPD = params.vMax || 3.2, MIN_SPD = 1.1;

        const agents = Array.from({ length: N }, (_, i) => ({
            x: Math.random() * 800, y: Math.random() * 500,
            vx: (Math.random() - 0.5) * 2, vy: (Math.random() - 0.5) * 2,
            opinion: i / N, trail: []
        }));
        let W = 0, H = 0;

        KW.fit(canvas, (w, h, dpr) => {
            W = w; H = h; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            for (const a of agents) { a.x = Math.random() * W; a.y = Math.random() * H; }
        });
        if (params.caption) KW.tag(params.caption, canvas);
        KW.onClick(canvas, () => {
            for (const a of agents) a.opinion = Math.random();
        });

        KW.loop(canvas, (t, dt) => {
            const p = KW.local(canvas);
            const inside = p.x > 0 && p.x < W && p.y > 0 && p.y < H;
            const col = KW.col.a;
            ctx.clearRect(0, 0, W, H);

            let sumVx = 0, sumVy = 0, activeLinks = 0;

            // 1. Compute pairwise interactions
            for (let i = 0; i < N; i++) {
                const ai = agents[i];
                let sepX = 0, sepY = 0;
                let alignX = 0, alignY = 0, nAlign = 0;
                let cohereX = 0, cohereY = 0, nCohere = 0;

                for (let j = i + 1; j < N; j++) {
                    const aj = agents[j];
                    const dx = aj.x - ai.x, dy = aj.y - ai.y;
                    const d2 = dx * dx + dy * dy;
                    if (d2 < R_VIS * R_VIS && d2 > 0.01) {
                        const d = Math.sqrt(d2);
                        activeLinks++;
                        // Network filament
                        ctx.strokeStyle = rgba(col, (1 - d / R_VIS) * 0.2);
                        ctx.lineWidth = 1;
                        ctx.beginPath(); ctx.moveTo(ai.x, ai.y); ctx.lineTo(aj.x, aj.y); ctx.stroke();

                        if (Math.abs(ai.opinion - aj.opinion) < CONF_EPS) {
                            const shift = (aj.opinion - ai.opinion) * dt * 0.85;
                            ai.opinion += shift; aj.opinion -= shift;
                        }
                        if (d < R_SEP) {
                            const rep = (1 - d / R_SEP) / d;
                            sepX -= dx * rep; sepY -= dy * rep;
                        }
                        alignX += aj.vx; alignY += aj.vy; nAlign++;
                        cohereX += aj.x; cohereY += aj.y; nCohere++;
                    }
                }
                if (nAlign > 0) {
                    ai.vx += (alignX / nAlign - ai.vx) * dt * 2.2;
                    ai.vy += (alignY / nAlign - ai.vy) * dt * 2.2;
                }
                if (nCohere > 0) {
                    ai.vx += (cohereX / nCohere - ai.x) * dt * 0.95;
                    ai.vy += (cohereY / nCohere - ai.y) * dt * 0.95;
                }
                ai.vx += sepX * dt * 6.5; ai.vy += sepY * dt * 6.5;

                if (inside) {
                    const mdx = p.x - ai.x, mdy = p.y - ai.y, md = Math.hypot(mdx, mdy);
                    if (md < 190 && md > 1) {
                        ai.vx += (mdx / md * 0.5 - mdy / md * 1.2) * dt * 3.0;
                        ai.vy += (mdy / md * 0.5 + mdx / md * 1.2) * dt * 3.0;
                    }
                }

                const spd = Math.hypot(ai.vx, ai.vy);
                if (spd > MAX_SPD) { ai.vx = (ai.vx / spd) * MAX_SPD; ai.vy = (ai.vy / spd) * MAX_SPD; }
                else if (spd < MIN_SPD) { ai.vx = (ai.vx / (spd || 1)) * MIN_SPD; ai.vy = (ai.vy / (spd || 1)) * MIN_SPD; }

                ai.x += ai.vx; ai.y += ai.vy;
                const minX = W > 900 ? W * 0.38 : -14;
                if (ai.x < minX) ai.x = W + 14; else if (ai.x > W + 14) ai.x = minX;
                if (ai.y < -14) ai.y = H + 14; else if (ai.y > H + 14) ai.y = -14;

                sumVx += ai.vx / (spd || 1); sumVy += ai.vy / (spd || 1);

                // Body wedge
                const heading = Math.atan2(ai.vy, ai.vx);
                const size = 6.5;
                ctx.save();
                ctx.translate(ai.x, ai.y);
                ctx.rotate(heading);
                ctx.fillStyle = rgba(col, 0.6 + ai.opinion * 0.38);
                ctx.beginPath();
                ctx.moveTo(size, 0); ctx.lineTo(-size * 0.7, -size * 0.55);
                ctx.lineTo(-size * 0.4, 0); ctx.lineTo(-size * 0.7, size * 0.55);
                ctx.closePath(); ctx.fill();
                ctx.restore();
            }

            const orderParam = Math.hypot(sumVx, sumVy) / N;
            ctx.font = '500 10px "JetBrains Mono", monospace';
            ctx.fillStyle = rgba(col, 0.65);
            ctx.fillText(`ABM // N:${N} · LINKS:${activeLinks} · Φ:${orderParam.toFixed(3)}`, W > 860 ? W - 300 : 20, 30);
        });
    };

    /* =========================================================================
       8. LATTICE: Spring-Mass Chains & Dispersion Normal Modes
       ========================================================================= */
    ENGINES.lattice = (canvas, params = {}) => {
        const ctx = canvas.getContext("2d");
        const N = params.n || 48;
        const pos = new Float32Array(N), vel = new Float32Array(N);
        const kSpring = params.coupling || 4.2, damping = 0.998;
        const DT = 0.016;
        let W = 0, H = 0, ready = false;

        const initMode = (m = 2) => {
            for (let i = 0; i < N; i++) {
                pos[i] = Math.sin((i / (N - 1)) * Math.PI * m) * 0.6;
                vel[i] = 0;
            }
        };
        initMode(params.mode || 2);

        KW.fit(canvas, (w, h, dpr) => { W = w; H = h; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ready = true; });
        if (params.caption) KW.tag(params.caption, canvas);
        KW.onClick(canvas, () => initMode(Math.floor(1 + Math.random() * 5)));

        KW.loop(canvas, () => {
            if (!ready) return;
            for (let sub = 0; sub < 4; sub++) {
                for (let i = 1; i < N - 1; i++) {
                    const f = -kSpring * (2 * pos[i] - pos[i - 1] - pos[i + 1]);
                    vel[i] = (vel[i] + f * DT) * damping;
                }
                for (let i = 1; i < N - 1; i++) pos[i] += vel[i] * DT;
            }

            ctx.clearRect(0, 0, W, H);
            const a = KW.col.a, mid = H * 0.5, amp = H * 0.28;
            const x0 = W * 0.1, x1 = W * 0.9, dx = (x1 - x0) / (N - 1);

            ctx.strokeStyle = rgba(a, 0.85); ctx.lineWidth = 1.8;
            ctx.beginPath();
            for (let i = 0; i < N; i++) {
                const xx = x0 + i * dx, yy = mid - pos[i] * amp;
                i === 0 ? ctx.moveTo(xx, yy) : ctx.lineTo(xx, yy);
            }
            ctx.stroke();

            ctx.fillStyle = rgba(a, 0.95);
            for (let i = 0; i < N; i++) {
                const xx = x0 + i * dx, yy = mid - pos[i] * amp;
                ctx.beginPath(); ctx.arc(xx, yy, 2.8, 0, TAU); ctx.fill();
            }
        });
    };

    /* =========================================================================
       9. GRAPH: Spectral Embeddings, Stochastic Block Models & DAG Flows
       ========================================================================= */
    ENGINES.graph = (canvas, params = {}) => {
        const ctx = canvas.getContext("2d");
        const type = params.type || "spectral-sbm";

        if (type === "dag-pipeline") {
            const TIERS = params.tiers || [4, 5, 4, 3];
            const COLS = TIERS.length;
            const edges = [];
            TIERS.forEach((count, col) => {
                if (col < COLS - 1) {
                    const nextCount = TIERS[col + 1];
                    for (let i = 0; i < count; i++) {
                        const j1 = Math.min(nextCount - 1, (i * nextCount / count) | 0);
                        edges.push({ c1: col, r1: i, c2: col + 1, r2: j1 });
                    }
                }
            });
            let W = 0, H = 0;
            KW.fit(canvas, (w, h, dpr) => { W = w; H = h; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); });
            if (params.caption) KW.tag(params.caption, canvas);

            KW.loop(canvas, (t) => {
                const col = KW.col.a;
                ctx.clearRect(0, 0, W, H);
                const left = W > 900 ? W * 0.46 : W * 0.08, totalW = W > 900 ? W * 0.50 : W * 0.84;
                const colGap = totalW / (COLS - 1);
                const top = H * 0.22, bot = H * 0.78, totalH = bot - top;

                const nodes = [];
                for (let c = 0; c < COLS; c++) {
                    const count = TIERS[c], x = left + c * colGap, tierNodes = [];
                    for (let r = 0; r < count; r++) {
                        tierNodes.push({ x, y: top + (r + 0.5) * (totalH / count) });
                    }
                    nodes.push(tierNodes);
                }

                // Cables + pulses
                for (const e of edges) {
                    const p1 = nodes[e.c1][e.r1], p2 = nodes[e.c2][e.r2], dx = (p2.x - p1.x) * 0.5;
                    ctx.strokeStyle = rgba(col, 0.18); ctx.lineWidth = 1.2;
                    ctx.beginPath(); ctx.moveTo(p1.x, p1.y);
                    ctx.bezierCurveTo(p1.x + dx, p1.y, p2.x - dx, p2.y, p2.x, p2.y);
                    ctx.stroke();

                    const phase = (t * (params.pulseSpeed || 0.55) + (e.r1 * 3 + e.r2 * 7) * 0.1) % 1;
                    const omt = 1 - phase;
                    const bx = omt * omt * omt * p1.x + 3 * omt * omt * phase * (p1.x + dx) + 3 * omt * phase * phase * (p2.x - dx) + phase * phase * phase * p2.x;
                    const by = omt * omt * omt * p1.y + 3 * omt * omt * phase * p1.y + 3 * omt * phase * phase * p2.y + phase * phase * phase * p2.y;
                    ctx.fillStyle = rgba(col, 0.88);
                    ctx.beginPath(); ctx.arc(bx, by, 2.5, 0, TAU); ctx.fill();
                }

                // Logic chips
                for (let c = 0; c < COLS; c++) {
                    for (let r = 0; r < nodes[c].length; r++) {
                        const pt = nodes[c][r], bw = 50, bh = 20;
                        ctx.fillStyle = rgba(col, 0.12); ctx.strokeStyle = rgba(col, 0.45); ctx.lineWidth = 1.2;
                        ctx.fillRect(pt.x - bw / 2, pt.y - bh / 2, bw, bh);
                        ctx.strokeRect(pt.x - bw / 2, pt.y - bh / 2, bw, bh);
                    }
                }
            });
            return;
        }

        if (type === "two-moons-embedding") {
            const NP = params.nPoints || 100;
            const N = NP;
            const pts = [];
            for (let i = 0; i < N / 2; i++) {
                const u = (i / (N / 2 - 1)) * Math.PI;
                const r = 1.0 + (Math.random() - 0.5) * (params.noise || 0.08);
                pts.push({ x: Math.cos(u) * r, y: Math.sin(u) * r, cl: 0, fiedler: -1 });
            }
            for (let i = 0; i < N / 2; i++) {
                const u = (i / (N / 2 - 1)) * Math.PI;
                const r = 1.0 + (Math.random() - 0.5) * (params.noise || 0.08);
                pts.push({ x: 1 - Math.cos(u) * r, y: 0.5 - Math.sin(u) * r, cl: 1, fiedler: 1 });
            }
            const edges = [];
            for (let i = 0; i < N; i++) {
                for (let j = i + 1; j < N; j++) {
                    const dx = pts[i].x - pts[j].x, dy = pts[i].y - pts[j].y;
                    const d = Math.hypot(dx, dy);
                    if (d < (params.sigma || 0.28)) edges.push([i, j, pts[i].cl === pts[j].cl]);
                }
            }
            let W = 0, H = 0;
            KW.fit(canvas, (w, h, dpr) => { W = w; H = h; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); });
            if (params.caption) KW.tag(params.caption, canvas);

            KW.loop(canvas, (t) => {
                const p = KW.local(canvas), on = p.x > 0 && p.x < W && p.y > 0 && p.y < H;
                const alpha = on ? Math.max(0, Math.min(1, p.x / W)) : 0.5 + 0.5 * Math.sin(t * 0.7);
                const cx = W * (W > 900 ? 0.74 : 0.5), cy = H * 0.5, sc = Math.min(W, H) * 0.26;
                ctx.clearRect(0, 0, W, H);

                const coords = pts.map((pt, i) => {
                    const targetX = pt.fiedler * 1.35 + (i % 7 - 3) * 0.04;
                    const targetY = ((i % (N / 2)) / (N / 2) - 0.5) * 1.6;
                    return {
                        x: cx + ((1 - alpha) * pt.x + alpha * targetX) * sc,
                        y: cy + ((1 - alpha) * pt.y + alpha * targetY) * sc,
                        cl: pt.cl
                    };
                });

                for (const [u, v, same] of edges) {
                    ctx.strokeStyle = same ? (pts[u].cl === 0 ? "rgba(34,211,238,0.4)" : "rgba(244,63,94,0.4)") : "rgba(148,163,184,0.12)";
                    ctx.lineWidth = same ? 1.2 : 0.8;
                    ctx.beginPath(); ctx.moveTo(coords[u].x, coords[u].y); ctx.lineTo(coords[v].x, coords[v].y); ctx.stroke();
                }

                for (const q of coords) {
                    ctx.fillStyle = q.cl === 0 ? "#22d3ee" : "#f43f5e";
                    ctx.beginPath(); ctx.arc(q.x, q.y, 3.4, 0, TAU); ctx.fill();
                }
            });
            return;
        }

        // Spectral SBM Graph
        const K = params.clusters || 5, NK = params.nodesPerCluster || 18, N = K * NK;
        const PAL = [[245, 158, 11], [34, 211, 238], [244, 63, 94], [16, 185, 129], [167, 139, 250]];
        const nodes = Array.from({ length: N }, (_, i) => {
            const cl = Math.floor(i / NK), ang = (cl / K) * TAU, r = 0.62;
            return {
                cl, rx: (Math.random() - 0.5) * 1.5, ry: (Math.random() - 0.5) * 1.5,
                sx: Math.cos(ang) * r + (Math.random() - 0.5) * 0.24,
                sy: Math.sin(ang) * r + (Math.random() - 0.5) * 0.24,
                ph: Math.random() * TAU
            };
        });
        const edges = [];
        for (let i = 0; i < N; i++) {
            for (let j = i + 1; j < N; j++) {
                const same = nodes[i].cl === nodes[j].cl;
                if (Math.random() < (same ? (params.pIn || 0.34) : (params.pOut || 0.012))) edges.push([i, j, same]);
            }
        }
        let W = 0, H = 0;
        KW.fit(canvas, (w, h, dpr) => { W = w; H = h; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); });
        if (params.caption) KW.tag(params.caption, canvas);

        KW.loop(canvas, (t) => {
            const p = KW.local(canvas), on = p.x > 0 && p.x < W && p.y > 0 && p.y < H;
            const alpha = on ? Math.max(0, Math.min(1, p.x / W)) : 0.65 + 0.35 * Math.sin(t * 0.65);
            const cx = W * (W > 900 ? 0.72 : 0.5), cy = H * 0.5, sc = Math.min(W, H) * 0.34;
            ctx.clearRect(0, 0, W, H);

            const pos = nodes.map((n) => ({
                x: cx + ((1 - alpha) * n.rx + alpha * n.sx + 0.04 * Math.cos(t * 1.5 + n.ph)) * sc,
                y: cy + ((1 - alpha) * n.ry + alpha * n.sy + 0.04 * Math.sin(t * 1.5 + n.ph)) * sc,
                cl: n.cl
            }));

            for (const [u, v, same] of edges) {
                ctx.strokeStyle = same ? rgba(PAL[pos[u].cl], 0.28) : "rgba(148,163,184,0.12)";
                ctx.lineWidth = same ? 1.1 : 0.7;
                ctx.beginPath(); ctx.moveTo(pos[u].x, pos[u].y); ctx.lineTo(pos[v].x, pos[v].y); ctx.stroke();
            }
            for (const q of pos) {
                ctx.fillStyle = rgba(PAL[q.cl], 0.95);
                ctx.beginPath(); ctx.arc(q.x, q.y, 3.3, 0, TAU); ctx.fill();
            }
        });
    };

    /* =========================================================================
       10. SURFACE: Differential Geometry, Immersions & Poincaré Hyperbolic Discs
       ========================================================================= */
    ENGINES.surface = (canvas, params = {}) => {
        const type = params.type || "gauss-bonnet-figure8";

        // 1. Poincaré Hyperbolic Disc Model (2D)
        if (type === "poincare-disc") {
            const ctx = canvas.getContext("2d");
            const N = params.nodes || 26;
            const nodes = Array.from({ length: N }, (_, i) => ({
                r: 0.18 + Math.pow(Math.random(), 0.75) * 0.72,
                th: Math.random() * TAU, spd: 0.03 + (i % 5) * 0.012,
                sz: 2.2 + (i % 3 === 0 ? 1.8 : 0)
            }));
            const links = [];
            for (let i = 0; i < N; i++) {
                for (let j = i + 1; j < N; j++) {
                    if ((i * 5 + j * 11) % 7 === 0) links.push([i, j]);
                }
            }
            let W = 0, H = 0;
            KW.fit(canvas, (w, h, dpr) => { W = w; H = h; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); });
            if (params.caption) KW.tag(params.caption, canvas);

            KW.loop(canvas, (t) => {
                const p = KW.local(canvas), on = p.x > 0 && p.x < W && p.y > 0 && p.y < H;
                const col = KW.col.a;
                ctx.clearRect(0, 0, W, H);
                const cx = W * (W > 900 ? 0.72 : 0.5), cy = H * 0.5;
                const R = Math.min(W * 0.38, H * 0.44, params.radius || 250);

                let z0x = 0, z0y = 0;
                if (on) {
                    const mx = (p.x - cx) / R, my = (p.y - cy) / R, md = Math.hypot(mx, my);
                    if (md < 0.95) { z0x = mx * 0.38; z0y = my * 0.38; }
                }

                // Boundary circle
                ctx.strokeStyle = rgba(col, 0.42); ctx.lineWidth = 1.8;
                ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.stroke();

                // Conformal mapping
                const pos = [];
                for (let i = 0; i < N; i++) {
                    const nd = nodes[i], th = nd.th + t * nd.spd;
                    const zx = nd.r * Math.cos(th), zy = nd.r * Math.sin(th);
                    const numX = zx - z0x, numY = zy - z0y;
                    const denX = 1 - (z0x * zx + z0y * zy), denY = -(z0x * zy - z0y * zx);
                    const d2 = denX * denX + denY * denY || 1;
                    const wx = (numX * denX + numY * denY) / d2, wy = (numY * denX - numX * denY) / d2;
                    pos.push({ x: cx + wx * R, y: cy + wy * R, d: Math.hypot(wx, wy) });
                }

                // Geodesics
                ctx.lineWidth = 1;
                for (const [i, j] of links) {
                    const p1 = pos[i], p2 = pos[j];
                    if (p1.d > 0.98 || p2.d > 0.98) continue;
                    const midX = (p1.x + p2.x) / 2, midY = (p1.y + p2.y) / 2;
                    const ctrlX = midX * 0.72 + cx * 0.28, ctrlY = midY * 0.72 + cy * 0.28;
                    ctx.strokeStyle = rgba(col, Math.max(0.08, 0.36 - Math.max(p1.d, p2.d) * 0.28));
                    ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.quadraticCurveTo(ctrlX, ctrlY, p2.x, p2.y); ctx.stroke();
                }

                for (let i = 0; i < N; i++) {
                    const pt = pos[i];
                    if (pt.d > 0.99) continue;
                    ctx.fillStyle = rgba(col, Math.max(0.2, 1 - pt.d * pt.d));
                    ctx.beginPath(); ctx.arc(pt.x, pt.y, nodes[i].sz, 0, TAU); ctx.fill();
                }
            });
            return;
        }

        // 2. 2D fallback for wireframe surfaces (Three.js dependency removed in favour of GFX WebGL2)
        const ctx = canvas.getContext("2d");
        KW.fit(canvas, (w, h, dpr) => { ctx.setTransform(dpr, 0, 0, dpr, 0, 0); });
        KW.loop(canvas, () => {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.strokeStyle = rgba(KW.col.a, 0.6);
            ctx.beginPath(); ctx.arc(canvas.width / 2, canvas.height / 2, 50, 0, TAU); ctx.stroke();
        });
        if (params.caption) KW.tag(params.caption, canvas);
    };

    /* =========================================================================
       11. FOURIER: Harmonic Synthesis, Epicycles & Discrete FFT Spectrum
       (2D Fallback for Fourier / Spectral / Primes from Waves)
       ========================================================================= */
    const fourier2DFallback = (canvas, params = {}) => {
        const ctx = canvas.getContext("2d");
        let W = 0, H = 0, K = params.harmonics || 11, signal = params.signal || "square";
        const wave = new Float32Array(320);
        let head = 0;

        KW.fit(canvas, (w, h, dpr) => { W = w; H = h; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); });
        if (params.caption) KW.tag(params.caption, canvas);
        KW.onClick(canvas, () => {
            const sigs = ["square", "sawtooth", "triangle"];
            signal = sigs[(sigs.indexOf(signal) + 1) % sigs.length];
        });

        KW.loop(canvas, (t) => {
            const p = KW.local(canvas), on = p.x > 0 && p.x < W && p.y > 0 && p.y < H;
            if (on) K = Math.max(1, Math.min(21, Math.round(1 + (1 - p.y / Math.max(H, 1)) * 20)));

            const a = KW.col.a, cx = W * (W > 900 ? 0.62 : 0.34), cy = H * 0.42;
            const baseR = Math.min(W, H) * (params.baseR || 0.14);
            ctx.clearRect(0, 0, W, H);

            let x = cx, y = cy;
            const amps = [];
            for (let m = 0; m < K; m++) {
                const k = signal === "sawtooth" ? m + 1 : 2 * m + 1;
                const sign = signal === "triangle" && m % 2 === 1 ? -1 : 1;
                const coef = signal === "square" ? 4 / (Math.PI * k) : signal === "sawtooth" ? (m % 2 ? -2 : 2) / (Math.PI * k) : (8 / (Math.PI * Math.PI * k * k)) * sign;
                const rad = Math.abs(coef) * baseR;
                amps.push({ k, mag: Math.abs(coef) });
                const px = x, py = y, ang = k * t * 1.9 + (coef < 0 ? Math.PI : 0);
                x += rad * Math.cos(ang); y += rad * Math.sin(ang);
                ctx.strokeStyle = rgba(a, 0.25); ctx.lineWidth = 1;
                ctx.beginPath(); ctx.arc(px, py, rad, 0, TAU); ctx.stroke();
                ctx.strokeStyle = rgba(a, 0.78); ctx.lineWidth = 1.4;
                ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(x, y); ctx.stroke();
            }
            wave[head] = y; head = (head + 1) % wave.length;

            const wx0 = cx + baseR * 1.65, spanW = Math.max(140, W * 0.95 - wx0);
            ctx.strokeStyle = rgba(a, 0.38); ctx.setLineDash([4, 4]);
            ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(wx0, y); ctx.stroke();
            ctx.setLineDash([]);
            ctx.strokeStyle = rgba(a, 0.95); ctx.lineWidth = 2;
            ctx.beginPath();
            for (let i = 0; i < wave.length; i++) {
                const idx = (head - 1 - i + wave.length) % wave.length;
                const xx = wx0 + (i / wave.length) * spanW, yy = wave[idx] || cy;
                i === 0 ? ctx.moveTo(xx, yy) : ctx.lineTo(xx, yy);
            }
            ctx.stroke();

            if (params.showSpectrum) {
                const sy0 = H * 0.84, sw = W * 0.38, sx0 = W * (W > 900 ? 0.58 : 0.28);
                ctx.strokeStyle = rgba(a, 0.3); ctx.lineWidth = 1;
                ctx.beginPath(); ctx.moveTo(sx0, sy0); ctx.lineTo(sx0 + sw, sy0); ctx.stroke();
                amps.forEach((h, idx) => {
                    const bx = sx0 + ((idx + 0.5) / Math.max(K, 8)) * sw, bh = h.mag * baseR * 1.15;
                    ctx.fillStyle = rgba(a, 0.78); ctx.fillRect(bx - 5, sy0 - bh, 10, bh);
                });
            }
        });
    };
    ENGINES.fourier = (canvas, params = {}) => {
        if (root.SIMS && (root.SIMS["fourier-spectral"] || root.SIMS.fourier)) {
            return (root.SIMS["fourier-spectral"] || root.SIMS.fourier)(canvas, params);
        }
        return fourier2DFallback(canvas, params);
    };
    ENGINES["fourier-2d"] = ENGINES.fourier;
    ENGINES["cy-cross-section-2d"] = ENGINES.surface;

    /* =========================================================================
       12. PATHS: Geometric Brownian Motion Fans & Ornstein-Uhlenbeck Spreads
       ========================================================================= */
    ENGINES.paths = (canvas, params = {}) => {
        const ctx = canvas.getContext("2d");
        const process = params.process || "gbm";

        if (process === "ou-spread") {
            const N = params.samples || 200;
            const legA = new Float32Array(N), legB = new Float32Array(N), zBuf = new Float32Array(N);
            let common = 0, ou = 0, acc = 0, W = 0, H = 0;
            const stepOU = () => {
                common = common * 0.992 + randn() * 0.18;
                ou = ou * 0.92 + randn() * (params.sigmaSpread || 0.42);
                legA.copyWithin(0, 1); legB.copyWithin(0, 1); zBuf.copyWithin(0, 1);
                legA[N - 1] = common + 0.5 * ou; legB[N - 1] = common - 0.5 * ou; zBuf[N - 1] = ou;
            };
            for (let i = 0; i < N; i++) stepOU();

            KW.fit(canvas, (w, h, dpr) => { W = w; H = h; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); });
            if (params.caption) KW.tag(params.caption, canvas);

            KW.loop(canvas, (t, dt) => {
                acc += dt * 32;
                while (acc >= 1) { stepOU(); acc -= 1; }
                const a = KW.col.a, x0 = W * (W > 900 ? 0.48 : 0.06), x1 = W * 0.98, span = x1 - x0;
                const yTop = H * 0.32, yBot = H * 0.72, scTop = H * 0.06, scBot = H * 0.058;
                ctx.clearRect(0, 0, W, H);

                ctx.strokeStyle = rgba(a, 0.92); ctx.lineWidth = 1.8;
                ctx.beginPath();
                for (let i = 0; i < N; i++) {
                    const x = x0 + (i / (N - 1)) * span, y = yTop - legA[i] * scTop;
                    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
                }
                ctx.stroke();

                ctx.strokeStyle = "rgba(34,211,238,0.82)"; ctx.lineWidth = 1.6;
                ctx.beginPath();
                for (let i = 0; i < N; i++) {
                    const x = x0 + (i / (N - 1)) * span, y = yTop - legB[i] * scTop;
                    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
                }
                ctx.stroke();

                // z-score thresholds
                ctx.setLineDash([5, 5]);
                for (const lvl of [-2, 0, 2]) {
                    ctx.strokeStyle = lvl === 0 ? rgba(a, 0.35) : "rgba(244,63,94,0.55)";
                    ctx.beginPath(); ctx.moveTo(x0, yBot - lvl * scBot); ctx.lineTo(x1, yBot - lvl * scBot); ctx.stroke();
                }
                ctx.setLineDash([]);

                ctx.strokeStyle = rgba(a, 0.95); ctx.lineWidth = 1.8;
                ctx.beginPath();
                for (let i = 0; i < N; i++) {
                    const x = x0 + (i / (N - 1)) * span, y = yBot - zBuf[i] * scBot;
                    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
                }
                ctx.stroke();
            });
            return;
        }

        // GBM paths fan
        const P = params.paths || 65, NS = params.steps || 220, MU = params.mu ?? 0.05, STEPS_PER_S = 70;
        const lnS = new Float32Array(P * (NS + 1));
        let W = 0, H = 0, k = 0, acc = 0, hold = 0, sigma = params.sigma || 0.32;

        KW.fit(canvas, (w, h, dpr) => { W = w; H = h; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); });
        if (params.caption) KW.tag(params.caption, canvas);

        KW.loop(canvas, (t, dt) => {
            const p = KW.local(canvas);
            if (p.y > 0 && p.y < H && p.x > 0 && p.x < W) sigma += (0.12 + 0.88 * (1 - p.y / H) - sigma) * 0.06;
            if (k < NS) {
                acc += dt * STEPS_PER_S;
                while (acc >= 1 && k < NS) {
                    for (let i = 0; i < P; i++) {
                        const o = i * (NS + 1) + k;
                        lnS[o + 1] = lnS[o] + (MU - 0.5 * sigma * sigma) / NS + (sigma / Math.sqrt(NS)) * randn();
                    }
                    k++; acc -= 1;
                }
            } else if ((hold += dt) > 1.8) { lnS.fill(0); k = 0; hold = 0; }

            const x0 = W * (W > 900 ? 0.48 : 0.04), x1 = W * 0.98, mid = H * 0.5, sc = H * 0.2, a = KW.col.a;
            const px = (j) => x0 + ((x1 - x0) * j) / NS, py = (v) => mid - v * sc;
            ctx.clearRect(0, 0, W, H);

            ctx.strokeStyle = rgba(a, 0.22); ctx.lineWidth = 1;
            for (let i = 0; i < P; i++) {
                ctx.beginPath();
                for (let j = 0; j <= k; j++) {
                    const o = lnS[i * (NS + 1) + j];
                    j ? ctx.lineTo(px(j), py(o)) : ctx.moveTo(px(j), py(o));
                }
                ctx.stroke();
            }
        });
    };

    /* =========================================================================
       13. DESCENT: Optimization Surfaces & Regularised Coefficient Paths
       ========================================================================= */
    ENGINES.descent = (canvas, params = {}) => {
        const ctx = canvas.getContext("2d");
        const landscape = params.landscape || "lasso-ridge-contours";
        let W = 0, H = 0, lam = params.lambda ?? 0.35;
        const pts = Array.from({ length: params.points || 24 }, (_, i) => {
            const u = (i / 23) * 2 - 1;
            return { x: u, y: 0.55 * Math.sin(u * 2.6) + 0.25 * u + ((i * 37) % 11 - 5) * 0.045 };
        });

        KW.fit(canvas, (w, h, dpr) => { W = w; H = h; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); });
        if (params.caption) KW.tag(params.caption, canvas);

        KW.loop(canvas, (t) => {
            const p = KW.local(canvas), on = p.x > 0 && p.x < W && p.y > 0 && p.y < H;
            lam = on ? Math.max(0.02, Math.min(1.5, ((p.x / W) - 0.2) * 1.8)) : 0.55 + 0.5 * Math.sin(t * 0.7);
            const a = KW.col.a;
            ctx.clearRect(0, 0, W, H);

            // Left: polynomial fit
            const fx0 = W * (W > 900 ? 0.48 : 0.06), fw = W * (W > 900 ? 0.24 : 0.40), fy = H * 0.52, fsc = H * 0.22;
            ctx.strokeStyle = rgba(a, 0.22); ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(fx0, fy); ctx.lineTo(fx0 + fw, fy); ctx.stroke();

            const shrink = 1 / (1 + lam * 1.8);
            ctx.strokeStyle = rgba(a, 0.96); ctx.lineWidth = 2.4;
            ctx.beginPath();
            for (let k = 0; k <= 80; k++) {
                const u = (k / 80) * 2 - 1, xx = fx0 + (k / 80) * fw;
                const yReg = shrink * (0.55 * Math.sin(u * 2.6) + 0.25 * u) + (shrink * shrink * 0.28) * Math.cos(u * 11.5);
                k === 0 ? ctx.moveTo(xx, fy - yReg * fsc) : ctx.lineTo(xx, fy - yReg * fsc);
            }
            ctx.stroke();

            ctx.fillStyle = rgba(a, 0.85);
            for (const q of pts) {
                ctx.beginPath(); ctx.arc(fx0 + ((q.x + 1) / 2) * fw, fy - q.y * fsc, 2.6, 0, TAU); ctx.fill();
            }

            // Right: (beta1, beta2) RSS contours + L1 Diamond
            const cx = W * (W > 900 ? 0.85 : 0.74), cy = H * 0.52, axL = Math.min(110, W * 0.21), scR = axL / 110;
            const R = Math.min(W, H) * 0.14 * (1.15 - 0.45 * (lam / 1.5));
            ctx.strokeStyle = rgba(a, 0.25); ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(cx - axL, cy); ctx.lineTo(cx + axL, cy); ctx.moveTo(cx, cy - axL); ctx.lineTo(cx, cy + axL); ctx.stroke();

            // L1 Lasso diamond
            ctx.strokeStyle = rgba(a, 0.92); ctx.fillStyle = rgba(a, 0.12); ctx.lineWidth = 2;
            ctx.beginPath(); ctx.moveTo(cx, cy - R); ctx.lineTo(cx + R, cy); ctx.lineTo(cx, cy + R); ctx.lineTo(cx - R, cy); ctx.closePath(); ctx.fill(); ctx.stroke();

            // Elliptical RSS contours
            const bx = cx + 52 * scR, by = cy - 64 * scR;
            ctx.save(); ctx.translate(bx, by); ctx.rotate(-0.55);
            for (let m = 1; m <= 4; m++) {
                ctx.strokeStyle = `rgba(244,63,94,${0.75 - m * 0.14})`; ctx.lineWidth = 1.3;
                ctx.beginPath(); ctx.ellipse(0, 0, m * 22 * scR, m * 11 * scR, 0, 0, TAU); ctx.stroke();
            }
            ctx.restore();

            // Highlight sparse vertex
            ctx.fillStyle = "#ffffff";
            ctx.beginPath(); ctx.arc(cx, cy - R, 4.5, 0, TAU); ctx.fill();
        });
    };

    /* =========================================================================
       14. ALGO: TTL Shared W-Bus, Logic Analysers & Compiler SSA Dataflows
       ========================================================================= */
    ENGINES.algo = (canvas, params = {}) => {
        const ctx = canvas.getContext("2d");
        const type = params.type || "ttl-wbus";
        let W = 0, H = 0;

        KW.fit(canvas, (w, h, dpr) => { W = w; H = h; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); });
        if (params.caption) KW.tag(params.caption, canvas);

        if (type === "compiler-ssa") {
            const NODES = [
                { lbl: "entry: %0 = alloca i32", u: 0.5, v: 0.16 },
                { lbl: "loop.cond: %cmp = icmp slt %i, %n", u: 0.5, v: 0.36 },
                { lbl: "bb.then: %x1 = add i32 %a, %b", u: 0.28, v: 0.58 },
                { lbl: "bb.else: %x2 = mul i32 %a, 2", u: 0.72, v: 0.58 },
                { lbl: "bb.merge: %x3 = φ [%x1, then], [%x2, else]", u: 0.5, v: 0.8 }
            ];
            const EDGES = [[0, 1], [1, 2], [1, 3], [2, 4], [3, 4], [4, 1]];

            KW.loop(canvas, (t) => {
                const a = KW.col.a, x0 = W * (W > 900 ? 0.48 : 0.08), spanW = W * (W > 900 ? 0.48 : 0.84);
                const cyan = "#22d3ee";
                ctx.clearRect(0, 0, W, H);

                const pts = NODES.map((n, idx) => ({
                    x: x0 + n.u * spanW + Math.sin(t * 1.4 + idx) * 6,
                    y: H * n.v + Math.cos(t * 1.2 + idx) * 4,
                    lbl: n.lbl
                }));

                for (let e = 0; e < EDGES.length; e++) {
                    const [u, v] = EDGES[e], p0 = pts[u], p1 = pts[v];
                    ctx.strokeStyle = rgba(a, 0.45); ctx.lineWidth = 1.6;
                    ctx.beginPath(); ctx.moveTo(p0.x, p0.y); ctx.lineTo(p1.x, p1.y); ctx.stroke();
                    const frac = (t * 0.75 + e * 0.23) % 1;
                    ctx.fillStyle = cyan;
                    ctx.beginPath(); ctx.arc(p0.x + (p1.x - p0.x) * frac, p0.y + (p1.y - p0.y) * frac, 3.6, 0, TAU); ctx.fill();
                }

                const mob = W <= 900, bw = mob ? Math.min(200, Math.max(134, spanW * 0.46)) : (params.nodeCardW || 248), bh = mob ? 30 : 34;
                ctx.font = (mob ? '500 8.5px' : '500 11px') + ' "JetBrains Mono", monospace';
                ctx.textAlign = "center"; ctx.textBaseline = "middle";
                pts.forEach((p, idx) => {
                    ctx.fillStyle = "rgba(12,14,22,0.88)";
                    ctx.strokeStyle = rgba(a, 0.75); ctx.lineWidth = 1.5;
                    ctx.fillRect(p.x - bw / 2, p.y - bh / 2, bw, bh);
                    ctx.strokeRect(p.x - bw / 2, p.y - bh / 2, bw, bh);
                    ctx.fillStyle = rgba(a, 0.98);
                    ctx.fillText(p.lbl, p.x, p.y, bw - 10);
                });
            });
            return;
        }

        if (type === "fft-butterfly") {
            const stages = params.stages || 4;
            const N = params.points || 16;
            const bitRev = (val, bits) => {
                let res = 0;
                for (let b = 0; b < bits; b++) { if ((val >> b) & 1) res |= (1 << (bits - 1 - b)); }
                return res;
            };
            const perm = Array.from({ length: N }, (_, i) => bitRev(i, 4));

            KW.loop(canvas, (t) => {
                const a = KW.col.a, cyan = "#22d3ee";
                const x0 = W * (W > 900 ? 0.46 : 0.08), x1 = W * 0.96, spanW = x1 - x0;
                const colGap = spanW / stages;
                const y0 = H * 0.16, y1 = H * 0.88, rowGap = (y1 - y0) / (N - 1);
                ctx.clearRect(0, 0, W, H);

                for (let s = 0; s <= stages; s++) {
                    const sx = x0 + s * colGap;
                    ctx.strokeStyle = rgba(a, 0.25); ctx.lineWidth = 1;
                    ctx.beginPath(); ctx.moveTo(sx, y0 - 10); ctx.lineTo(sx, y1 + 10); ctx.stroke();

                    for (let r = 0; r < N; r++) {
                        const ry = y0 + r * rowGap;
                        ctx.fillStyle = rgba(a, 0.85);
                        ctx.beginPath(); ctx.arc(sx, ry, 2.8, 0, TAU); ctx.fill();
                    }
                }

                for (let s = 0; s < stages; s++) {
                    const sx1 = x0 + s * colGap, sx2 = x0 + (s + 1) * colGap;
                    const stepSize = 1 << (s + 1), halfStep = 1 << s;
                    for (let g = 0; g < N; g += stepSize) {
                        for (let b = 0; b < halfStep; b++) {
                            const r1 = g + b, r2 = g + b + halfStep;
                            const yA = y0 + r1 * rowGap, yB = y0 + r2 * rowGap;
                            ctx.strokeStyle = rgba(a, 0.35); ctx.lineWidth = 1.2;
                            ctx.beginPath(); ctx.moveTo(sx1, yA); ctx.lineTo(sx2, yA); ctx.stroke();
                            ctx.beginPath(); ctx.moveTo(sx1, yB); ctx.lineTo(sx2, yB); ctx.stroke();
                            ctx.strokeStyle = cyan; ctx.lineWidth = 1.0;
                            ctx.beginPath(); ctx.moveTo(sx1, yA); ctx.lineTo(sx2, yB); ctx.stroke();
                            ctx.beginPath(); ctx.moveTo(sx1, yB); ctx.lineTo(sx2, yA); ctx.stroke();

                            const pulse = (t * 0.8 + s * 0.25 + b * 0.1) % 1;
                            const px = sx1 + (sx2 - sx1) * pulse;
                            const py = yA + (yB - yA) * pulse;
                            ctx.fillStyle = "#ffffff";
                            ctx.beginPath(); ctx.arc(px, py, 2.2, 0, TAU); ctx.fill();
                        }
                    }
                }

                ctx.font = '500 9px "JetBrains Mono", monospace';
                ctx.textAlign = "right"; ctx.textBaseline = "middle";
                ctx.fillStyle = rgba(a, 0.95);
                for (let r = 0; r < N; r++) {
                    ctx.fillText(`x[${perm[r]}]`, x0 - 8, y0 + r * rowGap);
                    ctx.fillText(`X[${r}]`, x1 + 28, y0 + r * rowGap);
                }
            });
            return;
        }

        // TTL W-Bus and Logic Analyser
        const OPS = ["LDA 0x0E", "ADD 0x0F", "OUT", "SUB 0x0C", "JC 0x02", "JMP 0x00"];
        KW.loop(canvas, (t) => {
            const step = Math.floor(t * (params.clkSpeed || 2.5));
            const pc = step % OPS.length;
            const busVal = ((step * 37 + 0x2A) & 0xFF);
            const regA = (busVal ^ 0x55) & 0xFF, regB = 0x17;
            const sum = regA + regB, carry = sum > 0xFF ? 1 : 0;

            const a = KW.col.a, x0 = W * (W > 900 ? 0.48 : 0.06), x1 = W * 0.96, span = Math.max(x1 - x0, 1);
            const cyan = "#22d3ee";
            ctx.clearRect(0, 0, W, H);

            // 8 W-Bus bit lines
            const by0 = H * 0.24, bGap = 11;
            for (let b = 0; b < 8; b++) {
                const bit = (busVal >> (7 - b)) & 1, y = by0 + b * bGap;
                ctx.strokeStyle = bit ? rgba(a, 0.92) : rgba(a, 0.2);
                ctx.lineWidth = bit ? 2.2 : 1;
                ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.stroke();
                if (bit) {
                    const px = x0 + ((t * 220 + b * 45) % span);
                    ctx.fillStyle = cyan; ctx.beginPath(); ctx.arc(px, y, 3, 0, TAU); ctx.fill();
                }
            }

            // Modules
            const mods = [
                { name: "PC", val: "0x0" + pc.toString(16).toUpperCase() },
                { name: "REG A", val: "0x" + regA.toString(16).padStart(2, "0").toUpperCase() },
                { name: "ALU Σ", val: "0x" + (sum & 0xFF).toString(16).padStart(2, "0").toUpperCase() + (carry ? " C=1" : " C=0") },
                { name: "IR / CU", val: OPS[pc] }
            ];
            const my = H * 0.54, gap = W > 900 ? 12 : 6, mw = (span - gap * 3) / 4;
            ctx.font = (W > 900 ? '500 10px' : '500 8.5px') + ' "JetBrains Mono", monospace';
            mods.forEach((m, i) => {
                const mx = x0 + i * (mw + gap);
                ctx.fillStyle = "rgba(12,14,22,0.86)";
                ctx.strokeStyle = rgba(a, 0.7); ctx.lineWidth = 1.4;
                ctx.strokeRect(mx, my, mw, 52); ctx.fillRect(mx, my, mw, 52);
                ctx.fillStyle = rgba(a, 0.98); ctx.textAlign = "center";
                ctx.fillText(m.name, mx + mw / 2, my + 18, mw - 6);
                ctx.fillStyle = cyan;
                ctx.fillText(m.val, mx + mw / 2, my + 36, mw - 6);
            });

            // Logic analyser traces
            const ly0 = H * 0.74;
            for (let ch = 0; ch < 4; ch++) {
                const y = ly0 + ch * 22;
                ctx.strokeStyle = ch === 0 ? cyan : rgba(a, 0.8 - ch * 0.12);
                ctx.lineWidth = 1.5;
                ctx.beginPath();
                for (let k = 0; k <= 48; k++) {
                    const xx = x0 + (k / 48) * span;
                    const bit = ch === 0 ? (k + Math.floor(t * 8)) & 1 : ((k * (ch + 3) + Math.floor(t * 5)) >> ch) & 1;
                    const yy = y - bit * 11;
                    if (k === 0) ctx.moveTo(xx, yy);
                    else {
                        const prevBit = ch === 0 ? (k - 1 + Math.floor(t * 8)) & 1 : (((k - 1) * (ch + 3) + Math.floor(t * 5)) >> ch) & 1;
                        ctx.lineTo(xx, y - prevBit * 11); ctx.lineTo(xx, yy);
                    }
                }
                ctx.stroke();
            }
        });
    };

    /* =========================================================================
       15. MARKOV: Random Walks, State Transitions & Stationary Distributions
       ========================================================================= */
    ENGINES.markov = (canvas, params = {}) => {
        const ctx = canvas.getContext("2d");
        const S = params.states || 5;
        const stateAngles = Array.from({ length: S }, (_, i) => (i / S) * TAU);
        const P = params.numWalkers || 40;
        const walkers = Array.from({ length: P }, () => ({
            state: Math.floor(Math.random() * S),
            nextState: Math.floor(Math.random() * S),
            progress: Math.random()
        }));
        let W = 0, H = 0;

        KW.fit(canvas, (w, h, dpr) => { W = w; H = h; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); });
        if (params.caption) KW.tag(params.caption, canvas);

        KW.loop(canvas, (t, dt) => {
            ctx.clearRect(0, 0, W, H);
            const a = KW.col.a, cx = W * (W > 900 ? 0.74 : 0.5), cy = H * 0.5;
            const R = Math.min(W, H) * 0.32;

            // Draw Markov state nodes
            const coords = stateAngles.map((ang) => ({ x: cx + Math.cos(ang) * R, y: cy + Math.sin(ang) * R }));
            ctx.strokeStyle = rgba(a, 0.25); ctx.lineWidth = 1;
            for (let i = 0; i < S; i++) {
                for (let j = 0; j < S; j++) {
                    if (i === j) continue;
                    ctx.beginPath(); ctx.moveTo(coords[i].x, coords[i].y); ctx.lineTo(coords[j].x, coords[j].y); ctx.stroke();
                }
            }

            // Step walkers
            for (const w of walkers) {
                w.progress += dt * 0.85;
                if (w.progress >= 1) {
                    w.state = w.nextState;
                    w.nextState = (w.state + (Math.random() < 0.5 ? 1 : S - 1)) % S;
                    w.progress = 0;
                }
                const p0 = coords[w.state], p1 = coords[w.nextState];
                const wx = p0.x + (p1.x - p0.x) * w.progress, wy = p0.y + (p1.y - p0.y) * w.progress;
                ctx.fillStyle = rgba(a, 0.95);
                ctx.beginPath(); ctx.arc(wx, wy, 3, 0, TAU); ctx.fill();
            }

            // Draw state rings
            for (let i = 0; i < S; i++) {
                ctx.fillStyle = "rgba(12,14,22,0.9)";
                ctx.strokeStyle = rgba(a, 0.85); ctx.lineWidth = 2;
                ctx.beginPath(); ctx.arc(coords[i].x, coords[i].y, 16, 0, TAU); ctx.fill(); ctx.stroke();
                ctx.font = '600 11px "JetBrains Mono", monospace'; ctx.fillStyle = rgba(a, 1);
                ctx.textAlign = "center"; ctx.textBaseline = "middle";
                ctx.fillText(`S${i}`, coords[i].x, coords[i].y);
            }
        });
    };

    ENGINES.blackhole = (c, p = {}) => (window.SIMS?.blackhole ? window.SIMS.blackhole(c, p) : ENGINES.nbody(c, { mode: "central-heavy", n: 140, dt: 0.016, soft: 14, mCenter: 12000 }));
    ENGINES["copula-2d"] = (c, p = {}) => ENGINES.orbit(c, { system: "duffing", alpha: 1.0, beta: 1.0, delta: 0.2, dt: 0.015, scale: 65, numTraj: 2, pert: 0.01, ...p });
    ENGINES.copula = (c, p = {}) => (window.SIMS?.copula ? window.SIMS.copula(c, p) : ENGINES["copula-2d"](c, p));

    return ENGINES;
}));
