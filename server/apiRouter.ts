import { Router, Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import path from 'path';
import fs from 'fs';
import multer from 'multer';
import {
  loadServerData,
  saveServerData,
  checkRateLimit,
  recordFailedAttempt,
  clearFailedAttempts,
  hashCollectionPassword,
  verifyPassword,
  createVisitorToken,
  verifyVisitorToken,
  getAdminAuthStatus,
  setupAdminPassphrase,
  verifyAdminPassphrase,
  createAdminSession,
  verifyAdminSession,
  revokeAdminSession,
  changeAdminPassphrase,
  createOrUpdatePlace,
  renamePlace,
  mergePlaces,
  assignMediaToPlace,
  togglePeopleGrouping,
  createMediaContribution,
  approveMediaContribution,
  rejectMediaContribution,
  CollectionVisibility,
} from './storage';
import {
  getAllPlacesForCollection,
  getAllContributionsForCollection,
  getAllMediaForCollection,
  getAllPeopleGroupsForCollection,
  updatePersonGroupLabel,
  saveEmbeddingsBatch,
  saveFaceGroupsBatch,
  searchCollectionMediaAndMoments,
  getAllCollectionsList,
  createNewCollection,
  deleteCollectionBySlug,
  syncCollectionItemsToDb,
  getDb,
} from './db';

export const apiRouter = Router();

const UPLOADS_DIR = path.resolve(process.cwd(), 'uploads');
const PENDING_UPLOADS_DIR = path.join(UPLOADS_DIR, 'pending');

// Multer configuration for visitor contributions
const uploadStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    if (!fs.existsSync(PENDING_UPLOADS_DIR)) {
      fs.mkdirSync(PENDING_UPLOADS_DIR, { recursive: true });
    }
    cb(null, PENDING_UPLOADS_DIR);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    const safeName = `upload_${Date.now()}_${crypto.randomBytes(6).toString('hex')}${ext}`;
    cb(null, safeName);
  },
});

