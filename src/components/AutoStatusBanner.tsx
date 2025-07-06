
import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Bot, Play, Pause, CheckCircle, Clock, AlertCircle, Activity, Zap, TrendingUp } from 'lucide-react';
import { enhancedScheduler } from '@/services/enhancedScheduler';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { getCurrentIST, getISTDayBoundsUTC, formatISTTime } from '@/utils/timeUtils';

export const AutoStatusBanner = () => {
  const { user } = useAuth();
  const [isActive, setIsActive] = useState(false);
  const [nextPost, setNextPost] = useState<Date | null>(null);
  const [activePlatforms, setActivePlatforms] = useState(0);
  const [todaysPosts, setTodaysPosts] = useState(0);
  const [schedulerStatus, setSchedulerStatus] = useState<any>({});
  const [healthStatus, setHealthStatus] = useState<any>({});

  useEffect(() => {
    if (user) {
      loadStatus();
      // Update status every 30 seconds
      const interval = setInterval(loadStatus, 30000);
      return () => clearInterval(interval);
    }
  }, [user]);

  const loadStatus = async () => {
    if (!user) return;

    try {
      // Get enhanced scheduler status
      const status = enhancedScheduler.getStatus();
      const health = await enhancedScheduler.getHealthStatus();
      
      setSchedulerStatus(status);
      setHealthStatus(health);
      setIsActive(status.isRunning);
      
      // Find next scheduled job
      if (status.jobQueue?.pending > 0) {
        // This would need to be implemented in the job queue to return next job time
        setNextPost(new Date(Date.now() + 3600000)); // Placeholder: 1 hour from now
      }

      // Check active schedules
      const { data: schedules } = await supabase
        .from('posting_schedule')
        .select('platform_name')
        .eq('user_id', user.id)
        .eq('is_active', true);

      setActivePlatforms(schedules?.length || 0);

      // Get today's posts count with proper IST handling
      const { startUTC, endUTC } = getISTDayBoundsUTC();

      const { data: todaysPostsData, error } = await supabase
        .from('content_posts')
        .select('id, status, scheduled_for, posted_at, created_at')
        .eq('user_id', user.id)
        .gte('scheduled_for', startUTC.toISOString())
        .lt('scheduled_for', endUTC.toISOString());

      if (error) {
        console.error('Error fetching today\'s posts:', error);
      } else {
        setTodaysPosts(todaysPostsData?.length || 0);
      }

    } catch (error) {
      console.error('Failed to load status:', error);
    }
  };

  const toggleAutonomousMode = async () => {
    if (isActive) {
      enhancedScheduler.stop();
      setIsActive(false);
    } else {
      await enhancedScheduler.startAutonomousMode();
      setIsActive(true);
      setTimeout(loadStatus, 1000);
    }
  };

  const formatTimeUntilNext = () => {
    if (!nextPost) return 'No posts scheduled';
    
    const now = new Date();
    const diff = nextPost.getTime() - now.getTime();
    
    if (diff <= 0) return 'Posting now...';
    
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  };

  return (
    <Card className="enhanced-card mb-8 overflow-hidden bg-white dark:bg-black border-gray-200 dark:border-gray-800">
      <div className="p-6">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
          {/* Left Section - Branding & Status */}
          <div className="flex items-center space-x-6">
            <div className="flex items-center space-x-4">
              <div className="relative">
                <div className="w-12 h-12 bg-blue-600 rounded-xl flex items-center justify-center">
                  <Bot className="w-6 h-6 text-white" />
                </div>
                {isActive && (
                  <div className="absolute -top-1 -right-1 w-4 h-4 bg-blue-600 rounded-full border-2 border-white dark:border-black animate-pulse">
                    <div className="w-2 h-2 bg-white rounded-full absolute top-0.5 left-0.5"></div>
                  </div>
                )}
              </div>
              
              <div>
                <h3 className="text-black dark:text-white font-semibold text-lg flex items-center gap-2">
                  Enhanced Autonomous Publisher
                  <Zap className="w-5 h-5 text-blue-600" />
                </h3>
                <p className="text-gray-600 dark:text-gray-400 text-sm">Production-ready AI-powered multi-platform publishing</p>
              </div>
            </div>
            
            {/* Status Badges */}
            <div className="flex items-center gap-3">
              <Badge 
                className={`border px-3 py-1 font-medium ${
                  isActive 
                    ? "bg-blue-600 text-white border-blue-600" 
                    : "bg-white dark:bg-black text-black dark:text-white border-gray-300 dark:border-gray-600"
                }`}
              >
                {isActive ? (
                  <>
                    <CheckCircle className="w-3 h-3 mr-1" />
                    Active
                  </>
                ) : (
                  <>
                    <AlertCircle className="w-3 h-3 mr-1" />
                    Inactive
                  </>
                )}
              </Badge>

              {healthStatus.scheduler && (
                <Badge className="border px-3 py-1 font-medium bg-white dark:bg-black text-black dark:text-white border-gray-300 dark:border-gray-600">
                  <Activity className="w-3 h-3 mr-1" />
                  {healthStatus.scheduler}
                </Badge>
              )}
            </div>
          </div>

          {/* Right Section - Metrics & Controls */}
          <div className="flex items-center gap-8">
            {/* Metrics Grid */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
              <div className="text-center">
                <div className="text-2xl font-semibold text-blue-600">
                  {activePlatforms}
                </div>
                <div className="text-xs text-gray-600 dark:text-gray-400 font-medium">Active Schedules</div>
              </div>
              
              <div className="text-center">
                <div className="text-2xl font-semibold text-blue-600">
                  {todaysPosts}
                </div>
                <div className="text-xs text-gray-600 dark:text-gray-400 font-medium">Posts Today</div>
              </div>

              {schedulerStatus.jobQueue && (
                <div className="text-center">
                  <div className="text-xl font-semibold text-black dark:text-white">
                    {schedulerStatus.jobQueue.pending + schedulerStatus.jobQueue.processing}
                  </div>
                  <div className="text-xs text-gray-600 dark:text-gray-400 font-medium">Jobs Queued</div>
                </div>
              )}
              
              <div className="text-center">
                <div className="text-lg font-semibold text-black dark:text-white flex items-center justify-center gap-1">
                  <Clock className="w-4 h-4 text-blue-600" />
                  <span>
                    {formatTimeUntilNext()}
                  </span>
                </div>
                <div className="text-xs text-gray-600 dark:text-gray-400 font-medium">Next Post</div>
              </div>
            </div>

            {/* Control Button */}
            <Button
              onClick={toggleAutonomousMode}
              className={`
                btn-enhanced px-6 py-3 font-semibold rounded-xl text-white
                ${isActive 
                  ? "bg-black dark:bg-white dark:text-black hover:bg-gray-800 dark:hover:bg-gray-200" 
                  : "bg-blue-600 hover:bg-blue-700"
                }
              `}
            >
              {isActive ? (
                <>
                  <Pause className="w-4 h-4 mr-2" />
                  Pause System
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 mr-2" />
                  Start Enhanced Mode
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Additional Status Information */}
        {isActive && (schedulerStatus.jobQueue || schedulerStatus.circuitBreakers) && (
          <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              {schedulerStatus.jobQueue && (
                <div className="flex flex-wrap gap-4 text-sm">
                  <div className="flex items-center gap-2 text-blue-600">
                    <TrendingUp className="w-4 h-4" />
                    <span className="font-medium">Completed: {schedulerStatus.jobQueue.completed}</span>
                  </div>
                  <div className="flex items-center gap-2 text-blue-600">
                    <Activity className="w-4 h-4" />
                    <span className="font-medium">Processing: {schedulerStatus.jobQueue.processing}</span>
                  </div>
                  <div className="flex items-center gap-2 text-black dark:text-white">
                    <AlertCircle className="w-4 h-4" />
                    <span className="font-medium">Failed: {schedulerStatus.jobQueue.failed}</span>
                  </div>
                </div>
              )}
              
              {schedulerStatus.uptime && (
                <div className="text-gray-600 dark:text-gray-400 text-sm flex items-center gap-2">
                  <Clock className="w-4 h-4" />
                  <span>Uptime: {Math.round(schedulerStatus.uptime / 1000 / 60)} min</span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </Card>
  );
};
