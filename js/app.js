import { CONFIG, getGasUrl } from './config.js?v=20';
import { apiPost, setUnauthorizedHandler } from './api.js?v=20';
import {
  getLanguage,
  setLanguage,
  getLanguageMeta,
  t,
  applyDomTranslations,
} from './i18n.js?v=24';
import {
  EMOJI_CATEGORIES,
  EMOJI_LIST,
  QUICK_EMOJIS,
  getEmojiById,
  createFluentImg,
  getRecentStickerIds,
  pushRecentSticker,
} from './emojis.js?v=20';
import {
  isNotifyEnabled,
  getNotifyPermission,
  getLocalNotifySettings,
  saveLocalNotifySettings,
  requestBrowserPermission,
  toggleNotifications,
  testBrowserPopup,
  formatIncomingNotification,
  notifyIncomingMessage,
  unlockAudio,
} from './notify.js?v=20';
import {
  parseImageContent,
  processImageFile,
  processAvatarFile,
  createDriveImageEl,
  cacheImageDataUrl,
  getCachedImageDataUrl,
  formatBytes,
} from './images.js?v=20';
import {
  AVATAR_PRESETS,
  renderAvatarEl,
} from './avatars.js?v=20';

const SESSION_KEY = CONFIG.STORAGE_PREFIX + 'session';
const READ_KEY = CONFIG.STORAGE_PREFIX + 'last_read';
const THEME_KEY = CONFIG.STORAGE_PREFIX + 'theme';
const LAST_CHANNEL_KEY = CONFIG.STORAGE_PREFIX + 'last_channel';
const PRIVACY_KEY = CONFIG.STORAGE_PREFIX + 'privacy_mirror';
const INPUT_PRIVACY_KEY = CONFIG.STORAGE_PREFIX + 'input_privacy';
const NOTES_OPEN_KEY = CONFIG.STORAGE_PREFIX + 'notes_open';
const LOGIN_DEVICE_KEY = CONFIG.STORAGE_PREFIX + 'login_device';

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
  pendingUnreadAnchor: null,    // { channelId, sinceTs } 切換頻道時跳轉到第一則未讀或最新訊息
  privacyMirror: false,
  inputPrivacy: false,
  inputBlurTimer: null,
  isInputComposing: false,
  loginDeviceDraft: '',         // 'mobile' | 'desktop'
  devices: null,                // { mobile: { active, loginAt, isCurrent }, desktop: { ... } }
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
  consecutiveSyncErrors: 0,
  renderedChannelId: null,
  inFlightReactions: new Map(), // msgId -> 進行中表情請求數（避免舊輪詢蓋掉樂觀狀態）
  reactionQueue: new Map(),     // msgId -> Promise 佇列（連點多顆表情依序送出不打架）
  notesOpen: true,
  noteComposerColor: 'yellow',
  editingNoteId: null,
  draggingNoteId: null,
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
  openSettingsBtn: $('open-settings-btn'),
  toggleNotesBtn: $('toggle-notes-btn'),
  notesCountBadge: $('notes-count-badge'),
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
  inputPrivacyBtn: $('input-privacy-btn'),
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

  notesSidebar: $('notes-sidebar'),
  addNoteBtn: $('add-note-btn'),
  closeNotesBtn: $('close-notes-btn'),
  noteComposer: $('note-composer'),
  noteComposerInput: $('note-composer-input'),
  noteComposerColors: $('note-composer-colors'),
  noteComposerCancel: $('note-composer-cancel'),
  noteComposerSave: $('note-composer-save'),
  notesList: $('notes-list'),

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
  channelSettingsForm: $('channel-settings-form'),
  infoChannelTitle: $('info-channel-title'),
  infoNameEditBlock: $('info-name-edit-block'),
  infoChannelNameInput: $('info-channel-name-input'),
  infoChannelOwner: $('info-channel-owner'),
  infoInviteRow: $('info-invite-row'),
  infoInviteCode: $('info-invite-code'),
  infoCopyInviteBtn: $('info-copy-invite-btn'),
  infoMembersHint: $('info-members-hint'),
  infoMembersList: $('info-members-list'),
  infoChannelError: $('info-channel-error'),
  infoOwnerFooter: $('info-owner-footer'),
  infoSaveBtn: $('info-save-btn'),

  modalAvatar: $('modal-avatar'),
  profileDisplayNameInput: $('profile-displayname-input'),
  deviceOptMobile: $('device-opt-mobile'),
  deviceOptDesktop: $('device-opt-desktop'),
  devicesStatusList: $('devices-status-list'),
  profileSaveError: $('profile-save-error'),
  avatarModalPreview: $('avatar-modal-preview'),
  avatarUploadBtn: $('avatar-upload-btn'),
  avatarFileInput: $('avatar-file-input'),
  avatarPresetGrid: $('avatar-preset-grid'),
  avatarSaveBtn: $('avatar-save-btn'),

  modalSettings: $('modal-settings'),
  settingsForm: $('settings-form'),
  settingLanguage: $('setting-language'),
  settingsPermBadge: $('settings-perm-badge'),
  settingDesktopNotify: $('setting-desktop-notify'),
  settingSoundNotify: $('setting-sound-notify'),
  settingPopupTiming: $('setting-popup-timing'),
  settingRxPrivacy: $('setting-rx-privacy'),
  settingsTestPopupBtn: $('settings-test-popup-btn'),
  settingsPermHint: $('settings-perm-hint'),
  settingOutgoingMode: $('setting-outgoing-mode'),
  settingOutgoingTitleWrap: $('setting-outgoing-title-wrap'),
  settingOutgoingTitle: $('setting-outgoing-title'),
  settingOutgoingBodyWrap: $('setting-outgoing-body-wrap'),
  settingOutgoingBody: $('setting-outgoing-body'),
  settingPreviewTitle: $('setting-preview-title'),
  settingPreviewBody: $('setting-preview-body'),
  settingsSaveError: $('settings-save-error'),
  settingsSaveBtn: $('settings-save-btn'),

  toastContainer: $('toast-container'),

  authLangBtn: $('auth-lang-btn'),
  authLangLabel: $('auth-lang-label'),
  authLangMenu: $('auth-lang-menu'),
  langToggleBtn: $('lang-toggle-btn'),
  appLangLabel: $('app-lang-label'),
  langMenu: $('lang-menu'),
};

// ==================== 初始化 ====================
init();

