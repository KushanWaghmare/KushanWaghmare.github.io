/**
 * qsim-math.js
 *
 * Double-precision classical state-vector quantum simulator core for the
 * Computer Science hero: "Quantum search and period finding."
 *
 * Conventions:
 *   - n qubits, state vector of 2^n complex amplitudes in separate Float64Arrays (re, im).
 *   - Little-endian qubit indexing: index j has bit q = (j >> q) & 1 for qubit q in [0, n-1],
 *     so j = sum_{q=0}^{n-1} b_q * 2^q. Qubit 0 is LSB; qubit n-1 is MSB.
 *   - QFT uses positive exponent: QFT|x> = (1/sqrt(Q)) sum_{m=0}^{Q-1} exp(+2*pi*i*x*m/Q)|m>.
 *     Circuit order: for q = n-1 down to 0, apply H on q, then CP(+pi / 2^{q-k}) on (q, k)
 *     for k = q-1 down to 0; finally apply bit-reversal SWAP(q, n-1-q) for q < floor(n/2).
 *
 * UMD module: usable in Node.js (CommonJS) and browser (window.QSimMath).
 */

(function (root, factory) {
    if (typeof module === "object" && module.exports) {
        module.exports = factory();
    } else {
        root.QSimMath = factory();
    }
}(typeof self !== "undefined" ? self : this, function () {
    "use strict";

    const TAU = 2.0 * Math.PI;
    const INV_SQRT2 = Math.SQRT1_2;

    /* ---------- Seeded PRNG (mulberry32) & FNV-1a Hash ---------- */
    const mulberry32 = (seed = 0x51514D32) => {
        let s = seed >>> 0;
        return () => {
            s = (s + 0x6D2B79F5) >>> 0;
            let t = Math.imul(s ^ (s >>> 15), 1 | s);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296.0;
        };
    };

    const fnv1a = (arr) => {
        const str = Array.isArray(arr) ? arr.join(",") : String(arr);
        let h = 0x811c9dc5;
        for (let i = 0; i < str.length; i++) {
            h ^= str.charCodeAt(i);
            h = Math.imul(h, 0x01000193);
        }
        return (h >>> 0).toString(16).padStart(8, "0");
    };

    /* ---------- Number Theory Helpers ---------- */
    const gcd = (a, b) => {
        let x = Math.abs(a | 0), y = Math.abs(b | 0);
        while (y !== 0) { const t = y; y = x % y; x = t; }
        return x;
    };

    const modPow = (base, exp, mod) => {
        if (mod === 1) return 0;
        let res = 1, b = ((base % mod) + mod) % mod, e = exp | 0;
        while (e > 0) {
            if (e & 1) res = (res * b) % mod;
            b = (b * b) % mod;
            e >>= 1;
        }
        return res;
    };

    /* ---------- State Vector Allocation & Norm ---------- */
    const createState = (n) => {
        const size = 1 << n;
        const re = new Float64Array(size);
        const im = new Float64Array(size);
        re[0] = 1.0;
        return { n, size, re, im };
    };

    const resetBasis = (state, j = 0) => {
        state.re.fill(0.0);
        state.im.fill(0.0);
        state.re[j] = 1.0;
        return state;
    };

    const cloneState = (state) => {
        const out = createState(state.n);
        out.re.set(state.re);
        out.im.set(state.im);
        return out;
    };

    const normSquared = (state) => {
        const re = state.re, im = state.im, n = state.size;
        let sum = 0.0;
        for (let i = 0; i < n; i++) sum += re[i] * re[i] + im[i] * im[i];
        return sum;
    };

    const supportSize = (state, eps = 1e-12) => {
        const re = state.re, im = state.im, n = state.size, thr = eps * eps;
        let count = 0;
        for (let i = 0; i < n; i++) {
            if (re[i] * re[i] + im[i] * im[i] > thr) count++;
        }
        return count;
    };

    /* ---------- Single-Qubit & Two-Qubit Unitary Gates ---------- */
    // Applies a general 2x2 unitary [[u00, u01], [u10, u11]] to qubit q
    const applySingleQubitMatrix = (state, q, u00r, u00i, u01r, u01i, u10r, u10i, u11r, u11i) => {
        const re = state.re, im = state.im, size = state.size;
        const step = 1 << q, block = step << 1;
        for (let base = 0; base < size; base += block) {
            const end = base + step;
            for (let i0 = base; i0 < end; i0++) {
                const i1 = i0 + step;
                const r0 = re[i0], m0 = im[i0], r1 = re[i1], m1 = im[i1];
                re[i0] = (u00r * r0 - u00i * m0) + (u01r * r1 - u01i * m1);
                im[i0] = (u00r * m0 + u00i * r0) + (u01r * m1 + u01i * r1);
                re[i1] = (u10r * r0 - u10i * m0) + (u11r * r1 - u11i * m1);
                im[i1] = (u10r * m0 + u10i * r0) + (u11r * m1 + u11i * r1);
            }
        }
        return state;
    };

    // Fractional Hadamard: H^s = ((1 + e^{i*pi*s})/2) I + ((1 - e^{i*pi*s})/2) H
    const hadamardMatrix = (s = 1.0) => {
        const c = Math.cos(Math.PI * s), sn = Math.sin(Math.PI * s);
        const ar = 0.5 * (1.0 + c), ai = 0.5 * sn;
        const br = 0.5 * (1.0 - c) * INV_SQRT2, bi = -0.5 * sn * INV_SQRT2;
        return [
            ar + br, ai + bi, br, bi,
            br, bi, ar - br, ai - bi
        ];
    };

    const applyH = (state, q, s = 1.0) => {
        if (s === 1.0) {
            const re = state.re, im = state.im, size = state.size;
            const step = 1 << q, block = step << 1;
            for (let base = 0; base < size; base += block) {
                const end = base + step;
                for (let i0 = base; i0 < end; i0++) {
                    const i1 = i0 + step;
                    const r0 = re[i0], m0 = im[i0], r1 = re[i1], m1 = im[i1];
                    re[i0] = (r0 + r1) * INV_SQRT2;
                    im[i0] = (m0 + m1) * INV_SQRT2;
                    re[i1] = (r0 - r1) * INV_SQRT2;
                    im[i1] = (m0 - m1) * INV_SQRT2;
                }
            }
            return state;
        }
        const m = hadamardMatrix(s);
        return applySingleQubitMatrix(state, q, m[0], m[1], m[2], m[3], m[4], m[5], m[6], m[7]);
    };

    // Controlled phase: CP(phi)^s = CP(s * phi) on qubits (c, t)
    const applyCP = (state, c, t, phi, s = 1.0) => {
        const ang = s * phi;
        const cr = Math.cos(ang), ci = Math.sin(ang);
        const re = state.re, im = state.im, size = state.size;
        const mask = (1 << c) | (1 << t);
        for (let i = mask; i < size; i = (i + 1) | mask) {
            const r = re[i], m = im[i];
            re[i] = r * cr - m * ci;
            im[i] = r * ci + m * cr;
        }
        return state;
    };

    // SWAP(a, b) with optional fractional exponent s: SWAP^s = ((1 + e^{i*pi*s})/2) I + ((1 - e^{i*pi*s})/2) SWAP
    const applySWAP = (state, a, b, s = 1.0) => {
        if (a === b) return state;
        const re = state.re, im = state.im, size = state.size;
        const ma = 1 << a, mb = 1 << b;
        if (s === 1.0) {
            for (let i = 0; i < size; i++) {
                if ((i & ma) === 0 && (i & mb) !== 0) {
                    const j = (i | ma) & ~mb;
                    const tr = re[i], ti = im[i];
                    re[i] = re[j]; im[i] = im[j];
                    re[j] = tr; im[j] = ti;
                }
            }
            return state;
        }
        const c = Math.cos(Math.PI * s), sn = Math.sin(Math.PI * s);
        const ar = 0.5 * (1.0 + c), ai = 0.5 * sn;
        const br = 0.5 * (1.0 - c), bi = -0.5 * sn;
        for (let i = 0; i < size; i++) {
            if ((i & ma) === 0 && (i & mb) !== 0) {
                const j = (i | ma) & ~mb;
                const r0 = re[i], m0 = im[i], r1 = re[j], m1 = im[j];
                re[i] = (ar * r0 - ai * m0) + (br * r1 - bi * m1);
                im[i] = (ar * m0 + ai * r0) + (br * m1 + bi * r1);
                re[j] = (br * r0 - bi * m0) + (ar * r1 - ai * m1);
                im[j] = (br * m0 + bi * r0) + (ar * m1 + ai * r1);
            }
        }
        return state;
    };

    /* ---------- Grover Search: Exact Continuous Paths & Closed Forms ---------- */
    // Oracle O(s) = I + (e^{i*pi*s} - 1)|w><w|
    const applyGroverOracle = (state, w, s = 1.0) => {
        const c = Math.cos(Math.PI * s), sn = Math.sin(Math.PI * s);
        const rw = state.re[w], iw = state.im[w];
        state.re[w] = rw * c - iw * sn;
        state.im[w] = rw * sn + iw * c;
        return state;
    };

    // Diffusion D(s) = P + e^{i*pi*s}(I - P), where P = |s><s| (mean amplitude projection)
    // On amplitudes: psi_j(s) = mean + e^{i*pi*s}(psi_j - mean)
    const applyGroverDiffusion = (state, s = 1.0) => {
        const re = state.re, im = state.im, N = state.size, invN = 1.0 / N;
        let sumR = 0.0, sumI = 0.0;
        for (let i = 0; i < N; i++) { sumR += re[i]; sumI += im[i]; }
        const meanR = sumR * invN, meanI = sumI * invN;
        const c = Math.cos(Math.PI * s), sn = Math.sin(Math.PI * s);
        for (let i = 0; i < N; i++) {
            const dr = re[i] - meanR, di = im[i] - meanI;
            re[i] = meanR + (dr * c - di * sn);
            im[i] = meanI + (dr * sn + di * c);
        }
        return state;
    };

    const groverClosedForm = (N, k) => {
        const theta = Math.asin(1.0 / Math.sqrt(N));
        const ang = (2 * k + 1) * theta;
        const markedAmp = Math.sin(ang);
        const unmarkedAmp = Math.cos(ang) / Math.sqrt(N - 1);
        const probMarked = markedAmp * markedAmp;
        const optK = Math.floor(Math.PI / (4.0 * theta));
        return { theta, markedAmp, unmarkedAmp, probMarked, optK };
    };

    /* ---------- QFT Circuit Builder & Execution ---------- */
    // Builds the gate list for an n-qubit QFT acting on qubits [0 .. nQft-1]
    // For nQft = 8: 8 H, 28 CP, 4 SWAPs (40 gates total).
    const buildQftCircuit = (nQft = 8) => {
        const gates = [];
        for (let q = nQft - 1; q >= 0; q--) {
            gates.push({ type: "H", q });
            for (let k = q - 1; k >= 0; k--) {
                const phi = Math.PI / (1 << (q - k));
                gates.push({ type: "CP", c: k, t: q, phi });
            }
        }
        const half = nQft >> 1;
        for (let q = 0; q < half; q++) {
            gates.push({ type: "SWAP", a: q, b: nQft - 1 - q });
        }
        return gates;
    };

    const applyGate = (state, gate, s = 1.0) => {
        if (gate.type === "H") return applyH(state, gate.q, s);
        if (gate.type === "CP") return applyCP(state, gate.c, gate.t, gate.phi, s);
        if (gate.type === "SWAP") return applySWAP(state, gate.a, gate.b, s);
        return state;
    };

    const applyQFT = (state, nQft = state.n, includeSwaps = true) => {
        const gates = buildQftCircuit(nQft);
        for (let i = 0; i < gates.length; i++) {
            if (!includeSwaps && gates[i].type === "SWAP") continue;
            applyGate(state, gates[i], 1.0);
        }
        return state;
    };

    const applyInverseQFT = (state, nQft = state.n) => {
        const gates = buildQftCircuit(nQft);
        for (let i = gates.length - 1; i >= 0; i--) {
            const g = gates[i];
            if (g.type === "H") applyH(state, g.q, 1.0);
            else if (g.type === "CP") applyCP(state, g.c, g.t, -g.phi, 1.0);
            else if (g.type === "SWAP") applySWAP(state, g.a, g.b, 1.0);
        }
        return state;
    };

    /* ---------- Shor Modular Exponentiation, Marginals & Measurement ---------- */
    // Applies |x>|y> -> |x>|y XOR (a^x mod N)> on (nCount, nWork) register state
    const applyModExpOracle = (state, nCount, nWork, a, N, outRe = null, outIm = null) => {
        const Q = 1 << nCount, W = 1 << nWork;
        const re = state.re, im = state.im;
        const tmpRe = outRe || new Float64Array(state.size);
        const tmpIm = outIm || new Float64Array(state.size);
        tmpRe.fill(0.0); tmpIm.fill(0.0);
        let ax = 1 % N;
        for (let x = 0; x < Q; x++) {
            for (let y = 0; y < W; y++) {
                const src = x | (y << nCount);
                const dst = x | (((y ^ ax) & (W - 1)) << nCount);
                tmpRe[dst] = re[src];
                tmpIm[dst] = im[src];
            }
            ax = (ax * a) % N;
        }
        re.set(tmpRe);
        im.set(tmpIm);
        return state;
    };

    const workRegisterMarginals = (state, nCount, nWork, outProbs = null) => {
        const Q = 1 << nCount, W = 1 << nWork;
        const probs = outProbs || new Float64Array(W);
        probs.fill(0.0);
        const re = state.re, im = state.im;
        for (let y = 0; y < W; y++) {
            const base = y << nCount;
            let sum = 0.0;
            for (let x = 0; x < Q; x++) {
                const idx = base | x;
                sum += re[idx] * re[idx] + im[idx] * im[idx];
            }
            probs[y] = sum;
        }
        return probs;
    };

    const measureWorkRegister = (state, nCount, nWork, prngOrOutcome) => {
        const Q = 1 << nCount, W = 1 << nWork;
        const probs = workRegisterMarginals(state, nCount, nWork);
        let yOut = 0;
        if (typeof prngOrOutcome === "number") {
            yOut = prngOrOutcome | 0;
        } else {
            const u = prngOrOutcome();
            let acc = 0.0;
            for (let y = 0; y < W; y++) {
                acc += probs[y];
                if (u <= acc || y === W - 1) { yOut = y; break; }
            }
        }
        const py = probs[yOut];
        const invNorm = py > 0 ? 1.0 / Math.sqrt(py) : 0.0;
        const re = state.re, im = state.im;
        for (let y = 0; y < W; y++) {
            const base = y << nCount;
            if (y === yOut) {
                for (let x = 0; x < Q; x++) { re[base | x] *= invNorm; im[base | x] *= invNorm; }
            } else {
                for (let x = 0; x < Q; x++) { re[base | x] = 0.0; im[base | x] = 0.0; }
            }
        }
        return { y: yOut, prob: py, probs };
    };

    const measureState = (state, prng) => {
        const re = state.re, im = state.im, n = state.size;
        const u = prng();
        let acc = 0.0, chosen = n - 1;
        for (let i = 0; i < n; i++) {
            acc += re[i] * re[i] + im[i] * im[i];
            if (u <= acc) { chosen = i; break; }
        }
        const p = re[chosen] * re[chosen] + im[chosen] * im[chosen];
        const mag = Math.sqrt(p);
        const phR = mag > 0 ? re[chosen] / mag : 1.0;
        const phI = mag > 0 ? im[chosen] / mag : 0.0;
        re.fill(0.0); im.fill(0.0);
        re[chosen] = phR; im[chosen] = phI;
        return { index: chosen, prob: p };
    };

    /* ---------- Continued Fractions & Shor Post-Processing ---------- */
    const continuedFractionConvergents = (num, den, maxSteps = 32) => {
        const convergents = [];
        let a = num | 0, b = den | 0;
        let pPrev = 0, pCurr = 1, qPrev = 1, qCurr = 0;
        for (let step = 0; step < maxSteps && b !== 0; step++) {
            const quot = Math.floor(a / b);
            const rem = a % b;
            const pNext = quot * pCurr + pPrev;
            const qNext = quot * qCurr + qPrev;
            convergents.push({ a: quot, p: pNext, q: qNext });
            pPrev = pCurr; pCurr = pNext;
            qPrev = qCurr; qCurr = qNext;
            a = b; b = rem;
        }
        return convergents;
    };

    const shorPostProcess = (m, Q, N = 15, a = 7, allowMultiples = true) => {
        const g0 = gcd(a, N);
        if (g0 > 1 && g0 < N) {
            const f2 = N / g0;
            return {
                m, Q, N, a, trivialGcd: g0, r: null, directR: null, candidateQ: null,
                convergents: [], factors: [Math.min(g0, f2), Math.max(g0, f2)]
            };
        }
        if (m <= 0) {
            return { m, Q, N, a, trivialGcd: 1, r: null, directR: null, candidateQ: null, convergents: [{ a: 0, p: 0, q: 1 }], factors: null };
        }
        const convs = continuedFractionConvergents(m, Q);
        let directR = null, r = null, candidateQ = null;
        for (let i = 0; i < convs.length; i++) {
            const q = convs[i].q;
            if (q >= 1 && q < N) {
                candidateQ = q;
                if (modPow(a, q, N) === 1) {
                    if (directR === null) directR = q;
                    if (r === null) r = q;
                } else if (allowMultiples && q >= 2 && r === null) {
                    for (let mult = 2; mult * q < N; mult++) {
                        if (modPow(a, mult * q, N) === 1) {
                            r = mult * q;
                            break;
                        }
                    }
                }
            }
        }
        let factors = null;
        if (r !== null && (r % 2 === 0)) {
            const halfPow = modPow(a, r / 2, N);
            if (halfPow !== N - 1 && halfPow !== 1) {
                const f1 = gcd(halfPow - 1, N);
                const f2 = gcd(halfPow + 1, N);
                if (f1 > 1 && f1 < N && f2 > 1 && f2 < N) {
                    factors = [Math.min(f1, f2), Math.max(f1, f2)];
                }
            }
        }
        return { m, Q, N, a, trivialGcd: 1, r, directR, candidateQ, convergents: convs, factors };
    };

    //Deterministic hash of first `count` Grover/Shor measurement outcomes for Node<->Browser parity
    const measurementParityHash = (seed = 0x51514D32, count = 20) => {
        const prng = mulberry32(seed);
        const outcomes = [];
        const st = createState(8);
        for (let i = 0; i < count; i++) {
            const w = Math.floor(prng() * 256);
            resetBasis(st, 0);
            for (let q = 7; q >= 0; q--) applyH(st, q, 1.0);
            const kSteps = (i % 12) + 1;
            for (let k = 0; k < kSteps; k++) {
                applyGroverOracle(st, w, 1.0);
                applyGroverDiffusion(st, 1.0);
            }
            const res = measureState(st, prng);
            outcomes.push(`${w}:${res.index}`);
        }
        return { outcomes, hash: fnv1a(outcomes) };
    };

    return {
        TAU, mulberry32, fnv1a, gcd, modPow,
        createState, resetBasis, cloneState, normSquared, supportSize,
        applySingleQubitMatrix, hadamardMatrix, applyH, applyCP, applySWAP,
        applyGroverOracle, applyGroverDiffusion, groverClosedForm,
        buildQftCircuit, applyGate, applyQFT, applyInverseQFT,
        applyModExpOracle, workRegisterMarginals, measureWorkRegister, measureState,
        continuedFractionConvergents, shorPostProcess, measurementParityHash
    };
}));
