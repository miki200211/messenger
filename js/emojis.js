/**
 * Teams 風格 Microsoft Fluent 3D 表情與貼圖清單（88 款）
 * 透過 jsDelivr CDN 載入開源 @lobehub/fluent-emoji-3d（WebP 極致輕量），
 * 並內建多層備援與原生 Unicode Emoji 降級，保證永不破圖。
 */
import { CONFIG } from './config.js?v=10';

const CDN_BASES = [
  'https://cdn.jsdelivr.net/npm/@lobehub/fluent-emoji-3d/assets/',
  'https://unpkg.com/@lobehub/fluent-emoji-3d/assets/',
];

export const EMOJI_CATEGORIES = ['常用', '回應', '情緒', '上班', '吃喝', '氣氛'];

export const EMOJI_LIST = [
  // ==================== 常用 (8) ====================
  { id: 'thumbs_up',        char: '👍', label: '讚',       code: '1f44d', quick: true,  cat: '常用' },
  { id: 'heart',            char: '❤️', label: '愛心',     code: '2764-fe0f', altCode: '2764', quick: true, cat: '常用' },
  { id: 'laugh',            char: '😂', label: '大笑',     code: '1f602', quick: true,  cat: '常用' },
  { id: 'surprised',        char: '😮', label: '驚訝',     code: '1f62e', quick: true,  cat: '常用' },
  { id: 'sad',              char: '😢', label: '難過',     code: '1f622', quick: true,  cat: '常用' },
  { id: 'angry',            char: '😡', label: '生氣',     code: '1f621', quick: true,  cat: '常用' },
  { id: 'rofl',             char: '🤣', label: '笑翻',     code: '1f923', cat: '常用' },
  { id: 'heart_eyes',       char: '😍', label: '超愛',     code: '1f60d', cat: '常用' },

  // ==================== 回應 (14) ====================
  { id: 'salute',           char: '🫡', label: '收到',     code: '1fae1', cat: '回應' },
  { id: 'ok_hand',          char: '👌', label: 'OK',       code: '1f44c', cat: '回應' },
  { id: 'check',            char: '✅', label: '完成',     code: '2705',  cat: '回應' },
  { id: 'pray',             char: '🙏', label: '感謝',     code: '1f64f', cat: '回應' },
  { id: 'clap',             char: '👏', label: '拍手',     code: '1f44f', cat: '回應' },
  { id: 'muscle',           char: '💪', label: '加油',     code: '1f4aa', cat: '回應' },
  { id: 'raised_hands',     char: '🙌', label: '太讚了',   code: '1f64c', cat: '回應' },
  { id: 'handshake',        char: '🤝', label: '成交',     code: '1f91d', cat: '回應' },
  { id: 'victory',          char: '✌️', label: '耶',       code: '270c-fe0f', altCode: '270c', cat: '回應' },
  { id: 'crossed_fingers',  char: '🤞', label: '祈禱',     code: '1f91e', cat: '回應' },
  { id: 'heart_hands',      char: '🫶', label: '比心',     code: '1faf6', cat: '回應' },
  { id: 'fist_bump',        char: '👊', label: '碰拳',     code: '1f44a', cat: '回應' },
  { id: 'thumbs_down',      char: '👎', label: '不行',     code: '1f44e', cat: '回應' },
  { id: 'wave',             char: '👋', label: '嗨 / 掰',  code: '1f44b', cat: '回應' },

  // ==================== 情緒 (24) ====================
  { id: 'partying_face',    char: '🥳', label: '太棒了',   code: '1f973', cat: '情緒' },
  { id: 'cool',             char: '😎', label: '帥喔',     code: '1f60e', cat: '情緒' },
  { id: 'star_struck',      char: '🤩', label: '崇拜',     code: '1f929', cat: '情緒' },
  { id: 'smiling_hearts',   char: '🥰', label: '幸福',     code: '1f970', cat: '情緒' },
  { id: 'holding_tears',    char: '🥹', label: '感動',     code: '1f979', cat: '情緒' },
  { id: 'hugging',          char: '🤗', label: '抱抱',     code: '1f917', cat: '情緒' },
  { id: 'innocent',         char: '😇', label: '乖巧',     code: '1f607', cat: '情緒' },
  { id: 'wink',             char: '😉', label: '眨眼',     code: '1f609', cat: '情緒' },
  { id: 'yummy',            char: '😋', label: '好吃',     code: '1f60b', cat: '情緒' },
  { id: 'zany_wink',        char: '😜', label: '調皮',     code: '1f61c', cat: '情緒' },
  { id: 'hand_over_mouth',  char: '🤭', label: '偷笑',     code: '1f92d', cat: '情緒' },
  { id: 'shushing',         char: '🤫', label: '噓',       code: '1f92b', cat: '情緒' },
  { id: 'thinking',         char: '🤔', label: '思考中',   code: '1f914', cat: '情緒' },
  { id: 'raised_eyebrow',   char: '🤨', label: '懷疑',     code: '1f928', cat: '情緒' },
  { id: 'eye_roll',         char: '🙄', label: '白眼',     code: '1f644', cat: '情緒' },
  { id: 'sweat_smile',      char: '😅', label: '尷尬笑',   code: '1f605', cat: '情緒' },
  { id: 'upside_down',      char: '🙃', label: '微笑無奈', code: '1f643', cat: '情緒' },
  { id: 'pleading',         char: '🥺', label: '拜託啦',   code: '1f97a', cat: '情緒' },
  { id: 'sob',              char: '😭', label: '大哭',     code: '1f62d', cat: '情緒' },
  { id: 'scream',           char: '😱', label: '嚇死',     code: '1f631', cat: '情緒' },
  { id: 'flushed',          char: '😳', label: '害羞',     code: '1f633', cat: '情緒' },
  { id: 'mind_blown',       char: '🤯', label: '震撼',     code: '1f92f', cat: '情緒' },
  { id: 'melting',          char: '🫠', label: '融化了',   code: '1fae0', cat: '情緒' },
  { id: 'peeking',          char: '🫣', label: '偷看',     code: '1fae3', cat: '情緒' },

  // ==================== 上班 (14) ====================
  { id: 'sleeping',         char: '😴', label: '好睏',     code: '1f634', cat: '上班' },
  { id: 'yawning',          char: '🥱', label: '打哈欠',   code: '1f971', cat: '上班' },
  { id: 'hot_face',         char: '🥵', label: '累爆',     code: '1f975', cat: '上班' },
  { id: 'cold_face',        char: '🥶', label: '好冷',     code: '1f976', cat: '上班' },
  { id: 'sick',             char: '🤒', label: '不舒服',   code: '1f912', cat: '上班' },
  { id: 'zipper_mouth',     char: '🤐', label: '閉嘴',     code: '1f910', cat: '上班' },
  { id: 'eyes',             char: '👀', label: '看看',     code: '1f440', cat: '上班' },
  { id: 'laptop',           char: '💻', label: '工作中',   code: '1f4bb', cat: '上班' },
  { id: 'bulb',             char: '💡', label: '有點子',   code: '1f4a1', cat: '上班' },
  { id: 'chart_up',         char: '📈', label: '起飛',     code: '1f4c8', cat: '上班' },
  { id: 'money_bag',        char: '💰', label: '發財',     code: '1f4b0', cat: '上班' },
  { id: 'siren',            char: '🚨', label: '緊急',     code: '1f6a8', cat: '上班' },
  { id: 'megaphone',        char: '📢', label: '公告',     code: '1f4e2', cat: '上班' },
  { id: 'zzz',              char: '💤', label: '下線睡覺', code: '1f4a4', cat: '上班' },

  // ==================== 吃喝 (12) ====================
  { id: 'coffee',           char: '☕', label: '喝咖啡',   code: '2615',  cat: '吃喝' },
  { id: 'boba',             char: '🧋', label: '喝珍奶',   code: '1f9cb', cat: '吃喝' },
  { id: 'clinking_glasses', char: '🥂', label: '乾杯',     code: '1f942', cat: '吃喝' },
  { id: 'beer',             char: '🍺', label: '喝一杯',   code: '1f37a', cat: '吃喝' },
  { id: 'pizza',            char: '🍕', label: '吃披薩',   code: '1f355', cat: '吃喝' },
  { id: 'burger',           char: '🍔', label: '吃漢堡',   code: '1f354', cat: '吃喝' },
  { id: 'ramen',            char: '🍜', label: '吃拉麵',   code: '1f35c', cat: '吃喝' },
  { id: 'sushi',            char: '🍣', label: '吃壽司',   code: '1f363', cat: '吃喝' },
  { id: 'cake',             char: '🎂', label: '生日快樂', code: '1f382', cat: '吃喝' },
  { id: 'gift',             char: '🎁', label: '送禮物',   code: '1f381', cat: '吃喝' },
  { id: 'gamepad',          char: '🎮', label: '開打',     code: '1f3ae', cat: '吃喝' },
  { id: 'trophy',           char: '🏆', label: '冠軍',     code: '1f3c6', cat: '吃喝' },

  // ==================== 氣氛 (16) ====================
  { id: 'fire',             char: '🔥', label: '火熱',     code: '1f525', cat: '氣氛' },
  { id: 'party',            char: '🎉', label: '慶祝',     code: '1f389', cat: '氣氛' },
  { id: 'hundred',          char: '💯', label: '滿分',     code: '1f4af', cat: '氣氛' },
  { id: 'rocket',           char: '🚀', label: '出發',     code: '1f680', cat: '氣氛' },
  { id: 'sparkles',         char: '✨', label: '閃亮亮',   code: '2728',  cat: '氣氛' },
  { id: 'boom',             char: '💥', label: '炸裂',     code: '1f4a5', cat: '氣氛' },
  { id: 'sparkling_heart',  char: '💖', label: '粉紅愛心', code: '1f496', cat: '氣氛' },
  { id: 'broken_heart',     char: '💔', label: '心碎',     code: '1f494', cat: '氣氛' },
  { id: 'cat',              char: '🐱', label: '貓貓',     code: '1f431', cat: '氣氛' },
  { id: 'dog',              char: '🐶', label: '狗狗',     code: '1f436', cat: '氣氛' },
  { id: 'panda',            char: '🐼', label: '熊貓',     code: '1f43c', cat: '氣氛' },
  { id: 'fox',              char: '🦊', label: '狐狸',     code: '1f98a', cat: '氣氛' },
  { id: 'penguin',          char: '🐧', label: '企鵝',     code: '1f427', cat: '氣氛' },
  { id: 'see_no_evil',      char: '🙈', label: '沒看到',   code: '1f648', cat: '氣氛' },
  { id: 'ghost',            char: '👻', label: '幽靈',     code: '1f47b', cat: '氣氛' },
  { id: 'poop',             char: '💩', label: '便便',     code: '1f4a9', cat: '氣氛' },
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
