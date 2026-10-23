/* WebGL2 Shaders for Order Book Terrain (shared/gpu/gpu-lob-shaders.js).
   3-D Heightfield terrain with toroidal price columns, Hawkes ripple displacement,
   contour glow, glowing spread canyon, distance fog, meteors, and Hawkes intensity ribbon. */

(function (root, factory) {
    if (typeof module === "object" && module.exports) module.exports = factory();
    else root.LOB_SHADERS = factory();
}(typeof self !== "undefined" ? self : this, function () {
    "use strict";

    const VS_TERRAIN = `#version 300 es
layout(location = 0) in vec2 aGridPos; // x in [0, 1], z in [0, 1]

uniform sampler2D uHistory;
uniform float uGridW, uGridH;
uniform float uHeadRow;
uniform float uMidSmooth;
uniform float uPriceSpan;
uniform float uZSpan;
uniform float uHeightScale;
uniform mat4 uViewProj;
uniform vec3 uCameraPos;
uniform float uTime;

// Up to 48 recent Hawkes market orders: (strikePrice, eventTime, type, size)
uniform vec4 uRipples[48];
uniform int uNumRipples;

out vec3 vWorldPos;
out vec3 vNormal;
out float vHeight;
out float vSide;
out float vRippleGlow;
out float vDist;
out float vNormZ;

float sampleSignedH(float px, float r) {
    float col = mod(px, uGridW) / uGridW;
    float row = mod(r, uGridH) / uGridH;
    return texture(uHistory, vec2(col, row)).r;
}

void main() {
    float normX = aGridPos.x;
    float normZ = aGridPos.y; // 0 = front edge (present), 1 = far distance (past)
    vNormZ = normZ;

    float price = uMidSmooth + (normX - 0.5) * uPriceSpan;
    float row = uHeadRow - normZ * (uGridH - 1.0);

    // Height from history texture
    float sH = sampleSignedH(price, row);
    float baseH = abs(sH) * uHeightScale;
    float side = sign(sH);
    vSide = side;

    // Normal calculation via central differences
    float dP = uPriceSpan / uGridW;
    float dR = 1.0;
    float hL = abs(sampleSignedH(price - dP, row)) * uHeightScale;
    float hR = abs(sampleSignedH(price + dP, row)) * uHeightScale;
    float hD = abs(sampleSignedH(price, row - dR)) * uHeightScale;
    float hU = abs(sampleSignedH(price, row + dR)) * uHeightScale;

    // World coordinates: x across, y up (height), z into distance
    float worldX = (normX - 0.5) * 16.0;
    float worldZ = -normZ * uZSpan;

    // Hawkes ripple superposition
    float rippleDisp = 0.0;
    float rippleGlow = 0.0;

    for (int i = 0; i < 48; i++) {
        if (i >= uNumRipples) break;
        vec4 rip = uRipples[i];
        float ripStrike = rip.x;
        float ripTime = rip.y;
        float ripType = rip.z;
        float ripSize = rip.w;

        float tau = uTime - ripTime;
        if (tau > 0.0 && tau < 7.5) {
            // World distance from strike point at front edge (z = 0)
            float ripWorldX = ((ripStrike - uMidSmooth) / uPriceSpan) * 16.0;
            float distToStrike = length(vec2(worldX - ripWorldX, worldZ));

            // Wave speed c = 3.6 units/s
            float rWave = 3.6 * tau;
            float dr = distToStrike - rWave;
            float width = 0.45;

            // Gaussian wave envelope with Hawkes exponential decay
            float waveEnv = exp(- (dr * dr) / (2.0 * width * width));
            float amp = 0.35 * min(ripSize, 8.0) * exp(-2.0 * tau) * exp(-distToStrike * 0.15);

            rippleDisp += amp * waveEnv * sin(dr * 9.0);
            rippleGlow += amp * waveEnv * 2.5;
        }
    }

    float finalH = baseH + rippleDisp;
    vHeight = finalH;
    vRippleGlow = rippleGlow;

    vec3 worldPos = vec3(worldX, finalH - 0.85, worldZ);
    vWorldPos = worldPos;

    // Compute normal
    vec3 tx = vec3(16.0 / uGridW, hR - hL, 0.0);
    vec3 tz = vec3(0.0, hU - hD, -uZSpan / uGridH);
    vNormal = normalize(cross(tz, tx));

    vDist = length(uCameraPos - worldPos);
    gl_Position = uViewProj * vec4(worldPos, 1.0);
}`;

    const FS_TERRAIN = `#version 300 es
precision highp float;

in vec3 vWorldPos;
in vec3 vNormal;
in float vHeight;
in float vSide;
in float vRippleGlow;
in float vDist;
in float vNormZ;

uniform vec3 uAccent;
uniform vec3 uCameraPos;
uniform float uTime;

out vec4 fragColor;

void main() {
    vec3 N = normalize(vNormal);
    vec3 V = normalize(uCameraPos - vWorldPos);

    // Directional light from high angle
    vec3 L = normalize(vec3(0.4, 0.85, 0.35));
    float diff = max(dot(N, L), 0.0);

    // Fresnel rim
    float fresnel = pow(1.0 - max(dot(N, V), 0.0), 3.0);

    // Color palette based on domain accent
    // Cool emerald/cyan for bids (vSide < 0.0), warm gold/amber for asks (vSide > 0.0)
    vec3 bidCol = mix(uAccent, vec3(0.12, 0.82, 0.72), 0.45);
    vec3 askCol = mix(vec3(0.98, 0.58, 0.22), vec3(1.0, 0.38, 0.32), 0.40);

    vec3 baseCol = vSide < -0.1 ? bidCol : (vSide > 0.1 ? askCol : vec3(0.15, 0.16, 0.20));

    // Contour glow on ridges
    float ridge = pow(clamp(vHeight * 0.45, 0.0, 1.0), 1.6);
    vec3 col = baseCol * (0.28 + 0.65 * diff) + baseCol * ridge * 0.45;
    col += baseCol * fresnel * 0.55;

    // Glowing spread canyon where height is near zero between bid and ask
    if (abs(vSide) < 0.15 && vHeight < 0.12) {
        float canyonGlow = pow(1.0 - smoothstep(0.0, 0.15, vHeight), 2.0);
        col += mix(bidCol, askCol, 0.5) * canyonGlow * 1.8;
    }

    // Ripple emissive glow
    col += mix(vec3(0.4, 0.8, 1.0), vec3(1.0, 0.7, 0.3), max(vSide, 0.0)) * vRippleGlow;

    // Distance fog: fade into deep stage background
    vec3 bg = vec3(0.0);
    float fog = smoothstep(6.0, 19.0, vDist) * 0.92;
    col = mix(col, bg, fog);

    fragColor = vec4(col, 1.0);
}`;

    const VS_METEORS = `#version 300 es
layout(location = 0) in vec2 aQuad; // [-1, 1]
layout(location = 1) in vec4 aMeteorData; // (worldX, strikeWorldX, progress, orderType)
layout(location = 2) in vec2 aExtra; // (size, flashIntensity)

uniform mat4 uViewProj;
uniform vec3 uCameraPos;

out vec2 vUV;
out float vType;
out float vFlash;
out float vProgress;

void main() {
    vUV = aQuad;
    float worldX = aMeteorData.x;
    float targetX = aMeteorData.y;
    float prog = aMeteorData.z; // 0 = start at sky, 1 = impact at terrain
    vProgress = prog;
    vType = aMeteorData.w;
    float size = aExtra.x;
    float flash = aExtra.y;
    vFlash = flash;

    // Falling trajectory from y = 4.2 down to y = -0.8 at z = 0
    float curY = mix(4.2, -0.8, pow(prog, 1.6));
    float curX = mix(worldX, targetX, prog);
    float curZ = mix(-1.5, 0.0, prog);

    vec3 center = vec3(curX, curY, curZ);
    float scale = (0.08 + 0.04 * min(size, 6.0)) * (1.0 + flash * 2.8);

    // Camera facing billboard
    vec3 camFwd = normalize(center - uCameraPos);
    vec3 camRight = normalize(cross(vec3(0.0, 1.0, 0.0), camFwd));
    vec3 camUp = cross(camFwd, camRight);

    vec3 pos = center + (camRight * aQuad.x + camUp * aQuad.y) * scale;
    gl_Position = uViewProj * vec4(pos, 1.0);
}`;

    const FS_METEORS = `#version 300 es
precision highp float;

in vec2 vUV;
in float vType;
in float vFlash;
in float vProgress;

uniform vec3 uAccent;
out vec4 fragColor;

void main() {
    float r2 = dot(vUV, vUV);
    if (r2 > 1.0) discard;

    float glow = exp(-r2 * 3.5);
    vec3 baseTint = vType < 0.5 ? vec3(1.0, 0.72, 0.35) : vec3(0.25, 0.95, 0.75); // buy vs sell
    vec3 col = (baseTint * 1.5 + vec3(0.85)) * glow * (1.2 + vFlash * 3.5);

    fragColor = vec4(col, 1.0);
}`;

    const VS_RIBBON = `#version 300 es
layout(location = 0) in vec2 aPos; // [-1, 1]
out vec2 vUV;

void main() {
    vUV = aPos * 0.5 + 0.5;
    // Strip positioned at the bottom near-edge
    vec2 pos = aPos;
    pos.y = -0.92 + vUV.y * 0.035;
    gl_Position = vec4(pos, 0.0, 1.0);
}`;

    const FS_RIBBON = `#version 300 es
precision highp float;
in vec2 vUV;
uniform float uIntensityNorm; // lambda(t) / lambdaMax
uniform vec3 uAccent;
uniform float uTime;
out vec4 fragColor;

void main() {
    float intensity = clamp(uIntensityNorm, 0.0, 1.0);
    float pulse = 0.85 + 0.15 * sin(uTime * 8.0);
    float alpha = smoothstep(0.0, 0.5, vUV.y) * smoothstep(1.0, 0.5, vUV.y);

    vec3 col = mix(uAccent * 0.4, vec3(1.0, 0.85, 0.45), intensity * intensity) * intensity * pulse * 2.2;
    fragColor = vec4(col * alpha, 1.0);
}`;

    return {
        VS_TERRAIN,
        FS_TERRAIN,
        VS_METEORS,
        FS_METEORS,
        VS_RIBBON,
        FS_RIBBON
    };
}));
