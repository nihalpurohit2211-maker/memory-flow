import { describe, it, expect, beforeEach } from 'vitest';
import { extractDriveFolderId, parseDriveExifTime } from '../driveClient';
import {
  normalizeVector,
  computeCosineSimilarity,
} from '../ai/embeddingPipeline';
import {
  detectNearDuplicates,
  performMultiSignalClustering,
} from '../ai/clustering';
import { loginAsAdmin, logoutAdmin, isAdminAuthenticated, assertAdminAccess } from '../auth';
import { MediaItem } from '../../types';

describe('Phase 2 — Google Drive Integration', () => {
  it('extracts Google Drive folder ID correctly from various link formats', () => {
    // Full URL
    expect(
      extractDriveFolderId('https://drive.google.com/drive/folders/1A2B3C4D5E6F7G8H9I0J?usp=sharing')
    ).toBe('1A2B3C4D5E6F7G8H9I0J');

    // Account-specific URL
    expect(
      extractDriveFolderId('https://drive.google.com/drive/u/1/folders/folder_xyz_123')
    ).toBe('folder_xyz_123');

    // Query param format
    expect(
      extractDriveFolderId('https://drive.google.com/open?id=folder_param_456')
    ).toBe('folder_param_456');

    // Raw ID directly
    expect(extractDriveFolderId('raw_folder_789')).toBe('raw_folder_789');
  });

  it('honestly extracts camera EXIF timestamps and avoids Drive modification time', () => {
    // Valid EXIF camera time format
    const res1 = parseDriveExifTime('2026:10:12 09:15:30');
    expect(res1.captureTimeSource).toBe('exif');
    expect(res1.captureTime).toBeTruthy();
    expect(res1.captureTime).toContain('09:15:30');

    // Missing EXIF time -> strictly Date unknown
    const res2 = parseDriveExifTime(undefined);
    expect(res2.captureTimeSource).toBe('unknown');
    expect(res2.captureTime).toBeNull();
  });
});

describe('Phase 2 — Admin Session & Security Guard', () => {
  beforeEach(() => {
    logoutAdmin();
  });

  it('requires valid passphrase to unlock admin session', async () => {
    // Incorrect password
    const failRes = await loginAsAdmin('wrongpassword');
    expect(failRes.success).toBe(false);
    expect(isAdminAuthenticated()).toBe(false);

    // Default password
    const successRes = await loginAsAdmin('admin123');
    expect(successRes.success).toBe(true);
    expect(isAdminAuthenticated()).toBe(true);
  });

  it('assertAdminAccess throws Error when not authenticated', () => {
    expect(() => assertAdminAccess('Altering Drive Source')).toThrow(
      'Altering Drive Source requires an active Admin session.'
    );
  });
});

describe('Phase 2 — AI Visual Embeddings & Near-Duplicate Detection', () => {
  it('normalizes vectors to unit length and computes accurate cosine similarity', () => {
    const vecA = [3, 4, 0];
    const normA = normalizeVector(vecA);
    // Length of [3,4,0] is 5, normalized: [0.6, 0.8, 0]
    expect(normA[0]).toBeCloseTo(0.6);
    expect(normA[1]).toBeCloseTo(0.8);

    // Identical vector has similarity 1.0
    expect(computeCosineSimilarity(normA, normA)).toBeCloseTo(1.0);

    // Orthogonal vector has similarity 0.0
    const vecB = normalizeVector([0, 0, 5]);
    expect(computeCosineSimilarity(normA, vecB)).toBeCloseTo(0.0);
  });

  it('detects near-duplicates when similarity exceeds 0.95 without deleting originals', () => {
    const items: MediaItem[] = [
      {
        id: 'img1',
        eventId: 'ev1',
        originalName: 'burst_01.jpg',
        mimeType: 'image/jpeg',
        size: 1000,
        thumbnailUrl: '',
        width: 100,
        height: 100,
        duration: null,
        captureTime: '2026-10-12T10:00:00.000Z',
        captureTimeSource: 'exif',
        timezoneKnown: true,
        importedAt: '',
        fileModifiedAt: null,
        processingStatus: 'ready',
        hash: 'h1',
        duplicateGroupId: null,
      },
      {
        id: 'img2',
        eventId: 'ev1',
        originalName: 'burst_02.jpg',
        mimeType: 'image/jpeg',
        size: 1000,
        thumbnailUrl: '',
        width: 100,
        height: 100,
        duration: null,
        captureTime: '2026-10-12T10:00:02.000Z', // 2 seconds later
        captureTimeSource: 'exif',
        timezoneKnown: true,
        importedAt: '',
        fileModifiedAt: null,
        processingStatus: 'ready',
        hash: 'h2',
        duplicateGroupId: null,
      },
    ];

    const embeddings = new Map<string, number[]>();
    embeddings.set('img1', normalizeVector([1, 1, 1, 1]));
    embeddings.set('img2', normalizeVector([1, 1, 1, 0.98])); // Extremely close

    const duplicates = detectNearDuplicates(items, embeddings);
    expect(duplicates.length).toBe(1);
    expect(duplicates[0].similarity).toBeGreaterThan(0.95);
    expect(items[1].nearDuplicateOfId).toBe('img1');
  });
});

