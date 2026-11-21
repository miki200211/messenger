/**
 * Messenger 前端設定
 * 部署 Google Apps Script 網頁應用程式後，將產出的 URL 貼到 GAS_URL 即可上線。
 * 格式範例：https://script.google.com/macros/s/AKfycbxxxxxxxxxxxxxxxxxxxx/exec
 */
export const CONFIG = {
  GAS_URL: '',
  ACTIVE_POLL_MS: 2500,   // 分頁開啟中輪詢間隔 (ms)
  HIDDEN_POLL_MS: 20000,  // 切換至背景時降頻間隔 (ms)
  STORAGE_PREFIX: 'messenger_v1_',
};

export function getGasUrl() {
  if (CONFIG.GAS_URL && CONFIG.GAS_URL.trim()) {
    return CONFIG.GAS_URL.trim();
  }
  return (localStorage.getItem(CONFIG.STORAGE_PREFIX + 'gas_url') || '').trim();
}

export function setLocalGasUrl(url) {
  localStorage.setItem(CONFIG.STORAGE_PREFIX + 'gas_url', String(url || '').trim());
}
