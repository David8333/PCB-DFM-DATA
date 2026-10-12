import React, { useState, useRef } from 'react';
import {
  Image as ImageIcon,
  Upload,
  Link as LinkIcon,
  Crosshair,
  Trash2,
  Layers,
  AlertCircle,
  ArrowUpRight,
  CheckCircle2,
} from 'lucide-react';
import { ImageAnnotation, DfmDrawingItem } from '../types/dfm';
import { PRESET_CAD_DIAGRAMS } from '../data/defaultTemplates';
import {
  processUploadedImageFile,
  estimateDataUrlBytes,
} from '../utils/imageProcessor';
import { formatBytes } from '../utils/storageManager';

interface ImageInspectorProps {
  imageUrl: string;
  imageCaption: string;
  annotations: ImageAnnotation[];
  drawings?: DfmDrawingItem[];
  onChangeImage: (url: string) => void;
  onChangeCaption: (caption: string) => void;
  onChangeAnnotations: (annotations: ImageAnnotation[]) => void;
  onApplyDrawing?: (drawing: DfmDrawingItem) => void;
  onOpenDrawingGallery?: () => void;
}

export const ImageInspector: React.FC<ImageInspectorProps> = ({
  imageUrl,
  imageCaption,
  annotations,
  drawings = PRESET_CAD_DIAGRAMS,
  onChangeImage,
  onChangeCaption,
  onChangeAnnotations,
  onApplyDrawing,
  onOpenDrawingGallery,
}) => {
  const [inputMode, setInputMode] = useState<'url' | 'upload' | 'preset'>('url');
  const [annotateMode, setAnnotateMode] = useState(false);
  const [newPinLabel, setNewPinLabel] = useState('間距不良點');
  const [imgError, setImgError] = useState(false);
  const [isProcessingUpload, setIsProcessingUpload] = useState(false);
  const [compressionSummary, setCompressionSummary] = useState<string | null>(
    null
  );
  const [uploadError, setUploadError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageContainerRef = useRef<HTMLDivElement>(null);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsProcessingUpload(true);
    setUploadError(null);

    try {
      const result = await processUploadedImageFile(file, {
        maxWidth: 960,
        maxHeight: 960,
        quality: 0.84,
      });

      if (!result.ok) {
        setUploadError(result.error || '圖片處理失敗');
      } else {
        setImgError(false);
        setCompressionSummary(result.summaryText);
        onChangeImage(result.dataUrl);
      }
    } catch {
      setUploadError('圖片讀取或編碼過程發生未預期錯誤，請嘗試其他圖片。');
    } finally {
      setIsProcessingUpload(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleImageClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!annotateMode || !imageContainerRef.current) return;
    const rect = imageContainerRef.current.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const x = Math.round(((e.clientX - rect.left) / rect.width) * 100);
    const y = Math.round(((e.clientY - rect.top) / rect.height) * 100);

    const nextPin: ImageAnnotation = {
      id: `pin-${Date.now()}`,
      x: Math.max(4, Math.min(96, x)),
      y: Math.max(6, Math.min(94, y)),
      label: newPinLabel.trim() || `異常點 #${annotations.length + 1}`,
    };
    onChangeAnnotations([...annotations, nextPin]);
  };

  const removeAnnotation = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    onChangeAnnotations(annotations.filter((a) => a.id !== id));
  };

  const currentImageEstimatedBytes = imageUrl.startsWith('data:')
    ? estimateDataUrlBytes(imageUrl)
    : 0;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-slate-800">
            不良畫面 / CAD 圖面 (Image)
          </span>
          <span className="text-xs text-slate-400" aria-hidden="true">
            ·
          </span>
          <span className="text-xs text-slate-500">
            支援圖片網址、本機上傳與 DFM工程圖庫
          </span>
          {currentImageEstimatedBytes > 0 && (
            <>
              <span className="text-xs text-slate-400" aria-hidden="true">
                ·
              </span>
              <span className="text-[11px] font-mono text-slate-500 tabular-nums">
                目前圖檔約 {formatBytes(currentImageEstimatedBytes)}
              </span>
            </>
          )}
        </div>

        {/* Interactive Mode Switcher */}
        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
          <button
            type="button"
            onClick={() => setInputMode('url')}
            className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
              inputMode === 'url'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <LinkIcon className="w-3.5 h-3.5" />
            圖片網址
          </button>
          <button
            type="button"
            onClick={() => setInputMode('upload')}
            className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
              inputMode === 'upload'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Upload className="w-3.5 h-3.5" />
            上傳檔案
          </button>
          <button
            type="button"
            onClick={() => setInputMode('preset')}
            className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
              inputMode === 'preset'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            DFM工程圖庫 ({drawings.length})
          </button>
        </div>
      </div>

      {/* Mode Input Area */}
      {inputMode === 'url' && (
        <div className="flex items-center gap-2">
          <input
            type="url"
            value={imageUrl.startsWith('data:') ? '' : imageUrl}
            onChange={(e) => {
              const val = e.target.value;
              setImgError(false);
              setCompressionSummary(null);
              // Do not overwrite existing Base64 image if the user just focused/cleared an already-empty URL box
              if (imageUrl.startsWith('data:') && val.trim() === '') {
                return;
              }
              onChangeImage(val);
            }}
            placeholder={
              imageUrl.startsWith('data:')
                ? '目前已載入內嵌/上傳影像（受保護未刪除）— 若需改用外部圖片請直接貼上 https:// 網址...'
                : '貼上圖片網址 (https://...) 或圖床連結'
            }
            className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-lg text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-blue-600"
          />
          {imageUrl && (
            <button
              type="button"
              onClick={() => {
                setCompressionSummary(null);
                onChangeImage('');
              }}
              className="px-3 py-2 text-xs font-medium text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors whitespace-nowrap shrink-0"
            >
              清除圖片
            </button>
          )}
        </div>
      )}

      {inputMode === 'upload' && (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-slate-50 border border-dashed border-slate-300 rounded-lg">
            <div className="text-xs text-slate-600">
              選擇 PCB Gerber 截圖、AOI 不良照片或 SVG/PNG 圖面（自動保留原始寬高比與透明背景）
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileUpload}
              className="hidden"
            />
            <button
              type="button"
              disabled={isProcessingUpload}
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0"
            >
              <Upload className="w-3.5 h-3.5" />
              {isProcessingUpload ? '圖片處理中...' : '選擇本機圖片上傳'}
            </button>
          </div>

          {compressionSummary && (
            <div className="px-3 py-2 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center justify-between gap-2 text-xs text-emerald-900">
              <span className="flex items-center gap-1.5 font-mono">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                {compressionSummary}
              </span>
              <button
                type="button"
                onClick={() => setCompressionSummary(null)}
                className="text-[11px] text-emerald-700 hover:underline shrink-0"
              >
                隱藏
              </button>
            </div>
          )}

          {uploadError && (
            <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-xs text-red-800">
              <AlertCircle className="w-3.5 h-3.5 text-red-600 shrink-0" />
              <span>{uploadError}</span>
            </div>
          )}
        </div>
      )}

      {inputMode === 'preset' && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>點選下方圖庫項目即可套用圖片與說明：</span>
            {onOpenDrawingGallery && (
              <button
                type="button"
                onClick={onOpenDrawingGallery}
                className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-800"
              >
                <span>前往「DFM工程圖庫」分頁管理與上傳</span>
                <ArrowUpRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto pr-1">
            {drawings.map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => {
                  setImgError(false);
                  setCompressionSummary(null);
                  if (onApplyDrawing) {
                    onApplyDrawing(preset);
                  } else {
                    onChangeImage(preset.url);
                    if (preset.description) {
                      onChangeCaption(preset.description);
                    }
                  }
                }}
                className={`flex items-center justify-between px-3 py-2 text-xs text-left rounded-lg border transition-colors ${
                  imageUrl === preset.url
                    ? 'border-blue-600 bg-blue-50/60 text-blue-900 font-medium'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                <span className="truncate">{preset.name}</span>
                <span className="text-[11px] text-blue-600 ml-2 shrink-0">套用</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Image Viewport & Interactive Defect Callout Pinning */}
      <div className="border border-slate-200 rounded-lg overflow-hidden bg-slate-900">
        <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 bg-slate-800 border-b border-slate-700 text-xs text-slate-300">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setAnnotateMode(!annotateMode)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                annotateMode
                  ? 'bg-red-600 text-white'
                  : 'bg-slate-700 text-slate-200 hover:bg-slate-600'
              }`}
            >
              <Crosshair className="w-3.5 h-3.5" />
              {annotateMode ? '點擊畫面新增紅點標註中 (完成請點擊)' : '在圖片上標註問題點'}
            </button>
            {annotateMode && (
              <input
                type="text"
                value={newPinLabel}
                onChange={(e) => setNewPinLabel(e.target.value)}
                placeholder="輸入標註文字..."
                className="px-2 py-1 text-xs bg-slate-900 border border-slate-600 rounded text-white focus:outline-none focus:border-red-400 w-40"
              />
            )}
          </div>
          {annotations.length > 0 && (
            <button
              type="button"
              onClick={() => onChangeAnnotations([])}
              className="flex items-center gap-1 text-xs text-slate-400 hover:text-red-400 transition-colors whitespace-nowrap shrink-0"
            >
              <Trash2 className="w-3.5 h-3.5" />
              清除標註 ({annotations.length})
            </button>
          )}
        </div>

        <div
          ref={imageContainerRef}
          onClick={handleImageClick}
          className={`relative w-full aspect-16/9 flex items-center justify-center overflow-hidden select-none ${
            annotateMode ? 'cursor-crosshair' : 'cursor-default'
          }`}
        >
          {imageUrl && !imgError ? (
            <>
              <img
                src={imageUrl}
                alt={imageCaption || 'DFM Issue Visual'}
                referrerPolicy="no-referrer"
                onError={() => setImgError(true)}
                className="w-full h-full object-contain bg-slate-950"
              />
              {annotations.map((pin, idx) => (
                <div
                  key={pin.id}
                  style={{ left: `${pin.x}%`, top: `${pin.y}%` }}
                  className="absolute -translate-x-1/2 -translate-y-1/2 group z-10 flex items-center gap-1.5"
                >
                  <span className="w-6 h-6 rounded-full bg-red-600 border-2 border-white text-white font-mono text-xs font-bold flex items-center justify-center shadow-md tabular-nums">
                    {idx + 1}
                  </span>
                  <div className="flex items-center gap-1 px-2 py-0.5 bg-slate-950/90 border border-red-500/80 text-white text-[11px] rounded shadow-md whitespace-nowrap">
                    <span>{pin.label}</span>
                    <button
                      type="button"
                      onClick={(e) => removeAnnotation(pin.id, e)}
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
            <div className="flex flex-col items-center justify-center text-center p-6 text-slate-400">
              {imgError ? (
                <>
                  <AlertCircle className="w-8 h-8 text-amber-400 mb-2" />
                  <p className="text-xs text-slate-300 font-medium">
                    圖片網址無法載入或格式不支援
                  </p>
                  <p className="text-[11px] text-slate-500 mt-1">
                    請確認圖片網址公開可存取，或改用「上傳檔案」與「DFM工程圖庫」
                  </p>
                </>
              ) : (
                <>
                  <ImageIcon className="w-8 h-8 text-slate-600 mb-2" />
                  <p className="text-xs text-slate-400">
                    尚未設定 DFM 問題點圖片（可貼上網址、上傳截圖或套用工程圖庫）
                  </p>
                </>
              )}
            </div>
          )}
        </div>

        {/* Caption Bar */}
        <div className="px-3 py-2 bg-white border-t border-slate-200 flex items-center gap-2">
          <span className="text-xs font-medium text-slate-500 whitespace-nowrap shrink-0">
            圖片說明：
          </span>
          <input
            type="text"
            value={imageCaption}
            onChange={(e) => onChangeCaption(e.target.value)}
            placeholder="輸入報告圖說（例如：圖 1. C102 距離 V-Cut 板邊僅 0.28mm 實測截圖）..."
            className="w-full text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none"
          />
        </div>
      </div>
    </div>
  );
};
