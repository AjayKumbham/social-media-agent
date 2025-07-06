
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Settings, Activity, Zap, TrendingUp } from 'lucide-react';

interface DashboardCardProps {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  actions?: React.ReactNode;
}

export const DashboardCard = ({ title, subtitle, children, actions }: DashboardCardProps) => {
  return (
    <Card className="bg-white dark:bg-black border border-gray-200 dark:border-gray-800 hover:border-blue-500 dark:hover:border-blue-400 transition-all duration-200">
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-black dark:text-white text-lg font-semibold">
              {title}
            </CardTitle>
            {subtitle && (
              <p className="text-gray-600 dark:text-gray-400 text-sm mt-1">{subtitle}</p>
            )}
          </div>
          {actions}
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {children}
      </CardContent>
    </Card>
  );
};

interface StatusCardProps {
  icon: React.ReactNode;
  title: string;
  value: string | number;
  description: string;
  trend?: 'up' | 'down' | 'neutral';
}

export const StatusCard = ({ icon, title, value, description, trend }: StatusCardProps) => {
  return (
    <Card className="bg-white dark:bg-black border border-gray-200 dark:border-gray-800 hover:border-blue-500 dark:hover:border-blue-400 transition-all duration-200">
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center">
              {icon}
            </div>
            <div>
              <p className="text-gray-600 dark:text-gray-400 text-sm font-medium">{title}</p>
              <p className="text-2xl font-semibold text-black dark:text-white">{value}</p>
            </div>
          </div>
          {trend && (
            <div className={`flex items-center space-x-1 ${
              trend === 'up' ? 'text-blue-600' : 
              trend === 'down' ? 'text-red-600' : 
              'text-gray-500'
            }`}>
              <TrendingUp className="w-4 h-4" />
            </div>
          )}
        </div>
        <p className="text-gray-600 dark:text-gray-400 text-xs mt-2">{description}</p>
      </CardContent>
    </Card>
  );
};

interface MetricCardProps {
  label: string;
  value: string | number;
  change?: string;
  changeType?: 'positive' | 'negative' | 'neutral';
}

export const MetricCard = ({ label, value, change, changeType }: MetricCardProps) => {
  return (
    <div className="bg-white dark:bg-black border border-gray-200 dark:border-gray-800 rounded-lg p-4 hover:border-blue-500 dark:hover:border-blue-400 transition-all duration-200">
      <div className="text-center">
        <div className="text-2xl font-semibold text-black dark:text-white mb-1">
          {value}
        </div>
        <div className="text-xs text-gray-600 dark:text-gray-400 font-medium mb-2">
          {label}
        </div>
        {change && (
          <Badge 
            className={`text-xs ${
              changeType === 'positive' ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300' :
              changeType === 'negative' ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300' :
              'bg-white dark:bg-black text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-800'
            }`}
          >
            {change}
          </Badge>
        )}
      </div>
    </div>
  );
};
