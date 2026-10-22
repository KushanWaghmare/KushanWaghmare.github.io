/**
 * copula-math.js
 *
 * Double-precision classical Monte Carlo and statistical core for the
 * Quantitative Finance scene: "Same correlation, different crashes."
 *
 * Three assets are represented as points in the unit cube (0, 1)^3.
 * Three multivariate copulas with the identical Kendall's tau (tau = 0.50):
 *   1. Gaussian copula: equicorrelation rho = sin(pi*tau/2) = 1/sqrt(2),
 *      zero lower tail dependence lambda_L = 0.
 *   2. Student-t (nu = 3) copula: same correlation matrix, fat joint tails,
 *      lambda_L = 2 * T_4(-sqrt(4*(1-rho)/(1+rho))) = 0.453996...
 *   3. Clayton (theta = 2) copula: asymmetric crash concentration,
 *      lambda_L = 2^{-1/theta} = 1/sqrt(2) = 0.707107...
 *      exact 3D crash probability C(q, q, q) = (3*q^-2 - 2)^(-1/2).
 *
 * UMD module: usable in Node.js (CommonJS) and browser (window.CopulaMath).
 */

(function (root, factory) {
    if (typeof module === "object" && module.exports) {
        module.exports = factory();
    } else {
        root.CopulaMath = factory();
    }
}(typeof self !== "undefined" ? self : this, function () {
    "use strict";

    /* ---------- Constants ---------- */
    const TAU_KENDALL = 0.5;
    const RHO_EQUICORR = 1.0 / Math.SQRT2; // sin(pi * 0.5 / 2) = 1/sqrt(2) ~ 0.7071067811865476
    const THETA_CLAYTON = 2.0;             // 2 * 0.5 / (1 - 0.5) = 2.0
    const NU_STUDENT = 3.0;

    // Cholesky factor L for 3x3 equicorrelation matrix R with off-diagonal rho = 1/sqrt(2)
    // R = L * L^T where:
    // L11 = 1, L21 = rho, L22 = sqrt(1 - rho^2) = 1/sqrt(2)
    // L31 = rho, L32 = 1 - rho, L33 = sqrt(sqrt(2) - 1)
    const L11 = 1.0;
    const L21 = RHO_EQUICORR;
    const L22 = Math.SQRT1_2;
    const L31 = RHO_EQUICORR;
    const L32 = 1.0 - RHO_EQUICORR;
    const L33 = Math.sqrt(Math.SQRT2 - 1.0);

    /* ---------- Seeded PRNG (mulberry32) ---------- */
    const mulberry32 = (seed = 0x51514D32) => {
        let s = seed >>> 0;
        return () => {
            s = (s + 0x6D2B79F5) >>> 0;
            let t = Math.imul(s ^ (s >>> 15), 1 | s);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296.0;
        };
    };

    /* ---------- Normal Distribution: PDF, FDLIBM erfc, and CDF ---------- */
    const SQRT_2PI = Math.sqrt(2.0 * Math.PI);
    const normalPdf = (z) => Math.exp(-0.5 * z * z) / SQRT_2PI;

    // Double-precision complementary error function ported from FDLIBM 5.3 (s_erf.c)
    // Guaranteed within ~1 ulp across the full IEEE-754 range
    const erfc = (() => {
        const tiny = 1e-300;
        const half = 0.5;
        const one = 1.0;
        const two = 2.0;
        const erx = 8.45062911510467529297e-01;
        const pp0 = 1.28379167095512558561e-01;
        const pp1 = -3.25042107247001499370e-01;
        const pp2 = -2.84817495755985104766e-02;
        const pp3 = -5.77027029648944159157e-03;
        const pp4 = -2.37630166566501626084e-05;
        const qq1 = 3.97917223959155352819e-01;
        const qq2 = 6.50222499887672944485e-02;
        const qq3 = 5.08130628187576562776e-03;
        const qq4 = 1.32494738004321644526e-04;
        const qq5 = -3.96022827877536812320e-06;

        const pa0 = -2.36211856075265944077e-03;
        const pa1 = 4.14856118683748331666e-01;
        const pa2 = -3.72207876035701323847e-01;
        const pa3 = 3.18346619901161753674e-01;
        const pa4 = -1.10894694282396677476e-01;
        const pa5 = 3.54783043256182359371e-02;
        const pa6 = -2.16637559486879084300e-03;
        const qa1 = 1.06420880400844228286e-01;
        const qa2 = 5.40397917702171048937e-01;
        const qa3 = 7.18286544141962662868e-02;
        const qa4 = 1.26171219808761642112e-01;
        const qa5 = 1.36370839120290507362e-02;
        const qa6 = 1.19844998467991074170e-02;

        const ra0 = -9.86494403484714822705e-03;
        const ra1 = -6.93858572707181764372e-01;
        const ra2 = -1.05586262253232909814e+01;
        const ra3 = -6.23753324503260060396e+01;
        const ra4 = -1.62396669462573470355e+02;
        const ra5 = -1.84605092906711035994e+02;
        const ra6 = -8.12874355063065934246e+01;
        const ra7 = -9.81432934416914548592e+00;
        const sa1 = 1.96512716674392571292e+01;
        const sa2 = 1.37657754143519042600e+02;
        const sa3 = 4.34565877475229228821e+02;
        const sa4 = 6.45387271733267880336e+02;
        const sa5 = 4.29008140027567833386e+02;
        const sa6 = 1.08635005541779435134e+02;
        const sa7 = 6.57024977031928170135e+00;
        const sa8 = -6.04244152148580987438e-02;

        const rb0 = -9.86494292470009928597e-03;
        const rb1 = -7.99283237680523006574e-01;
        const rb2 = -1.77579549177547519889e+01;
        const rb3 = -1.60636384855821916062e+02;
        const rb4 = -6.37566443368389627722e+02;
        const rb5 = -1.02509513161107724954e+03;
        const rb6 = -4.83519191608651397019e+02;
        const sb1 = 3.03380607434824582924e+01;
        const sb2 = 3.25792512996573918826e+02;
        const sb3 = 1.53672958608443695994e+03;
        const sb4 = 3.19985821950859553908e+03;
        const sb5 = 2.55305040643316442583e+03;
        const sb6 = 4.74528541206955367215e+02;
        const sb7 = -2.24409524465858183362e+01;

        return (x) => {
            if (Number.isNaN(x)) return NaN;
            if (x === Infinity) return 0.0;
            if (x === -Infinity) return 2.0;

            const ax = Math.abs(x);
            if (ax < 0.84375) {
                if (ax < 1.3877787807814457e-17) return one - x; // 2^-56
                const z = x * x;
                const r = pp0 + z * (pp1 + z * (pp2 + z * (pp3 + z * pp4)));
                const s = one + z * (qq1 + z * (qq2 + z * (qq3 + z * (qq4 + z * qq5))));
                const y = r / s;
                if (x < 0.25) return one - (x + x * y);
                return half - (x * y + (x - half));
            }
            if (ax < 1.25) {
                const s = ax - one;
                const P = pa0 + s * (pa1 + s * (pa2 + s * (pa3 + s * (pa4 + s * (pa5 + s * pa6)))));
                const Q = one + s * (qa1 + s * (qa2 + s * (qa3 + s * (qa4 + s * (qa5 + s * qa6)))));
                if (x >= 0) return (one - erx) - P / Q;
                return one + (erx + P / Q);
            }
            if (ax < 28.0) {
                const s = one / (ax * ax);
                let R, S;
                if (ax < 2.857142857142857) { // 1/0.35
                    R = ra0 + s * (ra1 + s * (ra2 + s * (ra3 + s * (ra4 + s * (ra5 + s * (ra6 + s * ra7))))));
                    S = one + s * (sa1 + s * (sa2 + s * (sa3 + s * (sa4 + s * (sa5 + s * (sa6 + s * (sa7 + s * sa8)))))));
                } else {
                    if (x < -6.0) return two - tiny;
                    R = rb0 + s * (rb1 + s * (rb2 + s * (rb3 + s * (rb4 + s * (rb5 + s * rb6)))));
                    S = one + s * (sb1 + s * (sb2 + s * (sb3 + s * (sb4 + s * (sb5 + s * (sb6 + s * sb7))))));
                }
                const z = Math.fround(ax);
                const r = Math.exp(-z * z - 0.5625) * Math.exp((z - ax) * (z + ax) + R / S);
                if (x > 0) return r / ax;
                return two - r / ax;
            }
            if (x > 0) return tiny * tiny;
            return two - tiny;
        };
    })();

    const phiCdf = (z) => 0.5 * erfc(-z * Math.SQRT1_2);

    /* ---------- Normal Quantile: Wichura AS 241 (ppnd16) ---------- */
    // Produces normal quantile to full 16-decimal double precision
    const normalQuantile = (p) => {
        if (p <= 0.0) return -Infinity;
        if (p >= 1.0) return Infinity;
        if (p === 0.5) return 0.0;

        const q = p - 0.5;
        if (Math.abs(q) <= 0.425) {
            const r = 0.180625 - q * q;
            return q * (((((((r * 2509.0809287301226727 + 33430.575583588128105) * r + 67265.770927008700853) * r + 45921.953931549871457) * r + 13731.693765509461125) * r + 1971.5909503065514427) * r + 133.14166789178437745) * r + 3.387132872796366608)
                / (((((((r * 5226.495278852854561 + 28729.085735721942674) * r + 39307.89580009271061) * r + 21213.794301586595867) * r + 5394.1960214247511077) * r + 687.1870074920579083) * r + 42.313330701600911252) * r + 1.0);
        }

        let r = Math.sqrt(-Math.log(q > 0 ? 1.0 - p : p));
        let val;
        if (r <= 5.0) {
            r += -1.6;
            val = (((((((r * 7.7454501427834140764e-4 + 0.0227238449892691845833) * r + 0.24178072517745061177) * r + 1.27045825245236838258) * r + 3.64784832476320460504) * r + 5.7694972214606914055) * r + 4.6303378461565452959) * r + 1.42343711074968357734)
                / (((((((r * 1.05075007164441684324e-9 + 5.475938084995344946e-4) * r + 0.0151986665636164571966) * r + 0.14810397642748007459) * r + 0.68976733498510000455) * r + 1.6763848301838038494) * r + 2.05319162663775882187) * r + 1.0);
        } else {
            r += -5.0;
            val = (((((((r * 2.01033439929228813265e-7 + 2.71155556874348757815e-5) * r + 0.0012426609473880784386) * r + 0.026532189526576123093) * r + 0.29656057182850489123) * r + 1.7848265399172913358) * r + 5.4637849111641143699) * r + 6.6579046435011037772)
                / (((((((r * 2.04426310338993978564e-15 + 1.4215117583164458887e-7) * r + 1.8463183175100546818e-5) * r + 7.868691311456132591e-4) * r + 0.0148753612908506148525) * r + 0.13692988092273580531) * r + 0.59983220655588793769) * r + 1.0);
        }
        return q < 0 ? -val : val;
    };

    /* ---------- Student-t (nu = 3) Analytics ---------- */
    // Closed-form CDF for nu = 3
    const t3Cdf = (t) => {
        if (t === 0.0) return 0.5;
        const invSqrt3 = 1.0 / Math.sqrt(3.0);
        return 0.5 + (1.0 / Math.PI) * (t / (Math.sqrt(3.0) * (1.0 + (t * t) / 3.0)) + Math.atan(t * invSqrt3));
    };

    const t3Pdf = (t) => {
        const denom = 1.0 + (t * t) / 3.0;
        return 2.0 / (Math.PI * Math.sqrt(3.0) * denom * denom);
    };

    // Halley's method cubic solver for t3Quantile (error < 1e-15)
    const t3Quantile = (p) => {
        if (p <= 0.0) return -Infinity;
        if (p >= 1.0) return Infinity;
        if (p === 0.5) return 0.0;
        if (p > 0.5) return -t3Quantile(1.0 - p);

        let t = -Math.pow((2.0 * Math.sqrt(3.0)) / (Math.PI * p), 1.0 / 3.0);
        if (p > 0.1) {
            t = -Math.sqrt(3.0) * Math.tan(Math.PI * (0.5 - p));
            if (t < -4.0) t = -4.0;
        }

        for (let iter = 0; iter < 10; iter++) {
            const val = t3Cdf(t) - p;
            const f = t3Pdf(t);
            const fPrime = -((4.0 * t) / (3.0 * (1.0 + (t * t) / 3.0))) * f;
            const step = (2.0 * val * f) / (2.0 * f * f - val * fPrime);
            t -= step;
            if (Math.abs(step) < 1e-15 * (1.0 + Math.abs(t))) break;
        }
        return t;
    };

    /* ---------- Student-t (nu = 4) CDF ---------- */
    // Closed-form CDF for bivariate Student-t tail integration
    const t4Cdf = (y) => {
        const denom = Math.sqrt(4.0 + y * y);
        const term1 = y / denom;
        const term2 = (y * y * y) / (3.0 * denom * denom * denom);
        return 0.5 + 0.75 * (term1 - term2);
    };

    /* ---------- Random Variate Generation ---------- */
    // Box-Muller generator for standard normal pairs
    const createNormalSampler = (rng) => {
        let spare = null;
        return () => {
            if (spare !== null) {
                const val = spare;
                spare = null;
                return val;
            }
            let u = 0.0;
            while (u <= 1e-15) u = rng();
            const v = rng();
            const mag = Math.sqrt(-2.0 * Math.log(u));
            const angle = 2.0 * Math.PI * v;
            spare = mag * Math.sin(angle);
            return mag * Math.cos(angle);
        };
    };

    // Marsaglia-Tsang Gamma generator with Ahrens-Dieter a < 1 boost
    const sampleGamma = (shape, scale, rng, normalRng) => {
        if (shape < 1.0) {
            const u = Math.max(1e-15, rng());
            return sampleGamma(shape + 1.0, scale, rng, normalRng) * Math.pow(u, 1.0 / shape);
        }
        const d = shape - 1.0 / 3.0;
        const c = 1.0 / Math.sqrt(9.0 * d);
        while (true) {
            let z, v;
            do {
                z = normalRng();
                v = 1.0 + c * z;
            } while (v <= 0.0);
            v = v * v * v;
            const u = rng();
            if (u < 1.0 - 0.0331 * z * z * z * z) {
                return d * v * scale;
            }
            if (Math.log(u) < 0.5 * z * z + d * (1.0 - v + Math.log(v))) {
                return d * v * scale;
            }
        }
    };

    /* ---------- Copula Samplers (Float32Array for GPU) ---------- */
    // 1. Gaussian copula: equicorrelation R, Z = L*xi, U_i = Phi(Z_i)
    const sampleGaussian = (N, rng) => {
        const normalRng = createNormalSampler(rng);
        const out = new Float32Array(3 * N);
        for (let i = 0; i < N; i++) {
            const xi1 = normalRng();
            const xi2 = normalRng();
            const xi3 = normalRng();
            const z1 = L11 * xi1;
            const z2 = L21 * xi1 + L22 * xi2;
            const z3 = L31 * xi1 + L32 * xi2 + L33 * xi3;
            out[3 * i] = phiCdf(z1);
            out[3 * i + 1] = phiCdf(z2);
            out[3 * i + 2] = phiCdf(z3);
        }
        return out;
    };

    // 2. Student-t copula (nu = 3): same R, X = Z / sqrt(W/nu), U_i = T_3(X_i)
    const sampleStudentT = (N, rng, nu = NU_STUDENT) => {
        const normalRng = createNormalSampler(rng);
        const out = new Float32Array(3 * N);
        const halfNu = nu * 0.5;
        for (let i = 0; i < N; i++) {
            const xi1 = normalRng();
            const xi2 = normalRng();
            const xi3 = normalRng();
            const z1 = L11 * xi1;
            const z2 = L21 * xi1 + L22 * xi2;
            const z3 = L31 * xi1 + L32 * xi2 + L33 * xi3;
            const w = sampleGamma(halfNu, 2.0, rng, normalRng);
            const invScale = Math.sqrt(nu / w);
            out[3 * i] = t3Cdf(z1 * invScale);
            out[3 * i + 1] = t3Cdf(z2 * invScale);
            out[3 * i + 2] = t3Cdf(z3 * invScale);
        }
        return out;
    };

    // 3. Clayton copula (theta = 2): Marshall-Olkin V ~ Gamma(1/theta, 1), U_i = (1 + E_i/V)^(-1/theta)
    const sampleClayton = (N, rng, theta = THETA_CLAYTON) => {
        const normalRng = createNormalSampler(rng);
        const out = new Float32Array(3 * N);
        const invTheta = 1.0 / theta;
        for (let i = 0; i < N; i++) {
            const v = sampleGamma(invTheta, 1.0, rng, normalRng);
            let u1 = 0.0, u2 = 0.0, u3 = 0.0;
            while (u1 <= 1e-15) u1 = rng();
            while (u2 <= 1e-15) u2 = rng();
            while (u3 <= 1e-15) u3 = rng();
            const e1 = -Math.log(u1);
            const e2 = -Math.log(u2);
            const e3 = -Math.log(u3);
            out[3 * i] = Math.pow(1.0 + e1 / v, -invTheta);
            out[3 * i + 1] = Math.pow(1.0 + e2 / v, -invTheta);
            out[3 * i + 2] = Math.pow(1.0 + e3 / v, -invTheta);
        }
        return out;
    };

    /* ---------- Exact Statistics & Tail Probabilities ---------- */
    // O(n log n) Kendall's tau via merge-sort inversion counting
    const kendallTau = (x, y) => {
        const n = x.length;
        if (n <= 1) return 1.0;
        const items = new Array(n);
        for (let i = 0; i < n; i++) items[i] = { x: x[i], y: y[i] };
        items.sort((a, b) => a.x - b.x);

        const arr = new Float64Array(n);
        for (let i = 0; i < n; i++) arr[i] = items[i].y;
        const temp = new Float64Array(n);
        let inversions = 0;

        const mergeSort = (left, right) => {
            if (left >= right) return;
            const mid = (left + right) >> 1;
            mergeSort(left, mid);
            mergeSort(mid + 1, right);

            let i = left, j = mid + 1, k = left;
            while (i <= mid && j <= right) {
                if (arr[i] <= arr[j]) {
                    temp[k++] = arr[i++];
                } else {
                    inversions += (mid - i + 1);
                    temp[k++] = arr[j++];
                }
            }
            while (i <= mid) temp[k++] = arr[i++];
            while (j <= right) temp[k++] = arr[j++];
            for (let p = left; p <= right; p++) arr[p] = temp[p];
        };

        mergeSort(0, n - 1);
        const totalPairs = 0.5 * n * (n - 1);
        return (totalPairs - 2.0 * inversions) / totalPairs;
    };

    // Clayton exact lower orthants
    const tailClayton = (q, theta = THETA_CLAYTON) => {
        return Math.pow(2.0 * Math.pow(q, -theta) - 1.0, -1.0 / theta);
    };

    const tailClayton3D = (q, theta = THETA_CLAYTON) => {
        return Math.pow(3.0 * Math.pow(q, -theta) - 2.0, -1.0 / theta);
    };

    // Gaussian bivariate lower tail C(q, q) via substitution x = h - tan(theta)
    const tailGaussian = (q, rho = RHO_EQUICORR) => {
        const h = normalQuantile(q);
        const sqrt1mRho2 = Math.sqrt(1.0 - rho * rho);
        const N = 4000;
        const dTheta = (0.5 * Math.PI) / N;
        let sum = 0.0;
        for (let i = 0; i < N; i++) {
            const theta = (i + 0.5) * dTheta;
            const tanT = Math.tan(theta);
            const sec2T = 1.0 + tanT * tanT;
            const x = h - tanT;
            const phiX = normalPdf(x);
            const arg = (h - rho * x) / sqrt1mRho2;
            sum += phiX * phiCdf(arg) * sec2T;
        }
        return sum * dTheta;
    };

    // Student-t bivariate lower tail C(q, q) via substitution x = h - tan(theta)
    const tailStudentT = (q, nu = NU_STUDENT, rho = RHO_EQUICORR) => {
        const h = t3Quantile(q);
        const sqrt1mRho2 = Math.sqrt(1.0 - rho * rho);
        const N = 4000;
        const dTheta = (0.5 * Math.PI) / N;
        let sum = 0.0;
        for (let i = 0; i < N; i++) {
            const theta = (i + 0.5) * dTheta;
            const tanT = Math.tan(theta);
            const sec2T = 1.0 + tanT * tanT;
            const x = h - tanT;
            const f3Val = t3Pdf(x);
            const arg = Math.sqrt((nu + 1.0) / (nu + x * x)) * (h - rho * x) / sqrt1mRho2;
            sum += f3Val * t4Cdf(arg) * sec2T;
        }
        return sum * dTheta;
    };

    // Theoretical lower tail dependence limits lambda_L = lim_{q->0} C(q, q)/q
    const lambdaL_Gaussian = (rho = RHO_EQUICORR) => 0.0;

    const lambdaL_StudentT = (nu = NU_STUDENT, rho = RHO_EQUICORR) => {
        const arg = -Math.sqrt(((nu + 1.0) * (1.0 - rho)) / (1.0 + rho));
        return 2.0 * t4Cdf(arg);
    };

    const lambdaL_Clayton = (theta = THETA_CLAYTON) => {
        return Math.pow(2.0, -1.0 / theta);
    };

    /* ---------- 3D Space-Filling Alignment (Morton / Hilbert Order) ---------- */
    // Interleaves 10 bits each of ix, iy, iz into a 30-bit integer key
    const morton3DKey = (x, y, z) => {
        const ix = Math.min(1023, Math.max(0, Math.floor(x * 1024.0)));
        const iy = Math.min(1023, Math.max(0, Math.floor(y * 1024.0)));
        const iz = Math.min(1023, Math.max(0, Math.floor(z * 1024.0)));

        const part1by2 = (n) => {
            n = (n | (n << 16)) & 0x030000FF;
            n = (n | (n << 8))  & 0x0300F00F;
            n = (n | (n << 4))  & 0x030C30C3;
            n = (n | (n << 2))  & 0x09249249;
            return n;
        };
        return (part1by2(ix) << 2) | (part1by2(iy) << 1) | part1by2(iz);
    };

    // Sorts a point cloud Float32Array in place according to its 3D space-filling curve key
    // Guarantees minimal-transport smooth morphing between distributions
    const sortCloudByCurve = (cloud, N) => {
        const keys = new Int32Array(N);
        const indices = new Int32Array(N);
        for (let i = 0; i < N; i++) {
            keys[i] = morton3DKey(cloud[3 * i], cloud[3 * i + 1], cloud[3 * i + 2]);
            indices[i] = i;
        }
        indices.sort((a, b) => keys[a] - keys[b]);

        const copy = new Float32Array(cloud);
        for (let i = 0; i < N; i++) {
            const src = indices[i];
            cloud[3 * i]     = copy[3 * src];
            cloud[3 * i + 1] = copy[3 * src + 1];
            cloud[3 * i + 2] = copy[3 * src + 2];
        }
    };

    // Generate, align, and return all three 100k point clouds
    const generateAlignedPointClouds = (N, seed = 0x51514D32) => {
        const rngG = mulberry32(seed);
        const rngT = mulberry32(seed + 1);
        const rngC = mulberry32(seed + 2);

        const gaussianPts = sampleGaussian(N, rngG);
        const studentPts  = sampleStudentT(N, rngT);
        const claytonPts  = sampleClayton(N, rngC);

        sortCloudByCurve(gaussianPts, N);
        sortCloudByCurve(studentPts, N);
        sortCloudByCurve(claytonPts, N);

        return { gaussianPts, studentPts, claytonPts };
    };

    return {
        TAU_KENDALL,
        RHO_EQUICORR,
        THETA_CLAYTON,
        NU_STUDENT,
        mulberry32,
        erfc,
        phiCdf,
        normalPdf,
        normalQuantile,
        t3Cdf,
        t3Pdf,
        t3Quantile,
        t4Cdf,
        createNormalSampler,
        sampleGamma,
        sampleGaussian,
        sampleStudentT,
        sampleClayton,
        kendallTau,
        tailClayton,
        tailClayton3D,
        tailGaussian,
        tailStudentT,
        lambdaL_Gaussian,
        lambdaL_StudentT,
        lambdaL_Clayton,
        morton3DKey,
        sortCloudByCurve,
        generateAlignedPointClouds
    };
}));
