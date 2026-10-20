"use strict";
// Phase 1 automated browser contrast, token & typography audit.
// Preserves Phase 0 results in phase0-results.json and writes Phase 1 results to phase1-results.json.
const fs = require("fs");
const path = require("path");
const { serve, launch, sleep, ROOT } = require("./cdp");
const { decode, luminance, contrast } = require("./png");

const OUT_DIR = path.join(__dirname, "screenshots-phase1");
fs.mkdirSync(OUT_DIR, { recursive: true });

const dataCode = fs.readFileSync(path.join(ROOT, "shared", "data.js"), "utf8");
const SITE = new Function(dataCode + "\nreturn SITE;")();

// Helper to blend RGBA over RGB
const blend = (fg, bg) => {
    const a = fg[3] !== undefined ? fg[3] : 1;
    return [
        Math.round(fg[0] * a + bg[0] * (1 - a)),
        Math.round(fg[1] * a + bg[1] * (1 - a)),
        Math.round(fg[2] * a + bg[2] * (1 - a))
    ];
};

const toHex = (rgb) => "#" + rgb.slice(0, 3).map((x) => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, "0")).join("");

const parseCssColor = (str) => {
    if (!str) return [0, 0, 0, 0];
    const m = str.match(/rgba?\(([^)]+)\)/);
    if (!m) return [0, 0, 0, 1];
    const p = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
    return [p[0] || 0, p[1] || 0, p[2] || 0, p[3] !== undefined ? p[3] : 1];
};

// 1. Phase 1 CSS Token & Surface Audit (from shared/style.css tokens)
const computeTokenAudit = () => {
    const themes = {
        dark: {
            bg: [7, 8, 12],
            fg: [238, 240, 246],
            fgMuted: [156, 163, 181],
            fgFaint: [139, 147, 167],
            glass: [16, 18, 26, 0.84],
            glassSolid: [16, 18, 26, 0.95],
            success: [32, 201, 145],
            onAccent: [7, 8, 12],
            accents: {
                hub: [96, 156, 255],
                math: [255, 92, 112],
                physics: [34, 211, 238],
                datascience: [245, 166, 35],
                quant: [32, 201, 145],
                cs: [172, 132, 255],
                papers: [163, 230, 53],
                courses: [244, 104, 176],
                contact: [36, 200, 182]
            }
        },
        light: {
            bg: [246, 247, 251],
            fg: [15, 23, 42],
            fgMuted: [63, 77, 99],
            fgFaint: [75, 89, 112],
            glass: [255, 255, 255, 0.92],
            glassSolid: [255, 255, 255, 0.97],
            success: [4, 114, 77],
            onAccent: [255, 255, 255],
            accents: {
                hub: [29, 78, 216],
                math: [175, 16, 54],
                physics: [3, 102, 156],
                datascience: [154, 68, 6],
                quant: [4, 114, 77],
                cs: [109, 40, 217],
                papers: [63, 108, 6],
                courses: [168, 20, 82],
                contact: [11, 110, 101]
            }
        }
    };

    const tokenRows = [];
    for (const [themeName, t] of Object.entries(themes)) {
        const bgLum = luminance(...t.bg);
        const glassSolidRgb = blend(t.glassSolid, t.bg);
        const gsLum = luminance(...glassSolidRgb);
        const simBg = [3, 4, 6];
        const glassOverSimRgb = blend(t.glass, simBg);
        const gosLum = luminance(...glassOverSimRgb);
        const glassSolidOverSimRgb = blend(t.glassSolid, simBg);
        const gsosLum = luminance(...glassSolidOverSimRgb);

        // Base text tokens on --bg, --glass-solid, and .glass / --glass-solid over sim
        for (const [tokName, rgb] of [
            ["--fg", t.fg],
            ["--fg-muted", t.fgMuted],
            ["--fg-faint", t.fgFaint],
            ["--success", t.success]
        ]) {
            const fgLum = luminance(...rgb);
            tokenRows.push({
                theme: themeName, domain: "all", selector: `${tokName} on --bg`,
                fg: toHex(rgb), bg: toHex(t.bg), ratio: contrast(fgLum, bgLum), target: 4.5
            });
            tokenRows.push({
                theme: themeName, domain: "all", selector: `${tokName} on --glass-solid`,
                fg: toHex(rgb), bg: toHex(glassSolidRgb), ratio: contrast(fgLum, gsLum), target: 4.5
            });
            tokenRows.push({
                theme: themeName, domain: "all", selector: `${tokName} on .glass (over sim)`,
                fg: toHex(rgb), bg: toHex(glassOverSimRgb), ratio: contrast(fgLum, gosLum), target: 4.5
            });
        }

        // Domain accents (--a-text) on --bg, --glass-solid, color-mix pill surface, Hero H1 stop 2, and --on-accent
        for (const [dom, acc] of Object.entries(t.accents)) {
            const fgLum = luminance(...acc);
            tokenRows.push({
                theme: themeName, domain: dom, selector: `--a-text (${dom}) on --bg (.eyebrow, .idx, .crumbs a)`,
                fg: toHex(acc), bg: toHex(t.bg), ratio: contrast(fgLum, bgLum), target: 4.5
            });
            tokenRows.push({
                theme: themeName, domain: dom, selector: `--a-text (${dom}) on --glass-solid (.dot-text, .course-code, .go)`,
                fg: toHex(acc), bg: toHex(glassSolidRgb), ratio: contrast(fgLum, gsLum), target: 4.5
            });
            // color-mix(in srgb, rgb(var(--a)) 10%, var(--glass-solid)) over sim
            const pillBg = blend([...acc, 0.10], glassSolidOverSimRgb);
            tokenRows.push({
                theme: themeName, domain: dom, selector: `--a-text (${dom}) on color-mix(10%, --glass-solid) (.snap-cta-btn, .pill, .nav-domain-pill)`,
                fg: toHex(acc), bg: toHex(pillBg), ratio: contrast(fgLum, luminance(...pillBg)), target: 4.5
            });
            // Hero H1 gradient bottom stop: var(--a-text) on --bg
            tokenRows.push({
                theme: themeName, domain: dom, selector: `.hero h1 gradient stop 2 var(--a-text) (${dom}) on --bg`,
                fg: toHex(acc), bg: toHex(t.bg), ratio: contrast(fgLum, bgLum), target: 3.0
            });
            // --on-accent on accent fill (::selection)
            tokenRows.push({
                theme: themeName, domain: dom, selector: `--on-accent on rgb(--a) (${dom}) (::selection / filled badge)`,
                fg: toHex(t.onAccent), bg: toHex(acc), ratio: contrast(luminance(...t.onAccent), fgLum), target: 4.5
            });
        }
    }
    return tokenRows;
};

