/**
 * Google Apps Script API 封裝
 * - 使用 Content-Type: text/plain 避開 CORS Preflight (OPTIONS)
 * - 內建逾時保護 (AbortController)、暫時性斷線自動重試（僅對冪等請求）
 */
import { getGasUrl } from './config.js?v=13';

let onUnauthorized = null;

const SAFE_RETRY_ACTIONS = new Set([
  'ping',
  'me',
  'getChannels',
  'syncMessages',
  'getImage',
  'editMessage',
  'updateChannel',
  'updateAvatar',
]);

export function setUnauthorizedHandler(fn) {
  onUnauthorized = fn;
}

export async function apiPost(action, payload = {}, options = {}) {
  const {
    token = '',
    signal = undefined,
    timeoutMs = (payload && payload.imageData) ? 45000 : 16000,
    retries = SAFE_RETRY_ACTIONS.has(action) ? 1 : 0,
  } = options;

  const url = getGasUrl();
  if (!url) {
    throw new Error('尚未設定後端 Apps Script 網址 (GAS_URL)');
  }

  const bodyObj = { action, ...payload };
  if (token) {
    bodyObj.token = token;
  }
  const serialized = JSON.stringify(bodyObj);

  let lastErr = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (signal && signal.aborted) {
      throw makeAbortError();
    }

    const ctrl = new AbortController();
    let timedOut = false;
    const onParentAbort = () => ctrl.abort();
    if (signal) signal.addEventListener('abort', onParentAbort, { once: true });

    const timer = setTimeout(() => {
      timedOut = true;
      ctrl.abort();
    }, timeoutMs);

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        redirect: 'follow',
        body: serialized,
        signal: ctrl.signal,
      });

      const text = await res.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch {
        throw new Error('後端回應格式異常，請確認 GAS 部署權限為「所有人」');
      }

      if (!data || data.ok !== true) {
        if (data && data.code === 'UNAUTHORIZED' && typeof onUnauthorized === 'function') {
          onUnauthorized(data.error || '登入已過期，請重新登入');
        }
        const apiErr = new Error((data && data.error) || '請求失敗');
        apiErr.isAppError = true;
        throw apiErr;
      }

      return data;
    } catch (err) {
      if (signal && signal.aborted) {
        throw makeAbortError();
      }
      if (err && err.isAppError) {
        throw err;
      }
      if (timedOut) {
        lastErr = new Error('連線逾時，網路或伺服器回應較慢，請稍後再試');
      } else if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        lastErr = new Error('目前沒有網路連線');
      } else {
        lastErr = new Error('網路連線不穩，正在重試…');
      }

      if (attempt < retries) {
        await sleep(600 * (attempt + 1));
        continue;
      }
      throw lastErr;
    } finally {
      clearTimeout(timer);
      if (signal) signal.removeEventListener('abort', onParentAbort);
    }
  }

  throw lastErr || new Error('請求失敗');
}

function makeAbortError() {
  const err = new Error('Aborted');
  err.name = 'AbortError';
  return err;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
