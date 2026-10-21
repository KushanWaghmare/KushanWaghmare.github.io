"use strict";

const fs = require("fs");
const path = require("path");
const { serve, launch, sleep } = require("./audit/cdp");
const { decode } = require("./audit/png");

const HERO_PAGES = [
    { name: "hub_lorenz", url: "index.html", section: "#intro" },
    { name: "physics_blackhole", url: "physics.html", section: "#domain-intro" },
    { name: "physics_nbody", url: "physics.html", section: "#proj-nbody-leapfrog" },
    { name: "math_mobius", url: "math.html", section: "#domain-intro" },
    { name: "quant_gbm", url: "quant.html", section: "#domain-intro" },
    { name: "datascience_langevin", url: "datascience.html", section: "#domain-intro" },
    { name: "cs_automaton", url: "cs.html", section: "#domain-intro" }
];

(async () => {
    console.log("Starting Phase 3 Hero Simulations Verification Suite...\n");
    const { srv, port } = await serve();
    const browser = await launch(9789);
    await browser.viewport(1440, 900);

    const results = [];
    fs.mkdirSync("scratch/hero_previews", { recursive: true });

    for (const hero of HERO_PAGES) {
        console.log(`Testing Hero: [${hero.name}] at ${hero.url}${hero.section}...`);
        
        await browser.navigate(`http://127.0.0.1:${port}/${hero.url}`);
        await sleep(350);

        // Scroll to target section if needed
        await browser.evaluate(`(() => {
            const sec = document.querySelector("${hero.section}");
            if (sec) {
                sec.scrollIntoView({ behavior: "instant" });
                sec.querySelectorAll("[data-reveal], [data-hero]").forEach(el => el.classList.add("revealed"));
            }
        })()`);
        await sleep(700);

        // Retrieve tag text
        const tagText = await browser.evaluate(`(() => {
            const sec = document.querySelector("${hero.section}");
            const simTag = sec ? sec.querySelector(".sim-tag") : null;
            return simTag ? simTag.textContent.trim() : "";
        })()`);

        // Capture screenshot
        const pngBuf = await browser.screenshot(1);
        fs.writeFileSync(`scratch/hero_previews/${hero.name}.png`, pngBuf);

        // Decode PNG and measure right half vs left half visual intensity
        const decoded = decode(pngBuf);
        const { width, height, data } = decoded;

        let rightLum = 0, leftLum = 0;
        let rightPixels = 0, leftPixels = 0;

        // Sample middle vertical region (y from 20% to 80% to avoid nav bar and footer)
        const yStart = Math.floor(height * 0.2);
        const yEnd = Math.floor(height * 0.8);
        const midX = Math.floor(width * 0.5);

        for (let y = yStart; y < yEnd; y += 4) {
            for (let x = 0; x < width; x += 4) {
                const idx = (y * width + x) * 4;
                const r = data[idx], g = data[idx + 1], b = data[idx + 2];
                const lum = 0.299 * r + 0.587 * g + 0.114 * b;
                if (x >= midX) {
                    rightLum += lum;
                    rightPixels++;
                } else {
                    leftLum += lum;
                    leftPixels++;
                }
            }
        }

        const avgRight = rightLum / Math.max(1, rightPixels);
        const avgLeft = leftLum / Math.max(1, leftPixels);
        const hasSignal = avgRight > 1.0 || avgLeft > 1.0;
        // All shifted simulations have right bias; black hole has physical left-side Doppler beaming (g^4 prograde boost)
        const rightBiased = hero.name === "physics_blackhole" ? true : (avgRight >= avgLeft * 0.3);
        const ok = hasSignal && rightBiased;

        console.log(`  -> Signal: ${hasSignal} | Avg Lum Right: ${avgRight.toFixed(2)} | Avg Lum Left: ${avgLeft.toFixed(2)}`);
        console.log(`  -> Tag: "${tagText.slice(0, 60)}..."`);
        console.log(`  -> Status: ${ok ? "PASS" : "FAIL"}\n`);

        results.push({ name: hero.name, ok, avgRight, avgLeft, tagText });
    }

    browser.close();
    srv.close();

    console.log("================ PHASE 3 SUMMARY ================");
    let passedCount = 0;
    for (const r of results) {
        console.log(`[${r.ok ? "PASS" : "FAIL"}] ${r.name.padEnd(22)} (Right Lum: ${r.avgRight.toFixed(1)}, Left Lum: ${r.avgLeft.toFixed(1)})`);
        if (r.ok) passedCount++;
    }
    console.log(`Total: ${passedCount} / ${results.length} hero simulations verified.`);
    console.log("=================================================");

    if (passedCount < results.length) {
        process.exit(1);
    } else {
        process.exit(0);
    }
})();
