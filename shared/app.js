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

        let ambient = null;
        const ensureAmbient = () => {
            if (ambient || !ctx) return;
            try {
                const createBank = () => {
                    const oscs = [];
                    const filter = ctx.createBiquadFilter();
                    filter.type = "lowpass";
                    const gain = ctx.createGain();
                    gain.gain.value = 0.0;
                    filter.connect(gain);
                    gain.connect(ctx.destination);

                    for (let h = 0; h < 3; h++) {
                        const o = ctx.createOscillator();
                        o.type = h === 0 ? "sine" : "triangle";
                        const og = ctx.createGain();
                        og.gain.value = 0.07 / (h + 1);
                        o.connect(og);
                        og.connect(filter);
                        o.start();
                        oscs.push({ osc: o, gain: og });
                    }
                    return { oscs, filter, gain };
                };

                const bankA = createBank();
                const bankB = createBank();
                ambient = { bankA, bankB, active: false };
            } catch (e) {
                ambient = null;
            }
        };

        const updateBankAudio = (bank, audioCfg, targetGain, t0) => {
            if (!bank || !audioCfg) return;
            const root = audioCfg.rootFreq || 110.0;
            const ratios = audioCfg.harmonicRatios || [1.0, 1.5, 2.0];
            const cutoff = audioCfg.filterCutoff || 480;
            const q = audioCfg.q || 3.0;

            for (let h = 0; h < bank.oscs.length; h++) {
                const ratio = ratios[h] || (h + 1);
                const freq = Math.max(30, Math.min(3000, root * ratio));
                bank.oscs[h].osc.frequency.setTargetAtTime(freq, t0, 0.06);
            }
            bank.filter.frequency.setTargetAtTime(cutoff, t0, 0.08);
            bank.filter.Q.setTargetAtTime(q, t0, 0.08);
            const masterVol = enabled ? targetGain * 0.035 : 0.0;
            bank.gain.gain.setTargetAtTime(masterVol, t0, 0.08);
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
            },
            setDimensionAmbient: (fromAudio, toAudio, blend) => {
                if (!enabled) {
                    if (ambient) {
                        const t0 = (ctx && ctx.currentTime) || 0;
                        ambient.bankA.gain.gain.setTargetAtTime(0.0, t0, 0.04);
                        ambient.bankB.gain.gain.setTargetAtTime(0.0, t0, 0.04);
                    }
                    return;
                }
                withContext((t0) => {
                    ensureAmbient();
                    if (!ambient) return;
                    const b = Math.max(0.0, Math.min(1.0, blend || 0.0));
                    updateBankAudio(ambient.bankA, fromAudio, 1.0 - b, t0);
                    updateBankAudio(ambient.bankB, toAudio, b, t0);
                });
            }
        };
    })();

    window.SOUND = KW.SOUND = SOUND;

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
        <section class="snap-section hero" id="proj-hero" data-domain="${p.domain}" data-sim="project:${p.id}:hero">
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
        <section class="snap-section hero" id="paper-hero" data-domain="papers" data-sim="paper:${p.id}:hero" style="--a:var(--rgb-papers)">
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
            if (window.THREAD_STAGE && typeof window.THREAD_STAGE.goToSection === "function") {
                window.THREAD_STAGE.goToSection(idx);
                return;
            }
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

        const resetInNav = () => { NAV_INPUT.inNav = false; };
        window.addEventListener("pointerup", resetInNav, { passive: true });
        window.addEventListener("pointercancel", resetInNav, { passive: true });
        document.addEventListener("mouseleave", resetInNav, { passive: true });

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

