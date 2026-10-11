const { spawn } = require("child_process");
const http = require("http");

async function testCopy() {
    const chrome = spawn("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", [
        "--headless",
        "--remote-debugging-port=9224",
        "--disable-gpu",
        "--no-sandbox",
        "http://localhost:8765/datascience.html"
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

    await req("Runtime.enable");
    await new Promise((r) => setTimeout(r, 1000));

    // Click the copy button
    const clickResult = await req("Runtime.evaluate", {
        expression: `(async () => {
            const btn = document.querySelector('.copy-btn');
            if (!btn) return 'btn_not_found';
            btn.click();
            await new Promise(r => setTimeout(r, 150));
            return {
                text: btn.querySelector('.copy-text').textContent,
                hasCopiedClass: btn.classList.contains('copied')
            };
        })()`,
        awaitPromise: true,
        returnByValue: true
    });

    console.log("Copy click result:", clickResult.result.value);

    ws.close();
    chrome.kill();
}

testCopy().catch(console.error);
