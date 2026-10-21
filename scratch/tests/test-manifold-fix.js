"use strict";

const fs = require("fs");
const path = require("path");
const { serve, launch, sleep } = require("../audit/cdp");

const ARTIFACT_DIR = "/Users/kushanwaghmare/.gemini/antigravity/brain/a9ccfa02-8650-4f91-b43c-a816d9090312";

(async () => {
    const { srv, port } = await serve();
    const browser = await launch(9842);
    await browser.viewport(1440, 900);
    await browser.navigate(`http://127.0.0.1:${port}/math.html`);
    await sleep(2000);

    const darkBuf = await browser.screenshot();
    fs.writeFileSync(path.join(ARTIFACT_DIR, "test_current_math.png"), darkBuf);
    console.log("Captured current test screenshot");

    await browser.close();
    srv.close();
})();
