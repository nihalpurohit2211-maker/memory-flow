import exifr from 'exifr';
import { MediaItem, CaptureTimeSource } from '../types';

// SHA-256 content hashing for exact duplicate detection
export async function computeSha256(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

export interface ExifExtractionResult {
  captureTime: string | null;
  captureTimeSource: CaptureTimeSource;
  timezoneKnown: boolean | null;
  width: number | null;
  height: number | null;
  orientation?: number;
}

// Extract trustworthy EXIF metadata (capture time and orientation)
export async function extractExifMetadata(file: File): Promise<ExifExtractionResult> {
  try {
    const data = await exifr.parse(file, {
      tiff: true,
      xmp: true,
      exif: true,
      pick: ['DateTimeOriginal', 'CreateDate', 'OffsetTimeOriginal', 'Orientation', 'ImageWidth', 'ImageHeight'],
    });

    if (data) {
      const rawDate = data.DateTimeOriginal || data.CreateDate;
      let captureTime: string | null = null;
      let captureTimeSource: CaptureTimeSource = 'unknown';
      let timezoneKnown: boolean | null = false;

      if (rawDate instanceof Date && !isNaN(rawDate.getTime())) {
        captureTime = rawDate.toISOString();
        captureTimeSource = 'exif';
        timezoneKnown = Boolean(data.OffsetTimeOriginal);
      }

      return {
        captureTime,
        captureTimeSource,
        timezoneKnown,
        width: data.ImageWidth || null,
        height: data.ImageHeight || null,
        orientation: data.Orientation || 1,
      };
    }
  } catch {
    // Graceful fallback for non-EXIF or corrupt headers
  }

  return {
    captureTime: null,
    captureTimeSource: 'unknown',
    timezoneKnown: null,
    width: null,
    height: null,
    orientation: 1,
  };
}

// Generate thumbnail data URL for image
export async function generateImageThumbnail(
  file: File,
  maxDimension = 640
): Promise<{ thumbnailUrl: string; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);
      const originalWidth = img.naturalWidth || img.width;
      const originalHeight = img.naturalHeight || img.height;

      let targetWidth = originalWidth;
      let targetHeight = originalHeight;

      if (originalWidth > maxDimension || originalHeight > maxDimension) {
        if (originalWidth > originalHeight) {
          targetWidth = maxDimension;
          targetHeight = Math.round((originalHeight * maxDimension) / originalWidth);
        } else {
          targetHeight = maxDimension;
          targetWidth = Math.round((originalWidth * maxDimension) / originalHeight);
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = targetWidth;
      canvas.height = targetHeight;
      const ctx = canvas.getContext('2d');

      if (!ctx) {
        reject(new Error('Canvas 2D context not available'));
        return;
      }

      ctx.drawImage(img, 0, 0, targetWidth, targetHeight);
      const thumbnailUrl = canvas.toDataURL('image/jpeg', 0.85);

      resolve({
        thumbnailUrl,
        width: originalWidth,
        height: originalHeight,
      });
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image for thumbnail generation'));
    };

    img.src = url;
  });
}

// Generate video poster frame, duration, and dimensions
export async function generateVideoPosterAndDuration(
  file: File,
  maxDimension = 640
): Promise<{ thumbnailUrl: string; width: number; height: number; duration: number }> {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.playsInline = true;
    video.muted = true;
    const url = URL.createObjectURL(file);

    let hasResolved = false;

    const timeout = setTimeout(() => {
      if (!hasResolved) {
        hasResolved = true;
        URL.revokeObjectURL(url);
        // Fallback poster for unsupported video codecs
        resolve({
          thumbnailUrl: generateFallbackVideoPoster(file.name),
          width: 1280,
          height: 720,
          duration: 0,
        });
      }
    }, 4000);

    video.onloadedmetadata = () => {
      video.currentTime = Math.min(0.5, video.duration / 2 || 0.1);
    };

    video.onseeked = () => {
      if (hasResolved) return;
      hasResolved = true;
      clearTimeout(timeout);

      const originalWidth = video.videoWidth || 640;
      const originalHeight = video.videoHeight || 360;

      let targetWidth = originalWidth;
      let targetHeight = originalHeight;

      if (originalWidth > maxDimension || originalHeight > maxDimension) {
        if (originalWidth > originalHeight) {
          targetWidth = maxDimension;
          targetHeight = Math.round((originalHeight * maxDimension) / originalWidth);
        } else {
          targetHeight = maxDimension;
          targetWidth = Math.round((originalWidth * maxDimension) / originalHeight);
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = targetWidth;
      canvas.height = targetHeight;
      const ctx = canvas.getContext('2d');

      if (ctx) {
        ctx.drawImage(video, 0, 0, targetWidth, targetHeight);
        const thumbnailUrl = canvas.toDataURL('image/jpeg', 0.85);
        URL.revokeObjectURL(url);
        resolve({
          thumbnailUrl,
          width: originalWidth,
          height: originalHeight,
          duration: video.duration || 0,
        });
      } else {
        URL.revokeObjectURL(url);
        resolve({
          thumbnailUrl: generateFallbackVideoPoster(file.name),
          width: originalWidth,
          height: originalHeight,
          duration: video.duration || 0,
        });
      }
    };

    video.onerror = () => {
      if (hasResolved) return;
      hasResolved = true;
      clearTimeout(timeout);
      URL.revokeObjectURL(url);
      resolve({
        thumbnailUrl: generateFallbackVideoPoster(file.name),
        width: 1280,
        height: 720,
        duration: 0,
      });
    };

    video.src = url;
  });
}

