/**
 * gpu-copula-shaders.js
 *
 * WebGL2 (GLSL ES 3.00) shaders for the Quantitative Finance scene:
 * "Same correlation, different crashes."
 *
 * Renders 100,000 glowing multivariate copula sample points morphing
 * across three distinct tail-dependence geometries inside the unit cube:
 *   - Gaussian copula: thin elliptical cigar, zero tail dependence (lambda_L = 0)
 *   - Student-t (nu = 3) copula: diffuse heavy-tailed cross, lambda_L = 0.454
 *   - Clayton (theta = 2) copula: asymmetric crash knot in lower corner, lambda_L = 0.707
 */

(function (root, factory) {
    if (typeof module === "object" && module.exports) module.exports = factory();
    else root.CopulaShaders = factory();
}(typeof self !== "undefined" ? self : this, function () {
    "use strict";

    /* 1. Additive Glowing Point Splats Shader */
    const VS_COPULA_POINTS = `#version 300 es
precision highp float;

layout(location = 0) in vec3 aPosA;
layout(location = 1) in vec3 aPosB;
layout(location = 2) in float aIndex;

uniform mat4  uViewProj;
uniform mat4  uView;
uniform float uMorph;        // Continuous morph factor [0, 1] between distribution A and B
uniform float uThresholdQ;   // Joint crash orthant threshold (e.g. 0.05)
uniform float uScale;        // Physical half-width of the unit cube in world space (e.g. 1.65)
uniform float uFocalDist;    // Camera focal plane distance for depth of field
uniform float uPointScale;   // Base point size scaled by viewport & device pixel ratio
uniform float uThemeLight;   // 1.0 if light theme, 0.0 if dark theme

out vec3  vWorldPos;
out float vCrash;            // 1.0 if inside joint crash orthant [0, q]^3
out float vCrashDist;        // Distance to crash origin (0, 0, 0) in unit cube space
out float vCoC;              // Circle of Confusion for depth-of-field splat expansion
out float vViewDist;
out float vEnergy;           // Morph transition excitation

void main() {
    // Hermite smooth interpolation between the space-filling aligned point clouds
    float s = smoothstep(0.0, 1.0, uMorph);
    vec3 u = mix(aPosA, aPosB, s);

    // Dynamic morph excitation: points glow brighter during transition
    float morphVel = sin(uMorph * 3.14159265);
    vEnergy = morphVel;

    // Check if point falls within lower joint crash orthant [0, q]^3
    bool inCrash = (u.x <= uThresholdQ && u.y <= uThresholdQ && u.z <= uThresholdQ);
    vCrash = inCrash ? 1.0 : 0.0;
    vCrashDist = length(u);

    // Map [0, 1]^3 to centered world space [-uScale, uScale]^3
    // Corner (0, 0, 0) maps to (-uScale, -uScale, -uScale)
    vec3 worldPos = (u - 0.5) * (2.0 * uScale);

    vec4 viewP = uView * vec4(worldPos, 1.0);
    float dist = max(0.5, -viewP.z);
    float coc = clamp(abs(dist - uFocalDist) * 0.065, 0.0, 1.0);

    vWorldPos = worldPos;
    vViewDist = dist;
    vCoC = coc;

    // Scale point splat by distance, crash status, and DoF circle of confusion
    float crashBoost = inCrash ? 1.45 : 1.0;
    gl_PointSize = clamp((uPointScale * crashBoost / dist) * (1.0 + 0.95 * coc), 1.8, 32.0);
    gl_Position = uViewProj * vec4(worldPos, 1.0);
}`;

    const FS_COPULA_POINTS = `#version 300 es
precision highp float;

in vec3  vWorldPos;
in float vCrash;
in float vCrashDist;
in float vCoC;
in float vViewDist;
in float vEnergy;

uniform vec3  uAccent;        // Domain accent (Quant gold/amber [245, 185, 55])
uniform float uThresholdQ;
uniform float uMorphStage;    // 0: Gaussian, 1: Student-t, 2: Clayton
uniform float uThemeLight;

out vec4 fragColor;

void main() {
    // Radial Gaussian splat falloff
    vec2 coord = gl_PointCoord - 0.5;
    float r2 = dot(coord, coord);
    if (r2 > 0.25) discard;
    float glow = exp(-r2 * 14.0);

    // Base colour palette: domain accent modulated by coordinate position
    vec3 colNormal = mix(uAccent, vec3(0.38, 0.88, 0.96), clamp(vCrashDist * 0.75, 0.0, 1.0));
    colNormal = mix(colNormal, vec3(1.0, 0.94, 0.82), 0.25);

    // Hot crash colour palette: points in crash corner [0, q]^3 ignite into radiant fiery ember
    vec3 colCrash = mix(vec3(1.0, 0.24, 0.06), vec3(1.0, 0.88, 0.32), exp(-vCrashDist * 16.0));

    // Combine based on crash status
    vec3 col = mix(colNormal, colCrash, vCrash);

    // Radiance calculation: points in crash corner receive massive intensity boost
    float emissive = 0.85 + 2.8 * vCrash + 1.2 * vEnergy;
    col *= emissive;

    // Soft distance fog
    float fog = 1.0 - exp(-max(0.0, vViewDist - 5.5) * 0.08);
    col = mix(col, vec3(0.0), clamp(fog, 0.0, 0.85));

    float alpha = glow * (vCrash > 0.5 ? 0.95 : 0.65);
    fragColor = vec4(col * alpha, alpha);
}`;

    /* 2. Wireframe Bounding Cube & Crash Orthant Sub-Cube */
    const VS_CAGE = `#version 300 es
precision highp float;

layout(location = 0) in vec3 aPos;
layout(location = 1) in vec4 aCol;

uniform mat4  uViewProj;
uniform mat4  uView;
uniform float uFocalDist;

out vec4  vCol;
out float vViewDist;
out float vCoC;

void main() {
    vec4 vp = uView * vec4(aPos, 1.0);
    float dist = max(0.5, -vp.z);
    float coc = clamp(abs(dist - uFocalDist) * 0.06, 0.0, 1.0);

    vCol = aCol;
    vViewDist = dist;
    vCoC = coc;
    gl_Position = uViewProj * vec4(aPos, 1.0);
}`;

    const FS_CAGE = `#version 300 es
precision highp float;

in vec4  vCol;
in float vViewDist;
in float vCoC;

out vec4 fragColor;

void main() {
    float fog = 1.0 - exp(-max(0.0, vViewDist - 5.5) * 0.08);
    vec3 col = mix(vCol.rgb, vec3(0.0), clamp(fog, 0.0, 0.85));
    fragColor = vec4(col * vCol.a, vCol.a);
}`;

    /* 3. Stage Floor Reflection & Shadow Plane */
    const VS_FLOOR = `#version 300 es
precision highp float;

layout(location = 0) in vec2 aQuad;

uniform mat4  uViewProj;
uniform vec3  uCenter;
uniform float uRadius;

out vec2 vLocal;

void main() {
    vLocal = aQuad;
    vec3 wp = uCenter + vec3(aQuad.x, 0.0, aQuad.y) * uRadius;
    gl_Position = uViewProj * vec4(wp, 1.0);
}`;

    const FS_FLOOR = `#version 300 es
precision highp float;

in vec2 vLocal;

uniform vec3  uAccent;
uniform float uCrashIntensity;

out vec4 fragColor;

void main() {
    float r = length(vLocal);
    if (r > 1.0) discard;

    // Floor sheen with concentric radar rings and radial falloff
    float falloff = smoothstep(1.0, 0.15, r);
    float ring1 = exp(-abs(r - 0.55) * 35.0) * 0.18;
    float ring2 = exp(-abs(r - 0.82) * 45.0) * 0.12;
    float centerGlow = exp(-r * 2.8) * 0.22;

    vec3 col = uAccent * (centerGlow + ring1 + ring2 + 0.025 * falloff);
    // Add warm crash reflection bias
    col += vec3(1.0, 0.3, 0.05) * (uCrashIntensity * exp(-r * 3.5) * 0.35);

    float alpha = clamp((centerGlow + ring1 + ring2 + 0.06) * falloff, 0.0, 0.65);
    fragColor = vec4(col * alpha, alpha);
}`;

    return {
        VS_COPULA_POINTS,
        FS_COPULA_POINTS,
        VS_CAGE,
        FS_CAGE,
        VS_FLOOR,
        FS_FLOOR
    };
}));
