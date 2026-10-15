import {
  DfmTemplate,
  DfmCategory,
  ReferenceSpecItem,
  DfmDrawingItem,
  CompiledReportItem,
  ImageAnnotation,
} from '../types/dfm';
import { DFM_CATEGORIES } from '../data/defaultTemplates';
import { formatBytes } from './storageManager';
import { resolveItemToDataUrl, saveDataUrlToVault, isIndexedDbSupported } from './indexedDbManager';

export interface BackupSummaryInfo {
  fileName: string;
  fileSizeBytes: number;
  formattedFileSize: string;
  templateCount: number;
  specCount: number;
  drawingCount: number;
  batchCount: number;
  totalImageCount: number;
  version: string;
  exportedAt: string;
}

export interface ValidatedBackupPayload {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  summary: BackupSummaryInfo;
  templates: DfmTemplate[];
  specs: ReferenceSpecItem[] | null;
  drawings: DfmDrawingItem[] | null;
  reportBatch: CompiledReportItem[] | null;
}

function sanitizeAnnotations(raw: unknown): ImageAnnotation[] {
  if (!Array.isArray(raw)) return [];
  const result: ImageAnnotation[] = [];
  for (let i = 0; i < raw.length; i++) {
    const item = raw[i];
    if (!item || typeof item !== 'object') continue;
    const rec = item as Record<string, unknown>;
    const x = typeof rec.x === 'number' && Number.isFinite(rec.x) ? rec.x : 50;
    const y = typeof rec.y === 'number' && Number.isFinite(rec.y) ? rec.y : 50;
    result.push({
      id: typeof rec.id === 'string' && rec.id ? rec.id : `pin-${Date.now()}-${i}`,
      x: Math.max(0, Math.min(100, x)),
      y: Math.max(0, Math.min(100, y)),
      label: typeof rec.label === 'string' ? rec.label : `標註 #${i + 1}`,
    });
  }
  return result;
}

function sanitizeVariableDefaults(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const result: Record<string, string> = {};
  const entries = Object.entries(raw as Record<string, unknown>);
  for (let i = 0; i < entries.length; i++) {
    const [k, v] = entries[i];
    if (typeof v === 'string') {
      result[k] = v;
    } else if (typeof v === 'number' || typeof v === 'boolean') {
      result[k] = String(v);
    }
  }
  return result;
}

/**
 * Parses and validates an imported JSON file (supporting both legacy v1/v2 array format
 * and full workbench object format) WITHOUT mutating current application state.
 */
