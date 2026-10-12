import { DriveConfig, MediaItem, Moment, Membership } from '../types';
import {
  fetchDriveFolderContents,
  driveEntryToMediaItem,
} from './driveClient';
import {
  saveDriveConfig,
  saveStoredMediaItem,
  saveStoredMoment,
  saveStoredMembership,
} from './db';

export interface DriveSyncProgress {
  status: 'idle' | 'syncing' | 'paused' | 'error' | 'ready';
  discoveredCount: number;
  processedCount: number;
  currentFolder: string;
  errorMessage?: string | null;
}

// Active sync controller for pause/cancel
let activeSyncAbortController: AbortController | null = null;
let isPaused = false;

export function pauseDriveSync(): void {
  isPaused = true;
  if (activeSyncAbortController) {
    activeSyncAbortController.abort();
    activeSyncAbortController = null;
  }
}

export function resumeDriveSync(): void {
  isPaused = false;
}

export function isDriveSyncPaused(): boolean {
  return isPaused;
}

/**
 * Synchronizes media files from a configured Google Drive folder.
 * Supports recursive folder crawling, pagination, and resume capability.
 */
export async function syncDriveFolder(
  config: DriveConfig,
  eventId: string,
  onProgress?: (progress: DriveSyncProgress) => void
): Promise<{ addedMedia: MediaItem[]; totalDiscovered: number }> {
  isPaused = false;
  activeSyncAbortController = new AbortController();
  const signal = activeSyncAbortController.signal;

  const folderQueue: { id: string; name: string }[] = [{ id: config.folderId, name: 'Root' }];
  const visitedFolders = new Set<string>();
  const allAddedMedia: MediaItem[] = [];

  let totalDiscovered = 0;
  let processedCount = 0;

  try {
    // Update config status
    config.status = 'syncing';
    config.errorMessage = null;
    await saveDriveConfig(config);

    while (folderQueue.length > 0) {
      if (isPaused || signal.aborted) {
        config.status = 'paused';
        await saveDriveConfig(config);
        onProgress?.({
          status: 'paused',
          discoveredCount: totalDiscovered,
          processedCount,
          currentFolder: 'Paused',
        });
        return { addedMedia: allAddedMedia, totalDiscovered };
      }

      const currentFolder = folderQueue.shift()!;
      if (visitedFolders.has(currentFolder.id)) continue;
      visitedFolders.add(currentFolder.id);

      onProgress?.({
        status: 'syncing',
        discoveredCount: totalDiscovered,
        processedCount,
        currentFolder: currentFolder.name,
      });

      let pageToken: string | null | undefined = null;

      do {
        if (isPaused || signal.aborted) {
          config.status = 'paused';
          await saveDriveConfig(config);
          return { addedMedia: allAddedMedia, totalDiscovered };
        }

        const result = await fetchDriveFolderContents(
          currentFolder.id,
          config,
          pageToken,
          signal
        );

        // Add subfolders to queue
        for (const sub of result.subfolders) {
          if (!visitedFolders.has(sub.id)) {
            folderQueue.push({ id: sub.id, name: sub.name });
          }
        }

        // Process files
        for (const file of result.files) {
          totalDiscovered++;
          const mediaItem = driveEntryToMediaItem(file, eventId, currentFolder.id);
          allAddedMedia.push(mediaItem);
          await saveStoredMediaItem(mediaItem);
          processedCount++;

          if (processedCount % 5 === 0) {
            onProgress?.({
              status: 'syncing',
              discoveredCount: totalDiscovered,
              processedCount,
              currentFolder: currentFolder.name,
            });
          }
        }

        pageToken = result.nextPageToken;
      } while (pageToken);
    }

    config.status = 'ready';
    config.lastSyncedAt = new Date().toISOString();
    config.indexedCount = processedCount;
    config.totalDiscovered = totalDiscovered;
    await saveDriveConfig(config);

    onProgress?.({
      status: 'ready',
      discoveredCount: totalDiscovered,
      processedCount,
      currentFolder: 'Complete',
    });

    return { addedMedia: allAddedMedia, totalDiscovered };
  } catch (err: unknown) {
    if (signal.aborted || isPaused) {
      config.status = 'paused';
      await saveDriveConfig(config);
      return { addedMedia: allAddedMedia, totalDiscovered };
    }

    const message = err instanceof Error ? err.message : String(err);
    config.status = 'error';
    config.errorMessage = message;
    await saveDriveConfig(config);

    onProgress?.({
      status: 'error',
      discoveredCount: totalDiscovered,
      processedCount,
      currentFolder: 'Failed',
      errorMessage: message,
    });

    throw err;
  } finally {
    activeSyncAbortController = null;
  }
}

