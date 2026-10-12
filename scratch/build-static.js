// Pre-renders full semantic HTML into each page for SEO and fast initial paint.
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");
const dataCode = fs.readFileSync(path.join(root, "shared", "data.js"), "utf8");
const SITE = new Function(dataCode + "\nreturn SITE;")();
const keys = Object.keys(SITE.domains);

const pad = (n) => String(n + 1).padStart(2, "0");
const list = (key) => SITE.projects.filter((p) => p.domain === key);
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
            <a href="#about-contact" class="snap-dot" data-title="06 Contact" aria-label="About & Contact"><span class="dot-disc" style="--a:var(--rgb-contact)"></span><span class="dot-text">06 Contact</span></a>
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

        <section class="snap-section about-contact-section" id="about-contact" data-domain="contact" data-enter="bottom" style="--a:var(--rgb-contact)">
            <canvas aria-hidden="true"></canvas>
            <div class="snap-inner">
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
            <div class="sim-tag" aria-hidden="true">3D relational network &amp; cursor-reactive sonar wave · G(V,E) spatial graph</div>
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

    <section class="snap-section about-contact-section" id="domain-explore" data-domain="contact" style="--a:var(--rgb-contact)">
        <canvas aria-hidden="true"></canvas>
        <div class="snap-inner">
            <div class="section-head" data-reveal><span class="idx">${String(ps.length + 1).padStart(2, "0")}</span><h2>Explore Other Domains</h2></div>
            <p class="lead" data-reveal style="margin-bottom:28px">Navigate through other core domains of mathematical modelling, physics simulations, stochastic calculus, and machine systems.</p>
            <div class="pills" data-reveal style="margin-bottom:36px">
                ${keys.filter(k => k !== key).map(k => `
                <a class="pill" style="--a:var(--rgb-${k})" href="${SITE.domains[k].file}">${SITE.domains[k].name} →</a>`).join("")}
                <a class="pill" href="index.html">← Back to Hub</a>
            </div>
            ${contactSection()}
        </div>
        <div class="sim-tag" aria-hidden="true">3D relational network &amp; cursor-reactive sonar wave · G(V,E) spatial graph</div>
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

const renderNav = (active, pageType) => {
    const isHub = pageType === "hub";
    return `
    <div class="progress"></div>
    <header class="nav glass">
        <a class="brand" href="index.html" aria-label="Home">KW<b>/</b><span>portfolio</span></a>
        <div class="nav-live" aria-hidden="true"><canvas></canvas></div>
        <nav class="links" aria-label="Navigation">
            ${isHub ? '<a href="#about-contact" class="nav-contact-link"><span class="full">Contact</span><span class="short">Contact</span></a>' : ''}
            <button class="theme-btn" type="button" aria-label="Switch to light mode">☀</button>
            <button class="sound-btn needs-unlock" type="button" aria-label="Enable sound effects" title="Enable audio">🔇 <span class="sound-label">Enable Audio</span></button>
        </nav>
    </header>`;
};

const renderFoot = (pageType) => pageType === "hub" ? "" : `
    <footer class="foot"><span>© ${new Date().getFullYear()} Kushan Waghmare</span><a href="https://github.com/KushanWaghmare" target="_blank" rel="noopener">GitHub</a></footer>`;

const buildHTML = ({ domain, pageType, three, title, desc, mainContent }) => `<!doctype html>
<html lang="en-GB" data-domain="${domain}" data-page="${pageType}">
<head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title}</title>
    <meta name="description" content="${desc}" />
    <script>try{const q=new URLSearchParams(location.search).get("theme");const t=q||localStorage.getItem("theme")||"dark";document.documentElement.dataset.theme=t;if(q)localStorage.setItem("theme",q);}catch(e){document.documentElement.dataset.theme="dark";}</script>
    <link rel="stylesheet" href="shared/style.css?v=5" />
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css" />
    <script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.js"></script>
    <script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/contrib/auto-render.min.js"></script>
${three ? '    <script defer src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r134/three.min.js"></script>\n' : ''}    <script defer src="shared/data.js?v=5"></script>
    <script defer src="shared/sims.js?v=5"></script>
    <script defer src="shared/app.js?v=5"></script>
</head>
<body>
    ${renderNav(domain, pageType)}
    <main id="main">${mainContent}</main>${renderFoot(pageType)}
</body>
</html>
`;

// 1. Hub
fs.writeFileSync(path.join(root, "index.html"), buildHTML({
    domain: "hub",
    pageType: "hub",
    three: true,
    title: "Kushan Waghmare · Portfolio",
    desc: "Kushan Waghmare: Data Science and Quantitative Finance student at IIT Madras. Mathematics, physics, data science, quant finance and computer science projects.",
    mainContent: hubPage()
}));
console.log("Wrote index.html");

// 2. Domains
for (const k of keys) {
    const d = SITE.domains[k];
    const file = path.join(root, d.file);
    fs.writeFileSync(file, buildHTML({
        domain: k,
        pageType: "domain",
        three: true,
        title: `${d.name} · Kushan Waghmare`,
        desc: d.blurb,
        mainContent: domainPage(k)
    }));
    console.log(`Wrote ${d.file}`);
}

// 3. Project detail shell
fs.writeFileSync(path.join(root, "project.html"), buildHTML({
    domain: "hub",
    pageType: "project",
    three: true,
    title: "Project · Kushan Waghmare",
    desc: "Project deep-dive: architecture and mathematics.",
    mainContent: projectIndexPage()
}));
console.log("Wrote project.html");
