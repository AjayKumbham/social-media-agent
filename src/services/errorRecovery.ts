import { supabase } from '@/integrations/supabase/client';
import { notificationService } from './notificationService';
import { getCurrentISTTimestamp } from '@/utils/timeUtils';

export interface RecoveryStrategy {
  type: 'retry' | 'fallback' | 'manual' | 'skip';
  maxAttempts?: number;
  backoffMultiplier?: number;
  fallbackAction?: () => Promise<any>;
}

export interface ErrorContext {
  operation: string;
  platform?: string;
  userId?: string;
  postId?: string;
  timestamp: string;
  metadata?: any;
}

class ErrorRecoveryService {
  private recoveryStrategies: Map<string, RecoveryStrategy> = new Map();
  private retryAttempts: Map<string, number> = new Map();

  constructor() {
    this.initializeStrategies();
  }

  private initializeStrategies() {
    // Platform posting errors
    this.recoveryStrategies.set('platform_post_failed', {
      type: 'retry',
      maxAttempts: 3,
      backoffMultiplier: 2
    });

    // Content generation errors
    this.recoveryStrategies.set('content_generation_failed', {
      type: 'fallback',
      maxAttempts: 2,
      fallbackAction: async () => {
        return {
          title: 'Automated Content',
          body: 'This is automated content generated as a fallback.',
          tags: ['automated']
        };
      }
    });

    // Authentication errors
    this.recoveryStrategies.set('auth_token_expired', {
      type: 'manual',
      maxAttempts: 1
    });

    // Rate limit errors
    this.recoveryStrategies.set('rate_limit_exceeded', {
      type: 'retry',
      maxAttempts: 5,
      backoffMultiplier: 3
    });

    // API connection errors
    this.recoveryStrategies.set('api_connection_failed', {
      type: 'retry',
      maxAttempts: 3,
      backoffMultiplier: 1.5
    });
  }

  async handleError(error: Error, context: ErrorContext): Promise<{
    shouldRetry: boolean;
    retryAfter?: number;
    action: 'retry' | 'fallback' | 'manual' | 'skip' | 'fail';
    message?: string;
  }> {
    const errorType = this.classifyError(error, context);
    const strategy = this.recoveryStrategies.get(errorType);
    
    console.log(`Handling error: ${errorType}`, { error: error.message, context });

    if (!strategy) {
      await this.logError(error, context, 'unhandled');
      return { shouldRetry: false, action: 'fail' };
    }

    const attemptKey = `${context.operation}_${context.postId || context.userId}_${errorType}`;
    const currentAttempts = this.retryAttempts.get(attemptKey) || 0;

    // Log error for tracking
    await this.logError(error, context, errorType, currentAttempts);

    switch (strategy.type) {
      case 'retry':
        if (currentAttempts < (strategy.maxAttempts || 3)) {
          this.retryAttempts.set(attemptKey, currentAttempts + 1);
          const retryAfter = this.calculateBackoff(currentAttempts, strategy.backoffMultiplier || 2);
          
          return {
            shouldRetry: true,
            retryAfter,
            action: 'retry',
            message: `Retrying in ${Math.round(retryAfter / 1000)} seconds (attempt ${currentAttempts + 1}/${strategy.maxAttempts})`
          };
        }
        break;

      case 'fallback':
        if (currentAttempts < (strategy.maxAttempts || 2)) {
          this.retryAttempts.set(attemptKey, currentAttempts + 1);
          
          return {
            shouldRetry: true,
            action: 'fallback',
            message: 'Using fallback strategy'
          };
        }
        break;

      case 'manual':
        await this.requestManualIntervention(error, context);
        return {
          shouldRetry: false,
          action: 'manual',
          message: 'Manual intervention required'
        };

      case 'skip':
        return {
          shouldRetry: false,
          action: 'skip',
          message: 'Operation skipped due to error'
        };
    }

    // Clear retry attempts after max attempts reached
    this.retryAttempts.delete(attemptKey);
    
    return { shouldRetry: false, action: 'fail' };
  }

