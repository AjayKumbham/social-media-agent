
import { supabase } from '@/integrations/supabase/client';

export interface ContentValidationResult {
  isValid: boolean;
  issues: string[];
  suggestions: string[];
  score: number; // 0-100 quality score
}

export interface ContentValidationOptions {
  checkDuplicates: boolean;
  checkQuality: boolean;
  checkPlatformRules: boolean;
  platform?: string;
}

class ContentValidator {
  async validateContent(
    content: { title: string; body: string; tags?: string[] },
    options: ContentValidationOptions = {
      checkDuplicates: true,
      checkQuality: true,
      checkPlatformRules: true
    }
  ): Promise<ContentValidationResult> {
    const result: ContentValidationResult = {
      isValid: true,
      issues: [],
      suggestions: [],
      score: 100
    };

    // Basic content validation
    if (!content.title || content.title.trim().length === 0) {
      result.issues.push('Title is required');
      result.score -= 20;
    }

    if (!content.body || content.body.trim().length === 0) {
      result.issues.push('Content body is required');
      result.score -= 30;
    }

    if (content.title && content.title.length > 200) {
      result.issues.push('Title too long (max 200 characters)');
      result.score -= 10;
    }

    if (content.body && content.body.length < 50) {
      result.suggestions.push('Content might be too short for engagement');
      result.score -= 5;
    }

    // Check for duplicates
    if (options.checkDuplicates) {
      const duplicateCheck = await this.checkForDuplicates(content);
      if (duplicateCheck.isDuplicate) {
        result.issues.push('Similar content already exists');
        result.score -= 25;
      }
    }

    // Platform-specific validation
    if (options.checkPlatformRules && options.platform) {
      const platformCheck = this.validatePlatformRules(content, options.platform);
      result.issues.push(...platformCheck.issues);
      result.suggestions.push(...platformCheck.suggestions);
      result.score -= platformCheck.scoreDeduction;
    }

    // Quality checks
    if (options.checkQuality) {
      const qualityCheck = this.checkContentQuality(content);
      result.suggestions.push(...qualityCheck.suggestions);
      result.score += qualityCheck.scoreAdjustment;
    }

    result.isValid = result.issues.length === 0 && result.score >= 60;
    result.score = Math.max(0, Math.min(100, result.score));

    return result;
  }

  private async checkForDuplicates(content: { title: string; body: string }): Promise<{ isDuplicate: boolean; similarity: number }> {
    try {
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) return { isDuplicate: false, similarity: 0 };

      // Check for exact title matches
      const { data: exactMatches } = await supabase
        .from('content_posts')
        .select('title, content')
        .eq('user_id', user.user.id)
        .eq('title', content.title)
        .limit(1);

      if (exactMatches && exactMatches.length > 0) {
        return { isDuplicate: true, similarity: 100 };
      }

      // Check for similar content using basic similarity
      const { data: recentPosts } = await supabase
        .from('content_posts')
        .select('title, content')
        .eq('user_id', user.user.id)
        .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()) // Last 30 days
        .limit(50);

      if (recentPosts) {
        for (const post of recentPosts) {
          const similarity = this.calculateSimilarity(content.body, post.content);
          if (similarity > 0.8) {
            return { isDuplicate: true, similarity: similarity * 100 };
          }
        }
      }

