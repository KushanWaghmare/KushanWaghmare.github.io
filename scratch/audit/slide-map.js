"use strict";
// Dumps every slide key -> 2-D engine and the GPU sim resolveGpuSim() actually picks.
const fs = require("fs"), path = require("path");
const root = path.join(__dirname, "..", "..");
const { SLIDE_SIMS } = require(path.join(root, "shared", "slides.js"));
const app = fs.readFileSync(path.join(root, "shared", "app.js"), "utf8");
const m = app.match(/const resolveGpuSim = (\(simKey\) => \{[\s\S]*?\n        \});/);
const resolveGpuSim = eval(m[1]);
const rows = Object.entries(SLIDE_SIMS).map(([k, v]) => {
    const g = resolveGpuSim(k);
    return { key: k, engine: v.engine, gpu: g ? `${g.mod}:${g.key}` : "-" };
});
if (process.argv[2] === "--json") console.log(JSON.stringify(rows));
else rows.forEach((r) => console.log(`${r.key.padEnd(48)} ${r.engine.padEnd(12)} ${r.gpu}`));