const upload = multer({
  storage: uploadStorage,
  limits: {
    fileSize: 100 * 1024 * 1024, // 100 MB max
  },
  fileFilter: (_req, file, cb) => {
    const allowed = [
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/heic',
      'video/mp4',
      'video/quicktime',
      'video/webm',
    ];
    if (allowed.includes(file.mimetype.toLowerCase())) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported file type: ${file.mimetype}`));
    }
  },
});

// Helper to extract client IP
function getClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') {
    return forwarded.split(',')[0].trim();
  }
  return req.socket.remoteAddress || '127.0.0.1';
}

// Server-enforced admin authentication middleware
function requireAdminAuth(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers['x-admin-token'] || req.headers.authorization;
  const token = typeof authHeader === 'string' ? authHeader.replace(/^Bearer\s+/, '').trim() : '';

  if (!token || !verifyAdminSession(token)) {
    res.status(401).json({ error: 'Valid admin authentication session required' });
    return;
  }
  next();
}

/**
 * ============================================================================
 * ADMIN AUTHENTICATION ENDPOINTS
 * ============================================================================
 */

apiRouter.get('/admin/setup-status', (_req: Request, res: Response) => {
  const status = getAdminAuthStatus();
  return res.json(status);
});

apiRouter.post('/admin/setup', (req: Request, res: Response) => {
  const { passphrase } = req.body || {};
  const status = getAdminAuthStatus();

  if (status.isConfigured) {
    return res.status(400).json({ error: 'Admin passphrase is already configured' });
  }

  if (!passphrase || typeof passphrase !== 'string' || passphrase.trim().length < 6) {
    return res.status(400).json({ error: 'Passphrase must be at least 6 characters long' });
  }

  setupAdminPassphrase(passphrase.trim());
  const token = createAdminSession();
  return res.json({ success: true, token, message: 'Admin setup completed successfully' });
});

apiRouter.post('/admin/login', (req: Request, res: Response) => {
  const { passphrase } = req.body || {};
  const ip = getClientIp(req);

  const rateLimit = checkRateLimit(ip);
  if (!rateLimit.allowed) {
    return res.status(429).json({
      error: `Too many failed attempts. Please wait ${rateLimit.retryAfterSec} seconds.`,
      retryAfterSec: rateLimit.retryAfterSec,
    });
  }

  if (!passphrase || typeof passphrase !== 'string') {
    recordFailedAttempt(ip);
    return res.status(400).json({ error: 'Passphrase is required' });
  }

  const isValid = verifyAdminPassphrase(passphrase.trim());
  if (!isValid) {
    recordFailedAttempt(ip);
    const updatedLimit = checkRateLimit(ip);
    return res.status(401).json({
      error: 'Incorrect admin passphrase',
      remainingAttempts: updatedLimit.remaining,
    });
  }

  clearFailedAttempts(ip);
  const token = createAdminSession();
  return res.json({ success: true, token });
});

apiRouter.post('/admin/logout', (req: Request, res: Response) => {
  const authHeader = req.headers['x-admin-token'] || req.headers.authorization;
  const token = typeof authHeader === 'string' ? authHeader.replace(/^Bearer\s+/, '').trim() : '';
  if (token) {
    revokeAdminSession(token);
  }
  return res.json({ success: true });
});

/**
 * ============================================================================
 * PUBLIC & PROTECTED COLLECTION ENDPOINTS
 * ============================================================================
 */

apiRouter.get('/collections/:slug', (req: Request, res: Response) => {
  const { slug } = req.params;
  const data = loadServerData(slug);

  if (data.collection.slug !== slug) {
    return res.status(404).json({ error: 'Collection not found' });
  }

  const { id, name, description, visibility, passwordHint, peopleGroupingEnabled, updatedAt } = data.collection;
  res.setHeader('Cache-Control', 'no-cache');
  return res.json({
    id,
    name,
    slug,
    description,
    visibility,
    passwordHint: visibility === 'password' ? passwordHint : null,
    requiresPassword: visibility === 'password',
    peopleGroupingEnabled,
    updatedAt,
  });
});

apiRouter.post('/collections/:slug/verify-password', (req: Request, res: Response) => {
  const { slug } = req.params;
  const { password } = req.body || {};
  const ip = getClientIp(req);

  const rateLimit = checkRateLimit(ip);
  if (!rateLimit.allowed) {
    return res.status(429).json({
      error: `Too many failed password attempts. Please wait ${rateLimit.retryAfterSec} seconds before retrying.`,
      retryAfterSec: rateLimit.retryAfterSec,
    });
  }

  const data = loadServerData(slug);
  if (data.collection.slug !== slug) {
    return res.status(404).json({ error: 'Collection not found' });
  }

  if (data.collection.visibility !== 'password' || !data.collection.passwordHash) {
    clearFailedAttempts(ip);
    const token = createVisitorToken(slug, data.collection.accessEpoch);
    return res.json({ success: true, token });
  }

  if (!password || typeof password !== 'string') {
    recordFailedAttempt(ip);
    return res.status(400).json({ error: 'Password is required' });
  }

  const salt = data.collection.passwordSalt || '';
  const matches = verifyPassword(password.trim(), salt, data.collection.passwordHash);

  if (!matches) {
    recordFailedAttempt(ip);
    const updatedLimit = checkRateLimit(ip);
    return res.status(401).json({
      error: 'Incorrect password',
      remainingAttempts: updatedLimit.remaining,
      retryAfterSec: updatedLimit.retryAfterSec,
    });
  }

  clearFailedAttempts(ip);
  const token = createVisitorToken(slug, data.collection.accessEpoch);
  res.setHeader('Cache-Control', 'no-store');
  return res.json({ success: true, token });
});

apiRouter.get('/collections/:slug/data', (req: Request, res: Response) => {
  const { slug } = req.params;
  const data = loadServerData(slug);

  if (data.collection.slug !== slug) {
    return res.status(404).json({ error: 'Collection not found' });
  }

  if (data.collection.visibility === 'password') {
    const authHeader = req.headers.authorization;
    const token = authHeader?.replace(/^Bearer\s+/, '') || (req.query.token as string);

    const adminToken = (req.headers['x-admin-token'] as string) || token;
    const isAdmin = verifyAdminSession(adminToken);
    const isVisitorValid = token && verifyVisitorToken(token, slug, data.collection.accessEpoch);

    if (!isAdmin && !isVisitorValid) {
      res.setHeader('Cache-Control', 'private, no-store, must-revalidate');
      return res.status(401).json({
        error: 'Password authentication required to access this collection',
        requiresPassword: true,
      });
    }
  }

  res.setHeader('Cache-Control', 'private, no-store, must-revalidate');
  return res.json({
    collection: {
      id: data.collection.id,
      name: data.collection.name,
      slug: data.collection.slug,
      description: data.collection.description,
      visibility: data.collection.visibility,
      passwordHint: data.collection.passwordHint,
      peopleGroupingEnabled: data.collection.peopleGroupingEnabled,
      updatedAt: data.collection.updatedAt,
    },
    moments: data.moments,
    mediaItems: data.mediaItems,
    memberships: data.memberships,
    connections: data.connections,
    places: data.places,
    suggestions: data.suggestions,
    contributions: data.contributions,
  });
});

/**
 * ============================================================================
 * DOWNLOAD ORIGINAL ENDPOINT
 * Serves authentic original bytes without canvas exports or recompression.
 * ============================================================================
 */
apiRouter.get('/collections/:slug/download/:mediaId', async (req: Request, res: Response) => {
  const { slug, mediaId } = req.params;
  const data = loadServerData(slug);

  // If password protected, require valid token
  if (data.collection.visibility === 'password') {
    const token = (req.query.token as string) || req.headers.authorization?.replace(/^Bearer\s+/, '');
    const adminToken = (req.headers['x-admin-token'] as string) || token;
    const isAdmin = verifyAdminSession(adminToken);
    const isVisitorValid = token && verifyVisitorToken(token, slug, data.collection.accessEpoch);

    if (!isAdmin && !isVisitorValid) {
      return res.status(401).json({ error: 'Password required to download from this collection' });
    }
  }

  const media = data.mediaItems.find((m) => m.id === mediaId);
  if (!media) {
    return res.status(404).json({ error: 'Media item not found' });
  }

  const filename = media.originalName || `media_${media.id}.jpg`;
  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
  res.setHeader('Cache-Control', 'private, no-store');

  // Case 1: Uploaded local contribution or local file
  if (media.thumbnailUrl?.startsWith('/api/uploads/')) {
    const localName = path.basename(media.thumbnailUrl);
    const fullPath = path.join(PENDING_UPLOADS_DIR, localName);
    if (fs.existsSync(fullPath)) {
      return res.sendFile(fullPath);
    }
  }

  // Case 2: Drive URL -> Redirect or stream with authentic filename
  if (media.driveFileId) {
    const downloadUrl = `https://drive.google.com/uc?id=${media.driveFileId}&export=download`;
    return res.redirect(downloadUrl);
  }

  // Case 3: Direct URL
  if (media.driveFullUrl) {
    return res.redirect(media.driveFullUrl);
  }

  return res.redirect(media.thumbnailUrl);
});

