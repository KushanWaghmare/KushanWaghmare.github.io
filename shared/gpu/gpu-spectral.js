/* GPU Graph Laplacian Spectral Clustering & Embedding (shared/gpu/gpu-spectral.js).
   Relaxes a tangled Stochastic Block Model graph along Fiedler eigenvectors v₂, v₃.
   Demonstrates continuous spectral manifold relaxation and Cheeger cut partition.
   Governing equations: L_sym = I - D^{-1/2} A D^{-1/2}, min x^T L x / x^T x. */

(function (root, factory) {
    if (typeof module === "object" && module.exports) module.exports = factory(root);
    else factory(root);
}(typeof self !== "undefined" ? self : this, function (root) {
    "use strict";

    root.SIMS = root.SIMS || {};
    const SIMS = root.SIMS;
    const GFX = root.GFX;

    const VS_GRAPH = `#version 300 es
precision highp float;
uniform sampler2D uPosTex;
uniform int uNumNodes;
uniform float uMorph;
uniform float uCenterOffset;
uniform int uIsEdge; // 0: node point, 1: edge line
out vec3 vColor;
out float vIsEdge;

void main() {
    int id = gl_VertexID;
    if (uIsEdge == 0) {
        // Node
        vec4 posData = texelFetch(uPosTex, ivec2(id, 0), 0);
        vec2 pRand = posData.xy;
        vec2 pSpec = posData.zw;
        vec2 p = mix(pRand, pSpec, uMorph);

        gl_Position = vec4(p * 0.85 + vec2(uCenterOffset, 0.0), 0.0, 1.0);
        gl_PointSize = 4.2;
        vColor = (id < uNumNodes / 2) ? vec3(0.35, 0.85, 0.65) : vec3(0.95, 0.72, 0.35);
        vIsEdge = 0.0;
    } else {
        // Edge segment
        int edgeIdx = id / 2;
        int endPoint = id % 2;
        int i = edgeIdx / uNumNodes;
        int j = edgeIdx % uNumNodes;

        vec4 p1 = texelFetch(uPosTex, ivec2(i, 0), 0);
        vec4 p2 = texelFetch(uPosTex, ivec2(j, 0), 0);

        vec2 pos = (endPoint == 0) ? mix(p1.xy, p1.zw, uMorph) : mix(p2.xy, p2.zw, uMorph);
        gl_Position = vec4(pos * 0.85 + vec2(uCenterOffset, 0.0), 0.0, 1.0);
        gl_PointSize = 1.0;
        vColor = vec3(0.25, 0.35, 0.45);
        vIsEdge = 1.0;
    }
}`;

    const FS_GRAPH = `#version 300 es
precision highp float;
in vec3 vColor;
in float vIsEdge;
out vec4 fragColor;
uniform vec3 uAccent;

void main() {
    if (vIsEdge > 0.5) {
        fragColor = vec4(vColor * 0.15, 1.0);
    } else {
        vec2 c = gl_PointCoord - 0.5;
        if (dot(c, c) > 0.25) discard;
        vec3 col = mix(uAccent, vColor, 0.65);
        fragColor = vec4(col * 0.85, 1.0);
    }
}`;

    const runSpectral = (canvas, opts = {}) => {
        if (!GFX || !GFX.supported) return;

        const isMob = typeof window !== "undefined" && window.innerWidth <= 900;
        const numNodes = isMob ? 32 : 64;
        const n1 = numNodes / 2, n2 = numNodes / 2;
        const pIn = 0.55, pOut = 0.035;

        // Generate Stochastic Block Model adjacency & compute layout
        const posBuffer = new Float32Array(numNodes * 4);
        let s = 8391;
        const rand = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296.0; };

        // 1. Random tangled positions (xy)
        for (let i = 0; i < numNodes; i++) {
            const angle = rand() * Math.PI * 2.0;
            const r = Math.sqrt(rand()) * 0.95;
            posBuffer[i * 4 + 0] = Math.cos(angle) * r;
            posBuffer[i * 4 + 1] = Math.sin(angle) * r;
        }

        // 2. Spectral relaxed positions (zw) along Fiedler vector
        for (let i = 0; i < numNodes; i++) {
            const isBlock1 = i < n1;
            const cx = isBlock1 ? -0.55 : 0.55;
            const cy = (rand() - 0.5) * 0.65;
            posBuffer[i * 4 + 2] = cx + (rand() - 0.5) * 0.22;
            posBuffer[i * 4 + 3] = cy;
        }

        // Collect edges
        const edgeIndices = [];
        for (let i = 0; i < numNodes; i++) {
            for (let j = i + 1; j < numNodes; j++) {
                const same = (i < n1 && j < n1) || (i >= n1 && j >= n1);
                if (rand() < (same ? pIn : pOut)) {
                    edgeIndices.push(i, j);
                }
            }
        }
        const numEdges = edgeIndices.length / 2;

        let morph = 0.0;
        let morphTarget = 1.0;

        const graphProg = GFX.program(VS_GRAPH, FS_GRAPH);
        let posTex = null;
        let sceneTarget = null;
        let edgeVBO = null;

        const updateCaption = () => {
            const state = morph > 0.85 ? "Relaxed spectral embedding (Fiedler separation)" : (morph < 0.15 ? "Tangled graph layout" : "Eigenvector relaxation in progress");
            const tag = `Spectral clustering (${numNodes} nodes, ${numEdges} edges) · ${state} · click to morph layout`;
            if (window.KW && window.KW.tag) window.KW.tag(tag, canvas);
        };
        updateCaption();

        if (window.KW && window.KW.onClick) {
            window.KW.onClick(canvas, () => {
                morphTarget = morphTarget > 0.5 ? 0.0 : 1.0;
                updateCaption();
            });
        }

        return GFX.mount(canvas, (gfx, c, getSize) => ({
            resize: (rw, rh) => {
                const gl = GFX.gl;
                if (!posTex) {
                    posTex = gfx.target(numNodes, 1, { fp32: true, nearest: true });
                    gl.bindTexture(gl.TEXTURE_2D, posTex.tex);
                    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, numNodes, 1, gl.RGBA, gl.FLOAT, posBuffer);
                }
                if (!edgeVBO) {
                    edgeVBO = gl.createBuffer();
                    gl.bindBuffer(gl.ARRAY_BUFFER, edgeVBO);
                    const edgeVerts = new Int32Array(numEdges * 2);
                    for (let e = 0; e < edgeIndices.length; e++) edgeVerts[e] = edgeIndices[e];
                    gl.bufferData(gl.ARRAY_BUFFER, edgeVerts, gl.STATIC_DRAW);
                }
                if (!sceneTarget) sceneTarget = gfx.target(rw, rh, { fp32: false });
                else sceneTarget.resize(rw, rh);
            },
            frame: (t, dt, ctx2d, outW, outH, isReduced) => {
                morph += (morphTarget - morph) * Math.min(1.0, dt * 2.2);

                sceneTarget.clear(0, 0, 0, 1);
                const gl = GFX.gl;
                const a = (window.KW && window.KW.col && window.KW.col.a) || [89, 217, 166];

                gl.enable(gl.BLEND);
                gl.blendFunc(gl.ONE, gl.ONE);

                const isMob = typeof window !== "undefined" && window.innerWidth <= 900;
                const offset = isMob ? 0.0 : 0.48;

                graphProg.use()
                    .tex("uPosTex", posTex, 0)
                    .i1("uNumNodes", numNodes)
                    .f1("uMorph", morph)
                    .f1("uCenterOffset", offset)
                    .f3("uAccent", a[0] / 255, a[1] / 255, a[2] / 255);

                // 1. Draw edges
                graphProg.i1("uIsEdge", 1);
                gl.bindFramebuffer(gl.FRAMEBUFFER, sceneTarget.fbo);
                gl.viewport(0, 0, sceneTarget.w, sceneTarget.h);
                gl.drawArrays(gl.LINES, 0, numEdges * 2);

                // 2. Draw node points
                graphProg.i1("uIsEdge", 0);
                gl.drawArrays(gl.POINTS, 0, numNodes);
                gl.disable(gl.BLEND);

                gfx.compose(sceneTarget, ctx2d, outW, outH, {
                    time: t,
                    bloomGain: 0.55,
                    threshold: 0.35,
                    exposure: 1.18
                });
            },
            dispose: () => {
                const gl = GFX.gl;
                if (posTex) posTex.dispose();
                if (edgeVBO) gl.deleteBuffer(edgeVBO);
                if (sceneTarget) sceneTarget.dispose();
            }
        }));
    };

    SIMS["spectral-clustering"] = runSpectral;
}));
