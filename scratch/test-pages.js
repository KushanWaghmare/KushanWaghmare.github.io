const { spawn } = require("child_process");
const http = require("http");

async function checkUrl(url) {
    const chrome = spawn("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", [
        "--headless",
        "--remote-debugging-port=9224",
        "--disable-gpu",
        "--use-gl=angle",
        "--use-angle=swiftshader",
        "--enable-unsafe-swiftshader",
        "--no-sandbox",
        url
    ]);

    let targets = null;
    for (let i = 0; i < 20; i++) {
        await new Promise((r) => setTimeout(r, 200));
        try {
            targets = await new Promise((resolve, reject) => {
                http.get("http://127.0.0.1:9224/json", (res) => {
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
    const errors = [];
    ws.onmessage = (evt) => {
        const msg = JSON.parse(evt.data);
        if (msg.method === "Runtime.exceptionThrown") {
            errors.push(msg.params.exceptionDetails);
        }
    };

    const send = (method, params = {}) => {
        const mid = id++;
        ws.send(JSON.stringify({ id: mid, method, params }));
    };

    send("Runtime.enable");
    await new Promise((r) => setTimeout(r, 2000));

    let evalRes = null;
    await new Promise((resolve) => {
        const mid = id++;
        const onMsg = (evt) => {
            const data = JSON.parse(evt.data);
            if (data.id === mid) {
                ws.removeEventListener("message", onMsg);
                evalRes = data.result && data.result.result ? data.result.result.value : null;
                resolve();
            }
        };
        ws.addEventListener("message", onMsg);
        ws.send(JSON.stringify({
            id: mid,
            method: "Runtime.evaluate",
            params: {
                expression: `JSON.stringify({
                    url: location.pathname + location.search,
                    title: document.title,
                    hasNavContact: !!document.querySelector('.nav-contact-link'),
                    canvasCount: document.querySelectorAll('canvas').length,
                    projectCards: document.querySelectorAll('.card').length
                })`,
                returnByValue: true
            }
        }));
    });

    ws.close();
    chrome.kill();

    return { evalRes: JSON.parse(evalRes), errors };
}

async function run() {
    const urls = [
        "http://localhost:8765/math.html",
        "http://localhost:8765/datascience.html",
        "http://localhost:8765/project.html?p=diffgeom"
    ];

    for (const u of urls) {
        const res = await checkUrl(u);
        console.log(u, "=>", res.evalRes, "Errors:", res.errors.length);
        if (res.errors.length) {
            console.error("Errors found on", u, res.errors);
        }
    }
}

run().catch(console.error);
