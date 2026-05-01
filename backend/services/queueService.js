// NEW service - only used when Redis is enabled
const { getRedis, isRedisReady } = require('../config/redis');

class QueueService {
  // In-memory fallback when Redis is not available
  static memoryQueues = new Map();
  
  static async addToQueue(socketId, topic, userId = null) {
    // Use Redis if available
    if (isRedisReady()) {
      const redis = getRedis();
      const queueKey = `queue:${topic}`;
      await redis.rPush(queueKey, JSON.stringify({ socketId, userId, timestamp: Date.now() }));
      return true;
    }
    
    // Fallback to in-memory
    if (!this.memoryQueues.has(topic)) {
      this.memoryQueues.set(topic, []);
    }
    this.memoryQueues.get(topic).push({ socketId, userId, timestamp: Date.now() });
    return true;
  }
  
  static async popFromQueue(topic) {
    // Use Redis if available
    if (isRedisReady()) {
      const redis = getRedis();
      const queueKey = `queue:${topic}`;
      const user = await redis.lPop(queueKey);
      return user ? JSON.parse(user) : null;
    }
    
    // Fallback to in-memory
    const queue = this.memoryQueues.get(topic) || [];
    return queue.shift() || null;
  }
  
  static async removeFromQueue(socketId, topic) {
    // Use Redis if available
    if (isRedisReady()) {
      const redis = getRedis();
      const queueKey = `queue:${topic}`;
      const users = await redis.lRange(queueKey, 0, -1);
      for (let i = 0; i < users.length; i++) {
        const user = JSON.parse(users[i]);
        if (user.socketId === socketId) {
          await redis.lRem(queueKey, 1, users[i]);
          break;
        }
      }
      return;
    }
    
    // Fallback to in-memory
    const queue = this.memoryQueues.get(topic) || [];
    const index = queue.findIndex(u => u.socketId === socketId);
    if (index !== -1) queue.splice(index, 1);
  }
  
  static async getQueueLength(topic) {
    if (isRedisReady()) {
      const redis = getRedis();
      const queueKey = `queue:${topic}`;
      return await redis.lLen(queueKey);
    }
    
    const queue = this.memoryQueues.get(topic) || [];
    return queue.length;
  }
}

module.exports = QueueService;