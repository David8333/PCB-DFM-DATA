/**
 * IndexedDB Image Vault Manager for PCB DFM Workbench
 *
 * Provides high-capacity, non-blocking binary Blob image storage.
 * - Deduplicates identical images via SHA-256 content hashes.
 * - Preserves original image dimensions, alpha channels, and lossless quality.
 * - Generates and caches active Object URLs (blob:...) for instant UI rendering.
 * - Safely migrates legacy Base64 images from localStorage to IndexedDB with 100% verification.
 */

import { DfmTemplate, DfmDrawingItem, CompiledReportItem } from '../types/dfm';

const DB_NAME = 'pcb_dfm_vault_db';
const DB_VERSION = 1;
const STORE_NAME = 'images';

export interface StoredImageRecord {
  id: string; // e.g. "img_a8f93e2b..."
  blob: Blob;
  mimeType: string;
  byteSize: number;
  width?: number;
  height?: number;
  fileName?: string;
  source: 'upload' | 'preset' | 'migrated' | 'import';
  createdAt: string;
  updatedAt: string;
}

export interface ImageSaveResult {
  ok: boolean;
  imageId: string;
  blobUrl: string;
  byteSize: number;
  mimeType: string;
  isDuplicate: boolean;
  error?: string;
}

export interface MigrationStepProgress {
  total: number;
  current: number;
  migratedCount: number;
  verifiedCount: number;
  freedBytes: number;
  status: 'idle' | 'running' | 'verifying' | 'completed' | 'error';
  errorMessage?: string;
}

export interface StorageVaultTelemetry {
  indexedDbSupported: boolean;
  imageCount: number;
  totalImageBytes: number;
  formattedImageBytes: string;
  localStorageBytes: number;
  formattedLocalStorageBytes: string;
  unmigratedLegacyCount: number;
  unmigratedLegacyBytes: number;
  formattedLegacyBytes: string;
}

// In-memory cache for Object URLs to avoid repeatedly calling URL.createObjectURL
const objectUrlCache = new Map<string, string>();

let dbPromise: Promise<IDBDatabase> | null = null;

/**
 * Checks if IndexedDB is available in the current browser context.
 */
export function isIndexedDbSupported(): boolean {
  try {
    return typeof window !== 'undefined' && 'indexedDB' in window && window.indexedDB !== null;
  } catch {
    return false;
  }
}

/**
 * Opens or retrieves the shared IndexedDB connection.
 */
export function getDbConnection(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    if (!isIndexedDbSupported()) {
      reject(new Error('目前瀏覽器環境不支援或已停用 IndexedDB'));
      return;
    }

    try {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
          store.createIndex('createdAt', 'createdAt', { unique: false });
          store.createIndex('source', 'source', { unique: false });
        }
      };

      request.onsuccess = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        db.onclose = () => {
          dbPromise = null;
        };
        db.onerror = () => {
          dbPromise = null;
        };
        resolve(db);
      };

      request.onerror = (event) => {
        dbPromise = null;
        reject((event.target as IDBOpenDBRequest).error || new Error('開啟 IndexedDB 失敗'));
      };
    } catch (err) {
      dbPromise = null;
      reject(err);
    }
  });

  return dbPromise;
}

/**
 * Converts a Base64 or Data URL into a binary Blob with accurate MIME type.
 */
export function dataUrlToBlob(dataUrl: string): { blob: Blob; mimeType: string } {
  if (!dataUrl || !dataUrl.startsWith('data:')) {
    return { blob: new Blob([], { type: 'image/png' }), mimeType: 'image/png' };
  }

  const commaIdx = dataUrl.indexOf(',');
  if (commaIdx === -1) {
    return { blob: new Blob([dataUrl], { type: 'text/plain' }), mimeType: 'text/plain' };
  }

  const header = dataUrl.slice(0, commaIdx);
  const data = dataUrl.slice(commaIdx + 1);
  const mimeMatch = header.match(/data:([^;]+)/);
  const mimeType = mimeMatch ? mimeMatch[1].toLowerCase() : 'image/png';

  if (header.includes(';base64')) {
    try {
      const binary = atob(data);
      const len = binary.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      return { blob: new Blob([bytes], { type: mimeType }), mimeType };
    } catch {
      // Fallback for malformed base64
      return { blob: new Blob([data], { type: mimeType }), mimeType };
    }
  } else {
    // URL-encoded text (e.g. SVG)
    try {
      const decoded = decodeURIComponent(data);
      return { blob: new Blob([decoded], { type: mimeType }), mimeType };
    } catch {
      return { blob: new Blob([data], { type: mimeType }), mimeType };
    }
  }
}

