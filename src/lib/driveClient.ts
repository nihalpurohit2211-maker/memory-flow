import { DriveConfig, DriveFileEntry, MediaItem, CaptureTimeSource } from '../types';

/**
 * Extracts a Google Drive Folder ID from either a raw ID, full drive URL, or share link.
 */
export function extractDriveFolderId(input: string): string {
  if (!input) return '';
  const trimmed = input.trim();
  // Match https://drive.google.com/drive/folders/{folderId} or /drive/u/0/folders/{folderId}
  const folderMatch = trimmed.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  if (folderMatch && folderMatch[1]) {
    return folderMatch[1];
  }
  // Match ?id={folderId} or &id={folderId}
  const idParamMatch = trimmed.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (idParamMatch && idParamMatch[1]) {
    return idParamMatch[1];
  }
  // Assume already a folder ID if alphanumeric + dashes/underscores
  if (/^[a-zA-Z0-9_-]+$/.test(trimmed)) {
    return trimmed;
  }
  return trimmed;
}

/**
 * Parses Google Drive imageMediaMetadata.time ("YYYY:MM:DD HH:MM:SS") into ISO string.
 * Strictly ignores modifiedTime or createdTime to maintain capture time honesty.
 */
export function parseDriveExifTime(driveTime?: string): {
  captureTime: string | null;
  captureTimeSource: CaptureTimeSource;
} {
  if (!driveTime) {
    return { captureTime: null, captureTimeSource: 'unknown' };
  }
  // Format usually: "2026:10:12 09:15:32"
  const match = driveTime.match(/^(\d{4}):(\d{2}):(\d{2})\s+(\d{2}):(\d{2}):(\d{2})$/);
  if (match) {
    const [_, y, m, d, hh, mm, ss] = match;
    const iso = `${y}-${m}-${d}T${hh}:${mm}:${ss}`;
    return { captureTime: iso, captureTimeSource: 'exif' };
  }

  // Fallback direct parse if already ISO
  const directDate = new Date(driveTime);
  if (!isNaN(directDate.getTime())) {
    return { captureTime: driveTime, captureTimeSource: 'exif' };
  }

  return { captureTime: null, captureTimeSource: 'unknown' };
}

export interface DriveFetchResult {
  files: DriveFileEntry[];
  subfolders: DriveFileEntry[];
  nextPageToken?: string | null;
}

/**
 * Fetches files and folders within a Google Drive folder using the official Drive API v3.
 */
export async function fetchDriveFolderContents(
  folderId: string,
  config: Pick<DriveConfig, 'apiKey' | 'accessToken'>,
  pageToken?: string | null,
  signal?: AbortSignal
): Promise<DriveFetchResult> {
  const query = `'${folderId}' in parents and trashed = false and (mimeType contains 'image/' or mimeType contains 'video/' or mimeType = 'application/vnd.google-apps.folder')`;
  const fields = 'nextPageToken, files(id, name, mimeType, size, thumbnailLink, webContentLink, imageMediaMetadata, videoMediaMetadata, parents)';
  const pageSize = 50;

  const url = new URL('https://www.googleapis.com/drive/v3/files');
  url.searchParams.set('q', query);
  url.searchParams.set('fields', fields);
  url.searchParams.set('pageSize', pageSize.toString());
  if (pageToken) {
    url.searchParams.set('pageToken', pageToken);
  }
  if (config.apiKey && !config.accessToken) {
    url.searchParams.set('key', config.apiKey);
  }

  const headers: Record<string, string> = {};
  if (config.accessToken) {
    headers['Authorization'] = `Bearer ${config.accessToken}`;
  }

  const response = await fetch(url.toString(), {
    method: 'GET',
    headers,
    signal,
  });

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error('Google Drive authorization expired or invalid token (401). Please update credentials in Admin Settings.');
    }
    if (response.status === 403) {
      throw new Error('Permission denied (403). Ensure the folder is shared with "Anyone with the link can view", or use authorized OAuth token.');
    }
    if (response.status === 404) {
      throw new Error(`Google Drive folder "${folderId}" not found (404). Check the Folder ID or URL.`);
    }
    const errText = await response.text().catch(() => '');
    throw new Error(`Google Drive API error (${response.status}): ${errText || response.statusText}`);
  }

  const data = await response.json();
  const allEntries: DriveFileEntry[] = data.files || [];

  const files: DriveFileEntry[] = [];
  const subfolders: DriveFileEntry[] = [];

  for (const entry of allEntries) {
    if (entry.mimeType === 'application/vnd.google-apps.folder') {
      subfolders.push(entry);
    } else {
      files.push(entry);
    }
  }

  return {
    files,
    subfolders,
    nextPageToken: data.nextPageToken || null,
  };
}

