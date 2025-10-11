const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const cors = require("cors");
const helmet = require("helmet");
const compression = require("compression");
const rateLimit = require("express-rate-limit");
const bodyParser = require("body-parser");
const nodemailer = require("nodemailer");
const path = require("path");
const fs = require("fs").promises;
require("dotenv").config();

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: process.env.CLIENT_URL || "http://localhost:3000",
    methods: ["GET", "POST"],
  },
});

const PORT = process.env.PORT || 3000;

// Security middleware
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: ["'self'", "ws:", "wss:"],
      },
    },
  }),
);

app.use(compression());
app.use(cors());
app.use(bodyParser.json({ limit: "10mb" }));
app.use(bodyParser.urlencoded({ extended: true, limit: "10mb" }));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: "Too many requests from this IP, please try again later.",
  standardHeaders: true,
  legacyHeaders: false,
});

const contactLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5, // limit each IP to 5 contact form submissions per hour
  message: "Too many contact submissions, please try again later.",
});

app.use("/api/", limiter);
app.use("/api/contact", contactLimiter);

// Serve static files
app.use(express.static(path.join(__dirname, "public")));
app.use(express.static("."));

// In-memory storage (in production, use Redis or a database)
const stats = {
  visitors: new Set(),
  totalVisitors: 0,
  currentVisitors: 0,
  projectViews: {
    "ku-lang-compiler": 0,
    "options-pricing": 0,
    "statistical-arbitrage": 0,
    "8bit-computer": 0,
  },
  skillInteractions: {
    python: 0,
    c: 0,
    java: 0,
    sql: 0,
    machinelearning: 0,
    optionspricing: 0,
    statisticalarbitrage: 0,
    llvm: 0,
    pandas: 0,
    git: 0,
  },
  messages: [],
  pageViews: {
    home: 0,
    about: 0,
    projects: 0,
    contact: 0,
  },
};

// Email configuration
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// Socket.IO connection handling
io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  // Track new visitor
  stats.currentVisitors++;
  stats.totalVisitors++;

  // Send current stats to new user
  socket.emit("stats-update", {
    currentVisitors: stats.currentVisitors,
    totalVisitors: stats.totalVisitors,
    projectViews: stats.projectViews,
  });

  // Broadcast updated visitor count
  io.emit("visitor-count", {
    current: stats.currentVisitors,
    total: stats.totalVisitors,
  });

  // Handle project view tracking
  socket.on("project-view", (projectId) => {
    if (stats.projectViews[projectId] !== undefined) {
      stats.projectViews[projectId]++;
      io.emit("project-views-update", {
        projectId,
        views: stats.projectViews[projectId],
      });
    }
  });

  // Handle skill hover tracking
  socket.on("skill-interaction", (skill) => {
    if (stats.skillInteractions[skill] !== undefined) {
      stats.skillInteractions[skill]++;
      socket.emit("skill-animation", {
        skill,
        count: stats.skillInteractions[skill],
      });
    }
  });

  // Handle page view tracking
  socket.on("page-view", (page) => {
    if (stats.pageViews[page] !== undefined) {
      stats.pageViews[page]++;
    }
  });

  // Handle real-time typing effect requests
  socket.on("request-typing-text", (callback) => {
    const texts = [
      "Data Science Student",
      "Quantitative Finance Enthusiast",
      "Compiler Designer",
      "Financial Modeler",
      "Systems Programmer",
    ];
    const randomText = texts[Math.floor(Math.random() * texts.length)];
    callback(randomText);
  });

  // Handle live chat/messages
  socket.on("send-message", (messageData) => {
    const message = {
      id: Date.now(),
      name: messageData.name || "Anonymous",
      message: messageData.message,
      timestamp: new Date(),
      socketId: socket.id,
    };

    stats.messages.push(message);

    // Keep only last 100 messages
    if (stats.messages.length > 100) {
      stats.messages = stats.messages.slice(-100);
    }

    // Broadcast to all clients
    io.emit("new-message", message);
  });

  // Handle theme change broadcasting
  socket.on("theme-changed", (theme) => {
    socket.broadcast.emit("theme-sync", theme);
  });

  // Handle cursor position sharing (for collaborative cursor effect)
  socket.on("cursor-position", (position) => {
    socket.broadcast.emit("remote-cursor", {
      id: socket.id,
      x: position.x,
      y: position.y,
    });
  });

  // Handle disconnect
  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id);
    stats.currentVisitors--;
    io.emit("visitor-count", {
      current: stats.currentVisitors,
      total: stats.totalVisitors,
    });
  });
});

// API Routes

// Get portfolio stats
app.get("/api/stats", (req, res) => {
  res.json({
    success: true,
    data: {
      currentVisitors: stats.currentVisitors,
      totalVisitors: stats.totalVisitors,
      projectViews: stats.projectViews,
      skillInteractions: stats.skillInteractions,
      pageViews: stats.pageViews,
      totalMessages: stats.messages.length,
    },
  });
});

// Get recent messages
app.get("/api/messages", (req, res) => {
  const recentMessages = stats.messages.slice(-20).map((msg) => ({
    id: msg.id,
    name: msg.name,
    message: msg.message,
    timestamp: msg.timestamp,
  }));

  res.json({
    success: true,
    data: recentMessages,
  });
});