export function parseAndValidateBackupJson(
  rawText: string,
  fileName: string,
  fileSizeBytes: number
): ValidatedBackupPayload {
  const errors: string[] = [];
  const warnings: string[] = [];
  const today = new Date().toISOString().slice(0, 10);

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    return {
      isValid: false,
      errors: ['JSON 語法解析失敗：檔案不是有效的 JSON 格式，請確認檔案是否完整。'],
      warnings: [],
      summary: {
        fileName,
        fileSizeBytes,
        formattedFileSize: formatBytes(fileSizeBytes),
        templateCount: 0,
        specCount: 0,
        drawingCount: 0,
        batchCount: 0,
        totalImageCount: 0,
        version: '未知',
        exportedAt: '-',
      },
      templates: [],
      specs: null,
      drawings: null,
      reportBatch: null,
    };
  }

  if (!parsed || typeof parsed !== 'object') {
    return {
      isValid: false,
      errors: ['匯入失敗：JSON 根節點必須為物件或 DFM 案例陣列。'],
      warnings: [],
      summary: {
        fileName,
        fileSizeBytes,
        formattedFileSize: formatBytes(fileSizeBytes),
        templateCount: 0,
        specCount: 0,
        drawingCount: 0,
        batchCount: 0,
        totalImageCount: 0,
        version: '未知',
        exportedAt: '-',
      },
      templates: [],
      specs: null,
      drawings: null,
      reportBatch: null,
    };
  }

  const isLegacyArray = Array.isArray(parsed);
  const rootObj = isLegacyArray
    ? ({ templates: parsed } as Record<string, unknown>)
    : (parsed as Record<string, unknown>);

  const rawTemplates = Array.isArray(rootObj.templates)
    ? rootObj.templates
    : null;

  if (!rawTemplates || rawTemplates.length === 0) {
    return {
      isValid: false,
      errors: [
        '匯入失敗：JSON 檔案中未找到有效的「templates」DFM 案例陣列，或案例數量為 0。',
      ],
      warnings: [],
      summary: {
        fileName,
        fileSizeBytes,
        formattedFileSize: formatBytes(fileSizeBytes),
        templateCount: 0,
        specCount: 0,
        drawingCount: 0,
        batchCount: 0,
        totalImageCount: 0,
        version: typeof rootObj.version === 'string' ? rootObj.version : '未知',
        exportedAt:
          typeof rootObj.exportedAt === 'string' ? rootObj.exportedAt : '-',
      },
      templates: [],
      specs: null,
      drawings: null,
      reportBatch: null,
    };
  }

  const sanitizedTemplates: DfmTemplate[] = [];
  let imageCount = 0;

  for (let idx = 0; idx < rawTemplates.length; idx++) {
    const item = rawTemplates[idx];
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      warnings.push(`第 ${idx + 1} 筆案例格式非有效物件，已略過。`);
      continue;
    }
    const rec = item as Record<string, unknown>;
    const rawCat = typeof rec.category === 'string' ? rec.category : '';
    const category: DfmCategory = DFM_CATEGORIES.includes(rawCat as DfmCategory)
      ? (rawCat as DfmCategory)
      : 'PCB Layout';

    if (rawCat && !DFM_CATEGORIES.includes(rawCat as DfmCategory)) {
      warnings.push(
        `案例「${rec.code || idx + 1}」的製程分類「${rawCat}」已自動對應至「PCB Layout」。`
      );
    }

    const imageUrl = typeof rec.imageUrl === 'string' ? rec.imageUrl : '';
    if (imageUrl.trim() !== '') {
      imageCount++;
    }

    // Legacy compatibility: if old JSON had severity but no referenceModel, preserve safely
    const referenceModel =
      typeof rec.referenceModel === 'string'
        ? rec.referenceModel
        : typeof rec.model === 'string'
        ? rec.model
        : '';

    sanitizedTemplates.push({
      id:
        typeof rec.id === 'string' && rec.id.trim()
          ? rec.id.trim()
          : `imported-${Date.now()}-${idx}`,
      code:
        typeof rec.code === 'string' && rec.code.trim()
          ? rec.code.trim()
          : `DFM-IMP-${String(idx + 1).padStart(3, '0')}`,
      title:
        typeof rec.title === 'string' && rec.title.trim()
          ? rec.title.trim()
          : '未命名 DFM 項目',
      category,
      referenceModel,
      issueTemplate:
        typeof rec.issueTemplate === 'string' ? rec.issueTemplate : '',
      recommendationTemplate:
        typeof rec.recommendationTemplate === 'string'
          ? rec.recommendationTemplate
          : '',
      referenceSpec:
        typeof rec.referenceSpec === 'string' ? rec.referenceSpec : '',
      imageUrl,
      imageId: typeof rec.imageId === 'string' && rec.imageId.trim() ? rec.imageId.trim() : undefined,
      imageCaption:
        typeof rec.imageCaption === 'string' ? rec.imageCaption : '',
      annotations: sanitizeAnnotations(rec.annotations),
      variableDefaults: sanitizeVariableDefaults(rec.variableDefaults),
      updatedAt:
        typeof rec.updatedAt === 'string' && rec.updatedAt
          ? rec.updatedAt
          : today,
    });
  }

  if (sanitizedTemplates.length === 0) {
    return {
      isValid: false,
      errors: ['匯入失敗：檔案中的所有案例項目皆無法通過欄位驗證。'],
      warnings,
      summary: {
        fileName,
        fileSizeBytes,
        formattedFileSize: formatBytes(fileSizeBytes),
        templateCount: 0,
        specCount: 0,
        drawingCount: 0,
        batchCount: 0,
        totalImageCount: 0,
        version: '未知',
        exportedAt: '-',
      },
      templates: [],
      specs: null,
      drawings: null,
      reportBatch: null,
    };
  }

  // Optional Specs array
  let sanitizedSpecs: ReferenceSpecItem[] | null = null;
  if (Array.isArray(rootObj.specs)) {
    sanitizedSpecs = [];
    for (let i = 0; i < rootObj.specs.length; i++) {
      const s = rootObj.specs[i];
      if (!s || typeof s !== 'object') continue;
      const rec = s as Record<string, unknown>;
      if (typeof rec.title === 'string' && typeof rec.content === 'string') {
        sanitizedSpecs.push({
          id:
            typeof rec.id === 'string' && rec.id
              ? rec.id
              : `spec-imp-${Date.now()}-${i}`,
          title: rec.title,
          content: rec.content,
          updatedAt:
            typeof rec.updatedAt === 'string' ? rec.updatedAt : today,
        });
      }
    }
  }

  // Optional Drawings array (DFM工程圖庫)
  let sanitizedDrawings: DfmDrawingItem[] | null = null;
  if (Array.isArray(rootObj.drawings)) {
    sanitizedDrawings = [];
    for (let i = 0; i < rootObj.drawings.length; i++) {
      const d = rootObj.drawings[i];
      if (!d || typeof d !== 'object') continue;
      const rec = d as Record<string, unknown>;
      const rawCat = typeof rec.category === 'string' ? rec.category : '';
      const category: DfmCategory = DFM_CATEGORIES.includes(
        rawCat as DfmCategory
      )
        ? (rawCat as DfmCategory)
        : 'PCB Layout';
      const url = typeof rec.url === 'string' ? rec.url : '';
      if (url.trim() !== '') {
        imageCount++;
      }
      sanitizedDrawings.push({
        id:
          typeof rec.id === 'string' && rec.id
            ? rec.id
            : `drawing-imp-${Date.now()}-${i}`,
        name:
          typeof rec.name === 'string' && rec.name
            ? rec.name
            : `匯入工程圖面 #${i + 1}`,
        category,
        url,
        imageId: typeof rec.imageId === 'string' && rec.imageId.trim() ? rec.imageId.trim() : undefined,
        description:
          typeof rec.description === 'string' ? rec.description : '',
        annotations: sanitizeAnnotations(rec.annotations),
        updatedAt:
          typeof rec.updatedAt === 'string' ? rec.updatedAt : today,
      });
    }
  }

  // Optional ReportBatch array
  let sanitizedBatch: CompiledReportItem[] | null = null;
  if (Array.isArray(rootObj.reportBatch)) {
    sanitizedBatch = [];
    for (let i = 0; i < rootObj.reportBatch.length; i++) {
      const b = rootObj.reportBatch[i];
      if (!b || typeof b !== 'object') continue;
      const rec = b as Record<string, unknown>;
      const rawCat = typeof rec.category === 'string' ? rec.category : '';
      const category: DfmCategory = DFM_CATEGORIES.includes(
        rawCat as DfmCategory
      )
        ? (rawCat as DfmCategory)
        : 'PCB Layout';
      sanitizedBatch.push({
        id:
          typeof rec.id === 'string' && rec.id
            ? rec.id
            : `batch-imp-${Date.now()}-${i}`,
        templateId:
          typeof rec.templateId === 'string' ? rec.templateId : '',
        code: typeof rec.code === 'string' ? rec.code : `DFM-${i + 1}`,
        title: typeof rec.title === 'string' ? rec.title : '匯入報告項目',
        category,
        referenceModel:
          typeof rec.referenceModel === 'string' ? rec.referenceModel : '',
        compiledIssue:
          typeof rec.compiledIssue === 'string' ? rec.compiledIssue : '',
        compiledRecommendation:
          typeof rec.compiledRecommendation === 'string'
            ? rec.compiledRecommendation
            : '',
        referenceSpec:
          typeof rec.referenceSpec === 'string' ? rec.referenceSpec : '',
        imageUrl: typeof rec.imageUrl === 'string' ? rec.imageUrl : '',
        imageId: typeof rec.imageId === 'string' && rec.imageId.trim() ? rec.imageId.trim() : undefined,
        imageCaption:
          typeof rec.imageCaption === 'string' ? rec.imageCaption : '',
        annotations: sanitizeAnnotations(rec.annotations),
        variableValues: sanitizeVariableDefaults(rec.variableValues),
        createdAt:
          typeof rec.createdAt === 'string'
            ? rec.createdAt
            : new Date().toISOString(),
      });
    }
  }

  return {
    isValid: true,
    errors,
    warnings,
    summary: {
      fileName,
      fileSizeBytes,
      formattedFileSize: formatBytes(fileSizeBytes),
      templateCount: sanitizedTemplates.length,
      specCount: sanitizedSpecs ? sanitizedSpecs.length : 0,
      drawingCount: sanitizedDrawings ? sanitizedDrawings.length : 0,
      batchCount: sanitizedBatch ? sanitizedBatch.length : 0,
      totalImageCount: imageCount,
      version: isLegacyArray
        ? '舊版相容陣列格式 (v1)'
        : typeof rootObj.version === 'string'
        ? rootObj.version
        : '2.x',
      exportedAt:
        typeof rootObj.exportedAt === 'string'
          ? rootObj.exportedAt.slice(0, 19).replace('T', ' ')
          : '未記載',
    },
    templates: sanitizedTemplates,
    specs: sanitizedSpecs,
    drawings: sanitizedDrawings,
    reportBatch: sanitizedBatch,
  };
}

