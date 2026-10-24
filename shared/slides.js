/* Portfolio Slide Simulation Registry.
   Maps each .snap-section slide key to its parameterised simulation engine.
   Each entry defines:
     - engine: key in ENGINES (from shared/engines.js)
     - params: bespoke parameter dictionary (must be unique per slide)
     - caption: explanatory status label rendered via KW.tag
   
   Rule: The hub domain previews (hub:domain-<k>) reuse domain:<k>:0.
   All other slides must have strictly unique { engine, params }. */

(function (root, factory) {
    if (typeof module === "object" && module.exports) {
        module.exports = factory();
    } else {
        root.SLIDE_SIMS = factory().SLIDE_SIMS;
    }
}(typeof self !== "undefined" ? self : this, function () {
    "use strict";

    const SLIDE_SIMS = {
        /* =====================================================================
           HUB SLIDES (index.html)
           ===================================================================== */
        "hub:intro": {
            engine: "orbit",
            params: { system: "lorenz", sigma: 10, rho: 28, beta: 2.6667, numTraj: 5, dt: 0.005, scale: 9.5, pert: 0.001 },
            caption: "Lorenz system · σ=10, ρ=28, β=8/3 · RK4 · 5 domain trajectories",
        },
        "hub:domain-math": {
            engine: "cy-cross-section-2d",
            params: { type: "gauss-bonnet-figure8", uSteps: 140, vSteps: 28, scale: 1.1 },
            caption: "Fermat curve z₁⁵ + z₂⁵ = 1 · cross-section of the quintic Calabi–Yau threefold · 25 patches · genus 6 (χ = −10 for the completed curve; the 5 ends at infinity are clipped) · projection angle α = 0.70 rad · click: next n",
        },
        "hub:domain-physics": {
            engine: "blackhole",
            params: { spin: 0.95, inclination: 78, mode: "physical", disk: "thin" },
            caption: "Kerr null geodesics (a = 0.95) · Boyer–Lindquist RK4 ray tracer · Novikov–Thorne thin disk · Doppler beaming g⁴ · photon ring · cursor tilts inclination",
        },
        "hub:domain-datascience": {
            engine: "flock",
            params: { model: "reynolds-hk", n: 64, rVis: 68, rSep: 22, opinionEps: 0.30, vMax: 3.2 },
            caption: "Reverse-time SDE · closed-form Gaussian-mixture score · 65k GPU particles · click re-noises · press 'M' to toggle ODE",
        },
        "hub:domain-quant": {
            engine: "paths",
            params: { process: "gbm", paths: 65, steps: 220, mu: 0.05, sigma: 0.32, band: 1.0 },
            caption: "Exchange option on two assets · bivariate binomial lattice · n = 32 · 12,529 nodes · lattice 12.18 · Margrabe exact 12.18 · error 0.00 (0.00%) · ρ = 0.30 (move the pointer) · click: double the steps · Illustrative: S₁ = S₂ = 100, σ₁ = 30%, σ₂ = 20%, r = 3%, T = 1 year",
        },
        "hub:domain-cs": {
            engine: "cs-2d",
            params: { type: "elementary", rule: 110, cols: 150, rows: 90, speed: 32 },
            caption: "Grover search · 8 simulated qubits (exact classical simulation, not a quantum device) · N = 256 · optimal k = 12 · Shor period finding (N = 15, a = 7)",
        },
        "hub:papers": {
            engine: "surface",
            params: { type: "poincare-disc", nodes: 26, radius: 240 },
            caption: "Poincaré hyperbolic disc · ds² = 4|dz|²/(1 − |z|²)² · conformal Möbius citation geodesics",
        },
        "hub:courses": {
            engine: "graph",
            params: { type: "dag-pipeline", tiers: [4, 5, 4, 3], pulseSpeed: 0.55 },
            caption: "Curriculum Directed Acyclic Graph (DAG) · topological sort · prerequisite signal conduction",
        },
        "hub:contact": {
            engine: "nbody",
            params: { mode: "figure8-choreography", n: 3, g: 1, soft: 0.16, dt: 0.0028, trail: 320 },
            caption: "Gravitational 3-body problem · r̈ᵢ = −∑ G mⱼ (rᵢ − rⱼ)/|rᵢ − rⱼ|³ · RK4 chaotic choreography",
        },

        /* =====================================================================
           MATHEMATICS DOMAIN (math.html)
           ===================================================================== */
        "domain:math:0": {
            engine: "cy-cross-section-2d",
            params: { type: "gauss-bonnet-figure8", uSteps: 140, vSteps: 28, scale: 1.1 },
            caption: "Fermat curve z₁⁵ + z₂⁵ = 1 · cross-section of the quintic Calabi–Yau threefold · 25 patches · genus 6 (χ = −10 for the completed curve; the 5 ends at infinity are clipped) · projection angle α = 0.70 rad · click: next n",
        },
        "domain:math:1": {
            engine: "surface",
            params: { type: "mobius-transport", r: 2.05, width: 0.85, needles: 32 },
            caption: "Möbius strip & normal vector transport n(2π,v) = −n(0,−v) · non-orientable topology",
        },
        "domain:math:2": {
            engine: "fourier",
            params: { type: "fft-butterfly", stages: 4, points: 16, animSpeed: 0.85, showPhasors: true },
            caption: "Cooley–Tukey radix-2 FFT · bit-reversal permutation & twiddle factor W_N^k butterflies · X_k = E_k + W_N^k O_k · O(N log N) flow · click to cycle signal",
        },
        "domain:math:3": {
            engine: "orbit",
            params: { system: "rossler", a: 0.2, b: 0.2, c: 5.7, dt: 0.012, scale: 14, trail: 420 },
            caption: "Rössler strange attractor · dx/dt = -y-z, dy/dt = x+ay, dz/dt = b+z(x-c) · RK4",
        },

        /* =====================================================================
           PHYSICS DOMAIN (physics.html)
           ===================================================================== */
        "domain:physics:0": {
            engine: "blackhole",
            params: { spin: 0.95, inclination: 78, mode: "physical", disk: "thin" },
            caption: "Kerr null geodesics (a = 0.95) · Boyer–Lindquist RK4 ray tracer · Novikov–Thorne thin disk · Doppler beaming g⁴ · photon ring · cursor tilts inclination",
        },
        "domain:physics:1": {
            engine: "nbody",
            params: { mode: "colliding-clusters", n: 110, dt: 0.011, soft: 14, quadtree: true },
            caption: "Symplectic KDK N-body & live Barnes–Hut spatial quadtree (s/d < θ)",
        },
        "domain:physics:2": {
            engine: "wave",
            params: { grid: 256, k0: 58, sigma: 0.038, barrierW: 0.025, barrierH: 0.65 },
            caption: "Split-step Fourier TDSE · Re(ψ), Im(ψ), |ψ(x,t)|² tunnelling through barrier V(x)",
        },
        "domain:physics:3": {
            engine: "pendulum",
            params: { mode: "double", lengths: [1.0, 1.0], masses: [1.0, 1.0], numTraj: 3, dt: 0.0041, trail: 260 },
            caption: "Chaotic double pendulum · RK4 fixed-step · 3 trajectories with Δθ₀ = 10⁻³ Lyapunov divergence",
        },

        /* =====================================================================
           DATA SCIENCE DOMAIN (datascience.html)
           ===================================================================== */
        "domain:datascience:0": {
            engine: "flock",
            params: { model: "reynolds-hk", n: 64, rVis: 68, rSep: 22, opinionEps: 0.30, vMax: 3.2 },
            caption: "Reverse-time SDE · closed-form Gaussian-mixture score · 65k GPU particles · click re-noises · press 'M' to toggle ODE",
        },
        "domain:datascience:1": {
            engine: "descent",
            params: { landscape: "lasso-ridge-contours", points: 24, lambda: 0.35 },
            caption: "OLS vs Ridge (L₂) & Lasso (L₁) · λ = 0.35 · sparse L₁ diamond & elliptical RSS contours",
        },
        "domain:datascience:2": {
            engine: "graph",
            params: { type: "spectral-sbm", clusters: 5, nodesPerCluster: 18, pIn: 0.34, pOut: 0.012 },
            caption: "Stochastic Block Model (K=5) · Laplacian L_sym spectral embedding morph",
        },
        "domain:datascience:3": {
            engine: "diffusion",
            params: { grid: 220, numParticles: 50, dCoeff: 0.28, tilt: 0.0 },
            caption: "Fokker–Planck Langevin diffusion · ∂p/∂t = ∇·(∇V p + D∇p) · Kramers double-well escape",
        },

        /* =====================================================================
           QUANTITATIVE FINANCE DOMAIN (quant.html)
           ===================================================================== */
        "domain:quant:0": {
            engine: "paths",
            params: { process: "gbm", paths: 65, steps: 220, mu: 0.05, sigma: 0.32, band: 1.0 },
            caption: "Exchange option on two assets · bivariate binomial lattice · n = 32 · 12,529 nodes · lattice 12.18 · Margrabe exact 12.18 · error 0.00 (0.00%) · ρ = 0.30 (move the pointer) · click: double the steps · Illustrative: S₁ = S₂ = 100, σ₁ = 30%, σ₂ = 20%, r = 3%, T = 1 year",
        },
        "domain:quant:1": {
            engine: "copula",
            params: { threshold: 0.05 },
            caption: "Same correlation, different crashes · Gaussian, Student-t & Clayton copulas · Kendall’s τ = 0.50 · lower tail dependence λ_L ∈ {0.00, 0.45, 0.71} · 100,000 assets in (0,1)³",
        },
        "domain:quant:2": {
            engine: "paths",
            params: { process: "ou-spread", samples: 200, sigmaSpread: 0.42 },
            caption: "Co-integrated pairs & Ornstein–Uhlenbeck z-score engine · ±2σ entry bands · Sharpe = 1.8",
        },
        "domain:quant:3": {
            engine: "markov",
            params: { states: 5, numWalkers: 45 },
            caption: "Discrete-time Markov chain & transition state graph · ergodic distribution flow",
        },

        /* =====================================================================
           COMPUTER SCIENCE DOMAIN (cs.html)
           ===================================================================== */
        "domain:cs:0": {
            engine: "cs-2d",
            params: { type: "elementary", rule: 110, cols: 150, rows: 90, speed: 32 },
            caption: "Grover search · 8 simulated qubits (exact classical simulation, not a quantum device) · N = 256 · optimal k = 12 · Shor period finding (N = 15, a = 7)",
        },
        "domain:cs:1": {
            engine: "algo",
            params: { type: "compiler-ssa", nodeCardW: 230 },
            caption: "Ku-Lang LLVM IR Control-Flow Graph · SSA φ-node dominance frontier & dataflow propagation",
        },
        "domain:cs:2": {
            engine: "algo",
            params: { type: "ttl-wbus", clkSpeed: 2.5 },
            caption: "8-Bit TTL computer · 8-line shared W-Bus, ripple-carry ALU (S = A ⊕ B ⊕ Cin) & logic-analyser trace",
        },
        "domain:cs:3": {
            engine: "automaton",
            params: { type: "elementary", rule: 30, cols: 150, rows: 90, speed: 35 },
            caption: "Wolfram Rule 30 chaotic aperiodic cellular automaton · class III complexity",
        },

        /* =====================================================================
           PROJECT INDEX HERO (project.html)
           ===================================================================== */
        "project-index:hero": {
            engine: "pendulum",
            params: { mode: "double", lengths: [1.1, 0.9], masses: [1.2, 0.8], g: 9.81, dt: 0.004, numTraj: 3, th1: 1.85, th2: 1.85, pert: 0.001, trail: 300 },
            caption: "Chaotic double pendulum · RK4 fixed-step · 3 trajectories with Δθ₀ = 10⁻³ Lyapunov divergence · click to perturb",
        },

        /* =====================================================================
           PROJECT 1: mobius-surfaces (Mathematics)
           ===================================================================== */
        "project:mobius-surfaces:hero": {
            engine: "surface",
            params: { type: "mobius-transport", r: 2.2, width: 0.95, needles: 44, twistSpeed: 0.28 },
            caption: "Möbius band non-orientable normal vector transport · n(2π,v) = −n(0,−v) · 44 normal frames",
        },
        "project:mobius-surfaces:overview": {
            engine: "surface",
            params: { type: "gauss-bonnet-figure8", uSteps: 120, vSteps: 24, scale: 0.95, twistFreq: 0.45 },
            caption: "Figure-8 Klein surface immersion · continuous twist t ∈ (0, 2) seam closure · Gaussian curvature K",
        },
        "project:mobius-surfaces:arch": {
            engine: "lattice",
            params: { n: 56, coupling: 5.2, mode: 3, gridW: 180, gridH: 16 },
            caption: "180×16 parametric mesh vertex buffer · discrete Laplace–Beltrami coordinate conduction",
        },
        "project:mobius-surfaces:math": {
            engine: "surface",
            params: { type: "geodesic-hyperboloid", a: 1.15, c: 1.55, particles: 20, dt: 0.018 },
            caption: "Riemannian geodesic flow üᵏ + Γᵏᵢⱼ u̇ⁱ u̇ʲ = 0 · metric tensor first fundamental form E, F, G",
        },
        "project:mobius-surfaces:nav": {
            engine: "fourier",
            params: { signal: "sawtooth", harmonics: 7, baseR: 0.15, showSpectrum: false },
            caption: "Sibling deep-dive connector · Fourier epicycles & orthogonal harmonic decomposition",
        },

        /* =====================================================================
           PROJECT 2: fourier-spectral (Mathematics)
           ===================================================================== */
        "project:fourier-spectral:hero": {
            engine: "fourier",
            params: { type: "fft-butterfly", stages: 4, points: 16, animSpeed: 1.05, showPhasors: true, interactiveTrace: true },
            caption: "Cooley–Tukey radix-2 FFT · bit-reversal permutation & twiddle factor W_N^k butterflies · X_k = E_k + W_N^k O_k · O(N log N) flow · click to cycle signal",
        },
        "project:fourier-spectral:overview": {
            engine: "fourier",
            params: { signal: "triangle", harmonics: 9, showSpectrum: true, baseR: 0.16 },
            caption: "Chebyshev–Gauss–Lobatto polynomial collocation xⱼ = cos(jπ/N) · L² spectral convergence",
        },
        "project:fourier-spectral:arch": {
            engine: "algo",
            params: { type: "fft-butterfly", stages: 4, points: 16, animSpeed: 0.7 },
            caption: "Cooley–Tukey radix-2 FFT pipeline · bit-reversal permutation & twiddle factor W_N^k butterflies",
        },
        "project:fourier-spectral:math": {
            engine: "wave",
            params: { grid: 256, k0: 44, sigma: 0.042, barrierW: 0.015, barrierH: 0.35, dispersion: 0.006 },
            caption: "Spectral differentiation (ik)ᵖ in Fourier space · Korteweg–de Vries dispersion ∂ₜu + u∂ₓu = ν∂ₓₓu",
        },
        "project:fourier-spectral:nav": {
            engine: "surface",
            params: { type: "gauss-bonnet-figure8", uSteps: 100, vSteps: 20, scale: 0.85, twistFreq: 0.3 },
            caption: "Sibling deep-dive connector · Riemannian surface geometry & Möbius non-orientable manifolds",
        },

        /* =====================================================================
           PROJECT 3: nbody-leapfrog (Physics)
           ===================================================================== */
        "project:nbody-leapfrog:hero": {
            engine: "nbody",
            params: { mode: "kepler-precession", eccentricity: 0.74, gammaRel: 0.09, steps: 320, dt: 0.014 },
            caption: "Relativistic Kepler precession under symplectic leapfrog · Δφ = 6πGM/(c²a(1−e²)) · e = 0.74",
        },
        "project:nbody-leapfrog:overview": {
            engine: "nbody",
            params: { mode: "lagrange-points", m1: 1200, m2: 40, dist: 160, dt: 0.016 },
            caption: "Circular restricted three-body problem · L1–L5 Lagrange equilibrium points & Jacobi integral C_J",
        },
        "project:nbody-leapfrog:arch": {
            engine: "nbody",
            params: { mode: "central-heavy", n: 90, dt: 0.018, soft: 12, quadtree: true, mCenter: 10000 },
            caption: "Barnes–Hut spatial quadtree decomposition · multipole acceptance criterion s/d < θ · O(N log N)",
        },
        "project:nbody-leapfrog:math": {
            engine: "orbit",
            params: { system: "vanderpol", mu: 0.85, dt: 0.014, scale: 65, trail: 340 },
            caption: "Symplectic phase-space preservation dp ∧ dq = const · shadow Hamiltonian conservation",
        },
        "project:nbody-leapfrog:nav": {
            engine: "wave",
            params: { grid: 256, k0: 52, sigma: 0.036, barrierW: 0.028, barrierH: 0.58 },
            caption: "Sibling deep-dive connector · quantum wavepacket tunnelling & unitary Strang splitting",
        },

        /* =====================================================================
           PROJECT 4: split-step-schrodinger (Physics)
           ===================================================================== */
        "project:split-step-schrodinger:hero": {
            engine: "wave",
            params: { grid: 256, k0: 64, sigma: 0.032, barrierW: 0.02, barrierH: 0.78 },
            caption: "Quantum barrier tunnelling · split-step Fourier Strang splitting · transmission T ≈ exp(−2∫κ dx)",
        },
        "project:split-step-schrodinger:overview": {
            engine: "wave",
            params: { grid: 256, k0: 36, sigma: 0.048, barrierW: 0.04, barrierH: 0.42 },
            caption: "Quantum harmonic trap V(x) = ½mω²x² · coherent state dipole oscillation & ground state convergence",
        },
        "project:split-step-schrodinger:arch": {
            engine: "wave",
            params: { grid: 256, k0: 48, sigma: 0.04, barrierW: 0.018, barrierH: 0.5, showDualSpace: true },
            caption: "Dual-space splitting pipeline: coordinate phase kick exp(−iVΔt/2) ↔ momentum kinetic step exp(−iTk²Δt)",
        },
        "project:split-step-schrodinger:math": {
            engine: "diffusion",
            params: { grid: 200, numParticles: 40, dt: 0.0025, dCoeff: 0.22, tilt: 0.3 },
            caption: "Gross–Pitaevskii non-linear solitary wavepacket balance i∂ₜψ = −½∇²ψ + g|ψ|²ψ",
        },
        "project:split-step-schrodinger:nav": {
            engine: "nbody",
            params: { mode: "central-heavy", n: 75, dt: 0.015, soft: 16, mCenter: 8500 },
            caption: "Sibling deep-dive connector · classical N-body gravitational orbits & symplectic integrators",
        },

        /* =====================================================================
           PROJECT 5: regularised-regression (Data Science)
           ===================================================================== */
        "project:regularised-regression:hero": {
            engine: "descent",
            params: { landscape: "lasso-ridge-contours", points: 30, lambda: 0.52, featureSweep: true },
            caption: "Lasso L1 regularisation coefficient path · soft-thresholding shrinkage S(z, λ) as λ sweeps",
        },
        "project:regularised-regression:overview": {
            engine: "descent",
            params: { landscape: "lasso-ridge-contours", points: 18, lambda: 0.22, contourMode: "elastic-net" },
            caption: "Elastic net dual geometry · convex intersection of quadratic RSS contours with L1 rhombus & L2 sphere",
        },
        "project:regularised-regression:arch": {
            engine: "descent",
            params: { landscape: "lasso-ridge-contours", points: 36, lambda: 0.72, showTrajectory: true },
            caption: "Active-set coordinate descent convergence · orthogonal axis-aligned sweeps to KKT fixed point",
        },
        "project:regularised-regression:math": {
            engine: "descent",
            params: { landscape: "lasso-ridge-contours", points: 26, lambda: 0.40, cvBands: true },
            caption: "K-fold cross-validation MSE curve with ±1 standard error bands · optimal parsimonious model λ_1se",
        },
        "project:regularised-regression:nav": {
            engine: "graph",
            params: { type: "spectral-sbm", clusters: 3, nodesPerCluster: 22, pIn: 0.42, pOut: 0.015 },
            caption: "Sibling deep-dive connector · graph Laplacian spectral clustering & unsupervised manifold partitioning",
        },

        /* =====================================================================
           PROJECT 6: spectral-clustering (Data Science)
           ===================================================================== */
        "project:spectral-clustering:hero": {
            engine: "graph",
            params: { type: "two-moons-embedding", nPoints: 110, noise: 0.075, sigma: 0.22 },
            caption: "Two-moons non-convex manifold · graph Laplacian spectral embedding separating entangled clusters",
        },
        "project:spectral-clustering:overview": {
            engine: "graph",
            params: { type: "spectral-sbm", clusters: 4, nodesPerCluster: 16, pIn: 0.38, pOut: 0.02 },
            caption: "Continuous affinity graph construction · Gaussian RBF kernel W_ij = exp(−||x_i − x_j||²/2σ²)",
        },
        "project:spectral-clustering:arch": {
            engine: "graph",
            params: { type: "dag-pipeline", tiers: [3, 4, 4, 2], pulseSpeed: 0.65 },
            caption: "Lanczos tridiagonalization pipeline · affinity constructor → degree matrix → eigensolver → k-means",
        },
        "project:spectral-clustering:math": {
            engine: "graph",
            params: { type: "spectral-sbm", clusters: 2, nodesPerCluster: 28, pIn: 0.46, pOut: 0.008 },
            caption: "Normalised Cut NCut(A, B) = cut/vol(A) + cut/vol(B) · Cheeger inequality 2h_G ≤ λ₂ ≤ 2h_G",
        },
        "project:spectral-clustering:nav": {
            engine: "descent",
            params: { landscape: "lasso-ridge-contours", points: 22, lambda: 0.28, showDescentLine: true },
            caption: "Sibling deep-dive connector · coordinate descent optimisation & regularised sparse regressions",
        },

        /* =====================================================================
           PROJECT 7: options-pricing (Quantitative Finance)
           ===================================================================== */
        "project:options-pricing:hero": {
            engine: "paths",
            params: { process: "gbm", paths: 80, steps: 240, mu: 0.04, sigma: 0.26, strikeLine: 1.05 },
            caption: "Exchange option on two assets · bivariate binomial lattice · n = 32 · 12,529 nodes · lattice 12.18 · Margrabe exact 12.18 · error 0.00 (0.00%) · ρ = 0.30 (move the pointer) · click: double the steps · Illustrative: S₁ = S₂ = 100, σ₁ = 30%, σ₂ = 20%, r = 3%, T = 1 year",
        },
        "project:options-pricing:overview": {
            engine: "paths",
            params: { process: "gbm", paths: 45, steps: 180, mu: 0.06, sigma: 0.38, deltaHedge: true },
            caption: "Continuous delta hedging simulation · self-financing portfolio replication error Π = V − ΔS",
        },
        "project:options-pricing:arch": {
            engine: "paths",
            params: { process: "gbm", paths: 95, steps: 200, mu: 0.03, sigma: 0.20, antithetic: true },
            caption: "Monte Carlo validator with antithetic variate pairs (Z, −Z) · standard error reduction O(1/√N)",
        },
        "project:options-pricing:math": {
            engine: "paths",
            params: { process: "gbm", paths: 50, steps: 210, mu: 0.05, sigma: 0.45, showGreeksBand: true },
            caption: "Analytical Greeks profiles · Delta sensitivity Δ = Φ(d₁) & Gamma curvature Γ = φ(d₁)/(S σ √T)",
        },
        "project:options-pricing:nav": {
            engine: "paths",
            params: { process: "ou-spread", samples: 180, sigmaSpread: 0.36 },
            caption: "Sibling deep-dive connector · co-integrated pairs trading & Ornstein–Uhlenbeck mean-reversion",
        },

        /* =====================================================================
           PROJECT 8: stat-arb (Quantitative Finance)
           ===================================================================== */
        "project:stat-arb:hero": {
            engine: "paths",
            params: { process: "ou-spread", samples: 220, sigmaSpread: 0.48, hedgeRatio: 1.35, showZEntry: true },
            caption: "Co-integrated asset pair yₜ = β xₜ + εₜ & mean-reverting spread · entry/exit z-score trading bands",
        },
        "project:stat-arb:overview": {
            engine: "paths",
            params: { process: "ou-spread", samples: 160, sigmaSpread: 0.28, phasePlane: true },
            caption: "Co-integration manifold in price space · non-stationary I(1) drivers with stationary I(0) residual",
        },
        "project:stat-arb:arch": {
            engine: "paths",
            params: { process: "ou-spread", samples: 240, sigmaSpread: 0.55, showPnlCurve: true },
            caption: "Production backtester pipeline · rolling ADF stationarity filter → AR(1) theta fit → signal engine",
        },
        "project:stat-arb:math": {
            engine: "diffusion",
            params: { grid: 190, numParticles: 45, dt: 0.0028, dCoeff: 0.16, tilt: 0.0, ouPotential: true },
            caption: "Ornstein–Uhlenbeck Fokker–Planck density evolution · stationary Gaussian distribution N(μ, η²/(2θ))",
        },
        "project:stat-arb:nav": {
            engine: "paths",
            params: { process: "gbm", paths: 55, steps: 190, mu: 0.045, sigma: 0.24 },
            caption: "Sibling deep-dive connector · Black–Scholes analytical options pricing & geometric Brownian motion",
        },

        /* =====================================================================
           PROJECT 9: ku-lang (Computer Science)
           ===================================================================== */
        "project:ku-lang:hero": {
            engine: "algo",
            params: { type: "compiler-ssa", nodeCardW: 240, flowSpeed: 1.1, showPhiNodes: true },
            caption: "Static Single Assignment (SSA) control-flow graph · basic blocks & φ-nodes x₃ = φ(x₁[bb₁], x₂[bb₂])",
        },
        "project:ku-lang:overview": {
            engine: "algo",
            params: { type: "compiler-ssa", nodeCardW: 220, flowSpeed: 0.75, stage: "ast-hierarchy" },
            caption: "Abstract Syntax Tree (AST) construction & recursive descent evaluation from LALR(1) grammar",
        },
        "project:ku-lang:arch": {
            engine: "graph",
            params: { type: "dag-pipeline", tiers: [2, 3, 4, 3, 2], pulseSpeed: 0.62 },
            caption: "Compiler subsystem dataflow: Lexer (DFA) → Parser (LALR1) → AST → Type Checker → LLVM IR",
        },
        "project:ku-lang:math": {
            engine: "algo",
            params: { type: "compiler-ssa", nodeCardW: 255, flowSpeed: 0.9, dataflowLattice: true },
            caption: "Iterative dataflow fixed point IN[B] = gen[B] ∪ (OUT[B] ∖ kill[B]) · monotone lattice convergence",
        },
        "project:ku-lang:nav": {
            engine: "algo",
            params: { type: "ttl-wbus", clkSpeed: 2.1, busWidth: 8, targetArch: true },
            caption: "Sibling deep-dive connector · 8-bit breadboard computer architecture & TTL register transfers",
        },

        /* =====================================================================
           PROJECT 10: 8bit-computer (Computer Science)
           ===================================================================== */
        "project:8bit-computer:hero": {
            engine: "algo",
            params: { type: "ttl-wbus", clkSpeed: 2.8, busWidth: 8, activeAlu: true },
            caption: "8-bit shared common data bus · 74LS TTL register transfer, ALU execution & microcode sequencing",
        },
        "project:8bit-computer:overview": {
            engine: "algo",
            params: { type: "ttl-wbus", clkSpeed: 1.6, busWidth: 8, rippleAdderView: true },
            caption: "8-bit ripple-carry adder ALU · carry propagation delay t_add = t_sum + (n−1) t_carry · XOR two's complement",
        },
        "project:8bit-computer:arch": {
            engine: "algo",
            params: { type: "ttl-wbus", clkSpeed: 3.2, busWidth: 8, sequencerFocus: true },
            caption: "Microcode sequencer ring counter · 16 active-low control lines gating registers onto the 8-bit bus",
        },
        "project:8bit-computer:math": {
            engine: "algo",
            params: { type: "ttl-wbus", clkSpeed: 2.2, busWidth: 8, timingDiagram: true },
            caption: "TTL propagation timing diagram · clock frequency limits f_max ≤ 1/(t_cq + t_prop + t_su)",
        },
        "project:8bit-computer:nav": {
            engine: "algo",
            params: { type: "compiler-ssa", nodeCardW: 235, flowSpeed: 0.85, codegenTarget: true },
            caption: "Sibling deep-dive connector · compiler code generation & LLVM IR mapping to machine opcodes",
        },

        /* =====================================================================
           PAPERS INDEX (papers.html)
           ===================================================================== */
        "papers-index:hero": {
            engine: "surface",
            params: { type: "poincare-disc", nodes: 34, radius: 265, showTiling: true },
            caption: "Poincaré hyperbolic disc · ds² = 4|dz|²/(1 − |z|²)² · conformal Möbius citation geodesics",
        },
        "papers-index:contact": {
            engine: "diffusion",
            params: { grid: 210, numParticles: 42, dt: 0.0032, dCoeff: 0.24, tilt: 0.15, contactPill: true },
            caption: "Non-equilibrium Langevin diffusion · Fokker–Planck collaboration flow · ∂p/∂t = ∇·(∇V p + D∇p)",
        },

        /* =====================================================================
           PAPER 1: langevin-loss-landscapes (Data Science)
           ===================================================================== */
        "paper:langevin-loss-landscapes:hero": {
            engine: "diffusion",
            params: { grid: 240, numParticles: 55, dt: 0.0035, dCoeff: 0.32, tilt: 0.05, doubleWellLoss: true },
            caption: "Non-equilibrium Fokker–Planck Langevin diffusion · Kramers barrier escape across double-well loss landscape",
        },
        "paper:langevin-loss-landscapes:theory": {
            engine: "diffusion",
            params: { grid: 260, numParticles: 60, dt: 0.0022, dCoeff: 0.18, tilt: -0.12, showLossPot: true },
            caption: "Continuity equation ∂p/∂t = ∇·(∇L p + D∇p) · stationary Gibbs distribution p_∞ ∝ exp(−L(θ)/D)",
        },
        "paper:langevin-loss-landscapes:cite": {
            engine: "surface",
            params: { type: "poincare-disc", nodes: 22, radius: 210, citationRing: true },
            caption: "Hyperbolic citation manifold · Poincaré disc conformal geodesic embedding of referencing literature",
        },

        /* =====================================================================
           PAPER 2: hft-stat-arb-microstructure (Quantitative Finance)
           ===================================================================== */
        "paper:hft-stat-arb-microstructure:hero": {
            engine: "paths",
            params: { process: "ou-spread", samples: 230, sigmaSpread: 0.52, frictionCost: 0.02, showInventoryBands: true },
            caption: "HFT optimal control inventory q_t & Ornstein–Uhlenbeck spread with quadratic execution penalty γ q²",
        },
        "paper:hft-stat-arb-microstructure:theory": {
            engine: "paths",
            params: { process: "ou-spread", samples: 210, sigmaSpread: 0.34, hjbFrontier: true },
            caption: "Hamilton–Jacobi–Bellman (HJB) quasi-variational inequality · optimal buy/sell execution corridors",
        },
        "paper:hft-stat-arb-microstructure:cite": {
            engine: "surface",
            params: { type: "poincare-disc", nodes: 20, radius: 205, quantCitation: true },
            caption: "Academic citation graph · hyperbolic Poincaré disc embedding of microstructure literature",
        },

        /* =====================================================================
           PAPER 3: symplectic-energy-bounds-nbody (Physics)
           ===================================================================== */
        "paper:symplectic-energy-bounds-nbody:hero": {
            engine: "nbody",
            params: { mode: "central-heavy", n: 105, dt: 0.013, soft: 11, showShadowEnergy: true },
            caption: "Symplectic KDK long-term gravitational integration · shadow Hamiltonian H̃ = H + O(Δt²) energy boundedness",
        },
        "paper:symplectic-energy-bounds-nbody:theory": {
            engine: "orbit",
            params: { system: "duffing", alpha: 1.15, beta: 0.85, delta: 0.12, dt: 0.012, scale: 88, symplecticPlane: true },
            caption: "Phase-space 2-form conservation dω = 0 · Campbell–Baker–Hausdorff Poisson bracket expansion",
        },
        "paper:symplectic-energy-bounds-nbody:cite": {
            engine: "surface",
            params: { type: "poincare-disc", nodes: 24, radius: 215, physicsCitation: true },
            caption: "Dynamical systems citation network · conformal hyperbolic disc geodesic connections",
        },

        /* =====================================================================
           PAPER 4: verified-ssa-compiler-passes (Computer Science)
           ===================================================================== */
        "paper:verified-ssa-compiler-passes:hero": {
            engine: "algo",
            params: { type: "compiler-ssa", nodeCardW: 244, flowSpeed: 1.05, typePreservation: true },
            caption: "Formally verified SSA dominance optimisation · subject reduction & type preservation Γ ⊢ e : τ",
        },
        "paper:verified-ssa-compiler-passes:theory": {
            engine: "algo",
            params: { type: "compiler-ssa", nodeCardW: 232, flowSpeed: 0.82, dominanceFrontier: true },
            caption: "Dominance frontier criterion DF(B) · minimal φ-node placement & bisimulation equivalence",
        },
        "paper:verified-ssa-compiler-passes:cite": {
            engine: "surface",
            params: { type: "poincare-disc", nodes: 21, radius: 220, csCitation: true },
            caption: "Programming languages citation topology · Poincaré disc hyperbolic metric ds² = 4|dz|²/(1−|z|²)²",
        },

        /* =====================================================================
           PAPER 5: riemannian-immersion-gauss-bonnet (Mathematics)
           ===================================================================== */
        "paper:riemannian-immersion-gauss-bonnet:hero": {
            engine: "surface",
            params: { type: "gauss-bonnet-figure8", uSteps: 130, vSteps: 26, scale: 1.05, holonomyLoop: true },
            caption: "Gauss–Bonnet theorem on non-orientable 2-manifolds · ∬_M K dA + ∮_∂M k_g ds = 2π χ(M) = 0",
        },
        "paper:riemannian-immersion-gauss-bonnet:theory": {
            engine: "surface",
            params: { type: "mobius-transport", r: 2.15, width: 0.90, needles: 38, holonomyPhase: 0.42 },
            caption: "Parallel transport & holonomy group · normal vector sign inversion n(2π, v) = −n(0, −v)",
        },
        "paper:riemannian-immersion-gauss-bonnet:cite": {
            engine: "surface",
            params: { type: "poincare-disc", nodes: 25, radius: 225, mathCitation: true },
            caption: "Differential geometry citation geodesics · Poincaré disk Klein model conformal projection",
        },

        /* =====================================================================
           ACADEMIC COURSEWORK & CURRICULA (courses.html)
           ===================================================================== */
        "courses-index:hero": {
            engine: "graph",
            params: { type: "dag-pipeline", tiers: [4, 6, 5, 4], pulseSpeed: 0.58, academicDAG: true },
            caption: "Curriculum Directed Acyclic Graph (DAG) · topological sort · prerequisite signal conduction",
        },
        "track:iitm-datascience": {
            engine: "descent",
            params: { landscape: "lasso-ridge-contours", points: 28, lambda: 0.48, iitmTrack: true },
            caption: "IIT Madras Data Science curriculum · SVD matrix decomposition & regularised learning objectives",
        },
        "track:physics-curriculum": {
            engine: "wave",
            params: { grid: 256, k0: 56, sigma: 0.038, barrierW: 0.024, barrierH: 0.62, vbmTrack: true },
            caption: "Vidya Bharati Mahavidyalaya Physics curriculum · quantum wave mechanics & Lagrangian dynamics",
        },
        "track:advanced-quant-systems": {
            engine: "paths",
            params: { process: "gbm", paths: 70, steps: 220, mu: 0.055, sigma: 0.30, quantSystemsTrack: true },
            caption: "Advanced Quantitative Systems curriculum · Itô stochastic calculus & high-frequency microstructure",
        },
        "courses-index:contact": {
            engine: "graph",
            params: { type: "dag-pipeline", tiers: [3, 4, 3], pulseSpeed: 0.45, contactGraph: true },
            caption: "Academic credentials & transcript verification · institutional syllabi review pipeline",
        }
    };

    return { SLIDE_SIMS };
}));
