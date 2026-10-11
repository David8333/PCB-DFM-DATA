import { DfmTemplate, DfmCategory, ReferenceSpecItem, DfmDrawingItem } from '../types/dfm';

export const DFM_CATEGORIES: DfmCategory[] = [
  'PCB Layout',
  'SMT 組裝',
  '插件製程',
  '波峰焊錫',
  '補焊製程',
  '併板規範',
  '零件加工',
  '組裝製程',
  '包裝製程',
  '機構干涉',
  '散熱與安規',
];

export const DEFAULT_REFERENCE_SPECS: ReferenceSpecItem[] = [
  {
    id: 'spec-001',
    title: 'IPC-2221B 板邊與併板間距規範',
    content:
      'IPC-2221B Section 8.1.2 / 廠內併板與成型規範 DFM-PANEL-01：V-Cut 板邊零件禁佈區需 ≥ 1.0mm（MLCC 需 ≥ 1.5mm）；Router 銑刀槽邊緣需 ≥ 0.6mm，並須預留 5.0mm 工藝邊（Breakaway Rail）。',
    updatedAt: '2026-10-11',
  },
  {
    id: 'spec-002',
    title: 'IPC-7095D BGA 與 Via-in-Pad 塞孔規範',
    content:
      'IPC-7095D Section 7.5 / IPC-4761 Type VII：SMD 焊墊內禁止設計未塞孔導通孔，若因空間限制採 Via-in-Pad，須指定樹脂塞孔＋電鍍蓋帽（VIPPO），避免迴焊漏錫與錫球空洞率超標。',
    updatedAt: '2026-10-11',
  },
  {
    id: 'spec-003',
    title: 'IPC-7351B 十字散熱焊墊 (Thermal Relief) 規範',
    content:
      'IPC-7351B Section 3.4.5：連接大面積接地或電源銅箔之元件焊墊與插件通孔，需採用十字散熱連接（Thermal Spoke 寬度 0.20mm~0.35mm），防止迴焊立碑或波峰焊/手工補焊散熱過快導致冷焊。',
    updatedAt: '2026-10-11',
  },
  {
    id: 'spec-004',
    title: 'IPC-A-610H 插件與波峰焊錫製程規範',
    content:
      'IPC-A-610H Class 2 / 廠內波峰焊製程規範 WAVE-SPEC-03：DIP 插件腳長突出板底需控制在 1.2mm~2.0mm，過波峰方向之排針與 IC 尾端需增設盜錫焊墊（Solder Thief Pad）以防止橋接短路。',
    updatedAt: '2026-10-11',
  },
  {
    id: 'spec-005',
    title: 'IEC / UL 62368-1 高低壓安規沿面距離規範',
    content:
      'IEC / UL 62368-1 Section 5.4.2 & 5.4.3：一次側與二次側加強絕緣於 AC 240V 環境下，空間距離（Clearance）需 ≥ 4.0mm、沿面距離（Creepage）需 ≥ 5.0mm，或開設 ≥ 1.2mm 安規隔離槽。',
    updatedAt: '2026-10-11',
  },
  {
    id: 'spec-006',
    title: '廠內 DIP 零件加工與手工補焊間距規範',
    content:
      '廠內製程規範 THT-ASSY-08：立式電容/電阻折腳加工R角需距本體 ≥ 1.5mm；需手工烙鐵補焊之連接器周邊 2.5mm 內不得配置塑膠件或易熔元件。',
    updatedAt: '2026-10-11',
  },
];

// Helper to encode SVG strings into reliable data URIs
function svgToDataUri(svgString: string): string {
  return `data:image/svg+xml;utf8,${encodeURIComponent(svgString.trim())}`;
}