// Pre-load hook so we can step requestAnimationFrame + performance.now() deterministically at 60fps
const TIME_HOOK_SCRIPT = `
(() => {
    const origNow = performance.now.bind(performance);
    let offsetMs = 0;
    performance.now = () => origNow() + offsetMs;
    const rafQueue = new Map();
    let rafId = 1;
    window.requestAnimationFrame = (cb) => {
        const id = rafId++;
        rafQueue.set(id, cb);
        return id;
    };
    window.cancelAnimationFrame = (id) => {
        rafQueue.delete(id);
    };
    setInterval(() => {
        if (window.__manualStepping) return;
        const cbs = Array.from(rafQueue.values());
        rafQueue.clear();
        const t = performance.now();
        for (const cb of cbs) { try { cb(t); } catch (e) {} }
    }, 32);

    window.__stepSimSeconds = (sec) => {
        window.__manualStepping = true;
        const steps = Math.max(1, Math.round(sec * 60));
        for (let s = 0; s < steps; s++) {
            offsetMs += 1000 / 60;
            const now = performance.now();
            const cbs = Array.from(rafQueue.values());
            rafQueue.clear();
            for (const cb of cbs) {
                try { cb(now); } catch (e) {}
            }
        }
        window.__manualStepping = false;
    };
})();
`;

