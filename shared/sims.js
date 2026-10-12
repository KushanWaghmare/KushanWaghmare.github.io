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
    KW.tag(SITE.domains.physics.tag, c);
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

/* ---------------------------------------------------------------- THREE.JS */
const three = (c, shift) => {
    const renderer = new THREE.WebGLRenderer({ canvas: c, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
    c.__dispose = () => renderer.dispose();
    const scene = new THREE.Scene(), cam = new THREE.PerspectiveCamera(45, 1, 0.1, 400);
    const group = new THREE.Group();
    scene.add(group);
    let W = 0;
    KW.fit(c, (w, h) => { W = w; renderer.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix(); group.position.x = w > 900 ? shift : 0; });
    const setColor = (mat, rgb) => { if (rgb && rgb.length >= 3) mat.color.setRGB(rgb[0] / 255, rgb[1] / 255, rgb[2] / 255); };
    return { renderer, scene, cam, group, setColor, width: () => W };
};

/* ------------------------------------------------------------- DATA SCIENCE
   Non-convex loss landscape with Langevin SGD particle swarm optimisation:
   θ_{t+1} = θ_t + v_t,   v_{t+1} = β v_t - η ∇L(θ_t) + σ ξ_t
   Topological manifold with non-convex valleys, saddle points and dynamic regularisation.
   The cursor perturbs local curvature; clicking reseeds the optimiser particle swarm. */
SIMS.datascience = (c) => {
    const T = three(c, 11);
    T.cam.position.set(0, 22, 34);
    T.cam.lookAt(0, -2, 0);

    const GW = 52, GH = 52, SPAN = 32;
    const pos = new Float32Array((GW + 1) * (GH + 1) * 3);
    const idx = [];
    const vi = (i, j) => i * (GH + 1) + j;
    for (let i = 0; i < GW; i++) {
        for (let j = 0; j < GH; j++) {
            idx.push(vi(i, j), vi(i + 1, j), vi(i, j), vi(i, j + 1));
        }
    }
    for (let i = 0; i < GW; i++) idx.push(vi(i, GH), vi(i + 1, GH));
    for (let j = 0; j < GH; j++) idx.push(vi(GW, j), vi(GW, j + 1));

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setIndex(idx);

    const lm = new THREE.LineBasicMaterial({ transparent: true, opacity: 0.35 });
    const mesh = new THREE.LineSegments(geo, lm);
    mesh.frustumCulled = false;
    T.group.add(mesh);

    const loss = (x, z, t, mx, mz) => {
        const r2 = x * x + z * z;
        let y = 0.018 * r2 - 2.8 * (Math.cos(x * 0.42 + t * 0.32) * Math.cos(z * 0.42) + 0.55 * Math.sin(x * 0.24) * Math.sin(z * 0.24 + t * 0.22));
        if (mx !== undefined && mz !== undefined) {
            const dx = x - mx, dz = z - mz;
            y -= 3.4 / (1 + 0.3 * (dx * dx + dz * dz));
        }
        return y;
    };

    const NP = 48, TL = 12;
    const px = new Float32Array(NP), pz = new Float32Array(NP);
    const vx = new Float32Array(NP), vz = new Float32Array(NP);
    const trails = new Float32Array(NP * TL * 3);
    const lr = new Float32Array(NP);

    const reseed = (i) => {
        const rad = 7 + Math.random() * 8, ang = Math.random() * TAU;
        px[i] = Math.cos(ang) * rad;
        pz[i] = Math.sin(ang) * rad;
        vx[i] = (Math.random() - 0.5) * 0.15;
        vz[i] = (Math.random() - 0.5) * 0.15;
        lr[i] = 0.12 + Math.random() * 0.18;
        const o = i * TL * 3, y = loss(px[i], pz[i], 0);
        for (let k = 0; k < TL; k++) {
            trails[o + k * 3] = px[i];
            trails[o + k * 3 + 1] = y;
            trails[o + k * 3 + 2] = pz[i];
        }
    };
    for (let i = 0; i < NP; i++) reseed(i);

    const trailGeo = new THREE.BufferGeometry();
    trailGeo.setAttribute("position", new THREE.BufferAttribute(trails, 3));
    const tIdx = [];
    for (let i = 0; i < NP; i++) {
        for (let k = 0; k < TL - 1; k++) tIdx.push(i * TL + k, i * TL + k + 1);
    }
    trailGeo.setIndex(tIdx);
    const tm = new THREE.LineBasicMaterial({ transparent: true, opacity: 0.85 });
    const trailMesh = new THREE.LineSegments(trailGeo, tm);
    trailMesh.frustumCulled = false;
    T.group.add(trailMesh);

    const headPos = new Float32Array(NP * 3);
    const headGeo = new THREE.BufferGeometry();
    headGeo.setAttribute("position", new THREE.BufferAttribute(headPos, 3));
    const pm = new THREE.PointsMaterial({ size: 0.22, transparent: true, opacity: 0.95 });
    const headPoints = new THREE.Points(headGeo, pm);
    headPoints.frustumCulled = false;
    T.group.add(headPoints);

    const paint = () => {
        T.setColor(lm, KW.col.a);
        T.setColor(tm, KW.col.a);
        T.setColor(pm, KW.col.a);
    };
    paint();
    addEventListener("themechange", paint);
    addEventListener("click", (e) => {
        if (!e.target.closest("a,button")) {
            for (let i = 0; i < NP; i++) reseed(i);
        }
    });

    KW.tag(SITE.domains.datascience.tag, c);

    let rx = 0.58, ry = 0;
    KW.loop(c, (t, dt) => {
        const p = KW.local(c), inside = p.x > 0 && p.y > 0 && p.x < T.width();
        const mx = inside ? (p.x / T.width() - 0.5) * 22 : undefined;
        const mz = inside ? (p.y / c.clientHeight - 0.5) * 22 : undefined;

        let o = 0;
        for (let i = 0; i <= GW; i++) {
            const x = (i / GW - 0.5) * SPAN;
            for (let j = 0; j <= GH; j++) {
                const z = (j / GH - 0.5) * SPAN;
                pos[o] = x;
                pos[o + 1] = loss(x, z, t, mx, mz);
                pos[o + 2] = z;
                o += 3;
            }
        }
        geo.attributes.position.needsUpdate = true;

        const eps = 0.1;
        for (let i = 0; i < NP; i++) {
            const x = px[i], z = pz[i];
            const y = loss(x, z, t, mx, mz);
            const gx = (loss(x + eps, z, t, mx, mz) - loss(x - eps, z, t, mx, mz)) / (2 * eps);
            const gz = (loss(x, z + eps, t, mx, mz) - loss(x, z - eps, t, mx, mz)) / (2 * eps);

            vx[i] = vx[i] * 0.86 - gx * lr[i] + randn() * 0.04;
            vz[i] = vz[i] * 0.86 - gz * lr[i] + randn() * 0.04;
            px[i] += vx[i];
            pz[i] += vz[i];

            if (Math.abs(px[i]) > SPAN * 0.48 || Math.abs(pz[i]) > SPAN * 0.48 || Math.hypot(vx[i], vz[i]) < 0.004) {
                reseed(i);
            }

            const to = i * TL * 3;
            trails.copyWithin(to, to + 3, to + TL * 3);
            const last = to + (TL - 1) * 3;
            trails[last] = px[i];
            trails[last + 1] = y + 0.16;
            trails[last + 2] = pz[i];

            headPos[i * 3] = px[i];
            headPos[i * 3 + 1] = y + 0.22;
            headPos[i * 3 + 2] = pz[i];
        }
        trailGeo.attributes.position.needsUpdate = true;
        headGeo.attributes.position.needsUpdate = true;

        const curX = inside ? (p.x / T.width()) * 2 - 1 : 0;
        const curY = inside ? (p.y / c.clientHeight) * 2 - 1 : 0;
        rx += (0.58 + curY * 0.22 - rx) * 0.05;
        ry += dt * 0.12 + (curX * 0.015);
        T.group.rotation.x = rx;
        T.group.rotation.y = ry;

        T.renderer.render(T.scene, T.cam);
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
        if (++frame % 12 === 0) KW.tag(`Geometric Brownian motion · ${P} paths · σ = ${sigma.toFixed(2)} (cursor height sets σ)`, c);
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
    const tag = () => KW.tag(`Elementary cellular automaton · Rule ${RULES[ri]} · click to cycle the rule`, c);

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
        if (++f % 6 === 0) KW.tag(`Band with t half-twists · t = ${tw.toFixed(2)}${Math.abs(tw - 1) < 0.05 ? " · Möbius (non-orientable)" : ""} · move the cursor to rotate`, c);
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
    KW.tag("Lorenz system · σ=10, ρ=28, β=8/3 · RK4 · 5 domain trajectories, initial separation 10⁻³", c);

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

/* ------------------------------------------------------------------ CONTACT
   Interactive Three.js 3D node-based network graph + pulsing 3D sonar wave
   that spans the full viewport, anchors its geodesic core on the right, and reacts to the cursor. */
SIMS.contact = (c) => {
    const T = three(c, 10);
    T.cam.position.set(0, 10, 34);
    T.cam.lookAt(0, 0, 0);
    KW.tag("3D relational network & cursor-reactive sonar wave · G(V,E) spatial graph", c);

    // 70 nodes in a right-focused geodesic sphere + 50 wide-field constellation nodes across the viewport
    const N_CORE = 70, N_WIDE = 50, N = N_CORE + N_WIDE;
    const pts = new Float32Array(N * 3), base = new Float32Array(N * 3), cols = new Float32Array(N * 3), ph = new Float32Array(N);
    for (let i = 0; i < N; i++) {
        if (i < N_CORE) {
            const u = Math.random() * TAU, v = Math.acos(2 * Math.random() - 1), r = 11.5 * (0.55 + 0.45 * Math.cbrt(Math.random()));
            base[i * 3] = r * Math.sin(v) * Math.cos(u);
            base[i * 3 + 1] = r * Math.sin(v) * Math.sin(u) * 0.78;
            base[i * 3 + 2] = r * Math.cos(v);
        } else {
            base[i * 3] = -34 + Math.random() * 52;
            base[i * 3 + 1] = (Math.random() - 0.5) * 28;
            base[i * 3 + 2] = (Math.random() - 0.5) * 18;
        }
        pts[i * 3] = base[i * 3]; pts[i * 3 + 1] = base[i * 3 + 1]; pts[i * 3 + 2] = base[i * 3 + 2];
        ph[i] = Math.random() * TAU;
    }

    const edges = [];
    for (let i = 0; i < N; i++) {
        for (let j = i + 1; j < N; j++) {
            const dx = base[i * 3] - base[j * 3], dy = base[i * 3 + 1] - base[j * 3 + 1], dz = base[i * 3 + 2] - base[j * 3 + 2];
            const lim = (i < N_CORE && j < N_CORE) ? 54 : 115;
            if (dx * dx + dy * dy + dz * dz < lim) edges.push(i, j);
        }
    }

    const pGeo = new THREE.BufferGeometry();
    pGeo.setAttribute("position", new THREE.BufferAttribute(pts, 3));
    pGeo.setAttribute("color", new THREE.BufferAttribute(cols, 3));
    const pMat = new THREE.PointsMaterial({ size: 0.72, vertexColors: true, transparent: true, opacity: 0.96 });
    T.group.add(new THREE.Points(pGeo, pMat));

    const lPos = new Float32Array(edges.length * 3);
    const lGeo = new THREE.BufferGeometry();
    lGeo.setAttribute("position", new THREE.BufferAttribute(lPos, 3));
    const lMat = new THREE.LineBasicMaterial({ transparent: true, opacity: 0.42 });
    T.group.add(new THREE.LineSegments(lGeo, lMat));

    // Travelling signal packets along graph edges
    const NPULSE = 36;
    const sPos = new Float32Array(NPULSE * 3);
    const sEdges = Array.from({ length: NPULSE }, () => ({
        e: ((Math.random() * (edges.length / 2)) | 0) * 2,
        p: Math.random(),
        spd: 0.6 + Math.random() * 1.1
    }));
    const sGeo = new THREE.BufferGeometry();
    sGeo.setAttribute("position", new THREE.BufferAttribute(sPos, 3));
    const sMat = new THREE.PointsMaterial({ size: 1.05, transparent: true, opacity: 1 });
    T.group.add(new THREE.Points(sGeo, sMat));

    // 5 concentric 3D sonar wave rings
    const rings = Array.from({ length: 5 }, () => {
        const g = new THREE.RingGeometry(0.92, 1.0, 72);
        g.rotateX(-Math.PI / 2);
        const m = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, transparent: true, opacity: 0.55 });
        const mesh = new THREE.Mesh(g, m);
        T.group.add(mesh);
        return { mesh, m };
    });

    const sync = () => {
        const gold = KW.col.light ? [217, 119, 6] : [255, 149, 0];
        const cyan = KW.col.light ? [6, 140, 172] : [34, 211, 238];
        for (let i = 0; i < N; i++) {
            const c = i % 4 === 0 ? cyan : gold;
            cols[i * 3] = c[0] / 255; cols[i * 3 + 1] = c[1] / 255; cols[i * 3 + 2] = c[2] / 255;
        }
        pGeo.attributes.color.needsUpdate = true;
        T.setColor(lMat, gold);
        T.setColor(sMat, cyan);
        rings.forEach((r, idx) => T.setColor(r.m, idx % 2 === 0 ? gold : cyan));
    };
    sync(); addEventListener("themechange", sync);

    let rx = 0.22, ry = 0;
    KW.loop(c, (t, dt) => {
        const w = T.width() || 1, h = c.clientHeight || 1, p = KW.local(c);
        const on = p.x > 0 && p.x < w && p.y > 0 && p.y < h;
        const mx = on ? (p.x / w - 0.5) * 2 : Math.sin(t * 0.4) * 0.25;
        const my = on ? (p.y / h - 0.5) * 2 : Math.cos(t * 0.3) * 0.2;

        for (let i = 0; i < N; i++) {
            const s = 1 + 0.1 * Math.sin(t * 1.9 + ph[i]);
            const pull = i < N_CORE ? 2.8 : 1.4;
            pts[i * 3] = base[i * 3] * s + mx * pull;
            pts[i * 3 + 1] = base[i * 3 + 1] * s + Math.cos(t * 1.5 + ph[i]) * 0.75 - my * pull;
            pts[i * 3 + 2] = base[i * 3 + 2] * s + Math.sin(t * 1.2 + ph[i]) * 0.5;
        }
        pGeo.attributes.position.needsUpdate = true;

        for (let k = 0; k < edges.length; k++) {
            const idx = edges[k] * 3;
            lPos[k * 3] = pts[idx]; lPos[k * 3 + 1] = pts[idx + 1]; lPos[k * 3 + 2] = pts[idx + 2];
        }
        lGeo.attributes.position.needsUpdate = true;

        for (let i = 0; i < NPULSE; i++) {
            const sp = sEdges[i];
            sp.p += dt * sp.spd;
            if (sp.p >= 1) {
                sp.p = 0;
                sp.e = ((Math.random() * (edges.length / 2)) | 0) * 2;
            }
            const u = edges[sp.e] * 3, v = edges[sp.e + 1] * 3;
            sPos[i * 3] = pts[u] + (pts[v] - pts[u]) * sp.p;
            sPos[i * 3 + 1] = pts[u + 1] + (pts[v + 1] - pts[u + 1]) * sp.p;
            sPos[i * 3 + 2] = pts[u + 2] + (pts[v + 2] - pts[u + 2]) * sp.p;
        }
        sGeo.attributes.position.needsUpdate = true;

        rings.forEach((r, i) => {
            const f = (t * 0.42 + i / rings.length) % 1, sc = 1.2 + f * 22;
            r.mesh.scale.set(sc, 1, sc);
            r.mesh.position.set(mx * 3.5, Math.sin(t * 2 + i) * 0.8 - my * 2, 0);
            r.m.opacity = (1 - f) * 0.58;
        });

        rx += (0.26 + my * 0.32 - rx) * 0.06;
        ry += dt * 0.22 + mx * 0.015;
        T.group.rotation.x = rx; T.group.rotation.y = ry;
        T.renderer.render(T.scene, T.cam);
    });
};

/* ------------------------------------------------------------ LIVE HEADER
   A thin strip in the navbar across all pages. One micro-animation per domain;
   the strip follows <html data-domain>, morphing smoothly as sections change. */
const NAV = {};
const navFade = (ctx, w, h, left) => { // feather the strip's edges into the glass navbar
    ctx.save();
    ctx.globalCompositeOperation = "destination-in";
    const g = ctx.createLinearGradient(0, 0, w, 0);
    g.addColorStop(0, left ? "rgba(0,0,0,0)" : "#000"); g.addColorStop(0.07, "#000");
    g.addColorStop(0.93, "#000"); g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    ctx.restore();
};

// Intro / Contact: subtle drifting phase-space particles with faint connecting filaments.
NAV.hub = () => {
    const P = Array.from({ length: 28 }, () => ({
        u: Math.random(), v: 0.18 + Math.random() * 0.64,
        vx: (0.015 + Math.random() * 0.035) * (Math.random() < 0.5 ? 1 : -1),
        ph: Math.random() * TAU, r: 1.2 + Math.random() * 1.3
    }));
    return (ctx, w, h, t, dt) => {
        const a = KW.col.a;
        for (const p of P) { p.u = (p.u + p.vx * dt + 1) % 1; }
        ctx.lineWidth = 0.9; ctx.strokeStyle = rgba(a, 0.18); ctx.beginPath();
        for (let i = 0; i < P.length; i++) {
            const x1 = P[i].u * w, y1 = (P[i].v + 0.12 * Math.sin(t * 1.4 + P[i].ph)) * h;
            for (let j = i + 1; j < P.length; j++) {
                const x2 = P[j].u * w, y2 = (P[j].v + 0.12 * Math.sin(t * 1.4 + P[j].ph)) * h;
                if (Math.abs(x1 - x2) < 54 && Math.abs(y1 - y2) < 22) { ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); }
            }
        }
        ctx.stroke();
        for (const p of P) {
            const x = p.u * w, y = (p.v + 0.12 * Math.sin(t * 1.4 + p.ph)) * h;
            ctx.fillStyle = rgba(a, 0.45 + 0.45 * Math.sin(t * 2 + p.ph));
            ctx.beginPath(); ctx.arc(x, y, p.r, 0, TAU); ctx.fill();
        }
    };
};
NAV.contact = NAV.hub;

// Mathematics: sin and cos sliding past each other, with a probe joining them (phase gap π/2).
NAV.math = () => (ctx, w, h, t) => {
    const a = KW.col.a, b = KW.col.pal[1], mid = h / 2, A = h * 0.36, k = TAU / Math.max(w / 3, 120), ph = t * 2.2;
    ctx.lineWidth = 1; ctx.strokeStyle = rgba(a, 0.15);
    ctx.beginPath(); ctx.moveTo(0, mid); ctx.lineTo(w, mid); ctx.stroke();
    const wave = (f, col) => {
        ctx.strokeStyle = col; ctx.lineWidth = 1.6; ctx.beginPath();
        for (let x = 0; x <= w; x += 2) { const y = mid - A * f(k * x - ph); x ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
        ctx.stroke();
    };
    wave(Math.cos, rgba(b, 0.85));
    wave(Math.sin, rgba(a, 0.95));
    const px = (t * 70) % w, ys = mid - A * Math.sin(k * px - ph), yc = mid - A * Math.cos(k * px - ph);
    ctx.strokeStyle = rgba(a, 0.4); ctx.beginPath(); ctx.moveTo(px, ys); ctx.lineTo(px, yc); ctx.stroke();
    ctx.fillStyle = rgba(a, 1); ctx.beginPath(); ctx.arc(px, ys, 2.4, 0, TAU); ctx.fill();
    ctx.fillStyle = rgba(b, 1); ctx.beginPath(); ctx.arc(px, yc, 2.4, 0, TAU); ctx.fill();
};

// Physics: plane EM wave travelling +x. E oscillates vertically, B along the depth axis
// (oblique projection), in phase and perpendicular to each other and to propagation.
NAV.physics = () => (ctx, w, h, t) => {
    const a = KW.col.a, b = KW.col.pal[4], mid = h / 2, A = h * 0.4, k = TAU / Math.max(w / 2.5, 140), ph = t * 3;
    const ZX = 0.6, ZY = 0.32; // screen direction of the depth (z) axis
    const field = (col, dx, dy) => {
        ctx.strokeStyle = rgba(col, 0.3); ctx.lineWidth = 1; ctx.beginPath();
        for (let x = 0; x <= w; x += 6) { const v = Math.sin(k * x - ph); ctx.moveTo(x, mid); ctx.lineTo(x + v * dx, mid + v * dy); }
        ctx.stroke();
        ctx.strokeStyle = rgba(col, 0.9); ctx.lineWidth = 1.5; ctx.beginPath();
        for (let x = 0; x <= w; x += 2) { const v = Math.sin(k * x - ph), X = x + v * dx, Y = mid + v * dy; x ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y); }
        ctx.stroke();
    };
    field(b, A * 0.8 * ZX, A * 0.8 * ZY); // B (behind)
    ctx.strokeStyle = rgba(a, 0.35); ctx.lineWidth = 1; // propagation axis + arrowhead
    ctx.beginPath(); ctx.moveTo(0, mid); ctx.lineTo(w - 2, mid); ctx.moveTo(w - 8, mid - 3); ctx.lineTo(w - 2, mid); ctx.lineTo(w - 8, mid + 3); ctx.stroke();
    field(a, 0, -A); // E
};

// Data science: a feed-forward net; activations travel layer to layer and light up nodes.
NAV.datascience = () => {
    let W = 0, layers = [], pulses = [], spawn = 0;
    const pick = (l) => l[(Math.random() * l.length) | 0];
    const build = (w, h) => {
        W = w; pulses = [];
        const L = Math.max(4, Math.floor(w / 70));
        layers = Array.from({ length: L }, (_, l) => {
            const n = 2 + (l % 3), x = 8 + (l * (w - 16)) / (L - 1);
            return Array.from({ length: n }, (_, i) => ({ x, y: (h * (i + 1)) / (n + 1), act: 0 }));
        });
    };
    return (ctx, w, h, t, dt) => {
        if (w !== W) build(w, h);
        const a = KW.col.a, b = KW.col.pal[1];
        ctx.lineWidth = 1; ctx.strokeStyle = rgba(a, 0.09); ctx.beginPath();
        for (let l = 0; l < layers.length - 1; l++) for (const u of layers[l]) for (const v of layers[l + 1]) { ctx.moveTo(u.x, u.y); ctx.lineTo(v.x, v.y); }
        ctx.stroke();
        if ((spawn -= dt) <= 0 && pulses.length < 90) { spawn = 0.12; pulses.push({ l: 0, u: pick(layers[0]), v: pick(layers[1]), p: 0 }); }
        for (const q of pulses) {
            q.p += dt * 2.2;
            if (q.p >= 1) {
                q.v.act = 1;
                if (q.l + 2 < layers.length && Math.random() < 0.85) { q.l++; q.u = q.v; q.v = pick(layers[q.l + 1]); q.p = 0; } else q.dead = true;
            }
        }
        pulses = pulses.filter((q) => !q.dead);
        ctx.strokeStyle = rgba(b, 0.9); ctx.lineWidth = 1.4; ctx.beginPath();
        for (const q of pulses) {
            const p0 = Math.max(0, q.p - 0.18);
            ctx.moveTo(q.u.x + (q.v.x - q.u.x) * p0, q.u.y + (q.v.y - q.u.y) * p0);
            ctx.lineTo(q.u.x + (q.v.x - q.u.x) * q.p, q.u.y + (q.v.y - q.u.y) * q.p);
        }
        ctx.stroke();
        for (const l of layers) for (const n of l) {
            n.act *= Math.exp(-dt * 3);
            ctx.fillStyle = rgba(a, 0.3 + 0.7 * n.act);
            ctx.beginPath(); ctx.arc(n.x, n.y, 2 + n.act * 2, 0, TAU); ctx.fill();
            if (n.act > 0.2) { ctx.strokeStyle = rgba(a, n.act * 0.5); ctx.beginPath(); ctx.arc(n.x, n.y, 4 + (1 - n.act) * 6, 0, TAU); ctx.stroke(); }
        }
    };
};

// Quant: a geometric Brownian motion path generated live (plotted in log-price, auto-ranged).
NAV.quant = () => {
    const STEP = 3, RATE = 45, MU = 0.05, SIG = 0.9, H = 1 / RATE;
    const pts = []; let X = 0, acc = 0, lo = 0, hi = 0, init = false;
    const next = () => (X += (MU - (SIG * SIG) / 2) * H + SIG * Math.sqrt(H) * randn());
    return (ctx, w, h, t, dt) => {
        const n = Math.ceil(w / STEP) + 2;
        if (!init) { for (let i = 0; i < n; i++) pts.push(next()); init = true; }
        acc += dt * RATE;
        while (acc >= 1) { acc--; pts.push(next()); }
        while (pts.length > n) pts.shift();
        let mn = Infinity, mx = -Infinity;
        for (const v of pts) { if (v < mn) mn = v; if (v > mx) mx = v; }
        if (lo === hi) { lo = mn; hi = mx; }
        lo += (mn - lo) * 0.08; hi += (mx - hi) * 0.08;
        const span = Math.max(hi - lo, 1e-3), a = KW.col.a;
        const px = (i) => w - 8 - (pts.length - 1 - i + acc) * STEP, py = (v) => h - 4 - ((v - lo) / span) * (h - 8);
        const g = ctx.createLinearGradient(0, 0, 0, h);
        g.addColorStop(0, rgba(a, 0.28)); g.addColorStop(1, rgba(a, 0));
        ctx.beginPath(); ctx.moveTo(px(0), h);
        pts.forEach((v, i) => ctx.lineTo(px(i), py(v)));
        ctx.lineTo(px(pts.length - 1), h); ctx.closePath(); ctx.fillStyle = g; ctx.fill();
        ctx.beginPath(); pts.forEach((v, i) => (i ? ctx.lineTo(px(i), py(v)) : ctx.moveTo(px(i), py(v))));
        ctx.strokeStyle = rgba(a, 0.95); ctx.lineWidth = 1.4; ctx.stroke();
        const lx = px(pts.length - 1), ly = py(pts[pts.length - 1]), f = (t * 1.5) % 1;
        ctx.fillStyle = rgba(a, 1); ctx.beginPath(); ctx.arc(lx, ly, 2.5, 0, TAU); ctx.fill();
        ctx.strokeStyle = rgba(a, 1 - f); ctx.beginPath(); ctx.arc(lx, ly, 2.5 + f * 6, 0, TAU); ctx.stroke();
    };
};

// Computer science: insertion sort stepping through a shuffled array, with a blinking prompt.
NAV.cs = () => {
    const LABEL = 64; let arr = [], gen = null, done = false, hold = 0, cmp = [-1, -1], steps = 0;
    function* isort(v) {
        for (let i = 1; i < v.length; i++) {
            let j = i;
            while (j > 0 && v[j - 1] > v[j]) { [v[j - 1], v[j]] = [v[j], v[j - 1]]; yield [j - 1, j]; j--; }
            yield [j, i];
        }
    }
    const shuffle = () => {
        for (let i = arr.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [arr[i], arr[j]] = [arr[j], arr[i]]; }
        gen = isort(arr); done = false; steps = 0;
    };
    return (ctx, w, h, t, dt) => {
        const n = Math.max(12, Math.floor((w - LABEL) / 5));
        if (n !== arr.length) { arr = Array.from({ length: n }, (_, i) => (i + 1) / n); shuffle(); }
        if (!done) {
            for (let k = Math.ceil(n * 6 * dt); k > 0; k--) {
                const r = gen.next();
                if (r.done) { done = true; hold = 1.4; cmp = [-1, -1]; break; }
                cmp = r.value; steps++;
            }
        } else if ((hold -= dt) <= 0) shuffle();
        const a = KW.col.a, muted = KW.col.light ? [80, 82, 95] : [150, 156, 172];
        ctx.font = '500 10px "JetBrains Mono", ui-monospace, monospace'; ctx.textBaseline = "middle";
        ctx.fillStyle = rgba(muted, 1); ctx.fillText(`$ isort${t % 1 < 0.5 ? "▊" : ""}`, 0, h / 2 - 6);
        ctx.fillStyle = rgba(a, 0.9); ctx.fillText(done ? "sorted ✓" : `#${String(steps).padStart(5, "0")}`, 0, h / 2 + 7);
        const bw = (w - LABEL) / n;
        for (let i = 0; i < n; i++) {
            const bh = arr[i] * (h - 6), hot = i === cmp[0] || i === cmp[1];
            ctx.fillStyle = rgba(a, hot ? 1 : done ? 0.8 : 0.3);
            ctx.fillRect(LABEL + i * bw, h - 3 - bh, Math.max(bw - 1, 1), bh);
        }
    };
};

SIMS.nav = (c) => {
    const ctx = c.getContext("2d"), inst = {};
    let W = 0, Hh = 0, cur = null, prev = null, mix = 1;
    KW.fit(c, (w, h, dpr) => { W = w; Hh = h; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); });
    KW.loop(c, (t, dt) => {
        ctx.clearRect(0, 0, W, Hh);
        if (W < 40) return;
        const d = document.documentElement.dataset.domain, k = NAV[d] ? d : "math";
        if (!cur) cur = k;
        else if (k !== cur) { prev = cur; cur = k; mix = 0; }
        if (mix < 1) {
            mix = Math.min(1, mix + dt * 3.2);
            if (prev) {
                ctx.save(); ctx.globalAlpha = 1 - mix;
                (inst[prev] || (inst[prev] = NAV[prev]()))(ctx, W, Hh, t, dt);
                ctx.restore();
            }
        }
        ctx.save(); ctx.globalAlpha = mix;
        (inst[cur] || (inst[cur] = NAV[cur]()))(ctx, W, Hh, t, dt);
        ctx.restore();
        navFade(ctx, W, Hh, cur !== "cs" && (mix >= 1 || prev !== "cs"));
    });
};
