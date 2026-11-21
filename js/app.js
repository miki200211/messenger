import { CONFIG, getGasUrl } from './config.js?v=8';
import { apiPost, setUnauthorizedHandler } from './api.js?v=8';
import {
  EMOJI_CATEGORIES,
  EMOJI_LIST,
  QUICK_EMOJIS,
  getEmojiById,
  createFluentImg,
  getRecentStickerIds,
  pushRecentSticker,
} from './emojis.js?v=8';
import {
  isNotifyEnabled,
  getNotifyPermission,
  toggleNotifications,
  notifyIncomingMessage,
  unlockAudio,
} from './notify.js?v=8';
import {
  parseImageContent,
  processImageFile,
  processAvatarFile,
  createDriveImageEl,
  cacheImageDataUrl,
  getCachedImageDataUrl,
  formatBytes,
} from './images.js?v=8';
import {
  AVATAR_PRESETS,
  renderAvatarEl,
} from './avatars.js?v=8';

const SESSION_KEY = CONFIG.STORAGE_PREFIX + 'session';
const READ_KEY = CONFIG.STORAGE_PREFIX + 'last_read';
const THEME_KEY = CONFIG.STORAGE_PREFIX + 'theme';
const LAST_CHANNEL_KEY = CONFIG.STORAGE_PREFIX + 'last_channel';
const PRIVACY_KEY = CONFIG.STORAGE_PREFIX + 'privacy_mirror';

const AVATAR_PALETTE = [
  '#5B5FC7', '#2D7D9A', '#038387', '#498205', '#C239B3',
  '#CA5010', '#8764B8', '#0078D4', '#D13438', '#4F6BED',
];

// ==================== 應用程式狀態 ====================
const state = {
  token: '',
  user: null,
  userProfiles: {},             // userId -> { displayName, avatarColor, avatar }
  channels: [],
  currentChannelId: null,
  messagesByChannel: new Map(), // channelId -> Map<msgId, msg>
  channelVersion: new Map(),    // channelId -> number (僅由 syncMessages 更新)
  channelLastMsgAt: new Map(),  // channelId -> number (追蹤其他頻道新訊息通知)
  globalVersion: 0,
  lastRead: loadJson(READ_KEY, {}),
  unreadTitleCount: 0,
  privacyMirror: false,
  avatarDraft: null,            // { mode: 'preset', presetId } | { mode: 'upload', processed }
  replyTarget: null,            // { id, senderName, type, preview, fileId }
  editTarget: null,             // { id, type, originalText }
  pendingImage: null,           // { dataUrl, base64, mime, width, height, sizeBytes, name }
  dragDepth: 0,
  pickerMode: 'sticker',
  pickerCategory: '全部',
  reactionPickerMsgId: null,
  pollTimer: null,
  syncInFlight: false,
  syncAbort: null,
};

// ==================== DOM 參照 ====================
const $ = (id) => document.getElementById(id);

const els = {
  authView: $('auth-view'),
  appView: $('app-view'),

  tabLogin: $('tab-login'),
  tabRegister: $('tab-register'),
  loginForm: $('login-form'),
  registerForm: $('register-form'),
  loginUsername: $('login-username'),
  loginPassword: $('login-password'),
  loginError: $('login-error'),
  loginSubmit: $('login-submit'),
  regUsername: $('reg-username'),
  regDisplayName: $('reg-displayname'),
  regPassword: $('reg-password'),
  regCode: $('reg-code'),
  regError: $('reg-error'),
  regSubmit: $('reg-submit'),

  sidebar: $('sidebar'),
  sidebarBackdrop: $('sidebar-backdrop'),
  mobileMenuBtn: $('mobile-menu-btn'),
  themeToggleBtn: $('theme-toggle-btn'),
  openCreateChannelBtn: $('open-create-channel-btn'),
  openJoinChannelBtn: $('open-join-channel-btn'),
  channelList: $('channel-list'),
  openAvatarModalBtn: $('open-avatar-modal-btn'),
  meAvatar: $('me-avatar'),
  meName: $('me-name'),
  meUsername: $('me-username'),
  logoutBtn: $('logout-btn'),

  currentChannelName: $('current-channel-name'),
  channelMembersBtn: $('channel-members-btn'),
  ownerInviteBar: $('owner-invite-bar'),
  ownerInviteCode: $('owner-invite-code'),
  copyInviteBtn: $('copy-invite-btn'),
  resetInviteBtn: $('reset-invite-btn'),
  privacyToggleBtn: $('privacy-toggle-btn'),
  notifyToggleBtn: $('notify-toggle-btn'),
  syncStatus: $('sync-status'),

  emptyState: $('empty-state'),
  emptyCreateBtn: $('empty-create-btn'),
  emptyJoinBtn: $('empty-join-btn'),
  dropOverlay: $('drop-overlay'),
  messagesWrapper: $('messages-wrapper'),
  messagesList: $('messages-list'),
  scrollBottomBtn: $('scroll-bottom-btn'),
  composerArea: $('composer-area'),

  replyBar: $('reply-bar'),
  replyBarSender: $('reply-bar-sender'),
  replyBarPreview: $('reply-bar-preview'),
  cancelReplyBtn: $('cancel-reply-btn'),

  editBar: $('edit-bar'),
  editBarPreview: $('edit-bar-preview'),
  cancelEditBtn: $('cancel-edit-btn'),

  imagePreviewBar: $('image-preview-bar'),
  imagePreviewThumb: $('image-preview-thumb'),
  imagePreviewName: $('image-preview-name'),
  imagePreviewMeta: $('image-preview-meta'),
  cancelImageBtn: $('cancel-image-btn'),

  toggleStickerBtn: $('toggle-sticker-btn'),
  uploadImageBtn: $('upload-image-btn'),
  imageFileInput: $('image-file-input'),
  stickerPopover: $('sticker-popover'),
  pickerTabSticker: $('picker-tab-sticker'),
  pickerTabEmoji: $('picker-tab-emoji'),
  closePickerBtn: $('close-picker-btn'),
  pickerCats: $('picker-cats'),
  pickerBody: $('picker-body'),
  reactionPicker: $('reaction-picker'),

  messageInput: $('message-input'),
  sendBtn: $('send-btn'),

  lightboxModal: $('lightbox-modal'),
  lightboxBackdrop: $('lightbox-backdrop'),
  lightboxCloseBtn: $('lightbox-close-btn'),
  lightboxImg: $('lightbox-img'),
  lightboxCaption: $('lightbox-caption'),

  modalCreateChannel: $('modal-create-channel'),
  createChannelForm: $('create-channel-form'),
  newChannelName: $('new-channel-name'),
  createChannelError: $('create-channel-error'),
  createChannelSubmit: $('create-channel-submit'),

  modalJoinChannel: $('modal-join-channel'),
  joinChannelForm: $('join-channel-form'),
  joinChannelCode: $('join-channel-code'),
  joinChannelError: $('join-channel-error'),
  joinChannelSubmit: $('join-channel-submit'),

  modalChannelInfo: $('modal-channel-info'),
  infoChannelTitle: $('info-channel-title'),
  infoChannelOwner: $('info-channel-owner'),
  infoInviteRow: $('info-invite-row'),
  infoInviteCode: $('info-invite-code'),
  infoCopyInviteBtn: $('info-copy-invite-btn'),
  infoMembersList: $('info-members-list'),

  modalAvatar: $('modal-avatar'),
  avatarModalPreview: $('avatar-modal-preview'),
  avatarUploadBtn: $('avatar-upload-btn'),
  avatarFileInput: $('avatar-file-input'),
  avatarPresetGrid: $('avatar-preset-grid'),
  avatarSaveBtn: $('avatar-save-btn'),

  toastContainer: $('toast-container'),
};

// ==================== 初始化 ====================
init();

async function init() {
  initTheme();
  initPrivacyMirror();
  renderNotifyBell();
  bindEvents();
  setUnauthorizedHandler((msg) => {
    clearSession();
    showAuthView();
    showToast(msg || '請重新登入', 'error');
  });

  const saved = loadJson(SESSION_KEY, null);
  if (saved && saved.token && saved.user && getGasUrl()) {
    state.token = saved.token;
    state.user = saved.user;
    enterAppView();
    try {
      const meRes = await apiPost('me', {}, { token: state.token });
      state.user = meRes.user;
      saveSession();
      renderMeProfile();
      await loadInitialData();
    } catch (err) {
      if (!state.token) return; // 已由 unauthorizedHandler 處理
      showToast(err.message, 'error');
    }
  } else {
    showAuthView();
  }
}

function initTheme() {
  const saved = localStorage.getItem(THEME_KEY);
  const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  const theme = saved || (prefersDark ? 'dark' : 'light');
  applyTheme(theme);
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem(THEME_KEY, theme);
  els.themeToggleBtn.textContent = theme === 'dark' ? '☀️' : '🌙';
}

function initPrivacyMirror() {
  applyPrivacyMirror(localStorage.getItem(PRIVACY_KEY) === '1');
}

function applyPrivacyMirror(enabled) {
  state.privacyMirror = Boolean(enabled);
  localStorage.setItem(PRIVACY_KEY, state.privacyMirror ? '1' : '0');
  els.appView.classList.toggle('privacy-mirror', state.privacyMirror);
  els.privacyToggleBtn.classList.toggle('active', state.privacyMirror);
  els.privacyToggleBtn.title = state.privacyMirror
    ? '防偷窺鏡像模式已開啟（滑鼠移到訊息上恢復正常，Alt+M 切換）'
    : '開啟防偷窺鏡像模式（Alt+M）';
}

