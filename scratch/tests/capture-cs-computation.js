"use strict";

const fs = require("fs");
const path = require("path");
const { serve, launch, sleep } = require("../audit/cdp");

const ARTIFACT_DIR = "/Users/kushanwaghmare/.gemini/antigravity/brain/a9ccfa02-8650-4f91-b43c-a816d9090312";

(async () => {
    console.log("=== Capturing The Universal Computation Hyper-Structure (Phase 2) ===\n");
    const { srv, port } = await serve();
    const browser = await launch(9839);
    await browser.viewport(1440, 900);

    try {
        // 1. cs.html Hero (Dark Mode)
        console.log("1. Navigating to cs.html...");
        await browser.navigate(`http://127.0.0.1:${port}/cs.html`);
        await sleep(2200);

        const csState = await browser.evaluate(`(() => {
            const sec = document.querySelector("#domain-intro");
            const canvas = sec ? sec.querySelector("canvas") : null;
            const tag = sec ? sec.querySelector(".sim-tag") : null;
            const glCanvases = Array.from(document.querySelectorAll("canvas")).filter(c => {
                try { return !!(c.getContext("webgl2") || c.__gfxInst); } catch(e) { return false; }
            });

            return {
                hasCanvas: !!canvas,
                canvasWidth: canvas ? canvas.width : 0,
                canvasHeight: canvas ? canvas.height : 0,
                tagText: tag ? tag.textContent.trim() : "",
                hasCCM: !!window.CsComputationMath,
                hasCCS: !!window.CsComputationShaders,
                hasCsSim: !!(window.SIMS && (window.SIMS["universal-computation"] || window.SIMS["cs-computation"])),
                glCanvasCount: glCanvases.length
            };
        })()`);

        console.log("   CS Hero state:", csState);

        const darkBuf = await browser.screenshot();
        const darkPath = path.join(ARTIFACT_DIR, "cs_computation_dark.png");
        fs.writeFileSync(darkPath, darkBuf);
        console.log(`   Captured dark mode screenshot -> ${darkPath}`);

        // 2. Light Mode Capture
        console.log("2. Toggling theme to Light Mode...");
        await browser.evaluate(`(() => {
            const btn = document.querySelector(".theme-btn") || document.querySelector("#theme-toggle");
            if (btn) btn.click();
            else document.body.classList.toggle("light-mode");
        })()`);
        await sleep(900);

        const lightBuf = await browser.screenshot();
        const lightPath = path.join(ARTIFACT_DIR, "cs_computation_light.png");
        fs.writeFileSync(lightPath, lightBuf);
        console.log(`   Captured light mode screenshot -> ${lightPath}`);

        // Toggle back to dark mode
        await browser.evaluate(`(() => {
            const btn = document.querySelector(".theme-btn") || document.querySelector("#theme-toggle");
            if (btn) btn.click();
            else document.body.classList.toggle("light-mode");
        })()`);
        await sleep(600);

        // 3. Click Avalanche Logic Cascade Capture
        console.log("3. Triggering Avalanche Logic Cascade on canvas...");
        await browser.evaluate(`(() => {
            const sec = document.querySelector("#domain-intro");
            if (sec) sec.click();
        })()`);
        await sleep(400);

        const cascadeBuf = await browser.screenshot();
        const cascadePath = path.join(ARTIFACT_DIR, "cs_computation_cascade.png");
        fs.writeFileSync(cascadePath, cascadeBuf);
        console.log(`   Captured logic cascade screenshot -> ${cascadePath}`);

        // 4. index.html Hub Section Capture
        console.log("4. Navigating to index.html#domain-cs...");
        await browser.navigate(`http://127.0.0.1:${port}/index.html#domain-cs`);
        await sleep(1000);
        await browser.evaluate(`document.querySelector("#domain-cs")?.scrollIntoView({ behavior: "instant" })`);
        await sleep(1500);

        const hubState = await browser.evaluate(`(() => {
            const sec = document.querySelector("#domain-cs");
            const canvas = sec ? sec.querySelector("canvas") : null;
            const tag = sec ? sec.querySelector(".sim-tag") : null;
            return {
                hasCanvas: !!canvas,
                canvasWidth: canvas ? canvas.width : 0,
                canvasHeight: canvas ? canvas.height : 0,
                tagText: tag ? tag.textContent.trim() : ""
            };
        })()`);

        console.log("   Hub CS section state:", hubState);

        const hubBuf = await browser.screenshot();
        const hubPath = path.join(ARTIFACT_DIR, "cs_computation_hub.png");
        fs.writeFileSync(hubPath, hubBuf);
        console.log(`   Captured hub CS screenshot -> ${hubPath}`);

        console.log("\n=== Capture Complete ===");
        console.log("Console errors/warnings count:", browser.consoleLog.length);
        if (browser.consoleLog.length > 0) {
            console.log("Console log:", browser.consoleLog);
        }

    } catch (err) {
        console.error("Capture script failed:", err);
    } finally {
        await browser.close();
        srv.close();
    }
})();
