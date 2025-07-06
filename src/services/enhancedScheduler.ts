import { supabase } from '@/integrations/supabase/client';
import { platformAPI } from './platformApi';
import { contentGenerator } from './contentGenerator';
import { notificationService } from './notificationService';
import { analyticsService } from './analyticsService';
import { toIST, fromIST, getCurrentIST, getISTDayBoundsUTC, getNextOccurrenceIST, getCurrentISTTimestamp, getCurrentISTDayOfWeek } from '@/utils/timeUtils';
import { jobQueue } from './jobQueue';
import { platformCircuitBreaker } from './circuitBreaker';
import { globalRateLimiter } from './rateLimiter';
import { schedulerMonitor } from './schedulerMonitor';

interface ScheduleEntry {
  id: string;
  user_id: string;
  platform_name: string;
  max_posts_per_day: number;
  preferred_times: string[];
  days_of_week: number[];
  is_active: boolean;
}

export class EnhancedScheduler {
  private isRunning = false;
  private realtimeChannel: any = null;
  private cleanupInterval: NodeJS.Timeout | null = null;
  private midnightContentGeneration: NodeJS.Timeout | null = null;
  private analyticsRetrievalScheduler: NodeJS.Timeout | null = null;
  private lastContentGenerationDate: string | null = null;
  private lastAnalyticsRetrievalDate: string | null = null;

  async start() {
    if (this.isRunning) {
      console.log('🔄 Enhanced scheduler is already running');
      return;
    }

    console.log('🚀 Starting enhanced autonomous content scheduler...');
    this.isRunning = true;
    
    // Start all subsystems
    jobQueue.start();
    schedulerMonitor.start();
    
    // Set up real-time schedule monitoring
    await this.setupRealtimeMonitoring();
    
    // Load existing scheduled posts into job queue
    await this.loadExistingPosts();
    
    // Immediately check and generate content for today
    await this.generateContentForToday();
    
    // Schedule daily content generation (12-1 AM IST)
    this.scheduleDailyContentGeneration();
    
    // Schedule daily analytics retrieval (11 PM-12 AM IST)
    this.scheduleDailyAnalyticsRetrieval();
    
    // Set up cleanup intervals
    this.setupCleanupIntervals();

    await notificationService.showNotification({
      type: 'info',
      title: 'Enhanced Scheduler Started',
      message: 'Production-ready autonomous content scheduling is now active',
      timestamp: getCurrentISTTimestamp()
    });
  }

  async startAutonomousMode() {
    await this.start();
  }

  stop() {
    if (!this.isRunning) return;

    jobQueue.stop();
    schedulerMonitor.stop();
    
    if (this.realtimeChannel) {
      supabase.removeChannel(this.realtimeChannel);
      this.realtimeChannel = null;
    }
    
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    if (this.midnightContentGeneration) {
      clearTimeout(this.midnightContentGeneration);
      this.midnightContentGeneration = null;
    }

    if (this.analyticsRetrievalScheduler) {
      clearTimeout(this.analyticsRetrievalScheduler);
      this.analyticsRetrievalScheduler = null;
    }
    
    this.isRunning = false;
    console.log('🛑 Enhanced scheduler stopped');
  }

  private scheduleDailyContentGeneration() {
    const istNow = getCurrentIST();
    const currentDate = istNow.toISOString().split('T')[0];
    
    // Calculate next midnight content generation window (12:00-1:00 AM IST)
    const nextMidnight = new Date(istNow);
    nextMidnight.setDate(nextMidnight.getDate() + 1); // Move to next day
    nextMidnight.setHours(0, 0, 0, 0); // Set to 00:00 IST
    
    // Add random delay between 0-59 minutes to spread load
    const randomMinutes = Math.floor(Math.random() * 60);
    nextMidnight.setMinutes(randomMinutes);
    
    const nextMidnightUTC = fromIST(nextMidnight);
    const msUntilMidnight = nextMidnightUTC.getTime() - new Date().getTime();
    
    console.log(`⏰ Next content generation scheduled for: ${nextMidnight.toLocaleString('en-IN')} IST`);
    
    this.midnightContentGeneration = setTimeout(() => {
      this.executeContentGeneration();
      
      // Schedule next generation (24 hours later)
      this.scheduleDailyContentGeneration();
    }, msUntilMidnight);
  }