function togglePrivacyMirror() {
  const next = !state.privacyMirror;
  applyPrivacyMirror(next);
  showToast(
    next
      ? '已開啟防偷窺鏡像模式（滑鼠移到訊息上即恢復閱讀）'
      : '已關閉防偷窺鏡像模式',
    next ? 'success' : 'info'
  );
}

function renderNotifyBell() {
  const on = isNotifyEnabled();
  const perm = getNotifyPermission();
  els.notifyToggleBtn.classList.toggle('active', on);
  els.notifyToggleBtn.classList.toggle('denied', perm === 'denied');
  if (perm === 'denied') {
    els.notifyToggleBtn.title = '通知已被瀏覽器封鎖（請點網址列左側圖示允許通知）';
  } else if (on) {
    els.notifyToggleBtn.title = '訊息跳出通知已開啟（點擊關閉）';
  } else {
    els.notifyToggleBtn.title = '點擊開啟瀏覽器跳出通知與提示音';
  }
}

function ringBellIcon() {
  els.notifyToggleBtn.classList.remove('ringing');
  void els.notifyToggleBtn.offsetWidth;
  els.notifyToggleBtn.classList.add('ringing');
  setTimeout(() => els.notifyToggleBtn.classList.remove('ringing'), 700);
}

function clearUnreadTitle() {
  state.unreadTitleCount = 0;
  document.title = 'Messenger';
}

// ==================== 事件綁定 ====================
function bindEvents() {
  // 首次互動解鎖瀏覽器音效播放權限
  document.addEventListener('pointerdown', () => unlockAudio(), { once: true });

  // 防偷窺鏡像開關
  els.privacyToggleBtn.addEventListener('click', togglePrivacyMirror);

  // 鈴鐺通知開關
  els.notifyToggleBtn.addEventListener('click', async () => {
    const result = await toggleNotifications();
    renderNotifyBell();
    if (result.enabled) ringBellIcon();
    if (result.message) showToast(result.message, result.type);
    scheduleNextPoll();
  });

  // 登入 / 註冊切換
  els.tabLogin.addEventListener('click', () => switchAuthTab('login'));
  els.tabRegister.addEventListener('click', () => switchAuthTab('register'));

  els.loginForm.addEventListener('submit', handleLoginSubmit);
  els.registerForm.addEventListener('submit', handleRegisterSubmit);

  // 主題 & 登出
  els.themeToggleBtn.addEventListener('click', () => {
    const cur = document.documentElement.getAttribute('data-theme');
    applyTheme(cur === 'dark' ? 'light' : 'dark');
  });
  els.logoutBtn.addEventListener('click', handleLogout);

  // 頭像設定彈窗、預覽與儲存
  els.openAvatarModalBtn.addEventListener('click', openAvatarModal);
  els.avatarUploadBtn.addEventListener('click', () => els.avatarFileInput.click());
  els.avatarFileInput.addEventListener('change', handleAvatarFileSelect);
  els.avatarSaveBtn.addEventListener('click', handleSaveAvatar);

  // 手機側邊欄
  els.mobileMenuBtn.addEventListener('click', () => toggleSidebar(true));
  els.sidebarBackdrop.addEventListener('click', () => toggleSidebar(false));

  // 建立 / 加入頻道彈窗
  const openCreate = () => {
    els.createChannelError.classList.add('hidden');
    els.newChannelName.value = '';
    openModal(els.modalCreateChannel);
    setTimeout(() => els.newChannelName.focus(), 50);
  };
  const openJoin = () => {
    els.joinChannelError.classList.add('hidden');
    els.joinChannelCode.value = '';
    openModal(els.modalJoinChannel);
    setTimeout(() => els.joinChannelCode.focus(), 50);
  };
  els.openCreateChannelBtn.addEventListener('click', openCreate);
  els.emptyCreateBtn.addEventListener('click', openCreate);
  els.openJoinChannelBtn.addEventListener('click', openJoin);
  els.emptyJoinBtn.addEventListener('click', openJoin);

  els.createChannelForm.addEventListener('submit', handleCreateChannel);
  els.joinChannelForm.addEventListener('submit', handleJoinChannel);

  // 頻道成員資訊 & 邀請碼操作
  els.channelMembersBtn.addEventListener('click', openChannelInfoModal);
  els.copyInviteBtn.addEventListener('click', () => copyInviteCode());
  els.infoCopyInviteBtn.addEventListener('click', () => copyInviteCode());
  els.resetInviteBtn.addEventListener('click', handleResetInviteCode);

  // 通用關閉 Modal
  document.querySelectorAll('.modal').forEach((modal) => {
    modal.querySelectorAll('.modal-close, .modal-backdrop').forEach((el) => {
      el.addEventListener('click', () => closeModal(modal));
    });
  });

  // 回覆 / 編輯 / 圖片預覽取消
  els.cancelReplyBtn.addEventListener('click', clearReplyTarget);
  els.cancelEditBtn.addEventListener('click', cancelEditMode);
  els.cancelImageBtn.addEventListener('click', clearPendingImage);

  // 上傳圖片按鈕與檔案選擇器
  els.uploadImageBtn.addEventListener('click', () => {
    if (!state.currentChannelId) return;
    if (state.editTarget) cancelEditMode();
    els.imageFileInput.click();
  });
  els.imageFileInput.addEventListener('change', () => {
    const file = els.imageFileInput.files && els.imageFileInput.files[0];
    els.imageFileInput.value = '';
    if (file) attachImageFile(file);
  });

  // Ctrl+V 剪貼簿貼上圖片
  document.addEventListener('paste', (e) => {
    if (!state.token || !state.currentChannelId) return;
    if (document.querySelector('.modal:not(.hidden)')) return;
    const clip = e.clipboardData;
    if (!clip) return;

    let imageFile = null;
    if (clip.items) {
      for (const item of clip.items) {
        if (item.type && item.type.startsWith('image/')) {
          imageFile = item.getAsFile();
          break;
        }
      }
    }
    if (!imageFile && clip.files) {
      for (const f of clip.files) {
        if (f.type && f.type.startsWith('image/')) {
          imageFile = f;
          break;
        }
      }
    }
    if (!imageFile) return;

    e.preventDefault();
    if (state.editTarget) cancelEditMode();
    attachImageFile(imageFile);
  });

  // 拖曳圖片至聊天視窗上傳
  const chatMain = document.querySelector('.chat-main');
  if (chatMain) {
    chatMain.addEventListener('dragenter', (e) => {
      if (!state.token || !state.currentChannelId) return;
      if (!e.dataTransfer || !Array.from(e.dataTransfer.types || []).includes('Files')) return;
      e.preventDefault();
      state.dragDepth += 1;
      els.dropOverlay.classList.remove('hidden');
    });
    chatMain.addEventListener('dragover', (e) => {
      if (!state.token || !state.currentChannelId) return;
      if (!e.dataTransfer || !Array.from(e.dataTransfer.types || []).includes('Files')) return;
      e.preventDefault();
    });
    chatMain.addEventListener('dragleave', () => {
      state.dragDepth = Math.max(0, state.dragDepth - 1);
      if (state.dragDepth === 0) els.dropOverlay.classList.add('hidden');
    });
    chatMain.addEventListener('drop', (e) => {
      e.preventDefault();
      state.dragDepth = 0;
      els.dropOverlay.classList.add('hidden');
      if (!state.token || !state.currentChannelId) return;
      const files = e.dataTransfer && e.dataTransfer.files;
      if (!files || !files.length) return;
      const imgFile = Array.from(files).find((f) => f.type && f.type.startsWith('image/'));
      if (!imgFile) {
        showToast('目前僅支援上傳圖片檔案', 'error');
        return;
      }
      if (state.editTarget) cancelEditMode();
      attachImageFile(imgFile);
    });
  }

  // Lightbox 大圖預覽關閉
  els.lightboxBackdrop.addEventListener('click', closeLightbox);
  els.lightboxCloseBtn.addEventListener('click', closeLightbox);

  // 貼圖 / 表情面板（阻止面板內點擊冒泡到 document 誤觸外部關閉）
  els.stickerPopover.addEventListener('click', (e) => e.stopPropagation());
  els.reactionPicker.addEventListener('click', (e) => e.stopPropagation());
  els.toggleStickerBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleStickerPopover();
  });
  els.closePickerBtn.addEventListener('click', closeStickerPopover);
  els.pickerTabSticker.addEventListener('click', () => {
    state.pickerMode = 'sticker';
    renderStickerPopover();
  });
  els.pickerTabEmoji.addEventListener('click', () => {
    state.pickerMode = 'emoji';
    renderStickerPopover();
  });

  // 輸入框（注意中文組字 isComposing 避免誤送出）
  els.messageInput.addEventListener('input', autoResizeInput);
  els.messageInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && e.keyCode !== 229) {
      e.preventDefault();
      handleComposerSubmit();
    }
  });
  els.sendBtn.addEventListener('click', handleComposerSubmit);

  // 捲動到底部提示鈕
  els.messagesList.addEventListener('scroll', () => {
    if (isNearBottom()) {
      els.scrollBottomBtn.classList.add('hidden');
      markCurrentChannelRead();
    }
  });
  els.scrollBottomBtn.addEventListener('click', () => {
    scrollToBottom(true);
    els.scrollBottomBtn.classList.add('hidden');
    markCurrentChannelRead();
  });

  // 點擊空白處關閉彈出面板與手機觸控工具列
  document.addEventListener('click', (e) => {
    if (!els.stickerPopover.classList.contains('hidden') &&
        !els.stickerPopover.contains(e.target) &&
        !els.toggleStickerBtn.contains(e.target)) {
      closeStickerPopover();
    }
    if (!els.reactionPicker.classList.contains('hidden') &&
        !els.reactionPicker.contains(e.target) &&
        !e.target.closest('.hover-more-react')) {
      closeReactionPicker();
    }
    if (!e.target.closest('.msg-bubble-wrap')) {
      document.querySelectorAll('.msg-row.touch-active').forEach((n) => n.classList.remove('touch-active'));
    }
  });

  // 全域快捷鍵：Alt+M 切換防偷窺鏡像、Esc 關閉彈窗/面板
  document.addEventListener('keydown', (e) => {
    if (e.altKey && !e.ctrlKey && !e.metaKey && e.key.toLowerCase() === 'm' && state.token) {
      e.preventDefault();
      togglePrivacyMirror();
      return;
    }
    if (e.key !== 'Escape') return;
    if (!els.lightboxModal.classList.contains('hidden')) {
      closeLightbox();
      return;
    }
    document.querySelectorAll('.modal:not(.hidden)').forEach(closeModal);
    closeStickerPopover();
    closeReactionPicker();
    if (state.editTarget) {
      cancelEditMode();
    } else if (state.pendingImage) {
      clearPendingImage();
    } else if (state.replyTarget) {
      clearReplyTarget();
    }
  });

  // 分頁背景 / 前景智慧切換輪詢頻率，回到前景清除未讀標題
  document.addEventListener('visibilitychange', () => {
    if (!state.token) return;
    if (document.visibilityState === 'visible') {
      clearUnreadTitle();
      markCurrentChannelRead();
      renderChannelList();
      syncNow();
    } else {
      scheduleNextPoll();
    }
  });

  window.addEventListener('focus', () => {
    if (!state.token) return;
    clearUnreadTitle();
    if (isNearBottom()) {
      markCurrentChannelRead();
      renderChannelList();
    }
  });
}

