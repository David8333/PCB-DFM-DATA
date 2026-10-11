import { CompiledReportItem } from '../types/dfm';

function escapeHtml(str: string): string {
  return (str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/\r?\n/g, '<br style="mso-data-placement:same-cell;" />');
}

/**
 * Exports the DFM Report Batch directly into a formatted Microsoft Excel (.xls) file
 * with locked column widths, cell borders, header colors, and same-cell line wrapping
 * so that the layout never breaks when opened in Excel.
 */
export function exportBatchToExcel(items: CompiledReportItem[]): void {
  if (items.length === 0) return;

  const dateStr = new Date().toISOString().slice(0, 10);

  const rowsHtml = items
    .map((item, idx) => {
      const annotatedText =
        item.annotations && item.annotations.length > 0
          ? `\n[圖面紅點標註]：${item.annotations
              .map((a, i) => `(${i + 1}) ${a.label}`)
              .join('、')}`
          : '';
      const imageCellInfo = [
        item.imageCaption || '請見報告圖面',
        annotatedText,
      ]
        .filter(Boolean)
        .join('');

      return `
        <tr style="height: 85pt;">
          <td class="cell-center">${idx + 1}</td>
          <td class="cell-text">
            <strong>${escapeHtml(item.title)}</strong><br style="mso-data-placement:same-cell;" />
            ${escapeHtml(item.compiledIssue)}
          </td>
          <td class="cell-text">${escapeHtml(imageCellInfo)}</td>
          <td class="cell-text">${escapeHtml(item.compiledRecommendation)}</td>
          <td class="cell-code">${escapeHtml(item.code)}</td>
          <td class="cell-center">${escapeHtml(item.category)}</td>
          <td class="cell-code">${escapeHtml(item.referenceModel || '-')}</td>
          <td class="cell-spec">${escapeHtml(item.referenceSpec || '-')}</td>
        </tr>
      `;
    })
    .join('');

  const excelHtml = `\uFEFF<html xmlns:o="urn:schemas-microsoft-com:office:office"
xmlns:x="urn:schemas-microsoft-com:office:excel"
xmlns="http://www.w3.org/TR/REC-html40">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=utf-8" />
  <!--[if gte mso 9]>
  <xml>
    <x:ExcelWorkbook>
      <x:ExcelWorksheets>
        <x:ExcelWorksheet>
          <x:Name>DFM報告彙整清單</x:Name>
          <x:WorksheetOptions>
            <x:DisplayGridlines/>
            <x:Print>
              <x:ValidPrinterInfo/>
              <x:PaperSizeIndex>9</x:PaperSizeIndex>
            </x:Print>
          </x:WorksheetOptions>
        </x:ExcelWorksheet>
      </x:ExcelWorksheets>
    </x:ExcelWorkbook>
  </xml>
  <![endif]-->
  <style>
    table {
      border-collapse: collapse;
      table-layout: fixed;
      width: 100%;
      font-family: "Microsoft JhengHei", "PingFang TC", Arial, sans-serif;
      font-size: 10pt;
    }
    th {
      background-color: #0f172a;
      color: #ffffff;
      font-weight: bold;
      text-align: center;
      vertical-align: middle;
      border: 0.5pt solid #334155;
      padding: 8pt 6pt;
      white-space: normal;
    }
    td {
      border: 0.5pt solid #94a3b8;
      padding: 6pt;
      vertical-align: top;
      white-space: normal;
      word-wrap: break-word;
      mso-number-format: "\\@";
    }
    .title-banner {
      background-color: #1e293b;
      color: #ffffff;
      font-size: 13pt;
      font-weight: bold;
      text-align: left;
      padding: 10pt;
      border: 0.5pt solid #0f172a;
    }
    .cell-center {
      text-align: center;
      vertical-align: middle;
      font-weight: bold;
    }
    .cell-code {
      text-align: left;
      vertical-align: middle;
      font-family: Consolas, "Courier New", monospace;
      font-weight: bold;
    }
    .cell-text {
      text-align: left;
      vertical-align: top;
      line-height: 1.5;
    }
    .cell-spec {
      text-align: left;
      vertical-align: top;
      color: #334155;
      font-size: 9.5pt;
    }
  </style>
</head>
<body>
  <table>
    <colgroup>
      <col width="55" />
      <col width="340" />
      <col width="220" />
      <col width="340" />
      <col width="130" />
      <col width="110" />
      <col width="180" />
      <col width="280" />
    </colgroup>
    <thead>
      <tr style="height: 32pt;">
        <th colspan="8" class="title-banner">
          DFM案例 報告彙整清單（產出日期：${dateStr} · 共 ${items.length} 筆檢核項目）
        </th>
      </tr>
      <tr style="height: 28pt;">
        <th>項次</th>
        <th>DFM 問題點 (Issue Description)</th>
        <th>圖片說明與標註 (Image Note)</th>
        <th>DFM 修改建議 (Recommendation)</th>
        <th>項目編號 (Code)</th>
        <th>製程分類 (Category)</th>
        <th>參考機種 (Model)</th>
        <th>參考資料與規範 (Reference / Spec)</th>
      </tr>
    </thead>
    <tbody>
      ${rowsHtml}
    </tbody>
  </table>
</body>
</html>`;

  const blob = new Blob([excelHtml], {
    type: 'application/vnd.ms-excel;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `DFM報告彙整清單_${dateStr}.xls`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
