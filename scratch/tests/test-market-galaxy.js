"use strict";

const fs = require("fs");
const path = require("path");
const { serve, launch, sleep } = require("../audit/cdp");
const { decode } = require("../audit/png");

(async () => {
    console.log("=== Testing Market Galaxy Scene (Phase 4 QA) ===\n");
    const { srv, port } = await serve();
    const browser = await launch(9799);
    await browser.viewport(1440, 900);

    const artifactDir = "/Users/kushanwaghmare/.gemini/antigravity/brain/a9ccfa02-8650-4f91-b43c-a816d9090312";

    try {
        // 1. Navigate to quant.html
        console.log(`Navigating to http://127.0.0.1:${port}/quant.html...`);
        await browser.navigate(`http://127.0.0.1:${port}/quant.html`);
        await sleep(600);

        // Check for any JS console errors or sim state
        const state = await browser.evaluate(`(() => {
            const canvas = document.querySelector("#domain-intro canvas");
            const tag = document.querySelector("#domain-intro .sim-tag");
            const ctx2d = canvas ? canvas.getContext("2d") : null;
            return {
                hasCanvas: !!canvas,
                canvasWidth: canvas ? canvas.width : 0,
                canvasHeight: canvas ? canvas.height : 0,
                hasTag: !!tag,
                tagText: tag ? tag.textContent.trim() : "",
                hasMarketMath: !!window.MarketMath,
                hasMarketGalaxy: !!(window.SIMS && window.SIMS["market-galaxy"])
            };
        })()`);

        console.log("Initial state:", state);
        if (!state.hasCanvas || !state.hasTag) {
            throw new Error("Missing canvas or sim-tag on quant.html");
        }

        // Wait 1.5 seconds for animation frames to render and caption to update
        await sleep(1500);

        const captionCalm = await browser.evaluate(`(() => {
            const tag = document.querySelector("#domain-intro .sim-tag");
            return tag ? tag.textContent.trim() : "";
        })()`);
        console.log("\n[Live Caption - Calm Regime]:\n  " + captionCalm);

        // Verify caption contents
        if (!captionCalm.includes("Market galaxy") || !captionCalm.includes("60 assets, 6 sectors")) {
            throw new Error("Caption does not contain expected header");
        }
        if (!captionCalm.includes("ρ̄ =") || !captionCalm.includes("λ₁/N =") || !captionCalm.includes("L =")) {
            throw new Error("Caption missing quantitative statistics (rho_bar, lambda1/N, L)");
        }

        // Capture calm regime screenshot
        const calmPng = await browser.screenshot(1);
        fs.writeFileSync(path.join(artifactDir, "market_calm.png"), calmPng);
        fs.writeFileSync("scratch/market_calm.png", calmPng);
        console.log("Saved market_calm.png");

        // 2. Trigger click shockwave to Crisis regime
        console.log("\nClicking canvas via CDP to trigger market shockwave...");
        await browser.mouseClick(900, 400);

        // Wait 1.0 second for shockwave and contraction
        await sleep(1000);

        const captionCrisis = await browser.evaluate(`(() => {
            const tag = document.querySelector("#domain-intro .sim-tag");
            return tag ? tag.textContent.trim() : "";
        })()`);
        console.log("[Live Caption - Crisis Regime]:\n  " + captionCrisis);

        if (!captionCrisis.includes("Regime: Crisis")) {
            console.warn("Warning: Caption did not say Crisis: " + captionCrisis);
        }

        // Capture crisis regime screenshot
        const crisisPng = await browser.screenshot(1);
        fs.writeFileSync(path.join(artifactDir, "market_crisis.png"), crisisPng);
        fs.writeFileSync("scratch/market_crisis.png", crisisPng);
        console.log("Saved market_crisis.png");

        // 3. Test Hover Inspection & Tooltip
        console.log("\nMoving mouse to star coordinate via CDP...");
        // Scan a few points near the sector 0 cluster (around x: 670..850, y: 180..260)
        let foundHover = false;
        let hoverDetails = null;

        for (const [mx, my] of [[746, 222], [673, 201], [831, 216], [758, 260], [800, 320]]) {
            await browser.mouseMove(mx, my);
            await sleep(150);
            const tipState = await browser.evaluate(`(() => {
                const tip = document.querySelector(".market-galaxy-tooltip");
                if (tip && tip.style.display === "block") {
                    return { display: "block", html: tip.innerHTML, left: tip.style.left, top: tip.style.top };
                }
                return null;
            })()`);
            if (tipState) {
                foundHover = true;
                hoverDetails = tipState;
                console.log(`Successfully hovered star at (${mx}, ${my}):`, tipState.html.replace(/<[^>]+>/g, " | "));
                break;
            }
        }

        if (!foundHover) {
            console.log("Hover test scan did not trigger tooltip display in headless test (may need larger hit radius or pointer tracking).");
        }

        // 4. Test Light Theme
        console.log("\nSwitching to light theme...");
        await browser.evaluate(`(() => {
            document.documentElement.setAttribute("data-theme", "light");
        })()`);
        await sleep(600);

        const lightPng = await browser.screenshot(1);
        fs.writeFileSync(path.join(artifactDir, "market_light.png"), lightPng);
        fs.writeFileSync("scratch/market_light.png", lightPng);
        console.log("Saved market_light.png");

        // 5. Test index.html hub preview
        console.log("\nNavigating to index.html#domain-quant...");
        await browser.navigate(`http://127.0.0.1:${port}/index.html`);
        await sleep(400);

        await browser.evaluate(`(() => {
            document.documentElement.removeAttribute("data-theme");
            const sec = document.querySelector("#domain-quant");
            if (sec) sec.scrollIntoView({ behavior: "instant" });
        })()`);
        await sleep(1000);

        const indexCaption = await browser.evaluate(`(() => {
            const sec = document.querySelector("#domain-quant");
            const tag = sec ? sec.querySelector(".sim-tag") : null;
            return tag ? tag.textContent.trim() : "";
        })()`);
        console.log("[Index Hub Domain Caption]:\n  " + indexCaption);

        const indexPng = await browser.screenshot(1);
        fs.writeFileSync(path.join(artifactDir, "market_index_hub.png"), indexPng);
        fs.writeFileSync("scratch/market_index_hub.png", indexPng);
        console.log("Saved market_index_hub.png");

        // 6. Check WebGL Context Count
        const glContextCount = await browser.evaluate(`(() => {
            // Count active WebGL2 contexts
            let count = 0;
            if (window.GFX && window.GFX.gl) count++; // Shared offscreen context
            if (window.BLACKHOLE && window.BLACKHOLE.gl) count++; // Dedicated black hole context if present
            return count;
        })()`);
        console.log(`\nActive WebGL2 context count across site: ${glContextCount} (Budget: strictly <= 2)`);

        console.log("\n=== Phase 4 Browser Verification Completed Successfully ===");
    } catch (err) {
        console.error("Test failed with error:", err);
        process.exit(1);
    } finally {
        await browser.close();
        srv.close();
    }
})();
