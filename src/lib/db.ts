import { openDB, DBSchema, IDBPDatabase } from 'idb';
import {
  EventWorkspace,
  MediaItem,
  Moment,
  Membership,
  Connection,
  Visit,
  StorageEstimate,
  DriveConfig,
  VisitorSuggestion,
} from '../types';

interface MemoryFlowDB extends DBSchema {
  events: {
    key: string;
    value: EventWorkspace;
  };
  media: {
    key: string;
    value: MediaItem & { rawBlob?: Blob };
    indexes: {
      'by-hash': string;
      'by-event': string;
    };
  };
  moments: {
    key: string;
    value: Moment;
    indexes: {
      'by-event': string;
    };
  };
  memberships: {
    key: string; // composite key: `${mediaId}:${momentId}`
    value: Membership;
    indexes: {
      'by-moment': string;
      'by-media': string;
    };
  };
  connections: {
    key: string;
    value: Connection;
  };
  visits: {
    key: string;
    value: Visit;
  };
  app_meta: {
    key: string;
    value: { key: string; val: unknown };
  };
  drive_config: {
    key: string;
    value: import('../types').DriveConfig;
  };
  suggestions: {
    key: string;
    value: import('../types').VisitorSuggestion;
    indexes: {
      'by-status': string;
      'by-moment': string;
    };
  };
  embeddings: {
    key: string;
    value: {
      mediaId: string;
      vector: number[];
      model: string;
      updatedAt: string;
    };
  };
}

const DB_NAME = 'memoryflow_local_db';
const DB_VERSION = 2;

let dbPromise: Promise<IDBPDatabase<MemoryFlowDB>> | null = null;

export function getDB(): Promise<IDBPDatabase<MemoryFlowDB>> {
  if (!dbPromise) {
    dbPromise = openDB<MemoryFlowDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        // Events
        if (!db.objectStoreNames.contains('events')) {
          db.createObjectStore('events', { keyPath: 'id' });
        }

        // Media
        if (!db.objectStoreNames.contains('media')) {
          const mediaStore = db.createObjectStore('media', { keyPath: 'id' });
          mediaStore.createIndex('by-hash', 'hash');
          mediaStore.createIndex('by-event', 'eventId');
        }

        // Moments
        if (!db.objectStoreNames.contains('moments')) {
          const momentStore = db.createObjectStore('moments', { keyPath: 'id' });
          momentStore.createIndex('by-event', 'eventId');
        }

        // Memberships
        if (!db.objectStoreNames.contains('memberships')) {
          const memberStore = db.createObjectStore('memberships', {
            keyPath: 'compositeKey',
          });
          memberStore.createIndex('by-moment', 'momentId');
          memberStore.createIndex('by-media', 'mediaId');
        }

        // Connections
        if (!db.objectStoreNames.contains('connections')) {
          db.createObjectStore('connections', { keyPath: 'id' });
        }

        // Visits
        if (!db.objectStoreNames.contains('visits')) {
          db.createObjectStore('visits', { keyPath: 'momentId' });
        }

        // App Meta
        if (!db.objectStoreNames.contains('app_meta')) {
          db.createObjectStore('app_meta', { keyPath: 'key' });
        }

        // Version 2 additions: Drive, Suggestions, Embeddings
        if (!db.objectStoreNames.contains('drive_config')) {
          db.createObjectStore('drive_config', { keyPath: 'folderId' });
        }

        if (!db.objectStoreNames.contains('suggestions')) {
          const suggStore = db.createObjectStore('suggestions', { keyPath: 'id' });
          suggStore.createIndex('by-status', 'status');
          suggStore.createIndex('by-moment', 'targetMomentId');
        }

        if (!db.objectStoreNames.contains('embeddings')) {
          db.createObjectStore('embeddings', { keyPath: 'mediaId' });
        }
      },
    });
  }
  return dbPromise;
}

// Active in-memory Object URLs to clean up when revoked
const activeObjectUrls = new Map<string, string>();

export function getOrCreateMediaBlobUrl(id: string, blob: Blob): string {
  if (!activeObjectUrls.has(id)) {
    const url = URL.createObjectURL(blob);
    activeObjectUrls.set(id, url);
  }
  return activeObjectUrls.get(id)!;
}

