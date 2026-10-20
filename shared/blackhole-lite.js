/* Ray-traced Schwarzschild black hole (WebGL1 fragment shader).
   Units: rs = 1 (M = 1/2). Horizon r = 1, photon sphere r = 1.5, ISCO r = 3.
   Null geodesics: d²x/dλ² = -(3/2) h² x / r⁵, with h = |x × dx/dλ| conserved.
   Integrated with RK4 along each pixel's ray. The disk is volumetric and
   emits blackbody light, Doppler-shifted and gravitationally redshifted. */
(() => {
    const root = typeof window !== "undefined" ? window : (typeof globalThis !== "undefined" ? globalThis : this);
    root.SIMS = root.SIMS || {};
    const SIMS = root.SIMS;
    const fallback2D = (c) => false;

    const VS = `
attribute vec2 a;
void main() { gl_Position = vec4(a, 0.0, 1.0); }`;

    const FS = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

uniform vec2 uRes;
uniform float uTime;
uniform float uTilt;
uniform float uFlare;
uniform float uExposure;
uniform vec3 uAccent;
uniform int uSteps;

#define MAX_STEPS 260
#define R_CAPTURE 1.02
#define R_ISCO 3.0
#define R_OUT 14.0
#define R_ESC 40.0
#define CAM_DIST 16.0
#define FOV 0.75

float hash1(vec3 p) {
    p = fract(p * 0.3183099 + vec3(0.1));
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}

float vnoise(vec3 x) {
    vec3 i = floor(x);
    vec3 f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    float n000 = hash1(i),                        n100 = hash1(i + vec3(1.0, 0.0, 0.0));
    float n010 = hash1(i + vec3(0.0, 1.0, 0.0)),  n110 = hash1(i + vec3(1.0, 1.0, 0.0));
    float n001 = hash1(i + vec3(0.0, 0.0, 1.0)),  n101 = hash1(i + vec3(1.0, 0.0, 1.0));
    float n011 = hash1(i + vec3(0.0, 1.0, 1.0)),  n111 = hash1(i + vec3(1.0));
    return mix(mix(mix(n000, n100, f.x), mix(n010, n110, f.x), f.y),
               mix(mix(n001, n101, f.x), mix(n011, n111, f.x), f.y), f.z);
}

float fbm3(vec3 p) {
    float s = 0.0;
    float amp = 0.5;
    for (int i = 0; i < 3; i++) {
        s += amp * vnoise(p);
        p *= 2.03;
        amp *= 0.5;
    }
    return s;
}

float fbm5(vec3 p) {
    float s = 0.0;
    float amp = 0.5;
    for (int i = 0; i < 5; i++) {
        s += amp * vnoise(p);
        p *= 2.02;
        amp *= 0.5;
    }
    return s;
}

float lum(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }

/* Approximate blackbody colour (Tanner Helland's fit), normalised to max channel 1 when lit. */
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

vec3 aces(vec3 x) {
    const float a = 2.51;
    const float b = 0.03;
    const float c = 2.43;
    const float d = 0.59;
    const float e = 0.14;
    return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
}

/* Stars: cell-hashed points with blackbody colour temperatures. */
vec3 stars(vec3 d, float cell, float density, float seed) {
    vec3 g = d * cell;
    vec3 id = floor(g);
    vec3 f = fract(g) - 0.5;
    float h = hash1(id + vec3(seed));
    float on = step(density, h);
    float core = exp(-dot(f, f) * 70.0);
    float T = mix(2800.0, 12000.0, fract(h * 91.7));
    float bright = 0.25 + 0.75 * fract(h * 53.1);
    return blackbody(T) * on * core * bright;
}

vec3 background(vec3 d) {
    vec3 s = stars(d, 240.0, 0.9962, 0.0) * 2.2
           + stars(d, 110.0, 0.9990, 11.0) * 1.6;
    vec3 n = normalize(vec3(0.25, 0.9, -0.35));
    float q = dot(d, n) * 4.5;
    float band = exp(-q * q);
    float glow = fbm5(d * 3.0 + vec3(7.0, 2.0, 1.0));
    float dust = fbm5(d * 6.0 + vec3(3.1, 1.7, 0.0));
    vec3 milky = vec3(0.55, 0.5, 0.75) * band * glow * 0.45 * (1.0 - 0.55 * smoothstep(0.35, 0.7, dust));
    vec3 neb = uAccent * 0.05 * fbm3(d * 2.0);
    return s + milky + neb;
}

/* Schwarzschild geodesic acceleration (rs = 1). */
vec3 accel(vec3 p, float h2) {
    float r2 = dot(p, p);
    float r5 = r2 * r2 * sqrt(r2);
    return -1.5 * h2 / r5 * p;
}

float diskH(float R) { return 0.05 + 0.035 * R; }

/* Novikov–Thorne flux shape for a Schwarzschild thin disk. */
float diskFlux(float R) {
    return max(0.0, (1.0 - sqrt(R_ISCO / R)) / (R * R * R));
}

/* Accumulate disk emission and absorption over a path segment ds at point p. */
void sampleDisk(vec3 p, vec3 ro, float ds, inout vec3 emit, inout float transm) {
    float R = length(p.xz);
    if (R < R_ISCO || R > R_OUT) return;

    float H = diskH(R);
    float y = p.y / H;
    if (abs(y) > 3.2) return;

    float phi = atan(p.z, p.x);
    float omega = sqrt(0.5 / (R * R * R));
    float phi2 = phi - uTime * 4.0 * omega;                 // Keplerian shear
    vec3 nc = vec3(R * 0.9, cos(phi2) * 1.4, sin(phi2) * 1.4);
    float turb = fbm3(nc + vec3(0.0, uTime * 0.05, 0.0));
    float arms = 0.5 + 0.5 * sin(4.0 * phi2 - 2.6 * log(R));
    float rho = exp(-0.5 * y * y) * (0.35 + 0.9 * turb) * (0.55 + 0.45 * arms);
    if (rho < 1e-3) return;

    // Temperature from flux, normalised so the peak is about 1.
    float tn = min(pow(diskFlux(R) / 0.0021, 0.25), 1.25);
    float Tk = 1500.0 + 6500.0 * tn;

    // Keplerian orbit: local speed, direction, and gravitational redshift.
    vec3 tang = normalize(vec3(-p.z, 0.0, p.x));
    float vOrb = min(sqrt(0.5 / (R - 1.0)), 0.75);
    float gam = 1.0 / sqrt(max(1e-3, 1.0 - vOrb * vOrb));
    vec3 toObs = normalize(ro - p);
    float cosA = dot(tang, toObs);
    float g = sqrt(max(0.0, 1.0 - 1.0 / R)) / (gam * (1.0 - vOrb * cosA));
    g = clamp(g, 0.2, 1.8);

    vec3 col = blackbody(Tk * g);
    col = mix(col, uAccent, 0.12);

    float intensity = pow(tn, 4.0) * pow(g, 4.0) * rho;
    emit += transm * col * intensity * ds * 2.2;
    transm *= exp(-2.0 * rho * ds);
}

void main() {
    vec2 uv = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y;

    float az = uTime * 0.04;
    float th = uTilt;
    vec3 ro = CAM_DIST * vec3(sin(th) * cos(az), cos(th), sin(th) * sin(az));
    vec3 fw = normalize(-ro);
    vec3 rt = normalize(cross(fw, vec3(0.0, 1.0, 0.0)));
    vec3 up = cross(rt, fw);
    vec3 v = normalize(fw + (uv.x * rt + uv.y * up) * FOV);

    vec3 p = ro;
    float h2 = dot(cross(p, v), cross(p, v));

    vec3 emit = vec3(0.0);
    float transm = 1.0;
    float rMin = 1e3;
    bool horizon = false;

    for (int i = 0; i < MAX_STEPS; i++) {
        if (i >= uSteps) break;

        float r = length(p);
        rMin = min(rMin, r);
        if (r < R_CAPTURE) { horizon = true; break; }
        if (r > R_ESC && dot(p, v) > 0.0) break;

        float dl = clamp(0.06 * r, 0.012, 0.22);
        if (abs(p.y) < 0.6) dl *= 0.5;

        // RK4 for (position, velocity).
        vec3 k1v = accel(p, h2);                  vec3 k1p = v;
        vec3 p2 = p + 0.5 * dl * k1p;             vec3 v2 = v + 0.5 * dl * k1v;
        vec3 k2v = accel(p2, h2);                 vec3 k2p = v2;
        vec3 p3 = p + 0.5 * dl * k2p;             vec3 v3 = v + 0.5 * dl * k2v;
        vec3 k3v = accel(p3, h2);                 vec3 k3p = v3;
        vec3 p4 = p + dl * k3p;                   vec3 v4 = v + dl * k3v;
        vec3 k4v = accel(p4, h2);                 vec3 k4p = v4;

        float ds = length(v) * dl;
        sampleDisk(p, ro, ds, emit, transm);

        p += dl / 6.0 * (k1p + 2.0 * k2p + 2.0 * k3p + k4p);
        v += dl / 6.0 * (k1v + 2.0 * k2v + 2.0 * k3v + k4v);

        if (transm < 0.003) break;
    }

    vec3 C = emit;
    float A;
    if (horizon) {
        A = 1.0;
    } else {
        vec3 bg = background(normalize(v));
        C += transm * bg;
        A = clamp(1.0 - transm + transm * lum(bg) * 2.0, 0.0, 1.0);
    }

    // Subtle bloom around the photon sphere (r = 1.5).
    float x = (rMin - 1.5) * 3.0;
    float glow = exp(-x * x) * (horizon ? 0.5 : transm);
    C += glow * vec3(1.0, 0.85, 0.6) * 0.12;
    A = clamp(A + glow * 0.15, 0.0, 1.0);

    vec3 c = aces(C / max(A, 1e-3) * uExposure);
    c += (hash1(vec3(gl_FragCoord.xy, uTime * 37.0)) - 0.5) * 0.012;
    gl_FragColor = vec4(pow(clamp(c, 0.0, 1.0), vec3(0.4545)), A);
}`;

    SIMS.blackholeLite = (c, fallback = fallback2D) => {
        const gl = c.getContext("webgl", { alpha: true, premultipliedAlpha: false, antialias: false });
        if (!gl) return fallback && fallback(c);

        const compile = (type, src) => {
            const s = gl.createShader(type);
            gl.shaderSource(s, src);
            gl.compileShader(s);
            if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
                console.warn("blackhole-lite shader:", gl.getShaderInfoLog(s));
                return null;
            }
            return s;
        };
        const vs = compile(gl.VERTEX_SHADER, VS);
        const fs = compile(gl.FRAGMENT_SHADER, FS);
        if (!vs || !fs) { c.style.visibility = "hidden"; return; }

        const prog = gl.createProgram();
        gl.attachShader(prog, vs);
        gl.attachShader(prog, fs);
        gl.linkProgram(prog);
        if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
            console.warn("blackhole-lite link:", gl.getProgramInfoLog(prog));
            c.style.visibility = "hidden";
            return;
        }
        gl.useProgram(prog);

        const buf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
        const aLoc = gl.getAttribLocation(prog, "a");
        gl.enableVertexAttribArray(aLoc);
        gl.vertexAttribPointer(aLoc, 2, gl.FLOAT, false, 0, 0);

        const U = {};
        ["uRes", "uTime", "uTilt", "uFlare", "uExposure", "uAccent", "uSteps"].forEach((n) => {
            U[n] = gl.getUniformLocation(prog, n);
        });

        const mobile = matchMedia("(max-width: 900px)").matches;
        const STEPS = mobile ? 130 : 200;
        const EXPOSURE = 1.25;
        const MIN_SCALE = 0.35, MAX_SCALE = 1.0;

        let W = 0, H = 0, DPR = 1, scale = mobile ? 0.5 : 0.7, ema = 16, fc = 0;
        let tilt = 0.9, tiltT = 0.9, flare = 0;

        const applyScale = () => {
            const bw = Math.max(2, Math.round(W * DPR * scale));
            const bh = Math.max(2, Math.round(H * DPR * scale));
            if (c.width !== bw || c.height !== bh) { c.width = bw; c.height = bh; }
            gl.viewport(0, 0, c.width, c.height);
        };
        KW.fit(c, (w, h, dpr) => { W = w; H = h; DPR = dpr; applyScale(); });

        const prevDispose = c.__dispose;
        c.__dispose = () => {
            try {
                const ext = gl.getExtension("WEBGL_lose_context");
                if (ext) ext.loseContext();
            } catch (e) {}
            if (prevDispose) prevDispose();
        };

        KW.onClick(c, () => { flare = 1; });
        KW.tag("Schwarzschild null geodesics, ray-traced with RK4 · volumetric blackbody disk · horizon r = 1 · ISCO r = 3 · cursor tilts · click flares", c);

        KW.loop(c, (t, dt) => {
            const p = KW.local(c);
            const inside = p.x > 0 && p.y > 0 && p.x < W && p.y < H;
            tiltT = inside ? 0.35 + 1.1 * Math.min(1, Math.max(0, p.y / H)) : 0.9;
            tilt += (tiltT - tilt) * Math.min(1, dt * 2.5);
            flare = Math.max(0, flare - dt * 0.8);

            ema += (dt * 1000 - ema) * 0.05;
            if (++fc % 30 === 0) {
                if (ema > 24 && scale > MIN_SCALE) { scale = Math.max(MIN_SCALE, scale * 0.9); applyScale(); }
                else if (ema < 14 && scale < MAX_SCALE) { scale = Math.min(MAX_SCALE, scale * 1.05); applyScale(); }
            }

            const a = KW.col.a;
            gl.uniform2f(U.uRes, c.width, c.height);
            gl.uniform1f(U.uTime, t);
            gl.uniform1f(U.uTilt, tilt);
            gl.uniform1f(U.uFlare, flare);
            gl.uniform1f(U.uExposure, EXPOSURE * (1.0 + 0.6 * flare));
            gl.uniform3f(U.uAccent, a[0] / 255, a[1] / 255, a[2] / 255);
            gl.uniform1i(U.uSteps, STEPS);
            gl.drawArrays(gl.TRIANGLES, 0, 3);
        });
    };
    if (typeof window !== "undefined") {
        window.BLACKHOLE_LITE = SIMS.blackholeLite;
    }
})();