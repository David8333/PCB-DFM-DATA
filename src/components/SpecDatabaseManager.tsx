import React, { useState } from 'react';
import {
  BookOpen,
  Plus,
  Pencil,
  Trash2,
  Check,
  X,
  Save,
  ArrowDownToLine,
} from 'lucide-react';
import { ReferenceSpecItem } from '../types/dfm';

interface SpecDatabaseManagerProps {
  currentSpecText: string;
  onChangeSpecText: (newText: string) => void;
  specs: ReferenceSpecItem[];
  onAddSpec: (title: string, content: string) => void;
  onUpdateSpec: (id: string, title: string, content: string) => void;
  onDeleteSpec: (id: string) => void;
}

export const SpecDatabaseManager: React.FC<SpecDatabaseManagerProps> = ({
  currentSpecText,
  onChangeSpecText,
  specs,
  onAddSpec,
  onUpdateSpec,
  onDeleteSpec,
}) => {
  const [isManagerOpen, setIsManagerOpen] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newContent, setNewContent] = useState('');

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editContent, setEditContent] = useState('');

  const handleSaveNew = () => {
    const trimmedTitle = newTitle.trim();
    const trimmedContent = newContent.trim();
    if (!trimmedTitle || !trimmedContent) return;
    onAddSpec(trimmedTitle, trimmedContent);
    setNewTitle('');
    setNewContent('');
    setIsCreating(false);
  };

  const handleSaveCurrentAsNewSpec = () => {
    if (!currentSpecText.trim()) return;
    setIsManagerOpen(true);
    setIsCreating(true);
    setNewTitle('自訂廠內 / IPC 規範');
    setNewContent(currentSpecText.trim());
  };

  const startEditing = (spec: ReferenceSpecItem) => {
    setEditingId(spec.id);
    setEditTitle(spec.title);
    setEditContent(spec.content);
  };

  const handleSaveEdit = (id: string) => {
    if (!editTitle.trim() || !editContent.trim()) return;
    onUpdateSpec(id, editTitle.trim(), editContent.trim());
    setEditingId(null);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-800">
          <BookOpen className="w-3.5 h-3.5 text-blue-600" />
          4. 參考資料與規範 (Reference / Spec)
        </label>

        <div className="flex flex-wrap items-center gap-2">
          {currentSpecText.trim() && (
            <button
              type="button"
              onClick={handleSaveCurrentAsNewSpec}
              className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-md hover:bg-emerald-100 transition-colors whitespace-nowrap shrink-0"
            >
              <Save className="w-3.5 h-3.5" />
              將目前文字存入規範庫
            </button>
          )}
          <button
            type="button"
            onClick={() => setIsManagerOpen(!isManagerOpen)}
            className="px-2.5 py-1 text-xs font-medium text-slate-700 bg-slate-100 rounded-md hover:bg-slate-200 transition-colors whitespace-nowrap shrink-0"
          >
            {isManagerOpen ? '收合規範資料庫' : `展開規範資料庫 (${specs.length} 筆)`}
          </button>
        </div>
      </div>

      {/* Current Active Template Reference Spec Textarea */}
      <textarea
        rows={2}
        value={currentSpecText}
        onChange={(e) => onChangeSpecText(e.target.value)}
        placeholder="請輸入本項目的參考規範（如 IPC 標準、安規或廠內製程規範），或由下方規範資料庫點選帶入..."
        className="w-full p-3 text-xs font-mono leading-relaxed bg-white border border-slate-200 rounded-lg text-slate-800 focus:outline-none focus:border-blue-600"
      />

      {/* Editable Reference Spec Database Panel */}
      {isManagerOpen && (
        <div className="border border-slate-200 rounded-lg bg-slate-50/70 overflow-hidden">
          <div className="px-3.5 py-2.5 bg-slate-100/80 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs">
              <span className="font-semibold text-slate-800">
                常用規範資料庫管理（支援新增 / 儲存 / 修改 / 刪除）
              </span>
              <span className="text-slate-400" aria-hidden="true">
                ·
              </span>
              <span className="text-slate-500 font-mono tabular-nums">
                共 {specs.length} 筆規範
              </span>
            </div>

            {!isCreating && (
              <button
                type="button"
                onClick={() => {
                  setIsCreating(true);
                  setNewTitle('');
                  setNewContent('');
                }}
                className="flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors whitespace-nowrap shrink-0"
              >
                <Plus className="w-3.5 h-3.5" />
                新增常用規範
              </button>
            )}
          </div>

          {/* Add New Spec Form */}
          {isCreating && (
            <div className="p-3.5 bg-blue-50/50 border-b border-blue-200 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-blue-950">
                  新增常用規範至資料庫
                </span>
                <button
                  type="button"
                  onClick={() => setIsCreating(false)}
                  className="text-xs text-slate-500 hover:text-slate-800"
                >
                  取消
                </button>
              </div>
              <input
                type="text"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="規範簡稱 / 標題（例如：IPC-A-610H 波峰焊錫橋接規範）"
                className="w-full px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-md text-slate-900 focus:outline-none focus:border-blue-600"
              />
              <textarea
                rows={2}
                value={newContent}
                onChange={(e) => setNewContent(e.target.value)}
                placeholder="輸入完整規範說明與標準數值（例如：DIP 插件腳長突出板底需控制在 1.2mm~2.0mm...）"
                className="w-full p-2.5 text-xs font-mono bg-white border border-slate-300 rounded-md text-slate-900 focus:outline-none focus:border-blue-600"
              />
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsCreating(false)}
                  className="px-3 py-1.5 text-xs font-medium text-slate-600 bg-white border border-slate-200 rounded-md hover:bg-slate-100"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={handleSaveNew}
                  disabled={!newTitle.trim() || !newContent.trim()}
                  className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  <Check className="w-3.5 h-3.5" />
                  儲存規範
                </button>
              </div>
            </div>
          )}

          {/* Spec List */}
          <div className="divide-y divide-slate-200 max-h-64 overflow-y-auto">
            {specs.length === 0 ? (
              <div className="p-4 text-center text-xs text-slate-500">
                目前尚無儲存的常用規範，請點擊右上角「新增常用規範」建立。
              </div>
            ) : (
              specs.map((spec) => {
                const isEditing = editingId === spec.id;

                return (
                  <div
                    key={spec.id}
                    className="p-3 bg-white hover:bg-slate-50/80 transition-colors"
                  >
                    {isEditing ? (
                      <div className="space-y-2">
                        <input
                          type="text"
                          value={editTitle}
                          onChange={(e) => setEditTitle(e.target.value)}
                          className="w-full px-2.5 py-1.5 text-xs font-semibold bg-white border border-blue-400 rounded text-slate-900 focus:outline-none"
                        />
                        <textarea
                          rows={2}
                          value={editContent}
                          onChange={(e) => setEditContent(e.target.value)}
                          className="w-full p-2 text-xs font-mono bg-white border border-blue-400 rounded text-slate-900 focus:outline-none"
                        />
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => setEditingId(null)}
                            className="flex items-center gap-1 px-2.5 py-1 text-xs text-slate-600 bg-slate-100 rounded hover:bg-slate-200"
                          >
                            <X className="w-3.5 h-3.5" />
                            取消
                          </button>
                          <button
                            type="button"
                            onClick={() => handleSaveEdit(spec.id)}
                            className="flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-white bg-blue-600 rounded hover:bg-blue-700"
                          >
                            <Check className="w-3.5 h-3.5" />
                            儲存修改
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-1.5">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="text-xs font-bold text-slate-800">
                            {spec.title}
                          </span>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              type="button"
                              onClick={() => onChangeSpecText(spec.content)}
                              className="flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium text-blue-700 bg-blue-50 rounded hover:bg-blue-100 transition-colors whitespace-nowrap"
                              title="覆蓋帶入此規範"
                            >
                              <ArrowDownToLine className="w-3 h-3" />
                              套用
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                onChangeSpecText(
                                  currentSpecText
                                    ? `${currentSpecText}\n${spec.content}`
                                    : spec.content
                                )
                              }
                              className="px-2 py-0.5 text-[11px] font-medium text-slate-600 bg-slate-100 rounded hover:bg-slate-200 transition-colors whitespace-nowrap"
                              title="附加在目前規範文字後方"
                            >
                              + 附加
                            </button>
                            <button
                              type="button"
                              onClick={() => startEditing(spec)}
                              className="p-1 text-slate-400 hover:text-blue-600 rounded transition-colors"
                              title="修改此規範"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => onDeleteSpec(spec.id)}
                              className="p-1 text-slate-400 hover:text-red-600 rounded transition-colors"
                              title="刪除此規範"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                        <p className="text-xs text-slate-600 font-mono leading-relaxed break-words">
                          {spec.content}
                        </p>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};
