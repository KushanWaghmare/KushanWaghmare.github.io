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
uniform float uInside;     // insideness: 0 = outside the dimension, 1 = deep inside
uniform float uHeroScale;  // hero screen-size multiplier (shrinks as local world scale grows)
uniform float uWorldGrow;  // swarm size multiplier (structures look huge when passed)
uniform float uTwinkle;     // 1 = seed-driven twinkle, 0 = steady light
uniform float uPixelArt;    // 1 = pixel-art mode: hard squares on a global pixel grid, flat colours (formation.pixelArt)
uniform float uDofStrength; // subtle optical depth-of-field blur for distant particles

out vec3 vColour;
out float vAlpha;
out float vIsHero;
out vec2 vUvDir;
out float vHalfSeg;
out float vCapRad;
out float vDofBlur;

void main() {
    vec4 clipCurr = uViewProj * vec4(aPosition, 1.0);
    vec4 clipPrev = uViewProj * vec4(aPrevPosition, 1.0);

    float dist = max(1.1, length(aPosition - uCamPos));
    float perspectiveScale = (uViewport.y * 0.0108) / dist;

    bool isHero = (gl_VertexID == 0);
    float heroScale = isHero ? (1.0 + uHeroBoost * 3.2) * uHeroScale : uWorldGrow;
    float seedVar = 0.80 + 0.42 * aSeed.x;

    if (aSize <= 0.0001 || aPosition.z < -2500.0) {
        gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
        gl_PointSize = 0.0;
        vAlpha = 0.0;
        vDofBlur = 0.0;
        return;
    }

    float baseSize = clamp(aSize * seedVar * perspectiveScale * uDpr * heroScale, 1.35 * uDpr, 44.0 * uDpr);

    // Subtle optical depth of field: gently widen distant non-hero particles
    float dofBlur = 0.0;
    if (uDofStrength > 0.001 && uPixelArt < 0.5 && !isHero) {
        dofBlur = smoothstep(14.0, 42.0, dist) * clamp(uDofStrength, 0.0, 2.0);
        baseSize *= (1.0 + dofBlur * 0.45);
    }

    // Pixel-art mode: aSize is the cell size in CSS px; snap the particle to the global device-pixel grid
    if (uPixelArt > 0.5 && clipCurr.w > 0.0) {
        baseSize = max(1.0, floor(aSize * uDpr + 0.5));
        vec2 vpPx = max(vec2(1.0), uViewport * uDpr);
        vec2 ndcPx = clipCurr.xy / clipCurr.w;
        vec2 ppx = (ndcPx * 0.5 + 0.5) * vpPx;
        ppx = (floor(ppx / baseSize) + 0.5) * baseSize;
        clipCurr.xy = ((ppx / vpPx) * 2.0 - 1.0) * clipCurr.w;
    }

    // Velocity-aligned ribbon stretch with 3 parallax depth layers (near, mid, far)
    float layerFactor = isHero ? 1.85 : ((dist < 7.5) ? 1.35 : ((dist < 17.0) ? 1.0 : 0.68));
    float worldStep = length(aPosition - aPrevPosition);
    // Allow hero particle to streak up to 350 world units during hyperdrive punch
    float maxStep = isHero ? 350.0 : 95.0;
    float streakLen = 0.0;
    vec2 dirNdc = vec2(1.0, 0.0);

    if (clipCurr.w > 0.15 && clipPrev.w > 0.15 && worldStep < maxStep && uStreakScale > 0.001 && uPixelArt < 0.5) {
        vec2 ndcCurr = clipCurr.xy / clipCurr.w;
        vec2 ndcPrev = clipPrev.xy / clipPrev.w;
        vec2 rawDeltaPx = (ndcCurr - ndcPrev) * 0.5 * uViewport * uDpr * uStreakScale * layerFactor;
        float rawLen = length(rawDeltaPx);
        if (rawLen > 0.25) {
            dirNdc = rawDeltaPx / rawLen;
            float maxHeroPx = min(96.0 * uDpr, 240.0 - baseSize);
            streakLen = min(rawLen, isHero ? maxHeroPx : (uMaxStreakPx * uDpr));
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

    // Atmospheric distance fog + near-field luminance richness + seed-driven temporal twinkle
    float fogFactor = clamp((dist - 11.0 * (1.0 - 0.5 * uInside)) / (42.0 * (1.0 - 0.4 * uInside)), 0.0, 0.72);
    float nearLift = 1.0 + 0.16 * smoothstep(15.0, 3.5, dist);
    vec3 col = mix(aColour * nearLift, uFogTint * 2.5, fogFactor * 0.48);

    // Subtle relativistic Doppler colour shift (blue-shift approaching, red-shift receding), luminance-preserving
    if (worldStep > 0.0005 && worldStep < maxStep && uPixelArt < 0.5 && uIsLight < 0.5) {
        vec3 toCam = normalize(uCamPos - aPosition);
        float vRadial = dot(aPosition - aPrevPosition, toCam);
        float beta = clamp(vRadial * 3.2, -1.0, 1.0);
        vec3 shiftTint = beta >= 0.0
            ? mix(vec3(1.0), vec3(0.84, 0.96, 1.15), beta)
            : mix(vec3(1.0), vec3(1.14, 0.94, 0.80), -beta);
        float colLum = dot(col, vec3(0.2126, 0.7152, 0.0722));
        vec3 shifted = col * shiftTint;
        float shiftedLum = max(1e-5, dot(shifted, vec3(0.2126, 0.7152, 0.0722)));
        col = mix(col, shifted * (colLum / shiftedLum), 0.35);
    }

    if (isHero && uHeroBoost > 0.001) {
        vec3 heroGlow = mix(vec3(1.8, 1.65, 1.35), vec3(0.75, 1.35, 2.2), 0.38);
        col = mix(col, heroGlow, clamp(uHeroBoost * 0.9, 0.0, 1.0)) * (1.0 + uHeroBoost * 1.4);
    }

    float depthAlpha = clamp(19.0 / (dist + 6.5), 0.16, 1.0) * (1.0 - fogFactor * 0.45);
    float twWave = 0.70 * sin(uTime * (1.5 + 2.4 * aSeed.z) + aSeed.w * 6.2831853)
                 + 0.30 * sin(uTime * (3.3 + 4.1 * aSeed.y) + aSeed.x * 6.2831853);
    float twinkle = mix(1.0, 0.86 + 0.14 * twWave, uTwinkle);

    // Conserve energy when stretched into a long streak so thin fast streaks stay crisp, not blown out
    float energyNorm = clamp(baseSize / max(1.0, baseSize + streakLen * 0.35), 0.28, 1.0);
    vAlpha = depthAlpha * twinkle * energyNorm * uTrailGain * (isHero ? (1.0 + uHeroBoost * 0.8) : 1.0);
    vColour = col;
    vIsHero = isHero ? uHeroBoost : 0.0;
    vDofBlur = dofBlur;

    if (uPixelArt > 0.5) { vColour = aColour; vAlpha = 1.0; vIsHero = 0.0; vDofBlur = 0.0; }
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
in float vDofBlur;

uniform float uIsLight;
uniform float uPixelArt;
out vec4 fragColor;

void main() {
    if (uPixelArt > 0.5) { fragColor = vec4(vColour, 1.0); return; }   // pixel art: flat hard-edged square
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
    float coreExp = mix(6.8, 3.2, clamp(vDofBlur, 0.0, 1.0));
    float core = exp(-r2 * coreExp);
    float haloInv = 1.0 - r2;
    float halo = haloInv * haloInv * haloInv * 0.30;
    float taperFade = mix(1.0, 0.16, tailT * tailT);
    float profile = (core * 0.90 + halo) * taperFade;

    if (vIsHero > 0.01) {
        profile += exp(-r2 * 2.0) * vIsHero * 0.95 * taperFade;
    }

    float alpha = clamp(profile * vAlpha, 0.0, 1.0);

    if (uIsLight > 0.5) {
        vec3 ink = clamp(vColour * 2.2, 0.04, 0.85);
        fragColor = vec4(ink, alpha * 0.82);
    } else {
        // Linear HDR radiance (pin-sharp hot core + controlled halo for selective bloom)
        vec3 coreCol = mix(vColour, max(vColour, vec3(0.95)), core * 0.18);
        vec3 rad = coreCol * (0.42 + 1.08 * core) * (profile * vAlpha);
        fragColor = vec4(rad, alpha);
    }
}
`;

    /* 3. Cinematic Deep-Space Starfield, Milky Way & Volumetric Nebula Background Layer */
    const VS_STARFIELD = `#version 300 es
precision highp float;

layout(location = 0) in vec2 aQuad;
out vec2 vUV;

void main() {
    vUV = aQuad * 0.5 + 0.5;
    gl_Position = vec4(aQuad, 0.9999, 1.0);
}
`;

    const FS_STARFIELD = `#version 300 es
precision highp float;
precision highp int;

in vec2 vUV;
out vec4 fragColor;

uniform vec2 uRes;
uniform vec2 uBhScreenCentre;
uniform float uBhScale;
uniform float uTilt;
uniform float uTime;
uniform float uIsLight;
uniform float uBrightness;
uniform vec3 uBaseColour;
uniform vec3 uNebulaCol0;
uniform vec3 uNebulaCol1;
uniform vec3 uNebulaCol2;
uniform float uNebulaIntensity;
uniform float uBandIntensity;
uniform float uBandAngle;
uniform float uStarDensity;
uniform float uStarTwinkle;
uniform vec3 uStarTint;
uniform float uShootingStars;
uniform float uParallax;
uniform float uWarpVelocity;
uniform vec2 uPointerOffset;
uniform vec3 uCamDir;
uniform int uQualityTier;
uniform float uReducedMotion;

// Fast trig-free hashes (Dave Hoskins) for stable GPU-independent noise
float hash11(float p) {
    p = fract(p * 0.1031);
    p *= p + 33.33;
    p *= p + p;
    return fract(p);
}

float hash31(vec3 p) {
    p = fract(p * 0.1031);
    p += dot(p, p.zyx + 31.32);
    return fract((p.x + p.y) * p.z);
}

vec3 hash33(vec3 p) {
    p = fract(p * vec3(0.1031, 0.1030, 0.0973));
    p += dot(p, p.yxz + 33.33);
    return fract((p.xxy + p.yxx) * p.zyx);
}

// Interleaved Gradient Noise for triangular blue-noise dithering
float ign(vec2 p) {
    return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715))));
}

