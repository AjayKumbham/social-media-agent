import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Platform-specific image configurations
const PLATFORM_CONFIGS = {
  hashnode: { width: 1200, height: 630, style: 'blog header, professional, clean design, tech-focused' },
  devto: { width: 1000, height: 420, style: 'developer blog, tech-focused, modern, code-friendly' },
  twitter: { width: 1200, height: 675, style: 'social media, engaging, eye-catching, viral' },
  linkedin: { width: 1200, height: 627, style: 'professional, business-oriented, clean, corporate' },
  reddit: { width: 1200, height: 630, style: 'community-focused, discussion-friendly, engaging' },
  instagram: { width: 1080, height: 1920, style: 'vertical story/reel, mobile-first, vibrant, trendy' },
  youtube: { width: 1080, height: 1920, style: 'vertical short, thumbnail-worthy, engaging, clickable' }
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { prompt, platform = 'devto', contentType = 'general', userId } = await req.json();
    
    if (!userId) {
      throw new Error('User ID is required');
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get API keys from user's platform settings
    const { data: platformData, error: platformError } = await supabase
      .from('platforms')
      .select('credentials')
      .eq('user_id', userId)
      .eq('platform_name', 'llm_apis')
      .single();

    if (platformError && platformError.code !== 'PGRST116') {
      console.error('Database error fetching LLM API keys:', platformError);
      throw new Error('Failed to fetch API configuration from database');
    }

    if (!platformData?.credentials) {
      console.error('No LLM API keys found for user:', userId);
      throw new Error('LLM API keys not configured. Please set up your AI API keys in the platform settings.');
    }

    const credentials = platformData.credentials as any;
    
    if (!credentials.gemini_key) {
      throw new Error('Gemini API key not configured in platform settings');
    }

    const config = PLATFORM_CONFIGS[platform] || PLATFORM_CONFIGS.devto;
    const aspectRatio = `${config.width}:${config.height}`;
    
    // Enhanced prompt for better image generation
    const enhancedPrompt = `Create a high-quality ${aspectRatio} aspect ratio image for ${platform}.
    
Content: ${prompt}
Style: ${config.style}
Technical requirements: High resolution, sharp details, professional quality, modern design
Design elements: Clean typography, balanced composition, appropriate color scheme for ${platform}
Platform optimization: Optimized for ${platform} audience and format
Visual focus: Clear, engaging, and suitable for ${contentType} content

Make it visually striking, professional, and platform-appropriate.`;

    console.log(`Generating ${config.width}x${config.height} image for ${platform}: ${prompt}`);

    // Try to use Gemini 2.0 Flash for actual image generation
    try {
      const imageResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${credentials.gemini_key}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: `Generate an image: ${enhancedPrompt}`
            }]
          }],
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 1000,
          }
        })
      });

      if (imageResponse.ok) {
        const result = await imageResponse.json();
        
        // Check if Gemini returned actual image data
        if (result.candidates?.[0]?.content?.parts?.[0]?.inlineData) {
          const imageData = result.candidates[0].content.parts[0].inlineData;
          const base64Image = `data:${imageData.mimeType};base64,${imageData.data}`;
          
          return new Response(JSON.stringify({ 
            imageUrl: base64Image,
            description: enhancedPrompt,
            platform,
            dimensions: `${config.width}x${config.height}`,
            aspectRatio,
            enhanced: true,
            source: 'gemini-generated'
          }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
      }
    } catch (geminiError) {
      console.error('Gemini image generation failed:', geminiError);
    }

    // Fallback to improved placeholder with better styling
    const fallbackUrl = await generateStyledPlaceholder(prompt, config, platform);
    
    return new Response(JSON.stringify({ 
      imageUrl: fallbackUrl,
      description: enhancedPrompt,
      platform,
      dimensions: `${config.width}x${config.height}`,
      aspectRatio,
      enhanced: true,
      source: 'styled-placeholder'
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error generating image:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

async function generateStyledPlaceholder(prompt: string, config: any, platform: string): Promise<string> {
  // Generate a better styled placeholder using a combination of services
  const encodedPrompt = encodeURIComponent(prompt.substring(0, 50));
  const seed = Math.floor(Math.random() * 1000);
  
  // Use different placeholder services based on platform
  const placeholderServices = [
    `https://picsum.photos/${config.width}/${config.height}?random=${seed}&blur=1`,
    `https://source.unsplash.com/${config.width}x${config.height}/?${encodedPrompt}&sig=${seed}`,
    `https://via.placeholder.com/${config.width}x${config.height}/1a1a2e/ffffff?text=${encodedPrompt}`
  ];
  
  // Try services in order
  for (const service of placeholderServices) {
    try {
      const response = await fetch(service);
      if (response.ok) {
        return service;
      }
    } catch (error) {
      console.warn(`Placeholder service failed: ${service}`);
    }
  }
  
  return placeholderServices[2]; // Default fallback
}
