
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { NotificationCenter } from './NotificationCenter';
import { BarChart3, Calendar, FileText, LayoutDashboard, LogOut, Zap } from 'lucide-react';

interface HeaderProps {
  activeTab?: string;
  setActiveTab?: (tab: string) => void;
}

export const Header = ({ activeTab, setActiveTab }: HeaderProps) => {
  const { user, signOut } = useAuth();

  if (!user) return null;

  const tabs = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'schedules', label: 'Schedules', icon: Calendar },
    { id: 'content', label: 'Content', icon: FileText },
    { id: 'analytics', label: 'Analytics', icon: BarChart3 },
  ];

  return (
    <header className="sticky top-0 z-50 backdrop-blur-xl bg-white/95 dark:bg-black/95 border-b border-border">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Logo & Brand */}
          <div className="flex items-center space-x-8">
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
                <Zap className="w-5 h-5 text-white" />
              </div>
              <h1 className="text-xl font-semibold text-black dark:text-white">
                Content Autopilot
              </h1>
            </div>
            
            {/* Navigation */}
            <nav className="hidden md:flex space-x-1">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  <Button
                    key={tab.id}
                    variant="ghost"
                    onClick={() => setActiveTab?.(tab.id)}
                    className={`
                      flex items-center space-x-2 px-4 py-2 rounded-lg transition-all duration-150 font-medium
                      ${isActive
                        ? "bg-primary text-white"
                        : "text-black dark:text-white hover:bg-gray-100 dark:hover:bg-gray-800"
                      }
                    `}
                  >
                    <Icon className="w-4 h-4" />
                    <span>{tab.label}</span>
                  </Button>
                );
              })}
            </nav>
          </div>
          
          {/* Right Side - User & Actions */}
          <div className="flex items-center space-x-4">
            <NotificationCenter />
            
            {/* User Info */}
            <div className="hidden sm:flex items-center space-x-3">
              <div className="text-right">
                <div className="text-sm font-medium text-black dark:text-white">
                  {user.email?.split('@')[0]}
                </div>
                <div className="text-xs text-gray-500">
                  {user.email?.split('@')[1]}
                </div>
              </div>
              <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center text-white font-medium text-sm">
                {user.email?.charAt(0).toUpperCase()}
              </div>
            </div>
            
            <Button 
              variant="outline" 
              onClick={signOut}
              className="btn-enhanced border-gray-300 dark:border-gray-600 text-black dark:text-white hover:bg-gray-100 dark:hover:bg-gray-800"
              size="sm"
            >
              <LogOut className="w-4 h-4 mr-2" />
              Sign Out
            </Button>
          </div>
        </div>

        {/* Mobile Navigation */}
        <div className="md:hidden pb-3">
          <nav className="flex space-x-1 overflow-x-auto">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <Button
                  key={tab.id}
                  variant="ghost"
                  size="sm"
                  onClick={() => setActiveTab?.(tab.id)}
                  className={`
                    flex items-center space-x-1 whitespace-nowrap px-3 py-2 rounded-lg transition-all duration-150 font-medium
                    ${isActive
                      ? "bg-primary text-white"
                      : "text-black dark:text-white hover:bg-gray-100 dark:hover:bg-gray-800"
                    }
                  `}
                >
                  <Icon className="w-4 h-4" />
                  <span className="text-xs">{tab.label}</span>
                </Button>
              );
            })}
          </nav>
        </div>
      </div>
    </header>
  );
};
