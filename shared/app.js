/* Shared app logic: theme, rendering from SITE data, GSAP transitions/scroll motion, KaTeX, sim helpers. */
(() => {
    const D = document.documentElement;
    const keys = Object.keys(SITE.domains);
    const REDUCED = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const $ = (s, r = document) => r.querySelector(s);
    const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
    const list = (key) => SITE.projects.filter((p) => p.domain === key);

    /* ---------- helpers used by simulations & nav ---------- */
    const TAU = Math.PI * 2;
    const rgba = (c, a) => (c ? `rgba(${c[0]},${c[1]},${c[2]},${a})` : `rgba(255,255,255,${a})`);
    const randn = () => Math.sqrt(-2 * Math.log(1 - Math.random())) * Math.cos(TAU * Math.random());
    const KW = (window.KW = { REDUCED, mouse: { cx: -1e4, cy: -1e4 }, col: {} });
    KW.refresh = () => {
        const rgb = (n) => getComputedStyle(D).getPropertyValue(n).trim().split(",").map(Number);
        KW.col = { a: rgb("--a"), pal: keys.map((k) => rgb("--rgb-" + k)), light: false };
    };
    KW.local = (c) => { const r = c.getBoundingClientRect(); return { x: KW.mouse.cx - r.left, y: KW.mouse.cy - r.top }; };
    KW.tag = (t, c) => {
        let el = c && c.closest ? c.closest(".snap-section, .hero")?.querySelector(".sim-tag") : null;
        if (!el) el = $(".sim-tag");
        if (el && el.textContent !== t) el.textContent = t;
    };
    KW.onClick = (c, fn) => {
        const sec = (c && c.closest) ? (c.closest(".snap-section, .hero") || c.parentElement) : null;
        const handler = (e) => {
            if (e.target.closest && e.target.closest("a, button, input, select, textarea, [role='button']")) return;
            if (sec && !sec.contains(e.target)) return;
            fn(e);
        };
        window.addEventListener("click", handler);
        const oldDispose = c.__dispose;
        c.__dispose = () => {
            window.removeEventListener("click", handler);
            if (oldDispose) oldDispose();
        };
    };
    KW.fit = (c, cb) => { // size canvas to its parent, call cb(w,h,dpr) now and on every resize
        const p = c.parentElement;
        if (!p) return;
        const f = () => {
            const dpr = Math.min(devicePixelRatio || 1, 2);
            const w = p.clientWidth || 300;
            const h = Math.max(p.clientHeight || 150, 1);
            c.width = Math.round(w * dpr);
            c.height = Math.round(h * dpr);
            cb(w, h, dpr);
        };
        f();
        const ro = new ResizeObserver(f);
        ro.observe(p);
        const oldDispose = c.__dispose;
        c.__dispose = () => {
            try { ro.disconnect(); } catch (e) {}
            if (oldDispose) oldDispose();
        };
    };
    KW.loop = (c, step) => { // rAF loop that pauses off-screen / hidden tab and cleans up when disconnected
        let last = performance.now(), visible = true, frames = 0, dead = false;
        const io = new IntersectionObserver((e) => (visible = e[0].isIntersecting));
        io.observe(c);
        const oldDispose = c.__dispose;
        c.__dispose = () => {
            dead = true;
            try { io.disconnect(); } catch (e) {}
            if (oldDispose) oldDispose();
        };
        const tick = (now) => {
            if (dead) return;
            if (!c.isConnected) { if (c.__dispose) c.__dispose(); return; }
            const dt = Math.min((now - last) / 1000, 0.033); last = now;
            if (visible && !document.hidden) { step(now / 1000, dt); frames++; }
            if (!dead && !(REDUCED && frames > 200)) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
    };
    KW.loadModule = (name) => (window.GFX ? window.GFX.loadModule(name) : Promise.resolve(null));

    addEventListener("pointermove", (e) => { KW.mouse.cx = e.clientX; KW.mouse.cy = e.clientY; }, { passive: true });
    D.addEventListener("mouseleave", () => { KW.mouse.cx = KW.mouse.cy = -1e4; });

    /* ---------- sound synthesiser (Web Audio API) ---------- */
    const SOUND = (() => {
        let ctx = null;
        let enabled = true;
        try {
            const stored = localStorage.getItem("kw_sound");
            if (stored !== null) enabled = stored === "true";
        } catch (e) {}

        let unlocked = false;
        const notifyUnlock = () => window.dispatchEvent(new Event("audiounlock"));

        const init = () => {
            if (!ctx) {
                const AC = window.AudioContext || window.webkitAudioContext;
                if (AC) {
                    try {
                        ctx = new AC();
                        ctx.onstatechange = () => {
                            if (ctx.state === "running") {
                                unlocked = true;
                                notifyUnlock();
                            }
                        };
                    } catch (e) {}
                }
            }
            if (ctx && ctx.state === "suspended") {
                ctx.resume().then(() => {
                    unlocked = true;
                    notifyUnlock();
                }).catch(() => {});
            } else if (ctx && ctx.state === "running") {
                unlocked = true;
                notifyUnlock();
            }
        };

        // Capture-phase gesture listeners guarantee wakeup before any stopPropagation
        ["pointerdown", "touchstart", "touchend", "click", "keydown", "wheel"].forEach((ev) => {
            window.addEventListener(ev, init, { passive: true, capture: true });
        });

        // Resume audio on visibility change / window focus if returning to tab
        document.addEventListener("visibilitychange", () => {
            if (!document.hidden && enabled && ctx && ctx.state === "suspended") init();
        });
        window.addEventListener("focus", () => {
            if (enabled && ctx && ctx.state === "suspended") init();
        });

        let noiseBuf = null;
        const noise = () => {
            if (!ctx) init();
            if (!ctx) return null;
            const sr = ctx.sampleRate || 44100;
            if (!noiseBuf || noiseBuf.sampleRate !== sr) {
                try {
                    noiseBuf = ctx.createBuffer(1, sr, sr);
                    const d = noiseBuf.getChannelData(0);
                    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
                } catch (e) {
                    noiseBuf = null;
                }
            }
            return noiseBuf;
        };

        const withContext = (cb) => {
            if (!enabled) return;
            init();
            if (!ctx) return;
            const run = () => {
                try {
                    const t0 = Math.max(ctx.currentTime || 0, 0) + 0.008;
                    cb(t0);
                } catch (e) {}
            };
            if (ctx.state === "running") {
                run();
            } else {
                ctx.resume().then(() => {
                    unlocked = true;
                    notifyUnlock();
                    run();
                }).catch(() => {});
            }
        };

        const playTone = (freqStart, freqEnd, type, duration, volume) => {
            withContext((t0) => {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                const safeVol = Math.max(volume || 0.16, 0.01);
                const d = Math.max(duration || 0.07, 0.04);
                const tEnd = t0 + d;
                osc.type = type || "sine";
                osc.frequency.setValueAtTime(freqStart, t0);
                if (freqEnd && freqEnd !== freqStart) {
                    osc.frequency.exponentialRampToValueAtTime(Math.max(freqEnd, 20), tEnd);
                }
                gain.gain.setValueAtTime(safeVol, t0);
                gain.gain.exponentialRampToValueAtTime(0.0001, tEnd);
                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.start(t0);
                osc.stop(tEnd + 0.02);
            });
        };

        return {
            isEnabled: () => enabled,
            toggle: () => {
                if (!enabled) {
                    enabled = true;
                    try { localStorage.setItem("kw_sound", "true"); } catch (e) {}
                    init();
                    playTone(520, 880, "triangle", 0.12, 0.24);
                } else {
                    playTone(660, 330, "sine", 0.09, 0.18);
                    enabled = false;
                    try { localStorage.setItem("kw_sound", "false"); } catch (e) {}
                }
                notifyUnlock();
                return enabled;
            },
            hover: () => {
                playTone(1350, 1750, "sine", 0.048, 0.15);
            },
            click: () => {
                playTone(680, 340, "triangle", 0.075, 0.24);
            },
            theme: () => {
                playTone(523, 659, "triangle", 0.08, 0.20);
                setTimeout(() => playTone(659, 1046, "triangle", 0.11, 0.22), 55);
            },
            copy: () => {
                playTone(587, 587, "sine", 0.09, 0.22);
                setTimeout(() => playTone(880, 880, "sine", 0.13, 0.24), 75);
            },
            warp: (pan = 0) => {
                withContext((t0) => {
                    let bus = ctx.destination;
                    if (ctx.createStereoPanner) {
                        try {
                            const p = ctx.createStereoPanner();
                            p.pan.setValueAtTime(pan, t0);
                            p.pan.linearRampToValueAtTime(0, t0 + 0.6);
                            p.connect(ctx.destination);
                            bus = p;
                        } catch (e) { bus = ctx.destination; }
                    }
                    const nb = noise();
                    if (nb) {
                        const src = ctx.createBufferSource();
                        const bp = ctx.createBiquadFilter();
                        const g = ctx.createGain();
                        src.buffer = nb;
                        bp.type = "bandpass";
                        bp.Q.value = 1.2;
                        bp.frequency.setValueAtTime(450, t0);
                        bp.frequency.exponentialRampToValueAtTime(3200, t0 + 0.22);
                        bp.frequency.exponentialRampToValueAtTime(550, t0 + 0.65);
                        g.gain.setValueAtTime(0.0001, t0);
                        g.gain.linearRampToValueAtTime(0.24, t0 + 0.20);
                        g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.70);
                        src.connect(bp);
                        bp.connect(g);
                        g.connect(bus);
                        src.start(t0);
                        src.stop(t0 + 0.75);
                    }
                    const o = ctx.createOscillator();
                    const og = ctx.createGain();
                    o.type = "triangle";
                    o.frequency.setValueAtTime(160, t0);
                    o.frequency.exponentialRampToValueAtTime(420, t0 + 0.22);
                    o.frequency.exponentialRampToValueAtTime(140, t0 + 0.65);
                    og.gain.setValueAtTime(0.0001, t0);
                    og.gain.linearRampToValueAtTime(0.18, t0 + 0.20);
                    og.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.70);
                    o.connect(og);
                    og.connect(bus);
                    o.start(t0);
                    o.stop(t0 + 0.75);
                });
            }
        };
    })();

    const tags = (a) => a.map((t) => `<span class="tag">${t}</span>`).join("");
    const pad = (n) => String(n + 1).padStart(2, "0");

    const projectPage = (p) => {
        const d = SITE.domains[p.domain], sib = list(p.domain), i = sib.indexOf(p);
        const nb = [sib[i - 1], sib[i + 1]].filter(Boolean);
        const comp = {
            "mobius-surfaces": "fourier-spectral",
            "fourier-spectral": "mobius-surfaces",
            "nbody-leapfrog": "split-step-schrodinger",
            "split-step-schrodinger": "nbody-leapfrog",
            "regularised-regression": "spectral-clustering",
            "spectral-clustering": "regularised-regression",
            "options-pricing": "stat-arb",
            "stat-arb": "options-pricing",
            "ku-lang": "math",
            "8bit-computer": "math"
        };
        const mathSim = comp[p.id] || "math";
        const archSim = p.domain === "cs" ? "8bit-computer" : "cs";
        return `
        <nav class="snap-pager" aria-label="Project section navigation">
            <a href="#proj-hero" class="snap-dot active" data-title="00 Project" aria-label="Project Title"><span class="dot-disc"></span><span class="dot-text">00 Project</span></a>
            <a href="#proj-overview" class="snap-dot" data-title="01 Overview" aria-label="Technical Overview"><span class="dot-disc"></span><span class="dot-text">01 Overview</span></a>
            <a href="#proj-arch" class="snap-dot" data-title="02 Architecture" aria-label="Architecture"><span class="dot-disc"></span><span class="dot-text">02 Architecture</span></a>
            <a href="#proj-math" class="snap-dot" data-title="03 Mathematics" aria-label="Mathematics"><span class="dot-disc"></span><span class="dot-text">03 Mathematics</span></a>
            <a href="#proj-nav" class="snap-dot" data-title="04 Navigation" aria-label="Navigation & Related"><span class="dot-disc"></span><span class="dot-text">04 Navigation</span></a>
        </nav>

        <section class="snap-section hero" id="proj-hero" data-domain="${p.domain}" data-sim="project:${p.id}:hero">
            <canvas aria-hidden="true"></canvas>
            <div class="snap-inner">
                <div class="crumbs" data-hero><a href="index.html">Home</a> / <a href="${d.file}">${d.name}</a> / ${p.title}</div>
                <h1 data-hero>${p.title}</h1>
                <p class="lead" data-hero>${p.summary}</p>
                <div class="tags" style="margin-top:14px" data-hero>${tags([p.status, ...p.tags])}</div>
                <div class="snap-jump-pills" data-hero style="margin-top:20px">
                    <a href="#proj-overview" class="pill jump-pill">01 Overview</a>
                    <a href="#proj-arch" class="pill jump-pill">02 Architecture</a>
                    <a href="#proj-math" class="pill jump-pill">03 Mathematics</a>
                    <a href="#proj-nav" class="pill jump-pill">04 Navigation</a>
                </div>
            </div>
            <div class="sim-tag" aria-hidden="true">${(window.SLIDE_SIMS && SLIDE_SIMS[`project:${p.id}:hero`]?.caption) || (window.SIM_TAGS && SIM_TAGS[p.id]) || d.tag}</div>
            <a class="snap-cue" href="#proj-overview">Scroll to overview</a>
        </section>

        <section class="snap-section project-snap" id="proj-overview" data-domain="${p.domain}" data-sim="project:${p.id}:overview">
            <canvas aria-hidden="true"></canvas>
            <div class="snap-inner" style="max-width:880px">
                <h2 class="snap-title" data-reveal style="font-size:clamp(30px, 4.2vw, 52px)">Context &amp; Formulation</h2>
                <div class="snap-overview-card glass" data-reveal>
                    ${p.intro.map((t) => `<p>${t}</p>`).join("")}
                </div>
            </div>
            <div class="sim-tag" aria-hidden="true">${(window.SLIDE_SIMS && SLIDE_SIMS[`project:${p.id}:overview`]?.caption) || (window.SIM_TAGS && SIM_TAGS[p.domain]) || d.tag}</div>
            <a class="snap-cue" href="#proj-arch">Next: Architecture</a>
        </section>

        <section class="snap-section project-snap" id="proj-arch" data-domain="${p.domain}" data-sim="project:${p.id}:arch">
            <canvas aria-hidden="true"></canvas>
            <div class="snap-inner" style="max-width:960px">
                <h2 class="snap-title" data-reveal style="font-size:clamp(30px, 4.2vw, 52px)">System Pipeline</h2>
                <ol class="snap-arch-grid" data-reveal>
                    ${p.arch.map(([n, t]) => `<li class="glass"><strong>${n}</strong><span>${t}</span></li>`).join("")}
                </ol>
            </div>
            <div class="sim-tag" aria-hidden="true">${(window.SLIDE_SIMS && SLIDE_SIMS[`project:${p.id}:arch`]?.caption) || (window.SIM_TAGS && SIM_TAGS[archSim]) || "System architecture & pipeline graph"}</div>
            <a class="snap-cue" href="#proj-math">Next: Mathematics</a>
        </section>

        <section class="snap-section project-snap" id="proj-math" data-domain="${p.domain}" data-sim="project:${p.id}:math">
            <canvas aria-hidden="true"></canvas>
            <div class="snap-inner" style="max-width:960px">
                <h2 class="snap-title" data-reveal style="font-size:clamp(30px, 4.2vw, 52px)">Analytical &amp; Numerical Formulations</h2>
                <div class="snap-math-grid" data-reveal>
                    ${p.math.map((m) => `
                    <div class="math-block glass">
                        <h3>${m.h}</h3>
                        ${m.p ? `<p>${m.p}</p>` : ""}
                        <div class="eq">$$${m.eq}$$</div>
                        ${m.after ? `<p>${m.after}</p>` : ""}
                    </div>`).join("")}
                </div>
            </div>
            <div class="sim-tag" aria-hidden="true">${(window.SLIDE_SIMS && SLIDE_SIMS[`project:${p.id}:math`]?.caption) || (window.SIM_TAGS && SIM_TAGS[mathSim]) || "Analytical formulation & numerical foundations"}</div>
            <a class="snap-cue" href="#proj-nav">Next: Navigation</a>
        </section>

        <section class="snap-section about-contact-section" id="proj-nav" data-domain="${p.domain}" data-sim="project:${p.id}:nav">
            <canvas aria-hidden="true"></canvas>
            <div class="snap-inner" style="max-width:960px">
                <div class="section-head" data-reveal><span class="idx">04</span><h2>Related Work &amp; Source Code</h2></div>
                <p class="lead" data-reveal>Explore other technical deep-dives in ${d.name} or navigate back to the domain index.</p>
                <div class="pn snap-nav-grid" data-reveal>
                    ${nb.map((n) => `
                    <a class="card glass" href="project.html?p=${n.id}">
                        <span class="no">${n === sib[i - 1] ? "← Previous" : "Next →"}</span>
                        <h3>${n.title}</h3>
                        <p>${n.summary}</p>
                        <span class="go">Open deep-dive</span>
                    </a>`).join("")}
                </div>
                <div class="pills" data-reveal style="margin-top:24px">
                    <a class="pill" href="${d.file}">← All ${d.name} projects</a>
                    <a class="pill" href="index.html">← Back to Hub</a>
                </div>
            </div>
            <div class="sim-tag" aria-hidden="true">${(window.SLIDE_SIMS && SLIDE_SIMS[`project:${p.id}:nav`]?.caption) || "Related project navigation & domain links"}</div>
        </section>`;
    };

    /* ---------- research paper detail page template ---------- */
    const paperDetailPage = (p) => {
        const d = SITE.domains[p.domain] || { name: "Data Science", file: "datascience.html" };
        const papers = SITE.papers || [];
        const i = papers.findIndex((x) => x.id === p.id);
        const prev = i > 0 ? papers[i - 1] : null;
        const next = i >= 0 && i < papers.length - 1 ? papers[i + 1] : null;
        return `
        <nav class="snap-pager" aria-label="Paper section navigation">
            <a href="#paper-hero" class="snap-dot active" data-title="00 Overview" aria-label="Paper Overview"><span class="dot-disc" style="--a:var(--rgb-papers)"></span><span class="dot-text">00 Overview</span></a>
            <a href="#paper-theory" class="snap-dot" data-title="01 Theory &amp; Proofs" aria-label="Theory and Proofs"><span class="dot-disc" style="--a:var(--rgb-papers)"></span><span class="dot-text">01 Theory &amp; Proofs</span></a>
            <a href="#paper-cite" class="snap-dot" data-title="02 Citation &amp; Sibling Papers" aria-label="Citation and Sibling Papers"><span class="dot-disc" style="--a:var(--rgb-papers)"></span><span class="dot-text">02 Citation &amp; Siblings</span></a>
        </nav>

        <section class="snap-section hero" id="paper-hero" data-domain="papers" data-sim="paper:${p.id}:hero" style="--a:var(--rgb-papers)">
            <canvas aria-hidden="true"></canvas>
            <div class="snap-inner" style="max-width:980px">
                <div class="crumbs" data-hero><a href="index.html">Home</a> / <a href="papers.html">Research Papers</a> / <span>${p.short || p.title}</span></div>
                <h1 data-hero style="font-size:clamp(24px, 3.2vw, 42px);line-height:1.2;max-width:980px">${p.title}</h1>
                <div class="paper-meta" data-hero>
                    <span class="venue">${p.venue}</span>
                    <span>·</span>
                    <span>${p.authors}</span>
                    <span class="tag-status">${p.status}</span>
                </div>
                <div class="snap-overview-card glass" data-hero style="padding:20px 26px;margin-top:14px;max-width:980px">
                    <div class="paper-section-tag" style="margin-bottom:8px">Executive Abstract</div>
                    <p style="font-size:15px;line-height:1.75;color:var(--fg);margin:0">${p.abstract}</p>
                </div>
                <div class="snap-actions" data-hero style="margin-top:16px">
                    <a href="#paper-theory" class="snap-cta-btn glass" style="--a:var(--rgb-papers)">
                        <span>Inspect Mathematical Formulation &amp; Proofs</span>
                        <span class="arr">↓</span>
                    </a>
                    <button type="button" class="copy-btn pill" data-copy="${p.bibtex.replace(/"/g, '&quot;')}" aria-label="Copy BibTeX Citation">
                        <span class="copy-icon">⎘</span> <span class="copy-text">Copy BibTeX</span>
                    </button>
                    <a href="papers.html" class="pill">← All Papers</a>
                </div>
            </div>
            <div class="sim-tag" aria-hidden="true">${(window.SLIDE_SIMS && SLIDE_SIMS[`paper:${p.id}:hero`]?.caption) || (window.SIM_TAGS && window.SECTION_SIMS && SIM_TAGS[SECTION_SIMS["paper:" + p.id]]) || "Fokker–Planck Langevin diffusion · ∂p/∂t = ∇·(∇V p + D∇p) · Kramers double-well escape"}</div>
            <a class="snap-cue" href="#paper-theory">Next: Formulation &amp; Proofs</a>
        </section>

        <section class="snap-section project-snap" id="paper-theory" data-domain="papers" data-sim="paper:${p.id}:theory" style="--a:var(--rgb-papers)">
            <canvas aria-hidden="true"></canvas>
            <div class="snap-inner" style="max-width:980px">
                <h2 class="snap-title" data-reveal style="font-size:clamp(24px, 3.2vw, 42px)">Analytical Model &amp; Core Contributions</h2>
                <div class="snap-overview-card glass" data-reveal style="padding:20px 26px;max-width:980px">
                    <div class="paper-section-tag" style="margin-bottom:6px">Governing Analytical Model · ${p.venue}</div>
                    <div class="hero-eq glass snap-eq" style="align-self:stretch;padding:14px 20px;margin:8px 0;font-size:1.05rem">$$${p.eq}$$</div>
                    <p style="color:var(--muted);font-size:13.5px;margin:4px 0 0">Continuous-time formulation derived in <strong>${p.venue}</strong> (${p.year}), proving asymptotic convergence and spectral bounds.</p>
                </div>
                <ol class="snap-arch-grid" data-reveal style="max-width:980px;margin-top:16px">
                    ${p.highlights.map(([n, t]) => `<li class="glass"><strong>${n}</strong><span>${t}</span></li>`).join("")}
                </ol>
            </div>
            <div class="sim-tag" aria-hidden="true">${(window.SLIDE_SIMS && SLIDE_SIMS[`paper:${p.id}:theory`]?.caption) || (window.SIM_TAGS && SIM_TAGS[p.domain]) || "Foundational theoretical formulation"}</div>
            <a class="snap-cue" href="#paper-cite">Next: Citation &amp; Related Papers</a>
        </section>

        <section class="snap-section about-contact-section" id="paper-cite" data-domain="papers" data-sim="paper:${p.id}:cite" style="--a:var(--rgb-papers)">
            <canvas aria-hidden="true"></canvas>
            <div class="snap-inner" style="max-width:980px">
                <div class="section-head" data-reveal><span class="idx">02</span><h2>Citation, Code &amp; Sibling Papers</h2></div>
                <p class="lead" data-reveal style="margin-bottom:16px">Official academic reference citation for LaTeX publications, along with sibling deep-dives across research domains.</p>
                <div class="contact-card glass" data-reveal style="padding:22px 28px;max-width:980px">
                    <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px">
                        <span class="contact-status"><span class="status-dot"></span> BibTeX Citation Record · LaTeX</span>
                        <button type="button" class="copy-btn snap-cta-btn glass" style="--a:var(--rgb-papers)" data-copy="${p.bibtex.replace(/"/g, '&quot;')}" aria-label="Copy BibTeX Citation">
                            <span class="copy-icon">⎘</span> <span class="copy-text">Copy BibTeX</span>
                        </button>
                    </div>
                    <pre class="eq glass" style="padding:14px 18px;border-radius:10px;font-family:var(--mono);font-size:12px;color:var(--fg);overflow-x:auto;white-space:pre;margin:10px 0"><code>${p.bibtex}</code></pre>
                    <div class="pn snap-nav-grid" style="margin-top:14px;margin-bottom:14px">
                        ${prev ? `
                        <a class="card glass" href="paper.html?p=${prev.id}">
                            <span class="no">← Previous Paper</span>
                            <h3 style="font-size:15px;line-height:1.25">${prev.title}</h3>
                            <p style="font-size:12.5px">${prev.summary}</p>
                            <span class="go">Read paper deep-dive</span>
                        </a>` : ""}
                        ${next ? `
                        <a class="card glass" href="paper.html?p=${next.id}">
                            <span class="no">Next Paper →</span>
                            <h3 style="font-size:15px;line-height:1.25">${next.title}</h3>
                            <p style="font-size:12.5px">${next.summary}</p>
                            <span class="go">Read paper deep-dive</span>
                        </a>` : ""}
                    </div>
                    <div class="pills" style="margin-top:14px">
                        <a class="pill" href="papers.html">← All Research Papers</a>
                        <a class="pill" href="${d.file}">Explore ${d.name} Domain →</a>
                        <a class="pill" href="index.html">← Back to Hub</a>
                    </div>
                </div>
            </div>
            <div class="sim-tag" aria-hidden="true">${(window.SLIDE_SIMS && SLIDE_SIMS[`paper:${p.id}:cite`]?.caption) || (window.SIM_TAGS && SIM_TAGS["papers"]) || "Poincaré hyperbolic disc · ds² = 4|dz|²/(1 − |z|²)² · conformal Möbius citation geodesics"}</div>
        </section>`;
    };

    /* ---------- chrome: sound controls ---------- */
    const chrome = () => {
        const soundBtn = $(".sound-btn");
        if (soundBtn) {
            const syncSound = () => {
                const on = SOUND.isEnabled();
                soundBtn.textContent = on ? "🔊" : "🔇";
                soundBtn.setAttribute("aria-label", on ? "Mute sound effects" : "Enable sound effects");
                soundBtn.title = on ? "Mute audio" : "Enable audio";
                soundBtn.classList.toggle("muted", !on);
            };
            syncSound();
            window.addEventListener("audiounlock", syncSound);
            soundBtn.addEventListener("click", (e) => {
                e.preventDefault();
                e.stopPropagation();
                SOUND.toggle();
                syncSound();
            });
        }
    };

    /* ---------- motion: native scroll-triggered reveals and progress ---------- */
    let revealIO = null;
    const observeReveals = () => {
        if (revealIO) revealIO.disconnect();
        // Always immediately reveal hero elements in the active/hero section so they never stay blank
        document.querySelectorAll(".snap-section:first-of-type [data-hero], .snap-section.hero [data-hero], [data-hero]").forEach((el) => el.classList.add("revealed"));
        if (REDUCED) {
            document.querySelectorAll("[data-reveal]").forEach((el) => el.classList.add("revealed"));
            return;
        }
        revealIO = new IntersectionObserver((entries) => {
            entries.forEach((e) => {
                if (e.isIntersecting) {
                    e.target.classList.add("revealed");
                    revealIO.unobserve(e.target);
                }
            });
        }, { threshold: 0.05 });
        document.querySelectorAll("[data-reveal]").forEach((el) => revealIO.observe(el));
    };

    /* ---------- snap observer & native scroll navigation ---------- */
    let snapAbort = null, snapIO = null;
    const setupSnapObserver = () => {
        if (snapAbort) snapAbort.abort();
        if (snapIO) snapIO.disconnect();
        snapAbort = new AbortController();
        const sig = snapAbort.signal;

        const sections = Array.from(document.querySelectorAll(".snap-section"));
        if (!sections.length) return;

        const dots = document.querySelectorAll(".snap-dot");
        let curIdx = 0;
        const initialIdx = sections.findIndex((s) => {
            const r = s.getBoundingClientRect();
            return r.top >= -window.innerHeight * 0.45 && r.top < window.innerHeight * 0.55;
        });
        if (initialIdx !== -1) curIdx = initialIdx;
        let lastId = sections[curIdx] ? sections[curIdx].id : null;

        const scrollToSection = (idx) => {
            if (idx < 0 || idx >= sections.length) return;
            curIdx = idx;
            sections[idx].scrollIntoView({ behavior: REDUCED ? "instant" : "smooth" });
        };

        // Pointer drag for horizontal course grids
        $$(".course-grid").forEach((grid) => {
            let isDown = false, startX = 0, scrollStart = 0;
            grid.addEventListener("pointerdown", (e) => {
                if (e.target.closest("a, button")) return;
                isDown = true;
                startX = e.clientX;
                scrollStart = grid.scrollLeft;
                grid.setPointerCapture(e.pointerId);
            }, { signal: sig });
            grid.addEventListener("pointermove", (e) => {
                if (!isDown) return;
                grid.scrollLeft = scrollStart - (e.clientX - startX);
            }, { signal: sig });
            const stop = () => { isDown = false; };
            grid.addEventListener("pointerup", stop, { signal: sig });
            grid.addEventListener("pointercancel", stop, { signal: sig });
        });

        // Keyboard navigation
        window.addEventListener("keydown", (e) => {
            if (e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
            if (e.key === "ArrowDown" || e.key === "PageDown") {
                if (curIdx < sections.length - 1) {
                    e.preventDefault();
                    scrollToSection(curIdx + 1);
                }
            } else if (e.key === "ArrowUp" || e.key === "PageUp") {
                if (curIdx > 0) {
                    e.preventDefault();
                    scrollToSection(curIdx - 1);
                }
            }
        }, { signal: sig });

        // In-page hash link clicks
        document.addEventListener("click", (e) => {
            const a = e.target.closest && e.target.closest('a[href^="#"]');
            if (!a) return;
            const hash = a.getAttribute("href");
            if (!hash || hash === "#") return;
            const target = document.querySelector(hash);
            if (target && target.classList.contains("snap-section")) {
                const idx = sections.indexOf(target);
                if (idx !== -1) {
                    e.preventDefault();
                    scrollToSection(idx);
                }
            }
        }, { signal: sig });

        // Track active section for theme, dots, and sound
        snapIO = new IntersectionObserver((entries) => {
            entries.forEach((entry) => {
                if (entry.isIntersecting) {
                    const id = entry.target.id;
                    const idx = sections.indexOf(entry.target);
                    if (idx !== -1) curIdx = idx;
                    const d = entry.target.dataset.domain;
                    if (d && D.dataset.domain !== d) {
                        D.dataset.domain = d;
                        KW.refresh();
                        window.dispatchEvent(new Event("themechange"));
                    }
                    dots.forEach((dot) => {
                        const href = dot.getAttribute("href");
                        dot.classList.toggle("active", href === "#" + id);
                    });
                    if (lastId !== null && lastId !== id) {
                        SOUND.warp(0);
                    }
                    lastId = id;
                }
            });
        }, { threshold: 0.5 });

        sections.forEach((s) => snapIO.observe(s));
    };

    /* ---------- Page Initialization & Simulation Binding ---------- */
    KW.refresh();
    chrome();
    const main = $("#main");

    /* ---------- live navbar canvas animation ---------- */
    const NAV_INPUT = {
        x: 0.5, y: 0.5,
        canvasX: -1000, canvasY: -1000,
        inNav: false,
        brandHover: false,
        clickImpulse: 0
    };

    if (typeof window !== "undefined") {
        window.addEventListener("pointermove", (e) => {
            NAV_INPUT.x = e.clientX / Math.max(window.innerWidth, 1);
            NAV_INPUT.y = e.clientY / Math.max(window.innerHeight, 1);
            const navEl = $(".nav-live");
            if (navEl) {
                const r = navEl.getBoundingClientRect();
                NAV_INPUT.canvasX = e.clientX - r.left;
                NAV_INPUT.canvasY = e.clientY - r.top;
                NAV_INPUT.inNav = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
            }
        }, { passive: true });

        window.addEventListener("pointerdown", (e) => {
            const navEl = $(".nav-live");
            if (navEl) {
                const r = navEl.getBoundingClientRect();
                if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) {
                    NAV_INPUT.clickImpulse = 1.0;
                }
            }
        }, { passive: true });

        document.addEventListener("pointerenter", (e) => {
            if (e.target && e.target.closest && e.target.closest(".brand")) {
                NAV_INPUT.brandHover = true;
            }
        }, true);

        document.addEventListener("pointerleave", (e) => {
            if (e.target && e.target.closest && e.target.closest(".brand")) {
                NAV_INPUT.brandHover = false;
            }
        }, true);
    }

const NAV = {};
const navFade = (ctx, w, h, left) => { // feather the strip's edges into the glass navbar
    ctx.save();
    ctx.globalCompositeOperation = "destination-in";
    const g = ctx.createLinearGradient(0, 0, w, 0);
    g.addColorStop(0, left ? "rgba(0,0,0,0)" : "#000"); g.addColorStop(0.04, "#000");
    g.addColorStop(0.96, "#000"); g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    ctx.restore();
};

// Hero: Dynamic Phase Space / Strange Attractor Tracer with sensitive dependence & brand bifurcation
NAV.hub = () => {
    let x = 0.1, y = 0.0, z = 0.0;
    const sigma = 10, beta = 8 / 3;
    const TRAIL_MAX = 130;
    const trail = [];
    let collapse = 0;
    let bifurcateTimer = 0;
    let wasBrandHover = false;

    const rk4Step = (dtStep, rhoVal) => {
        const dx = (cx, cy, cz) => sigma * (cy - cx);
        const dy = (cx, cy, cz) => cx * (rhoVal - cz) - cy;
        const dz = (cx, cy, cz) => cx * cy - beta * cz;

        const k1x = dx(x, y, z), k1y = dy(x, y, z), k1z = dz(x, y, z);
        const k2x = dx(x + 0.5 * dtStep * k1x, y + 0.5 * dtStep * k1y, z + 0.5 * dtStep * k1z);
        const k2y = dy(x + 0.5 * dtStep * k1x, y + 0.5 * dtStep * k1y, z + 0.5 * dtStep * k1z);
        const k2z = dz(x + 0.5 * dtStep * k1x, y + 0.5 * dtStep * k1y, z + 0.5 * dtStep * k1z);
        const k3x = dx(x + 0.5 * dtStep * k2x, y + 0.5 * dtStep * k2y, z + 0.5 * dtStep * k2z);
        const k3y = dy(x + 0.5 * dtStep * k2x, y + 0.5 * dtStep * k2y, z + 0.5 * dtStep * k2z);
        const k3z = dz(x + 0.5 * dtStep * k2x, y + 0.5 * dtStep * k2y, z + 0.5 * dtStep * k2z);
        const k4x = dx(x + dtStep * k3x, y + dtStep * k3y, z + dtStep * k3z);
        const k4y = dy(x + dtStep * k3x, y + dtStep * k3y, z + dtStep * k3z);
        const k4z = dz(x + dtStep * k3x, y + dtStep * k3y, z + dtStep * k3z);

        x += (dtStep / 6) * (k1x + 2 * k2x + 2 * k3x + k4x);
        y += (dtStep / 6) * (k1y + 2 * k2y + 2 * k3y + k4y);
        z += (dtStep / 6) * (k1z + 2 * k2z + 2 * k3z + k4z);
    };

    return (ctx, w, h, t, dt) => {
        const a = KW.col.a;
        const mid = h / 2;
        const x0 = 12;
        const x1 = w - 12;
        const trackW = x1 - x0;
        if (trackW < 30) return;

        // Detect brand hover state transitions
        if (NAV_INPUT.brandHover && !wasBrandHover) {
            wasBrandHover = true;
        } else if (!NAV_INPUT.brandHover && wasBrandHover) {
            wasBrandHover = false;
            bifurcateTimer = 1.0; // Trigger bifurcation burst outward
        }

        if (NAV_INPUT.brandHover) {
            collapse = Math.min(1, collapse + dt * 4.5);
        } else {
            collapse = Math.max(0, collapse - dt * 3.0);
        }

        if (bifurcateTimer > 0) {
            bifurcateTimer = Math.max(0, bifurcateTimer - dt * 1.8);
        }

        // Sensitive dependence: cursor modulates Rayleigh number rho
        const cursorPerturb = (NAV_INPUT.x - 0.5) * 12;
        const rho = 28 + cursorPerturb;

        // Run RK4 micro-steps
        for (let s = 0; s < 3; s++) {
            rk4Step(0.012, rho);
            trail.push({ x, y, z });
            if (trail.length > TRAIL_MAX) trail.shift();
        }

        // Mapping Lorenz coordinates into canvas track
        const centreX = x0 + trackW * 0.5;
        const scaleX = (trackW * 0.44) / 22;
        const scaleY = (h * 0.38) / 24;

        ctx.save();
        ctx.lineWidth = 1.2;

        if (trail.length > 2) {
            for (let i = 1; i < trail.length; i++) {
                const frac = i / trail.length;
                const p0 = trail[i - 1], p1 = trail[i];

                const c0x = p0.x * (1 - collapse);
                const c0z = 27 + (p0.z - 27) * (1 - collapse);
                const c1x = p1.x * (1 - collapse);
                const c1z = 27 + (p1.z - 27) * (1 - collapse);

                const sx0 = centreX + c0x * scaleX;
                const sy0 = mid - (c0z - 27) * scaleY;
                const sx1 = centreX + c1x * scaleX;
                const sy1 = mid - (c1z - 27) * scaleY;

                ctx.strokeStyle = rgba(a, frac * 0.85 * (1 - collapse * 0.5));
                ctx.beginPath();
                ctx.moveTo(sx0, sy0);
                ctx.lineTo(sx1, sy1);
                ctx.stroke();

                if (bifurcateTimer > 0) {
                    const bFrac = bifurcateTimer;
                    const bx0 = centreX - c0x * scaleX * (1 + bFrac * 0.6);
                    const by0 = mid - (c0z - 27) * scaleY * (1 + bFrac * 0.4);
                    const bx1 = centreX - c1x * scaleX * (1 + bFrac * 0.6);
                    const by1 = mid - (c1z - 27) * scaleY * (1 + bFrac * 0.4);

                    ctx.strokeStyle = rgba(KW.col.pal[1] || a, frac * bFrac * 0.9);
                    ctx.beginPath();
                    ctx.moveTo(bx0, by0);
                    ctx.lineTo(bx1, by1);
                    ctx.stroke();
                }
            }

            const head = trail[trail.length - 1];
            const hx = centreX + head.x * (1 - collapse) * scaleX;
            const hy = mid - (head.z - 27) * (1 - collapse) * scaleY;

            ctx.fillStyle = rgba(a, 0.95);
            ctx.beginPath();
            ctx.arc(hx, hy, collapse > 0.5 ? 3.2 : 2.2, 0, TAU);
            ctx.fill();

            if (collapse > 0.1) {
                ctx.strokeStyle = rgba(a, collapse * 0.7);
                ctx.beginPath();
                ctx.arc(centreX, mid, 4 + (1 - collapse) * 6, 0, TAU);
                ctx.stroke();
            }
        }
        ctx.restore();
    };
};
NAV.contact = NAV.hub;

// Mathematics: Calabi-Yau Cross-Section Morph & Riemann Curvature with metric contraction
NAV.math = () => {
    return (ctx, w, h, t) => {
        const a = KW.col.a;
        const b = KW.col.pal[1] || [129, 140, 248];
        const mid = h / 2;
        const R = h * 0.36;
        const x0 = 12;
        const x1 = w - 12;
        const trackW = x1 - x0;
        if (trackW < 40) return;

        const k = TAU / Math.max(trackW / 2.5, 90);
        const omega = 2.2;
        const phi = t * 1.6;
        const mouseX = NAV_INPUT.inNav ? NAV_INPUT.canvasX : (w * NAV_INPUT.x);

        ctx.save();
        const step = 6;
        for (let x = x0; x <= x1; x += step) {
            const dx = x - mouseX;
            const contraction = Math.exp(-(dx * dx) / (2 * 45 * 45));
            const warpedX = x - dx * 0.48 * contraction;

            const y1 = mid - R * Math.sin(k * (x - x0) - omega * t);
            const y2 = mid - R * Math.cos(k * (x - x0) + phi);

            const ribIntensity = 0.18 + 0.55 * contraction;
            ctx.strokeStyle = rgba(a, ribIntensity);
            ctx.lineWidth = 1 + contraction * 0.8;
            ctx.beginPath();
            ctx.moveTo(warpedX, y1);
            ctx.lineTo(warpedX, y2);
            ctx.stroke();

            if (contraction > 0.4) {
                ctx.fillStyle = rgba(b, contraction * 0.9);
                ctx.beginPath();
                ctx.arc(warpedX, y1, 1.3, 0, TAU);
                ctx.arc(warpedX, y2, 1.3, 0, TAU);
                ctx.fill();
            }
        }

        const drawWave = (fn, isPsi1, col) => {
            ctx.strokeStyle = col;
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            for (let x = x0; x <= x1; x += 2) {
                const dx = x - mouseX;
                const contraction = Math.exp(-(dx * dx) / (2 * 45 * 45));
                const warpedX = x - dx * 0.48 * contraction;
                const arg = isPsi1 ? (k * (x - x0) - omega * t) : (k * (x - x0) + phi);
                const y = mid - R * fn(arg);
                x === x0 ? ctx.moveTo(warpedX, y) : ctx.lineTo(warpedX, y);
            }
            ctx.stroke();
        };

        drawWave(Math.cos, false, rgba(b, 0.85));
        drawWave(Math.sin, true, rgba(a, 0.95));

        if (mouseX >= x0 && mouseX <= x1) {
            ctx.strokeStyle = rgba(a, 0.45);
            ctx.setLineDash([2, 3]);
            ctx.beginPath();
            ctx.moveTo(mouseX, mid - R - 2);
            ctx.lineTo(mouseX, mid + R + 2);
            ctx.stroke();
            ctx.setLineDash([]);
        }
        ctx.restore();
    };
};

// Physics: Gravitational Lensing & Geodesic Deviation with hyperbolic deflection around mass
NAV.physics = () => {
    let massX = -1, massY = -1;
    return (ctx, w, h, t, dt) => {
        const a = KW.col.a;
        const mid = h / 2;
        const x0 = 12;
        const x1 = w - 12;
        const trackW = x1 - x0;
        if (trackW < 40) return;

        const targetMassX = NAV_INPUT.inNav ? Math.max(x0 + 20, Math.min(x1 - 20, NAV_INPUT.canvasX)) : (x0 + trackW * 0.52);
        const targetMassY = NAV_INPUT.inNav ? Math.max(4, Math.min(h - 4, NAV_INPUT.canvasY)) : mid;

        if (massX < 0) { massX = targetMassX; massY = targetMassY; }
        else {
            massX += (targetMassX - massX) * Math.min(1, dt * 7);
            massY += (targetMassY - massY) * Math.min(1, dt * 7);
        }

        ctx.save();

        const rSchw = 4.2;
        ctx.fillStyle = "#020408";
        ctx.beginPath();
        ctx.arc(massX, massY, rSchw, 0, TAU);
        ctx.fill();

        const ringPulse = 0.75 + 0.25 * Math.sin(t * 3.5);
        ctx.strokeStyle = rgba(a, 0.85 * ringPulse);
        ctx.lineWidth = 1.3;
        ctx.beginPath();
        ctx.arc(massX, massY, rSchw + 1.8, 0, TAU);
        ctx.stroke();

        ctx.strokeStyle = rgba(a, 0.22);
        ctx.beginPath();
        ctx.ellipse(massX, massY, rSchw + 5.5, rSchw + 2.8, 0, 0, TAU);
        ctx.stroke();

        const rayCount = 7;
        const raySpan = h * 0.76;
        const rayStep = raySpan / (rayCount - 1);
        const rayBaseY0 = mid - raySpan / 2;

        for (let r = 0; r < rayCount; r++) {
            const yBase = rayBaseY0 + r * rayStep;
            const impactB = yBase - massY;
            const absB = Math.max(Math.abs(impactB), 2.5);

            ctx.lineWidth = r === Math.floor(rayCount / 2) ? 1.4 : 1.0;
            ctx.strokeStyle = rgba(a, 0.35 + (1 - Math.abs(r - 3) / 3) * 0.45);
            ctx.beginPath();

            const xStep = 3;
            for (let x = x0; x <= x1; x += xStep) {
                const dx = x - massX;
                const r2 = dx * dx + absB * absB;
                const deflection = (160 * impactB) / (r2 + 40);
                const y = yBase - deflection;

                x === x0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
            }
            ctx.stroke();

            const photonProgress = ((t * 0.45 + r * 0.16) % 1);
            const px = x0 + trackW * photonProgress;
            const pdx = px - massX;
            const pr2 = pdx * pdx + absB * absB;
            const py = yBase - (160 * impactB) / (pr2 + 40);

            ctx.fillStyle = "rgba(255, 255, 255, 0.95)";
            ctx.beginPath();
            ctx.arc(px, py, 1.5, 0, TAU);
            ctx.fill();
        }

        ctx.restore();
    };
};

// Data Science: Stochastic Diffusion / Denoising SDE Waveform from noise to clean density
NAV.datascience = () => {
    let noisePulsePos = -100;
    let noisePulseAmp = 0;

    return (ctx, w, h, t, dt) => {
        const a = KW.col.a;
        const mid = h / 2;
        const R = h * 0.38;
        const x0 = 12;
        const x1 = w - 12;
        const trackW = x1 - x0;
        if (trackW < 40) return;

        if (NAV_INPUT.clickImpulse > 0) {
            noisePulseAmp = 1.0;
            noisePulsePos = NAV_INPUT.inNav ? (NAV_INPUT.canvasX - x0) / trackW : 0;
            NAV_INPUT.clickImpulse = 0;
        } else if (NAV_INPUT.inNav && noisePulseAmp < 0.2) {
            noisePulseAmp = 0.55;
            noisePulsePos = (NAV_INPUT.canvasX - x0) / trackW;
        }

        if (noisePulseAmp > 0.01) {
            noisePulseAmp *= Math.exp(-dt * 2.4);
            noisePulsePos += dt * 0.7;
        }

        ctx.save();
        ctx.strokeStyle = rgba(a, 0.92);
        ctx.lineWidth = 1.4;
        ctx.beginPath();

        const xStep = 2;
        for (let x = x0; x <= x1; x += xStep) {
            const s = (x - x0) / trackW;

            const n1 = Math.sin(x * 0.65 + t * 14.0) * Math.cos(x * 1.3 - t * 9.0);
            const n2 = Math.sin(x * 1.85 + t * 22.0) * 0.5;
            const rawNoise = (n1 + n2) * 0.8;

            const noiseStd = Math.pow(1 - s, 1.8);

            const g1 = Math.exp(-Math.pow(s - 0.70, 2) / (2 * 0.05 * 0.05));
            const g2 = Math.exp(-Math.pow(s - 0.88, 2) / (2 * 0.04 * 0.04));
            const cleanTarget = (0.65 * g1 + 0.45 * g2) * 1.6 - 0.25;

            const pulseDist = Math.abs(s - noisePulsePos);
            const pulseShock = noisePulseAmp * Math.exp(-Math.pow(pulseDist, 2) / (2 * 0.08 * 0.08)) * Math.sin(x * 1.2 + t * 18);

            const yVal = (rawNoise * noiseStd) + (cleanTarget * Math.pow(s, 1.4)) + pulseShock;
            const y = mid - R * Math.max(-1.1, Math.min(1.1, yVal));

            x === x0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }
        ctx.stroke();

        ctx.strokeStyle = rgba(a, 0.20);
        ctx.lineWidth = 1.0;
        ctx.setLineDash([2, 3]);

        ctx.beginPath();
        for (let x = x0; x <= x1; x += 4) {
            const s = (x - x0) / trackW;
            const env = Math.pow(1 - s, 1.6) * 0.85;
            const y = mid - R * env;
            x === x0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }
        ctx.stroke();

        ctx.beginPath();
        for (let x = x0; x <= x1; x += 4) {
            const s = (x - x0) / trackW;
            const env = Math.pow(1 - s, 1.6) * 0.85;
            const y = mid + R * env;
            x === x0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }
        ctx.stroke();
        ctx.setLineDash([]);

        if (trackW > 160) {
            ctx.fillStyle = rgba(a, 0.55);
            ctx.font = '500 7px "JetBrains Mono", monospace';
            ctx.fillText("NOISE (t=1)", x0 + 4, mid + R + 1);
            ctx.textAlign = "right";
            ctx.fillText("DENOISED (t=0)", x1 - 4, mid + R + 1);
            ctx.textAlign = "left";
        }

        ctx.restore();
    };
};

// Quant Finance: Order Book Depth & Volatility Smile with hover execution cursor
NAV.quant = () => {
    let tickCount = 8842;
    let poissonAcc = 0;
    const BOOK_LEVELS = 18;
    const bidDepths = Array.from({ length: BOOK_LEVELS }, () => 0.2 + Math.random() * 0.8);
    const askDepths = Array.from({ length: BOOK_LEVELS }, () => 0.2 + Math.random() * 0.8);

    return (ctx, w, h, t, dt) => {
        const a = KW.col.a;
        const bidCol = KW.col.pal[3] || [34, 197, 94];
        const askCol = KW.col.pal[0] || [244, 63, 94];
        const mid = h / 2;

        poissonAcc += dt * 11;
        while (poissonAcc >= 1) {
            poissonAcc--;
            tickCount++;
            const idx = (Math.random() * BOOK_LEVELS) | 0;
            if (Math.random() < 0.5) bidDepths[idx] = Math.max(0.1, Math.min(1.0, bidDepths[idx] + (Math.random() - 0.48) * 0.35));
            else askDepths[idx] = Math.max(0.1, Math.min(1.0, askDepths[idx] + (Math.random() - 0.48) * 0.35));
        }

        const x0 = 12;
        const x1 = w - 12;
        const trackW = x1 - x0;
        if (trackW < 40) return;

        const isHovered = NAV_INPUT.inNav;
        const execCursorX = isHovered ? Math.max(x0, Math.min(x1, NAV_INPUT.canvasX)) : -1;
        const bookMidX = x0 + trackW * 0.5;

        ctx.save();

        const barW = Math.max(2, Math.floor((trackW * 0.46) / BOOK_LEVELS));
        const maxH = h * 0.36;

        for (let i = 0; i < BOOK_LEVELS; i++) {
            const bx = bookMidX - 4 - (i + 1) * barW;
            if (bx < x0) break;
            const bh = bidDepths[i] * maxH;
            ctx.fillStyle = rgba(bidCol, 0.40 + (1 - i / BOOK_LEVELS) * 0.45);
            ctx.fillRect(bx, mid - bh, barW - 1, bh);
        }

        for (let i = 0; i < BOOK_LEVELS; i++) {
            const ax = bookMidX + 4 + i * barW;
            if (ax + barW > x1) break;
            const ah = askDepths[i] * maxH;
            ctx.fillStyle = rgba(askCol, 0.40 + (1 - i / BOOK_LEVELS) * 0.45);
            ctx.fillRect(ax, mid, barW - 1, ah);
        }

        const jumpRisk = 0.08 * Math.sin(t * 3.2);
        ctx.strokeStyle = rgba(a, 0.90);
        ctx.lineWidth = 1.3;
        ctx.beginPath();
        for (let x = x0; x <= x1; x += 2) {
            const normK = (x - bookMidX) / (trackW * 0.48);
            const smileY = mid - (h * 0.32) + (normK * normK * 14) + (jumpRisk * normK * 6);
            x === x0 ? ctx.moveTo(x, smileY) : ctx.lineTo(x, smileY);
        }
        ctx.stroke();

        ctx.strokeStyle = rgba(a, 0.25);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x0, mid);
        ctx.lineTo(x1, mid);
        ctx.stroke();

        if (isHovered && execCursorX >= x0 && execCursorX <= x1) {
            ctx.strokeStyle = "rgba(255, 255, 255, 0.95)";
            ctx.lineWidth = 1.2;
            ctx.setLineDash([2, 2]);
            ctx.beginPath();
            ctx.moveTo(execCursorX, mid - maxH - 2);
            ctx.lineTo(execCursorX, mid + maxH + 2);
            ctx.stroke();
            ctx.setLineDash([]);

            ctx.fillStyle = rgba(a, 1);
            ctx.beginPath();
            ctx.arc(execCursorX, mid, 2.5, 0, TAU);
            ctx.fill();

            ctx.font = '600 7.5px "JetBrains Mono", monospace';
            ctx.fillStyle = "rgba(255, 255, 255, 0.95)";
            ctx.fillText("EXEC @ 0.0 bps", Math.min(execCursorX + 4, x1 - 65), mid - 8);
        }

        ctx.restore();
    };
};

