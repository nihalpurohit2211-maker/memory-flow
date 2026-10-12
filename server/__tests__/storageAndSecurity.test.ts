import { describe, it, expect, beforeEach } from 'vitest';
import {
  checkRateLimit,
  recordFailedAttempt,
  clearFailedAttempts,
  hashCollectionPassword,
  verifyPassword,
  createVisitorToken,
  verifyVisitorToken,
  createAdminSession,
  verifyAdminSession,
  revokeAdminSession,
  createOrUpdatePlace,
  renamePlace,
  mergePlaces,
  createMediaContribution,
  approveMediaContribution,
  rejectMediaContribution,
} from '../storage';

describe('Server Storage, Security, Sessions & Places', () => {
  beforeEach(() => {
    clearFailedAttempts('192.168.1.100');
    clearFailedAttempts('10.0.0.1');
  });

  it('correctly hashes passwords with 100,000 PBKDF2 rounds and performs timing-safe verification', () => {
    const salt1 = 'salt_abc_123';
    const salt2 = 'salt_xyz_789';
    const hash1 = hashCollectionPassword('SecretPass123!', salt1);
    const hash2 = hashCollectionPassword('SecretPass123!', salt1);
    const hashDiffSalt = hashCollectionPassword('SecretPass123!', salt2);

    expect(hash1).toBe(hash2);
    expect(hash1).not.toBe(hashDiffSalt);
    expect(hash1.length).toBe(128); // 64 bytes hex

    expect(verifyPassword('SecretPass123!', salt1, hash1)).toBe(true);
    expect(verifyPassword('WrongPass!', salt1, hash1)).toBe(false);
  });

  it('creates, verifies and revokes server-enforced admin sessions', () => {
    const sessionToken = createAdminSession();
    expect(sessionToken.length).toBe(64);

    expect(verifyAdminSession(sessionToken)).toBe(true);
    expect(verifyAdminSession('fake_unauthorized_token')).toBe(false);

    revokeAdminSession(sessionToken);
    expect(verifyAdminSession(sessionToken)).toBe(false);
  });

  it('creates and verifies valid HMAC-signed visitor tokens and invalidates on epoch change', () => {
    const token = createVisitorToken('elevate', 1);
    expect(token).toContain('.');

    expect(verifyVisitorToken(token, 'elevate', 1)).toBe(true);
    // Invalidated by epoch increment (password change or visibility restriction)
    expect(verifyVisitorToken(token, 'elevate', 2)).toBe(false);
  });

  it('enforces rate limiting: locks out after 5 consecutive failed attempts', () => {
    const testIp = '192.168.1.100';

    for (let i = 0; i < 4; i++) {
      recordFailedAttempt(testIp);
      const status = checkRateLimit(testIp);
      expect(status.allowed).toBe(true);
      expect(status.remaining).toBe(4 - i);
    }

    recordFailedAttempt(testIp);
    const lockedStatus = checkRateLimit(testIp);
    expect(lockedStatus.allowed).toBe(false);
    expect(lockedStatus.remaining).toBe(0);
    expect(lockedStatus.retryAfterSec).toBeGreaterThan(0);

    clearFailedAttempts(testIp);
    const clearedStatus = checkRateLimit(testIp);
    expect(clearedStatus.allowed).toBe(true);
    expect(clearedStatus.remaining).toBe(5);
  });

  it('manages places: supports creating, renaming, and merging place groups', () => {
    const place1 = createOrUpdatePlace('elevate', 'Sabian Hall', true);
    expect(place1.name).toBe('Sabian Hall');
    expect(place1.isConfirmed).toBe(true);

    const place2 = createOrUpdatePlace('elevate', 'North Pavilion', true);
    expect(place2.name).toBe('North Pavilion');

    // Rename
    const renamed = renamePlace('elevate', place2.id, 'Main Auditorium');
    expect(renamed).toBe(true);

    // Merge place2 into place1
    const merged = mergePlaces('elevate', place2.id, place1.id);
    expect(merged).toBe(true);
  });

  it('handles contributor media workflow: pending queue, approval, and rejection', () => {
    const contrib = createMediaContribution(
      'elevate',
      'Elena Vance',
      'keynote_balcony.jpg',
      'image/jpeg',
      2450000,
      '/fake/path/keynote_balcony.jpg',
      'Taken from second floor'
    );
    expect(contrib.status).toBe('pending');
    expect(contrib.contributorName).toBe('Elena Vance');

    // Approve
    const approved = approveMediaContribution('elevate', contrib.id);
    expect(approved).not.toBeNull();
    expect(approved?.contributorName).toBe('Elena Vance');
    expect(approved?.contributorVerified).toBe(true);

    // Create another and reject
    const contrib2 = createMediaContribution(
      'elevate',
      'Anonymous',
      'blurry_stage.jpg',
      'image/jpeg',
      120000,
      '/fake/path/blurry.jpg'
    );
    const rejected = rejectMediaContribution('elevate', contrib2.id);
    expect(rejected).toBe(true);
  });
});
