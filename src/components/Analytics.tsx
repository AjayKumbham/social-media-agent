
import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { 
  TrendingUp, 
  Eye, 
  Heart, 
  MessageCircle, 
  Share2, 
  Users, 
  BarChart3,
  RefreshCw,
  Calendar,
  Award
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line } from 'recharts';
import { analyticsService, type AnalyticsSummary } from '@/services/analyticsService';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export const Analytics = () => {
  const { user } = useAuth();
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [timeRange, setTimeRange] = useState('7days');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [recentPosts, setRecentPosts] = useState<any[]>([]);

  useEffect(() => {
    if (user) {
      loadAnalytics();
    }
  }, [user, timeRange]);

  const loadAnalytics = async () => {
    if (!user) return;
    
    setLoading(true);
    try {
      // Load summary
      const summaryData = await analyticsService.getAnalyticsSummary();
      setSummary(summaryData);

      // Load recent posts with analytics
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - parseInt(timeRange.replace('days', '')));

      const { data: posts } = await supabase
        .from('content_posts')
        .select('*')
        .eq('user_id', user.id)
        .eq('status', 'posted')
        .gte('created_at', startDate.toISOString())
        .order('created_at', { ascending: false })
        .limit(20);

      setRecentPosts(posts || []);
    } catch (error) {
      console.error('Failed to load analytics:', error);
    } finally {
      setLoading(false);
    }
  };

  const refreshAnalytics = async () => {
    setRefreshing(true);
    try {
      // Update analytics for recent posts
      const promises = recentPosts.map(post => 
        analyticsService.updatePostAnalytics(post.id)
      );
      await Promise.all(promises);
      
      // Reload data
      await loadAnalytics();
    } catch (error) {
      console.error('Failed to refresh analytics:', error);
    } finally {
      setRefreshing(false);
    }
  };

  const formatNumber = (num: number) => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toString();
  };

  const getEngagementRate = (post: any) => {
    const analytics = post.analytics as any;
    const views = analytics?.views || analytics?.impressions || 1;
    const engagement = (analytics?.likes || 0) + (analytics?.comments || 0) + (analytics?.shares || 0);
    return views > 0 ? ((engagement / views) * 100).toFixed(1) : '0';
  };

  const platformColors = {
    hashnode: '#2962FF',
    devto: '#0A0A0A',
    twitter: '#1DA1F2',
    linkedin: '#0077B5',
    instagram: '#E4405F',
    youtube: '#FF0000',
    reddit: '#FF4500'
  };

  const chartData = summary ? Object.entries(summary.platform_breakdown).map(([platform, data]: [string, any]) => ({
    platform: platform.charAt(0).toUpperCase() + platform.slice(1),
    posts: data.posts,
    views: data.views,
    engagement: data.engagement,
    fill: platformColors[platform as keyof typeof platformColors] || '#8884d8'
  })) : [];

  if (loading) {
    return (
      <div className="space-y-8">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-black dark:text-white mb-2">Analytics Dashboard</h1>
          <p className="text-gray-600 dark:text-gray-400">Loading analytics data...</p>
        </div>
        <div className="grid lg:grid-cols-4 gap-6">
          {[...Array(4)].map((_, i) => (
            <Card key={i} className="bg-white dark:bg-black border-gray-200 dark:border-gray-800 animate-pulse">
              <CardContent className="p-6">
                <div className="h-16 bg-blue-100 dark:bg-blue-900/30 rounded"></div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-black dark:text-white mb-2">Analytics Dashboard</h1>
          <p className="text-gray-600 dark:text-gray-400">Track your content performance across all platforms</p>
        </div>
        
        <div className="flex items-center space-x-4">
          <Select value={timeRange} onValueChange={setTimeRange}>
            <SelectTrigger className="bg-white dark:bg-black border-gray-300 dark:border-gray-600 text-black dark:text-white w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-white dark:bg-black border-gray-300 dark:border-gray-600">
              <SelectItem value="7days">7 Days</SelectItem>
              <SelectItem value="30days">30 Days</SelectItem>
              <SelectItem value="90days">90 Days</SelectItem>
            </SelectContent>
          </Select>
          
          <Button
            onClick={refreshAnalytics}
            disabled={refreshing}
            variant="outline"
            className="border-gray-300 dark:border-gray-600"
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid lg:grid-cols-4 gap-6">
        <Card className="bg-white dark:bg-black border-gray-200 dark:border-gray-800">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-600 dark:text-gray-400 text-sm">Total Posts</p>
                <p className="text-2xl font-bold text-black dark:text-white">{summary?.total_posts || 0}</p>
              </div>
              <BarChart3 className="w-8 h-8 text-blue-600" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white dark:bg-black border-gray-200 dark:border-gray-800">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-600 dark:text-gray-400 text-sm">Total Views</p>
                <p className="text-2xl font-bold text-black dark:text-white">{formatNumber(summary?.total_views || 0)}</p>
              </div>
              <Eye className="w-8 h-8 text-blue-600" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white dark:bg-black border-gray-200 dark:border-gray-800">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-600 dark:text-gray-400 text-sm">Total Engagement</p>
                <p className="text-2xl font-bold text-black dark:text-white">{formatNumber(summary?.total_engagement || 0)}</p>
              </div>
              <Heart className="w-8 h-8 text-blue-600" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white dark:bg-black border-gray-200 dark:border-gray-800">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-600 dark:text-gray-400 text-sm">Avg. Engagement Rate</p>
                <p className="text-2xl font-bold text-black dark:text-white">
                  {summary && summary.total_views > 0 
                    ? ((summary.total_engagement / summary.total_views) * 100).toFixed(1) 
                    : '0'}%
                </p>
              </div>
              <TrendingUp className="w-8 h-8 text-blue-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid lg:grid-cols-2 gap-6">
        <Card className="bg-white dark:bg-black border-gray-200 dark:border-gray-800">
          <CardHeader>
            <CardTitle className="text-black dark:text-white">Platform Performance</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                <XAxis dataKey="platform" stroke="#6B7280" />
                <YAxis stroke="#6B7280" />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: 'white', 
                    border: '1px solid #E5E7EB',
                    borderRadius: '6px',
                    color: '#1F2937'
                  }}
                />
                <Bar dataKey="views" fill="#2563EB" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="bg-white dark:bg-black border-gray-200 dark:border-gray-800">
          <CardHeader>
            <CardTitle className="text-black dark:text-white">Platform Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={chartData}
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  dataKey="posts"
                  label={({ platform, posts }) => `${platform}: ${posts}`}
                >
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.fill} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Top Performing Posts */}
      <Card className="bg-white dark:bg-black border-gray-200 dark:border-gray-800">
        <CardHeader>
          <CardTitle className="text-black dark:text-white flex items-center">
            <Award className="w-5 h-5 mr-2 text-blue-600" />
            Top Performing Posts
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {summary?.top_performing_posts.slice(0, 5).map((post, index) => {
              const analytics = post.analytics as any;
              const views = analytics?.views || analytics?.impressions || 0;
              const engagement = (analytics?.likes || 0) + (analytics?.comments || 0) + (analytics?.shares || 0);
              
              return (
                <div key={post.id} className="flex items-center justify-between p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-lg">
                  <div className="flex-1">
                    <div className="flex items-center space-x-3">
                      <span className="text-lg font-bold text-blue-600">#{index + 1}</span>
                      <Badge className={`${platformColors[post.platform_name as keyof typeof platformColors] ? 'text-white' : 'bg-gray-500'}`}>
                        {post.platform_name.charAt(0).toUpperCase() + post.platform_name.slice(1)}
                      </Badge>
                    </div>
                    <h3 className="text-black dark:text-white font-medium mt-2 truncate">{post.title}</h3>
                    <p className="text-gray-600 dark:text-gray-400 text-sm">
                      {new Date(post.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  
                  <div className="flex items-center space-x-6 text-sm">
                    <div className="text-center">
                      <p className="text-black dark:text-white font-medium">{formatNumber(views)}</p>
                      <p className="text-gray-600 dark:text-gray-400">Views</p>
                    </div>
                    <div className="text-center">
                      <p className="text-black dark:text-white font-medium">{formatNumber(engagement)}</p>
                      <p className="text-gray-600 dark:text-gray-400">Engagement</p>
                    </div>
                    <div className="text-center">
                      <p className="text-black dark:text-white font-medium">{getEngagementRate(post)}%</p>
                      <p className="text-gray-600 dark:text-gray-400">Rate</p>
                    </div>
                  </div>
                </div>
              );
            })}
            
            {(!summary?.top_performing_posts || summary.top_performing_posts.length === 0) && (
              <div className="text-center py-8">
                <BarChart3 className="w-12 h-12 text-gray-600 dark:text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600 dark:text-gray-400">No performance data available yet</p>
                <p className="text-gray-500 dark:text-gray-500 text-sm">Analytics will appear here once content is published</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Recent Posts Table */}
      <Card className="bg-white dark:bg-black border-gray-200 dark:border-gray-800">
        <CardHeader>
          <CardTitle className="text-black dark:text-white flex items-center">
            <Calendar className="w-5 h-5 mr-2 text-blue-600" />
            Recent Posts
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700">
                  <th className="text-left py-3 px-4 text-gray-600 dark:text-gray-400">Title</th>
                  <th className="text-left py-3 px-4 text-gray-600 dark:text-gray-400">Platform</th>
                  <th className="text-left py-3 px-4 text-gray-600 dark:text-gray-400">Date</th>
                  <th className="text-center py-3 px-4 text-gray-600 dark:text-gray-400">Views</th>
                  <th className="text-center py-3 px-4 text-gray-600 dark:text-gray-400">Engagement</th>
                  <th className="text-center py-3 px-4 text-gray-600 dark:text-gray-400">Rate</th>
                </tr>
              </thead>
              <tbody>
                {recentPosts.map((post) => {
                  const analytics = post.analytics as any;
                  const views = analytics?.views || analytics?.impressions || 0;
                  const engagement = (analytics?.likes || 0) + (analytics?.comments || 0) + (analytics?.shares || 0);
                  
                  return (
                    <tr key={post.id} className="border-b border-gray-200 dark:border-gray-700 hover:bg-blue-50 dark:hover:bg-blue-900/20">
                      <td className="py-3 px-4">
                        <p className="text-black dark:text-white font-medium truncate max-w-xs">{post.title}</p>
                      </td>
                      <td className="py-3 px-4">
                        <Badge variant="secondary" className="capitalize">
                          {post.platform_name}
                        </Badge>
                      </td>
                      <td className="py-3 px-4 text-gray-600 dark:text-gray-400">
                        {new Date(post.created_at).toLocaleDateString()}
                      </td>
                      <td className="py-3 px-4 text-center text-black dark:text-white">
                        {formatNumber(views)}
                      </td>
                      <td className="py-3 px-4 text-center text-black dark:text-white">
                        {formatNumber(engagement)}
                      </td>
                      <td className="py-3 px-4 text-center text-black dark:text-white">
                        {getEngagementRate(post)}%
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            
            {recentPosts.length === 0 && (
              <div className="text-center py-8">
                <Calendar className="w-12 h-12 text-gray-600 dark:text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600 dark:text-gray-400">No posts found for this time period</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
