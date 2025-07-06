import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { script, platform, videoStyle = 'tech', userId } = await req.json();
    
    if (!script) {
      throw new Error('Script is required for video generation');
    }

    if (!userId) {
      throw new Error('User ID is required');
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get API keys from user's platform settings
    const { data: llmData, error: llmError } = await supabase
      .from('platforms')
      .select('credentials')
      .eq('user_id', userId)
      .eq('platform_name', 'llm_apis')
      .single();

    const { data: mediaData, error: mediaError } = await supabase
      .from('platforms')
      .select('credentials')
      .eq('user_id', userId)
      .eq('platform_name', 'media_apis')
      .single();

    if (llmError && llmError.code !== 'PGRST116') {
      console.error('Database error fetching LLM API keys:', llmError);
      throw new Error('Failed to fetch LLM API configuration from database');
    }

    if (mediaError && mediaError.code !== 'PGRST116') {
      console.error('Database error fetching Media API keys:', mediaError);
      throw new Error('Failed to fetch Media API configuration from database');
    }

    const llmCredentials = llmData?.credentials as any;
    const mediaCredentials = mediaData?.credentials as any;

    if (!llmCredentials?.gemini_key) {
      throw new Error('Gemini API key not configured. Please set up your AI API keys in the platform settings.');
    }

    if (!mediaCredentials?.pexels_api_key) {
      throw new Error('Pexels API key not configured. Please set up your Media API keys in the platform settings.');
    }

    console.log(`Generating professional video for ${platform} with enhanced free TTS`);

    // Step 1: Generate enhanced visual timeline
    const visualTimeline = await generateEnhancedVisualTimeline(script, platform, videoStyle, llmCredentials.gemini_key, mediaCredentials.pexels_api_key);

    // Step 2: Create optimized video configuration
    const videoConfig = {
      platform,
      dimensions: getPlatformDimensions(platform),
      duration: calculateOptimalDuration(script, platform),
      script,
      visualTimeline,
      style: videoStyle,
      textOverlays: generateSynchronizedTextOverlays(script),
      audioConfig: generateAudioConfig(script),
      transitions: generateTransitions(visualTimeline.length),
      branding: getPlatformBranding(platform)
    };

    return new Response(JSON.stringify({
      success: true,
      videoConfig,
      message: 'Enhanced video configuration generated (uses Web Speech API with improvements)',
      estimatedDuration: videoConfig.duration,
      visualCount: visualTimeline.length,
      quality: 'professional'
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error generating professional video:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

function getPlatformDimensions(platform: string) {
  const dimensions = {
    instagram: { width: 1080, height: 1920, format: 'vertical' },
    youtube: { width: 1080, height: 1920, format: 'vertical' },
    default: { width: 1920, height: 1080, format: 'horizontal' }
  };
  return dimensions[platform] || dimensions.default;
}

function calculateOptimalDuration(script: string, platform: string) {
  const wordCount = script.split(' ').length;
  const baseWPM = 150; // words per minute for good pacing
  const baseDuration = (wordCount / baseWPM) * 60;
  
  const platformLimits = {
    instagram: { min: 15, max: 90 },
    youtube: { min: 30, max: 60 },
    default: { min: 30, max: 120 }
  };
  
  const limits = platformLimits[platform] || platformLimits.default;
  return Math.max(limits.min, Math.min(limits.max, baseDuration));
}

async function generateEnhancedVisualTimeline(script: string, platform: string, style: string, geminiKey: string, pexelsKey: string) {
  const sentences = script.split(/[.!?]+/).filter(s => s.trim().length > 0);
  const timeline = [];
  const segmentDuration = 4; // 4 seconds per segment for better pacing
  
  for (let i = 0; i < Math.min(sentences.length, 8); i++) {
    const sentence = sentences[i].trim();
    
    try {
      // Generate multiple visual elements per segment
      const visualElements = await generateVisualSegment(sentence, platform, style, geminiKey, pexelsKey, i);
      
      timeline.push({
        timestamp: i * segmentDuration,
        duration: segmentDuration,
        elements: visualElements,
        text: sentence,
        segmentIndex: i
      });
    } catch (error) {
      console.error(`Error generating visual segment ${i}:`, error);
      timeline.push({
        timestamp: i * segmentDuration,
        duration: segmentDuration,
        elements: [await generateFallbackElement(sentence, i)],
        text: sentence,
        segmentIndex: i
      });
    }
  }
  
  return timeline;
}

async function generateVisualSegment(sentence: string, platform: string, style: string, geminiKey: string, pexelsKey: string, index: number) {
  const elements = [];
  
  // 1. Get background video from Pexels
  const backgroundVideo = await getPexelsVideo(sentence, pexelsKey, platform);
  if (backgroundVideo) {
    elements.push({
      type: 'background_video',
      url: backgroundVideo.url,
      duration: 4,
      layer: 0
    });
  }
  
  // 2. Generate overlay image with Gemini
  const overlayImage = await generateGeminiImage(sentence, platform, style, geminiKey);
  if (overlayImage) {
    elements.push({
      type: 'overlay_image',
      url: overlayImage,
      duration: 4,
      layer: 1,
      position: 'center',
      opacity: 0.8
    });
  }
  
  // 3. Add animated text overlay
  elements.push({
    type: 'text_overlay',
    text: sentence,
    duration: 4,
    layer: 2,
    animation: 'typewriter',
    style: getTextStyle(platform, style)
  });
  
  return elements;
}

async function getPexelsVideo(query: string, pexelsKey: string, platform: string) {
  try {
    const orientation = platform === 'instagram' || platform === 'youtube' ? 'portrait' : 'landscape';
    const response = await fetch(`https://api.pexels.com/videos/search?query=${encodeURIComponent(query)}&orientation=${orientation}&per_page=3&size=medium`, {
      headers: { 'Authorization': pexelsKey }
    });

    if (response.ok) {
      const data = await response.json();
      if (data.videos && data.videos.length > 0) {
        const video = data.videos[0];
        const videoFile = video.video_files.find(f => 
          platform === 'instagram' || platform === 'youtube' ? f.width < f.height : f.width > f.height
        ) || video.video_files[0];
        
        return {
          url: videoFile.link,
          width: videoFile.width,
          height: videoFile.height
        };
      }
    }
  } catch (error) {
    console.error('Pexels video fetch failed:', error);
  }
  return null;
}

async function generateGeminiImage(sentence: string, platform: string, style: string, geminiKey: string) {
  try {
    const prompt = `Create a visual overlay for: "${sentence}". Style: ${style}, Platform: ${platform}, Format: modern graphic overlay, transparent background suitable for video overlay.`;
    
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${geminiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [{ text: `Generate image: ${prompt}` }]
        }],
        generationConfig: { temperature: 0.7, maxOutputTokens: 200 }
      })
    });

    if (response.ok) {
      const result = await response.json();
      if (result.candidates?.[0]?.content?.parts?.[0]?.inlineData) {
        const imageData = result.candidates[0].content.parts[0].inlineData;
        return `data:${imageData.mimeType};base64,${imageData.data}`;
      }
    }
  } catch (error) {
    console.error('Gemini image generation failed:', error);
  }
  
  return null;
}

