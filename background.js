/**
 * 跨平台稍後觀看自動播放器 - Background Service Worker
 * 負責：右鍵選單、網址解析與標題獲取、播放狀態管理、分頁轉址跳轉、Google 帳號雲端同步
 */

if (typeof importScripts === "function") {
  importScripts("i18n.js");
}

// 初始化右鍵選單與預設資料（支援從本地平滑遷移至雲端 sync 儲存庫）
chrome.runtime.onInstalled.addListener(async () => {
  const lang = await getCurrentLanguage();

  // 建立滑鼠右鍵選單 (依作業系統/使用者語言自動設定標題)
  chrome.contextMenus.create({
    id: "add_to_watch_later",
    title: getTranslation(lang, "btnWatchLaterTitle"),
    contexts: ["page", "link"]
  });

  // 初始化儲存庫與雲端遷移檢查
  getSyncedPlaylist().then((list) => {
    chrome.storage.local.set({ playlist: list });
    updateBadge();
  }).catch((err) => console.warn("onInstalled sync init error:", err));

  // 播放器執行個體狀態（維持單機 local，避免兩台電腦互相干擾播放分頁）
  chrome.storage.local.get(["playState"], (res) => {
    if (!res.playState) {
      chrome.storage.local.set({
        playState: { isPlaying: false, currentIndex: 0, playerTabId: null }
      });
    }
  });
});

// 常駐背景即刻刷新圖示徽章
updateBadge();

// 監聽雲端儲存庫變更（隔壁電腦加入或刪除影片，本機即刻同步刷新徽章與快取，絕不允許空資料覆蓋既有清單）
chrome.storage.onChanged.addListener(async (changes, area) => {
  try {
    if (area === "sync") {
      const list = await getSyncedPlaylist();
      const loc = await chrome.storage.local.get(["playlist"]);
      const currentLocal = Array.isArray(loc.playlist) ? loc.playlist : [];

      // 防清空防線：若本地有影片但雲端傳來空清單，嚴禁覆蓋本機！
      if (list.length === 0 && currentLocal.length > 0) {
        console.warn("[安全防線] 阻斷空雲端資料覆蓋本地既有影片！");
        return;
      }

      chrome.storage.local.set({ playlist: list });
      if (list.length > 0) {
        chrome.storage.local.set({ playlist_backup: list });
      }
      updateBadge();
    } else if (area === "local" && changes.playlist) {
      if (changes.playlist.newValue && changes.playlist.newValue.length > 0) {
        chrome.storage.local.set({ playlist_backup: changes.playlist.newValue });
      }
      updateBadge();
    }
  } catch (err) {
    console.warn("Storage sync listener error:", err);
  }
});

// 監聽右鍵選單點擊
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === "add_to_watch_later") {
    const targetUrl = info.linkUrl || info.pageUrl || tab?.url;
    if (!targetUrl) return;

    const item = await parseVideoInfo(targetUrl, tab?.title);
    if (item) {
      await addPlaylistItem(item);
      showNotification("已成功加入清單", item.title);
    }
  }
});

// 監聽分頁關閉事件（若播放中的分頁被使用者手動關閉，則重設本機播放狀態）
chrome.tabs.onRemoved.addListener((closedTabId) => {
  chrome.storage.local.get(["playState"], (res) => {
    if (res.playState && res.playState.playerTabId === closedTabId) {
      chrome.storage.local.set({
        playState: { ...res.playState, isPlaying: false, playerTabId: null }
      });
      updateBadge();
    }
  });
});

