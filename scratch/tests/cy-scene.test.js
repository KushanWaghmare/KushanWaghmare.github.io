/**
 * cy-scene.test.js (Phase 2 smoke test, dev only)
 * Loads scratch/test-cy.html in headless Chrome (SwiftShader software GL) and checks that the scene mounts,
 * builds its mesh in the worker, renders non-black pixels, cycles n with the cool-down, honours reduced motion,
 * disposes cleanly and raises no GL / console errors. Frame times here are software-rendered and not representative.
 */
"use strict";
const fs = require("fs");
const path = require("path");
const { serve, launch, sleep } = require("../audit/cdp");

const OUT = path.join(__dirname, "../captures");
fs.mkdirSync(OUT, { recursive: true });
const rows = [];
const check = (name, ok, detail) => { rows.push({ name, ok }); console.log(`  ${ok ? "✓" : "✗ FAIL"} ${name}\n      ${detail}`); };

const waitFor = async (b, expr, ms = 60000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) { if (await b.evaluate(expr)) return Date.now() - t0; await sleep(150); }
    throw new Error("timeout waiting for " + expr);
};
// Non-black pixel fraction of the 2D canvas (the GL result is copied into it with drawImage).
const litFraction = (b) => b.evaluate(`(() => {
    const c = document.getElementById("c"), d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
    let lit = 0, n = 0; for (let i = 0; i < d.length; i += 16) { n++; if (d[i] + d[i + 1] + d[i + 2] > 24) lit++; }
    return lit / n; })()`);

(async () => {
    const { srv, port } = await serve();
    const b = await launch(9852);
    const base = `http://127.0.0.1:${port}/scratch/test-cy.html`;
    try {
        console.log("\n--- Mount, worker build, render (tier 2 forced: software GL) ---");
        await b.viewport(1100, 700);
        await b.navigate(base + "?tier=2");
        const tReady = await waitFor(b, "!!(document.getElementById('c').__cy && document.getElementById('c').__cy.state().ready)");
        await sleep(2500);
        const st = await b.evaluate("document.getElementById('c').__cy.state()");
        const lit = await litFraction(b);
        check("1. Scene mounts, worker builds the mesh, shell renders", st.ready && st.worker && lit > 0.01,
            `mesh ready after ${tReady} ms, worker=${st.worker}, n=${st.n}, lit pixel fraction=${lit.toFixed(3)}`);
        fs.writeFileSync(path.join(OUT, "cy_smoke_n5.png"), await b.screenshot());

        const tag = await b.evaluate("document.querySelector('.sim-tag').textContent");
        check("2. Caption is live and matches the specified form for n = 5",
            /^Fermat curve z₁⁵ \+ z₂⁵ = 1 · cross-section of the quintic Calabi–Yau threefold · 25 patches · genus 6 \(χ = −10 for the completed curve; the 5 ends at infinity are clipped\) · projection angle α = \d\.\d\d rad · click: next n$/.test(tag), tag);

        console.log("\n--- Interaction ---");
        await b.evaluate("document.getElementById('c').__cy.setAlpha(0.8)");
        await b.mouseClick(500, 300); await sleep(150); await b.mouseClick(500, 300);   // second click inside the 600 ms cool-down
        await waitFor(b, "document.getElementById('c').__cy.state().n === 6", 30000);
        await sleep(2500);
        const afterTwo = await b.evaluate("document.getElementById('c').__cy.state()");
        const tag6 = await b.evaluate("document.querySelector('.sim-tag').textContent");
        check("3. A click cycles n 5 -> 6 and the cool-down swallows the double click", afterTwo.n === 6 && /degree 6 · 36 patches · genus 10 \(χ = −18/.test(tag6), `n=${afterTwo.n}; ${tag6.slice(0, 120)}…`);
        fs.writeFileSync(path.join(OUT, "cy_smoke_n6.png"), await b.screenshot());
        const seq = [];
        for (let i = 0; i < 6; i++) { await sleep(700); await b.mouseClick(500, 300); await waitFor(b, `document.getElementById('c').__cy.state().n !== ${await b.evaluate("document.getElementById('c').__cy.state().n")}`, 30000); seq.push(await b.evaluate("document.getElementById('c').__cy.state().n")); }
        check("4. Cycle order 6 -> 7 -> 8 -> 3 -> 4 -> 5 -> 6", seq.join(",") === "7,8,3,4,5,6", `observed ${seq.join(" -> ")}`);

        const a0 = (await b.evaluate("document.getElementById('c').__cy.state().alpha"));
        await b.mouseMove(300, 350); await sleep(1500); const a1 = await b.evaluate("document.getElementById('c').__cy.state().alpha");
        await b.mouseMove(900, 350); await sleep(1500); const a2 = await b.evaluate("document.getElementById('c').__cy.state().alpha");
        check("5. Pointer x drives alpha by hand (left vs right of the canvas differ)", Math.abs(a2 - a1) > 0.5, `alpha ${a0.toFixed(2)} -> ${a1.toFixed(2)} (x=300) -> ${a2.toFixed(2)} (x=900)`);

        console.log("\n--- Disposal and errors ---");
        const gl = await b.evaluate(`(() => { const c = document.getElementById("c"); c.__dispose(); return GFX.gl.getError(); })()`);
        await sleep(500);
        const errs = await b.evaluate("window.__errors");
        check("6. Dispose leaves no GL error and the page logs no errors", gl === 0 && errs.length === 0, `gl.getError()=${gl}, page errors=${JSON.stringify(errs)}, console=${JSON.stringify(b.consoleLog)}`);

        console.log("\n--- Reduced motion ---");
        await b.navigate(base + "?reduced=1");
        await sleep(3000);
        const rs = await b.evaluate("document.getElementById('c').__cy.state()");
        const rlit = await litFraction(b);
        await sleep(1500);
        const rs2 = await b.evaluate("document.getElementById('c').__cy.state()");
        check("7. Reduced motion renders one static frame (n = 5, alpha = 0.7)", rs.n === 5 && Math.abs(rs.alpha - 0.7) < 1e-9 && rs2.alpha === rs.alpha && rlit > 0.01, `n=${rs.n}, alpha=${rs.alpha}, still ${rs2.alpha} 1.5 s later, lit fraction=${rlit.toFixed(3)}, worker used=${rs.worker}`);
        fs.writeFileSync(path.join(OUT, "cy_smoke_reduced.png"), await b.screenshot());
    } finally { b.close(); srv.close(); }
    console.log("\n  Result table"); rows.forEach((r) => console.log(`  ${r.ok ? "PASS" : "FAIL"}  ${r.name}`));
    const ok = rows.filter((r) => r.ok).length; console.log(`\n  ${ok} / ${rows.length} passed\n`);
    process.exit(ok === rows.length ? 0 : 1);
})().catch((e) => { console.error("FAILED:", e.message); process.exit(1); });
