// sockets/matchmaking.js
let waitingUsers = [];
let activePairs = {};

function handleSockets(io) {
  io.on("connection", (socket) => {
    console.log("🔥 Socket connected:", socket.id);

    // 🎯 JOIN QUEUE
    socket.on("joinQueue", (user) => {
      console.log(`User ${socket.id} joined queue with interests:`, user.interests);
      
      // Remove existing queue entry
      waitingUsers = waitingUsers.filter(u => u.socketId !== socket.id);
      
      waitingUsers.push({
        socketId: socket.id,
        interests: user.interests || [],
        timestamp: Date.now()
      });
      
      matchUsers(io);
    });

    // 🔁 NEXT BUTTON
    socket.on("next", () => {
      console.log(`User ${socket.id} requested next`);
      removeFromQueue(socket.id);
      disconnectPartner(socket.id, io);
      
      // Rejoin queue with existing interests (optional)
      socket.emit("queue-cleared");
    });

    // 📤 OFFER
    socket.on("offer", ({ to, offer }) => {
      console.log(`Offer from ${socket.id} to ${to}`);
      io.to(to).emit("offer", { offer, from: socket.id });
    });

    // 📥 ANSWER
    socket.on("answer", ({ to, answer }) => {
      console.log(`Answer from ${socket.id} to ${to}`);
      io.to(to).emit("answer", { answer });
    });

    // ❄️ ICE CANDIDATE
    socket.on("ice-candidate", ({ to, candidate }) => {
      io.to(to).emit("ice-candidate", { candidate });
    });

    // 🔌 DISCONNECT
    socket.on("disconnect", () => {
      console.log("❌ Disconnected:", socket.id);
      removeFromQueue(socket.id);
      disconnectPartner(socket.id, io);
    });
  });
}

// 🧠 MATCH USERS (Optimized for production)
function matchUsers(io) {
  console.log(`👥 Waiting users: ${waitingUsers.length}`);
  
  if (waitingUsers.length < 2) return;

  // Try to match by interests first
  for (let i = 0; i < waitingUsers.length; i++) {
    for (let j = i + 1; j < waitingUsers.length; j++) {
      const u1 = waitingUsers[i];
      const u2 = waitingUsers[j];
      
      const commonInterest = findCommonInterest(u1.interests, u2.interests);
      
      if (commonInterest || u1.interests.length === 0 || u2.interests.length === 0) {
        connectUsers(io, u1, u2);
        return;
      }
    }
  }
  
  // Fallback: random match
  if (waitingUsers.length >= 2) {
    console.log("No interest match, using random fallback");
    const u1 = waitingUsers.shift();
    const u2 = waitingUsers.shift();
    connectUsers(io, u1, u2);
  }
}

// Helper to find common interests
function findCommonInterest(interests1, interests2) {
  return interests1.some(i => interests2.includes(i.toLowerCase()));
}

// 🔗 CONNECT TWO USERS
function connectUsers(io, u1, u2) {
  // Remove from waiting queue
  waitingUsers = waitingUsers.filter(
    u => u.socketId !== u1.socketId && u.socketId !== u2.socketId
  );
  
  // Store active pairs
  activePairs[u1.socketId] = u2.socketId;
  activePairs[u2.socketId] = u1.socketId;
  
  // Notify both users
  io.to(u1.socketId).emit("matched", u2.socketId);
  io.to(u2.socketId).emit("matched", u1.socketId);
  
  console.log(`✅ MATCHED: ${u1.socketId} <-> ${u2.socketId}`);
}

// ❌ REMOVE FROM QUEUE
function removeFromQueue(socketId) {
  waitingUsers = waitingUsers.filter(u => u.socketId !== socketId);
}

// 🔌 HANDLE DISCONNECT
function disconnectPartner(socketId, io) {
  const partnerId = activePairs[socketId];
  
  if (partnerId) {
    console.log(`Disconnecting partner ${partnerId} from ${socketId}`);
    io.to(partnerId).emit("partner-disconnected");
    delete activePairs[partnerId];
    delete activePairs[socketId];
  }
}

// Clean up inactive users (optional - runs every minute)
setInterval(() => {
  const now = Date.now();
  const timeout = 30000; // 30 seconds
  const staleUsers = waitingUsers.filter(u => now - u.timestamp > timeout);
  
  staleUsers.forEach(user => {
    console.log(`Removing stale user ${user.socketId} from queue`);
    waitingUsers = waitingUsers.filter(u => u.socketId !== user.socketId);
  });
}, 30000);

module.exports = { handleSockets };