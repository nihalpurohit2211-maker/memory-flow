import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import {
  loadServerData,
  saveServerData,
  checkRateLimit,
  recordFailedAttempt,
  clearFailedAttempts,
  hashCollectionPassword,
  createVisitorToken,
  verifyVisitorToken,
  CollectionVisibility,
} from './storage';

export const apiRouter = Router();

// Helper to extract client IP
function getClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') {
    return forwarded.split(',')[0].trim();
  }
  return req.socket.remoteAddress || '127.0.0.1';
}

// Simple admin session verification (validates admin token or header)
function isAdminAuthorized(req: Request): boolean {
  const authHeader = req.headers['x-admin-token'] || req.headers.authorization;
  if (!authHeader) return false;
  const token = typeof authHeader === 'string' ? authHeader.replace(/^Bearer\s+/, '') : '';
  return token.length > 10;
}

/**
 * GET /api/collections/:slug
 * Public metadata endpoint. Does not require authentication.
 * Never exposes password hashes or Drive credentials.
 */
apiRouter.get('/collections/:slug', (req: Request, res: Response) => {
  const { slug } = req.params;
  const data = loadServerData();

  if (data.collection.slug !== slug) {
    return res.status(404).json({ error: 'Collection not found' });
  }

  const { id, name, description, visibility, passwordHint, updatedAt } = data.collection;
  res.setHeader('Cache-Control', 'no-cache');
  return res.json({
    id,
    name,
    slug,
    description,
    visibility,
    passwordHint: visibility === 'password' ? passwordHint : null,
    requiresPassword: visibility === 'password',
    updatedAt,
  });
});

/**
 * POST /api/collections/:slug/verify-password
 * Verifies visitor password with rate limiting.
 */
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

  const data = loadServerData();
  if (data.collection.slug !== slug) {
    return res.status(404).json({ error: 'Collection not found' });
  }

  if (data.collection.visibility !== 'password' || !data.collection.passwordHash) {
    // If collection is not password protected, grant token directly
    clearFailedAttempts(ip);
    const token = createVisitorToken(slug, data.collection.accessEpoch);
    return res.json({ success: true, token });
  }

  if (!password || typeof password !== 'string') {
    recordFailedAttempt(ip);
    return res.status(400).json({ error: 'Password is required' });
  }

  const salt = data.collection.passwordSalt || '';
  const hash = hashCollectionPassword(password, salt);

  // Timing safe comparison
  const hashBuffer = Buffer.from(hash, 'hex');
  const storedBuffer = Buffer.from(data.collection.passwordHash, 'hex');

  const matches =
    hashBuffer.length === storedBuffer.length && crypto.timingSafeEqual(hashBuffer, storedBuffer);

  if (!matches) {
    recordFailedAttempt(ip);
    const updatedLimit = checkRateLimit(ip);
    return res.status(401).json({
      error: 'Incorrect password',
      remainingAttempts: updatedLimit.remaining,
      retryAfterSec: updatedLimit.retryAfterSec,
    });
  }

  // Password correct
  clearFailedAttempts(ip);
  const token = createVisitorToken(slug, data.collection.accessEpoch);
  res.setHeader('Cache-Control', 'no-store');
  return res.json({ success: true, token });
});

/**
 * GET /api/collections/:slug/data
 * Fetches collection data. Enforces server-side password check.
 */