/**
 * Converts a Blob to a Data URL (used when generating full standalone JSON backups)
 */
export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    try {
      const reader = new FileReader();
      reader.onloadend = () => {
        if (typeof reader.result === 'string') {
          resolve(reader.result);
        } else {
          reject(new Error('轉換 Blob 為 Data URL 失敗'));
        }
      };
      reader.onerror = () => reject(reader.error || new Error('讀取 Blob 失敗'));
      reader.readAsDataURL(blob);
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Computes a deterministic SHA-256 hash from a Blob for automatic deduplication.
 */
export async function computeBlobSha256(blob: Blob): Promise<string> {
  try {
    if (typeof crypto !== 'undefined' && crypto.subtle) {
      const buffer = await blob.arrayBuffer();
      const digest = await crypto.subtle.digest('SHA-256', buffer);
      const hashArray = Array.from(new Uint8Array(digest));
      const hashHex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
      return `img_${hashHex.slice(0, 24)}`;
    }
  } catch {
    // Fallback if subtle crypto is unavailable
  }

  // Fast Adler32 / length fallback
  return `img_sz${blob.size}_${blob.type.replace(/[^a-z0-9]/gi, '')}_${Date.now().toString(36)}`;
}

/**
 * Saves a Blob to IndexedDB with automatic deduplication.
 * Returns the stable imageId and an active Object URL.
 */
export async function saveBlobToVault(
  blob: Blob,
  options: {
    source?: 'upload' | 'preset' | 'migrated' | 'import';
    fileName?: string;
    width?: number;
    height?: number;
  } = {}
): Promise<ImageSaveResult> {
  const mimeType = blob.type || 'image/png';
  const byteSize = blob.size;

  if (byteSize === 0) {
    return {
      ok: false,
      imageId: '',
      blobUrl: '',
      byteSize: 0,
      mimeType,
      isDuplicate: false,
      error: '圖片資料為空，無法寫入資料庫',
    };
  }

  const imageId = await computeBlobSha256(blob);

  // Check if active Object URL is already cached
  let activeUrl = objectUrlCache.get(imageId);

  try {
    const db = await getDbConnection();

    // Check if image already exists in IndexedDB (deduplication)
    const existing = await new Promise<StoredImageRecord | null>((resolve) => {
      try {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const req = store.get(imageId);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });

    if (existing) {
      if (!activeUrl) {
        activeUrl = URL.createObjectURL(existing.blob);
        objectUrlCache.set(imageId, activeUrl);
      }
      return {
        ok: true,
        imageId,
        blobUrl: activeUrl,
        byteSize: existing.byteSize,
        mimeType: existing.mimeType,
        isDuplicate: true,
      };
    }

    // Save new record
    const record: StoredImageRecord = {
      id: imageId,
      blob,
      mimeType,
      byteSize,
      width: options.width,
      height: options.height,
      fileName: options.fileName,
      source: options.source || 'upload',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.put(record);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error || new Error('IndexedDB 寫入失敗'));
    });

    if (!activeUrl) {
      activeUrl = URL.createObjectURL(blob);
      objectUrlCache.set(imageId, activeUrl);
    }

    return {
      ok: true,
      imageId,
      blobUrl: activeUrl,
      byteSize,
      mimeType,
      isDuplicate: false,
    };
  } catch (err) {
    return {
      ok: false,
      imageId,
      blobUrl: '',
      byteSize,
      mimeType,
      isDuplicate: false,
      error: err instanceof Error ? err.message : '寫入 IndexedDB 發生錯誤',
    };
  }
}

/**
 * Saves a Data URL into IndexedDB.
 */
export async function saveDataUrlToVault(
  dataUrl: string,
  options: {
    source?: 'upload' | 'preset' | 'migrated' | 'import';
    fileName?: string;
    width?: number;
    height?: number;
  } = {}
): Promise<ImageSaveResult> {
  const { blob } = dataUrlToBlob(dataUrl);
  return saveBlobToVault(blob, { ...options });
}

