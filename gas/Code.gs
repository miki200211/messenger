/**
 * Messenger - Google Apps Script 後端 (Google Drive + Google Sheets 資料庫)
 *
 * 【首次部署步驟】
 * 1. 前往 https://script.google.com/ 建立新專案，貼上本檔案全部內容並存檔。
 * 2. 建議在「專案設定 → 指令碼屬性 (Script Properties)」新增：
 *      - DB_FOLDER_ID   : 你的 Google Drive 資料夾 ID
 *      - REGISTER_CODE  : 註冊通關碼（留空則不限制註冊）
 *    （或直接修改下方 DEFAULT_CONFIG，但請勿把真實註冊碼推上公開 GitHub）
 * 3. 在上方函式下拉選單選擇 `setupDatabase` 並按「執行」，同意授權後會自動在
 *    指定的 Google Drive 資料夾建立試算表 `messenger_db` 與圖片資料夾 `messenger_images`。
 * 4. 點右上角「部署 → 新增部署作業 → 網頁應用程式」：
 *      - 執行身分：我 (Me)
 *      - 誰可以存取：所有人 (Anyone)
 *
 * 【更新程式步驟（網址不變）】
 * 1. 覆蓋貼上新程式碼並存檔。
 * 2. 點右上角「部署 → 管理部署作業 → 右上角鉛筆編輯 → 版本選『新版本』→ 部署」。
 */

const DEFAULT_CONFIG = {
  DB_FOLDER_ID: 'YOUR_GOOGLE_DRIVE_FOLDER_ID',
  SPREADSHEET_NAME: 'messenger_db',
  IMAGES_FOLDER_NAME: 'messenger_images',
  REGISTER_CODE: 'YOUR_REGISTER_CODE',
  TOKEN_TTL_DAYS: 30,
  INITIAL_MESSAGE_LIMIT: 150,
  MAX_IMAGE_BASE64_CHARS: 4800000, // 約 3.5 MB
  TIMEZONE: 'Asia/Taipei',
};

const ALLOWED_IMAGE_MIMES = {
  'image/webp': 'webp',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
};

const SHEETS = {
  USERS: 'Users',
  CHANNELS: 'Channels',
  MESSAGES: 'Messages',
};

const HEADERS = {
  Users: [
    'user_id',
    'username',
    'display_name',
    'avatar_color',
    'password_hash',
    'salt',
    'token',
    'token_expire_at',
    'created_at',
    'last_active_at',
    'avatar',
  ],
  Channels: [
    'channel_id',
    'name',
    'invite_code',
    'owner_id',
    'owner_name',
    'members_json',
    'member_names',
    'created_at',
    'last_message_at',
    'updated_at',
  ],
  Messages: [
    'msg_id',
    'channel_id',
    'channel_name',
    'sender_id',
    'sender_name',
    'type',
    'content',
    'reply_to_id',
    'reply_preview_json',
    'reactions_json',
    'created_at',
    'created_at_text',
    'updated_at',
    'is_deleted',
    'edited_at',
  ],
};

const AVATAR_COLORS = [
  '#5B5FC7', '#2D7D9A', '#038387', '#498205', '#C239B3',
  '#CA5010', '#8764B8', '#0078D4', '#D13438', '#4F6BED',
];

const ALLOWED_AVATAR_PRESETS = {
  initial: true,
  person_black: true,
  person_white: true,
  person_yellow: true,
  person_green: true,
  person_blue: true,
  person_red: true,
  monkey: true,
};

// ============================================================================
// 公開入口：初始化 / 健康檢查 / API 派發
// ============================================================================

function setupDatabase() {
  const ss = ensureSpreadsheet_();
  const imgFolder = ensureImagesFolder_();
  ensureServerPepper_();
  Logger.log('資料庫就緒！試算表網址：' + ss.getUrl());
  Logger.log('圖片資料夾 ID：' + imgFolder.getId());
  return {
    ok: true,
    spreadsheetId: ss.getId(),
    spreadsheetUrl: ss.getUrl(),
    imagesFolderId: imgFolder.getId(),
  };
}

function doGet() {
  return jsonOut_({
    ok: true,
    service: 'messenger-gas',
    status: 'running',
    serverTime: Date.now(),
  });
}

function doPost(e) {
  try {
    const raw = (e && e.postData && e.postData.contents) ? e.postData.contents : '{}';
    const body = JSON.parse(raw);
    const action = String(body.action || '').trim();

    switch (action) {
      case 'ping':
        return jsonOut_({ ok: true, serverTime: Date.now() });
      case 'register':
        return jsonOut_(handleRegister_(body));
      case 'login':
        return jsonOut_(handleLogin_(body));
      case 'me':
        return jsonOut_(handleMe_(body));
      case 'logout':
        return jsonOut_(handleLogout_(body));
      case 'getChannels':
        return jsonOut_(handleGetChannels_(body));
      case 'createChannel':
        return jsonOut_(handleCreateChannel_(body));
      case 'joinChannel':
        return jsonOut_(handleJoinChannel_(body));
      case 'resetInviteCode':
        return jsonOut_(handleResetInviteCode_(body));
      case 'syncMessages':
        return jsonOut_(handleSyncMessages_(body));
      case 'sendMessage':
        return jsonOut_(handleSendMessage_(body));
      case 'editMessage':
        return jsonOut_(handleEditMessage_(body));
      case 'toggleReaction':
        return jsonOut_(handleToggleReaction_(body));
      case 'deleteMessage':
        return jsonOut_(handleDeleteMessage_(body));
      case 'getImage':
        return jsonOut_(handleGetImage_(body));
      case 'updateAvatar':
        return jsonOut_(handleUpdateAvatar_(body));
      default:
        return jsonOut_({ ok: false, error: '不支援的操作：' + action });
    }
  } catch (err) {
    return jsonOut_({
      ok: false,
      error: (err && err.message) ? err.message : String(err),
    });
  }
}

// ============================================================================
// 認證相關 API (Register / Login / Me / Logout)
// ============================================================================

