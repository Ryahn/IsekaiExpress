const logger = require("silly-logger");

/**
 * Authentication middleware - validates session expiration and redirects to login if needed
 */
class AuthMiddleware {
  constructor(options = {}) {
    this.excludePaths = options.excludePaths || ["/auth/login", "/auth/discord/callback"];
    this.loginPath = options.loginPath || "/auth/login";
    this.sessionExpiryField = options.sessionExpiryField || "expires";
  }

  /**
   * Set paths that should be excluded from authentication
   */
  setExcludePaths(paths) {
    this.excludePaths = paths;
  }

  /**
   * Set the login redirect path
   */
  setLoginPath(path) {
    this.loginPath = path;
  }

  /**
   * Set the session expiry field name
   */
  setSessionExpiryField(field) {
    this.sessionExpiryField = field;
  }

  /**
   * Check if a path should be excluded from authentication
   */
  isExcludedPath(path) {
    return this.excludePaths.some(excludePath => path === excludePath);
  }

  /**
   * Check if session is expired
   */
  isSessionExpired(session) {
    if (!session || !session[this.sessionExpiryField]) {
      return true;
    }
    return Date.now() > session[this.sessionExpiryField];
  }

  /**
   * Get the authentication middleware function
   */
  getMiddleware() {
    return (req, res, next) => {
      // Check if path should be excluded
      if (this.isExcludedPath(req.path)) {
        return next();
      }

      // Check if session exists and is not expired
      if (req.session && !this.isSessionExpired(req.session)) {
        return next();
      }

      // Session is expired or doesn't exist, destroy it and redirect
      if (req.session) {
        return req.session.destroy((err) => {
          if (err) {
            logger.error("Session destruction error:", err);
          }
          return res.redirect(this.loginPath);
        });
      }

      // No session, redirect to login
      return res.redirect(this.loginPath);
    };
  }

  /**
   * Create a custom authentication middleware with specific options
   */
  createCustomMiddleware(options = {}) {
    const {
      excludePaths = this.excludePaths,
      loginPath = this.loginPath,
      sessionExpiryField = this.sessionExpiryField,
      customSessionValidator = null,
      customRedirectHandler = null
    } = options;

    return (req, res, next) => {
      // Check if path should be excluded
      if (excludePaths.some(excludePath => req.path === excludePath)) {
        return next();
      }

      // Use custom validator if provided
      if (customSessionValidator) {
        const isValid = customSessionValidator(req);
        if (isValid) {
          return next();
        }
      } else {
        // Default session validation
        if (req.session && !this.isSessionExpired(req.session)) {
          return next();
        }
      }

      // Handle redirect with custom handler if provided
      if (customRedirectHandler) {
        return customRedirectHandler(req, res, next);
      }

      // Default redirect handling
      if (req.session) {
        return req.session.destroy((err) => {
          if (err) {
            logger.error("Session destruction error:", err);
          }
          return res.redirect(loginPath);
        });
      }

      return res.redirect(loginPath);
    };
  }
}

module.exports = AuthMiddleware;
