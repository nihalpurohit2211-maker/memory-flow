import { describe, it, expect } from 'vitest';
import { computeSha256, extractExifMetadata } from '../mediaProcessor';
import { pickTakeMeSomewhere } from '../recommendation';
import { Moment, Visit } from '../../types';

describe('Stage 2 — Media Processor & Local Logic', () => {
  it('computes consistent SHA-256 hash for identical byte contents', async () => {
    const blob1 = new Blob(['sample-photo-data-content-highland'], { type: 'image/jpeg' });
    const blob2 = new Blob(['sample-photo-data-content-highland'], { type: 'image/jpeg' });
    const blobDiff = new Blob(['different-photo-content'], { type: 'image/jpeg' });

    const hash1 = await computeSha256(blob1);
    const hash2 = await computeSha256(blob2);
    const hashDiff = await computeSha256(blobDiff);

    expect(hash1).toBe(hash2);
    expect(hash1).not.toBe(hashDiff);
    expect(hash1).toHaveLength(64); // SHA-256 hex string
  });

  it('handles missing/non-EXIF data gracefully without throwing', async () => {
    const fakeFile = new File(['fake-corrupt-data'], 'test.jpg', { type: 'image/jpeg' });
    const result = await extractExifMetadata(fakeFile);

    expect(result.captureTime).toBeNull();
    expect(result.captureTimeSource).toBe('unknown');
    expect(result.timezoneKnown).toBeNull();
  });

  it('Take Me Somewhere avoids immediate repeat when multiple moments exist', () => {
    const moments: Moment[] = [
      { id: 'm1', eventId: 'e1', label: 'Morning', labelSource: 'organizer', coverMediaId: null, description: null, createdAt: '' },
      { id: 'm2', eventId: 'e1', label: 'Afternoon', labelSource: 'organizer', coverMediaId: null, description: null, createdAt: '' },
      { id: 'm3', eventId: 'e1', label: 'Evening', labelSource: 'organizer', coverMediaId: null, description: null, createdAt: '' },
    ];

    const visits: Record<string, Visit> = {
      m1: { momentId: 'm1', lastVisitedAt: '2026-10-10T10:00:00Z', visitCount: 5 },
      m2: { momentId: 'm2', lastVisitedAt: '2026-10-10T11:00:00Z', visitCount: 0 },
      m3: { momentId: 'm3', lastVisitedAt: '2026-10-10T12:00:00Z', visitCount: 1 },
    };

    // If m2 was just visited, recommendation should avoid m2
    const rec = pickTakeMeSomewhere(moments, visits, ['m1', 'm2']);
    expect(rec).not.toBeNull();
    expect(rec?.moment.id).not.toBe('m2');
  });

  it('Take Me Somewhere handles single moment gracefully', () => {
    const singleMoment: Moment[] = [
      { id: 'm1', eventId: 'e1', label: 'Solo Moment', labelSource: 'organizer', coverMediaId: null, description: null, createdAt: '' },
    ];
    const rec = pickTakeMeSomewhere(singleMoment, {}, []);
    expect(rec?.moment.id).toBe('m1');
  });

  it('Take Me Somewhere handles zero moments gracefully', () => {
    const rec = pickTakeMeSomewhere([], {}, []);
    expect(rec).toBeNull();
  });
});
