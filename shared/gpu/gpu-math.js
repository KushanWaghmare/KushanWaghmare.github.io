/**
 * shared/gpu/gpu-math.js
 *
 * WebGL2 Simulation: "Möbius Strip & Surface Geometry"
 * Target: SIMS["mobius-surfaces"]
 *
 * Mathematical and visual foundation:
 *   - Parametric welded surface r(u, v) with k half-twists (k in {1, 2, 3}),
 *     core radius R = 2.05, half-width w in [0.45, 0.85].
 *   - Analytic tangents r_u, r_v, and normal vector n(u, v).
 *   - Analytic Gaussian curvature K = -(kR/2)^2 / E^2 with restrained, elegant colour ramp.
 *   - Glossy dark-metal ribbon with subtle thin-film iridescence and screen-space anti-aliased iso-lines.
 *   - Luminous boundary pulse: takes 2 laps (4pi) for k = 1 and k = 3 (single edge);
 *     1 lap (2pi) each for k = 2 with distinguishable boundary colours (blue/gold).
 *   - Glowing core marker walking along core circle (v = 0) with a 3-D normal vector arrow
 *     demonstrating non-orientable holonomy: n -> -n after lap 1, returning n -> +n after lap 2.
 *   - Interactive geodesic paths integrated on the induced metric via Levi-Civita equations.
 *   - Precise framing: occupies <= 60% of canvas height, positioned in right column on desktop,
 *     leaving text column clear; adapts gracefully to lower half on mobile.
 *   - Single-line caption readout via KW.tag in UK English.
 *   - WebGL2 HDR pipeline with Dual-Kawase bloom and ACES tonemapping via GFX.
 */