// Computer Science: Live Instruction Pipeline / Sorting Ribbon with clock halt & opcode inspection
NAV.cs = () => {
    const N_BARS = 32;
    let bars = Array.from({ length: N_BARS }, (_, i) => (i + 1) / N_BARS);
    let sortGen = null;
    let cmpA = -1, cmpB = -1;
    let sortDone = false;
    let holdTimer = 0;

    function* bitonicSort(arr) {
        for (let k = 2; k <= arr.length; k *= 2) {
            for (let j = k / 2; j > 0; j = Math.floor(j / 2)) {
                for (let i = 0; i < arr.length; i++) {
                    const l = i ^ j;
                    if (l > i) {
                        const dir = ((i & k) === 0);
                        if ((arr[i] > arr[l]) === dir) {
                            const tmp = arr[i]; arr[i] = arr[l]; arr[l] = tmp;
                            yield [i, l];
                        }
                    }
                }
            }
        }
    }

    const resetSort = () => {
        for (let i = bars.length - 1; i > 0; i--) {
            const j = (Math.random() * (i + 1)) | 0;
            const tmp = bars[i]; bars[i] = bars[j]; bars[j] = tmp;
        }
        sortGen = bitonicSort(bars);
        sortDone = false;
        cmpA = -1; cmpB = -1;
    };
    resetSort();

    const OPCODES = [
        { code: "0x90", name: "NOP" },
        { code: "0xE9", name: "JMP" },
        { code: "0x55", name: "PUSH" },
        { code: "0x48", name: "MOV" },
        { code: "0xC3", name: "RET" },
        { code: "0x0F", name: "SYSCALL" }
    ];

    const STAGES = ["IF", "ID", "EX", "MEM", "WB"];

    return (ctx, w, h, t, dt) => {
        const a = KW.col.a;
        const mid = h / 2;
        const isHalted = NAV_INPUT.inNav;

        const x0 = 12;
        const x1 = w - 12;
        const trackW = x1 - x0;
        if (trackW < 40) return;

        if (!isHalted) {
            if (!sortDone && sortGen) {
                for (let k = 0; k < 2; k++) {
                    const r = sortGen.next();
                    if (r.done) {
                        sortDone = true;
                        holdTimer = 1.6;
                        cmpA = -1; cmpB = -1;
                        break;
                    }
                    cmpA = r.value[0]; cmpB = r.value[1];
                }
            } else if ((holdTimer -= dt) <= 0) {
                resetSort();
            }
        }

        ctx.save();

        const pipeY = mid - 4;
        const pipeSpan = Math.min(trackW * 0.45, 180);
        const stageGap = pipeSpan / STAGES.length;
        const clkProgress = isHalted ? 0.5 : ((t * 2.2) % 1);
        const activeStage = Math.floor(clkProgress * STAGES.length);

        ctx.font = '600 7.5px "JetBrains Mono", monospace';
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";

        for (let i = 0; i < STAGES.length; i++) {
            const sx = x0 + i * stageGap + stageGap * 0.5;
            const isActive = !isHalted && i === activeStage;
            const stageW = stageGap - 4;
            const stageH = 10;

            ctx.fillStyle = rgba(a, isActive ? 0.35 : 0.09);
            ctx.strokeStyle = rgba(a, isActive ? 1.0 : 0.30);
            ctx.lineWidth = 1;
            ctx.fillRect(sx - stageW / 2, pipeY - stageH / 2, stageW, stageH);
            ctx.strokeRect(sx - stageW / 2, pipeY - stageH / 2, stageW, stageH);

            ctx.fillStyle = rgba(isActive ? [255, 255, 255] : a, isActive ? 1.0 : 0.65);
            ctx.fillText(STAGES[i], sx, pipeY);

            if (i < STAGES.length - 1) {
                ctx.strokeStyle = rgba(a, isActive ? 0.8 : 0.25);
                ctx.beginPath();
                ctx.moveTo(sx + stageW / 2, pipeY);
                ctx.lineTo(sx + stageGap - stageW / 2, pipeY);
                ctx.stroke();
            }
        }

        const sortStartX = x0 + pipeSpan + 14;
        const sortW = x1 - sortStartX;
        if (sortW > 40) {
            const n = Math.min(N_BARS, Math.floor(sortW / 4.5));
            const bw = sortW / n;
            const maxBarH = h * 0.65;

            for (let i = 0; i < n; i++) {
                const bx = sortStartX + i * bw;
                const bh = Math.max(2, bars[i] * maxBarH);
                const isHot = (i === cmpA || i === cmpB);
                const by = h - 2 - bh;

                ctx.fillStyle = rgba(a, isHot ? 1.0 : sortDone ? 0.85 : 0.32);
                ctx.fillRect(bx, by, Math.max(bw - 1.2, 1), bh);

                if (isHot) {
                    ctx.fillStyle = "#ffffff";
                    ctx.fillRect(bx, by, Math.max(bw - 1.2, 1), 2);
                }
            }
        }

        if (isHalted && NAV_INPUT.canvasX >= x0 && NAV_INPUT.canvasX <= x1) {
            const opIdx = Math.floor(Math.abs(NAV_INPUT.canvasX * 0.1)) % OPCODES.length;
            const op = OPCODES[opIdx];
            const hx = NAV_INPUT.canvasX;

            ctx.font = '600 8px "JetBrains Mono", monospace';
            ctx.textAlign = "center";
            ctx.fillStyle = "rgba(248, 113, 113, 0.95)";
            ctx.fillText(`[${op.code} ${op.name}]`, hx, h - 3);
        }

        ctx.restore();
    };
};

