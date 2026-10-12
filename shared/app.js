/* Shared app logic: theme, rendering from SITE data, GSAP transitions/scroll motion, KaTeX, sim helpers. */
(() => {
    const D = document.documentElement;
    const page = D.dataset.page; // hub | domain | project
    const keys = Object.keys(SITE.domains);
    const REDUCED = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const $ = (s, r = document) => r.querySelector(s);
    const pad = (n) => String(n + 1).padStart(2, "0");
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
    KW.fit = (c, cb) => { // size canvas to its parent, call cb(w,h,dpr) now and on every resize
        const p = c.parentElement;
        const f = () => {
            const dpr = Math.min(devicePixelRatio || 1, 2), w = p.clientWidth, h = p.clientHeight;
            c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); cb(w, h, dpr);
        };
        f(); new ResizeObserver(f).observe(p);
    };
    KW.loop = (c, step) => { // rAF loop that pauses off-screen / hidden tab; under reduced-motion it settles after ~200 frames
        let last = performance.now(), visible = true, frames = 0;
        new IntersectionObserver((e) => (visible = e[0].isIntersecting)).observe(c);
        const tick = (now) => {
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

        const notifyUnlock = () => window.dispatchEvent(new Event("audiounlock"));

        const init = () => {
            if (!ctx) {
                const AC = window.AudioContext || window.webkitAudioContext;
                if (AC) {
                    ctx = new AC();
                    ctx.onstatechange = () => {
                        if (ctx.state === "running") notifyUnlock();
                    };
                }
            }
            if (ctx && ctx.state === "suspended") {
                ctx.resume().then(notifyUnlock).catch(() => {});
            } else if (ctx && ctx.state === "running") {
                notifyUnlock();
            }
        };

        ["pointerdown", "keydown", "touchstart"].forEach((ev) => {
            window.addEventListener(ev, init, { passive: true });
        });

        let noiseBuf = null;
        const noise = () => {
            if (!noiseBuf) {
                noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
                const d = noiseBuf.getChannelData(0);
                for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
            }
            return noiseBuf;
        };

        const playTone = (freqStart, freqEnd, type, duration, volume) => {
            if (!enabled || !ctx || ctx.state !== "running") return;
            try {
                const now = ctx.currentTime;
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.type = type || "sine";
                osc.frequency.setValueAtTime(freqStart, now);
                if (freqEnd && freqEnd !== freqStart) {
                    osc.frequency.exponentialRampToValueAtTime(Math.max(freqEnd, 20), now + duration);
                }
                gain.gain.setValueAtTime(volume, now);
                gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.start(now);
                osc.stop(now + duration);
            } catch (e) {}
        };

        return {
            isEnabled: () => enabled,
            isUnlocked: () => Boolean(ctx && ctx.state === "running"),
            unlock: () => {
                enabled = true;
                try { localStorage.setItem("kw_sound", "true"); } catch (e) {}
                init();
                if (ctx) {
                    ctx.resume().then(() => {
                        notifyUnlock();
                        playTone(520, 880, "sine", 0.08, 0.045);
                    }).catch(() => {});
                }
            },
            toggle: () => {
                init();
                enabled = !enabled;
                try { localStorage.setItem("kw_sound", enabled); } catch (e) {}
                return enabled;
            },
            snap: () => {
                init();
                playTone(580, 180, "sine", 0.038, 0.035);
            },
            hover: () => {
                init();
                playTone(1800, 1800, "triangle", 0.014, 0.015);
            },
            click: () => {
                init();
                playTone(900, 420, "sine", 0.028, 0.04);
            },
            theme: () => {
                init();
                playTone(520, 720, "sine", 0.045, 0.04);
                setTimeout(() => playTone(720, 960, "sine", 0.05, 0.04), 40);
            },
            copy: () => {
                init();
                playTone(523, 523, "sine", 0.07, 0.045);
                setTimeout(() => playTone(784, 784, "sine", 0.09, 0.045), 65);
            },
            // Supersonic woosh: band-passed noise sweeping up then down (air rush) plus a
            // low-passed sawtooth whose pitch climbs and drops (turbine Doppler), panned from the entry side.
            warp: (pan = 0) => {
                init();
                if (!enabled || !ctx || ctx.state !== "running") return;
                try {
                    const now = ctx.currentTime;
                    let bus = ctx.destination;
                    if (ctx.createStereoPanner) {
                        const p = ctx.createStereoPanner();
                        p.pan.setValueAtTime(pan, now); p.pan.linearRampToValueAtTime(0, now + 0.6);
                        p.connect(ctx.destination); bus = p;
                    }
                    const src = ctx.createBufferSource(), bp = ctx.createBiquadFilter(), g = ctx.createGain();
                    src.buffer = noise(); bp.type = "bandpass"; bp.Q.value = 0.9;
                    bp.frequency.setValueAtTime(350, now);
                    bp.frequency.exponentialRampToValueAtTime(4200, now + 0.3);
                    bp.frequency.exponentialRampToValueAtTime(600, now + 0.75);
                    g.gain.setValueAtTime(0.0001, now);
                    g.gain.exponentialRampToValueAtTime(0.11, now + 0.28);
                    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.78);
                    src.connect(bp).connect(g).connect(bus); src.start(now); src.stop(now + 0.8);
                    const o = ctx.createOscillator(), lp = ctx.createBiquadFilter(), og = ctx.createGain();
                    o.type = "sawtooth"; lp.type = "lowpass"; lp.frequency.value = 900;
                    o.frequency.setValueAtTime(70, now);
                    o.frequency.exponentialRampToValueAtTime(260, now + 0.3);
                    o.frequency.exponentialRampToValueAtTime(55, now + 0.75);
                    og.gain.setValueAtTime(0.0001, now);
                    og.gain.exponentialRampToValueAtTime(0.025, now + 0.25);
                    og.gain.exponentialRampToValueAtTime(0.0001, now + 0.75);
                    o.connect(lp).connect(og).connect(bus); o.start(now); o.stop(now + 0.8);
                } catch (e) {}
            },
            // Mechanical lock-in when a section lands: low thump + high-passed latch click + servo tick.
            lock: () => {
                init();
                if (!enabled || !ctx || ctx.state !== "running") return;
                playTone(170, 50, "sine", 0.12, 0.09);
                try {
                    const now = ctx.currentTime, src = ctx.createBufferSource(), hp = ctx.createBiquadFilter(), g = ctx.createGain();
                    src.buffer = noise(); hp.type = "highpass"; hp.frequency.value = 2500;
                    g.gain.setValueAtTime(0.06, now); g.gain.exponentialRampToValueAtTime(0.0001, now + 0.03);
                    src.connect(hp).connect(g).connect(ctx.destination); src.start(now); src.stop(now + 0.04);
                } catch (e) {}
                setTimeout(() => playTone(2400, 2400, "triangle", 0.02, 0.02), 28);
            }
        };
    })();

    /* ---------- page templates ---------- */
    const tags = (a) => a.map((t) => `<span class="tag">${t}</span>`).join("");
    const card = (p, i) => `
        <a class="card glass" href="project.html?p=${p.id}" data-reveal>
            <span class="no">${pad(i)} <span class="dot"></span> ${p.status}</span>
            <h3>${p.title}</h3><p>${p.summary}</p>
            <div class="tags">${tags(p.tags)}</div><span class="go">Open project</span>
        </a>`;
    const hero = (inner, short) => `
        <section class="hero${short ? " short-hero" : ""}"><canvas aria-hidden="true"></canvas>
            <div class="hero-inner">${inner}</div><div class="sim-tag" aria-hidden="true"></div>
            ${short ? "" : `<a class="cue" href="#content">Scroll</a>`}
        </section>`;

    const VEC = ["right", "left", "bottom", "top", "right"];
    const hubPage = () => `
        <nav class="snap-pager" aria-label="Section navigation">
            <a href="#intro" class="snap-dot active" data-title="00 Intro" aria-label="Introduction"><span class="dot-disc"></span><span class="dot-text">00 Intro</span></a>
            ${keys.map((k, i) => `
            <a href="#domain-${k}" class="snap-dot" data-d="${k}" data-title="${pad(i)} ${SITE.domains[k].short}" aria-label="${SITE.domains[k].name}"><span class="dot-disc" style="--a:var(--rgb-${k})"></span><span class="dot-text">${pad(i)} ${SITE.domains[k].short}</span></a>`).join("")}
            <a href="#about-contact" class="snap-dot" data-title="06 Contact" aria-label="About & Contact"><span class="dot-disc"></span><span class="dot-text">06 Contact</span></a>
        </nav>

        <section class="snap-section hero" id="intro" data-domain="hub" data-enter="zoom">
            <canvas aria-hidden="true"></canvas>
            <div class="snap-inner">
                <div class="eyebrow" data-hero>Data Science · Quantitative Finance · IIT Madras</div>
                <h1 data-hero>Kushan<br>Waghmare</h1>
                <p class="lead" data-hero>Data Science &amp; Quantitative Finance student at IIT Madras, building complex systems from compilers to statistical-arbitrage models, and studying the physics underneath them.</p>
                <div class="hero-eq glass" data-hero>$$\\dot x=\\sigma(y-x),\\quad\\dot y=x(\\rho-z)-y,\\quad\\dot z=xy-\\beta z$$</div>
                <div class="snap-jump-pills" data-hero>
                    <span class="snap-jump-label">Explore domains:</span>
                    ${keys.map((k) => `<a href="#domain-${k}" class="pill jump-pill" style="--a:var(--rgb-${k})">${SITE.domains[k].name}</a>`).join("")}
                </div>
            </div>
            <div class="sim-tag" aria-hidden="true">Lorenz system · σ=10, ρ=28, β=8/3 · RK4 · 5 domain trajectories</div>
            <a class="snap-cue" href="#domain-math">Scroll to explore domains</a>
        </section>

        ${keys.map((k, i) => {
            const d = SITE.domains[k], ps = list(k);
            const nextKey = keys[i + 1] ? `domain-${keys[i + 1]}` : "about-contact";
            const nextLabel = keys[i + 1] ? `Next: ${SITE.domains[keys[i + 1]].name}` : "Next: About & Contact";
            return `
        <section class="snap-section domain-snap" id="domain-${k}" data-domain="${k}" data-enter="${VEC[i]}" style="--a:var(--rgb-${k})">
            <canvas aria-hidden="true"></canvas>
            <div class="snap-inner">
                <div class="eyebrow" data-reveal><span class="domain-badge" style="background:var(--accent)"></span>${pad(i)} / ${d.label}</div>
                <h2 class="snap-title" data-reveal>${d.name}</h2>
                <p class="lead snap-lead" data-reveal>${d.blurb}</p>
                <div class="hero-eq glass snap-eq" data-reveal>$$${d.eq}$$</div>
                <div class="snap-projects" data-reveal>
                    <span class="snap-proj-label">Featured work:</span>
                    ${ps.map(p => `<a href="project.html?p=${p.id}" class="snap-proj-pill glass"><strong>${p.title}</strong><span class="tag-status">${p.status}</span></a>`).join("")}
                </div>
                <div class="snap-actions" data-reveal>
                    <a href="${d.file}" class="snap-cta-btn glass" style="--a:var(--rgb-${k})">
                        <span>Explore ${d.name} Section</span>
                        <span class="arr">→</span>
                    </a>
                    <span class="snap-count">${ps.length} technical deep-dives</span>
                </div>
            </div>
            <div class="sim-tag" aria-hidden="true">${d.tag}</div>
            <a class="snap-cue" href="#${nextKey}">${nextLabel}</a>
        </section>`;
        }).join("")}

        <section class="snap-section about-contact-section" id="about-contact" data-domain="hub" data-enter="bottom">
            <div class="snap-inner" style="max-width:960px">
                <div class="section-head" data-reveal><span class="idx">06</span><h2>About &amp; Profile</h2></div>
                <div class="two-col" style="margin-bottom:36px">
                    <div data-reveal>
                        <p class="lead">I work where data science, quantitative finance and physics overlap: stochastic models for markets, symplectic integrators for mechanics, compilers and hardware for the machines that run them.</p>
                        <div class="tags" style="margin-top:20px">${tags(["Python", "C", "Java", "SQL", "Machine Learning", "Options Pricing", "Statistical Arbitrage", "LLVM", "Pandas", "Git"])}</div>
                    </div>
                    <div class="edu" data-reveal>
                        <div class="glass"><strong>Indian Institute of Technology Madras</strong><span>Bachelor of Science in Data Science · 2023 – 2027</span></div>
                        <div class="glass"><strong>Vidya Bharati Mahavidyalaya</strong><span>Bachelor of Science in Physics · 2025 – 2028</span></div>
                    </div>
                </div>
                ${contactSection()}
            </div>
            <footer class="foot snap-foot"><span>© ${new Date().getFullYear()} Kushan Waghmare</span><a href="https://github.com/KushanWaghmare" target="_blank" rel="noopener">GitHub</a></footer>
        </section>`;

    const contactSection = () => `
        <div class="contact-card glass" data-reveal>
            <div class="contact-header">
                <span class="contact-status"><span class="status-dot"></span> Available for research &amp; engineering opportunities</span>
                <h3 class="contact-title">Let's build something rigorous together.</h3>
                <p class="contact-lead">Interested in collaborative research, machine learning engineering, quantitative modelling, or high-performance systems? Reach out directly via email or inspect my code repositories.</p>
            </div>
            <div class="contact-grid">
                <div class="contact-item">
                    <span class="contact-label">Direct Email</span>
                    <a href="mailto:kushanwaghmare@gmail.com" class="contact-value">kushanwaghmare@gmail.com</a>
                    <button type="button" class="copy-btn pill" data-copy="kushanwaghmare@gmail.com" aria-label="Copy email address to clipboard">
                        <span class="copy-icon">⎘</span> <span class="copy-text">Copy Email</span>
                    </button>
                </div>
                <div class="contact-item">
                    <span class="contact-label">Code Repositories</span>
                    <a href="https://github.com/KushanWaghmare" target="_blank" rel="noopener" class="contact-value">github.com/KushanWaghmare</a>
                    <a href="https://github.com/KushanWaghmare" target="_blank" rel="noopener" class="pill">View GitHub →</a>
                </div>
                <div class="contact-item">
                    <span class="contact-label">Affiliations &amp; Location</span>
                    <span class="contact-value">IIT Madras · Chennai, India</span>
                    <span class="contact-sub">Vidya Bharati Mahavidyalaya · Amravati</span>
                </div>
            </div>
        </div>`;

    const others = (key) => `<div class="pills" data-reveal>${keys.filter((k) => k !== key).map((k) =>
        `<a class="pill" style="--a:var(--rgb-${k})" href="${SITE.domains[k].file}">${SITE.domains[k].name}</a>`).join("")}</div>`;

    const domainPage = (key) => {
        const d = SITE.domains[key], ps = list(key);
        const domainIdx = keys.indexOf(key);
        return `
        <nav class="snap-pager" aria-label="Section navigation">
            <a href="#domain-intro" class="snap-dot active" data-title="00 Overview" aria-label="${d.name} Overview"><span class="dot-disc"></span><span class="dot-text">00 Overview</span></a>
            ${ps.map((p, i) => `
            <a href="#proj-${p.id}" class="snap-dot" data-title="${pad(i)} ${p.title}" aria-label="${p.title}"><span class="dot-disc"></span><span class="dot-text">${pad(i)} ${p.title}</span></a>`).join("")}
            <a href="#domain-explore" class="snap-dot" data-title="${String(ps.length + 1).padStart(2, "0")} Explore" aria-label="Explore other domains"><span class="dot-disc"></span><span class="dot-text">${String(ps.length + 1).padStart(2, "0")} Explore</span></a>
        </nav>

        <section class="snap-section hero" id="domain-intro" data-domain="${key}">
            <canvas aria-hidden="true"></canvas>
            <div class="snap-inner">
                <div class="eyebrow" data-hero><span class="domain-badge" style="background:var(--accent)"></span>${pad(domainIdx)} / ${d.label}</div>
                <h1 data-hero>${d.name}</h1>
                <p class="lead" data-hero>${d.blurb}</p>
                <div class="hero-eq glass snap-eq" data-hero>$$${d.eq}$$</div>
                <div class="snap-jump-pills" data-hero>
                    <span class="snap-jump-label">Selected work:</span>
                    ${ps.map((p) => `<a href="#proj-${p.id}" class="pill jump-pill"><strong>${p.title}</strong></a>`).join("")}
                </div>
            </div>
            <div class="sim-tag" aria-hidden="true">${d.tag}</div>
            <a class="snap-cue" href="#proj-${ps[0].id}">Scroll to projects</a>
        </section>

        ${ps.map((p, i) => {
            const nextTarget = ps[i + 1] ? `#proj-${ps[i + 1].id}` : "#domain-explore";
            const nextLabel = ps[i + 1] ? `Next: ${ps[i + 1].title}` : "Next: Explore other domains";
            const eq = (p.math && p.math[0] && p.math[0].eq) ? p.math[0].eq : d.eq;
            return `
        <section class="snap-section project-snap" id="proj-${p.id}" data-domain="${key}">
            <canvas aria-hidden="true"></canvas>
            <div class="snap-inner">
                <div class="eyebrow" data-reveal><span class="domain-badge" style="background:var(--accent)"></span>Project ${pad(i)} / ${String(ps.length).padStart(2, "0")} · ${d.name}</div>
                <h2 class="snap-title" data-reveal>${p.title}</h2>
                <p class="lead snap-lead" data-reveal>${p.summary}</p>
                <div class="hero-eq glass snap-eq" data-reveal>$$${eq}$$</div>
                <div class="snap-projects" data-reveal>
                    <span class="snap-proj-label">Architecture:</span>
                    ${p.tags.map(t => `<span class="snap-proj-pill glass"><strong>${t}</strong></span>`).join("")}
                    <span class="tag-status">${p.status}</span>
                </div>
                <div class="snap-actions" data-reveal>
                    <a href="project.html?p=${p.id}" class="snap-cta-btn glass">
                        <span>Read Deep-Dive &amp; Architecture</span>
                        <span class="arr">→</span>
                    </a>
                    <span class="snap-count">${p.arch ? p.arch.length : 4} core subsystems</span>
                </div>
            </div>
            <div class="sim-tag" aria-hidden="true">${d.tag}</div>
            <a class="snap-cue" href="${nextTarget}">${nextLabel}</a>
        </section>`;
        }).join("")}

        <section class="snap-section about-contact-section" id="domain-explore" data-domain="${key}">
            <div class="snap-inner" style="max-width:960px">
                <div class="section-head" data-reveal><span class="idx">${String(ps.length + 1).padStart(2, "0")}</span><h2>Explore Other Domains</h2></div>
                <p class="lead" data-reveal style="margin-bottom:28px">Navigate through other core domains of mathematical modelling, physics simulations, stochastic calculus, and machine systems.</p>
                <div class="pills" data-reveal style="margin-bottom:36px">
                    ${keys.filter(k => k !== key).map(k => `
                    <a class="pill" style="--a:var(--rgb-${k})" href="${SITE.domains[k].file}">${SITE.domains[k].name} →</a>`).join("")}
                    <a class="pill" href="index.html">← Back to Hub</a>
                </div>
                ${contactSection()}
            </div>
            <footer class="foot snap-foot"><span>© ${new Date().getFullYear()} Kushan Waghmare</span><a href="https://github.com/KushanWaghmare" target="_blank" rel="noopener">GitHub</a></footer>
        </section>`;
    };

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

    const projectIndexPage = () => {
        return `
        <nav class="snap-pager" aria-label="Section navigation">
            <a href="#proj-index-hero" class="snap-dot active" data-title="00 Overview" aria-label="Overview"><span class="dot-disc"></span><span class="dot-text">00 Overview</span></a>
            ${SITE.projects.map((p, i) => `
            <a href="#proj-${p.id}" class="snap-dot" data-title="${pad(i)} ${p.title}" aria-label="${p.title}"><span class="dot-disc" style="--a:var(--rgb-${p.domain})"></span><span class="dot-text">${pad(i)} ${p.title}</span></a>`).join("")}
        </nav>

        <section class="snap-section hero" id="proj-index-hero" data-domain="hub">
            <canvas aria-hidden="true"></canvas>
            <div class="snap-inner">
                <div class="crumbs" data-hero><a href="index.html">Home</a> / Projects</div>
                <h1 data-hero>Selected Projects</h1>
                <p class="lead" data-hero>Deep-dives into systems architecture, stochastic models and mathematical foundations across all 5 domains.</p>
                <div class="snap-jump-pills" data-hero>
                    <span class="snap-jump-label">Jump to domain:</span>
                    ${keys.map((k) => `<a href="${SITE.domains[k].file}" class="pill jump-pill" style="--a:var(--rgb-${k})">${SITE.domains[k].name}</a>`).join("")}
                </div>
            </div>
            <div class="sim-tag" aria-hidden="true">Index of 10 technical deep-dives</div>
            <a class="snap-cue" href="#proj-${SITE.projects[0].id}">Scroll to projects</a>
        </section>

        ${SITE.projects.map((p, i) => {
            const d = SITE.domains[p.domain];
            const nextTarget = SITE.projects[i + 1] ? `#proj-${SITE.projects[i + 1].id}` : "#proj-index-hero";
            const nextLabel = SITE.projects[i + 1] ? `Next: ${SITE.projects[i + 1].title}` : "Back to top";
            const eq = (p.math && p.math[0] && p.math[0].eq) ? p.math[0].eq : d.eq;
            return `
        <section class="snap-section project-snap" id="proj-${p.id}" data-domain="${p.domain}" style="--a:var(--rgb-${p.domain})">
            <canvas aria-hidden="true"></canvas>
            <div class="snap-inner">
                <div class="eyebrow" data-reveal><span class="domain-badge" style="background:var(--accent)"></span>Project ${pad(i)} / ${String(SITE.projects.length).padStart(2, "0")} · ${d.name}</div>
                <h2 class="snap-title" data-reveal>${p.title}</h2>
                <p class="lead snap-lead" data-reveal>${p.summary}</p>
                <div class="hero-eq glass snap-eq" data-reveal>$$${eq}$$</div>
                <div class="snap-projects" data-reveal>
                    <span class="snap-proj-label">Architecture:</span>
                    ${p.tags.map(t => `<span class="snap-proj-pill glass"><strong>${t}</strong></span>`).join("")}
                    <span class="tag-status">${p.status}</span>
                </div>
                <div class="snap-actions" data-reveal>
                    <a href="project.html?p=${p.id}" class="snap-cta-btn glass" style="--a:var(--rgb-${p.domain})">
                        <span>Read Deep-Dive &amp; Architecture</span>
                        <span class="arr">→</span>
                    </a>
                    <span class="snap-count">${p.arch ? p.arch.length : 4} core subsystems</span>
                </div>
            </div>
            <div class="sim-tag" aria-hidden="true">${d.tag}</div>
            <a class="snap-cue" href="${nextTarget}">${nextLabel}</a>
        </section>`;
        }).join("")}
        `;
    };

    /* ---------- chrome: nav, theme toggle, sound toggle, footer ---------- */
    const chrome = () => {
        const active = D.dataset.domain;
        const isHub = page === "hub";
        if (!$(".nav")) {
            document.body.insertAdjacentHTML("beforeend", `
                <div class="progress"></div>
                <header class="nav glass">
                    <a class="brand" href="index.html" aria-label="Home">KW<b>/</b><span>portfolio</span></a>
                    <div class="nav-live" aria-hidden="true"><canvas></canvas></div>
                    <nav class="links" aria-label="Navigation">
                        ${isHub ? '<a href="#about-contact" class="nav-contact-link"><span class="full">Contact</span><span class="short">Contact</span></a>' : ''}
                        <button class="theme-btn" type="button" aria-label="Switch theme"></button>
                        <button class="sound-btn needs-unlock" type="button" aria-label="Enable sound effects" title="Enable audio">🔇 <span class="sound-label">Enable Audio</span></button>
                    </nav>
                </header>
                <main id="main"></main>
                ${isHub ? '' : `<footer class="foot"><span>© ${new Date().getFullYear()} Kushan Waghmare</span><a href="https://github.com/KushanWaghmare" target="_blank" rel="noopener">GitHub</a></footer>`}`);
        }
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
                const unlocked = SOUND.isUnlocked();
                const active = on && unlocked;
                const waiting = on && !unlocked;
                soundBtn.innerHTML = waiting
                    ? `🔇 <span class="sound-label">Enable Audio</span>`
                    : active
                    ? `🔊 <span class="sound-label">Audio On</span>`
                    : `🔇 <span class="sound-label">Muted</span>`;
                soundBtn.setAttribute("aria-label", active ? "Mute sound effects" : "Enable sound effects");
                soundBtn.classList.toggle("needs-unlock", waiting);
                soundBtn.classList.toggle("muted", !on);
            };
            syncSound();
            window.addEventListener("audiounlock", syncSound);
            soundBtn.addEventListener("click", (e) => {
                e.stopPropagation();
                if (!SOUND.isUnlocked() && SOUND.isEnabled()) {
                    SOUND.unlock();
                } else {
                    const on = SOUND.toggle();
                    if (on) SOUND.unlock();
                }
                syncSound();
            });
        }
    };

    /* ---------- motion: native scroll-triggered reveals and progress ---------- */
    const motion = () => {
        if (REDUCED) {
            document.querySelectorAll("[data-reveal], [data-hero]").forEach((el) => el.classList.add("revealed"));
            return;
        }
        const io = new IntersectionObserver((entries) => {
            entries.forEach((e) => {
                if (e.isIntersecting) {
                    e.target.classList.add("revealed");
                    io.unobserve(e.target);
                }
            });
        }, { threshold: 0.1 });
        document.querySelectorAll("[data-reveal], [data-hero]").forEach((el) => io.observe(el));

        const prog = $(".progress");
        if (prog) {
            const onScroll = () => {
                const max = D.scrollHeight - window.innerHeight;
                if (max > 0) prog.style.transform = `scaleX(${window.scrollY / max})`;
            };
            window.addEventListener("scroll", onScroll, { passive: true });
        }
    };

    /* ---------- snap observer & supersonic warp engine ---------- */
    const setupSnapObserver = () => {
        const sections = Array.from(document.querySelectorAll(".snap-section"));
        if (!sections.length) return;
        const VECS = ["zoom", "right", "left", "bottom", "top", "right"];
        sections.forEach((s, i) => {
            if (!s.dataset.enter) s.dataset.enter = VECS[i % VECS.length];
        });

        const dots = document.querySelectorAll(".snap-dot");
        let lastId = null, curIdx = 0, warping = false, lastWarpStart = 0;

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
                    ctx.stroke();
                }
                requestAnimationFrame(frame);
            };
            requestAnimationFrame(frame);
        };

        const warpTo = (targetIdx) => {
            if (targetIdx < 0 || targetIdx >= sections.length || targetIdx === curIdx) return;
            const next = sections[targetIdx];
            if (REDUCED || window.innerWidth <= 900) {
                next.scrollIntoView({ behavior: REDUCED ? "instant" : "smooth" });
                return;
            }
            if (warping) return;
            warping = true;
            lastWarpStart = performance.now();
            const cur = sections[curIdx];
            curIdx = targetIdx;

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
                void next.offsetWidth;
                cur.classList.remove("warp-out");
                next.classList.remove("warp-in");
                next.classList.add("warp-land");
            }, 210);

            setTimeout(() => {
                SOUND.lock();
                SOUND.snap();
            }, 460);

            setTimeout(() => {
                next.classList.remove("warp-land");
                warping = false;
            }, 760);
        };
        KW.warpTo = warpTo;

        window.addEventListener("wheel", (e) => {
            if (REDUCED || window.innerWidth <= 900 || e.ctrlKey || e.metaKey) return;
            e.preventDefault();
            const now = performance.now();
            if (warping || now - lastWarpStart < 820) return;
            if (Math.abs(e.deltaY) < 12) return;
            warpTo(curIdx + (e.deltaY > 0 ? 1 : -1));
        }, { passive: false });

        window.addEventListener("keydown", (e) => {
            if (REDUCED || window.innerWidth <= 900) return;
            if (e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
            if (e.key === "ArrowDown" || e.key === "PageDown" || (e.key === " " && !e.shiftKey)) {
                e.preventDefault();
                warpTo(curIdx + 1);
            } else if (e.key === "ArrowUp" || e.key === "PageUp" || (e.key === " " && e.shiftKey)) {
                e.preventDefault();
                warpTo(curIdx - 1);
            }
        });

        document.addEventListener("click", (e) => {
            const a = e.target.closest && e.target.closest('a[href^="#"]');
            if (!a) return;
            const id = a.getAttribute("href").slice(1);
            const idx = sections.findIndex((s) => s.id === id);
            if (idx !== -1 && !REDUCED && window.innerWidth > 900) {
                e.preventDefault();
                warpTo(idx);
            }
        });

        const observer = new IntersectionObserver((entries) => {
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
                        SOUND.snap();
                    }
                    lastId = id;
                }
            });
        }, { threshold: 0.5 });

        sections.forEach((s) => observer.observe(s));
    };

    /* ---------- boot ---------- */
    KW.refresh();
    chrome();
    const main = $("#main");
    if (page === "hub") {
        if (!main.firstElementChild) main.innerHTML = hubPage();
        const introCanvas = $("#intro canvas");
        if (introCanvas && SIMS.hub) {
            try { SIMS.hub(introCanvas); } catch (e) { console.warn("Hub sim:", e); }
        }
        keys.forEach((k) => {
            const sc = $(`#domain-${k} canvas`);
            if (sc && SIMS[k]) {
                try { SIMS[k](sc); } catch (e) { console.warn(`${k} sim:`, e); }
            }
        });
        setupSnapObserver();
    } else if (page === "domain") {
        const sim = D.dataset.domain;
        if (!main.firstElementChild) main.innerHTML = domainPage(sim);
        document.querySelectorAll(".snap-section canvas").forEach((c) => {
            try { if (sim && SIMS[sim]) SIMS[sim](c); } catch (err) { console.warn("Simulation unavailable:", err); }
        });
        setupSnapObserver();
    } else {
        const p = SITE.projects.find((x) => x.id === new URLSearchParams(location.search).get("p"));
        if (p) {
            D.dataset.domain = p.domain;
            KW.refresh();
            document.title = `${p.title} · Kushan Waghmare`;
            main.innerHTML = projectPage(p);
            document.querySelectorAll(".snap-section canvas").forEach((c) => {
                try { if (p.domain && SIMS[p.domain]) SIMS[p.domain](c); } catch (err) {}
            });
            setupSnapObserver();
        } else {
            if (!main.firstElementChild) main.innerHTML = projectIndexPage();
            const introCanvas = $("#proj-index-hero canvas");
            if (introCanvas && SIMS.hub) {
                try { SIMS.hub(introCanvas); } catch (e) {}
            }
            SITE.projects.forEach((proj) => {
                const c = $(`#proj-${proj.id} canvas`);
                if (c && SIMS[proj.domain]) try { SIMS[proj.domain](c); } catch (e) {}
            });
            setupSnapObserver();
        }
    }
    const navCanvas = $(".nav-live canvas");
    if (navCanvas && SIMS.nav) {
        try { SIMS.nav(navCanvas); } catch (e) { console.warn("Nav sim:", e); }
    }
    if (window.renderMathInElement) renderMathInElement(document.body, { throwOnError: false,
        delimiters: [{ left: "$$", right: "$$", display: true }, { left: "$", right: "$", display: false }] });
    document.addEventListener("pointermove", (e) => { // spotlight follows the cursor on cards
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

    motion();
})();
