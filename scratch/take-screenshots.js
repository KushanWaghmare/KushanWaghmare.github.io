const { spawn } = require("child_process");
const http = require("http");
const fs = require("fs");

async function capture() {
    const chrome = spawn("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", [
        "--headless",
        "--remote-debugging-port=9227",
        "--disable-gpu",
        "--use-gl=angle",
        "--use-angle=swiftshader",
        "--enable-unsafe-swiftshader",
        "--user-data-dir=/tmp/chrome-snap-profile",
        "--no-sandbox",
        "--window-size=1440,900",
        "http://localhost:8765/index.html"
    ]);

    let targets = null;
    for (let i = 0; i < 20; i++) {
        await new Promise((r) => setTimeout(r, 200));
        try {
            targets = await new Promise((resolve, reject) => {
                http.get("http://127.0.0.1:9227/json", (res) => {
                    let d = "";
                    res.on("data", (c) => (d += c));
                    res.on("end", () => resolve(JSON.parse(d)));
                }).on("error", reject);
            });
            if (targets && targets.length) break;
        } catch (e) {}
    }

    if (!targets || !targets.length) {
        chrome.kill();
        throw new Error("No target");
    }

    const pageTarget = targets.find((t) => t.type === "page") || targets[0];
    const ws = new WebSocket(pageTarget.webSocketDebuggerUrl);
    await new Promise((resolve) => ws.onopen = resolve);

    let id = 1;
    const req = (method, params = {}) => new Promise((resolve) => {
        const mid = id++;
        const onMsg = (evt) => {
            const data = JSON.parse(evt.data);
            if (data.id === mid) {
                ws.removeEventListener("message", onMsg);
                resolve(data.result);
            }
        };
        ws.addEventListener("message", onMsg);
        ws.send(JSON.stringify({ id: mid, method, params }));
    });

    await req("Page.enable");
    await req("DOM.enable");

    // Measure bounds at initial load
    const initialBounds = await req("Runtime.evaluate", {
        expression: `JSON.stringify({
            introPadLeft: getComputedStyle(document.getElementById('intro')).paddingLeft,
            introInnerRect: document.querySelector('#intro .snap-inner').getBoundingClientRect()
        })`,
        returnByValue: true
    });
    console.log("INITIAL BOUNDS:", initialBounds.result.value);

    // Capture intro
    const introShot = await req("Page.captureScreenshot", { format: "png" });
    fs.writeFileSync("/tmp/snap_intro.png", Buffer.from(introShot.data, "base64"));
    console.log("Captured /tmp/snap_intro.png");

    // Scroll to #domain-math
    await req("Runtime.evaluate", {
        expression: "document.getElementById('domain-math').scrollIntoView({ behavior: 'instant' });"
    });
    await new Promise((r) => setTimeout(r, 600));

    const mathShot = await req("Page.captureScreenshot", { format: "png" });
    fs.writeFileSync("/tmp/snap_math.png", Buffer.from(mathShot.data, "base64"));
    console.log("Captured /tmp/snap_math.png");

    // Inspect bounding rect of intro vs math
    const bounds = await req("Runtime.evaluate", {
        expression: `JSON.stringify({
            introPad: getComputedStyle(document.getElementById('intro')).paddingLeft,
            mathPad: getComputedStyle(document.getElementById('domain-math')).paddingLeft,
            introInnerRect: document.querySelector('#intro .snap-inner').getBoundingClientRect(),
            mathInnerRect: document.querySelector('#domain-math .snap-inner').getBoundingClientRect(),
            introInnerClasses: document.querySelector('#intro .snap-inner').className,
            mathInnerClasses: document.querySelector('#domain-math .snap-inner').className
        })`,
        returnByValue: true
    });
    console.log("BOUNDS:", bounds.result.value);

    ws.close();
    chrome.kill();
}

capture().catch(console.error);
