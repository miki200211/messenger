# messenger

極致輕量、零伺服器的 Teams 風格私密聊天室：
- **前端**：純原生 HTML / CSS / ES Modules（免打包，直接託管於 GitHub Pages）
- **後端**：Google Apps Script Web App
- **資料庫**：Google Drive 內的 Google Sheets（Excel 表格形式，含 `Users`、`Channels`、`Messages` 三張工作表，後台檢視與維護一目了然）

## 核心功能
- 帳號密碼登入、顯示名稱、註冊通關碼保護（密碼經 `SHA-256 + Salt + Server Pepper` 雜湊，絕不明碼儲存）
- 自訂建立私密頻道，自動產出 6 碼邀請碼；僅頻道建立者可檢視、複製與重設代碼
- 回覆訊息（附引用預覽卡片，點擊自動捲動高亮原訊息）
- Microsoft Teams 風格 Fluent 3D 表情貼圖與懸浮快速表情列（含多層 CDN 與原生 Emoji 降級）
- 訊息收回、淺色 / 深色主題、手機 RWD、智慧增量輪詢與未讀紅點

## 部署步驟

### 1. 部署 Google Apps Script 後端
1. 前往 [Google Apps Script](https://script.google.com/) 建立新專案，貼上 `gas/Code.gs`（或本機預填版 `gas/Code.deploy.gs`）內容並存檔。
2. 於「專案設定 → 指令碼屬性 (Script Properties)」設定：
   - `DB_FOLDER_ID`：Google Drive 資料夾 ID
   - `REGISTER_CODE`：註冊通關碼
3. 在上方函式下拉選單選擇 `setupDatabase` 並按「執行」，同意授權後會自動在目標 Google Drive 資料夾建立試算表 `messenger_db`。
4. 點右上角「部署 → 新增部署作業 → 網頁應用程式」：
   - **執行身分**：我 (Me)
   - **誰可以存取**：所有人 (Anyone)
5. 複製部署產出的 `https://script.google.com/macros/s/.../exec` 網址。

### 2. 設定前端並啟用 GitHub Pages
1. 將上一步的網址填入 `js/config.js` 的 `GAS_URL` 並推送到 `main` 分支。
2. 到 GitHub Repo 的 **Settings → Pages**，將 Source 設為 `Deploy from a branch`，分支選擇 `main` / `/ (root)` 儲存即可上線。