/**
 * Safely merges incoming items with existing items (matching by id or code/title)
 * without deleting any existing user records.
 */
export function mergeTemplatesSafely(
  existing: DfmTemplate[],
  incoming: DfmTemplate[]
): DfmTemplate[] {
  const result = [...existing];
  const indexById = new Map<string, number>();
  const indexByCode = new Map<string, number>();

  result.forEach((t, idx) => {
    indexById.set(t.id, idx);
    indexByCode.set(t.code.trim().toLowerCase(), idx);
  });

  for (const item of incoming) {
    const matchIdIdx = indexById.get(item.id);
    const matchCodeIdx = indexByCode.get(item.code.trim().toLowerCase());
    if (matchIdIdx !== undefined) {
      result[matchIdIdx] = item;
    } else if (matchCodeIdx !== undefined) {
      result[matchCodeIdx] = { ...item, id: result[matchCodeIdx].id };
    } else {
      result.push(item);
    }
  }
  return result;
}

export function mergeDrawingsSafely(
  existing: DfmDrawingItem[],
  incoming: DfmDrawingItem[]
): DfmDrawingItem[] {
  const result = [...existing];
  const indexById = new Map<string, number>();
  result.forEach((d, idx) => indexById.set(d.id, idx));

  for (const item of incoming) {
    const matchIdx = indexById.get(item.id);
    if (matchIdx !== undefined) {
      result[matchIdx] = item;
    } else {
      result.push(item);
    }
  }
  return result;
}