// Research Papers: Poincaré hyperbolic disk gauge with citation stream telemetry
NAV.papers = () => {
    return (ctx, w, h, t) => {
        const a = KW.col.a, mid = h / 2, R = Math.min(h * 0.38, 12);
        const cx = 18;
        // Mini Poincaré disk glyph
        ctx.strokeStyle = rgba(a, 0.45); ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.arc(cx, mid, R, 0, TAU); ctx.stroke();
        const sweep = t * 2.2;
        ctx.strokeStyle = rgba(a, 0.9); ctx.beginPath();
        ctx.arc(cx, mid, R, sweep, sweep + 1.6); ctx.stroke();
        ctx.fillStyle = rgba(a, 1); ctx.beginPath();
        ctx.arc(cx + Math.cos(sweep) * R * 0.6, mid + Math.sin(sweep) * R * 0.6, 2, 0, TAU); ctx.fill();

        // Citation stream horizon
        const x0 = 38, x1 = w - 16;
        ctx.strokeStyle = rgba(a, 0.22); ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(x0, mid); ctx.lineTo(x1, mid); ctx.stroke();
        const px = x0 + (x1 - x0) * ((t * 0.5) % 1);
        ctx.fillStyle = rgba(a, 0.95); ctx.beginPath(); ctx.arc(px, mid, 2.5, 0, TAU); ctx.fill();

        [0.25, 0.55, 0.82].forEach((frac) => {
            const bx = x0 + (x1 - x0) * frac;
            const hot = Math.abs(px - bx) < 16;
            ctx.fillStyle = rgba(a, hot ? 1 : 0.35);
            ctx.fillRect(bx - 3, mid - 4, 6, 8);
        });
    };
};