/**
 * Cleanly formats Google Drive image URLs with dimension parameters
 * preventing malformed queries or duplicate size tags that break image rendering.
 */
export function buildDriveImageUrl(thumbnailLink: string | undefined, sizeParam: string): string {
  if (!thumbnailLink) return '';
  const cleanUrl = thumbnailLink.replace(/=(s\d+|s0|w\d+-h\d+|w\d+|h\d+)(.*)$/, '');
  return `${cleanUrl}=${sizeParam}`;
}

/**
 * Converts a Google Drive file entry into a MemoryFlow MediaItem.
 */
export function driveEntryToMediaItem(
  entry: DriveFileEntry,
  eventId: string,
  parentFolderId?: string
): MediaItem {
  const { captureTime, captureTimeSource } = parseDriveExifTime(
    entry.imageMediaMetadata?.time
  );

  const isVideo = entry.mimeType.startsWith('video/');
  let duration: number | null = null;
  if (isVideo && entry.videoMediaMetadata?.durationMillis) {
    duration = Math.round(parseInt(entry.videoMediaMetadata.durationMillis, 10) / 1000);
  }

  const width = entry.imageMediaMetadata?.width || entry.videoMediaMetadata?.width || null;
  const height = entry.imageMediaMetadata?.height || entry.videoMediaMetadata?.height || null;

  // Progressive thumbnail: =s640 for crisp medium quality
  const thumbUrl = buildDriveImageUrl(entry.thumbnailLink, 's640');

  // Low-res progressive link: =s200 for fast instant placeholder
  const lowResUrl = buildDriveImageUrl(entry.thumbnailLink, 's200');

  // Full uncropped original: =s0 serves the native full resolution without HTML download redirects
  const fullUncroppedUrl = isVideo
    ? (entry.webContentLink || `https://drive.google.com/uc?id=${entry.id}&export=download`)
    : (buildDriveImageUrl(entry.thumbnailLink, 's0') || entry.webContentLink || `https://drive.google.com/uc?id=${entry.id}&export=download`);

  return {
    id: `drive_${entry.id}`,
    eventId,
    originalName: entry.name,
    mimeType: entry.mimeType,
    size: entry.size ? Number(entry.size) : 0,
    thumbnailUrl: thumbUrl || generateDrivePlaceholderSvg(entry.name, isVideo),
    lowResUrl: lowResUrl || undefined,
    width,
    height,
    duration,
    captureTime,
    captureTimeSource,
    timezoneKnown: null,
    importedAt: new Date().toISOString(),
    fileModifiedAt: null, // Strictly do not infer capture time from Drive file modification
    processingStatus: 'ready',
    hash: null,
    duplicateGroupId: null,
    isDrive: true,
    driveFileId: entry.id,
    driveThumbnailUrl: thumbUrl,
    driveFullUrl: fullUncroppedUrl,
    driveParentFolderId: parentFolderId,
    embeddingStatus: 'pending',
  };
}

/**
 * Fallback SVG placeholder for Drive items while thumbnail streams.
 */
function generateDrivePlaceholderSvg(name: string, isVideo: boolean): string {
  const icon = isVideo ? '▶ Video' : '📷 Photo';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400" viewBox="0 0 600 400">
    <rect width="600" height="400" fill="#EAE6DA"/>
    <text x="50%" y="46%" font-family="sans-serif" font-size="20" fill="#52664F" text-anchor="middle" font-weight="600">${icon}</text>
    <text x="50%" y="56%" font-family="sans-serif" font-size="14" fill="#767165" text-anchor="middle">${name.slice(0, 32)}</text>
  </svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

// Bounded in-memory LRU cache for progressive image blobs
const LRU_MAX_SIZE = 60;
const lruBlobCache = new Map<string, string>(); // url -> blobObjectUrl

export function getCachedBlobUrl(url: string): string | undefined {
  if (lruBlobCache.has(url)) {
    // Refresh LRU position
    const val = lruBlobCache.get(url)!;
    lruBlobCache.delete(url);
    lruBlobCache.set(url, val);
    return val;
  }
  return undefined;
}

export function setCachedBlobUrl(url: string, blobUrl: string): void {
  if (lruBlobCache.size >= LRU_MAX_SIZE) {
    const oldestKey = lruBlobCache.keys().next().value;
    if (oldestKey) {
      const revokedUrl = lruBlobCache.get(oldestKey);
      if (revokedUrl && revokedUrl.startsWith('blob:')) {
        URL.revokeObjectURL(revokedUrl);
      }
      lruBlobCache.delete(oldestKey);
    }
  }
  lruBlobCache.set(url, blobUrl);
}
