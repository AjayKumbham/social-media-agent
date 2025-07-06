import { supabase } from '@/integrations/supabase/client';
import { getCurrentISTTimestamp } from '@/utils/timeUtils';

export interface PostContent {
  title: string;
  content: string;
  tags?: string[];
  mediaUrl?: string;
  mediaType?: 'image' | 'video';
  isReel?: boolean; // For Instagram reels vs posts
}

interface PlatformCredentials {
  access_token?: string;
  api_key?: string;
  api_secret?: string;
  access_token_secret?: string;
  person_id?: string;
  business_account_id?: string;
  publication_id?: string;
  client_id?: string;
  client_secret?: string;
  refresh_token?: string;
  username?: string;
  password?: string;
  facebook_page_id?: string;
  app_id?: string;
  app_secret?: string;
  channel_id?: string;
  user_agent?: string;
  subreddits?: string;
  bearer_token?: string;
  page_id?: string;
  project_id?: string;
  rate_limit_remaining?: number;
  last_used?: string;
  connection_health?: 'healthy' | 'warning' | 'error';
  [key: string]: string | number | undefined;
}

export class PlatformAPI {
  private async getCredentials(platform: string): Promise<PlatformCredentials> {
    const { data: user } = await supabase.auth.getUser();
    if (!user.user) throw new Error('Not authenticated');

    const { data, error } = await supabase
      .from('platforms')
      .select('credentials')
      .eq('user_id', user.user.id)
      .eq('platform_name', platform)
      .eq('is_connected', true)
      .maybeSingle();

    if (error || !data) {
      console.error(`Platform ${platform} not connected:`, error);
      throw new Error(`Platform ${platform} not connected. Please configure it in Platform Setup.`);
    }
    return data.credentials as PlatformCredentials;
  }

  private async updateCredentials(platform: string, credentials: PlatformCredentials): Promise<void> {
    const { data: user } = await supabase.auth.getUser();
    if (!user.user) throw new Error('Not authenticated');

    // Update usage tracking
    const updatedCredentials = {
      ...credentials,
      last_used: getCurrentISTTimestamp(),
      connection_health: 'healthy' as const
    };

    await supabase
      .from('platforms')
      .update({ credentials: updatedCredentials })
      .eq('user_id', user.user.id)
      .eq('platform_name', platform);
  }

  private async validatePlatformAccess(platform: string, credentials: PlatformCredentials): Promise<void> {
    // Validate required fields based on platform
    const requiredFields: Record<string, string[]> = {
      twitter: ['api_key', 'api_secret', 'access_token', 'access_token_secret'],
      linkedin: ['access_token', 'client_id', 'client_secret'],
      instagram: ['access_token', 'business_account_id', 'app_id', 'app_secret'],
      youtube: ['access_token', 'refresh_token', 'client_id', 'client_secret'],
      reddit: ['access_token', 'client_id', 'client_secret', 'username'],
      hashnode: ['access_token'],
      devto: ['api_key']
    };

    const required = requiredFields[platform] || [];
    const missing = required.filter(field => !credentials[field]);
    
    if (missing.length > 0) {
      throw new Error(`Missing required ${platform} credentials: ${missing.join(', ')}. Please reconfigure in Platform Setup.`);
    }
  }

