const { isRedisReady, getRedis } = require('../config/redis');
const { handleAudioModeration } = require('./audioModeration');

// In-memory queue (fallback when Redis is disabled)
let waitingUsers = [];
let activePairs = {};

function handleSockets(io) {
  io.on("connection", (socket) => {
    console.log("🔥 Socket connected:", socket.id);
    let currentTopic = null;
    let currentUser = null;
    let isInQueue = false;

    // Initialize audio moderation
    handleAudioModeration(io, socket);

    // 🎯 JOIN QUEUE with interest matching
    socket.on("joinQueue", async (user) => {
      console.log("📥 JOIN:", socket.id, user.interests);

      // Extract topic (first interest) - NO profanity filter
 const topic = user.interests?.[0] || 'general';
currentTopic = topic;
currentUser = {
  socketId: socket.id,
  interests: user.interests || [],
  userId: user.userId,
  timestamp: Date.now()
};

      isInQueue = true;

      // Try Redis first if enabled
      if (process.env.USE_REDIS === 'true' && isRedisReady()) {
        await handleRedisMatching(socket, currentUser, io);
      } else {
        // Use in-memory matching
        await handleInMemoryMatching(socket, currentUser, io);
      }
    });

    // 🔁 NEXT BUTTON - User wants new partner but stays in call
    socket.on("next", async () => {
      console.log(`User ${socket.id} requested next - finding new partner`);

      // Set flag for graceful disconnect
      socket.gracefulNext = true;

      // Check if currently matched
      const currentPartner = activePairs[socket.id];

      if (currentPartner) {
        // Notify current partner they've been left (they stay in call)
        io.to(currentPartner).emit("partner-left-waiting");
        console.log(`Sent partner-left-waiting to ${currentPartner}`);

        // Remove from active pairs
        delete activePairs[currentPartner];
        delete activePairs[socket.id];

        // Partner automatically rejoins queue after delay
        setTimeout(() => {
          const partnerSocket = io.sockets.sockets.get(currentPartner);
          if (partnerSocket && !activePairs[currentPartner]) {
            console.log(`Partner ${currentPartner} automatically rejoining queue`);
            io.to(currentPartner).emit("rejoin-queue");
          }
        }, 1000);
      }

      // Current user rejoins queue to find new partner
      if (currentTopic) {
        setTimeout(() => {
          if (socket.connected) {
            socket.emit("joinQueue", {
              interests: [currentTopic],
              userId: currentUser?.userId
            });
          }
        }, 500);
      }

      // Reset flag after handling
      setTimeout(() => {
        socket.gracefulNext = false;
      }, 100);
    });

    // Rejoin queue handler
    socket.on("rejoin-queue", () => {
      console.log(`User ${socket.id} rejoining queue`);
      isInQueue = true;
    });

    // OFFER handler
    socket.on("offer", ({ to, offer }) => {
      console.log(`Offer from ${socket.id} to ${to}`);
      io.to(to).emit("offer", { offer, from: socket.id });
    });

    // ANSWER handler
    socket.on("answer", ({ to, answer }) => {
      console.log(`Answer from ${socket.id} to ${to}`);
      io.to(to).emit("answer", { answer });
    });

    // ICE candidate handler
    socket.on("ice-candidate", ({ to, candidate }) => {
      io.to(to).emit("ice-candidate", { candidate });
    });

    // DISCONNECT handler
    socket.on("disconnect", () => {
      console.log("❌ Disconnected:", socket.id);

      // Remove from queue
      removeFromQueue(socket.id);
      isInQueue = false;

      // Notify partner if exists
      if (activePairs[socket.id]) {
        const partner = activePairs[socket.id];

        if (socket.gracefulNext) {
          io.to(partner).emit("partner-left-waiting");
          console.log(`Sent partner-left-waiting to ${partner}`);
        } else {
          io.to(partner).emit("partner-disconnected");
          console.log(`Sent partner-disconnected to ${partner}`);
        }

        delete activePairs[partner];
        delete activePairs[socket.id];
      }
    });
  });
}

// ============================================
// REDIS MATCHING WITH INTERESTS
// ============================================
async function handleRedisMatching(socket, user, io) {
  const redis = getRedis();
  const topic = user.interests[0] || 'general';
  const queueKey = `queue:${topic}`;

  // Check if someone is waiting in this exact topic
  let partner = await redis.lPop(queueKey);

  if (partner) {
    partner = JSON.parse(partner);

    // Calculate interest match score
    const matchScore = calculateMatchScore(user.interests, partner.interests);
    console.log(`Match score for ${topic}: ${matchScore}%`);

    if (matchScore >= 60) {
      // Good match! Connect them
      await connectUsers(io, socket.id, partner.socketId, topic, matchScore);
      return;
    } else {
      // Low score, put partner back and try fallback
      await redis.rPush(queueKey, JSON.stringify(partner));
    }
  }

  // Try fallback to cluster matching
  const clusterMatch = await findClusterMatch(redis, user, topic);
  if (clusterMatch) {
    await connectUsers(io, socket.id, clusterMatch, topic, 65);
    return;
  }

  // No match found, add to queue
  await redis.rPush(queueKey, JSON.stringify({
    socketId: socket.id,
    interests: user.interests,
    timestamp: Date.now()
  }));

  // Send waiting status
  socket.emit("waiting-status", { queueLength: await redis.lLen(queueKey) });

  // Set timeout to prevent infinite waiting
  setTimeout(async () => {
    const queueLength = await redis.lLen(queueKey);
    if (queueLength > 1) {
      const fallbackMatch = await findAnyMatch(redis, socket.id);
      if (fallbackMatch) {
        console.log(`Fallback match for ${socket.id}`);
        await connectUsers(io, socket.id, fallbackMatch, 'general', 50);
      }
    }
  }, 15000);
}

