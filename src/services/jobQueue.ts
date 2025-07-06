import { EventEmitter } from 'events';
import { contentGenerator } from './contentGenerator';
import { platformAPI } from './platformApi';
import { getCurrentIST } from '@/utils/timeUtils';

interface Job {
  id: string;
  type: 'content_generation' | 'content_posting' | 'schedule_sync';
  priority: 'high' | 'medium' | 'low';
  payload: any;
  scheduledTime: Date;
  retryCount: number;
  maxRetries: number;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  userId: string;
  platform?: string;
  createdAt: Date;
  updatedAt: Date;
}

interface JobResult {
  success: boolean;
  data?: any;
  error?: string;
  retryAfter?: number;
}

export class JobQueue {
  private jobs: Map<string, Job> = new Map();
  private processingJobs = new Set<string>();
  private isProcessing = false;
  private processingInterval: NodeJS.Timeout | null = null;
  private eventListeners: Map<string, Function[]> = new Map();

  start() {
    if (this.isProcessing) return;
    
    this.isProcessing = true;
    // Process jobs every 30 seconds instead of every minute for better responsiveness
    this.processingInterval = setInterval(() => {
      this.processJobs();
    }, 30000);
    
    console.log('🚀 Job queue started');
  }

  stop() {
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = null;
    }
    this.isProcessing = false;
    this.processingJobs.clear();
    console.log('🛑 Job queue stopped');
  }

  addJob(job: Omit<Job, 'id' | 'retryCount' | 'status' | 'createdAt' | 'updatedAt'>): string {
    const jobId = crypto.randomUUID();
    const newJob: Job = {
      ...job,
      id: jobId,
      retryCount: 0,
      status: 'pending',
      createdAt: getCurrentIST(),
      updatedAt: getCurrentIST()
    };
    
    this.jobs.set(jobId, newJob);
    this.emit('job:added', newJob);
    
    console.log(`📝 Job added: ${job.type} for ${job.platform || 'system'} (Priority: ${job.priority})`);
    return jobId;
  }

  private async processJobs() {
    if (!this.isProcessing) return;

    const now = getCurrentIST();
    const pendingJobs = Array.from(this.jobs.values())
      .filter(job => 
        job.status === 'pending' && 
        job.scheduledTime <= now && 
        !this.processingJobs.has(job.id)
      )
      .sort((a, b) => {
        // Sort by priority first, then by scheduled time
        const priorityOrder = { high: 3, medium: 2, low: 1 };
        if (priorityOrder[a.priority] !== priorityOrder[b.priority]) {
          return priorityOrder[b.priority] - priorityOrder[a.priority];
        }
        return a.scheduledTime.getTime() - b.scheduledTime.getTime();
      })
      .slice(0, 5); // Process max 5 jobs at once to prevent overload

    if (pendingJobs.length === 0) return;

    console.log(`⚡ Processing ${pendingJobs.length} jobs`);

    for (const job of pendingJobs) {
      if (this.processingJobs.has(job.id)) continue;
      
      this.processingJobs.add(job.id);
      this.updateJobStatus(job.id, 'processing');
      
      // Process job without blocking other jobs
      this.processJob(job).finally(() => {
        this.processingJobs.delete(job.id);
      });
    }
  }

  private async processJob(job: Job): Promise<void> {
    try {
      console.log(`🔄 Processing job ${job.id}: ${job.type}`);
      this.emit('job:started', job);

      let result: JobResult;
      
      switch (job.type) {
        case 'content_generation':
          result = await this.handleContentGeneration(job);
          break;
        case 'content_posting':
          result = await this.handleContentPosting(job);
          break;
        case 'schedule_sync':
          result = await this.handleScheduleSync(job);
          break;
        default:
          throw new Error(`Unknown job type: ${job.type}`);
      }

      if (result.success) {
        this.updateJobStatus(job.id, 'completed');
        this.emit('job:completed', { job, result });
        console.log(`✅ Job completed: ${job.id}`);
      } else {
        await this.handleJobFailure(job, result.error || 'Unknown error', result.retryAfter);
      }

    } catch (error) {
      await this.handleJobFailure(job, (error as Error).message);
    }
  }

  private async handleJobFailure(job: Job, error: string, retryAfter?: number) {
    const updatedJob = this.jobs.get(job.id);
    if (!updatedJob) return;

    updatedJob.retryCount++;
    
    if (updatedJob.retryCount < updatedJob.maxRetries) {
      // Exponential backoff with jitter
      const baseDelay = Math.min(300000, 30000 * Math.pow(2, updatedJob.retryCount)); // Max 5 minutes
      const jitter = Math.random() * 0.1 * baseDelay;
      const delay = retryAfter ? retryAfter * 1000 : baseDelay + jitter;
      
      updatedJob.scheduledTime = new Date(Date.now() + delay);
      updatedJob.status = 'pending';
      updatedJob.updatedAt = getCurrentIST();
      
      console.log(`🔄 Job ${job.id} will retry in ${Math.round(delay / 1000)}s (attempt ${updatedJob.retryCount}/${updatedJob.maxRetries})`);
      this.emit('job:retrying', { job: updatedJob, error, delay });
    } else {
      updatedJob.status = 'failed';
      updatedJob.updatedAt = getCurrentIST();
      
      console.error(`❌ Job ${job.id} failed permanently: ${error}`);
      this.emit('job:failed', { job: updatedJob, error });
    }
  }

  private async handleContentGeneration(job: Job): Promise<JobResult> {
    try {
      // Use Gemini or GroqCloud (Llama 3) for content generation
      const { platform, payload, userId } = job;
      // Assume payload contains topic and settings
      const { topic, settings } = payload;
      // Force model to Gemini or Llama 3
      const aiSettings = {
        ...settings,
        active_models: settings?.active_models?.filter((m: string) => m.includes('gemini') || m.includes('llama')) || ['gemini-2.0', 'llama3-8b']
      };
      
      // Use the public generateContent method
      const generated = await contentGenerator.generateContent(platform, topic || 'general');
      return { success: true, data: generated };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  private async handleContentPosting(job: Job): Promise<JobResult> {
    try {
      // Use PlatformAPI to post content
      const { platform, payload } = job;
      // Import platformAPI from './platformApi'
      // Assume payload contains content in the correct format
      let postId: string = '';
      switch (platform) {
        case 'hashnode':
          postId = await platformAPI.postToHashnode(payload);
          break;
        case 'devto':
          postId = await platformAPI.postToDevTo(payload);
          break;
        case 'twitter':
          postId = await platformAPI.postToTwitter(payload);
          break;
        case 'linkedin':
          postId = await platformAPI.postToLinkedIn(payload);
          break;
        case 'instagram':
          postId = await platformAPI.postToInstagram(payload);
          break;
        case 'youtube':
          postId = await platformAPI.postToYouTube(payload);
          break;
        case 'reddit':
          postId = await platformAPI.postToReddit(payload);
          break;
        default:
          throw new Error(`Unsupported platform: ${platform}`);
      }
      return { success: true, data: { postId } };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  private async handleScheduleSync(job: Job): Promise<JobResult> {
    // Placeholder for schedule sync logic
    return { success: true, data: { message: 'Schedule synced' } };
  }

  private updateJobStatus(jobId: string, status: Job['status']) {
    const job = this.jobs.get(jobId);
    if (job) {
      job.status = status;
      job.updatedAt = getCurrentIST();
    }
  }

  // Event system for monitoring
  on(event: string, callback: Function) {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, []);
    }
    this.eventListeners.get(event)!.push(callback);
  }

  private emit(event: string, data: any) {
    const listeners = this.eventListeners.get(event) || [];
    listeners.forEach(callback => {
      try {
        callback(data);
      } catch (error) {
        console.error(`Error in event listener for ${event}:`, error);
      }
    });
  }

  // Monitoring methods
  getStats() {
    const jobs = Array.from(this.jobs.values());
    return {
      total: jobs.length,
      pending: jobs.filter(j => j.status === 'pending').length,
      processing: jobs.filter(j => j.status === 'processing').length,
      completed: jobs.filter(j => j.status === 'completed').length,
      failed: jobs.filter(j => j.status === 'failed').length,
      processingJobs: this.processingJobs.size
    };
  }

  getJobsByStatus(status: Job['status']): Job[] {
    return Array.from(this.jobs.values()).filter(job => job.status === status);
  }

  // Cleanup old jobs (older than 7 days)
  cleanup() {
    const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    let cleaned = 0;
    
    for (const [id, job] of this.jobs.entries()) {
      if (job.createdAt < cutoff && ['completed', 'failed'].includes(job.status)) {
        this.jobs.delete(id);
        cleaned++;
      }
    }
    
    if (cleaned > 0) {
      console.log(`🧹 Cleaned up ${cleaned} old jobs`);
    }
  }
}

export const jobQueue = new JobQueue();