async function init() {
  initViewportHeight();
  initTheme();
  initLanguage();
  initPrivacyMirror();
  initInputPrivacy();
  initNotesPanel();
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
      if (meRes.devices) state.devices = meRes.devices;
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

function initViewportHeight() {
  const vv = window.visualViewport;
  const syncHeight = () => {
    const h = vv ? vv.height : window.innerHeight;
    if (h > 0) {
      document.documentElement.style.setProperty('--app-height', `${Math.round(h)}px`);
    }
    if (state.token && document.activeElement === els.messageInput) {
      scrollToBottom(false);
    }
  };
  syncHeight();
  if (vv) {
    vv.addEventListener('resize', syncHeight);
    vv.addEventListener('scroll', () => {
      if (state.token && window.scrollY !== 0) {
        window.scrollTo(0, 0);
      }
    });
  } else {
    window.addEventListener('resize', syncHeight);
  }
}

function initLanguage() {
  applyLanguage(getLanguage(), { silent: true });
}

function closeLangMenus() {
  if (els.authLangMenu) els.authLangMenu.classList.add('hidden');
  if (els.langMenu) els.langMenu.classList.add('hidden');
}

function applyLanguage(lang, { silent = false } = {}) {
  const code = setLanguage(lang);
  const meta = getLanguageMeta(code);

  if (els.authLangLabel) els.authLangLabel.textContent = meta.short;
  if (els.appLangLabel) els.appLangLabel.textContent = meta.short;
  if (els.settingLanguage) els.settingLanguage.value = code;

  document.querySelectorAll('.lang-option').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.lang === code);
  });

  applyDomTranslations();

  if (state.user) {
    renderMeProfile();
    renderChannelList();
    renderCurrentChannelView();
    renderMessages();
    if (!els.modalAvatar.classList.contains('hidden')) {
      renderDevicesStatusList();
    }
    if (!els.modalSettings.classList.contains('hidden')) {
      updateOutgoingSettingsPreview();
    }
  }

  if (!silent) {
    showToast(t('toastLangChanged', { label: meta.label }), 'info');
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

// ==================== 輸入框防窺（輸入後 1 秒模糊） ====================
function initInputPrivacy() {
  applyInputPrivacy(localStorage.getItem(INPUT_PRIVACY_KEY) === '1');
}

function clearInputBlur() {
  if (state.inputBlurTimer) {
    clearTimeout(state.inputBlurTimer);
    state.inputBlurTimer = null;
  }
  if (els.messageInput) {
    els.messageInput.classList.remove('is-input-blurred');
  }
}

function resetInputBlurTimer() {
  clearInputBlur();
  if (!state.inputPrivacy || state.isInputComposing) return;
  if (!els.messageInput || !els.messageInput.value) return;
  state.inputBlurTimer = setTimeout(() => {
    state.inputBlurTimer = null;
    if (state.inputPrivacy && !state.isInputComposing && els.messageInput && els.messageInput.value) {
      els.messageInput.classList.add('is-input-blurred');
    }
  }, 1000);
}

function applyInputPrivacy(enabled) {
  state.inputPrivacy = Boolean(enabled);
  localStorage.setItem(INPUT_PRIVACY_KEY, state.inputPrivacy ? '1' : '0');
  if (els.inputPrivacyBtn) {
    els.inputPrivacyBtn.classList.toggle('active', state.inputPrivacy);
    els.inputPrivacyBtn.setAttribute('aria-pressed', state.inputPrivacy ? 'true' : 'false');
  }
  if (state.inputPrivacy) {
    resetInputBlurTimer();
  } else {
    clearInputBlur();
  }
}

function toggleInputPrivacy() {
  const next = !state.inputPrivacy;
  applyInputPrivacy(next);
  showToast(t(next ? 'toastInputPrivacyOn' : 'toastInputPrivacyOff'), 'info');
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

  // 地球語言切換（中 / 日 / 英）
  [
    { btn: els.authLangBtn, menu: els.authLangMenu },
    { btn: els.langToggleBtn, menu: els.langMenu },
  ].forEach(({ btn, menu }) => {
    if (!btn || !menu) return;
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const willOpen = menu.classList.contains('hidden');
      closeLangMenus();
      if (willOpen) menu.classList.remove('hidden');
    });
    menu.addEventListener('click', (e) => {
      const opt = e.target.closest('.lang-option');
      if (!opt) return;
      e.stopPropagation();
      closeLangMenus();
      applyLanguage(opt.dataset.lang);
    });
  });
  if (els.settingLanguage) {
    els.settingLanguage.addEventListener('change', () => {
      applyLanguage(els.settingLanguage.value);
    });
  }

  // 鈴鐺通知開關 & 設定彈窗
  els.notifyToggleBtn.addEventListener('click', async () => {
    const result = await toggleNotifications();
    renderNotifyBell();
    if (result.enabled) ringBellIcon();
    if (result.message) showToast(result.message, result.type);
    scheduleNextPoll();
  });
  els.openSettingsBtn.addEventListener('click', openSettingsModal);
  els.settingsForm.addEventListener('submit', handleSaveSettings);
  els.settingDesktopNotify.addEventListener('change', handleDesktopNotifyToggleInModal);
  els.settingsTestPopupBtn.addEventListener('click', handleTestPopupInModal);
  els.settingOutgoingMode.addEventListener('change', updateOutgoingSettingsPreview);
  els.settingOutgoingTitle.addEventListener('input', updateOutgoingSettingsPreview);
  els.settingOutgoingBody.addEventListener('input', updateOutgoingSettingsPreview);

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

  // 個人資料（名稱與頭像）設定彈窗、預覽與儲存
  els.openAvatarModalBtn.addEventListener('click', openAvatarModal);
  els.avatarUploadBtn.addEventListener('click', () => els.avatarFileInput.click());
  els.avatarFileInput.addEventListener('change', handleAvatarFileSelect);
  els.avatarSaveBtn.addEventListener('click', handleSaveAvatar);
  els.profileDisplayNameInput.addEventListener('input', () => {
    els.profileSaveError.classList.add('hidden');
    updateProfileSaveBtnState();
    renderAvatarModalPreview();
    renderAvatarPresetGrid();
  });
  els.profileDisplayNameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.isComposing && e.keyCode !== 229) {
      e.preventDefault();
      if (!els.avatarSaveBtn.disabled) handleSaveAvatar();
    }
  });
  [els.deviceOptMobile, els.deviceOptDesktop].forEach((btn) => {
    btn.addEventListener('click', () => {
      const next = btn.dataset.device === 'mobile' ? 'mobile' : 'desktop';
      state.loginDeviceDraft = next;
      renderDeviceToggle(next);
      updateProfileSaveBtnState();
    });
  });

  // 手機側邊欄 & 右側重點便條紙欄
  els.mobileMenuBtn.addEventListener('click', () => toggleSidebar(true));
  els.sidebarBackdrop.addEventListener('click', () => {
    toggleSidebar(false);
    closeMobileNotesDrawer();
  });
  els.toggleNotesBtn.addEventListener('click', toggleNotesPanel);
  els.closeNotesBtn.addEventListener('click', closeMobileNotesDrawer);
  els.addNoteBtn.addEventListener('click', openNoteComposer);
  els.noteComposerCancel.addEventListener('click', closeNoteComposer);
  els.noteComposerSave.addEventListener('click', handleSaveNewNote);
  els.noteComposerInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !e.isComposing) {
      e.preventDefault();
      handleSaveNewNote();
    }
  });
  els.noteComposerColors.querySelectorAll('.note-color-dot').forEach((dot) => {
    dot.addEventListener('click', () => {
      state.noteComposerColor = dot.dataset.color || 'yellow';
      els.noteComposerColors.querySelectorAll('.note-color-dot').forEach((d) => {
        d.classList.toggle('active', d === dot);
      });
    });
  });

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
  els.channelSettingsForm.addEventListener('submit', handleSaveChannelSettings);
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

  // 輸入框防窺獨立開關
  if (els.inputPrivacyBtn) {
    els.inputPrivacyBtn.addEventListener('click', toggleInputPrivacy);
  }

  // 輸入框（注意中文組字 isComposing 避免誤送出）
  els.messageInput.addEventListener('input', () => {
    autoResizeInput();
    resetInputBlurTimer();
  });
  els.messageInput.addEventListener('compositionstart', () => {
    state.isInputComposing = true;
    clearInputBlur();
  });
  els.messageInput.addEventListener('compositionend', () => {
    state.isInputComposing = false;
    resetInputBlurTimer();
  });
  els.messageInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && e.keyCode !== 229) {
      e.preventDefault();
      handleComposerSubmit();
    }
  });
  els.sendBtn.addEventListener('click', handleComposerSubmit);

  // 捲動到底部快速向下按鈕
  els.messagesList.addEventListener('scroll', () => {
    updateScrollBottomBtn();
    if (isNearBottom()) {
      markCurrentChannelRead();
    }
  });
  els.scrollBottomBtn.addEventListener('click', () => {
    scrollToBottom(true);
    els.scrollBottomBtn.classList.add('hidden');
    els.scrollBottomBtn.classList.remove('has-new');
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
    if (!e.target.closest('.note-card')) {
      document.querySelectorAll('.note-card.touch-active').forEach((n) => n.classList.remove('touch-active'));
    }
    if (!e.target.closest('.lang-picker-wrap')) {
      closeLangMenus();
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
    closeLangMenus();
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
    } else if (state.editingNoteId) {
      state.editingNoteId = null;
      renderNotesSidebar();
    } else if (els.noteComposer && !els.noteComposer.classList.contains('hidden')) {
      closeNoteComposer();
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

  // 網路恢復自動重連同步
  window.addEventListener('online', () => {
    if (!state.token) return;
    state.consecutiveSyncErrors = 0;
    syncNow();
  });
  window.addEventListener('offline', () => {
    if (!state.token) return;
    setSyncIndicator('error');
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
      deviceType: getLoginDevice(),
    });
    state.token = res.token;
    state.user = res.user;
    state.devices = res.devices || null;
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
      deviceType: getLoginDevice(),
    });
    state.token = res.token;
    state.user = res.user;
    state.devices = res.devices || null;
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

function detectDefaultLoginDevice() {
  const coarse = typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
  const uaMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || '');
  return (coarse || uaMobile) ? 'mobile' : 'desktop';
}

function getLoginDevice() {
  const saved = localStorage.getItem(LOGIN_DEVICE_KEY);
  if (saved === 'mobile' || saved === 'desktop') return saved;
  return detectDefaultLoginDevice();
}

function setLoginDevice(device) {
  const val = device === 'mobile' ? 'mobile' : 'desktop';
  localStorage.setItem(LOGIN_DEVICE_KEY, val);
  return val;
}

function getLoginDeviceLabel(device) {
  return device === 'mobile' ? t('deviceMobile') : t('deviceDesktop');
}

function renderDeviceToggle(selected) {
  const cur = selected === 'mobile' ? 'mobile' : 'desktop';
  els.deviceOptMobile.classList.toggle('selected', cur === 'mobile');
  els.deviceOptDesktop.classList.toggle('selected', cur === 'desktop');
}

function renderMeProfile() {
  if (!state.user) return;
  applyUserAvatar(els.meAvatar, {
    userId: state.user.id,
    displayName: state.user.displayName,
    fallbackColor: state.user.avatarColor,
  });
  els.meName.textContent = state.user.displayName;
  els.meUsername.textContent = `@${state.user.username} · ${getLoginDeviceLabel(getLoginDevice())}`;
}

function resolveUserDisplayName(userId, fallbackName = '') {
  if (state.user && userId === state.user.id) {
    return state.user.displayName || fallbackName || '使用者';
  }
  const prof = userId && state.userProfiles[userId];
  return (prof && prof.displayName) || fallbackName || '使用者';
}

function getDraftDisplayName() {
  const val = els.profileDisplayNameInput.value.trim();
  return val || (state.user ? state.user.displayName : '?');
}

function hasProfileChanges() {
  if (!state.user) return false;
  const typedName = els.profileDisplayNameInput.value.trim();
  const nameChanged = typedName.length > 0 && typedName !== state.user.displayName;
  const deviceChanged = Boolean(state.loginDeviceDraft) && state.loginDeviceDraft !== getLoginDevice();
  return Boolean(state.avatarDraft) || nameChanged || deviceChanged;
}