function handleRegister_(body) {
  const cfg = getConfig_();
  const registerCode = String(body.registerCode || '');
  if (cfg.REGISTER_CODE && registerCode !== cfg.REGISTER_CODE) {
    return { ok: false, error: '註冊通關碼不正確' };
  }

  const username = String(body.username || '').trim().toLowerCase();
  const displayName = String(body.displayName || '').trim();
  const password = String(body.password || '');

  if (!/^[a-z0-9_.-]{2,24}$/.test(username)) {
    return { ok: false, error: '帳號需為 2–24 碼英數或 _ . -' };
  }
  if (displayName.length < 1 || displayName.length > 24) {
    return { ok: false, error: '名稱長度需為 1–24 字元' };
  }
  if (password.length < 4 || password.length > 64) {
    return { ok: false, error: '密碼長度需為 4–64 字元' };
  }

  return withLock_(function () {
    const ss = ensureSpreadsheet_();
    const sheet = ss.getSheetByName(SHEETS.USERS);
    const rows = getDataRows_(sheet);

    for (let i = 0; i < rows.length; i++) {
      if (String(rows[i][1]).toLowerCase() === username) {
        return { ok: false, error: '此帳號已被註冊' };
      }
    }

    const now = Date.now();
    const nowText = formatDateTime_(now);
    const userId = 'u_' + now + '_' + randomId_(4);
    const salt = randomHex_(16);
    const passwordHash = hashPassword_(password, salt);
    const token = randomHex_(32);
    const tokenExpireAt = now + cfg.TOKEN_TTL_DAYS * 86400 * 1000;
    const avatarColor = AVATAR_COLORS[rows.length % AVATAR_COLORS.length];

    sheet.appendRow([
      toSheetText_(userId),
      toSheetText_(username),
      toSheetText_(displayName),
      toSheetText_(avatarColor),
      toSheetText_(passwordHash),
      toSheetText_(salt),
      toSheetText_(token),
      tokenExpireAt,
      toSheetText_(nowText),
      toSheetText_(nowText),
      '',
    ]);

    const user = {
      id: userId,
      username: username,
      displayName: displayName,
      avatarColor: avatarColor,
      avatar: '',
    };
    cacheUserToken_(token, user, tokenExpireAt);
    clearUserProfilesCache_();

    return { ok: true, token: token, user: user };
  });
}

function handleLogin_(body) {
  const cfg = getConfig_();
  const username = String(body.username || '').trim().toLowerCase();
  const password = String(body.password || '');

  if (!username || !password) {
    return { ok: false, error: '請輸入帳號與密碼' };
  }

  return withLock_(function () {
    const ss = ensureSpreadsheet_();
    const sheet = ss.getSheetByName(SHEETS.USERS);
    const rows = getDataRows_(sheet);

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (String(row[1]).toLowerCase() !== username) continue;

      const salt = String(row[5] || '');
      const expectedHash = String(row[4] || '');
      const actualHash = hashPassword_(password, salt);
      if (actualHash !== expectedHash) {
        return { ok: false, error: '帳號或密碼錯誤' };
      }

      const oldToken = String(row[6] || '');
      if (oldToken) clearTokenCache_(oldToken);

      const now = Date.now();
      const token = randomHex_(32);
      const tokenExpireAt = now + cfg.TOKEN_TTL_DAYS * 86400 * 1000;
      const rowNum = i + 2;

      sheet.getRange(rowNum, 7).setValue(toSheetText_(token));
      sheet.getRange(rowNum, 8).setValue(tokenExpireAt);
      sheet.getRange(rowNum, 10).setValue(toSheetText_(formatDateTime_(now)));

      const user = {
        id: String(row[0]),
        username: String(row[1]),
        displayName: String(row[2]),
        avatarColor: String(row[3] || AVATAR_COLORS[0]),
        avatar: String(row[10] || ''),
      };
      cacheUserToken_(token, user, tokenExpireAt);

      return { ok: true, token: token, user: user };
    }

    return { ok: false, error: '帳號或密碼錯誤' };
  });
}

function handleMe_(body) {
  const auth = requireAuth_(body.token);
  if (!auth.ok) return auth;
  return { ok: true, user: auth.user };
}

function handleUpdateAvatar_(body) {
  const auth = requireAuth_(body.token);
  if (!auth.ok) return auth;

  const mode = String(body.mode || 'preset').trim();
  let avatarValue = '';

  if (mode === 'preset') {
    const preset = String(body.preset || '').trim();
    if (!ALLOWED_AVATAR_PRESETS[preset]) {
      return { ok: false, error: '不支援的預設頭像' };
    }
    avatarValue = preset === 'initial' ? '' : ('preset:' + preset);
  } else if (mode === 'upload') {
    const mime = String(body.imageMime || '').trim().toLowerCase();
    const ext = ALLOWED_IMAGE_MIMES[mime];
    if (!ext) {
      return { ok: false, error: '頭像僅支援 WebP、JPG、PNG、GIF 格式' };
    }
    let b64 = String(body.imageData || '').trim();
    const commaIdx = b64.indexOf(',');
    if (commaIdx !== -1 && b64.indexOf('data:') === 0) {
      b64 = b64.slice(commaIdx + 1);
    }
    if (!b64) return { ok: false, error: '頭像圖片資料不可為空' };
    if (b64.length > 1600000) {
      return { ok: false, error: '頭像檔案過大，請控制在 1 MB 以內' };
    }

    const bytes = Utilities.base64Decode(b64);
    const safeUser = auth.user.username.replace(/[^a-z0-9_-]/gi, '').slice(0, 16) || 'user';
    const fileName = 'avatar_' + safeUser + '_' + randomId_(6) + '.' + ext;
    const imgFolder = ensureImagesFolder_();
    const blob = Utilities.newBlob(bytes, mime, fileName);
    const file = imgFolder.createFile(blob);
    try {
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    } catch (shareErr) {
      // 限制分享時前端會自動透過 getImage 載入
    }
    avatarValue = 'drive:' + file.getId();
  } else {
    return { ok: false, error: '不支援的頭像更新方式' };
  }

  return withLock_(function () {
    const ss = ensureSpreadsheet_();
    const sheet = ss.getSheetByName(SHEETS.USERS);
    const rows = getDataRows_(sheet);

    for (let i = 0; i < rows.length; i++) {
      if (String(rows[i][0]) !== auth.user.id) continue;

      const rowNum = i + 2;
      sheet.getRange(rowNum, 11).setValue(toSheetText_(avatarValue));

      const updatedUser = {
        id: auth.user.id,
        username: auth.user.username,
        displayName: auth.user.displayName,
        avatarColor: auth.user.avatarColor,
        avatar: avatarValue,
      };
      const expireAt = Number(rows[i][7] || 0);
      cacheUserToken_(String(body.token || '').trim(), updatedUser, expireAt);
      clearUserProfilesCache_();

      const now = nextVersion_('global_ver');
      return {
        ok: true,
        user: updatedUser,
        avatar: avatarValue,
        userProfiles: getAllUserProfiles_(ss),
        globalVersion: now,
      };
    }

    return { ok: false, error: '找不到使用者資料' };
  });
}