const PAGES_TO_AUDIT = [
    { name: "index.html", url: "index.html", screenshotSlides: ["intro", "domain-math", "domain-physics", "domain-datascience", "domain-quant", "domain-cs", "section-papers", "section-courses", "about-contact"] },
    { name: "math.html", url: "math.html", screenshotSlides: ["domain-intro", "proj-mobius-surfaces", "proj-fourier-spectral", "domain-explore"] },
    { name: "physics.html", url: "physics.html", screenshotSlides: ["domain-intro", "proj-nbody-leapfrog", "proj-split-step-schrodinger", "domain-explore"] },
    { name: "datascience.html", url: "datascience.html", screenshotSlides: ["domain-intro", "proj-regularised-regression", "proj-spectral-clustering", "domain-explore"] },
    { name: "quant.html", url: "quant.html", screenshotSlides: ["domain-intro", "proj-options-pricing", "proj-stat-arb", "domain-explore"] },
    { name: "cs.html", url: "cs.html", screenshotSlides: ["domain-intro", "proj-ku-lang", "proj-8bit-computer", "domain-explore"] },
    { name: "papers.html", url: "papers.html", screenshotSlides: ["papers-hero", "paper-langevin-loss-landscapes", "papers-contact"] },
    { name: "courses.html", url: "courses.html", screenshotSlides: ["courses-hero", "track-iitm-datascience", "track-physics-curriculum", "track-advanced-quant-systems", "courses-contact"] },
    ...SITE.projects.map((p) => ({
        name: `project.html?p=${p.id}`,
        url: `project.html?p=${p.id}`,
        screenshotSlides: ["proj-hero", "proj-arch", "proj-math"]
    })),
    ...SITE.papers.map((p) => ({
        name: `paper.html?p=${p.id}`,
        url: `paper.html?p=${p.id}`,
        screenshotSlides: ["paper-hero", "paper-theory", "paper-cite"]
    }))
];

const TEXT_SELECTORS = [
    { sel: ".nav .brand", label: "Nav brand" },
    { sel: ".nav .brand b", label: "Nav brand slash (accent)" },
    { sel: ".nav .nav-domain-pill", label: "Nav domain pill" },
    { sel: ".nav .nav-back-link", label: "Nav back link" },
    { sel: ".nav .nav-contact-link", label: "Nav contact pill" },
    { sel: ".snap-pager .snap-dot.active .dot-text", label: "Active pager dot label", forceDotVisible: true },
    { sel: ".snap-pager .snap-dot:not(.active) .dot-text", label: "Inactive pager dot label", forceDotVisible: true },
    { sel: ".crumbs", label: "Breadcrumbs text" },
    { sel: ".crumbs a", label: "Breadcrumbs link (accent)" },
    { sel: ".eyebrow", label: "Eyebrow label (accent)" },
    { sel: ".paper-domain-tag", label: "Paper/Track domain badge" },
    { sel: "h1", label: "Hero H1 title", isHeroH1: true },
    { sel: ".snap-title, .section-head h2", label: "Section H2 heading" },
    { sel: ".section-head .idx", label: "Section index number (accent)" },
    { sel: ".lead, .snap-lead", label: "Lead paragraph" },
    { sel: ".hero-eq .katex, .snap-eq .katex", label: "Hero/Section KaTeX equation" },
    { sel: ".snap-proj-label, .snap-jump-label", label: "Muted pill group label" },
    { sel: ".snap-proj-pill strong", label: "Featured work pill title" },
    { sel: ".tag-status", label: "Status badge (.tag-status)" },
    { sel: ".tag", label: "Skill/Project tag pill (.tag)" },
    { sel: ".snap-cta-btn", label: "Primary CTA button (.snap-cta-btn)" },
    { sel: ".snap-count", label: "Muted item count (.snap-count)" },
    { sel: ".pill:not(.snap-cta-btn)", label: "Action/Jump pill (.pill)" },
    { sel: ".snap-overview-card p", label: "Overview card body paragraph" },
    { sel: ".paper-section-tag", label: "Paper section tag (accent)" },
    { sel: ".paper-meta", label: "Paper metadata line" },
    { sel: ".paper-meta .venue", label: "Paper venue (accent)" },
    { sel: ".snap-arch-grid li strong", label: "Architecture card heading" },
    { sel: ".snap-arch-grid li span", label: "Architecture card description" },
    { sel: ".math-block h3", label: "Math block H3 heading" },
    { sel: ".math-block p", label: "Math block paragraph" },
    { sel: ".math-block .eq .katex", label: "Math block KaTeX equation" },
    { sel: ".course-card .course-code", label: "Course code (accent)" },
    { sel: ".course-card h3", label: "Course card title" },
    { sel: ".course-card p", label: "Course card description" },
    { sel: ".course-card .eq .katex", label: "Course card KaTeX equation" },
    { sel: ".course-topics span", label: "Course topic chip" },
    { sel: ".card .no", label: "Card index/direction label" },
    { sel: ".card h3", label: "Card H3 title" },
    { sel: ".card p", label: "Card summary text" },
    { sel: ".card .go", label: "Card CTA link (.go, accent)" },
    { sel: ".edu strong", label: "Education institution title" },
    { sel: ".edu span", label: "Education degree subtitle" },
    { sel: ".contact-status", label: "Contact status label (accent)" },
    { sel: ".contact-title", label: "Contact card H3 title" },
    { sel: ".contact-lead", label: "Contact card lead text" },
    { sel: ".contact-label", label: "Contact field label" },
    { sel: ".contact-value", label: "Contact value link" },
    { sel: "pre.eq code", label: "BibTeX code block" },
    { sel: ".sim-tag", label: "Simulation caption (.sim-tag)" },
    { sel: ".snap-cue", label: "Scroll cue link (.snap-cue)" },
    { sel: ".foot", label: "Footer copyright & links" }
];