function updateProfileSaveBtnState() {
  els.avatarSaveBtn.disabled = !hasProfileChanges();
}

function openAvatarModal() {
  if (!state.user) return;
  toggleSidebar(false);
  state.avatarDraft = null;
  state.loginDeviceDraft = getLoginDevice();
  els.profileDisplayNameInput.value = state.user.displayName || '';
  els.profileSaveError.classList.add('hidden');
  els.avatarSaveBtn.disabled = true;
  els.avatarSaveBtn.textContent = '儲存設定';
  renderDeviceToggle(state.loginDeviceDraft);
  renderDevicesStatusList();
  renderAvatarModalPreview();
  renderAvatarPresetGrid();
  openModal(els.modalAvatar);

  // 背景向後端同步最新兩台裝置登入狀態
  apiPost('me', {}, { token: state.token }).then((res) => {
    if (res && res.devices) {
      state.devices = res.devices;
      if (!els.modalAvatar.classList.contains('hidden')) {
        renderDevicesStatusList();
      }
    }
  }).catch(() => {});
}

function renderDevicesStatusList() {
  if (!els.devicesStatusList) return;
  els.devicesStatusList.innerHTML = '';

  const devices = state.devices || {};
  const slots = [
    { key: 'mobile', label: t('deviceMobile') },
    { key: 'desktop', label: t('deviceDesktop') },
  ];

  for (const slot of slots) {
    const info = devices[slot.key] || { active: false, loginAt: 0, isCurrent: false };
    const row = document.createElement('div');
    row.className = 'device-status-row';

    const left = document.createElement('div');
    left.className = 'device-status-info';

    const nameEl = document.createElement('span');
    nameEl.className = 'device-status-name';
    nameEl.textContent = slot.label;
    left.appendChild(nameEl);

    const badge = document.createElement('span');
    badge.className = 'device-status-badge' + (info.active ? ' active' : '');
    if (info.isCurrent) {
      badge.textContent = t('deviceCurrent');
    } else if (info.active) {
      badge.textContent = t('deviceActive');
    } else {
      badge.textContent = t('deviceInactive');
    }
    left.appendChild(badge);

    if (info.active && info.loginAt) {
      const meta = document.createElement('span');
      meta.className = 'device-status-meta';
      meta.textContent = formatTime(info.loginAt);
      left.appendChild(meta);
    }

    row.appendChild(left);

    if (info.active && !info.isCurrent) {
      const logoutBtn = document.createElement('button');
      logoutBtn.type = 'button';
      logoutBtn.className = 'mini-btn';
      logoutBtn.textContent = t('btnDeviceLogout');
      logoutBtn.addEventListener('click', () => handleLogoutDevice(slot.key, logoutBtn));
      row.appendChild(logoutBtn);
    }

    els.devicesStatusList.appendChild(row);
  }
}

async function handleLogoutDevice(targetDevice, btn) {
  if (!state.token) return;
  if (btn) btn.disabled = true;
  try {
    const res = await apiPost('logoutDevice', { targetDevice }, { token: state.token });
    if (res.devices) state.devices = res.devices;
    renderDevicesStatusList();
    const label = targetDevice === 'mobile' ? '手機' : '電腦';
    showToast(`已登出${label}裝置`, 'info');
  } catch (err) {
    if (btn) btn.disabled = false;
    showToast('登出裝置失敗：' + err.message, 'error');
  }
}

function renderAvatarModalPreview() {
  if (!state.user) return;
  const previewName = getDraftDisplayName();
  const draft = state.avatarDraft;
  if (draft && draft.mode === 'upload' && draft.processed) {
    renderAvatarEl(els.avatarModalPreview, {
      displayName: previewName,
      previewDataUrl: draft.processed.dataUrl,
    });
    return;
  }
  if (draft && draft.mode === 'preset') {
    const val = draft.presetId === 'initial' ? '' : `preset:${draft.presetId}`;
    renderAvatarEl(els.avatarModalPreview, {
      displayName: previewName,
      avatarColor: state.user.avatarColor || colorFromId(state.user.id),
      avatar: val,
      token: state.token,
    });
    return;
  }
  applyUserAvatar(els.avatarModalPreview, {
    userId: state.user.id,
    displayName: previewName,
    fallbackColor: state.user.avatarColor,
  });
}

function renderAvatarPresetGrid() {
  els.avatarPresetGrid.textContent = '';
  const previewName = getDraftDisplayName();
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
      displayName: previewName,
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
  updateProfileSaveBtnState();
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
    updateProfileSaveBtnState();
    renderAvatarModalPreview();
    renderAvatarPresetGrid();
  } catch (err) {
    showToast(err.message || '圖片處理失敗', 'error');
  }
}

async function handleSaveAvatar() {
  if (!state.user) return;
  els.profileSaveError.classList.add('hidden');

  const newName = els.profileDisplayNameInput.value.trim();
  if (newName.length < 1 || newName.length > 24) {
    els.profileSaveError.textContent = '顯示名稱長度需為 1–24 字元';
    els.profileSaveError.classList.remove('hidden');
    return;
  }

  const nameChanged = newName !== state.user.displayName;
  const draft = state.avatarDraft;
  const deviceChanged = Boolean(state.loginDeviceDraft) && state.loginDeviceDraft !== getLoginDevice();
  if (!nameChanged && !draft && !deviceChanged) return;

  if (!nameChanged && !draft && deviceChanged) {
    setLoginDevice(state.loginDeviceDraft);
    renderMeProfile();
    showToast(`登入裝置已設為「${getLoginDeviceLabel(getLoginDevice())}」`, 'success');
    closeModal(els.modalAvatar);
    return;
  }

  setBtnLoading(els.avatarSaveBtn, true, '儲存中…');
  deferNextPoll();
  try {
    const payload = {};
    if (nameChanged) payload.displayName = newName;
    if (draft) {
      if (draft.mode === 'upload') {
        payload.mode = 'upload';
        payload.imageData = draft.processed.base64;
        payload.imageMime = draft.processed.mime;
      } else {
        payload.mode = 'preset';
        payload.preset = draft.presetId;
      }
    }

    const res = await apiPost('updateProfile', payload, { token: state.token });
    const avatarVal = String(res.avatar || (res.user && res.user.avatar) || state.user.avatar || '');

    if (draft && draft.mode === 'upload' && avatarVal.startsWith('drive:')) {
      cacheImageDataUrl(avatarVal.slice(6), draft.processed.dataUrl);
    }

    if (res.user) {
      state.user = res.user;
    } else {
      state.user.displayName = newName;
      state.user.avatar = avatarVal;
    }
    if (res.userProfiles) {
      state.userProfiles = res.userProfiles;
    } else {
      state.userProfiles[state.user.id] = {
        username: state.user.username,
        displayName: state.user.displayName,
        avatarColor: state.user.avatarColor,
        avatar: state.user.avatar,
      };
    }
    if (Array.isArray(res.channels)) {
      state.channels = res.channels;
      renderChannelList();
      renderCurrentChannelView();
    }

    if (deviceChanged) {
      setLoginDevice(state.loginDeviceDraft);
    }
    state.avatarDraft = null;
    saveSession();
    renderMeProfile();
    renderMessages();
    showToast('個人資料已儲存！', 'success');
    closeModal(els.modalAvatar);
  } catch (err) {
    els.profileSaveError.textContent = err.message;
    els.profileSaveError.classList.remove('hidden');
    showToast('儲存失敗：' + err.message, 'error');
  } finally {
    setBtnLoading(els.avatarSaveBtn, false, '儲存設定');
    updateProfileSaveBtnState();
  }
}

// ==================== 通知與系統設定彈窗 ====================
function openSettingsModal() {
  if (!state.user) return;
  toggleSidebar(false);
  els.settingsSaveError.classList.add('hidden');

  const local = getLocalNotifySettings();
  els.settingDesktopNotify.checked = local.desktopEnabled;
  els.settingSoundNotify.checked = local.soundEnabled;
  els.settingPopupTiming.value = local.popupTiming;
  els.settingRxPrivacy.value = local.receiverPrivacy;
  if (els.settingLanguage) els.settingLanguage.value = getLanguage();

  const prefs = (state.user.notifyPrefs && typeof state.user.notifyPrefs === 'object')
    ? state.user.notifyPrefs
    : { mode: 'normal', title: '', body: '' };
  els.settingOutgoingMode.value = prefs.mode || 'normal';
  els.settingOutgoingTitle.value = prefs.title || '';
  els.settingOutgoingBody.value = prefs.body || '';

  refreshPermissionUi();
  updateOutgoingSettingsPreview();
  openModal(els.modalSettings);
}

