
import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Eye, EyeOff, Save, CheckCircle, XCircle, TestTube } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { notificationService } from '@/services/notificationService';

interface MediaApiCredentials {
  gemini_api_key?: string;
  pexels_api_key?: string;
}

export const MediaApiSetup = () => {
  const { user } = useAuth();
  const [credentials, setCredentials] = useState<MediaApiCredentials>({});
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState<Record<string, boolean>>({});
  const [connected, setConnected] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (user) {
      loadCredentials();
    }
  }, [user]);

  const loadCredentials = async () => {
    try {
      const { data, error } = await supabase
        .from('platforms')
        .select('credentials')
        .eq('user_id', user?.id)
        .eq('platform_name', 'media_apis')
        .single();

      if (data && !error) {
        const creds = data.credentials as MediaApiCredentials;
        setCredentials(creds);
        setConnected({
          gemini: !!creds.gemini_api_key,
          pexels: !!creds.pexels_api_key
        });
      }
    } catch (error) {
      console.error('Failed to load media API credentials:', error);
    }
  };

  const handleSave = async () => {
    if (!user) return;

    setSaving(true);
    try {
      const { error } = await supabase
        .from('platforms')
        .upsert({
          user_id: user.id,
          platform_name: 'media_apis',
          credentials: credentials as any, // Cast to any to satisfy Json type
          is_connected: !!(credentials.gemini_api_key || credentials.pexels_api_key),
          is_active: true,
          updated_at: new Date().toISOString(),
        });

      if (error) throw error;

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
      description: 'For AI image generation and visual descriptions',
      credentialKey: 'gemini_api_key' as keyof MediaApiCredentials,
      getKeyUrl: 'https://aistudio.google.com/app/apikey',
      required: true
    },
    {
      key: 'pexels',
      name: 'Pexels',
      description: 'For stock video footage and images',
      credentialKey: 'pexels_api_key' as keyof MediaApiCredentials,
      getKeyUrl: 'https://www.pexels.com/api/',
      required: true
    }
  ];

  return (
    <div className="space-y-6">
      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold text-white mb-2">Media Generation APIs</h2>
        <p className="text-gray-300">Configure API keys for image and video generation</p>
        <p className="text-sm text-gray-400 mt-2">Voice generation uses free Web Speech API (no key required)</p>
      </div>

      <div className="grid gap-6">
        {apis.map((api) => (
          <Card key={api.key} className="bg-slate-800/50 border-slate-700">
            <CardHeader className="pb-4">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-white flex items-center gap-2">
                    {api.name}
                    {connected[api.key] ? (
                      <Badge className="bg-green-500/20 text-green-400">
                        <CheckCircle className="w-3 h-3 mr-1" />
                        Connected
                      </Badge>
                    ) : (
                      <Badge className="bg-red-500/20 text-red-400">
                        <XCircle className="w-3 h-3 mr-1" />
                        Not Connected
                      </Badge>
                    )}
                    {api.required && (
                      <Badge variant="secondary" className="bg-orange-500/20 text-orange-400">
                        Required
                      </Badge>
                    )}
                  </CardTitle>
                  <p className="text-gray-400 text-sm mt-1">{api.description}</p>
                </div>
              </div>
            </CardHeader>

            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor={`${api.key}-key`} className="text-gray-300">
                  API Key
                </Label>
                <div className="relative">
                  <Input
                    id={`${api.key}-key`}
                    type={showKeys[api.key] ? 'text' : 'password'}
                    value={credentials[api.credentialKey] || ''}
                    onChange={(e) => updateCredential(api.credentialKey, e.target.value)}
                    placeholder={`Enter your ${api.name} API key`}
                    className="bg-slate-700 border-slate-600 text-white pr-10"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute right-0 top-0 h-full px-3 text-gray-400 hover:text-white"
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
                  className="text-blue-400 hover:text-blue-300 text-sm underline"
                >
                  Get API Key →
                </a>
                
                <Button
                  onClick={() => testConnection(credentials[api.credentialKey] || '', api.key)}
                  disabled={!credentials[api.credentialKey] || testing[api.key]}
                  variant="outline"
                  size="sm"
                  className="border-slate-600 text-slate-300 hover:bg-slate-700"
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
