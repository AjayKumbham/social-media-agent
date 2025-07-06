
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { query, orientation = 'portrait', minDuration = 3 } = await req.json();
    const apiKey = Deno.env.get('PEXELS_API_KEY');
    
    if (!apiKey) {
      throw new Error('PEXELS_API_KEY not configured');
    }

    const response = await fetch(`https://api.pexels.com/videos/search?query=${encodeURIComponent(query)}&orientation=${orientation}&per_page=20&min_duration=${minDuration}`, {
      headers: {
        'Authorization': apiKey,
      },
    });

    if (!response.ok) {
      throw new Error(`Pexels API error: ${response.status}`);
    }

    const result = await response.json();
    
    // Filter videos for vertical/portrait orientation suitable for reels/shorts
    const suitableVideos = result.videos.filter((video: any) => {
      const hasPortraitVideo = video.video_files.some((file: any) => 
        file.width < file.height && // Portrait orientation
        file.quality === 'hd' &&
        file.file_type === 'video/mp4'
      );
      return video.duration >= minDuration && hasPortraitVideo;
    });

    if (suitableVideos.length === 0) {
      throw new Error('No suitable portrait videos found');
    }

    // Select a random video from suitable ones
    const selectedVideo = suitableVideos[Math.floor(Math.random() * suitableVideos.length)];
    
    // Find the best portrait video file
    const videoFile = selectedVideo.video_files.find((file: any) => 
      file.width < file.height && 
      file.quality === 'hd' && 
      file.file_type === 'video/mp4'
    ) || selectedVideo.video_files.find((file: any) => 
      file.width < file.height && 
      file.file_type === 'video/mp4'
    ) || selectedVideo.video_files[0];

    return new Response(JSON.stringify({ 
      videoUrl: videoFile.link,
      duration: selectedVideo.duration,
      width: videoFile.width,
      height: videoFile.height,
      id: selectedVideo.id
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error fetching stock video:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
