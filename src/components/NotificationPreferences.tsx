
import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Settings, Bell, Database, Trash2 } from 'lucide-react';
import { notificationService, type NotificationPreferences as NotificationPrefs } from '@/services/notificationService';
import { toast } from 'sonner';

export const NotificationPreferences = () => {
  const [preferences, setPreferences] = useState<NotificationPrefs | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [cleaning, setCleaning] = useState(false);

  useEffect(() => {
    loadPreferences();
  }, []);

  const loadPreferences = async () => {
    try {
      const prefs = await notificationService.getPreferences();
      setPreferences(prefs);
    } catch (error) {
      console.error('Failed to load preferences:', error);
      toast.error('Failed to load notification preferences');
    } finally {
      setLoading(false);
    }
  };

  const savePreferences = async () => {
    if (!preferences) return;
    
    setSaving(true);
    try {
      await notificationService.updatePreferences(preferences);
      toast.success('Notification preferences saved');
    } catch (error) {
      console.error('Failed to save preferences:', error);
      toast.error('Failed to save preferences');
    } finally {
      setSaving(false);
    }
  };

  const cleanupOldNotifications = async () => {
    setCleaning(true);
    try {
      await notificationService.cleanupOldNotifications();
      toast.success('Old notifications cleaned up');
    } catch (error) {
      console.error('Failed to cleanup notifications:', error);
      toast.error('Failed to cleanup notifications');
    } finally {
      setCleaning(false);
    }
  };

  const updatePreference = (path: string[], value: boolean) => {
    if (!preferences) return;
    
    const newPrefs = { ...preferences };
    let current: any = newPrefs;
    
    for (let i = 0; i < path.length - 1; i++) {
      current = current[path[i]];
    }
    
    current[path[path.length - 1]] = value;
    setPreferences(newPrefs);
  };

  if (loading) {
    return (
      <Card className="bg-slate-800/50 border-slate-700">
        <CardContent className="p-6">
          <div className="text-center text-gray-400">Loading preferences...</div>
        </CardContent>
      </Card>
    );
  }

  if (!preferences) {
    return (
      <Card className="bg-slate-800/50 border-slate-700">
        <CardContent className="p-6">
          <div className="text-center text-gray-400">Failed to load preferences</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="bg-slate-800/50 border-slate-700">
        <CardHeader>
          <CardTitle className="text-white flex items-center">
            <Settings className="w-5 h-5 mr-2 text-blue-400" />
            Notification Preferences
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* General Settings */}
          <div className="space-y-4">
            <h3 className="text-lg font-medium text-white">General Settings</h3>
            
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <Bell className="w-4 h-4 text-blue-400" />
                <div>
                  <p className="text-white font-medium">Toast Notifications</p>
                  <p className="text-gray-400 text-sm">Show popup notifications</p>
                </div>
              </div>
              <Switch
                checked={preferences.enableToasts}
                onCheckedChange={(checked) => updatePreference(['enableToasts'], checked)}
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <Database className="w-4 h-4 text-green-400" />
                <div>
                  <p className="text-white font-medium">Database Storage</p>
                  <p className="text-gray-400 text-sm">Save notifications to database</p>
                </div>
              </div>
              <Switch
                checked={preferences.enableDatabase}
                onCheckedChange={(checked) => updatePreference(['enableDatabase'], checked)}
              />
            </div>
          </div>

          {/* Categories */}
          <div className="space-y-4">
            <h3 className="text-lg font-medium text-white">Categories</h3>
            
            {Object.entries(preferences.categories).map(([category, enabled]) => (
              <div key={category} className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <Badge variant="outline" className="capitalize border-slate-600 text-gray-400">
                    {category}
                  </Badge>
                  <p className="text-gray-400 text-sm">
                    {category === 'posting' && 'Content publishing and generation'}
                    {category === 'analytics' && 'Performance metrics and reports'}
                    {category === 'scheduling' && 'Content scheduling updates'}
                    {category === 'system' && 'System alerts and maintenance'}
                  </p>
                </div>
                <Switch
                  checked={enabled}
                  onCheckedChange={(checked) => updatePreference(['categories', category], checked)}
                />
              </div>
            ))}
          </div>

          {/* Priority Levels */}
          <div className="space-y-4">
            <h3 className="text-lg font-medium text-white">Priority Levels</h3>
            
            {Object.entries(preferences.priority).map(([priority, enabled]) => (
              <div key={priority} className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <Badge 
                    variant={priority === 'high' ? 'destructive' : priority === 'medium' ? 'default' : 'secondary'}
                    className="capitalize"
                  >
                    {priority}
                  </Badge>
                  <p className="text-gray-400 text-sm">
                    {priority === 'high' && 'Critical alerts and errors'}
                    {priority === 'medium' && 'Important updates and warnings'}
                    {priority === 'low' && 'General information and tips'}
                  </p>
                </div>
                <Switch
                  checked={enabled}
                  onCheckedChange={(checked) => updatePreference(['priority', priority], checked)}
                />
              </div>
            ))}
          </div>

          {/* Actions */}
          <div className="flex items-center space-x-4 pt-4 border-t border-slate-700">
            <Button
              onClick={savePreferences}
              disabled={saving}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {saving ? 'Saving...' : 'Save Preferences'}
            </Button>
            
            <Button
              onClick={cleanupOldNotifications}
              disabled={cleaning}
              variant="outline"
              className="border-slate-600 text-gray-300 hover:bg-slate-700"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              {cleaning ? 'Cleaning...' : 'Cleanup Old'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
