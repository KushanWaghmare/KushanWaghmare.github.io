/**
 * market-math.js
 *
 * Exact quantitative finance mathematics for the "Market galaxy" simulation:
 * - 60-asset 6-sector continuous factor model with regime-switching volatility
 * - Rolling correlation matrix C and Mantegna metric distance d_ij = sqrt(2(1 - rho_ij))
 * - Minimum Spanning Tree (MST via Kruskal) & normalised tree length L
 * - Symmetric Jacobi eigensolver & absorption ratio lambda_1 / N
 * - Marchenko-Pastur random matrix bounds and signal eigenvalue count
 * - 3-D SMACOF stress majorisation with Guttman transform
 * - Kabsch / Procrustes 3-D rigid alignment for temporal orientation locking
 *
 * Pure UMD module (Node.js & browser), zero dependencies, deterministic via mulberry32.
 */

(function (root, factory) {
    if (typeof module === "object" && module.exports) {
        module.exports = factory();
    } else {
        root.MarketMath = factory();
    }
}(typeof self !== "undefined" ? self : this, function () {
    "use strict";

    /* =========================================================================
       1. Deterministic PRNG & Normal Sampler (mulberry32 + Box-Muller)
       ========================================================================= */

    function mulberry32(seed) {
        let a = (seed >>> 0) || 1;
        return function () {
            a |= 0;
            a = (a + 0x6D2B79F5) | 0;
            let t = Math.imul(a ^ (a >>> 15), 1 | a);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }

    function createNormalSampler(rng) {
        let hasSpare = false;
        let spare = 0;
        return function () {
            if (hasSpare) {
                hasSpare = false;
                return spare;
            }
            let u = 0, v = 0;
            while (u === 0) u = rng();
            while (v === 0) v = rng();
            const r = Math.sqrt(-2.0 * Math.log(u));
            const theta = 2.0 * Math.PI * v;
            spare = r * Math.sin(theta);
            hasSpare = true;
            return r * Math.cos(theta);
        };
    }

    /* =========================================================================
       2. Multi-Factor Market Model Configuration & Generation
       ========================================================================= */

    const NUM_ASSETS = 60;
    const NUM_SECTORS = 6;
    const ASSETS_PER_SECTOR = 10;
    const ROLLING_WINDOW = 90; // T = 90 days

    const SECTOR_NAMES = [
        "Semiconductors & Compute",
        "Quantitative Software & Cloud",
        "Renewable Energy & Power",
        "Biotechnology & Genomics",
        "Aerospace & Symplectic Systems",
        "Decentralised Networks & Ledger"
    ];

    /**
     * Creates fixed asset properties (factor loadings b_i, c_i, and idiosyncratic noise sigma_e).
     */
    function createAssetUniverse(seed = 1093481) {
        const rng = mulberry32(seed);
        const assets = [];

        for (let i = 0; i < NUM_ASSETS; i++) {
            const sector = Math.floor(i / ASSETS_PER_SECTOR);
            // Market beta b_i ~ U(0.65, 1.35)
            const b = 0.65 + rng() * 0.70;
            // Sector loading c_i ~ U(0.85, 1.15)
            const c = 0.85 + rng() * 0.30;
            // Idiosyncratic vol sigma_e ~ U(0.008, 0.012)
            const sigmaE = 0.008 + rng() * 0.004;

            assets.push({
                id: i,
                ticker: `A${(i + 1).toString().padStart(2, "0")}`,
                sector,
                sectorName: SECTOR_NAMES[sector],
                b,
                c,
                sigmaE
            });
        }

        return assets;
    }

    const SIGMA_SECTOR = 0.012;     // 1.2% daily sector volatility
    const SIGMA_M_CALM = 0.005;     // 0.5% daily market volatility in calm
    const SIGMA_M_CRISIS = 0.025;   // 2.5% daily market volatility in crisis

    /**
     * Closed-form analytic covariance and correlation matrix for the factor model.
     */
    function analyticCorrelationMatrix(assets, sigmaM, sigmaS = SIGMA_SECTOR) {
        const N = assets.length;
        const C = Array.from({ length: N }, () => new Float64Array(N));
        const stds = new Float64Array(N);

        for (let i = 0; i < N; i++) {
            const a = assets[i];
            const variance = a.b * a.b * sigmaM * sigmaM +
                             a.c * a.c * sigmaS * sigmaS +
                             a.sigmaE * a.sigmaE;
            stds[i] = Math.sqrt(variance);
        }

        for (let i = 0; i < N; i++) {
            C[i][i] = 1.0;
            for (let j = i + 1; j < N; j++) {
                const ai = assets[i];
                const aj = assets[j];
                let cov = ai.b * aj.b * sigmaM * sigmaM;
                if (ai.sector === aj.sector) {
                    cov += ai.c * aj.c * sigmaS * sigmaS;
                }
                const rho = cov / (stds[i] * stds[j]);
                C[i][j] = rho;
                C[j][i] = rho;
            }
        }

        return { C, stds };
    }

    /**
     * Simulates returns for one day under given market volatility sigmaM.
     * r_i = b_i * m_t + c_i * s_{g(i),t} + e_{i,t}
     */
    function sampleDailyReturns(assets, sigmaM, normal, sigmaS = SIGMA_SECTOR) {
        const N = assets.length;
        const returns = new Float64Array(N);

        // 1. Common market factor m_t
        const mT = normal() * sigmaM;

        // 2. Six sector factors s_{g, t}
        const sT = new Float64Array(NUM_SECTORS);
        for (let g = 0; g < NUM_SECTORS; g++) {
            sT[g] = normal() * sigmaS;
        }

        // 3. Asset returns
        for (let i = 0; i < N; i++) {
            const a = assets[i];
            const e = normal() * a.sigmaE;
            returns[i] = a.b * mT + a.c * sT[a.sector] + e;
        }

        return returns;
    }

    /* =========================================================================
       3. Empirical Statistics: Correlation, Mantegna Distance, MST, Eigenvalues
       ========================================================================= */

    /**
     * Computes the empirical correlation matrix from a rolling window buffer
     * history: Float64Array of size T * N (row-major: time t in 0..T-1, asset i in 0..N-1).
     */
    function computeCorrelationMatrix(history, T, N) {
        const C = Array.from({ length: N }, () => new Float64Array(N));
        const means = new Float64Array(N);
        const stds = new Float64Array(N);

        for (let i = 0; i < N; i++) {
            let sum = 0.0;
            for (let t = 0; t < T; t++) {
                sum += history[t * N + i];
            }
            means[i] = sum / T;

            let varSum = 0.0;
            for (let t = 0; t < T; t++) {
                const diff = history[t * N + i] - means[i];
                varSum += diff * diff;
            }
            stds[i] = Math.sqrt(Math.max(1e-12, varSum / (T - 1)));
        }

        for (let i = 0; i < N; i++) {
            C[i][i] = 1.0;
            for (let j = i + 1; j < N; j++) {
                let covSum = 0.0;
                for (let t = 0; t < T; t++) {
                    covSum += (history[t * N + i] - means[i]) * (history[t * N + j] - means[j]);
                }
                const cov = covSum / (T - 1);
                const rho = Math.max(-1.0, Math.min(1.0, cov / (stds[i] * stds[j])));
                C[i][j] = rho;
                C[j][i] = rho;
            }
        }

        return { C, means, stds };
    }

    /**
     * Mantegna metric distance matrix d_ij = sqrt(2 * (1 - rho_ij)).
     */
    function computeDistanceMatrix(C) {
        const N = C.length;
        const D = Array.from({ length: N }, () => new Float64Array(N));
        for (let i = 0; i < N; i++) {
            D[i][i] = 0.0;
            for (let j = i + 1; j < N; j++) {
                const rho = Math.max(-1.0, Math.min(1.0, C[i][j]));
                const d = Math.sqrt(Math.max(0.0, 2.0 * (1.0 - rho)));
                D[i][j] = d;
                D[j][i] = d;
            }
        }
        return D;
    }

    /**
     * Minimum Spanning Tree (MST via Kruskal's algorithm with Union-Find).
     */
    function computeMST(D) {
        const N = D.length;
        const edges = [];
        for (let i = 0; i < N; i++) {
            for (let j = i + 1; j < N; j++) {
                edges.push({ u: i, v: j, w: D[i][j] });
            }
        }
        edges.sort((a, b) => a.w - b.w);

        const parent = new Int32Array(N);
        const rank = new Int32Array(N);
        for (let i = 0; i < N; i++) parent[i] = i;

        function find(i) {
            let root = i;
            while (root !== parent[root]) root = parent[root];
            let curr = i;
            while (curr !== root) {
                const nxt = parent[curr];
                parent[curr] = root;
                curr = nxt;
            }
            return root;
        }

        function union(i, j) {
            const rootI = find(i);
            const rootJ = find(j);
            if (rootI === rootJ) return false;
            if (rank[rootI] < rank[rootJ]) {
                parent[rootI] = rootJ;
            } else if (rank[rootI] > rank[rootJ]) {
                parent[rootJ] = rootI;
            } else {
                parent[rootJ] = rootI;
                rank[rootI]++;
            }
            return true;
        }

        const mstEdges = [];
        let totalWeight = 0.0;

        for (const e of edges) {
            if (union(e.u, e.v)) {
                mstEdges.push(e);
                totalWeight += e.w;
                if (mstEdges.length === N - 1) break;
            }
        }

        const normalisedTreeLength = totalWeight / (N - 1);
        return { edges: mstEdges, totalWeight, normalisedTreeLength };
    }

    /**
     * Prim's algorithm for MST verification.
     */
    function computeMSTPrim(D) {
        const N = D.length;
        const inMST = new Uint8Array(N);
        const minWeight = new Float64Array(N).fill(Infinity);
        const parent = new Int32Array(N).fill(-1);

        minWeight[0] = 0;
        let totalWeight = 0;

        for (let count = 0; count < N; count++) {
            let u = -1;
            let minW = Infinity;
            for (let v = 0; v < N; v++) {
                if (!inMST[v] && minWeight[v] < minW) {
                    minW = minWeight[v];
                    u = v;
                }
            }
            if (u === -1) break;

            inMST[u] = 1;
            totalWeight += minW;

            for (let v = 0; v < N; v++) {
                if (!inMST[v] && D[u][v] < minWeight[v]) {
                    minWeight[v] = D[u][v];
                    parent[v] = u;
                }
            }
        }

        return totalWeight;
    }

    /**
     * Symmetric Jacobi Eigensolver (Cyclic sweeps).
     * Computes all eigenvalues and orthogonal eigenvectors for real symmetric matrix A.
     */
    function jacobiEigenvalues(A, maxSweeps = 25) {
        const N = A.length;
        const V = Array.from({ length: N }, (_, r) => {
            const row = new Float64Array(N);
            row[r] = 1.0;
            return row;
        });

        const S = Array.from({ length: N }, (_, r) => new Float64Array(A[r]));

        for (let sweep = 0; sweep < maxSweeps; sweep++) {
            let maxOff = 0.0;
            for (let p = 0; p < N; p++) {
                for (let q = p + 1; q < N; q++) {
                    const Apq = S[p][q];
                    const absVal = Math.abs(Apq);
                    if (absVal > maxOff) maxOff = absVal;

                    if (absVal < 1e-13) continue;

                    const App = S[p][p];
                    const Aqq = S[q][q];
                    const tau = (Aqq - App) / (2.0 * Apq);
                    const t = Math.sign(tau || 1) / (Math.abs(tau) + Math.sqrt(1.0 + tau * tau));
                    const c = 1.0 / Math.sqrt(1.0 + t * t);
                    const s = t * c;

                    S[p][p] = App - t * Apq;
                    S[q][q] = Aqq + t * Apq;
                    S[p][q] = 0.0;
                    S[q][p] = 0.0;

                    for (let k = 0; k < N; k++) {
                        if (k !== p && k !== q) {
                            const Skp = S[k][p];
                            const Skq = S[k][q];
                            S[k][p] = c * Skp - s * Skq;
                            S[p][k] = S[k][p];
                            S[k][q] = s * Skp + c * Skq;
                            S[q][k] = S[k][q];
                        }
                    }

                    for (let k = 0; k < N; k++) {
                        const Vkp = V[k][p];
                        const Vkq = V[k][q];
                        V[k][p] = c * Vkp - s * Vkq;
                        V[k][q] = s * Vkp + c * Vkq;
                    }
                }
            }
            if (maxOff < 1e-13) break;
        }

        // Extract eigenvalues and sort descending
        const eig = [];
        for (let i = 0; i < N; i++) {
            eig.push({ val: S[i][i], col: i });
        }
        eig.sort((a, b) => b.val - a.val);

        const values = new Float64Array(N);
        const vectors = Array.from({ length: N }, () => new Float64Array(N));

        for (let i = 0; i < N; i++) {
            values[i] = eig[i].val;
            const srcCol = eig[i].col;
            for (let r = 0; r < N; r++) {
                vectors[r][i] = V[r][srcCol];
            }
        }

        return { values, vectors };
    }

    /**
     * Marchenko-Pastur theoretical noise threshold for Wishart matrix:
     * lambda_+ = (1 + sqrt(N / T))^2
     */
    function marchenkoPasturBounds(N, T) {
        const q = N / T;
        const sqrtQ = Math.sqrt(q);
        const lambdaPlus = (1.0 + sqrtQ) * (1.0 + sqrtQ);
        const lambdaMinus = Math.max(0.0, (1.0 - sqrtQ) * (1.0 - sqrtQ));
        return { lambdaPlus, lambdaMinus, q };
    }

    /**
     * Computes all required summary statistics for the market galaxy caption and dynamics:
     * - Absorption ratio lambda_1 / N
     * - Mean off-diagonal correlation rho_bar
     * - Normalised tree length L
     * - Number of signal eigenvalues above Marchenko-Pastur upper edge
     */
    function computeMarketStats(C, D, T) {
        const N = C.length;
        const { values } = jacobiEigenvalues(C);
        const { edges, totalWeight, normalisedTreeLength } = computeMST(D);
        const { lambdaPlus, lambdaMinus } = marchenkoPasturBounds(N, T);

        let sumOffDiag = 0.0;
        let countOffDiag = 0;
        for (let i = 0; i < N; i++) {
            for (let j = i + 1; j < N; j++) {
                sumOffDiag += C[i][j];
                countOffDiag++;
            }
        }
        const rhoBar = sumOffDiag / countOffDiag;

        const absorptionRatio = values[0] / N;

        let numSignalEigenvalues = 0;
        for (let i = 0; i < N; i++) {
            if (values[i] > lambdaPlus) {
                numSignalEigenvalues++;
            }
        }

        return {
            rhoBar,
            absorptionRatio,
            normalisedTreeLength,
            numSignalEigenvalues,
            lambda1: values[0],
            lambdaPlus,
            lambdaMinus,
            mstEdges: edges
        };
    }

    /* =========================================================================
       4. 3-D SMACOF Stress Majorisation & Procrustes Alignment
       ========================================================================= */

    /**
     * Computes raw MDS stress sigma(X) = sum_{i < j} (D_ij - ||x_i - x_j||)^2
     */
    function computeStress(X, D) {
        const N = D.length;
        let stress = 0.0;
        for (let i = 0; i < N; i++) {
            for (let j = i + 1; j < N; j++) {
                const dx = X[i][0] - X[j][0];
                const dy = X[i][1] - X[j][1];
                const dz = X[i][2] - X[j][2];
                const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
                const diff = D[i][j] - dist;
                stress += diff * diff;
            }
        }
        return stress;
    }

    /**
     * Performs numIterations of SMACOF stress majorisation with unit weights and Guttman transform.
     */
    function smacofStep(X, D, numIterations = 5) {
        const N = D.length;
        // Deep copy current positions
        let curX = X.map(row => Float64Array.from(row));

        for (let iter = 0; iter < numIterations; iter++) {
            const nextX = Array.from({ length: N }, () => new Float64Array(3));

            // B(X) * X with Guttman transform
            for (let i = 0; i < N; i++) {
                let diagB = 0.0;
                for (let j = 0; j < N; j++) {
                    if (i !== j) {
                        const dx = curX[i][0] - curX[j][0];
                        const dy = curX[i][1] - curX[j][1];
                        const dz = curX[i][2] - curX[j][2];
                        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

                        if (dist > 1e-12) {
                            const b_ij = -D[i][j] / dist;
                            diagB -= b_ij;
                            nextX[i][0] += b_ij * curX[j][0];
                            nextX[i][1] += b_ij * curX[j][1];
                            nextX[i][2] += b_ij * curX[j][2];
                        }
                    }
                }
                nextX[i][0] += diagB * curX[i][0];
                nextX[i][1] += diagB * curX[i][1];
                nextX[i][2] += diagB * curX[i][2];

                // Scale by 1 / N
                nextX[i][0] /= N;
                nextX[i][1] /= N;
                nextX[i][2] /= N;
            }

            curX = nextX;
        }

        return curX;
    }

    /**
     * Procrustes / Kabsch rigid 3-D alignment:
     * Finds optimal orthogonal rotation R and translation to match new positions X
     * to previous positions X_prev without coordinate flipping or drift.
     */
    function procrustesAlign(X, X_prev) {
        const N = X.length;

        // 1. Centre of mass of both layouts
        let cx = 0, cy = 0, cz = 0;
        let px = 0, py = 0, pz = 0;
        for (let i = 0; i < N; i++) {
            cx += X[i][0]; cy += X[i][1]; cz += X[i][2];
            px += X_prev[i][0]; py += X_prev[i][1]; pz += X_prev[i][2];
        }
        cx /= N; cy /= N; cz /= N;
        px /= N; py /= N; pz /= N;

        // 2. Cross-covariance matrix H = X_c^T * P_c (3x3)
        const H = [
            new Float64Array(3),
            new Float64Array(3),
            new Float64Array(3)
        ];

        for (let i = 0; i < N; i++) {
            const x0 = X[i][0] - cx, x1 = X[i][1] - cy, x2 = X[i][2] - cz;
            const p0 = X_prev[i][0] - px, p1 = X_prev[i][1] - py, p2 = X_prev[i][2] - pz;

            H[0][0] += x0 * p0; H[0][1] += x0 * p1; H[0][2] += x0 * p2;
            H[1][0] += x1 * p0; H[1][1] += x1 * p1; H[1][2] += x1 * p2;
            H[2][0] += x2 * p0; H[2][1] += x2 * p1; H[2][2] += x2 * p2;
        }

        // 3. Polar decomposition / SVD of 3x3 matrix H
        // H = U * S * V^T, optimal rotation R = U * V^T
        // Using symmetric eigensolver on H^T * H
        const HtH = [
            new Float64Array(3),
            new Float64Array(3),
            new Float64Array(3)
        ];
        for (let r = 0; r < 3; r++) {
            for (let c = 0; c < 3; c++) {
                let sum = 0;
                for (let k = 0; k < 3; k++) sum += H[k][r] * H[k][c];
                HtH[r][c] = sum;
            }
        }

        const { values: eigVals, vectors: V } = jacobiEigenvalues(HtH);

        // Singular values s_i = sqrt(max(0, eigVals[i]))
        const s = new Float64Array(3);
        const U = [new Float64Array(3), new Float64Array(3), new Float64Array(3)];

        for (let i = 0; i < 3; i++) {
            s[i] = Math.sqrt(Math.max(1e-12, eigVals[i]));
            // u_i = H * v_i / s_i
            const invS = 1.0 / s[i];
            for (let r = 0; r < 3; r++) {
                let sum = 0;
                for (let c = 0; c < 3; c++) sum += H[r][c] * V[c][i];
                U[r][i] = sum * invS;
            }
        }

        // Optimal rotation R = U * diag(1, 1, det(U * V^T)) * V^T
        // Check determinant to prevent reflection
        const UVt = [new Float64Array(3), new Float64Array(3), new Float64Array(3)];
        for (let r = 0; r < 3; r++) {
            for (let c = 0; c < 3; c++) {
                let sum = 0;
                for (let k = 0; k < 3; k++) sum += U[r][k] * V[c][k];
                UVt[r][c] = sum;
            }
        }

        const det = UVt[0][0] * (UVt[1][1] * UVt[2][2] - UVt[1][2] * UVt[2][1]) -
                    UVt[0][1] * (UVt[1][0] * UVt[2][2] - UVt[1][2] * UVt[2][0]) +
                    UVt[0][2] * (UVt[1][0] * UVt[2][1] - UVt[1][1] * UVt[2][0]);

        const dSign = det < 0 ? -1.0 : 1.0;

        const R = [new Float64Array(3), new Float64Array(3), new Float64Array(3)];
        for (let r = 0; r < 3; r++) {
            for (let c = 0; c < 3; c++) {
                R[r][c] = U[r][0] * V[c][0] +
                          U[r][1] * V[c][1] +
                          U[r][2] * V[c][2] * dSign;
            }
        }

        // Apply rotation and centre alignment: X_aligned = X_c * R + P_centre
        const aligned = Array.from({ length: N }, () => new Float64Array(3));
        for (let i = 0; i < N; i++) {
            const x0 = X[i][0] - cx;
            const x1 = X[i][1] - cy;
            const x2 = X[i][2] - cz;

            aligned[i][0] = px + (x0 * R[0][0] + x1 * R[1][0] + x2 * R[2][0]);
            aligned[i][1] = py + (x0 * R[0][1] + x1 * R[1][1] + x2 * R[2][1]);
            aligned[i][2] = pz + (x0 * R[0][2] + x1 * R[1][2] + x2 * R[2][2]);
        }

        return aligned;
    }

    /**
     * Generates initial 3-D coordinates for the assets grouped by sector clusters.
     * Optionally relaxes against the calm regime distance matrix via SMACOF.
     */
    function createInitialLayout(assets, radius = 1.35, relaxIterations = 0) {
        const N = assets.length;
        let layout = Array.from({ length: N }, () => new Float64Array(3));

        for (let i = 0; i < N; i++) {
            const a = assets[i];
            const sectorAngle = (2.0 * Math.PI * a.sector) / NUM_SECTORS;
            const subIdx = i % ASSETS_PER_SECTOR;
            const subAngle = (2.0 * Math.PI * subIdx) / ASSETS_PER_SECTOR;

            const clusterCentreX = radius * Math.cos(sectorAngle);
            const clusterCentreZ = radius * Math.sin(sectorAngle);
            const clusterCentreY = 0.25 * Math.sin(2.0 * sectorAngle);

            const spread = 0.28;
            layout[i][0] = clusterCentreX + spread * Math.cos(subAngle);
            layout[i][1] = clusterCentreY + 0.18 * (subIdx / ASSETS_PER_SECTOR - 0.5);
            layout[i][2] = clusterCentreZ + spread * Math.sin(subAngle);
        }

        if (relaxIterations > 0) {
            const { C } = analyticCorrelationMatrix(assets, SIGMA_M_CALM);
            const D = computeDistanceMatrix(C);
            layout = smacofStep(layout, D, relaxIterations);
        }

        return layout;
    }

    /* =========================================================================
       Export API
       ========================================================================= */

    return {
        NUM_ASSETS,
        NUM_SECTORS,
        ASSETS_PER_SECTOR,
        ROLLING_WINDOW,
        SECTOR_NAMES,
        SIGMA_SECTOR,
        SIGMA_M_CALM,
        SIGMA_M_CRISIS,
        mulberry32,
        createNormalSampler,
        createAssetUniverse,
        analyticCorrelationMatrix,
        sampleDailyReturns,
        computeCorrelationMatrix,
        computeDistanceMatrix,
        computeMST,
        computeMSTPrim,
        jacobiEigenvalues,
        marchenkoPasturBounds,
        computeMarketStats,
        computeStress,
        smacofStep,
        procrustesAlign,
        createInitialLayout
    };
}));
