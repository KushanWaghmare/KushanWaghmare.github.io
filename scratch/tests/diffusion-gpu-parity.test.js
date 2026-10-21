/**
 * diffusion-gpu-parity.test.js
 *
 * GPU Parity Test for Score-Based Diffusion:
 * Verifies that the WebGL2 shader's score calculation at 1,000 random points and times
 * matches the CPU module (shared/lib/diffusion-math.js) within 1e-4 relative error (float32).
 */

"use strict";

const { serve, launch, sleep } = require("../audit/cdp");
const DM = require("../../shared/lib/diffusion-math");

console.log("=== SCORE-BASED DIFFUSION GPU PARITY TEST ===\n");

(async () => {
    const { srv, port } = await serve();
    const browser = await launch(9846);
    await browser.viewport(1440, 900);

    await browser.navigate(`http://127.0.0.1:${port}/datascience.html`);
    await sleep(800);

    console.log("Evaluating GPU Shader Score vs CPU Module at 1,000 random points & times...");

    const result = await browser.evaluate(`(() => {
        const GFX = window.GFX;
        const DM = window.DiffusionMath;
        if (!GFX || !GFX.supported || !DM) {
            return { error: "GFX or DiffusionMath not loaded" };
        }

        const gl = GFX.gl;
        const target = DM.getGalaxyTarget(192);
        const K = target.K;

        // 1. Upload mixture parameters texture (K x 2 RGBA32F)
        const mixData = new Float32Array(K * 2 * 4);
        for (let i = 0; i < K; i++) {
            const mu = target.means[i];
            const sk = target.stds[i];
            const w = target.weights[i];
            const idx0 = i * 4;
            mixData[idx0]     = mu[0];
            mixData[idx0 + 1] = mu[1];
            mixData[idx0 + 2] = mu[2];
            mixData[idx0 + 3] = sk;
            const idx1 = (K + i) * 4;
            mixData[idx1]     = w;
            mixData[idx1 + 1] = Math.log(w);
            mixData[idx1 + 2] = 0.0;
            mixData[idx1 + 3] = 1.0;
        }
        const mixTex = GFX.target(K, 2, { fp32: true, nearest: true, data: mixData });

        // 2. Generate 1,000 test points and random times
        const N = 1000;
        const ptsData = new Float32Array(N * 4);
        const testPoints = [];
        const testTimes = [];

        // Mulberry32 deterministic generator
        let a = 982451653;
        const prng = () => {
            a |= 0; a = (a + 0x6D2B79F5) | 0;
            let t = Math.imul(a ^ (a >>> 15), 1 | a);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };

        for (let i = 0; i < N; i++) {
            const px = (prng() - 0.5) * 3.2;
            const py = (prng() - 0.5) * 3.2;
            const pz = (prng() - 0.5) * 3.2;
            const pt = 0.02 + prng() * 0.96; // t in [0.02, 0.98]

            ptsData[i * 4]     = px;
            ptsData[i * 4 + 1] = py;
            ptsData[i * 4 + 2] = pz;
            ptsData[i * 4 + 3] = pt;

            testPoints.push([px, py, pz]);
            testTimes.push(pt);
        }

        const ptsTex = GFX.target(N, 1, { fp32: true, nearest: true, data: ptsData });
        const outTarget = GFX.target(N, 1, { fp32: true, nearest: true });

        // 3. Shader evaluating calcScore per fragment
        const fsParity = \`#version 300 es
precision highp float;
in vec2 vUV;
out vec4 fragColor;
uniform sampler2D uPoints;
uniform sampler2D uMixtureTex;
uniform int uK;

const float BETA_MIN = 0.1;
const float BETA_MAX = 20.0;

float calcBeta(float t) {
    return BETA_MIN + t * (BETA_MAX - BETA_MIN);
}

float calcAlpha(float t) {
    float exponent = -0.5 * BETA_MIN * t - 0.25 * (BETA_MAX - BETA_MIN) * t * t;
    return exp(exponent);
}

float calcSigma2(float t) {
    float a = calcAlpha(t);
    return max(0.0, 1.0 - a * a);
}

vec3 calcScore(vec3 x, float t, sampler2D mixTex, int K) {
    float at = calcAlpha(t);
    float at2 = at * at;
    float st2 = calcSigma2(t);

    float maxC = -1e20;
    for (int k = 0; k < K; k++) {
        vec4 p = texelFetch(mixTex, ivec2(k, 0), 0);
        vec3 mu = p.xyz;
        float sk = p.w;
        float logW = texelFetch(mixTex, ivec2(k, 1), 0).y;

        float vk = at2 * (sk * sk) + st2;
        vec3 d = x - at * mu;
        float distSq = dot(d, d);
        float ck = logW - 1.5 * log(vk) - distSq / (2.0 * vk);
        if (ck > maxC) maxC = ck;
    }

    float sumExp = 0.0;
    vec3 gradSum = vec3(0.0);
    for (int k = 0; k < K; k++) {
        vec4 p = texelFetch(mixTex, ivec2(k, 0), 0);
        vec3 mu = p.xyz;
        float sk = p.w;
        float logW = texelFetch(mixTex, ivec2(k, 1), 0).y;

        float vk = at2 * (sk * sk) + st2;
        vec3 d = x - at * mu;
        float distSq = dot(d, d);
        float ck = logW - 1.5 * log(vk) - distSq / (2.0 * vk);
        float rk = exp(ck - maxC);
        sumExp += rk;
        gradSum += rk * ((at * mu - x) / vk);
    }

    return gradSum / max(sumExp, 1e-12);
}

void main() {
    ivec2 p = ivec2(gl_FragCoord.xy);
    vec4 pt = texelFetch(uPoints, p, 0);
    vec3 sc = calcScore(pt.xyz, pt.w, uMixtureTex, uK);
    fragColor = vec4(sc, 1.0);
}
\`;

        const parityProg = GFX.program(GFX.VS_QUAD, fsParity);
        parityProg.use()
            .tex("uPoints", ptsTex, 0)
            .tex("uMixtureTex", mixTex, 1)
            .i1("uK", K);

        GFX.quad(parityProg, outTarget, N, 1);

        // 4. Read back GPU scores
        const gpuScores = new Float32Array(N * 4);
        gl.bindFramebuffer(gl.FRAMEBUFFER, outTarget.fbo);
        gl.readPixels(0, 0, N, 1, gl.RGBA, gl.FLOAT, gpuScores);

        // 5. Compare with CPU module in JavaScript
        let maxRelErr = 0.0;
        let sumRelErr = 0.0;
        let worstIdx = 0;
        let worstGPU = null;
        let worstCPU = null;

        for (let i = 0; i < N; i++) {
            const x = testPoints[i];
            const t = testTimes[i];
            const cpuScore = DM.score(x, t, target);

            const gx = gpuScores[i * 4];
            const gy = gpuScores[i * 4 + 1];
            const gz = gpuScores[i * 4 + 2];

            const dx = gx - cpuScore[0];
            const dy = gy - cpuScore[1];
            const dz = gz - cpuScore[2];
            const diffNorm = Math.hypot(dx, dy, dz);
            const cpuNorm = Math.hypot(cpuScore[0], cpuScore[1], cpuScore[2]);

            // Relative error with threshold stabilizer
            const relErr = diffNorm / Math.max(cpuNorm, 1e-4);
            sumRelErr += relErr;

            if (relErr > maxRelErr) {
                maxRelErr = relErr;
                worstIdx = i;
                worstGPU = [gx, gy, gz];
                worstCPU = cpuScore;
            }
        }

        mixTex.dispose();
        ptsTex.dispose();
        outTarget.dispose();

        return {
            count: N,
            maxRelErr,
            meanRelErr: sumRelErr / N,
            worstIdx,
            worstGPU,
            worstCPU
        };
    })()`);

    await browser.close();
    srv.close();

    console.log("GPU Parity Result:", JSON.stringify(result, null, 2));

    if (result.error) {
        console.error("FAIL:", result.error);
        process.exit(1);
    }

    const pass = result.maxRelErr < 1e-4;
    console.log("\n------------------------------------------------------------");
    if (pass) {
        console.log(`[PASS] Shader score matches CPU module within 1e-4 relative error!`);
        console.log(`  Measured Max Relative Error : ${result.maxRelErr.toExponential(4)} (< 1e-4)`);
        console.log(`  Measured Mean Relative Error: ${result.meanRelErr.toExponential(4)}`);
        console.log("------------------------------------------------------------\n");
        process.exit(0);
    } else {
        console.error(`[FAIL] Shader score relative error exceeded 1e-4 (actual: ${result.maxRelErr})`);
        console.log("------------------------------------------------------------\n");
        process.exit(1);
    }
})();
