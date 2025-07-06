import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Utility: Promise timeout wrapper with retry logic
async function withTimeout(promise, ms, retries = 1) {
  const timeout = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('Request timed out')), ms)
  );
  
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await Promise.race([promise, timeout]);
    } catch (error) {
      if (attempt === retries || !error.message.includes('timed out')) {
        throw error;
      }
      console.log(`Attempt ${attempt + 1} timed out, retrying...`);
      // Small delay before retry
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // --- Input Validation ---
    let body;
    try {
      body = await req.json();
    } catch (e) {
      console.error('Invalid JSON input:', e);
      return new Response(JSON.stringify({ error: 'Invalid JSON input' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const { prompt, settings, model, userId } = body || {};
    if (!prompt || typeof prompt !== 'string' || !settings || !userId) {
      return new Response(JSON.stringify({ error: 'Missing required fields: prompt, settings, or userId' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // --- Supabase Client ---
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !supabaseKey) {
      console.error('Supabase environment variables missing');
      return new Response(JSON.stringify({ error: 'Server misconfiguration' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const supabase = createClient(supabaseUrl, supabaseKey);

    // --- Fetch LLM API Keys ---
    const { data: apiRows, error: apiError } = await supabase
      .from('llm_api_credentials')
      .select('api_name, api_key')
      .eq('user_id', userId);
    if (apiError) {
      console.error('Database error fetching LLM API keys:', apiError);
      return new Response(JSON.stringify({ error: 'Failed to fetch API configuration from database' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (!apiRows || apiRows.length === 0) {
      console.error(`No LLM API keys found for user: ${userId}`);
      return new Response(JSON.stringify({ error: `LLM API keys not configured for user. Please set up your AI API keys in the platform settings.` }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    // Build credentials object
    const credentials: Record<string, string> = {};
    for (const row of apiRows) {
      if (row.api_name === 'rapidapi') credentials.rapidapi_key = row.api_key;
      else if (row.api_name === 'gemini') credentials.gemini_key = row.api_key;
      else if (row.api_name === 'groq') credentials.groq_key = row.api_key;
      else credentials[row.api_name] = row.api_key;
    }
    const availableLLMs = [];
    if (credentials.groq_key) availableLLMs.push('groq');
    if (credentials.gemini_key) availableLLMs.push('gemini');
    if (credentials.rapidapi_key) availableLLMs.push('rapidapi');
    if (availableLLMs.length === 0) {
      return new Response(JSON.stringify({ error: 'No LLM API keys configured. Please set up at least one AI API key.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    // --- Model Prioritization ---
    const normalizedModel = model && (model.includes('groq') || model.includes('llama')) ? 'groq'
      : model && model.includes('gemini') ? 'gemini'
      : model && (model.includes('rapidapi') || model.includes('gpt')) ? 'rapidapi'
      : null;
    const prioritizedLLMs = normalizedModel && availableLLMs.includes(normalizedModel)
      ? [normalizedModel, ...availableLLMs.filter(l => l !== normalizedModel)]
      : availableLLMs;

    let lastError;
    for (const llm of prioritizedLLMs) {
      try {
        console.log(`Attempting to generate content with ${llm}...`);
        let content;
        
        // Different timeout strategies for different LLMs
        if (llm === 'groq') {
          content = await withTimeout(generateWithGroq(prompt, model, settings, credentials.groq_key), 8000, 1);
        } else if (llm === 'gemini') {
          content = await withTimeout(generateWithGemini(prompt, settings, credentials.gemini_key), 12000, 2);
        } else if (llm === 'rapidapi') {
          content = await withTimeout(generateWithRapidAPI(prompt, settings, credentials.rapidapi_key), 10000, 1);
        } else {
          continue;
        }
        
        console.log(`Successfully generated content with ${llm}`);
        const validatedContent = validateContentQuality(content, settings);
        return new Response(JSON.stringify(validatedContent), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      } catch (err) {
        console.error(`LLM ${llm} failed:`, err.message);
        lastError = err;
        // Try next LLM
      }
    }
    // If we reach here, all LLMs failed
    return new Response(JSON.stringify({ error: 'All available LLMs failed: ' + (lastError?.message || lastError) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error generating content:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

// --- LLM API Handlers ---
async function generateWithRapidAPI(prompt, settings, apiKey) {
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
    let errorData;
    try { errorData = await response.json(); } catch { errorData = {}; }
    throw new Error(`RapidAPI error: ${errorData.message || 'API request failed'}`);
  }
  const data = await response.json();
  if (!data.status || !data.result) {
    throw new Error('Invalid response from RapidAPI');
  }
  return parseAIResponse(data.result);
}

async function generateWithGemini(prompt, settings, apiKey) {
  const temperature = (settings.ai_temperature || 70) / 100;
  
  // Optimize Gemini request for faster response
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{
        parts: [{
          text: `${prompt}\n\nGenerate content with ${settings.tone} tone, ${settings.creativity_level}% creativity, and target audience: ${settings.target_audience}. Return valid JSON format with this exact structure: {"title": "string", "body": "string", "tags": ["array"], "mediaUrl": "string"}.`
        }]
      }],
      generationConfig: {
        temperature: temperature,
        maxOutputTokens: 1500, // Reduced for faster response
        topP: 0.8,
        topK: 40,
      },
      safetySettings: [
        {
          category: "HARM_CATEGORY_HARASSMENT",
          threshold: "BLOCK_MEDIUM_AND_ABOVE"
        },
        {
          category: "HARM_CATEGORY_HATE_SPEECH", 
          threshold: "BLOCK_MEDIUM_AND_ABOVE"
        }
      ]
    }),
  });
  
  if (!response.ok) {
    let errorData;
    try { errorData = await response.json(); } catch { errorData = {}; }
    throw new Error(`Gemini API error: ${errorData.error?.message || 'API request failed'}`);
  }
  
  const data = await response.json();
  const content = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!content) throw new Error('Gemini API returned no content');
  return parseAIResponse(content);
}

async function generateWithGroq(prompt, model, settings, apiKey) {
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
      max_tokens: 1500, // Reduced for faster response
    }),
  });
  if (!response.ok) {
    let errorData;
    try { errorData = await response.json(); } catch { errorData = {}; }
    throw new Error(`Groq API error: ${errorData.error?.message || 'API request failed'}`);
  }
  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error('Groq API returned no content');
  return parseAIResponse(content);
}

// --- Output Parsing & Validation ---
function parseAIResponse(content) {
  try {
    return JSON.parse(content);
  } catch {
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try { return JSON.parse(jsonMatch[0]); } catch {}
    }
    // Fallback
    return {
      title: "Generated Content",
      body: content,
      tags: ["ai", "generated"],
      mediaUrl: ""
    };
  }
}

function validateContentQuality(content, settings) {
  if (!content.title || !content.body) {
    throw new Error('Generated content missing required fields');
  }
  const targetLength = settings.content_length || 60;
  const minLength = Math.max(10, targetLength * 0.5);
  const maxLength = targetLength * 2;
  if (content.body.length < minLength) {
    throw new Error('Generated content too short');
  }
  if (content.body.length > maxLength * 10) {
    content.body = content.body.substring(0, maxLength * 10) + '...';
  }
  if (!Array.isArray(content.tags)) {
    content.tags = ["generated", "ai"];
  }
  content.tags = content.tags.slice(0, 10);
  if (!content.mediaUrl) content.mediaUrl = "";
  return content;
}
