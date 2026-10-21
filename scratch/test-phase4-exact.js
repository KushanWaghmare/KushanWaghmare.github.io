"use strict";

const fs = require("fs");
const path = require("path");
const { serve, launch, sleep } = require("./audit/cdp");
const { decode } = require("./audit/png");

const EXACT_SIMS = [
    { name: "fourier_spectral", url: "math.html", section: "#proj-fourier-spectral", mod: "fourier", key: "fourier-spectral" },
    { name: "regularised_regression", url: "datascience.html", section: "#proj-regularised-regression", mod: "regression", key: "regularised-regression" },
    { name: "spectral_clustering", url: "datascience.html", section: "#proj-spectral-clustering", mod: "spectral", key: "spectral-clustering" },
    { name: "fdtd_wave_optics", url: "courses.html", section: "#track-physics-curriculum", mod: "physics", key: "fdtd-wave-optics" },
    { name: "double_pendulum", url: "physics.html", section: "#domain-explore", mod: "physics", key: "pendulum" },
    { name: "markov_walks", url: "quant.html", section: "#domain-explore", mod: "markov", key: "markov" }
];

(async () => {
    console.log("Starting Phase 4 Exact Domain & Project Slide Verification Suite...\n");
    const { srv, port } = await serve();
    const browser = await launch(9844);
    await browser.viewport(1440, 900);

    const results = [];
    fs.mkdirSync("scratch/phase4_previews", { recursive: true });

    for (const sim of EXACT_SIMS) {
        console.log(`Testing: [${sim.name}] at ${sim.url}${sim.section}...`);
        
        await browser.navigate(`http://127.0.0.1:${port}/${sim.url}`);
        await sleep(350);

        // Scroll to target section
        await browser.evaluate(`(() => {
            const sec = document.querySelector("${sim.section}");
            if (sec) {
                sec.scrollIntoView({ behavior: "instant" });
                sec.querySelectorAll("[data-reveal], [data-hero]").forEach(el => el.classList.add("revealed"));
            }
        })()`);
        await sleep(800);

        // Retrieve tag text
        const tagText = await browser.evaluate(`(() => {
            const sec = document.querySelector("${sim.section}");
            const simTag = sec ? sec.querySelector(".sim-tag") : null;
            return simTag ? simTag.textContent.trim() : "";
        })()`);

        // Capture screenshot
        const pngBuf = await browser.screenshot(1);
        fs.writeFileSync(`scratch/phase4_previews/${sim.name}.png`, pngBuf);

        // Decode PNG and measure right half vs left half visual intensity
        const decoded = decode(pngBuf);
        const { width, height, data } = decoded;

        let rightLum = 0, leftLum = 0;
        let rightPixels = 0, leftPixels = 0;

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
        const rightBiased = avgRight >= avgLeft * 0.25;
        const ok = hasSignal && rightBiased;

        console.log(`  -> Signal: ${hasSignal} | Avg Lum Right: ${avgRight.toFixed(2)} | Avg Lum Left: ${avgLeft.toFixed(2)}`);
        console.log(`  -> Tag: "${tagText.slice(0, 60)}..."`);
        console.log(`  -> Status: ${ok ? "PASS" : "FAIL"}\n`);

        results.push({ name: sim.name, ok, avgRight, avgLeft, tagText });
    }

    browser.close();
    srv.close();

    console.log("================ PHASE 4 EXACT SUMMARY ================");
    let passedCount = 0;
    for (const r of results) {
        console.log(`[${r.ok ? "PASS" : "FAIL"}] ${r.name.padEnd(25)} (Right Lum: ${r.avgRight.toFixed(1)}, Left Lum: ${r.avgLeft.toFixed(1)})`);
        if (r.ok) passedCount++;
    }
    console.log(`Total: ${passedCount} / ${results.length} simulations verified.`);
    console.log("======================================================");

    if (passedCount < results.length) {
        process.exit(1);
    } else {
        process.exit(0);
    }
})();
