
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
                    `rgba(255, 255, 255, ${particle.opacity})` :
                    `rgba(0, 0, 0, ${particle.opacity})`;
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
        progress.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 0%;
            height: 2px;
            background: var(--black);
            z-index: 1001;
            transition: width 0.1s ease;
        `;
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
        notification.style.cssText = `
            position: fixed;
            top: 2rem;
            right: 2rem;
            background: ${type === 'success' ? '#4ade80' : '#3b82f6'};
            color: white;
            padding: 1rem 1.5rem;
            border-radius: 8px;
            box-shadow: 0 10px 25px rgba(0,0,0,0.2);
            z-index: 10001;
            transform: translateX(400px);
            transition: transform 0.3s ease;
        `;
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