// Smooth 3D value noise
float noise3(vec3 x) {
    vec3 i = floor(x);
    vec3 f = fract(x);
    vec3 u = f * f * (3.0 - 2.0 * f);

    float n000 = hash31(i);
    float n100 = hash31(i + vec3(1.0, 0.0, 0.0));
    float n010 = hash31(i + vec3(0.0, 1.0, 0.0));
    float n110 = hash31(i + vec3(1.0, 1.0, 0.0));
    float n001 = hash31(i + vec3(0.0, 0.0, 1.0));
    float n101 = hash31(i + vec3(1.0, 0.0, 1.0));
    float n011 = hash31(i + vec3(0.0, 1.0, 1.0));
    float n111 = hash31(i + vec3(1.0, 1.0, 1.0));

    return mix(
        mix(mix(n000, n100, u.x), mix(n010, n110, u.x), u.y),
        mix(mix(n001, n101, u.x), mix(n011, n111, u.x), u.y),
        u.z
    );
}

float fbm2(vec3 p) {
    return 0.65 * noise3(p) + 0.35 * noise3(p * 2.07 + vec3(13.1, 7.7, 5.3));
}

float fbm3(vec3 p) {
    float v = 0.54 * noise3(p);
    p = p * 2.03 + vec3(11.3, 17.7, 23.1);
    v += 0.30 * noise3(p);
    p = p * 2.07 + vec3(5.9, 13.3, 3.7);
    return v + 0.16 * noise3(p);
}

// Analytical Tanner Helland blackbody spectrum fit with Planckian tonal grading
vec3 blackbody(float T) {
    float t = clamp(T, 1000.0, 40000.0) * 0.01;
    float tA = max(t - 60.0, 1.0);
    float tB = max(t - 10.0, 1.0);
    vec3 c;
    c.r = t <= 66.0 ? 1.0 : clamp(329.6987 * pow(tA, -0.1332) / 255.0, 0.0, 1.0);
    c.g = t <= 66.0
        ? clamp((99.4708 * log(max(t, 1.0)) - 161.1196) / 255.0, 0.0, 1.0)
        : clamp((288.1222 * pow(tA, -0.0755)) / 255.0, 0.0, 1.0);
    c.b = t >= 66.0 ? 1.0 : (t <= 19.0 ? 0.0 : clamp((138.5177 * log(tB) - 305.0448) / 255.0, 0.0, 1.0));

    if (T < 3500.0) {
        float warmRamp = clamp((T - 1000.0) / 2500.0, 0.0, 1.0);
        c = mix(vec3(0.55, 0.12, 0.02), c, warmRamp);
    }
    return c;
}

// Evaluate one 3D celestial star shell with optional warp streaking, scintillation, and spikes
vec3 evalStarShell(
    vec3 d,
    float freq,
    float prob,
    float baseRad,
    float minBright,
    float maxBright,
    float magPow,
    float twinkleAmt,
    float time,
    vec3 radial3D,
    float warpStretch,
    bool allowSpikes
) {
    vec3 pCell = d * freq;
    vec3 id = floor(pCell);
    vec3 fd = fract(pCell) - 0.5;
    vec3 h = hash33(id);

    if (h.x >= prob) return vec3(0.0);

    vec3 starOffset = (h.yzx - 0.5) * 0.68;
    vec3 delta = fd - starOffset;

    float dist2;
    float energyNorm = 1.0;
    if (warpStretch > 1.01) {
        float par = dot(delta, radial3D);
        vec3 perp = delta - radial3D * par;
        dist2 = dot(perp, perp) + (par / warpStretch) * (par / warpStretch);
        energyNorm = inversesqrt(warpStretch);
    } else {
        dist2 = dot(delta, delta);
    }

    float r2 = dist2 / (baseRad * baseRad);
    if (r2 > 22.0) return vec3(0.0);

    float core = exp(-r2 * 1.45);
    float mag = pow(clamp(h.x / max(prob, 1e-4), 0.0, 1.0), magPow);
    float bright = mix(minBright, maxBright, mag) * energyNorm;

    // Realistic blackbody temperature spread (2600 K M-dwarfs to 26000 K O/B-stars)
    float starT = mix(2600.0, 26000.0, pow(h.y, 2.2));
    vec3 col = blackbody(starT) * uStarTint;

    float tw = 1.0;
    if (twinkleAmt > 0.001) {
        float phase = h.x * 62.83185 + h.z * 31.4159;
        float wave = 0.72 * sin(time * (1.7 + 2.5 * h.z) + phase)
                   + 0.28 * sin(time * (3.9 + 3.1 * h.y) + phase * 1.7);
        tw = mix(1.0, 0.80 + 0.20 * wave, twinkleAmt);
    }

    float profile = core;
    if (allowSpikes) {
        // Soft HDR halo around near stars
        profile += exp(-r2 * 0.24) * 0.22;
        // Faint 4-point diffraction spikes on the brightest few
        if (mag > 0.72) {
            vec3 upRef = abs(d.y) < 0.9 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
            vec3 tx = normalize(cross(upRef, d));
            vec3 ty = cross(d, tx);
            float sx = dot(delta, tx) / baseRad;
            float sy = dot(delta, ty) / baseRad;
            float spike = exp(-abs(sx) * 3.8) * exp(-abs(sy) * 0.42)
                        + exp(-abs(sy) * 3.8) * exp(-abs(sx) * 0.42);
            profile += spike * smoothstep(0.72, 1.0, mag) * 0.38;
        }
    }

    return col * (profile * bright * tw);
}

