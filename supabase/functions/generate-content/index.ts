
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { prompt, settings, model, userId } = await req.json();

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
    let content;
    
    // Try different AI providers based on the model with enhanced error handling
    try {
      if (model.includes('rapidapi') || model.includes('gpt')) {
        if (!credentials.rapidapi_key) {
          throw new Error('RapidAPI key not configured in platform settings');
        }
        content = await generateWithRapidAPI(prompt, settings, credentials.rapidapi_key);
      } else if (model.includes('gemini')) {
        if (!credentials.gemini_key) {
          throw new Error('Gemini API key not configured in platform settings');
        }
        content = await generateWithGemini(prompt, settings, credentials.gemini_key);
      } else if (model.includes('llama') || model.includes('groq')) {
        if (!credentials.groq_key) {
          throw new Error('Groq API key not configured in platform settings');
        }
        content = await generateWithGroq(prompt, model, settings, credentials.groq_key);
      } else {
        throw new Error(`Unsupported model: ${model}`);
      }

      // Validate generated content quality
      const validatedContent = validateContentQuality(content, settings);
      
      return new Response(JSON.stringify(validatedContent), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    } catch (modelError) {
      console.error(`Primary model ${model} failed:`, modelError);
      
      // Fallback to alternative models if primary fails
      const fallbackContent = await tryFallbackGeneration(prompt, settings, credentials);
      const validatedContent = validateContentQuality(fallbackContent, settings);
      
      return new Response(JSON.stringify(validatedContent), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  } catch (error) {
    console.error('Error generating content:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

async function generateWithRapidAPI(prompt: string, settings: any, apiKey: string) {
  console.log('Generating content with RapidAPI ChatGPT...');
  
  const response = await fetch('https://chatgpt-42.p.rapidapi.com/gpt4', {
    method: 'POST',
    headers: {
      'x-rapidapi-key': apiKey,
      'x-rapidapi-host': 'chatgpt-42.p.rapidapi.com',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messages: [
        { 
          role: 'user', 
          content: `${prompt}\n\nGenerate content with ${settings.tone} tone, ${settings.creativity_level}% creativity level, and target audience: ${settings.target_audience}. Always return valid JSON with the exact structure: {"title": "string", "body": "string", "tags": ["array"], "mediaUrl": "string"}.`
        }
      ],
      web_access: false
    }),
  });

  if (!response.ok) {
    const errorData = await response.json();
    console.error('RapidAPI error:', errorData);
    throw new Error(`RapidAPI error: ${errorData.message || 'API request failed'}`);
  }

  const data = await response.json();
  
  if (!data.status || !data.result) {
    throw new Error('Invalid response from RapidAPI');
  }
  
  return parseAIResponse(data.result);
}

async function generateWithGemini(prompt: string, settings: any, apiKey: string) {
  console.log('Generating content with Gemini...');
  
  const temperature = (settings.ai_temperature || 70) / 100;
  
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${apiKey}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      contents: [{
        parts: [{
          text: `${prompt}\n\nGenerate content with ${settings.tone} tone, ${settings.creativity_level}% creativity, and target audience: ${settings.target_audience}. Return valid JSON format with this exact structure: {"title": "string", "body": "string", "tags": ["array"], "mediaUrl": "string"}.`
        }]
      }],
      generationConfig: {
        temperature: temperature,
        maxOutputTokens: 2000,
      }
    }),
  });

  if (!response.ok) {
    const errorData = await response.json();
    console.error('Gemini API error:', errorData);
    throw new Error(`Gemini API error: ${errorData.error?.message || 'API request failed'}`);
  }

  const data = await response.json();
  const content = data.candidates[0].content.parts[0].text;
  
  return parseAIResponse(content);
}

async function generateWithGroq(prompt: string, model: string, settings: any, apiKey: string) {
  console.log('Generating content with Groq...');
  
  const temperature = (settings.ai_temperature || 70) / 100;
  
  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'llama3-8b-8192',
      messages: [
        { 
          role: 'system', 
          content: `You are a content generator. Generate content with ${settings.tone} tone, ${settings.creativity_level}% creativity level, and target audience: ${settings.target_audience}. Always return valid JSON with the exact structure: {"title": "string", "body": "string", "tags": ["array"], "mediaUrl": "string"}.` 
        },
        { role: 'user', content: prompt }
      ],
      temperature: temperature,
      max_tokens: 2000,
    }),
  });

  if (!response.ok) {
    const errorData = await response.json();
    console.error('Groq API error:', errorData);
    throw new Error(`Groq API error: ${errorData.error?.message || 'API request failed'}`);
  }

  const data = await response.json();
  const content = data.choices[0].message.content;
  
  return parseAIResponse(content);
}

async function tryFallbackGeneration(prompt: string, settings: any, credentials: any) {
  console.log('Attempting fallback content generation...');
  
  // Try available APIs in order of preference
  const fallbackOrder = [
    { key: 'gemini_key', generator: generateWithGemini },
    { key: 'groq_key', generator: (p, s, k) => generateWithGroq(p, 'llama3-8b', s, k) },
    { key: 'rapidapi_key', generator: generateWithRapidAPI }
  ];
  
  for (const fallback of fallbackOrder) {
    if (credentials[fallback.key]) {
      try {
        return await fallback.generator(prompt, settings, credentials[fallback.key]);
      } catch (error) {
        console.warn(`Fallback ${fallback.key} also failed:`, error);
      }
    }
  }
  
  // Ultimate fallback - return template content
  return {
    title: `${settings.target_audience} Content`,
    body: `Engaging content about ${prompt.substring(0, 50)}. This content is generated for ${settings.target_audience} with ${settings.tone} tone.`,
    tags: ["generated", settings.tone, settings.target_audience.toLowerCase()],
    mediaUrl: ""
  };
}

function parseAIResponse(content: string) {
  try {
    // Try to parse as JSON first
    return JSON.parse(content);
  } catch {
    // If not JSON, try to extract JSON from the response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[0]);
      } catch {
        // Still not valid JSON
      }
    }
    
    // Fallback to structured response
    return {
      title: "Generated Content",
      body: content,
      tags: ["ai", "generated"],
      mediaUrl: ""
    };
  }
}

function validateContentQuality(content: any, settings: any) {
  // Ensure required fields exist
  if (!content.title || !content.body) {
    throw new Error('Generated content missing required fields');
  }
  
  // Validate content length based on settings
  const targetLength = settings.content_length || 60;
  const minLength = Math.max(10, targetLength * 0.5);
  const maxLength = targetLength * 2;
  
  if (content.body.length < minLength) {
    throw new Error('Generated content too short');
  }
  
  if (content.body.length > maxLength * 10) { // Allow some flexibility
    content.body = content.body.substring(0, maxLength * 10) + '...';
  }
  
  // Ensure tags exist and are valid
  if (!Array.isArray(content.tags)) {
    content.tags = ["generated", "ai"];
  }
  
  // Limit number of tags
  content.tags = content.tags.slice(0, 10);
  
  return content;
}
