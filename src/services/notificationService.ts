import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { getCurrentUTCTimestamp, getCurrentISTTimestamp } from '@/utils/timeUtils';

export interface NotificationData {
  type: 'success' | 'error' | 'warning' | 'info';
  title: string;
  message: string;
  platform?: string;
  action?: string;
  category?: 'posting' | 'analytics' | 'scheduling' | 'system';
  priority?: 'low' | 'medium' | 'high';
  timestamp: string;
}

export interface NotificationPreferences {
  enableToasts: boolean;
  enableDatabase: boolean;
  categories: {
    posting: boolean;
    analytics: boolean;
    scheduling: boolean;
    system: boolean;
  };
  priority: {
    low: boolean;
    medium: boolean;
    high: boolean;
  };
}

export class NotificationService {
  private retryAttempts = 3;
  private retryDelay = 1000;
  private preferences: NotificationPreferences | null = null;

  async getPreferences(): Promise<NotificationPreferences> {
    if (this.preferences) return this.preferences;

    const { data: user } = await supabase.auth.getUser();
    if (!user.user) {
      return this.getDefaultPreferences();
    }

    try {
      const { data } = await supabase
        .from('notification_preferences')
        .select('preferences')
        .eq('user_id', user.user.id)
        .single();

      // Type guard and casting from Json to NotificationPreferences
      if (data?.preferences && typeof data.preferences === 'object' && !Array.isArray(data.preferences)) {
        this.preferences = data.preferences as unknown as NotificationPreferences;
        return this.preferences;
      }
      
      return this.getDefaultPreferences();
    } catch (error) {
      console.warn('Failed to load notification preferences, using defaults:', error);
      return this.getDefaultPreferences();
    }
  }

  private getDefaultPreferences(): NotificationPreferences {
    return {
      enableToasts: true,
      enableDatabase: true,
      categories: {
        posting: true,
        analytics: true,
        scheduling: true,
        system: true,
      },
      priority: {
        low: true,
        medium: true,
        high: true,
      },
    };
  }

  async updatePreferences(preferences: NotificationPreferences) {
    const { data: user } = await supabase.auth.getUser();
    if (!user.user) return;

    try {
      const { error } = await supabase
        .from('notification_preferences')
        .upsert({
          user_id: user.user.id,
          preferences: preferences as any, // Cast to Json type
          updated_at: getCurrentUTCTimestamp(),
        });

      if (error) throw error;
      this.preferences = preferences;
    } catch (error) {
      console.error('Failed to update notification preferences:', error);
      throw error;
    }
  }

  async showNotification(data: NotificationData) {
    const preferences = await this.getPreferences();
    const category = data.category || 'system';
    const priority = data.priority || 'medium';

    // Check if notification should be shown based on preferences
    if (!preferences.categories[category] || !preferences.priority[priority]) {
      return; // Skip notification based on user preferences
    }

    // Show toast notification with retry logic
    if (preferences.enableToasts) {
      await this.showToastWithRetry(data);
    }

    // Store notification in database with retry logic
    if (preferences.enableDatabase) {
      await this.saveNotificationWithRetry(data);
    }
  }

  private async showToastWithRetry(data: NotificationData, attempt = 1) {
    try {
      switch (data.type) {
        case 'success':
          toast.success(data.title, { 
            description: data.message,
            duration: 4000,
          });
          break;
        case 'error':
          toast.error(data.title, { 
            description: data.message,
            duration: 6000,
          });
          break;
        case 'warning':
          toast.warning(data.title, { 
            description: data.message,
            duration: 5000,
          });
          break;
        case 'info':
          toast.info(data.title, { 
            description: data.message,
            duration: 4000,
          });
          break;
      }
    } catch (error) {
      if (attempt < this.retryAttempts) {
        console.warn(`Toast notification failed (attempt ${attempt}), retrying...`, error);
        await this.delay(this.retryDelay * attempt);
        return this.showToastWithRetry(data, attempt + 1);
      }
      console.error('Failed to show toast notification after retries:', error);
    }
  }

  private async saveNotificationWithRetry(data: NotificationData, attempt = 1) {
    try {
      await this.saveNotification(data);
    } catch (error) {
      if (attempt < this.retryAttempts) {
        console.warn(`Database notification save failed (attempt ${attempt}), retrying...`, error);
        await this.delay(this.retryDelay * attempt);
        return this.saveNotificationWithRetry(data, attempt + 1);
      }
      console.error('Failed to save notification to database after retries:', error);
    }
  }