      return { isDuplicate: false, similarity: 0 };
    } catch (error) {
      console.error('Error checking duplicates:', error);
      return { isDuplicate: false, similarity: 0 };
    }
  }

  private validatePlatformRules(content: { title: string; body: string; tags?: string[] }, platform: string): {
    issues: string[];
    suggestions: string[];
    scoreDeduction: number;
  } {
    const result = { issues: [], suggestions: [], scoreDeduction: 0 };

    switch (platform) {
      case 'twitter':
        if (content.body.length > 280) {
          result.issues.push('Twitter content exceeds 280 character limit');
          result.scoreDeduction += 20;
        }
        if (content.tags && content.tags.length > 2) {
          result.suggestions.push('Consider using fewer hashtags for Twitter');
        }
        break;

      case 'linkedin':
        if (content.body.length > 3000) {
          result.issues.push('LinkedIn content too long (max 3000 characters)');
          result.scoreDeduction += 15;
        }
        if (!content.body.includes('#')) {
          result.suggestions.push('Consider adding relevant hashtags for LinkedIn visibility');
        }
        break;

      case 'hashnode':
      case 'devto':
        if (content.body.length < 200) {
          result.suggestions.push('Blog posts typically perform better with more detailed content');
        }
        if (!content.tags || content.tags.length === 0) {
          result.suggestions.push('Add relevant tags to improve discoverability');
        }
        break;

      case 'instagram':
        if (content.body.length > 2200) {
          result.issues.push('Instagram caption too long (max 2200 characters)');
          result.scoreDeduction += 10;
        }
        if (!content.tags || content.tags.length < 3) {
          result.suggestions.push('Instagram posts benefit from 5-10 relevant hashtags');
        }
        break;

      case 'reddit':
        if (content.title.length > 300) {
          result.issues.push('Reddit title too long (max 300 characters)');
          result.scoreDeduction += 15;
        }
        break;
    }

    return result;
  }

  private checkContentQuality(content: { title: string; body: string; tags?: string[] }): {
    suggestions: string[];
    scoreAdjustment: number;
  } {
    const result = { suggestions: [], scoreAdjustment: 0 };

    // Check for engagement elements
    const hasQuestion = /\?/.test(content.body);
    const hasCallToAction = /(comment|share|like|follow|subscribe|click|visit|check out)/i.test(content.body);
    const hasEmojis = /[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]/u.test(content.body);

    if (!hasQuestion && !hasCallToAction) {
      result.suggestions.push('Consider adding a question or call-to-action to increase engagement');
    } else {
      result.scoreAdjustment += 5;
    }

    // Check readability
    const sentences = content.body.split(/[.!?]+/).filter(s => s.trim().length > 0);
    const averageSentenceLength = content.body.length / sentences.length;

    if (averageSentenceLength > 100) {
      result.suggestions.push('Consider breaking up long sentences for better readability');
    } else if (averageSentenceLength < 200) {
      result.scoreAdjustment += 3;
    }

    // Check for formatting
    const hasFormatting = /(\*\*|\*|__|_|#|\n\n)/.test(content.body);
    if (!hasFormatting && content.body.length > 500) {
      result.suggestions.push('Consider adding formatting (bold, italics, headers) to improve readability');
    }

    // Tag quality
    if (content.tags && content.tags.length > 0) {
      const uniqueTags = new Set(content.tags.map(tag => tag.toLowerCase()));
      if (uniqueTags.size !== content.tags.length) {
        result.suggestions.push('Remove duplicate tags');
      } else {
        result.scoreAdjustment += 2;
      }
    }

    return result;
  }

  private calculateSimilarity(str1: string, str2: string): number {
    const words1 = str1.toLowerCase().split(/\s+/);
    const words2 = str2.toLowerCase().split(/\s+/);
    
    const set1 = new Set(words1);
    const set2 = new Set(words2);
    
    const intersection = new Set([...set1].filter(x => set2.has(x)));
    const union = new Set([...set1, ...set2]);
    
    return intersection.size / union.size;
  }

  async validateScheduling(scheduledTime: Date, platform: string, userId: string): Promise<{
    isValid: boolean;
    issues: string[];
    suggestions: string[];
  }> {
    const result = { isValid: true, issues: [], suggestions: [] };

    try {
      // Check for scheduling conflicts
      const timeWindow = 60 * 60 * 1000; // 1 hour window
      const startTime = new Date(scheduledTime.getTime() - timeWindow);
      const endTime = new Date(scheduledTime.getTime() + timeWindow);

      const { data: conflicts } = await supabase
        .from('content_posts')
        .select('scheduled_for, platform_name')
        .eq('user_id', userId)
        .eq('platform_name', platform)
        .gte('scheduled_for', startTime.toISOString())
        .lte('scheduled_for', endTime.toISOString())
        .neq('status', 'failed');

      if (conflicts && conflicts.length > 0) {
        result.issues.push(`Content already scheduled for ${platform} within 1 hour of this time`);
        result.isValid = false;
      }

      // Check optimal posting times
      const hour = scheduledTime.getHours();
      const dayOfWeek = scheduledTime.getDay();

      if (platform === 'linkedin' && (hour < 8 || hour > 18)) {
        result.suggestions.push('LinkedIn posts typically perform better during business hours (8 AM - 6 PM)');
      }

      if (platform === 'instagram' && (hour < 11 || hour > 15)) {
        result.suggestions.push('Instagram posts often perform better between 11 AM - 3 PM');
      }

      if ((platform === 'twitter' || platform === 'linkedin') && (dayOfWeek === 0 || dayOfWeek === 6)) {
        result.suggestions.push('Professional platforms like Twitter and LinkedIn typically have lower engagement on weekends');
      }

    } catch (error) {
      console.error('Error validating scheduling:', error);
    }

    return result;
  }
}

export const contentValidator = new ContentValidator();