// Physics: Kerr Spacetime Geodesic Motion, Oblate Ergosphere & Frame-Dragging Lensing
// Physics: the solar system, painted. The Sun and all eight planets as soft watercolour / anime sprites in a row,
// drifting and spinning gently, with twinkling four-point stars, a shooting star, a moon, Saturn's ring, hover labels
// and a sparkle burst on click. Sprites are painted once per layout (cheap per frame).
NAV.physics = () => {
    const BODIES = [
        { id: "sun", name: "Sun", r: 0.46, light: [255, 246, 190], mid: [255, 204, 92], dark: [255, 140, 70],
          washes: [[255, 226, 140], [255, 160, 78], [255, 240, 205], [255, 190, 90]], spin: 0.012, bob: 0.5, halo: [255, 196, 96], haloA: 0.5, haloR: 3.0 },
        { id: "mercury", name: "Mercury", r: 0.18, light: [236, 222, 208], mid: [204, 184, 172], dark: [142, 122, 138],
          washes: [[217, 167, 160], [184, 170, 181], [239, 224, 208]], spin: 0.02, bob: 1.0, halo: [220, 190, 180], haloA: 0.16, haloR: 2.2 },
        { id: "venus", name: "Venus", r: 0.27, light: [253, 241, 182], mid: [242, 208, 134], dark: [217, 154, 108],
          washes: [[255, 233, 160], [245, 183, 132], [255, 246, 214]], spin: 0.016, bob: 0.9, halo: [255, 226, 150], haloA: 0.22, haloR: 2.3 },
        { id: "earth", name: "Earth", r: 0.29, light: [160, 224, 248], mid: [74, 163, 224], dark: [44, 95, 181],
          washes: [[120, 205, 245], [60, 140, 215], [190, 240, 255]], spin: 0.03, bob: 1.0, halo: [120, 200, 255], haloA: 0.26, haloR: 2.4 },
        { id: "mars", name: "Mars", r: 0.22, light: [255, 190, 160], mid: [238, 122, 92], dark: [185, 71, 90],
          washes: [[255, 160, 127], [217, 86, 106], [255, 210, 184]], spin: 0.028, bob: 1.1, halo: [255, 150, 130], haloA: 0.2, haloR: 2.2 },
        { id: "jupiter", name: "Jupiter", r: 0.44, light: [255, 241, 202], mid: [243, 197, 138], dark: [208, 138, 95],
          washes: [[255, 246, 220], [240, 178, 122], [217, 138, 120], [248, 220, 166]], spin: 0.05, bob: 0.8, halo: [255, 214, 160], haloA: 0.22, haloR: 2.1,
          bands: [{ y: 0.18, h: 0.12, k: 2, ph: 0.4, amp: 0.02, col: [217, 138, 120], a: 0.5 },
                  { y: 0.34, h: 0.14, k: 3, ph: 1.9, amp: 0.025, col: [255, 246, 220], a: 0.7 },
                  { y: 0.50, h: 0.12, k: 2, ph: 3.1, amp: 0.02, col: [240, 178, 122], a: 0.6 },
                  { y: 0.66, h: 0.16, k: 3, ph: 0.9, amp: 0.03, col: [248, 220, 166], a: 0.65 },
                  { y: 0.82, h: 0.12, k: 2, ph: 2.4, amp: 0.02, col: [217, 138, 120], a: 0.45 }] },
        { id: "saturn", name: "Saturn", r: 0.33, light: [247, 236, 255], mid: [216, 194, 234], dark: [157, 132, 201],
          washes: [[247, 217, 230], [205, 183, 238], [255, 242, 216]], spin: 0.04, bob: 0.9, halo: [226, 200, 250], haloA: 0.24, haloR: 2.4,
          ring: [[255, 228, 240], [214, 196, 243], [255, 241, 215]],
          bands: [{ y: 0.3, h: 0.14, k: 2, ph: 0.8, amp: 0.02, col: [247, 217, 230], a: 0.55 },
                  { y: 0.55, h: 0.16, k: 3, ph: 2.2, amp: 0.02, col: [205, 183, 238], a: 0.5 },
                  { y: 0.76, h: 0.12, k: 2, ph: 1.1, amp: 0.02, col: [255, 242, 216], a: 0.5 }] },
        { id: "uranus", name: "Uranus", r: 0.30, light: [210, 252, 244], mid: [134, 224, 212], dark: [74, 168, 196],
          washes: [[176, 240, 232], [127, 208, 232], [216, 255, 246]], spin: 0.035, bob: 1.0, halo: [150, 235, 225], haloA: 0.22, haloR: 2.3,
          ring: [[200, 250, 244]] },
        { id: "neptune", name: "Neptune", r: 0.29, light: [170, 190, 255], mid: [79, 104, 224], dark: [43, 47, 146],
          washes: [[127, 155, 255], [107, 79, 208], [182, 200, 255]], spin: 0.04, bob: 1.1, halo: [110, 130, 255], haloA: 0.26, haloR: 2.4,
          bands: [{ y: 0.28, h: 0.14, k: 2, ph: 0.3, amp: 0.02, col: [182, 200, 255], a: 0.5 },
                  { y: 0.6, h: 0.18, k: 3, ph: 1.7, amp: 0.025, col: [107, 79, 208], a: 0.5 }] }
    ];
    const STAR_COLS = [[255, 255, 255], [255, 244, 200], [255, 192, 222], [172, 236, 255], [208, 192, 255]];
    const N = BODIES.length;

    const rng = (seed) => {
        let s = seed >>> 0;
        return () => {
            s = (s + 0x6D2B79F5) >>> 0;
            let t = s;
            t = Math.imul(t ^ (t >>> 15), t | 1);
            t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    };
    const mk = (w, h) => {
        const c = document.createElement("canvas");
        c.width = Math.max(2, Math.ceil(w));
        c.height = Math.max(2, Math.ceil(h));
        return c;
    };
    const css = (c, a) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a === undefined ? 1 : a})`;
    const mixc = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
    const clampv = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

    /* Periodic texture (tile width = 2 x height) painted with soft pigment blots, bands and grain. */
    const paintTex = (b, Rpx, seed) => {
        const TH = Math.max(8, Math.ceil(2 * Rpx)), TW = TH * 2;
        const c = mk(TW, TH), g = c.getContext("2d"), rnd = rng(seed);
        const base = g.createLinearGradient(0, 0, 0, TH);
        base.addColorStop(0, css(mixc(b.mid, b.dark, 0.35)));
        base.addColorStop(0.5, css(b.light));
        base.addColorStop(1, css(mixc(b.mid, b.dark, 0.6)));
        g.fillStyle = base;
        g.fillRect(0, 0, TW, TH);

        const blot = (x, y, rx, ry, col, a) => {
            for (const ox of [-TW, 0, TW]) {
                g.save();
                g.translate(x + ox, y);
                g.scale(1, Math.max(0.05, ry / rx));
                const gr = g.createRadialGradient(0, 0, 0, 0, 0, rx);
                gr.addColorStop(0, css(col, a));
                gr.addColorStop(0.55, css(col, a * 0.55));
                gr.addColorStop(1, css(col, 0));
                g.fillStyle = gr;
                g.beginPath();
                g.arc(0, 0, rx, 0, TAU);
                g.fill();
                g.restore();
            }
        };
        const pick = (arr) => arr[Math.floor(rnd() * arr.length)];

        const nWash = b.id === "sun" ? 26 : 16;
        for (let i = 0; i < nWash; i++) {
            const rx = TH * (0.16 + rnd() * 0.3);
            blot(rnd() * TW, rnd() * TH, rx, rx * (0.6 + rnd() * 0.5), pick(b.washes), 0.22 + rnd() * 0.32);
        }
        if (b.bands) {
            for (const bd of b.bands) {
                for (let x = 0; x < TW; x += TH * 0.18) {
                    const y = (bd.y + Math.sin(x / TW * TAU * bd.k + bd.ph) * bd.amp) * TH;
                    blot(x, y, TH * 0.26, TH * bd.h * 0.55, bd.col, bd.a * 0.55);
                }
            }
        }
        // body-specific painting
        if (b.id === "jupiter") {
            blot(TW * 0.3, TH * 0.64, TH * 0.22, TH * 0.11, [244, 128, 140], 0.85);
            blot(TW * 0.3, TH * 0.64, TH * 0.13, TH * 0.06, [255, 205, 196], 0.55);
        } else if (b.id === "neptune") {
            blot(TW * 0.6, TH * 0.4, TH * 0.15, TH * 0.07, [235, 240, 255], 0.75);
            blot(TW * 0.15, TH * 0.7, TH * 0.18, TH * 0.06, [30, 30, 120], 0.35);
        } else if (b.id === "mars") {
            for (let x = 0; x < TW; x += TH * 0.22) blot(x, 0, TH * 0.2, TH * 0.1, [255, 255, 255], 0.85);
            for (let x = 0; x < TW; x += TH * 0.3) blot(x, TH, TH * 0.16, TH * 0.07, [255, 255, 255], 0.7);
            for (let i = 0; i < 6; i++) blot(rnd() * TW, TH * (0.3 + rnd() * 0.4), TH * 0.2, TH * 0.1, [150, 60, 84], 0.35);
        } else if (b.id === "earth") {
            for (let i = 0; i < 9; i++) {
                const x = rnd() * TW, y = TH * (0.26 + rnd() * 0.46), rx = TH * (0.12 + rnd() * 0.16);
                blot(x, y, rx, rx * 0.7, [118, 205, 135], 0.9);
                blot(x + rx * 0.15, y - rx * 0.1, rx * 0.5, rx * 0.34, [244, 239, 192], 0.7);
            }
            for (let x = 0; x < TW; x += TH * 0.24) { blot(x, 0, TH * 0.2, TH * 0.08, [255, 255, 255], 0.85); blot(x, TH, TH * 0.2, TH * 0.08, [255, 255, 255], 0.85); }
        } else if (b.id === "mercury") {
            for (let i = 0; i < 12; i++) {
                const x = rnd() * TW, y = TH * (0.16 + rnd() * 0.68), rr = TH * (0.04 + rnd() * 0.07);
                for (const ox of [-TW, 0, TW]) {
                    g.strokeStyle = css(b.dark, 0.34);
                    g.lineWidth = Math.max(1, rr * 0.28);
                    g.beginPath(); g.arc(x + ox, y, rr, 0, TAU); g.stroke();
                    g.fillStyle = css([255, 244, 236], 0.18);
                    g.beginPath(); g.arc(x + ox - rr * 0.2, y - rr * 0.2, rr * 0.55, 0, TAU); g.fill();
                }
            }
        } else if (b.id === "venus") {
            g.lineCap = "round";
            for (let i = 0; i < 5; i++) {
                g.strokeStyle = css(i % 2 ? [255, 246, 214] : [245, 183, 132], 0.3);
                g.lineWidth = TH * 0.09;
                g.beginPath();
                for (let x = -TW * 0.1; x <= TW * 1.1; x += 4) {
                    const y = TH * (0.16 + i * 0.17) + Math.sin(x / TW * TAU * 2 + i) * TH * 0.05;
                    x <= -TW * 0.1 ? g.moveTo(x, y) : g.lineTo(x, y);
                }
                g.stroke();
            }
        } else if (b.id === "sun") {
            for (let i = 0; i < 40; i++) blot(rnd() * TW, rnd() * TH, TH * (0.05 + rnd() * 0.08), TH * (0.05 + rnd() * 0.07), rnd() > 0.5 ? [255, 250, 220] : [255, 130, 60], 0.3);
        }
        // paper grain
        const nGrain = Math.floor(TW * TH / 70);
        for (let i = 0; i < nGrain; i++) {
            g.fillStyle = rnd() > 0.45 ? `rgba(255,255,255,${0.05 + rnd() * 0.08})` : `rgba(30,20,60,${0.04 + rnd() * 0.07})`;
            const sz = 0.7 + rnd() * 1.1;
            g.fillRect(rnd() * TW, rnd() * TH, sz, sz);
        }
        return { c, TW, TH };
    };

    /* Static sphere shading, pooled-pigment rim, anime highlights. Drawn over the scrolling texture. */
    const paintShade = (b, Rpx, seed) => {
        const pad = 2;
        const S = Math.ceil(2 * Rpx + 2 * pad), cx = S / 2, cy = S / 2;
        const c = mk(S, S), g = c.getContext("2d"), rnd = rng(seed ^ 0x9e3779b9);
        g.save();
        g.beginPath(); g.arc(cx, cy, Rpx, 0, TAU); g.clip();
        const sh = g.createRadialGradient(cx - 0.36 * Rpx, cy - 0.4 * Rpx, 0.1 * Rpx, cx, cy, 1.04 * Rpx);
        sh.addColorStop(0, "rgba(255,255,255,0.24)");
        sh.addColorStop(0.42, "rgba(255,255,255,0)");
        sh.addColorStop(0.74, css(b.dark, 0.2));
        sh.addColorStop(1, css(mixc(b.dark, [10, 8, 40], 0.45), 0.6));
        g.fillStyle = sh; g.fillRect(0, 0, S, S);
        const rl = g.createRadialGradient(cx + 0.8 * Rpx, cy + 0.8 * Rpx, 0, cx + 0.8 * Rpx, cy + 0.8 * Rpx, 0.85 * Rpx);
        rl.addColorStop(0, css(mixc(b.light, [255, 255, 255], 0.4), 0.34));
        rl.addColorStop(1, css(b.light, 0));
        g.fillStyle = rl; g.fillRect(0, 0, S, S);
        g.restore();

        // watercolour edge: pigment pools unevenly along the rim
        const segs = 48;
        for (let i = 0; i < segs; i++) {
            const a0 = i / segs * TAU, a1 = (i + 1.4) / segs * TAU, k = rnd();
            g.strokeStyle = css(mixc(b.dark, [20, 10, 60], 0.35), 0.16 + 0.3 * k);
            g.lineWidth = Rpx * (0.03 + 0.05 * k);
            g.beginPath(); g.arc(cx, cy, Rpx - g.lineWidth * 0.5, a0, a1); g.stroke();
        }
        // anime highlights
        g.save();
        g.translate(cx - 0.38 * Rpx, cy - 0.42 * Rpx);
        g.rotate(-0.6);
        g.scale(1, 0.55);
        const hl = g.createRadialGradient(0, 0, 0, 0, 0, 0.3 * Rpx);
        hl.addColorStop(0, "rgba(255,255,255,0.7)");
        hl.addColorStop(1, "rgba(255,255,255,0)");
        g.fillStyle = hl; g.beginPath(); g.arc(0, 0, 0.3 * Rpx, 0, TAU); g.fill();
        g.restore();
        g.fillStyle = "rgba(255,255,255,0.85)";
        g.beginPath(); g.arc(cx - 0.12 * Rpx, cy - 0.64 * Rpx, Math.max(0.8, 0.045 * Rpx), 0, TAU); g.fill();
        return { c, S };
    };

    const paintHalo = (b, Rpx, hpx) => {
        const Rh = Rpx * b.haloR;
        const Rv = Math.max(Rpx * 0.9, Math.min(Rh, hpx * 0.5 - 7));
        const SW = Math.ceil(2 * Rh), SH = Math.ceil(2 * Rv);
        const c = mk(SW, SH), g = c.getContext("2d");
        g.translate(SW / 2, SH / 2);
        g.scale(1, Rv / Rh);
        const gr = g.createRadialGradient(0, 0, Rpx * 0.7, 0, 0, Rh);
        gr.addColorStop(0, css(b.halo, b.haloA));
        gr.addColorStop(0.45, css(b.halo, b.haloA * 0.35));
        gr.addColorStop(1, css(b.halo, 0));
        g.fillStyle = gr; g.fillRect(-Rh, -Rh, 2 * Rh, 2 * Rh);
        return { c, SW, SH };
    };

    const sparkle = (ctx, x, y, s, rot) => {
        const k = 0.2;
        ctx.beginPath();
        for (let i = 0; i < 4; i++) {
            const a = rot + i * Math.PI / 2, a2 = a + Math.PI / 4, a3 = a + Math.PI / 2;
            const tx = x + Math.cos(a) * s, ty = y + Math.sin(a) * s;
            const nx = x + Math.cos(a3) * s, ny = y + Math.sin(a3) * s;
            i === 0 ? ctx.moveTo(tx, ty) : null;
            ctx.quadraticCurveTo(x + Math.cos(a2) * s * k, y + Math.sin(a2) * s * k, nx, ny);
        }
        ctx.closePath();
        ctx.fill();
    };

    // state
    let built = null;            // { key, bodies[], stars[], ... }
    const hover = new Array(N).fill(0);
    const scroll = new Array(N).fill(0).map((_, i) => i * 0.137);
    const waves = [];
    const bursts = [];
    const shoot = { on: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, next: 4 };
    let par = 0;

    const layout = (w, h) => {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const x0 = 12, x1 = w - 12, trackW = x1 - x0;
        // planets sit in a tight, centred row like the reference (spread only as far as the strip needs); stars fill the rest
        const innerW = trackW * 0.93, spacing = Math.min(innerW / N, h * 2.6);
        const innerX0 = x0 + (trackW - spacing * N) / 2;
        let maxHalf = 0;
        for (const b of BODIES) maxHalf = Math.max(maxHalf, (b.ring && b.id === "saturn" ? 1.95 : 1.0) * b.r * h);
        const kfit = clampv(spacing * 0.9 / (2 * maxHalf), 0.5, 1);
        const key = [Math.round(w / 8), Math.round(h), dpr, Math.round(kfit * 20)].join("|");
        if (built && built.key === key) return built;

        const bodies = BODIES.map((b, i) => {
            const R = b.r * h * kfit, Rpx = R * dpr;
            const tex = paintTex(b, Rpx, 1000 + i * 77);
            return { b, i, R, Rpx, dpr, tex, shade: paintShade(b, Rpx, 5000 + i * 31), halo: paintHalo(b, Rpx, h * dpr),
                     cx: innerX0 + (i + 0.5) * spacing, phase: i * 0.83 + 0.3 };
        });
        // stars in the gaps
        const rnd = rng(424242 + Math.round(w));
        const nStars = clampv(Math.round(trackW / 34), 14, 64);
        const stars = [];
        for (let k = 0; k < nStars * 3 && stars.length < nStars; k++) {
            const sx = x0 + rnd() * trackW, sy = 3 + rnd() * (h - 6);
            let ok = true;
            for (const bd of bodies) { if (Math.hypot(sx - bd.cx, sy - h / 2) < bd.R * 1.45 + 4) { ok = false; break; } }
            if (!ok) continue;
            const big = rnd() < 0.34;
            stars.push({ x: sx, y: sy, s: big ? 2.8 + rnd() * 3.4 : 0.8 + rnd() * 0.9, big,
                         col: STAR_COLS[Math.floor(rnd() * STAR_COLS.length)], sp: 1.2 + rnd() * 2.2, ph: rnd() * TAU,
                         d: 0.25 + rnd() * 0.75, rot: rnd() * 0.6 - 0.3 });
        }
        built = { key, bodies, stars, spacing, kfit, dpr, innerX0 };
        return built;
    };

    const drawWindow = (ctx, tex, sc, R) => {
        const win = tex.TH;
        const sx = (((sc % 1) + 1) % 1) * tex.TW;
        const first = Math.min(win, tex.TW - sx);
        const wpx = 2 * R * first / win;
        ctx.drawImage(tex.c, sx, 0, first, tex.TH, -R, -R, wpx, 2 * R);
        if (first < win) ctx.drawImage(tex.c, 0, 0, win - first, tex.TH, -R + wpx, -R, 2 * R - wpx, 2 * R);
    };

    const ringArc = (ctx, rx, ry, a0, a1, col, lw, alpha) => {
        ctx.strokeStyle = css(col, alpha);
        ctx.lineWidth = lw;
        ctx.beginPath();
        ctx.ellipse(0, 0, rx, ry, 0, a0, a1);
        ctx.stroke();
    };

    return (ctx, w, h, t, dt) => {
        const x0 = 12, x1 = w - 12, trackW = x1 - x0, mid = h / 2;
        if (trackW < 40) return;
        const L = layout(w, h);
        const calm = !!(window.KW && KW.REDUCED);
        const ga0 = ctx.globalAlpha;
        const px = NAV_INPUT.inNav ? NAV_INPUT.canvasX / Math.max(w, 1) - 0.5 : 0;
        par += (px - par) * Math.min(1, dt * 4);

        // click -> sparkle burst + bounce wave
        if (NAV_INPUT.clickImpulse > 0) {
            NAV_INPUT.clickImpulse = 0;
            const bx = NAV_INPUT.inNav ? NAV_INPUT.canvasX : w / 2, by = NAV_INPUT.inNav ? NAV_INPUT.canvasY : mid;
            waves.push({ x: bx, age: 0 });
            if (waves.length > 4) waves.shift();
            for (let i = 0; i < 12; i++) {
                const a = Math.random() * TAU, v = 30 + Math.random() * 70;
                bursts.push({ x: bx, y: by, vx: Math.cos(a) * v, vy: Math.sin(a) * v * 0.7, life: 0, max: 0.7 + Math.random() * 0.5,
                              s: 1.8 + Math.random() * 2.6, col: STAR_COLS[Math.floor(Math.random() * STAR_COLS.length)], rot: Math.random() });
            }
        }

        // hover target (nearest body to the pointer)
        let hot = -1;
        if (NAV_INPUT.inNav) {
            let best = 1e9;
            for (const bd of L.bodies) {
                const d = Math.abs(NAV_INPUT.canvasX - bd.cx);
                if (d < best) { best = d; hot = bd.i; }
            }
            if (best > L.spacing * 0.5) hot = -1;
        }

        ctx.save();

        // faint nebula washes behind everything
        ctx.globalCompositeOperation = "lighter";
        const neb = [[0.2, [150, 120, 255], 0.07], [0.52, [255, 150, 200], 0.055], [0.82, [110, 190, 255], 0.07]];
        for (let i = 0; i < neb.length; i++) {
            const nx = x0 + trackW * neb[i][0] + Math.sin(t * 0.12 + i * 2) * 30 + par * 20 * (i + 1) * 0.3;
            const nr = trackW * 0.2;
            ctx.save();
            ctx.translate(nx, mid);
            ctx.scale(1, (h * 0.42) / nr);
            const gr = ctx.createRadialGradient(0, 0, 0, 0, 0, nr);
            gr.addColorStop(0, css(neb[i][1], neb[i][2] * ga0));
            gr.addColorStop(1, css(neb[i][1], 0));
            ctx.fillStyle = gr;
            ctx.fillRect(-nr, -nr, 2 * nr, 2 * nr);
            ctx.restore();
        }

        // stars
        for (const st of L.stars) {
            const tw = 0.5 + 0.5 * Math.sin(t * st.sp + st.ph);
            const a = (0.5 + 0.5 * tw) * ga0;
            const sx = st.x + par * 14 * st.d, sy = st.y;
            ctx.fillStyle = css(st.col, a);
            if (st.big) sparkle(ctx, sx, sy, st.s * (0.8 + 0.3 * tw), st.rot + (calm ? 0 : Math.sin(t * 0.4 + st.ph) * 0.15));
            else { ctx.beginPath(); ctx.arc(sx, sy, st.s, 0, TAU); ctx.fill(); }
        }

        // shooting star
        if (!calm) {
            shoot.next -= dt;
            if (!shoot.on && shoot.next <= 0) {
                shoot.on = true; shoot.life = 0;
                shoot.x = x0 + trackW * (0.1 + Math.random() * 0.55); shoot.y = 3 + Math.random() * 6;
                shoot.vx = 190 + Math.random() * 90; shoot.vy = 55 + Math.random() * 30;
                shoot.next = 7 + Math.random() * 8;
            }
            if (shoot.on) {
                shoot.life += dt; shoot.x += shoot.vx * dt; shoot.y += shoot.vy * dt;
                const f = 1 - shoot.life / 0.9;
                if (f <= 0 || shoot.y > h + 6) shoot.on = false;
                else {
                    const len = 52, ux = shoot.vx / Math.hypot(shoot.vx, shoot.vy), uy = shoot.vy / Math.hypot(shoot.vx, shoot.vy);
                    const tx = shoot.x - ux * len, ty = shoot.y - uy * len;
                    const gr = ctx.createLinearGradient(shoot.x, shoot.y, tx, ty);
                    gr.addColorStop(0, css([255, 255, 255], 0.9 * f * ga0));
                    gr.addColorStop(0.4, css([190, 220, 255], 0.35 * f * ga0));
                    gr.addColorStop(1, css([190, 220, 255], 0));
                    ctx.strokeStyle = gr; ctx.lineWidth = 1.4; ctx.lineCap = "round";
                    ctx.beginPath(); ctx.moveTo(shoot.x, shoot.y); ctx.lineTo(tx, ty); ctx.stroke();
                    ctx.fillStyle = css([255, 255, 255], f * ga0);
                    sparkle(ctx, shoot.x, shoot.y, 3.2, t * 3);
                }
            }
        }
        ctx.globalCompositeOperation = "source-over";

        // planets
        for (const bd of L.bodies) {
            const b = bd.b, i = bd.i, R = bd.R;
            hover[i] += ((hot === i ? 1 : 0) - hover[i]) * Math.min(1, dt * 9);
            const hv = hover[i];
            if (!calm) scroll[i] += dt * b.spin * (1 + 3.2 * hv);

            let bounce = 0;
            for (const wv of waves) {
                const a = wv.age - Math.abs(bd.cx - wv.x) / 520;
                if (a > 0 && a < 1.3) bounce -= Math.sin(a * TAU * 1.1) * Math.exp(-a * 3) * h * 0.2;
            }
            // hover growth, bob and bounce are all limited to the headroom the strip leaves around this body
            let sc = 1 + 0.2 * hv;
            if (R * sc > h / 2 - 2) sc = Math.max(1, (h / 2 - 2) / R);
            const room = Math.max(0.5, h / 2 - R * sc - 1.5);
            const bob = calm ? 0 : clampv(Math.sin(t * 0.9 + bd.phase) * h * 0.04 * b.bob, -room * 0.6, room * 0.6);
            const cx = bd.cx + (calm ? 0 : Math.cos(t * 0.5 + bd.phase) * 1.6) + par * 4 * (0.4 + b.r);
            const cy = mid + clampv(bob + bounce - hv * 2.4, -room, room);

            ctx.save();
            ctx.translate(cx, cy);
            ctx.scale(sc, sc);

            // halo (additive)
            ctx.globalCompositeOperation = "lighter";
            const pulse = b.id === "sun" ? 0.85 + 0.15 * Math.sin(t * 1.6) : 1;
            ctx.globalAlpha = ga0 * Math.min(1, (0.8 + 0.5 * hv) * pulse);
            const hsw = bd.halo.SW / bd.dpr, hsh = bd.halo.SH / bd.dpr;
            ctx.drawImage(bd.halo.c, -hsw / 2, -hsh / 2, hsw, hsh);
            // sun rays
            if (b.id === "sun") {
                ctx.globalAlpha = ga0 * 0.13;
                ctx.fillStyle = css([255, 214, 120]);
                const rot = calm ? 0 : t * 0.08;
                for (let k = 0; k < 10; k++) {
                    const a = rot + k * TAU / 10;
                    const len = Math.min(R * (1.9 + 0.35 * Math.sin(t * 1.3 + k * 1.7)), (h / 2 - 6) / Math.max(Math.abs(Math.sin(a)), 0.05));
                    ctx.beginPath();
                    ctx.moveTo(Math.cos(a - 0.09) * R * 0.95, Math.sin(a - 0.09) * R * 0.95);
                    ctx.lineTo(Math.cos(a) * len, Math.sin(a) * len);
                    ctx.lineTo(Math.cos(a + 0.09) * R * 0.95, Math.sin(a + 0.09) * R * 0.95);
                    ctx.closePath(); ctx.fill();
                }
            }
            ctx.globalCompositeOperation = "source-over";
            ctx.globalAlpha = ga0;

            // rings, back half
            const ringTilt = b.id === "saturn" ? -0.38 + (calm ? 0 : 0.035 * Math.sin(t * 0.7)) : 1.32;
            if (b.ring) {
                ctx.save(); ctx.rotate(ringTilt);
                if (b.id === "saturn") {
                    const rad = [1.9, 1.62, 1.36];
                    for (let k = 0; k < 3; k++) ringArc(ctx, R * rad[k], R * rad[k] * 0.3, Math.PI, TAU, b.ring[k % b.ring.length], R * 0.17, 0.62 * ga0);
                } else ringArc(ctx, R * 1.7, R * 0.3, Math.PI, TAU, b.ring[0], Math.max(0.8, R * 0.05), 0.5 * ga0);
                ctx.restore();
            }

            // moon behind earth
            let moon = null;
            if (b.id === "earth") {
                const ma = calm ? 0.8 : t * 1.25;
                moon = { x: Math.cos(ma) * R * 2.0, y: Math.sin(ma) * R * 0.55 - R * 0.2, front: Math.sin(ma) > 0, r: Math.max(1.6, R * 0.22) };
                if (!moon.front) { ctx.fillStyle = css([236, 230, 244], 0.9 * ga0); ctx.beginPath(); ctx.arc(moon.x, moon.y, moon.r, 0, TAU); ctx.fill(); }
            }

            // body: scrolling texture inside a circular clip, then static shading on top
            ctx.save();
            ctx.beginPath(); ctx.arc(0, 0, R, 0, TAU); ctx.clip();
            drawWindow(ctx, bd.tex, scroll[i], R);
            ctx.restore();
            const ss = bd.shade.S / bd.dpr;
            ctx.drawImage(bd.shade.c, -ss / 2, -ss / 2, ss, ss);

            // rings, front half
            if (b.ring) {
                ctx.save(); ctx.rotate(ringTilt);
                if (b.id === "saturn") {
                    const rad = [1.9, 1.62, 1.36];
                    for (let k = 0; k < 3; k++) ringArc(ctx, R * rad[k], R * rad[k] * 0.3, 0, Math.PI, b.ring[k % b.ring.length], R * 0.17, 0.9 * ga0);
                } else ringArc(ctx, R * 1.7, R * 0.3, 0, Math.PI, b.ring[0], Math.max(0.8, R * 0.05), 0.75 * ga0);
                ctx.restore();
            }
            if (moon && moon.front) {
                ctx.fillStyle = css([248, 244, 252], ga0); ctx.beginPath(); ctx.arc(moon.x, moon.y, moon.r, 0, TAU); ctx.fill();
                ctx.fillStyle = css([160, 150, 190], 0.35 * ga0); ctx.beginPath(); ctx.arc(moon.x + moon.r * 0.3, moon.y + moon.r * 0.3, moon.r * 0.7, 0, TAU); ctx.fill();
            }

            // hovered: orbiting sparkles
            if (hv > 0.02) {
                ctx.globalCompositeOperation = "lighter";
                for (let k = 0; k < 3; k++) {
                    const a = t * 2.1 + k * TAU / 3, rr = R * (1.45 + 0.1 * Math.sin(t * 3 + k));
                    ctx.fillStyle = css(STAR_COLS[(k + i) % STAR_COLS.length], 0.9 * hv * ga0);
                    sparkle(ctx, Math.cos(a) * rr, Math.sin(a) * rr * 0.8, 2.2 + 1.2 * hv, a);
                }
                ctx.globalCompositeOperation = "source-over";
            }
            ctx.restore();

            // label
            if (hv > 0.04 && L.spacing > 84) {
                ctx.save();
                ctx.globalAlpha = ga0 * Math.min(1, hv * 1.2);
                ctx.font = "600 10px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
                ctx.textBaseline = "middle"; ctx.textAlign = "left";
                ctx.shadowColor = css(b.halo, 0.9); ctx.shadowBlur = 8;
                ctx.fillStyle = css(mixc(b.light, [255, 255, 255], 0.5));
                const ext = (b.id === "saturn" ? 1.95 : 1) * R * sc;
                ctx.fillText(b.name.toUpperCase(), cx + ext + 7, cy);
                ctx.restore();
            }
        }

        // click burst sparkles
        ctx.globalCompositeOperation = "lighter";
        for (let k = bursts.length - 1; k >= 0; k--) {
            const p = bursts[k];
            p.life += dt;
            if (p.life >= p.max) { bursts.splice(k, 1); continue; }
            p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.96; p.vy *= 0.96;
            const f = 1 - p.life / p.max;
            ctx.fillStyle = css(p.col, f * ga0);
            sparkle(ctx, p.x, p.y, p.s * (0.5 + f), p.rot * TAU + p.life * 3);
        }
        for (let k = waves.length - 1; k >= 0; k--) { waves[k].age += dt; if (waves[k].age > 1.6) waves.splice(k, 1); }

        ctx.restore();
        ctx.globalAlpha = ga0;
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
        navFade(ctx, W, Hh, true);
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

        if (window.THREAD_STAGE && typeof window.THREAD_STAGE.refreshSections === "function") {
            window.THREAD_STAGE.refreshSections();
        }

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
    KW.loadPage = loadPage;

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

    let lastNavPathname = location.pathname;
    window.addEventListener("popstate", () => {
        if (location.pathname !== lastNavPathname) {
            lastNavPathname = location.pathname;
            loadPage(location.href, false);
        }
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