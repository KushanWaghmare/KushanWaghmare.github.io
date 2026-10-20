# Colour, Typography & Contrast Audit Report (Phase 0 Baseline vs. Phase 1 After)

- **Phase 0 Baseline Timestamp**: `2026-10-20T11:35:05.309Z`
- **Phase 1 Verified Timestamp**: `2026-10-20T12:42:07.381Z`
- **Audit Method**: Automated headless Chrome (`1440×900`) across all 23 page URLs (`index.html`, 5 domain pages, `papers.html`, `courses.html`, 10 `project.html?p=<id>` pages, 5 `paper.html?p=<id>` pages) in both `dark` and `light` themes.
- **Background Sampling**: 5 animation frames spanning $10.0\\text{ s}$ ($2.0\\text{ s}$ intervals at $60\\text{ fps}$) per slide; worst-case 95th-percentile background luminance for light text and 5th-percentile background luminance for dark text.
- **Targets**: Normal text $\\ge 4.5:1$, large text ($\\ge 24\\text{ px}$ or $\\ge 18.66\\text{ px}$ bold) $\\ge 3.0:1$, muted/caption text $\\ge 4.5:1$, domain accent used as text (`--a-text`) $\\ge 4.5:1$, minimum label font size $\\ge 12\\text{ px}$.

## 1. Executive Summary: Phase 0 (Before) vs. Phase 1 (After)

| Audit Category | Phase 0 Tested | Phase 0 Failing | Phase 0 Pass Rate | Phase 1 Tested | Phase 1 Failing | Phase 1 Pass Rate |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| **CSS Tokens & Surface Pairs** | 110 | **39** | 64.5% | 114 | **0** | **100.0%** |
| **Rendered DOM Text-Over-Sim (10 s worst-case)** | 2644 | **836** | 68.4% | 2632 | **0** | **100.0%** |
| **Minimum Font Size ($< 12\\text{ px}$ check)** | 2644 | **904** | 65.8% | 2632 | **0** | **100.0%** |

---

## 2. CSS Token & Surface Contrast: Phase 1 (After — 0 Failing Rows)

| Theme | Domain | Token / Surface Pair | Foreground | Background | Ratio | Target | Status |
| :--- | :--- | :--- | :---: | :---: | :---: | :---: | :---: |
| `dark` | `all` | --fg on --bg | `#eef0f6` | `#07080c` | **17.57:1** | 4.5:1 | PASS |
| `dark` | `all` | --fg on --glass-solid | `#eef0f6` | `#101219` | **16.42:1** | 4.5:1 | PASS |
| `dark` | `all` | --fg on .glass (over sim) | `#eef0f6` | `#0e1017` | **16.68:1** | 4.5:1 | PASS |
| `dark` | `all` | --fg-muted on --bg | `#9ca3b5` | `#07080c` | **7.93:1** | 4.5:1 | PASS |
| `dark` | `all` | --fg-muted on --glass-solid | `#9ca3b5` | `#101219` | **7.41:1** | 4.5:1 | PASS |
| `dark` | `all` | --fg-muted on .glass (over sim) | `#9ca3b5` | `#0e1017` | **7.53:1** | 4.5:1 | PASS |
| `dark` | `all` | --fg-faint on --bg | `#8b93a7` | `#07080c` | **6.51:1** | 4.5:1 | PASS |
| `dark` | `all` | --fg-faint on --glass-solid | `#8b93a7` | `#101219` | **6.08:1** | 4.5:1 | PASS |
| `dark` | `all` | --fg-faint on .glass (over sim) | `#8b93a7` | `#0e1017` | **6.18:1** | 4.5:1 | PASS |
| `dark` | `all` | --success on --bg | `#20c991` | `#07080c` | **9.37:1** | 4.5:1 | PASS |
| `dark` | `all` | --success on --glass-solid | `#20c991` | `#101219` | **8.75:1** | 4.5:1 | PASS |
| `dark` | `all` | --success on .glass (over sim) | `#20c991` | `#0e1017` | **8.89:1** | 4.5:1 | PASS |
| `dark` | `hub` | --a-text (hub) on --bg (.eyebrow, .idx, .crumbs a) | `#609cff` | `#07080c` | **7.34:1** | 4.5:1 | PASS |
| `dark` | `hub` | --a-text (hub) on --glass-solid (.dot-text, .course-code, .go) | `#609cff` | `#101219` | **6.86:1** | 4.5:1 | PASS |
| `dark` | `hub` | --a-text (hub) on color-mix(10%, --glass-solid) (.snap-cta-btn, .pill, .nav-domain-pill) | `#609cff` | `#171f30` | **6.04:1** | 4.5:1 | PASS |
| `dark` | `hub` | .hero h1 gradient stop 2 var(--a-text) (hub) on --bg | `#609cff` | `#07080c` | **7.34:1** | 3.0:1 | PASS |
| `dark` | `hub` | --on-accent on rgb(--a) (hub) (::selection / filled badge) | `#07080c` | `#609cff` | **7.34:1** | 4.5:1 | PASS |
| `dark` | `math` | --a-text (math) on --bg (.eyebrow, .idx, .crumbs a) | `#ff5c70` | `#07080c` | **6.69:1** | 4.5:1 | PASS |
| `dark` | `math` | --a-text (math) on --glass-solid (.dot-text, .course-code, .go) | `#ff5c70` | `#101219` | **6.25:1** | 4.5:1 | PASS |
| `dark` | `math` | --a-text (math) on color-mix(10%, --glass-solid) (.snap-cta-btn, .pill, .nav-domain-pill) | `#ff5c70` | `#271922` | **5.62:1** | 4.5:1 | PASS |
| `dark` | `math` | .hero h1 gradient stop 2 var(--a-text) (math) on --bg | `#ff5c70` | `#07080c` | **6.69:1** | 3.0:1 | PASS |
| `dark` | `math` | --on-accent on rgb(--a) (math) (::selection / filled badge) | `#07080c` | `#ff5c70` | **6.69:1** | 4.5:1 | PASS |
| `dark` | `physics` | --a-text (physics) on --bg (.eyebrow, .idx, .crumbs a) | `#22d3ee` | `#07080c` | **11.08:1** | 4.5:1 | PASS |
| `dark` | `physics` | --a-text (physics) on --glass-solid (.dot-text, .course-code, .go) | `#22d3ee` | `#101219` | **10.35:1** | 4.5:1 | PASS |
| `dark` | `physics` | --a-text (physics) on color-mix(10%, --glass-solid) (.snap-cta-btn, .pill, .nav-domain-pill) | `#22d3ee` | `#11242e` | **8.83:1** | 4.5:1 | PASS |
| `dark` | `physics` | .hero h1 gradient stop 2 var(--a-text) (physics) on --bg | `#22d3ee` | `#07080c` | **11.08:1** | 3.0:1 | PASS |
| `dark` | `physics` | --on-accent on rgb(--a) (physics) (::selection / filled badge) | `#07080c` | `#22d3ee` | **11.08:1** | 4.5:1 | PASS |
| `dark` | `datascience` | --a-text (datascience) on --bg (.eyebrow, .idx, .crumbs a) | `#f5a623` | `#07080c` | **9.88:1** | 4.5:1 | PASS |
| `dark` | `datascience` | --a-text (datascience) on --glass-solid (.dot-text, .course-code, .go) | `#f5a623` | `#101219` | **9.23:1** | 4.5:1 | PASS |
| `dark` | `datascience` | --a-text (datascience) on color-mix(10%, --glass-solid) (.snap-cta-btn, .pill, .nav-domain-pill) | `#f5a623` | `#26201a` | **7.95:1** | 4.5:1 | PASS |
| `dark` | `datascience` | .hero h1 gradient stop 2 var(--a-text) (datascience) on --bg | `#f5a623` | `#07080c` | **9.88:1** | 3.0:1 | PASS |
| `dark` | `datascience` | --on-accent on rgb(--a) (datascience) (::selection / filled badge) | `#07080c` | `#f5a623` | **9.88:1** | 4.5:1 | PASS |
| `dark` | `quant` | --a-text (quant) on --bg (.eyebrow, .idx, .crumbs a) | `#20c991` | `#07080c` | **9.37:1** | 4.5:1 | PASS |
| `dark` | `quant` | --a-text (quant) on --glass-solid (.dot-text, .course-code, .go) | `#20c991` | `#101219` | **8.75:1** | 4.5:1 | PASS |
| `dark` | `quant` | --a-text (quant) on color-mix(10%, --glass-solid) (.snap-cta-btn, .pill, .nav-domain-pill) | `#20c991` | `#112325` | **7.61:1** | 4.5:1 | PASS |
| `dark` | `quant` | .hero h1 gradient stop 2 var(--a-text) (quant) on --bg | `#20c991` | `#07080c` | **9.37:1** | 3.0:1 | PASS |
| `dark` | `quant` | --on-accent on rgb(--a) (quant) (::selection / filled badge) | `#07080c` | `#20c991` | **9.37:1** | 4.5:1 | PASS |
| `dark` | `cs` | --a-text (cs) on --bg (.eyebrow, .idx, .crumbs a) | `#ac84ff` | `#07080c` | **7.15:1** | 4.5:1 | PASS |
| `dark` | `cs` | --a-text (cs) on --glass-solid (.dot-text, .course-code, .go) | `#ac84ff` | `#101219` | **6.68:1** | 4.5:1 | PASS |
| `dark` | `cs` | --a-text (cs) on color-mix(10%, --glass-solid) (.snap-cta-btn, .pill, .nav-domain-pill) | `#ac84ff` | `#1f1d30` | **5.87:1** | 4.5:1 | PASS |
| `dark` | `cs` | .hero h1 gradient stop 2 var(--a-text) (cs) on --bg | `#ac84ff` | `#07080c` | **7.15:1** | 3.0:1 | PASS |
| `dark` | `cs` | --on-accent on rgb(--a) (cs) (::selection / filled badge) | `#07080c` | `#ac84ff` | **7.15:1** | 4.5:1 | PASS |
| `dark` | `papers` | --a-text (papers) on --bg (.eyebrow, .idx, .crumbs a) | `#a3e635` | `#07080c` | **13.28:1** | 4.5:1 | PASS |
| `dark` | `papers` | --a-text (papers) on --glass-solid (.dot-text, .course-code, .go) | `#a3e635` | `#101219` | **12.41:1** | 4.5:1 | PASS |
| `dark` | `papers` | --a-text (papers) on color-mix(10%, --glass-solid) (.snap-cta-btn, .pill, .nav-domain-pill) | `#a3e635` | `#1e261c` | **10.32:1** | 4.5:1 | PASS |
| `dark` | `papers` | .hero h1 gradient stop 2 var(--a-text) (papers) on --bg | `#a3e635` | `#07080c` | **13.28:1** | 3.0:1 | PASS |
| `dark` | `papers` | --on-accent on rgb(--a) (papers) (::selection / filled badge) | `#07080c` | `#a3e635` | **13.28:1** | 4.5:1 | PASS |
| `dark` | `courses` | --a-text (courses) on --bg (.eyebrow, .idx, .crumbs a) | `#f468b0` | `#07080c` | **7.10:1** | 4.5:1 | PASS |
| `dark` | `courses` | --a-text (courses) on --glass-solid (.dot-text, .course-code, .go) | `#f468b0` | `#101219` | **6.64:1** | 4.5:1 | PASS |
| `dark` | `courses` | --a-text (courses) on color-mix(10%, --glass-solid) (.snap-cta-btn, .pill, .nav-domain-pill) | `#f468b0` | `#261a28` | **5.91:1** | 4.5:1 | PASS |
| `dark` | `courses` | .hero h1 gradient stop 2 var(--a-text) (courses) on --bg | `#f468b0` | `#07080c` | **7.10:1** | 3.0:1 | PASS |
| `dark` | `courses` | --on-accent on rgb(--a) (courses) (::selection / filled badge) | `#07080c` | `#f468b0` | **7.10:1** | 4.5:1 | PASS |
| `dark` | `contact` | --a-text (contact) on --bg (.eyebrow, .idx, .crumbs a) | `#24c8b6` | `#07080c` | **9.54:1** | 4.5:1 | PASS |
| `dark` | `contact` | --a-text (contact) on --glass-solid (.dot-text, .course-code, .go) | `#24c8b6` | `#101219` | **8.92:1** | 4.5:1 | PASS |
| `dark` | `contact` | --a-text (contact) on color-mix(10%, --glass-solid) (.snap-cta-btn, .pill, .nav-domain-pill) | `#24c8b6` | `#112329` | **7.72:1** | 4.5:1 | PASS |
| `dark` | `contact` | .hero h1 gradient stop 2 var(--a-text) (contact) on --bg | `#24c8b6` | `#07080c` | **9.54:1** | 3.0:1 | PASS |
| `dark` | `contact` | --on-accent on rgb(--a) (contact) (::selection / filled badge) | `#07080c` | `#24c8b6` | **9.54:1** | 4.5:1 | PASS |
| `light` | `all` | --fg on --bg | `#0f172a` | `#f6f7fb` | **16.68:1** | 4.5:1 | PASS |
| `light` | `all` | --fg on --glass-solid | `#0f172a` | `#ffffff` | **17.85:1** | 4.5:1 | PASS |
| `light` | `all` | --fg on .glass (over sim) | `#0f172a` | `#ebebeb` | **14.98:1** | 4.5:1 | PASS |
| `light` | `all` | --fg-muted on --bg | `#3f4d63` | `#f6f7fb` | **8.00:1** | 4.5:1 | PASS |
| `light` | `all` | --fg-muted on --glass-solid | `#3f4d63` | `#ffffff` | **8.56:1** | 4.5:1 | PASS |
| `light` | `all` | --fg-muted on .glass (over sim) | `#3f4d63` | `#ebebeb` | **7.18:1** | 4.5:1 | PASS |
| `light` | `all` | --fg-faint on --bg | `#4b5970` | `#f6f7fb` | **6.62:1** | 4.5:1 | PASS |
| `light` | `all` | --fg-faint on --glass-solid | `#4b5970` | `#ffffff` | **7.09:1** | 4.5:1 | PASS |
| `light` | `all` | --fg-faint on .glass (over sim) | `#4b5970` | `#ebebeb` | **5.95:1** | 4.5:1 | PASS |
| `light` | `all` | --success on --bg | `#04724d` | `#f6f7fb` | **5.57:1** | 4.5:1 | PASS |
| `light` | `all` | --success on --glass-solid | `#04724d` | `#ffffff` | **5.97:1** | 4.5:1 | PASS |
| `light` | `all` | --success on .glass (over sim) | `#04724d` | `#ebebeb` | **5.01:1** | 4.5:1 | PASS |
| `light` | `hub` | --a-text (hub) on --bg (.eyebrow, .idx, .crumbs a) | `#1d4ed8` | `#f6f7fb` | **6.26:1** | 4.5:1 | PASS |
| `light` | `hub` | --a-text (hub) on --glass-solid (.dot-text, .course-code, .go) | `#1d4ed8` | `#ffffff` | **6.70:1** | 4.5:1 | PASS |
| `light` | `hub` | --a-text (hub) on color-mix(10%, --glass-solid) (.snap-cta-btn, .pill, .nav-domain-pill) | `#1d4ed8` | `#e1e6f5` | **5.37:1** | 4.5:1 | PASS |
| `light` | `hub` | .hero h1 gradient stop 2 var(--a-text) (hub) on --bg | `#1d4ed8` | `#f6f7fb` | **6.26:1** | 3.0:1 | PASS |
| `light` | `hub` | --on-accent on rgb(--a) (hub) (::selection / filled badge) | `#ffffff` | `#1d4ed8` | **6.70:1** | 4.5:1 | PASS |
| `light` | `math` | --a-text (math) on --bg (.eyebrow, .idx, .crumbs a) | `#af1036` | `#f6f7fb` | **6.65:1** | 4.5:1 | PASS |
| `light` | `math` | --a-text (math) on --glass-solid (.dot-text, .course-code, .go) | `#af1036` | `#ffffff` | **7.12:1** | 4.5:1 | PASS |
| `light` | `math` | --a-text (math) on color-mix(10%, --glass-solid) (.snap-cta-btn, .pill, .nav-domain-pill) | `#af1036` | `#f0e0e5` | **5.59:1** | 4.5:1 | PASS |
| `light` | `math` | .hero h1 gradient stop 2 var(--a-text) (math) on --bg | `#af1036` | `#f6f7fb` | **6.65:1** | 3.0:1 | PASS |
| `light` | `math` | --on-accent on rgb(--a) (math) (::selection / filled badge) | `#ffffff` | `#af1036` | **7.12:1** | 4.5:1 | PASS |
| `light` | `physics` | --a-text (physics) on --bg (.eyebrow, .idx, .crumbs a) | `#03669c` | `#f6f7fb` | **5.80:1** | 4.5:1 | PASS |
| `light` | `physics` | --a-text (physics) on --glass-solid (.dot-text, .course-code, .go) | `#03669c` | `#ffffff` | **6.20:1** | 4.5:1 | PASS |
| `light` | `physics` | --a-text (physics) on color-mix(10%, --glass-solid) (.snap-cta-btn, .pill, .nav-domain-pill) | `#03669c` | `#dfe9ef` | **5.03:1** | 4.5:1 | PASS |
| `light` | `physics` | .hero h1 gradient stop 2 var(--a-text) (physics) on --bg | `#03669c` | `#f6f7fb` | **5.80:1** | 3.0:1 | PASS |
| `light` | `physics` | --on-accent on rgb(--a) (physics) (::selection / filled badge) | `#ffffff` | `#03669c` | **6.20:1** | 4.5:1 | PASS |
| `light` | `datascience` | --a-text (datascience) on --bg (.eyebrow, .idx, .crumbs a) | `#9a4406` | `#f6f7fb` | **6.12:1** | 4.5:1 | PASS |
| `light` | `datascience` | --a-text (datascience) on --glass-solid (.dot-text, .course-code, .go) | `#9a4406` | `#ffffff` | **6.56:1** | 4.5:1 | PASS |
| `light` | `datascience` | --a-text (datascience) on color-mix(10%, --glass-solid) (.snap-cta-btn, .pill, .nav-domain-pill) | `#9a4406` | `#eee5e0` | **5.28:1** | 4.5:1 | PASS |
| `light` | `datascience` | .hero h1 gradient stop 2 var(--a-text) (datascience) on --bg | `#9a4406` | `#f6f7fb` | **6.12:1** | 3.0:1 | PASS |
| `light` | `datascience` | --on-accent on rgb(--a) (datascience) (::selection / filled badge) | `#ffffff` | `#9a4406` | **6.56:1** | 4.5:1 | PASS |
| `light` | `quant` | --a-text (quant) on --bg (.eyebrow, .idx, .crumbs a) | `#04724d` | `#f6f7fb` | **5.57:1** | 4.5:1 | PASS |
| `light` | `quant` | --a-text (quant) on --glass-solid (.dot-text, .course-code, .go) | `#04724d` | `#ffffff` | **5.97:1** | 4.5:1 | PASS |
| `light` | `quant` | --a-text (quant) on color-mix(10%, --glass-solid) (.snap-cta-btn, .pill, .nav-domain-pill) | `#04724d` | `#dfeae7` | **4.85:1** | 4.5:1 | PASS |
| `light` | `quant` | .hero h1 gradient stop 2 var(--a-text) (quant) on --bg | `#04724d` | `#f6f7fb` | **5.57:1** | 3.0:1 | PASS |
| `light` | `quant` | --on-accent on rgb(--a) (quant) (::selection / filled badge) | `#ffffff` | `#04724d` | **5.97:1** | 4.5:1 | PASS |
| `light` | `cs` | --a-text (cs) on --bg (.eyebrow, .idx, .crumbs a) | `#6d28d9` | `#f6f7fb` | **6.64:1** | 4.5:1 | PASS |
| `light` | `cs` | --a-text (cs) on --glass-solid (.dot-text, .course-code, .go) | `#6d28d9` | `#ffffff` | **7.10:1** | 4.5:1 | PASS |
| `light` | `cs` | --a-text (cs) on color-mix(10%, --glass-solid) (.snap-cta-btn, .pill, .nav-domain-pill) | `#6d28d9` | `#e9e2f5` | **5.64:1** | 4.5:1 | PASS |
| `light` | `cs` | .hero h1 gradient stop 2 var(--a-text) (cs) on --bg | `#6d28d9` | `#f6f7fb` | **6.64:1** | 3.0:1 | PASS |
| `light` | `cs` | --on-accent on rgb(--a) (cs) (::selection / filled badge) | `#ffffff` | `#6d28d9` | **7.10:1** | 4.5:1 | PASS |
| `light` | `papers` | --a-text (papers) on --bg (.eyebrow, .idx, .crumbs a) | `#3f6c06` | `#f6f7fb` | **5.84:1** | 4.5:1 | PASS |
| `light` | `papers` | --a-text (papers) on --glass-solid (.dot-text, .course-code, .go) | `#3f6c06` | `#ffffff` | **6.25:1** | 4.5:1 | PASS |
| `light` | `papers` | --a-text (papers) on color-mix(10%, --glass-solid) (.snap-cta-btn, .pill, .nav-domain-pill) | `#3f6c06` | `#e5e9e0` | **5.08:1** | 4.5:1 | PASS |
| `light` | `papers` | .hero h1 gradient stop 2 var(--a-text) (papers) on --bg | `#3f6c06` | `#f6f7fb` | **5.84:1** | 3.0:1 | PASS |
| `light` | `papers` | --on-accent on rgb(--a) (papers) (::selection / filled badge) | `#ffffff` | `#3f6c06` | **6.25:1** | 4.5:1 | PASS |
| `light` | `courses` | --a-text (courses) on --bg (.eyebrow, .idx, .crumbs a) | `#a81452` | `#f6f7fb` | **6.79:1** | 4.5:1 | PASS |
| `light` | `courses` | --a-text (courses) on --glass-solid (.dot-text, .course-code, .go) | `#a81452` | `#ffffff` | **7.27:1** | 4.5:1 | PASS |
| `light` | `courses` | --a-text (courses) on color-mix(10%, --glass-solid) (.snap-cta-btn, .pill, .nav-domain-pill) | `#a81452` | `#efe0e7` | **5.71:1** | 4.5:1 | PASS |
| `light` | `courses` | .hero h1 gradient stop 2 var(--a-text) (courses) on --bg | `#a81452` | `#f6f7fb` | **6.79:1** | 3.0:1 | PASS |
| `light` | `courses` | --on-accent on rgb(--a) (courses) (::selection / filled badge) | `#ffffff` | `#a81452` | **7.27:1** | 4.5:1 | PASS |
| `light` | `contact` | --a-text (contact) on --bg (.eyebrow, .idx, .crumbs a) | `#0b6e65` | `#f6f7fb` | **5.71:1** | 4.5:1 | PASS |
| `light` | `contact` | --a-text (contact) on --glass-solid (.dot-text, .course-code, .go) | `#0b6e65` | `#ffffff` | **6.12:1** | 4.5:1 | PASS |
| `light` | `contact` | --a-text (contact) on color-mix(10%, --glass-solid) (.snap-cta-btn, .pill, .nav-domain-pill) | `#0b6e65` | `#dfe9e9` | **4.94:1** | 4.5:1 | PASS |
| `light` | `contact` | .hero h1 gradient stop 2 var(--a-text) (contact) on --bg | `#0b6e65` | `#f6f7fb` | **5.71:1** | 3.0:1 | PASS |
| `light` | `contact` | --on-accent on rgb(--a) (contact) (::selection / filled badge) | `#ffffff` | `#0b6e65` | **6.12:1** | 4.5:1 | PASS |

---

## 3. CSS Token & Canvas Contrast: Phase 0 Baseline (Before — 39 Failing Rows)

| Theme | Domain | Token / Selector Pair (Phase 0) | Foreground | Background | Ratio | Target | Status |
| :--- | :--- | :--- | :---: | :---: | :---: | :---: | :---: |
| `dark` | `math` | --accent (math) on --bg (.eyebrow, .idx, .crumbs a) | `#e02840` | `#07080c` | **4.33:1** | 4.5:1 | FAIL |
| `dark` | `math` | --accent (math) on --glass-solid (.dot-text, .course-code, .go) | `#e02840` | `#101119` | **4.07:1** | 4.5:1 | FAIL |
| `dark` | `math` | --accent (math) on rgba(--a, 0.12) (.snap-cta-btn, .nav-domain-pill) | `#e02840` | `#240f17` | **3.93:1** | 4.5:1 | FAIL |
| `dark` | `cs` | --accent (cs) on --glass-solid (.dot-text, .course-code, .go) | `#8b5cf6` | `#101119` | **4.44:1** | 4.5:1 | FAIL |
| `dark` | `cs` | --accent (cs) on rgba(--a, 0.12) (.snap-cta-btn, .nav-domain-pill) | `#8b5cf6` | `#19162c` | **4.16:1** | 4.5:1 | FAIL |
| `dark` | `cs` | canvas fillText: NAV.cs step counter '#00001' (10px) | `#7f55e0` | `#101119` | **3.83:1** | 4.5:1 | FAIL |
| `dark` | `courses` | canvas fillText: NAV.courses inactive stage 'FND/CORE/HNR/DEG' (8.5px) | `#7d2c58` | `#221523` | **1.98:1** | 4.5:1 | FAIL |
| `dark` | `courses` | canvas fillText: NAV.courses active stage 'FND/CORE/HNR/DEG' (8.5px) | `#ec4899` | `#3c1c33` | **4.23:1** | 4.5:1 | FAIL |
| `dark` | `datascience` | canvas fillText: ENGINES.flock 'ABM // N:...' (10px) | `#a26a0b` | `#07080c` | **4.39:1** | 4.5:1 | FAIL |
| `dark` | `cs` | canvas fillText: ENGINES.algo AST/W-Bus module title (10px) | `#885af1` | `#0b0d15` | **4.41:1** | 4.5:1 | FAIL |
| `light` | `all` | --success on --bg | `#059669` | `#f6f7fb` | **3.52:1** | 4.5:1 | FAIL |
| `light` | `all` | --success on --glass-solid | `#059669` | `#fefeff` | **3.74:1** | 4.5:1 | FAIL |
| `light` | `all` | --success on .glass (over sim) | `#059669` | `#d9dada` | **2.69:1** | 4.5:1 | FAIL |
| `light` | `hub` | --accent (hub) on rgba(--a, 0.12) (.snap-cta-btn, .nav-domain-pill) | `#2563eb` | `#c3ccdc` | **3.20:1** | 4.5:1 | FAIL |
| `light` | `math` | --accent (math) on rgba(--a, 0.12) (.snap-cta-btn, .nav-domain-pill) | `#be123c` | `#d6c2c7` | **3.71:1** | 4.5:1 | FAIL |
| `light` | `physics` | --accent (physics) on --bg (.eyebrow, .idx, .crumbs a) | `#0284c7` | `#f6f7fb` | **3.83:1** | 4.5:1 | FAIL |
| `light` | `physics` | --accent (physics) on --glass-solid (.dot-text, .course-code, .go) | `#0284c7` | `#fefeff` | **4.06:1** | 4.5:1 | FAIL |
| `light` | `physics` | --accent (physics) on rgba(--a, 0.12) (.snap-cta-btn, .nav-domain-pill) | `#0284c7` | `#bfd0d8` | **2.58:1** | 4.5:1 | FAIL |
| `light` | `datascience` | --accent (datascience) on rgba(--a, 0.12) (.snap-cta-btn, .nav-domain-pill) | `#b45309` | `#d5cac1` | **3.12:1** | 4.5:1 | FAIL |
| `light` | `quant` | --accent (quant) on --bg (.eyebrow, .idx, .crumbs a) | `#059669` | `#f6f7fb` | **3.52:1** | 4.5:1 | FAIL |
| `light` | `quant` | --accent (quant) on --glass-solid (.dot-text, .course-code, .go) | `#059669` | `#fefeff` | **3.74:1** | 4.5:1 | FAIL |
| `light` | `quant` | --accent (quant) on rgba(--a, 0.12) (.snap-cta-btn, .nav-domain-pill) | `#059669` | `#c0d2cc` | **2.39:1** | 4.5:1 | FAIL |
| `light` | `quant` | .hero h1 gradient stop 2 rgba(--a, 0.85) (quant) on --bg | `#29a57f` | `#f6f7fb` | **2.89:1** | 3.0:1 | FAIL |
| `light` | `cs` | --accent (cs) on rgba(--a, 0.12) (.snap-cta-btn, .nav-domain-pill) | `#6d28d9` | `#ccc5da` | **4.25:1** | 4.5:1 | FAIL |
| `light` | `papers` | --accent (papers) on --bg (.eyebrow, .idx, .crumbs a) | `#65a30d` | `#f6f7fb` | **2.89:1** | 4.5:1 | FAIL |
| `light` | `papers` | --accent (papers) on --glass-solid (.dot-text, .course-code, .go) | `#65a30d` | `#fefeff` | **3.06:1** | 4.5:1 | FAIL |
| `light` | `papers` | --accent (papers) on rgba(--a, 0.12) (.snap-cta-btn, .nav-domain-pill) | `#65a30d` | `#cbd3c1` | **2.00:1** | 4.5:1 | FAIL |
| `light` | `papers` | .hero h1 gradient stop 2 rgba(--a, 0.85) (papers) on --bg | `#7bb031` | `#f6f7fb` | **2.42:1** | 3.0:1 | FAIL |
| `light` | `courses` | --accent (courses) on rgba(--a, 0.12) (.snap-cta-btn, .nav-domain-pill) | `#be185d` | `#d6c3cb` | **3.60:1** | 4.5:1 | FAIL |
| `light` | `contact` | --accent (contact) on --bg (.eyebrow, .idx, .crumbs a) | `#0d9488` | `#f6f7fb` | **3.50:1** | 4.5:1 | FAIL |
| `light` | `contact` | --accent (contact) on --glass-solid (.dot-text, .course-code, .go) | `#0d9488` | `#fefeff` | **3.71:1** | 4.5:1 | FAIL |
| `light` | `contact` | --accent (contact) on rgba(--a, 0.12) (.snap-cta-btn, .nav-domain-pill) | `#0d9488` | `#c1d2d0` | **2.39:1** | 4.5:1 | FAIL |
| `light` | `contact` | .hero h1 gradient stop 2 rgba(--a, 0.85) (contact) on --bg | `#30a399` | `#f6f7fb` | **2.87:1** | 3.0:1 | FAIL |
| `light` | `physics` | canvas fillText: NAV.physics isotope label '²³⁵U' (7.5px) | `#7f7f80` | `#fefeff` | **3.97:1** | 4.5:1 | FAIL |
| `light` | `courses` | canvas fillText: NAV.courses inactive stage 'FND/CORE/HNR/DEG' (8.5px) | `#de8daf` | `#f9ecf2` | **2.15:1** | 4.5:1 | FAIL |
| `light` | `courses` | canvas fillText: NAV.courses active stage 'FND/CORE/HNR/DEG' (8.5px) | `#be185d` | `#f1d0df` | **4.26:1** | 4.5:1 | FAIL |
| `light` | `datascience` | canvas fillText: ENGINES.flock 'ABM // N:...' (10px) | `#cb8c5e` | `#f6f7fb` | **2.63:1** | 4.5:1 | FAIL |
| `light` | `cs` | canvas fillText: ENGINES.algo W-Bus register value cyan (10px) | `#0284c7` | `#fefeff` | **4.06:1** | 4.5:1 | FAIL |
| `light` | `quant` | canvas fillText: ENGINES.markov state node 'S0..S4' (11px) | `#059669` | `#fefeff` | **3.74:1** | 4.5:1 | FAIL |

