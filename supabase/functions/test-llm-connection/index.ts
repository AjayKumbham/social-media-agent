
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { provider, apiKey } = await req.json();

    console.log(`Testing ${provider} connection with API key: ${apiKey ? `${apiKey.substring(0, 8)}...` : 'NO KEY'}`);

    if (!apiKey || apiKey.trim() === '' || apiKey === 'undefined' || apiKey === 'null') {
      console.log(`${provider} test FAILED: No API key provided`);
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'API key is required and cannot be empty' 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let testResult = false;
    let error = '';

    switch (provider) {
      case 'rapidapi':
        try {
          console.log('Making REAL RapidAPI ChatGPT call to validate key...');
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
                  content: 'test'
                }
              ],
              web_access: false
            }),
          });
          
          console.log(`RapidAPI response status: ${response.status}`);
          
          if (response.status === 200) {
            const result = await response.json();
            console.log(`RapidAPI response:`, result);
            
            if (result.status === true && result.result) {
              testResult = true;
              console.log('RapidAPI test: SUCCESS - Valid API key confirmed');
            } else {
              error = 'Invalid response from RapidAPI - no valid result returned';
              console.log('RapidAPI test: FAILED - Invalid response format');
            }
          } else {
            const errorData = await response.json().catch(() => ({ error: { message: 'Unknown error' } }));
            console.error(`RapidAPI error: ${response.status} - ${JSON.stringify(errorData)}`);
            
            if (response.status === 401 || response.status === 403) {
              error = 'Invalid RapidAPI key. Please check your API key and subscription.';
            } else if (response.status === 429) {
              error = 'RapidAPI rate limit exceeded. Please try again later.';
            } else {
              error = errorData.message || `RapidAPI error: ${response.status}`;
            }
          }
        } catch (e) {
          console.error('RapidAPI connection error:', e);
          error = `Network error connecting to RapidAPI: ${e.message}`;
        }
        break;

      case 'gemini':
        try {
          console.log('Making REAL Gemini API call to validate key...');
          const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`, {
            method: 'GET',
            headers: {
              'Content-Type': 'application/json',
            },
          });
          
          console.log(`Gemini API response status: ${response.status}`);
          
          if (response.status === 200) {
            const result = await response.json();
            console.log(`Gemini models retrieved: ${result.models?.length || 0} models`);
            
            if (result.models && Array.isArray(result.models) && result.models.length > 0) {
              testResult = true;
              console.log('Gemini test: SUCCESS - Valid API key confirmed');
            } else {
              error = 'Invalid response from Gemini API - no models returned';
              console.log('Gemini test: FAILED - No models in response');
            }
          } else {
            const errorData = await response.json().catch(() => ({ error: { message: 'Unknown error' } }));
            console.error(`Gemini API error: ${response.status} - ${JSON.stringify(errorData)}`);
            
            if (response.status === 400 && errorData.error?.code === 'API_KEY_INVALID') {
              error = 'Invalid Gemini API key. Please check your API key.';
            } else if (response.status === 403) {
              error = 'Gemini API access forbidden. Check your API key permissions.';
            } else if (response.status === 429) {
              error = 'Gemini API rate limit exceeded. Please try again later.';
            } else {
              error = errorData.error?.message || `Gemini API error: ${response.status}`;
            }
          }
        } catch (e) {
          console.error('Gemini connection error:', e);
          error = `Network error connecting to Gemini: ${e.message}`;
        }
        break;

      case 'groq':
        try {
          console.log('Making REAL Groq API call to validate key...');
          const response = await fetch('https://api.groq.com/openai/v1/models', {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${apiKey}`,
              'Content-Type': 'application/json',
            },
          });
          
          console.log(`Groq API response status: ${response.status}`);
          
          if (response.status === 200) {
            const result = await response.json();
            console.log(`Groq models retrieved: ${result.data?.length || 0} models`);
            
            if (result.data && Array.isArray(result.data) && result.data.length > 0) {
              testResult = true;
              console.log('Groq test: SUCCESS - Valid API key confirmed');
            } else {
              error = 'Invalid response from Groq API - no models returned';
              console.log('Groq test: FAILED - No models in response');
            }
          } else {
            const errorData = await response.json().catch(() => ({ error: { message: 'Unknown error' } }));
            console.error(`Groq API error: ${response.status} - ${JSON.stringify(errorData)}`);
            
            if (response.status === 401) {
              error = 'Invalid Groq API key. Please check your API key.';
            } else if (response.status === 403) {
              error = 'Groq API access forbidden. Check your billing and permissions.';
            } else if (response.status === 429) {
              error = 'Groq API rate limit exceeded. Please try again later.';
            } else {
              error = errorData.error?.message || `Groq API error: ${response.status}`;
            }
          }
        } catch (e) {
          console.error('Groq connection error:', e);
          error = `Network error connecting to Groq: ${e.message}`;
        }
        break;

      default:
        error = `Unsupported provider: ${provider}`;
        console.log(`Test FAILED: ${error}`);
    }

    console.log(`${provider} FINAL RESULT: success=${testResult}, error="${error}"`);
    
    return new Response(JSON.stringify({ success: testResult, error }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Critical error in test function:', error);
    return new Response(JSON.stringify({ 
      success: false, 
      error: `Test function error: ${error.message}` 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
