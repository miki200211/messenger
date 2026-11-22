/**
 * 瀏覽器桌面通知（跳出視窗）與 Web Audio 提示音模組
 * 零外部音檔相依，使用 Web Notifications API + Web Audio API。
 */
import { CONFIG } from './config.js?v=15';

const NOTIFY_KEY = CONFIG.STORAGE_PREFIX + 'notify_enabled';

let audioCtx = null;
let cachedIconUrl = '';

export function isBrowserNotificationSupported() {
  return typeof window !== 'undefined' && 'Notification' in window;
}

export function isNotifyEnabled() {
  const pref = localStorage.getItem(NOTIFY_KEY) === '1';
  if (!pref) return false;
  if (isBrowserNotificationSupported() && Notification.permission === 'denied') {
    return false;
  }
  return true;
}

export function getNotifyPermission() {
  if (!isBrowserNotificationSupported()) return 'unsupported';
  return Notification.permission; // 'default' | 'granted' | 'denied'
}

/**
 * 點擊鈴鐺時呼叫（需在使用者點擊手勢中觸發以符合瀏覽器授權規定）
 */
export async function toggleNotifications() {
  unlockAudio();

  if (isNotifyEnabled()) {
    localStorage.setItem(NOTIFY_KEY, '0');
    return { enabled: false, type: 'info', message: '已關閉訊息通知與提示音' };
  }

  if (!isBrowserNotificationSupported()) {
    localStorage.setItem(NOTIFY_KEY, '1');
    playChime();
    return {
      enabled: true,
      type: 'info',
      message: '此瀏覽器不支援桌面彈窗，已開啟頁內提示音',
    };
  }

  let perm = Notification.permission;
  if (perm === 'default') {
    try {
      perm = await Notification.requestPermission();
    } catch {
      perm = Notification.permission;
    }
  }

  if (perm === 'granted') {
    localStorage.setItem(NOTIFY_KEY, '1');
    playChime();
    showDesktopPopup({
      title: 'Messenger 通知已開啟',
      body: '有新訊息時瀏覽器會跳出提醒視窗並播放提示音！',
      tag: 'messenger-test',
    });
    return { enabled: true, type: 'success', message: '已開啟瀏覽器跳出通知與提示音！' };
  }

  if (perm === 'denied') {
    localStorage.setItem(NOTIFY_KEY, '0');
    return {
      enabled: false,
      type: 'error',
      message: '瀏覽器已封鎖通知，請點網址列左側圖示將「通知」改為允許',
    };
  }

  return { enabled: false, type: 'info', message: '尚未授權瀏覽器通知' };
}

/**
 * 收到他人新訊息時呼叫
 */
export function notifyIncomingMessage({ title, body, tag, onClick, popup = true }) {
  if (!isNotifyEnabled()) return;

  playChime();

  if (popup && isBrowserNotificationSupported() && Notification.permission === 'granted') {
    showDesktopPopup({ title, body, tag, onClick });
  }
}

function showDesktopPopup({ title, body, tag, onClick }) {
  try {
    const n = new Notification(title, {
      body: body || '',
      icon: getNotificationIconDataUrl(),
      tag: tag || 'messenger-msg',
      renotify: true,
      silent: true, // 由我們自訂溫和的 Web Audio 提示音，避免系統雙重音效
    });

    n.onclick = () => {
      try {
        window.focus();
      } catch {
        // ignore
      }
      if (typeof onClick === 'function') onClick();
      n.close();
    };

    // 6 秒後自動收起，避免通知列堆積
    setTimeout(() => n.close(), 6000);
  } catch {
    // 行動裝置瀏覽器不支援直接 new Notification() 時靜默忽略
  }
}

/**
 * 解鎖並播放輕柔的 Teams 風格雙音提示聲
 */
export function unlockAudio() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    if (!audioCtx) audioCtx = new AudioCtx();
    if (audioCtx.state === 'suspended') {
      audioCtx.resume().catch(() => {});
    }
  } catch {
    // ignore
  }
}

export function playChime() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    if (!audioCtx) audioCtx = new AudioCtx();
    if (audioCtx.state === 'suspended') {
      audioCtx.resume().catch(() => {});
    }

    const now = audioCtx.currentTime;
    playTone(audioCtx, 880, now, 0.11, 0.11);        // A5
    playTone(audioCtx, 1174.66, now + 0.09, 0.16, 0.1); // D6
  } catch {
    // ignore
  }
}

function playTone(ctx, freq, startTime, duration, peakGain) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(freq, startTime);

  gain.gain.setValueAtTime(0.0001, startTime);
  gain.gain.exponentialRampToValueAtTime(peakGain, startTime + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(startTime);
  osc.stop(startTime + duration + 0.02);
}

/**
 * 產生 64x64 PNG Data URL 作為系統桌面通知圖示（相容 Windows / Chrome / Edge）
 */
function getNotificationIconDataUrl() {
  if (cachedIconUrl) return cachedIconUrl;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';

    // Teams Indigo 圓角底
    ctx.fillStyle = '#5B5FC7';
    ctx.beginPath();
    ctx.roundRect(0, 0, 64, 64, 16);
    ctx.fill();

    // 白色對話氣泡
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.roundRect(14, 18, 36, 24, 6);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(22, 40);
    ctx.lineTo(18, 50);
    ctx.lineTo(31, 42);
    ctx.closePath();
    ctx.fill();

    cachedIconUrl = canvas.toDataURL('image/png');
    return cachedIconUrl;
  } catch {
    return '';
  }
}