/**
 * GET /collections/:slug/media/:mediaId/thumbnail
 * Reliable media thumbnail proxy with server-side disk caching
 */
const THUMBNAILS_CACHE_DIR = path.resolve(process.cwd(), 'data', 'thumbnails');
if (!fs.existsSync(THUMBNAILS_CACHE_DIR)) {
  fs.mkdirSync(THUMBNAILS_CACHE_DIR, { recursive: true });
}

apiRouter.get('/collections/:slug/media/:mediaId/thumbnail', async (req: Request, res: Response) => {
  const { slug, mediaId } = req.params;
  const items = getAllMediaForCollection(slug);
  const media = items.find((m) => m.id === mediaId);

  if (!media) {
    return res.status(404).send('Media not found');
  }

  // Check if it is a pending local contribution
  if (media.thumbnailUrl?.startsWith('/api/uploads/')) {
    const localName = path.basename(media.thumbnailUrl);
    const fullPath = path.join(PENDING_UPLOADS_DIR, localName);
    if (fs.existsSync(fullPath)) {
      return res.sendFile(fullPath);
    }
  }

  // Check cached thumbnail on disk
  const safeId = media.id.replace(/[^a-zA-Z0-9_-]/g, '_');
  const cachedThumbPath = path.join(THUMBNAILS_CACHE_DIR, `${safeId}.jpg`);
  if (fs.existsSync(cachedThumbPath)) {
    res.setHeader('Content-Type', media.mimeType || 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    return res.sendFile(cachedThumbPath);
  }

  // Fetch from source URL without browser referrer
  const targetUrl = media.thumbnailUrl || media.lowResUrl || media.driveFullUrl;
  if (!targetUrl || targetUrl.startsWith('data:')) {
    if (targetUrl?.startsWith('data:image/svg+xml')) {
      const match = targetUrl.match(/data:image\/svg\+xml;charset=utf-8,(.*)$/);
      if (match) {
        res.setHeader('Content-Type', 'image/svg+xml');
        return res.send(decodeURIComponent(match[1]));
      }
    }
    return res.redirect(targetUrl || '');
  }

  try {
    const upstreamRes = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) MemoryFlow/1.0',
        'Accept': 'image/*,*/*'
      }
    });

    if (upstreamRes.ok) {
      const arrayBuffer = await upstreamRes.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      try {
        fs.writeFileSync(cachedThumbPath, buffer);
      } catch (writeErr) {
        console.warn('Failed to cache thumbnail:', writeErr);
      }
      res.setHeader('Content-Type', upstreamRes.headers.get('content-type') || 'image/jpeg');
      res.setHeader('Cache-Control', 'public, max-age=86400');
      return res.send(buffer);
    }
  } catch (err) {
    console.warn(`Upstream fetch failed for thumbnail ${mediaId}:`, err);
  }

  return res.redirect(targetUrl);
});

