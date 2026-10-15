export type DfmCategory =
  | 'PCB Layout'
  | 'SMT 組裝'
  | '插件製程'
  | '波峰焊錫'
  | '補焊製程'
  | '併板規範'
  | '零件加工'
  | '組裝製程'
  | '包裝製程'
  | '機構干涉'
  | '散熱與安規';

export interface ImageAnnotation {
  id: string;
  x: number; // percentage 0-100
  y: number; // percentage 0-100
  label: string;
}

export interface ReferenceSpecItem {
  id: string;
  title: string; // e.g., "IPC-2221B 板邊間距規範"
  content: string; // e.g., "IPC-2221B Section 8.1.2：V-Cut 板邊零件禁佈區需 ≥ 1.0mm..."
  updatedAt: string;
}

export interface DfmDrawingItem {
  id: string;
  name: string;
  category: DfmCategory;
  url: string;
  imageId?: string; // Persistent ID in IndexedDB image vault
  description: string; // 圖片說明
  annotations?: ImageAnnotation[];
  updatedAt: string;
}

export interface DfmTemplate {
  id: string;
  code: string;
  title: string;
  category: DfmCategory;
  referenceModel: string; // 參考機種 (可自行填寫)
  issueTemplate: string;
  recommendationTemplate: string;
  referenceSpec: string;
  imageUrl: string;
  imageId?: string; // Persistent ID in IndexedDB image vault
  imageCaption?: string;
  annotations?: ImageAnnotation[];
  variableDefaults: Record<string, string>;
  updatedAt: string;
}

export interface CompiledReportItem {
  id: string;
  templateId: string;
  code: string;
  title: string;
  category: DfmCategory;
  referenceModel: string;
  compiledIssue: string;
  compiledRecommendation: string;
  referenceSpec: string;
  imageUrl: string;
  imageId?: string; // Persistent ID in IndexedDB image vault
  imageCaption?: string;
  annotations?: ImageAnnotation[];
  variableValues: Record<string, string>;
  createdAt: string;
}