export const PRESET_CAD_DIAGRAMS: DfmDrawingItem[] = [
  {
    id: 'edge-clearance',
    name: '併板 V-Cut 板邊間距不足 (Panel / Board Edge)',
    category: '併板規範',
    description: '圖示：C102 距離底部 V-Cut 板邊僅 0.28mm，侵入紅色禁佈區 (Keepout Zone ≥ 1.0mm)，分板時易受機械應力微裂。',
    annotations: [
      { id: 'ann-preset-1', x: 66, y: 69, label: '間距僅 0.28mm (侵入禁佈區)' },
    ],
    updatedAt: '2026-10-11',
    url: svgToDataUri(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 360" width="640" height="360">
        <rect width="640" height="360" fill="#0f172a"/>
        <g stroke="#1e293b" stroke-width="1">
          <line x1="0" y1="60" x2="640" y2="60"/><line x1="0" y1="120" x2="640" y2="120"/>
          <line x1="0" y1="180" x2="640" y2="180"/><line x1="0" y1="240" x2="640" y2="240"/>
          <line x1="0" y1="300" x2="640" y2="300"/>
          <line x1="80" y1="0" x2="80" y2="360"/><line x1="160" y1="0" x2="160" y2="360"/>
          <line x1="240" y1="0" x2="240" y2="360"/><line x1="320" y1="0" x2="320" y2="360"/>
          <line x1="400" y1="0" x2="400" y2="360"/><line x1="480" y1="0" x2="480" y2="360"/>
          <line x1="560" y1="0" x2="560" y2="360"/>
        </g>
        <rect x="40" y="40" width="560" height="250" fill="#064e3b" stroke="#10b981" stroke-width="2"/>
        <rect x="40" y="235" width="560" height="55" fill="#ef4444" fill-opacity="0.18"/>
        <line x1="40" y1="235" x2="600" y2="235" stroke="#f87171" stroke-width="1.5" stroke-dasharray="6 4"/>
        <text x="54" y="226" fill="#fca5a5" font-family="monospace" font-size="12">KEEPOUT ZONE (MIN 1.0mm FOR V-CUT)</text>
        <text x="54" y="315" fill="#94a3b8" font-family="monospace" font-size="13">V-CUT / PANEL BREAKAWAY EDGE</text>
        <g transform="translate(110, 120)">
          <rect x="0" y="0" width="36" height="44" rx="3" fill="#fbbf24"/>
          <rect x="86" y="0" width="36" height="44" rx="3" fill="#fbbf24"/>
          <rect x="20" y="6" width="82" height="32" fill="#78350f" stroke="#d97706" stroke-width="1.5"/>
          <text x="42" y="27" fill="#fef3c7" font-family="monospace" font-size="13" font-weight="bold">C101</text>
          <text x="28" y="-10" fill="#34d399" font-family="monospace" font-size="11">SAFE (2.4mm)</text>
        </g>
        <g transform="translate(360, 218)">
          <rect x="0" y="0" width="38" height="48" rx="3" fill="#fbbf24"/>
          <rect x="92" y="0" width="38" height="48" rx="3" fill="#fbbf24"/>
          <rect x="22" y="6" width="86" height="36" fill="#92400e" stroke="#f59e0b" stroke-width="1.5"/>
          <text x="46" y="29" fill="#ffffff" font-family="monospace" font-size="14" font-weight="bold">C102</text>
          <circle cx="65" cy="28" r="64" fill="none" stroke="#ef4444" stroke-width="3" stroke-dasharray="8 4"/>
        </g>
        <line x1="515" y1="266" x2="515" y2="290" stroke="#ef4444" stroke-width="2"/>
        <line x1="505" y1="266" x2="525" y2="266" stroke="#ef4444" stroke-width="2"/>
        <rect x="524" y="256" width="96" height="26" rx="4" fill="#ef4444"/>
        <text x="532" y="274" fill="#ffffff" font-family="monospace" font-size="13" font-weight="bold">d = 0.28mm</text>
      </svg>
    `),
  },
  {
    id: 'via-in-pad',
    name: 'BGA / QFN 焊墊內導孔未塞孔 (Via-in-Pad)',
    category: 'SMT 組裝',
    description: '圖示：左側焊墊內直接開孔導致迴焊錫膏流失與空洞；右側為建議之 Dog-Bone 扇出與 ≥0.10mm 綠漆阻焊橋。',
    annotations: [
      { id: 'ann-preset-2', x: 30, y: 46, label: '未塞孔導孔位於 SMD Pad 內' },
    ],
    updatedAt: '2026-10-11',
    url: svgToDataUri(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 360" width="640" height="360">
        <rect width="640" height="360" fill="#0f172a"/>
        <g stroke="#1e293b" stroke-width="1">
          <line x1="0" y1="90" x2="640" y2="90"/><line x1="0" y1="180" x2="640" y2="180"/><line x1="0" y1="270" x2="640" y2="270"/>
          <line x1="160" y1="0" x2="160" y2="360"/><line x1="320" y1="0" x2="320" y2="360"/><line x1="480" y1="0" x2="480" y2="360"/>
        </g>
        <rect x="35" y="45" width="265" height="270" rx="6" fill="#064e3b" stroke="#ef4444" stroke-width="2"/>
        <text x="52" y="75" fill="#fca5a5" font-family="monospace" font-size="14" font-weight="bold">NG: OPEN VIA IN SMD PAD</text>
        <circle cx="168" cy="180" r="62" fill="#f59e0b" stroke="#fbbf24" stroke-width="3"/>
        <circle cx="195" cy="165" r="24" fill="#0f172a" stroke="#ef4444" stroke-width="3"/>
        <text x="177" y="170" fill="#f87171" font-family="monospace" font-size="12" font-weight="bold">VIA</text>
        <text x="62" y="285" fill="#fecaca" font-family="monospace" font-size="12">Solder Wicking &amp; Void Risk</text>
        <rect x="340" y="45" width="265" height="270" rx="6" fill="#064e3b" stroke="#10b981" stroke-width="2"/>
        <text x="358" y="75" fill="#6ee7b7" font-family="monospace" font-size="14" font-weight="bold">OK: DOG-BONE / SOLDER MASK</text>
        <circle cx="435" cy="185" r="52" fill="#f59e0b" stroke="#fbbf24" stroke-width="3"/>
        <line x1="470" y1="150" x2="525" y2="115" stroke="#10b981" stroke-width="10"/>
        <circle cx="535" cy="108" r="24" fill="#d97706" stroke="#34d399" stroke-width="3"/>
        <circle cx="535" cy="108" r="10" fill="#0f172a"/>
        <text x="365" y="285" fill="#a7f3d0" font-family="monospace" font-size="12">Solder Mask Dam ≥ 0.10mm</text>
      </svg>
    `),
  },
  {
    id: 'thermal-relief',
    name: '大銅面直連焊墊導致冷焊/補焊困難 (Thermal Relief)',
    category: 'PCB Layout',
    description: '圖示：左側焊墊與大面積 GND 銅箔全直連無十字散熱橋，導致迴焊立碑及手工烙鐵補焊散熱過快。',
    annotations: [
      { id: 'ann-preset-3', x: 38, y: 50, label: '大銅面全直連無散熱橋' },
    ],
    updatedAt: '2026-10-11',
    url: svgToDataUri(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 360" width="640" height="360">
        <rect width="640" height="360" fill="#0f172a"/>
        <rect x="40" y="50" width="250" height="260" rx="6" fill="#059669" fill-opacity="0.45" stroke="#10b981" stroke-width="2"/>
        <text x="58" y="84" fill="#a7f3d0" font-family="monospace" font-size="13" font-weight="bold">LARGE GND COPPER POUR</text>
        <rect x="215" y="140" width="65" height="80" rx="4" fill="#fbbf24" stroke="#ef4444" stroke-width="3"/>
        <rect x="370" y="140" width="65" height="80" rx="4" fill="#fbbf24"/>
        <line x1="435" y1="180" x2="570" y2="180" stroke="#10b981" stroke-width="10"/>
        <rect x="260" y="152" width="130" height="56" rx="3" fill="#334155" stroke="#94a3b8" stroke-width="2"/>
        <text x="302" y="185" fill="#f8fafc" font-family="monospace" font-size="15" font-weight="bold">R204</text>
        <circle cx="245" cy="180" r="58" fill="none" stroke="#ef4444" stroke-width="3" stroke-dasharray="7 4"/>
        <rect x="65" y="255" width="215" height="34" rx="4" fill="#ef4444"/>
        <text x="76" y="277" fill="#ffffff" font-family="monospace" font-size="12" font-weight="bold">DIRECT POUR (NO SPOKES)</text>
      </svg>
    `),
  },
  {
    id: 'tall-shadowing',
    name: '波峰焊錫/補焊治具陰影與高聳零件干涉',
    category: '補焊製程',
    description: '圖示：高聳零件 (H=12.5mm) 與鄰近微型 SMD/補焊點間距僅 0.65mm，位於烙鐵角度與波峰陰影干涉區。',
    annotations: [
      { id: 'ann-preset-4', x: 48, y: 68, label: '高聳零件陰影區間距僅 0.65mm' },
    ],
    updatedAt: '2026-10-11',
    url: svgToDataUri(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 360" width="640" height="360">
        <rect width="640" height="360" fill="#0f172a"/>
        <rect x="40" y="260" width="560" height="36" fill="#065f46" stroke="#10b981" stroke-width="2"/>
        <text x="265" y="283" fill="#a7f3d0" font-family="monospace" font-size="13" font-weight="bold">PCB FR-4 SUBSTRATE</text>
        <rect x="110" y="75" width="150" height="185" rx="6" fill="#334155" stroke="#cbd5e1" stroke-width="2"/>
        <text x="135" y="160" fill="#f8fafc" font-family="monospace" font-size="14" font-weight="bold">J101 / EC1</text>
        <text x="135" y="182" fill="#94a3b8" font-family="monospace" font-size="12">H = 12.5mm</text>
        <polygon points="260,75 435,260 260,260" fill="#ef4444" fill-opacity="0.24"/>
        <line x1="260" y1="75" x2="435" y2="260" stroke="#f87171" stroke-width="2" stroke-dasharray="6 4"/>
        <text x="315" y="145" fill="#fca5a5" font-family="monospace" font-size="12" font-weight="bold">SOLDER / REWORK SHADOW ZONE</text>
        <rect x="285" y="242" width="46" height="18" rx="2" fill="#fbbf24" stroke="#ef4444" stroke-width="2"/>
        <text x="285" y="232" fill="#fef08a" font-family="monospace" font-size="13" font-weight="bold">U12 / C45</text>
        <line x1="260" y1="312" x2="285" y2="312" stroke="#ef4444" stroke-width="2"/>
        <rect x="255" y="320" width="175" height="26" rx="4" fill="#ef4444"/>
        <text x="264" y="337" fill="#ffffff" font-family="monospace" font-size="12" font-weight="bold">Clearance = 0.65mm (NG)</text>
      </svg>
    `),
  },
];

