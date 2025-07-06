
import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PlatformGrid } from './PlatformGrid';
import { MediaApiSetup } from './MediaApiSetup';
import { Settings, Wifi } from 'lucide-react';

export const PlatformSetup = () => {
  const [activeTab, setActiveTab] = useState('platforms');

  return (
    <div className="space-y-8">
      {/* Enhanced Header */}
      <div className="text-center py-12">
        <h1 className="text-5xl font-bold text-black dark:text-white mb-4">
          Platform Setup
        </h1>
        <p className="text-lg text-gray-600 dark:text-gray-400 max-w-2xl mx-auto leading-relaxed">
          Connect your social media platforms and configure media APIs for seamless content publishing
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="enhanced-card grid w-full grid-cols-2 p-2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700">
          <TabsTrigger 
            value="platforms" 
            className="
              flex items-center gap-2 px-6 py-3 rounded-lg transition-all duration-150 font-medium
              data-[state=active]:bg-primary data-[state=active]:text-white
              text-black dark:text-white hover:bg-gray-100 dark:hover:bg-gray-800
            "
          >
            <Wifi className="w-4 h-4" />
            Social Platforms
          </TabsTrigger>
          <TabsTrigger 
            value="media-apis" 
            className="
              flex items-center gap-2 px-6 py-3 rounded-lg transition-all duration-150 font-medium
              data-[state=active]:bg-primary data-[state=active]:text-white
              text-black dark:text-white hover:bg-gray-100 dark:hover:bg-gray-800
            "
          >
            <Settings className="w-4 h-4" />
            Media APIs
          </TabsTrigger>
        </TabsList>

        <TabsContent value="platforms" className="mt-8">
          <PlatformGrid />
        </TabsContent>

        <TabsContent value="media-apis" className="mt-8">
          <MediaApiSetup />
        </TabsContent>
      </Tabs>
    </div>
  );
};