  private async saveNotification(data: NotificationData) {
    const { data: user } = await supabase.auth.getUser();
    if (!user.user) throw new Error('User not authenticated');

    const { error } = await supabase
      .from('notifications')
      .insert({
        user_id: user.user.id,
        type: data.type,
        title: data.title,
        message: data.message,
        platform: data.platform,
        action: data.action,
        category: data.category || 'system',
        priority: data.priority || 'medium',
        created_at: getCurrentISTTimestamp(),
        read: false
      });

    if (error) throw error;
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Convenience methods with category and priority defaults
  async notifyPostSuccess(platform: string, postTitle: string, postUrl?: string) {
    await this.showNotification({
      type: 'success',
      title: 'Post Published Successfully',
      message: `"${postTitle}" was published to ${platform}${postUrl ? ` - ${postUrl}` : ''}`,
      platform,
      action: 'post_published',
      category: 'posting',
      priority: 'medium',
      timestamp: getCurrentISTTimestamp()
    });
  }

  async notifyPostError(platform: string, postTitle: string, error: string) {
    await this.showNotification({
      type: 'error',
      title: 'Post Publishing Failed',
      message: `Failed to publish "${postTitle}" to ${platform}: ${error}`,
      platform,
      action: 'post_failed',
      category: 'posting',
      priority: 'high',
      timestamp: getCurrentISTTimestamp()
    });
  }

  async notifyContentGenerated(platform: string, contentType: string) {
    await this.showNotification({
      type: 'info',
      title: 'Content Generated',
      message: `New ${contentType} content generated for ${platform}`,
      platform,
      action: 'content_generated',
      category: 'posting',
      priority: 'low',
      timestamp: getCurrentISTTimestamp()
    });
  }

  async notifyRateLimitWarning(platform: string) {
    await this.showNotification({
      type: 'warning',
      title: 'Rate Limit Approaching',
      message: `Approaching rate limit for ${platform}. Posts may be delayed.`,
      platform,
      action: 'rate_limit_warning',
      category: 'system',
      priority: 'medium',
      timestamp: getCurrentISTTimestamp()
    });
  }

  async notifyDailyLimit(platform: string) {
    await this.showNotification({
      type: 'warning',
      title: 'Daily Post Limit Reached',
      message: `Daily posting limit of 3 posts reached for ${platform}`,
      platform,
      action: 'daily_limit_reached',
      category: 'posting',
      priority: 'medium',
      timestamp: getCurrentISTTimestamp()
    });
  }

  async notifySchedulingError(error: string) {
    await this.showNotification({
      type: 'error',
      title: 'Scheduling Error',
      message: `Content scheduling failed: ${error}`,
      action: 'scheduling_error',
      category: 'scheduling',
      priority: 'high',
      timestamp: getCurrentISTTimestamp()
    });
  }

  async notifyAnalyticsUpdate(successCount: number, totalCount: number) {
    await this.showNotification({
      type: successCount === totalCount ? 'success' : 'warning',
      title: 'Analytics Updated',
      message: `Updated analytics for ${successCount}/${totalCount} posts`,
      action: 'analytics_updated',
      category: 'analytics',
      priority: 'low',
      timestamp: getCurrentISTTimestamp()
    });
  }

  async getNotifications(limit = 20, offset = 0, category?: string) {
    const { data: user } = await supabase.auth.getUser();
    if (!user.user) return { data: [], hasMore: false };

    try {
      let query = supabase
        .from('notifications')
        .select('*')
        .eq('user_id', user.user.id)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit);

      if (category) {
        query = query.eq('category', category);
      }

      const { data, error } = await query;

      if (error) throw error;

      return {
        data: data || [],
        hasMore: (data?.length || 0) === limit + 1
      };
    } catch (error) {
      console.error('Failed to fetch notifications:', error);
      return { data: [], hasMore: false };
    }
  }

  async markAsRead(notificationId: string) {
    try {
      const { error } = await supabase
        .from('notifications')
        .update({ read: true })
        .eq('id', notificationId);

      if (error) throw error;
    } catch (error) {
      console.error('Failed to mark notification as read:', error);
      throw error;
    }
  }

  async markAllAsRead(category?: string) {
    const { data: user } = await supabase.auth.getUser();
    if (!user.user) return;

    try {
      let query = supabase
        .from('notifications')
        .update({ read: true })
        .eq('user_id', user.user.id)
        .eq('read', false);

      if (category) {
        query = query.eq('category', category);
      }

      const { error } = await query;
      if (error) throw error;
    } catch (error) {
      console.error('Failed to mark notifications as read:', error);
      throw error;
    }
  }

  async deleteNotification(notificationId: string) {
    try {
      const { error } = await supabase
        .from('notifications')
        .delete()
        .eq('id', notificationId);

      if (error) throw error;
    } catch (error) {
      console.error('Failed to delete notification:', error);
      throw error;
    }
  }

  async deleteAllRead(category?: string) {
    const { data: user } = await supabase.auth.getUser();
    if (!user.user) return;

    try {
      let query = supabase
        .from('notifications')
        .delete()
        .eq('user_id', user.user.id)
        .eq('read', true);

      if (category) {
        query = query.eq('category', category);
      }

      const { error } = await query;
      if (error) throw error;
    } catch (error) {
      console.error('Failed to delete read notifications:', error);
      throw error;
    }
  }

  async cleanupOldNotifications(daysToKeep = 30) {
    const { data: user } = await supabase.auth.getUser();
    if (!user.user) return;

    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

      const { error } = await supabase
        .from('notifications')
        .delete()
        .eq('user_id', user.user.id)
        .lt('created_at', cutoffDate.toISOString());

      if (error) throw error;
      
      console.log(`Cleaned up notifications older than ${daysToKeep} days`);
    } catch (error) {
      console.error('Failed to cleanup old notifications:', error);
    }
  }

  async getUnreadCount(category?: string) {
    const { data: user } = await supabase.auth.getUser();
    if (!user.user) return 0;

    try {
      let query = supabase
        .from('notifications')
        .select('id', { count: 'exact' })
        .eq('user_id', user.user.id)
        .eq('read', false);

      if (category) {
        query = query.eq('category', category);
      }

      const { count, error } = await query;
      if (error) throw error;

      return count || 0;
    } catch (error) {
      console.error('Failed to get unread count:', error);
      return 0;
    }
  }

  // Clear cached preferences (useful when user logs out)
  clearCache() {
    this.preferences = null;
  }
}

export const notificationService = new NotificationService();
