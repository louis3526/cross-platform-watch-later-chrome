/**
 * 跨平台稍後觀看自動播放器 - 全域國際化 (i18n) 語言模組
 * 特點：
 * 1. 預設自動讀取作業系統/瀏覽器語言 (navigator.language)，非中文作業系統全自動切換為英文
 * 2. 支援使用者手動在介面切換 (繁體中文 / English / 系統預設)
 */

const I18N_DICT = {
  "zh-TW": {
    // 頂部與品牌
    appTitle: "跨平台稍後觀看",
    appSubtitle: "YouTube 🔴 ＋ Bilibili 🔵 ＋ TikTok 🎵 ＋ FB Reels 📘",
    videosCount: "{n} 部影片",
    openFullTab: "⤢ 開啟全螢幕大分頁",
    closeFullTab: "↙ 縮小返回小視窗",
    openFullTabTitle: "在新分頁開啟全螢幕大視窗檢視",
    closeFullTabTitle: "關閉此獨立分頁，恢復為原本的小視窗",
    langAuto: "🌐 系統語言",
    langZh: "繁體中文",
    langEn: "English",

    // 工具列
    urlPlaceholder: "貼上 YouTube / Bilibili / TikTok / FB Reels 影片網址...",
    btnAdd: "➕ 新增",
    btnCloudSync: "☁️ 雲端同步",
    btnReload: "🔄 刷新",
    btnQuickPaste: "📥 貼上同步",
    btnAddCurrent: "📌 加入當前分頁",
    btnBackup: "⇄ 匯出入",
    btnAddTitle: "新增輸入的網址",
    btnCloudSyncTitle: "24小時雙機非同步雲端同步 (不用兩台電腦同時開機)",
    btnReloadTitle: "立即重新整理並向雲端同步最新清單",
    btnQuickPasteTitle: "透過 DeskIn 共享剪貼簿一鍵貼上同步隔壁電腦的清單",
    btnAddCurrentTitle: "一鍵收納目前瀏覽器分頁正在看的影片",
    btnBackupTitle: "備份或匯入清單 (JSON)",

    // 控制列
    btnPlayAll: "從頭自動播放",
    btnStopPlay: "停止連播",
    chkFullscreen: "全螢幕",
    chkFullscreenTitle: "播放每部影片時自動切換至最大全螢幕模式",
    speedLabel: "倍速:",
    speedBoxTitle: "勾選開啟後，連播時自動套用指定倍速；播放中仍可用 Speed Controller 插件的 R 鍵重設或 D/S 鍵微調",
    sortLabel: "排序:",
    sortSelectTitle: "依照選擇的規則進行排序",
    sortManual: "☰ 手動 (滑鼠左鍵拖曳)",
    sortDateDesc: "⏱️ 加入時間 (最新 ➔ 最舊)",
    sortDateAsc: "⏱️ 加入時間 (最舊 ➔ 最新)",
    sortPlatform: "📺 平台分組 (YouTube / B站)",
    sortTitleAsc: "🔤 標題名稱 (A ➔ Z)",
    btnSelectMode: "☑ 選擇式刪除",
    btnSelectModeTitle: "多選並批次刪除影片",
    btnClearAll: "🗑️ 清空清單",
    btnClearAllTitle: "清空全部影片",

    // 批次操作列
    selectAll: "全選",
    selectedCount: "已選取 {n} 部",
    btnBatchDelete: "🗑️ 刪除所選影片",
    btnCancelSelect: "✕ 完成",

    // 清單項目
    emptyTitle: "清單空空如也",
    emptyDesc: "在上方貼上網址，或在 YouTube / B站影片卡片上<br><b>點擊左上方「➕ 稍後連播」浮動按鈕</b>！",
    dragHandleTitle: "按住滑鼠左鍵拖曳重新排列順序",
    thumbDblClickTitle: "按兩下滑鼠左鍵立即播放此影片",
    thumbPlayOverlayTitle: "按兩下立即播放",
    durationLabel: "⏱️ 片長:",
    addedLabel: "加入時間:",
    moveTopTitle: "移至最上方 (置頂)",
    moveBottomTitle: "移至最下方 (置底)",
    deleteItemTitle: "刪除此影片",
    saveYtBtn: "📑 存至清單",
    saveYtTitle: "儲存此影片到 YouTube 播放清單 (自動開啟並彈出儲存選單)",
    saveYtToastSuccess: "✅ 已在 YouTube 開啟儲存清單面板，請勾選播放清單！",
    statusYtSaveOpening: "正在開啟 YouTube 儲存清單面板...",
    ytOnlyError: "此功能僅支援 YouTube 影片",
    footerTip: "💡 按住滑鼠左鍵可直接拖曳上下排列順序",

    // 24小時雲端同步彈窗
    cloudModalTitle: "☁️ 24 小時雙機雲端同步 (不用同時開機)",
    cloudModalDesc: "A 電腦存好影片點「上傳備份」後即可關機；B 電腦任何時候開機，只要輸入同一組同步碼，點「下載拉取」，24小時隨時隨地互通！",
    syncCodeLabel: "您的雙機專屬同步碼：",
    syncStatusBound: "已綁定專屬碼",
    syncStatusUnbound: "未綁定",
    inputSyncPlaceholder: "點擊「上傳」自動生成，或在此手動輸入...",
    btnCopySyncCode: "📋 複製代碼",
    btnCloudUpload: "☁️ 上傳備份到雲端 (A電腦)",
    btnCloudDownload: "📥 從雲端下載同步 (B電腦)",
    btnClose: "關閉",
    cloudTips: "💡 <b>雙機非同步超爽玩法</b>：<br>1. 在 <b>A 電腦</b> 點「☁️ 上傳備份到雲端」，自動生成並綁定一組同步碼。<br>2. 到 <b>B 電腦</b> 打開這裡，貼上這組代碼並點「📥 從雲端下載同步」。<br>3. 之後兩台電腦只要按主介面的 <b>「🔄 刷新」</b>，就會全自動在背景雲端連線同步！",

    // 匯出/匯入彈窗
    backupModalTitle: "清單備份與雙機轉移",
    backupPlaceholder: "在此貼上備份的 JSON 資料...",
    btnCopyList: "📋 複製清單 (A電腦)",
    btnPasteList: "📥 一鍵從剪貼簿匯入 (B電腦)",
    btnApplyData: "套用框內資料",
    btnDownloadFile: "💾 下載備份檔",
    btnUploadFile: "📂 選檔案匯入",

    // 狀態提示與警示
    statusParsing: "正在解析影片資料...",
    statusAdded: "已成功加入: {title}",
    statusAddCurrent: "正在收納當前分頁影片...",
    statusCurrentAdded: "已收納當前影片: {title}",
    statusNotVideoPage: "目前分頁非 YouTube 或 Bilibili 影片頁面",
    statusStarted: "開始跨平台自動連續播放！",
    statusStopped: "已停止自動連播",
    statusCleared: "已清空清單",
    statusSorted: "已完成排序",
    statusImported: "成功匯入清單！",
    statusSyncSuccess: "✓ 同步完成！目前共有 {n} 部影片",
    statusReloaded: "✓ 已重新整理清單！",
    statusPlayingNow: "立即播放第 {n} 部: {title}",
    statusMovedTop: "已將「{title}」排至最上方",
    statusMovedBottom: "已將「{title}」排至最下方",
    statusBatchDeleted: "已成功刪除所選影片",
    confirmClearAll: "確定要清空目前所有稍後觀看影片嗎？",
    confirmBatchDelete: "確定要刪除所勾選的 {n} 部影片嗎？",
    alertEmptyAdd: "請先貼入有效的影片網址！",
    alertEmptyPlay: "清單是空的，請先加入影片！",

    // 網頁浮動按鈕與懸浮控制器 (content.js)
    btnWatchLater: "稍後連播",
    btnWatchLaterAdded: "已加入",
    btnWatchLaterInList: "已在清單中",
    btnWatchLaterTitle: "加入跨平台稍後觀看清單",
    toastAdded: "已加入跨平台清單: {title}",
    toastNeedReload: "⚠️ 外掛核心已更新，請按 F5 重新整理頁面！",
    dockLastVideo: "（此為最後一部）",
    dockNext: "下一部: {title}",
    dockSwitching: "⌛ 即將為您自動換片，請稍候...",
    dockPrevTitle: "上一部",
    dockNextTitle: "下一部",
    dockFsTitle: "一鍵進入最高原生全螢幕 (F)",
    dockStopTitle: "停止自動播放",
    dockToggleTitle: "點擊收合/展開控制器",
    notificationFinishedTitle: "🎉 播放完畢",
    notificationFinishedMsg: "所有跨平台影片清單已全數自動播放完成！"
  },

  "en": {
    // Header & Brand
    appTitle: "Cross-Platform Watch Later",
    appSubtitle: "YouTube 🔴 ＋ Bilibili 🔵 ＋ TikTok 🎵 ＋ FB Reels 📘",
    videosCount: "{n} Videos",
    openFullTab: "⤢ Open Full-Tab View",
    closeFullTab: "↙ Return to Popup",
    openFullTabTitle: "Open in a standalone full-tab dashboard view",
    closeFullTabTitle: "Close this standalone tab and return to popup",
    langAuto: "🌐 System Language",
    langZh: "繁體中文",
    langEn: "English",

    // Toolbar
    urlPlaceholder: "Paste YouTube / Bilibili / TikTok / FB Reels URL...",
    btnAdd: "➕ Add",
    btnCloudSync: "☁️ Cloud Sync",
    btnReload: "🔄 Reload",
    btnQuickPaste: "📥 Quick Sync",
    btnAddCurrent: "📌 Add Current Tab",
    btnBackup: "⇄ Backup",
    btnAddTitle: "Add the entered URL to playlist",
    btnCloudSyncTitle: "24/7 cross-device asynchronous cloud sync without keeping both PCs on",
    btnReloadTitle: "Reload and synchronize latest playlist from cloud and local",
    btnQuickPasteTitle: "One-click paste and sync from DeskIn shared clipboard",
    btnAddCurrentTitle: "Save the video currently playing in active tab",
    btnBackupTitle: "Backup or import playlist (JSON)",

    // Control bar
    btnPlayAll: "Autoplay from Start",
    btnStopPlay: "Stop Autoplay",
    chkFullscreen: "Fullscreen",
    chkFullscreenTitle: "Automatically switch video player into edge-to-edge fullscreen on playback",
    speedLabel: "Speed:",
    speedBoxTitle: "When enabled, automatically applies preset playback rate; can still be adjusted on the fly with R/D/S keys via Video Speed Controller",
    sortLabel: "Sort:",
    sortSelectTitle: "Sort playlist by selected criteria",
    sortManual: "☰ Manual (Drag & Drop)",
    sortDateDesc: "⏱️ Date Added (Newest First)",
    sortDateAsc: "⏱️ Date Added (Oldest First)",
    sortPlatform: "📺 Platform (YouTube / Bilibili)",
    sortTitleAsc: "🔤 Title (A ➔ Z)",
    btnSelectMode: "☑ Batch Select",
    btnSelectModeTitle: "Select multiple videos for batch deletion",
    btnClearAll: "🗑️ Clear All",
    btnClearAllTitle: "Clear all videos in playlist",

    // Batch Action Bar
    selectAll: "Select All",
    selectedCount: "{n} Selected",
    btnBatchDelete: "🗑️ Delete Selected",
    btnCancelSelect: "✕ Done",

    // Playlist Item
    emptyTitle: "Playlist is Empty",
    emptyDesc: "Paste a video URL above or click the<br><b>'➕ Watch Later' floating button</b> on any YouTube/Bilibili card!",
    dragHandleTitle: "Left-click and drag to reorder playlist",
    thumbDblClickTitle: "Double-click to start playback from this video",
    thumbPlayOverlayTitle: "Double-click to play",
    durationLabel: "⏱️ Duration:",
    addedLabel: "Added:",
    moveTopTitle: "Move to Top",
    moveBottomTitle: "Move to Bottom",
    deleteItemTitle: "Remove video",
    saveYtBtn: "📑 Save to YT",
    saveYtTitle: "Save this video to YouTube playlist (opens and displays save dialog)",
    saveYtToastSuccess: "✅ YouTube playlist dialog opened, select your target playlist!",
    statusYtSaveOpening: "Opening YouTube save playlist dialog...",
    ytOnlyError: "This feature is only supported for YouTube videos",
    footerTip: "💡 Left-click and drag to reorder the playlist",

    // 24/7 Cloud Sync Modal
    cloudModalTitle: "☁️ 24/7 Cross-Device Cloud Sync (No Need for Both PCs On)",
    cloudModalDesc: "Save on PC A and click 'Upload'; you can now shut down PC A. Power on PC B anytime later, enter the same sync code, and click 'Download' to restore!",
    syncCodeLabel: "Your Dedicated Sync Code:",
    syncStatusBound: "Bound to Code",
    syncStatusUnbound: "Unbound",
    inputSyncPlaceholder: "Click 'Upload' to generate code, or enter code here...",
    btnCopySyncCode: "📋 Copy Code",
    btnCloudUpload: "☁️ Upload to Cloud (PC A)",
    btnCloudDownload: "📥 Download from Cloud (PC B)",
    btnClose: "Close",
    cloudTips: "💡 <b>Asynchronous Workflow</b>:<br>1. On <b>PC A</b>, click 'Upload to Cloud' to generate and bind your dedicated sync code.<br>2. On <b>PC B</b>, open this modal, paste the code, and click 'Download from Cloud'.<br>3. Afterwards, simply clicking <b>'🔄 Reload'</b> on either PC automatically syncs over the cloud!",

    // Backup Modal
    backupModalTitle: "Backup & Cross-Device Transfer",
    backupPlaceholder: "Paste backup JSON data here...",
    btnCopyList: "📋 Copy List (PC A)",
    btnPasteList: "📥 Paste from Clipboard (PC B)",
    btnApplyData: "Apply Text Data",
    btnDownloadFile: "💾 Download JSON File",
    btnUploadFile: "📂 Import JSON File",

    // Status & Alerts
    statusParsing: "Parsing video metadata...",
    statusAdded: "Successfully added: {title}",
    statusAddCurrent: "Saving active tab video...",
    statusCurrentAdded: "Saved active video: {title}",
    statusNotVideoPage: "Current tab is not a YouTube or Bilibili video page",
    statusStarted: "Cross-platform sequential autoplay started!",
    statusStopped: "Autoplay stopped",
    statusCleared: "Playlist cleared",
    statusSorted: "Playlist sorted",
    statusImported: "Playlist successfully imported!",
    statusSyncSuccess: "✓ Sync complete! Currently {n} videos",
    statusReloaded: "✓ Playlist reloaded!",
    statusPlayingNow: "Now playing #{n}: {title}",
    statusMovedTop: "Moved '{title}' to top",
    statusMovedBottom: "Moved '{title}' to bottom",
    statusBatchDeleted: "Selected videos deleted",
    confirmClearAll: "Are you sure you want to clear all videos in the playlist?",
    confirmBatchDelete: "Are you sure you want to delete {n} selected videos?",
    alertEmptyAdd: "Please paste a valid video URL!",
    alertEmptyPlay: "The playlist is empty, please add videos first!",

    // Web Inject Buttons & Floating Dock (content.js)
    btnWatchLater: "Watch Later",
    btnWatchLaterAdded: "Added",
    btnWatchLaterInList: "In Playlist",
    btnWatchLaterTitle: "Add to Cross-Platform Watch Later playlist",
    toastAdded: "Added to Watch Later: {title}",
    toastNeedReload: "⚠️ Extension updated, please press F5 to reload page!",
    dockLastVideo: "(Last video)",
    dockNext: "Next: {title}",
    dockSwitching: "⌛ Navigating to next video, please wait...",
    dockPrevTitle: "Previous video",
    dockNextTitle: "Next video",
    dockFsTitle: "Toggle native fullscreen (F)",
    dockStopTitle: "Stop autoplay",
    dockToggleTitle: "Click to minimize/expand controller",
    notificationFinishedTitle: "🎉 Playback Finished",
    notificationFinishedMsg: "All videos in the cross-platform playlist have completed playback!"
  }
};

