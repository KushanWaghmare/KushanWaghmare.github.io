/* Shared app logic: theme, rendering from SITE data, GSAP transitions/scroll motion, KaTeX, sim helpers. */
(() => {
    const D = document.documentElement;
    const keys = Object.keys(SITE.domains);
    const REDUCED = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const $ = (s, r = document) => r.querySelector(s);
    const list = (key) => SITE.projects.filter((p) => p.domain === key);

    /* ---------- helpers used by sims.js ---------- */
    const KW = (window.KW = { REDUCED, mouse: { cx: -1e4, cy: -1e4 }, col: {} });
    KW.refresh = () => {
        const rgb = (n) => getComputedStyle(D).getPropertyValue(n).trim().split(",").map(Number);
        KW.col = { a: rgb("--a"), pal: keys.map((k) => rgb("--rgb-" + k)), light: D.dataset.theme === "light" };
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
        let last = performance.now(), visible = true, frames = 0;
        const io = new IntersectionObserver((e) => (visible = e[0].isIntersecting));
        io.observe(c);
        const tick = (now) => {
            if (!c.isConnected) { io.disconnect(); if (c.__dispose) c.__dispose(); return; }
            const dt = Math.min((now - last) / 1000, 0.033); last = now;
            if (visible && !document.hidden) { step(now / 1000, dt); frames++; }
            if (!(REDUCED && frames > 200)) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
    };

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
            if (ctx.state === "running") {
                try { cb(ctx.currentTime); } catch (e) {}
            } else {
                ctx.resume().then(() => {
                    unlocked = true;
                    notifyUnlock();
                    try { cb(ctx.currentTime); } catch (e) {}
                }).catch(() => {});
            }
        };

        const playTone = (freqStart, freqEnd, type, duration, volume) => {
            withContext((now) => {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                const safeVol = Math.max(volume || 0.03, 0.001);
                osc.type = type || "sine";
                osc.frequency.setValueAtTime(freqStart, now);
                if (freqEnd && freqEnd !== freqStart) {
                    osc.frequency.exponentialRampToValueAtTime(Math.max(freqEnd, 20), now + duration);
                }
                gain.gain.setValueAtTime(safeVol, now);
                gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.start(now);
                osc.stop(now + duration + 0.02);
            });
        };

        return {
            isEnabled: () => enabled,
            toggle: () => {
                enabled = !enabled;
                try { localStorage.setItem("kw_sound", String(enabled)); } catch (e) {}
                if (enabled) {
                    init();
                    playTone(520, 880, "sine", 0.08, 0.05);
                } else {
                    notifyUnlock();
                }
                return enabled;
            },
            hover: () => {
                playTone(1600, 1600, "triangle", 0.025, 0.025);
            },
            click: () => {
                playTone(900, 420, "sine", 0.035, 0.05);
            },
            theme: () => {
                playTone(520, 720, "sine", 0.045, 0.045);
                setTimeout(() => playTone(720, 960, "sine", 0.05, 0.045), 40);
            },
            copy: () => {
                playTone(523, 523, "sine", 0.07, 0.05);
                setTimeout(() => playTone(784, 784, "sine", 0.09, 0.05), 65);
            },
            warp: (pan = 0) => {
                withContext((now) => {
                    let bus = ctx.destination;
                    if (ctx.createStereoPanner) {
                        try {
                            const p = ctx.createStereoPanner();
                            p.pan.setValueAtTime(pan, now);
                            p.pan.linearRampToValueAtTime(0, now + 0.6);
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
                        bp.Q.value = 0.9;
                        bp.frequency.setValueAtTime(350, now);
                        bp.frequency.exponentialRampToValueAtTime(4200, now + 0.3);
                        bp.frequency.exponentialRampToValueAtTime(600, now + 0.75);
                        g.gain.setValueAtTime(0.0001, now);
                        g.gain.exponentialRampToValueAtTime(0.12, now + 0.28);
                        g.gain.exponentialRampToValueAtTime(0.0001, now + 0.78);
                        src.connect(bp);
                        bp.connect(g);
                        g.connect(bus);
                        src.start(now);
                        src.stop(now + 0.85);
                    }
                    const o = ctx.createOscillator();
                    const lp = ctx.createBiquadFilter();
                    const og = ctx.createGain();
                    o.type = "sawtooth";
                    lp.type = "lowpass";
                    lp.frequency.value = 900;
                    o.frequency.setValueAtTime(70, now);
                    o.frequency.exponentialRampToValueAtTime(260, now + 0.3);
                    o.frequency.exponentialRampToValueAtTime(55, now + 0.75);
                    og.gain.setValueAtTime(0.0001, now);
                    og.gain.exponentialRampToValueAtTime(0.032, now + 0.25);
                    og.gain.exponentialRampToValueAtTime(0.0001, now + 0.75);
                    o.connect(lp);
                    lp.connect(og);
                    og.connect(bus);
                    o.start(now);
                    o.stop(now + 0.85);
                });
            }
        };
    })();

    const tags = (a) => a.map((t) => `<span class="tag">${t}</span>`).join("");
    const pad = (n) => String(n + 1).padStart(2, "0");

    const projectPage = (p) => {
        const d = SITE.domains[p.domain], sib = list(p.domain), i = sib.indexOf(p);
        const nb = [sib[i - 1], sib[i + 1]].filter(Boolean);
        return `
        <nav class="snap-pager" aria-label="Project section navigation">
            <a href="#proj-hero" class="snap-dot active" data-title="00 Project" aria-label="Project Title"><span class="dot-disc"></span><span class="dot-text">00 Project</span></a>
            <a href="#proj-overview" class="snap-dot" data-title="01 Overview" aria-label="Technical Overview"><span class="dot-disc"></span><span class="dot-text">01 Overview</span></a>
            <a href="#proj-arch" class="snap-dot" data-title="02 Architecture" aria-label="Architecture"><span class="dot-disc"></span><span class="dot-text">02 Architecture</span></a>
            <a href="#proj-math" class="snap-dot" data-title="03 Mathematics" aria-label="Mathematics"><span class="dot-disc"></span><span class="dot-text">03 Mathematics</span></a>
            <a href="#proj-nav" class="snap-dot" data-title="04 Navigation" aria-label="Navigation & Related"><span class="dot-disc"></span><span class="dot-text">04 Navigation</span></a>
        </nav>

        <section class="snap-section hero" id="proj-hero" data-domain="${p.domain}">
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
            <div class="sim-tag" aria-hidden="true">${d.tag}</div>
            <a class="snap-cue" href="#proj-overview">Scroll to overview</a>
        </section>

        <section class="snap-section project-snap" id="proj-overview" data-domain="${p.domain}">
            <canvas aria-hidden="true"></canvas>
            <div class="snap-inner" style="max-width:880px">
                <div class="eyebrow" data-reveal><span class="domain-badge" style="background:var(--accent)"></span>01 / Technical Overview</div>
                <h2 class="snap-title" data-reveal style="font-size:clamp(30px, 4.2vw, 52px)">Context &amp; Formulation</h2>
                <div class="snap-overview-card glass" data-reveal>
                    ${p.intro.map((t) => `<p>${t}</p>`).join("")}
                </div>
            </div>
            <div class="sim-tag" aria-hidden="true">${d.tag}</div>
            <a class="snap-cue" href="#proj-arch">Next: Architecture</a>
        </section>

        <section class="snap-section project-snap" id="proj-arch" data-domain="${p.domain}">
            <canvas aria-hidden="true"></canvas>
            <div class="snap-inner" style="max-width:960px">
                <div class="eyebrow" data-reveal><span class="domain-badge" style="background:var(--accent)"></span>02 / Architecture &amp; Subsystems</div>
                <h2 class="snap-title" data-reveal style="font-size:clamp(30px, 4.2vw, 52px)">System Pipeline</h2>
                <ol class="snap-arch-grid" data-reveal>
                    ${p.arch.map(([n, t]) => `<li class="glass"><strong>${n}</strong><span>${t}</span></li>`).join("")}
                </ol>
            </div>
            <div class="sim-tag" aria-hidden="true">${d.tag}</div>
            <a class="snap-cue" href="#proj-math">Next: Mathematics</a>
        </section>

        <section class="snap-section project-snap" id="proj-math" data-domain="${p.domain}">
            <canvas aria-hidden="true"></canvas>
            <div class="snap-inner" style="max-width:960px">
                <div class="eyebrow" data-reveal><span class="domain-badge" style="background:var(--accent)"></span>03 / Mathematical Foundations</div>
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
            <div class="sim-tag" aria-hidden="true">${d.tag}</div>
            <a class="snap-cue" href="#proj-nav">Next: Navigation</a>
        </section>

        <section class="snap-section about-contact-section" id="proj-nav" data-domain="${p.domain}">
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

        <section class="snap-section hero" id="paper-hero" data-domain="papers" style="--a:var(--rgb-papers)">
            <canvas aria-hidden="true"></canvas>
            <div class="snap-inner" style="max-width:980px">
                <div class="crumbs" data-hero><a href="index.html">Home</a> / <a href="papers.html">Research Papers</a> / <span>${p.short || p.title}</span></div>
                <div class="eyebrow" data-hero>
                    <span class="domain-badge" style="background:var(--accent)"></span>
                    Paper ${pad(i >= 0 ? i : 0)} / ${String(papers.length).padStart(2, "0")} · <span class="paper-domain-tag" style="--tag-rgb:var(--rgb-${p.domain})">${d.name}</span> · ${p.year}
                </div>
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
            <div class="sim-tag" aria-hidden="true">Poincaré hyperbolic disc · ds² = 4|dz|²/(1 − |z|²)² · conformal Möbius citation geodesics</div>
            <a class="snap-cue" href="#paper-theory">Next: Formulation &amp; Proofs</a>
        </section>

        <section class="snap-section project-snap" id="paper-theory" data-domain="papers" style="--a:var(--rgb-papers)">
            <canvas aria-hidden="true"></canvas>
            <div class="snap-inner" style="max-width:980px">
                <div class="eyebrow" data-reveal><span class="domain-badge" style="background:var(--accent)"></span>01 / Theoretical Foundations &amp; Proofs</div>
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
            <div class="sim-tag" aria-hidden="true">Poincaré hyperbolic disc · ds² = 4|dz|²/(1 − |z|²)² · conformal Möbius citation geodesics</div>
            <a class="snap-cue" href="#paper-cite">Next: Citation &amp; Related Papers</a>
        </section>

        <section class="snap-section about-contact-section" id="paper-cite" data-domain="papers" style="--a:var(--rgb-papers)">
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
            <div class="sim-tag" aria-hidden="true">Poincaré hyperbolic disc · ds² = 4|dz|²/(1 − |z|²)² · conformal Möbius citation geodesics</div>
            <footer class="foot snap-foot"><span>© ${new Date().getFullYear()} Kushan Waghmare</span><a href="https://github.com/KushanWaghmare" target="_blank" rel="noopener">GitHub</a></footer>
        </section>`;
    };

    /* ---------- chrome: theme and sound controls ---------- */
    const chrome = () => {
        const btn = $(".theme-btn"), sync = () => { const l = D.dataset.theme === "light"; btn.textContent = l ? "☾" : "☀"; btn.setAttribute("aria-label", l ? "Switch to dark mode" : "Switch to light mode"); };
        if (btn) {
            sync();
            btn.addEventListener("click", () => {
                SOUND.theme();
                D.classList.add("tt"); setTimeout(() => D.classList.remove("tt"), 260);
                D.dataset.theme = D.dataset.theme === "light" ? "dark" : "light";
                try { localStorage.setItem("theme", D.dataset.theme); } catch (e) {}
                KW.refresh(); sync(); dispatchEvent(new Event("themechange"));
            });
        }
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
        const VECS = ["zoom", "right", "left", "bottom", "top", "right"];
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
    const navCanvas = $(".nav-live canvas");
    if (navCanvas && SIMS.nav) {
        try { SIMS.nav(navCanvas); } catch (e) { console.warn("Nav sim:", e); }
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

        if (curPage === "hub") {
            const introCanvas = $("#intro canvas");
            if (introCanvas && SIMS.hub) try { SIMS.hub(introCanvas); } catch (e) {}
            keys.forEach((k) => {
                const sc = $(`#domain-${k} canvas`);
                if (sc && SIMS[k]) try { SIMS[k](sc); } catch (e) {}
            });
            const papersCanvas = $("#section-papers canvas");
            if (papersCanvas && (SIMS.papers || SIMS.datascience)) try { (SIMS.papers || SIMS.datascience)(papersCanvas); } catch (e) {}
            const coursesCanvas = $("#section-courses canvas");
            if (coursesCanvas && (SIMS.courses || SIMS.cs)) try { (SIMS.courses || SIMS.cs)(coursesCanvas); } catch (e) {}
            const contactCanvas = $("#about-contact canvas");
            if (contactCanvas && SIMS.contact) try { SIMS.contact(contactCanvas); } catch (e) {}
        } else if (curPage === "paper" || (curPage === "papers" && u.searchParams.get("p"))) {
            const paperId = u.searchParams.get("p");
            const p = (SITE.papers || []).find((x) => x.id === paperId) || (SITE.papers && SITE.papers[0]);
            if (p) {
                D.dataset.page = "paper";
                D.dataset.domain = "papers";
                curTitle = `${p.title} · Kushan Waghmare`;
                document.title = curTitle;
                main.innerHTML = paperDetailPage(p);
                document.querySelectorAll(".snap-section canvas").forEach((c) => {
                    if (SIMS.papers) try { SIMS.papers(c); } catch (err) {}
                });
            }
        } else if (curPage === "domain" || curPage === "papers" || curPage === "courses") {
            document.querySelectorAll(".snap-section canvas").forEach((c) => {
                const sec = c.closest(".snap-section");
                const pid = sec && sec.id && sec.id.startsWith("proj-") ? sec.id.slice(5) : (sec && sec.id && sec.id.startsWith("paper-") ? sec.id.slice(6) : (sec && sec.id && sec.id.startsWith("track-") ? sec.id.slice(6) : null));
                const sd = (pid && SIMS[pid]) ? pid : (sec && sec.dataset.domain ? sec.dataset.domain : curDomain);
                try { if (SIMS[sd]) SIMS[sd](c); } catch (err) {}
            });
        } else {
            const p = SITE.projects.find((x) => x.id === u.searchParams.get("p"));
            if (p) {
                D.dataset.domain = p.domain;
                KW.refresh();
                document.title = `${p.title} · Kushan Waghmare`;
                main.innerHTML = projectPage(p);
                document.querySelectorAll(".snap-section canvas").forEach((c) => {
                    const fn = SIMS[p.id] || SIMS[p.domain];
                    try { if (fn) fn(c); } catch (err) {}
                });
            } else {
                const introCanvas = $("#proj-index-hero canvas");
                if (introCanvas && SIMS.hub) try { SIMS.hub(introCanvas); } catch (e) {}
                SITE.projects.forEach((proj) => {
                    const c = $(`#proj-${proj.id} canvas`);
                    const fn = SIMS[proj.id] || SIMS[proj.domain];
                    if (c && fn) try { fn(c); } catch (e) {}
                });
            }
        }

        setupSnapObserver();
        observeReveals();
        const renderMath = () => {
            if (window.renderMathInElement) {
                renderMathInElement(main, {
                    throwOnError: false,
                    delimiters: [{ left: "$$", right: "$$", display: true }, { left: "$", right: "$", display: false }]
                });
            }
        };
        renderMath();
        if (!window.renderMathInElement) window.addEventListener("load", renderMath, { once: true });
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
        const target = e.target.closest && e.target.closest(".snap-dot, .pill, .snap-cta-btn, .card, .copy-btn, .theme-btn, .sound-btn, .nav a, .snap-cue");
        if (target) {
            const now = performance.now();
            if (now - lastHoverTime > 65) {
                SOUND.hover();
                lastHoverTime = now;
            }
        }
    }, { passive: true });
})();
