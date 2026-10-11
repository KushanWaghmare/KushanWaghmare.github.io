/* One simulation per page. Each takes the hero <canvas>; helpers (KW.*) come from app.js.
   2D sims use Canvas; the hub (Lorenz) and mathematics (Möbius manifold) pages use Three.js. */
const SIMS = {};
const TAU = Math.PI * 2;
const randn = () => Math.sqrt(-2 * Math.log(1 - Math.random())) * Math.cos(TAU * Math.random());
const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;

/* ------------------------------------------------------------------ PHYSICS
   Self-gravitating disc about a heavy centre. Kick-drift-kick leapfrog (symplectic):
   H~ = H + O(dt^2) is conserved, so orbital energy stays bounded instead of drifting. */
SIMS.physics = (c) => {
    const ctx = c.getContext("2d");
    const N = 130, G = 1, M = 2e6, EPS = 14, MOUSE_M = 4e5, TL = 18, H = 1 / 120;
    const x = new Float32Array(N), y = new Float32Array(N), vx = new Float32Array(N), vy = new Float32Array(N);
    const ax = new Float32Array(N), ay = new Float32Array(N), hist = new Float32Array(N * TL * 2);
    const m = new Float32Array(N).fill(2000);
    let W = 0, Hh = 0, cx = 0, cy = 0, ready = false, hp = 0, acc = 0;

    const spawn = (i) => {
        const r = 60 + Math.random() * Math.min(W, Hh) * 0.42, a = Math.random() * TAU;
        const vc = Math.sqrt((G * M * r * r) / Math.pow(r * r + EPS * EPS, 1.5)) * (0.94 + Math.random() * 0.12);
        x[i] = cx + r * Math.cos(a); y[i] = cy + r * Math.sin(a);
        vx[i] = -Math.sin(a) * vc; vy[i] = Math.cos(a) * vc;
        for (let k = 0; k < TL; k++) { hist[(i * TL + k) * 2] = x[i]; hist[(i * TL + k) * 2 + 1] = y[i]; }
    };
    const accel = (mx, my, mouseOn) => {
        for (let i = 0; i < N; i++) {
            let fx = 0, fy = 0, dx = cx - x[i], dy = cy - y[i], d2 = dx * dx + dy * dy + EPS * EPS;
            let f = (G * M) / (d2 * Math.sqrt(d2));
            fx += f * dx; fy += f * dy;
            for (let j = 0; j < N; j++) {
                if (j === i) continue;
                dx = x[j] - x[i]; dy = y[j] - y[i]; d2 = dx * dx + dy * dy + EPS * EPS;
                f = (G * m[j]) / (d2 * Math.sqrt(d2));
                fx += f * dx; fy += f * dy;
            }
            if (mouseOn) {
                dx = mx - x[i]; dy = my - y[i]; d2 = dx * dx + dy * dy + EPS * EPS;
                f = (G * MOUSE_M) / (d2 * Math.sqrt(d2));
                fx += f * dx; fy += f * dy;
            }
            ax[i] = fx; ay[i] = fy;
        }
    };
    const step = (mx, my, on) => {
        for (let i = 0; i < N; i++) { vx[i] += ax[i] * H / 2; vy[i] += ay[i] * H / 2; x[i] += vx[i] * H; y[i] += vy[i] * H; }
        accel(mx, my, on);
        for (let i = 0; i < N; i++) { vx[i] += ax[i] * H / 2; vy[i] += ay[i] * H / 2; }
    };

    KW.fit(c, (w, h, dpr) => {
        W = w; Hh = h; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        cx = W * (W > 900 ? 0.68 : 0.5); cy = Hh * 0.5;
        if (!ready) { for (let i = 0; i < N; i++) spawn(i); accel(-1e4, -1e4, false); ready = true; }
    });
    KW.tag(SITE.domains.physics.tag);
    KW.loop(c, (t, dt) => {
        const p = KW.local(c), on = p.x > 0 && p.x < W && p.y > 0 && p.y < Hh;
        acc = Math.min(acc + dt, 0.1);
        while (acc >= H) { step(p.x, p.y, on); acc -= H; }
        for (let i = 0; i < N; i++) {
            const dx = x[i] - cx, dy = y[i] - cy;
            if (dx * dx + dy * dy < 100 || Math.abs(dx) > W * 1.5 || Math.abs(dy) > Hh * 1.5) spawn(i);
        }
        hp = (hp + 1) % TL;
        for (let i = 0; i < N; i++) { hist[(i * TL + hp) * 2] = x[i]; hist[(i * TL + hp) * 2 + 1] = y[i]; }

        const a = KW.col.a;
        ctx.clearRect(0, 0, W, Hh);
        ctx.lineWidth = 1; ctx.strokeStyle = rgba(a, 0.3);
        for (let i = 0; i < N; i++) {
            ctx.beginPath();
            for (let k = 1; k <= TL; k++) {
                const idx = (i * TL + ((hp + k) % TL)) * 2;
                k === 1 ? ctx.moveTo(hist[idx], hist[idx + 1]) : ctx.lineTo(hist[idx], hist[idx + 1]);
            }
            ctx.stroke();
        }
        ctx.fillStyle = rgba(a, 0.95);
        for (let i = 0; i < N; i++) { ctx.beginPath(); ctx.arc(x[i], y[i], 1.7, 0, TAU); ctx.fill(); }
        const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, 46);
        g.addColorStop(0, rgba(a, 0.9)); g.addColorStop(1, rgba(a, 0));
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, 46, 0, TAU); ctx.fill();
        if (on) { ctx.strokeStyle = rgba(a, 0.8); ctx.beginPath(); ctx.arc(p.x, p.y, 9, 0, TAU); ctx.stroke(); }
    });
};