// ============================================
// IN-MEMORY MATCHING WITH INTERESTS
// ============================================
async function handleInMemoryMatching(socket, user, io) {
  // Remove existing entry
  waitingUsers = waitingUsers.filter(u => u.socketId !== socket.id);

  // Try to find a match with interest similarity
  let bestMatch = null;
  let bestScore = 0;

  for (const waiting of waitingUsers) {
    const score = calculateMatchScore(user.interests, waiting.interests);
    if (score >= 60 && score > bestScore) {
      bestScore = score;
      bestMatch = waiting;
    }
  }

  if (bestMatch) {
    // Found good match
    waitingUsers = waitingUsers.filter(u => u.socketId !== bestMatch.socketId);
    console.log(`✅ MATCH with ${bestScore}% interest match: ${user.socketId} <-> ${bestMatch.socketId}`);
    connectUsers(io, socket.id, bestMatch.socketId, user.interests[0], bestScore);
  } else {
    // No match, add to queue
    waitingUsers.push({
      socketId: socket.id,
      interests: user.interests,
      timestamp: Date.now()
    });
    console.log(`Added to queue. Queue size: ${waitingUsers.length}`);

    // Send waiting status
    socket.emit("waiting-status", { queueLength: waitingUsers.length });

    // Timeout for fallback
    setTimeout(() => {
      const stillWaiting = waitingUsers.find(u => u.socketId === socket.id);
      if (stillWaiting && waitingUsers.length > 1) {
        const fallback = waitingUsers.find(u => u.socketId !== socket.id);
        if (fallback) {
          waitingUsers = waitingUsers.filter(u => u.socketId !== fallback.socketId && u.socketId !== socket.id);
          console.log(`Fallback match: ${socket.id} <-> ${fallback.socketId}`);
          connectUsers(io, socket.id, fallback.socketId, 'general', 50);
        }
      }
    }, 15000);
  }
}

// ============================================
// INTEREST MATCHING ALGORITHM
// ============================================
function calculateMatchScore(interests1, interests2) {
  if (!interests1?.length || !interests2?.length) return 50;

  let score = 0;
  let totalChecks = 0;

  for (const interest1 of interests1) {
    for (const interest2 of interests2) {
      totalChecks++;
      const similarity = calculateInterestSimilarity(interest1, interest2);
      score += similarity;
    }
  }

  const averageScore = totalChecks > 0 ? score / totalChecks : 0;
  return Math.min(100, Math.max(0, Math.floor(averageScore)));
}

function calculateInterestSimilarity(interest1, interest2) {
  const i1 = interest1.toLowerCase().trim();
  const i2 = interest2.toLowerCase().trim();

  if (i1 === i2) return 100;

  const relatedTopics = {
    'cricket': ['sports', 'ipl', 'worldcup', 'football'],
    'football': ['sports', 'soccer', 'worldcup', 'cricket'],
    'sports': ['cricket', 'football', 'basketball', 'tennis'],
    'coding': ['programming', 'tech', 'javascript', 'python'],
    'tech': ['coding', 'programming', 'ai', 'webdev'],
    'music': ['rap', 'hiphop', 'rock', 'jazz'],
    'gaming': ['games', 'valorant', 'pubg', 'fortnite']
  };

  if (relatedTopics[i1]?.includes(i2) || relatedTopics[i2]?.includes(i1)) {
    return 70;
  }

  if (i1.includes(i2) || i2.includes(i1) ||
    i1.split(' ').some(word => i2.includes(word)) ||
    i2.split(' ').some(word => i1.includes(word))) {
    return 60;
  }

  return 0;
}

// ============================================
// CLUSTER MATCHING (Fallback)
// ============================================
async function findClusterMatch(redis, user, originalTopic) {
  const relatedTopics = {
    'cricket': ['sports', 'football'],
    'football': ['sports', 'cricket'],
    'coding': ['tech'],
    'music': ['entertainment'],
    'gaming': ['tech']
  };

  const related = relatedTopics[originalTopic] || [];

  for (const topic of related) {
    const queueKey = `queue:${topic}`;
    const partner = await redis.lPop(queueKey);
    if (partner) {
      return JSON.parse(partner).socketId;
    }
  }

  return null;
}

async function findAnyMatch(redis, excludeSocketId) {
  const keys = await redis.keys('queue:*');
  for (const key of keys) {
    const partner = await redis.lPop(key);
    if (partner) {
      const parsed = JSON.parse(partner);
      if (parsed.socketId !== excludeSocketId) {
        return parsed.socketId;
      }
    }
  }
  return null;
}

// ============================================
// CONNECT USERS
// ============================================
async function connectUsers(io, socketId1, socketId2, topic, matchScore) {
  console.log(`✅ CONNECTING: ${socketId1} <-> ${socketId2} (Match: ${matchScore}%)`);

  // Store active pairs
  activePairs[socketId1] = socketId2;
  activePairs[socketId2] = socketId1;

  // Notify both users with match score and topic
  io.to(socketId1).emit("matched", socketId2, topic);
  io.to(socketId2).emit("matched", socketId1, topic);

  // Send match quality score
  io.to(socketId1).emit("match-quality", matchScore);
  io.to(socketId2).emit("match-quality", matchScore);
}

// ============================================
// HELPER FUNCTIONS
// ============================================
function removeFromQueue(socketId) {
  waitingUsers = waitingUsers.filter(u => u.socketId !== socketId);
}

module.exports = { handleSockets };