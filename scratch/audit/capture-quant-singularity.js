"use strict";

const fs = require("fs");
const path = require("path");
const { serve, launch, sleep, ROOT } = require("./cdp");

const run = async () => {
    const { srv, port: webPort } = await serve();
    const chromePort = 9334;
    const client = await launch(chromePort, ["--enable-webgl", "--ignore-gpu-blocklist"]);

    await client.viewport(1440, 900);

    console.log("Navigating to quant.html...");
    await client.navigate(`http://127.0.0.1:${webPort}/quant.html`);

    // Wait for modules to load and simulation to run a few frames
    await sleep(2000);

    // Check for errors in browser console
    if (client.consoleLog.length > 0) {
        console.warn("Browser console logs:", client.consoleLog);
    } else {
        console.log("Zero errors in browser console.");
    }

    // Check live tag string on page
    const tagText = await client.evaluate(`document.querySelector(".sim-tag") ? document.querySelector(".sim-tag").textContent : "none"`);
    console.log(`Live HUD tag: ${tagText}`);

    // Capture initial dark mode state
    const bufDark = await client.screenshot(1);
    const darkPath = path.join(ROOT, "scratch/quant_singularity_dark.png");
    fs.writeFileSync(darkPath, bufDark);
    console.log(`Saved screenshot: ${darkPath} (${bufDark.length} bytes)`);

    // Test cursor move interaction (tilt and spin change)
    await client.mouseMove(1100, 350);
    await sleep(800);
    const tagMoved = await client.evaluate(`document.querySelector(".sim-tag") ? document.querySelector(".sim-tag").textContent : "none"`);
    console.log(`Live HUD tag after cursor move: ${tagMoved}`);

    // Test click volatility shock
    await client.mouseClick(720, 450);
    await sleep(400); // Capture mid-blast wave
    const bufShock = await client.screenshot(1);
    const shockPath = path.join(ROOT, "scratch/quant_singularity_shock.png");
    fs.writeFileSync(shockPath, bufShock);
    console.log(`Saved screenshot: ${shockPath} (${bufShock.length} bytes)`);

    // Test light mode
    await client.evaluate(`document.documentElement.dataset.theme = "light"; window.KW && window.KW.theme && window.KW.theme.set("light");`);
    await sleep(800);
    const bufLight = await client.screenshot(1);
    const lightPath = path.join(ROOT, "scratch/quant_singularity_light.png");
    fs.writeFileSync(lightPath, bufLight);
    console.log(`Saved screenshot: ${lightPath} (${bufLight.length} bytes)`);

    // Test Hub quant slide on index.html
    console.log("Navigating to index.html#domain-quant...");
    await client.navigate(`http://127.0.0.1:${webPort}/index.html#domain-quant`);
    await sleep(2000);
    const bufHub = await client.screenshot(1);
    const hubPath = path.join(ROOT, "scratch/quant_singularity_hub.png");
    fs.writeFileSync(hubPath, bufHub);
    console.log(`Saved screenshot: ${hubPath} (${bufHub.length} bytes)`);

    client.close();
    srv.close();
    console.log("All visual verification captures complete.");
};

run().catch((err) => {
    console.error("Visual capture failed:", err);
    process.exit(1);
});
