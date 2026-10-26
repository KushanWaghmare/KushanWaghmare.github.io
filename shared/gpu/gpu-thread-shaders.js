/* WebGL2 Shaders for Unified Single-Buffer Particle Stage & Same-Scene Auxiliary Objects
   (shared/gpu/gpu-thread-shaders.js). */

(function (root, factory) {
    if (typeof module === "object" && module.exports) module.exports = factory(root);
    else root.THREAD_SHADERS = factory(root);
}(typeof self !== "undefined" ? self : this, function () {
    "use strict";

    /* 1. Single Shared THREE.Points Vertex Shader */
    const VS_SHARED_POINTS = `#version 300 es
precision highp float;

layout(location = 0) in vec3 aPosition;
layout(location = 1) in vec3 aColour;
layout(location = 2) in float aSize;
layout(location = 3) in vec4 aSeed;

uniform mat4 uViewProj;
uniform vec3 uCamPos;
uniform vec2 uViewport;
uniform float uDpr;
uniform float uHeroBoost;   // 0 in steady state, ramps 0 -> 1 during DETACH/FLIGHT
uniform float uIsLight;     // 0.0 dark theme, 1.0 light theme

out vec3 vColour;
out float vAlpha;
out float vIsHero;

void main() {
    vec4 clip = uViewProj * vec4(aPosition, 1.0);
    gl_Position = clip;

    float dist = max(1.2, length(aPosition - uCamPos));
    float perspectiveScale = (uViewport.y * 0.0115) / dist;

    bool isHero = (gl_VertexID == 0);
    float heroScale = isHero ? (1.0 + uHeroBoost * 2.8) : 1.0;

    float ptSize = clamp(aSize * perspectiveScale * uDpr * heroScale, 1.35 * uDpr, 38.0 * uDpr);
    gl_PointSize = ptSize;

    vec3 col = aColour;
    if (isHero && uHeroBoost > 0.001) {
        vec3 heroGlow = mix(vec3(1.0, 0.95, 0.82), vec3(0.45, 0.78, 1.0), 0.35);
        col = mix(col, heroGlow, clamp(uHeroBoost * 0.88, 0.0, 1.0)) * (1.0 + uHeroBoost * 0.95);
    }

    // Gentle distance fade for far-field depth clarity
    float depthAlpha = clamp(18.0 / (dist + 6.0), 0.18, 1.0);
    float seedTwinkle = 0.86 + 0.14 * aSeed.w;
    vAlpha = depthAlpha * seedTwinkle * (isHero ? (1.0 + uHeroBoost * 0.6) : 1.0);
    vColour = col;
    vIsHero = isHero ? uHeroBoost : 0.0;
}
`;

    /* 2. Single Shared THREE.Points Fragment Shader */
    const FS_SHARED_POINTS = `#version 300 es
precision highp float;

in vec3 vColour;
in float vAlpha;
in float vIsHero;

uniform float uIsLight;
out vec4 fragColor;

void main() {
    vec2 uv = gl_PointCoord * 2.0 - 1.0;
    float r2 = dot(uv, uv);
    if (r2 > 1.0) discard;

    // Smooth Gaussian core + Airy halo
    float core = exp(-r2 * 4.2);
    float halo = (1.0 - r2) * (1.0 - r2) * 0.48;
    float profile = core * 0.78 + halo;

    if (vIsHero > 0.01) {
        float heroCorona = exp(-r2 * 1.8) * vIsHero * 0.85;
        profile += heroCorona;
    }

    float alpha = clamp(profile * vAlpha, 0.0, 1.0);

    if (uIsLight > 0.5) {
        // High-contrast ink-toned particles for light mode
        vec3 ink = clamp(vColour * 0.72, 0.04, 0.88);
        fragColor = vec4(ink, alpha * 0.75);
    } else {
        // Pre-multiplied additive radiance for dark mode
        vec3 rad = vColour * (0.62 + 0.68 * core) * alpha;
        fragColor = vec4(rad, alpha);
    }
}
`;

    /* 3. Same-Scene Auxiliary Line / Wireframe / Translucent Shell Shaders (faded by uAuxOpacity) */
    const VS_AUX_SCENE = `#version 300 es
precision highp float;

layout(location = 0) in vec3 aPosition;
layout(location = 1) in vec4 aColour;

uniform mat4 uViewProj;
out vec4 vColour;

void main() {
    gl_Position = uViewProj * vec4(aPosition, 1.0);
    vColour = aColour;
}
`;

    const FS_AUX_SCENE = `#version 300 es
precision highp float;

in vec4 vColour;
uniform float uAuxOpacity;
uniform float uIsLight;
out vec4 fragColor;

void main() {
    float a = vColour.a * uAuxOpacity;
    if (a <= 0.001) discard;
    if (uIsLight > 0.5) {
        fragColor = vec4(vColour.rgb * 0.65, a * 0.7);
    } else {
        fragColor = vec4(vColour.rgb * a, a);
    }
}
`;

    /* 4. Same-Scene Kerr Black Hole Ray-Traced Lensing & Photon Ring Shader
       Renders inside the unified 3D scene around the Physics origin and fades in via
       uAuxOpacity only after the shared particles have matched the accretion disc. */
    const VS_KERR_SCENE = `#version 300 es
precision highp float;

layout(location = 0) in vec2 aQuad;
out vec2 vUV;

void main() {
    vUV = aQuad * 0.5 + 0.5;
    gl_Position = vec4(aQuad, 0.999, 1.0);
}
`;

    const FS_KERR_SCENE = `#version 300 es
precision highp float;

in vec2 vUV;
out vec4 fragColor;

uniform vec2 uRes;
uniform vec2 uBhScreenCentre; // Projected screen UV of Physics section origin
uniform float uBhScale;       // Apparent angular scale from active 3D camera distance
uniform float uSpin;          // Kerr spin a = 0.99
uniform float uTilt;          // Observer inclination θ_obs
uniform float uTime;
uniform float uAuxOpacity;    // Ramps 0 -> 1 only after particles settle into the disc
uniform float uIsLight;

vec3 blackbody(float T) {
    float t = clamp(T, 1000.0, 35000.0) * 0.01;
    float tA = max(t - 60.0, 1.0);
    float tB = max(t - 10.0, 1.0);
    vec3 c;
    c.r = t <= 66.0 ? 1.0 : clamp(329.6987 * pow(tA, -0.1332) / 255.0, 0.0, 1.0);
    c.g = t <= 66.0
        ? clamp((99.4708 * log(t) - 161.1196) / 255.0, 0.0, 1.0)
        : clamp(288.1222 * pow(tA, -0.0755) / 255.0, 0.0, 1.0);
    c.b = t >= 66.0 ? 1.0 : (t <= 19.0 ? 0.0 : clamp((138.5177 * log(tB) - 305.0448) / 255.0, 0.0, 1.0));
    return c;
}

void main() {
    if (uAuxOpacity <= 0.002) discard;

    vec2 aspectUV = (vUV - uBhScreenCentre) * vec2(uRes.x / max(1.0, uRes.y), 1.0);
    vec2 bp = aspectUV * uBhScale;

    float a = uSpin;
    // D-shaped Kerr frame-dragging shift of critical curve (Bardeen 1973)
    vec2 shifted = bp - vec2(0.19 * a * sin(uTilt), 0.0);
    float b = length(shifted);

    // Critical photon capture impact parameter b_crit ≈ 5.196 M (Schwarzschild) shifted by Kerr spin
    float asym = 1.0 - 0.14 * a * (shifted.x / max(0.001, b)) * sin(uTilt);
    float bCrit = 2.65 * asym;

    // Relativistic Doppler beaming factor across prograde rotation
    float sinPhi = shifted.x / max(0.05, b);
    float omega = 1.0 / (pow(max(1.45, b), 1.5) + a);
    float g = clamp(1.0 / (1.18 * (1.0 - 0.42 * sinPhi * sin(uTilt))), 0.35, 2.25);

    // Photon ring (n = 1, 2 demagnified lensed sub-rings at b = b_crit)
    float ringDist = abs(b - bCrit);
    float n1Ring = exp(-ringDist * ringDist / 0.018) * 1.45;
    float n2Ring = exp(-abs(b - bCrit * 0.965) * 42.0) * 0.85;

    // Lensed upper & lower Einstein-ring arches from back of accretion disc
    float cosTilt = cos(uTilt);
    float bEll = length(vec2(shifted.x, shifted.y / max(0.18, abs(cosTilt) + 0.14)));
    float discHalo = exp(-pow(max(0.0, b - bCrit * 1.02) * 0.55, 1.6)) * smoothstep(bCrit * 0.88, bCrit * 1.04, b);
    float innerShadow = smoothstep(bCrit * 0.94, bCrit * 0.72, b);

    float Tobs = 9200.0 * pow(g, 0.65);
    vec3 ringCol = blackbody(Tobs) * pow(g, 2.4);

    vec3 radiance = ringCol * (n1Ring + n2Ring + discHalo * 0.42) * (1.0 - 0.92 * innerShadow);
    float shadowMask = innerShadow * 0.92;
    float totalAlpha = clamp((n1Ring + n2Ring + discHalo * 0.45 + shadowMask * 0.65) * uAuxOpacity, 0.0, 0.95);

    if (uIsLight > 0.5) {
        vec3 colLight = mix(vec3(0.06, 0.07, 0.11), radiance * 0.55, clamp(n1Ring + n2Ring, 0.0, 1.0));
        fragColor = vec4(colLight, totalAlpha * 0.75);
    } else {
        // In dark mode, photon ring adds radiance while inner horizon carves out the shadow
        vec3 outRgb = radiance * uAuxOpacity * (1.0 - innerShadow * 0.95);
        fragColor = vec4(outRgb, totalAlpha);
    }
}
`;

    return {
        VS_SHARED_POINTS,
        FS_SHARED_POINTS,
        VS_AUX_SCENE,
        FS_AUX_SCENE,
        VS_KERR_SCENE,
        FS_KERR_SCENE
    };
}));
