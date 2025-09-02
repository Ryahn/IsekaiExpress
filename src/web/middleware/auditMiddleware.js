const { timestamp, logAudit } = require("../../libs/utils");

/**
 * Audit middleware - logs audit information for non-GET requests
 */
class AuditMiddleware {
  constructor() {
    this.defaultUserId = 9007; // Default user ID for unauthenticated requests
  }

  /**
   * Set default user ID for unauthenticated requests
   */
  setDefaultUserId(userId) {
    this.defaultUserId = userId;
  }

  /**
   * Get the audit middleware function
   */
  getMiddleware() {
    return (req, _res, next) => {
      if (req.method !== "GET") {
        const { method, originalUrl } = req;
        const userId = req.session && req.session.user ? req.session.user.id : this.defaultUserId;

        logAudit({
          userId,
          action: originalUrl,
          method,
          timestamp: timestamp(),
        });
      }
      next();
    };
  }

  /**
   * Create a custom audit middleware with specific options
   */
  createCustomMiddleware(options = {}) {
    const {
      excludeMethods = ["GET"],
      excludePaths = [],
      customUserIdExtractor = null
    } = options;

    return (req, _res, next) => {
      const { method, originalUrl, path } = req;
      
      // Check if method should be excluded
      if (excludeMethods.includes(method)) {
        return next();
      }

      // Check if path should be excluded
      if (excludePaths.some(excludePath => path.startsWith(excludePath))) {
        return next();
      }

      // Extract user ID
      let userId;
      if (customUserIdExtractor) {
        userId = customUserIdExtractor(req);
      } else {
        userId = req.session && req.session.user ? req.session.user.id : this.defaultUserId;
      }

      logAudit({
        userId,
        action: originalUrl,
        method,
        timestamp: timestamp(),
      });

      next();
    };
  }
}

module.exports = AuditMiddleware;