/* ------------------------------------------------------------- DATA SCIENCE
   Stochastic block model (5 communities, one per site accent colour) laid out by a
   force-directed simulation: pairwise repulsion + edge springs + weak centring. */
SIMS.datascience = (c) => {
    const ctx = c.getContext("2d");
    const N = 96, K = 5, KR = 700, KS = 0.05, L = 30, KG = 0.006, MR = 150;
    const comm = Array.from({ length: N }, (_, i) => i % K), edges = [], deg = new Uint8Array(N);
    for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++)
        if (Math.random() < (comm[i] === comm[j] ? 0.16 : 0.007)) { edges.push([i, j]); deg[i]++; deg[j]++; }
    const x = new Float32Array(N), y = new Float32Array(N), vx = new Float32Array(N), vy = new Float32Array(N);
    const fx = new Float32Array(N), fy = new Float32Array(N);
    let W = 0, H = 0, cx = 0, cy = 0, ready = false;

    KW.fit(c, (w, h, dpr) => {
        W = w; H = h; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        cx = W * (W > 900 ? 0.66 : 0.5); cy = H * 0.5;
        if (!ready) {
            for (let i = 0; i < N; i++) {
                const a = (comm[i] / K) * TAU;
                x[i] = cx + Math.cos(a) * 140 + (Math.random() - 0.5) * 80;
                y[i] = cy + Math.sin(a) * 140 + (Math.random() - 0.5) * 80;
            }
            ready = true;
        }
    });
    KW.tag(SITE.domains.datascience.tag);
    KW.loop(c, (t, dt) => {
        const s = Math.min(dt * 60, 2), p = KW.local(c);
        fx.fill(0); fy.fill(0);
        for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) {
            const dx = x[i] - x[j], dy = y[i] - y[j], d2 = dx * dx + dy * dy + 30, d = Math.sqrt(d2), f = KR / d2;
            fx[i] += (f * dx) / d; fy[i] += (f * dy) / d; fx[j] -= (f * dx) / d; fy[j] -= (f * dy) / d;
        }
        for (const [i, j] of edges) {
            const dx = x[j] - x[i], dy = y[j] - y[i], d = Math.sqrt(dx * dx + dy * dy) + 0.01, f = (KS * (d - L)) / d;
            fx[i] += f * dx; fy[i] += f * dy; fx[j] -= f * dx; fy[j] -= f * dy;
        }
        for (let i = 0; i < N; i++) {
            fx[i] += (cx - x[i]) * KG; fy[i] += (cy - y[i]) * KG;
            const dx = x[i] - p.x, dy = y[i] - p.y, d = Math.sqrt(dx * dx + dy * dy);
            if (d < MR && d > 0.01) { const f = (1 - d / MR) * 6; fx[i] += (f * dx) / d; fy[i] += (f * dy) / d; }
            vx[i] = (vx[i] + fx[i] * s) * 0.86; vy[i] = (vy[i] + fy[i] * s) * 0.86;
            x[i] += vx[i] * s; y[i] += vy[i] * s;
        }
        const pal = KW.col.pal, edgeRGB = KW.col.light ? "0,0,0" : "255,255,255";
        ctx.clearRect(0, 0, W, H);
        ctx.lineWidth = 1;
        for (const [i, j] of edges) {
            ctx.strokeStyle = comm[i] === comm[j] ? rgba(pal[comm[i]], 0.35) : `rgba(${edgeRGB},0.1)`;
            ctx.beginPath(); ctx.moveTo(x[i], y[i]); ctx.lineTo(x[j], y[j]); ctx.stroke();
        }
        for (let i = 0; i < N; i++) {
            ctx.fillStyle = rgba(pal[comm[i]], 0.95);
            ctx.beginPath(); ctx.arc(x[i], y[i], 3 + deg[i] * 0.25, 0, TAU); ctx.fill();
        }
    });
};