// ==================== 登入 / 註冊 / 登出 ====================
function switchAuthTab(tab) {
  const isLogin = tab === 'login';
  els.tabLogin.classList.toggle('active', isLogin);
  els.tabRegister.classList.toggle('active', !isLogin);
  els.tabLogin.setAttribute('aria-selected', String(isLogin));
  els.tabRegister.setAttribute('aria-selected', String(!isLogin));
  els.loginForm.classList.toggle('hidden', !isLogin);
  els.registerForm.classList.toggle('hidden', isLogin);
  els.loginError.classList.add('hidden');
  els.regError.classList.add('hidden');
}

async function handleLoginSubmit(e) {
  e.preventDefault();
  els.loginError.classList.add('hidden');
  setBtnLoading(els.loginSubmit, true, '登入中…');

  try {
    const res = await apiPost('login', {
      username: els.loginUsername.value.trim(),
      password: els.loginPassword.value,
    });
    state.token = res.token;
    state.user = res.user;
    saveSession();
    els.loginPassword.value = '';
    enterAppView();
    await loadInitialData();
  } catch (err) {
    els.loginError.textContent = err.message;
    els.loginError.classList.remove('hidden');
  } finally {
    setBtnLoading(els.loginSubmit, false, '登入');
  }
}

async function handleRegisterSubmit(e) {
  e.preventDefault();
  els.regError.classList.add('hidden');
  setBtnLoading(els.regSubmit, true, '建立中…');

  try {
    const res = await apiPost('register', {
      username: els.regUsername.value.trim(),
      displayName: els.regDisplayName.value.trim(),
      password: els.regPassword.value,
      registerCode: els.regCode.value,
    });
    state.token = res.token;
    state.user = res.user;
    saveSession();
    els.regPassword.value = '';
    els.regCode.value = '';
    showToast(`歡迎加入，${res.user.displayName}！`, 'success');
    enterAppView();
    await loadInitialData();
  } catch (err) {
    els.regError.textContent = err.message;
    els.regError.classList.remove('hidden');
  } finally {
    setBtnLoading(els.regSubmit, false, '建立帳號並登入');
  }
}

async function handleLogout() {
  stopPolling();
  const tok = state.token;
  clearSession();
  showAuthView();
  if (tok && getGasUrl()) {
    apiPost('logout', {}, { token: tok }).catch(() => {});
  }
}

function showAuthView() {
  stopPolling();
  els.appView.classList.add('hidden');
  els.authView.classList.remove('hidden');
}

function enterAppView() {
  els.authView.classList.add('hidden');
  els.appView.classList.remove('hidden');
  renderMeProfile();
}

function applyUserAvatar(el, { userId, displayName, fallbackColor = '' } = {}) {
  const isMe = state.user && userId === state.user.id;
  const prof = (userId && state.userProfiles[userId]) || null;
  const avatarColor = (isMe && state.user.avatarColor)
    || (prof && prof.avatarColor)
    || fallbackColor
    || colorFromId(userId || displayName);
  const avatar = isMe
    ? (state.user.avatar || (prof && prof.avatar) || '')
    : ((prof && prof.avatar) || '');

  renderAvatarEl(el, {
    displayName: displayName || (prof && prof.displayName) || '?',
    avatarColor,
    avatar,
    token: state.token,
  });
}

function renderMeProfile() {
  if (!state.user) return;
  applyUserAvatar(els.meAvatar, {
    userId: state.user.id,
    displayName: state.user.displayName,
    fallbackColor: state.user.avatarColor,
  });
  els.meName.textContent = state.user.displayName;
  els.meUsername.textContent = '@' + state.user.username;
}

function openAvatarModal() {
  if (!state.user) return;
  toggleSidebar(false);
  state.avatarDraft = null;
  els.avatarSaveBtn.disabled = true;
  els.avatarSaveBtn.textContent = '儲存頭像';
  renderAvatarModalPreview();
  renderAvatarPresetGrid();
  openModal(els.modalAvatar);
}

function renderAvatarModalPreview() {
  if (!state.user) return;
  const draft = state.avatarDraft;
  if (draft && draft.mode === 'upload' && draft.processed) {
    renderAvatarEl(els.avatarModalPreview, {
      displayName: state.user.displayName,
      previewDataUrl: draft.processed.dataUrl,
    });
    return;
  }
  if (draft && draft.mode === 'preset') {
    const val = draft.presetId === 'initial' ? '' : `preset:${draft.presetId}`;
    renderAvatarEl(els.avatarModalPreview, {
      displayName: state.user.displayName,
      avatarColor: state.user.avatarColor || colorFromId(state.user.id),
      avatar: val,
      token: state.token,
    });
    return;
  }
  applyUserAvatar(els.avatarModalPreview, {
    userId: state.user.id,
    displayName: state.user.displayName,
    fallbackColor: state.user.avatarColor,
  });
}

function renderAvatarPresetGrid() {
  els.avatarPresetGrid.textContent = '';
  const draft = state.avatarDraft;
  const activeAvatar = draft
    ? (draft.mode === 'preset' ? (draft.presetId === 'initial' ? '' : `preset:${draft.presetId}`) : '__upload__')
    : String((state.user && state.user.avatar) || '');

  for (const preset of AVATAR_PRESETS) {
    const val = preset.id === 'initial' ? '' : `preset:${preset.id}`;
    const isSelected = activeAvatar === val;

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'avatar-preset-btn' + (isSelected ? ' selected' : '');

    const circle = document.createElement('div');
    circle.className = 'avatar avatar-md';
    renderAvatarEl(circle, {
      displayName: state.user.displayName,
      avatarColor: state.user.avatarColor || colorFromId(state.user.id),
      avatar: val,
      token: state.token,
    });

    const label = document.createElement('span');
    label.textContent = preset.label;

    btn.appendChild(circle);
    btn.appendChild(label);
    btn.addEventListener('click', () => selectAvatarPresetDraft(preset.id));
    els.avatarPresetGrid.appendChild(btn);
  }
}

function selectAvatarPresetDraft(presetId) {
  if (!state.user) return;
  const nextVal = presetId === 'initial' ? '' : `preset:${presetId}`;
  const currentVal = String(state.user.avatar || '');
  state.avatarDraft = nextVal === currentVal ? null : { mode: 'preset', presetId };
  els.avatarSaveBtn.disabled = !state.avatarDraft;
  renderAvatarModalPreview();
  renderAvatarPresetGrid();
}

async function handleAvatarFileSelect() {
  const file = els.avatarFileInput.files && els.avatarFileInput.files[0];
  els.avatarFileInput.value = '';
  if (!file || !state.user) return;

  try {
    const processed = await processAvatarFile(file);
    state.avatarDraft = { mode: 'upload', processed };
    els.avatarSaveBtn.disabled = false;
    renderAvatarModalPreview();
    renderAvatarPresetGrid();
  } catch (err) {
    showToast(err.message || '圖片處理失敗', 'error');
  }
}

async function handleSaveAvatar() {
  if (!state.user || !state.avatarDraft) return;
  const draft = state.avatarDraft;

  setBtnLoading(els.avatarSaveBtn, true, '儲存中…');
  try {
    const payload = draft.mode === 'upload'
      ? {
          mode: 'upload',
          imageData: draft.processed.base64,
          imageMime: draft.processed.mime,
        }
      : {
          mode: 'preset',
          preset: draft.presetId,
        };

    const res = await apiPost('updateAvatar', payload, { token: state.token });
    const avatarVal = String(res.avatar || (res.user && res.user.avatar) || '');

    if (draft.mode === 'upload' && avatarVal.startsWith('drive:')) {
      cacheImageDataUrl(avatarVal.slice(6), draft.processed.dataUrl);
    }

    if (res.user) {
      state.user = res.user;
    } else {
      state.user.avatar = avatarVal;
    }
    if (res.userProfiles) {
      state.userProfiles = res.userProfiles;
    } else {
      state.userProfiles[state.user.id] = {
        displayName: state.user.displayName,
        avatarColor: state.user.avatarColor,
        avatar: state.user.avatar,
      };
    }

    state.avatarDraft = null;
    saveSession();
    renderMeProfile();
    renderMessages();
    showToast('頭像已儲存！', 'success');
    closeModal(els.modalAvatar);
  } catch (err) {
    showToast('頭像儲存失敗：' + err.message, 'error');
  } finally {
    setBtnLoading(els.avatarSaveBtn, false, '儲存頭像');
    els.avatarSaveBtn.disabled = !state.avatarDraft;
  }
}

