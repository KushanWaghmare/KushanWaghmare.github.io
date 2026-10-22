/**
 * gpu-qsim-shaders.js
 *
 * WebGL2 (GLSL ES 3.00) shaders for the Computer Science hero scene:
 * "Quantum search and period finding."
 */

(function (root, factory) {
    if (typeof module === "object" && module.exports) module.exports = factory();
    else root.QSimShaders = factory();
}(typeof self !== "undefined" ? self : this, function () {
    "use strict";

    // Smooth 2*pi-periodic cosine palette anchored to the domain accent at phase = 0
    const GLSL_PHASE_PALETTE = `
vec3 phasePalette(float phase, vec3 accent) {
    vec3 a = mix(vec3(0.52, 0.48, 0.68), accent, 0.45);
    vec3 b = vec3(0.45, 0.42, 0.46);
    vec3 d = vec3(0.00, 0.33, 0.67) * 6.2831853;
    vec3 cyc = clamp(a + b * cos(phase - d), 0.05, 1.0);
    float w0 = 0.5 + 0.5 * cos(phase);
    return mix(cyc, mix(vec3(1.0, 0.62, 0.18), accent, w0), 0.38);
}`;

    /* 1. Instanced Spikes Shader (Main 256 Ring & Inner 16 Work Register Ring) */
    const VS_SPIKES = `#version 300 es
precision highp float;
layout(location = 0) in vec3 aLocalPos;
layout(location = 1) in vec3 aLocalNorm;
layout(location = 2) in vec4 aInstA; // (angle, mag, phase, prob)
layout(location = 3) in vec4 aInstB; // (radius, width, highlight, isInnerRing)

uniform mat4  uViewProj;
uniform mat4  uView;
uniform float uHeightScale;
uniform float uMirror;
uniform float uFocalDist;

out vec3  vNormal;
out vec3  vWorldPos;
out float vMag;
out float vPhase;
out float vProb;
out float vHighlight;
out float vLocalY;
out float vViewDist;
out float vCoC;
out float vInner;

void main() {
    float ang = aInstA.x, mag = aInstA.y, phase = aInstA.z, prob = aInstA.w;
    float rad = aInstB.x, w = aInstB.y, hi = aInstB.z;
    float h = max(0.018, mag * uHeightScale);
    float c = cos(ang), s = sin(ang);
    vec3 radial = vec3(c, 0.0, s), tangent = vec3(-s, 0.0, c);
    float taper = mix(1.0, 0.58, aLocalPos.y);
    vec3 localScaled = radial * (aLocalPos.x * w * taper)
                     + tangent * (aLocalPos.z * w * taper)
                     + vec3(0.0, aLocalPos.y * h * uMirror, 0.0);
    vec3 worldPos = vec3(rad * c, 0.0, rad * s) + localScaled;
    vec4 viewP = uView * vec4(worldPos, 1.0);
    float dist = -viewP.z;
    float coc = clamp(abs(dist - uFocalDist) * 0.045, 0.0, 1.0);
    worldPos += (radial * aLocalPos.x + tangent * aLocalPos.z) * (coc * 0.012);

    vWorldPos = worldPos;
    vNormal = normalize(radial * aLocalNorm.x + tangent * aLocalNorm.z + vec3(0.0, aLocalNorm.y * uMirror, 0.0));
    vMag = mag; vPhase = phase; vProb = prob; vHighlight = hi;
    vLocalY = aLocalPos.y; vViewDist = dist; vCoC = coc; vInner = aInstB.w;
    gl_Position = uViewProj * vec4(worldPos, 1.0);
}`;

    const FS_SPIKES = `#version 300 es
precision highp float;
in vec3  vNormal;
in vec3  vWorldPos;
in float vMag;
in float vPhase;
in float vProb;
in float vHighlight;
in float vLocalY;
in float vViewDist;
in float vCoC;
in float vInner;

uniform vec3  uAccent;
uniform vec3  uCamPos;
uniform float uMirror;
uniform float uFlash;
out vec4 fragColor;
${GLSL_PHASE_PALETTE}

void main() {
    vec3 N = normalize(vNormal);
    vec3 V = normalize(uCamPos - vWorldPos);
    float rim = pow(1.0 - max(dot(N, V), 0.0), 2.0);
    vec3 baseCol = (vInner > 0.5) ? mix(uAccent, vec3(0.35, 0.92, 0.85), 0.45) : phasePalette(vPhase, uAccent);

    float tipGlow = smoothstep(0.55, 1.0, vLocalY);
    float emissive = 0.28 + 5.6 * vProb + 1.45 * vMag + tipGlow * (0.65 + 4.2 * vProb);
    emissive += vHighlight * (1.8 + 1.5 * tipGlow) + uFlash * 2.2;

    vec3 col = baseCol * (emissive + rim * 0.75);
    if (vHighlight > 0.5) col = mix(col, vec3(1.0, 0.96, 0.88) * (emissive * 1.15), 0.35);

    float alpha = 1.0;
    if (uMirror < 0.0) {
        float reflAtten = 0.34 * exp(-max(0.0, -vWorldPos.y) * 1.65);
        col *= reflAtten;
        alpha = reflAtten;
    }
    col *= (1.0 - 0.28 * vCoC);
    float fog = 1.0 - exp(-max(0.0, vViewDist - 4.2) * 0.085);
    col = mix(col, vec3(0.0), clamp(fog, 0.0, 0.92));
    fragColor = vec4(col, alpha);
}`;

    /* 2. Glossy Floor, Mean-Amplitude Disc, Phase Wheel & Grover Plane Disc */
    const VS_DISC = `#version 300 es
precision highp float;
layout(location = 0) in vec2 aQuad;
uniform mat4  uViewProj;
uniform vec3  uCenter;
uniform vec3  uAxisU;
uniform vec3  uAxisV;
uniform float uRadius;
out vec2 vLocal;
void main() {
    vLocal = aQuad;
    vec3 wp = uCenter + (uAxisU * aQuad.x + uAxisV * aQuad.y) * uRadius;
    gl_Position = uViewProj * vec4(wp, 1.0);
}`;

    const FS_DISC = `#version 300 es
precision highp float;
in vec2 vLocal;
uniform int   uDiscMode; // 0: floor, 1: mean disc, 2: phase wheel, 3: Grover plane inset
uniform vec3  uAccent;
uniform float uMeanPhase;
uniform float uGroverAngle;
uniform float uAlpha;
out vec4 fragColor;
${GLSL_PHASE_PALETTE}

void main() {
    float r = length(vLocal);
    if (r > 1.0) discard;
    float ang = atan(vLocal.y, vLocal.x);
    if (ang < 0.0) ang += 6.2831853;

    if (uDiscMode == 0) {
        float ringGlow = exp(-abs(r - 0.691) * 48.0) * 0.42;
        float innerGlow = exp(-abs(r - 0.229) * 55.0) * 0.22;
        float falloff = smoothstep(1.0, 0.15, r);
        vec3 col = uAccent * (ringGlow + innerGlow + 0.035 * falloff);
        fragColor = vec4(col, clamp((0.18 + ringGlow + innerGlow) * falloff, 0.0, 0.85));
        return;
    }
    if (uDiscMode == 1) {
        float edge = smoothstep(0.92, 1.0, r) * smoothstep(1.0, 0.97, r);
        float fill = 0.08 * smoothstep(1.0, 0.0, r);
        vec3 c = phasePalette(uMeanPhase, uAccent);
        fragColor = vec4(c * (fill + edge * 0.95), (fill + edge * 0.55) * uAlpha);
        return;
    }
    if (uDiscMode == 2) {
        if (r < 0.52) discard;
        float band = smoothstep(0.52, 0.62, r) * smoothstep(1.0, 0.90, r);
        fragColor = vec4(phasePalette(ang, uAccent) * (1.35 * band), band * 0.92);
        return;
    }
    float rim = smoothstep(0.93, 0.98, r) * smoothstep(1.0, 0.97, r);
    float axes = (exp(-abs(vLocal.x) * 45.0) + exp(-abs(vLocal.y) * 45.0)) * 0.22 * step(r, 0.94);
    vec2 dir = vec2(cos(uGroverAngle), sin(uGroverAngle));
    float proj = clamp(dot(vLocal, dir), 0.0, 0.92);
    float ray = exp(-length(vLocal - dir * proj) * 38.0) * 1.85;
    float tip = exp(-length(vLocal - dir * 0.88) * 18.0) * 2.4;
    vec3 col = uAccent * (0.07 + rim * 0.85 + axes) + vec3(1.0, 0.78, 0.32) * (ray + tip);
    fragColor = vec4(col, clamp((0.16 + rim * 0.7 + axes + ray + tip) * uAlpha, 0.0, 0.95));
}`;

    /* 3. Circuit Strip & Atmospheric Dust Particles Shader */
    const VS_LINES_POINTS = `#version 300 es
precision highp float;
layout(location = 0) in vec3 aPos;
layout(location = 1) in vec4 aCol;
uniform mat4  uViewProj;
uniform mat4  uView;
uniform float uFocalDist;
uniform float uIsPoints;
out vec4 vCol;
void main() {
    vec4 vp = uView * vec4(aPos, 1.0);
    float dist = max(0.5, -vp.z);
    float coc = clamp(abs(dist - uFocalDist) * 0.06, 0.0, 1.0);
    vCol = vec4(aCol.rgb * (1.0 - 0.25 * coc), aCol.a);
    gl_Position = uViewProj * vec4(aPos, 1.0);
    if (uIsPoints > 0.5) gl_PointSize = clamp(aCol.a * (1.0 + 0.9 * coc) * (4.8 / dist), 1.5, 18.0);
}`;

    const FS_LINES_POINTS = `#version 300 es
precision highp float;
in vec4 vCol;
uniform float uIsPoints;
out vec4 fragColor;
void main() {
    if (uIsPoints > 0.5) {
        vec2 d = gl_PointCoord - 0.5;
        float r2 = dot(d, d);
        if (r2 > 0.25) discard;
        float glow = exp(-r2 * 14.0);
        fragColor = vec4(vCol.rgb * glow * 1.4, glow);
        return;
    }
    fragColor = vec4(vCol.rgb * vCol.a, vCol.a);
}`;

    return { VS_SPIKES, FS_SPIKES, VS_DISC, FS_DISC, VS_LINES_POINTS, FS_LINES_POINTS };
}));
