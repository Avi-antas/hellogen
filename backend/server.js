require("dotenv").config();

const express = require("express");
const http = require("http");
const cors = require("cors");
const socketIo = require("socket.io");
const helmet = require("helmet");
const compression = require("compression");
const rateLimit = require("express-rate-limit");

const connectDB = require("./config/db");
const { connectRedis, disconnectRedis, isRedisReady } = require("./config/redis");
const authRoutes = require("./routes/auth");
const reportRoutes = require("./routes/report");
const { handleSockets } = require("./sockets/matchmaking");

const app = express();

// 🔌 Connect Database
connectDB();

// 🔌 Connect Redis (optional - won't break if fails)
if (process.env.USE_REDIS === 'true') {
  connectRedis().catch(err => {
    console.log('Redis connection failed, using fallback mode');
  });
}

// 🛡️ Security Middleware
app.use(helmet());
app.use(compression());
app.use(express.json());

// 🌐 CORS Configuration
const allowedOrigins = [
  'http://localhost:5500',
  'http://127.0.0.1:5500',
  'http://localhost:5000',
  'https://hellogen.vercel.app',
  process.env.FRONTEND_URL
].filter(Boolean);

app.use(cors({
  origin: function(origin, callback) {
    if (!origin) return callback(null, true);
    if (allowedOrigins.indexOf(origin) !== -1 || process.env.NODE_ENV !== 'production') {
      callback(null, true);
    } else {
      console.log('Blocked CORS origin:', origin);
      callback(null, false);
    }
  },
  credentials: true
}));

// ⏱️ Rate limiting for auth routes
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.'
});
app.use('/auth', authLimiter);

// 🛣 Routes
app.use("/auth", authRoutes);
app.use("/api/report", reportRoutes);

// 🩺 Health Check
app.get("/", (req, res) => {
  res.json({
    status: "OK",
    message: "Hellogen API is running",
    redis: isRedisReady() ? "connected" : "disabled",
    useRedis: process.env.USE_REDIS === 'true',
    timestamp: new Date().toISOString()
  });
});

// 🌐 Create HTTP server
const server = http.createServer(app);

// ⚡ Setup Socket.IO
const io = socketIo(server, {
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST"],
    credentials: true
  },
  transports: ['websocket', 'polling'],
  pingTimeout: 60000,
  pingInterval: 25000
});

// 🔗 Handle WebSocket connections
handleSockets(io);

// ❌ Error handling middleware (must be last)
app.use((err, req, res, next) => {
  console.error('Error:', err.stack);
  res.status(500).json({ 
    error: 'Something went wrong!',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// 🚀 Start Server
const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📡 Redis mode: ${process.env.USE_REDIS === 'true' ? 'ENABLED' : 'DISABLED'}`);
  console.log(`💾 Redis status: ${isRedisReady() ? 'Connected' : 'Not connected/fallback'}`);
  console.log(`🌐 Environment: ${process.env.NODE_ENV || 'development'}`);
});

// Graceful shutdown
process.on("SIGTERM", async () => {
  console.log("SIGTERM received, closing server...");
  if (isRedisReady()) {
    await disconnectRedis();
  }
  server.close(() => {
    console.log("Server closed");
    process.exit(0);
  });
});

process.on("SIGINT", async () => {
  console.log("SIGINT received, closing server...");
  if (isRedisReady()) {
    await disconnectRedis();
  }
  server.close(() => {
    console.log("Server closed");
    process.exit(0);
  });
});