function refreshPermissionUi() {
  const perm = getNotifyPermission();
  els.settingsPermBadge.classList.remove('granted', 'denied');
  if (perm === 'granted') {
    els.settingsPermBadge.textContent = '已允許';
    els.settingsPermBadge.classList.add('granted');
    els.settingsPermHint.textContent = '權限正常，收到訊息可跳出瀏覽器視窗';
  } else if (perm === 'denied') {
    els.settingsPermBadge.textContent = '已被封鎖';
    els.settingsPermBadge.classList.add('denied');
    els.settingsPermHint.textContent = '請點網址列左側圖示，將「通知」改為允許後重新整理';
  } else if (perm === 'unsupported') {
    els.settingsPermBadge.textContent = '不支援';
    els.settingsPermHint.textContent = '目前瀏覽器不支援桌面彈窗通知';
  } else {
    els.settingsPermBadge.textContent = '尚未授權';
    els.settingsPermHint.textContent = '開啟上方開關或按測試鈕即可向瀏覽器請求權限';
  }
}

async function handleDesktopNotifyToggleInModal() {
  if (els.settingDesktopNotify.checked) {
    const perm = await requestBrowserPermission();
    refreshPermissionUi();
    if (perm === 'denied') {
      els.settingDesktopNotify.checked = false;
      showToast('瀏覽器已封鎖通知權限，請於網址列左側改為允許', 'error');
    } else if (perm !== 'granted' && perm !== 'unsupported') {
      els.settingDesktopNotify.checked = false;
    }
  }
}

async function handleTestPopupInModal() {
  const preview = buildDraftOutgoingPreview();
  const res = await testBrowserPopup({
    title: preview.title,
    body: preview.body,
  });
  refreshPermissionUi();
  if (res.ok) {
    els.settingDesktopNotify.checked = true;
    saveLocalNotifySettings({ desktopEnabled: true });
    renderNotifyBell();
    ringBellIcon();
  }
  showToast(res.message, res.ok ? 'success' : 'error');
}

function buildDraftOutgoingPreview() {
  const mode = els.settingOutgoingMode.value || 'normal';
  const titleInput = els.settingOutgoingTitle.value.trim();
  const bodyInput = els.settingOutgoingBody.value.trim();
  const ch = getCurrentChannel();
  const myName = (state.user && state.user.displayName) || '我';
  const chName = (ch && ch.name) || '專案討論';

  return formatIncomingNotification({
    senderPrefs: {
      mode,
      title: titleInput,
      body: bodyInput,
    },
    senderName: myName,
    channelName: chName,
    rawBody: '這是一則測試訊息內容！',
    forceHideContent: false,
  });
}

function updateOutgoingSettingsPreview() {
  const mode = els.settingOutgoingMode.value || 'normal';
  els.settingOutgoingTitleWrap.classList.toggle('hidden', mode !== 'custom');
  els.settingOutgoingBodyWrap.classList.toggle('hidden', mode === 'normal');

  if (mode === 'hidden' && !els.settingOutgoingBody.value) {
    els.settingOutgoingBody.placeholder = '預設：收到一則新訊息';
  } else if (mode === 'custom' && !els.settingOutgoingBody.value) {
    els.settingOutgoingBody.placeholder = '例如：您有一則新通知，請點擊查看';
  }

  const preview = buildDraftOutgoingPreview();
  els.settingPreviewTitle.textContent = preview.title;
  els.settingPreviewBody.textContent = preview.body;
}