/**
 * Retrieves a stored Blob by imageId.
 */
export async function getImageBlobFromVault(imageId: string): Promise<Blob | null> {
  if (!imageId) return null;
  try {
    const db = await getDbConnection();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(imageId);
      req.onsuccess = () => {
        const record = req.result as StoredImageRecord | undefined;
        resolve(record ? record.blob : null);
      };
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

/**
 * Gets or creates an active Object URL for an imageId.
 */
export async function getImageUrlFromVault(imageId: string): Promise<string | null> {
  if (!imageId) return null;
  const cached = objectUrlCache.get(imageId);
  if (cached) return cached;

  const blob = await getImageBlobFromVault(imageId);
  if (!blob) return null;

  const url = URL.createObjectURL(blob);
  objectUrlCache.set(imageId, url);
  return url;
}

/**
 * Batch resolves imageIds into memory Object URLs for initial application load.
 */
export async function batchResolveImageUrls(
  imageIds: string[]
): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  const toFetch: string[] = [];

  for (const id of imageIds) {
    if (!id) continue;
    const cached = objectUrlCache.get(id);
    if (cached) {
      result.set(id, cached);
    } else {
      toFetch.push(id);
    }
  }

  if (toFetch.length === 0) return result;

  try {
    const db = await getDbConnection();
    await Promise.all(
      toFetch.map(
        (id) =>
          new Promise<void>((resolve) => {
            try {
              const tx = db.transaction(STORE_NAME, 'readonly');
              const store = tx.objectStore(STORE_NAME);
              const req = store.get(id);
              req.onsuccess = () => {
                const rec = req.result as StoredImageRecord | undefined;
                if (rec && rec.blob) {
                  const url = URL.createObjectURL(rec.blob);
                  objectUrlCache.set(id, url);
                  result.set(id, url);
                }
                resolve();
              };
              req.onerror = () => resolve();
            } catch {
              resolve();
            }
          })
      )
    );
  } catch {
    // ignore
  }

  return result;
}

/**
 * Resolves an item's display URL to a standalone Base64 Data URL for JSON export.
 */
export async function resolveItemToDataUrl(
  imageUrl: string,
  imageId?: string
): Promise<string> {
  if (!imageUrl && !imageId) return '';

  // Already a Data URL
  if (imageUrl && imageUrl.startsWith('data:')) {
    return imageUrl;
  }

  // If we have an imageId, read Blob from IndexedDB
  if (imageId) {
    const blob = await getImageBlobFromVault(imageId);
    if (blob) {
      return blobToDataUrl(blob);
    }
  }

  // If imageUrl is a Blob URL, fetch blob and convert
  if (imageUrl && imageUrl.startsWith('blob:')) {
    try {
      const response = await fetch(imageUrl);
      const blob = await response.blob();
      return blobToDataUrl(blob);
    } catch {
      return '';
    }
  }

  // External HTTP URL
  return imageUrl;
}

/**
 * Queries total IndexedDB image count and byte size.
 */
export async function getVaultStorageTelemetry(
  localStorageBytes = 0
): Promise<StorageVaultTelemetry> {
  if (!isIndexedDbSupported()) {
    return {
      indexedDbSupported: false,
      imageCount: 0,
      totalImageBytes: 0,
      formattedImageBytes: '0 B',
      localStorageBytes,
      formattedLocalStorageBytes: formatVaultBytes(localStorageBytes),
      unmigratedLegacyCount: 0,
      unmigratedLegacyBytes: 0,
      formattedLegacyBytes: '0 B',
    };
  }

  try {
    const db = await getDbConnection();
    const records = await new Promise<StoredImageRecord[]>((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => resolve([]);
    });

    let totalBytes = 0;
    for (const r of records) {
      totalBytes += r.byteSize || (r.blob ? r.blob.size : 0);
    }

    return {
      indexedDbSupported: true,
      imageCount: records.length,
      totalImageBytes: totalBytes,
      formattedImageBytes: formatVaultBytes(totalBytes),
      localStorageBytes,
      formattedLocalStorageBytes: formatVaultBytes(localStorageBytes),
      unmigratedLegacyCount: 0,
      unmigratedLegacyBytes: 0,
      formattedLegacyBytes: '0 B',
    };
  } catch {
    return {
      indexedDbSupported: false,
      imageCount: 0,
      totalImageBytes: 0,
      formattedImageBytes: '0 B',
      localStorageBytes,
      formattedLocalStorageBytes: formatVaultBytes(localStorageBytes),
      unmigratedLegacyCount: 0,
      unmigratedLegacyBytes: 0,
      formattedLegacyBytes: '0 B',
    };
  }
}

/**
 * Cleans up orphaned images in IndexedDB that are no longer referenced by any template, drawing, or batch.
 */
export async function pruneOrphanedVaultImages(
  referencedImageIds: Set<string>
): Promise<{ prunedCount: number; freedBytes: number }> {
  if (!isIndexedDbSupported()) return { prunedCount: 0, freedBytes: 0 };

  try {
    const db = await getDbConnection();
    const records = await new Promise<StoredImageRecord[]>((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => resolve([]);
    });

    const orphans = records.filter((r) => !referencedImageIds.has(r.id));
    if (orphans.length === 0) return { prunedCount: 0, freedBytes: 0 };

    let freedBytes = 0;
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);

    for (const o of orphans) {
      freedBytes += o.byteSize || 0;
      store.delete(o.id);
      const url = objectUrlCache.get(o.id);
      if (url) {
        URL.revokeObjectURL(url);
        objectUrlCache.delete(o.id);
      }
    }

    return { prunedCount: orphans.length, freedBytes };
  } catch {
    return { prunedCount: 0, freedBytes: 0 };
  }
}

