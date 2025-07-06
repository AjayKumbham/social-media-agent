import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Bell, CheckCircle, AlertCircle, Info, XCircle, X, Trash2, Settings } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { notificationService } from '@/services/notificationService';
import { formatRelativeTime } from '@/utils/timeUtils';

interface NotificationItem {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  title: string;
  message: string;
  platform?: string;
  action?: string;
  category?: string;
  priority?: string;
  created_at: string;
  read: boolean;
}

interface NotificationCenterProps {
  onShowPreferences?: () => void;
}

export const NotificationCenter = ({ onShowPreferences }: NotificationCenterProps) => {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    if (user) {
      loadNotifications();
      loadUnreadCount();
      
      // Set up real-time subscription
      const channel = supabase
        .channel('notifications-changes')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'notifications',
            filter: `user_id=eq.${user.id}`
          },
          () => {
            loadNotifications();
            loadUnreadCount();
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [user, selectedCategory]);

  const loadNotifications = async () => {
    if (!user) return;
    
    try {
      const category = selectedCategory === 'all' ? undefined : selectedCategory;
      const result = await notificationService.getNotifications(20, 0, category);
      
      // Type guard to ensure proper typing
      const typedNotifications: NotificationItem[] = result.data.map(item => ({
        ...item,
        type: ['success', 'error', 'warning', 'info'].includes(item.type) 
          ? item.type as 'success' | 'error' | 'warning' | 'info'
          : 'info'
      }));
      
      setNotifications(typedNotifications);
      setHasMore(result.hasMore);
    } catch (error) {
      console.error('Failed to load notifications:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadUnreadCount = async () => {
    if (!user) return;
    
    try {
      const category = selectedCategory === 'all' ? undefined : selectedCategory;
      const count = await notificationService.getUnreadCount(category);
      setUnreadCount(count);
    } catch (error) {
      console.error('Failed to load unread count:', error);
    }
  };

  const loadMoreNotifications = async () => {
    if (!hasMore || loadingMore) return;
    
    setLoadingMore(true);
    try {
      const category = selectedCategory === 'all' ? undefined : selectedCategory;
      const result = await notificationService.getNotifications(20, notifications.length, category);
      
      const typedNotifications: NotificationItem[] = result.data.map(item => ({
        ...item,
        type: ['success', 'error', 'warning', 'info'].includes(item.type) 
          ? item.type as 'success' | 'error' | 'warning' | 'info'
          : 'info'
      }));
      
      setNotifications(prev => [...prev, ...typedNotifications]);
      setHasMore(result.hasMore);
    } catch (error) {
      console.error('Failed to load more notifications:', error);
    } finally {
      setLoadingMore(false);
    }
  };

  const markAsRead = async (notificationId: string) => {
    try {
      await notificationService.markAsRead(notificationId);
      setNotifications(prev => 
        prev.map(n => n.id === notificationId ? { ...n, read: true } : n)
      );
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (error) {
      console.error('Failed to mark notification as read:', error);
    }
  };

  const markAllAsRead = async () => {
    try {
      const category = selectedCategory === 'all' ? undefined : selectedCategory;
      await notificationService.markAllAsRead(category);
      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
      setUnreadCount(0);
    } catch (error) {
      console.error('Failed to mark all notifications as read:', error);
    }
  };

  const deleteNotification = async (notificationId: string) => {
    try {
      await notificationService.deleteNotification(notificationId);
      setNotifications(prev => prev.filter(n => n.id !== notificationId));
    } catch (error) {
      console.error('Failed to delete notification:', error);
    }
  };

  const deleteAllRead = async () => {
    try {
      const category = selectedCategory === 'all' ? undefined : selectedCategory;
      await notificationService.deleteAllRead(category);
      setNotifications(prev => prev.filter(n => !n.read));
    } catch (error) {
      console.error('Failed to delete read notifications:', error);
    }
  };

  const getIcon = (type: string) => {
    switch (type) {
      case 'success':
        return <CheckCircle className="w-4 h-4 text-green-400" />;
      case 'error':
        return <XCircle className="w-4 h-4 text-red-400" />;
      case 'warning':
        return <AlertCircle className="w-4 h-4 text-yellow-400" />;
      case 'info':
        return <Info className="w-4 h-4 text-blue-400" />;
      default:
        return <Bell className="w-4 h-4 text-gray-400" />;
    }
  };

  const formatTime = (timestamp: string) => {
    return formatRelativeTime(timestamp);
  };

  if (!isOpen) {
    return (
      <div className="relative">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setIsOpen(true)}
          className="relative text-gray-400 hover:text-white"
        >
          <Bell className="w-5 h-5" />
          {unreadCount > 0 && (
            <Badge 
              variant="destructive" 
              className="absolute -top-1 -right-1 h-5 w-5 p-0 flex items-center justify-center text-xs"
            >
              {unreadCount > 99 ? '99+' : unreadCount}
            </Badge>
          )}
        </Button>
      </div>
    );
  }

  return (
    <Card className="absolute top-12 right-0 w-96 max-h-[500px] overflow-hidden bg-slate-800/95 border-slate-700 backdrop-blur-sm z-50">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-white flex items-center">
            <Bell className="w-5 h-5 mr-2 text-blue-400" />
            Notifications
            {unreadCount > 0 && (
              <Badge variant="secondary" className="ml-2 bg-blue-500/20 text-blue-400">
                {unreadCount}
              </Badge>
            )}
          </CardTitle>
          <div className="flex items-center gap-2">
            {onShowPreferences && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onShowPreferences}
                className="text-gray-400 hover:text-white"
              >
                <Settings className="w-4 h-4" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsOpen(false)}
              className="text-gray-400 hover:text-white"
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>
        
        <div className="flex items-center justify-between gap-2">
          <Select value={selectedCategory} onValueChange={setSelectedCategory}>
            <SelectTrigger className="bg-slate-700 border-slate-600 text-white h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-slate-800 border-slate-700">
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="posting">Posting</SelectItem>
              <SelectItem value="analytics">Analytics</SelectItem>
              <SelectItem value="scheduling">Scheduling</SelectItem>
              <SelectItem value="system">System</SelectItem>
            </SelectContent>
          </Select>
          
          <div className="flex gap-1">
            {unreadCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={markAllAsRead}
                className="text-xs text-blue-400 hover:text-blue-300 h-8 px-2"
              >
                Mark all read
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={deleteAllRead}
              className="text-xs text-gray-400 hover:text-red-400 h-8 px-2"
            >
              <Trash2 className="w-3 h-3" />
            </Button>
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="p-0">
        <div className="max-h-80 overflow-y-auto">
          {loading ? (
            <div className="p-4 text-center text-gray-400">Loading notifications...</div>
          ) : notifications.length === 0 ? (
            <div className="p-4 text-center text-gray-400">No notifications yet</div>
          ) : (
            <div className="space-y-1">
              {notifications.map((notification) => (
                <div
                  key={notification.id}
                  className={`p-3 border-b border-slate-700/50 hover:bg-slate-700/30 transition-colors ${
                    !notification.read ? 'bg-slate-700/20' : ''
                  }`}
                >
                  <div className="flex items-start gap-3">
                    {getIcon(notification.type)}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <h4 className={`text-sm font-medium ${
                          !notification.read ? 'text-white' : 'text-gray-300'
                        }`}>
                          {notification.title}
                        </h4>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => deleteNotification(notification.id)}
                          className="h-6 w-6 p-0 text-gray-500 hover:text-red-400"
                        >
                          <X className="w-3 h-3" />
                        </Button>
                      </div>
                      <p className="text-xs text-gray-400 mt-1 line-clamp-2">
                        {notification.message}
                      </p>
                      <div className="flex items-center justify-between mt-2">
                        <div className="flex items-center gap-2">
                          {notification.platform && (
                            <Badge variant="outline" className="text-xs border-slate-600 text-gray-400">
                              {notification.platform}
                            </Badge>
                          )}
                          {notification.category && (
                            <Badge variant="outline" className="text-xs border-slate-600 text-gray-500">
                              {notification.category}
                            </Badge>
                          )}
                          <span className="text-xs text-gray-500">
                            {formatTime(notification.created_at)}
                          </span>
                        </div>
                        {!notification.read && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => markAsRead(notification.id)}
                            className="text-xs text-blue-400 hover:text-blue-300 h-6 px-2"
                          >
                            Mark read
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
              
              {hasMore && (
                <div className="p-3 text-center">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={loadMoreNotifications}
                    disabled={loadingMore}
                    className="text-blue-400 hover:text-blue-300"
                  >
                    {loadingMore ? 'Loading...' : 'Load more'}
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};
