import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { FileText, Video, RefreshCw, Calendar, Trash2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { contentGenerator } from '@/services/contentGenerator';
import { notificationService } from '@/services/notificationService';
import { formatISTTime } from '@/utils/timeUtils';

interface ContentPost {
  id: string;
  platform_name: string;
  post_type: string;
  title: string;
  content: string;
  status: string;
  scheduled_for: string | null;
  posted_at: string | null;
  created_at: string;
  error_message?: string;
}

export const ContentPreview = () => {
  const { user } = useAuth();
  const [selectedTab, setSelectedTab] = useState('all');
  const [contentPosts, setContentPosts] = useState<ContentPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [regenerating, setRegenerating] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  useEffect(() => {
    if (user) {
      loadContentPosts();
      
      // Set up real-time subscription for content posts
      const channel = supabase
        .channel('content-posts-changes')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'content_posts',
            filter: `user_id=eq.${user.id}`
          },
          () => {
            loadContentPosts();
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [user]);

  const loadContentPosts = async () => {
    if (!user) return;
    
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('content_posts')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      setContentPosts(data || []);
    } catch (error) {
      console.error('Failed to load content posts:', error);
      await notificationService.showNotification({
        type: 'error',
        title: 'Load Failed',
        message: 'Failed to load content posts',
        timestamp: new Date().toISOString()
      });
    } finally {
      setLoading(false);
    }
  };

  const handleRegenerate = async (post: ContentPost) => {
    setRegenerating(post.id);
    try {
      // Get AI settings for topics
      const { data: aiSettings } = await supabase
        .from('ai_settings')
        .select('topics')
        .eq('user_id', user?.id)
        .single();

      const topics = Array.isArray(aiSettings?.topics) && aiSettings.topics.length > 0
        ? (aiSettings.topics as string[])
        : ['Technology', 'Programming', 'AI', 'Web Development'];

      const randomTopic = topics[Math.floor(Math.random() * topics.length)];
      
      // Generate new content
      const newContent = await contentGenerator.generateContent(post.platform_name, randomTopic);
      
      // Update the post
      const { error } = await supabase
        .from('content_posts')
        .update({
          title: newContent.title,
          content: newContent.content,
          media_url: newContent.mediaUrl,
          updated_at: new Date().toISOString(),
        })
        .eq('id', post.id);

      if (error) throw error;

      await notificationService.showNotification({
        type: 'success',
        title: 'Content Regenerated',
        message: `Content for ${post.platform_name} has been regenerated`,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error('Failed to regenerate content:', error);
      await notificationService.showNotification({
        type: 'error',
        title: 'Regeneration Failed',
        message: 'Failed to regenerate content',
        timestamp: new Date().toISOString()
      });
    } finally {
      setRegenerating(null);
    }
  };

  const handleDelete = async (postId: string) => {
    setDeleting(postId);
    try {
      console.log('Attempting to delete post with ID:', postId);
      
      const { error } = await supabase
        .from('content_posts')
        .delete()
        .eq('id', postId)
        .eq('user_id', user?.id); // Ensure user can only delete their own posts

      if (error) {
        console.error('Delete error:', error);
        throw error;
      }

      console.log('Post deleted successfully');
      
      // Remove from local state immediately for better UX
      setContentPosts(prev => prev.filter(post => post.id !== postId));

      await notificationService.showNotification({
        type: 'success',
        title: 'Content Deleted',
        message: 'Content post has been deleted successfully',
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error('Failed to delete content:', error);
      await notificationService.showNotification({
        type: 'error',
        title: 'Delete Failed',
        message: 'Failed to delete content post',
        timestamp: new Date().toISOString()
      });
    } finally {
      setDeleting(null);
    }
  };

  const filteredContent = selectedTab === 'all' 
    ? contentPosts 
    : contentPosts.filter(post => {
        switch (selectedTab) {
          case 'blog':
            return post.post_type === 'blog';
          case 'social':
            return post.post_type === 'social' || post.post_type === 'thread';
          case 'video':
            return post.post_type === 'video';
          default:
            return true;
        }
      });

  const formatTimeIST = (utcTime: string) => {
    return formatISTTime(utcTime, {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });
  };

  const getPlatformColor = (platform: string) => {
    const colors: { [key: string]: string } = {
      'hashnode': 'bg-blue-500/20 text-blue-400',
      'devto': 'bg-green-500/20 text-green-400', 
      'linkedin': 'bg-blue-600/20 text-blue-300',
      'twitter': 'bg-cyan-500/20 text-cyan-400',
      'instagram': 'bg-pink-500/20 text-pink-400',
      'youtube': 'bg-red-500/20 text-red-400',
      'reddit': 'bg-orange-500/20 text-orange-400',
    };
    return colors[platform] || 'bg-gray-500/20 text-gray-400';
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'posted':
        return 'bg-green-500/20 text-green-400';
      case 'scheduled':
        return 'bg-blue-500/20 text-blue-400';
      case 'failed':
        return 'bg-red-500/20 text-red-400';
      case 'draft':
        return 'bg-yellow-500/20 text-yellow-400';
      default:
        return 'bg-gray-500/20 text-gray-400';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-96">
        <div className="text-gray-400">Loading content...</div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold text-white mb-2">Content Preview</h1>
        <p className="text-gray-300">Review and manage AI-generated content</p>
      </div>

      <div className="flex items-center justify-between">
        <Tabs value={selectedTab} onValueChange={setSelectedTab} className="w-full">
          <TabsList className="bg-slate-800 border-slate-700">
            <TabsTrigger value="all" className="data-[state=active]:bg-blue-600">
              All Content ({contentPosts.length})
            </TabsTrigger>
            <TabsTrigger value="blog" className="data-[state=active]:bg-blue-600">
              <FileText className="w-4 h-4 mr-2" />
              Blog Posts ({contentPosts.filter(p => p.post_type === 'blog').length})
            </TabsTrigger>
            <TabsTrigger value="social" className="data-[state=active]:bg-blue-600">
              Social Posts ({contentPosts.filter(p => p.post_type === 'social' || p.post_type === 'thread').length})
            </TabsTrigger>
            <TabsTrigger value="video" className="data-[state=active]:bg-blue-600">
              <Video className="w-4 h-4 mr-2" />
              Videos ({contentPosts.filter(p => p.post_type === 'video').length})
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {filteredContent.length === 0 ? (
        <div className="text-center py-12">
          <div className="text-gray-400 text-lg">
            {contentPosts.length === 0 ? 'No content generated yet' : `No ${selectedTab} content found`}
          </div>
          <p className="text-gray-500 mt-2">
            {contentPosts.length === 0 
              ? 'Create posting schedules and start the scheduler to generate content automatically'
              : 'Try switching to a different content type or create new schedules'
            }
          </p>
        </div>
      ) : (
        <div className="grid lg:grid-cols-2 gap-6">
          {filteredContent.map((post) => (
            <Card key={post.id} className="bg-slate-800/50 border-slate-700 hover:border-slate-600 transition-all">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <Badge
                    variant="secondary"
                    className={getPlatformColor(post.platform_name)}
                  >
                    {post.platform_name.charAt(0).toUpperCase() + post.platform_name.slice(1)}
                  </Badge>
                  <Badge
                    variant="secondary"
                    className={getStatusColor(post.status)}
                  >
                    {post.status.charAt(0).toUpperCase() + post.status.slice(1)}
                  </Badge>
                </div>
                
                <CardTitle className="text-white text-lg leading-tight">
                  {post.title}
                </CardTitle>
              </CardHeader>

              <CardContent className="space-y-4">
                <div className="bg-slate-700/50 p-3 rounded-lg">
                  <p className="text-gray-300 text-sm leading-relaxed line-clamp-3">
                    {post.content}
                  </p>
                </div>

                {post.error_message && (
                  <div className="bg-red-500/10 border border-red-500/20 p-3 rounded-lg">
                    <p className="text-red-400 text-sm">
                      Error: {post.error_message}
                    </p>
                  </div>
                )}

                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center space-x-4 text-gray-400">
                    <span className="flex items-center">
                      <Calendar className="w-4 h-4 mr-1" />
                      {post.scheduled_for 
                        ? `Scheduled: ${formatTimeIST(post.scheduled_for)}`
                        : post.posted_at 
                        ? `Posted: ${formatTimeIST(post.posted_at)}`
                        : `Created: ${formatTimeIST(post.created_at)}`
                      }
                    </span>
                    <span className="capitalize text-xs bg-slate-700 px-2 py-1 rounded">
                      {post.post_type}
                    </span>
                  </div>
                </div>

                <div className="flex space-x-2 pt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleRegenerate(post)}
                    disabled={regenerating === post.id || deleting === post.id}
                    className="border-slate-600 text-gray-300 hover:text-white hover:border-slate-500"
                  >
                    <RefreshCw 
                      className={`w-4 h-4 mr-2 ${regenerating === post.id ? 'animate-spin' : ''}`} 
                    />
                    Regenerate
                  </Button>
                  
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDelete(post.id)}
                    disabled={deleting === post.id || regenerating === post.id}
                    className="border-red-600 text-red-400 hover:bg-red-900/20"
                  >
                    <Trash2 className={`w-4 h-4 mr-2 ${deleting === post.id ? 'animate-spin' : ''}`} />
                    {deleting === post.id ? 'Deleting...' : 'Delete'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};
