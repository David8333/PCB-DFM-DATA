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
  DEFAULT_REFERENCE_SPECS,
  PRESET_CAD_DIAGRAMS,
} from './data/defaultTemplates';
import {
  extractVariables,
  compileTemplateText,
  parseTemplateSegments,
} from './utils/templateParser';
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

const STORAGE_KEY_TEMPLATES = 'dfm_vault_templates_v2';
const STORAGE_KEY_BATCH = 'dfm_vault_report_batch_v2';
const STORAGE_KEY_SPECS = 'dfm_vault_specs_v2';
const STORAGE_KEY_DRAWINGS = 'dfm_vault_drawings_v2';

type WorkspaceTab = 'database' | 'editor' | 'report' | 'gallery';

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

function cloneTemplate(tpl: DfmTemplate): DfmTemplate {
  return JSON.parse(JSON.stringify(tpl));
}

export default function App() {
  // 0. Daily Password Authentication State (DV + 今日日期)
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() =>
    isDailySessionAuthenticated()
  );

  // 1. Load Templates from localStorage or fall back to DEFAULT_DFM_TEMPLATES
  const [templates, setTemplates] = useState<DfmTemplate[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_TEMPLATES);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed.map((tpl: DfmTemplate) => ({
            ...tpl,
            category: DFM_CATEGORIES.includes(tpl.category)
              ? tpl.category
              : 'PCB Layout',
            referenceModel: tpl.referenceModel ?? '',
          }));
        }
      }
    } catch {
      // ignore storage parse error
    }
    return DEFAULT_DFM_TEMPLATES;
  });

  // 2. Load Editable Reference Specs from localStorage
  const [specs, setSpecs] = useState<ReferenceSpecItem[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_SPECS);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {
      // ignore
    }
    return DEFAULT_REFERENCE_SPECS;
  });

  // 3. Load Batch Report Queue from localStorage
  const [reportBatch, setReportBatch] = useState<CompiledReportItem[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_BATCH);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {
      // ignore
    }
    return [];
  });

  // 4. Load DFM Engineering Drawing Gallery (DFM工程圖庫) from localStorage
  const [drawings, setDrawings] = useState<DfmDrawingItem[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_DRAWINGS);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    } catch {
      // ignore
    }
    return PRESET_CAD_DIAGRAMS;
  });

  // Active Main Tab: 'database' (DFM案例資料庫列表) | 'editor' (DFM案例編輯頁) | 'report' (DFM案例) | 'gallery' (DFM工程圖庫)
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('report');

  const [selectedId, setSelectedId] = useState<string>(() => {
    return templates[0]?.id || DEFAULT_DFM_TEMPLATES[0].id;
  });

  // Active linked variable name for bidirectional highlighting & focus
  const [activeVariable, setActiveVariable] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [customVarName, setCustomVarName] = useState('');
  const [activeTextarea, setActiveTextarea] = useState<'issue' | 'recommendation'>('issue');
  const [statusBanner, setStatusBanner] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  // Per-template Undo/Redo History Map: { [templateId]: { stack: DfmTemplate[], index: number, dirty: boolean } }
  const [historyMap, setHistoryMap] = useState<
    Record<
      string,
      { stack: DfmTemplate[]; index: number; isDirty: boolean; lastSavedAt?: string }
    >
  >({});

  const fileImportRef = useRef<HTMLInputElement>(null);
  const issueTextareaRef = useRef<HTMLTextAreaElement>(null);
  const recTextareaRef = useRef<HTMLTextAreaElement>(null);
  const dynamicInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  // Sync templates to localStorage automatically
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_TEMPLATES, JSON.stringify(templates));
    } catch {
      setStatusBanner({
        type: 'error',
        message: '瀏覽器儲存空間已滿，建議壓縮上傳圖片或匯出 JSON 備份。',
      });
    }
  }, [templates]);

  // Sync specs to localStorage automatically
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_SPECS, JSON.stringify(specs));
    } catch {
      // ignore
    }
  }, [specs]);

  // Sync batch report items to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_BATCH, JSON.stringify(reportBatch));
    } catch {
      // ignore
    }
  }, [reportBatch]);

  // Sync drawings (DFM工程圖庫) to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_DRAWINGS, JSON.stringify(drawings));
    } catch {
      setStatusBanner({
        type: 'error',
        message: '瀏覽器儲存空間已滿，建議壓縮上傳圖片或匯出 JSON 備份。',
      });
    }
  }, [drawings]);

  const showToast = useCallback(
    (message: string, type: 'success' | 'error' = 'success') => {
      setStatusBanner({ type, message });
      setTimeout(() => {
        setStatusBanner((prev) => (prev?.message === message ? null : prev));
      }, 3000);
    },
    []
  );

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
          stack: [cloneTemplate(activeTemplate)],
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

  // Update active template and record into Undo/Redo stack
  const updateActiveTemplate = useCallback(
    (patch: Partial<DfmTemplate>) => {
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

      setHistoryMap((prev) => {
        const entry = prev[activeTemplate.id] || {
          stack: [cloneTemplate(activeTemplate)],
          index: 0,
          isDirty: false,
        };
        const sliced = entry.stack.slice(0, entry.index + 1);
        const nextStack = [...sliced, cloneTemplate(nextTemplate)].slice(-50);
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
    const prevIndex = entry.index - 1;
    const snapshot = cloneTemplate(entry.stack[prevIndex]);

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
    const nextIndex = entry.index + 1;
    const snapshot = cloneTemplate(entry.stack[nextIndex]);

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

  // Explicit Save Handler in DFM案例編輯頁
  const handleSaveTemplate = useCallback(() => {
    try {
      const nowTime = new Date().toLocaleTimeString('zh-TW', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
      localStorage.setItem(STORAGE_KEY_TEMPLATES, JSON.stringify(templates));
      localStorage.setItem(STORAGE_KEY_SPECS, JSON.stringify(specs));
      localStorage.setItem(STORAGE_KEY_DRAWINGS, JSON.stringify(drawings));
      setHistoryMap((prev) => {
        const entry = prev[activeTemplate.id] || {
          stack: [cloneTemplate(activeTemplate)],
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
      showToast(`已成功儲存案例「${activeTemplate.code} - ${activeTemplate.title}」`);
    } catch {
      showToast('儲存失敗：瀏覽器儲存空間不足', 'error');
    }
  }, [activeTemplate, specs, templates, drawings, showToast]);

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
    updateActiveTemplate({
      variableDefaults: {
        ...variableValues,
        [varName]: val,
      },
    });
  };

  const handleClearVariables = () => {
    const cleared: Record<string, string> = {};
    detectedVariables.forEach((v) => {
      cleared[v] = '';
    });
    updateActiveTemplate({ variableDefaults: cleared });
    showToast('已清空目前項目的填空變數，可重新輸入實測值');
  };

  const handleRestoreSampleVariables = () => {
    const defaultMatch = DEFAULT_DFM_TEMPLATES.find(
      (d) => d.id === activeTemplate.id || d.code === activeTemplate.code
    );
    if (defaultMatch) {
      updateActiveTemplate({
        variableDefaults: { ...defaultMatch.variableDefaults },
      });
      showToast('已載入預設工程範例數值');
    } else {
      const filled: Record<string, string> = {};
      detectedVariables.forEach((v) => {
        filled[v] = variableValues[v] || `範例_${v}`;
      });
      updateActiveTemplate({ variableDefaults: filled });
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
    updateActiveTemplate({ referenceSpec: content });
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
    updateActiveTemplate({
      imageUrl: drawing.url,
      imageCaption: drawing.description || drawing.name,
      annotations: drawing.annotations ? [...drawing.annotations] : [],
    });
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
      updateActiveTemplate({
        issueTemplate: `${activeTemplate.issueTemplate}${token}`,
        variableDefaults: {
          ...variableValues,
          [clean]: variableValues[clean] ?? '',
        },
      });
    } else {
      updateActiveTemplate({
        recommendationTemplate: `${activeTemplate.recommendationTemplate}${token}`,
        variableDefaults: {
          ...variableValues,
          [clean]: variableValues[clean] ?? '',
        },
      });
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
      annotations: tpl.annotations ? [...tpl.annotations] : [],
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

  // Export JSON
  const handleExportJson = () => {
    const payload = {
      app: 'DFM Case Database Workbench',
      version: '2.6.0',
      exportedAt: new Date().toISOString(),
      templates,
      specs,
      drawings,
      reportBatch,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `dfm-database-backup-${new Date()
      .toISOString()
      .slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast(
      `已匯出 ${templates.length} 組 DFM 案例、${drawings.length} 張工程圖面與 ${specs.length} 筆規範資料 (JSON)`
    );
  };

  // Import JSON
  const handleImportJson = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const raw = event.target?.result;
        if (typeof raw !== 'string') return;
        const parsed = JSON.parse(raw);

        const incomingTemplates: DfmTemplate[] = Array.isArray(parsed)
          ? parsed
          : Array.isArray(parsed.templates)
          ? parsed.templates
          : [];

        if (incomingTemplates.length === 0) {
          showToast('匯入失敗：JSON 檔案中未找到有效的 DFM 案例陣列', 'error');
          return;
        }

        const sanitized: DfmTemplate[] = incomingTemplates.map((item, idx) => ({
          id: item.id || `imported-${Date.now()}-${idx}`,
          code: item.code || `DFM-IMP-${idx + 1}`,
          title: item.title || '未命名 DFM 項目',
          category: DFM_CATEGORIES.includes(item.category)
            ? item.category
            : 'PCB Layout',
          referenceModel: item.referenceModel || '',
          issueTemplate: item.issueTemplate || '',
          recommendationTemplate: item.recommendationTemplate || '',
          referenceSpec: item.referenceSpec || '',
          imageUrl: item.imageUrl || '',
          imageCaption: item.imageCaption || '',
          annotations: Array.isArray(item.annotations) ? item.annotations : [],
          variableDefaults:
            item.variableDefaults && typeof item.variableDefaults === 'object'
              ? item.variableDefaults
              : {},
          updatedAt: item.updatedAt || new Date().toISOString().slice(0, 10),
        }));

        setTemplates(sanitized);
        setSelectedId(sanitized[0].id);
        setHistoryMap({});
        if (Array.isArray(parsed.specs) && parsed.specs.length > 0) {
          setSpecs(parsed.specs);
        }
        if (Array.isArray(parsed.drawings) && parsed.drawings.length > 0) {
          setDrawings(parsed.drawings);
        }
        if (Array.isArray(parsed.reportBatch)) {
          setReportBatch(parsed.reportBatch);
        }
        showToast(`成功匯入 ${sanitized.length} 組 DFM 案例資料！`);
      } catch {
        showToast('JSON 格式解析錯誤，請確認匯入檔案是否正確', 'error');
      } finally {
        if (fileImportRef.current) {
          fileImportRef.current.value = '';
        }
      }
    };
    reader.readAsText(file);
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
      annotations: activeTemplate.annotations,
      variableValues: { ...variableValues },
      createdAt: new Date().toISOString(),
    };
    setReportBatch((prev) => [...prev, newItem]);
    showToast(`已將「${activeTemplate.code}」加入報告彙整清單`);
  };

  // Filtered templates list
  const filteredTemplates = useMemo(() => {
    return templates.filter((tpl) => {
      const matchCategory =
        selectedCategory === 'ALL' || tpl.category === selectedCategory;
      const q = searchQuery.trim().toLowerCase();
      if (!q) return matchCategory;
      const matchQuery =
        tpl.code.toLowerCase().includes(q) ||
        tpl.title.toLowerCase().includes(q) ||
        (tpl.referenceModel || '').toLowerCase().includes(q) ||
        tpl.issueTemplate.toLowerCase().includes(q) ||
        tpl.recommendationTemplate.toLowerCase().includes(q) ||
        tpl.referenceSpec.toLowerCase().includes(q);
      return matchCategory && matchQuery;
    });
  }, [templates, selectedCategory, searchQuery]);

  // Show Login Password Gate if not authenticated
  if (!isAuthenticated) {
    return <LoginGate onSuccess={() => setIsAuthenticated(true)} />;
  }

  return (
    <div className="min-h-screen w-full overflow-x-hidden flex flex-col bg-slate-50 text-slate-900">
      {/* Top Header Bar: Brand Title + Lock/Logout */}
      <header className="sticky top-0 z-30 bg-white border-b border-slate-200 px-4 sm:px-6 py-3.5 flex items-center justify-between gap-4">
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

      {/* Notification Banner */}
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
            TAB 1: DFM案例資料庫列表
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
                  const count = templates.filter((t) => t.category === cat).length;
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
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {filteredTemplates.map((tpl) => {
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
                      isDirty
                        ? 'text-amber-600 font-sans font-semibold'
                        : 'text-emerald-600 font-sans font-medium'
                    }
                  >
                    {isDirty
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
                        updateActiveTemplate({ code: e.target.value })
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
                        updateActiveTemplate({
                          category: e.target.value as DfmCategory,
                        })
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
                        updateActiveTemplate({
                          referenceModel: e.target.value,
                        })
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
                      updateActiveTemplate({ title: e.target.value })
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
                      updateActiveTemplate({ issueTemplate: e.target.value })
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
                      updateActiveTemplate({
                        recommendationTemplate: e.target.value,
                      })
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
                      updateActiveTemplate({ imageUrl: url })
                    }
                    onChangeCaption={(caption) =>
                      updateActiveTemplate({ imageCaption: caption })
                    }
                    onChangeAnnotations={(annotations) =>
                      updateActiveTemplate({ annotations })
                    }
                    onApplyDrawing={handleApplyDrawingToCase}
                    onOpenDrawingGallery={() => setActiveTab('gallery')}
                  />
                </div>

                <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-2xs">
                  <SpecDatabaseManager
                    currentSpecText={activeTemplate.referenceSpec}
                    onChangeSpecText={(newText) =>
                      updateActiveTemplate({ referenceSpec: newText })
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
                updateActiveTemplate({ referenceModel: val })
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
                updateActiveTemplate({ referenceModel: val })
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
            onApplyToCurrentCase={(drawing) => {
              handleApplyDrawingToCase(drawing);
              setActiveTab('report');
            }}
            onShowToast={showToast}
          />
        )}
      </main>

      {/* Quiet Functional Footer */}
      <footer className="mt-auto border-t border-slate-200 bg-white px-4 sm:px-6 py-3.5">
        <div className="max-w-[1440px] mx-auto flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-slate-500">
          <div>
            DFM案例資料庫工作台 · 支援動態變數雙向點選連動與本機自動儲存
          </div>
          <div className="font-mono tabular-nums">
            案例數：{templates.length} 筆 · 工程圖庫：{drawings.length} 張 · 常用規範庫：{specs.length} 筆 · 報告清單：{reportBatch.length} 筆
          </div>
        </div>
      </footer>
    </div>
  );
}
