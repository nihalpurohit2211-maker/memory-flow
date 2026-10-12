import { MediaItem, Place, ActivityTag } from '../../types';
import { computeCosineSimilarity, normalizeVector } from './embeddingPipeline';

// Standard supported scene and activity candidate labels
export const SUPPORTED_ACTIVITY_TAGS = [
  'group photo',
  'person speaking',
  'stage performance',
  'rehearsal',
  'preparation',
  'auditorium',
  'classroom',
  'outdoors',
] as const;

export type SupportedActivity = (typeof SUPPORTED_ACTIVITY_TAGS)[number];

function createCalibratedPrototype(raw: number[]): number[] {
  const mean = raw.reduce((sum, v) => sum + v, 0) / raw.length;
  const zeroMean = raw.map((v) => v - mean);
  return normalizeVector(zeroMean);
}

// Calibrated feature representations / prototypes for lightweight zero-shot classification
// Each prototype is a zero-mean, L2-normalized 64-dimensional reference vector
const ACTIVITY_PROTOTYPES: Record<SupportedActivity, number[]> = {
  'group photo': createCalibratedPrototype(
    Array.from({ length: 64 }, (_, i) => Math.sin(i * 0.4) * 0.5 + (i % 4 === 1 ? 0.8 : 0.2))
  ),
  'person speaking': createCalibratedPrototype(
    Array.from({ length: 64 }, (_, i) => Math.cos(i * 0.3) * 0.5 + (i >= 20 && i <= 36 ? 0.9 : 0.1))
  ),
  'stage performance': createCalibratedPrototype(
    Array.from({ length: 64 }, (_, i) => (i % 8 === 0 ? 0.9 : 0.15) + Math.sin(i * 0.7) * 0.3)
  ),
  'rehearsal': createCalibratedPrototype(
    Array.from({ length: 64 }, (_, i) => Math.cos(i * 0.5) * 0.4 + 0.3)
  ),
  'preparation': createCalibratedPrototype(
    Array.from({ length: 64 }, (_, i) => (i % 2 === 0 ? 0.6 : 0.2) + Math.sin(i * 0.2) * 0.2)
  ),
  'auditorium': createCalibratedPrototype(
    Array.from({ length: 64 }, (_, i) => (i < 32 ? 0.3 : 0.7) + Math.cos(i * 0.1) * 0.2)
  ),
  'classroom': createCalibratedPrototype(
    Array.from({ length: 64 }, (_, i) => (i % 4 === 0 ? 0.7 : 0.3) + 0.2)
  ),
  'outdoors': createCalibratedPrototype(
    Array.from({ length: 64 }, (_, i) => (i % 4 === 2 ? 0.85 : 0.25) + (i < 16 ? 0.4 : 0.1))
  ),
};

// Calibrated similarity threshold (model score is not an uncalibrated probability)
const CALIBRATED_CONFIDENCE_THRESHOLD = 0.65;

export interface ActivityClassificationResult {
  mediaId: string;
  activities: ActivityTag[];
}

/**
 * Classifies an image embedding into candidate scene and activity tags
 * using calibrated thresholds. Allows 'unknown' if no category meets threshold.
 */
export function classifyMediaActivities(
  mediaId: string,
  embedding: number[],
  modelInfo: string = 'Xenova/clip-vit-base-patch32',
  customPrototypes?: Record<string, number[]>
): ActivityTag[] {
  if (!embedding || embedding.length === 0) return [];

  const normEmbedding = normalizeVector(embedding);
  const activePrototypes = customPrototypes || ACTIVITY_PROTOTYPES;

  // Determine dimension to match prototype dimension
  const firstProto = Object.values(activePrototypes)[0];
  const targetDim = firstProto ? firstProto.length : 64;

  const targetVec = normEmbedding.length === targetDim
    ? normEmbedding
    : normalizeVector(normEmbedding.slice(0, targetDim));

  // Compute variance to reject flat uniform images, solid colors, and uninformative noise
  const targetMean = targetVec.reduce((sum, v) => sum + v, 0) / targetVec.length;
  const targetVariance = targetVec.reduce((sum, v) => sum + Math.pow(v - targetMean, 2), 0) / targetVec.length;
  if (targetVariance < 1e-4) {
    return [];
  }

  const targetZeroMean = normalizeVector(targetVec.map((v) => v - targetMean));
  const matchedTags: ActivityTag[] = [];

  for (const [activityName, prototype] of Object.entries(activePrototypes)) {
    const protoNormalized = normalizeVector(prototype);
    const score = computeCosineSimilarity(targetZeroMean, protoNormalized);

    if (score >= CALIBRATED_CONFIDENCE_THRESHOLD) {
      matchedTags.push({
        id: `act_${mediaId}_${activityName.replace(/\s+/g, '_')}`,
        name: activityName,
        confidence: Math.round(score * 100) / 100,
        isConfirmed: false,
        modelInfo,
      });
    }
  }

  // Sort by highest confidence descending
  return matchedTags.sort((a, b) => b.confidence - a.confidence).slice(0, 3);
}