// Academic Coursework: 4-stage prerequisite pipeline [FND] → [CORE] → [HNR] → [DEG]
NAV.courses = () => {
    const labels = ["FND", "CORE", "HNR", "DEG"];
    return (ctx, w, h, t) => {
        const a = KW.col.a, mid = h / 2, n = labels.length;
        const x0 = 18, span = w - 36, gap = span / (n - 1);
        ctx.font = '700 8.5px "JetBrains Mono", ui-monospace, monospace';
        ctx.textAlign = "center"; ctx.textBaseline = "middle";

        ctx.strokeStyle = rgba(a, 0.25); ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(x0, mid); ctx.lineTo(x0 + span, mid); ctx.stroke();

        const cycle = (t * 0.7) % (n - 1);
        const stage = Math.floor(cycle), frac = cycle - stage;
        const sx = x0 + stage * gap + frac * gap;
        ctx.fillStyle = rgba(a, 0.95); ctx.beginPath(); ctx.arc(sx, mid, 2.6, 0, TAU); ctx.fill();

        for (let i = 0; i < n; i++) {
            const x = x0 + i * gap;
            const active = i <= stage + (frac > 0.5 ? 1 : 0);
            ctx.fillStyle = rgba(a, active ? 0.2 : 0.08);
            ctx.strokeStyle = rgba(a, active ? 0.9 : 0.35);
            ctx.lineWidth = 1;
            ctx.fillRect(x - 14, mid - 7, 28, 14);
            ctx.strokeRect(x - 14, mid - 7, 28, 14);
            ctx.fillStyle = rgba(a, active ? 1 : 0.45);
            ctx.fillText(labels[i], x, mid);
        }
    };
};

