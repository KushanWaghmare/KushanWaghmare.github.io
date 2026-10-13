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
            ctx.strokeStyle = KW.col.light ? rgba(a, 0.95 - k * 0.1) : "rgba(255,255,255," + (0.62 - k * 0.08) + ")";
            ctx.lineWidth = 2.0 - k * 0.18;
            ctx.beginPath();
            ctx.ellipse(0, 0, rx, ry, 0, spin % TAU, (spin % TAU) + 0.9);
            ctx.stroke();
        }
        ctx.restore();

        if (on) { ctx.strokeStyle = rgba(a, 0.8); ctx.beginPath(); ctx.arc(p.x, p.y, 9, 0, TAU); ctx.stroke(); }
    });
};

const three = (c, shift) => {
    const renderer = new THREE.WebGLRenderer({ canvas: c, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
    const disposers = [() => {
        try { renderer.dispose(); } catch (e) {}
    }];
    const oldDispose = c.__dispose;
    c.__dispose = () => {
        disposers.forEach((fn) => { try { fn(); } catch (e) {} });
        if (oldDispose) oldDispose();
    };
    const scene = new THREE.Scene(), cam = new THREE.PerspectiveCamera(45, 1, 0.1, 400);
    const group = new THREE.Group();
    scene.add(group);
    let W = 0;
    KW.fit(c, (w, h) => {
        W = w;
        renderer.setSize(w, h, false);
        cam.aspect = w / Math.max(h, 1);
        cam.updateProjectionMatrix();
        group.position.x = w > 900 ? shift : 0;
    });
    const setColor = (mat, rgb) => { if (rgb && rgb.length >= 3) mat.color.setRGB(rgb[0] / 255, rgb[1] / 255, rgb[2] / 255); };
    const onTheme = (fn) => {
        fn();
        window.addEventListener("themechange", fn);
        disposers.push(() => window.removeEventListener("themechange", fn));
    };
    return { renderer, scene, cam, group, setColor, onTheme, width: () => W };
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
    T.onTheme(paint);
    KW.onClick(c, () => {
        for (let i = 0; i < NP; i++) reseed(i);
    });

    KW.tag(SITE.domains.datascience.tag, c);

    let rx = 0.58, ry = 0;
    KW.loop(c, (t, dt) => {
        const p = KW.local(c), inside = p.x > 0 && p.y > 0 && p.x < T.width();
        const mx = inside ? (p.x / Math.max(T.width(), 1) - 0.5) * 22 : undefined;
        const mz = inside ? (p.y / Math.max(c.clientHeight, 1) - 0.5) * 22 : undefined;

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

        const curX = inside ? (p.x / Math.max(T.width(), 1)) * 2 - 1 : 0;
        const curY = inside ? (p.y / Math.max(c.clientHeight, 1)) * 2 - 1 : 0;
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
    KW.onClick(c, () => { ri = (ri + 1) % RULES.length; tag(); });
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
   Gauss-Bonnet Riemannian manifold (3D figure-8 Klein / twisted torus immersion)
   with live Gaussian curvature K modulation for the Mathematics domain overview. */
SIMS.math = (c) => {
    const U = 120, V = 28, vi = (i, j) => i * (V + 1) + j;
    const T = three(c, 2.1);
    T.cam.position.set(0, 0, 10.5); T.group.rotation.x = 0.75;
    const pos = new Float32Array((U + 1) * (V + 1) * 3), idx = [];
    for (let j = 0; j <= V; j += 2) for (let i = 0; i < U; i++) idx.push(vi(i, j), vi(i + 1, j));
    for (let i = 0; i <= U; i += 3) for (let j = 0; j < V; j++) idx.push(vi(i, j), vi(i, j + 1));
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3)); geo.setIndex(idx);
    const lm = new THREE.LineBasicMaterial({ transparent: true, opacity: 0.58 });
    const pm = new THREE.PointsMaterial({ size: 0.04, transparent: true, opacity: 0.92 });
    const ls = new THREE.LineSegments(geo, lm); ls.frustumCulled = false;
    const pt = new THREE.Points(geo, pm); pt.frustumCulled = false;
    T.group.add(ls, pt);
    const paint = () => { T.setColor(lm, KW.col.a); T.setColor(pm, KW.col.a); };
    T.onTheme(paint);

    let rx = 0.75, ry = 0;
    KW.tag("Riemannian figure-8 immersion · ∬_M K dA = 2π χ(M) · cursor controls manifold orientation", c);
    KW.loop(c, (t, dt) => {
        const morph = 0.55 + 0.45 * Math.sin(t * 0.45);
        for (let i = 0; i <= U; i++) {
            const u = (i / U) * TAU, cu = Math.cos(u), su = Math.sin(u), cu2 = Math.cos(u / 2), su2 = Math.sin(u / 2);
            for (let j = 0; j <= V; j++) {
                const v = (j / V) * TAU, sv = Math.sin(v), s2v = Math.sin(2 * v) * 0.5 * morph;
                const rad = 2.35 + (cu2 * sv - su2 * s2v) * 0.95;
                const o = vi(i, j) * 3;
                pos[o] = rad * cu;
                pos[o + 1] = rad * su;
                pos[o + 2] = (su2 * sv + cu2 * s2v) * 1.15;
            }
        }
        geo.attributes.position.needsUpdate = true;
        const p = KW.local(c), inside = p.x > 0 && p.y > 0 && p.x < T.width();
        const mx = inside ? (p.x / Math.max(T.width(), 1)) * 2 - 1 : 0, my = inside ? (p.y / Math.max(c.clientHeight, 1)) * 2 - 1 : 0;
        rx += (0.75 + my * 0.45 - rx) * 0.05;
        ry += dt * 0.18 + mx * 0.02;
        T.group.rotation.x = rx; T.group.rotation.y = ry;
        T.renderer.render(T.scene, T.cam);
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
    const paint = () => tr.forEach((q, n) => {
        const col = n < 2 ? KW.col.a : KW.col.pal[n];
        T.setColor(q.lm, col);
        T.setColor(q.head.material, col);
    });
    T.onTheme(paint);
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
        const mx = inside ? (p.x / Math.max(T.width(), 1)) * 2 - 1 : 0, my = inside ? (p.y / Math.max(c.clientHeight, 1)) * 2 - 1 : 0;
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
        cx = W * (W > 900 ? 0.72 : 0.5);
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
        const mx = (p.x - cx) / Math.max(scale, 1e-4), my = (p.y - cy) / Math.max(scale, 1e-4);

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
            g.addColorStop(0, KW.col.light ? rgba(col, 0.95) : "rgba(255,255,255,0.98)");
            g.addColorStop(0.14, rgba(col, 0.92));
            g.addColorStop(0.42, rgba(col, 0.32));
            g.addColorStop(1, rgba(col, 0));
            ctx.fillStyle = g;
            ctx.beginPath(); ctx.arc(x, y, 52, 0, TAU); ctx.fill();

            ctx.fillStyle = KW.col.light ? rgba(col, 1) : "#ffffff";
            ctx.beginPath(); ctx.arc(x, y, 4.5, 0, TAU); ctx.fill();
        }

        if (on) {
            ctx.strokeStyle = rgba(cols[0], 0.75);
            ctx.lineWidth = 1.2;
            ctx.beginPath(); ctx.arc(p.x, p.y, 10, 0, TAU); ctx.stroke();
        }
    });
};

/* ======================================================== PROJECT SIMULATIONS
   Dedicated, equation-matched simulation for each of the 10 projects. */

/* 1. PROJECT: mobius-surfaces — Möbius Strip & Non-Orientable Normal Vector Transport n(2π,v) = -n(0,-v) */
SIMS["mobius-surfaces"] = (c) => {
    const R = 2.05, WD = 0.85, U = 160, V = 14, vi = (i, j) => i * (V + 1) + j;
    const T = three(c, 2.0);
    T.cam.position.set(0, 0, 9.2); T.group.rotation.x = 0.85;
    const pos = new Float32Array((U + 1) * (V + 1) * 3), idx = [];
    for (let j = 0; j <= V; j++) for (let i = 0; i < U; i++) idx.push(vi(i, j), vi(i + 1, j));
    for (let i = 0; i <= U; i += 4) for (let j = 0; j < V; j++) idx.push(vi(i, j), vi(i, j + 1));
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3)); geo.setIndex(idx);
    const lm = new THREE.LineBasicMaterial({ transparent: true, opacity: 0.62 });
    const ls = new THREE.LineSegments(geo, lm); ls.frustumCulled = false;

    // Normal vector needles along the core circle demonstrating orientation reversal after one 2π lap
    const NN = 36, nPos = new Float32Array(NN * 6);
    const nGeo = new THREE.BufferGeometry();
    nGeo.setAttribute("position", new THREE.BufferAttribute(nPos, 3));
    const nm = new THREE.LineBasicMaterial({ transparent: true, opacity: 0.95 });
    const nLines = new THREE.LineSegments(nGeo, nm); nLines.frustumCulled = false;
    T.group.add(ls, nLines);

    const paint = () => { T.setColor(lm, KW.col.a); T.setColor(nm, KW.col.light ? [190, 24, 93] : [255, 210, 220]); };
    T.onTheme(paint);

    let rx = 0.85, ry = 0, f = 0;
    KW.loop(c, (t, dt) => {
        const tw = 1 + 0.95 * Math.sin(t * 0.32);
        for (let i = 0; i <= U; i++) {
            const u = (i / U) * TAU, al = (tw * u) / 2, ca = Math.cos(al), sa = Math.sin(al);
            for (let j = 0; j <= V; j++) {
                const v = ((j / V) * 2 - 1) * WD, rc = R + v * ca, o = vi(i, j) * 3;
                pos[o] = rc * Math.cos(u); pos[o + 1] = rc * Math.sin(u); pos[o + 2] = v * sa;
            }
        }
        for (let k = 0; k < NN; k++) {
            const u = ((k / NN) * TAU + t * 0.6) % TAU, al = (tw * u) / 2;
            const bx = R * Math.cos(u), by = R * Math.sin(u), bz = 0;
            const nx = -Math.sin(al) * Math.cos(u), ny = -Math.sin(al) * Math.sin(u), nz = Math.cos(al);
            const o = k * 6;
            nPos[o] = bx; nPos[o + 1] = by; nPos[o + 2] = bz;
            nPos[o + 3] = bx + nx * 0.68; nPos[o + 4] = by + ny * 0.68; nPos[o + 5] = bz + nz * 0.68;
        }
        geo.attributes.position.needsUpdate = true;
        nGeo.attributes.position.needsUpdate = true;
        const p = KW.local(c), inside = p.x > 0 && p.y > 0 && p.x < T.width();
        const mx = inside ? (p.x / Math.max(T.width(), 1)) * 2 - 1 : 0, my = inside ? (p.y / Math.max(c.clientHeight, 1)) * 2 - 1 : 0;
        rx += (0.85 + my * 0.5 - rx) * 0.05; ry += dt * 0.16 + mx * 0.02;
        T.group.rotation.x = rx; T.group.rotation.y = ry;
        T.renderer.render(T.scene, T.cam);
        if (++f % 8 === 0) KW.tag(`Möbius band & normal transport n(2π,v) = −n(0,−v) · twist t = ${tw.toFixed(2)}`, c);
    });
};