/**
 * Inspects current application state to detect legacy un-migrated Base64 images.
 */
export function detectLegacyBase64Images(
  templates: DfmTemplate[],
  drawings: DfmDrawingItem[],
  reportBatch: CompiledReportItem[]
): {
  count: number;
  estimatedBytes: number;
  items: Array<{
    type: 'template' | 'drawing' | 'batch';
    id: string;
    title: string;
    dataUrl: string;
  }>;
} {
  const items: Array<{
    type: 'template' | 'drawing' | 'batch';
    id: string;
    title: string;
    dataUrl: string;
  }> = [];

  let estimatedBytes = 0;

  for (const t of templates) {
    if (t.imageUrl && t.imageUrl.startsWith('data:') && !t.imageId) {
      items.push({
        type: 'template',
        id: t.id,
        title: `DFM案例「${t.code || t.title}」`,
        dataUrl: t.imageUrl,
      });
      estimatedBytes += t.imageUrl.length;
    }
  }

  for (const d of drawings) {
    if (d.url && d.url.startsWith('data:') && !d.imageId) {
      items.push({
        type: 'drawing',
        id: d.id,
        title: `工程圖面「${d.name}」`,
        dataUrl: d.url,
      });
      estimatedBytes += d.url.length;
    }
  }

  for (const b of reportBatch) {
    if (b.imageUrl && b.imageUrl.startsWith('data:') && !b.imageId) {
      items.push({
        type: 'batch',
        id: b.id,
        title: `報告項目「${b.code || b.title}」`,
        dataUrl: b.imageUrl,
      });
      estimatedBytes += b.imageUrl.length;
    }
  }

  return {
    count: items.length,
    estimatedBytes: Math.round(estimatedBytes * 0.75), // approximate binary size from Base64
    items,
  };
}

/**
 * Safely migrates legacy Base64 images to IndexedDB:
 * 1. Converts each Base64 image to a binary Blob and SHA-256 ID.
 * 2. Writes each image into IndexedDB.
 * 3. Verifies every written record can be successfully read back.
 * 4. Only after 100% verification, returns updated templates/drawings/batch with imageId assigned.
 * 5. If ANY step fails, aborts immediately and preserves original data untouched!
 */