/**
 * 取得當前套用的語言代碼 ('zh-TW' 或 'en')
 */
async function getCurrentLanguage() {
  return new Promise((resolve) => {
    chrome.storage.local.get(["user_lang"], (res) => {
      const setting = res?.user_lang || "auto";
      if (setting === "zh-TW" || setting === "en") {
        resolve(setting);
      } else {
        // 依作業系統/瀏覽器語言自動判斷 (navigator.language)
        const sysLang = (navigator.language || navigator.userLanguage || "en").toLowerCase();
        if (sysLang.startsWith("zh")) {
          resolve("zh-TW");
        } else {
          resolve("en");
        }
      }
    });
  });
}

/**
 * 儲存使用者的語言偏好 ('auto', 'zh-TW', 'en')
 */
async function setUserLanguage(lang) {
  return new Promise((resolve) => {
    chrome.storage.local.set({ user_lang: lang }, resolve);
  });
}

/**
 * 多語言字串翻譯取用函式
 */
function getTranslation(lang, key, params = {}) {
  const dict = I18N_DICT[lang] || I18N_DICT["zh-TW"];
  let str = dict[key] || I18N_DICT["zh-TW"][key] || key;
  for (const [k, v] of Object.entries(params)) {
    str = str.replace(new RegExp(`\\{${k}\\}`, "g"), v);
  }
  return str;
}
