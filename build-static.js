#!/usr/bin/env node

/**
 * Static Build Script for Kushan Waghmare Portfolio
 * Generates a static version compatible with GitHub Pages
 *
 * This script will:
 * - Create a static HTML version without Node.js dependencies
 * - Remove Socket.IO and server-side features
 * - Keep all animations and visual effects
 * - Generate GitHub Pages compatible files
 */

const fs = require('fs');
const path = require('path');

class StaticBuilder {
    constructor() {
        this.sourceDir = __dirname;
        this.buildDir = path.join(__dirname, 'static-build');
        this.originalHTML = '';
        this.staticCSS = '';
        this.staticJS = '';
    }

    // Main build process
    async build() {
        console.log('🚀 Building static version of portfolio...\n');

        try {
            // Create build directory
            await this.createBuildDirectory();

            // Generate static HTML
            await this.generateStaticHTML();

            // Generate static CSS
            await this.generateStaticCSS();

            // Generate static JavaScript
            await this.generateStaticJS();

            // Copy additional assets
            await this.copyAssets();

            // Create README for static version
            await this.createStaticREADME();

            console.log('✅ Static build completed successfully!');
            console.log(`📁 Files generated in: ${this.buildDir}`);
            console.log('🌐 Ready for GitHub Pages deployment\n');

            this.showDeploymentInstructions();

        } catch (error) {
            console.error('❌ Build failed:', error.message);
            process.exit(1);
        }
    }

    // Create build directory
    async createBuildDirectory() {
        if (fs.existsSync(this.buildDir)) {
            fs.rmSync(this.buildDir, { recursive: true, force: true });
        }
        fs.mkdirSync(this.buildDir, { recursive: true });
        console.log('📁 Created build directory');
    }

    // Generate static HTML without server dependencies
    async generateStaticHTML() {
        console.log('🔨 Generating static HTML...');

        // Read original HTML
        this.originalHTML = fs.readFileSync(path.join(this.sourceDir, 'index.html'), 'utf8');

        // Remove Socket.IO script tag
        let staticHTML = this.originalHTML.replace(
            '<script src="/socket.io/socket.io.js"></script>',
            ''
        );

        // Remove server-dependent JavaScript
        staticHTML = staticHTML.replace(
            '<script src="/public/js/app.js"></script>',
            '<script src="js/portfolio-static.js"></script>'
        );

        // Update contact form to use Formspree or similar service
        staticHTML = staticHTML.replace(
            'id="contact-form"',
            'action="https://formspree.io/f/YOUR_FORM_ID" method="POST" id="contact-form"'
        );

        // Add note about contact form
        staticHTML = staticHTML.replace(
            'Send Message',
            'Send Message</button>\n                    <p style="font-size: 0.8rem; color: var(--gray-medium); margin-top: 1rem;">\n                        📝 Update form action with your Formspree endpoint'
        );

        // Remove visitor counter and real-time features from HTML
        staticHTML = staticHTML.replace(
            /<div[^>]*id="visitor-counter"[^>]*>.*?<\/div>/gs,
            ''
        );

        // Update page title
        staticHTML = staticHTML.replace(
            '<title>Kushan Waghmare</title>',
            '<title>Kushan Waghmare - Portfolio</title>'
        );

        // Add meta description
        staticHTML = staticHTML.replace(
            '<meta name="viewport" content="width=device-width, initial-scale=1.0" />',
            `<meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <meta name="description" content="Kushan Waghmare - Software Developer & Creative Problem Solver. Modern portfolio showcasing projects, skills, and contact information." />
        <meta name="keywords" content="portfolio, software developer, web development, JavaScript, React, Node.js" />
        <meta name="author" content="Kushan Waghmare" />`
        );

        // Write static HTML
        fs.writeFileSync(path.join(this.buildDir, 'index.html'), staticHTML);
        console.log('✅ Static HTML generated');
    }

