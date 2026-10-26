/**
 * blackhole-shaders.js
 *
 * GLSL ES 3.00 shader sources for the Kerr black hole ray tracer.
 * Renders null geodesics and Novikov–Thorne thin accretion disk to an RGBA16F framebuffer.
 *
 * Conventions:
 *   - Units: G = c = M = 1.
 *   - Coordinates: Boyer–Lindquist (t, r, θ, φ).
 *   - Spin axis: +y.
 *   - Accretion disk: equatorial plane θ = π/2, prograde.
 */

'use strict';

((root) => {
    const VS_QUAD = `#version 300 es
in vec2 aPosition;
out vec2 vUV;

void main() {
    vUV = aPosition * 0.5 + 0.5;
    gl_Position = vec4(aPosition, 0.0, 1.0);
}
`;

    const FS_KERR_MARCH = `#version 300 es
precision highp float;
precision highp int;

in vec2 vUV;
out vec4 fragColor;

uniform vec2 uRes;
uniform float uTime;
uniform float uSpin;          // Kerr spin parameter a in [0, 0.998]
uniform float uTilt;          // Observer polar angle θ_obs in [0.05, π - 0.05]
uniform float uCamDist;       // Observer distance r_obs (default ≥ 50.0)
uniform float uFovScale;      // Screen impact parameter scale
uniform float uOriginShiftX;  // Horizontal camera origin shift (positive moves black hole right)
uniform float uRout;          // Outer disk radius (default 25.0)
uniform float uDiskOpacity;   // Accretion disk opacity (default 0.85)
uniform int uMaxSteps;        // Maximum geodesic integration steps
uniform float uEpsHorizon;    // Horizon capture margin ε (default 0.02)
uniform float uExposure;      // Exposure multiplier
uniform vec3 uAccent;         // UI accent colour
uniform vec2 uJitter;         // Sub-pixel Halton jitter in pixels
uniform int uDebugMode;       // 0: Normal, 1: Hamiltonian error, 2: Crossing order, 3: g-factor, 4: Hit radius

// Accretion disk physics parameters computed on CPU & sampled from LUT
uniform sampler2D uDiskLUT;   // 1-D LUT: R = F/Fmax, G = Ω, B = u^t, A = (F/Fmax)^0.25
uniform samplerCube uSkyCube; // Procedural RGBA16F starfield cubemap
uniform int uMode;            // 0 = physical (g^4), 1 = cinematic (scaled g factor)
uniform int uDiskType;        // 0 = thin (equatorial), 1 = volumetric (Gaussian H/R)
uniform float uDiskH;         // Volumetric scale height H/R (default 0.05)
uniform float uTpeak;         // Peak disk temperature in Kelvin (default 8500 K)
uniform float uRplus;         // Event horizon r_+ = 1 + √(1 - a²)
uniform float uRisco;         // ISCO radius r_isco

// Tanner Helland blackbody approximation
vec3 blackbody(float T) {
    float t = clamp(T, 1000.0, 40000.0) * 0.01;
    float tA = max(t - 60.0, 1.0);
    float tB = max(t - 10.0, 1.0);
    vec3 c;
    c.r = t <= 66.0 ? 1.0 : clamp(329.698727 * pow(tA, -0.1332047592) / 255.0, 0.0, 1.0);
    c.g = t <= 66.0
        ? clamp((99.4708025861 * log(t) - 161.1195681661) / 255.0, 0.0, 1.0)
        : clamp(288.1221695283 * pow(tA, -0.0755148492) / 255.0, 0.0, 1.0);
    c.b = t >= 66.0 ? 1.0 : (t <= 19.0 ? 0.0 : clamp((138.5177312231 * log(tB) - 305.0447927307) / 255.0, 0.0, 1.0));
    return c;
}

// Procedural hash and 2D value noise for disk turbulence
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

// Continuous multi-octave plasma turbulence with differential Keplerian shear & advected hot spots
float diskTurbulence(float r, float phiCorot) {
    // 1. Keplerian differential shear stretches disturbances into tightly wound logarithmic spirals
    float shear = 2.4 * log(max(1.0, r));
    float spiralAngle = phiCorot + shear;
    vec2 pDisk = vec2(cos(spiralAngle), sin(spiralAngle)) * (r * 0.55);

    // 2. 4-octave fractal noise
    float n1 = noise2D(pDisk * 1.6);
    float n2 = noise2D(pDisk * 3.6 + vec2(1.7, 3.2));
    float n3 = noise2D(pDisk * 8.2 + vec2(4.1, 0.9));
    float n4 = noise2D(pDisk * 17.5 + vec2(2.3, 5.7));
    float fbm = 0.48 * n1 + 0.28 * n2 + 0.16 * n3 + 0.08 * n4;

    // 3. Concentric density ripples
    float ripples = 0.82 + 0.18 * sin(r * 4.2 + 2.5 * fbm);

    // 4. Lensed & Doppler-boosted advected hot spots orbiting inside the tracer
    float spot1 = exp(-pow(length(vec2(cos(phiCorot - 0.4), sin(phiCorot - 0.4)) * r - vec2(2.8, 0.0)), 2.0) * 1.8);
    float spot2 = exp(-pow(length(vec2(cos(phiCorot - 2.6), sin(phiCorot - 2.6)) * r - vec2(4.2, 0.0)), 2.0) * 1.4);
    float spot3 = exp(-pow(length(vec2(cos(phiCorot - 4.8), sin(phiCorot - 4.8)) * r - vec2(6.5, 0.0)), 2.0) * 0.9);
    float hotSpots = 1.0 + 1.4 * spot1 + 0.9 * spot2 + 0.7 * spot3;

    return clamp((0.35 + 1.25 * fbm) * ripples * hotSpots, 0.15, 3.5);
}

// Canonical equations of motion in Boyer–Lindquist coordinates using Carter's
// polynomial formulation in u = cos(θ). Free of coordinate singularities at the
// polar axis (u = ±1), and exactly conserves Carter's constant Q along the trajectory.
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

    // Coordinate velocities dr/dλ, du/dλ and canonical forces dp_r/dλ, dp_u/dλ
    float dr = del * pr * invSig;
    float du = pu * invSig;
    float dpr = (2.0 * r * pOverDel - (r - 1.0) * (pr * pr + pOverDel * pOverDel)) * invSig;
    float dpu = (c1 * u + c2 * u * u * u) * invSig;

    ds = vec4(dr, du, dpr, dpu);
}

// Evaluates local disk emission, Doppler shift, corotating turbulence, and blackbody colour
void sampleDiskEmission(float r, float phi, float t, float L, out vec3 outCol, out float outIntensity, out float outG) {
    float uCoord = clamp((r - uRisco) / (uRout - uRisco), 0.0, 1.0);
    vec4 lut = texture(uDiskLUT, vec2(uCoord, 0.5));
    float normF = lut.r;
    float omega = lut.g;
    float ut = lut.b;
    float tempScale = lut.a;

    // Relativistic redshift and Doppler factor g = 1 / (u^t * (1 - Ω * L))
    float factor = ut * (1.0 - omega * L);
    float g = factor > 1e-5 ? clamp(1.0 / factor, 0.05, 10.0) : 0.0;
    outG = g;

    // Mode: physical (0) vs cinematic (1)
    float gBoost = pow(g, 4.0);
    float gTemp = g;
    if (uMode == 1) {
        // Cinematic mode: scale g toward 1 (as in Interstellar) to preserve visible receding side
        float gEff = pow(max(1e-4, g), 0.40);
        gBoost = gEff * gEff * gEff * gEff;
        gTemp = pow(max(1e-4, g), 0.65);
    }

    // Corotating coordinates φ - Ω(r) * t_emit (differential Keplerian rotation + retardation)
    float phiCorot = phi - omega * (uTime - t);
    float turb = diskTurbulence(r, phiCorot);

    // Temperature: T_em ∝ F^(1/4), T_obs = T_em * g
    float Tem = max(1200.0, uTpeak * tempScale);
    float Tobs = Tem * gTemp;

    vec3 c = blackbody(Tobs);
    // Artistically scaled Planckian tone: deep rich burnt orange-brown below 3500 K, pristine white-blue at high temp
    if (Tobs < 3500.0) {
        float warmRamp = clamp((Tobs - 1000.0) / 2500.0, 0.0, 1.0);
        c = mix(vec3(0.55, 0.12, 0.02), c, warmRamp);
    }
    outCol = c;
    outIntensity = 3.6 * normF * turb * gBoost;
}

void main() {
    // Screen impact parameters (α, β) with sub-pixel Halton jitter
    vec2 pScreen = ((gl_FragCoord.xy + uJitter) - vec2(0.5 * uRes.x + uOriginShiftX * uRes.x, 0.5 * uRes.y)) / uRes.y;
    float alpha = pScreen.x * uFovScale;
    float beta = pScreen.y * uFovScale;

    // Observer setup: clamp θ_obs to [0.05, π - 0.05]
    float thetaObs = clamp(uTilt, 0.05, 3.14159265 - 0.05);
    float sinObs = sin(thetaObs);
    float cosObs = cos(thetaObs);

    // Bardeen initialisation
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
    float tEmit = 0.0;
    float phiEmit = 0.0;

    // Line-of-sight unit vectors
    vec3 fwd = vec3(-sinObs, -cosObs, 0.0);
    vec3 up = vec3(-cosObs, sinObs, 0.0);
    vec3 right = vec3(0.0, 0.0, -1.0);
    vec3 straightSkyDir = normalize(fwd + 1.25 * (beta * up + alpha * right) / rObs);

    // Weak-field Kerr deflected background ray direction:
    // In the far field (b >= 5.5), Kerr deflection is smooth, analytic, and free
    // from polar coordinate singularities.
    float bImpact = max(1e-4, length(vec2(alpha, beta)));
    float thetaDefl = 4.0 / bImpact + 11.780972 / (bImpact * bImpact);
    float thetaKerr = (4.0 * a * sinObs) / (bImpact * bImpact);
    vec3 rScr = (beta * up + alpha * right) / bImpact;
    vec3 phiScr = (-alpha * up + beta * right) / bImpact;
    vec3 weakSkyDir = normalize(straightSkyDir - sin(thetaDefl) * rScr + sin(thetaKerr) * phiScr);
    vec3 skyDir = weakSkyDir;

    float r_plus = uRplus;
    float r_isco = uRisco;
    float r_out = uRout;
    float epsH = uEpsHorizon;

    // Screen-space bounding ellipse pre-check (maintains uniform control flow for dFdx/dFdy)
    float maxB = r_out + 2.2;
    float maxBeta = (r_out + 2.0) * abs(cosObs) + (uDiskType == 1 ? 11.0 : 8.5);
    bool escaped = (uDebugMode == 0) && (bImpact >= maxB || abs(beta) >= maxBeta);
    bool captured = false;

    vec3 emitColor = vec3(0.0);
    float transmittance = 1.0;
    int diskCrossings = 0;

    // Diagnostics telemetry
    float maxH = 0.0;
    float firstG = 0.0;
    float firstRHit = 0.0;

    for (int step = 0; step < uMaxSteps; step++) {
        if (escaped) break;
        float r = s.x;
        float u = s.y;

        // Hamiltonian conservation error |H|
        if (uDebugMode == 1 && r > r_plus) {
            float sig = r * r + a2 * u * u;
            float del = r * r - 2.0 * r + a2;
            float p = r * r + a2 - a * L;
            float Q_state = s.w * s.w - c1 * u * u - 0.5 * c2 * u * u * u * u;
            float twoSigH = del * s.z * s.z - (p * p) / del + Q_state + (L - a) * (L - a);
            float curH = abs(twoSigH / (2.0 * sig));
            maxH = max(maxH, curH);
        }

        // Horizon capture check: terminate when ray crosses absorbed threshold r < r_+(1+eps)
        if (r <= r_plus * (1.0 + epsH)) {
            captured = true;
            break;
        }

        // Fast weak-field outward escape check:
        // Any ray outside the multi-crossing region (b > 10.5) that is moving outward (pr > 0)
        // and moving away from the equatorial plane (u * pu >= 0) cannot hit the thin disk again.
        if (uDebugMode == 0 && uDiskType == 0 && bImpact > 10.5 && s.z > 0.0 && u * s.w >= 0.0) {
            escaped = true;
            break;
        }

        // Escape check: ray has turned around and escaped past the accretion disk
        if ((r >= 24.5 && s.z > 0.0 && step > 2) || (r >= rObs + 2.0 && s.z > 0.0)) {
            if (bImpact < 7.2) {
                float uEsc = clamp(s.y, -0.9998, 0.9998);
                float sigEsc = r * r + a2 * uEsc * uEsc;
                float delEsc = max(1e-5, r * r - 2.0 * r + a2);
                float pEsc = r * r + a2 - a * L;
                float sinThEsc = sqrt(max(1e-5, 1.0 - uEsc * uEsc));
                float drEsc = delEsc * s.z / sigEsc;
                float duEsc = s.w / sigEsc;
                float dpEsc = (L / max(1e-5, 1.0 - uEsc * uEsc) - a + (a * pEsc) / delEsc) / sigEsc;

                float d_rSinTh = drEsc * sinThEsc - (r * uEsc / max(0.04, sinThEsc)) * duEsc;
                float vx = d_rSinTh * cos(phiEmit) - (r * sinThEsc * dpEsc) * sin(phiEmit);
                float vy = drEsc * uEsc + r * duEsc;
                float vz = d_rSinTh * sin(phiEmit) + (r * sinThEsc * dpEsc) * cos(phiEmit);
                vec3 exactSkyDir = normalize(vec3(vx, vy, vz));

                float blend = smoothstep(5.4, 7.2, bImpact);
                if (abs(uEsc) > 0.80) blend = 1.0;
                skyDir = normalize(mix(exactSkyDir, weakSkyDir, blend));
            }
            escaped = true;
            break;
        }

        // Adaptive step size: large in flat exterior (r > r_out + 1.5), fine near horizon & photon sphere
        float distH = max(1e-4, r - r_plus);
        float dl = (r > r_out + 1.5 && uDebugMode == 0)
            ? min(6.0, (r - r_out) * 0.45 + 1.2)
            : clamp(0.12 * distH, 0.001, 2.5);
        if (abs(u) < 0.08 && r < 25.0) dl *= 0.65;

        // RK4 integration step for (r, u, pr, pu)
        vec4 k1s, k2s, k3s, k4s;
        stateDerivs(s, a, L, c1, c2, k1s);
        stateDerivs(s + 0.5 * dl * k1s, a, L, c1, c2, k2s);
        stateDerivs(s + 0.5 * dl * k2s, a, L, c1, c2, k3s);
        stateDerivs(s + dl * k3s, a, L, c1, c2, k4s);

        vec4 sNext = s + (dl / 6.0) * (k1s + 2.0 * k2s + 2.0 * k3s + k4s);

        // Midpoint quadrature for coordinate time t and exact Lorentzian-regularised φ near poles
        float rM = 0.5 * (r + sNext.x);
        float uM = clamp(0.5 * (u + sNext.y), -0.9999, 0.9999);
        float rM2 = rM * rM;
        float invSigM = 1.0 / (rM2 + a2 * uM * uM);
        float pOverDelM = (rM2 + a2 - a * L) / max(1e-5, rM2 - 2.0 * rM + a2);
        float oneMinusU2 = max(1e-6, 1.0 - uM * uM);
        float tNext = tEmit + dl * (a * (L - a * oneMinusU2) + (rM2 + a2) * pOverDelM) * invSigM;

        float dPhiSph;
        if (oneMinusU2 < 0.025) {
            // Exact analytic integral of L / (Σ * (1 - u²)) across polar turning point (|u| > 0.987)
            float numK = Q + L * L + a2 * uM * uM;
            float denK = max(1e-5, Q + L * L - a2 + 2.0 * a2 * uM * uM) * uM;
            dPhiSph = (numK / denK) * atan(L * (s.w - sNext.w), L * L + s.w * sNext.w);
        } else {
            dPhiSph = dl * (L / oneMinusU2) * invSigM;
        }
        float phiNext = phiEmit + dPhiSph + dl * a * (pOverDelM - 1.0) * invSigM;

        if (uDiskType == 0) {
            // -------------------------------------------------------------
            // THIN DISK: Equatorial crossing detection & multi-crossing accumulation
            // -------------------------------------------------------------
            float uPrev = s.y;
            float uNext = sNext.y;

            if (uPrev * uNext <= 0.0 && s.x > r_plus) {
                // Secant / linear bisection refinement of equatorial hit (u = 0)
                float frac = clamp(abs(uPrev) / max(1e-6, abs(uPrev) + abs(uNext)), 0.0, 1.0);
                vec4 sHit = mix(s, sNext, frac);
                float fracRefined = clamp(frac - sHit.y / max(1e-6, uPrev - uNext), 0.0, 1.0);
                sHit = mix(s, sNext, fracRefined);
                float rHit = sHit.x;

                if (rHit >= r_isco && rHit <= r_out && diskCrossings < 8) {
                    diskCrossings++;

                    float tHit = mix(tEmit, tNext, fracRefined);
                    float phiHit = mix(phiEmit, phiNext, fracRefined);

                    vec3 col; float intensity; float curG;
                    sampleDiskEmission(rHit, phiHit, tHit, L, col, intensity, curG);

                    if (diskCrossings == 1) {
                        firstG = curG;
                        firstRHit = rHit;
                    }

                    float alphaDisk = uDiskOpacity * smoothstep(r_out, r_out * 0.75, rHit);
                    // For higher-order crossings (n >= 2), the photon ring is thin and crisp
                    if (diskCrossings > 1) {
                        alphaDisk = min(alphaDisk, 0.70);
                    }
                    emitColor += transmittance * alphaDisk * col * intensity;
                    transmittance *= (1.0 - alphaDisk);

                    if (transmittance < 0.005 && uDebugMode == 0) {
                        escaped = true;
                        break;
                    }
                }
            }

                    if (diskCrossings == 1) {
                        firstG = curG;
                        firstRHit = rHit;
                    }

                    float alphaDisk = uDiskOpacity * smoothstep(r_out, r_out * 0.75, rHit);
                    emitColor += transmittance * alphaDisk * col * intensity;
                    transmittance *= (1.0 - alphaDisk);

                    // Rays with b > 10.5 can never wrap around for a 2nd disk hit
                    if ((transmittance < 0.01 || bImpact > 10.5) && uDebugMode == 0) {
                        escaped = true;
                        break;
                    }
                }
            }
        } else {
            // -------------------------------------------------------------
            // VOLUMETRIC DISK: Gaussian vertical profile H/R in [0.03, 0.08]
            // -------------------------------------------------------------
            float rAvg = 0.5 * (s.x + sNext.x);
            if (rAvg >= r_isco && rAvg <= r_out) {
                float uNorm = abs(sNext.y) / max(1e-4, uDiskH);
                if (uNorm < 3.0) {
                    float profile = exp(-0.5 * uNorm * uNorm);
                    vec3 col; float intensity; float curG;
                    sampleDiskEmission(rAvg, phiNext, tNext, L, col, intensity, curG);

                    if (diskCrossings == 0) {
                        firstG = curG;
                        firstRHit = rAvg;
                        diskCrossings = 1;
                    }

                    float dAlpha = 1.0 - exp(-3.0 * profile * dl);
                    emitColor += transmittance * dAlpha * col * intensity;
                    transmittance *= (1.0 - dAlpha);

                    if (transmittance < 0.01 && uDebugMode == 0) {
                        escaped = true;
                        break;
                    }
                }
            }
        }

        s = sNext;
        tEmit = tNext;
        phiEmit = phiNext;
    }

    // If ray is moving outward in weak field when step cap was reached, it has escaped
    if (!escaped && !captured && s.z > 0.0 && s.x > 15.0) {
        float rEsc = s.x;
        float uEsc = clamp(s.y, -0.9998, 0.9998);
        float sigEsc = rEsc * rEsc + a * a * uEsc * uEsc;
        float delEsc = rEsc * rEsc - 2.0 * rEsc + a * a;
        float pEsc = rEsc * rEsc + a * a - a * L;
        float sinThEsc = sqrt(max(1e-5, 1.0 - uEsc * uEsc));
        float drEsc = delEsc * s.z / sigEsc;
        float duEsc = s.w / sigEsc;
        float dpEsc = (L / max(1e-5, 1.0 - uEsc * uEsc) - a + (a * pEsc) / delEsc) / sigEsc;

        float d_rSinTh = drEsc * sinThEsc - (rEsc * uEsc / max(0.04, sinThEsc)) * duEsc;
        float vx = d_rSinTh * cos(phiEmit) - (rEsc * sinThEsc * dpEsc) * sin(phiEmit);
        float vy = drEsc * uEsc + rEsc * duEsc;
        float vz = d_rSinTh * sin(phiEmit) + (rEsc * sinThEsc * dpEsc) * cos(phiEmit);
        vec3 exactSkyDir = normalize(vec3(vx, vy, vz));

        float blend = smoothstep(5.4, 7.2, bImpact);
        if (abs(uEsc) > 0.80) blend = 1.0;
        skyDir = normalize(mix(exactSkyDir, weakSkyDir, blend));
        escaped = true;
    }

    // Diagnostics Views (Telemetry Modes 1 to 4)
    if (uDebugMode == 1) {
        // Mode 1: Hamiltonian error |H|
        // Logarithmic scale: 1e-7 to 1e-3
        float logH = log(max(1e-9, maxH)) / 2.302585;
        float tH = clamp((logH + 7.0) / 4.0, 0.0, 1.0);
        vec3 colH;
        if (tH < 0.33) colH = mix(vec3(0.02, 0.10, 0.50), vec3(0.00, 0.70, 0.80), tH * 3.0);
        else if (tH < 0.66) colH = mix(vec3(0.00, 0.70, 0.80), vec3(0.85, 0.90, 0.10), (tH - 0.33) * 3.0);
        else colH = mix(vec3(0.85, 0.90, 0.10), vec3(1.00, 0.10, 0.05), (tH - 0.66) * 3.0);
        fragColor = vec4(colH, 1.0);
        return;
    }
    if (uDebugMode == 2) {
        // Mode 2: Equatorial crossing order
        vec3 colOrder = vec3(0.02);
        if (diskCrossings == 1) colOrder = vec3(0.15, 0.45, 0.95);      // Primary (blue)
        else if (diskCrossings == 2) colOrder = vec3(0.15, 0.85, 0.35); // Secondary (green)
        else if (diskCrossings == 3) colOrder = vec3(0.95, 0.75, 0.10); // Tertiary (yellow)
        else if (diskCrossings >= 4) colOrder = vec3(0.95, 0.20, 0.15); // Quaternary+ (red)
        if (captured && diskCrossings == 0) colOrder = vec3(0.0);
        fragColor = vec4(colOrder, 1.0);
        return;
    }
    if (uDebugMode == 3) {
        // Mode 3: Relativistic redshift & Doppler g-factor
        vec3 colG = vec3(0.03);
        if (diskCrossings > 0) {
            float gVal = clamp(firstG, 0.2, 2.5);
            if (gVal < 1.0) {
                float tRed = (gVal - 0.2) / 0.8;
                colG = mix(vec3(0.85, 0.05, 0.05), vec3(0.98, 0.90, 0.25), tRed);
            } else {
                float tBlue = clamp((gVal - 1.0) / 1.5, 0.0, 1.0);
                colG = mix(vec3(0.98, 0.90, 0.25), vec3(0.15, 0.65, 1.00), tBlue);
            }
        }
        fragColor = vec4(colG, 1.0);
        return;
    }
    if (uDebugMode == 4) {
        // Mode 4: Disk hit radius r_hit ∈ [r_isco, r_out]
        vec3 colR = vec3(0.03);
        if (diskCrossings > 0) {
            float rNorm = clamp((firstRHit - uRisco) / (uRout - uRisco), 0.0, 1.0);
            vec3 ramp = mix(vec3(1.0, 0.85, 0.20), vec3(0.35, 0.05, 0.55), rNorm);
            float ring = 0.85 + 0.15 * cos(firstRHit * 6.283185);
            colR = ramp * ring;
        }
        fragColor = vec4(colR, 1.0);
        return;
    }

    // Ray-bundle Jacobian finite-difference magnification:
    // Near the photon sphere and shadow boundary, ray bundle cross section shrinks,
    // magnifying background starlight and generating Einstein arcs and double images.
    vec3 dDirX = dFdx(skyDir);
    vec3 dDirY = dFdy(skyDir);
    float bundleArea = max(1e-7, length(cross(dDirX, dDirY)));
    float mu = clamp(0.00018 / bundleArea, 0.45, 4.5);
    vec3 gradX = clamp(dDirX, vec3(-0.015), vec3(0.015));
    vec3 gradY = clamp(dDirY, vec3(-0.015), vec3(0.015));
    vec3 bgSky = textureGrad(uSkyCube, skyDir, gradX, gradY).rgb * mu;

    // Rays captured by the event horizon are completely dark if not occluded by the foreground disk
    if (captured || !escaped) {
        bgSky = vec3(0.0);
    }

    vec3 finalHdr = emitColor + bgSky * transmittance;
    fragColor = vec4(finalHdr, 1.0);
}
`;

    // -------------------------------------------------------------------------
    // POST-PROCESSING PIPELINE (TAA, Dual-Kawase Bloom, Filmic Tonemapping)
    // -------------------------------------------------------------------------

    // Temporal Anti-Aliasing (TAA) Ping-Pong Accumulation
    const FS_ACCUM = `#version 300 es
precision highp float;

in vec2 vUV;
out vec4 fragColor;

uniform sampler2D uCurrent;
uniform sampler2D uHistory;
uniform float uBlend; // 1.0 / (N + 1.0)

void main() {
    vec4 current = texture(uCurrent, vUV);
    vec4 history = texture(uHistory, vUV);
    fragColor = mix(history, current, uBlend);
}
`;

    // Dual-Kawase Bloom Downsampling Pass
    const FS_BLOOM_DOWN = `#version 300 es
precision highp float;

in vec2 vUV;
out vec4 fragColor;

uniform sampler2D uTexture;
uniform vec2 uTexelSize;
uniform int uFirstPass;
uniform float uThreshold;

// Soft-knee brightness extraction
vec3 prefilter(vec3 c) {
    float brightness = max(c.r, max(c.g, c.b));
    float knee = 0.5;
    float soft = clamp((brightness - uThreshold + knee) / (2.0 * knee), 0.0, 1.0);
    return c * (soft * soft);
}

void main() {
    vec2 halfpixel = uTexelSize * 0.5;
    vec3 sum = texture(uTexture, vUV).rgb * 4.0;
    sum += texture(uTexture, vUV - halfpixel).rgb;
    sum += texture(uTexture, vUV + halfpixel).rgb;
    sum += texture(uTexture, vUV + vec2(halfpixel.x, -halfpixel.y)).rgb;
    sum += texture(uTexture, vUV + vec2(-halfpixel.x, halfpixel.y)).rgb;
    vec3 col = sum / 8.0;

    if (uFirstPass == 1) {
        col = prefilter(col);
    }
    fragColor = vec4(col, 1.0);
}
`;

    // Dual-Kawase Bloom Upsampling Pass
    const FS_BLOOM_UP = `#version 300 es
precision highp float;

in vec2 vUV;
out vec4 fragColor;

uniform sampler2D uSmall;
uniform vec2 uTexelSize;

void main() {
    vec2 d = uTexelSize;
    vec3 sum = vec3(0.0);
    sum += texture(uSmall, vUV + vec2(-d.x * 2.0, 0.0)).rgb;
    sum += texture(uSmall, vUV + vec2(-d.x, d.y)).rgb * 2.0;
    sum += texture(uSmall, vUV + vec2(0.0, d.y * 2.0)).rgb;
    sum += texture(uSmall, vUV + vec2(d.x, d.y)).rgb * 2.0;
    sum += texture(uSmall, vUV + vec2(d.x * 2.0, 0.0)).rgb;
    sum += texture(uSmall, vUV + vec2(d.x, -d.y)).rgb * 2.0;
    sum += texture(uSmall, vUV + vec2(0.0, -d.y * 2.0)).rgb;
    sum += texture(uSmall, vUV + vec2(-d.x, -d.y)).rgb * 2.0;
    fragColor = vec4(sum / 12.0, 1.0);
}
`;

    // Filmic Composition, Tonemapping, Subtle Vignette and Film Grain
    const FS_COMPOSE = `#version 300 es
precision highp float;

in vec2 vUV;
out vec4 fragColor;

uniform sampler2D uRayTarget;
uniform sampler2D uBloomTarget;
uniform float uBloomIntensity;
uniform float uExposure;
uniform float uTime;
uniform vec2 uRes;
uniform int uDebugMode;

// ACES filmic tonemapping
vec3 aces(vec3 x) {
    const float a = 2.51;
    const float b = 0.03;
    const float c = 2.43;
    const float d = 0.59;
    const float e = 0.14;
    return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
}

// Procedural hash for subtle film grain
float hashGrain(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
}

void main() {
    // Bypass post-processing in debug modes to show exact false-colour telemetry
    if (uDebugMode > 0) {
        vec4 raw = texture(uRayTarget, vUV);
        fragColor = vec4(raw.rgb, 1.0);
        return;
    }

    // 1. Very light chromatic aberration at the edges (radial split)
    vec2 uvDist = vUV - 0.5;
    float r2 = dot(uvDist, uvDist);
    vec2 caOffset = uvDist * (0.0032 * r2);
    vec3 rawRgb;
    rawRgb.r = texture(uRayTarget, vUV - caOffset).r;
    rawRgb.g = texture(uRayTarget, vUV).g;
    rawRgb.b = texture(uRayTarget, vUV + caOffset).b;

    // 2. Dual-Kawase Bloom with subtle lens glare on the brightest points only
    vec3 bloom = texture(uBloomTarget, vUV).rgb;
    float peak = max(rawRgb.r, max(rawRgb.g, rawRgb.b));
    float glare = max(0.0, peak - 2.8) * 0.10;
    vec3 hdr = rawRgb + bloom * uBloomIntensity + vec3(glare * 0.75, glare * 0.88, glare * 1.05);

    // 3. Gentle exposure adaptation & subtle corner vignette
    hdr *= uExposure;
    float vig = clamp(1.0 - 0.32 * r2, 0.0, 1.0);
    hdr *= vig;

    // 4. Filmic tonemapping (ACES)
    vec3 mapped = aces(hdr);

    // 5. sRGB gamma 2.2
    vec3 finalRGB = pow(mapped, vec3(1.0 / 2.2));

    // 6. Subtle film grain (<= 1.6%) weighted by luminance so pitch-black space remains pure #000000
    float luma = dot(finalRGB, vec3(0.2126, 0.7152, 0.0722));
    float grain = (hashGrain(vUV * uRes + fract(uTime * 19.3)) - 0.5) * 0.015 * smoothstep(0.01, 0.25, luma);

    // 7. Spatial gradient dithering to eliminate banding in dark gradients
    float dither = (hashGrain(vUV * uRes + vec2(1.23, 4.56)) - 0.5) / 255.0;

    finalRGB = clamp(finalRGB + grain + dither, 0.0, 1.0);
    fragColor = vec4(finalRGB, 1.0);
}
`;

    const FS_BLIT = FS_COMPOSE;

    const api = {
        VS_QUAD,
        FS_KERR_MARCH,
        FS_ACCUM,
        FS_BLOOM_DOWN,
        FS_BLOOM_UP,
        FS_COMPOSE,
        FS_BLIT
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (typeof root !== 'undefined') {
        root.BLACKHOLE_SHADERS = api;
    }
})(typeof window !== 'undefined' ? window : globalThis);
