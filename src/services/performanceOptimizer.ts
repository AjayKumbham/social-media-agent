export interface PerformanceMetrics {
  responseTime: number;
  memoryUsage: number;
  activeConnections: number;
  cacheHitRate: number;
  errorRate: number;
}

export interface OptimizationRule {
  condition: (metrics: PerformanceMetrics) => boolean;
  action: () => Promise<void>;
  description: string;
}

class PerformanceOptimizer {
  private cache = new Map<string, { data: any; timestamp: number; ttl: number }>();
  private metrics: PerformanceMetrics = {
    responseTime: 0,
    memoryUsage: 0,
    activeConnections: 0,
    cacheHitRate: 0,
    errorRate: 0
  };
  private rules: OptimizationRule[] = [];
  private monitoring = false;
  private responseTimes: number[] = [];
  private errorCount = 0;
  private totalRequests = 0;
  private cacheHits = 0;
  private cacheMisses = 0;

  constructor() {
    this.initializeRules();
  }

  private initializeRules() {
    this.rules = [
      {
        condition: (metrics) => metrics.responseTime > 5000,
        action: async () => {
          console.log('High response time detected, clearing cache');
          this.clearCache();
        },
        description: 'Clear cache when response time > 5s'
      },
      {
        condition: (metrics) => metrics.cacheHitRate < 0.3,
        action: async () => {
          console.log('Low cache hit rate, extending TTL');
          this.extendCacheTTL();
        },
        description: 'Extend cache TTL when hit rate < 30%'
      },
      {
        condition: (metrics) => metrics.errorRate > 0.1,
        action: async () => {
          console.log('High error rate detected, enabling conservative mode');
          this.enableConservativeMode();
        },
        description: 'Enable conservative mode when error rate > 10%'
      }
    ];
  }

  startMonitoring() {
    if (this.monitoring) return;
    
    this.monitoring = true;
    
    // Update metrics every 30 seconds
    setInterval(() => {
      this.updateMetrics();
      this.applyOptimizations();
    }, 30000);

    // Clean cache every 5 minutes
    setInterval(() => {
      this.cleanExpiredCache();
    }, 300000);
  }

  stopMonitoring() {
    this.monitoring = false;
  }

  private updateMetrics() {
    // Real metrics collection
    this.metrics = {
      responseTime: this.measureAverageResponseTime(),
      memoryUsage: this.getMemoryUsage(),
      activeConnections: this.getActiveConnections(),
      cacheHitRate: this.calculateCacheHitRate(),
      errorRate: this.calculateErrorRate()
    };
  }

  private measureAverageResponseTime(): number {
    // Use real browser performance API
    if (typeof window !== 'undefined' && window.performance) {
      const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
      if (navigation) {
        return navigation.loadEventEnd - navigation.loadEventStart;
      }
    }
    
    // Fallback: calculate average of tracked response times
    if (this.responseTimes.length > 0) {
      const avg = this.responseTimes.reduce((a, b) => a + b, 0) / this.responseTimes.length;
      // Keep only last 10 measurements
      this.responseTimes = this.responseTimes.slice(-10);
      return avg;
    }
    
    return 0;
  }

  private getMemoryUsage(): number {
    // Use real browser memory API if available
    if (typeof window !== 'undefined' && 'memory' in performance) {
      const memory = (performance as any).memory;
      if (memory && memory.usedJSHeapSize && memory.totalJSHeapSize) {
        return (memory.usedJSHeapSize / memory.totalJSHeapSize) * 100;
      }
    }
    
    // Fallback: estimate based on cache size
    return Math.min(this.cache.size * 0.1, 100);
  }

  private getActiveConnections(): number {
    // Use real browser connection info
    if (typeof navigator !== 'undefined' && 'hardwareConcurrency' in navigator) {
      return navigator.hardwareConcurrency || 4;
    }
    
    // Fallback: estimate based on cache operations
    return Math.min(this.cache.size, 50);
  }

  private calculateCacheHitRate(): number {
    const total = this.cacheHits + this.cacheMisses;
    if (total === 0) return 0;
    return this.cacheHits / total;
  }

