import { MediaItem, Moment, Membership, Connection, AISimilarityMatch } from '../../types';
import { computeCosineSimilarity } from './embeddingPipeline';

export interface ClusteringResult {
  moments: Moment[];
  memberships: Membership[];
  connections: Connection[];
  nearDuplicates: AISimilarityMatch[];
  provisionalCount: number;
}

/**
 * Detects near-duplicate images/frames using cosine similarity and time proximity.
 * Does not delete originals; tags items for transparent review.
 */
export function detectNearDuplicates(
  items: MediaItem[],
  embeddings: Map<string, number[]>
): AISimilarityMatch[] {
  const duplicates: AISimilarityMatch[] = [];

  for (let i = 0; i < items.length; i++) {
    const itemA = items[i];
    const vecA = embeddings.get(itemA.id);
    if (!vecA) continue;

    for (let j = i + 1; j < items.length; j++) {
      const itemB = items[j];
      const vecB = embeddings.get(itemB.id);
      if (!vecB) continue;

      const similarity = computeCosineSimilarity(vecA, vecB);

      let timeDiffMin: number | null = null;
      if (itemA.captureTime && itemB.captureTime) {
        const tA = new Date(itemA.captureTime).getTime();
        const tB = new Date(itemB.captureTime).getTime();
        timeDiffMin = Math.abs(tA - tB) / (1000 * 60);
      }

      const sameFolder = !!(
        itemA.driveParentFolderId &&
        itemB.driveParentFolderId &&
        itemA.driveParentFolderId === itemB.driveParentFolderId
      );

      // High visual similarity threshold for near-duplicates
      const isNearDuplicate =
        similarity >= 0.95 &&
        (timeDiffMin === null || timeDiffMin <= 10 || sameFolder);

      if (isNearDuplicate) {
        duplicates.push({
          mediaId1: itemA.id,
          mediaId2: itemB.id,
          similarity,
          timeDiffMinutes: timeDiffMin,
          isNearDuplicate: true,
          sharedFolder: sameFolder,
        });

        // Flag item B as near duplicate of A
        itemB.nearDuplicateOfId = itemA.id;
        itemB.nearDuplicateSimilarity = Math.round(similarity * 100) / 100;
      }
    }
  }

  return duplicates;
}

/**
 * Multi-signal grouping algorithm:
 * Uses visual embeddings + capture-time proximity + folder evidence to discover
 * "One moment, many cameras".
 *
 * Strict constraint:
 * Similar appearance alone MUST NOT establish the same moment.
 * If capture times are distant (>90 mins), items are separated into different moments.
 * If capture times are unknown, grouping is kept strictly PROVISIONAL.
 */
