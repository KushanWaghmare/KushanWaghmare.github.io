/* Shared app logic: theme, rendering from SITE data, KaTeX, sim helpers. */
(() => {
    const D = document.documentElement;
    const keys = Object.keys(SITE.domains);
    const REDUCED = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const $ = (s, r = document) => r.querySelector(s);
    const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

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
    KW.fit = (c, cb) => {
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
    KW.loop = (c, step) => {
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

    /* ---------- chrome: theme control ---------- */
    const chrome = () => {
        const btn = $(".theme-btn");
        if (btn) {
            const sync = () => {
                const l = D.dataset.theme === "light";
                btn.textContent = l ? "☾" : "☀";
                btn.setAttribute("aria-label", l ? "Switch to dark mode" : "Switch to light mode");
            };
            sync();
            btn.addEventListener("click", () => {
                D.classList.add("tt");
                setTimeout(() => D.classList.remove("tt"), 260);
                D.dataset.theme = D.dataset.theme === "light" ? "dark" : "light";
                try { localStorage.setItem("theme", D.dataset.theme); } catch (e) {}
                KW.refresh();
                sync();
                dispatchEvent(new Event("themechange"));
            });
        }
    };

    /* ---------- motion: native scroll-triggered reveals ---------- */
    let revealIO = null;
    const observeReveals = () => {
        if (revealIO) revealIO.disconnect();
        $$(".snap-section:first-of-type [data-hero], .snap-section.hero [data-hero], [data-hero]").forEach((el) => el.classList.add("revealed"));
        if (REDUCED) {
            $$("[data-reveal]").forEach((el) => el.classList.add("revealed"));
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
        $$("[data-reveal]").forEach((el) => revealIO.observe(el));
    };

    /* ---------- snap observer: syncs pager dots & theme ---------- */
    let snapIO = null;
    const setupSnapObserver = () => {
        if (snapIO) snapIO.disconnect();
        const sections = $$(".snap-section");
        if (!sections.length) return;
        const dots = $$(".snap-dot");

        snapIO = new IntersectionObserver((entries) => {
            entries.forEach((entry) => {
                if (entry.isIntersecting) {
                    const id = entry.target.id;
                    const d = entry.target.dataset.domain;
                    if (d && D.dataset.domain !== d) {
                        D.dataset.domain = d;
                        KW.refresh();
                        window.dispatchEvent(new Event("themechange"));
                    }
                    dots.forEach((dot) => {
                        dot.classList.toggle("active", dot.getAttribute("href") === "#" + id);
                    });
                }
            });
        }, { threshold: 0.5 });

        sections.forEach((s) => snapIO.observe(s));
    };

    /* ---------- Simulation Binding ---------- */
    const bindSims = () => {
        const navCanvas = $(".nav-live canvas");
        if (navCanvas && SIMS.nav) {
            try { SIMS.nav(navCanvas); } catch (e) { console.warn("Nav sim:", e); }
        }
        $$(".snap-section canvas").forEach((c) => {
            const sec = c.closest(".snap-section");
            const pid = sec && sec.id && sec.id.startsWith("proj-") ? sec.id.slice(5) : (sec && sec.id && sec.id.startsWith("paper-") ? sec.id.slice(6) : (sec && sec.id && sec.id.startsWith("track-") ? sec.id.slice(6) : null));
            const sd = (pid && SIMS[pid]) ? pid : (sec && sec.dataset.domain ? sec.dataset.domain : D.dataset.domain);
            const fn = (sec && sec.id === "intro" && SIMS.hub) ? SIMS.hub : (SIMS[sd] || SIMS[D.dataset.domain]);
            if (fn) try { fn(c); } catch (err) {}
        });
    };

    /* ---------- KaTeX LaTeX equation rendering ---------- */
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

    /* ---------- Clipboard Copy ---------- */
    document.addEventListener("click", (e) => {
        const btn = e.target.closest && e.target.closest(".copy-btn");
        if (btn && btn.dataset.copy) {
            const label = btn.querySelector(".copy-text") || btn;
            const originalText = label.textContent;
            navigator.clipboard.writeText(btn.dataset.copy).then(() => {
                label.textContent = "Copied to clipboard!";
                setTimeout(() => { label.textContent = originalText; }, 2000);
            });
        }
    });

    /* ---------- Card interactive pointer sheen ---------- */
    document.addEventListener("pointermove", (e) => {
        const c = e.target.closest && e.target.closest(".card");
        if (c) {
            const r = c.getBoundingClientRect();
            c.style.setProperty("--mx", e.clientX - r.left + "px");
            c.style.setProperty("--my", e.clientY - r.top + "px");
        }
    });

    /* ---------- Target deep-link query parameter scroll (#proj-<id>, #paper-<id>) ---------- */
    const handleDeepLink = () => {
        const u = new URL(location.href);
        const pid = u.searchParams.get("p");
        if (pid) {
            const target = document.querySelector("#paper-" + pid) || document.querySelector("#proj-" + pid);
            if (target) {
                setTimeout(() => target.scrollIntoView({ behavior: "smooth" }), 100);
            }
        }
    };

    /* ---------- Initialisation ---------- */
    KW.refresh();
    chrome();
    setupSnapObserver();
    observeReveals();
    bindSims();
    renderMath();
    handleDeepLink();
})();