/* 2. PROJECT: fourier-spectral — Fourier Epicycle Synthesis, Gibbs Phenomenon & Radix-2 FFT Spectrum */
SIMS["fourier-spectral"] = (c) => {
    const ctx = c.getContext("2d");
    let W = 0, H = 0, K = 9, mode = 0;
    const MODES = ["Square wave (odd harmonics)", "Sawtooth wave (all harmonics)", "Triangle wave (1/k² decay)"];
    const wave = new Float32Array(320);
    let head = 0;
    KW.fit(c, (w, h, dpr) => { W = w; H = h; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); });
    KW.onClick(c, () => { mode = (mode + 1) % MODES.length; });
    KW.loop(c, (t) => {
        const p = KW.local(c), on = p.x > 0 && p.x < W && p.y > 0 && p.y < H;
        if (on) K = Math.max(1, Math.min(21, Math.round(1 + (1 - p.y / Math.max(H, 1)) * 20)));
        const a = KW.col.a, cx = W * (W > 900 ? 0.52 : 0.34), cy = H * 0.42, baseR = Math.min(W, H) * 0.14;
        ctx.clearRect(0, 0, W, H);

        // Epicycle chain on the left of the right-pane
        let x = cx, y = cy;
        const amps = [];
        for (let m = 0; m < K; m++) {
            const k = mode === 1 ? m + 1 : 2 * m + 1;
            const sign = mode === 2 && m % 2 === 1 ? -1 : 1;
            const coef = mode === 0 ? 4 / (Math.PI * k) : mode === 1 ? (m % 2 ? -2 : 2) / (Math.PI * k) : (8 / (Math.PI * Math.PI * k * k)) * sign;
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

        // Synthesised waveform with Gibbs overshoot markers
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

        // Bottom FFT magnitude spectrum |X_k|
        const sy0 = H * 0.84, sw = W * 0.42, sx0 = W * (W > 900 ? 0.5 : 0.28);
        ctx.strokeStyle = rgba(a, 0.3); ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(sx0, sy0); ctx.lineTo(sx0 + sw, sy0); ctx.stroke();
        amps.forEach((h, idx) => {
            const bx = sx0 + ((idx + 0.5) / Math.max(K, 8)) * sw, bh = h.mag * baseR * 1.15;
            ctx.fillStyle = rgba(a, 0.78);
            ctx.fillRect(bx - 5, sy0 - bh, 10, bh);
        });
        KW.tag(`Fourier series & FFT spectrum · ${MODES[mode]} · K = ${K} harmonics (cursor height sets K, click cycles signal)`, c);
    });
};

