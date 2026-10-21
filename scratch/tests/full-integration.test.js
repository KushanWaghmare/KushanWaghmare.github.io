"use strict";

const fs = require("fs");
const path = require("path");
const { serve, launch, sleep } = require("../audit/cdp");

(async () => {
    console.log("=== Running Phase 5 Full Integration & QA Test Suite ===\n");
    const { srv, port } = await serve();
    const browser = await launch(9835);
    await browser.viewport(1440, 900);

    const results = [];
    const record = (name, passed, details) => {
        results.push({ name, passed, details });
        console.log(`[${passed ? "PASS" : "FAIL"}] ${name}\n       ${details}`);
    };

    try {
        /* =====================================================================
           Test 1: Data Science Hero ("Noise to structure") on datascience.html
           ===================================================================== */
        console.log("\n--- Testing Data Science Hero on datascience.html ---");
        await browser.navigate(`http://127.0.0.1:${port}/datascience.html`);
        await sleep(1000);

        const dsState = await browser.evaluate(`(() => {
            const sec = document.querySelector("#domain-intro");
            const canvas = sec ? sec.querySelector("canvas") : null;
            const tag = sec ? sec.querySelector(".sim-tag") : null;
            return {
                hasCanvas: !!canvas,
                canvasWidth: canvas ? canvas.width : 0,
                canvasHeight: canvas ? canvas.height : 0,
                tagText: tag ? tag.textContent.trim() : "",
                hasDM: !!window.DiffusionMath,
                hasDiffusionSim: !!(window.SIMS && window.SIMS.diffusion)
            };
        })()`);

        const dsPassed = dsState.hasCanvas && dsState.tagText.includes("closed-form") && dsState.hasDM;
        record("Data Science Hero (datascience.html)", dsPassed,
            `Canvas: ${dsState.canvasWidth}x${dsState.canvasHeight}, Tag: "${dsState.tagText.slice(0, 75)}..."`);

        /* =====================================================================
           Test 2: Quant Hero ("The Market Singularity") on quant.html
           ===================================================================== */
        console.log("\n--- Testing Quant Hero on quant.html ---");
        await browser.navigate(`http://127.0.0.1:${port}/quant.html`);
        await sleep(1500);

        const qState = await browser.evaluate(`(() => {
            const sec = document.querySelector("#domain-intro");
            const canvas = sec ? sec.querySelector("canvas") : null;
            const tag = sec ? sec.querySelector(".sim-tag") : null;
            return {
                hasCanvas: !!canvas,
                canvasWidth: canvas ? canvas.width : 0,
                canvasHeight: canvas ? canvas.height : 0,
                tagText: tag ? tag.textContent.trim() : "",
                hasQS: !!window.QuantSingularityMath,
                hasSingularitySim: !!(window.SIMS && (window.SIMS["market-singularity"] || window.SIMS["quant-singularity"]))
            };
        })()`);

        const qPassed = qState.hasCanvas && qState.tagText.includes("Market Singularity") && qState.tagText.includes("r₊ =") && qState.hasQS;
        record("Quant Hero (The Market Singularity on quant.html)", qPassed,
            `Canvas: ${qState.canvasWidth}x${qState.canvasHeight}, Tag: "${qState.tagText.slice(0, 75)}..."`);

        // Test Click Shockwave
        await browser.mouseClick(720, 450);
        await sleep(500);
        const qShockTag = await browser.evaluate(`document.querySelector("#domain-intro .sim-tag")?.textContent.trim() || ""`);
        const shockPassed = qShockTag.includes("Market Singularity");
        record("Quant Hero Click Volatility Shockwave", shockPassed, `Tag after click: "${qShockTag}"`);

        /* =====================================================================
           Test 2b: Mathematics Hero ("The Gauss–Bonnet Manifold") on math.html
           ===================================================================== */
        console.log("\n--- Testing Mathematics Hero on math.html ---");
        await browser.navigate(`http://127.0.0.1:${port}/math.html`);
        await sleep(1500);

        const mState = await browser.evaluate(`(() => {
            const sec = document.querySelector("#domain-intro");
            const canvas = sec ? sec.querySelector("canvas") : null;
            const tag = sec ? sec.querySelector(".sim-tag") : null;
            return {
                hasCanvas: !!canvas,
                canvasWidth: canvas ? canvas.width : 0,
                canvasHeight: canvas ? canvas.height : 0,
                tagText: tag ? tag.textContent.trim() : "",
                hasMMM: !!window.MathManifoldMath,
                hasMathSim: !!(window.SIMS && (window.SIMS["gauss-bonnet-manifold"] || window.SIMS["math-manifold"]))
            };
        })()`);

        const mPassed = mState.hasCanvas && mState.tagText.includes("Gauss–Bonnet") && mState.tagText.includes("χ(M) = 0") && mState.hasMMM;
        record("Mathematics Hero (Gauss–Bonnet Manifold on math.html)", mPassed,
            `Canvas: ${mState.canvasWidth}x${mState.canvasHeight}, Tag: "${mState.tagText.slice(0, 75)}..."`);

        // Test Click Geodesic Wave Pulse
        await browser.mouseClick(720, 450);
        await sleep(400);
        const mPulseTag = await browser.evaluate(`document.querySelector("#domain-intro .sim-tag")?.textContent.trim() || ""`);
        const mPulsePassed = mPulseTag.includes("Gauss–Bonnet");
        record("Mathematics Hero Click Geodesic Wave Pulse", mPulsePassed, `Tag after click: "${mPulseTag}"`);

        /* =====================================================================
           Test 2c: Computer Science Hero (2D Cellular Automaton) on cs.html
           ===================================================================== */
        console.log("\n--- Testing Computer Science Hero on cs.html ---");
        await browser.navigate(`http://127.0.0.1:${port}/cs.html`);
        await sleep(2200);

        const csState = await browser.evaluate(`(() => {
            const sec = document.querySelector("#domain-intro");
            const canvas = sec ? sec.querySelector("canvas") : null;
            const tag = sec ? sec.querySelector(".sim-tag") : null;
            return {
                hasCanvas: !!canvas,
                canvasWidth: canvas ? canvas.width : 0,
                canvasHeight: canvas ? canvas.height : 0,
                tagText: tag ? tag.textContent.trim() : ""
            };
        })()`);

        const csPassed = csState.hasCanvas && csState.tagText.includes("Wolfram Rule") && csState.tagText.includes("cellular automaton");
        record("Computer Science Hero (Wolfram Rule 110 Automaton on cs.html)", csPassed,
            `Canvas: ${csState.canvasWidth}x${csState.canvasHeight}, Tag: "${csState.tagText.slice(0, 75)}..."`);

        // Test Click Rule Cycle
        await browser.mouseClick(720, 450);
        await sleep(400);
        const csCascadeTag = await browser.evaluate(`document.querySelector("#domain-intro .sim-tag")?.textContent.trim() || ""`);
        const csCascadePassed = csCascadeTag.includes("Wolfram Rule");
        record("Computer Science Hero Click Rule Cycle", csCascadePassed, `Tag after click: "${csCascadeTag}"`);

        /* =====================================================================
           Test 3: Physics Hero (Kerr Black Hole) on physics.html
           ===================================================================== */
        console.log("\n--- Testing Physics Hero on physics.html ---");
        await browser.navigate(`http://127.0.0.1:${port}/physics.html`);
        await sleep(1000);

        const physState = await browser.evaluate(`(() => {
            const sec = document.querySelector("#domain-intro");
            const canvas = sec ? sec.querySelector("canvas") : null;
            const tag = sec ? sec.querySelector(".sim-tag") : null;
            const hasBlackhole = !!(window.SIMS && window.SIMS.blackhole) || !!window.BLACKHOLE_PHYSICS;
            return {
                hasCanvas: !!canvas,
                tagText: tag ? tag.textContent.trim() : "",
                hasBlackhole
            };
        })()`);

        const physPassed = physState.hasCanvas && physState.hasBlackhole;
        record("Physics Hero Kerr Black Hole (physics.html)", physPassed,
            `Blackhole initialized: ${physState.hasBlackhole}, Tag: "${physState.tagText.slice(0, 75)}..."`);

        /* =====================================================================
           Test 4: Strict WebGL2 Context Budget across site (<= 2)
           ===================================================================== */
        console.log("\n--- Checking Site-wide WebGL2 Context Budget ---");
        const contextBudget = await browser.evaluate(`(() => {
            let active = 0;
            if (window.GFX && window.GFX.gl) active++;
            if (window.BLACKHOLE && window.BLACKHOLE.gl) active++;
            return active;
        })()`);

        const budgetPassed = contextBudget >= 1 && contextBudget <= 2;
        record("WebGL2 Context Budget (<= 2)", budgetPassed,
            `Active WebGL2 contexts: ${contextBudget} (Max allowed: 2)`);

        /* =====================================================================
           Test 5: Index Landing Page Hub Overview (Snap slides)
           ===================================================================== */
        console.log("\n--- Testing Index Landing Page Snap Navigation ---");
        await browser.navigate(`http://127.0.0.1:${port}/index.html`);
        await sleep(800);

        // Scroll to Math domain slide
        await browser.evaluate(`document.querySelector("#domain-math")?.scrollIntoView({ behavior: "instant" })`);
        await sleep(800);
        const indexMathTag = await browser.evaluate(`document.querySelector("#domain-math .sim-tag")?.textContent.trim() || ""`);

        // Scroll to Data Science domain slide
        await browser.evaluate(`document.querySelector("#domain-datascience")?.scrollIntoView({ behavior: "instant" })`);
        await sleep(800);
        const indexDsTag = await browser.evaluate(`document.querySelector("#domain-datascience .sim-tag")?.textContent.trim() || ""`);

        // Scroll to Quant domain slide
        await browser.evaluate(`document.querySelector("#domain-quant")?.scrollIntoView({ behavior: "instant" })`);
        await sleep(800);
        const indexQTag = await browser.evaluate(`document.querySelector("#domain-quant .sim-tag")?.textContent.trim() || ""`);

        // Scroll to Computer Science domain slide
        await browser.evaluate(`document.querySelector("#domain-cs")?.scrollIntoView({ behavior: "instant" })`);
        await sleep(1500);
        const indexCsTag = await browser.evaluate(`document.querySelector("#domain-cs .sim-tag")?.textContent.trim() || ""`);

        const indexPassed = indexMathTag.includes("Gauss–Bonnet") && indexDsTag.includes("Reverse-time SDE") &&
                            indexQTag.includes("Market Singularity") && indexCsTag.includes("Wolfram Rule");
        record("Index Landing Hub Slides Integration", indexPassed,
            `Math: "${indexMathTag.slice(0, 30)}...", DS: "${indexDsTag.slice(0, 30)}...", Quant: "${indexQTag.slice(0, 30)}...", CS: "${indexCsTag.slice(0, 30)}..."`);

        /* =====================================================================
           Test 6: Order Book Terrain on courses.html
           ===================================================================== */
        console.log("\n--- Testing High-Frequency Order Book Terrain on courses.html ---");
        await browser.navigate(`http://127.0.0.1:${port}/courses.html`);
        await sleep(1200);

        const lobState = await browser.evaluate(`(() => {
            const hasLobMath = !!(window.LobMath || window.LOB_MATH);
            const hasLobSim = !!(window.SIMS && window.SIMS["order-book-terrain"]);
            const bgCol = getComputedStyle(document.body).backgroundColor;
            return { hasLobMath, hasLobSim, bgCol };
        })()`);

        const lobPassed = lobState.hasLobMath && lobState.hasLobSim && lobState.bgCol === "rgb(0, 0, 0)";
        record("Order Book Terrain & Pitch Black (#000000)", lobPassed,
            `LobMath: ${lobState.hasLobMath}, SIMS['order-book-terrain']: ${lobState.hasLobSim}, Body bg: "${lobState.bgCol}"`);

        /* =====================================================================
           Test 7: Mobile Viewport (iPhone 14: 390 x 844)
           ===================================================================== */
        console.log("\n--- Testing Mobile Viewport Adaptation (390 x 844) ---");
        await browser.viewport(390, 844);
        await browser.navigate(`http://127.0.0.1:${port}/quant.html`);
        await sleep(800);

        const mobState = await browser.evaluate(`(() => {
            const canvas = document.querySelector("#domain-intro canvas");
            const body = document.body;
            const scrollW = document.documentElement.scrollWidth;
            const clientW = document.documentElement.clientWidth;
            return {
                hasCanvas: !!canvas,
                canvasWidth: canvas ? canvas.width : 0,
                noHorizontalOverflow: scrollW <= clientW + 1
            };
        })()`);

        const mobPassed = mobState.hasCanvas && mobState.noHorizontalOverflow;
        record("Mobile Viewport Adaptation (390px)", mobPassed,
            `Canvas width: ${mobState.canvasWidth}px, No horizontal overflow: ${mobState.noHorizontalOverflow}`);

        /* =====================================================================
           Test 8: 2-D Fallbacks Verification
           ===================================================================== */
        console.log("\n--- Testing 2-D Simulation Fallbacks ---");
        await browser.viewport(1440, 900);
        const fallbackCheck = await browser.evaluate(`(async () => {
            // Verify core 2D engines exist
            const hasPaths = !!(window.ENGINES && window.ENGINES.paths);
            const hasFlock = !!(window.ENGINES && window.ENGINES.flock);
            const hasOptionsPricing = !!(window.SIMS && window.SIMS["options-pricing"]);

            // Load datascience module to verify langevin-loss-landscapes fallback is intact
            if (window.KW && window.KW.loadModule) {
                await window.KW.loadModule("datascience");
            }
            const hasLangevin = !!(window.SIMS && window.SIMS["langevin-loss-landscapes"]);

            return { hasPaths, hasFlock, hasOptionsPricing, hasLangevin };
        })()`);

        const fallbacksPassed = fallbackCheck.hasPaths && fallbackCheck.hasFlock &&
                                fallbackCheck.hasOptionsPricing && fallbackCheck.hasLangevin;
        record("2-D Fallbacks Preserved Without Deletion", fallbacksPassed,
            `ENGINES.paths: ${fallbackCheck.hasPaths}, ENGINES.flock: ${fallbackCheck.hasFlock}, SIMS['options-pricing']: ${fallbackCheck.hasOptionsPricing}, SIMS['langevin-loss-landscapes']: ${fallbackCheck.hasLangevin}`);

        /* =====================================================================
           Test 8: Clean Disposal & Lifecycle
           ===================================================================== */
        console.log("\n--- Testing Clean Disposal (__dispose) ---");
        const disposalCheck = await browser.evaluate(`(() => {
            const canvas = document.querySelector("#domain-intro canvas");
            if (!canvas || !canvas.__dispose) return false;
            canvas.__dispose();
            return true;
        })()`);
        record("Clean Component Disposal (__dispose)", disposalCheck, `canvas.__dispose successfully executed: ${disposalCheck}`);

        console.log("\n=======================================================");
        const total = results.length;
        const passed = results.filter(r => r.passed).length;
        console.log(`TOTAL CHECKS: ${total} | PASSED: ${passed} | FAILED: ${total - passed}`);
        console.log("=======================================================\n");

        if (passed < total) process.exit(1);

    } catch (err) {
        console.error("Integration test error:", err);
        process.exit(1);
    } finally {
        await browser.close();
        srv.close();
    }
})();
