// Pre-renders full semantic HTML into each page for SEO and fast initial paint.
const fs = require("fs");
const path = require("path");
const root = path.resolve(__dirname, "..");
const dataCode = fs.readFileSync(path.join(root, "shared", "data.js"), "utf8");
const SITE = new Function(dataCode + "\nreturn SITE;")();
const keys = Object.keys(SITE.domains);

const pad = (n) => String(n + 1).padStart(2, "0");
const list = (key) => SITE.projects.filter((p) => p.domain === key);
const tags = (a) => a.map((t) => `<span class="tag">${t}</span>`).join("");

const VEC = ["right", "left", "bottom", "top", "right"];
const hubPage = () => `
        <nav class="snap-pager" aria-label="Section navigation">
            <a href="#intro" class="snap-dot active" data-title="00 Intro" aria-label="Introduction"><span class="dot-disc" style="--a:var(--rgb-hub)"></span><span class="dot-text">00 Intro</span></a>
            ${keys.map((k, i) => `
            <a href="#domain-${k}" class="snap-dot" data-d="${k}" data-title="${pad(i)} ${SITE.domains[k].short}" aria-label="${SITE.domains[k].name}"><span class="dot-disc" style="--a:var(--rgb-${k})"></span><span class="dot-text">${pad(i)} ${SITE.domains[k].short}</span></a>`).join("")}
            <a href="#section-papers" class="snap-dot" data-d="papers" data-title="06 Papers" aria-label="Research Papers"><span class="dot-disc" style="--a:var(--rgb-papers)"></span><span class="dot-text">06 Papers</span></a>
            <a href="#section-courses" class="snap-dot" data-d="courses" data-title="07 Courses" aria-label="Academic Coursework"><span class="dot-disc" style="--a:var(--rgb-courses)"></span><span class="dot-text">07 Courses</span></a>
            <a href="#about-contact" class="snap-dot" data-title="08 Contact" aria-label="About & Contact"><span class="dot-disc" style="--a:var(--rgb-contact)"></span><span class="dot-text">08 Contact</span></a>
        </nav>

        <section class="snap-section hero" id="intro" data-domain="hub" data-enter="zoom" style="--a:var(--rgb-hub)">
            <canvas aria-hidden="true"></canvas>
            <div class="snap-inner">
                <div class="eyebrow" data-hero><span class="domain-badge" style="background:var(--accent)"></span>00 / Data Science · Quantitative Finance · IIT Madras</div>
                <h1 data-hero>Kushan<br>Waghmare</h1>
                <p class="lead" data-hero>Data Science &amp; Quantitative Finance student at IIT Madras, building complex systems from compilers to statistical-arbitrage models, and studying the physics underneath them.</p>
                <div class="hero-eq glass" data-hero>$$\\dot x=\\sigma(y-x),\\quad\\dot y=x(\\rho-z)-y,\\quad\\dot z=xy-\\beta z$$</div>
            </div>
            <div class="sim-tag" aria-hidden="true">Lorenz system · σ=10, ρ=28, β=8/3 · RK4 · 5 domain trajectories</div>
            <a class="snap-cue" href="#domain-math">Scroll to explore domains</a>
        </section>

        ${keys.map((k, i) => {
            const d = SITE.domains[k], ps = list(k);
            const nextKey = keys[i + 1] ? `domain-${keys[i + 1]}` : "section-papers";
            const nextLabel = keys[i + 1] ? `Next: ${SITE.domains[keys[i + 1]].name}` : "Next: Research Papers";
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

        <section class="snap-section domain-snap" id="section-papers" data-domain="papers" data-enter="right" style="--a:var(--rgb-papers)">
            <canvas aria-hidden="true"></canvas>
            <div class="snap-inner">
                <div class="eyebrow" data-reveal><span class="domain-badge" style="background:var(--accent)"></span>06 / Research Papers</div>
                <h2 class="snap-title" data-reveal>Research Papers</h2>
                <p class="lead snap-lead" data-reveal>Preprints and research papers spanning statistical learning theory, non-equilibrium Langevin dynamics, quantitative market microstructure, and symplectic numerical integrators.</p>
                <div class="hero-eq glass snap-eq" data-reveal>$$\\frac{\\partial p(\\boldsymbol\\theta, t)}{\\partial t}=\\nabla_{\\boldsymbol\\theta}\\cdot\\Big(\\nabla_{\\boldsymbol\\theta} L(\\boldsymbol\\theta)\\,p(\\boldsymbol\\theta, t)+D\\,\\nabla_{\\boldsymbol\\theta} p(\\boldsymbol\\theta, t)\\Big)$$</div>
                <div class="snap-projects" data-reveal>
                    <span class="snap-proj-label">Featured preprints:</span>
                    ${SITE.papers.map(p => `<a href="papers.html#paper-${p.id}" class="snap-proj-pill glass"><strong>${p.title}</strong><span class="tag-status">${p.status}</span></a>`).join("")}
                </div>
                <div class="snap-actions" data-reveal>
                    <a href="papers.html" class="snap-cta-btn glass" style="--a:var(--rgb-papers)">
                        <span>Explore Research Papers</span>
                        <span class="arr">→</span>
                    </a>
                    <span class="snap-count">${SITE.papers.length} research papers &amp; preprints</span>
                </div>
            </div>
            <div class="sim-tag" aria-hidden="true">Fokker–Planck Langevin probability density flux &amp; stochastic phase space</div>
            <a class="snap-cue" href="#section-courses">Next: Academic Coursework</a>
        </section>

        <section class="snap-section domain-snap" id="section-courses" data-domain="courses" data-enter="left" style="--a:var(--rgb-courses)">
            <canvas aria-hidden="true"></canvas>
            <div class="snap-inner">
                <div class="eyebrow" data-reveal><span class="domain-badge" style="background:var(--accent)"></span>07 / Academic Curricula</div>
                <h2 class="snap-title" data-reveal>Academic Coursework</h2>
                <p class="lead snap-lead" data-reveal>Core and honours academic coursework across Indian Institute of Technology Madras and Vidya Bharati Mahavidyalaya in data science, physics, and computer systems.</p>
                <div class="hero-eq glass snap-eq" data-reveal>$$A = U\\Sigma V^\\top = \\sum_{i=1}^r \\sigma_i\\,\\mathbf u_i\\,\\mathbf v_i^\\top,\\qquad i\\hbar\\,\\frac{\\partial\\psi}{\\partial t}=\\Big[-\\frac{\\hbar^2}{2m}\\nabla^2+V(\\mathbf r)\\Big]\\psi$$</div>
                <div class="snap-projects" data-reveal>
                    <span class="snap-proj-label">Core courses:</span>
                    ${SITE.courses.flatMap(tr => tr.items).slice(0, 6).map(c => `<a href="courses.html#track-${c.code.startsWith('MA') || c.code.startsWith('DS') ? 'iitm-datascience' : c.code.startsWith('PH') ? 'physics-curriculum' : 'advanced-quant-systems'}" class="snap-proj-pill glass"><strong>${c.title}</strong><span class="tag-status">${c.code}</span></a>`).join("")}
                </div>
                <div class="snap-projects" data-reveal style="margin-top:10px">
                    <span class="snap-proj-label">Curricula:</span>
                    ${SITE.courses.map(tr => `<a href="courses.html#track-${tr.track}" class="snap-proj-pill glass"><strong>${tr.degree.replace("Bachelor of Science in ", "BSc ")}</strong><span class="tag-status">${tr.institution.replace("Indian Institute of Technology", "IIT").replace("Vidya Bharati Mahavidyalaya", "VBMV").replace("Independent & Advanced Specialisations", "Honours")}</span></a>`).join("")}
                </div>
                <div class="snap-actions" data-reveal>
                    <a href="courses.html" class="snap-cta-btn glass" style="--a:var(--rgb-courses)">
                        <span>Explore Coursework &amp; Syllabi</span>
                        <span class="arr">→</span>
                    </a>
                    <span class="snap-count">${SITE.courses.reduce((sum, tr) => sum + tr.items.length, 0)} courses &amp; credentials</span>
                </div>
            </div>
            <div class="sim-tag" aria-hidden="true">Harmonic oscillator eigenstates &amp; unitary state evolution · iℏ ∂ψ/∂t = Hψ</div>
            <a class="snap-cue" href="#about-contact">Next: About &amp; Contact</a>
        </section>

        <section class="snap-section about-contact-section" id="about-contact" data-domain="contact" data-enter="bottom" style="--a:var(--rgb-contact)">
            <canvas aria-hidden="true"></canvas>
            <div class="snap-inner">
                <div class="section-head" data-reveal><span class="idx">08</span><h2>About &amp; Profile</h2></div>
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
            <div class="sim-tag" aria-hidden="true">Gravitational 3-body problem · r̈ᵢ = −∑ G mⱼ (rᵢ − rⱼ)/|rᵢ − rⱼ|³ · RK4 chaotic choreography</div>
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
            </div>
        </div>`;

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