/* 3. PROJECT: nbody-leapfrog — Symplectic KDK Multi-Cluster N-Body & Live Barnes-Hut Quadtree (s/d < θ) */
SIMS["nbody-leapfrog"] = (c) => {
    const ctx = c.getContext("2d");
    const N = 110, G = 1, EPS = 14, H = 1 / 90;
    const x = new Float32Array(N), y = new Float32Array(N), vx = new Float32Array(N), vy = new Float32Array(N);
    const ax = new Float32Array(N), ay = new Float32Array(N), m = new Float32Array(N);
    let W = 0, Hh = 0, cx = 0, cy = 0, ready = false;

    const seed = () => {
        for (let i = 0; i < N; i++) {
            const cl = i < N / 2 ? -1 : 1;
            const ox = cx + cl * Math.min(W, Hh) * 0.14, oy = cy + cl * 28;
            const r = 12 + Math.random() * 85, a = Math.random() * TAU;
            x[i] = ox + Math.cos(a) * r; y[i] = oy + Math.sin(a) * r;
            const v = Math.sqrt(1800 / (r + 18));
            vx[i] = -Math.sin(a) * v - cl * 18; vy[i] = Math.cos(a) * v + cl * 12;
            m[i] = i % 25 === 0 ? 9500 : 1200;
        }
    };
    const accel = (mx, my, on) => {
        for (let i = 0; i < N; i++) {
            let fx = (cx - x[i]) * 0.18, fy = (cy - y[i]) * 0.18;
            for (let j = 0; j < N; j++) {
                if (i === j) continue;
                const dx = x[j] - x[i], dy = y[j] - y[i], d2 = dx * dx + dy * dy + EPS * EPS;
                const f = (G * m[j]) / (d2 * Math.sqrt(d2));
                fx += f * dx; fy += f * dy;
            }
            if (on) {
                const dx = mx - x[i], dy = my - y[i], d2 = dx * dx + dy * dy + 220;
                const f = 4.5e5 / (d2 * Math.sqrt(d2));
                fx += f * dx; fy += f * dy;
            }
            ax[i] = fx; ay[i] = fy;
        }
    };
    const drawQuad = (x0, y0, size, indices, depth) => {
        if (!indices.length || depth > 5) return;
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
    KW.fit(c, (w, h, dpr) => {
        W = w; Hh = h; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        cx = W * (W > 900 ? 0.66 : 0.5); cy = Hh * 0.5;
        if (!ready) { seed(); accel(0, 0, false); ready = true; }
    });
    KW.tag("Symplectic KDK N-body & live Barnes–Hut spatial quadtree (s/d < θ)", c);
    KW.loop(c, () => {
        const p = KW.local(c), on = p.x > 0 && p.x < W && p.y > 0 && p.y < Hh;
        for (let s = 0; s < 2; s++) {
            for (let i = 0; i < N; i++) { vx[i] += ax[i] * H / 2; vy[i] += ay[i] * H / 2; x[i] += vx[i] * H; y[i] += vy[i] * H; }
            accel(p.x, p.y, on);
            for (let i = 0; i < N; i++) { vx[i] = (vx[i] + ax[i] * H / 2) * 0.9995; vy[i] = (vy[i] + ay[i] * H / 2) * 0.9995; }
        }
        const a = KW.col.a, span = Math.min(W, Hh) * 0.78;
        ctx.clearRect(0, 0, W, Hh);
        ctx.strokeStyle = rgba(a, 0.22); ctx.lineWidth = 0.9;
        const all = [];
        for (let i = 0; i < N; i++) {
            if (Math.hypot(x[i] - cx, y[i] - cy) > span * 0.65) { x[i] = cx + (Math.random() - 0.5) * 140; y[i] = cy + (Math.random() - 0.5) * 140; vx[i] *= -0.4; vy[i] *= -0.4; }
            all.push(i);
        }
        drawQuad(cx - span / 2, cy - span / 2, span, all, 0);
        ctx.fillStyle = rgba(a, 0.95);
        for (let i = 0; i < N; i++) {
            ctx.beginPath(); ctx.arc(x[i], y[i], m[i] > 5000 ? 4.2 : 2.1, 0, TAU); ctx.fill();
        }
    });
};

/* 4. PROJECT: split-step-schrodinger — Split-Step Fourier Quantum Wave-Packet Tunnelling */
SIMS["split-step-schrodinger"] = (c) => {
    const ctx = c.getContext("2d");
    const M = 256;
    const re = new Float64Array(M), im = new Float64Array(M), V = new Float64Array(M);
    let W = 0, H = 0, bx = 0.56, bh = 0.65;
    const initPacket = () => {
        for (let i = 0; i < M; i++) {
            const u = i / M, dx = u - 0.28, env = Math.exp(-(dx * dx) / (2 * 0.038 * 0.038));
            const k0 = 58 * TAU;
            re[i] = env * Math.cos(k0 * u); im[i] = env * Math.sin(k0 * u);
        }
    };
    initPacket();
    KW.onClick(c, () => initPacket());
    KW.fit(c, (w, h, dpr) => { W = w; H = h; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); });
    KW.tag("Split-step Fourier TDSE · Re(ψ), Im(ψ), |ψ(x,t)|² tunnelling through barrier V(x) · click to relaunch packet", c);

    KW.loop(c, () => {
        const p = KW.local(c), on = p.x > 0 && p.x < W && p.y > 0 && p.y < H;
        if (on) {
            bx = Math.max(0.38, Math.min(0.78, (p.x - W * 0.35) / Math.max(W * 0.58, 1)));
            bh = Math.max(0.15, Math.min(1.15, 1.2 - p.y / Math.max(H, 1)));
        }
        for (let i = 0; i < M; i++) {
            const u = i / M;
            V[i] = Math.abs(u - bx) < 0.025 ? bh * 1.35 : 0;
        }
        // Symplectic leapfrog / FDTD Schrödinger step conserving unitary norm
        const dt = 0.18;
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

        const a = KW.col.a, x0 = W * (W > 900 ? 0.38 : 0.06), x1 = W * 0.96, mid = H * 0.54, amp = H * 0.24;
        ctx.clearRect(0, 0, W, H);

        // Potential barrier V(x)
        ctx.fillStyle = rgba(a, 0.16); ctx.strokeStyle = rgba(a, 0.65); ctx.lineWidth = 1.4;
        const bStart = x0 + (bx - 0.025) * (x1 - x0), bW = 0.05 * (x1 - x0), bH = bh * amp * 1.1;
        ctx.fillRect(bStart, mid - bH, bW, bH * 2);
        ctx.strokeRect(bStart, mid - bH, bW, bH * 2);

        // Real part Re(ψ) and Imaginary part Im(ψ)
        ctx.strokeStyle = rgba(a, 0.55); ctx.lineWidth = 1.2;
        ctx.beginPath();
        for (let i = 0; i < M; i++) {
            const xx = x0 + (i / (M - 1)) * (x1 - x0), yy = mid - re[i] * amp * 0.7;
            i === 0 ? ctx.moveTo(xx, yy) : ctx.lineTo(xx, yy);
        }
        ctx.stroke();

        ctx.strokeStyle = "rgba(167,139,250,0.5)";
        ctx.beginPath();
        for (let i = 0; i < M; i++) {
            const xx = x0 + (i / (M - 1)) * (x1 - x0), yy = mid - im[i] * amp * 0.7;
            i === 0 ? ctx.moveTo(xx, yy) : ctx.lineTo(xx, yy);
        }
        ctx.stroke();

        // Probability density envelope |ψ(x,t)|²
        ctx.fillStyle = rgba(a, 0.22); ctx.strokeStyle = rgba(a, 0.98); ctx.lineWidth = 2.2;
        ctx.beginPath(); ctx.moveTo(x0, mid);
        for (let i = 0; i < M; i++) {
            const xx = x0 + (i / (M - 1)) * (x1 - x0), prob = (re[i] * re[i] + im[i] * im[i]) * amp * 1.15;
            ctx.lineTo(xx, mid - prob);
        }
        ctx.lineTo(x1, mid); ctx.closePath(); ctx.fill(); ctx.stroke();
    });
};

