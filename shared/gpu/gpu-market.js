/* GPU Market Galaxy Simulation (shared/gpu/gpu-market.js).
   60-asset 6-sector continuous correlation network collapsing into a single cluster
   under crisis regimes. Real-time Mantegna metric distance, Kruskal minimum spanning tree,
   symmetric cyclic Jacobi eigensolver, Marchenko-Pastur theoretical edge bounds,
   3-D SMACOF stress majorisation with Procrustes rigid alignment, Dual-Kawase bloom,
   travelling edge light pulses, interactive hover sector inspection, and click shockwave. */

(function (root, factory) {
    if (typeof module === "object" && module.exports) module.exports = factory(root);
    else factory(root);
}(typeof self !== "undefined" ? self : this, function (root) {
    "use strict";

    root.SIMS = root.SIMS || {};
    const SIMS = root.SIMS;
    const GFX = root.GFX;
    let MM = root.MarketMath;

    const ensureMM = () => {
        if (MM) return Promise.resolve(MM);
        if (root.MarketMath) { MM = root.MarketMath; return Promise.resolve(MM); }
        if (typeof document === "undefined") return Promise.resolve(null);
        return new Promise((resolve) => {
            const s = document.createElement("script");
            s.src = "shared/lib/market-math.js?v=36";
            s.onload = () => { MM = root.MarketMath; resolve(MM); };
            s.onerror = () => resolve(null);
            document.head.appendChild(s);
        });
    };

    /* =========================================================================
       1. Sector Colours & Asset Definitions
       ========================================================================= */

    // 6 celestial / market sector colours in linear RGB
    const SECTOR_COLS = [
        [0.22, 0.78, 1.00], // 0: Semiconductors & Compute (Electric Cyan)
        [0.68, 0.42, 1.00], // 1: Quantitative Software & Cloud (Cobalt Violet)
        [0.20, 0.94, 0.64], // 2: Renewable Energy & Power (Emerald Mint)
        [1.00, 0.76, 0.24], // 3: Biotechnology & Genomics (Amber Gold)
        [1.00, 0.42, 0.28], // 4: Aerospace & Symplectic Systems (Bright Coral)
        [1.00, 0.32, 0.68]  // 5: Decentralised Networks & Ledger (Rose Magenta)
    ];

    const SECTOR_HEX = [
        "#38bdf8",
        "#a855f7",
        "#34d399",
        "#fbbf24",
        "#fb7185",
        "#f43f5e"
    ];

    /* =========================================================================
       2. WebGL2 Shaders: Stars, MST Glowing Ribbons, and Travelling Pulses
       ========================================================================= */

    // 1. Star Billboard Splats (point primitives with sharp core + soft halo)
    const VS_STARS = `#version 300 es
layout(location = 0) in vec3 aPos;
layout(location = 1) in vec4 aAttr; // x: size, y: sector, z: highlight, w: twinkle phase

uniform mat4 uViewProj;
uniform float uPointScale;
uniform float uTime;
uniform vec3 uSectorCols[6];

out vec3 vColor;
out float vHighlight;
out float vTwinkle;

void main() {
    vec4 clip = uViewProj * vec4(aPos, 1.0);
    gl_Position = clip;

    float dist = max(clip.w, 0.4);
    float twinkle = 1.0 + 0.16 * sin(uTime * 2.5 + aAttr.w);
    gl_PointSize = clamp((aAttr.x * uPointScale * twinkle) / (dist * 0.35), 3.0, 36.0);

    int sIdx = int(clamp(aAttr.y, 0.0, 5.0));
    vColor = uSectorCols[sIdx];
    vHighlight = aAttr.z;
    vTwinkle = twinkle;
}
`;

    const FS_STARS = `#version 300 es
precision highp float;

in vec3 vColor;
in float vHighlight;
in float vTwinkle;

out vec4 fragColor;

void main() {
    vec2 p = gl_PointCoord - 0.5;
    float rSq = dot(p, p);
    if (rSq > 0.25) discard;

    // Sharp luminous core + diffuse exponential halo
    float core = smoothstep(0.06, 0.0, rSq);
    float halo = exp(-rSq * 18.0);

    vec3 col = mix(vColor, vec3(1.0, 0.98, 0.95), core * 0.72);
    float radiance = (halo * 0.90 + core * 3.2) * vHighlight * vTwinkle;

    fragColor = vec4(col * radiance, 1.0);
}
`;

    // 2. MST Glowing Ribbons / Lines
    const VS_LINES = `#version 300 es
layout(location = 0) in vec3 aPos;
layout(location = 1) in vec4 aAttr; // xyz: colour, w: brightness

uniform mat4 uViewProj;
uniform float uCrisisIntensity;

out vec3 vColor;
out float vBrightness;
out float vDepth;

void main() {
    vec4 clip = uViewProj * vec4(aPos, 1.0);
    gl_Position = clip;
    vColor = aAttr.xyz;
    vBrightness = aAttr.w * (1.0 + 1.25 * uCrisisIntensity);
    vDepth = clip.w;
}
`;

    const FS_LINES = `#version 300 es
precision highp float;

in vec3 vColor;
in float vBrightness;
in float vDepth;

out vec4 fragColor;

void main() {
    float fog = clamp(1.0 - (vDepth - 2.5) * 0.14, 0.18, 1.0);
    vec3 col = vColor * vBrightness * fog * 0.75;
    fragColor = vec4(col, 1.0);
}
`;

    // 3. Travelling Light Pulses along MST Edges
    const VS_PULSES = `#version 300 es
layout(location = 0) in vec3 aPos;
layout(location = 1) in vec4 aAttr; // xyz: colour, w: intensity

uniform mat4 uViewProj;
uniform float uPulseScale;

out vec3 vColor;
out float vIntensity;

void main() {
    vec4 clip = uViewProj * vec4(aPos, 1.0);
    gl_Position = clip;
    float dist = max(clip.w, 0.4);
    gl_PointSize = clamp((uPulseScale * 14.0) / (dist * 0.35), 2.5, 22.0);
    vColor = aAttr.xyz;
    vIntensity = aAttr.w;
}
`;

    const FS_PULSES = `#version 300 es
precision highp float;

in vec3 vColor;
in float vIntensity;

out vec4 fragColor;

void main() {
    vec2 p = gl_PointCoord - 0.5;
    float rSq = dot(p, p);
    if (rSq > 0.25) discard;

    float halo = exp(-rSq * 22.0);
    float core = smoothstep(0.045, 0.0, rSq);

    vec3 col = mix(vColor, vec3(1.0, 1.0, 1.0), 0.75);
    float rad = (halo * 1.6 + core * 4.5) * vIntensity;
    fragColor = vec4(col * rad, 1.0);
}
`;

    /* =========================================================================
       3. Scene Controller Factory
       ========================================================================= */

    function createMarketGalaxySim(canvas, opts = {}) {
        if (!GFX || !GFX.supported) {
            if (typeof SIMS !== "undefined" && SIMS["options-pricing"]) {
                return SIMS["options-pricing"](canvas, opts);
            }
            return;
        }

        const isMob = typeof window !== "undefined" && window.innerWidth <= 900;
        const NUM_ASSETS = 60;
        const NUM_EDGES = 59; // MST has N - 1 edges
        const ROLLING_WINDOW = 90;

        let assets = null;
        let starProg = null;
        let lineProg = null;
        let pulseProg = null;
        let sceneTarget = null;

        // WebGL2 VAO & VBO handles
        let starVAO = null, starVBO = null;
        let lineVAO = null, lineVBO = null;
        let pulseVAO = null, pulseVBO = null;

        // Preallocated typed buffers for zero per-frame garbage collection
        const starVertexData = new Float32Array(NUM_ASSETS * 7); // [x, y, z, size, sector, highlight, twinklePhase]
        const lineVertexData = new Float32Array(NUM_EDGES * 2 * 7); // 118 vertices * [x, y, z, r, g, b, brightness]
        const pulseVertexData = new Float32Array(NUM_EDGES * 7); // 59 pulses * [x, y, z, r, g, b, intensity]

        // 3-D Layout Positions
        let currentPositions = null;
        let targetPositions = null;
        let mstEdges = [];
        let correlationMatrix = null;
        let distanceMatrix = null;
        let assetDegrees = new Int32Array(NUM_ASSETS);
        let pulsePhases = new Float32Array(NUM_EDGES);

        // State & Regimes
        let simTime = 0.0;
        let lastTagTime = 0.0;
        let crisisIntensity = 0.0; // 0.0 (calm) -> 1.0 (crisis)
        let manualShock = 0.0;
        let manualShockTimer = 0.0;
        let hoveredNode = -1;
        let lastHoveredNode = -1;
        let latestStats = null;
        let localMouseX = -1000, localMouseY = -1000;

        // Tooltip DOM element
        let tooltipEl = null;

        const updateCaption = (force = false) => {
            const now = performance.now() * 0.001;
            if (!force && now - lastTagTime < 0.25) return; // <= 4 Hz live caption update
            lastTagTime = now;

            if (!latestStats) return;

            let regimeStr = "Calm";
            if (crisisIntensity > 0.65) regimeStr = "Crisis";
            else if (crisisIntensity > 0.20) regimeStr = "Transition";

            const rhoStr = latestStats.rhoBar.toFixed(2);
            const absPct = Math.round(latestStats.absorptionRatio * 100);
            const lStr = latestStats.normalisedTreeLength.toFixed(2);
            const modes = latestStats.numSignalEigenvalues;
            const modeWord = modes === 1 ? "mode" : "modes";

            const tagText = `Market galaxy · 60 assets, 6 sectors · Regime: ${regimeStr} · ρ̄ = ${rhoStr} · λ₁/N = ${absPct}% · L = ${lStr} · ${modes} signal ${modeWord} > λ₊`;

            const tag = canvas.parentElement ? canvas.parentElement.querySelector(".sim-tag") : null;
            if (tag) tag.textContent = tagText;
        };

        const createTooltip = () => {
            if (typeof document === "undefined" || !canvas.parentElement) return;
            tooltipEl = document.createElement("div");
            tooltipEl.className = "market-galaxy-tooltip";
            tooltipEl.setAttribute("aria-hidden", "true");
            tooltipEl.style.cssText = [
                "position: absolute;",
                "display: none;",
                "pointer-events: none;",
                "z-index: 12;",
                "border-radius: 6px;",
                "background: rgba(10, 14, 22, 0.94);",
                "border: 1px solid rgba(255, 255, 255, 0.16);",
                "padding: 8px 12px;",
                "font-family: var(--font-sans, system-ui, -apple-system, sans-serif);",
                "font-size: 11px;",
                "line-height: 1.45;",
                "color: #e2e8f0;",
                "box-shadow: 0 10px 25px rgba(0, 0, 0, 0.65);",
                "backdrop-filter: blur(8px);",
                "-webkit-backdrop-filter: blur(8px);",
                "white-space: nowrap;",
                "transition: opacity 0.15s ease;"
            ].join(" ");
            canvas.parentElement.appendChild(tooltipEl);
        };

        const updateTooltip = (nodeIdx, screenX, screenY, containerW, containerH) => {
            if (!tooltipEl || !assets || !correlationMatrix) return;
            if (nodeIdx < 0 || nodeIdx >= NUM_ASSETS) {
                tooltipEl.style.display = "none";
                return;
            }

            const a = assets[nodeIdx];
            const sectorCol = SECTOR_HEX[a.sector];

            // Identify top 3 correlated peer assets
            const peers = [];
            for (let j = 0; j < NUM_ASSETS; j++) {
                if (j !== nodeIdx) {
                    peers.push({ id: j, ticker: assets[j].ticker, rho: correlationMatrix[nodeIdx][j] });
                }
            }
            peers.sort((x, y) => y.rho - x.rho);
            const top3 = peers.slice(0, 3)
                .map(p => `${p.ticker} (${p.rho.toFixed(2)})`)
                .join(", ");

            tooltipEl.innerHTML = [
                `<div style="font-weight:600; color:${sectorCol}; font-size:12px; margin-bottom:2px">${a.ticker} · ${a.sectorName}</div>`,
                `<div style="color:#94a3b8">Market Beta β: <span style="color:#f1f5f9; font-weight:500">${a.b.toFixed(2)}</span> &nbsp;·&nbsp; Degree: <span style="color:#f1f5f9; font-weight:500">${assetDegrees[nodeIdx]}</span></div>`,
                `<div style="color:#94a3b8; margin-top:2px">Top peers: <span style="color:#cbd5e1">${top3}</span></div>`
            ].join("");

            tooltipEl.style.display = "block";
            const posX = Math.min(Math.max(12, screenX + 16), containerW - 220);
            const posY = Math.min(Math.max(12, screenY - 24), containerH - 70);
            tooltipEl.style.left = `${posX}px`;
            tooltipEl.style.top = `${posY}px`;
        };

        const triggerShock = () => {
            manualShock = 1.0;
            manualShockTimer = 4.5; // Hold crisis shock for 4.5 seconds before smooth recovery
        };

        // Pointer move / leave listeners on section host for reliable cursor tracking
        const host = canvas.parentElement || canvas;
        const onPointerMove = (e) => {
            const r = canvas.getBoundingClientRect();
            localMouseX = e.clientX - r.left;
            localMouseY = e.clientY - r.top;
        };
        const onPointerLeave = () => {
            localMouseX = -1000;
            localMouseY = -1000;
            hoveredNode = -1;
            lastHoveredNode = -1;
            if (tooltipEl) tooltipEl.style.display = "none";
        };
        host.addEventListener("pointermove", onPointerMove, { passive: true });
        host.addEventListener("mousemove", onPointerMove, { passive: true });
        host.addEventListener("pointerleave", onPointerLeave, { passive: true });
        host.addEventListener("mouseleave", onPointerLeave, { passive: true });

        // Click interaction: Trigger manual crisis shock
        if (root.KW && root.KW.onClick) {
            root.KW.onClick(canvas, triggerShock);
        }

        // Keyboard interaction: press 'C' to trigger crisis shock
        const handleKeyDown = (e) => {
            if (e.key === "c" || e.key === "C" || e.key === " ") {
                triggerShock();
            }
        };
        if (typeof window !== "undefined") {
            window.addEventListener("keydown", handleKeyDown);
        }

        return GFX.mount(canvas, (gfx, c, getSize) => {
            const gl = GFX.gl;
            if (!MM && root.MarketMath) MM = root.MarketMath;
            assets = MM.createAssetUniverse(42);

            // Create VAO and VBO buffers
            starProg = gfx.program(VS_STARS, FS_STARS);
            lineProg = gfx.program(VS_LINES, FS_LINES);
            pulseProg = gfx.program(VS_PULSES, FS_PULSES);

            // Star attributes buffer setup
            starVAO = gl.createVertexArray();
            starVBO = gl.createBuffer();
            gl.bindVertexArray(starVAO);
            gl.bindBuffer(gl.ARRAY_BUFFER, starVBO);
            gl.bufferData(gl.ARRAY_BUFFER, starVertexData.byteLength, gl.DYNAMIC_DRAW);
            // location 0: pos (vec3)
            gl.enableVertexAttribArray(0);
            gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 7 * 4, 0);
            // location 1: attr (vec4: size, sector, highlight, twinkle)
            gl.enableVertexAttribArray(1);
            gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 7 * 4, 3 * 4);

            // Line attributes buffer setup
            lineVAO = gl.createVertexArray();
            lineVBO = gl.createBuffer();
            gl.bindVertexArray(lineVAO);
            gl.bindBuffer(gl.ARRAY_BUFFER, lineVBO);
            gl.bufferData(gl.ARRAY_BUFFER, lineVertexData.byteLength, gl.DYNAMIC_DRAW);
            gl.enableVertexAttribArray(0);
            gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 7 * 4, 0);
            gl.enableVertexAttribArray(1);
            gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 7 * 4, 3 * 4);

            // Pulse attributes buffer setup
            pulseVAO = gl.createVertexArray();
            pulseVBO = gl.createBuffer();
            gl.bindVertexArray(pulseVAO);
            gl.bindBuffer(gl.ARRAY_BUFFER, pulseVBO);
            gl.bufferData(gl.ARRAY_BUFFER, pulseVertexData.byteLength, gl.DYNAMIC_DRAW);
            gl.enableVertexAttribArray(0);
            gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 7 * 4, 0);
            gl.enableVertexAttribArray(1);
            gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 7 * 4, 3 * 4);

            gl.bindVertexArray(null);

            // Initial positions pre-converged to calm regime
            currentPositions = MM.createInitialLayout(assets, 1.35, 20);
            targetPositions = currentPositions.map(p => Float64Array.from(p));

            // Initialise pulse phases
            const rng = MM.mulberry32(54321);
            for (let e = 0; e < NUM_EDGES; e++) {
                pulsePhases[e] = rng();
            }

            // Initialise tooltip
            createTooltip();

            // Compute initial statistics
            const { C: initC } = MM.analyticCorrelationMatrix(assets, MM.SIGMA_M_CALM);
            correlationMatrix = initC;
            distanceMatrix = MM.computeDistanceMatrix(initC);
            const mstInit = MM.computeMST(distanceMatrix);
            mstEdges = mstInit.edges;
            latestStats = MM.computeMarketStats(correlationMatrix, distanceMatrix, ROLLING_WINDOW);
            updateCaption(true);

            return {
                resize: (rw, rh) => {
                    if (!sceneTarget) {
                        sceneTarget = gfx.target(rw, rh, { fp32: false });
                    } else {
                        sceneTarget.resize(rw, rh);
                    }
                },

                frame: (t, dt, outCtx2d, outW, outH, isReduced) => {
                    if (!sceneTarget || !assets || !MM) return;
                    simTime += dt;

                    const sz = getSize();
                    const cssW = sz.cssW || 800;
                    const cssH = sz.cssH || 600;

                    // 1. Regime Evolution & Smooth Transition
                    // Periodic cycle: 18.0s (0..6s Calm, 6..9.5s Transition, 9.5..14s Crisis, 14..18s Recovery)
                    const cyclePeriod = 18.0;
                    const cyclePhase = (simTime % cyclePeriod);

                    let autoCrisis = 0.0;
                    if (cyclePhase < 6.0) {
                        autoCrisis = 0.0;
                    } else if (cyclePhase < 9.5) {
                        const s = (cyclePhase - 6.0) / 3.5;
                        autoCrisis = s * s * (3.0 - 2.0 * s); // Smoothstep
                    } else if (cyclePhase < 14.0) {
                        autoCrisis = 1.0;
                    } else {
                        const s = 1.0 - (cyclePhase - 14.0) / 4.0;
                        autoCrisis = s * s * (3.0 - 2.0 * s);
                    }

                    // Handle manual shock timer
                    if (manualShockTimer > 0.0) {
                        manualShockTimer = Math.max(0.0, manualShockTimer - dt);
                        manualShock = 1.0;
                    } else if (manualShock > 0.0) {
                        manualShock = Math.max(0.0, manualShock - dt * 0.40);
                    }
                    crisisIntensity = Math.min(1.0, Math.max(autoCrisis, manualShock));

                    // Current market volatility
                    const sigmaM = MM.SIGMA_M_CALM + crisisIntensity * (MM.SIGMA_M_CRISIS - MM.SIGMA_M_CALM);

                    // 2. Physics & Matrix Statistics Tick
                    const { C } = MM.analyticCorrelationMatrix(assets, sigmaM);
                    correlationMatrix = C;
                    distanceMatrix = MM.computeDistanceMatrix(C);

                    const mstResult = MM.computeMST(distanceMatrix);
                    mstEdges = mstResult.edges;

                    // Update node degrees
                    assetDegrees.fill(0);
                    for (const e of mstEdges) {
                        assetDegrees[e.u]++;
                        assetDegrees[e.v]++;
                    }

                    // SMACOF step warm-started from targetPositions
                    const smacofIters = isReduced ? 1 : 2;
                    const nextXRaw = MM.smacofStep(targetPositions, distanceMatrix, smacofIters);
                    targetPositions = MM.procrustesAlign(nextXRaw, targetPositions);

                    // Smooth interpolation of current positions towards target positions
                    const lerpSpeed = isReduced ? 1.0 : Math.min(1.0, 9.0 * dt);
                    for (let i = 0; i < NUM_ASSETS; i++) {
                        currentPositions[i][0] += (targetPositions[i][0] - currentPositions[i][0]) * lerpSpeed;
                        currentPositions[i][1] += (targetPositions[i][1] - currentPositions[i][1]) * lerpSpeed;
                        currentPositions[i][2] += (targetPositions[i][2] - currentPositions[i][2]) * lerpSpeed;
                    }

                    // Periodic spectral stats calculation (every ~0.15s or on reduced)
                    latestStats = MM.computeMarketStats(correlationMatrix, distanceMatrix, ROLLING_WINDOW);
                    updateCaption(false);

                    // 3. Camera View & Projection Matrix
                    let curX = localMouseX, curY = localMouseY;
                    if (curX < -500 && window.KW && window.KW.local) {
                        const kLoc = window.KW.local(canvas);
                        curX = kLoc.x; curY = kLoc.y;
                    }
                    const hasMouse = curX > -500 && curX >= 0 && curX <= cssW && curY >= 0 && curY <= cssH;
                    const parX = hasMouse ? (curX / cssW - 0.5) * 0.55 : 0.0;
                    const parY = hasMouse ? (curY / cssH - 0.5) * 0.35 : 0.0;

                    const camTheta = t * 0.12 + parX;
                    const camPhi = 0.36 + 0.12 * Math.sin(t * 0.16) + parY;
                    const camDist = isMob ? 4.6 : 4.3;

                    // Shift camera target to the left (-0.62) so galaxy rests cleanly in the right half on desktop
                    const targetX = isMob ? 0.0 : -0.62;
                    const targetY = 0.0;
                    const targetZ = 0.0;

                    const eyeX = targetX + camDist * Math.cos(camTheta) * Math.cos(camPhi);
                    const eyeY = targetY + camDist * Math.sin(camPhi);
                    const eyeZ = targetZ + camDist * Math.sin(camTheta) * Math.cos(camPhi);

                    const aspect = (outW || 800) / Math.max(1, outH || 600);
                    const fov = 46.0 * (Math.PI / 180.0);
                    const f = 1.0 / Math.tan(fov / 2.0);
                    const near = 0.1, far = 25.0;

                    // Construct View Matrix
                    const zx = eyeX - targetX, zy = eyeY - targetY, zz = eyeZ - targetZ;
                    const zLen = Math.hypot(zx, zy, zz) || 1.0;
                    const z0 = zx / zLen, z1 = zy / zLen, z2 = zz / zLen;

                    const xx = -z2, xy = 0.0, xz = z0;
                    const xLen = Math.hypot(xx, xy, xz) || 1.0;
                    const x0 = xx / xLen, x1 = xy / xLen, x2 = xz / xLen;

                    const y0 = z1 * x2 - z2 * x1;
                    const y1 = z2 * x0 - z0 * x2;
                    const y2 = z0 * x1 - z1 * x0;

                    const v0 = x0, v1 = y0, v2 = z0;
                    const v4 = x1, v5 = y1, v6 = z1;
                    const v8 = x2, v9 = y2, v10 = z2;
                    const v12 = -(x0 * eyeX + x1 * eyeY + x2 * eyeZ);
                    const v13 = -(y0 * eyeX + y1 * eyeY + y2 * eyeZ);
                    const v14 = -(z0 * eyeX + z1 * eyeY + z2 * eyeZ);

                    const p0 = f / aspect, p5 = f;
                    const p10 = (far + near) / (near - far);
                    const p11 = -1.0;
                    const p14 = (2.0 * far * near) / (near - far);

                    // Combined View-Projection Matrix (column-major Float32Array)
                    const viewProj = new Float32Array([
                        v0 * p0,  v1 * p5,  v2 * p10 + v2 * p11 * 0.0, v2 * p11,
                        v4 * p0,  v5 * p5,  v6 * p10 + v6 * p11 * 0.0, v6 * p11,
                        v8 * p0,  v9 * p5,  v10 * p10 + v10 * p11 * 0.0, v10 * p11,
                        v12 * p0, v13 * p5, v14 * p10 + p14,           v14 * p11
                    ]);

                    // 4. Cursor Hover Hit-Testing
                    hoveredNode = -1;
                    let closestDistSq = 28.0 * 28.0; // 28px hit radius
                    let hoveredScreenX = 0, hoveredScreenY = 0;

                    if (hasMouse) {
                        for (let i = 0; i < NUM_ASSETS; i++) {
                            const p = currentPositions[i];
                            // Project 3-D position to clip space
                            const clipX = p[0] * viewProj[0] + p[1] * viewProj[4] + p[2] * viewProj[8] + viewProj[12];
                            const clipY = p[0] * viewProj[1] + p[1] * viewProj[5] + p[2] * viewProj[9] + viewProj[13];
                            const clipW = p[0] * viewProj[3] + p[1] * viewProj[7] + p[2] * viewProj[11] + viewProj[15];

                            if (clipW > 0.1) {
                                const ndcX = clipX / clipW;
                                const ndcY = clipY / clipW;
                                const sx = (ndcX * 0.5 + 0.5) * cssW;
                                const sy = (-ndcY * 0.5 + 0.5) * cssH;
                                const dx = sx - curX;
                                const dy = sy - curY;
                                const dSq = dx * dx + dy * dy;

                                if (dSq < closestDistSq) {
                                    closestDistSq = dSq;
                                    hoveredNode = i;
                                    hoveredScreenX = sx;
                                    hoveredScreenY = sy;
                                }
                            }
                        }
                    }

                    if (hoveredNode !== lastHoveredNode) {
                        lastHoveredNode = hoveredNode;
                        updateTooltip(hoveredNode, hoveredScreenX, hoveredScreenY, cssW, cssH);
                    } else if (hoveredNode !== -1) {
                        updateTooltip(hoveredNode, hoveredScreenX, hoveredScreenY, cssW, cssH);
                    }

                    const hoveredSector = hoveredNode !== -1 ? assets[hoveredNode].sector : -1;

                    // 5. Populate Vertex Buffers
                    // A. Star Splats Buffer
                    for (let i = 0; i < NUM_ASSETS; i++) {
                        const off = i * 7;
                        const p = currentPositions[i];
                        starVertexData[off]     = p[0];
                        starVertexData[off + 1] = p[1];
                        starVertexData[off + 2] = p[2];

                        // Size scaled by market beta b_i and MST degree
                        const beta = assets[i].b;
                        const deg = assetDegrees[i];
                        const starSize = 0.90 + (beta - 0.65) * 0.40 + deg * 0.15;
                        starVertexData[off + 3] = starSize;
                        starVertexData[off + 4] = assets[i].sector;

                        // Highlight factor
                        let highlight = 1.0;
                        if (hoveredNode !== -1) {
                            if (i === hoveredNode) highlight = 2.4;
                            else if (assets[i].sector === hoveredSector) highlight = 1.6;
                            else highlight = 0.22;
                        }
                        starVertexData[off + 5] = highlight;
                        starVertexData[off + 6] = i * 1.618; // Twinkle phase
                    }

                    // B. MST Edge Ribbons Buffer
                    for (let e = 0; e < mstEdges.length; e++) {
                        const edge = mstEdges[e];
                        const u = edge.u, v = edge.v;
                        const pu = currentPositions[u], pv = currentPositions[v];
                        const colU = SECTOR_COLS[assets[u].sector];
                        const colV = SECTOR_COLS[assets[v].sector];

                        let brightness = 1.0;
                        if (hoveredNode !== -1) {
                            if (u === hoveredNode || v === hoveredNode) brightness = 3.2;
                            else if (assets[u].sector === hoveredSector && assets[v].sector === hoveredSector) brightness = 1.6;
                            else brightness = 0.18;
                        }

                        // Endpoint U
                        const offU = e * 14;
                        lineVertexData[offU]     = pu[0];
                        lineVertexData[offU + 1] = pu[1];
                        lineVertexData[offU + 2] = pu[2];
                        lineVertexData[offU + 3] = colU[0];
                        lineVertexData[offU + 4] = colU[1];
                        lineVertexData[offU + 5] = colU[2];
                        lineVertexData[offU + 6] = brightness;

                        // Endpoint V
                        const offV = offU + 7;
                        lineVertexData[offV]     = pv[0];
                        lineVertexData[offV + 1] = pv[1];
                        lineVertexData[offV + 2] = pv[2];
                        lineVertexData[offV + 3] = colV[0];
                        lineVertexData[offV + 4] = colV[1];
                        lineVertexData[offV + 5] = colV[2];
                        lineVertexData[offV + 6] = brightness;
                    }

                    // C. Travelling Light Pulses Buffer
                    for (let e = 0; e < mstEdges.length; e++) {
                        const edge = mstEdges[e];
                        const u = edge.u, v = edge.v;
                        const rho = Math.abs(correlationMatrix[u][v]);

                        // Pulse speed scales with correlation rho
                        const speed = 0.35 + 1.25 * rho;
                        pulsePhases[e] = (pulsePhases[e] + dt * speed) % 1.0;
                        const s = pulsePhases[e];

                        const pu = currentPositions[u], pv = currentPositions[v];
                        const px = pu[0] + s * (pv[0] - pu[0]);
                        const py = pu[1] + s * (pv[1] - pu[1]);
                        const pz = pu[2] + s * (pv[2] - pu[2]);

                        const colU = SECTOR_COLS[assets[u].sector];
                        const colV = SECTOR_COLS[assets[v].sector];
                        const cr = colU[0] * (1.0 - s) + colV[0] * s;
                        const cg = colU[1] * (1.0 - s) + colV[1] * s;
                        const cb = colU[2] * (1.0 - s) + colV[2] * s;

                        let intensity = (0.9 + 1.5 * rho);
                        if (hoveredNode !== -1 && (u === hoveredNode || v === hoveredNode)) {
                            intensity *= 3.0;
                        }

                        const off = e * 7;
                        pulseVertexData[off]     = px;
                        pulseVertexData[off + 1] = py;
                        pulseVertexData[off + 2] = pz;
                        pulseVertexData[off + 3] = cr;
                        pulseVertexData[off + 4] = cg;
                        pulseVertexData[off + 5] = cb;
                        pulseVertexData[off + 6] = intensity;
                    }

                    // Upload buffer data to GPU
                    gl.bindBuffer(gl.ARRAY_BUFFER, starVBO);
                    gl.bufferSubData(gl.ARRAY_BUFFER, 0, starVertexData);

                    gl.bindBuffer(gl.ARRAY_BUFFER, lineVBO);
                    gl.bufferSubData(gl.ARRAY_BUFFER, 0, lineVertexData);

                    gl.bindBuffer(gl.ARRAY_BUFFER, pulseVBO);
                    gl.bufferSubData(gl.ARRAY_BUFFER, 0, pulseVertexData);

                    // 6. Render Layers to HDR Scene Target
                    gl.bindFramebuffer(gl.FRAMEBUFFER, sceneTarget.fbo);
                    gl.viewport(0, 0, sceneTarget.w, sceneTarget.h);
                    gl.clearColor(0.0, 0.0, 0.0, 0.0);
                    gl.clear(gl.COLOR_BUFFER_BIT);

                    gl.enable(gl.BLEND);
                    gl.blendFunc(gl.ONE, gl.ONE); // Additive luminous blending

                    // 6.1 Draw MST Lines
                    lineProg.use();
                    gl.uniformMatrix4fv(lineProg.u("uViewProj"), false, viewProj);
                    gl.uniform1f(lineProg.u("uCrisisIntensity"), crisisIntensity);
                    gl.bindVertexArray(lineVAO);
                    gl.drawArrays(gl.LINES, 0, mstEdges.length * 2);

                    // 6.2 Draw Travelling Light Pulses
                    const dpr = sz.dpr || 1.0;
                    pulseProg.use();
                    gl.uniformMatrix4fv(pulseProg.u("uViewProj"), false, viewProj);
                    gl.uniform1f(pulseProg.u("uPulseScale"), (isMob ? 0.70 : 1.0) * dpr);
                    gl.bindVertexArray(pulseVAO);
                    gl.drawArrays(gl.POINTS, 0, mstEdges.length);

                    // 6.3 Draw Star Billboard Splats
                    starProg.use();
                    gl.uniformMatrix4fv(starProg.u("uViewProj"), false, viewProj);
                    gl.uniform1f(starProg.u("uPointScale"), (isMob ? 9.5 : 14.0) * dpr);
                    gl.uniform1f(starProg.u("uTime"), t);

                    // Flatten sector colours into uniform array
                    const flatSectorCols = new Float32Array(18);
                    for (let s = 0; s < 6; s++) {
                        flatSectorCols[s * 3]     = SECTOR_COLS[s][0];
                        flatSectorCols[s * 3 + 1] = SECTOR_COLS[s][1];
                        flatSectorCols[s * 3 + 2] = SECTOR_COLS[s][2];
                    }
                    gl.uniform3fv(starProg.u("uSectorCols"), flatSectorCols);

                    gl.bindVertexArray(starVAO);
                    gl.drawArrays(gl.POINTS, 0, NUM_ASSETS);

                    gl.bindVertexArray(null);
                    gl.disable(gl.BLEND);

                    // 7. Compose with Dual-Kawase Bloom, Filmic Tonemapping, Vignette, and Grain
                    const domainAccent = root.KW && root.KW.col ? root.KW.col.a : [0.20, 0.78, 1.00];
                    GFX.compose(sceneTarget, outCtx2d, outW, outH, {
                        bloomGain: isMob ? 0.36 : 0.44,
                        exposure: 1.18,
                        time: t,
                        accent: domainAccent
                    });
                },

                dispose: () => {
                    host.removeEventListener("pointermove", onPointerMove);
                    host.removeEventListener("mousemove", onPointerMove);
                    host.removeEventListener("pointerleave", onPointerLeave);
                    host.removeEventListener("mouseleave", onPointerLeave);
                    if (typeof window !== "undefined") {
                        window.removeEventListener("keydown", handleKeyDown);
                    }
                    if (tooltipEl && tooltipEl.parentElement) {
                        tooltipEl.parentElement.removeChild(tooltipEl);
                        tooltipEl = null;
                    }
                    const gl = GFX.gl;
                    if (gl) {
                        if (starVAO) { gl.deleteVertexArray(starVAO); starVAO = null; }
                        if (starVBO) { gl.deleteBuffer(starVBO); starVBO = null; }
                        if (lineVAO) { gl.deleteVertexArray(lineVAO); lineVAO = null; }
                        if (lineVBO) { gl.deleteBuffer(lineVBO); lineVBO = null; }
                        if (pulseVAO) { gl.deleteVertexArray(pulseVAO); pulseVAO = null; }
                        if (pulseVBO) { gl.deleteBuffer(pulseVBO); pulseVBO = null; }
                    }
                    if (sceneTarget) { sceneTarget.dispose(); sceneTarget = null; }
                }
            };
        }, (c) => {
            // 2-D fallback
            if (typeof SIMS !== "undefined" && SIMS["options-pricing"]) {
                return SIMS["options-pricing"](c, opts);
            }
            if (root.ENGINES && root.ENGINES.paths) {
                return root.ENGINES.paths(c, { process: "gbm", paths: 65, steps: 220, mu: 0.05, sigma: 0.32 });
            }
            return null;
        });
    }

    /* =========================================================================
       Export API
       ========================================================================= */

    SIMS["market-galaxy"] = createMarketGalaxySim;
    SIMS.quant = createMarketGalaxySim;

    return { createMarketGalaxySim, SECTOR_COLS, SECTOR_HEX };
}));