// ==================== 頻道管理 ====================
async function loadInitialData() {
  setSyncIndicator('syncing');
  const res = await apiPost('getChannels', {}, { token: state.token });
  state.channels = res.channels || [];
  if (res.userProfiles) state.userProfiles = res.userProfiles;
  renderMeProfile();
  state.globalVersion = Number(res.globalVersion || 0);
  for (const ch of state.channels) {
    state.channelLastMsgAt.set(ch.id, Number(ch.lastMessageAt || 0));
  }
  renderChannelList();

  const lastId = localStorage.getItem(LAST_CHANNEL_KEY);
  const target = state.channels.find((c) => c.id === lastId) || state.channels[0] || null;
  if (target) {
    await selectChannel(target.id);
  } else {
    renderCurrentChannelView();
    setSyncIndicator('ok');
    scheduleNextPoll();
  }
}

async function selectChannel(channelId) {
  if (state.syncAbort) {
    state.syncAbort.abort();
    state.syncAbort = null;
  }
  state.currentChannelId = channelId;
  localStorage.setItem(LAST_CHANNEL_KEY, channelId);
  clearReplyTarget();
  cancelEditMode();
  clearPendingImage();
  closeStickerPopover();
  closeReactionPicker();
  toggleSidebar(false);

  markCurrentChannelRead();
  renderChannelList();
  renderCurrentChannelView();
  renderMessages({ forceScrollBottom: true });

  await syncNow();
}

function getCurrentChannel() {
  return state.channels.find((c) => c.id === state.currentChannelId) || null;
}

function renderChannelList() {
  els.channelList.textContent = '';

  if (state.channels.length === 0) {
    const hint = document.createElement('div');
    hint.className = 'channel-empty-hint';
    hint.textContent = '還沒有加入任何頻道，點上方按鈕建立或輸入邀請碼加入。';
    els.channelList.appendChild(hint);
    return;
  }

  for (const ch of state.channels) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'channel-item' + (ch.id === state.currentChannelId ? ' active' : '');

    const hash = document.createElement('span');
    hash.className = 'channel-hash';
    hash.textContent = '#';

    const name = document.createElement('span');
    name.className = 'channel-item-name';
    name.textContent = ch.name;

    btn.appendChild(hash);
    btn.appendChild(name);

    if (ch.isOwner) {
      const tag = document.createElement('span');
      tag.className = 'channel-owner-tag';
      tag.textContent = '建立者';
      btn.appendChild(tag);
    }

    const lastRead = Number(state.lastRead[ch.id] || 0);
    if (ch.id !== state.currentChannelId && ch.lastMessageAt > lastRead) {
      const dot = document.createElement('span');
      dot.className = 'unread-dot';
      dot.title = '有新訊息';
      btn.appendChild(dot);
    }

    btn.addEventListener('click', () => {
      if (ch.id !== state.currentChannelId) {
        selectChannel(ch.id);
      } else {
        toggleSidebar(false);
      }
    });

    els.channelList.appendChild(btn);
  }
}

function renderCurrentChannelView() {
  const ch = getCurrentChannel();
  if (!ch) {
    els.currentChannelName.textContent = '選擇或建立頻道';
    els.channelMembersBtn.classList.add('hidden');
    els.ownerInviteBar.classList.add('hidden');
    els.emptyState.classList.remove('hidden');
    els.messagesWrapper.classList.add('hidden');
    els.composerArea.classList.add('hidden');
    return;
  }

  els.currentChannelName.textContent = '# ' + ch.name;
  els.channelMembersBtn.textContent = `👥 ${ch.memberCount} 人`;
  els.channelMembersBtn.classList.remove('hidden');

  if (ch.isOwner && ch.inviteCode) {
    els.ownerInviteCode.textContent = ch.inviteCode;
    els.ownerInviteBar.classList.remove('hidden');
  } else {
    els.ownerInviteBar.classList.add('hidden');
  }

  els.emptyState.classList.add('hidden');
  els.messagesWrapper.classList.remove('hidden');
  els.composerArea.classList.remove('hidden');
}

async function handleCreateChannel(e) {
  e.preventDefault();
  els.createChannelError.classList.add('hidden');
  const name = els.newChannelName.value.trim();
  if (!name) return;

  setBtnLoading(els.createChannelSubmit, true, '建立中…');
  try {
    const res = await apiPost('createChannel', { name }, { token: state.token });
    state.channels.unshift(res.channel);
    state.channelLastMsgAt.set(res.channel.id, Number(res.channel.lastMessageAt || 0));
    closeModal(els.modalCreateChannel);
    showToast(`頻道「${res.channel.name}」已建立！邀請碼：${res.channel.inviteCode}`, 'success');
    await selectChannel(res.channel.id);
  } catch (err) {
    els.createChannelError.textContent = err.message;
    els.createChannelError.classList.remove('hidden');
  } finally {
    setBtnLoading(els.createChannelSubmit, false, '建立');
  }
}

async function handleJoinChannel(e) {
  e.preventDefault();
  els.joinChannelError.classList.add('hidden');
  const code = els.joinChannelCode.value.trim().toUpperCase();
  if (!code) return;

  setBtnLoading(els.joinChannelSubmit, true, '加入中…');
  try {
    const res = await apiPost('joinChannel', { inviteCode: code }, { token: state.token });
    const exists = state.channels.some((c) => c.id === res.channel.id);
    if (!exists) {
      state.channels.unshift(res.channel);
      state.channelLastMsgAt.set(res.channel.id, Number(res.channel.lastMessageAt || 0));
    }
    closeModal(els.modalJoinChannel);
    showToast(
      res.alreadyMember
        ? `你已經在「${res.channel.name}」頻道中了`
        : `已成功加入頻道「${res.channel.name}」！`,
      'success'
    );
    await selectChannel(res.channel.id);
  } catch (err) {
    els.joinChannelError.textContent = err.message;
    els.joinChannelError.classList.remove('hidden');
  } finally {
    setBtnLoading(els.joinChannelSubmit, false, '加入頻道');
  }
}

async function handleResetInviteCode() {
  const ch = getCurrentChannel();
  if (!ch || !ch.isOwner) return;
  if (!confirm(`確定要重新產生「${ch.name}」的邀請碼嗎？舊代碼將立即失效。`)) return;

  els.resetInviteBtn.disabled = true;
  try {
    const res = await apiPost('resetInviteCode', { channelId: ch.id }, { token: state.token });
    ch.inviteCode = res.inviteCode;
    renderCurrentChannelView();
    showToast(`新邀請碼已產生：${res.inviteCode}`, 'success');
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    els.resetInviteBtn.disabled = false;
  }
}

function openChannelInfoModal() {
  const ch = getCurrentChannel();
  if (!ch) return;

  els.infoChannelTitle.textContent = '# ' + ch.name;
  els.infoChannelOwner.textContent = ch.ownerName || '建立者';

  if (ch.isOwner && ch.inviteCode) {
    els.infoInviteCode.textContent = ch.inviteCode;
    els.infoInviteRow.classList.remove('hidden');
  } else {
    els.infoInviteRow.classList.add('hidden');
  }

  els.infoMembersList.textContent = '';
  const memberIds = Array.isArray(ch.memberIds) && ch.memberIds.length > 0 ? ch.memberIds : null;
  const names = ch.memberNames && ch.memberNames.length > 0 ? ch.memberNames : [state.user.displayName];

  if (memberIds) {
    for (let i = 0; i < memberIds.length; i++) {
      const uid = memberIds[i];
      const prof = state.userProfiles[uid];
      const name = (prof && prof.displayName) || names[i] || uid;
      const li = document.createElement('li');
      const av = document.createElement('span');
      av.className = 'avatar avatar-sm';
      applyUserAvatar(av, { userId: uid, displayName: name });

      const text = document.createElement('span');
      text.textContent = name + (uid === ch.ownerId ? '（建立者）' : '');

      li.appendChild(av);
      li.appendChild(text);
      els.infoMembersList.appendChild(li);
    }
  } else {
    for (const name of names) {
      const li = document.createElement('li');
      const av = document.createElement('span');
      av.className = 'avatar avatar-sm';
      applyUserAvatar(av, { displayName: name });

      const text = document.createElement('span');
      text.textContent = name + (name === ch.ownerName ? '（建立者）' : '');

      li.appendChild(av);
      li.appendChild(text);
      els.infoMembersList.appendChild(li);
    }
  }

  openModal(els.modalChannelInfo);
}

async function copyInviteCode() {
  const ch = getCurrentChannel();
  if (!ch || !ch.inviteCode) return;
  try {
    await navigator.clipboard.writeText(ch.inviteCode);
    showToast(`已複製邀請碼：${ch.inviteCode}`, 'success');
  } catch {
    const tmp = document.createElement('textarea');
    tmp.value = ch.inviteCode;
    document.body.appendChild(tmp);
    tmp.select();
    document.execCommand('copy');
    tmp.remove();
    showToast(`已複製邀請碼：${ch.inviteCode}`, 'success');
  }
}

// ==================== 智慧增量輪詢 ====================
function stopPolling() {
  if (state.pollTimer) {
    clearTimeout(state.pollTimer);
    state.pollTimer = null;
  }
  if (state.syncAbort) {
    state.syncAbort.abort();
    state.syncAbort = null;
  }
  state.syncInFlight = false;
}