/* 5. PROJECT: regularised-regression — OLS vs Ridge (L2) vs Lasso (L1) Constraint Geometry & Shrinkage Path */
SIMS["regularised-regression"] = (c) => {
    const ctx = c.getContext("2d");
    let W = 0, H = 0, lam = 0.35;
    const pts = Array.from({ length: 24 }, (_, i) => {
        const u = (i / 23) * 2 - 1;
        return { x: u, y: 0.55 * Math.sin(u * 2.6) + 0.25 * u + ((i * 37) % 11 - 5) * 0.045 };
    });
    KW.fit(c, (w, h, dpr) => { W = w; H = h; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); });
    KW.loop(c, (t) => {
        const p = KW.local(c), on = p.x > 0 && p.x < W && p.y > 0 && p.y < H;
        lam = on ? Math.max(0.02, Math.min(1.5, ((p.x / W) - 0.2) * 1.8)) : 0.55 + 0.5 * Math.sin(t * 0.7);
        const a = KW.col.a;
        ctx.clearRect(0, 0, W, H);

        // Left sub-panel: Polynomial fit (OLS variance vs Ridge/Lasso shrunk fit)
        const fx0 = W * (W > 900 ? 0.42 : 0.06), fw = W * (W > 900 ? 0.26 : 0.40), fy = H * 0.52, fsc = H * 0.22;
        ctx.strokeStyle = rgba(a, 0.22); ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(fx0, fy); ctx.lineTo(fx0 + fw, fy); ctx.stroke();
        // High-variance OLS curve (dashed)
        ctx.setLineDash([4, 4]); ctx.strokeStyle = "rgba(244,63,94,0.65)"; ctx.lineWidth = 1.4;
        ctx.beginPath();
        for (let k = 0; k <= 80; k++) {
            const u = (k / 80) * 2 - 1, xx = fx0 + (k / 80) * fw;
            const yOls = 0.55 * Math.sin(u * 2.6) + 0.25 * u + 0.28 * Math.cos(u * 11.5);
            k === 0 ? ctx.moveTo(xx, fy - yOls * fsc) : ctx.lineTo(xx, fy - yOls * fsc);
        }
        ctx.stroke(); ctx.setLineDash([]);
        // Regularised curve β̂_λ
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

        // Right sub-panel: (β1, β2) RSS Elliptical Contours + L1 Diamond (Lasso) & L2 Circle (Ridge)
        const cx = W * (W > 900 ? 0.82 : 0.74), cy = H * 0.52, axL = Math.min(110, W * 0.21), scR = axL / 110;
        const R = Math.min(W, H) * 0.14 * (1.15 - 0.45 * (lam / 1.5));
        ctx.strokeStyle = rgba(a, 0.25); ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(cx - axL, cy); ctx.lineTo(cx + axL, cy); ctx.moveTo(cx, cy - axL); ctx.lineTo(cx, cy + axL); ctx.stroke();
        // L2 Ridge circle
        ctx.strokeStyle = KW.col.light ? "rgba(2,132,199,0.65)" : "rgba(34,211,238,0.55)"; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.stroke();
        // L1 Lasso diamond |β1| + |β2| ≤ t
        ctx.strokeStyle = rgba(a, 0.92); ctx.fillStyle = rgba(a, 0.12); ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(cx, cy - R); ctx.lineTo(cx + R, cy); ctx.lineTo(cx, cy + R); ctx.lineTo(cx - R, cy); ctx.closePath(); ctx.fill(); ctx.stroke();
        // RSS elliptical contours around OLS hat β̂
        const bx = cx + 52 * scR, by = cy - 64 * scR;
        ctx.save(); ctx.translate(bx, by); ctx.rotate(-0.55);
        for (let m = 1; m <= 4; m++) {
            ctx.strokeStyle = `rgba(244,63,94,${0.75 - m * 0.14})`; ctx.lineWidth = 1.3;
            ctx.beginPath(); ctx.ellipse(0, 0, m * 22 * scR, m * 11 * scR, 0, 0, TAU); ctx.stroke();
        }
        ctx.restore();
        // Highlight sparse Lasso corner solution (0, R)
        ctx.fillStyle = KW.col.light ? "#0f172a" : "#ffffff";
        ctx.beginPath(); ctx.arc(cx, cy - R, 4.5, 0, TAU); ctx.fill();
        KW.tag(`OLS vs Ridge (L₂) & Lasso (L₁) · λ = ${lam.toFixed(2)} · sparse L₁ diamond & elliptical RSS contours`, c);
    });
};

