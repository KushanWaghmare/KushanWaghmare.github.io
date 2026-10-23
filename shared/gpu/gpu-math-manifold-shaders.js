/**
 * gpu-math-manifold-shaders.js
 *
 * WebGL2 (GLSL ES 3.00) shader sources for The Gauss–Bonnet Riemannian Manifold
 * (Mathematics Hero).
 *
 * Renders a 4D topological immersion of the non-orientable Klein manifold
 * projected into visual R^3 under continuous 4D rotation angle alpha.
 *
 * Features:
 *   - Analytic metric tensor & Gauss's Theorema Egregium Gaussian curvature K(u,v)
 *   - Luminous chromatic curvature mapping:
 *       * Elliptic regime (K > 0): glowing crimson rose
 *       * Hyperbolic regime (K < 0): deep celestial sapphire & electric cyan
 *       * Parabolic inflection boundary (K = 0): luminous golden thread
 *   - Dual-sided non-orientable Fresnel rim lighting & chromatic dispersion
 *   - Riemannian metric shock wavefront ripple from click impulses
 *   - Luminous Christoffel geodesic flow particle swarm
 *   - Pitch-black background: vec3(0.0)
 */

(function (root, factory) {
    if (typeof module === "object" && module.exports) {
        module.exports = factory();
    } else {
        root.MathManifoldShaders = factory();
    }
}(typeof self !== "undefined" ? self : this, function () {
    "use strict";

    /* =====================================================================
     * 1. Manifold Surface Shaders
     * ===================================================================== */
    const VS_MANIFOLD = `#version 300 es
layout(location = 0) in vec2 aUV; // u in [0, 2pi), v in [0, 2pi)

uniform mat4 uViewProj;
uniform mat4 uModel;
uniform float uTime;
uniform float uAlpha;          // 4D rotation angle alpha
uniform float uShockTime;      // Time elapsed since click pulse (< 0 if none)
uniform vec2  uShockCenter;    // (u, v) origin of click pulse
uniform float uR;              // Major radius (default 2.2)
uniform float ur;              // Minor radius (default 0.90)

out vec3 vWorldPos;
out vec3 vNormal;
out vec2 vUV;
out float vCurvature;
out float vShockWave;

const float PI = 3.141592653589793;
const float TWO_PI = 6.283185307179586;

void main() {
    float u = aUV.x;
    float v = aUV.y;
    vUV = aUV;

    float cosU = cos(u);
    float sinU = sin(u);
    float cosV = cos(v);
    float sinV = sin(v);
    float sin2V = sin(2.0 * v);
    float cos2V = cos(2.0 * v);

    float halfU_plus_alpha = 0.5 * u + uAlpha;
    float cosHalfAngle = cos(halfU_plus_alpha);
    float sinHalfAngle = sin(halfU_plus_alpha);

    float R_plus_rCosV = uR + ur * cosV;

    // 1. Unperturbed 3D projection of 4D immersion
    vec3 pos0 = vec3(
        R_plus_rCosV * cosU,
        R_plus_rCosV * sinU,
        ur * sinV * cosHalfAngle
    );

    // 2. Analytic 3D normal vector
    float nx = ur * R_plus_rCosV * cosU * cosV * cosHalfAngle - 0.5 * ur * ur * sinV * sinV * sinU * sinHalfAngle;
    float ny = 0.5 * ur * ur * sinV * sinV * cosU * sinHalfAngle + ur * R_plus_rCosV * sinU * cosV * cosHalfAngle;
    float nz = ur * R_plus_rCosV * sinV;

    vec3 n = vec3(nx, ny, nz);
    float lenN = length(n);
    vec3 geomNormal = lenN > 1e-6 ? normalize(n) : vec3(0.0, 0.0, 1.0);

    // 3. Exact Gaussian curvature K via Theorema Egregium
    float E = R_plus_rCosV * R_plus_rCosV + 0.25 * ur * ur * sinV * sinV;
    float Ev = -2.0 * ur * uR * sinV - 0.75 * ur * ur * sin2V;
    float Evv = -2.0 * ur * uR * cosV - 1.5 * ur * ur * cos2V;
    float K = -(2.0 * E * Evv - Ev * Ev) / (4.0 * ur * ur * E * E);
    vCurvature = K;

    // 4. Riemannian metric wave ripple (click impulse)
    float wave = 0.0;
    if (uShockTime >= 0.0 && uShockTime < 3.2) {
        // Geodesic distance approximation on flat parameter torus
        vec2 diff = abs(aUV - uShockCenter);
        if (diff.x > PI) diff.x = TWO_PI - diff.x;
        if (diff.y > PI) diff.y = TWO_PI - diff.y;
        float dist = length(diff * vec2(sqrt(E), ur)); // Scaled by metric coefficients
        float waveFront = uShockTime * 4.2;
        float dr = dist - waveFront;
        float envelope = exp(-uShockTime * 1.3) * exp(-dr * dr * 3.8);
        wave = envelope * sin(dr * 12.0 - uShockTime * 18.0) * 0.28;
    }
    vShockWave = wave;

    // Displace vertex along analytic normal
    vec3 finalPos = pos0 + geomNormal * wave;

    vec4 worldPos4 = uModel * vec4(finalPos, 1.0);
    vWorldPos = worldPos4.xyz;
    vNormal = normalize(mat3(uModel) * geomNormal);

    gl_Position = uViewProj * worldPos4;
}
`;

    const FS_MANIFOLD = `#version 300 es
precision highp float;

in vec3 vWorldPos;
in vec3 vNormal;
in vec2 vUV;
in float vCurvature;
in float vShockWave;

uniform vec3  uCamPos;
uniform float uTime;
uniform vec3  uAccent;         // Math accent rgb(230, 57, 70)
uniform float uShockTime;

out vec4 fragColor;

const float PI = 3.141592653589793;

void main() {
    vec3 N = normalize(vNormal);
    vec3 V = normalize(uCamPos - vWorldPos);

    // Single-sided non-orientable normal handling: double-sided lighting
    float ndotv = abs(dot(N, V));

    // 1. Theorema Egregium Curvature Colour Mapping
    // K in [-1.00, +0.33]:
    //   K > 0: Elliptic regime -> Crimson rose & magenta
    //   K < 0: Hyperbolic saddle -> Deep sapphire blue & electric cyan
    //   K ~ 0: Parabolic inflection boundary -> Luminous golden thread
    float K = vCurvature;

    vec3 colElliptic   = vec3(0.92, 0.18, 0.32); // Vivid crimson rose
    vec3 colHyperbolic = vec3(0.06, 0.38, 0.88); // Celestial sapphire
    vec3 colCyan       = vec3(0.00, 0.80, 0.94); // Electric cyan
    vec3 colGold       = vec3(1.00, 0.84, 0.18); // Golden inflection thread

    vec3 baseCol;
    if (K >= 0.0) {
        float t = clamp(K / 0.332, 0.0, 1.0);
        baseCol = mix(colGold, colElliptic, smoothstep(0.04, 0.85, t));
    } else {
        float t = clamp(-K / 1.003, 0.0, 1.0);
        vec3 hypMix = mix(colCyan, colHyperbolic, smoothstep(0.15, 0.95, t));
        baseCol = mix(colGold, hypMix, smoothstep(0.04, 0.80, t));
    }

    // Parabolic zero-curvature inflection line highlight
    float zeroKDist = abs(K);
    float zeroKLine = smoothstep(0.045, 0.005, zeroKDist);
    baseCol = mix(baseCol, colGold * 1.45, zeroKLine * 0.85);

    // 2. Metric coordinate wireframe (isoparametric u, v grid lines)
    vec2 gridUV = fract(vUV * vec2(16.0 / PI, 12.0 / PI));
    vec2 gridDist = abs(gridUV - 0.5);
    float gridLine = max(smoothstep(0.47, 0.495, gridDist.x), smoothstep(0.47, 0.495, gridDist.y));
    baseCol += vec3(0.12, 0.18, 0.28) * gridLine * 0.40;

    // 3. Cinematic Lighting (Key + Rim + Iridescence)
    vec3 L1 = normalize(vec3(0.8, 1.2, 1.0));
    vec3 L2 = normalize(vec3(-0.9, -0.6, -0.8));

    float diff1 = max(0.0, abs(dot(N, L1))) * 0.75 + 0.25;
    float diff2 = max(0.0, abs(dot(N, L2))) * 0.35;

    // Blinn-Phong specular with thin-film chromatic dispersion
    vec3 H1 = normalize(L1 + V);
    float spec1 = pow(max(0.0, abs(dot(N, H1))), 42.0);
    vec3 specCol = vec3(
        pow(max(0.0, abs(dot(N, H1))), 46.0),
        pow(max(0.0, abs(dot(N, H1))), 42.0),
        pow(max(0.0, abs(dot(N, H1))), 38.0)
    ) * 1.2;

    // Dual-sided Fresnel rim glow
    float fresnel = pow(1.0 - ndotv, 2.8);
    vec3 rimCol = mix(colCyan, uAccent, 0.5) * fresnel * 0.85;

    // 4. Geodesic pulse ripple wave illumination
    float waveGlow = abs(vShockWave) * 4.5;
    vec3 pulseCol = colGold * waveGlow * 1.6;

    // Combine illumination
    vec3 finalRGB = baseCol * (diff1 + diff2) + specCol * 0.65 + rimCol + pulseCol;

    fragColor = vec4(finalRGB, 1.0);
}
`;

    /* =====================================================================
     * 2. Geodesic Particle Swarm Shaders
     * ===================================================================== */
    const VS_GEODESIC_PARTICLES = `#version 300 es
layout(location = 0) in vec4 aParticleState; // (u, v, speed, age)

uniform mat4 uViewProj;
uniform mat4 uModel;
uniform float uAlpha;          // 4D rotation angle alpha
uniform float uR;              // Major radius (2.2)
uniform float ur;              // Minor radius (0.90)

out float vSpeed;
out float vAge;

void main() {
    float u = aParticleState.x;
    float v = aParticleState.y;
    vSpeed = aParticleState.z;
    vAge = aParticleState.w;

    float cosU = cos(u);
    float sinU = sin(u);
    float cosV = cos(v);
    float sinV = sin(v);

    float halfU_plus_alpha = 0.5 * u + uAlpha;
    float cosHalfAngle = cos(halfU_plus_alpha);
    float sinHalfAngle = sin(halfU_plus_alpha);

    float R_plus_rCosV = uR + ur * cosV;

    // 3D projection of 4D immersion
    vec3 pos = vec3(
        R_plus_rCosV * cosU,
        R_plus_rCosV * sinU,
        ur * sinV * cosHalfAngle
    );

    // Analytic normal displacement so particles hover slightly above the surface
    float nx = ur * R_plus_rCosV * cosU * cosV * cosHalfAngle - 0.5 * ur * ur * sinV * sinV * sinU * sinHalfAngle;
    float ny = 0.5 * ur * ur * sinV * sinV * cosU * sinHalfAngle + ur * R_plus_rCosV * sinU * cosV * cosHalfAngle;
    float nz = ur * R_plus_rCosV * sinV;
    vec3 geomNormal = length(vec3(nx, ny, nz)) > 1e-6 ? normalize(vec3(nx, ny, nz)) : vec3(0.0, 0.0, 1.0);

    pos += geomNormal * 0.035;

    vec4 worldPos4 = uModel * vec4(pos, 1.0);
    gl_Position = uViewProj * worldPos4;

    // Distance-attenuated point size
    float dist = length(gl_Position.xyz);
    gl_PointSize = clamp(110.0 / max(1.0, dist), 4.0, 18.0);
}
`;

    const FS_GEODESIC_PARTICLES = `#version 300 es
precision highp float;

in float vSpeed;
in float vAge;

uniform vec3 uAccent;

out vec4 fragColor;

void main() {
    vec2 coord = gl_PointCoord - 0.5;
    float distSq = dot(coord, coord);
    if (distSq > 0.25) discard;

    // Luminous Gaussian core with soft halo
    float core = exp(-distSq * 18.0);
    float halo = exp(-distSq * 5.0) * 0.45;
    float intensity = core + halo;

    // Colour shifts with geodesic speed: gold -> cyan -> crimson
    vec3 colGold = vec3(1.0, 0.88, 0.30);
    vec3 colCyan = vec3(0.15, 0.85, 0.98);
    vec3 colRose = vec3(0.95, 0.25, 0.45);

    vec3 col = mix(colGold, colCyan, smoothstep(0.8, 1.8, vSpeed));
    col = mix(col, colRose, smoothstep(1.8, 3.2, vSpeed));

    // Particle alpha fades gracefully near lifecycle end
    float alpha = intensity * smoothstep(1.0, 0.85, vAge) * smoothstep(0.0, 0.1, vAge);

    fragColor = vec4(col * intensity * 1.5, alpha);
}
`;

    return {
        VS_MANIFOLD,
        FS_MANIFOLD,
        VS_GEODESIC_PARTICLES,
        FS_GEODESIC_PARTICLES
    };
}));
