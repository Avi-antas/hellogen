require("dotenv").config();

const express = require("express");
const http = require("http");
const cors = require("cors");
const socketIo = require("socket.io");

const connectDB = require("./config/db");
const { connectRedis, disconnectRedis, isRedisReady } = require("./config/redis");
const authRoutes = require("./routes/auth");
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

// 🧩 Middlewares
app.use(cors({
  origin: process.env.FRONTEND_URL || "*",
  credentials: true
}));
app.use(express.json());

// 🛣 Routes
app.use("/auth", authRoutes);

// 🩺 Health Check with Redis status
app.get("/", (req, res) => {
  res.json({
    status: "OK",
    message: "Video Chat API is running",
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
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// 🔗 Handle WebSocket connections
handleSockets(io);

// 🚀 Start Server
const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📡 Redis mode: ${process.env.USE_REDIS === 'true' ? 'ENABLED' : 'DISABLED'}`);
  console.log(`💾 Redis status: ${isRedisReady() ? 'Connected' : 'Not connected/fallback'}`);
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