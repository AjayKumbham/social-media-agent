
import { supabase } from '@/integrations/supabase/client';

export interface PlatformAnalytics {
  platform: string;
  metrics: {
    views?: number;
    likes?: number;
    shares?: number;
    comments?: number;
    reach?: number;
    impressions?: number;
    clicks?: number;
    saves?: number;
    followers_gained?: number;
  };
  post_id: string;
  post_url?: string;
  created_at: string;
}

export interface AnalyticsSummary {
  total_posts: number;
  total_views: number;
  total_engagement: number;
  top_performing_posts: any[];
  platform_breakdown: Record<string, any>;
}

export class AnalyticsService {
  private async getCredentials(platform: string) {
    const { data: user } = await supabase.auth.getUser();
    if (!user.user) throw new Error('Not authenticated');

    const { data, error } = await supabase
      .from('platforms')
      .select('credentials')
      .eq('user_id', user.user.id)
      .eq('platform_name', platform)
      .eq('is_connected', true)
      .single();

    if (error || !data) throw new Error(`Platform ${platform} not connected`);
    return data.credentials as any;
  }

  async fetchHashnodeAnalytics(postId: string): Promise<PlatformAnalytics> {
    const credentials = await this.getCredentials('hashnode');
    
    const response = await fetch('https://gql.hashnode.com/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': credentials.access_token,
      },
      body: JSON.stringify({
        query: `
          query GetPost($id: ObjectId!) {
            post(id: $id) {
              views
              reactionCount
              responseCount
              url
            }
          }
        `,
        variables: { id: postId }
      })
    });

    const result = await response.json();
    
    return {
      platform: 'hashnode',
      metrics: {
        views: result.data?.post?.views || 0,
        likes: result.data?.post?.reactionCount || 0,
        comments: result.data?.post?.responseCount || 0,
      },
      post_id: postId,
      post_url: result.data?.post?.url,
      created_at: new Date().toISOString()
    };
  }

  async fetchDevToAnalytics(postId: string): Promise<PlatformAnalytics> {
    const credentials = await this.getCredentials('devto');
    
    const response = await fetch(`https://dev.to/api/articles/${postId}`, {
      headers: {
        'api-key': credentials.api_key,
      }
    });

    const post = await response.json();
    
    return {
      platform: 'devto',
      metrics: {
        views: post.page_views_count || 0,
        likes: post.public_reactions_count || 0,
        comments: post.comments_count || 0,
      },
      post_id: postId,
      post_url: post.url,
      created_at: new Date().toISOString()
    };
  }

  async fetchTwitterAnalytics(tweetId: string): Promise<PlatformAnalytics> {
    const credentials = await this.getCredentials('twitter');
    
    const response = await fetch(`https://api.twitter.com/2/tweets/${tweetId}?tweet.fields=public_metrics`, {
      headers: {
        'Authorization': `Bearer ${credentials.bearer_token}`,
      }
    });

    const result = await response.json();
    const metrics = result.data?.public_metrics || {};
    
    return {
      platform: 'twitter',
      metrics: {
        views: metrics.impression_count || 0,
        likes: metrics.like_count || 0,
        shares: metrics.retweet_count || 0,
        comments: metrics.reply_count || 0,
      },
      post_id: tweetId,
      post_url: `https://twitter.com/user/status/${tweetId}`,
      created_at: new Date().toISOString()
    };
  }

  async fetchLinkedInAnalytics(postId: string): Promise<PlatformAnalytics> {
    const credentials = await this.getCredentials('linkedin');
    
    const response = await fetch(`https://api.linkedin.com/v2/socialActions/${postId}/statistics`, {
      headers: {
        'Authorization': `Bearer ${credentials.access_token}`,
      }
    });

    const stats = await response.json();
    
    return {
      platform: 'linkedin',
      metrics: {
        views: stats.impressionCount || 0,
        likes: stats.likeCount || 0,
        shares: stats.shareCount || 0,
        comments: stats.commentCount || 0,
      },
      post_id: postId,
      created_at: new Date().toISOString()
    };
  }

  async fetchInstagramAnalytics(mediaId: string): Promise<PlatformAnalytics> {
    const credentials = await this.getCredentials('instagram');
    
    const response = await fetch(`https://graph.facebook.com/v18.0/${mediaId}/insights?metric=impressions,reach,likes,comments,shares,saved&access_token=${credentials.access_token}`);
    
    const result = await response.json();
    const metrics = result.data?.reduce((acc: any, metric: any) => {
      acc[metric.name] = metric.values[0]?.value || 0;
      return acc;
    }, {});
    
    return {
      platform: 'instagram',
      metrics: {
        impressions: metrics.impressions || 0,
        reach: metrics.reach || 0,
        likes: metrics.likes || 0,
        comments: metrics.comments || 0,
        shares: metrics.shares || 0,
        saves: metrics.saved || 0,
      },
      post_id: mediaId,
      created_at: new Date().toISOString()
    };
  }

  async fetchYouTubeAnalytics(videoId: string): Promise<PlatformAnalytics> {
    const credentials = await this.getCredentials('youtube');
    
    const response = await fetch(`https://www.googleapis.com/youtube/v3/videos?part=statistics&id=${videoId}&access_token=${credentials.access_token}`);
    
    const result = await response.json();
    const stats = result.items?.[0]?.statistics || {};
    
    return {
      platform: 'youtube',
      metrics: {
        views: parseInt(stats.viewCount || '0'),
        likes: parseInt(stats.likeCount || '0'),
        comments: parseInt(stats.commentCount || '0'),
      },
      post_id: videoId,
      post_url: `https://youtube.com/watch?v=${videoId}`,
      created_at: new Date().toISOString()
    };
  }

  async fetchRedditAnalytics(postId: string): Promise<PlatformAnalytics> {
    const credentials = await this.getCredentials('reddit');
    
    // Reddit requires OAuth, this is simplified
    const response = await fetch(`https://oauth.reddit.com/api/info?id=${postId}`, {
      headers: {
        'Authorization': `Bearer ${credentials.access_token}`,
        'User-Agent': credentials.user_agent,
      }
    });

    const result = await response.json();
    const post = result.data?.children?.[0]?.data || {};
    
    return {
      platform: 'reddit',
      metrics: {
        views: post.view_count || 0,
        likes: post.ups || 0,
        comments: post.num_comments || 0,
      },
      post_id: postId,
      post_url: `https://reddit.com${post.permalink}`,
      created_at: new Date().toISOString()
    };
  }

  async updatePostAnalytics(postId: string): Promise<void> {
    const { data: post } = await supabase
      .from('content_posts')
      .select('*')
      .eq('id', postId)
      .single();

    if (!post || !post.platform_post_id) return;

    let analytics: PlatformAnalytics;

    try {
      switch (post.platform_name) {
        case 'hashnode':
          analytics = await this.fetchHashnodeAnalytics(post.platform_post_id);
          break;
        case 'devto':
          analytics = await this.fetchDevToAnalytics(post.platform_post_id);
          break;
        case 'twitter':
          analytics = await this.fetchTwitterAnalytics(post.platform_post_id);
          break;
        case 'linkedin':
          analytics = await this.fetchLinkedInAnalytics(post.platform_post_id);
          break;
        case 'instagram':
          analytics = await this.fetchInstagramAnalytics(post.platform_post_id);
          break;
        case 'youtube':
          analytics = await this.fetchYouTubeAnalytics(post.platform_post_id);
          break;
        case 'reddit':
          analytics = await this.fetchRedditAnalytics(post.platform_post_id);
          break;
        default:
          return;
      }

      await supabase
        .from('content_posts')
        .update({ analytics: analytics.metrics })
        .eq('id', postId);

    } catch (error) {
      console.error(`Failed to fetch analytics for ${post.platform_name}:`, error);
    }
  }

  async getAnalyticsSummary(): Promise<AnalyticsSummary> {
    const { data: user } = await supabase.auth.getUser();
    if (!user.user) throw new Error('Not authenticated');

    const { data: posts } = await supabase
      .from('content_posts')
      .select('*')
      .eq('user_id', user.user.id)
      .eq('status', 'posted');

    if (!posts) return {
      total_posts: 0,
      total_views: 0,
      total_engagement: 0,
      top_performing_posts: [],
      platform_breakdown: {}
    };

    const totalPosts = posts.length;
    const totalViews = posts.reduce((sum, post) => {
      const analytics = post.analytics as any;
      return sum + (analytics?.views || analytics?.impressions || 0);
    }, 0);

    const totalEngagement = posts.reduce((sum, post) => {
      const analytics = post.analytics as any;
      return sum + (analytics?.likes || 0) + (analytics?.comments || 0) + (analytics?.shares || 0);
    }, 0);

    const topPosts = posts
      .sort((a, b) => {
        const aViews = (a.analytics as any)?.views || (a.analytics as any)?.impressions || 0;
        const bViews = (b.analytics as any)?.views || (b.analytics as any)?.impressions || 0;
        return bViews - aViews;
      })
      .slice(0, 5);

    const platformBreakdown = posts.reduce((acc, post) => {
      const platform = post.platform_name;
      if (!acc[platform]) {
        acc[platform] = { posts: 0, views: 0, engagement: 0 };
      }
      acc[platform].posts++;
      const analytics = post.analytics as any;
      acc[platform].views += (analytics?.views || analytics?.impressions || 0);
      acc[platform].engagement += (analytics?.likes || 0) + (analytics?.comments || 0) + (analytics?.shares || 0);
      return acc;
    }, {} as Record<string, any>);

    return {
      total_posts: totalPosts,
      total_views: totalViews,
      total_engagement: totalEngagement,
      top_performing_posts: topPosts,
      platform_breakdown: platformBreakdown
    };
  }
}

export const analyticsService = new AnalyticsService();