/**
 * GET /collections/:slug/media/:mediaId/video
 * Video streaming route supporting Range requests (HTTP 206 Partial Content)
 */
apiRouter.get('/collections/:slug/media/:mediaId/video', async (req: Request, res: Response) => {
  const { slug, mediaId } = req.params;
  const items = getAllMediaForCollection(slug);
  const media = items.find((m) => m.id === mediaId);

  if (!media) {
    return res.status(404).send('Media not found');
  }

  // Case 1: Local upload or file on disk
  if (media.thumbnailUrl?.startsWith('/api/uploads/')) {
    const localName = path.basename(media.thumbnailUrl);
    const fullPath = path.join(PENDING_UPLOADS_DIR, localName);
    if (fs.existsSync(fullPath)) {
      return res.sendFile(fullPath, { acceptRanges: true });
    }
  }

  // Case 2: Google Drive video streaming
  if (media.driveFileId) {
    const driveStreamUrl = `https://drive.usercontent.google.com/download?id=${media.driveFileId}&export=download`;
    const rangeHeader = req.headers.range;

    try {
      const headers: Record<string, string> = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) MemoryFlow/1.0',
      };
      if (rangeHeader) {
        headers['Range'] = rangeHeader;
      }

      const upstream = await fetch(driveStreamUrl, { headers });
      res.status(upstream.status);

      const forwardHeaders = ['content-type', 'content-range', 'content-length', 'accept-ranges'];
      forwardHeaders.forEach((h) => {
        const val = upstream.headers.get(h);
        if (val) res.setHeader(h, val);
      });

      if (!upstream.body) {
        return res.end();
      }

      const reader = upstream.body.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          res.write(value);
        }
        res.end();
      } catch {
        res.end();
      }
      return;
    } catch (err) {
      console.warn(`Upstream video stream error for ${mediaId}:`, err);
      return res.redirect(driveStreamUrl);
    }
  }

  if (media.driveFullUrl) {
    return res.redirect(media.driveFullUrl);
  }

  return res.status(404).send('Video source not found');
});

/**
 * ============================================================================
 * VISITOR CONTRIBUTIONS ENDPOINTS
 * ============================================================================
 */