  private async refreshYouTubeToken(credentials: PlatformCredentials): Promise<string> {
    if (!credentials.refresh_token || !credentials.client_id || !credentials.client_secret) {
      throw new Error('Missing required credentials for YouTube token refresh');
    }

    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: credentials.client_id,
        client_secret: credentials.client_secret,
        refresh_token: credentials.refresh_token,
        grant_type: 'refresh_token',
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`YouTube token refresh failed: ${errorData.error_description || 'Unknown error'}`);
    }

    const data = await response.json();
    const newAccessToken = data.access_token;

    await this.updateCredentials('youtube', {
      ...credentials,
      access_token: newAccessToken,
    });

    return newAccessToken;
  }

  private async refreshLinkedInToken(credentials: PlatformCredentials): Promise<string> {
    if (!credentials.refresh_token || !credentials.client_id || !credentials.client_secret) {
      throw new Error('Missing required credentials for LinkedIn token refresh');
    }

    const response = await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: credentials.refresh_token,
        client_id: credentials.client_id,
        client_secret: credentials.client_secret,
      }),
    });

    if (!response.ok) {
      throw new Error('LinkedIn token refresh failed');
    }

    const data = await response.json();
    const newAccessToken = data.access_token;

    await this.updateCredentials('linkedin', {
      ...credentials,
      access_token: newAccessToken,
    });

    return newAccessToken;
  }

  private async refreshInstagramToken(credentials: PlatformCredentials): Promise<string> {
    if (!credentials.app_id || !credentials.app_secret || !credentials.access_token) {
      throw new Error('Missing required credentials for Instagram token refresh');
    }

    const response = await fetch(`https://graph.facebook.com/oauth/access_token?grant_type=fb_exchange_token&client_id=${credentials.app_id}&client_secret=${credentials.app_secret}&fb_exchange_token=${credentials.access_token}`);

    if (!response.ok) {
      throw new Error('Instagram token refresh failed');
    }

    const data = await response.json();
    const newAccessToken = data.access_token;

    await this.updateCredentials('instagram', {
      ...credentials,
      access_token: newAccessToken,
    });

    return newAccessToken;
  }

  private validateYouTubeContent(content: PostContent): void {
    // Validate required content
    if (!content.mediaUrl || content.mediaType !== 'video') {
      throw new Error('YouTube Shorts require video content');
    }

    // Validate title length (YouTube limit: 100 characters)
    if (!content.title?.trim()) {
      throw new Error('Title is required for YouTube videos');
    }
    
    if (content.title.trim().length > 100) {
      throw new Error(`YouTube title exceeds 100 character limit (${content.title.length} characters)`);
    }

    // Validate description length (YouTube limit: 5000 characters)
    const description = content.content?.trim() || '';
    if (description.length > 5000) {
      throw new Error(`YouTube description exceeds 5000 character limit (${description.length} characters)`);
    }

    // Validate tags (YouTube allows up to 500 characters total for tags)
    if (content.tags && content.tags.length > 0) {
      const tagsString = content.tags.join(',');
      if (tagsString.length > 500) {
        throw new Error('YouTube tags exceed 500 character limit');
      }
      
      if (content.tags.length > 15) {
        throw new Error('YouTube allows maximum 15 tags per video');
      }
    }

    // Note: Video duration, file size, and aspect ratio validation will be handled in the edge function
    // as we need to analyze the actual video file
  }

  private async validateYouTubeAccess(accessToken: string): Promise<void> {
    try {
      // Check if token is valid and has required scopes
      const response = await fetch('https://www.googleapis.com/youtube/v3/channels?part=snippet,status&mine=true', {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        },
      });

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error('YouTube access token is invalid or expired. Please reconnect your YouTube account.');
        } else if (response.status === 403) {
          const errorData = await response.json();
          if (errorData.error?.message?.includes('quota')) {
            throw new Error('YouTube API quota exceeded. Please try again later.');
          } else if (errorData.error?.message?.includes('scope')) {
            throw new Error('Insufficient YouTube permissions. Please reconnect with proper scopes.');
          } else {
            throw new Error('YouTube access forbidden. Please check your account permissions.');
          }
        }
        throw new Error(`YouTube API error: ${response.status}`);
      }

      const channelData = await response.json();
      
      if (!channelData.items || channelData.items.length === 0) {
        throw new Error('No YouTube channel found. Please ensure you have a YouTube channel.');
      }

      const channel = channelData.items[0];
      
      // Check if channel is eligible for Shorts (generally all channels are, but good to verify)
      if (!channel.status?.isLinked) {
        console.warn('YouTube channel may not be fully verified for all features');
      }

      console.log('YouTube access validation successful:', {
        channelId: channel.id,
        channelTitle: channel.snippet.title,
        isLinked: channel.status?.isLinked
      });

    } catch (error) {
      console.error('YouTube access validation failed:', error);
      throw error;
    }
  }

  async postToHashnode(content: PostContent): Promise<string> {
    const credentials = await this.getCredentials('hashnode');
    await this.validatePlatformAccess('hashnode', credentials);
    
    // Validate content
    if (!content.title?.trim()) {
      throw new Error('Title is required for Hashnode posts');
    }
    
    if (!content.content?.trim()) {
      throw new Error('Content is required for Hashnode posts');
    }

    console.log('Posting to Hashnode with content:', { 
      title: content.title, 
      contentLength: content.content.length,
      tags: content.tags,
      publicationId: credentials.publication_id 
    });
    
    const response = await fetch('https://gql.hashnode.com/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${credentials.access_token}`,
      },
      body: JSON.stringify({
        query: `
          mutation PublishPost($input: PublishPostInput!) {
            publishPost(input: $input) {
              post {
                id
                url
                title
              }
            }
          }
        `,
        variables: {
          input: {
            title: content.title.trim(),
            contentMarkdown: content.content.trim(),
            tags: content.tags?.filter(tag => tag.trim()).map(tag => ({ name: tag.trim() })) || [],
            publicationId: credentials.publication_id || undefined,
            publishAs: credentials.publication_id ? undefined : "user",
          }
        }
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Hashnode API error:', response.status, errorText);
      
      if (response.status === 401) {
        throw new Error('Hashnode access token is invalid. Please update your credentials in Platform Setup.');
      } else if (response.status === 400) {
        throw new Error('Hashnode request validation failed. Check your content format and publication settings.');
      } else {
        throw new Error(`Hashnode API error: ${response.status} - ${errorText}`);
      }
    }

    const result = await response.json();
    
    // Enhanced error handling for GraphQL errors
    if (result.errors) {
      console.error('Hashnode GraphQL errors:', result.errors);
      const errorMessage = result.errors[0]?.message || 'Unknown GraphQL error';
      
      if (errorMessage.includes('Publication not found')) {
        throw new Error('Hashnode publication not found. Please check your publication ID in Platform Setup.');
      } else if (errorMessage.includes('Unauthorized')) {
        throw new Error('Hashnode authorization failed. Please update your access token in Platform Setup.');
      } else {
        throw new Error(`Hashnode error: ${errorMessage}`);
      }
    }

    if (!result.data?.publishPost?.post?.id) {
      throw new Error('Hashnode did not return a valid post ID');
    }
    
    console.log('Hashnode post successful:', result.data.publishPost.post);
    await this.updateCredentials('hashnode', credentials);
    return result.data.publishPost.post.id;
  }

  async postToDevTo(content: PostContent): Promise<string> {
    const credentials = await this.getCredentials('devto');
    await this.validatePlatformAccess('devto', credentials);
    
    // Validate content
    if (!content.title?.trim()) {
      throw new Error('Title is required for Dev.to posts');
    }

    if (content.title.trim().length > 250) {
      throw new Error('Dev.to title must be 250 characters or less');
    }
    
    if (!content.content?.trim()) {
      throw new Error('Content is required for Dev.to posts');
    }

    // Process and validate tags
    let processedTags: string[] = [];
    if (content.tags && content.tags.length > 0) {
      // Dev.to allows max 4 tags
      const limitedTags = content.tags.slice(0, 4);
      
      processedTags = limitedTags
        .map(tag => tag.trim().toLowerCase().replace(/\s+/g, '')) // Remove spaces, convert to lowercase
        .filter(tag => tag.length > 0 && tag.length <= 20) // Filter valid tags (max 20 chars)
        .filter(tag => /^[a-z0-9]+$/.test(tag)); // Only alphanumeric characters

      if (processedTags.length !== limitedTags.length) {
        console.warn('Some tags were filtered out due to invalid format. Valid tags:', processedTags);
      }
    }

    console.log('Posting to Dev.to with content:', { 
      title: content.title.trim(), 
      contentLength: content.content.length,
      tags: processedTags,
      originalTags: content.tags 
    });
    
    const response = await fetch('https://dev.to/api/articles', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': credentials.api_key!,
      },
      body: JSON.stringify({
        article: {
          title: content.title.trim(),
          body_markdown: content.content.trim(),
          tags: processedTags,
          published: true,
        }
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Dev.to API error:', response.status, errorText);
      
      let errorMessage = 'Dev.to API error';
      
      if (response.status === 401) {
        errorMessage = 'Dev.to API key is invalid. Please update your credentials in Platform Setup.';
      } else if (response.status === 422) {
        try {
          const errorData = JSON.parse(errorText);
          if (errorData.error && typeof errorData.error === 'string') {
            errorMessage = `Dev.to validation error: ${errorData.error}`;
          } else if (errorData.errors) {
            const errorMessages = Object.entries(errorData.errors)
              .map(([field, messages]) => `${field}: ${Array.isArray(messages) ? messages.join(', ') : messages}`)
              .join('; ');
            errorMessage = `Dev.to validation errors: ${errorMessages}`;
          } else {
            errorMessage = 'Dev.to article validation failed. Check your content format.';
          }
        } catch (parseError) {
          errorMessage = 'Dev.to article validation failed. Check your content format.';
        }
      } else if (response.status === 429) {
        errorMessage = 'Dev.to rate limit exceeded. Please try again later.';
      } else {
        errorMessage = `Dev.to API error: ${response.status} - ${errorText}`;
      }
      
      throw new Error(errorMessage);
    }

    const result = await response.json();
    
    // Validate response structure
    if (!result || typeof result !== 'object') {
      throw new Error('Dev.to returned invalid response format');
    }

    if (!result.id) {
      console.error('Dev.to response missing ID:', result);
      throw new Error('Dev.to did not return a valid article ID');
    }

    // Additional validation for successful publication
    if (result.published === false) {
      console.warn('Dev.to article was created but not published:', result);
    }

    console.log('Dev.to post successful:', {
      id: result.id,
      title: result.title,
      url: result.url,
      published: result.published
    });
    
    await this.updateCredentials('devto', credentials);
    return result.id.toString();
  }

  async postToTwitter(content: PostContent): Promise<string> {
    // Validate content before sending
    if (!content.content?.trim()) {
      throw new Error('Tweet content is required');
    }

    const tweetText = content.content.trim();
    
    // Twitter character limit validation
    if (tweetText.length > 280) {
      throw new Error(`Tweet exceeds 280 character limit (${tweetText.length} characters)`);
    }

    // Validate media if provided
    if (content.mediaUrl) {
      if (!content.mediaType) {
        throw new Error('Media type is required when media URL is provided');
      }
      
      if (!['image', 'video'].includes(content.mediaType)) {
        throw new Error('Media type must be either "image" or "video"');
      }
    }

    console.log('Posting to Twitter:', {
      contentLength: tweetText.length,
      hasMedia: !!content.mediaUrl,
      mediaType: content.mediaType
    });

    try {
      const { data, error } = await supabase.functions.invoke('post-to-twitter', {
        body: { 
          content: tweetText,
          mediaUrl: content.mediaUrl,
          mediaType: content.mediaType
        }
      });

      if (error) {
        console.error('Twitter Edge Function error:', error);
        throw new Error(error.message || 'Twitter posting failed');
      }

      if (!data?.tweetId) {
        throw new Error('Twitter did not return a valid tweet ID');
      }

      console.log('Twitter post successful:', {
        tweetId: data.tweetId,
        url: data.url
      });

      // Update credentials tracking for Twitter (get credentials first)
      try {
        const credentials = await this.getCredentials('twitter');
        await this.updateCredentials('twitter', credentials);
      } catch (credError) {
        console.warn('Could not update Twitter credentials tracking:', credError);
        // Don't fail the posting operation if credential tracking fails
      }

      return data.tweetId;
    } catch (error) {
      console.error('Twitter posting failed:', error);
      
      // Enhanced error handling
      let errorMessage = 'Failed to post to Twitter';
      
      if (error.message.includes('Twitter not connected')) {
        errorMessage = 'Twitter not connected. Please configure Twitter in Platform Setup.';
      } else if (error.message.includes('authentication failed')) {
        errorMessage = 'Twitter authentication failed. Please check your API keys in Platform Setup.';
      } else if (error.message.includes('403') || error.message.includes('forbidden')) {
        errorMessage = 'Twitter access forbidden. Ensure your app has read/write permissions.';
      } else if (error.message.includes('429') || error.message.includes('rate limit')) {
        errorMessage = 'Twitter rate limit exceeded. Please try again later.';
      } else if (error.message.includes('character limit')) {
        errorMessage = error.message;
      } else if (error.message.includes('Media')) {
        errorMessage = error.message;
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      throw new Error(errorMessage);
    }
  }

  async postToLinkedIn(content: PostContent): Promise<string> {
    const credentials = await this.getCredentials('linkedin');
    await this.validatePlatformAccess('linkedin', credentials);
    
    // Validate required credentials
    if (!credentials.person_id) {
      throw new Error('LinkedIn person ID not configured. Please test your connection to get the person ID.');
    }

    // Validate content
    if (!content.content?.trim()) {
      throw new Error('Content is required for LinkedIn posts');
    }

    const postText = content.content.trim();
    
    // LinkedIn character limit validation (3000 characters)
    if (postText.length > 3000) {
      throw new Error(`LinkedIn post exceeds 3000 character limit (${postText.length} characters)`);
    }

    // Format person URN correctly
    const personUrn = credentials.person_id.startsWith('urn:li:person:') 
      ? credentials.person_id 
      : `urn:li:person:${credentials.person_id}`;

    console.log('Posting to LinkedIn with content:', { 
      contentLength: postText.length,
      personUrn: personUrn
    });

    let accessToken = credentials.access_token!;

    // Try to refresh token if we have refresh capability
    if (credentials.refresh_token) {
      try {
        accessToken = await this.refreshLinkedInToken(credentials);
      } catch (refreshError) {
        console.warn('LinkedIn token refresh failed, using existing token:', refreshError);
      }
    }

    const response = await fetch('https://api.linkedin.com/v2/posts', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
        'LinkedIn-Version': '202310',
        'X-Restli-Protocol-Version': '2.0.0',
      },
      body: JSON.stringify({
        author: personUrn,
        commentary: postText,
        visibility: 'PUBLIC',
        distribution: {
          feedDistribution: 'MAIN_FEED',
          targetEntities: [],
          thirdPartyDistributionChannels: []
        },
        lifecycleState: 'PUBLISHED'
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('LinkedIn API error:', response.status, errorText);
      
      let errorMessage = 'LinkedIn API error';
      
      if (response.status === 401) {
        errorMessage = 'LinkedIn access token is invalid or expired. Please update your credentials in Platform Setup.';
      } else if (response.status === 403) {
        errorMessage = 'LinkedIn access forbidden. Ensure your app has the required permissions (w_member_social).';
      } else if (response.status === 400) {
        try {
          const errorData = JSON.parse(errorText);
          if (errorData.message) {
            errorMessage = `LinkedIn validation error: ${errorData.message}`;
          } else {
            errorMessage = 'LinkedIn request validation failed. Check your content format and person ID.';
          }
        } catch (parseError) {
          errorMessage = 'LinkedIn request validation failed. Check your content format and person ID.';
        }
      } else if (response.status === 429) {
        errorMessage = 'LinkedIn rate limit exceeded. Please try again later.';
      } else if (response.status === 500) {
        errorMessage = 'LinkedIn server error. Please try again later.';
      } else {
        errorMessage = `LinkedIn API error: ${response.status} - ${errorText}`;
      }
      
      throw new Error(errorMessage);
    }

    const result = await response.json();
    
    // Validate response structure
    if (!result || typeof result !== 'object') {
      throw new Error('LinkedIn returned invalid response format');
    }

    if (!result.id) {
      console.error('LinkedIn response missing ID:', result);
      throw new Error('LinkedIn did not return a valid post ID');
    }

    console.log('LinkedIn post successful:', {
      id: result.id,
      lifecycleState: result.lifecycleState
    });
    
    await this.updateCredentials('linkedin', credentials);
    return result.id;
  }

  async postToInstagram(content: PostContent): Promise<string> {
    const credentials = await this.getCredentials('instagram');
    await this.validatePlatformAccess('instagram', credentials);
    
    // Validate content requirements
    if (!content.mediaUrl) {
      throw new Error('Instagram posts require media content (image or video)');
    }

    if (!content.mediaType) {
      throw new Error('Media type is required for Instagram posts');
    }

    // Validate caption length (Instagram limit is 2,200 characters)
    const caption = content.content?.trim() || '';
    if (caption.length > 2200) {
      throw new Error(`Instagram caption exceeds 2,200 character limit (${caption.length} characters)`);
    }

    // Validate hashtags (max 30 hashtags allowed)
    const hashtagCount = (caption.match(/#\w+/g) || []).length;
    if (hashtagCount > 30) {
      throw new Error(`Instagram posts can have maximum 30 hashtags (found ${hashtagCount})`);
    }

    // Validate media type
    if (!['image', 'video'].includes(content.mediaType)) {
      throw new Error('Instagram media type must be either "image" or "video"');
    }

    const isReel = content.isReel || content.mediaType === 'video';
    const mediaType = isReel ? 'REELS' : 'IMAGE';

    console.log('Posting to Instagram:', {
      mediaType,
      isReel,
      captionLength: caption.length,
      hashtagCount,
      businessAccountId: credentials.business_account_id
    });

    try {
      // First, validate the access token and permissions
      await this.validateInstagramToken(credentials.access_token, credentials.business_account_id);

      // Create media container
      const mediaEndpoint = `https://graph.facebook.com/v19.0/${credentials.business_account_id}/media`;
      const mediaPayload: any = {
        caption: caption,
        media_type: mediaType,
        access_token: credentials.access_token,
      };

      // Add media URL based on type
      if (isReel) {
        mediaPayload.video_url = content.mediaUrl;
      } else {
        mediaPayload.image_url = content.mediaUrl;
      }

      console.log('Creating Instagram media container:', mediaPayload);

      const mediaResponse = await fetch(mediaEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(mediaPayload)
      });

      if (!mediaResponse.ok) {
        const errorText = await mediaResponse.text();
        console.error('Instagram media creation error:', mediaResponse.status, errorText);
        
        let errorData;
        try {
          errorData = JSON.parse(errorText);
        } catch (e) {
          errorData = { error: { message: errorText } };
        }

        throw new Error(this.formatInstagramError(mediaResponse.status, errorData));
      }

      const mediaResult = await mediaResponse.json();
      
      if (!mediaResult.id) {
        throw new Error('Instagram did not return a valid media container ID');
      }

      console.log('Instagram media container created:', mediaResult.id);

      // For videos/reels, wait for processing to complete
      if (isReel) {
        await this.waitForInstagramVideoProcessing(mediaResult.id, credentials.access_token);
      }

      // Publish the media
      const publishEndpoint = `https://graph.facebook.com/v19.0/${credentials.business_account_id}/media_publish`;
      const publishResponse = await fetch(publishEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          creation_id: mediaResult.id,
          access_token: credentials.access_token,
        })
      });

      if (!publishResponse.ok) {
        const errorText = await publishResponse.text();
        console.error('Instagram publish error:', publishResponse.status, errorText);
        
        let errorData;
        try {
          errorData = JSON.parse(errorText);
        } catch (e) {
          errorData = { error: { message: errorText } };
        }

        throw new Error(this.formatInstagramError(publishResponse.status, errorData));
      }

      const publishResult = await publishResponse.json();
      
      if (!publishResult.id) {
        throw new Error('Instagram did not return a valid post ID');
      }

      console.log('Instagram post published successfully:', {
        postId: publishResult.id,
        mediaType,
        isReel
      });

      await this.updateCredentials('instagram', credentials);
      return publishResult.id;

    } catch (error) {
      console.error('Instagram posting failed:', error);
      
      // Enhanced error handling with specific Instagram error codes
      if (error.message.includes('Instagram')) {
        throw error; // Re-throw Instagram-specific errors
      }
      
      throw new Error(`Failed to post to Instagram: ${error.message}`);
    }
  }

  private async validateInstagramToken(accessToken: string, businessAccountId: string): Promise<void> {
    try {
      // Check token validity and permissions
      const response = await fetch(`https://graph.facebook.com/v19.0/${businessAccountId}?fields=id,username,account_type&access_token=${accessToken}`);
      
      if (!response.ok) {
        const errorData = await response.json();
        if (response.status === 190) {
          throw new Error('Instagram access token is invalid or expired. Please update your credentials in Platform Setup.');
        } else if (response.status === 100) {
          throw new Error('Instagram API request is invalid. Please check your business account ID.');
        }
        throw new Error(`Instagram token validation failed: ${errorData.error?.message || 'Unknown error'}`);
      }

      const accountData = await response.json();
      
      // Verify it's a business account
      if (accountData.account_type !== 'BUSINESS') {
        throw new Error('Instagram account must be a Business account to post content. Please convert your account to Business.');
      }

      console.log('Instagram token validation successful:', {
        accountId: accountData.id,
        username: accountData.username,
        accountType: accountData.account_type
      });

    } catch (error) {
      console.error('Instagram token validation failed:', error);
      throw error;
    }
  }

  private formatInstagramError(status: number, errorData: any): string {
    const errorMessage = errorData?.error?.message || 'Unknown Instagram API error';
    const errorCode = errorData?.error?.code;

    switch (status) {
      case 400:
        if (errorCode === 100) {
          return 'Instagram API request is invalid. Please check your media URL and account settings.';
        } else if (errorCode === 368) {
          return 'Instagram media file is invalid or corrupted. Please check your image/video format and size.';
        } else if (errorMessage.includes('media')) {
          return 'Instagram media validation failed. Ensure your image is JPEG/PNG (max 8MB) or video is MP4/MOV (max 100MB, 15-90 seconds for Reels).';
        }
        return `Instagram validation error: ${errorMessage}`;
      
      case 190:
        return 'Instagram access token is invalid or expired. Please update your credentials in Platform Setup.';
      
      case 403:
        return 'Instagram access forbidden. Ensure your app has the required permissions (instagram_basic, instagram_content_publish).';
      
      case 613:
        return 'Instagram rate limit exceeded for media uploads. Please try again later.';
      
      case 429:
        return 'Instagram API rate limit exceeded. Please try again later.';
      
      case 500:
      case 502:
      case 503:
        return 'Instagram server error. Please try again later.';
      
      default:
        return `Instagram API error (${status}): ${errorMessage}`;
    }
  }

  private async waitForInstagramVideoProcessing(containerId: string, accessToken: string): Promise<void> {
    const maxAttempts = 30; // 60 seconds max wait time
    let attempts = 0;
    
    console.log('Waiting for Instagram video processing:', containerId);
    
    while (attempts < maxAttempts) {
      try {
        const statusResponse = await fetch(`https://graph.facebook.com/v19.0/${containerId}?fields=status_code&access_token=${accessToken}`);
        
        if (!statusResponse.ok) {
          throw new Error(`Failed to check video processing status: ${statusResponse.status}`);
        }
        
        const statusResult = await statusResponse.json();
        console.log(`Instagram video processing attempt ${attempts + 1}:`, statusResult.status_code);
        
        if (statusResult.status_code === 'FINISHED') {
          console.log('Instagram video processing completed successfully');
          return;
        } else if (statusResult.status_code === 'ERROR') {
          throw new Error('Instagram video processing failed. Please check your video format and size.');
        } else if (statusResult.status_code === 'EXPIRED') {
          throw new Error('Instagram video processing expired. Please try uploading again.');
        }
        
        // Wait 2 seconds before next check
        await new Promise(resolve => setTimeout(resolve, 2000));
        attempts++;
        
      } catch (error) {
        console.error(`Instagram video processing check failed (attempt ${attempts + 1}):`, error);
        
        if (attempts >= maxAttempts - 1) {
          throw new Error('Instagram video processing timeout. Please try again with a smaller video file.');
        }
        
        await new Promise(resolve => setTimeout(resolve, 2000));
        attempts++;
      }
    }
    
    throw new Error('Instagram video processing timeout. Please try again with a smaller video file.');
  }

  async postToYouTube(content: PostContent): Promise<string> {
    // Validate content first
    this.validateYouTubeContent(content);
    
    const credentials = await this.getCredentials('youtube');
    await this.validatePlatformAccess('youtube', credentials);
    
    if (!credentials.access_token || !credentials.refresh_token || !credentials.client_id || !credentials.client_secret) {
      throw new Error('YouTube credentials incomplete. Please reconfigure YouTube in Platform Setup.');
    }

    let accessToken = credentials.access_token;
    
    try {
      // Validate access token and permissions
      await this.validateYouTubeAccess(accessToken);
      
    } catch (error) {
      if (error.message.includes('invalid') || error.message.includes('expired')) {
        try {
          console.log('Refreshing YouTube access token...');
          accessToken = await this.refreshYouTubeToken(credentials);
          await this.validateYouTubeAccess(accessToken);
        } catch (refreshError) {
          console.error('Token refresh failed:', refreshError);
          throw new Error('YouTube authentication failed. Please reconnect your YouTube account in Platform Setup.');
        }
      } else {
        throw error;
      }
    }

    console.log('Uploading to YouTube Shorts:', {
      title: content.title,
      descriptionLength: content.content?.length || 0,
      tags: content.tags,
      mediaUrl: content.mediaUrl
    });

    try {
      // Upload video using enhanced edge function
      const { data, error } = await supabase.functions.invoke('upload-youtube-short', {
        body: { 
          videoUrl: content.mediaUrl,
          title: content.title.trim(),
          description: (content.content?.trim() || '') + '\n\n#Shorts',
          tags: [...(content.tags || []), 'Shorts'],
          accessToken
        }
      });

      if (error) {
        console.error('YouTube upload edge function error:', error);
        throw new Error(error.message || 'YouTube upload failed');
      }

      if (!data?.videoId) {
        throw new Error('YouTube did not return a valid video ID');
      }

      console.log('YouTube upload successful:', {
        videoId: data.videoId,
        url: data.url,
        title: content.title
      });

      await this.updateCredentials('youtube', credentials);
      return data.videoId;
      
    } catch (error) {
      console.error('YouTube upload failed:', error);
      
      // Enhanced error handling
      let errorMessage = 'Failed to upload to YouTube';
      
      if (error.message.includes('quota')) {
        errorMessage = 'YouTube API quota exceeded. Please try again later.';
      } else if (error.message.includes('size') || error.message.includes('too large')) {
        errorMessage = 'Video file is too large. YouTube Shorts must be under 100MB and 60 seconds.';
      } else if (error.message.includes('duration')) {
        errorMessage = 'Video is too long. YouTube Shorts must be 60 seconds or less.';
      } else if (error.message.includes('format')) {
        errorMessage = 'Invalid video format. Please use MP4, MOV, or WebM format.';
      } else if (error.message.includes('authentication') || error.message.includes('token')) {
        errorMessage = 'YouTube authentication failed. Please reconnect your account in Platform Setup.';
      } else if (error.message.includes('403')) {
        errorMessage = 'YouTube access forbidden. Check your account permissions and API quotas.';
      } else if (error.message.includes('400')) {
        errorMessage = 'YouTube request validation failed. Check your video content and metadata.';
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      throw new Error(errorMessage);
    }
  }

  private async refreshRedditToken(credentials: PlatformCredentials): Promise<string> {
    if (!credentials.refresh_token || !credentials.client_id || !credentials.client_secret) {
      throw new Error('Missing required credentials for Reddit token refresh');
    }

    const auth = btoa(`${credentials.client_id}:${credentials.client_secret}`);
    
    const response = await fetch('https://www.reddit.com/api/v1/access_token', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'SocialScheduler/1.0 by ' + credentials.username,
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: credentials.refresh_token,
      }),
    });

    if (!response.ok) {
      throw new Error('Failed to refresh Reddit access token');
    }

    const data = await response.json();
    const newAccessToken = data.access_token;

    await this.updateCredentials('reddit', {
      ...credentials,
      access_token: newAccessToken,
    });

    return newAccessToken;
  }

  private validateRedditContent(content: PostContent): void {
    // Validate title (Reddit limit: 300 characters)
    if (!content.title?.trim()) {
      throw new Error('Title is required for Reddit posts');
    }
    
    if (content.title.trim().length > 300) {
      throw new Error(`Reddit title exceeds 300 character limit (${content.title.length} characters)`);
    }

    // Validate content (Reddit limit: 40,000 characters for self posts)
    if (!content.content?.trim()) {
      throw new Error('Content is required for Reddit posts');
    }

    const contentText = content.content.trim();
    if (contentText.length > 40000) {
      throw new Error(`Reddit post content exceeds 40,000 character limit (${contentText.length} characters)`);
    }

    // Validate that we don't have both media and text content for the same post
    if (content.mediaUrl && contentText.length > 0) {
      console.warn('Reddit post has both media and text - will be posted as text post with media link');
    }
  }

  private async validateRedditAccess(accessToken: string, username: string): Promise<void> {
    try {
      // Check if token is valid and get user info
      const response = await fetch('https://oauth.reddit.com/api/v1/me', {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'User-Agent': 'SocialScheduler/1.0 by ' + username,
        },
      });

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error('Reddit access token is invalid or expired. Please reconnect your Reddit account.');
        } else if (response.status === 403) {
          throw new Error('Reddit access forbidden. Please check your app permissions.');
        }
        throw new Error(`Reddit API error: ${response.status}`);
      }

      const userData = await response.json();
      
      if (!userData.name) {
        throw new Error('Unable to retrieve Reddit user information');
      }

      // Check account karma and age for posting eligibility
      const karma = userData.link_karma + userData.comment_karma;
      if (karma < 10) {
        console.warn('Reddit account has low karma, some subreddits may restrict posting');
      }

      console.log('Reddit access validation successful:', {
        username: userData.name,
        karma: karma,
        accountCreated: userData.created_utc
      });

    } catch (error) {
      console.error('Reddit access validation failed:', error);
      throw error;
    }
  }

  private async validateSubreddit(subreddit: string, accessToken: string, username: string): Promise<void> {
    try {
      const response = await fetch(`https://oauth.reddit.com/r/${subreddit}/about`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'User-Agent': 'SocialScheduler/1.0 by ' + username,
        },
      });

      if (!response.ok) {
        if (response.status === 403) {
          throw new Error(`Access denied to r/${subreddit}. The subreddit may be private or restricted.`);
        } else if (response.status === 404) {
          throw new Error(`Subreddit r/${subreddit} does not exist.`);
        }
        throw new Error(`Failed to validate subreddit r/${subreddit}: ${response.status}`);
      }

      const subredditData = await response.json();
      const data = subredditData.data;

      if (data.subreddit_type === 'private') {
        throw new Error(`r/${subreddit} is a private subreddit`);
      }

      if (data.restrict_posting) {
        console.warn(`r/${subreddit} has posting restrictions`);
      }

      console.log(`Subreddit r/${subreddit} validation successful:`, {
        subscribers: data.subscribers,
        type: data.subreddit_type,
        canPost: !data.restrict_posting
      });

    } catch (error) {
      console.error(`Subreddit validation failed for r/${subreddit}:`, error);
      throw error;
    }
  }

  private selectOptimalSubreddit(tags: string[], availableSubreddits: string[]): string {
    // Enhanced tag to subreddit mapping
    const tagToSubreddit: Record<string, string> = {
      'javascript': 'javascript',
      'typescript': 'typescript', 
      'react': 'reactjs',
      'vue': 'vuejs',
      'angular': 'angular',
      'node': 'node',
      'python': 'python',
      'webdev': 'webdev',
      'programming': 'programming',
      'coding': 'learnprogramming',
      'frontend': 'frontend',
      'backend': 'backend',
      'fullstack': 'webdev',
      'mobile': 'mobiledev',
      'ios': 'iOSProgramming',
      'android': 'androiddev',
      'ai': 'MachineLearning',
      'ml': 'MachineLearning',
      'data': 'datascience',
      'security': 'netsec',
      'devops': 'devops',
      'cloud': 'aws'
    };
    
    // Try to find the best matching subreddit based on tags
    for (const tag of tags) {
      const mappedSubreddit = tagToSubreddit[tag.toLowerCase()];
      if (mappedSubreddit && availableSubreddits.includes(mappedSubreddit)) {
        return mappedSubreddit;
      }
    }
    
    // Fallback to first available subreddit
    return availableSubreddits[0] || 'programming';
  }

  async postToReddit(content: PostContent): Promise<string> {
    // Validate content first
    this.validateRedditContent(content);
    
    const credentials = await this.getCredentials('reddit');
    await this.validatePlatformAccess('reddit', credentials);
    
    // Validate required credentials
    if (!credentials.access_token) {
      throw new Error('Reddit access token not configured. Please set up Reddit OAuth in Platform Setup.');
    }

    if (!credentials.client_id || !credentials.client_secret) {
      throw new Error('Reddit client credentials not configured. Please add your Reddit app credentials in Platform Setup.');
    }

    if (!credentials.username) {
      throw new Error('Reddit username not configured. Please add your Reddit username in Platform Setup.');
    }

    let accessToken = credentials.access_token;
    
    try {
      // Validate access token and get user info
      await this.validateRedditAccess(accessToken, credentials.username);
      
    } catch (error) {
      if (error.message.includes('invalid') || error.message.includes('expired')) {
        if (credentials.refresh_token) {
          try {
            console.log('Refreshing Reddit access token...');
            accessToken = await this.refreshRedditToken(credentials);
            await this.validateRedditAccess(accessToken, credentials.username);
          } catch (refreshError) {
            console.error('Reddit token refresh failed:', refreshError);
            throw new Error('Reddit authentication failed. Please reconnect your Reddit account in Platform Setup.');
          }
        } else {
          throw new Error('Reddit access token expired and no refresh token available. Please reconnect your Reddit account.');
        }
      } else {
        throw error;
      }
    }

    // Get user's preferred subreddits or use smart defaults
    const subredditList = credentials.subreddits ? 
      credentials.subreddits.split(',').map(s => s.trim()).filter(s => s.length > 0) : 
      ['programming', 'webdev', 'learnprogramming'];
    
    // Select the best subreddit based on content tags
    const selectedSubreddit = this.selectOptimalSubreddit(content.tags || [], subredditList);
    
    // Validate the selected subreddit
    await this.validateSubreddit(selectedSubreddit, accessToken, credentials.username);

    console.log('Posting to Reddit:', {
      subreddit: selectedSubreddit,
      title: content.title,
      contentLength: content.content?.length || 0,
      tags: content.tags,
      hasMedia: !!content.mediaUrl
    });

    try {
      // Prepare the post data
      const postData: any = {
        api_type: 'json',
        kind: content.mediaUrl ? 'link' : 'self',
        sr: selectedSubreddit,
        title: content.title.trim(),
        sendreplies: false, // Disable inbox replies to avoid spam
      };

      // Add content based on post type
      if (content.mediaUrl) {
        postData.url = content.mediaUrl;
        // For link posts, we can't include text content directly
        if (content.content?.trim()) {
          console.log('Note: Adding text content as a comment since this is a link post');
        }
      } else {
        postData.text = content.content.trim();
      }

      const response = await fetch('https://oauth.reddit.com/api/submit', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'SocialScheduler/1.0 by ' + credentials.username,
        },
        body: new URLSearchParams(postData)
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Reddit API error:', response.status, errorText);
        
        let errorMessage = 'Reddit posting failed';
        
        if (response.status === 400) {
          errorMessage = 'Reddit post validation failed. Check your title and content format.';
        } else if (response.status === 403) {
          errorMessage = `Access denied to r/${selectedSubreddit}. You may not have permission to post here.`;
        } else if (response.status === 429) {
          errorMessage = 'Reddit rate limit exceeded. Please try again later.';
        } else if (response.status === 500) {
          errorMessage = 'Reddit server error. Please try again later.';
        } else {
          errorMessage = `Reddit API error: ${response.status} - ${errorText}`;
        }
        
        throw new Error(errorMessage);
      }

      const result = await response.json();
      
      // Check for Reddit API errors in the response
      if (result.json?.errors && result.json.errors.length > 0) {
        const errorMessages = result.json.errors.map((error: any) => {
          if (Array.isArray(error)) {
            return error.join(': ');
          }
          return error.toString();
        });
        throw new Error(`Reddit posting errors: ${errorMessages.join(', ')}`);
      }

      if (!result.json?.data?.id) {
        console.error('Reddit response missing post ID:', result);
        throw new Error('Reddit did not return a valid post ID');
      }

      const postId = result.json.data.id;
      const postUrl = `https://reddit.com/r/${selectedSubreddit}/comments/${postId}`;

      console.log('Reddit post successful:', {
        postId: postId,
        subreddit: selectedSubreddit,
        url: postUrl,
        title: content.title
      });

      // If this was a link post with additional text content, post it as a comment
      if (content.mediaUrl && content.content?.trim()) {
        try {
          await this.addRedditComment(postId, content.content.trim(), accessToken, credentials.username);
        } catch (commentError) {
          console.warn('Failed to add comment to Reddit post:', commentError);
          // Don't fail the entire operation if comment fails
        }
      }

      await this.updateCredentials('reddit', credentials);
      return postId;
      
    } catch (error) {
      console.error('Reddit posting failed:', error);
      
      // Enhanced error handling with specific Reddit error messages
      if (error.message.includes('Reddit')) {
        throw error; // Re-throw Reddit-specific errors
      }
      
      throw new Error(`Failed to post to Reddit: ${error.message}`);
    }
  }

  private async addRedditComment(postId: string, text: string, accessToken: string, username: string): Promise<void> {
    const response = await fetch('https://oauth.reddit.com/api/comment', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'SocialScheduler/1.0 by ' + username,
      },
      body: new URLSearchParams({
        api_type: 'json',
        thing_id: `t3_${postId}`,
        text: text,
      })
    });

    if (!response.ok) {
      throw new Error(`Failed to add comment: ${response.status}`);
    }

    const result = await response.json();
    if (result.json?.errors && result.json.errors.length > 0) {
      throw new Error(`Comment posting errors: ${result.json.errors.join(', ')}`);
    }

    console.log('Reddit comment added successfully');
  }
}

export const platformAPI = new PlatformAPI();