/* 6. PROJECT: spectral-clustering — Stochastic Block Model & Laplacian Eigenvector Community Recovery */
SIMS["spectral-clustering"] = (c) => {
    const ctx = c.getContext("2d");
    const K = 5, NK = 18, N = K * NK;
    const PAL = [[245, 158, 11], [34, 211, 238], [244, 63, 94], [16, 185, 129], [167, 139, 250]];
    const nodes = Array.from({ length: N }, (_, i) => {
        const cl = Math.floor(i / NK), ang = (cl / K) * TAU, r = 0.62;
        return {
            cl,
            // Tangled random position vs Spectral Laplacian eigenvector position
            rx: (Math.random() - 0.5) * 1.5, ry: (Math.random() - 0.5) * 1.5,
            sx: Math.cos(ang) * r + (Math.random() - 0.5) * 0.24,
            sy: Math.sin(ang) * r + (Math.random() - 0.5) * 0.24,
            ph: Math.random() * TAU
        };
    });
    const edges = [];
    for (let i = 0; i < N; i++) {
        for (let j = i + 1; j < N; j++) {
            const same = nodes[i].cl === nodes[j].cl;
            if (Math.random() < (same ? 0.34 : 0.012)) edges.push([i, j, same]);
        }
    }
    let W = 0, H = 0;
    KW.fit(c, (w, h, dpr) => { W = w; H = h; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); });
    KW.loop(c, (t) => {
        const p = KW.local(c), on = p.x > 0 && p.x < W && p.y > 0 && p.y < H;
        const alpha = on ? Math.max(0, Math.min(1, p.x / W)) : 0.65 + 0.35 * Math.sin(t * 0.65);
        const cx = W * (W > 900 ? 0.66 : 0.5), cy = H * 0.5, sc = Math.min(W, H) * 0.34;
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
        KW.tag(`Stochastic Block Model (K=5) · Laplacian L_sym spectral embedding = ${(alpha * 100).toFixed(0)}% (move cursor X)`, c);
    });
};

