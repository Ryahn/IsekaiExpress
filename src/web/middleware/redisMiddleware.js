const { createClient } = require("redis");
const logger = require("silly-logger");
const config = require("../../config/.config");

/**
 * Redis middleware - handles Redis client creation, connection, and lifecycle
 */
class RedisMiddleware {
  constructor() {
    this.client = null;
  }

  /**
   * Initialize Redis client with configuration
   */
  initialize() {
    this.client = createClient({
      socket: {
        host: config.redis.host,
        port: config.redis.port,
        reconnectStrategy(retries) {
          return Math.min(retries * 100, 3000);
        },
        connectTimeout: config.redis.connectTimeoutMs || 10000,
      },
    });

    this.setupEventHandlers();
    this.setupGracefulShutdown();
    
    return this.client;
  }

  /**
   * Setup Redis event handlers
   */
  setupEventHandlers() {
    this.client.on("connect", () => logger.startup("Redis: connecting..."));
    this.client.on("ready", () => logger.success("Redis: ready"));
    this.client.on("end", () => logger.warn("Redis: connection closed"));
    this.client.on("reconnecting", () => logger.warn("Redis: reconnecting..."));
    this.client.on("error", (err) => logger.error("Redis error:", err));
  }

  /**
   * Setup graceful shutdown handlers
   */
  setupGracefulShutdown() {
    const closeRedis = async () => {
      try {
        await this.client.quit();
      } catch (err) {
        logger.error("Redis shutdown error:", err);
      }
    };

    process.on("SIGINT", async () => {
      await closeRedis();
      process.exit(0);
    });
    
    process.on("SIGTERM", async () => {
      await closeRedis();
      process.exit(0);
    });
  }

  /**
   * Connect to Redis
   */
  async connect() {
    try {
      await this.client.connect();
    } catch (err) {
      logger.error("Redis initial connect failed:", err);
      process.exit(1);
    }
  }

  /**
   * Get Redis client instance
   */
  getClient() {
    return this.client;
  }
}

module.exports = RedisMiddleware;