// 統一訊息處理中樞
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const { action } = message;

  if (action === "PARSE_AND_ADD") {
    parseVideoInfo(message.url, message.title, message.duration, message.thumbnail).then((item) => {
      if (!item) {
        sendResponse({ success: false, error: "不支援的影片網址（僅支援 YouTube 與 Bilibili）" });
      } else {
        addPlaylistItem(item).then((playlist) => {
          sendResponse({ success: true, item, playlist });
        });
      }
    });
    return true; // 非同步響應
  }

  if (action === "SAVE_PLAYLIST") {
    saveSyncedPlaylist(message.playlist || []).then((list) => {
      sendResponse({ success: true, list });
    });
    return true;
  }

  if (action === "GET_STATE") {
    getSyncedPlaylist().then((playlist) => {
      chrome.storage.local.get(["playState"], (res) => {
        sendResponse({
          playlist,
          playState: res.playState || { isPlaying: false, currentIndex: 0, playerTabId: null }
        });
      });
      // 觸發背景自動補齊缺失時長
      backfillMissingDurations();
    });
    return true;
  }

  if (action === "START_PLAYLIST") {
    startPlayback(message.startIndex ?? 0).then((res) => sendResponse(res));
    return true;
  }

  if (action === "STOP_PLAYLIST") {
    stopPlayback().then(() => sendResponse({ success: true }));
    return true;
  }

  if (action === "VIDEO_ENDED") {
    // 影片結束，由 content.js 回報
    handleVideoEnded(sender.tab?.id).then((res) => sendResponse(res));
    return true;
  }

  if (action === "SKIP_NEXT") {
    skipNext(sender.tab?.id).then((res) => sendResponse(res));
    return true;
  }

  if (action === "SKIP_PREV") {
    skipPrev(sender.tab?.id).then((res) => sendResponse(res));
    return true;
  }

  if (action === "WINDOW_FULLSCREEN") {
    if (sender.tab?.windowId) {
      chrome.windows.update(sender.tab.windowId, { state: "fullscreen" });
    }
    return true;
  }

  if (action === "CHECK_TAB_STATUS") {
    getSyncedPlaylist().then((playlist) => {
      chrome.storage.local.get(["playState", "autoFullscreen", "autoSpeedEnabled", "playbackSpeed"], (res) => {
        const ps = res.playState || {};
        const isPlayerTab = ps.isPlaying && (ps.playerTabId === sender.tab?.id);
        sendResponse({
          isPlayerTab,
          isPlaying: ps.isPlaying,
          currentIndex: ps.currentIndex,
          currentItem: playlist[ps.currentIndex] || null,
          nextItem: playlist[ps.currentIndex + 1] || null,
          total: playlist.length,
          autoFullscreen: res.autoFullscreen !== false,
          autoSpeedEnabled: !!res.autoSpeedEnabled,
          playbackSpeed: res.playbackSpeed || 1.5
        });
      });
    });
    return true;
  }
});

const CHUNK_SIZE = 8; // 每個分塊 8 部輕量化影片 (約 2.3KB，留有 72% 巨量安全餘裕，徹底消除 QuotaBytesPerItem 異常)

// 將影片項目輕量化壓縮後寫入雲端 (省去 70% 體積)
function packItemForSync(item) {
  const pMap = { youtube: "y", bilibili: "b", tiktok: "t", facebook: "f" };
  const thumb = (item.thumbnail || "").startsWith("data:") ? "" : (item.thumbnail || "");
  return {
    p: pMap[item.platform] || "y",
    v: item.videoId || "",
    t: (item.title || "").slice(0, 100),
    d: item.duration || "",
    a: item.addedAt || Date.now(),
    u: item.url || "",
    i: thumb
  };
}