function scheduleNextPoll() {
  if (state.pollTimer) clearTimeout(state.pollTimer);
  if (!state.token) return;
  const hiddenDelay = isNotifyEnabled()
    ? CONFIG.NOTIFY_HIDDEN_POLL_MS
    : CONFIG.HIDDEN_POLL_MS;
  const delay = document.visibilityState === 'hidden'
    ? hiddenDelay
    : CONFIG.ACTIVE_POLL_MS;
  state.pollTimer = setTimeout(() => syncNow(), delay);
}

async function syncNow() {
  if (!state.token || state.syncInFlight) return;

  const targetChannelId = state.currentChannelId;
  const since = targetChannelId ? Number(state.channelVersion.get(targetChannelId) || 0) : 0;
  const sinceGlobal = Number(state.globalVersion || 0);

  state.syncInFlight = true;
  const controller = new AbortController();
  state.syncAbort = controller;
  if (since === 0) setSyncIndicator('syncing');

  try {
    const res = await apiPost(
      'syncMessages',
      {
        channelId: targetChannelId || '',
        since,
        sinceGlobal,
      },
      { token: state.token, signal: controller.signal }
    );

    if (targetChannelId !== state.currentChannelId) return;
    setSyncIndicator('ok');

    if (res.hasChanges) {
      let profilesChanged = false;
      if (res.userProfiles && typeof res.userProfiles === 'object') {
        const prevSnap = JSON.stringify(state.userProfiles);
        const nextSnap = JSON.stringify(res.userProfiles);
        if (prevSnap !== nextSnap) {
          state.userProfiles = res.userProfiles;
          profilesChanged = true;
          const myProf = state.user && state.userProfiles[state.user.id];
          if (myProf && myProf.avatar !== undefined && myProf.avatar !== state.user.avatar) {
            state.user.avatar = myProf.avatar;
            saveSession();
          }
          renderMeProfile();
        }
      }

      const updatedOtherChannels = [];
      if (Array.isArray(res.channels)) {
        for (const ch of res.channels) {
          const prevTs = state.channelLastMsgAt.get(ch.id);
          const nextTs = Number(ch.lastMessageAt || 0);
          if (sinceGlobal > 0 && ch.id !== targetChannelId && prevTs !== undefined && nextTs > prevTs) {
            updatedOtherChannels.push(ch);
          }
          state.channelLastMsgAt.set(ch.id, nextTs);
        }
        state.channels = res.channels;
        renderCurrentChannelView();
      }

      const wasAtBottom = isNearBottom();
      const incomingFromOthers = [];

      if (targetChannelId && Array.isArray(res.messages)) {
        const msgMap = getChannelMsgMap(targetChannelId);
        const isFirstLoad = since === 0;

        for (const msg of res.messages) {
          const existed = msgMap.has(msg.id);
          msgMap.set(msg.id, msg);
          if (!isFirstLoad && !existed && !msg.isDeleted && msg.senderId !== state.user.id) {
            incomingFromOthers.push(msg);
          }
        }

        if (res.version) {
          state.channelVersion.set(targetChannelId, Number(res.version));
        }

        if (res.messages.length > 0 || isFirstLoad || profilesChanged) {
          renderMessages({ forceScrollBottom: isFirstLoad || (res.messages.length > 0 && wasAtBottom) });
          if (incomingFromOthers.length > 0 && !wasAtBottom) {
            els.scrollBottomBtn.classList.remove('hidden');
          }
        }
      }

      // 觸發鈴鐺與瀏覽器跳出視窗通知
      const isUnfocused = document.visibilityState === 'hidden' || !document.hasFocus();
      if (incomingFromOthers.length > 0) {
        const last = incomingFromOthers[incomingFromOthers.length - 1];
        const ch = getCurrentChannel();
        const chName = ch ? ch.name : 'Messenger';
        let body = '';
        if (state.privacyMirror) {
          body = '收到一則新訊息';
        } else if (last.type === 'sticker') {
          body = `[貼圖] ${getEmojiById(last.content).label}`;
        } else if (last.type === 'image') {
          const imgMeta = parseImageContent(last.content);
          body = imgMeta.caption ? `[圖片] ${imgMeta.caption.slice(0, 60)}` : '[圖片]';
        } else {
          body = last.content.slice(0, 80);
        }

        ringBellIcon();
        notifyIncomingMessage({
          title: `${last.senderName}（# ${chName}）`,
          body,
          tag: `ch-${targetChannelId}`,
          popup: true,
          onClick: () => scrollToBottom(true),
        });

        if (isUnfocused) {
          state.unreadTitleCount += incomingFromOthers.length;
          document.title = `(${state.unreadTitleCount}) 新訊息 - Messenger`;
        }
      } else if (updatedOtherChannels.length > 0) {
        const ch = updatedOtherChannels[0];
        ringBellIcon();
        notifyIncomingMessage({
          title: `# ${ch.name}`,
          body: '收到新訊息，點擊切換查看',
          tag: `ch-${ch.id}`,
          popup: true,
          onClick: () => selectChannel(ch.id),
        });

        if (isUnfocused) {
          state.unreadTitleCount += updatedOtherChannels.length;
          document.title = `(${state.unreadTitleCount}) 新訊息 - Messenger`;
        }
      }

      if (res.globalVersion) {
        state.globalVersion = Math.max(state.globalVersion, Number(res.globalVersion));
      }

      if (wasAtBottom && document.visibilityState === 'visible' && document.hasFocus()) {
        markCurrentChannelRead();
      }
      renderChannelList();
    }
  } catch (err) {
    if (err && err.name === 'AbortError') return;
    setSyncIndicator('error');
  } finally {
    state.syncInFlight = false;
    if (state.syncAbort === controller) state.syncAbort = null;
    scheduleNextPoll();
  }
}

function setSyncIndicator(mode) {
  els.syncStatus.classList.remove('syncing', 'error');
  if (mode === 'syncing') {
    els.syncStatus.classList.add('syncing');
    els.syncStatus.title = '同步中…';
  } else if (mode === 'error') {
    els.syncStatus.classList.add('error');
    els.syncStatus.title = '連線不穩，自動重試中';
  } else {
    els.syncStatus.title = '已即時同步';
  }
}

// ==================== 訊息渲染（防 XSS + Teams 體驗） ====================
function getChannelMsgMap(channelId) {
  let map = state.messagesByChannel.get(channelId);
  if (!map) {
    map = new Map();
    state.messagesByChannel.set(channelId, map);
  }
  return map;
}

function getSortedMessages(channelId) {
  const map = getChannelMsgMap(channelId);
  return Array.from(map.values()).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
}

function renderMessages({ forceScrollBottom = false } = {}) {
  const channelId = state.currentChannelId;
  if (!channelId) return;

  const list = getSortedMessages(channelId);
  const frag = document.createDocumentFragment();

  if (list.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'messages-empty';
    empty.textContent = '這個頻道還沒有訊息，發送第一則打個招呼吧！';
    frag.appendChild(empty);
  } else {
    let lastDateKey = '';
    let prevMsg = null;

    for (const msg of list) {
      const dateKey = formatDateDivider(msg.createdAt);
      if (dateKey !== lastDateKey) {
        const divider = document.createElement('div');
        divider.className = 'date-divider';
        divider.textContent = dateKey;
        frag.appendChild(divider);
        lastDateKey = dateKey;
        prevMsg = null;
      }

      const compact = Boolean(
        prevMsg &&
        prevMsg.senderId === msg.senderId &&
        !prevMsg.isDeleted &&
        (msg.createdAt - prevMsg.createdAt) < 3 * 60 * 1000
      );

      frag.appendChild(buildMessageRow(msg, compact));
      prevMsg = msg;
    }
  }

  els.messagesList.textContent = '';
  els.messagesList.appendChild(frag);

  if (forceScrollBottom) {
    scrollToBottom(false);
  }
}