export function performMultiSignalClustering(
  eventId: string,
  mediaItems: MediaItem[],
  embeddings: Map<string, number[]>,
  existingMoments: Moment[] = [],
  existingMemberships: Membership[] = []
): ClusteringResult {
  const nearDuplicates = detectNearDuplicates(mediaItems, embeddings);

  // Group items by connected components using multi-signal graph
  const clusters: MediaItem[][] = [];
  const assignedMediaIds = new Set<string>();

  for (let i = 0; i < mediaItems.length; i++) {
    const itemA = mediaItems[i];
    if (assignedMediaIds.has(itemA.id)) continue;

    const currentCluster: MediaItem[] = [itemA];
    assignedMediaIds.add(itemA.id);

    const vecA = embeddings.get(itemA.id);

    for (let j = 0; j < mediaItems.length; j++) {
      if (i === j) continue;
      const itemB = mediaItems[j];
      if (assignedMediaIds.has(itemB.id)) continue;

      const vecB = embeddings.get(itemB.id);

      // 1. Visual Similarity
      const visualSim = vecA && vecB ? computeCosineSimilarity(vecA, vecB) : 0;

      // 2. Time Proximity
      let timeDiffMin: number | null = null;
      if (itemA.captureTime && itemB.captureTime) {
        const tA = new Date(itemA.captureTime).getTime();
        const tB = new Date(itemB.captureTime).getTime();
        timeDiffMin = Math.abs(tA - tB) / (1000 * 60);
      }

      // 3. Shared Folder
      const sameFolder = !!(
        itemA.driveParentFolderId &&
        itemB.driveParentFolderId &&
        itemA.driveParentFolderId === itemB.driveParentFolderId
      );

      // Rule: Similar appearance alone must NOT establish the same moment if times are far apart
      if (timeDiffMin !== null && timeDiffMin > 90) {
        // Different time windows cannot be the same moment
        continue;
      }

      // Rule: One moment, many cameras
      // Strong match: Close capture times (<45 min) + reasonable visual similarity (>=0.65) OR same folder (<30 min)
      const isMultiCameraMoment =
        (timeDiffMin !== null && timeDiffMin <= 45 && visualSim >= 0.65) ||
        (timeDiffMin !== null && timeDiffMin <= 30 && sameFolder) ||
        (visualSim >= 0.82 && timeDiffMin !== null && timeDiffMin <= 60);

      // Rule: Uncertain match (e.g. unknown date with high similarity or same folder)
      const isProvisionalMatch =
        timeDiffMin === null && (visualSim >= 0.80 || (sameFolder && visualSim >= 0.65));

      if (isMultiCameraMoment || isProvisionalMatch) {
        currentCluster.push(itemB);
        assignedMediaIds.add(itemB.id);
      }
    }

    clusters.push(currentCluster);
  }

  const generatedMoments: Moment[] = [...existingMoments];
  const generatedMemberships: Membership[] = [...existingMemberships];
  let provisionalCount = 0;

  // Build moments from clusters
  clusters.forEach((cluster, idx) => {
    // Check if cluster already represented by existing moment
    const existingMomentMatch = cluster.find((item) =>
      existingMemberships.some((m) => m.mediaId === item.id)
    );

    if (existingMomentMatch) {
      return; // Already part of a moment
    }

    const hasCaptureTimes = cluster.every((m) => m.captureTime !== null);
    const isProvisional = !hasCaptureTimes || cluster.some((m) => m.captureTimeSource === 'unknown');

    if (isProvisional) {
      provisionalCount++;
    }

    // Determine neutral descriptive title
    const firstTime = cluster.find((m) => m.captureTime)?.captureTime;
    let label = '';
    const reasons: string[] = [];

    if (cluster.length > 1) {
      reasons.push(`${cluster.length} multi-camera photos`);
    }

    if (firstTime) {
      const d = new Date(firstTime);
      const timeStr = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      label = `Moment at ${timeStr}`;
      reasons.push('Capture-time proximity (<45 min)');
    } else if (cluster[0].driveParentFolderId) {
      label = `${cluster[0].driveParentFolderId} Activity`;
      reasons.push('Shared folder context');
    } else {
      label = `Provisional Group #${idx + 1}`;
      reasons.push('Visual similarity cluster (Capture date unknown)');
    }

    if (isProvisional) {
      reasons.push('Provisional: Pending Admin confirmation');
    }

    const momentId = `ai_moment_${idx + 1}_${Date.now().toString(36)}`;
    const newMoment: Moment = {
      id: momentId,
      eventId,
      label,
      labelSource: 'ai_clustering',
      coverMediaId: cluster[0].id,
      description: `Discovered via multi-signal analysis (${reasons.join(', ')}).`,
      isProvisional,
      provisionalReasons: reasons,
      createdAt: new Date().toISOString(),
    };

    generatedMoments.push(newMoment);

    // Create memberships
    cluster.forEach((item) => {
      generatedMemberships.push({
        mediaId: item.id,
        momentId,
        source: 'ai_clustering',
        confidence: isProvisional ? 0.72 : 0.92,
      });
    });
  });

  // Generate inter-moment connections
  const connections: Connection[] = [];
  for (let m1 = 0; m1 < generatedMoments.length; m1++) {
    for (let m2 = m1 + 1; m2 < generatedMoments.length; m2++) {
      const momentA = generatedMoments[m1];
      const momentB = generatedMoments[m2];

      const mediaA = mediaItems.filter((item) =>
        generatedMemberships.some((m) => m.momentId === momentA.id && m.mediaId === item.id)
      );
      const mediaB = mediaItems.filter((item) =>
        generatedMemberships.some((m) => m.momentId === momentB.id && m.mediaId === item.id)
      );

      // Check average visual similarity between moments
      let totalSim = 0;
      let comparisons = 0;
      for (const itemA of mediaA.slice(0, 3)) {
        const vecA = embeddings.get(itemA.id);
        if (!vecA) continue;
        for (const itemB of mediaB.slice(0, 3)) {
          const vecB = embeddings.get(itemB.id);
          if (!vecB) continue;
          totalSim += computeCosineSimilarity(vecA, vecB);
          comparisons++;
        }
      }

      const avgSim = comparisons > 0 ? totalSim / comparisons : 0;

      // Temporal proximity between moments
      const timeA = mediaA.find((m) => m.captureTime)?.captureTime;
      const timeB = mediaB.find((m) => m.captureTime)?.captureTime;
      let hoursApart: number | null = null;
      if (timeA && timeB) {
        hoursApart = Math.abs(new Date(timeA).getTime() - new Date(timeB).getTime()) / (1000 * 3600);
      }

      if (hoursApart !== null && hoursApart <= 2) {
        connections.push({
          id: `conn_${momentA.id}_${momentB.id}`,
          sourceMomentId: momentA.id,
          targetMomentId: momentB.id,
          type: 'temporal',
          provenance: 'suggested',
          evidence: `Occurred ~${Math.round(hoursApart * 60)} minutes apart`,
          confidence: 0.88,
        });
      } else if (avgSim >= 0.70) {
        connections.push({
          id: `conn_${momentA.id}_${momentB.id}`,
          sourceMomentId: momentA.id,
          targetMomentId: momentB.id,
          type: 'related',
          provenance: 'ai-provisional',
          evidence: `Visual similarity match (${Math.round(avgSim * 100)}%) across distinct time windows`,
          confidence: Math.round(avgSim * 100) / 100,
        });
      }
    }
  }

  return {
    moments: generatedMoments,
    memberships: generatedMemberships,
    connections,
    nearDuplicates,
    provisionalCount,
  };
}