  private scheduleDailyAnalyticsRetrieval() {
    const istNow = getCurrentIST();
    
    // Calculate next analytics retrieval window (11:00-11:59 PM IST)
    const nextAnalytics = new Date(istNow);
    nextAnalytics.setHours(23, 0, 0, 0); // 11:00 PM IST
    
    // If it's already past 11 PM today, schedule for tomorrow
    if (istNow.getHours() >= 23) {
      nextAnalytics.setDate(nextAnalytics.getDate() + 1);
    }
    
    // Add random delay between 0-59 minutes
    const randomMinutes = Math.floor(Math.random() * 60);
    nextAnalytics.setMinutes(randomMinutes);
    
    const nextAnalyticsUTC = fromIST(nextAnalytics);
    const msUntilAnalytics = nextAnalyticsUTC.getTime() - new Date().getTime();
    
    console.log(`📊 Next analytics retrieval scheduled for: ${nextAnalytics.toLocaleString('en-IN')} IST`);
    
    this.analyticsRetrievalScheduler = setTimeout(() => {
      this.executeAnalyticsRetrieval();
      
      // Schedule next retrieval (24 hours later)
      this.scheduleDailyAnalyticsRetrieval();
    }, msUntilAnalytics);
  }

  private async executeContentGeneration() {
    const currentDate = getCurrentIST().toISOString().split('T')[0];
    
    // Check if we already generated content today
    if (this.lastContentGenerationDate === currentDate) {
      console.log('📅 Content already generated today, skipping...');
      return;
    }

    console.log('🎯 Executing midnight content generation...');
    
    try {
      await this.generateContentForToday();
      this.lastContentGenerationDate = currentDate;
      
      await notificationService.showNotification({
        type: 'success',
        title: 'Content Generated',
        message: 'Daily content generation completed successfully',
        timestamp: getCurrentISTTimestamp()
      });
    } catch (error) {
      console.error('❌ Failed to generate content:', error);
      
      await notificationService.showNotification({
        type: 'error',
        title: 'Content Generation Failed',
        message: 'Daily content generation encountered an error',
        timestamp: getCurrentISTTimestamp()
      });
    }
  }

  private async executeAnalyticsRetrieval() {
    const currentDate = getCurrentIST().toISOString().split('T')[0];
    
    // Check if we already retrieved analytics today
    if (this.lastAnalyticsRetrievalDate === currentDate) {
      console.log('📊 Analytics already retrieved today, skipping...');
      return;
    }

    console.log('📈 Executing daily analytics retrieval...');
    
    try {
      // Get yesterday's published posts
      const yesterday = new Date(getCurrentIST());
      yesterday.setDate(yesterday.getDate() - 1);
      const { startUTC, endUTC } = getISTDayBoundsUTC(yesterday);

      const { data: posts } = await supabase
        .from('content_posts')
        .select('id, platform_post_id')
        .eq('status', 'published')
        .not('platform_post_id', 'is', null)
        .gte('posted_at', startUTC.toISOString())
        .lt('posted_at', endUTC.toISOString());

      if (posts && posts.length > 0) {
        console.log(`📊 Retrieving analytics for ${posts.length} posts from yesterday`);
        
        // Update analytics for each post
        const updatePromises = posts.map(post => 
          analyticsService.updatePostAnalytics(post.id)
        );
        
        await Promise.allSettled(updatePromises);
      }

      this.lastAnalyticsRetrievalDate = currentDate;
      
      await notificationService.showNotification({
        type: 'success',
        title: 'Analytics Updated',
        message: `Analytics retrieved for ${posts?.length || 0} posts`,
        timestamp: getCurrentISTTimestamp()
      });
    } catch (error) {
      console.error('❌ Failed to retrieve analytics:', error);
      
      await notificationService.showNotification({
        type: 'error',
        title: 'Analytics Retrieval Failed',
        message: 'Daily analytics retrieval encountered an error',
        timestamp: getCurrentISTTimestamp()
      });
    }
  }

