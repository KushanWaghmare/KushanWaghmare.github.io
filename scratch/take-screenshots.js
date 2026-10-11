const { spawn } = require("child_process");
const http = require("http");
const fs = require("fs");

async function capture() {
    const chrome = spawn("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", [
        "--headless",
        "--remote-debugging-port=9223",
        "--disable-gpu",
        "--use-gl=angle",
        "--use-angle=swiftshader",
        "--enable-unsafe-swiftshader",
        "--no-sandbox",
        "--window-size=1440,900",
        "http://localhost:8765/datascience.html"
    ]);

    let targets = null;
    for (let i = 0; i < 20; i++) {
        await new Promise((r) => setTimeout(r, 200));
        try {
            targets = await new Promise((resolve, reject) => {
                http.get("http://127.0.0.1:9223/json", (res) => {
                    let d = "";
                    res.on("data", (c) => (d += c));
                    res.on("end", () => resolve(JSON.parse(d)));
                }).on("error", reject);
            });
            if (targets && targets.length) break;
        } catch (e) {}
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

    // Wait 1.5 seconds for GSAP entrance and Three.js frames
    await new Promise((r) => setTimeout(r, 1500));

    // 1. Screenshot of the Hero
    const heroShot = await req("Page.captureScreenshot", { format: "png" });
    fs.writeFileSync("/tmp/datascience_hero_rendered.png", Buffer.from(heroShot.data, "base64"));
    console.log("Captured /tmp/datascience_hero_rendered.png");

    // 2. Scroll down to Contact Section
    await req("Runtime.evaluate", {
        expression: "document.getElementById('contact').scrollIntoView({ behavior: 'instant' });"
    });
    await new Promise((r) => setTimeout(r, 800));

    const contactShot = await req("Page.captureScreenshot", { format: "png" });
    fs.writeFileSync("/tmp/datascience_contact.png", Buffer.from(contactShot.data, "base64"));
    console.log("Captured /tmp/datascience_contact.png");

    // 3. Switch to Light Mode and capture
    await req("Runtime.evaluate", {
        expression: "document.querySelector('.theme-btn').click();"
    });
    // Wait for 0.3s (after the 0.2s transition)
    await new Promise((r) => setTimeout(r, 400));

    const lightContactShot = await req("Page.captureScreenshot", { format: "png" });
    fs.writeFileSync("/tmp/datascience_contact_light.png", Buffer.from(lightContactShot.data, "base64"));
    console.log("Captured /tmp/datascience_contact_light.png");

    ws.close();
    chrome.kill();
}

capture().catch(console.error);
