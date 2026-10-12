import { describe, it, expect } from 'vitest';
import {
  classifyMediaActivities,
  clusterPlacesAcrossPhotos,
  SUPPORTED_ACTIVITY_TAGS,
} from '../sceneClassification';
import { normalizeVector } from '../embeddingPipeline';
import { MediaItem } from '../../../types';

describe('Scene Classification, Activity Tags & Place Grouping', () => {
  it('supports the full required suite of activity and scene tags', () => {
    expect(SUPPORTED_ACTIVITY_TAGS).toContain('group photo');
    expect(SUPPORTED_ACTIVITY_TAGS).toContain('person speaking');
    expect(SUPPORTED_ACTIVITY_TAGS).toContain('stage performance');
    expect(SUPPORTED_ACTIVITY_TAGS).toContain('rehearsal');
    expect(SUPPORTED_ACTIVITY_TAGS).toContain('preparation');
    expect(SUPPORTED_ACTIVITY_TAGS).toContain('auditorium');
    expect(SUPPORTED_ACTIVITY_TAGS).toContain('classroom');
    expect(SUPPORTED_ACTIVITY_TAGS).toContain('outdoors');
  });

  it('classifies media items with calibrated confidence and assigns candidate tags', () => {
    // Generate feature vector matching outdoors prototype
    const vector = normalizeVector(
      Array.from({ length: 64 }, (_, i) => (i % 4 === 2 ? 0.85 : 0.25) + (i < 16 ? 0.4 : 0.1))
    );

    const activities = classifyMediaActivities('media_1', vector, 'Xenova/clip-vit-base-patch32');
    expect(activities.length).toBeGreaterThan(0);
    expect(activities[0].name).toBe('outdoors');
    expect(activities[0].confidence).toBeGreaterThanOrEqual(0.65);
    expect(activities[0].isConfirmed).toBe(false); // AI suggested, not confirmed until organizer approves
  });

  it('returns empty array when embedding has low confidence across all candidates', () => {
    // Orthogonal flat noise vector
    const flatNoise = normalizeVector(new Array(64).fill(0.01));
    const activities = classifyMediaActivities('media_noise', flatNoise);
    // If no candidate meets calibrated threshold, returns no spurious tags
    expect(activities.length).toBe(0);
  });

  it('groups visually similar places across photos without being restricted by the 90-minute moment rule', () => {
    const morningStagePhoto: MediaItem = {
      id: 'item_morning_stage',
      eventId: 'elevate',
      originalName: 'morning_stage.jpg',
      mimeType: 'image/jpeg',
      size: 2000000,
      thumbnailUrl: '',
      width: 1920,
      height: 1080,
      duration: null,
      captureTime: '2026-10-10T09:00:00Z', // Morning 9:00 AM
      captureTimeSource: 'exif',
      timezoneKnown: true,
      importedAt: '',
      fileModifiedAt: null,
      processingStatus: 'ready',
      hash: 'h1',
      duplicateGroupId: null,
    };

    const eveningStagePhoto: MediaItem = {
      id: 'item_evening_stage',
      eventId: 'elevate',
      originalName: 'evening_stage.jpg',
      mimeType: 'image/jpeg',
      size: 2000000,
      thumbnailUrl: '',
      width: 1920,
      height: 1080,
      duration: null,
      captureTime: '2026-10-10T21:00:00Z', // 12 hours later!
      captureTimeSource: 'exif',
      timezoneKnown: true,
      importedAt: '',
      fileModifiedAt: null,
      processingStatus: 'ready',
      hash: 'h2',
      duplicateGroupId: null,
    };

    const embeddings = new Map<string, number[]>();
    // Both depict same stage venue (visual similarity = 0.85)
    const stageVenueVector = normalizeVector([0.9, 0.7, 0.4, 0.2]);
    embeddings.set('item_morning_stage', stageVenueVector);
    embeddings.set('item_evening_stage', stageVenueVector);

    const { places, mediaPlaceAssignments } = clusterPlacesAcrossPhotos(
      'elevate',
      [morningStagePhoto, eveningStagePhoto],
      embeddings
    );

    // Rule: Distinguishes "same-looking place" from "same moment"
    // Despite 12 hours separation, they are grouped in the same place!
    expect(places.length).toBe(1);
    expect(mediaPlaceAssignments.get('item_morning_stage')).toBe(places[0].id);
    expect(mediaPlaceAssignments.get('item_evening_stage')).toBe(places[0].id);
    expect(morningStagePhoto.places).toContain(places[0].name);
    expect(eveningStagePhoto.places).toContain(places[0].name);
  });
});
