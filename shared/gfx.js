/* Shared WebGL2 HDR Graphics Foundation (shared/gfx.js).
   Single offscreen WebGL2 context, shader cache, RGBA16F/32F targets, ping-pong buffers,
   PCG + Box-Muller GPU PRNG, texture-state GPU particles, and 5-level Dual-Kawase bloom
   with ACES filmic tonemapping, vignette, grain, and drawImage copy to 2-D slide canvases. */

(function (root, factory) {
    if (typeof module === "object" && module.exports) module.exports = factory(root);
    else root.GFX = factory(root);
}(typeof self !== "undefined" ? self : this, function (root) {
    "use strict";

    const VERSION = "42", moduleCache = new Map(), progCache = new Map(), instances = new Set();

    const MOD_DEPS = {
        lob: ["shared/gpu/gpu-lob-shaders.js"],
        math: ["shared/lib/mobius-math.js"],
        "primes-waves": ["shared/lib/zeta-zeros.js", "shared/lib/zeta-math.js", "shared/gpu/gpu-primes-waves-shaders.js"],
        qsim: ["shared/lib/qsim-math.js", "shared/gpu/gpu-qsim-shaders.js"],
        copula: ["shared/lib/copula-math.js", "shared/gpu/gpu-copula-shaders.js"],
        crystal: ["shared/lib/lattice-math.js", "shared/gpu/gpu-crystal-shaders.js"],
        quant: ["shared/lib/lattice-math.js", "shared/gpu/gpu-crystal-shaders.js"],
        cy: ["shared/lib/cy-math.js", "shared/gpu/gpu-cy-shaders.js", "shared/gpu/gpu-cy-oit.js"]
    };

    const loadScript = (src) => new Promise((resolve, reject) => {
        const s = document.createElement("script");
        s.src = `${src}?v=${VERSION}`;
        s.async = true;
        s.onload = () => resolve();
        s.onerror = (e) => reject(e);
        document.head.appendChild(s);
    });

    const loadModule = (name) => {
        if (moduleCache.has(name)) return moduleCache.get(name);
        if (typeof document === "undefined") return Promise.resolve(null);
        const mainSrc = name === "quant" ? "shared/gpu/gpu-crystal.js" : `shared/gpu/gpu-${name}.js`;
        const deps = [...(MOD_DEPS[name] || []), mainSrc];
        const p = deps.reduce((chain, src) => chain.then(() => loadScript(src)), Promise.resolve())
            .then(() => root.SIMS)
            .catch((e) => { moduleCache.delete(name); throw e; });
        moduleCache.set(name, p);
        return p;
    };

    const isMobile = () => typeof window !== "undefined" && window.innerWidth <= 900;
    let glCanvas = null, gl = null, extFloat = null, extHalf = null, extLinear = null;
    let quadVAO = null, quadVBO = null, emptyVAO = null;
    let bloomTargets = [], bloomLevels = 0, bloomW = 0, bloomH = 0;

    const VS_QUAD = `#version 300 es
layout(location = 0) in vec2 aPos; out vec2 vUV;
void main() { vUV = aPos * 0.5 + 0.5; gl_Position = vec4(aPos, 0.0, 1.0); }`;

    const GLSL_PRNG = `
uint pcgHash(uint v) {
    uint state = v * 747796405u + 2891336453u;
    uint word = ((state >> ((state >> 28u) + 4u)) ^ state) * 277803737u;
    return (word >> 22u) ^ word;
}
uvec4 pcg4d(uvec4 v) {
    v = v * 1664525u + 1013904223u;
    v.x += v.y * v.w; v.y += v.z * v.x; v.z += v.x * v.y; v.w += v.y * v.z; v ^= v >> 16u;
    v.x += v.y * v.w; v.y += v.z * v.x; v.z += v.x * v.y; v.w += v.y * v.z; return v;
}
float rand01(inout uint s) { s = pcgHash(s); return float(s) * (1.0 / 4294967296.0); }
vec2 boxMuller(inout uint s) {
    float u1 = max(rand01(s), 1e-7), u2 = rand01(s), r = sqrt(-2.0 * log(u1)), th = 6.28318530718 * u2;
    return vec2(r * cos(th), r * sin(th));
}`;

    const FS_FADE = `#version 300 es
precision highp float; in vec2 vUV; out vec4 fragColor;
uniform sampler2D uPrev; uniform float uFade;
void main() { fragColor = vec4(texture(uPrev, vUV).rgb * uFade, 1.0); }`;

    const FS_BLOOM_DOWN = `#version 300 es
precision highp float; in vec2 vUV; out vec4 fragColor;
uniform sampler2D uTex; uniform vec2 uTexel; uniform int uFirst; uniform float uThreshold;
void main() {
    vec2 d = uTexel;
    vec3 c = (texture(uTex, vUV).rgb * 4.0 + texture(uTex, vUV + vec2(-d.x, -d.y)).rgb + texture(uTex, vUV + vec2(d.x, -d.y)).rgb
            + texture(uTex, vUV + vec2(-d.x, d.y)).rgb + texture(uTex, vUV + vec2(d.x, d.y)).rgb) * 0.125;
    if (isnan(c.r) || isnan(c.g) || isnan(c.b) || isinf(c.r) || isinf(c.g) || isinf(c.b)) {
        c = vec3(0.0);
    }
    if (uFirst == 1) {
        float br = max(max(c.r, c.g), c.b), knee = uThreshold * 0.5, soft = clamp(br - uThreshold + knee, 0.0, 2.0 * knee);
        c *= clamp(max((soft * soft) / (4.0 * knee + 1e-4), br - uThreshold) / max(br, 1e-4), 0.0, 1.0);
    }
    fragColor = vec4(c, 1.0);
}`;

    const FS_BLOOM_UP = `#version 300 es
precision highp float; in vec2 vUV; out vec4 fragColor;
uniform sampler2D uTex; uniform vec2 uTexel;
void main() {
    vec2 d = uTexel;
    vec3 s = texture(uTex, vUV + vec2(-d.x * 2.0, 0.0)).rgb + texture(uTex, vUV + vec2(d.x * 2.0, 0.0)).rgb
           + texture(uTex, vUV + vec2(0.0, d.y * 2.0)).rgb + texture(uTex, vUV + vec2(0.0, -d.y * 2.0)).rgb
           + (texture(uTex, vUV + vec2(-d.x, d.y)).rgb + texture(uTex, vUV + vec2(d.x, d.y)).rgb
            + texture(uTex, vUV + vec2(d.x, -d.y)).rgb + texture(uTex, vUV + vec2(-d.x, -d.y)).rgb) * 2.0;
    fragColor = vec4(s / 12.0, 1.0);
}`;

    const FS_COMPOSE = `#version 300 es
precision highp float; in vec2 vUV; out vec4 fragColor;
uniform sampler2D uScene, uBloom; uniform float uBloomGain, uExposure, uTime; uniform vec2 uRes; uniform vec3 uAccent;
vec3 aces(vec3 x) { return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }
float hashGrain(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
void main() {
    vec3 bg = vec3(0.0);
    vec4 scn = texture(uScene, vUV);
    vec3 baseCol = bg + scn.rgb;
    vec3 hdr = (baseCol + texture(uBloom, vUV).rgb * uBloomGain) * uExposure;
    if (isnan(hdr.r) || isnan(hdr.g) || isnan(hdr.b) || isinf(hdr.r) || isinf(hdr.g) || isinf(hdr.b)) {
        hdr = bg;
    }
    vec2 d = vUV - 0.5; hdr *= clamp(1.0 - 0.35 * dot(d, d), 0.0, 1.0);
    vec3 col = pow(aces(hdr), vec3(1.0 / 2.2));
    float luma = dot(col, vec3(0.2126, 0.7152, 0.0722));
    float g = (hashGrain(vUV * uRes + fract(uTime * 19.3)) - 0.5) * 0.018 * smoothstep(0.0, 0.15, luma);
    fragColor = vec4(clamp(col + g, 0.0, 1.0), 1.0);
}`;

    const init = () => {
        if (gl !== null) return !!gl;
        if (typeof document === "undefined") return false;
        glCanvas = document.createElement("canvas");
        gl = glCanvas.getContext("webgl2", {
            alpha: false, depth: false, stencil: false, antialias: false,
            premultipliedAlpha: false, preserveDrawingBuffer: false, powerPreference: "high-performance"
        });
        if (!gl) return false;
        extFloat = gl.getExtension("EXT_color_buffer_float");
        extHalf = gl.getExtension("EXT_color_buffer_half_float");
        extLinear = gl.getExtension("OES_texture_float_linear");
        if (!extFloat && !extHalf) { gl = null; return false; }
        quadVAO = gl.createVertexArray(); quadVBO = gl.createBuffer();
        gl.bindVertexArray(quadVAO); gl.bindBuffer(gl.ARRAY_BUFFER, quadVBO);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
        gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
        gl.bindVertexArray(null); emptyVAO = gl.createVertexArray();
        return true;
    };

    const program = (vsSrc, fsSrc) => {
        if (!init()) return null;
        const key = vsSrc + "\0" + fsSrc;
        if (progCache.has(key)) return progCache.get(key);
        const compile = (type, src) => {
            const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
            if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
                console.error("GFX shader compile error:\n", gl.getShaderInfoLog(s), "\nSource:\n", src);
                gl.deleteShader(s); return null;
            }
            return s;
        };
        const vs = compile(gl.VERTEX_SHADER, vsSrc), fs = compile(gl.FRAGMENT_SHADER, fsSrc);
        if (!vs || !fs) return null;
        const p = gl.createProgram();
        gl.attachShader(p, vs); gl.attachShader(p, fs); gl.linkProgram(p);
        gl.deleteShader(vs); gl.deleteShader(fs);
        if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
            console.error("GFX program link error:\n", gl.getProgramInfoLog(p));
            gl.deleteProgram(p); return null;
        }
        const uMap = new Map(), u = (n) => (uMap.has(n) ? uMap.get(n) : (uMap.set(n, gl.getUniformLocation(p, n)), uMap.get(n)));
        const api = {
            prog: p, u, use: () => { gl.useProgram(p); return api; },
            f1: (n, x) => { gl.uniform1f(u(n), x); return api; },
            i1: (n, x) => { gl.uniform1i(u(n), x); return api; },
            f2: (n, x, y) => { gl.uniform2f(u(n), x, y); return api; },
            f3: (n, x, y, z) => { gl.uniform3f(u(n), x, y, z); return api; },
            f4: (n, x, y, z, w) => { gl.uniform4f(u(n), x, y, z, w); return api; },
            mat4: (n, m) => { gl.uniformMatrix4fv(u(n), false, m); return api; },
            tex: (n, tObj, unit = 0) => {
                gl.activeTexture(gl.TEXTURE0 + unit);
                gl.bindTexture(gl.TEXTURE_2D, tObj.tex || tObj);
                gl.uniform1i(u(n), unit); return api;
            }
        };
        progCache.set(key, api); return api;
    };

    const quad = (progWrapper, fbo = null, w = 0, h = 0) => {
        if (fbo !== undefined) gl.bindFramebuffer(gl.FRAMEBUFFER, fbo ? (fbo.fbo !== undefined ? fbo.fbo : fbo) : null);
        if (w > 0 && h > 0) gl.viewport(0, 0, w, h);
        else if (fbo && fbo.w) gl.viewport(0, 0, fbo.w, fbo.h);
        if (progWrapper) progWrapper.use();
        gl.bindVertexArray(quadVAO); gl.drawArrays(gl.TRIANGLES, 0, 3);
    };

    const target = (w, h, opts = {}) => {
        if (!init()) return null;
        const fp32 = !!(opts.fp32 && extFloat), internalFormat = fp32 ? gl.RGBA32F : gl.RGBA16F;
        const type = fp32 ? gl.FLOAT : gl.HALF_FLOAT, filter = (opts.nearest || (fp32 && !extLinear)) ? gl.NEAREST : gl.LINEAR;
        const wrap = opts.wrap || gl.CLAMP_TO_EDGE;
        const tex = gl.createTexture(), fbo = gl.createFramebuffer(), rbo = opts.depth ? gl.createRenderbuffer() : null;
        const alloc = (nw, nh, data = null) => {
            nw = Math.max(1, nw | 0); nh = Math.max(1, nh | 0);
            gl.bindTexture(gl.TEXTURE_2D, tex);
            gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, nw, nh, 0, gl.RGBA, type, data);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
            gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
            gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
            if (rbo) {
                gl.bindRenderbuffer(gl.RENDERBUFFER, rbo);
                gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, nw, nh);
                gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, rbo);
            }
            obj.w = nw; obj.h = nh;
        };
        const obj = {
            tex, fbo, rbo, w: 0, h: 0,
            resize: (nw, nh) => { if (nw !== obj.w || nh !== obj.h) alloc(nw, nh, null); },
            upload: (data) => alloc(obj.w, obj.h, data),
            clear: (r = 0, g = 0, b = 0, a = 1) => {
                gl.bindFramebuffer(gl.FRAMEBUFFER, fbo); gl.viewport(0, 0, obj.w, obj.h);
                gl.clearColor(r, g, b, a); gl.clear(gl.COLOR_BUFFER_BIT | (rbo ? gl.DEPTH_BUFFER_BIT : 0));
            },
            dispose: () => { if (rbo) gl.deleteRenderbuffer(rbo); gl.deleteFramebuffer(fbo); gl.deleteTexture(tex); }
        };
        alloc(w, h, opts.data || null); return obj;
    };

    const pingPong = (w, h, opts = {}) => {
        const a = target(w, h, opts), b = target(w, h, opts);
        let idx = 0;
        return {
            read: () => (idx === 0 ? a : b), write: () => (idx === 0 ? b : a), swap: () => { idx = 1 - idx; },
            resize: (nw, nh) => { a.resize(nw, nh); b.resize(nw, nh); },
            clear: (r = 0, g = 0, bl = 0, al = 1) => { a.clear(r, g, bl, al); b.clear(r, g, bl, al); },
            dispose: () => { a.dispose(); b.dispose(); }
        };
    };

    const particles = (texW, texH, opts = {}) => {
        const count = texW * texH;
        const state = pingPong(texW, texH, { fp32: true, nearest: true, data: opts.initData || null });
        const aux = opts.dual ? pingPong(texW, texH, { fp32: true, nearest: true, data: opts.initAux || null }) : null;
        return {
            texW, texH, count, state, aux,
            step: (uProg, bind) => {
                uProg.use().tex("uState", state.read(), 0).i1("uTexW", texW).i1("uTexH", texH);
                if (aux) uProg.tex("uAux", aux.read(), 1);
                if (bind) bind(uProg);
                quad(uProg, state.write()); state.swap();
            },
            stepAux: (uProg, bind) => {
                if (!aux) return;
                uProg.use().tex("uState", state.read(), 0).tex("uAux", aux.read(), 1).i1("uTexW", texW).i1("uTexH", texH);
                if (bind) bind(uProg);
                quad(uProg, aux.write()); aux.swap();
            },
            draw: (dProg, bind, targetFBO, n = count) => {
                const fboHandle = targetFBO ? (targetFBO.fbo !== undefined ? targetFBO.fbo : targetFBO) : null;
                const fw = targetFBO ? (targetFBO.w || glCanvas.width) : glCanvas.width;
                const fh = targetFBO ? (targetFBO.h || glCanvas.height) : glCanvas.height;
                gl.bindFramebuffer(gl.FRAMEBUFFER, fboHandle); gl.viewport(0, 0, fw, fh);
                gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
                dProg.use().tex("uState", state.read(), 0).i1("uTexW", texW);
                if (aux) dProg.tex("uAux", aux.read(), 1);
                if (bind) bind(dProg);
                gl.bindVertexArray(emptyVAO); gl.drawArrays(gl.POINTS, 0, n); gl.disable(gl.BLEND);
            },
            dispose: () => { state.dispose(); if (aux) aux.dispose(); }
        };
    };

    const ensureBloom = (w, h, levels) => {
        if (bloomW === w && bloomH === h && bloomLevels === levels && bloomTargets.length === levels) return;
        bloomTargets.forEach((t) => t.dispose());
        bloomTargets = []; bloomW = w; bloomH = h; bloomLevels = levels;
        let bw = Math.max(2, w >> 1), bh = Math.max(2, h >> 1);
        for (let i = 0; i < levels; i++) {
            bloomTargets.push(target(bw, bh, { fp32: false }));
            bw = Math.max(2, bw >> 1); bh = Math.max(2, bh >> 1);
        }
    };

    const compose = (sceneTex, outCtx2d, outW, outH, opts = {}) => {
        const w = sceneTex.w, h = sceneTex.h, levels = opts.bloomLevels || (isMobile() ? 3 : 5);
        ensureBloom(w, h, levels);
        const downProg = program(VS_QUAD, FS_BLOOM_DOWN), upProg = program(VS_QUAD, FS_BLOOM_UP), compProg = program(VS_QUAD, FS_COMPOSE);
        for (let k = 0; k < levels; k++) {
            const prev = k === 0 ? sceneTex : bloomTargets[k - 1];
            downProg.use().tex("uTex", prev, 0).f2("uTexel", 1 / prev.w, 1 / prev.h).i1("uFirst", k === 0 ? 1 : 0).f1("uThreshold", opts.threshold ?? 0.45);
            quad(downProg, bloomTargets[k]);
        }
        gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
        for (let k = levels - 2; k >= 0; k--) {
            const sm = bloomTargets[k + 1];
            upProg.use().tex("uTex", sm, 0).f2("uTexel", 1 / sm.w, 1 / sm.h);
            quad(upProg, bloomTargets[k]);
        }
        gl.disable(gl.BLEND);
        if (glCanvas.width !== outW || glCanvas.height !== outH) { glCanvas.width = outW; glCanvas.height = outH; }
        const a = opts.accent || (root.KW && root.KW.col && root.KW.col.a) || [79, 140, 255];
        compProg.use().tex("uScene", sceneTex, 0).tex("uBloom", bloomTargets[0], 1)
            .f1("uBloomGain", opts.bloomGain ?? 0.32).f1("uExposure", opts.exposure ?? 1.15)
            .f1("uTime", opts.time || 0).f2("uRes", outW, outH).f3("uAccent", a[0] / 255, a[1] / 255, a[2] / 255);
        quad(compProg, null, outW, outH);
        if (outCtx2d) outCtx2d.drawImage(glCanvas, 0, 0, outW, outH);
    };

    const sampleBoxMullerGPU = (numSamples = 1000000, seed = 13374201) => {
        if (!init() || !extFloat) return null;
        const side = Math.ceil(Math.sqrt(numSamples / 4));
        const fs = `#version 300 es\nprecision highp float;\nprecision highp int;\nin vec2 vUV; out vec4 fragColor;\nuniform uint uSeed; uniform int uSide;\n${GLSL_PRNG}\nvoid main() {\n ivec2 p = ivec2(gl_FragCoord.xy);\n uint s = uSeed + uint(p.y * uSide + p.x) * 4u;\n fragColor = vec4(boxMuller(s), boxMuller(s));\n}`;
        const t = target(side, side, { fp32: true, nearest: true }), p = program(VS_QUAD, fs);
        p.use().i1("uSide", side); gl.uniform1ui(p.u("uSeed"), seed >>> 0); quad(p, t);
        const buf = new Float32Array(side * side * 4);
        gl.bindFramebuffer(gl.FRAMEBUFFER, t.fbo); gl.readPixels(0, 0, side, side, gl.RGBA, gl.FLOAT, buf); t.dispose();
        let sum = 0, sumSq = 0;
        for (let i = 0; i < numSamples; i++) { const v = buf[i]; sum += v; sumSq += v * v; }
        const mean = sum / numSamples, variance = sumSq / numSamples - mean * mean;
        return { count: numSamples, mean, variance };
    };

    const mount = (canvas, simFactory, fallbackFn) => {
        if (!init()) return fallbackFn ? fallbackFn(canvas) : null;
        const ctx2d = canvas.getContext("2d");
        if (!ctx2d) return fallbackFn ? fallbackFn(canvas) : null;
        if (canvas.__gfxInst) canvas.__gfxInst.dispose();
        const mob = isMobile(), minScale = mob ? 0.5 : 0.6, maxScale = mob ? 0.82 : 1.0;
        let scale = mob ? 0.68 : 0.88, ema = 16.0, fc = 0, drawnOnce = false, lastNow = performance.now();
        let W = 300, H = 150, dpr = 1, rw = 240, rh = 120;
        const inst = { canvas, vis: 0, dispose: () => {} };
        canvas.__gfxInst = inst; instances.add(inst);
        const sim = simFactory(GFX, canvas, () => ({ w: rw, h: rh, cssW: W, cssH: H, dpr, isMobile: isMobile() }));
        if (!sim) { instances.delete(inst); return fallbackFn ? fallbackFn(canvas) : null; }
        const updateSize = (w, h, d) => {
            W = Math.max(1, w); H = Math.max(1, h); dpr = d || 1;
            rw = Math.max(64, (W * dpr * scale) | 0); rh = Math.max(64, (H * dpr * scale) | 0);
            if (sim.resize) sim.resize(rw, rh, W, H, dpr);
        };
        if (root.KW && root.KW.fit) root.KW.fit(canvas, updateSize);
        else updateSize(canvas.clientWidth || 800, canvas.clientHeight || 600, 1);
        const prevDispose = canvas.__dispose;
        inst.dispose = canvas.__dispose = () => {
            instances.delete(inst);
            if (sim.dispose) try { sim.dispose(); } catch (e) {}
            if (prevDispose) try { prevDispose(); } catch (e) {}
        };
        const stepFrame = (t, dt) => {
            const r = canvas.getBoundingClientRect(), vh = typeof window !== "undefined" ? window.innerHeight : 800;
            inst.vis = Math.max(0, Math.min(r.bottom, vh) - Math.max(r.top, 0)) / Math.max(1, r.height);
            let best = inst;
            for (const other of instances) { if (other.vis > best.vis) best = other; }
            if (drawnOnce && best !== inst) return;
            const now = performance.now(), rawMs = Math.min(100, Math.max(1, now - lastNow));
            lastNow = now; ema += (rawMs - ema) * 0.08;
            if (++fc % 45 === 0 && !root.KW?.REDUCED) {
                if (ema > 22.0 && scale > minScale) { scale = Math.max(minScale, scale * 0.88); updateSize(W, H, dpr); }
                else if (ema < 10.0 && scale < maxScale) { scale = Math.min(maxScale, scale * 1.05); updateSize(W, H, dpr); }
            }
            if (root.KW && root.KW.REDUCED) {
                if (!drawnOnce) { sim.frame(0.5, 0.016, ctx2d, canvas.width, canvas.height, true); drawnOnce = true; }
                return;
            }
            sim.frame(t, dt, ctx2d, canvas.width, canvas.height, false);
            drawnOnce = true;
        };
        if (root.KW && root.KW.loop) root.KW.loop(canvas, stepFrame);
        return inst;
    };

    const fadeScene = (pp, fadeFactor) => {
        const p = program(VS_QUAD, FS_FADE);
        p.use().tex("uPrev", pp.read(), 0).f1("uFade", fadeFactor);
        quad(p, pp.write()); pp.swap(); return pp.read();
    };

    const drawPoints = (prog, targetFBO, count) => {
        if (!init()) return;
        const fboHandle = targetFBO ? (targetFBO.fbo !== undefined ? targetFBO.fbo : targetFBO) : null;
        const fw = targetFBO ? (targetFBO.w || glCanvas.width) : glCanvas.width;
        const fh = targetFBO ? (targetFBO.h || glCanvas.height) : glCanvas.height;
        gl.bindFramebuffer(gl.FRAMEBUFFER, fboHandle); gl.viewport(0, 0, fw, fh);
        gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
        if (prog) prog.use();
        gl.bindVertexArray(emptyVAO); gl.drawArrays(gl.POINTS, 0, count); gl.disable(gl.BLEND);
    };

    const GFX = {
        get gl() { init(); return gl; }, get supported() { return init(); },
        VS_QUAD, GLSL_PRNG, isMobile, loadModule, init, program, quad,
        target, pingPong, particles, drawPoints, fadeScene, compose, sampleBoxMullerGPU, mount
    };
    root.loadModule = loadModule;
    if (root.KW) root.KW.loadModule = loadModule;
    return GFX;
}));
