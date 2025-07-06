import { supabase } from '@/integrations/supabase/client';
import { securityService } from './securityService';
import { getCurrentISTTimestamp } from '@/utils/timeUtils';

export interface HealthStatus {
  overall: 'healthy' | 'degraded' | 'unhealthy';
  services: {
    database: HealthCheck;
    scheduler: HealthCheck;
    platforms: HealthCheck;
    content: HealthCheck;
    security: HealthCheck;
  };
  timestamp: string;
  uptime: number;
}

interface HealthCheck {
  status: 'healthy' | 'degraded' | 'unhealthy';
  responseTime?: number;
  error?: string;
  details?: any;
}

class HealthMonitor {
  private startTime = Date.now();
  private lastCheck: HealthStatus | null = null;
  private checkInterval: NodeJS.Timeout | null = null;

  start() {
    // Run health checks every 5 minutes
    this.checkInterval = setInterval(() => {
      this.performHealthCheck();
    }, 300000);
    
    // Initial check
    this.performHealthCheck();
  }

  stop() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }

  async performHealthCheck(): Promise<HealthStatus> {
    const startTime = Date.now();
    
    const [database, scheduler, platforms, content, security] = await Promise.allSettled([
      this.checkDatabase(),
      this.checkScheduler(),
      this.checkPlatforms(),
      this.checkContentGeneration(),
      this.checkSecurity()
    ]);

    const status: HealthStatus = {
      overall: 'healthy',
      services: {
        database: this.extractResult(database),
        scheduler: this.extractResult(scheduler),
        platforms: this.extractResult(platforms),
        content: this.extractResult(content),
        security: this.extractResult(security)
      },
      timestamp: getCurrentISTTimestamp(),
      uptime: Date.now() - this.startTime
    };

    // Determine overall health
    const unhealthyServices = Object.values(status.services).filter(s => s.status === 'unhealthy').length;
    const degradedServices = Object.values(status.services).filter(s => s.status === 'degraded').length;

    if (unhealthyServices > 0) {
      status.overall = 'unhealthy';
    } else if (degradedServices > 1) {
      status.overall = 'degraded';
    }

    this.lastCheck = status;
    
    // Log critical issues
    if (status.overall !== 'healthy') {
      console.warn('Health check detected issues:', status);
      await securityService.logSecurityEvent({
        eventType: 'system_health_degraded',
        eventDetails: { 
          status: status.overall,
          unhealthyServices,
          degradedServices
        }
      });
    }

    return status;
  }

  private extractResult(settledResult: PromiseSettledResult<HealthCheck>): HealthCheck {
    if (settledResult.status === 'fulfilled') {
      return settledResult.value;
    } else {
      return {
        status: 'unhealthy',
        error: settledResult.reason?.message || 'Unknown error'
      };
    }
  }

  private async checkDatabase(): Promise<HealthCheck> {
    const startTime = Date.now();
    
    try {
      const { data, error } = await supabase
        .from('platforms')
        .select('count')
        .limit(1)
        .single();

      if (error && error.code !== 'PGRST116') {
        throw error;
      }

      return {
        status: 'healthy',
        responseTime: Date.now() - startTime
      };
    } catch (error: any) {
      return {
        status: 'unhealthy',
        responseTime: Date.now() - startTime,
        error: error.message
      };
    }
  }

  private async checkScheduler(): Promise<HealthCheck> {
    try {
      // Check if scheduler is running by looking for recent activity
      const { data: recentPosts } = await supabase
        .from('content_posts')
        .select('created_at')
        .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
        .limit(1);

      const { data: activeSchedules } = await supabase
        .from('posting_schedule')
        .select('id')
        .eq('is_active', true)
        .limit(1);

      if (activeSchedules && activeSchedules.length > 0 && (!recentPosts || recentPosts.length === 0)) {
        return {
          status: 'degraded',
          details: 'Active schedules but no recent content generation'
        };
      }

      return {
        status: 'healthy',
        details: `${activeSchedules?.length || 0} active schedules`
      };
    } catch (error: any) {
      return {
        status: 'unhealthy',
        error: error.message
      };
    }
  }

  private async checkPlatforms(): Promise<HealthCheck> {
    try {
      const { data: platforms } = await supabase
        .from('platforms')
        .select('platform_name, is_connected')
        .eq('is_connected', true);

      const connectedCount = platforms?.length || 0;
      
      if (connectedCount === 0) {
        return {
          status: 'degraded',
          details: 'No platforms connected'
        };
      }

      return {
        status: 'healthy',
        details: `${connectedCount} platforms connected`
      };
    } catch (error: any) {
      return {
        status: 'unhealthy',
        error: error.message
      };
    }
  }

  private async checkContentGeneration(): Promise<HealthCheck> {
    try {
      // Check for recent successful content generation
      const { data: recentContent } = await supabase
        .from('content_posts')
        .select('status, created_at')
        .gte('created_at', new Date(Date.now() - 60 * 60 * 1000).toISOString())
        .order('created_at', { ascending: false })
        .limit(5);

      if (!recentContent || recentContent.length === 0) {
        return {
          status: 'degraded',
          details: 'No recent content generation'
        };
      }

      const failedCount = recentContent.filter(c => c.status === 'failed').length;
      const successRate = ((recentContent.length - failedCount) / recentContent.length) * 100;

      if (successRate < 50) {
        return {
          status: 'unhealthy',
          details: `Low success rate: ${successRate.toFixed(1)}%`
        };
      } else if (successRate < 80) {
        return {
          status: 'degraded',
          details: `Moderate success rate: ${successRate.toFixed(1)}%`
        };
      }

      return {
        status: 'healthy',
        details: `Success rate: ${successRate.toFixed(1)}%`
      };
    } catch (error: any) {
      return {
        status: 'unhealthy',
        error: error.message
      };
    }
  }

  private async checkSecurity(): Promise<HealthCheck> {
    try {
      // Check for recent security events
      const { data: recentEvents } = await supabase
        .from('security_audit_logs')
        .select('event_type, created_at')
        .gte('created_at', new Date(Date.now() - 60 * 60 * 1000).toISOString())
        .order('created_at', { ascending: false })
        .limit(100);

      if (!recentEvents) {
        return {
          status: 'healthy',
          details: 'No recent security events'
        };
      }

      // Check for suspicious patterns
      const suspiciousEvents = recentEvents.filter(e => 
        e.event_type.includes('failed') || 
        e.event_type.includes('suspicious') ||
        e.event_type.includes('rate_limit')
      );

      const suspiciousRate = suspiciousEvents.length / Math.max(recentEvents.length, 1);

      if (suspiciousRate > 0.3) {
        return {
          status: 'unhealthy',
          details: `High suspicious activity rate: ${(suspiciousRate * 100).toFixed(1)}%`
        };
      } else if (suspiciousRate > 0.1) {
        return {
          status: 'degraded',
          details: `Moderate suspicious activity: ${(suspiciousRate * 100).toFixed(1)}%`
        };
      }

      return {
        status: 'healthy',
        details: `Security events in last hour: ${recentEvents.length}`
      };
    } catch (error: any) {
      return {
        status: 'unhealthy',
        error: error.message
      };
    }
  }

  getLastHealthCheck(): HealthStatus | null {
    return this.lastCheck;
  }

  async getDetailedStatus() {
    return await this.performHealthCheck();
  }
}

export const healthMonitor = new HealthMonitor();

// Auto-start health monitoring
if (typeof window !== 'undefined') {
  healthMonitor.start();
}