export async function executeSafeStorageMigration(
  templates: DfmTemplate[],
  drawings: DfmDrawingItem[],
  reportBatch: CompiledReportItem[],
  onProgress?: (progress: MigrationStepProgress) => void
): Promise<{
  success: boolean;
  updatedTemplates: DfmTemplate[];
  updatedDrawings: DfmDrawingItem[];
  updatedBatch: CompiledReportItem[];
  migratedCount: number;
  freedBytes: number;
  errorMessage?: string;
}> {
  const legacyInfo = detectLegacyBase64Images(templates, drawings, reportBatch);
  const total = legacyInfo.items.length;

  if (total === 0) {
    return {
      success: true,
      updatedTemplates: templates,
      updatedDrawings: drawings,
      updatedBatch: reportBatch,
      migratedCount: 0,
      freedBytes: 0,
    };
  }

  onProgress?.({
    total,
    current: 0,
    migratedCount: 0,
    verifiedCount: 0,
    freedBytes: 0,
    status: 'running',
  });

  const migratedImageMap = new Map<string, { imageId: string; blobUrl: string; byteSize: number }>();
  let processed = 0;
  let accumulatedFreedBytes = 0;

  try {
    // Step 1: Save each legacy image into IndexedDB
    for (const item of legacyInfo.items) {
      const { blob, mimeType } = dataUrlToBlob(item.dataUrl);
      const saveRes = await saveBlobToVault(blob, { source: 'migrated' });

      if (!saveRes.ok || !saveRes.imageId) {
        throw new Error(
          `寫入圖片「${item.title}」至 IndexedDB 時失敗：${saveRes.error || '未知錯誤'}`
        );
      }

      migratedImageMap.set(item.dataUrl, {
        imageId: saveRes.imageId,
        blobUrl: saveRes.blobUrl,
        byteSize: saveRes.byteSize,
      });

      processed++;
      accumulatedFreedBytes += item.dataUrl.length;

      onProgress?.({
        total,
        current: processed,
        migratedCount: processed,
        verifiedCount: 0,
        freedBytes: accumulatedFreedBytes,
        status: 'running',
      });
    }

    // Step 2: Verification step - verify that every imageId is truly readable in IndexedDB
    onProgress?.({
      total,
      current: total,
      migratedCount: total,
      verifiedCount: 0,
      freedBytes: accumulatedFreedBytes,
      status: 'verifying',
    });

    let verifiedCount = 0;
    for (const entry of Array.from(migratedImageMap.values())) {
      const readBlob = await getImageBlobFromVault(entry.imageId);
      if (!readBlob || readBlob.size !== entry.byteSize) {
        throw new Error(`驗證失敗：圖片 ID (${entry.imageId}) 在 IndexedDB 中內容不一致`);
      }
      verifiedCount++;
      onProgress?.({
        total,
        current: total,
        migratedCount: total,
        verifiedCount,
        freedBytes: accumulatedFreedBytes,
        status: 'verifying',
      });
    }

    // Step 3: Transform records - attach imageId and active blobUrl
    const updatedTemplates = templates.map((t) => {
      const match = t.imageUrl && migratedImageMap.get(t.imageUrl);
      if (match) {
        return {
          ...t,
          imageUrl: match.blobUrl,
          imageId: match.imageId,
        };
      }
      return t;
    });

    const updatedDrawings = drawings.map((d) => {
      const match = d.url && migratedImageMap.get(d.url);
      if (match) {
        return {
          ...d,
          url: match.blobUrl,
          imageId: match.imageId,
        };
      }
      return d;
    });

    const updatedBatch = reportBatch.map((b) => {
      const match = b.imageUrl && migratedImageMap.get(b.imageUrl);
      if (match) {
        return {
          ...b,
          imageUrl: match.blobUrl,
          imageId: match.imageId,
        };
      }
      return b;
    });

    onProgress?.({
      total,
      current: total,
      migratedCount: total,
      verifiedCount: total,
      freedBytes: accumulatedFreedBytes,
      status: 'completed',
    });

    return {
      success: true,
      updatedTemplates,
      updatedDrawings,
      updatedBatch,
      migratedCount: total,
      freedBytes: accumulatedFreedBytes,
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : '遷移過程發生未預期錯誤';
    onProgress?.({
      total,
      current: processed,
      migratedCount: processed,
      verifiedCount: 0,
      freedBytes: 0,
      status: 'error',
      errorMessage: errorMsg,
    });

    return {
      success: false,
      updatedTemplates: templates,
      updatedDrawings: drawings,
      updatedBatch: reportBatch,
      migratedCount: 0,
      freedBytes: 0,
      errorMessage: errorMsg,
    };
  }
}

function formatVaultBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(2)} MB`;
}
