import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { testRedditConnection } from './reddit-oauth.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// HMAC-SHA1 implementation for OAuth
async function hmacSha1(key: string, message: string): Promise<string> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(key);
  const messageData = encoder.encode(message);
  
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign']
  );
  
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, messageData);
  const signatureArray = new Uint8Array(signature);
  return btoa(String.fromCharCode.apply(null, Array.from(signatureArray)));
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { platform, credentials } = await req.json();
    console.log(`Testing connection for platform: ${platform}`);

    let result;
    let testResult = false;
    let error: string | null = null;

    switch (platform) {
      case 'gemini':
        try {
          if (!credentials.gemini_api_key && !credentials.api_key) {
            throw new Error('Gemini API key is required');
          }
          
          const apiKey = credentials.gemini_api_key || credentials.api_key;
          const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              contents: [{
                parts: [{
                  text: "Test connection"
                }]
              }]
            })
          });
          
          if (response.ok) {
            const result = await response.json();
            if (result.candidates && result.candidates.length > 0) {
              testResult = true;
            } else {
              error = 'Invalid response format from Gemini API';
            }
          } else {
            const errorData = await response.json();
            error = errorData.error?.message || `HTTP ${response.status}: Invalid API key`;
          }
        } catch (e) {
          error = e.message;
        }
        result = { success: testResult, error };
        break;

      case 'pexels':
        try {
          if (!credentials.pexels_api_key && !credentials.api_key) {
            throw new Error('Pexels API key is required');
          }
          
          const apiKey = credentials.pexels_api_key || credentials.api_key;
          const response = await fetch('https://api.pexels.com/v1/search?query=nature&per_page=1', {
            headers: {
              'Authorization': apiKey,
            },
          });
          
          if (response.ok) {
            const result = await response.json();
            if (result.photos && result.photos.length > 0) {
              testResult = true;
            } else {
              error = 'No photos returned from Pexels API';
            }
          } else {
            const errorData = await response.json();
            error = errorData.error || `HTTP ${response.status}: Invalid API key`;
          }
        } catch (e) {
          error = e.message;
        }
        result = { success: testResult, error };
        break;

      case 'reddit':
        result = await testRedditConnection(credentials);
        break;

      case 'hashnode':
        try {
          if (!credentials.access_token) {
            throw new Error('Access token is required');
          }
          
          const response = await fetch('https://gql.hashnode.com/', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${credentials.access_token}`,
            },
            body: JSON.stringify({
              query: `query { me { id username } }`
            })
          });
          
          const result = await response.json();
          
          if (result.errors) {
            error = result.errors[0].message;
          } else if (result.data?.me) {
            testResult = true;
          } else {
            error = 'Invalid response from Hashnode API';
          }
        } catch (e) {
          error = e.message;
        }
        result = { success: testResult, error };
        break;

      case 'devto':
        try {
          if (!credentials.api_key) {
            throw new Error('API key is required');
          }
          
          const response = await fetch('https://dev.to/api/users/me', {
            headers: {
              'api-key': credentials.api_key,
            },
          });
          
          if (response.ok) {
            testResult = true;
          } else {
            const errorData = await response.json();
            error = errorData.error || `HTTP ${response.status}: Invalid API key`;
          }
        } catch (e) {
          error = e.message;
        }
        result = { success: testResult, error };
        break;

      case 'twitter':
        try {
          if (!credentials.api_key || !credentials.api_secret || !credentials.access_token || !credentials.access_token_secret) {
            throw new Error('All Twitter OAuth 1.0a credentials are required (API Key, API Secret, Access Token, Access Token Secret)');
          }
          
          const url = 'https://api.twitter.com/2/users/me';
          const method = 'GET';
          
          const oauthParams = {
            oauth_consumer_key: credentials.api_key,
            oauth_nonce: Math.random().toString(36).substring(2, 15),
            oauth_signature_method: 'HMAC-SHA1',
            oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
            oauth_token: credentials.access_token,
            oauth_version: '1.0',
          };

          // Create parameter string for signature
          const parameterString = Object.entries(oauthParams)
            .sort()
            .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
            .join('&');

          // Create signature base string
          const signatureBaseString = `${method}&${encodeURIComponent(url)}&${encodeURIComponent(parameterString)}`;
          
          // Create signing key
          const signingKey = `${encodeURIComponent(credentials.api_secret)}&${encodeURIComponent(credentials.access_token_secret)}`;
          
          // Generate signature
          const signature = await hmacSha1(signingKey, signatureBaseString);

          // Create authorization header
          const authorizationHeader = 'OAuth ' + Object.entries({
            ...oauthParams,
            oauth_signature: signature
          })
            .sort()
            .map(([key, value]) => `${encodeURIComponent(key)}="${encodeURIComponent(value)}"`)
            .join(', ');

          const response = await fetch(url, {
            method: 'GET',
            headers: {
              'Authorization': authorizationHeader,
            },
          });
          
          if (response.ok) {
            const userData = await response.json();
            if (userData.data && userData.data.id) {
              testResult = true;
              
              // Also test Bearer token if provided
              if (credentials.bearer_token) {
                try {
                  const bearerResponse = await fetch('https://api.twitter.com/2/users/me', {
                    headers: {
                      'Authorization': `Bearer ${credentials.bearer_token}`,
                    },
                  });
                  
                  if (bearerResponse.ok) {
                    console.log('Bearer token is also valid');
                  } else {
                    console.warn('Bearer token validation failed');
                  }
                } catch (bearerError) {
                  console.warn('Bearer token test failed:', bearerError);
                }
              }
            } else {
              error = 'Invalid response from Twitter API';
            }
          } else {
            const errorText = await response.text();
            console.log('Twitter API Error Response:', errorText);
            try {
              const errorData = JSON.parse(errorText);
              error = errorData.detail || errorData.title || `HTTP ${response.status}: ${errorData.errors?.[0]?.message || 'Authentication failed'}`;
            } catch {
              error = `HTTP ${response.status}: ${errorText}`;
            }
          }
        } catch (e) {
          console.error('Twitter connection error:', e);
          error = e.message;
        }
        result = { success: testResult, error };
        break;

      case 'linkedin':
        try {
          if (!credentials.access_token) {
            throw new Error('Access token is required');
          }
          
          const response = await fetch('https://api.linkedin.com/v2/userinfo', {
            headers: {
              'Authorization': `Bearer ${credentials.access_token}`,
            },
          });
          
          if (response.ok) {
            const userData = await response.json();
            if (userData.sub) {
              testResult = true;
              result = { 
                success: testResult, 
                error,
                userInfo: { sub: userData.sub }
              };
            } else {
              error = 'No user data returned from LinkedIn API';
              result = { success: false, error };
            }
          } else {
            const errorData = await response.json();
            error = errorData.message || `HTTP ${response.status}: Invalid access token`;
            result = { success: false, error };
          }
        } catch (e) {
          error = e.message;
          result = { success: false, error };
        }
        break;

      case 'instagram':
        try {
          if (!credentials.access_token || !credentials.business_account_id) {
            throw new Error('Access token and Instagram Business Account ID are required');
          }

          // For validation, use the Facebook Graph API as done in actual operations
          const businessAccountId = credentials.business_account_id;
          const accountUrl = `https://graph.facebook.com/v19.0/${businessAccountId}?fields=id,name&access_token=${credentials.access_token}`;
          console.log('Validating Instagram Business Account via Facebook Graph API:', accountUrl.replace(credentials.access_token, '[TOKEN]'));

          const fbAccountResponse = await fetch(accountUrl);
          const fbResult = await fbAccountResponse.json();

          if (fbAccountResponse.ok && !fbResult.error && fbResult.id && fbResult.name) {
            testResult = true;
            result = {
              success: true,
              userInfo: {
                businessAccountId: fbResult.id,
                name: fbResult.name,
              },
            };
          } else {
            if (fbResult.error) {
              if (fbResult.error.code === 100) {
                error = 'Invalid Instagram Business Account ID or token. Please ensure you provide a Business Account ID, not username or personal ID.';
              } else if (fbResult.error.code === 190) {
                error = 'Instagram access token is invalid or expired. Please generate a new access token from your Instagram/Facebook app.';
              } else {
                error = `Instagram (Facebook Graph) access error: ${fbResult.error.message} (code: ${fbResult.error.code})`;
              }
            } else {
              error = 'Unable to verify Instagram Business account via Facebook Graph API. Please check your account and permissions.';
            }
            result = { success: false, error };
          }
        } catch (e) {
          console.error('Instagram (Facebook Graph API) connection test error:', e);
          error = e.message;
          result = { success: false, error };
        }
        break;

      case 'youtube':
        try {
          if (!credentials.access_token) {
            throw new Error('Access token is required');
          }
          
          const response = await fetch('https://www.googleapis.com/youtube/v3/channels?part=snippet,status&mine=true', {
            headers: {
              'Authorization': `Bearer ${credentials.access_token}`,
            },
          });
          
          if (response.ok) {
            const channelResult = await response.json();
            if (channelResult.items && channelResult.items.length > 0) {
              testResult = true;
              const channel = channelResult.items[0];
              
              result = {
                success: true,
                channelInfo: {
                  id: channel.id,
                  title: channel.snippet.title,
                  isLinked: channel.status?.isLinked
                }
              };
              
              // Test token refresh if credentials provided
              if (credentials.refresh_token && credentials.client_id && credentials.client_secret) {
                try {
                  const refreshResponse = await fetch('https://oauth2.googleapis.com/token', {
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
                  
                  if (refreshResponse.ok) {
                    const refreshData = await refreshResponse.json();
                    result.newAccessToken = refreshData.access_token;
                    console.log('YouTube token refresh capability verified');
                  }
                } catch (refreshError) {
                  console.warn('YouTube token refresh test failed:', refreshError);
                }
              }
            } else {
              error = 'No YouTube channel found for this account';
            }
          } else {
            const errorData = await response.json();
            error = errorData.error?.message || `HTTP ${response.status}: Invalid access token`;
            
            if (response.status === 401) {
              error += ' (Token may have expired - refresh needed)';
            }
          }
        } catch (e) {
          error = e.message;
        }
        
        if (!result) {
          result = { success: testResult, error };
        }
        break;

      default:
        error = `Platform '${platform}' is not supported for testing`;
        result = { success: false, error };
    }

    console.log(`${platform} connection test result:`, result);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Platform connection test error:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
