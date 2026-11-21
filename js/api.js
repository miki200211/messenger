/**
 * Google Apps Script API 封裝
 * 使用 Content-Type: text/plain 避開 CORS Preflight (OPTIONS) 限制。
 */
import { getGasUrl } from './config.js';

let onUnauthorized = null;

export function setUnauthorizedHandler(fn) {
  onUnauthorized = fn;
}

export async function apiPost(action, payload = {}, { token = '', signal = undefined } = {}) {
  const url = getGasUrl();
  if (!url) {
    throw new Error('尚未設定後端 Apps Script 網址 (GAS_URL)');
  }

  const body = { action, ...payload };
  if (token) {
    body.token = token;
  }

  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      redirect: 'follow',
      body: JSON.stringify(body),
      signal,
    });
  } catch (err) {
    if (err && err.name === 'AbortError') throw err;
    throw new Error('無法連線到後端，請確認 GAS 網址與網路狀態');
  }

  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('後端回應格式異常，請確認 GAS 已部署為「所有人」可存取的網頁應用程式');
  }

  if (!data || data.ok !== true) {
    if (data && data.code === 'UNAUTHORIZED' && typeof onUnauthorized === 'function') {
      onUnauthorized(data.error || '登入已過期，請重新登入');
    }
    throw new Error((data && data.error) || '請求失敗');
  }

  return data;
}
