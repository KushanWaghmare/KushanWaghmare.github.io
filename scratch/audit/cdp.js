"use strict";
// Minimal Chrome DevTools Protocol client (dev tooling only, never shipped).
// Uses the system Chrome and Node's built-in fetch/WebSocket: no npm dependencies.
const { spawn } = require("child_process");
const http = require("http");
const fs = require("fs");
const path = require("path");
const os = require("os");

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const ROOT = path.join(__dirname, "..", "..");
const MIME = { ".html": "text/html", ".js": "application/javascript", ".css": "text/css", ".png": "image/png", ".svg": "image/svg+xml", ".json": "application/json" };

const serve = () => new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
        let p = decodeURIComponent(req.url.split("?")[0]).replace(/^\//, "") || "index.html";
        const fp = path.join(ROOT, p);
        if (fp.startsWith(ROOT) && fs.existsSync(fp) && fs.statSync(fp).isFile()) {
            res.setHeader("Content-Type", MIME[path.extname(fp)] || "application/octet-stream");
            res.end(fs.readFileSync(fp));
        } else { res.statusCode = 404; res.end(); }
    });
    srv.listen(0, () => resolve({ srv, port: srv.address().port }));
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const launch = async (port, extraArgs = []) => {
    const userDir = fs.mkdtempSync(path.join(os.tmpdir(), "kw-audit-"));
    const proc = spawn(CHROME, [
        "--headless=new", "--use-gl=angle", "--enable-webgl", "--ignore-gpu-blocklist",
        "--hide-scrollbars", "--mute-audio", "--no-first-run", "--no-default-browser-check",
        `--remote-debugging-port=${port}`, `--user-data-dir=${userDir}`, ...extraArgs, "about:blank"
    ], { stdio: "ignore" });
    let tab = null;
    for (let i = 0; i < 80 && !tab; i++) {
        try { tab = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((t) => t.type === "page"); } catch (e) {}
        if (!tab) await sleep(100);
    }
    if (!tab) throw new Error("Chrome did not expose a page target");
    const ws = new WebSocket(tab.webSocketDebuggerUrl);
    await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
    let nextId = 1;
    const pending = new Map(), listeners = [];
    ws.onmessage = (evt) => {
        const msg = JSON.parse(evt.data);
        if (msg.id && pending.has(msg.id)) {
            const { resolve, reject } = pending.get(msg.id);
            pending.delete(msg.id);
            if (msg.error) reject(new Error(msg.error.message)); else resolve(msg.result);
        } else if (msg.method) listeners.forEach((fn) => fn(msg));
    };
    const send = (method, params = {}) => new Promise((resolve, reject) => {
        const id = nextId++;
        pending.set(id, { resolve, reject });
        ws.send(JSON.stringify({ id, method, params }));
    });
    const evaluate = async (expression) => {
        const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
        if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
        return r.result.value;
    };
    const consoleLog = [];
    listeners.push((m) => {
        if (m.method === "Runtime.consoleAPICalled" && (m.params.type === "warning" || m.params.type === "error")) {
            consoleLog.push(`${m.params.type}: ${m.params.args.map((a) => a.value ?? a.description).join(" ")}`);
        } else if (m.method === "Runtime.exceptionThrown") {
            consoleLog.push(`exception: ${m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text}`);
        }
    });
    await send("Runtime.enable");
    await send("Page.enable");
    const viewport = (width, height) => send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false });
    const mouseMove = (x, y) => send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
    const mouseClick = (x, y) => send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1 })
        .then(() => send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1 }));
    const navigate = async (url) => {
        const loaded = new Promise((r) => { const fn = (m) => { if (m.method === "Page.loadEventFired") { listeners.splice(listeners.indexOf(fn), 1); r(); } }; listeners.push(fn); });
        await send("Page.navigate", { url });
        await Promise.race([loaded, sleep(8000)]);
    };
    const screenshot = async (scale = 1) => {
        const params = { format: "png" };
        if (scale !== 1) {
            const m = await send("Page.getLayoutMetrics");
            params.clip = { x: 0, y: 0, width: m.cssVisualViewport.clientWidth, height: m.cssVisualViewport.clientHeight, scale };
        }
        return Buffer.from((await send("Page.captureScreenshot", params)).data, "base64");
    };
    const close = () => { try { ws.close(); } catch (e) {} proc.kill("SIGKILL"); };
    return { send, evaluate, navigate, screenshot, viewport, mouseMove, mouseClick, close, consoleLog };
};

module.exports = { serve, launch, sleep, ROOT };