apiRouter.post('/collections/:slug/contributions/upload', upload.single('mediaFile'), (req: Request, res: Response) => {
  const { slug } = req.params;
  const { contributorName, notes, targetMomentId } = req.body || {};
  const file = req.file;

  if (!file) {
    return res.status(400).json({ error: 'Media file is required' });
  }

  // Enforce 25MB limit for images, 100MB for videos
  if (file.mimetype.startsWith('image/') && file.size > 25 * 1024 * 1024) {
    try { fs.unlinkSync(file.path); } catch {}
    return res.status(400).json({ error: 'Image file exceeds maximum 25MB limit' });
  }
  if (file.size > 100 * 1024 * 1024) {
    try { fs.unlinkSync(file.path); } catch {}
    return res.status(400).json({ error: 'Media file exceeds maximum 100MB limit' });
  }

  if (!contributorName || typeof contributorName !== 'string' || contributorName.trim().length === 0) {
    try { fs.unlinkSync(file.path); } catch {}
    return res.status(400).json({ error: 'Contributor display name is required for attribution' });
  }

  const contribution = createMediaContribution(
    slug,
    contributorName.trim(),
    file.originalname,
    file.mimetype,
    file.size,
    file.path,
    notes?.trim(),
    targetMomentId
  );

  return res.json({
    success: true,
    message: 'Photo/video submitted for organizer review. It will appear once approved.',
    contributionId: contribution.id,
  });
});

apiRouter.post('/collections/:slug/suggestions', (req: Request, res: Response) => {
  const { slug } = req.params;
  const suggestion = req.body;

  if (!suggestion || !suggestion.id || !suggestion.visitorName) {
    return res.status(400).json({ error: 'Valid suggestion payload with visitorName is required' });
  }

  const data = loadServerData(slug);
  const existingIdx = data.suggestions.findIndex((s) => s.id === suggestion.id);
  if (existingIdx >= 0) {
    data.suggestions[existingIdx] = suggestion;
  } else {
    data.suggestions.push(suggestion);
  }

  saveServerData(data);
  return res.json({ success: true, id: suggestion.id });
});

/**
 * ============================================================================
 * ADMIN MUTATION ENDPOINTS (Protected by requireAdminAuth)
 * ============================================================================
 */

apiRouter.post('/admin/collections/:slug/sharing', requireAdminAuth, (req: Request, res: Response) => {
  const { slug } = req.params;
  const { visibility, password, passwordHint, removePassword } = req.body || {};

  const validVisibilities: CollectionVisibility[] = ['public', 'unlisted', 'password'];
  if (visibility && !validVisibilities.includes(visibility)) {
    return res.status(400).json({ error: 'Invalid visibility mode' });
  }

  const data = loadServerData(slug);
  let accessInvalidated = false;

  if (visibility && visibility !== data.collection.visibility) {
    data.collection.visibility = visibility;
    accessInvalidated = true;
  }

  if (removePassword) {
    data.collection.passwordHash = null;
    data.collection.passwordSalt = null;
    data.collection.passwordHint = null;
    accessInvalidated = true;
  } else if (password && typeof password === 'string' && password.trim().length > 0) {
    const salt = crypto.randomBytes(16).toString('hex');
    data.collection.passwordSalt = salt;
    data.collection.passwordHash = hashCollectionPassword(password.trim(), salt);
    accessInvalidated = true;
  }

  if (typeof passwordHint === 'string') {
    data.collection.passwordHint = passwordHint.trim() || null;
  }

  if (accessInvalidated) {
    data.collection.accessEpoch = (data.collection.accessEpoch || 1) + 1;
  }

  saveServerData(data);

  return res.json({
    success: true,
    visibility: data.collection.visibility,
    hasPassword: Boolean(data.collection.passwordHash),
    passwordHint: data.collection.passwordHint,
    accessEpoch: data.collection.accessEpoch,
    message: 'Sharing settings updated successfully',
  });
});

