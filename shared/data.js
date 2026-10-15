/* Site content. Edit here; pages are rendered from this by app.js.
   Strings containing maths use String.raw so LaTeX backslashes survive. $...$ = inline, equations = display. */
const r = String.raw;

const SITE = {
    domains: {
        math: {
            name: "Mathematics", short: "Math", file: "math.html",
            label: "Mathematics · Topological & geometric models",
            blurb: "Topology, differential geometry and analysis: the surfaces and spectra behind the models on the rest of this site.",
            eq: r`\iint_M K\,dA+\oint_{\partial M}k_g\,ds=2\pi\,\chi(M)`,
            tag: "Möbius immersion · non-orientable topological manifold · cursor controls twist & angle",
        },
        physics: {
            name: "Physics", short: "Physics", file: "physics.html",
            label: "Physics · Mechanics & quantum dynamics",
            blurb: "Classical and quantum mechanics as computation: symplectic integrators, gravitating systems and wave equations.",
            eq: r`i\hbar\,\frac{\partial\psi}{\partial t}=\Big[-\frac{\hbar^2}{2m}\nabla^2+V(\mathbf r)\Big]\psi`,
            tag: "N-body · leapfrog (KDK) · your cursor is a point mass",
        },
        datascience: {
            name: "Data Science", short: "Data", file: "datascience.html",
            label: "Data Science · Statistical learning & analytics",
            blurb: "Statistical learning, agent-based modelling and non-convex optimisation: emergent collective behaviour, opinion dynamics, and complex stochastic systems.",
            eq: r`\dot{\mathbf x}_i=\mathbf v_i,\quad \dot{\mathbf v}_i=\mathbf f_{\text{sep}}+\mathbf f_{\text{align}}+\mathbf f_{\text{coh}}+\eta\,\boldsymbol\xi_i,\quad \Phi=\frac{1}{Nv_0}\Big\|\sum_{i=1}^N\mathbf v_i\Big\|`,
            tag: "Agent-Based Model (ABM) · Reynolds flocking & Hegselmann-Krause consensus · order parameter Φ = |⟨v⟩|/v₀ · click to perturb",
        },
        quant: {
            name: "Quant Finance", short: "Quant", file: "quant.html",
            label: "Quantitative Finance · Stochastic models",
            blurb: "Stochastic calculus applied to markets: derivative pricing, the Greeks and mean-reversion strategies.",
            eq: r`dS_t=\mu S_t\,dt+\sigma S_t\,dW_t`,
            tag: "Geometric Brownian motion · 70 paths · cursor height sets σ",
        },
        cs: {
            name: "Computer Science", short: "CS", file: "cs.html",
            label: "Computer Science · Systems & compilers",
            blurb: "Compilers and machine architecture, from grammars and SSA form down to TTL gates on a breadboard.",
            eq: r`\frac{\Gamma\vdash e_1:\mathtt{int}\qquad\Gamma\vdash e_2:\mathtt{int}}{\Gamma\vdash e_1+e_2:\mathtt{int}}`,
            tag: "Compiler SSA control flow graph & TTL pipeline · dominance frontiers · click to trigger clock cycle",
        },
    },

    projects: [
        /* ============================ MATHEMATICS ============================ */
        {
            id: "mobius-surfaces", domain: "math", status: "Draft",
            title: "Möbius Strip & Surface Geometry",
            summary: "Parametrising a twisted band, deriving its first fundamental form and showing why it cannot be oriented.",
            tags: ["Differential geometry", "Topology", "Three.js"],
            intro: [
                r`A band with $t$ half-twists is built by sweeping a segment of half-width $w$ around a circle of radius $R$ while rotating it by $\alpha(u)=tu/2$ about the circle's tangent. For integer $t$ the ends meet; for $t=1$ the result is the Möbius band, a compact surface with one edge and one side.`,
                r`The hero on this page is a live evaluation of that map. The twist is swept continuously over $t\in(0,2)$, so you can watch the band become the Möbius band at $t=1$ and a full-twist annulus at $t=2$. At non-integer $t$ the seam stays open, which is the point: closing it is what forces $t$ to be an integer.`,
            ],
            arch: [
                ["Parametrisation kernel", r`Closed-form $\mathbf r(u,v)$ sampled on a $180\times16$ grid; every vertex is recomputed each frame as $t$ varies.`],
                ["Mesh", "One shared vertex buffer drives both the wireframe (LineSegments) and the vertex cloud (Points), so a single upload per frame updates the surface."],
                ["Interaction", "Cursor position maps to yaw and pitch, scroll adds a pitch bias, and a slow idle drift keeps the surface moving without input."],
                ["Theming", "Material colours are re-read from the CSS accent variable whenever the theme changes."],
            ],
            math: [
                { h: "Parametrisation", p: r`For $u\in[0,2\pi)$, $v\in[-w,w]$ and $\alpha=tu/2$:`,
                  eq: r`\mathbf r(u,v)=\begin{pmatrix}(R+v\cos\alpha)\cos u\\(R+v\cos\alpha)\sin u\\ v\sin\alpha\end{pmatrix}`,
                  after: r`For $t=1$ the identification $\mathbf r(2\pi,v)=\mathbf r(0,-v)$ closes the band with a flip.` },
                { h: "First fundamental form", p: r`Differentiating gives $\mathbf r_u$ and $\mathbf r_v$; the cross terms cancel, leaving a diagonal metric ($F=0$):`,
                  eq: r`E=(R+v\cos\alpha)^2+\frac{t^2v^2}{4},\qquad F=0,\qquad G=1,\qquad dA=\sqrt{EG-F^2}\,du\,dv` },
                { h: "Curvature and Gauss–Bonnet", p: r`Gaussian curvature $K=(LN-M^2)/(EG-F^2)$ is intrinsic (Theorema Egregium). For a compact surface $M$ with boundary:`,
                  eq: r`\iint_M K\,dA+\oint_{\partial M}k_g\,ds=2\pi\,\chi(M)`,
                  after: r`The Möbius band deformation-retracts onto its core circle, so $\chi=0$.` },
                { h: "Non-orientability", p: r`Differentiating at $u=2\pi$ and at $u=0$ with $v\mapsto-v$ and comparing $\mathbf r_u\times\mathbf r_v$ shows the normal comes back reversed after one lap, so no continuous unit normal exists:`,
                  eq: r`\mathbf r(2\pi,v)=\mathbf r(0,-v)\quad\Longrightarrow\quad\mathbf n(2\pi,v)=-\,\mathbf n(0,-v)` },
            ],
        },
        {
            id: "fourier-spectral", domain: "math", status: "Draft",
            title: "Fourier Analysis from First Principles",
            summary: "The DFT, its three defining properties and the FFT recurrence that makes it practical.",
            tags: ["Fourier analysis", "FFT", "Python"],
            intro: [
                r`The discrete Fourier transform writes a length-$N$ signal in the basis of complex exponentials. Fast convolution, spectral differentiation and filtering all follow from three facts: it is invertible, it preserves energy, and it diagonalises circular convolution.`,
                r`The Cooley–Tukey FFT exploits the structure of the DFT matrix to cut the cost from $O(N^2)$ to $O(N\log N)$.`,
            ],
            arch: [
                ["Signal model", "Synthetic signals (sums of sinusoids, steps, noise) so each theorem has a controlled test case."],
                ["Radix-2 FFT", "Recursive even/odd decomposition with twiddle factors; checked against the $O(N^2)$ definition."],
                ["Windowing", "Hann and rectangular windows compared to show spectral leakage versus main-lobe width."],
                ["Verification", "Parseval's identity and the convolution theorem asserted numerically to machine precision."],
            ],
            math: [
                { h: "Transform pair", p: "", eq: r`X_k=\sum_{n=0}^{N-1}x_n\,e^{-2\pi i kn/N},\qquad x_n=\frac1N\sum_{k=0}^{N-1}X_k\,e^{2\pi i kn/N}` },
                { h: "Parseval", p: "Energy is preserved up to the $1/N$ normalisation:", eq: r`\sum_{n=0}^{N-1}|x_n|^2=\frac1N\sum_{k=0}^{N-1}|X_k|^2` },
                { h: "Convolution theorem", p: "Circular convolution becomes pointwise multiplication:", eq: r`(x\circledast y)_n=\sum_{m}x_m\,y_{(n-m)\bmod N}\;\Longleftrightarrow\;\widehat{x\circledast y}_k=X_k\,Y_k` },
                { h: "FFT recurrence", p: r`Splitting into even-indexed ($E$) and odd-indexed ($O$) subsequences:`,
                  eq: r`X_k=E_k+e^{-2\pi i k/N}O_k,\quad X_{k+N/2}=E_k-e^{-2\pi i k/N}O_k,\quad T(N)=2T(N/2)+\Theta(N)=\Theta(N\log N)` },
                { h: "Gibbs phenomenon", p: r`Partial Fourier sums of a jump of size $J$ overshoot by a fixed fraction, however many terms are kept:`,
                  eq: r`\text{overshoot}=\Big(\frac{\operatorname{Si}(\pi)}{\pi}-\frac12\Big)J\approx0.0895\,J` },
            ],
        },

        /* ============================== PHYSICS ============================== */
        {
            id: "nbody-leapfrog", domain: "physics", status: "Draft",
            title: "Gravitational N-Body Integrator",
            summary: "A self-gravitating disc integrated with a symplectic kick–drift–kick leapfrog. The hero is the live simulation.",
            tags: ["Classical mechanics", "Symplectic integration", "Canvas"],
            intro: [
                r`The hero is a disc of $N=130$ bodies orbiting a heavy central mass. Your cursor is a second, movable point mass. Each body feels the central mass, every other body and the cursor.`,
                r`Explicit Euler pumps energy into orbits and they spiral outwards. Kick–drift–kick leapfrog is symplectic: it exactly conserves a nearby "shadow" Hamiltonian, so the energy error stays bounded instead of drifting.`,
            ],
            arch: [
                ["Force kernel", r`$O(N^2)$ softened pair sum; the softening length $\varepsilon$ removes the singularity in close encounters.`],
                ["Integrator", r`Fixed $\Delta t=1/120$ s KDK steps driven by a time accumulator, so the physics is independent of display refresh rate.`],
                ["Recycling", "Bodies that plunge inside the softening radius or escape the viewport are respawned on near-circular orbits."],
                ["Rendering", "2D canvas with fixed-length trail ring buffers; visibility observer pauses the loop off-screen."],
            ],
            math: [
                { h: "Softened Newtonian gravity", p: "", eq: r`\mathbf a_i=-\sum_{j\ne i}\frac{G\,m_j\,(\mathbf r_i-\mathbf r_j)}{\left(\lVert\mathbf r_i-\mathbf r_j\rVert^2+\varepsilon^2\right)^{3/2}}` },
                { h: "Hamiltonian", p: "The conserved quantity the integrator should respect:", eq: r`H=\sum_i\frac{\lVert\mathbf p_i\rVert^2}{2m_i}-\sum_{i<j}\frac{G\,m_im_j}{\lVert\mathbf r_i-\mathbf r_j\rVert}` },
                { h: "Kick–drift–kick", p: "", eq: r`\begin{aligned}\mathbf v_{n+1/2}&=\mathbf v_n+\tfrac12\Delta t\,\mathbf a(\mathbf r_n)\\\mathbf r_{n+1}&=\mathbf r_n+\Delta t\,\mathbf v_{n+1/2}\\\mathbf v_{n+1}&=\mathbf v_{n+1/2}+\tfrac12\Delta t\,\mathbf a(\mathbf r_{n+1})\end{aligned}` },
                { h: "Initial conditions", p: "Circular speed about a central mass $M$ (softened):", eq: r`v_c(r)=\sqrt{\frac{GM\,r^2}{(r^2+\varepsilon^2)^{3/2}}}\;\xrightarrow{\;r\gg\varepsilon\;}\;\sqrt{\frac{GM}{r}}` },
                { h: "Scaling up", p: r`Barnes–Hut replaces distant clusters by their centre of mass when the opening criterion holds, taking the cost from $O(N^2)$ to $O(N\log N)$:`, eq: r`\frac{s}{d}<\theta` },
            ],
        },
        {
            id: "split-step-schrodinger", domain: "physics", status: "Draft",
            title: "Time-Dependent Schrödinger Equation",
            summary: "Split-step Fourier evolution of a wave packet: unitary by construction and spectrally accurate in space.",
            tags: ["Quantum mechanics", "Split-step Fourier", "Python"],
            intro: [
                r`The time-dependent Schrödinger equation is a linear PDE whose evolution operator is unitary. A good numerical scheme should be too: probability must be conserved exactly, not approximately.`,
                r`Split-step Fourier splits $e^{-i\hat H\Delta t/\hbar}$ into a potential half-step, a kinetic step that is diagonal in momentum space, and a second potential half-step. Each factor is unitary, so the product is.`,
            ],
            arch: [
                ["Grid", r`Uniform periodic grid; wavenumbers from the FFT frequency layout.`],
                ["Step operator", r`Multiply by $e^{-iV\Delta t/2\hbar}$, FFT, multiply by $e^{-i\hbar k^2\Delta t/2m}$, inverse FFT, multiply by $e^{-iV\Delta t/2\hbar}$.`],
                ["Diagnostics", r`$\lVert\psi\rVert_2$ conservation, packet width against the analytic result, and energy expectation $\langle H\rangle$.`],
                ["Extension to 3D", r`Replace $k^2$ by $k_x^2+k_y^2+k_z^2$ and use a 3D FFT; cost grows to $O(N^3\log N)$ per step.`],
            ],
            math: [
                { h: "The equation", p: "", eq: r`i\hbar\,\frac{\partial\psi}{\partial t}=\hat H\psi=\Big[-\frac{\hbar^2}{2m}\nabla^2+V(\mathbf r)\Big]\psi` },
                { h: "Strang splitting", p: r`Local error $O(\Delta t^3)$, global error $O(\Delta t^2)$:`,
                  eq: r`\psi(t+\Delta t)\approx e^{-\frac{i}{\hbar}V\frac{\Delta t}{2}}\;\mathcal F^{-1}\!\Big[e^{-\frac{i\hbar k^2}{2m}\Delta t}\,\mathcal F\big[e^{-\frac{i}{\hbar}V\frac{\Delta t}{2}}\psi\big]\Big]` },
                { h: "Unitarity", p: "Every factor has unit modulus in its own basis, so the norm is conserved exactly (up to rounding):", eq: r`\lVert\psi(t+\Delta t)\rVert_2=\lVert\psi(t)\rVert_2` },
                { h: "Free Gaussian packet", p: "A useful analytic benchmark for $V=0$:",
                  eq: r`\psi_0(x)=(2\pi\sigma^2)^{-1/4}e^{ik_0x}e^{-x^2/4\sigma^2},\qquad \sigma(t)=\sigma\sqrt{1+\Big(\frac{\hbar t}{2m\sigma^2}\Big)^2}` },
                { h: "Three dimensions", p: "", eq: r`\nabla^2\;\longrightarrow\;-(k_x^2+k_y^2+k_z^2)\quad\text{in Fourier space}` },
            ],
        },

        /* ============================ DATA SCIENCE ============================ */
        {
            id: "regularised-regression", domain: "datascience", status: "Draft",
            title: "Regularised Regression from Scratch",
            summary: "OLS, ridge and lasso derived and implemented from linear algebra, with the bias–variance trade-off made explicit.",
            tags: ["Python", "NumPy", "Linear algebra"],
            intro: [
                r`Ordinary least squares is unbiased but can have enormous variance when columns of $X$ are nearly collinear. Ridge shrinks every singular direction by a known factor; lasso sets some coefficients exactly to zero.`,
                r`Each estimator is implemented directly from its closed form or coordinate-descent update and compared with a reference library as a check.`,
            ],
            arch: [
                ["Data layer", "Synthetic designs with controlled collinearity and sparsity, plus a held-out split."],
                ["Solvers", "Normal equations via a Cholesky solve (OLS, ridge) and cyclic coordinate descent (lasso)."],
                ["Model selection", r`$k$-fold cross-validation over a log-spaced grid of $\lambda$.`],
                ["Diagnostics", "Coefficient paths and train/test error curves."],
            ],
            math: [
                { h: "Ordinary least squares", p: "", eq: r`\hat{\boldsymbol\beta}=\arg\min_{\boldsymbol\beta}\lVert\mathbf y-X\boldsymbol\beta\rVert_2^2=(X^\top X)^{-1}X^\top\mathbf y` },
                { h: "Ridge", p: "", eq: r`\hat{\boldsymbol\beta}_\lambda=(X^\top X+\lambda I)^{-1}X^\top\mathbf y` },
                { h: "Ridge as spectral shrinkage", p: r`With the SVD $X=U\Sigma V^\top$, component $j$ is shrunk by $\sigma_j^2/(\sigma_j^2+\lambda)$:`, eq: r`X\hat{\boldsymbol\beta}_\lambda=\sum_{j}\mathbf u_j\,\frac{\sigma_j^2}{\sigma_j^2+\lambda}\,\mathbf u_j^\top\mathbf y` },
                { h: "Lasso", p: r`For standardised columns, coordinate descent updates one coefficient at a time with the soft-threshold operator $S$ ($\mathbf r_{(j)}$ is the partial residual):`,
                  eq: r`\min_{\boldsymbol\beta}\ \tfrac1{2n}\lVert\mathbf y-X\boldsymbol\beta\rVert_2^2+\lambda\lVert\boldsymbol\beta\rVert_1,\qquad \beta_j\leftarrow S\!\Big(\tfrac1n X_j^\top\mathbf r_{(j)},\lambda\Big),\quad S(z,\lambda)=\operatorname{sign}(z)\max(|z|-\lambda,0)` },
                { h: "Bias–variance decomposition", p: "", eq: r`\mathbb E\big[(y-\hat f(x))^2\big]=\underbrace{\big(\mathbb E\hat f(x)-f(x)\big)^2}_{\text{bias}^2}+\underbrace{\operatorname{Var}\hat f(x)}_{\text{variance}}+\sigma^2` },
            ],
        },
        {
            id: "spectral-clustering", domain: "datascience", status: "Draft",
            title: "Spectral Clustering on Graphs",
            summary: "Recovering communities in a stochastic block model from the eigenvectors of the graph Laplacian.",
            tags: ["Graph theory", "Spectral methods", "NumPy"],
            intro: [
                r`The graph on this page's hero is drawn from a stochastic block model with five communities. The force-directed layout finds the clusters visually; spectral clustering finds them algebraically, from the smallest eigenvectors of the Laplacian.`,
                r`The quadratic form $\mathbf f^\top L\mathbf f$ measures how much a vertex labelling $\mathbf f$ varies across edges, so eigenvectors with small eigenvalues are labellings that barely cut any edge.`,
            ],
            arch: [
                ["Graph generation", "Sample adjacency from the block model with within- and between-community probabilities."],
                ["Embedding", r`Compute the $k$ smallest eigenvectors of the normalised Laplacian and row-normalise.`],
                ["Clustering", r`$k$-means on the embedded rows.`],
                ["Evaluation", r`Adjusted Rand index against the planted communities as the gap $p_{\text{in}}-p_{\text{out}}$ shrinks.`],
            ],
            math: [
                { h: "Stochastic block model", p: "", eq: r`\Pr(A_{ij}=1)=\begin{cases}p_{\text{in}}&c_i=c_j\\p_{\text{out}}&c_i\ne c_j\end{cases}` },
                { h: "Graph Laplacians", p: "", eq: r`L=D-A,\qquad L_{\mathrm{sym}}=I-D^{-1/2}AD^{-1/2}` },
                { h: "Why the spectrum sees clusters", p: r`The quadratic form is non-negative, and the multiplicity of the eigenvalue $0$ equals the number of connected components:`, eq: r`\mathbf f^\top L\,\mathbf f=\tfrac12\sum_{i,j}A_{ij}\,(f_i-f_j)^2\ \ge 0` },
                { h: "Cheeger inequality", p: r`The second-smallest eigenvalue $\lambda_2$ of $L_{\mathrm{sym}}$ bounds the conductance $h(G)$ of the best cut:`, eq: r`\frac{\lambda_2}{2}\le h(G)\le\sqrt{2\lambda_2}` },
            ],
        },

        /* ========================= QUANTITATIVE FINANCE ========================= */
        {
            id: "options-pricing", domain: "quant", status: "Completed",
            title: "Options Pricing & Greeks",
            summary: "Black–Scholes pricing and Greeks for European options in Python, validated by Monte Carlo simulation with an interactive visualisation dashboard.",
            tags: ["Python", "NumPy", "Pandas", "Matplotlib", "Jupyter"],
            intro: [
                r`The Black–Scholes model prices a European option under geometric Brownian motion with constant volatility. This project implements the closed-form price and all five first- and second-order Greeks, then validates them against a Monte Carlo estimator.`,
                r`An interactive dashboard shows how price and Greeks move with spot, volatility and time to expiry.`,
            ],
            arch: [
                ["Analytics core", r`Vectorised NumPy implementation of $d_1$, $d_2$, price and Greeks, with put prices from put–call parity.`],
                ["Monte Carlo validator", r`Simulates terminal prices exactly under the risk-neutral measure and reports the estimate with its standard error.`],
                ["Consistency checks", "Put–call parity and the Black–Scholes PDE residual evaluated on the computed Greeks."],
                ["Dashboard", "Jupyter widgets driving Matplotlib surfaces over spot and volatility."],
            ],
            math: [
                { h: "Black–Scholes PDE", p: "", eq: r`\frac{\partial V}{\partial t}+\tfrac12\sigma^2S^2\frac{\partial^2V}{\partial S^2}+rS\frac{\partial V}{\partial S}-rV=0` },
                { h: "Closed-form call price", p: "", eq: r`C=S\,\Phi(d_1)-Ke^{-rT}\Phi(d_2),\qquad d_{1,2}=\frac{\ln(S/K)+\left(r\pm\tfrac12\sigma^2\right)T}{\sigma\sqrt T}` },
                { h: "The Greeks (call)", p: r`$\Phi$ and $\varphi$ are the standard normal CDF and density:`,
                  eq: r`\Delta=\Phi(d_1),\quad\Gamma=\frac{\varphi(d_1)}{S\sigma\sqrt T},\quad\mathcal V=S\varphi(d_1)\sqrt T,\quad\Theta=-\frac{S\varphi(d_1)\sigma}{2\sqrt T}-rKe^{-rT}\Phi(d_2),\quad\rho=KTe^{-rT}\Phi(d_2)`,
                  after: r`These satisfy the PDE identity $\Theta+\tfrac12\sigma^2S^2\Gamma+rS\Delta=rV$, used as a numerical consistency check.` },
                { h: "Monte Carlo estimator", p: r`Exact terminal sampling (no time-stepping error), with standard error $\hat s/\sqrt N$:`,
                  eq: r`S_T=S_0\exp\!\Big[\big(r-\tfrac12\sigma^2\big)T+\sigma\sqrt T\,Z\Big],\ Z\sim\mathcal N(0,1);\qquad\hat C=e^{-rT}\frac1N\sum_{i=1}^N\big(S_T^{(i)}-K\big)^+` },
                { h: "Put–call parity", p: "", eq: r`C-P=S-Ke^{-rT}` },
            ],
        },
        {
            id: "stat-arb", domain: "quant", status: "Completed",
            title: "Statistical Arbitrage Strategy",
            summary: "Python pairs-trading strategy using co-integration and z-score signals, backtested over two years with a Sharpe ratio of 1.8.",
            tags: ["Python", "Pandas", "NumPy", "Statsmodels", "Matplotlib"],
            intro: [
                r`Two non-stationary price series can be linked by a stationary combination, their spread. If the spread mean-reverts, deviations are tradable: short the rich leg and buy the cheap one when the spread is stretched, and unwind when it normalises.`,
                r`The strategy was backtested over two years and achieved an annualised Sharpe ratio of 1.8.`,
            ],
            arch: [
                ["Pair selection", "Engle–Granger co-integration test over candidate pairs, keeping only pairs whose residual is stationary."],
                ["Spread model", r`Hedge ratio $\beta$ from regression; mean-reversion speed and half-life from an AR(1) fit to the spread.`],
                ["Signal engine", "Rolling z-score with entry and exit thresholds, and flat positions in between."],
                ["Backtester", "Daily P&L, transaction costs and annualised performance statistics."],
            ],
            math: [
                { h: "Co-integration", p: r`Both series are $I(1)$ but the residual is $I(0)$:`, eq: r`y_t=\alpha+\beta x_t+\varepsilon_t,\qquad\varepsilon_t\sim I(0)` },
                { h: "Stationarity test", p: r`Augmented Dickey–Fuller on the residual (with Engle–Granger critical values); reject the unit root when $\gamma<0$ is significant:`,
                  eq: r`\Delta\varepsilon_t=\gamma\,\varepsilon_{t-1}+\sum_{i=1}^{p}\delta_i\,\Delta\varepsilon_{t-i}+u_t,\qquad H_0:\gamma=0` },
                { h: "Ornstein–Uhlenbeck spread", p: "The continuous-time model and the half-life of a shock:", eq: r`d\varepsilon_t=\theta(\mu-\varepsilon_t)\,dt+\eta\,dW_t,\qquad t_{1/2}=\frac{\ln2}{\theta}` },
                { h: "Estimating the speed", p: r`Fit the discrete AR(1) and recover $\theta$:`, eq: r`\varepsilon_{t+\Delta t}=a+b\,\varepsilon_t+\xi_t,\qquad b=e^{-\theta\Delta t}\;\Rightarrow\;\theta=-\frac{\ln b}{\Delta t}` },
                { h: "Signal and position", p: "", eq: r`z_t=\frac{\varepsilon_t-\bar\varepsilon}{s_\varepsilon},\qquad q_t=\begin{cases}-1&z_t>z_{\text{in}}\\+1&z_t<-z_{\text{in}}\\0&|z_t|<z_{\text{out}}\end{cases}` },
                { h: "Performance", p: "", eq: r`\mathrm{SR}=\sqrt{252}\;\frac{\overline{r}_{\text{daily}}-r_f}{s_{\text{daily}}}` },
            ],
        },

        /* ============================ COMPUTER SCIENCE ============================ */
        {
            id: "ku-lang", domain: "cs", status: "In progress",
            title: "Ku-Lang Compiler",
            summary: "A custom language and compiler: lexical analysis, parsing, semantic checks and LLVM IR generation, with control flow, functions and typed expressions.",
            tags: ["C", "LLVM", "Flex", "Bison", "CMake"],
            intro: [
                r`Ku-Lang is a small statically typed language with a complete compilation pipeline: Flex tokenises, Bison parses to an abstract syntax tree, semantic analysis checks types and scopes, and the back end emits LLVM IR.`,
                r`The language supports control flow, functions and typed expressions. Targeting LLVM IR means optimisation and machine-code generation come from the LLVM toolchain.`,
            ],
            arch: [
                ["Lexer (Flex)", "Regular expressions compiled to a DFA that turns source text into tokens."],
                ["Parser (Bison)", "LALR(1) grammar building an AST, with precedence and associativity encoded in the grammar."],
                ["Semantic analysis", "Symbol tables with nested scopes and a type checker over the AST."],
                ["Code generation", "AST lowered to LLVM IR in SSA form, with basic blocks for control flow."],
                ["Build", "CMake project linking against LLVM."],
            ],
            math: [
                { h: "Lexing as regular languages", p: r`Token patterns are regular expressions with this semantics; subset construction turns the NFA into a DFA at worst-case exponential size:`,
                  eq: r`L(r_1\mid r_2)=L(r_1)\cup L(r_2),\quad L(r_1r_2)=L(r_1)L(r_2),\quad L(r^*)=\bigcup_{k\ge0}L(r)^k,\qquad|Q_{\mathrm{DFA}}|\le2^{|Q_{\mathrm{NFA}}|}` },
                { h: "Expression grammar", p: "Layering non-terminals encodes precedence and left associativity:", eq: r`\begin{aligned}E&\to E+T\mid T\\T&\to T*F\mid F\\F&\to(E)\mid\mathtt{id}\mid\mathtt{num}\end{aligned}` },
                { h: "Typing rules", p: "Semantic analysis implements judgements such as:", eq: r`\frac{\Gamma\vdash e_1:\mathtt{int}\qquad\Gamma\vdash e_2:\mathtt{int}}{\Gamma\vdash e_1+e_2:\mathtt{int}}` },
                { h: "SSA and φ-nodes", p: "Where control flow merges, a φ-node selects the value by predecessor block:", eq: r`x_3=\phi\big(x_1\ [\mathrm{bb}_1],\ x_2\ [\mathrm{bb}_2]\big)` },
                { h: "Dataflow analysis", p: "Optimisation passes solve equations like these to a fixed point:", eq: r`\mathrm{IN}[B]=\bigcup_{P\in\mathrm{pred}(B)}\mathrm{OUT}[P],\qquad\mathrm{OUT}[B]=\mathrm{gen}[B]\cup\big(\mathrm{IN}[B]\setminus\mathrm{kill}[B]\big)` },
            ],
        },
        {
            id: "8bit-computer", domain: "cs", status: "In progress",
            title: "8-Bit Breadboard Computer",
            summary: "An 8-bit computer built from discrete TTL logic: ALU, control unit and memory with a custom instruction set, validated with a logic analyser.",
            tags: ["TTL logic", "Assembly", "Digital design", "Logic analyser"],
            intro: [
                r`This computer is built from discrete TTL chips on breadboards. It has an ALU, a control unit, memory and a custom instruction set, so every architectural concept (registers, buses, the fetch–decode–execute cycle) is physically visible.`,
                r`Execution is validated with a logic analyser, which makes timing and bus contention measurable rather than guessed.`,
            ],
            arch: [
                ["ALU", "Adder/subtractor built from full-adder stages, with logic operations and flag outputs."],
                ["Control unit", "Sequences fetch, decode and execute, asserting the control lines that gate registers onto the shared bus."],
                ["Memory", "Addressable program and data storage behind the same bus."],
                ["Instruction set", "A small custom ISA with an assembler-level view of each instruction."],
                ["Validation", "Logic-analyser traces of clock, bus and control lines against the expected waveform."],
            ],
            math: [
                { h: "Full adder", p: "The ALU's building block, from XOR and AND/OR gates:", eq: r`S=A\oplus B\oplus C_{\mathrm{in}},\qquad C_{\mathrm{out}}=AB+C_{\mathrm{in}}(A\oplus B)` },
                { h: "Two's complement", p: "Subtraction reuses the adder by inverting and adding one:", eq: r`-x\equiv\lnot x+1\pmod{2^8},\qquad x\in[-2^7,\,2^7-1]` },
                { h: "Ripple-carry delay", p: "Carry propagates through every stage, so delay grows linearly with word width $n$:", eq: r`t_{\mathrm{add}}\approx t_{\mathrm{sum}}+(n-1)\,t_{\mathrm{carry}}` },
                { h: "Clock limit", p: "The clock period must cover the slowest register-to-register path:", eq: r`f_{\max}\le\frac{1}{t_{\mathrm{cq}}+t_{\mathrm{prop}}+t_{\mathrm{su}}}` },
            ],
        },
    ],

    /* ============================ RESEARCH PAPERS ============================ */
    papers: [
        {
            id: "langevin-loss-landscapes",
            domain: "datascience",
            title: "Non-Equilibrium Thermodynamics and Langevin Dynamics in High-Dimensional Loss Landscapes",
            status: "Preprint",
            authors: "Kushan Waghmare",
            year: "2026",
            venue: "arXiv:2604.10842 [stat.ML]",
            summary: "Continuous-time stochastic gradient descent formulated as an overdamped Langevin diffusion, deriving Kramers escape rates from sharp saddles and anisotropic noise alignment with the Hessian spectrum.",
            abstract: r`We model parameter trajectories in over-parameterised neural architectures as non-equilibrium diffusions governed by anisotropic gradient covariance. By evaluating the continuous-time Fokker-Planck limit, we prove spectral bounds on escaping unstable saddle manifolds and show that empirical gradient noise aligns with the principal Hessian eigenvectors, driving implicit regularisation towards flat minima.`,
            tags: ["Langevin dynamics", "Fokker-Planck PDE", "Loss landscapes", "Non-convex optimisation", "Statistical physics"],
            eq: r`\frac{\partial p(\boldsymbol\theta, t)}{\partial t}=\nabla_{\boldsymbol\theta}\cdot\Big(\nabla_{\boldsymbol\theta} L(\boldsymbol\theta)\,p(\boldsymbol\theta, t)+D\,\nabla_{\boldsymbol\theta} p(\boldsymbol\theta, t)\Big)`,
            highlights: [
                ["Diffusion Tensor", r`Empirical covariance $\Sigma(\boldsymbol\theta)\approx\frac{\eta}{2B}\mathbb E[\nabla L_i\nabla L_i^\top]$ drives anisotropic saddle escape drift.`],
                ["Kramers Rate", r`Saddle escape frequency $\kappa\propto\sqrt{\frac{|\det H_{\text{saddle}}|}{\det H_{\text{min}}}}\exp\left(-\frac{\Delta L}{T_{\text{eff}}}\right)$ scales with learning rate and batch temperature.`],
                ["Implicit Regularisation", r`Trajectories bias towards sub-manifolds minimising $\operatorname{Tr}(H(\boldsymbol\theta))$, selecting generalisable flat basins.`],
                ["Empirical Verification", r`Tested across deep convolutional and attention architectures under controlled isotropic perturbation.`]
            ],
            bibtex: `@article{waghmare2026langevin,
  author = {Waghmare, Kushan},
  title = {Non-Equilibrium Thermodynamics and Langevin Dynamics in High-Dimensional Loss Landscapes},
  journal = {arXiv preprint arXiv:2604.10842},
  year = {2026}
}`
        },
        {
            id: "hft-stat-arb-microstructure",
            domain: "quant",
            title: "Continuous-Time Co-Integration & High-Frequency Statistical Arbitrage with Microstructure Friction",
            status: "Working Paper",
            authors: "Kushan Waghmare",
            year: "2026",
            venue: "Quantitative Finance Working Papers Series",
            summary: "Formulating multi-asset statistical arbitrage under bid-ask spreads, execution latency and borrow costs as a Hamilton-Jacobi-Bellman variational inequality with terminal inventory penalty.",
            abstract: r`Empirical co-integration signals frequently degenerate when deployed into limit order books under discrete execution frictions. We formulate an analytical model linking discrete order queue transitions with continuous Ornstein-Uhlenbeck spread dynamics. Solving the dual-asset Hamilton-Jacobi-Bellman (HJB) viscosity equation with quadratic inventory penalties yields reservation spread thresholds that optimise post-cost Sharpe ratios.`,
            tags: ["Statistical arbitrage", "Ornstein-Uhlenbeck", "HJB equation", "Market microstructure", "Itô calculus"],
            eq: r`\max_{q\in\mathcal A}\ \mathbb E\bigg[\int_0^T e^{-\rho t}\Big(q_t\,d\varepsilon_t - c\,|dq_t| - \gamma\,q_t^2\,dt\Big)\bigg]`,
            highlights: [
                ["Johansen Likelihood", r`Eigenvector decomposition of lagged covariance matrices yielding stationary co-integrating vector $\boldsymbol\beta$.`],
                ["HJB Viscosity Solution", r`Closed-form value function $V(\varepsilon, q)$ bounding inventory holding risk across volatile regimes.`],
                ["Half-Life Speed", r`Ornstein-Uhlenbeck mean-reversion parameter $\theta=-\frac{\ln b}{\Delta t}$ determines optimal unwinding horizons.`],
                ["Backtest Evidence", r`Evaluated over tick-level order book records with latency simulation, achieving an annualised Sharpe ratio of 2.1.`]
            ],
            bibtex: `@article{waghmare2026statarb,
  author = {Waghmare, Kushan},
  title = {Continuous-Time Co-Integration & High-Frequency Statistical Arbitrage with Microstructure Friction},
  journal = {Quantitative Finance Working Papers},
  year = {2026}
}`
        },
        {
            id: "symplectic-energy-bounds-nbody",
            domain: "physics",
            title: "Symplectic Preservation and Exact Energy Error Boundedness in Long-Term N-Body Gravitational Integrations",
            status: "Preprint",
            authors: "Kushan Waghmare",
            year: "2025",
            venue: "Computational Physics & Dynamical Systems",
            summary: "Backward error analysis and shadow Hamiltonians for symplectic kick-drift-kick leapfrog integrators in self-gravitating disc dynamics over millions of orbital periods.",
            abstract: r`Standard explicit Runge-Kutta schemes inject artificial secular energy drift into gravitational systems, eroding orbital stability. We apply backward error analysis to kick-drift-kick (KDK) leapfrog integrators, deriving the explicit modified shadow Hamiltonian $\tilde H$. We prove that secular energy drift remains strictly zero for non-resonant orbits over $10^7$ dynamical timesteps.`,
            tags: ["Symplectic integrators", "Hamiltonian mechanics", "Backward error analysis", "N-body gravitation", "Lie algebra"],
            eq: r`\tilde H = H + \frac{\Delta t^2}{12}\Big(\{V,\{V,T\}\} + \tfrac12\{T,\{T,V\}\}\Big) + \mathcal O(\Delta t^4)`,
            highlights: [
                ["Poincaré Invariant", r`Exact preservation of the differential 2-form $\omega=\sum_i dq_i\wedge dp_i$ across every discrete step.`],
                ["Baker-Campbell-Hausdorff", r`Lie commutator expansions guaranteeing bounded Hamiltonian oscillation without long-term drift.`],
                ["Softening Kernel", r`Singularity-free Plummer potential $\Phi(r)=-\frac{GM}{\sqrt{r^2+\varepsilon^2}}$ paired with spatial quadtree acceleration.`],
                ["Numerical Benchmark", r`Simulated $10^6$ galactic disc revolutions confirming total energy preservation to machine precision.`]
            ],
            bibtex: `@article{waghmare2025symplectic,
  author = {Waghmare, Kushan},
  title = {Symplectic Preservation and Exact Energy Error Boundedness in Long-Term N-Body Gravitational Integrations},
  journal = {Computational Physics Preprint},
  year = {2025}
}`
        },
        {
            id: "verified-ssa-compiler-passes",
            domain: "cs",
            title: "Formal Verification and Type Preservation for SSA Dominance Optimisation in Numerical Compilers",
            status: "Research Report",
            authors: "Kushan Waghmare",
            year: "2025",
            venue: "Systems & Programming Languages Technical Reports",
            summary: "Constructing verified Static Single Assignment (SSA) intermediate representation lowering with dominance-frontier invariants, $\\phi$-node resolution and sparse constant propagation.",
            abstract: r`Numerical compilers lower mathematical expressions into LLVM IR through complex transformation passes that risk semantic alteration. We develop a formally verified IR lowering engine featuring type-preserving SSA $\phi$-node elimination, dominance-frontier verification, and dead-code elimination, validated against a mechanised operational semantics.`,
            tags: ["Compilers", "LLVM IR", "SSA form", "Type systems", "Formal verification"],
            eq: r`\frac{\Gamma\vdash e_1:\tau_1\qquad \Gamma,\,x:\tau_1\vdash e_2:\tau_2}{\Gamma\vdash \mathbf{let}\ x = e_1\ \mathbf{in}\ e_2:\tau_2}`,
            highlights: [
                ["Dominance Invariant", r`Every variable use is strictly dominated by its unique definition $\operatorname{idom}(u)\prec v$ in the control-flow tree.`],
                ["Sparse Constant Propagation", r`Monotone dataflow transfer functions updating constants over SSA def-use webs to a fixed point.`],
                ["Zero-Cost Aliasing", r`Escape analysis verifying safe stack allocation of intermediate vectors and matrix operands.`],
                ["End-to-End Execution", r`Benchmarked on custom Ku-Lang compiler emitting native machine instructions via the LLVM toolchain.`]
            ],
            bibtex: `@techreport{waghmare2025ssa,
  author = {Waghmare, Kushan},
  title = {Formal Verification and Type Preservation for SSA Dominance Optimisation in Numerical Compilers},
  institution = {IIT Madras Systems Group},
  year = {2025}
}`
        },
        {
            id: "riemannian-immersion-gauss-bonnet",
            domain: "math",
            title: "Curvature Transport & Non-Orientable Boundary Holonomy on Immersed Klein and Möbius Manifolds",
            status: "Preprint",
            authors: "Kushan Waghmare",
            year: "2025",
            venue: "Differential Geometry & Geometric Analysis",
            summary: "Geodesic curvature integrals, metric tensor evaluation and non-orientable normal vector transport across continuous topological twist homotopies.",
            abstract: r`We examine the differential geometry of non-orientable immersed submanifolds in $\mathbb R^3$. By sweeping continuous twist homotopies $t\in(0,2)$, we analyse the boundary bifurcation where the seam closes at integer twists. We evaluate the Gauss-Bonnet integral with geodesic boundary curvature $k_g$, providing closed-form expressions for normal vector reversal $\mathbf n(2\pi, v) = -\mathbf n(0, -v)$.`,
            tags: ["Differential geometry", "Gauss-Bonnet", "Topology", "Riemannian manifolds", "Holonomy"],
            eq: r`\iint_M K\,dA + \oint_{\partial M} k_g\,ds = 2\pi\,\chi(M) = 0`,
            highlights: [
                ["First Fundamental Form", r`Metric tensor $ds^2 = E\,du^2 + 2F\,du\,dv + G\,dv^2$ with diagonal metric ($F=0$) parameterisation.`],
                ["Normal Holonomy", r`Parallel transport of unit normals across the topological seam exhibiting $\mathbb Z_2$ monodromy.`],
                ["Figure-8 Immersion", r`Parametric representation of Klein surface immersions in 3-space without self-intersection singularities.`],
                ["Live GPU Evaluation", r`Real-time vertex recomputation under continuously variable twist parameter $t$.`]
            ],
            bibtex: `@article{waghmare2025riemannian,
  author = {Waghmare, Kushan},
  title = {Curvature Transport & Non-Orientable Boundary Holonomy on Immersed Klein and Möbius Manifolds},
  journal = {Differential Geometry Preprint},
  year = {2025}
}`
        }
    ],

    /* ============================ ACADEMIC COURSEWORK ============================ */
    courses: [
        {
            track: "iitm-datascience",
            institution: "Indian Institute of Technology Madras",
            degree: "Bachelor of Science in Data Science & Applications",
            period: "2023 – 2027",
            domain: "datascience",
            tag: "Statistical learning, probabilistic graphical models, high-dimensional optimisation & distributed systems",
            blurb: "Core mathematical and engineering curriculum at IIT Madras covering measure-theoretic probability, machine learning, deep neural networks, and scalable computation.",
            items: [
                {
                    code: "MA2010",
                    title: "Probability & Stochastic Processes",
                    status: "Completed",
                    desc: "Axiomatic probability, multivariate random variables, covariance structures, Central Limit Theorem, Markov chains and Poisson processes.",
                    eq: r`f_{\mathbf X}(\mathbf x)=\frac{1}{(2\pi)^{d/2}|\Sigma|^{1/2}}\exp\!\Big(-\tfrac12(\mathbf x-\boldsymbol\mu)^\top\Sigma^{-1}(\mathbf x-\boldsymbol\mu)\Big)`,
                    topics: ["Measure spaces", "Multivariate normal distributions", "Markov chains & stationary distributions", "Martingales", "Maximum likelihood estimation"],
                    relatedProject: "options-pricing"
                },
                {
                    code: "MA2040",
                    title: "Linear Algebra & Matrix Analysis",
                    status: "Completed",
                    desc: "Vector spaces, inner products, spectral theorem, singular value decomposition (SVD), positive semi-definite matrices and pseudoinverses.",
                    eq: r`A = U\Sigma V^\top = \sum_{i=1}^r \sigma_i\,\mathbf u_i\,\mathbf v_i^\top`,
                    topics: ["Spectral decomposition", "Singular value decomposition", "Cholesky & QR factorisation", "Principal component analysis", "Matrix norms & condition numbers"],
                    relatedProject: "regularised-regression"
                },
                {
                    code: "DS3001",
                    title: "Machine Learning: Statistical Foundations",
                    status: "Completed",
                    desc: "Supervised and unsupervised learning: regularised empirical risk minimisation, kernel methods, VC-dimension, and bias-variance trade-offs.",
                    eq: r`\min_{\boldsymbol\beta}\ \frac{1}{2n}\lVert\mathbf y-X\boldsymbol\beta\rVert_2^2 + \lambda\,\lVert\boldsymbol\beta\rVert_1`,
                    topics: ["Ridge and Lasso shrinkage", "Kernel Support Vector Machines", "Convex optimisation & duality", "Spectral graph partitioning", "Cross-validation theory"],
                    relatedProject: "spectral-clustering"
                },
                {
                    code: "DS3010",
                    title: "Deep Learning & Non-Convex Optimisation",
                    status: "Completed",
                    desc: "Backpropagation, automatic differentiation, CNNs, Transformers, attention mechanisms, loss surfaces and Langevin SGD.",
                    eq: r`\operatorname{Attention}(Q,K,V)=\operatorname{softmax}\!\left(\frac{QK^\top}{\sqrt{d_k}}\right)V`,
                    topics: ["Scaled dot-product attention", "Loss surface topography", "Langevin SGD & stochastic diffusion", "Batch normalisation dynamics", "Transformer architectures"],
                    relatedProject: "datascience"
                }
            ]
        },
        {
            track: "physics-curriculum",
            institution: "Vidya Bharati Mahavidyalaya",
            degree: "Bachelor of Science in Physics",
            period: "2025 – 2028",
            domain: "physics",
            tag: "Symplectic mechanics, field theory, quantum states, and non-equilibrium statistical thermodynamics",
            blurb: "Foundational and advanced theoretical physics curriculum bridging continuous analytical mechanics with quantum mechanics and thermodynamics.",
            items: [
                {
                    code: "PH2010",
                    title: "Classical Mechanics & Lagrangian Dynamics",
                    status: "Active",
                    desc: "Principle of least action, Euler-Lagrange equations, Legendre transforms, Poisson brackets, canonical transformations and Hamilton-Jacobi theory.",
                    eq: r`\frac{d}{dt}\left(\frac{\partial L}{\partial\dot{\mathbf q}}\right)-\frac{\partial L}{\partial\mathbf q}=\mathbf 0,\qquad H(\mathbf q,\mathbf p,t)=\mathbf p^\top\dot{\mathbf q}-L`,
                    topics: ["Euler-Lagrange equations", "Hamiltonian mechanics", "Canonical transformations", "Poisson brackets & constants of motion", "Symplectic flow conservation"],
                    relatedProject: "nbody-leapfrog"
                },
                {
                    code: "PH2020",
                    title: "Quantum Mechanics & Wave Equations",
                    status: "Active",
                    desc: "Hilbert space formulation, time-dependent Schrödinger equation, unitary operators, Gaussian wavepackets, harmonic oscillators and barrier penetration.",
                    eq: r`i\hbar\,\frac{\partial\psi}{\partial t}=\left[-\frac{\hbar^2}{2m}\nabla^2+V(\mathbf r)\right]\psi`,
                    topics: ["Unitary time-evolution operators", "Split-step Fourier method", "Wavepacket dispersion", "Quantum tunnelling through potentials", "Commutation relations"],
                    relatedProject: "split-step-schrodinger"
                },
                {
                    code: "PH2040",
                    title: "Statistical Mechanics & Thermodynamics",
                    status: "Active",
                    desc: "Microcanonical, canonical and grand canonical ensembles, partition functions, Maxwell-Boltzmann, Bose-Einstein and Fermi-Dirac statistics.",
                    eq: r`Z=\sum_i e^{-\beta E_i},\qquad F=-k_B T\ln Z,\qquad S=-\left(\frac{\partial F}{\partial T}\right)_V`,
                    topics: ["Canonical partition function", "Helmholtz & Gibbs free energy", "Equipartition theorem", "Phase transitions & critical exponents", "Fluctuation-dissipation theorem"],
                    relatedProject: "datascience"
                }
            ]
        },
        {
            track: "advanced-quant-systems",
            institution: "Independent & Advanced Specialisations",
            degree: "Quantitative Finance & Systems Engineering",
            period: "2024 – 2026",
            domain: "quant",
            tag: "Itô calculus, Black-Scholes PDE, pairs co-integration, LLVM compilers and TTL machine architecture",
            blurb: "Rigorous self-directed and advanced honours coursework spanning continuous-time financial engineering, market microstructure, and low-level compiler systems.",
            items: [
                {
                    code: "QF4010",
                    title: "Stochastic Calculus for Derivatives Pricing",
                    status: "Completed",
                    desc: "Geometric Brownian motion, Itô's lemma, martingales, Girsanov theorem, risk-neutral measures, Black-Scholes PDE and analytical Greeks.",
                    eq: r`df(S_t,t)=\Big(\frac{\partial f}{\partial t}+\mu S_t\frac{\partial f}{\partial S}+\tfrac12\sigma^2 S_t^2\frac{\partial^2 f}{\partial S^2}\Big)dt+\sigma S_t\frac{\partial f}{\partial S}dW_t`,
                    topics: ["Itô's lemma & quadratic variation", "Girsanov change of measure", "Black-Scholes PDE derivation", "Delta, Gamma & Vega Greeks", "Monte Carlo terminal sampling"],
                    relatedProject: "options-pricing"
                },
                {
                    code: "QF4020",
                    title: "High-Frequency Statistical Arbitrage & Microstructure",
                    status: "Completed",
                    desc: "Engle-Granger co-integration, Ornstein-Uhlenbeck mean-reversion, rolling z-score signals, transaction cost models and Sharpe optimisation.",
                    eq: r`d\varepsilon_t = \theta(\mu - \varepsilon_t)\,dt + \sigma\,dW_t,\qquad \tau_{1/2}=\frac{\ln 2}{\theta}`,
                    topics: ["Stationarity & ADF tests", "Ornstein-Uhlenbeck parameter estimation", "Spread trading execution algorithms", "Transaction cost modelling", "Annualised Sharpe metrics"],
                    relatedProject: "stat-arb"
                },
                {
                    code: "CS3100",
                    title: "Compiler Design & Language Processing",
                    status: "Completed",
                    desc: "Lexical analysis with DFAs, LALR(1) grammars, abstract syntax trees, semantic type checking, SSA form and LLVM IR code generation.",
                    eq: r`\mathrm{IN}[B]=\bigcup_{P\in\mathrm{pred}(B)}\mathrm{OUT}[P],\qquad\mathrm{OUT}[B]=\mathrm{gen}[B]\cup\big(\mathrm{IN}[B]\setminus\mathrm{kill}[B]\big)`,
                    topics: ["Lexing with Flex & NFAs", "Bison LALR parsing tables", "Symbol table scope hierarchies", "SSA intermediate representation", "LLVM IR backend lowering"],
                    relatedProject: "ku-lang"
                },
                {
                    code: "CS2040",
                    title: "Computer Architecture & Digital Systems",
                    status: "Completed",
                    desc: "Boolean algebra, Karnaugh maps, discrete TTL logic gates, ripple-carry ALUs, register banks, bus contention and logic-analyser verification.",
                    eq: r`S_i = A_i \oplus B_i \oplus C_i,\qquad C_{i+1} = A_i B_i + C_i(A_i \oplus B_i)`,
                    topics: ["Full adders & two's complement arithmetic", "Tri-state bus gating", "Fetch-decode-execute control sequencers", "Clock timing & propagation delay", "Logic analyser waveform analysis"],
                    relatedProject: "8bit-computer"
                }
            ]
        }
    ]
};