/* -------------------------------------------------------------------- QUANT
   Monte Carlo geometric Brownian motion:  d ln S = (mu - sigma^2/2) dt + sigma dW.
   Paths are drawn on a log axis with the +-1 sigma band; cursor height sets sigma. */
SIMS.quant = (c) => {
    const ctx = c.getContext("2d");
    const P = 70, NS = 240, MU = 0.05, STEPS_PER_S = 70;
    const lnS = new Float32Array(P * (NS + 1));
    let W = 0, H = 0, k = 0, acc = 0, hold = 0, sigma = 0.35, frame = 0;

    KW.fit(c, (w, h, dpr) => { W = w; H = h; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); });
    KW.loop(c, (t, dt) => {
        const p = KW.local(c);
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

        const x0 = W * 0.04, x1 = W * 0.97, mid = H * 0.5, sc = H * 0.2, a = KW.col.a;
        const px = (j) => x0 + ((x1 - x0) * j) / NS, py = (v) => mid - v * sc;
        ctx.clearRect(0, 0, W, H);
        ctx.strokeStyle = rgba(a, 0.22); ctx.lineWidth = 1;
        for (let i = 0; i < P; i++) {
            ctx.beginPath();
            for (let j = 0; j <= k; j++) { const o = lnS[i * (NS + 1) + j]; j ? ctx.lineTo(px(j), py(o)) : ctx.moveTo(px(j), py(o)); }
            ctx.stroke();
        }
        ctx.setLineDash([6, 5]); ctx.strokeStyle = rgba(a, 0.85); ctx.lineWidth = 1.4;
        for (const sgn of [1, -1]) {
            ctx.beginPath();
            for (let j = 0; j <= NS; j++) {
                const tt = j / NS, v = (MU - 0.5 * sigma * sigma) * tt + sgn * sigma * Math.sqrt(tt);
                j ? ctx.lineTo(px(j), py(v)) : ctx.moveTo(px(j), py(v));
            }
            ctx.stroke();
        }
        ctx.setLineDash([]); ctx.strokeStyle = rgba(a, 0.4);
        ctx.beginPath(); ctx.moveTo(x0, mid); ctx.lineTo(x1, mid); ctx.stroke();
        if (++frame % 12 === 0) KW.tag(`Geometric Brownian motion · ${P} paths · σ = ${sigma.toFixed(2)} (cursor height sets σ)`);
    });
};

/* ----------------------------------------------------------------------- CS
   Elementary cellular automaton (Rule 110 is Turing-complete). Rows scroll upward; the
   newest row is at the bottom. Hover perturbs the newest row; click cycles the rule. */