apiRouter.post('/admin/collections/:slug/people-grouping', requireAdminAuth, (req: Request, res: Response) => {
  const { slug } = req.params;
  const { enabled } = req.body || {};
  togglePeopleGrouping(slug, Boolean(enabled));
  return res.json({ success: true, enabled: Boolean(enabled) });
});

// Places Admin endpoints
apiRouter.post('/admin/collections/:slug/places', requireAdminAuth, (req: Request, res: Response) => {
  const { slug } = req.params;
  const { name, mediaIds } = req.body || {};
  if (!name || typeof name !== 'string') {
    return res.status(400).json({ error: 'Place name is required' });
  }
  const place = createOrUpdatePlace(slug, name.trim(), true);
  if (Array.isArray(mediaIds)) {
    for (const mId of mediaIds) {
      assignMediaToPlace(mId, place.id, true);
    }
  }
  return res.json({ success: true, place });
});

apiRouter.put('/admin/collections/:slug/places/:id', requireAdminAuth, (req: Request, res: Response) => {
  const { slug, id } = req.params;
  const { name } = req.body || {};
  if (!name || typeof name !== 'string') {
    return res.status(400).json({ error: 'New place name is required' });
  }
  const success = renamePlace(slug, id, name.trim());
  return res.json({ success, id, name: name.trim() });
});

apiRouter.post('/admin/collections/:slug/places/merge', requireAdminAuth, (req: Request, res: Response) => {
  const { slug } = req.params;
  const { sourcePlaceId, targetPlaceId } = req.body || {};
  if (!sourcePlaceId || !targetPlaceId) {
    return res.status(400).json({ error: 'Source and target place IDs are required' });
  }
  const success = mergePlaces(slug, sourcePlaceId, targetPlaceId);
  return res.json({ success });
});

// Contributions Admin endpoints
apiRouter.get('/admin/collections/:slug/contributions', requireAdminAuth, (req: Request, res: Response) => {
  const { slug } = req.params;
  const contributions = getAllContributionsForCollection(slug);
  return res.json({ contributions });
});

apiRouter.post('/admin/collections/:slug/contributions/:id/approve', requireAdminAuth, (req: Request, res: Response) => {
  const { slug, id } = req.params;
  const newMedia = approveMediaContribution(slug, id);
  if (!newMedia) {
    return res.status(404).json({ error: 'Contribution not found' });
  }
  return res.json({ success: true, mediaItem: newMedia });
});

apiRouter.post('/admin/collections/:slug/contributions/:id/reject', requireAdminAuth, (req: Request, res: Response) => {
  const { slug, id } = req.params;
  const success = rejectMediaContribution(slug, id);
  return res.json({ success });
});

// Static uploads serving
apiRouter.get('/uploads/:filename', (req: Request, res: Response) => {
  const { filename } = req.params;
  const fullPath = path.join(PENDING_UPLOADS_DIR, path.basename(filename));
  if (fs.existsSync(fullPath)) {
    res.setHeader('Cache-Control', 'public, max-age=86400');
    return res.sendFile(fullPath);
  }
  return res.status(404).json({ error: 'File not found' });
});

// Sync endpoint
apiRouter.post('/collections/:slug/sync', (req: Request, res: Response) => {
  const { slug } = req.params;
  const { moments, mediaItems, memberships, connections } = req.body || {};

  syncCollectionItemsToDb(slug, mediaItems, moments, memberships, connections);

  const data = loadServerData(slug);
  if (Array.isArray(moments)) data.moments = moments;
  if (Array.isArray(mediaItems)) data.mediaItems = mediaItems;
  if (Array.isArray(memberships)) data.memberships = memberships;
  if (Array.isArray(connections)) data.connections = connections;

  saveServerData(data);

  return res.json({
    success: true,
    syncedAt: new Date().toISOString(),
    mediaCount: data.mediaItems.length,
    momentsCount: data.moments.length,
  });
});

// Admin change passphrase endpoint
apiRouter.post('/admin/change-passphrase', requireAdminAuth, (req: Request, res: Response) => {
  const { newPassphrase } = req.body || {};
  if (!newPassphrase || typeof newPassphrase !== 'string' || newPassphrase.trim().length < 6) {
    return res.status(400).json({ error: 'Passphrase must be at least 6 characters long' });
  }

  changeAdminPassphrase(newPassphrase.trim());
  const newToken = createAdminSession();
  return res.json({ success: true, token: newToken, message: 'Admin passphrase updated successfully' });
});

