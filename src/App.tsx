import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  Plus,
  Search,
  Download,
  Upload,
  Copy as DuplicateIcon,
  Trash2,
  FileEdit,
  CheckCircle2,
  AlertCircle,
  Braces,
  Database,
  Table2,
  ArrowRight,
  MousePointerClick,
  Undo2,
  Redo2,
  Save,
  Images,
  Lock,
  HardDrive,
  Clock,
  ChevronLeft,
  ChevronRight,
  X,
  FileCheck2,
  Layers,
} from 'lucide-react';
import {
  DfmTemplate,
  DfmCategory,
  CompiledReportItem,
  ReferenceSpecItem,
  DfmDrawingItem,
} from './types/dfm';
import {
  DEFAULT_DFM_TEMPLATES,
  DFM_CATEGORIES,
  PRESET_CAD_DIAGRAMS,
} from './data/defaultTemplates';
import {
  extractVariables,
  compileTemplateText,
  parseTemplateSegments,
} from './utils/templateParser';
import {
  STORAGE_KEYS,
  SaveStatusType,
  loadInitialTemplates,
  loadInitialSpecs,
  loadInitialBatch,
  loadInitialDrawings,
  loadLastBackupTime,
  saveLastBackupTime,
  safeWriteStorage,
  estimateStorageMetrics,
  formatBytes,
} from './utils/storageManager';
import {
  ValidatedBackupPayload,
  parseAndValidateBackupJson,
  mergeTemplatesSafely,
  mergeDrawingsSafely,
  mergeSpecsSafely,
} from './utils/jsonBackupManager';
import { ImageInspector } from './components/ImageInspector';
import { ReportPreviewPanel } from './components/ReportPreviewPanel';
import { SpecDatabaseManager } from './components/SpecDatabaseManager';
import { DynamicValueQuickEditor } from './components/DynamicValueQuickEditor';
import { DfmDrawingGallery } from './components/DfmDrawingGallery';
import {
  LoginGate,
  isDailySessionAuthenticated,
  clearDailySessionAuth,
} from './components/LoginGate';

type WorkspaceTab = 'database' | 'editor' | 'report' | 'gallery';

const MAX_TEMPLATE_HISTORY = 30;

const QUICK_VARIABLES = [
  '零件編號',
  '距離數值',
  '標準值',
  '方向',
  '板層面別',
  '封裝型式',
  '腳位編號',
  '建議內縮距離',
];

/**
 * Helper: Given a template string and a cursor index, checks if the cursor is inside [變數名稱]
 */
function findVariableAtCursor(text: string, cursorIndex: number): string | null {
  const regex = /\[([^\[\]\n]+)\]/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    const start = match.index;
    const end = regex.lastIndex;
    if (cursorIndex >= start && cursorIndex <= end) {
      return match[1].trim();
    }
  }
  return null;
}

/**
 * Structural-sharing snapshot of a single DfmTemplate:
 * Avoids JSON.parse(JSON.stringify(tpl)) so large immutable Base64 imageUrl strings
 * are shared by reference without allocating duplicate copies on every keystroke.
 */
function snapshotTemplate(tpl: DfmTemplate): DfmTemplate {
  return {
    ...tpl,
    annotations: tpl.annotations
      ? tpl.annotations.map((pin) => ({ ...pin }))
      : [],
    variableDefaults: tpl.variableDefaults ? { ...tpl.variableDefaults } : {},
  };
}

