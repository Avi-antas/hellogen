const { isRedisReady, getRedis } = require('../config/redis');
const { handleAudioModeration } = require('./audioModeration');

// In-memory queue (fallback when Redis is disabled)
let waitingUsers = [];
let activePairs = {};

// ✅ ACTIVE USERS TRACKING (Global scope)
let activeUsers = new Map(); // socketId -> { topic, userId, avatar, name }
let topicUsers = new Map(); // topic -> Set of socketIds

// ✅ Function to broadcast active users count to all clients
function broadcastActiveUsers(io) {
  const activeTopics = {};
  
  for (const [topic, users] of topicUsers) {
    const userList = [];
    for (const socketId of users) {
      const user = activeUsers.get(socketId);
      if (user) {
        userList.push({
          avatar: user.avatar || '😎',
          name: user.name || 'User'
        });
      }
    }
    
    activeTopics[topic] = {
      count: userList.length,
      users: userList.slice(0, 5).map(u => u.avatar)
    };
  }
  
  console.log('📊 Broadcasting active users:', activeTopics);
  io.emit('active-users-update', { topics: activeTopics });
}

function handleSockets(io) {
  io.on("connection", (socket) => {
    console.log("🔥 Socket connected:", socket.id);
    let currentTopic = null;
    let currentUser = null;
    let isInQueue = false;

    // Initialize audio moderation
    handleAudioModeration(io, socket);

    // ✅ Handle get-active-users request
    socket.on("get-active-users", () => {
      const activeTopics = {};
      
      for (const [topic, users] of topicUsers) {
        const userList = [];
        for (const socketId of users) {
          const user = activeUsers.get(socketId);
          if (user) {
            userList.push({
              avatar: user.avatar || '😎',
              name: user.name || 'User'
            });
          }
        }
        
        activeTopics[topic] = {
          count: userList.length,
          users: userList.slice(0, 5).map(u => u.avatar)
        };
      }
      
      socket.emit('active-users-data', { topics: activeTopics });
    });

    // 🎯 JOIN QUEUE with interest matching
    socket.on("joinQueue", async (user) => {
      console.log("📥 JOIN:", socket.id, user.interests);

      const topic = user.interests?.[0] || 'general';
      currentTopic = topic;
      currentUser = {
        socketId: socket.id,
        interests: user.interests || [],
        userId: user.userId,
        avatar: user.avatar || '😎',
        name: user.name || 'Explorer',
        timestamp: Date.now()
      };

      // ✅ TRACK ACTIVE USER
      activeUsers.set(socket.id, {
        topic: topic,
        userId: user.userId,
        avatar: user.avatar || '😎',
        name: user.name || 'Explorer',
        timestamp: Date.now()
      });
      
      // Add to topic users
      if (!topicUsers.has(topic)) {
        topicUsers.set(topic, new Set());
      }
      topicUsers.get(topic).add(socket.id);
      
      // ✅ Broadcast updated active users
      broadcastActiveUsers(io);

      isInQueue = true;

      // Try Redis first if enabled
      if (process.env.USE_REDIS === 'true' && isRedisReady()) {
        await handleRedisMatching(socket, currentUser, io);
      } else {
        await handleInMemoryMatching(socket, currentUser, io);
      }
    });

    // 🔁 NEXT BUTTON / SCROLL
    socket.on("next", async () => {
      console.log(`🔄 User ${socket.id} requested next - finding new partner`);
      socket.gracefulNext = true;

      const currentPartner = activePairs[socket.id];

      if (currentPartner) {
        io.to(currentPartner).emit("partner-disconnected");
        console.log(`📢 Sent partner-disconnected to ${currentPartner}`);
        delete activePairs[currentPartner];
        delete activePairs[socket.id];
      }

      removeFromQueue(socket.id);

      setTimeout(() => {
        if (socket.connected && currentTopic) {
          console.log(`🔄 User ${socket.id} rejoining queue with topic: ${currentTopic}`);
          socket.emit("rejoin-queue");
          
          if (process.env.USE_REDIS === 'true' && isRedisReady()) {
            handleRedisMatching(socket, currentUser, io);
          } else {
            handleInMemoryMatching(socket, currentUser, io);
          }
        }
      }, 300);
    });

    socket.on("rejoin-queue", () => {
      console.log(`User ${socket.id} rejoining queue`);
      isInQueue = true;
    });

    socket.on("offer", ({ to, offer }) => {
      console.log(`📤 Offer from ${socket.id} to ${to}`);
      io.to(to).emit("offer", { offer, from: socket.id, partnerInfo: { avatar: currentUser?.avatar || '😎', name: currentUser?.name || 'User' } });
    });

    socket.on("answer", ({ to, answer }) => {
      console.log(`📥 Answer from ${socket.id} to ${to}`);
      io.to(to).emit("answer", { answer });
    });

    socket.on("ice-candidate", ({ to, candidate }) => {
      console.log(`❄️ ICE candidate from ${socket.id} to ${to}`);
      io.to(to).emit("ice-candidate", { candidate, from: socket.id });
    });

    socket.on("disconnect", () => {
      console.log("❌ Disconnected:", socket.id);

      // ✅ Remove from active users
      if (activeUsers.has(socket.id)) {
        const user = activeUsers.get(socket.id);
        const topic = user.topic;
        
        activeUsers.delete(socket.id);
        
        if (topic && topicUsers.has(topic)) {
          topicUsers.get(topic).delete(socket.id);
          if (topicUsers.get(topic).size === 0) {
            topicUsers.delete(topic);
          }
        }
        
        // ✅ Broadcast updated active users
        broadcastActiveUsers(io);
      }

      removeFromQueue(socket.id);
      isInQueue = false;

      if (activePairs[socket.id]) {
        const partner = activePairs[socket.id];
        io.to(partner).emit("partner-disconnected");
        delete activePairs[partner];
        delete activePairs[socket.id];
      }
    });
  });
}