const sampleBoxLuminance = (decodedFrames, box, isLightFg) => {
    const W = decodedFrames[0].width, H = decodedFrames[0].height;
    const x0 = Math.max(0, Math.ceil(box.x));
    const y0 = Math.max(0, Math.ceil(box.y));
    const x1 = Math.min(W - 1, Math.floor(box.x + box.w));
    const y1 = Math.min(H - 1, Math.floor(box.y + box.h));
    if (x1 <= x0 || y1 <= y0) return { lum: 0, rgb: [0, 0, 0] };

    const area = (x1 - x0) * (y1 - y0);
    const step = Math.max(1, Math.floor(Math.sqrt(area / 400)));
    const samples = [];

    for (const frame of decodedFrames) {
        const d = frame.data;
        for (let y = y0; y <= y1; y += step) {
            for (let x = x0; x <= x1; x += step) {
                const idx = (y * W + x) * 4;
                const r = d[idx], g = d[idx + 1], b = d[idx + 2];
                samples.push({ lum: luminance(r, g, b), r, g, b });
            }
        }
    }
    if (!samples.length) return { lum: 0, rgb: [0, 0, 0] };
    samples.sort((a, b) => a.lum - b.lum);
    // 95th percentile background luminance for light text; 5th percentile for dark text
    const pickIdx = isLightFg
        ? Math.min(samples.length - 1, Math.floor(samples.length * 0.95))
        : Math.max(0, Math.floor(samples.length * 0.05));
    const chosen = samples[pickIdx];
    return { lum: chosen.lum, rgb: [chosen.r, chosen.g, chosen.b] };
};

