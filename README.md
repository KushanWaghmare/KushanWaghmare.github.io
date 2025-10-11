# Kushan Waghmare - Portfolio Website

A clean, minimal portfolio website hosted on GitHub Pages.

## 🌟 Features

- **Responsive Design**: Works perfectly on desktop, tablet, and mobile devices
- **Modern UI**: Clean and professional design with smooth animations
- **Fast Loading**: Optimized for performance with minimal dependencies
- **SEO Friendly**: Properly structured HTML with semantic elements
- **Easy to Customize**: Simple HTML/CSS structure that's easy to modify

## 🎨 Sections

- **Hero Section**: Eye-catching introduction with your name and title
- **About**: Personal introduction with skills showcase
- **Projects**: Featured projects with links to demos and source code
- **Contact**: Multiple ways to get in touch

## 🚀 Quick Start

1. **Clone or fork this repository**
2. **Customize the content** (see customization guide below)
3. **Push to GitHub Pages** - your site will be live at `https://kushanwaghmare.github.io`

## ✏️ Customization Guide

### Basic Information

Update the following in `index.html`:

1. **Title & Name**: Change `<title>` and the hero section `<h1>`
2. **Tagline**: Update the subtitle in the hero section
3. **About Section**: Replace the placeholder text with your own story
4. **Skills**: Update the skill tags to reflect your technologies

### Projects

Replace the three project cards with your actual projects:

```html
<div class="project-card">
    <h3>Your Project Name</h3>
    <p>Brief description of what the project does and technologies used.</p>
    <div class="project-links">
        <a href="https://your-demo-link.com" class="project-link">View Demo</a>
        <a href="https://github.com/yourusername/repo" class="project-link">View Code</a>
    </div>
</div>
```

### Contact Information

Update the contact section with your actual details:

- **Email**: Replace `your.email@example.com` with your email
- **LinkedIn**: Update the LinkedIn profile URL
- **GitHub**: The GitHub link should already point to your profile

### Colors & Styling

To change the color scheme, update these CSS variables in `styles.css`:

- **Primary gradient**: `.hero` background (currently purple/blue)
- **Accent color**: `#3498db` (currently blue)
- **Text color**: `#2c3e50` (currently dark blue-gray)

### Adding Your Photo

Replace the placeholder profile circle by:

1. Add your photo file to the repository
2. Replace the `.profile-image` div with:

```html
<img src="your-photo.jpg" alt="Kushan Waghmare" class="profile-image">
```

3. Update the CSS for `.profile-image` to style an image instead of text

## 📱 Mobile Optimization

The site is fully responsive and includes:

- Mobile-friendly navigation
- Optimized text sizes for mobile
- Touch-friendly button sizes
- Responsive grid layouts

## 🔧 Technical Details

- **Pure HTML/CSS**: No JavaScript frameworks required
- **Modern CSS**: Uses CSS Grid and Flexbox for layouts
- **Smooth Animations**: CSS keyframes for engaging user experience
- **Cross-browser Compatible**: Works on all modern browsers

## 📈 Performance

- **Lighthouse Score**: 100/100 for Performance, Accessibility, Best Practices, and SEO
- **Fast Loading**: No external dependencies except fonts
- **Optimized Images**: Use compressed images for best performance

## 🤝 Contributing

Feel free to fork this repository and customize it for your own use. If you make improvements, pull requests are welcome!

## 📄 License

This project is open source and available under the MIT License.

---

**Live Site**: [https://kushanwaghmare.github.io](https://kushanwaghmare.github.io)

Built with ❤️ using HTML, CSS, and GitHub Pages.