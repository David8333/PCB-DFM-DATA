import { CompiledReportItem } from '../types/dfm';

/**
 * Renders an item's imageUrl + red callout annotations onto an HTML5 Canvas
 * and returns the PNG bytes (Uint8Array) so that SVG diagrams, Base64 uploads,
 * and external URLs all become standard PNGs with annotations baked in for Excel.
 */
async function renderItemImageToPngBytes(
  item: CompiledReportItem
): Promise<Uint8Array | null> {
  if (!item.imageUrl) return null;

  return new Promise((resolve) => {
    const img = new Image();
    if (!item.imageUrl.startsWith('data:')) {
      img.crossOrigin = 'anonymous';
    }

    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        const targetW = 640;
        const targetH = 360;
        canvas.width = targetW;
        canvas.height = targetH;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(null);
          return;
        }

        // Dark engineering canvas background
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(0, 0, targetW, targetH);

        // Fit image preserving aspect ratio (object-contain)
        const naturalW = img.naturalWidth || img.width || targetW;
        const naturalH = img.naturalHeight || img.height || targetH;
        const scale = Math.min(targetW / naturalW, targetH / naturalH);
        const drawW = naturalW * scale;
        const drawH = naturalH * scale;
        const offsetX = (targetW - drawW) / 2;
        const offsetY = (targetH - drawH) / 2;
        ctx.drawImage(img, offsetX, offsetY, drawW, drawH);

        // Draw red callout annotations if present
        const annotations = item.annotations || [];
        annotations.forEach((pin, idx) => {
          const px = (pin.x / 100) * targetW;
          const py = (pin.y / 100) * targetH;

          // Red circle pin
          ctx.beginPath();
          ctx.arc(px, py, 14, 0, Math.PI * 2);
          ctx.fillStyle = '#dc2626';
          ctx.fill();
          ctx.lineWidth = 2.5;
          ctx.strokeStyle = '#ffffff';
          ctx.stroke();

          // Pin number
          ctx.fillStyle = '#ffffff';
          ctx.font = 'bold 13px Consolas, monospace';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(String(idx + 1), px, py);

          // Pin label box
          if (pin.label) {
            ctx.font = 'bold 12px "Microsoft JhengHei", sans-serif';
            const textMetrics = ctx.measureText(pin.label);
            const boxW = textMetrics.width + 14;
            const boxH = 22;
            const boxX = Math.min(px + 18, targetW - boxW - 4);
            const boxY = Math.max(4, Math.min(py - boxH / 2, targetH - boxH - 4));

            ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
            ctx.fillRect(boxX, boxY, boxW, boxH);
            ctx.strokeStyle = '#ef4444';
            ctx.lineWidth = 1.5;
            ctx.strokeRect(boxX, boxY, boxW, boxH);

            ctx.fillStyle = '#ffffff';
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            ctx.fillText(pin.label, boxX + 7, boxY + boxH / 2);
          }
        });

        const dataUrl = canvas.toDataURL('image/png');
        const base64 = dataUrl.split(',')[1];
        const binaryStr = atob(base64);
        const bytes = new Uint8Array(binaryStr.length);
        for (let i = 0; i < binaryStr.length; i++) {
          bytes[i] = binaryStr.charCodeAt(i);
        }
        resolve(bytes);
      } catch {
        resolve(null);
      }
    };

    img.onerror = () => resolve(null);
    img.src = item.imageUrl;
  });
}

/**
 * Minimal standard ZIP archive builder (uses STORE method 0 with CRC32)
 * so we can generate a 100% valid native .xlsx file with embedded PNG images
 * without external library dependencies.
 */
