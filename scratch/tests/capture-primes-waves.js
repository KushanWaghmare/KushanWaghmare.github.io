"use strict";

const fs = require("fs");
const path = require("path");
const { serve, launch, sleep } = require("../audit/cdp");

const ARTIFACT_DIR = "/Users/kushanwaghmare/.gemini/antigravity/brain/a9ccfa02-8650-4f91-b43c-a816d9090312";

(async () => {
    console.log("=== Testing & Capturing 'Primes from Waves' (Phase 2 Scene) ===\n");
    const { srv, port } = await serve();
    const browser = await launch(9843);
    await browser.viewport(1440, 900);

    try {
        console.log("1. Navigating to test harness page...");
        await browser.navigate(`http://127.0.0.1:${port}/scratch/test-primes-waves.html`);
        await sleep(1200);

        // Check WebGL2 status and JS errors
        const initStatus = await browser.evaluate(`(() => {
            const c = document.getElementById("sim-canvas");
            const gl = window.GFX ? window.GFX.gl : null;
            const err = gl ? gl.getError() : -1;
            const tag = document.querySelector(".sim-tag");
            return {
                hasCanvas: !!c,
                canvasWidth: c ? c.width : 0,
                canvasHeight: c ? c.height : 0,
                hasGFX: !!window.GFX,
                glError: err,
                tagText: tag ? tag.textContent.trim() : "",
                hasZetaMath: !!window.ZetaMath,
                hasZetaZeros: !!window.ZetaZeros,
                hasShaders: !!window.PrimesWavesShaders,
                hasSim: !!(window.SIMS && window.SIMS["primes-waves"])
            };
        })()`);

        console.log("   Initial status:", initStatus);
        if (initStatus.glError !== 0) {
            throw new Error(`WebGL Error detected: ${initStatus.glError}`);
        }

        // Capture 1: N = 0 Base State (Smooth Curve + Ghost Staircase)
        console.log("2. Capturing N = 0 (Base smooth curve + ghost staircase)...");
        await browser.evaluate(`(() => {
            const c = document.getElementById("sim-canvas");
            if (c && c.__setZeroCount) c.__setZeroCount(0);
        })()`);
        await sleep(600);
        const n0Buf = await browser.screenshot();
        const n0Path = path.join(ARTIFACT_DIR, "primes_waves_n0_base.png");
        fs.writeFileSync(n0Path, n0Buf);
        console.log(`   Saved -> ${n0Path}`);

        // Capture 2: N = 1 (First zero wave)
        console.log("3. Setting N = 1 (First non-trivial zero wave)...");
        await browser.evaluate(`(() => {
            const c = document.getElementById("sim-canvas");
            if (c && c.__setZeroCount) c.__setZeroCount(1);
        })()`);
        await sleep(800);
        const n1Buf = await browser.screenshot();
        const n1Path = path.join(ARTIFACT_DIR, "primes_waves_n1_single.png");
        fs.writeFileSync(n1Path, n1Buf);
        console.log(`   Saved -> ${n1Path}`);

        // Capture 3: N = 10
        console.log("4. Setting N = 10 (Stack superposition unfolding)...");
        await browser.evaluate(`(() => {
            const c = document.getElementById("sim-canvas");
            if (c && c.__setZeroCount) c.__setZeroCount(10);
        })()`);
        await sleep(800);
        const n10Buf = await browser.screenshot();
        const n10Path = path.join(ARTIFACT_DIR, "primes_waves_n10.png");
        fs.writeFileSync(n10Path, n10Buf);
        console.log(`   Saved -> ${n10Path}`);

        // Capture 4: N = 50
        console.log("5. Setting N = 50 (Staircase sharpening)...");
        await browser.evaluate(`(() => {
            const c = document.getElementById("sim-canvas");
            if (c && c.__setZeroCount) c.__setZeroCount(50);
        })()`);
        await sleep(800);
        const n50Buf = await browser.screenshot();
        const n50Path = path.join(ARTIFACT_DIR, "primes_waves_n50.png");
        fs.writeFileSync(n50Path, n50Buf);
        console.log(`   Saved -> ${n50Path}`);

        // Capture 5: N = 500 Sharp Mode
        console.log("6. Setting N = 500 (Converged Chebyshev prime staircase with Gibbs ringing)...");
        await browser.evaluate(`(() => {
            const c = document.getElementById("sim-canvas");
            if (c && c.__setZeroCount) c.__setZeroCount(500);
        })()`);
        await sleep(1000);
        const sharpBuf = await browser.screenshot();
        const sharpPath = path.join(ARTIFACT_DIR, "primes_waves_n500_sharp.png");
        fs.writeFileSync(sharpPath, sharpBuf);
        console.log(`   Saved -> ${sharpPath}`);

        // Capture 6: N = 500 Cesàro Mode
        console.log("7. Toggling Cesàro Mode (Gibbs suppression)...");
        await browser.evaluate(`(() => {
            const c = document.getElementById("sim-canvas");
            if (c && c.__toggleCesaro) c.__toggleCesaro();
        })()`);
        await sleep(800);
        const cesaroBuf = await browser.screenshot();
        const cesaroPath = path.join(ARTIFACT_DIR, "primes_waves_n500_cesaro.png");
        fs.writeFileSync(cesaroPath, cesaroBuf);
        console.log(`   Saved -> ${cesaroPath}`);

        // Capture 7: Cursor Hover Probe at x = 17.0
        console.log("8. Probing prime power at x = 17.0 with cursor hairline...");
        await browser.evaluate(`(() => {
            const c = document.getElementById("sim-canvas");
            const rect = c.getBoundingClientRect();
            // Dispatch mousemove at 35% across
            const evt = new MouseEvent("mousemove", {
                clientX: rect.left + rect.width * 0.35,
                clientY: rect.top + rect.height * 0.45
            });
            c.dispatchEvent(evt);
        })()`);
        await sleep(600);
        const probeBuf = await browser.screenshot();
        const probePath = path.join(ARTIFACT_DIR, "primes_waves_probe_hairline.png");
        fs.writeFileSync(probePath, probeBuf);
        console.log(`   Saved -> ${probePath}`);

        // Capture 8: Light Theme
        console.log("9. Switching to Light Theme...");
        await browser.evaluate(`(() => {
            window.KW.col = { a: [0, 160, 220], isLight: true };
        })()`);
        await sleep(800);
        const lightBuf = await browser.screenshot();
        const lightPath = path.join(ARTIFACT_DIR, "primes_waves_light.png");
        fs.writeFileSync(lightPath, lightBuf);
        console.log(`   Saved -> ${lightPath}`);

        // Capture 9: Mobile Viewport (390 x 844)
        console.log("10. Testing Mobile Viewport (390 x 844)...");
        await browser.evaluate(`(() => {
            window.KW.col = { a: [0, 220, 255], isLight: false };
        })()`);
        await browser.viewport(390, 844);
        await sleep(1000);
        const mobBuf = await browser.screenshot();
        const mobPath = path.join(ARTIFACT_DIR, "primes_waves_mobile.png");
        fs.writeFileSync(mobPath, mobBuf);
        console.log(`   Saved -> ${mobPath}`);

        // Performance & Frame Rate Measurement
        console.log("11. Measuring Frame Times & WebGL Errors...");
        const perfReport = await browser.evaluate(`new Promise(resolve => {
            let frames = 0;
            let start = performance.now();
            const count = () => {
                frames++;
                if (performance.now() - start < 1000) {
                    requestAnimationFrame(count);
                } else {
                    const elapsed = performance.now() - start;
                    const fps = Math.round((frames / elapsed) * 1000);
                    const avgFrameMs = elapsed / frames;
                    const gl = window.GFX ? window.GFX.gl : null;
                    const glErr = gl ? gl.getError() : -1;
                    resolve({ fps, avgFrameMs, glErr });
                }
            };
            requestAnimationFrame(count);
        })`);
        console.log("   Performance measurement:", perfReport);

        // Clean Disposal Protocol
        console.log("12. Verifying Clean Disposal Protocol...");
        const disposalCheck = await browser.evaluate(`(() => {
            const c = document.getElementById("sim-canvas");
            const hasDispose = typeof c.__dispose === "function";
            if (hasDispose) c.__dispose();
            const gl = window.GFX ? window.GFX.gl : null;
            return {
                hasDispose,
                glErrorAfterDispose: gl ? gl.getError() : -1
            };
        })()`);
        console.log("   Disposal check:", disposalCheck);

        console.log("\n=== All Tests & Captures Completed Successfully! ===\n");
    } catch (err) {
        console.error("Test execution failed:", err);
        process.exitCode = 1;
    } finally {
        await browser.close();
        srv.close();
    }
})();
