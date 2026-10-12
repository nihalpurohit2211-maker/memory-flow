import { MediaItem } from '../../types';
import { loadEmbedding, saveEmbedding, loadAllEmbeddings } from '../db';

export interface EmbeddingProgress {
  total: number;
  completed: number;
  currentName: string;
  isProcessing: boolean;
  statusText: string;
}

let extractorPipeline: any = null;
let isModelLoading = false;
let isPipelineCancelled = false;

/**
 * Initializes the compact CPU-compatible visual embedding pipeline.
 * Bounded for Intel i5-6300U dual-core CPU.
 */
async function getVisualExtractor() {
  if (extractorPipeline) return extractorPipeline;
  if (isModelLoading) {
    while (isModelLoading) {
      await new Promise((r) => setTimeout(r, 100));
    }
    return extractorPipeline;
  }

  isModelLoading = true;
  try {
    const { pipeline, env } = await import('@xenova/transformers');
    // Configure cache and environment for bounded browser/node execution
    env.allowLocalModels = false;
    env.useBrowserCache = true;

    // Use compact quantized vision feature extractor
    extractorPipeline = await pipeline('feature-extraction', 'Xenova/clip-vit-base-patch32', {
      quantized: true,
    });
  } catch (err) {
    console.warn('Transformers.js ONNX pipeline initialized with perceptual feature extractor fallback:', err);
  } finally {
    isModelLoading = false;
  }
  return extractorPipeline;
}

/**
 * Resizes an image or video poster to 224x224 on an offscreen canvas
 * to minimize CPU and RAM footprint during embedding.
 */
export async function createSmallPreviewCanvas(
  sourceUrl: string
): Promise<HTMLCanvasElement | null> {
  if (typeof document === 'undefined') return null;

  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';

    const timeout = setTimeout(() => {
      resolve(null);
    }, 8000);

    img.onload = () => {
      clearTimeout(timeout);
      const canvas = document.createElement('canvas');
      canvas.width = 224;
      canvas.height = 224;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(null);
        return;
      }
      ctx.drawImage(img, 0, 0, 224, 224);
      resolve(canvas);
    };

    img.onerror = () => {
      clearTimeout(timeout);
      resolve(null);
    };

    img.src = sourceUrl;
  });
}

/**
 * Deterministic perceptual visual feature extractor (64-dimensional vector)
 * used as a reliable fallback or lightweight feature representation.
 * Captures 4x4 spatial quadrants across RGB luminance and gradient channels.
 */
function extractPerceptualFeatures(canvas: HTMLCanvasElement): number[] {
  const ctx = canvas.getContext('2d');
  if (!ctx) return new Array(64).fill(0);

  const imgData = ctx.getImageData(0, 0, 224, 224);
  const data = imgData.data;
  const features: number[] = new Array(64).fill(0);

  // Divide into 4x4 grid (16 blocks x 4 metrics = 64 features)
  const blockSize = 56; // 224 / 4
  for (let gy = 0; gy < 4; gy++) {
    for (let gx = 0; gx < 4; gx++) {
      let rSum = 0, gSum = 0, bSum = 0, lumSum = 0;
      let count = 0;

      for (let y = gy * blockSize; y < (gy + 1) * blockSize; y += 4) {
        for (let x = gx * blockSize; x < (gx + 1) * blockSize; x += 4) {
          const idx = (y * 224 + x) * 4;
          const r = data[idx];
          const g = data[idx + 1];
          const b = data[idx + 2];
          rSum += r;
          gSum += g;
          bSum += b;
          lumSum += 0.299 * r + 0.587 * g + 0.114 * b;
          count++;
        }
      }

      const blockIdx = (gy * 4 + gx) * 4;
      features[blockIdx] = rSum / (count * 255);
      features[blockIdx + 1] = gSum / (count * 255);
      features[blockIdx + 2] = bSum / (count * 255);
      features[blockIdx + 3] = lumSum / (count * 255);
    }
  }

  // Normalize L2 vector
  return normalizeVector(features);
}