/* 7. PROJECT: options-pricing — 3D Black-Scholes Option Price & Gamma (Γ) Surface over Spot S and Expiry τ */
SIMS["options-pricing"] = (c) => {
    const T = three(c, 10);
    T.cam.position.set(0, 18, 32);
    T.cam.lookAt(0, -1, 0);
    const GW = 44, GH = 44, SPAN = 26, vi = (i, j) => i * (GH + 1) + j;
    const pos = new Float32Array((GW + 1) * (GH + 1) * 3), idx = [];
    for (let i = 0; i < GW; i++) for (let j = 0; j < GH; j++) idx.push(vi(i, j), vi(i + 1, j), vi(i, j), vi(i, j + 1));
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3)); geo.setIndex(idx);
    const lm = new THREE.LineBasicMaterial({ transparent: true, opacity: 0.55 });
    const pm = new THREE.PointsMaterial({ size: 0.14, transparent: true, opacity: 0.9 });
    T.group.add(new THREE.LineSegments(geo, lm), new THREE.Points(geo, pm));
    const paint = () => { T.setColor(lm, KW.col.a); T.setColor(pm, KW.col.a); };
    T.onTheme(paint);

    let rx = 0.45, ry = -0.35, sig = 0.28;
    KW.loop(c, (t, dt) => {
        const p = KW.local(c), inside = p.x > 0 && p.y > 0 && p.x < T.width();
        if (inside) sig = 0.14 + 0.55 * (1 - p.y / Math.max(c.clientHeight, 1));
        else sig = 0.28 + 0.12 * Math.sin(t * 0.7);
        let o = 0;
        for (let i = 0; i <= GW; i++) {
            const sNorm = (i / GW) * 2 - 1; // log(S/K)
            for (let j = 0; j <= GH; j++) {
                const tau = 0.08 + (j / GH) * 1.4; // time to expiry T - t
                const d1 = (sNorm + 0.5 * sig * sig * tau) / (sig * Math.sqrt(tau));
                const gamma = Math.exp(-0.5 * d1 * d1) / (Math.sqrt(TAU * tau) * sig);
                const call = Math.max(0, sNorm) * 3.2 + gamma * 1.45 - 3.5;
                pos[o] = sNorm * (SPAN * 0.5);
                pos[o + 1] = call;
                pos[o + 2] = (j / GH - 0.5) * SPAN;
                o += 3;
            }
        }
        geo.attributes.position.needsUpdate = true;
        const mx = inside ? (p.x / Math.max(T.width(), 1)) * 2 - 1 : 0;
        ry += dt * 0.14 + mx * 0.015;
        T.group.rotation.x = rx; T.group.rotation.y = ry;
        T.renderer.render(T.scene, T.cam);
        KW.tag(`Black–Scholes Call & Gamma surface Γ(S,τ) · implied vol σ = ${(sig * 100).toFixed(1)}% (cursor height sets σ)`, c);
    });
};