---

## 4. Rendered DOM Text-Over-Sim Contrast by Page & Theme (Phase 0 Before vs. Phase 1 After)

> Note: All text-over-sim rows will be re-verified again in **Phase 7** against the final upgraded GPU simulations.

| Page | Theme | Phase 0 Tested | Phase 0 Failing | Phase 0 Worst Ratio | Phase 1 Tested | Phase 1 Failing | Phase 1 Worst Ratio |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| `index.html` | `dark` | 135 | 18 | 1.20:1 | 135 | **0** | **5.66:1** |
| `index.html` | `light` | 135 | 61 | 1.16:1 | 135 | **0** | **5.16:1** |
| `math.html` | `dark` | 62 | 17 | 1.92:1 | 62 | **0** | **5.66:1** |
| `math.html` | `light` | 62 | 31 | 1.12:1 | 62 | **0** | **5.43:1** |
| `physics.html` | `dark` | 61 | 11 | 1.00:1 | 62 | **0** | **5.79:1** |
| `physics.html` | `light` | 61 | 39 | 1.02:1 | 62 | **0** | **4.80:1** |
| `datascience.html` | `dark` | 62 | 6 | 2.69:1 | 62 | **0** | **5.79:1** |
| `datascience.html` | `light` | 62 | 31 | 1.12:1 | 62 | **0** | **5.43:1** |
| `quant.html` | `dark` | 62 | 13 | 1.35:1 | 62 | **0** | **5.79:1** |
| `quant.html` | `light` | 62 | 32 | 1.00:1 | 62 | **0** | **5.16:1** |
| `cs.html` | `dark` | 62 | 13 | 1.37:1 | 62 | **0** | **5.79:1** |
| `cs.html` | `light` | 62 | 19 | 1.38:1 | 62 | **0** | **5.37:1** |
| `papers.html` | `dark` | 135 | 21 | 2.69:1 | 135 | **0** | **5.60:1** |
| `papers.html` | `light` | 135 | 66 | 1.07:1 | 135 | **0** | **5.16:1** |
| `courses.html` | `dark` | 95 | 5 | 2.69:1 | 95 | **0** | **5.83:1** |
| `courses.html` | `light` | 95 | 32 | 1.12:1 | 95 | **0** | **5.16:1** |
| `project.html?p=mobius-surfaces` | `dark` | 37 | 14 | 1.72:1 | 37 | **0** | **5.66:1** |
| `project.html?p=mobius-surfaces` | `light` | 37 | 18 | 1.26:1 | 37 | **0** | **5.88:1** |
| `project.html?p=fourier-spectral` | `dark` | 37 | 13 | 3.04:1 | 37 | **0** | **5.66:1** |
| `project.html?p=fourier-spectral` | `light` | 37 | 18 | 1.00:1 | 37 | **0** | **5.87:1** |
| `project.html?p=nbody-leapfrog` | `dark` | 37 | 7 | 1.93:1 | 35 | **0** | **6.82:1** |
| `project.html?p=nbody-leapfrog` | `light` | 37 | 19 | 1.10:1 | 35 | **0** | **5.40:1** |
| `project.html?p=split-step-schrodinger` | `dark` | 37 | 4 | 3.12:1 | 37 | **0** | **7.45:1** |
| `project.html?p=split-step-schrodinger` | `light` | 37 | 23 | 1.04:1 | 37 | **0** | **5.11:1** |
| `project.html?p=regularised-regression` | `dark` | 37 | 5 | 2.75:1 | 37 | **0** | **7.15:1** |
| `project.html?p=regularised-regression` | `light` | 37 | 18 | 1.10:1 | 37 | **0** | **5.60:1** |
| `project.html?p=spectral-clustering` | `dark` | 37 | 4 | 2.79:1 | 37 | **0** | **7.34:1** |
| `project.html?p=spectral-clustering` | `light` | 37 | 19 | 1.21:1 | 37 | **0** | **5.56:1** |
| `project.html?p=options-pricing` | `dark` | 37 | 9 | 1.49:1 | 37 | **0** | **6.79:1** |
| `project.html?p=options-pricing` | `light` | 37 | 22 | 1.05:1 | 37 | **0** | **5.15:1** |
| `project.html?p=stat-arb` | `dark` | 35 | 4 | 2.70:1 | 35 | **0** | **7.35:1** |
| `project.html?p=stat-arb` | `light` | 35 | 14 | 1.98:1 | 35 | **0** | **5.22:1** |
| `project.html?p=ku-lang` | `dark` | 37 | 6 | 3.46:1 | 37 | **0** | **5.94:1** |
| `project.html?p=ku-lang` | `light` | 37 | 3 | 2.82:1 | 37 | **0** | **6.11:1** |
| `project.html?p=8bit-computer` | `dark` | 37 | 6 | 3.45:1 | 37 | **0** | **5.94:1** |
| `project.html?p=8bit-computer` | `light` | 37 | 4 | 2.82:1 | 37 | **0** | **6.11:1** |
| `paper.html?p=langevin-loss-landscapes` | `dark` | 56 | 10 | 3.00:1 | 55 | **0** | **6.08:1** |
| `paper.html?p=langevin-loss-landscapes` | `light` | 56 | 32 | 1.04:1 | 55 | **0** | **5.13:1** |
| `paper.html?p=hft-stat-arb-microstructure` | `dark` | 56 | 8 | 3.09:1 | 55 | **0** | **6.08:1** |
| `paper.html?p=hft-stat-arb-microstructure` | `light` | 56 | 26 | 1.81:1 | 55 | **0** | **5.16:1** |
| `paper.html?p=symplectic-energy-bounds-nbody` | `dark` | 56 | 12 | 2.08:1 | 55 | **0** | **6.08:1** |
| `paper.html?p=symplectic-energy-bounds-nbody` | `light` | 56 | 32 | 1.10:1 | 55 | **0** | **4.98:1** |
| `paper.html?p=verified-ssa-compiler-passes` | `dark` | 56 | 8 | 3.09:1 | 55 | **0** | **5.85:1** |
| `paper.html?p=verified-ssa-compiler-passes` | `light` | 56 | 27 | 1.81:1 | 55 | **0** | **5.32:1** |
| `paper.html?p=riemannian-immersion-gauss-bonnet` | `dark` | 56 | 9 | 3.09:1 | 55 | **0** | **5.60:1** |
| `paper.html?p=riemannian-immersion-gauss-bonnet` | `light` | 56 | 27 | 1.81:1 | 55 | **0** | **5.24:1** |

---

## 5. Typography Minimum Size Audit ($< 12\\text{ px}$): Phase 0 Before vs. Phase 1 After

- **Phase 0 Failing Elements ($< 12\\text{ px}$)**: **904 / 2,644** (`.eyebrow`, `.snap-dot .dot-text`, `.sim-tag`, `.snap-cue`, `.tag`, `.tag-status`, `.snap-proj-label`, `.snap-jump-label`, `.paper-section-tag`, `.paper-domain-tag`, `.course-topics span`, `.card .no`, `.card .go`, `.contact-status`, `.contact-label`, `.crumbs`, `.links a`, `.nav-domain-pill`, `.nav-back-link`, `.section-head .idx`).
- **Phase 1 Failing Elements ($< 12\\text{ px}$)**: **0 / 2,632** (all labels, tags, captions, pills, and breadcrumbs are $\\ge 12\\text{ px}$).

---

## 6. Historical Phase 0 Failing DOM Rows (All 836 Baseline Failures Resolved in Phase 1)

