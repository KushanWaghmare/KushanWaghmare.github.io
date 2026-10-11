const { spawn } = require("child_process");
const http = require("http");

async function main() {
    const chrome = spawn("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", [
        "--headless",
        "--remote-debugging-port=9222",
        "--disable-gpu",
        "--use-gl=angle",
        "--use-angle=swiftshader",
        "--enable-unsafe-swiftshader",
        "--no-sandbox",
        "http://localhost:8765/index.html"
    ]);

    // Wait for Chrome to bind port 9222
    let targets = null;
    for (let i = 0; i < 20; i++) {
        await new Promise((r) => setTimeout(r, 200));
        try {
            targets = await new Promise((resolve, reject) => {
                http.get("http://127.0.0.1:9222/json", (res) => {
                    let d = "";
                    res.on("data", (c) => (d += c));
                    res.on("end", () => resolve(JSON.parse(d)));
                }).on("error", reject);
            });
            if (targets && targets.length) break;
        } catch (e) {}
    }

    if (!targets || !targets.length) {
        console.error("Failed to connect to Chrome CDP");
        chrome.kill();
        return;
    }

    const pageTarget = targets.find((t) => t.type === "page") || targets[0];
    const ws = new WebSocket(pageTarget.webSocketDebuggerUrl);

    await new Promise((resolve) => ws.onopen = resolve);
    let id = 1;
    const send = (method, params = {}) => {
        const mid = id++;
        ws.send(JSON.stringify({ id: mid, method, params }));
    };

    ws.onmessage = (evt) => {
        const msg = JSON.parse(evt.data);
        if (msg.method === "Runtime.consoleAPICalled") {
            console.log("[CONSOLE]", msg.params.type, msg.params.args.map((a) => a.value || a.description).join(" "));
        }
        if (msg.method === "Runtime.exceptionThrown") {
            console.error("[EXCEPTION]", msg.params.exceptionDetails);
        }
    };

    send("Runtime.enable");
    send("Log.enable");

    // Wait 3 seconds to let scripts execute
    await new Promise((r) => setTimeout(r, 3000));

    // Evaluate WebGL support and simulation state
    send("Runtime.evaluate", {
        expression: `JSON.stringify({
            hasThree: typeof THREE !== 'undefined',
            hasSIMS: typeof SIMS !== 'undefined',
            canvasCount: document.querySelectorAll('canvas').length,
            snapSectionCount: document.querySelectorAll('.snap-section').length,
            snapDotCount: document.querySelectorAll('.snap-dot').length,
            hasNavContact: !!document.querySelector('.nav-contact-link'),
            sectionIds: Array.from(document.querySelectorAll('.snap-section')).map(s => s.id)
        })`,
        returnByValue: true
    });

    await new Promise((resolve) => {
        const origOnMessage = ws.onmessage;
        ws.onmessage = (evt) => {
            origOnMessage(evt);
            const msg = JSON.parse(evt.data);
            if (msg.result && msg.result.result && msg.result.result.value) {
                console.log("[EVAL RESULT]", msg.result.result.value);
                resolve();
            }
        };
    });

    ws.close();
    chrome.kill();
}

main().catch(console.error);
