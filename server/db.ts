import Database, { Database as DatabaseType } from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import {
  MediaItem,
  Moment,
  Membership,
  Connection,
  VisitorSuggestion,
  Place,
  ActivityTag,
  MediaContribution,
  SharedCollectionInfo,
  CollectionVisibility,
} from '../src/types';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const DB_PATH = path.join(DATA_DIR, 'memoryflow.db');
const LEGACY_JSON_PATH = path.join(DATA_DIR, 'server_collection.json');
const UPLOADS_DIR = path.resolve(process.cwd(), 'uploads');
const PENDING_UPLOADS_DIR = path.join(UPLOADS_DIR, 'pending');

// Ensure directories exist
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
if (!fs.existsSync(PENDING_UPLOADS_DIR)) {
  fs.mkdirSync(PENDING_UPLOADS_DIR, { recursive: true });
}

let dbInstance: DatabaseType | null = null;

export function getDb(): DatabaseType {
  if (dbInstance) return dbInstance;

  dbInstance = new Database(DB_PATH);
  dbInstance.pragma('journal_mode = WAL');
  dbInstance.pragma('foreign_keys = ON');

  runMigrations(dbInstance);
  migrateFromLegacyJsonIfEmpty(dbInstance);

  return dbInstance;
}

/**
 * Executes schema migrations
 */