// Admin collections CRUD
apiRouter.get('/admin/collections', requireAdminAuth, (_req: Request, res: Response) => {
  const collections = getAllCollectionsList();
  return res.json({ collections });
});

apiRouter.post('/admin/collections', requireAdminAuth, (req: Request, res: Response) => {
  const { name, slug, driveFolderId, visibility } = req.body || {};
  if (!name || !slug) {
    return res.status(400).json({ error: 'Name and slug are required' });
  }
  const cleanSlug = String(slug).toLowerCase().replace(/[^a-z0-9_-]/g, '');
  const col = createNewCollection(name, cleanSlug, driveFolderId, visibility || 'password');
  return res.json({ success: true, collection: col });
});

apiRouter.delete('/admin/collections/:slug', requireAdminAuth, (req: Request, res: Response) => {
  const { slug } = req.params;
  const success = deleteCollectionBySlug(slug);
  return res.json({ success });
});

// Search endpoint across collection media, moments, places, and activities
apiRouter.get('/collections/:slug/search', (req: Request, res: Response) => {
  const { slug } = req.params;
  const query = (req.query.q as string) || '';
  if (!query.trim()) {
    return res.json({ media: [], moments: [] });
  }
  const results = searchCollectionMediaAndMoments(slug, query);
  return res.json(results);
});

// People groups endpoints
apiRouter.get('/collections/:slug/people-groups', (req: Request, res: Response) => {
  const { slug } = req.params;
  const groups = getAllPeopleGroupsForCollection(slug);
  return res.json({ groups });
});

apiRouter.post('/collections/:slug/admin/people-groups/:groupId', requireAdminAuth, (req: Request, res: Response) => {
  const { groupId } = req.params;
  const { label } = req.body || {};
  if (typeof label !== 'string') {
    return res.status(400).json({ error: 'Label string is required' });
  }
  const success = updatePersonGroupLabel(groupId, label.trim());
  return res.json({ success, groupId, label: label.trim() });
});

// AI data import endpoints (from Google Colab JSON exports)
apiRouter.post('/collections/:slug/admin/import/embeddings', requireAdminAuth, (req: Request, res: Response) => {
  const { items, model } = req.body || {};
  if (!Array.isArray(items)) {
    return res.status(400).json({ error: 'Expected items array in JSON body' });
  }
  const count = saveEmbeddingsBatch(items, model || 'openai/clip-vit-base-patch32');
  return res.json({ success: true, count, message: `Imported ${count} visual embeddings` });
});

apiRouter.post('/collections/:slug/admin/import/face-groups', requireAdminAuth, (req: Request, res: Response) => {
  const { slug } = req.params;
  const { groups } = req.body || {};
  if (!Array.isArray(groups)) {
    return res.status(400).json({ error: 'Expected groups array in JSON body' });
  }
  const count = saveFaceGroupsBatch(slug, groups);
  return res.json({ success: true, count, message: `Imported ${count} face groups` });
});

// Visitor caption suggestion endpoint
apiRouter.post('/collections/:slug/media/:mediaId/suggest-caption', (req: Request, res: Response) => {
  const { slug, mediaId } = req.params;
  const { visitorName, caption } = req.body || {};
  if (!caption || typeof caption !== 'string' || !caption.trim()) {
    return res.status(400).json({ error: 'Caption text is required' });
  }

  const db = getDb();
  const id = `sugg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  db.prepare(`
    INSERT INTO visitor_suggestions (id, collection_slug, visitor_name, media_id, target_moment_id, action, note, status, created_at)
    VALUES (?, ?, ?, ?, '', 'caption', ?, 'pending', ?)
  `).run(id, slug, visitorName || 'Visitor', mediaId, caption.trim(), new Date().toISOString());

  return res.json({ success: true, id, message: 'Caption submitted for organizer review' });
});