function handleLogout_(body) {
  const token = String(body.token || '').trim();
  if (!token) return { ok: true };
  clearTokenCache_(token);

  return withLock_(function () {
    const ss = ensureSpreadsheet_();
    const sheet = ss.getSheetByName(SHEETS.USERS);
    const rows = getDataRows_(sheet);
    for (let i = 0; i < rows.length; i++) {
      if (String(rows[i][6]) === token) {
        sheet.getRange(i + 2, 7).setValue('');
        sheet.getRange(i + 2, 8).setValue(0);
        break;
      }
    }
    return { ok: true };
  });
}

// ============================================================================
// 頻道與邀請碼 API
// ============================================================================

function handleGetChannels_(body) {
  const auth = requireAuth_(body.token);
  if (!auth.ok) return auth;

  const ss = ensureSpreadsheet_();
  const channels = listUserChannels_(ss, auth.user.id);
  const globalVersion = getGlobalVersion_();

  return {
    ok: true,
    channels: channels,
    userProfiles: getAllUserProfiles_(ss),
    globalVersion: globalVersion,
  };
}

function handleCreateChannel_(body) {
  const auth = requireAuth_(body.token);
  if (!auth.ok) return auth;

  const name = String(body.name || '').trim();
  if (name.length < 1 || name.length > 30) {
    return { ok: false, error: '頻道名稱需為 1–30 字元' };
  }

  return withLock_(function () {
    const ss = ensureSpreadsheet_();
    const sheet = ss.getSheetByName(SHEETS.CHANNELS);
    const rows = getDataRows_(sheet);

    const existingCodes = {};
    for (let i = 0; i < rows.length; i++) {
      existingCodes[String(rows[i][2]).toUpperCase()] = true;
    }

    let inviteCode = generateInviteCode_();
    let guard = 0;
    while (existingCodes[inviteCode] && guard < 20) {
      inviteCode = generateInviteCode_();
      guard++;
    }

    const now = nextVersion_('global_ver');
    const channelId = 'ch_' + randomId_(8);
    const members = [auth.user.id];
    const memberNames = auth.user.displayName;

    sheet.appendRow([
      toSheetText_(channelId),
      toSheetText_(name),
      toSheetText_(inviteCode),
      toSheetText_(auth.user.id),
      toSheetText_(auth.user.displayName),
      JSON.stringify(members),
      toSheetText_(memberNames),
      toSheetText_(formatDateTime_(now)),
      now,
      now,
    ]);

    cacheChannelMembers_(channelId, members);
    setChannelVersion_(channelId, now);

    return {
      ok: true,
      globalVersion: now,
      channel: {
        id: channelId,
        name: name,
        inviteCode: inviteCode,
        ownerId: auth.user.id,
        ownerName: auth.user.displayName,
        isOwner: true,
        memberCount: 1,
        memberIds: members,
        memberNames: [auth.user.displayName],
        lastMessageAt: now,
        updatedAt: now,
      },
    };
  });
}

function handleJoinChannel_(body) {
  const auth = requireAuth_(body.token);
  if (!auth.ok) return auth;

  const code = String(body.inviteCode || '').trim().toUpperCase();
  if (!code) {
    return { ok: false, error: '請輸入頻道邀請碼' };
  }

  return withLock_(function () {
    const ss = ensureSpreadsheet_();
    const sheet = ss.getSheetByName(SHEETS.CHANNELS);
    const rows = getDataRows_(sheet);

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (String(row[2]).trim().toUpperCase() !== code) continue;

      const channelId = String(row[0]);
      const members = safeJsonParse_(row[5], []);
      const alreadyMember = members.indexOf(auth.user.id) !== -1;

      let memberNamesList = String(row[6] || '')
        .split(',')
        .map(function (s) { return s.trim(); })
        .filter(Boolean);

      const now = nextVersion_('global_ver');

      if (!alreadyMember) {
        members.push(auth.user.id);
        if (memberNamesList.indexOf(auth.user.displayName) === -1) {
          memberNamesList.push(auth.user.displayName);
        }
        const rowNum = i + 2;
        sheet.getRange(rowNum, 6).setValue(JSON.stringify(members));
        sheet.getRange(rowNum, 7).setValue(toSheetText_(memberNamesList.join(', ')));
        sheet.getRange(rowNum, 10).setValue(now);
        cacheChannelMembers_(channelId, members);
      }

      const updatedRow = row.slice();
      updatedRow[5] = JSON.stringify(members);
      updatedRow[6] = memberNamesList.join(', ');
      updatedRow[9] = now;

      return {
        ok: true,
        alreadyMember: alreadyMember,
        globalVersion: now,
        channel: formatChannelRow_(updatedRow, auth.user.id),
      };
    }

    return { ok: false, error: '找不到此邀請碼對應的頻道，請向建立者確認代碼' };
  });
}