// Tiny elliptical distant galaxy smudge on celestial sphere
vec3 distantGalaxy(vec3 d, vec3 centreDir, vec3 axisU, vec2 scaleUV, vec3 tint) {
    float facing = dot(d, centreDir);
    if (facing < 0.96) return vec3(0.0);
    vec3 axisV = normalize(cross(centreDir, axisU));
    vec3 uOrtho = cross(axisV, centreDir);
    vec2 local = vec2(dot(d, uOrtho), dot(d, axisV)) * scaleUV;
    float r = length(local);
    float bulge = exp(-r * r * 14.0);
    float disc = exp(-r * 3.2) * 0.38;
    return tint * (bulge + disc);
}

// Deterministic occasional shooting star (8-25 s interval)
vec3 shootingStar(vec2 uv, float aspectX, float time) {
    if (uShootingStars < 0.5 || uReducedMotion > 0.5) return vec3(0.0);

    float slot = floor(time / 16.0);
    float h0 = hash11(slot * 1.37 + 4.1);
    float h1 = hash11(slot * 2.91 + 9.7);
    float h2 = hash11(slot * 5.13 + 2.3);

    float tStart = slot * 16.0 + 1.5 + h0 * 11.5;
    float dur = 0.62 + 0.34 * h1;
    float age = time - tStart;
    if (age < 0.0 || age > dur) return vec3(0.0);

    float life = age / dur;
    float fade = sin(3.14159265 * life);

    vec2 p0 = vec2(0.15 + 0.70 * h1, 0.25 + 0.65 * h2);
    float ang = -0.35 - 0.85 * hash11(slot + 11.3);
    vec2 dir = vec2(cos(ang), sin(ang));
    vec2 head = p0 + dir * (life * 0.34);
    vec2 tail = head - dir * 0.11;

    vec2 p = vec2(uv.x * aspectX, uv.y);
    vec2 a = vec2(tail.x * aspectX, tail.y);
    vec2 b = vec2(head.x * aspectX, head.y);
    vec2 ab = b - a;
    float proj = clamp(dot(p - a, ab) / max(dot(ab, ab), 1e-6), 0.0, 1.0);
    float dist = length(p - (a + ab * proj));

    float core = exp(-dist * 1150.0) * pow(proj, 1.8);
    float glow = exp(-dist * 260.0) * pow(proj, 2.4) * 0.25;
    return vec3(1.55, 1.80, 2.25) * ((core + glow) * fade);
}