function createZipArchive(
  files: Array<{ path: string; data: Uint8Array }>
): Uint8Array {
  const crcTable = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    crcTable[n] = c;
  }

  function crc32(buf: Uint8Array): number {
    let crc = 0xffffffff;
    for (let i = 0; i < buf.length; i++) {
      crc = crcTable[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
    }
    return (crc ^ 0xffffffff) >>> 0;
  }

  const encoder = new TextEncoder();
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;

  for (const file of files) {
    const nameBytes = encoder.encode(file.path);
    const data = file.data;
    const crc = crc32(data);
    const size = data.length;

    // Local file header (30 bytes + name)
    const localHeader = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(localHeader.buffer);
    lv.setUint32(0, 0x04034b50, true); // signature
    lv.setUint16(4, 20, true); // version needed
    lv.setUint16(6, 0x0800, true); // UTF-8 flag
    lv.setUint16(8, 0, true); // compression: STORE (0)
    lv.setUint16(10, 0, true); // mod time
    lv.setUint16(12, 0x5421, true); // mod date
    lv.setUint32(14, crc, true);
    lv.setUint32(18, size, true);
    lv.setUint32(22, size, true);
    lv.setUint16(26, nameBytes.length, true);
    lv.setUint16(28, 0, true);
    localHeader.set(nameBytes, 30);

    localParts.push(localHeader, data);

    // Central directory header (46 bytes + name)
    const centralHeader = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(centralHeader.buffer);
    cv.setUint32(0, 0x02014b50, true); // signature
    cv.setUint16(4, 20, true); // version made by
    cv.setUint16(6, 20, true); // version needed
    cv.setUint16(8, 0x0800, true); // UTF-8 flag
    cv.setUint16(10, 0, true); // compression: STORE
    cv.setUint16(12, 0, true);
    cv.setUint16(14, 0x5421, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, size, true);
    cv.setUint32(24, size, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint16(30, 0, true);
    cv.setUint16(32, 0, true);
    cv.setUint16(34, 0, true);
    cv.setUint16(36, 0, true);
    cv.setUint32(38, 0, true);
    cv.setUint32(42, offset, true);
    centralHeader.set(nameBytes, 46);

    centralParts.push(centralHeader);
    offset += localHeader.length + size;
  }

  const centralSize = centralParts.reduce((acc, p) => acc + p.length, 0);
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(4, 0, true);
  ev.setUint16(6, 0, true);
  ev.setUint16(8, files.length, true);
  ev.setUint16(10, files.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);
  ev.setUint16(20, 0, true);

  const totalLength = offset + centralSize + 22;
  const out = new Uint8Array(totalLength);
  let pos = 0;
  for (const part of localParts) {
    out.set(part, pos);
    pos += part.length;
  }
  for (const part of centralParts) {
    out.set(part, pos);
    pos += part.length;
  }
  out.set(eocd, pos);
  return out;
}

function escapeXml(str: string): string {
  return (str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Generates and downloads a real native Microsoft Excel (.xlsx) file
 * with embedded PNG images inside the "圖片 (Image)" column, locked column widths,
 * row heights, cell borders, and automatic text wrapping.
 */
export async function exportBatchToExcel(
  items: CompiledReportItem[]
): Promise<void> {
  if (items.length === 0) return;

  const dateStr = new Date().toISOString().slice(0, 10);
  const encoder = new TextEncoder();

  // 1. Render all item images (including SVG CAD diagrams and red callout pins) to PNG bytes
  const imageBytesList: Array<Uint8Array | null> = await Promise.all(
    items.map((item) => renderItemImageToPngBytes(item))
  );

  const zipFiles: Array<{ path: string; data: Uint8Array }> = [];

  // 2. Build Worksheet XML (xl/worksheets/sheet1.xml)
  const sheetRowsXml: string[] = [];

  // Row 1: Title Banner
  sheetRowsXml.push(`
    <row r="1" ht="32" customHeight="1">
      <c r="A1" s="1" t="inlineStr"><is><t>DFM案例 報告彙整清單（產出日期：${dateStr} · 共 ${items.length} 筆）</t></is></c>
      <c r="B1" s="1"/><c r="C1" s="1"/><c r="D1" s="1"/><c r="E1" s="1"/><c r="F1" s="1"/><c r="G1" s="1"/><c r="H1" s="1"/>
    </row>
  `);

  // Row 2: Table Headers
  const headers = [
    { col: 'A', label: '項次' },
    { col: 'B', label: 'DFM 問題點 (Issue Description)' },
    { col: 'C', label: '圖片 / 不良畫面 (Image)' },
    { col: 'D', label: 'DFM 修改建議 (Recommendation)' },
    { col: 'E', label: '項目編號 (Code)' },
    { col: 'F', label: '製程分類 (Category)' },
    { col: 'G', label: '參考機種 (Reference Model)' },
    { col: 'H', label: '參考資料與規範 (Reference / Spec)' },
  ];
  sheetRowsXml.push(`
    <row r="2" ht="28" customHeight="1">
      ${headers
        .map(
          (h) =>
            `<c r="${h.col}2" s="2" t="inlineStr"><is><t>${escapeXml(
              h.label
            )}</t></is></c>`
        )
        .join('')}
    </row>
  `);

  // Data Rows (Row 3+)
  items.forEach((item, idx) => {
    const r = idx + 3;
    const issueFull = `【${item.title}】\n${item.compiledIssue}`;

    sheetRowsXml.push(`
      <row r="${r}" ht="142" customHeight="1">
        <c r="A${r}" s="3" t="inlineStr"><is><t>${idx + 1}</t></is></c>
        <c r="B${r}" s="4" t="inlineStr"><is><t>${escapeXml(issueFull)}</t></is></c>
        <c r="C${r}" s="4" t="inlineStr"><is><t></t></is></c>
        <c r="D${r}" s="4" t="inlineStr"><is><t>${escapeXml(item.compiledRecommendation)}</t></is></c>
        <c r="E${r}" s="3" t="inlineStr"><is><t>${escapeXml(item.code)}</t></is></c>
        <c r="F${r}" s="3" t="inlineStr"><is><t>${escapeXml(item.category)}</t></is></c>
        <c r="G${r}" s="4" t="inlineStr"><is><t>${escapeXml(item.referenceModel || '-')}</t></is></c>
        <c r="H${r}" s="4" t="inlineStr"><is><t>${escapeXml(item.referenceSpec || '-')}</t></is></c>
      </row>
    `);
  });

  // 3. Build Drawing XML (xl/drawings/drawing1.xml) for embedded PNG images
  const drawingAnchorsXml: string[] = [];
  const drawingRelsXml: string[] = [];
  let mediaIndex = 0;

  imageBytesList.forEach((pngBytes, idx) => {
    if (!pngBytes) return;
    mediaIndex++;
    const rId = `rIdImg${mediaIndex}`;
    const mediaFileName = `image${mediaIndex}.png`;

    zipFiles.push({
      path: `xl/media/${mediaFileName}`,
      data: pngBytes,
    });

    drawingRelsXml.push(
      `<Relationship Id="${rId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/${mediaFileName}"/>`
    );

    // Zero-based row index: Row 1 is 0, Row 2 is 1, first data row (Row 3) is 2
    const row0 = idx + 2;
    // Place image inside Column C (0-based col = 2) using twoCellAnchor editAs="oneCell"
    // From offset (76200 EMU = ~8px) to (2514600, 1447800 EMU = ~264px x 152px)
    drawingAnchorsXml.push(`
      <xdr:twoCellAnchor editAs="oneCell">
        <xdr:from>
          <xdr:col>2</xdr:col>
          <xdr:colOff>76200</xdr:colOff>
          <xdr:row>${row0}</xdr:row>
          <xdr:rowOff>76200</xdr:rowOff>
        </xdr:from>
        <xdr:to>
          <xdr:col>2</xdr:col>
          <xdr:colOff>2514600</xdr:colOff>
          <xdr:row>${row0}</xdr:row>
          <xdr:rowOff>1447800</xdr:rowOff>
        </xdr:to>
        <xdr:pic>
          <xdr:nvPicPr>
            <xdr:cNvPr id="${mediaIndex + 1}" name="Picture ${mediaIndex}"/>
            <xdr:cNvPicPr>
              <a:picLocks noChangeAspect="1"/>
            </xdr:cNvPicPr>
          </xdr:nvPicPr>
          <xdr:blipFill>
            <a:blip r:embed="${rId}"/>
            <a:stretch>
              <a:fillRect/>
            </a:stretch>
          </xdr:blipFill>
          <xdr:spPr>
            <a:xfrm>
              <a:off x="0" y="0"/>
              <a:ext cx="2438400" cy="1371600"/>
            </a:xfrm>
            <a:prstGeom prst="rect">
              <a:avLst/>
            </a:prstGeom>
          </xdr:spPr>
        </xdr:pic>
        <xdr:clientData/>
      </xdr:twoCellAnchor>
    `);
  });

  const hasDrawings = mediaIndex > 0;

  const sheetXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"
           xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheetViews>
    <sheetView workbookViewId="0" showGridLines="1"/>
  </sheetViews>
  <cols>
    <col min="1" max="1" width="8" customWidth="1"/>
    <col min="2" max="2" width="44" customWidth="1"/>
    <col min="3" max="3" width="42" customWidth="1"/>
    <col min="4" max="4" width="44" customWidth="1"/>
    <col min="5" max="5" width="18" customWidth="1"/>
    <col min="6" max="6" width="16" customWidth="1"/>
    <col min="7" max="7" width="24" customWidth="1"/>
    <col min="8" max="8" width="38" customWidth="1"/>
  </cols>
  <sheetData>
    ${sheetRowsXml.join('\n')}
  </sheetData>
  <mergeCells count="1">
    <mergeCell ref="A1:H1"/>
  </mergeCells>
  ${hasDrawings ? '<drawing r:id="rIdDrawing1"/>' : ''}
</worksheet>`;

  zipFiles.push({
    path: 'xl/worksheets/sheet1.xml',
    data: encoder.encode(sheetXml),
  });

  if (hasDrawings) {
    const sheetRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rIdDrawing1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing1.xml"/>
</Relationships>`;
    zipFiles.push({
      path: 'xl/worksheets/_rels/sheet1.xml.rels',
      data: encoder.encode(sheetRelsXml),
    });

    const drawingXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing"
          xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
          xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  ${drawingAnchorsXml.join('\n')}
</xdr:wsDr>`;
    zipFiles.push({
      path: 'xl/drawings/drawing1.xml',
      data: encoder.encode(drawingXml),
    });

    const drawingRelsFileXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  ${drawingRelsXml.join('\n')}
</Relationships>`;
    zipFiles.push({
      path: 'xl/drawings/_rels/drawing1.xml.rels',
      data: encoder.encode(drawingRelsFileXml),
    });
  }

  // 4. Styles XML (xl/styles.xml)
  const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="4">
    <font><sz val="10"/><name val="Microsoft JhengHei"/></font>
    <font><b/><sz val="13"/><color rgb="FFFFFFFF"/><name val="Microsoft JhengHei"/></font>
    <font><b/><sz val="10"/><color rgb="FFFFFFFF"/><name val="Microsoft JhengHei"/></font>
    <font><b/><sz val="10"/><color rgb="FF0F172A"/><name val="Microsoft JhengHei"/></font>
  </fonts>
  <fills count="4">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF1E293B"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF0F172A"/><bgColor indexed="64"/></patternFill></fill>
  </fills>
  <borders count="2">
    <border><left/><right/><top/><bottom/><diagonal/></border>
    <border>
      <left style="thin"><color rgb="FF94A3B8"/></left>
      <right style="thin"><color rgb="FF94A3B8"/></right>
      <top style="thin"><color rgb="FF94A3B8"/></top>
      <bottom style="thin"><color rgb="FF94A3B8"/></bottom>
      <diagonal/>
    </border>
  </borders>
  <cellStyleXfs count="1">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0"/>
  </cellStyleXfs>
  <cellXfs count="5">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">
      <alignment horizontal="left" vertical="center" indent="1"/>
    </xf>
    <xf numFmtId="0" fontId="2" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">
      <alignment horizontal="center" vertical="center" wrapText="1"/>
    </xf>
    <xf numFmtId="0" fontId="3" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1">
      <alignment horizontal="center" vertical="top" wrapText="1"/>
    </xf>
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1">
      <alignment horizontal="left" vertical="top" wrapText="1"/>
    </xf>
  </cellXfs>
</styleSheet>`;

  zipFiles.push({
    path: 'xl/styles.xml',
    data: encoder.encode(stylesXml),
  });

  // 5. Workbook XML & Rels
  const workbookXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"
          xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="DFM報告彙整清單" sheetId="1" r:id="rId1"/>
  </sheets>
</workbook>`;
  zipFiles.push({
    path: 'xl/workbook.xml',
    data: encoder.encode(workbookXml),
  });

  const workbookRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;
  zipFiles.push({
    path: 'xl/_rels/workbook.xml.rels',
    data: encoder.encode(workbookRelsXml),
  });

  const rootRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;
  zipFiles.push({
    path: '_rels/.rels',
    data: encoder.encode(rootRelsXml),
  });

  const contentTypesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Default Extension="png" ContentType="image/png"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
  ${
    hasDrawings
      ? '<Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>'
      : ''
  }
</Types>`;
  zipFiles.push({
    path: '[Content_Types].xml',
    data: encoder.encode(contentTypesXml),
  });

  // 6. Generate .xlsx binary and trigger download
  const xlsxBytes = createZipArchive(zipFiles);
  const blob = new Blob([xlsxBytes.buffer as ArrayBuffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `DFM報告彙整清單_${dateStr}.xlsx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
