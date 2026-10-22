/**
 * gpu-primes-waves-shaders.js
 *
 * WebGL2 (GLSL ES 3.00) shader sources for "Primes from waves"
 * (Explicit Chebyshev Formula for Non-Trivial Riemann Zeta Zeros).
 *
 * Implements:
 *   - Luminous 3D ribbons with camera-facing normal expansion, edge luminescence, and view-space depth fog
 *   - Critical line glowing rod (Re(s) = 1/2) with instanced zero beads at gamma_k
 *   - Chebyshev prime power ghost staircase with luminous glowing risers at prime powers p^k
 *   - Thin residual error ribbon psi_N(x) - psi_0(x) with fixed gain
 *   - Interactive cursor probe hairline and target markers
 *   - ACES filmic tone mapping & Dual-Kawase bloom compatibility
 */

(function (root, factory) {
    if (typeof module === "object" && module.exports) {
        module.exports = factory();
    } else {
        root.PrimesWavesShaders = factory();
    }
}(typeof self !== "undefined" ? self : this, function () {
    "use strict";

    /* =========================================================================
     * 1. 3D Ribbon Shader (Spine + Camera-Facing Normal Expansion)
     * ========================================================================= */
    const VS_RIBBON = `#version 300 es
layout(location = 0) in vec3 aPos;     // Spine position (x, y, z)
layout(location = 1) in vec3 aTangent; // Local tangent along spine
layout(location = 2) in float aSide;   // -1.0 (left) or +1.0 (right)

uniform mat4  uViewProj;
uniform mat4  uModel;
uniform mat4  uView;
uniform vec3  uCamPos;
uniform float uWidth;
uniform float uTime;

out vec2  vUV;
out float vSide;
out float vViewDist;
out vec3  vWorldPos;

void main() {
    vSide = aSide;
    vec4 worldP = uModel * vec4(aPos, 1.0);
    vec3 viewDir = normalize(uCamPos - worldP.xyz);

    // Compute ribbon binormal facing camera
    vec3 t = normalize(mat3(uModel) * aTangent);
    vec3 binormal = cross(viewDir, t);
    float bLen = length(binormal);
    if (bLen > 1e-4) {
        binormal = binormal / bLen;
    } else {
        binormal = vec3(0.0, 1.0, 0.0);
    }

    vec3 finalPos = worldP.xyz + binormal * (aSide * uWidth);
    vWorldPos = finalPos;

    // View-space distance for true depth-of-field fog
    vec4 viewP = uView * vec4(finalPos, 1.0);
    vViewDist = -viewP.z;
    vUV = vec2(aPos.x, aSide);

    gl_Position = uViewProj * vec4(finalPos, 1.0);
}
`;

    const FS_RIBBON = `#version 300 es
precision highp float;

in vec2  vUV;
in float vSide;
in float vViewDist;
in vec3  vWorldPos;

uniform vec3  uColor;
uniform float uAlpha;
uniform float uCoreBoost;
uniform float uFogNear;
uniform float uFogFar;
uniform float uCesaro;
uniform float uTime;

out vec4 fragColor;

void main() {
    float s = abs(vSide);

    // Sharp luminous core + soft halo falloff
    float core = exp(-s * s * 24.0) * uCoreBoost;
    float halo = exp(-s * 4.0);
    float shimmer = 1.0 + 0.06 * sin(vWorldPos.x * 2.5 + uTime * 4.0);

    vec3 baseColor = uColor * shimmer;

    // In Cesàro mode, give a serene, smoothed emerald/cyan tone
    if (uCesaro > 0.5) {
        baseColor = mix(baseColor, vec3(0.25, 0.95, 0.82), 0.25);
    }

    vec3 col = baseColor * (core * 3.0 + halo * 0.65);

    // Atmospheric depth fog based on view distance
    float fog = clamp((vViewDist - uFogNear) / max(0.001, uFogFar - uFogNear), 0.0, 1.0);
    col = mix(col, vec3(0.0), fog * 0.90);

    fragColor = vec4(col * uAlpha, 1.0);
}
`;

    /* =========================================================================
     * 2. Critical Line & Zero Beads Shader
     * ========================================================================= */
    const VS_CRITICAL_ROD = `#version 300 es
layout(location = 0) in vec3 aPos;
uniform mat4 uViewProj;
uniform mat4 uModel;

out vec3 vWorldPos;

void main() {
    vec4 wp = uModel * vec4(aPos, 1.0);
    vWorldPos = wp.xyz;
    gl_Position = uViewProj * wp;
}
`;

    const FS_CRITICAL_ROD = `#version 300 es
precision highp float;

in vec3 vWorldPos;
uniform vec3  uColor;
uniform float uAlpha;
uniform float uTime;

out vec4 fragColor;

void main() {
    float pulse = 0.85 + 0.15 * sin(vWorldPos.y * 1.5 - uTime * 2.5);
    vec3 col = uColor * pulse * 2.2;
    fragColor = vec4(col * uAlpha, 1.0);
}
`;

    const VS_BEADS = `#version 300 es
layout(location = 0) in vec3  aCenter;    // Bead 3D center (x, y, z)
layout(location = 1) in float aGamma;     // Zero height gamma_k
layout(location = 2) in float aActive;    // 1.0 if currently being added, 0.0 otherwise
layout(location = 3) in float aAlpha;     // Visibility

uniform mat4  uViewProj;
uniform mat4  uModel;
uniform float uPointSize;

out float vActive;
out float vAlpha;
out float vGamma;

void main() {
    vActive = aActive;
    vAlpha = aAlpha;
    vGamma = aGamma;

    vec4 wp = uModel * vec4(aCenter, 1.0);
    gl_Position = uViewProj * wp;

    float sizeMult = 1.0 + 2.5 * aActive;
    gl_PointSize = uPointSize * sizeMult;
}
`;

    const FS_BEADS = `#version 300 es
precision highp float;

in float vActive;
in float vAlpha;
in float vGamma;

uniform vec3  uAccent;
uniform float uTime;

out vec4 fragColor;

void main() {
    vec2 p = gl_PointCoord - vec2(0.5);
    float d = length(p);
    if (d > 0.5) discard;

    float core = exp(-d * d * 40.0);
    float halo = exp(-d * 6.5);

    // Active bead shines with incandescent diamond brilliance
    vec3 beadCol = mix(uAccent, vec3(1.0, 0.98, 0.92), vActive * 0.9);
    float pulse = vActive > 0.5 ? (1.6 + 0.8 * sin(uTime * 14.0)) : 1.0;

    vec3 col = beadCol * (core * 4.0 * pulse + halo * 1.4);
    fragColor = vec4(col * vAlpha, 1.0);
}
`;

    /* =========================================================================
     * 3. Chebyshev Prime Power Ghost Staircase Shader (Ribbon-based Quads)
     * ========================================================================= */
    const VS_STAIRCASE = `#version 300 es
layout(location = 0) in vec3  aPos;     // (x, y, z)
layout(location = 1) in vec3  aNormal;  // Ribbon offset vector
layout(location = 2) in float aIsRiser; // 1.0 for prime power vertical jumps, 0.0 for horizontal treads
layout(location = 3) in float aJump;    // Jump magnitude ln(p)

uniform mat4  uViewProj;
uniform mat4  uModel;
uniform float uTreadWidth;
uniform float uRiserWidth;

out float vIsRiser;
out float vJump;
out vec3  vWorldPos;

void main() {
    vIsRiser = aIsRiser;
    vJump = aJump;

    float width = aIsRiser > 0.5 ? uRiserWidth : uTreadWidth;
    vec3 offsetPos = aPos + aNormal * width;

    vec4 wp = uModel * vec4(offsetPos, 1.0);
    vWorldPos = wp.xyz;
    gl_Position = uViewProj * wp;
}
`;

    const FS_STAIRCASE = `#version 300 es
precision highp float;

in float vIsRiser;
in float vJump;
in vec3  vWorldPos;

uniform vec3  uAccent;
uniform float uAlpha;
uniform float uTime;

out vec4 fragColor;

void main() {
    if (vIsRiser > 0.5) {
        // Vertical risers at prime powers glow as luminous bars
        float pulse = 0.9 + 0.25 * sin(vWorldPos.y * 2.0 + uTime * 3.0);
        vec3 riserCol = mix(uAccent, vec3(1.0, 0.88, 0.5), 0.45) * (1.8 + vJump * 0.4) * pulse;
        fragColor = vec4(riserCol * uAlpha, 1.0);
    } else {
        // Horizontal treads are dim, elegant reference steps
        vec3 treadCol = vec3(0.35, 0.40, 0.50) * 0.55;
        fragColor = vec4(treadCol * uAlpha, 1.0);
    }
}
`;

    /* =========================================================================
     * 4. Residual Ribbon Shader: psi_N(x) - psi_0(x)
     * ========================================================================= */
    const VS_RESIDUAL = `#version 300 es
layout(location = 0) in vec3  aPos;     // (x, y_residual, z)
layout(location = 1) in float aSide;    // -1.0 or +1.0

uniform mat4  uViewProj;
uniform mat4  uModel;
uniform float uWidth;

out float vSide;

void main() {
    vSide = aSide;
    vec4 wp = uModel * vec4(aPos, 1.0);
    wp.y += aSide * uWidth;
    gl_Position = uViewProj * wp;
}
`;

    const FS_RESIDUAL = `#version 300 es
precision highp float;

in float vSide;
uniform vec3  uColor;
uniform float uAlpha;

out vec4 fragColor;

void main() {
    float s = abs(vSide);
    float glow = exp(-s * s * 16.0);
    vec3 col = uColor * glow * 1.8;
    fragColor = vec4(col * uAlpha, 1.0);
}
`;

    /* =========================================================================
     * 5. Interactive Hairline & Probe Markers
     * ========================================================================= */
    const VS_HAIRLINE = `#version 300 es
layout(location = 0) in vec3 aPos;
uniform mat4 uViewProj;
uniform mat4 uModel;

void main() {
    gl_Position = uViewProj * uModel * vec4(aPos, 1.0);
}
`;

    const FS_HAIRLINE = `#version 300 es
precision highp float;
uniform vec3  uColor;
uniform float uAlpha;
out vec4 fragColor;

void main() {
    fragColor = vec4(uColor * 1.6 * uAlpha, 1.0);
}
`;

    return {
        VS_RIBBON,
        FS_RIBBON,
        VS_CRITICAL_ROD,
        FS_CRITICAL_ROD,
        VS_BEADS,
        FS_BEADS,
        VS_STAIRCASE,
        FS_STAIRCASE,
        VS_RESIDUAL,
        FS_RESIDUAL,
        VS_HAIRLINE,
        FS_HAIRLINE
    };
}));
