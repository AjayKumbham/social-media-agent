
import { supabase } from '@/integrations/supabase/client';
import { analyticsService } from './analyticsService';
import { notificationService } from './notificationService';
import { getCurrentIST, fromIST, getISTDayBoundsUTC } from '@/utils/timeUtils';

export class AnalyticsScheduler {
  private isRunning = false;
  private scheduledTimeout: NodeJS.Timeout | null = null;
  private lastRetrievalDate: string | null = null;

  start() {
    if (this.isRunning) {
      console.log('📊 Analytics scheduler already running');
      return;
    }

    this.isRunning = true;
    this.scheduleNextRetrieval();
    console.log('📊 Analytics scheduler started');
  }

  stop() {
    if (this.scheduledTimeout) {
      clearTimeout(this.scheduledTimeout);
      this.scheduledTimeout = null;
    }
    this.isRunning = false;
    console.log('📊 Analytics scheduler stopped');
  }

  private scheduleNextRetrieval() {
    const istNow = getCurrentIST();
    const currentDate = istNow.toISOString().split('T')[0];
    
    // Calculate next analytics retrieval window (11:00-11:59 PM IST)
    const nextRetrieval = new Date(istNow);
    nextRetrieval.setHours(23, 0, 0, 0); // 11:00 PM IST
    
    // If it's already past 11 PM today, schedule for tomorrow
    if (istNow.getHours() >= 23) {
      nextRetrieval.setDate(nextRetrieval.getDate() + 1);
    }
    
    // Add random delay between 0-59 minutes to spread load
    const randomMinutes = Math.floor(Math.random() * 60);
    nextRetrieval.setMinutes(randomMinutes);
    
    const nextRetrievalUTC = fromIST(nextRetrieval);
    const msUntilRetrieval = nextRetrievalUTC.getTime() - new Date().getTime();
    
    console.log(`📈 Next analytics retrieval scheduled for: ${nextRetrieval.toLocaleString('en-IN')} IST`);
    
    this.scheduledTimeout = setTimeout(() => {
      this.executeRetrieval();
      // Schedule next retrieval
      this.scheduleNextRetrieval();
    }, msUntilRetrieval);
  }

  private async executeRetrieval() {
    const currentDate = getCurrentIST().toISOString().split('T')[0];
    
    // Prevent duplicate retrieval on same date
    if (this.lastRetrievalDate === currentDate) {
      console.log('📊 Analytics already retrieved today, skipping...');
      return;
    }

    console.log('📈 Executing scheduled analytics retrieval...');
    
    try {
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) {
        console.log('❌ No authenticated user for analytics retrieval');
        return;
      }

      // Get yesterday's published posts
      const yesterday = new Date(getCurrentIST());
      yesterday.setDate(yesterday.getDate() - 1);
      const { startUTC, endUTC } = getISTDayBoundsUTC(yesterday);

      const { data: posts, error } = await supabase
        .from('content_posts')
        .select('id, platform_name, platform_post_id, title')
        .eq('user_id', user.user.id)
        .eq('status', 'published')
        .not('platform_post_id', 'is', null)
        .gte('posted_at', startUTC.toISOString())
        .lt('posted_at', endUTC.toISOString());

      if (error) {
        console.error('❌ Error fetching posts for analytics:', error);
        return;
      }

      if (!posts || posts.length === 0) {
        console.log('📊 No published posts found for yesterday');
        this.lastRetrievalDate = currentDate;
        return;
      }

      console.log(`📊 Retrieving analytics for ${posts.length} posts from yesterday`);
      
      let successCount = 0;
      let errorCount = 0;

      // Update analytics for each post with error handling
      for (const post of posts) {
        try {
          await analyticsService.updatePostAnalytics(post.id);
          successCount++;
          console.log(`✅ Analytics updated for ${post.platform_name}: ${post.title}`);
        } catch (error) {
          errorCount++;
          console.error(`❌ Failed to update analytics for ${post.platform_name}: ${post.title}`, error);
        }
        
        // Add small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      this.lastRetrievalDate = currentDate;
      
      await notificationService.showNotification({
        type: successCount > 0 ? 'success' : 'warning',
        title: 'Analytics Retrieval Complete',
        message: `Updated analytics for ${successCount}/${posts.length} posts. ${errorCount} errors.`,
        timestamp: new Date().toISOString()
      });

      console.log(`📊 Analytics retrieval completed: ${successCount} success, ${errorCount} errors`);

    } catch (error) {
      console.error('❌ Failed to execute analytics retrieval:', error);
      
      await notificationService.showNotification({
        type: 'error',
        title: 'Analytics Retrieval Failed',
        message: 'Daily analytics retrieval encountered an error',
        timestamp: new Date().toISOString()
      });
    }
  }

  getStatus() {
    return {
      isRunning: this.isRunning,
      lastRetrievalDate: this.lastRetrievalDate,
      nextScheduled: this.scheduledTimeout ? 'Yes' : 'No'
    };
  }

  // Force execute analytics retrieval (for testing or manual trigger)
  async forceExecute() {
    console.log('🔥 Force executing analytics retrieval...');
    await this.executeRetrieval();
  }
}

export const analyticsScheduler = new AnalyticsScheduler();