// Handle contact form submission
app.post("/api/contact", async (req, res) => {
  try {
    const { name, email, message, subject = "Portfolio Contact" } = req.body;

    // Validation
    if (!name || !email || !message) {
      return res.status(400).json({
        success: false,
        message: "Name, email, and message are required",
      });
    }

    // Email validation regex
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        message: "Invalid email format",
      });
    }

    // Prepare email
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: process.env.CONTACT_EMAIL || process.env.EMAIL_USER,
      subject: `Portfolio Contact: ${subject}`,
      html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                    <h2 style="color: #333;">New Contact Form Submission</h2>
                    <div style="background: #f5f5f5; padding: 20px; border-radius: 5px;">
                        <p><strong>Name:</strong> ${name}</p>
                        <p><strong>Email:</strong> ${email}</p>
                        <p><strong>Subject:</strong> ${subject}</p>
                        <div style="margin-top: 20px;">
                            <strong>Message:</strong>
                            <p style="background: white; padding: 15px; border-radius: 3px; margin-top: 10px;">
                                ${message.replace(/\n/g, "<br>")}
                            </p>
                        </div>
                    </div>
                    <p style="color: #666; font-size: 12px; margin-top: 20px;">
                        Sent from your portfolio website
                    </p>
                </div>
            `,
      replyTo: email,
    };

    // Send email
    await transporter.sendMail(mailOptions);

    // Log the contact attempt
    console.log(`Contact form submission from ${name} (${email})`);

    // Emit real-time notification
    io.emit("new-contact", {
      name,
      email,
      timestamp: new Date(),
    });

    res.json({
      success: true,
      message: "Message sent successfully! Thank you for reaching out.",
    });
  } catch (error) {
    console.error("Contact form error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to send message. Please try again later.",
    });
  }
});

// Dynamic project data
app.get("/api/projects", (req, res) => {
  const projects = [
    {
      id: "ku-lang-compiler",
      title: "Ku-Lang Compiler",
      description:
        "Custom programming language and compiler with lexical analysis, parsing, semantic checks, and LLVM IR code generation. Complete compilation pipeline supporting control flow, functions, and typed expressions.",
      technologies: ["C", "LLVM", "Flex", "Bison", "CMake"],
      demoUrl: "#",
      codeUrl: "#",
      views: stats.projectViews["ku-lang-compiler"],
      status: "in-progress",
      featured: true,
    },
    {
      id: "options-pricing",
      title: "Options Pricing & Greeks",
      description:
        "Implemented Black-Scholes model in Python for European options pricing and Greeks computation. Validated with Monte Carlo simulations and built interactive visualization dashboard.",
      technologies: ["Python", "NumPy", "Pandas", "Matplotlib", "Jupyter"],
      demoUrl: "#",
      codeUrl: "#",
      views: stats.projectViews["options-pricing"],
      status: "completed",
      featured: true,
    },
    {
      id: "statistical-arbitrage",
      title: "Statistical Arbitrage Strategy",
      description:
        "Python-based pairs trading strategy using co-integration and z-score signals. Backtested over 2 years achieving Sharpe ratio of 1.8. Enhanced time series modeling and quantitative trading skills.",
      technologies: ["Python", "Pandas", "NumPy", "Statsmodels", "Matplotlib"],
      demoUrl: "#",
      codeUrl: "#",
      views: stats.projectViews["statistical-arbitrage"],
      status: "completed",
      featured: true,
    },
    {
      id: "8bit-computer",
      title: "8-Bit Breadboard Computer",
      description:
        "Built an 8-bit breadboard computer from scratch using discrete TTL logic. Designed ALU, control unit, and memory with custom instruction set. Validated execution with logic analyzer.",
      technologies: [
        "TTL Logic",
        "Assembly",
        "Digital Design",
        "Logic Analyzer",
      ],
      demoUrl: "#",
      codeUrl: "#",
      views: stats.projectViews["8bit-computer"],
      status: "in-progress",
      featured: true,
    },
  ];

  res.json({
    success: true,
    data: projects,
  });
});

// Skills data with progress
app.get("/api/skills", (req, res) => {
  const skills = {
    programming: [
      {
        name: "Python",
        level: 90,
        interactions: stats.skillInteractions["python"],
      },
      {
        name: "C",
        level: 85,
        interactions: stats.skillInteractions["c"],
      },
      {
        name: "Java",
        level: 80,
        interactions: stats.skillInteractions["java"],
      },
      { name: "SQL", level: 75, interactions: stats.skillInteractions["sql"] },
    ],
    datascience: [
      {
        name: "Machine Learning",
        level: 85,
        interactions: stats.skillInteractions["machinelearning"],
      },
      {
        name: "Pandas",
        level: 88,
        interactions: stats.skillInteractions["pandas"],
      },
    ],
    finance: [
      {
        name: "Options Pricing",
        level: 85,
        interactions: stats.skillInteractions["optionspricing"],
      },
      {
        name: "Statistical Arbitrage",
        level: 82,
        interactions: stats.skillInteractions["statisticalarbitrage"],
      },
    ],
    tools: [
      { name: "Git", level: 90, interactions: stats.skillInteractions["git"] },
      {
        name: "LLVM",
        level: 75,
        interactions: stats.skillInteractions["llvm"],
      },
    ],
  };

  res.json({
    success: true,
    data: skills,
  });
});

// Health check endpoint
app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    message: "Server is running",
    timestamp: new Date(),
    uptime: process.uptime(),
  });
});

// Serve main HTML file for all routes (SPA support)
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    success: false,
    message: "Something went wrong!",
    ...(process.env.NODE_ENV === "development" && { error: err.message }),
  });
});

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("SIGTERM received, shutting down gracefully");
  server.close(() => {
    console.log("Server closed");
    process.exit(0);
  });
});

process.on("SIGINT", () => {
  console.log("SIGINT received, shutting down gracefully");
  server.close(() => {
    console.log("Server closed");
    process.exit(0);
  });
});

// Start server
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📱 WebSocket server ready for real-time features`);
  console.log(`🌐 Visit: http://localhost:${PORT}`);
});

module.exports = { app, server, io };