  private classifyError(error: Error, context: ErrorContext): string {
    const message = error.message.toLowerCase();
    
    if (message.includes('rate limit') || message.includes('too many requests')) {
      return 'rate_limit_exceeded';
    }
    
    if (message.includes('unauthorized') || message.includes('token') || message.includes('authentication')) {
      return 'auth_token_expired';
    }
    
    if (message.includes('network') || message.includes('connection') || message.includes('timeout')) {
      return 'api_connection_failed';
    }
    
    if (context.operation === 'content_generation') {
      return 'content_generation_failed';
    }
    
    if (context.operation === 'platform_post') {
      return 'platform_post_failed';
    }
    
    return 'unknown_error';
  }

  private calculateBackoff(attempt: number, multiplier: number): number {
    const baseDelay = 5000; // 5 seconds
    const maxDelay = 300000; // 5 minutes
    const delay = baseDelay * Math.pow(multiplier, attempt);
    
    // Add jitter to prevent thundering herd
    const jitter = Math.random() * 0.1 * delay;
    
    return Math.min(maxDelay, delay + jitter);
  }

  private async logError(error: Error, context: ErrorContext, errorType: string, attempt?: number) {
    try {
      const { data: user } = await supabase.auth.getUser();
      
      // Log to database for analytics
      await supabase.from('notifications').insert({
        user_id: user.user?.id || context.userId,
        type: 'error',
        title: 'System Error',
        message: error.message,
        category: 'system',
        priority: 'high',
        platform: context.platform,
        action: JSON.stringify({
          errorType,
          operation: context.operation,
          attempt: attempt || 0,
          context: context.metadata
        })
      });

      // Log to console for debugging
      console.error('Error Recovery Log:', {
        errorType,
        message: error.message,
        context,
        attempt: attempt || 0,
        timestamp: getCurrentISTTimestamp()
      });
    } catch (logError) {
      console.error('Failed to log error:', logError);
    }
  }

  private async requestManualIntervention(error: Error, context: ErrorContext) {
    await notificationService.showNotification({
      type: 'error',
      title: 'Manual Intervention Required',
      message: `${context.operation} failed: ${error.message}. Please check your settings.`,
      timestamp: getCurrentISTTimestamp(),
      category: 'system',
      priority: 'high'
    });
  }

  clearRetryAttempts(operationKey?: string) {
    if (operationKey) {
      // Clear specific operation attempts
      for (const key of this.retryAttempts.keys()) {
        if (key.startsWith(operationKey)) {
          this.retryAttempts.delete(key);
        }
      }
    } else {
      // Clear all retry attempts
      this.retryAttempts.clear();
    }
  }

  getRetryAttempts(): Map<string, number> {
    return new Map(this.retryAttempts);
  }

  async recoverFailedPosts(userId: string, platform?: string): Promise<{
    recovered: number;
    failed: number;
    skipped: number;
  }> {
    const result = { recovered: 0, failed: 0, skipped: 0 };

    try {
      // Get failed posts from the last 24 hours
      const { data: failedPosts } = await supabase
        .from('content_posts')
        .select('*')
        .eq('user_id', userId)
        .eq('status', 'failed')
        .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
        .order('created_at', { ascending: false })
        .limit(10);

      if (!failedPosts) return result;

      for (const post of failedPosts) {
        if (platform && post.platform_name !== platform) {
          result.skipped++;
          continue;
        }

        try {
          // Reset post status to scheduled for retry
          const { error } = await supabase
            .from('content_posts')
            .update({
              status: 'scheduled',
              error_message: null,
              scheduled_for: new Date(Date.now() + 5 * 60 * 1000).toISOString() // 5 minutes from now
            })
            .eq('id', post.id);

          if (error) throw error;

          result.recovered++;
        } catch (error) {
          console.error(`Failed to recover post ${post.id}:`, error);
          result.failed++;
        }
      }

      if (result.recovered > 0) {
        await notificationService.showNotification({
          type: 'success',
          title: 'Posts Recovered',
          message: `Successfully recovered ${result.recovered} failed posts for retry`,
          timestamp: getCurrentISTTimestamp()
        });
      }
    } catch (error) {
      console.error('Error in post recovery:', error);
    }

    return result;
  }
}

export const errorRecovery = new ErrorRecoveryService();
