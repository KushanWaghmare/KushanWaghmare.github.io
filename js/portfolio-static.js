/**
 * Static Portfolio Enhancements
 * Lightweight particle background, typing effect, and scroll progress.
 */

document.addEventListener("DOMContentLoaded", () => {
    initParticles();
    initTyping();
    initScrollProgress();
    initContactFeedback();
});

// Canvas particle background
function initParticles() {
    const canvas = document.createElement("canvas");
    canvas.id = "particle-canvas";
    canvas.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        pointer-events: none;
        z-index: 1;
        opacity: 0.1;
    `;
    document.body.insertBefore(canvas, document.body.firstChild);

    const ctx = canvas.getContext("2d");
    const particles = [];

    const resize = () => {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    for (let i = 0; i < 30; i++) {
        particles.push({
            x: Math.random() * canvas.width,
            y: Math.random() * canvas.height,
            vx: (Math.random() - 0.5) * 0.3,
            vy: (Math.random() - 0.5) * 0.3,
            size: Math.random() * 2 + 1,
            opacity: Math.random() * 0.5 + 0.1,
        });
    }

    function animate() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const isDark = document.body.getAttribute("data-theme") === "dark";
        const fillRgb = isDark ? "255, 255, 255" : "0, 0, 0";

        for (const p of particles) {
            p.x += p.vx;
            p.y += p.vy;

            if (p.x < 0 || p.x > canvas.width) p.vx *= -1;
            if (p.y < 0 || p.y > canvas.height) p.vy *= -1;

            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(${fillRgb}, ${p.opacity})`;
            ctx.fill();
        }

        requestAnimationFrame(animate);
    }

    animate();
}

// Hero typing animation
function initTyping() {
    const subtitle = document.querySelector(".hero-content p");
    if (!subtitle) return;

    const texts = [
        "Data Science Student",
        "Quantitative Finance Enthusiast",
        "Compiler Designer",
        "Financial Modeller",
        "Systems Programmer",
    ];

    let textIdx = 0;
    let charIdx = 0;
    let deleting = false;

    function tick() {
        const current = texts[textIdx];

        if (deleting) {
            charIdx--;
            subtitle.textContent = current.substring(0, charIdx);
            if (charIdx === 0) {
                deleting = false;
                textIdx = (textIdx + 1) % texts.length;
                setTimeout(tick, 400);
                return;
            }
            setTimeout(tick, 40);
        } else {
            charIdx++;
            subtitle.textContent = current.substring(0, charIdx);
            if (charIdx === current.length) {
                deleting = true;
                setTimeout(tick, 2000);
                return;
            }
            setTimeout(tick, 80);
        }
    }

    setTimeout(tick, 1000);
}

// Scroll progress bar
function initScrollProgress() {
    const bar = document.createElement("div");
    bar.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 0%;
        height: 2px;
        background: var(--black);
        z-index: 1001;
        transition: width 0.1s ease;
    `;
    document.body.appendChild(bar);

    window.addEventListener("scroll", () => {
        const total = document.documentElement.scrollHeight - window.innerHeight;
        const progress = total > 0 ? (window.scrollY / total) * 100 : 0;
        bar.style.width = `${progress}%`;
    });
}

// Contact form submission UI feedback
function initContactFeedback() {
    const form = document.getElementById("contact-form");
    if (!form) return;

    form.addEventListener("submit", () => {
        const btn = form.querySelector('button[type="submit"]');
        if (btn) {
            const original = btn.textContent;
            btn.textContent = "Sending...";
            btn.disabled = true;
            setTimeout(() => {
                btn.textContent = original;
                btn.disabled = false;
            }, 3000);
        }
    });
}