function handleResetInviteCode_(body) {
  const auth = requireAuth_(body.token);
  if (!auth.ok) return auth;

  const channelId = String(body.channelId || '').trim();
  if (!channelId) return { ok: false, error: '缺少頻道 ID' };

  return withLock_(function () {
    const ss = ensureSpreadsheet_();
    const sheet = ss.getSheetByName(SHEETS.CHANNELS);
    const rows = getDataRows_(sheet);

    const existingCodes = {};
    let targetIdx = -1;
    for (let i = 0; i < rows.length; i++) {
      existingCodes[String(rows[i][2]).toUpperCase()] = true;
      if (String(rows[i][0]) === channelId) {
        targetIdx = i;
      }
    }

    if (targetIdx === -1) {
      return { ok: false, error: '找不到該頻道' };
    }
    if (String(rows[targetIdx][3]) !== auth.user.id) {
      return { ok: false, error: '只有頻道建立者可以重設邀請碼' };
    }

    let newCode = generateInviteCode_();
    let guard = 0;
    while (existingCodes[newCode] && guard < 20) {
      newCode = generateInviteCode_();
      guard++;
    }

    const now = nextVersion_('global_ver');
    sheet.getRange(targetIdx + 2, 3).setValue(toSheetText_(newCode));
    sheet.getRange(targetIdx + 2, 10).setValue(now);

    return {
      ok: true,
      inviteCode: newCode,
      globalVersion: now,
    };
  });
}

// ============================================================================
// 訊息同步 / 發送（文字・貼圖・圖片）/ 編輯 / 表情 / 收回 / 圖片讀取 API
// ============================================================================

function handleSyncMessages_(body) {
  const token = String(body.token || '').trim();
  const channelId = String(body.channelId || '').trim();
  const since = Number(body.since || 0);
  const sinceGlobal = Number(body.sinceGlobal || 0);

  if (sinceGlobal > 0 && (!channelId || since > 0)) {
    const cachedUser = getCachedUserByToken_(token);
    if (cachedUser) {
      const cache = CacheService.getScriptCache();
      const gVer = Number(cache.get('global_ver') || 0);
      const chVer = channelId ? Number(cache.get('ch_ver_' + channelId) || 0) : gVer;
      const memberOk = !channelId || isCachedMember_(channelId, cachedUser.id);

      if (memberOk && gVer > 0 && gVer <= sinceGlobal && (!channelId || (chVer > 0 && chVer <= since))) {
        return {
          ok: true,
          hasChanges: false,
          serverTime: Date.now(),
        };
      }
    }
  }

  const auth = requireAuth_(token);
  if (!auth.ok) return auth;

  const ss = ensureSpreadsheet_();
  const channels = listUserChannels_(ss, auth.user.id);
  const cache = CacheService.getScriptCache();

  let globalVersion = Number(cache.get('global_ver') || 0);
  for (let c = 0; c < channels.length; c++) {
    if (channels[c].updatedAt > globalVersion) globalVersion = channels[c].updatedAt;
  }
  if (globalVersion === 0) globalVersion = Date.now();
  cache.put('global_ver', String(globalVersion), 180);

  if (!channelId) {
    return {
      ok: true,
      hasChanges: true,
      channels: channels,
      userProfiles: getAllUserProfiles_(ss),
      messages: [],
      version: 0,
      globalVersion: globalVersion,
    };
  }

  const isMember = channels.some(function (ch) { return ch.id === channelId; });
  if (!isMember) {
    return { ok: false, error: '你沒有此頻道的存取權限' };
  }

  const msgSheet = ss.getSheetByName(SHEETS.MESSAGES);
  const rows = getDataRows_(msgSheet);
  const cfg = getConfig_();

  const matched = [];
  let maxVer = since;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (String(row[1]) !== channelId) continue;

    const updatedAt = Number(row[12] || row[10] || 0);
    if (updatedAt > maxVer) maxVer = updatedAt;

    if (since === 0 || updatedAt > since) {
      matched.push(formatMessageRow_(row));
    }
  }

  const finalMessages = (since === 0 && matched.length > cfg.INITIAL_MESSAGE_LIMIT)
    ? matched.slice(matched.length - cfg.INITIAL_MESSAGE_LIMIT)
    : matched;

  if (maxVer === 0) maxVer = Date.now();
  cache.put('ch_ver_' + channelId, String(maxVer), 180);

  return {
    ok: true,
    hasChanges: true,
    channels: channels,
    userProfiles: getAllUserProfiles_(ss),
    messages: finalMessages,
    version: maxVer,
    globalVersion: Math.max(globalVersion, maxVer),
  };
}