async function handleSaveSettings(e) {
  e.preventDefault();
  if (!state.user) return;
  els.settingsSaveError.classList.add('hidden');

  let desktopEnabled = els.settingDesktopNotify.checked;
  if (desktopEnabled) {
    const perm = await requestBrowserPermission();
    refreshPermissionUi();
    if (perm === 'denied' || perm === 'default') {
      desktopEnabled = false;
      els.settingDesktopNotify.checked = false;
    }
  }

  saveLocalNotifySettings({
    desktopEnabled,
    soundEnabled: els.settingSoundNotify.checked,
    popupTiming: els.settingPopupTiming.value,
    receiverPrivacy: els.settingRxPrivacy.value,
  });
  renderNotifyBell();
  scheduleNextPoll();

  const nextNotifyPrefs = {
    mode: els.settingOutgoingMode.value || 'normal',
    title: els.settingOutgoingTitle.value.trim().slice(0, 50),
    body: els.settingOutgoingBody.value.trim().slice(0, 100),
  };

  setBtnLoading(els.settingsSaveBtn, true, '儲存中…');
  deferNextPoll();
  try {
    const res = await apiPost(
      'updateProfile',
      { notifyPrefs: nextNotifyPrefs },
      { token: state.token }
    );
    if (res.user) {
      state.user = res.user;
    } else {
      state.user.notifyPrefs = nextNotifyPrefs;
    }
    if (res.userProfiles) {
      state.userProfiles = res.userProfiles;
    } else if (state.userProfiles[state.user.id]) {
      state.userProfiles[state.user.id].notifyPrefs = nextNotifyPrefs;
    }
    saveSession();
    closeModal(els.modalSettings);
    showToast('通知與系統設定已儲存！', 'success');
  } catch (err) {
    els.settingsSaveError.textContent = err.message;
    els.settingsSaveError.classList.remove('hidden');
  } finally {
    setBtnLoading(els.settingsSaveBtn, false, '儲存設定');
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

  const prevLastRead = Number(state.lastRead[channelId] || 0);
  state.pendingUnreadAnchor = { channelId, sinceTs: prevLastRead };
  els.scrollBottomBtn.classList.remove('has-new');

  markCurrentChannelRead();
  renderChannelList();
  renderCurrentChannelView();
  renderMessages({ forceScrollBottom: true });

  await syncNow();
  if (state.pendingUnreadAnchor && state.pendingUnreadAnchor.channelId === channelId) {
    state.pendingUnreadAnchor = null;
  }
}

function getCurrentChannel() {
  return state.channels.find((c) => c.id === state.currentChannelId) || null;
}

function renderChannelList() {
  els.channelList.textContent = '';

  if (state.channels.length === 0) {
    const hint = document.createElement('div');
    hint.className = 'channel-empty-hint';
    hint.textContent = t('noChannelsYet');
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
    els.currentChannelName.textContent = t('selectOrCreateChannel');
    els.channelMembersBtn.classList.add('hidden');
    els.ownerInviteBar.classList.add('hidden');
    els.emptyState.classList.remove('hidden');
    els.messagesWrapper.classList.add('hidden');
    els.composerArea.classList.add('hidden');
    renderNotesSidebar();
    return;
  }

  els.currentChannelName.textContent = '# ' + ch.name;
  const memLabel = t('memberCount', { n: ch.memberCount });
  els.channelMembersBtn.textContent = ch.isOwner ? `👥 ${memLabel} ⚙` : `👥 ${memLabel}`;
  els.channelMembersBtn.title = ch.isOwner ? '頻道設定（修改名稱與管理成員）' : '檢視頻道成員';
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
  renderNotesSidebar();
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

  els.infoChannelTitle.textContent = ch.isOwner ? '頻道設定' : ('# ' + ch.name);
  els.infoChannelOwner.textContent = ch.ownerName || '建立者';
  els.infoChannelError.classList.add('hidden');

  if (ch.isOwner) {
    els.infoNameEditBlock.classList.remove('hidden');
    els.infoChannelNameInput.value = ch.name;
    els.infoMembersHint.classList.remove('hidden');
    els.infoOwnerFooter.classList.remove('hidden');
  } else {
    els.infoNameEditBlock.classList.add('hidden');
    els.infoMembersHint.classList.add('hidden');
    els.infoOwnerFooter.classList.add('hidden');
  }

  if (ch.isOwner && ch.inviteCode) {
    els.infoInviteCode.textContent = ch.inviteCode;
    els.infoInviteRow.classList.remove('hidden');
  } else {
    els.infoInviteRow.classList.add('hidden');
  }

  els.infoMembersList.textContent = '';
  const currentMemberIds = Array.isArray(ch.memberIds) && ch.memberIds.length > 0
    ? ch.memberIds
    : [ch.ownerId];
  const memberSet = new Set(currentMemberIds);

  if (ch.isOwner) {
    // 建立者檢視：僅顯示已加入此頻道的成員，可取消勾選移出成員
    const allIds = Array.from(memberSet).filter(Boolean);

    // 排序：建立者最前，其餘成員依名稱排序
    allIds.sort((a, b) => {
      if (a === ch.ownerId) return -1;
      if (b === ch.ownerId) return 1;
      const nameA = (state.userProfiles[a] && state.userProfiles[a].displayName) || a;
      const nameB = (state.userProfiles[b] && state.userProfiles[b].displayName) || b;
      return nameA.localeCompare(nameB, 'zh-Hant');
    });

    els.infoMembersHint.textContent = allIds.length > 1
      ? '僅顯示已加入此頻道的成員；取消勾選並儲存即可移出成員'
      : '僅顯示已加入此頻道的成員；可將上方邀請碼分享給朋友加入';

    for (const uid of allIds) {
      const prof = state.userProfiles[uid];
      const isOwnerRow = uid === ch.ownerId;
      const name = (prof && prof.displayName) || (isOwnerRow ? ch.ownerName : uid);
      const username = (prof && prof.username) || (uid === state.user.id ? state.user.username : '');

      const li = document.createElement('li');
      li.className = 'member-toggle-item is-checked';

      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.className = 'member-checkbox';
      cb.value = uid;
      cb.checked = true;
      if (isOwnerRow) cb.disabled = true;

      const av = document.createElement('span');
      av.className = 'avatar avatar-sm';
      applyUserAvatar(av, { userId: uid, displayName: name });

      const infoCol = document.createElement('div');
      infoCol.className = 'member-info-col';
      const nameEl = document.createElement('div');
      nameEl.className = 'member-display-name';
      nameEl.textContent = name;
      infoCol.appendChild(nameEl);
      if (username) {
        const subEl = document.createElement('div');
        subEl.className = 'member-sub';
        subEl.textContent = '@' + username;
        infoCol.appendChild(subEl);
      }

      li.appendChild(cb);
      li.appendChild(av);
      li.appendChild(infoCol);

      if (isOwnerRow) {
        const badge = document.createElement('span');
        badge.className = 'member-role-badge';
        badge.textContent = '建立者';
        li.appendChild(badge);
      } else {
        const syncStyle = () => li.classList.toggle('is-checked', cb.checked);
        cb.addEventListener('change', syncStyle);
        li.addEventListener('click', (e) => {
          if (e.target === cb) return;
          cb.checked = !cb.checked;
          syncStyle();
        });
      }

      els.infoMembersList.appendChild(li);
    }
  } else {
    // 一般成員：唯讀成員列表
    const names = ch.memberNames && ch.memberNames.length > 0 ? ch.memberNames : [state.user.displayName];
    for (let i = 0; i < currentMemberIds.length; i++) {
      const uid = currentMemberIds[i];
      const prof = state.userProfiles[uid];
      const name = (prof && prof.displayName) || names[i] || uid;
      const li = document.createElement('li');
      const av = document.createElement('span');
      av.className = 'avatar avatar-sm';
      applyUserAvatar(av, { userId: uid, displayName: name });

      const infoCol = document.createElement('div');
      infoCol.className = 'member-info-col';
      const nameEl = document.createElement('div');
      nameEl.className = 'member-display-name';
      nameEl.textContent = name;
      infoCol.appendChild(nameEl);

      li.appendChild(av);
      li.appendChild(infoCol);

      if (uid === ch.ownerId) {
        const badge = document.createElement('span');
        badge.className = 'member-role-badge';
        badge.textContent = '建立者';
        li.appendChild(badge);
      }
      els.infoMembersList.appendChild(li);
    }
  }

  openModal(els.modalChannelInfo);
}

async function handleSaveChannelSettings(e) {
  e.preventDefault();
  const ch = getCurrentChannel();
  if (!ch || !ch.isOwner) return;

  els.infoChannelError.classList.add('hidden');
  const name = els.infoChannelNameInput.value.trim();
  if (name.length < 1 || name.length > 30) {
    els.infoChannelError.textContent = '頻道名稱需為 1–30 字元';
    els.infoChannelError.classList.remove('hidden');
    return;
  }

  const checkedBoxes = els.infoMembersList.querySelectorAll('input[type="checkbox"]:checked');
  const memberIds = Array.from(checkedBoxes).map((cb) => cb.value);
  if (!memberIds.includes(ch.ownerId)) memberIds.unshift(ch.ownerId);

  setBtnLoading(els.infoSaveBtn, true, '儲存中…');
  try {
    const res = await apiPost(
      'updateChannel',
      { channelId: ch.id, name, memberIds },
      { token: state.token }
    );
    if (res.channel) {
      const idx = state.channels.findIndex((c) => c.id === ch.id);
      if (idx >= 0) state.channels[idx] = res.channel;
    }
    renderChannelList();
    renderCurrentChannelView();
    closeModal(els.modalChannelInfo);
    showToast('頻道設定已儲存！', 'success');
  } catch (err) {
    els.infoChannelError.textContent = err.message;
    els.infoChannelError.classList.remove('hidden');
  } finally {
    setBtnLoading(els.infoSaveBtn, false, '儲存設定');
  }
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

function scheduleNextPoll(minDelayMs = 0) {
  if (state.pollTimer) clearTimeout(state.pollTimer);
  if (!state.token) return;
  const hiddenDelay = isNotifyEnabled()
    ? CONFIG.NOTIFY_HIDDEN_POLL_MS
    : CONFIG.HIDDEN_POLL_MS;
  const base = document.visibilityState === 'hidden'
    ? hiddenDelay
    : CONFIG.ACTIVE_POLL_MS;

  // 網路不穩時指數退避，避免瘋狂撞牆；連上立刻歸零
  const mult = [1, 1.6, 2.5, 4, 6, 6][Math.min(state.consecutiveSyncErrors, 5)];
  const cap = document.visibilityState === 'hidden' ? 30000 : 15000;
  const delay = Math.max(minDelayMs, Math.min(Math.round(base * mult), cap));
  state.pollTimer = setTimeout(() => syncNow(), delay);
}

/**
 * 執行寫入操作（發訊息、上傳圖片、按表情、編輯）時延後下一次背景輪詢，
 * 避免輪詢與寫入在 GAS 端互搶 LockService 造成卡頓。
 */
function deferNextPoll(ms = 3200) {
  if (!state.token || state.syncInFlight) return;
  scheduleNextPoll(ms);
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
    state.consecutiveSyncErrors = 0;
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
          if (myProf) {
            let meChanged = false;
            if (myProf.avatar !== undefined && myProf.avatar !== state.user.avatar) {
              state.user.avatar = myProf.avatar;
              meChanged = true;
            }
            if (myProf.displayName && myProf.displayName !== state.user.displayName) {
              state.user.displayName = myProf.displayName;
              meChanged = true;
            }
            if (myProf.notifyPrefs && JSON.stringify(myProf.notifyPrefs) !== JSON.stringify(state.user.notifyPrefs || {})) {
              state.user.notifyPrefs = myProf.notifyPrefs;
              meChanged = true;
            }
            if (meChanged) saveSession();
          }
          renderMeProfile();
        }
      }

      const updatedOtherChannels = [];
      if (Array.isArray(res.channels)) {
        for (const ch of res.channels) {
          const prevTs = state.channelLastMsgAt.get(ch.id);
          const nextTs = Number(ch.lastMessageAt || 0);
          if (
            sinceGlobal > 0 &&
            ch.id !== targetChannelId &&
            prevTs !== undefined &&
            nextTs > prevTs &&
            ch.lastSenderId !== state.user.id
          ) {
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
          const existing = msgMap.get(msg.id);
          const existed = Boolean(existing);
          // 若該訊息目前有本機剛點下、尚在送出的表情請求，保留樂觀狀態不被舊輪詢覆蓋閃爍
          if (existed && (state.inFlightReactions.get(msg.id) || 0) > 0) {
            msg.reactions = existing.reactions;
          }
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
            updateScrollBottomBtn({ hasNew: true });
          }
        }
      }

      // 觸發鈴鐺與瀏覽器跳出視窗通知
      const isUnfocused = document.visibilityState === 'hidden' || !document.hasFocus();
      if (incomingFromOthers.length > 0) {
        const last = incomingFromOthers[incomingFromOthers.length - 1];
        const ch = getCurrentChannel();
        const chName = ch ? ch.name : 'Messenger';
        let rawBody = '';
        if (last.type === 'sticker') {
          rawBody = `[貼圖] ${getEmojiById(last.content).label}`;
        } else if (last.type === 'image') {
          const imgMeta = parseImageContent(last.content);
          rawBody = imgMeta.caption ? `[圖片] ${imgMeta.caption.slice(0, 60)}` : '[圖片]';
        } else {
          rawBody = last.content.slice(0, 80);
        }

        const senderProf = state.userProfiles[last.senderId] || null;
        const senderName = resolveUserDisplayName(last.senderId, last.senderName);
        const formatted = formatIncomingNotification({
          senderPrefs: senderProf && senderProf.notifyPrefs,
          senderName,
          channelName: chName,
          rawBody,
          forceHideContent: state.privacyMirror,
        });

        ringBellIcon();
        notifyIncomingMessage({
          title: formatted.title,
          body: formatted.body,
          tag: `ch-${targetChannelId}`,
          isUnfocused,
          onClick: () => scrollToBottom(true),
          onFallbackPopup: ({ title, body }) => showToast(`${title}：${body}`),
        });

        if (isUnfocused) {
          state.unreadTitleCount += incomingFromOthers.length;
          document.title = `(${state.unreadTitleCount}) 新訊息 - Messenger`;
        }
      } else if (updatedOtherChannels.length > 0) {
        const ch = updatedOtherChannels[0];
        const senderProf = ch.lastSenderId ? state.userProfiles[ch.lastSenderId] : null;
        const senderName = (senderProf && senderProf.displayName) || '頻道成員';
        const formatted = formatIncomingNotification({
          senderPrefs: senderProf && senderProf.notifyPrefs,
          senderName,
          channelName: ch.name,
          rawBody: '收到新訊息，點擊切換查看',
          forceHideContent: state.privacyMirror,
        });

        ringBellIcon();
        notifyIncomingMessage({
          title: formatted.title,
          body: formatted.body,
          tag: `ch-${ch.id}`,
          isUnfocused,
          onClick: () => selectChannel(ch.id),
          onFallbackPopup: ({ title, body }) => showToast(`${title}：${body}`),
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
    if (err && String(err.message || '').includes('存取權限')) {
      state.currentChannelId = null;
      showToast('你已被移出該頻道', 'info');
      state.syncInFlight = false;
      loadInitialData().catch(() => {});
      return;
    }
    state.consecutiveSyncErrors = Math.min(state.consecutiveSyncErrors + 1, 5);
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

function getAvatarSig(senderId) {
  const isMe = state.user && senderId === state.user.id;
  const prof = state.userProfiles[senderId];
  const name = isMe ? (state.user.displayName || '') : ((prof && prof.displayName) || '');
  const color = (isMe && state.user.avatarColor) || (prof && prof.avatarColor) || '';
  const av = isMe ? (state.user.avatar || (prof && prof.avatar) || '') : ((prof && prof.avatar) || '');
  return `${name}|${color}|${av}`;
}

function computeMsgCoreSig(msg, compact) {
  return [
    msg.type,
    msg.content,
    msg.isDeleted ? 1 : 0,
    msg.editedAt || 0,
    msg._sending ? 1 : 0,
    compact ? 1 : 0,
    getAvatarSig(msg.senderId),
  ].join('\u0001');
}

function renderMessages({ forceScrollBottom = false, forceFull = false } = {}) {
  const channelId = state.currentChannelId;
  if (!channelId) return;

  const list = getSortedMessages(channelId);
  const canPatch = !forceFull && state.renderedChannelId === channelId && list.length > 0;

  if (list.length === 0) {
    els.messagesList.textContent = '';
    const empty = document.createElement('div');
    empty.className = 'messages-empty';
    empty.textContent = t('noMessagesYet');
    els.messagesList.appendChild(empty);
    state.renderedChannelId = channelId;
    return;
  }

  // 收集現有 DOM 節點以便原地複用（零閃爍、不重載圖片與貼圖）
  const existingRows = new Map();
  const existingDividers = new Map();
  if (canPatch) {
    for (const child of els.messagesList.children) {
      if (child.classList.contains('msg-row') && child.dataset.msgId) {
        existingRows.set(child.dataset.msgId, child);
      } else if (child.classList.contains('date-divider') && child.dataset.dateKey) {
        existingDividers.set(child.dataset.dateKey, child);
      }
    }
  }

  const desiredNodes = [];
  let lastDateKey = '';
  let prevMsg = null;

  for (const msg of list) {
    const dateKey = formatDateDivider(msg.createdAt);
    if (dateKey !== lastDateKey) {
      let divider = existingDividers.get(dateKey);
      if (!divider) {
        divider = document.createElement('div');
        divider.className = 'date-divider';
        divider.dataset.dateKey = dateKey;
        divider.textContent = dateKey;
      }
      desiredNodes.push(divider);
      lastDateKey = dateKey;
      prevMsg = null;
    }

    const compact = Boolean(
      prevMsg &&
      prevMsg.senderId === msg.senderId &&
      !prevMsg.isDeleted &&
      (msg.createdAt - prevMsg.createdAt) < 3 * 60 * 1000
    );

    const coreSig = computeMsgCoreSig(msg, compact);
    const reactSig = JSON.stringify(msg.reactions || {});
    let row = existingRows.get(msg.id);

    if (row && row.dataset.coreSig === coreSig) {
      if (row.dataset.reactSig !== reactSig) {
        const reactionsEl = row.querySelector('.msg-reactions');
        if (reactionsEl) fillReactionPills(reactionsEl, msg);
        row.dataset.reactSig = reactSig;
      }
    } else {
      row = buildMessageRow(msg, compact, coreSig, reactSig);
    }

    desiredNodes.push(row);
    prevMsg = msg;
  }

  if (!canPatch) {
    const frag = document.createDocumentFragment();
    for (const node of desiredNodes) frag.appendChild(node);
    els.messagesList.textContent = '';
    els.messagesList.appendChild(frag);
  } else {
    const desiredSet = new Set(desiredNodes);
    for (let i = els.messagesList.children.length - 1; i >= 0; i--) {
      const child = els.messagesList.children[i];
      if (!desiredSet.has(child)) child.remove();
    }
    for (let i = 0; i < desiredNodes.length; i++) {
      const node = desiredNodes[i];
      const current = els.messagesList.children[i];
      if (current !== node) {
        els.messagesList.insertBefore(node, current || null);
      }
    }
  }

  state.renderedChannelId = channelId;

  const anchor = state.pendingUnreadAnchor;
  if (anchor && anchor.channelId === channelId) {
    const firstUnread = anchor.sinceTs > 0
      ? list.find((m) => Number(m.createdAt || 0) > anchor.sinceTs && !m.isDeleted && (!state.user || m.senderId !== state.user.id))
      : null;
    if (firstUnread) {
      const unreadRow = els.messagesList.querySelector(`.msg-row[data-msg-id="${CSS.escape(firstUnread.id)}"]`);
      if (unreadRow) {
        unreadRow.scrollIntoView({ behavior: 'auto', block: 'start' });
        unreadRow.classList.remove('msg-jump-highlight');
        void unreadRow.offsetWidth;
        unreadRow.classList.add('msg-jump-highlight');
        state.pendingUnreadAnchor = null;
        updateScrollBottomBtn();
        return;
      }
    }
    if (Number(state.channelVersion.get(channelId) || 0) > 0) {
      state.pendingUnreadAnchor = null;
    }
    scrollToBottom(false);
  } else if (forceScrollBottom) {
    scrollToBottom(false);
  }
  updateScrollBottomBtn();
}

function buildMessageRow(msg, compact, coreSig, reactSig) {
  const isMe = state.user && msg.senderId === state.user.id;
  const row = document.createElement('div');
  row.className = 'msg-row'
    + (isMe ? ' is-me' : '')
    + (compact ? ' compact' : '')
    + (msg._sending ? ' is-sending' : '')
    + (msg.isDeleted ? ' is-deleted' : '');
  row.dataset.msgId = msg.id;
  row.dataset.coreSig = coreSig || computeMsgCoreSig(msg, compact);
  row.dataset.reactSig = reactSig || JSON.stringify(msg.reactions || {});

  // 頭像
  const senderDisplayName = resolveUserDisplayName(msg.senderId, msg.senderName);
  const avatarSlot = document.createElement('div');
  avatarSlot.className = 'msg-avatar-slot';
  const avatar = document.createElement('div');
  avatar.className = 'avatar avatar-sm';
  applyUserAvatar(avatar, {
    userId: msg.senderId,
    displayName: senderDisplayName,
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
    sender.textContent = senderDisplayName;
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
    const imgWrap = document.createElement('div');
    imgWrap.className = 'msg-image-wrap';
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
    imgWrap.appendChild(imgEl);
    if (msg._sending) {
      const badge = document.createElement('div');
      badge.className = 'msg-upload-badge';
      badge.textContent = '上傳中…';
      imgWrap.appendChild(badge);
    }
    bubble.appendChild(imgWrap);
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

  // 標記到右側重點便條按鈕
  const pinBtn = document.createElement('button');
  pinBtn.type = 'button';
  pinBtn.className = 'hover-action-btn';
  pinBtn.title = '標記到右側重點便條';
  pinBtn.textContent = '📌';
  pinBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    handlePinMessageToNotes(msg);
  });
  bar.appendChild(pinBtn);

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
  deferNextPoll();

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
  deferNextPoll(5000);

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
  deferNextPoll();

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

function handleToggleReaction(msgId, emojiId) {
  const channelId = state.currentChannelId;
  if (!channelId) return;
  closeReactionPicker();

  const msgMap = getChannelMsgMap(channelId);
  const msg = msgMap.get(msgId);
  if (!msg || msg._sending || msg.isDeleted) return;

  // 立即樂觀更新 UI（0ms 體感延遲）
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
  deferNextPoll();

  // 以單則訊息為單位排隊送出，避免連點多顆表情或同時輪詢互相覆蓋
  const pendingCount = (state.inFlightReactions.get(msgId) || 0) + 1;
  state.inFlightReactions.set(msgId, pendingCount);

  const prevChain = state.reactionQueue.get(msgId) || Promise.resolve();
  const nextChain = prevChain.then(async () => {
    try {
      const res = await apiPost(
        'toggleReaction',
        { channelId, msgId, emojiId },
        { token: state.token }
      );
      const remaining = (state.inFlightReactions.get(msgId) || 1) - 1;
      if (remaining <= 0) {
        state.inFlightReactions.delete(msgId);
        msg.reactions = res.reactions || {};
        msg.updatedAt = res.updatedAt || msg.updatedAt;
        if (state.currentChannelId === channelId) {
          patchMessageReactionsDom(msg);
        }
      } else {
        state.inFlightReactions.set(msgId, remaining);
      }
    } catch (err) {
      const remaining = (state.inFlightReactions.get(msgId) || 1) - 1;
      if (remaining <= 0) {
        state.inFlightReactions.delete(msgId);
      } else {
        state.inFlightReactions.set(msgId, remaining);
      }
      msg.reactions = prevReactions;
      if (state.currentChannelId === channelId) {
        patchMessageReactionsDom(msg);
      }
      showToast('表情更新失敗：' + err.message, 'error');
    }
  });
  state.reactionQueue.set(msgId, nextChain);
}

function patchMessageReactionsDom(msg) {
  const row = els.messagesList.querySelector(`.msg-row[data-msg-id="${CSS.escape(msg.id)}"]`);
  if (!row) return;
  const reactionsEl = row.querySelector('.msg-reactions');
  if (reactionsEl) {
    fillReactionPills(reactionsEl, msg);
  }
  row.dataset.reactSig = JSON.stringify(msg.reactions || {});
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
  deferNextPoll();

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

// ==================== 右側重點便條紙功能 ====================
const NOTE_COLORS = ['yellow', 'blue', 'green', 'pink', 'purple'];

function initNotesPanel() {
  const saved = localStorage.getItem(NOTES_OPEN_KEY);
  const isMobile = window.innerWidth <= 768;
  state.notesOpen = saved === null ? !isMobile : saved === '1';
  applyNotesPanelVisibility();
}

function applyNotesPanelVisibility() {
  const isMobile = window.innerWidth <= 768;
  if (isMobile) {
    els.notesSidebar.classList.remove('collapsed');
    els.notesSidebar.classList.toggle('open', state.notesOpen);
    els.sidebarBackdrop.classList.toggle('hidden', !state.notesOpen && !els.sidebar.classList.contains('open'));
  } else {
    els.notesSidebar.classList.remove('open');
    els.notesSidebar.classList.toggle('collapsed', !state.notesOpen);
  }
  els.toggleNotesBtn.classList.toggle('active', state.notesOpen);
}

function toggleNotesPanel() {
  state.notesOpen = !state.notesOpen;
  localStorage.setItem(NOTES_OPEN_KEY, state.notesOpen ? '1' : '0');
  applyNotesPanelVisibility();
}

function closeMobileNotesDrawer() {
  if (window.innerWidth <= 768 && state.notesOpen) {
    state.notesOpen = false;
    applyNotesPanelVisibility();
  }
}

function openNoteComposer() {
  if (!state.currentChannelId) return;
  if (!state.notesOpen) {
    state.notesOpen = true;
    localStorage.setItem(NOTES_OPEN_KEY, '1');
    applyNotesPanelVisibility();
  }
  els.noteComposer.classList.remove('hidden');
  els.noteComposerInput.value = '';
  els.noteComposerInput.focus();
}

function closeNoteComposer() {
  els.noteComposer.classList.add('hidden');
  els.noteComposerInput.value = '';
}

function renderNotesSidebar() {
  const ch = getCurrentChannel();
  const notes = (ch && Array.isArray(ch.pinnedNotes)) ? ch.pinnedNotes : [];

  if (notes.length > 0) {
    els.notesCountBadge.textContent = String(notes.length);
    els.notesCountBadge.classList.remove('hidden');
  } else {
    els.notesCountBadge.classList.add('hidden');
  }

  els.addNoteBtn.disabled = !ch;
  els.notesList.textContent = '';

  if (!ch) {
    const empty = document.createElement('div');
    empty.className = 'notes-empty';
    empty.textContent = '選擇頻道後，可將聊天重點標記成右側便利貼，並自由拖曳排序。';
    els.notesList.appendChild(empty);
    return;
  }

  if (notes.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'notes-empty';
    empty.textContent = t('noNotesYet');
    els.notesList.appendChild(empty);
    return;
  }

  for (let i = 0; i < notes.length; i++) {
    els.notesList.appendChild(buildNoteCard(notes[i], i, notes.length));
  }
}

function buildNoteCard(note, index, total) {
  const card = document.createElement('div');
  card.className = 'note-card';
  card.dataset.color = note.color || 'yellow';
  card.dataset.noteId = note.id;

  const isEditing = state.editingNoteId === note.id;
  if (isEditing) card.classList.add('editing');
  card.draggable = !isEditing;

  // 手機／觸控裝置點擊便條紙切換暫時顯示（搭配防偷窺鏡像模式）
  card.addEventListener('click', (e) => {
    if (!state.privacyMirror || isEditing) return;
    if (e.target.closest('button, a, textarea, input')) return;
    const active = card.classList.contains('touch-active');
    document.querySelectorAll('.note-card.touch-active').forEach((n) => n.classList.remove('touch-active'));
    if (!active) card.classList.add('touch-active');
  });

  // 拖曳排序事件
  card.addEventListener('dragstart', (e) => {
    if (isEditing) {
      e.preventDefault();
      return;
    }
    state.draggingNoteId = note.id;
    card.classList.add('dragging');
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', note.id);
    }
  });
  card.addEventListener('dragend', () => {
    state.draggingNoteId = null;
    card.classList.remove('dragging');
    els.notesList.querySelectorAll('.note-card.drag-over').forEach((n) => n.classList.remove('drag-over'));
  });
  card.addEventListener('dragover', (e) => {
    if (!state.draggingNoteId || state.draggingNoteId === note.id) return;
    e.preventDefault();
    card.classList.add('drag-over');
  });
  card.addEventListener('dragleave', () => {
    card.classList.remove('drag-over');
  });
  card.addEventListener('drop', (e) => {
    e.preventDefault();
    card.classList.remove('drag-over');
    const fromId = state.draggingNoteId;
    if (!fromId || fromId === note.id) return;
    reorderNotesByIds(fromId, note.id);
  });

  // 卡片頂部：來源標籤 + 操作鈕（上移/下移/換色/編輯/刪除）
  const top = document.createElement('div');
  top.className = 'note-card-top';

  const source = document.createElement('span');
  source.className = 'note-source-tag';
  source.textContent = note.msgId && note.msgSender
    ? `📌 ${note.msgSender} 的重點`
    : `📝 ${note.createdByName || '重點便條'}`;
  top.appendChild(source);

  const actions = document.createElement('div');
  actions.className = 'note-card-actions';

  const upBtn = document.createElement('button');
  upBtn.type = 'button';
  upBtn.className = 'note-mini-btn';
  upBtn.title = '上移';
  upBtn.textContent = '↑';
  upBtn.disabled = index === 0;
  upBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    handleMoveNote(index, index - 1);
  });

  const downBtn = document.createElement('button');
  downBtn.type = 'button';
  downBtn.className = 'note-mini-btn';
  downBtn.title = '下移';
  downBtn.textContent = '↓';
  downBtn.disabled = index === total - 1;
  downBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    handleMoveNote(index, index + 1);
  });

  const colorBtn = document.createElement('button');
  colorBtn.type = 'button';
  colorBtn.className = 'note-mini-btn';
  colorBtn.title = '切換便條顏色';
  colorBtn.textContent = '🎨';
  colorBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const nextColor = NOTE_COLORS[(NOTE_COLORS.indexOf(note.color || 'yellow') + 1) % NOTE_COLORS.length];
    handleChangeNoteColor(note.id, nextColor);
  });

  const editBtn = document.createElement('button');
  editBtn.type = 'button';
  editBtn.className = 'note-mini-btn';
  editBtn.title = '編輯便條內容';
  editBtn.textContent = '✏';
  editBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    state.editingNoteId = isEditing ? null : note.id;
    renderNotesSidebar();
  });

  const delBtn = document.createElement('button');
  delBtn.type = 'button';
  delBtn.className = 'note-mini-btn danger';
  delBtn.title = '移除便條';
  delBtn.textContent = '✕';
  delBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    handleDeleteNote(note.id);
  });

  actions.appendChild(upBtn);
  actions.appendChild(downBtn);
  actions.appendChild(colorBtn);
  actions.appendChild(editBtn);
  actions.appendChild(delBtn);
  top.appendChild(actions);
  card.appendChild(top);

  // 圖片縮圖（若標記的是圖片訊息）
  if (note.msgType === 'image' && note.fileId) {
    const thumb = createDriveImageEl(note.fileId, {
      token: state.token,
      size: 400,
      className: 'note-card-thumb',
      alt: '重點圖片',
    });
    thumb.addEventListener('click', (e) => {
      e.stopPropagation();
      openLightbox({ fileId: note.fileId, caption: note.text }, thumb.src);
    });
    card.appendChild(thumb);
  }

  // 內文或內嵌編輯框
  if (isEditing) {
    const ta = document.createElement('textarea');
    ta.className = 'note-edit-textarea';
    ta.rows = 3;
    ta.maxLength = 600;
    ta.value = note.text || '';
    card.appendChild(ta);

    const editFooter = document.createElement('div');
    editFooter.className = 'inline-row';
    editFooter.style.justifyContent = 'flex-end';
    editFooter.style.marginTop = '6px';

    const cancelEdit = document.createElement('button');
    cancelEdit.type = 'button';
    cancelEdit.className = 'mini-btn';
    cancelEdit.textContent = '取消';
    cancelEdit.addEventListener('click', () => {
      state.editingNoteId = null;
      renderNotesSidebar();
    });

    const saveEdit = document.createElement('button');
    saveEdit.type = 'button';
    saveEdit.className = 'btn btn-primary btn-xs';
    saveEdit.textContent = '儲存';
    saveEdit.addEventListener('click', () => handleSaveNoteEdit(note.id, ta.value));

    editFooter.appendChild(cancelEdit);
    editFooter.appendChild(saveEdit);
    card.appendChild(editFooter);
    setTimeout(() => ta.focus(), 20);
  } else {
    const textEl = document.createElement('div');
    textEl.className = 'note-card-text';
    renderSafeTextWithLinks(textEl, note.text || '');
    card.appendChild(textEl);
  }

  // 卡片底部：跳轉回原訊息 + 標記時間
  const footer = document.createElement('div');
  footer.className = 'note-card-footer';
  const meta = document.createElement('span');
  meta.textContent = note.createdAt ? formatTime(note.createdAt) : '';
  footer.appendChild(meta);

  if (note.msgId) {
    const jumpBtn = document.createElement('button');
    jumpBtn.type = 'button';
    jumpBtn.className = 'note-jump-btn';
    jumpBtn.textContent = '跳至訊息 ↗';
    jumpBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      closeMobileNotesDrawer();
      jumpToMessage(note.msgId);
    });
    footer.appendChild(jumpBtn);
  }
  card.appendChild(footer);

  return card;
}

