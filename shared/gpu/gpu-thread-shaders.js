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

layout(location = 0) in vec4 aStarPosSeed; // xyz in [-80, 80]^3, w = magnitude [0, 1]
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
    // Seamless periodic 160-unit cube around camera with 0.18x parallax depth factor
    vec3 rel = mod(aStarPosSeed.xyz - uCamPos * 0.18 + 80.0, 160.0) - 80.0;
    float dist = length(rel);
    vec3 worldPos = uCamPos + rel;

    gl_Position = uViewProj * vec4(worldPos, 1.0);

    float edgeFade = smoothstep(79.0, 40.0, dist) * smoothstep(1.5, 6.0, dist);
    float twinkle = 0.72 + 0.28 * sin(uTime * (1.2 + 2.8 * aStarPosSeed.w) + aStarPosSeed.w * 31.4159);
    
    // Crisp, needle-sharp pinpricks matching the black hole starfield
    float sz = (0.75 + 1.25 * aStarPosSeed.w) * uDpr;

    gl_PointSize = max(1.0, sz);
    vCol = aStarCol;
    vAlpha = edgeFade * twinkle * (0.35 + 0.65 * aStarPosSeed.w) * (uIsLight > 0.5 ? 0.08 : 0.95);
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
    // Sharp Airy-like core with zero muddy blur
    float g = exp(-r2 * 6.5) * vAlpha;
    if (uIsLight > 0.5) {
        fragColor = vec4(vec3(0.12, 0.14, 0.20), g * 0.5);
    } else {
        fragColor = vec4(vCol * g * 1.8, g);
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
float diskPlasmaTurbulence(float r, float phiCorot) {
    float shear = 2.4 * log(max(1.0, r));
    float spiralAngle = phiCorot + shear;
    vec2 pDisk = vec2(cos(spiralAngle), sin(spiralAngle)) * (r * 0.55);

    float n1 = noise2D(pDisk * 1.6);
    float n2 = noise2D(pDisk * 3.6 + vec2(1.7, 3.2));
    float n3 = noise2D(pDisk * 8.2 + vec2(4.1, 0.9));
    float n4 = noise2D(pDisk * 17.5 + vec2(2.3, 5.7));
    float fbm = 0.48 * n1 + 0.28 * n2 + 0.16 * n3 + 0.08 * n4;

    float ripples = 0.82 + 0.18 * sin(r * 4.2 + 2.5 * fbm);

    float spot1 = exp(-pow(length(vec2(cos(phiCorot - 0.4), sin(phiCorot - 0.4)) * r - vec2(2.8, 0.0)), 2.0) * 1.8);
    float spot2 = exp(-pow(length(vec2(cos(phiCorot - 2.6), sin(phiCorot - 2.6)) * r - vec2(4.2, 0.0)), 2.0) * 1.4);
    float spot3 = exp(-pow(length(vec2(cos(phiCorot - 4.8), sin(phiCorot - 4.8)) * r - vec2(6.5, 0.0)), 2.0) * 0.9);
    float hotSpots = 1.0 + 1.4 * spot1 + 0.9 * spot2 + 0.7 * spot3;

    return clamp((0.35 + 1.25 * fbm) * ripples * hotSpots, 0.15, 3.5);
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

    float thetaObs = clamp(uTilt, 0.06, 3.14159265 - 0.06);
    float sinObs = sin(thetaObs);
    float cosObs = cos(thetaObs);

    float a = clamp(uSpin, -0.998, 0.998);
    float a2 = a * a;
    float L = -alpha * sinObs;
    float Q = beta * beta + (alpha * alpha - a2) * cosObs * cosObs;
    float c1 = -(Q + L * L - a2);
    float c2 = -2.0 * a2;

    float r_plus = 1.0 + sqrt(max(0.0, 1.0 - a2));
    float r_absorb = r_plus * 1.035;
    float r_isco = iscoRadius(a);
    float r_out = 16.0;

    float rObs = 45.0;
    float delObs = rObs * rObs - 2.0 * rObs + a2;
    float pObs = rObs * rObs + a2 - a * L;
    float rad = max(0.0, (pObs * pObs) / delObs - (Q + (L - a) * (L - a)));
    float prObs = -sqrt(rad / delObs);
    float puObs = sinObs * beta;

    vec4 s = vec4(rObs, cosObs, prObs, puObs);
    float bImpact = length(pScreen);

    // Fast escape check for distant non-lensed rays
    if (bImpact > 18.0) discard;

    vec3 emitColor = vec3(0.0);
    float transmittance = 1.0;
    int diskCrossings = 0;
    bool captured = false;
    float tCoord = 0.0;
    float phiCoord = 0.0;

    // Numerical integration of Kerr null geodesics with adaptive RK4
    for (int step = 0; step < 110; step++) {
        float r = s.x;
        float u = s.y;

        // Horizon absorption check
        if (r <= r_absorb) {
            captured = true;
            break;
        }

        // Outward escape check
        if ((r >= 22.0 && s.z > 0.0 && step > 2) || (r >= rObs + 2.0 && s.z > 0.0)) {
            break;
        }

        // Adaptive step: fine near horizon & photon orbit, large in exterior
        float distH = max(1e-4, r - r_plus);
        float dl = (r > r_out + 1.0)
            ? min(5.0, (r - r_out) * 0.45 + 1.1)
            : clamp(0.12 * distH, 0.001, 2.2);
        if (abs(u) < 0.08 && r < 24.0) dl *= 0.65;

        // RK4 stage evaluations
        vec4 k1s, k2s, k3s, k4s;
        stateDerivs(s, a, L, c1, c2, k1s);
        stateDerivs(s + 0.5 * dl * k1s, a, L, c1, c2, k2s);
        stateDerivs(s + 0.5 * dl * k2s, a, L, c1, c2, k3s);
        stateDerivs(s + dl * k3s, a, L, c1, c2, k4s);

        vec4 sNext = s + (dl / 6.0) * (k1s + 2.0 * k2s + 2.0 * k3s + k4s);

        // Equatorial plane crossing (u = cos θ sign change)
        if (s.y * sNext.y <= 0.0 && s.x > r_plus) {
            float frac = clamp(abs(s.y) / max(1e-6, abs(s.y) + abs(sNext.y)), 0.0, 1.0);
            vec4 sHit = mix(s, sNext, frac);
            float fracRefined = clamp(frac - sHit.y / max(1e-6, s.y - sNext.y), 0.0, 1.0);
            sHit = mix(s, sNext, fracRefined);
            float rHit = sHit.x;

            if (rHit >= r_isco && rHit <= r_out && diskCrossings < 6) {
                diskCrossings++;

                // Keplerian angular velocity Ω(r) & four-velocity u^t
                float omega = 1.0 / (pow(rHit, 1.5) + a);
                float g_tt = -(1.0 - 2.0 / rHit);
                float g_tphi = -2.0 * a / rHit;
                float g_phiphi = rHit * rHit + a * a + 2.0 * a * a / rHit;
                float denomUt = -(g_tt + 2.0 * g_tphi * omega + g_phiphi * omega * omega);
                float ut = denomUt > 0.0 ? 1.0 / sqrt(denomUt) : 1.15;

                // Relativistic Doppler factor g = 1 / (u^t * (1 - Ω * L))
                float factor = ut * (1.0 - omega * L);
                float g = factor > 1e-4 ? clamp(1.0 / factor, 0.15, 6.0) : 1.0;

                // Zero-torque Novikov-Thorne flux profile F(r)
                float x = sqrt(rHit);
                float x0 = sqrt(r_isco);
                float fProfile = clamp((x - x0) / max(0.12, x), 0.0, 1.0) * exp(-(rHit - r_isco) * 0.22);
                float tempScale = pow(fProfile, 0.25);

                // Differential rotation shear in coordinates (r, φ - Ω(r)*t)
                float phiCorot = phiCoord + omega * (uTime * 0.85);
                float turb = diskPlasmaTurbulence(rHit, phiCorot);

                float Tem = 11000.0 * tempScale + 1200.0;
                float Tobs = Tem * g;
                vec3 col = blackbody(Tobs);
                float intensity = 4.2 * fProfile * turb * pow(g, 4.0);

                float alphaDisk = 0.88 * smoothstep(r_out, r_out * 0.72, rHit) * smoothstep(r_isco, r_isco + 0.15, rHit);
                if (diskCrossings > 1) {
                    alphaDisk = min(alphaDisk, 0.65);
                }
                emitColor += transmittance * alphaDisk * col * intensity;
                transmittance *= (1.0 - alphaDisk);

                if (transmittance < 0.005) break;
            }
        }

        s = sNext;
        phiCoord += dl * (L / max(0.01, 1.0 - sNext.y * sNext.y));
    }

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

    // Deep pitch-black space background + HDR scene + selective bloom
    vec3 spaceBase = vec3(0.0);

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
