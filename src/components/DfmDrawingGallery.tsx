import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Plus,
  Upload,
  Link as LinkIcon,
  Trash2,
  Copy as DuplicateIcon,
  Save,
  Undo2,
  Redo2,
  CheckCircle2,
  Search,
  Crosshair,
  Maximize2,
  X,
  Image as ImageIcon,
  ArrowUpRight,
} from 'lucide-react';
import { DfmDrawingItem, DfmCategory, ImageAnnotation } from '../types/dfm';
import { DFM_CATEGORIES } from '../data/defaultTemplates';

interface DfmDrawingGalleryProps {
  drawings: DfmDrawingItem[];
  onChangeDrawings: (nextDrawings: DfmDrawingItem[]) => void;
  onApplyToCurrentCase: (drawing: DfmDrawingItem) => void;
  onShowToast: (msg: string, type?: 'success' | 'error') => void;
}

function cloneDrawings(list: DfmDrawingItem[]): DfmDrawingItem[] {
  return JSON.parse(JSON.stringify(list));
}

export const DfmDrawingGallery: React.FC<DfmDrawingGalleryProps> = ({
  drawings,
  onChangeDrawings,
  onApplyToCurrentCase,
  onShowToast,
}) => {
  const [selectedDrawingId, setSelectedDrawingId] = useState<string>(
    () => drawings[0]?.id || ''
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [inputMode, setInputMode] = useState<'upload' | 'url'>('upload');
  const [annotateMode, setAnnotateMode] = useState(false);
  const [newPinLabel, setNewPinLabel] = useState('不良位置標註');
  const [isZoomed, setIsZoomed] = useState(false);

  // Undo / Redo / Save History Stack for the Drawing Gallery
  const [history, setHistory] = useState<{
    stack: DfmDrawingItem[][];
    index: number;
    isDirty: boolean;
    lastSavedAt: string;
  }>(() => ({
    stack: [cloneDrawings(drawings)],
    index: 0,
    isDirty: false,
    lastSavedAt: new Date().toISOString().slice(0, 10),
  }));

  const fileInputRef = useRef<HTMLInputElement>(null);
  const replaceFileInputRef = useRef<HTMLInputElement>(null);
  const imageContainerRef = useRef<HTMLDivElement>(null);

  // Ensure selectedDrawingId always points to a valid item
  useEffect(() => {
    if (
      drawings.length > 0 &&
      !drawings.some((d) => d.id === selectedDrawingId)
    ) {
      setSelectedDrawingId(drawings[0].id);
    }
  }, [drawings, selectedDrawingId]);

  const activeDrawing =
    drawings.find((d) => d.id === selectedDrawingId) || drawings[0] || null;

  const canUndo = history.index > 0;
  const canRedo = history.index < history.stack.length - 1;

  // Push a new drawings state into history and update parent
  const commitDrawingsChange = useCallback(
    (nextDrawings: DfmDrawingItem[]) => {
      onChangeDrawings(nextDrawings);
      setHistory((prev) => {
        const sliced = prev.stack.slice(0, prev.index + 1);
        const nextStack = [...sliced, cloneDrawings(nextDrawings)].slice(-40);
        return {
          ...prev,
          stack: nextStack,
          index: nextStack.length - 1,
          isDirty: true,
        };
      });
    },
    [onChangeDrawings]
  );

  // Update the currently selected drawing item
  const updateActiveDrawing = useCallback(
    (patch: Partial<DfmDrawingItem>) => {
      if (!activeDrawing) return;
      const today = new Date().toISOString().slice(0, 10);
      const nextList = drawings.map((item) =>
        item.id === activeDrawing.id
          ? { ...item, ...patch, updatedAt: today }
          : item
      );
      commitDrawingsChange(nextList);
    },
    [activeDrawing, drawings, commitDrawingsChange]
  );

  // Undo handler
  const handleUndo = useCallback(() => {
    if (history.index <= 0) return;
    const targetIndex = history.index - 1;
    const restored = cloneDrawings(history.stack[targetIndex]);
    onChangeDrawings(restored);
    setHistory((prev) => ({
      ...prev,
      index: targetIndex,
      isDirty: true,
    }));
    onShowToast('已復原工程圖庫上一步變更 (Undo)');
  }, [history, onChangeDrawings, onShowToast]);

  // Redo handler
  const handleRedo = useCallback(() => {
    if (history.index >= history.stack.length - 1) return;
    const targetIndex = history.index + 1;
    const restored = cloneDrawings(history.stack[targetIndex]);
    onChangeDrawings(restored);
    setHistory((prev) => ({
      ...prev,
      index: targetIndex,
      isDirty: true,
    }));
    onShowToast('已重做工程圖庫下一步變更 (Redo)');
  }, [history, onChangeDrawings, onShowToast]);

  // Save handler
  const handleSaveGallery = useCallback(() => {
    const nowTime = new Date().toTimeString().slice(0, 8);
    onChangeDrawings([...drawings]);
    setHistory((prev) => ({
      ...prev,
      isDirty: false,
      lastSavedAt: nowTime,
    }));
    onShowToast(
      `已儲存 DFM工程圖庫（共 ${drawings.length} 張工程圖面與圖片說明）`
    );
  }, [drawings, onChangeDrawings, onShowToast]);

  // Keyboard shortcuts (Ctrl+Z / Ctrl+Y / Ctrl+S) inside DFM工程圖庫
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const isMod = e.ctrlKey || e.metaKey;
      if (!isMod) return;
      const key = e.key.toLowerCase();
      if (key === 's') {
        e.preventDefault();
        handleSaveGallery();
      } else if (key === 'z' && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
      } else if (key === 'y' || (key === 'z' && e.shiftKey)) {
        e.preventDefault();
        handleRedo();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleSaveGallery, handleUndo, handleRedo]);

  // Compress uploaded image and either create new item or update active item
  const processImageFile = (
    file: File,
    mode: 'new' | 'replace'
  ) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const maxW = 1080;
        const scale = img.width > maxW ? maxW / img.width : 1;
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.86);
        const cleanFileName = file.name.replace(/\.[^/.]+$/, '');
        const today = new Date().toISOString().slice(0, 10);

        if (mode === 'new') {
          const newItem: DfmDrawingItem = {
            id: `drawing-${Date.now()}`,
            name: cleanFileName || `新建工程圖面 #${drawings.length + 1}`,
            category:
              selectedCategory !== 'ALL'
                ? (selectedCategory as DfmCategory)
                : 'PCB Layout',
            url: dataUrl,
            description: `圖示：${cleanFileName}（請在此編寫圖片說明與 DFM 判讀重點）`,
            annotations: [],
            updatedAt: today,
          };
          const nextList = [newItem, ...drawings];
          commitDrawingsChange(nextList);
          setSelectedDrawingId(newItem.id);
          onShowToast(`已上傳並新增工程圖面「${newItem.name}」`);
        } else if (activeDrawing) {
          updateActiveDrawing({ url: dataUrl });
          onShowToast(`已更新「${activeDrawing.name}」的圖片檔案`);
        }
      };
      if (typeof event.target?.result === 'string') {
        img.src = event.target.result;
      }
    };
    reader.readAsDataURL(file);
  };

  // Create a blank/template drawing item
  const handleCreateBlankDrawing = () => {
    const today = new Date().toISOString().slice(0, 10);
    const newItem: DfmDrawingItem = {
      id: `drawing-${Date.now()}`,
      name: `新建 DFM 工程圖面 #${drawings.length + 1}`,
      category:
        selectedCategory !== 'ALL'
          ? (selectedCategory as DfmCategory)
          : 'PCB Layout',
      url: drawings[0]?.url || '',
      description: '請輸入此工程圖面的詳細圖片說明、不良位置描述或量測數值...',
      annotations: [],
      updatedAt: today,
    };
    const nextList = [newItem, ...drawings];
    commitDrawingsChange(nextList);
    setSelectedDrawingId(newItem.id);
    onShowToast(`已新增工程圖面「${newItem.name}」，可於右側上傳圖片與編寫說明`);
  };

  // Duplicate drawing
  const handleDuplicateDrawing = (item: DfmDrawingItem, e: React.MouseEvent) => {
    e.stopPropagation();
    const today = new Date().toISOString().slice(0, 10);
    const dup: DfmDrawingItem = {
      ...item,
      id: `drawing-${Date.now()}`,
      name: `${item.name} (副本)`,
      annotations: item.annotations ? [...item.annotations] : [],
      updatedAt: today,
    };
    const nextList = [dup, ...drawings];
    commitDrawingsChange(nextList);
    setSelectedDrawingId(dup.id);
    onShowToast(`已複製工程圖面「${item.name}」`);
  };

  // Delete drawing
  const handleDeleteDrawing = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (drawings.length <= 1) {
      onShowToast('DFM工程圖庫至少需保留一張工程圖面', 'error');
      return;
    }
    const target = drawings.find((d) => d.id === id);
    const nextList = drawings.filter((d) => d.id !== id);
    commitDrawingsChange(nextList);
    if (selectedDrawingId === id && nextList[0]) {
      setSelectedDrawingId(nextList[0].id);
    }
    onShowToast(`已刪除工程圖面「${target?.name || ''}」`);
  };

  // Click on image to add red callout pin
  const handleCanvasClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!annotateMode || !imageContainerRef.current || !activeDrawing) return;
    const rect = imageContainerRef.current.getBoundingClientRect();
    const x = Math.round(((e.clientX - rect.left) / rect.width) * 100);
    const y = Math.round(((e.clientY - rect.top) / rect.height) * 100);
    const currentPins = activeDrawing.annotations || [];
    const nextPin: ImageAnnotation = {
      id: `pin-${Date.now()}`,
      x: Math.max(4, Math.min(96, x)),
      y: Math.max(6, Math.min(94, y)),
      label: newPinLabel.trim() || `標註點 #${currentPins.length + 1}`,
    };
    updateActiveDrawing({ annotations: [...currentPins, nextPin] });
  };

  const handleRemovePin = (pinId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!activeDrawing) return;
    const currentPins = activeDrawing.annotations || [];
    updateActiveDrawing({
      annotations: currentPins.filter((p) => p.id !== pinId),
    });
  };

  // Filter drawings
  const filteredDrawings = drawings.filter((d) => {
    const matchCategory =
      selectedCategory === 'ALL' || d.category === selectedCategory;
    const q = searchQuery.trim().toLowerCase();
    if (!q) return matchCategory;
    return (
      matchCategory &&
      (d.name.toLowerCase().includes(q) ||
        (d.description || '').toLowerCase().includes(q) ||
        d.category.toLowerCase().includes(q))
    );
  });

  return (
    <div className="space-y-6">
      {/* Top Action Header Bar with Save / Undo / Redo / Upload */}
      <div className="bg-white border border-slate-200 rounded-2xl px-5 py-4 flex flex-wrap items-center justify-between gap-3 shadow-2xs">
        <div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 font-mono tabular-nums">
            <span>DFM工程圖庫管理</span>
            <span aria-hidden="true">·</span>
            <span>共 {drawings.length} 張工程圖面</span>
            <span aria-hidden="true">·</span>
            <span
              className={
                history.isDirty
                  ? 'text-amber-600 font-sans font-semibold'
                  : 'text-emerald-600 font-sans font-medium'
              }
            >
              {history.isDirty
                ? '尚有未確認儲存之編輯'
                : `已儲存 (${history.lastSavedAt})`}
            </span>
          </div>
          <h1 className="text-base font-bold text-slate-900 mt-0.5">
            DFM工程圖庫（支援自行上傳圖片、編寫圖片說明、標註、儲存、復原與重做）
          </h1>
        </div>

        {/* Action Controls: Undo / Redo / Save / Upload New */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg border border-slate-200/80">
            <button
              type="button"
              onClick={handleUndo}
              disabled={!canUndo}
              title="復原上一步 (Ctrl+Z)"
              className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-md text-slate-700 hover:bg-white hover:text-slate-900 disabled:opacity-40 disabled:pointer-events-none transition-colors whitespace-nowrap shrink-0"
            >
              <Undo2 className="w-3.5 h-3.5" />
              <span>復原 (Undo)</span>
            </button>

            <button
              type="button"
              onClick={handleRedo}
              disabled={!canRedo}
              title="重做下一步 (Ctrl+Y)"
              className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-md text-slate-700 hover:bg-white hover:text-slate-900 disabled:opacity-40 disabled:pointer-events-none transition-colors whitespace-nowrap shrink-0"
            >
              <Redo2 className="w-3.5 h-3.5" />
              <span>重做 (Redo)</span>
            </button>
          </div>

          <button
            type="button"
            onClick={handleSaveGallery}
            title="儲存圖庫變更 (Ctrl+S)"
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition-colors whitespace-nowrap shrink-0 shadow-2xs"
          >
            <Save className="w-3.5 h-3.5" />
            <span>儲存圖庫</span>
          </button>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) processImageFile(file, 'new');
              e.target.value = '';
            }}
            className="hidden"
          />

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors whitespace-nowrap shrink-0"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>上傳圖片新增至圖庫</span>
          </button>

          <button
            type="button"
            onClick={handleCreateBlankDrawing}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors whitespace-nowrap shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>新增圖庫項目</span>
          </button>
        </div>
      </div>

      {/* Main Split Workspace: Left 5 Cols Gallery List + Right 7 Cols Live Editor */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* LEFT COLUMN (5 Cols): Gallery Search, Category Filter & Thumbnail Cards */}
        <div className="lg:col-span-5 bg-white border border-slate-200 rounded-2xl p-5 space-y-4 shadow-2xs">
          <div className="relative w-full">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="搜尋工程圖庫名稱、圖片說明或製程分類..."
              className="w-full pl-10 pr-4 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-800 placeholder:text-slate-400 focus:outline-none focus:bg-white focus:border-blue-600"
            />
          </div>

          {/* Category Filter */}
          <div className="flex flex-wrap items-center gap-1.5 p-1.5 bg-slate-100 rounded-lg">
            <button
              type="button"
              onClick={() => setSelectedCategory('ALL')}
              className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 tabular-nums ${
                selectedCategory === 'ALL'
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              全部 ({drawings.length})
            </button>
            {DFM_CATEGORIES.map((cat) => {
              const count = drawings.filter((d) => d.category === cat).length;
              if (count === 0 && selectedCategory !== cat) return null;
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 tabular-nums ${
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

          {/* Drawing Cards List */}
          <div className="space-y-3 max-h-[680px] overflow-y-auto pr-1">
            {filteredDrawings.length === 0 ? (
              <div className="py-12 text-center text-xs text-slate-500 space-y-2">
                <p>找不到符合條件的工程圖面</p>
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    setSelectedCategory('ALL');
                  }}
                  className="px-3 py-1.5 text-xs font-semibold text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100"
                >
                  顯示全部圖面
                </button>
              </div>
            ) : (
              filteredDrawings.map((item) => {
                const isSelected = activeDrawing?.id === item.id;
                return (
                  <div
                    key={item.id}
                    onClick={() => setSelectedDrawingId(item.id)}
                    className={`p-3.5 rounded-xl border transition-all cursor-pointer flex gap-3.5 items-start ${
                      isSelected
                        ? 'bg-blue-50/50 border-blue-600 ring-2 ring-blue-100'
                        : 'bg-white border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    {/* Thumbnail */}
                    <div className="w-28 aspect-16/10 bg-slate-950 rounded-lg overflow-hidden border border-slate-200 shrink-0 flex items-center justify-center relative">
                      {item.url ? (
                        <img
                          src={item.url}
                          alt={item.name}
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-contain"
                        />
                      ) : (
                        <ImageIcon className="w-5 h-5 text-slate-600" />
                      )}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-[11px] font-semibold text-blue-700">
                          {item.category}
                        </span>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={(e) => handleDuplicateDrawing(item, e)}
                            title="複製此圖面"
                            className="p-1 text-slate-400 hover:text-blue-600 rounded hover:bg-slate-100"
                          >
                            <DuplicateIcon className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => handleDeleteDrawing(item.id, e)}
                            title="刪除此圖面"
                            className="p-1 text-slate-400 hover:text-red-600 rounded hover:bg-slate-100"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      <h3 className="text-xs font-bold text-slate-900 truncate">
                        {item.name}
                      </h3>

                      <p className="text-[11px] text-slate-600 line-clamp-2 leading-relaxed">
                        {item.description || '尚未填寫圖片說明'}
                      </p>

                      <div className="pt-1 flex items-center justify-between gap-2">
                        <span className="text-[10px] font-mono text-slate-400 tabular-nums">
                          更新於 {item.updatedAt}
                        </span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onApplyToCurrentCase(item);
                          }}
                          className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-semibold text-blue-700 bg-blue-100/80 hover:bg-blue-200/80 rounded transition-colors"
                        >
                          <span>套用至目前案例</span>
                          <ArrowUpRight className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* RIGHT COLUMN (7 Cols): Selected Drawing Editor (Upload/Edit Image, Edit Description, Annotate, Save/Undo/Redo) */}
        {activeDrawing ? (
          <div className="lg:col-span-7 bg-white border border-slate-200 rounded-2xl p-6 space-y-5 shadow-2xs">
            <div className="border-b border-slate-200 pb-3.5 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-bold text-slate-900">
                  編輯工程圖面與圖片說明
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  可上傳更換圖片、編寫詳細圖片說明、在畫面點擊標註不良紅點，並隨時復原、重做或儲存。
                </p>
              </div>

              <button
                type="button"
                onClick={() => onApplyToCurrentCase(activeDrawing)}
                className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors whitespace-nowrap shrink-0 shadow-2xs"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>套用此圖面與說明至目前 DFM 案例</span>
              </button>
            </div>

            {/* Name & Category Fields */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  圖片名稱 / 圖面標題 (Drawing Title)
                </label>
                <input
                  type="text"
                  value={activeDrawing.name}
                  onChange={(e) =>
                    updateActiveDrawing({ name: e.target.value })
                  }
                  placeholder="例如：併板 V-Cut 板邊間距不足實測圖"
                  className="w-full px-3 py-2 text-xs sm:text-sm font-medium bg-white border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:border-blue-600"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  所屬製程分類 (Category)
                </label>
                <select
                  value={activeDrawing.category}
                  onChange={(e) =>
                    updateActiveDrawing({
                      category: e.target.value as DfmCategory,
                    })
                  }
                  className="w-full px-3 py-2 text-xs sm:text-sm bg-white border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:border-blue-600"
                >
                  {DFM_CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Upload or URL Replacement Bar */}
            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-bold text-slate-800">
                  更換或上傳圖片檔案
                </span>
                <div className="flex items-center gap-1 p-1 bg-slate-200/75 rounded-lg">
                  <button
                    type="button"
                    onClick={() => setInputMode('upload')}
                    className={`flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                      inputMode === 'upload'
                        ? 'bg-white text-slate-900 shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <Upload className="w-3.5 h-3.5" />
                    本機上傳圖片
                  </button>
                  <button
                    type="button"
                    onClick={() => setInputMode('url')}
                    className={`flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                      inputMode === 'url'
                        ? 'bg-white text-slate-900 shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <LinkIcon className="w-3.5 h-3.5" />
                    貼上圖片網址
                  </button>
                </div>
              </div>

              {inputMode === 'upload' ? (
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <span className="text-xs text-slate-600">
                    支援 JPG / PNG / SVG / WebP 工程截圖，上傳後自動最佳化儲存並支援 Excel 內嵌匯出
                  </span>
                  <input
                    ref={replaceFileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) processImageFile(file, 'replace');
                      e.target.value = '';
                    }}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => replaceFileInputRef.current?.click()}
                    className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors whitespace-nowrap shrink-0"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    選擇本機圖片覆蓋此圖面
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <input
                    type="url"
                    value={
                      activeDrawing.url.startsWith('data:')
                        ? ''
                        : activeDrawing.url
                    }
                    onChange={(e) =>
                      updateActiveDrawing({ url: e.target.value })
                    }
                    placeholder={
                      activeDrawing.url.startsWith('data:')
                        ? '目前使用上傳/內嵌影像 — 可在此貼上 https:// 圖片網址覆蓋...'
                        : '請貼上圖片網址 (https://...)'
                    }
                    className="w-full px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg text-slate-800 focus:outline-none focus:border-blue-600"
                  />
                </div>
              )}
            </div>

            {/* Interactive Image Preview & Annotation Canvas */}
            <div className="border border-slate-200 rounded-xl overflow-hidden bg-slate-950">
              <div className="px-3.5 py-2 bg-slate-900 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-300">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setAnnotateMode((prev) => !prev)}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                      annotateMode
                        ? 'bg-red-600 text-white'
                        : 'bg-slate-800 text-slate-200 hover:bg-slate-700'
                    }`}
                  >
                    <Crosshair className="w-3.5 h-3.5" />
                    {annotateMode
                      ? '點擊下方圖片新增紅點標註中 (點擊完成)'
                      : '在圖片上新增紅點標註'}
                  </button>
                  {annotateMode && (
                    <input
                      type="text"
                      value={newPinLabel}
                      onChange={(e) => setNewPinLabel(e.target.value)}
                      placeholder="輸入紅點標註文字..."
                      className="px-2.5 py-1 text-xs bg-slate-950 border border-slate-700 rounded text-white focus:outline-none focus:border-red-400 w-44"
                    />
                  )}
                </div>

                <div className="flex items-center gap-3">
                  {(activeDrawing.annotations || []).length > 0 && (
                    <button
                      type="button"
                      onClick={() => updateActiveDrawing({ annotations: [] })}
                      className="text-xs text-slate-400 hover:text-red-400 transition-colors"
                    >
                      清除全部標註 ({(activeDrawing.annotations || []).length})
                    </button>
                  )}
                  {activeDrawing.url && (
                    <button
                      type="button"
                      onClick={() => setIsZoomed(true)}
                      className="flex items-center gap-1 text-xs text-slate-300 hover:text-white transition-colors"
                    >
                      <Maximize2 className="w-3.5 h-3.5" />
                      全螢幕放大
                    </button>
                  )}
                </div>
              </div>

              <div
                ref={imageContainerRef}
                onClick={handleCanvasClick}
                className={`relative w-full min-h-[300px] sm:min-h-[340px] flex items-center justify-center overflow-hidden select-none ${
                  annotateMode ? 'cursor-crosshair' : 'cursor-default'
                }`}
              >
                {activeDrawing.url ? (
                  <>
                    <img
                      src={activeDrawing.url}
                      alt={activeDrawing.name}
                      referrerPolicy="no-referrer"
                      className="w-full h-full max-h-[380px] object-contain"
                    />
                    {(activeDrawing.annotations || []).map((pin, idx) => (
                      <div
                        key={pin.id}
                        style={{ left: `${pin.x}%`, top: `${pin.y}%` }}
                        className="absolute -translate-x-1/2 -translate-y-1/2 flex items-center gap-1.5 z-10"
                      >
                        <span className="w-6 h-6 rounded-full bg-red-600 border-2 border-white text-white font-mono text-xs font-bold flex items-center justify-center shadow-md tabular-nums">
                          {idx + 1}
                        </span>
                        <div className="flex items-center gap-1 px-2 py-0.5 bg-slate-950/90 border border-red-500/80 text-white text-xs rounded shadow-md whitespace-nowrap">
                          <span>{pin.label}</span>
                          <button
                            type="button"
                            onClick={(e) => handleRemovePin(pin.id, e)}
                            title="刪除此標註"
                            className="text-slate-400 hover:text-red-400 ml-1"
                          >
                            ×
                          </button>
                        </div>
                      </div>
                    ))}
                  </>
                ) : (
                  <div className="text-xs text-slate-400 py-16">
                    尚未上傳圖片，請點擊上方「本機上傳圖片」
                  </div>
                )}
              </div>
            </div>

            {/* Image Description / Caption Editor */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-bold text-slate-800">
                  圖片說明 (Image Description / Caption)
                </label>
                <span className="text-[11px] text-slate-500">
                  套用至 DFM 案例時會同步帶入圖說，並支援 Undo / Redo 與儲存
                </span>
              </div>
              <textarea
                rows={3}
                value={activeDrawing.description || ''}
                onChange={(e) =>
                  updateActiveDrawing({ description: e.target.value })
                }
                placeholder="請編寫此圖片的詳細說明（例如：圖示 C102 距離底部 V-Cut 板邊僅 0.28mm，侵入紅色禁佈區）..."
                className="w-full p-3 text-xs sm:text-sm leading-relaxed bg-white border border-slate-200 rounded-lg text-slate-800 focus:outline-none focus:border-blue-600"
              />
            </div>

            {/* Bottom Save / Undo / Redo Bar inside Editor */}
            <div className="pt-3 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleUndo}
                  disabled={!canUndo}
                  className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200 disabled:opacity-40 disabled:pointer-events-none transition-colors"
                >
                  <Undo2 className="w-3.5 h-3.5" />
                  復原 (Undo)
                </button>
                <button
                  type="button"
                  onClick={handleRedo}
                  disabled={!canRedo}
                  className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200 disabled:opacity-40 disabled:pointer-events-none transition-colors"
                >
                  <Redo2 className="w-3.5 h-3.5" />
                  重做 (Redo)
                </button>
              </div>

              <button
                type="button"
                onClick={handleSaveGallery}
                className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition-colors shadow-2xs"
              >
                <Save className="w-3.5 h-3.5" />
                儲存圖片與說明變更
              </button>
            </div>
          </div>
        ) : null}
      </div>

      {/* Fullscreen Lightbox */}
      {isZoomed && activeDrawing?.url && (
        <div
          onClick={() => setIsZoomed(false)}
          className="fixed inset-0 z-50 bg-slate-950/90 flex items-center justify-center p-4 sm:p-8"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative max-w-5xl w-full bg-slate-900 border border-slate-700 rounded-2xl overflow-hidden shadow-2xl"
          >
            <div className="px-5 py-3 bg-slate-800 border-b border-slate-700 flex items-center justify-between text-white">
              <span className="text-sm font-bold truncate">
                {activeDrawing.name}
              </span>
              <button
                type="button"
                onClick={() => setIsZoomed(false)}
                className="p-1 text-slate-300 hover:text-white rounded-lg hover:bg-slate-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="relative w-full aspect-16/9 bg-slate-950 flex items-center justify-center">
              <img
                src={activeDrawing.url}
                alt={activeDrawing.name}
                referrerPolicy="no-referrer"
                className="w-full h-full object-contain"
              />
            </div>
            {activeDrawing.description && (
              <div className="px-5 py-3 bg-slate-900 border-t border-slate-800 text-xs sm:text-sm text-slate-300 text-center">
                {activeDrawing.description}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