function generateFallbackVideoPoster(filename: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 360" width="640" height="360">
    <rect width="640" height="360" fill="#242822"/>
    <circle cx="320" cy="160" r="40" fill="#FFFFFF" opacity="0.2"/>
    <polygon points="312,145 336,160 312,175" fill="#FFFFFF"/>
    <text x="320" y="240" font-family="-apple-system, sans-serif" font-size="16" fill="#F7F5EF" text-anchor="middle" font-weight="600">
      ${filename.slice(0, 30)}
    </text>
    <text x="320" y="265" font-family="-apple-system, sans-serif" font-size="12" fill="#80877C" text-anchor="middle">
      Video Poster [Local Fallback]
    </text>
  </svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export interface ProcessedFileResult {
  mediaItem: MediaItem;
  blob: Blob;
  folderHint: string | null;
}

// Main file processing pipeline
export async function processMediaFile(file: File, eventId: string): Promise<ProcessedFileResult> {
  const isVideo = file.type.startsWith('video/') || /\.(mp4|webm|mov|m4v)$/i.test(file.name);
  const isImage = file.type.startsWith('image/') || /\.(jpg|jpeg|png|webp|gif|avif)$/i.test(file.name);

  if (!isVideo && !isImage) {
    throw new Error(`Unsupported file type: "${file.type || 'unknown'}". Only images and videos are supported.`);
  }

  // 1. Content hash
  const hash = await computeSha256(file);

  // 2. Folder context hint if available
  let folderHint: string | null = null;
  if (file.webkitRelativePath) {
    const parts = file.webkitRelativePath.split('/');
    if (parts.length > 1) {
      folderHint = parts[parts.length - 2];
    }
  }

  let thumbnailUrl = '';
  let width: number | null = null;
  let height: number | null = null;
  let duration: number | null = null;
  let captureTime: string | null = null;
  let captureTimeSource: CaptureTimeSource = 'unknown';
  let timezoneKnown: boolean | null = null;

  if (isVideo) {
    const videoResult = await generateVideoPosterAndDuration(file);
    thumbnailUrl = videoResult.thumbnailUrl;
    width = videoResult.width;
    height = videoResult.height;
    duration = videoResult.duration;
  } else {
    // Image processing
    const [thumbResult, exifResult] = await Promise.all([
      generateImageThumbnail(file),
      extractExifMetadata(file),
    ]);

    thumbnailUrl = thumbResult.thumbnailUrl;
    width = thumbResult.width;
    height = thumbResult.height;
    captureTime = exifResult.captureTime;
    captureTimeSource = exifResult.captureTimeSource;
    timezoneKnown = exifResult.timezoneKnown;
  }

  const id = `media-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

  const mediaItem: MediaItem = {
    id,
    eventId,
    originalName: file.name,
    mimeType: file.type || (isVideo ? 'video/mp4' : 'image/jpeg'),
    size: file.size,
    thumbnailUrl,
    width,
    height,
    duration,
    captureTime,
    captureTimeSource,
    timezoneKnown,
    importedAt: new Date().toISOString(),
    fileModifiedAt: file.lastModified ? new Date(file.lastModified).toISOString() : null,
    processingStatus: 'ready',
    hash,
    duplicateGroupId: null,
    isDemo: false,
    caption: file.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' '),
  };

  return {
    mediaItem,
    blob: file,
    folderHint,
  };
}
