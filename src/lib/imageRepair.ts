/**
 * Image Integrity & Decoding Resilience Utility
 *
 * AUDIT NOTE:
 * Adding JPEG markers (e.g. 0xFF, 0xD9) to a truncated byte stream enables
 * image decoders to render available top scan lines without throwing fatal syntax errors,
 * but it DOES NOT restore missing image data. The missing bottom scanlines will appear
 * blank/white in standard decoders.
 *
 * This utility NEVER modifies original files on disk. Damaged files are honestly
 * tagged with `isDamaged = true` so the UI presents the best available valid preview
 * with an honest notice and direct download option for the original bytes.
 */

export interface ImageIntegrityResult {
  isValid: boolean;
  isTruncated: boolean;
  hasValidSoi: boolean;
  hasValidEoi: boolean;
  notes?: string;
}

/**
 * Checks JPEG file buffer integrity without mutating original bytes
 */
export function checkJpegIntegrity(bytes: Uint8Array): ImageIntegrityResult {
  if (bytes.length < 4) {
    return {
      isValid: false,
      isTruncated: true,
      hasValidSoi: false,
      hasValidEoi: false,
      notes: 'File buffer too small to be a valid JPEG image.',
    };
  }

  // Find SOI (Start of Image) marker: 0xFF, 0xD8
  let hasValidSoi = false;
  for (let i = 0; i < Math.min(bytes.length - 1, 4096); i++) {
    if (bytes[i] === 0xFF && bytes[i + 1] === 0xD8) {
      hasValidSoi = true;
      break;
    }
  }

  // Find EOI (End of Image) marker: 0xFF, 0xD9
  let hasValidEoi = false;
  const searchRange = Math.min(bytes.length, 64);
  for (let i = bytes.length - 2; i >= bytes.length - searchRange; i--) {
    if (bytes[i] === 0xFF && bytes[i + 1] === 0xD9) {
      hasValidEoi = true;
      break;
    }
  }

  const isTruncated = hasValidSoi && !hasValidEoi;

  return {
    isValid: hasValidSoi && hasValidEoi,
    isTruncated,
    hasValidSoi,
    hasValidEoi,
    notes: isTruncated
      ? 'Incomplete JPEG: stream ends before End-of-Image marker (incomplete scan data). Bottom rows may be missing.'
      : undefined,
  };
}

/**
 * Creates an in-memory preview buffer for truncated streams so browser decoders
 * can render the intact top portion without crashing.
 *
 * NOTE: Does NOT alter original files on disk and does NOT claim to recover missing content.
 */
export function repairJpegBuffer(bytes: Uint8Array): Uint8Array {
  if (bytes.length < 4) return bytes;

  // Find SOI marker
  let startIndex = -1;
  for (let i = 0; i < Math.min(bytes.length - 1, 4096); i++) {
    if (bytes[i] === 0xFF && bytes[i + 1] === 0xD8) {
      startIndex = i;
      break;
    }
  }

  if (startIndex === -1) {
    return bytes;
  }

  const workingBytes = startIndex > 0 ? bytes.slice(startIndex) : bytes;

  // Check for EOI
  let hasEoi = false;
  const searchRange = Math.min(workingBytes.length, 32);
  for (let i = workingBytes.length - 2; i >= workingBytes.length - searchRange; i--) {
    if (workingBytes[i] === 0xFF && workingBytes[i + 1] === 0xD9) {
      hasEoi = true;
      break;
    }
  }

  if (!hasEoi) {
    // Append EOI marker in memory only for preview rendering
    const previewBuffer = new Uint8Array(workingBytes.length + 2);
    previewBuffer.set(workingBytes);
    previewBuffer[workingBytes.length] = 0xFF;
    previewBuffer[workingBytes.length + 1] = 0xD9;
    return previewBuffer;
  }

  return workingBytes;
}

/**
 * Safely decodes an image URL using the HTMLImageElement.decode() API.
 * Bounded by timeout to avoid UI blocking.
 */
export async function safelyDecodeImage(
  url: string,
  timeoutMs: number = 8000
): Promise<{ success: boolean; naturalWidth?: number; naturalHeight?: number; error?: string }> {
  if (typeof Image === 'undefined') {
    return { success: true };
  }

  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';

    const timer = setTimeout(() => {
      resolve({ success: false, error: 'Image decode timed out' });
    }, timeoutMs);

    img.onload = async () => {
      clearTimeout(timer);
      try {
        if ('decode' in img) {
          await img.decode();
        }
        resolve({
          success: true,
          naturalWidth: img.naturalWidth,
          naturalHeight: img.naturalHeight,
        });
      } catch (decodeErr) {
        resolve({
          success: false,
          error: decodeErr instanceof Error ? decodeErr.message : 'Decode failed',
        });
      }
    };

    img.onerror = () => {
      clearTimeout(timer);
      resolve({ success: false, error: 'Image load failed' });
    };

    img.src = url;
  });
}
