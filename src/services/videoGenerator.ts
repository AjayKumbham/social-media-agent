import { supabase } from '@/integrations/supabase/client';
import { contentGenerator } from './contentGenerator';

export interface VideoContent {
  script: string;
  title: string;
  description: string;
  tags: string[];
  duration: number;
  platform: 'instagram' | 'youtube';
  visualCues: VisualCue[];
  voiceType?: 'tech' | 'casual' | 'female' | 'energetic';
  videoStyle?: 'tech' | 'lifestyle' | 'educational' | 'entertainment';
}

export interface VisualCue {
  timestamp: number;
  description: string;
  type: 'screenshot' | 'animation' | 'stock_video' | 'generated_image';
  duration: number;
}

export interface GeneratedVideo {
  videoUrl: string;
  thumbnailUrl?: string;
  duration: number;
  format: string;
  audioUrl?: string;
  config?: any;
}

export interface MediaAsset {
  type: 'image' | 'video';
  url: string;
  duration?: number;
}

export class VideoGenerator {
  async generateVideoScript(topic: string, platform: 'instagram' | 'youtube'): Promise<VideoContent> {
    const { data: user } = await supabase.auth.getUser();
    if (!user.user) throw new Error('Not authenticated');

    const maxDuration = platform === 'instagram' ? 30 : 60;
    
    const prompt = `Create a ${maxDuration}-second vertical video script about ${topic} for ${platform} Shorts/Reels.

Requirements:
- Hook viewers in first 3 seconds with compelling opening
- Clear, engaging narration optimized for TTS
- Platform-optimized format (${platform})
- Tech/programming focus with practical value
- Include detailed visual cues with timestamps
- Duration: ${maxDuration} seconds max
- Voice-over friendly script with natural pauses
- Trending and shareable content angle

Script structure:
- Hook (0-3s): Attention-grabbing opening
- Main content (3-${maxDuration-10}s): Core value/tutorial
- CTA (last 5-10s): Call to action for engagement

Visual elements should include:
- Code screenshots/animations
- Relevant stock footage
- Generated illustrations
- Text overlays for key points

Return JSON format:
{
  "script": "Complete voice-over script with natural pacing",
  "title": "Engaging ${platform} title",
  "description": "Platform description with hashtags",
  "tags": ["tag1", "tag2", "tag3", "tag4", "tag5"],
  "duration": ${maxDuration},
  "voiceType": "tech|casual|female|energetic",
  "videoStyle": "tech|educational|entertainment",
  "visualCues": [
    {
      "timestamp": 0,
      "description": "Visual description",
      "type": "screenshot|animation|stock_video|generated_image",
      "duration": 3
    }
  ]
}`;

    try {
      const { data, error } = await supabase.functions.invoke('generate-content', {
        body: { 
          prompt, 
          userId: user.user.id,
          contentType: 'video_script',
          platform
        }
      });

      if (error) throw error;

      const parsedContent = typeof data.content === 'string' ? JSON.parse(data.content) : data.content;

      return {
        script: parsedContent.script || data.body,
        title: parsedContent.title || data.title,
        description: parsedContent.description || data.content,
        tags: parsedContent.tags || data.tags || [],
        duration: parsedContent.duration || maxDuration,
        platform,
        visualCues: parsedContent.visualCues || [],
        voiceType: parsedContent.voiceType || 'tech',
        videoStyle: parsedContent.videoStyle || 'tech'
      };
    } catch (error) {
      console.error('Script generation failed:', error);
      throw new Error('Failed to generate video script');
    }
  }

