/**
 * 圖片壓縮、剪貼簿/檔案處理與 Google Drive 圖片三層備援載入模組
 */
import { apiPost } from './api.js?v=15';

const MAX_DIMENSION = 1200;
const AVATAR_SIZE = 256;
const MAX_GIF_BYTES = 2.5 * 1024 * 1024;
const MAX_AVATAR_GIF_BYTES = 900 * 1024;
const MAX_UPLOAD_BASE64 = 4500000; // 約 3.3 MB

// 記住本機剛上傳或透過 getImage 取得的 dataUrl，避免重複讀取與閃爍
const localImageCache = new Map();

export function cacheImageDataUrl(fileId, dataUrl) {
  if (!fileId || !dataUrl) return;
  localImageCache.set(fileId, dataUrl);
  // 控制快取上限避免佔用過多記憶體
  if (localImageCache.size > 40) {
    const firstKey = localImageCache.keys().next().value;
    localImageCache.delete(firstKey);
  }
}

export function getCachedImageDataUrl(fileId) {
  return localImageCache.get(fileId) || '';
}

export function parseImageContent(content) {
  if (!content) return { fileId: '', caption: '', width: 0, height: 0, mime: '' };
  if (typeof content === 'object') return content;
  try {
    const obj = JSON.parse(content);
    return {
      fileId: String(obj.fileId || ''),
      caption: String(obj.caption || ''),
      width: Number(obj.width || 0),
      height: Number(obj.height || 0),
      mime: String(obj.mime || ''),
    };
  } catch {
    return { fileId: '', caption: '', width: 0, height: 0, mime: '' };
  }
}

/**
 * 將使用者上傳或 Ctrl+V 貼上的圖片檔案壓縮成適合上傳 Google Drive 的格式
 */
export async function processImageFile(file) {
  if (!file || !file.type || !file.type.startsWith('image/')) {
    throw new Error('請選擇有效的圖片檔案');
  }

  // GIF 保留原始動畫不經 canvas 重編碼
  if (file.type === 'image/gif') {
    if (file.size > MAX_GIF_BYTES) {
      throw new Error('GIF 動圖大小請控制在 2.5 MB 以內');
    }
    const dataUrl = await readAsDataURL(file);
    const dims = await measureImage(dataUrl);
    const base64 = stripDataUrlPrefix(dataUrl);
    return {
      dataUrl,
      base64,
      mime: 'image/gif',
      width: dims.width,
      height: dims.height,
      sizeBytes: file.size,
      name: file.name || 'GIF 圖片',
    };
  }

  const decoded = await decodeImageSource(file);
  try {
    let w = decoded.width;
    let h = decoded.height;
    if (w > MAX_DIMENSION || h > MAX_DIMENSION) {
      const ratio = Math.min(MAX_DIMENSION / w, MAX_DIMENSION / h);
      w = Math.max(1, Math.round(w * ratio));
      h = Math.max(1, Math.round(h * ratio));
    }

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('瀏覽器無法處理圖片');
    ctx.drawImage(decoded.source, 0, 0, w, h);

    // 非同步編碼成輕量 WebP (0.78)，不阻塞主執行緒且大幅縮短上傳時間
    let encoded = await encodeCanvasAsync(canvas, 'image/webp', 0.78);
    if (!encoded.dataUrl.startsWith('data:image/webp')) {
      encoded = await encodeCanvasAsync(canvas, 'image/jpeg', 0.80);
    }

    let { dataUrl, mime } = encoded;
    let base64 = stripDataUrlPrefix(dataUrl);
    if (base64.length > MAX_UPLOAD_BASE64) {
      encoded = await encodeCanvasAsync(canvas, mime, 0.62);
      dataUrl = encoded.dataUrl;
      base64 = stripDataUrlPrefix(dataUrl);
    }
    if (base64.length > MAX_UPLOAD_BASE64) {
      throw new Error('圖片壓縮後仍超過 3.3 MB 上限，請換一張較小的圖片');
    }

    const sizeBytes = Math.round((base64.length * 3) / 4);
    return {
      dataUrl,
      base64,
      mime,
      width: w,
      height: h,
      sizeBytes,
      name: file.name || '剪貼簿圖片',
    };
  } finally {
    decoded.cleanup();
  }
}

/**
 * 將使用者上傳的頭像自動置中裁切為 256×256 正方形（GIF 保留動圖）
 */
