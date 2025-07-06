
interface RedditTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  scope: string;
  refresh_token?: string;
}

interface RedditUserInfo {
  name: string;
  link_karma: number;
  comment_karma: number;
  created_utc: number;
  verified: boolean;
  is_suspended: boolean;
  has_verified_email: boolean;
  subreddit?: {
    subscribers: number;
    public_description: string;
  };
}

export async function testRedditConnection(credentials: any): Promise<{
  success: boolean;
  error?: string;
  userInfo?: RedditUserInfo;
  newAccessToken?: string;
}> {
  try {
    const { access_token, client_id, client_secret, username, refresh_token } = credentials;

    // Enhanced validation for OAuth 2.0
    if (!access_token && !refresh_token) {
      return {
        success: false,
        error: 'No access token or refresh token provided. Please complete OAuth setup with proper scope permissions (identity, submit).'
      };
    }

    if (!client_id || !client_secret) {
      return {
        success: false,
        error: 'Client ID and Client Secret are required for Reddit OAuth 2.0. Please configure your Reddit app credentials.'
      };
    }

    if (!username) {
      return {
        success: false,
        error: 'Reddit username is required for API calls and User-Agent headers.'
      };
    }

    let currentAccessToken = access_token;

    // If no access token but we have refresh token, try to get a new one
    if (!currentAccessToken && refresh_token) {
      console.log('No access token provided, attempting to refresh...');
      
      const refreshResult = await refreshRedditToken(client_id, client_secret, refresh_token, username);
      if (!refreshResult.success) {
        return {
          success: false,
          error: refreshResult.error || 'Failed to refresh Reddit token. Please re-authenticate your Reddit account.'
        };
      }
      
      currentAccessToken = refreshResult.access_token;
    }

    if (!currentAccessToken) {
      return {
        success: false,
        error: 'No valid access token available. Please complete OAuth setup with required scopes (identity, submit).'
      };
    }

    // Test the access token by getting user info with enhanced scope validation
    const userResponse = await fetch('https://oauth.reddit.com/api/v1/me', {
      headers: {
        'Authorization': `Bearer ${currentAccessToken}`,
        'User-Agent': 'SocialScheduler/1.0 by ' + username,
      },
    });

    if (!userResponse.ok) {
      if (userResponse.status === 401) {
        // Token is invalid, try to refresh if we have a refresh token
        if (refresh_token) {
          console.log('Access token invalid, attempting to refresh...');
          
          const refreshResult = await refreshRedditToken(client_id, client_secret, refresh_token, username);
          if (!refreshResult.success) {
            return {
              success: false,
              error: 'Access token expired and refresh failed. Please reconnect your Reddit account with proper OAuth scopes.'
            };
          }
          
          // Retry with new token
          const retryResponse = await fetch('https://oauth.reddit.com/api/v1/me', {
            headers: {
              'Authorization': `Bearer ${refreshResult.access_token}`,
              'User-Agent': 'SocialScheduler/1.0 by ' + username,
            },
          });

          if (!retryResponse.ok) {
            return {
              success: false,
              error: `Reddit API error after token refresh: ${retryResponse.status}. Please verify your app permissions.`
            };
          }

          const userInfo = await retryResponse.json();
          return await validateRedditAccount(userInfo, refreshResult.access_token);
        } else {
          return {
            success: false,
            error: 'Access token expired and no refresh token available. Please reconnect your Reddit account.'
          };
        }
      } else if (userResponse.status === 403) {
        return {
          success: false,
          error: 'Reddit API access forbidden. Please verify your app has the correct OAuth scopes (identity, submit) and permissions.'
        };
      } else {
        return {
          success: false,
          error: `Reddit API error: ${userResponse.status} ${userResponse.statusText}. Please check your credentials and app configuration.`
        };
      }
    }

    const userInfo = await userResponse.json();
    return await validateRedditAccount(userInfo, currentAccessToken, username);

  } catch (error) {
    console.error('Reddit connection test failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error testing Reddit connection. Please verify your credentials and network connection.'
    };
  }
}

