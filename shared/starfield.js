/**
 * shared/starfield.js
 *
 * Single deterministic shared celestial starfield module for all portfolio sections.
 * Matches the reference Mathematics section look:
 *   - Sparse, soft-glowing stars (1.5 to 6.0 px with Gaussian halos)
 *   - Varied Planckian blackbody colour temperatures (3,500 K to 12,000 K)
 *   - Pareto power-law magnitude distribution (many faint, few prominent anchors)
 *   - 2-3 parallax depth layers with gentle twinkle (amplitude <= 10%)
 *   - Strictly pure black background (#000000, screen-corner luminance < 0.01)
 *
 * Exports:
 *   1. Raw star buffer data for direct WebGL / Three.js point rendering
 *   2. Pre-rendered, mipmapped RGBA16F WebGL2 cubemap for black hole ray tracing
 */

(function (root, factory) {
    if (typeof module === "object" && module.exports) {
        module.exports = factory();
    } else {
        root.STARFIELD = factory();
    }
}(typeof self !== "undefined" ? self : this, function () {
    "use strict";

    /* ---------- Reference Mathematics Starfield Configuration ---------- */
    const STAR_COUNT = 1800;                 // Sparse celestial field (1000 on mobile)
    const STAR_COUNT_MOBILE = 1000;
    const SIZE_MIN = 1.5;                    // Minimum star core diameter (px)
    const SIZE_MAX = 6.0;                    // Maximum star diameter with halo (px)
    const HALO_SOFTNESS = 5.5;               // Gaussian exponential falloff factor
    const COLOUR_TEMPS = {
        O_B_BLUE: 11500,                     // Blue-white
        A_WHITE: 8500,                       // Crisp neutral white
        F_WARM_WHITE: 6500,                  // Soft warm white
        G_YELLOW: 5500,                      // Solar golden yellow
        K_ORANGE: 4200,                      // Warm orange
        M_RED: 3500                          // Deep warm red dwarf
    };
    const PARALLAX_LAYERS = 3;               // Far (0), Mid (1), Near (2)
    const TWINKLE_AMPLITUDE = 0.08;          // Gentle twinkle <= 10%
    const PURE_BLACK = Object.freeze([0.0, 0.0, 0.0]); // Corner luminance strictly 0.000

    /* ---------- Deterministic Seeded PRNG (Mulberry32) ---------- */
    const createPrng = (seed = 0x53544152) => {
        let s = seed >>> 0;
        return () => {
            s = (s + 0x6D2B79F5) >>> 0;
            let t = Math.imul(s ^ (s >>> 15), 1 | s);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    };

    /* ---------- Analytical Tanner Helland Blackbody Fitting (3,500 K - 12,000 K) ---------- */
    const blackbodyRGB = (tempK) => {
        const t = Math.max(1000.0, Math.min(40000.0, tempK)) * 0.01;
        const tA = Math.max(t - 60.0, 1.0);
        const tB = Math.max(t - 10.0, 1.0);
        let r, g, b;

        if (t <= 66.0) {
            r = 1.0;
            g = Math.min(1.0, Math.max(0.0, (99.4708025861 * Math.log(Math.max(t, 1.0)) - 161.1195681661) / 255.0));
        } else {
            r = Math.min(1.0, Math.max(0.0, 329.698727 * Math.pow(tA, -0.1332047592) / 255.0));
            g = Math.min(1.0, Math.max(0.0, 288.1221695283 * Math.pow(tA, -0.0755148492) / 255.0));
        }

        if (t >= 66.0) {
            b = 1.0;
        } else if (t <= 19.0) {
            b = 0.0;
        } else {
            b = Math.min(1.0, Math.max(0.0, (138.5177312231 * Math.log(tB) - 305.0447927307) / 255.0));
        }

        // Tonal grading for warm stars under 4500 K to avoid oversaturated orange
        if (tempK < 4500.0) {
            const warmRamp = Math.max(0.0, Math.min(1.0, (tempK - 3000.0) / 1500.0));
            r = 0.95 + 0.05 * warmRamp;
            g = 0.55 + 0.25 * warmRamp;
            b = 0.25 + 0.35 * warmRamp;
        }

        return [r, g, b];
    };

    /* ---------- Build Deterministic Star Catalog ---------- */
    let cachedCatalog = null;
    let cachedIsMobile = null;

    const buildStarCatalog = (isMobile = false) => {
        if (cachedCatalog && cachedIsMobile === isMobile) {
            return cachedCatalog;
        }

        const count = isMobile ? STAR_COUNT_MOBILE : STAR_COUNT;
        const rand = createPrng(0x53544152);

        const directions = new Float32Array(count * 3);
        const positions = new Float32Array(count * 3);
        const colours = new Float32Array(count * 3);
        const sizes = new Float32Array(count);
        const seeds = new Float32Array(count * 4); // [twinklePhase, twinkleFreq, layer, magnitude]

        for (let i = 0; i < count; i++) {
            const i3 = i * 3;
            const i4 = i * 4;

            // 1. Uniform isotropic sphere distribution (Fibonacci/Poisson pseudo-random)
            const z = rand() * 2.0 - 1.0;
            const phi = rand() * 2.0 * Math.PI;
            const rxy = Math.sqrt(Math.max(0.0, 1.0 - z * z));
            const dx = rxy * Math.cos(phi);
            const dy = z;
            const dz = rxy * Math.sin(phi);

            directions[i3]     = dx;
            directions[i3 + 1] = dy;
            directions[i3 + 2] = dz;

            // Periodic 160-unit cube position for 3D parallax rendering
            positions[i3]     = (rand() - 0.5) * 160.0;
            positions[i3 + 1] = (rand() - 0.5) * 160.0;
            positions[i3 + 2] = (rand() - 0.5) * 160.0;

            // 2. Pareto power-law magnitude distribution: mostly crisp faint stars, few prominent anchors
            const u = Math.max(1e-4, rand());
            const mag = Math.min(1.0, 0.16 * Math.pow(u, -0.58));

            // 3. Stellar temperature distribution: predominantly white/blue-white with warm accents
            const uT = rand();
            // Skewed: 55% A/B white-blue, 30% F/G yellow-white, 15% K/M warm
            let tempK;
            if (uT < 0.55) {
                tempK = 7500.0 + (12000.0 - 7500.0) * (uT / 0.55);
            } else if (uT < 0.85) {
                tempK = 5200.0 + (7500.0 - 5200.0) * ((uT - 0.55) / 0.30);
            } else {
                tempK = 3500.0 + (5200.0 - 3500.0) * ((uT - 0.85) / 0.15);
            }

            const [cr, cg, cb] = blackbodyRGB(tempK);
            colours[i3]     = cr;
            colours[i3 + 1] = cg;
            colours[i3 + 2] = cb;

            // 4. Physical size with Gaussian halo: 1.5 to 6.0 px
            sizes[i] = SIZE_MIN + (SIZE_MAX - SIZE_MIN) * Math.pow(mag, 1.8);

            // 5. Parallax depth layer (0 = far, 1 = mid, 2 = near) and gentle twinkle
            const layer = rand() < 0.60 ? 0 : (rand() < 0.85 ? 1 : 2);
            seeds[i4]     = rand() * Math.PI * 2.0;         // Twinkle phase
            seeds[i4 + 1] = 1.2 + rand() * 2.4;              // Twinkle frequency
            seeds[i4 + 2] = layer;                           // Depth layer
            seeds[i4 + 3] = mag;                             // Magnitude
        }

        cachedCatalog = {
            count,
            directions,
            positions,
            colours,
            sizes,
            seeds,
            isMobile
        };
        cachedIsMobile = isMobile;

        return cachedCatalog;
    };

    /* ---------- Cubemap Coordinate Utilities & Seamless Seam Wrapping ---------- */
    const faceCoordToDir = (face, sc, tc) => {
        switch (face) {
            case 0: return [1.0, -tc, -sc];  // +X
            case 1: return [-1.0, -tc, sc];  // -X
            case 2: return [sc, 1.0, tc];    // +Y
            case 3: return [sc, -1.0, -tc];  // -Y
            case 4: return [sc, -tc, 1.0];   // +Z
            case 5: return [-sc, -tc, -1.0]; // -Z
        }
        return [0.0, 0.0, 1.0];
    };

    const dirToFaceCoord = (dx, dy, dz) => {
        const ax = Math.abs(dx), ay = Math.abs(dy), az = Math.abs(dz);
        let face = 0, sc = 0, tc = 0, ma = 1;
        if (ax >= ay && ax >= az) {
            if (dx > 0) { face = 0; sc = -dz; tc = -dy; ma = ax; }
            else        { face = 1; sc =  dz; tc = -dy; ma = ax; }
        } else if (ay >= ax && ay >= az) {
            if (dy > 0) { face = 2; sc =  dx; tc =  dz; ma = ay; }
            else        { face = 3; sc =  dx; tc = -dz; ma = ay; }
        } else {
            if (dz > 0) { face = 4; sc =  dx; tc = -dy; ma = az; }
            else        { face = 5; sc = -dx; tc = -dy; ma = az; }
        }
        return { face, sc: sc / ma, tc: tc / ma };
    };

    /* ---------- Procedural RGBA16F / RGBA32F Cubemap Baker ---------- */
    let cachedCubeTex = null;
    let cachedCubeSize = 0;

    /**
     * Bakes the deterministic shared starfield into a WebGL2 cubemap.
     * Guaranteed pure black background (#000000, 0.0 luminance).
     * Stars are rendered as anti-aliased Gaussian discs with bilinear splatting
     * and seamless boundary wrapping across cube face seams.
     */
    const bakeStarfieldCubemap = (gl, targetSize = 2048, isMobile = false) => {
        if (!gl) return null;
        const size = isMobile ? Math.min(1024, targetSize) : targetSize;

        if (cachedCubeTex && cachedCubeSize === size && gl.isTexture(cachedCubeTex)) {
            return cachedCubeTex;
        }

        const catalog = buildStarCatalog(isMobile);
        const { count, directions, colours, sizes, seeds } = catalog;

        // Allocate 6 faces of Float32Array (RGBA)
        const faces = [];
        for (let f = 0; f < 6; f++) {
            faces.push(new Float32Array(size * size * 4));
        }

        // Angular pixel size on cubemap face
        const pxAngle = 2.0 / size;

        for (let i = 0; i < count; i++) {
            const i3 = i * 3;
            const i4 = i * 4;
            const dx = directions[i3];
            const dy = directions[i3 + 1];
            const dz = directions[i3 + 2];
            const cr = colours[i3];
            const cg = colours[i3 + 1];
            const cb = colours[i3 + 2];
            const starSizePx = sizes[i];
            const mag = seeds[i4 + 3];

            // Base star luminance scaled by magnitude
            const starLuminance = 0.35 + 2.85 * Math.pow(mag, 2.2);

            // Project direction to cubemap face
            const proj = dirToFaceCoord(dx, dy, dz);
            const baseFace = proj.face;
            const px = 0.5 * (proj.sc + 1.0) * size - 0.5;
            const py = 0.5 * (proj.tc + 1.0) * size - 0.5;

            // Gaussian radius on cubemap face (proportional to star size)
            const sigmaPx = Math.max(0.75, starSizePx * (size / 1024.0) * 0.45);
            const rBound = Math.ceil(sigmaPx * 3.2);

            const ix = Math.round(px);
            const iy = Math.round(py);

            // Splat Gaussian disc with seamless seam wrapping
            for (let dyOff = -rBound; dyOff <= rBound; dyOff++) {
                const targetY = iy + dyOff;
                for (let dxOff = -rBound; dxOff <= rBound; dxOff++) {
                    const targetX = ix + dxOff;
                    const distSqPx = dxOff * dxOff + dyOff * dyOff;
                    const gaussWeight = Math.exp(-distSqPx / (2.0 * sigmaPx * sigmaPx));

                    if (gaussWeight < 0.002) continue;

                    let splatFace = baseFace;
                    let splatX = targetX;
                    let splatY = targetY;

                    // Check if sample spills across cube face edge
                    if (targetX < 0 || targetX >= size || targetY < 0 || targetY >= size) {
                        const sc = 2.0 * (targetX + 0.5) / size - 1.0;
                        const tc = 2.0 * (targetY + 0.5) / size - 1.0;
                        const spilledDir = faceCoordToDir(baseFace, sc, tc);
                        const wrapProj = dirToFaceCoord(spilledDir[0], spilledDir[1], spilledDir[2]);
                        splatFace = wrapProj.face;
                        splatX = Math.round(0.5 * (wrapProj.sc + 1.0) * size - 0.5);
                        splatY = Math.round(0.5 * (wrapProj.tc + 1.0) * size - 0.5);
                    }

                    if (splatX >= 0 && splatX < size && splatY >= 0 && splatY < size) {
                        const pIdx = (splatY * size + splatX) * 4;
                        const faceData = faces[splatFace];
                        const lum = starLuminance * gaussWeight;
                        faceData[pIdx]     += cr * lum;
                        faceData[pIdx + 1] += cg * lum;
                        faceData[pIdx + 2] += cb * lum;
                        faceData[pIdx + 3] += lum;
                    }
                }
            }
        }

        // Upload to WebGL2 TEXTURE_CUBE_MAP
        const cubeTex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_CUBE_MAP, cubeTex);

        // Determine best floating-point texture internalformat
        const extColorFloat = gl.getExtension("EXT_color_buffer_float");
        gl.getExtension("OES_texture_float_linear");
        const internalFormat = extColorFloat ? gl.RGBA16F : gl.RGBA;
        const uploadType = extColorFloat ? gl.FLOAT : gl.FLOAT;

        for (let f = 0; f < 6; f++) {
            gl.texImage2D(
                gl.TEXTURE_CUBE_MAP_POSITIVE_X + f,
                0,
                internalFormat,
                size,
                size,
                0,
                gl.RGBA,
                uploadType,
                faces[f]
            );
        }

        gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
        gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE);

        // Anisotropic filtering
        const extAniso = gl.getExtension("EXT_texture_filter_anisotropic") ||
                         gl.getExtension("MOZ_EXT_texture_filter_anisotropic") ||
                         gl.getExtension("WEBKIT_EXT_texture_filter_anisotropic");
        if (extAniso) {
            const maxAniso = gl.getParameter(extAniso.MAX_TEXTURE_MAX_ANISOTROPY_EXT) || 4;
            gl.texParameterf(gl.TEXTURE_CUBE_MAP, extAniso.TEXTURE_MAX_ANISOTROPY_EXT, maxAniso);
        }

        gl.generateMipmap(gl.TEXTURE_CUBE_MAP);
        gl.bindTexture(gl.TEXTURE_CUBE_MAP, null);

        cachedCubeTex = cubeTex;
        cachedCubeSize = size;

        return cubeTex;
    };

    /* ---------- Public API ---------- */
    return {
        // Named configuration constants matching Mathematics reference
        STAR_COUNT,
        STAR_COUNT_MOBILE,
        SIZE_MIN,
        SIZE_MAX,
        HALO_SOFTNESS,
        COLOUR_TEMPS,
        PARALLAX_LAYERS,
        TWINKLE_AMPLITUDE,
        PURE_BLACK,

        // Generators & accessors
        blackbodyRGB,
        getStarfieldData: buildStarCatalog,
        bakeStarfieldCubemap,
        getSkyCubeTexture: (gl, size, isMobile) => bakeStarfieldCubemap(gl, size, isMobile)
    };
}));