  async generateVideo(content: VideoContent): Promise<GeneratedVideo> {
    try {
      console.log(`Generating enhanced ${content.platform} video with improved Web Speech API...`);

      // Get current user ID from Supabase auth
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error('User not authenticated');
      }

      // Use the enhanced professional video generation service
      const { data, error } = await supabase.functions.invoke('generate-video-professional', {
        body: {
          script: content.script,
          platform: content.platform,
          videoStyle: content.videoStyle || 'tech',
          userId: user.id
        }
      });

      if (error) {
        console.error('Enhanced video generation failed:', error);
        throw new Error('Video generation service failed');
      }

      if (!data || !data.success) {
        throw new Error('Video generation service returned invalid response');
      }

      // Generate enhanced TTS audio using improved Web Speech API
      const audioBlob = await this.generateEnhancedWebSpeechTTS(content.script, content.voiceType);
      const audioUrl = URL.createObjectURL(audioBlob);

      // Assemble professional video using the enhanced configuration
      const videoUrl = await this.assembleProfessionalVideo(data.videoConfig, audioUrl);

      return {
        videoUrl,
        duration: data.videoConfig.duration,
        format: 'webm',
        audioUrl,
        config: data.videoConfig
      };
    } catch (error) {
      console.error('Enhanced video generation failed:', error);
      throw new Error('Failed to generate enhanced video');
    }
  }

  private async generateEnhancedWebSpeechTTS(text: string, voiceType?: string): Promise<Blob> {
    return new Promise((resolve, reject) => {
      if (!('speechSynthesis' in window)) {
        reject(new Error('Web Speech API not supported in this browser'));
        return;
      }

      // Wait for voices to be loaded
      const loadVoices = () => {
        return new Promise<SpeechSynthesisVoice[]>((resolve) => {
          let voices = speechSynthesis.getVoices();
          if (voices.length > 0) {
            resolve(voices);
          } else {
            speechSynthesis.addEventListener('voiceschanged', () => {
              voices = speechSynthesis.getVoices();
              resolve(voices);
            });
          }
        });
      };

      loadVoices().then((voices) => {
        // Enhanced voice selection based on type and quality
        const selectBestVoice = (type?: string) => {
          const englishVoices = voices.filter(voice => voice.lang.startsWith('en'));
          
          // Prioritize by voice type
          const voicePreferences = {
            tech: (voice: SpeechSynthesisVoice) => 
              voice.name.includes('Google') || voice.name.includes('Microsoft') || voice.name.includes('Alex'),
            casual: (voice: SpeechSynthesisVoice) => 
              voice.name.includes('Natural') || voice.name.includes('Neural'),
            female: (voice: SpeechSynthesisVoice) => 
              voice.name.includes('Female') || voice.name.includes('Samantha') || voice.name.includes('Victoria'),
            energetic: (voice: SpeechSynthesisVoice) => 
              voice.name.includes('Enhanced') || voice.name.includes('Premium')
          };

          if (type && voicePreferences[type]) {
            const preferredVoice = englishVoices.find(voicePreferences[type]);
            if (preferredVoice) return preferredVoice;
          }

          // Fallback to best quality voices
          return englishVoices.find(voice => 
            voice.name.includes('Google') || voice.name.includes('Microsoft')
          ) || englishVoices[0] || voices[0];
        };

        // Create audio context for high-quality recording
        const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 44100 });
        const destination = audioContext.createMediaStreamDestination();
        const mediaRecorder = new MediaRecorder(destination.stream, {
          mimeType: 'audio/webm;codecs=opus',
          audioBitsPerSecond: 128000
        });
        const audioChunks: BlobPart[] = [];

        mediaRecorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
            audioChunks.push(event.data);
          }
        };

        mediaRecorder.onstop = () => {
          const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
          resolve(audioBlob);
        };

        // Enhanced speech synthesis configuration
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = 0.85; // Slightly slower for better clarity
        utterance.pitch = 1.1; // Slightly higher for more engagement
        utterance.volume = 1.0;

        const selectedVoice = selectBestVoice(voiceType);
        if (selectedVoice) {
          utterance.voice = selectedVoice;
          console.log(`Selected voice: ${selectedVoice.name} (${selectedVoice.lang})`);
        }

        // Add pauses for better pacing
        const enhancedText = text
          .replace(/\./g, '.<break time="0.5s"/>')
          .replace(/,/g, ',<break time="0.3s"/>')
          .replace(/!/g, '!<break time="0.7s"/>');
        
        utterance.text = enhancedText;

        utterance.onstart = () => {
          console.log('Starting enhanced TTS generation...');
          mediaRecorder.start(100); // Collect data every 100ms
        };

        utterance.onend = () => {
          console.log('TTS generation completed');
          setTimeout(() => {
            mediaRecorder.stop();
          }, 200); // Allow for audio buffer
        };

        utterance.onerror = (error) => {
          console.error('Enhanced TTS error:', error);
          reject(new Error(`Enhanced speech synthesis failed: ${error.error}`));
        };

        // Start synthesis
        speechSynthesis.speak(utterance);
      });
    });
  }

  private async assembleProfessionalVideo(config: any, audioUrl?: string): Promise<string> {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d')!;
    
    // Set high-quality canvas dimensions
    canvas.width = config.dimensions.width;
    canvas.height = config.dimensions.height;

    // Configure high-quality stream
    const stream = canvas.captureStream(60); // 60 FPS for smoother video
    
    // Setup audio track
    let audioTrack: MediaStreamTrack | null = null;
    if (audioUrl) {
      const audioElement = new Audio(audioUrl);
      audioElement.crossOrigin = 'anonymous';
      await audioElement.play();
      
      // Create audio context for better control
      const audioContext = new AudioContext();
      const source = audioContext.createMediaElementSource(audioElement);
      const destination = audioContext.createMediaStreamDestination();
      source.connect(destination);
      
      if (destination.stream.getAudioTracks().length > 0) {
        audioTrack = destination.stream.getAudioTracks()[0];
        stream.addTrack(audioTrack);
      }
    }

    // Enhanced media recorder with better quality
    const mediaRecorder = new MediaRecorder(stream, {
      mimeType: 'video/webm;codecs=vp9,opus',
      videoBitsPerSecond: 5000000, // 5 Mbps for high quality
      audioBitsPerSecond: 128000   // 128 kbps for audio
    });
    const videoChunks: BlobPart[] = [];

    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        videoChunks.push(event.data);
      }
    };

    return new Promise((resolve, reject) => {
      mediaRecorder.onstop = () => {
        const videoBlob = new Blob(videoChunks, { type: 'video/webm' });
        const videoUrl = URL.createObjectURL(videoBlob);
        resolve(videoUrl);
      };

      mediaRecorder.start(100); // Collect data every 100ms

      let currentTime = 0;
      const frameDuration = 1000 / 60; // 60 FPS
      const totalDuration = config.duration * 1000;

      const drawFrame = async () => {
        if (currentTime >= totalDuration) {
          mediaRecorder.stop();
          return;
        }

        // Clear canvas with enhanced gradient
        const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
        gradient.addColorStop(0, '#0f0f23');
        gradient.addColorStop(0.5, '#1a1a2e');
        gradient.addColorStop(1, '#16213e');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Draw current visual timeline segment
        await this.drawTimelineSegment(ctx, config, currentTime, canvas.width, canvas.height);

        // Draw synchronized text overlays
        await this.drawSynchronizedOverlays(ctx, config, currentTime, canvas.width, canvas.height);

        // Add platform branding
        this.drawEnhancedBranding(ctx, config, canvas.width, canvas.height);

        // Add progress indicator for longer videos
        if (config.duration > 30) {
          this.drawProgressIndicator(ctx, currentTime / totalDuration, canvas.width, canvas.height);
        }

        currentTime += frameDuration;
        setTimeout(drawFrame, frameDuration);
      };

      drawFrame();
    });
  }

  private async drawTimelineSegment(ctx: CanvasRenderingContext2D, config: any, currentTime: number, width: number, height: number) {
    const currentSegment = config.visualTimeline?.find((segment: any) =>
      currentTime >= segment.timestamp * 1000 &&
      currentTime < (segment.timestamp + segment.duration) * 1000
    );

    if (!currentSegment) return;

    // Draw elements in layer order
    const sortedElements = currentSegment.elements.sort((a: any, b: any) => a.layer - b.layer);
    
    for (const element of sortedElements) {
      await this.drawVisualElement(ctx, element, width, height, currentTime - (currentSegment.timestamp * 1000));
    }
  }

  private async drawVisualElement(ctx: CanvasRenderingContext2D, element: any, width: number, height: number, segmentTime: number) {
    try {
      if (element.type === 'background_video' || element.type === 'fallback_image') {
        await this.drawBackgroundMedia(ctx, element, width, height);
      } else if (element.type === 'overlay_image') {
        await this.drawOverlayImage(ctx, element, width, height);
      } else if (element.type === 'text_overlay') {
        this.drawAnimatedText(ctx, element, width, height, segmentTime);
      }
    } catch (error) {
      console.error('Error drawing visual element:', error);
    }
  }

  private async drawBackgroundMedia(ctx: CanvasRenderingContext2D, element: any, width: number, height: number) {
    if (!element.url) return;
    
    const img = new Image();
    img.crossOrigin = 'anonymous';
    
    return new Promise<void>((resolve) => {
      img.onload = () => {
        // Calculate aspect ratio preserving crop
        const imgAspect = img.width / img.height;
        const canvasAspect = width / height;
        
        let drawWidth, drawHeight, offsetX, offsetY;
        
        if (imgAspect > canvasAspect) {
          drawHeight = height;
          drawWidth = height * imgAspect;
          offsetX = (width - drawWidth) / 2;
          offsetY = 0;
        } else {
          drawWidth = width;
          drawHeight = width / imgAspect;
          offsetX = 0;
          offsetY = (height - drawHeight) / 2;
        }
        
        ctx.drawImage(img, offsetX, offsetY, drawWidth, drawHeight);
        resolve();
      };
      
      img.onerror = () => resolve();
      img.src = element.url;
    });
  }

  private async drawOverlayImage(ctx: CanvasRenderingContext2D, element: any, width: number, height: number) {
    if (!element.url) return;
    
    const img = new Image();
    img.crossOrigin = 'anonymous';
    
    return new Promise<void>((resolve) => {
      img.onload = () => {
        ctx.globalAlpha = element.opacity || 0.8;
        
        const overlaySize = Math.min(width, height) * 0.4;
        const x = (width - overlaySize) / 2;
        const y = (height - overlaySize) / 2;
        
        ctx.drawImage(img, x, y, overlaySize, overlaySize);
        ctx.globalAlpha = 1.0;
        resolve();
      };
      
      img.onerror = () => resolve();
      img.src = element.url;
    });
  }

  private drawAnimatedText(ctx: CanvasRenderingContext2D, element: any, width: number, height: number, segmentTime: number) {
    const progress = Math.min(segmentTime / (element.duration * 1000), 1);
    
    // Typewriter effect
    const visibleLength = Math.floor(element.text.length * progress);
    const visibleText = element.text.substring(0, visibleLength);
    
    // Enhanced text styling
    ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
    ctx.fillRect(0, height - 200, width, 200);
    
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 36px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 3;
    
    const lines = this.wrapText(ctx, visibleText, width - 60);
    lines.forEach((line, index) => {
      const y = height - 150 + (index * 45);
      ctx.strokeText(line, width / 2, y);
      ctx.fillText(line, width / 2, y);
    });
  }

  private async drawSynchronizedOverlays(ctx: CanvasRenderingContext2D, config: any, currentTime: number, width: number, height: number) {
    const currentOverlay = config.textOverlays?.find((overlay: any) =>
      currentTime >= overlay.timestamp * 1000 &&
      currentTime < (overlay.timestamp + overlay.duration) * 1000
    );

    if (!currentOverlay) return;

    // Slide-up animation
    const progress = (currentTime - (currentOverlay.timestamp * 1000)) / (currentOverlay.duration * 1000);
    const slideOffset = (1 - progress) * 50;

    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(0, height - 120 + slideOffset, width, 120);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 28px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 2;

    const lines = this.wrapText(ctx, currentOverlay.text, width - 40);
    lines.forEach((line, index) => {
      const y = height - 80 + slideOffset + (index * 35);
      ctx.strokeText(line, width / 2, y);
      ctx.fillText(line, width / 2, y);
    });
  }

  private drawEnhancedBranding(ctx: CanvasRenderingContext2D, config: any, width: number, height: number) {
    if (!config.branding?.watermark?.enabled) return;

    ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.font = '18px Arial, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(config.branding.watermark.text, width - 20, height - 20);
  }

  private drawProgressIndicator(ctx: CanvasRenderingContext2D, progress: number, width: number, height: number) {
    const barWidth = width * 0.8;
    const barHeight = 4;
    const x = (width - barWidth) / 2;
    const y = 20;

    // Background
    ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.fillRect(x, y, barWidth, barHeight);

    // Progress
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x, y, barWidth * progress, barHeight);
  }

  private wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
    const words = text.split(' ');
    const lines: string[] = [];
    let currentLine = '';

    for (const word of words) {
      const testLine = currentLine + (currentLine ? ' ' : '') + word;
      const metrics = ctx.measureText(testLine);
      
      if (metrics.width > maxWidth && currentLine) {
        lines.push(currentLine);
        currentLine = word;
      } else {
        currentLine = testLine;
      }
    }
    
    if (currentLine) {
      lines.push(currentLine);
    }
    
    return lines;
  }

  private async generateMediaAssets(visualCues: VisualCue[]): Promise<MediaAsset[]> {
    // Simplified implementation
    return visualCues.map(cue => ({
      type: 'image' as const,
      url: `https://picsum.photos/1080/1920?random=${Date.now()}`,
      duration: cue.duration
    }));
  }

  async generateThumbnail(title: string, platform: string): Promise<string> {
    if (platform === 'youtube') {
      try {
        // Get current user ID from Supabase auth
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          throw new Error('User not authenticated');
        }

        const { data, error } = await supabase.functions.invoke('generate-image-gemini', {
          body: { 
            prompt: `Create an eye-catching YouTube thumbnail: ${title}. Style: high-energy, clickable, professional, YouTube thumbnail format`,
            platform: 'youtube',
            contentType: 'thumbnail',
            userId: user.id
          }
        });

        if (error) throw error;
        return data.imageUrl;
      } catch (error) {
        console.error('Thumbnail generation failed:', error);
        return '';
      }
    }
    return '';
  }
}

export const videoGenerator = new VideoGenerator();