export async function processAvatarFile(file) {
  if (!file || !file.type || !file.type.startsWith('image/')) {
    throw new Error('請選擇有效的圖片檔案');
  }

  if (file.type === 'image/gif') {
    if (file.size > MAX_AVATAR_GIF_BYTES) {
      throw new Error('GIF 頭像大小請控制在 900 KB 以內');
    }
    const dataUrl = await readAsDataURL(file);
    return { dataUrl, base64: stripDataUrlPrefix(dataUrl), mime: 'image/gif' };
  }

  const decoded = await decodeImageSource(file);
  try {
    const side = Math.min(decoded.width, decoded.height);
    const sx = Math.round((decoded.width - side) / 2);
    const sy = Math.round((decoded.height - side) / 2);

    const canvas = document.createElement('canvas');
    canvas.width = AVATAR_SIZE;
    canvas.height = AVATAR_SIZE;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('瀏覽器無法處理頭像圖片');
    ctx.drawImage(decoded.source, sx, sy, side, side, 0, 0, AVATAR_SIZE, AVATAR_SIZE);

    let encoded = await encodeCanvasAsync(canvas, 'image/webp', 0.85);
    if (!encoded.dataUrl.startsWith('data:image/webp')) {
      encoded = await encodeCanvasAsync(canvas, 'image/jpeg', 0.85);
    }

    return {
      dataUrl: encoded.dataUrl,
      base64: stripDataUrlPrefix(encoded.dataUrl),
      mime: encoded.mime,
    };
  } finally {
    decoded.cleanup();
  }
}

async function decodeImageSource(file) {
  if (typeof createImageBitmap === 'function') {
    try {
      const bmp = await createImageBitmap(file);
      return {
        source: bmp,
        width: bmp.width,
        height: bmp.height,
        cleanup: () => bmp.close(),
      };
    } catch {
      // fallback to HTMLImageElement
    }
  }
  const objUrl = URL.createObjectURL(file);
  try {
    const img = await loadHtmlImage(objUrl);
    return {
      source: img,
      width: img.naturalWidth,
      height: img.naturalHeight,
      cleanup: () => URL.revokeObjectURL(objUrl),
    };
  } catch (err) {
    URL.revokeObjectURL(objUrl);
    throw err;
  }
}

async function encodeCanvasAsync(canvas, mime, quality) {
  if (typeof canvas.toBlob === 'function') {
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, mime, quality));
    if (blob) {
      const dataUrl = await readAsDataURL(blob);
      return { dataUrl, mime: blob.type || mime };
    }
  }
  const dataUrl = canvas.toDataURL(mime, quality);
  return { dataUrl, mime };
}

/**
 * 建立聊天室圖片節點：
 * 1. 本機快取 / 樂觀預覽
 * 2. Google Drive CDN (lh3.googleusercontent.com)
 * 3. Google Drive Thumbnail API
 * 4. 後端 getImage Base64 備援（確保即使限制公開分享仍 100% 顯示）
 */
export function createDriveImageEl(fileId, {
  token = '',
  size = 1200,
  className = 'msg-image',
  alt = '圖片',
  previewUrl = '',
} = {}) {
  const img = document.createElement('img');
  img.className = className;
  img.alt = alt;
  img.loading = 'lazy';
  img.decoding = 'async';

  const cached = previewUrl || getCachedImageDataUrl(fileId);
  if (cached) {
    img.src = cached;
    return img;
  }

  if (!fileId) {
    img.classList.add('img-broken');
    return img;
  }

  const urls = [
    `https://lh3.googleusercontent.com/d/${encodeURIComponent(fileId)}=w${size}`,
    `https://drive.google.com/thumbnail?id=${encodeURIComponent(fileId)}&sz=w${size}`,
  ];

  let step = 0;
  let triedApiFallback = false;
  img.src = urls[0];

  img.addEventListener('error', async () => {
    step += 1;
    if (step < urls.length) {
      img.src = urls[step];
      return;
    }
    if (!triedApiFallback && token) {
      triedApiFallback = true;
      try {
        const res = await apiPost('getImage', { fileId }, { token });
        if (res.dataUrl) {
          cacheImageDataUrl(fileId, res.dataUrl);
          img.src = res.dataUrl;
          return;
        }
      } catch {
        // fall through to broken state
      }
    }
    const placeholder = document.createElement('div');
    placeholder.className = 'msg-image-error';
    placeholder.textContent = '🖼️ 圖片暫時無法載入';
    img.replaceWith(placeholder);
  });

  return img;
}

export function formatBytes(bytes) {
  if (!bytes || bytes < 1024) return `${bytes || 0} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function stripDataUrlPrefix(dataUrl) {
  const idx = dataUrl.indexOf(',');
  return idx !== -1 ? dataUrl.slice(idx + 1) : dataUrl;
}

function readAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('讀取圖片失敗'));
    reader.readAsDataURL(file);
  });
}

function loadHtmlImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('圖片格式無法解析'));
    img.src = src;
  });
}

async function measureImage(src) {
  try {
    const img = await loadHtmlImage(src);
    return { width: img.naturalWidth || 0, height: img.naturalHeight || 0 };
  } catch {
    return { width: 0, height: 0 };
  }
}
