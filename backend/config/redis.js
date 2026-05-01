// This is NEW - won't affect existing code
const redis = require('redis');

let redisClient = null;
let isRedisAvailable = false;

async function connectRedis() {
  // Only connect if USE_REDIS is true
  if (process.env.USE_REDIS !== 'true') {
    console.log('⚠️ Redis disabled (USE_REDIS=false), using in-memory queues');
    return null;
  }

  if (redisClient) return redisClient;

  try {
    // Determine which URL to use
    let redisUrl = process.env.REDIS_URL;
    
    if (process.env.NODE_ENV === 'production') {
      redisUrl = process.env.REDIS_PROD_URL;
    } else {
      redisUrl = process.env.REDIS_LOCAL_URL;
    }
    
    if (!redisUrl) {
      console.log('⚠️ No Redis URL configured, using in-memory queues');
      return null;
    }
    
    redisClient = redis.createClient({
      url: redisUrl,
      socket: {
        reconnectStrategy: (retries) => {
          if (retries > 5) {
            console.error('Redis max reconnection attempts reached');
            return false;
          }
          return Math.min(retries * 100, 3000);
        }
      }
    });

    redisClient.on('connect', () => {
      console.log('✅ Redis connected successfully');
      isRedisAvailable = true;
    });

    redisClient.on('error', (err) => {
      console.error('❌ Redis error:', err.message);
      isRedisAvailable = false;
    });

    await redisClient.connect();
    return redisClient;
  } catch (error) {
    console.error('Failed to connect to Redis:', error.message);
    isRedisAvailable = false;
    return null;
  }
}

async function disconnectRedis() {
  if (redisClient) {
    await redisClient.quit();
    console.log('Redis disconnected');
  }
}

function getRedis() {
  return redisClient;
}

function isRedisReady() {
  return isRedisAvailable && redisClient && redisClient.isReady;
}

module.exports = { connectRedis, disconnectRedis, getRedis, isRedisReady };