import { supabase } from '@/integrations/supabase/client';
import { jobQueue } from './jobQueue';
import { platformCircuitBreaker } from './circuitBreaker';
import { globalRateLimiter } from './rateLimiter';
import { getCurrentIST } from '@/utils/timeUtils';

interface MetricEntry {
  timestamp: Date;
  metric: string;
  value: number;
  metadata?: Record<string, any>;
}

interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  checks: Record<string, { status: 'pass' | 'fail'; message: string; timestamp: Date }>;
  uptime: number;
  lastCheck: Date;
}

export class SchedulerMonitor {
  private metrics: MetricEntry[] = [];
  private startTime = getCurrentIST().getTime();
  private monitoringInterval: NodeJS.Timeout | null = null;
  private isMonitoring = false;

  start() {
    if (this.isMonitoring) return;
    
    this.isMonitoring = true;
    
    // Collect metrics every 5 minutes
    this.monitoringInterval = setInterval(() => {
      this.collectMetrics();
      this.performHealthChecks();
      this.cleanupOldMetrics();
    }, 300000);

    // Set up job queue event listeners
    this.setupJobQueueMonitoring();
    
    console.log('📊 Scheduler monitoring started');
  }

  stop() {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
    this.isMonitoring = false;
    console.log('📊 Scheduler monitoring stopped');
  }

  private setupJobQueueMonitoring() {
    jobQueue.on('job:completed', (data: any) => {
      this.recordMetric('jobs.completed', 1, {
        type: data.job.type,
        platform: data.job.platform,
        duration: getCurrentIST().getTime() - data.job.updatedAt.getTime()
      });
    });

    jobQueue.on('job:failed', (data: any) => {
      this.recordMetric('jobs.failed', 1, {
        type: data.job.type,
        platform: data.job.platform,
        error: data.error,
        retryCount: data.job.retryCount
      });
    });

    jobQueue.on('job:retrying', (data: any) => {
      this.recordMetric('jobs.retries', 1, {
        type: data.job.type,
        platform: data.job.platform,
        attempt: data.job.retryCount,
        delay: data.delay
      });
    });
  }

  private collectMetrics() {
    const now = getCurrentIST().getTime();
    
    // Job queue metrics
    const jobStats = jobQueue.getStats();
    this.recordMetric('jobs.queue.total', jobStats.total);
    this.recordMetric('jobs.queue.pending', jobStats.pending);
    this.recordMetric('jobs.queue.processing', jobStats.processing);
    this.recordMetric('jobs.queue.completed', jobStats.completed);
    this.recordMetric('jobs.queue.failed', jobStats.failed);

    // Circuit breaker metrics
    const circuitStatus = platformCircuitBreaker.getAllStatus();
    Object.entries(circuitStatus).forEach(([platform, status]) => {
      this.recordMetric(`circuit.${platform}.failures`, status.failures);
      this.recordMetric(`circuit.${platform}.state`, status.state === 'closed' ? 1 : 0);
    });

    // Rate limiter metrics
    const rateLimitStats = globalRateLimiter.getStats();
    this.recordMetric('ratelimit.active_entries', rateLimitStats.activeEntries);
    this.recordMetric('ratelimit.avg_usage', rateLimitStats.avgUsage);

    // System metrics
    this.recordMetric('system.uptime', getCurrentIST().getTime() - this.startTime);
    this.recordMetric('system.memory_usage', process.memoryUsage?.().heapUsed || 0);
  }

  private async performHealthChecks(): Promise<HealthStatus> {
    const checks: Record<string, { status: 'pass' | 'fail'; message: string; timestamp: Date }> = {};
    const now = getCurrentIST().getTime();

    // Check job queue health
    const jobStats = jobQueue.getStats();
    const failureRate = jobStats.total > 0 ? jobStats.failed / jobStats.total : 0;
    checks.jobQueue = {
      status: failureRate < 0.1 ? 'pass' : 'fail',
      message: `Failure rate: ${(failureRate * 100).toFixed(1)}%`,
      timestamp: new Date(now)
    };

    // Check database connectivity
    try {
      const { error } = await supabase.from('posting_schedule').select('id').limit(1);
      checks.database = {
        status: error ? 'fail' : 'pass',
        message: error ? `Database error: ${error.message}` : 'Database connected',
        timestamp: new Date(now)
      };
    } catch (error) {
      checks.database = {
        status: 'fail',
        message: `Database connection failed: ${(error as Error).message}`,
        timestamp: new Date(now)
      };
    }

    // Check circuit breakers
    const circuitStatus = platformCircuitBreaker.getAllStatus();
    const unhealthyCircuits = Object.entries(circuitStatus).filter(([_, status]) => !status.isHealthy);
    checks.circuitBreakers = {
      status: unhealthyCircuits.length === 0 ? 'pass' : 'fail',
      message: unhealthyCircuits.length === 0 
        ? 'All circuits healthy' 
        : `${unhealthyCircuits.length} unhealthy circuits: ${unhealthyCircuits.map(([key]) => key).join(', ')}`,
      timestamp: new Date(now)
    };

    // Overall health status
    const failedChecks = Object.values(checks).filter(check => check.status === 'fail');
    const status: HealthStatus['status'] = 
      failedChecks.length === 0 ? 'healthy' :
      failedChecks.length <= 1 ? 'degraded' : 'unhealthy';

    const healthStatus: HealthStatus = {
      status,
      checks,
      uptime: getCurrentIST().getTime() - this.startTime,
      lastCheck: new Date(now)
    };

    // Log health status if degraded or unhealthy
    if (status !== 'healthy') {
      console.warn(`🏥 Scheduler health: ${status}`, {
        failedChecks: failedChecks.map(check => check.message)
      });
    }

    return healthStatus;
  }

