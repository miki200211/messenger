/**
 * 頭像系統：支援自訂上傳頭像（Google Drive）與 8 款預設頭像
 * 預設頭像：黑、白、黃、綠、藍、紅 人物頭像 + 猴子 + 名稱首字
 */
import { createDriveImageEl } from './images.js?v=15';

const MONKEY_CDN_URLS = [
  'https://cdn.jsdelivr.net/npm/@lobehub/fluent-emoji-3d/assets/1f435.webp',
  'https://unpkg.com/@lobehub/fluent-emoji-3d/assets/1f435.webp',
];

export const AVATAR_PRESETS = [
  { id: 'person_black',  label: '黑人物', bg: 'linear-gradient(135deg, #2d3036, #141518)', fg: '#e5e7eb', kind: 'person' },
  { id: 'person_white',  label: '白人物', bg: 'linear-gradient(135deg, #ffffff, #e8ecf2)', fg: '#4b5563', kind: 'person', light: true },
  { id: 'person_yellow', label: '黃人物', bg: 'linear-gradient(135deg, #facc15, #eab308)', fg: '#ffffff', kind: 'person' },
  { id: 'person_green',  label: '綠人物', bg: 'linear-gradient(135deg, #22c55e, #15803d)', fg: '#ffffff', kind: 'person' },
  { id: 'person_blue',   label: '藍人物', bg: 'linear-gradient(135deg, #3b82f6, #1d4ed8)', fg: '#ffffff', kind: 'person' },
  { id: 'person_red',    label: '紅人物', bg: 'linear-gradient(135deg, #ef4444, #b91c1c)', fg: '#ffffff', kind: 'person' },
  { id: 'monkey',        label: '猴子',   bg: 'linear-gradient(135deg, #fef3c7, #fcd34d)', fg: '#78350f', kind: 'monkey' },
  { id: 'initial',       label: '名稱首字', bg: '', fg: '#ffffff', kind: 'initial' },
];

const PRESET_MAP = new Map(AVATAR_PRESETS.map((p) => [p.id, p]));

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * 乾淨的人物剪影 SVG（純 DOM 節點建立，零 XSS 風險）
 */
function createPersonSvg(fgColor) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 64 64');
  svg.setAttribute('aria-hidden', 'true');
  svg.classList.add('avatar-svg');

  const head = document.createElementNS(SVG_NS, 'circle');
  head.setAttribute('cx', '32');
  head.setAttribute('cy', '24');
  head.setAttribute('r', '11');
  head.setAttribute('fill', fgColor);

  const body = document.createElementNS(SVG_NS, 'path');
  body.setAttribute('d', 'M12 58c1.6-11.8 9.8-18.5 20-18.5S50.4 46.2 52 58z');
  body.setAttribute('fill', fgColor);

  svg.appendChild(head);
  svg.appendChild(body);
  return svg;
}

/**
 * 猴子頭像離線備援 SVG
 */
function createMonkeyFallbackSvg() {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 64 64');
  svg.setAttribute('aria-hidden', 'true');
  svg.classList.add('avatar-svg');

  const parts = [
    ['circle', { cx: '14', cy: '31', r: '9', fill: '#8b5a2b' }],
    ['circle', { cx: '50', cy: '31', r: '9', fill: '#8b5a2b' }],
    ['circle', { cx: '14', cy: '31', r: '5', fill: '#f3c69f' }],
    ['circle', { cx: '50', cy: '31', r: '5', fill: '#f3c69f' }],
    ['circle', { cx: '32', cy: '33', r: '18', fill: '#8b5a2b' }],
    ['ellipse', { cx: '32', cy: '39', rx: '14', ry: '11', fill: '#f3c69f' }],
    ['circle', { cx: '25', cy: '29', r: '7.5', fill: '#f3c69f' }],
    ['circle', { cx: '39', cy: '29', r: '7.5', fill: '#f3c69f' }],
    ['circle', { cx: '25', cy: '29', r: '2.6', fill: '#2b1810' }],
    ['circle', { cx: '39', cy: '29', r: '2.6', fill: '#2b1810' }],
    ['circle', { cx: '29.5', cy: '36.5', r: '1.3', fill: '#6b3e1f' }],
    ['circle', { cx: '34.5', cy: '36.5', r: '1.3', fill: '#6b3e1f' }],
    ['path', { d: 'M25 42q7 5 14 0', fill: 'none', stroke: '#6b3e1f', 'stroke-width': '2.4', 'stroke-linecap': 'round' }],
  ];
  for (const [tag, attrs] of parts) {
    const node = document.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
    svg.appendChild(node);
  }
  return svg;
}

function createMonkeyImg() {
  const img = document.createElement('img');
  img.className = 'avatar-monkey-img';
  img.alt = '猴子頭像';
  img.loading = 'lazy';
  img.decoding = 'async';
  img.draggable = false;

  let idx = 0;
  img.src = MONKEY_CDN_URLS[0];
  img.addEventListener('error', () => {
    idx += 1;
    if (idx < MONKEY_CDN_URLS.length) {
      img.src = MONKEY_CDN_URLS[idx];
    } else {
      img.replaceWith(createMonkeyFallbackSvg());
    }
  });
  return img;
}

/**
 * 將任意 .avatar 容器渲染成對應頭像（支援自訂上傳 / 6色人物 / 猴子 / 首字）
 */
export function renderAvatarEl(el, {
  displayName = '?',
  avatarColor = '#5B5FC7',
  avatar = '',
  token = '',
  previewDataUrl = '',
} = {}) {
  el.textContent = '';
  el.classList.remove('avatar-light', 'avatar-has-img');
  el.style.background = avatarColor || '#5B5FC7';

  // 1. 剛上傳的本機即時預覽
  if (previewDataUrl) {
    el.style.background = 'transparent';
    el.classList.add('avatar-has-img');
    const img = document.createElement('img');
    img.className = 'avatar-photo';
    img.src = previewDataUrl;
    img.alt = displayName;
    el.appendChild(img);
    return;
  }

  const val = String(avatar || '').trim();

  // 2. 自訂 Google Drive 頭像
  if (val.startsWith('drive:')) {
    const fileId = val.slice(6).trim();
    if (fileId) {
      el.style.background = 'var(--bg-surface-hover)';
      el.classList.add('avatar-has-img');
      const img = createDriveImageEl(fileId, {
        token,
        size: 256,
        className: 'avatar-photo',
        alt: displayName,
      });
      el.appendChild(img);
      return;
    }
  }

  // 3. 預設頭像（黑/白/黃/綠/藍/紅 人物頭像 & 猴子）
  if (val.startsWith('preset:')) {
    const presetId = val.slice(7).trim();
    const preset = PRESET_MAP.get(presetId);
    if (preset && preset.kind === 'person') {
      el.style.background = preset.bg;
      if (preset.light) el.classList.add('avatar-light');
      el.appendChild(createPersonSvg(preset.fg));
      return;
    }
    if (preset && preset.kind === 'monkey') {
      el.style.background = preset.bg;
      el.appendChild(createMonkeyImg());
      return;
    }
  }

  // 4. 預設名稱首字色塊
  const initial = String(displayName || '?').trim().charAt(0).toUpperCase() || '?';
  el.textContent = initial;
}