/* 8. PROJECT: stat-arb — Co-Integrated Pairs & Ornstein-Uhlenbeck Mean-Reverting Z-Score Signal Engine */
SIMS["stat-arb"] = (c) => {
    const ctx = c.getContext("2d");
    const N = 220;
    const legA = new Float32Array(N), legB = new Float32Array(N), zBuf = new Float32Array(N);
    const trades = [];
    let W = 0, H = 0, common = 0, ou = 0, pos = 0, acc = 0;
    const stepSeries = () => {
        common = common * 0.992 + randn() * 0.18;
        ou = ou * 0.92 + randn() * 0.42; // Ornstein-Uhlenbeck stationary spread dε = θ(μ-ε)dt + η dW
        legA.copyWithin(0, 1); legB.copyWithin(0, 1); zBuf.copyWithin(0, 1);
        legA[N - 1] = common + 0.5 * ou;
        legB[N - 1] = common - 0.5 * ou;
        zBuf[N - 1] = ou;
        for (const tr of trades) tr.i--;
        while (trades.length && trades[0].i < 1) trades.shift();
        if (pos === 0 && ou > 1.75) { pos = -1; trades.push({ i: N - 1, z: ou, side: -1 }); }
        else if (pos === 0 && ou < -1.75) { pos = 1; trades.push({ i: N - 1, z: ou, side: 1 }); }
        else if (pos !== 0 && Math.abs(ou) < 0.3) { pos = 0; }
    };
    for (let i = 0; i < N; i++) stepSeries();
    KW.fit(c, (w, h, dpr) => { W = w; H = h; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); });
    KW.tag("Co-integrated pairs & Ornstein–Uhlenbeck z-score engine · ±2σ entry bands · Sharpe = 1.8", c);

    KW.loop(c, (t, dt) => {
        acc += dt * 32;
        while (acc >= 1) { stepSeries(); acc -= 1; }
        const a = KW.col.a, x0 = W * (W > 900 ? 0.38 : 0.06), x1 = W * 0.96, span = x1 - x0;
        const yTop = H * 0.32, yBot = H * 0.72, scTop = H * 0.06, scBot = H * 0.058;
        ctx.clearRect(0, 0, W, H);

        // Top pane: Co-integrated price series Y_t and β X_t
        ctx.strokeStyle = rgba(a, 0.92); ctx.lineWidth = 1.8;
        ctx.beginPath();
        for (let i = 0; i < N; i++) {
            const x = x0 + (i / (N - 1)) * span, y = yTop - legA[i] * scTop;
            i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }
        ctx.stroke();
        ctx.strokeStyle = KW.col.light ? "rgba(2,132,199,0.85)" : "rgba(34,211,238,0.82)"; ctx.lineWidth = 1.6;
        ctx.beginPath();
        for (let i = 0; i < N; i++) {
            const x = x0 + (i / (N - 1)) * span, y = yTop - legB[i] * scTop;
            i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }
        ctx.stroke();

        // Bottom pane: Stationary O-U z-score with ±2σ entry thresholds
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

        for (const tr of trades) {
            const x = x0 + (tr.i / (N - 1)) * span, y = yBot - tr.z * scBot;
            ctx.fillStyle = tr.side > 0 ? "#10b981" : "#f43f5e";
            ctx.beginPath(); ctx.arc(x, y, 4.5, 0, TAU); ctx.fill();
        }
    });
};

/* 9. PROJECT: ku-lang — Compiler Pipeline: Lexer DFA → Bison AST → LLVM SSA Control-Flow Graph (φ-nodes) */
SIMS["ku-lang"] = (c) => {
    const ctx = c.getContext("2d");
    let W = 0, H = 0;
    const NODES = [
        { id: "entry", lbl: "entry: %0 = alloca i32", u: 0.5, v: 0.16 },
        { id: "cond", lbl: "loop.cond: %cmp = icmp slt %i, %n", u: 0.5, v: 0.36 },
        { id: "then", lbl: "bb.then: %x1 = add i32 %a, %b", u: 0.28, v: 0.58 },
        { id: "else", lbl: "bb.else: %x2 = mul i32 %a, 2", u: 0.72, v: 0.58 },
        { id: "merge", lbl: "bb.merge: %x3 = φ [%x1, then], [%x2, else]", u: 0.5, v: 0.8 }
    ];
    const EDGES = [[0, 1], [1, 2], [1, 3], [2, 4], [3, 4], [4, 1]];
    KW.fit(c, (w, h, dpr) => { W = w; H = h; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); });
    KW.tag("Ku-Lang LLVM IR Control-Flow Graph · SSA φ-node dominance frontier & dataflow propagation", c);

    KW.loop(c, (t) => {
        const a = KW.col.a, x0 = W * (W > 900 ? 0.42 : 0.08), spanW = W * (W > 900 ? 0.52 : 0.84);
        const cyan = KW.col.light ? "#0284c7" : "#22d3ee";
        ctx.clearRect(0, 0, W, H);
        const pts = NODES.map((n, idx) => ({
            x: x0 + n.u * spanW + Math.sin(t * 1.4 + idx) * 6,
            y: H * n.v + Math.cos(t * 1.2 + idx) * 4,
            lbl: n.lbl
        }));

        // Directed CFG edges + travelling SSA dataflow tokens
        for (let e = 0; e < EDGES.length; e++) {
            const [u, v] = EDGES[e], p0 = pts[u], p1 = pts[v];
            ctx.strokeStyle = rgba(a, 0.45); ctx.lineWidth = 1.6;
            ctx.beginPath(); ctx.moveTo(p0.x, p0.y); ctx.lineTo(p1.x, p1.y); ctx.stroke();
            const frac = (t * 0.75 + e * 0.23) % 1;
            const tx = p0.x + (p1.x - p0.x) * frac, ty = p0.y + (p1.y - p0.y) * frac;
            ctx.fillStyle = cyan;
            ctx.beginPath(); ctx.arc(tx, ty, 3.6, 0, TAU); ctx.fill();
        }

        // SSA Basic Block cards
        const mob = W <= 900, bw = mob ? Math.min(200, Math.max(134, spanW * 0.46)) : 248, bh = mob ? 30 : 34;
        ctx.font = (mob ? '500 8.5px' : '500 11px') + ' "JetBrains Mono", monospace';
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        pts.forEach((p, idx) => {
            const pulse = 0.5 + 0.5 * Math.sin(t * 3 - idx * 0.9);
            ctx.fillStyle = KW.col.light ? "rgba(255,255,255,0.9)" : "rgba(12,14,22,0.88)";
            ctx.strokeStyle = rgba(a, 0.45 + 0.45 * pulse);
            ctx.lineWidth = 1.5;
            ctx.beginPath(); ctx.rect(p.x - bw / 2, p.y - bh / 2, bw, bh); ctx.fill(); ctx.stroke();
            ctx.fillStyle = rgba(a, 0.98);
            ctx.fillText(p.lbl, p.x, p.y, bw - 10);
        });
    });
};

