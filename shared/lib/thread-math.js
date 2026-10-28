/* Unified 3D Math, Spatial Indexing, Curves & THREE Primitives (shared/lib/thread-math.js).
   Provides THREE.Vector3, THREE.Matrix4, THREE.PerspectiveCamera, THREE.BufferAttribute,
   THREE.BufferGeometry, THREE.Points, THREE.Scene, the Formation base class, 3D cubic Bézier
   and multi-origin spline arcs, divergence-free 3D curl noise, and 3D Morton spatial matching. */

(function (root, factory) {
    if (typeof module === "object" && module.exports) module.exports = factory(root);
    else {
        const api = factory(root);
        root.THREAD_MATH = api;
        if (!root.THREE) root.THREE = api.THREE;
    }
}(typeof self !== "undefined" ? self : this, function (root) {
    "use strict";

    const clamp = (x, a, b) => (x < a ? a : (x > b ? b : x));

    const smoothstep = (e0, e1, x) => {
        const t = clamp((x - e0) / Math.max(1e-7, e1 - e0), 0.0, 1.0);
        return t * t * (3.0 - 2.0 * t);
    };

    const smootherstep = (e0, e1, x) => {
        const t = clamp((x - e0) / Math.max(1e-7, e1 - e0), 0.0, 1.0);
        return t * t * t * (t * (t * 6.0 - 15.0) + 10.0);
    };

    /* Deterministic Mulberry32 PRNG for immutable particle seeds */
    const mulberry32 = (seed) => {
        let a = seed >>> 0;
        return () => {
            a = (a + 0x6D2B79F5) >>> 0;
            let t = Math.imul(a ^ (a >>> 15), 1 | a);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296.0;
        };
    };

    /* ---------- THREE-compatible 3D Primitives ---------- */
    class Vector3 {
        constructor(x = 0, y = 0, z = 0) {
            this.x = +x;
            this.y = +y;
            this.z = +z;
        }
        set(x, y, z) {
            this.x = +x;
            this.y = +y;
            this.z = +z;
            return this;
        }
        copy(v) {
            this.x = v.x;
            this.y = v.y;
            this.z = v.z;
            return this;
        }
        clone() {
            return new Vector3(this.x, this.y, this.z);
        }
        add(v) {
            this.x += v.x;
            this.y += v.y;
            this.z += v.z;
            return this;
        }
        addScaledVector(v, s) {
            this.x += v.x * s;
            this.y += v.y * s;
            this.z += v.z * s;
            return this;
        }
        sub(v) {
            this.x -= v.x;
            this.y -= v.y;
            this.z -= v.z;
            return this;
        }
        subVectors(a, b) {
            this.x = a.x - b.x;
            this.y = a.y - b.y;
            this.z = a.z - b.z;
            return this;
        }
        multiplyScalar(s) {
            this.x *= s;
            this.y *= s;
            this.z *= s;
            return this;
        }
        dot(v) {
            return this.x * v.x + this.y * v.y + this.z * v.z;
        }
        crossVectors(a, b) {
            const ax = a.x, ay = a.y, az = a.z;
            const bx = b.x, by = b.y, bz = b.z;
            this.x = ay * bz - az * by;
            this.y = az * bx - ax * bz;
            this.z = ax * by - ay * bx;
            return this;
        }
        lengthSq() {
            return this.x * this.x + this.y * this.y + this.z * this.z;
        }
        length() {
            return Math.hypot(this.x, this.y, this.z);
        }
        distanceTo(v) {
            return Math.hypot(this.x - v.x, this.y - v.y, this.z - v.z);
        }
        distanceToSquared(v) {
            const dx = this.x - v.x, dy = this.y - v.y, dz = this.z - v.z;
            return dx * dx + dy * dy + dz * dz;
        }
        normalize() {
            const len = Math.hypot(this.x, this.y, this.z);
            if (len > 1e-9) {
                const inv = 1.0 / len;
                this.x *= inv;
                this.y *= inv;
                this.z *= inv;
            }
            return this;
        }
        lerp(v, alpha) {
            this.x += (v.x - this.x) * alpha;
            this.y += (v.y - this.y) * alpha;
            this.z += (v.z - this.z) * alpha;
            return this;
        }
        lerpVectors(v1, v2, alpha) {
            this.x = v1.x + (v2.x - v1.x) * alpha;
            this.y = v1.y + (v2.y - v1.y) * alpha;
            this.z = v1.z + (v2.z - v1.z) * alpha;
            return this;
        }
        toArray(arr = [], offset = 0) {
            arr[offset] = this.x;
            arr[offset + 1] = this.y;
            arr[offset + 2] = this.z;
            return arr;
        }
    }

    class Matrix4 {
        constructor() {
            this.elements = new Float32Array([
                1, 0, 0, 0,
                0, 1, 0, 0,
                0, 0, 1, 0,
                0, 0, 0, 1
            ]);
        }
        identity() {
            const e = this.elements;
            e.fill(0);
            e[0] = e[5] = e[10] = e[15] = 1;
            return this;
        }
        makePerspective(fovDeg, aspect, near, far) {
            const e = this.elements;
            const f = 1.0 / Math.tan((fovDeg * Math.PI) / 360.0);
            const nf = 1.0 / (near - far);
            e.fill(0);
            e[0] = f / Math.max(0.05, aspect);
            e[5] = f;
            e[10] = (far + near) * nf;
            e[11] = -1.0;
            e[14] = 2.0 * far * near * nf;
            return this;
        }
        makeLookAt(eye, target, up) {
            const e = this.elements;
            let zx = eye.x - target.x, zy = eye.y - target.y, zz = eye.z - target.z;
            let zLen = Math.hypot(zx, zy, zz);
            if (zLen < 1e-8) { zz = 1; zLen = 1; }
            zx /= zLen; zy /= zLen; zz /= zLen;

            let xx = up.y * zz - up.z * zy;
            let xy = up.z * zx - up.x * zz;
            let xz = up.x * zy - up.y * zx;
            let xLen = Math.hypot(xx, xy, xz);
            if (xLen < 1e-8) { xx = 1; xLen = 1; }
            xx /= xLen; xy /= xLen; xz /= xLen;

            const yx = zy * xz - zz * xy;
            const yy = zz * xx - zx * xz;
            const yz = zx * xy - zy * xx;

            e[0] = xx; e[4] = xy; e[8] = xz;  e[12] = -(xx * eye.x + xy * eye.y + xz * eye.z);
            e[1] = yx; e[5] = yy; e[9] = yz;  e[13] = -(yx * eye.x + yy * eye.y + yz * eye.z);
            e[2] = zx; e[6] = zy; e[10] = zz; e[14] = -(zx * eye.x + zy * eye.y + zz * eye.z);
            e[3] = 0;  e[7] = 0;  e[11] = 0;  e[15] = 1;
            return this;
        }
        multiplyMatrices(a, b) {
            const ae = a.elements, be = b.elements, te = this.elements;
            const a11 = ae[0], a12 = ae[4], a13 = ae[8], a14 = ae[12];
            const a21 = ae[1], a22 = ae[5], a23 = ae[9], a24 = ae[13];
            const a31 = ae[2], a32 = ae[6], a33 = ae[10], a34 = ae[14];
            const a41 = ae[3], a42 = ae[7], a43 = ae[11], a44 = ae[15];

            const b11 = be[0], b12 = be[4], b13 = be[8], b14 = be[12];
            const b21 = be[1], b22 = be[5], b23 = be[9], b24 = be[13];
            const b31 = be[2], b32 = be[6], b33 = be[10], b34 = be[14];
            const b41 = be[3], b42 = be[7], b43 = be[11], b44 = be[15];

            te[0] = a11 * b11 + a12 * b21 + a13 * b31 + a14 * b41;
            te[4] = a11 * b12 + a12 * b22 + a13 * b32 + a14 * b42;
            te[8] = a11 * b13 + a12 * b23 + a13 * b33 + a14 * b43;
            te[12] = a11 * b14 + a12 * b24 + a13 * b34 + a14 * b44;

            te[1] = a21 * b11 + a22 * b21 + a23 * b31 + a24 * b41;
            te[5] = a21 * b12 + a22 * b22 + a23 * b32 + a24 * b42;
            te[9] = a21 * b13 + a22 * b23 + a23 * b33 + a24 * b43;
            te[13] = a21 * b14 + a22 * b24 + a23 * b34 + a24 * b44;

            te[2] = a31 * b11 + a32 * b21 + a33 * b31 + a34 * b41;
            te[6] = a31 * b12 + a32 * b22 + a33 * b32 + a34 * b42;
            te[10] = a31 * b13 + a32 * b23 + a33 * b33 + a34 * b43;
            te[14] = a31 * b14 + a32 * b24 + a33 * b34 + a34 * b44;

            te[3] = a41 * b11 + a42 * b21 + a43 * b31 + a44 * b41;
            te[7] = a41 * b12 + a42 * b22 + a43 * b32 + a44 * b42;
            te[11] = a41 * b13 + a42 * b23 + a43 * b33 + a44 * b43;
            te[15] = a41 * b14 + a42 * b24 + a43 * b34 + a44 * b44;
            return this;
        }
    }

    class PerspectiveCamera {
        constructor(fov = 48, aspect = 1, near = 0.1, far = 600) {
            this.fov = fov;
            this.aspect = aspect;
            this.near = near;
            this.far = far;
            this.position = new Vector3(0, 0, 14);
            this.target = new Vector3(0, 0, 0);
            this.up = new Vector3(0, 1, 0);
            this.projectionMatrix = new Matrix4();
            this.viewMatrix = new Matrix4();
            this.viewProjectionMatrix = new Matrix4();
        }
        updateMatrices() {
            this.projectionMatrix.makePerspective(this.fov, this.aspect, this.near, this.far);
            this.viewMatrix.makeLookAt(this.position, this.target, this.up);
            this.viewProjectionMatrix.multiplyMatrices(this.projectionMatrix, this.viewMatrix);
            return this.viewProjectionMatrix;
        }
    }

    class BufferAttribute {
        constructor(array, itemSize, dynamic = true) {
            this.array = array;
            this.itemSize = itemSize;
            this.count = array ? (array.length / itemSize) | 0 : 0;
            this.dynamic = dynamic;
            this.needsUpdate = true;
            this.version = 0;
        }
    }

    class BufferGeometry {
        constructor() {
            this.attributes = {};
            this.drawRange = { start: 0, count: Infinity };
        }
        setAttribute(name, attribute) {
            this.attributes[name] = attribute;
            return this;
        }
        getAttribute(name) {
            return this.attributes[name];
        }
        setDrawRange(start, count) {
            this.drawRange.start = start;
            this.drawRange.count = count;
        }
    }

    class Points {
        constructor(geometry, material = null) {
            this.isPoints = true;
            this.type = "Points";
            this.geometry = geometry;
            this.material = material;
            this.visible = true;
        }
    }

    class Scene {
        constructor() {
            this.type = "Scene";
            this.children = [];
        }
        add(obj) {
            if (obj && !this.children.includes(obj)) this.children.push(obj);
            return this;
        }
        remove(obj) {
            const idx = this.children.indexOf(obj);
            if (idx !== -1) this.children.splice(idx, 1);
            return this;
        }
    }

    /* ---------- Formation Base Interface ---------- */
    class Formation {
        constructor(origin = new Vector3(0, 0, 0), id = "formation") {
            this.origin = origin instanceof Vector3 ? origin : new Vector3(origin.x || 0, origin.y || 0, origin.z || 0);
            this.id = id;
            this.initialized = false;
            this.bloomStrength = 0.78;
            this.bloomThreshold = 0.80;
            this.trailDecay = 0.68;
            this.streakScale = 1.25;
            this.fogTint = [0.025, 0.045, 0.11];
            this.intensity = 1.0;
            this.reveal = 1.0;
        }
        setIntensity(val) {
            this.intensity = Math.max(0.0, Math.min(1.0, val));
        }
        setReveal(val) {
            this.reveal = Math.max(0.0, Math.min(1.0, val));
        }
        init(_buffer, _ctx) {
            this.initialized = true;
        }
        update(_dt, _t, _buffer, _ctx) {
            // Subclasses write live simulation positions, colours, sizes into buffer
        }
        targetFor(i, out = new Vector3()) {
            return out.copy(this.origin);
        }
        applyPreset(preset) {
            this.localePreset = preset;
        }
        dispose() {
            this.initialized = false;
        }
    }

    /* ---------- 3D World-Space Section Origins (Non-stacked path) ---------- */
    const HUB_ORIGINS = [
        new Vector3(0, 0, 0),          // 0: Intro (Lorenz strange attractor)
        new Vector3(44, -36, -62),     // 1: Mathematics (Calabi–Yau cross-section)
        new Vector3(-42, -72, -124),   // 2: Physics (Kerr black hole & accretion disc)
        new Vector3(46, -108, -186),   // 3: Data Science (Reverse-time score SDE)
        new Vector3(-44, -144, -248),  // 4: Quantitative Finance (3-D option crystal)
        new Vector3(40, -180, -310),   // 5: Computer Science (Grover / Shor quantum sim)
        new Vector3(0, -216, -372)     // 6: About & Contact (3-body figure-8 choreography)
    ];

    const sectionOrigin = (index) => {
        if (index >= 0 && index < HUB_ORIGINS.length) {
            return HUB_ORIGINS[index].clone();
        }
        const k = Math.max(0, index | 0);
        const angle = k * 1.35;
        return new Vector3(
            44.0 * Math.sin(angle),
            -36.0 * k,
            -62.0 * k
        );
    };

    /* ---------- 3D Cubic Bézier & Multi-Section Spline ---------- */
    const evalBezier3D = (p0, p1, p2, p3, t, out = new Vector3()) => {
        const u = 1.0 - t;
        const u2 = u * u, u3 = u2 * u;
        const t2 = t * t, t3 = t2 * t;
        const c0 = u3;
        const c1 = 3.0 * u2 * t;
        const c2 = 3.0 * u * t2;
        const c3 = t3;
        out.x = c0 * p0.x + c1 * p1.x + c2 * p2.x + c3 * p3.x;
        out.y = c0 * p0.y + c1 * p1.y + c2 * p2.y + c3 * p3.y;
        out.z = c0 * p0.z + c1 * p1.z + c2 * p2.z + c3 * p3.z;
        return out;
    };

    const evalBezierTangent3D = (p0, p1, p2, p3, t, out = new Vector3()) => {
        const u = 1.0 - t;
        const c0 = 3.0 * u * u;
        const c1 = 6.0 * u * t;
        const c2 = 3.0 * t * t;
        out.x = c0 * (p1.x - p0.x) + c1 * (p2.x - p1.x) + c2 * (p3.x - p2.x);
        out.y = c0 * (p1.y - p0.y) + c1 * (p2.y - p1.y) + c2 * (p3.y - p2.y);
        out.z = c0 * (p1.z - p0.z) + c1 * (p2.z - p1.z) + c2 * (p3.z - p2.z);
        return out.normalize();
    };

    /**
     * Computes symmetric 3D cubic Bézier control points between startPos and endPos.
     * Uses canonical ordering of (startPos, endPos) so reverse traversal follows
     * the exact mirrored 3D arc.
     */
    const computeArcControls = (startPos, endPos, pairIndex = 0) => {
        const forward = (startPos.y > endPos.y) || (startPos.y === endPos.y && startPos.z >= endPos.z);
        const a = forward ? startPos : endPos;
        const b = forward ? endPos : startPos;

        const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
        const chordLen = Math.max(1.0, Math.hypot(dx, dy, dz));
        const sign = (pairIndex % 2 === 0) ? 1.0 : -1.0;

        // Perpendicular offset in 3D so the hero sweeps a wide, cinematic 3D arc
        const perpX = -dz / chordLen * (0.36 * chordLen * sign);
        const perpY = 0.22 * chordLen;
        const perpZ = dx / chordLen * (0.28 * chordLen * sign) + 0.14 * chordLen;

        const c1Canon = new Vector3(
            a.x + dx * 0.28 + perpX,
            a.y + dy * 0.28 + perpY,
            a.z + dz * 0.28 + perpZ
        );
        const c2Canon = new Vector3(
            a.x + dx * 0.72 + perpX * 0.85,
            a.y + dy * 0.72 + perpY * 0.65,
            a.z + dz * 0.72 + perpZ * 0.85
        );

        return forward
            ? { p0: startPos.clone(), p1: c1Canon, p2: c2Canon, p3: endPos.clone() }
            : { p0: startPos.clone(), p1: c2Canon, p2: c1Canon, p3: endPos.clone() };
    };

    /**
     * Computes a low-altitude 3D cubic Bézier arc for intra-dimensional hops
     * between local anchors within a section. Starts from live hero particle
     * position with a gentle arc and smooth tangent continuity.
     */
    const computeHopArcControls = (startPos, endPos, initialVel) => {
        const dx = endPos.x - startPos.x;
        const dy = endPos.y - startPos.y;
        const dz = endPos.z - startPos.z;
        const chordLen = Math.max(0.1, Math.hypot(dx, dy, dz));
        const lift = Math.min(1.2, 0.22 * chordLen + 0.30);

        let c1;
        if (initialVel && (Math.abs(initialVel.x) > 0.01 || Math.abs(initialVel.y) > 0.01 || Math.abs(initialVel.z) > 0.01)) {
            const vLen = Math.max(0.01, Math.hypot(initialVel.x, initialVel.y, initialVel.z));
            const tangentScale = Math.min(chordLen * 0.35, vLen * 0.15);
            c1 = new Vector3(
                startPos.x + (initialVel.x / vLen) * tangentScale,
                startPos.y + (initialVel.y / vLen) * tangentScale + lift * 0.6,
                startPos.z + (initialVel.z / vLen) * tangentScale
            );
        } else {
            c1 = new Vector3(
                startPos.x + dx * 0.30,
                startPos.y + dy * 0.30 + lift,
                startPos.z + dz * 0.30 + lift * 0.3
            );
        }

        const c2 = new Vector3(
            startPos.x + dx * 0.70,
            startPos.y + dy * 0.70 + lift * 0.85,
            startPos.z + dz * 0.70 + lift * 0.2
        );

        return {
            p0: startPos.clone(),
            p1: c1,
            p2: c2,
            p3: endPos.clone()
        };
    };

    /**
     * Evaluates a multi-waypoint Catmull–Rom / cubic spline passing smoothly near
     * intermediate origins for multi-section nav jumps without stopping.
     */
    const evalWaypointSpline = (waypoints, t, out = new Vector3()) => {
        const n = waypoints.length;
        if (n === 0) return out.set(0, 0, 0);
        if (n === 1) return out.copy(waypoints[0]);
        if (n === 2) {
            const arc = computeArcControls(waypoints[0], waypoints[1], 0);
            return evalBezier3D(arc.p0, arc.p1, arc.p2, arc.p3, t, out);
        }
        const segs = n - 1;
        const scaled = clamp(t, 0, 1) * segs;
        const idx = Math.min(segs - 1, Math.floor(scaled));
        const lt = scaled - idx;

        const p0 = waypoints[Math.max(0, idx - 1)];
        const p1 = waypoints[idx];
        const p2 = waypoints[idx + 1];
        const p3 = waypoints[Math.min(n - 1, idx + 2)];

        const lt2 = lt * lt, lt3 = lt2 * lt;
        out.x = 0.5 * ((2 * p1.x) + (-p0.x + p2.x) * lt + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * lt2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * lt3);
        out.y = 0.5 * ((2 * p1.y) + (-p0.y + p2.y) * lt + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * lt2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * lt3);
        out.z = 0.5 * ((2 * p1.z) + (-p0.z + p2.z) * lt + (2 * p0.z - 5 * p1.z + 4 * p2.z - p3.z) * lt2 + (-p0.z + 3 * p1.z - 3 * p2.z + p3.z) * lt3);
        return out;
    };

    /* ---------- Divergence-Free 3D Curl Noise (Fast Trigonometric Potential) ---------- */
    const curlNoise3D = (x, y, z, t, out = new Vector3()) => {
        const sx = x * 0.42 + t * 0.65;
        const sy = y * 0.42 - t * 0.52;
        const sz = z * 0.42 + t * 0.48;

        // Vector potential Ψ = (Ψx, Ψy, Ψz); v = ∇ × Ψ is strictly divergence-free
        const dPsiZ_dy = Math.cos(sy * 1.3 + sz * 0.9) * 1.3 - Math.sin(sx * 0.7 - sy * 1.7) * 1.7;
        const dPsiY_dz = -Math.sin(sz * 1.4 + sx * 0.8) * 1.4 + Math.cos(sy * 0.9 + sz * 1.5) * 1.5;

        const dPsiX_dz = Math.cos(sz * 1.2 - sy * 1.1) * 1.2 - Math.sin(sx * 1.3 + sz * 1.6) * 1.6;
        const dPsiZ_dx = -Math.sin(sx * 1.5 + sy * 0.8) * 1.5 - Math.cos(sx * 0.7 - sy * 1.7) * 0.7;

        const dPsiY_dx = Math.cos(sx * 1.1 - sz * 1.3) * 1.1 + Math.sin(sy * 1.4 + sx * 1.2) * 1.2;
        const dPsiX_dy = -Math.sin(sy * 1.6 + sx * 0.9) * 1.6 - Math.cos(sz * 1.2 - sy * 1.1) * 1.1;

        out.x = (dPsiZ_dy - dPsiY_dz) * 0.35;
        out.y = (dPsiX_dz - dPsiZ_dx) * 0.35;
        out.z = (dPsiY_dx - dPsiX_dy) * 0.35;
        return out;
    };

    /* ---------- 3D Morton (Z-Order Space-Filling Curve) Spatial Matching ---------- */
    const expandBits10 = (v) => {
        let x = clamp(v | 0, 0, 1023);
        x = (x | (x << 16)) & 0x030000FF;
        x = (x | (x << 8))  & 0x0300F00F;
        x = (x | (x << 4))  & 0x030C30C3;
        x = (x | (x << 2))  & 0x09249249;
        return x >>> 0;
    };

    const mortonCode3D = (nx, ny, nz) => {
        const ix = expandBits10((clamp(nx, 0, 1) * 1023) | 0);
        const iy = expandBits10((clamp(ny, 0, 1) * 1023) | 0);
        const iz = expandBits10((clamp(nz, 0, 1) * 1023) | 0);
        return (ix | (iy << 1) | (iz << 2)) >>> 0;
    };

    /**
     * Sorts both source positions and target positions along a 3D Morton curve
     * and writes the non-crossing target assignment into `outTargetPositions` (Float32Array(N*3))
     * and the target index mapping into `outPerm` (Int32Array(N)).
     * Hero Particle #0 is always pinned to slot 0 so its identity and seed role are preserved.
     */
    const radixBuckets = new Int32Array(1024);
    let radixTmp = new Int32Array(90000);

    const computeSpatialMatching = (
        srcPositions,
        rawTargets,
        count,
        outMatchedTargets,
        outPerm,
        scratchSrcCodes,
        scratchDstCodes,
        scratchSrcOrder,
        scratchDstOrder
    ) => {
        const N = count | 0;
        if (N <= 0) return;

        let sMinX = Infinity, sMinY = Infinity, sMinZ = Infinity;
        let sMaxX = -Infinity, sMaxY = -Infinity, sMaxZ = -Infinity;
        let dMinX = Infinity, dMinY = Infinity, dMinZ = Infinity;
        let dMaxX = -Infinity, dMaxY = -Infinity, dMaxZ = -Infinity;

        for (let i = 0; i < N; i++) {
            const i3 = i * 3;
            const sx = srcPositions[i3], sy = srcPositions[i3 + 1], sz = srcPositions[i3 + 2];
            const dx = rawTargets[i3], dy = rawTargets[i3 + 1], dz = rawTargets[i3 + 2];
            if (sx < sMinX) sMinX = sx; if (sx > sMaxX) sMaxX = sx;
            if (sy < sMinY) sMinY = sy; if (sy > sMaxY) sMaxY = sy;
            if (sz < sMinZ) sMinZ = sz; if (sz > sMaxZ) sMaxZ = sz;
            if (dx < dMinX) dMinX = dx; if (dx > dMaxX) dMaxX = dx;
            if (dy < dMinY) dMinY = dy; if (dy > dMaxY) dMaxY = dy;
            if (dz < dMinZ) dMinZ = dz; if (dz > dMaxZ) dMaxZ = dz;
        }

        const sSpanX = 1.0 / Math.max(1e-5, sMaxX - sMinX);
        const sSpanY = 1.0 / Math.max(1e-5, sMaxY - sMinY);
        const sSpanZ = 1.0 / Math.max(1e-5, sMaxZ - sMinZ);
        const dSpanX = 1.0 / Math.max(1e-5, dMaxX - dMinX);
        const dSpanY = 1.0 / Math.max(1e-5, dMaxY - dMinY);
        const dSpanZ = 1.0 / Math.max(1e-5, dMaxZ - dMinZ);

        for (let i = 0; i < N; i++) {
            const i3 = i * 3;
            scratchSrcCodes[i] = i === 0 ? 0 : mortonCode3D(
                (srcPositions[i3] - sMinX) * sSpanX,
                (srcPositions[i3 + 1] - sMinY) * sSpanY,
                (srcPositions[i3 + 2] - sMinZ) * sSpanZ
            );
            scratchDstCodes[i] = i === 0 ? 0 : mortonCode3D(
                (rawTargets[i3] - dMinX) * dSpanX,
                (rawTargets[i3 + 1] - dMinY) * dSpanY,
                (rawTargets[i3 + 2] - dMinZ) * dSpanZ
            );
            scratchSrcOrder[i] = i;
            scratchDstOrder[i] = i;
        }

        // Radix sort 30-bit Morton codes in 3 passes of 10 bits (zero allocation, O(N) time)
        const radixSortIndices = (order, codes, n) => {
            // Keep index 0 pinned at position 0 (Hero Particle #0)
            const subLen = n - 1;
            if (subLen <= 1) return;
            if (radixTmp.length < subLen) radixTmp = new Int32Array(subLen);
            for (let shift = 0; shift < 30; shift += 10) {
                radixBuckets.fill(0);
                for (let k = 1; k < n; k++) {
                    const c = (codes[order[k]] >>> shift) & 1023;
                    radixBuckets[c]++;
                }
                let sum = 0;
                for (let b = 0; b < 1024; b++) {
                    const cnt = radixBuckets[b];
                    radixBuckets[b] = sum;
                    sum += cnt;
                }
                for (let k = 1; k < n; k++) {
                    const idx = order[k];
                    const c = (codes[idx] >>> shift) & 1023;
                    radixTmp[radixBuckets[c]++] = idx;
                }
                for (let k = 0; k < subLen; k++) {
                    order[k + 1] = radixTmp[k];
                }
            }
        };

        radixSortIndices(scratchSrcOrder, scratchSrcCodes, N);
        radixSortIndices(scratchDstOrder, scratchDstCodes, N);

        outPerm[0] = 0;
        outMatchedTargets[0] = rawTargets[0];
        outMatchedTargets[1] = rawTargets[1];
        outMatchedTargets[2] = rawTargets[2];

        for (let k = 1; k < N; k++) {
            const pIdx = scratchSrcOrder[k];
            const tIdx = scratchDstOrder[k];
            outPerm[pIdx] = tIdx;
            const p3 = pIdx * 3, t3 = tIdx * 3;
            outMatchedTargets[p3] = rawTargets[t3];
            outMatchedTargets[p3 + 1] = rawTargets[t3 + 1];
            outMatchedTargets[p3 + 2] = rawTargets[t3 + 2];
        }
    };

    const THREE = {
        Vector3,
        Matrix4,
        PerspectiveCamera,
        BufferAttribute,
        BufferGeometry,
        Points,
        Scene
    };

    return {
        THREE,
        Vector3,
        Matrix4,
        PerspectiveCamera,
        BufferAttribute,
        BufferGeometry,
        Points,
        Scene,
        Formation,
        HUB_ORIGINS,
        sectionOrigin,
        clamp,
        smoothstep,
        smootherstep,
        mulberry32,
        evalBezier3D,
        evalBezierTangent3D,
        computeArcControls,
        computeHopArcControls,
        evalWaypointSpline,
        curlNoise3D,
        mortonCode3D,
        computeSpatialMatching
    };
}));
