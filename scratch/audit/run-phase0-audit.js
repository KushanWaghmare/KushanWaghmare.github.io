"use strict";
// Phase 0 automated browser contrast & simulation screenshot audit.
// Uses headless Chrome via CDP (scratch/audit/cdp.js) and PNG pixel decoding (scratch/audit/png.js).
const fs = require("fs");
const path = require("path");
const { serve, launch, sleep, ROOT } = require("./cdp");
const { decode, luminance, contrast } = require("./png");

const OUT_DIR = path.join(__dirname, "screenshots");
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

// 1. Analytical token & canvas fillText audit
const computeTokenAndCanvasAudit = () => {
    const themes = {
        dark: {
            bg: [7, 8, 12],
            fg: [233, 235, 241],
            muted: [138, 144, 162],
            glass: [16, 18, 26, 0.549],
            glassSolid: [16, 18, 26, 0.949],
            success: [16, 185, 129],
            accents: {
                hub: [79, 140, 255],
                math: [224, 40, 64],
                physics: [34, 211, 238],
                datascience: [245, 158, 11],
                quant: [16, 185, 129],
                cs: [139, 92, 246],
                papers: [163, 230, 53],
                courses: [236, 72, 153],
                contact: [20, 184, 166]
            }
        },
        light: {
            bg: [246, 247, 251],
            fg: [15, 23, 42],
            muted: [71, 85, 105],
            glass: [255, 255, 255, 0.851],
            glassSolid: [255, 255, 255, 0.937],
            success: [5, 150, 105],
            accents: {
                hub: [37, 99, 235],
                math: [190, 18, 60],
                physics: [2, 132, 199],
                datascience: [180, 83, 9],
                quant: [5, 150, 105],
                cs: [109, 40, 217],
                papers: [101, 163, 13],
                courses: [190, 24, 93],
                contact: [13, 148, 136]
            }
        }
    };

    const tokenRows = [];
    for (const [themeName, t] of Object.entries(themes)) {
        const bgLum = luminance(...t.bg);
        const glassSolidRgb = blend(t.glassSolid, t.bg);
        const gsLum = luminance(...glassSolidRgb);
        // Over a near-black simulation canvas [3, 4, 6]
        const simBg = [3, 4, 6];
        const glassOverSimRgb = blend(t.glass, simBg);
        const gosLum = luminance(...glassOverSimRgb);

        // Base text tokens on --bg, --glass-solid, and .glass over sim
        for (const [tokName, rgb] of [["--fg", t.fg], ["--muted", t.muted], ["--success", t.success]]) {
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

        // Domain accents used as text (.eyebrow, .pill, .snap-cta-btn, .course-code, .paper-section-tag, .go, .idx, .crumbs a, .snap-dot.active .dot-text)
        for (const [dom, acc] of Object.entries(t.accents)) {
            const fgLum = luminance(...acc);
            tokenRows.push({
                theme: themeName, domain: dom, selector: `--accent (${dom}) on --bg (.eyebrow, .idx, .crumbs a)`,
                fg: toHex(acc), bg: toHex(t.bg), ratio: contrast(fgLum, bgLum), target: 4.5
            });
            tokenRows.push({
                theme: themeName, domain: dom, selector: `--accent (${dom}) on --glass-solid (.dot-text, .course-code, .go)`,
                fg: toHex(acc), bg: toHex(glassSolidRgb), ratio: contrast(fgLum, gsLum), target: 4.5
            });
            const pillBg = blend([...acc, 0.12], glassOverSimRgb);
            tokenRows.push({
                theme: themeName, domain: dom, selector: `--accent (${dom}) on rgba(--a, 0.12) (.snap-cta-btn, .nav-domain-pill)`,
                fg: toHex(acc), bg: toHex(pillBg), ratio: contrast(fgLum, luminance(...pillBg)), target: 4.5
            });
            // Hero gradient bottom stop: rgba(var(--a), 0.85) over --bg
            const gradStop2 = blend([...acc, 0.85], t.bg);
            tokenRows.push({
                theme: themeName, domain: dom, selector: `.hero h1 gradient stop 2 rgba(--a, 0.85) (${dom}) on --bg`,
                fg: toHex(gradStop2), bg: toHex(t.bg), ratio: contrast(luminance(...gradStop2), bgLum), target: 3.0
            });
        }

        // Canvas fillText audit
        const navBg = glassSolidRgb;
        const navBgLum = gsLum;
        // 1. NAV.physics isotope label (shared/app.js:982)
        const isoFg = blend(themeName === "light" ? [0, 0, 0, 0.5] : [255, 255, 255, 0.45], navBg);
        tokenRows.push({
            theme: themeName, domain: "physics", selector: "canvas fillText: NAV.physics isotope label '²³⁵U' (7.5px)",
            fg: toHex(isoFg), bg: toHex(navBg), ratio: contrast(luminance(...isoFg), navBgLum), target: 4.5
        });
        // 2. NAV.physics telemetry (shared/app.js:1141)
        const telFg = blend(themeName === "light" ? [15, 23, 42, 0.65] : [255, 255, 255, 0.65], navBg);
        tokenRows.push({
            theme: themeName, domain: "physics", selector: "canvas fillText: NAV.physics telemetry '²³⁵U + n → ...' (8px)",
            fg: toHex(telFg), bg: toHex(navBg), ratio: contrast(luminance(...telFg), navBgLum), target: 4.5
        });
        // 3. NAV.cs prompt & counter (shared/app.js:1284-1285)
        const csMuted = themeName === "light" ? [80, 82, 95] : [150, 156, 172];
        tokenRows.push({
            theme: themeName, domain: "cs", selector: "canvas fillText: NAV.cs '$ isort' prompt (10px)",
            fg: toHex(csMuted), bg: toHex(navBg), ratio: contrast(luminance(...csMuted), navBgLum), target: 4.5
        });
        const csStepFg = blend([...t.accents.cs, 0.9], navBg);
        tokenRows.push({
            theme: themeName, domain: "cs", selector: "canvas fillText: NAV.cs step counter '#00001' (10px)",
            fg: toHex(csStepFg), bg: toHex(navBg), ratio: contrast(luminance(...csStepFg), navBgLum), target: 4.5
        });
        // 4. NAV.courses stage labels (shared/app.js:1350)
        const crsInactiveFg = blend([...t.accents.courses, 0.45], blend([...t.accents.courses, 0.08], navBg));
        const crsInactiveBg = blend([...t.accents.courses, 0.08], navBg);
        tokenRows.push({
            theme: themeName, domain: "courses", selector: "canvas fillText: NAV.courses inactive stage 'FND/CORE/HNR/DEG' (8.5px)",
            fg: toHex(crsInactiveFg), bg: toHex(crsInactiveBg), ratio: contrast(luminance(...crsInactiveFg), luminance(...crsInactiveBg)), target: 4.5
        });
        const crsActiveFg = t.accents.courses;
        const crsActiveBg = blend([...t.accents.courses, 0.20], navBg);
        tokenRows.push({
            theme: themeName, domain: "courses", selector: "canvas fillText: NAV.courses active stage 'FND/CORE/HNR/DEG' (8.5px)",
            fg: toHex(crsActiveFg), bg: toHex(crsActiveBg), ratio: contrast(luminance(...crsActiveFg), luminance(...crsActiveBg)), target: 4.5
        });
        // 5. ENGINES.flock ABM telemetry (shared/engines.js:993)
        const abmBg = t.bg;
        const abmFg = blend([...t.accents.datascience, 0.65], abmBg);
        tokenRows.push({
            theme: themeName, domain: "datascience", selector: "canvas fillText: ENGINES.flock 'ABM // N:...' (10px)",
            fg: toHex(abmFg), bg: toHex(abmBg), ratio: contrast(luminance(...abmFg), luminance(...abmBg)), target: 4.5
        });
        // 6. ENGINES.algo node labels & W-Bus (shared/engines.js:1738, 1801, 1848, 1850)
        const algoBoxBg = blend(themeName === "light" ? [255, 255, 255, 0.9] : [12, 14, 22, 0.88], t.bg);
        const algoBoxLum = luminance(...algoBoxBg);
        const algoAccFg = blend([...t.accents.cs, 0.98], algoBoxBg);
        tokenRows.push({
            theme: themeName, domain: "cs", selector: "canvas fillText: ENGINES.algo AST/W-Bus module title (10px)",
            fg: toHex(algoAccFg), bg: toHex(algoBoxBg), ratio: contrast(luminance(...algoAccFg), algoBoxLum), target: 4.5
        });
        const algoCyan = themeName === "light" ? [2, 132, 199] : [34, 211, 238];
        tokenRows.push({
            theme: themeName, domain: "cs", selector: "canvas fillText: ENGINES.algo W-Bus register value cyan (10px)",
            fg: toHex(algoCyan), bg: toHex(algoBoxBg), ratio: contrast(luminance(...algoCyan), algoBoxLum), target: 4.5
        });
        // 7. ENGINES.markov state labels (shared/engines.js:1928)
        const mkvBoxBg = blend(themeName === "light" ? [255, 255, 255, 0.9] : [12, 14, 22, 0.9], t.bg);
        const mkvFg = t.accents.quant;
        tokenRows.push({
            theme: themeName, domain: "quant", selector: "canvas fillText: ENGINES.markov state node 'S0..S4' (11px)",
            fg: toHex(mkvFg), bg: toHex(mkvBoxBg), ratio: contrast(luminance(...mkvFg), luminance(...mkvBoxBg)), target: 4.5
        });
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
    const origRAF = window.requestAnimationFrame.bind(window);
    const origCAF = window.cancelAnimationFrame.bind(window);
    window.requestAnimationFrame = (cb) => {
        const id = rafId++;
        rafQueue.set(id, cb);
        return id;
    };
    window.cancelAnimationFrame = (id) => {
        rafQueue.delete(id);
    };
    // Keep a gentle background pump so initial load works normally
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

// Representative text selectors inside each slide/page to audit
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
    const x0 = Math.max(0, Math.floor(box.x));
    const y0 = Math.max(0, Math.floor(box.y));
    const x1 = Math.min(W - 1, Math.ceil(box.x + box.w));
    const y1 = Math.min(H - 1, Math.ceil(box.y + box.h));
    if (x1 <= x0 || y1 <= y0) return { lum: 0, rgb: [0, 0, 0] };

    // Stride to keep sample count ~400 pixels per frame
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
    const tokenRows = computeTokenAndCanvasAudit();
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
            // Wait for lazy GPU module script tags and KaTeX to settle
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

            // Get list of sections on this page
            const sections = await browser.evaluate(`
                Array.from(document.querySelectorAll(".snap-section")).map((s, idx) => ({
                    idx,
                    id: s.id || ("sec-" + idx),
                    sim: s.dataset.sim || "",
                    domain: s.dataset.domain || document.documentElement.dataset.domain || "hub"
                }))
            `);

            // Audit slides that are in screenshotSlides (or all slides on hub/domain/courses/papers, and representative on project/paper detail)
            for (const sec of sections) {
                const shouldAuditSlide =
                    pageSpec.screenshotSlides.includes(sec.id) ||
                    !pageSpec.name.includes("?");
                if (!shouldAuditSlide) continue;

                // Scroll slide into view and trigger domain refresh
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

                // Step simulation to t = 5.0 s (300 frames at 60 fps)
                await browser.evaluate(`window.__stepSimSeconds(5.0)`);
                await sleep(40);

                // Save PNG screenshot at t = 5s if in screenshotSlides and dark theme (plus key light theme screenshots)
                if (pageSpec.screenshotSlides.includes(sec.id) && (theme === "dark" || sec.idx === 0)) {
                    const safePage = pageSpec.name.replace(/[?=&]/g, "_").replace(/\.html$/, "");
                    const fn = `${safePage}__${sec.id}__${theme}_t5s.png`;
                    const pngBuf = await browser.screenshot(1);
                    fs.writeFileSync(path.join(OUT_DIR, fn), pngBuf);
                    screenshotIndex.push({ page: pageSpec.name, slideId: sec.id, sim: sec.sim, theme, file: fn });
                }

                // Collect bounding boxes and computed styles of all matching text selectors in this active viewport
                const measuredEls = await browser.evaluate(`(() => {
                    const secEl = document.querySelectorAll(".snap-section")[${sec.idx}];
                    const selectors = ${JSON.stringify(TEXT_SELECTORS)};
                    const out = [];
                    // Temporarily reveal dot-text so its bounding box & style can be read
                    const dotTexts = document.querySelectorAll(".snap-dot .dot-text");
                    dotTexts.forEach((d) => { d.style.opacity = "1"; d.style.transform = "none"; });

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
                        const aRgb = getComputedStyle(el).getPropertyValue("--a").trim().split(",").map(Number);
                        const fgRgb = getComputedStyle(document.documentElement).getPropertyValue("--fg").trim();
                        out.push({
                            sel: item.sel,
                            label: item.label,
                            isHeroH1: !!item.isHeroH1,
                            color: cs.color,
                            webkitFill: cs.webkitTextFillColor,
                            bgImage: cs.backgroundImage,
                            fontSize,
                            fontWeight,
                            isLarge,
                            aRgb,
                            box: { x: rect.left, y: rect.top, w: rect.width, h: rect.height }
                        });
                    }
                    return out;
                })()`);

                // Hide all text glyphs & foreground dots so we can sample pure rendered background across 10s of animation
                await browser.evaluate(`(() => {
                    let st = document.getElementById("__bg_sample");
                    if (!st) {
                        st = document.createElement("style");
                        st.id = "__bg_sample";
                        document.head.appendChild(st);
                    }
                    st.textContent = \`
                        *, *::before, *::after {
                            color: transparent !important;
                            -webkit-text-fill-color: transparent !important;
                            text-shadow: none !important;
                        }
                        h1 { background: none !important; }
                        .domain-badge, .nav-pill-dot, .status-dot, .dot-disc { opacity: 0 !important; }
                    \`;
                })()`);

                // Sample 5 intervals spanning 10 seconds of animation (2s each = 10s total)
                const bgFrames = [];
                for (let k = 0; k < 5; k++) {
                    if (k > 0) await browser.evaluate(`window.__stepSimSeconds(2.0)`);
                    const buf = await browser.screenshot(1);
                    bgFrames.push(decode(buf));
                }

                // Remove background-sampling style and restore pager dot styles
                await browser.evaluate(`(() => {
                    const st = document.getElementById("__bg_sample");
                    if (st) st.remove();
                    document.querySelectorAll(".snap-dot .dot-text").forEach((d) => { d.style.opacity = ""; d.style.transform = ""; });
                })()`);

                // Evaluate worst-case contrast for each text element
                for (const el of measuredEls) {
                    const target = el.isLarge ? 3.0 : 4.5;
                    if (el.isHeroH1) {
                        // Hero H1 uses background-clip: text with gradient from --fg to rgba(--a, 0.85)
                        const fgColor = theme === "light" ? [15, 23, 42] : [233, 235, 241];
                        const isLightFg = luminance(...fgColor) > 0.35;
                        const bgSample = sampleBoxLuminance(bgFrames, el.box, isLightFg);
                        const stop1Lum = luminance(...fgColor);
                        const stop2Rgb = blend([...(el.aRgb.length === 3 ? el.aRgb : [79, 140, 255]), 0.85], bgSample.rgb);
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
                            selector: `${el.sel} (gradient stop 2 rgba(--a,0.85))`, label: el.label,
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

    fs.writeFileSync(path.join(__dirname, "phase0-results.json"), JSON.stringify(summary, null, 2));
    console.log(`Done! Token rows: ${summary.tokenRowsCount} (${summary.tokenFailuresCount} failing), DOM rows: ${summary.domRowsCount} (${summary.domFailuresCount} failing), font-size < 12px: ${summary.fontSizeFailuresCount}, screenshots: ${summary.screenshotsCount}`);
})();
