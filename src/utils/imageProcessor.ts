import { formatBytes } from './storageManager';

export interface ImageCompressionOptions {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number;
  skipThresholdBytes?: number;
}

export interface ImageCompressionResult {
  ok: boolean;
  dataUrl: string;
  originalBytes: number;
  compressedBytes: number;
  savedBytes: number;
  savedPercent: number;
  width: number;
  height: number;
  mimeType: string;
  wasCompressed: boolean;
  summaryText: string;
  error?: string;
}

/**
 * Estimates actual byte size of a Data URL string
 */
export function estimateDataUrlBytes(dataUrl: string): number {
  if (!dataUrl) return 0;
  const commaIdx = dataUrl.indexOf(',');
  if (commaIdx === -1) return dataUrl.length;
  const header = dataUrl.slice(0, commaIdx);
  const payload = dataUrl.slice(commaIdx + 1);
  if (header.includes(';base64')) {
    return Math.round((payload.length * 3) / 4);
  }
  return new TextEncoder().encode(payload).length;
}

/**
 * Checks whether a drawn image on a 2D canvas contains any non-opaque (transparent) pixels.
 * Samples on a small grid for speed.
 */
function hasTransparentPixels(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number
): boolean {
  try {
    const sampleW = Math.min(width, 64);
    const sampleH = Math.min(height, 64);
    const stepX = Math.max(1, Math.floor(width / sampleW));
    const stepY = Math.max(1, Math.floor(height / sampleH));
    const imgData = ctx.getImageData(0, 0, width, height).data;

    for (let y = 0; y < height; y += stepY) {
      for (let x = 0; x < width; x += stepX) {
        const alphaIdx = (y * width + x) * 4 + 3;
        if (imgData[alphaIdx] < 250) {
          return true;
        }
      }
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Unified, safe image processor for ImageInspector and DfmDrawingGallery:
 * 1. Preserves exact aspect ratio (never stretches).
 * 2. Preserves SVG files as SVG Data URIs without lossy JPEG rasterization.
 * 3. Preserves transparent PNG / WebP backgrounds instead of turning them black with JPEG.
 * 4. Avoids re-compressing images that already meet target dimensions and size.
 * 5. Handles FileReader, Image decoding, Canvas creation, and encoding errors gracefully.
 * 6. Returns before/after byte statistics so the user sees how much storage was saved.
 */
export async function processUploadedImageFile(
  file: File,
  options: ImageCompressionOptions = {}
): Promise<ImageCompressionResult> {
  const maxWidth = options.maxWidth ?? 1080;
  const maxHeight = options.maxHeight ?? 1080;
  const quality = options.quality ?? 0.85;
  const skipThresholdBytes = options.skipThresholdBytes ?? 160 * 1024; // 160 KB

  const originalBytes = file.size;
  const fileMime = (file.type || '').toLowerCase();

  // Read file as Data URL
  const rawDataUrl = await new Promise<string | null>((resolve) => {
    try {
      const reader = new FileReader();
      reader.onload = (e) => {
        resolve(typeof e.target?.result === 'string' ? e.target.result : null);
      };
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(file);
    } catch {
      resolve(null);
    }
  });

  if (!rawDataUrl) {
    return {
      ok: false,
      dataUrl: '',
      originalBytes,
      compressedBytes: 0,
      savedBytes: 0,
      savedPercent: 0,
      width: 0,
      height: 0,
      mimeType: fileMime,
      wasCompressed: false,
      summaryText: '',
      error: '圖片檔案讀取失敗，請確認檔案未損毀並重新選擇。',
    };
  }

  // Case 1: SVG vector image — keep original vector format without rasterizing to JPEG
  if (fileMime.includes('svg')) {
    const compressedBytes = estimateDataUrlBytes(rawDataUrl);
    return {
      ok: true,
      dataUrl: rawDataUrl,
      originalBytes,
      compressedBytes,
      savedBytes: 0,
      savedPercent: 0,
      width: 640,
      height: 360,
      mimeType: 'image/svg+xml',
      wasCompressed: false,
      summaryText: `SVG 向量圖面已原樣保留（大小：${formatBytes(compressedBytes)}，不進行破壞性壓縮）`,
    };
  }

  // Decode raster image dimensions
  const decodedImg = await new Promise<HTMLImageElement | null>((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = rawDataUrl;
  });

  if (!decodedImg) {
    return {
      ok: false,
      dataUrl: '',
      originalBytes,
      compressedBytes: 0,
      savedBytes: 0,
      savedPercent: 0,
      width: 0,
      height: 0,
      mimeType: fileMime,
      wasCompressed: false,
      summaryText: '',
      error: '無法解碼此圖片格式，請改用 PNG、JPG、WebP 或 SVG 格式圖片。',
    };
  }

  const naturalW = decodedImg.naturalWidth || decodedImg.width || 1;
  const naturalH = decodedImg.naturalHeight || decodedImg.height || 1;

  // Calculate aspect-ratio-preserving target dimensions (never upscale)
  const scale = Math.min(1, maxWidth / naturalW, maxHeight / naturalH);
  const targetW = Math.max(1, Math.round(naturalW * scale));
  const targetH = Math.max(1, Math.round(naturalH * scale));

  // Case 2: Image is already within target dimensions AND file size is already small -> skip re-compression
  if (scale === 1 && originalBytes <= skipThresholdBytes) {
    const actualBytes = estimateDataUrlBytes(rawDataUrl);
    return {
      ok: true,
      dataUrl: rawDataUrl,
      originalBytes,
      compressedBytes: actualBytes,
      savedBytes: 0,
      savedPercent: 0,
      width: naturalW,
      height: naturalH,
      mimeType: fileMime || 'image/png',
      wasCompressed: false,
      summaryText: `圖片已符合最佳尺寸 (${naturalW}×${naturalH} · ${formatBytes(
        originalBytes
      )})，已直接保留原始畫質無重複壓縮`,
    };
  }

  // Create Canvas for proportional resize / compression
  let canvas: HTMLCanvasElement | null = null;
  let ctx: CanvasRenderingContext2D | null = null;
  try {
    canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = targetH;
    ctx = canvas.getContext('2d');
  } catch {
    canvas = null;
    ctx = null;
  }

  if (!canvas || !ctx) {
    // Fallback to rawDataUrl if Canvas 2D is unavailable
    const fallbackBytes = estimateDataUrlBytes(rawDataUrl);
    return {
      ok: true,
      dataUrl: rawDataUrl,
      originalBytes,
      compressedBytes: fallbackBytes,
      savedBytes: 0,
      savedPercent: 0,
      width: naturalW,
      height: naturalH,
      mimeType: fileMime,
      wasCompressed: false,
      summaryText: `瀏覽器不支援 Canvas 壓縮，已保留原圖 (${formatBytes(
        fallbackBytes
      )})`,
    };
  }

  ctx.clearRect(0, 0, targetW, targetH);
  ctx.drawImage(decodedImg, 0, 0, targetW, targetH);

  // Determine whether image has transparency (for PNG / WebP / GIF)
  const mightHaveAlpha =
    fileMime.includes('png') ||
    fileMime.includes('webp') ||
    fileMime.includes('gif');
  const hasAlpha = mightHaveAlpha
    ? hasTransparentPixels(ctx, targetW, targetH)
    : false;

  let encodedDataUrl = '';
  let outputMime = 'image/jpeg';

  try {
    if (hasAlpha) {
      // Try WebP first (supports alpha with much smaller size), fallback to PNG if browser doesn't encode WebP
      const webpCandidate = canvas.toDataURL('image/webp', quality);
      if (webpCandidate.startsWith('data:image/webp')) {
        encodedDataUrl = webpCandidate;
        outputMime = 'image/webp';
      } else {
        encodedDataUrl = canvas.toDataURL('image/png');
        outputMime = 'image/png';
      }
    } else {
      encodedDataUrl = canvas.toDataURL('image/jpeg', quality);
      outputMime = 'image/jpeg';
    }
  } catch {
    encodedDataUrl = rawDataUrl;
    outputMime = fileMime || 'image/png';
  }

  const encodedBytes = estimateDataUrlBytes(encodedDataUrl);
  const rawBytes = estimateDataUrlBytes(rawDataUrl);

  // If re-encoding did not reduce size and dimensions didn't need shrinking, keep original
  if (encodedBytes >= rawBytes && scale === 1) {
    return {
      ok: true,
      dataUrl: rawDataUrl,
      originalBytes,
      compressedBytes: rawBytes,
      savedBytes: 0,
      savedPercent: 0,
      width: naturalW,
      height: naturalH,
      mimeType: fileMime || outputMime,
      wasCompressed: false,
      summaryText: `已保留原始最佳影像 (${naturalW}×${naturalH} · ${formatBytes(
        rawBytes
      )})`,
    };
  }

  const baselineBytes = Math.max(originalBytes, rawBytes);
  const savedBytes = Math.max(0, baselineBytes - encodedBytes);
  const savedPercent =
    baselineBytes > 0 ? Math.round((savedBytes / baselineBytes) * 100) : 0;

  return {
    ok: true,
    dataUrl: encodedDataUrl,
    originalBytes,
    compressedBytes: encodedBytes,
    savedBytes,
    savedPercent,
    width: targetW,
    height: targetH,
    mimeType: outputMime,
    wasCompressed: true,
    summaryText: `壓縮前 ${formatBytes(originalBytes)} → 壓縮後 ${formatBytes(
      encodedBytes
    )}（節省 ${savedPercent}% 空間 · 尺寸 ${targetW}×${targetH}${
      hasAlpha ? ' · 保留透明背景' : ''
    }）`,
  };
}
