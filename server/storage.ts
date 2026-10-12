import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {
  MediaItem,
  Moment,
  Membership,
  Connection,
  VisitorSuggestion,
  Place,
  ActivityTag,
  PersonGroup,
  MediaContribution,
  SharedCollectionInfo,
} from '../src/types';
import {
  getDb,
  getCollectionBySlug,
  getAllMediaForCollection,
  getAllMomentsForCollection,
  getAllMembershipsForCollection,
  getAllConnectionsForCollection,
  getAllPlacesForCollection,
  getAllSuggestionsForCollection,
  getAllContributionsForCollection,
} from './db';

export type CollectionVisibility = 'public' | 'unlisted' | 'password';

export interface ServerCollection {
  id: string;
  name: string;
  slug: string;
  description: string;
  driveFolderId: string | null;
  visibility: CollectionVisibility;
  passwordHash: string | null;
  passwordSalt: string | null;
  passwordHint: string | null;
  accessEpoch: number;
  peopleGroupingEnabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CollectionDataStore {
  collection: ServerCollection;
  moments: Moment[];
  mediaItems: MediaItem[];
  memberships: Membership[];
  connections: Connection[];
  places: Place[];
  suggestions: VisitorSuggestion[];
  contributions: MediaContribution[];
  approvedCorrections: any[];
}

const DATA_DIR = path.resolve(process.cwd(), 'data');
const DATA_FILE = path.join(DATA_DIR, 'server_collection.json');

const SERVER_SECRET = process.env.SERVER_SECRET || crypto.randomBytes(32).toString('hex');

// Rate limiting in-memory store: IP -> { failedAttempts: number, resetAt: number }
interface RateLimitRecord {
  failedAttempts: number;
  resetAt: number;
}
const rateLimitMap = new Map<string, RateLimitRecord>();
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000; // 15 minutes

export function checkRateLimit(ip: string): { allowed: boolean; remaining: number; retryAfterSec?: number } {
  const now = Date.now();
  const record = rateLimitMap.get(ip);

  if (!record || now > record.resetAt) {
    return { allowed: true, remaining: MAX_ATTEMPTS };
  }

  if (record.failedAttempts >= MAX_ATTEMPTS) {
    const retryAfterSec = Math.ceil((record.resetAt - now) / 1000);
    return { allowed: false, remaining: 0, retryAfterSec };
  }

  return { allowed: true, remaining: MAX_ATTEMPTS - record.failedAttempts };
}

export function recordFailedAttempt(ip: string): void {
  const now = Date.now();
  const record = rateLimitMap.get(ip);
  if (!record || now > record.resetAt) {
    rateLimitMap.set(ip, { failedAttempts: 1, resetAt: now + WINDOW_MS });
  } else {
    record.failedAttempts++;
  }
}

export function clearFailedAttempts(ip: string): void {
  rateLimitMap.delete(ip);
}

/**
 * Current OWASP Recommended Hashing: 100,000 rounds PBKDF2 SHA-512
 */
export function hashCollectionPassword(password: string, salt: string): string {
  return crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
}

/**
 * Timing-safe password verification preventing timing side-channel attacks
 */
export function verifyPassword(password: string, salt: string, expectedHash: string): boolean {
  const computed = hashCollectionPassword(password, salt);
  const bufA = Buffer.from(computed, 'hex');
  const bufB = Buffer.from(expectedHash, 'hex');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Admin Authentication & Session Management
 */
export function getAdminAuthStatus(): { isConfigured: boolean } {
  const db = getDb();
  const row = db.prepare('SELECT COUNT(*) as count FROM admin_auth').get() as { count: number };
  if (row.count > 0) return { isConfigured: true };
  if (process.env.ADMIN_PASSPHRASE) return { isConfigured: true };
  return { isConfigured: false };
}

export function setupAdminPassphrase(passphrase: string): { success: boolean } {
  const db = getDb();
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = hashCollectionPassword(passphrase, salt);
  const now = new Date().toISOString();

  db.prepare(`
    INSERT OR REPLACE INTO admin_auth (id, password_hash, password_salt, iterations, created_at, updated_at)
    VALUES ('root', ?, ?, 100000, ?, ?)
  `).run(hash, salt, now, now);

  return { success: true };
}

export function verifyAdminPassphrase(passphrase: string): boolean {
  const db = getDb();
  const row = db.prepare('SELECT * FROM admin_auth WHERE id = ?').get('root') as any;

  if (row) {
    return verifyPassword(passphrase, row.password_salt, row.password_hash);
  }

  // Fallback to environment variable if configured
  if (process.env.ADMIN_PASSPHRASE) {
    const expected = process.env.ADMIN_PASSPHRASE;
    return passphrase === expected;
  }

  // If uninitialized, check default for initial setup only
  return passphrase === 'admin123';
}

export function createAdminSession(): string {
  const db = getDb();
  const token = crypto.randomBytes(32).toString('hex');
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // 24 hours

  db.prepare(`
    INSERT INTO admin_sessions (token, created_at, expires_at)
    VALUES (?, ?, ?)
  `).run(token, now, expiresAt);

  return token;
}

export function verifyAdminSession(token: string | null | undefined): boolean {
  if (!token) return false;
  const db = getDb();
  const row = db.prepare('SELECT * FROM admin_sessions WHERE token = ?').get(token) as any;
  if (!row) return false;

  if (new Date(row.expires_at).getTime() < Date.now()) {
    db.prepare('DELETE FROM admin_sessions WHERE token = ?').run(token);
    return false;
  }
  return true;
}

export function revokeAdminSession(token: string): void {
  const db = getDb();
  db.prepare('DELETE FROM admin_sessions WHERE token = ?').run(token);
}

/**
 * Visitor Tokens with HMAC and Access Epoch Invalidation
 */
export function createVisitorToken(collectionSlug: string, accessEpoch: number): string {
  const payload = JSON.stringify({
    slug: collectionSlug,
    epoch: accessEpoch,
    exp: Date.now() + 12 * 60 * 60 * 1000, // 12 hours
  });
  const b64Payload = Buffer.from(payload).toString('base64url');
  const signature = crypto.createHmac('sha256', SERVER_SECRET).update(b64Payload).digest('base64url');
  return `${b64Payload}.${signature}`;
}

export function verifyVisitorToken(token: string, expectedSlug: string, currentEpoch: number): boolean {
  try {
    const [b64Payload, signature] = token.split('.');
    if (!b64Payload || !signature) return false;

    const expectedSig = crypto.createHmac('sha256', SERVER_SECRET).update(b64Payload).digest('base64url');
    if (signature !== expectedSig) return false;

    const payload = JSON.parse(Buffer.from(b64Payload, 'base64url').toString('utf8'));
    if (payload.slug !== expectedSlug) return false;
    if (payload.epoch !== currentEpoch) return false;
    if (Date.now() > payload.exp) return false;

    return true;
  } catch {
    return false;
  }
}

/**
 * Data loading using SQLite backend
 */
export function loadServerData(slug: string = 'elevate'): CollectionDataStore {
  const colRow = getCollectionBySlug(slug) || {
    id: 'elevate-1.0',
    slug: 'elevate',
    name: 'ELEVATE 1.0',
    description: 'Official ELEVATE 1.0 Event Collection',
    drive_folder_id: 'simulated_drive_elevate_2026',
    visibility: 'public',
    password_hash: null,
    password_salt: null,
    password_hint: null,
    access_epoch: 1,
    people_grouping_enabled: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const collection: ServerCollection = {
    id: colRow.id,
    name: colRow.name,
    slug: colRow.slug,
    description: colRow.description || '',
    driveFolderId: colRow.drive_folder_id,
    visibility: colRow.visibility as CollectionVisibility,
    passwordHash: colRow.password_hash,
    passwordSalt: colRow.password_salt,
    passwordHint: colRow.password_hint,
    accessEpoch: colRow.access_epoch,
    peopleGroupingEnabled: colRow.people_grouping_enabled === 1,
    createdAt: colRow.created_at,
    updatedAt: colRow.updated_at,
  };

  const mediaItems = getAllMediaForCollection(slug);
  const moments = getAllMomentsForCollection(slug);
  const memberships = getAllMembershipsForCollection(slug);
  const connections = getAllConnectionsForCollection(slug);
  const places = getAllPlacesForCollection(slug);
  const suggestions = getAllSuggestionsForCollection(slug);
  const contributions = getAllContributionsForCollection(slug);

  return {
    collection,
    mediaItems,
    moments,
    memberships,
    connections,
    places,
    suggestions,
    contributions,
    approvedCorrections: [],
  };
}

/**
 * Sync / Save data to SQLite and mirror to JSON backup
 */
export function saveServerData(data: CollectionDataStore): void {
  const db = getDb();
  const slug = data.collection.slug || 'elevate';
  const now = new Date().toISOString();

  db.prepare(`
    INSERT OR REPLACE INTO collections (
      id, slug, name, description, drive_folder_id, visibility, password_hash, password_salt, password_hint, access_epoch, people_grouping_enabled, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    data.collection.id,
    slug,
    data.collection.name,
    data.collection.description,
    data.collection.driveFolderId,
    data.collection.visibility,
    data.collection.passwordHash,
    data.collection.passwordSalt,
    data.collection.passwordHint,
    data.collection.accessEpoch,
    data.collection.peopleGroupingEnabled ? 1 : 0,
    data.collection.createdAt,
    now
  );

  // Mirror JSON backup
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.error('Failed to write JSON backup:', err);
  }
}

/**
 * Places Management
 */
export function createOrUpdatePlace(slug: string, name: string, isConfirmed: boolean = true): Place {
  const db = getDb();
  const existing = db.prepare('SELECT * FROM places WHERE collection_slug = ? AND name = ?').get(slug, name) as any;

  if (existing) {
    db.prepare('UPDATE places SET is_confirmed = ? WHERE id = ?').run(isConfirmed ? 1 : 0, existing.id);
    return {
      id: existing.id,
      name: existing.name,
      labelSource: existing.label_source,
      isConfirmed: isConfirmed || existing.is_confirmed === 1,
      coverMediaId: existing.cover_media_id,
    };
  }

  const id = `place_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  db.prepare(`
    INSERT INTO places (id, collection_slug, name, label_source, is_confirmed, created_at)
    VALUES (?, ?, ?, 'organizer', ?, ?)
  `).run(id, slug, name, isConfirmed ? 1 : 0, new Date().toISOString());

  return {
    id,
    name,
    labelSource: 'organizer',
    isConfirmed,
  };
}

export function renamePlace(slug: string, placeId: string, newName: string): boolean {
  const db = getDb();
  const res = db.prepare('UPDATE places SET name = ?, is_confirmed = 1 WHERE id = ? AND collection_slug = ?').run(newName, placeId, slug);
  return res.changes > 0;
}

export function mergePlaces(slug: string, sourcePlaceId: string, targetPlaceId: string): boolean {
  const db = getDb();
  const tx = db.transaction(() => {
    // Re-link all media items from source to target
    db.prepare(`
      INSERT OR IGNORE INTO media_places (media_id, place_id, confidence, is_confirmed)
      SELECT media_id, ?, confidence, is_confirmed FROM media_places WHERE place_id = ?
    `).run(targetPlaceId, sourcePlaceId);

    db.prepare('DELETE FROM media_places WHERE place_id = ?').run(sourcePlaceId);
    db.prepare('DELETE FROM places WHERE id = ? AND collection_slug = ?').run(sourcePlaceId, slug);
  });
  tx();
  return true;
}

export function assignMediaToPlace(mediaId: string, placeId: string, isConfirmed: boolean = true): void {
  const db = getDb();
  db.prepare(`
    INSERT OR REPLACE INTO media_places (media_id, place_id, confidence, is_confirmed)
    VALUES (?, ?, 1.0, ?)
  `).run(mediaId, placeId, isConfirmed ? 1 : 0);
}

/**
 * Activity Tagging
 */
export function assignMediaActivity(mediaId: string, activityName: string, confidence: number, isConfirmed: boolean = false, modelInfo?: string): void {
  const db = getDb();
  db.prepare(`
    INSERT OR REPLACE INTO media_activities (media_id, activity_name, confidence, is_confirmed, model_info)
    VALUES (?, ?, ?, ?, ?)
  `).run(mediaId, activityName, confidence, isConfirmed ? 1 : 0, modelInfo || null);
}

/**
 * People Grouping
 */
export function togglePeopleGrouping(slug: string, enabled: boolean): void {
  const db = getDb();
  db.prepare('UPDATE collections SET people_grouping_enabled = ? WHERE slug = ?').run(enabled ? 1 : 0, slug);
}

/**
 * Contributions Management
 */
export function createMediaContribution(
  slug: string,
  contributorName: string,
  originalName: string,
  mimeType: string,
  size: number,
  storagePath: string,
  notes?: string,
  targetMomentId?: string
): MediaContribution {
  const db = getDb();
  const id = `contrib_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO media_contributions (
      id, collection_slug, contributor_name, original_name, mime_type, size, storage_path, target_moment_id, notes, status, submitted_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)
  `).run(id, slug, contributorName, originalName, mimeType, size, storagePath, targetMomentId || null, notes || null, now);

  return {
    id,
    collectionSlug: slug,
    contributorName,
    originalName,
    mimeType,
    size,
    storagePath,
    targetMomentId,
    notes,
    status: 'pending',
    submittedAt: now,
  };
}

export function approveMediaContribution(slug: string, contributionId: string): MediaItem | null {
  const db = getDb();
  const contrib = db.prepare('SELECT * FROM media_contributions WHERE id = ? AND collection_slug = ?').get(contributionId, slug) as any;
  if (!contrib) return null;

  const now = new Date().toISOString();
  db.prepare("UPDATE media_contributions SET status = 'approved', reviewed_at = ? WHERE id = ?").run(now, contributionId);

  // Create media item from contribution
  const mediaId = `contrib_media_${contrib.id}`;
  db.prepare(`
    INSERT OR REPLACE INTO media_items (
      id, collection_slug, original_name, mime_type, size, thumbnail_url, low_res_url,
      contributor_name, contributor_verified, imported_at, processing_status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, 'ready')
  `).run(
    mediaId,
    slug,
    contrib.original_name,
    contrib.mime_type,
    contrib.size,
    `/api/uploads/${path.basename(contrib.storage_path)}`,
    `/api/uploads/${path.basename(contrib.storage_path)}`,
    contrib.contributor_name,
    now
  );

  // Link to target moment if specified
  if (contrib.target_moment_id) {
    db.prepare(`
      INSERT OR REPLACE INTO memberships (media_id, moment_id, source, confidence)
      VALUES (?, ?, 'visitor_contribution', 1.0)
    `).run(mediaId, contrib.target_moment_id);
  }

  return {
    id: mediaId,
    eventId: slug,
    originalName: contrib.original_name,
    mimeType: contrib.mime_type,
    size: contrib.size,
    thumbnailUrl: `/api/uploads/${path.basename(contrib.storage_path)}`,
    contributorName: contrib.contributor_name,
    contributorVerified: true,
    importedAt: now,
    captureTime: null,
    captureTimeSource: 'unknown',
    timezoneKnown: null,
    fileModifiedAt: null,
    processingStatus: 'ready',
    hash: null,
    duplicateGroupId: null,
    width: null,
    height: null,
    duration: null,
  };
}

export function rejectMediaContribution(slug: string, contributionId: string): boolean {
  const db = getDb();
  const now = new Date().toISOString();
  const res = db.prepare("UPDATE media_contributions SET status = 'rejected', reviewed_at = ? WHERE id = ? AND collection_slug = ?").run(now, contributionId, slug);
  return res.changes > 0;
}
