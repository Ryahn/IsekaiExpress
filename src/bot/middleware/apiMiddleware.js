/**
 * Middleware for handling API rate limits
 */
const executeWithRateLimit = async (client, key, callback) => {
  return client.rateLimitHandler.executeWithRateLimit(key, callback);
};

module.exports = {
  executeWithRateLimit
}; 