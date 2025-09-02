const session = require("express-session");
const RedisStore = require("connect-redis").default;
const config = require("../../config/.config");

/**
 * Session middleware - handles session configuration and Redis store setup
 */
class SessionMiddleware {
  constructor(redisClient) {
    this.redisClient = redisClient;
    this.redisStore = null;
  }

  /**
   * Initialize Redis store
   */
  initializeStore() {
    this.redisStore = new RedisStore({
      client: this.redisClient,
      prefix: config.redis.keyPrefix || "f95bot:",
      // ttl: 86400,                 // optionally fix TTL (seconds); defaults to cookie maxAge
      // disableTouch: false,        // set true to avoid resetting TTL on every request
    });

    return this.redisStore;
  }

  /**
   * Get session configuration
   */
  getSessionConfig() {
    return {
      store: this.redisStore,
      secret: config.session.secret,
      resave: false,
      saveUninitialized: false,
      cookie: {
        secure: !!config.session.cookieSecure,  // true when behind HTTPS
        httpOnly: true,
        sameSite: config.session.sameSite || "lax",
        maxAge: config.session.cookieMaxAgeMs || 1000 * 60 * 60 * 24,
      },
      name: "f95.sid",
    };
  }

  /**
   * Get Express session middleware
   */
  getMiddleware() {
    if (!this.redisStore) {
      this.initializeStore();
    }
    
    return session(this.getSessionConfig());
  }
}

module.exports = SessionMiddleware;
