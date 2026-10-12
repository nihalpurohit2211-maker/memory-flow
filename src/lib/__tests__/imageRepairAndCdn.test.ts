import { describe, it, expect } from 'vitest';
import { repairJpegBuffer, checkJpegIntegrity } from '../imageRepair';
import { buildDriveImageUrl } from '../driveClient';

describe('Image Integrity, Damage Detection & CDN URLs', () => {
  it('detects truncated JPEGs and reports honest damage status without claiming restoration', () => {
    // Valid SOI (0xFF, 0xD8), some bytes, but NO EOI at end
    const truncatedJpeg = new Uint8Array([0xFF, 0xD8, 0x12, 0x34, 0x56, 0x78]);
    const integrity = checkJpegIntegrity(truncatedJpeg);

    expect(integrity.isValid).toBe(false);
    expect(integrity.isTruncated).toBe(true);
    expect(integrity.hasValidSoi).toBe(true);
    expect(integrity.hasValidEoi).toBe(false);
    expect(integrity.notes).toContain('incomplete scan data');
  });

  it('validates intact JPEGs having both SOI and EOI markers', () => {
    const validJpeg = new Uint8Array([0xFF, 0xD8, 0x11, 0x22, 0xFF, 0xD9]);
    const integrity = checkJpegIntegrity(validJpeg);

    expect(integrity.isValid).toBe(true);
    expect(integrity.isTruncated).toBe(false);
    expect(integrity.hasValidSoi).toBe(true);
    expect(integrity.hasValidEoi).toBe(true);
  });

  it('appends in-memory EOI marker for preview buffer without modifying original file', () => {
    const truncated = new Uint8Array([0xFF, 0xD8, 0x12, 0x34]);
    const previewBuffer = repairJpegBuffer(truncated);

    expect(previewBuffer.length).toBe(truncated.length + 2);
    expect(previewBuffer[previewBuffer.length - 2]).toBe(0xFF);
    expect(previewBuffer[previewBuffer.length - 1]).toBe(0xD9);
    // Original truncated array is unchanged
    expect(truncated.length).toBe(4);
  });

  it('strips junk prefix bytes before SOI marker', () => {
    const junkPrefixed = new Uint8Array([0x00, 0xAA, 0xBB, 0xFF, 0xD8, 0x12, 0xFF, 0xD9]);
    const repaired = repairJpegBuffer(junkPrefixed);

    expect(repaired[0]).toBe(0xFF);
    expect(repaired[1]).toBe(0xD8);
    expect(repaired[repaired.length - 2]).toBe(0xFF);
    expect(repaired[repaired.length - 1]).toBe(0xD9);
  });

  it('buildDriveImageUrl correctly formats Google CDN URLs without stacking size parameters', () => {
    const rawUrl = 'https://lh3.googleusercontent.com/d/1A2B3C4D5E=s220';
    
    // Low res (200)
    const lowRes = buildDriveImageUrl(rawUrl, 's200');
    expect(lowRes).toBe('https://lh3.googleusercontent.com/d/1A2B3C4D5E=s200');

    // Medium res (640)
    const medRes = buildDriveImageUrl(rawUrl, 's640');
    expect(medRes).toBe('https://lh3.googleusercontent.com/d/1A2B3C4D5E=s640');

    // Full uncropped resolution (=s0)
    const fullRes = buildDriveImageUrl(rawUrl, 's0');
    expect(fullRes).toBe('https://lh3.googleusercontent.com/d/1A2B3C4D5E=s0');

    // URL with width parameter =w400
    const rawUrlWidth = 'https://lh3.googleusercontent.com/d/1A2B3C4D5E=w400-h300';
    const fullResFromWidth = buildDriveImageUrl(rawUrlWidth, 's0');
    expect(fullResFromWidth).toBe('https://lh3.googleusercontent.com/d/1A2B3C4D5E=s0');
  });
});
