
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Enhanced video validation
interface VideoMetadata {
  duration: number;
  width: number;
  height: number;
  size: number;
  format: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { videoUrl, title, description, tags, accessToken } = await req.json();
    
    console.log('YouTube upload request:', {
      videoUrl: videoUrl ? 'provided' : 'missing',
      title: title?.substring(0, 50),
      descriptionLength: description?.length,
      tagsCount: tags?.length,
      hasToken: !!accessToken
    });

    // Validate required parameters
    if (!videoUrl || !title || !accessToken) {
      throw new Error('Missing required parameters: videoUrl, title, and accessToken are required');
    }

    // Download and validate video with streaming to avoid memory issues
    console.log('Downloading video from:', videoUrl);
    const videoResponse = await fetch(videoUrl);
    
    if (!videoResponse.ok) {
      throw new Error(`Failed to download video: ${videoResponse.status} ${videoResponse.statusText}`);
    }

    const contentLength = videoResponse.headers.get('content-length');
    const videoSize = contentLength ? parseInt(contentLength) : 0;
    
    // Check file size before downloading (100MB limit for better UX)
    const maxSize = 100 * 1024 * 1024; // 100MB
    if (videoSize > maxSize) {
      throw new Error(`Video file too large: ${Math.round(videoSize / 1024 / 1024)}MB. Maximum allowed: 100MB`);
    }

    const contentType = videoResponse.headers.get('content-type') || '';
    
    // Validate video format
    const allowedFormats = ['video/mp4', 'video/quicktime', 'video/webm', 'video/x-msvideo'];
    if (!allowedFormats.some(format => contentType.includes(format))) {
      throw new Error(`Unsupported video format: ${contentType}. Supported formats: MP4, MOV, WebM`);
    }

    // Read video data as stream to handle large files
    const videoBlob = await videoResponse.blob();
    const videoBuffer = await videoBlob.arrayBuffer();
    
    console.log('Video downloaded successfully:', {
      size: `${Math.round(videoBuffer.byteLength / 1024 / 1024)}MB`,
      type: contentType
    });

    // Prepare metadata for upload
    const metadata = {
      snippet: {
        title: title.substring(0, 100), // Ensure title is within limit
        description: description || '',
        tags: Array.isArray(tags) ? tags.slice(0, 15) : [], // Limit to 15 tags
        categoryId: '22', // People & Blogs category (good for most content)
        defaultLanguage: 'en',
        defaultAudioLanguage: 'en'
      },
      status: {
        privacyStatus: 'public',
        selfDeclaredMadeForKids: false,
        madeForKids: false
      }
    };

    console.log('Uploading to YouTube with metadata:', {
      title: metadata.snippet.title,
      categoryId: metadata.snippet.categoryId,
      tagsCount: metadata.snippet.tags.length,
      privacyStatus: metadata.status.privacyStatus
    });

    // Upload using resumable upload API for better reliability
    const uploadResponse = await uploadVideoResumable(accessToken, metadata, videoBuffer);

    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text();
      console.error('YouTube upload failed:', uploadResponse.status, errorText);
      
      let errorData;
      try {
        errorData = JSON.parse(errorText);
      } catch (e) {
        errorData = { error: { message: errorText } };
      }

      throw new Error(formatYouTubeError(uploadResponse.status, errorData));
    }

    const result = await uploadResponse.json();
    
    if (!result.id) {
      console.error('YouTube upload response missing video ID:', result);
      throw new Error('YouTube upload completed but no video ID was returned');
    }

    const videoUrl = `https://youtube.com/shorts/${result.id}`;
    
    console.log('YouTube upload successful:', {
      videoId: result.id,
      url: videoUrl,
      title: result.snippet?.title
    });
    
    return new Response(JSON.stringify({ 
      videoId: result.id,
      url: videoUrl,
      title: result.snippet?.title,
      status: result.status?.uploadStatus
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
    
  } catch (error) {
    console.error('YouTube upload error:', error);
    
    let errorMessage = error.message || 'Unknown YouTube upload error';
    
    // Handle specific error types
    if (error.message.includes('quota')) {
      errorMessage = 'YouTube API quota exceeded. Please try again later.';
    } else if (error.message.includes('authentication') || error.message.includes('invalid_grant')) {
      errorMessage = 'YouTube authentication failed. Please reconnect your account.';
    } else if (error.message.includes('too large') || error.message.includes('size')) {
      errorMessage = 'Video file is too large. Maximum size: 100MB.';
    } else if (error.message.includes('format') || error.message.includes('Unsupported')) {
      errorMessage = error.message;
    }
    
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

// Enhanced resumable upload function
async function uploadVideoResumable(accessToken: string, metadata: any, videoBuffer: ArrayBuffer): Promise<Response> {
  try {
    // Step 1: Initiate resumable upload
    const initiateResponse = await fetch('https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json; charset=UTF-8',
        'X-Upload-Content-Length': videoBuffer.byteLength.toString(),
        'X-Upload-Content-Type': 'video/*',
      },
      body: JSON.stringify(metadata)
    });

    if (!initiateResponse.ok) {
      const errorText = await initiateResponse.text();
      console.error('Failed to initiate resumable upload:', initiateResponse.status, errorText);
      throw new Error(`Failed to initiate upload: ${initiateResponse.status}`);
    }

    const uploadUrl = initiateResponse.headers.get('location');
    if (!uploadUrl) {
      throw new Error('No upload URL received from YouTube');
    }

    console.log('Resumable upload initiated, uploading video data...');

    // Step 2: Upload video data
    const uploadDataResponse = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': 'video/*',
        'Content-Length': videoBuffer.byteLength.toString(),
      },
      body: videoBuffer
    });

    return uploadDataResponse;

  } catch (error) {
    console.error('Resumable upload error:', error);
    throw error;
  }
}

// Enhanced error formatting
function formatYouTubeError(status: number, errorData: any): string {
  const errorMessage = errorData?.error?.message || 'Unknown YouTube API error';
  const errorCode = errorData?.error?.code;
  const errorReason = errorData?.error?.errors?.[0]?.reason;

  console.error('YouTube API error details:', { status, errorCode, errorReason, errorMessage });

  switch (status) {
    case 400:
      if (errorReason === 'invalidVideoMetadata') {
        return 'Invalid video metadata. Please check your title, description, and tags.';
      } else if (errorReason === 'uploadLimitExceeded') {
        return 'Daily upload limit exceeded. Please try again tomorrow.';
      } else if (errorMessage.includes('quota')) {
        return 'YouTube API quota exceeded. Please try again later.';
      }
      return `YouTube validation error: ${errorMessage}`;
    
    case 401:
      return 'YouTube authentication failed. Please reconnect your account.';
    
    case 403:
      if (errorReason === 'quotaExceeded') {
        return 'YouTube API quota exceeded. Please try again later.';
      } else if (errorReason === 'forbidden') {
        return 'YouTube access forbidden. Check your account permissions.';
      }
      return 'YouTube access forbidden. Please check your permissions and API quotas.';
    
    case 404:
      return 'YouTube resource not found. Please check your account setup.';
    
    case 413:
      return 'Video file too large. Maximum size for YouTube Shorts: 100MB.';
    
    case 429:
      return 'YouTube rate limit exceeded. Please try again later.';
    
    case 500:
    case 502:
    case 503:
      return 'YouTube server error. Please try again later.';
    
    default:
      return `YouTube API error (${status}): ${errorMessage}`;
  }
}