(function (root, factory) {
    if (typeof module === "object" && module.exports) module.exports = factory(root);
    else factory(root);
}(typeof self !== "undefined" ? self : this, function (root) {
    "use strict";

    root.SIMS = root.SIMS || {};
    const SIMS = root.SIMS;
    const GFX = root.GFX;
    const M = root.MobiusMath || (typeof require !== "undefined" ? require("../lib/mobius-math.js") : null);

    /* ---------- Shaders: Parametric Ribbon Surface ---------- */
    const VS_MOBIUS = `#version 300 es
precision highp float;
layout(location = 0) in vec2 aUV; // x = u in [0, 1], y = v in [0, 1]

uniform mat4 uMVP;
uniform mat4 uModel;
uniform float uTwist;     // k in {1, 2, 3}
uniform float uWidth;     // half-width w
uniform float uRadius;    // core radius R = 2.05

out vec3 vNormal;
out vec3 vWorldPos;
out vec2 vCoord;
out float vCurvature;

void main() {
    float u = aUV.x * 6.28318530718;
    float v = (aUV.y - 0.5) * 2.0 * uWidth;
    float alpha = 0.5 * uTwist * u;

    float ca = cos(alpha), sa = sin(alpha);
    float cu = cos(u), su = sin(u);
    float rho = uRadius + v * ca;
    float kv2 = 0.5 * uTwist * v;

    vec3 pos = vec3(rho * cu, rho * su, v * sa);

    // Analytic tangents
    vec3 ru = vec3(
        -kv2 * sa * cu - rho * su,
        -kv2 * sa * su + rho * cu,
        kv2 * ca
    );
    vec3 rv = vec3(ca * cu, ca * su, sa);

    vec3 crossN = cross(ru, rv);
    float lenCross = length(crossN);
    vec3 norm = lenCross > 1e-5 ? crossN / lenCross : vec3(0.0, 0.0, 1.0);

    vec3 mNorm = mat3(uModel) * norm;
    float lenM = length(mNorm);
    vNormal = lenM > 1e-5 ? mNorm / lenM : vec3(0.0, 0.0, 1.0);

    vec4 world = uModel * vec4(pos, 1.0);
    vWorldPos = world.xyz;
    vCoord = aUV;

    // Analytic Gaussian Curvature: K = -(kR/2)^2 / E^2 <= 0
    float E = rho * rho + kv2 * kv2;
    float kR2 = 0.5 * uTwist * uRadius;
    vCurvature = -(kR2 * kR2) / max(E * E, 1e-6);

    gl_Position = uMVP * vec4(pos, 1.0);
}`;

    const FS_MOBIUS = `#version 300 es
precision highp float;

in vec3 vNormal;
in vec3 vWorldPos;
in vec2 vCoord;
in float vCurvature;

out vec4 fragColor;

uniform vec3 uCamPos;
uniform vec3 uAccent;
uniform float uTwist;
uniform float uPulseTime;
uniform float uMarkerU;
uniform float uShowMarker;
uniform float uShowPulse;
uniform float uShowIsoLines;
uniform float uShowCurvature;

// Thin-film iridescent interference colors
vec3 thinFilm(float cosTheta) {
    float d = 360.0 + 300.0 * (1.0 - cosTheta);
    vec3 phase = 6.2831853 * d / vec3(650.0, 532.0, 440.0);
    return 0.5 + 0.5 * cos(phase);
}

void main() {
    float lenNorm = length(vNormal);
    vec3 N = lenNorm > 0.15 ? vNormal / lenNorm : normalize(cross(dFdx(vWorldPos), dFdy(vWorldPos)));
    if (length(N) < 0.5 || isnan(N.x)) N = vec3(0.0, 0.0, 1.0);

    vec3 toCam = uCamPos - vWorldPos;
    float lenV = length(toCam);
    vec3 V = lenV > 1e-4 ? toCam / lenV : vec3(0.0, 0.0, 1.0);
    float NdotV = clamp(abs(dot(N, V)), 0.0, 1.0); // Two-sided rendering

    // Thin-film iridescence + Fresnel term
    float fresnel = pow(clamp(1.0 - NdotV, 0.0, 1.0), 3.2);
    vec3 irid = thinFilm(NdotV);

    // Deep contrast stage lighting
    vec3 upCol = vec3(0.035, 0.045, 0.08) + uAccent * 0.06;
    vec3 downCol = vec3(0.012, 0.015, 0.022);
    vec3 env = mix(downCol, upCol, clamp(N.y * 0.5 + 0.5, 0.0, 1.0));

    // Specular highlight from directional key light
    vec3 L = normalize(vec3(0.55, 0.82, 0.48));
    vec3 hVec = L + V;
    float lenH = length(hVec);
    vec3 H = lenH > 1e-4 ? hVec / lenH : N;
    float NdotH = clamp(abs(dot(N, H)), 0.0, 1.0);
    float spec = pow(NdotH, 28.0);

    // Secondary fill light
    vec3 L2 = normalize(vec3(-0.7, -0.3, -0.6));
    vec3 hVec2 = L2 + V;
    vec3 H2 = length(hVec2) > 1e-4 ? normalize(hVec2) : N;
    float spec2 = pow(clamp(abs(dot(N, H2)), 0.0, 1.0), 16.0);

    // Base body color: glossy dark metal with subtle iridescence
    vec3 darkMetal = vec3(0.040, 0.042, 0.048);
    vec3 base = mix(darkMetal, irid * 0.45, fresnel * 0.7);
    vec3 col = env * base * 2.2 + vec3(1.0, 0.96, 0.92) * spec * 0.65 + uAccent * spec2 * 0.25;

    // Curvature color ramp (restrained, readable: K <= 0 everywhere for k=1)
    if (uShowCurvature > 0.5) {
        float kappa = clamp((-vCurvature - 0.015) / 0.35, 0.0, 1.0);
        vec3 cLow = vec3(0.04, 0.07, 0.14);
        vec3 cMid = mix(uAccent * 0.55, vec3(0.20, 0.55, 0.85), 0.5);
        vec3 cHigh = mix(uAccent * 1.2, vec3(0.35, 0.85, 1.0), 0.6);
        vec3 curvCol = mix(cLow, mix(cMid, cHigh, kappa), kappa);
        col = mix(col, curvCol, 0.62 * uShowCurvature);
    }

    // Glowing iso-lines of constant u and constant v (anti-aliased screen-space derivatives)
    if (uShowIsoLines > 0.5) {
        float fwU = max(fwidth(vCoord.x * 24.0), 1e-4);
        float dGridU = abs(fract(vCoord.x * 24.0 - 0.5) - 0.5) / fwU;
        float isoU = 1.0 - smoothstep(0.0, 1.5, dGridU);

        float fwV = max(fwidth(vCoord.y * 8.0), 1e-4);
        float dGridV = abs(fract(vCoord.y * 8.0 - 0.5) - 0.5) / fwV;
        float isoV = 1.0 - smoothstep(0.0, 1.5, dGridV);

        float iso = max(isoU * 0.75, isoV * 0.55);
        col += uAccent * iso * 0.85;
    }

    // Glowing boundary edge rim
    float edgeDist = min(vCoord.y, 1.0 - vCoord.y);
    float edgeGlow = 1.0 - smoothstep(0.0, 0.04, edgeDist);

    // For k = 2: two distinct boundary components distinguishable by color
    vec3 edgeCol;
    if (uTwist > 1.5 && uTwist < 2.5) {
        edgeCol = vCoord.y > 0.5 ? (uAccent * 2.2) : (vec3(1.0, 0.72, 0.28) * 2.0);
    } else {
        edgeCol = uAccent * 2.2;
    }
    col += edgeCol * edgeGlow * 1.4;

    // Glowing boundary pulse (takes 2 laps for k=1, 3 to close; 1 lap each for k=2)
    if (uShowPulse > 0.5) {
        float pulseVal = 0.0;
        vec3 pulseColor = edgeCol;
        if (uTwist > 1.5 && uTwist < 2.5) {
            // k = 2: Two separate loops of length 2pi
            float s = vCoord.x;
            float s0 = fract(uPulseTime * 0.5);
            float dPulse = abs(fract((s - s0) + 0.5) - 0.5);
            pulseVal = exp(-dPulse * dPulse * 180.0) * edgeGlow;
        } else {
            // k odd: Single loop of length 4pi traversed over [0, 2]
            float s = vCoord.y > 0.5 ? vCoord.x : (2.0 - vCoord.x);
            float s0 = fract(uPulseTime * 0.25) * 2.0;
            float dPulse = abs(fract((s - s0) * 0.5 + 0.5) - 0.5) * 2.0;
            pulseVal = exp(-dPulse * dPulse * 140.0) * edgeGlow;
            pulseColor = mix(vec3(1.0), uAccent * 1.5, 0.35);
        }
        col += pulseColor * pulseVal * 5.0;
    }

    // Glowing Core Marker spot along v = 0 (vCoord.y = 0.5)
    if (uShowMarker > 0.5) {
        float markerNormU = fract(uMarkerU / 6.28318530718);
        float dMarkerU = abs(fract((vCoord.x - markerNormU) + 0.5) - 0.5);
        float dMarkerV = abs(vCoord.y - 0.5);
        float spot = exp(-dMarkerU * dMarkerU * 850.0) * exp(-dMarkerV * dMarkerV * 450.0);
        vec3 spotCol = mix(vec3(1.0, 0.98, 0.92), uAccent * 1.8, 0.3);
        col += spotCol * spot * 4.5;
    }

    // Defensive NaN/Inf sanitisation
    if (isnan(col.r) || isnan(col.g) || isnan(col.b) || isinf(col.r) || isinf(col.g) || isinf(col.b)) {
        col = uAccent * 0.3;
    }

    fragColor = vec4(max(vec3(0.0), col), 1.0);
}`;

    /* ---------- Shaders: 3-D Lines (Normal Arrow & Geodesic Trail) ---------- */
    const VS_LINE = `#version 300 es
precision highp float;
layout(location = 0) in vec3 aPos;
layout(location = 1) in vec4 aColor;
uniform mat4 uMVP;
out vec4 vColor;
void main() {
    vColor = aColor;
    gl_Position = uMVP * vec4(aPos, 1.0);
}`;

    const FS_LINE = `#version 300 es
precision highp float;
in vec4 vColor;
out vec4 fragColor;
void main() {
    fragColor = vColor;
}`;

    /* ---------- Matrix Helpers (Allocated Once) ---------- */
    const mat4Perspective = (out, fovy, aspect, near, far, sx = 0.0, sy = 0.0) => {
        const f = 1.0 / Math.tan(fovy * 0.5), nf = 1.0 / (near - far);
        out.fill(0);
        out[0] = f / aspect;
        out[5] = f;
        out[8] = sx;
        out[9] = sy;
        out[10] = (far + near) * nf;
        out[11] = -1.0;
        out[14] = 2.0 * far * near * nf;
    };

    const mat4LookAt = (out, eye, ctr, up) => {
        let z0 = eye[0] - ctr[0], z1 = eye[1] - ctr[1], z2 = eye[2] - ctr[2];
        let len = 1.0 / (Math.hypot(z0, z1, z2) || 1.0);
        z0 *= len; z1 *= len; z2 *= len;
        let x0 = up[1] * z2 - up[2] * z1, x1 = up[2] * z0 - up[0] * z2, x2 = up[0] * z1 - up[1] * z0;
        len = 1.0 / (Math.hypot(x0, x1, x2) || 1.0);
        x0 *= len; x1 *= len; x2 *= len;
        const y0 = z1 * x2 - z2 * x1, y1 = z2 * x0 - z0 * x2, y2 = z0 * x1 - z1 * x0;
        out.set([
            x0, y0, z0, 0,
            x1, y1, z1, 0,
            x2, y2, z2, 0,
            -(x0 * eye[0] + x1 * eye[1] + x2 * eye[2]),
            -(y0 * eye[0] + y1 * eye[1] + y2 * eye[2]),
            -(z0 * eye[0] + z1 * eye[1] + z2 * eye[2]),
            1.0
        ]);
    };

    const mat4Mul = (out, a, b) => {
        for (let i = 0; i < 4; i++) {
            const b0 = b[i * 4], b1 = b[i * 4 + 1], b2 = b[i * 4 + 2], b3 = b[i * 4 + 3];
            for (let j = 0; j < 4; j++) {
                out[i * 4 + j] = b0 * a[j] + b1 * a[4 + j] + b2 * a[8 + j] + b3 * a[12 + j];
            }
        }
    };

    /* ---------- Main Simulation Registration ---------- */
    SIMS["mobius-surfaces"] = (canvas, opts = {}) => {
        if (!GFX || !GFX.supported) {
            if (root.ENGINES && root.ENGINES.surface) {
                return root.ENGINES.surface(canvas, { type: "mobius-transport", r: 2.05, width: 0.85, needles: 32 });
            }
            return null;
        }

        const gl = GFX.gl;
        const isMob = typeof window !== "undefined" && window.innerWidth <= 900;
        const uSeg = isMob ? 160 : 256;
        const vSeg = isMob ? 20 : 32;

        // Static UV Grid Buffer for Surface
        const numVerts = (uSeg + 1) * (vSeg + 1);
        const uvData = new Float32Array(numVerts * 2);
        let ptr = 0;
        for (let i = 0; i <= uSeg; i++) {
            const u = i / uSeg;
            for (let j = 0; j <= vSeg; j++) {
                const v = j / vSeg;
                uvData[ptr++] = u;
                uvData[ptr++] = v;
            }
        }

        const numIndices = uSeg * vSeg * 6;
        const indexData = new Uint16Array(numIndices);
        let iptr = 0;
        for (let i = 0; i < uSeg; i++) {
            for (let j = 0; j < vSeg; j++) {
                const r0 = i * (vSeg + 1);
                const r1 = (i + 1) * (vSeg + 1);
                const a = r0 + j, b = r1 + j, c = r0 + j + 1, d = r1 + j + 1;
                indexData[iptr++] = a; indexData[iptr++] = b; indexData[iptr++] = c;
                indexData[iptr++] = b; indexData[iptr++] = d; indexData[iptr++] = c;
            }
        }

        let surfVao = null, surfVbo = null, surfEbo = null;
        let lineVao = null, lineVbo = null;
        let progSurf = null, progLine = null;
        let sceneTarget = null;

        const setupBuffers = () => {
            if (surfVao) return;
            // Surface VAO
            surfVao = gl.createVertexArray();
            surfVbo = gl.createBuffer();
            surfEbo = gl.createBuffer();
            gl.bindVertexArray(surfVao);
            gl.bindBuffer(gl.ARRAY_BUFFER, surfVbo);
            gl.bufferData(gl.ARRAY_BUFFER, uvData, gl.STATIC_DRAW);
            gl.enableVertexAttribArray(0);
            gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
            gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, surfEbo);
            gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indexData, gl.STATIC_DRAW);
            gl.bindVertexArray(null);

            // Dynamic Line VAO (for 3D normal arrow & geodesic trail)
            lineVao = gl.createVertexArray();
            lineVbo = gl.createBuffer();
            gl.bindVertexArray(lineVao);
            gl.bindBuffer(gl.ARRAY_BUFFER, lineVbo);
            // Reserve up to 1024 vertices (pos: vec3, col: vec4 => 7 floats)
            gl.bufferData(gl.ARRAY_BUFFER, 1024 * 7 * 4, gl.DYNAMIC_DRAW);
            gl.enableVertexAttribArray(0);
            gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 28, 0);
            gl.enableVertexAttribArray(1);
            gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 28, 12);
            gl.bindVertexArray(null);

            progSurf = GFX.program(VS_MOBIUS, FS_MOBIUS);
            progLine = GFX.program(VS_LINE, FS_LINE);
        };

        // Scene State
        let twists = 1;
        let ribbonWidth = 0.78;
        const radiusR = 2.05;

        // Overlay Toggles
        const overlays = {
            normal: true,
            pulse: true,
            iso: true,
            curvature: true,
            geodesic: true
        };

        // Normal Marker & Lap State
        let markerU = 0.0;
        let pulseTime = 0.0;
        let lapCount = 1;
        let normalFlipped = false;

        // Camera State: initial orbit angle highlights the vertical twist clearly
        let camYaw = 0.95, camPitch = 0.45;
        const projMat = new Float32Array(16);
        const viewMat = new Float32Array(16);
        const modelMat = new Float32Array(16);
        const vmMat = new Float32Array(16);
        const mvpMat = new Float32Array(16);

        // Geodesic Trajectory
        let geodesicPoints = [];
        let geodesicAnimProgress = 0.0;

        const launchGeodesic = () => {
            if (!M) return;
            const u0 = markerU % (2.0 * Math.PI);
            const v0 = 0.0;
            const du0 = 0.28;
            const dv0 = 0.65;
            const S0 = [u0, v0, du0, dv0];
            const traj = M.integrateGeodesic(S0, 0.003, 400, twists, radiusR);

            geodesicPoints = [];
            for (let i = 0; i < traj.length; i++) {
                const u_i = traj[i][0];
                let v_i = traj[i][1];
                // Elastic boundary bounce if crossing edge
                if (Math.abs(v_i) > ribbonWidth) {
                    v_i = Math.sign(v_i) * (2.0 * ribbonWidth - Math.abs(v_i));
                }
                const p = M.surface(u_i, v_i, twists, radiusR);
                const n = M.normal(u_i, v_i, twists, radiusR);
                // Slight outward lift to avoid z-fighting
                geodesicPoints.push([
                    p[0] + n[0] * 0.018,
                    p[1] + n[1] * 0.018,
                    p[2] + n[2] * 0.018
                ]);
            }
            geodesicAnimProgress = 0.0;
        };

        // Initial geodesic
        launchGeodesic();

        // Caption Update Helper (British English)
        let lastTagTime = 0;
        const updateCaption = (now) => {
            if (now - lastTagTime < 250) return;
            lastTagTime = now;

            const knotType = twists === 1 ? "unknot" : (twists === 2 ? "Hopf link" : "trefoil knot");
            const bndCount = twists % 2 === 1 ? 1 : 2;
            const orientableStr = twists % 2 === 0 ? "orientable" : "non-orientable";

            let lapStr = "";
            if (twists % 2 === 1) {
                lapStr = `normal flip: lap ${lapCount}/2 (${normalFlipped ? "n → −n" : "−n → +n"})`;
            } else {
                lapStr = "normal invariant (n → +n)";
            }

            const twistWord = twists === 1 ? "1 half-twist" : `${twists} half-twists`;
            const caption = `${twistWord} · ${orientableStr} (χ = 0) · ${bndCount} boundary loop (${knotType}) · ${lapStr} · click: next twist`;
            if (root.KW && root.KW.tag) root.KW.tag(caption, canvas);
        };

        // Interactive On-Canvas Control Buttons Layout
        const buttons = [
            { id: "twist", label: () => `Twist: ${twists}`, action: () => { twists = (twists % 3) + 1; launchGeodesic(); } },
            { id: "width", label: () => `Width: ${ribbonWidth > 0.65 ? "Broad" : "Narrow"}`, action: () => { ribbonWidth = ribbonWidth > 0.65 ? 0.50 : 0.78; launchGeodesic(); } },
            { id: "iso", label: () => `Iso-lines: ${overlays.iso ? "On" : "Off"}`, action: () => { overlays.iso = !overlays.iso; } },
            { id: "curv", label: () => `Curvature: ${overlays.curvature ? "On" : "Off"}`, action: () => { overlays.curvature = !overlays.curvature; } },
            { id: "geod", label: () => "Launch Geodesic", action: () => { launchGeodesic(); } }
        ];

        let lastClickTime = 0;
        if (root.KW && root.KW.onClick) {
            root.KW.onClick(canvas, (evt) => {
                const now = performance.now();
                if (now - lastClickTime < 300) return;
                lastClickTime = now;

                const rect = canvas.getBoundingClientRect();
                const mx = evt.clientX - rect.left;
                const my = evt.clientY - rect.top;

                // Check button hit targets
                let clickedButton = false;
                for (const btn of buttons) {
                    if (btn.bounds && mx >= btn.bounds.x && mx <= btn.bounds.x + btn.bounds.w &&
                        my >= btn.bounds.y && my <= btn.bounds.y + btn.bounds.h) {
                        btn.action();
                        clickedButton = true;
                        break;
                    }
                }

                // If clicked outside buttons, cycle half-twist
                if (!clickedButton) {
                    twists = (twists % 3) + 1;
                    launchGeodesic();
                }
                updateCaption(0);
            });
        }

        return GFX.mount(canvas, (gfx, c, getSize) => ({
            resize: (rw, rh) => {
                setupBuffers();
                if (!sceneTarget) sceneTarget = gfx.target(rw, rh, { fp32: false, depth: true });
                else sceneTarget.resize(rw, rh);
                canvas.__sceneTarget = sceneTarget;
            },
            frame: (t, dt, ctx2d, outW, outH, isReduced) => {
                const cursor = root.KW && root.KW.local ? root.KW.local(canvas) : { x: -1000, y: -1000 };
                const aspect = sceneTarget.w / Math.max(1, sceneTarget.h);
                const hasMouse = cursor.x > -500;

                // Authored slow camera orbit with subtle cursor parallax
                const targetYaw = hasMouse ? (cursor.x / (canvas.clientWidth || 800) - 0.5) * 2.2 : 0.95 + t * 0.16;
                const targetPitch = hasMouse ? (cursor.y / (canvas.clientHeight || 600) - 0.5) * 1.2 : 0.44 + 0.08 * Math.sin(t * 0.22);
                camYaw += (targetYaw - camYaw) * Math.min(1.0, dt * 3.5);
                camPitch += (targetPitch - camPitch) * Math.min(1.0, dt * 3.5);

                // Framing:
                // Strip occupies <= 60% of canvas height (camera distance calibrated to 10.6 on desktop)
                const isNarrow = typeof window !== "undefined" && window.innerWidth <= 900;
                const camDist = isNarrow ? 12.2 : 10.6;
                const camX = camDist * Math.sin(camYaw) * Math.cos(camPitch);
                const camY = camDist * Math.sin(camPitch);
                const camZ = camDist * Math.cos(camYaw) * Math.cos(camPitch);

                const fov = 42.0 * (Math.PI / 180.0);
                // Desktop: shift right by -0.45 so text column remains 100% clear; mobile: shift down to lower half
                const shiftX = isNarrow ? 0.0 : -0.45;
                const shiftY = isNarrow ? 0.65 : 0.0;
                mat4Perspective(projMat, fov, aspect, 0.1, 40.0, shiftX, shiftY);
                mat4LookAt(viewMat, [camX, camY, camZ], [0, 0, 0], [0, 1, 0]);

                // Model matrix: slow gentle tumble
                const roll = t * 0.07;
                const cosR = Math.cos(roll), sinR = Math.sin(roll);
                modelMat.set([
                    cosR, 0, sinR, 0,
                    0, 1, 0, 0,
                    -sinR, 0, cosR, 0,
                    0, 0, 0, 1
                ]);

                mat4Mul(vmMat, viewMat, modelMat);
                mat4Mul(mvpMat, projMat, vmMat);

                // Simulation Timing & Marker Updates
                if (!isReduced) {
                    markerU = (markerU + dt * 0.85) % (4.0 * Math.PI);
                    pulseTime = (pulseTime + dt * 0.5) % 4.0;
                    geodesicAnimProgress = Math.min(1.0, geodesicAnimProgress + dt * 0.45);
                }

                // Lap count and normal orientation
                lapCount = markerU < (2.0 * Math.PI) ? 1 : 2;
                normalFlipped = (lapCount === 1);

                updateCaption(performance.now());

                const a = (root.KW && root.KW.col && root.KW.col.a && root.KW.col.a.length >= 3) ? root.KW.col.a : [79, 140, 255];
                const accent = [a[0] / 255, a[1] / 255, a[2] / 255];

                // Render into HDR Depth Framebuffer
                gl.bindFramebuffer(gl.FRAMEBUFFER, sceneTarget.fbo);
                gl.viewport(0, 0, sceneTarget.w, sceneTarget.h);
                gl.clearColor(0, 0, 0, 0);
                gl.clearDepth(1.0);
                gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
                gl.enable(gl.DEPTH_TEST);
                gl.depthFunc(gl.LEQUAL);

                /* ===== DRAW CALL 1: Parametric Surface Ribbon ===== */
                progSurf.use()
                    .mat4("uMVP", mvpMat)
                    .mat4("uModel", modelMat)
                    .f3("uCamPos", camX, camY, camZ)
                    .f3("uAccent", accent[0], accent[1], accent[2])
                    .f1("uTwist", twists)
                    .f1("uWidth", ribbonWidth)
                    .f1("uRadius", radiusR)
                    .f1("uPulseTime", pulseTime)
                    .f1("uMarkerU", markerU)
                    .f1("uShowMarker", overlays.normal ? 1.0 : 0.0)
                    .f1("uShowPulse", overlays.pulse ? 1.0 : 0.0)
                    .f1("uShowIsoLines", overlays.iso ? 1.0 : 0.0)
                    .f1("uShowCurvature", overlays.curvature ? 1.0 : 0.0);

                gl.bindVertexArray(surfVao);
                gl.drawElements(gl.TRIANGLES, numIndices, gl.UNSIGNED_SHORT, 0);

                /* ===== DRAW CALLS 2 & 3: Normal Vector Arrow & Geodesic Line ===== */
                if (overlays.normal || (overlays.geodesic && geodesicPoints.length > 1)) {
                    const lineFloats = [];
                    const pushLineVert = (x, y, z, r, g, b, alphaVal) => {
                        lineFloats.push(x, y, z, r, g, b, alphaVal);
                    };

                    // Build 3-D Normal Arrow at Core Marker
                    if (overlays.normal) {
                        const alphaAngle = 0.5 * twists * markerU;
                        const ca = Math.cos(alphaAngle), sa = Math.sin(alphaAngle);
                        const cu = Math.cos(markerU), su = Math.sin(markerU);

                        // Core circle position
                        const p0 = [radiusR * cu, radiusR * su, 0.0];
                        // Unit normal along core
                        const norm = [sa * cu, sa * su, -ca];

                        // Arrow dimensions
                        const arrowLen = 0.85;
                        const headLen = 0.22;
                        const headRad = 0.07;
                        const pBase = [p0[0] + norm[0] * (arrowLen - headLen), p0[1] + norm[1] * (arrowLen - headLen), p0[2] + norm[2] * (arrowLen - headLen)];
                        const pTip = [p0[0] + norm[0] * arrowLen, p0[1] + norm[1] * arrowLen, p0[2] + norm[2] * arrowLen];

                        // Orthogonal basis for arrowhead wings
                        const t1 = [-su, cu, 0.0];
                        const t2 = [
                            norm[1] * t1[2] - norm[2] * t1[1],
                            norm[2] * t1[0] - norm[0] * t1[2],
                            norm[0] * t1[1] - norm[1] * t1[0]
                        ];

                        // Arrowhead wing base points
                        const w0 = [pBase[0] + t1[0] * headRad, pBase[1] + t1[1] * headRad, pBase[2] + t1[2] * headRad];
                        const w1 = [pBase[0] + t2[0] * headRad, pBase[1] + t2[1] * headRad, pBase[2] + t2[2] * headRad];
                        const w2 = [pBase[0] - t1[0] * headRad, pBase[1] - t1[1] * headRad, pBase[2] - t1[2] * headRad];
                        const w3 = [pBase[0] - t2[0] * headRad, pBase[1] - t2[1] * headRad, pBase[2] - t2[2] * headRad];

                        // Colour: bright luminous accent in lap 1, bright gold in lap 2
                        const aCol = (lapCount === 1) ? [accent[0] * 2.2, accent[1] * 2.2, accent[2] * 2.2, 1.0] : [2.5, 1.9, 0.8, 1.0];

                        // Stem line
                        pushLineVert(p0[0], p0[1], p0[2], ...aCol);
                        pushLineVert(pBase[0], pBase[1], pBase[2], ...aCol);

                        // 4-sided arrowhead cone lines
                        pushLineVert(w0[0], w0[1], w0[2], ...aCol); pushLineVert(pTip[0], pTip[1], pTip[2], ...aCol);
                        pushLineVert(w1[0], w1[1], w1[2], ...aCol); pushLineVert(pTip[0], pTip[1], pTip[2], ...aCol);
                        pushLineVert(w2[0], w2[1], w2[2], ...aCol); pushLineVert(pTip[0], pTip[1], pTip[2], ...aCol);
                        pushLineVert(w3[0], w3[1], w3[2], ...aCol); pushLineVert(pTip[0], pTip[1], pTip[2], ...aCol);
                        pushLineVert(w0[0], w0[1], w0[2], ...aCol); pushLineVert(w1[0], w1[1], w1[2], ...aCol);
                        pushLineVert(w1[0], w1[1], w1[2], ...aCol); pushLineVert(w2[0], w2[1], w2[2], ...aCol);
                        pushLineVert(w2[0], w2[1], w2[2], ...aCol); pushLineVert(w3[0], w3[1], w3[2], ...aCol);
                        pushLineVert(w3[0], w3[1], w3[2], ...aCol); pushLineVert(w0[0], w0[1], w0[2], ...aCol);
                    }

                    // Build Geodesic Trail
                    if (overlays.geodesic && geodesicPoints.length > 1) {
                        const count = Math.min(geodesicPoints.length, Math.floor(geodesicPoints.length * geodesicAnimProgress) + 1);
                        for (let i = 0; i < count - 1; i++) {
                            const pA = geodesicPoints[i];
                            const pB = geodesicPoints[i + 1];
                            const frac = i / geodesicPoints.length;
                            const brightness = 1.0 + frac * 2.0;
                            const gCol = [accent[0] * brightness, accent[1] * brightness, accent[2] * brightness, 0.9];

                            pushLineVert(pA[0], pA[1], pA[2], ...gCol);
                            pushLineVert(pB[0], pB[1], pB[2], ...gCol);
                        }
                    }

                    if (lineFloats.length > 0) {
                        gl.bindVertexArray(lineVao);
                        gl.bindBuffer(gl.ARRAY_BUFFER, lineVbo);
                        gl.bufferSubData(gl.ARRAY_BUFFER, 0, new Float32Array(lineFloats));

                        // Model transform applies to arrow & geodesic
                        progLine.use().mat4("uMVP", mvpMat);
                        gl.drawArrays(gl.LINES, 0, lineFloats.length / 7);
                    }
                }

                gl.bindVertexArray(null);
                gl.disable(gl.DEPTH_TEST);

                // Post-Processing: Dual-Kawase Bloom & ACES Filmic Tonemapping
                gfx.compose(sceneTarget, ctx2d, outW, outH, {
                    time: t,
                    bloomGain: 0.45,
                    threshold: 0.32,
                    exposure: 1.15
                });

                /* ===== 2D Overlay: On-Canvas Interactive Control Pills ===== */
                if (ctx2d) {
                    ctx2d.save();
                    const dpr = window.devicePixelRatio || 1;
                    ctx2d.scale(dpr, dpr);

                    const cssW = outW / dpr;
                    const cssH = outH / dpr;

                    // Draw subtle interactive pill rack at bottom-right
                    const btnH = 26;
                    const btnPad = 12;
                    let curX = cssW - 16;
                    const curY = cssH - 38;

                    ctx2d.font = "11px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
                    ctx2d.textBaseline = "middle";

                    for (let b = buttons.length - 1; b >= 0; b--) {
                        const btn = buttons[b];
                        const text = btn.label();
                        const textW = ctx2d.measureText(text).width;
                        const btnW = textW + btnPad * 2;
                        const bx = curX - btnW;

                        btn.bounds = { x: bx, y: curY, w: btnW, h: btnH };

                        // Button pill background
                        ctx2d.beginPath();
                        ctx2d.roundRect(bx, curY, btnW, btnH, 6);
                        ctx2d.fillStyle = "rgba(18, 22, 32, 0.78)";
                        ctx2d.fill();
                        ctx2d.lineWidth = 1;
                        ctx2d.strokeStyle = "rgba(255, 255, 255, 0.14)";
                        ctx2d.stroke();

                        // Button label
                        ctx2d.fillStyle = "rgba(235, 240, 255, 0.90)";
                        ctx2d.fillText(text, bx + btnPad, curY + btnH * 0.5);

                        curX -= (btnW + 8);
                    }
                    ctx2d.restore();
                }
            },
            dispose: () => {
                if (sceneTarget) sceneTarget.dispose();
                if (surfVao) gl.deleteVertexArray(surfVao);
                if (surfVbo) gl.deleteBuffer(surfVbo);
                if (surfEbo) gl.deleteBuffer(surfEbo);
                if (lineVao) gl.deleteVertexArray(lineVao);
                if (lineVbo) gl.deleteBuffer(lineVbo);
            }
        }));
    };
}));
