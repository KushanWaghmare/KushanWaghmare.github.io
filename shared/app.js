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

    const hubPage = () => `
        <nav class="snap-pager" aria-label="Section navigation">
            <a href="#intro" class="snap-dot active" data-title="00 Intro" aria-label="Introduction"><span class="dot-disc"></span><span class="dot-text">00 Intro</span></a>
            ${keys.map((k, i) => `
            <a href="#domain-${k}" class="snap-dot" data-d="${k}" data-title="${pad(i)} ${SITE.domains[k].short}" aria-label="${SITE.domains[k].name}"><span class="dot-disc" style="--a:var(--rgb-${k})"></span><span class="dot-text">${pad(i)} ${SITE.domains[k].short}</span></a>`).join("")}
            <a href="#about-contact" class="snap-dot" data-title="06 Contact" aria-label="About & Contact"><span class="dot-disc"></span><span class="dot-text">06 Contact</span></a>
        </nav>

        <section class="snap-section hero" id="intro" data-domain="hub">
            <canvas aria-hidden="true"></canvas>
            <div class="snap-inner hero-inner">
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
        <section class="snap-section domain-snap" id="domain-${k}" data-domain="${k}" style="--a:var(--rgb-${k})">
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

        <section class="snap-section about-contact-section" id="about-contact" data-domain="hub">
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
        return hero(`
            <div class="eyebrow" data-hero>${pad(keys.indexOf(key))} / ${d.label}</div>
            <h1 data-hero>${d.name}</h1>
            <p class="lead" data-hero>${d.blurb}</p>
            <div class="hero-eq glass" data-hero>$$${d.eq}$$</div>`) +
        `<section class="section" id="content">
            <div class="section-head" data-reveal><span class="idx">${ps.length} projects</span><h2>Selected work</h2></div>
            <div class="grid">${ps.map(card).join("")}</div>
        </section>
        <section class="section"><div class="section-head" data-reveal><span class="idx">→</span><h2>Other domains</h2></div>${others(key)}</section>`;
    };

    const projectPage = (p) => {
        const d = SITE.domains[p.domain], sib = list(p.domain), i = sib.indexOf(p);
        const nb = [sib[i - 1], sib[i + 1]].filter(Boolean);
        return hero(`
            <div class="crumbs" data-hero><a href="index.html">Home</a> / <a href="${d.file}">${d.name}</a> / ${p.title}</div>
            <h1 data-hero>${p.title}</h1>
            <p class="lead" data-hero>${p.summary}</p>
            <div class="tags" style="margin-top:22px" data-hero>${tags([p.status, ...p.tags])}</div>`, true) +
        `<article class="article">
            <h2 data-reveal><span class="idx">01</span>Overview</h2>
            ${p.intro.map((t) => `<p data-reveal>${t}</p>`).join("")}
            <h2 data-reveal><span class="idx">02</span>Architecture</h2>
            <ol class="arch">${p.arch.map(([n, t]) => `<li class="glass" data-reveal><strong>${n}</strong><span>${t}</span></li>`).join("")}</ol>
            <h2 data-reveal><span class="idx">03</span>Mathematics</h2>
            ${p.math.map((m) => `<div class="math-block glass" data-reveal><h3>${m.h}</h3>${m.p ? `<p>${m.p}</p>` : ""}<div class="eq">$$${m.eq}$$</div>${m.after ? `<p>${m.after}</p>` : ""}</div>`).join("")}
            <div class="pn">${nb.map((n) => `<a class="card glass" href="project.html?p=${n.id}" data-reveal><span class="no">${n === sib[i - 1] ? "← Previous" : "Next →"}</span><h3>${n.title}</h3></a>`).join("")}</div>
            <p style="margin-top:48px" data-reveal><a class="pill" href="${d.file}">← All ${d.name} projects</a></p>
        </article>`;
    };

    /* ---------- chrome: nav, theme toggle, footer ---------- */
    const chrome = () => {
        const active = D.dataset.domain;
        const isHub = page === "hub";
        if (!$(".nav")) {
            document.body.insertAdjacentHTML("beforeend", `
                <div class="progress"></div>
                <header class="nav glass">
                    <a class="brand" href="index.html" aria-label="Home">KW<b>/</b><span>portfolio</span></a>
                    <nav class="links" aria-label="Navigation">
                        ${isHub ? '<a href="#about-contact" class="nav-contact-link"><span class="full">Contact</span><span class="short">Contact</span></a>' : ''}
                        <button class="theme-btn" type="button" aria-label="Switch theme"></button>
                    </nav>
                </header>
                <main id="main"></main>
                ${isHub ? '' : `<footer class="foot"><span>© ${new Date().getFullYear()} Kushan Waghmare</span><a href="https://github.com/KushanWaghmare" target="_blank" rel="noopener">GitHub</a></footer>`}`);
        }
        const btn = $(".theme-btn"), sync = () => { const l = D.dataset.theme === "light"; btn.textContent = l ? "☾" : "☀"; btn.setAttribute("aria-label", l ? "Switch to dark mode" : "Switch to light mode"); };
        if (btn) {
            sync();
            btn.addEventListener("click", () => {
                D.classList.add("tt"); setTimeout(() => D.classList.remove("tt"), 260);
                D.dataset.theme = D.dataset.theme === "light" ? "dark" : "light";
                try { localStorage.setItem("theme", D.dataset.theme); } catch (e) {}
                KW.refresh(); sync(); dispatchEvent(new Event("themechange"));
            });
        }
    };

    /* ---------- motion: GSAP page wipe, entrance, scroll-triggered reveals, parallax ---------- */
    const motion = () => {
        const wipe = $(".wipe");
        if (!window.gsap || REDUCED) { if (wipe) wipe.style.display = "none"; return; }
        gsap.registerPlugin(ScrollTrigger);

        const isNav = sessionStorage.getItem("kw_nav");
        if (isNav) {
            sessionStorage.removeItem("kw_nav");
            gsap.fromTo(wipe, { scaleY: 1, transformOrigin: "top" }, { scaleY: 0, duration: 0.6, ease: "power4.inOut" });
        } else {
            gsap.set(wipe, { scaleY: 0 });
        }

        // Entrance motion for hero
        gsap.from("[data-hero]", {
            opacity: 0,
            y: 40,
            duration: 0.8,
            stagger: 0.08,
            ease: "power3.out",
            delay: isNav ? 0.25 : 0.05
        });

        // Scroll-triggered reveals
        ScrollTrigger.batch("[data-reveal]", {
            start: "top 92%",
            once: true,
            onEnter: (els) => gsap.fromTo(els, { opacity: 0, y: 35 }, { opacity: 1, y: 0, duration: 0.8, stagger: 0.1, ease: "power3.out", overwrite: true })
        });
        ScrollTrigger.refresh();

        gsap.to(".hero-inner", { yPercent: -14, opacity: 0.25, ease: "none",
            scrollTrigger: { trigger: ".hero", start: "top top", end: "bottom top", scrub: true } });
        gsap.to(".progress", { scaleX: 1, ease: "none", scrollTrigger: { start: 0, end: "max", scrub: 0.3 } });
        addEventListener("load", () => ScrollTrigger.refresh());
        addEventListener("pageshow", (e) => { if (e.persisted) gsap.set(wipe, { scaleY: 0 }); });

        document.addEventListener("click", (e) => { // wipe out, then navigate
            const a = e.target.closest("a");
            if (!a || e.defaultPrevented || e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || a.target) return;
            const u = new URL(a.href, location.href);
            if (u.origin !== location.origin || (u.pathname === location.pathname && u.search === location.search)) return;
            if (u.hash && u.pathname === location.pathname) return; // anchor links on same page
            e.preventDefault();
            sessionStorage.setItem("kw_nav", "1");
            gsap.set(wipe, { transformOrigin: "bottom" });
            gsap.to(wipe, { scaleY: 1, duration: 0.45, ease: "power3.inOut", onComplete: () => (location.href = u.href) });
        });
    };

    /* ---------- snap observer on hub page ---------- */
    const setupSnapObserver = () => {
        const sections = document.querySelectorAll(".snap-section");
        if (!sections.length) return;
        const dots = document.querySelectorAll(".snap-dot");

        const observer = new IntersectionObserver((entries) => {
            entries.forEach((entry) => {
                if (entry.isIntersecting) {
                    const d = entry.target.dataset.domain;
                    if (d) {
                        D.dataset.domain = d;
                        KW.refresh();
                        window.dispatchEvent(new Event("themechange"));
                        dots.forEach((dot) => {
                            const isCurrent = dot.getAttribute("href") === "#" + entry.target.id;
                            dot.classList.toggle("active", isCurrent);
                        });
                    }
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
        try { if (sim && SIMS[sim]) SIMS[sim]($(".hero canvas")); } catch (err) { console.warn("Simulation unavailable:", err); }
    } else {
        const p = SITE.projects.find((x) => x.id === new URLSearchParams(location.search).get("p"));
        if (p) {
            D.dataset.domain = p.domain;
            document.title = `${p.title} · Kushan Waghmare`;
            main.innerHTML = projectPage(p);
            try { if (p.domain && SIMS[p.domain]) SIMS[p.domain]($(".hero canvas")); } catch (err) {}
        } else if (!main.firstElementChild) {
            main.innerHTML = hero(`<h1 data-hero>Not found</h1><p class="lead" data-hero>No such project. <a class="pill" href="index.html">Back home</a></p>`, true);
        }
    }
    if (window.renderMathInElement) renderMathInElement(document.body, { throwOnError: false,
        delimiters: [{ left: "$$", right: "$$", display: true }, { left: "$", right: "$", display: false }] });
    document.addEventListener("pointermove", (e) => { // spotlight follows the cursor on cards
        const c = e.target.closest && e.target.closest(".card");
        if (c) { const r = c.getBoundingClientRect(); c.style.setProperty("--mx", e.clientX - r.left + "px"); c.style.setProperty("--my", e.clientY - r.top + "px"); }
    });
    document.addEventListener("click", (e) => {
        const a = e.target.closest && e.target.closest("a");
        if (a && a.hash && a.pathname === location.pathname) {
            const target = document.querySelector(a.hash);
            if (target) {
                e.preventDefault();
                target.scrollIntoView({ behavior: "smooth" });
                try { history.replaceState(null, "", a.hash); } catch (err) {}
            }
        }
    });
    document.addEventListener("click", (e) => {
        const btn = e.target.closest && e.target.closest(".copy-btn");
        if (!btn) return;
        const text = btn.dataset.copy;
        if (!text) return;
        const label = btn.querySelector(".copy-text") || btn;
        const originalText = label.textContent;
        const notify = () => {
            label.textContent = "Copied to clipboard!";
            btn.classList.add("copied");
            setTimeout(() => {
                label.textContent = originalText;
                btn.classList.remove("copied");
            }, 2200);
        };
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(notify).catch(notify);
        } else {
            const ta = document.createElement("textarea");
            ta.value = text;
            ta.style.position = "fixed";
            ta.style.opacity = "0";
            document.body.appendChild(ta);
            ta.select();
            try { document.execCommand("copy"); } catch (err) {}
            document.body.removeChild(ta);
            notify();
        }
    });
    motion();
})();
