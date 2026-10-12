/**
 * Image Repair and Decoding Resilience Utility
 * Handles corrupted, truncated, or non-standard JPEGs (e.g. IMG20261010090240.jpg)
 * without modifying original files on disk.
 */

/**
 * Checks and fixes common JPEG corruption:
 * 1. Strips leading byte corruption before SOI marker (0xFF, 0xD8).
 * 2. Appends missing EOI marker (0xFF, 0xD9) if truncated mid-stream.
 */
export function repairJpegBuffer(bytes: Uint8Array): Uint8Array {
  if (bytes.length < 4) return bytes;

  // Find SOI (Start of Image) marker: 0xFF, 0xD8
  let startIndex = -1;
  for (let i = 0; i < Math.min(bytes.length - 1, 4096); i++) {
    if (bytes[i] === 0xFF && bytes[i + 1] === 0xD8) {
      startIndex = i;
      break;
    }
  }

  if (startIndex === -1) {
    // Not a standard JPEG or missing SOI; return as is
    return bytes;
  }

  let workingBytes = startIndex > 0 ? bytes.slice(startIndex) : bytes;

  // Check EOI (End of Image) marker: 0xFF, 0xD9 at or near end
  let hasEoi = false;
  const searchRange = Math.min(workingBytes.length, 32);
  for (let i = workingBytes.length - 2; i >= workingBytes.length - searchRange; i--) {
    if (workingBytes[i] === 0xFF && workingBytes[i + 1] === 0xD9) {
      hasEoi = true;
      break;
    }
  }

  // If missing EOI, append it
  if (!hasEoi) {
    const repaired = new Uint8Array(workingBytes.length + 2);
    repaired.set(workingBytes);
    repaired[workingBytes.length] = 0xFF;
    repaired[workingBytes.length + 1] = 0xD9;
    return repaired;
  }

  return workingBytes;
}

/**
 * Safely decodes an image URL using the HTMLImageElement.decode() API.
 * Bounded by timeout to avoid blocking.
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