async function handlePinMessageToNotes(msg) {
  const ch = getCurrentChannel();
  if (!ch || !msg || msg._sending || msg.isDeleted) return;

  if (!state.notesOpen) {
    state.notesOpen = true;
    localStorage.setItem(NOTES_OPEN_KEY, '1');
    applyNotesPanelVisibility();
  }

  let text = '';
  let fileId = '';
  if (msg.type === 'sticker') {
    const emoji = getEmojiById(msg.content);
    text = `[貼圖] ${emoji.label}`;
  } else if (msg.type === 'image') {
    const imgMeta = parseImageContent(msg.content);
    fileId = imgMeta.fileId || '';
    text = imgMeta.caption ? imgMeta.caption : '（圖片重點）';
  } else {
    text = msg.content.slice(0, 600);
  }

  const msgSender = resolveUserDisplayName(msg.senderId, msg.senderName);
  await addNoteToChannel(ch, {
    text,
    color: state.noteComposerColor || 'yellow',
    msgId: msg.id,
    msgSender,
    msgType: msg.type,
    fileId,
  });
}

async function handleSaveNewNote() {
  const ch = getCurrentChannel();
  if (!ch) return;
  const text = els.noteComposerInput.value.trim();
  if (!text) {
    showToast('請輸入便條內容', 'error');
    return;
  }
  closeNoteComposer();
  await addNoteToChannel(ch, {
    text: text.slice(0, 600),
    color: state.noteComposerColor || 'yellow',
    msgType: 'note',
  });
}

