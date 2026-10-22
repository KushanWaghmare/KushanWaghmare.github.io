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
            <footer class="foot snap-foot"><span>© ${new Date().getFullYear()} Kushan Waghmare</span><a href="https://github.com/KushanWaghmare" target="_blank" rel="noopener">GitHub</a></footer>
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
            <footer class="foot snap-foot"><span>© ${new Date().getFullYear()} Kushan Waghmare</span><a href="https://github.com/KushanWaghmare" target="_blank" rel="noopener">GitHub</a></footer>
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

    /* ---------- snap observer & supersonic warp engine ---------- */
    let snapAbort = null, snapIO = null;
    const setupSnapObserver = () => {
        if (snapAbort) snapAbort.abort();
        if (snapIO) snapIO.disconnect();
        snapAbort = new AbortController();
        const sig = snapAbort.signal;

        const sections = Array.from(document.querySelectorAll(".snap-section"));
        if (!sections.length) return;
        const VECS = ["zoom", "right", "left", "bottom", "top", "right", "left", "bottom", "top"];
        sections.forEach((s, i) => {
            if (!s.dataset.enter) s.dataset.enter = VECS[i % VECS.length];
        });

        const dots = document.querySelectorAll(".snap-dot");
        let curIdx = 0;
        const initialIdx = sections.findIndex((s) => {
            const r = s.getBoundingClientRect();
            return r.top >= -window.innerHeight * 0.45 && r.top < window.innerHeight * 0.55;
        });
        if (initialIdx !== -1) curIdx = initialIdx;
        let lastId = sections[curIdx] ? sections[curIdx].id : null, warping = false, lastWarpStart = 0;

        let warpCanvas = $(".warp");
        if (!warpCanvas && !REDUCED) {
            warpCanvas = document.createElement("canvas");
            warpCanvas.className = "warp";
            warpCanvas.setAttribute("aria-hidden", "true");
            document.body.appendChild(warpCanvas);
        }

        const triggerStreak = (dir) => {
            if (!warpCanvas || REDUCED) return;
            const dpr = Math.min(window.devicePixelRatio || 1, 2);
            const w = window.innerWidth, h = window.innerHeight;
            warpCanvas.width = w * dpr;
            warpCanvas.height = h * dpr;
            const ctx = warpCanvas.getContext("2d");
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            const cx = dir === "right" ? w * 0.68 : dir === "left" ? w * 0.32 : w * 0.5;
            const cy = dir === "bottom" ? h * 0.68 : dir === "top" ? h * 0.32 : h * 0.5;
            const stars = Array.from({ length: 85 }, () => {
                const ang = Math.random() * Math.PI * 2;
                const r0 = 18 + Math.random() * Math.min(w, h) * 0.28;
                const spd = 650 + Math.random() * 1400;
                const lw = 0.8 + Math.random() * 1.8;
                const core = Math.random() < 0.35;
                return { cs: Math.cos(ang), sn: Math.sin(ang), r: r0, spd, lw, core };
            });
            warpCanvas.classList.add("on");
            setTimeout(() => warpCanvas.classList.remove("on"), 360);
            const t0 = performance.now();
            const [cr, cg, cb] = KW.col.a;
            const frame = (now) => {
                const el = (now - t0) / 1000;
                ctx.clearRect(0, 0, w, h);
                if (el > 0.56) return;
                const env = Math.sin(Math.min(1, el / 0.52) * Math.PI);
                ctx.lineCap = "round";
                for (const s of stars) {
                    const r1 = s.r + s.spd * el * 0.55;
                    const r2 = s.r + s.spd * el * 1.25;
                    ctx.lineWidth = s.lw;
                    ctx.strokeStyle = s.core
                        ? `rgba(255,255,255,${(0.75 * env).toFixed(3)})`
                        : `rgba(${cr},${cg},${cb},${(0.65 * env).toFixed(3)})`;
                    ctx.beginPath();
                    ctx.moveTo(cx + s.cs * r1, cy + s.sn * r1);
                    ctx.lineTo(cx + s.cs * r2, cy + s.sn * r2);
                }
                ctx.stroke();
                requestAnimationFrame(frame);
            };
            requestAnimationFrame(frame);
        };

        const warpTo = (targetIdx) => {
            if (targetIdx < 0 || targetIdx >= sections.length || targetIdx === curIdx) return;
            const next = sections[targetIdx];
            if (REDUCED) {
                next.scrollIntoView({ behavior: "instant" });
                return;
            }
            if (warping) return;
            warping = true;
            lastWarpStart = performance.now();
            const cur = sections[curIdx];
            curIdx = targetIdx;
            lastId = next.id;

            const d = next.dataset.domain;
            if (d && D.dataset.domain !== d) {
                D.dataset.domain = d;
                KW.refresh();
                window.dispatchEvent(new Event("themechange"));
            }
            dots.forEach((dot) => dot.classList.toggle("active", dot.getAttribute("href") === "#" + next.id));

            const enter = next.dataset.enter || "bottom";
            const pan = enter === "right" ? 0.65 : enter === "left" ? -0.65 : 0;
            SOUND.warp(pan);
            triggerStreak(enter);

            next.querySelectorAll("[data-reveal], [data-hero]").forEach((el) => el.classList.add("revealed"));
            cur.classList.add("warp-out");
            next.classList.add("warp-in");

            setTimeout(() => {
                window.scrollTo({ top: next.offsetTop, behavior: "instant" });
                document.documentElement.scrollTop = next.offsetTop;
                document.body.scrollTop = next.offsetTop;
                void next.offsetWidth;
                cur.classList.remove("warp-out");
                next.classList.remove("warp-in");
                next.classList.add("warp-land");
            }, 210);

            setTimeout(() => {
                next.classList.remove("warp-land");
                warping = false;
            }, 760);
        };

        window.addEventListener("wheel", (e) => {
            if (REDUCED || e.ctrlKey || e.metaKey) return;
            const hScroll = e.target && e.target.closest && e.target.closest(".course-grid");
            if (hScroll && hScroll.scrollWidth > hScroll.clientWidth + 4) {
                if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
                const atLeft = hScroll.scrollLeft <= 2;
                const atRight = hScroll.scrollLeft + hScroll.clientWidth >= hScroll.scrollWidth - 4;
                if ((e.deltaY < 0 && !atLeft) || (e.deltaY > 0 && !atRight)) {
                    e.preventDefault();
                    hScroll.scrollLeft += e.deltaY;
                    return;
                }
            }
            const scrollEl = e.target && e.target.closest && e.target.closest(".snap-inner, .scrollable");
            if (scrollEl && scrollEl.scrollHeight > scrollEl.clientHeight + 4) {
                const atTop = scrollEl.scrollTop <= 2;
                const atBottom = scrollEl.scrollTop + scrollEl.clientHeight >= scrollEl.scrollHeight - 4;
                if ((e.deltaY < 0 && !atTop) || (e.deltaY > 0 && !atBottom)) {
                    return;
                }
            }
            e.preventDefault();
            const now = performance.now();
            if (warping || now - lastWarpStart < 780) return;
            if (Math.abs(e.deltaY) < 10) return;
            warpTo(curIdx + (e.deltaY > 0 ? 1 : -1));
        }, { passive: false, signal: sig });

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

        let touchStartX = 0, touchStartY = 0, touchConsumed = false;
        window.addEventListener("touchstart", (e) => {
            if (REDUCED || !e.touches || e.touches.length !== 1) return;
            touchStartX = e.touches[0].clientX;
            touchStartY = e.touches[0].clientY;
            touchConsumed = false;
        }, { passive: true, signal: sig });

        window.addEventListener("touchmove", (e) => {
            if (REDUCED || !e.touches || e.touches.length !== 1) return;
            const dx = touchStartX - e.touches[0].clientX;
            const dy = touchStartY - e.touches[0].clientY;
            if (Math.abs(dx) > Math.abs(dy)) return;
            const scrollEl = e.target && e.target.closest && e.target.closest(".snap-inner, .scrollable");
            if (scrollEl && scrollEl.scrollHeight > scrollEl.clientHeight + 4) {
                const atTop = scrollEl.scrollTop <= 2;
                const atBottom = scrollEl.scrollTop + scrollEl.clientHeight >= scrollEl.scrollHeight - 4;
                if ((dy < 0 && !atTop) || (dy > 0 && !atBottom)) {
                    return;
                }
            }
            if (e.cancelable) e.preventDefault();
            if (touchConsumed || warping || performance.now() - lastWarpStart < 760) return;
            if (Math.abs(dy) > 28) {
                touchConsumed = true;
                warpTo(curIdx + (dy > 0 ? 1 : -1));
            }
        }, { passive: false, signal: sig });

        window.addEventListener("keydown", (e) => {
            if (REDUCED) return;
            if (e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
            if (e.key === "ArrowDown" || e.key === "PageDown" || (e.key === " " && !e.shiftKey)) {
                e.preventDefault();
                warpTo(curIdx + 1);
            } else if (e.key === "ArrowUp" || e.key === "PageUp" || (e.key === " " && e.shiftKey)) {
                e.preventDefault();
                warpTo(curIdx - 1);
            }
        }, { signal: sig });

        document.addEventListener("click", (e) => {
            const a = e.target.closest && e.target.closest('a[href^="#"]');
            if (!a) return;
            const id = a.getAttribute("href").slice(1);
            const idx = sections.findIndex((s) => s.id === id);
            if (idx !== -1 && !REDUCED) {
                e.preventDefault();
                warpTo(idx);
            }
        }, { signal: sig });

        snapIO = new IntersectionObserver((entries) => {
            entries.forEach((entry) => {
                if (entry.isIntersecting) {
                    const id = entry.target.id;
                    const idx = sections.indexOf(entry.target);
                    if (!warping && idx !== -1) curIdx = idx;
                    const d = entry.target.dataset.domain;
                    if (d && D.dataset.domain !== d) {
                        D.dataset.domain = d;
                        KW.refresh();
                        window.dispatchEvent(new Event("themechange"));
                    }
                    dots.forEach((dot) => {
                        const href = dot.getAttribute("href");
                        const isCurrent = href === "#" + id;
                        dot.classList.toggle("active", isCurrent);
                    });
                    if (!warping && lastId !== null && lastId !== id) {
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

// Physics: Induced nuclear fission of Uranium-235 (²³⁵U + n → ²³⁶U* → ¹⁴¹Ba + ⁹²Kr + 3n + γ).
// An incident thermal neutron collides with the ²³⁵U nucleus; the compound nucleus deforms
// (liquid-drop necking) and undergoes scission into two recoiling fission fragments,
// triggering prompt neutron emission and expanding gamma radiation shockwaves.
NAV.physics = () => {
    return (ctx, w, h, t, dt) => {
        const a = KW.col.a;
        const b = KW.col.pal[0] || [248, 113, 113];
        const mid = h / 2;
        const isLt = !!KW.col.light;

        // Fission reaction sites across the nav bar strip
        const sites = w > 360 ? [w * 0.22, w * 0.54, w * 0.82] : (w > 220 ? [w * 0.32, w * 0.72] : [w * 0.5]);

        // 1. Moderator neutron guide line
        ctx.strokeStyle = rgba(a, 0.14);
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 4]);
        ctx.beginPath();
        ctx.moveTo(0, mid);
        ctx.lineTo(w, mid);
        ctx.stroke();
        ctx.setLineDash([]);

        // 2. Render each Uranium-235 fission site
        sites.forEach((cx, idx) => {
            // Stagger phase across sites for continuous cascading fission
            const period = 3.6;
            const p = ((t / period + idx * 0.37) % 1);

            // Subtle base coordinates for nucleon clusters
            // Protons (accent cyan) and neutrons (bright/white)
            const NUCLEONS = [
                { dx: 0, dy: 0, isP: true },
                { dx: -2.8, dy: -2.0, isP: false },
                { dx: 2.8, dy: -1.8, isP: true },
                { dx: -2.5, dy: 2.2, isP: true },
                { dx: 2.6, dy: 2.0, isP: false },
                { dx: 0, dy: -3.4, isP: true },
                { dx: 0, dy: 3.2, isP: false },
                { dx: -4.6, dy: 0.2, isP: true },
                { dx: 4.5, dy: -0.2, isP: false },
                { dx: -1.4, dy: 1.2, isP: false },
                { dx: 1.5, dy: -1.0, isP: true },
            ];

            // STAGE 1: Incident thermal neutron approaching (0.0 <= p < 0.28)
            if (p < 0.28) {
                const prog = p / 0.28;
                const nDist = 48 * (1 - prog);
                const nx = cx - nDist;
                const ny = mid + Math.sin(prog * 12) * 0.8;

                // Incoming neutron
                ctx.fillStyle = isLt ? "rgba(2, 132, 199, 0.95)" : "#ffffff";
                ctx.beginPath();
                ctx.arc(nx, ny, 1.8, 0, TAU);
                ctx.fill();

                // Neutron speed trace
                ctx.strokeStyle = rgba(a, 0.45 * prog);
                ctx.lineWidth = 1.2;
                ctx.beginPath();
                ctx.moveTo(nx - 8, ny);
                ctx.lineTo(nx, ny);
                ctx.stroke();

                // Bound resting Uranium-235 nucleus (gentle liquid drop breathing)
                const breathe = 1 + 0.08 * Math.sin(t * 8 + idx);
                ctx.fillStyle = rgba(a, 0.16);
                ctx.strokeStyle = rgba(a, 0.65);
                ctx.lineWidth = 1.2;
                ctx.beginPath();
                ctx.arc(cx, mid, 6.8 * breathe, 0, TAU);
                ctx.fill();
                ctx.stroke();

                // Nucleon cluster
                NUCLEONS.forEach((nuc) => {
                    ctx.fillStyle = nuc.isP ? rgba(a, 0.95) : (isLt ? "rgba(100,116,139,0.9)" : "rgba(255,255,255,0.85)");
                    ctx.beginPath();
                    ctx.arc(cx + nuc.dx * breathe, mid + nuc.dy * breathe, 1.3, 0, TAU);
                    ctx.fill();
                });

                // Isotope label
                if (w > 260) {
                    ctx.font = '500 7.5px "JetBrains Mono", monospace';
                    ctx.fillStyle = isLt ? "rgba(0,0,0,0.5)" : "rgba(255,255,255,0.45)";
                    ctx.fillText("²³⁵U", cx - 7, mid - 10);
                }
            }
            // STAGE 2: Compound nucleus excitation & liquid-drop necking (0.28 <= p < 0.44)
            else if (p < 0.44) {
                const prog = (p - 0.28) / 0.16;
                // Necking deformation distance
                const d = prog * 8.5;
                const wobble = Math.sin(prog * 24) * 1.5;

                const lx = cx - d;
                const rx = cx + d * 1.2;
                const rLeft = 5.6;
                const rRight = 4.4; // Asymmetric fission: heavier Barium left, lighter Krypton right
                const neckW = Math.max(1.2, 5.0 * (1 - prog * 0.85));

                // Liquid drop envelope with necking
                ctx.fillStyle = rgba(a, 0.25 + prog * 0.2);
                ctx.strokeStyle = rgba(a, 0.85);
                ctx.lineWidth = 1.4;

                ctx.beginPath();
                ctx.arc(lx, mid, rLeft, Math.PI * 0.5, Math.PI * 1.5);
                ctx.lineTo(cx, mid - neckW);
                ctx.arc(rx, mid, rRight, -Math.PI * 0.5, Math.PI * 0.5);
                ctx.lineTo(cx, mid + neckW);
                ctx.closePath();
                ctx.fill();
                ctx.stroke();

                // High-energy excitation core flicker
                ctx.fillStyle = KW.col.light ? rgba(a, 0.9) : "rgba(255,255,255,0.9)";
                ctx.beginPath();
                ctx.arc(cx, mid + wobble, 1.8 + prog * 1.2, 0, TAU);
                ctx.fill();

                // Distributed nucleons in lobes
                NUCLEONS.forEach((nuc, ni) => {
                    const isLeft = ni < 6;
                    const baseCx = isLeft ? lx : rx;
                    const scale = isLeft ? 0.75 : 0.65;
                    ctx.fillStyle = nuc.isP ? rgba(a, 0.95) : (isLt ? "rgba(100,116,139,0.9)" : "rgba(255,255,255,0.85)");
                    ctx.beginPath();
                    ctx.arc(baseCx + nuc.dx * scale, mid + nuc.dy * scale, 1.2, 0, TAU);
                    ctx.fill();
                });

                if (w > 260) {
                    ctx.font = 'bold 7.5px "JetBrains Mono", monospace';
                    ctx.fillStyle = rgba(a, 0.9);
                    ctx.fillText("²³⁶U*", cx - 9, mid - 11);
                }
            }
            // STAGE 3: Scission, Coulomb explosion, gamma flash & 3 prompt neutrons (0.44 <= p < 0.76)
            else if (p < 0.76) {
                const tau = (p - 0.44) / 0.32;
                const invTau = 1 - tau;

                // 1. Gamma radiation expanding flash
                const rGamma = tau * 28;
                ctx.save();
                ctx.strokeStyle = rgba(a, invTau * 0.75);
                ctx.lineWidth = 1.2;
                ctx.beginPath();
                ctx.arc(cx, mid, rGamma, 0, TAU);
                ctx.stroke();
                ctx.restore();

                // 2. Coulomb explosion fragments (momentum conservation: m1*v1 = m2*v2)
                // Heavier fragment: 141-Ba
                const dBa = 8.5 + tau * 26;
                const baX = cx - dBa;
                const baY = mid - tau * 2.2;
                // Lighter fragment: 92-Kr (flies ~1.5x faster)
                const dKr = 10.2 + tau * 38;
                const krX = cx + dKr;
                const krY = mid + tau * 1.8;

                // Recoil ionisation tracks
                ctx.strokeStyle = rgba(a, invTau * 0.45);
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(cx, mid);
                ctx.lineTo(baX, baY);
                ctx.moveTo(cx, mid);
                ctx.lineTo(krX, krY);
                ctx.stroke();

                // Daughter nucleus: 141-Ba
                ctx.fillStyle = rgba(a, invTau * 0.95);
                ctx.beginPath();
                ctx.arc(baX, baY, 4.2 * invTau + 0.8, 0, TAU);
                ctx.fill();

                // Daughter nucleus: 92-Kr
                ctx.fillStyle = rgba(b, invTau * 0.95);
                ctx.beginPath();
                ctx.arc(krX, krY, 3.4 * invTau + 0.8, 0, TAU);
                ctx.fill();

                // Fragment labels
                if (w > 260 && tau < 0.75) {
                    ctx.font = '6.5px "JetBrains Mono", monospace';
                    ctx.fillStyle = rgba(a, invTau * 0.85);
                    ctx.fillText("¹⁴¹Ba", baX - 8, baY - 6);
                    ctx.fillStyle = rgba(b, invTau * 0.85);
                    ctx.fillText("⁹²Kr", krX - 2, krY - 6);
                }

                // 3. Three fast prompt neutrons ejected at high velocity
                const NEUTRONS = [
                    { ang: -0.85, spd: 46 }, // top-right
                    { ang: 2.35,  spd: 42 }, // bottom-left
                    { ang: 0.95,  spd: 48 }, // bottom-right
                ];
                NEUTRONS.forEach((n) => {
                    const nx = cx + Math.cos(n.ang) * tau * n.spd;
                    const ny = mid + Math.sin(n.ang) * tau * n.spd * 0.75;

                    ctx.fillStyle = isLt ? "rgba(2, 132, 199, 0.95)" : "#ffffff";
                    ctx.beginPath();
                    ctx.arc(nx, ny, 1.5, 0, TAU);
                    ctx.fill();

                    // Neutron path streak
                    ctx.strokeStyle = isLt ? "rgba(2, 132, 199, 0.4)" : "rgba(255, 255, 255, 0.4)";
                    ctx.lineWidth = 1;
                    ctx.beginPath();
                    ctx.moveTo(cx, mid);
                    ctx.lineTo(nx, ny);
                    ctx.stroke();
                });
            }
            // STAGE 4: De-excitation & Target Reformation (0.76 <= p <= 1.0)
            else {
                const tau = (p - 0.76) / 0.24;
                // Re-forming nucleus condensing back
                const r = 6.8 * tau;
                ctx.fillStyle = rgba(a, 0.16 * tau);
                ctx.strokeStyle = rgba(a, 0.65 * tau);
                ctx.lineWidth = 1.2;
                ctx.beginPath();
                ctx.arc(cx, mid, r, 0, TAU);
                ctx.fill();
                ctx.stroke();

                NUCLEONS.forEach((nuc) => {
                    ctx.fillStyle = nuc.isP ? rgba(a, 0.95 * tau) : (isLt ? `rgba(100,116,139,${0.9 * tau})` : `rgba(255,255,255,${0.85 * tau})`);
                    ctx.beginPath();
                    ctx.arc(cx + nuc.dx * tau, mid + nuc.dy * tau, 1.3 * tau, 0, TAU);
                    ctx.fill();
                });
            }
        });

        // 3. Top-left telemetry readout
        if (w > 280) {
            ctx.font = '500 8px "JetBrains Mono", ui-monospace, monospace';
            ctx.fillStyle = isLt ? "rgba(15,23,42,0.65)" : "rgba(255,255,255,0.65)";
            ctx.fillText("²³⁵U + n → ¹⁴¹Ba + ⁹²Kr + 3n · Q ≈ 200 MeV", 6, 9);
        }
    };
};

// Data science: Agent-Based Model mini-swarm telemetry in the nav bar.
NAV.datascience = () => {
    let W = 0;
    const N = 18;
    const boids = Array.from({ length: N }, () => ({
        x: Math.random() * 120,
        y: 4 + Math.random() * 20,
        vx: (Math.random() - 0.5) * 1.6,
        vy: (Math.random() - 0.5) * 0.9
    }));
    return (ctx, w, h, t, dt) => {
        W = w;
        const a = KW.col.a;
        ctx.lineWidth = 1;
        for (let i = 0; i < N; i++) {
            const bi = boids[i];
            for (let j = i + 1; j < N; j++) {
                const bj = boids[j], dx = bj.x - bi.x, dy = bj.y - bi.y, d = Math.hypot(dx, dy);
                if (d < 26) {
                    ctx.strokeStyle = rgba(a, (1 - d / 26) * 0.35);
                    ctx.beginPath(); ctx.moveTo(bi.x, bi.y); ctx.lineTo(bj.x, bj.y); ctx.stroke();
                    if (d < 9) { bi.vx -= (dx / d) * dt * 4.5; bi.vy -= (dy / d) * dt * 4.5; }
                    bi.vx += (bj.vx - bi.vx) * dt * 1.4;
                    bi.vy += (bj.vy - bi.vy) * dt * 1.4;
                }
            }
            bi.x += bi.vx; bi.y += bi.vy;
            if (bi.x < 0) bi.x = w; else if (bi.x > w) bi.x = 0;
            if (bi.y < 3) { bi.y = 3; bi.vy = Math.abs(bi.vy); } else if (bi.y > h - 3) { bi.y = h - 3; bi.vy = -Math.abs(bi.vy); }
            ctx.fillStyle = rgba(a, 0.9);
            ctx.beginPath(); ctx.arc(bi.x, bi.y, 1.8, 0, TAU); ctx.fill();
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
                return { mod: "math-manifold", key: "gauss-bonnet-manifold" };
            }
            if (simKey === "domain:physics:2" || simKey.startsWith("project:split-step-schrodinger")) {
                return { mod: "physics", key: "split-step-schrodinger" };
            }
            if (simKey === "domain:physics:1" || simKey.startsWith("project:nbody-leapfrog") || simKey.startsWith("paper:symplectic-energy-bounds-nbody:hero")) {
                return { mod: "physics", key: "nbody-leapfrog" };
            }
            if (simKey === "hub:domain-quant" || simKey === "domain:quant:0") {
                return { mod: "quant-singularity", key: "market-singularity" };
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
                return { mod: "physics", key: "ising-model" };
            }
            if (simKey === "course:PH3010" || simKey === "track:physics-curriculum") {
                return { mod: "physics", key: "fdtd-wave-optics" };
            }
            if (simKey === "domain:physics:3" || simKey === "course:PH2010") {
                return { mod: "physics", key: "pendulum" };
            }
            if (simKey === "domain:math:2" || simKey === "project:fourier-spectral:hero") {
                return { mod: "primes-waves", key: "primes-waves" };
            }
            if (simKey.startsWith("project:fourier-spectral")) {
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
            const targetUrl = new URL(urlStr, location.origin);
            if (targetUrl.hash) {
                const targetEl = document.querySelector(targetUrl.hash);
                if (targetEl) targetEl.scrollIntoView({ behavior: "instant" });
                else window.scrollTo({ top: 0, behavior: "instant" });
            } else {
                window.scrollTo({ top: 0, behavior: "instant" });
            }
            initPage();
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
