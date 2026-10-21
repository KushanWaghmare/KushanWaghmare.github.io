"use strict";
const fs = require("fs");
const path = require("path");
const { serve, launch, sleep, ROOT } = require("./cdp");

const run = async () => {
    const { srv, port: webPort } = await serve();
    const chromePort = 9333;
    const client = await launch(chromePort, ["--enable-webgl", "--ignore-gpu-blocklist"]);

    await client.viewport(1440, 900);

    const pages = [
        { url: "index.html", out: "scratch/black_bg_index.png", name: "Index / Black Hole" },
        { url: "quant.html", out: "scratch/black_bg_quant.png", name: "Quant / Market Galaxy" },
        { url: "datascience.html", out: "scratch/black_bg_datascience.png", name: "Data Science / Diffusion" },
        { url: "courses.html", out: "scratch/black_bg_courses.png", name: "Courses / LOB Terrain" }
    ];

    for (const page of pages) {
        console.log(`Navigating to ${page.name} (${page.url})...`);
        await client.navigate(`http://127.0.0.1:${webPort}/${page.url}`);
        // Let simulation run a few frames
        await sleep(1500);

        // Check CSS computed background of body
        const bodyBg = await client.evaluate(`getComputedStyle(document.body).backgroundColor`);
        const rootBg = await client.evaluate(`getComputedStyle(document.documentElement).getPropertyValue('--bg')`);
        console.log(`  body backgroundColor: ${bodyBg}, --bg: ${rootBg}`);

        const buf = await client.screenshot(1);
        fs.writeFileSync(path.join(ROOT, page.out), buf);
        console.log(`  Saved screenshot: ${page.out} (${buf.length} bytes)`);
    }

    client.close();
    srv.close();
    console.log("Visual verification capture complete.");
};

run().catch((err) => {
    console.error("Capture failed:", err);
    process.exit(1);
});
