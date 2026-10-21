/**
 * gpu-quant-singularity-shaders.js
 *
 * WebGL2 (GLSL ES 3.00) shader sources for The Market Singularity (Quant Finance Hero).
 * Renders a full-screen ray-marched Kerr spacetime financial black hole with
 * relativistic accretion disk, Breeden–Litzenberger risk-neutral radiance profile,
 * Doppler beaming (I ∝ g⁴), photon ring caustics, and gravitationally lensed
 * financial coordinate constellations.
 *
 * Conventions:
 *   - Units: G = c = M = 1 (geometrised market units).
 *   - Coordinates: Boyer–Lindquist with Carter u = cos(θ) formulation.
 *   - Spin axis: +y.
 *   - Accretion disk: equatorial plane u = 0, prograde.
 */

(function (root, factory) {
    if (typeof module === "object" && module.exports) {
        module.exports = factory();
    } else {
        root.QuantSingularityShaders = factory();
    }
}(typeof self !== "undefined" ? self : this, function () {
    "use strict";

    const VS_QUAD = `#version 300 es
layout(location = 0) in vec2 aPosition;
out vec2 vUV;
void main() {
    vUV = aPosition * 0.5 + 0.5;
    gl_Position = vec4(aPosition, 0.0, 1.0);
}`;

    const FS_MARKET_SINGULARITY = `#version 300 es
precision highp float;
precision highp int;

in vec2 vUV;
out vec4 fragColor;

uniform vec2 uRes;
uniform float uTime;
uniform float uSpin;           // Kerr spin parameter a in [-0.96, 0.96] (Order Flow Imbalance)
uniform float uTilt;           // Observer polar angle θ_obs in [0.05, π - 0.05]
uniform float uCamDist;        // Observer distance r_obs (default 36.0)
uniform float uFovScale;       // Screen impact parameter scale
uniform float uRout;           // Outer disk radius (default 26.0)
uniform int uMaxSteps;         // Maximum geodesic integration steps (adaptive: 90 to 200)
uniform vec3 uAccent;          // Quant domain emerald accent rgb(32, 201, 145)
uniform float uLightMode;      // 0.0 for dark mode, 1.0 for light mode
uniform float uShockTime;      // Time elapsed since last click volatility shock

// Procedural hash and noise for order-flow filament turbulence
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

// Relativistic capital flow filaments and logarithmic market spiral
float capitalTurbulence(float r, float phiCorot) {
    float angle = phiCorot + 1.45 * log(max(1.0, r));
    vec2 pDisk = vec2(cos(angle), sin(angle)) * (r * 0.42);
    float n1 = noise2D(pDisk * 2.2);
    float n2 = noise2D(pDisk * 4.6 + vec2(1.7, 3.2));
    float n3 = noise2D(pDisk * 9.5 + vec2(4.1, 0.9));
    float turb = 0.52 * n1 + 0.32 * n2 + 0.16 * n3;

    // Concentric order book liquidity bands
    float rings = 0.72 + 0.28 * sin(r * 2.8 + 1.2 * n1);
    return clamp((0.45 + 1.2 * turb) * rings, 0.15, 2.6);
}

// Carter polynomial state derivatives in u = cos(θ) coordinates
void stateDerivs(vec4 s, float a, float L, float c1, float c2, out vec4 ds) {
    float r = s.x;
    float u = clamp(s.y, -0.9998, 0.9998);
    float pr = s.z;
    float pu = s.w;

    float r2 = r * r;
    float a2 = a * a;
    float invSig = 1.0 / (r2 + a2 * u * u);
    float del = r2 - 2.0 * r + a2;
    float pOverDel = (r2 + a2 - a * L) / del;

    float dr = del * pr * invSig;
    float du = pu * invSig;
    float dpr = (2.0 * r * pOverDel - (r - 1.0) * (pr * pr + pOverDel * pOverDel)) * invSig;
    float dpu = (c1 * u + c2 * u * u * u) * invSig;

    ds = vec4(dr, du, dpr, dpu);
}

// Background financial coordinate grid & lensed ticker constellations
vec3 sampleLensedFinancialSky(vec3 skyDir) {
    vec3 col = vec3(0.0);

    // Coordinate grid lines in hyperbolic financial coordinates
    vec2 polar = vec2(atan(skyDir.z, skyDir.x), asin(clamp(skyDir.y, -1.0, 1.0)));
    vec2 gridUV = fract(polar * vec2(4.7746, 7.6394)); // 15 and 24 divisions
    vec2 gridLine = smoothstep(0.04, 0.005, abs(gridUV - 0.5));
    float grid = max(gridLine.x, gridLine.y) * 0.08;

    // Faint lensed market stars / asset tickers
    float starHash = hash2D(floor(polar * 32.0));
    float star = 0.0;
    if (starHash > 0.982) {
        vec2 starFrac = fract(polar * 32.0) - 0.5;
        star = smoothstep(0.18, 0.02, length(starFrac)) * 0.65;
    }

    col += uAccent * (grid * 0.45) + vec3(0.7, 0.9, 1.0) * star;
    return col;
}

// Color palette mapping Doppler boost factor g and radius to radiant hue
vec3 marketSpectralColor(float g, float r, float rIsco) {
    // Approaching side (g > 1): Shift from Quant emerald into brilliant high-energy cyan & diamond white
    // Receding side (g < 1): Gravitational redshift into warm gold, amber, and deep orange
    vec3 colCyan = vec3(0.42, 0.95, 1.0);
    vec3 colEmerald = uAccent * 1.35;
    vec3 colGold = vec3(1.0, 0.72, 0.25);
    vec3 colAmber = vec3(0.85, 0.32, 0.08);

    vec3 c = colEmerald;
    if (g >= 1.0) {
        float t = clamp((g - 1.0) / 1.6, 0.0, 1.0);
        c = mix(colEmerald, colCyan, t);
        if (g > 2.0) {
            c = mix(c, vec3(1.0, 1.0, 1.0), clamp((g - 2.0) / 1.5, 0.0, 0.8));
        }
    } else {
        float t = clamp((1.0 - g) / 0.65, 0.0, 1.0);
        c = mix(colEmerald, colGold, t);
        if (g < 0.6) {
            c = mix(c, colAmber, clamp((0.6 - g) / 0.35, 0.0, 1.0));
        }
    }

    // Near-horizon Gamma singularity caustic: razor-sharp emerald-white rim
    float innerRim = smoothstep(rIsco + 0.8, rIsco + 0.05, r);
    c = mix(c, vec3(0.95, 1.0, 0.98), innerRim * 0.75);

    return c;
}

void main() {
    vec2 pScreen = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y;
    float alpha = pScreen.x * uFovScale;
    float beta = pScreen.y * uFovScale;

    float thetaObs = clamp(uTilt, 0.05, 3.14159265 - 0.05);
    float sinObs = sin(thetaObs);
    float cosObs = cos(thetaObs);

    float a = uSpin;
    float a2 = a * a;
    float L = -alpha * sinObs;
    float Q = beta * beta + (alpha * alpha - a2) * cosObs * cosObs;
    float c1 = -(Q + L * L - a2);
    float c2 = -2.0 * a2;

    float rObs = uCamDist;
    float delObs = rObs * rObs - 2.0 * rObs + a2;
    float pObs = rObs * rObs + a2 - a * L;
    float rad = max(0.0, (pObs * pObs) / delObs - (Q + (L - a) * (L - a)));
    float prObs = -sqrt(rad / delObs);
    float puObs = sinObs * beta;

    vec4 s = vec4(rObs, cosObs, prObs, puObs);

    // Horizon radius r_+ and ISCO radius r_isco
    float rPlus = 1.0 + sqrt(max(0.0, 1.0 - a2));
    
    // Bardeen ISCO approximation in shader
    float absA = clamp(abs(a), 0.0, 0.999);
    float z1 = 1.0 + pow(1.0 - a2, 0.33333) * (pow(1.0 + absA, 0.33333) + pow(max(0.0, 1.0 - absA), 0.33333));
    float z2 = sqrt(3.0 * a2 + z1 * z1);
    float iscoSign = a >= 0.0 ? -1.0 : 1.0;
    float rIsco = 3.0 + z2 + iscoSign * sqrt(max(0.0, (3.0 - z1) * (3.0 + z1 + 2.0 * z2)));

    // Volatility shock pulse parameters
    float shockDist = uShockTime * 5.5;
    float shockDecay = exp(-uShockTime * 0.95);

    vec3 accumCol = vec3(0.0);
    float accumAlpha = 0.0;
    bool hitHorizon = false;

    // RK4 null geodesic ray march
    int maxSteps = uMaxSteps;
    for (int step = 0; step < 220; step++) {
        if (step >= maxSteps) break;

        if (s.x <= rPlus + 0.025) {
            hitHorizon = true;
            break;
        }
        if (s.x >= rObs + 4.0 && s.z > 0.0) {
            break;
        }

        float distH = max(0.001, s.x - rPlus);
        float ds = max(0.012, min(0.24, 0.038 * distH + 0.018));

        // RK4 step
        vec4 k1, k2, k3, k4;
        stateDerivs(s, a, L, c1, c2, k1);
        stateDerivs(s + 0.5 * ds * k1, a, L, c1, c2, k2);
        stateDerivs(s + 0.5 * ds * k2, a, L, c1, c2, k3);
        stateDerivs(s + ds * k3, a, L, c1, c2, k4);

        vec4 sNext = s + (ds / 6.0) * (k1 + 2.0 * k2 + 2.0 * k3 + k4);

        // Equatorial disk crossing detection: u crosses 0
        if (s.y * sNext.y <= 0.0 && s.x > rPlus) {
            float frac = abs(s.y) / max(1e-6, abs(s.y - sNext.y));
            float hitR = s.x + (sNext.x - s.x) * frac;

            if (hitR >= rIsco && hitR <= uRout) {
                // Keplerian velocity and relativistic redshift
                float omega = 1.0 / (pow(hitR, 1.5) + a);
                float utDenom = 1.0 - 3.0 / hitR + 2.0 * a / pow(hitR, 1.5);
                float ut = utDenom > 1e-4 ? 1.0 / sqrt(utDenom) : 1.0;
                float gFactor = ut * (1.0 - omega * L);
                float g = gFactor > 1e-4 ? clamp(1.0 / gFactor, 0.05, 8.0) : 0.0;

                // Breeden–Litzenberger & Novikov–Thorne flux with Black–Scholes Gamma spike
                float sqrtR = sqrt(hitR);
                float sqrtIsco = sqrt(rIsco);
                float fZeroTorque = max(0.0, 1.0 - sqrt(sqrtIsco / sqrtR));
                float fluxNT = pow(hitR, -3.0) * fZeroTorque * 12.0;

                // Black–Scholes Gamma caustic peak
                float d1Equiv = (hitR - rIsco) * 0.45;
                float gammaPeak = exp(-0.5 * d1Equiv * d1Equiv) * 4.2;

                // Relativistic capital turbulence
                float phiCorot = atan(beta, alpha) - omega * (uTime * 1.8);
                float turb = capitalTurbulence(hitR, phiCorot);

                // Volatility shock blast wave
                float blast = 0.0;
                if (uShockTime > 0.0) {
                    float dR = hitR - shockDist;
                    blast = exp(-dR * dR * 0.5) * shockDecay * 3.5;
                }

                // Liouville beaming I_obs = g^4 * I_emit
                float gBoost = pow(g, 3.8);
                float intensity = (fluxNT * (1.0 + gammaPeak) + blast) * turb * gBoost;

                vec3 diskCol = marketSpectralColor(g, hitR, rIsco);
                float opticalDepth = clamp(intensity * 0.75, 0.0, 1.0);

                accumCol += (1.0 - accumAlpha) * diskCol * intensity * 1.8;
                accumAlpha += (1.0 - accumAlpha) * opticalDepth;

                if (accumAlpha >= 0.97) break;
            }
        }

        s = sNext;
    }

    vec3 finalCol = accumCol;

    // Horizon interior is strictly pitch black (no radiation escapes)
    if (hitHorizon && accumAlpha < 0.95) {
        finalCol = mix(vec3(0.0), finalCol, accumAlpha);
    } else if (!hitHorizon && accumAlpha < 0.95) {
        // Escaping ray samples gravitationally lensed celestial market coordinates
        vec3 fwd = vec3(-sinObs, -cosObs, 0.0);
        vec3 up = vec3(-cosObs, sinObs, 0.0);
        vec3 right = vec3(0.0, 0.0, -1.0);
        vec3 skyDir = normalize(fwd + 1.2 * (beta * up + alpha * right) / rObs);
        vec3 skyCol = sampleLensedFinancialSky(skyDir);
        finalCol += (1.0 - accumAlpha) * skyCol;
    }

    // Light mode compatibility: invert background if light mode requested
    if (uLightMode > 0.5) {
        finalCol = mix(vec3(0.96, 0.96, 0.95), 1.0 - finalCol, clamp(length(finalCol) * 0.8, 0.0, 1.0));
    }

    fragColor = vec4(finalCol, 1.0);
}`;

    return {
        VS_QUAD,
        FS_MARKET_SINGULARITY
    };
}));