  private async setupRealtimeMonitoring() {
    try {
      this.realtimeChannel = supabase
        .channel('schedule-changes')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'posting_schedule'
          },
          (payload) => {
            console.log('📊 Schedule change detected:', payload);
            this.handleScheduleChange(payload);
          }
        )
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'content_posts'
          },
          (payload) => {
            console.log('📝 New content post detected:', payload);
            this.handleNewContentPost(payload);
          }
        )
        .subscribe();

      console.log('📡 Real-time monitoring setup complete');
    } catch (error) {
      console.error('❌ Failed to setup real-time monitoring:', error);
      // Fallback to polling if real-time fails
      this.setupPollingFallback();
    }
  }

  private setupPollingFallback() {
    // Minimal polling every 5 minutes to check for urgent schedule changes
    setInterval(() => {
      // Only check if there are any schedule changes that affect today
      this.checkTodayScheduleChanges();
    }, 300000);
    
    console.log('⚠️ Using polling fallback for schedule monitoring');
  }

  private async checkTodayScheduleChanges() {
    // This is a minimal check - in a real implementation, you'd track
    // last modification times of schedules and only act on recent changes
    console.log('🔍 Checking for today-relevant schedule changes...');
  }

  private async handleScheduleChange(payload: any) {
    if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
      const schedule = payload.new;
      
      // Check if this schedule affects today
      if (await this.isScheduleRelevantForToday(schedule)) {
        console.log('⚡ Schedule change affects today - generating content immediately');
        
        // Generate content immediately for this specific schedule
        jobQueue.addJob({
          type: 'content_generation',
          priority: 'high',
          payload: { scheduleId: schedule.id, immediate: true, todayOnly: true },
          scheduledTime: getCurrentIST(),
          maxRetries: 3,
          userId: schedule.user_id,
          platform: schedule.platform_name
        });
      } else {
        console.log('📅 Schedule change does not affect today - ignoring');
      }
    }
  }

  private async isScheduleRelevantForToday(schedule: any): Promise<boolean> {
    if (!schedule.is_active) return false;
    
    const istNow = getCurrentIST();
    const currentDayOfWeek = getCurrentISTDayOfWeek();
    const daysOfWeek = Array.isArray(schedule.days_of_week) ? schedule.days_of_week : [];
    
    console.log(`Checking schedule relevance for ${schedule.platform_name}:`);
    console.log(`Current day: ${currentDayOfWeek}, Schedule days: ${daysOfWeek}`);
    
    // Check if today is in the schedule's days
    if (!daysOfWeek.includes(currentDayOfWeek)) {
      console.log(`Today (${currentDayOfWeek}) not in schedule days`);
      return false;
    }
    
    // Check if we already have content for this platform today
    const hasContent = await this.hasContentForToday(schedule.platform_name, schedule.user_id);
    
    console.log(`Has content for today: ${hasContent}`);
    
    // Only relevant if we don't have content yet and there's still time today
    return !hasContent;
  }

  private async handleNewContentPost(payload: any) {
    const post = payload.new;
    if (post.status === 'scheduled' && post.scheduled_for) {
      // Add posting job
      jobQueue.addJob({
        type: 'content_posting',
        priority: 'medium',
        payload: { postId: post.id },
        scheduledTime: getCurrentIST(),
        maxRetries: 5,
        userId: post.user_id,
        platform: post.platform_name
      });
    }
  }

  private async loadExistingPosts() {
    try {
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) return;

      const { data: posts } = await supabase
        .from('content_posts')
        .select('*')
        .eq('user_id', user.user.id)
        .eq('status', 'scheduled')
        .not('scheduled_for', 'is', null);

      if (posts) {
        posts.forEach(post => {
          jobQueue.addJob({
            type: 'content_posting',
            priority: 'medium',
            payload: { postId: post.id },
            scheduledTime: getCurrentIST(),
            maxRetries: 5,
            userId: post.user_id,
            platform: post.platform_name
          });
        });
        
        console.log(`📋 Loaded ${posts.length} existing scheduled posts into job queue`);
      }
    } catch (error) {
      console.error('❌ Failed to load existing posts:', error);
    }
  }

  private async generateContentForToday() {
    try {
      console.log('🎯 Generating content for today\'s schedules...');
      
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) {
        console.log('❌ No authenticated user found');
        return;
      }

      // Get current IST date and day
      const istNow = getCurrentIST();
      const currentDayOfWeek = getCurrentISTDayOfWeek();

      console.log(`📅 Current IST time: ${istNow.toLocaleString('en-IN')}`);
      console.log(`📅 Current day of week: ${currentDayOfWeek}`);

      // Get active schedules for today
      const { data: schedules, error } = await supabase
        .from('posting_schedule')
        .select('*')
        .eq('user_id', user.user.id)
        .eq('is_active', true);

      if (error) {
        console.error('❌ Error fetching schedules:', error);
        return;
      }

      if (!schedules || schedules.length === 0) {
        console.log('📝 No active posting schedules found');
        return;
      }

      console.log(`📋 Found ${schedules.length} total active schedules`);

      // Filter schedules for today
      const todaySchedules = schedules.filter(schedule => {
        const daysOfWeek = Array.isArray(schedule.days_of_week) ? schedule.days_of_week : [];
        const isToday = daysOfWeek.includes(currentDayOfWeek);
        console.log(`Schedule ${schedule.platform_name}: days=${daysOfWeek}, today=${currentDayOfWeek}, isToday=${isToday}`);
        return isToday;
      });

      if (todaySchedules.length === 0) {
        console.log(`📅 No schedules active for today (day ${currentDayOfWeek})`);
        return;
      }

      console.log(`📋 Found ${todaySchedules.length} active schedules for today`);

      // Generate content for each platform that doesn't have content for today
      for (const schedule of todaySchedules) {
        const hasContent = await this.hasContentForToday(schedule.platform_name, schedule.user_id);
        if (!hasContent) {
          console.log(`📝 Generating content for ${schedule.platform_name}`);
          await this.scheduleContentForPlatform(schedule);
        } else {
          console.log(`✅ ${schedule.platform_name} already has content for today`);
        }
      }

    } catch (error) {
      console.error('❌ Failed to generate content for today:', error);
    }
  }

  private async hasContentForToday(platformName: string, userId?: string): Promise<boolean> {
    try {
      const { data: user } = await supabase.auth.getUser();
      const userIdToCheck = userId || user.user?.id;
      if (!userIdToCheck) return false;

      // Get today's date range in IST, converted to UTC
      const { startUTC, endUTC } = getISTDayBoundsUTC();

      console.log(`🔍 Checking for existing content for ${platformName} between ${startUTC.toISOString()} and ${endUTC.toISOString()}`);

      const { data: posts } = await supabase
        .from('content_posts')
        .select('id, status, scheduled_for')
        .eq('user_id', userIdToCheck)
        .eq('platform_name', platformName)
        .in('status', ['scheduled', 'posting', 'posted', 'published'])
        .gte('scheduled_for', startUTC.toISOString())
        .lt('scheduled_for', endUTC.toISOString());

      console.log(`📊 Found ${posts?.length || 0} existing posts for ${platformName} today`);
      return posts && posts.length > 0;
    } catch (error) {
      console.error('❌ Failed to check existing content:', error);
      return false;
    }
  }

  private async scheduleContentForPlatform(schedule: any) {
    try {
      // Get AI settings for topics
      const { data: aiSettings } = await supabase
        .from('ai_settings')
        .select('topics')
        .eq('user_id', schedule.user_id)
        .single();

      const topics = Array.isArray(aiSettings?.topics) && aiSettings.topics.length > 0
        ? (aiSettings.topics as string[])
        : ['Technology', 'Programming', 'AI', 'Web Development'];

      const maxPosts = schedule.max_posts_per_day || 3;
      const preferredTimes = Array.isArray(schedule.preferred_times) 
        ? schedule.preferred_times 
        : ['09:00', '14:00', '18:00'];

      console.log(`📝 Scheduling content for ${schedule.platform_name}: ${maxPosts} posts at ${preferredTimes.join(', ')} IST`);

      // Generate content for today's time slots
      for (let i = 0; i < Math.min(maxPosts, preferredTimes.length); i++) {
        const randomTopic = topics[Math.floor(Math.random() * topics.length)];
        console.log(`🎯 Generating content for ${schedule.platform_name} on topic: ${randomTopic}`);
        
        try {
          // Generate content using the AI service
          const content = await contentGenerator.generateContent(schedule.platform_name, randomTopic);

          // Calculate posting time using the updated utility
          const scheduledTimeIST = getNextOccurrenceIST(preferredTimes[i], schedule.days_of_week);
          
          // Convert to UTC for storage
          const scheduledTimeUTC = fromIST(scheduledTimeIST);

          console.log(`⏰ Scheduling for ${scheduledTimeIST.toLocaleString('en-IN')} IST (UTC: ${scheduledTimeUTC.toISOString()})`);

          // Save to database with correct post_type
          const { data: postData, error } = await supabase.from('content_posts').insert({
            user_id: schedule.user_id,
            platform_name: schedule.platform_name,
            post_type: this.getPostType(schedule.platform_name),
            title: content.title,
            content: content.content,
            media_url: content.mediaUrl,
            status: 'scheduled',
            scheduled_for: scheduledTimeUTC.toISOString(),
          }).select().single();

          if (error) {
            console.error(`❌ Failed to save content for ${schedule.platform_name}:`, error);
            continue;
          }

          console.log(`✅ Content scheduled for ${schedule.platform_name} at ${scheduledTimeIST.toLocaleString('en-IN')} IST`);

        } catch (contentError) {
          console.error(`❌ Failed to generate content for ${schedule.platform_name}:`, contentError);
        }
      }
    } catch (error) {
      console.error(`❌ Failed to schedule content for ${schedule.platform_name}:`, error);
    }
  }

  private setupCleanupIntervals() {
    // Run cleanup every hour
    this.cleanupInterval = setInterval(() => {
      jobQueue.cleanup();
      globalRateLimiter.cleanup();
      schedulerMonitor.recordMetric('system.cleanup', 1);
    }, 3600000);
  }

  // Enhanced posting with circuit breaker and rate limiting
  async postContent(platform: string, content: any, userId: string): Promise<string> {
    const rateLimitKey = `${userId}:${platform}`;
    
    // Check rate limits
    const rateLimitResult = await globalRateLimiter.checkLimit(rateLimitKey, platform);
    if (!rateLimitResult.allowed) {
      throw new Error(`Rate limit exceeded for ${platform}. Retry after ${rateLimitResult.retryAfter}s`);
    }

    // Use circuit breaker for posting
    return await platformCircuitBreaker.execute(
      platform,
      async () => {
        schedulerMonitor.recordMetric(`platform.${platform}.post_attempt`, 1);
        
        let result: string;
        switch (platform) {
          case 'hashnode':
            result = await platformAPI.postToHashnode(content);
            break;
          case 'devto':
            result = await platformAPI.postToDevTo(content);
            break;
          case 'twitter':
            result = await platformAPI.postToTwitter(content);
            break;
          case 'linkedin':
            result = await platformAPI.postToLinkedIn(content);
            break;
          case 'instagram':
            result = await platformAPI.postToInstagram(content);
            break;
          case 'youtube':
            result = await platformAPI.postToYouTube(content);
            break;
          case 'reddit':
            result = await platformAPI.postToReddit(content);
            break;
          default:
            throw new Error(`Unsupported platform: ${platform}`);
        }

        schedulerMonitor.recordMetric(`platform.${platform}.post_success`, 1);
        return result;
      },
      async () => {
        // Fallback: save to draft for manual posting
        console.warn(`🔄 Platform ${platform} unavailable, saving as draft`);
        schedulerMonitor.recordMetric(`platform.${platform}.fallback_used`, 1);
        return 'fallback_draft';
      }
    );
  }

  // Enhanced content generation with error handling
  async generateContent(platform: string, topic: string, userId: string): Promise<any> {
    return await platformCircuitBreaker.execute(
      `content_generation:${platform}`,
      async () => {
        schedulerMonitor.recordMetric('content.generation_attempt', 1, { platform, topic });
        
        const content = await contentGenerator.generateContent(platform, topic);
        
        schedulerMonitor.recordMetric('content.generation_success', 1, { platform, topic });
        return content;
      },
      async () => {
        // Fallback: use template content with proper GeneratedContent interface
        console.warn(`🔄 Content generation failed for ${platform}, using template`);
        schedulerMonitor.recordMetric('content.fallback_used', 1, { platform, topic });
        
        return {
          title: `Engaging ${topic} Content`,
          content: `Discover the latest insights about ${topic}. Stay tuned for more updates!`,
          type: this.getContentType(platform),
          platform: platform,
          tags: [topic.toLowerCase().replace(/\s+/g, '-')]
        };
      }
    );
  }

  private getContentType(platform: string): 'blog' | 'social' | 'video' | 'thread' {
    if (['hashnode', 'devto'].includes(platform)) return 'blog';
    if (['instagram', 'youtube'].includes(platform)) return 'video';
    if (platform === 'twitter') return 'thread';
    return 'social';
  }

  private getPostType(platform: string): string {
    const postTypes: { [key: string]: string } = {
      'hashnode': 'article',
      'devto': 'article', 
      'twitter': 'tweet',
      'linkedin': 'post',
      'instagram': 'post',
      'youtube': 'short',
      'reddit': 'post'
    };
    return postTypes[platform] || 'post';
  }

  // Get comprehensive scheduler status
  getStatus() {
    const summary = schedulerMonitor.getStatusSummary();
    
    return {
      isRunning: this.isRunning,
      ...summary,
      realTimeConnected: this.realtimeChannel !== null,
      lastUpdate: getCurrentIST(),
      nextContentGeneration: this.midnightContentGeneration ? 'Scheduled' : 'Not scheduled',
      nextAnalyticsRetrieval: this.analyticsRetrievalScheduler ? 'Scheduled' : 'Not scheduled',
      lastContentGenerationDate: this.lastContentGenerationDate,
      lastAnalyticsRetrievalDate: this.lastAnalyticsRetrievalDate
    };
  }

  // Force generate content with today-only restriction
  async forceGenerateContent() {
    console.log('🔥 Force generating content for today only...');
    
    // Only generate if it's during allowed hours or for today's schedules
    await this.generateContentForToday();
  }

  // Get health status
  async getHealthStatus() {
    return {
      scheduler: this.isRunning ? 'healthy' : 'stopped',
      jobQueue: jobQueue.getStats(),
      circuitBreakers: platformCircuitBreaker.getAllStatus(),
      rateLimiter: globalRateLimiter.getStats(),
      monitor: schedulerMonitor.getStatusSummary(),
      uptime: schedulerMonitor.getStatusSummary().uptime,
      contentGeneration: {
        lastDate: this.lastContentGenerationDate,
        nextScheduled: this.midnightContentGeneration ? 'Yes' : 'No'
      },
      analyticsRetrieval: {
        lastDate: this.lastAnalyticsRetrievalDate,
        nextScheduled: this.analyticsRetrievalScheduler ? 'Yes' : 'No'
      }
    };
  }

  // Emergency stop with graceful shutdown
  async emergencyStop() {
    console.warn('🚨 Emergency stop initiated');
    
    try {
      // Stop accepting new jobs
      this.stop();
      
      // Wait for current jobs to complete (max 30 seconds)
      const timeout = new Promise(resolve => setTimeout(resolve, 30000));
      const completion = new Promise(resolve => {
        const check = () => {
          const stats = jobQueue.getStats();
          if (stats.processing === 0) {
            resolve(true);
          } else {
            setTimeout(check, 1000);
          }
        };
        check();
      });
      
      await Promise.race([timeout, completion]);
      
      console.log('🛑 Emergency stop completed');
    } catch (error) {
      console.error('❌ Error during emergency stop:', error);
    }
  }
}

// Replace the old scheduler manager
export const enhancedScheduler = new EnhancedScheduler();

// Backward compatibility
export const schedulerManager = enhancedScheduler;
