#!/usr/bin/env node

/**
 * Portfolio Setup Script
 * Automated setup for Kushan Waghmare's Portfolio Website
 *
 * This script will:
 * - Check system requirements
 * - Install dependencies
 * - Setup environment configuration
 * - Initialize the development server
 * - Provide helpful instructions
 */

const { exec, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

// Colors for console output
const colors = {
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m',
    white: '\x1b[37m',
    reset: '\x1b[0m'
};

class PortfolioSetup {
    constructor() {
        this.rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });

        this.requiredNodeVersion = '18.0.0';
        this.projectName = 'Kushan Waghmare Portfolio';
        this.setupSteps = [
            'Checking system requirements',
            'Installing dependencies',
            'Setting up environment',
            'Configuring development server',
            'Starting application'
        ];
        this.currentStep = 0;
    }

    // Utility methods
    log(message, color = 'white') {
        console.log(`${colors[color]}${message}${colors.reset}`);
    }

    logStep(message) {
        this.currentStep++;
        this.log(`\n[${this.currentStep}/${this.setupSteps.length}] ${message}`, 'blue');
    }

    logSuccess(message) {
        this.log(`✅ ${message}`, 'green');
    }

    logError(message) {
        this.log(`❌ ${message}`, 'red');
    }

    logWarning(message) {
        this.log(`⚠️  ${message}`, 'yellow');
    }

    logInfo(message) {
        this.log(`ℹ️  ${message}`, 'cyan');
    }

    async question(prompt) {
        return new Promise((resolve) => {
            this.rl.question(prompt, resolve);
        });
    }

    async executeCommand(command, description) {
        return new Promise((resolve, reject) => {
            this.log(`Running: ${description}...`, 'yellow');

            exec(command, (error, stdout, stderr) => {
                if (error) {
                    this.logError(`Failed: ${description}`);
                    this.logError(`Error: ${error.message}`);
                    reject(error);
                } else {
                    this.logSuccess(`Completed: ${description}`);
                    resolve(stdout);
                }
            });
        });
    }

    // Check if Node.js version meets requirements
    async checkNodeVersion() {
        try {
            const version = process.version.slice(1); // Remove 'v' prefix
            const [major, minor, patch] = version.split('.').map(Number);
            const [reqMajor, reqMinor, reqPatch] = this.requiredNodeVersion.split('.').map(Number);

            if (major < reqMajor || (major === reqMajor && minor < reqMinor)) {
                this.logError(`Node.js ${this.requiredNodeVersion}+ required. Current: ${version}`);
                this.logInfo('Please update Node.js: https://nodejs.org/');
                return false;
            }

            this.logSuccess(`Node.js version: ${version} ✓`);
            return true;
        } catch (error) {
            this.logError('Failed to check Node.js version');
            return false;
        }
    }

    // Check if npm is available
    async checkNpm() {
        try {
            await this.executeCommand('npm --version', 'Checking npm');
            return true;
        } catch (error) {
            this.logError('npm not found. Please install Node.js with npm.');
            return false;
        }
    }

    // Install project dependencies
    async installDependencies() {
        try {
            this.logInfo('This may take a few minutes...');
            await this.executeCommand('npm install', 'Installing dependencies');
            return true;
        } catch (error) {
            this.logError('Failed to install dependencies');
            this.logInfo('Try running: npm install --force');
            return false;
        }
    }

    // Setup environment configuration
    async setupEnvironment() {
        const envPath = '.env';
        const envExamplePath = '.env.example';

        if (fs.existsSync(envPath)) {
            this.logWarning('.env file already exists');
            const overwrite = await this.question('Do you want to reconfigure? (y/N): ');
            if (overwrite.toLowerCase() !== 'y') {
                this.logInfo('Keeping existing .env file');
                return true;
            }
        }

        if (!fs.existsSync(envExamplePath)) {
            this.logError('.env.example not found');
            return false;
        }

        try {
            // Copy example to .env
            fs.copyFileSync(envExamplePath, envPath);
            this.logSuccess('Created .env file from template');

            // Interactive configuration
            this.log('\n📧 Email Configuration (for contact form):', 'cyan');
            const emailUser = await this.question('Enter your Gmail address (or press Enter to skip): ');

            if (emailUser) {
                const emailPass = await this.question('Enter your Gmail App Password (or press Enter to skip): ');
                const contactEmail = await this.question(`Contact email (default: ${emailUser}): `) || emailUser;

                // Update .env file
                let envContent = fs.readFileSync(envPath, 'utf8');
                envContent = envContent.replace('your.email@gmail.com', emailUser);
                envContent = envContent.replace('your-app-password-here', emailPass);
                envContent = envContent.replace('kushan@example.com', contactEmail);

                fs.writeFileSync(envPath, envContent);
                this.logSuccess('Email configuration updated');

                this.logInfo('\n📱 Gmail App Password Setup:');
                this.logInfo('1. Enable 2-factor authentication on your Gmail');
                this.logInfo('2. Go to Google Account settings');
                this.logInfo('3. Select "App passwords"');
                this.logInfo('4. Generate an app password for this application');
            }

            return true;
        } catch (error) {
            this.logError('Failed to setup environment');
            return false;
        }
    }

    // Create necessary directories
    async createDirectories() {
        const dirs = ['public/js', 'public/css', 'public/images', 'logs'];

        for (const dir of dirs) {
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
                this.logSuccess(`Created directory: ${dir}`);
            }
        }
    }

    // Display welcome banner
    showWelcomeBanner() {
        console.clear();
        this.log('╔══════════════════════════════════════════════════════════════╗', 'cyan');
        this.log('║                                                              ║', 'cyan');
        this.log('║        🚀 KUSHAN WAGHMARE PORTFOLIO SETUP 🚀               ║', 'cyan');
        this.log('║                                                              ║', 'cyan');
        this.log('║     Modern Portfolio with Real-time Features & Animations   ║', 'cyan');
        this.log('║                                                              ║', 'cyan');
        this.log('╚══════════════════════════════════════════════════════════════╝', 'cyan');
        this.log('\n✨ Welcome to the automated setup process!\n', 'white');
    }

    // Display completion message
    showCompletionMessage() {
        this.log('\n🎉 Setup completed successfully!', 'green');
        this.log('\n📋 Next Steps:', 'cyan');
        this.log('   1. npm run dev     - Start development server', 'white');
        this.log('   2. npm start       - Start production server', 'white');
        this.log('   3. npm run build   - Build for production', 'white');

        this.log('\n🌐 URLs:', 'cyan');
        this.log('   • Local:           http://localhost:3000', 'white');
        this.log('   • Network:         Check terminal for network IP', 'white');

        this.log('\n🔧 Configuration:', 'cyan');
        this.log('   • Environment:     .env file', 'white');
        this.log('   • Server:          server.js', 'white');
        this.log('   • Client:          public/js/app.js', 'white');

        this.log('\n📚 Features Included:', 'cyan');
        this.log('   ✅ Real-time visitor tracking', 'green');
        this.log('   ✅ Socket.IO for live updates', 'green');
        this.log('   ✅ Contact form with email', 'green');
        this.log('   ✅ Dark/Light theme toggle', 'green');
        this.log('   ✅ Advanced animations', 'green');
        this.log('   ✅ Particle effects', 'green');
        this.log('   ✅ Custom cursor', 'green');
        this.log('   ✅ Mobile responsive', 'green');

        this.log('\n📖 Documentation:', 'cyan');
        this.log('   • README.md        - Project overview', 'white');
        this.log('   • .env.example     - Environment variables', 'white');

        this.log('\n🆘 Need Help?', 'yellow');
        this.log('   • Check the console for any error messages', 'white');
        this.log('   • Ensure all ports are available (3000)', 'white');
        this.log('   • Verify environment configuration in .env', 'white');
    }

    // Start development server
    async startDevelopmentServer() {
        const startServer = await this.question('\nStart development server now? (Y/n): ');

        if (startServer.toLowerCase() !== 'n') {
            this.log('\n🚀 Starting development server...', 'green');
            this.log('Press Ctrl+C to stop the server', 'yellow');

            // Close readline interface before spawning
            this.rl.close();

            const server = spawn('npm', ['run', 'dev'], {
                stdio: 'inherit',
                shell: true
            });

            server.on('error', (error) => {
                this.logError(`Failed to start server: ${error.message}`);
            });

            // Handle process termination
            process.on('SIGINT', () => {
                this.log('\n\n👋 Shutting down server...', 'yellow');
                server.kill();
                process.exit(0);
            });

        } else {
            this.rl.close();
            this.log('\n✨ Setup complete! Run "npm run dev" when ready.', 'green');
        }
    }

    // Main setup process
    async run() {
        try {
            this.showWelcomeBanner();

            // Step 1: Check system requirements
            this.logStep('Checking system requirements');
            const nodeOk = await this.checkNodeVersion();
            const npmOk = await this.checkNpm();

            if (!nodeOk || !npmOk) {
                this.logError('System requirements not met. Please fix the issues above.');
                this.rl.close();
                process.exit(1);
            }

            // Step 2: Install dependencies
            this.logStep('Installing dependencies');
            const depsOk = await this.installDependencies();
            if (!depsOk) {
                this.logError('Dependency installation failed.');
                this.rl.close();
                process.exit(1);
            }

            // Step 3: Setup environment
            this.logStep('Setting up environment');
            const envOk = await this.setupEnvironment();
            if (!envOk) {
                this.logWarning('Environment setup had issues, but continuing...');
            }

            // Step 4: Create directories
            this.logStep('Configuring development server');
            await this.createDirectories();

            // Step 5: Complete setup
            this.logStep('Finalizing setup');
            this.showCompletionMessage();

            // Option to start server
            await this.startDevelopmentServer();

        } catch (error) {
            this.logError(`Setup failed: ${error.message}`);
            this.rl.close();
            process.exit(1);
        }
    }
}

// Handle unhandled rejections
process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    process.exit(1);
});

// Run setup if this file is executed directly
if (require.main === module) {
    const setup = new PortfolioSetup();
    setup.run().catch((error) => {
        console.error('Setup failed:', error);
        process.exit(1);
    });
}

module.exports = PortfolioSetup;