const papersPage = () => {
    const papers = SITE.papers || [];
    return `
    <nav class="snap-pager" aria-label="Section navigation">
        <a href="#papers-hero" class="snap-dot active" data-title="00 Overview" aria-label="Papers Overview"><span class="dot-disc" style="--a:var(--rgb-papers)"></span><span class="dot-text">00 Overview</span></a>
        ${papers.map((p, i) => `
        <a href="#paper-${p.id}" class="snap-dot" data-title="${pad(i)} ${p.short || p.title}" aria-label="${p.title}"><span class="dot-disc" style="--a:var(--rgb-papers)"></span><span class="dot-text">${pad(i)} ${p.short || p.title}</span></a>`).join("")}
        <a href="#papers-contact" class="snap-dot" data-title="${String(papers.length + 1).padStart(2, "0")} Contact" aria-label="Contact & Collaboration"><span class="dot-disc" style="--a:var(--rgb-contact)"></span><span class="dot-text">${String(papers.length + 1).padStart(2, "0")} Contact</span></a>
    </nav>

    <section class="snap-section hero" id="papers-hero" data-domain="papers" style="--a:var(--rgb-papers)">
        <canvas aria-hidden="true"></canvas>
        <div class="snap-inner">
            <div class="crumbs" data-hero><a href="index.html">Home</a> / Research Papers</div>
            <h1 data-hero>Research Papers</h1>
            <p class="lead" data-hero>Preprints, working papers and formal research reports spanning statistical learning theory, non-equilibrium Langevin dynamics, quantitative market microstructure, and symplectic numerical integrators.</p>
            <div class="hero-eq glass" data-hero>$$\\frac{\\partial p(\\boldsymbol\\theta, t)}{\\partial t}=\\nabla_{\\boldsymbol\\theta}\\cdot\\Big(\\nabla_{\\boldsymbol\\theta} L(\\boldsymbol\\theta)\\,p(\\boldsymbol\\theta, t)+D\\,\\nabla_{\\boldsymbol\\theta} p(\\boldsymbol\\theta, t)\\Big)$$</div>
            <div class="snap-jump-pills" data-hero>
                <span class="snap-jump-label">Selected papers:</span>
                ${papers.map((p) => `<a href="#paper-${p.id}" class="pill jump-pill" style="--a:var(--rgb-papers)"><strong>${p.short || p.title}</strong></a>`).join("")}
            </div>
        </div>
        <div class="sim-tag" aria-hidden="true">Poincaré hyperbolic disc · ds² = 4|dz|²/(1 − |z|²)² · conformal Möbius citation geodesics</div>
        <a class="snap-cue" href="#paper-${papers[0].id}">Scroll to research papers</a>
    </section>

    ${papers.map((p, i) => {
        const nextTarget = papers[i + 1] ? `#paper-${papers[i + 1].id}` : "#papers-contact";
        const nextLabel = papers[i + 1] ? `Next: ${papers[i + 1].short || papers[i + 1].title}` : "Next: Collaboration & Contact";
        const d = SITE.domains[p.domain];
        return `
    <section class="snap-section project-snap" id="paper-${p.id}" data-domain="papers" style="--a:var(--rgb-papers)">
        <canvas aria-hidden="true"></canvas>
        <div class="snap-inner" style="max-width:880px">
            <div class="eyebrow" data-reveal>
                <span class="domain-badge" style="background:var(--accent)"></span>
                Paper ${pad(i)} / ${String(papers.length).padStart(2, "0")} · <span class="paper-domain-tag" style="--tag-rgb:var(--rgb-${p.domain})">${d.name}</span> · ${p.year}
            </div>
            <h2 class="snap-title" data-reveal style="font-size:clamp(26px, 3.6vw, 48px);line-height:1.16">
                <a href="paper.html?p=${p.id}" style="color:inherit;text-decoration:none">${p.title}</a>
            </h2>
            <div class="paper-meta" data-reveal>
                <span class="venue">${p.venue}</span>
                <span>·</span>
                <span>${p.authors}</span>
                <span class="tag-status">${p.status}</span>
            </div>
            <p class="lead snap-lead" data-reveal style="margin-top:14px">${p.summary}</p>
            <div class="snap-projects" data-reveal style="margin-top:16px">
                <span class="snap-proj-label">Topics:</span>
                ${p.tags.map(t => `<span class="snap-proj-pill glass"><strong>${t}</strong></span>`).join("")}
            </div>
            <div class="snap-actions" data-reveal style="margin-top:22px">
                <a href="paper.html?p=${p.id}" class="snap-cta-btn glass" style="--a:var(--rgb-papers)">
                    <span>Read Paper &amp; Detailed Abstract</span>
                    <span class="arr">→</span>
                </a>
                <span class="snap-count">${p.venue} · ${p.year}</span>
            </div>
        </div>
        <div class="sim-tag" aria-hidden="true">Poincaré hyperbolic disc · ds² = 4|dz|²/(1 − |z|²)² · conformal Möbius citation geodesics</div>
        <a class="snap-cue" href="${nextTarget}">${nextLabel}</a>
    </section>`;
    }).join("")}

    <section class="snap-section about-contact-section" id="papers-contact" data-domain="contact" style="--a:var(--rgb-contact)">
        <canvas aria-hidden="true"></canvas>
        <div class="snap-inner">
            <div class="section-head" data-reveal><span class="idx">${String(papers.length + 1).padStart(2, "0")}</span><h2>Research Enquiries &amp; Collaboration</h2></div>
            <p class="lead" data-reveal style="margin-bottom:28px">Interested in co-authorship, paper review, or expanding theoretical derivations into production systems? Get in touch directly.</p>
            <div class="pills" data-reveal style="margin-bottom:36px">
                <a class="pill" href="courses.html">View Academic Coursework →</a>
                <a class="pill" href="index.html">← Back to Portfolio Hub</a>
            </div>
            ${contactSection()}
        </div>
        <div class="sim-tag" aria-hidden="true">Gravitational 3-body problem · r̈ᵢ = −∑ G mⱼ (rᵢ − rⱼ)/|rᵢ − rⱼ|³ · RK4 chaotic choreography</div>
        <footer class="foot snap-foot"><span>© ${new Date().getFullYear()} Kushan Waghmare</span><a href="https://github.com/KushanWaghmare" target="_blank" rel="noopener">GitHub</a></footer>
    </section>`;
};

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

const coursesPage = () => {
    const tracks = SITE.courses || [];
    return `
    <nav class="snap-pager" aria-label="Section navigation">
        <a href="#courses-hero" class="snap-dot active" data-title="00 Overview" aria-label="Courses Overview"><span class="dot-disc" style="--a:var(--rgb-courses)"></span><span class="dot-text">00 Overview</span></a>
        ${tracks.map((tr, i) => `
        <a href="#track-${tr.track}" class="snap-dot" data-title="${pad(i)} ${tr.short || tr.degree}" aria-label="${tr.degree}"><span class="dot-disc" style="--a:var(--rgb-courses)"></span><span class="dot-text">${pad(i)} ${tr.short || tr.degree}</span></a>`).join("")}
        <a href="#courses-contact" class="snap-dot" data-title="${String(tracks.length + 1).padStart(2, "0")} Contact" aria-label="Academic Enquiries"><span class="dot-disc" style="--a:var(--rgb-contact)"></span><span class="dot-text">${String(tracks.length + 1).padStart(2, "0")} Contact</span></a>
    </nav>

    <section class="snap-section hero" id="courses-hero" data-domain="courses" style="--a:var(--rgb-courses)">
        <canvas aria-hidden="true"></canvas>
        <div class="snap-inner">
            <div class="crumbs" data-hero><a href="index.html">Home</a> / Coursework</div>
            <h1 data-hero>Academic Coursework &amp;<br>Curricula</h1>
            <p class="lead" data-hero>Core and honours academic coursework across Indian Institute of Technology Madras, Vidya Bharati Mahavidyalaya, and advanced specialisations in stochastic calculus, machine learning, and systems architecture.</p>
            <div class="hero-eq glass" data-hero>$$A = U\\Sigma V^\\top = \\sum_{i=1}^r \\sigma_i\\,\\mathbf u_i\\,\\mathbf v_i^\\top,\\qquad i\\hbar\\,\\frac{\\partial\\psi}{\\partial t}=\\Big[-\\frac{\\hbar^2}{2m}\\nabla^2+V(\\mathbf r)\\Big]\\psi$$</div>
            <div class="snap-jump-pills" data-hero>
                <span class="snap-jump-label">Academic tracks:</span>
                ${tracks.map((tr) => `<a href="#track-${tr.track}" class="pill jump-pill" style="--a:var(--rgb-courses)"><strong>${tr.short || tr.degree}</strong></a>`).join("")}
            </div>
        </div>
        <div class="sim-tag" aria-hidden="true">Curriculum Directed Acyclic Graph (DAG) · topological sort · prerequisite signal conduction</div>
        <a class="snap-cue" href="#track-${tracks[0].track}">Scroll to curricula</a>
    </section>

    ${tracks.map((tr, i) => {
        const nextTarget = tracks[i + 1] ? `#track-${tracks[i + 1].track}` : "#courses-contact";
        const nextLabel = tracks[i + 1] ? `Next: ${tracks[i + 1].degree}` : "Next: Academic Contact";
        const d = SITE.domains[tr.domain];
        return `
    <section class="snap-section project-snap course-snap" id="track-${tr.track}" data-domain="courses" style="--a:var(--rgb-courses)">
        <canvas aria-hidden="true"></canvas>
        <div class="snap-inner course-inner">
            <div class="eyebrow" data-reveal>
                <span class="domain-badge" style="background:var(--accent)"></span>
                Track ${pad(i)} / ${String(tracks.length).padStart(2, "0")} · <span class="paper-domain-tag" style="--tag-rgb:var(--rgb-${tr.domain})">${d.name}</span> · ${tr.period}
            </div>
            <h2 class="snap-title" data-reveal style="font-size:clamp(24px, 3.2vw, 42px)">${tr.degree}</h2>
            <p class="lead snap-lead" data-reveal>${tr.blurb}</p>
            <div class="course-grid" data-reveal>
                ${tr.items.map((item) => `
                <div class="course-card glass" style="--a:var(--rgb-${tr.domain})">
                    <div class="course-card-head">
                        <span class="course-code">${item.code}</span>
                        <span class="tag-status">${item.status}</span>
                    </div>
                    <h3>${item.title}</h3>
                    <p>${item.desc}</p>
                    <div class="eq glass" style="padding:10px 14px;border-radius:10px;margin:4px 0">$$${item.eq}$$</div>
                    <div class="course-topics">
                        ${item.topics.map(t => `<span>${t}</span>`).join("")}
                    </div>
                    ${item.relatedProject ? `
                    <div style="margin-top:auto;padding-top:10px">
                        <a href="project.html?p=${item.relatedProject}" class="pill" style="font-size:11px">Inspect Project Application →</a>
                    </div>` : ""}
                </div>`).join("")}
            </div>
        </div>
        <div class="sim-tag" aria-hidden="true">Curriculum Directed Acyclic Graph (DAG) · topological sort · prerequisite signal conduction</div>
        <a class="snap-cue" href="${nextTarget}">${nextLabel}</a>
    </section>`;
    }).join("")}

    <section class="snap-section about-contact-section" id="courses-contact" data-domain="contact" style="--a:var(--rgb-contact)">
        <canvas aria-hidden="true"></canvas>
        <div class="snap-inner">
            <div class="section-head" data-reveal><span class="idx">${String(tracks.length + 1).padStart(2, "0")}</span><h2>Academic Transcripts &amp; Verification</h2></div>
            <p class="lead" data-reveal style="margin-bottom:28px">Official academic transcripts, syllabi, and coursework credentials available upon request for institutional and professional review.</p>
            <div class="pills" data-reveal style="margin-bottom:36px">
                <a class="pill" href="papers.html">Explore Research Papers →</a>
                <a class="pill" href="index.html">← Back to Portfolio Hub</a>
            </div>
            ${contactSection()}
        </div>
        <div class="sim-tag" aria-hidden="true">Gravitational 3-body problem · r̈ᵢ = −∑ G mⱼ (rᵢ − rⱼ)/|rᵢ − rⱼ|³ · RK4 chaotic choreography</div>
        <footer class="foot snap-foot"><span>© ${new Date().getFullYear()} Kushan Waghmare</span><a href="https://github.com/KushanWaghmare" target="_blank" rel="noopener">GitHub</a></footer>
    </section>`;
};

const renderNav = (active, pageType) => {
    const isPaper = pageType === "paper";
    const isPapers = pageType === "papers" || isPaper;
    const isCourses = pageType === "courses";
    const badge = isPapers
        ? `<span class="nav-domain-pill" style="--a:var(--rgb-papers)"><span class="nav-pill-dot"></span>Research Papers</span>`
        : isCourses
        ? `<span class="nav-domain-pill" style="--a:var(--rgb-courses)"><span class="nav-pill-dot"></span>Coursework</span>`
        : "";
    const backLink = isPaper
        ? `<a href="papers.html" class="nav-back-link"><span class="full">← All Papers</span><span class="short">←</span></a>`
        : (isPapers || isCourses)
        ? `<a href="index.html" class="nav-back-link"><span class="full">← Hub</span><span class="short">←</span></a>`
        : "";
    return `
    <div class="progress"></div>
    <header class="nav glass">
        <div class="nav-brand-group">
            <a class="brand" href="index.html" aria-label="Home">KW<b>/</b><span>portfolio</span></a>
            ${badge}
        </div>
        <div class="nav-live" aria-hidden="true"><canvas></canvas></div>
        <nav class="links" aria-label="Navigation">
            ${backLink}
            <a href="${pageType === 'hub' ? '#about-contact' : 'index.html#about-contact'}" class="nav-contact-link"><span class="full">Contact</span><span class="short">Contact</span></a>
            <button class="theme-btn" type="button" aria-label="Switch to light mode">☀</button>
            <button class="sound-btn" type="button" aria-label="Mute sound effects" title="Mute audio">🔊</button>
        </nav>
    </header>`;
};

const buildHTML = ({ domain, pageType, three, title, desc, mainContent }) => `<!doctype html>
<html lang="en-GB" data-domain="${domain}" data-page="${pageType}" data-theme="dark">
<head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title}</title>
    <meta name="description" content="${desc}" />
    <script>try{const q=new URLSearchParams(location.search).get("theme");const t=q||localStorage.getItem("theme")||"dark";document.documentElement.dataset.theme=t;if(q)localStorage.setItem("theme",q);}catch(e){document.documentElement.dataset.theme="dark";}</script>
    <link rel="stylesheet" href="shared/style.css?v=27" />
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css" />
    <script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.js"></script>
    <script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/contrib/auto-render.min.js"></script>