function handleSendMessage_(body) {
  const auth = requireAuth_(body.token);
  if (!auth.ok) return auth;

  const channelId = String(body.channelId || '').trim();
  const type = String(body.type || 'text').trim();
  const replyToId = String(body.replyToId || '').trim();

  if (!channelId) return { ok: false, error: '缺少頻道 ID' };
  if (type !== 'text' && type !== 'sticker' && type !== 'image') {
    return { ok: false, error: '不支援的訊息格式' };
  }

  let storedContent = '';

  if (type === 'text') {
    storedContent = String(body.content || '').trim();
    if (!storedContent) return { ok: false, error: '訊息內容不可為空' };
    if (storedContent.length > 2000) {
      return { ok: false, error: '單則訊息最多 2000 字元' };
    }
  } else if (type === 'sticker') {
    storedContent = String(body.content || '').trim();
    if (!/^[a-z0-9_]{1,40}$/.test(storedContent)) {
      return { ok: false, error: '無效的貼圖代碼' };
    }
  } else if (type === 'image') {
    const mime = String(body.imageMime || '').trim().toLowerCase();
    const ext = ALLOWED_IMAGE_MIMES[mime];
    if (!ext) {
      return { ok: false, error: '僅支援 WebP、JPG、PNG、GIF 圖片格式' };
    }

    let b64 = String(body.imageData || '').trim();
    const commaIdx = b64.indexOf(',');
    if (commaIdx !== -1 && b64.indexOf('data:') === 0) {
      b64 = b64.slice(commaIdx + 1);
    }
    if (!b64) return { ok: false, error: '圖片資料不可為空' };
    if (b64.length > DEFAULT_CONFIG.MAX_IMAGE_BASE64_CHARS) {
      return { ok: false, error: '圖片過大，請控制在 3.5 MB 以內' };
    }

    const caption = String(body.caption || '').trim().slice(0, 500);
    const width = Math.max(0, Math.min(8000, Number(body.width || 0) || 0));
    const height = Math.max(0, Math.min(8000, Number(body.height || 0) || 0));

    // 先檢查成員資格再寫入 Drive 圖片，避免非成員亂塞檔案
    const preCheck = findChannelForMember_(ensureSpreadsheet_(), channelId, auth.user.id);
    if (!preCheck.ok) return preCheck;

    const bytes = Utilities.base64Decode(b64);
    const stamp = Utilities.formatDate(new Date(), DEFAULT_CONFIG.TIMEZONE, 'yyyyMMdd_HHmmss');
    const safeUser = auth.user.username.replace(/[^a-z0-9_-]/gi, '').slice(0, 16) || 'user';
    const fileName = stamp + '_' + safeUser + '_' + randomId_(5) + '.' + ext;

    const imgFolder = ensureImagesFolder_();
    const blob = Utilities.newBlob(bytes, mime, fileName);
    const file = imgFolder.createFile(blob);
    try {
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    } catch (shareErr) {
      // 若網域限制公開分享，前端會自動走 getImage 備援讀取
    }

    storedContent = JSON.stringify({
      fileId: file.getId(),
      caption: caption,
      width: width,
      height: height,
      mime: mime,
    });
  }

  return withLock_(function () {
    const ss = ensureSpreadsheet_();
    const chInfo = findChannelForMember_(ss, channelId, auth.user.id);
    if (!chInfo.ok) return chInfo;

    const msgSheet = ss.getSheetByName(SHEETS.MESSAGES);
    let replyPreview = null;

    if (replyToId) {
      const existingRows = getDataRows_(msgSheet);
      for (let i = existingRows.length - 1; i >= 0; i--) {
        const r = existingRows[i];
        if (String(r[0]) === replyToId && String(r[1]) === channelId) {
          const deleted = isTruthy_(r[13]);
          const origType = String(r[5] || 'text');
          const origContent = String(r[6] || '');
          let previewText = '';
          let previewFileId = '';

          if (deleted) {
            previewText = '此訊息已收回';
          } else if (origType === 'sticker') {
            previewText = origContent;
          } else if (origType === 'image') {
            const imgMeta = safeJsonParse_(origContent, {});
            previewFileId = String(imgMeta.fileId || '');
            previewText = imgMeta.caption ? '[圖片] ' + String(imgMeta.caption).slice(0, 60) : '[圖片]';
          } else {
            previewText = origContent.slice(0, 80);
          }

          replyPreview = {
            id: replyToId,
            senderName: String(r[4] || ''),
            type: deleted ? 'deleted' : origType,
            preview: previewText,
            fileId: previewFileId,
          };
          break;
        }
      }
    }

    const now = nextVersion_('global_ver');
    const nowText = formatDateTime_(now);
    const msgId = 'm_' + now + '_' + randomId_(4);

    msgSheet.appendRow([
      toSheetText_(msgId),
      toSheetText_(channelId),
      toSheetText_(chInfo.name),
      toSheetText_(auth.user.id),
      toSheetText_(auth.user.displayName),
      toSheetText_(type),
      type === 'image' ? storedContent : toSheetText_(storedContent),
      toSheetText_(replyToId),
      replyPreview ? JSON.stringify(replyPreview) : '',
      '{}',
      now,
      toSheetText_(nowText),
      now,
      false,
      0,
    ]);

    const chSheet = ss.getSheetByName(SHEETS.CHANNELS);
    chSheet.getRange(chInfo.rowNum, 9).setValue(now);
    chSheet.getRange(chInfo.rowNum, 10).setValue(now);

    setChannelVersion_(channelId, now);

    return {
      ok: true,
      version: now,
      globalVersion: now,
      message: {
        id: msgId,
        channelId: channelId,
        senderId: auth.user.id,
        senderName: auth.user.displayName,
        type: type,
        content: storedContent,
        replyToId: replyToId,
        replyTo: replyPreview,
        reactions: {},
        createdAt: now,
        updatedAt: now,
        editedAt: 0,
        isDeleted: false,
      },
    };
  });
}

function handleEditMessage_(body) {
  const auth = requireAuth_(body.token);
  if (!auth.ok) return auth;

  const channelId = String(body.channelId || '').trim();
  const msgId = String(body.msgId || '').trim();
  const newText = String(body.content == null ? '' : body.content).trim();

  if (!channelId || !msgId) {
    return { ok: false, error: '缺少必要參數' };
  }

  return withLock_(function () {
    const ss = ensureSpreadsheet_();
    const chInfo = findChannelForMember_(ss, channelId, auth.user.id);
    if (!chInfo.ok) return chInfo;

    const msgSheet = ss.getSheetByName(SHEETS.MESSAGES);
    const rows = getDataRows_(msgSheet);

    for (let i = rows.length - 1; i >= 0; i--) {
      const row = rows[i];
      if (String(row[0]) !== msgId || String(row[1]) !== channelId) continue;

      if (String(row[3]) !== auth.user.id) {
        return { ok: false, error: '只能編輯自己發送的訊息' };
      }
      if (isTruthy_(row[13])) {
        return { ok: false, error: '已收回的訊息無法編輯' };
      }

      const type = String(row[5] || 'text');
      let updatedContent = '';

      if (type === 'text') {
        if (!newText) return { ok: false, error: '訊息內容不可為空' };
        if (newText.length > 2000) return { ok: false, error: '單則訊息最多 2000 字元' };
        updatedContent = newText;
      } else if (type === 'image') {
        if (newText.length > 500) return { ok: false, error: '圖片說明最多 500 字元' };
        const imgObj = safeJsonParse_(row[6], {});
        imgObj.caption = newText;
        updatedContent = JSON.stringify(imgObj);
      } else {
        return { ok: false, error: '此類型的訊息無法編輯' };
      }

      const now = nextVersion_('global_ver');
      const rowNum = i + 2;
      msgSheet.getRange(rowNum, 7).setValue(type === 'image' ? updatedContent : toSheetText_(updatedContent));
      msgSheet.getRange(rowNum, 13).setValue(now);
      msgSheet.getRange(rowNum, 15).setValue(now);

      setChannelVersion_(channelId, now);

      const updatedRow = row.slice();
      updatedRow[6] = updatedContent;
      updatedRow[12] = now;
      updatedRow[14] = now;

      return {
        ok: true,
        message: formatMessageRow_(updatedRow),
        version: now,
      };
    }

    return { ok: false, error: '找不到該訊息' };
  });
}