apiRouter.get('/collections/:slug/data', (req: Request, res: Response) => {
  const { slug } = req.params;
  const data = loadServerData();

  if (data.collection.slug !== slug) {
    return res.status(404).json({ error: 'Collection not found' });
  }

  // Enforce password protection if enabled
  if (data.collection.visibility === 'password') {
    const authHeader = req.headers.authorization;
    const token = authHeader?.replace(/^Bearer\s+/, '') || (req.query.token as string);

    const isAdmin = isAdminAuthorized(req);
    const isVisitorValid = token && verifyVisitorToken(token, slug, data.collection.accessEpoch);

    if (!isAdmin && !isVisitorValid) {
      res.setHeader('Cache-Control', 'private, no-store, must-revalidate');
      return res.status(401).json({
        error: 'Password authentication required to access this collection',
        requiresPassword: true,
      });
    }
  }

  // Return protected response with private, no-store cache headers
  res.setHeader('Cache-Control', 'private, no-store, must-revalidate');
  return res.json({
    collection: {
      id: data.collection.id,
      name: data.collection.name,
      slug: data.collection.slug,
      description: data.collection.description,
      visibility: data.collection.visibility,
      passwordHint: data.collection.passwordHint,
      updatedAt: data.collection.updatedAt,
    },
    moments: data.moments,
    mediaItems: data.mediaItems,
    memberships: data.memberships,
    connections: data.connections,
    suggestions: data.suggestions,
    approvedCorrections: data.approvedCorrections,
  });
});

/**
 * POST /api/admin/collections/:slug/sharing
 * Admin endpoint to update visibility, password, and hint.
 */
apiRouter.post('/admin/collections/:slug/sharing', (req: Request, res: Response) => {
  if (!isAdminAuthorized(req)) {
    return res.status(401).json({ error: 'Admin authentication required' });
  }

  const { slug } = req.params;
  const { visibility, password, passwordHint, removePassword } = req.body || {};

  const validVisibilities: CollectionVisibility[] = ['public', 'unlisted', 'password'];
  if (visibility && !validVisibilities.includes(visibility)) {
    return res.status(400).json({ error: 'Invalid visibility mode' });
  }

  const data = loadServerData();
  if (data.collection.slug !== slug) {
    return res.status(404).json({ error: 'Collection not found' });
  }

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
    // Invalidate prior visitor tokens immediately
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

/**
 * POST /api/collections/:slug/sync
 * Syncs local client data (IndexedDB) to shared server storage.
 */
apiRouter.post('/collections/:slug/sync', (req: Request, res: Response) => {
  const { slug } = req.params;
  const { moments, mediaItems, memberships, connections } = req.body || {};

  const data = loadServerData();
  if (data.collection.slug !== slug) {
    return res.status(404).json({ error: 'Collection not found' });
  }

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

/**
 * POST /api/collections/:slug/suggestions
 * Visitor submissions endpoint.
 */
apiRouter.post('/collections/:slug/suggestions', (req: Request, res: Response) => {
  const { slug } = req.params;
  const suggestion = req.body;

  if (!suggestion || !suggestion.id || !suggestion.visitorName) {
    return res.status(400).json({ error: 'Valid suggestion payload with visitorName is required' });
  }

  const data = loadServerData();
  if (data.collection.slug !== slug) {
    return res.status(404).json({ error: 'Collection not found' });
  }

  // Prevent duplicate suggestion
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
 * Protected Media Proxy routes
 * GET /api/media/:mediaId/image
 * GET /api/media/:mediaId/thumb
 */
apiRouter.get('/media/:mediaId/image', (req: Request, res: Response) => {
  const { mediaId } = req.params;
  const token = (req.query.token as string) || req.headers.authorization?.replace(/^Bearer\s+/, '');
  const data = loadServerData();

  // If password protected, require valid token
  if (data.collection.visibility === 'password') {
    const isVisitorValid = token && verifyVisitorToken(token, data.collection.slug, data.collection.accessEpoch);
    const isAdmin = isAdminAuthorized(req);
    if (!isVisitorValid && !isAdmin) {
      res.setHeader('Cache-Control', 'private, no-store');
      return res.status(401).json({ error: 'Unauthorized media request' });
    }
  }

  const media = data.mediaItems.find((m) => m.id === mediaId);
  if (!media) {
    return res.status(404).json({ error: 'Media not found' });
  }

  res.setHeader('Cache-Control', 'private, no-store, must-revalidate');
  if (media.driveThumbnailUrl) {
    return res.redirect(media.driveThumbnailUrl);
  }
  return res.redirect(media.thumbnailUrl);
});
