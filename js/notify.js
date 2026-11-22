/**
 * 瀏覽器桌面通知（跳出視窗）、Web Audio 提示音與通知顯示格式模組
 */
import { CONFIG } from './config.js?v=17';

const NOTIFY_KEY = CONFIG.STORAGE_PREFIX + 'notify_enabled';
const SOUND_KEY = CONFIG.STORAGE_PREFIX + 'notify_sound';
const TIMING_KEY = CONFIG.STORAGE_PREFIX + 'notify_timing';
const RECEIVER_PRIVACY_KEY = CONFIG.STORAGE_PREFIX + 'notify_rx_privacy';

let audioCtx = null;
let cachedIconUrl = '';

export function isBrowserNotificationSupported() {
  return typeof window !== 'undefined' && 'Notification' in window;
}

export function getNotifyPermission() {
  if (!isBrowserNotificationSupported()) return 'unsupported';
  return Notification.permission; // 'default' | 'granted' | 'denied'
}

export function getLocalNotifySettings() {
  const desktopPref = localStorage.getItem(NOTIFY_KEY) === '1';
  const perm = getNotifyPermission();
  const desktopEnabled = desktopPref && perm !== 'denied';

  const soundRaw = localStorage.getItem(SOUND_KEY);
  const soundEnabled = soundRaw === null ? true : soundRaw === '1';

  const timingRaw = localStorage.getItem(TIMING_KEY);
  const popupTiming = timingRaw === 'background' ? 'background' : 'always';

  const rxRaw = localStorage.getItem(RECEIVER_PRIVACY_KEY);
  const receiverPrivacy = rxRaw === 'hide' ? 'hide' : 'follow';

  return {
    desktopEnabled,
    soundEnabled,
    popupTiming,
    receiverPrivacy,
    permission: perm,
  };
}

export function saveLocalNotifySettings({
  desktopEnabled,
  soundEnabled,
  popupTiming,
  receiverPrivacy,
}) {
  if (typeof desktopEnabled === 'boolean') {
    localStorage.setItem(NOTIFY_KEY, desktopEnabled ? '1' : '0');
  }
  if (typeof soundEnabled === 'boolean') {
    localStorage.setItem(SOUND_KEY, soundEnabled ? '1' : '0');
  }
  if (popupTiming === 'always' || popupTiming === 'background') {
    localStorage.setItem(TIMING_KEY, popupTiming);
  }
  if (receiverPrivacy === 'follow' || receiverPrivacy === 'hide') {
    localStorage.setItem(RECEIVER_PRIVACY_KEY, receiverPrivacy);
  }
}

export function isNotifyEnabled() {
  return getLocalNotifySettings().desktopEnabled;
}

/**
 * 請求瀏覽器通知授權（必須在使用者點擊事件中呼叫）
 */
export async function requestBrowserPermission() {
  unlockAudio();
  if (!isBrowserNotificationSupported()) {
    return 'unsupported';
  }
  let perm = Notification.permission;
  if (perm === 'default') {
    try {
      perm = await Notification.requestPermission();
    } catch {
      perm = Notification.permission;
    }
  }
  return perm;
}

/**
 * 點擊頂部鈴鐺時呼叫
 */