export function mergeSpecsSafely(
  existing: ReferenceSpecItem[],
  incoming: ReferenceSpecItem[]
): ReferenceSpecItem[] {
  const result = [...existing];
  const indexById = new Map<string, number>();
  result.forEach((s, idx) => indexById.set(s.id, idx));

  for (const item of incoming) {
    const matchIdx = indexById.get(item.id);
    if (matchIdx !== undefined) {
      result[matchIdx] = item;
    } else {
      result.push(item);
    }
  }
  return result;
}

/**
 * Prepares a complete, self-contained JSON backup payload containing full Data URL images.
 * This guarantees the exported JSON can be transferred to another computer or backup disk
 * without missing any images that were stored in IndexedDB.
 */
export async function prepareFullBackupJsonPayload(
  templates: DfmTemplate[],
  specs: ReferenceSpecItem[],
  drawings: DfmDrawingItem[],
  reportBatch: CompiledReportItem[],
  onProgress?: (current: number, total: number) => void
): Promise<{
  jsonString: string;
  byteSize: number;
  templateCount: number;
  drawingCount: number;
  imageCount: number;
}> {
  const totalItems = templates.length + drawings.length + reportBatch.length;
  let processed = 0;
  let resolvedImageCount = 0;

  // Resolve template images
  const fullTemplates: DfmTemplate[] = [];
  for (const t of templates) {
    let fullUrl = t.imageUrl;
    if (t.imageId || (t.imageUrl && t.imageUrl.startsWith('blob:'))) {
      const dataUrl = await resolveItemToDataUrl(t.imageUrl, t.imageId);
      if (dataUrl) fullUrl = dataUrl;
    }
    if (fullUrl && fullUrl.trim() !== '') {
      resolvedImageCount++;
    }
    fullTemplates.push({
      ...t,
      imageUrl: fullUrl,
    });
    processed++;
    onProgress?.(processed, totalItems);
  }

  // Resolve drawing images
  const fullDrawings: DfmDrawingItem[] = [];
  for (const d of drawings) {
    let fullUrl = d.url;
    if (d.imageId || (d.url && d.url.startsWith('blob:'))) {
      const dataUrl = await resolveItemToDataUrl(d.url, d.imageId);
      if (dataUrl) fullUrl = dataUrl;
    }
    if (fullUrl && fullUrl.trim() !== '') {
      resolvedImageCount++;
    }
    fullDrawings.push({
      ...d,
      url: fullUrl,
    });
    processed++;
    onProgress?.(processed, totalItems);
  }

  // Resolve report batch images
  const fullBatch: CompiledReportItem[] = [];
  for (const b of reportBatch) {
    let fullUrl = b.imageUrl;
    if (b.imageId || (b.imageUrl && b.imageUrl.startsWith('blob:'))) {
      const dataUrl = await resolveItemToDataUrl(b.imageUrl, b.imageId);
      if (dataUrl) fullUrl = dataUrl;
    }
    fullBatch.push({
      ...b,
      imageUrl: fullUrl,
    });
    processed++;
    onProgress?.(processed, totalItems);
  }

  const exportPayload = {
    version: '2.1 (IndexedDB Vault Compatible)',
    exportedAt: new Date().toISOString(),
    generator: 'PCB DFM Engineering Workbench',
    templates: fullTemplates,
    specs,
    drawings: fullDrawings,
    reportBatch: fullBatch,
  };

  const jsonString = JSON.stringify(exportPayload, null, 2);
  const byteSize = new TextEncoder().encode(jsonString).length;

  return {
    jsonString,
    byteSize,
    templateCount: fullTemplates.length,
    drawingCount: fullDrawings.length,
    imageCount: resolvedImageCount,
  };
}

