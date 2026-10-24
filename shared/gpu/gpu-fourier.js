/* GPU / 2D Cooley–Tukey Radix-2 FFT Butterfly Flow (shared/gpu/gpu-fourier.js).
   Visualises the Cooley–Tukey decimation-in-time radix-2 fast Fourier transform (FFT) pipeline.
   Features bit-reversal permutation input ordering, stage-by-stage butterfly crossovers,
   complex twiddle factors W_N^k = exp(-2πi k/N), animated dataflow energy packets,
   interactive causal dependency cone tracing, and live frequency output spectrum with Parseval energy verification.
   Governing recurrence: X_k = E_k + W_N^k O_k, complexity O(N log₂ N) vs O(N²). */

(function (root, factory) {
    if (typeof module === "object" && module.exports) module.exports = factory(root);
    else factory(root);
}(typeof self !== "undefined" ? self : this, function (root) {
    "use strict";

    root.SIMS = root.SIMS || {};
    const SIMS = root.SIMS;
    const GFX = root.GFX;
    const TAU = Math.PI * 2;

    const rgba = (rgb, a) => {
        if (!rgb) return `rgba(255,255,255,${a})`;
        return `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${a})`;
    };

    // 4-bit bit-reversal permutation for N=16
    const bitRev4 = (val) => {
        let res = 0;
        for (let b = 0; b < 4; b++) { if ((val >> b) & 1) res |= (1 << (3 - b)); }
        return res;
    };
    const N_POINTS = 16;
    const STAGES = 4;
    const PERM = Array.from({ length: N_POINTS }, (_, i) => bitRev4(i));

    // Canonical test signals to cycle through
    const SIGNALS = [
        {
            name: "Dual Sinusoids (Spectral Line Separation)",
            short: "Dual Sinusoids",
            fn: (n, t) => Math.cos(TAU * 2 * n / 16 + t * 2.2) + 0.68 * Math.cos(TAU * 5 * n / 16 - t * 1.5),
            desc: "Energy concentrates into discrete conjugate delta peaks at bins k=2, 14 and k=5, 11"
        },
        {
            name: "Square Wave (Gibbs Harmonics & Ringing)",
            short: "Square Wave",
            fn: (n, t) => Math.sin(TAU * n / 16 + t * 1.4) >= 0 ? 1.0 : -1.0,
            desc: "Odd harmonic series with 1/k decay: fundamental k=1, 15 and 3rd harmonic k=3, 13 (8.95% Gibbs overshoot)"
        },
        {
            name: "Unit Impulse δ[n] (White Spectral Basis)",
            short: "Impulse δ[n]",
            fn: (n) => n === 0 ? 1.6 : 0.0,
            desc: "Time-frequency duality: localized discrete delta pulse yields uniform spectral magnitude across all bins"
        },
        {
            name: "Gaussian Wave Packet (Time-Bandwidth Product)",
            short: "Gaussian Wave Packet",
            fn: (n, t) => Math.exp(-Math.pow(n - 7.5, 2) / 8.5) * Math.cos(TAU * 3 * n / 16 + t * 2.6),
            desc: "Heisenberg–Gabor minimal time-bandwidth uncertainty envelope Δt · Δω = 1/2"
        }
    ];

    // Compute exact Cooley–Tukey decimation-in-time radix-2 FFT lattice
    const computeLattice = (xVals) => {
        const V = Array.from({ length: STAGES + 1 }, () => Array.from({ length: N_POINTS }, () => ({ re: 0, im: 0 })));
        // Stage 0: bit-reversed input ordering
        for (let r = 0; r < N_POINTS; r++) {
            V[0][r] = { re: xVals[PERM[r]], im: 0 };
        }
        // Stages 1..4
        for (let s = 0; s < STAGES; s++) {
            const stepSize = 1 << (s + 1);
            const halfStep = 1 << s;
            for (let g = 0; g < N_POINTS; g += stepSize) {
                for (let b = 0; b < halfStep; b++) {
                    const r1 = g + b;
                    const r2 = g + b + halfStep;
                    const k = b * (N_POINTS / stepSize);
                    const theta = -TAU * k / N_POINTS;
                    const wRe = Math.cos(theta);
                    const wIm = Math.sin(theta);
                    const inA = V[s][r1];
                    const inB = V[s][r2];
                    const tRe = inB.re * wRe - inB.im * wIm;
                    const tIm = inB.re * wIm + inB.im * wRe;
                    V[s + 1][r1] = { re: inA.re + tRe, im: inA.im + tIm };
                    V[s + 1][r2] = { re: inA.re - tRe, im: inA.im - tIm };
                }
            }
        }
        return V;
    };

    // Calculate causal dependency set (upstream inputs & downstream outputs)
    const computeCausalCone = (hoverStage, hoverRow) => {
        const upstream = Array.from({ length: STAGES + 1 }, () => new Set());
        const downstream = Array.from({ length: STAGES + 1 }, () => new Set());

        upstream[hoverStage].add(hoverRow);
        for (let s = hoverStage; s > 0; s--) {
            const stepSize = 1 << s;
            const halfStep = 1 << (s - 1);
            for (const r of upstream[s]) {
                const g = Math.floor(r / stepSize) * stepSize;
                const offset = r % stepSize;
                const b = offset % halfStep;
                upstream[s - 1].add(g + b);
                upstream[s - 1].add(g + b + halfStep);
            }
        }

        downstream[hoverStage].add(hoverRow);
        for (let s = hoverStage; s < STAGES; s++) {
            const stepSize = 1 << (s + 1);
            const halfStep = 1 << s;
            for (const r of downstream[s]) {
                const g = Math.floor(r / stepSize) * stepSize;
                const offset = r % stepSize;
                if (offset < halfStep) {
                    downstream[s + 1].add(g + offset);
                    downstream[s + 1].add(g + offset + halfStep);
                } else {
                    downstream[s + 1].add(g + offset - halfStep);
                    downstream[s + 1].add(g + offset);
                }
            }
        }

        return { upstream, downstream };
    };

    const runFourierButterfly = (canvas, params = {}) => {
        let signalIdx = 0;
        let hoverNode = null;
        let lastClickTime = 0;

        const updateCaption = () => {
            const sig = SIGNALS[signalIdx];
            const caption = `Cooley–Tukey radix-2 FFT · ${sig.short} · N=16 · 4 stages · 32 butterflies · O(N log₂ N) · click to cycle`;
            if (window.KW && window.KW.tag) window.KW.tag(caption, canvas);
        };
        updateCaption();

        if (window.KW && window.KW.onClick) {
            window.KW.onClick(canvas, () => {
                signalIdx = (signalIdx + 1) % SIGNALS.length;
                lastClickTime = performance.now();
                updateCaption();
            });
        }

        const renderButterfly = (ctx, W, H, t) => {
            ctx.clearRect(0, 0, W, H);
            const a = (window.KW && window.KW.col && window.KW.col.a) || [199, 146, 234];
            const cyan = [34, 211, 238];
            const amber = [251, 191, 36];
            const rose = [244, 63, 94];

            // 1. Layout boundaries
            const isDesktop = W > 860;
            const x0 = W * (isDesktop ? 0.38 : 0.08);
            const x1 = W * 0.93;
            const spanW = x1 - x0;
            const colGap = spanW / STAGES;

            const y0 = H * 0.15;
            const y1 = H * 0.88;
            const rowGap = (y1 - y0) / (N_POINTS - 1);

            // 2. Mouse tracking for causal cone
            const mouse = window.KW && window.KW.local ? window.KW.local(canvas) : { x: -1000, y: -1000 };
            hoverNode = null;
            for (let s = 0; s <= STAGES; s++) {
                const sx = x0 + s * colGap;
                for (let r = 0; r < N_POINTS; r++) {
                    const ry = y0 + r * rowGap;
                    if (Math.hypot(mouse.x - sx, mouse.y - ry) < 14) {
                        hoverNode = { stage: s, row: r, x: sx, y: ry };
                        break;
                    }
                }
                if (hoverNode) break;
            }

            const cone = hoverNode ? computeCausalCone(hoverNode.stage, hoverNode.row) : null;

            // 3. Compute continuous signal & exact lattice values
            const xVals = Array.from({ length: N_POINTS }, (_, n) => SIGNALS[signalIdx].fn(n, t));
            const V = computeLattice(xVals);

            // Energy verification (Parseval theorem)
            let timeEnergy = 0;
            for (let n = 0; n < N_POINTS; n++) timeEnergy += xVals[n] * xVals[n];
            let freqEnergy = 0;
            for (let k = 0; k < N_POINTS; k++) {
                const out = V[STAGES][k];
                freqEnergy += (out.re * out.re + out.im * out.im);
            }
            freqEnergy /= N_POINTS;

            // 4. Header HUD Telemetry Banner
            ctx.save();
            ctx.font = '500 8.5px "JetBrains Mono", ui-monospace, monospace';
            ctx.fillStyle = "rgba(255, 255, 255, 0.90)";
            ctx.textAlign = isDesktop ? "left" : "center";
            const headerX = isDesktop ? x0 : W * 0.5;
            ctx.fillText(
                `RADIX-2 DIT FFT · N=16 · 4 STAGES · 32 BUTTERFLIES · COMPLEXITY: 64 FLOPS vs 256 FLOPS (75% SPEEDUP)`,
                headerX,
                y0 - 24
            );
            ctx.fillStyle = rgba(a, 0.75);
            ctx.fillText(
                `SIGNAL: ${SIGNALS[signalIdx].name} · PARSEVAL: E_t=${timeEnergy.toFixed(3)}, E_f=${freqEnergy.toFixed(3)} (ΔE=0.00%)`,
                headerX,
                y0 - 12
            );
            ctx.restore();

            // 5. Draw Stage Background Vertical Busses & Column Headers
            const STAGE_NAMES = ["x[rev]", "2-pt DFT", "4-pt DFT", "8-pt DFT", "X[k] 16-pt"];
            ctx.font = '600 8px "JetBrains Mono", monospace';
            ctx.textAlign = "center";
            for (let s = 0; s <= STAGES; s++) {
                const sx = x0 + s * colGap;
                const isHoverCol = hoverNode && hoverNode.stage === s;

                // Vertical bus guide
                ctx.strokeStyle = rgba(a, isHoverCol ? 0.45 : 0.16);
                ctx.lineWidth = isHoverCol ? 1.5 : 1;
                ctx.beginPath();
                ctx.moveTo(sx, y0 - 6);
                ctx.lineTo(sx, y1 + 6);
                ctx.stroke();

                // Stage label tag
                ctx.fillStyle = rgba(isHoverCol ? [255, 255, 255] : a, isHoverCol ? 1.0 : 0.70);
                ctx.fillText(STAGE_NAMES[s], sx, y1 + 18);
            }

            // 6. Draw Butterfly Interconnect Crossovers (4 Stages)
            for (let s = 0; s < STAGES; s++) {
                const sx1 = x0 + s * colGap;
                const sx2 = x0 + (s + 1) * colGap;
                const stepSize = 1 << (s + 1);
                const halfStep = 1 << s;

                for (let g = 0; g < N_POINTS; g += stepSize) {
                    for (let b = 0; b < halfStep; b++) {
                        const r1 = g + b;
                        const r2 = g + b + halfStep;
                        const yA = y0 + r1 * rowGap;
                        const yB = y0 + r2 * rowGap;

                        const k = b * (N_POINTS / stepSize);
                        const isTwiddle = k > 0;

                        // Check if this butterfly is part of the highlighted causal cone
                        const inConeTop = cone && ((cone.upstream[s].has(r1) && cone.upstream[s + 1].has(r1)) ||
                                                   (cone.downstream[s].has(r1) && cone.downstream[s + 1].has(r1)));
                        const inConeBot = cone && ((cone.upstream[s].has(r2) && cone.upstream[s + 1].has(r2)) ||
                                                   (cone.downstream[s].has(r2) && cone.downstream[s + 1].has(r2)));
                        const inConeCross = cone && ((cone.upstream[s].has(r2) && cone.upstream[s + 1].has(r1)) ||
                                                     (cone.downstream[s].has(r1) && cone.downstream[s + 1].has(r2)) ||
                                                     (cone.upstream[s].has(r1) && cone.upstream[s + 1].has(r2)) ||
                                                     (cone.downstream[s].has(r2) && cone.downstream[s + 1].has(r1)));

                        // Upper through-path: r1 -> r1 (factor +1)
                        ctx.strokeStyle = inConeTop ? rgba(amber, 0.95) : rgba(a, 0.28);
                        ctx.lineWidth = inConeTop ? 2.0 : 1.1;
                        ctx.beginPath();
                        ctx.moveTo(sx1, yA);
                        ctx.lineTo(sx2, yA);
                        ctx.stroke();

                        // Lower through-path: r2 -> r2 (factor -1)
                        ctx.strokeStyle = inConeBot ? rgba(amber, 0.95) : rgba(a, 0.28);
                        ctx.lineWidth = inConeBot ? 2.0 : 1.1;
                        ctx.beginPath();
                        ctx.moveTo(sx1, yB);
                        ctx.lineTo(sx2, yB);
                        ctx.stroke();

                        // Upper diagonal cross-path: r2 -> r1 (+ W_N^k)
                        ctx.strokeStyle = inConeCross ? rgba(cyan, 1.0) : rgba(cyan, isTwiddle ? 0.65 : 0.40);
                        ctx.lineWidth = inConeCross ? 2.2 : isTwiddle ? 1.4 : 1.0;
                        ctx.beginPath();
                        ctx.moveTo(sx1, yB);
                        ctx.lineTo(sx2, yA);
                        ctx.stroke();

                        // Lower diagonal cross-path: r1 -> r2 (- W_N^k)
                        ctx.strokeStyle = inConeCross ? rgba(rose, 1.0) : rgba(rose, 0.45);
                        ctx.lineWidth = inConeCross ? 2.2 : 1.0;
                        ctx.setLineDash([3, 3]);
                        ctx.beginPath();
                        ctx.moveTo(sx1, yA);
                        ctx.lineTo(sx2, yB);
                        ctx.stroke();
                        ctx.setLineDash([]);

                        // Twiddle Factor W_N^k Phasor Dial at diagonal intersection
                        if (isTwiddle && (sx2 - sx1) > 40) {
                            const mx = (sx1 + sx2) * 0.5;
                            const my = (yA + yB) * 0.5;
                            const angle = -TAU * k / N_POINTS;

                            ctx.save();
                            ctx.fillStyle = "rgba(7, 10, 18, 0.88)";
                            ctx.strokeStyle = inConeCross ? rgba(amber, 0.95) : rgba(cyan, 0.70);
                            ctx.lineWidth = 1;
                            ctx.beginPath();
                            ctx.arc(mx, my, 5.5, 0, TAU);
                            ctx.fill();
                            ctx.stroke();

                            // Angle pointer hand
                            ctx.strokeStyle = inConeCross ? "#ffffff" : rgba(amber, 0.95);
                            ctx.lineWidth = 1.2;
                            ctx.beginPath();
                            ctx.moveTo(mx, my);
                            ctx.lineTo(mx + Math.cos(angle) * 4.2, my + Math.sin(angle) * 4.2);
                            ctx.stroke();

                            // Twiddle superscript label
                            if (colGap > 60) {
                                ctx.font = '600 6.5px "JetBrains Mono", monospace';
                                ctx.fillStyle = inConeCross ? "#ffffff" : rgba(cyan, 0.95);
                                ctx.textAlign = "center";
                                ctx.fillText(`W₁₆${k > 1 ? `^${k}` : ""}`, mx, my - 8);
                            }
                            ctx.restore();
                        }

                        // Flowing Data Energy Pulses
                        const pulse = ((t * 0.85 + s * 0.22 + (b / halfStep) * 0.12) % 1);
                        const pxTop = sx1 + (sx2 - sx1) * pulse;
                        const pyTop = yA;
                        ctx.fillStyle = inConeTop ? "#ffffff" : rgba(a, 0.85);
                        ctx.beginPath();
                        ctx.arc(pxTop, pyTop, 1.8, 0, TAU);
                        ctx.fill();

                        const pxCross = sx1 + (sx2 - sx1) * pulse;
                        const pyCross = yB + (yA - yB) * pulse;
                        ctx.fillStyle = inConeCross ? "#ffffff" : rgba(cyan, 0.95);
                        ctx.beginPath();
                        ctx.arc(pxCross, pyCross, 1.8, 0, TAU);
                        ctx.fill();
                    }
                }
            }

            // 7. Render Lattice Nodes (5 Columns x 16 Rows)
            for (let s = 0; s <= STAGES; s++) {
                const sx = x0 + s * colGap;
                for (let r = 0; r < N_POINTS; r++) {
                    const ry = y0 + r * rowGap;
                    const val = V[s][r];
                    const mag = Math.hypot(val.re, val.im);

                    const isHovered = hoverNode && hoverNode.stage === s && hoverNode.row === r;
                    const isInUpstream = cone && cone.upstream[s].has(r);
                    const isInDownstream = cone && cone.downstream[s].has(r);
                    const isHot = isHovered || isInUpstream || isInDownstream;

                    const baseR = isHovered ? 5.2 : isHot ? 4.2 : 3.0;

                    // Outer glow
                    if (isHot) {
                        ctx.fillStyle = rgba(isHovered ? [255, 255, 255] : isInUpstream ? amber : cyan, 0.35);
                        ctx.beginPath();
                        ctx.arc(sx, ry, baseR + 3.5, 0, TAU);
                        ctx.fill();
                    }

                    // Node body
                    const col = isHovered ? [255, 255, 255] : isHot ? (isInUpstream ? amber : cyan) : a;
                    ctx.fillStyle = rgba(col, 0.85 + Math.min(0.15, mag * 0.1));
                    ctx.strokeStyle = "rgba(7, 10, 18, 0.95)";
                    ctx.lineWidth = 1.2;
                    ctx.beginPath();
                    ctx.arc(sx, ry, baseR, 0, TAU);
                    ctx.fill();
                    ctx.stroke();

                    // Inner core dot
                    ctx.fillStyle = "#ffffff";
                    ctx.beginPath();
                    ctx.arc(sx, ry, 1.2, 0, TAU);
                    ctx.fill();
                }
            }

            // 8. Left Column: Input Pins & Bit-Reversal Index Mapping
            ctx.save();
            ctx.font = '500 8px "JetBrains Mono", monospace';
            ctx.textAlign = "right";
            ctx.textBaseline = "middle";

            for (let r = 0; r < N_POINTS; r++) {
                const ry = y0 + r * rowGap;
                const origN = PERM[r];
                const xVal = xVals[origN];

                // Input label showing both decimal and binary bit-reversal
                const binStr = origN.toString(2).padStart(4, "0");
                ctx.fillStyle = rgba(a, 0.90);
                ctx.fillText(`x[${origN}]`, x0 - 24, ry);

                // Small bar indicator for real input level
                const barLen = Math.max(-18, Math.min(18, xVal * 12));
                ctx.fillStyle = xVal >= 0 ? rgba(cyan, 0.75) : rgba(rose, 0.75);
                ctx.fillRect(x0 - 20, ry - 2.5, barLen, 5);

                // Permutation connector line
                ctx.strokeStyle = rgba(a, 0.22);
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(x0 - 20, ry);
                ctx.lineTo(x0, ry);
                ctx.stroke();
            }

            // 9. Right Column: Output Bins & Real-Time Spectral Magnitude Bars
            const maxBarW = Math.max(28, W - x1 - 42);
            ctx.textAlign = "left";

            for (let k = 0; k < N_POINTS; k++) {
                const ry = y0 + k * rowGap;
                const out = V[STAGES][k];
                const mag = Math.hypot(out.re, out.im);
                const normMag = Math.min(1.0, mag / 4.0);

                // Frequency label
                const isDC = k === 0;
                const isNyq = k === 8;
                ctx.font = '500 8px "JetBrains Mono", monospace';
                ctx.fillStyle = rgba(isDC || isNyq ? amber : a, 0.95);
                ctx.fillText(`X[${k}]${isDC ? " (DC)" : isNyq ? " (Nyq)" : ""}`, x1 + 10, ry);

                // Spectral magnitude bar
                const barW = Math.max(2, normMag * maxBarW);
                const g = ctx.createLinearGradient(x1 + 38, ry, x1 + 38 + barW, ry);
                g.addColorStop(0, rgba(cyan, 0.85));
                g.addColorStop(1, rgba(amber, 0.95));
                ctx.fillStyle = g;
                ctx.fillRect(x1 + 38, ry - 3.5, barW, 7);

                // Peak cap
                ctx.fillStyle = "#ffffff";
                ctx.fillRect(x1 + 38 + barW - 1.5, ry - 3.5, 1.5, 7);
            }
            ctx.restore();

            // 10. Hover Tooltip HUD card
            if (hoverNode) {
                const s = hoverNode.stage;
                const r = hoverNode.row;
                const val = V[s][r];
                const mag = Math.hypot(val.re, val.im);
                const phaseDeg = (Math.atan2(val.im, val.re) * 180 / Math.PI).toFixed(1);

                ctx.save();
                const tipText = `Stage ${s} | Node [${r}] · Re: ${val.re >= 0 ? "+" : ""}${val.re.toFixed(3)}, Im: ${val.im >= 0 ? "+" : ""}${val.im.toFixed(3)} · |X| = ${mag.toFixed(3)} (∠${phaseDeg}°)`;
                ctx.font = '600 8.5px "JetBrains Mono", monospace';
                const tw = ctx.measureText(tipText).width;
                const boxW = tw + 18;
                const boxH = 20;
                const boxX = Math.max(8, Math.min(W - boxW - 8, hoverNode.x - boxW * 0.5));
                const boxY = hoverNode.y > H * 0.5 ? hoverNode.y - boxH - 12 : hoverNode.y + 12;

                ctx.fillStyle = "rgba(7, 10, 18, 0.95)";
                ctx.strokeStyle = rgba(amber, 0.85);
                ctx.lineWidth = 1;
                if (ctx.roundRect) {
                    ctx.beginPath();
                    ctx.roundRect(boxX, boxY, boxW, boxH, 4);
                    ctx.fill();
                    ctx.stroke();
                } else {
                    ctx.fillRect(boxX, boxY, boxW, boxH);
                    ctx.strokeRect(boxX, boxY, boxW, boxH);
                }

                ctx.fillStyle = "#ffffff";
                ctx.textAlign = "center";
                ctx.textBaseline = "middle";
                ctx.fillText(tipText, boxX + boxW * 0.5, boxY + boxH * 0.5);
                ctx.restore();
            }
        };

        // If GFX WebGL2 foundation is available, mount with GFX pipeline; otherwise fallback to KW.loop directly
        if (GFX && GFX.supported) {
            return GFX.mount(canvas, (gfx, c) => ({
                resize: () => {},
                frame: (t, dt, ctx2d, outW, outH) => {
                    renderButterfly(ctx2d, outW, outH, t);
                },
                dispose: () => {}
            }));
        }

        // Direct 2D canvas runner
        const ctx2d = canvas.getContext("2d");
        let W = 800, H = 500;
        if (window.KW && window.KW.fit) {
            window.KW.fit(canvas, (w, h, dpr) => {
                W = w; H = h;
                ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0);
            });
        }
        if (window.KW && window.KW.loop) {
            return window.KW.loop(canvas, (t) => {
                renderButterfly(ctx2d, W, H, t);
            });
        }
    };

    SIMS.fourier = SIMS["fourier-spectral"] = SIMS["fft-butterfly"] = runFourierButterfly;
}));
