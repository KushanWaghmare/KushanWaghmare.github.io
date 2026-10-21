/* GPU Möbius Strip Simulation (shared/gpu/gpu-math.js).
   256x32 parametric surface mesh with analytic normals and seam glueing (v -> -v).
   Fresnel + thin-film iridescence palette, procedural gradient environment light,
   Dual-Kawase bloom, and a 4pi glowing pulse along v = w/2 showing single-sidedness. */

(function (root, factory) {
    if (typeof module === "object" && module.exports) module.exports = factory(root);
    else factory(root);
}(typeof self !== "undefined" ? self : this, function (root) {
    "use strict";

    root.SIMS = root.SIMS || {};
    const SIMS = root.SIMS;
    const GFX = root.GFX;

    const VS_MOBIUS = `#version 300 es
precision highp float;
layout(location = 0) in vec2 aUV; // x = u in [0, 1], y = v in [0, 1]
uniform mat4 uMVP;
uniform mat4 uModel;
uniform float uPulseTime; // 4pi period pulse
uniform float uTwist;     // twist parameter (default 1.0)
out vec3 vNormal;
out vec3 vWorldPos;
out vec2 vCoord;
out float vPulse;

void main() {
    float u = aUV.x * 6.28318530718;
    float v = (aUV.y - 0.5) * 1.6; // v in [-0.8, 0.8]
    float halfU = u * 0.5 * uTwist;

    float rad = 2.0 + v * cos(halfU);
    vec3 pos = vec3(rad * cos(u), rad * sin(u), v * sin(halfU));

    // Analytic tangents:
    vec3 xu = vec3(
        -rad * sin(u) - 0.5 * uTwist * v * sin(halfU) * cos(u),
         rad * cos(u) - 0.5 * uTwist * v * sin(halfU) * sin(u),
         0.5 * uTwist * v * cos(halfU)
    );
    vec3 xv = vec3(cos(halfU) * cos(u), cos(halfU) * sin(u), sin(halfU));
    vec3 norm = normalize(cross(xu, xv));

    vNormal = normalize(mat3(uModel) * norm);
    vec4 world = uModel * vec4(pos, 1.0);
    vWorldPos = world.xyz;
    vCoord = aUV;

    // Glowing pulse at v = 0.5 (which is v = w/2) taking 4pi to complete one closed circuit
    float loopU = aUV.x * 6.28318530718 + (aUV.y > 0.5 ? 0.0 : 6.28318530718);
    float pulseDist = abs(fract((uPulseTime - aUV.x * 0.5)) - 0.5);
    float vDist = abs(aUV.y - 0.75); // along v = w/2
    vPulse = exp(-pulseDist * pulseDist * 180.0) * exp(-vDist * vDist * 120.0);

    gl_Position = uMVP * vec4(pos, 1.0);
}`;

    const FS_MOBIUS = `#version 300 es
precision highp float;
in vec3 vNormal;
in vec3 vWorldPos;
in vec2 vCoord;
in float vPulse;
out vec4 fragColor;

uniform vec3 uCamPos;
uniform vec3 uAccent;
uniform float uTime;

// Thin-film iridescent interference colours
vec3 thinFilm(float cosTheta) {
    float d = 380.0 + 320.0 * (1.0 - cosTheta);
    vec3 phase = 6.2831853 * d / vec3(650.0, 532.0, 440.0);
    return 0.5 + 0.5 * cos(phase);
}

void main() {
    vec3 N = normalize(vNormal);
    vec3 V = normalize(uCamPos - vWorldPos);
    float NdotV = abs(dot(N, V)); // Two-sided rendering

    // Thin-film iridescence + Fresnel term
    float fresnel = pow(1.0 - NdotV, 3.0);
    vec3 irid = thinFilm(NdotV);

    // Procedural gradient environment lighting
    vec3 upCol = vec3(0.04, 0.06, 0.12) + uAccent * 0.08;
    vec3 downCol = vec3(0.015, 0.018, 0.025);
    vec3 env = mix(downCol, upCol, N.y * 0.5 + 0.5);

    // Specular highlight from directional light
    vec3 L = normalize(vec3(0.6, 0.8, 0.5));
    vec3 H = normalize(L + V);
    float spec = pow(max(abs(dot(N, H)), 0.0), 32.0);

    // Base body color
    vec3 base = mix(uAccent * 0.35, irid * 0.7, fresnel);
    vec3 col = env * base + vec3(1.0, 0.95, 0.9) * spec * 0.65;

    // Glowing 4pi boundary traversal pulse (super-luminous HDR for bloom)
    vec3 pulseCol = mix(vec3(1.0), uAccent * 1.5, 0.4);
    col += pulseCol * vPulse * 4.5;

    // Subtle edge rim along outer boundary v = 0 or v = 1
    float edge = smoothstep(0.0, 0.04, vCoord.y) * smoothstep(1.0, 0.96, vCoord.y);
    col = mix(uAccent * 1.8, col, edge);

    fragColor = vec4(col, 1.0);
}`;

    SIMS["mobius-surfaces"] = (canvas, opts = {}) => {
        if (!GFX || !GFX.supported) {
            if (root.ENGINES && root.ENGINES.surface) {
                return root.ENGINES.surface(canvas, { type: "mobius", twists: 1, uSeg: 180, vSeg: 18 });
            }
            return null;
        }

        const uSeg = 256;
        const vSeg = 32;
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

        // Indices: triangle strip / quads with seam flip glueing
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

        const gl = GFX.gl;
        let vao = null, vbo = null, ebo = null;
        const setupBuffers = () => {
            if (vao) return;
            vao = gl.createVertexArray();
            vbo = gl.createBuffer();
            ebo = gl.createBuffer();
            gl.bindVertexArray(vao);
            gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
            gl.bufferData(gl.ARRAY_BUFFER, uvData, gl.STATIC_DRAW);
            gl.enableVertexAttribArray(0);
            gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
            gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ebo);
            gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indexData, gl.STATIC_DRAW);
            gl.bindVertexArray(null);
        };

        const prog = GFX.program(VS_MOBIUS, FS_MOBIUS);
        let sceneTarget = null;
        let camYaw = 0.5, camPitch = 0.35;
        let pulseTime = 0.0;

        KW.tag("Möbius manifold · non-orientable · 256×32 analytic normals · 4π pulse shows one side · cursor yaw/pitch", canvas);

        return GFX.mount(canvas, (gfx, c, getSize) => ({
            resize: (rw, rh) => {
                setupBuffers();
                if (!sceneTarget) sceneTarget = gfx.target(rw, rh, { fp32: false, depth: true });
                else sceneTarget.resize(rw, rh);
            },
            frame: (t, dt, ctx2d, outW, outH, isReduced) => {
                const cursor = KW.local(canvas);
                const aspect = sceneTarget.w / Math.max(1, sceneTarget.h);
                const hasMouse = cursor.x > -500;

                const targetYaw = hasMouse ? (cursor.x / (canvas.clientWidth || 800) - 0.5) * 2.8 : t * 0.22;
                const targetPitch = hasMouse ? (cursor.y / (canvas.clientHeight || 600) - 0.5) * 1.5 : 0.35 + 0.18 * Math.sin(t * 0.3);
                camYaw += (targetYaw - camYaw) * Math.min(1.0, dt * 4.0);
                camPitch += (targetPitch - camPitch) * Math.min(1.0, dt * 4.0);

                const dist = 5.6;
                const camX = dist * Math.sin(camYaw) * Math.cos(camPitch);
                const camY = dist * Math.sin(camPitch);
                const camZ = dist * Math.cos(camYaw) * Math.cos(camPitch);

                // Projection
                const fov = 45.0 * (Math.PI / 180.0);
                const f = 1.0 / Math.tan(fov * 0.5);
                const near = 0.1, far = 30.0;
                const isMob = typeof window !== "undefined" && window.innerWidth <= 900;
                const sx = isMob ? 0.0 : -0.48;
                const proj = new Float32Array([
                    f / aspect, 0, 0, 0,
                    0, f, 0, 0,
                    sx, 0, (far + near) / (near - far), -1,
                    0, 0, (2.0 * far * near) / (near - far), 0
                ]);

                // View
                const zLen = Math.hypot(camX, camY, camZ);
                const zAxis = [camX / zLen, camY / zLen, camZ / zLen];
                const up = [0, 1, 0];
                const xRaw = [up[1] * zAxis[2] - up[2] * zAxis[1], up[2] * zAxis[0] - up[0] * zAxis[2], up[0] * zAxis[1] - up[1] * zAxis[0]];
                const xLen = Math.hypot(...xRaw);
                const xAxis = [xRaw[0] / xLen, xRaw[1] / xLen, xRaw[2] / xLen];
                const yAxis = [zAxis[1] * xAxis[2] - zAxis[2] * xAxis[1], zAxis[2] * xAxis[0] - zAxis[0] * xAxis[2], zAxis[0] * xAxis[1] - zAxis[1] * xAxis[0]];

                const view = new Float32Array([
                    xAxis[0], yAxis[0], zAxis[0], 0,
                    xAxis[1], yAxis[1], zAxis[1], 0,
                    xAxis[2], yAxis[2], zAxis[2], 0,
                    -(xAxis[0] * camX + xAxis[1] * camY + xAxis[2] * camZ),
                    -(yAxis[0] * camX + yAxis[1] * camY + yAxis[2] * camZ),
                    -(zAxis[0] * camX + zAxis[1] * camY + zAxis[2] * camZ), 1
                ]);

                // Model (gentle roll)
                const roll = t * 0.1;
                const cosR = Math.cos(roll), sinR = Math.sin(roll);
                const model = new Float32Array([
                    cosR, 0, sinR, 0,
                    0, 1, 0, 0,
                    -sinR, 0, cosR, 0,
                    0, 0, 0, 1
                ]);

                // MVP = Proj * View * Model
                const vm = new Float32Array(16);
                for (let i = 0; i < 4; i++) {
                    for (let j = 0; j < 4; j++) {
                        let sum = 0;
                        for (let k = 0; k < 4; k++) sum += model[i * 4 + k] * view[k * 4 + j];
                        vm[i * 4 + j] = sum;
                    }
                }
                const mvp = new Float32Array(16);
                for (let i = 0; i < 4; i++) {
                    for (let j = 0; j < 4; j++) {
                        let sum = 0;
                        for (let k = 0; k < 4; k++) sum += vm[i * 4 + k] * proj[k * 4 + j];
                        mvp[i * 4 + j] = sum;
                    }
                }

                pulseTime = (pulseTime + dt * 0.25) % 2.0;

                // Render into HDR depth target
                gl.bindFramebuffer(gl.FRAMEBUFFER, sceneTarget.fbo);
                gl.viewport(0, 0, sceneTarget.w, sceneTarget.h);
                gl.clearColor(0, 0, 0, 1);
                gl.clearDepth(1.0);
                gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
                gl.enable(gl.DEPTH_TEST);
                gl.depthFunc(gl.LEQUAL);

                const a = KW.col.a;
                prog.use()
                    .mat4("uMVP", mvp)
                    .mat4("uModel", model)
                    .f3("uCamPos", camX, camY, camZ)
                    .f3("uAccent", a[0] / 255, a[1] / 255, a[2] / 255)
                    .f1("uPulseTime", isReduced ? 0.2 : pulseTime)
                    .f1("uTwist", 1.0)
                    .f1("uTime", t);

                gl.bindVertexArray(vao);
                gl.drawElements(gl.TRIANGLES, numIndices, gl.UNSIGNED_SHORT, 0);
                gl.bindVertexArray(null);
                gl.disable(gl.DEPTH_TEST);

                // Post-processing
                gfx.compose(sceneTarget, ctx2d, outW, outH, {
                    time: t,
                    bloomGain: 0.52,
                    threshold: 0.32,
                    exposure: 1.18
                });
            },
            dispose: () => {
                if (sceneTarget) sceneTarget.dispose();
                if (vao) gl.deleteVertexArray(vao);
                if (vbo) gl.deleteBuffer(vbo);
                if (ebo) gl.deleteBuffer(ebo);
            }
        }));
    };

    SIMS.math = SIMS["mobius-surfaces"];
}));
