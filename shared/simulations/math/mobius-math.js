/**
 * shared/lib/mobius-math.js
 *
 * Mathematical core for the Möbius strip simulation (Phase 2).
 *
 * Implements:
 *   - Parametric surface r(u, v) for integer half-twists k >= 1
 *   - Analytic tangents r_u, r_v, fundamental forms (E, F = 0, G = 1)
 *   - Analytic second fundamental form (N = 0) and Gaussian curvature K = -(kR/2)^2 / E^2
 *   - Normal vector n(u, v) and non-orientable transport n(2pi, v) = -n(0, -v)
 *   - Welded mesh generator with seam rule ((2pi, v) -> (0, -v) for k odd)
 *   - Mesh topology validator (Euler characteristic chi = 0, boundary loops = gcd(2, k), orientability)
 *   - Levi-Civita geodesic equations on (E du^2 + dv^2) with RK4 integrator
 *   - Gauss-Legendre quadrature (arbitrary n) and Gauss-Bonnet verification:
 *       iint_M K dA + oint_{partial M} k_g ds = 2pi chi = 0
 *   - Boundary knot and link geometry (trefoil, Hopf link, minimum self-distance)
 *
 * Pure JavaScript, no dependencies, UMD pattern.
 */

(function (root, factory) {
    if (typeof module === "object" && module.exports) module.exports = factory();
    else root.MobiusMath = factory();
}(typeof self !== "undefined" ? self : this, function () {
    "use strict";

    const DEFAULT_R = 2.05;
    const DEFAULT_W = 0.85;

    /* ---------- 1. Surface Parametrisation ---------- */
    const surface = (u, v, k = 1, R = DEFAULT_R) => {
        const a = 0.5 * k * u;
        const ca = Math.cos(a), sa = Math.sin(a);
        const cu = Math.cos(u), su = Math.sin(u);
        const rho = R + v * ca;
        return [
            rho * cu,
            rho * su,
            v * sa
        ];
    };

    /* ---------- 2. Analytic Tangents ---------- */
    const tangents = (u, v, k = 1, R = DEFAULT_R) => {
        const a = 0.5 * k * u;
        const ca = Math.cos(a), sa = Math.sin(a);
        const cu = Math.cos(u), su = Math.sin(u);
        const rho = R + v * ca;
        const kv2 = 0.5 * k * v;

        const ru = [
            -kv2 * sa * cu - rho * su,
            -kv2 * sa * su + rho * cu,
            kv2 * ca
        ];
        const rv = [
            ca * cu,
            ca * su,
            sa
        ];
        return { ru, rv };
    };

    /* ---------- 3. First Fundamental Form ---------- */
    const firstFundamentalForm = (u, v, k = 1, R = DEFAULT_R) => {
        const a = 0.5 * k * u;
        const ca = Math.cos(a);
        const rho = R + v * ca;
        const kv2 = 0.5 * k * v;

        const E = rho * rho + kv2 * kv2;
        const F = 0.0;
        const G = 1.0;
        return { E, F, G, rho };
    };

    const metricDerivatives = (u, v, k = 1, R = DEFAULT_R) => {
        const a = 0.5 * k * u;
        const ca = Math.cos(a), sa = Math.sin(a);
        const rho = R + v * ca;
        const Eu = -k * v * rho * sa;
        const Ev = 2.0 * rho * ca + 0.5 * k * k * v;
        return { Eu, Ev };
    };

    /* ---------- 4. Surface Normal Vector ---------- */
    const normal = (u, v, k = 1, R = DEFAULT_R) => {
        const { ru, rv } = tangents(u, v, k, R);
        const nx = ru[1] * rv[2] - ru[2] * rv[1];
        const ny = ru[2] * rv[0] - ru[0] * rv[2];
        const nz = ru[0] * rv[1] - ru[1] * rv[0];
        const len = Math.hypot(nx, ny, nz);
        return len > 0.0 ? [nx / len, ny / len, nz / len] : [0.0, 0.0, 1.0];
    };

    /* ---------- 5. Second Fundamental Form & Curvature ---------- */
    const secondFundamentalForm = (u, v, k = 1, R = DEFAULT_R) => {
        const a = 0.5 * k * u;
        const ca = Math.cos(a), sa = Math.sin(a);
        const cu = Math.cos(u), su = Math.sin(u);
        const rho = R + v * ca;
        const kv2 = 0.5 * k * v;
        const k2v4 = 0.25 * k * k * v;

        const ruu = [
            -k2v4 * ca * cu + 2.0 * kv2 * sa * su - rho * cu,
            -k2v4 * ca * su - 2.0 * kv2 * sa * cu - rho * su,
            -k2v4 * sa
        ];
        const ruv = [
            -0.5 * k * sa * cu - ca * su,
            -0.5 * k * sa * su + ca * cu,
            0.5 * k * ca
        ];
        const rvv = [0.0, 0.0, 0.0];

        const n = normal(u, v, k, R);
        const L = ruu[0] * n[0] + ruu[1] * n[1] + ruu[2] * n[2];
        const M = ruv[0] * n[0] + ruv[1] * n[1] + ruv[2] * n[2];
        const N = 0.0;

        return { L, M, N, ruu, ruv, rvv, n };
    };

    const curvature = (u, v, k = 1, R = DEFAULT_R) => {
        const { E } = firstFundamentalForm(u, v, k, R);
        const kR2 = 0.5 * k * R;
        return -(kR2 * kR2) / (E * E);
    };

    /* ---------- 6. Geodesics (Levi-Civita Connection & RK4) ---------- */
    const geodesicDeriv = (S, k = 1, R = DEFAULT_R) => {
        const [u, v, du, dv] = S;
        const { E } = firstFundamentalForm(u, v, k, R);
        const { Eu, Ev } = metricDerivatives(u, v, k, R);

        const ddu = -(Eu / (2.0 * E)) * du * du - (Ev / E) * du * dv;
        const ddv = (0.5 * Ev) * du * du;
        return [du, dv, ddu, ddv];
    };

    const rk4Step = (S, dt, k = 1, R = DEFAULT_R) => {
        const k1 = geodesicDeriv(S, k, R);
        const S2 = [
            S[0] + 0.5 * dt * k1[0],
            S[1] + 0.5 * dt * k1[1],
            S[2] + 0.5 * dt * k1[2],
            S[3] + 0.5 * dt * k1[3]
        ];
        const k2 = geodesicDeriv(S2, k, R);
        const S3 = [
            S[0] + 0.5 * dt * k2[0],
            S[1] + 0.5 * dt * k2[1],
            S[2] + 0.5 * dt * k2[2],
            S[3] + 0.5 * dt * k2[3]
        ];
        const k3 = geodesicDeriv(S3, k, R);
        const S4 = [
            S[0] + dt * k3[0],
            S[1] + dt * k3[1],
            S[2] + dt * k3[2],
            S[3] + dt * k3[3]
        ];
        const k4 = geodesicDeriv(S4, k, R);

        return [
            S[0] + (dt / 6.0) * (k1[0] + 2.0 * k2[0] + 2.0 * k3[0] + k4[0]),
            S[1] + (dt / 6.0) * (k1[1] + 2.0 * k2[1] + 2.0 * k3[1] + k4[1]),
            S[2] + (dt / 6.0) * (k1[2] + 2.0 * k2[2] + 2.0 * k3[2] + k4[2]),
            S[3] + (dt / 6.0) * (k1[3] + 2.0 * k2[3] + 2.0 * k3[3] + k4[3])
        ];
    };

    const geodesicSpeedSq = (S, k = 1, R = DEFAULT_R) => {
        const [u, v, du, dv] = S;
        const { E } = firstFundamentalForm(u, v, k, R);
        return E * du * du + dv * dv;
    };

    const integrateGeodesic = (S0, dt, steps, k = 1, R = DEFAULT_R) => {
        const trajectory = [S0.slice()];
        let S = S0.slice();
        for (let i = 0; i < steps; i++) {
            S = rk4Step(S, dt, k, R);
            trajectory.push(S.slice());
        }
        return trajectory;
    };

    /* ---------- 7. Gauss-Legendre Quadrature & Gauss-Bonnet ---------- */
    const gaussLegendre = (n) => {
        const x = new Float64Array(n);
        const w = new Float64Array(n);
        const m = Math.floor((n + 1) / 2);
        for (let i = 0; i < m; i++) {
            let z = Math.cos(Math.PI * (i + 0.75) / (n + 0.5));
            let pp = 0.0;
            for (let iter = 0; iter < 100; iter++) {
                let p1 = 1.0, p2 = 0.0;
                for (let j = 1; j <= n; j++) {
                    const p3 = p2;
                    p2 = p1;
                    p1 = ((2.0 * j - 1.0) * z * p2 - (j - 1.0) * p3) / j;
                }
                pp = n * (z * p1 - p2) / (z * z - 1.0);
                const z1 = z;
                z = z1 - p1 / pp;
                if (Math.abs(z - z1) < 1e-15) break;
            }
            x[i] = -z;
            x[n - 1 - i] = z;
            w[i] = 2.0 / ((1.0 - z * z) * pp * pp);
            w[n - 1 - i] = w[i];
        }
        return { x, w };
    };

    const gaussBonnet = (k = 1, R = DEFAULT_R, width = DEFAULT_W, nNodes = 80) => {
        const gl = gaussLegendre(nNodes);

        // Area integral: u in [0, 2pi], v in [-width, width]
        let areaIntegral = 0.0;
        for (let i = 0; i < nNodes; i++) {
            const u = Math.PI * (gl.x[i] + 1.0);
            const wu = gl.w[i] * Math.PI;
            const a = 0.5 * k * u;
            const ca = Math.cos(a);

            for (let j = 0; j < nNodes; j++) {
                const v = width * gl.x[j];
                const wv = gl.w[j] * width;

                const rho = R + v * ca;
                const E = rho * rho + Math.pow(0.5 * k * v, 2.0);
                const K = -Math.pow(0.5 * k * R, 2.0) / (E * E);
                const dA = Math.sqrt(E);
                areaIntegral += K * dA * wu * wv;
            }
        }

        // Boundary integral:
        // conormal inward: nu_in = -r_v on v = +w; nu_in = +r_v on v = -w
        // kg ds = (Ev / (2 * sqrt(E))) du at v = +w
        // kg ds = -(Ev / (2 * sqrt(E))) du at v = -w
        let boundaryIntegral = 0.0;
        for (let i = 0; i < nNodes; i++) {
            const u = Math.PI * (gl.x[i] + 1.0);
            const wu = gl.w[i] * Math.PI;
            const a = 0.5 * k * u;
            const ca = Math.cos(a);

            // Boundary 1: v = +width
            const rhoP = R + width * ca;
            const EP = rhoP * rhoP + Math.pow(0.5 * k * width, 2.0);
            const EvP = 2.0 * rhoP * ca + 0.5 * k * k * width;
            const kgDsP = EvP / (2.0 * Math.sqrt(EP));

            // Boundary 2: v = -width
            const rhoM = R - width * ca;
            const EM = rhoM * rhoM + Math.pow(0.5 * k * -width, 2.0);
            const EvM = 2.0 * rhoM * ca + 0.5 * k * k * -width;
            const kgDsM = -EvM / (2.0 * Math.sqrt(EM));

            boundaryIntegral += (kgDsP + kgDsM) * wu;
        }

        const total = areaIntegral + boundaryIntegral;
        return { areaIntegral, boundaryIntegral, total };
    };

    /* ---------- 8. Welded Mesh Generator & Topology Analysis ---------- */
    const gcd = (a, b) => (b === 0 ? a : gcd(b, a % b));

    const buildWeldedMesh = (k = 1, uSeg = 256, vSeg = 32, R = DEFAULT_R, width = DEFAULT_W) => {
        const numVerts = uSeg * (vSeg + 1);
        const positions = new Float64Array(numVerts * 3);
        const normals = new Float64Array(numVerts * 3);
        const uvs = new Float32Array(numVerts * 2);

        // Vertex generation for unique parameter grid [0, uSeg - 1] x [0, vSeg]
        for (let i = 0; i < uSeg; i++) {
            const u = (2.0 * Math.PI * i) / uSeg;
            for (let j = 0; j <= vSeg; j++) {
                const v = -width + (2.0 * width * j) / vSeg;
                const p = surface(u, v, k, R);
                const n = normal(u, v, k, R);
                const idx = i * (vSeg + 1) + j;

                positions[idx * 3] = p[0];
                positions[idx * 3 + 1] = p[1];
                positions[idx * 3 + 2] = p[2];

                normals[idx * 3] = n[0];
                normals[idx * 3 + 1] = n[1];
                normals[idx * 3 + 2] = n[2];

                uvs[idx * 2] = i / uSeg;
                uvs[idx * 2 + 1] = j / vSeg;
            }
        }

        // Seam rule function:
        // Vertex (u = 2pi, v_j) is identified with (0, -v_j) for k odd => j -> vSeg - j
        // Vertex (u = 2pi, v_j) is identified with (0, v_j) for k even => j -> j
        const getVertIndex = (i, j) => {
            if (i < uSeg) {
                return i * (vSeg + 1) + j;
            } else {
                return (k % 2 === 1) ? (vSeg - j) : j;
            }
        };

        const triangles = [];
        for (let i = 0; i < uSeg; i++) {
            for (let j = 0; j < vSeg; j++) {
                const v00 = getVertIndex(i, j);
                const v10 = getVertIndex(i + 1, j);
                const v01 = getVertIndex(i, j + 1);
                const v11 = getVertIndex(i + 1, j + 1);

                triangles.push([v00, v10, v01]);
                triangles.push([v10, v11, v01]);
            }
        }

        // Edge topological analysis
        const edgeMap = new Map();
        const addEdge = (a, b, triIdx) => {
            const key = a < b ? `${a}_${b}` : `${b}_${a}`;
            if (!edgeMap.has(key)) {
                edgeMap.set(key, { a: Math.min(a, b), b: Math.max(a, b), tris: [] });
            }
            edgeMap.get(key).tris.push(triIdx);
        };

        for (let t = 0; t < triangles.length; t++) {
            const [a, b, c] = triangles[t];
            addEdge(a, b, t);
            addEdge(b, c, t);
            addEdge(c, a, t);
        }

        const V = numVerts;
        const F = triangles.length;
        const E = edgeMap.size;
        const chi = V - E + F;

        let bndEdges = 0;
        let intEdges = 0;
        let allInteriorSharedBy2 = true;
        const bndAdjacency = new Map();

        for (const [, e] of edgeMap.entries()) {
            if (e.tris.length === 1) {
                bndEdges++;
                if (!bndAdjacency.has(e.a)) bndAdjacency.set(e.a, []);
                if (!bndAdjacency.has(e.b)) bndAdjacency.set(e.b, []);
                bndAdjacency.get(e.a).push(e.b);
                bndAdjacency.get(e.b).push(e.a);
            } else if (e.tris.length === 2) {
                intEdges++;
            } else {
                allInteriorSharedBy2 = false;
            }
        }

        // Trace boundary loop components
        let bndLoops = 0;
        const visitedBnd = new Set();
        for (const [v] of bndAdjacency.entries()) {
            if (!visitedBnd.has(v)) {
                bndLoops++;
                let cur = v, prev = -1;
                while (cur !== undefined && !visitedBnd.has(cur)) {
                    visitedBnd.add(cur);
                    const nbrs = bndAdjacency.get(cur);
                    const next = nbrs.find(n => n !== prev && !visitedBnd.has(n)) || nbrs.find(n => n !== prev);
                    prev = cur;
                    cur = next;
                }
            }
        }

        // Orientability test: BFS orientation propagation across shared edges
        const triSigns = new Int8Array(F);
        triSigns[0] = 1;
        const queue = [0];
        let isOrientable = true;

        while (queue.length > 0 && isOrientable) {
            const t1 = queue.shift();
            const sign1 = triSigns[t1];
            const [a, b, c] = triangles[t1];
            const edges = [[a, b], [b, c], [c, a]];

            for (const [ea, eb] of edges) {
                const key = ea < eb ? `${ea}_${eb}` : `${eb}_${ea}`;
                const e = edgeMap.get(key);
                if (e.tris.length === 2) {
                    const t2 = e.tris[0] === t1 ? e.tris[1] : e.tris[0];
                    const [t2a, t2b, t2c] = triangles[t2];
                    let dir2 = 0;
                    if ((t2a === ea && t2b === eb) || (t2b === ea && t2c === eb) || (t2c === ea && t2a === eb)) {
                        dir2 = (ea < eb ? 1 : -1);
                    } else {
                        dir2 = (ea < eb ? -1 : 1);
                    }

                    const requiredSign = -sign1 * (ea < eb ? 1 : -1) * dir2;
                    if (triSigns[t2] === 0) {
                        triSigns[t2] = requiredSign;
                        queue.push(t2);
                    } else if (triSigns[t2] !== requiredSign) {
                        isOrientable = false;
                        break;
                    }
                }
            }
        }

        const indices = new Uint16Array(triangles.length * 3);
        let iptr = 0;
        for (let t = 0; t < triangles.length; t++) {
            indices[iptr++] = triangles[t][0];
            indices[iptr++] = triangles[t][1];
            indices[iptr++] = triangles[t][2];
        }

        return {
            positions,
            normals,
            uvs,
            indices,
            triangles,
            V, E, F, chi,
            bndEdges,
            intEdges,
            allInteriorSharedBy2,
            bndLoops,
            expectedLoops: gcd(2, k),
            isOrientable,
            expectedOrientable: k % 2 === 0
        };
    };

    /* ---------- 9. Boundary Knots and Links ---------- */
    const boundaryKnot = (k = 3, width = DEFAULT_W, R = DEFAULT_R, nSamples = 4000) => {
        // For k odd: single closed loop traversed over u in [0, 4pi]
        const pts = [];
        for (let i = 0; i < nSamples; i++) {
            const u = (4.0 * Math.PI * i) / nSamples;
            pts.push(surface(u, width, k, R));
        }

        let length = 0.0;
        for (let i = 0; i < nSamples; i++) {
            const p1 = pts[i], p2 = pts[(i + 1) % nSamples];
            length += Math.hypot(p2[0] - p1[0], p2[1] - p1[1], p2[2] - p1[2]);
        }

        // Minimum distance between non-adjacent samples (ignore separation <= 25 samples and wrap)
        let minDistance = Infinity;
        const margin = 25;
        for (let i = 0; i < nSamples; i++) {
            for (let j = i + margin; j < nSamples; j++) {
                if ((j - i) > (nSamples - margin)) continue;
                const d = Math.hypot(pts[i][0] - pts[j][0], pts[i][1] - pts[j][1], pts[i][2] - pts[j][2]);
                if (d < minDistance) minDistance = d;
            }
        }

        return {
            length,
            minDistance,
            selfIntersectionThreshold: 0.05 * width,
            noSelfIntersections: minDistance > 0.05 * width
        };
    };

    const boundaryLinks = (k = 2, width = DEFAULT_W, R = DEFAULT_R, nSamples = 2000) => {
        // For k even: two separate closed curves at v = +w and v = -w over u in [0, 2pi]
        let lengthPos = 0.0;
        let lengthNeg = 0.0;
        const ptsP = [], ptsM = [];

        for (let i = 0; i < nSamples; i++) {
            const u = (2.0 * Math.PI * i) / nSamples;
            ptsP.push(surface(u, width, k, R));
            ptsM.push(surface(u, -width, k, R));
        }

        for (let i = 0; i < nSamples; i++) {
            const p1 = ptsP[i], p2 = ptsP[(i + 1) % nSamples];
            lengthPos += Math.hypot(p2[0] - p1[0], p2[1] - p1[1], p2[2] - p1[2]);
            const m1 = ptsM[i], m2 = ptsM[(i + 1) % nSamples];
            lengthNeg += Math.hypot(m2[0] - m1[0], m2[1] - m1[1], m2[2] - m1[2]);
        }

        return { lengthPos, lengthNeg };
    };

    /* ---------- 10. Performance Benchmarking ---------- */
    const measurePerformance = (k1 = 1, k2 = 5, uSeg = 256, vSeg = 32) => {
        const t0 = (typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now();
        buildWeldedMesh(k1, uSeg, vSeg);
        const t1 = (typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now();
        const buildTimeK1 = t1 - t0;

        const t2 = (typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now();
        buildWeldedMesh(k2, uSeg, vSeg);
        const t3 = (typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now();
        const buildTimeK5 = t3 - t2;

        // Frame update benchmark (1000 uniform matrix / normal / metric updates)
        const t4 = (typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now();
        let sum = 0.0;
        for (let f = 0; f < 1000; f++) {
            const t = f * 0.016;
            const roll = t * 0.1;
            const cosR = Math.cos(roll), sinR = Math.sin(roll);
            const K = curvature(t % (2.0 * Math.PI), 0.2, k1);
            sum += cosR + sinR + K;
        }
        const t5 = (typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now();
        const frameUpdateTime = (t5 - t4) / 1000.0;

        return { buildTimeK1, buildTimeK5, frameUpdateTime, checksum: sum };
    };

    return {
        DEFAULT_R,
        DEFAULT_W,
        surface,
        tangents,
        firstFundamentalForm,
        metricDerivatives,
        normal,
        secondFundamentalForm,
        curvature,
        geodesicDeriv,
        rk4Step,
        geodesicSpeedSq,
        integrateGeodesic,
        gaussLegendre,
        gaussBonnet,
        gcd,
        buildWeldedMesh,
        boundaryKnot,
        boundaryLinks,
        measurePerformance
    };
}));
