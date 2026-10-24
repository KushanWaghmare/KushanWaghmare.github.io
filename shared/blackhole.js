/**
 * blackhole.js
 *
 * Physically grounded Kerr (spinning) black hole ray tracer in WebGL2.
 * Based on Boyer–Lindquist null geodesics (Luminet 1979 / Interstellar DNGR).
 *
 * Features:
 *   - Asymmetric D-shaped event horizon shadow
 *   - Thin Novikov–Thorne accretion disk with zero-torque ISCO boundary
 *   - Relativistic Doppler beaming (I ∝ g⁴) and gravitational redshift
 *   - Photon ring and higher-order lensed disk images (orders 1 to 4)
 *   - 16-bit floating-point HDR pipeline (RGBA16F) with ACES tonemapping
 *
 * Units & Conventions:
 *   - G = c = M = 1 (geometrised units).
 *   - Spin axis: site's +y axis (θ = 0).
 *   - Prograde accretion disk in equatorial plane θ = π/2.
 *   - Screen coordinate α < 0 corresponds to the approaching (blueshifted) side.
 */

'use strict';

(() => {
    const root = typeof window !== "undefined" ? window : (typeof globalThis !== "undefined" ? globalThis : this);
    root.SIMS = root.SIMS || {};
    const SIMS = root.SIMS;

    const fallbackLite = (c) => {
        if (typeof window !== 'undefined' && window.BLACKHOLE_LITE) {
            return window.BLACKHOLE_LITE(c);
        }
        if (typeof SIMS !== 'undefined' && SIMS.blackholeLite) {
            return SIMS.blackholeLite(c);
        }
        return false;
    };

    SIMS.blackhole = (c, optionsOrFallback = {}) => {
        const isFn = typeof optionsOrFallback === "function";
        const opts = isFn ? {} : optionsOrFallback;
        const fallback = isFn ? optionsOrFallback : fallbackLite;

        // Attempt WebGL2 context
        const gl = c.getContext("webgl2", {
            alpha: true,
            premultipliedAlpha: false,
            antialias: false,
            powerPreference: "high-performance"
        });

        if (!gl) {
            console.warn("WebGL2 not available, falling back to blackhole-lite");
            return fallback && fallback(c);
        }

        // Verify floating-point framebuffer and filtering support
        const extFloat = gl.getExtension("EXT_color_buffer_float");
        const extHalfFloat = gl.getExtension("EXT_color_buffer_half_float");
        gl.getExtension("OES_texture_float_linear");

        if (!extFloat && !extHalfFloat) {
            console.warn("EXT_color_buffer_float not supported, falling back to blackhole-lite");
            return fallback && fallback(c);
        }

        const physics = (typeof window !== 'undefined' && window.BLACKHOLE_PHYSICS) ||
                        (typeof BLACKHOLE_PHYSICS !== 'undefined' && BLACKHOLE_PHYSICS);
        const shaders = (typeof window !== 'undefined' && window.BLACKHOLE_SHADERS) ||
                        (typeof BLACKHOLE_SHADERS !== 'undefined' && BLACKHOLE_SHADERS);

        if (!physics || !shaders) {
            console.warn("Black hole physics or shaders module missing, falling back");
            return fallback && fallback(c);
        }

        // Shader compilation helper
        const compile = (type, src) => {
            const s = gl.createShader(type);
            gl.shaderSource(s, src);
            gl.compileShader(s);
            if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
                console.warn("Black hole shader compile error:", gl.getShaderInfoLog(s));
                gl.deleteShader(s);
                return null;
            }
            return s;
        };

        const createProg = (vsSrc, fsSrc) => {
            const vs = compile(gl.VERTEX_SHADER, vsSrc);
            const fs = compile(gl.FRAGMENT_SHADER, fsSrc);
            if (!vs || !fs) return null;

            const p = gl.createProgram();
            gl.attachShader(p, vs);
            gl.attachShader(p, fs);
            gl.linkProgram(p);
            if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
                console.warn("Black hole program link error:", gl.getProgramInfoLog(p));
                gl.deleteProgram(p);
                return null;
            }
            return p;
        };

        // ---------------------------------------------------------------------
        // Shader Programs
        // ---------------------------------------------------------------------
        // 1. Ray marcher program (renders Kerr geodesics with sub-pixel jitter)
        const marchProg = createProg(shaders.VS_QUAD, shaders.FS_KERR_MARCH);
        // 2. Temporal Anti-Aliasing (TAA) accumulation program
        const accumProg = createProg(shaders.VS_QUAD, shaders.FS_ACCUM);
        // 3. Dual-Kawase downsampling program
        const bloomDownProg = createProg(shaders.VS_QUAD, shaders.FS_BLOOM_DOWN);
        // 4. Dual-Kawase upsampling program
        const bloomUpProg = createProg(shaders.VS_QUAD, shaders.FS_BLOOM_UP);
        // 5. Filmic compose & tonemapping program
        const composeProg = createProg(shaders.VS_QUAD, shaders.FS_COMPOSE || shaders.FS_BLIT);

        if (!marchProg || !accumProg || !bloomDownProg || !bloomUpProg || !composeProg) {
            console.warn("Failed to create Kerr shader programs, falling back");
            return fallback && fallback(c);
        }

        // Shared full-screen triangle quad buffer
        const quadBuf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);

        const setupQuad = (prog) => {
            const aLoc = gl.getAttribLocation(prog, "aPosition");
            if (aLoc >= 0) {
                gl.enableVertexAttribArray(aLoc);
                gl.vertexAttribPointer(aLoc, 2, gl.FLOAT, false, 0, 0);
            }
        };

        // Uniform locations for Ray Marcher
        const uMarch = {};
        [
            "uRes", "uTime", "uSpin", "uTilt", "uCamDist", "uFovScale", "uOriginShiftX",
            "uRout", "uDiskOpacity", "uMaxSteps", "uEpsHorizon", "uExposure",
            "uAccent", "uRplus", "uRisco", "uDiskLUT", "uSkyCube", "uMode", "uDiskType",
            "uDiskH", "uTpeak", "uJitter", "uDebugMode"
        ].forEach((name) => {
            uMarch[name] = gl.getUniformLocation(marchProg, name);
        });

        // Uniform locations for Accumulation Pass
        const uAccum = {};
        ["uCurrent", "uHistory", "uBlend"].forEach((name) => {
            uAccum[name] = gl.getUniformLocation(accumProg, name);
        });

        // Uniform locations for Bloom Down Pass
        const uBloomDown = {};
        ["uTexture", "uTexelSize", "uFirstPass", "uThreshold"].forEach((name) => {
            uBloomDown[name] = gl.getUniformLocation(bloomDownProg, name);
        });

        // Uniform locations for Bloom Up Pass
        const uBloomUp = {};
        ["uSmall", "uTexelSize"].forEach((name) => {
            uBloomUp[name] = gl.getUniformLocation(bloomUpProg, name);
        });

        // Uniform locations for Compose Pass
        const uCompose = {};
        [
            "uRayTarget", "uBloomTarget", "uBloomIntensity", "uExposure",
            "uTime", "uRes", "uDebugMode"
        ].forEach((name) => {
            uCompose[name] = gl.getUniformLocation(composeProg, name);
        });

        // Configurable simulation parameters
        const SPIN = typeof opts.spin === "number" ? Math.max(-0.998, Math.min(0.998, opts.spin)) : 0.95;
        const initialTilt = typeof opts.inclination === "number" ? (opts.inclination * Math.PI / 180) : (78.0 * Math.PI / 180);
        const MODE = opts.mode === "cinematic" ? 1 : 0;
        const DISK_TYPE = opts.disk === "volumetric" ? 1 : 0;
        const T_PEAK = typeof opts.Tpeak === "number" ? opts.Tpeak : 7000.0;
        const DISK_H = typeof opts.diskH === "number" ? opts.diskH : 0.05;
        const R_OUT = typeof opts.rOut === "number" ? opts.rOut : 25.0;

        // Ensure pitch-black space background unwashed by section accent overlays
        const prevZIndex = c.style ? c.style.zIndex : "";
        const prevBg = c.style ? c.style.background : "";
        if (c.style) {
            c.style.zIndex = "0";
            c.style.background = "#000000";
        }
        if (c.parentElement && c.parentElement.children) {
            Array.from(c.parentElement.children).forEach((el) => {
                if (el !== c && el.style && !el.style.zIndex) el.style.zIndex = "1";
            });
        }

        const r_plus = physics.horizon(SPIN);
        const r_isco = physics.isco(SPIN, true);

        // Debug mode selection via URL query parameter ?bh=debug or opts.debug
        const urlParams = typeof window !== 'undefined' && window.location ? new URLSearchParams(window.location.search) : null;
        const isDebugUrl = urlParams && urlParams.has("bh") && (urlParams.get("bh") === "debug" || urlParams.get("bh") !== "false");
        let debugMode = isDebugUrl
            ? Math.max(1, Math.min(4, parseInt(urlParams.get("view") || "1", 10)))
            : (typeof opts.debug === "number" ? opts.debug : (opts.debug ? 1 : 0));
        let prevDebugMode = debugMode;

        // Precompute 1-D disk lookup table texture (512 texels from r_isco to r_out)
        const lutTex = gl.createTexture();
        let currentLUTSpin = -999;

        const updateLUT = (spin) => {
            if (currentLUTSpin === spin) return;
            const rIn = physics.isco(spin, true);
            const lut = physics.getDiskLUT(spin, rIn, R_OUT, 512);

            gl.activeTexture(gl.TEXTURE1);
            gl.bindTexture(gl.TEXTURE_2D, lutTex);
            gl.texImage2D(
                gl.TEXTURE_2D, 0, gl.RGBA16F,
                lut.width, 1, 0,
                gl.RGBA, gl.FLOAT, lut.data
            );
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
            currentLUTSpin = spin;
        };

        updateLUT(SPIN);

        // Performance & mobile configuration (tuned for 60 FPS)
        const mobile = matchMedia("(max-width: 900px)").matches;
        const MAX_STEPS = mobile ? 64 : 88;
        const MIN_SCALE = mobile ? 0.30 : 0.35;
        const MAX_SCALE = mobile ? 0.55 : 0.65;
        const numBloomLevels = mobile ? 3 : 4;
        let W = 0, H = 0, DPR = 1, scale = mobile ? 0.38 : 0.52, ema = 14, fc = 0;

        // Bake procedural starfield cubemap (RGBA16F, mipmapped)
        const skyCubeTex = gl.createTexture();
        const accentCol = (typeof KW !== "undefined" && KW.col && KW.col.a) ? KW.col.a : [56, 189, 248];
        const skySize = mobile ? 512 : 1024;
        const starfield = physics.getStarfieldData(skySize, [accentCol[0] / 255, accentCol[1] / 255, accentCol[2] / 255]);

        gl.activeTexture(gl.TEXTURE2);
        gl.bindTexture(gl.TEXTURE_CUBE_MAP, skyCubeTex);
        for (let i = 0; i < 6; i++) {
            gl.texImage2D(
                gl.TEXTURE_CUBE_MAP_POSITIVE_X + i, 0, gl.RGBA16F,
                starfield.size, starfield.size, 0,
                gl.RGBA, gl.FLOAT, starfield.faces[i]
            );
        }
        gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
        gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE);
        try {
            gl.generateMipmap(gl.TEXTURE_CUBE_MAP);
        } catch (e) {
            console.warn("Cubemap generateMipmap warning:", e);
        }

        // Camera tilt: θ_obs defaults around 80° (1.396 rad)
        let tilt = initialTilt, tiltT = initialTilt, prevTilt = initialTilt, flare = 0;

        // ---------------------------------------------------------------------
        // Framebuffers & Textures Setup (TAA Ping-Pong + Dual-Kawase Chain)
        // ---------------------------------------------------------------------
        const targetFBO = gl.createFramebuffer();
        const targetTex = gl.createTexture();

        const accumFBO = [gl.createFramebuffer(), gl.createFramebuffer()];
        const accumTex = [gl.createTexture(), gl.createTexture()];
        let accumIdx = 0;
        let accumCount = 0;

        const bloomFBO = [];
        const bloomTex = [];
        const bloomSizes = [];
        for (let i = 0; i < numBloomLevels; i++) {
            bloomFBO.push(gl.createFramebuffer());
            bloomTex.push(gl.createTexture());
            bloomSizes.push({ w: 0, h: 0 });
        }

        let targetW = 0, targetH = 0;

        const resizeFBO = (bw, bh) => {
            if (targetW === bw && targetH === bh) return;
            targetW = bw;
            targetH = bh;

            // 1. Ray marcher target texture
            gl.bindTexture(gl.TEXTURE_2D, targetTex);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, bw, bh, 0, gl.RGBA, gl.HALF_FLOAT, null);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
            gl.bindFramebuffer(gl.FRAMEBUFFER, targetFBO);
            gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, targetTex, 0);

            // 2. Ping-pong TAA accumulation textures
            for (let i = 0; i < 2; i++) {
                gl.bindTexture(gl.TEXTURE_2D, accumTex[i]);
                gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, bw, bh, 0, gl.RGBA, gl.HALF_FLOAT, null);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
                gl.bindFramebuffer(gl.FRAMEBUFFER, accumFBO[i]);
                gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, accumTex[i], 0);
            }

            // 3. Dual-Kawase bloom pyramid levels
            for (let i = 0; i < numBloomLevels; i++) {
                const lw = Math.max(2, Math.floor(bw / Math.pow(2, i + 1)));
                const lh = Math.max(2, Math.floor(bh / Math.pow(2, i + 1)));
                bloomSizes[i] = { w: lw, h: lh };

                gl.bindTexture(gl.TEXTURE_2D, bloomTex[i]);
                gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, lw, lh, 0, gl.RGBA, gl.HALF_FLOAT, null);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
                gl.bindFramebuffer(gl.FRAMEBUFFER, bloomFBO[i]);
                gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, bloomTex[i], 0);
            }

            gl.bindFramebuffer(gl.FRAMEBUFFER, null);
            accumCount = 0;
        };

        const applyScale = () => {
            const bw = Math.max(2, Math.round(W * DPR * scale));
            const bh = Math.max(2, Math.round(H * DPR * scale));
            if (c.width !== bw || c.height !== bh) {
                c.width = bw;
                c.height = bh;
            }
            resizeFBO(bw, bh);
        };

        KW.fit(c, (w, h, dpr) => {
            W = w;
            H = h;
            DPR = Math.min(dpr, 1.35);
            applyScale();
        });

        // Sub-pixel 2D Halton sequence generator for low-discrepancy TAA jitter
        const halton2D = (index) => {
            let h2 = 0, f2 = 0.5, n2 = index;
            while (n2 > 0) { h2 += f2 * (n2 % 2); n2 = Math.floor(n2 / 2); f2 *= 0.5; }
            let h3 = 0, f3 = 1 / 3, n3 = index;
            while (n3 > 0) { h3 += f3 * (n3 % 3); n3 = Math.floor(n3 / 3); f3 /= 3; }
            return [h2 - 0.5, h3 - 0.5];
        };

        // Keyboard listener to cycle debug modes
        const onKeyDown = (e) => {
            if (e.key === "d" || e.key === "D") {
                debugMode = (debugMode + 1) % 5;
                updateTag();
            }
        };
        const onContextLost = (e) => {
            e.preventDefault();
            console.warn("WebGL2 context lost, falling back to blackhole-lite");
            if (c.__dispose) c.__dispose();
            fallback && fallback(c);
        };
        c.addEventListener("webglcontextlost", onContextLost, false);

        const prevDispose = c.__dispose;
        c.__dispose = () => {
            try {
                if (c.style) {
                    c.style.zIndex = prevZIndex;
                    c.style.background = prevBg;
                }
                c.removeEventListener("webglcontextlost", onContextLost);
                window.removeEventListener("keydown", onKeyDown);
                if (targetFBO) gl.deleteFramebuffer(targetFBO);
                if (targetTex) gl.deleteTexture(targetTex);
                accumFBO.forEach((f) => f && gl.deleteFramebuffer(f));
                accumTex.forEach((t) => t && gl.deleteTexture(t));
                bloomFBO.forEach((f) => f && gl.deleteFramebuffer(f));
                bloomTex.forEach((t) => t && gl.deleteTexture(t));
                if (lutTex) gl.deleteTexture(lutTex);
                if (skyCubeTex) gl.deleteTexture(skyCubeTex);
                if (quadBuf) gl.deleteBuffer(quadBuf);
                if (marchProg) gl.deleteProgram(marchProg);
                if (accumProg) gl.deleteProgram(accumProg);
                if (bloomDownProg) gl.deleteProgram(bloomDownProg);
                if (bloomUpProg) gl.deleteProgram(bloomUpProg);
                if (composeProg) gl.deleteProgram(composeProg);
                const ext = gl.getExtension("WEBGL_lose_context");
                if (ext) ext.loseContext();
            } catch (e) {}
            if (prevDispose) prevDispose();
        };

        KW.onClick(c, () => {
            flare = 1.0;
            accumCount = 0;
        });

        const debugNames = [
            "",
            "Hamiltonian error |H|",
            "Crossing order (1:blue, 2:green, 3:yellow, 4:red)",
            "Redshift & Doppler g-factor map",
            "Disk hit radius r ∈ [r_isco, r_out]"
        ];

        const updateTag = () => {
            const diskDesc = opts.disk === "volumetric" ? "Gaussian volumetric disk" : "Novikov–Thorne thin disk";
            const modeDesc = opts.mode === "cinematic" ? "cinematic beaming" : "Doppler beaming g⁴";
            const debugPrefix = debugMode > 0 ? `[DEBUG ${debugMode}/4: ${debugNames[debugMode]} (press 'D' to cycle)] · ` : "";
            KW.tag(
                `${debugPrefix}Kerr null geodesics (a = ${SPIN}) · Boyer–Lindquist RK4 ray tracer · ${diskDesc} · ${modeDesc} · lensed starfield · cursor tilts inclination`,
                c
            );
        };
        updateTag();

        const prefersReduced = (typeof window !== "undefined" && window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
        let lastFrameMs = typeof performance !== "undefined" ? performance.now() : 0;

        // Main animation & render loop
        KW.loop(c, (t, dt) => {
            // Respect prefers-reduced-motion: render one converged frame and stop
            if (prefersReduced && accumCount >= 32) return;

            const nowMs = typeof performance !== "undefined" ? performance.now() : (lastFrameMs + dt * 1000);
            const rawDtMs = lastFrameMs > 0 ? Math.min(200, Math.max(1, nowMs - lastFrameMs)) : 16.0;
            lastFrameMs = nowMs;

            // Interactive camera inclination
            const p = KW.local(c);
            const inside = p.x > 0 && p.y > 0 && p.x < W && p.y < H;
            // Map cursor y to inclination θ_obs in [0.08, 1.53] rad (4.6° to 87.6°)
            tiltT = inside ? 0.08 + 1.45 * Math.min(1.0, Math.max(0.0, p.y / H)) : initialTilt;
            tilt += (tiltT - tilt) * Math.min(1.0, dt * 2.5);
            flare = Math.max(0.0, flare - dt * 0.8);

            // Temporal Anti-Aliasing (TAA) static detection
            const moved = Math.abs(tilt - prevTilt) > 0.0003 || flare > 0.001 || debugMode !== prevDebugMode;
            prevTilt = tilt;
            prevDebugMode = debugMode;

            if (moved) {
                accumCount = 0;
            } else if (accumCount < 64) {
                accumCount++;
            }

            // Dynamic resolution scaling with unclamped frame-time hysteresis (targeting 60 FPS)
            ema += (rawDtMs - ema) * 0.08;
            if (++fc % 45 === 0) {
                if (ema > 22.0 && scale > MIN_SCALE) {
                    scale = Math.max(MIN_SCALE, scale * 0.88);
                    applyScale();
                } else if (ema < 9.0 && scale < MAX_SCALE) {
                    scale = Math.min(MAX_SCALE, scale * 1.05);
                    applyScale();
                }
            }

            const accent = KW.col.a;
            const jitterIdx = prefersReduced ? accumCount : ((accumCount % 8) + 1);
            const jitter = (accumCount > 0 && debugMode === 0) ? halton2D(jitterIdx) : [0.0, 0.0];

            // -------------------------------------------------------------
            // PASS 1: Ray Marcher -> Target Framebuffer
            // -------------------------------------------------------------
            gl.bindFramebuffer(gl.FRAMEBUFFER, targetFBO);
            gl.viewport(0, 0, targetW, targetH);
            gl.useProgram(marchProg);

            gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
            setupQuad(marchProg);

            updateLUT(SPIN);
            gl.activeTexture(gl.TEXTURE1);
            gl.bindTexture(gl.TEXTURE_2D, lutTex);
            gl.uniform1i(uMarch.uDiskLUT, 1);

            gl.activeTexture(gl.TEXTURE2);
            gl.bindTexture(gl.TEXTURE_CUBE_MAP, skyCubeTex);
            gl.uniform1i(uMarch.uSkyCube, 2);

            gl.uniform2f(uMarch.uRes, targetW, targetH);
            gl.uniform1f(uMarch.uTime, prefersReduced ? 0.0 : t);
            gl.uniform1f(uMarch.uSpin, SPIN);
            gl.uniform1f(uMarch.uTilt, tilt);
            gl.uniform1f(uMarch.uCamDist, 50.0);
            gl.uniform1f(uMarch.uFovScale, 38.0);
            gl.uniform1f(uMarch.uOriginShiftX, mobile ? 0.0 : 0.16);
            gl.uniform1f(uMarch.uRout, R_OUT);
            gl.uniform1f(uMarch.uDiskOpacity, 0.85);
            gl.uniform1i(uMarch.uMaxSteps, MAX_STEPS);
            gl.uniform1f(uMarch.uEpsHorizon, 0.02); // Documented ε = 0.02 for sub-pixel convergence
            gl.uniform1f(uMarch.uExposure, 1.0 + 0.5 * flare);
            gl.uniform3f(uMarch.uAccent, accent[0] / 255, accent[1] / 255, accent[2] / 255);
            gl.uniform2f(uMarch.uJitter, jitter[0], jitter[1]);
            gl.uniform1i(uMarch.uDebugMode, debugMode);

            gl.uniform1f(uMarch.uRplus, r_plus);
            gl.uniform1f(uMarch.uRisco, r_isco);
            gl.uniform1i(uMarch.uMode, MODE);
            gl.uniform1i(uMarch.uDiskType, DISK_TYPE);
            gl.uniform1f(uMarch.uDiskH, DISK_H);
            gl.uniform1f(uMarch.uTpeak, T_PEAK);

            gl.drawArrays(gl.TRIANGLES, 0, 3);

            // -------------------------------------------------------------
            // PASS 2: Temporal Anti-Aliasing (TAA) Ping-Pong Accumulation
            // -------------------------------------------------------------
            const currentAccumFBO = accumFBO[accumIdx];
            const historyAccumTex = accumTex[1 - accumIdx];
            const blendFactor = accumCount === 0
                ? 1.0
                : (prefersReduced ? (1.0 / (accumCount + 1.0)) : Math.max(0.22, 1.0 / (accumCount + 1.0)));

            gl.bindFramebuffer(gl.FRAMEBUFFER, currentAccumFBO);
            gl.viewport(0, 0, targetW, targetH);
            gl.useProgram(accumProg);
            setupQuad(accumProg);

            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, targetTex);
            gl.uniform1i(uAccum.uCurrent, 0);

            gl.activeTexture(gl.TEXTURE1);
            gl.bindTexture(gl.TEXTURE_2D, historyAccumTex);
            gl.uniform1i(uAccum.uHistory, 1);

            gl.uniform1f(uAccum.uBlend, blendFactor);
            gl.drawArrays(gl.TRIANGLES, 0, 3);

            const activeHDRTex = accumTex[accumIdx];

            // -------------------------------------------------------------
            // PASS 3: Dual-Kawase Bloom Chain (Down + Up)
            // -------------------------------------------------------------
            if (debugMode === 0) {
                // 3A: Downsample pyramid
                for (let k = 0; k < numBloomLevels; k++) {
                    const bw_k = bloomSizes[k].w;
                    const bh_k = bloomSizes[k].h;
                    gl.bindFramebuffer(gl.FRAMEBUFFER, bloomFBO[k]);
                    gl.viewport(0, 0, bw_k, bh_k);
                    gl.useProgram(bloomDownProg);
                    setupQuad(bloomDownProg);

                    gl.activeTexture(gl.TEXTURE0);
                    if (k === 0) {
                        gl.bindTexture(gl.TEXTURE_2D, activeHDRTex);
                        gl.uniform1i(uBloomDown.uTexture, 0);
                        gl.uniform2f(uBloomDown.uTexelSize, 1.0 / targetW, 1.0 / targetH);
                        gl.uniform1i(uBloomDown.uFirstPass, 1);
                        gl.uniform1f(uBloomDown.uThreshold, 0.85);
                    } else {
                        gl.bindTexture(gl.TEXTURE_2D, bloomTex[k - 1]);
                        gl.uniform1i(uBloomDown.uTexture, 0);
                        gl.uniform2f(uBloomDown.uTexelSize, 1.0 / bloomSizes[k - 1].w, 1.0 / bloomSizes[k - 1].h);
                        gl.uniform1i(uBloomDown.uFirstPass, 0);
                        gl.uniform1f(uBloomDown.uThreshold, 0.0);
                    }
                    gl.drawArrays(gl.TRIANGLES, 0, 3);
                }

                // 3B: Upsample pyramid with additive blending
                gl.enable(gl.BLEND);
                gl.blendFunc(gl.ONE, gl.ONE);
                gl.useProgram(bloomUpProg);
                setupQuad(bloomUpProg);

                for (let k = numBloomLevels - 2; k >= 0; k--) {
                    const bw_k = bloomSizes[k].w;
                    const bh_k = bloomSizes[k].h;
                    gl.bindFramebuffer(gl.FRAMEBUFFER, bloomFBO[k]);
                    gl.viewport(0, 0, bw_k, bh_k);

                    gl.activeTexture(gl.TEXTURE0);
                    gl.bindTexture(gl.TEXTURE_2D, bloomTex[k + 1]);
                    gl.uniform1i(uBloomUp.uSmall, 0);
                    gl.uniform2f(uBloomUp.uTexelSize, 1.0 / bloomSizes[k + 1].w, 1.0 / bloomSizes[k + 1].h);

                    gl.drawArrays(gl.TRIANGLES, 0, 3);
                }
                gl.disable(gl.BLEND);
            }

            // -------------------------------------------------------------
            // PASS 4: Composition & Tonemapping -> Screen (ACES + Vignette + Grain)
            // -------------------------------------------------------------
            gl.bindFramebuffer(gl.FRAMEBUFFER, null);
            gl.viewport(0, 0, c.width, c.height);
            gl.useProgram(composeProg);
            setupQuad(composeProg);

            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, activeHDRTex);
            gl.uniform1i(uCompose.uRayTarget, 0);

            gl.activeTexture(gl.TEXTURE1);
            gl.bindTexture(gl.TEXTURE_2D, bloomTex[0]);
            gl.uniform1i(uCompose.uBloomTarget, 1);

            gl.uniform1f(uCompose.uBloomIntensity, 0.07);
            gl.uniform1f(uCompose.uExposure, 1.0 + 0.4 * flare);
            gl.uniform1f(uCompose.uTime, t);
            gl.uniform2f(uCompose.uRes, c.width, c.height);
            gl.uniform1i(uCompose.uDebugMode, debugMode);

            gl.drawArrays(gl.TRIANGLES, 0, 3);

            accumIdx = 1 - accumIdx;
        });
    };

    SIMS.physics = (c) => SIMS.blackhole(c, { spin: 0.95, inclination: 78, mode: "physical", disk: "thin" });
})();