    // Extract and generate static CSS
    async generateStaticCSS() {
        console.log('🎨 Generating static CSS...');

        // Extract CSS from HTML
        const cssMatch = this.originalHTML.match(/<style>([\s\S]*?)<\/style>/);
        if (cssMatch) {
            let css = cssMatch[1];

            // Remove server-dependent styles
            css = css.replace(/\/\* Custom cursor \*\/[\s\S]*?@media \(max-width: 768px\) \{[\s\S]*?\.cursor \{[\s\S]*?\}[\s\S]*?\}/g, '');

            // Add fallback for custom cursor on static version
            css += `

/* Static version adjustments */
body {
    cursor: default;
}

.cursor {
    display: none !important;
}

/* Enhanced static animations */
.hero-content h1 {
    animation: fadeInUp 1.2s ease 0.5s both;
}

.hero-content p {
    animation: fadeInUp 1.2s ease 0.7s both;
}

.scroll-indicator {
    animation: fadeInUp 1.2s ease 0.9s both;
}

@keyframes fadeInUp {
    from {
        opacity: 0;
        transform: translateY(30px);
    }
    to {
        opacity: 1;
        transform: translateY(0);
    }
}

/* Improved hover states for static version */
.project-card:hover {
    transform: translateY(-10px) scale(1.02);
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.skill:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

/* Static theme toggle improvements */
.theme-toggle:hover {
    transform: translateY(-50%) scale(1.1) rotate(15deg);
}
`;

            fs.writeFileSync(path.join(this.buildDir, 'styles.css'), css);
        }

        console.log('✅ Static CSS generated');
    }