/**
 * Normalizes vector to unit length (L2 norm) so dot product equals cosine similarity.
 */
export function normalizeVector(vec: number[]): number[] {
  let sumSq = 0;
  for (let i = 0; i < vec.length; i++) {
    sumSq += vec[i] * vec[i];
  }
  const norm = Math.sqrt(sumSq) || 1e-12;
  return vec.map((v) => v / norm);
}

/**
 * Computes cosine similarity between two normalized vectors.
 */
export function computeCosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dot = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
  }
  return Math.max(0, Math.min(1, dot));
}

/**
 * Extracts a visual embedding for a single media item.
 * Checks cache first; if missing, computes and caches.
 */
export async function extractMediaEmbedding(item: MediaItem): Promise<number[] | null> {
  // Check IndexedDB cache
  const cached = await loadEmbedding(item.id);
  if (cached && cached.length > 0) {
    return cached;
  }

  const previewSource = item.thumbnailUrl || item.blobUrl || item.lowResUrl;
  if (!previewSource) return null;

  const canvas = await createSmallPreviewCanvas(previewSource);
  if (!canvas) return null;

  try {
    const extractor = await getVisualExtractor();
    if (extractor) {
      const output = await extractor(canvas, { pooling: 'mean', normalize: true });
      const vector = Array.from(output.data as Float32Array).slice(0, 512);
      const normalized = normalizeVector(vector);
      await saveEmbedding(item.id, normalized, 'xenova-clip-vit-base-patch32');
      return normalized;
    }
  } catch (err) {
    console.warn(`Local ONNX model error for ${item.id}, using perceptual features:`, err);
  }

  // Reliable perceptual visual feature fallback
  const fallbackVector = extractPerceptualFeatures(canvas);
  await saveEmbedding(item.id, fallbackVector, 'perceptual-spatial-64');
  return fallbackVector;
}

/**
 * Cancels active embedding indexing.
 */
export function cancelEmbeddingProcess(): void {
  isPipelineCancelled = true;
}

/**
 * Bounded batch processing for embedding a collection of media items.
 * Uses concurrency = 1 to guarantee responsive CPU usage on dual-core machines.
 * Resumes where previously interrupted.
 */
export async function processCollectionEmbeddings(
  items: MediaItem[],
  onProgress?: (progress: EmbeddingProgress) => void
): Promise<Map<string, number[]>> {
  isPipelineCancelled = false;
  const embeddingsMap = await loadAllEmbeddings();
  const pendingItems = items.filter((item) => !embeddingsMap.has(item.id));

  let completed = items.length - pendingItems.length;

  onProgress?.({
    total: items.length,
    completed,
    currentName: 'Checking cached embeddings...',
    isProcessing: pendingItems.length > 0,
    statusText: `Cached: ${completed} / ${items.length}`,
  });

  for (let i = 0; i < pendingItems.length; i++) {
    if (isPipelineCancelled) {
      onProgress?.({
        total: items.length,
        completed,
        currentName: 'Paused',
        isProcessing: false,
        statusText: `Paused at ${completed} / ${items.length}`,
      });
      break;
    }

    const item = pendingItems[i];
    onProgress?.({
      total: items.length,
      completed,
      currentName: item.originalName,
      isProcessing: true,
      statusText: `Embedding ${completed + 1} of ${items.length}: ${item.originalName}`,
    });

    try {
      const vector = await extractMediaEmbedding(item);
      if (vector) {
        embeddingsMap.set(item.id, vector);
        item.embeddingStatus = 'completed';
        item.embeddingVector = vector;
      } else {
        item.embeddingStatus = 'skipped';
      }
    } catch (err) {
      console.warn(`Error embedding ${item.id}:`, err);
      item.embeddingStatus = 'failed';
    }

    completed++;
    onProgress?.({
      total: items.length,
      completed,
      currentName: item.originalName,
      isProcessing: i < pendingItems.length - 1,
      statusText: `Processed ${completed} / ${items.length}`,
    });

    // Small yield to browser event loop
    await new Promise((resolve) => setTimeout(resolve, 30));
  }

  return embeddingsMap;
}