function buildMessageRow(msg, compact) {
  const isMe = state.user && msg.senderId === state.user.id;
  const row = document.createElement('div');
  row.className = 'msg-row'
    + (isMe ? ' is-me' : '')
    + (compact ? ' compact' : '')
    + (msg._sending ? ' is-sending' : '')
    + (msg.isDeleted ? ' is-deleted' : '');
  row.dataset.msgId = msg.id;

  // 頭像
  const avatarSlot = document.createElement('div');
  avatarSlot.className = 'msg-avatar-slot';
  const avatar = document.createElement('div');
  avatar.className = 'avatar avatar-sm';
  applyUserAvatar(avatar, {
    userId: msg.senderId,
    displayName: msg.senderName,
  });
  avatarSlot.appendChild(avatar);
  row.appendChild(avatarSlot);

  // 右側主欄
  const col = document.createElement('div');
  col.className = 'msg-body-col';

  if (!compact) {
    const meta = document.createElement('div');
    meta.className = 'msg-meta';
    const sender = document.createElement('span');
    sender.className = 'msg-sender';
    sender.textContent = msg.senderName;
    const time = document.createElement('span');
    time.className = 'msg-time';
    time.textContent = msg._sending ? '傳送中…' : formatTime(msg.createdAt);
    meta.appendChild(sender);
    meta.appendChild(time);
    if (msg.editedAt > 0 && !msg.isDeleted && !msg._sending) {
      const edited = document.createElement('span');
      edited.className = 'msg-edited-tag';
      edited.textContent = '(已編輯)';
      meta.appendChild(edited);
    }
    col.appendChild(meta);
  }

  const bubbleWrap = document.createElement('div');
  bubbleWrap.className = 'msg-bubble-wrap';

  // 手機點擊訊息顯示浮動表情與回覆列
  bubbleWrap.addEventListener('click', (e) => {
    if (e.target.closest('button') || e.target.closest('a') || e.target.closest('.msg-quote') || e.target.closest('.msg-image')) return;
    const active = row.classList.contains('touch-active');
    document.querySelectorAll('.msg-row.touch-active').forEach((n) => n.classList.remove('touch-active'));
    if (!active && !msg.isDeleted && !msg._sending) {
      row.classList.add('touch-active');
    }
  });

  // 懸浮 Teams 表情與操作列
  if (!msg.isDeleted && !msg._sending) {
    bubbleWrap.appendChild(buildHoverToolbar(msg, isMe));
  }

  // 內容主體（收回 / 貼圖 / 圖片 / 文字）
  if (msg.isDeleted) {
    const bubble = document.createElement('div');
    bubble.className = 'msg-bubble';
    bubble.textContent = '此訊息已收回';
    bubbleWrap.appendChild(bubble);
  } else if (msg.type === 'sticker') {
    const stickerBox = document.createElement('div');
    stickerBox.className = 'msg-sticker-box';
    if (msg.replyTo) {
      stickerBox.appendChild(buildReplyQuote(msg.replyTo));
    }
    stickerBox.appendChild(createFluentImg(msg.content, 'msg-sticker-img'));
    bubbleWrap.appendChild(stickerBox);
  } else if (msg.type === 'image') {
    const imgMeta = parseImageContent(msg.content);
    const bubble = document.createElement('div');
    bubble.className = 'msg-bubble msg-image-bubble';
    if (msg.replyTo) {
      bubble.appendChild(buildReplyQuote(msg.replyTo));
    }
    const imgEl = createDriveImageEl(imgMeta.fileId, {
      token: state.token,
      size: 1200,
      className: 'msg-image',
      alt: imgMeta.caption || '圖片',
      previewUrl: msg._previewUrl || '',
    });
    imgEl.addEventListener('click', (e) => {
      e.stopPropagation();
      openLightbox(imgMeta, imgEl.src);
    });
    bubble.appendChild(imgEl);
    if (imgMeta.caption) {
      const capEl = document.createElement('div');
      capEl.className = 'msg-image-caption';
      renderSafeTextWithLinks(capEl, imgMeta.caption);
      bubble.appendChild(capEl);
    }
    if (compact && msg.editedAt > 0 && !msg._sending) {
      const edited = document.createElement('div');
      edited.className = 'msg-edited-tag';
      edited.textContent = '(已編輯)';
      bubble.appendChild(edited);
    }
    bubbleWrap.appendChild(bubble);
  } else {
    const bubble = document.createElement('div');
    bubble.className = 'msg-bubble';
    if (msg.replyTo) {
      bubble.appendChild(buildReplyQuote(msg.replyTo));
    }
    const textEl = document.createElement('div');
    textEl.className = 'msg-text';
    renderSafeTextWithLinks(textEl, msg.content);
    bubble.appendChild(textEl);
    if (compact && msg.editedAt > 0 && !msg._sending) {
      const edited = document.createElement('div');
      edited.className = 'msg-edited-tag';
      edited.textContent = '(已編輯)';
      bubble.appendChild(edited);
    }
    bubbleWrap.appendChild(bubble);
  }

  col.appendChild(bubbleWrap);

  // 表情回應膠囊列
  const reactionsEl = document.createElement('div');
  reactionsEl.className = 'msg-reactions';
  fillReactionPills(reactionsEl, msg);
  col.appendChild(reactionsEl);

  row.appendChild(col);
  return row;
}

function buildHoverToolbar(msg, isMe) {
  const bar = document.createElement('div');
  bar.className = 'msg-hover-bar';

  // Teams 經典 6 顆快速表情
  for (const emoji of QUICK_EMOJIS) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'hover-react-btn';
    btn.title = emoji.label;
    btn.appendChild(createFluentImg(emoji, 'hover-react-img'));
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      handleToggleReaction(msg.id, emoji.id);
    });
    bar.appendChild(btn);
  }

  // 更多表情 (+)
  const moreBtn = document.createElement('button');
  moreBtn.type = 'button';
  moreBtn.className = 'hover-action-btn hover-more-react';
  moreBtn.title = '更多表情';
  moreBtn.textContent = '＋';
  moreBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    openReactionPicker(msg.id, moreBtn);
  });
  bar.appendChild(moreBtn);

  const sep = document.createElement('span');
  sep.className = 'hover-sep';
  bar.appendChild(sep);

  // 回覆按鈕
  const replyBtn = document.createElement('button');
  replyBtn.type = 'button';
  replyBtn.className = 'hover-action-btn';
  replyBtn.title = '回覆此訊息';
  replyBtn.textContent = '↩';
  replyBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    setReplyTarget(msg);
  });
  bar.appendChild(replyBtn);

  // 編輯按鈕（僅本人發送的文字或圖片訊息）
  if (isMe && (msg.type === 'text' || msg.type === 'image')) {
    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.className = 'hover-action-btn';
    editBtn.title = msg.type === 'image' ? '編輯圖片說明' : '編輯訊息';
    editBtn.textContent = '✏';
    editBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      startEditMessage(msg);
    });
    bar.appendChild(editBtn);
  }

  // 收回按鈕（僅本人或頻道建立者）
  const ch = getCurrentChannel();
  if (isMe || (ch && ch.isOwner)) {
    const delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.className = 'hover-action-btn danger';
    delBtn.title = '收回訊息';
    delBtn.textContent = '🗑';
    delBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      handleDeleteMessage(msg.id);
    });
    bar.appendChild(delBtn);
  }

  return bar;
}

function buildReplyQuote(replyTo) {
  const box = document.createElement('div');
  box.className = 'msg-quote';
  box.title = '點擊跳轉至原訊息';

  if (replyTo.type === 'sticker') {
    box.appendChild(createFluentImg(replyTo.preview, 'msg-quote-thumb'));
  } else if (replyTo.type === 'image' && replyTo.fileId) {
    box.appendChild(createDriveImageEl(replyTo.fileId, {
      token: state.token,
      size: 120,
      className: 'msg-quote-img-thumb',
      alt: '圖片縮圖',
    }));
  }

  const textWrap = document.createElement('div');
  textWrap.className = 'msg-quote-text';

  const sender = document.createElement('div');
  sender.className = 'msg-quote-sender';
  sender.textContent = replyTo.senderName || '使用者';

  const snippet = document.createElement('div');
  snippet.className = 'msg-quote-snippet';
  if (replyTo.type === 'sticker') {
    const emoji = getEmojiById(replyTo.preview);
    snippet.textContent = `[貼圖] ${emoji.label}`;
  } else {
    snippet.textContent = replyTo.preview || '';
  }

  textWrap.appendChild(sender);
  textWrap.appendChild(snippet);
  box.appendChild(textWrap);

  box.addEventListener('click', (e) => {
    e.stopPropagation();
    if (replyTo.id) jumpToMessage(replyTo.id);
  });

  return box;
}

function fillReactionPills(container, msg) {
  container.textContent = '';
  const reactions = msg.reactions || {};
  const entries = Object.entries(reactions).filter(([, list]) => Array.isArray(list) && list.length > 0);
  if (entries.length === 0) return;

  for (const [emojiId, users] of entries) {
    const emoji = getEmojiById(emojiId);
    const reactedByMe = users.some((u) => u && u.id === state.user.id);

    const pill = document.createElement('button');
    pill.type = 'button';
    pill.className = 'reaction-pill' + (reactedByMe ? ' reacted' : '');
    const names = users.map((u) => u.name).join('、');
    pill.title = `${emoji.label}：${names}`;

    pill.appendChild(createFluentImg(emoji, 'reaction-pill-img'));
    const count = document.createElement('span');
    count.textContent = String(users.length);
    pill.appendChild(count);

    pill.addEventListener('click', (e) => {
      e.stopPropagation();
      handleToggleReaction(msg.id, emojiId);
    });

    container.appendChild(pill);
  }
}

function jumpToMessage(msgId) {
  const target = els.messagesList.querySelector(`.msg-row[data-msg-id="${CSS.escape(msgId)}"]`);
  if (!target) {
    showToast('原訊息不在目前載入範圍內');
    return;
  }
  target.scrollIntoView({ behavior: 'smooth', block: 'center' });
  target.classList.remove('highlight-flash');
  void target.offsetWidth;
  target.classList.add('highlight-flash');
  setTimeout(() => target.classList.remove('highlight-flash'), 1600);
}

// ==================== 發送訊息 / 編輯 / 圖片 / 貼圖 / 回覆 / 表情 / 收回 ====================
function setReplyTarget(msg) {
  if (state.editTarget) cancelEditMode();

  let preview = '';
  let fileId = '';
  if (msg.type === 'sticker') {
    preview = msg.content;
  } else if (msg.type === 'image') {
    const imgMeta = parseImageContent(msg.content);
    fileId = imgMeta.fileId;
    preview = imgMeta.caption ? `[圖片] ${imgMeta.caption.slice(0, 60)}` : '[圖片]';
  } else {
    preview = msg.content.slice(0, 80);
  }

  state.replyTarget = {
    id: msg.id,
    senderName: msg.senderName,
    type: msg.type,
    preview,
    fileId,
  };
  els.replyBarSender.textContent = msg.senderName;
  if (msg.type === 'sticker') {
    els.replyBarPreview.textContent = `[貼圖] ${getEmojiById(msg.content).label}`;
  } else {
    els.replyBarPreview.textContent = preview;
  }
  els.replyBar.classList.remove('hidden');
  els.messageInput.focus();
}

function clearReplyTarget() {
  state.replyTarget = null;
  els.replyBar.classList.add('hidden');
}

