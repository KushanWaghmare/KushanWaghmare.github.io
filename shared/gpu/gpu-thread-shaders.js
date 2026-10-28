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
    float heroScale = isHero ? (1.0 + uHeroBoost * 3.2) * uHeroScale : uWorldGrow;
    float seedVar = 0.80 + 0.42 * aSeed.x;

    if (aSize <= 0.0001 || aPosition.z < -2500.0) {
        gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
        gl_PointSize = 0.0;
        vAlpha = 0.0;
        return;
    }

    float baseSize = clamp(aSize * seedVar * perspectiveScale * uDpr * heroScale, 1.35 * uDpr, 44.0 * uDpr);

    // Velocity-aligned ribbon stretch with 3 parallax depth layers (near, mid, far)
    float layerFactor = isHero ? 1.65 : ((dist < 7.5) ? 1.35 : ((dist < 17.0) ? 1.0 : 0.68));
    float worldStep = length(aPosition - aPrevPosition);
    float maxStep = isHero ? 45.0 : 9.0;
    float streakLen = 0.0;
    vec2 dirNdc = vec2(1.0, 0.0);

    if (clipCurr.w > 0.15 && clipPrev.w > 0.15 && worldStep < maxStep && uStreakScale > 0.001) {
        vec2 ndcCurr = clipCurr.xy / clipCurr.w;
        vec2 ndcPrev = clipPrev.xy / clipPrev.w;
        vec2 rawDeltaPx = (ndcCurr - ndcPrev) * 0.5 * uViewport * uDpr * uStreakScale * layerFactor;
        float rawLen = length(rawDeltaPx);
        if (rawLen > 0.35) {
            dirNdc = rawDeltaPx / rawLen;
            streakLen = min(rawLen, (isHero ? uMaxStreakPx * 1.45 : uMaxStreakPx) * uDpr);
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
    float fogFactor = clamp((dist - 11.0 * (1.0 - 0.5 * uInside)) / (42.0 * (1.0 - 0.4 * uInside)), 0.0, 0.72);
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

    /* 3. Celestial Starfield & Milky Way Background Layer (matches Black Hole celestial sphere) */
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

in vec2 vUV;
out vec4 fragColor;

uniform vec2 uRes;
uniform vec2 uBhScreenCentre;
uniform float uBhScale;
uniform float uTilt;
uniform float uTime;
uniform float uIsLight;

// Analytical Tanner Helland blackbody spectrum fit with Planckian tonal grading (identical to Black Hole sim)
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

// Procedural celestial sphere: anti-aliased starfield & faint Milky Way band (identical to Black Hole sky)
vec3 lensedSky(vec3 d, float time) {
    // 1. Faint procedural Milky Way band (peak luminance ~0.010, near-black space)
    vec3 galPole = normalize(vec3(-0.35, 0.72, 0.59));
    float b = dot(d, galPole);
    float mwMask = exp(-b * b * 18.0);
    vec3 galU = normalize(cross(galPole, vec3(0.0, 0.0, 1.0)));
    vec3 galV = cross(galPole, galU);
    float l = atan(dot(d, galV), dot(d, galU));
    float mwClouds = 0.60 + 0.40 * sin(l * 2.0 + 1.2) * cos(l * 3.0 - 0.4);
    vec3 mwCol = vec3(0.007, 0.010, 0.018) * (mwMask * mwClouds * 0.48);

    // 2. Multi-tier anti-aliased point stars with realistic magnitude & temperature distribution
    vec3 starAcc = vec3(0.0);
    for (int shell = 0; shell < 2; shell++) {
        float freq = (shell == 0) ? 36.0 : 68.0;
        vec3 pCell = d * freq;
        vec3 id = floor(pCell);
        vec3 fd = fract(pCell) - 0.5;

        vec3 h = fract(sin(vec3(dot(id, vec3(127.1, 311.7, 74.7)),
                                dot(id, vec3(269.5, 183.3, 246.1)),
                                dot(id, vec3(113.5, 271.9, 124.6)))) * 43758.5453);
        
        float prob = (shell == 0) ? 0.32 : 0.22;
        if (h.x < prob) {
            vec2 starOffset = (h.yz - 0.5) * 0.70;
            float dist2 = dot(fd.xy - starOffset, fd.xy - starOffset) + fd.z * fd.z;
            float rad = (shell == 0) ? 0.065 : 0.045;
            float starProfile = exp(-dist2 / (rad * rad));
            
            float magScale = pow(h.x / prob, 3.6);
            float bright = mix(0.12, 1.65, magScale);
            float starT = mix(2800.0, 22000.0, pow(h.y, 2.0));
            vec3 starColor = blackbody(starT);
            
            float twinkle = 0.88 + 0.12 * sin(time * (1.6 + 2.4 * h.z) + h.x * 40.0);
            starAcc += starProfile * starColor * (bright * twinkle) * 0.42;
        }
    }

    return mwCol + starAcc;
}

uniform float uBrightness; // starfield brightness only (positions never change)

void main() {
    // Screen coordinates mapped to celestial impact parameters (alpha, beta)
    // Exactly matches the Kerr Black Hole ray tracer celestial projection
    vec2 pScreen = (vUV - uBhScreenCentre) * vec2(uRes.x / max(1.0, uRes.y), 1.0) * uBhScale;
    float alpha = pScreen.x;
    float beta = pScreen.y;

    float thetaObs = clamp(uTilt, 0.001, 3.14159265 - 0.001);
    float sinObs = sin(thetaObs);
    float cosObs = cos(thetaObs);

    vec3 dSky = normalize(vec3(alpha, beta * cosObs + 35.0 * sinObs, -beta * sinObs + 35.0 * cosObs));
    vec3 sky = lensedSky(dSky, uTime);

    if (uIsLight > 0.5) {
        float lum = dot(sky, vec3(0.299, 0.587, 0.114));
        fragColor = vec4(vec3(0.08, 0.10, 0.16) * lum, clamp(lum * 0.25, 0.0, 0.08));
        return;
    }

    fragColor = vec4(sky * uBrightness, 1.0);
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

                // Novikov-Thorne zero-torque flux profile F(r) & emitted temperature T_em ~ F(r)^(1/4)
                float fNT = novikovThorneFlux(rHit, a, r_isco);
                float fNorm = clamp(fNT / 0.02827, 0.0, 1.0);
                float tempScale = pow(fNorm, 0.25);
                float radCool = smoothstep(r_out + 1.0, r_isco, rHit);
                float Tem = 28000.0 * tempScale * (0.35 + 0.65 * radCool) + 1200.0;

                // Relativistic Doppler shift: observed temperature T_obs = g * T_em
                float Tobs = clamp(Tem * g, 1000.0, 65000.0);
                vec3 col = blackbody(Tobs);

                // Differential rotation shear in coordinates (r, φ - Ω(r)*t)
                float phiCorot = phiCoord + omega * (uTime * 0.90);
                float turb = diskPlasmaTurbulence(rHit, phiCorot, diskCrossings, r_isco);

                // Bolometric intensity beaming boost: scales strictly as g^4
                float beaming = pow(g, 4.0);
                float intensity = 5.4 * fNorm * turb * beaming;

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
        vec2 caVec = (baseUV - 0.5) * (uCaStrength * edgeR2 * 2.2);
        sceneRgb.r = texture(uSceneTex, clamp(baseUV + caVec, 0.001, 0.999)).r;
        sceneRgb.g = texture(uSceneTex, baseUV).g;
        sceneRgb.b = texture(uSceneTex, clamp(baseUV - caVec, 0.001, 0.999)).b;
        bloomRgb = texture(uBloomTex, baseUV).rgb;
    } else {
        // Gentle 5-tap sub-pixel smoothing + direct sample
        vec2 px = 0.35 / max(vec2(1.0), uRes);
        sceneRgb = texture(uSceneTex, baseUV).rgb * 0.60
                 + texture(uSceneTex, baseUV + vec2(px.x, px.y)).rgb * 0.10
                 + texture(uSceneTex, baseUV + vec2(-px.x, px.y)).rgb * 0.10
                 + texture(uSceneTex, baseUV + vec2(px.x, -px.y)).rgb * 0.10
                 + texture(uSceneTex, baseUV + vec2(-px.x, -px.y)).rgb * 0.10;
        bloomRgb = texture(uBloomTex, baseUV).rgb;
    }

    // Deep pitch-black space background + HDR scene + selective bloom
    vec3 spaceBase = vec3(0.0);

    vec3 hdr = spaceBase + sceneRgb + bloomRgb * uBloomTint * uBloomStrength;

    // Interior atmosphere: soft inner-palette haze towards the screen edges and structure glow
    float innerHaze = uInside * smoothstep(0.05, 0.85, edgeR2 * 1.9);
    hdr += uInnerTint * innerHaze * 0.045;
    hdr += bloomRgb * uInnerTint * (uInside * 0.40);

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