(async () => {
    const tokenRows = computeTokenAudit();
    const { srv, port } = await serve();
    const dbgPort = 9222 + Math.floor(Math.random() * 500);
    const browser = await launch(dbgPort);
    await browser.viewport(1440, 900);
    await browser.send("Page.addScriptToEvaluateOnNewDocument", { source: TIME_HOOK_SCRIPT });

    const domRows = [];
    const screenshotIndex = [];

    for (const pageSpec of PAGES_TO_AUDIT) {
        for (const theme of ["dark", "light"]) {
            const sep = pageSpec.url.includes("?") ? "&" : "?";
            const fullUrl = `http://127.0.0.1:${port}/${pageSpec.url}${sep}theme=${theme}`;
            await browser.navigate(fullUrl);
            await sleep(250);
            await browser.evaluate(`(async () => {
                if (document.fonts && document.fonts.ready) await document.fonts.ready;
                document.querySelectorAll("[data-reveal], [data-hero]").forEach((el) => el.classList.add("revealed"));
                if (window.renderMathInElement) {
                    try {
                        renderMathInElement(document.body, {
                            throwOnError: false,
                            delimiters: [{ left: "$$", right: "$$", display: true }, { left: "$", right: "$", display: false }]
                        });
                    } catch (e) {}
                }
            })()`);
            await sleep(180);

            const sections = await browser.evaluate(`
                Array.from(document.querySelectorAll(".snap-section")).map((s, idx) => ({
                    idx,
                    id: s.id || ("sec-" + idx),
                    sim: s.dataset.sim || "",
                    domain: s.dataset.domain || document.documentElement.dataset.domain || "hub"
                }))
            `);

            for (const sec of sections) {
                const shouldAuditSlide =
                    pageSpec.screenshotSlides.includes(sec.id) ||
                    !pageSpec.name.includes("?");
                if (!shouldAuditSlide) continue;

                await browser.evaluate(`(() => {
                    const s = document.querySelectorAll(".snap-section")[${sec.idx}];
                    if (!s) return;
                    s.style.contentVisibility = "visible";
                    s.scrollIntoView({ behavior: "instant" });
                    const d = s.dataset.domain;
                    if (d) {
                        document.documentElement.dataset.domain = d;
                        if (window.KW && window.KW.refresh) window.KW.refresh();
                    }
                    s.querySelectorAll("[data-reveal], [data-hero]").forEach((el) => el.classList.add("revealed"));
                })()`);
                await sleep(120);

                // Step simulation to t = 5.0 s
                await browser.evaluate(`window.__stepSimSeconds(5.0)`);
                await sleep(40);

                if (pageSpec.screenshotSlides.includes(sec.id) && (theme === "dark" || sec.idx === 0)) {
                    const safePage = pageSpec.name.replace(/[?=&]/g, "_").replace(/\.html$/, "");
                    const fn = `${safePage}__${sec.id}__${theme}_t5s.png`;
                    const pngBuf = await browser.screenshot(1);
                    fs.writeFileSync(path.join(OUT_DIR, fn), pngBuf);
                    screenshotIndex.push({ page: pageSpec.name, slideId: sec.id, sim: sec.sim, theme, file: fn });
                }

                // Collect content-box bounding rectangles & computed styles
                const measuredEls = await browser.evaluate(`(() => {
                    const secEl = document.querySelectorAll(".snap-section")[${sec.idx}];
                    const selectors = ${JSON.stringify(TEXT_SELECTORS)};
                    const out = [];
                    const dotTexts = document.querySelectorAll(".snap-dot .dot-text");
                    dotTexts.forEach((d) => {
                        d.style.transition = "none";
                        d.style.opacity = "1";
                        d.style.transform = "none";
                        void d.offsetWidth;
                    });

                    for (const item of selectors) {
                        const root = item.sel.startsWith(".nav") || item.sel.startsWith(".snap-pager") ? document : secEl;
                        if (!root) continue;
                        const el = root.querySelector(item.sel);
                        if (!el) continue;
                        const rect = el.getBoundingClientRect();
                        if (rect.width < 2 || rect.height < 2) continue;
                        if (rect.bottom < 0 || rect.top > window.innerHeight || rect.right < 0 || rect.left > window.innerWidth) continue;
                        const cs = getComputedStyle(el);
                        const fontSize = parseFloat(cs.fontSize) || 14;
                        const fontWeight = parseInt(cs.fontWeight, 10) || 400;
                        const isLarge = fontSize >= 24 || (fontSize >= 18.66 && fontWeight >= 700);
                        const aRgb = cs.getPropertyValue("--a").trim().split(",").map(Number);

                        // Inset to the text content box so outer 1px borders and pill corner exterior aren't sampled as text background
                        const pl = parseFloat(cs.paddingLeft) || 0;
                        const pr = parseFloat(cs.paddingRight) || 0;
                        const pt = parseFloat(cs.paddingTop) || 0;
                        const pb = parseFloat(cs.paddingBottom) || 0;
                        const ix = Math.min(rect.width * 0.25, Math.max(2, pl * 0.8));
                        const ir = Math.min(rect.width * 0.25, Math.max(2, pr * 0.8));
                        const it = Math.min(rect.height * 0.25, Math.max(2, pt * 0.8));
                        const ib = Math.min(rect.height * 0.25, Math.max(2, pb * 0.8));

                        out.push({
                            sel: item.sel,
                            label: item.label,
                            isHeroH1: !!item.isHeroH1,
                            color: cs.color,
                            fontSize,
                            fontWeight,
                            isLarge,
                            aRgb,
                            box: {
                                x: rect.left + ix,
                                y: rect.top + it,
                                w: Math.max(2, rect.width - ix - ir),
                                h: Math.max(2, rect.height - it - ib)
                            }
                        });
                    }
                    return out;
                })()`);

                // Hide text glyphs, KaTeX SVG/fraction lines & indicator dots to sample background across 10s
                await browser.evaluate(`(() => {
                    let st = document.getElementById("__bg_sample");
                    if (!st) {
                        st = document.createElement("style");
                        st.id = "__bg_sample";
                        document.head.appendChild(st);
                    }
                    st.textContent = \`
                        html body *, html body *::before, html body *::after {
                            color: transparent !important;
                            -webkit-text-fill-color: transparent !important;
                            text-shadow: none !important;
                            text-decoration: none !important;
                            border-color: transparent !important;
                            box-shadow: none !important;
                        }
                        h1 { background: none !important; }
                        .katex, .domain-badge, .nav-pill-dot, .status-dot, .dot-disc, .paper-section-tag::before { opacity: 0 !important; }
                    \`;
                })()`);

                const bgFrames = [];
                for (let k = 0; k < 5; k++) {
                    if (k > 0) await browser.evaluate(`window.__stepSimSeconds(2.0)`);
                    const buf = await browser.screenshot(1);
                    bgFrames.push(decode(buf));
                }

                await browser.evaluate(`(() => {
                    const st = document.getElementById("__bg_sample");
                    if (st) st.remove();
                    document.querySelectorAll(".snap-dot .dot-text").forEach((d) => { d.style.opacity = ""; d.style.transform = ""; });
                })()`);

                for (const el of measuredEls) {
                    const target = el.isLarge ? 3.0 : 4.5;
                    if (el.isHeroH1) {
                        // Phase 1 Hero H1 uses linear-gradient(180deg, var(--fg) 38%, var(--a-text) 100%) with solid color: var(--fg) fallback
                        const fgColor = theme === "light" ? [15, 23, 42] : [238, 240, 246];
                        const isLightFg = luminance(...fgColor) > 0.35;
                        const bgSample = sampleBoxLuminance(bgFrames, el.box, isLightFg);
                        const stop1Lum = luminance(...fgColor);
                        const stop2Rgb = el.aRgb.length === 3 ? el.aRgb : (theme === "light" ? [29, 78, 216] : [96, 156, 255]);
                        const stop2Lum = luminance(...stop2Rgb);

                        domRows.push({
                            page: pageSpec.name, slide: sec.id, sim: sec.sim, domain: sec.domain, theme,
                            selector: `${el.sel} (gradient stop 1 --fg)`, label: el.label,
                            fontSize: el.fontSize,
                            fg: toHex(fgColor), bg: toHex(bgSample.rgb),
                            ratio: contrast(stop1Lum, bgSample.lum), target
                        });
                        domRows.push({
                            page: pageSpec.name, slide: sec.id, sim: sec.sim, domain: sec.domain, theme,
                            selector: `${el.sel} (gradient stop 2 --a-text)`, label: el.label,
                            fontSize: el.fontSize,
                            fg: toHex(stop2Rgb), bg: toHex(bgSample.rgb),
                            ratio: contrast(stop2Lum, bgSample.lum), target
                        });
                        continue;
                    }

                    const rawFg = parseCssColor(el.color);
                    const isLightFg = luminance(rawFg[0], rawFg[1], rawFg[2]) > 0.35;
                    const bgSample = sampleBoxLuminance(bgFrames, el.box, isLightFg);
                    const effFg = rawFg[3] < 1 ? blend(rawFg, bgSample.rgb) : rawFg.slice(0, 3);
                    const fgLum = luminance(...effFg);
                    const ratio = contrast(fgLum, bgSample.lum);

                    domRows.push({
                        page: pageSpec.name, slide: sec.id, sim: sec.sim, domain: sec.domain, theme,
                        selector: el.sel, label: el.label,
                        fontSize: el.fontSize,
                        fg: toHex(effFg), bg: toHex(bgSample.rgb),
                        ratio, target
                    });
                }
            }
        }
        process.stdout.write(`Audited ${pageSpec.name}\n`);
    }

    const consoleErrors = [...browser.consoleLog];
    browser.close();
    srv.close();

    const summary = {
        timestamp: new Date().toISOString(),
        tokenRowsCount: tokenRows.length,
        tokenFailuresCount: tokenRows.filter((r) => r.ratio < r.target).length,
        domRowsCount: domRows.length,
        domFailuresCount: domRows.filter((r) => r.ratio < r.target).length,
        fontSizeFailuresCount: domRows.filter((r) => r.fontSize < 12).length,
        screenshotsCount: screenshotIndex.length,
        consoleErrors,
        tokenRows,
        domRows,
        screenshotIndex
    };

    fs.writeFileSync(path.join(__dirname, "phase1-results.json"), JSON.stringify(summary, null, 2));
    console.log(`Done! Token rows: ${summary.tokenRowsCount} (${summary.tokenFailuresCount} failing), DOM rows: ${summary.domRowsCount} (${summary.domFailuresCount} failing), font-size < 12px: ${summary.fontSizeFailuresCount}, screenshots: ${summary.screenshotsCount}`);
})();
