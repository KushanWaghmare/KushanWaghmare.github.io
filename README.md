# 🚀 Kushan Waghmare - Advanced Portfolio

A modern, full-stack portfolio website built with Node.js, Express, Socket.IO, and advanced animations. Features real-time interactions, dynamic content, and a sophisticated dark/light theme system.

## ✨ Features Overview

### 🎨 **Frontend Features**
- **Minimal Black & White Design** - Clean, professional aesthetic
- **Dark/Light Mode Toggle** - Smooth theme transitions with radial animation effects
- **Advanced Animations** - Custom particle system, morphing shapes, typing effects
- **Custom Cursor** - Interactive cursor with hover effects and ripple animations
- **Responsive Design** - Mobile-first approach with touch-friendly interactions
- **Smooth Scrolling** - Enhanced navigation with progress indicators

### ⚡ **Real-time Features (Node.js + Socket.IO)**
- **Live Visitor Tracking** - Real-time visitor count and analytics
- **Project View Statistics** - Track and display project interaction metrics
- **Skill Interaction Analytics** - Monitor user engagement with skills
- **Remote Cursor Sharing** - See other users' cursor positions in real-time
- **Theme Synchronization** - Broadcast theme changes to all connected users
- **Live Activity Feed** - Real-time updates and notifications

### 🔧 **Backend Features**
- **Express.js Server** - Robust REST API with rate limiting
- **Email Contact Form** - Nodemailer integration for form submissions
- **Security Middleware** - Helmet, CORS, compression, and rate limiting
- **Real-time Communication** - WebSocket connections for live features
- **Dynamic Content** - API-driven projects and skills data
- **Analytics Dashboard** - Comprehensive usage statistics

### 🎯 **Advanced Animations**
- **Particle System** - Dynamic background particles with connection lines
- **Morphing Shapes** - CSS clip-path animations for profile sections
- **Scroll Animations** - Intersection Observer-based reveal animations
- **Typing Animation** - Dynamic text rotation in hero section
- **Project Card 3D Effects** - Hover animations with perspective transforms
- **Loading Screen** - Elegant intro animation with brand presentation

## 🛠️ **Tech Stack**

### Frontend
- **HTML5/CSS3** - Semantic markup with modern CSS features
- **Vanilla JavaScript** - No frameworks, pure performance
- **Socket.IO Client** - Real-time communication
- **CSS Custom Properties** - Dynamic theming system
- **Intersection Observer API** - Scroll-based animations

### Backend
- **Node.js** - JavaScript runtime environment
- **Express.js** - Web application framework
- **Socket.IO** - Real-time bidirectional communication
- **Nodemailer** - Email sending capabilities
- **Helmet** - Security middleware
- **Rate Limiting** - API protection and abuse prevention

## 🚀 **Quick Start**

