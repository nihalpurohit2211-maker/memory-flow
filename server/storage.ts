import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { MediaItem, Moment, Membership, Connection, VisitorSuggestion } from '../src/types';

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
  accessEpoch: number; // Incremented on password change or restricted visibility to invalidate tokens
  createdAt: string;
  updatedAt: string;
}

export interface CollectionDataStore {
  collection: ServerCollection;
  moments: Moment[];
  mediaItems: MediaItem[];
  memberships: Membership[];
  connections: Connection[];
  suggestions: VisitorSuggestion[];
  approvedCorrections: any[];
}

const DATA_DIR = path.resolve(process.cwd(), 'data');
const DATA_FILE = path.join(DATA_DIR, 'server_collection.json');

const SERVER_SECRET = crypto.randomBytes(32).toString('hex');

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

export function hashCollectionPassword(password: string, salt: string): string {
  return crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
}

export function createVisitorToken(collectionSlug: string, accessEpoch: number): string {
  const payload = JSON.stringify({
    slug: collectionSlug,
    epoch: accessEpoch,
    exp: Date.now() + 12 * 60 * 60 * 1000, // 12 hours session
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
    if (payload.epoch !== currentEpoch) return false; // Token invalidated by password/visibility change
    if (Date.now() > payload.exp) return false; // Expired

    return true;
  } catch {
    return false;
  }
}

function getDefaultCollection(): CollectionDataStore {
  return {
    collection: {
      id: 'elevate-1.0',
      name: 'ELEVATE 1.0',
      slug: 'elevate',
      description: 'Official ELEVATE 1.0 Event Collection',
      driveFolderId: 'simulated_drive_elevate_2026',
      visibility: 'public',
      passwordHash: null,
      passwordSalt: null,
      passwordHint: null,
      accessEpoch: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    moments: [],
    mediaItems: [],
    memberships: [],
    connections: [],
    suggestions: [],
    approvedCorrections: [],
  };
}

export function loadServerData(): CollectionDataStore {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (!fs.existsSync(DATA_FILE)) {
      const initial = getDefaultCollection();
      fs.writeFileSync(DATA_FILE, JSON.stringify(initial, null, 2), 'utf8');
      return initial;
    }
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    console.warn('Error reading server collection data, falling back to default:', err);
    return getDefaultCollection();
  }
}

export function saveServerData(data: CollectionDataStore): void {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    data.collection.updatedAt = new Date().toISOString();
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.error('Failed to save server collection data:', err);
  }
}
