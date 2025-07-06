
import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Eye, EyeOff, Save, CheckCircle, XCircle, TestTube, AlertCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from '@/components/ui/use-toast';

interface PlatformConfigurationProps {
  platform: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

interface PlatformCredentials {
  [key: string]: string | undefined;
}

interface PlatformField {
  key: string;
  label: string;
  required: boolean;
  description?: string;
  placeholder?: string;
  type?: 'text' | 'password' | 'url';
}

interface PlatformConfig {
  name: string;
  fields: PlatformField[];
  docsUrl: string;
  setupInstructions?: string;
}

export const PlatformConfiguration = ({ platform, isOpen, onClose, onSuccess }: PlatformConfigurationProps) => {
  const { user } = useAuth();
  const [credentials, setCredentials] = useState<PlatformCredentials>({});
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    if (user && platform && isOpen) {
      loadCredentials();
    }
  }, [user, platform, isOpen]);

  const loadCredentials = async () => {
    try {
      const { data, error } = await supabase
        .from('platforms')
        .select('credentials')
        .eq('user_id', user?.id)
        .eq('platform_name', platform)
        .maybeSingle();

      if (data && !error) {
        setCredentials(data.credentials as PlatformCredentials);
      } else if (error && error.code !== 'PGRST116') {
        console.error('Error loading credentials:', error);
      }
    } catch (error) {
      console.error('Failed to load platform credentials:', error);
    }
  };

  const testConnection = async () => {
    setTesting(true);
    try {
      const { data, error } = await supabase.functions.invoke('test-platform-connection', {
        body: { 
          platform,
          credentials
        }
      });

      if (error) throw error;

      if (data.success) {
        toast({
          title: "Connection Successful",
          description: `${platform} credentials are valid`,
        });

        // Handle platform-specific responses
        if (data.userInfo && platform === 'linkedin') {
          let personId = data.userInfo.sub;
          if (personId && !personId.startsWith('urn:li:person:')) {
            personId = `urn:li:person:${personId}`;
          }
          if (personId) {
            setCredentials(prev => ({ ...prev, person_id: personId }));
            toast({
              title: "Person ID Retrieved",
              description: "LinkedIn person ID has been automatically configured",
            });
          }
        }
        
        if (data.newAccessToken && (platform === 'youtube' || platform === 'instagram')) {
          setCredentials(prev => ({ ...prev, access_token: data.newAccessToken }));
          
          if (platform === 'youtube' && data.channelInfo) {
            toast({
              title: "YouTube Channel Verified",
              description: `Connected to channel: ${data.channelInfo.title}`,
            });
          }
        }

        if (data.userInfo && platform === 'reddit') {
          toast({
            title: "Reddit Account Verified",
            description: `Connected as ${data.userInfo.name} (Karma: ${data.userInfo.link_karma + data.userInfo.comment_karma})`,
          });
        }
      } else {
        toast({
          title: "Connection Failed",
          description: data.error || `Failed to connect to ${platform}`,
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error('Connection test failed:', error);
      toast({
        title: "Test Failed",
        description: `Failed to test ${platform} connection`,
        variant: "destructive",
      });
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async () => {
    if (!user) return;

    // Validate required fields
    const config = getPlatformConfig(platform);
    const missingFields = config.fields
      .filter(field => field.required && !credentials[field.key]?.trim())
      .map(field => field.label);

    if (missingFields.length > 0) {
      toast({
        title: "Validation Error",
        description: `Please fill in required fields: ${missingFields.join(', ')}`,
        variant: "destructive",
      });
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase
        .from('platforms')
        .upsert({
          user_id: user.id,
          platform_name: platform,
          credentials: credentials as any,
          is_connected: true,
          is_active: true,
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'user_id,platform_name'
        });

      if (error) throw error;

      toast({
        title: "Platform Connected",
        description: `${platform} has been connected successfully`,
      });

      onSuccess();
      onClose();

    } catch (error) {
      console.error('Failed to save platform credentials:', error);
      toast({
        title: "Connection Failed",
        description: `Failed to connect ${platform}`,
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const toggleShowKey = (key: string) => {
    setShowKeys(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const updateCredential = (key: string, value: string) => {
    setCredentials(prev => ({ ...prev, [key]: value }));
  };

  const getPlatformConfig = (platformName: string): PlatformConfig => {
    const configs: Record<string, PlatformConfig> = {
      twitter: {
        name: 'X (Twitter)',
        fields: [
          { key: 'api_key', label: 'API Key (Consumer Key)', required: true, description: 'Your Twitter app Consumer Key' },
          { key: 'api_secret', label: 'API Secret (Consumer Secret)', required: true, description: 'Your Twitter app Consumer Secret' },
          { key: 'access_token', label: 'Access Token', required: true, description: 'Your account Access Token' },
          { key: 'access_token_secret', label: 'Access Token Secret', required: true, description: 'Your account Access Token Secret' },
          { key: 'bearer_token', label: 'Bearer Token', required: true, description: 'App-only Bearer Token for enhanced features' },
          { key: 'app_id', label: 'App ID', required: false, description: 'Twitter App ID for advanced features' }
        ],
        docsUrl: 'https://developer.twitter.com/en/portal/dashboard',
        setupInstructions: 'Ensure your app has "Read and Write" permissions enabled in User authentication settings.'
      },
      linkedin: {
        name: 'LinkedIn',
        fields: [
          { key: 'access_token', label: 'Access Token', required: true, description: 'OAuth 2.0 access token with r_liteprofile and w_member_social scopes' },
          { key: 'person_id', label: 'Person ID', required: false, description: 'Auto-filled after successful connection test' },
          { key: 'client_id', label: 'Client ID', required: true, description: 'LinkedIn app Client ID for token refresh' },
          { key: 'client_secret', label: 'Client Secret', required: true, description: 'LinkedIn app Client Secret for token refresh' },
          { key: 'refresh_token', label: 'Refresh Token', required: false, description: 'For automatic token renewal (if available)' }
        ],
        docsUrl: 'https://www.linkedin.com/developers/apps',
        setupInstructions: 'Configure your LinkedIn app with r_liteprofile and w_member_social permissions.'
      },
      instagram: {
        name: 'Instagram',
        fields: [
          { key: 'access_token', label: 'Instagram Access Token', required: true, description: 'Instagram Graph API access token with instagram_basic and instagram_content_publish permissions' },
          { key: 'business_account_id', label: 'Instagram Business Account ID', required: true, description: 'Your Instagram Business Account ID (get from Instagram Graph API)' },
          { key: 'app_id', label: 'Facebook App ID', required: true, description: 'Facebook App ID for token management (from developers.facebook.com)' },
          { key: 'app_secret', label: 'Facebook App Secret', required: true, description: 'Facebook App Secret for token refresh (from developers.facebook.com)' }
        ],
        docsUrl: 'https://developers.facebook.com/docs/instagram-api',
        setupInstructions: 'Create a Facebook app at developers.facebook.com, add Instagram Graph API product, connect your Instagram Business account via Facebook Page, then generate access tokens.'
      },
      youtube: {
        name: 'YouTube',
        fields: [
          { key: 'access_token', label: 'Access Token', required: true, description: 'OAuth 2.0 access token with youtube.upload scope' },
          { key: 'refresh_token', label: 'Refresh Token', required: true, description: 'OAuth 2.0 refresh token for automatic token renewal' },
          { key: 'client_id', label: 'Client ID', required: true, description: 'Google Cloud Console OAuth 2.0 Client ID' },
          { key: 'client_secret', label: 'Client Secret', required: true, description: 'Google Cloud Console OAuth 2.0 Client Secret' },
          { key: 'project_id', label: 'Google Cloud Project ID', required: false, description: 'Google Cloud Project ID for quota monitoring' }
        ],
        docsUrl: 'https://console.cloud.google.com/apis/credentials',
        setupInstructions: 'Enable YouTube Data API v3 in Google Cloud Console and configure OAuth consent screen.'
      },
      reddit: {
        name: 'Reddit',
        fields: [
          { key: 'access_token', label: 'Access Token', required: true, description: 'OAuth 2.0 access token with submit and identity scopes' },
          { key: 'refresh_token', label: 'Refresh Token', required: true, description: 'OAuth 2.0 refresh token for automatic renewal' },
          { key: 'client_id', label: 'Client ID', required: true, description: 'Reddit app client ID' },
          { key: 'client_secret', label: 'Client Secret', required: true, description: 'Reddit app client secret' },
          { key: 'username', label: 'Username', required: true, description: 'Your Reddit username' },
          { key: 'subreddits', label: 'Default Subreddits', required: false, description: 'Comma-separated list (e.g., programming,webdev,javascript)', placeholder: 'programming,webdev,javascript' }
        ],
        docsUrl: 'https://www.reddit.com/prefs/apps',
        setupInstructions: 'Create a Reddit app with "script" type and ensure you have sufficient karma for posting.'
      },
      hashnode: {
        name: 'Hashnode',
        fields: [
          { key: 'access_token', label: 'Personal Access Token', required: true, description: 'Hashnode Personal Access Token from Developer Settings' },
          { key: 'publication_id', label: 'Publication ID', required: false, description: 'Optional: Publish to a specific publication instead of personal blog' }
        ],
        docsUrl: 'https://hashnode.com/settings/developer',
        setupInstructions: 'Generate a Personal Access Token from your Hashnode Developer Settings.'
      },
      devto: {
        name: 'Dev.to',
        fields: [
          { key: 'api_key', label: 'API Key', required: true, description: 'Dev.to API key from Account Settings > Extensions' }
        ],
        docsUrl: 'https://dev.to/settings/extensions',
        setupInstructions: 'Generate an API key from your Dev.to Account Settings > Extensions page.'
      }
    };

    return configs[platformName] || {
      name: platformName,
      fields: [{ key: 'api_key', label: 'API Key', required: true }],
      docsUrl: '#'
    };
  };

  const config = getPlatformConfig(platform);
  const hasRequiredFields = config.fields.some(field => field.required);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="bg-white dark:bg-black border-gray-200 dark:border-gray-800 text-black dark:text-white max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl">Configure {config.name}</DialogTitle>
          {config.setupInstructions && (
            <div className="flex items-start gap-2 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-lg mt-2">
              <AlertCircle className="w-4 h-4 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
              <p className="text-sm text-blue-700 dark:text-blue-300">{config.setupInstructions}</p>
            </div>
          )}
        </DialogHeader>

        <div className="space-y-4">
          {config.fields.map((field) => (
            <div key={field.key} className="space-y-2">
              <Label htmlFor={field.key} className="text-gray-700 dark:text-gray-300 flex items-center gap-2">
                {field.label} 
                {field.required && <span className="text-red-500">*</span>}
              </Label>
              <div className="relative">
                <Input
                  id={field.key}
                  type={showKeys[field.key] ? 'text' : (field.type === 'url' ? 'url' : 'password')}
                  value={credentials[field.key] || ''}
                  onChange={(e) => updateCredential(field.key, e.target.value)}
                  placeholder={field.placeholder || `Enter your ${field.label}`}
                  className="bg-white dark:bg-black border-gray-300 dark:border-gray-600 text-black dark:text-white pr-10"
                  readOnly={field.key === 'person_id' && platform === 'linkedin'}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-0 top-0 h-full px-3 text-gray-500 dark:text-gray-400 hover:text-black dark:hover:text-white"
                  onClick={() => toggleShowKey(field.key)}
                >
                  {showKeys[field.key] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </Button>
              </div>
              {field.description && (
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {field.description}
                </p>
              )}
              {field.key === 'person_id' && platform === 'linkedin' && (
                <p className="text-xs text-blue-600 dark:text-blue-400">
                  This will be automatically filled when you test the connection
                </p>
              )}
            </div>
          ))}

          <div className="flex justify-between items-center pt-4 border-t border-gray-200 dark:border-gray-700">
            <a
              href={config.docsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 text-sm underline"
            >
              Get API Keys →
            </a>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={testConnection}
                disabled={testing || !hasRequiredFields}
                className="border-blue-600 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20"
              >
                <TestTube className="w-4 h-4 mr-2" />
                {testing ? 'Testing...' : 'Test'}
              </Button>
              <Button variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button
                onClick={handleSave}
                disabled={saving}
                className="bg-blue-600 hover:bg-blue-700"
              >
                <Save className="w-4 h-4 mr-2" />
                {saving ? 'Saving...' : 'Save'}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
