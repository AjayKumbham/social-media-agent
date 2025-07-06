
interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
  platformLimits?: Record<string, { requests: number; window: number }>;
}

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

export class RateLimiter {
  private limits: Map<string, RateLimitEntry> = new Map();
  private config: RateLimitConfig;

  constructor(config: RateLimitConfig) {
    this.config = config;
  }

  async checkLimit(key: string, platform?: string): Promise<{ allowed: boolean; retryAfter?: number }> {
    const now = Date.now();
    const limit = this.getLimit(platform);
    
    const entry = this.limits.get(key);
    
    if (!entry || now >= entry.resetTime) {
      // New window or expired entry
      this.limits.set(key, {
        count: 1,
        resetTime: now + limit.window
      });
      return { allowed: true };
    }

    if (entry.count >= limit.requests) {
      // Rate limit exceeded
      const retryAfter = Math.ceil((entry.resetTime - now) / 1000);
      console.warn(`🚫 Rate limit exceeded for ${key} (${platform || 'default'}). Retry after ${retryAfter}s`);
      return { allowed: false, retryAfter };
    }

    // Increment counter
    entry.count++;
    return { allowed: true };
  }

  private getLimit(platform?: string) {
    if (platform && this.config.platformLimits?.[platform]) {
      const platformLimit = this.config.platformLimits[platform];
      return { requests: platformLimit.requests, window: platformLimit.window };
    }
    return { requests: this.config.maxRequests, window: this.config.windowMs };
  }

  // Get current usage for a key
  getUsage(key: string): { count: number; limit: number; resetTime: number } | null {
    const entry = this.limits.get(key);
    if (!entry || Date.now() >= entry.resetTime) {
      return null;
    }
    
    return {
      count: entry.count,
      limit: this.config.maxRequests,
      resetTime: entry.resetTime
    };
  }

  // Clean up expired entries
  cleanup() {
    const now = Date.now();
    let cleaned = 0;
    
    for (const [key, entry] of this.limits.entries()) {
      if (now >= entry.resetTime) {
        this.limits.delete(key);
        cleaned++;
      }
    }
    
    if (cleaned > 0) {
      console.log(`🧹 Cleaned up ${cleaned} expired rate limit entries`);
    }
  }

  // Get stats for monitoring
  getStats() {
    const now = Date.now();
    const active = Array.from(this.limits.values()).filter(entry => now < entry.resetTime);
    
    return {
      totalEntries: this.limits.size,
      activeEntries: active.length,
      avgUsage: active.length > 0 ? active.reduce((sum, entry) => sum + entry.count, 0) / active.length : 0
    };
  }
}

// Platform-specific rate limits based on their APIs
export const globalRateLimiter = new RateLimiter({
  maxRequests: 100,
  windowMs: 3600000, // 1 hour
  platformLimits: {
    twitter: { requests: 300, window: 900000 }, // 300 per 15 minutes
    linkedin: { requests: 100, window: 3600000 }, // 100 per hour
    instagram: { requests: 200, window: 3600000 }, // 200 per hour
    youtube: { requests: 10000, window: 86400000 }, // 10k per day
    reddit: { requests: 60, window: 60000 }, // 60 per minute
    hashnode: { requests: 1000, window: 3600000 }, // 1k per hour
    devto: { requests: 1000, window: 3600000 } // 1k per hour
  }
});
