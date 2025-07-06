
import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Eye, EyeOff, Save, CheckCircle, XCircle, TestTube, Image, Video } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { notificationService } from '@/services/notificationService';

interface MediaApiCredentials {
  gemini_api_key?: string;
  pexels_api_key?: string;
}

export const MediaApiDashboard = () => {
  const { user } = useAuth();
  const [credentials, setCredentials] = useState<MediaApiCredentials>({});
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState<Record<string, boolean>>({});
  const [connected, setConnected] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) {
      loadCredentials();
    }
  }, [user]);

  const loadCredentials = async () => {
    if (!user) return;
    
    setLoading(true);
    try {
      console.log('Loading media API credentials for user:', user.id);
      
      const { data, error } = await supabase
        .from('media_api_credentials')
        .select('api_name, credentials, is_connected')
        .eq('user_id', user.id)
        .in('api_name', ['gemini', 'pexels']);

      console.log('Media API credentials query result:', { data, error });

      if (error) {
        console.error('Error loading media API credentials:', error);
        return;
      }

      const loadedCredentials: MediaApiCredentials = {};
      const loadedConnected: Record<string, boolean> = {};

      if (data && data.length > 0) {
        data.forEach((row) => {
          if (row.api_name === 'gemini' && row.credentials) {
            loadedCredentials.gemini_api_key = (row.credentials as any).api_key || '';
            loadedConnected.gemini = !!row.is_connected && !!(row.credentials as any).api_key;
          } else if (row.api_name === 'pexels' && row.credentials) {
            loadedCredentials.pexels_api_key = (row.credentials as any).api_key || '';
            loadedConnected.pexels = !!row.is_connected && !!(row.credentials as any).api_key;
          }
        });
      }

      console.log('Loaded media API credentials:', loadedCredentials);
      setCredentials(loadedCredentials);
      setConnected(loadedConnected);
    } catch (error) {
      console.error('Failed to load media API credentials:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!user) return;

    setSaving(true);
    try {
      console.log('Saving media API credentials:', credentials);
      
      // Save Gemini API key if provided
      if (credentials.gemini_api_key) {
        const { error: geminiError } = await supabase
          .from('media_api_credentials')
          .upsert({
            user_id: user.id,
            api_name: 'gemini',
            credentials: { api_key: credentials.gemini_api_key },
            is_connected: !!credentials.gemini_api_key,
            updated_at: new Date().toISOString(),
          });

        if (geminiError) {
          console.error('Gemini save error:', geminiError);
          throw geminiError;
        }
      }

      // Save Pexels API key if provided
      if (credentials.pexels_api_key) {
        const { error: pexelsError } = await supabase
          .from('media_api_credentials')
          .upsert({
            user_id: user.id,
            api_name: 'pexels',
            credentials: { api_key: credentials.pexels_api_key },
            is_connected: !!credentials.pexels_api_key,
            updated_at: new Date().toISOString(),
          });

        if (pexelsError) {
          console.error('Pexels save error:', pexelsError);
          throw pexelsError;
        }
      }

      setConnected({
        gemini: !!credentials.gemini_api_key,
        pexels: !!credentials.pexels_api_key
      });

      await notificationService.showNotification({
        type: 'success',
        title: 'Media APIs Updated',
        message: 'API credentials have been saved successfully',
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error('Failed to save media API credentials:', error);
      await notificationService.showNotification({
        type: 'error',
        title: 'Save Failed',
        message: 'Failed to save API credentials',
        timestamp: new Date().toISOString()
      });
    } finally {
      setSaving(false);
    }
  };

  const testConnection = async (apiKey: string, apiType: string) => {
    if (!apiKey) return;
    
    setTesting(prev => ({ ...prev, [apiType]: true }));
    
    try {
      if (apiType === 'gemini') {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${apiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: 'Test connection' }] }]
          })
        });
        
        if (!response.ok) throw new Error('Invalid API key');
      } else if (apiType === 'pexels') {
        const response = await fetch('https://api.pexels.com/v1/search?query=test&per_page=1', {
          headers: { 'Authorization': apiKey }
        });
        
        if (!response.ok) throw new Error('Invalid API key');
      }

      await notificationService.showNotification({
        type: 'success',
        title: `${apiType.charAt(0).toUpperCase() + apiType.slice(1)} Connection`,
        message: 'API connection successful!',
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error(`${apiType} connection test failed:`, error);
      await notificationService.showNotification({
        type: 'error',
        title: 'Connection Failed',
        message: `Failed to connect to ${apiType} API`,
        timestamp: new Date().toISOString()
      });
    } finally {
      setTesting(prev => ({ ...prev, [apiType]: false }));
    }
  };

  const toggleShowKey = (key: string) => {
    setShowKeys(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const updateCredential = (key: keyof MediaApiCredentials, value: string) => {
    setCredentials(prev => ({ ...prev, [key]: value }));
  };

  const apis = [
    {
      key: 'gemini',
      name: 'Gemini 2.0 Flash',
      icon: <Image className="w-5 h-5" />,
      description: 'For AI image generation and visual descriptions',
      credentialKey: 'gemini_api_key' as keyof MediaApiCredentials,
      getKeyUrl: 'https://aistudio.google.com/app/apikey',
    },
    {
      key: 'pexels',
      name: 'Pexels',
      icon: <Video className="w-5 h-5" />,
      description: 'For stock video footage and images',
      credentialKey: 'pexels_api_key' as keyof MediaApiCredentials,
      getKeyUrl: 'https://www.pexels.com/api/',
    }
  ];

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="text-center mb-8">
          <h2 className="text-2xl font-bold text-black dark:text-white mb-2">Media Generation APIs</h2>
          <p className="text-gray-600 dark:text-gray-400">Loading API credentials...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold text-black dark:text-white mb-2">Media Generation APIs</h2>
        <p className="text-gray-600 dark:text-gray-400">Configure API keys for image and video generation</p>
      </div>

      <div className="grid gap-6">
        {apis.map((api) => (
          <Card key={api.key} className="bg-white dark:bg-black border-gray-200 dark:border-gray-800">
            <CardHeader className="pb-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {api.icon}
                  <div>
                    <CardTitle className="text-black dark:text-white flex items-center gap-2">
                      {api.name}
                      {connected[api.key] ? (
                        <Badge className="bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-700">
                          <CheckCircle className="w-3 h-3 mr-1" />
                          Connected
                        </Badge>
                      ) : (
                        <Badge className="bg-white dark:bg-black text-red-600 dark:text-red-400 border-red-200 dark:border-red-700">
                          <XCircle className="w-3 h-3 mr-1" />
                          Not Connected
                        </Badge>
                      )}
                    </CardTitle>
                    <p className="text-gray-600 dark:text-gray-400 text-sm mt-1">{api.description}</p>
                  </div>
                </div>
              </div>
            </CardHeader>

            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor={`${api.key}-key`} className="text-black dark:text-white">
                  API Key
                </Label>
                <div className="relative">
                  <Input
                    id={`${api.key}-key`}
                    type={showKeys[api.key] ? 'text' : 'password'}
                    value={credentials[api.credentialKey] || ''}
                    onChange={(e) => updateCredential(api.credentialKey, e.target.value)}
                    placeholder={`Enter your ${api.name} API key`}
                    className="bg-white dark:bg-black border-gray-300 dark:border-gray-600 text-black dark:text-white pr-10"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute right-0 top-0 h-full px-3 text-gray-600 dark:text-gray-400 hover:text-black dark:hover:text-white"
                    onClick={() => toggleShowKey(api.key)}
                  >
                    {showKeys[api.key] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </Button>
                </div>
              </div>

              <div className="flex justify-between items-center">
                <a
                  href={api.getKeyUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 text-sm underline"
                >
                  Get API Key →
                </a>
                
                <Button
                  onClick={() => testConnection(credentials[api.credentialKey] || '', api.key)}
                  disabled={!credentials[api.credentialKey] || testing[api.key]}
                  variant="outline"
                  size="sm"
                  className="border-gray-300 dark:border-gray-600 text-black dark:text-white hover:bg-blue-50 dark:hover:bg-blue-900/20"
                >
                  <TestTube className="w-4 h-4 mr-2" />
                  {testing[api.key] ? 'Testing...' : 'Test'}
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex justify-center">
        <Button
          onClick={handleSave}
          disabled={saving}
          className="bg-blue-600 hover:bg-blue-700 text-white px-8"
        >
          <Save className="w-4 h-4 mr-2" />
          {saving ? 'Saving...' : 'Save API Keys'}
        </Button>
      </div>
    </div>
  );
};
