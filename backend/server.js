require("dotenv").config();

const express = require("express");
const http = require("http");
const cors = require("cors");
const socketIo = require("socket.io");

const connectDB = require("./config/db");
const authRoutes = require("./routes/auth");
const { handleSockets } = require("./sockets/matchmaking");

const app = express();

// 🔌 Connect Database
connectDB();

// 🧩 Middlewares
app.use(cors());
app.use(express.json());

// 🛣 Routes
app.use("/auth", authRoutes);

// 🩺 Health Check Route (useful for deployment)
app.get("/", (req, res) => {
  res.send("API is running...");
});

// 🌐 Create HTTP server
const server = http.createServer(app);

// ⚡ Setup Socket.IO
const io = socketIo(server, {
  cors: {
    origin: "*", // later restrict to frontend URL
    methods: ["GET", "POST"]
  }
});

// 🔗 Handle WebSocket connections
handleSockets(io);

// 🚀 Start Server
const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});