SIMS.cs = (c) => {
    const ctx = c.getContext("2d"), off = document.createElement("canvas"), octx = off.getContext("2d");
    const CELL = 5, RULES = [110, 30, 90, 54], ROWS_PER_S = 28;
    let cols = 0, rows = 0, grid, head = 0, img, W = 0, H = 0, acc = 0, ri = 0;

    const next = () => {
        const prev = head * cols, nh = (head + 1) % rows, cur = nh * cols, rule = RULES[ri];
        for (let i = 0; i < cols; i++) {
            const idx = (grid[prev + ((i - 1 + cols) % cols)] << 2) | (grid[prev + i] << 1) | grid[prev + ((i + 1) % cols)];
            grid[cur + i] = (rule >> idx) & 1;
        }
        head = nh;
    };
    const tag = () => KW.tag(`Elementary cellular automaton · Rule ${RULES[ri]} · click to cycle the rule`);

    KW.fit(c, (w, h, dpr) => {
        W = w; H = h; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        cols = Math.ceil(W / CELL); rows = Math.ceil(H / CELL);
        off.width = cols; off.height = rows; img = octx.createImageData(cols, rows);
        grid = new Uint8Array(cols * rows); head = 0;
        for (let i = 0; i < cols; i++) grid[i] = Math.random() < 0.5 ? 1 : 0;
        for (let r = 1; r < rows; r++) next();
    });
    addEventListener("click", (e) => { if (!e.target.closest("a,button")) { ri = (ri + 1) % RULES.length; tag(); } });
    tag();
    KW.loop(c, (t, dt) => {
        acc += dt * ROWS_PER_S;
        const p = KW.local(c);
        while (acc >= 1) {
            next(); acc -= 1;
            if (p.x > 0 && p.x < W && p.y > 0 && p.y < H) {
                const ci = Math.floor(p.x / CELL);
                for (let d = -2; d <= 2; d++) if (Math.random() < 0.5) grid[head * cols + ((ci + d + cols) % cols)] ^= 1;
            }
        }
        const a = KW.col.a, d = img.data;
        for (let yy = 0; yy < rows; yy++) {
            const src = ((head + 1 + yy) % rows) * cols, al = 40 + 170 * (yy / rows);
            for (let xx = 0; xx < cols; xx++) {
                const o = (yy * cols + xx) * 4, on = grid[src + xx];
                d[o] = a[0]; d[o + 1] = a[1]; d[o + 2] = a[2]; d[o + 3] = on ? al : 0;
            }
        }
        octx.putImageData(img, 0, 0);
        ctx.clearRect(0, 0, W, H);
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(off, 0, 0, cols, rows, 0, 0, cols * CELL, rows * CELL);
    });
};

/* ---------------------------------------------------------------- THREE.JS */
const three = (c, shift) => {
    const renderer = new THREE.WebGLRenderer({ canvas: c, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
    const scene = new THREE.Scene(), cam = new THREE.PerspectiveCamera(45, 1, 0.1, 400);
    const group = new THREE.Group();
    scene.add(group);
    let W = 0;
    KW.fit(c, (w, h) => { W = w; renderer.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix(); group.position.x = w > 900 ? shift : 0; });
    const setColor = (mat, rgb) => mat.color.setRGB(rgb[0] / 255, rgb[1] / 255, rgb[2] / 255);
    return { renderer, scene, cam, group, setColor, width: () => W };
};

/* ---------------------------------------------------------------------- MATH
   Band with t half-twists: r(u,v) = ((R+v cos a) cos u, (R+v cos a) sin u, v sin a), a = t u / 2.
   t sweeps (0,2); the seam closes at integer t (t=1 is the Möbius band). */
SIMS.math = (c) => {
    const R = 2, WD = 0.85, U = 180, V = 16, vi = (i, j) => i * (V + 1) + j;
    const T = three(c, 1.9);
    T.cam.position.set(0, 0, 9.5); T.group.rotation.x = 0.9;
    const pos = new Float32Array((U + 1) * (V + 1) * 3), idx = [];
    for (let j = 0; j <= V; j++) for (let i = 0; i < U; i++) idx.push(vi(i, j), vi(i + 1, j));
    for (let i = 0; i <= U; i += 4) for (let j = 0; j < V; j++) idx.push(vi(i, j), vi(i, j + 1));
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3)); geo.setIndex(idx);
    const lm = new THREE.LineBasicMaterial({ transparent: true, opacity: 0.6 });
    const pm = new THREE.PointsMaterial({ size: 0.035, transparent: true, opacity: 0.9 });
    const ls = new THREE.LineSegments(geo, lm); ls.frustumCulled = false;
    const pt = new THREE.Points(geo, pm); pt.frustumCulled = false;
    T.group.add(ls, pt);
    const paint = () => { T.setColor(lm, KW.col.a); T.setColor(pm, KW.col.a); };
    paint(); addEventListener("themechange", paint);

    let rx = 0, ry = 0, f = 0;
    KW.loop(c, (t, dt) => {
        const tw = 1 + 0.99 * Math.sin(t * 0.35);
        for (let i = 0; i <= U; i++) {
            const u = (i / U) * TAU, al = (tw * u) / 2, ca = Math.cos(al), sa = Math.sin(al);
            for (let j = 0; j <= V; j++) {
                const v = ((j / V) * 2 - 1) * WD, rc = R + v * ca, o = vi(i, j) * 3;
                pos[o] = rc * Math.cos(u); pos[o + 1] = rc * Math.sin(u); pos[o + 2] = v * sa;
            }
        }
        geo.attributes.position.needsUpdate = true;
        const p = KW.local(c), inside = p.x > 0 && p.y > 0 && p.x < T.width();
        const mx = inside ? (p.x / T.width()) * 2 - 1 : 0, my = inside ? (p.y / c.clientHeight) * 2 - 1 : 0;
        rx += (0.9 + my * 0.5 + scrollY * 0.0006 - rx) * 0.05;
        ry += dt * 0.15 + (mx * 0.02);
        T.group.rotation.x = rx; T.group.rotation.y = ry;
        T.renderer.render(T.scene, T.cam);
        if (++f % 6 === 0) KW.tag(`Band with t half-twists · t = ${tw.toFixed(2)}${Math.abs(tw - 1) < 0.05 ? " · Möbius (non-orientable)" : ""} · move the cursor to rotate`);
    });
};

