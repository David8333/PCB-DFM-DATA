import React from 'react';
import {
  SlidersHorizontal,
  Sparkles,
  FileEdit,
  Cpu,
  Link2,
} from 'lucide-react';

interface DynamicValueQuickEditorProps {
  detectedVariables: string[];
  variableValues: Record<string, string>;
  referenceModel: string;
  activeVariable: string | null;
  onSelectVariable: (varName: string | null) => void;
  onChangeVariable: (varName: string, value: string) => void;
  onChangeReferenceModel: (val: string) => void;
  onRestoreSample: () => void;
  onClearVariables: () => void;
  onNavigateToEditor?: () => void;
  onLocateInTemplate?: (varName: string) => void;
  inputRefs?: React.MutableRefObject<Record<string, HTMLInputElement | null>>;
}

export const DynamicValueQuickEditor: React.FC<DynamicValueQuickEditorProps> = ({
  detectedVariables,
  variableValues,
  referenceModel,
  activeVariable,
  onSelectVariable,
  onChangeVariable,
  onChangeReferenceModel,
  onRestoreSample,
  onClearVariables,
  onNavigateToEditor,
  onLocateInTemplate,
  inputRefs,
}) => {
  return (
    <div className="bg-white border border-slate-200/90 rounded-2xl shadow-2xs overflow-hidden">
      <div className="px-4 py-2.5 border-b border-slate-200 bg-slate-50/80 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <SlidersHorizontal className="w-3.5 h-3.5 text-blue-600" />
          <h2 className="text-xs font-bold text-slate-800">
            動態數值快速編輯（共 {detectedVariables.length} 個變數空格）
          </h2>
          <span className="text-xs text-slate-400" aria-hidden="true">
            ·
          </span>
          <span className="text-[11px] text-slate-500 flex items-center gap-1">
            <Link2 className="w-3 h-3 text-blue-600" />
            點選報告文字或下方輸入框可雙向連動高光標示
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={onRestoreSample}
            className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium text-blue-700 bg-blue-50 rounded-md hover:bg-blue-100 transition-colors whitespace-nowrap shrink-0"
          >
            <Sparkles className="w-3 h-3" />
            載入範例值
          </button>
          <button
            type="button"
            onClick={onClearVariables}
            className="px-2.5 py-1 text-[11px] font-medium text-slate-600 bg-slate-100 rounded-md hover:bg-slate-200 transition-colors whitespace-nowrap shrink-0"
          >
            清空空格
          </button>
          {onNavigateToEditor && (
            <button
              type="button"
              onClick={onNavigateToEditor}
              className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-100 transition-colors whitespace-nowrap shrink-0"
            >
              <FileEdit className="w-3 h-3" />
              前往 DFM案例編輯頁
            </button>
          )}
        </div>
      </div>

      <div className="p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 items-end">
          {/* Compact Reference Model Field */}
          <div className="space-y-1">
            <label className="flex items-center gap-1 text-[11px] font-semibold text-slate-600">
              <Cpu className="w-3 h-3 text-blue-600 shrink-0" />
              <span>參考機種 (可自行填寫)</span>
            </label>
            <input
              type="text"
              value={referenceModel || ''}
              onFocus={() => onSelectVariable(null)}
              onChange={(e) => onChangeReferenceModel(e.target.value)}
              placeholder="輸入參考機種..."
              className="w-full px-2.5 py-1.5 text-xs font-mono bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:bg-white focus:border-blue-600"
            />
          </div>

          {/* Compact Dynamic Variable Inputs with Bidirectional Linkage */}
          {detectedVariables.map((varName, index) => {
            const val = variableValues[varName] || '';
            const isLinked = activeVariable === varName;

            return (
              <div
                key={varName}
                onClick={() => onSelectVariable(varName)}
                className={`space-y-1 p-1.5 -m-1.5 rounded-xl transition-colors ${
                  isLinked ? 'bg-blue-50/90 ring-2 ring-blue-500' : ''
                }`}
              >
                <div className="flex items-center justify-between text-[11px] font-medium text-slate-600">
                  <button
                    type="button"
                    onClick={() => {
                      onSelectVariable(varName);
                      if (onLocateInTemplate) {
                        onLocateInTemplate(varName);
                      }
                    }}
                    className={`font-mono font-semibold truncate text-left flex items-center gap-1 ${
                      isLinked ? 'text-blue-700' : 'text-slate-800 hover:text-blue-600'
                    }`}
                    title="點選可連動標示問題點與修改建議中的對應文字"
                  >
                    <span>[{varName}]</span>
                  </button>
                  <span className="text-[10px] text-slate-400 font-mono tabular-nums ml-1">
                    #{index + 1}
                  </span>
                </div>
                <input
                  ref={(el) => {
                    if (inputRefs) {
                      inputRefs.current[varName] = el;
                    }
                  }}
                  type="text"
                  value={val}
                  onFocus={() => onSelectVariable(varName)}
                  onChange={(e) => onChangeVariable(varName, e.target.value)}
                  placeholder={`填入 ${varName}...`}
                  className={`w-full px-2.5 py-1.5 text-xs font-mono rounded-lg border transition-colors focus:outline-none tabular-nums ${
                    isLinked
                      ? 'bg-white border-blue-600 text-slate-900 shadow-2xs'
                      : val.trim() !== ''
                      ? 'bg-blue-50/25 border-blue-200 text-slate-900 focus:border-blue-600 focus:bg-white'
                      : 'bg-amber-50/40 border-amber-300 text-slate-900 placeholder:text-amber-600/70 focus:border-amber-600 focus:bg-white'
                  }`}
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
