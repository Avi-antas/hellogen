require("dotenv").config();

const express = require("express");
const http = require("http");
const cors = require("cors");
const socketIo = require("socket.io");

const connectDB = require("./config/db");
const authRoutes = require("./routes/auth");
const { handleSockets } = require("./sockets/matchmaking");

const app = express();

// 🔌 Connect Database - Fix: Use MONGO_URI
connectDB();

// CORS configuration - EXACT for your Vercel URL
const allowedOrigins = [
  'https://project-g01sz-eo9megnw9-avi-antas-projects.vercel.app',
  'https://project-g01sz-eo9megnw9-avi-antas-projects.vercel.app/',
  'http://localhost:5500',
  'http://localhost:5000'
];

app.use(cors({
  origin: function(origin, callback) {
    // Allow requests with no origin (like mobile apps, curl)
    if (!origin) return callback(null, true);
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      console.log('Blocked origin:', origin);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

// 🛣 Routes
app.use("/auth", authRoutes);

// 🩺 Health Check Route
app.get("/", (req, res) => {
  res.json({ 
    status: "OK", 
    message: "Video Chat API is running",
    timestamp: new Date().toISOString()
  });
});

// 🌐 Create HTTP server
const server = http.createServer(app);

// ⚡ Setup Socket.IO
const io = socketIo(server, {
  cors: {
    origin: process.env.FRONTEND_URL || "*",
    methods: ["GET", "POST"],
    credentials: true
  },
  transports: ["websocket", "polling"], // Allow both for better compatibility
  pingTimeout: 60000,
  pingInterval: 25000
});

// 🔗 Handle WebSocket connections
handleSockets(io);

// 🚀 Start Server
const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📡 Environment: ${process.env.NODE_ENV || "development"}`);
  console.log(`🗄️ MongoDB URI: ${process.env.MONGO_URI ? "Configured ✓" : "Missing ✗"}`);
});

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("SIGTERM received, closing server...");
  server.close(() => {
    console.log("Server closed");
    process.exit(0);
  });
});