// ============================================
// CLEANUP REDIS QUEUE
// ============================================
async function cleanupRedisQueue(socketId) {
  if (!isRedisReady()) return;
  const redis = getRedis();
  const keys = await redis.keys('queue:*');
  
  for (const key of keys) {
    const queue = await redis.lRange(key, 0, -1);
    for (const item of queue) {
      const parsed = JSON.parse(item);
      if (parsed.socketId === socketId) {
        await redis.lRem(key, 1, item);
        console.log(`🧹 Removed ${socketId} from Redis queue ${key}`);
      }
    }
  }
}

// ============================================
// REDIS MATCHING WITH INTERESTS
// ============================================
async function handleRedisMatching(socket, user, io) {
  if (!isRedisReady()) {
    return handleInMemoryMatching(socket, user, io);
  }
  
  const redis = getRedis();
  const topic = user.interests[0] || 'general';
  const queueKey = `queue:${topic}`;

  let partner = await redis.lPop(queueKey);

  if (partner) {
    partner = JSON.parse(partner);
    const matchScore = calculateMatchScore(user.interests, partner.interests);
    console.log(`Match score for ${topic}: ${matchScore}%`);

    if (matchScore >= 60) {
      await connectUsers(io, socket.id, partner.socketId, topic, matchScore, user, partner);
      return;
    } else {
      await redis.rPush(queueKey, JSON.stringify(partner));
    }
  }

  const clusterMatch = await findClusterMatch(redis, user, topic);
  if (clusterMatch) {
    await connectUsers(io, socket.id, clusterMatch, topic, 65, user);
    return;
  }

  await redis.rPush(queueKey, JSON.stringify({
    socketId: socket.id,
    interests: user.interests,
    userId: user.userId,
    avatar: user.avatar,
    name: user.name,
    timestamp: Date.now()
  }));

  socket.emit("waiting-status", { queueLength: await redis.lLen(queueKey) });

  setTimeout(async () => {
    const queueLength = await redis.lLen(queueKey);
    if (queueLength > 1) {
      const fallbackMatch = await findAnyMatch(redis, socket.id);
      if (fallbackMatch) {
        console.log(`Fallback match for ${socket.id}`);
        await connectUsers(io, socket.id, fallbackMatch, 'general', 50, user);
      }
    }
  }, 15000);
}

// ============================================
// IN-MEMORY MATCHING WITH INTERESTS
// ============================================
async function handleInMemoryMatching(socket, user, io) {
  waitingUsers = waitingUsers.filter(u => u.socketId !== socket.id);

  let bestMatch = null;
  let bestScore = 0;

  for (const waiting of waitingUsers) {
    // Skip matching with self
    if (waiting.userId === user.userId && waiting.userId) {
      continue;
    }
    
    const score = calculateMatchScore(user.interests, waiting.interests);
    if (score >= 60 && score > bestScore) {
      bestScore = score;
      bestMatch = waiting;
    }
  }

  if (bestMatch) {
    waitingUsers = waitingUsers.filter(u => u.socketId !== bestMatch.socketId);
    console.log(`✅ MATCH with ${bestScore}% interest match: ${user.socketId} <-> ${bestMatch.socketId}`);
    connectUsers(io, socket.id, bestMatch.socketId, user.interests[0], bestScore, user, bestMatch);
  } else {
    waitingUsers.push({
      socketId: socket.id,
      interests: user.interests,
      userId: user.userId,
      avatar: user.avatar || '😎',
      name: user.name || 'Explorer',
      timestamp: Date.now()
    });
    console.log(`Added to queue. Queue size: ${waitingUsers.length}`);
    socket.emit("waiting-status", { queueLength: waitingUsers.length });
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
  if (!interest1 || !interest2) return 0;
  
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
// CLUSTER MATCHING
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
async function connectUsers(io, socketId1, socketId2, topic, matchScore, user1, user2) {
  console.log(`✅ CONNECTING: ${socketId1} <-> ${socketId2} (Match: ${matchScore}%)`);

  activePairs[socketId1] = socketId2;
  activePairs[socketId2] = socketId1;

  const user1Data = user1 || { avatar: '😎', name: 'You' };
  const user2Data = user2 || { avatar: '🦊', name: 'Partner' };

  io.to(socketId1).emit("matched", socketId2, topic, {
    avatar: user2Data.avatar,
    name: user2Data.name
  });
  
  io.to(socketId2).emit("matched", socketId1, topic, {
    avatar: user1Data.avatar,
    name: user1Data.name
  });

  io.to(socketId1).emit("match-quality", matchScore);
  io.to(socketId2).emit("match-quality", matchScore);
}

// ============================================
// HELPER FUNCTIONS
// ============================================
function removeFromQueue(socketId) {
  waitingUsers = waitingUsers.filter(u => u.socketId !== socketId);
  
  // ✅ Also remove from active users if not already removed
  if (activeUsers.has(socketId)) {
    const user = activeUsers.get(socketId);
    const topic = user.topic;
    
    activeUsers.delete(socketId);
    
    if (topic && topicUsers.has(topic)) {
      topicUsers.get(topic).delete(socketId);
      if (topicUsers.get(topic).size === 0) {
        topicUsers.delete(topic);
      }
    }
  }
}

module.exports = { handleSockets };