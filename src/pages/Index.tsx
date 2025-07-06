
import { useState } from 'react';
import { Header } from '@/components/Header';
import { PlatformGrid } from '@/components/PlatformGrid';
import { AISettings } from '@/components/AISettings';
import { ScheduleOverview } from '@/components/ScheduleOverview';
import { ScheduleManager } from '@/components/ScheduleManager';
import { Analytics } from '@/components/Analytics';
import { ContentPreview } from '@/components/ContentPreview';
import { AutoStatusBanner } from '@/components/AutoStatusBanner';
import { MediaApiDashboard } from '@/components/MediaApiDashboard';
import { LlmApiDashboard } from '@/components/LlmApiDashboard';

const Index = () => {
  const [activeTab, setActiveTab] = useState('dashboard');

  return (
    <div className="min-h-screen bg-white dark:bg-black">
      <Header activeTab={activeTab} setActiveTab={setActiveTab} />
      
      <main className="container mx-auto px-4 sm:px-6 lg:px-8 py-8 max-w-7xl">
        <AutoStatusBanner />
        
        {activeTab === 'dashboard' && (
          <div className="space-y-12">
            {/* Hero Section */}
            <div className="text-center py-16 px-6">
              <div className="max-w-4xl mx-auto">
                <h1 className="text-5xl font-bold text-black dark:text-white mb-6">
                  Autonomous Content Publisher
                </h1>
                <p className="text-xl text-gray-600 dark:text-gray-400 leading-relaxed max-w-2xl mx-auto mb-10">
                  AI-powered multi-platform content generation and scheduling with enterprise-grade reliability
                </p>
                <div className="flex flex-wrap justify-center gap-3">
                  <div className="px-6 py-3 bg-primary text-white rounded-xl">
                    <span className="font-medium">Production Ready</span>
                  </div>
                  <div className="px-6 py-3 bg-gray-100 dark:bg-gray-800 text-black dark:text-white rounded-xl border border-gray-200 dark:border-gray-700">
                    <span className="font-medium">Multi-Platform</span>
                  </div>
                  <div className="px-6 py-3 bg-gray-100 dark:bg-gray-800 text-black dark:text-white rounded-xl border border-gray-200 dark:border-gray-700">
                    <span className="font-medium">AI Powered</span>
                  </div>
                </div>
              </div>
            </div>
            
            {/* Main Content Grid */}
            <div className="grid xl:grid-cols-4 lg:grid-cols-3 gap-8">
              {/* Left Column - Main Features */}
              <div className="xl:col-span-3 lg:col-span-2 space-y-8">
                <PlatformGrid />
                
                {/* API Configuration Row */}
                <div className="grid lg:grid-cols-2 gap-8">
                  <MediaApiDashboard />
                  <LlmApiDashboard />
                </div>
              </div>
              
              {/* Right Column - Settings & Overview */}
              <div className="xl:col-span-1 lg:col-span-1 space-y-8">
                <AISettings />
                <ScheduleOverview />
              </div>
            </div>
          </div>
        )}
        
        {activeTab === 'analytics' && (
          <div className="max-w-7xl mx-auto">
            <Analytics />
          </div>
        )}
        
        {activeTab === 'content' && (
          <div className="max-w-7xl mx-auto">
            <ContentPreview />
          </div>
        )}
        
        {activeTab === 'schedules' && (
          <div className="max-w-7xl mx-auto space-y-12">
            {/* Enhanced Header */}
            <div className="text-center py-12">
              <h1 className="text-5xl font-bold text-black dark:text-white mb-4">
                Posting Schedules
              </h1>
              <p className="text-lg text-gray-600 dark:text-gray-400 max-w-2xl mx-auto leading-relaxed">
                Manage your weekly posting schedules across all platforms with precision timing
              </p>
            </div>
            <ScheduleManager />
          </div>
        )}
      </main>
    </div>
  );
};

export default Index;