export async function toggleNotifications() {
  unlockAudio();

  if (isNotifyEnabled()) {
    localStorage.setItem(NOTIFY_KEY, '0');
    return { enabled: false, type: 'info', message: '已關閉瀏覽器跳出通知' };
  }

  if (!isBrowserNotificationSupported()) {
    localStorage.setItem(NOTIFY_KEY, '1');
    if (getLocalNotifySettings().soundEnabled) playChime();
    return {
      enabled: true,
      type: 'info',
      message: '此瀏覽器不支援桌面彈窗，已開啟頁內提示音',
    };
  }

  const perm = await requestBrowserPermission();

  if (perm === 'granted') {
    localStorage.setItem(NOTIFY_KEY, '1');
    if (getLocalNotifySettings().soundEnabled) playChime();
    showDesktopPopup({
      title: 'Messenger 通知已開啟',
      body: '有新訊息時瀏覽器會跳出提醒視窗！',
      tag: 'messenger-test',
    });
    return { enabled: true, type: 'success', message: '已開啟瀏覽器跳出通知！' };
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
 * 在設定視窗點擊「測試跳出視窗」
 */
export async function testBrowserPopup({ title, body }) {
  unlockAudio();
  const settings = getLocalNotifySettings();
  if (settings.soundEnabled) playChime();

  if (!isBrowserNotificationSupported()) {
    return {
      ok: false,
      permission: 'unsupported',
      message: '目前瀏覽器不支援桌面通知 API',
    };
  }

  const perm = await requestBrowserPermission();
  if (perm === 'denied') {
    return {
      ok: false,
      permission: 'denied',
      message: '通知權限已被瀏覽器封鎖，請點網址列左側圖示改為「允許」後再試',
    };
  }
  if (perm !== 'granted') {
    return {
      ok: false,
      permission: perm,
      message: '尚未允許瀏覽器通知權限',
    };
  }

  const res = showDesktopPopup({
    title: title || 'Messenger 測試通知',
    body: body || '這是一則測試跳出視窗！',
    tag: 'messenger-preview-' + Date.now(),
  });

  if (!res.shown) {
    return {
      ok: false,
      permission: perm,
      message: '此裝置瀏覽器限制直接彈出桌面通知（常見於手機瀏覽器）',
    };
  }

  return {
    ok: true,
    permission: perm,
    message: '已送出瀏覽器跳出視窗！（若沒看到請確認系統未開啟勿擾模式）',
  };
}

/**
 * 依據發送者的「對方收到通知設定」＋本機隱私設定，組合出實際跳出的標題與內文
 */
export function formatIncomingNotification({
  senderPrefs,
  senderName,
  channelName,
  rawBody,
  forceHideContent = false,
}) {
  const prefs = (senderPrefs && typeof senderPrefs === 'object') ? senderPrefs : {};
  const mode = prefs.mode || 'normal';
  const name = senderName || '朋友';
  const ch = channelName || 'Messenger';

  if (mode === 'custom') {
    const customTitle = applyVars(prefs.title || '系統提醒', name, ch);
    const customBody = applyVars(prefs.body || '您有一則新通知，請點擊查看', name, ch);
    return { title: customTitle, body: customBody };
  }

  if (mode === 'hidden') {
    return {
      title: `${name}（# ${ch}）`,
      body: prefs.body || '收到一則新訊息',
    };
  }

  // mode === 'normal'
  const settings = getLocalNotifySettings();
  const hideLocal = forceHideContent || settings.receiverPrivacy === 'hide';
  return {
    title: `${name}（# ${ch}）`,
    body: hideLocal ? '收到一則新訊息' : (rawBody || '收到一則新訊息'),
  };
}

function applyVars(template, senderName, channelName) {
  return String(template || '')
    .replace(/\{name\}/gi, senderName)
    .replace(/\{channel\}/gi, channelName);
}

/**
 * 收到他人新訊息時呼叫
 */
export function notifyIncomingMessage({
  title,
  body,
  tag,
  onClick,
  isUnfocused = true,
  onFallbackPopup,
}) {
  const settings = getLocalNotifySettings();

  if (settings.desktopEnabled && settings.soundEnabled) {
    playChime();
  }

  if (!settings.desktopEnabled) return;
  if (settings.popupTiming === 'background' && !isUnfocused) return;

  if (isBrowserNotificationSupported() && Notification.permission === 'granted') {
    const res = showDesktopPopup({ title, body, tag, onClick });
    if (!res.shown && typeof onFallbackPopup === 'function') {
      onFallbackPopup({ title, body });
    }
  } else if (typeof onFallbackPopup === 'function') {
    onFallbackPopup({ title, body });
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

    setTimeout(() => n.close(), 7000);
    return { shown: true };
  } catch (err) {
    return { shown: false, error: err && err.message ? err.message : String(err) };
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

    ctx.fillStyle = '#5B5FC7';
    ctx.beginPath();
    ctx.roundRect(0, 0, 64, 64, 16);
    ctx.fill();

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
