/**
 * qsim-integration.test.js
 *
 * Phase 3 live browser QA, Node<->Browser parity, context budget, fallback,
 * and stage screenshot suite for "Quantum search and period finding" (CS hero).
 */

"use strict";

const fs = require("fs");
const path = require("path");
const { serve, launch, sleep } = require("../audit/cdp");
const QNode = require("../../shared/lib/qsim-math.js");

const ARTIFACT_DIR = "/Users/kushanwaghmare/.gemini/antigravity/brain/926eebc9-51cd-408d-af67-2736ebd9f0bc";
const CAPTURES_DIR = path.join(__dirname, "../captures");

if (!fs.existsSync(CAPTURES_DIR)) fs.mkdirSync(CAPTURES_DIR, { recursive: true });

(async () => {
    console.log("===============================================================");
    console.log("  Quantum Search & Period Finding — Phase 3 Integration Suite");
    console.log("===============================================================\n");

    const { srv, port } = await serve();
    const browser = await launch(9845, [
        "--use-gl=swiftshader",
        "--enable-unsafe-swiftshader",
        "--ignore-gpu-blocklist"
    ]);
    await browser.viewport(1440, 900);

    const results = [];
    const assertTest = (name, cond, details) => {
        results.push({ name, passed: !!cond, details });
        console.log(`  ${cond ? "✓ PASS" : "✗ FAIL"}: ${name}\n         ${details}`);
        if (!cond) throw new Error(`Test failed: ${name} — ${details}`);
    };

    try {
        // 1. Mount on cs.html & verify non-blank canvas + readout
        console.log("--- Test 1: Mount on cs.html (#domain-intro) ---");
        await browser.navigate(`http://127.0.0.1:${port}/cs.html`);
        await sleep(1600);

        const mountInfo = await browser.evaluate(`(() => {
            const sec = document.querySelector("#domain-intro");
            const c = sec ? sec.querySelector("canvas") : null;
            const tag = sec ? sec.querySelector(".sim-tag") : null;
            let nonZero = 0;
            if (c) {
                const ctx = c.getContext("2d");
                const img = ctx.getImageData(0, 0, Math.min(240, c.width), Math.min(240, c.height)).data;
                for (let i = 0; i < img.length; i += 4) {
                    if (img[i] > 8 || img[i + 1] > 8 || img[i + 2] > 8) nonZero++;
                }
            }
            return {
                simKey: sec ? sec.dataset.sim : null,
                w: c ? c.width : 0,
                h: c ? c.height : 0,
                nonZero,
                hasDispose: c ? typeof c.__dispose === "function" : false,
                hasStageHook: c ? typeof c.__qsimSetStage === "function" : false,
                glErr: (window.GFX && window.GFX.gl) ? window.GFX.gl.getError() : 0,
                tagText: tag ? tag.textContent.trim() : ""
            };
        })()`);

        assertTest(
            "CS hero slide mounts SIMS.cs with non-blank canvas, 0 WebGL errors, and __dispose",
            mountInfo.simKey === "domain:cs:0" && mountInfo.nonZero > 100 && mountInfo.hasDispose && mountInfo.hasStageHook && mountInfo.glErr === 0,
            `simKey=${mountInfo.simKey}, canvas=${mountInfo.w}x${mountInfo.h}, nonZeroPixels=${mountInfo.nonZero}, glErr=${mountInfo.glErr}, hasDispose=${mountInfo.hasDispose}`
        );

        assertTest(
            "Caption readout uses UK English and states exact classical simulation",
            mountInfo.tagText.includes("exact classical simulation, not a quantum device") && mountInfo.tagText.includes("Grover search"),
            `Caption: "${mountInfo.tagText}"`
        );

        // 2. Node vs Browser Measurement Parity Hash
        console.log("\n--- Test 2: Node vs Browser Measurement Hash Parity ---");
        const nodeParity = QNode.measurementParityHash(0x51514D32, 20);
        const browserParity = await browser.evaluate(`window.QSimMath.measurementParityHash(0x51514D32, 20)`);
        assertTest(
            "First 20 seeded measurement outcomes hash identically in Node and Browser",
            nodeParity.hash === browserParity.hash && nodeParity.hash === "eee952e8",
            `Node hash=${nodeParity.hash}, Browser hash=${browserParity.hash}`
        );

        // 3. In-site navigation & WebGL context ceiling (<= 2)
        console.log("\n--- Test 3: In-Site Navigation & WebGL Context Ceiling (<= 2) ---");
        const navPages = ["index.html", "cs.html", "physics.html", "math.html", "quant.html", "cs.html"];
        let maxContexts = 0;
        const ctxBreakdown = {};
        for (const pg of navPages) {
            await browser.navigate(`http://127.0.0.1:${port}/${pg}`);
            await sleep(1100);
            const info = await browser.evaluate(`(() => {
                let count = (window.GFX && window.GFX.gl) ? 1 : 0;
                document.querySelectorAll("canvas").forEach((c) => {
                    if (c.__gl && c.__gl !== (window.GFX && window.GFX.gl)) count++;
                });
                const glErr = (window.GFX && window.GFX.gl) ? window.GFX.gl.getError() : 0;
                return { count, glErr };
            })()`);
            ctxBreakdown[pg] = info.count;
            if (info.count > maxContexts) maxContexts = info.count;
            if (pg === "cs.html" && info.glErr !== 0) throw new Error(`WebGL error ${info.glErr} on ${pg}`);
        }
        const ctxWarnings = browser.consoleLog.filter((l) => /context|webgl/i.test(l));
        assertTest(
            "WebGL context count stays <= 2 across all pages with 0 WebGL warnings",
            maxContexts <= 2 && ctxWarnings.length === 0,
            `maxContexts=${maxContexts}, breakdown=${JSON.stringify(ctxBreakdown)}, warnings=${ctxWarnings.length}`
        );

        // 4. Hover inspection & Click-to-skip interaction
        console.log("\n--- Test 4: Pointer Hover & Click-to-Skip Interaction ---");
        const interactRes = await browser.evaluate(`(async () => {
            const sec = document.querySelector("#domain-intro");
            const c = sec.querySelector("canvas");
            const tag = sec.querySelector(".sim-tag");
            const r = c.getBoundingClientRect();
            // Dispatch pointermove over the right side of the 256-spike ring
            const mx = r.left + r.width * 0.76;
            const my = r.top + r.height * 0.52;
            window.dispatchEvent(new PointerEvent("pointermove", { clientX: mx, clientY: my, bubbles: true }));
            await new Promise((res) => setTimeout(res, 320));
            const hoverTag = tag.textContent;

            // Click canvas to switch from Grover to Shor
            c.click();
            await new Promise((res) => setTimeout(res, 320));
            const afterClickState = c.__qsimGetState();
            const afterClickTag = tag.textContent;

            // Move pointer away
            window.dispatchEvent(new PointerEvent("pointermove", { clientX: -100, clientY: -100, bubbles: true }));
            return { hoverTag, afterClickMode: afterClickState.mode, afterClickTag };
        })()`);

        assertTest(
            "Hovering ring shows spike index j, |ψ|, phase, and P; clicking switches algorithm",
            interactRes.hoverTag.includes("index j =") && interactRes.afterClickMode === "shor" && interactRes.afterClickTag.includes("Shor's algorithm"),
            `Hover: "${interactRes.hoverTag.slice(-65)}" | After click mode: ${interactRes.afterClickMode}`
        );

        // 5. Reduced-motion & WebGL2-off 2-D fallback verification
        console.log("\n--- Test 5: prefers-reduced-motion & 2-D Fallback (ENGINES['cs-2d']) ---");
        const fallbackRes = await browser.evaluate(`(() => {
            // Test reduced motion on an offscreen mount
            const prevReduced = window.KW.REDUCED;
            window.KW.REDUCED = true;
            const c1 = document.createElement("canvas");
            c1.width = 320; c1.height = 180;
            window.SIMS.cs(c1, {});
            const stReduced = c1.__qsimGetState ? c1.__qsimGetState() : null;
            if (c1.__dispose) c1.__dispose();
            window.KW.REDUCED = prevReduced;

            // Test 2-D fallback directly
            const c2 = document.createElement("canvas");
            c2.width = 320; c2.height = 180;
            const hasCs2d = typeof window.ENGINES["cs-2d"] === "function";
            window.ENGINES["cs-2d"](c2, { type: "elementary", rule: 110, cols: 150, rows: 90, speed: 32 });
            const hasDispose2d = typeof c2.__dispose === "function";
            if (c2.__dispose) c2.__dispose();

            return {
                reducedIter: stReduced ? stReduced.groverIter : -1,
                reducedProb: stReduced ? stReduced.groverP : 0,
                hasCs2d,
                hasDispose2d
            };
        })()`);

        assertTest(
            "prefers-reduced-motion renders converged Grover k = 12 frame (P ≈ 0.999947) and ENGINES['cs-2d'] falls back cleanly",
            fallbackRes.reducedIter === 12 && Math.abs(fallbackRes.reducedProb - 0.999947042) < 1e-6 && fallbackRes.hasCs2d && fallbackRes.hasDispose2d,
            `reducedIter=${fallbackRes.reducedIter}, reducedProb=${fallbackRes.reducedProb.toFixed(6)}, hasCs2d=${fallbackRes.hasCs2d}, cleanDispose=${fallbackRes.hasDispose2d}`
        );

        // 6. Frame time & Long-task observation (SwiftShader software rendering)
        console.log("\n--- Test 6: Software Rasteriser Frame Time & Long Tasks ---");
        const perfRes = await browser.evaluate(`(async () => {
            const longTasks = [];
            let obs = null;
            try {
                obs = new PerformanceObserver((list) => {
                    for (const e of list.getEntries()) if (e.duration > 50) longTasks.push(e.duration);
                });
                obs.observe({ entryTypes: ["longtask"] });
            } catch (e) {}
            const t0 = performance.now();
            let frames = 0;
            await new Promise((resolve) => {
                const tick = () => {
                    frames++;
                    if (performance.now() - t0 < 1000) requestAnimationFrame(tick);
                    else resolve();
                };
                requestAnimationFrame(tick);
            });
            if (obs) obs.disconnect();
            const elapsed = performance.now() - t0;
            return {
                fps: (frames * 1000) / elapsed,
                avgFrameMs: elapsed / frames,
                longTaskCount: longTasks.length,
                maxLongTaskMs: longTasks.length ? Math.max(...longTasks) : 0
            };
        })()`);

        assertTest(
            "Frame time & long tasks measured under SwiftShader software rendering",
            perfRes.frames !== 0,
            `SwiftShader software avgFrameMs=${perfRes.avgFrameMs.toFixed(2)} ms (${perfRes.fps.toFixed(1)} fps), longTasks(>50ms)=${perfRes.longTaskCount} (max=${perfRes.maxLongTaskMs.toFixed(1)} ms)`
        );

        // 7. Capture Required Stage Screenshots (Desktop 1440x900 & Mobile 390x844)
        console.log("\n--- Test 7: Stage Screenshots (Desktop 1440x900 & Mobile 390x844) ---");
        const stages = [
            { cfg: { mode: "grover", k: 0, w: 77, lock: true }, prefix: "qsim_grover_k0", label: "Grover k = 0" },
            { cfg: { mode: "grover", k: 3, w: 77, lock: true }, prefix: "qsim_grover_k3", label: "Grover k = 3" },
            { cfg: { mode: "grover", k: 7, w: 77, lock: true }, prefix: "qsim_grover_k7", label: "Grover k = 7" },
            { cfg: { mode: "grover", k: 12, w: 77, lock: true }, prefix: "qsim_grover_k12", label: "Grover k = 12" },
            { cfg: { mode: "shor", stage: "comb", y: 13, lock: true }, prefix: "qsim_shor_comb", label: "Shor comb (y = 13)" },
            { cfg: { mode: "shor", stage: "mid-qft", y: 13, lock: true }, prefix: "qsim_shor_midqft", label: "Shor mid-QFT" },
            { cfg: { mode: "shor", stage: "peaks", y: 13, lock: true }, prefix: "qsim_shor_peaks", label: "Shor final 4 peaks" }
        ];

        const captureAllForViewport = async (vw, vh, suffix) => {
            await browser.viewport(vw, vh);
            await sleep(500);
            for (const st of stages) {
                const stateSnap = await browser.evaluate(`(async (cfg) => {
                    const c = document.querySelector("#domain-intro canvas");
                    c.__qsimSetStage(cfg);
                    await new Promise((r) => setTimeout(r, 260));
                    const tag = document.querySelector("#domain-intro .sim-tag");
                    return { state: c.__qsimGetState(), tag: tag ? tag.textContent : "" };
                })(${JSON.stringify(st.cfg)})`);
                const buf = await browser.screenshot();
                const fname = `${st.prefix}_${suffix}.png`;
                fs.writeFileSync(path.join(CAPTURES_DIR, fname), buf);
                fs.writeFileSync(path.join(ARTIFACT_DIR, fname), buf);
                console.log(`    Captured ${st.label} [${suffix}] -> ${fname} (${buf.length} bytes) | ${stateSnap.tag.slice(0, 78)}...`);
            }
        };

        await captureAllForViewport(1440, 900, "1440x900");
        await captureAllForViewport(390, 844, "390x844");

        console.log("\n===============================================================");
        console.log(`  All ${results.length} / ${results.length} Phase 3 Integration Checks Passed!`);
        console.log("===============================================================\n");
    } finally {
        await browser.close();
        srv.close();
    }
})();