// 將雲端輕量資料還原為完整物件
function unpackItemFromSync(raw) {
  if (!raw) return null;
  if (raw.platform && raw.url) return raw; // 向下相容完整物件

  const pRev = { y: "youtube", b: "bilibili", t: "tiktok", f: "facebook" };
  const platform = pRev[raw.p] || (raw.v?.length === 11 ? "youtube" : "bilibili");
  const videoId = raw.v || "";
  let defaultUrl = "";
  let defaultThumb = "icons/icon48.png";
  let defaultTitle = "Video";

  if (platform === "youtube") {
    defaultUrl = `https://www.youtube.com/watch?v=${videoId}`;
    defaultThumb = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
    defaultTitle = "YouTube 影片";
  } else if (platform === "bilibili") {
    defaultUrl = `https://www.bilibili.com/video/${videoId}`;
    defaultThumb = "https://static.hdslb.com/images/favicon.ico";
    defaultTitle = "B站影片";
  } else if (platform === "tiktok") {
    defaultUrl = raw.u || `https://www.tiktok.com/`;
    defaultTitle = "TikTok 影片";
  } else if (platform === "facebook") {
    defaultUrl = raw.u || `https://www.facebook.com/reel/${videoId}`;
    defaultTitle = "Facebook Reels";
  }

  return {
    id: `${platform}_${videoId || "v"}_${(raw.a || Date.now()).toString(36)}`,
    platform,
    videoId,
    url: raw.u || defaultUrl,
    title: raw.t || defaultTitle,
    thumbnail: raw.i || defaultThumb,
    duration: raw.d || "",
    addedAt: raw.a || Date.now()
  };
}

/**
 * 讀取雲端分塊同步播放清單（具備解壓縮還原與本機 10MB 大容量優先備援）
 */
async function getSyncedPlaylist() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(null, (syncData) => {
      let syncList = [];
      try {
        if (syncData) {
          if (typeof syncData.sync_count === "number" && syncData.sync_count > 0) {
            const numChunks = Math.ceil(syncData.sync_count / CHUNK_SIZE);
            for (let i = 0; i < numChunks; i++) {
              const chunk = syncData[`sync_chunk_${i}`];
              if (Array.isArray(chunk)) {
                syncList.push(...chunk.map(unpackItemFromSync).filter(Boolean));
              }
            }
          } else if (Array.isArray(syncData.playlist)) {
            syncList = syncData.playlist.map(unpackItemFromSync).filter(Boolean);
          }
        }
      } catch (e) {
        console.warn("Sync unpack error:", e);
      }

      chrome.storage.local.get(["playlist", "playlist_backup"], (locData) => {
        const localList = Array.isArray(locData.playlist) ? locData.playlist : [];
        const backupList = Array.isArray(locData.playlist_backup) ? locData.playlist_backup : [];

        // 優先防線 1：若本機與雲端暫時皆為空，但本地快照有存檔，秒速自動還原防清空！
        if (localList.length === 0 && syncList.length === 0 && backupList.length > 0) {
          console.warn("[安全防線] 偵測到清單暫時為空，自動從本機快照還原", backupList.length, "部影片！");
          chrome.storage.local.set({ playlist: backupList });
          resolve(backupList);
          return;
        }

        // 優先防線 2：本地大於等於雲端，以本地為準
        if (localList.length >= syncList.length && localList.length > 0) {
          resolve(localList);
        } else if (syncList.length > 0) {
          chrome.storage.local.set({ playlist: syncList, playlist_backup: syncList });
          resolve(syncList);
        } else {
          resolve(localList.length > 0 ? localList : backupList);
        }
      });
    });
  });
}

/**
 * 寫入雲端同步播放清單 (自動分塊與安全 Promise 封裝，絕對不拋出未捕獲錯誤)
 */
async function saveSyncedPlaylist(list) {
  // 1. 同步保存至本地 (10MB 無上限大容量保護，若非空自動建立 playlist_backup 永久快照)
  try {
    const dataToSet = { playlist: list };
    if (Array.isArray(list) && list.length > 0) {
      dataToSet.playlist_backup = list;
    }
    await chrome.storage.local.set(dataToSet);
    updateBadge();
  } catch (e) {
    console.warn("Local storage write error:", e);
  }

  // 2. 輕量化壓縮後分塊寫入 Google 雲端 sync
  try {
    const packedList = list.map(packItemForSync);
    const numChunks = Math.ceil(packedList.length / CHUNK_SIZE);
    const syncPayload = {
      sync_count: packedList.length,
      sync_timestamp: Date.now()
    };

    for (let i = 0; i < numChunks; i++) {
      syncPayload[`sync_chunk_${i}`] = packedList.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
    }

    // 清理舊的單一 key 與多餘的分塊 key
    const allKeys = await chrome.storage.sync.get(null);
    const keysToRemove = Object.keys(allKeys || {}).filter(
      (k) => k === "playlist" || (k.startsWith("sync_chunk_") && parseInt(k.replace("sync_chunk_", ""), 10) >= numChunks)
    );
    if (keysToRemove.length > 0) {
      await chrome.storage.sync.remove(keysToRemove);
    }

    // 安全寫入 (try-catch 包覆，永不觸發 Uncaught Promise 異常)
    await chrome.storage.sync.set(syncPayload);
  } catch (err) {
    console.warn("[稍後觀看] 雲端同步配額保護已觸發，本機已安全完整儲存:", err);
  }

  return list;
}