void main() {
    float aspectX = uRes.x / max(1.0, uRes.y);
    vec2 aspect = vec2(aspectX, 1.0);
    float motion = 1.0 - step(0.5, uReducedMotion);
    float t = uTime * motion;

    // 1. Pitch-black deep-space background (#000000)
    vec3 baseGrad = vec3(0.0);

    // Celestial ray d matching Kerr Black Hole ray-tracer projection
    vec2 pScreen = (vUV - uBhScreenCentre) * aspect * uBhScale;
    float thetaObs = clamp(uTilt, 0.001, 3.14159265 - 0.001);
    float sinObs = sin(thetaObs);
    float cosObs = cos(thetaObs);
    vec3 dBase = normalize(vec3(pScreen.x, pScreen.y * cosObs + 35.0 * sinObs, -pScreen.y * sinObs + 35.0 * cosObs));

    // Parallax offsets across depth planes
    vec3 camOff = uCamDir * (0.14 * uParallax);
    vec3 ptrOff = vec3(uPointerOffset.x * aspectX, uPointerOffset.y, 0.0) * (0.04 * uParallax * motion);
    vec3 dFar = normalize(dBase + camOff * 0.55 + ptrOff * 0.45);
    vec3 dMid = normalize(dBase + camOff * 1.00 + ptrOff * 1.00);
    vec3 dNear = normalize(dBase + camOff * 1.55 + ptrOff * 1.65);

    // Radial direction on the celestial tangent plane for warp streaks
    vec2 rad2D = normalize(vUV - uBhScreenCentre + vec2(1e-5));
    vec3 rightAxis = normalize(cross(dBase, vec3(0.0, 1.0, 0.0)));
    vec3 upAxis = cross(rightAxis, dBase);
    vec3 radial3D = normalize(rightAxis * rad2D.x + upAxis * rad2D.y);
    float warp = clamp(abs(uWarpVelocity), 0.0, 1.0) * motion;

    // 2. Milky Way band: tilted galactic plane, 3-octave FBM, warm core to cool outer dust, dark dust lanes
    vec3 mwCol = vec3(0.0);
    if (uBandIntensity > 0.001) {
        float ca = cos(uBandAngle), sa = sin(uBandAngle);
        vec3 galPole = normalize(vec3(-0.35 * ca - 0.59 * sa, 0.72, 0.59 * ca - 0.35 * sa));
        float b = dot(dFar, galPole);
        float bandEnv = exp(-b * b * 14.0);
        if (bandEnv > 0.004) {
            vec3 dBand = dFar * 3.8 + vec3(t * 0.0011, -t * 0.0007, t * 0.0009);
            float nBand = fbm3(dBand);
            float dust = fbm3(dBand * 2.1 + vec3(7.4, 2.1, 9.8));
            float dustLane = 1.0 - 0.72 * smoothstep(0.42, 0.76, dust) * exp(-b * b * 46.0);
            vec3 warmCore = vec3(0.18, 0.13, 0.09);
            vec3 coolOuter = vec3(0.035, 0.055, 0.125);
            vec3 bandTint = mix(coolOuter, warmCore, exp(-b * b * 34.0));
            mwCol = bandTint * (bandEnv * (0.45 + 0.85 * nBand) * dustLane * uBandIntensity * 0.24);
        }
    }

    // 3. Nebula clouds: domain-warped FBM, strongly desaturated at edges (Tiered)
    vec3 nebCol = vec3(0.0);
    if (uQualityTier >= 1 && uNebulaIntensity > 0.001) {
        vec3 q0 = dMid * 2.3 + vec3(t * 0.0022, -t * 0.0015, 0.0);
        vec3 warp0 = vec3(fbm2(q0), fbm2(q0 + vec3(5.2, 1.3, 2.8)), fbm2(q0 + vec3(1.7, 9.2, 4.1)));
        float d0 = smoothstep(0.44, 0.86, fbm3(q0 + 1.30 * warp0));
        float l0 = dot(uNebulaCol0, vec3(0.2126, 0.7152, 0.0722));
        vec3 c0 = mix(vec3(l0 * 0.45), uNebulaCol0, smoothstep(0.0, 0.65, d0));
        nebCol += c0 * (d0 * 0.26);

        if (uQualityTier >= 2) {
            vec3 q1 = dMid * 2.8 + vec3(-t * 0.0018, t * 0.0020, 4.2);
            vec3 warp1 = vec3(fbm2(q1 + vec3(3.1, 6.4, 1.2)), fbm2(q1 + vec3(8.3, 2.7, 5.5)), 0.0);
            float d1 = smoothstep(0.48, 0.88, fbm3(q1 + 1.25 * warp1));
            float l1 = dot(uNebulaCol1, vec3(0.2126, 0.7152, 0.0722));
            vec3 c1 = mix(vec3(l1 * 0.45), uNebulaCol1, smoothstep(0.0, 0.65, d1));
            nebCol += c1 * (d1 * 0.22);

            vec3 q2 = dNear * 1.9 + vec3(t * 0.0012, t * 0.0016, 9.1);
            float d2 = smoothstep(0.52, 0.90, fbm3(q2 + 0.95 * warp0));
            float l2 = dot(uNebulaCol2, vec3(0.2126, 0.7152, 0.0722));
            vec3 c2 = mix(vec3(l2 * 0.45), uNebulaCol2, smoothstep(0.0, 0.65, d2));
            nebCol += c2 * (d2 * 0.16);
        }
        nebCol *= uNebulaIntensity;
    }

    // 4. Multi-depth starfield (Far, Mid, Near)
    float dens = clamp(uStarDensity, 0.0, 2.0);
    float twAmt = clamp(uStarTwinkle, 0.0, 1.0) * motion;

    vec3 stars = vec3(0.0);
    // Far: thousands of tiny stars with blackbody spread & power-law magnitude
    stars += evalStarShell(dFar, 138.0, min(0.46 * dens, 0.85), 0.036, 0.06, 0.75, 4.2, 0.0, t, radial3D, 1.0 + warp * 3.5, false);
    // Mid: larger stars with gentle per-star scintillation
    stars += evalStarShell(dMid, 62.0, min(0.24 * dens, 0.70), 0.048, 0.14, 1.35, 3.6, twAmt, t, radial3D, 1.0 + warp * 5.5, false);
    // Near: sparse bright HDR stars (>1.0 for bloom) + soft glow + Tier 2 diffraction spikes
    stars += evalStarShell(dNear, 25.0, min(0.13 * dens, 0.45), 0.056, 0.45, 5.20, 3.2, twAmt * 0.55, t, radial3D, 1.0 + warp * 8.5, uQualityTier >= 2);

    // 5. Rare events: distant galaxy smudges, drifting cosmic dust, shooting star
    vec3 events = vec3(0.0);
    events += distantGalaxy(dFar, normalize(vec3(0.14, 0.91, 0.39)), vec3(1.0, 0.2, 0.4), vec2(52.0, 95.0), vec3(0.065, 0.058, 0.075));
    events += distantGalaxy(dFar, normalize(vec3(-0.19, 0.79, 0.58)), vec3(0.3, 1.0, -0.2), vec2(68.0, 120.0), vec3(0.045, 0.055, 0.080));

    if (uQualityTier >= 1) {
        float dustMot = smoothstep(0.76, 0.96, noise3(dNear * 18.0 + vec3(t * 0.028, -t * 0.019, t * 0.014)));
        events += vec3(0.025, 0.030, 0.042) * dustMot;
    }
    events += shootingStar(vUV, aspectX, t);

    // Keep Milky Way and nebula ultra-subtle on pitch-black sky; boost crisp pinpoint stars
    mwCol *= 0.18;
    nebCol *= 0.20;
    stars *= 2.1;

    vec3 celestial = mwCol + nebCol + stars + events;

    // 7. Light theme: keep subtle/clean so light editorial text stays readable
    if (uIsLight > 0.5) {
        float lum = dot(celestial, vec3(0.299, 0.587, 0.114));
        fragColor = vec4(vec3(0.08, 0.10, 0.16) * lum, clamp(lum * 0.22, 0.0, 0.07));
        return;
    }

    // Triangular blue-noise dithering to prevent dark-gradient banding
    float triDither = (ign(gl_FragCoord.xy) - ign(gl_FragCoord.xy + vec2(17.0, 31.0))) * (1.2 / 255.0);
    vec3 hdrOut = max(vec3(0.0), baseGrad + celestial * uBrightness + triDither);
    fragColor = vec4(hdrOut, 1.0);
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
precision highp int;

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
uniform int uDebugMode;

// Analytical Tanner Helland blackbody spectrum fit with Planckian tonal grading
vec3 blackbody(float T) {
    float t = clamp(T, 1000.0, 40000.0) * 0.01;
    float tA = max(t - 60.0, 1.0);
    float tB = max(t - 10.0, 1.0);
    vec3 c;
    c.r = t <= 66.0 ? 1.0 : clamp(329.6987 * pow(tA, -0.1332) / 255.0, 0.0, 1.0);
    c.g = t <= 66.0
        ? clamp((99.4708 * log(t) - 161.1196) / 255.0, 0.0, 1.0)
        : clamp(288.1222 * pow(tA, -0.0755) / 255.0, 0.0, 1.0);
    c.b = t >= 66.0 ? 1.0 : (t <= 19.0 ? 0.0 : clamp((138.5177 * log(tB) - 305.0448) / 255.0, 0.0, 1.0));

    if (T < 3500.0) {
        float warmRamp = clamp((T - 1000.0) / 2500.0, 0.0, 1.0);
        c = mix(vec3(0.55, 0.12, 0.02), c, warmRamp);
    }
    return c;
}

// 2D noise for sheared plasma turbulence
float hash2D(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
}

float noise2D(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    float a = hash2D(i);
    float b = hash2D(i + vec2(1.0, 0.0));
    float c = hash2D(i + vec2(0.0, 1.0));
    float d = hash2D(i + vec2(1.0, 1.0));
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

// Multi-octave continuous plasma turbulence with differential Keplerian shear & advected hot spots
// Band-limited across crossing orders n = 1, 2, 3+ to eliminate shimmering and moiré artefacts
float diskPlasmaTurbulence(float r, float phiCorot, int order, float r_isco) {
    if (order >= 3) {
        // High-order photon rings are sub-pixel: pure smooth flux prevents noise aliasing & moiré
        return 1.0;
    }

    // Streamline spiral shear angle: trailing spiral arms
    float shear = 2.6 * log(max(1.0, r / max(0.5, r_isco)));
    float psi = phiCorot + shear;
    
    // Anisotropic flow-aligned coordinates
    vec2 pFlow = vec2(psi * 2.8, r * 0.75);

    float n1 = noise2D(pFlow * 1.4);
    float n2 = noise2D(pFlow * 3.2 + vec2(1.7, 3.2));

    if (order == 2) {
        // Secondary lensed arch: radial coordinate is compressed ~20-50x; filter out high octaves
        float fbmSecondary = 0.65 * n1 + 0.35 * n2;
        return clamp(0.60 + 0.80 * fbmSecondary, 0.3, 1.8);
    }

    // Primary disc (n = 1): 4-octave sheared turbulence + fine spiral streaks + advected relativistic hot spots
    float n3 = noise2D(pFlow * 7.5 + vec2(4.1, 0.9));
    float n4 = noise2D(pFlow * 15.0 + vec2(2.3, 5.7));
    float fbm = 0.44 * n1 + 0.28 * n2 + 0.18 * n3 + 0.10 * n4;

    // Fine spiral filament streaks
    float streaks = 0.88 + 0.12 * cos(pFlow.x * 3.5 + 2.5 * fbm);

    // Relativistic advected hot spots co-rotating with local Keplerian flow
    float spot1 = exp(-pow(length(vec2(cos(phiCorot - 0.4), sin(phiCorot - 0.4)) * r - vec2(2.7, 0.0)), 2.0) * 1.9);
    float spot2 = exp(-pow(length(vec2(cos(phiCorot - 2.5), sin(phiCorot - 2.5)) * r - vec2(4.3, 0.0)), 2.0) * 1.3);
    float spot3 = exp(-pow(length(vec2(cos(phiCorot - 4.7), sin(phiCorot - 4.7)) * r - vec2(6.8, 0.0)), 2.0) * 0.8);
    float hotSpots = 1.0 + 1.35 * spot1 + 0.90 * spot2 + 0.65 * spot3;

    return clamp((0.40 + 1.20 * fbm) * streaks * hotSpots, 0.18, 3.4);
}

// Relativistic Novikov-Thorne thin accretion disc flux profile (Page & Thorne 1974)
// Vanishes at ISCO (zero-torque), peaks at r ~ 1.25-1.5 r_isco, approaches 1/r^3 Newtonian limit
float novikovThorneFlux(float r, float a, float r_isco) {
    if (r <= r_isco) return 0.0;
    float x = sqrt(r);
    float x0 = sqrt(r_isco);
    float C = 1.0 - x0 / x;
    float denom = max(0.04, 1.0 - 3.0 / r + 2.0 * a / (r * x));
    return max(0.0, C / (r * r * r * denom));
}

// Canonical equations of motion in Boyer–Lindquist coordinates (r, u = cos θ, pr, pu)
void stateDerivs(vec4 s, float a, float L, float c1, float c2, out vec4 ds) {
    float r = s.x;
    float u = clamp(s.y, -0.9998, 0.9998);
    float pr = s.z;
    float pu = s.w;

    float r2 = r * r;
    float a2 = a * a;
    float invSig = 1.0 / (r2 + a2 * u * u);
    float del = max(1e-5, r2 - 2.0 * r + a2);
    float pOverDel = (r2 + a2 - a * L) / del;

    float dr = del * pr * invSig;
    float du = pu * invSig;
    float dpr = (2.0 * r * pOverDel - (r - 1.0) * (pr * pr + pOverDel * pOverDel)) * invSig;
    float dpu = (c1 * u + c2 * u * u * u) * invSig;

    ds = vec4(dr, du, dpr, dpu);
}

// Keplerian ISCO radius for prograde Kerr orbits
float iscoRadius(float a) {
    float absA = clamp(abs(a), 0.0, 0.998);
    float z1 = 1.0 + pow(1.0 - absA * absA, 1.0 / 3.0) * (pow(1.0 + absA, 1.0 / 3.0) + pow(max(1e-5, 1.0 - absA), 1.0 / 3.0));
    float z2 = sqrt(3.0 * absA * absA + z1 * z1);
    return 3.0 + z2 - sqrt(max(0.0, (3.0 - z1) * (3.0 + z1 + 2.0 * z2)));
}

void main() {
    if (uAuxOpacity <= 0.002) discard;

    // Screen coordinates mapped to celestial impact parameters (alpha, beta)
    vec2 pScreen = (vUV - uBhScreenCentre) * vec2(uRes.x / max(1.0, uRes.y), 1.0) * uBhScale;
    float alpha = pScreen.x;
    float beta = pScreen.y;

    float thetaObs = clamp(uTilt, 0.001, 3.14159265 - 0.001);
    float sinObs = sin(thetaObs);
    float cosObs = cos(thetaObs);

    float a = clamp(uSpin, -0.998, 0.998);
    float a2 = a * a;
    float L = -alpha * sinObs;
    float Q = beta * beta + (alpha * alpha - a2) * cosObs * cosObs;
    float c1 = -(Q + L * L - a2);
    float c2 = -2.0 * a2;

    float r_plus = 1.0 + sqrt(max(0.0, 1.0 - a2));
    float r_absorb = r_plus * 1.025;
    float r_isco = iscoRadius(a);
    float r_out = 18.0;

    float rObs = 35.0;
    float delObs = rObs * rObs - 2.0 * rObs + a2;
    float pObs = rObs * rObs + a2 - a * L;
    float rad = max(0.0, (pObs * pObs) / delObs - (Q + (L - a) * (L - a)));
    float prObs = -sqrt(rad / delObs);
    float puObs = -beta * sinObs;

    vec4 s = vec4(rObs, cosObs, prObs, puObs);
    float bImpact = length(pScreen);

    vec3 emitColor = vec3(0.0);
    float transmittance = 1.0;
    int diskCrossings = 0;
    bool captured = false;
    bool escaped = false;
    float tCoord = 0.0;
    float phiCoord = 1.57079632679;
    int totalSteps = 0;
    float worstH = 0.0;
    float firstHitR = 0.0;
    bool stepLimitReached = false;

    // Fast escape check for distant non-lensed rays
    if (bImpact > 26.0) {
        escaped = true;
    }

    // Numerical integration of Kerr null geodesics with adaptive RK4 (96 steps)
    if (!escaped) {
    for (int step = 0; step < 96; step++) {
        totalSteps = step + 1;
        float r = s.x;
        float u = s.y;

        // Conserved quantity drift tracking: Hamiltonian error |H|
        float sig_check = r * r + a2 * u * u;
        float del_check = max(1e-5, r * r - 2.0 * r + a2);
        float p_check = r * r + a2 - a * L;
        float Hr = abs(del_check * s.z * s.z - (p_check * p_check) / del_check + (Q + (L - a) * (L - a))) / (2.0 * sig_check);
        float u2_c = u * u;
        float Hu = abs((s.w * s.w + u2_c * L * L) / max(1e-4, 1.0 - u2_c) - a2 * u2_c - Q);
        float curH = max(Hr, Hu * 0.05);
        if (r > r_plus * 1.05) worstH = max(worstH, curH);

        // Horizon absorption check
        if (r <= r_absorb) {
            captured = true;
            break;
        }

        // Outward escape check
        if ((r >= 22.0 && s.z > 0.0 && step > 2) || (r >= rObs + 1.0 && s.z > 0.0)) {
            escaped = true;
            break;
        }

        // Strictly continuous adaptive integration step proportional to horizon distance
        // Monotonic rational profile with zero derivative discontinuities
        float distH = max(0.005, r - r_plus);
        float dl = clamp(0.032 + 0.16 * (distH / (1.0 + distH * 0.25)) + 0.06 * max(0.0, r - 10.0), 0.032, 1.8);

        // RK4 stage evaluations
        vec4 k1s, k2s, k3s, k4s;
        stateDerivs(s, a, L, c1, c2, k1s);
        stateDerivs(s + 0.5 * dl * k1s, a, L, c1, c2, k2s);
        stateDerivs(s + 0.5 * dl * k2s, a, L, c1, c2, k3s);
        stateDerivs(s + dl * k3s, a, L, c1, c2, k4s);

        vec4 sNext = s + (dl / 6.0) * (k1s + 2.0 * k2s + 2.0 * k3s + k4s);

        // Equatorial plane crossing (u = cos θ sign change) with 5 bisection refinement steps
        if (s.y * sNext.y <= 0.0 && s.x > r_plus) {
            float t0 = 0.0;
            float t1 = 1.0;
            float u0 = s.y;
            for (int b = 0; b < 5; b++) {
                float tm = 0.5 * (t0 + t1);
                vec4 sm = mix(s, sNext, tm);
                if (u0 * sm.y <= 0.0) {
                    t1 = tm;
                } else {
                    t0 = tm;
                    u0 = sm.y;
                }
            }
            float tRefined = 0.5 * (t0 + t1);
            vec4 sHit = mix(s, sNext, tRefined);
            float rHit = sHit.x;

            if (rHit >= r_isco && rHit <= r_out && diskCrossings < 6) {
                diskCrossings++;
                if (diskCrossings == 1) {
                    firstHitR = rHit;
                }

                // Keplerian angular velocity Ω(r) & relativistic four-velocity u^t
                float omega = 1.0 / (pow(rHit, 1.5) + a);
                float denomUt = max(0.02, 1.0 - 3.0 / rHit + 2.0 * a / pow(rHit, 1.5));
                float ut = 1.0 / sqrt(denomUt);

                // Relativistic Doppler factor g = nu_obs / nu_em = 1 / (u^t * (1 - Ω * L))
                float factor = ut * (1.0 - omega * L);
                float g = factor > 1e-4 ? clamp(1.0 / factor, 0.12, 6.5) : 1.0;

                // Exact peak of Novikov-Thorne flux occurs at r_peak ≈ (1.29 - 0.12 * |a|) * r_isco
                float rPeak = r_isco * (1.29 - 0.12 * abs(a));
                float fPeak = max(1e-5, novikovThorneFlux(rPeak, a, r_isco));
                float fNT = novikovThorneFlux(rHit, a, r_isco);
                float fNorm = clamp(fNT / fPeak, 0.0, 1.0);
                float tempScale = pow(fNorm, 0.25);
                float radCool = smoothstep(r_out + 1.0, r_isco, rHit);

                // Warm Planckian disk temperature (1,200 K outer -> 8,600 K inner core) so ACES preserves gold/amber
                float Tem = 7400.0 * tempScale * (0.35 + 0.65 * radCool) + 1200.0;
                float gTemp = pow(max(1e-4, g), 0.65);
                float Tobs = clamp(Tem * gTemp, 1000.0, 38000.0);
                vec3 col = blackbody(Tobs);

                // Differential rotation shear in coordinates (r, φ - Ω(r)*t)
                float phiCorot = phiCoord + omega * (uTime * 0.90);
                float turb = diskPlasmaTurbulence(rHit, phiCorot, diskCrossings, r_isco);

                // Cinematic relativistic beaming so approaching side blazes blue-white without saturating to grey
                float gEff = pow(max(1e-4, g), 0.55);
                float beaming = gEff * gEff * gEff * gEff;
                float intensity = 3.8 * fNorm * turb * beaming;

                // Optical depth & vertical thickness H(r) = 0.035 r
                float cosIncRay = max(0.06, abs(sHit.w));
                float pathLen = (2.0 * 0.035 * rHit) / cosIncRay;
                float density = fNorm * smoothstep(r_out, r_out - 1.8, rHit) * smoothstep(r_isco, r_isco + 0.15, rHit);
                float alphaDisk = clamp(1.0 - exp(-pathLen * density * 3.4), 0.0, 0.95);
                if (diskCrossings == 2) {
                    alphaDisk = min(alphaDisk, 0.62);
                } else if (diskCrossings >= 3) {
                    alphaDisk = min(alphaDisk, 0.45);
                }

                emitColor += transmittance * alphaDisk * col * intensity;
                transmittance *= (1.0 - alphaDisk);

                if (transmittance < 0.015) break;
            }
        }

        s = sNext;
        phiCoord += dl * (L / max(0.01, 1.0 - sNext.y * sNext.y));
    }
    }

    if (!captured && !escaped && totalSteps >= 96) {
        if (s.z < 0.0 && s.x < 3.0) {
            captured = true;
        } else if (s.z > 0.0 && s.x > 3.0) {
            escaped = true;
        } else {
            stepLimitReached = true;
        }
    }

    // Escaped rays do not draw sky in the black hole pass; the underlying Mathematics background shines through

    // Diagnostics Views (Telemetry Modes 1 to 7)
    if (uDebugMode == 1) {
        // Mode 1 (b): Ray termination reason as flat colours
        // Horizon: Black | Disc hit: Amber | Escaped: Sky Blue | Step limit: Magenta
        vec3 colTerm = vec3(0.12, 0.55, 0.95);
        if (captured) colTerm = vec3(0.0, 0.0, 0.0);
        else if (stepLimitReached) colTerm = vec3(0.95, 0.05, 0.35);
        else if (diskCrossings > 0) colTerm = vec3(0.98, 0.70, 0.10);
        fragColor = vec4(colTerm, 1.0);
        return;
    }
    if (uDebugMode == 2) {
        // Mode 2 (c): Number of steps used per pixel (heatmap)
        float tStep = float(totalSteps) / 96.0;
        vec3 colHeat;
        if (tStep < 0.33) colHeat = mix(vec3(0.05, 0.10, 0.65), vec3(0.0, 0.75, 0.80), tStep * 3.0);
        else if (tStep < 0.66) colHeat = mix(vec3(0.0, 0.75, 0.80), vec3(0.95, 0.85, 0.10), (tStep - 0.33) * 3.0);
        else colHeat = mix(vec3(0.95, 0.85, 0.10), vec3(1.0, 0.10, 0.05), (tStep - 0.66) * 3.0);
        fragColor = vec4(colHeat, 1.0);
        return;
    }
    if (uDebugMode == 3) {
        // Mode 3 (d): Disc crossing order n
        vec3 colOrder = vec3(0.04);
        if (captured && diskCrossings == 0) colOrder = vec3(0.0);
        else if (diskCrossings == 1) colOrder = vec3(0.15, 0.45, 0.95);      // n=1 Primary (blue)
        else if (diskCrossings == 2) colOrder = vec3(0.15, 0.85, 0.35);      // n=2 Secondary (green)
        else if (diskCrossings == 3) colOrder = vec3(0.95, 0.80, 0.10);      // n=3 Tertiary (yellow)
        else if (diskCrossings >= 4) colOrder = vec3(0.95, 0.15, 0.10);      // n>=4 Quaternary+ (red)
        fragColor = vec4(colOrder, 1.0);
        return;
    }
    if (uDebugMode == 4) {
        // Mode 4 (e): Disc radius r at first hit (false-colour)
        vec3 colR = vec3(0.03);
        if (diskCrossings > 0) {
            float rNorm = clamp((firstHitR - r_isco) / (r_out - r_isco), 0.0, 1.0);
            colR = mix(vec3(1.0, 0.92, 0.45), vec3(0.42, 0.05, 0.62), rNorm);
            float rings = 0.85 + 0.15 * cos(firstHitR * 6.283185);
            colR *= rings;
        }
        fragColor = vec4(colR, 1.0);
        return;
    }
    if (uDebugMode == 5) {
        // Mode 5 (f): Conserved-quantity drift per pixel (|H| error)
        float logH = log(max(1e-9, worstH)) / 2.302585;
        float tH = clamp((logH + 7.0) / 4.5, 0.0, 1.0);
        vec3 colH;
        if (tH < 0.33) colH = mix(vec3(0.02, 0.08, 0.55), vec3(0.0, 0.70, 0.75), tH * 3.0);
        else if (tH < 0.66) colH = mix(vec3(0.0, 0.70, 0.75), vec3(0.90, 0.85, 0.10), (tH - 0.33) * 3.0);
        else colH = mix(vec3(0.90, 0.85, 0.10), vec3(1.0, 0.08, 0.05), (tH - 0.66) * 3.0);
        fragColor = vec4(colH, 1.0);
        return;
    }
    if (uDebugMode == 6) {
        // Mode 6 (g): Temporal accumulation / sample convergence weight
        float wAccum = clamp(uAuxOpacity, 0.0, 1.0);
        vec3 colAccum = mix(vec3(0.1, 0.05, 0.2), vec3(0.3, 0.85, 0.95), wAccum);
        fragColor = vec4(colAccum, 1.0);
        return;
    }
    if (uDebugMode == 7) {
        // Mode 7 (h): Tile / viewport boundaries & clipping seams
        float dXSeam = abs(gl_FragCoord.x - 1160.0);
        float lineX = smoothstep(1.5, 0.0, dXSeam);
        float dImpactSeam = abs(bImpact - 34.0);
        float lineImpact = smoothstep(0.35, 0.0, dImpactSeam);
        float dCenter = min(abs(vUV.x - uBhScreenCentre.x), abs(vUV.y - uBhScreenCentre.y));
        float lineCenter = smoothstep(0.002, 0.0, dCenter);
        vec3 colBound = vec3(0.06);
        if (bImpact > 34.0) colBound = vec3(0.12, 0.04, 0.04);
        colBound = mix(colBound, vec3(1.0, 0.1, 0.1), lineImpact);
        colBound = mix(colBound, vec3(1.0, 0.8, 0.1), lineX);
        colBound = mix(colBound, vec3(0.2, 0.9, 1.0), lineCenter);
        fragColor = vec4(colBound, 1.0);
        return;
    }

    // Screen-space mask fading leftward disc extension on desktop
    // so luminous plasma never crosses or collides with subtitle or formula card
    float leftFade = (uBhScreenCentre.x > 0.55) ? smoothstep(0.30, 0.52, vUV.x) : 1.0;
    emitColor = mix(emitColor * leftFade, emitColor, escaped ? 1.0 : 0.0);

    float shadowMask = captured ? 1.0 : 0.0;
    float totalAlpha = clamp((1.0 - transmittance * (1.0 - shadowMask)) * uAuxOpacity, 0.0, 1.0);
    vec3 finalRGB = emitColor * uAuxOpacity;

    if (uIsLight > 0.5) {
        fragColor = vec4(mix(vec3(0.04), finalRGB * 0.55, totalAlpha), totalAlpha);
    } else {
        fragColor = vec4(finalRGB, totalAlpha);
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
uniform vec3 uBloomTint;
uniform float uShockwave;
uniform float uShockwaveRadius;
uniform float uInside;
uniform vec3 uInnerTint;
uniform float uIsLight;
uniform int uDebugMode;
uniform float uPixelArt;
uniform vec3 uGradeLift;
uniform vec3 uGradeGamma;
uniform vec3 uGradeGain;
uniform float uGodRayStrength;
uniform float uAnamorphic;
out vec4 fragColor;

vec3 acesFilm(vec3 x) {
    const float a = 2.51;
    const float b = 0.03;
    const float c = 2.43;
    const float d = 0.59;
    const float e = 0.14;
    return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
}

// 9-tap tent upsample for smooth bloom halo rolloff
vec3 sampleBloomTent(sampler2D tex, vec2 uv) {
    vec2 texel = 1.0 / vec2(max(ivec2(1), textureSize(tex, 0)));
    vec4 d = texel.xyxy * vec4(-1.0, -1.0, 1.0, 1.0);
    vec3 s = texture(tex, clamp(uv, 0.001, 0.999)).rgb * 4.0;
    s += (texture(tex, clamp(uv + vec2(d.x, 0.0), 0.001, 0.999)).rgb
        + texture(tex, clamp(uv + vec2(d.z, 0.0), 0.001, 0.999)).rgb
        + texture(tex, clamp(uv + vec2(0.0, d.y), 0.001, 0.999)).rgb
        + texture(tex, clamp(uv + vec2(0.0, d.w), 0.001, 0.999)).rgb) * 2.0;
    s += texture(tex, clamp(uv + d.xy, 0.001, 0.999)).rgb
       + texture(tex, clamp(uv + d.zy, 0.001, 0.999)).rgb
       + texture(tex, clamp(uv + d.xw, 0.001, 0.999)).rgb
       + texture(tex, clamp(uv + d.zw, 0.001, 0.999)).rgb;
    return s * (1.0 / 16.0);
}

// Per-channel lift / gamma / gain colour grading (identity when uniforms are unset/zero)
vec3 gradeLGG(vec3 col, vec3 lift, vec3 gamma, vec3 gain) {
    vec3 safeGain = mix(vec3(1.0), gain, step(vec3(0.001), abs(gain)));
    vec3 safeGamma = max(vec3(0.1), mix(vec3(1.0), gamma, step(vec3(0.001), abs(gamma))));
    vec3 graded = clamp(col * safeGain + lift * (1.0 - col), 0.0, 1.0);
    return pow(graded, 1.0 / safeGamma);
}

// 4x4 ordered Bayer dithering matrix in [-0.5, 0.5)
float bayer4x4(vec2 fragCoord) {
    ivec2 p = ivec2(mod(fragCoord, 4.0));
    int idx = p.x + p.y * 4;
    const float m[16] = float[16](
         0.0,  8.0,  2.0, 10.0,
        12.0,  4.0, 14.0,  6.0,
         3.0, 11.0,  1.0,  9.0,
        15.0,  7.0, 13.0,  5.0
    );
    return (m[idx] + 0.5) / 16.0 - 0.5;
}

float hash12(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
}

void main() {
    if (uDebugMode > 0) {
        fragColor = vec4(texture(uSceneTex, vUV).rgb, 1.0);
        return;
    }

    if (uIsLight > 0.5) {
        vec4 s = texture(uSceneTex, vUV);
        float a = clamp(s.a, 0.0, 0.92);
        vec3 ink = clamp(s.rgb, 0.0, 0.88);
        fragColor = vec4(ink * a, a);
        return;
    }

    // Pixel-art path: exact texel fetch, pitch black background, no bloom / tone-map / grain / scanlines
    vec3 pixOut = vec3(0.0);
    if (uPixelArt > 0.001) {
        ivec2 tsz = textureSize(uSceneTex, 0);
        ivec2 tc = clamp(ivec2(vUV * vec2(tsz)), ivec2(0), tsz - ivec2(1));
        vec3 ps = texelFetch(uSceneTex, tc, 0).rgb;
        float cov = step(0.08, max(ps.r, max(ps.g, ps.b)));
        pixOut = mix(vec3(0.0, 0.0, 0.0), clamp(ps, 0.0, 1.0), cov);
        if (uPixelArt > 0.999) { fragColor = vec4(pixOut, 1.0); return; }
    }

    vec2 baseUV = vUV;
    if (uShockwave > 0.0005) {
        vec2 sc = vUV - vec2(0.5);
        float distSc = length(sc);
        float waveDist = abs(distSc - uShockwaveRadius);
        float ripple = sin(waveDist * 42.0) * exp(-waveDist * 18.0) * uShockwave;
        baseUV = vUV + (distSc > 0.001 ? (sc / distSc) * ripple : vec2(0.0));
    }

    vec2 centred = baseUV - uWarpCentre;
    float edgeR2 = dot(baseUV - 0.5, baseUV - 0.5);

    vec3 sceneRgb;
    vec3 bloomRgb;

    // Skip radial warp blur pass completely when uWarpStrength <= 0.001
    if (uWarpStrength > 0.001) {
        vec3 accS = vec3(0.0);
        vec3 accB = vec3(0.0);
        float wSum = 0.0;
        float rDist = length(centred);
        float ca = uCaStrength + uWarpStrength * 0.018;
        for (int i = 0; i < 6; i++) {
            float fi = float(i) / 5.0;
            // Morris-Thorne spacetime throat pinch + frame-dragging twist
            float pinch = 1.0 - fi * uWarpStrength * (0.28 / (1.0 + rDist * 1.6));
            float twist = (fi - 0.5) * uWarpStrength * 0.16 * exp(-rDist * 2.2);
            float cs = cos(twist), sn = sin(twist);
            vec2 rotC = vec2(centred.x * cs - centred.y * sn, centred.x * sn + centred.y * cs);
            vec2 sampleUV = uWarpCentre + rotC * pinch;
            vec2 caOff = rotC * (ca * (0.3 + fi));
            float w = 1.0 - fi * 0.55;
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
        vec2 caVec = (baseUV - 0.5) * (uCaStrength * edgeR2 * 2.2);
        sceneRgb.r = texture(uSceneTex, clamp(baseUV + caVec, 0.001, 0.999)).r;
        sceneRgb.g = texture(uSceneTex, baseUV).g;
        sceneRgb.b = texture(uSceneTex, clamp(baseUV - caVec, 0.001, 0.999)).b;
        bloomRgb = sampleBloomTent(uBloomTex, baseUV);
    } else {
        sceneRgb = texture(uSceneTex, baseUV).rgb;
        bloomRgb = sampleBloomTent(uBloomTex, baseUV);
    }

    // Deep pitch-black space background + HDR scene + selective bloom
    vec3 hdr = max(vec3(0.0), sceneRgb * 1.06 + bloomRgb * uBloomTint * (uBloomStrength * 0.92) - vec3(0.0012));

    // Quality-gated radial god-ray scattering towards warp centre
    if (uGodRayStrength > 0.001) {
        vec2 rayOrigin = (dot(uWarpCentre, uWarpCentre) > 0.0001) ? uWarpCentre : vec2(0.55, 0.5);
        vec2 deltaRay = (rayOrigin - baseUV) * (0.28 / 5.0);
        vec2 rayUV = baseUV;
        vec3 godRays = vec3(0.0);
        float decay = 1.0;
        for (int i = 0; i < 5; i++) {
            rayUV += deltaRay;
            godRays += texture(uBloomTex, clamp(rayUV, 0.001, 0.999)).rgb * decay;
            decay *= 0.82;
        }
        hdr += godRays * uBloomTint * (uGodRayStrength * 0.14);
    }

    // Interior atmosphere: structure glow without tinting the pitch-black background
    hdr += bloomRgb * uInnerTint * (uInside * 0.36);

    // ACES Filmic Tone Mapping + lift/gamma/gain colour grading + sRGB gamma encoding
    vec3 mapped = gradeLGG(acesFilm(hdr), uGradeLift, uGradeGamma, uGradeGain);
    vec3 srgb = pow(mapped, vec3(1.0 / 2.2));

    // Subtle radial vignette
    float vig = 1.0 - uVignette * smoothstep(0.18, 0.92, edgeR2 * 1.85);
    srgb *= vig;

    // 4x4 ordered Bayer dithering + Triangular-PDF (TPDF) grain to eliminate dark fog/bloom banding
    vec2 grainSeed = gl_FragCoord.xy + fract(uTime * 17.31) * 413.0;
    float r1 = hash12(grainSeed);
    float r2 = hash12(grainSeed + vec2(37.17, 19.83));
    float tpdf = (r1 + r2) - 1.0;
    float dither = bayer4x4(gl_FragCoord.xy) * (1.0 / 255.0);
    srgb = clamp(srgb + dither + tpdf * (uGrain * 0.5), 0.0, 1.0);

    // Sci-Fi Cinematic Enhancements: Lean Horizontal Anamorphic Flare & Tactical Scanlines
    // 1. Horizontal Anamorphic Flare from bright bloom highlights (4 symmetric taps, gated by uAnamorphic)
    if (uAnamorphic > 0.001) {
        vec3 anisoFlare = vec3(0.0);
        float flareStep = 0.0045 * (1.0 + uWarpStrength * 2.0);
        anisoFlare += texture(uBloomTex, clamp(baseUV + vec2(flareStep, 0.0), 0.001, 0.999)).rgb * 0.65;
        anisoFlare += texture(uBloomTex, clamp(baseUV - vec2(flareStep, 0.0), 0.001, 0.999)).rgb * 0.65;
        anisoFlare += texture(uBloomTex, clamp(baseUV + vec2(flareStep * 2.4, 0.0), 0.001, 0.999)).rgb * 0.35;
        anisoFlare += texture(uBloomTex, clamp(baseUV - vec2(flareStep * 2.4, 0.0), 0.001, 0.999)).rgb * 0.35;
        srgb += anisoFlare * (0.06 + 0.10 * uInside + 0.16 * uWarpStrength) * uAnamorphic;
    }

    // 2. High-tech tactical holographic scanlines (subtle 1.5% modulation)
    float scanline = sin(gl_FragCoord.y * 2.0) * 0.015 * (0.5 + 0.5 * uInside);
    srgb = clamp(srgb - vec3(scanline), 0.0, 1.0);

    // 3. Quantum edge HUD vignette glow during hyperdrive warp
    if (uWarpStrength > 0.05) {
        float warpGlow = edgeR2 * uWarpStrength * 0.35;
        srgb += vec3(0.12, 0.35, 0.85) * warpGlow;
    }

    fragColor = vec4(mix(srgb, pixOut, clamp(uPixelArt, 0.0, 1.0)), 1.0);
}
`;

    /* 10. Threshold Rift Ring Shaders */
    const VS_THRESHOLD_RING = `#version 300 es
precision highp float;

layout(location = 0) in vec2 aPosition;

uniform mat4 uViewProj;
uniform vec3 uRingPos;
uniform vec3 uRingNormal;
uniform float uRingRadius;

out vec2 vLocalPos;

void main() {
    vLocalPos = aPosition;
    vec3 n = normalize(uRingNormal);
    vec3 up = abs(n.y) < 0.95 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
    vec3 right = normalize(cross(up, n));
    vec3 trueUp = cross(n, right);

    vec3 worldPos = uRingPos + (right * aPosition.x + trueUp * aPosition.y) * uRingRadius;
    gl_Position = uViewProj * vec4(worldPos, 1.0);
}
`;

    const FS_THRESHOLD_RING = `#version 300 es
precision highp float;

in vec2 vLocalPos;

uniform float uTime;
uniform float uOpacity;
uniform vec3 uColour;
uniform float uRiftNoise;

out vec4 fragColor;

void main() {
    float r = length(vLocalPos);
    if (r > 1.25) discard;

    float targetR = 0.85;
    float d = abs(r - targetR);

    // Dynamic rift harmonic ripple around perimeter
    float angle = atan(vLocalPos.y, vLocalPos.x);
    float ripple = sin(angle * 7.0 - uTime * 4.5) * 0.035 * uRiftNoise
                 + cos(angle * 13.0 + uTime * 6.2) * 0.020 * uRiftNoise;
    d = abs(r - (targetR + ripple));

    // Core gaussian filament + outer exponential aura
    float core = exp(-d * d / 0.0025);
    float aura = exp(-d * 8.5) * 0.45;
    float intensity = (core * 2.2 + aura) * uOpacity;

    if (intensity < 0.005) discard;

    vec3 glowCol = uColour * (1.2 + core * 1.5) + vec3(0.7, 0.85, 1.0) * core;
    fragColor = vec4(glowCol * intensity, intensity);
}
`;

    /* 11. Volumetric Interior Ambient Dust Shaders */
    const VS_AMBIENT_DUST = `#version 300 es
precision highp float;

layout(location = 0) in vec3 aOffset; // base offset in [-12, 12]^3
layout(location = 1) in vec2 aSeed;   // seed for phase & size

uniform mat4 uViewProj;
uniform vec3 uCamPos;
uniform vec3 uTravelDir;
uniform float uSpeedN;
uniform float uInside;
uniform vec3 uColour;
uniform float uTime;
uniform float uDpr;
uniform vec2 uViewport;

out vec3 vColour;
out float vAlpha;
out vec2 vUvDir;
out float vHalfSeg;
out float vCapRad;

void main() {
    if (uInside < 0.005) {
        gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
        gl_PointSize = 0.0;
        vAlpha = 0.0;
        return;
    }

    // Slow ambient drift (not a swarm, independent Brownian-like float)
    vec3 drift = vec3(
        sin(uTime * 0.18 + aSeed.x * 6.283),
        cos(uTime * 0.14 + aSeed.y * 6.283),
        sin(uTime * 0.22 + aSeed.x + aSeed.y)
    ) * 1.6;

    // Wrap around camera in 24-unit cubic volume
    vec3 worldP = uCamPos + mod(aOffset + drift - uCamPos + 12.0, 24.0) - 12.0;

    vec4 clipCurr = uViewProj * vec4(worldP, 1.0);
    if (clipCurr.w <= 0.1) {
        gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
        gl_PointSize = 0.0;
        vAlpha = 0.0;
        return;
    }

    float dist = max(0.5, length(worldP - uCamPos));
    float baseSize = clamp((2.2 + aSeed.x * 2.8) * (18.0 / (dist + 8.0)) * uDpr, 1.5 * uDpr, 12.0 * uDpr);

    // Streaks stretch along the travel direction in proportion to speed
    float streakLen = uSpeedN * 32.0 * uDpr;
    vec2 dirNdc = vec2(1.0, 0.0);
    vec4 clipAhead = uViewProj * vec4(worldP - uTravelDir * (streakLen * 0.05), 1.0);
    if (clipAhead.w > 0.1 && streakLen > 0.5) {
        vec2 d = (clipCurr.xy / clipCurr.w - clipAhead.xy / clipAhead.w) * 0.5 * uViewport * uDpr;
        float dl = length(d);
        if (dl > 0.2) dirNdc = d / dl;
    }

    float ptSize = baseSize + streakLen;
    vec2 halfVpPx = max(vec2(1.0), 0.5 * uViewport * uDpr);
    vec2 deltaNdc = (dirNdc * streakLen) / halfVpPx;

    gl_Position = vec4(clipCurr.xy - 0.5 * deltaNdc * clipCurr.w, clipCurr.z, clipCurr.w);
    gl_PointSize = ptSize;

    vUvDir = vec2(dirNdc.x, -dirNdc.y);
    vHalfSeg = 0.5 * streakLen / max(1.0, ptSize);
    vCapRad = 0.5 * baseSize / max(1.0, ptSize);

    // Fade with distance from camera and modulate by uInside and gentle twinkle
    float sphereFade = smoothstep(12.0, 3.5, dist) * smoothstep(0.8, 2.0, dist);
    float twinkle = 0.8 + 0.2 * sin(uTime * 2.1 + aSeed.y * 6.283);
    vAlpha = uInside * sphereFade * twinkle * (0.35 + 0.45 * uSpeedN);
    vColour = mix(uColour, vec3(1.0), 0.25) * (1.0 + uSpeedN * 0.6);
}
`;

    const FS_AMBIENT_DUST = `#version 300 es
precision highp float;

in vec3 vColour;
in float vAlpha;
in vec2 vUvDir;
in float vHalfSeg;
in float vCapRad;

out vec4 fragColor;

void main() {
    if (vAlpha <= 0.001) discard;

    vec2 p = gl_PointCoord - vec2(0.5);
    vec2 localP = vec2(dot(p, vec2(vUvDir.x, -vUvDir.y)), dot(p, vec2(-vUvDir.y, -vUvDir.x)));

    float segDist = abs(localP.x) - vHalfSeg;
    float dist = (segDist > 0.0) ? length(vec2(segDist, localP.y)) : abs(localP.y);

    float normDist = dist / max(0.001, vCapRad);
    if (normDist > 1.0) discard;

    float core = exp(-normDist * normDist * 3.5);
    float a = vAlpha * core;
    if (a <= 0.002) discard;

    fragColor = vec4(vColour * a, a);
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
        FS_POST_COMPOSITE,
        VS_THRESHOLD_RING,
        FS_THRESHOLD_RING,
        VS_AMBIENT_DUST,
        FS_AMBIENT_DUST
    };
}));