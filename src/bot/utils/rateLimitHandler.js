class RateLimitHandler {
  constructor() {
    this.requestCounts = new Map();
    this.RATE_LIMIT = 50; // Adjust based on your bot's verification level
    this.TIME_WINDOW = 1000; // 1 second in milliseconds
  }

  async executeWithRateLimit(key, callback) {
    const now = Date.now();
    const currentCount = this.requestCounts.get(key) || { count: 0, timestamp: now };
    
    // Reset counter if time window has passed
    if (now - currentCount.timestamp > this.TIME_WINDOW) {
      currentCount.count = 0;
      currentCount.timestamp = now;
    }
    
    // Check if rate limit would be exceeded
    if (currentCount.count >= this.RATE_LIMIT) {
      const waitTime = this.TIME_WINDOW - (now - currentCount.timestamp);
      await new Promise(resolve => setTimeout(resolve, waitTime));
      return this.executeWithRateLimit(key, callback); // Retry after waiting
    }
    
    // Increment counter and execute callback
    currentCount.count++;
    this.requestCounts.set(key, currentCount);
    
    return callback();
  }
}

module.exports = new RateLimitHandler();
