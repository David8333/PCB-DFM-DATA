import {
  DfmTemplate,
  ReferenceSpecItem,
  CompiledReportItem,
  DfmDrawingItem,
} from '../types/dfm';
import {
  DEFAULT_DFM_TEMPLATES,
  DFM_CATEGORIES,
  DEFAULT_REFERENCE_SPECS,
  PRESET_CAD_DIAGRAMS,
} from '../data/defaultTemplates';

export const STORAGE_KEYS = {
  TEMPLATES: 'dfm_vault_templates_v2',
  TEMPLATES_LEGACY_V1: 'dfm_vault_templates_v1',
  SPECS: 'dfm_vault_specs_v2',
  SPECS_LEGACY_V1: 'dfm_vault_specs_v1',
  BATCH: 'dfm_vault_report_batch_v2',
  BATCH_LEGACY_V1: 'dfm_vault_report_batch_v1',
  DRAWINGS: 'dfm_vault_drawings_v2',
  LAST_BACKUP_AT: 'dfm_vault_last_backup_at_v2',
} as const;

export type SaveStatusType = 'saved' | 'saving' | 'error';

export interface StorageSaveResult {
  ok: boolean;
  errorType?: 'quota' | 'security' | 'serialization' | 'unknown';
  message?: string;
  savedAt?: string;
}

export interface StorageMetricsEstimate {
  templateCount: number;
  drawingCount: number;
  specCount: number;
  batchCount: number;
  totalImageCount: number;
  estimatedJsonBytes: number;
  estimatedUtf16Bytes: number;
  formattedJsonSize: string;
  formattedUtf16Size: string;
}