const initNavSim = (c) => {
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
            mix = Math.min(1, mix + dt * 2.5); // cross-fade over ~400ms
            if (prev) {
                ctx.save(); ctx.globalAlpha = 1 - mix;
                (inst[prev] || (inst[prev] = NAV[prev]()))(ctx, W, Hh, t, dt);
                ctx.restore();
            }
        }
        ctx.save(); ctx.globalAlpha = mix;
        (inst[cur] || (inst[cur] = NAV[cur]()))(ctx, W, Hh, t, dt);
        ctx.restore();
        navFade(ctx, W, Hh, false);
    });
};

    const navCanvas = $(".nav-live canvas");
    if (navCanvas) {
        try { initNavSim(navCanvas); } catch (e) { console.warn("Nav sim:", e); }
    }



    const initPage = () => {
        const u = new URL(location.href);
        const file = u.pathname.split("/").pop() || "index.html";
        const domKey = keys.find((k) => SITE.domains[k].file === file);
        let curPage = "hub", curDomain = "hub", curTitle = "Kushan Waghmare · Portfolio";
        if (domKey) {
            curPage = "domain";
            curDomain = domKey;
            curTitle = `${SITE.domains[domKey].name} · Kushan Waghmare`;
        } else if (file === "project.html") {
            curPage = "project";
            curDomain = "hub";
            curTitle = "Project · Kushan Waghmare";
        } else if (file === "paper.html") {
            curPage = "paper";
            curDomain = "papers";
            curTitle = "Research Paper · Kushan Waghmare";
        } else if (file === "papers.html") {
            curPage = "papers";
            curDomain = "papers";
            curTitle = "Research Papers · Kushan Waghmare";
        } else if (file === "courses.html") {
            curPage = "courses";
            curDomain = "courses";
            curTitle = "Academic Coursework & Curricula · Kushan Waghmare";
        }

        D.dataset.page = curPage;
        D.dataset.domain = curDomain;
        document.title = curTitle;
        KW.refresh();

        if (curPage === "paper" || (curPage === "papers" && u.searchParams.get("p"))) {
            const paperId = u.searchParams.get("p");
            const p = (SITE.papers || []).find((x) => x.id === paperId) || (SITE.papers && SITE.papers[0]);
            if (p) {
                D.dataset.page = "paper";
                D.dataset.domain = "papers";
                curTitle = `${p.title} · Kushan Waghmare`;
                document.title = curTitle;
                main.innerHTML = paperDetailPage(p);
            }
        } else if (curPage === "project" && u.searchParams.get("p")) {
            const p = SITE.projects.find((x) => x.id === u.searchParams.get("p"));
            if (p) {
                D.dataset.domain = p.domain;
                KW.refresh();
                document.title = `${p.title} · Kushan Waghmare`;
                main.innerHTML = projectPage(p);
            }
        }

        const resolveGpuSim = (simKey) => {
            if (simKey === "hub:intro") return { mod: "hub", key: "hub" };
            if (simKey === "hub:domain-cs" || simKey === "domain:cs:0") {
                return { mod: "qsim", key: "cs" };
            }
            if (simKey === "hub:domain-math" || simKey === "domain:math:0") {
                return { mod: "cy", key: "cy-cross-section" };
            }
            if (simKey === "domain:math:1" || simKey.startsWith("project:mobius-surfaces")) {
                return { mod: "math", key: "mobius-surfaces" };
            }
            if (simKey === "domain:physics:2" || simKey.startsWith("project:split-step-schrodinger")) {
                return { mod: "schrodinger", key: "split-step-schrodinger" };
            }
            if (simKey === "domain:physics:1" || simKey.startsWith("project:nbody-leapfrog") || simKey.startsWith("paper:symplectic-energy-bounds-nbody:hero")) {
                return { mod: "nbody", key: "nbody-leapfrog" };
            }
            if (simKey === "hub:domain-quant" || simKey === "domain:quant:0") {
                return { mod: "crystal", key: "options-pricing" };
            }
            if (simKey === "domain:quant:1") {
                return { mod: "copula", key: "copula" };
            }
            if (simKey.startsWith("project:options-pricing")) {
                return { mod: "crystal", key: "options-pricing" };
            }
            if (simKey.startsWith("paper:hft-stat-arb-microstructure:hero") || simKey === "course:QF4020" || simKey === "track:advanced-quant-systems" || simKey === "domain:quant:2" || simKey.startsWith("project:stat-arb:hero")) {
                return { mod: "lob", key: "order-book-terrain" };
            }
            if (simKey === "hub:domain-datascience" || simKey === "domain:datascience:0") {
                return { mod: "diffusion", key: "diffusion" };
            }
            if (simKey.startsWith("paper:langevin-loss-landscapes:hero")) {
                return { mod: "datascience", key: "langevin-loss-landscapes" };
            }
            if (simKey === "course:PH2040") {
                return { mod: "ising", key: "ising-model" };
            }
            if (simKey === "course:PH3010" || simKey === "track:physics-curriculum") {
                return { mod: "fdtd", key: "fdtd-wave-optics" };
            }
            if (simKey === "domain:physics:3" || simKey === "course:PH2010") {
                return { mod: "pendulum", key: "pendulum" };
            }
            if (simKey === "domain:math:2" || simKey.startsWith("project:fourier-spectral")) {
                return { mod: "fourier", key: "fourier-spectral" };
            }
            if (simKey === "domain:datascience:1" || simKey.startsWith("project:regularised-regression") || simKey === "course:DS3001") {
                return { mod: "regression", key: "regularised-regression" };
            }
            if (simKey === "domain:datascience:2" || simKey.startsWith("project:spectral-clustering")) {
                return { mod: "spectral", key: "spectral-clustering" };
            }
            if (simKey === "domain:quant:3" || simKey === "course:MA2010") {
                return { mod: "markov", key: "markov" };
            }
            return null;
        };

        document.querySelectorAll(".snap-section canvas").forEach((c) => {
            const sec = c.closest(".snap-section");
            const simKey = sec && sec.dataset.sim;
            if ((simKey === "hub:intro" || simKey === "hub:domain-datascience" || simKey === "hub:contact") && window.THREAD_STAGE && window.GFX?.supported && !window.KW?.REDUCED) {
                return; // Particle thread directly visualises intro, diffusion spiral, and contact; skip duplicate canvas sim
            }
            if (simKey && window.SLIDE_SIMS && window.SLIDE_SIMS[simKey]) {
                const item = window.SLIDE_SIMS[simKey];
                const eng = window.ENGINES && window.ENGINES[item.engine];
                const gpu = resolveGpuSim(simKey);

                if (gpu && window.GFX && window.GFX.supported) {
                    if (window.SIMS && window.SIMS[gpu.key]) {
                        try { window.SIMS[gpu.key](c, item.params); return; } catch (e) {}
                    }
                    if (window.KW && window.KW.loadModule) {
                        window.KW.loadModule(gpu.mod).then(() => {
                            if (c.isConnected && window.SIMS && window.SIMS[gpu.key]) {
                                window.SIMS[gpu.key](c, item.params);
                            }
                        }).catch(() => {
                            if (eng) try { eng(c, item.params); } catch (e) {}
                        });
                        return;
                    }
                }

                if (eng) {
                    try { eng(c, item.params); } catch (err) { console.warn("Slide sim error:", simKey, err); }
                }
            }
        });

        setupSnapObserver();
        observeReveals();
        const renderMath = () => {
            const doRender = () => {
                if (window.renderMathInElement) {
                    try {
                        renderMathInElement(document.body, {
                            throwOnError: false,
                            delimiters: [
                                { left: "$$", right: "$$", display: true },
                                { left: "$", right: "$", display: false }
                            ]
                        });
                    } catch (e) {}
                    return true;
                }
                return false;
            };

            if (!doRender()) {
                let attempts = 0;
                const timer = setInterval(() => {
                    attempts++;
                    if (doRender() || attempts > 40) clearInterval(timer);
                }, 50);
                if (!window.renderMathInElement) {
                    window.addEventListener("load", () => doRender(), { once: true });
                }
            }
        };
        renderMath();
    };

    initPage();

    /* ---------- Seamless Fast Page Transition (preserves Web Audio) ---------- */
    const loadPage = async (urlStr, push = true) => {
        try {
            SOUND.warp(0);
            const res = await fetch(urlStr);
            if (!res.ok) throw new Error("Fetch failed");
            const text = await res.text();
            const doc = new DOMParser().parseFromString(text, "text/html");
            const newMain = doc.querySelector("#main");
            if (!newMain) { location.href = urlStr; return; }

            const newDomain = doc.documentElement.dataset.domain || "hub";
            const newPage = doc.documentElement.dataset.page || "hub";

            const targetUrl = new URL(urlStr, location.origin);
            let targetSec = null;
            if (targetUrl.hash) targetSec = doc.querySelector(targetUrl.hash);
            if (!targetSec) targetSec = doc.querySelector(".snap-section");
            const toSimKey = targetSec ? targetSec.dataset.sim : (newDomain === "hub" ? "hub:intro" : `domain:${newDomain}:0`);
            const isHashJump = !!targetUrl.hash;

            if (window.__stageController) {
                window.__stageController.startTimedTransition(toSimKey, {
                    durationMs: isHashJump ? 500 : 1200
                });
            }

            const updateDOM = () => {
                const newNav = doc.querySelector("header.nav");
                const curNav = $("header.nav");
                if (newNav && curNav) {
                    const curBrandGroup = $(".nav-brand-group", curNav);
                    const newBrandGroup = $(".nav-brand-group", newNav);
                    if (curBrandGroup && newBrandGroup) curBrandGroup.innerHTML = newBrandGroup.innerHTML;
                    const curLinks = $(".links", curNav);
                    const newLinks = $(".links", newNav);
                    if (curLinks && newLinks) {
                        const curBack = $(".nav-back-link", curLinks);
                        const newBack = $(".nav-back-link", newLinks);
                        if (curBack) curBack.remove();
                        if (newBack) curLinks.prepend(newBack.cloneNode(true));
                        const contactLink = $(".nav-contact-link", curLinks);
                        if (contactLink) {
                            contactLink.setAttribute("href", newPage === "hub" ? "#about-contact" : "index.html#about-contact");
                        }
                    }
                }

                main.innerHTML = newMain.innerHTML;
                document.title = doc.title;
                D.dataset.domain = newDomain;
                D.dataset.page = newPage;
                KW.refresh();

                if (push) history.pushState(null, "", urlStr);
                if (targetUrl.hash) {
                    const targetEl = document.querySelector(targetUrl.hash);
                    if (targetEl) targetEl.scrollIntoView({ behavior: "instant" });
                    else window.scrollTo({ top: 0, behavior: "instant" });
                } else {
                    window.scrollTo({ top: 0, behavior: "instant" });
                }
                initPage();
                if (window.__stageController) {
                    window.__stageController.syncToPage();
                }
            };

            if (document.startViewTransition && !KW.REDUCED) {
                document.startViewTransition(updateDOM);
            } else {
                updateDOM();
            }
        } catch (e) {
            location.href = urlStr;
        }
    };

    document.addEventListener("click", (e) => {
        if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        const a = e.target.closest && e.target.closest("a[href]");
        if (!a || a.target === "_blank") return;
        const raw = a.getAttribute("href");
        if (!raw || raw.startsWith("#") || raw.startsWith("mailto:") || raw.startsWith("tel:") || raw.startsWith("javascript:")) return;
        const u = new URL(raw, location.href);
        if (u.origin !== location.origin) return;
        e.preventDefault();
        loadPage(u.href, true);
    });

    window.addEventListener("popstate", () => {
        loadPage(location.href, false);
    });

    document.addEventListener("pointermove", (e) => {
        const c = e.target.closest && e.target.closest(".card");
        if (c) { const r = c.getBoundingClientRect(); c.style.setProperty("--mx", e.clientX - r.left + "px"); c.style.setProperty("--my", e.clientY - r.top + "px"); }
    });
    document.addEventListener("click", (e) => {
        const btn = e.target.closest && e.target.closest(".copy-btn");
        if (btn && btn.dataset.copy) {
            SOUND.copy();
            const label = btn.querySelector(".copy-text") || btn;
            const originalText = label.textContent;
            navigator.clipboard.writeText(btn.dataset.copy).then(() => {
                label.textContent = "Copied to clipboard!";
                btn.classList.add("copied");
                setTimeout(() => {
                    label.textContent = originalText;
                    btn.classList.remove("copied");
                }, 2200);
            }).catch(() => {});
            return;
        }
        const interactive = e.target.closest && e.target.closest(".snap-dot, .pill, .snap-cta-btn, .snap-cue, .card, .nav a");
        if (interactive) {
            SOUND.click();
        }
    });

    let lastHoverTime = 0;
    document.addEventListener("pointerover", (e) => {
        const target = e.target.closest && e.target.closest(".snap-dot, .pill, .snap-cta-btn, .card, .copy-btn, .sound-btn, .nav a, .snap-cue");
        if (target) {
            const now = performance.now();
            if (now - lastHoverTime > 65) {
                SOUND.hover();
                lastHoverTime = now;
            }
        }
    }, { passive: true });
})();