/**
 * Generates a realistic simulated Google Drive collection with authentic multi-camera captures,
 * subfolders, and realistic EXIF capture timestamps.
 * Used for instant verification without needing an external network API key.
 */
export async function seedSimulatedDriveFolder(
  eventId: string,
  onProgress?: (progress: DriveSyncProgress) => void
): Promise<{ addedMedia: MediaItem[]; moments: Moment[] }> {
  const simulatedFiles: {
    id: string;
    name: string;
    folder: string;
    captureTime: string | null;
    width: number;
    height: number;
    isVideo?: boolean;
    duration?: number;
    color: string;
    camera: string;
  }[] = [
    // Morning Keynote - Multi-camera (Phone A + DSLR B)
    {
      id: 'sim_dr_01',
      name: 'IMG_20261012_091522_Pixel8.jpg',
      folder: 'Main Stage Morning',
      captureTime: '2026-10-12T09:15:22.000Z',
      width: 1920,
      height: 1080,
      color: '#A2B29F',
      camera: 'Pixel 8 Pro',
    },
    {
      id: 'sim_dr_02',
      name: 'DSC_4421_SonyA7.jpg',
      folder: 'Main Stage Morning',
      captureTime: '2026-10-12T09:16:10.000Z',
      width: 1920,
      height: 1280,
      color: '#8E9E8B',
      camera: 'Sony Alpha 7 IV',
    },
    {
      id: 'sim_dr_03',
      name: 'VID_20261012_092045.mp4',
      folder: 'Main Stage Morning',
      captureTime: '2026-10-12T09:20:45.000Z',
      width: 1920,
      height: 1080,
      isVideo: true,
      duration: 18,
      color: '#7A8C78',
      camera: 'iPhone 15 Pro',
    },

    // Courtyard Coffee & Meetups - Multi-camera (Close capture times)
    {
      id: 'sim_dr_04',
      name: 'IMG_8812_iPhone.jpg',
      folder: 'Courtyard',
      captureTime: '2026-10-12T10:42:15.000Z',
      width: 1600,
      height: 1200,
      color: '#D8C7B0',
      camera: 'iPhone 14',
    },
    {
      id: 'sim_dr_05',
      name: 'DSC_4490_SonyA7.jpg',
      folder: 'Courtyard',
      captureTime: '2026-10-12T10:44:02.000Z',
      width: 1920,
      height: 1280,
      color: '#C6B59E',
      camera: 'Sony Alpha 7 IV',
    },
    {
      id: 'sim_dr_06',
      name: 'PXL_20261012_104830.jpg',
      folder: 'Courtyard',
      captureTime: '2026-10-12T10:48:30.000Z',
      width: 1920,
      height: 1440,
      color: '#DFD1BD',
      camera: 'Pixel 7',
    },

    // Afternoon Interactive Workshop
    {
      id: 'sim_dr_07',
      name: 'DSC_4588_Workshop_Demo.jpg',
      folder: 'Lab & Workshop',
      captureTime: '2026-10-12T14:10:05.000Z',
      width: 1920,
      height: 1280,
      color: '#9BB0C1',
      camera: 'Fujifilm X-T5',
    },
    {
      id: 'sim_dr_08',
      name: 'IMG_9104_Discussion.jpg',
      folder: 'Lab & Workshop',
      captureTime: '2026-10-12T14:14:50.000Z',
      width: 1600,
      height: 1200,
      color: '#8CA1B3',
      camera: 'iPhone 15 Pro',
    },

    // Undated camera scan (Tests honest Date Unknown handling)
    {
      id: 'sim_dr_09',
      name: 'SCAN_Poster_Archive.jpg',
      folder: 'Archives',
      captureTime: null,
      width: 1600,
      height: 1200,
      color: '#B5A898',
      camera: 'Flatbed Scanner',
    },
  ];

  const addedMedia: MediaItem[] = [];

  for (let i = 0; i < simulatedFiles.length; i++) {
    const file = simulatedFiles[i];
    onProgress?.({
      status: 'syncing',
      discoveredCount: simulatedFiles.length,
      processedCount: i + 1,
      currentFolder: file.folder,
    });

    const svgThumb = `<svg xmlns="http://www.w3.org/2000/svg" width="${file.width}" height="${file.height}" viewBox="0 0 ${file.width} ${file.height}">
      <rect width="${file.width}" height="${file.height}" fill="${file.color}"/>
      <circle cx="${file.width / 2}" cy="${file.height / 2 - 40}" r="80" fill="rgba(255,255,255,0.2)"/>
      <text x="${file.width / 2}" y="${file.height / 2 + 60}" font-family="sans-serif" font-size="28" fill="#FFFFFF" text-anchor="middle" font-weight="600">${file.name}</text>
      <text x="${file.width / 2}" y="${file.height / 2 + 105}" font-family="sans-serif" font-size="20" fill="rgba(255,255,255,0.85)" text-anchor="middle">${file.camera} · ${file.folder}</text>
    </svg>`;

    const thumbUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgThumb)}`;

    const mediaItem: MediaItem = {
      id: `drive_${file.id}`,
      eventId,
      originalName: file.name,
      mimeType: file.isVideo ? 'video/mp4' : 'image/jpeg',
      size: 2 * 1024 * 1024,
      thumbnailUrl: thumbUrl,
      lowResUrl: thumbUrl,
      width: file.width,
      height: file.height,
      duration: file.duration || null,
      captureTime: file.captureTime,
      captureTimeSource: file.captureTime ? 'exif' : 'unknown',
      timezoneKnown: file.captureTime ? true : null,
      importedAt: new Date().toISOString(),
      fileModifiedAt: null,
      processingStatus: 'ready',
      hash: `hash_${file.id}`,
      duplicateGroupId: null,
      isDrive: true,
      driveFileId: file.id,
      driveThumbnailUrl: thumbUrl,
      driveFullUrl: thumbUrl,
      driveParentFolderId: file.folder,
      embeddingStatus: 'pending',
    };

    addedMedia.push(mediaItem);
    await saveStoredMediaItem(mediaItem);
  }

  // Create initial moments representing the connected Drive structure
  const moments: Moment[] = [
    {
      id: 'moment_stage_am',
      eventId,
      label: 'Main Stage Morning Keynote',
      labelSource: 'imported_folder',
      coverMediaId: 'drive_sim_dr_01',
      description: 'Connected from Drive folder: Main Stage Morning',
      createdAt: '2026-10-12T09:15:00.000Z',
    },
    {
      id: 'moment_courtyard',
      eventId,
      label: 'Courtyard Coffee & Gathering',
      labelSource: 'imported_folder',
      coverMediaId: 'drive_sim_dr_04',
      description: 'Connected from Drive folder: Courtyard',
      createdAt: '2026-10-12T10:40:00.000Z',
    },
    {
      id: 'moment_workshop_pm',
      eventId,
      label: 'Lab & Interactive Workshop',
      labelSource: 'imported_folder',
      coverMediaId: 'drive_sim_dr_07',
      description: 'Connected from Drive folder: Lab & Workshop',
      createdAt: '2026-10-12T14:10:00.000Z',
    },
  ];

  for (const m of moments) {
    await saveStoredMoment(m);
  }

  // Assign memberships
  const memberships: Membership[] = [
    { mediaId: 'drive_sim_dr_01', momentId: 'moment_stage_am', source: 'imported_folder', confidence: 1.0 },
    { mediaId: 'drive_sim_dr_02', momentId: 'moment_stage_am', source: 'imported_folder', confidence: 1.0 },
    { mediaId: 'drive_sim_dr_03', momentId: 'moment_stage_am', source: 'imported_folder', confidence: 1.0 },
    { mediaId: 'drive_sim_dr_04', momentId: 'moment_courtyard', source: 'imported_folder', confidence: 1.0 },
    { mediaId: 'drive_sim_dr_05', momentId: 'moment_courtyard', source: 'imported_folder', confidence: 1.0 },
    { mediaId: 'drive_sim_dr_06', momentId: 'moment_courtyard', source: 'imported_folder', confidence: 1.0 },
    { mediaId: 'drive_sim_dr_07', momentId: 'moment_workshop_pm', source: 'imported_folder', confidence: 1.0 },
    { mediaId: 'drive_sim_dr_08', momentId: 'moment_workshop_pm', source: 'imported_folder', confidence: 1.0 },
  ];

  for (const mem of memberships) {
    await saveStoredMembership(mem);
  }

  // Update drive config
  const driveCfg: DriveConfig = {
    folderId: 'simulated_drive_elevate_2026',
    folderUrl: 'https://drive.google.com/drive/folders/simulated_drive_elevate_2026',
    apiKey: null,
    accessToken: null,
    folderName: 'Elevate Memories 2026 Shared Folder',
    autoSync: true,
    lastSyncedAt: new Date().toISOString(),
    status: 'ready',
    indexedCount: simulatedFiles.length,
    totalDiscovered: simulatedFiles.length,
  };
  await saveDriveConfig(driveCfg);

  onProgress?.({
    status: 'ready',
    discoveredCount: simulatedFiles.length,
    processedCount: simulatedFiles.length,
    currentFolder: 'Simulated Drive Connected',
  });

  return { addedMedia, moments };
}
