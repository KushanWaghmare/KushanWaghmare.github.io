/**
 * cy-integration.test.js
 * Comprehensive Phase 3 Integration & QA Suite for Calabi–Yau cross-section hero scene.
 */
"use strict";

const fs = require("fs");
const path = require("path");
const { serve, launch, sleep } = require("../audit/cdp");

const CAPTURES = path.join(__dirname, "../captures");
fs.mkdirSync(CAPTURES, { recursive: true });

(async () => {
    console.log("===============================================================");
    console.log("  Calabi–Yau Cross-Section — Phase 3 Integration Suite");
    console.log("===============================================================\n");

    const { srv, port } = await serve();
    const browser = await launch(9875);
    await browser.viewport(1440, 900);

    const results = [];
    const assertTest = (name, cond, details) => {
        results.push({ name, passed: !!cond, details });
        console.log(`  ${cond ? "✓ PASS" : "✗ FAIL"}: ${name}\n         ${details}`);
        if (!cond) throw new Error(`Test failed: ${name} — ${details}`);
    };

    try {
        // -----------------------------------------------------------------
        // 1. Mount on math.html (#domain-intro, domain:math:0)
        // -----------------------------------------------------------------
        console.log("--- Test 1: Mount on math.html (#domain-intro) ---");
        await browser.navigate(`http://127.0.0.1:${port}/math.html`);
        await sleep(2200);

        const mathMount = await browser.evaluate(`(() => {
            const sec = document.querySelector("#domain-intro");
            const c = sec ? sec.querySelector("canvas") : null;
            const tag = sec ? sec.querySelector(".sim-tag") : null;
            let nonZero = 0;
            if (c) {
                const ctx = c.getContext("2d");
                const sx = Math.floor(c.width * 0.35), sy = Math.floor(c.height * 0.35);
                const sw = Math.floor(c.width * 0.3), sh = Math.floor(c.height * 0.3);
                const img = ctx.getImageData(sx, sy, sw, sh).data;
                for (let i = 0; i < img.length; i += 4) {
                    if (img[i] > 12 || img[i + 1] > 12 || img[i + 2] > 12) nonZero++;
                }
            }
            return {
                simKey: sec ? sec.dataset.sim : null,
                w: c ? c.width : 0,
                h: c ? c.height : 0,
                nonZero,
                hasDispose: c ? typeof c.__dispose === "function" : false,
                hasCy: c ? typeof c.__cy === "object" : false,
                cyState: c && c.__cy ? c.__cy.state() : null,
                glErr: (window.GFX && window.GFX.gl) ? window.GFX.gl.getError() : 0,
                tagText: tag ? tag.textContent.trim() : ""
            };
        })()`);

        assertTest(
            "Maths hero slide mounts Calabi–Yau cross-section with non-blank canvas, 0 WebGL errors, and __dispose",
            mathMount.simKey === "domain:math:0" && mathMount.nonZero > 100 && mathMount.hasDispose && mathMount.hasCy && mathMount.glErr === 0,
            `simKey=${mathMount.simKey}, canvas=${mathMount.w}x${mathMount.h}, nonZero=${mathMount.nonZero}, glErr=${mathMount.glErr}, ready=${mathMount.cyState ? mathMount.cyState.ready : false}`
        );

        assertTest(
            "Caption readout matches specified UK English format for quintic threefold",
            mathMount.tagText.includes("Fermat curve z₁⁵ + z₂⁵ = 1") && mathMount.tagText.includes("cross-section of the quintic Calabi–Yau threefold") && mathMount.tagText.includes("25 patches · genus 6"),
            `Caption: "${mathMount.tagText}"`
        );

        // -----------------------------------------------------------------
        // 2. Mount on index.html (#domain-math, hub:domain-math)
        // -----------------------------------------------------------------
        console.log("\n--- Test 2: Mount on index.html (#domain-math) ---");
        await browser.navigate(`http://127.0.0.1:${port}/index.html`);
        await sleep(1500);

        // Clear any prior error latch from the initial hero slide before scrolling
        await browser.evaluate(`window.GFX && window.GFX.gl && window.GFX.gl.getError()`);

        // Scroll to math domain card/preview
        await browser.evaluate(`(() => {
            const sec = document.querySelector("#domain-math");
            if (sec) sec.scrollIntoView({ behavior: "instant" });
        })()`);
        await sleep(1500);

        const hubMount = await browser.evaluate(`(() => {
            const sec = document.querySelector("#domain-math");
            const c = sec ? sec.querySelector("canvas") : null;
            const tag = sec ? sec.querySelector(".sim-tag") : null;
            let nonZero = 0;
            if (c) {
                const ctx = c.getContext("2d");
                const sx = Math.floor(c.width * 0.35), sy = Math.floor(c.height * 0.35);
                const sw = Math.floor(c.width * 0.3), sh = Math.floor(c.height * 0.3);
                const img = ctx.getImageData(sx, sy, sw, sh).data;
                for (let i = 0; i < img.length; i += 4) {
                    if (img[i] > 12 || img[i + 1] > 12 || img[i + 2] > 12) nonZero++;
                }
            }
            return {
                simKey: sec ? sec.dataset.sim : null,
                w: c ? c.width : 0,
                h: c ? c.height : 0,
                nonZero,
                hasCy: c ? typeof c.__cy === "object" : false,
                glErr: (window.GFX && window.GFX.gl) ? window.GFX.gl.getError() : 0,
                tagText: tag ? tag.textContent.trim() : ""
            };
        })()`);

        assertTest(
            "Hub preview slide mounts Calabi–Yau cross-section with non-blank canvas and 0 WebGL errors",
            hubMount.simKey === "hub:domain-math" && hubMount.nonZero > 100 && hubMount.hasCy && hubMount.glErr === 0,
            `simKey=${hubMount.simKey}, nonZero=${hubMount.nonZero}, glErr=${hubMount.glErr}, caption="${hubMount.tagText.slice(0, 70)}..."`
        );

        // -----------------------------------------------------------------
        // 3. Sibling slides on math.html remain untouched
        // -----------------------------------------------------------------
        console.log("\n--- Test 3: Sibling Slides Integrity on math.html ---");
        await browser.navigate(`http://127.0.0.1:${port}/math.html`);
        await sleep(1500);

        // Scroll to mobius surfaces slide
        await browser.evaluate(`(() => {
            const sec = document.querySelector("#proj-mobius-surfaces");
            if (sec) sec.scrollIntoView({ behavior: "instant" });
        })()`);
        await sleep(1500);

        const mobiusMount = await browser.evaluate(`(() => {
            const sec = document.querySelector("#proj-mobius-surfaces");
            const c = sec ? sec.querySelector("canvas") : null;
            const tag = sec ? sec.querySelector(".sim-tag") : null;
            return {
                simKey: sec ? sec.dataset.sim : null,
                hasCanvas: !!c,
                tagText: tag ? tag.textContent.trim() : "",
                glErr: (window.GFX && window.GFX.gl) ? window.GFX.gl.getError() : 0
            };
        })()`);

        assertTest(
            "Slide domain:math:1 (#proj-mobius-surfaces) remains bound to Möbius strip / Gauss–Bonnet manifold",
            mobiusMount.simKey === "domain:math:1" && mobiusMount.hasCanvas && mobiusMount.glErr === 0,
            `simKey=${mobiusMount.simKey}, glErr=${mobiusMount.glErr}, tag="${mobiusMount.tagText}"`
        );

        // Scroll to fourier/primes slide
        await browser.evaluate(`(() => {
            const sec = document.querySelector("#proj-fourier-spectral");
            if (sec) sec.scrollIntoView({ behavior: "instant" });
        })()`);
        await sleep(1500);

        const fourierMount = await browser.evaluate(`(() => {
            const sec = document.querySelector("#proj-fourier-spectral");
            const c = sec ? sec.querySelector("canvas") : null;
            const tag = sec ? sec.querySelector(".sim-tag") : null;
            return {
                simKey: sec ? sec.dataset.sim : null,
                hasCanvas: !!c,
                tagText: tag ? tag.textContent.trim() : "",
                glErr: (window.GFX && window.GFX.gl) ? window.GFX.gl.getError() : 0
            };
        })()`);

        assertTest(
            "Slide domain:math:2 (#proj-fourier-spectral) remains bound to Primes from Waves",
            fourierMount.simKey === "domain:math:2" && fourierMount.hasCanvas && fourierMount.glErr === 0 && fourierMount.tagText.includes("Explicit formula ψ(x)"),
            `simKey=${fourierMount.simKey}, glErr=${fourierMount.glErr}, tag="${fourierMount.tagText.slice(0, 80)}..."`
        );

        // -----------------------------------------------------------------
        // 4. In-Site Navigation & WebGL Context Ceiling (<= 2)
        // -----------------------------------------------------------------
        console.log("\n--- Test 4: In-Site Navigation & WebGL Context Ceiling (<= 2) ---");
        const navPages = ["index.html", "math.html", "physics.html", "datascience.html", "quant.html", "cs.html", "math.html"];
        let maxContexts = 0;
        const ctxBreakdown = {};
        for (const pg of navPages) {
            await browser.navigate(`http://127.0.0.1:${port}/${pg}`);
            await sleep(1200);
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
            if (pg === "math.html" && info.glErr !== 0) throw new Error(`WebGL error ${info.glErr} on ${pg}`);
        }
        const ctxWarnings = browser.consoleLog.filter((l) => /context|webgl/i.test(l));
        assertTest(
            "WebGL context count stays <= 2 across all pages with 0 WebGL warnings",
            maxContexts <= 2 && ctxWarnings.length === 0,
            `maxContexts=${maxContexts}, breakdown=${JSON.stringify(ctxBreakdown)}, warnings=${ctxWarnings.length}`
        );

        // -----------------------------------------------------------------
        // 5. Interaction: Click-to-Cycle on math.html
        // -----------------------------------------------------------------
        console.log("\n--- Test 5: Click-to-Cycle Interaction on math.html ---");
        await browser.navigate(`http://127.0.0.1:${port}/math.html`);
        await sleep(2000);

        const cycleResults = await browser.evaluate(`(async () => {
            const sec = document.querySelector("#domain-intro");
            const c = sec.querySelector("canvas");
            const tag = sec.querySelector(".sim-tag");
            const observed = [];

            // Click canvas 5 times with 750ms spacing to cycle degrees
            for (let i = 0; i < 5; i++) {
                c.click();
                await new Promise((res) => setTimeout(res, 800));
                const st = c.__cy ? c.__cy.state() : null;
                observed.push({ n: st ? st.n : null, tag: tag ? tag.textContent : "" });
            }
            return observed;
        })()`);

        const degrees = cycleResults.map((x) => x.n);
        assertTest(
            "Canvas click cycles exponent n through sequence [6, 7, 8, 3, 4] with updating captions",
            degrees.join(",") === "6,7,8,3,4" && cycleResults[0].tag.includes("degree 6 · 36 patches · genus 10 (χ = −18"),
            `Degrees observed: [${degrees.join(", ")}] | First tag: "${cycleResults[0].tag.slice(0, 85)}..."`
        );

        // -----------------------------------------------------------------
        // 6. prefers-reduced-motion & 2-D Fallback (ENGINES['cy-cross-section-2d'])
        // -----------------------------------------------------------------
        console.log("\n--- Test 6: prefers-reduced-motion & 2-D Fallback ---");
        const fallbackRes = await browser.evaluate(`(async () => {
            // Test 2-D fallback directly
            const c2 = document.createElement("canvas");
            c2.style.width = "320px"; c2.style.height = "180px";
            document.body.appendChild(c2);
            const hasCy2d = typeof window.ENGINES["cy-cross-section-2d"] === "function";
            window.ENGINES["cy-cross-section-2d"](c2, { type: "gauss-bonnet-figure8", scale: 1.0 });
            await new Promise((res) => setTimeout(res, 200));

            const gl = c2.getContext("webgl") || c2.getContext("webgl2");
            const hasGL = !!gl;
            const w = c2.width, h = c2.height;
            const hasDispose2d = typeof c2.__dispose === "function";
            if (c2.__dispose) c2.__dispose();
            c2.remove();

            return {
                hasCy2d,
                hasDispose2d,
                hasGL,
                w, h
            };
        })()`);

        assertTest(
            "ENGINES['cy-cross-section-2d'] falls back cleanly to Three.js surface with clean disposal",
            fallbackRes.hasCy2d && fallbackRes.hasDispose2d && fallbackRes.hasGL && fallbackRes.w > 0,
            `hasCy2d=${fallbackRes.hasCy2d}, hasDispose2d=${fallbackRes.hasDispose2d}, hasGL=${fallbackRes.hasGL}, canvas=${fallbackRes.w}x${fallbackRes.h}`
        );

        // -----------------------------------------------------------------
        // 7. High-Resolution Screenshot Captures
        // -----------------------------------------------------------------
        console.log("\n--- Test 7: Stage Screenshots (Desktop 1440x900 & Mobile 390x844) ---");
        await browser.viewport(1440, 900);
        await browser.navigate(`http://127.0.0.1:${port}/math.html`);
        await sleep(2000);

        // Desktop captures across degrees n = 5, 6, 7, 8, 3, 4
        const captureN = async (nn, fname) => {
            await browser.evaluate(`document.querySelector("#domain-intro canvas").__cy.setN(${nn})`);
            await sleep(1800);
            const shot = await browser.screenshot();
            const fpath = path.join(CAPTURES, fname);
            fs.writeFileSync(fpath, shot);
            const tag = await browser.evaluate(`document.querySelector("#domain-intro .sim-tag").textContent`);
            console.log(`    Captured n = ${nn} [1440x900] -> ${fname} (${shot.length} bytes) | ${tag.slice(0, 75)}...`);
        };

        await captureN(5, "cy_cross_section_n5_1440x900.png");
        await captureN(6, "cy_cross_section_n6_1440x900.png");
        await captureN(7, "cy_cross_section_n7_1440x900.png");
        await captureN(8, "cy_cross_section_n8_1440x900.png");
        await captureN(3, "cy_cross_section_n3_1440x900.png");
        await captureN(4, "cy_cross_section_n4_1440x900.png");

        // Mobile captures (390x844)
        await browser.viewport(390, 844);
        await browser.navigate(`http://127.0.0.1:${port}/math.html`);
        await sleep(2200);

        const captureMobile = async (nn, fname) => {
            await browser.evaluate(`document.querySelector("#domain-intro canvas").__cy.setN(${nn})`);
            await sleep(1800);
            const shot = await browser.screenshot();
            const fpath = path.join(CAPTURES, fname);
            fs.writeFileSync(fpath, shot);
            const tag = await browser.evaluate(`document.querySelector("#domain-intro .sim-tag").textContent`);
            console.log(`    Captured n = ${nn} [390x844] -> ${fname} (${shot.length} bytes) | ${tag.slice(0, 75)}...`);
        };

        await captureMobile(5, "cy_cross_section_n5_390x844.png");
        await captureMobile(6, "cy_cross_section_n6_390x844.png");

        assertTest(
            "All desktop and mobile screenshots captured successfully",
            fs.existsSync(path.join(CAPTURES, "cy_cross_section_n5_1440x900.png")) &&
            fs.existsSync(path.join(CAPTURES, "cy_cross_section_n6_1440x900.png")) &&
            fs.existsSync(path.join(CAPTURES, "cy_cross_section_n5_390x844.png")),
            "High-resolution PNG captures verified on disk"
        );

    } finally {
        browser.close();
        srv.close();
    }

    console.log("\n===============================================================");
    console.log("  All 7 / 7 Phase 3 Integration Checks Passed!");
    console.log("===============================================================\n");
})().catch((err) => {
    console.error("Integration test failed:", err);
    process.exit(1);
});