describe('Phase 2 — Multi-Signal Clustering ("One moment, many cameras")', () => {
  it('groups multi-camera items when capture times are close and visual similarity matches', () => {
    const phonePhoto: MediaItem = {
      id: 'camA',
      eventId: 'ev1',
      originalName: 'Phone_Stage.jpg',
      mimeType: 'image/jpeg',
      size: 2000,
      thumbnailUrl: '',
      width: 1920,
      height: 1080,
      duration: null,
      captureTime: '2026-10-12T09:15:00.000Z',
      captureTimeSource: 'exif',
      timezoneKnown: true,
      importedAt: '',
      fileModifiedAt: null,
      processingStatus: 'ready',
      hash: 'hA',
      duplicateGroupId: null,
      driveParentFolderId: 'Stage Morning',
    };

    const dslrPhoto: MediaItem = {
      id: 'camB',
      eventId: 'ev1',
      originalName: 'Sony_Stage.jpg',
      mimeType: 'image/jpeg',
      size: 5000,
      thumbnailUrl: '',
      width: 1920,
      height: 1280,
      duration: null,
      captureTime: '2026-10-12T09:18:00.000Z', // 3 minutes apart!
      captureTimeSource: 'exif',
      timezoneKnown: true,
      importedAt: '',
      fileModifiedAt: null,
      processingStatus: 'ready',
      hash: 'hB',
      duplicateGroupId: null,
      driveParentFolderId: 'Stage Morning',
    };

    const embeddings = new Map<string, number[]>();
    embeddings.set('camA', normalizeVector([0.8, 0.6, 0.4, 0.2]));
    embeddings.set('camB', normalizeVector([0.78, 0.62, 0.39, 0.21])); // High match

    const result = performMultiSignalClustering('ev1', [phonePhoto, dslrPhoto], embeddings);

    // Grouped together as 1 moment!
    expect(result.moments.length).toBe(1);
    expect(result.memberships.length).toBe(2);
    expect(result.moments[0].isProvisional).toBe(false);
  });

  it('strictly separates photos into different moments when capture times are distant even if appearance is similar', () => {
    const morningKeynote: MediaItem = {
      id: 'item1',
      eventId: 'ev1',
      originalName: 'Morning_Speaker.jpg',
      mimeType: 'image/jpeg',
      size: 2000,
      thumbnailUrl: '',
      width: 1920,
      height: 1080,
      duration: null,
      captureTime: '2026-10-12T09:00:00.000Z', // Morning 9:00 AM
      captureTimeSource: 'exif',
      timezoneKnown: true,
      importedAt: '',
      fileModifiedAt: null,
      processingStatus: 'ready',
      hash: 'h1',
      duplicateGroupId: null,
    };

    const eveningPanel: MediaItem = {
      id: 'item2',
      eventId: 'ev1',
      originalName: 'Evening_Speaker.jpg',
      mimeType: 'image/jpeg',
      size: 2000,
      thumbnailUrl: '',
      width: 1920,
      height: 1080,
      duration: null,
      captureTime: '2026-10-12T18:00:00.000Z', // Evening 6:00 PM (9 hours apart)
      captureTimeSource: 'exif',
      timezoneKnown: true,
      importedAt: '',
      fileModifiedAt: null,
      processingStatus: 'ready',
      hash: 'h2',
      duplicateGroupId: null,
    };

    // Both depict same speaker (high visual similarity)
    const embeddings = new Map<string, number[]>();
    const vec = normalizeVector([1, 1, 1, 1]);
    embeddings.set('item1', vec);
    embeddings.set('item2', vec);

    const result = performMultiSignalClustering('ev1', [morningKeynote, eveningPanel], embeddings);

    // Rule check: Similar appearance alone MUST NOT establish the same moment
    // Must be in 2 separate moments!
    expect(result.moments.length).toBe(2);
  });

  it('keeps uncertain matches with unknown capture times strictly provisional', () => {
    const undatedItem1: MediaItem = {
      id: 'undated1',
      eventId: 'ev1',
      originalName: 'Scan1.jpg',
      mimeType: 'image/jpeg',
      size: 1500,
      thumbnailUrl: '',
      width: 800,
      height: 600,
      duration: null,
      captureTime: null,
      captureTimeSource: 'unknown',
      timezoneKnown: null,
      importedAt: '',
      fileModifiedAt: null,
      processingStatus: 'ready',
      hash: 'hu1',
      duplicateGroupId: null,
    };

    const undatedItem2: MediaItem = {
      id: 'undated2',
      eventId: 'ev1',
      originalName: 'Scan2.jpg',
      mimeType: 'image/jpeg',
      size: 1500,
      thumbnailUrl: '',
      width: 800,
      height: 600,
      duration: null,
      captureTime: null,
      captureTimeSource: 'unknown',
      timezoneKnown: null,
      importedAt: '',
      fileModifiedAt: null,
      processingStatus: 'ready',
      hash: 'hu2',
      duplicateGroupId: null,
    };

    const embeddings = new Map<string, number[]>();
    embeddings.set('undated1', normalizeVector([1, 1, 1, 1]));
    embeddings.set('undated2', normalizeVector([0.9, 0.9, 0.9, 0.9]));

    const result = performMultiSignalClustering('ev1', [undatedItem1, undatedItem2], embeddings);

    expect(result.moments.length).toBe(1);
    expect(result.moments[0].isProvisional).toBe(true);
    expect(result.provisionalCount).toBe(1);
  });
});
