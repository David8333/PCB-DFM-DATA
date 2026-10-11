import React, { useState, useRef } from 'react';
import {
  Image as ImageIcon,
  Upload,
  Link as LinkIcon,
  Crosshair,
  Trash2,
  Layers,
  AlertCircle,
} from 'lucide-react';
import { ImageAnnotation } from '../types/dfm';
import { PRESET_CAD_DIAGRAMS } from '../data/defaultTemplates';

interface ImageInspectorProps {
  imageUrl: string;
  imageCaption: string;
  annotations: ImageAnnotation[];
  onChangeImage: (url: string) => void;
  onChangeCaption: (caption: string) => void;
  onChangeAnnotations: (annotations: ImageAnnotation[]) => void;
}

export const ImageInspector: React.FC<ImageInspectorProps> = ({
  imageUrl,
  imageCaption,
  annotations,
  onChangeImage,
  onChangeCaption,
  onChangeAnnotations,
}) => {
  const [inputMode, setInputMode] = useState<'url' | 'upload' | 'preset'>('url');
  const [annotateMode, setAnnotateMode] = useState(false);
  const [newPinLabel, setNewPinLabel] = useState('間距不良點');
  const [imgError, setImgError] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageContainerRef = useRef<HTMLDivElement>(null);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        // Compress/resize image to max 960px width so localStorage stays fast and reliable
        const canvas = document.createElement('canvas');
        const maxW = 960;
        const scale = img.width > maxW ? maxW / img.width : 1;
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.84);
          setImgError(false);
          onChangeImage(dataUrl);
        }
      };
      if (typeof event.target?.result === 'string') {
        img.src = event.target.result;
      }
    };
    reader.readAsDataURL(file);
  };

  const handleImageClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!annotateMode || !imageContainerRef.current) return;
    const rect = imageContainerRef.current.getBoundingClientRect();
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

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-slate-800">
            不良畫面 / CAD 圖面 (Image)
          </span>
          <span className="text-xs text-slate-400" aria-hidden="true">
            ·
          </span>
          <span className="text-xs text-slate-500">
            支援圖片網址、本機上傳與紅框標註
          </span>
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
            DFM 工程圖庫
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
              setImgError(false);
              onChangeImage(e.target.value);
            }}
            placeholder={
              imageUrl.startsWith('data:')
                ? '目前已載入內嵌/上傳影像 — 可在此貼上外部圖片 URL 覆蓋...'
                : '貼上圖片網址 (https://...) 或圖床連結'
            }
            className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-lg text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-blue-600"
          />
          {imageUrl && (
            <button
              type="button"
              onClick={() => onChangeImage('')}
              className="px-3 py-2 text-xs font-medium text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors whitespace-nowrap shrink-0"
            >
              清除圖片
            </button>
          )}
        </div>
      )}

      {inputMode === 'upload' && (
        <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-slate-50 border border-dashed border-slate-300 rounded-lg">
          <div className="text-xs text-slate-600">
            選擇 PCB Gerber 截圖、AOI 不良照片或 3D 機構干涉圖（自動最佳化儲存於瀏覽器）
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
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors whitespace-nowrap shrink-0"
          >
            <Upload className="w-3.5 h-3.5" />
            選擇本機圖片上傳
          </button>
        </div>
      )}

      {inputMode === 'preset' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {PRESET_CAD_DIAGRAMS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => {
                setImgError(false);
                onChangeImage(preset.url);
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
                    請確認圖片網址公開可存取，或改用「上傳檔案」與「DFM 工程圖庫」
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