/* ----------------------------------------------------------------------- HUB
   Lorenz system, RK4. Five trajectories (one per domain colour) start 1e-3 apart in x and
   separate visibly: sensitive dependence on initial conditions. */
SIMS.hub = (c) => {
    const SIG = 10, RHO = 28, BETA = 8 / 3, DT = 0.005, SUB = 6, LEN = 1600, NT = 5;
    const T = three(c, 16);
    T.cam.position.set(0, 0, 85);
    const f = (s) => [SIG * (s[1] - s[0]), s[0] * (RHO - s[2]) - s[1], s[0] * s[1] - BETA * s[2]];
    const rk4 = (s) => {
        const add = (a, b, h) => a.map((v, i) => v + b[i] * h);
        const k1 = f(s), k2 = f(add(s, k1, DT / 2)), k3 = f(add(s, k2, DT / 2)), k4 = f(add(s, k3, DT));
        return s.map((v, i) => v + (DT / 6) * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]));
    };
    const tr = Array.from({ length: NT }, (_, n) => {
        const state = [1 + n * 1e-3, 1, 1], buf = new Float32Array(LEN * 3);
        const place = (s, o) => { buf[o] = s[0]; buf[o + 1] = s[2] - 25; buf[o + 2] = s[1]; };
        for (let i = 0; i < LEN; i++) place(state, i * 3);
        const geo = new THREE.BufferGeometry();
        geo.setAttribute("position", new THREE.BufferAttribute(buf, 3));
        const lm = new THREE.LineBasicMaterial({ transparent: true, opacity: 0.85 });
        const line = new THREE.Line(geo, lm); line.frustumCulled = false;
        const head = new THREE.Mesh(new THREE.SphereGeometry(0.7, 12, 12), new THREE.MeshBasicMaterial()); head.frustumCulled = false;
        T.group.add(line, head);
        return { state, buf, geo, lm, head, place };
    });
    const paint = () => tr.forEach((q, n) => { T.setColor(q.lm, KW.col.pal[n]); T.setColor(q.head.material, KW.col.pal[n]); });
    paint(); addEventListener("themechange", paint);
    KW.tag("Lorenz system · σ=10, ρ=28, β=8/3 · RK4 · 5 trajectories, initial separation 10⁻³");

    let rx = 0.15, ry = 0;
    KW.loop(c, (t, dt) => {
        for (const q of tr) {
            q.buf.copyWithin(0, SUB * 3);
            for (let s = 0; s < SUB; s++) { q.state = rk4(q.state); q.place(q.state, (LEN - SUB + s) * 3); }
            q.geo.attributes.position.needsUpdate = true;
            q.head.position.set(q.buf[(LEN - 1) * 3], q.buf[(LEN - 1) * 3 + 1], q.buf[(LEN - 1) * 3 + 2]);
        }
        const p = KW.local(c), inside = p.x > 0 && p.y > 0 && p.x < T.width();
        const mx = inside ? (p.x / T.width()) * 2 - 1 : 0, my = inside ? (p.y / c.clientHeight) * 2 - 1 : 0;
        rx += (0.15 + my * 0.3 - rx) * 0.05;
        ry += dt * 0.12 + mx * 0.01;
        T.group.rotation.x = rx; T.group.rotation.y = ry;
        T.renderer.render(T.scene, T.cam);
    });
};
