"use strict";

const fs = require("fs");
const path = require("path");
const { serve, launch, sleep } = require("./audit/cdp");

(async () => {
    console.log("Starting GFX Verification Suite (Phase 2)...");
    const { srv, port } = await serve();
    const browser = await launch(9755);
    await browser.viewport(1280, 800);

    try {
        console.log(`Navigating to http://127.0.0.1:${port}/scratch/gfx-test.html...`);
        await browser.navigate(`http://127.0.0.1:${port}/scratch/gfx-test.html`);

        // Wait for tests to finish
        let results = null;
        for (let i = 0; i < 40; i++) {
            await sleep(200);
            results = await browser.evaluate("window.TEST_RESULTS");
            if (results && results.tests && results.tests.length >= 7) break;
        }

        if (!results || !results.tests || results.tests.length === 0) {
            throw new Error("Timed out waiting for GFX tests to complete.");
        }

        console.log("\n================ GFX TEST RESULTS ================");
        let allPassed = true;
        for (const t of results.tests) {
            const status = t.passed ? "PASS" : "FAIL";
            if (!t.passed) allPassed = false;
            console.log(`[${status}] ${t.name}`);
            console.log(`       Details: ${t.details}`);
        }
        console.log("==================================================\n");

        // Wait an additional 300ms for several frames of particle animation and bloom
        await sleep(400);

        // Capture verification screenshot
        const screenshotPng = await browser.screenshot(1);
        fs.writeFileSync("scratch/gfx-test.png", screenshotPng);
        console.log("Saved scratch/gfx-test.png verification screenshot.");

        if (!allPassed || !results.passed) {
            console.error("One or more GFX tests failed!");
            process.exit(1);
        } else {
            console.log("ALL 7 GFX FOUNDATION SUITES PASSED!");
            process.exit(0);
        }
    } catch (err) {
        console.error("Test execution failed:", err);
        process.exit(1);
    } finally {
        browser.close();
        srv.close();
    }
})();
