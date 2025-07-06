
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';
import { createHmac } from "https://deno.land/std@0.208.0/crypto/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { content, mediaUrl, mediaType } = await req.json();
    
    console.log('Twitter posting request:', { 
      contentLength: content?.length,
      hasMedia: !!mediaUrl,
      mediaType 
    });
    
    // Validate content
    if (!content || typeof content !== 'string') {
      throw new Error('Tweet content is required');
    }

    // Twitter character limit validation
    if (content.length > 280) {
      throw new Error(`Tweet exceeds 280 character limit (${content.length} characters)`);
    }

    if (content.trim().length === 0) {
      throw new Error('Tweet content cannot be empty');
    }
    
    // Get user credentials from Supabase
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('No authorization header');
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const { data: platform } = await supabaseClient
      .from('platforms')
      .select('credentials')
      .eq('user_id', user.id)
      .eq('platform_name', 'twitter')
      .single();

    if (!platform) {
      throw new Error('Twitter not connected. Please configure Twitter in Platform Setup.');
    }

    const credentials = platform.credentials as any;
    
    // Validate required credentials
    if (!credentials.api_key || !credentials.api_secret || !credentials.access_token || !credentials.access_token_secret) {
      throw new Error('Twitter credentials incomplete. Please reconfigure Twitter in Platform Setup.');
    }

    console.log('Twitter credentials validated');
    
    // Prepare tweet data
    const tweetData: any = { text: content.trim() };
    
    // Handle media upload if provided
    if (mediaUrl) {
      try {
        const mediaId = await uploadMedia(mediaUrl, mediaType, credentials);
        tweetData.media = { media_ids: [mediaId] };
        console.log('Media uploaded successfully:', mediaId);
      } catch (mediaError) {
        console.error('Media upload failed:', mediaError);
        throw new Error(`Failed to upload media: ${mediaError.message}`);
      }
    }

    // Post tweet
    const tweetResponse = await postTweet(tweetData, credentials);
    
    console.log('Tweet posted successfully:', tweetResponse.data?.id);
    
    return new Response(JSON.stringify({ 
      tweetId: tweetResponse.data.id,
      url: `https://twitter.com/user/status/${tweetResponse.data.id}`,
      text: tweetResponse.data.text
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error posting to Twitter:', error);
    
    let errorMessage = error.message;
    if (error.message.includes('401')) {
      errorMessage = 'Twitter authentication failed. Please check your API keys and tokens in Platform Setup.';
    } else if (error.message.includes('403')) {
      errorMessage = 'Twitter access forbidden. Ensure your app has read/write permissions.';
    } else if (error.message.includes('429')) {
      errorMessage = 'Twitter rate limit exceeded. Please try again later.';
    }
    
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

async function uploadMedia(mediaUrl: string, mediaType: string, credentials: any): Promise<string> {
  console.log('Uploading media:', { mediaUrl, mediaType });
  
  // Download media file
  const mediaResponse = await fetch(mediaUrl);
  if (!mediaResponse.ok) {
    throw new Error(`Failed to download media: ${mediaResponse.status}`);
  }
  
  const mediaBuffer = await mediaResponse.arrayBuffer();
  const mediaBytes = new Uint8Array(mediaBuffer);
  
  // Validate file size (Twitter limits: 5MB for images, 512MB for videos)
  const maxSize = mediaType === 'video' ? 512 * 1024 * 1024 : 5 * 1024 * 1024;
  if (mediaBytes.length > maxSize) {
    throw new Error(`Media file too large: ${mediaBytes.length} bytes (max: ${maxSize})`);
  }
  
  // Prepare form data for chunked upload
  const formData = new FormData();
  formData.append('media', new Blob([mediaBytes]), 'media_file');
  
  // Upload to Twitter
  const uploadUrl = 'https://upload.twitter.com/1.1/media/upload.json';
  const uploadResponse = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      'Authorization': generateOAuthHeader('POST', uploadUrl, {}, credentials),
    },
    body: formData,
  });
  
  if (!uploadResponse.ok) {
    const errorText = await uploadResponse.text();
    console.error('Media upload failed:', uploadResponse.status, errorText);
    throw new Error(`Media upload failed: ${uploadResponse.status}`);
  }
  
  const uploadResult = await uploadResponse.json();
  
  if (!uploadResult.media_id_string) {
    throw new Error('Twitter did not return media ID');
  }
  
  return uploadResult.media_id_string;
}

async function postTweet(tweetData: any, credentials: any): Promise<any> {
  console.log('Posting tweet with data:', { ...tweetData, media: tweetData.media ? 'present' : 'none' });
  
  const url = 'https://api.twitter.com/2/tweets';
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': generateOAuthHeader('POST', url, {}, credentials),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(tweetData),
  });
  
  const responseText = await response.text();
  console.log('Twitter API response:', response.status, responseText);
  
  if (!response.ok) {
    let errorMessage = `Twitter API error: ${response.status}`;
    try {
      const errorData = JSON.parse(responseText);
      if (errorData.errors && errorData.errors.length > 0) {
        errorMessage = errorData.errors[0].detail || errorData.errors[0].title || errorMessage;
      } else if (errorData.detail) {
        errorMessage = errorData.detail;
      }
    } catch (parseError) {
      errorMessage = responseText || errorMessage;
    }
    throw new Error(errorMessage);
  }
  
  const result = JSON.parse(responseText);
  
  // Validate response
  if (!result.data || !result.data.id) {
    throw new Error('Twitter did not return a valid tweet ID');
  }
  
  return result;
}

function generateOAuthHeader(method: string, url: string, params: Record<string, string>, credentials: any): string {
  const oauthParams = {
    oauth_consumer_key: credentials.api_key,
    oauth_nonce: generateNonce(),
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_token: credentials.access_token,
    oauth_version: "1.0",
  };

  // Combine OAuth params with request params for signature
  const allParams = { ...oauthParams, ...params };
  
  // Generate signature
  const signature = generateOAuthSignature(method, url, allParams, credentials.api_secret, credentials.access_token_secret);
  
  // Add signature to OAuth params
  const signedOAuthParams = {
    ...oauthParams,
    oauth_signature: signature,
  };

  // Create OAuth header
  const paramString = Object.entries(signedOAuthParams)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${encodeURIComponent(key)}="${encodeURIComponent(value)}"`)
    .join(', ');

  return `OAuth ${paramString}`;
}

function generateOAuthSignature(
  method: string,
  url: string,
  params: Record<string, string>,
  consumerSecret: string,
  tokenSecret: string
): string {
  // Create parameter string
  const paramString = Object.entries(params)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join('&');

  // Create signature base string
  const signatureBaseString = [
    method.toUpperCase(),
    encodeURIComponent(url),
    encodeURIComponent(paramString)
  ].join('&');

  // Create signing key
  const signingKey = `${encodeURIComponent(consumerSecret)}&${encodeURIComponent(tokenSecret)}`;

  // Generate HMAC-SHA1 signature
  const key = new TextEncoder().encode(signingKey);
  const data = new TextEncoder().encode(signatureBaseString);
  
  return btoa(String.fromCharCode(...new Uint8Array(createHmac('sha1', key).update(data).digest())));
}

function generateNonce(): string {
  return Math.random().toString(36).substring(2) + Date.now().toString(36);
}
