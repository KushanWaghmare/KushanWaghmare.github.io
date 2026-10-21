"use strict";

const fs = require("fs");
const path = require("path");
const { serve, launch, sleep, ROOT } = require("./audit/cdp");

const ARTIFACT_DIR = "/Users/kushanwaghmare/.gemini/antigravity/brain/a9ccfa02-8650-4f91-b43c-a816d9090312";

(async () => {
    console.log("Starting Phase 3 Order Book Terrain QA & Integration Suite...\n");
    const { srv, port } = await serve();
    const browser = await launch(9844, [
        "--use-gl=swiftshader",
        "--enable-unsafe-swiftshader",
        "--ignore-gpu-blocklist"
    ]);

    try {
        // -------------------------------------------------------------
        // 1. Desktop Test (1280 x 800) on papers.html (Paper 02 Hero)
        // -------------------------------------------------------------
        console.log("1. Testing Desktop (1280x800) at papers.html#paper-hft-stat-arb-microstructure...");
        await browser.viewport(1280, 800);
        await browser.navigate(`http://127.0.0.1:${port}/papers.html`);
        await sleep(400);

        // Scroll to paper-hft-stat-arb-microstructure
        await browser.evaluate(`(() => {
            const sec = document.querySelector("#paper-hft-stat-arb-microstructure");
            if (sec) {
                sec.scrollIntoView({ behavior: "instant" });
                sec.querySelectorAll("[data-reveal], [data-hero]").forEach(el => el.classList.add("revealed"));
            }
        })()`);
        await sleep(600);

        // Check WebGL context count and GFX state
        const contextCheck = await browser.evaluate(`(() => {
            const glCanvas = window.GFX ? window.GFX.gl?.canvas : null;
            const visibleCanvases = Array.from(document.querySelectorAll("canvas"));
            const liveContexts = visibleCanvases.filter(c => c.__gfxInst || c.__bhInst).length;
            return {
                gfxSupported: !!(window.GFX && window.GFX.supported),
                hasGl: !!(window.GFX && window.GFX.gl),
                totalCanvases: visibleCanvases.length,
                liveContexts
            };
        })()`);
        console.log("   Context check:", contextCheck);

        // Capture at t = 3s (Calm state)
        console.log("   Waiting for t = 3s (calm state)...");
        await sleep(2200);
        const tagCalm = await browser.evaluate(`document.querySelector("#paper-hft-stat-arb-microstructure .sim-tag")?.textContent.trim() || ""`);
        console.log("   Caption at t=3s:", tagCalm);
        const shotCalm = await browser.screenshot(1);
        fs.writeFileSync(path.join(ARTIFACT_DIR, "lob_desktop_t3_calm.png"), shotCalm);
        fs.writeFileSync("scratch/lob_desktop_t3_calm.png", shotCalm);
        console.log("   ✓ Saved lob_desktop_t3_calm.png");

        // Interaction: Click to fire exogenous market order
        console.log("   Clicking right half (x = 750, y = 400) to fire BUY market order cascade...");
        await browser.mouseClick(750, 400);
        await sleep(200);

        // Capture cascade right after click
        const shotCascade = await browser.screenshot(1);
        fs.writeFileSync(path.join(ARTIFACT_DIR, "lob_desktop_cascade.png"), shotCascade);
        fs.writeFileSync("scratch/lob_desktop_cascade.png", shotCascade);
        console.log("   ✓ Saved lob_desktop_cascade.png");

        // Wait to t = 10s
        console.log("   Waiting for t = 10s...");
        await sleep(6500);
        const tag10 = await browser.evaluate(`document.querySelector("#paper-hft-stat-arb-microstructure .sim-tag")?.textContent.trim() || ""`);
        console.log("   Caption at t=10s:", tag10);
        const shot10 = await browser.screenshot(1);
        fs.writeFileSync(path.join(ARTIFACT_DIR, "lob_desktop_t10.png"), shot10);
        fs.writeFileSync("scratch/lob_desktop_t10.png", shot10);
        console.log("   ✓ Saved lob_desktop_t10.png");

        // Wait to t = 20s
        console.log("   Waiting for t = 20s...");
        await sleep(10000);
        const tag20 = await browser.evaluate(`document.querySelector("#paper-hft-stat-arb-microstructure .sim-tag")?.textContent.trim() || ""`);
        console.log("   Caption at t=20s:", tag20);
        const shot20 = await browser.screenshot(1);
        fs.writeFileSync(path.join(ARTIFACT_DIR, "lob_desktop_t20.png"), shot20);
        fs.writeFileSync("scratch/lob_desktop_t20.png", shot20);
        console.log("   ✓ Saved lob_desktop_t20.png");

        // -------------------------------------------------------------
        // 2. Mobile Test (390 x 844)
        // -------------------------------------------------------------
        console.log("\n2. Testing Mobile (390x844)...");
        await browser.viewport(390, 844);
        await browser.navigate(`http://127.0.0.1:${port}/papers.html`);
        await sleep(400);

        await browser.evaluate(`(() => {
            const sec = document.querySelector("#paper-hft-stat-arb-microstructure");
            if (sec) {
                sec.scrollIntoView({ behavior: "instant" });
                sec.querySelectorAll("[data-reveal], [data-hero]").forEach(el => el.classList.add("revealed"));
            }
        })()`);
        await sleep(1200);

        const shotMobile = await browser.screenshot(1);
        fs.writeFileSync(path.join(ARTIFACT_DIR, "lob_mobile_390x844.png"), shotMobile);
        fs.writeFileSync("scratch/lob_mobile_390x844.png", shotMobile);
        console.log("   ✓ Saved lob_mobile_390x844.png");

        // -------------------------------------------------------------
        // 3. Event-Hash Parity Test (Browser vs Node)
        // -------------------------------------------------------------
        console.log("\n3. Testing Event-Hash Parity in Browser...");
        const browserHash = await browser.evaluate(`(() => {
            if (!window.LOB_MATH) return "NO_LOB_MATH";
            const book = new window.LOB_MATH.LimitOrderBook({ seed: 909 });
            const events = [];
            while (events.length < 1000) {
                const ev = book.step();
                if (ev.eventType === "market") {
                    events.push({ t: ev.t, type: ev.type, strike: ev.strike, size: ev.size });
                }
            }
            return window.LOB_MATH.hashEvents(events);
        })()`);
        console.log(`   Browser Event Hash: 0x${browserHash}`);

        // -------------------------------------------------------------
        // 4. Reduced Motion Test
        // -------------------------------------------------------------
        console.log("\n4. Testing Reduced Motion (Single Converged Frame)...");
        const reducedCheck = await browser.evaluate(`(() => {
            return {
                reduced: !!(window.KW && window.KW.REDUCED)
            };
        })()`);
        console.log("   Reduced motion check:", reducedCheck);

        // -------------------------------------------------------------
        // 5. Coursework & Detail Shell Routes Verification
        // -------------------------------------------------------------
        console.log("\n5. Testing Coursework route (courses.html#track-advanced-quant-systems)...");
        await browser.viewport(1280, 800);
        await browser.navigate(`http://127.0.0.1:${port}/courses.html`);
        await sleep(400);
        await browser.evaluate(`(() => {
            const sec = document.querySelector("#track-advanced-quant-systems");
            if (sec) {
                sec.scrollIntoView({ behavior: "instant" });
                sec.querySelectorAll("[data-reveal]").forEach(el => el.classList.add("revealed"));
            }
        })()`);
        await sleep(1000);
        const shotCourses = await browser.screenshot(1);
        fs.writeFileSync(path.join(ARTIFACT_DIR, "lob_courses_track.png"), shotCourses);
        fs.writeFileSync("scratch/lob_courses_track.png", shotCourses);
        console.log("   ✓ Saved lob_courses_track.png");

        console.log("\n================ ALL QA RUNS COMPLETE ================\n");

    } finally {
        browser.close();
        srv.close();
    }
})();
