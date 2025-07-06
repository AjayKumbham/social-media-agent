import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Brain, Save, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { notificationService } from '@/services/notificationService';

export const AISettings = () => {
  const { user } = useAuth();
  const [creativity, setCreativity] = useState([70]);
  const [tone, setTone] = useState('professional');
  const [contentLength, setContentLength] = useState([60]);
  const [targetAudience, setTargetAudience] = useState('developers');
  const [aiTemperature, setAiTemperature] = useState([70]);
  const [activeModels, setActiveModels] = useState<string[]>(['rapidapi-gpt4', 'gemini-2.0', 'llama3-8b']);
  const [topics, setTopics] = useState<string>('React, TypeScript, JavaScript, Web Development, Programming');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (user) {
      loadSettings();
    }
  }, [user]);

  const loadSettings = async () => {
    if (!user) return;
    
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('ai_settings')
        .select('*')
        .eq('user_id', user.id)
        .single();

      if (error && error.code !== 'PGRST116') {
        throw error;
      }

      if (data) {
        setCreativity([data.creativity_level]);
        setTone(data.tone);
        setContentLength([data.content_length]);
        setTargetAudience(data.target_audience || 'developers');
        setAiTemperature([data.ai_temperature || 70]);
        const models = Array.isArray(data.active_models) 
          ? (data.active_models as string[])
          : ['rapidapi-gpt4'];
        setActiveModels(models);
        const topicsArray = Array.isArray(data.topics) 
          ? (data.topics as string[])
          : [];
        setTopics(topicsArray.join(', '));
      }
    } catch (error: any) {
      console.error('Failed to load AI settings:', error);
      await notificationService.showNotification({
        type: 'error',
        title: 'Load Failed',
        message: `Failed to load AI settings: ${error.message}`,
        timestamp: new Date().toISOString()
      });
    } finally {
      setLoading(false);
    }
  };

  const saveSettings = async () => {
    if (!user) return;
    
    setSaving(true);
    try {
      const topicsArray = topics.split(',').map(t => t.trim()).filter(t => t);
      
      // Use upsert with conflict resolution for the unique constraint
      const { error } = await supabase
        .from('ai_settings')
        .upsert({
          user_id: user.id,
          creativity_level: creativity[0],
          tone,
          content_length: contentLength[0],
          target_audience: targetAudience,
          ai_temperature: aiTemperature[0],
          active_models: activeModels,
          topics: topicsArray,
        }, {
          onConflict: 'user_id'
        });

      if (error) throw error;

      await notificationService.showNotification({
        type: 'success',
        title: 'Settings Saved',
        message: 'AI configuration updated successfully',
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      console.error('Failed to save settings:', error);
      await notificationService.showNotification({
        type: 'error',
        title: 'Save Failed',
        message: `Failed to save AI settings: ${error.message}`,
        timestamp: new Date().toISOString()
      });
    } finally {
      setSaving(false);
    }
  };

  const aiModels = [
    { id: 'rapidapi-gpt4', name: 'GPT-4 (RapidAPI)', provider: 'RapidAPI ChatGPT', color: 'green', description: 'Most capable model via RapidAPI' },
    { id: 'gemini-2.0', name: 'Gemini 2.0 Flash', provider: 'Google', color: 'purple', description: 'Fast and efficient' },
    { id: 'llama3-8b', name: 'LLaMA3-8B-8192', provider: 'GroqCloud', color: 'orange', description: 'Open source, fast inference' },
  ];

  const toggleModel = (modelId: string) => {
    setActiveModels(prev => 
      prev.includes(modelId) 
        ? prev.filter(id => id !== modelId)
        : [...prev, modelId]
    );
  };

  if (loading) {
    return (
      <Card className="bg-slate-800/50 border-slate-700">
        <CardContent className="flex items-center justify-center p-6">
          <Loader2 className="w-6 h-6 animate-spin text-purple-400" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-slate-800/50 border-slate-700">
      <CardHeader>
        <CardTitle className="text-white flex items-center">
          <Brain className="w-5 h-5 mr-2 text-purple-400" />
          AI Configuration
        </CardTitle>
      </CardHeader>
      
      <CardContent className="space-y-6">
        <div className="space-y-3">
          <Label className="text-sm font-medium text-gray-300">Content Topics</Label>
          <Input
            value={topics}
            onChange={(e) => setTopics(e.target.value)}
            placeholder="React, JavaScript, Programming..."
            className="bg-slate-700 border-slate-600 text-white"
          />
          <p className="text-xs text-gray-400">Comma-separated topics for content generation</p>
        </div>

        <div className="space-y-3">
          <Label className="text-sm font-medium text-gray-300">Target Audience</Label>
          <Select value={targetAudience} onValueChange={setTargetAudience}>
            <SelectTrigger className="bg-slate-700 border-slate-600 text-white">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-slate-700 border-slate-600">
              <SelectItem value="developers">Developers</SelectItem>
              <SelectItem value="students">Students</SelectItem>
              <SelectItem value="entrepreneurs">Entrepreneurs</SelectItem>
              <SelectItem value="designers">Designers</SelectItem>
              <SelectItem value="marketers">Marketers</SelectItem>
              <SelectItem value="general">General Audience</SelectItem>
              <SelectItem value="professionals">Business Professionals</SelectItem>
              <SelectItem value="technical">Technical Professionals</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-gray-400">Define your primary audience for content tailoring</p>
        </div>

        <div className="space-y-3">
          <Label className="text-sm font-medium text-gray-300">Content Tone</Label>
          <Select value={tone} onValueChange={setTone}>
            <SelectTrigger className="bg-slate-700 border-slate-600 text-white">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-slate-700 border-slate-600">
              <SelectItem value="professional">Professional</SelectItem>
              <SelectItem value="casual">Casual</SelectItem>
              <SelectItem value="technical">Technical</SelectItem>
              <SelectItem value="inspirational">Inspirational</SelectItem>
              <SelectItem value="educational">Educational</SelectItem>
              <SelectItem value="conversational">Conversational</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-3">
          <div className="flex justify-between">
            <Label className="text-sm font-medium text-gray-300">Creativity Level</Label>
            <span className="text-sm text-purple-400">{creativity[0]}%</span>
          </div>
          <Slider
            value={creativity}
            onValueChange={setCreativity}
            max={100}
            step={1}
            className="w-full"
          />
          <p className="text-xs text-gray-400">Higher values = more creative and varied content</p>
        </div>

        <div className="space-y-3">
          <div className="flex justify-between">
            <Label className="text-sm font-medium text-gray-300">AI Temperature</Label>
            <span className="text-sm text-orange-400">{aiTemperature[0]}%</span>
          </div>
          <Slider
            value={aiTemperature}
            onValueChange={setAiTemperature}
            max={100}
            step={1}
            className="w-full"
          />
          <p className="text-xs text-gray-400">Controls randomness in AI responses (higher = more random)</p>
        </div>

        <div className="space-y-3">
          <div className="flex justify-between">
            <Label className="text-sm font-medium text-gray-300">Content Length</Label>
            <span className="text-sm text-blue-400">{contentLength[0]}%</span>
          </div>
          <Slider
            value={contentLength}
            onValueChange={setContentLength}
            max={100}
            step={1}
            className="w-full"
          />
          <p className="text-xs text-gray-400">Relative length for generated content</p>
        </div>

        <div className="space-y-3">
          <Label className="text-sm font-medium text-gray-300">Active AI Models</Label>
          <div className="space-y-2">
            {aiModels.map((model) => (
              <div 
                key={model.id} 
                className={`flex items-center justify-between p-3 rounded cursor-pointer transition-colors ${
                  activeModels.includes(model.id) 
                    ? 'bg-slate-700 border border-slate-600' 
                    : 'bg-slate-700/50 hover:bg-slate-700'
                }`}
                onClick={() => toggleModel(model.id)}
              >
                <div>
                  <span className="text-white text-sm font-medium">{model.name}</span>
                  <p className="text-xs text-gray-400">{model.provider}</p>
                  <p className="text-xs text-gray-500">{model.description}</p>
                </div>
                <Badge
                  variant={activeModels.includes(model.id) ? 'default' : 'secondary'}
                  className={`
                    ${model.color === 'green' && activeModels.includes(model.id) ? 'bg-green-500/20 text-green-400' : ''}
                    ${model.color === 'blue' && activeModels.includes(model.id) ? 'bg-blue-500/20 text-blue-400' : ''}
                    ${model.color === 'purple' && activeModels.includes(model.id) ? 'bg-purple-500/20 text-purple-400' : ''}
                    ${model.color === 'orange' && activeModels.includes(model.id) ? 'bg-orange-500/20 text-orange-400' : ''}
                  `}
                >
                  {activeModels.includes(model.id) ? 'Active' : 'Inactive'}
                </Badge>
              </div>
            ))}
          </div>
          <p className="text-xs text-gray-400">Select which AI models to use for content generation</p>
        </div>

        <Button 
          onClick={saveSettings}
          disabled={saving}
          className="w-full bg-purple-600 hover:bg-purple-700"
        >
          {saving ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <Save className="w-4 h-4 mr-2" />
          )}
          Save Configuration
        </Button>
      </CardContent>
    </Card>
  );
};