async function validateRedditAccount(userInfo: RedditUserInfo, accessToken?: string, username?: string): Promise<{
  success: boolean;
  error?: string;
  userInfo?: RedditUserInfo;
  newAccessToken?: string;
}> {
  try {
    // Enhanced account validation
    if (userInfo.is_suspended) {
      return {
        success: false,
        error: 'Reddit account is suspended and cannot post content. Please resolve suspension before using this service.'
      };
    }

    if (!userInfo.has_verified_email) {
      console.warn('Reddit account email is not verified, posting may be limited in some subreddits');
    }

    if (!userInfo.verified) {
      console.warn('Reddit account is not verified, posting may be restricted in some subreddits');
    }

    const totalKarma = userInfo.link_karma + userInfo.comment_karma;
    if (totalKarma < 10) {
      console.warn('Reddit account has low karma (< 10), posting may be restricted in most subreddits');
    }

    // Test posting permissions by checking if we can access submit endpoint
    if (accessToken && username) {
      try {
        const submitTestResponse = await fetch('https://oauth.reddit.com/api/submit', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/x-www-form-urlencoded',
            'User-Agent': 'SocialScheduler/1.0 by ' + username,
          },
          body: new URLSearchParams({
            api_type: 'json',
            kind: 'self',
            sr: 'test', // Using test subreddit for validation
            title: 'Connection Test',
            text: 'This is a connection test post that should not be submitted',
            sendreplies: 'false',
          })
        });

        // We expect this to fail with validation errors, but 401/403 would indicate permission issues
        if (submitTestResponse.status === 401) {
          return {
            success: false,
            error: 'Reddit posting permissions not available. Please ensure your OAuth app has "submit" scope enabled.'
          };
        } else if (submitTestResponse.status === 403) {
          return {
            success: false,
            error: 'Reddit posting access forbidden. Please verify your app configuration and user permissions.'
          };
        }

        console.log('Reddit submit endpoint accessible');
      } catch (submitError) {
        console.warn('Could not test submit permissions:', submitError);
      }
    }

    // Enhanced success response with detailed account information
    const result = {
      success: true,
      userInfo: {
        ...userInfo,
        account_age_days: Math.floor((Date.now() - userInfo.created_utc * 1000) / (1000 * 60 * 60 * 24)),
        karma_status: totalKarma < 10 ? 'low' : totalKarma < 100 ? 'medium' : 'high',
        posting_eligibility: {
          email_verified: userInfo.has_verified_email,
          account_verified: userInfo.verified,
          sufficient_karma: totalKarma >= 10,
          not_suspended: !userInfo.is_suspended
        }
      }
    };

    if (accessToken) {
      result.newAccessToken = accessToken;
    }

    console.log('Reddit account validation successful:', {
      username: userInfo.name,
      karma: totalKarma,
      verified: userInfo.verified,
      email_verified: userInfo.has_verified_email,
      suspended: userInfo.is_suspended
    });

    return result;

  } catch (error) {
    console.error('Reddit account validation failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error validating Reddit account'
    };
  }
}

async function refreshRedditToken(
  clientId: string, 
  clientSecret: string, 
  refreshToken: string, 
  username: string
): Promise<{ success: boolean; access_token?: string; error?: string }> {
  try {
    const auth = btoa(`${clientId}:${clientSecret}`);
    
    const response = await fetch('https://www.reddit.com/api/v1/access_token', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'SocialScheduler/1.0 by ' + username,
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Reddit token refresh failed:', response.status, errorText);
      
      let errorMessage = `Token refresh failed: ${response.status} ${response.statusText}`;
      
      if (response.status === 401) {
        errorMessage = 'Reddit app credentials are invalid. Please check your client ID and secret.';
      } else if (response.status === 400) {
        try {
          const errorData = JSON.parse(errorText);
          if (errorData.error === 'invalid_grant') {
            errorMessage = 'Refresh token is invalid or expired. Please re-authenticate your Reddit account.';
          } else {
            errorMessage = `Token refresh error: ${errorData.error_description || errorData.error}`;
          }
        } catch (parseError) {
          errorMessage = 'Token refresh failed with validation error. Please re-authenticate.';
        }
      }
      
      return {
        success: false,
        error: errorMessage
      };
    }

    const tokenData: RedditTokenResponse = await response.json();
    
    if (!tokenData.access_token) {
      return {
        success: false,
        error: 'Reddit did not return a valid access token during refresh'
      };
    }

    console.log('Reddit token refresh successful:', {
      tokenType: tokenData.token_type,
      expiresIn: tokenData.expires_in,
      scope: tokenData.scope
    });
    
    return {
      success: true,
      access_token: tokenData.access_token
    };

  } catch (error) {
    console.error('Reddit token refresh error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error refreshing Reddit token'
    };
  }
}
