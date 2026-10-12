import { describe, it, expect, beforeEach } from 'vitest';
import {
  checkRateLimit,
  recordFailedAttempt,
  clearFailedAttempts,
  hashCollectionPassword,
  createVisitorToken,
  verifyVisitorToken,
} from '../storage';

describe('Priority 1 — Server Storage, Password Hashing & Visitor Access Tokens', () => {
  beforeEach(() => {
    clearFailedAttempts('192.168.1.100');
    clearFailedAttempts('10.0.0.1');
  });

  it('correctly hashes passwords with PBKDF2 and unique salts', () => {
    const salt1 = 'salt_abc_123';
    const salt2 = 'salt_xyz_789';
    const hash1 = hashCollectionPassword('SecretPass123!', salt1);
    const hash2 = hashCollectionPassword('SecretPass123!', salt1);
    const hashDiffSalt = hashCollectionPassword('SecretPass123!', salt2);

    expect(hash1).toBe(hash2);
    expect(hash1).not.toBe(hashDiffSalt);
    expect(hash1.length).toBe(128); // 64 bytes hex
  });

  it('creates and verifies valid HMAC-signed visitor tokens', () => {
    const token = createVisitorToken('elevate', 1);
    expect(token).toContain('.');

    const isValid = verifyVisitorToken(token, 'elevate', 1);
    expect(isValid).toBe(true);
  });

  it('rejects tokens when accessEpoch changes (password change or visibility restriction)', () => {
    const tokenEpoch1 = createVisitorToken('elevate', 1);
    // When password is changed or collection made private, accessEpoch increments to 2
    const isValidOldToken = verifyVisitorToken(tokenEpoch1, 'elevate', 2);
    expect(isValidOldToken).toBe(false);
  });

  it('rejects tokens for different collections or tampered payloads', () => {
    const token = createVisitorToken('elevate', 1);
    expect(verifyVisitorToken(token, 'different-event', 1)).toBe(false);

    // Tamper token payload
    const [payload, sig] = token.split('.');
    const tamperedPayload = Buffer.from(JSON.stringify({ slug: 'elevate', epoch: 1, exp: 9999999999999 })).toString('base64url');
    const tamperedToken = `${tamperedPayload}.${sig}`;
    expect(verifyVisitorToken(tamperedToken, 'elevate', 1)).toBe(false);
  });

  it('enforces rate limiting: locks out after 5 consecutive failed attempts', () => {
    const testIp = '192.168.1.100';

    // 4 attempts allowed
    for (let i = 0; i < 4; i++) {
      recordFailedAttempt(testIp);
      const status = checkRateLimit(testIp);
      expect(status.allowed).toBe(true);
      expect(status.remaining).toBe(4 - i);
    }

    // 5th failed attempt locks out
    recordFailedAttempt(testIp);
    const lockedStatus = checkRateLimit(testIp);
    expect(lockedStatus.allowed).toBe(false);
    expect(lockedStatus.remaining).toBe(0);
    expect(lockedStatus.retryAfterSec).toBeGreaterThan(0);

    // Success clears rate limit
    clearFailedAttempts(testIp);
    const clearedStatus = checkRateLimit(testIp);
    expect(clearedStatus.allowed).toBe(true);
    expect(clearedStatus.remaining).toBe(5);
  });
});