async function addNoteToChannel(ch, notePayload) {
  if (!Array.isArray(ch.pinnedNotes)) ch.pinnedNotes = [];
  const prevNotes = ch.pinnedNotes.slice();

  const tempNote = {
    id: 'temp_note_' + Date.now(),
    text: notePayload.text,
    color: notePayload.color || 'yellow',
    msgId: notePayload.msgId || '',
    msgSender: notePayload.msgSender || '',
    msgType: notePayload.msgType || 'note',
    fileId: notePayload.fileId || '',
    createdBy: state.user.id,
    createdByName: state.user.displayName,
    createdAt: Date.now(),
  };

  if (notePayload.msgId) {
    ch.pinnedNotes = ch.pinnedNotes.filter((n) => n.msgId !== notePayload.msgId);
  }
  ch.pinnedNotes.unshift(tempNote);
  renderNotesSidebar();
  deferNextPoll();

  try {
    const res = await apiPost(
      'addPinnedNote',
      { channelId: ch.id, ...notePayload },
      { token: state.token }
    );
    if (Array.isArray(res.pinnedNotes)) {
      ch.pinnedNotes = res.pinnedNotes;
      renderNotesSidebar();
    }
    showToast('已貼上重點便條 📌', 'success');
  } catch (err) {
    ch.pinnedNotes = prevNotes;
    renderNotesSidebar();
    showToast('標記便條失敗：' + err.message, 'error');
  }
}