/**
 * When restoring or importing a JSON backup, automatically stores any embedded
 * Data URL images into IndexedDB (with deduplication) and converts them into memory Object URLs.
 * This completely avoids overwhelming localStorage during large JSON imports!
 */
export async function restoreImportedImagesToVault(
  payload: ValidatedBackupPayload,
  onProgress?: (current: number, total: number) => void
): Promise<{
  templates: DfmTemplate[];
  drawings: DfmDrawingItem[] | null;
  reportBatch: CompiledReportItem[] | null;
}> {
  if (!isIndexedDbSupported()) {
    // If IndexedDB is not supported, return items as is
    return {
      templates: payload.templates,
      drawings: payload.drawings,
      reportBatch: payload.reportBatch,
    };
  }

  const allItemsWithImages: Array<{
    target: 'template' | 'drawing' | 'batch';
    index: number;
    url: string;
  }> = [];

  payload.templates.forEach((t, idx) => {
    if (t.imageUrl && t.imageUrl.startsWith('data:')) {
      allItemsWithImages.push({ target: 'template', index: idx, url: t.imageUrl });
    }
  });

  if (payload.drawings) {
    payload.drawings.forEach((d, idx) => {
      if (d.url && d.url.startsWith('data:')) {
        allItemsWithImages.push({ target: 'drawing', index: idx, url: d.url });
      }
    });
  }

  if (payload.reportBatch) {
    payload.reportBatch.forEach((b, idx) => {
      if (b.imageUrl && b.imageUrl.startsWith('data:')) {
        allItemsWithImages.push({ target: 'batch', index: idx, url: b.imageUrl });
      }
    });
  }

  const total = allItemsWithImages.length;
  let processed = 0;

  // Cache to deduplicate duplicate Data URLs during import
  const urlToVaultMap = new Map<string, { imageId: string; blobUrl: string }>();

  for (const item of allItemsWithImages) {
    let vaultEntry = urlToVaultMap.get(item.url);
    if (!vaultEntry) {
      const res = await saveDataUrlToVault(item.url, { source: 'import' });
      if (res.ok && res.imageId) {
        vaultEntry = { imageId: res.imageId, blobUrl: res.blobUrl };
        urlToVaultMap.set(item.url, vaultEntry);
      }
    }
    processed++;
    onProgress?.(processed, total);
  }

  // Update templates
  const finalTemplates = payload.templates.map((t) => {
    if (t.imageUrl && urlToVaultMap.has(t.imageUrl)) {
      const entry = urlToVaultMap.get(t.imageUrl)!;
      return { ...t, imageUrl: entry.blobUrl, imageId: entry.imageId };
    }
    return t;
  });

  // Update drawings
  const finalDrawings = payload.drawings
    ? payload.drawings.map((d) => {
        if (d.url && urlToVaultMap.has(d.url)) {
          const entry = urlToVaultMap.get(d.url)!;
          return { ...d, url: entry.blobUrl, imageId: entry.imageId };
        }
        return d;
      })
    : null;

  // Update reportBatch
  const finalBatch = payload.reportBatch
    ? payload.reportBatch.map((b) => {
        if (b.imageUrl && urlToVaultMap.has(b.imageUrl)) {
          const entry = urlToVaultMap.get(b.imageUrl)!;
          return { ...b, imageUrl: entry.blobUrl, imageId: entry.imageId };
        }
        return b;
      })
    : null;

  return {
    templates: finalTemplates,
    drawings: finalDrawings,
    reportBatch: finalBatch,
  };
}