export default function App() {
  // 0. Daily Password Authentication State (DV + 今日日期)
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() =>
    isDailySessionAuthenticated()
  );

  // 1. Centralized Safe Initial Loaders
  const initialTemplatesResult = useMemo(() => loadInitialTemplates(), []);
  const initialSpecsResult = useMemo(() => loadInitialSpecs(), []);
  const initialBatchResult = useMemo(() => loadInitialBatch(), []);
  const initialDrawingsResult = useMemo(() => loadInitialDrawings(), []);

  const [templates, setTemplates] = useState<DfmTemplate[]>(
    () => initialTemplatesResult.templates
  );
  const [specs, setSpecs] = useState<ReferenceSpecItem[]>(
    () => initialSpecsResult.specs
  );
  const [reportBatch, setReportBatch] = useState<CompiledReportItem[]>(
    () => initialBatchResult.batch
  );
  const [drawings, setDrawings] = useState<DfmDrawingItem[]>(
    () => initialDrawingsResult.drawings
  );

  // Storage Save Status & Telemetry State
  const [saveStatus, setSaveStatus] = useState<SaveStatusType>('saved');
  const [lastSavedAt, setLastSavedAt] = useState<string>(() =>
    new Date().toLocaleTimeString('zh-TW', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
  );
  const [lastBackupAt, setLastBackupAt] = useState<string | null>(() =>
    loadLastBackupTime()
  );
  const [storageWarning, setStorageWarning] = useState<string | null>(() => {
    return (
      initialTemplatesResult.warning ||
      initialSpecsResult.warning ||
      initialBatchResult.warning ||
      initialDrawingsResult.warning ||
      null
    );
  });

  // Pre-Import Validation & Confirmation Modal State
  const [pendingImport, setPendingImport] =
    useState<ValidatedBackupPayload | null>(null);

  // Active Main Tab: 'database' | 'editor' | 'report' | 'gallery'
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('report');

  const [selectedId, setSelectedId] = useState<string>(() => {
    return (
      initialTemplatesResult.templates[0]?.id || DEFAULT_DFM_TEMPLATES[0].id
    );
  });

  // Active linked variable name for bidirectional highlighting & focus
  const [activeVariable, setActiveVariable] = useState<string | null>(null);

  // Database List Search, Category Filter & Pagination (for 100~1,000 cases scale)
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [dbPage, setDbPage] = useState<number>(1);
  const [dbPageSize, setDbPageSize] = useState<number>(24);

  const [customVarName, setCustomVarName] = useState('');
  const [activeTextarea, setActiveTextarea] = useState<
    'issue' | 'recommendation'
  >('issue');
  const [statusBanner, setStatusBanner] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  // Per-template Undo/Redo History Map with structural sharing
  const [historyMap, setHistoryMap] = useState<
    Record<
      string,
      {
        stack: DfmTemplate[];
        index: number;
        isDirty: boolean;
        lastSavedAt?: string;
      }
    >
  >({});

  // Track last edit timestamp to coalesce rapid keystrokes on the same template
  const lastTemplateEditMetaRef = useRef<{
    templateId: string;
    timestamp: number;
  } | null>(null);

  const fileImportRef = useRef<HTMLInputElement>(null);
  const issueTextareaRef = useRef<HTMLTextAreaElement>(null);
  const recTextareaRef = useRef<HTMLTextAreaElement>(null);
  const dynamicInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  // Track initial mount so we don't needlessly re-write initial localStorage on first render
  const isFirstMountRef = useRef(true);

  const showToast = useCallback(
    (message: string, type: 'success' | 'error' = 'success') => {
      setStatusBanner({ type, message });
      setTimeout(() => {
        setStatusBanner((prev) => (prev?.message === message ? null : prev));
      }, 3600);
    },
    []
  );

  // Centralized, debounced auto-save to localStorage for templates, specs, batch, and drawings
  useEffect(() => {
    if (isFirstMountRef.current) {
      isFirstMountRef.current = false;
      return;
    }

    setSaveStatus('saving');
    const timer = window.setTimeout(() => {
      const r1 = safeWriteStorage(STORAGE_KEYS.TEMPLATES, templates);
      const r2 = safeWriteStorage(STORAGE_KEYS.SPECS, specs);
      const r3 = safeWriteStorage(STORAGE_KEYS.BATCH, reportBatch);
      const r4 = safeWriteStorage(STORAGE_KEYS.DRAWINGS, drawings);

      const failed = [r1, r2, r3, r4].find((r) => !r.ok);
      if (failed) {
        setSaveStatus('error');
        setStorageWarning(
          failed.message ||
            '本機儲存空間寫入失敗，目前畫面資料仍保留，請立即匯出 JSON 備份。'
        );
      } else {
        setSaveStatus('saved');
        setStorageWarning(null);
        if (r1.savedAt) {
          setLastSavedAt(r1.savedAt);
        }
      }
    }, 320);

    return () => window.clearTimeout(timer);
  }, [templates, specs, reportBatch, drawings]);

  // Estimate storage capacity & counts without blocking main thread
  const storageMetrics = useMemo(
    () => estimateStorageMetrics(templates, drawings, specs, reportBatch),
    [templates, drawings, specs, reportBatch]
  );

  // Reset database list page to 1 when search or category filter changes
  useEffect(() => {
    setDbPage(1);
  }, [searchQuery, selectedCategory, dbPageSize]);

  // Current active template
  const activeTemplate = useMemo(() => {
    return (
      templates.find((t) => t.id === selectedId) ||
      templates[0] ||
      DEFAULT_DFM_TEMPLATES[0]
    );
  }, [templates, selectedId]);

  // Initialize history entry for activeTemplate if not present yet
  useEffect(() => {
    if (!activeTemplate) return;
    setHistoryMap((prev) => {
      if (prev[activeTemplate.id]) return prev;
      return {
        ...prev,
        [activeTemplate.id]: {
          stack: [snapshotTemplate(activeTemplate)],
          index: 0,
          isDirty: false,
          lastSavedAt: activeTemplate.updatedAt,
        },
      };
    });
  }, [activeTemplate]);

  const currentHistory = historyMap[activeTemplate.id];
  const canUndo = currentHistory ? currentHistory.index > 0 : false;
  const canRedo = currentHistory
    ? currentHistory.index < currentHistory.stack.length - 1
    : false;
  const isDirty = currentHistory ? currentHistory.isDirty : false;

  // Update active template and record into structural-sharing Undo/Redo stack
  const updateActiveTemplate = useCallback(
    (patch: Partial<DfmTemplate>, coalesceTyping = true) => {
      const today = new Date().toISOString().slice(0, 10);
      const nextTemplate: DfmTemplate = {
        ...activeTemplate,
        ...patch,
        updatedAt: today,
      };

      setTemplates((prev) =>
        prev.map((item) =>
          item.id === activeTemplate.id ? nextTemplate : item
        )
      );

      const now = Date.now();
      const prevMeta = lastTemplateEditMetaRef.current;
      const shouldCoalesce =
        coalesceTyping &&
        Boolean(
          prevMeta &&
            prevMeta.templateId === activeTemplate.id &&
            now - prevMeta.timestamp < 650
        );

      lastTemplateEditMetaRef.current = coalesceTyping
        ? { templateId: activeTemplate.id, timestamp: now }
        : null;

      setHistoryMap((prev) => {
        const entry = prev[activeTemplate.id] || {
          stack: [snapshotTemplate(activeTemplate)],
          index: 0,
          isDirty: false,
        };
        const snap = snapshotTemplate(nextTemplate);

        if (shouldCoalesce && entry.index > 0) {
          const replacedStack = [...entry.stack.slice(0, entry.index), snap];
          return {
            ...prev,
            [activeTemplate.id]: {
              stack: replacedStack,
              index: replacedStack.length - 1,
              isDirty: true,
              lastSavedAt: entry.lastSavedAt,
            },
          };
        }

        const sliced = entry.stack.slice(0, entry.index + 1);
        const nextStack = [...sliced, snap].slice(-MAX_TEMPLATE_HISTORY);
        return {
          ...prev,
          [activeTemplate.id]: {
            stack: nextStack,
            index: nextStack.length - 1,
            isDirty: true,
            lastSavedAt: entry.lastSavedAt,
          },
        };
      });
    },
    [activeTemplate]
  );

  // Undo Handler
  const handleUndo = useCallback(() => {
    const entry = historyMap[activeTemplate.id];
    if (!entry || entry.index <= 0) return;
    lastTemplateEditMetaRef.current = null;
    const prevIndex = entry.index - 1;
    const snapshot = snapshotTemplate(entry.stack[prevIndex]);

    setTemplates((prev) =>
      prev.map((item) => (item.id === activeTemplate.id ? snapshot : item))
    );
    setHistoryMap((prev) => ({
      ...prev,
      [activeTemplate.id]: {
        ...entry,
        index: prevIndex,
        isDirty: true,
      },
    }));
    showToast('已復原上一步變更 (Undo)');
  }, [activeTemplate.id, historyMap, showToast]);

  // Redo Handler
  const handleRedo = useCallback(() => {
    const entry = historyMap[activeTemplate.id];
    if (!entry || entry.index >= entry.stack.length - 1) return;
    lastTemplateEditMetaRef.current = null;
    const nextIndex = entry.index + 1;
    const snapshot = snapshotTemplate(entry.stack[nextIndex]);

    setTemplates((prev) =>
      prev.map((item) => (item.id === activeTemplate.id ? snapshot : item))
    );
    setHistoryMap((prev) => ({
      ...prev,
      [activeTemplate.id]: {
        ...entry,
        index: nextIndex,
        isDirty: true,
      },
    }));
    showToast('已重做下一步變更 (Redo)');
  }, [activeTemplate.id, historyMap, showToast]);

  // Explicit Save Handler in DFM案例編輯頁 — verifies actual storage write before claiming success!
  const handleSaveTemplate = useCallback(() => {
    lastTemplateEditMetaRef.current = null;
    setSaveStatus('saving');

    const r1 = safeWriteStorage(STORAGE_KEYS.TEMPLATES, templates);
    const r2 = safeWriteStorage(STORAGE_KEYS.SPECS, specs);
    const r3 = safeWriteStorage(STORAGE_KEYS.DRAWINGS, drawings);

    const failed = [r1, r2, r3].find((r) => !r.ok);
    if (failed) {
      setSaveStatus('error');
      const msg =
        failed.message ||
        '儲存失敗：瀏覽器本機儲存空間已滿或受限，請先點選右上角「匯出 JSON」備份！';
      setStorageWarning(msg);
      showToast(msg, 'error');
      return;
    }

    const nowTime =
      r1.savedAt ||
      new Date().toLocaleTimeString('zh-TW', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });

    setSaveStatus('saved');
    setStorageWarning(null);
    setLastSavedAt(nowTime);

    setHistoryMap((prev) => {
      const entry = prev[activeTemplate.id] || {
        stack: [snapshotTemplate(activeTemplate)],
        index: 0,
      };
      return {
        ...prev,
        [activeTemplate.id]: {
          ...entry,
          isDirty: false,
          lastSavedAt: nowTime,
        },
      };
    });
    showToast(
      `已成功寫入本機儲存空間：「${activeTemplate.code} - ${activeTemplate.title}」`
    );
  }, [activeTemplate, specs, templates, drawings, showToast]);

  // Explicit Save Handler for DFM工程圖庫
  const handleSaveDrawingsDirectly = useCallback(
    (nextDrawings: DfmDrawingItem[]): boolean => {
      setSaveStatus('saving');
      const res = safeWriteStorage(STORAGE_KEYS.DRAWINGS, nextDrawings);
      if (!res.ok) {
        setSaveStatus('error');
        const msg =
          res.message ||
          '儲存圖庫失敗：本機儲存空間不足，目前畫面圖面仍保留，請先點選「匯出 JSON」備份。';
        setStorageWarning(msg);
        showToast(msg, 'error');
        return false;
      }
      setSaveStatus('saved');
      setStorageWarning(null);
      if (res.savedAt) {
        setLastSavedAt(res.savedAt);
      }
      return true;
    },
    [showToast]
  );

  // Keyboard shortcuts for Undo (Ctrl+Z), Redo (Ctrl+Y / Ctrl+Shift+Z), and Save (Ctrl+S) when on Editor Tab
  useEffect(() => {
    if (activeTab !== 'editor') return;
    const handleKeyDown = (e: KeyboardEvent) => {
      const isMod = e.ctrlKey || e.metaKey;
      if (!isMod) return;

      if (e.key.toLowerCase() === 's') {
        e.preventDefault();
        handleSaveTemplate();
      } else if (e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
      } else if (
        e.key.toLowerCase() === 'y' ||
        (e.key.toLowerCase() === 'z' && e.shiftKey)
      ) {
        e.preventDefault();
        handleRedo();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeTab, handleSaveTemplate, handleUndo, handleRedo]);

  // Extract all dynamic variables [變數] from active template's Issue and Recommendation
  const detectedVariables = useMemo(() => {
    return extractVariables(
      activeTemplate.issueTemplate,
      activeTemplate.recommendationTemplate
    );
  }, [activeTemplate.issueTemplate, activeTemplate.recommendationTemplate]);

  const variableValues = activeTemplate.variableDefaults || {};

  // Parsed segments for interactive linked preview inside DFM案例編輯頁
  const editorIssueSegments = useMemo(
    () => parseTemplateSegments(activeTemplate.issueTemplate, variableValues),
    [activeTemplate.issueTemplate, variableValues]
  );
  const editorRecSegments = useMemo(
    () =>
      parseTemplateSegments(
        activeTemplate.recommendationTemplate,
        variableValues
      ),
    [activeTemplate.recommendationTemplate, variableValues]
  );

  // Focus a specific variable input in DynamicValueQuickEditor when clicked in Issue or Recommendation
  const handleFocusVariableInput = (varName: string) => {
    setActiveVariable(varName);
    const inputEl = dynamicInputRefs.current[varName];
    if (inputEl) {
      inputEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      inputEl.focus();
      inputEl.select();
    }
  };

  // Locate and select [變數] token inside Issue or Recommendation textarea when clicked from DynamicValueQuickEditor on Editor Tab
  const handleLocateInTemplate = (varName: string) => {
    setActiveVariable(varName);
    const token = `[${varName}]`;
    const issueIdx = activeTemplate.issueTemplate.indexOf(token);
    if (issueIdx !== -1 && issueTextareaRef.current) {
      setActiveTextarea('issue');
      issueTextareaRef.current.focus();
      issueTextareaRef.current.setSelectionRange(
        issueIdx,
        issueIdx + token.length
      );
      return;
    }
    const recIdx = activeTemplate.recommendationTemplate.indexOf(token);
    if (recIdx !== -1 && recTextareaRef.current) {
      setActiveTextarea('recommendation');
      recTextareaRef.current.focus();
      recTextareaRef.current.setSelectionRange(recIdx, recIdx + token.length);
    }
  };

  const handleVariableChange = (varName: string, val: string) => {
    setActiveVariable(varName);
    updateActiveTemplate(
      {
        variableDefaults: {
          ...variableValues,
          [varName]: val,
        },
      },
      true
    );
  };

  const handleClearVariables = () => {
    const cleared: Record<string, string> = {};
    detectedVariables.forEach((v) => {
      cleared[v] = '';
    });
    updateActiveTemplate({ variableDefaults: cleared }, false);
    showToast('已清空目前項目的填空變數，可重新輸入實測值');
  };

  const handleRestoreSampleVariables = () => {
    const defaultMatch = DEFAULT_DFM_TEMPLATES.find(
      (d) => d.id === activeTemplate.id || d.code === activeTemplate.code
    );
    if (defaultMatch) {
      updateActiveTemplate(
        {
          variableDefaults: { ...defaultMatch.variableDefaults },
        },
        false
      );
      showToast('已載入預設工程範例數值');
    } else {
      const filled: Record<string, string> = {};
      detectedVariables.forEach((v) => {
        filled[v] = variableValues[v] || `範例_${v}`;
      });
      updateActiveTemplate({ variableDefaults: filled }, false);
      showToast('已自動填入範例數值');
    }
  };

  // Spec CRUD Handlers (規範新增、儲存、修改、刪除)
  const handleAddSpec = (title: string, content: string) => {
    const newSpec: ReferenceSpecItem = {
      id: `spec-${Date.now()}`,
      title,
      content,
      updatedAt: new Date().toISOString().slice(0, 10),
    };
    setSpecs((prev) => [newSpec, ...prev]);
    updateActiveTemplate({ referenceSpec: content }, false);
    showToast(`已新增並儲存規範「${title}」`);
  };

  const handleUpdateSpec = (id: string, title: string, content: string) => {
    const today = new Date().toISOString().slice(0, 10);
    setSpecs((prev) =>
      prev.map((s) =>
        s.id === id ? { ...s, title, content, updatedAt: today } : s
      )
    );
    showToast(`已儲存規範修改「${title}」`);
  };

  const handleDeleteSpec = (id: string) => {
    const target = specs.find((s) => s.id === id);
    setSpecs((prev) => prev.filter((s) => s.id !== id));
    showToast(`已刪除規範「${target?.title || ''}」`);
  };

  // Apply a drawing from DFM工程圖庫 to the currently active DFM case
  const handleApplyDrawingToCase = (drawing: DfmDrawingItem) => {
    updateActiveTemplate(
      {
        imageUrl: drawing.url,
        imageCaption: drawing.description || drawing.name,
        annotations: drawing.annotations
          ? drawing.annotations.map((a) => ({ ...a }))
          : [],
      },
      false
    );
    showToast(
      `已將工程圖面「${drawing.name}」與圖片說明套用至案例「${activeTemplate.code}」`
    );
  };

  // Insert [變數] token into issueTemplate or recommendationTemplate
  const handleInsertVariableToken = (varName: string) => {
    const clean = varName.replace(/[\[\]]/g, '').trim();
    if (!clean) return;
    const token = `[${clean}]`;

    if (activeTextarea === 'issue') {
      updateActiveTemplate(
        {
          issueTemplate: `${activeTemplate.issueTemplate}${token}`,
          variableDefaults: {
            ...variableValues,
            [clean]: variableValues[clean] ?? '',
          },
        },
        false
      );
    } else {
      updateActiveTemplate(
        {
          recommendationTemplate: `${activeTemplate.recommendationTemplate}${token}`,
          variableDefaults: {
            ...variableValues,
            [clean]: variableValues[clean] ?? '',
          },
        },
        false
      );
    }
    setActiveVariable(clean);
    setCustomVarName('');
    showToast(
      `已將變數 ${token} 插入至「${
        activeTextarea === 'issue' ? 'DFM 問題點' : 'DFM 修改建議'
      }」`
    );
  };

  // Add new DFM case and jump to DFM案例編輯頁
  const handleCreateTemplate = () => {
    const nextIndex = templates.length + 1;
    const padded = String(nextIndex).padStart(3, '0');
    const newId = `dfm-tpl-${Date.now()}`;
    const newTemplate: DfmTemplate = {
      id: newId,
      code: `DFM-NEW-${padded}`,
      title: '新建 DFM 案例項目 (請輸入問題標題)',
      category:
        selectedCategory !== 'ALL'
          ? (selectedCategory as DfmCategory)
          : 'PCB Layout',
      referenceModel: '請輸入參考機種 (例如：MB-X100 Rev.A)',
      issueTemplate:
        '位於 [板層面別] 之零件 [零件編號] 距離 [方向] 僅 [距離數值]，小於 DFM 規範要求之 [標準值]，可能導致組裝或製程異常。',
      recommendationTemplate:
        '建議將零件 [零件編號] 往 [方向] 調整間距至 [標準值] 以上，以符合量產可靠度要求。',
      referenceSpec: specs[0]?.content || 'IPC-2221B / 廠內硬體 DFM 設計規範',
      imageUrl: drawings[0]?.url || PRESET_CAD_DIAGRAMS[0].url,
      imageCaption: '圖示：請貼上圖片網址、上傳截圖或點擊畫面新增紅點標註',
      annotations: [],
      variableDefaults: {
        板層面別: 'Top 面',
        零件編號: 'U101',
        方向: '板邊',
        距離數值: '0.35mm',
        標準值: '1.0mm',
      },
      updatedAt: new Date().toISOString().slice(0, 10),
    };

    setTemplates((prev) => [newTemplate, ...prev]);
    setSelectedId(newId);
    setActiveTab('editor');
    showToast(`已新增案例「${newTemplate.code}」，請在 DFM案例編輯頁 設定內容`);
  };

  // Duplicate template
  const handleDuplicateTemplate = (tpl: DfmTemplate, e: React.MouseEvent) => {
    e.stopPropagation();
    const dupId = `dfm-tpl-${Date.now()}`;
    const duplicated: DfmTemplate = {
      ...tpl,
      id: dupId,
      code: `${tpl.code}-COPY`,
      title: `${tpl.title} (副本)`,
      variableDefaults: { ...tpl.variableDefaults },
      annotations: tpl.annotations
        ? tpl.annotations.map((a) => ({ ...a }))
        : [],
      updatedAt: new Date().toISOString().slice(0, 10),
    };
    setTemplates((prev) => [duplicated, ...prev]);
    setSelectedId(dupId);
    showToast(`已複製案例「${tpl.title}」`);
  };

  // Delete template
  const handleDeleteTemplate = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (templates.length <= 1) {
      showToast('資料庫至少需保留一組 DFM 案例', 'error');
      return;
    }
    const target = templates.find((t) => t.id === id);
    const remaining = templates.filter((t) => t.id !== id);
    setTemplates(remaining);
    if (selectedId === id && remaining.length > 0) {
      setSelectedId(remaining[0].id);
    }
    showToast(`已刪除案例「${target?.code || ''}」`);
  };

  // Export JSON — displays file size, case count, and image count, and records backup time
  const handleExportJson = () => {
    try {
      const exportedIso = new Date().toISOString();
      const payload = {
        app: 'DFM Case Database Workbench',
        version: '2.7.0',
        exportedAt: exportedIso,
        templates,
        specs,
        drawings,
        reportBatch,
      };
      const jsonStr = JSON.stringify(payload, null, 2);
      const blob = new Blob([jsonStr], {
        type: 'application/json',
      });
      const fileSizeFormatted = formatBytes(blob.size);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `dfm-database-backup-${exportedIso.slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      const backupTimeDisplay = new Date().toLocaleString('zh-TW', {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
      setLastBackupAt(backupTimeDisplay);
      saveLastBackupTime(backupTimeDisplay);

      showToast(
        `已成功匯出備份檔（檔案大小：${fileSizeFormatted} · 案例：${templates.length} 筆 · 圖片：${storageMetrics.totalImageCount} 張 · 規範：${specs.length} 筆）`
      );
    } catch {
      showToast('匯出 JSON 備份時發生錯誤，請再試一次', 'error');
    }
  };

  // Step 1 of Import JSON: Validate without overwriting existing data, then open confirmation dialog
  const handleImportJson = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const raw = event.target?.result;
        if (typeof raw !== 'string') {
          showToast('讀取 JSON 檔案內容失敗，未變更現有資料', 'error');
          return;
        }

        const validation = parseAndValidateBackupJson(
          raw,
          file.name,
          file.size
        );

        if (!validation.isValid) {
          showToast(
            validation.errors[0] || '匯入失敗：JSON 檔案格式不符，已保留現有資料',
            'error'
          );
          return;
        }

        // Open pre-import summary confirmation modal before touching state
        setPendingImport(validation);
      } catch {
        showToast('JSON 檔案解析異常，已完整保留現有資料', 'error');
      } finally {
        if (fileImportRef.current) {
          fileImportRef.current.value = '';
        }
      }
    };
    reader.onerror = () => {
      showToast('讀取檔案時發生錯誤，已保留原本資料', 'error');
      if (fileImportRef.current) {
        fileImportRef.current.value = '';
      }
    };
    reader.readAsText(file);
  };

  // Step 2 of Import JSON: Apply validated payload in Overwrite (Default) or Safe Merge mode
  const handleConfirmImport = (mode: 'overwrite' | 'merge') => {
    if (!pendingImport || !pendingImport.isValid) return;

    if (mode === 'overwrite') {
      // Default behavior: full overwrite
      setTemplates(pendingImport.templates);
      setSelectedId(pendingImport.templates[0].id);
      setHistoryMap({});
      if (pendingImport.specs && pendingImport.specs.length > 0) {
        setSpecs(pendingImport.specs);
      }
      if (pendingImport.drawings && pendingImport.drawings.length > 0) {
        setDrawings(pendingImport.drawings);
      }
      if (pendingImport.reportBatch) {
        setReportBatch(pendingImport.reportBatch);
      }
      showToast(
        `已完成整份覆蓋匯入：載入 ${pendingImport.summary.templateCount} 筆案例與 ${pendingImport.summary.totalImageCount} 張圖片！`
      );
    } else {
      // Safe merge mode: keep existing data and merge incoming items
      const mergedTemplates = mergeTemplatesSafely(
        templates,
        pendingImport.templates
      );
      setTemplates(mergedTemplates);
      setHistoryMap({});
      if (pendingImport.specs && pendingImport.specs.length > 0) {
        setSpecs((prev) => mergeSpecsSafely(prev, pendingImport.specs!));
      }
      if (pendingImport.drawings && pendingImport.drawings.length > 0) {
        setDrawings((prev) =>
          mergeDrawingsSafely(prev, pendingImport.drawings!)
        );
      }
      showToast(
        `已完成安全合併匯入：目前共 ${mergedTemplates.length} 筆 DFM 案例！`
      );
    }

    setPendingImport(null);
  };

  // Add current compiled item into Batch Report List
  const handleAddToBatch = () => {
    const newItem: CompiledReportItem = {
      id: `batch-${Date.now()}`,
      templateId: activeTemplate.id,
      code: activeTemplate.code,
      title: activeTemplate.title,
      category: activeTemplate.category,
      referenceModel: activeTemplate.referenceModel,
      compiledIssue: compileTemplateText(
        activeTemplate.issueTemplate,
        variableValues
      ),
      compiledRecommendation: compileTemplateText(
        activeTemplate.recommendationTemplate,
        variableValues
      ),
      referenceSpec: activeTemplate.referenceSpec,
      imageUrl: activeTemplate.imageUrl,
      imageCaption: activeTemplate.imageCaption,
      annotations: activeTemplate.annotations
        ? activeTemplate.annotations.map((a) => ({ ...a }))
        : [],
      variableValues: { ...variableValues },
      createdAt: new Date().toISOString(),
    };
    setReportBatch((prev) => [...prev, newItem]);
    showToast(`已將「${activeTemplate.code}」加入報告彙整清單`);
  };

  // Memoized single-pass category counts for fast rendering with 100~1,000 templates
  const templateCategoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (let i = 0; i < templates.length; i++) {
      const cat = templates[i].category;
      counts[cat] = (counts[cat] || 0) + 1;
    }
    return counts;
  }, [templates]);

  // Filtered templates list
  const filteredTemplates = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return templates.filter((tpl) => {
      const matchCategory =
        selectedCategory === 'ALL' || tpl.category === selectedCategory;
      if (!matchCategory) return false;
      if (!q) return true;
      return (
        tpl.code.toLowerCase().includes(q) ||
        tpl.title.toLowerCase().includes(q) ||
        (tpl.referenceModel || '').toLowerCase().includes(q) ||
        tpl.issueTemplate.toLowerCase().includes(q) ||
        tpl.recommendationTemplate.toLowerCase().includes(q) ||
        tpl.referenceSpec.toLowerCase().includes(q)
      );
    });
  }, [templates, selectedCategory, searchQuery]);

  // Paginated slice of filteredTemplates so DOM stays light even with 1,000 cases
  const totalDbPages = Math.max(
    1,
    Math.ceil(filteredTemplates.length / dbPageSize)
  );
  const safeDbPage = Math.min(dbPage, totalDbPages);
  const pagedTemplates = useMemo(() => {
    const start = (safeDbPage - 1) * dbPageSize;
    return filteredTemplates.slice(start, start + dbPageSize);
  }, [filteredTemplates, safeDbPage, dbPageSize]);

  // Show Login Password Gate if not authenticated
  if (!isAuthenticated) {
    return <LoginGate onSuccess={() => setIsAuthenticated(true)} />;
  }

  return (
    <div className="min-h-screen w-full overflow-x-hidden flex flex-col bg-slate-50 text-slate-900">
      {/* Top Header Bar: Brand Title + Storage/Backup Telemetry + Lock/Logout */}
      <header className="sticky top-0 z-30 bg-white border-b border-slate-200 px-4 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <a
            href="#top"
            onClick={(e) => {
              e.preventDefault();
              setActiveTab('report');
            }}
            className="text-base sm:text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0"
          >
            DFM案例資料庫工作台
          </a>
        </div>

        {/* Right Header Status & Lock Controls */}
        <div className="flex flex-wrap items-center gap-3 text-xs">
          {/* Live Storage Status Indicator */}
          <div className="hidden md:flex items-center gap-2 text-slate-600 font-mono tabular-nums">
            <span
              className={`inline-flex items-center gap-1 font-sans font-semibold ${
                saveStatus === 'saved'
                  ? 'text-emerald-700'
                  : saveStatus === 'saving'
                  ? 'text-amber-600'
                  : 'text-red-600'
              }`}
            >
              {saveStatus === 'saved' && (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  <span>已儲存 ({lastSavedAt})</span>
                </>
              )}
              {saveStatus === 'saving' && <span>儲存中...</span>}
              {saveStatus === 'error' && (
                <>
                  <AlertCircle className="w-3.5 h-3.5 text-red-600" />
                  <span>本機儲存失敗（請匯出備份）</span>
                </>
              )}
            </span>
            <span className="text-slate-300" aria-hidden="true">
              |
            </span>
            <span
              title="根據目前案例、圖庫與規範資料字元長度計算之 JSON 檔案大小估算值（非瀏覽器實際配額上限）"
              className="flex items-center gap-1 text-slate-600"
            >
              <HardDrive className="w-3.5 h-3.5 text-slate-400" />
              <span>資料估算：約 {storageMetrics.formattedJsonSize}</span>
            </span>
            <span className="text-slate-300" aria-hidden="true">
              |
            </span>
            <span className="flex items-center gap-1 text-slate-500 font-sans">
              <Clock className="w-3.5 h-3.5 text-slate-400" />
              <span>
                最近備份：{lastBackupAt ? lastBackupAt : '尚未匯出備份'}
              </span>
            </span>
          </div>

          <button
            type="button"
            onClick={() => {
              clearDailySessionAuth();
              setIsAuthenticated(false);
            }}
            title="鎖定工作台並返回密碼登入畫面"
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200 hover:text-slate-900 transition-colors whitespace-nowrap shrink-0"
          >
            <Lock className="w-3.5 h-3.5 text-slate-500" />
            <span>登出鎖定</span>
          </button>
        </div>
      </header>

      {/* Sub-Header Bar: 4-Tab Segmented Switcher on Left (DFM工程圖庫 on right of DFM案例) + [匯出 JSON | 匯入 JSON] on Right */}
      <section className="bg-white border-b border-slate-200 px-4 sm:px-6 py-2.5">
        <div className="max-w-[1440px] mx-auto flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          {/* 4-Tab Segmented Control */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 p-1 bg-slate-100 rounded-xl w-full sm:w-auto">
            <button
              type="button"
              onClick={() => setActiveTab('database')}
              className={`flex items-center justify-center gap-2 px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                activeTab === 'database'
                  ? 'bg-white text-blue-700 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Database className="w-3.5 h-3.5 shrink-0" />
              <span>DFM案例資料庫列表 ({templates.length})</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('editor')}
              className={`flex items-center justify-center gap-2 px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                activeTab === 'editor'
                  ? 'bg-white text-blue-700 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <FileEdit className="w-3.5 h-3.5 shrink-0" />
              <span>DFM案例編輯頁</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('report')}
              className={`flex items-center justify-center gap-2 px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                activeTab === 'report'
                  ? 'bg-white text-blue-700 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Table2 className="w-3.5 h-3.5 shrink-0" />
              <span>DFM案例</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('gallery')}
              className={`flex items-center justify-center gap-2 px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                activeTab === 'gallery'
                  ? 'bg-white text-blue-700 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Images className="w-3.5 h-3.5 shrink-0" />
              <span>DFM工程圖庫 ({drawings.length})</span>
            </button>
          </div>

          {/* Right Group: 匯出 JSON & 匯入 JSON */}
          <div className="flex items-center justify-end gap-2">
            <input
              ref={fileImportRef}
              type="file"
              accept=".json,application/json"
              onChange={handleImportJson}
              className="hidden"
            />
            <button
              type="button"
              onClick={handleExportJson}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0"
            >
              <Download className="w-3.5 h-3.5 text-slate-500" />
              匯出 JSON
            </button>
            <button
              type="button"
              onClick={() => fileImportRef.current?.click()}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0"
            >
              <Upload className="w-3.5 h-3.5 text-slate-500" />
              匯入 JSON
            </button>
          </div>
        </div>
      </section>

      {/* Persistent Storage Warning Banner (When localStorage quota or security error occurs) */}
      {storageWarning && (
        <div className="max-w-[1440px] w-full mx-auto px-4 sm:px-6 pt-4">
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 rounded-xl border border-red-300 bg-red-50 text-xs text-red-950 shadow-2xs">
            <div className="flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
              <div className="space-y-0.5">
                <div className="font-bold text-red-900">
                  本機儲存空間寫入警告（目前畫面資料仍安全保留於記憶體中）
                </div>
                <div className="text-red-800 leading-relaxed">
                  {storageWarning}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={handleExportJson}
                className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors"
              >
                <Download className="w-3.5 h-3.5" />
                立即匯出 JSON 備份
              </button>
              <button
                type="button"
                onClick={() => setStorageWarning(null)}
                className="px-2.5 py-1.5 text-xs text-red-700 hover:bg-red-100 rounded-lg"
              >
                暫時關閉
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast Notification Banner */}
      {statusBanner && (
        <div className="max-w-[1440px] w-full mx-auto px-4 sm:px-6 pt-4">
          <div
            className={`flex items-center justify-between gap-2 px-4 py-2.5 rounded-lg border text-xs font-medium ${
              statusBanner.type === 'success'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                : 'bg-red-50 border-red-200 text-red-900'
            }`}
          >
            <div className="flex items-center gap-2">
              {statusBanner.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
              )}
              <span>{statusBanner.message}</span>
            </div>
            <button
              type="button"
              onClick={() => setStatusBanner(null)}
              className="text-xs opacity-70 hover:opacity-100"
            >
              關閉
            </button>
          </div>
        </div>
      )}

      {/* MAIN CONTENT VIEWPORT */}
      <main className="flex-1 max-w-[1440px] w-full mx-auto px-4 sm:px-6 py-5">
        {/* =====================================================================
            TAB 1: DFM案例資料庫列表 (Optimized with Pagination for 100~1,000 cases)
        ===================================================================== */}
        {activeTab === 'database' && (
          <div className="space-y-5">
            <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4 shadow-2xs">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h1 className="text-base font-bold text-slate-900">
                    DFM案例資料庫列表
                  </h1>
                  <p className="text-xs text-slate-500 mt-0.5">
                    管理所有製程分類的 DFM 問題點與修改建議範本，點選任一項目即可切換至「DFM案例編輯頁」或「DFM案例」。
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={handleCreateTemplate}
                    className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors whitespace-nowrap shrink-0"
                  >
                    <Plus className="w-4 h-4" />
                    新增DFM案例
                  </button>
                </div>
              </div>

              <div className="relative w-full">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="輸入關鍵字搜尋：項目編號、問題點描述、參考機種或 IPC 規範..."
                  className="w-full pl-10 pr-4 py-2.5 text-xs sm:text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-800 placeholder:text-slate-400 focus:outline-none focus:bg-white focus:border-blue-600"
                />
              </div>

              <div className="flex flex-wrap items-center gap-1.5 p-1.5 bg-slate-100 rounded-lg">
                <button
                  type="button"
                  onClick={() => setSelectedCategory('ALL')}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 tabular-nums ${
                    selectedCategory === 'ALL'
                      ? 'bg-white text-slate-900 shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  全部製程 ({templates.length})
                </button>
                {DFM_CATEGORIES.map((cat) => {
                  const count = templateCategoryCounts[cat] || 0;
                  return (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setSelectedCategory(cat)}
                      className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 tabular-nums ${
                        selectedCategory === cat
                          ? 'bg-white text-slate-900 shadow-2xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {cat} ({count})
                    </button>
                  );
                })}
              </div>
            </div>

            {filteredTemplates.length === 0 ? (
              <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center space-y-3">
                <p className="text-sm font-semibold text-slate-700">
                  找不到符合篩選條件的 DFM 案例
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    setSelectedCategory('ALL');
                  }}
                  className="px-4 py-2 text-xs font-semibold text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors"
                >
                  清除搜尋與製程分類篩選
                </button>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {pagedTemplates.map((tpl) => {
                    const isSelected = tpl.id === activeTemplate.id;
                    const vars = extractVariables(
                      tpl.issueTemplate,
                      tpl.recommendationTemplate
                    );

                    return (
                      <div
                        key={tpl.id}
                        onClick={() => setSelectedId(tpl.id)}
                        className={`p-5 rounded-2xl border transition-colors cursor-pointer flex flex-col justify-between gap-4 ${
                          isSelected
                            ? 'bg-blue-50/40 border-blue-600'
                            : 'bg-white border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        <div className="space-y-2.5">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 font-mono tabular-nums">
                              <span className="font-bold text-slate-900">
                                {tpl.code}
                              </span>
                              <span aria-hidden="true">·</span>
                              <span className="font-sans font-semibold text-blue-700">
                                {tpl.category}
                              </span>
                              <span aria-hidden="true">·</span>
                              <span>{vars.length} 個填空變數</span>
                            </div>

                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                type="button"
                                onClick={(e) => handleDuplicateTemplate(tpl, e)}
                                title="複製此案例副本"
                                className="p-1.5 text-slate-400 hover:text-blue-600 rounded-md hover:bg-slate-100 transition-colors"
                              >
                                <DuplicateIcon className="w-4 h-4" />
                              </button>
                              <button
                                type="button"
                                onClick={(e) => handleDeleteTemplate(tpl.id, e)}
                                title="刪除此案例"
                                className="p-1.5 text-slate-400 hover:text-red-600 rounded-md hover:bg-slate-100 transition-colors"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>

                          <h3 className="text-sm sm:text-base font-bold text-slate-900 leading-snug">
                            {tpl.title}
                          </h3>

                          <div className="text-xs text-slate-600 font-mono">
                            參考機種：{tpl.referenceModel || '未填寫'}
                          </div>

                          <p className="text-xs text-slate-600 leading-relaxed line-clamp-2">
                            <strong className="text-slate-800">問題點範本：</strong>
                            {tpl.issueTemplate}
                          </p>
                        </div>

                        <div className="pt-3 border-t border-slate-200/80 flex flex-wrap items-center justify-between gap-2">
                          <span className="text-[11px] text-slate-400 font-mono tabular-nums">
                            更新於 {tpl.updatedAt}
                          </span>

                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedId(tpl.id);
                                setActiveTab('editor');
                              }}
                              className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors whitespace-nowrap shrink-0"
                            >
                              <FileEdit className="w-3.5 h-3.5" />
                              DFM案例編輯頁
                            </button>

                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedId(tpl.id);
                                setActiveTab('report');
                              }}
                              className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors whitespace-nowrap shrink-0"
                            >
                              <span>查看 DFM案例</span>
                              <ArrowRight className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Pagination Bar for 100~1,000 Cases */}
                {filteredTemplates.length > 12 && (
                  <div className="bg-white border border-slate-200 rounded-xl px-4 py-3 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-600 shadow-2xs">
                    <div className="flex items-center gap-2 font-mono tabular-nums">
                      <span>
                        顯示第 {(safeDbPage - 1) * dbPageSize + 1}–
                        {Math.min(
                          safeDbPage * dbPageSize,
                          filteredTemplates.length
                        )}{' '}
                        筆（共篩選出 {filteredTemplates.length} 筆案例）
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                      <div className="flex items-center gap-1.5">
                        <span className="text-slate-500">每頁顯示：</span>
                        <select
                          value={dbPageSize}
                          onChange={(e) =>
                            setDbPageSize(Number(e.target.value))
                          }
                          className="px-2 py-1 text-xs bg-slate-50 border border-slate-200 rounded-md text-slate-800 focus:outline-none focus:border-blue-600 font-mono"
                        >
                          <option value={24}>24 筆</option>
                          <option value={48}>48 筆</option>
                          <option value={96}>96 筆</option>
                        </select>
                      </div>

                      {totalDbPages > 1 && (
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            disabled={safeDbPage <= 1}
                            onClick={() =>
                              setDbPage((p) => Math.max(1, p - 1))
                            }
                            className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-40"
                          >
                            <ChevronLeft className="w-4 h-4" />
                          </button>
                          <span className="px-2 font-mono tabular-nums">
                            第 {safeDbPage} / {totalDbPages} 頁
                          </span>
                          <button
                            type="button"
                            disabled={safeDbPage >= totalDbPages}
                            onClick={() =>
                              setDbPage((p) =>
                                Math.min(totalDbPages, p + 1)
                              )
                            }
                            className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-40"
                          >
                            <ChevronRight className="w-4 h-4" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* =====================================================================
            TAB 2: DFM案例編輯頁 (Includes Save / Undo / Redo + Linked DynamicValueQuickEditor)
        ===================================================================== */}
        {activeTab === 'editor' && (
          <div className="space-y-6">
            {/* Top Action Bar with Undo / Redo / Save */}
            <div className="bg-white border border-slate-200 rounded-2xl px-5 py-4 flex flex-wrap items-center justify-between gap-3 shadow-2xs">
              <div>
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 font-mono tabular-nums">
                  <span>正在編輯案例：{activeTemplate.code}</span>
                  <span aria-hidden="true">·</span>
                  <span className="font-sans">{activeTemplate.category}</span>
                  <span aria-hidden="true">·</span>
                  <span
                    className={
                      saveStatus === 'error'
                        ? 'text-red-600 font-sans font-semibold'
                        : isDirty
                        ? 'text-amber-600 font-sans font-semibold'
                        : 'text-emerald-600 font-sans font-medium'
                    }
                  >
                    {saveStatus === 'error'
                      ? '本機儲存失敗（請匯出 JSON 備份）'
                      : isDirty
                      ? '尚有未確認儲存之編輯'
                      : `已儲存 (${currentHistory?.lastSavedAt || activeTemplate.updatedAt})`}
                  </span>
                </div>
                <h1 className="text-base font-bold text-slate-900 mt-0.5">
                  {activeTemplate.title}
                </h1>
              </div>

              {/* Undo / Redo / Save + Navigation Controls */}
              <div className="flex flex-wrap items-center gap-2">
                {/* Undo / Redo Group */}
                <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg border border-slate-200/80">
                  <button
                    type="button"
                    onClick={handleUndo}
                    disabled={!canUndo}
                    title="復原上一步 (Ctrl+Z)"
                    className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-md text-slate-700 hover:bg-white hover:text-slate-900 disabled:opacity-40 disabled:pointer-events-none transition-colors whitespace-nowrap shrink-0"
                  >
                    <Undo2 className="w-3.5 h-3.5" />
                    <span>Undo 復原</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleRedo}
                    disabled={!canRedo}
                    title="重做下一步 (Ctrl+Y)"
                    className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-md text-slate-700 hover:bg-white hover:text-slate-900 disabled:opacity-40 disabled:pointer-events-none transition-colors whitespace-nowrap shrink-0"
                  >
                    <Redo2 className="w-3.5 h-3.5" />
                    <span>Redo 重做</span>
                  </button>
                </div>

                {/* Explicit Save Button */}
                <button
                  type="button"
                  onClick={handleSaveTemplate}
                  title="儲存案例變更 (Ctrl+S)"
                  className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition-colors whitespace-nowrap shrink-0 shadow-2xs"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>儲存案例</span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab('database')}
                  className="px-3.5 py-2 text-xs font-medium text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors whitespace-nowrap shrink-0"
                >
                  返回DFM案例資料庫列表
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab('report')}
                  className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors whitespace-nowrap shrink-0"
                >
                  <span>前往 DFM案例</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              {/* Left 6 Cols: Basic Info + Issue & Recommendation Templates with Interactive Click Linkage */}
              <div className="lg:col-span-6 bg-white border border-slate-200 rounded-2xl p-6 space-y-5 shadow-2xs">
                <div className="border-b border-slate-200 pb-3 flex items-center justify-between gap-2">
                  <div>
                    <h2 className="text-sm font-bold text-slate-900">
                      基本資訊與固定文字 / [動態挖空] 範本設定
                    </h2>
                    <p className="text-xs text-slate-500 mt-0.5">
                      點選問題點或修改建議中的 [變數] 文字，可與下方「動態數值快速編輯」雙向點選連動。
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                      項目編號 (Code)
                    </label>
                    <input
                      type="text"
                      value={activeTemplate.code}
                      onChange={(e) =>
                        updateActiveTemplate({ code: e.target.value }, true)
                      }
                      className="w-full px-3 py-2 text-xs font-mono bg-white border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:border-blue-600"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                      製程分類 (Category)
                    </label>
                    <select
                      value={activeTemplate.category}
                      onChange={(e) =>
                        updateActiveTemplate(
                          {
                            category: e.target.value as DfmCategory,
                          },
                          false
                        )
                      }
                      className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:border-blue-600"
                    >
                      {DFM_CATEGORIES.map((cat) => (
                        <option key={cat} value={cat}>
                          {cat}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                      參考機種 (可自行填寫)
                    </label>
                    <input
                      type="text"
                      value={activeTemplate.referenceModel || ''}
                      onChange={(e) =>
                        updateActiveTemplate(
                          {
                            referenceModel: e.target.value,
                          },
                          true
                        )
                      }
                      placeholder="例如：PWR-2400W-RevA"
                      className="w-full px-3 py-2 text-xs font-mono bg-white border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:border-blue-600"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    DFM 項目名稱 (Title)
                  </label>
                  <input
                    type="text"
                    value={activeTemplate.title}
                    onChange={(e) =>
                      updateActiveTemplate({ title: e.target.value }, true)
                    }
                    placeholder="例如：併板 V-Cut 板邊零件安全間距不足"
                    className="w-full px-3 py-2.5 text-xs sm:text-sm font-medium bg-white border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:border-blue-600"
                  />
                </div>

                <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                      <Braces className="w-4 h-4 text-blue-600" />
                      <span>點擊下方按鈕快速插入動態變數至：</span>
                      <span className="text-blue-700">
                        {activeTextarea === 'issue'
                          ? '「1. DFM 問題點」'
                          : '「2. DFM 修改建議」'}
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5">
                    {QUICK_VARIABLES.map((v) => (
                      <button
                        key={v}
                        type="button"
                        onClick={() => handleInsertVariableToken(v)}
                        className="px-2.5 py-1 text-xs font-mono font-medium bg-white border border-slate-200 rounded-md text-slate-700 hover:border-blue-500 hover:text-blue-700 transition-colors whitespace-nowrap shrink-0"
                      >
                        + [{v}]
                      </button>
                    ))}
                  </div>

                  <div className="flex flex-wrap sm:flex-nowrap items-center gap-2 pt-1">
                    <input
                      type="text"
                      value={customVarName}
                      onChange={(e) => setCustomVarName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleInsertVariableToken(customVarName);
                        }
                      }}
                      placeholder="輸入自訂變數名稱 (如：錫膏厚度、過爐方向、建議孔徑)..."
                      className="w-full flex-1 px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-md text-slate-800 focus:outline-none focus:border-blue-600"
                    />
                    <button
                      type="button"
                      onClick={() => handleInsertVariableToken(customVarName)}
                      className="px-3.5 py-1.5 text-xs font-medium text-white bg-slate-800 rounded-md hover:bg-slate-700 transition-colors whitespace-nowrap shrink-0"
                    >
                      插入自訂變數
                    </button>
                  </div>
                </div>

                {/* Field 1: DFM 問題點 (Issue Description) with Click-to-Link Preview */}
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-1">
                    <label className="text-xs font-bold text-slate-800">
                      1. DFM 問題點 (Issue Description)
                    </label>
                    <span className="text-[11px] text-slate-500">
                      點選輸入框內 [變數] 或下方預覽文字可連動定位數值欄
                    </span>
                  </div>
                  <textarea
                    ref={issueTextareaRef}
                    rows={3}
                    onFocus={() => setActiveTextarea('issue')}
                    onClick={(e) => {
                      const found = findVariableAtCursor(
                        activeTemplate.issueTemplate,
                        e.currentTarget.selectionStart
                      );
                      if (found) setActiveVariable(found);
                    }}
                    onKeyUp={(e) => {
                      const found = findVariableAtCursor(
                        activeTemplate.issueTemplate,
                        e.currentTarget.selectionStart
                      );
                      if (found) setActiveVariable(found);
                    }}
                    value={activeTemplate.issueTemplate}
                    onChange={(e) =>
                      updateActiveTemplate(
                        { issueTemplate: e.target.value },
                        true
                      )
                    }
                    placeholder="輸入固定問題描述，並以 [零件編號]、[距離數值] 標記動態填空位置..."
                    className="w-full p-3 text-xs sm:text-sm leading-relaxed bg-white border border-slate-200 rounded-lg text-slate-800 focus:outline-none focus:border-blue-600"
                  />

                  {/* Interactive Clickable Linked Text for Issue Description */}
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-1.5">
                    <div className="flex items-center justify-between text-[11px] text-slate-500">
                      <span className="flex items-center gap-1 font-medium text-slate-600">
                        <MousePointerClick className="w-3.5 h-3.5 text-blue-600" />
                        問題點互動連動預覽（點擊藍字變數直接跳轉下方數值編輯框）：
                      </span>
                    </div>
                    <p className="text-xs sm:text-sm text-slate-800 leading-relaxed break-words">
                      {editorIssueSegments.map((seg, i) => {
                        if (seg.type === 'static') {
                          return <span key={i}>{seg.text}</span>;
                        }
                        const isActive =
                          activeVariable && seg.varName === activeVariable;
                        return (
                          <button
                            key={i}
                            type="button"
                            onClick={() =>
                              seg.varName && handleFocusVariableInput(seg.varName)
                            }
                            title={`點擊編輯 [${seg.varName}] 的數值`}
                            className={`inline font-mono font-semibold mx-0.5 px-1.5 py-0.5 rounded transition-colors cursor-pointer tabular-nums ${
                              isActive
                                ? 'bg-blue-600 text-white ring-2 ring-blue-300 shadow-2xs'
                                : seg.filled
                                ? 'text-blue-700 bg-blue-100/80 hover:bg-blue-200/80'
                                : 'text-amber-800 bg-amber-100 hover:bg-amber-200'
                            }`}
                          >
                            [{seg.varName}: {seg.filled ? seg.text : '未填'}]
                          </button>
                        );
                      })}
                    </p>
                  </div>
                </div>

                {/* Field 2: DFM 修改建議 (Recommendation) with Click-to-Link Preview */}
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-1">
                    <label className="text-xs font-bold text-slate-800">
                      2. DFM 修改建議 (Recommendation)
                    </label>
                    <span className="text-[11px] text-slate-500">
                      可與問題點共用相同 [變數名稱] 自動同步帶入
                    </span>
                  </div>
                  <textarea
                    ref={recTextareaRef}
                    rows={3}
                    onFocus={() => setActiveTextarea('recommendation')}
                    onClick={(e) => {
                      const found = findVariableAtCursor(
                        activeTemplate.recommendationTemplate,
                        e.currentTarget.selectionStart
                      );
                      if (found) setActiveVariable(found);
                    }}
                    onKeyUp={(e) => {
                      const found = findVariableAtCursor(
                        activeTemplate.recommendationTemplate,
                        e.currentTarget.selectionStart
                      );
                      if (found) setActiveVariable(found);
                    }}
                    value={activeTemplate.recommendationTemplate}
                    onChange={(e) =>
                      updateActiveTemplate(
                        {
                          recommendationTemplate: e.target.value,
                        },
                        true
                      )
                    }
                    placeholder="輸入具體改善建議，例如：請將零件 [零件編號] 往 [方向] 平移至少 [建議內縮距離]..."
                    className="w-full p-3 text-xs sm:text-sm leading-relaxed bg-white border border-slate-200 rounded-lg text-slate-800 focus:outline-none focus:border-blue-600"
                  />

                  {/* Interactive Clickable Linked Text for Recommendation */}
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-1.5">
                    <div className="flex items-center justify-between text-[11px] text-slate-500">
                      <span className="flex items-center gap-1 font-medium text-slate-600">
                        <MousePointerClick className="w-3.5 h-3.5 text-emerald-600" />
                        修改建議互動連動預覽（點擊綠字變數直接跳轉下方數值編輯框）：
                      </span>
                    </div>
                    <p className="text-xs sm:text-sm text-slate-800 leading-relaxed break-words">
                      {editorRecSegments.map((seg, i) => {
                        if (seg.type === 'static') {
                          return <span key={i}>{seg.text}</span>;
                        }
                        const isActive =
                          activeVariable && seg.varName === activeVariable;
                        return (
                          <button
                            key={i}
                            type="button"
                            onClick={() =>
                              seg.varName && handleFocusVariableInput(seg.varName)
                            }
                            title={`點擊編輯 [${seg.varName}] 的數值`}
                            className={`inline font-mono font-semibold mx-0.5 px-1.5 py-0.5 rounded transition-colors cursor-pointer tabular-nums ${
                              isActive
                                ? 'bg-emerald-600 text-white ring-2 ring-emerald-300 shadow-2xs'
                                : seg.filled
                                ? 'text-emerald-800 bg-emerald-100/80 hover:bg-emerald-200/80'
                                : 'text-amber-800 bg-amber-100 hover:bg-amber-200'
                            }`}
                          >
                            [{seg.varName}: {seg.filled ? seg.text : '未填'}]
                          </button>
                        );
                      })}
                    </p>
                  </div>
                </div>
              </div>

              {/* Right 6 Cols: Image Inspector + Editable Reference Specs Database */}
              <div className="lg:col-span-6 space-y-6">
                <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-2xs">
                  <ImageInspector
                    imageUrl={activeTemplate.imageUrl}
                    imageCaption={activeTemplate.imageCaption || ''}
                    annotations={activeTemplate.annotations || []}
                    drawings={drawings}
                    onChangeImage={(url) =>
                      updateActiveTemplate({ imageUrl: url }, false)
                    }
                    onChangeCaption={(caption) =>
                      updateActiveTemplate({ imageCaption: caption }, true)
                    }
                    onChangeAnnotations={(annotations) =>
                      updateActiveTemplate({ annotations }, false)
                    }
                    onApplyDrawing={handleApplyDrawingToCase}
                    onOpenDrawingGallery={() => setActiveTab('gallery')}
                  />
                </div>

                <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-2xs">
                  <SpecDatabaseManager
                    currentSpecText={activeTemplate.referenceSpec}
                    onChangeSpecText={(newText) =>
                      updateActiveTemplate({ referenceSpec: newText }, true)
                    }
                    specs={specs}
                    onAddSpec={handleAddSpec}
                    onUpdateSpec={handleUpdateSpec}
                    onDeleteSpec={handleDeleteSpec}
                  />
                </div>
              </div>
            </div>

            {/* Bottom of DFM案例編輯頁: Compact Dynamic Value Quick Editor with Bidirectional Linkage */}
            <DynamicValueQuickEditor
              detectedVariables={detectedVariables}
              variableValues={variableValues}
              referenceModel={activeTemplate.referenceModel || ''}
              activeVariable={activeVariable}
              onSelectVariable={setActiveVariable}
              onChangeVariable={handleVariableChange}
              onChangeReferenceModel={(val) =>
                updateActiveTemplate({ referenceModel: val }, true)
              }
              onRestoreSample={handleRestoreSampleVariables}
              onClearVariables={handleClearVariables}
              onLocateInTemplate={handleLocateInTemplate}
              inputRefs={dynamicInputRefs}
            />
          </div>
        )}

        {/* =====================================================================
            TAB 3: DFM案例
            1. Top: Large Prominent Table (DFM 問題點 / 圖片 / DFM 修改建議)
            2. Middle: Secondary Metadata Table (編號 / 製程分類 / 參考機種 / 參考資料)
            3. Bottom: Sleek, Compact Dynamic Value Editor (動態數值快速編輯)
        ===================================================================== */}
        {activeTab === 'report' && (
          <div className="space-y-5">
            {/* TOP & MIDDLE: Main DFM Case Preview with Clickable Variable Linkage */}
            <ReportPreviewPanel
              template={activeTemplate}
              variableValues={variableValues}
              reportBatch={reportBatch}
              activeVariable={activeVariable}
              onClickVariable={handleFocusVariableInput}
              onAddToBatch={handleAddToBatch}
              onRemoveFromBatch={(id) =>
                setReportBatch((prev) => prev.filter((item) => item.id !== id))
              }
              onClearBatch={() => {
                setReportBatch([]);
                showToast('已清空報告彙整清單');
              }}
            />

            {/* BOTTOM: Compact, Harmonious Dynamic Value Editor with Bidirectional Linkage */}
            <DynamicValueQuickEditor
              detectedVariables={detectedVariables}
              variableValues={variableValues}
              referenceModel={activeTemplate.referenceModel || ''}
              activeVariable={activeVariable}
              onSelectVariable={setActiveVariable}
              onChangeVariable={handleVariableChange}
              onChangeReferenceModel={(val) =>
                updateActiveTemplate({ referenceModel: val }, true)
              }
              onRestoreSample={handleRestoreSampleVariables}
              onClearVariables={handleClearVariables}
              onNavigateToEditor={() => setActiveTab('editor')}
              inputRefs={dynamicInputRefs}
            />
          </div>
        )}

        {/* =====================================================================
            TAB 4 (Right of DFM案例): DFM工程圖庫
            Allows custom image upload, description editing, annotations, and Save/Undo/Redo
        ===================================================================== */}
        {activeTab === 'gallery' && (
          <DfmDrawingGallery
            drawings={drawings}
            onChangeDrawings={setDrawings}
            onSaveDrawingsToStorage={handleSaveDrawingsDirectly}
            onApplyToCurrentCase={(drawing) => {
              handleApplyDrawingToCase(drawing);
              setActiveTab('report');
            }}
            onShowToast={showToast}
          />
        )}
      </main>

      {/* Pre-Import JSON Verification & Confirmation Modal */}
      {pendingImport && (
        <div
          onClick={() => setPendingImport(null)}
          className="fixed inset-0 z-50 bg-slate-950/75 flex items-center justify-center p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="max-w-lg w-full bg-white border border-slate-200 rounded-2xl shadow-2xl overflow-hidden"
          >
            <div className="px-5 py-4 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileCheck2 className="w-5 h-5 text-emerald-400" />
                <span className="text-sm font-bold">
                  匯入 JSON 備份檔案確認
                </span>
              </div>
              <button
                type="button"
                onClick={() => setPendingImport(null)}
                className="p-1 text-slate-300 hover:text-white rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs text-slate-700">
              <p className="leading-relaxed">
                檔案已通過格式驗證。為保護您現有的工作台資料，請先確認以下摘要資訊，再選擇匯入方式：
              </p>

              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-2 font-mono">
                <div className="flex justify-between">
                  <span className="text-slate-500 font-sans">檔案名稱：</span>
                  <span className="font-semibold text-slate-900 truncate max-w-[260px]">
                    {pendingImport.summary.fileName}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500 font-sans">檔案大小：</span>
                  <span className="font-semibold text-slate-900">
                    {pendingImport.summary.formattedFileSize}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500 font-sans">DFM 案例數量：</span>
                  <span className="font-bold text-blue-700">
                    {pendingImport.summary.templateCount} 筆
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500 font-sans">內含圖片數量：</span>
                  <span className="font-bold text-emerald-700">
                    {pendingImport.summary.totalImageCount} 張
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500 font-sans">
                    工程圖庫 / 常用規範：
                  </span>
                  <span className="text-slate-800">
                    圖庫 {pendingImport.summary.drawingCount} 張 · 規範{' '}
                    {pendingImport.summary.specCount} 筆
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500 font-sans">格式版本：</span>
                  <span className="text-slate-600">
                    {pendingImport.summary.version}
                  </span>
                </div>
              </div>

              {pendingImport.warnings.length > 0 && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl space-y-1 text-amber-900">
                  <div className="font-bold">相容性轉換提醒：</div>
                  <ul className="list-disc pl-4 space-y-0.5">
                    {pendingImport.warnings.slice(0, 3).map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="space-y-2 pt-1">
                <button
                  type="button"
                  onClick={() => handleConfirmImport('overwrite')}
                  className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl shadow-2xs flex items-center justify-center gap-2 transition-colors"
                >
                  <Upload className="w-4 h-4" />
                  <span>確認匯入（整份覆蓋目前資料 — 預設）</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleConfirmImport('merge')}
                  className="w-full py-2 px-4 bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border border-emerald-200 font-semibold rounded-xl flex items-center justify-center gap-2 transition-colors"
                >
                  <Layers className="w-4 h-4 text-emerald-700" />
                  <span>安全合併匯入（保留現有資料並合併新項目）</span>
                </button>

                <button
                  type="button"
                  onClick={() => setPendingImport(null)}
                  className="w-full py-2 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium rounded-xl transition-colors"
                >
                  取消匯入（保留原本資料）
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Functional Footer with Storage Capacity, Image Count, Save Status & Backup Time */}
      <footer className="mt-auto border-t border-slate-200 bg-white px-4 sm:px-6 py-3.5">
        <div className="max-w-[1440px] mx-auto flex flex-col lg:flex-row items-center justify-between gap-2 text-xs text-slate-500">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-slate-700">
              DFM案例資料庫工作台
            </span>
            <span aria-hidden="true">·</span>
            <span>
              儲存狀態：
              {saveStatus === 'saved'
                ? `儲存成功 (${lastSavedAt})`
                : saveStatus === 'saving'
                ? '儲存中...'
                : '儲存失敗（請匯出備份）'}
            </span>
            <span aria-hidden="true">·</span>
            <span>
              最近匯出備份：{lastBackupAt ? lastBackupAt : '尚未匯出備份'}
            </span>
          </div>

          <div className="font-mono tabular-nums flex flex-wrap items-center gap-2">
            <span>案例：{templates.length} 筆</span>
            <span aria-hidden="true">·</span>
            <span>圖片總數：{storageMetrics.totalImageCount} 張</span>
            <span aria-hidden="true">·</span>
            <span>工程圖庫：{drawings.length} 張</span>
            <span aria-hidden="true">·</span>
            <span>規範庫：{specs.length} 筆</span>
            <span aria-hidden="true">·</span>
            <span>報告清單：{reportBatch.length} 筆</span>
            <span aria-hidden="true">·</span>
            <span title="此數值為資料序列化後之 JSON 大小估算值，並非瀏覽器實際剩餘空間">
              JSON 大小估算：約 {storageMetrics.formattedJsonSize}
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