function handleGetImage_(body) {
  const auth = requireAuth_(body.token);
  if (!auth.ok) return auth;

  const fileId = String(body.fileId || '').trim();
  if (!/^[a-zA-Z0-9_-]{10,80}$/.test(fileId)) {
    return { ok: false, error: '無效的圖片 ID' };
  }

  const imgFolder = ensureImagesFolder_();
  const imgFolderId = imgFolder.getId();
  const file = DriveApp.getFileById(fileId);
  if (file.isTrashed()) {
    return { ok: false, error: '圖片已不存在' };
  }

  // 安全防線：僅允許讀取 messenger_images 資料夾內的圖片
  let inAllowedFolder = false;
  const parents = file.getParents();
  while (parents.hasNext()) {
    if (parents.next().getId() === imgFolderId) {
      inAllowedFolder = true;
      break;
    }
  }
  if (!inAllowedFolder) {
    return { ok: false, error: '無權存取此檔案' };
  }

  const blob = file.getBlob();
  const mime = blob.getContentType() || 'image/webp';
  const b64 = Utilities.base64Encode(blob.getBytes());
  return {
    ok: true,
    dataUrl: 'data:' + mime + ';base64,' + b64,
  };
}

function handleToggleReaction_(body) {
  const auth = requireAuth_(body.token);
  if (!auth.ok) return auth;

  const channelId = String(body.channelId || '').trim();
  const msgId = String(body.msgId || '').trim();
  const emojiId = String(body.emojiId || '').trim();

  if (!channelId || !msgId || !/^[a-z0-9_]{1,32}$/.test(emojiId)) {
    return { ok: false, error: '無效的表情請求' };
  }

  return withLock_(function () {
    const ss = ensureSpreadsheet_();
    const chInfo = findChannelForMember_(ss, channelId, auth.user.id);
    if (!chInfo.ok) return chInfo;

    const msgSheet = ss.getSheetByName(SHEETS.MESSAGES);
    const rows = getDataRows_(msgSheet);

    for (let i = rows.length - 1; i >= 0; i--) {
      const row = rows[i];
      if (String(row[0]) !== msgId || String(row[1]) !== channelId) continue;

      if (isTruthy_(row[13])) {
        return { ok: false, error: '無法對已收回的訊息按表情' };
      }

      const reactions = safeJsonParse_(row[9], {});
      const list = Array.isArray(reactions[emojiId]) ? reactions[emojiId] : [];
      const existsIdx = list.findIndex(function (item) {
        return item && item.id === auth.user.id;
      });

      if (existsIdx >= 0) {
        list.splice(existsIdx, 1);
      } else {
        list.push({ id: auth.user.id, name: auth.user.displayName });
      }

      if (list.length === 0) {
        delete reactions[emojiId];
      } else {
        reactions[emojiId] = list;
      }

      const now = nextVersion_('global_ver');
      const rowNum = i + 2;
      msgSheet.getRange(rowNum, 10).setValue(JSON.stringify(reactions));
      msgSheet.getRange(rowNum, 13).setValue(now);

      setChannelVersion_(channelId, now);

      return {
        ok: true,
        msgId: msgId,
        reactions: reactions,
        updatedAt: now,
        version: now,
      };
    }

    return { ok: false, error: '找不到該訊息' };
  });
}

function handleDeleteMessage_(body) {
  const auth = requireAuth_(body.token);
  if (!auth.ok) return auth;

  const channelId = String(body.channelId || '').trim();
  const msgId = String(body.msgId || '').trim();
  if (!channelId || !msgId) return { ok: false, error: '缺少必要參數' };

  return withLock_(function () {
    const ss = ensureSpreadsheet_();
    const chInfo = findChannelForMember_(ss, channelId, auth.user.id);
    if (!chInfo.ok) return chInfo;

    const msgSheet = ss.getSheetByName(SHEETS.MESSAGES);
    const rows = getDataRows_(msgSheet);

    for (let i = rows.length - 1; i >= 0; i--) {
      const row = rows[i];
      if (String(row[0]) !== msgId || String(row[1]) !== channelId) continue;

      const isSender = String(row[3]) === auth.user.id;
      const isOwner = chInfo.ownerId === auth.user.id;
      if (!isSender && !isOwner) {
        return { ok: false, error: '只能收回自己的訊息' };
      }

      const now = nextVersion_('global_ver');
      const rowNum = i + 2;
      msgSheet.getRange(rowNum, 7).setValue('');
      msgSheet.getRange(rowNum, 10).setValue('{}');
      msgSheet.getRange(rowNum, 13).setValue(now);
      msgSheet.getRange(rowNum, 14).setValue(true);

      setChannelVersion_(channelId, now);

      return { ok: true, msgId: msgId, updatedAt: now, version: now };
    }

    return { ok: false, error: '找不到該訊息' };
  });
}

// ============================================================================
// Google Drive + Google Sheets 資料庫初始化與工具函式
// ============================================================================

function getConfig_() {
  const props = PropertiesService.getScriptProperties();
  return {
    DB_FOLDER_ID: props.getProperty('DB_FOLDER_ID') || DEFAULT_CONFIG.DB_FOLDER_ID,
    SPREADSHEET_NAME: props.getProperty('SPREADSHEET_NAME') || DEFAULT_CONFIG.SPREADSHEET_NAME,
    IMAGES_FOLDER_NAME: props.getProperty('IMAGES_FOLDER_NAME') || DEFAULT_CONFIG.IMAGES_FOLDER_NAME,
    REGISTER_CODE: (props.getProperty('REGISTER_CODE') !== null)
      ? props.getProperty('REGISTER_CODE')
      : DEFAULT_CONFIG.REGISTER_CODE,
    TOKEN_TTL_DAYS: DEFAULT_CONFIG.TOKEN_TTL_DAYS,
    INITIAL_MESSAGE_LIMIT: DEFAULT_CONFIG.INITIAL_MESSAGE_LIMIT,
    TIMEZONE: DEFAULT_CONFIG.TIMEZONE,
  };
}