| Page | Slide | Sim ID | Theme | Selector | Font Size | FG | BG (p95/p05) | Phase 0 Ratio | Target |
| :--- | :--- | :--- | :--- | :--- | :---: | :---: | :---: | :---: | :---: |
| `index.html` | `intro` | `hub:intro` | `dark` | `h1 (gradient stop 2 rgba(--a,0.85))` | 112.0px | `#558aee` | `#787f8f` | **1.20:1** | 3.0:1 |
| `index.html` | `intro` | `hub:intro` | `dark` | `.lead, .snap-lead` | 16.0px | `#e9ebf1` | `#6c7380` | **4.00:1** | 4.5:1 |
| `index.html` | `domain-math` | `hub:domain-math` | `dark` | `.nav .brand b` | 14.0px | `#e02840` | `#0d0e15` | **4.17:1** | 4.5:1 |
| `index.html` | `domain-math` | `hub:domain-math` | `dark` | `.nav .nav-contact-link` | 12.0px | `#e02840` | `#1c131c` | **3.92:1** | 4.5:1 |
| `index.html` | `domain-math` | `hub:domain-math` | `dark` | `.snap-pager .snap-dot.active .dot-text` | 11.0px | `#e02840` | `#11121b` | **4.04:1** | 4.5:1 |
| `index.html` | `domain-math` | `hub:domain-math` | `dark` | `.eyebrow` | 12.0px | `#e02840` | `#0a0a0f` | **4.28:1** | 4.5:1 |
| `index.html` | `domain-math` | `hub:domain-math` | `dark` | `.snap-cta-btn` | 13.0px | `#e02840` | `#220e14` | **3.99:1** | 4.5:1 |
| `index.html` | `domain-physics` | `hub:domain-physics` | `dark` | `.nav .nav-contact-link` | 12.0px | `#22d3ee` | `#166d7d` | **3.30:1** | 4.5:1 |
| `index.html` | `domain-physics` | `hub:domain-physics` | `dark` | `.snap-title, .section-head h2` | 84.0px | `#e9ebf1` | `#c2bab3` | **1.61:1** | 3.0:1 |
| `index.html` | `domain-datascience` | `hub:domain-datascience` | `dark` | `.nav .nav-contact-link` | 12.0px | `#f59e0b` | `#885b12` | **2.75:1** | 4.5:1 |
| `index.html` | `domain-quant` | `hub:domain-quant` | `dark` | `.nav .nav-contact-link` | 12.0px | `#10b981` | `#10694f` | **2.62:1** | 4.5:1 |
| `index.html` | `domain-quant` | `hub:domain-quant` | `dark` | `.snap-pager .snap-dot.active .dot-text` | 11.0px | `#10b981` | `#667176` | **1.98:1** | 4.5:1 |
| `index.html` | `domain-quant` | `hub:domain-quant` | `dark` | `.eyebrow` | 12.0px | `#10b981` | `#405145` | **3.34:1** | 4.5:1 |
| `index.html` | `domain-cs` | `hub:domain-cs` | `dark` | `.nav .nav-contact-link` | 12.0px | `#8b5cf6` | `#251c43` | **3.74:1** | 4.5:1 |
| `index.html` | `domain-cs` | `hub:domain-cs` | `dark` | `.snap-pager .snap-dot.active .dot-text` | 11.0px | `#8b5cf6` | `#10121b` | **4.41:1** | 4.5:1 |
| `index.html` | `domain-cs` | `hub:domain-cs` | `dark` | `.snap-cta-btn` | 13.0px | `#8b5cf6` | `#171228` | **4.30:1** | 4.5:1 |
| `index.html` | `section-papers` | `hub:papers` | `dark` | `.nav .nav-contact-link` | 12.0px | `#a3e635` | `#5b7f24` | **3.09:1** | 4.5:1 |
| `index.html` | `about-contact` | `hub:contact` | `dark` | `.nav .nav-contact-link` | 12.0px | `#14b8a6` | `#106660` | **2.73:1** | 4.5:1 |
| `index.html` | `intro` | `hub:intro` | `light` | `.nav .nav-contact-link` | 12.0px | `#2563eb` | `#86a5ea` | **2.11:1** | 4.5:1 |
| `index.html` | `intro` | `hub:intro` | `light` | `.snap-pager .snap-dot.active .dot-text` | 11.0px | `#2563eb` | `#3a4259` | **1.93:1** | 4.5:1 |
| `index.html` | `intro` | `hub:intro` | `light` | `.snap-pager .snap-dot:not(.active) .dot-text` | 11.0px | `#475569` | `#384358` | **1.31:1** | 4.5:1 |
| `index.html` | `intro` | `hub:intro` | `light` | `.eyebrow` | 12.0px | `#2563eb` | `#abb0bd` | **2.38:1** | 4.5:1 |
| `index.html` | `intro` | `hub:intro` | `light` | `h1 (gradient stop 2 rgba(--a,0.85))` | 112.0px | `#3c71e7` | `#bec2cd` | **2.50:1** | 3.0:1 |
| `index.html` | `intro` | `hub:intro` | `light` | `.sim-tag` | 11.0px | `#475569` | `#404759` | **1.22:1** | 4.5:1 |
| `index.html` | `domain-math` | `hub:domain-math` | `light` | `.nav .nav-contact-link` | 12.0px | `#9a2565` | `#d37d93` | **2.52:1** | 4.5:1 |
| `index.html` | `domain-math` | `hub:domain-math` | `light` | `.snap-pager .snap-dot.active .dot-text` | 11.0px | `#af1a41` | `#4a3944` | **1.55:1** | 4.5:1 |
| `index.html` | `domain-math` | `hub:domain-math` | `light` | `.snap-pager .snap-dot:not(.active) .dot-text` | 11.0px | `#475264` | `#4a3944` | **1.36:1** | 4.5:1 |
| `index.html` | `domain-math` | `hub:domain-math` | `light` | `.eyebrow` | 12.0px | `#be123c` | `#a9959f` | **2.24:1** | 4.5:1 |
| `index.html` | `domain-math` | `hub:domain-math` | `light` | `.lead, .snap-lead` | 19.0px | `#475569` | `#a2939c` | **2.59:1** | 4.5:1 |
| `index.html` | `domain-math` | `hub:domain-math` | `light` | `.snap-cta-btn` | 13.0px | `#be123c` | `#c4aab5` | **2.92:1** | 4.5:1 |
| `index.html` | `domain-math` | `hub:domain-math` | `light` | `.snap-count` | 12.0px | `#475569` | `#b9abb3` | **3.44:1** | 4.5:1 |
| `index.html` | `domain-math` | `hub:domain-math` | `light` | `.sim-tag` | 11.0px | `#475569` | `#4e414c` | **1.27:1** | 4.5:1 |
| `index.html` | `domain-physics` | `hub:domain-physics` | `light` | `.nav .brand b` | 14.0px | `#0284c7` | `#d9d9d9` | **2.90:1** | 4.5:1 |
| `index.html` | `domain-physics` | `hub:domain-physics` | `light` | `.nav .nav-contact-link` | 12.0px | `#0284c7` | `#6fafd1` | **1.70:1** | 4.5:1 |
| `index.html` | `domain-physics` | `hub:domain-physics` | `light` | `.snap-pager .snap-dot:not(.active) .dot-text` | 11.0px | `#475569` | `#010101` | **2.75:1** | 4.5:1 |
| `index.html` | `domain-physics` | `hub:domain-physics` | `light` | `.snap-title, .section-head h2` | 84.0px | `#0f172a` | `#000000` | **1.18:1** | 3.0:1 |
| `index.html` | `domain-physics` | `hub:domain-physics` | `light` | `.lead, .snap-lead` | 19.0px | `#475569` | `#010100` | **2.76:1** | 4.5:1 |
| `index.html` | `domain-physics` | `hub:domain-physics` | `light` | `.snap-proj-label, .snap-jump-label` | 11.0px | `#475569` | `#000000` | **2.77:1** | 4.5:1 |
| `index.html` | `domain-physics` | `hub:domain-physics` | `light` | `.snap-count` | 12.0px | `#475569` | `#000000` | **2.77:1** | 4.5:1 |
| `index.html` | `domain-physics` | `hub:domain-physics` | `light` | `.sim-tag` | 11.0px | `#475569` | `#000000` | **2.77:1** | 4.5:1 |
| `index.html` | `domain-physics` | `hub:domain-physics` | `light` | `.snap-cue` | 11.0px | `#475569` | `#000000` | **2.77:1** | 4.5:1 |
| `index.html` | `domain-datascience` | `hub:domain-datascience` | `light` | `.nav .nav-contact-link` | 12.0px | `#b45309` | `#ce9d79` | **2.09:1** | 4.5:1 |
| `index.html` | `domain-datascience` | `hub:domain-datascience` | `light` | `.snap-pager .snap-dot.active .dot-text` | 11.0px | `#b45309` | `#49413e` | **1.98:1** | 4.5:1 |
| `index.html` | `domain-datascience` | `hub:domain-datascience` | `light` | `.snap-pager .snap-dot:not(.active) .dot-text` | 11.0px | `#475569` | `#49413f` | **1.31:1** | 4.5:1 |
| `index.html` | `domain-datascience` | `hub:domain-datascience` | `light` | `.eyebrow` | 12.0px | `#b45309` | `#a19999` | **1.80:1** | 4.5:1 |
| `index.html` | `domain-datascience` | `hub:domain-datascience` | `light` | `.lead, .snap-lead` | 19.0px | `#475569` | `#b9a99f` | **3.33:1** | 4.5:1 |
| `index.html` | `domain-datascience` | `hub:domain-datascience` | `light` | `.snap-cta-btn` | 13.0px | `#b45309` | `#c6bbb7` | **2.68:1** | 4.5:1 |
| `index.html` | `domain-datascience` | `hub:domain-datascience` | `light` | `.snap-count` | 12.0px | `#475569` | `#b7b3b6` | **3.66:1** | 4.5:1 |
| `index.html` | `domain-datascience` | `hub:domain-datascience` | `light` | `.sim-tag` | 11.0px | `#475569` | `#504846` | **1.18:1** | 4.5:1 |
| `index.html` | `domain-quant` | `hub:domain-quant` | `light` | `.nav .brand b` | 14.0px | `#059669` | `#fafafb` | **3.61:1** | 4.5:1 |
| `index.html` | `domain-quant` | `hub:domain-quant` | `light` | `.nav .nav-contact-link` | 12.0px | `#059669` | `#75bfa9` | **1.76:1** | 4.5:1 |
| `index.html` | `domain-quant` | `hub:domain-quant` | `light` | `.snap-pager .snap-dot.active .dot-text` | 11.0px | `#059669` | `#4d5a5b` | **1.90:1** | 4.5:1 |
| `index.html` | `domain-quant` | `hub:domain-quant` | `light` | `.snap-pager .snap-dot:not(.active) .dot-text` | 11.0px | `#475569` | `#36484a` | **1.27:1** | 4.5:1 |
| `index.html` | `domain-quant` | `hub:domain-quant` | `light` | `.eyebrow` | 12.0px | `#059669` | `#97a9a3` | **1.53:1** | 4.5:1 |
| `index.html` | `domain-quant` | `hub:domain-quant` | `light` | `.snap-cta-btn` | 13.0px | `#059669` | `#a7bcba` | **1.89:1** | 4.5:1 |
| `index.html` | `domain-quant` | `hub:domain-quant` | `light` | `.snap-count` | 12.0px | `#475569` | `#a5b1b4` | **3.45:1** | 4.5:1 |
| `index.html` | `domain-quant` | `hub:domain-quant` | `light` | `.sim-tag` | 11.0px | `#475569` | `#3e4d4f` | **1.16:1** | 4.5:1 |
| `index.html` | `domain-cs` | `hub:domain-cs` | `light` | `.nav .nav-contact-link` | 12.0px | `#6d28d9` | `#b28eec` | **2.70:1** | 4.5:1 |
| `index.html` | `domain-cs` | `hub:domain-cs` | `light` | `.snap-pager .snap-dot.active .dot-text` | 11.0px | `#6d28d9` | `#8f5ae3` | **1.60:1** | 4.5:1 |
| `index.html` | `domain-cs` | `hub:domain-cs` | `light` | `.snap-pager .snap-dot:not(.active) .dot-text` | 11.0px | `#475569` | `#8f5be3` | **1.72:1** | 4.5:1 |
| `index.html` | `domain-cs` | `hub:domain-cs` | `light` | `.eyebrow` | 12.0px | `#6d28d9` | `#c6afef` | **3.65:1** | 4.5:1 |
| `index.html` | `domain-cs` | `hub:domain-cs` | `light` | `.lead, .snap-lead` | 19.0px | `#475569` | `#c0a3ee` | **3.51:1** | 4.5:1 |
| `index.html` | `domain-cs` | `hub:domain-cs` | `light` | `.snap-cta-btn` | 13.0px | `#6d28d9` | `#b99bec` | **3.03:1** | 4.5:1 |
| `index.html` | `domain-cs` | `hub:domain-cs` | `light` | `.snap-count` | 12.0px | `#475569` | `#cab4f0` | **4.08:1** | 4.5:1 |
| `index.html` | `domain-cs` | `hub:domain-cs` | `light` | `.sim-tag` | 11.0px | `#475569` | `#9463e3` | **1.86:1** | 4.5:1 |
| `index.html` | `section-papers` | `hub:papers` | `light` | `.nav .brand b` | 14.0px | `#65a30d` | `#fefeff` | **3.06:1** | 4.5:1 |
| `index.html` | `section-papers` | `hub:papers` | `light` | `.nav .nav-contact-link` | 12.0px | `#65a30d` | `#b1d185` | **1.81:1** | 4.5:1 |
| `index.html` | `section-papers` | `hub:papers` | `light` | `.snap-pager .snap-dot.active .dot-text` | 11.0px | `#65a30d` | `#e1e2e4` | **2.38:1** | 4.5:1 |
| `index.html` | `section-papers` | `hub:papers` | `light` | `.eyebrow` | 12.0px | `#65a30d` | `#eaefe8` | **2.65:1** | 4.5:1 |
| `index.html` | `section-papers` | `hub:papers` | `light` | `.snap-cta-btn` | 13.0px | `#65a30d` | `#e2ecdc` | **2.54:1** | 4.5:1 |
| `index.html` | `section-courses` | `hub:courses` | `light` | `.nav .nav-contact-link` | 12.0px | `#b42854` | `#de8bae` | **2.49:1** | 4.5:1 |
| `index.html` | `section-courses` | `hub:courses` | `light` | `.snap-pager .snap-dot.active .dot-text` | 11.0px | `#be2565` | `#e1e1e4` | **4.42:1** | 4.5:1 |
| `index.html` | `section-courses` | `hub:courses` | `light` | `.snap-cta-btn` | 13.0px | `#be185d` | `#da8aad` | **2.36:1** | 4.5:1 |
| `index.html` | `about-contact` | `hub:contact` | `light` | `.nav .brand b` | 14.0px | `#0d9488` | `#fefeff` | **3.71:1** | 4.5:1 |
| `index.html` | `about-contact` | `hub:contact` | `light` | `.nav .nav-contact-link` | 12.0px | `#218683` | `#84c9c3` | **2.32:1** | 4.5:1 |
| `index.html` | `about-contact` | `hub:contact` | `light` | `.snap-pager .snap-dot.active .dot-text` | 11.0px | `#1d9a8f` | `#e0e2e4` | **2.66:1** | 4.5:1 |
| `index.html` | `about-contact` | `hub:contact` | `light` | `.section-head .idx` | 12.0px | `#0d9488` | `#f5f6fb` | **3.47:1** | 4.5:1 |
| `index.html` | `about-contact` | `hub:contact` | `light` | `.pill:not(.snap-cta-btn)` | 12.0px | `#0d9488` | `#f6fbfa` | **3.58:1** | 4.5:1 |
| `index.html` | `about-contact` | `hub:contact` | `light` | `.contact-status` | 12.0px | `#0d9488` | `#e7f4f3` | **3.32:1** | 4.5:1 |
| `math.html` | `domain-intro` | `domain:math:0` | `dark` | `.nav .brand b` | 14.0px | `#e02840` | `#0d0e15` | **4.17:1** | 4.5:1 |
| `math.html` | `domain-intro` | `domain:math:0` | `dark` | `.nav .nav-contact-link` | 12.0px | `#e02840` | `#1b131c` | **3.93:1** | 4.5:1 |
| `math.html` | `domain-intro` | `domain:math:0` | `dark` | `.snap-pager .snap-dot.active .dot-text` | 11.0px | `#e02840` | `#11121b` | **4.04:1** | 4.5:1 |
| `math.html` | `domain-intro` | `domain:math:0` | `dark` | `.eyebrow` | 12.0px | `#e02840` | `#0a0a0f` | **4.28:1** | 4.5:1 |
| `math.html` | `domain-intro` | `domain:math:0` | `dark` | `h1 (gradient stop 2 rgba(--a,0.85))` | 112.0px | `#c82b40` | `#413f43` | **1.92:1** | 3.0:1 |
| `math.html` | `domain-intro` | `domain:math:0` | `dark` | `.pill:not(.snap-cta-btn)` | 12.0px | `#e02840` | `#0b0b10` | **4.25:1** | 4.5:1 |
| `math.html` | `proj-mobius-surfaces` | `domain:math:1` | `dark` | `.nav .brand b` | 14.0px | `#e02840` | `#0d0e15` | **4.17:1** | 4.5:1 |
| `math.html` | `proj-mobius-surfaces` | `domain:math:1` | `dark` | `.nav .nav-contact-link` | 12.0px | `#e02840` | `#1c131c` | **3.92:1** | 4.5:1 |
| `math.html` | `proj-mobius-surfaces` | `domain:math:1` | `dark` | `.snap-pager .snap-dot.active .dot-text` | 11.0px | `#e02840` | `#11121b` | **4.04:1** | 4.5:1 |
| `math.html` | `proj-mobius-surfaces` | `domain:math:1` | `dark` | `.eyebrow` | 12.0px | `#e02840` | `#0a0a0e` | **4.28:1** | 4.5:1 |
| `math.html` | `proj-mobius-surfaces` | `domain:math:1` | `dark` | `.snap-cta-btn` | 13.0px | `#e02840` | `#1d0d14` | **4.06:1** | 4.5:1 |
| `math.html` | `proj-fourier-spectral` | `domain:math:2` | `dark` | `.nav .brand b` | 14.0px | `#e02840` | `#0d0e15` | **4.17:1** | 4.5:1 |
| `math.html` | `proj-fourier-spectral` | `domain:math:2` | `dark` | `.nav .nav-contact-link` | 12.0px | `#e02840` | `#1b131c` | **3.93:1** | 4.5:1 |
| `math.html` | `proj-fourier-spectral` | `domain:math:2` | `dark` | `.snap-pager .snap-dot.active .dot-text` | 11.0px | `#e02840` | `#15151d` | **3.93:1** | 4.5:1 |
| `math.html` | `proj-fourier-spectral` | `domain:math:2` | `dark` | `.eyebrow` | 12.0px | `#e02840` | `#0a0a0f` | **4.28:1** | 4.5:1 |
| `math.html` | `proj-fourier-spectral` | `domain:math:2` | `dark` | `.snap-cta-btn` | 13.0px | `#e02840` | `#1d0d13` | **4.06:1** | 4.5:1 |
| `math.html` | `domain-explore` | `domain:math:3` | `dark` | `.nav .nav-contact-link` | 12.0px | `#14b8a6` | `#106760` | **2.69:1** | 4.5:1 |
| `math.html` | `domain-intro` | `domain:math:0` | `light` | `.nav .nav-contact-link` | 12.0px | `#be123c` | `#d37d93` | **2.13:1** | 4.5:1 |
| `math.html` | `domain-intro` | `domain:math:0` | `light` | `.snap-pager .snap-dot.active .dot-text` | 11.0px | `#be123c` | `#4c3945` | **1.69:1** | 4.5:1 |
| `math.html` | `domain-intro` | `domain:math:0` | `light` | `.snap-pager .snap-dot:not(.active) .dot-text` | 11.0px | `#475569` | `#665760` | **1.12:1** | 4.5:1 |
| `math.html` | `domain-intro` | `domain:math:0` | `light` | `.eyebrow` | 12.0px | `#be123c` | `#a18694` | **1.90:1** | 4.5:1 |
| `math.html` | `domain-intro` | `domain:math:0` | `light` | `h1 (gradient stop 2 rgba(--a,0.85))` | 112.0px | `#ba2349` | `#a18592` | **1.84:1** | 3.0:1 |
| `math.html` | `domain-intro` | `domain:math:0` | `light` | `.pill:not(.snap-cta-btn)` | 12.0px | `#be123c` | `#c6b3be` | **3.17:1** | 4.5:1 |
| `math.html` | `domain-intro` | `domain:math:0` | `light` | `.sim-tag` | 11.0px | `#475569` | `#4e414c` | **1.27:1** | 4.5:1 |
| `math.html` | `proj-mobius-surfaces` | `domain:math:1` | `light` | `.nav .nav-contact-link` | 12.0px | `#be123c` | `#d37d93` | **2.13:1** | 4.5:1 |
| `math.html` | `proj-mobius-surfaces` | `domain:math:1` | `light` | `.snap-pager .snap-dot.active .dot-text` | 11.0px | `#be1941` | `#d8d8db` | **4.34:1** | 4.5:1 |
| `math.html` | `proj-mobius-surfaces` | `domain:math:1` | `light` | `.snap-pager .snap-dot:not(.active) .dot-text` | 11.0px | `#485368` | `#4b3945` | **1.38:1** | 4.5:1 |
| `math.html` | `proj-mobius-surfaces` | `domain:math:1` | `light` | `.eyebrow` | 12.0px | `#be123c` | `#a3858b` | **1.88:1** | 4.5:1 |
| `math.html` | `proj-mobius-surfaces` | `domain:math:1` | `light` | `.lead, .snap-lead` | 19.0px | `#475569` | `#a4959e` | **2.66:1** | 4.5:1 |
| `math.html` | `proj-mobius-surfaces` | `domain:math:1` | `light` | `.tag-status` | 10.0px | `#475569` | `#b89fac` | **3.10:1** | 4.5:1 |
| `math.html` | `proj-mobius-surfaces` | `domain:math:1` | `light` | `.snap-cta-btn` | 13.0px | `#be123c` | `#c1b0b9` | **3.05:1** | 4.5:1 |
| `math.html` | `proj-mobius-surfaces` | `domain:math:1` | `light` | `.snap-count` | 12.0px | `#475569` | `#b8aeb6` | **3.52:1** | 4.5:1 |
| `math.html` | `proj-mobius-surfaces` | `domain:math:1` | `light` | `.sim-tag` | 11.0px | `#475569` | `#4f414c` | **1.26:1** | 4.5:1 |
| `math.html` | `proj-mobius-surfaces` | `domain:math:1` | `light` | `.snap-cue` | 11.0px | `#475569` | `#bebcc1` | **4.02:1** | 4.5:1 |
| `math.html` | `proj-fourier-spectral` | `domain:math:2` | `light` | `.nav .nav-contact-link` | 12.0px | `#be123c` | `#d37d93` | **2.13:1** | 4.5:1 |
| `math.html` | `proj-fourier-spectral` | `domain:math:2` | `light` | `.snap-pager .snap-dot:not(.active) .dot-text` | 11.0px | `#475569` | `#786260` | **1.34:1** | 4.5:1 |
| `math.html` | `proj-fourier-spectral` | `domain:math:2` | `light` | `.eyebrow` | 12.0px | `#be123c` | `#8a7882` | **1.52:1** | 4.5:1 |
| `math.html` | `proj-fourier-spectral` | `domain:math:2` | `light` | `.lead, .snap-lead` | 19.0px | `#475569` | `#a09098` | **2.50:1** | 4.5:1 |
| `math.html` | `proj-fourier-spectral` | `domain:math:2` | `light` | `.tag-status` | 10.0px | `#475569` | `#a7a1a9` | **3.00:1** | 4.5:1 |
| `math.html` | `proj-fourier-spectral` | `domain:math:2` | `light` | `.snap-cta-btn` | 13.0px | `#be123c` | `#c1aeb7` | **2.99:1** | 4.5:1 |
| `math.html` | `proj-fourier-spectral` | `domain:math:2` | `light` | `.snap-count` | 12.0px | `#475569` | `#b3abb3` | **3.39:1** | 4.5:1 |
| `math.html` | `proj-fourier-spectral` | `domain:math:2` | `light` | `.sim-tag` | 11.0px | `#475569` | `#876471` | **1.48:1** | 4.5:1 |
| `math.html` | `domain-explore` | `domain:math:3` | `light` | `.nav .brand b` | 14.0px | `#0d9488` | `#fefeff` | **3.71:1** | 4.5:1 |
| `math.html` | `domain-explore` | `domain:math:3` | `light` | `.nav .nav-contact-link` | 12.0px | `#0f9387` | `#84c9c3` | **2.01:1** | 4.5:1 |
| `math.html` | `domain-explore` | `domain:math:3` | `light` | `.snap-pager .snap-dot.active .dot-text` | 11.0px | `#0d9488` | `#e0e2e4` | **2.88:1** | 4.5:1 |
| `math.html` | `domain-explore` | `domain:math:3` | `light` | `.section-head .idx` | 12.0px | `#0d9488` | `#f5f6fb` | **3.47:1** | 4.5:1 |
| `math.html` | `domain-explore` | `domain:math:3` | `light` | `.pill:not(.snap-cta-btn)` | 12.0px | `#0284c7` | `#9acce7` | **2.37:1** | 4.5:1 |
| `math.html` | `domain-explore` | `domain:math:3` | `light` | `.contact-status` | 12.0px | `#0d9488` | `#e7f4f3` | **3.32:1** | 4.5:1 |
| `physics.html` | `domain-intro` | `domain:physics:0` | `dark` | `.nav .nav-contact-link` | 12.0px | `#22d3ee` | `#166d7d` | **3.30:1** | 4.5:1 |
| `physics.html` | `domain-intro` | `domain:physics:0` | `dark` | `.eyebrow` | 12.0px | `#22d3ee` | `#735e4b` | **3.39:1** | 4.5:1 |
| `physics.html` | `domain-intro` | `domain:physics:0` | `dark` | `h1 (gradient stop 1 --fg)` | 112.0px | `#e9ebf1` | `#e5e5e4` | **1.06:1** | 3.0:1 |
| `physics.html` | `domain-intro` | `domain:physics:0` | `dark` | `h1 (gradient stop 2 rgba(--a,0.85))` | 112.0px | `#3fd6ed` | `#e5e5e4` | **1.38:1** | 3.0:1 |
| `physics.html` | `domain-intro` | `domain:physics:0` | `dark` | `.lead, .snap-lead` | 16.0px | `#e9ebf1` | `#ecebeb` | **1.00:1** | 4.5:1 |
| `physics.html` | `proj-nbody-leapfrog` | `domain:physics:1` | `dark` | `.nav .nav-contact-link` | 12.0px | `#22d3ee` | `#1a7688` | **2.91:1** | 4.5:1 |
| `physics.html` | `proj-nbody-leapfrog` | `domain:physics:1` | `dark` | `.eyebrow` | 12.0px | `#22d3ee` | `#6c8589` | **2.17:1** | 4.5:1 |
| `physics.html` | `proj-nbody-leapfrog` | `domain:physics:1` | `dark` | `.tag-status` | 10.0px | `#8a90a2` | `#243b41` | **3.71:1** | 4.5:1 |
| `physics.html` | `proj-split-step-schrodinger` | `domain:physics:2` | `dark` | `.nav .nav-contact-link` | 12.0px | `#22d3ee` | `#167182` | **3.12:1** | 4.5:1 |
| `physics.html` | `domain-explore` | `domain:physics:3` | `dark` | `.nav .nav-contact-link` | 12.0px | `#14b8a6` | `#136863` | **2.65:1** | 4.5:1 |
| `physics.html` | `domain-explore` | `domain:physics:3` | `dark` | `.pill:not(.snap-cta-btn)` | 12.0px | `#e02840` | `#0b0f14` | **4.16:1** | 4.5:1 |
| `physics.html` | `domain-intro` | `domain:physics:0` | `light` | `.nav .brand b` | 14.0px | `#0284c7` | `#d9d9d9` | **2.90:1** | 4.5:1 |
| `physics.html` | `domain-intro` | `domain:physics:0` | `light` | `.nav .nav-contact-link` | 12.0px | `#0284c7` | `#6fafd1` | **1.70:1** | 4.5:1 |
| `physics.html` | `domain-intro` | `domain:physics:0` | `light` | `.snap-pager .snap-dot:not(.active) .dot-text` | 11.0px | `#475569` | `#202021` | **2.15:1** | 4.5:1 |
| `physics.html` | `domain-intro` | `domain:physics:0` | `light` | `h1 (gradient stop 1 --fg)` | 112.0px | `#0f172a` | `#000000` | **1.18:1** | 3.0:1 |
| `physics.html` | `domain-intro` | `domain:physics:0` | `light` | `.lead, .snap-lead` | 16.0px | `#0f172a` | `#000000` | **1.18:1** | 4.5:1 |
| `physics.html` | `domain-intro` | `domain:physics:0` | `light` | `.snap-proj-label, .snap-jump-label` | 11.0px | `#475569` | `#000000` | **2.77:1** | 4.5:1 |
| `physics.html` | `domain-intro` | `domain:physics:0` | `light` | `.sim-tag` | 11.0px | `#475569` | `#000000` | **2.77:1** | 4.5:1 |
| `physics.html` | `domain-intro` | `domain:physics:0` | `light` | `.snap-cue` | 11.0px | `#475569` | `#000000` | **2.77:1** | 4.5:1 |
| `physics.html` | `proj-nbody-leapfrog` | `domain:physics:1` | `light` | `.nav .brand b` | 14.0px | `#0284c7` | `#fafafb` | **3.93:1** | 4.5:1 |
| `physics.html` | `proj-nbody-leapfrog` | `domain:physics:1` | `light` | `.nav .nav-contact-link` | 12.0px | `#0284c7` | `#74b6d9` | **1.84:1** | 4.5:1 |
| `physics.html` | `proj-nbody-leapfrog` | `domain:physics:1` | `light` | `.snap-pager .snap-dot.active .dot-text` | 11.0px | `#0284c7` | `#687f8d` | **1.02:1** | 4.5:1 |
| `physics.html` | `proj-nbody-leapfrog` | `domain:physics:1` | `light` | `.snap-pager .snap-dot:not(.active) .dot-text` | 11.0px | `#475569` | `#384959` | **1.22:1** | 4.5:1 |
| `physics.html` | `proj-nbody-leapfrog` | `domain:physics:1` | `light` | `.eyebrow` | 12.0px | `#0284c7` | `#8fa0ac` | **1.52:1** | 4.5:1 |
| `physics.html` | `proj-nbody-leapfrog` | `domain:physics:1` | `light` | `.lead, .snap-lead` | 19.0px | `#475569` | `#9bb0be` | **3.37:1** | 4.5:1 |
| `physics.html` | `proj-nbody-leapfrog` | `domain:physics:1` | `light` | `.tag-status` | 10.0px | `#475569` | `#aabcc7` | **3.87:1** | 4.5:1 |
| `physics.html` | `proj-nbody-leapfrog` | `domain:physics:1` | `light` | `.snap-cta-btn` | 13.0px | `#0284c7` | `#afbdc9` | **2.13:1** | 4.5:1 |
| `physics.html` | `proj-nbody-leapfrog` | `domain:physics:1` | `light` | `.snap-count` | 12.0px | `#475569` | `#b2bac1` | **3.86:1** | 4.5:1 |
| `physics.html` | `proj-nbody-leapfrog` | `domain:physics:1` | `light` | `.sim-tag` | 11.0px | `#475569` | `#41505c` | **1.10:1** | 4.5:1 |
| `physics.html` | `proj-nbody-leapfrog` | `domain:physics:1` | `light` | `.snap-cue` | 11.0px | `#475569` | `#c0c1c7` | **4.22:1** | 4.5:1 |
| `physics.html` | `proj-split-step-schrodinger` | `domain:physics:2` | `light` | `.nav .brand b` | 14.0px | `#0284c7` | `#fafafb` | **3.93:1** | 4.5:1 |
| `physics.html` | `proj-split-step-schrodinger` | `domain:physics:2` | `light` | `.nav .nav-contact-link` | 12.0px | `#0284c7` | `#73b4d7` | **1.80:1** | 4.5:1 |
| `physics.html` | `proj-split-step-schrodinger` | `domain:physics:2` | `light` | `.snap-pager .snap-dot.active .dot-text` | 11.0px | `#0284c7` | `#d6d8db` | **2.87:1** | 4.5:1 |
| `physics.html` | `proj-split-step-schrodinger` | `domain:physics:2` | `light` | `.snap-pager .snap-dot:not(.active) .dot-text` | 11.0px | `#475569` | `#243138` | **1.76:1** | 4.5:1 |
| `physics.html` | `proj-split-step-schrodinger` | `domain:physics:2` | `light` | `.eyebrow` | 12.0px | `#0284c7` | `#6a7880` | **1.11:1** | 4.5:1 |
| `physics.html` | `proj-split-step-schrodinger` | `domain:physics:2` | `light` | `.lead, .snap-lead` | 19.0px | `#475569` | `#93a2ac` | **2.89:1** | 4.5:1 |
| `physics.html` | `proj-split-step-schrodinger` | `domain:physics:2` | `light` | `.tag-status` | 10.0px | `#475569` | `#8c949c` | **2.46:1** | 4.5:1 |
| `physics.html` | `proj-split-step-schrodinger` | `domain:physics:2` | `light` | `.snap-cta-btn` | 13.0px | `#0284c7` | `#a5b5bf` | **1.94:1** | 4.5:1 |
| `physics.html` | `proj-split-step-schrodinger` | `domain:physics:2` | `light` | `.snap-count` | 12.0px | `#475569` | `#a4aab0` | **3.23:1** | 4.5:1 |
| `physics.html` | `proj-split-step-schrodinger` | `domain:physics:2` | `light` | `.sim-tag` | 11.0px | `#475569` | `#2e363b` | **1.62:1** | 4.5:1 |
| `physics.html` | `proj-split-step-schrodinger` | `domain:physics:2` | `light` | `.snap-cue` | 11.0px | `#475569` | `#c3c3c7` | **4.31:1** | 4.5:1 |
| `physics.html` | `domain-explore` | `domain:physics:3` | `light` | `.nav .brand b` | 14.0px | `#0d9488` | `#f3f4f4` | **3.40:1** | 4.5:1 |
| `physics.html` | `domain-explore` | `domain:physics:3` | `light` | `.nav .nav-contact-link` | 12.0px | `#088da3` | `#77bbb6` | **1.79:1** | 4.5:1 |
| `physics.html` | `domain-explore` | `domain:physics:3` | `light` | `.snap-pager .snap-dot.active .dot-text` | 11.0px | `#475569` | `#1f3237` | **1.77:1** | 4.5:1 |
| `physics.html` | `domain-explore` | `domain:physics:3` | `light` | `.snap-pager .snap-dot:not(.active) .dot-text` | 11.0px | `#475569` | `#1e3137` | **1.79:1** | 4.5:1 |
| `physics.html` | `domain-explore` | `domain:physics:3` | `light` | `.section-head .idx` | 12.0px | `#0d9488` | `#aaadb2` | **1.66:1** | 4.5:1 |
| `physics.html` | `domain-explore` | `domain:physics:3` | `light` | `.lead, .snap-lead` | 16.0px | `#0f172a` | `#4b5c61` | **2.55:1** | 4.5:1 |
| `physics.html` | `domain-explore` | `domain:physics:3` | `light` | `.pill:not(.snap-cta-btn)` | 12.0px | `#be123c` | `#b16e82` | **1.62:1** | 4.5:1 |
| `physics.html` | `domain-explore` | `domain:physics:3` | `light` | `.contact-status` | 12.0px | `#0d9488` | `#dce9e9` | **3.01:1** | 4.5:1 |
| `physics.html` | `domain-explore` | `domain:physics:3` | `light` | `.foot` | 12.0px | `#475569` | `#28383c` | **1.61:1** | 4.5:1 |
| `datascience.html` | `domain-intro` | `domain:datascience:0` | `dark` | `.nav .nav-contact-link` | 12.0px | `#f59e0b` | `#885b12` | **2.75:1** | 4.5:1 |
| `datascience.html` | `domain-intro` | `domain:datascience:0` | `dark` | `.pill:not(.snap-cta-btn)` | 12.0px | `#f59e0b` | `#755014` | **3.36:1** | 4.5:1 |
| `datascience.html` | `proj-regularised-regression` | `domain:datascience:1` | `dark` | `.nav .nav-contact-link` | 12.0px | `#f59e0b` | `#885b13` | **2.75:1** | 4.5:1 |
| `datascience.html` | `proj-spectral-clustering` | `domain:datascience:2` | `dark` | `.nav .nav-contact-link` | 12.0px | `#f59e0b` | `#875a12` | **2.79:1** | 4.5:1 |
| `datascience.html` | `domain-explore` | `domain:datascience:3` | `dark` | `.nav .nav-contact-link` | 12.0px | `#14b8a6` | `#106760` | **2.69:1** | 4.5:1 |
| `datascience.html` | `domain-explore` | `domain:datascience:3` | `dark` | `.pill:not(.snap-cta-btn)` | 12.0px | `#e02840` | `#06080b` | **4.34:1** | 4.5:1 |
| `datascience.html` | `domain-intro` | `domain:datascience:0` | `light` | `.nav .nav-contact-link` | 12.0px | `#b45309` | `#ce9d79` | **2.09:1** | 4.5:1 |
| `datascience.html` | `domain-intro` | `domain:datascience:0` | `light` | `.snap-pager .snap-dot.active .dot-text` | 11.0px | `#b45309` | `#4a413f` | **1.97:1** | 4.5:1 |
| `datascience.html` | `domain-intro` | `domain:datascience:0` | `light` | `.snap-pager .snap-dot:not(.active) .dot-text` | 11.0px | `#475569` | `#6a605e` | **1.24:1** | 4.5:1 |
| `datascience.html` | `domain-intro` | `domain:datascience:0` | `light` | `.eyebrow` | 12.0px | `#b45309` | `#9e8e88` | **1.60:1** | 4.5:1 |
| `datascience.html` | `domain-intro` | `domain:datascience:0` | `light` | `h1 (gradient stop 2 rgba(--a,0.85))` | 112.0px | `#b35e1d` | `#ae9a8e` | **1.72:1** | 3.0:1 |
| `datascience.html` | `domain-intro` | `domain:datascience:0` | `light` | `.pill:not(.snap-cta-btn)` | 12.0px | `#b45309` | `#c49a7d` | **1.98:1** | 4.5:1 |
| `datascience.html` | `domain-intro` | `domain:datascience:0` | `light` | `.sim-tag` | 11.0px | `#475569` | `#4e4848` | **1.18:1** | 4.5:1 |
| `datascience.html` | `proj-regularised-regression` | `domain:datascience:1` | `light` | `.nav .nav-contact-link` | 12.0px | `#b45309` | `#cf9e79` | **2.11:1** | 4.5:1 |
| `datascience.html` | `proj-regularised-regression` | `domain:datascience:1` | `light` | `.snap-pager .snap-dot.active .dot-text` | 11.0px | `#b4540b` | `#d9dadc` | **3.56:1** | 4.5:1 |
| `datascience.html` | `proj-regularised-regression` | `domain:datascience:1` | `light` | `.snap-pager .snap-dot:not(.active) .dot-text` | 11.0px | `#475569` | `#514b4d` | **1.12:1** | 4.5:1 |
| `datascience.html` | `proj-regularised-regression` | `domain:datascience:1` | `light` | `.eyebrow` | 12.0px | `#b45309` | `#8d8584` | **1.39:1** | 4.5:1 |
| `datascience.html` | `proj-regularised-regression` | `domain:datascience:1` | `light` | `.lead, .snap-lead` | 19.0px | `#475569` | `#aba5a5` | **3.12:1** | 4.5:1 |
| `datascience.html` | `proj-regularised-regression` | `domain:datascience:1` | `light` | `.tag-status` | 10.0px | `#475569` | `#abaaaf` | **3.28:1** | 4.5:1 |
| `datascience.html` | `proj-regularised-regression` | `domain:datascience:1` | `light` | `.snap-cta-btn` | 13.0px | `#b45309` | `#c3bab8` | **2.64:1** | 4.5:1 |
| `datascience.html` | `proj-regularised-regression` | `domain:datascience:1` | `light` | `.snap-count` | 12.0px | `#475569` | `#bbb8bd` | **3.86:1** | 4.5:1 |
| `datascience.html` | `proj-regularised-regression` | `domain:datascience:1` | `light` | `.sim-tag` | 11.0px | `#475569` | `#605f69` | **1.20:1** | 4.5:1 |
| `datascience.html` | `proj-spectral-clustering` | `domain:datascience:2` | `light` | `.nav .nav-contact-link` | 12.0px | `#b45309` | `#ce9d79` | **2.09:1** | 4.5:1 |
| `datascience.html` | `proj-spectral-clustering` | `domain:datascience:2` | `light` | `.snap-pager .snap-dot.active .dot-text` | 11.0px | `#b5550c` | `#d8d9da` | **3.48:1** | 4.5:1 |
| `datascience.html` | `proj-spectral-clustering` | `domain:datascience:2` | `light` | `.snap-pager .snap-dot:not(.active) .dot-text` | 11.0px | `#475569` | `#4a413e` | **1.31:1** | 4.5:1 |
| `datascience.html` | `proj-spectral-clustering` | `domain:datascience:2` | `light` | `.eyebrow` | 12.0px | `#b45309` | `#887f7b` | **1.28:1** | 4.5:1 |
| `datascience.html` | `proj-spectral-clustering` | `domain:datascience:2` | `light` | `.lead, .snap-lead` | 19.0px | `#475569` | `#b4b1b1` | **3.56:1** | 4.5:1 |
| `datascience.html` | `proj-spectral-clustering` | `domain:datascience:2` | `light` | `.tag-status` | 10.0px | `#475569` | `#a29da0` | **2.84:1** | 4.5:1 |
| `datascience.html` | `proj-spectral-clustering` | `domain:datascience:2` | `light` | `.snap-cta-btn` | 13.0px | `#b45309` | `#c0b5b0` | **2.51:1** | 4.5:1 |
| `datascience.html` | `proj-spectral-clustering` | `domain:datascience:2` | `light` | `.snap-count` | 12.0px | `#475569` | `#b2afb1` | **3.49:1** | 4.5:1 |
| `datascience.html` | `proj-spectral-clustering` | `domain:datascience:2` | `light` | `.sim-tag` | 11.0px | `#475569` | `#4c4646` | **1.22:1** | 4.5:1 |
| `datascience.html` | `domain-explore` | `domain:datascience:3` | `light` | `.nav .brand b` | 14.0px | `#0d9488` | `#fefeff` | **3.71:1** | 4.5:1 |
| `datascience.html` | `domain-explore` | `domain:datascience:3` | `light` | `.nav .nav-contact-link` | 12.0px | `#1a8f7e` | `#84c9c3` | **2.11:1** | 4.5:1 |
| `datascience.html` | `domain-explore` | `domain:datascience:3` | `light` | `.snap-pager .snap-dot.active .dot-text` | 11.0px | `#15978c` | `#e0e2e4` | **2.77:1** | 4.5:1 |
| `datascience.html` | `domain-explore` | `domain:datascience:3` | `light` | `.section-head .idx` | 12.0px | `#0d9488` | `#f5f6fb` | **3.47:1** | 4.5:1 |
| `datascience.html` | `domain-explore` | `domain:datascience:3` | `light` | `.pill:not(.snap-cta-btn)` | 12.0px | `#be123c` | `#e09baf` | **2.84:1** | 4.5:1 |
| `datascience.html` | `domain-explore` | `domain:datascience:3` | `light` | `.contact-status` | 12.0px | `#0d9488` | `#e7f4f3` | **3.32:1** | 4.5:1 |
| `quant.html` | `domain-intro` | `domain:quant:0` | `dark` | `.nav .nav-contact-link` | 12.0px | `#10b981` | `#10694f` | **2.62:1** | 4.5:1 |
| `quant.html` | `domain-intro` | `domain:quant:0` | `dark` | `.snap-pager .snap-dot.active .dot-text` | 11.0px | `#10b981` | `#515551` | **2.99:1** | 4.5:1 |
| `quant.html` | `domain-intro` | `domain:quant:0` | `dark` | `.eyebrow` | 12.0px | `#10b981` | `#4d6053` | **2.66:1** | 4.5:1 |
| `quant.html` | `domain-intro` | `domain:quant:0` | `dark` | `h1 (gradient stop 2 rgba(--a,0.85))` | 112.0px | `#1bad7d` | `#5b6b64` | **1.96:1** | 3.0:1 |
| `quant.html` | `proj-options-pricing` | `domain:quant:1` | `dark` | `.nav .nav-contact-link` | 12.0px | `#10b981` | `#10694f` | **2.62:1** | 4.5:1 |
| `quant.html` | `proj-options-pricing` | `domain:quant:1` | `dark` | `.snap-pager .snap-dot.active .dot-text` | 11.0px | `#10b981` | `#848d89` | **1.35:1** | 4.5:1 |
| `quant.html` | `proj-options-pricing` | `domain:quant:1` | `dark` | `.eyebrow` | 12.0px | `#10b981` | `#405846` | **3.06:1** | 4.5:1 |
| `quant.html` | `proj-stat-arb` | `domain:quant:2` | `dark` | `.nav .nav-contact-link` | 12.0px | `#10b981` | `#0e674d` | **2.70:1** | 4.5:1 |
| `quant.html` | `domain-explore` | `domain:quant:3` | `dark` | `.nav .nav-contact-link` | 12.0px | `#14b8a6` | `#287e6e` | **1.96:1** | 4.5:1 |
| `quant.html` | `domain-explore` | `domain:quant:3` | `dark` | `.snap-pager .snap-dot.active .dot-text` | 11.0px | `#14b8a6` | `#c1d2ba` | **1.56:1** | 4.5:1 |
| `quant.html` | `domain-explore` | `domain:quant:3` | `dark` | `.lead, .snap-lead` | 16.0px | `#e9ebf1` | `#a9bab8` | **1.69:1** | 4.5:1 |
| `quant.html` | `domain-explore` | `domain:quant:3` | `dark` | `.pill:not(.snap-cta-btn)` | 12.0px | `#e02840` | `#0f1216` | **4.07:1** | 4.5:1 |
| `quant.html` | `domain-explore` | `domain:quant:3` | `dark` | `.contact-status` | 12.0px | `#14b8a6` | `#2f4041` | **4.37:1** | 4.5:1 |
| `quant.html` | `domain-intro` | `domain:quant:0` | `light` | `.nav .brand b` | 14.0px | `#059669` | `#fafafb` | **3.61:1** | 4.5:1 |
| `quant.html` | `domain-intro` | `domain:quant:0` | `light` | `.nav .nav-contact-link` | 12.0px | `#059669` | `#75bfa9` | **1.76:1** | 4.5:1 |
| `quant.html` | `domain-intro` | `domain:quant:0` | `light` | `.snap-pager .snap-dot.active .dot-text` | 11.0px | `#059669` | `#505958` | **1.91:1** | 4.5:1 |
| `quant.html` | `domain-intro` | `domain:quant:0` | `light` | `.snap-pager .snap-dot:not(.active) .dot-text` | 11.0px | `#475569` | `#808989` | **2.11:1** | 4.5:1 |
| `quant.html` | `domain-intro` | `domain:quant:0` | `light` | `.eyebrow` | 12.0px | `#059669` | `#a3b6ac` | **1.77:1** | 4.5:1 |
| `quant.html` | `domain-intro` | `domain:quant:0` | `light` | `h1 (gradient stop 2 rgba(--a,0.85))` | 112.0px | `#219e77` | `#c0cec3` | **2.07:1** | 3.0:1 |
| `quant.html` | `domain-intro` | `domain:quant:0` | `light` | `.pill:not(.snap-cta-btn)` | 12.0px | `#059669` | `#babfc2` | **2.03:1** | 4.5:1 |
| `quant.html` | `domain-intro` | `domain:quant:0` | `light` | `.sim-tag` | 11.0px | `#475569` | `#3e4d4f` | **1.16:1** | 4.5:1 |
| `quant.html` | `proj-options-pricing` | `domain:quant:1` | `light` | `.nav .brand b` | 14.0px | `#059669` | `#fafafb` | **3.61:1** | 4.5:1 |
| `quant.html` | `proj-options-pricing` | `domain:quant:1` | `light` | `.nav .nav-contact-link` | 12.0px | `#059669` | `#75bfa9` | **1.76:1** | 4.5:1 |
| `quant.html` | `proj-options-pricing` | `domain:quant:1` | `light` | `.snap-pager .snap-dot.active .dot-text` | 11.0px | `#07976a` | `#d9dbdd` | **2.68:1** | 4.5:1 |
| `quant.html` | `proj-options-pricing` | `domain:quant:1` | `light` | `.snap-pager .snap-dot:not(.active) .dot-text` | 11.0px | `#475569` | `#495556` | **1.02:1** | 4.5:1 |
| `quant.html` | `proj-options-pricing` | `domain:quant:1` | `light` | `.eyebrow` | 12.0px | `#059669` | `#7c8e8e` | **1.10:1** | 4.5:1 |
| `quant.html` | `proj-options-pricing` | `domain:quant:1` | `light` | `.tag-status` | 10.0px | `#475569` | `#8e9a9e` | **2.62:1** | 4.5:1 |
| `quant.html` | `proj-options-pricing` | `domain:quant:1` | `light` | `.snap-cta-btn` | 13.0px | `#059669` | `#aabdbd` | **1.92:1** | 4.5:1 |
| `quant.html` | `proj-options-pricing` | `domain:quant:1` | `light` | `.snap-count` | 12.0px | `#475569` | `#aab4b5` | **3.57:1** | 4.5:1 |
| `quant.html` | `proj-options-pricing` | `domain:quant:1` | `light` | `.sim-tag` | 11.0px | `#475569` | `#3e4d51` | **1.16:1** | 4.5:1 |
| `quant.html` | `proj-options-pricing` | `domain:quant:1` | `light` | `.snap-cue` | 11.0px | `#475569` | `#c1c3c8` | **4.30:1** | 4.5:1 |
| `quant.html` | `proj-stat-arb` | `domain:quant:2` | `light` | `.nav .brand b` | 14.0px | `#059669` | `#fefeff` | **3.74:1** | 4.5:1 |
| `quant.html` | `proj-stat-arb` | `domain:quant:2` | `light` | `.nav .nav-contact-link` | 12.0px | `#059669` | `#80cab4` | **1.98:1** | 4.5:1 |
| `quant.html` | `proj-stat-arb` | `domain:quant:2` | `light` | `.snap-pager .snap-dot.active .dot-text` | 11.0px | `#059669` | `#e0e2e4` | **2.90:1** | 4.5:1 |
| `quant.html` | `proj-stat-arb` | `domain:quant:2` | `light` | `.eyebrow` | 12.0px | `#059669` | `#daebea` | **3.06:1** | 4.5:1 |
| `quant.html` | `proj-stat-arb` | `domain:quant:2` | `light` | `.snap-cta-btn` | 13.0px | `#059669` | `#c5e3dd` | **2.76:1** | 4.5:1 |
| `quant.html` | `domain-explore` | `domain:quant:3` | `light` | `.nav .brand b` | 14.0px | `#0d9488` | `#f3f4f4` | **3.40:1** | 4.5:1 |
| `quant.html` | `domain-explore` | `domain:quant:3` | `light` | `.nav .nav-contact-link` | 12.0px | `#0d9487` | `#7fc4bb` | **1.88:1** | 4.5:1 |
| `quant.html` | `domain-explore` | `domain:quant:3` | `light` | `.snap-pager .snap-dot.active .dot-text` | 11.0px | `#0f9488` | `#b7c49f` | **2.03:1** | 4.5:1 |
| `quant.html` | `domain-explore` | `domain:quant:3` | `light` | `.snap-pager .snap-dot:not(.active) .dot-text` | 11.0px | `#475569` | `#b3c09b` | **3.94:1** | 4.5:1 |
| `quant.html` | `domain-explore` | `domain:quant:3` | `light` | `.section-head .idx` | 12.0px | `#0d9488` | `#aaadb2` | **1.66:1** | 4.5:1 |
| `quant.html` | `domain-explore` | `domain:quant:3` | `light` | `.pill:not(.snap-cta-btn)` | 12.0px | `#be123c` | `#b47d8d` | **1.87:1** | 4.5:1 |
| `quant.html` | `domain-explore` | `domain:quant:3` | `light` | `.contact-status` | 12.0px | `#0d9488` | `#eaeeee` | **3.20:1** | 4.5:1 |
| `quant.html` | `domain-explore` | `domain:quant:3` | `light` | `.sim-tag` | 11.0px | `#475569` | `#35423e` | **1.39:1** | 4.5:1 |
| `quant.html` | `domain-explore` | `domain:quant:3` | `light` | `.foot` | 12.0px | `#475569` | `#45575a` | **1.00:1** | 4.5:1 |
| `cs.html` | `domain-intro` | `domain:cs:0` | `dark` | `.nav .nav-contact-link` | 12.0px | `#8b5cf6` | `#1f1937` | **3.96:1** | 4.5:1 |
| `cs.html` | `domain-intro` | `domain:cs:0` | `dark` | `.snap-pager .snap-dot.active .dot-text` | 11.0px | `#8b5cf6` | `#10121b` | **4.41:1** | 4.5:1 |
| `cs.html` | `domain-intro` | `domain:cs:0` | `dark` | `h1 (gradient stop 2 rgba(--a,0.85))` | 112.0px | `#8156e4` | `#48317e` | **2.17:1** | 3.0:1 |
| `cs.html` | `proj-ku-lang` | `domain:cs:1` | `dark` | `.nav .nav-contact-link` | 12.0px | `#8b5cf6` | `#131222` | **4.36:1** | 4.5:1 |
| `cs.html` | `proj-ku-lang` | `domain:cs:1` | `dark` | `.snap-pager .snap-dot.active .dot-text` | 11.0px | `#8b5cf6` | `#10121b` | **4.41:1** | 4.5:1 |
| `cs.html` | `proj-ku-lang` | `domain:cs:1` | `dark` | `.snap-cta-btn` | 13.0px | `#8b5cf6` | `#161127` | **4.34:1** | 4.5:1 |
| `cs.html` | `proj-8bit-computer` | `domain:cs:2` | `dark` | `.nav .nav-contact-link` | 12.0px | `#8b5cf6` | `#131222` | **4.36:1** | 4.5:1 |
| `cs.html` | `proj-8bit-computer` | `domain:cs:2` | `dark` | `.snap-pager .snap-dot.active .dot-text` | 11.0px | `#8b5cf6` | `#10121b` | **4.41:1** | 4.5:1 |
| `cs.html` | `proj-8bit-computer` | `domain:cs:2` | `dark` | `.snap-cta-btn` | 13.0px | `#8b5cf6` | `#141023` | **4.40:1** | 4.5:1 |
| `cs.html` | `domain-explore` | `domain:cs:3` | `dark` | `.nav .nav-contact-link` | 12.0px | `#14b8a6` | `#0f746b` | **2.26:1** | 4.5:1 |
| `cs.html` | `domain-explore` | `domain:cs:3` | `dark` | `.snap-pager .snap-dot.active .dot-text` | 11.0px | `#14b8a6` | `#139c8d` | **1.37:1** | 4.5:1 |
| `cs.html` | `domain-explore` | `domain:cs:3` | `dark` | `.lead, .snap-lead` | 16.0px | `#e9ebf1` | `#107b70` | **4.31:1** | 4.5:1 |
| `cs.html` | `domain-explore` | `domain:cs:3` | `dark` | `.pill:not(.snap-cta-btn)` | 12.0px | `#e02840` | `#06080c` | **4.34:1** | 4.5:1 |
| `cs.html` | `domain-intro` | `domain:cs:0` | `light` | `.nav .nav-contact-link` | 12.0px | `#6d28d9` | `#b38eec` | **2.71:1** | 4.5:1 |
| `cs.html` | `domain-intro` | `domain:cs:0` | `light` | `.snap-pager .snap-dot.active .dot-text` | 11.0px | `#6d28d9` | `#905de2` | **1.64:1** | 4.5:1 |
| `cs.html` | `domain-intro` | `domain:cs:0` | `light` | `.snap-pager .snap-dot:not(.active) .dot-text` | 11.0px | `#475569` | `#905de3` | **1.75:1** | 4.5:1 |
| `cs.html` | `domain-intro` | `domain:cs:0` | `light` | `.eyebrow` | 12.0px | `#6d28d9` | `#b596eb` | **2.88:1** | 4.5:1 |
| `cs.html` | `domain-intro` | `domain:cs:0` | `light` | `h1 (gradient stop 2 rgba(--a,0.85))` | 112.0px | `#7838dc` | `#b493eb` | **2.45:1** | 3.0:1 |
| `cs.html` | `domain-intro` | `domain:cs:0` | `light` | `.pill:not(.snap-cta-btn)` | 12.0px | `#6d28d9` | `#ba9ceb` | **3.06:1** | 4.5:1 |
| `cs.html` | `domain-intro` | `domain:cs:0` | `light` | `.sim-tag` | 11.0px | `#475569` | `#9362e3` | **1.84:1** | 4.5:1 |
| `cs.html` | `proj-ku-lang` | `domain:cs:1` | `light` | `.nav .nav-contact-link` | 12.0px | `#6d28d9` | `#b593ec` | **2.82:1** | 4.5:1 |
| `cs.html` | `proj-8bit-computer` | `domain:cs:2` | `light` | `.nav .nav-contact-link` | 12.0px | `#6d28d9` | `#b593ec` | **2.82:1** | 4.5:1 |
| `cs.html` | `proj-8bit-computer` | `domain:cs:2` | `light` | `.eyebrow` | 12.0px | `#6d28d9` | `#ba9dec` | **3.09:1** | 4.5:1 |
| `cs.html` | `domain-explore` | `domain:cs:3` | `light` | `.nav .brand b` | 14.0px | `#0d9488` | `#f8fcfc` | **3.62:1** | 4.5:1 |
| `cs.html` | `domain-explore` | `domain:cs:3` | `light` | `.nav .nav-contact-link` | 12.0px | `#0d9488` | `#7ec6c0` | **1.91:1** | 4.5:1 |
| `cs.html` | `domain-explore` | `domain:cs:3` | `light` | `.snap-pager .snap-dot.active .dot-text` | 11.0px | `#0d9488` | `#49aca4` | **1.38:1** | 4.5:1 |
| `cs.html` | `domain-explore` | `domain:cs:3` | `light` | `.snap-pager .snap-dot:not(.active) .dot-text` | 11.0px | `#475569` | `#32a49a` | **2.49:1** | 4.5:1 |
| `cs.html` | `domain-explore` | `domain:cs:3` | `light` | `.section-head .idx` | 12.0px | `#0d9488` | `#b1dad9` | **2.48:1** | 4.5:1 |
| `cs.html` | `domain-explore` | `domain:cs:3` | `light` | `.pill:not(.snap-cta-btn)` | 12.0px | `#be123c` | `#e09baf` | **2.84:1** | 4.5:1 |
| `cs.html` | `domain-explore` | `domain:cs:3` | `light` | `.contact-status` | 12.0px | `#0d9488` | `#e2f2f1` | **3.25:1** | 4.5:1 |
| `cs.html` | `domain-explore` | `domain:cs:3` | `light` | `.sim-tag` | 11.0px | `#475569` | `#36a69c` | **2.56:1** | 4.5:1 |
| `cs.html` | `domain-explore` | `domain:cs:3` | `light` | `.foot` | 12.0px | `#475569` | `#3ea9a1` | **2.67:1** | 4.5:1 |
| `papers.html` | `papers-hero` | `papers-index:hero` | `dark` | `.nav .nav-domain-pill` | 11.0px | `#a3e635` | `#4d6b21` | **4.05:1** | 4.5:1 |
| `papers.html` | `papers-hero` | `papers-index:hero` | `dark` | `.nav .nav-contact-link` | 12.0px | `#a3e635` | `#5b7f24` | **3.09:1** | 4.5:1 |
| `papers.html` | `papers-hero` | `papers-index:hero` | `dark` | `.pill:not(.snap-cta-btn)` | 12.0px | `#a3e635` | `#48641d` | **4.47:1** | 4.5:1 |
| `papers.html` | `paper-langevin-loss-landscapes` | `paper:langevin-loss-landscapes:hero` | `dark` | `.nav .nav-domain-pill` | 11.0px | `#a3e635` | `#4e6d23` | **3.94:1** | 4.5:1 |
| `papers.html` | `paper-langevin-loss-landscapes` | `paper:langevin-loss-landscapes:hero` | `dark` | `.nav .nav-contact-link` | 12.0px | `#a3e635` | `#5d8127` | **3.00:1** | 4.5:1 |
| `papers.html` | `paper-langevin-loss-landscapes` | `paper:langevin-loss-landscapes:hero` | `dark` | `.paper-domain-tag` | 10.0px | `#f59e0b` | `#7a5410` | **3.15:1** | 4.5:1 |
| `papers.html` | `paper-langevin-loss-landscapes` | `paper:langevin-loss-landscapes:hero` | `dark` | `.tag-status` | 10.0px | `#8a90a2` | `#2d3520` | **4.02:1** | 4.5:1 |
| `papers.html` | `paper-hft-stat-arb-microstructure` | `paper:hft-stat-arb-microstructure:hero` | `dark` | `.nav .nav-domain-pill` | 11.0px | `#a3e635` | `#4d6b21` | **4.05:1** | 4.5:1 |
| `papers.html` | `paper-hft-stat-arb-microstructure` | `paper:hft-stat-arb-microstructure:hero` | `dark` | `.nav .nav-contact-link` | 12.0px | `#a3e635` | `#5b7f24` | **3.09:1** | 4.5:1 |
| `papers.html` | `paper-hft-stat-arb-microstructure` | `paper:hft-stat-arb-microstructure:hero` | `dark` | `.paper-domain-tag` | 10.0px | `#10b981` | `#0d5b43` | **3.19:1** | 4.5:1 |
| `papers.html` | `paper-symplectic-energy-bounds-nbody` | `paper:symplectic-energy-bounds-nbody:hero` | `dark` | `.nav .nav-domain-pill` | 11.0px | `#a3e635` | `#4e6c22` | **3.99:1** | 4.5:1 |
| `papers.html` | `paper-symplectic-energy-bounds-nbody` | `paper:symplectic-energy-bounds-nbody:hero` | `dark` | `.nav .nav-contact-link` | 12.0px | `#a3e635` | `#5e8128` | **3.00:1** | 4.5:1 |
| `papers.html` | `paper-symplectic-energy-bounds-nbody` | `paper:symplectic-energy-bounds-nbody:hero` | `dark` | `.paper-domain-tag` | 10.0px | `#22d3ee` | `#156977` | **3.50:1** | 4.5:1 |
| `papers.html` | `paper-verified-ssa-compiler-passes` | `paper:verified-ssa-compiler-passes:hero` | `dark` | `.nav .nav-domain-pill` | 11.0px | `#a3e635` | `#4d6b21` | **4.05:1** | 4.5:1 |
| `papers.html` | `paper-verified-ssa-compiler-passes` | `paper:verified-ssa-compiler-passes:hero` | `dark` | `.nav .nav-contact-link` | 12.0px | `#a3e635` | `#5b7f24` | **3.09:1** | 4.5:1 |
| `papers.html` | `paper-riemannian-immersion-gauss-bonnet` | `paper:riemannian-immersion-gauss-bonnet:hero` | `dark` | `.nav .nav-domain-pill` | 11.0px | `#a3e635` | `#4d6b21` | **4.05:1** | 4.5:1 |
| `papers.html` | `paper-riemannian-immersion-gauss-bonnet` | `paper:riemannian-immersion-gauss-bonnet:hero` | `dark` | `.nav .nav-contact-link` | 12.0px | `#a3e635` | `#5b7f24` | **3.09:1** | 4.5:1 |
| `papers.html` | `paper-riemannian-immersion-gauss-bonnet` | `paper:riemannian-immersion-gauss-bonnet:hero` | `dark` | `.paper-domain-tag` | 10.0px | `#e02840` | `#07080c` | **4.33:1** | 4.5:1 |
| `papers.html` | `papers-contact` | `papers-index:contact` | `dark` | `.nav .nav-domain-pill` | 11.0px | `#a3e635` | `#4d6b21` | **4.05:1** | 4.5:1 |
| `papers.html` | `papers-contact` | `papers-index:contact` | `dark` | `.nav .nav-contact-link` | 12.0px | `#14b8a6` | `#106760` | **2.69:1** | 4.5:1 |
| `papers.html` | `papers-contact` | `papers-index:contact` | `dark` | `.pill:not(.snap-cta-btn)` | 12.0px | `#14b8a6` | `#0c4f49` | **3.78:1** | 4.5:1 |
| `papers.html` | `papers-hero` | `papers-index:hero` | `light` | `.nav .brand b` | 14.0px | `#65a30d` | `#fefeff` | **3.06:1** | 4.5:1 |
| `papers.html` | `papers-hero` | `papers-index:hero` | `light` | `.nav .nav-domain-pill` | 11.0px | `#65a30d` | `#bcd798` | **1.96:1** | 4.5:1 |
| `papers.html` | `papers-hero` | `papers-index:hero` | `light` | `.nav .nav-contact-link` | 12.0px | `#65a30d` | `#b1d185` | **1.81:1** | 4.5:1 |
| `papers.html` | `papers-hero` | `papers-index:hero` | `light` | `.snap-pager .snap-dot.active .dot-text` | 11.0px | `#65a30d` | `#e1e2e4` | **2.38:1** | 4.5:1 |
| `papers.html` | `papers-hero` | `papers-index:hero` | `light` | `.crumbs a` | 12.0px | `#65a30d` | `#f5f6fb` | **2.86:1** | 4.5:1 |
| `papers.html` | `papers-hero` | `papers-index:hero` | `light` | `h1 (gradient stop 2 rgba(--a,0.85))` | 112.0px | `#77ae2b` | `#e0e9d8` | **2.14:1** | 3.0:1 |
| `papers.html` | `papers-hero` | `papers-index:hero` | `light` | `.pill:not(.snap-cta-btn)` | 12.0px | `#65a30d` | `#bad599` | **1.92:1** | 4.5:1 |
| `papers.html` | `paper-langevin-loss-landscapes` | `paper:langevin-loss-landscapes:hero` | `light` | `.nav .brand b` | 14.0px | `#65a30d` | `#fafbfb` | **2.98:1** | 4.5:1 |
| `papers.html` | `paper-langevin-loss-landscapes` | `paper:langevin-loss-landscapes:hero` | `light` | `.nav .nav-domain-pill` | 11.0px | `#65a30d` | `#b9d495` | **1.90:1** | 4.5:1 |
| `papers.html` | `paper-langevin-loss-landscapes` | `paper:langevin-loss-landscapes:hero` | `light` | `.nav .nav-contact-link` | 12.0px | `#65a30d` | `#a6c67a` | **1.62:1** | 4.5:1 |
| `papers.html` | `paper-langevin-loss-landscapes` | `paper:langevin-loss-landscapes:hero` | `light` | `.snap-pager .snap-dot.active .dot-text` | 11.0px | `#65a30e` | `#d8d9db` | **2.19:1** | 4.5:1 |
| `papers.html` | `paper-langevin-loss-landscapes` | `paper:langevin-loss-landscapes:hero` | `light` | `.snap-pager .snap-dot:not(.active) .dot-text` | 11.0px | `#475569` | `#414b40` | **1.20:1** | 4.5:1 |
| `papers.html` | `paper-langevin-loss-landscapes` | `paper:langevin-loss-landscapes:hero` | `light` | `.eyebrow` | 12.0px | `#65a30d` | `#84917f` | **1.07:1** | 4.5:1 |
| `papers.html` | `paper-langevin-loss-landscapes` | `paper:langevin-loss-landscapes:hero` | `light` | `.paper-domain-tag` | 10.0px | `#b45309` | `#c09473` | **1.85:1** | 4.5:1 |
| `papers.html` | `paper-langevin-loss-landscapes` | `paper:langevin-loss-landscapes:hero` | `light` | `.lead, .snap-lead` | 19.0px | `#475569` | `#aab9a0` | **3.66:1** | 4.5:1 |
| `papers.html` | `paper-langevin-loss-landscapes` | `paper:langevin-loss-landscapes:hero` | `light` | `.tag-status` | 10.0px | `#475569` | `#c1cabb` | **4.49:1** | 4.5:1 |
| `papers.html` | `paper-langevin-loss-landscapes` | `paper:langevin-loss-landscapes:hero` | `light` | `.snap-cta-btn` | 13.0px | `#65a30d` | `#b9c4b6` | **1.71:1** | 4.5:1 |
| `papers.html` | `paper-langevin-loss-landscapes` | `paper:langevin-loss-landscapes:hero` | `light` | `.snap-count` | 12.0px | `#475569` | `#aab1af` | **3.47:1** | 4.5:1 |
| `papers.html` | `paper-langevin-loss-landscapes` | `paper:langevin-loss-landscapes:hero` | `light` | `.paper-meta` | 12.0px | `#475569` | `#a4b886` | **3.53:1** | 4.5:1 |
| `papers.html` | `paper-langevin-loss-landscapes` | `paper:langevin-loss-landscapes:hero` | `light` | `.paper-meta .venue` | 12.0px | `#65a30d` | `#d1d3d8` | **2.06:1** | 4.5:1 |
| `papers.html` | `paper-langevin-loss-landscapes` | `paper:langevin-loss-landscapes:hero` | `light` | `.sim-tag` | 11.0px | `#475569` | `#485048` | **1.10:1** | 4.5:1 |
| `papers.html` | `paper-hft-stat-arb-microstructure` | `paper:hft-stat-arb-microstructure:hero` | `light` | `.nav .brand b` | 14.0px | `#65a30d` | `#fefeff` | **3.06:1** | 4.5:1 |
| `papers.html` | `paper-hft-stat-arb-microstructure` | `paper:hft-stat-arb-microstructure:hero` | `light` | `.nav .nav-domain-pill` | 11.0px | `#65a30d` | `#bcd798` | **1.96:1** | 4.5:1 |
| `papers.html` | `paper-hft-stat-arb-microstructure` | `paper:hft-stat-arb-microstructure:hero` | `light` | `.nav .nav-contact-link` | 12.0px | `#65a30d` | `#b1d185` | **1.81:1** | 4.5:1 |
| `papers.html` | `paper-hft-stat-arb-microstructure` | `paper:hft-stat-arb-microstructure:hero` | `light` | `.snap-pager .snap-dot.active .dot-text` | 11.0px | `#65a30d` | `#e0e2e3` | **2.38:1** | 4.5:1 |
| `papers.html` | `paper-hft-stat-arb-microstructure` | `paper:hft-stat-arb-microstructure:hero` | `light` | `.eyebrow` | 12.0px | `#65a30d` | `#d9e7e7` | **2.43:1** | 4.5:1 |
| `papers.html` | `paper-hft-stat-arb-microstructure` | `paper:hft-stat-arb-microstructure:hero` | `light` | `.paper-domain-tag` | 10.0px | `#059669` | `#87cab7` | **2.00:1** | 4.5:1 |
| `papers.html` | `paper-hft-stat-arb-microstructure` | `paper:hft-stat-arb-microstructure:hero` | `light` | `.snap-cta-btn` | 13.0px | `#65a30d` | `#d8e5cc` | **2.35:1** | 4.5:1 |
| `papers.html` | `paper-hft-stat-arb-microstructure` | `paper:hft-stat-arb-microstructure:hero` | `light` | `.paper-meta .venue` | 12.0px | `#65a30d` | `#f3f4f6` | **2.81:1** | 4.5:1 |
| `papers.html` | `paper-symplectic-energy-bounds-nbody` | `paper:symplectic-energy-bounds-nbody:hero` | `light` | `.nav .brand b` | 14.0px | `#65a30d` | `#fafafb` | **2.96:1** | 4.5:1 |
| `papers.html` | `paper-symplectic-energy-bounds-nbody` | `paper:symplectic-energy-bounds-nbody:hero` | `light` | `.nav .nav-domain-pill` | 11.0px | `#65a30d` | `#b9d495` | **1.90:1** | 4.5:1 |
| `papers.html` | `paper-symplectic-energy-bounds-nbody` | `paper:symplectic-energy-bounds-nbody:hero` | `light` | `.nav .nav-contact-link` | 12.0px | `#65a30d` | `#a7c67a` | **1.62:1** | 4.5:1 |
| `papers.html` | `paper-symplectic-energy-bounds-nbody` | `paper:symplectic-energy-bounds-nbody:hero` | `light` | `.snap-pager .snap-dot.active .dot-text` | 11.0px | `#65a30d` | `#5e665c` | **1.93:1** | 4.5:1 |
| `papers.html` | `paper-symplectic-energy-bounds-nbody` | `paper:symplectic-energy-bounds-nbody:hero` | `light` | `.snap-pager .snap-dot:not(.active) .dot-text` | 11.0px | `#475569` | `#434b42` | **1.19:1** | 4.5:1 |
| `papers.html` | `paper-symplectic-energy-bounds-nbody` | `paper:symplectic-energy-bounds-nbody:hero` | `light` | `.eyebrow` | 12.0px | `#65a30d` | `#7f8a7c` | **1.17:1** | 4.5:1 |
| `papers.html` | `paper-symplectic-energy-bounds-nbody` | `paper:symplectic-energy-bounds-nbody:hero` | `light` | `.paper-domain-tag` | 10.0px | `#0284c7` | `#6eabcc` | **1.63:1** | 4.5:1 |
| `papers.html` | `paper-symplectic-energy-bounds-nbody` | `paper:symplectic-energy-bounds-nbody:hero` | `light` | `.lead, .snap-lead` | 19.0px | `#475569` | `#98a096` | **2.82:1** | 4.5:1 |
| `papers.html` | `paper-symplectic-energy-bounds-nbody` | `paper:symplectic-energy-bounds-nbody:hero` | `light` | `.tag-status` | 10.0px | `#475569` | `#9da3a1` | **2.95:1** | 4.5:1 |
| `papers.html` | `paper-symplectic-energy-bounds-nbody` | `paper:symplectic-energy-bounds-nbody:hero` | `light` | `.snap-cta-btn` | 13.0px | `#65a30d` | `#b5bdb0` | **1.60:1** | 4.5:1 |
| `papers.html` | `paper-symplectic-energy-bounds-nbody` | `paper:symplectic-energy-bounds-nbody:hero` | `light` | `.snap-count` | 12.0px | `#475569` | `#959c93` | **2.69:1** | 4.5:1 |
| `papers.html` | `paper-symplectic-energy-bounds-nbody` | `paper:symplectic-energy-bounds-nbody:hero` | `light` | `.paper-meta` | 12.0px | `#475569` | `#808b7a` | **2.13:1** | 4.5:1 |
| `papers.html` | `paper-symplectic-energy-bounds-nbody` | `paper:symplectic-energy-bounds-nbody:hero` | `light` | `.paper-meta .venue` | 12.0px | `#65a30d` | `#c2c4c6` | **1.77:1** | 4.5:1 |
| `papers.html` | `paper-symplectic-energy-bounds-nbody` | `paper:symplectic-energy-bounds-nbody:hero` | `light` | `.sim-tag` | 11.0px | `#475569` | `#474e49` | **1.13:1** | 4.5:1 |
| `papers.html` | `paper-symplectic-energy-bounds-nbody` | `paper:symplectic-energy-bounds-nbody:hero` | `light` | `.snap-cue` | 11.0px | `#475569` | `#c5c6ca` | **4.44:1** | 4.5:1 |
| `papers.html` | `paper-verified-ssa-compiler-passes` | `paper:verified-ssa-compiler-passes:hero` | `light` | `.nav .brand b` | 14.0px | `#65a30d` | `#fefeff` | **3.06:1** | 4.5:1 |
| `papers.html` | `paper-verified-ssa-compiler-passes` | `paper:verified-ssa-compiler-passes:hero` | `light` | `.nav .nav-domain-pill` | 11.0px | `#65a30d` | `#bcd798` | **1.96:1** | 4.5:1 |
| `papers.html` | `paper-verified-ssa-compiler-passes` | `paper:verified-ssa-compiler-passes:hero` | `light` | `.nav .nav-contact-link` | 12.0px | `#65a30d` | `#b1d185` | **1.81:1** | 4.5:1 |
| `papers.html` | `paper-verified-ssa-compiler-passes` | `paper:verified-ssa-compiler-passes:hero` | `light` | `.snap-pager .snap-dot.active .dot-text` | 11.0px | `#65a30d` | `#e0e2e3` | **2.38:1** | 4.5:1 |
| `papers.html` | `paper-verified-ssa-compiler-passes` | `paper:verified-ssa-compiler-passes:hero` | `light` | `.eyebrow` | 12.0px | `#65a30d` | `#e5e0f4` | **2.40:1** | 4.5:1 |
| `papers.html` | `paper-verified-ssa-compiler-passes` | `paper:verified-ssa-compiler-passes:hero` | `light` | `.paper-domain-tag` | 10.0px | `#6d28d9` | `#b697ea` | **2.91:1** | 4.5:1 |
| `papers.html` | `paper-verified-ssa-compiler-passes` | `paper:verified-ssa-compiler-passes:hero` | `light` | `.snap-cta-btn` | 13.0px | `#65a30d` | `#d8e5cc` | **2.35:1** | 4.5:1 |
| `papers.html` | `paper-verified-ssa-compiler-passes` | `paper:verified-ssa-compiler-passes:hero` | `light` | `.paper-meta .venue` | 12.0px | `#65a30d` | `#f1f4f3` | **2.79:1** | 4.5:1 |
| `papers.html` | `paper-riemannian-immersion-gauss-bonnet` | `paper:riemannian-immersion-gauss-bonnet:hero` | `light` | `.nav .brand b` | 14.0px | `#65a30d` | `#fefeff` | **3.06:1** | 4.5:1 |
| `papers.html` | `paper-riemannian-immersion-gauss-bonnet` | `paper:riemannian-immersion-gauss-bonnet:hero` | `light` | `.nav .nav-domain-pill` | 11.0px | `#65a30d` | `#bcd798` | **1.96:1** | 4.5:1 |
| `papers.html` | `paper-riemannian-immersion-gauss-bonnet` | `paper:riemannian-immersion-gauss-bonnet:hero` | `light` | `.nav .nav-contact-link` | 12.0px | `#65a30d` | `#b1d185` | **1.81:1** | 4.5:1 |
| `papers.html` | `paper-riemannian-immersion-gauss-bonnet` | `paper:riemannian-immersion-gauss-bonnet:hero` | `light` | `.snap-pager .snap-dot.active .dot-text` | 11.0px | `#68a414` | `#e0e2e3` | **2.34:1** | 4.5:1 |
| `papers.html` | `paper-riemannian-immersion-gauss-bonnet` | `paper:riemannian-immersion-gauss-bonnet:hero` | `light` | `.eyebrow` | 12.0px | `#65a30d` | `#aecc84` | **1.73:1** | 4.5:1 |
| `papers.html` | `paper-riemannian-immersion-gauss-bonnet` | `paper:riemannian-immersion-gauss-bonnet:hero` | `light` | `.snap-cta-btn` | 13.0px | `#65a30d` | `#d0e1bc` | **2.23:1** | 4.5:1 |
| `papers.html` | `paper-riemannian-immersion-gauss-bonnet` | `paper:riemannian-immersion-gauss-bonnet:hero` | `light` | `.paper-meta .venue` | 12.0px | `#65a30d` | `#f3f4f6` | **2.81:1** | 4.5:1 |
| `papers.html` | `papers-contact` | `papers-index:contact` | `light` | `.nav .brand b` | 14.0px | `#0d9488` | `#fefeff` | **3.71:1** | 4.5:1 |
| `papers.html` | `papers-contact` | `papers-index:contact` | `light` | `.nav .nav-domain-pill` | 11.0px | `#65a30d` | `#bcd798` | **1.96:1** | 4.5:1 |
| `papers.html` | `papers-contact` | `papers-index:contact` | `light` | `.nav .nav-contact-link` | 12.0px | `#14957f` | `#84c9c3` | **1.97:1** | 4.5:1 |
| `papers.html` | `papers-contact` | `papers-index:contact` | `light` | `.snap-pager .snap-dot.active .dot-text` | 11.0px | `#14958b` | `#e0e2e4` | **2.84:1** | 4.5:1 |
| `papers.html` | `papers-contact` | `papers-index:contact` | `light` | `.section-head .idx` | 12.0px | `#0d9488` | `#f5f6fb` | **3.47:1** | 4.5:1 |
| `papers.html` | `papers-contact` | `papers-index:contact` | `light` | `.pill:not(.snap-cta-btn)` | 12.0px | `#0d9488` | `#99cfcd` | **2.17:1** | 4.5:1 |
| `papers.html` | `papers-contact` | `papers-index:contact` | `light` | `.contact-status` | 12.0px | `#0d9488` | `#e7f4f3` | **3.32:1** | 4.5:1 |
| `courses.html` | `track-iitm-datascience` | `track:iitm-datascience` | `dark` | `.pill:not(.snap-cta-btn)` | 11.0px | `#f59e0b` | `#694710` | **3.90:1** | 4.5:1 |
| `courses.html` | `track-physics-curriculum` | `track:physics-curriculum` | `dark` | `.pill:not(.snap-cta-btn)` | 11.0px | `#22d3ee` | `#165d6d` | **4.12:1** | 4.5:1 |
| `courses.html` | `track-advanced-quant-systems` | `track:advanced-quant-systems` | `dark` | `.pill:not(.snap-cta-btn)` | 11.0px | `#10b981` | `#0f5340` | **3.55:1** | 4.5:1 |
| `courses.html` | `courses-contact` | `courses-index:contact` | `dark` | `.nav .nav-contact-link` | 12.0px | `#14b8a6` | `#106760` | **2.69:1** | 4.5:1 |
| `courses.html` | `courses-contact` | `courses-index:contact` | `dark` | `.pill:not(.snap-cta-btn)` | 12.0px | `#14b8a6` | `#0c4e49` | **3.83:1** | 4.5:1 |
| `courses.html` | `courses-hero` | `courses-index:hero` | `light` | `.nav .nav-domain-pill` | 11.0px | `#be185d` | `#e29bba` | **2.77:1** | 4.5:1 |
| `courses.html` | `courses-hero` | `courses-index:hero` | `light` | `.nav .nav-contact-link` | 12.0px | `#be185d` | `#de8bae` | **2.42:1** | 4.5:1 |
| `courses.html` | `track-iitm-datascience` | `track:iitm-datascience` | `light` | `.nav .nav-domain-pill` | 11.0px | `#be185d` | `#e29bba` | **2.77:1** | 4.5:1 |
| `courses.html` | `track-iitm-datascience` | `track:iitm-datascience` | `light` | `.nav .nav-contact-link` | 12.0px | `#be185d` | `#de8bae` | **2.42:1** | 4.5:1 |
| `courses.html` | `track-iitm-datascience` | `track:iitm-datascience` | `light` | `.paper-domain-tag` | 10.0px | `#b45309` | `#eae0de` | **3.88:1** | 4.5:1 |
| `courses.html` | `track-iitm-datascience` | `track:iitm-datascience` | `light` | `.pill:not(.snap-cta-btn)` | 11.0px | `#b45309` | `#e0b99d` | **2.77:1** | 4.5:1 |
| `courses.html` | `track-physics-curriculum` | `track:physics-curriculum` | `light` | `.nav .nav-domain-pill` | 11.0px | `#be185d` | `#df98b7` | **2.68:1** | 4.5:1 |
| `courses.html` | `track-physics-curriculum` | `track:physics-curriculum` | `light` | `.nav .nav-contact-link` | 12.0px | `#be185d` | `#d380a4` | **2.13:1** | 4.5:1 |
| `courses.html` | `track-physics-curriculum` | `track:physics-curriculum` | `light` | `.snap-pager .snap-dot.active .dot-text` | 11.0px | `#bd185d` | `#514254` | **1.53:1** | 4.5:1 |
| `courses.html` | `track-physics-curriculum` | `track:physics-curriculum` | `light` | `.snap-pager .snap-dot:not(.active) .dot-text` | 11.0px | `#475569` | `#504252` | **1.24:1** | 4.5:1 |
| `courses.html` | `track-physics-curriculum` | `track:physics-curriculum` | `light` | `.eyebrow` | 12.0px | `#be185d` | `#8c7d8c` | **1.56:1** | 4.5:1 |
| `courses.html` | `track-physics-curriculum` | `track:physics-curriculum` | `light` | `.paper-domain-tag` | 10.0px | `#0284c7` | `#82b3cf` | **1.81:1** | 4.5:1 |
| `courses.html` | `track-physics-curriculum` | `track:physics-curriculum` | `light` | `.lead, .snap-lead` | 19.0px | `#475569` | `#a295a2` | **2.65:1** | 4.5:1 |
| `courses.html` | `track-physics-curriculum` | `track:physics-curriculum` | `light` | `.pill:not(.snap-cta-btn)` | 11.0px | `#0284c7` | `#96cae6` | **2.32:1** | 4.5:1 |
| `courses.html` | `track-physics-curriculum` | `track:physics-curriculum` | `light` | `.sim-tag` | 11.0px | `#475569` | `#534959` | **1.12:1** | 4.5:1 |
| `courses.html` | `track-physics-curriculum` | `track:physics-curriculum` | `light` | `.snap-cue` | 11.0px | `#475569` | `#bbb9c2` | **3.91:1** | 4.5:1 |
| `courses.html` | `track-advanced-quant-systems` | `track:advanced-quant-systems` | `light` | `.nav .nav-domain-pill` | 11.0px | `#be185d` | `#df98b7` | **2.68:1** | 4.5:1 |
| `courses.html` | `track-advanced-quant-systems` | `track:advanced-quant-systems` | `light` | `.nav .nav-contact-link` | 12.0px | `#be185d` | `#d380a3` | **2.12:1** | 4.5:1 |
| `courses.html` | `track-advanced-quant-systems` | `track:advanced-quant-systems` | `light` | `.snap-pager .snap-dot.active .dot-text` | 11.0px | `#bf2566` | `#d8d8db` | **4.02:1** | 4.5:1 |
| `courses.html` | `track-advanced-quant-systems` | `track:advanced-quant-systems` | `light` | `.snap-pager .snap-dot:not(.active) .dot-text` | 11.0px | `#475569` | `#594452` | **1.17:1** | 4.5:1 |
| `courses.html` | `track-advanced-quant-systems` | `track:advanced-quant-systems` | `light` | `.eyebrow` | 12.0px | `#be185d` | `#8f7f8a` | **1.60:1** | 4.5:1 |
| `courses.html` | `track-advanced-quant-systems` | `track:advanced-quant-systems` | `light` | `.paper-domain-tag` | 10.0px | `#059669` | `#b0bdbf` | **1.95:1** | 4.5:1 |
| `courses.html` | `track-advanced-quant-systems` | `track:advanced-quant-systems` | `light` | `.lead, .snap-lead` | 19.0px | `#475569` | `#ac9ca5` | **2.91:1** | 4.5:1 |
| `courses.html` | `track-advanced-quant-systems` | `track:advanced-quant-systems` | `light` | `.pill:not(.snap-cta-btn)` | 11.0px | `#059669` | `#97d1bf` | **2.19:1** | 4.5:1 |
| `courses.html` | `track-advanced-quant-systems` | `track:advanced-quant-systems` | `light` | `.sim-tag` | 11.0px | `#475569` | `#4e424e` | **1.25:1** | 4.5:1 |
| `courses.html` | `courses-contact` | `courses-index:contact` | `light` | `.nav .brand b` | 14.0px | `#0d9488` | `#fefeff` | **3.71:1** | 4.5:1 |
| `courses.html` | `courses-contact` | `courses-index:contact` | `light` | `.nav .nav-domain-pill` | 11.0px | `#be185d` | `#e29bba` | **2.77:1** | 4.5:1 |
| `courses.html` | `courses-contact` | `courses-index:contact` | `light` | `.nav .nav-contact-link` | 12.0px | `#158e86` | `#84c9c3` | **2.12:1** | 4.5:1 |
| `courses.html` | `courses-contact` | `courses-index:contact` | `light` | `.snap-pager .snap-dot.active .dot-text` | 11.0px | `#0f9589` | `#e0e2e4` | **2.85:1** | 4.5:1 |
| `courses.html` | `courses-contact` | `courses-index:contact` | `light` | `.section-head .idx` | 12.0px | `#0d9488` | `#f5f6fb` | **3.47:1** | 4.5:1 |
| `courses.html` | `courses-contact` | `courses-index:contact` | `light` | `.pill:not(.snap-cta-btn)` | 12.0px | `#0d9488` | `#99cfcd` | **2.17:1** | 4.5:1 |
| `courses.html` | `courses-contact` | `courses-index:contact` | `light` | `.contact-status` | 12.0px | `#0d9488` | `#e7f4f3` | **3.32:1** | 4.5:1 |
| `project.html?p=mobius-surfaces` | `proj-hero` | `project:mobius-surfaces:hero` | `dark` | `.nav .brand b` | 14.0px | `#e02840` | `#0d0e15` | **4.17:1** | 4.5:1 |
| `project.html?p=mobius-surfaces` | `proj-hero` | `project:mobius-surfaces:hero` | `dark` | `.nav .nav-contact-link` | 12.0px | `#e02840` | `#1b131c` | **3.93:1** | 4.5:1 |
| `project.html?p=mobius-surfaces` | `proj-hero` | `project:mobius-surfaces:hero` | `dark` | `.snap-pager .snap-dot.active .dot-text` | 11.0px | `#e02840` | `#11121b` | **4.04:1** | 4.5:1 |
| `project.html?p=mobius-surfaces` | `proj-hero` | `project:mobius-surfaces:hero` | `dark` | `.crumbs a` | 12.0px | `#e02840` | `#090a0e` | **4.28:1** | 4.5:1 |
| `project.html?p=mobius-surfaces` | `proj-hero` | `project:mobius-surfaces:hero` | `dark` | `h1 (gradient stop 2 rgba(--a,0.85))` | 112.0px | `#ca2d41` | `#4f4649` | **1.72:1** | 3.0:1 |
| `project.html?p=mobius-surfaces` | `proj-hero` | `project:mobius-surfaces:hero` | `dark` | `.pill:not(.snap-cta-btn)` | 12.0px | `#e02840` | `#090a0e` | **4.28:1** | 4.5:1 |
| `project.html?p=mobius-surfaces` | `proj-arch` | `project:mobius-surfaces:arch` | `dark` | `.nav .brand b` | 14.0px | `#e02840` | `#0d0e15` | **4.17:1** | 4.5:1 |
| `project.html?p=mobius-surfaces` | `proj-arch` | `project:mobius-surfaces:arch` | `dark` | `.nav .nav-contact-link` | 12.0px | `#e02840` | `#1b131c` | **3.93:1** | 4.5:1 |
| `project.html?p=mobius-surfaces` | `proj-arch` | `project:mobius-surfaces:arch` | `dark` | `.snap-pager .snap-dot.active .dot-text` | 11.0px | `#e02840` | `#11121b` | **4.04:1** | 4.5:1 |
| `project.html?p=mobius-surfaces` | `proj-arch` | `project:mobius-surfaces:arch` | `dark` | `.eyebrow` | 12.0px | `#e02840` | `#0a0b0f` | **4.26:1** | 4.5:1 |
| `project.html?p=mobius-surfaces` | `proj-math` | `project:mobius-surfaces:math` | `dark` | `.nav .brand b` | 14.0px | `#e02840` | `#0d0e15` | **4.17:1** | 4.5:1 |
| `project.html?p=mobius-surfaces` | `proj-math` | `project:mobius-surfaces:math` | `dark` | `.nav .nav-contact-link` | 12.0px | `#e02840` | `#1c131c` | **3.92:1** | 4.5:1 |
| `project.html?p=mobius-surfaces` | `proj-math` | `project:mobius-surfaces:math` | `dark` | `.snap-pager .snap-dot.active .dot-text` | 11.0px | `#e02840` | `#11121b` | **4.04:1** | 4.5:1 |
| `project.html?p=mobius-surfaces` | `proj-math` | `project:mobius-surfaces:math` | `dark` | `.eyebrow` | 12.0px | `#e02840` | `#0a0a0e` | **4.28:1** | 4.5:1 |
| `project.html?p=mobius-surfaces` | `proj-hero` | `project:mobius-surfaces:hero` | `light` | `.nav .nav-contact-link` | 12.0px | `#be123c` | `#d37d93` | **2.13:1** | 4.5:1 |
| `project.html?p=mobius-surfaces` | `proj-hero` | `project:mobius-surfaces:hero` | `light` | `.snap-pager .snap-dot.active .dot-text` | 11.0px | `#be123c` | `#4b3a45` | **1.68:1** | 4.5:1 |
| `project.html?p=mobius-surfaces` | `proj-hero` | `project:mobius-surfaces:hero` | `light` | `.snap-pager .snap-dot:not(.active) .dot-text` | 11.0px | `#475569` | `#4c3a45` | **1.39:1** | 4.5:1 |
| `project.html?p=mobius-surfaces` | `proj-hero` | `project:mobius-surfaces:hero` | `light` | `.crumbs` | 12.0px | `#475569` | `#b58499` | **2.43:1** | 4.5:1 |
| `project.html?p=mobius-surfaces` | `proj-hero` | `project:mobius-surfaces:hero` | `light` | `h1 (gradient stop 2 rgba(--a,0.85))` | 112.0px | `#ba2349` | `#a38190` | **1.78:1** | 3.0:1 |
| `project.html?p=mobius-surfaces` | `proj-hero` | `project:mobius-surfaces:hero` | `light` | `.tag` | 11.0px | `#475569` | `#c6c7cd` | **4.49:1** | 4.5:1 |
| `project.html?p=mobius-surfaces` | `proj-hero` | `project:mobius-surfaces:hero` | `light` | `.pill:not(.snap-cta-btn)` | 12.0px | `#be123c` | `#d08b9e` | **2.36:1** | 4.5:1 |
| `project.html?p=mobius-surfaces` | `proj-hero` | `project:mobius-surfaces:hero` | `light` | `.sim-tag` | 11.0px | `#475569` | `#4f414b` | **1.27:1** | 4.5:1 |
| `project.html?p=mobius-surfaces` | `proj-arch` | `project:mobius-surfaces:arch` | `light` | `.nav .nav-contact-link` | 12.0px | `#be123c` | `#d37d93` | **2.13:1** | 4.5:1 |
| `project.html?p=mobius-surfaces` | `proj-arch` | `project:mobius-surfaces:arch` | `light` | `.snap-pager .snap-dot.active .dot-text` | 11.0px | `#be123c` | `#4c3b46` | **1.65:1** | 4.5:1 |
| `project.html?p=mobius-surfaces` | `proj-arch` | `project:mobius-surfaces:arch` | `light` | `.snap-pager .snap-dot:not(.active) .dot-text` | 11.0px | `#475569` | `#4b3a45` | **1.39:1** | 4.5:1 |
| `project.html?p=mobius-surfaces` | `proj-arch` | `project:mobius-surfaces:arch` | `light` | `.eyebrow` | 12.0px | `#be123c` | `#997382` | **1.54:1** | 4.5:1 |
| `project.html?p=mobius-surfaces` | `proj-arch` | `project:mobius-surfaces:arch` | `light` | `.sim-tag` | 11.0px | `#475569` | `#4d424b` | **1.26:1** | 4.5:1 |
| `project.html?p=mobius-surfaces` | `proj-math` | `project:mobius-surfaces:math` | `light` | `.nav .nav-contact-link` | 12.0px | `#be123c` | `#d37d93` | **2.13:1** | 4.5:1 |
| `project.html?p=mobius-surfaces` | `proj-math` | `project:mobius-surfaces:math` | `light` | `.snap-pager .snap-dot.active .dot-text` | 11.0px | `#bc133c` | `#4b3a45` | **1.66:1** | 4.5:1 |
| `project.html?p=mobius-surfaces` | `proj-math` | `project:mobius-surfaces:math` | `light` | `.snap-pager .snap-dot:not(.active) .dot-text` | 11.0px | `#475569` | `#4b3945` | **1.41:1** | 4.5:1 |
| `project.html?p=mobius-surfaces` | `proj-math` | `project:mobius-surfaces:math` | `light` | `.eyebrow` | 12.0px | `#be123c` | `#89717d` | **1.41:1** | 4.5:1 |
| `project.html?p=mobius-surfaces` | `proj-math` | `project:mobius-surfaces:math` | `light` | `.sim-tag` | 11.0px | `#475569` | `#4e424b` | **1.26:1** | 4.5:1 |
| `project.html?p=fourier-spectral` | `proj-hero` | `project:fourier-spectral:hero` | `dark` | `.nav .brand b` | 14.0px | `#e02840` | `#0d0e15` | **4.17:1** | 4.5:1 |
| `project.html?p=fourier-spectral` | `proj-hero` | `project:fourier-spectral:hero` | `dark` | `.nav .nav-contact-link` | 12.0px | `#e02840` | `#1b131c` | **3.93:1** | 4.5:1 |
| `project.html?p=fourier-spectral` | `proj-hero` | `project:fourier-spectral:hero` | `dark` | `.snap-pager .snap-dot.active .dot-text` | 11.0px | `#e02840` | `#14151c` | **3.94:1** | 4.5:1 |
| `project.html?p=fourier-spectral` | `proj-hero` | `project:fourier-spectral:hero` | `dark` | `.crumbs a` | 12.0px | `#e02840` | `#090a0e` | **4.28:1** | 4.5:1 |
| `project.html?p=fourier-spectral` | `proj-hero` | `project:fourier-spectral:hero` | `dark` | `.pill:not(.snap-cta-btn)` | 12.0px | `#e02840` | `#090a0e` | **4.28:1** | 4.5:1 |
| `project.html?p=fourier-spectral` | `proj-arch` | `project:fourier-spectral:arch` | `dark` | `.nav .brand b` | 14.0px | `#e02840` | `#0d0e15` | **4.17:1** | 4.5:1 |
| `project.html?p=fourier-spectral` | `proj-arch` | `project:fourier-spectral:arch` | `dark` | `.nav .nav-contact-link` | 12.0px | `#e02840` | `#1b131c` | **3.93:1** | 4.5:1 |
| `project.html?p=fourier-spectral` | `proj-arch` | `project:fourier-spectral:arch` | `dark` | `.snap-pager .snap-dot.active .dot-text` | 11.0px | `#e02840` | `#16171e` | **3.87:1** | 4.5:1 |
| `project.html?p=fourier-spectral` | `proj-arch` | `project:fourier-spectral:arch` | `dark` | `.eyebrow` | 12.0px | `#e02840` | `#0a0a0e` | **4.28:1** | 4.5:1 |
| `project.html?p=fourier-spectral` | `proj-math` | `project:fourier-spectral:math` | `dark` | `.nav .brand b` | 14.0px | `#e02840` | `#0d0e15` | **4.17:1** | 4.5:1 |
| `project.html?p=fourier-spectral` | `proj-math` | `project:fourier-spectral:math` | `dark` | `.nav .nav-contact-link` | 12.0px | `#e02840` | `#1b131c` | **3.93:1** | 4.5:1 |
| `project.html?p=fourier-spectral` | `proj-math` | `project:fourier-spectral:math` | `dark` | `.snap-pager .snap-dot.active .dot-text` | 11.0px | `#e02840` | `#17171e` | **3.86:1** | 4.5:1 |
| `project.html?p=fourier-spectral` | `proj-math` | `project:fourier-spectral:math` | `dark` | `.eyebrow` | 12.0px | `#e02840` | `#0a0a0f` | **4.28:1** | 4.5:1 |
| `project.html?p=fourier-spectral` | `proj-hero` | `project:fourier-spectral:hero` | `light` | `.nav .nav-contact-link` | 12.0px | `#be123c` | `#d37d93` | **2.13:1** | 4.5:1 |
| `project.html?p=fourier-spectral` | `proj-hero` | `project:fourier-spectral:hero` | `light` | `.snap-pager .snap-dot.active .dot-text` | 11.0px | `#be123c` | `#6c5c64` | **1.00:1** | 4.5:1 |
| `project.html?p=fourier-spectral` | `proj-hero` | `project:fourier-spectral:hero` | `light` | `.snap-pager .snap-dot:not(.active) .dot-text` | 11.0px | `#475569` | `#826f71` | **1.61:1** | 4.5:1 |
| `project.html?p=fourier-spectral` | `proj-hero` | `project:fourier-spectral:hero` | `light` | `.crumbs` | 12.0px | `#475569` | `#908088` | **2.03:1** | 4.5:1 |
| `project.html?p=fourier-spectral` | `proj-hero` | `project:fourier-spectral:hero` | `light` | `h1 (gradient stop 2 rgba(--a,0.85))` | 112.0px | `#b82248` | `#937f89` | **1.68:1** | 3.0:1 |
| `project.html?p=fourier-spectral` | `proj-hero` | `project:fourier-spectral:hero` | `light` | `.tag` | 11.0px | `#475569` | `#c5c7cd` | **4.48:1** | 4.5:1 |
| `project.html?p=fourier-spectral` | `proj-hero` | `project:fourier-spectral:hero` | `light` | `.pill:not(.snap-cta-btn)` | 12.0px | `#be123c` | `#d08b9e` | **2.36:1** | 4.5:1 |
| `project.html?p=fourier-spectral` | `proj-hero` | `project:fourier-spectral:hero` | `light` | `.sim-tag` | 11.0px | `#475569` | `#856572` | **1.48:1** | 4.5:1 |
| `project.html?p=fourier-spectral` | `proj-arch` | `project:fourier-spectral:arch` | `light` | `.nav .nav-contact-link` | 12.0px | `#be123c` | `#d37d93` | **2.13:1** | 4.5:1 |
| `project.html?p=fourier-spectral` | `proj-arch` | `project:fourier-spectral:arch` | `light` | `.snap-pager .snap-dot.active .dot-text` | 11.0px | `#bd133c` | `#876e6a` | **1.35:1** | 4.5:1 |
| `project.html?p=fourier-spectral` | `proj-arch` | `project:fourier-spectral:arch` | `light` | `.snap-pager .snap-dot:not(.active) .dot-text` | 11.0px | `#475569` | `#5b484e` | **1.12:1** | 4.5:1 |
| `project.html?p=fourier-spectral` | `proj-arch` | `project:fourier-spectral:arch` | `light` | `.eyebrow` | 12.0px | `#be123c` | `#a3959f` | **2.20:1** | 4.5:1 |
| `project.html?p=fourier-spectral` | `proj-arch` | `project:fourier-spectral:arch` | `light` | `.sim-tag` | 11.0px | `#475569` | `#876470` | **1.47:1** | 4.5:1 |
| `project.html?p=fourier-spectral` | `proj-math` | `project:fourier-spectral:math` | `light` | `.nav .nav-contact-link` | 12.0px | `#be123c` | `#d37d93` | **2.13:1** | 4.5:1 |
| `project.html?p=fourier-spectral` | `proj-math` | `project:fourier-spectral:math` | `light` | `.snap-pager .snap-dot.active .dot-text` | 11.0px | `#be133d` | `#a48980` | **1.93:1** | 4.5:1 |
| `project.html?p=fourier-spectral` | `proj-math` | `project:fourier-spectral:math` | `light` | `.snap-pager .snap-dot:not(.active) .dot-text` | 11.0px | `#475569` | `#655155` | **1.03:1** | 4.5:1 |
| `project.html?p=fourier-spectral` | `proj-math` | `project:fourier-spectral:math` | `light` | `.eyebrow` | 12.0px | `#be123c` | `#8c7b85` | **1.58:1** | 4.5:1 |
| `project.html?p=fourier-spectral` | `proj-math` | `project:fourier-spectral:math` | `light` | `.sim-tag` | 11.0px | `#475569` | `#81676c` | **1.48:1** | 4.5:1 |
| `project.html?p=nbody-leapfrog` | `proj-hero` | `project:nbody-leapfrog:hero` | `dark` | `.nav .nav-contact-link` | 12.0px | `#22d3ee` | `#1a7688` | **2.91:1** | 4.5:1 |
| `project.html?p=nbody-leapfrog` | `proj-hero` | `project:nbody-leapfrog:hero` | `dark` | `h1 (gradient stop 2 rgba(--a,0.85))` | 112.0px | `#2dc7df` | `#6c858a` | **1.93:1** | 3.0:1 |
| `project.html?p=nbody-leapfrog` | `proj-hero` | `project:nbody-leapfrog:hero` | `dark` | `.lead, .snap-lead` | 16.0px | `#e9ebf1` | `#6d7f80` | **3.53:1** | 4.5:1 |
| `project.html?p=nbody-leapfrog` | `proj-hero` | `project:nbody-leapfrog:hero` | `dark` | `.pill:not(.snap-cta-btn)` | 12.0px | `#22d3ee` | `#135b68` | **4.27:1** | 4.5:1 |
| `project.html?p=nbody-leapfrog` | `proj-arch` | `project:nbody-leapfrog:arch` | `dark` | `.nav .nav-contact-link` | 12.0px | `#22d3ee` | `#1a7688` | **2.91:1** | 4.5:1 |
| `project.html?p=nbody-leapfrog` | `proj-arch` | `project:nbody-leapfrog:arch` | `dark` | `.eyebrow` | 12.0px | `#22d3ee` | `#637277` | **2.76:1** | 4.5:1 |
| `project.html?p=nbody-leapfrog` | `proj-math` | `project:nbody-leapfrog:math` | `dark` | `.nav .nav-contact-link` | 12.0px | `#22d3ee` | `#1a7588` | **2.95:1** | 4.5:1 |
| `project.html?p=nbody-leapfrog` | `proj-hero` | `project:nbody-leapfrog:hero` | `light` | `.nav .brand b` | 14.0px | `#0284c7` | `#fafafb` | **3.93:1** | 4.5:1 |
| `project.html?p=nbody-leapfrog` | `proj-hero` | `project:nbody-leapfrog:hero` | `light` | `.nav .nav-contact-link` | 12.0px | `#0284c7` | `#74b6d9` | **1.84:1** | 4.5:1 |
| `project.html?p=nbody-leapfrog` | `proj-hero` | `project:nbody-leapfrog:hero` | `light` | `.snap-pager .snap-dot.active .dot-text` | 11.0px | `#0284c7` | `#374957` | **2.28:1** | 4.5:1 |
| `project.html?p=nbody-leapfrog` | `proj-hero` | `project:nbody-leapfrog:hero` | `light` | `.snap-pager .snap-dot:not(.active) .dot-text` | 11.0px | `#475569` | `#384957` | **1.23:1** | 4.5:1 |
| `project.html?p=nbody-leapfrog` | `proj-hero` | `project:nbody-leapfrog:hero` | `light` | `.crumbs` | 12.0px | `#475569` | `#9fafbc` | **3.37:1** | 4.5:1 |
| `project.html?p=nbody-leapfrog` | `proj-hero` | `project:nbody-leapfrog:hero` | `light` | `.crumbs a` | 12.0px | `#0284c7` | `#dadbe0` | **2.96:1** | 4.5:1 |
| `project.html?p=nbody-leapfrog` | `proj-hero` | `project:nbody-leapfrog:hero` | `light` | `h1 (gradient stop 2 rgba(--a,0.85))` | 112.0px | `#178bc6` | `#8bb1c3` | **1.65:1** | 3.0:1 |
| `project.html?p=nbody-leapfrog` | `proj-hero` | `project:nbody-leapfrog:hero` | `light` | `.pill:not(.snap-cta-btn)` | 12.0px | `#0284c7` | `#88bcd8` | **2.00:1** | 4.5:1 |
| `project.html?p=nbody-leapfrog` | `proj-hero` | `project:nbody-leapfrog:hero` | `light` | `.sim-tag` | 11.0px | `#475569` | `#414f5a` | **1.11:1** | 4.5:1 |
| `project.html?p=nbody-leapfrog` | `proj-arch` | `project:nbody-leapfrog:arch` | `light` | `.nav .brand b` | 14.0px | `#0284c7` | `#fafafb` | **3.93:1** | 4.5:1 |
| `project.html?p=nbody-leapfrog` | `proj-arch` | `project:nbody-leapfrog:arch` | `light` | `.nav .nav-contact-link` | 12.0px | `#0284c7` | `#74b6d9` | **1.84:1** | 4.5:1 |
| `project.html?p=nbody-leapfrog` | `proj-arch` | `project:nbody-leapfrog:arch` | `light` | `.snap-pager .snap-dot.active .dot-text` | 11.0px | `#0284c7` | `#3b4e5c` | **2.11:1** | 4.5:1 |
| `project.html?p=nbody-leapfrog` | `proj-arch` | `project:nbody-leapfrog:arch` | `light` | `.snap-pager .snap-dot:not(.active) .dot-text` | 11.0px | `#475569` | `#384957` | **1.23:1** | 4.5:1 |
| `project.html?p=nbody-leapfrog` | `proj-arch` | `project:nbody-leapfrog:arch` | `light` | `.eyebrow` | 12.0px | `#0284c7` | `#9eacb5` | **1.76:1** | 4.5:1 |
| `project.html?p=nbody-leapfrog` | `proj-arch` | `project:nbody-leapfrog:arch` | `light` | `.sim-tag` | 11.0px | `#475569` | `#41505b` | **1.10:1** | 4.5:1 |
| `project.html?p=nbody-leapfrog` | `proj-math` | `project:nbody-leapfrog:math` | `light` | `.nav .brand b` | 14.0px | `#0284c7` | `#fefeff` | **4.06:1** | 4.5:1 |
| `project.html?p=nbody-leapfrog` | `proj-math` | `project:nbody-leapfrog:math` | `light` | `.nav .nav-contact-link` | 12.0px | `#0284c7` | `#7fc1e4` | **2.08:1** | 4.5:1 |
| `project.html?p=nbody-leapfrog` | `proj-math` | `project:nbody-leapfrog:math` | `light` | `.snap-pager .snap-dot.active .dot-text` | 11.0px | `#0a87c8` | `#e0e2e5` | **3.05:1** | 4.5:1 |
| `project.html?p=nbody-leapfrog` | `proj-math` | `project:nbody-leapfrog:math` | `light` | `.eyebrow` | 12.0px | `#0284c7` | `#d9e9f4` | **3.30:1** | 4.5:1 |
| `project.html?p=split-step-schrodinger` | `proj-hero` | `project:split-step-schrodinger:hero` | `dark` | `.nav .nav-contact-link` | 12.0px | `#22d3ee` | `#167182` | **3.12:1** | 4.5:1 |
| `project.html?p=split-step-schrodinger` | `proj-hero` | `project:split-step-schrodinger:hero` | `dark` | `.pill:not(.snap-cta-btn)` | 12.0px | `#22d3ee` | `#115965` | **4.40:1** | 4.5:1 |
| `project.html?p=split-step-schrodinger` | `proj-arch` | `project:split-step-schrodinger:arch` | `dark` | `.nav .nav-contact-link` | 12.0px | `#22d3ee` | `#167182` | **3.12:1** | 4.5:1 |
| `project.html?p=split-step-schrodinger` | `proj-math` | `project:split-step-schrodinger:math` | `dark` | `.nav .nav-contact-link` | 12.0px | `#22d3ee` | `#167182` | **3.12:1** | 4.5:1 |
| `project.html?p=split-step-schrodinger` | `proj-hero` | `project:split-step-schrodinger:hero` | `light` | `.nav .brand b` | 14.0px | `#0284c7` | `#fafafb` | **3.93:1** | 4.5:1 |
| `project.html?p=split-step-schrodinger` | `proj-hero` | `project:split-step-schrodinger:hero` | `light` | `.nav .nav-contact-link` | 12.0px | `#0284c7` | `#73b4d7` | **1.80:1** | 4.5:1 |
| `project.html?p=split-step-schrodinger` | `proj-hero` | `project:split-step-schrodinger:hero` | `light` | `.snap-pager .snap-dot.active .dot-text` | 11.0px | `#0284c7` | `#263239` | **3.21:1** | 4.5:1 |
| `project.html?p=split-step-schrodinger` | `proj-hero` | `project:split-step-schrodinger:hero` | `light` | `.snap-pager .snap-dot:not(.active) .dot-text` | 11.0px | `#475569` | `#263239` | **1.73:1** | 4.5:1 |
| `project.html?p=split-step-schrodinger` | `proj-hero` | `project:split-step-schrodinger:hero` | `light` | `.crumbs` | 12.0px | `#475569` | `#737f87` | **1.85:1** | 4.5:1 |
| `project.html?p=split-step-schrodinger` | `proj-hero` | `project:split-step-schrodinger:hero` | `light` | `.crumbs a` | 12.0px | `#0284c7` | `#d6d7db` | **2.85:1** | 4.5:1 |
| `project.html?p=split-step-schrodinger` | `proj-hero` | `project:split-step-schrodinger:hero` | `light` | `h1 (gradient stop 2 rgba(--a,0.85))` | 112.0px | `#1484bf` | `#79878f` | **1.12:1** | 3.0:1 |
| `project.html?p=split-step-schrodinger` | `proj-hero` | `project:split-step-schrodinger:hero` | `light` | `.lead, .snap-lead` | 16.0px | `#0f172a` | `#717f88` | **4.33:1** | 4.5:1 |
| `project.html?p=split-step-schrodinger` | `proj-hero` | `project:split-step-schrodinger:hero` | `light` | `.tag` | 11.0px | `#475569` | `#c2c4c9` | **4.34:1** | 4.5:1 |
| `project.html?p=split-step-schrodinger` | `proj-hero` | `project:split-step-schrodinger:hero` | `light` | `.pill:not(.snap-cta-btn)` | 12.0px | `#0284c7` | `#82b6d4` | **1.87:1** | 4.5:1 |
| `project.html?p=split-step-schrodinger` | `proj-hero` | `project:split-step-schrodinger:hero` | `light` | `.sim-tag` | 11.0px | `#475569` | `#2e363b` | **1.62:1** | 4.5:1 |
| `project.html?p=split-step-schrodinger` | `proj-arch` | `project:split-step-schrodinger:arch` | `light` | `.nav .brand b` | 14.0px | `#0284c7` | `#fafafb` | **3.93:1** | 4.5:1 |
| `project.html?p=split-step-schrodinger` | `proj-arch` | `project:split-step-schrodinger:arch` | `light` | `.nav .nav-contact-link` | 12.0px | `#0284c7` | `#73b4d7` | **1.80:1** | 4.5:1 |
| `project.html?p=split-step-schrodinger` | `proj-arch` | `project:split-step-schrodinger:arch` | `light` | `.snap-pager .snap-dot.active .dot-text` | 11.0px | `#0284c7` | `#263239` | **3.21:1** | 4.5:1 |
| `project.html?p=split-step-schrodinger` | `proj-arch` | `project:split-step-schrodinger:arch` | `light` | `.snap-pager .snap-dot:not(.active) .dot-text` | 11.0px | `#475569` | `#263239` | **1.73:1** | 4.5:1 |
| `project.html?p=split-step-schrodinger` | `proj-arch` | `project:split-step-schrodinger:arch` | `light` | `.eyebrow` | 12.0px | `#0284c7` | `#8d969e` | **1.36:1** | 4.5:1 |
| `project.html?p=split-step-schrodinger` | `proj-arch` | `project:split-step-schrodinger:arch` | `light` | `.sim-tag` | 11.0px | `#475569` | `#2e363b` | **1.62:1** | 4.5:1 |
| `project.html?p=split-step-schrodinger` | `proj-math` | `project:split-step-schrodinger:math` | `light` | `.nav .brand b` | 14.0px | `#0284c7` | `#fafafb` | **3.93:1** | 4.5:1 |
| `project.html?p=split-step-schrodinger` | `proj-math` | `project:split-step-schrodinger:math` | `light` | `.nav .nav-contact-link` | 12.0px | `#0284c7` | `#73b4d7` | **1.80:1** | 4.5:1 |
| `project.html?p=split-step-schrodinger` | `proj-math` | `project:split-step-schrodinger:math` | `light` | `.snap-pager .snap-dot.active .dot-text` | 11.0px | `#0284c7` | `#263239` | **3.21:1** | 4.5:1 |
| `project.html?p=split-step-schrodinger` | `proj-math` | `project:split-step-schrodinger:math` | `light` | `.snap-pager .snap-dot:not(.active) .dot-text` | 11.0px | `#475569` | `#263239` | **1.73:1** | 4.5:1 |
| `project.html?p=split-step-schrodinger` | `proj-math` | `project:split-step-schrodinger:math` | `light` | `.eyebrow` | 12.0px | `#0284c7` | `#768289` | **1.04:1** | 4.5:1 |
| `project.html?p=split-step-schrodinger` | `proj-math` | `project:split-step-schrodinger:math` | `light` | `.sim-tag` | 11.0px | `#475569` | `#2e363b` | **1.62:1** | 4.5:1 |
| `project.html?p=regularised-regression` | `proj-hero` | `project:regularised-regression:hero` | `dark` | `.nav .nav-contact-link` | 12.0px | `#f59e0b` | `#885b13` | **2.75:1** | 4.5:1 |
| `project.html?p=regularised-regression` | `proj-hero` | `project:regularised-regression:hero` | `dark` | `h1 (gradient stop 2 rgba(--a,0.85))` | 112.0px | `#de9415` | `#5d594b` | **2.79:1** | 3.0:1 |
| `project.html?p=regularised-regression` | `proj-hero` | `project:regularised-regression:hero` | `dark` | `.pill:not(.snap-cta-btn)` | 12.0px | `#f59e0b` | `#694710` | **3.90:1** | 4.5:1 |
| `project.html?p=regularised-regression` | `proj-arch` | `project:regularised-regression:arch` | `dark` | `.nav .nav-contact-link` | 12.0px | `#f59e0b` | `#885b13` | **2.75:1** | 4.5:1 |
| `project.html?p=regularised-regression` | `proj-math` | `project:regularised-regression:math` | `dark` | `.nav .nav-contact-link` | 12.0px | `#f59e0b` | `#885b13` | **2.75:1** | 4.5:1 |
| `project.html?p=regularised-regression` | `proj-hero` | `project:regularised-regression:hero` | `light` | `.nav .nav-contact-link` | 12.0px | `#b45309` | `#cf9e79` | **2.11:1** | 4.5:1 |
| `project.html?p=regularised-regression` | `proj-hero` | `project:regularised-regression:hero` | `light` | `.snap-pager .snap-dot.active .dot-text` | 11.0px | `#b45309` | `#514b4d` | **1.70:1** | 4.5:1 |
| `project.html?p=regularised-regression` | `proj-hero` | `project:regularised-regression:hero` | `light` | `.snap-pager .snap-dot:not(.active) .dot-text` | 11.0px | `#475569` | `#544c4e` | **1.10:1** | 4.5:1 |
| `project.html?p=regularised-regression` | `proj-hero` | `project:regularised-regression:hero` | `light` | `.crumbs` | 12.0px | `#475569` | `#948e8e` | **2.35:1** | 4.5:1 |
| `project.html?p=regularised-regression` | `proj-hero` | `project:regularised-regression:hero` | `light` | `.crumbs a` | 12.0px | `#b45309` | `#dcdee3` | **3.73:1** | 4.5:1 |
| `project.html?p=regularised-regression` | `proj-hero` | `project:regularised-regression:hero` | `light` | `h1 (gradient stop 2 rgba(--a,0.85))` | 112.0px | `#b25f20` | `#a8a1a2` | **1.82:1** | 3.0:1 |
| `project.html?p=regularised-regression` | `proj-hero` | `project:regularised-regression:hero` | `light` | `.pill:not(.snap-cta-btn)` | 12.0px | `#b45309` | `#cda78d` | **2.27:1** | 4.5:1 |
| `project.html?p=regularised-regression` | `proj-hero` | `project:regularised-regression:hero` | `light` | `.sim-tag` | 11.0px | `#475569` | `#606068` | **1.22:1** | 4.5:1 |
| `project.html?p=regularised-regression` | `proj-arch` | `project:regularised-regression:arch` | `light` | `.nav .nav-contact-link` | 12.0px | `#b45309` | `#cf9e7a` | **2.11:1** | 4.5:1 |
| `project.html?p=regularised-regression` | `proj-arch` | `project:regularised-regression:arch` | `light` | `.snap-pager .snap-dot.active .dot-text` | 11.0px | `#b2530a` | `#554d50` | **1.61:1** | 4.5:1 |
| `project.html?p=regularised-regression` | `proj-arch` | `project:regularised-regression:arch` | `light` | `.snap-pager .snap-dot:not(.active) .dot-text` | 11.0px | `#475569` | `#514a4c` | **1.14:1** | 4.5:1 |
| `project.html?p=regularised-regression` | `proj-arch` | `project:regularised-regression:arch` | `light` | `.eyebrow` | 12.0px | `#b45309` | `#b1aaaa` | **2.20:1** | 4.5:1 |
| `project.html?p=regularised-regression` | `proj-arch` | `project:regularised-regression:arch` | `light` | `.sim-tag` | 11.0px | `#475569` | `#606067` | **1.21:1** | 4.5:1 |
| `project.html?p=regularised-regression` | `proj-math` | `project:regularised-regression:math` | `light` | `.nav .nav-contact-link` | 12.0px | `#b45309` | `#cf9e7a` | **2.11:1** | 4.5:1 |
| `project.html?p=regularised-regression` | `proj-math` | `project:regularised-regression:math` | `light` | `.snap-pager .snap-dot.active .dot-text` | 11.0px | `#b0530c` | `#544e50` | **1.58:1** | 4.5:1 |
| `project.html?p=regularised-regression` | `proj-math` | `project:regularised-regression:math` | `light` | `.snap-pager .snap-dot:not(.active) .dot-text` | 11.0px | `#475569` | `#514a4d` | **1.14:1** | 4.5:1 |
| `project.html?p=regularised-regression` | `proj-math` | `project:regularised-regression:math` | `light` | `.eyebrow` | 12.0px | `#b45309` | `#857c7c` | **1.24:1** | 4.5:1 |
| `project.html?p=regularised-regression` | `proj-math` | `project:regularised-regression:math` | `light` | `.sim-tag` | 11.0px | `#475569` | `#5f6068` | **1.21:1** | 4.5:1 |
| `project.html?p=spectral-clustering` | `proj-hero` | `project:spectral-clustering:hero` | `dark` | `.nav .nav-contact-link` | 12.0px | `#f59e0b` | `#875a12` | **2.79:1** | 4.5:1 |
| `project.html?p=spectral-clustering` | `proj-hero` | `project:spectral-clustering:hero` | `dark` | `.pill:not(.snap-cta-btn)` | 12.0px | `#f59e0b` | `#68450d` | **4.00:1** | 4.5:1 |
| `project.html?p=spectral-clustering` | `proj-arch` | `project:spectral-clustering:arch` | `dark` | `.nav .nav-contact-link` | 12.0px | `#f59e0b` | `#875a12` | **2.79:1** | 4.5:1 |
| `project.html?p=spectral-clustering` | `proj-math` | `project:spectral-clustering:math` | `dark` | `.nav .nav-contact-link` | 12.0px | `#f59e0b` | `#875a12` | **2.79:1** | 4.5:1 |
| `project.html?p=spectral-clustering` | `proj-hero` | `project:spectral-clustering:hero` | `light` | `.nav .nav-contact-link` | 12.0px | `#b45309` | `#ce9d79` | **2.09:1** | 4.5:1 |
| `project.html?p=spectral-clustering` | `proj-hero` | `project:spectral-clustering:hero` | `light` | `.snap-pager .snap-dot.active .dot-text` | 11.0px | `#b45309` | `#4a413f` | **1.97:1** | 4.5:1 |
| `project.html?p=spectral-clustering` | `proj-hero` | `project:spectral-clustering:hero` | `light` | `.snap-pager .snap-dot:not(.active) .dot-text` | 11.0px | `#475569` | `#4b413f` | **1.30:1** | 4.5:1 |
| `project.html?p=spectral-clustering` | `proj-hero` | `project:spectral-clustering:hero` | `light` | `.crumbs` | 12.0px | `#475569` | `#908684` | **2.14:1** | 4.5:1 |
| `project.html?p=spectral-clustering` | `proj-hero` | `project:spectral-clustering:hero` | `light` | `.crumbs a` | 12.0px | `#b45309` | `#dbdadf` | **3.61:1** | 4.5:1 |
| `project.html?p=spectral-clustering` | `proj-hero` | `project:spectral-clustering:hero` | `light` | `h1 (gradient stop 2 rgba(--a,0.85))` | 112.0px | `#b05c1d` | `#9b928f` | **1.57:1** | 3.0:1 |
| `project.html?p=spectral-clustering` | `proj-hero` | `project:spectral-clustering:hero` | `light` | `.tag` | 11.0px | `#475569` | `#c5c7cd` | **4.48:1** | 4.5:1 |
| `project.html?p=spectral-clustering` | `proj-hero` | `project:spectral-clustering:hero` | `light` | `.pill:not(.snap-cta-btn)` | 12.0px | `#b45309` | `#cca58a` | **2.23:1** | 4.5:1 |
| `project.html?p=spectral-clustering` | `proj-hero` | `project:spectral-clustering:hero` | `light` | `.sim-tag` | 11.0px | `#475569` | `#4d4646` | **1.22:1** | 4.5:1 |
| `project.html?p=spectral-clustering` | `proj-arch` | `project:spectral-clustering:arch` | `light` | `.nav .nav-contact-link` | 12.0px | `#b45309` | `#ce9d79` | **2.09:1** | 4.5:1 |
| `project.html?p=spectral-clustering` | `proj-arch` | `project:spectral-clustering:arch` | `light` | `.snap-pager .snap-dot.active .dot-text` | 11.0px | `#b2530a` | `#4b423e` | **1.92:1** | 4.5:1 |
| `project.html?p=spectral-clustering` | `proj-arch` | `project:spectral-clustering:arch` | `light` | `.snap-pager .snap-dot:not(.active) .dot-text` | 11.0px | `#475568` | `#4a413e` | **1.31:1** | 4.5:1 |
| `project.html?p=spectral-clustering` | `proj-arch` | `project:spectral-clustering:arch` | `light` | `.eyebrow` | 12.0px | `#b45309` | `#a49e9d` | **1.90:1** | 4.5:1 |
| `project.html?p=spectral-clustering` | `proj-arch` | `project:spectral-clustering:arch` | `light` | `.sim-tag` | 11.0px | `#475569` | `#4c4745` | **1.21:1** | 4.5:1 |
| `project.html?p=spectral-clustering` | `proj-math` | `project:spectral-clustering:math` | `light` | `.nav .nav-contact-link` | 12.0px | `#b45309` | `#ce9d79` | **2.09:1** | 4.5:1 |
| `project.html?p=spectral-clustering` | `proj-math` | `project:spectral-clustering:math` | `light` | `.snap-pager .snap-dot.active .dot-text` | 11.0px | `#b0520c` | `#4a413f` | **1.92:1** | 4.5:1 |
| `project.html?p=spectral-clustering` | `proj-math` | `project:spectral-clustering:math` | `light` | `.snap-pager .snap-dot:not(.active) .dot-text` | 11.0px | `#475569` | `#4a413e` | **1.31:1** | 4.5:1 |
| `project.html?p=spectral-clustering` | `proj-math` | `project:spectral-clustering:math` | `light` | `.eyebrow` | 12.0px | `#b45309` | `#8c827e` | **1.34:1** | 4.5:1 |
| `project.html?p=spectral-clustering` | `proj-math` | `project:spectral-clustering:math` | `light` | `.sim-tag` | 11.0px | `#475569` | `#4c4646` | **1.22:1** | 4.5:1 |
| `project.html?p=options-pricing` | `proj-hero` | `project:options-pricing:hero` | `dark` | `.nav .nav-contact-link` | 12.0px | `#10b981` | `#10694f` | **2.62:1** | 4.5:1 |
| `project.html?p=options-pricing` | `proj-hero` | `project:options-pricing:hero` | `dark` | `.snap-pager .snap-dot.active .dot-text` | 11.0px | `#10b981` | `#3f4545` | **3.85:1** | 4.5:1 |
| `project.html?p=options-pricing` | `proj-hero` | `project:options-pricing:hero` | `dark` | `h1 (gradient stop 2 rgba(--a,0.85))` | 112.0px | `#1bb07f` | `#587b74` | **1.68:1** | 3.0:1 |
| `project.html?p=options-pricing` | `proj-arch` | `project:options-pricing:arch` | `dark` | `.nav .nav-contact-link` | 12.0px | `#10b981` | `#10694f` | **2.62:1** | 4.5:1 |
| `project.html?p=options-pricing` | `proj-arch` | `project:options-pricing:arch` | `dark` | `.snap-pager .snap-dot.active .dot-text` | 11.0px | `#10b981` | `#77868c` | **1.49:1** | 4.5:1 |
| `project.html?p=options-pricing` | `proj-arch` | `project:options-pricing:arch` | `dark` | `.eyebrow` | 12.0px | `#10b981` | `#4b6251` | **2.62:1** | 4.5:1 |
| `project.html?p=options-pricing` | `proj-math` | `project:options-pricing:math` | `dark` | `.nav .nav-contact-link` | 12.0px | `#10b981` | `#10694f` | **2.62:1** | 4.5:1 |
| `project.html?p=options-pricing` | `proj-math` | `project:options-pricing:math` | `dark` | `.snap-pager .snap-dot.active .dot-text` | 11.0px | `#10b981` | `#364548` | **3.94:1** | 4.5:1 |
| `project.html?p=options-pricing` | `proj-math` | `project:options-pricing:math` | `dark` | `.eyebrow` | 12.0px | `#10b981` | `#2b4637` | **4.07:1** | 4.5:1 |
| `project.html?p=options-pricing` | `proj-hero` | `project:options-pricing:hero` | `light` | `.nav .brand b` | 14.0px | `#059669` | `#fafafb` | **3.61:1** | 4.5:1 |
| `project.html?p=options-pricing` | `proj-hero` | `project:options-pricing:hero` | `light` | `.nav .nav-contact-link` | 12.0px | `#059669` | `#75bfa9` | **1.76:1** | 4.5:1 |
| `project.html?p=options-pricing` | `proj-hero` | `project:options-pricing:hero` | `light` | `.snap-pager .snap-dot.active .dot-text` | 11.0px | `#059669` | `#4a5556` | **2.05:1** | 4.5:1 |
| `project.html?p=options-pricing` | `proj-hero` | `project:options-pricing:hero` | `light` | `.snap-pager .snap-dot:not(.active) .dot-text` | 11.0px | `#475569` | `#555e5d` | **1.13:1** | 4.5:1 |
| `project.html?p=options-pricing` | `proj-hero` | `project:options-pricing:hero` | `light` | `.crumbs` | 12.0px | `#475569` | `#889998` | **2.55:1** | 4.5:1 |
| `project.html?p=options-pricing` | `proj-hero` | `project:options-pricing:hero` | `light` | `.crumbs a` | 12.0px | `#059669` | `#dadbe0` | **2.73:1** | 4.5:1 |
| `project.html?p=options-pricing` | `proj-hero` | `project:options-pricing:hero` | `light` | `h1 (gradient stop 2 rgba(--a,0.85))` | 112.0px | `#1f9b75` | `#b5bab6` | **1.78:1** | 3.0:1 |
| `project.html?p=options-pricing` | `proj-hero` | `project:options-pricing:hero` | `light` | `.tag` | 11.0px | `#475569` | `#c2c7cc` | **4.45:1** | 4.5:1 |
| `project.html?p=options-pricing` | `proj-hero` | `project:options-pricing:hero` | `light` | `.pill:not(.snap-cta-btn)` | 12.0px | `#059669` | `#d1d3d7` | **2.51:1** | 4.5:1 |
| `project.html?p=options-pricing` | `proj-hero` | `project:options-pricing:hero` | `light` | `.sim-tag` | 11.0px | `#475569` | `#3e4c4f` | **1.18:1** | 4.5:1 |
| `project.html?p=options-pricing` | `proj-arch` | `project:options-pricing:arch` | `light` | `.nav .brand b` | 14.0px | `#059669` | `#fafafb` | **3.61:1** | 4.5:1 |
| `project.html?p=options-pricing` | `proj-arch` | `project:options-pricing:arch` | `light` | `.nav .nav-contact-link` | 12.0px | `#059669` | `#75bfa9` | **1.76:1** | 4.5:1 |
| `project.html?p=options-pricing` | `proj-arch` | `project:options-pricing:arch` | `light` | `.snap-pager .snap-dot.active .dot-text` | 11.0px | `#069569` | `#555e5b` | **1.76:1** | 4.5:1 |
| `project.html?p=options-pricing` | `proj-arch` | `project:options-pricing:arch` | `light` | `.snap-pager .snap-dot:not(.active) .dot-text` | 11.0px | `#475569` | `#475354` | **1.05:1** | 4.5:1 |
| `project.html?p=options-pricing` | `proj-arch` | `project:options-pricing:arch` | `light` | `.eyebrow` | 12.0px | `#059669` | `#94a1a0` | **1.41:1** | 4.5:1 |
| `project.html?p=options-pricing` | `proj-arch` | `project:options-pricing:arch` | `light` | `.sim-tag` | 11.0px | `#475569` | `#3f4c4f` | **1.18:1** | 4.5:1 |
| `project.html?p=options-pricing` | `proj-math` | `project:options-pricing:math` | `light` | `.nav .brand b` | 14.0px | `#059669` | `#fafafb` | **3.61:1** | 4.5:1 |
| `project.html?p=options-pricing` | `proj-math` | `project:options-pricing:math` | `light` | `.nav .nav-contact-link` | 12.0px | `#059669` | `#75bfa9` | **1.76:1** | 4.5:1 |
| `project.html?p=options-pricing` | `proj-math` | `project:options-pricing:math` | `light` | `.snap-pager .snap-dot.active .dot-text` | 11.0px | `#069569` | `#475555` | **2.04:1** | 4.5:1 |
| `project.html?p=options-pricing` | `proj-math` | `project:options-pricing:math` | `light` | `.snap-pager .snap-dot:not(.active) .dot-text` | 11.0px | `#475569` | `#455254` | **1.07:1** | 4.5:1 |
| `project.html?p=options-pricing` | `proj-math` | `project:options-pricing:math` | `light` | `.eyebrow` | 12.0px | `#059669` | `#7a8c8c` | **1.07:1** | 4.5:1 |
| `project.html?p=options-pricing` | `proj-math` | `project:options-pricing:math` | `light` | `.sim-tag` | 11.0px | `#475569` | `#3e4d4e` | **1.17:1** | 4.5:1 |
| `project.html?p=stat-arb` | `proj-hero` | `project:stat-arb:hero` | `dark` | `.nav .nav-contact-link` | 12.0px | `#10b981` | `#0e674d` | **2.70:1** | 4.5:1 |
| `project.html?p=stat-arb` | `proj-hero` | `project:stat-arb:hero` | `dark` | `.pill:not(.snap-cta-btn)` | 12.0px | `#10b981` | `#0a4f3b` | **3.77:1** | 4.5:1 |
| `project.html?p=stat-arb` | `proj-arch` | `project:stat-arb:arch` | `dark` | `.nav .nav-contact-link` | 12.0px | `#10b981` | `#0e674d` | **2.70:1** | 4.5:1 |
| `project.html?p=stat-arb` | `proj-math` | `project:stat-arb:math` | `dark` | `.nav .nav-contact-link` | 12.0px | `#10b981` | `#0e674c` | **2.70:1** | 4.5:1 |
| `project.html?p=stat-arb` | `proj-hero` | `project:stat-arb:hero` | `light` | `.nav .brand b` | 14.0px | `#059669` | `#fefeff` | **3.74:1** | 4.5:1 |
| `project.html?p=stat-arb` | `proj-hero` | `project:stat-arb:hero` | `light` | `.nav .nav-contact-link` | 12.0px | `#059669` | `#80cab4` | **1.98:1** | 4.5:1 |
| `project.html?p=stat-arb` | `proj-hero` | `project:stat-arb:hero` | `light` | `.snap-pager .snap-dot.active .dot-text` | 11.0px | `#059669` | `#e0e2e4` | **2.90:1** | 4.5:1 |
| `project.html?p=stat-arb` | `proj-hero` | `project:stat-arb:hero` | `light` | `.crumbs a` | 12.0px | `#059669` | `#f5f6fb` | **3.49:1** | 4.5:1 |
| `project.html?p=stat-arb` | `proj-hero` | `project:stat-arb:hero` | `light` | `h1 (gradient stop 2 rgba(--a,0.85))` | 112.0px | `#25a37c` | `#daecea` | **2.60:1** | 3.0:1 |
| `project.html?p=stat-arb` | `proj-hero` | `project:stat-arb:hero` | `light` | `.pill:not(.snap-cta-btn)` | 12.0px | `#059669` | `#96d0c1` | **2.17:1** | 4.5:1 |
| `project.html?p=stat-arb` | `proj-arch` | `project:stat-arb:arch` | `light` | `.nav .brand b` | 14.0px | `#059669` | `#fefeff` | **3.74:1** | 4.5:1 |
| `project.html?p=stat-arb` | `proj-arch` | `project:stat-arb:arch` | `light` | `.nav .nav-contact-link` | 12.0px | `#059669` | `#80cab4` | **1.98:1** | 4.5:1 |
| `project.html?p=stat-arb` | `proj-arch` | `project:stat-arb:arch` | `light` | `.snap-pager .snap-dot.active .dot-text` | 11.0px | `#0d976d` | `#e0e2e4` | **2.85:1** | 4.5:1 |
| `project.html?p=stat-arb` | `proj-arch` | `project:stat-arb:arch` | `light` | `.eyebrow` | 12.0px | `#059669` | `#ddedeb` | **3.12:1** | 4.5:1 |
| `project.html?p=stat-arb` | `proj-math` | `project:stat-arb:math` | `light` | `.nav .brand b` | 14.0px | `#059669` | `#fefeff` | **3.74:1** | 4.5:1 |
| `project.html?p=stat-arb` | `proj-math` | `project:stat-arb:math` | `light` | `.nav .nav-contact-link` | 12.0px | `#059669` | `#80cab4` | **1.98:1** | 4.5:1 |
| `project.html?p=stat-arb` | `proj-math` | `project:stat-arb:math` | `light` | `.snap-pager .snap-dot.active .dot-text` | 11.0px | `#09976b` | `#e0e2e4` | **2.86:1** | 4.5:1 |
| `project.html?p=stat-arb` | `proj-math` | `project:stat-arb:math` | `light` | `.eyebrow` | 12.0px | `#059669` | `#d9eae9` | **3.03:1** | 4.5:1 |
| `project.html?p=ku-lang` | `proj-hero` | `project:ku-lang:hero` | `dark` | `.nav .nav-contact-link` | 12.0px | `#8b5cf6` | `#131222` | **4.36:1** | 4.5:1 |
| `project.html?p=ku-lang` | `proj-hero` | `project:ku-lang:hero` | `dark` | `.snap-pager .snap-dot.active .dot-text` | 11.0px | `#8b5cf6` | `#10121b` | **4.41:1** | 4.5:1 |
| `project.html?p=ku-lang` | `proj-arch` | `project:ku-lang:arch` | `dark` | `.nav .nav-contact-link` | 12.0px | `#8b5cf6` | `#131222` | **4.36:1** | 4.5:1 |
| `project.html?p=ku-lang` | `proj-arch` | `project:ku-lang:arch` | `dark` | `.snap-pager .snap-dot.active .dot-text` | 11.0px | `#8b5cf6` | `#10121b` | **4.41:1** | 4.5:1 |
| `project.html?p=ku-lang` | `proj-math` | `project:ku-lang:math` | `dark` | `.nav .nav-contact-link` | 12.0px | `#8b5cf6` | `#131221` | **4.37:1** | 4.5:1 |
| `project.html?p=ku-lang` | `proj-math` | `project:ku-lang:math` | `dark` | `.snap-pager .snap-dot.active .dot-text` | 11.0px | `#8b5cf6` | `#10121b` | **4.41:1** | 4.5:1 |
| `project.html?p=ku-lang` | `proj-hero` | `project:ku-lang:hero` | `light` | `.nav .nav-contact-link` | 12.0px | `#6d28d9` | `#b593ec` | **2.82:1** | 4.5:1 |
| `project.html?p=ku-lang` | `proj-arch` | `project:ku-lang:arch` | `light` | `.nav .nav-contact-link` | 12.0px | `#6d28d9` | `#b593ec` | **2.82:1** | 4.5:1 |
| `project.html?p=ku-lang` | `proj-math` | `project:ku-lang:math` | `light` | `.nav .nav-contact-link` | 12.0px | `#6d28d9` | `#b593ec` | **2.82:1** | 4.5:1 |
| `project.html?p=8bit-computer` | `proj-hero` | `project:8bit-computer:hero` | `dark` | `.nav .nav-contact-link` | 12.0px | `#8b5cf6` | `#131222` | **4.36:1** | 4.5:1 |
| `project.html?p=8bit-computer` | `proj-hero` | `project:8bit-computer:hero` | `dark` | `.snap-pager .snap-dot.active .dot-text` | 11.0px | `#8b5cf6` | `#10121b` | **4.41:1** | 4.5:1 |
| `project.html?p=8bit-computer` | `proj-arch` | `project:8bit-computer:arch` | `dark` | `.nav .nav-contact-link` | 12.0px | `#8b5cf6` | `#131222` | **4.36:1** | 4.5:1 |
| `project.html?p=8bit-computer` | `proj-arch` | `project:8bit-computer:arch` | `dark` | `.snap-pager .snap-dot.active .dot-text` | 11.0px | `#8b5cf6` | `#10121b` | **4.41:1** | 4.5:1 |
| `project.html?p=8bit-computer` | `proj-math` | `project:8bit-computer:math` | `dark` | `.nav .nav-contact-link` | 12.0px | `#8b5cf6` | `#131222` | **4.36:1** | 4.5:1 |
| `project.html?p=8bit-computer` | `proj-math` | `project:8bit-computer:math` | `dark` | `.snap-pager .snap-dot.active .dot-text` | 11.0px | `#8b5cf6` | `#10121b` | **4.41:1** | 4.5:1 |
| `project.html?p=8bit-computer` | `proj-hero` | `project:8bit-computer:hero` | `light` | `.nav .nav-contact-link` | 12.0px | `#6d28d9` | `#b593ec` | **2.82:1** | 4.5:1 |
| `project.html?p=8bit-computer` | `proj-hero` | `project:8bit-computer:hero` | `light` | `.pill:not(.snap-cta-btn)` | 12.0px | `#6d28d9` | `#bfa4ee` | **3.30:1** | 4.5:1 |
| `project.html?p=8bit-computer` | `proj-arch` | `project:8bit-computer:arch` | `light` | `.nav .nav-contact-link` | 12.0px | `#6d28d9` | `#b593ec` | **2.82:1** | 4.5:1 |
| `project.html?p=8bit-computer` | `proj-math` | `project:8bit-computer:math` | `light` | `.nav .nav-contact-link` | 12.0px | `#6d28d9` | `#b593ec` | **2.82:1** | 4.5:1 |
| `paper.html?p=langevin-loss-landscapes` | `paper-hero` | `paper:langevin-loss-landscapes:hero` | `dark` | `.nav .nav-domain-pill` | 11.0px | `#a3e635` | `#4e6d23` | **3.94:1** | 4.5:1 |
| `paper.html?p=langevin-loss-landscapes` | `paper-hero` | `paper:langevin-loss-landscapes:hero` | `dark` | `.nav .nav-contact-link` | 12.0px | `#a3e635` | `#5d8127` | **3.00:1** | 4.5:1 |
| `paper.html?p=langevin-loss-landscapes` | `paper-hero` | `paper:langevin-loss-landscapes:hero` | `dark` | `.paper-domain-tag` | 10.0px | `#f59e0b` | `#7c5712` | **3.03:1** | 4.5:1 |
| `paper.html?p=langevin-loss-landscapes` | `paper-hero` | `paper:langevin-loss-landscapes:hero` | `dark` | `.tag-status` | 10.0px | `#8a90a2` | `#2d3620` | **3.97:1** | 4.5:1 |
| `paper.html?p=langevin-loss-landscapes` | `paper-hero` | `paper:langevin-loss-landscapes:hero` | `dark` | `.pill:not(.snap-cta-btn)` | 12.0px | `#a3e635` | `#517026` | **3.77:1** | 4.5:1 |
| `paper.html?p=langevin-loss-landscapes` | `paper-theory` | `paper:langevin-loss-landscapes:theory` | `dark` | `.nav .nav-domain-pill` | 11.0px | `#a3e635` | `#4d6b21` | **4.05:1** | 4.5:1 |
| `paper.html?p=langevin-loss-landscapes` | `paper-theory` | `paper:langevin-loss-landscapes:theory` | `dark` | `.nav .nav-contact-link` | 12.0px | `#a3e635` | `#5b7f24` | **3.09:1** | 4.5:1 |
| `paper.html?p=langevin-loss-landscapes` | `paper-cite` | `paper:langevin-loss-landscapes:cite` | `dark` | `.nav .nav-domain-pill` | 11.0px | `#a3e635` | `#4d6b21` | **4.05:1** | 4.5:1 |
| `paper.html?p=langevin-loss-landscapes` | `paper-cite` | `paper:langevin-loss-landscapes:cite` | `dark` | `.nav .nav-contact-link` | 12.0px | `#a3e635` | `#5b7e24` | **3.13:1** | 4.5:1 |
| `paper.html?p=langevin-loss-landscapes` | `paper-cite` | `paper:langevin-loss-landscapes:cite` | `dark` | `.pill:not(.snap-cta-btn)` | 12.0px | `#a3e635` | `#496421` | **4.45:1** | 4.5:1 |
| `paper.html?p=langevin-loss-landscapes` | `paper-hero` | `paper:langevin-loss-landscapes:hero` | `light` | `.nav .brand b` | 14.0px | `#65a30d` | `#fafbfb` | **2.98:1** | 4.5:1 |
| `paper.html?p=langevin-loss-landscapes` | `paper-hero` | `paper:langevin-loss-landscapes:hero` | `light` | `.nav .nav-domain-pill` | 11.0px | `#65a30d` | `#b9d495` | **1.90:1** | 4.5:1 |
| `paper.html?p=langevin-loss-landscapes` | `paper-hero` | `paper:langevin-loss-landscapes:hero` | `light` | `.nav .nav-contact-link` | 12.0px | `#65a30d` | `#a6c67a` | **1.62:1** | 4.5:1 |
| `paper.html?p=langevin-loss-landscapes` | `paper-hero` | `paper:langevin-loss-landscapes:hero` | `light` | `.snap-pager .snap-dot.active .dot-text` | 11.0px | `#65a30d` | `#424b40` | **2.94:1** | 4.5:1 |
| `paper.html?p=langevin-loss-landscapes` | `paper-hero` | `paper:langevin-loss-landscapes:hero` | `light` | `.snap-pager .snap-dot:not(.active) .dot-text` | 11.0px | `#475569` | `#454f42` | **1.13:1** | 4.5:1 |
| `paper.html?p=langevin-loss-landscapes` | `paper-hero` | `paper:langevin-loss-landscapes:hero` | `light` | `.crumbs` | 12.0px | `#475569` | `#7c8976` | **2.06:1** | 4.5:1 |
| `paper.html?p=langevin-loss-landscapes` | `paper-hero` | `paper:langevin-loss-landscapes:hero` | `light` | `.crumbs a` | 12.0px | `#65a30d` | `#dcdce1` | **2.26:1** | 4.5:1 |
| `paper.html?p=langevin-loss-landscapes` | `paper-hero` | `paper:langevin-loss-landscapes:hero` | `light` | `.eyebrow` | 12.0px | `#65a30d` | `#849576` | **1.04:1** | 4.5:1 |
| `paper.html?p=langevin-loss-landscapes` | `paper-hero` | `paper:langevin-loss-landscapes:hero` | `light` | `.paper-domain-tag` | 10.0px | `#b45309` | `#c19675` | **1.89:1** | 4.5:1 |
| `paper.html?p=langevin-loss-landscapes` | `paper-hero` | `paper:langevin-loss-landscapes:hero` | `light` | `h1 (gradient stop 2 rgba(--a,0.85))` | 42.0px | `#6ca41d` | `#94a977` | **1.18:1** | 3.0:1 |
| `paper.html?p=langevin-loss-landscapes` | `paper-hero` | `paper:langevin-loss-landscapes:hero` | `light` | `.tag-status` | 10.0px | `#475569` | `#bec7b5` | **4.34:1** | 4.5:1 |
| `paper.html?p=langevin-loss-landscapes` | `paper-hero` | `paper:langevin-loss-landscapes:hero` | `light` | `.snap-cta-btn` | 13.0px | `#65a30d` | `#afbeaa` | **1.58:1** | 4.5:1 |
| `paper.html?p=langevin-loss-landscapes` | `paper-hero` | `paper:langevin-loss-landscapes:hero` | `light` | `.pill:not(.snap-cta-btn)` | 12.0px | `#65a30d` | `#93b172` | **1.29:1** | 4.5:1 |
| `paper.html?p=langevin-loss-landscapes` | `paper-hero` | `paper:langevin-loss-landscapes:hero` | `light` | `.paper-section-tag` | 10.5px | `#65a30d` | `#f1f4ec` | **2.78:1** | 4.5:1 |
| `paper.html?p=langevin-loss-landscapes` | `paper-hero` | `paper:langevin-loss-landscapes:hero` | `light` | `.paper-meta` | 12.0px | `#475569` | `#a0b67a` | **3.42:1** | 4.5:1 |
| `paper.html?p=langevin-loss-landscapes` | `paper-hero` | `paper:langevin-loss-landscapes:hero` | `light` | `.paper-meta .venue` | 12.0px | `#65a30d` | `#d1d3d7` | **2.06:1** | 4.5:1 |
| `paper.html?p=langevin-loss-landscapes` | `paper-hero` | `paper:langevin-loss-landscapes:hero` | `light` | `.sim-tag` | 11.0px | `#475569` | `#474f48` | **1.12:1** | 4.5:1 |
| `paper.html?p=langevin-loss-landscapes` | `paper-theory` | `paper:langevin-loss-landscapes:theory` | `light` | `.nav .brand b` | 14.0px | `#65a30d` | `#fefeff` | **3.06:1** | 4.5:1 |
| `paper.html?p=langevin-loss-landscapes` | `paper-theory` | `paper:langevin-loss-landscapes:theory` | `light` | `.nav .nav-domain-pill` | 11.0px | `#65a30d` | `#bcd798` | **1.96:1** | 4.5:1 |
| `paper.html?p=langevin-loss-landscapes` | `paper-theory` | `paper:langevin-loss-landscapes:theory` | `light` | `.nav .nav-contact-link` | 12.0px | `#65a30d` | `#b1d185` | **1.81:1** | 4.5:1 |
| `paper.html?p=langevin-loss-landscapes` | `paper-theory` | `paper:langevin-loss-landscapes:theory` | `light` | `.snap-pager .snap-dot.active .dot-text` | 11.0px | `#69a414` | `#e1e2e3` | **2.34:1** | 4.5:1 |
| `paper.html?p=langevin-loss-landscapes` | `paper-theory` | `paper:langevin-loss-landscapes:theory` | `light` | `.eyebrow` | 12.0px | `#65a30d` | `#c5dbab` | **2.07:1** | 4.5:1 |
| `paper.html?p=langevin-loss-landscapes` | `paper-theory` | `paper:langevin-loss-landscapes:theory` | `light` | `.paper-section-tag` | 10.5px | `#65a30d` | `#f9fbf7` | **2.97:1** | 4.5:1 |
| `paper.html?p=langevin-loss-landscapes` | `paper-cite` | `paper:langevin-loss-landscapes:cite` | `light` | `.nav .brand b` | 14.0px | `#65a30d` | `#fefeff` | **3.06:1** | 4.5:1 |
| `paper.html?p=langevin-loss-landscapes` | `paper-cite` | `paper:langevin-loss-landscapes:cite` | `light` | `.nav .nav-domain-pill` | 11.0px | `#65a30d` | `#bcd798` | **1.96:1** | 4.5:1 |
| `paper.html?p=langevin-loss-landscapes` | `paper-cite` | `paper:langevin-loss-landscapes:cite` | `light` | `.nav .nav-contact-link` | 12.0px | `#65a30d` | `#b1d185` | **1.81:1** | 4.5:1 |
| `paper.html?p=langevin-loss-landscapes` | `paper-cite` | `paper:langevin-loss-landscapes:cite` | `light` | `.snap-pager .snap-dot.active .dot-text` | 11.0px | `#6ea71d` | `#e1e2e3` | **2.25:1** | 4.5:1 |
| `paper.html?p=langevin-loss-landscapes` | `paper-cite` | `paper:langevin-loss-landscapes:cite` | `light` | `.section-head .idx` | 12.0px | `#65a30d` | `#f5f6fb` | **2.86:1** | 4.5:1 |
| `paper.html?p=langevin-loss-landscapes` | `paper-cite` | `paper:langevin-loss-landscapes:cite` | `light` | `.snap-cta-btn` | 13.0px | `#65a30d` | `#f3f5f3` | **2.82:1** | 4.5:1 |
| `paper.html?p=langevin-loss-landscapes` | `paper-cite` | `paper:langevin-loss-landscapes:cite` | `light` | `.pill:not(.snap-cta-btn)` | 12.0px | `#65a30d` | `#c1d99e` | **2.01:1** | 4.5:1 |
| `paper.html?p=langevin-loss-landscapes` | `paper-cite` | `paper:langevin-loss-landscapes:cite` | `light` | `.card .go` | 12.0px | `#65a30d` | `#ffffff` | **3.09:1** | 4.5:1 |
| `paper.html?p=langevin-loss-landscapes` | `paper-cite` | `paper:langevin-loss-landscapes:cite` | `light` | `.contact-status` | 12.0px | `#65a30d` | `#eef4e5` | **2.75:1** | 4.5:1 |
| `paper.html?p=hft-stat-arb-microstructure` | `paper-hero` | `paper:hft-stat-arb-microstructure:hero` | `dark` | `.nav .nav-domain-pill` | 11.0px | `#a3e635` | `#4d6b21` | **4.05:1** | 4.5:1 |
| `paper.html?p=hft-stat-arb-microstructure` | `paper-hero` | `paper:hft-stat-arb-microstructure:hero` | `dark` | `.nav .nav-contact-link` | 12.0px | `#a3e635` | `#5b7f24` | **3.09:1** | 4.5:1 |
| `paper.html?p=hft-stat-arb-microstructure` | `paper-hero` | `paper:hft-stat-arb-microstructure:hero` | `dark` | `.paper-domain-tag` | 10.0px | `#10b981` | `#0c5b41` | **3.20:1** | 4.5:1 |
| `paper.html?p=hft-stat-arb-microstructure` | `paper-hero` | `paper:hft-stat-arb-microstructure:hero` | `dark` | `.pill:not(.snap-cta-btn)` | 12.0px | `#a3e635` | `#4a671e` | **4.29:1** | 4.5:1 |
| `paper.html?p=hft-stat-arb-microstructure` | `paper-theory` | `paper:hft-stat-arb-microstructure:theory` | `dark` | `.nav .nav-domain-pill` | 11.0px | `#a3e635` | `#4d6b21` | **4.05:1** | 4.5:1 |
| `paper.html?p=hft-stat-arb-microstructure` | `paper-theory` | `paper:hft-stat-arb-microstructure:theory` | `dark` | `.nav .nav-contact-link` | 12.0px | `#a3e635` | `#5b7f24` | **3.09:1** | 4.5:1 |
| `paper.html?p=hft-stat-arb-microstructure` | `paper-cite` | `paper:hft-stat-arb-microstructure:cite` | `dark` | `.nav .nav-domain-pill` | 11.0px | `#a3e635` | `#4d6b21` | **4.05:1** | 4.5:1 |
| `paper.html?p=hft-stat-arb-microstructure` | `paper-cite` | `paper:hft-stat-arb-microstructure:cite` | `dark` | `.nav .nav-contact-link` | 12.0px | `#a3e635` | `#5b7e24` | **3.13:1** | 4.5:1 |
| `paper.html?p=hft-stat-arb-microstructure` | `paper-hero` | `paper:hft-stat-arb-microstructure:hero` | `light` | `.nav .brand b` | 14.0px | `#65a30d` | `#fefeff` | **3.06:1** | 4.5:1 |
| `paper.html?p=hft-stat-arb-microstructure` | `paper-hero` | `paper:hft-stat-arb-microstructure:hero` | `light` | `.nav .nav-domain-pill` | 11.0px | `#65a30d` | `#bcd798` | **1.96:1** | 4.5:1 |
| `paper.html?p=hft-stat-arb-microstructure` | `paper-hero` | `paper:hft-stat-arb-microstructure:hero` | `light` | `.nav .nav-contact-link` | 12.0px | `#65a30d` | `#b1d185` | **1.81:1** | 4.5:1 |
| `paper.html?p=hft-stat-arb-microstructure` | `paper-hero` | `paper:hft-stat-arb-microstructure:hero` | `light` | `.snap-pager .snap-dot.active .dot-text` | 11.0px | `#65a30d` | `#e1e2e4` | **2.38:1** | 4.5:1 |
| `paper.html?p=hft-stat-arb-microstructure` | `paper-hero` | `paper:hft-stat-arb-microstructure:hero` | `light` | `.crumbs a` | 12.0px | `#65a30d` | `#f4f5fa` | **2.84:1** | 4.5:1 |
| `paper.html?p=hft-stat-arb-microstructure` | `paper-hero` | `paper:hft-stat-arb-microstructure:hero` | `light` | `.eyebrow` | 12.0px | `#65a30d` | `#dbece9` | **2.53:1** | 4.5:1 |
| `paper.html?p=hft-stat-arb-microstructure` | `paper-hero` | `paper:hft-stat-arb-microstructure:hero` | `light` | `.paper-domain-tag` | 10.0px | `#059669` | `#86cab6` | **2.00:1** | 4.5:1 |
| `paper.html?p=hft-stat-arb-microstructure` | `paper-hero` | `paper:hft-stat-arb-microstructure:hero` | `light` | `h1 (gradient stop 2 rgba(--a,0.85))` | 42.0px | `#74ac2d` | `#cce2e5` | **2.03:1** | 3.0:1 |
| `paper.html?p=hft-stat-arb-microstructure` | `paper-hero` | `paper:hft-stat-arb-microstructure:hero` | `light` | `.snap-cta-btn` | 13.0px | `#65a30d` | `#dfead7` | **2.48:1** | 4.5:1 |
| `paper.html?p=hft-stat-arb-microstructure` | `paper-hero` | `paper:hft-stat-arb-microstructure:hero` | `light` | `.pill:not(.snap-cta-btn)` | 12.0px | `#65a30d` | `#b6d294` | **1.86:1** | 4.5:1 |
| `paper.html?p=hft-stat-arb-microstructure` | `paper-hero` | `paper:hft-stat-arb-microstructure:hero` | `light` | `.paper-section-tag` | 10.5px | `#65a30d` | `#fbfcf9` | **3.00:1** | 4.5:1 |
| `paper.html?p=hft-stat-arb-microstructure` | `paper-hero` | `paper:hft-stat-arb-microstructure:hero` | `light` | `.paper-meta .venue` | 12.0px | `#65a30d` | `#f3f4f7` | **2.81:1** | 4.5:1 |
| `paper.html?p=hft-stat-arb-microstructure` | `paper-theory` | `paper:hft-stat-arb-microstructure:theory` | `light` | `.nav .brand b` | 14.0px | `#65a30d` | `#fefeff` | **3.06:1** | 4.5:1 |
| `paper.html?p=hft-stat-arb-microstructure` | `paper-theory` | `paper:hft-stat-arb-microstructure:theory` | `light` | `.nav .nav-domain-pill` | 11.0px | `#65a30d` | `#bcd798` | **1.96:1** | 4.5:1 |
| `paper.html?p=hft-stat-arb-microstructure` | `paper-theory` | `paper:hft-stat-arb-microstructure:theory` | `light` | `.nav .nav-contact-link` | 12.0px | `#65a30d` | `#b1d185` | **1.81:1** | 4.5:1 |
| `paper.html?p=hft-stat-arb-microstructure` | `paper-theory` | `paper:hft-stat-arb-microstructure:theory` | `light` | `.snap-pager .snap-dot.active .dot-text` | 11.0px | `#69a514` | `#e1e2e3` | **2.32:1** | 4.5:1 |
| `paper.html?p=hft-stat-arb-microstructure` | `paper-theory` | `paper:hft-stat-arb-microstructure:theory` | `light` | `.eyebrow` | 12.0px | `#65a30d` | `#e4edde` | **2.57:1** | 4.5:1 |
| `paper.html?p=hft-stat-arb-microstructure` | `paper-theory` | `paper:hft-stat-arb-microstructure:theory` | `light` | `.paper-section-tag` | 10.5px | `#65a30d` | `#fafcfa` | **3.00:1** | 4.5:1 |
| `paper.html?p=hft-stat-arb-microstructure` | `paper-cite` | `paper:hft-stat-arb-microstructure:cite` | `light` | `.nav .brand b` | 14.0px | `#65a30d` | `#fefeff` | **3.06:1** | 4.5:1 |
| `paper.html?p=hft-stat-arb-microstructure` | `paper-cite` | `paper:hft-stat-arb-microstructure:cite` | `light` | `.nav .nav-domain-pill` | 11.0px | `#65a30d` | `#bcd798` | **1.96:1** | 4.5:1 |
| `paper.html?p=hft-stat-arb-microstructure` | `paper-cite` | `paper:hft-stat-arb-microstructure:cite` | `light` | `.nav .nav-contact-link` | 12.0px | `#65a30d` | `#b1d185` | **1.81:1** | 4.5:1 |
| `paper.html?p=hft-stat-arb-microstructure` | `paper-cite` | `paper:hft-stat-arb-microstructure:cite` | `light` | `.snap-pager .snap-dot.active .dot-text` | 11.0px | `#69a414` | `#e1e2e3` | **2.34:1** | 4.5:1 |
| `paper.html?p=hft-stat-arb-microstructure` | `paper-cite` | `paper:hft-stat-arb-microstructure:cite` | `light` | `.section-head .idx` | 12.0px | `#65a30d` | `#f5f6fb` | **2.86:1** | 4.5:1 |
| `paper.html?p=hft-stat-arb-microstructure` | `paper-cite` | `paper:hft-stat-arb-microstructure:cite` | `light` | `.snap-cta-btn` | 13.0px | `#65a30d` | `#f3f5f3` | **2.82:1** | 4.5:1 |
| `paper.html?p=hft-stat-arb-microstructure` | `paper-cite` | `paper:hft-stat-arb-microstructure:cite` | `light` | `.card .go` | 12.0px | `#65a30d` | `#ffffff` | **3.09:1** | 4.5:1 |
| `paper.html?p=hft-stat-arb-microstructure` | `paper-cite` | `paper:hft-stat-arb-microstructure:cite` | `light` | `.contact-status` | 12.0px | `#65a30d` | `#eef4e5` | **2.75:1** | 4.5:1 |
| `paper.html?p=symplectic-energy-bounds-nbody` | `paper-hero` | `paper:symplectic-energy-bounds-nbody:hero` | `dark` | `.nav .nav-domain-pill` | 11.0px | `#a3e635` | `#4e6c22` | **3.99:1** | 4.5:1 |
| `paper.html?p=symplectic-energy-bounds-nbody` | `paper-hero` | `paper:symplectic-energy-bounds-nbody:hero` | `dark` | `.nav .nav-contact-link` | 12.0px | `#a3e635` | `#5d8027` | **3.04:1** | 4.5:1 |
| `paper.html?p=symplectic-energy-bounds-nbody` | `paper-hero` | `paper:symplectic-energy-bounds-nbody:hero` | `dark` | `.eyebrow` | 12.0px | `#a3e635` | `#7b8273` | **2.64:1** | 4.5:1 |
| `paper.html?p=symplectic-energy-bounds-nbody` | `paper-hero` | `paper:symplectic-energy-bounds-nbody:hero` | `dark` | `.paper-domain-tag` | 10.0px | `#22d3ee` | `#156976` | **3.51:1** | 4.5:1 |
| `paper.html?p=symplectic-energy-bounds-nbody` | `paper-hero` | `paper:symplectic-energy-bounds-nbody:hero` | `dark` | `h1 (gradient stop 1 --fg)` | 42.0px | `#e9ebf1` | `#838b79` | **2.97:1** | 3.0:1 |
| `paper.html?p=symplectic-energy-bounds-nbody` | `paper-hero` | `paper:symplectic-energy-bounds-nbody:hero` | `dark` | `h1 (gradient stop 2 rgba(--a,0.85))` | 42.0px | `#9ed83f` | `#838b79` | **2.08:1** | 3.0:1 |
| `paper.html?p=symplectic-energy-bounds-nbody` | `paper-hero` | `paper:symplectic-energy-bounds-nbody:hero` | `dark` | `.pill:not(.snap-cta-btn)` | 12.0px | `#a3e635` | `#58762a` | **3.45:1** | 4.5:1 |
| `paper.html?p=symplectic-energy-bounds-nbody` | `paper-theory` | `paper:symplectic-energy-bounds-nbody:theory` | `dark` | `.nav .nav-domain-pill` | 11.0px | `#a3e635` | `#4d6b21` | **4.05:1** | 4.5:1 |
| `paper.html?p=symplectic-energy-bounds-nbody` | `paper-theory` | `paper:symplectic-energy-bounds-nbody:theory` | `dark` | `.nav .nav-contact-link` | 12.0px | `#a3e635` | `#5b7f24` | **3.09:1** | 4.5:1 |
| `paper.html?p=symplectic-energy-bounds-nbody` | `paper-cite` | `paper:symplectic-energy-bounds-nbody:cite` | `dark` | `.nav .nav-domain-pill` | 11.0px | `#a3e635` | `#4d6b21` | **4.05:1** | 4.5:1 |
| `paper.html?p=symplectic-energy-bounds-nbody` | `paper-cite` | `paper:symplectic-energy-bounds-nbody:cite` | `dark` | `.nav .nav-contact-link` | 12.0px | `#a3e635` | `#5b7e24` | **3.13:1** | 4.5:1 |
| `paper.html?p=symplectic-energy-bounds-nbody` | `paper-cite` | `paper:symplectic-energy-bounds-nbody:cite` | `dark` | `.pill:not(.snap-cta-btn)` | 12.0px | `#a3e635` | `#496421` | **4.45:1** | 4.5:1 |
| `paper.html?p=symplectic-energy-bounds-nbody` | `paper-hero` | `paper:symplectic-energy-bounds-nbody:hero` | `light` | `.nav .brand b` | 14.0px | `#65a30d` | `#fafafb` | **2.96:1** | 4.5:1 |
| `paper.html?p=symplectic-energy-bounds-nbody` | `paper-hero` | `paper:symplectic-energy-bounds-nbody:hero` | `light` | `.nav .nav-domain-pill` | 11.0px | `#65a30d` | `#b9d594` | **1.91:1** | 4.5:1 |
| `paper.html?p=symplectic-energy-bounds-nbody` | `paper-hero` | `paper:symplectic-energy-bounds-nbody:hero` | `light` | `.nav .nav-contact-link` | 12.0px | `#65a30d` | `#a7c67a` | **1.62:1** | 4.5:1 |
| `paper.html?p=symplectic-energy-bounds-nbody` | `paper-hero` | `paper:symplectic-energy-bounds-nbody:hero` | `light` | `.snap-pager .snap-dot.active .dot-text` | 11.0px | `#65a30d` | `#434c42` | **2.89:1** | 4.5:1 |
| `paper.html?p=symplectic-energy-bounds-nbody` | `paper-hero` | `paper:symplectic-energy-bounds-nbody:hero` | `light` | `.snap-pager .snap-dot:not(.active) .dot-text` | 11.0px | `#475569` | `#454f43` | **1.13:1** | 4.5:1 |
| `paper.html?p=symplectic-energy-bounds-nbody` | `paper-hero` | `paper:symplectic-energy-bounds-nbody:hero` | `light` | `.crumbs` | 12.0px | `#475569` | `#7f887c` | **2.06:1** | 4.5:1 |
| `paper.html?p=symplectic-energy-bounds-nbody` | `paper-hero` | `paper:symplectic-energy-bounds-nbody:hero` | `light` | `.crumbs a` | 12.0px | `#65a30d` | `#dadcdf` | **2.25:1** | 4.5:1 |
| `paper.html?p=symplectic-energy-bounds-nbody` | `paper-hero` | `paper:symplectic-energy-bounds-nbody:hero` | `light` | `.eyebrow` | 12.0px | `#65a30d` | `#7c8678` | **1.23:1** | 4.5:1 |
| `paper.html?p=symplectic-energy-bounds-nbody` | `paper-hero` | `paper:symplectic-energy-bounds-nbody:hero` | `light` | `.paper-domain-tag` | 10.0px | `#0284c7` | `#6eabcc` | **1.63:1** | 4.5:1 |
| `paper.html?p=symplectic-energy-bounds-nbody` | `paper-hero` | `paper:symplectic-energy-bounds-nbody:hero` | `light` | `h1 (gradient stop 2 rgba(--a,0.85))` | 42.0px | `#689e1c` | `#788372` | **1.23:1** | 3.0:1 |
| `paper.html?p=symplectic-energy-bounds-nbody` | `paper-hero` | `paper:symplectic-energy-bounds-nbody:hero` | `light` | `.tag-status` | 10.0px | `#475569` | `#9ca3a0` | **2.94:1** | 4.5:1 |
| `paper.html?p=symplectic-energy-bounds-nbody` | `paper-hero` | `paper:symplectic-energy-bounds-nbody:hero` | `light` | `.snap-cta-btn` | 13.0px | `#65a30d` | `#adb9a3` | **1.51:1** | 4.5:1 |
| `paper.html?p=symplectic-energy-bounds-nbody` | `paper-hero` | `paper:symplectic-energy-bounds-nbody:hero` | `light` | `.pill:not(.snap-cta-btn)` | 12.0px | `#65a30d` | `#a1a8a1` | **1.27:1** | 4.5:1 |
| `paper.html?p=symplectic-energy-bounds-nbody` | `paper-hero` | `paper:symplectic-energy-bounds-nbody:hero` | `light` | `.paper-section-tag` | 10.5px | `#65a30d` | `#ebedea` | **2.62:1** | 4.5:1 |
| `paper.html?p=symplectic-energy-bounds-nbody` | `paper-hero` | `paper:symplectic-energy-bounds-nbody:hero` | `light` | `.paper-meta` | 12.0px | `#475569` | `#75816f` | **1.85:1** | 4.5:1 |
| `paper.html?p=symplectic-energy-bounds-nbody` | `paper-hero` | `paper:symplectic-energy-bounds-nbody:hero` | `light` | `.paper-meta .venue` | 12.0px | `#65a30d` | `#c1c5c5` | **1.77:1** | 4.5:1 |
| `paper.html?p=symplectic-energy-bounds-nbody` | `paper-hero` | `paper:symplectic-energy-bounds-nbody:hero` | `light` | `.sim-tag` | 11.0px | `#475569` | `#485049` | **1.10:1** | 4.5:1 |
| `paper.html?p=symplectic-energy-bounds-nbody` | `paper-theory` | `paper:symplectic-energy-bounds-nbody:theory` | `light` | `.nav .brand b` | 14.0px | `#65a30d` | `#fefeff` | **3.06:1** | 4.5:1 |
| `paper.html?p=symplectic-energy-bounds-nbody` | `paper-theory` | `paper:symplectic-energy-bounds-nbody:theory` | `light` | `.nav .nav-domain-pill` | 11.0px | `#65a30d` | `#bcd798` | **1.96:1** | 4.5:1 |
| `paper.html?p=symplectic-energy-bounds-nbody` | `paper-theory` | `paper:symplectic-energy-bounds-nbody:theory` | `light` | `.nav .nav-contact-link` | 12.0px | `#65a30d` | `#b1d185` | **1.81:1** | 4.5:1 |
| `paper.html?p=symplectic-energy-bounds-nbody` | `paper-theory` | `paper:symplectic-energy-bounds-nbody:theory` | `light` | `.snap-pager .snap-dot.active .dot-text` | 11.0px | `#67a410` | `#e1e2e3` | **2.35:1** | 4.5:1 |
| `paper.html?p=symplectic-energy-bounds-nbody` | `paper-theory` | `paper:symplectic-energy-bounds-nbody:theory` | `light` | `.eyebrow` | 12.0px | `#65a30d` | `#e3ebdd` | **2.53:1** | 4.5:1 |
| `paper.html?p=symplectic-energy-bounds-nbody` | `paper-theory` | `paper:symplectic-energy-bounds-nbody:theory` | `light` | `.paper-section-tag` | 10.5px | `#65a30d` | `#fbfcfa` | **3.00:1** | 4.5:1 |
| `paper.html?p=symplectic-energy-bounds-nbody` | `paper-cite` | `paper:symplectic-energy-bounds-nbody:cite` | `light` | `.nav .brand b` | 14.0px | `#65a30d` | `#fefeff` | **3.06:1** | 4.5:1 |
| `paper.html?p=symplectic-energy-bounds-nbody` | `paper-cite` | `paper:symplectic-energy-bounds-nbody:cite` | `light` | `.nav .nav-domain-pill` | 11.0px | `#65a30d` | `#bcd798` | **1.96:1** | 4.5:1 |
| `paper.html?p=symplectic-energy-bounds-nbody` | `paper-cite` | `paper:symplectic-energy-bounds-nbody:cite` | `light` | `.nav .nav-contact-link` | 12.0px | `#65a30d` | `#b1d185` | **1.81:1** | 4.5:1 |
| `paper.html?p=symplectic-energy-bounds-nbody` | `paper-cite` | `paper:symplectic-energy-bounds-nbody:cite` | `light` | `.snap-pager .snap-dot.active .dot-text` | 11.0px | `#74aa27` | `#e1e2e3` | **2.15:1** | 4.5:1 |
| `paper.html?p=symplectic-energy-bounds-nbody` | `paper-cite` | `paper:symplectic-energy-bounds-nbody:cite` | `light` | `.section-head .idx` | 12.0px | `#65a30d` | `#f5f6fb` | **2.86:1** | 4.5:1 |
| `paper.html?p=symplectic-energy-bounds-nbody` | `paper-cite` | `paper:symplectic-energy-bounds-nbody:cite` | `light` | `.snap-cta-btn` | 13.0px | `#65a30d` | `#f3f5f3` | **2.82:1** | 4.5:1 |
| `paper.html?p=symplectic-energy-bounds-nbody` | `paper-cite` | `paper:symplectic-energy-bounds-nbody:cite` | `light` | `.pill:not(.snap-cta-btn)` | 12.0px | `#65a30d` | `#c1d99e` | **2.01:1** | 4.5:1 |
| `paper.html?p=symplectic-energy-bounds-nbody` | `paper-cite` | `paper:symplectic-energy-bounds-nbody:cite` | `light` | `.card .go` | 12.0px | `#65a30d` | `#ffffff` | **3.09:1** | 4.5:1 |
| `paper.html?p=symplectic-energy-bounds-nbody` | `paper-cite` | `paper:symplectic-energy-bounds-nbody:cite` | `light` | `.contact-status` | 12.0px | `#65a30d` | `#eef4e5` | **2.75:1** | 4.5:1 |
| `paper.html?p=verified-ssa-compiler-passes` | `paper-hero` | `paper:verified-ssa-compiler-passes:hero` | `dark` | `.nav .nav-domain-pill` | 11.0px | `#a3e635` | `#4d6b21` | **4.05:1** | 4.5:1 |
| `paper.html?p=verified-ssa-compiler-passes` | `paper-hero` | `paper:verified-ssa-compiler-passes:hero` | `dark` | `.nav .nav-contact-link` | 12.0px | `#a3e635` | `#5b7f24` | **3.09:1** | 4.5:1 |
| `paper.html?p=verified-ssa-compiler-passes` | `paper-hero` | `paper:verified-ssa-compiler-passes:hero` | `dark` | `.pill:not(.snap-cta-btn)` | 12.0px | `#a3e635` | `#4a671d` | **4.29:1** | 4.5:1 |
| `paper.html?p=verified-ssa-compiler-passes` | `paper-theory` | `paper:verified-ssa-compiler-passes:theory` | `dark` | `.nav .nav-domain-pill` | 11.0px | `#a3e635` | `#4d6b21` | **4.05:1** | 4.5:1 |
| `paper.html?p=verified-ssa-compiler-passes` | `paper-theory` | `paper:verified-ssa-compiler-passes:theory` | `dark` | `.nav .nav-contact-link` | 12.0px | `#a3e635` | `#5b7f24` | **3.09:1** | 4.5:1 |
| `paper.html?p=verified-ssa-compiler-passes` | `paper-cite` | `paper:verified-ssa-compiler-passes:cite` | `dark` | `.nav .nav-domain-pill` | 11.0px | `#a3e635` | `#4d6b21` | **4.05:1** | 4.5:1 |
| `paper.html?p=verified-ssa-compiler-passes` | `paper-cite` | `paper:verified-ssa-compiler-passes:cite` | `dark` | `.nav .nav-contact-link` | 12.0px | `#a3e635` | `#5b7e24` | **3.13:1** | 4.5:1 |
| `paper.html?p=verified-ssa-compiler-passes` | `paper-cite` | `paper:verified-ssa-compiler-passes:cite` | `dark` | `.pill:not(.snap-cta-btn)` | 12.0px | `#a3e635` | `#496422` | **4.45:1** | 4.5:1 |
| `paper.html?p=verified-ssa-compiler-passes` | `paper-hero` | `paper:verified-ssa-compiler-passes:hero` | `light` | `.nav .brand b` | 14.0px | `#65a30d` | `#fefeff` | **3.06:1** | 4.5:1 |
| `paper.html?p=verified-ssa-compiler-passes` | `paper-hero` | `paper:verified-ssa-compiler-passes:hero` | `light` | `.nav .nav-domain-pill` | 11.0px | `#65a30d` | `#bcd798` | **1.96:1** | 4.5:1 |
| `paper.html?p=verified-ssa-compiler-passes` | `paper-hero` | `paper:verified-ssa-compiler-passes:hero` | `light` | `.nav .nav-contact-link` | 12.0px | `#65a30d` | `#b1d185` | **1.81:1** | 4.5:1 |
| `paper.html?p=verified-ssa-compiler-passes` | `paper-hero` | `paper:verified-ssa-compiler-passes:hero` | `light` | `.snap-pager .snap-dot.active .dot-text` | 11.0px | `#65a30d` | `#e1e2e4` | **2.38:1** | 4.5:1 |
| `paper.html?p=verified-ssa-compiler-passes` | `paper-hero` | `paper:verified-ssa-compiler-passes:hero` | `light` | `.crumbs a` | 12.0px | `#65a30d` | `#f5f6fb` | **2.86:1** | 4.5:1 |
| `paper.html?p=verified-ssa-compiler-passes` | `paper-hero` | `paper:verified-ssa-compiler-passes:hero` | `light` | `.eyebrow` | 12.0px | `#65a30d` | `#e6dff4` | **2.39:1** | 4.5:1 |
| `paper.html?p=verified-ssa-compiler-passes` | `paper-hero` | `paper:verified-ssa-compiler-passes:hero` | `light` | `.paper-domain-tag` | 10.0px | `#6d28d9` | `#b697eb` | **2.91:1** | 4.5:1 |
| `paper.html?p=verified-ssa-compiler-passes` | `paper-hero` | `paper:verified-ssa-compiler-passes:hero` | `light` | `h1 (gradient stop 2 rgba(--a,0.85))` | 42.0px | `#78ae2c` | `#e2ebda` | **2.17:1** | 3.0:1 |
| `paper.html?p=verified-ssa-compiler-passes` | `paper-hero` | `paper:verified-ssa-compiler-passes:hero` | `light` | `.snap-cta-btn` | 13.0px | `#65a30d` | `#e0ebd7` | **2.51:1** | 4.5:1 |
| `paper.html?p=verified-ssa-compiler-passes` | `paper-hero` | `paper:verified-ssa-compiler-passes:hero` | `light` | `.pill:not(.snap-cta-btn)` | 12.0px | `#65a30d` | `#b7d395` | **1.88:1** | 4.5:1 |
| `paper.html?p=verified-ssa-compiler-passes` | `paper-hero` | `paper:verified-ssa-compiler-passes:hero` | `light` | `.paper-section-tag` | 10.5px | `#65a30d` | `#fafcf9` | **2.99:1** | 4.5:1 |
| `paper.html?p=verified-ssa-compiler-passes` | `paper-hero` | `paper:verified-ssa-compiler-passes:hero` | `light` | `.paper-meta .venue` | 12.0px | `#65a30d` | `#f1f4f3` | **2.79:1** | 4.5:1 |
| `paper.html?p=verified-ssa-compiler-passes` | `paper-theory` | `paper:verified-ssa-compiler-passes:theory` | `light` | `.nav .brand b` | 14.0px | `#65a30d` | `#fefeff` | **3.06:1** | 4.5:1 |
| `paper.html?p=verified-ssa-compiler-passes` | `paper-theory` | `paper:verified-ssa-compiler-passes:theory` | `light` | `.nav .nav-domain-pill` | 11.0px | `#65a30d` | `#bcd798` | **1.96:1** | 4.5:1 |
| `paper.html?p=verified-ssa-compiler-passes` | `paper-theory` | `paper:verified-ssa-compiler-passes:theory` | `light` | `.nav .nav-contact-link` | 12.0px | `#65a30d` | `#b1d185` | **1.81:1** | 4.5:1 |
| `paper.html?p=verified-ssa-compiler-passes` | `paper-theory` | `paper:verified-ssa-compiler-passes:theory` | `light` | `.snap-pager .snap-dot.active .dot-text` | 11.0px | `#69a414` | `#e1e2e3` | **2.34:1** | 4.5:1 |
| `paper.html?p=verified-ssa-compiler-passes` | `paper-theory` | `paper:verified-ssa-compiler-passes:theory` | `light` | `.eyebrow` | 12.0px | `#65a30d` | `#e5ecdf` | **2.56:1** | 4.5:1 |
| `paper.html?p=verified-ssa-compiler-passes` | `paper-theory` | `paper:verified-ssa-compiler-passes:theory` | `light` | `.paper-section-tag` | 10.5px | `#65a30d` | `#fbfcfa` | **3.00:1** | 4.5:1 |
| `paper.html?p=verified-ssa-compiler-passes` | `paper-cite` | `paper:verified-ssa-compiler-passes:cite` | `light` | `.nav .brand b` | 14.0px | `#65a30d` | `#fefeff` | **3.06:1** | 4.5:1 |
| `paper.html?p=verified-ssa-compiler-passes` | `paper-cite` | `paper:verified-ssa-compiler-passes:cite` | `light` | `.nav .nav-domain-pill` | 11.0px | `#65a30d` | `#bcd798` | **1.96:1** | 4.5:1 |
| `paper.html?p=verified-ssa-compiler-passes` | `paper-cite` | `paper:verified-ssa-compiler-passes:cite` | `light` | `.nav .nav-contact-link` | 12.0px | `#65a30d` | `#b1d185` | **1.81:1** | 4.5:1 |
| `paper.html?p=verified-ssa-compiler-passes` | `paper-cite` | `paper:verified-ssa-compiler-passes:cite` | `light` | `.snap-pager .snap-dot.active .dot-text` | 11.0px | `#75ab28` | `#e1e2e3` | **2.13:1** | 4.5:1 |
| `paper.html?p=verified-ssa-compiler-passes` | `paper-cite` | `paper:verified-ssa-compiler-passes:cite` | `light` | `.section-head .idx` | 12.0px | `#65a30d` | `#f5f6fb` | **2.86:1** | 4.5:1 |
| `paper.html?p=verified-ssa-compiler-passes` | `paper-cite` | `paper:verified-ssa-compiler-passes:cite` | `light` | `.snap-cta-btn` | 13.0px | `#65a30d` | `#f3f5f4` | **2.82:1** | 4.5:1 |
| `paper.html?p=verified-ssa-compiler-passes` | `paper-cite` | `paper:verified-ssa-compiler-passes:cite` | `light` | `.pill:not(.snap-cta-btn)` | 12.0px | `#65a30d` | `#c1d99e` | **2.01:1** | 4.5:1 |
| `paper.html?p=verified-ssa-compiler-passes` | `paper-cite` | `paper:verified-ssa-compiler-passes:cite` | `light` | `.card .go` | 12.0px | `#65a30d` | `#ffffff` | **3.09:1** | 4.5:1 |
| `paper.html?p=verified-ssa-compiler-passes` | `paper-cite` | `paper:verified-ssa-compiler-passes:cite` | `light` | `.contact-status` | 12.0px | `#65a30d` | `#eef4e5` | **2.75:1** | 4.5:1 |
| `paper.html?p=riemannian-immersion-gauss-bonnet` | `paper-hero` | `paper:riemannian-immersion-gauss-bonnet:hero` | `dark` | `.nav .nav-domain-pill` | 11.0px | `#a3e635` | `#4d6b21` | **4.05:1** | 4.5:1 |
| `paper.html?p=riemannian-immersion-gauss-bonnet` | `paper-hero` | `paper:riemannian-immersion-gauss-bonnet:hero` | `dark` | `.nav .nav-contact-link` | 12.0px | `#a3e635` | `#5b7f24` | **3.09:1** | 4.5:1 |
| `paper.html?p=riemannian-immersion-gauss-bonnet` | `paper-hero` | `paper:riemannian-immersion-gauss-bonnet:hero` | `dark` | `.paper-domain-tag` | 10.0px | `#e02840` | `#07090c` | **4.32:1** | 4.5:1 |
| `paper.html?p=riemannian-immersion-gauss-bonnet` | `paper-hero` | `paper:riemannian-immersion-gauss-bonnet:hero` | `dark` | `.pill:not(.snap-cta-btn)` | 12.0px | `#a3e635` | `#4a671d` | **4.29:1** | 4.5:1 |
| `paper.html?p=riemannian-immersion-gauss-bonnet` | `paper-theory` | `paper:riemannian-immersion-gauss-bonnet:theory` | `dark` | `.nav .nav-domain-pill` | 11.0px | `#a3e635` | `#4d6b21` | **4.05:1** | 4.5:1 |
| `paper.html?p=riemannian-immersion-gauss-bonnet` | `paper-theory` | `paper:riemannian-immersion-gauss-bonnet:theory` | `dark` | `.nav .nav-contact-link` | 12.0px | `#a3e635` | `#5b7f24` | **3.09:1** | 4.5:1 |
| `paper.html?p=riemannian-immersion-gauss-bonnet` | `paper-cite` | `paper:riemannian-immersion-gauss-bonnet:cite` | `dark` | `.nav .nav-domain-pill` | 11.0px | `#a3e635` | `#4d6b21` | **4.05:1** | 4.5:1 |
| `paper.html?p=riemannian-immersion-gauss-bonnet` | `paper-cite` | `paper:riemannian-immersion-gauss-bonnet:cite` | `dark` | `.nav .nav-contact-link` | 12.0px | `#a3e635` | `#5b7e24` | **3.13:1** | 4.5:1 |
| `paper.html?p=riemannian-immersion-gauss-bonnet` | `paper-cite` | `paper:riemannian-immersion-gauss-bonnet:cite` | `dark` | `.pill:not(.snap-cta-btn)` | 12.0px | `#a3e635` | `#496421` | **4.45:1** | 4.5:1 |
| `paper.html?p=riemannian-immersion-gauss-bonnet` | `paper-hero` | `paper:riemannian-immersion-gauss-bonnet:hero` | `light` | `.nav .brand b` | 14.0px | `#65a30d` | `#fefeff` | **3.06:1** | 4.5:1 |
| `paper.html?p=riemannian-immersion-gauss-bonnet` | `paper-hero` | `paper:riemannian-immersion-gauss-bonnet:hero` | `light` | `.nav .nav-domain-pill` | 11.0px | `#65a30d` | `#bcd798` | **1.96:1** | 4.5:1 |
| `paper.html?p=riemannian-immersion-gauss-bonnet` | `paper-hero` | `paper:riemannian-immersion-gauss-bonnet:hero` | `light` | `.nav .nav-contact-link` | 12.0px | `#65a30d` | `#b1d185` | **1.81:1** | 4.5:1 |
| `paper.html?p=riemannian-immersion-gauss-bonnet` | `paper-hero` | `paper:riemannian-immersion-gauss-bonnet:hero` | `light` | `.snap-pager .snap-dot.active .dot-text` | 11.0px | `#65a30d` | `#e1e2e4` | **2.38:1** | 4.5:1 |
| `paper.html?p=riemannian-immersion-gauss-bonnet` | `paper-hero` | `paper:riemannian-immersion-gauss-bonnet:hero` | `light` | `.crumbs a` | 12.0px | `#65a30d` | `#f5f6fb` | **2.86:1** | 4.5:1 |
| `paper.html?p=riemannian-immersion-gauss-bonnet` | `paper-hero` | `paper:riemannian-immersion-gauss-bonnet:hero` | `light` | `.eyebrow` | 12.0px | `#65a30d` | `#bad59a` | **1.92:1** | 4.5:1 |
| `paper.html?p=riemannian-immersion-gauss-bonnet` | `paper-hero` | `paper:riemannian-immersion-gauss-bonnet:hero` | `light` | `.paper-domain-tag` | 10.0px | `#be123c` | `#dc8da3` | **2.51:1** | 4.5:1 |
| `paper.html?p=riemannian-immersion-gauss-bonnet` | `paper-hero` | `paper:riemannian-immersion-gauss-bonnet:hero` | `light` | `h1 (gradient stop 2 rgba(--a,0.85))` | 42.0px | `#74ab25` | `#c7dbae` | **1.87:1** | 3.0:1 |
| `paper.html?p=riemannian-immersion-gauss-bonnet` | `paper-hero` | `paper:riemannian-immersion-gauss-bonnet:hero` | `light` | `.snap-cta-btn` | 13.0px | `#65a30d` | `#e0ebd7` | **2.51:1** | 4.5:1 |
| `paper.html?p=riemannian-immersion-gauss-bonnet` | `paper-hero` | `paper:riemannian-immersion-gauss-bonnet:hero` | `light` | `.pill:not(.snap-cta-btn)` | 12.0px | `#65a30d` | `#b7d395` | **1.88:1** | 4.5:1 |
| `paper.html?p=riemannian-immersion-gauss-bonnet` | `paper-hero` | `paper:riemannian-immersion-gauss-bonnet:hero` | `light` | `.paper-section-tag` | 10.5px | `#65a30d` | `#f9fbf6` | **2.97:1** | 4.5:1 |
| `paper.html?p=riemannian-immersion-gauss-bonnet` | `paper-hero` | `paper:riemannian-immersion-gauss-bonnet:hero` | `light` | `.paper-meta .venue` | 12.0px | `#65a30d` | `#f3f4f6` | **2.81:1** | 4.5:1 |
| `paper.html?p=riemannian-immersion-gauss-bonnet` | `paper-theory` | `paper:riemannian-immersion-gauss-bonnet:theory` | `light` | `.nav .brand b` | 14.0px | `#65a30d` | `#fefeff` | **3.06:1** | 4.5:1 |
| `paper.html?p=riemannian-immersion-gauss-bonnet` | `paper-theory` | `paper:riemannian-immersion-gauss-bonnet:theory` | `light` | `.nav .nav-domain-pill` | 11.0px | `#65a30d` | `#bcd798` | **1.96:1** | 4.5:1 |
| `paper.html?p=riemannian-immersion-gauss-bonnet` | `paper-theory` | `paper:riemannian-immersion-gauss-bonnet:theory` | `light` | `.nav .nav-contact-link` | 12.0px | `#65a30d` | `#b1d185` | **1.81:1** | 4.5:1 |
| `paper.html?p=riemannian-immersion-gauss-bonnet` | `paper-theory` | `paper:riemannian-immersion-gauss-bonnet:theory` | `light` | `.snap-pager .snap-dot.active .dot-text` | 11.0px | `#67a410` | `#e1e2e3` | **2.35:1** | 4.5:1 |
| `paper.html?p=riemannian-immersion-gauss-bonnet` | `paper-theory` | `paper:riemannian-immersion-gauss-bonnet:theory` | `light` | `.eyebrow` | 12.0px | `#65a30d` | `#e4ecde` | **2.55:1** | 4.5:1 |
| `paper.html?p=riemannian-immersion-gauss-bonnet` | `paper-theory` | `paper:riemannian-immersion-gauss-bonnet:theory` | `light` | `.paper-section-tag` | 10.5px | `#65a30d` | `#fafbf8` | **2.97:1** | 4.5:1 |
| `paper.html?p=riemannian-immersion-gauss-bonnet` | `paper-cite` | `paper:riemannian-immersion-gauss-bonnet:cite` | `light` | `.nav .brand b` | 14.0px | `#65a30d` | `#fefeff` | **3.06:1** | 4.5:1 |
| `paper.html?p=riemannian-immersion-gauss-bonnet` | `paper-cite` | `paper:riemannian-immersion-gauss-bonnet:cite` | `light` | `.nav .nav-domain-pill` | 11.0px | `#65a30d` | `#bcd798` | **1.96:1** | 4.5:1 |
| `paper.html?p=riemannian-immersion-gauss-bonnet` | `paper-cite` | `paper:riemannian-immersion-gauss-bonnet:cite` | `light` | `.nav .nav-contact-link` | 12.0px | `#65a30d` | `#b1d185` | **1.81:1** | 4.5:1 |
| `paper.html?p=riemannian-immersion-gauss-bonnet` | `paper-cite` | `paper:riemannian-immersion-gauss-bonnet:cite` | `light` | `.snap-pager .snap-dot.active .dot-text` | 11.0px | `#6ea81d` | `#e1e2e3` | **2.22:1** | 4.5:1 |
| `paper.html?p=riemannian-immersion-gauss-bonnet` | `paper-cite` | `paper:riemannian-immersion-gauss-bonnet:cite` | `light` | `.section-head .idx` | 12.0px | `#65a30d` | `#f5f6fb` | **2.86:1** | 4.5:1 |
| `paper.html?p=riemannian-immersion-gauss-bonnet` | `paper-cite` | `paper:riemannian-immersion-gauss-bonnet:cite` | `light` | `.snap-cta-btn` | 13.0px | `#65a30d` | `#f3f5f3` | **2.82:1** | 4.5:1 |
| `paper.html?p=riemannian-immersion-gauss-bonnet` | `paper-cite` | `paper:riemannian-immersion-gauss-bonnet:cite` | `light` | `.pill:not(.snap-cta-btn)` | 12.0px | `#65a30d` | `#c1d99e` | **2.01:1** | 4.5:1 |
| `paper.html?p=riemannian-immersion-gauss-bonnet` | `paper-cite` | `paper:riemannian-immersion-gauss-bonnet:cite` | `light` | `.card .go` | 12.0px | `#65a30d` | `#ffffff` | **3.09:1** | 4.5:1 |
| `paper.html?p=riemannian-immersion-gauss-bonnet` | `paper-cite` | `paper:riemannian-immersion-gauss-bonnet:cite` | `light` | `.contact-status` | 12.0px | `#65a30d` | `#eef4e5` | **2.75:1** | 4.5:1 |