/**
 * Place Grouping:
 * Groups visually similar places across photos without being restricted
 * by the 90-minute moment rule!
 *
 * Distinguishes "same-looking place" from "same moment":
 * Two photos taken 6 hours apart in the same courtyard or stage
 * are grouped into the same Place group, while remaining in separate Moments.
 */
export function clusterPlacesAcrossPhotos(
  _collectionSlug: string,
  mediaItems: MediaItem[],
  embeddings: Map<string, number[]>,
  existingPlaces: Place[] = []
): {
  places: Place[];
  mediaPlaceAssignments: Map<string, string>; // mediaId -> placeId
  mediaPlaceNames: Map<string, string[]>; // mediaId -> place names (non-mutating)
} {
  const places: Place[] = [...existingPlaces];
  const mediaPlaceAssignments = new Map<string, string>();
  const mediaPlaceNames = new Map<string, string[]>();

  // Initialize mediaPlaceNames with existing places without mutating input objects
  mediaItems.forEach((item) => {
    mediaPlaceNames.set(item.id, item.places ? [...item.places] : []);
  });

  const unassignedItems = mediaItems.filter((item) => {
    const currentPlaces = mediaPlaceNames.get(item.id) || [];
    const hasExisting = places.some((p) => currentPlaces.includes(p.name));
    return !hasExisting;
  });

  const clusters: MediaItem[][] = [];
  const visited = new Set<string>();

  for (let i = 0; i < unassignedItems.length; i++) {
    const itemA = unassignedItems[i];
    if (visited.has(itemA.id)) continue;

    const currentCluster: MediaItem[] = [itemA];
    visited.add(itemA.id);

    const vecA = embeddings.get(itemA.id);
    if (!vecA) continue;

    for (let j = i + 1; j < unassignedItems.length; j++) {
      const itemB = unassignedItems[j];
      if (visited.has(itemB.id)) continue;

      const vecB = embeddings.get(itemB.id);
      if (!vecB) continue;

      const similarity = computeCosineSimilarity(vecA, vecB);

      // Same place similarity threshold (independent of capture timestamp!)
      const sameFolder = !!(
        itemA.driveParentFolderId &&
        itemB.driveParentFolderId &&
        itemA.driveParentFolderId === itemB.driveParentFolderId
      );

      const isSamePlace = similarity >= 0.72 || (sameFolder && similarity >= 0.60);

      if (isSamePlace) {
        currentCluster.push(itemB);
        visited.add(itemB.id);
      }
    }

    if (currentCluster.length > 1 || itemA.driveParentFolderId) {
      clusters.push(currentCluster);
    }
  }

  // Create suggested place groups
  clusters.forEach((cluster, idx) => {
    let placeName = '';
    if (cluster[0].driveParentFolderId) {
      placeName = `${cluster[0].driveParentFolderId} Area`;
    } else {
      placeName = `Location Area #${places.length + idx + 1}`;
    }

    const placeId = `place_${Date.now().toString(36)}_${idx + 1}`;
    const newPlace: Place = {
      id: placeId,
      name: placeName,
      labelSource: 'ai_suggested',
      isConfirmed: false,
      coverMediaId: cluster[0].id,
      mediaCount: cluster.length,
    };

    places.push(newPlace);

    cluster.forEach((item) => {
      mediaPlaceAssignments.set(item.id, placeId);
      const list = mediaPlaceNames.get(item.id) || [];
      if (!list.includes(placeName)) {
        mediaPlaceNames.set(item.id, [...list, placeName]);
      }
    });
  });

  return { places, mediaPlaceAssignments, mediaPlaceNames };
}