function ensureImagesFolder_() {
  const props = PropertiesService.getScriptProperties();
  const cfg = getConfig_();
  const savedId = props.getProperty('IMAGES_FOLDER_ID');
  if (savedId) {
    try {
      const existing = DriveApp.getFolderById(savedId);
      if (!existing.isTrashed()) return existing;
    } catch (e) {
      // fallback to lookup/create
    }
  }

  if (!cfg.DB_FOLDER_ID || cfg.DB_FOLDER_ID === 'YOUR_GOOGLE_DRIVE_FOLDER_ID') {
    throw new Error('尚未設定 DB_FOLDER_ID，請先設定你的 Google Drive 資料夾 ID');
  }
  const rootFolder = DriveApp.getFolderById(cfg.DB_FOLDER_ID);
  const subFolders = rootFolder.getFoldersByName(cfg.IMAGES_FOLDER_NAME);
  let target = null;
  while (subFolders.hasNext()) {
    const f = subFolders.next();
    if (!f.isTrashed()) {
      target = f;
      break;
    }
  }
  if (!target) {
    target = rootFolder.createFolder(cfg.IMAGES_FOLDER_NAME);
  }
  props.setProperty('IMAGES_FOLDER_ID', target.getId());
  return target;
}

function ensureSpreadsheet_() {
  const props = PropertiesService.getScriptProperties();
  const cfg = getConfig_();
  let ss = null;

  const savedId = props.getProperty('SPREADSHEET_ID');
  if (savedId) {
    try {
      const file = DriveApp.getFileById(savedId);
      if (!file.isTrashed()) {
        ss = SpreadsheetApp.openById(savedId);
      }
    } catch (e) {
      ss = null;
    }
  }

  if (!ss) {
    if (!cfg.DB_FOLDER_ID || cfg.DB_FOLDER_ID === 'YOUR_GOOGLE_DRIVE_FOLDER_ID') {
      throw new Error('尚未設定 DB_FOLDER_ID，請先設定你的 Google Drive 資料夾 ID');
    }
    const folder = DriveApp.getFolderById(cfg.DB_FOLDER_ID);
    const files = folder.getFilesByName(cfg.SPREADSHEET_NAME);
    while (files.hasNext()) {
      const f = files.next();
      if (!f.isTrashed() && f.getMimeType() === MimeType.GOOGLE_SHEETS) {
        ss = SpreadsheetApp.openById(f.getId());
        break;
      }
    }

    if (!ss) {
      ss = SpreadsheetApp.create(cfg.SPREADSHEET_NAME);
      DriveApp.getFileById(ss.getId()).moveTo(folder);
    }

    props.setProperty('SPREADSHEET_ID', ss.getId());
  }

  ensureSheetStructure_(ss);
  return ss;
}

function ensureSheetStructure_(ss) {
  const names = [SHEETS.USERS, SHEETS.CHANNELS, SHEETS.MESSAGES];
  const existingSheets = ss.getSheets();

  if (existingSheets.length === 1 && names.indexOf(existingSheets[0].getName()) === -1) {
    existingSheets[0].setName(SHEETS.USERS);
  }

  for (let i = 0; i < names.length; i++) {
    const name = names[i];
    let sheet = ss.getSheetByName(name);
    if (!sheet) {
      sheet = ss.insertSheet(name);
    }
    const cols = HEADERS[name];
    if (sheet.getLastRow() === 0) {
      const headerRange = sheet.getRange(1, 1, 1, cols.length);
      headerRange.setValues([cols]);
      headerRange
        .setBackground('#5B5FC7')
        .setFontColor('#FFFFFF')
        .setFontWeight('bold');
      sheet.setFrozenRows(1);
    } else if (sheet.getLastColumn() < cols.length) {
      // 自動無痛補齊新版新增的欄位（例如 Messages.edited_at）
      const startCol = sheet.getLastColumn() + 1;
      const missingCols = cols.slice(startCol - 1);
      const extraRange = sheet.getRange(1, startCol, 1, missingCols.length);
      extraRange.setValues([missingCols]);
      extraRange
        .setBackground('#5B5FC7')
        .setFontColor('#FFFFFF')
        .setFontWeight('bold');
    }
  }
}

function requireAuth_(token) {
  const t = String(token || '').trim();
  if (!t) return { ok: false, error: '尚未登入', code: 'UNAUTHORIZED' };

  const cached = getCachedUserByToken_(t);
  if (cached) return { ok: true, user: cached };

  const ss = ensureSpreadsheet_();
  const sheet = ss.getSheetByName(SHEETS.USERS);
  const rows = getDataRows_(sheet);
  const now = Date.now();

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (String(row[6]) !== t) continue;

    const expireAt = Number(row[7] || 0);
    if (expireAt > 0 && now > expireAt) {
      return { ok: false, error: '登入已過期，請重新登入', code: 'UNAUTHORIZED' };
    }

    const user = {
      id: String(row[0]),
      username: String(row[1]),
      displayName: String(row[2]),
      avatarColor: String(row[3] || AVATAR_COLORS[0]),
      avatar: String(row[10] || ''),
    };
    cacheUserToken_(t, user, expireAt);
    return { ok: true, user: user };
  }

  return { ok: false, error: '無效的登入狀態，請重新登入', code: 'UNAUTHORIZED' };
}

function getAllUserProfiles_(ss) {
  const cache = CacheService.getScriptCache();
  const cached = cache.get('all_user_profiles');
  if (cached) {
    const parsed = safeJsonParse_(cached, null);
    if (parsed) return parsed;
  }

  const sheet = ss.getSheetByName(SHEETS.USERS);
  const rows = getDataRows_(sheet);
  const map = {};
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const uid = String(r[0] || '');
    if (!uid) continue;
    map[uid] = {
      displayName: String(r[2] || ''),
      avatarColor: String(r[3] || AVATAR_COLORS[0]),
      avatar: String(r[10] || ''),
    };
  }
  cache.put('all_user_profiles', JSON.stringify(map), 600);
  return map;
}

function clearUserProfilesCache_() {
  CacheService.getScriptCache().remove('all_user_profiles');
}

function listUserChannels_(ss, userId) {
  const sheet = ss.getSheetByName(SHEETS.CHANNELS);
  const rows = getDataRows_(sheet);
  const result = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const channelId = String(row[0]);
    const members = safeJsonParse_(row[5], []);
    cacheChannelMembers_(channelId, members);

    if (members.indexOf(userId) !== -1) {
      result.push(formatChannelRow_(row, userId));
    }
  }

  result.sort(function (a, b) {
    return (b.lastMessageAt || 0) - (a.lastMessageAt || 0);
  });
  return result;
}

