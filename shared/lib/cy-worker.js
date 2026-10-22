/* Mesh builder worker for the Calabi–Yau scene: keeps the (about 15 ms in Node) welded-mesh build off the render thread. */
importScripts("cy-math.js");

onmessage = (e) => {
    const { id, n, na, grade, quiet } = e.data;
    const m = CYMath.buildMesh(n, na, { gradeA: grade, gradeB: grade });
    const attr = m.attr.slice(), indices = m.indices.slice();   // own, exactly-sized buffers to transfer
    postMessage({ id, n, quiet, V: m.V, F: m.F, attr, indices }, [attr.buffer, indices.buffer]);
};