export function revokeAllMediaBlobUrls(): void {
  for (const url of activeObjectUrls.values()) {
    URL.revokeObjectURL(url);
  }
  activeObjectUrls.clear();
}

// Repository Methods
export async function loadStoredEvent(): Promise<EventWorkspace | null> {
  const db = await getDB();
  const events = await db.getAll('events');
  return events.length > 0 ? events[0] : null;
}

export async function saveStoredEvent(event: EventWorkspace): Promise<void> {
  const db = await getDB();
  await db.put('events', event);
}

export async function loadAllStoredMedia(): Promise<MediaItem[]> {
  const db = await getDB();
  const rawItems = await db.getAll('media');

  return rawItems.map((item) => {
    let blobUrl = item.blobUrl;
    if (item.rawBlob && !blobUrl) {
      blobUrl = getOrCreateMediaBlobUrl(item.id, item.rawBlob);
    }
    return {
      ...item,
      blobUrl,
      mediaBlob: item.rawBlob,
    };
  });
}

export async function saveStoredMediaItem(item: MediaItem, blob?: Blob): Promise<void> {
  const db = await getDB();
  const rawBlob = blob || item.mediaBlob;
  const toSave = {
    ...item,
    rawBlob,
  };
  await db.put('media', toSave);
}

export async function findStoredMediaByHash(hash: string): Promise<MediaItem | null> {
  if (!hash) return null;
  const db = await getDB();
  const found = await db.getFromIndex('media', 'by-hash', hash);
  if (!found) return null;

  return {
    ...found,
    blobUrl: found.rawBlob ? getOrCreateMediaBlobUrl(found.id, found.rawBlob) : found.blobUrl,
    mediaBlob: found.rawBlob,
  };
}

export async function deleteStoredMediaItem(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('media', id);

  // Revoke URL if present
  if (activeObjectUrls.has(id)) {
    URL.revokeObjectURL(activeObjectUrls.get(id)!);
    activeObjectUrls.delete(id);
  }
}

export async function loadAllStoredMoments(): Promise<Moment[]> {
  const db = await getDB();
  return db.getAll('moments');
}

export async function saveStoredMoment(moment: Moment): Promise<void> {
  const db = await getDB();
  await db.put('moments', moment);
}

export async function deleteStoredMoment(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('moments', id);
}

export async function loadAllStoredMemberships(): Promise<Membership[]> {
  const db = await getDB();
  const raw = await db.getAll('memberships');
  return raw.map(({ mediaId, momentId, source, confidence }) => ({
    mediaId,
    momentId,
    source,
    confidence,
  }));
}

export async function saveStoredMembership(membership: Membership): Promise<void> {
  const db = await getDB();
  const compositeKey = `${membership.mediaId}:${membership.momentId}`;
  await db.put('memberships', {
    ...membership,
    compositeKey,
  } as unknown as Membership);
}

export async function deleteStoredMembership(mediaId: string, momentId: string): Promise<void> {
  const db = await getDB();
  const compositeKey = `${mediaId}:${momentId}`;
  await db.delete('memberships', compositeKey);
}

export async function loadAllStoredConnections(): Promise<Connection[]> {
  const db = await getDB();
  return db.getAll('connections');
}

export async function saveStoredConnection(conn: Connection): Promise<void> {
  const db = await getDB();
  await db.put('connections', conn);
}

export async function loadAllStoredVisits(): Promise<Record<string, Visit>> {
  const db = await getDB();
  const visits = await db.getAll('visits');
  const record: Record<string, Visit> = {};
  for (const v of visits) {
    record[v.momentId] = v;
  }
  return record;
}

export async function saveStoredVisit(visit: Visit): Promise<void> {
  const db = await getDB();
  await db.put('visits', visit);
}