function findChannelForMember_(ss, channelId, userId) {
  const sheet = ss.getSheetByName(SHEETS.CHANNELS);
  const rows = getDataRows_(sheet);
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (String(row[0]) !== channelId) continue;

    const members = safeJsonParse_(row[5], []);
    cacheChannelMembers_(channelId, members);
    if (members.indexOf(userId) === -1) {
      return { ok: false, error: '你不是此頻道的成員' };
    }
    return {
      ok: true,
      rowNum: i + 2,
      id: channelId,
      name: String(row[1]),
      ownerId: String(row[3]),
      members: members,
    };
  }
  return { ok: false, error: '找不到該頻道' };
}

function formatChannelRow_(row, viewerUserId) {
  const ownerId = String(row[3]);
  const isOwner = ownerId === viewerUserId;
  const members = safeJsonParse_(row[5], []);
  const memberNames = String(row[6] || '')
    .split(',')
    .map(function (s) { return s.trim(); })
    .filter(Boolean);

  return {
    id: String(row[0]),
    name: String(row[1]),
    inviteCode: isOwner ? String(row[2]) : null,
    ownerId: ownerId,
    ownerName: String(row[4] || ''),
    isOwner: isOwner,
    memberCount: members.length,
    memberIds: members,
    memberNames: memberNames,
    lastMessageAt: Number(row[8] || 0),
    updatedAt: Number(row[9] || 0),
  };
}

function formatMessageRow_(row) {
  const isDeleted = isTruthy_(row[13]);
  return {
    id: String(row[0]),
    channelId: String(row[1]),
    senderId: String(row[3]),
    senderName: String(row[4]),
    type: String(row[5] || 'text'),
    content: isDeleted ? '' : String(row[6] || ''),
    replyToId: String(row[7] || ''),
    replyTo: row[8] ? safeJsonParse_(row[8], null) : null,
    reactions: isDeleted ? {} : safeJsonParse_(row[9], {}),
    createdAt: Number(row[10] || 0),
    updatedAt: Number(row[12] || row[10] || 0),
    editedAt: Number(row[14] || 0),
    isDeleted: isDeleted,
  };
}

// ============================================================================
// 快取、鎖定、雜湊與通用 Helper
// ============================================================================

function withLock_(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(12000);
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

function getDataRows_(sheet) {
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return [];
  return sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues();
}

function cacheUserToken_(token, user, expireAt) {
  const cache = CacheService.getScriptCache();
  cache.put('tok_' + token, JSON.stringify({ user: user, expireAt: expireAt }), 600);
}

function getCachedUserByToken_(token) {
  if (!token) return null;
  const raw = CacheService.getScriptCache().get('tok_' + token);
  if (!raw) return null;
  const parsed = safeJsonParse_(raw, null);
  if (!parsed || !parsed.user) return null;
  if (parsed.expireAt && Date.now() > parsed.expireAt) return null;
  return parsed.user;
}

function clearTokenCache_(token) {
  if (!token) return;
  CacheService.getScriptCache().remove('tok_' + token);
}

function cacheChannelMembers_(channelId, members) {
  CacheService.getScriptCache().put('ch_mem_' + channelId, JSON.stringify(members), 600);
}

function isCachedMember_(channelId, userId) {
  const raw = CacheService.getScriptCache().get('ch_mem_' + channelId);
  if (!raw) return false;
  const members = safeJsonParse_(raw, []);
  return members.indexOf(userId) !== -1;
}

function nextVersion_(key) {
  const cache = CacheService.getScriptCache();
  const prev = Number(cache.get(key) || 0);
  const now = Date.now();
  const next = now > prev ? now : prev + 1;
  cache.put(key, String(next), 180);
  return next;
}

function setChannelVersion_(channelId, ver) {
  CacheService.getScriptCache().put('ch_ver_' + channelId, String(ver), 180);
}

function getGlobalVersion_() {
  const cache = CacheService.getScriptCache();
  let v = Number(cache.get('global_ver') || 0);
  if (!v) {
    v = Date.now();
    cache.put('global_ver', String(v), 180);
  }
  return v;
}

function ensureServerPepper_() {
  const props = PropertiesService.getScriptProperties();
  let pepper = props.getProperty('SERVER_PEPPER');
  if (!pepper) {
    pepper = randomHex_(32);
    props.setProperty('SERVER_PEPPER', pepper);
  }
  return pepper;
}

function hashPassword_(password, salt) {
  const pepper = ensureServerPepper_();
  const bytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    pepper + ':' + salt + ':' + password,
    Utilities.Charset.UTF_8
  );
  return bytesToHex_(bytes);
}

function bytesToHex_(bytes) {
  return bytes.map(function (b) {
    const v = (b < 0 ? b + 256 : b).toString(16);
    return v.length === 1 ? '0' + v : v;
  }).join('');
}

function randomHex_(len) {
  let out = '';
  while (out.length < len) {
    out += Utilities.getUuid().replace(/-/g, '');
  }
  return out.slice(0, len);
}

function randomId_(len) {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let out = '';
  for (let i = 0; i < len; i++) {
    out += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return out;
}

function generateInviteCode_() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < 6; i++) {
    out += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return out;
}

function toSheetText_(v) {
  const s = String(v == null ? '' : v);
  if (!s) return '';
  if (/^[=+\-@']/.test(s) || /^\d/.test(s) || /^(true|false)$/i.test(s)) {
    return "'" + s;
  }
  return s;
}

function formatDateTime_(ms) {
  return Utilities.formatDate(new Date(ms), DEFAULT_CONFIG.TIMEZONE, 'yyyy/MM/dd HH:mm:ss');
}

function safeJsonParse_(str, fallback) {
  if (typeof str !== 'string' || !str) return fallback;
  try {
    return JSON.parse(str);
  } catch (e) {
    return fallback;
  }
}

function isTruthy_(v) {
  return v === true || String(v).toUpperCase() === 'TRUE';
}

function jsonOut_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