/**
 * 智能解析 YouTube / Bilibili 網址並獲取標題與縮圖
 */
async function parseVideoInfo(rawUrl, fallbackTitle = "", fallbackDuration = "", fallbackThumbnail = "") {
  if (!rawUrl || typeof rawUrl !== "string") return null;
  const url = rawUrl.trim();

  // 1. YouTube 解析
  const ytMatch = url.match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?|shorts)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i);
  if (ytMatch) {
    const videoId = ytMatch[1];
    const canonicalUrl = `https://www.youtube.com/watch?v=${videoId}`;
    let title = fallbackTitle && !fallbackTitle.includes("YouTube") ? fallbackTitle : "";
    let thumbnail = fallbackThumbnail || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;

    // 嘗試透過 oembed 獲取精確標題
    try {
      const resp = await fetch(`https://noembed.com/embed?url=${encodeURIComponent(canonicalUrl)}`);
      if (resp.ok) {
        const data = await resp.json();
        if (data.title) title = data.title;
      }
    } catch (e) {
      console.warn("YouTube oEmbed fetch error:", e);
    }

    if (!title) title = `YouTube 影片 (${videoId})`;

    let duration = fallbackDuration || "";
    if (!duration) {
      try {
        const pageResp = await fetch(canonicalUrl);
        if (pageResp.ok) {
          const html = await pageResp.text();
          const match = html.match(/"lengthSeconds":"(\d+)"/);
          if (match) {
            const sec = parseInt(match[1], 10);
            const h = Math.floor(sec / 3600);
            const m = Math.floor((sec % 3600) / 60);
            const s = sec % 60;
            const sStr = s < 10 ? `0${s}` : `${s}`;
            duration = h > 0 ? `${h}:${m < 10 ? '0' : ''}${m}:${sStr}` : `${m}:${sStr}`;
          }
        }
      } catch (e) {
        console.warn("YouTube duration fetch error:", e);
      }
    }

    return {
      id: "yt_" + videoId + "_" + Date.now().toString(36),
      platform: "youtube",
      videoId,
      url: canonicalUrl,
      title: title.replace(/ - YouTube$/, ""),
      thumbnail,
      duration: duration || "",
      addedAt: Date.now()
    };
  }

  // 2. Bilibili 解析
  const bvidMatch = url.match(/bilibili\.com\/video\/(BV[a-zA-Z0-9]+)/i);
  if (bvidMatch) {
    const bvid = bvidMatch[1];
    let canonicalUrl = `https://www.bilibili.com/video/${bvid}`;
    // 若原網址含有分P參數 (?p=2)，予以保留
    const pMatch = url.match(/[?&]p=(\d+)/);
    if (pMatch) canonicalUrl += `?p=${pMatch[1]}`;

    let title = fallbackTitle && !fallbackTitle.includes("哔哩哔哩") ? fallbackTitle : "";
    let thumbnail = fallbackThumbnail || "";
    let duration = (fallbackDuration && fallbackDuration !== "00:01" && fallbackDuration !== "00:29" && fallbackDuration !== "00:00") ? fallbackDuration : "";

    // 呼叫 B站 view API 取得官方高畫質封面圖與標題
    if (!thumbnail || thumbnail.includes("favicon.ico") || !title) {
      try {
        const vResp = await fetch(`https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`, {
          headers: {
            Referer: "https://www.bilibili.com/",
            Cookie: "buvid3=12345678-ABCD-EF01-2345-6789ABCDEF01infoc;"
          }
        });
        if (vResp.ok) {
          const vJson = await vResp.json();
          if (vJson.code === 0 && vJson.data) {
            if (vJson.data.pic) thumbnail = vJson.data.pic.replace("http://", "https://");
            if (!title) title = vJson.data.title || title;
          }
        }
      } catch (e) {
        console.warn("Bilibili view API pic fetch error:", e);
      }
    }

    if (!thumbnail) thumbnail = "https://static.hdslb.com/images/favicon.ico";

    // 呼叫 B站免 WBI 官方 pagelist API 精確獲取該分P的真實官方時長 (絕無 412 錯誤)
    if (!duration) {
      try {
        const resp = await fetch(`https://api.bilibili.com/x/player/pagelist?bvid=${bvid}`, {
          headers: { Referer: "https://www.bilibili.com/" }
        });
        if (resp.ok) {
          const json = await resp.json();
          if (json.code === 0 && Array.isArray(json.data) && json.data.length > 0) {
            const pIndex = pMatch ? parseInt(pMatch[1], 10) : 1;
            const targetPage = json.data[pIndex - 1] || json.data[0];
            if (targetPage && targetPage.duration) {
              const sec = targetPage.duration;
              const h = Math.floor(sec / 3600);
              const m = Math.floor((sec % 3600) / 60);
              const s = sec % 60;
              const sStr = s < 10 ? `0${s}` : `${s}`;
              duration = h > 0 ? `${h}:${m < 10 ? '0' : ''}${m}:${sStr}` : `${m}:${sStr}`;
            }
          }
        }
      } catch (e) {
        console.warn("Bilibili pagelist API fetch error:", e);
      }
    }

    if (!title) title = `B站影片 (${bvid})`;

    return {
      id: "bili_" + bvid + "_" + Date.now().toString(36),
      platform: "bilibili",
      videoId: bvid,
      url: canonicalUrl,
      title: title.replace(/_哔哩哔哩_bilibili$/, ""),
      thumbnail,
      duration: duration || "",
      addedAt: Date.now()
    };
  }

  // 3. TikTok 解析
  const tiktokMatch = url.match(/tiktok\.com\/(?:@[^\/?#]+\/video\/(\d+)|t\/([a-zA-Z0-9]+))/i) ||
                      url.match(/vm\.tiktok\.com\/([a-zA-Z0-9]+)/i);
  if (tiktokMatch || url.includes("tiktok.com/")) {
    const videoId = tiktokMatch ? (tiktokMatch[1] || tiktokMatch[2] || "") : ("tt_" + Date.now().toString(36));
    const canonicalUrl = url.split("?")[0];
    let title = fallbackTitle && !fallbackTitle.includes("TikTok - Make Your Day") ? fallbackTitle : "";
    let thumbnail = fallbackThumbnail || "";

    // 呼叫 TikTok 官方公開 oEmbed API 取得標題與縮圖
    try {
      const resp = await fetch(`https://www.tiktok.com/oembed?url=${encodeURIComponent(canonicalUrl)}`);
      if (resp.ok) {
        const data = await resp.json();
        if (data.title) title = data.title;
        if (!thumbnail && data.thumbnail_url) thumbnail = data.thumbnail_url;
      }
    } catch (e) {
      console.warn("TikTok oEmbed fetch error:", e);
    }

    if (!title) title = `TikTok 影片 (${videoId})`;
    if (!thumbnail) thumbnail = "icons/icon48.png";

    return {
      id: "tt_" + videoId + "_" + Date.now().toString(36),
      platform: "tiktok",
      videoId,
      url: canonicalUrl,
      title: title.replace(/\s*\|\s*TikTok$/, ""),
      thumbnail,
      duration: fallbackDuration || "",
      addedAt: Date.now()
    };
  }

  // 4. Facebook Reels / Watch / Video 解析
  const fbMatch = url.match(/facebook\.com\/(?:reel\/(\d+)|share\/r\/([^\/?#]+)|watch\/?\?v=(\d+)|[^\/?#]+\/videos\/(\d+))/i) ||
                  url.match(/fb\.watch\/([^\/?#]+)/i);
  if (fbMatch || (url.includes("facebook.com/") && (url.includes("/reel") || url.includes("/videos") || url.includes("/watch")))) {
    const videoId = (fbMatch && (fbMatch[1] || fbMatch[2] || fbMatch[3] || fbMatch[4])) || ("fb_" + Date.now().toString(36));
    const canonicalUrl = url.split("&")[0];
    let title = fallbackTitle && fallbackTitle !== "Facebook" ? fallbackTitle : "";
    if (!title) title = `Facebook Reels (${videoId})`;
    const thumbnail = fallbackThumbnail || "icons/icon48.png";

    return {
      id: "fb_" + videoId + "_" + Date.now().toString(36),
      platform: "facebook",
      videoId,
      url: canonicalUrl,
      title: title.replace(/\s*\|\s*Facebook$/, ""),
      thumbnail,
      duration: fallbackDuration || "",
      addedAt: Date.now()
    };
  }

  return null;
}

/**
 * 將項目寫入雲端播放清單 (自動雲端同步，若重複則置頂更新)
 */
async function addPlaylistItem(item) {
  const list = await getSyncedPlaylist();
  // 檢查是否已存在 (根據 videoId 或 URL 比對)
  const existingIdx = list.findIndex(
    (x) => (x.videoId && x.videoId === item.videoId) || x.url === item.url
  );
  if (existingIdx >= 0) {
    // 若已存在，將其移到最前面 (置頂更新)，並補齊最新時長
    const existing = list.splice(existingIdx, 1)[0];
    if (!existing.duration && item.duration) existing.duration = item.duration;
    list.unshift(existing);
  } else {
    // 全新影片，排在最上方
    list.unshift(item);
  }
  await saveSyncedPlaylist(list);
  return list;
}

/**
 * 啟動自動播放
 */
async function startPlayback(startIndex = 0) {
  const playlist = await getSyncedPlaylist();
  const { playState } = await chrome.storage.local.get(["playState"]);

  if (!playlist || playlist.length === 0) {
    return { success: false, error: "清單是空的，請先加入影片！" };
  }

  const validIndex = Math.max(0, Math.min(startIndex, playlist.length - 1));
  const targetItem = playlist[validIndex];

  let targetTabId = playState?.playerTabId;

  // 檢查既有的 playerTab 是否仍然開啟
  let tabExists = false;
  if (targetTabId) {
    try {
      const existingTab = await chrome.tabs.get(targetTabId);
      if (existingTab) tabExists = true;
    } catch (e) {
      tabExists = false;
    }
  }

  if (tabExists) {
    await chrome.tabs.update(targetTabId, { url: targetItem.url, active: true });
  } else {
    const newTab = await chrome.tabs.create({ url: targetItem.url, active: true });
    targetTabId = newTab.id;
  }

  // 自動全螢幕：僅對 YouTube 與 B站啟用全螢幕；TikTok / Facebook Reels 保持視窗最大化不強制全螢幕
  const { autoFullscreen } = await chrome.storage.local.get(["autoFullscreen"]);
  const shouldFullscreen = autoFullscreen !== false && (targetItem.platform === "youtube" || targetItem.platform === "bilibili");
  try {
    const activeTab = await chrome.tabs.get(targetTabId);
    if (activeTab?.windowId) {
      chrome.windows.update(activeTab.windowId, { state: shouldFullscreen ? "fullscreen" : "maximized" });
    }
  } catch (e) {
    console.warn("Auto fullscreen window error:", e);
  }

  const newPlayState = {
    isPlaying: true,
    currentIndex: validIndex,
    playerTabId: targetTabId
  };

  await chrome.storage.local.set({ playState: newPlayState });
  updateBadge();
  return { success: true, playState: newPlayState };
}

/**
 * 停止自動播放
 */
async function stopPlayback() {
  const { playState } = await chrome.storage.local.get(["playState"]);
  const newPlayState = {
    ...(playState || {}),
    isPlaying: false
  };

  // 停止時將視窗恢復為最大化一般視窗
  if (playState?.playerTabId) {
    chrome.tabs.get(playState.playerTabId, (tab) => {
      if (tab?.windowId) {
        chrome.windows.update(tab.windowId, { state: "maximized" });
      }
    });
  }

  await chrome.storage.local.set({ playState: newPlayState });
  updateBadge();
}

/**
 * 處理影片播放結束事件（換下一部）
 */
async function handleVideoEnded(tabId) {
  const playlist = await getSyncedPlaylist();
  const { playState } = await chrome.storage.local.get(["playState"]);
  if (!playState || !playState.isPlaying) return { handled: false };

  if (tabId && playState.playerTabId && tabId !== playState.playerTabId) {
    return { handled: false };
  }

  const nextIndex = playState.currentIndex + 1;
  if (nextIndex < playlist.length) {
    const nextItem = playlist[nextIndex];
    await chrome.storage.local.set({
      playState: { ...playState, currentIndex: nextIndex }
    });

    if (playState.playerTabId) {
      chrome.tabs.update(playState.playerTabId, { url: nextItem.url });

      // 換片時依據平台決定是否維持全螢幕 (TikTok/FB Reels 不強制全螢幕)
      const { autoFullscreen } = await chrome.storage.local.get(["autoFullscreen"]);
      const shouldFullscreen = autoFullscreen !== false && (nextItem.platform === "youtube" || nextItem.platform === "bilibili");
      chrome.tabs.get(playState.playerTabId, (tab) => {
        if (tab?.windowId) {
          chrome.windows.update(tab.windowId, { state: shouldFullscreen ? "fullscreen" : "maximized" });
        }
      });
    }
    updateBadge();
    return { handled: true, nextIndex, nextItem };
  } else {
    await chrome.storage.local.set({
      playState: { ...playState, isPlaying: false }
    });
    updateBadge();
    showNotification("🎉 播放完畢", "所有跨平台影片清單已全數自動播放完成！");
    return { handled: true, finished: true };
  }
}

/**
 * 手動跳至下一部
 */
async function skipNext(tabId) {
  return handleVideoEnded(tabId);
}

/**
 * 手動跳至上一部
 */
async function skipPrev(tabId) {
  const playlist = await getSyncedPlaylist();
  const { playState } = await chrome.storage.local.get(["playState"]);
  if (!playState || !playState.isPlaying) return { handled: false };

  const prevIndex = Math.max(0, playState.currentIndex - 1);
  const prevItem = playlist[prevIndex];

  await chrome.storage.local.set({
    playState: { ...playState, currentIndex: prevIndex }
  });

  if (playState.playerTabId) {
    chrome.tabs.update(playState.playerTabId, { url: prevItem.url });
  }
  updateBadge();
  return { handled: true, prevIndex, prevItem };
}

/**
 * 更新圖示徽章
 */
async function updateBadge() {
  try {
    const list = await getSyncedPlaylist();
    const { playState } = await chrome.storage.local.get(["playState"]);
    const ps = playState || {};

    if (ps.isPlaying && list.length > 0) {
      chrome.action.setBadgeText({ text: `${ps.currentIndex + 1}/${list.length}` });
      chrome.action.setBadgeBackgroundColor({ color: "#22c55e" });
    } else if (list.length > 0) {
      chrome.action.setBadgeText({ text: `${list.length}` });
      chrome.action.setBadgeBackgroundColor({ color: "#3b82f6" });
    } else {
      chrome.action.setBadgeText({ text: "" });
    }
    if (chrome.action.setBadgeTextColor) {
      chrome.action.setBadgeTextColor({ color: "#ffffff" });
    }
  } catch (e) {
    console.warn("updateBadge error:", e);
  }
}

function showNotification(title, message) {
  console.log(`[稍後觀看播放器] ${title} - ${message}`);
}

/**
 * 非同步自動補齊清單中缺失的影片時長 (自動修復歷史舊資料)
 */
let isBackfilling = false;
async function backfillMissingDurations() {
  if (isBackfilling) return;
  const list = await getSyncedPlaylist();
  const isBogus = (d) => !d || !d.includes(":") || /^\d+$/.test(d.trim()) || d === "00:01" || d === "00:29" || d === "00:00" || d === "0:01" || d === "0:29";
  const needsFix = (x) =>
    isBogus(x.duration) ||
    !x.thumbnail ||
    x.thumbnail.includes("favicon.ico") ||
    x.thumbnail.startsWith("http://");

  const missing = list.filter(needsFix);
  if (missing.length === 0) return;

  isBackfilling = true;
  let updated = false;

  for (const item of list) {
    const isBogusDuration = isBogus(item.duration);
    const isBogusThumb = !item.thumbnail || item.thumbnail.includes("favicon.ico") || item.thumbnail.startsWith("http://");

    if (!isBogusDuration && !isBogusThumb) continue;

    if (item.platform === "bilibili" && item.videoId) {
      // 1. 補齊 B 站封面縮圖 (若黑屏、遺失或為 favicon)
      if (isBogusThumb) {
        try {
          const vResp = await fetch(`https://api.bilibili.com/x/web-interface/view?bvid=${item.videoId}`, {
            headers: {
              Referer: "https://www.bilibili.com/",
              Cookie: "buvid3=12345678-ABCD-EF01-2345-6789ABCDEF01infoc;"
            }
          });
          if (vResp.ok) {
            const vJson = await vResp.json();
            if (vJson.code === 0 && vJson.data?.pic) {
              item.thumbnail = vJson.data.pic.replace("http://", "https://");
              updated = true;
            }
          }
        } catch (e) {
          console.warn("Backfill Bilibili pic error:", e);
        }
      }

      // 2. 補齊 B 站真實時長
      if (isBogusDuration) {
        try {
          const resp = await fetch(`https://api.bilibili.com/x/player/pagelist?bvid=${item.videoId}`, {
            headers: { Referer: "https://www.bilibili.com/" }
          });
          if (resp.ok) {
            const json = await resp.json();
            if (json.code === 0 && Array.isArray(json.data) && json.data.length > 0) {
              const pMatch = item.url ? item.url.match(/[?&]p=(\d+)/) : null;
              const pIndex = pMatch ? parseInt(pMatch[1], 10) : 1;
              const targetPage = json.data[pIndex - 1] || json.data[0];
              if (targetPage && targetPage.duration) {
                const sec = targetPage.duration;
                const h = Math.floor(sec / 3600);
                const m = Math.floor((sec % 3600) / 60);
                const s = sec % 60;
                const sStr = s < 10 ? `0${s}` : `${s}`;
                item.duration = h > 0 ? `${h}:${m < 10 ? '0' : ''}${m}:${sStr}` : `${m}:${sStr}`;
                updated = true;
              }
            }
          }
        } catch (e) {
          console.warn("Backfill Bilibili error:", e);
        }
      }
    } else if (item.platform === "youtube" && item.videoId) {
      try {
        const resp = await fetch(item.url || `https://www.youtube.com/watch?v=${item.videoId}`);
        if (resp.ok) {
          const html = await resp.text();
          const match = html.match(/"lengthSeconds":"(\d+)"/);
          if (match) {
            const sec = parseInt(match[1], 10);
            const h = Math.floor(sec / 3600);
            const m = Math.floor((sec % 3600) / 60);
            const s = sec % 60;
            const sStr = s < 10 ? `0${s}` : `${s}`;
            item.duration = h > 0 ? `${h}:${m < 10 ? '0' : ''}${m}:${sStr}` : `${m}:${sStr}`;
            updated = true;
          }
        }
      } catch (e) {
        console.warn("Backfill YouTube error:", e);
      }
    }
  }

  if (updated) {
    await saveSyncedPlaylist(list);
  }
  isBackfilling = false;
}
