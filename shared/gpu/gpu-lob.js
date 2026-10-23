/* WebGL2 Order Book Terrain Simulation Engine (shared/gpu/gpu-lob.js).
   3-D limit order book landscape driven by a bivariate Hawkes process of market orders.
   Meteors fall onto strike levels with impact flashes and outward Hawkes ripples.
   Toroidal absolute price columns, smoothed mid-price tracking, cool bid / warm ask hues.
   Preallocated buffers, zero per-frame allocation in hot paths, clean disposal. */

(function (root, factory) {
    if (typeof module === "object" && module.exports) module.exports = factory(root);
    else factory(root);
}(typeof self !== "undefined" ? self : this, function (root) {
    "use strict";

    root.SIMS = root.SIMS || {};
    const SIMS = root.SIMS;
    const GFX = root.GFX;
    const LOB_MATH = root.LOB_MATH;
    const LOB_SHADERS = root.LOB_SHADERS;

    // Simple 4x4 Matrix Helpers (Float32Array)
    const mat4Perspective = (out, fovy, aspect, near, far) => {
        const f = 1.0 / Math.tan(fovy * 0.5), nf = 1.0 / (near - far);
        out.fill(0);
        out[0] = f / aspect;
        out[5] = f;
        out[10] = (far + near) * nf;
        out[11] = -1.0;
        out[14] = 2.0 * far * near * nf;
        return out;
    };

    const mat4LookAt = (out, eye, center, up) => {
        let x0, x1, x2, y0, y1, y2, z0, z1, z2, len;
        z0 = eye[0] - center[0]; z1 = eye[1] - center[1]; z2 = eye[2] - center[2];
        len = 1.0 / Math.hypot(z0, z1, z2);
        z0 *= len; z1 *= len; z2 *= len;

        x0 = up[1] * z2 - up[2] * z1; x1 = up[2] * z0 - up[0] * z2; x2 = up[0] * z1 - up[1] * z0;
        len = Math.hypot(x0, x1, x2);
        if (len > 0) { len = 1.0 / len; x0 *= len; x1 *= len; x2 *= len; }

        y0 = z1 * x2 - z2 * x1; y1 = z2 * x0 - z0 * x2; y2 = z0 * x1 - z1 * x0;

        out[0] = x0; out[1] = y0; out[2] = z0; out[3] = 0;
        out[4] = x1; out[5] = y1; out[6] = z1; out[7] = 0;
        out[8] = x2; out[9] = y2; out[10] = z2; out[11] = 0;
        out[12] = -(x0 * eye[0] + x1 * eye[1] + x2 * eye[2]);
        out[13] = -(y0 * eye[0] + y1 * eye[1] + y2 * eye[2]);
        out[14] = -(z0 * eye[0] + z1 * eye[1] + z2 * eye[2]);
        out[15] = 1.0;
        return out;
    };

    const mat4Multiply = (out, a, b) => {
        const a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3];
        const a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7];
        const a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11];
        const a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15];

        let b0 = b[0], b1 = b[1], b2 = b[2], b3 = b[3];
        out[0] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
        out[1] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
        out[2] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
        out[3] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;

        b0 = b[4]; b1 = b[5]; b2 = b[6]; b3 = b[7];
        out[4] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
        out[5] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
        out[6] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
        out[7] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;

        b0 = b[8]; b1 = b[9]; b2 = b[10]; b3 = b[11];
        out[8] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
        out[9] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
        out[10] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
        out[11] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;

        b0 = b[12]; b1 = b[13]; b2 = b[14]; b3 = b[15];
        out[12] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
        out[13] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
        out[14] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
        out[15] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;
        return out;
    };

    SIMS["order-book-terrain"] = (canvas, params = {}) => {
        const fallbackFn = (c) => {
            const eng = root.ENGINES && root.ENGINES.paths;
            if (eng) eng(c, params);
        };

        if (!GFX || !GFX.supported || !LOB_MATH || !LOB_SHADERS) {
            return fallbackFn(canvas);
        }

        return GFX.mount(canvas, (gfx, cvs, getSize) => {
            const gl = gfx.gl;
            const mob = gfx.isMobile();
            const gridW = mob ? 128 : 256;
            const gridH = mob ? 128 : 256;

            const book = new LOB_MATH.LimitOrderBook({ centerPrice: 5000, seed: 1337 });
            book.hawkes.mu = 0.55;

            // Compile shaders
            const progTerrain = gfx.program(LOB_SHADERS.VS_TERRAIN, LOB_SHADERS.FS_TERRAIN);
            const progMeteors = gfx.program(LOB_SHADERS.VS_METEORS, LOB_SHADERS.FS_METEORS);
            const progRibbon = gfx.program(LOB_SHADERS.VS_RIBBON, LOB_SHADERS.FS_RIBBON);

            if (!progTerrain || !progMeteors || !progRibbon) return null;

            // Preallocate history texture (RGBA16F/32F)
            const histTex = gl.createTexture();
            gl.bindTexture(gl.TEXTURE_2D, histTex);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, gridW, gridH, 0, gl.RGBA, gl.HALF_FLOAT, null);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);

            const rowInterval = 0.10; // push row 10 times/second

            // Pre-warm history texture so the terrain is immediately sculpted and rugged
            const rowPackBuf = new Float32Array(gridW);
            const rowUploadBuf = new Float32Array(gridW * 4);
            for (let r = 0; r < gridH; r++) {
                book.stepUntil(r * rowInterval);
                LOB_MATH.packRow(book, rowPackBuf, gridW);
                for (let c = 0; c < gridW; c++) {
                    const h = rowPackBuf[c];
                    rowUploadBuf[c * 4] = h;
                    rowUploadBuf[c * 4 + 1] = Math.abs(h);
                    rowUploadBuf[c * 4 + 2] = 0;
                    rowUploadBuf[c * 4 + 3] = Math.sign(h);
                }
                gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, r, gridW, 1, gl.RGBA, gl.FLOAT, rowUploadBuf);
            }
            // Reset book timeline to 0 while keeping evolved terrain state and ripples
            const prewarmT = book.t;
            book.t = 0.0;
            book.hawkes.t = 0.0;
            if (book.recentEvents) {
                book.recentEvents.forEach((e) => { e.t = Math.max(0, e.t - prewarmT); });
            }

            // Heightfield grid mesh VBO & IBO
            const numVerts = gridW * gridH;
            const vertData = new Float32Array(numVerts * 2);
            let ptr = 0;
            for (let y = 0; y < gridH; y++) {
                const ny = y / (gridH - 1);
                for (let x = 0; x < gridW; x++) {
                    vertData[ptr++] = x / (gridW - 1);
                    vertData[ptr++] = ny;
                }
            }

            const numIndices = (gridW - 1) * (gridH - 1) * 6;
            const indexData = new Uint32Array(numIndices);
            let iPtr = 0;
            for (let y = 0; y < gridH - 1; y++) {
                for (let x = 0; x < gridW - 1; x++) {
                    const i0 = y * gridW + x;
                    const i1 = i0 + 1;
                    const i2 = i0 + gridW;
                    const i3 = i2 + 1;
                    indexData[iPtr++] = i0; indexData[iPtr++] = i2; indexData[iPtr++] = i1;
                    indexData[iPtr++] = i1; indexData[iPtr++] = i2; indexData[iPtr++] = i3;
                }
            }

            const vaoTerrain = gl.createVertexArray();
            const vboTerrain = gl.createBuffer();
            const iboTerrain = gl.createBuffer();
            gl.bindVertexArray(vaoTerrain);
            gl.bindBuffer(gl.ARRAY_BUFFER, vboTerrain);
            gl.bufferData(gl.ARRAY_BUFFER, vertData, gl.STATIC_DRAW);
            gl.enableVertexAttribArray(0);
            gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
            gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, iboTerrain);
            gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indexData, gl.STATIC_DRAW);
            gl.bindVertexArray(null);

            // Meteor instanced billboard setup
            const maxMeteors = 128;
            const meteorData = new Float32Array(maxMeteors * 4); // (worldX, targetX, prog, type)
            const meteorExtra = new Float32Array(maxMeteors * 2); // (size, flash)
            const meteorsList = [];

            const quadVerts = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]);
            const vaoMeteors = gl.createVertexArray();
            const vboQuad = gl.createBuffer();
            const vboMeteorInst = gl.createBuffer();
            const vboMeteorExtra = gl.createBuffer();

            gl.bindVertexArray(vaoMeteors);
            gl.bindBuffer(gl.ARRAY_BUFFER, vboQuad);
            gl.bufferData(gl.ARRAY_BUFFER, quadVerts, gl.STATIC_DRAW);
            gl.enableVertexAttribArray(0);
            gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

            gl.bindBuffer(gl.ARRAY_BUFFER, vboMeteorInst);
            gl.bufferData(gl.ARRAY_BUFFER, meteorData.byteLength, gl.DYNAMIC_DRAW);
            gl.enableVertexAttribArray(1);
            gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 0, 0);
            gl.vertexAttribDivisor(1, 1);

            gl.bindBuffer(gl.ARRAY_BUFFER, vboMeteorExtra);
            gl.bufferData(gl.ARRAY_BUFFER, meteorExtra.byteLength, gl.DYNAMIC_DRAW);
            gl.enableVertexAttribArray(2);
            gl.vertexAttribPointer(2, 2, gl.FLOAT, false, 0, 0);
            gl.vertexAttribDivisor(2, 1);
            gl.bindVertexArray(null);

            // Ribbon quad VAO
            const vaoRibbon = gl.createVertexArray();
            const vboRibbon = gl.createBuffer();
            gl.bindVertexArray(vaoRibbon);
            gl.bindBuffer(gl.ARRAY_BUFFER, vboRibbon);
            gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
            gl.enableVertexAttribArray(0);
            gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
            gl.bindVertexArray(null);

            // Matrix buffers
            const matProj = new Float32Array(16);
            const matView = new Float32Array(16);
            const matViewProj = new Float32Array(16);
            const ripplesBuf = new Float32Array(48 * 4);

            // HDR Scene Render Target with depth
            const initSz = getSize();
            let sceneTarget = gfx.target(initSz.w, initSz.h, { fp32: false, depth: true });

            // State variables
            let headRow = gridH - 1;
            let lastRowTime = 0;
            let midSmooth = book.midPrice;
            let lastCaptionUpdate = 0;
            let lastClickTime = 0;
            let simTime = 0.0;

            // Register exogenous order injection on click
            root.KW.onClick(cvs, (e) => {
                const now = performance.now();
                if (now - lastClickTime < 400) return; // 400ms cooldown
                lastClickTime = now;

                const r = cvs.getBoundingClientRect();
                const fracX = (e.clientX - r.left) / Math.max(1, r.width);
                const orderType = fracX < 0.5 ? 1 : 0; // left sells, right buys
                const mkt = book.injectMarketOrder(orderType);

                // Add active meteor
                if (meteorsList.length < maxMeteors) {
                    const priceSpan = 96.0;
                    const normStrike = (mkt.strike - midSmooth) / priceSpan;
                    const strikeWorldX = normStrike * 16.0;
                    meteorsList.push({
                        worldX: strikeWorldX + (Math.random() - 0.5) * 1.5,
                        strikeWorldX,
                        spawnTime: simTime,
                        flightDuration: 0.35,
                        type: mkt.type,
                        size: mkt.size,
                        flashIntensity: 0.0
                    });
                }
            });

            return {
                resize: (nw, nh) => {
                    sceneTarget.resize(nw, nh);
                },

                frame: (t, dt, ctx2d, outW, outH, isReduced) => {
                    simTime = t;
                    const sz = getSize();

                    // Advance LOB simulation with cap and mean-reversion anchor
                    const maxSimEvents = isReduced ? 1 : 120;
                    let evCount = 0;
                    const targetSimTime = simTime;
                    if (book.midPrice > 5003) book.injectMarketOrder(1);
                    else if (book.midPrice < 4999) book.injectMarketOrder(0);

                    while (book.t < targetSimTime && evCount < maxSimEvents) {
                        const ev = book.step();
                        if (ev && ev.eventType === "market" && meteorsList.length < maxMeteors) {
                            const priceSpan = 96.0;
                            const normStrike = (ev.strike - midSmooth) / priceSpan;
                            const strikeWorldX = normStrike * 16.0;
                            meteorsList.push({
                                worldX: strikeWorldX + (Math.random() - 0.5) * 1.2,
                                strikeWorldX,
                                spawnTime: simTime,
                                flightDuration: 0.45,
                                type: ev.type,
                                size: ev.size,
                                flashIntensity: 0.0
                            });
                        }
                        evCount++;
                    }

                    // Smoothed mid tracking (tau ~ 2 s)
                    const midAlpha = 1.0 - Math.exp(-dt / 2.0);
                    midSmooth += (book.midPrice - midSmooth) * midAlpha;

                    // Push row to history texture (~10 Hz)
                    if (t - lastRowTime >= rowInterval) {
                        lastRowTime = t;
                        headRow = (headRow + 1) % gridH;
                        LOB_MATH.packRow(book, rowPackBuf, gridW);
                        for (let c = 0; c < gridW; c++) {
                            const h = rowPackBuf[c];
                            rowUploadBuf[c * 4] = h;
                            rowUploadBuf[c * 4 + 1] = Math.abs(h);
                            rowUploadBuf[c * 4 + 2] = 0;
                            rowUploadBuf[c * 4 + 3] = Math.sign(h);
                        }
                        gl.bindTexture(gl.TEXTURE_2D, histTex);
                        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, headRow, gridW, 1, gl.RGBA, gl.FLOAT, rowUploadBuf);
                    }

                    // Update live meteors with permanent celestial sun beacon at top right
                    meteorData[0] = 3.2;   // worldX
                    meteorData[1] = 3.2;   // strikeWorldX
                    meteorData[2] = 0.04;  // prog: high in sky near directional light source
                    meteorData[3] = 0.0;   // type 0: warm golden amber/white
                    meteorExtra[0] = 6.2;  // size: 6.2 (large radiant disc)
                    meteorExtra[1] = 0.25; // soft core bloom
                    let mCount = 1;

                    for (let i = meteorsList.length - 1; i >= 0; i--) {
                        if (mCount >= maxMeteors) break;
                        const m = meteorsList[i];
                        const age = simTime - m.spawnTime;
                        if (age <= m.flightDuration) {
                            const prog = age / m.flightDuration;
                            meteorData[mCount * 4] = m.worldX;
                            meteorData[mCount * 4 + 1] = m.strikeWorldX;
                            meteorData[mCount * 4 + 2] = prog;
                            meteorData[mCount * 4 + 3] = m.type;
                            meteorExtra[mCount * 2] = m.size;
                            meteorExtra[mCount * 2 + 1] = 0.0;
                            mCount++;
                        } else if (age <= m.flightDuration + 0.22) {
                            const flashProg = (age - m.flightDuration) / 0.22;
                            meteorData[mCount * 4] = m.strikeWorldX;
                            meteorData[mCount * 4 + 1] = m.strikeWorldX;
                            meteorData[mCount * 4 + 2] = 1.0;
                            meteorData[mCount * 4 + 3] = m.type;
                            meteorExtra[mCount * 2] = m.size;
                            meteorExtra[mCount * 2 + 1] = 1.0 - flashProg;
                            mCount++;
                        } else {
                            meteorsList.splice(i, 1);
                        }
                    }

                    // Update ripple array uniform
                    const rec = book.recentEvents;
                    const nRipples = Math.min(rec.length, 48);
                    ripplesBuf.fill(0);
                    for (let i = 0; i < nRipples; i++) {
                        const e = rec[rec.length - 1 - i];
                        const off = i * 4;
                        ripplesBuf[off] = e.strike;
                        ripplesBuf[off + 1] = e.t;
                        ripplesBuf[off + 2] = e.type;
                        ripplesBuf[off + 3] = e.size;
                    }

                    // Camera view & projection with cursor parallax
                    const mouse = root.KW.local(cvs);
                    const parX = ((mouse.x / Math.max(1, sz.cssW)) - 0.5) * 0.75;
                    const parY = ((mouse.y / Math.max(1, sz.cssH)) - 0.5) * 0.40;

                    const camX = parX + Math.sin(t * 0.16) * 0.25;
                    const camY = 1.45 - parY;
                    const camZ = 3.6;
                    const camPos = [camX, camY, camZ];
                    const camTarget = [0.0, -0.35, -4.5];
                    const camUp = [0.0, 1.0, 0.0];

                    const aspect = sz.w / sz.h;
                    mat4Perspective(matProj, 44.0 * Math.PI / 180.0, aspect, 0.2, 35.0);
                    mat4LookAt(matView, camPos, camTarget, camUp);
                    mat4Multiply(matViewProj, matProj, matView);

                    // 1. Render Heightfield Terrain into sceneTarget
                    gl.bindFramebuffer(gl.FRAMEBUFFER, sceneTarget.fbo);
                    gl.viewport(0, 0, sceneTarget.w, sceneTarget.h);
                    gl.enable(gl.DEPTH_TEST);
                    gl.depthFunc(gl.LESS);

                    gl.clearColor(0.0, 0.0, 0.0, 1.0);
                    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

                    const a = root.KW.col.a || [16, 185, 129];
                    const accentNorm = [a[0] / 255, a[1] / 255, a[2] / 255];

                    progTerrain.use();
                    progTerrain.mat4("uViewProj", matViewProj);
                    progTerrain.f3("uCameraPos", camPos[0], camPos[1], camPos[2]);
                    progTerrain.f1("uGridW", gridW);
                    progTerrain.f1("uGridH", gridH);
                    progTerrain.f1("uHeadRow", headRow);
                    progTerrain.f1("uMidSmooth", midSmooth);
                    progTerrain.f1("uPriceSpan", 96.0);
                    progTerrain.f1("uZSpan", 18.0);
                    progTerrain.f1("uHeightScale", 0.38);
                    progTerrain.f1("uTime", t);
                    progTerrain.f3("uAccent", accentNorm[0], accentNorm[1], accentNorm[2]);
                    progTerrain.i1("uNumRipples", nRipples);

                    gl.uniform4fv(progTerrain.u("uRipples"), ripplesBuf);
                    progTerrain.tex("uHistory", histTex, 0);

                    gl.bindVertexArray(vaoTerrain);
                    gl.drawElements(gl.TRIANGLES, numIndices, gl.UNSIGNED_INT, 0);
                    gl.bindVertexArray(null);

                    // 2. Render Falling Meteors (Instanced Billboards)
                    if (mCount > 0) {
                        gl.enable(gl.BLEND);
                        gl.blendFunc(gl.ONE, gl.ONE);
                        gl.depthMask(false);

                        progMeteors.use();
                        progMeteors.mat4("uViewProj", matViewProj);
                        progMeteors.f3("uCameraPos", camPos[0], camPos[1], camPos[2]);
                        progMeteors.f3("uAccent", accentNorm[0], accentNorm[1], accentNorm[2]);

                        gl.bindBuffer(gl.ARRAY_BUFFER, vboMeteorInst);
                        gl.bufferSubData(gl.ARRAY_BUFFER, 0, meteorData.subarray(0, mCount * 4));
                        gl.bindBuffer(gl.ARRAY_BUFFER, vboMeteorExtra);
                        gl.bufferSubData(gl.ARRAY_BUFFER, 0, meteorExtra.subarray(0, mCount * 2));

                        gl.bindVertexArray(vaoMeteors);
                        gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, mCount);
                        gl.bindVertexArray(null);

                        gl.depthMask(true);
                        gl.disable(gl.BLEND);
                    }

                    // 3. Render Near-Edge Hawkes Intensity Ribbon
                    gl.enable(gl.BLEND);
                    gl.blendFunc(gl.ONE, gl.ONE);
                    gl.disable(gl.DEPTH_TEST);

                    const hawkesInt = book.hawkes.getIntensities(simTime);
                    const normLambda = hawkesInt.lambdaTot / 10.0;

                    progRibbon.use();
                    progRibbon.f1("uIntensityNorm", normLambda);
                    progRibbon.f3("uAccent", accentNorm[0], accentNorm[1], accentNorm[2]);
                    progRibbon.f1("uTime", t);

                    gl.bindVertexArray(vaoRibbon);
                    gl.drawArrays(gl.TRIANGLES, 0, 6);
                    gl.bindVertexArray(null);
                    gl.disable(gl.BLEND);

                    // 4. Tone Mapping & Bloom Compose onto 2D Canvas
                    gfx.compose(sceneTarget, ctx2d, outW, outH, {
                        bloomGain: 0.38,
                        exposure: 1.18,
                        threshold: 0.42,
                        time: t,
                        accent: a
                    });

                    // 5. Live Readout Caption Throttled to <= 4 Hz
                    if (t - lastCaptionUpdate >= 0.25) {
                        lastCaptionUpdate = t;
                        const spreadTicks = book.spread;
                        const imb = book.getImbalance(5);
                        const imbSign = imb >= 0 ? "+" : "";
                        const curRate = hawkesInt.lambdaTot;
                        const caption = `Simulated limit order book · bivariate Hawkes order flow (Ogata thinning) · n = 0.80 · λ = ${curRate.toFixed(1)}/s · spread = ${spreadTicks} ticks · imbalance = ${imbSign}${imb.toFixed(2)} · click to fire a market order`;
                        root.KW.tag(caption, cvs);
                    }

                    // 6. Hover Depth Overlay
                    if (mouse.x >= 0 && mouse.x <= sz.cssW && mouse.y >= 0 && mouse.y <= sz.cssH) {
                        const priceSpan = 96.0;
                        const fracX = mouse.x / sz.cssW;
                        const hoverPrice = Math.round(midSmooth + (fracX - 0.5) * priceSpan);
                        const depth = book.getVolume(hoverPrice);
                        const isBid = hoverPrice <= book.bestBid;
                        const isAsk = hoverPrice >= book.bestAsk;

                        if (depth > 0 && (isBid || isAsk)) {
                            ctx2d.save();
                            const dpr = sz.dpr || 1;
                            ctx2d.scale(dpr, dpr);
                            const lblX = Math.min(Math.max(mouse.x + 12, 10), sz.cssW - 120);
                            const lblY = Math.min(Math.max(mouse.y - 12, 20), sz.cssH - 30);

                            ctx2d.font = '500 11px "JetBrains Mono", ui-monospace, monospace';
                            const txt = `${isBid ? "BID" : "ASK"} ${hoverPrice} : ${depth} lots`;
                            const tw = ctx2d.measureText(txt).width;

                            ctx2d.fillStyle = "rgba(16, 18, 26, 0.88)";
                            ctx2d.strokeStyle = isBid ? "rgba(16, 185, 129, 0.7)" : "rgba(245, 158, 11, 0.7)";
                            ctx2d.lineWidth = 1;
                            ctx2d.beginPath();
                            ctx2d.roundRect ? ctx2d.roundRect(lblX - 6, lblY - 14, tw + 12, 20, 4) : ctx2d.rect(lblX - 6, lblY - 14, tw + 12, 20);
                            ctx2d.fill();
                            ctx2d.stroke();

                            ctx2d.fillStyle = isBid ? "rgb(16, 185, 129)" : "rgb(245, 158, 11)";
                            ctx2d.fillText(txt, lblX, lblY);
                            ctx2d.restore();
                        }
                    }
                },

                dispose: () => {
                    sceneTarget.dispose();
                    gl.deleteTexture(histTex);
                    gl.deleteBuffer(vboTerrain);
                    gl.deleteBuffer(iboTerrain);
                    gl.deleteVertexArray(vaoTerrain);
                    gl.deleteBuffer(vboQuad);
                    gl.deleteBuffer(vboMeteorInst);
                    gl.deleteBuffer(vboMeteorExtra);
                    gl.deleteVertexArray(vaoMeteors);
                    gl.deleteBuffer(vboRibbon);
                    gl.deleteVertexArray(vaoRibbon);
                }
            };
        }, fallbackFn);
    };
}));