/**
 * Formats byte count into human-readable KB / MB string
 */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(2)} MB`;
}

/**
 * Detects whether a DOMException / Error is a localStorage QuotaExceededError
 * across Chrome, Edge, Safari, and Firefox.
 */
function isQuotaExceededError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const domErr = err as { name?: string; code?: number; message?: string };
  return (
    domErr.name === 'QuotaExceededError' ||
    domErr.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
    domErr.code === 22 ||
    domErr.code === 1014 ||
    Boolean(
      domErr.message &&
        (domErr.message.toLowerCase().includes('quota') ||
          domErr.message.toLowerCase().includes('exceeded'))
    )
  );
}

function isSecurityError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const domErr = err as { name?: string; code?: number };
  return domErr.name === 'SecurityError' || domErr.code === 18;
}

/**
 * Safely reads and parses a JSON value from localStorage with optional legacy key fallback.
 * Never deletes or overwrites existing keys if parsing fails.
 */
export function safeReadStorage<T>(
  primaryKey: string,
  validator: (val: unknown) => val is T,
  fallbackValue: T,
  legacyKey?: string
): { data: T; warning?: string } {
  try {
    const raw = localStorage.getItem(primaryKey);
    if (raw !== null) {
      const parsed: unknown = JSON.parse(raw);
      if (validator(parsed)) {
        return { data: parsed };
      }
      return {
        data: fallbackValue,
        warning: `本機儲存項目 (${primaryKey}) 格式異常，已載入預設安全結構，原儲存資料未被刪除。`,
      };
    }

    if (legacyKey) {
      const legacyRaw = localStorage.getItem(legacyKey);
      if (legacyRaw !== null) {
        const legacyParsed: unknown = JSON.parse(legacyRaw);
        if (validator(legacyParsed)) {
          return { data: legacyParsed };
        }
      }
    }
  } catch (err) {
    if (isSecurityError(err)) {
      return {
        data: fallbackValue,
        warning:
          '瀏覽器隱私設定或無痕模式限制存取 localStorage，目前變更僅暫存於記憶體中，請記得使用「匯出 JSON」備份。',
      };
    }
    return {
      data: fallbackValue,
      warning: `讀取本機資料 (${primaryKey}) 時發生 JSON 解析錯誤，已保留原始儲存內容並載入安全預設值。`,
    };
  }

  return { data: fallbackValue };
}

/**
 * Safely serializes and writes data to localStorage.
 * - Never deletes existing data on failure.
 * - Never claims success unless localStorage.setItem completes without error.
 */
export function safeWriteStorage<T>(
  key: string,
  value: T
): StorageSaveResult {
  let serialized: string;
  try {
    serialized = JSON.stringify(value);
  } catch {
    return {
      ok: false,
      errorType: 'serialization',
      message: '資料序列化失敗，請先點選右上角「匯出 JSON」備份目前畫面中的資料。',
    };
  }

  try {
    localStorage.setItem(key, serialized);
    const savedAt = new Date().toLocaleTimeString('zh-TW', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    return {
      ok: true,
      savedAt,
    };
  } catch (err) {
    if (isQuotaExceededError(err)) {
      return {
        ok: false,
        errorType: 'quota',
        message:
          '瀏覽器本機儲存空間 (localStorage) 已達上限！目前畫面中的最新修改仍保留在記憶體中（未遺失），請立即點選右上角「匯出 JSON」備份完整檔案，並考慮移除或壓縮部分大型圖片。',
      };
    }
    if (isSecurityError(err)) {
      return {
        ok: false,
        errorType: 'security',
        message:
          '瀏覽器安全性設定拒絕寫入本機儲存空間（可能處於限制 Cookie 或特殊無痕環境）。目前畫面資料仍保留，請使用「匯出 JSON」手動備份。',
      };
    }
    return {
      ok: false,
      errorType: 'unknown',
      message:
        '寫入本機儲存空間時發生未預期錯誤。目前畫面資料仍保留，請先點選「匯出 JSON」下載備份檔。',
    };
  }
}

/**
 * Creates a lean version of items for localStorage serialization.
 * Strips heavy data: URLs from items that have an imageId stored in IndexedDB.
 */
export function stripImagesForLocalStorage<
  T extends { imageUrl?: string; url?: string; imageId?: string }
>(items: T[]): T[] {
  return items.map((item) => {
    if (item.imageId) {
      if ('imageUrl' in item) {
        return { ...item, imageUrl: '' };
      }
      if ('url' in item) {
        return { ...item, url: '' };
      }
    }
    return item;
  });
}

/**
 * Initial loaders with legacy migration & field normalization
 */
export function loadInitialTemplates(): {
  templates: DfmTemplate[];
  warning?: string;
} {
  const res = safeReadStorage<DfmTemplate[]>(
    STORAGE_KEYS.TEMPLATES,
    (val): val is DfmTemplate[] => Array.isArray(val) && val.length > 0,
    DEFAULT_DFM_TEMPLATES,
    STORAGE_KEYS.TEMPLATES_LEGACY_V1
  );

  const normalized = res.data.map((tpl) => ({
    ...tpl,
    category: DFM_CATEGORIES.includes(tpl.category)
      ? tpl.category
      : 'PCB Layout',
    referenceModel: tpl.referenceModel ?? '',
    imageId: tpl.imageId,
    imageUrl: tpl.imageUrl ?? '',
    imageCaption: tpl.imageCaption ?? '',
    annotations: Array.isArray(tpl.annotations) ? tpl.annotations : [],
    variableDefaults:
      tpl.variableDefaults && typeof tpl.variableDefaults === 'object'
        ? tpl.variableDefaults
        : {},
  }));

  return { templates: normalized, warning: res.warning };
}

export function loadInitialSpecs(): {
  specs: ReferenceSpecItem[];
  warning?: string;
} {
  const res = safeReadStorage<ReferenceSpecItem[]>(
    STORAGE_KEYS.SPECS,
    (val): val is ReferenceSpecItem[] => Array.isArray(val),
    DEFAULT_REFERENCE_SPECS,
    STORAGE_KEYS.SPECS_LEGACY_V1
  );
  return { specs: res.data, warning: res.warning };
}

export function loadInitialBatch(): {
  batch: CompiledReportItem[];
  warning?: string;
} {
  const res = safeReadStorage<CompiledReportItem[]>(
    STORAGE_KEYS.BATCH,
    (val): val is CompiledReportItem[] => Array.isArray(val),
    [],
    STORAGE_KEYS.BATCH_LEGACY_V1
  );
  const normalized = res.data.map((b) => ({
    ...b,
    imageId: b.imageId,
    imageUrl: b.imageUrl ?? '',
  }));
  return { batch: normalized, warning: res.warning };
}

export function loadInitialDrawings(): {
  drawings: DfmDrawingItem[];
  warning?: string;
} {
  const res = safeReadStorage<DfmDrawingItem[]>(
    STORAGE_KEYS.DRAWINGS,
    (val): val is DfmDrawingItem[] => Array.isArray(val) && val.length > 0,
    PRESET_CAD_DIAGRAMS
  );
  const normalized = res.data.map((d) => ({
    ...d,
    category: DFM_CATEGORIES.includes(d.category) ? d.category : 'PCB Layout',
    imageId: d.imageId,
    url: d.url ?? '',
    description: d.description ?? '',
    annotations: Array.isArray(d.annotations) ? d.annotations : [],
    updatedAt: d.updatedAt || new Date().toISOString().slice(0, 10),
  }));
  return { drawings: normalized, warning: res.warning };
}

export function loadLastBackupTime(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEYS.LAST_BACKUP_AT);
  } catch {
    return null;
  }
}

export function saveLastBackupTime(timestampStr: string): void {
  try {
    localStorage.setItem(STORAGE_KEYS.LAST_BACKUP_AT, timestampStr);
  } catch {
    // ignore if quota is full when recording timestamp
  }
}

/**
 * Estimates total data size and counts without claiming exact browser quota limits.
 * Uses character lengths of fields directly to avoid running full JSON.stringify on every render.
 */
export function estimateStorageMetrics(
  templates: DfmTemplate[],
  drawings: DfmDrawingItem[],
  specs: ReferenceSpecItem[],
  reportBatch: CompiledReportItem[]
): StorageMetricsEstimate {
  let charCount = 120; // JSON wrapper overhead
  let templateWithImgCount = 0;
  let drawingWithImgCount = 0;

  for (let i = 0; i < templates.length; i++) {
    const t = templates[i];
    if ((t.imageUrl && t.imageUrl.trim() !== '') || t.imageId) {
      templateWithImgCount++;
    }
    // If stored in IndexedDB (imageId is present), imageUrl is stripped in localStorage
    const storedImgLength = t.imageId ? (t.imageId.length + 15) : (t.imageUrl?.length || 0);

    charCount +=
      180 +
      (t.id?.length || 0) +
      (t.code?.length || 0) +
      (t.title?.length || 0) +
      (t.category?.length || 0) +
      (t.referenceModel?.length || 0) +
      (t.issueTemplate?.length || 0) +
      (t.recommendationTemplate?.length || 0) +
      (t.referenceSpec?.length || 0) +
      storedImgLength +
      (t.imageCaption?.length || 0) +
      (t.annotations?.length || 0) * 60;
  }

  for (let i = 0; i < drawings.length; i++) {
    const d = drawings[i];
    if ((d.url && d.url.trim() !== '') || d.imageId) {
      drawingWithImgCount++;
    }
    const storedImgLength = d.imageId ? (d.imageId.length + 15) : (d.url?.length || 0);

    charCount +=
      120 +
      (d.id?.length || 0) +
      (d.name?.length || 0) +
      (d.category?.length || 0) +
      storedImgLength +
      (d.description?.length || 0) +
      (d.annotations?.length || 0) * 60;
  }

  for (let i = 0; i < specs.length; i++) {
    const s = specs[i];
    charCount +=
      80 +
      (s.id?.length || 0) +
      (s.title?.length || 0) +
      (s.content?.length || 0);
  }

  for (let i = 0; i < reportBatch.length; i++) {
    const b = reportBatch[i];
    const storedImgLength = b.imageId ? (b.imageId.length + 15) : (b.imageUrl?.length || 0);
    charCount +=
      180 +
      (b.compiledIssue?.length || 0) +
      (b.compiledRecommendation?.length || 0) +
      storedImgLength +
      (b.referenceSpec?.length || 0);
  }

  // Approximate UTF-8 JSON file size vs. browser DOMString UTF-16 memory representation
  const estimatedJsonBytes = Math.round(charCount * 1.05);
  const estimatedUtf16Bytes = charCount * 2;

  return {
    templateCount: templates.length,
    drawingCount: drawings.length,
    specCount: specs.length,
    batchCount: reportBatch.length,
    totalImageCount: templateWithImgCount + drawingWithImgCount,
    estimatedJsonBytes,
    estimatedUtf16Bytes,
    formattedJsonSize: formatBytes(estimatedJsonBytes),
    formattedUtf16Size: formatBytes(estimatedUtf16Bytes),
  };
}