function startEditMessage(msg) {
  clearReplyTarget();
  clearPendingImage();
  closeStickerPopover();
  closeReactionPicker();

  let originalText = '';
  if (msg.type === 'image') {
    originalText = parseImageContent(msg.content).caption || '';
  } else {
    originalText = msg.content || '';
  }

  state.editTarget = {
    id: msg.id,
    type: msg.type,
    originalText,
  };

  els.editBarPreview.textContent = msg.type === 'image'
    ? (originalText ? `[圖片說明] ${originalText}` : '[圖片] 新增或修改說明文字')
    : originalText.slice(0, 80);
  els.editBar.classList.remove('hidden');
  els.sendBtn.classList.add('editing');
  els.sendBtn.title = '儲存編輯';

  els.messageInput.value = originalText;
  autoResizeInput();
  els.messageInput.focus();
  els.messageInput.selectionStart = els.messageInput.selectionEnd = els.messageInput.value.length;
}

function cancelEditMode() {
  if (!state.editTarget) return;
  state.editTarget = null;
  els.editBar.classList.add('hidden');
  els.sendBtn.classList.remove('editing');
  els.sendBtn.title = '送出訊息';
  els.messageInput.value = '';
  autoResizeInput();
}

async function handleComposerSubmit() {
  if (state.editTarget) {
    await handleSaveEdit();
    return;
  }
  if (state.pendingImage) {
    await handleSendImage();
    return;
  }
  await handleSendText();
}

async function handleSaveEdit() {
  const target = state.editTarget;
  const channelId = state.currentChannelId;
  if (!target || !channelId) return;

  const newText = els.messageInput.value.trim();
  if (target.type === 'text' && !newText) {
    showToast('訊息內容不可為空', 'error');
    return;
  }
  if (newText === target.originalText) {
    cancelEditMode();
    return;
  }

  const msgMap = getChannelMsgMap(channelId);
  const msg = msgMap.get(target.id);
  if (!msg) {
    cancelEditMode();
    return;
  }

  const backup = { ...msg };
  if (target.type === 'image') {
    const imgObj = parseImageContent(msg.content);
    imgObj.caption = newText;
    msg.content = JSON.stringify(imgObj);
  } else {
    msg.content = newText;
  }
  msg.editedAt = Date.now();
  cancelEditMode();
  renderMessages();

  try {
    const res = await apiPost(
      'editMessage',
      { channelId, msgId: target.id, content: newText },
      { token: state.token }
    );
    if (res.message) {
      msgMap.set(res.message.id, res.message);
      if (state.currentChannelId === channelId) renderMessages();
    }
    showToast('訊息已更新', 'success');
  } catch (err) {
    msgMap.set(target.id, backup);
    if (state.currentChannelId === channelId) renderMessages();
    showToast('編輯失敗：' + err.message, 'error');
  }
}

async function attachImageFile(file) {
  try {
    const processed = await processImageFile(file);
    state.pendingImage = processed;
    els.imagePreviewThumb.src = processed.dataUrl;
    els.imagePreviewName.textContent = processed.name;
    els.imagePreviewMeta.textContent =
      `${processed.width} × ${processed.height} • ${formatBytes(processed.sizeBytes)} • 按 Enter 送出，可附加說明文字`;
    els.imagePreviewBar.classList.remove('hidden');
    closeStickerPopover();
    els.messageInput.focus();
  } catch (err) {
    showToast(err.message || '圖片處理失敗', 'error');
  }
}

function clearPendingImage() {
  state.pendingImage = null;
  els.imagePreviewThumb.removeAttribute('src');
  els.imagePreviewBar.classList.add('hidden');
}

async function handleSendImage() {
  const img = state.pendingImage;
  const channelId = state.currentChannelId;
  if (!img || !channelId) return;

  const caption = els.messageInput.value.trim().slice(0, 500);
  const reply = state.replyTarget ? { ...state.replyTarget } : null;

  clearPendingImage();
  clearReplyTarget();
  els.messageInput.value = '';
  autoResizeInput();

  const tempId = 'temp_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
  const optimisticMsg = {
    id: tempId,
    channelId,
    senderId: state.user.id,
    senderName: state.user.displayName,
    type: 'image',
    content: JSON.stringify({
      fileId: '',
      caption,
      width: img.width,
      height: img.height,
      mime: img.mime,
    }),
    replyToId: reply ? reply.id : '',
    replyTo: reply,
    reactions: {},
    createdAt: Date.now(),
    updatedAt: Date.now(),
    editedAt: 0,
    isDeleted: false,
    _sending: true,
    _previewUrl: img.dataUrl,
  };

  const msgMap = getChannelMsgMap(channelId);
  msgMap.set(tempId, optimisticMsg);
  renderMessages({ forceScrollBottom: true });

  try {
    const res = await apiPost(
      'sendMessage',
      {
        channelId,
        type: 'image',
        imageData: img.base64,
        imageMime: img.mime,
        caption,
        width: img.width,
        height: img.height,
        replyToId: reply ? reply.id : '',
      },
      { token: state.token }
    );
    const savedMeta = parseImageContent(res.message.content);
    if (savedMeta.fileId) {
      cacheImageDataUrl(savedMeta.fileId, img.dataUrl);
    }
    msgMap.delete(tempId);
    msgMap.set(res.message.id, res.message);
    state.channelLastMsgAt.set(channelId, Number(res.message.createdAt || Date.now()));
    markCurrentChannelRead();
    if (state.currentChannelId === channelId) {
      renderMessages({ forceScrollBottom: true });
    }
  } catch (err) {
    msgMap.delete(tempId);
    if (state.currentChannelId === channelId) {
      renderMessages();
      // 還原待傳圖片方便重試
      state.pendingImage = img;
      els.imagePreviewThumb.src = img.dataUrl;
      els.imagePreviewName.textContent = img.name;
      els.imagePreviewMeta.textContent =
        `${img.width} × ${img.height} • ${formatBytes(img.sizeBytes)} • 按 Enter 重試送出`;
      els.imagePreviewBar.classList.remove('hidden');
      if (caption && !els.messageInput.value) {
        els.messageInput.value = caption;
        autoResizeInput();
      }
    }
    showToast('圖片上傳失敗：' + err.message, 'error');
  }
}

function openLightbox(imgMeta, fallbackSrc) {
  const cached = imgMeta.fileId ? getCachedImageDataUrl(imgMeta.fileId) : '';
  const highResUrl = cached
    || (imgMeta.fileId ? `https://lh3.googleusercontent.com/d/${encodeURIComponent(imgMeta.fileId)}=w2400` : fallbackSrc);

  els.lightboxImg.onerror = () => {
    if (fallbackSrc && els.lightboxImg.src !== fallbackSrc) {
      els.lightboxImg.src = fallbackSrc;
    }
  };
  els.lightboxImg.src = highResUrl || fallbackSrc || '';

  if (imgMeta.caption) {
    els.lightboxCaption.textContent = imgMeta.caption;
    els.lightboxCaption.classList.remove('hidden');
  } else {
    els.lightboxCaption.classList.add('hidden');
  }
  els.lightboxModal.classList.remove('hidden');
}

function closeLightbox() {
  els.lightboxModal.classList.add('hidden');
  els.lightboxImg.removeAttribute('src');
}

async function handleSendText() {
  const text = els.messageInput.value.trim();
  if (!text || !state.currentChannelId) return;

  els.messageInput.value = '';
  autoResizeInput();
  await sendPayload('text', text);
}

async function handleSendSticker(emojiId) {
  if (!state.currentChannelId) return;
  if (state.editTarget) cancelEditMode();
  pushRecentSticker(emojiId);
  closeStickerPopover();
  await sendPayload('sticker', emojiId);
}

async function sendPayload(type, content) {
  const channelId = state.currentChannelId;
  const reply = state.replyTarget ? { ...state.replyTarget } : null;
  clearReplyTarget();

  const tempId = 'temp_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
  const optimisticMsg = {
    id: tempId,
    channelId,
    senderId: state.user.id,
    senderName: state.user.displayName,
    type,
    content,
    replyToId: reply ? reply.id : '',
    replyTo: reply,
    reactions: {},
    createdAt: Date.now(),
    updatedAt: Date.now(),
    isDeleted: false,
    _sending: true,
  };

  const msgMap = getChannelMsgMap(channelId);
  msgMap.set(tempId, optimisticMsg);
  renderMessages({ forceScrollBottom: true });

  try {
    const res = await apiPost(
      'sendMessage',
      {
        channelId,
        type,
        content,
        replyToId: reply ? reply.id : '',
      },
      { token: state.token }
    );
    msgMap.delete(tempId);
    msgMap.set(res.message.id, res.message);
    state.channelLastMsgAt.set(channelId, Number(res.message.createdAt || Date.now()));
    markCurrentChannelRead();
    if (state.currentChannelId === channelId) {
      renderMessages({ forceScrollBottom: true });
    }
  } catch (err) {
    msgMap.delete(tempId);
    if (state.currentChannelId === channelId) {
      renderMessages();
      if (type === 'text' && !els.messageInput.value) {
        els.messageInput.value = content;
        autoResizeInput();
      }
    }
    showToast('傳送失敗：' + err.message, 'error');
  }
}

async function handleToggleReaction(msgId, emojiId) {
  const channelId = state.currentChannelId;
  if (!channelId) return;
  closeReactionPicker();

  const msgMap = getChannelMsgMap(channelId);
  const msg = msgMap.get(msgId);
  if (!msg || msg._sending || msg.isDeleted) return;

  // 樂觀更新表情
  const prevReactions = JSON.parse(JSON.stringify(msg.reactions || {}));
  const nextReactions = JSON.parse(JSON.stringify(prevReactions));
  const list = Array.isArray(nextReactions[emojiId]) ? nextReactions[emojiId] : [];
  const idx = list.findIndex((u) => u && u.id === state.user.id);
  if (idx >= 0) {
    list.splice(idx, 1);
  } else {
    list.push({ id: state.user.id, name: state.user.displayName });
  }
  if (list.length === 0) {
    delete nextReactions[emojiId];
  } else {
    nextReactions[emojiId] = list;
  }

  msg.reactions = nextReactions;
  patchMessageReactionsDom(msg);

  try {
    const res = await apiPost(
      'toggleReaction',
      { channelId, msgId, emojiId },
      { token: state.token }
    );
    msg.reactions = res.reactions || {};
    msg.updatedAt = res.updatedAt || msg.updatedAt;
    patchMessageReactionsDom(msg);
  } catch (err) {
    msg.reactions = prevReactions;
    patchMessageReactionsDom(msg);
    showToast('表情更新失敗：' + err.message, 'error');
  }
}

