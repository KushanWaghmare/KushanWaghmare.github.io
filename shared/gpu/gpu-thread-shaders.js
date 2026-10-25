/* WebGL2 Shaders for Particle Thread (shared/gpu/gpu-thread-shaders.js).
   Contains morph transition compute shader, particle rendering vertex/fragment shaders,
   and flow update integration shaders. */

(function (root, factory) {
    if (typeof module === "object" && module.exports) {
        module.exports = factory();
    } else {
        root.THREAD_SHADERS = factory();
    }
}(typeof self !== "undefined" ? self : this, function () {
    "use strict";

    /* Full-screen triangle vertex shader */
    const VS_QUAD = `#version 300 es
layout(location = 0) in vec2 aPos;
out vec2 vUV;
void main() {
    vUV = aPos * 0.5 + 0.5;
    gl_Position = vec4(aPos, 0.0, 1.0);
}`;

    /* Analytical divergence-free curl noise GLSL block matching thread-math.js exactly */
    const GLSL_CURL = `
vec3 curlNoise(vec3 p, float t) {
    vec3 k1 = vec3(1.8, 1.2, 1.4);
    vec3 k2 = vec3(-1.3, 2.1, 1.1);
    vec3 k3 = vec3(1.4, -1.6, 2.2);

    vec3 c1 = vec3(-2.36, 1.44, 1.80);
    vec3 c2 = vec3(2.52, 2.66, -2.10);
    vec3 c3 = vec3(-2.42, -1.98, 0.10);

    float p1 = dot(p, k1) * 1.5 + t * 0.4;
    float p2 = dot(p, k2) * 1.5 + t * 0.5;
    float p3 = dot(p, k3) * 1.5 + t * 0.35;

    float cos1 = cos(p1);
    float cos2 = cos(p2);
    float cos3 = cos(p3);

    return (c1 * cos1 + c2 * cos2 + c3 * cos3) * 0.22;
}

float easeHermite(float p) {
    return p * p * (3.0 - 2.0 * p);
}`;

    /* Transition / Morph Compute Fragment Shader.
       Renders into RGBA32F morph target texture.
       Output: vec4(pos.xyz, localProgress) */
    const FS_MORPH = `#version 300 es
precision highp float;
precision highp int;

in vec2 vUV;
out vec4 fragPos;

uniform sampler2D uPosA;
uniform sampler2D uPosB;
uniform float uBlend;  // w in [0, 1]
uniform float uTime;
uniform float uSwirl;
uniform int uTexW;

${GLSL_CURL}

void main() {
    ivec2 coord = ivec2(gl_FragCoord.xy);
    vec4 stA = texelFetch(uPosA, coord, 0);
    vec4 stB = texelFetch(uPosB, coord, 0);

    vec3 xA = stA.xyz;
    vec3 xB = stB.xyz;
    float tau = stA.w; // per-particle stagger in [0, 0.3]

    float p = clamp((uBlend - tau) / 0.7, 0.0, 1.0);

    if (p <= 0.0) {
        fragPos = vec4(xA, 0.0);
        return;
    }
    if (p >= 1.0) {
        fragPos = vec4(xB, 1.0);
        return;
    }

    float ep = easeHermite(p);
    vec3 mx = mix(xA, xB, ep);
    vec3 curl = curlNoise(mx, uTime);
    float s = uSwirl * sin(3.141592653589793 * p);

    fragPos = vec4(mx + s * curl, p);
}`;

    /* Flow Formation Update Shader (for Lorenz / Keplerian / Diffusion / Contact flow formations) */
    const FS_FLOW_STEP = `#version 300 es
precision highp float;
precision highp int;

in vec2 vUV;
out vec4 fragState;

uniform sampler2D uState;
uniform float uDt;
uniform int uFlowType; // 0 = Lorenz, 1 = Keplerian accretion, 2 = Reverse diffusion spiral, 3 = Calm curl-noise flow
uniform float uTime;

${GLSL_CURL}

void main() {
    ivec2 coord = ivec2(gl_FragCoord.xy);
    vec4 st = texelFetch(uState, coord, 0);
    vec3 pos = st.xyz;
    float tau = st.w;

    if (uFlowType == 0) {
        // Lorenz attractor integration step
        vec3 p = pos * 24.0;
        p.z += 25.0;
        vec3 k1 = vec3(10.0 * (p.y - p.x), p.x * (28.0 - p.z) - p.y, p.x * p.y - (8.0 / 3.0) * p.z);
        p += k1 * uDt;
        p.z -= 25.0;
        fragState = vec4(p * (1.0 / 24.0), tau);
    } else if (uFlowType == 1) {
        // Keplerian accretion differential rotation
        float r = length(pos.xy);
        float omega = 1.2 / max(pow(r, 1.5), 0.15);
        float angle = omega * uDt;
        float ca = cos(angle), sa = sin(angle);
        vec2 rot = vec2(pos.x * ca - pos.y * sa, pos.x * sa + pos.y * ca);
        fragState = vec4(rot, pos.z, tau);
    } else if (uFlowType == 2) {
        // Reverse diffusion spiral flow (Data Science):
        // Inward logarithmic spiral circulation with analytical drift towards manifold
        float r = length(pos.xy);
        float omega = 0.85 / (r + 0.22);
        float angle = omega * uDt;
        float ca = cos(angle), sa = sin(angle);
        vec2 rot = vec2(pos.x * ca - pos.y * sa, pos.x * sa + pos.y * ca);
        vec3 curl = curlNoise(pos * 1.5, uTime * 0.4);
        vec3 newP = vec3(rot * (1.0 - 0.04 * uDt) + curl.xy * (0.04 * uDt), pos.z * (1.0 - 0.3 * uDt) + curl.z * (0.03 * uDt));
        if (length(newP.xy) < 0.10) {
            newP.xy = normalize(rot + 1e-4) * 0.88;
        }
        fragState = vec4(newP, tau);
    } else {
        // Calm curl-noise flow (Contact):
        // Laminar 3D streamline circulation
        vec3 curl = curlNoise(pos * 0.8, uTime * 0.25);
        vec3 newP = pos + curl * (0.35 * uDt);
        if (length(newP) > 1.25) newP *= 0.82;
        fragState = vec4(newP, tau);
    }
}`;

    /* Particle Render Vertex Shader */
    const VS_RENDER = `#version 300 es
precision highp float;
precision highp int;

uniform sampler2D uMorphPos;
uniform sampler2D uColA;
uniform sampler2D uColB;
uniform mat4 uViewProj;
uniform vec2 uMouse;        // Cursor in normalized screen [-1, 1]
uniform float uMouseActive;
uniform int uTexW;

out vec4 vColour;
out vec2 vScreenPos;

${GLSL_CURL}

void main() {
    ivec2 uv = ivec2(gl_VertexID % uTexW, gl_VertexID / uTexW);
    vec4 morph = texelFetch(uMorphPos, uv, 0);
    vec3 pos = morph.xyz;
    float p = morph.w;

    vec4 cA = texelFetch(uColA, uv, 0);
    vec4 cB = texelFetch(uColB, uv, 0);
    vColour = mix(cA, cB, easeHermite(p));

    gl_Position = uViewProj * vec4(pos, 1.0);

    // Screen coordinate for pointer deflection & text bounding check
    vec2 screen = gl_Position.xy / max(gl_Position.w, 1e-4);
    vScreenPos = screen;

    // Pointer soft radial displacement in vertex shader (max 0.04 units)
    if (uMouseActive > 0.5) {
        vec2 mDiff = screen - uMouse;
        float mDist = length(mDiff);
        if (mDist < 0.35) {
            float disp = 0.038 * exp(-mDist * mDist / (2.0 * 0.12 * 0.12));
            gl_Position.xy += normalize(mDiff + 1e-5) * disp * gl_Position.w;
        }
    }

    // Depth-attenuated point size
    gl_PointSize = clamp(2.4 / max(gl_Position.w * 0.45, 0.4), 1.2, 3.6);
}`;

    /* Particle Render Fragment Shader with Text Legibility Dimming */
    const FS_RENDER = `#version 300 es
precision highp float;
precision highp int;

in vec4 vColour;
in vec2 vScreenPos;
out vec4 fragColor;

uniform vec4 uTextRect;      // vec4(minX, minY, maxX, maxY) in [-1, 1]
uniform float uNativeFade;   // Settle dimming factor (1.0 down to 0.25)
uniform vec3 uAccent;

void main() {
    vec2 circ = gl_PointCoord - 0.5;
    float distSq = dot(circ, circ);
    if (distSq > 0.25) discard;
    float alpha = smoothstep(0.25, 0.0, distSq);

    // Text legibility dimming inside section text column (up to 60% dimming)
    float inTextX = smoothstep(uTextRect.x - 0.05, uTextRect.x, vScreenPos.x) * (1.0 - smoothstep(uTextRect.z, uTextRect.z + 0.05, vScreenPos.x));
    float inTextY = smoothstep(uTextRect.y - 0.05, uTextRect.y, vScreenPos.y) * (1.0 - smoothstep(uTextRect.w, uTextRect.w + 0.05, vScreenPos.y));
    float textDim = mix(1.0, 0.40, inTextX * inTextY);

    // HDR additive luminous splat
    vec3 col = vColour.rgb;
    fragColor = vec4(col * (vColour.a * alpha * textDim * uNativeFade), 1.0);
}`;

    return {
        VS_QUAD,
        FS_MORPH,
        FS_FLOW_STEP,
        VS_RENDER,
        FS_RENDER
    };
}));