  private calculateErrorRate(): number {
    if (this.totalRequests === 0) return 0;
    return this.errorCount / this.totalRequests;
  }

  // Track real performance metrics
  trackResponseTime(duration: number) {
    this.responseTimes.push(duration);
    this.totalRequests++;
  }

  trackError() {
    this.errorCount++;
    this.totalRequests++;
  }

  trackCacheHit() {
    this.cacheHits++;
  }

  trackCacheMiss() {
    this.cacheMisses++;
  }

  private applyOptimizations() {
    for (const rule of this.rules) {
      if (rule.condition(this.metrics)) {
        console.log(`Applying optimization: ${rule.description}`);
        rule.action().catch(error => {
          console.error('Optimization failed:', error);
        });
      }
    }
  }

  // Cache management
  set(key: string, data: any, ttl: number = 300000): void { // Default 5 minutes
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl
    });
  }

  get(key: string): any | null {
    const item = this.cache.get(key);
    if (!item) {
      this.trackCacheMiss();
      return null;
    }

    if (Date.now() - item.timestamp > item.ttl) {
      this.cache.delete(key);
      this.trackCacheMiss();
      return null;
    }

    this.trackCacheHit();
    return item.data;
  }

  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  clearCache(): void {
    this.cache.clear();
  }

  private cleanExpiredCache(): void {
    const now = Date.now();
    let cleaned = 0;

    for (const [key, item] of this.cache.entries()) {
      if (now - item.timestamp > item.ttl) {
        this.cache.delete(key);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      console.log(`Cleaned ${cleaned} expired cache entries`);
    }
  }

  private extendCacheTTL(): void {
    for (const [key, item] of this.cache.entries()) {
      item.ttl = Math.min(item.ttl * 1.5, 1800000); // Max 30 minutes
    }
  }

  private enableConservativeMode(): void {
    // Reduce cache TTL, increase retry delays, etc.
    for (const [key, item] of this.cache.entries()) {
      item.ttl = Math.max(item.ttl * 0.5, 60000); // Min 1 minute
    }
  }

  // Performance helpers
  async measureFunction<T>(fn: () => Promise<T>, name: string): Promise<T> {
    const start = Date.now();
    try {
      const result = await fn();
      const duration = Date.now() - start;
      this.trackResponseTime(duration);
      console.log(`Performance: ${name} took ${duration}ms`);
      return result;
    } catch (error) {
      const duration = Date.now() - start;
      this.trackError();
      console.error(`Performance: ${name} failed after ${duration}ms:`, error);
      throw error;
    }
  }

  getCacheStats() {
    return {
      size: this.cache.size,
      hitRate: this.calculateCacheHitRate(),
      memoryEstimate: this.cache.size * 1024, // Very rough estimate
      hits: this.cacheHits,
      misses: this.cacheMisses,
      totalRequests: this.totalRequests
    };
  }

  getMetrics(): PerformanceMetrics {
    return { ...this.metrics };
  }

  // Batch operations for better performance
  async batchOperation<T, R>(
    items: T[],
    operation: (item: T) => Promise<R>,
    batchSize: number = 5,
    delayBetweenBatches: number = 100
  ): Promise<R[]> {
    const results: R[] = [];
    
    for (let i = 0; i < items.length; i += batchSize) {
      const batch = items.slice(i, i + batchSize);
      const batchPromises = batch.map(operation);
      
      try {
        const batchResults = await Promise.allSettled(batchPromises);
        
        for (const result of batchResults) {
          if (result.status === 'fulfilled') {
            results.push(result.value);
          } else {
            console.error('Batch operation failed:', result.reason);
          }
        }
        
        // Add delay between batches to prevent overwhelming APIs
        if (i + batchSize < items.length && delayBetweenBatches > 0) {
          await new Promise(resolve => setTimeout(resolve, delayBetweenBatches));
        }
      } catch (error) {
        console.error('Batch operation error:', error);
      }
    }
    
    return results;
  }
}

export const performanceOptimizer = new PerformanceOptimizer();

// Auto-start performance monitoring
if (typeof window !== 'undefined') {
  performanceOptimizer.startMonitoring();
}
