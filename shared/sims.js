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
    const N = 160, G = 1, M = 8.5e6, EPS = 12, MOUSE_M = 1.2e6, TL = 24, H = 1 / 120, R_EH = 48;
    const x = new Float32Array(N), y = new Float32Array(N), vx = new Float32Array(N), vy = new Float32Array(N);
    const ax = new Float32Array(N), ay = new Float32Array(N), hist = new Float32Array(N * TL * 2);
    const m = new Float32Array(N).fill(1500);
    let W = 0, Hh = 0, cx = 0, cy = 0, ready = false, hp = 0, acc = 0;

    const spawn = (i, inward = false) => {
        const span = Math.max(180, Math.min(W, Hh) * 0.44);
        const u = inward ? 0.25 + Math.random() * 0.75 : Math.pow(Math.random(), 1.35);
        const r = R_EH + 8 + u * span, a = Math.random() * TAU;
        const vc = Math.sqrt((G * M * r * r) / Math.pow(r * r + EPS * EPS, 1.5)) * (0.96 + Math.random() * 0.07);
        const vr = -vc * (0.015 + Math.random() * 0.025); // slight relativistic inspiral toward the black hole
        x[i] = cx + r * Math.cos(a); y[i] = cy + r * Math.sin(a);
        vx[i] = -Math.sin(a) * vc + Math.cos(a) * vr;
        vy[i] = Math.cos(a) * vc + Math.sin(a) * vr;
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
        for (let i = 0; i < N; i++) { vx[i] = (vx[i] + ax[i] * H / 2) * 0.99985; vy[i] = (vy[i] + ay[i] * H / 2) * 0.99985; }
    };

    KW.fit(c, (w, h, dpr) => {
        W = w; Hh = h; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        const ncx = W * (W > 900 ? 0.68 : 0.5), ncy = Hh * 0.5;
        if (!ready) {
            cx = ncx; cy = ncy;
            for (let i = 0; i < N; i++) spawn(i, false);
            accel(-1e4, -1e4, false);
            ready = true;
        } else {
            const dcx = ncx - cx, dcy = ncy - cy;
            cx = ncx; cy = ncy;
            for (let i = 0; i < N; i++) {
                x[i] += dcx; y[i] += dcy;
                for (let k = 0; k < TL; k++) { hist[(i * TL + k) * 2] += dcx; hist[(i * TL + k) * 2 + 1] += dcy; }
            }
        }
    });
    KW.tag(SITE.domains.physics.tag, c);
    KW.loop(c, (t, dt) => {
        const p = KW.local(c), on = p.x > 0 && p.x < W && p.y > 0 && p.y < Hh;
        acc = Math.min(acc + dt, 0.1);
        while (acc >= H) { step(p.x, p.y, on); acc -= H; }
        const eh2 = R_EH * R_EH;
        for (let i = 0; i < N; i++) {
            const dx = x[i] - cx, dy = y[i] - cy, r2 = dx * dx + dy * dy;
            if (r2 < eh2 || Math.abs(dx) > W * 1.2 || Math.abs(dy) > Hh * 1.2) spawn(i, true);
        }
        hp = (hp + 1) % TL;
        for (let i = 0; i < N; i++) { hist[(i * TL + hp) * 2] = x[i]; hist[(i * TL + hp) * 2 + 1] = y[i]; }

        const a = KW.col.a;
        ctx.clearRect(0, 0, W, Hh);

        // 1. Gravitational lensing halo & back half of tilted accretion disc
        const halo = ctx.createRadialGradient(cx, cy, R_EH - 6, cx, cy, 185);
        halo.addColorStop(0, "rgba(0,0,0,0)");
        halo.addColorStop(0.22, rgba(a, 0.92));
        halo.addColorStop(0.42, rgba(a, 0.38));
        halo.addColorStop(0.72, rgba(a, 0.12));
        halo.addColorStop(1, rgba(a, 0));
        ctx.fillStyle = halo; ctx.beginPath(); ctx.arc(cx, cy, 185, 0, TAU); ctx.fill();

        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(-0.34);
        for (let m = 0; m < 2; m++) {
            ctx.strokeStyle = rgba(a, 0.36 - m * 0.14);
            ctx.lineWidth = 2.4 - m * 0.8;
            ctx.beginPath();
            ctx.ellipse(0, 0, 56 + m * 8, 50 + m * 6, 0, 0, TAU);
            ctx.stroke();
        }
        for (let k = 0; k < 6; k++) {
            const rx = 68 + k * 18, ry = rx * 0.28;
            ctx.strokeStyle = rgba(a, 0.58 - k * 0.08);
            ctx.lineWidth = 3.0 - k * 0.35;
            ctx.beginPath();
            ctx.ellipse(0, 0, rx, ry, 0, Math.PI, TAU);
            ctx.stroke();
        }
        ctx.restore();

        // 2. Orbiting particles & trails revolving around the black hole
        ctx.lineWidth = 1.25; ctx.strokeStyle = rgba(a, 0.42);
        for (let i = 0; i < N; i++) {
            ctx.beginPath();
            for (let k = 1; k <= TL; k++) {
                const idx = (i * TL + ((hp + k) % TL)) * 2;
                k === 1 ? ctx.moveTo(hist[idx], hist[idx + 1]) : ctx.lineTo(hist[idx], hist[idx + 1]);
            }
            ctx.stroke();
        }
        ctx.fillStyle = rgba(a, 0.98);
        for (let i = 0; i < N; i++) { ctx.beginPath(); ctx.arc(x[i], y[i], 2.0, 0, TAU); ctx.fill(); }

        // 3. Event horizon shadow (Schwarzschild core) + photon ring + front accretion stream
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(-0.34);
        ctx.fillStyle = "#03050a";
        ctx.beginPath(); ctx.arc(0, 0, R_EH, 0, TAU); ctx.fill();
        ctx.strokeStyle = rgba(a, 0.96);
        ctx.lineWidth = 2.8;
        ctx.beginPath(); ctx.arc(0, 0, R_EH + 1.5, 0, TAU); ctx.stroke();
        ctx.strokeStyle = "rgba(255,255,255,0.85)";
        ctx.lineWidth = 1.8;
        ctx.beginPath(); ctx.arc(0, 0, R_EH + 0.6, Math.PI * 0.65 + Math.sin(t * 2) * 0.2, Math.PI * 1.45 + Math.sin(t * 2) * 0.2); ctx.stroke();
        for (let k = 0; k < 6; k++) {
            const rx = 68 + k * 18, ry = rx * 0.28, spin = t * (3.2 - k * 0.38) + k * 1.1;
            ctx.strokeStyle = rgba(a, 0.88 - k * 0.11);
            ctx.lineWidth = 3.5 - k * 0.4;
            ctx.beginPath();
            ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI);
            ctx.stroke();
            ctx.strokeStyle = "rgba(255,255,255," + (0.62 - k * 0.08) + ")";
            ctx.lineWidth = 2.0 - k * 0.18;
            ctx.beginPath();
            ctx.ellipse(0, 0, rx, ry, 0, spin % TAU, (spin % TAU) + 0.9);
            ctx.stroke();
        }
        ctx.restore();

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
   Chaotic Gravitational 3-Body Problem: r̈_i = -∑_{j≠i} G m_j (r_i - r_j) / (|r_i - r_j|² + ε²)^(3/2)
   Three massive suns + 85 test particles integrated with 4th-order Runge-Kutta (RK4),
   barycentre tension geometry, luminous orbital ribbons, and cursor gravitational perturbation. */
SIMS.contact = (c) => {
    const ctx = c.getContext("2d");
    const G = 1, M = [1.0, 1.0, 1.0], SOFT = 0.16, TRAIL = 360, SUB = 6, DT = 0.0028, NP = 85;
    let W = 0, Hh = 0, cx = 0, cy = 0, scale = 180;

    // 3 primary bodies in dimensionless coordinates around origin, initialised near perturbed Figure-8 choreography
    const b = [
        { x: -0.97000436, y: 0.24308753, vx: 0.466203685, vy: 0.43236573, tx: new Float32Array(TRAIL), ty: new Float32Array(TRAIL) },
        { x: 0.97000436, y: -0.24308753, vx: 0.466203685, vy: 0.43236573, tx: new Float32Array(TRAIL), ty: new Float32Array(TRAIL) },
        { x: 0.0, y: 0.0, vx: -0.93240737, vy: -0.86473146, tx: new Float32Array(TRAIL), ty: new Float32Array(TRAIL) }
    ];
    let head = 0, ready = false;

    const initTrails = () => {
        for (let i = 0; i < 3; i++) { b[i].tx.fill(b[i].x); b[i].ty.fill(b[i].y); }
    };
    initTrails();

    // Massless test particles (planetary debris slinging between the 3 suns)
    const px = new Float32Array(NP), py = new Float32Array(NP), pvx = new Float32Array(NP), pvy = new Float32Array(NP);
    const ptx = new Float32Array(NP), pty = new Float32Array(NP);
    const spawnParticle = (i) => {
        const r = 0.35 + Math.random() * 1.45, a = Math.random() * TAU;
        px[i] = Math.cos(a) * r; py[i] = Math.sin(a) * r;
        const v = Math.sqrt(1.6 / (r + 0.3)) * (0.75 + Math.random() * 0.4);
        pvx[i] = -Math.sin(a) * v; pvy[i] = Math.cos(a) * v;
        ptx[i] = px[i]; pty[i] = py[i];
    };
    for (let i = 0; i < NP; i++) spawnParticle(i);

    const deriv = (state, mx, my, hasMouse) => {
        const out = new Float64Array(12);
        for (let i = 0; i < 3; i++) {
            const xi = state[i * 4], yi = state[i * 4 + 1], vxi = state[i * 4 + 2], vyi = state[i * 4 + 3];
            let ax = -0.08 * xi, ay = -0.08 * yi; // gentle confining potential keeps chaotic slingshots on-screen
            for (let j = 0; j < 3; j++) {
                if (i === j) continue;
                const dx = state[j * 4] - xi, dy = state[j * 4 + 1] - yi;
                const d2 = dx * dx + dy * dy + SOFT * SOFT;
                const f = (G * M[j]) / (d2 * Math.sqrt(d2));
                ax += f * dx; ay += f * dy;
            }
            if (hasMouse) {
                const dx = mx - xi, dy = my - yi, d2 = dx * dx + dy * dy + 0.22;
                const f = 0.38 / (d2 * Math.sqrt(d2));
                ax += f * dx; ay += f * dy;
            }
            out[i * 4] = vxi; out[i * 4 + 1] = vyi; out[i * 4 + 2] = ax; out[i * 4 + 3] = ay;
        }
        return out;
    };

    const stepRK4 = (mx, my, hasMouse) => {
        const s = new Float64Array(12), s2 = new Float64Array(12), s3 = new Float64Array(12), s4 = new Float64Array(12);
        for (let i = 0; i < 3; i++) { s[i * 4] = b[i].x; s[i * 4 + 1] = b[i].y; s[i * 4 + 2] = b[i].vx; s[i * 4 + 3] = b[i].vy; }
        const k1 = deriv(s, mx, my, hasMouse);
        for (let i = 0; i < 12; i++) s2[i] = s[i] + 0.5 * DT * k1[i];
        const k2 = deriv(s2, mx, my, hasMouse);
        for (let i = 0; i < 12; i++) s3[i] = s[i] + 0.5 * DT * k2[i];
        const k3 = deriv(s3, mx, my, hasMouse);
        for (let i = 0; i < 12; i++) s4[i] = s[i] + DT * k3[i];
        const k4 = deriv(s4, mx, my, hasMouse);

        let cmx = 0, cmy = 0, cmvx = 0, cmvy = 0;
        for (let i = 0; i < 3; i++) {
            b[i].x += (DT / 6) * (k1[i * 4] + 2 * k2[i * 4] + 2 * k3[i * 4] + k4[i * 4]);
            b[i].y += (DT / 6) * (k1[i * 4 + 1] + 2 * k2[i * 4 + 1] + 2 * k3[i * 4 + 1] + k4[i * 4 + 1]);
            b[i].vx += (DT / 6) * (k1[i * 4 + 2] + 2 * k2[i * 4 + 2] + 2 * k3[i * 4 + 2] + k4[i * 4 + 2]);
            b[i].vy += (DT / 6) * (k1[i * 4 + 3] + 2 * k2[i * 4 + 3] + 2 * k3[i * 4 + 3] + k4[i * 4 + 3]);
            const spd = Math.hypot(b[i].vx, b[i].vy);
            if (spd > 2.6) { b[i].vx *= 2.6 / spd; b[i].vy *= 2.6 / spd; }
            cmx += b[i].x / 3; cmy += b[i].y / 3; cmvx += b[i].vx / 3; cmvy += b[i].vy / 3;
        }
        // Keep barycentre gently anchored near origin
        for (let i = 0; i < 3; i++) {
            b[i].x -= cmx * 0.02; b[i].y -= cmy * 0.02;
            b[i].vx -= cmvx * 0.02; b[i].vy -= cmvy * 0.02;
        }

        // Advance massless test particles in the 3-body field
        for (let i = 0; i < NP; i++) {
            let ax = -0.05 * px[i], ay = -0.05 * py[i];
            for (let j = 0; j < 3; j++) {
                const dx = b[j].x - px[i], dy = b[j].y - py[i];
                const d2 = dx * dx + dy * dy + 0.09;
                const f = 0.55 / (d2 * Math.sqrt(d2));
                ax += f * dx; ay += f * dy;
            }
            pvx[i] = (pvx[i] + ax * DT) * 0.9995;
            pvy[i] = (pvy[i] + ay * DT) * 0.9995;
            px[i] += pvx[i] * DT; py[i] += pvy[i] * DT;
            if (px[i] * px[i] + py[i] * py[i] > 6.5) spawnParticle(i);
        }
    };

    KW.fit(c, (w, h, dpr) => {
        W = w; Hh = h; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        cx = W * (W > 900 ? 0.64 : 0.5);
        cy = Hh * 0.5;
        scale = Math.min(W, Hh) * 0.28;
        if (!ready) {
            for (let k = 0; k < 180; k++) {
                stepRK4(0, 0, false);
                head = (head + 1) % TRAIL;
                for (let i = 0; i < 3; i++) { b[i].tx[head] = b[i].x; b[i].ty[head] = b[i].y; }
            }
            ready = true;
        }
    });
    KW.tag("Gravitational 3-body problem · r̈ᵢ = −∑ G mⱼ (rᵢ − rⱼ)/|rᵢ − rⱼ|³ · RK4 chaotic choreography", c);

    KW.loop(c, () => {
        const p = KW.local(c), on = p.x > 0 && p.x < W && p.y > 0 && p.y < Hh;
        const mx = (p.x - cx) / scale, my = (p.y - cy) / scale;

        for (let i = 0; i < NP; i++) { ptx[i] = px[i]; pty[i] = py[i]; }
        for (let s = 0; s < SUB; s++) stepRK4(mx, my, on);
        head = (head + 1) % TRAIL;
        for (let i = 0; i < 3; i++) { b[i].tx[head] = b[i].x; b[i].ty[head] = b[i].y; }

        const cols = KW.col.light
            ? [[217, 119, 6], [6, 140, 172], [225, 29, 72]]
            : [[255, 149, 0], [34, 211, 238], [244, 63, 94]];

        ctx.clearRect(0, 0, W, Hh);

        // 1. Background chaotic test particles slung by the 3 bodies
        ctx.strokeStyle = rgba(cols[0], 0.24);
        ctx.fillStyle = rgba(cols[0], 0.55);
        ctx.lineWidth = 1;
        for (let i = 0; i < NP; i++) {
            const x0 = cx + ptx[i] * scale, y0 = cy + pty[i] * scale;
            const x1 = cx + px[i] * scale, y1 = cy + py[i] * scale;
            ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
            ctx.beginPath(); ctx.arc(x1, y1, 1.35, 0, TAU); ctx.fill();
        }

        // 2. Instantaneous gravitational tension triangle & barycentre marker
        const sx = b.map((q) => cx + q.x * scale), sy = b.map((q) => cy + q.y * scale);
        ctx.save();
        ctx.setLineDash([5, 5]);
        for (let i = 0; i < 3; i++) {
            const j = (i + 1) % 3;
            const dist = Math.hypot(b[i].x - b[j].x, b[i].y - b[j].y);
            const alpha = Math.min(0.65, 0.18 + 0.22 / (dist + 0.25));
            ctx.strokeStyle = rgba(cols[0], alpha);
            ctx.lineWidth = 1.2;
            ctx.beginPath(); ctx.moveTo(sx[i], sy[i]); ctx.lineTo(sx[j], sy[j]); ctx.stroke();
        }
        ctx.restore();

        const bx = (sx[0] + sx[1] + sx[2]) / 3, by = (sy[0] + sy[1] + sy[2]) / 3;
        ctx.strokeStyle = rgba(cols[0], 0.45);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(bx, by, 5, 0, TAU);
        ctx.moveTo(bx - 9, by); ctx.lineTo(bx + 9, by);
        ctx.moveTo(bx, by - 9); ctx.lineTo(bx, by + 9);
        ctx.stroke();

        // 3. Multi-band glowing orbital trails for each of the 3 suns
        const BANDS = 4, seg = Math.floor(TRAIL / BANDS);
        for (let i = 0; i < 3; i++) {
            const col = cols[i];
            for (let bnd = 0; bnd < BANDS; bnd++) {
                const start = bnd * seg, end = bnd === BANDS - 1 ? TRAIL - 1 : (bnd + 1) * seg;
                const frac = (bnd + 1) / BANDS;
                ctx.strokeStyle = rgba(col, 0.12 + 0.72 * frac * frac);
                ctx.lineWidth = 0.9 + 2.2 * frac;
                ctx.beginPath();
                for (let k = start; k <= end; k++) {
                    const idx = (head + 1 + k) % TRAIL;
                    const x = cx + b[i].tx[idx] * scale, y = cy + b[i].ty[idx] * scale;
                    k === start ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
                }
                ctx.stroke();
            }
        }

        // 4. Three luminous stellar cores with radial coronae
        for (let i = 0; i < 3; i++) {
            const col = cols[i], x = sx[i], y = sy[i];
            const g = ctx.createRadialGradient(x, y, 2, x, y, 52);
            g.addColorStop(0, "rgba(255,255,255,0.98)");
            g.addColorStop(0.14, rgba(col, 0.92));
            g.addColorStop(0.42, rgba(col, 0.32));
            g.addColorStop(1, rgba(col, 0));
            ctx.fillStyle = g;
            ctx.beginPath(); ctx.arc(x, y, 52, 0, TAU); ctx.fill();

            ctx.fillStyle = "#ffffff";
            ctx.beginPath(); ctx.arc(x, y, 4.5, 0, TAU); ctx.fill();
        }

        if (on) {
            ctx.strokeStyle = rgba(cols[0], 0.75);
            ctx.lineWidth = 1.2;
            ctx.beginPath(); ctx.arc(p.x, p.y, 10, 0, TAU); ctx.stroke();
        }
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

// Mathematics: rotating Fourier epicycle rotor on the left projecting onto overlapping
// sin/cos waves with Riemann sum bars, plus a morphing Lissajous figure on the right.
NAV.math = () => (ctx, w, h, t) => {
    const a = KW.col.a, b = KW.col.pal[1], mid = h / 2, R = h * 0.36, ph = t * 2.4;
    const cx = 22, rx = w - 24, x0 = 48, x1 = Math.max(x0 + 40, w - 52);
    const span = x1 - x0, k = TAU / Math.max(span / 2.2, 110);

    // 1. Unit-circle Fourier phasor rotor on the left
    ctx.strokeStyle = rgba(a, 0.32); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(cx, mid, R, 0, TAU); ctx.stroke();
    const px = cx + R * Math.cos(ph), py = mid - R * Math.sin(ph);
    ctx.strokeStyle = rgba(b, 0.75); ctx.beginPath(); ctx.moveTo(cx, mid); ctx.lineTo(px, py); ctx.stroke();
    ctx.strokeStyle = rgba(a, 0.35); ctx.setLineDash([2, 3]);
    ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(x0, py); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = rgba(a, 1); ctx.beginPath(); ctx.arc(px, py, 2.3, 0, TAU); ctx.fill();

    // 2. Riemann quadrature bars between sin(x) and cos(x)
    ctx.fillStyle = rgba(a, 0.14);
    for (let x = x0; x < x1; x += 8) {
        const ys = mid - R * Math.sin(k * (x - x0) + ph);
        const yc = mid - R * Math.cos(k * (x - x0) + ph);
        ctx.fillRect(x, Math.min(ys, yc), 4, Math.abs(yc - ys));
    }

    // 3. Overlapping sin & cos curves
    const wave = (f, col) => {
        ctx.strokeStyle = col; ctx.lineWidth = 1.6; ctx.beginPath();
        for (let x = x0; x <= x1; x += 2) {
            const y = mid - R * f(k * (x - x0) + ph);
            x === x0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }
        ctx.stroke();
    };
    wave(Math.cos, rgba(b, 0.88));
    wave(Math.sin, rgba(a, 0.96));

    // 4. Parametric Lissajous harmonic knot on the right
    if (w > 180) {
        ctx.strokeStyle = rgba(a, 0.85); ctx.lineWidth = 1.2; ctx.beginPath();
        for (let i = 0; i <= 64; i++) {
            const u = (i / 64) * TAU;
            const lx = rx + R * 0.95 * Math.sin(3 * u + ph * 0.7);
            const ly = mid + R * 0.95 * Math.sin(2 * u);
            i ? ctx.lineTo(lx, ly) : ctx.moveTo(lx, ly);
        }
        ctx.stroke();
    }
};

// Physics: Keplerian multi-body orbital system + relativistic particle collider bursts
// (elliptical planetary orbits, gravitational wells, and curved magnetic-field shower tracks).
NAV.physics = () => {
    const bursts = [];
    let cd = 0;
    return (ctx, w, h, t, dt) => {
        const a = KW.col.a, b = KW.col.pal[0], mid = h / 2;
        const wells = w > 320 ? [w * 0.22, w * 0.5, w * 0.78] : [w * 0.35, w * 0.68];

        // 1. Counter-propagating collider beam line + travelling proton packets
        ctx.strokeStyle = rgba(a, 0.16); ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(0, mid); ctx.lineTo(w, mid); ctx.stroke();
        for (let i = 0; i < 4; i++) {
            const bx1 = ((t * 160 + i * (w / 4)) % w);
            const bx2 = (w - ((t * 160 + i * (w / 4)) % w));
            ctx.fillStyle = rgba(a, 0.9);
            ctx.fillRect(bx1 - 4, mid - 1, 8, 2);
            ctx.fillStyle = rgba(b, 0.9);
            ctx.fillRect(bx2 - 4, mid - 1, 8, 2);
        }

        // 2. Keplerian elliptical orbits & satellites around each gravity well
        wells.forEach((wx, idx) => {
            const rx = Math.min(34, w * 0.08), ry = h * 0.38;
            const tilt = (idx % 2 === 0 ? 0.28 : -0.28);
            ctx.save();
            ctx.translate(wx, mid);
            ctx.rotate(tilt);
            ctx.strokeStyle = rgba(a, 0.32); ctx.lineWidth = 1;
            ctx.beginPath(); ctx.ellipse(0, 0, rx, ry, 0, 0, TAU); ctx.stroke();

            // Orbiting body with true-anomaly speed boost near perihelion
            const ang = t * (2.6 + idx * 0.5) + idx * 2.1;
            const ox = rx * Math.cos(ang), oy = ry * Math.sin(ang);
            ctx.strokeStyle = rgba(a, 0.75); ctx.lineWidth = 1.6;
            ctx.beginPath();
            for (let s = 0; s < 10; s++) {
                const a0 = ang - s * 0.09;
                s ? ctx.lineTo(rx * Math.cos(a0), ry * Math.sin(a0)) : ctx.moveTo(ox, oy);
            }
            ctx.stroke();
            ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(ox, oy, 2.2, 0, TAU); ctx.fill();

            // Central gravity well core
            ctx.fillStyle = rgba(a, 0.95); ctx.beginPath(); ctx.arc(0, 0, 3.2, 0, TAU); ctx.fill();
            ctx.strokeStyle = rgba(a, 0.35); ctx.beginPath(); ctx.arc(0, 0, 6 + 2 * Math.sin(t * 4 + idx), 0, TAU); ctx.stroke();
            ctx.restore();
        });

        // 3. Relativistic magnetic-field collision shower tracks (r = mv / qB)
        if ((cd -= dt) <= 0 && bursts.length < 4) {
            cd = 0.55;
            const cx = wells[(Math.random() * wells.length) | 0];
            bursts.push({
                x: cx, age: 0,
                tracks: Array.from({ length: 7 }, () => ({
                    a0: Math.random() * TAU,
                    curv: (Math.random() < 0.5 ? 1 : -1) * (1.2 + Math.random() * 1.8),
                    len: 14 + Math.random() * 18,
                    alt: Math.random() < 0.4
                }))
            });
        }
        for (const q of bursts) {
            q.age += dt * 1.9;
            const p = Math.min(1, q.age), alpha = (1 - p) * 0.85;
            ctx.strokeStyle = rgba(a, alpha * 0.6); ctx.lineWidth = 1;
            ctx.beginPath(); ctx.arc(q.x, mid, p * 16, 0, TAU); ctx.stroke();
            for (const tr of q.tracks) {
                ctx.strokeStyle = rgba(tr.alt ? b : a, alpha); ctx.lineWidth = 1.2;
                ctx.beginPath();
                for (let s = 0; s <= 8; s++) {
                    const f = (s / 8) * p;
                    const ang = tr.a0 + tr.curv * f;
                    const px = q.x + Math.cos(ang) * tr.len * f;
                    const py = mid + Math.sin(ang) * tr.len * f * 0.65;
                    s ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
                }
                ctx.stroke();
            }
        }
        while (bursts.length && bursts[0].age >= 1) bursts.shift();
    };
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

// Quant: live-streaming OHLC candlestick chart with high/low wicks, EMA overlay, and live-ticking active bar.
NAV.quant = () => {
    const CW = 9, bars = [];
    let price = 100, ema = 100, tickAcc = 0, barAcc = 0, lo = 0, hi = 0, init = false;
    const spawnBar = () => {
        const o = price;
        let c = o, h = o, l = o;
        for (let k = 0; k < 6; k++) {
            c += randn() * 0.45;
            if (c > h) h = c;
            if (c < l) l = c;
        }
        price = c;
        ema = ema * 0.82 + c * 0.18;
        bars.push({ o, h: h + Math.random() * 0.35, l: l - Math.random() * 0.35, c, ema });
    };
    return (ctx, w, h, t, dt) => {
        const n = Math.ceil(w / CW) + 2;
        if (!init) { for (let i = 0; i < n; i++) spawnBar(); init = true; }
        tickAcc += dt * 18;
        while (tickAcc >= 1) {
            tickAcc--;
            const cur = bars[bars.length - 1];
            cur.c += randn() * 0.28;
            if (cur.c > cur.h) cur.h = cur.c;
            if (cur.c < cur.l) cur.l = cur.c;
            price = cur.c;
            cur.ema = cur.ema * 0.94 + cur.c * 0.06;
            ema = cur.ema;
        }
        barAcc += dt * 2.4;
        while (barAcc >= 1) {
            barAcc--;
            bars.push({ o: price, h: price + 0.15, l: price - 0.15, c: price, ema });
        }
        while (bars.length > n) bars.shift();

        let mn = Infinity, mx = -Infinity;
        for (const b of bars) { if (b.l < mn) mn = b.l; if (b.h > mx) mx = b.h; }
        if (lo === hi) { lo = mn; hi = mx; }
        lo += (mn - lo) * 0.12; hi += (mx - hi) * 0.12;
        const span = Math.max(hi - lo, 1e-3);
        const bull = KW.col.pal[3] || KW.col.a, bear = KW.col.pal[0] || [224, 40, 64], maCol = KW.col.pal[2] || [245, 158, 11];
        const px = (i) => w - 10 - (bars.length - 1 - i + barAcc) * CW;
        const py = (v) => h - 3 - ((v - lo) / span) * (h - 6);

        // Dashed live price level
        const lastY = py(bars[bars.length - 1].c);
        ctx.save();
        ctx.setLineDash([2, 3]);
        ctx.strokeStyle = rgba(bull, 0.35);
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(0, lastY); ctx.lineTo(w, lastY); ctx.stroke();
        ctx.restore();

        // Candlesticks (wicks + bodies)
        for (let i = 0; i < bars.length; i++) {
            const b = bars[i], x = px(i), up = b.c >= b.o, col = up ? bull : bear;
            const yH = py(b.h), yL = py(b.l), yO = py(b.o), yC = py(b.c);
            const top = Math.min(yO, yC), bh = Math.max(1.8, Math.abs(yC - yO));
            ctx.strokeStyle = rgba(col, 0.85);
            ctx.lineWidth = 1.1;
            ctx.beginPath(); ctx.moveTo(x, yH); ctx.lineTo(x, yL); ctx.stroke();
            ctx.fillStyle = rgba(col, i === bars.length - 1 ? 1 : 0.88);
            ctx.fillRect(x - 2.6, top, 5.2, bh);
        }

        // Exponential Moving Average (EMA) line
        ctx.strokeStyle = rgba(maCol, 0.78);
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        bars.forEach((b, i) => (i ? ctx.lineTo(px(i), py(b.ema)) : ctx.moveTo(px(i), py(b.ema))));
        ctx.stroke();
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
