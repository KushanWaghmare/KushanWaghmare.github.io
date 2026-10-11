#!/bin/sh
# Generates the thin HTML shells. Content lives in shared/data.js; pages are rendered by shared/app.js.
# usage: sh scratch/make-pages.sh   (run from repo root)
page() { # file domain pagetype three(0/1) title description
cat > "$1" <<EOF
<!doctype html>
<html lang="en-GB" data-domain="$2" data-page="$3">
<head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>$5</title>
    <meta name="description" content="$6" />
    <script>try{document.documentElement.dataset.theme=localStorage.getItem("theme")||"dark"}catch(e){document.documentElement.dataset.theme="dark"}</script>
    <link rel="stylesheet" href="shared/style.css" />
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css" />
    <script defer src="https://cdn.jsdelivr.net/npm/gsap@3.12.5/dist/gsap.min.js"></script>
    <script defer src="https://cdn.jsdelivr.net/npm/gsap@3.12.5/dist/ScrollTrigger.min.js"></script>
    <script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.js"></script>
    <script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/contrib/auto-render.min.js"></script>
$( [ "$4" = 1 ] && echo '    <script defer src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r134/three.min.js"></script>' )
    <script defer src="shared/data.js"></script>
    <script defer src="shared/sims.js"></script>
    <script defer src="shared/app.js"></script>
    <noscript><style>.wipe{display:none}</style></noscript>
</head>
<body>
    <div class="wipe"></div>
</body>
</html>
EOF
}
page index.html       hub         hub     1 "Kushan Waghmare · Portfolio" "Kushan Waghmare: Data Science and Quantitative Finance student at IIT Madras. Mathematics, physics, data science, quant finance and computer science projects."
page math.html        math        domain  1 "Mathematics · Kushan Waghmare" "Topology, differential geometry and analysis projects by Kushan Waghmare."
page physics.html     physics     domain  0 "Physics · Kushan Waghmare" "Classical and quantum mechanics simulations by Kushan Waghmare."
page datascience.html datascience domain  0 "Data Science · Kushan Waghmare" "Statistical learning and graph analytics projects by Kushan Waghmare."
page quant.html       quant       domain  0 "Quantitative Finance · Kushan Waghmare" "Derivative pricing and statistical arbitrage projects by Kushan Waghmare."
page cs.html          cs          domain  0 "Computer Science · Kushan Waghmare" "Compiler and computer-architecture projects by Kushan Waghmare."
page project.html     hub         project 1 "Project · Kushan Waghmare" "Project deep-dive: architecture and mathematics."
