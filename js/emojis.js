/**
 * Teams 風格 Microsoft Fluent 3D 表情與貼圖清單
 * 透過 jsDelivr CDN 載入開源 @lobehub/fluent-emoji-3d（WebP 極致輕量），
 * 並內建多層備援與原生 Unicode Emoji 降級，保證永不破圖。
 */
import { CONFIG } from './config.js?v=2';

const CDN_BASES = [
  'https://cdn.jsdelivr.net/npm/@lobehub/fluent-emoji-3d/assets/',
  'https://unpkg.com/@lobehub/fluent-emoji-3d/assets/',
];

export const EMOJI_LIST = [
  // Teams 招牌快速表情 6 顆
  { id: 'thumbs_up',        char: '👍', label: '讚',       code: '1f44d', quick: true,  cat: '常用' },
  { id: 'heart',            char: '❤️', label: '愛心',     code: '2764-fe0f', altCode: '2764', quick: true, cat: '常用' },
  { id: 'laugh',            char: '😂', label: '大笑',     code: '1f602', quick: true,  cat: '常用' },
  { id: 'surprised',        char: '😮', label: '驚訝',     code: '1f62e', quick: true,  cat: '常用' },
  { id: 'sad',              char: '😢', label: '難過',     code: '1f622', quick: true,  cat: '常用' },
  { id: 'angry',            char: '😡', label: '生氣',     code: '1f621', quick: true,  cat: '常用' },

  // 延伸 Teams 3D 表情 & 大貼圖
  { id: 'salute',           char: '🫡', label: '收到',     code: '1fae1', cat: '回應' },
  { id: 'ok_hand',          char: '👌', label: 'OK',       code: '1f44c', cat: '回應' },
  { id: 'check',            char: '✅', label: '完成',     code: '2705',  cat: '回應' },
  { id: 'pray',             char: '🙏', label: '感謝',     code: '1f64f', cat: '回應' },
  { id: 'clap',             char: '👏', label: '拍手',     code: '1f44f', cat: '回應' },
  { id: 'muscle',           char: '💪', label: '加油',     code: '1f4aa', cat: '回應' },

  { id: 'rofl',             char: '🤣', label: '笑翻',     code: '1f923', cat: '情緒' },
  { id: 'heart_eyes',       char: '😍', label: '超愛',     code: '1f60d', cat: '情緒' },
  { id: 'partying_face',    char: '🥳', label: '太棒了',   code: '1f973', cat: '情緒' },
  { id: 'cool',             char: '😎', label: '帥喔',     code: '1f60e', cat: '情緒' },
  { id: 'thinking',         char: '🤔', label: '思考中',   code: '1f914', cat: '情緒' },
  { id: 'mind_blown',       char: '🤯', label: '震撼',     code: '1f92f', cat: '情緒' },
  { id: 'pleading',         char: '🥺', label: '拜託啦',   code: '1f97a', cat: '情緒' },
  { id: 'melting',          char: '🫠', label: '融化了',   code: '1fae0', cat: '情緒' },
  { id: 'sleeping',         char: '😴', label: '好睏',     code: '1f634', cat: '情緒' },
  { id: 'eyes',             char: '👀', label: '看看',     code: '1f440', cat: '情緒' },

  { id: 'fire',             char: '🔥', label: '火熱',     code: '1f525', cat: '氣氛' },
  { id: 'party',            char: '🎉', label: '慶祝',     code: '1f389', cat: '氣氛' },
  { id: 'hundred',          char: '💯', label: '滿分',     code: '1f4af', cat: '氣氛' },
  { id: 'rocket',           char: '🚀', label: '出發',     code: '1f680', cat: '氣氛' },
  { id: 'sparkles',         char: '✨', label: '閃亮亮',   code: '2728',  cat: '氣氛' },
  { id: 'coffee',           char: '☕', label: '喝咖啡',   code: '2615',  cat: '氣氛' },
  { id: 'clinking_glasses', char: '🥂', label: '乾杯',     code: '1f942', cat: '氣氛' },
  { id: 'wave',             char: '👋', label: '嗨 / 掰',  code: '1f44b', cat: '氣氛' },
];

export const EMOJI_MAP = new Map(EMOJI_LIST.map((e) => [e.id, e]));
export const QUICK_EMOJIS = EMOJI_LIST.filter((e) => e.quick);

export function getEmojiById(id) {
  return EMOJI_MAP.get(id) || { id, char: '✨', label: id, code: '2728' };
}

function getCandidateUrls(emoji) {
  const codes = [emoji.code];
  if (emoji.altCode && emoji.altCode !== emoji.code) {
    codes.push(emoji.altCode);
  }
  const urls = [];
  for (const base of CDN_BASES) {
    for (const c of codes) {
      urls.push(`${base}${c}.webp`);
    }
  }
  return urls;
}

/**
 * 建立 Fluent 3D 圖片節點，載入失敗自動切換備援 CDN，最後降級為原生 Emoji。
 */
export function createFluentImg(emojiOrId, className = 'fluent-img') {
  const emoji = typeof emojiOrId === 'string' ? getEmojiById(emojiOrId) : emojiOrId;
  const urls = getCandidateUrls(emoji);

  const img = document.createElement('img');
  img.className = className;
  img.alt = emoji.label || emoji.char;
  img.title = emoji.label || '';
  img.loading = 'lazy';
  img.decoding = 'async';
  img.draggable = false;

  let idx = 0;
  img.src = urls[0];
  img.addEventListener('error', () => {
    idx += 1;
    if (idx < urls.length) {
      img.src = urls[idx];
    } else {
      const span = document.createElement('span');
      span.className = `${className} emoji-fallback`;
      span.textContent = emoji.char || '✨';
      span.title = emoji.label || '';
      img.replaceWith(span);
    }
  });

  return img;
}

// 最近使用的貼圖 (localStorage)
const RECENT_KEY = CONFIG.STORAGE_PREFIX + 'recent_stickers';

export function getRecentStickerIds() {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list.filter((id) => EMOJI_MAP.has(id)) : [];
  } catch {
    return [];
  }
}

export function pushRecentSticker(id) {
  if (!EMOJI_MAP.has(id)) return;
  const current = getRecentStickerIds().filter((x) => x !== id);
  current.unshift(id);
  localStorage.setItem(RECENT_KEY, JSON.stringify(current.slice(0, 8)));
}