export const DEFAULT_DFM_TEMPLATES: DfmTemplate[] = [
  {
    id: 'dfm-tpl-001',
    code: 'DFM-PNL-001',
    title: '併板 V-Cut 板邊零件安全間距不足 (Component-to-Edge Clearance)',
    category: '併板規範',
    referenceModel: 'PWR-2400W-RevA / 伺服器電源主板',
    issueTemplate:
      '位於 PCB [板層面別] 之零件 [零件編號] 距離 [方向] 板邊（[分板製程]）僅 [距離數值]，小於廠內併板規範最低安全距離 [標準值]，於 V-Cut 分板時極易承受機械應力導致 MLCC 內部微裂紋或焊點剝離不良。',
    recommendationTemplate:
      '請將零件 [零件編號] 往板內方向平移至少 [建議內縮距離]，確保零件本體及焊墊邊緣距離 [方向] 板邊大於 [標準值]；或於併板設計時增設 [工藝邊寬度] 之折斷邊（Breakaway Rail）。',
    referenceSpec: DEFAULT_REFERENCE_SPECS[0].content,
    imageUrl: PRESET_CAD_DIAGRAMS[0].url,
    imageCaption: '圖示：C102 距離底部 V-Cut 板邊僅 0.28mm，侵入紅色禁佈區 (Keepout Zone)',
    annotations: [
      { id: 'ann-1', x: 66, y: 69, label: '間距僅 0.28mm (侵入禁佈區)' },
    ],
    variableDefaults: {
      板層面別: 'Top 面',
      零件編號: 'C102, C105',
      方向: '底部 (Bottom Edge)',
      分板製程: 'V-Cut 成型邊',
      距離數值: '0.28mm',
      標準值: '1.0mm',
      建議內縮距離: '0.80mm',
      工藝邊寬度: '5.0mm',
    },
    updatedAt: '2026-10-11',
  },
  {
    id: 'dfm-tpl-002',
    code: 'DFM-SMT-002',
    title: 'SMD 焊墊內導孔未塞孔 (Via-in-Pad 漏錫與空洞風險)',
    category: 'SMT 組裝',
    referenceModel: 'IPC-MB-720 / 工控主機板 V1.2',
    issueTemplate:
      '零件 [零件編號]（封裝：[封裝型式]）之第 [腳位編號] 焊墊上直接打設直徑 [導孔孔徑] 之導通孔（Via-in-Pad），且 Gerber 製程未指定樹脂塞孔電鍍填平（VIPPO），迴焊時錫膏將順著導孔毛細現象流失至 [流向板層]，造成少錫、虛焊或錫球空洞率超標。',
    recommendationTemplate:
      '請將零件 [零件編號] 焊墊內的導孔移出焊墊外改採扇出走線（Dog-Bone Fanout），並確保防焊綠漆橋（Solder Mask Dam）寬度至少維持 [綠漆橋寬度]；若受高密度走線限制必須維持 Via-in-Pad，請於製程規範註明採用「樹脂塞孔＋電鍍蓋帽 (VIPPO)」。',
    referenceSpec: DEFAULT_REFERENCE_SPECS[1].content,
    imageUrl: PRESET_CAD_DIAGRAMS[1].url,
    imageCaption: '圖示：左側焊墊內直接開孔導致錫膏流失；右側為建議之 Dog-Bone 扇出與綠漆阻焊橋',
    annotations: [
      { id: 'ann-2', x: 30, y: 46, label: '未塞孔導孔位於 SMD Pad 內' },
    ],
    variableDefaults: {
      零件編號: 'U401',
      封裝型式: 'QFN-48 (0.4mm Pitch)',
      腳位編號: 'Pin 12, Pin 19, EPAD',
      導孔孔徑: '0.25mm',
      流向板層: 'Bottom 面',
      綠漆橋寬度: '0.10mm',
    },
    updatedAt: '2026-10-11',
  },
  {
    id: 'dfm-tpl-003',
    code: 'DFM-WAV-003',
    title: 'DIP 排針與波峰焊錫方向平行且無盜錫焊墊 (連錫橋接風險)',
    category: '波峰焊錫',
    referenceModel: 'ADAPTER-65W-G2 / 電源轉接板',
    issueTemplate:
      '插件零件 [零件編號]（腳距：[腳距數值]）之排列長軸與過波峰焊錫方向（[過爐方向]）呈垂直或尾端未設置盜錫焊墊（Solder Thief Pad），脫離錫波時最後兩腳 [異常腳位] 極易因表面張力殘留過多焊錫而產生連錫短路（Solder Bridging）。',
    recommendationTemplate:
      '請將 [零件編號] 旋轉 90° 使排針走向平行於 [過爐方向]，並於出錫波尾端最後一腳後方增設寬度 [盜錫墊尺寸] 之盜錫焊墊（Solder Thief Pad），以吸收多餘殘錫並提升波峰焊良率。',
    referenceSpec: DEFAULT_REFERENCE_SPECS[3].content,
    imageUrl: PRESET_CAD_DIAGRAMS[2].url,
    imageCaption: '圖示：排針尾端未加設盜錫焊墊，脫離波峰時易造成連錫短路',
    annotations: [],
    variableDefaults: {
      零件編號: 'CN301, J205',
      腳距數值: '2.0mm Pitch',
      過爐方向: '由左至右 (+X)',
      異常腳位: 'Pin 9 ~ Pin 10',
      盜錫墊尺寸: '1.5mm × 3.0mm',
    },
    updatedAt: '2026-10-11',
  },
  {
    id: 'dfm-tpl-004',
    code: 'DFM-RWK-004',
    title: '大銅面直連插件孔且周邊間距不足導致手工補焊冷焊與干涉',
    category: '補焊製程',
    referenceModel: 'INV-CTRL-300 / 逆變器控制板',
    issueTemplate:
      '需後焊/補焊之插件零件 [零件編號] 其接地腳位 [腳位編號] 直接全鋪銅連接至大面積 [銅箔網路名稱]，且與鄰近塑膠連接器 [鄰近零件編號] 距離僅 [距離數值]（小於標準值 [標準值]），導致烙鐵補焊時熱量迅速散失產生冷焊、包焊，且烙鐵頭極易燙傷鄰近塑膠本體。',
    recommendationTemplate:
      '請將 [零件編號] 之 [腳位編號] 改為十字散熱焊墊（Thermal Relief，線寬 [散熱支撐線寬]），並將鄰近零件 [鄰近零件編號] 往 [方向] 外移至距離 [標準值] 以上，預留安全手工烙鐵補焊作業角度。',
    referenceSpec: DEFAULT_REFERENCE_SPECS[2].content,
    imageUrl: PRESET_CAD_DIAGRAMS[3].url,
    imageCaption: '圖示：高聳連接器緊鄰補焊點僅 0.65mm，烙鐵作業角度受阻',
    annotations: [
      { id: 'ann-4', x: 46, y: 68, label: '補焊間距僅 0.65mm 干涉烙鐵頭' },
    ],
    variableDefaults: {
      零件編號: 'L102 (共模電感)',
      腳位編號: 'Pin 2, Pin 4',
      銅箔網路名稱: 'PGND_PRI',
      鄰近零件編號: 'J101 (塑膠端子台)',
      距離數值: '0.65mm',
      標準值: '2.5mm',
      散熱支撐線寬: '0.30mm',
      方向: '右側 (+X)',
    },
    updatedAt: '2026-10-11',
  },
  {
    id: 'dfm-tpl-005',
    code: 'DFM-THT-005',
    title: 'DIP 插件孔徑與零件腳徑配合不當 (插件困難或浮高)',
    category: '插件製程',
    referenceModel: 'EV-CHARGER-V3 / 充電樁主控板',
    issueTemplate:
      'DIP 插件零件 [零件編號] 之引腳直徑（或對角線）為 [引腳直徑]，但 PCB 設計之 PTH 成品孔徑僅 [目前孔徑]，孔徑裕度僅 [目前裕度]（小於標準插件裕度 [標準值]），產線自動/人工插件時極易發生插不進、折腳或過爐後零件本體浮高傾斜。',
    recommendationTemplate:
      '請將零件 [零件編號] 之 PTH 電鍍成品孔徑由 [目前孔徑] 擴大至 [建議孔徑]（遵循孔徑 = 零件引腳最大直徑 + [標準值]），並同步將焊環外徑（Annular Ring）調整為 [建議焊環外徑] 以上。',
    referenceSpec: DEFAULT_REFERENCE_SPECS[5].content,
    imageUrl: PRESET_CAD_DIAGRAMS[1].url,
    imageCaption: '圖示：PTH 插件成品孔徑與焊環尺寸檢核示意圖',
    annotations: [],
    variableDefaults: {
      零件編號: 'SW101, RY201 (繼電器)',
      引腳直徑: '1.05mm',
      目前孔徑: '1.10mm',
      目前裕度: '+0.05mm',
      標準值: '0.25mm ~ 0.40mm',
      建議孔徑: '1.35mm',
      建議焊環外徑: '2.20mm',
    },
    updatedAt: '2026-10-11',
  },
  {
    id: 'dfm-tpl-006',
    code: 'DFM-PRP-006',
    title: '臥式/立式插件零件預加工折腳尺寸與孔距不匹配 (應力裂損)',
    category: '零件加工',
    referenceModel: 'LED-DRV-150W / 照明驅動電源',
    issueTemplate:
      '需預先切腳/折腳加工之零件 [零件編號]（封裝：[封裝型式]），其 PCB 焊墊中心孔距設計為 [目前孔距]，導致零件引腳折彎處距離元件本體根部僅 [距離數值]，小於零件加工最小安全折彎距離 [標準值]，成型時機械應力將破壞元件內部封裝氣密性。',
    recommendationTemplate:
      '請將 PCB 上 [零件編號] 之兩腳插件中心孔距調整為 [建議孔距]，確保預加工折腳 R 角距離元件本體根部維持 [標準值] 以上，並於作業指導書（SOP）設定切腳保留長度為 [建議腳長]。',
    referenceSpec: DEFAULT_REFERENCE_SPECS[5].content,
    imageUrl: PRESET_CAD_DIAGRAMS[0].url,
    imageCaption: '圖示：插件零件預加工折腳距離與孔距配置檢核',
    annotations: [],
    variableDefaults: {
      零件編號: 'D302, R115 (水泥電阻)',
      封裝型式: 'DO-201AD 軸向封裝',
      目前孔距: '10.0mm',
      距離數值: '0.6mm',
      標準值: '1.5mm',
      建議孔距: '15.24mm (600 mil)',
      建議腳長: '1.6mm ± 0.2mm',
    },
    updatedAt: '2026-10-11',
  },
];