    // Generate static JavaScript without server dependencies
    async generateStaticJS() {
        console.log('⚡ Generating static JavaScript...');

        const staticJS = `
/**
 * Static Portfolio JavaScript
 * Simplified version without server dependencies
 */

class StaticPortfolio {
    constructor() {
        this.currentTheme = localStorage.getItem('theme') || 'dark';
        this.particles = [];
        this.typingTexts = [
            'Software Developer',
            'Creative Problem Solver',
            'Full-Stack Engineer',
            'Digital Innovator',
            'Code Architect'
        ];
        this.currentTextIndex = 0;
        this.isTyping = false;

        this.init();
    }

    init() {
        document.body.setAttribute('data-theme', this.currentTheme);
        this.initializeEventListeners();
        this.initializeAnimations();
        this.initializeParticleSystem();
        this.initializeTypingAnimation();
        this.initializeScrollAnimations();

        console.log('🚀 Static Portfolio initialized');
    }

    // Event listeners
    initializeEventListeners() {
        // Theme toggle
        const themeToggle = document.getElementById('theme-toggle');
        if (themeToggle) {
            themeToggle.addEventListener('click', (e) => this.toggleTheme(e));
        }

        // Smooth scrolling
        document.querySelectorAll('a[href^="#"]').forEach(anchor => {
            anchor.addEventListener('click', (e) => {
                e.preventDefault();
                const target = document.querySelector(anchor.getAttribute('href'));
                if (target) {
                    target.scrollIntoView({ behavior: 'smooth' });
                }
            });
        });

        // Contact form enhancement
        const contactForm = document.getElementById('contact-form');
        if (contactForm) {
            contactForm.addEventListener('submit', this.handleContactForm.bind(this));
        }

        // Add interactive effects
        this.addHoverEffects();
    }

    // Theme toggle functionality
    toggleTheme(event) {
        const rect = event.target.getBoundingClientRect();
        const x = ((rect.left + rect.width / 2) / window.innerWidth) * 100;
        const y = ((rect.top + rect.height / 2) / window.innerHeight) * 100;

        const themeTransition = document.querySelector('.theme-transition');
        themeTransition.style.setProperty('--x', x + '%');
        themeTransition.style.setProperty('--y', y + '%');
        themeTransition.classList.add('active');

        setTimeout(() => {
            this.currentTheme = this.currentTheme === 'dark' ? 'light' : 'dark';
            document.body.setAttribute('data-theme', this.currentTheme);
            localStorage.setItem('theme', this.currentTheme);

            setTimeout(() => {
                themeTransition.classList.remove('active');
            }, 300);
        }, 300);
    }

    // Particle system
    initializeParticleSystem() {
        const canvas = document.createElement('canvas');
        canvas.id = 'particle-canvas';
        canvas.style.cssText = \`
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            pointer-events: none;
            z-index: 1;
            opacity: 0.1;
        \`;

        document.body.insertBefore(canvas, document.body.firstChild);

        const ctx = canvas.getContext('2d');

        const resizeCanvas = () => {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
        };

        resizeCanvas();
        window.addEventListener('resize', resizeCanvas);

        // Create particles
        for (let i = 0; i < 30; i++) {
            this.particles.push({
                x: Math.random() * canvas.width,
                y: Math.random() * canvas.height,
                vx: (Math.random() - 0.5) * 0.3,
                vy: (Math.random() - 0.5) * 0.3,
                size: Math.random() * 2 + 1,
                opacity: Math.random() * 0.5 + 0.1
            });
        }

        const animate = () => {
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            this.particles.forEach(particle => {
                particle.x += particle.vx;
                particle.y += particle.vy;

                if (particle.x < 0 || particle.x > canvas.width) particle.vx *= -1;
                if (particle.y < 0 || particle.y > canvas.height) particle.vy *= -1;

                ctx.beginPath();
                ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
                ctx.fillStyle = this.currentTheme === 'dark' ?
                    \`rgba(255, 255, 255, \${particle.opacity})\` :
                    \`rgba(0, 0, 0, \${particle.opacity})\`;
                ctx.fill();
            });

            requestAnimationFrame(animate);
        };

        animate();
    }

    // Typing animation
    initializeTypingAnimation() {
        const heroSubtitle = document.querySelector('.hero-content p');
        if (!heroSubtitle) return;

        let currentText = '';
        let targetText = this.typingTexts[this.currentTextIndex];
        let isDeleting = false;

        const typeText = () => {
            if (this.isTyping) return;
            this.isTyping = true;

            const speed = isDeleting ? 50 : 100;

            if (!isDeleting && currentText !== targetText) {
                currentText = targetText.substring(0, currentText.length + 1);
            } else if (isDeleting && currentText !== '') {
                currentText = targetText.substring(0, currentText.length - 1);
            }

            heroSubtitle.textContent = currentText;

            let nextDelay = speed;

            if (!isDeleting && currentText === targetText) {
                nextDelay = 2000;
                isDeleting = true;
            } else if (isDeleting && currentText === '') {
                isDeleting = false;
                this.currentTextIndex = (this.currentTextIndex + 1) % this.typingTexts.length;
                targetText = this.typingTexts[this.currentTextIndex];
                nextDelay = 500;
            }

            this.isTyping = false;
            setTimeout(typeText, nextDelay);
        };

        setTimeout(typeText, 1000);
    }

    // Scroll animations
    initializeScrollAnimations() {
        const observerOptions = {
            threshold: 0.1,
            rootMargin: '0px 0px -50px 0px'
        };

        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('visible');

                    // Add staggered animation for project cards
                    if (entry.target.classList.contains('project-card')) {
                        const cards = document.querySelectorAll('.project-card');
                        cards.forEach((card, index) => {
                            setTimeout(() => {
                                card.style.transform = 'translateY(0)';
                                card.style.opacity = '1';
                            }, index * 100);
                        });
                    }
                }
            });
        }, observerOptions);

        document.querySelectorAll('.section-title, .about-image, .about-content, .project-card, .contact-title, .contact-text, .contact-email, .social-links').forEach(el => {
            observer.observe(el);
        });

        // Scroll progress indicator
        this.createScrollProgress();
    }

    // Initialize animations
    initializeAnimations() {
        // Add entrance animations
        const elements = document.querySelectorAll('.hero-content > *');
        elements.forEach((el, index) => {
            el.style.opacity = '0';
            el.style.transform = 'translateY(30px)';
            setTimeout(() => {
                el.style.transition = 'all 0.8s cubic-bezier(0.4, 0, 0.2, 1)';
                el.style.opacity = '1';
                el.style.transform = 'translateY(0)';
            }, 500 + (index * 200));
        });
    }

    // Add hover effects
    addHoverEffects() {
        // Project cards
        document.querySelectorAll('.project-card').forEach(card => {
            card.addEventListener('mouseenter', () => {
                card.style.transform = 'translateY(-10px) scale(1.02)';
                card.style.boxShadow = '0 20px 40px rgba(0,0,0,0.2)';
            });

            card.addEventListener('mouseleave', () => {
                card.style.transform = 'translateY(0) scale(1)';
                card.style.boxShadow = 'none';
            });
        });

        // Skills
        document.querySelectorAll('.skill').forEach(skill => {
            skill.addEventListener('mouseenter', () => {
                skill.style.transform = 'translateY(-2px)';
                skill.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
            });

            skill.addEventListener('mouseleave', () => {
                skill.style.transform = 'translateY(0)';
                skill.style.boxShadow = 'none';
            });
        });
    }

    // Create scroll progress indicator
    createScrollProgress() {
        const progress = document.createElement('div');
        progress.style.cssText = \`
            position: fixed;
            top: 0;
            left: 0;
            width: 0%;
            height: 2px;
            background: var(--black);
            z-index: 1001;
            transition: width 0.1s ease;
        \`;
        document.body.appendChild(progress);

        window.addEventListener('scroll', () => {
            const winScroll = document.body.scrollTop || document.documentElement.scrollTop;
            const height = document.documentElement.scrollHeight - document.documentElement.clientHeight;
            const scrolled = (winScroll / height) * 100;
            progress.style.width = scrolled + '%';
        });
    }

    // Contact form handler
    handleContactForm(event) {
        const submitBtn = event.target.querySelector('button[type="submit"]');
        const originalText = submitBtn.textContent;

        submitBtn.textContent = 'Sending...';
        submitBtn.disabled = true;

        // Re-enable after 3 seconds (form will be submitted to Formspree)
        setTimeout(() => {
            submitBtn.textContent = originalText;
            submitBtn.disabled = false;
        }, 3000);

        // Show success message
        this.showNotification('Message sent! Thank you for reaching out.', 'success');
    }

    // Show notification
    showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.style.cssText = \`
            position: fixed;
            top: 2rem;
            right: 2rem;
            background: \${type === 'success' ? '#4ade80' : '#3b82f6'};
            color: white;
            padding: 1rem 1.5rem;
            border-radius: 8px;
            box-shadow: 0 10px 25px rgba(0,0,0,0.2);
            z-index: 10001;
            transform: translateX(400px);
            transition: transform 0.3s ease;
        \`;
        notification.textContent = message;

        document.body.appendChild(notification);

        setTimeout(() => {
            notification.style.transform = 'translateX(0)';
        }, 100);

        setTimeout(() => {
            notification.style.transform = 'translateX(400px)';
            setTimeout(() => notification.remove(), 300);
        }, 3000);
    }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new StaticPortfolio();
});
`;

        // Create js directory
        fs.mkdirSync(path.join(this.buildDir, 'js'), { recursive: true });
        fs.writeFileSync(path.join(this.buildDir, 'js', 'portfolio-static.js'), staticJS);

        console.log('✅ Static JavaScript generated');
    }

