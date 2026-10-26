/* WebGL2 Shaders for Unified Single-Buffer Particle Stage, Parallax Starfield & HDR Post Pipeline
   (shared/gpu/gpu-thread-shaders.js). */

(function (root, factory) {
    if (typeof module === "object" && module.exports) module.exports = factory(root);
    else root.THREAD_SHADERS = factory(root);
}(typeof self !== "undefined" ? self : this, function () {
    "use strict";

    /* 1. Single Shared THREE.Points Vertex Shader (with velocity-aligned capsule ribbon & seed twinkle) */
    const VS_SHARED_POINTS = `#version 300 es
precision highp float;

layout(location = 0) in vec3 aPosition;
layout(location = 1) in vec3 aColour;
layout(location = 2) in float aSize;
layout(location = 3) in vec4 aSeed;
layout(location = 4) in vec3 aPrevPosition;

uniform mat4 uViewProj;
uniform vec3 uCamPos;
uniform vec2 uViewport;
uniform float uDpr;
uniform float uTime;
uniform float uHeroBoost;
uniform float uIsLight;
uniform float uStreakScale;
uniform float uMaxStreakPx;
uniform float uTrailGain;
uniform vec3 uFogTint;

out vec3 vColour;
out float vAlpha;
out float vIsHero;
out vec2 vUvDir;
out float vHalfSeg;
out float vCapRad;

void main() {
    vec4 clipCurr = uViewProj * vec4(aPosition, 1.0);
    vec4 clipPrev = uViewProj * vec4(aPrevPosition, 1.0);

    float dist = max(1.1, length(aPosition - uCamPos));
    float perspectiveScale = (uViewport.y * 0.0108) / dist;

    bool isHero = (gl_VertexID == 0);
    float heroScale = isHero ? (1.0 + uHeroBoost * 3.0) : 1.0;
    float seedVar = 0.80 + 0.42 * aSeed.x;

    float baseSize = clamp(aSize * seedVar * perspectiveScale * uDpr * heroScale, 1.35 * uDpr, 40.0 * uDpr);

    // Velocity-aligned ribbon stretch from previous frame position
    float worldStep = length(aPosition - aPrevPosition);
    float streakLen = 0.0;
    vec2 dirNdc = vec2(1.0, 0.0);

    if (clipCurr.w > 0.15 && clipPrev.w > 0.15 && worldStep < 9.0 && uStreakScale > 0.001) {
        vec2 ndcCurr = clipCurr.xy / clipCurr.w;
        vec2 ndcPrev = clipPrev.xy / clipPrev.w;
        vec2 rawDeltaPx = (ndcCurr - ndcPrev) * 0.5 * uViewport * uDpr * uStreakScale;
        float rawLen = length(rawDeltaPx);
        if (rawLen > 0.35) {
            dirNdc = rawDeltaPx / rawLen;
            streakLen = min(rawLen, uMaxStreakPx * uDpr);
        }
    }

    float ptSize = baseSize + streakLen;
    vec2 halfVpPx = max(vec2(1.0), 0.5 * uViewport * uDpr);
    vec2 deltaNdc = (dirNdc * streakLen) / halfVpPx;

    gl_Position = vec4(clipCurr.xy - 0.5 * deltaNdc * clipCurr.w, clipCurr.z, clipCurr.w);
    gl_PointSize = ptSize;

    vUvDir = vec2(dirNdc.x, -dirNdc.y);
    vHalfSeg = 0.5 * streakLen / max(1.0, ptSize);
    vCapRad = 0.5 * baseSize / max(1.0, ptSize);

    // Atmospheric distance fog + seed-driven temporal twinkle
    float fogFactor = clamp((dist - 11.0) / 42.0, 0.0, 0.72);
    vec3 col = mix(aColour, uFogTint * 2.8, fogFactor * 0.55);

    if (isHero && uHeroBoost > 0.001) {
        vec3 heroGlow = mix(vec3(1.8, 1.65, 1.35), vec3(0.75, 1.35, 2.2), 0.38);
        col = mix(col, heroGlow, clamp(uHeroBoost * 0.9, 0.0, 1.0)) * (1.0 + uHeroBoost * 1.4);
    }

    float depthAlpha = clamp(19.0 / (dist + 6.5), 0.16, 1.0) * (1.0 - fogFactor * 0.45);
    float twinkle = 0.84 + 0.16 * sin(uTime * (1.6 + 2.5 * aSeed.z) + aSeed.w * 6.2831853);

    // Conserve energy when stretched into a long streak so thin fast streaks stay crisp, not blown out
    float energyNorm = clamp(baseSize / max(1.0, baseSize + streakLen * 0.35), 0.28, 1.0);
    vAlpha = depthAlpha * twinkle * energyNorm * uTrailGain * (isHero ? (1.0 + uHeroBoost * 0.8) : 1.0);
    vColour = col;
    vIsHero = isHero ? uHeroBoost : 0.0;
}
`;

    /* 2. Single Shared THREE.Points Fragment Shader (Gaussian core + Airy halo + tapered capsule) */
    const FS_SHARED_POINTS = `#version 300 es
precision highp float;

in vec3 vColour;
in float vAlpha;
in float vIsHero;
in vec2 vUvDir;
in float vHalfSeg;
in float vCapRad;

uniform float uIsLight;
out vec4 fragColor;

void main() {
    vec2 p = gl_PointCoord - 0.5;
    float proj = dot(p, vUvDir);
    float clampedProj = clamp(proj, -vHalfSeg, vHalfSeg);
    vec2 closest = vUvDir * clampedProj;
    float distAxis = length(p - closest);

    // Taper width & radiance from particle head (tailT = 0) to trailing tip (tailT = 1)
    float tailT = vHalfSeg > 0.001 ? clamp((vHalfSeg - clampedProj) / (2.0 * vHalfSeg), 0.0, 1.0) : 0.0;
    float localRad = max(0.002, vCapRad * mix(1.0, 0.36, tailT));
    float rNorm = distAxis / localRad;
    if (rNorm > 1.0) discard;

    float r2 = rNorm * rNorm;
    float core = exp(-r2 * 4.6);
    float halo = (1.0 - r2) * (1.0 - r2) * 0.40;
    float taperFade = mix(1.0, 0.16, tailT * tailT);
    float profile = (core * 0.85 + halo) * taperFade;

    if (vIsHero > 0.01) {
        profile += exp(-r2 * 1.7) * vIsHero * 0.95 * taperFade;
    }

    float alpha = clamp(profile * vAlpha, 0.0, 1.0);

    if (uIsLight > 0.5) {
        vec3 ink = clamp(vColour * 2.2, 0.04, 0.85);
        fragColor = vec4(ink, alpha * 0.82);
    } else {
        // Linear HDR radiance (values > 1.0 drive selective bloom)
        vec3 rad = vColour * (0.48 + 0.82 * core) * (profile * vAlpha);
        fragColor = vec4(rad, alpha);
    }
}
`;

    /* 3. Parallax Background Dust / Starfield Layer (separate static buffer, not part of main swarm) */
    const VS_STARFIELD = `#version 300 es
precision highp float;

layout(location = 0) in vec4 aStarPosSeed; // xyz in [-60, 60]^3, w = seed [0, 1]
layout(location = 1) in vec3 aStarCol;

uniform mat4 uViewProj;
uniform vec3 uCamPos;
uniform vec2 uViewport;
uniform float uDpr;
uniform float uTime;
uniform float uIsLight;

out vec3 vCol;
out float vAlpha;

void main() {
    // Seamless periodic 120-unit cube around camera with 0.30x parallax depth factor
    vec3 rel = mod(aStarPosSeed.xyz - uCamPos * 0.30 + 60.0, 120.0) - 60.0;
    float dist = length(rel);
    vec3 worldPos = uCamPos + rel;

    gl_Position = uViewProj * vec4(worldPos, 1.0);

    float edgeFade = smoothstep(59.0, 30.0, dist) * smoothstep(2.5, 8.0, dist);
    float twinkle = 0.60 + 0.40 * sin(uTime * (0.9 + 2.1 * aStarPosSeed.w) + aStarPosSeed.w * 31.4159);
    float sz = (1.05 + 1.95 * pow(aStarPosSeed.w, 2.6)) * uDpr * clamp(28.0 / (dist + 11.0), 0.50, 1.75);

    gl_PointSize = sz;
    vCol = aStarCol;
    vAlpha = edgeFade * twinkle * (uIsLight > 0.5 ? 0.14 : 0.68);
}
`;

    const FS_STARFIELD = `#version 300 es
precision highp float;

in vec3 vCol;
in float vAlpha;
uniform float uIsLight;
out vec4 fragColor;

void main() {
    vec2 uv = gl_PointCoord * 2.0 - 1.0;
    float r2 = dot(uv, uv);
    if (r2 > 1.0) discard;
    float g = exp(-r2 * 4.8) * vAlpha;
    if (uIsLight > 0.5) {
        fragColor = vec4(vec3(0.18, 0.22, 0.32), g);
    } else {
        fragColor = vec4(vCol * g, g);
    }
}
`;

    /* 4. Same-Scene Auxiliary Line / Wireframe Shaders (faded by uAuxOpacity) */
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

    /* 5. Same-Scene Kerr Black Hole Ray-Traced Lensing & Photon Ring Shader */
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
uniform vec2 uBhScreenCentre;
uniform float uBhScale;
uniform float uSpin;
uniform float uTilt;
uniform float uTime;
uniform float uAuxOpacity;
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
    vec2 shifted = bp - vec2(0.19 * a * sin(uTilt), 0.0);
    float b = length(shifted);

    float asym = 1.0 - 0.14 * a * (shifted.x / max(0.001, b)) * sin(uTilt);
    float bCrit = 2.65 * asym;

    float sinPhi = -shifted.x / max(0.05, b);
    float g = clamp(1.0 / (1.18 * (1.0 - 0.42 * sinPhi * sin(uTilt))), 0.35, 2.25);

    float ringDist = abs(b - bCrit);
    float n1Ring = exp(-ringDist * ringDist / 0.016) * 1.55;
    float n2Ring = exp(-abs(b - bCrit * 0.965) * 44.0) * 0.90;

    float discHalo = exp(-pow(max(0.0, b - bCrit * 1.02) * 0.55, 1.6)) * smoothstep(bCrit * 0.88, bCrit * 1.04, b);
    float innerShadow = smoothstep(bCrit * 0.94, bCrit * 0.72, b);

    float Tobs = 9400.0 * pow(g, 0.65);
    vec3 ringCol = blackbody(Tobs) * pow(g, 2.2);

    vec3 radiance = ringCol * (n1Ring + n2Ring + discHalo * 0.42) * (1.0 - 0.94 * innerShadow);
    float shadowMask = innerShadow * 0.92;
    float totalAlpha = clamp((n1Ring + n2Ring + discHalo * 0.45 + shadowMask * 0.65) * uAuxOpacity, 0.0, 0.95);

    if (uIsLight > 0.5) {
        vec3 colLight = mix(vec3(0.06, 0.07, 0.11), radiance * 0.55, clamp(n1Ring + n2Ring, 0.0, 1.0));
        fragColor = vec4(colLight, totalAlpha * 0.75);
    } else {
        vec3 outRgb = radiance * uAuxOpacity * (1.0 - innerShadow * 0.95);
        fragColor = vec4(outRgb, totalAlpha);
    }
}
`;

    /* 6. HDR Post-Processing Shaders: Trail Decay, Additive Blit, Selective Bright-Pass,
          Separable 9-Tap Bloom Blur, and ACES Filmic Composite (Vignette + Grain + CA + Warp) */
    const VS_POST_QUAD = `#version 300 es
precision highp float;

layout(location = 0) in vec2 aQuad;
out vec2 vUV;

void main() {
    vUV = aQuad * 0.5 + 0.5;
    gl_Position = vec4(aQuad, 0.0, 1.0);
}
`;

    const FS_TRAIL_DECAY = `#version 300 es
precision highp float;

in vec2 vUV;
uniform sampler2D uPrevTex;
uniform float uDecay;
out vec4 fragColor;

void main() {
    vec4 prev = texture(uPrevTex, vUV) * uDecay;
    // Subtract tiny floor so trails decay cleanly to exact zero without 16F ghost residue
    vec3 rgb = max(vec3(0.0), prev.rgb - vec3(0.00045));
    float a = max(0.0, prev.a - 0.0008);
    fragColor = vec4(rgb, a);
}
`;

    const FS_BLIT_ADD = `#version 300 es
precision highp float;

in vec2 vUV;
uniform sampler2D uTex;
out vec4 fragColor;

void main() {
    fragColor = texture(uTex, vUV);
}
`;

    const FS_BRIGHT_PASS = `#version 300 es
precision highp float;

in vec2 vUV;
uniform sampler2D uSceneTex;
uniform float uThreshold;
out vec4 fragColor;

void main() {
    vec3 c = texture(uSceneTex, vUV).rgb;
    float lum = max(c.r, max(c.g, c.b));
    float knee = uThreshold * 0.35 + 1e-4;
    float soft = clamp(lum - uThreshold + knee, 0.0, 2.0 * knee);
    soft = (soft * soft) / (4.0 * knee);
    float contrib = max(soft, lum - uThreshold) / max(lum, 1e-4);
    fragColor = vec4(c * contrib, 1.0);
}
`;

    const FS_BLUR_9TAP = `#version 300 es
precision highp float;

in vec2 vUV;
uniform sampler2D uTex;
uniform vec2 uTexelStep;
out vec4 fragColor;

void main() {
    // Bilinear-optimised 9-tap Gaussian filter using 5 linear texture fetches
    vec3 sum = texture(uTex, vUV).rgb * 0.22702703;
    vec2 off1 = uTexelStep * 1.38461538;
    vec2 off2 = uTexelStep * 3.23076923;
    sum += texture(uTex, vUV + off1).rgb * 0.31621622;
    sum += texture(uTex, vUV - off1).rgb * 0.31621622;
    sum += texture(uTex, vUV + off2).rgb * 0.07027027;
    sum += texture(uTex, vUV - off2).rgb * 0.07027027;
    fragColor = vec4(sum, 1.0);
}
`;

    const FS_POST_COMPOSITE = `#version 300 es
precision highp float;

in vec2 vUV;
uniform sampler2D uSceneTex;
uniform sampler2D uBloomTex;
uniform vec2 uRes;
uniform float uTime;
uniform float uBloomStrength;
uniform float uVignette;
uniform float uGrain;
uniform float uCaStrength;
uniform float uWarpStrength;
uniform vec2 uWarpCentre;
uniform vec3 uFogTint;
uniform float uIsLight;
out vec4 fragColor;

vec3 acesFilm(vec3 x) {
    const float a = 2.51;
    const float b = 0.03;
    const float c = 2.43;
    const float d = 0.59;
    const float e = 0.14;
    return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
}

float hash12(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
}

void main() {
    if (uIsLight > 0.5) {
        vec4 s = texture(uSceneTex, vUV);
        float a = clamp(s.a, 0.0, 0.92);
        vec3 ink = clamp(s.rgb, 0.0, 0.88);
        fragColor = vec4(ink * a, a);
        return;
    }

    vec2 centred = vUV - uWarpCentre;
    float edgeR2 = dot(vUV - 0.5, vUV - 0.5);

    vec3 sceneRgb;
    vec3 bloomRgb;

    // Skip radial warp blur pass completely when uWarpStrength <= 0.001
    if (uWarpStrength > 0.001) {
        vec3 accS = vec3(0.0);
        vec3 accB = vec3(0.0);
        float wSum = 0.0;
        float ca = uCaStrength + uWarpStrength * 0.014;
        for (int i = 0; i < 8; i++) {
            float fi = float(i) / 7.0;
            float scale = 1.0 - fi * uWarpStrength * 0.22;
            float w = 1.0 - fi * 0.55;
            vec2 sampleUV = uWarpCentre + centred * scale;
            vec2 caOff = centred * (ca * (0.35 + fi));
            float r = texture(uSceneTex, clamp(sampleUV + caOff, 0.001, 0.999)).r;
            float g = texture(uSceneTex, clamp(sampleUV, 0.001, 0.999)).g;
            float b = texture(uSceneTex, clamp(sampleUV - caOff, 0.001, 0.999)).b;
            accS += vec3(r, g, b) * w;
            accB += texture(uBloomTex, clamp(sampleUV, 0.001, 0.999)).rgb * w;
            wSum += w;
        }
        sceneRgb = accS / wSum;
        bloomRgb = accB / wSum;
    } else if (uCaStrength > 0.0001 && edgeR2 > 0.06) {
        vec2 caVec = (vUV - 0.5) * (uCaStrength * edgeR2 * 2.2);
        sceneRgb.r = texture(uSceneTex, clamp(vUV + caVec, 0.001, 0.999)).r;
        sceneRgb.g = texture(uSceneTex, vUV).g;
        sceneRgb.b = texture(uSceneTex, clamp(vUV - caVec, 0.001, 0.999)).b;
        bloomRgb = texture(uBloomTex, vUV).rgb;
    } else {
        // Gentle 5-tap sub-pixel smoothing + direct sample
        vec2 px = 0.35 / max(vec2(1.0), uRes);
        sceneRgb = texture(uSceneTex, vUV).rgb * 0.60
                 + texture(uSceneTex, vUV + vec2(px.x, px.y)).rgb * 0.10
                 + texture(uSceneTex, vUV + vec2(-px.x, px.y)).rgb * 0.10
                 + texture(uSceneTex, vUV + vec2(px.x, -px.y)).rgb * 0.10
                 + texture(uSceneTex, vUV + vec2(-px.x, -px.y)).rgb * 0.10;
        bloomRgb = texture(uBloomTex, vUV).rgb;
    }

    // Deep-space base + subtle domain nebula horizon + HDR scene + selective bloom
    vec2 nebUV = vUV - vec2(0.72, 0.38);
    float nebGlow = exp(-dot(nebUV, nebUV) * 3.2);
    vec3 spaceBase = vec3(0.0022, 0.0030, 0.0068) + uFogTint * (0.14 * nebGlow + 0.025);

    vec3 hdr = spaceBase + sceneRgb + bloomRgb * uBloomStrength;

    // ACES Filmic Tone Mapping + sRGB gamma encoding
    vec3 mapped = acesFilm(hdr);
    vec3 srgb = pow(mapped, vec3(1.0 / 2.2));

    // Subtle radial vignette
    float vig = 1.0 - uVignette * smoothstep(0.18, 0.92, edgeR2 * 1.85);
    srgb *= vig;

    // Fine animated film grain (<= 3%)
    float grainNoise = hash12(gl_FragCoord.xy + fract(uTime * 17.31) * 413.0) - 0.5;
    srgb = clamp(srgb + grainNoise * uGrain, 0.0, 1.0);

    fragColor = vec4(srgb, 1.0);
}
`;

    return {
        VS_SHARED_POINTS,
        FS_SHARED_POINTS,
        VS_STARFIELD,
        FS_STARFIELD,
        VS_AUX_SCENE,
        FS_AUX_SCENE,
        VS_KERR_SCENE,
        FS_KERR_SCENE,
        VS_POST_QUAD,
        FS_TRAIL_DECAY,
        FS_BLIT_ADD,
        FS_BRIGHT_PASS,
        FS_BLUR_9TAP,
        FS_POST_COMPOSITE
    };
}));
