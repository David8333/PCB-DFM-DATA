import React, { useState } from 'react';
import {
  Copy,
  Check,
  FilePlus2,
  Trash2,
  FileSpreadsheet,
  AlertTriangle,
  MousePointerClick,
  Maximize2,
  X,
} from 'lucide-react';
import { DfmTemplate, CompiledReportItem } from '../types/dfm';
import {
  compileTemplateText,
  parseTemplateSegments,
} from '../utils/templateParser';
import { exportBatchToExcel } from '../utils/excelExporter';

interface ReportPreviewPanelProps {
  template: DfmTemplate;
  variableValues: Record<string, string>;
  reportBatch: CompiledReportItem[];
  activeVariable?: string | null;
  onClickVariable?: (varName: string) => void;
  onAddToBatch: () => void;
  onRemoveFromBatch: (id: string) => void;
  onClearBatch: () => void;
}

export const ReportPreviewPanel: React.FC<ReportPreviewPanelProps> = ({
  template,
  variableValues,
  reportBatch,
  activeVariable,
  onClickVariable,
  onAddToBatch,
  onRemoveFromBatch,
  onClearBatch,
}) => {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'single' | 'batch'>('single');
  const [isImageZoomed, setIsImageZoomed] = useState(false);

  const compiledIssue = compileTemplateText(
    template.issueTemplate,
    variableValues
  );
  const compiledRecommendation = compileTemplateText(
    template.recommendationTemplate,
    variableValues
  );

  const issueSegments = parseTemplateSegments(
    template.issueTemplate,
    variableValues
  );
  const recommendationSegments = parseTemplateSegments(
    template.recommendationTemplate,
    variableValues
  );

  const triggerCopy = async (key: string, content: string) => {
    try {
      await navigator.clipboard.writeText(content);
      setCopiedKey(key);
      setTimeout(() => {
        setCopiedKey((prev) => (prev === key ? null : prev));
      }, 1800);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = content;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopiedKey(key);
      setTimeout(() => {
        setCopiedKey((prev) => (prev === key ? null : prev));
      }, 1800);
    }
  };

  return (
    <div className="bg-white border border-slate-200/90 rounded-2xl shadow-2xs overflow-hidden flex flex-col w-full">
      {/* Top Preview Switcher & Action Bar */}
      <div className="px-5 py-3.5 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 bg-slate-50/80">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1 p-1 bg-slate-200/75 rounded-lg">
            <button
              type="button"
              onClick={() => setActiveTab('single')}
              className={`px-3.5 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 ${
                activeTab === 'single'
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              DFM案例預覽
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('batch')}
              className={`px-3.5 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 tabular-nums ${
                activeTab === 'batch'
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              報告彙整清單 ({reportBatch.length})
            </button>
          </div>

          <div className="hidden md:flex items-center gap-2 text-xs text-slate-600">
            <span className="font-bold text-slate-900">{template.title}</span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onAddToBatch}
            className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-blue-700 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors whitespace-nowrap shrink-0"
          >
            <FilePlus2 className="w-3.5 h-3.5" />
            加入報告清單
          </button>

          {reportBatch.length > 0 && (
            <button
              type="button"
              onClick={() => exportBatchToExcel(reportBatch)}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition-colors whitespace-nowrap shrink-0 shadow-2xs"
            >
              <FileSpreadsheet className="w-4 h-4" />
              匯出 Excel 報表 ({reportBatch.length} 筆)
            </button>
          )}
        </div>
      </div>

      {activeTab === 'single' ? (
        <div className="p-5 sm:p-6 space-y-5">
          {/* =================================================================
              UPPER PRIMARY TABLE:
              - Left (3 cols): DFM 問題點
              - Center (6 cols — 1.5x Larger!): 圖片 / 不良畫面 (Image)
              - Right (3 cols): DFM 修改建議
          ================================================================= */}
          <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-2xs">
            {/* Desktop Table Header */}
            <div className="hidden lg:grid lg:grid-cols-12 bg-slate-900 text-white text-xs sm:text-sm font-semibold divide-x divide-slate-700/80">
              <div className="lg:col-span-3 px-4 py-3 flex items-center justify-between">
                <span>DFM 問題點 (Issue)</span>
                <button
                  type="button"
                  onClick={() => triggerCopy('issue', compiledIssue)}
                  className="text-xs font-normal text-blue-300 hover:text-white flex items-center gap-1 transition-colors"
                >
                  {copiedKey === 'issue' ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                      已複製
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      複製
                    </>
                  )}
                </button>
              </div>

              <div className="lg:col-span-6 px-5 py-3 flex items-center justify-between">
                <span>圖片 / 不良畫面 (Image)</span>
                {template.imageUrl && (
                  <button
                    type="button"
                    onClick={() => setIsImageZoomed(true)}
                    className="text-xs font-normal text-slate-300 hover:text-white flex items-center gap-1 transition-colors"
                  >
                    <Maximize2 className="w-3.5 h-3.5" />
                    點擊全螢幕放大
                  </button>
                )}
              </div>

              <div className="lg:col-span-3 px-4 py-3 flex items-center justify-between">
                <span>DFM 修改建議 (Action)</span>
                <button
                  type="button"
                  onClick={() => triggerCopy('rec', compiledRecommendation)}
                  className="text-xs font-normal text-emerald-300 hover:text-white flex items-center gap-1 transition-colors"
                >
                  {copiedKey === 'rec' ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                      已複製
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      複製
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Primary 3-Column Body Row (3 cols + 6 cols Large Image + 3 cols) */}
            <div className="grid grid-cols-1 lg:grid-cols-12 divide-y lg:divide-y-0 lg:divide-x divide-slate-200 items-stretch min-h-[380px]">
              {/* Column 1 (3 cols): DFM 問題點 */}
              <div className="lg:col-span-3 p-5 bg-white flex flex-col justify-between">
                <div className="space-y-3">
                  <div className="flex items-center justify-between lg:hidden pb-2 border-b border-slate-100">
                    <span className="text-xs font-bold text-slate-900">
                      DFM 問題點 (Issue Description)
                    </span>
                    <button
                      type="button"
                      onClick={() => triggerCopy('issue', compiledIssue)}
                      className="text-xs text-blue-600 font-medium"
                    >
                      {copiedKey === 'issue' ? '已複製' : '複製問題點'}
                    </button>
                  </div>

                  <p className="text-sm sm:text-[15px] text-slate-800 leading-7 break-words">
                    {issueSegments.map((seg, i) => {
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
                            seg.varName && onClickVariable?.(seg.varName)
                          }
                          title={`點選連動編輯變數：[${seg.varName}]`}
                          className={`inline font-mono font-semibold mx-0.5 px-1 py-0.5 rounded transition-colors cursor-pointer tabular-nums ${
                            isActive
                              ? 'bg-blue-600 text-white ring-2 ring-blue-300 shadow-2xs'
                              : seg.filled
                              ? 'text-blue-700 bg-blue-50/80 hover:bg-blue-100 underline decoration-blue-400 decoration-2 underline-offset-4'
                              : 'text-amber-700 bg-amber-50 hover:bg-amber-100 underline decoration-amber-400 decoration-dashed decoration-2 underline-offset-4'
                          }`}
                        >
                          {seg.text}
                        </button>
                      );
                    })}
                  </p>
                </div>

                <div className="pt-4 mt-4 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400">
                  <span className="flex items-center gap-1">
                    <MousePointerClick className="w-3.5 h-3.5 text-blue-500" />
                    點選藍字變數可跳轉下方編輯欄
                  </span>
                </div>
              </div>

              {/* Column 2 (6 cols — 1.5x Larger Center Visual Viewport!): 圖片 */}
              <div className="lg:col-span-6 p-3 sm:p-4 bg-slate-950 flex flex-col justify-between">
                <div className="flex items-center justify-between lg:hidden pb-2 text-white">
                  <span className="text-xs font-bold">
                    圖片 / 不良畫面 (Image)
                  </span>
                  {template.imageUrl && (
                    <button
                      type="button"
                      onClick={() => setIsImageZoomed(true)}
                      className="text-xs text-slate-300 flex items-center gap-1"
                    >
                      <Maximize2 className="w-3.5 h-3.5" />
                      放大檢視
                    </button>
                  )}
                </div>

                {template.imageUrl ? (
                  <div
                    onClick={() => setIsImageZoomed(true)}
                    title="點擊可全螢幕放大檢視"
                    className="relative w-full min-h-[300px] sm:min-h-[360px] lg:min-h-[380px] flex-1 flex items-center justify-center overflow-hidden rounded-lg cursor-zoom-in"
                  >
                    <img
                      src={template.imageUrl}
                      alt={template.imageCaption || template.title}
                      referrerPolicy="no-referrer"
                      className="w-full h-full max-h-[440px] object-contain"
                    />
                    {(template.annotations || []).map((pin, idx) => (
                      <div
                        key={pin.id}
                        style={{ left: `${pin.x}%`, top: `${pin.y}%` }}
                        className="absolute -translate-x-1/2 -translate-y-1/2 flex items-center gap-1.5 pointer-events-none"
                      >
                        <span className="w-6 h-6 rounded-full bg-red-600 border-2 border-white text-white font-mono text-xs font-bold flex items-center justify-center shadow-md tabular-nums">
                          {idx + 1}
                        </span>
                        <span className="px-2 py-0.5 bg-slate-950/90 border border-red-500/80 text-white text-xs rounded shadow-md whitespace-nowrap">
                          {pin.label}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="w-full min-h-[320px] flex-1 rounded-lg border border-dashed border-slate-700 bg-slate-900 flex items-center justify-center text-xs text-slate-400">
                    尚未設定圖片
                  </div>
                )}

                {template.imageCaption && (
                  <p className="text-xs text-slate-300 text-center leading-snug pt-2.5 px-2">
                    {template.imageCaption}
                  </p>
                )}
              </div>

              {/* Column 3 (3 cols): DFM 修改建議 */}
              <div className="lg:col-span-3 p-5 bg-white flex flex-col justify-between">
                <div className="space-y-3">
                  <div className="flex items-center justify-between lg:hidden pb-2 border-b border-slate-100">
                    <span className="text-xs font-bold text-slate-900">
                      DFM 修改建議 (Recommendation)
                    </span>
                    <button
                      type="button"
                      onClick={() => triggerCopy('rec', compiledRecommendation)}
                      className="text-xs text-emerald-700 font-medium"
                    >
                      {copiedKey === 'rec' ? '已複製' : '複製建議'}
                    </button>
                  </div>

                  <p className="text-sm sm:text-[15px] text-slate-800 leading-7 break-words">
                    {recommendationSegments.map((seg, i) => {
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
                            seg.varName && onClickVariable?.(seg.varName)
                          }
                          title={`點選連動編輯變數：[${seg.varName}]`}
                          className={`inline font-mono font-semibold mx-0.5 px-1 py-0.5 rounded transition-colors cursor-pointer tabular-nums ${
                            isActive
                              ? 'bg-emerald-600 text-white ring-2 ring-emerald-300 shadow-2xs'
                              : seg.filled
                              ? 'text-emerald-700 bg-emerald-50/80 hover:bg-emerald-100 underline decoration-emerald-400 decoration-2 underline-offset-4'
                              : 'text-amber-700 bg-amber-50 hover:bg-amber-100 underline decoration-amber-400 decoration-dashed decoration-2 underline-offset-4'
                          }`}
                        >
                          {seg.text}
                        </button>
                      );
                    })}
                  </p>
                </div>

                <div className="pt-4 mt-4 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400">
                  <span className="flex items-center gap-1">
                    <MousePointerClick className="w-3.5 h-3.5 text-emerald-600" />
                    點選綠字變數可跳轉下方編輯欄
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* =================================================================
              LOWER SECONDARY TABLE: 編號 / 製程分類 / 參考機種 / 參考資料
          ================================================================= */}
          <div className="border border-slate-200 rounded-xl overflow-hidden bg-slate-50/50">
            <div className="hidden lg:grid lg:grid-cols-12 bg-slate-100 border-b border-slate-200 text-slate-700 text-xs font-semibold divide-x divide-slate-200">
              <div className="lg:col-span-2 px-4 py-2.5">項目編號 (Code)</div>
              <div className="lg:col-span-2 px-4 py-2.5">製程分類 (Category)</div>
              <div className="lg:col-span-3 px-4 py-2.5">參考機種 (Reference Model)</div>
              <div className="lg:col-span-5 px-4 py-2.5 flex items-center justify-between">
                <span>參考資料與規範 (Reference / Spec)</span>
                <button
                  type="button"
                  onClick={() => triggerCopy('spec', template.referenceSpec)}
                  className="text-[11px] font-medium text-blue-600 hover:text-blue-800 flex items-center gap-1"
                >
                  <Copy className="w-3 h-3" />
                  {copiedKey === 'spec' ? '已複製規範' : '複製規範'}
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 divide-y sm:divide-y-0 lg:divide-x divide-slate-200 text-xs bg-white">
              {/* 項目編號 */}
              <div className="lg:col-span-2 px-4 py-3.5 flex flex-col justify-center">
                <span className="lg:hidden text-[11px] text-slate-400 mb-0.5">
                  項目編號
                </span>
                <span className="font-mono font-bold text-slate-900 text-xs sm:text-sm tabular-nums">
                  {template.code}
                </span>
              </div>

              {/* 製程分類 */}
              <div className="lg:col-span-2 px-4 py-3.5 flex flex-col justify-center">
                <span className="lg:hidden text-[11px] text-slate-400 mb-0.5">
                  製程分類
                </span>
                <span className="font-semibold text-blue-700 text-xs sm:text-sm">
                  {template.category}
                </span>
              </div>

              {/* 參考機種 */}
              <div className="lg:col-span-3 px-4 py-3.5 flex flex-col justify-center">
                <span className="lg:hidden text-[11px] text-slate-400 mb-0.5">
                  參考機種
                </span>
                <span className="font-mono font-semibold text-slate-800 break-words">
                  {template.referenceModel || '未填寫參考機種'}
                </span>
              </div>

              {/* 參考資料 */}
              <div className="sm:col-span-2 lg:col-span-5 px-4 py-3.5 flex flex-col justify-center">
                <div className="flex items-center justify-between lg:hidden mb-1">
                  <span className="text-[11px] text-slate-400">
                    參考資料與規範
                  </span>
                  <button
                    type="button"
                    onClick={() => triggerCopy('spec', template.referenceSpec)}
                    className="text-[11px] text-blue-600 font-medium"
                  >
                    {copiedKey === 'spec' ? '已複製' : '複製規範'}
                  </button>
                </div>
                <p className="font-mono text-xs text-slate-600 leading-relaxed break-words">
                  {template.referenceSpec || '尚未填寫參考規範'}
                </p>
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* BATCH HORIZONTAL REPORT TABLE VIEW (報告彙整清單 — 直接匯出為格式完整的 Excel 檔案) */
        <div className="p-5 space-y-4">
          {reportBatch.length === 0 ? (
            <div className="py-12 px-4 text-center space-y-3">
              <AlertTriangle className="w-8 h-8 text-slate-400 mx-auto" />
              <div className="space-y-1">
                <p className="text-sm font-semibold text-slate-800">
                  目前報告彙整清單尚無項目
                </p>
                <p className="text-xs text-slate-500 max-w-md mx-auto">
                  在下方調整動態數值後，點擊右上角「加入報告清單」，即可在此檢視多筆總表並直接匯出成格式鎖定的 Excel 報表。
                </p>
              </div>
              <button
                type="button"
                onClick={onAddToBatch}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
              >
                <FilePlus2 className="w-4 h-4" />
                將目前項目加入報告清單
              </button>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => exportBatchToExcel(reportBatch)}
                    className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition-colors whitespace-nowrap shrink-0 shadow-2xs"
                  >
                    <FileSpreadsheet className="w-4 h-4" />
                    直接匯出成 Excel 報表 (.xls，共 {reportBatch.length} 筆)
                  </button>
                  <span className="text-xs text-slate-500">
                    自動鎖定欄寬、格線與儲存格內自動換行，開啟不跑版
                  </span>
                </div>
                <button
                  type="button"
                  onClick={onClearBatch}
                  className="text-xs text-slate-500 hover:text-red-600 transition-colors whitespace-nowrap shrink-0"
                >
                  清空清單
                </button>
              </div>

              <div className="border border-slate-200 rounded-xl overflow-x-auto">
                <table className="w-full min-w-[1060px] text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-900 text-white text-xs font-semibold divide-x divide-slate-700">
                      <th className="py-3 px-3 w-12 text-center">#</th>
                      <th className="py-3 px-3">DFM 問題點</th>
                      <th className="py-3 px-3 w-72">圖片 (Image)</th>
                      <th className="py-3 px-3">DFM 修改建議</th>
                      <th className="py-3 px-3 w-44">編號 / 製程分類 / 參考機種</th>
                      <th className="py-3 px-3 w-52">參考資料</th>
                      <th className="py-3 px-2 w-12 text-center">移除</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 text-xs">
                    {reportBatch.map((item, idx) => (
                      <tr
                        key={item.id}
                        className="divide-x divide-slate-200 hover:bg-slate-50/80 align-top"
                      >
                        <td className="py-3.5 px-3 font-mono font-bold text-slate-700 text-center tabular-nums">
                          {idx + 1}
                        </td>
                        <td className="py-3.5 px-3 text-slate-800 leading-relaxed">
                          <div className="font-bold text-slate-900 mb-1">
                            {item.title}
                          </div>
                          {item.compiledIssue}
                        </td>
                        <td className="py-3.5 px-3">
                          {item.imageUrl ? (
                            <img
                              src={item.imageUrl}
                              alt={item.title}
                              referrerPolicy="no-referrer"
                              className="w-64 sm:w-72 aspect-16/10 object-contain bg-slate-950 rounded-lg border border-slate-200"
                            />
                          ) : (
                            <span className="text-slate-400">無圖面</span>
                          )}
                        </td>
                        <td className="py-3.5 px-3 text-slate-800 leading-relaxed">
                          {item.compiledRecommendation}
                        </td>
                        <td className="py-3.5 px-3 space-y-1">
                          <div className="font-mono font-bold text-slate-900">
                            {item.code}
                          </div>
                          <div className="text-blue-700 font-medium">
                            {item.category}
                          </div>
                          <div className="text-[11px] font-mono text-slate-600 pt-1">
                            機種：{item.referenceModel || '未填寫'}
                          </div>
                        </td>
                        <td className="py-3.5 px-3 font-mono text-slate-600 leading-relaxed">
                          {item.referenceSpec || '-'}
                        </td>
                        <td className="py-3.5 px-2 text-center">
                          <button
                            type="button"
                            onClick={() => onRemoveFromBatch(item.id)}
                            className="p-1 text-slate-400 hover:text-red-600 transition-colors"
                            title="移除此筆"
                          >
                            <Trash2 className="w-4 h-4 mx-auto" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {/* Full-Screen Lightbox Modal when user clicks image to inspect details */}
      {isImageZoomed && template.imageUrl && (
        <div
          onClick={() => setIsImageZoomed(false)}
          className="fixed inset-0 z-50 bg-slate-950/90 flex items-center justify-center p-4 sm:p-8"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative max-w-5xl w-full bg-slate-900 border border-slate-700 rounded-2xl overflow-hidden shadow-2xl"
          >
            <div className="px-5 py-3 bg-slate-800 border-b border-slate-700 flex items-center justify-between text-white">
              <span className="text-sm font-bold truncate">
                {template.code} — {template.title}
              </span>
              <button
                type="button"
                onClick={() => setIsImageZoomed(false)}
                className="p-1 text-slate-300 hover:text-white rounded-lg hover:bg-slate-700 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="relative w-full aspect-16/9 bg-slate-950 flex items-center justify-center">
              <img
                src={template.imageUrl}
                alt={template.imageCaption || template.title}
                referrerPolicy="no-referrer"
                className="w-full h-full object-contain"
              />
              {(template.annotations || []).map((pin, idx) => (
                <div
                  key={pin.id}
                  style={{ left: `${pin.x}%`, top: `${pin.y}%` }}
                  className="absolute -translate-x-1/2 -translate-y-1/2 flex items-center gap-1.5 pointer-events-none"
                >
                  <span className="w-7 h-7 rounded-full bg-red-600 border-2 border-white text-white font-mono text-sm font-bold flex items-center justify-center shadow-lg tabular-nums">
                    {idx + 1}
                  </span>
                  <span className="px-2.5 py-1 bg-slate-950/90 border border-red-500 text-white text-xs sm:text-sm rounded-md shadow-lg whitespace-nowrap">
                    {pin.label}
                  </span>
                </div>
              ))}
            </div>
            {template.imageCaption && (
              <div className="px-5 py-3 bg-slate-900 border-t border-slate-800 text-xs sm:text-sm text-slate-300 text-center">
                {template.imageCaption}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