async function handleSaveNoteEdit(noteId, rawText) {
  const ch = getCurrentChannel();
  if (!ch || !Array.isArray(ch.pinnedNotes)) return;
  const text = String(rawText || '').trim().slice(0, 600);
  if (!text) {
    showToast('便條內容不可為空', 'error');
    return;
  }

  const note = ch.pinnedNotes.find((n) => n.id === noteId);
  if (!note) return;
  const prevText = note.text;
  note.text = text;
  state.editingNoteId = null;
  renderNotesSidebar();
  deferNextPoll();

  try {
    const res = await apiPost(
      'updatePinnedNote',
      { channelId: ch.id, noteId, text },
      { token: state.token }
    );
    if (Array.isArray(res.pinnedNotes)) {
      ch.pinnedNotes = res.pinnedNotes;
      renderNotesSidebar();
    }
  } catch (err) {
    note.text = prevText;
    renderNotesSidebar();
    showToast('更新便條失敗：' + err.message, 'error');
  }
}

async function handleChangeNoteColor(noteId, color) {
  const ch = getCurrentChannel();
  if (!ch || !Array.isArray(ch.pinnedNotes)) return;
  const note = ch.pinnedNotes.find((n) => n.id === noteId);
  if (!note) return;
  const prevColor = note.color;
  note.color = color;
  renderNotesSidebar();
  deferNextPoll();

  try {
    const res = await apiPost(
      'updatePinnedNote',
      { channelId: ch.id, noteId, color },
      { token: state.token }
    );
    if (Array.isArray(res.pinnedNotes)) {
      ch.pinnedNotes = res.pinnedNotes;
      renderNotesSidebar();
    }
  } catch (err) {
    note.color = prevColor;
    renderNotesSidebar();
    showToast('切換顏色失敗：' + err.message, 'error');
  }
}

async function handleDeleteNote(noteId) {
  const ch = getCurrentChannel();
  if (!ch || !Array.isArray(ch.pinnedNotes)) return;
  const prevNotes = ch.pinnedNotes.slice();
  ch.pinnedNotes = ch.pinnedNotes.filter((n) => n.id !== noteId);
  renderNotesSidebar();
  deferNextPoll();

  try {
    const res = await apiPost(
      'deletePinnedNote',
      { channelId: ch.id, noteId },
      { token: state.token }
    );
    if (Array.isArray(res.pinnedNotes)) {
      ch.pinnedNotes = res.pinnedNotes;
      renderNotesSidebar();
    }
  } catch (err) {
    ch.pinnedNotes = prevNotes;
    renderNotesSidebar();
    showToast('移除便條失敗：' + err.message, 'error');
  }
}

function handleMoveNote(fromIdx, toIdx) {
  const ch = getCurrentChannel();
  if (!ch || !Array.isArray(ch.pinnedNotes)) return;
  if (toIdx < 0 || toIdx >= ch.pinnedNotes.length) return;
  const prevNotes = ch.pinnedNotes.slice();
  const [moved] = ch.pinnedNotes.splice(fromIdx, 1);
  ch.pinnedNotes.splice(toIdx, 0, moved);
  renderNotesSidebar();
  persistNoteOrder(ch, prevNotes);
}

function reorderNotesByIds(fromId, toId) {
  const ch = getCurrentChannel();
  if (!ch || !Array.isArray(ch.pinnedNotes)) return;
  const fromIdx = ch.pinnedNotes.findIndex((n) => n.id === fromId);
  const toIdx = ch.pinnedNotes.findIndex((n) => n.id === toId);
  if (fromIdx === -1 || toIdx === -1 || fromIdx === toIdx) return;
  const prevNotes = ch.pinnedNotes.slice();
  const [moved] = ch.pinnedNotes.splice(fromIdx, 1);
  ch.pinnedNotes.splice(toIdx, 0, moved);
  renderNotesSidebar();
  persistNoteOrder(ch, prevNotes);
}

async function persistNoteOrder(ch, prevNotes) {
  deferNextPoll();
  try {
    const order = ch.pinnedNotes.map((n) => n.id);
    const res = await apiPost(
      'reorderPinnedNotes',
      { channelId: ch.id, order },
      { token: state.token }
    );
    if (Array.isArray(res.pinnedNotes)) {
      ch.pinnedNotes = res.pinnedNotes;
      renderNotesSidebar();
    }
  } catch (err) {
    ch.pinnedNotes = prevNotes;
    renderNotesSidebar();
    showToast('排序儲存失敗：' + err.message, 'error');
  }
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

function updateScrollBottomBtn({ hasNew = false } = {}) {
  const el = els.messagesList;
  if (!el || !state.currentChannelId || el.scrollHeight <= el.clientHeight + 20 || isNearBottom()) {
    els.scrollBottomBtn.classList.add('hidden');
    els.scrollBottomBtn.classList.remove('has-new');
    return;
  }
  if (hasNew) {
    els.scrollBottomBtn.classList.add('has-new');
    els.scrollBottomBtn.textContent = t('btnScrollBottom');
  } else if (!els.scrollBottomBtn.classList.contains('has-new')) {
    els.scrollBottomBtn.textContent = t('btnScrollLatest');
  }
  els.scrollBottomBtn.classList.remove('hidden');
}

function autoResizeInput() {
  const el = els.messageInput;
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 130) + 'px';
  if (!el.value) clearInputBlur();
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
  state.devices = null;
  state.userProfiles = {};
  state.channels = [];
  state.currentChannelId = null;
  state.messagesByChannel.clear();
  state.channelVersion.clear();
  state.channelLastMsgAt.clear();
  state.inFlightReactions.clear();
  state.reactionQueue.clear();
  state.renderedChannelId = null;
  state.pendingUnreadAnchor = null;
  clearInputBlur();
  state.consecutiveSyncErrors = 0;
  state.globalVersion = 0;
  state.editingNoteId = null;
  state.draggingNoteId = null;
  closeNoteComposer();
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