${three ? '    <script defer src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r134/three.min.js"></script>\n' : ''}    <script defer src="shared/data.js?v=27"></script>
    <script defer src="shared/sims.js?v=27"></script>
    <script defer src="shared/app.js?v=27"></script>
</head>
<body>
    ${renderNav(domain, pageType)}
    <main id="main">${mainContent}</main>
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

// 4. Papers page (Overview list)
fs.writeFileSync(path.join(root, "papers.html"), buildHTML({
    domain: "papers",
    pageType: "papers",
    three: true,
    title: "Research Papers · Kushan Waghmare",
    desc: "Preprints and research papers on non-equilibrium Langevin dynamics, high-frequency statistical arbitrage, and symplectic numerical integrators.",
    mainContent: papersPage()
}));
console.log("Wrote papers.html");

// 4b. Paper detail shell (pre-rendered with the first paper for instant paint)
fs.writeFileSync(path.join(root, "paper.html"), buildHTML({
    domain: "papers",
    pageType: "paper",
    three: true,
    title: "Research Paper · Kushan Waghmare",
    desc: "Research paper deep-dive: abstract, mathematical formulation and analytical highlights.",
    mainContent: paperDetailPage(SITE.papers[0])
}));
console.log("Wrote paper.html");

// 5. Courses page
fs.writeFileSync(path.join(root, "courses.html"), buildHTML({
    domain: "courses",
    pageType: "courses",
    three: true,
    title: "Academic Coursework & Curricula · Kushan Waghmare",
    desc: "Academic coursework and curricula at IIT Madras, Vidya Bharati Mahavidyalaya, and advanced specialisations in quantitative finance and computer systems.",
    mainContent: coursesPage()
}));
console.log("Wrote courses.html");