// Clear all local persistent data
export async function clearAllLocalData(): Promise<void> {
  revokeAllMediaBlobUrls();
  const db = await getDB();
  const tx = db.transaction(
    [
      'events',
      'media',
      'moments',
      'memberships',
      'connections',
      'visits',
      'app_meta',
      'drive_config',
      'suggestions',
      'embeddings',
    ],
    'readwrite'
  );
  await Promise.all([
    tx.objectStore('events').clear(),
    tx.objectStore('media').clear(),
    tx.objectStore('moments').clear(),
    tx.objectStore('memberships').clear(),
    tx.objectStore('connections').clear(),
    tx.objectStore('visits').clear(),
    tx.objectStore('app_meta').clear(),
    tx.objectStore('drive_config').clear(),
    tx.objectStore('suggestions').clear(),
    tx.objectStore('embeddings').clear(),
    tx.done,
  ]);
}

// Storage Quota and Persistence estimation
export async function getStorageEstimate(): Promise<StorageEstimate> {
  if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.estimate) {
    try {
      const estimate = await navigator.storage.estimate();
      const usage = estimate.usage || 0;
      const quota = estimate.quota || 1;
      const percentage = Math.min(100, Math.round((usage / quota) * 100));
      const isPersisted = navigator.storage.persisted ? await navigator.storage.persisted() : false;

      return {
        usage,
        quota,
        percentage,
        isPersisted,
      };
    } catch {
      // Fallback
    }
  }

  return {
    usage: 0,
    quota: 1024 * 1024 * 1024,
    percentage: 0,
    isPersisted: false,
  };
}

export async function requestPersistentStorage(): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.persist) {
    try {
      return await navigator.storage.persist();
    } catch {
      return false;
    }
  }
  return false;
}

// Drive Configuration persistence
export async function saveDriveConfig(config: DriveConfig): Promise<void> {
  const db = await getDB();
  await db.put('drive_config', config);
}

export async function loadDriveConfig(): Promise<DriveConfig | null> {
  const db = await getDB();
  const configs = await db.getAll('drive_config');
  return configs.length > 0 ? configs[0] : null;
}

// Visitor Suggestions persistence
export async function saveSuggestion(suggestion: VisitorSuggestion): Promise<void> {
  const db = await getDB();
  await db.put('suggestions', suggestion);
}

export async function loadSuggestions(): Promise<VisitorSuggestion[]> {
  const db = await getDB();
  return db.getAll('suggestions');
}

export async function updateSuggestionStatus(
  id: string,
  status: 'approved' | 'rejected',
  reviewedBy: string
): Promise<void> {
  const db = await getDB();
  const suggestion = await db.get('suggestions', id);
  if (suggestion) {
    suggestion.status = status;
    suggestion.reviewedAt = new Date().toISOString();
    suggestion.reviewedBy = reviewedBy;
    await db.put('suggestions', suggestion);
  }
}

// Visual Embeddings persistence & caching
export async function saveEmbedding(
  mediaId: string,
  vector: number[],
  model = 'xenova-clip-vit-base-patch32'
): Promise<void> {
  const db = await getDB();
  await db.put('embeddings', {
    mediaId,
    vector,
    model,
    updatedAt: new Date().toISOString(),
  });
}

export async function loadEmbedding(mediaId: string): Promise<number[] | null> {
  const db = await getDB();
  const item = await db.get('embeddings', mediaId);
  return item ? item.vector : null;
}

export async function loadAllEmbeddings(): Promise<Map<string, number[]>> {
  const db = await getDB();
  const all = await db.getAll('embeddings');
  const map = new Map<string, number[]>();
  for (const item of all) {
    map.set(item.mediaId, item.vector);
  }
  return map;
}

let inMemoryAdminHash: string | null = null;

// Admin Passphrase Salted Hash storage
export async function getStoredAdminHash(): Promise<string | null> {
  if (typeof indexedDB === 'undefined') {
    return inMemoryAdminHash;
  }
  try {
    const db = await getDB();
    const entry = await db.get('app_meta', 'admin_pass_hash');
    return entry ? (entry.val as string) : inMemoryAdminHash;
  } catch {
    return inMemoryAdminHash;
  }
}

export async function setStoredAdminHash(hash: string): Promise<void> {
  inMemoryAdminHash = hash;
  if (typeof indexedDB !== 'undefined') {
    try {
      const db = await getDB();
      await db.put('app_meta', { key: 'admin_pass_hash', val: hash });
    } catch {
      // Memory fallback active
    }
  }
}

