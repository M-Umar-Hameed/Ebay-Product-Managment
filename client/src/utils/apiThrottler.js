class ApiThrottler {
  constructor() {
    this.lastCalls = new Map();
    this.pendingCalls = new Map();
  }

  // Throttle API calls to prevent excessive requests
  async throttledCall(key, apiFunction, minInterval = 30000) {
    // 30 seconds default
    const now = Date.now();
    const lastCall = this.lastCalls.get(key);

    // If we just made this call recently, return cached result or wait
    if (lastCall && now - lastCall.timestamp < minInterval) {
      console.log(
        `🚫 Throttling API call: ${key} (called ${Math.round(
          (now - lastCall.timestamp) / 1000
        )}s ago)`
      );

      // If there's a pending call for this key, wait for it
      if (this.pendingCalls.has(key)) {
        return await this.pendingCalls.get(key);
      }

      // Return last result if available
      if (lastCall.result) {
        return lastCall.result;
      }
    }

    // Make the API call
    console.log(`✅ Making API call: ${key}`);
    const callPromise = apiFunction();
    this.pendingCalls.set(key, callPromise);

    try {
      const result = await callPromise;

      // Cache the result
      this.lastCalls.set(key, {
        timestamp: now,
        result: result,
      });

      return result;
    } catch (error) {
      console.error(`❌ API call failed: ${key}`, error);
      throw error;
    } finally {
      this.pendingCalls.delete(key);
    }
  }

  // Clear throttle cache for a specific key
  clearCache(key) {
    this.lastCalls.delete(key);
    this.pendingCalls.delete(key);
  }

  // Clear all cache
  clearAllCache() {
    this.lastCalls.clear();
    this.pendingCalls.clear();
  }

  // Get throttle status
  getStatus() {
    return {
      cachedCalls: Array.from(this.lastCalls.keys()),
      pendingCalls: Array.from(this.pendingCalls.keys()),
      totalCached: this.lastCalls.size,
    };
  }
}

// Export singleton instance
export default new ApiThrottler();
