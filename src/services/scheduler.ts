
import { enhancedScheduler } from './enhancedScheduler';

// Use only the enhanced scheduler
export const scheduler = enhancedScheduler;

// Auto-start scheduler when module loads in browser
if (typeof window !== 'undefined') {
  // Start with a small delay to ensure all modules are loaded
  setTimeout(() => {
    enhancedScheduler.start().catch(error => {
      console.error('Failed to start enhanced scheduler:', error);
    });
  }, 1000);
}

export { enhancedScheduler as schedulerManager };