function patchMessageReactionsDom(msg) {
  const row = els.messagesList.querySelector(`.msg-row[data-msg-id="${CSS.escape(msg.id)}"]`);
  if (!row) return;
  const reactionsEl = row.querySelector('.msg-reactions');
  if (reactionsEl) {
    fillReactionPills(reactionsEl, msg);
  }
}

async function handleDeleteMessage(msgId) {
  const channelId = state.currentChannelId;
  if (!channelId) return;
  if (!confirm('確定要收回這則訊息嗎？')) return;

  const msgMap = getChannelMsgMap(channelId);
  const msg = msgMap.get(msgId);
  if (!msg) return;

  const backup = { ...msg };
  msg.isDeleted = true;
  msg.content = '';
  msg.reactions = {};
  renderMessages();

  try {
    await apiPost('deleteMessage', { channelId, msgId }, { token: state.token });
    showToast('訊息已收回');
  } catch (err) {
    msgMap.set(msgId, backup);
    renderMessages();
    showToast('收回失敗：' + err.message, 'error');
  }
}

// ==================== 貼圖與表情選擇器 ====================
function toggleStickerPopover() {
  const opening = els.stickerPopover.classList.contains('hidden');
  if (opening) {
    closeReactionPicker();
    renderStickerPopover();
    els.stickerPopover.classList.remove('hidden');
    els.toggleStickerBtn.classList.add('active');
  } else {
    closeStickerPopover();
  }
}

function closeStickerPopover() {
  els.stickerPopover.classList.add('hidden');
  els.toggleStickerBtn.classList.remove('active');
}

function renderStickerPopover() {
  const isSticker = state.pickerMode === 'sticker';
  els.pickerTabSticker.classList.toggle('active', isSticker);
  els.pickerTabEmoji.classList.toggle('active', !isSticker);

  // 分類切換列
  els.pickerCats.textContent = '';
  const tabs = ['全部', ...EMOJI_CATEGORIES];
  for (const cat of tabs) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'picker-cat-btn' + (state.pickerCategory === cat ? ' active' : '');
    btn.textContent = cat;
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      state.pickerCategory = cat;
      renderStickerPopover();
      els.pickerBody.scrollTop = 0;
    });
    els.pickerCats.appendChild(btn);
  }

  els.pickerBody.textContent = '';
  const selectedCats = state.pickerCategory === '全部'
    ? EMOJI_CATEGORIES
    : [state.pickerCategory];

  if (isSticker) {
    if (state.pickerCategory === '全部') {
      const recentIds = getRecentStickerIds();
      if (recentIds.length > 0) {
        appendStickerSection('最近使用', recentIds.map((id) => getEmojiById(id)));
      }
    }
    for (const cat of selectedCats) {
      const items = EMOJI_LIST.filter((e) => e.cat === cat);
      appendStickerSection(cat, items);
    }
  } else {
    const items = state.pickerCategory === '全部'
      ? EMOJI_LIST
      : EMOJI_LIST.filter((e) => e.cat === state.pickerCategory);
    const grid = document.createElement('div');
    grid.className = 'emoji-grid';
    for (const emoji of items) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'emoji-tile';
      btn.title = emoji.label;
      btn.appendChild(createFluentImg(emoji, 'emoji-tile-img'));
      btn.addEventListener('click', () => {
        insertAtCursor(els.messageInput, emoji.char);
        autoResizeInput();
        els.messageInput.focus();
      });
      grid.appendChild(btn);
    }
    els.pickerBody.appendChild(grid);
  }
}

function appendStickerSection(title, items) {
  if (!items.length) return;
  const label = document.createElement('div');
  label.className = 'picker-section-label';
  label.textContent = title;
  els.pickerBody.appendChild(label);

  const grid = document.createElement('div');
  grid.className = 'sticker-grid';
  for (const emoji of items) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'sticker-tile';
    btn.title = `傳送「${emoji.label}」貼圖`;
    btn.appendChild(createFluentImg(emoji, 'sticker-tile-img'));
    const txt = document.createElement('span');
    txt.className = 'sticker-tile-label';
    txt.textContent = emoji.label;
    btn.appendChild(txt);
    btn.addEventListener('click', () => handleSendSticker(emoji.id));
    grid.appendChild(btn);
  }
  els.pickerBody.appendChild(grid);
}

function openReactionPicker(msgId, anchorBtn) {
  closeStickerPopover();
  state.reactionPickerMsgId = msgId;
  els.reactionPicker.textContent = '';

  for (const emoji of EMOJI_LIST) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'emoji-tile';
    btn.title = emoji.label;
    btn.appendChild(createFluentImg(emoji, 'emoji-tile-img'));
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      handleToggleReaction(msgId, emoji.id);
    });
    els.reactionPicker.appendChild(btn);
  }

  els.reactionPicker.classList.remove('hidden');
  const rect = anchorBtn.getBoundingClientRect();
  const pw = els.reactionPicker.offsetWidth || 296;
  const ph = els.reactionPicker.offsetHeight || 220;

  let left = rect.left - pw / 2 + rect.width / 2;
  left = Math.max(12, Math.min(left, window.innerWidth - pw - 12));
  let top = rect.top - ph - 8;
  if (top < 12) top = rect.bottom + 8;

  els.reactionPicker.style.left = left + 'px';
  els.reactionPicker.style.top = top + 'px';
}

function closeReactionPicker() {
  state.reactionPickerMsgId = null;
  els.reactionPicker.classList.add('hidden');
}

// ==================== 工具函式 ====================
function renderSafeTextWithLinks(container, text) {
  const regex = /(https?:\/\/[^\s<>"']+)/g;
  const parts = String(text || '').split(regex);
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (!part) continue;
    if (i % 2 === 1 && /^https?:\/\//i.test(part)) {
      const a = document.createElement('a');
      a.href = part;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.textContent = part;
      container.appendChild(a);
    } else {
      container.appendChild(document.createTextNode(part));
    }
  }
}

function markCurrentChannelRead() {
  if (!state.currentChannelId) return;
  state.lastRead[state.currentChannelId] = Date.now();
  localStorage.setItem(READ_KEY, JSON.stringify(state.lastRead));
}

function isNearBottom() {
  const el = els.messagesList;
  return el.scrollHeight - el.scrollTop - el.clientHeight < 90;
}

function scrollToBottom(smooth) {
  els.messagesList.scrollTo({
    top: els.messagesList.scrollHeight,
    behavior: smooth ? 'smooth' : 'auto',
  });
}

function autoResizeInput() {
  const el = els.messageInput;
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 130) + 'px';
}

function insertAtCursor(textarea, value) {
  const start = textarea.selectionStart ?? textarea.value.length;
  const end = textarea.selectionEnd ?? textarea.value.length;
  textarea.value = textarea.value.slice(0, start) + value + textarea.value.slice(end);
  const pos = start + value.length;
  textarea.selectionStart = textarea.selectionEnd = pos;
}

function toggleSidebar(open) {
  els.sidebar.classList.toggle('open', open);
  els.sidebarBackdrop.classList.toggle('hidden', !open);
}

function openModal(modal) {
  modal.classList.remove('hidden');
}

function closeModal(modal) {
  modal.classList.add('hidden');
}

function setBtnLoading(btn, loading, text) {
  btn.disabled = loading;
  btn.textContent = text;
}

function showToast(message, type = 'info') {
  const el = document.createElement('div');
  el.className = 'toast' + (type === 'error' ? ' error' : type === 'success' ? ' success' : '');
  el.textContent = message;
  els.toastContainer.appendChild(el);
  setTimeout(() => el.remove(), 3400);
}

function saveSession() {
  localStorage.setItem(SESSION_KEY, JSON.stringify({
    token: state.token,
    user: state.user,
  }));
}

function clearSession() {
  state.token = '';
  state.user = null;
  state.userProfiles = {};
  state.channels = [];
  state.currentChannelId = null;
  state.messagesByChannel.clear();
  state.channelVersion.clear();
  state.channelLastMsgAt.clear();
  state.globalVersion = 0;
  clearReplyTarget();
  cancelEditMode();
  clearPendingImage();
  closeLightbox();
  clearUnreadTitle();
  localStorage.removeItem(SESSION_KEY);
}

function loadJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function getInitial(name) {
  const s = String(name || '?').trim();
  return s ? s.charAt(0).toUpperCase() : '?';
}

function colorFromId(str) {
  let hash = 0;
  const s = String(str || '');
  for (let i = 0; i < s.length; i++) {
    hash = ((hash << 5) - hash) + s.charCodeAt(i);
    hash |= 0;
  }
  return AVATAR_PALETTE[Math.abs(hash) % AVATAR_PALETTE.length];
}

function formatTime(ms) {
  if (!ms) return '';
  const d = new Date(ms);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

function formatDateDivider(ms) {
  const d = new Date(ms || Date.now());
  const now = new Date();
  const sameDay = (a, b) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();

  if (sameDay(d, now)) return '今天';
  const yesterday = new Date(now.getTime() - 86400 * 1000);
  if (sameDay(d, yesterday)) return '昨天';
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
}