/* 10. PROJECT: 8bit-computer — 8-Bit TTL Breadboard Computer Bus, Full-Adder ALU & Logic Analyser */
SIMS["8bit-computer"] = (c) => {
    const ctx = c.getContext("2d");
    let W = 0, H = 0, pc = 0, regA = 0x2A, regB = 0x17, carry = 0;
    const OPS = ["LDA 0x0E", "ADD 0x0F", "OUT", "SUB 0x0C", "JC 0x02", "JMP 0x00"];
    KW.fit(c, (w, h, dpr) => { W = w; H = h; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); });
    KW.tag("8-Bit TTL computer · 8-line shared W-Bus, ripple-carry ALU (S = A ⊕ B ⊕ Cin) & logic-analyser trace", c);

    KW.loop(c, (t) => {
        const step = Math.floor(t * 2.5);
        pc = step % OPS.length;
        const busVal = ((step * 37 + 0x2A) & 0xFF);
        regA = (busVal ^ 0x55) & 0xFF;
        const sum = regA + regB;
        carry = sum > 0xFF ? 1 : 0;

        const a = KW.col.a, x0 = W * (W > 900 ? 0.42 : 0.06), x1 = W * 0.94, span = Math.max(x1 - x0, 1);
        const cyan = KW.col.light ? "#0284c7" : "#22d3ee";
        ctx.clearRect(0, 0, W, H);

        // 8 parallel W-Bus bit lines (D7..D0)
        const by0 = H * 0.24, bGap = 11;
        ctx.font = (W > 900 ? '500 10px' : '500 8.5px') + ' "JetBrains Mono", monospace';
        for (let b = 0; b < 8; b++) {
            const bit = (busVal >> (7 - b)) & 1, y = by0 + b * bGap;
            ctx.strokeStyle = bit ? rgba(a, 0.92) : rgba(a, 0.2);
            ctx.lineWidth = bit ? 2.2 : 1;
            ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.stroke();
            if (bit) {
                const px = x0 + ((t * 220 + b * 45) % span);
                ctx.fillStyle = cyan;
                ctx.beginPath(); ctx.arc(px, y, 3, 0, TAU); ctx.fill();
            }
        }

        // TTL Modules: PC, MAR/RAM, Register A, ALU (A ⊕ B ⊕ Cin), IR
        const mods = [
            { name: "PC", val: "0x0" + pc.toString(16).toUpperCase() },
            { name: "REG A", val: "0x" + regA.toString(16).padStart(2, "0").toUpperCase() },
            { name: "ALU Σ", val: "0x" + (sum & 0xFF).toString(16).padStart(2, "0").toUpperCase() + (carry ? " C=1" : " C=0") },
            { name: "IR / CU", val: OPS[pc] }
        ];
        const my = H * 0.54, gap = W > 900 ? 12 : 6, mw = (span - gap * 3) / 4;
        mods.forEach((m, i) => {
            const mx = x0 + i * (mw + gap);
            ctx.fillStyle = KW.col.light ? "rgba(255,255,255,0.9)" : "rgba(12,14,22,0.86)";
            ctx.strokeStyle = rgba(a, 0.7); ctx.lineWidth = 1.4;
            ctx.strokeRect(mx, my, mw, 52); ctx.fillRect(mx, my, mw, 52);
            ctx.fillStyle = rgba(a, 0.98); ctx.textAlign = "center";
            ctx.fillText(m.name, mx + mw / 2, my + 18, mw - 6);
            ctx.fillStyle = cyan;
            ctx.fillText(m.val, mx + mw / 2, my + 36, mw - 6);
        });

        // Bottom: 4-Channel Logic Analyser digital square-wave traces (CLK, W-BUS, ALU_OUT, WE)
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
                    ctx.lineTo(xx, y - prevBit * 11);
                    ctx.lineTo(xx, yy);
                }
            }
            ctx.stroke();
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
        const mw = Math.max(w, 1);
        for (let i = 0; i < 4; i++) {
            const bx1 = ((t * 160 + i * (mw / 4)) % mw);
            const bx2 = (mw - ((t * 160 + i * (mw / 4)) % mw));
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
            ctx.fillStyle = KW.col.light ? rgba(a, 1) : "#fff"; ctx.beginPath(); ctx.arc(ox, oy, 2.2, 0, TAU); ctx.fill();

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
        if (W < 76) return;
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