function runMigrations(db: DatabaseType): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS collections (
      id TEXT PRIMARY KEY,
      slug TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      drive_folder_id TEXT,
      visibility TEXT NOT NULL DEFAULT 'public',
      password_hash TEXT,
      password_salt TEXT,
      password_hint TEXT,
      access_epoch INTEGER NOT NULL DEFAULT 1,
      people_grouping_enabled INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS admin_auth (
      id TEXT PRIMARY KEY,
      password_hash TEXT NOT NULL,
      password_salt TEXT NOT NULL,
      iterations INTEGER NOT NULL DEFAULT 100000,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS admin_sessions (
      token TEXT PRIMARY KEY,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS rate_limits (
      ip TEXT PRIMARY KEY,
      failed_attempts INTEGER NOT NULL DEFAULT 0,
      reset_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS media_items (
      id TEXT PRIMARY KEY,
      collection_slug TEXT NOT NULL,
      original_name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      size INTEGER NOT NULL,
      width INTEGER,
      height INTEGER,
      duration REAL,
      capture_time TEXT,
      capture_time_source TEXT,
      timezone_known INTEGER,
      drive_file_id TEXT,
      thumbnail_url TEXT,
      low_res_url TEXT,
      drive_full_url TEXT,
      drive_parent_folder_id TEXT,
      caption TEXT,
      contributor_name TEXT,
      contributor_verified INTEGER DEFAULT 0,
      is_damaged INTEGER DEFAULT 0,
      damage_notes TEXT,
      imported_at TEXT NOT NULL,
      file_modified_at TEXT,
      processing_status TEXT NOT NULL DEFAULT 'ready',
      hash TEXT,
      duplicate_group_id TEXT,
      near_duplicate_of_id TEXT,
      near_duplicate_similarity REAL,
      embedding_status TEXT DEFAULT 'pending',
      FOREIGN KEY (collection_slug) REFERENCES collections(slug) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_media_collection ON media_items(collection_slug);
    CREATE INDEX IF NOT EXISTS idx_media_capture_time ON media_items(capture_time);

    CREATE TABLE IF NOT EXISTS moments (
      id TEXT PRIMARY KEY,
      collection_slug TEXT NOT NULL,
      label TEXT NOT NULL,
      label_source TEXT NOT NULL,
      cover_media_id TEXT,
      description TEXT,
      is_provisional INTEGER DEFAULT 0,
      provisional_reasons TEXT, -- JSON array
      created_at TEXT NOT NULL,
      FOREIGN KEY (collection_slug) REFERENCES collections(slug) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_moments_collection ON moments(collection_slug);

    CREATE TABLE IF NOT EXISTS memberships (
      media_id TEXT NOT NULL,
      moment_id TEXT NOT NULL,
      source TEXT NOT NULL,
      confidence REAL,
      PRIMARY KEY (media_id, moment_id),
      FOREIGN KEY (media_id) REFERENCES media_items(id) ON DELETE CASCADE,
      FOREIGN KEY (moment_id) REFERENCES moments(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS connections (
      id TEXT PRIMARY KEY,
      collection_slug TEXT NOT NULL,
      source_moment_id TEXT NOT NULL,
      target_moment_id TEXT NOT NULL,
      type TEXT NOT NULL,
      provenance TEXT NOT NULL,
      evidence TEXT,
      confidence REAL,
      FOREIGN KEY (collection_slug) REFERENCES collections(slug) ON DELETE CASCADE,
      FOREIGN KEY (source_moment_id) REFERENCES moments(id) ON DELETE CASCADE,
      FOREIGN KEY (target_moment_id) REFERENCES moments(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS places (
      id TEXT PRIMARY KEY,
      collection_slug TEXT NOT NULL,
      name TEXT NOT NULL,
      label_source TEXT NOT NULL DEFAULT 'ai_suggested',
      is_confirmed INTEGER NOT NULL DEFAULT 0,
      cover_media_id TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (collection_slug) REFERENCES collections(slug) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS media_places (
      media_id TEXT NOT NULL,
      place_id TEXT NOT NULL,
      confidence REAL DEFAULT 1.0,
      is_confirmed INTEGER DEFAULT 0,
      PRIMARY KEY (media_id, place_id),
      FOREIGN KEY (media_id) REFERENCES media_items(id) ON DELETE CASCADE,
      FOREIGN KEY (place_id) REFERENCES places(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS activity_tags (
      id TEXT PRIMARY KEY,
      name TEXT UNIQUE NOT NULL
    );

    CREATE TABLE IF NOT EXISTS media_activities (
      media_id TEXT NOT NULL,
      activity_name TEXT NOT NULL,
      confidence REAL NOT NULL,
      is_confirmed INTEGER NOT NULL DEFAULT 0,
      model_info TEXT,
      PRIMARY KEY (media_id, activity_name),
      FOREIGN KEY (media_id) REFERENCES media_items(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS people_groups (
      id TEXT PRIMARY KEY,
      collection_slug TEXT NOT NULL,
      label TEXT NOT NULL, -- e.g. "Person Group A"
      is_confirmed INTEGER NOT NULL DEFAULT 0,
      consented INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      FOREIGN KEY (collection_slug) REFERENCES collections(slug) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS media_people (
      media_id TEXT NOT NULL,
      person_group_id TEXT NOT NULL,
      is_confirmed INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (media_id, person_group_id),
      FOREIGN KEY (media_id) REFERENCES media_items(id) ON DELETE CASCADE,
      FOREIGN KEY (person_group_id) REFERENCES people_groups(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS embeddings (
      media_id TEXT NOT NULL,
      model_name TEXT NOT NULL,
      vector_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (media_id, model_name),
      FOREIGN KEY (media_id) REFERENCES media_items(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS visitor_suggestions (
      id TEXT PRIMARY KEY,
      collection_slug TEXT NOT NULL,
      visitor_name TEXT NOT NULL,
      media_id TEXT NOT NULL,
      target_moment_id TEXT NOT NULL,
      action TEXT NOT NULL,
      note TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL,
      reviewed_at TEXT,
      reviewed_by TEXT,
      FOREIGN KEY (collection_slug) REFERENCES collections(slug) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS media_contributions (
      id TEXT PRIMARY KEY,
      collection_slug TEXT NOT NULL,
      contributor_name TEXT NOT NULL,
      original_name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      size INTEGER NOT NULL,
      storage_path TEXT NOT NULL,
      target_moment_id TEXT,
      notes TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      submitted_at TEXT NOT NULL,
      reviewed_at TEXT,
      FOREIGN KEY (collection_slug) REFERENCES collections(slug) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS indexing_cache (
      file_id TEXT NOT NULL,
      checksum TEXT NOT NULL,
      model_name TEXT NOT NULL,
      processed_at TEXT NOT NULL,
      PRIMARY KEY (file_id, model_name)
    );
  `);
}

/**
 * Migrates data from legacy server_collection.json if SQLite database has no collections
 */
function migrateFromLegacyJsonIfEmpty(db: DatabaseType): void {
  const countRow = db.prepare('SELECT COUNT(*) as count FROM collections').get() as { count: number };
  if (countRow.count > 0) return;

  if (!fs.existsSync(LEGACY_JSON_PATH)) {
    // Initialize default ELEVATE 1.0 collection
    db.prepare(`
      INSERT INTO collections (id, slug, name, description, drive_folder_id, visibility, access_epoch, people_grouping_enabled, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 1, 0, ?, ?)
    `).run(
      'elevate-1.0',
      'elevate',
      'ELEVATE 1.0',
      'Official ELEVATE 1.0 Event Collection',
      'simulated_drive_elevate_2026',
      'public',
      new Date().toISOString(),
      new Date().toISOString()
    );
    return;
  }

  try {
    const raw = fs.readFileSync(LEGACY_JSON_PATH, 'utf8');
    const legacyData = JSON.parse(raw);
    const col = legacyData.collection || {
      id: 'elevate-1.0',
      slug: 'elevate',
      name: 'ELEVATE 1.0',
      description: 'Official ELEVATE 1.0 Event Collection',
      visibility: 'public',
      accessEpoch: 1,
    };

    const insertCol = db.prepare(`
      INSERT OR REPLACE INTO collections (id, slug, name, description, drive_folder_id, visibility, password_hash, password_salt, password_hint, access_epoch, people_grouping_enabled, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
    `);

    insertCol.run(
      col.id || 'elevate-1.0',
      col.slug || 'elevate',
      col.name || 'ELEVATE 1.0',
      col.description || '',
      col.driveFolderId || null,
      col.visibility || 'public',
      col.passwordHash || null,
      col.passwordSalt || null,
      col.passwordHint || null,
      col.accessEpoch || 1,
      col.createdAt || new Date().toISOString(),
      col.updatedAt || new Date().toISOString()
    );

    const slug = col.slug || 'elevate';

    // Insert media items in transaction
    const insertMedia = db.prepare(`
      INSERT OR REPLACE INTO media_items (
        id, collection_slug, original_name, mime_type, size, width, height, duration,
        capture_time, capture_time_source, timezone_known, drive_file_id, thumbnail_url,
        low_res_url, drive_full_url, drive_parent_folder_id, caption, contributor_name,
        contributor_verified, is_damaged, damage_notes, imported_at, file_modified_at,
        processing_status, hash, duplicate_group_id, near_duplicate_of_id, near_duplicate_similarity, embedding_status
      ) VALUES (
        @id, @collection_slug, @original_name, @mime_type, @size, @width, @height, @duration,
        @capture_time, @capture_time_source, @timezone_known, @drive_file_id, @thumbnail_url,
        @low_res_url, @drive_full_url, @drive_parent_folder_id, @caption, @contributor_name,
        @contributor_verified, @is_damaged, @damage_notes, @imported_at, @file_modified_at,
        @processing_status, @hash, @duplicate_group_id, @near_duplicate_of_id, @near_duplicate_similarity, @embedding_status
      )
    `);

    const insertManyMedia = db.transaction((items: any[]) => {
      for (const item of items) {
        insertMedia.run({
          id: item.id,
          collection_slug: slug,
          original_name: item.originalName,
          mime_type: item.mimeType || 'image/jpeg',
          size: item.size || 0,
          width: item.width || null,
          height: item.height || null,
          duration: item.duration || null,
          capture_time: item.captureTime || null,
          capture_time_source: item.captureTimeSource || 'unknown',
          timezone_known: item.timezoneKnown ? 1 : 0,
          drive_file_id: item.driveFileId || null,
          thumbnail_url: item.thumbnailUrl || '',
          low_res_url: item.lowResUrl || item.thumbnailUrl || '',
          drive_full_url: item.driveFullUrl || null,
          drive_parent_folder_id: item.driveParentFolderId || null,
          caption: item.caption || null,
          contributor_name: item.contributorName || null,
          contributor_verified: item.contributorVerified ? 1 : 0,
          is_damaged: item.isDamaged ? 1 : 0,
          damage_notes: item.damageNotes || null,
          imported_at: item.importedAt || new Date().toISOString(),
          file_modified_at: item.fileModifiedAt || null,
          processing_status: item.processingStatus || 'ready',
          hash: item.hash || null,
          duplicate_group_id: item.duplicateGroupId || null,
          near_duplicate_of_id: item.nearDuplicateOfId || null,
          near_duplicate_similarity: item.nearDuplicateSimilarity || null,
          embedding_status: item.embeddingStatus || 'pending',
        });
      }
    });

    if (Array.isArray(legacyData.mediaItems)) {
      insertManyMedia(legacyData.mediaItems);
    }

    // Insert moments
    const insertMoment = db.prepare(`
      INSERT OR REPLACE INTO moments (id, collection_slug, label, label_source, cover_media_id, description, is_provisional, provisional_reasons, created_at)
      VALUES (@id, @collection_slug, @label, @label_source, @cover_media_id, @description, @is_provisional, @provisional_reasons, @created_at)
    `);

    const insertManyMoments = db.transaction((moments: any[]) => {
      for (const m of moments) {
        insertMoment.run({
          id: m.id,
          collection_slug: slug,
          label: m.label,
          label_source: m.labelSource || 'organizer',
          cover_media_id: m.coverMediaId || null,
          description: m.description || null,
          is_provisional: m.isProvisional ? 1 : 0,
          provisional_reasons: JSON.stringify(m.provisionalReasons || []),
          created_at: m.createdAt || new Date().toISOString(),
        });
      }
    });

    if (Array.isArray(legacyData.moments)) {
      insertManyMoments(legacyData.moments);
    }

    // Insert memberships
    const insertMembership = db.prepare(`
      INSERT OR REPLACE INTO memberships (media_id, moment_id, source, confidence)
      VALUES (@media_id, @moment_id, @source, @confidence)
    `);
    if (Array.isArray(legacyData.memberships)) {
      const insertManyMemberships = db.transaction((mems: any[]) => {
        for (const m of mems) {
          insertMembership.run({
            media_id: m.mediaId,
            moment_id: m.momentId,
            source: m.source || 'manual',
            confidence: m.confidence || 1.0,
          });
        }
      });
      insertManyMemberships(legacyData.memberships);
    }

    // Insert connections
    const insertConnection = db.prepare(`
      INSERT OR REPLACE INTO connections (id, collection_slug, source_moment_id, target_moment_id, type, provenance, evidence, confidence)
      VALUES (@id, @collection_slug, @source_moment_id, @target_moment_id, @type, @provenance, @evidence, @confidence)
    `);
    if (Array.isArray(legacyData.connections)) {
      const insertManyConnections = db.transaction((conns: any[]) => {
        for (const c of conns) {
          insertConnection.run({
            id: c.id,
            collection_slug: slug,
            source_moment_id: c.sourceMomentId,
            target_moment_id: c.targetMomentId,
            type: c.type || 'related',
            provenance: c.provenance || 'suggested',
            evidence: c.evidence || null,
            confidence: c.confidence || null,
          });
        }
      });
      insertManyConnections(legacyData.connections);
    }

    // Insert suggestions
    const insertSuggestion = db.prepare(`
      INSERT OR REPLACE INTO visitor_suggestions (id, collection_slug, visitor_name, media_id, target_moment_id, action, note, status, created_at, reviewed_at, reviewed_by)
      VALUES (@id, @collection_slug, @visitor_name, @media_id, @target_moment_id, @action, @note, @status, @created_at, @reviewed_at, @reviewed_by)
    `);
    if (Array.isArray(legacyData.suggestions)) {
      const insertManySuggestions = db.transaction((suggs: any[]) => {
        for (const s of suggs) {
          insertSuggestion.run({
            id: s.id,
            collection_slug: slug,
            visitor_name: s.visitorName,
            media_id: s.mediaId,
            target_moment_id: s.targetMomentId,
            action: s.action || 'add_to_moment',
            note: s.note || null,
            status: s.status || 'pending',
            created_at: s.createdAt || new Date().toISOString(),
            reviewed_at: s.reviewedAt || null,
            reviewed_by: s.reviewedBy || null,
          });
        }
      });
      insertManySuggestions(legacyData.suggestions);
    }

    console.log(`[SQLite Migration] Successfully migrated ${legacyData.mediaItems?.length || 0} items from server_collection.json to memoryflow.db`);
  } catch (err) {
    console.error('[SQLite Migration] Error migrating from legacy JSON:', err);
  }
}

/**
 * Backup SQLite database to a destination file (or default timestamped snapshot in data/backups)
 */
export async function backupDatabase(destPath?: string): Promise<string> {
  const db = getDb();
  const backupDir = path.join(DATA_DIR, 'backups');
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const targetPath = destPath || path.join(backupDir, `memoryflow_backup_${timestamp}.db`);
  await db.backup(targetPath);
  return targetPath;
}

/**
 * Database access helpers
 */
export function getCollectionBySlug(slug: string = 'elevate'): any | null {
  const db = getDb();
  return db.prepare('SELECT * FROM collections WHERE slug = ?').get(slug);
}

export function getAllMediaForCollection(slug: string = 'elevate'): MediaItem[] {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM media_items WHERE collection_slug = ?').all(slug) as any[];

  // Fetch places and activities per item
  const placeStmt = db.prepare(`
    SELECT p.name FROM media_places mp
    JOIN places p ON mp.place_id = p.id
    WHERE mp.media_id = ?
  `);
  const actStmt = db.prepare('SELECT activity_name FROM media_activities WHERE media_id = ?');

  return rows.map((r) => {
    const places = (placeStmt.all(r.id) as any[]).map((p) => p.name);
    const activities = (actStmt.all(r.id) as any[]).map((a) => a.activity_name);

    return {
      id: r.id,
      eventId: r.collection_slug,
      originalName: r.original_name,
      mimeType: r.mime_type,
      size: r.size,
      width: r.width,
      height: r.height,
      duration: r.duration,
      captureTime: r.capture_time,
      captureTimeSource: r.capture_time_source,
      timezoneKnown: r.timezone_known === 1,
      importedAt: r.imported_at,
      fileModifiedAt: r.file_modified_at,
      processingStatus: r.processing_status,
      hash: r.hash,
      duplicateGroupId: r.duplicate_group_id,
      thumbnailUrl: r.thumbnail_url,
      lowResUrl: r.low_res_url,
      driveFileId: r.drive_file_id,
      driveFullUrl: r.drive_full_url,
      driveParentFolderId: r.drive_parent_folder_id,
      caption: r.caption,
      contributorName: r.contributor_name,
      contributorVerified: r.contributor_verified === 1,
      isDamaged: r.is_damaged === 1,
      damageNotes: r.damage_notes,
      places: places.length > 0 ? places : undefined,
      activities: activities.length > 0 ? activities : undefined,
      nearDuplicateOfId: r.near_duplicate_of_id,
      nearDuplicateSimilarity: r.near_duplicate_similarity,
      embeddingStatus: r.embedding_status,
    };
  });
}

export function getAllMomentsForCollection(slug: string = 'elevate'): Moment[] {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM moments WHERE collection_slug = ?').all(slug) as any[];
  return rows.map((r) => ({
    id: r.id,
    eventId: r.collection_slug,
    label: r.label,
    labelSource: r.label_source,
    coverMediaId: r.cover_media_id,
    description: r.description,
    isProvisional: r.is_provisional === 1,
    provisionalReasons: r.provisional_reasons ? JSON.parse(r.provisional_reasons) : [],
    createdAt: r.created_at,
  }));
}

export function getAllMembershipsForCollection(slug: string = 'elevate'): Membership[] {
  const db = getDb();
  const rows = db.prepare(`
    SELECT m.media_id, m.moment_id, m.source, m.confidence
    FROM memberships m
    JOIN moments mo ON m.moment_id = mo.id
    WHERE mo.collection_slug = ?
  `).all(slug) as any[];

  return rows.map((r) => ({
    mediaId: r.media_id,
    momentId: r.moment_id,
    source: r.source,
    confidence: r.confidence,
  }));
}

export function getAllConnectionsForCollection(slug: string = 'elevate'): Connection[] {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM connections WHERE collection_slug = ?').all(slug) as any[];
  return rows.map((r) => ({
    id: r.id,
    sourceMomentId: r.source_moment_id,
    targetMomentId: r.target_moment_id,
    type: r.type,
    provenance: r.provenance,
    evidence: r.evidence,
    confidence: r.confidence,
  }));
}

export function getAllPlacesForCollection(slug: string = 'elevate'): Place[] {
  const db = getDb();
  const rows = db.prepare(`
    SELECT p.*, COUNT(mp.media_id) as media_count
    FROM places p
    LEFT JOIN media_places mp ON p.id = mp.place_id
    WHERE p.collection_slug = ?
    GROUP BY p.id
  `).all(slug) as any[];

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    labelSource: r.label_source,
    isConfirmed: r.is_confirmed === 1,
    coverMediaId: r.cover_media_id,
    mediaCount: r.media_count,
  }));
}

export function getAllSuggestionsForCollection(slug: string = 'elevate'): VisitorSuggestion[] {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM visitor_suggestions WHERE collection_slug = ?').all(slug) as any[];
  return rows.map((r) => ({
    id: r.id,
    visitorName: r.visitor_name,
    createdAt: r.created_at,
    mediaId: r.media_id,
    targetMomentId: r.target_moment_id,
    action: r.action,
    note: r.note,
    status: r.status,
    reviewedAt: r.reviewed_at,
    reviewedBy: r.reviewed_by,
  }));
}

export function getAllContributionsForCollection(slug: string = 'elevate'): MediaContribution[] {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM media_contributions WHERE collection_slug = ?').all(slug) as any[];
  return rows.map((r) => ({
    id: r.id,
    collectionSlug: r.collection_slug,
    contributorName: r.contributor_name,
    originalName: r.original_name,
    mimeType: r.mime_type,
    size: r.size,
    storagePath: r.storage_path,
    targetMomentId: r.target_moment_id,
    notes: r.notes,
    status: r.status,
    submittedAt: r.submitted_at,
    reviewedAt: r.reviewed_at,
  }));
}

/**
 * Closes active database connection (used for testing or clean restarts)
 */
export function closeDatabase(): void {
  if (dbInstance) {
    try {
      dbInstance.close();
    } catch {
      // Ignore if already closed
    }
    dbInstance = null;
  }
}
