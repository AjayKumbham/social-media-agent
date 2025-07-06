import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Clock, Calendar, Zap, AlertCircle, RefreshCw, Activity, TrendingUp } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { enhancedScheduler } from '@/services/enhancedScheduler';
import { getCurrentIST, formatISTTime, getCurrentISTFormatted, getCurrentISTTimeString } from '@/utils/timeUtils';

interface ScheduledPost {
  id: string;
  platform_name: string;
  title: string;
  scheduled_for: string;
  status: string;
  post_type: string;
}

export const ScheduleOverview = () => {
  const { user } = useAuth();
  const [upcomingPosts, setUpcomingPosts] = useState<ScheduledPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSchedulerActive, setIsSchedulerActive] = useState(false);
  const [schedulerStatus, setSchedulerStatus] = useState<any>({});
  const [healthStatus, setHealthStatus] = useState<any>({});
  const [currentISTTime, setCurrentISTTime] = useState(getCurrentISTTimeString());

  useEffect(() => {
    if (user) {
      loadUpcomingPosts();
      checkSchedulerStatus();
      
      // Update current time every second
      const timeInterval = setInterval(() => {
        setCurrentISTTime(getCurrentISTTimeString());
      }, 1000);
      
      // Check scheduler status every 30 seconds
      const statusInterval = setInterval(() => {
        checkSchedulerStatus();
        loadUpcomingPosts();
      }, 30000);

      return () => {
        clearInterval(timeInterval);
        clearInterval(statusInterval);
      };
    }
  }, [user]);

  const loadUpcomingPosts = async () => {
    if (!user) return;
    
    try {
      // Get current time for querying upcoming posts
      const now = new Date();
      
      // Query from current time onwards to get upcoming posts
      const { data, error } = await supabase
        .from('content_posts')
        .select('*')
        .eq('user_id', user.id)
        .eq('status', 'scheduled')
        .not('scheduled_for', 'is', null)
        .gte('scheduled_for', now.toISOString())
        .order('scheduled_for', { ascending: true })
        .limit(10);

      if (error) {
        console.error('Error loading upcoming posts:', error);
      } else {
        console.log('Loaded upcoming posts:', data);
        setUpcomingPosts(data || []);
      }
    } catch (error) {
      console.error('Failed to load upcoming posts:', error);
    } finally {
      setLoading(false);
    }
  };

  const checkSchedulerStatus = async () => {
    if (!user) return;
    
    try {
      const status = enhancedScheduler.getStatus();
      const health = await enhancedScheduler.getHealthStatus();
      
      console.log('Scheduler status:', status);
      console.log('Health status:', health);
      
      setSchedulerStatus(status);
      setHealthStatus(health);
      setIsSchedulerActive(status.isRunning);
    } catch (error) {
      console.error('Failed to check scheduler status:', error);
    }
  };

  const formatScheduledTime = (utcTime: string) => {
    return formatISTTime(utcTime, { 
      dateStyle: 'short', 
      timeStyle: 'short',
      hour12: false 
    });
  };

  const getPlatformColor = (platform: string) => {
    const colors: { [key: string]: string } = {
      'linkedin': 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300',
      'hashnode': 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300',
      'devto': 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300',
      'twitter': 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300',
      'instagram': 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300',
      'youtube': 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300',
      'reddit': 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300',
    };
    return colors[platform] || 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300';
  };

  const forceGenerateContent = async () => {
    setLoading(true);
    try {
      console.log('Force generating content for today...');
      await enhancedScheduler.forceGenerateContent();
      await loadUpcomingPosts();
      
      // Also check if scheduler is running, if not start it
      if (!isSchedulerActive) {
        console.log('Starting scheduler...');
        await enhancedScheduler.start();
        setTimeout(checkSchedulerStatus, 2000);
      }
    } catch (error) {
      console.error('Failed to force generate content:', error);
    } finally {
      setLoading(false);
    }
  };

  const getHealthStatusColor = (status: string) => {
    switch (status) {
      case 'healthy': return 'text-blue-600';
      case 'degraded': return 'text-blue-500';
      case 'unhealthy': return 'text-red-600';
      default: return 'text-gray-600 dark:text-gray-400';
    }
  };

  if (loading) {
    return (
      <Card className="bg-white dark:bg-black border-gray-200 dark:border-gray-800">
        <CardContent className="flex items-center justify-center p-6">
          <div className="text-gray-600 dark:text-gray-400">Loading schedule...</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-white dark:bg-black border-gray-200 dark:border-gray-800">
      <CardHeader>
        <CardTitle className="text-black dark:text-white flex items-center justify-between">
          <div className="flex items-center">
            <Calendar className="w-5 h-5 mr-2 text-blue-600" />
            Enhanced Schedule Overview (IST - 24H)
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={forceGenerateContent}
            className="border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-blue-50 dark:hover:bg-blue-900/20"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Generate Now
          </Button>
        </CardTitle>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Current IST: {currentISTTime}
        </p>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {/* Enhanced Status Section */}
        <div className={`flex items-center justify-between p-3 border rounded-lg ${
          isSchedulerActive && schedulerStatus.isRunning
            ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-700' 
            : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-700'
        }`}>
          <div className="flex items-center space-x-2">
            {isSchedulerActive && schedulerStatus.isRunning ? (
              <>
                <Zap className="w-4 h-4 text-blue-600" />
                <span className="text-blue-600 font-medium">Enhanced AI Scheduler Running</span>
                {healthStatus.scheduler && (
                  <Activity className={`w-4 h-4 ${getHealthStatusColor(healthStatus.scheduler)}`} />
                )}
              </>
            ) : (
              <>
                <AlertCircle className="w-4 h-4 text-red-600" />
                <span className="text-red-600 font-medium">Scheduler Inactive</span>
              </>
            )}
          </div>
          <div className="text-right">
            <Badge className={
              isSchedulerActive && schedulerStatus.isRunning
                ? "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300" 
                : "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300"
            }>
              {isSchedulerActive && schedulerStatus.isRunning ? 'Active' : 'Inactive'}
            </Badge>
            {schedulerStatus.jobQueue && (
              <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                {schedulerStatus.jobQueue.pending} pending, {schedulerStatus.jobQueue.processing} processing
              </p>
            )}
          </div>
        </div>

        {/* Performance Metrics */}
        {isSchedulerActive && schedulerStatus.recentMetrics && (
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 p-3 rounded-lg">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600 dark:text-gray-400">Completed</span>
                <TrendingUp className="w-4 h-4 text-blue-600" />
              </div>
              <div className="text-xl font-bold text-black dark:text-white">
                {schedulerStatus.recentMetrics.completed || 0}
              </div>
            </div>
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 p-3 rounded-lg">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600 dark:text-gray-400">Failed</span>
                <AlertCircle className="w-4 h-4 text-red-600" />
              </div>
              <div className="text-xl font-bold text-black dark:text-white">
                {schedulerStatus.recentMetrics.failed || 0}
              </div>
            </div>
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 p-3 rounded-lg">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600 dark:text-gray-400">Retries</span>
                <RefreshCw className="w-4 h-4 text-blue-600" />
              </div>
              <div className="text-xl font-bold text-black dark:text-white">
                {schedulerStatus.recentMetrics.retries || 0}
              </div>
            </div>
          </div>
        )}

        <div className="space-y-3">
          <h4 className="text-sm font-medium text-gray-600 dark:text-gray-400 flex items-center">
            <Clock className="w-4 h-4 mr-2" />
            Upcoming Posts
          </h4>
          
          {upcomingPosts.length === 0 ? (
            <div className="text-center py-8">
              <div className="text-gray-600 dark:text-gray-400">No posts scheduled</div>
              <p className="text-sm text-gray-500 dark:text-gray-500 mt-2">
                {!isSchedulerActive 
                  ? 'Start the enhanced scheduler to generate content automatically' 
                  : 'Content will be generated based on your active schedules'
                }
              </p>
            </div>
          ) : (
            upcomingPosts.map((post) => (
              <div
                key={post.id}
                className="flex items-center justify-between p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors"
              >
                <div className="space-y-1">
                  <p className="text-black dark:text-white text-sm font-medium truncate">
                    {post.title}
                  </p>
                  <div className="flex items-center space-x-2">
                    <Badge
                      variant="secondary"
                      className={getPlatformColor(post.platform_name)}
                    >
                      {post.platform_name.charAt(0).toUpperCase() + post.platform_name.slice(1)}
                    </Badge>
                    <span className="text-gray-600 dark:text-gray-400 text-xs capitalize">{post.post_type}</span>
                  </div>
                </div>
                
                <div className="text-right">
                  <p className="text-black dark:text-white text-sm font-medium">
                    {formatScheduledTime(post.scheduled_for)}
                  </p>
                  <Badge variant="outline" className="text-xs border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400">
                    Scheduled
                  </Badge>
                </div>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
};