async function generateFallbackElement(sentence: string, index: number) {
  return {
    type: 'fallback_image',
    url: `https://picsum.photos/1080/1920?random=${Date.now()}&${index}`,
    duration: 4,
    layer: 0,
    text: sentence
  };
}

function generateSynchronizedTextOverlays(script: string) {
  const words = script.split(' ');
  const overlays = [];
  const wordsPerOverlay = 6; // Fewer words for better readability
  const overlayDuration = 3;
  
  for (let i = 0; i < words.length; i += wordsPerOverlay) {
    const text = words.slice(i, i + wordsPerOverlay).join(' ');
    const timestamp = (i / wordsPerOverlay) * overlayDuration;
    
    overlays.push({
      timestamp,
      duration: overlayDuration,
      text,
      style: 'bold',
      position: 'bottom',
      animation: 'slide-up',
      background: 'semi-transparent',
      fontSize: 'responsive'
    });
  }
  
  return overlays;
}

function generateAudioConfig(script: string) {
  return {
    type: 'web_speech_enhanced',
    script,
    settings: {
      rate: 0.9,
      pitch: 1.0,
      volume: 1.0,
      voice: 'auto', // Will be selected in frontend
      pauseBetweenSentences: 0.5,
      emphasizeKeyWords: true
    },
    backgroundMusic: {
      enabled: false, // Can be enabled with royalty-free music
      volume: 0.3,
      fadeIn: 2,
      fadeOut: 2
    }
  };
}

function generateTransitions(segmentCount: number) {
  const transitions = [];
  const transitionTypes = ['fade', 'slide', 'zoom', 'dissolve'];
  
  for (let i = 0; i < segmentCount - 1; i++) {
    transitions.push({
      timestamp: (i + 1) * 4 - 0.5, // 0.5 seconds before segment end
      duration: 1,
      type: transitionTypes[i % transitionTypes.length],
      easing: 'ease-in-out'
    });
  }
  
  return transitions;
}

function getPlatformBranding(platform: string) {
  return {
    watermark: {
      enabled: true,
      position: 'bottom-right',
      opacity: 0.3,
      text: `#${platform}`
    },
    aspectRatio: platform === 'instagram' || platform === 'youtube' ? '9:16' : '16:9',
    safeArea: {
      top: 100,
      bottom: 100,
      left: 50,
      right: 50
    }
  };
}

function getTextStyle(platform: string, style: string) {
  const baseStyle = {
    fontFamily: 'Arial, sans-serif',
    fontWeight: 'bold',
    textAlign: 'center',
    textShadow: '2px 2px 4px rgba(0,0,0,0.7)',
    lineHeight: 1.2
  };
  
  const platformStyles = {
    instagram: { fontSize: '32px', color: '#ffffff' },
    youtube: { fontSize: '36px', color: '#ffffff' },
    default: { fontSize: '28px', color: '#ffffff' }
  };
  
  return { ...baseStyle, ...(platformStyles[platform] || platformStyles.default) };
}