  recordMetric(metric: string, value: number, metadata?: Record<string, any>) {
    this.metrics.push({
      timestamp: new Date(getCurrentIST().getTime()),
      metric,
      value,
      metadata
    });
  }

  // Get metrics for a specific time range
  getMetrics(metric?: string, since?: Date): MetricEntry[] {
    let filtered = this.metrics;
    
    if (metric) {
      filtered = filtered.filter(m => m.metric === metric);
    }
    
    if (since) {
      filtered = filtered.filter(m => m.timestamp.getTime() >= since.getTime());
    }
    
    return filtered.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  }

  // Get aggregated metrics
  getAggregatedMetrics(metric: string, since: Date, interval: 'minute' | 'hour' | 'day' = 'hour') {
    const metrics = this.getMetrics(metric, since);
    const intervalMs = interval === 'minute' ? 60000 : interval === 'hour' ? 3600000 : 86400000;
    
    const buckets: Record<string, { sum: number; count: number; avg: number }> = {};
    
    metrics.forEach(m => {
      const bucketKey = Math.floor(m.timestamp.getTime() / intervalMs) * intervalMs;
      const bucket = buckets[bucketKey] || { sum: 0, count: 0, avg: 0 };
      bucket.sum += m.value;
      bucket.count++;
      bucket.avg = bucket.sum / bucket.count;
      buckets[bucketKey] = bucket;
    });
    
    return Object.entries(buckets).map(([timestamp, data]) => ({
      timestamp: new Date(parseInt(timestamp)),
      ...data
    }));
  }

  // Get success rates by platform
  getSuccessRates(since: Date = new Date(getCurrentIST().getTime() - 24 * 60 * 60 * 1000)) {
    const completed = this.getMetrics('jobs.completed', since);
    const failed = this.getMetrics('jobs.failed', since);
    
    const platforms: Record<string, { completed: number; failed: number; rate: number }> = {};
    
    completed.forEach(m => {
      const platform = m.metadata?.platform || 'unknown';
      platforms[platform] = platforms[platform] || { completed: 0, failed: 0, rate: 0 };
      platforms[platform].completed++;
    });
    
    failed.forEach(m => {
      const platform = m.metadata?.platform || 'unknown';
      platforms[platform] = platforms[platform] || { completed: 0, failed: 0, rate: 0 };
      platforms[platform].failed++;
    });
    
    Object.values(platforms).forEach(stats => {
      const total = stats.completed + stats.failed;
      stats.rate = total > 0 ? stats.completed / total : 0;
    });
    
    return platforms;
  }

  private cleanupOldMetrics() {
    // Keep metrics for 24 hours
    const cutoff = new Date(getCurrentIST().getTime() - 24 * 60 * 60 * 1000);
    const before = this.metrics.length;
    this.metrics = this.metrics.filter(m => m.timestamp.getTime() >= cutoff.getTime());
    const cleaned = before - this.metrics.length;
    
    if (cleaned > 0) {
      console.log(`🧹 Cleaned up ${cleaned} old metrics`);
    }
  }

  // Get current system status summary
  getStatusSummary() {
    const now = getCurrentIST().getTime();
    const last24h = new Date(now - 24 * 60 * 60 * 1000);
    
    return {
      uptime: getCurrentIST().getTime() - this.startTime,
      jobQueue: jobQueue.getStats(),
      successRates: this.getSuccessRates(last24h),
      circuitBreakers: platformCircuitBreaker.getAllStatus(),
      rateLimiter: globalRateLimiter.getStats(),
      recentMetrics: {
        completed: this.getMetrics('jobs.completed', last24h).length,
        failed: this.getMetrics('jobs.failed', last24h).length,
        retries: this.getMetrics('jobs.retries', last24h).length
      }
    };
  }
}

export const schedulerMonitor = new SchedulerMonitor();
