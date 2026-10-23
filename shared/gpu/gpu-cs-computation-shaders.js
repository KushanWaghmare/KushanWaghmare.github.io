/**
 * gpu-cs-computation-shaders.js
 *
 * WebGL2 (GLSL ES 3.00) shader sources for The Universal Computation Hyper-Structure
 * (Computer Science Hero).
 *
 * Implements:
 *   - GPGPU state ping-pong simulation of Wolfram Rule 110 (Turing-complete CA)
 *   - Matthew Cook's Ether background vacuum with colliding soliton gliders
 *   - Continuous temporal phosphor decay (amethyst wake behind electric cyan logic pulses)
 *   - Cursor entropy glider stream injection
 *   - Avalanche logic cascade shockwaves from click impulses
 *   - High-contrast chromatic phosphor caustics on pitch-black background
 */

(function (root, factory) {
    if (typeof module === "object" && module.exports) {
        module.exports = factory();
    } else {
        root.CsComputationShaders = factory();
    }
}(typeof self !== "undefined" ? self : this, function () {
    "use strict";

    const VS_QUAD = `#version 300 es
layout(location = 0) in vec2 aPosition;
out vec2 vUV;
void main() {
    vUV = aPosition * 0.5 + 0.5;
    gl_Position = vec4(aPosition, 0.0, 1.0);
}
`;

    /* =====================================================================
     * 1. GPGPU Cellular State Evolution Shader
     * ===================================================================== */
    const FS_COMPUTATION_STEP = `#version 300 es
precision highp float;
precision highp int;

in vec2 vUV;
out vec4 fragColor;

uniform sampler2D uPrev;       // Previous state texture
uniform vec2  uRes;            // Texture resolution (e.g. 512, 512)
uniform float uTime;           // Elapsed time in seconds
uniform float uDt;             // Frame delta time
uniform vec2  uCursor;         // Current cursor pos in [0, 1] (-1 if outside)
uniform vec2  uCursorPrev;     // Previous cursor pos
uniform float uCursorSpeed;    // Speed of cursor movement
uniform float uShockTime;      // Time since last click cascade (< 0 if inactive)
uniform vec2  uShockCenter;    // Click origin in [0, 1]
uniform int   uRule;           // Rule 110 (default 110)
uniform int   uStepTrigger;    // 1 if space-time row shift advances this frame, 0 otherwise
uniform int   uInitSeed;       // 1 on first frame to initialize Cook ether and seeds

// Pseudo-random hash for quantum entropy injection
float hash2D(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
}

// Elementary cellular automaton rule lookup
int evaluateRule(int rule, int left, int center, int right) {
    int idx = (left << 2) | (center << 1) | right;
    return (rule >> idx) & 1;
}

void main() {
    // 0. Initial State Seeding on Frame 0
    if (uInitSeed == 1) {
        float x = floor(vUV.x * uRes.x);
        float y = floor(vUV.y * uRes.y);
        int ether[14] = int[14](0, 0, 0, 1, 0, 0, 1, 1, 0, 1, 1, 1, 1, 1);
        int pIdx = int(mod(x + y * 2.0, 14.0));
        float bit = float(ether[pIdx]);
        if (y < 4.0 && hash2D(vUV * 123.4) < 0.06) {
            bit = 1.0;
        }
        fragColor = vec4(bit, bit, 0.0, 0.0);
        return;
    }

    vec2 texel = 1.0 / uRes;
    vec4 self = texture(uPrev, vUV);

    float state = self.r;      // Binary state: 0.0 or 1.0
    float phosphor = self.g;   // Phosphor glow decay
    float gradient = self.b;   // Local spatial activity
    float age = self.a;

    // 1. Space-Time Cascading Roll
    // When uStepTrigger == 1, row y shifts down: row(y) receives row(y - 1)
    if (uStepTrigger == 1) {
        if (vUV.y > texel.y * 1.5) {
            // Internal rows: read from the row above
            vec2 aboveUV = vec2(vUV.x, vUV.y - texel.y);
            vec4 aboveSelf = texture(uPrev, aboveUV);
            state = aboveSelf.r;
        } else {
            // Top generation row (y ~ 0): compute Rule 110 from row(0) neighbors
            vec2 cUV = vec2(vUV.x, 0.5 * texel.y);
            vec2 lUV = vec2(fract(vUV.x - texel.x), 0.5 * texel.y);
            vec2 rUV = vec2(fract(vUV.x + texel.x), 0.5 * texel.y);

            int leftVal   = texture(uPrev, lUV).r > 0.5 ? 1 : 0;
            int centerVal = texture(uPrev, cUV).r > 0.5 ? 1 : 0;
            int rightVal  = texture(uPrev, rUV).r > 0.5 ? 1 : 0;

            int nextVal = evaluateRule(uRule, leftVal, centerVal, rightVal);
            state = float(nextVal);

            // Periodic ether background seeding if unperturbed
            float etherPhase = mod(floor(vUV.x * uRes.x) + floor(uTime * 14.0), 14.0);
            if (hash2D(vec2(vUV.x, uTime)) < 0.0015) {
                state = 1.0; // Random ambient soliton seed
            }
        }
    }

    // 2. Interactive Cursor Entropy Glider Injection
    if (uCursor.x >= 0.0 && uCursor.y >= 0.0) {
        // Distance to cursor line segment
        vec2 pa = vUV - uCursorPrev;
        vec2 ba = uCursor - uCursorPrev;
        float h = clamp(dot(pa, ba) / max(1e-6, dot(ba, ba)), 0.0, 1.0);
        float distToCursor = length(pa - ba * h);

        float injectRadius = 0.022 + uCursorSpeed * 0.04;
        if (distToCursor < injectRadius) {
            float rnd = hash2D(vUV * 31.7 + vec2(uTime, uTime * 1.7));
            if (rnd > 0.35) {
                state = 1.0;
            }
        }
    }

    // 3. Avalanche Logic Cascade (Click Impulse Wavefront)
    if (uShockTime >= 0.0 && uShockTime < 2.5) {
        float distToShock = length(vUV - uShockCenter);
        float waveRadius = uShockTime * 0.95;
        float dr = abs(distToShock - waveRadius);

        if (dr < 0.035) {
            float shockIntensity = exp(-uShockTime * 1.6) * (1.0 - dr / 0.035);
            float rnd = hash2D(vUV * 89.1 + vec2(uShockTime * 14.0, uTime));
            if (rnd < shockIntensity * 0.85) {
                state = 1.0 - state; // Flip bit state
            }
        }
    }

    // 4. Phosphor Persistence Decay
    // Active state ignites phosphor; inactive state decays gracefully
    if (state > 0.5) {
        phosphor = 1.0;
        age = 0.0;
    } else {
        phosphor = max(0.0, phosphor * exp(-uDt * 3.2));
        age = min(1.0, age + uDt * 0.4);
    }

    // 5. Local Activity Gradient
    vec4 nL = texture(uPrev, vec2(vUV.x - texel.x, vUV.y));
    vec4 nR = texture(uPrev, vec2(vUV.x + texel.x, vUV.y));
    vec4 nU = texture(uPrev, vec2(vUV.x, vUV.y - texel.y));
    vec4 nD = texture(uPrev, vec2(vUV.x, vUV.y + texel.y));
    gradient = abs(state - nL.r) + abs(state - nR.r) + abs(state - nU.r) + abs(state - nD.r);

    fragColor = vec4(state, phosphor, gradient * 0.25, age);
}
`;

    /* =====================================================================
     * 2. Cinematic Phosphor Rendering Shader
     * ===================================================================== */
    const FS_COMPUTATION_DISPLAY = `#version 300 es
precision highp float;

in vec2 vUV;
out vec4 fragColor;

uniform sampler2D uStateTex;    // GPGPU cellular state texture
uniform vec2  uRes;            // Screen resolution
uniform float uTime;           // Elapsed time
uniform vec3  uAccent;         // CS domain accent rgb(0, 212, 255)
uniform float uShockTime;      // Time since last click
uniform vec2  uShockCenter;    // Click origin

void main() {
    vec2 texel = 1.0 / uRes;
    vec4 cell = texture(uStateTex, vUV);

    float state = cell.r;       // Binary computational state
    float phosphor = cell.g;    // Cooling persistence trail
    float gradient = cell.b;    // Logic transition gradient
    float age = cell.a;

    // 1. Colour Hierarchy
    // Active logic core: Brilliant Electric Cyan with white-hot photon centers
    // Phosphor persistence wake: Radiant Amethyst Violet
    // Logic transition edges: Emerald Caustic Highlights
    vec3 colCyan     = vec3(0.00, 0.88, 1.00); // Electric cyan (active bit)
    vec3 colWhite    = vec3(1.00, 1.00, 1.00); // White-hot core
    vec3 colAmethyst = vec3(0.68, 0.20, 0.95); // Radiant amethyst trail
    vec3 colViolet   = vec3(0.24, 0.05, 0.48); // Deep cooling phosphor
    vec3 colEmerald  = vec3(0.12, 0.95, 0.60); // Glider edge caustics

    // Phosphor trail blend
    vec3 trailCol = mix(colViolet, colAmethyst, smoothstep(0.05, 0.75, phosphor));

    // Active bit core blend
    vec3 activeCol = mix(colCyan, colWhite, state * 0.65);

    // Composite colour based on state and persistence
    vec3 baseRGB = mix(trailCol * phosphor, activeCol, state);

    // Glider transition edge glow
    baseRGB += colEmerald * gradient * 0.85;

    // 2. Microscopic CRT Phosphor Grid & Scanlines
    vec2 pixelCoord = vUV * uRes;
    float scanline = 0.92 + 0.08 * sin(pixelCoord.y * 3.14159265);
    float gridX = smoothstep(0.08, 0.18, fract(pixelCoord.x * 0.5));
    baseRGB *= scanline * (0.85 + 0.15 * gridX);

    // 3. Avalanche Logic Cascade Wavefront Glow
    if (uShockTime >= 0.0 && uShockTime < 2.5) {
        float distToShock = length(vUV - uShockCenter);
        float waveRadius = uShockTime * 0.95;
        float dr = abs(distToShock - waveRadius);
        float waveGlow = exp(-uShockTime * 1.5) * smoothstep(0.06, 0.0, dr);
        baseRGB += mix(colCyan, colWhite, 0.5) * waveGlow * 1.8;
    }

    // 4. Subtle Chromatic Dispersion on High-Intensity Transitions
    float luma = dot(baseRGB, vec3(0.299, 0.587, 0.114));
    if (luma > 0.4) {
        float rShift = texture(uStateTex, vUV + vec2(texel.x * 1.5, 0.0)).g;
        float bShift = texture(uStateTex, vUV - vec2(texel.x * 1.5, 0.0)).g;
        baseRGB.r += rShift * 0.12;
        baseRGB.b += bShift * 0.18;
    }

    // Pitch-black background: vec3(0.0)
    fragColor = vec4(baseRGB, 1.0);
}
`;

    return {
        VS_QUAD,
        FS_COMPUTATION_STEP,
        FS_COMPUTATION_DISPLAY
    };
}));
