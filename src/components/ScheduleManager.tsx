import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Trash2, Plus, Edit, Calendar, Clock, Save, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { notificationService } from '@/services/notificationService';
import { getCurrentISTFormatted, getCurrentISTTimeString } from '@/utils/timeUtils';

interface Schedule {
  id: string;
  platform_name: string;
  max_posts_per_day: number;
  preferred_times: string[];
  days_of_week: number[];
  is_active: boolean;
  created_at: string;
}

export const ScheduleManager = () => {
  const { user } = useAuth();
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  
  // Form state
  const [formData, setFormData] = useState({
    platform_name: '',
    max_posts_per_day: 3,
    preferred_times: ['09:00', '14:00', '18:00'],
    days_of_week: [1, 2, 3, 4, 5], // Monday to Friday
    is_active: true,
  });

  const platforms = [
    'hashnode', 'devto', 'twitter', 'linkedin', 'instagram', 'youtube', 'reddit'
  ];

  const daysOfWeek = [
    { value: 0, label: 'Sunday' },
    { value: 1, label: 'Monday' },
    { value: 2, label: 'Tuesday' },
    { value: 3, label: 'Wednesday' },
    { value: 4, label: 'Thursday' },
    { value: 5, label: 'Friday' },
    { value: 6, label: 'Saturday' },
  ];

  useEffect(() => {
    if (user) {
      loadSchedules();
    }
  }, [user]);

  const loadSchedules = async () => {
    if (!user) return;
    
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('posting_schedule')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      
      // Transform the data to match our Schedule interface
      const transformedSchedules = (data || []).map(item => ({
        id: item.id,
        platform_name: item.platform_name,
        max_posts_per_day: item.max_posts_per_day,
        preferred_times: Array.isArray(item.preferred_times) ? item.preferred_times as string[] : [],
        days_of_week: Array.isArray(item.days_of_week) ? item.days_of_week as number[] : [1, 2, 3, 4, 5],
        is_active: item.is_active,
        created_at: item.created_at,
      }));
      
      setSchedules(transformedSchedules);
    } catch (error) {
      console.error('Failed to load schedules:', error);
      await notificationService.showNotification({
        type: 'error',
        title: 'Load Failed',
        message: 'Failed to load posting schedules',
        timestamp: new Date().toISOString()
      });
    } finally {
      setLoading(false);
    }
  };

  const createSchedule = async () => {
    if (!user) return;
    
    try {
      const { error } = await supabase
        .from('posting_schedule')
        .insert({
          user_id: user.id,
          platform_name: formData.platform_name,
          max_posts_per_day: formData.max_posts_per_day,
          preferred_times: formData.preferred_times,
          days_of_week: formData.days_of_week,
          is_active: formData.is_active,
        });

      if (error) throw error;

      await loadSchedules();
      setShowCreateForm(false);
      resetForm();

      await notificationService.showNotification({
        type: 'success',
        title: 'Schedule Created',
        message: `Schedule created for ${formData.platform_name} (IST timezone)`,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Failed to create schedule:', error);
      await notificationService.showNotification({
        type: 'error',
        title: 'Creation Failed',
        message: 'Failed to create posting schedule',
        timestamp: new Date().toISOString()
      });
    }
  };

  const updateSchedule = async (id: string) => {
    try {
      const { error } = await supabase
        .from('posting_schedule')
        .update({
          platform_name: formData.platform_name,
          max_posts_per_day: formData.max_posts_per_day,
          preferred_times: formData.preferred_times,
          days_of_week: formData.days_of_week,
          is_active: formData.is_active,
        })
        .eq('id', id);

      if (error) throw error;

      await loadSchedules();
      setEditingId(null);
      resetForm();

      await notificationService.showNotification({
        type: 'success',
        title: 'Schedule Updated',
        message: 'Posting schedule updated successfully',
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Failed to update schedule:', error);
      await notificationService.showNotification({
        type: 'error',
        title: 'Update Failed',
        message: 'Failed to update posting schedule',
        timestamp: new Date().toISOString()
      });
    }
  };

  const deleteSchedule = async (id: string) => {
    try {
      const { error } = await supabase
        .from('posting_schedule')
        .delete()
        .eq('id', id);

      if (error) throw error;

      await loadSchedules();

      await notificationService.showNotification({
        type: 'success',
        title: 'Schedule Deleted',
        message: 'Posting schedule deleted successfully',
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Failed to delete schedule:', error);
      await notificationService.showNotification({
        type: 'error',
        title: 'Delete Failed',
        message: 'Failed to delete posting schedule',
        timestamp: new Date().toISOString()
      });
    }
  };

  const startEdit = (schedule: Schedule) => {
    setFormData({
      platform_name: schedule.platform_name,
      max_posts_per_day: schedule.max_posts_per_day,
      preferred_times: schedule.preferred_times,
      days_of_week: schedule.days_of_week,
      is_active: schedule.is_active,
    });
    setEditingId(schedule.id);
  };

  const resetForm = () => {
    setFormData({
      platform_name: '',
      max_posts_per_day: 3,
      preferred_times: ['09:00', '14:00', '18:00'],
      days_of_week: [1, 2, 3, 4, 5],
      is_active: true,
    });
  };

  const addTime = () => {
    setFormData(prev => ({
      ...prev,
      preferred_times: [...prev.preferred_times, '12:00']
    }));
  };

  const updateTime = (index: number, time: string) => {
    setFormData(prev => ({
      ...prev,
      preferred_times: prev.preferred_times.map((t, i) => i === index ? time : t)
    }));
  };

  const removeTime = (index: number) => {
    setFormData(prev => ({
      ...prev,
      preferred_times: prev.preferred_times.filter((_, i) => i !== index)
    }));
  };

  const toggleDay = (day: number) => {
    setFormData(prev => ({
      ...prev,
      days_of_week: prev.days_of_week.includes(day)
        ? prev.days_of_week.filter(d => d !== day)
        : [...prev.days_of_week, day].sort()
    }));
  };

  const getCurrentISTTime = () => {
    return getCurrentISTTimeString();
  };

  const ScheduleForm = ({ isEdit = false, onSave, onCancel }: { 
    isEdit?: boolean; 
    onSave: () => void; 
    onCancel: () => void; 
  }) => (
    <div className="space-y-4 p-4 bg-slate-700/30 rounded-lg">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-medium text-white">
          {isEdit ? 'Edit Schedule' : 'Create New Schedule'}
        </h3>
        <div className="text-sm text-gray-400">
          Current IST: {getCurrentISTTime()}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label className="text-sm text-gray-300">Platform</Label>
          <Select 
            value={formData.platform_name} 
            onValueChange={(value) => setFormData(prev => ({ ...prev, platform_name: value }))}
          >
            <SelectTrigger className="bg-slate-700 border-slate-600 text-white">
              <SelectValue placeholder="Select platform" />
            </SelectTrigger>
            <SelectContent className="bg-slate-700 border-slate-600">
              {platforms.map(platform => (
                <SelectItem key={platform} value={platform}>
                  {platform.charAt(0).toUpperCase() + platform.slice(1)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label className="text-sm text-gray-300">Posts per day</Label>
          <Input
            type="number"
            min="1"
            max="10"
            value={formData.max_posts_per_day}
            onChange={(e) => setFormData(prev => ({ ...prev, max_posts_per_day: parseInt(e.target.value) }))}
            className="bg-slate-700 border-slate-600 text-white"
          />
        </div>
      </div>

      <div>
        <Label className="text-sm text-gray-300">Days of Week</Label>
        <div className="flex flex-wrap gap-2 mt-2">
          {daysOfWeek.map(day => (
            <Button
              key={day.value}
              variant={formData.days_of_week.includes(day.value) ? "default" : "outline"}
              size="sm"
              onClick={() => toggleDay(day.value)}
              className={formData.days_of_week.includes(day.value) 
                ? "bg-purple-600 hover:bg-purple-700" 
                : "border-slate-600 text-gray-300 hover:bg-slate-700"
              }
            >
              {day.label.slice(0, 3)}
            </Button>
          ))}
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <Label className="text-sm text-gray-300">Posting Times (IST - 24H Format)</Label>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addTime}
            className="border-slate-600 text-gray-300 hover:bg-slate-700"
          >
            <Plus className="w-4 h-4" />
          </Button>
        </div>
        <div className="space-y-2">
          {formData.preferred_times.map((time, index) => (
            <div key={index} className="flex items-center gap-2">
              <Input
                type="time"
                value={time}
                onChange={(e) => updateTime(index, e.target.value)}
                className="bg-slate-700 border-slate-600 text-white"
              />
              {formData.preferred_times.length > 1 && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => removeTime(index)}
                  className="border-slate-600 text-red-400 hover:bg-red-900/20"
                >
                  <X className="w-4 h-4" />
                </Button>
              )}
            </div>
          ))}
        </div>
        <p className="text-xs text-gray-400 mt-2">All times are in Indian Standard Time (IST) - 24 hour format</p>
      </div>

      <div className="flex items-center space-x-2">
        <Switch
          checked={formData.is_active}
          onCheckedChange={(checked) => setFormData(prev => ({ ...prev, is_active: checked }))}
        />
        <Label className="text-sm text-gray-300">Active</Label>
      </div>

      <div className="flex gap-2">
        <Button
          onClick={onSave}
          disabled={!formData.platform_name}
          className="bg-purple-600 hover:bg-purple-700"
        >
          <Save className="w-4 h-4 mr-2" />
          {isEdit ? 'Update' : 'Create'} Schedule
        </Button>
        <Button
          variant="outline"
          onClick={onCancel}
          className="border-slate-600 text-gray-300 hover:bg-slate-700"
        >
          Cancel
        </Button>
      </div>
    </div>
  );

  return (
    <Card className="bg-slate-800/50 border-slate-700">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-white flex items-center">
            <Calendar className="w-5 h-5 mr-2 text-purple-400" />
            Posting Schedules (IST)
          </CardTitle>
          <Button
            onClick={() => setShowCreateForm(true)}
            className="bg-purple-600 hover:bg-purple-700"
          >
            <Plus className="w-4 h-4 mr-2" />
            Create Schedule
          </Button>
        </div>
        <p className="text-sm text-gray-400">
          Current IST: {getCurrentISTTime()}
        </p>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {showCreateForm && (
          <ScheduleForm
            onSave={createSchedule}
            onCancel={() => {
              setShowCreateForm(false);
              resetForm();
            }}
          />
        )}

        {loading ? (
          <div className="text-center py-8">
            <div className="text-gray-400">Loading schedules...</div>
          </div>
        ) : schedules.length === 0 ? (
          <div className="text-center py-8">
            <div className="text-gray-400">No schedules created yet</div>
            <p className="text-sm text-gray-500 mt-2">Create your first posting schedule to get started with automated content publishing</p>
          </div>
        ) : (
          <div className="space-y-4">
            {schedules.map((schedule) => (
              <div key={schedule.id} className="p-4 bg-slate-700/50 rounded-lg">
                {editingId === schedule.id ? (
                  <ScheduleForm
                    isEdit
                    onSave={() => updateSchedule(schedule.id)}
                    onCancel={() => {
                      setEditingId(null);
                      resetForm();
                    }}
                  />
                ) : (
                  <div className="flex items-center justify-between">
                    <div className="space-y-2">
                      <div className="flex items-center gap-3">
                        <h3 className="text-white font-medium capitalize">
                          {schedule.platform_name}
                        </h3>
                        <Badge
                          variant={schedule.is_active ? "default" : "secondary"}
                          className={schedule.is_active 
                            ? "bg-green-500/20 text-green-400" 
                            : "bg-gray-500/20 text-gray-400"
                          }
                        >
                          {schedule.is_active ? 'Active' : 'Inactive'}
                        </Badge>
                      </div>
                      
                      <div className="text-sm text-gray-400">
                        {schedule.max_posts_per_day} posts/day • {schedule.preferred_times.length} times • IST timezone
                      </div>
                      
                      <div className="flex items-center gap-2">
                        <Clock className="w-4 h-4 text-gray-500" />
                        <span className="text-sm text-gray-400">
                          {schedule.preferred_times.join(', ')} IST
                        </span>
                      </div>
                      
                      <div className="flex items-center gap-1">
                        {daysOfWeek.map(day => (
                          <Badge
                            key={day.value}
                            variant="outline"
                            className={`text-xs ${
                              schedule.days_of_week.includes(day.value)
                                ? 'border-purple-500 text-purple-400'
                                : 'border-gray-600 text-gray-500'
                            }`}
                          >
                            {day.label.slice(0, 3)}
                          </Badge>
                        ))}
                      </div>
                    </div>
                    
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => startEdit(schedule)}
                        className="border-slate-600 text-gray-300 hover:bg-slate-700"
                      >
                        <Edit className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => deleteSchedule(schedule.id)}
                        className="border-red-600 text-red-400 hover:bg-red-900/20"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
