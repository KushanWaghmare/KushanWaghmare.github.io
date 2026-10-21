"use strict";

const fs = require("fs");
const path = require("path");
const { serve, launch, sleep } = require("../audit/cdp");

const ARTIFACT_DIR = "/Users/kushanwaghmare/.gemini/antigravity/brain/a9ccfa02-8650-4f91-b43c-a816d9090312";

(async () => {
    const { srv, port } = await serve();
    const browser = await launch(9844);
    await browser.viewport(1440, 900);
    await browser.navigate(`http://127.0.0.1:${port}/math.html`);
    await sleep(1500);

    // Switch sim to mobius-surfaces
    await browser.evaluate(`(() => {
        const sec = document.querySelector("#domain-intro");
        const canvas = sec ? sec.querySelector("canvas") : null;
        if (canvas && window.KW && window.KW.loadModule) {
            window.KW.loadModule("math").then(() => {
                if (window.SIMS && window.SIMS["mobius-surfaces"]) {
                    window.SIMS["mobius-surfaces"](canvas, {});
                }
            });
        }
    })()`);
    await sleep(2000);

    const darkBuf = await browser.screenshot();
    fs.writeFileSync(path.join(ARTIFACT_DIR, "test_mobius_previous.png"), darkBuf);
    console.log("Captured mobius previous screenshot");

    await browser.close();
    srv.close();
})();