    // Copy additional assets
    async copyAssets() {
        console.log('📋 Copying additional assets...');

        // Copy styles.css if it exists
        if (fs.existsSync(path.join(this.sourceDir, 'styles.css'))) {
            fs.copyFileSync(
                path.join(this.sourceDir, 'styles.css'),
                path.join(this.buildDir, 'styles-backup.css')
            );
        }

        console.log('✅ Assets copied');
    }

    // Create README for static version
    async createStaticREADME() {
        console.log('📖 Creating static README...');

        const staticREADME = `# Kushan Waghmare - Static Portfolio

This is the static version of the portfolio, optimized for GitHub Pages.

## 🚀 Features

- ✅ Dark/Light theme toggle
- ✅ Smooth animations and transitions
- ✅ Particle background effects
- ✅ Responsive design
- ✅ Typing animation
- ✅ Scroll animations
- ✅ Contact form (via Formspree)

## 📝 Setup Contact Form

1. Go to [Formspree.io](https://formspree.io/)
2. Create a free account
3. Create a new form
4. Replace \`YOUR_FORM_ID\` in index.html with your Formspree form ID
5. Update the form action to: \`https://formspree.io/f/YOUR_FORM_ID\`

## 🌐 Deploy to GitHub Pages

1. Push these files to your GitHub repository
2. Go to Settings → Pages
3. Select source branch (usually \`main\`)
4. Your site will be live at: \`https://username.github.io\`

## 🎨 Customization

- Update personal information in \`index.html\`
- Modify colors in the CSS custom properties
- Add your projects and skills
- Update social media links

## ✨ Differences from Full Version

This static version includes all visual features but removes:
- Real-time visitor tracking
- Socket.IO functionality
- Server-side contact form
- Live analytics
- Remote cursor sharing

## 📱 Browser Support

- Chrome 60+
- Firefox 55+
- Safari 12+
- Edge 79+

Built with ❤️ by Kushan Waghmare
`;

        fs.writeFileSync(path.join(this.buildDir, 'README.md'), staticREADME);
        console.log('✅ Static README created');
    }

    // Show deployment instructions
    showDeploymentInstructions() {
        console.log('📋 Deployment Instructions:');
        console.log('');
        console.log('🔸 For GitHub Pages:');
        console.log('   1. Copy contents of static-build/ to your repository root');
        console.log('   2. Update Formspree form ID in index.html');
        console.log('   3. Push to GitHub');
        console.log('   4. Enable Pages in repository settings');
        console.log('');
        console.log('🔸 For Netlify:');
        console.log('   1. Drag and drop the static-build folder to Netlify');
        console.log('   2. Configure form handling in Netlify dashboard');
        console.log('');
        console.log('🔸 Files generated:');
        console.log('   • index.html - Main portfolio page');
        console.log('   • styles.css - Extracted stylesheet');
        console.log('   • js/portfolio-static.js - Static JavaScript');
        console.log('   • README.md - Setup instructions');
        console.log('');
        console.log('🎉 Your static portfolio is ready to deploy!');
    }
}

// Run the build if this file is executed directly
if (require.main === module) {
    const builder = new StaticBuilder();
    builder.build().catch(console.error);
}

module.exports = StaticBuilder;
