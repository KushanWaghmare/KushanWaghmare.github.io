/**
 * shared/gpu/gpu-crystal-shaders.js
 *
 * WebGL2 (GLSL ES 3.00) shaders for the Quantitative Finance scene:
 * "The Option-Pricing Crystal."
 *
 * Implements:
 *   - Additive HDR crystal node point splats with cool-to-hot value ramp,
 *     backward induction wave front excitation, and depth-of-field circle of confusion
 *   - Structural wireframe edges (pyramid boundaries, active layer frame, connectors)
 *   - Luminous exercise hinge ribbon on top expiry face (S₁ = S₂)
 *   - Adjacent Value Lens heightfield (active layer V_t surface with wireframe grid)
 *   - Ambient floating volumetric dust particles
 */

(function (root, factory) {
    if (typeof module === "object" && module.exports) module.exports = factory();
    else root.CrystalShaders = factory();
}(typeof self !== "undefined" ? self : this, function () {
    "use strict";

    /* =====================================================================
       1. ADDITIVE CRYSTAL NODE SPLATS SHADER
       ===================================================================== */
    const VS_CRYSTAL_NODES = `#version 300 es
precision highp float;

layout(location = 0) in vec3  aPos;        // Physical world position (x, y, z)
layout(location = 1) in float aValue;      // Lattice option price V_t(k1, k2)
layout(location = 2) in float aLayerNorm;  // Normalized layer t / n in [0, 1]
layout(location = 3) in float aK1Norm;     // Normalized k1 in [0, 1]
layout(location = 4) in float aK2Norm;     // Normalized k2 in [0, 1]
layout(location = 5) in float aHingeDiff;  // (S1 - S2) / S0 signed distance to hinge

uniform mat4  uViewProj;
uniform mat4  uView;
uniform float uTime;
uniform vec3  uAccent;
uniform float uGrow;         // Visible layer threshold [0, 1] during Grow phase
uniform float uWaveY;        // Normalized sweep height of backward induction wave [0, 1]
uniform float uWaveActive;   // 1.0 when backward induction wave is sweeping, 0.0 otherwise
uniform float uRootFlash;    // Golden flash intensity [0, 1] at root node
uniform float uRefineFade;   // Crossfade opacity during n-doubling [0, 1]
uniform float uMaxVal;       // Normalization divisor for option values
uniform float uN;            // Current lattice step count (e.g. 8, 16, 32, 64)
uniform float uDPR;          // Device pixel ratio
uniform float uFocalDist;    // Camera focal plane distance for depth of field

out vec3  vColor;
out float vAlpha;
out float vWaveGlow;
out float vCoC;

void main() {
    // Hide nodes above current growth horizon during initial assembly
    if (aLayerNorm > uGrow + 0.015) {
        gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
        gl_PointSize = 0.0;
        vAlpha = 0.0;
        return;
    }

    vec4 viewPos = uView * vec4(aPos, 1.0);
    gl_Position = uViewProj * vec4(aPos, 1.0);

    // Depth of field: Circle of Confusion
    float viewDist = -viewPos.z;
    float coc = clamp(abs(viewDist - uFocalDist) * 0.12, 0.0, 1.6);
    vCoC = coc;

    // Normalised option value in [0, 1]
    float normVal = clamp(aValue / max(1.0, uMaxVal), 0.0, 1.0);

    // Cool-to-hot colour ramp based on domain accent
    // Deep slate/indigo -> vibrant accent cyan/blue -> warm amber/gold -> brilliant white
    vec3 colLow  = mix(vec3(0.04, 0.08, 0.18), uAccent * 0.38, 0.55);
    vec3 colMid  = uAccent * 0.95;
    vec3 colHigh = vec3(1.30, 0.95, 0.55);
    vec3 colTop  = vec3(1.50, 1.40, 1.25);

    vec3 baseCol;
    if (normVal < 0.35) {
        baseCol = mix(colLow, colMid, normVal / 0.35);
    } else if (normVal < 0.75) {
        baseCol = mix(colMid, colHigh, (normVal - 0.35) / 0.40);
    } else {
        baseCol = mix(colHigh, colTop, (normVal - 0.75) / 0.25);
    }

    // Proximity to backward induction wave front
    float waveDist = abs(aLayerNorm - uWaveY);
    float waveBand = smoothstep(0.065, 0.0, waveDist) * uWaveActive;
    vWaveGlow = waveBand;

    // Intense luminous excitation at wave crest
    vec3 waveCol = vec3(1.8, 1.6, 1.3) * (1.0 + 0.3 * sin(uTime * 8.0 + aPos.x * 6.0));
    baseCol = mix(baseCol, waveCol, waveBand * 0.85);

    // Root node flash effect
    if (aLayerNorm < 0.025) {
        vec3 flashCol = vec3(2.4, 2.0, 1.1);
        baseCol = mix(baseCol, flashCol, uRootFlash);
    }

    // Atmospheric depth fade
    float depthFade = clamp(1.0 - (viewDist - 2.5) * 0.15, 0.30, 1.0);

    // Node Point Sizing:
    // Scale base radius adaptively with step count to keep dense lattices crisp
    float baseRadius = mix(4.2, 1.8, clamp((uN - 8.0) / 56.0, 0.0, 1.0));
    if (aLayerNorm < 0.02) baseRadius = 8.0 + uRootFlash * 6.0; // Prominent root
    baseRadius += waveBand * 2.8; // Swell at wave crest
    baseRadius += coc * 1.6;      // Depth of field blur

    gl_PointSize = clamp(baseRadius * uDPR * (4.2 / max(1.0, viewDist)), 1.5, 32.0);

    // Calibrated density attenuation so high n does not blow out HDR bloom
    float densityScale = mix(0.90, 0.42, clamp((uN - 8.0) / 56.0, 0.0, 1.0));

    vColor = baseCol * depthFade * densityScale * (1.0 + waveBand * 1.8 + uRootFlash * 2.5);
    vAlpha = uRefineFade * clamp(0.55 + normVal * 0.45 + waveBand * 0.5, 0.0, 1.0);
}
`;

    const FS_CRYSTAL_NODES = `#version 300 es
precision highp float;

in vec3  vColor;
in float vAlpha;
in float vWaveGlow;
in float vCoC;

out vec4 fragColor;

void main() {
    // Soft Gaussian disc profile with dual-core bloom halo
    vec2 p = gl_PointCoord * 2.0 - 1.0;
    float r2 = dot(p, p);
    if (r2 > 1.0) discard;

    // Tight bright core with gentle luminous skirt
    float core = exp(-r2 * 5.0);
    float halo = exp(-r2 * 1.8) * 0.35;
    float profile = core + halo;

    // Expand halo during wave excitation or depth-of-field blur
    profile = mix(profile, exp(-r2 * 1.6), clamp(vWaveGlow + vCoC * 0.4, 0.0, 0.8));

    vec3 col = vColor * profile;
    float a = vAlpha * clamp(profile, 0.0, 1.0);

    fragColor = vec4(col, a);
}
`;

    /* =====================================================================
       2. STRUCTURAL WIREFRAME & CONNECTOR BEAMS SHADER
       ===================================================================== */
    const VS_CRYSTAL_LINES = `#version 300 es
precision highp float;

layout(location = 0) in vec3 aPos;
layout(location = 1) in vec4 aColor;

uniform mat4  uViewProj;
uniform float uAlpha;

out vec4 vColor;

void main() {
    gl_Position = uViewProj * vec4(aPos, 1.0);
    vColor = vec4(aColor.rgb, aColor.a * uAlpha);
}
`;

    const FS_CRYSTAL_LINES = `#version 300 es
precision highp float;

in vec4 vColor;
out vec4 fragColor;

void main() {
    fragColor = vColor;
}
`;

    /* =====================================================================
       3. LUMINOUS EXERCISE HINGE RIBBON SHADER (Top Face S₁ = S₂)
       ===================================================================== */
    const VS_HINGE_PLANE = `#version 300 es
precision highp float;

layout(location = 0) in vec3 aPos;
layout(location = 1) in vec2 aUV;

uniform mat4  uViewProj;
uniform float uTopY;
uniform float uIntensity;

out vec2 vUV;

void main() {
    vUV = aUV;
    vec3 p = aPos;
    p.y = uTopY;
    gl_Position = uViewProj * vec4(p, 1.0);
}
`;

    const FS_HINGE_PLANE = `#version 300 es
precision highp float;

in vec2 vUV;

uniform vec3  uAccent;
uniform float uTime;
uniform float uIntensity;

out vec4 fragColor;

void main() {
    // Slender glowing ribbon along the diagonal exercise boundary on top face
    float d = abs(vUV.x - 0.5) * 2.0;
    float beam = exp(-d * d * 8.0);

    // Subtle luminous pulse along the crease
    float pulse = 0.8 + 0.2 * sin(vUV.y * 12.0 - uTime * 4.0);
    vec3 col = mix(uAccent, vec3(1.4, 1.3, 1.1), beam * 0.7) * beam * pulse * uIntensity;
    float a = beam * pulse * uIntensity * 0.75;

    fragColor = vec4(col, a);
}
`;

    /* =====================================================================
       4. VALUE LENS HEIGHTFIELD SHADER (Beside the Crystal)
       ===================================================================== */
    const VS_VALUE_LENS = `#version 300 es
precision highp float;

layout(location = 0) in vec3  aPos;       // Base grid (u, v) on horizontal plane
layout(location = 1) in float aValue;     // Heightfield elevation = V_t(u, v)
layout(location = 2) in vec2  aGridUV;    // Texture grid coordinates in [0, 1]

uniform mat4  uViewProj;
uniform vec3  uLensOrigin; // World space offset beside crystal
uniform float uScale;      // Horizontal span of lens
uniform float uHeightScale;// Elevation scaling factor
uniform vec3  uAccent;
uniform float uTime;
uniform float uSharpness;  // 1.0 at expiry (sharp hinge), smoothly drops toward root
uniform float uAlpha;

out vec3  vWorldPos;
out vec2  vGridUV;
out float vElev;
out vec3  vColor;

void main() {
    vGridUV = aGridUV;
    vElev = aValue;

    // World position: offset horizontally, elevated vertically by option value
    vec3 p = uLensOrigin;
    p.x += aPos.x * uScale;
    p.z += aPos.z * uScale;
    p.y += aPos.y + aValue * uHeightScale;

    vWorldPos = p;
    gl_Position = uViewProj * vec4(p, 1.0);

    // Colour: cool blue at 0, warm amber/gold at high values
    float valNorm = clamp(aValue / 25.0, 0.0, 1.0);
    vec3 cCold = mix(vec3(0.04, 0.10, 0.22), uAccent * 0.40, 0.55);
    vec3 cHot  = vec3(1.35, 1.05, 0.65);
    vec3 col = mix(cCold, cHot, pow(valNorm, 0.75));

    // Edge highlighting along diagonal hinge crease (where GridUV.x == GridUV.y)
    float hingeCrease = 1.0 - smoothstep(0.0, 0.06, abs(aGridUV.x - aGridUV.y));
    col += vec3(1.3, 1.2, 1.0) * hingeCrease * uSharpness * 0.75;

    vColor = col;
}
`;

    const FS_VALUE_LENS = `#version 300 es
precision highp float;

in vec3  vWorldPos;
in vec2  vGridUV;
in float vElev;
in vec3  vColor;

uniform float uAlpha;
uniform vec3  uAccent;

out vec4 fragColor;

void main() {
    // Crisp procedural wireframe grid lines on the heightfield
    vec2 grid = abs(fract(vGridUV * 16.0 - 0.5) - 0.5) / fwidth(vGridUV * 16.0);
    float line = 1.0 - clamp(min(grid.x, grid.y), 0.0, 1.0);

    // Diagonal hinge crease glow
    float hingeDist = abs(vGridUV.x - vGridUV.y) * 16.0;
    float hingeGlow = exp(-hingeDist * hingeDist * 2.0);

    vec3 col = vColor * (0.35 + 0.65 * line) + vec3(1.2, 1.1, 0.9) * hingeGlow * 0.75;
    float alpha = uAlpha * (0.35 + 0.65 * line + hingeGlow * 0.4);

    fragColor = vec4(col, alpha);
}
`;

    /* =====================================================================
       5. AMBIENT VOLUMETRIC DUST SHADER
       ===================================================================== */
    const VS_DUST = `#version 300 es
precision highp float;

layout(location = 0) in vec3  aPos;
layout(location = 1) in float aPhase;
layout(location = 2) in float aSize;

uniform mat4  uViewProj;
uniform float uTime;
uniform vec3  uAccent;

out vec3  vColor;
out float vAlpha;

void main() {
    // Gentle drifting harmonic motion
    vec3 p = aPos;
    p.y += sin(uTime * 0.25 + aPhase) * 0.15;
    p.x += cos(uTime * 0.18 + aPhase * 2.0) * 0.12;
    p.z += sin(uTime * 0.22 + aPhase * 1.5) * 0.12;

    gl_Position = uViewProj * vec4(p, 1.0);

    // Subtle twinkling
    float twinkle = 0.5 + 0.5 * sin(uTime * 1.5 + aPhase * 6.28);
    gl_PointSize = clamp(aSize * (twinkle * 0.5 + 0.5), 1.0, 8.0);

    vColor = mix(vec3(0.6, 0.75, 0.9), uAccent * 1.2, twinkle * 0.4);
    vAlpha = 0.25 * twinkle;
}
`;

    const FS_DUST = `#version 300 es
precision highp float;

in vec3  vColor;
in float vAlpha;

out vec4 fragColor;

void main() {
    vec2 p = gl_PointCoord * 2.0 - 1.0;
    float r2 = dot(p, p);
    if (r2 > 1.0) discard;
    float profile = exp(-r2 * 2.5);
    fragColor = vec4(vColor * profile, vAlpha * profile);
}
`;

    return {
        VS_CRYSTAL_NODES,
        FS_CRYSTAL_NODES,
        VS_CRYSTAL_LINES,
        FS_CRYSTAL_LINES,
        VS_HINGE_PLANE,
        FS_HINGE_PLANE,
        VS_VALUE_LENS,
        FS_VALUE_LENS,
        VS_DUST,
        FS_DUST
    };
}));
