/**
 * gpu-cy.js
 *
 * Calabi–Yau cross-section scene: the Fermat curve z1^n + z2^n = 1 in C^2, drawn as a glowing, iridescent,
 * translucent shell that turns through four dimensions as the projection angle alpha sweeps.
 *
 *   - Geometry: welded n^2-patch mesh from CYMath (double precision, built in a Web Worker); the vertex shader
 *     only needs alpha to place every vertex and its normal.
 *   - Rendering: weighted-blended OIT -> resolve -> dust -> depth of field -> GFX.compose (bloom, ACES, grain),
 *     all on the shared GFX WebGL2 context (no context of its own).
 *   - Interaction: click cycles n (5, 6, 7, 8, 3, 4), 600 ms cool-down; the pointer drives alpha by hand.
 *   - Adaptive quality: frame-time moving average with hysteresis lowers the mesh budget and effects, never the maths.
 */

(function (root) {
    "use strict";

    root.SIMS = root.SIMS || {};
    const SIMS = root.SIMS;
    const TAU = Math.PI * 2, ORDER = [5, 6, 7, 8, 3, 4], SUP = "⁰¹²³⁴⁵⁶⁷⁸⁹";
    // Same file URL (and ?v= cache-buster) as this script, so the worker is versioned with it.
    const WORKER_URL = (typeof document !== "undefined" && document.currentScript)
        ? document.currentScript.src.replace(/gpu\/gpu-cy\.js/, "lib/cy-worker.js") : "";

    const rgb2hsl = (r, g, b) => {
        const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
        if (d === 0) return [0, 0, l];
        const s = d / (1 - Math.abs(2 * l - 1));
        const h = mx === r ? ((g - b) / d + 6) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
        return [h / 6, s, l];
    };
    const HSL_N = [0, 8, 4];   // R, G, B offsets of the standard HSL conversion
    const hsl2rgb = (h, s, l, out, o) => {
        const a = s * Math.min(l, 1 - l), hh = ((h % 1) + 1) % 1;
        for (let i = 0; i < 3; i++) {
            const k = (HSL_N[i] + hh * 12) % 12;
            out[o + i] = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
        }
    };

    /** Harmonious palette on the accent: hue fans about +-60 degrees, indexed by (k1 + k2) mod n. */
    const makePalette = (acc, n, out) => {
        const [h, s] = rgb2hsl(acc[0] / 255, acc[1] / 255, acc[2] / 255);
        for (let m = 0; m < 8; m++) {
            const t = (m % n) / n;
            hsl2rgb(h + (t - 0.5) * 0.34, Math.min(1, 0.6 + 0.4 * s), 0.52 + 0.1 * Math.sin(TAU * t), out, m * 3);
        }
    };

    const captionFor = (n, alpha) => {
        const g = (n - 1) * (n - 2) / 2, chi = 3 * n - n * n, sup = String(n).split("").map((c) => SUP[+c]).join("");
        const mid = n === 5 ? "cross-section of the quintic Calabi–Yau threefold" : `Fermat curve of degree ${n}`;
        return `Fermat curve z₁${sup} + z₂${sup} = 1 · ${mid} · ${n * n} patches · genus ${g} (χ = ${chi < 0 ? "−" + (-chi) : chi} for the completed curve; the ${n} ends at infinity are clipped) · projection angle α = ${(((alpha % TAU) + TAU) % TAU).toFixed(2)} rad · click: next n`;
    };

    SIMS["cy-cross-section"] = SIMS["calabi-yau"] = (canvas, params = {}) => {
        const GFX = root.GFX, CY = root.CYMath, S = root.CYShaders, O = root.CYOit;
        const fallback = (c) => (root.ENGINES && root.ENGINES["cy-cross-section-2d"] ? root.ENGINES["cy-cross-section-2d"](c, params) : null);
        if (!GFX || !GFX.supported || !CY || !S || !O) return fallback(canvas);

        return GFX.mount(canvas, (gfx, cvs) => {
            const gl = gfx.gl, KW = root.KW, mob = gfx.isMobile(), reduced = !!(KW && KW.REDUCED);
            const progShell = gfx.program(S.VS_SHELL, S.FS_SHELL);
            const oit = progShell && O.create(gfx, S, mob ? 240 : 700);
            if (!oit) return null;

            const BUDGET = mob ? [80000, 45000, 25000] : [300000, 160000, 80000];
            const ctx2d = canvas.getContext("2d");
            const pal = new Float32Array(24), acc3 = new Float32Array(3), vp = new Float32Array(16);
            const v0 = new Float64Array(4), v1 = new Float64Array(4), v2 = new Float64Array(4);   // view-matrix rows (reused every frame)
            let n = reduced ? 5 : (params.n || 5), alpha = reduced ? 0.7 : (params.alpha ?? 0.7), frozen = reduced;
            let tier = params.tier | 0, tierLocked = params.tier !== undefined, slow = 0, fast = 0, ema = 16, lastNow = performance.now();
            let cur = null, old = null, rw = 2, rh = 2, drawn = false, lastClick = -1e9, lastTag = 0;
            let pulseT0 = -1e9, px = 0, py = 0, worker = null, reqId = 0, builtBudget = 0, disposed = false;

            /* ---------- meshes ---------- */
            const makeMesh = (d) => {
                const vao = gl.createVertexArray(), vbo = gl.createBuffer(), ebo = gl.createBuffer();
                gl.bindVertexArray(vao);
                gl.bindBuffer(gl.ARRAY_BUFFER, vbo); gl.bufferData(gl.ARRAY_BUFFER, d.attr, gl.STATIC_DRAW);
                [[0, 4, 0], [1, 4, 16], [2, 2, 32]].forEach(([i, sz, off]) => {
                    gl.enableVertexAttribArray(i); gl.vertexAttribPointer(i, sz, gl.FLOAT, false, 44, off);
                });
                gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ebo); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, d.indices, gl.STATIC_DRAW);
                gl.bindVertexArray(null);
                return { vao, vbo, ebo, count: d.indices.length, n: d.n, fade: (reduced || !cur) ? 1 : 0 };
            };
            const destroy = (m) => { gl.deleteVertexArray(m.vao); gl.deleteBuffer(m.vbo); gl.deleteBuffer(m.ebo); };

            const install = (d) => {
                if (disposed || d.id !== reqId) return;   // stale result from a superseded request
                const m = makeMesh(d);
                if (old) destroy(old);
                old = cur; cur = m; n = d.n;
                makePalette(KW.col.a, n, pal);
                if (!d.quiet && !reduced) pulseT0 = performance.now() / 1000;
            };
            const buildSync = (r) => {
                const m = CY.buildMesh(r.n, r.na, { gradeA: r.grade, gradeB: r.grade });
                install({ id: r.id, n: r.n, quiet: r.quiet, attr: m.attr, indices: m.indices });
            };
            const request = (nn, budget, quiet) => {
                builtBudget = budget;
                const r = { id: ++reqId, n: nn, na: CY.resolutionForBudget(nn, budget), grade: Math.max(1, Math.round(nn / 2.5)), quiet };
                if (reduced || !worker) return buildSync(r);
                worker.postMessage(r);
            };
            if (!reduced && WORKER_URL && typeof Worker !== "undefined") {
                try {
                    worker = new Worker(WORKER_URL);
                    worker.onmessage = (e) => install(e.data);
                    worker.onerror = () => { worker.terminate(); worker = null; request(n, builtBudget, true); };
                } catch (e) { worker = null; }
            }
            request(n, BUDGET[tier], false);

            /* ---------- interaction ---------- */
            const setN = (nn) => request(nn, BUDGET[tier], false);
            const cycle = () => {
                const now = performance.now();
                if (reduced || now - lastClick < 600) return;
                lastClick = now; setN(ORDER[(ORDER.indexOf(cur ? cur.n : n) + 1) % ORDER.length]);
            };
            if (KW && KW.onClick) KW.onClick(canvas, cycle);
            canvas.__cy = { setN, setAlpha: (a) => { alpha = a; frozen = true; }, setTier: (k) => { tier = k; tierLocked = true; request(cur ? cur.n : n, BUDGET[k], true); }, state: () => ({ n: cur ? cur.n : n, alpha, tier, ema, worker: !!worker, ready: !!cur, fading: !!old }) };

            /* ---------- per-frame ---------- */
            const step = (dt) => {
                const m = KW.local(canvas), r = canvas.getBoundingClientRect();
                const hover = m.x >= 0 && m.x <= r.width && m.y >= 0 && m.y <= r.height;
                if (!reduced) {
                    if (hover) {   // rotate through the fourth dimension by hand (damped, shortest way round)
                        const d = ((m.x / Math.max(1, r.width) * TAU - alpha + 3 * Math.PI) % TAU + TAU) % TAU - Math.PI;
                        alpha += d * Math.min(1, dt * 4); frozen = false;
                    } else if (!frozen) alpha += dt * TAU / 50;   // about 2 pi per 50 s
                }
                const tx = hover ? m.x / Math.max(1, r.width) - 0.5 : 0, ty = hover ? m.y / Math.max(1, r.height) - 0.5 : 0;
                px += (tx - px) * Math.min(1, dt * 3); py += (ty - py) * Math.min(1, dt * 3);
                if (cur && cur.fade < 1) cur.fade = Math.min(1, cur.fade + dt / 1.4);
                if (old) { old.fade -= dt / 0.9; if (old.fade <= 0) { destroy(old); old = null; } }
            };

            const adapt = () => {
                const now = performance.now(), raw = Math.min(100, Math.max(1, now - lastNow));
                lastNow = now; ema += (raw - ema) * 0.08;
                if (tierLocked || reduced || (cur && cur.fade < 1)) return;   // measure only in steady state
                if (ema > 24) { slow++; fast = 0; } else if (ema < 11) { fast++; slow = 0; } else slow = fast = 0;
                const next = slow >= 60 ? tier + 1 : fast >= 240 ? tier - 1 : tier;   // hysteresis: slow to recover
                if (next !== tier && next >= 0 && next < BUDGET.length) {
                    tier = next; slow = fast = 0;
                    if (BUDGET[tier] !== builtBudget) request(cur ? cur.n : n, BUDGET[tier], true);
                }
            };

            const drawMesh = (m) => {
                if (!m) return;
                progShell.f1("uFade", m.fade);
                gl.bindVertexArray(m.vao); gl.drawElements(gl.TRIANGLES, m.count, gl.UNSIGNED_INT, 0);
            };

            const render = (t, outW, outH) => {
                const aspect = rw / rh, D = 8.7 / Math.min(1, aspect), now = performance.now() / 1000;
                const az = 0.35 + t * 0.07 + px * 0.5, el = 0.26 + py * 0.22, ce = Math.cos(el);
                const ex = D * ce * Math.sin(az), ey = D * Math.sin(el), ez = D * ce * Math.cos(az);
                const fx = -ex / D, fy = -ey / D, fz = -ez / D;             // forward; right = f x up(0,1,0)
                let rx = -fz, rz = fx; const rl = Math.hypot(rx, rz); rx /= rl; rz /= rl;
                const ux = -rz * fy, uy = rz * fx - rx * fz, uz = rx * fy;  // up = right x forward
                const f = 1 / Math.tan(0.35), A = -(50.1 / 49.9), B = -(2 * 50 * 0.1 / 49.9);
                v0[0] = rx; v0[2] = rz; v0[3] = -(rx * ex + rz * ez);
                v1[0] = ux; v1[1] = uy; v1[2] = uz; v1[3] = -(ux * ex + uy * ey + uz * ez);
                v2[0] = -fx; v2[1] = -fy; v2[2] = -fz; v2[3] = fx * ex + fy * ey + fz * ez;
                for (let c = 0; c < 4; c++) {
                    vp[c * 4] = f / aspect * v0[c]; vp[c * 4 + 1] = f * v1[c];
                    vp[c * 4 + 2] = A * v2[c] + (c === 3 ? B : 0); vp[c * 4 + 3] = -v2[c];
                }
                const dp = now - pulseT0, amp = dp < 5 ? Math.exp(-dp * 0.8) : 0, a = KW.col.a;
                acc3[0] = a[0] / 255; acc3[1] = a[1] / 255; acc3[2] = a[2] / 255;

                oit.begin();
                progShell.use().mat4("uVP", vp).f3("uCam", ex, ey, ez).f1("uCa", Math.cos(alpha)).f1("uSa", Math.sin(alpha))
                    .f1("uN", cur ? cur.n : n).f1("uTime", t).f1("uPulseR", dp * 4.0).f1("uPulseAmp", amp)
                    .f3("uAccent", acc3[0], acc3[1], acc3[2]);
                gl.uniform3fv(progShell.u("uPal"), pal);
                drawMesh(old); drawMesh(cur);
                gl.bindVertexArray(null);
                const tgt = oit.finish({ vp, time: t, accent: acc3, px: Math.max(1, rh / 700), focus: D, cocScale: 0.22, maxR: 4.0 * rh / 900, dof: tier === 0 });
                gfx.compose(tgt, ctx2d, outW, outH, {
                    bloomGain: (mob ? 0.45 : 0.55) + 0.9 * amp, threshold: 0.6, exposure: 1.05, time: t, accent: a, bloomLevels: tier > 0 ? 3 : undefined
                });
                drawn = true;
            };

            return {
                frame: (t, dt, ctx, outW, outH) => {
                    adapt(); step(dt);
                    render(t, outW, outH);
                    const now = performance.now();
                    if (now - lastTag > 250 && KW.tag) { lastTag = now; KW.tag(captionFor(cur ? cur.n : n, alpha), canvas); }   // at most 4 Hz
                },
                resize: (w, h) => {
                    rw = w; rh = h; oit.resize(w, h);
                    if (reduced && drawn) render(0.5, canvas.width, canvas.height);   // KW.fit cleared the canvas: redraw the one frame
                },
                dispose: () => {
                    disposed = true;
                    if (worker) worker.terminate();
                    if (cur) destroy(cur);
                    if (old) destroy(old);
                    oit.dispose();
                }
            };
        }, fallback);
    };
}(typeof self !== "undefined" ? self : this));
