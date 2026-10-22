/**
 * gpu-cy-shaders.js
 *
 * GLSL ES 3.00 sources for the Calabi–Yau cross-section (Fermat curve in C^2).
 *   - VS_SHELL / FS_SHELL: the vertex shader computes the 3-D position and normal from alpha alone
 *     (P = (Re z1, Re z2, cos a Im z1 + sin a Im z2)); the fragment shader shades a two-sided iridescent shell
 *     and writes weighted-blended order-independent transparency into two additive attachments.
 *   - FS_RESOLVE: composites the OIT accumulation, and stores a circle of confusion in alpha.
 *   - FS_DOF: mild depth of field.   VS_DUST / FS_DUST: drifting dust motes.
 *
 * OIT uses only additive blending, so it needs no per-attachment blend state:
 *   attachment 0 = sum(w a c, w a)    attachment 1 = sum(-ln(1 - a), w a z)    transmittance = exp(-sum).
 */

(function (root, factory) {
    if (typeof module === "object" && module.exports) {
        module.exports = factory();
    } else {
        root.CYShaders = factory();
    }
}(typeof self !== "undefined" ? self : this, function () {
    "use strict";

    const VS_SHELL = `#version 300 es
layout(location = 0) in vec4 aZ;   // Re z1, Im z1, Re z2, Im z2
layout(location = 1) in vec4 aU;   // jointly normalised tangent (Re u1, Im u1, Re u2, Im u2)
layout(location = 2) in vec2 aAB;  // patch coordinates (a, b)
uniform mat4 uVP;
uniform vec3 uCam;
uniform float uCa, uSa;            // cos(alpha), sin(alpha): the only per-frame geometry input
out vec3 vWorld; out vec3 vN; out vec2 vAB; out vec4 vZ; out float vDist;
void main() {
    vec3 p = vec3(aZ.x, aZ.z, uCa * aZ.y + uSa * aZ.w);
    vec3 pa = vec3(aU.x, aU.z, uCa * aU.y + uSa * aU.w);
    vec3 pb = vec3(-aU.y, -aU.w, uCa * aU.x + uSa * aU.z);
    vec3 n = cross(pa, pb);
    vN = n / max(length(n), 1e-4);          // stays short where the projection degenerates; the fragment shader checks
    vWorld = p; vZ = aZ;
    vAB = vec2(aAB.x, abs(aAB.y));          // |b|: welded seam vertices carry the b of only one of their patches
    vDist = distance(p, uCam);
    gl_Position = uVP * vec4(p, 1.0);
}`;

    const FS_SHELL = `#version 300 es
precision highp float;
in vec3 vWorld; in vec3 vN; in vec2 vAB; in vec4 vZ; in float vDist;
layout(location = 0) out vec4 oAccum;
layout(location = 1) out vec4 oReveal;
uniform vec3 uCam, uAccent, uPal[8];
uniform float uN, uFade, uTime, uPulseR, uPulseAmp;
const float HALF_PI = 1.5707963, TAU = 6.2831853;
float hash21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
vec3 env(vec3 r) {                          // procedural dark studio: two soft boxes on a near-black dome
    vec3 c = mix(vec3(0.004, 0.005, 0.008), uAccent * 0.05, r.y * 0.5 + 0.5);
    c += uAccent * 0.9 * exp(-18.0 * (1.0 - dot(r, normalize(vec3(0.5, 0.8, 0.3)))));
    c += vec3(0.5, 0.6, 0.9) * 0.5 * exp(-14.0 * (1.0 - dot(r, normalize(vec3(-0.7, 0.2, -0.5)))));
    return c;
}
void main() {
    vec3 V = normalize(uCam - vWorld);
    float nl = length(vN);
    vec3 N = nl > 0.5 ? vN / nl : V;        // degenerate normal (isolated branch points): face the viewer
    bool back = dot(N, V) < 0.0;
    if (back) N = -N;                       // two-sided shading
    float ndv = clamp(dot(N, V), 0.0, 1.0), fres = pow(1.0 - ndv, 3.0);

    // patch colour from (k1 + k2) mod n, recovered from position: arg(z1 z2) lies within pi/n of 2 pi (k1 + k2) / n
    float m = floor(uN * atan(vZ.x * vZ.w + vZ.y * vZ.z, vZ.x * vZ.z - vZ.y * vZ.w) / TAU + 0.5);
    vec3 base = uPal[int(m - uN * floor(m / uN) + 0.5)];

    vec3 film = 0.5 + 0.5 * cos(TAU * (vec3(0.0, 0.33, 0.67) + ndv * 1.6 + 0.02 * uTime));   // thin-film interference
    vec3 L1 = normalize(vec3(0.5, 0.8, 0.3)), L2 = normalize(vec3(-0.7, 0.2, -0.5));
    float s1 = pow(max(dot(N, normalize(L1 + V)), 0.0), 64.0), s2 = pow(max(dot(N, normalize(L2 + V)), 0.0), 32.0);
    vec3 col = base * (0.10 + 0.32 * ndv) + env(reflect(-V, N)) * (0.25 + 0.9 * fres);
    col = mix(col, col * film * 1.9, 0.35 * fres) + mix(base, film, 0.5) * fres * 0.9;
    col += (mix(vec3(1.0), film, 0.4) * s1 * 0.8 + film * s2 * 0.5);
    if (back) col *= 0.8;

    // glowing iso-parametric lines (constant a, constant b) and brighter patch seams (a = 0, pi/2)
    vec2 g = vec2(vAB.x, vAB.y) / HALF_PI * 6.0;
    vec2 d = abs(fract(g - 0.5) - 0.5) / max(fwidth(g), vec2(1e-4));
    float line = 1.0 - smoothstep(0.0, 1.3, min(d.x, d.y));
    float seam = 1.0 - smoothstep(0.0, 2.2, min(vAB.x, HALF_PI - vAB.x) / max(fwidth(vAB.x), 1e-4));
    col += mix(base, vec3(1.0), 0.45) * (0.5 * line + 1.5 * seam);
    float alpha = mix(0.16 + 0.5 * fres, 0.85, clamp(0.7 * line + 0.9 * seam, 0.0, 1.0));

    // ring pulse: a shell of light sweeping outwards from the origin when n changes
    float ring = uPulseAmp * exp(-pow((length(vWorld) - uPulseR) * 2.2, 2.0));
    col += uAccent * ring * 3.0; alpha = max(alpha, ring * 0.8);

    // dissolve (per-pixel noise threshold keyed to position, so it is stable between frames)
    float h = hash21(floor(vZ.xz * 28.0) + floor(vZ.yw * 28.0) * 7.0);
    float dis = smoothstep(h * 0.75, h * 0.75 + 0.25, uFade * 1.05);
    col += uAccent * 2.5 * dis * (1.0 - dis) * 4.0;

    float fog = exp(-max(vDist - 7.0, 0.0) * 0.07);   // fog: far parts fade into the dark stage
    col *= mix(0.45, 1.0, fog);
    float a = clamp(alpha * dis * mix(0.55, 1.0, fog), 0.0, 0.99);
    if (a < 0.004) discard;
    float w = max(0.01, 1.0 / (0.1 + pow(vDist / 6.0, 4.0)));
    oAccum = vec4(col * a, a) * w;
    oReveal = vec4(-log(1.0 - a), a * w * vDist, 0.0, 0.0);
}`;

    const FS_RESOLVE = `#version 300 es
precision highp float;
in vec2 vUV; out vec4 fragColor;
uniform sampler2D uAccum, uReveal;
uniform float uFocus, uCocScale;
void main() {
    ivec2 p = ivec2(gl_FragCoord.xy);
    vec4 acc = texelFetch(uAccum, p, 0), rv = texelFetch(uReveal, p, 0);
    if (acc.a < 1e-5) { fragColor = vec4(0.0); return; }
    float cover = 1.0 - exp(-rv.r);
    float coc = clamp(abs(rv.g / acc.a - uFocus) * uCocScale, 0.0, 1.0);
    fragColor = vec4(acc.rgb / acc.a * cover, coc);
}`;

    const FS_DOF = `#version 300 es
precision highp float;
in vec2 vUV; out vec4 fragColor;
uniform sampler2D uScene;
uniform vec2 uTexel;
uniform float uMaxR;
void main() {
    vec4 c = texture(uScene, vUV);
    float r = c.a * uMaxR;
    if (r < 0.5) { fragColor = vec4(c.rgb, 1.0); return; }
    vec3 sum = c.rgb; float wsum = 1.0;
    for (int i = 1; i < 14; i++) {              // golden-angle spiral
        float fi = float(i), ang = fi * 2.3999632, rad = r * sqrt(fi / 14.0);
        vec4 s = texture(uScene, vUV + vec2(cos(ang), sin(ang)) * rad * uTexel);
        float w = 0.15 + s.a;                   // sharp pixels bleed less into blurred ones
        sum += s.rgb * w; wsum += w;
    }
    fragColor = vec4(sum / wsum, 1.0);
}`;

    const VS_DUST = `#version 300 es
uniform mat4 uVP;
uniform float uTime, uPx;
out float vTw;
float h11(float n) { return fract(sin(n * 91.345) * 47453.5453); }
void main() {
    float i = float(gl_VertexID), s = 0.2 + h11(i + 3.0);
    vec3 p = (vec3(h11(i), h11(i + 1.0), h11(i + 2.0)) - 0.5) * 14.0;
    p.y = mod(p.y + uTime * 0.18 * s + 7.0, 14.0) - 7.0;
    p.x += sin(uTime * 0.2 * s + i) * 0.3;
    vTw = 0.5 + 0.5 * sin(uTime * (0.6 + s) + i);
    gl_PointSize = (1.0 + 2.0 * h11(i + 5.0)) * uPx;
    gl_Position = uVP * vec4(p, 1.0);
}`;

    const FS_DUST = `#version 300 es
precision highp float;
in float vTw; out vec4 fragColor;
uniform vec3 uAccent;
void main() {
    float d = length(gl_PointCoord - 0.5) * 2.0;
    if (d > 1.0) discard;
    fragColor = vec4(mix(uAccent, vec3(1.0), 0.4) * (1.0 - d * d) * (0.04 + 0.16 * vTw), 0.0);
}`;

    return { VS_SHELL, FS_SHELL, FS_RESOLVE, FS_DOF, VS_DUST, FS_DUST };
}));
