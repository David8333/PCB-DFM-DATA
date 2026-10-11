# DFM案例資料庫工作台 (DFM Case Database & Report Manager)

專為硬體工程與 PCB Layout / 製程 DFM Review 打造的模組化問題點、改善建議與動態填空報告資料庫管理工具。

## 核心功能

- **三分頁清晰架構**：
  1. **DFM案例資料庫列表**：支援關鍵字搜尋、11 大製程分類篩選（PCB Layout、SMT 組裝、插件製程、波峰焊錫、補焊製程、併板規範、零件加工、組裝製程、包裝製程、機構干涉、散熱與安規），以及案例新增、複製與刪除。
  2. **DFM案例編輯頁**：支援編輯項目編號、製程分類、參考機種、固定文字搭配 `[動態變數]` 挖空範本、圖片上傳/網址/工程圖庫與紅點標註，以及常用規範資料庫（新增、儲存、修改、刪除）。
  3. **DFM案例**：上方呈現大尺寸「DFM 問題點 ／ 圖片 ／ DFM 修改建議」橫向報告主表與「項目編號 ／ 製程分類 ／ 參考機種 ／ 參考資料」次要表格，下方提供精巧的「動態數值快速編輯」工具列，並支援一鍵複製完整報告、複製 Excel (TSV) 橫向表格列與多筆報告彙整清單。
- **本機自動儲存與 JSON 備份共享**：所有案例與規範皆自動儲存於瀏覽器 `localStorage`，並支援 `匯出 JSON` 與 `匯入 JSON` 供團隊共享。

---

## 本機開發與啟動

```bash
# 1. 安裝套件
npm install

# 2. 啟動開發伺服器 (http://localhost:3000)
npm run dev

# 3. 打包正式版 (輸出至 dist 資料夾)
npm run build
```

---

## 上傳至 GitHub 並使用 Vercel 部署步驟

### 方法一：直接從開發環境匯出或推送至 GitHub

1. **下載或同步程式碼至 GitHub**：
   - 若使用介面右上角的 **匯出 / 同步至 GitHub**（或下載 ZIP 解壓縮），請在 GitHub 建立一個新的儲存庫（Repository），例如 `dfm-case-workbench`。
   - 若在本機使用終端機上傳，請於專案目錄執行：
     ```bash
     git init
     git add .
     git commit -m "Initial commit: DFM案例資料庫工作台"
     git branch -M main
     git remote add origin https://github.com/<您的GitHub帳號>/<您的儲存庫名稱>.git
     git push -u origin main
     ```

### 方法二：在 Vercel 一鍵開啟與部署

1. 前往 [Vercel 官網 (https://vercel.com)](https://vercel.com) 並使用您的 **GitHub 帳號**登入。
2. 點擊右上角 **「Add New...」 ➔ 「Project」**。
3. 在 **Import Git Repository** 列表中找到您剛才上傳的 GitHub 專案，點擊 **「Import」**。
4. 專案內已內建 `vercel.json`，Vercel 會自動帶入以下設定（無須手動修改，亦不需設定任何環境變數）：
   - **Framework Preset**: `Vite`
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
5. 點擊 **「Deploy」**，約 30～45 秒即可完成建置，並獲得專屬的 `https://xxx.vercel.app` 正式網址！
