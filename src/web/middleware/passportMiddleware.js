const passport = require("passport");

/**
 * Passport middleware - handles Passport.js initialization and user serialization
 */
class PassportMiddleware {
  constructor() {
    this.initialized = false;
  }

  /**
   * Initialize Passport configuration
   */
  initialize() {
    if (this.initialized) {
      return;
    }

    // User serialization - store user in session
    passport.serializeUser((user, done) => {
      done(null, user);
    });

    // User deserialization - retrieve user from session
    passport.deserializeUser((user, done) => {
      const { email, accessToken, ...safeUser } = user;
      done(null, safeUser);
    });

    this.initialized = true;
  }

  /**
   * Get Passport initialization middleware
   */
  getInitializeMiddleware() {
    this.initialize();
    return passport.initialize();
  }

  /**
   * Get Passport session middleware
   */
  getSessionMiddleware() {
    this.initialize();
    return passport.session();
  }

  /**
   * Get all Passport middleware in correct order
   */
  getAllMiddleware() {
    return [
      this.getInitializeMiddleware(),
      this.getSessionMiddleware()
    ];
  }
}

module.exports = PassportMiddleware;