### Prerequisites
- **Node.js 18+** - [Download here](https://nodejs.org/)
- **npm** - Comes with Node.js
- **Gmail Account** - For contact form functionality (optional)

### Automated Setup
```bash
# Clone the repository
git clone https://github.com/KushanWaghmare/KushanWaghmare.github.io.git
cd KushanWaghmare.github.io

# Run the setup script (recommended)
node setup.js
```

The setup script will:
- ✅ Check system requirements
- ✅ Install all dependencies
- ✅ Configure environment variables
- ✅ Create necessary directories
- ✅ Start the development server

### Manual Setup
```bash
# Install dependencies
npm install

# Copy environment configuration
cp .env.example .env

# Edit .env with your configuration
nano .env

# Start development server
npm run dev
```

## ⚙️ **Configuration**

### Environment Variables
Create a `.env` file in the root directory:

```env
# Server Configuration
PORT=3000
NODE_ENV=development
CLIENT_URL=http://localhost:3000

# Email Configuration (for contact form)
EMAIL_USER=your.email@gmail.com
EMAIL_PASS=your-gmail-app-password
CONTACT_EMAIL=kushan@example.com
```

### Gmail Setup for Contact Form
1. **Enable 2-Factor Authentication** on your Gmail account
2. **Generate App Password**:
   - Go to Google Account Settings
   - Security → App passwords
   - Generate password for "Mail"
3. **Use App Password** in `.env` file (not your regular password)

## 📁 **Project Structure**

```
KushanWaghmare.github.io/
├── server.js              # Express server with Socket.IO
├── index.html             # Main portfolio page
├── styles.css             # Stylesheet (optional, embedded)
├── package.json           # Dependencies and scripts
├── setup.js               # Automated setup script
├── .env.example           # Environment configuration template
├── public/
│   └── js/
│       └── app.js         # Advanced client-side JavaScript
├── logs/                  # Server logs (created automatically)
└── README.md              # This file
```

## 🎮 **Usage**

### Development Mode
```bash
npm run dev          # Start with nodemon (auto-restart)
npm start            # Start production server
```

### Available Scripts
```bash
npm run dev          # Development with auto-reload
npm start            # Production server
npm run build        # Build for production (if using webpack)
npm run lint         # Code linting
npm test             # Run tests
```

### Accessing the Application
- **Local**: http://localhost:3000
- **Network**: Check terminal for network IP address
- **API Docs**: http://localhost:3000/api/health

## 📡 **API Endpoints**

### Statistics
```http
GET /api/stats
```
Returns visitor statistics, project views, and skill interactions.

### Contact Form
```http
POST /api/contact
Content-Type: application/json

{
  "name": "John Doe",
  "email": "john@example.com",
  "subject": "Collaboration",
  "message": "Hello, I'd like to discuss..."
}
```

### Projects Data
```http
GET /api/projects
```
Returns dynamic project information with view counts.

### Skills Data
```http
GET /api/skills
```
Returns skills with proficiency levels and interaction stats.

## 🌐 **Real-time Events**

### Socket.IO Events

**Client → Server:**
- `project-view` - Track project card clicks
- `skill-interaction` - Track skill hover/clicks
- `page-view` - Track section visibility
- `theme-changed` - Broadcast theme changes
- `cursor-position` - Share cursor coordinates

**Server → Client:**
- `stats-update` - Real-time analytics data
- `visitor-count` - Live visitor counter
- `project-views-update` - Project interaction updates
- `theme-sync` - Synchronized theme changes
- `remote-cursor` - Other users' cursor positions

## 🎨 **Customization Guide**

### Personal Information
1. **Update Content** in `index.html`:
   - Name, title, bio, skills
   - Contact information
   - Social media links

2. **Projects Section**:
   - Replace project cards with your work
   - Update project data in `/api/projects` endpoint
   - Add real demo and repository links

3. **Color Scheme**:
   - Modify CSS custom properties in `:root`
   - Dark mode variables in `[data-theme="dark"]`

### Adding New Features
1. **Client-side**: Extend `PortfolioApp` class in `public/js/app.js`
2. **Server-side**: Add routes and Socket.IO events in `server.js`
3. **Styling**: Update CSS variables and animations

## 🚀 **Deployment**

### Heroku Deployment
```bash
# Install Heroku CLI and login
heroku create your-portfolio-name

# Set environment variables
heroku config:set NODE_ENV=production
heroku config:set EMAIL_USER=your.email@gmail.com
heroku config:set EMAIL_PASS=your-app-password

# Deploy
git push heroku main
```

### Vercel Deployment
```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel --prod
```

### Environment Variables for Production
Set these in your hosting platform:
- `NODE_ENV=production`
- `PORT=3000` (or your host's required port)
- `CLIENT_URL=https://yourdomain.com`
- `EMAIL_USER` and `EMAIL_PASS` for contact form

## 📊 **Analytics & Monitoring**

### Built-in Analytics
- Real-time visitor tracking
- Project interaction metrics
- Skill engagement statistics
- Page view analytics
- Form submission tracking

### Monitoring Features
- Server health endpoint (`/api/health`)
- Real-time connection status
- Error logging and handling
- Rate limiting and security monitoring

## 🔧 **Development**

### Code Style
- ES6+ JavaScript features
- Async/await for asynchronous operations
- Modular architecture with class-based components
- Comprehensive error handling

### Performance Optimizations
- Gzip compression
- Static file caching
- Rate limiting for API protection
- Efficient Socket.IO event handling
- Optimized particle system rendering

## 🐛 **Troubleshooting**

### Common Issues

**Port Already in Use**
```bash
# Kill process using port 3000
lsof -ti:3000 | xargs kill -9
```

**Email Not Sending**
- Verify Gmail App Password (not regular password)
- Check 2-factor authentication is enabled
- Ensure EMAIL_USER and EMAIL_PASS are set correctly

**Socket.IO Connection Issues**
- Check CORS configuration in server.js
- Verify CLIENT_URL matches your domain
- Check firewall settings for WebSocket connections

**Performance Issues**
- Disable particle system on mobile devices
- Reduce animation complexity
- Check for memory leaks in real-time features

### Debug Mode
```bash
DEBUG=portfolio:* npm run dev
```

## 📝 **License**

This project is open source and available under the [MIT License](LICENSE).

## 🤝 **Contributing**

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📞 **Support**

If you have any questions or need help with setup:

- **Email**: kushan@example.com
- **GitHub Issues**: [Create an issue](https://github.com/KushanWaghmare/KushanWaghmare.github.io/issues)
- **LinkedIn**: [Connect with me](https://linkedin.com/in/kushanwaghmare)

## 🎉 **Acknowledgments**

- **Socket.IO** for real-time capabilities
- **Express.js** for robust server framework
- **Nodemailer** for email functionality
- **Inter Font** for beautiful typography
- **CSS Grid & Flexbox** for responsive layouts

---

**Built with ❤️ by Kushan Waghmare**

*"Code is poetry, and every line should tell a story."*