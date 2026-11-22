/**
 * 跨平台稍後觀看自動播放器 - Popup 邏輯
 * 包含：畫面放大/獨立分頁、左鍵拖曳換位、時長與加入日期顯示、加入時間/平台排序、選擇式批次刪除
 */

document.addEventListener("DOMContentLoaded", () => {
  // DOM 元件
  const inputUrl = document.getElementById("input-url");
  const btnAddUrl = document.getElementById("btn-add-url");
  const btnQuickPaste = document.getElementById("btn-quick-paste");
  const btnReloadSync = document.getElementById("btn-reload-sync");
  const btnAddCurrent = document.getElementById("btn-add-current");
  const btnPlayAll = document.getElementById("btn-play-all");
  const btnStopPlay = document.getElementById("btn-stop-play");
  const btnClearAll = document.getElementById("btn-clear-all");
  const btnExportImport = document.getElementById("btn-export-import");
  const btnOpenTab = document.getElementById("btn-open-tab");
  const sortSelect = document.getElementById("sort-select");

  // 批次選擇式刪除元件
  const btnToggleSelect = document.getElementById("btn-toggle-select");
  const batchActionBar = document.getElementById("batch-action-bar");
  const chkSelectAll = document.getElementById("chk-select-all");
  const batchCountText = document.getElementById("batch-count-text");
  const btnBatchDelete = document.getElementById("btn-batch-delete");
  const btnCancelSelect = document.getElementById("btn-cancel-select");

  // 多語言切換元件
  const langSelect = document.getElementById("lang-select");
  let currentLang = "zh-TW";

  function t(key, params = {}) {
    return typeof getTranslation === "function" ? getTranslation(currentLang, key, params) : key;
  }

  // 自動全螢幕與倍速控制元件
  const chkAutoFullscreen = document.getElementById("chk-auto-fullscreen");
  const chkAutoSpeed = document.getElementById("chk-auto-speed");
  const inputPlaybackSpeed = document.getElementById("input-playback-speed");

  const playlistUl = document.getElementById("playlist-ul");
  const emptyState = document.getElementById("empty-state");
  const listCounter = document.getElementById("list-counter");
  const playBtnText = document.getElementById("play-btn-text");
  const statusBar = document.getElementById("status-bar");

  // Modal 備份相關
  const modalBackup = document.getElementById("modal-backup");
  const backupJson = document.getElementById("backup-json");
  const btnCopyJson = document.getElementById("btn-copy-json");
  const btnPasteImportJson = document.getElementById("btn-paste-import-json");
  const btnApplyJson = document.getElementById("btn-apply-json");
  const btnDownloadJson = document.getElementById("btn-download-json");
  const btnUploadJson = document.getElementById("btn-upload-json");
  const fileImportJson = document.getElementById("file-import-json");
  const btnCloseModal = document.getElementById("btn-close-modal");

  let currentPlaylist = [];
  let currentPlayState = { isPlaying: false, currentIndex: 0 };
  let isSelectionMode = false;
  let selectedIds = new Set();
  let draggedItemIndex = null;

  // 跨平台自訂群組清單資料 (預設群組 + 使用者自訂群組)
  let videoGroups = [
    { id: "grp_default", name: "預設清單", badge: "📁" },
    { id: "grp_music", name: "音樂收藏", badge: "🎵" },
    { id: "grp_tech", name: "科技開箱", badge: "💻" }
  ];
  let activeGroupFilter = "all";
  const selectGroupFilter = document.getElementById("select-group-filter");

  // 跨平台自訂群組彈窗元件
  const modalCrossGroups = document.getElementById("modal-cross-groups");
  const btnCloseCrossGroupsModal = document.getElementById("btn-close-cross-groups-modal");
  const crossGroupsTargetTitle = document.getElementById("cross-groups-target-title");
  const crossGroupsContainer = document.getElementById("cross-groups-container");
  const inputNewGroupName = document.getElementById("input-new-group-name");
  const btnCreateNewGroup = document.getElementById("btn-create-new-group");
  let currentTargetGroupItem = null;

  // 讀取語言並套用 (預設隨作業系統自動偵測)
  initLanguage();

  async function initLanguage() {
    const res = await chrome.storage.local.get(["user_lang"]);
    const setting = res?.user_lang || "auto";
    if (langSelect) langSelect.value = setting;
    currentLang = await getCurrentLanguage();
    applyUiTranslations();
  }

  langSelect?.addEventListener("change", async (e) => {
    const newSetting = e.target.value;
    await setUserLanguage(newSetting);
    currentLang = await getCurrentLanguage();
    applyUiTranslations();
    renderPlaylist();
  });

  function applyUiTranslations() {
    // 頂部與品牌
    const brandTitle = document.querySelector(".brand-text h1");
    if (brandTitle) brandTitle.textContent = t("appTitle");
    const brandSub = document.querySelector(".brand-text .sub-text");
    if (brandSub) brandSub.textContent = t("appSubtitle");

    updateOpenTabButton();

    if (langSelect) {
      langSelect.options[0].textContent = t("langAuto");
      langSelect.options[1].textContent = t("langZh");
      langSelect.options[2].textContent = t("langEn");
    }

    // 快速新增區
    if (inputUrl) inputUrl.placeholder = t("urlPlaceholder");
    if (btnAddUrl) {
      btnAddUrl.textContent = t("btnAdd");
      btnAddUrl.title = t("btnAddTitle");
    }
    const btnCloudSyncModal = document.getElementById("btn-cloud-sync-modal");
    if (btnCloudSyncModal) {
      btnCloudSyncModal.textContent = t("btnCloudSync");
      btnCloudSyncModal.title = t("btnCloudSyncTitle");
    }
    if (btnReloadSync) {
      btnReloadSync.textContent = t("btnReload");
      btnReloadSync.title = t("btnReloadTitle");
    }
    if (btnQuickPaste) {
      btnQuickPaste.textContent = t("btnQuickPaste");
      btnQuickPaste.title = t("btnQuickPasteTitle");
    }
    if (btnAddCurrent) {
      btnAddCurrent.textContent = t("btnAddCurrent");
      btnAddCurrent.title = t("btnAddCurrentTitle");
    }
    if (btnExportImport) {
      btnExportImport.textContent = t("btnBackup");
      btnExportImport.title = t("btnBackupTitle");
    }

    // 控制列
    const autoFsSpan = document.querySelector("#chk-auto-fullscreen + span");
    if (autoFsSpan) autoFsSpan.textContent = t("chkFullscreen");
    const speedSpan = document.querySelector("#chk-auto-speed + span");
    if (speedSpan) speedSpan.textContent = t("speedLabel");
    const sortLbl = document.querySelector(".sort-label");
    if (sortLbl) sortLbl.textContent = t("sortLabel");

    if (sortSelect) {
      sortSelect.title = t("sortSelectTitle");
      sortSelect.options[0].textContent = t("sortManual");
      sortSelect.options[1].textContent = t("sortDateDesc");
      sortSelect.options[2].textContent = t("sortDateAsc");
      sortSelect.options[3].textContent = t("sortPlatform");
      sortSelect.options[4].textContent = t("sortTitleAsc");
    }

    if (btnToggleSelect) {
      btnToggleSelect.textContent = t("btnSelectMode");
      btnToggleSelect.title = t("btnSelectModeTitle");
    }
    if (btnClearAll) {
      btnClearAll.textContent = t("btnClearAll");
      btnClearAll.title = t("btnClearAllTitle");
    }

    // 批次列
    const selectAllSpan = document.querySelector("#chk-select-all + span");
    if (selectAllSpan) selectAllSpan.textContent = t("selectAll");
    if (btnCancelSelect) btnCancelSelect.textContent = t("btnCancelSelect");

    function setSafeLines(el, str) {
      if (!el) return;
      const plain = str.replace(/<\/?b>/g, "");
      const parts = plain.split(/<br\s*\/?>/i);
      el.replaceChildren();
      parts.forEach((part, idx) => {
        if (idx > 0) el.appendChild(document.createElement("br"));
        el.appendChild(document.createTextNode(part));
      });
    }

    // 空白狀態
    const emptyTitleElem = document.querySelector(".empty-title");
    if (emptyTitleElem) emptyTitleElem.textContent = t("emptyTitle");
    const emptyDescElem = document.querySelector(".empty-desc");
    setSafeLines(emptyDescElem, t("emptyDesc"));

    // 底部提示
    const footerSpan = document.querySelector(".app-footer span");
    if (footerSpan) footerSpan.textContent = t("footerTip");

    // 雲端彈窗
    const cloudH3 = document.querySelector("#modal-cloud-sync h3");
    if (cloudH3) cloudH3.textContent = t("cloudModalTitle");
    const cloudDesc = document.querySelector("#modal-cloud-sync p");
    if (cloudDesc) cloudDesc.textContent = t("cloudModalDesc");
    const syncCodeLbl = document.querySelector("#modal-cloud-sync label");
    if (syncCodeLbl) syncCodeLbl.textContent = t("syncCodeLabel");
    const inputSync = document.getElementById("input-sync-code");
    if (inputSync) inputSync.placeholder = t("inputSyncPlaceholder");
    const btnCopyCode = document.getElementById("btn-copy-sync-code");
    if (btnCopyCode) btnCopyCode.textContent = t("btnCopySyncCode");
    const btnUp = document.getElementById("btn-cloud-upload");
    if (btnUp) btnUp.textContent = t("btnCloudUpload");
    const btnDown = document.getElementById("btn-cloud-download");
    if (btnDown) btnDown.textContent = t("btnCloudDownload");
    const btnCloseC = document.getElementById("btn-close-cloud-modal");
    if (btnCloseC) btnCloseC.textContent = t("btnClose");
    const cloudTipsBox = document.getElementById("cloud-tips-box");
    if (cloudTipsBox) setSafeLines(cloudTipsBox, t("cloudTips"));

    // 備份彈窗
    const backupH3 = document.querySelector("#modal-backup h3");
    if (backupH3) backupH3.textContent = t("backupModalTitle");
    if (backupJson) backupJson.placeholder = t("backupPlaceholder");
    if (btnCopyJson) btnCopyJson.textContent = t("btnCopyList");
    if (btnPasteImportJson) btnPasteImportJson.textContent = t("btnPasteList");
    if (btnApplyJson) btnApplyJson.textContent = t("btnApplyData");
    if (btnDownloadJson) btnDownloadJson.textContent = t("btnDownloadFile");
    if (btnUploadJson) btnUploadJson.textContent = t("btnUploadFile");
    if (btnCloseModal) btnCloseModal.textContent = t("btnClose");

    // YouTube 儲存至清單彈窗 (截圖 44)
    const ytModalH3 = document.getElementById("yt-modal-title");
    if (ytModalH3) ytModalH3.textContent = t("ytModalTitle");
    const ytModalFall = document.getElementById("btn-yt-modal-fallback");
    if (ytModalFall) ytModalFall.textContent = t("ytModalFallback");

    // 跨平台自訂群組彈窗
    const crossGrpTitle = document.getElementById("cross-groups-modal-title");
    if (crossGrpTitle) crossGrpTitle.textContent = t("crossGroupsModalTitle");
  }

  // 讀取全螢幕與倍速設定
  chrome.storage.local.get(["autoFullscreen", "autoSpeedEnabled", "playbackSpeed"], (res) => {
    if (chkAutoFullscreen) chkAutoFullscreen.checked = res.autoFullscreen !== false;
    if (chkAutoSpeed) chkAutoSpeed.checked = !!res.autoSpeedEnabled;
    if (inputPlaybackSpeed && res.playbackSpeed) inputPlaybackSpeed.value = res.playbackSpeed;
  });

  chkAutoFullscreen?.addEventListener("change", (e) => {
    chrome.storage.local.set({ autoFullscreen: e.target.checked });
  });

  chkAutoSpeed?.addEventListener("change", (e) => {
    chrome.storage.local.set({ autoSpeedEnabled: e.target.checked });
  });

  inputPlaybackSpeed?.addEventListener("change", (e) => {
    const val = Math.max(0.5, Math.min(4.0, parseFloat(e.target.value) || 1.0));
    inputPlaybackSpeed.value = val;
    chrome.storage.local.set({ playbackSpeed: val });
  });

  // 初始化載入狀態
  loadState();

  // 輔助函式：透過 Background 執行分塊雲端同步與本地 10MB 雙重保存 (粉碎 22 部上限)
  function savePlaylist(list, callback) {
    chrome.runtime.sendMessage({ action: "SAVE_PLAYLIST", playlist: list }, () => {
      chrome.storage.local.set({ playlist: list }, () => {
        if (callback) callback();
      });
    });
  }

  // 監聽 Background 與雲端狀態變更事件（隔壁電腦加入或刪除，本地即刻同步更新）
  chrome.storage.onChanged.addListener((changes, area) => {
    if (changes.playlist) {
      currentPlaylist = changes.playlist.newValue || [];
      renderPlaylist();
    }
    if (area === "sync" && (changes.sync_count || Object.keys(changes).some((k) => k.startsWith("sync_chunk_")))) {
      loadState();
    }
    if (changes.playState) {
      currentPlayState = changes.playState.newValue || { isPlaying: false, currentIndex: 0 };
      renderPlaylist();
    }
  });

  // 1. 載入狀態 (優先從本地安全快照還原，防清空)
  function loadState() {
    chrome.storage.local.get(["video_groups"], (grpRes) => {
      if (Array.isArray(grpRes?.video_groups) && grpRes.video_groups.length > 0) {
        videoGroups = grpRes.video_groups;
      }
      updateGroupFilterUI();
    });

    chrome.storage.local.get(["playlist", "playlist_backup", "playState"], (locRes) => {
      let list = Array.isArray(locRes?.playlist) ? locRes.playlist : [];
      if (list.length === 0 && Array.isArray(locRes?.playlist_backup) && locRes.playlist_backup.length > 0) {
        list = locRes.playlist_backup;
        chrome.storage.local.set({ playlist: list });
      }

      if (list.length > 0) {
        currentPlaylist = list;
        currentPlayState = locRes?.playState || { isPlaying: false, currentIndex: 0 };
        renderPlaylist();
      }
    });

    chrome.runtime.sendMessage({ action: "GET_STATE" }, (res) => {
      if (res && Array.isArray(res.playlist) && res.playlist.length > 0) {
        currentPlaylist = res.playlist;
        currentPlayState = res.playState || { isPlaying: false, currentIndex: 0 };
        renderPlaylist();
      }
    });
  }

  // 2. 獨立新分頁開啟 / 關閉大視窗雙向切換
  function isTabMode() {
    return location.search.includes("tab=1") || window.innerWidth > 820;
  }

  function updateOpenTabButton() {
    if (!btnOpenTab) return;
    if (isTabMode()) {
      btnOpenTab.textContent = t("closeFullTab");
      btnOpenTab.title = t("closeFullTabTitle");
      btnOpenTab.className = "btn btn-danger btn-sm";
    } else {
      btnOpenTab.textContent = t("openFullTab");
      btnOpenTab.title = t("openFullTabTitle");
      btnOpenTab.className = "btn btn-secondary btn-sm";
    }
  }

  updateOpenTabButton();
  window.addEventListener("resize", updateOpenTabButton);

  btnOpenTab?.addEventListener("click", () => {
    if (isTabMode()) {
      // 處於全螢幕大分頁：關閉當前分頁，返回原來的瀏覽視窗
      window.close();
      chrome.tabs?.getCurrent((tab) => {
        if (tab?.id) chrome.tabs.remove(tab.id);
      });
    } else {
      // 處於右上角小視窗：開啟獨立全螢幕大分頁
      chrome.tabs.create({ url: chrome.runtime.getURL("popup.html?tab=1") });
    }
  });

  // 2.1 重新整理並強制同步雲端資料 (支援 24hr 雙機非同步雲端自動拉取)
  btnReloadSync?.addEventListener("click", async () => {
    btnReloadSync.classList.add("is-spinning");
    setStatus("正在同步最新清單...", "info");

    // 檢查是否已綁定專屬雲端同步碼，若有則直接向 24hr 雲端中繼站拉取最新清單
    try {
      const syncCode = await getCloudSyncCode();
      if (syncCode) {
        const cloudRes = await downloadFromCloudSync(syncCode);
        if (cloudRes && cloudRes.success && Array.isArray(cloudRes.playlist)) {
          currentPlaylist = cloudRes.playlist;
          savePlaylist(currentPlaylist, () => {
            renderPlaylist();
            setTimeout(() => btnReloadSync.classList.remove("is-spinning"), 400);
            setStatus(`✓ 已從 24hr 雲端中繼站同步！目前共 ${currentPlaylist.length} 部影片`, "success");
          });
          return;
        }
      }
    } catch (e) {
      console.warn("Cloud sync on reload:", e);
    }

    // 若尚未綁定同步碼，則執行本地與分塊同步
    chrome.runtime.sendMessage({ action: "GET_STATE" }, (res) => {
      setTimeout(() => {
        btnReloadSync.classList.remove("is-spinning");
      }, 400);

      if (res && res.playlist) {
        currentPlaylist = res.playlist;
        currentPlayState = res.playState || { isPlaying: false, currentIndex: 0 };
        renderPlaylist();
        setStatus(`✓ 同步完成！目前共有 ${currentPlaylist.length} 部影片`, "success");
      } else {
        loadState();
        setStatus("✓ 已重新整理清單！", "success");
      }
    });
  });

  // 3. 排序下拉選單事件
  sortSelect?.addEventListener("change", (e) => {
    const sortType = e.target.value;
    applySorting(sortType);
  });

  function applySorting(sortType) {
    if (sortType === "manual") return;

    if (sortType === "date-desc") {
      // 加入時間 (最新 ➔ 最舊)
      currentPlaylist.sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0));
    } else if (sortType === "date-asc") {
      // 加入時間 (最舊 ➔ 最新)
      currentPlaylist.sort((a, b) => (a.addedAt || 0) - (b.addedAt || 0));
    } else if (sortType === "platform") {
      // 依平台分組 (YouTube 在前，B站隨後)
      currentPlaylist.sort((a, b) => a.platform.localeCompare(b.platform));
    } else if (sortType === "title-asc") {
      // 標題名稱字母
      currentPlaylist.sort((a, b) => (a.title || "").localeCompare(b.title || ""));
    }

    savePlaylist(currentPlaylist, () => {
      setStatus(`已依「${sortSelect.options[sortSelect.selectedIndex].text}」完成排序`, "success");
    });
  }

  // 4. 切換「選擇式刪除模式」
  btnToggleSelect?.addEventListener("click", () => {
    isSelectionMode = !isSelectionMode;
    if (isSelectionMode) {
      batchActionBar.style.display = "flex";
      btnToggleSelect.classList.replace("btn-secondary", "btn-primary");
      selectedIds.clear();
      updateBatchUI();
    } else {
      exitSelectionMode();
    }
    renderPlaylist();
  });

  btnCancelSelect?.addEventListener("click", () => {
    exitSelectionMode();
    renderPlaylist();
  });

  function exitSelectionMode() {
    isSelectionMode = false;
    batchActionBar.style.display = "none";
    btnToggleSelect.classList.replace("btn-primary", "btn-secondary");
    selectedIds.clear();
    chkSelectAll.checked = false;
  }

  // 全選 / 取消全選
  chkSelectAll?.addEventListener("change", (e) => {
    if (e.target.checked) {
      currentPlaylist.forEach((item) => selectedIds.add(item.id));
    } else {
      selectedIds.clear();
    }
    updateBatchUI();
    renderPlaylist();
  });

  // 批次刪除按鈕
  btnBatchDelete?.addEventListener("click", () => {
    if (selectedIds.size === 0) return;

    if (confirm(`確定要刪除所勾選的 ${selectedIds.size} 部影片嗎？`)) {
      currentPlaylist = currentPlaylist.filter((item) => !selectedIds.has(item.id));
      selectedIds.clear();
      savePlaylist(currentPlaylist, () => {
        setStatus("已成功刪除所勾選的影片", "success");
        if (currentPlaylist.length === 0) exitSelectionMode();
        updateBatchUI();
      });
    }
  });

  function updateBatchUI() {
    const count = selectedIds.size;
    batchCountText.textContent = t("selectedCount", { n: count });
    btnBatchDelete.disabled = count === 0;
    btnBatchDelete.textContent = `${t("btnBatchDelete")} (${count})`;
    if (chkSelectAll) {
      chkSelectAll.checked = currentPlaylist.length > 0 && selectedIds.size === currentPlaylist.length;
    }
  }

  // 5. 渲染清單
  function renderPlaylist() {
    listCounter.textContent = t("videosCount", { n: currentPlaylist.length });

    // 控制播放按鈕
    if (currentPlayState.isPlaying && currentPlaylist.length > 0) {
      btnStopPlay.style.display = "inline-flex";
      const stopIcon = document.createElement("span");
      stopIcon.className = "icon";
      stopIcon.textContent = "⏹";
      btnStopPlay.replaceChildren(stopIcon, document.createTextNode(" " + t("btnStopPlay")));
      playBtnText.textContent = `${t("btnPlayAll")} (${currentPlayState.currentIndex + 1}/${currentPlaylist.length})`;
      btnPlayAll.classList.replace("btn-success", "btn-secondary");
    } else {
      btnStopPlay.style.display = "none";
      playBtnText.textContent = currentPlaylist.length > 0 ? t("btnPlayAll") : t("emptyTitle");
      btnPlayAll.classList.replace("btn-secondary", "btn-success");
    }

    // 依據跨平台自訂群組篩選要顯示的影片列表
    const displayList = activeGroupFilter === "all"
      ? currentPlaylist
      : currentPlaylist.filter((item) => {
          if (!item.groupIds || item.groupIds.length === 0) {
            return activeGroupFilter === "grp_default";
          }
          return item.groupIds.includes(activeGroupFilter);
        });

    if (displayList.length === 0) {
      emptyState.style.display = "block";
      playlistUl.replaceChildren();
      updateGroupFilterUI();
      return;
    }

    emptyState.style.display = "none";
    playlistUl.replaceChildren();
    updateGroupFilterUI();

    displayList.forEach((item, displayIdx) => {
      const realIndex = currentPlaylist.findIndex((x) => x.id === item.id);
      const index = realIndex >= 0 ? realIndex : displayIdx;
      const isCurrentPlaying = currentPlayState.isPlaying && currentPlayState.currentIndex === index;
      const li = document.createElement("li");
      li.className = `playlist-item ${isCurrentPlaying ? "is-playing" : ""}`;
      li.dataset.index = index;
      li.dataset.id = item.id;

      // 支援滑鼠左鍵拖曳排序
      li.draggable = !isSelectionMode;

      const platformMap = {
        youtube: { label: "YouTube", cls: "badge-youtube" },
        bilibili: { label: "B站", cls: "badge-bilibili" },
        tiktok: { label: "TikTok", cls: "badge-tiktok" },
        facebook: { label: "FB Reels", cls: "badge-facebook" }
      };
      const pInfo = platformMap[item.platform] || platformMap.youtube;
      const platformLabel = pInfo.label;
      const platformBadgeClass = pInfo.cls;
      const formattedDate = formatDate(item.addedAt);

      // 嚴格過濾非時長格式純數字 (如 557 等觀看/彈幕數) 與滑鼠懸停預覽假秒數
      let cleanDuration = "";
      if (item.duration && item.duration.includes(":") && !/^\d+$/.test(item.duration.trim())) {
        const match = item.duration.trim().match(/(?:\d{1,2}:)?\d{1,2}:\d{2}/);
        const rawMatch = match ? match[0] : "";
        if (rawMatch && rawMatch !== "00:01" && rawMatch !== "00:29" && rawMatch !== "00:00" && rawMatch !== "0:01" && rawMatch !== "0:29") {
          cleanDuration = rawMatch;
        }
      }

      if (isSelectionMode) {
        const chk = document.createElement("input");
        chk.type = "checkbox";
        chk.className = "item-checkbox";
        chk.dataset.id = item.id;
        chk.checked = selectedIds.has(item.id);
        li.appendChild(chk);
      } else {
        const handle = document.createElement("div");
        handle.className = "item-drag-handle";
        handle.title = t("dragHandleTitle");
        handle.textContent = "⋮⋮";
        li.appendChild(handle);
      }

      const indexDiv = document.createElement("div");
      indexDiv.className = "item-index";
      indexDiv.textContent = String(index + 1);

      const thumbBoxDiv = document.createElement("div");
      thumbBoxDiv.className = "item-thumb-box";
      thumbBoxDiv.title = t("thumbDblClickTitle");
      const thumbImgEl = document.createElement("img");
      thumbImgEl.src = item.thumbnail;
      thumbImgEl.referrerPolicy = "no-referrer";
      thumbImgEl.alt = "thumb";
      const platformBadgeSpan = document.createElement("span");
      platformBadgeSpan.className = `item-platform-badge ${platformBadgeClass}`;
      platformBadgeSpan.textContent = platformLabel;
      const playOverlayDiv = document.createElement("div");
      playOverlayDiv.className = "thumb-play-overlay";
      playOverlayDiv.title = t("thumbPlayOverlayTitle");
      playOverlayDiv.textContent = "▶";
      thumbBoxDiv.append(thumbImgEl, platformBadgeSpan, playOverlayDiv);

      const infoDiv = document.createElement("div");
      infoDiv.className = "item-info";
      const titleLink = document.createElement("a");
      titleLink.href = item.url;
      titleLink.target = "_blank";
      titleLink.className = "item-title";
      titleLink.title = item.title || "";
      titleLink.textContent = `${isCurrentPlaying ? "▶ " : ""}${item.title || ""}`;

      const metaDiv = document.createElement("div");
      metaDiv.className = "item-meta";
      if (cleanDuration) {
        const durTag = document.createElement("span");
        durTag.className = "item-duration-tag";
        const durBold = document.createElement("b");
        durBold.textContent = cleanDuration;
        durTag.append(document.createTextNode(`${t("durationLabel")} `), durBold);
        const dotSpan = document.createElement("span");
        dotSpan.className = "meta-dot";
        dotSpan.textContent = "•";
        metaDiv.append(durTag, dotSpan);
      }
      const addedSpan = document.createElement("span");
      addedSpan.textContent = `${t("addedLabel")} ${formattedDate}`;
      metaDiv.appendChild(addedSpan);
      infoDiv.append(titleLink, metaDiv);

      const actionsDiv = document.createElement("div");
      actionsDiv.className = "item-actions";

      const btnTop = document.createElement("button");
      btnTop.className = "btn-icon btn-action-top";
      btnTop.dataset.index = String(index);
      btnTop.title = t("moveTopTitle");
      btnTop.textContent = "⤒";
      if (index === 0) {
        btnTop.disabled = true;
        btnTop.style.opacity = "0.25";
        btnTop.style.cursor = "default";
      }

      const btnDel = document.createElement("button");
      btnDel.className = "btn-icon delete btn-remove";
      btnDel.dataset.index = String(index);
      btnDel.title = t("deleteItemTitle");
      btnDel.textContent = "✕";

      const btnBottom = document.createElement("button");
      btnBottom.className = "btn-icon btn-action-bottom";
      btnBottom.dataset.index = String(index);
      btnBottom.title = t("moveBottomTitle");
      btnBottom.textContent = "⤓";
      if (index === currentPlaylist.length - 1) {
        btnBottom.disabled = true;
        btnBottom.style.opacity = "0.25";
        btnBottom.style.cursor = "default";
      }

      actionsDiv.append(btnTop, btnDel, btnBottom);

      // 藍框處：上下堆疊專屬按鈕 (上方: 存至 YouTube 清單 / 下方: 存至跨平台自訂群組)
      const ytSaveBox = document.createElement("div");
      ytSaveBox.className = "item-yt-save-box";

      // 1. 上方：YouTube 原生清單按鈕 (僅 YouTube 影片顯示)
      if (item.platform === "youtube") {
        const btnSaveYt = document.createElement("button");
        btnSaveYt.className = "btn-save-yt";
        btnSaveYt.dataset.index = String(index);
        btnSaveYt.title = t("saveYtTitle") || "儲存此影片到 YouTube 播放清單";

        const saveIcon = document.createElement("span");
        saveIcon.className = "btn-save-yt-icon";
        saveIcon.textContent = "📑";

        const saveText = document.createElement("span");
        saveText.className = "btn-save-yt-text";
        saveText.textContent = t("saveYtBtn") || "存至 YT";

        btnSaveYt.append(saveIcon, saveText);

        btnSaveYt.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
          saveToYouTubePlaylist(item);
        });

        ytSaveBox.appendChild(btnSaveYt);
      }

      // 2. 下方：跨平台自訂群組清單按鈕 (YouTube / B站 / TikTok / FB 所有平台影片均可歸納)
      const btnSaveGrp = document.createElement("button");
      btnSaveGrp.className = "btn-save-group";
      btnSaveGrp.dataset.index = String(index);
      btnSaveGrp.title = t("saveGroupTitle") || "儲存至跨平台自訂群組清單 (支援新增、改名、刪除與雙機同步)";

      const grpIcon = document.createElement("span");
      grpIcon.className = "btn-save-yt-icon";
      grpIcon.textContent = "🗂️";

      const grpText = document.createElement("span");
      grpText.className = "btn-save-yt-text";
      grpText.textContent = t("saveGroupBtn") || "存至群組";

      btnSaveGrp.append(grpIcon, grpText);

      btnSaveGrp.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        openCrossGroupsModal(item);
      });

      ytSaveBox.appendChild(btnSaveGrp);

      li.append(indexDiv, thumbBoxDiv, infoDiv, ytSaveBox, actionsDiv);

      // 前端即時自動校正 B 站缺失或異常時長 (若包含純數字如 557 或缺失時長，直連官方 pagelist API 秒速補齊)
      const isBogusDur = !cleanDuration || cleanDuration === "00:01" || cleanDuration === "00:29" || !item.duration || !item.duration.includes(":") || /^\d+$/.test(item.duration.trim());
      if (item.platform === "bilibili" && isBogusDur) {
        fetch(`https://api.bilibili.com/x/player/pagelist?bvid=${item.videoId}`, {
          headers: { Referer: "https://www.bilibili.com/" }
        })
          .then((r) => r.json())
          .then((json) => {
            if (json.code === 0 && Array.isArray(json.data) && json.data.length > 0) {
              const pMatch = item.url ? item.url.match(/[?&]p=(\d+)/) : null;
              const pIndex = pMatch ? parseInt(pMatch[1], 10) : 1;
              const targetPage = json.data[pIndex - 1] || json.data[0];
              const sec = targetPage?.duration;
              if (sec) {
                const h = Math.floor(sec / 3600);
                const m = Math.floor((sec % 3600) / 60);
                const s = sec % 60;
                const sStr = s < 10 ? `0${s}` : `${s}`;
                const realDur = h > 0 ? `${h}:${m < 10 ? '0' : ''}${m}:${sStr}` : `${m}:${sStr}`;
                item.duration = realDur;

                const metaBox = li.querySelector(".item-meta");
                if (metaBox && !metaBox.querySelector(".item-duration-tag")) {
                  const tag = document.createElement("span");
                  tag.className = "item-duration-tag";
                  const bEl = document.createElement("b");
                  bEl.textContent = realDur;
                  tag.append(document.createTextNode(`${t("durationLabel")} `), bEl);
                  const dot = document.createElement("span");
                  dot.className = "meta-dot";
                  dot.textContent = "•";
                  metaBox.prepend(dot);
                  metaBox.prepend(tag);
                }
                savePlaylist(currentPlaylist);
              }
            }
          })
          .catch((e) => console.warn("Live fetch Bilibili duration:", e));
      }

      // 前端即時自動校正 B 站黑屏/缺失封面縮圖 (直連 B 站 view API 補齊高畫質封面)
      if (item.platform === "bilibili" && (!item.thumbnail || item.thumbnail.includes("favicon.ico") || item.thumbnail.startsWith("http://"))) {
        fetch(`https://api.bilibili.com/x/web-interface/view?bvid=${item.videoId}`, {
          headers: {
            Referer: "https://www.bilibili.com/",
            Cookie: "buvid3=12345678-ABCD-EF01-2345-6789ABCDEF01infoc;"
          }
        })
          .then((r) => r.json())
          .then((json) => {
            if (json.code === 0 && json.data?.pic) {
              const realPic = json.data.pic.replace("http://", "https://");
              item.thumbnail = realPic;
              const imgElem = li.querySelector(".item-thumb-box img");
              if (imgElem) {
                imgElem.src = realPic;
              }
              savePlaylist(currentPlaylist);
            }
          })
          .catch((e) => console.warn("Live fetch Bilibili pic:", e));
      }

      // 前端即時自動校正 YouTube 缺失時長
      if (item.platform === "youtube" && !cleanDuration && item.videoId) {
        fetch(item.url || `https://www.youtube.com/watch?v=${item.videoId}`)
          .then((r) => r.text())
          .then((html) => {
            const match = html.match(/"lengthSeconds":"(\d+)"/);
            if (match) {
              const sec = parseInt(match[1], 10);
              const h = Math.floor(sec / 3600);
              const m = Math.floor((sec % 3600) / 60);
              const s = sec % 60;
              const sStr = s < 10 ? `0${s}` : `${s}`;
              const realDur = h > 0 ? `${h}:${m < 10 ? '0' : ''}${m}:${sStr}` : `${m}:${sStr}`;
              item.duration = realDur;

              const metaBox = li.querySelector(".item-meta");
              if (metaBox && !metaBox.querySelector(".item-duration-tag")) {
                const tag = document.createElement("span");
                tag.className = "item-duration-tag";
                const bEl = document.createElement("b");
                bEl.textContent = realDur;
                tag.append(document.createTextNode(`${t("durationLabel")} `), bEl);
                const dot = document.createElement("span");
                dot.className = "meta-dot";
                dot.textContent = "•";
                metaBox.prepend(dot);
                metaBox.prepend(tag);
              }
              savePlaylist(currentPlaylist);
            }
          })
          .catch((e) => console.warn("Live fetch YouTube duration:", e));
      }

      // 前端即時自動校正 TikTok / Facebook Reels 缺失時長
      if ((item.platform === "tiktok" || item.platform === "facebook") && !cleanDuration && item.url) {
        fetch(item.url)
          .then((r) => r.text())
          .then((html) => {
            let sec = 0;
            if (item.platform === "tiktok") {
              const ttMatch = html.match(/"video"\s*:\s*\{[^}]*?"duration"\s*:\s*(\d+)/) ||
                              html.match(/"duration"\s*:\s*(\d+)/);
              if (ttMatch) sec = parseInt(ttMatch[1], 10);
            } else {
              const msMatch = html.match(/"playable_duration_in_ms"\s*:\s*(\d+)/);
              const secMatch = html.match(/"length_in_second"\s*:\s*(\d+)/) ||
                               html.match(/"duration_in_sec"\s*:\s*(\d+)/);
              if (msMatch) sec = Math.round(parseInt(msMatch[1], 10) / 1000);
              else if (secMatch) sec = parseInt(secMatch[1], 10);
            }

            if (sec > 0 && sec < 86400) {
              const h = Math.floor(sec / 3600);
              const m = Math.floor((sec % 3600) / 60);
              const s = sec % 60;
              const sStr = s < 10 ? `0${s}` : `${s}`;
              const realDur = h > 0 ? `${h}:${m < 10 ? "0" : ""}${m}:${sStr}` : `${m}:${sStr}`;
              item.duration = realDur;

              const metaBox = li.querySelector(".item-meta");
              if (metaBox && !metaBox.querySelector(".item-duration-tag")) {
                const tag = document.createElement("span");
                tag.className = "item-duration-tag";
                const bEl = document.createElement("b");
                bEl.textContent = realDur;
                tag.append(document.createTextNode(`${t("durationLabel")} `), bEl);
                const dot = document.createElement("span");
                dot.className = "meta-dot";
                dot.textContent = "•";
                metaBox.prepend(dot);
                metaBox.prepend(tag);
              }
              savePlaylist(currentPlaylist);
            }
          })
          .catch((e) => console.warn(`Live fetch ${item.platform} duration:`, e));
      }

      // 雙擊縮圖立即播放此影片
      const thumbBox = li.querySelector(".item-thumb-box");
      if (thumbBox) {
        thumbBox.addEventListener("dblclick", (e) => {
          e.preventDefault();
          e.stopPropagation();
          chrome.runtime.sendMessage({ action: "START_PLAYLIST", startIndex: index }, (res) => {
            if (res && res.success) {
              setStatus(`立即播放第 ${index + 1} 部: ${item.title}`, "success");
            }
          });
        });
      }

      // 圖片載入失敗退回預設圖示 (CSP 規範安全寫法)
      const thumbImg = li.querySelector(".item-thumb-box img");
      if (thumbImg) {
        thumbImg.addEventListener("error", function () {
          this.src = "icons/icon48.png";
        }, { once: true });
      }

      // 拖曳事件綁定 (HTML5 Drag & Drop)
      bindDragAndDropEvents(li, index);

      // 多選框切換事件
      if (isSelectionMode) {
        const chk = li.querySelector(".item-checkbox");
        chk?.addEventListener("change", (e) => {
          if (e.target.checked) {
            selectedIds.add(item.id);
          } else {
            selectedIds.delete(item.id);
          }
          updateBatchUI();
        });
      }

      playlistUl.appendChild(li);
    });

    // 置頂按鈕事件 (移至最上方)
    document.querySelectorAll(".btn-action-top").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const idx = parseInt(e.currentTarget.getAttribute("data-index"), 10);
        moveToTop(idx);
      });
    });

    // 置底按鈕事件 (移至最下方)
    document.querySelectorAll(".btn-action-bottom").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const idx = parseInt(e.currentTarget.getAttribute("data-index"), 10);
        moveToBottom(idx);
      });
    });

    // 單一刪除按鈕事件
    document.querySelectorAll(".btn-remove").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const idx = parseInt(e.currentTarget.getAttribute("data-index"), 10);
        removeItem(idx);
      });
    });
  }

  // 置頂 (移至最上方)
  function moveToTop(fromIndex) {
    if (fromIndex <= 0 || fromIndex >= currentPlaylist.length) return;
    const target = currentPlaylist.splice(fromIndex, 1)[0];
    currentPlaylist.unshift(target);
    if (sortSelect) sortSelect.value = "manual";
    savePlaylist(currentPlaylist, () => {
      setStatus(`已將「${target.title}」排至最上方`, "success");
    });
  }

  // 置底 (移至最下方)
  function moveToBottom(fromIndex) {
    if (fromIndex < 0 || fromIndex >= currentPlaylist.length - 1) return;
    const target = currentPlaylist.splice(fromIndex, 1)[0];
    currentPlaylist.push(target);
    if (sortSelect) sortSelect.value = "manual";
    savePlaylist(currentPlaylist, () => {
      setStatus(`已將「${target.title}」排至最下方`, "success");
    });
  }

  // YouTube 播放清單選擇彈窗元素 (截圖 44 原生樣式，無新增群組按鈕)
  const modalYtPlaylists = document.getElementById("modal-yt-playlists");
  const btnCloseYtModal = document.getElementById("btn-close-yt-playlists-modal");
  const ytModalTargetTitle = document.getElementById("yt-modal-target-title");
  const ytPlaylistsLoading = document.getElementById("yt-playlists-loading");
  const ytPlaylistsContainer = document.getElementById("yt-playlists-container");
  const ytPlaylistsErrorBox = document.getElementById("yt-playlists-error-box");
  const ytPlaylistsErrorMsg = document.getElementById("yt-playlists-error-msg");
  const btnYtModalFallback = document.getElementById("btn-yt-modal-fallback");
  let currentTargetYtItem = null;

  if (btnCloseYtModal) {
    btnCloseYtModal.addEventListener("click", () => {
      if (modalYtPlaylists) modalYtPlaylists.style.display = "none";
    });
  }

  if (modalYtPlaylists) {
    modalYtPlaylists.addEventListener("click", (e) => {
      if (e.target === modalYtPlaylists) {
        modalYtPlaylists.style.display = "none";
      }
    });
  }

  if (btnYtModalFallback) {
    btnYtModalFallback.addEventListener("click", () => {
      if (!currentTargetYtItem) return;
      if (modalYtPlaylists) modalYtPlaylists.style.display = "none";
      const targetUrl = currentTargetYtItem.url.includes("?")
        ? `${currentTargetYtItem.url}&dali_save=1`
        : `${currentTargetYtItem.url}?dali_save=1`;
      chrome.tabs.create({ url: targetUrl, active: true });
    });
  }

  // 儲存影片至 YouTube 播放清單 (彈窗列出使用者清單並直接選擇勾選，截圖 44)
  function saveToYouTubePlaylist(item) {
    if (!item || item.platform !== "youtube") {
      setStatus(t("ytOnlyError") || "此功能僅支援 YouTube 影片", "error");
      return;
    }

    currentTargetYtItem = item;

    if (modalYtPlaylists) {
      modalYtPlaylists.style.display = "flex";
    }
    if (ytModalTargetTitle) {
      ytModalTargetTitle.textContent = item.title || "YouTube 影片";
    }
    if (ytPlaylistsLoading) ytPlaylistsLoading.style.display = "flex";
    if (ytPlaylistsContainer) {
      ytPlaylistsContainer.style.display = "none";
      ytPlaylistsContainer.replaceChildren(); // 安全清空
    }
    if (ytPlaylistsErrorBox) ytPlaylistsErrorBox.style.display = "none";

    // 向 Background 查詢此帳號目前在 YouTube 的所有播放清單
    chrome.runtime.sendMessage({ action: "GET_YT_PLAYLISTS", videoId: item.videoId }, (res) => {
      if (ytPlaylistsLoading) ytPlaylistsLoading.style.display = "none";

      if (!res || !res.success || !Array.isArray(res.playlists)) {
        if (ytPlaylistsErrorBox) {
          ytPlaylistsErrorBox.style.display = "flex";
          if (ytPlaylistsErrorMsg) {
            ytPlaylistsErrorMsg.textContent = res?.error || "尚未在瀏覽器中登入 YouTube 帳號";
          }
        }
        return;
      }

      renderYouTubePlaylistsModal(res.playlists, item);
    });
  }

  // 渲染截圖 44 播放清單選單 (無新增群組按鈕)
  function renderYouTubePlaylistsModal(playlists, item) {
    if (!ytPlaylistsContainer) return;
    ytPlaylistsContainer.replaceChildren();

    if (playlists.length === 0) {
      const emptyDiv = document.createElement("div");
      emptyDiv.style.padding = "20px";
      emptyDiv.style.textAlign = "center";
      emptyDiv.style.color = "#94a3b8";
      emptyDiv.textContent = "未找到任何播放清單";
      ytPlaylistsContainer.appendChild(emptyDiv);
      ytPlaylistsContainer.style.display = "flex";
      return;
    }

    playlists.forEach((pl) => {
      const itemRow = document.createElement("div");
      itemRow.className = `yt-playlist-item ${pl.contains ? "is-selected" : ""}`;
      itemRow.dataset.playlistId = pl.playlistId;

      const leftBox = document.createElement("div");
      leftBox.className = "yt-playlist-left";

      // 封面縮圖
      let thumbEl;
      if (pl.thumbnail) {
        thumbEl = document.createElement("img");
        thumbEl.className = "yt-playlist-thumb";
        thumbEl.src = pl.thumbnail;
        thumbEl.alt = "";
        thumbEl.addEventListener("error", function () {
          this.style.display = "none";
        }, { once: true });
      } else {
        thumbEl = document.createElement("div");
        thumbEl.className = "yt-playlist-thumb";
        thumbEl.textContent = pl.playlistId === "WL" ? "🕒" : "📁";
      }

      // 文字
      const textBox = document.createElement("div");
      textBox.className = "yt-playlist-text-box";

      const nameSpan = document.createElement("span");
      nameSpan.className = "yt-playlist-name";
      nameSpan.textContent = pl.title;
      nameSpan.title = pl.title;

      const privSpan = document.createElement("span");
      privSpan.className = "yt-playlist-privacy";
      privSpan.textContent = pl.privacy || "私人";

      textBox.append(nameSpan, privSpan);
      leftBox.append(thumbEl, textBox);

      // 右側狀態圖標 (截圖 44 格式：已勾選 🔖，未勾選 📑)
      const checkSpan = document.createElement("span");
      checkSpan.className = "yt-playlist-check";
      checkSpan.textContent = pl.contains ? "🔖" : "📑";
      checkSpan.title = pl.contains ? "已在此清單內 (點擊移除)" : "未在此清單 (點擊加入)";

      itemRow.append(leftBox, checkSpan);

      // 點擊事件：一鍵加入或移出播放清單
      itemRow.addEventListener("click", () => {
        const currentlyContains = itemRow.classList.contains("is-selected");
        const nextState = !currentlyContains;

        itemRow.classList.add("is-updating");
        checkSpan.textContent = "⌛";

        chrome.runtime.sendMessage(
          {
            action: "TOGGLE_YT_PLAYLIST",
            videoId: item.videoId,
            playlistId: pl.playlistId,
            add: nextState
          },
          (toggleRes) => {
            itemRow.classList.remove("is-updating");

            if (toggleRes && toggleRes.success) {
              if (nextState) {
                itemRow.classList.add("is-selected");
                checkSpan.textContent = "🔖";
                checkSpan.title = "已在此清單內 (點擊移除)";
                setStatus(`✓ 已將影片加入「${pl.title}」！`, "success");
              } else {
                itemRow.classList.remove("is-selected");
                checkSpan.textContent = "📑";
                checkSpan.title = "未在此清單 (點擊加入)";
                setStatus(`✓ 已從「${pl.title}」清單移除！`, "success");
              }
            } else {
              checkSpan.textContent = currentlyContains ? "🔖" : "📑";
              setStatus(toggleRes?.error || "操作失敗，請稍後重試", "error");
            }
          }
        );
      });

      ytPlaylistsContainer.appendChild(itemRow);
    });

    ytPlaylistsContainer.style.display = "flex";
  }

  /* ==========================================================================
     跨平台自訂群組清單管理 (新增、改名、刪除、跨平台歸納與雙機同步)
     ========================================================================== */

  // 更新主介面「群組篩選」下拉選單
  function updateGroupFilterUI() {
    if (!selectGroupFilter) return;
    const currentVal = selectGroupFilter.value || activeGroupFilter;
    selectGroupFilter.replaceChildren();

    const optAll = document.createElement("option");
    optAll.value = "all";
    optAll.textContent = `🌟 全部影片 (${currentPlaylist.length})`;
    selectGroupFilter.appendChild(optAll);

    videoGroups.forEach((grp) => {
      const count = currentPlaylist.filter((x) => {
        if (!x.groupIds || x.groupIds.length === 0) return grp.id === "grp_default";
        return x.groupIds.includes(grp.id);
      }).length;

      const opt = document.createElement("option");
      opt.value = grp.id;
      opt.textContent = `${grp.badge || "📁"} ${grp.name} (${count})`;
      selectGroupFilter.appendChild(opt);
    });

    if (Array.from(selectGroupFilter.options).some((o) => o.value === currentVal)) {
      selectGroupFilter.value = currentVal;
    } else {
      selectGroupFilter.value = "all";
      activeGroupFilter = "all";
    }
  }

  selectGroupFilter?.addEventListener("change", (e) => {
    activeGroupFilter = e.target.value;
    renderPlaylist();
  });

  // 開啟跨平台自訂群組彈窗
  function openCrossGroupsModal(item) {
    if (!item) return;
    currentTargetGroupItem = item;

    if (modalCrossGroups) modalCrossGroups.style.display = "flex";
    if (crossGroupsTargetTitle) {
      crossGroupsTargetTitle.textContent = item.title || "目標影片";
    }

    renderCrossGroupsModal();
  }

  // 渲染跨平台自訂群組清單
  function renderCrossGroupsModal() {
    if (!crossGroupsContainer || !currentTargetGroupItem) return;
    crossGroupsContainer.replaceChildren();

    const curGroupIds = Array.isArray(currentTargetGroupItem.groupIds)
      ? currentTargetGroupItem.groupIds
      : (currentTargetGroupItem.groupIds ? [currentTargetGroupItem.groupIds] : ["grp_default"]);

    videoGroups.forEach((grp) => {
      const isSelected = curGroupIds.includes(grp.id);

      const count = currentPlaylist.filter((x) => {
        if (!x.groupIds || x.groupIds.length === 0) return grp.id === "grp_default";
        return x.groupIds.includes(grp.id);
      }).length;

      const itemRow = document.createElement("div");
      itemRow.className = `cross-group-item ${isSelected ? "is-selected" : ""}`;
      itemRow.dataset.groupId = grp.id;

      const leftBox = document.createElement("div");
      leftBox.className = "cross-group-left";

      const badgeSpan = document.createElement("span");
      badgeSpan.className = "cross-group-badge";
      badgeSpan.textContent = grp.badge || "📁";

      const infoBox = document.createElement("div");
      infoBox.className = "cross-group-info";

      const nameSpan = document.createElement("span");
      nameSpan.className = "cross-group-name";
      nameSpan.textContent = grp.name;
      nameSpan.title = grp.name;

      const countSpan = document.createElement("span");
      countSpan.className = "cross-group-count";
      countSpan.textContent = `${count} 部影片`;

      infoBox.append(nameSpan, countSpan);
      leftBox.append(badgeSpan, infoBox);

      const rightBox = document.createElement("div");
      rightBox.className = "cross-group-right";

      // ✏️ 重新命名按鈕
      const btnEdit = document.createElement("button");
      btnEdit.className = "cross-group-btn-edit";
      btnEdit.title = "重新命名此群組";
      btnEdit.textContent = "✏️";
      btnEdit.addEventListener("click", (e) => {
        e.stopPropagation();
        const newName = window.prompt("請輸入新的群組名稱：", grp.name);
        if (newName && newName.trim() && newName.trim() !== grp.name) {
          grp.name = newName.trim().slice(0, 30);
          saveCustomGroups();
          renderCrossGroupsModal();
          updateGroupFilterUI();
          setStatus(`✓ 已將群組更名為「${grp.name}」`, "success");
        }
      });

      // 🗑️ 刪除群組按鈕 (預設群組不可刪除)
      const btnDel = document.createElement("button");
      btnDel.className = "cross-group-btn-del";
      btnDel.title = "刪除此群組";
      btnDel.textContent = "🗑️";
      if (grp.id === "grp_default") {
        btnDel.style.display = "none";
      } else {
        btnDel.addEventListener("click", (e) => {
          e.stopPropagation();
          if (window.confirm(`確定要刪除「${grp.name}」群組嗎？（群組內的影片仍會保留於全部影片清單）`)) {
            videoGroups = videoGroups.filter((g) => g.id !== grp.id);
            // 同時從所有影片中移除此群組 ID
            currentPlaylist.forEach((x) => {
              if (Array.isArray(x.groupIds)) {
                x.groupIds = x.groupIds.filter((gid) => gid !== grp.id);
              }
            });
            saveCustomGroups();
            savePlaylist(currentPlaylist);
            renderCrossGroupsModal();
            updateGroupFilterUI();
            renderPlaylist();
            setStatus(`✓ 已刪除群組「${grp.name}」`, "success");
          }
        });
      }

      // 勾選圖示 (已在群組 🔖，未在群組 📑)
      const checkSpan = document.createElement("span");
      checkSpan.className = "cross-group-check";
      checkSpan.textContent = isSelected ? "🔖" : "📑";
      checkSpan.title = isSelected ? "已在此群組 (點擊移出)" : "未在此群組 (點擊加入)";

      rightBox.append(btnEdit, btnDel, checkSpan);
      itemRow.append(leftBox, rightBox);

      // 點擊整列切換加入/移出
      itemRow.addEventListener("click", () => {
        if (!Array.isArray(currentTargetGroupItem.groupIds)) {
          currentTargetGroupItem.groupIds = ["grp_default"];
        }

        const idx = currentTargetGroupItem.groupIds.indexOf(grp.id);
        if (idx >= 0) {
          currentTargetGroupItem.groupIds.splice(idx, 1);
          if (currentTargetGroupItem.groupIds.length === 0) {
            currentTargetGroupItem.groupIds = ["grp_default"];
          }
          setStatus(`✓ 已從「${grp.name}」移出`, "success");
        } else {
          currentTargetGroupItem.groupIds.push(grp.id);
          setStatus(`✓ 已加入「${grp.name}」！`, "success");
        }

        savePlaylist(currentPlaylist);
        renderCrossGroupsModal();
        updateGroupFilterUI();
        renderPlaylist();
      });

      crossGroupsContainer.appendChild(itemRow);
    });
  }

  // 儲存群組設定到 local
  function saveCustomGroups() {
    chrome.storage.local.set({ video_groups: videoGroups });
  }

  // 關閉跨平台群組彈窗事件
  if (btnCloseCrossGroupsModal) {
    btnCloseCrossGroupsModal.addEventListener("click", () => {
      if (modalCrossGroups) modalCrossGroups.style.display = "none";
    });
  }

  if (modalCrossGroups) {
    modalCrossGroups.addEventListener("click", (e) => {
      if (e.target === modalCrossGroups) {
        modalCrossGroups.style.display = "none";
      }
    });
  }

  // 新增跨平台群組按鈕事件
  if (btnCreateNewGroup && inputNewGroupName) {
    btnCreateNewGroup.addEventListener("click", () => {
      const name = inputNewGroupName.value.trim();
      if (!name) {
        setStatus("請先輸入新群組名稱！", "error");
        return;
      }

      if (videoGroups.some((g) => g.name === name)) {
        setStatus("已有相同名稱的群組！", "error");
        return;
      }

      const newId = `grp_${Date.now().toString(36)}`;
      const badges = ["🎬", "🎧", "💡", "🔥", "🚀", "🌟", "📚", "🏖️"];
      const badge = badges[videoGroups.length % badges.length];

      const newGrp = { id: newId, name: name.slice(0, 30), badge };
      videoGroups.push(newGrp);
      saveCustomGroups();

      // 若當前有開啟某部影片，自動為其勾選此新群組
      if (currentTargetGroupItem) {
        if (!Array.isArray(currentTargetGroupItem.groupIds)) {
          currentTargetGroupItem.groupIds = ["grp_default"];
        }
        if (!currentTargetGroupItem.groupIds.includes(newId)) {
          currentTargetGroupItem.groupIds.push(newId);
          savePlaylist(currentPlaylist);
        }
      }

      inputNewGroupName.value = "";
      renderCrossGroupsModal();
      updateGroupFilterUI();
      renderPlaylist();
      setStatus(`✓ 成功建立新群組「${name}」！`, "success");
    });

    inputNewGroupName.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        btnCreateNewGroup.click();
      }
    });
  }

  /**
   * 拖曳至清單頂部/底部邊緣時自動平滑捲動 (適用小視窗與放大全螢幕分頁)
   */
  const playlistSectionEl = document.querySelector(".playlist-section");
  let dragAutoScrollSpeed = 0;
  let dragAutoScrollRaf = null;

  function runDragAutoScroll() {
    if (draggedItemIndex === null || dragAutoScrollSpeed === 0 || !playlistSectionEl) {
      dragAutoScrollRaf = null;
      return;
    }
    playlistSectionEl.scrollTop += dragAutoScrollSpeed;
    dragAutoScrollRaf = requestAnimationFrame(runDragAutoScroll);
  }

  function stopDragAutoScroll() {
    dragAutoScrollSpeed = 0;
    if (dragAutoScrollRaf) {
      cancelAnimationFrame(dragAutoScrollRaf);
      dragAutoScrollRaf = null;
    }
  }

  document.addEventListener("dragover", (e) => {
    if (draggedItemIndex === null || !playlistSectionEl) return;
    e.preventDefault();

    const rect = playlistSectionEl.getBoundingClientRect();
    const edgeThreshold = 68;

    if (e.clientY <= rect.top + edgeThreshold) {
      const ratio = Math.min(1, Math.max(0.15, (rect.top + edgeThreshold - e.clientY) / edgeThreshold));
      dragAutoScrollSpeed = -Math.round(ratio * 16 + 3);
      if (!dragAutoScrollRaf) dragAutoScrollRaf = requestAnimationFrame(runDragAutoScroll);
    } else if (e.clientY >= rect.bottom - edgeThreshold) {
      const ratio = Math.min(1, Math.max(0.15, (e.clientY - (rect.bottom - edgeThreshold)) / edgeThreshold));
      dragAutoScrollSpeed = Math.round(ratio * 16 + 3);
      if (!dragAutoScrollRaf) dragAutoScrollRaf = requestAnimationFrame(runDragAutoScroll);
    } else {
      stopDragAutoScroll();
    }
  });

  document.addEventListener("drop", stopDragAutoScroll);
  document.addEventListener("dragend", stopDragAutoScroll);

  /**
   * HTML5 滑鼠左鍵拖曳換位機制
   */
  function bindDragAndDropEvents(li, index) {
    if (isSelectionMode) return;

    li.addEventListener("dragstart", (e) => {
      draggedItemIndex = index;
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", index);
      li.classList.add("is-dragging");
    });

    li.addEventListener("dragover", (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";

      const rect = li.getBoundingClientRect();
      const midY = rect.top + rect.height / 2;

      if (e.clientY < midY) {
        li.classList.add("drag-over-above");
        li.classList.remove("drag-over-below");
      } else {
        li.classList.add("drag-over-below");
        li.classList.remove("drag-over-above");
      }
    });

    li.addEventListener("dragleave", () => {
      li.classList.remove("drag-over-above", "drag-over-below");
    });

    li.addEventListener("drop", (e) => {
      e.preventDefault();
      li.classList.remove("drag-over-above", "drag-over-below");

      if (draggedItemIndex === null || draggedItemIndex === undefined) return;

      const rect = li.getBoundingClientRect();
      const midY = rect.top + rect.height / 2;
      const targetIndex = parseInt(li.dataset.index, 10);

      if (draggedItemIndex === targetIndex) return;

      const movedItem = currentPlaylist.splice(draggedItemIndex, 1)[0];
      const insertAt = e.clientY < midY ? targetIndex : targetIndex + 1;
      const finalIndex = draggedItemIndex < insertAt ? insertAt - 1 : insertAt;

      currentPlaylist.splice(finalIndex, 0, movedItem);

      // 自動將排序切換回「手動」
      if (sortSelect) sortSelect.value = "manual";

      savePlaylist(currentPlaylist, () => {
        setStatus("已依拖曳調整播放順序", "info");
      });
    });

    li.addEventListener("dragend", () => {
      li.classList.remove("is-dragging");
      document.querySelectorAll(".playlist-item").forEach((el) => {
        el.classList.remove("drag-over-above", "drag-over-below");
      });
      draggedItemIndex = null;
    });
  }

  // 6. 單一刪除
  function removeItem(index) {
    currentPlaylist.splice(index, 1);
    savePlaylist(currentPlaylist);
  }

  // 7. 貼上網址手動新增
  btnAddUrl.addEventListener("click", handleAddUrl);
  inputUrl.addEventListener("keypress", (e) => {
    if (e.key === "Enter") handleAddUrl();
  });

  function handleAddUrl() {
    const rawUrl = inputUrl.value.trim();
    if (!rawUrl) return;

    setStatus("正在解析影片資料...", "info");
    btnAddUrl.disabled = true;

    chrome.runtime.sendMessage({ action: "PARSE_AND_ADD", url: rawUrl }, (res) => {
      btnAddUrl.disabled = false;
      if (res && res.success) {
        inputUrl.value = "";
        setStatus(`已成功加入: ${res.item.title}`, "success");
      } else {
        setStatus(res?.error || "網址不正確或暫時無法解析", "error");
      }
    });
  }

  // 8. 一鍵加入目前瀏覽中的分頁 (對 TikTok / FB Reels 會先向網頁詢問目前正在播放的實際影片網址與縮圖)
  btnAddCurrent.addEventListener("click", () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const activeTab = tabs[0];
      if (!activeTab || !activeTab.url) return;

      setStatus(t("statusAddCurrent"), "info");

      const sendAdd = (url, title, thumbnail = "", duration = "") => {
        chrome.runtime.sendMessage(
          { action: "PARSE_AND_ADD", url, title, duration, thumbnail },
          (res) => {
            if (res && res.success) {
              setStatus(t("statusCurrentAdded", { title: res.item.title }), "success");
            } else {
              setStatus(t("statusNotVideoPage"), "error");
            }
          }
        );
      };

      if (activeTab.url.includes("tiktok.com") || activeTab.url.includes("facebook.com")) {
        chrome.tabs.sendMessage(activeTab.id, { action: "GET_ACTIVE_SHORT_INFO" }, (info) => {
          if (!chrome.runtime.lastError && info && info.url) {
            sendAdd(info.url, info.title || activeTab.title, info.thumbnail || "", info.duration || "");
          } else {
            sendAdd(activeTab.url, activeTab.title, "", "");
          }
        });
      } else {
        sendAdd(activeTab.url, activeTab.title, "", "");
      }
    });
  });

  // 9. 自動連播按鈕
  btnPlayAll.addEventListener("click", () => {
    if (currentPlaylist.length === 0) {
      setStatus("請先加入影片再開始播放！", "error");
      return;
    }
    chrome.runtime.sendMessage({ action: "START_PLAYLIST", startIndex: 0 }, (res) => {
      if (res && res.success) {
        setStatus("開始跨平台自動連續播放！", "success");
      }
    });
  });

  // 10. 停止播放按鈕
  btnStopPlay.addEventListener("click", () => {
    chrome.runtime.sendMessage({ action: "STOP_PLAYLIST" }, () => {
      setStatus("已停止自動連播", "info");
    });
  });

  // 11. 清空全部清單
  btnClearAll.addEventListener("click", () => {
    if (currentPlaylist.length === 0) return;
    if (confirm("確定要清空目前所有稍後觀看影片嗎？")) {
      currentPlaylist = [];
      chrome.storage.local.set({
        playState: { isPlaying: false, currentIndex: 0, playerTabId: null }
      });
      savePlaylist([], () => {
        setStatus("已清空清單", "info");
      });
    }
  });

  // 12. 匯入 / 匯出備份 Modal
  btnExportImport.addEventListener("click", () => {
    backupJson.value = JSON.stringify(currentPlaylist, null, 2);
    modalBackup.style.display = "flex";
  });

  btnCloseModal.addEventListener("click", () => {
    modalBackup.style.display = "none";
  });

  btnCopyJson.addEventListener("click", () => {
    backupJson.select();
    navigator.clipboard.writeText(backupJson.value).then(() => {
      alert("✓ 已複製播放清單到剪貼簿！現在直接到隔壁電腦點「📥 貼上同步」即可！");
    });
  });

  // 從剪貼簿一鍵直接讀取並同步匯入 (配合 DeskIn 共享剪貼簿，免手動貼上)
  async function pasteFromClipboardAndImport() {
    try {
      const text = await navigator.clipboard.readText();
      if (!text || !text.trim()) {
        alert("目前剪貼簿是空的！請先在另一台電腦點擊「複製清單」！");
        return;
      }
      const parsed = JSON.parse(text.trim());
      if (Array.isArray(parsed) && parsed.length > 0) {
        currentPlaylist = parsed;
        savePlaylist(currentPlaylist, () => {
          renderPlaylist();
          modalBackup.style.display = "none";
          setStatus(`✓ 成功從 DeskIn 剪貼簿同步 ${currentPlaylist.length} 部影片！`, "success");
          alert(`🎉 恭喜！已瞬間同步匯入 ${currentPlaylist.length} 部最新影片！`);
        });
      } else {
        alert("剪貼簿內容不是有效的播放清單資料！");
      }
    } catch (err) {
      alert("請點擊「⇄ 匯出入」打開輸入框，按 Ctrl+V 貼上後點套用！");
    }
  }

  btnQuickPaste?.addEventListener("click", pasteFromClipboardAndImport);
  btnPasteImportJson?.addEventListener("click", pasteFromClipboardAndImport);

  // 一鍵還原本地快照備份 (防睡前關機或重開被清空)
  const btnRestoreBackup = document.getElementById("btn-restore-backup");
  btnRestoreBackup?.addEventListener("click", () => {
    chrome.storage.local.get(["playlist_backup", "playlist"], (res) => {
      const backup = res.playlist_backup;
      if (Array.isArray(backup) && backup.length > 0) {
        currentPlaylist = backup;
        savePlaylist(currentPlaylist, () => {
          renderPlaylist();
          modalBackup.style.display = "none";
          alert(`🎉 恭喜！已成功從本地安全快照還原 ${backup.length} 部影片！`);
        });
      } else {
        alert("本地快照中暫無存檔。請點擊「📥 貼上同步」從剪貼簿還原，或從雲端同步！");
      }
    });
  });

  btnApplyJson.addEventListener("click", () => {
    try {
      const parsed = JSON.parse(backupJson.value.trim());
      if (Array.isArray(parsed)) {
        currentPlaylist = parsed;
        savePlaylist(currentPlaylist, () => {
          modalBackup.style.display = "none";
          setStatus("成功匯入清單！", "success");
        });
      } else {
        alert("格式錯誤：必須是 JSON 陣列！");
      }
    } catch (e) {
      alert("JSON 解析失敗，請確認格式是否完整正確！");
    }
  });

  // 一鍵下載備份檔案 (.json)
  btnDownloadJson?.addEventListener("click", () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(currentPlaylist, null, 2));
    const dlAnchor = document.createElement("a");
    dlAnchor.setAttribute("href", dataStr);
    dlAnchor.setAttribute("download", `跨平台播放清單_${new Date().toISOString().slice(0, 10)}.json`);
    dlAnchor.click();
  });

  // 一鍵選取檔案匯入
  btnUploadJson?.addEventListener("click", () => {
    fileImportJson?.click();
  });

  fileImportJson?.addEventListener("change", (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target.result);
        if (Array.isArray(parsed)) {
          currentPlaylist = parsed;
          savePlaylist(currentPlaylist, () => {
            modalBackup.style.display = "none";
            setStatus(`成功從檔案匯入 ${currentPlaylist.length} 部影片！`, "success");
          });
        } else {
          alert("檔案內容格式不正確，需為 JSON 陣列！");
        }
      } catch (err) {
        alert("讀取檔案失敗，請確認是正確的 JSON 檔案！");
      }
    };
    reader.readAsText(file);
  });

  // 13. 24小時雙機非同步專屬雲端同步 (不同時開機也能同步)
  const btnCloudSyncModal = document.getElementById("btn-cloud-sync-modal");
  const modalCloudSync = document.getElementById("modal-cloud-sync");
  const inputSyncCode = document.getElementById("input-sync-code");
  const syncCodeStatus = document.getElementById("sync-code-status");
  const btnCopySyncCode = document.getElementById("btn-copy-sync-code");
  const btnCloudUpload = document.getElementById("btn-cloud-upload");
  const btnCloudDownload = document.getElementById("btn-cloud-download");
  const btnCloseCloudModal = document.getElementById("btn-close-cloud-modal");

  btnCloudSyncModal?.addEventListener("click", async () => {
    const code = await getCloudSyncCode();
    if (code) {
      inputSyncCode.value = code;
      syncCodeStatus.textContent = "已綁定專屬碼";
      syncCodeStatus.style.color = "#34d399";
    } else {
      inputSyncCode.value = "";
      syncCodeStatus.textContent = "尚未綁定";
      syncCodeStatus.style.color = "#94a3b8";
    }
    modalCloudSync.style.display = "flex";
  });

  btnCloseCloudModal?.addEventListener("click", () => {
    modalCloudSync.style.display = "none";
  });

  modalCloudSync?.addEventListener("click", (e) => {
    if (e.target === modalCloudSync) {
      modalCloudSync.style.display = "none";
    }
  });

  modalBackup?.addEventListener("click", (e) => {
    if (e.target === modalBackup) {
      modalBackup.style.display = "none";
    }
  });

  // 全域按 Esc 鍵立即關閉任何開啟中的彈窗
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      [modalCloudSync, modalBackup, modalYtPlaylists, modalCrossGroups, modalSoftwareUpdate].forEach((m) => {
        if (m && m.style.display !== "none") {
          m.style.display = "none";
        }
      });
    }
  });

  btnCopySyncCode?.addEventListener("click", () => {
    const code = inputSyncCode.value.trim();
    if (!code) {
      alert("目前尚未有同步碼可複製！請先點擊下方「上傳備份到雲端」生成代碼。");
      return;
    }
    navigator.clipboard.writeText(code).then(() => {
      alert(`✓ 已複製雙機專屬同步碼：【 ${code} 】！\n\n您現在可以到 B 電腦貼上這組代碼囉！`);
    });
  });

  btnCloudUpload?.addEventListener("click", async () => {
    if (currentPlaylist.length === 0) {
      alert("目前清單是空的，請先加入影片再上傳！");
      return;
    }

    btnCloudUpload.disabled = true;
    btnCloudUpload.textContent = "⏳ 正在上傳至 24hr 雲端...";

    try {
      const customCode = inputSyncCode.value.trim() || null;
      const res = await uploadToCloudSync(currentPlaylist, customCode);
      inputSyncCode.value = res.syncCode;
      syncCodeStatus.textContent = "已同步上傳";
      syncCodeStatus.style.color = "#34d399";
      setStatus(`✓ 成功上傳備份 ${currentPlaylist.length} 部影片至雲端！`, "success");
      alert(`🎉 上傳成功！\n\n您的專屬雙機同步碼為：\n【 ${res.syncCode} 】\n\n（A 電腦現在可以關機了！隨時到 B 電腦打開雲端同步，貼入此代碼點下載即可！）`);
    } catch (err) {
      alert(`上傳失敗: ${err.message}`);
    } finally {
      btnCloudUpload.disabled = false;
      btnCloudUpload.textContent = "☁️ 上傳備份到雲端 (A電腦)";
    }
  });

  btnCloudDownload?.addEventListener("click", async () => {
    const code = inputSyncCode.value.trim();
    if (!code) {
      alert("請先輸入您的雙機專屬同步碼！");
      return;
    }

    btnCloudDownload.disabled = true;
    btnCloudDownload.textContent = "⏳ 正在從雲端拉取...";

    try {
      const res = await downloadFromCloudSync(code);
      if (res && res.success && Array.isArray(res.playlist)) {
        currentPlaylist = res.playlist;
        savePlaylist(currentPlaylist, () => {
          renderPlaylist();
          modalCloudSync.style.display = "none";
          setStatus(`✓ 成功從雲端同步下載 ${currentPlaylist.length} 部影片！`, "success");
          alert(`🎉 恭喜！已成功從雲端下載同步 ${currentPlaylist.length} 部影片！`);
        });
      } else {
        alert(res?.error || "未在雲端找到清單資料，請確認同步碼是否正確！");
      }
    } catch (err) {
      alert(`下載失敗: ${err.message}`);
    } finally {
      btnCloudDownload.disabled = false;
      btnCloudDownload.textContent = "📥 從雲端下載同步 (B電腦)";
    }
  });

  function setStatus(msg, type = "info") {
    let color = "#94a3b8";
    if (type === "success") color = "#34d399";
    if (type === "error") color = "#f87171";

    const msgSpan = document.createElement("span");
    msgSpan.style.color = color;
    msgSpan.style.fontWeight = "600";
    msgSpan.textContent = msg;
    statusBar.replaceChildren(msgSpan);

    setTimeout(() => {
      const tipSpan = document.createElement("span");
      tipSpan.textContent = t("footerTip");
      statusBar.replaceChildren(tipSpan);
    }, 4000);
  }

  function formatDate(ts) {
    if (!ts) return "剛剛";
    const d = new Date(ts);
    const m = d.getMonth() + 1;
    const day = d.getDate();
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    return `${m}/${day} ${hh}:${mm}`;
  }

  function escapeHtml(str) {
    if (!str) return "";
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  // ==========================================
  // 軟體一鍵更新中心 (GitHub 雙機即時更新)
  // ==========================================
  const GITHUB_REPO = "louis3526/cross-platform-watch-later-chrome";
  const btnSoftwareUpdate = document.getElementById("btn-software-update");
  const modalSoftwareUpdate = document.getElementById("modal-software-update");
  const btnCloseUpdateModal = document.getElementById("btn-close-update-modal");
  const updateLocalVersion = document.getElementById("update-local-version");
  const updateRemoteCommit = document.getElementById("update-remote-commit");
  const updateStatusBanner = document.getElementById("update-status-banner");
  const updateCommitLog = document.getElementById("update-commit-log");
  const btnReloadExtensionCore = document.getElementById("btn-reload-extension-core");
  const btnDownloadLatestZip = document.getElementById("btn-download-latest-zip");
  const btnCopyGitPull = document.getElementById("btn-copy-git-pull");

  const localVersion = chrome.runtime.getManifest()?.version || "1.0.1";
  if (updateLocalVersion) {
    updateLocalVersion.textContent = `v${localVersion}`;
  }

  btnSoftwareUpdate?.addEventListener("click", () => {
    modalSoftwareUpdate.style.display = "flex";
    checkSoftwareUpdate();
  });

  btnCloseUpdateModal?.addEventListener("click", () => {
    modalSoftwareUpdate.style.display = "none";
  });

  modalSoftwareUpdate?.addEventListener("click", (e) => {
    if (e.target === modalSoftwareUpdate) {
      modalSoftwareUpdate.style.display = "none";
    }
  });

  async function checkSoftwareUpdate() {
    if (!updateStatusBanner) return;
    updateStatusBanner.className = "update-status-banner checking";
    updateStatusBanner.textContent = "⏳ 正在連線 GitHub 查詢最新版本...";
    if (updateRemoteCommit) updateRemoteCommit.textContent = "查詢中...";
    if (updateCommitLog) updateCommitLog.style.display = "none";

    try {
      // 1. 同時查詢 GitHub 最新提交紀錄與 manifest.json 版本
      const [commitRes, manifestRes] = await Promise.allSettled([
        fetch(`https://api.github.com/repos/${GITHUB_REPO}/commits/main`, {
          headers: { Accept: "application/vnd.github.v3+json" }
        }),
        fetch(`https://raw.githubusercontent.com/${GITHUB_REPO}/main/manifest.json?t=${Date.now()}`)
      ]);

      let remoteSha = "最新";
      let commitMsg = "";
      let commitDate = "";
      let remoteVersion = localVersion;

      if (commitRes.status === "fulfilled" && commitRes.value.ok) {
        const data = await commitRes.value.json();
        remoteSha = (data?.sha || "").substring(0, 7);
        commitMsg = data?.commit?.message?.split("\n")[0] || "";
        commitDate = data?.commit?.committer?.date ? new Date(data.commit.committer.date).toLocaleString() : "";
      }

      if (manifestRes.status === "fulfilled" && manifestRes.value.ok) {
        const mData = await manifestRes.value.json();
        if (mData?.version) remoteVersion = mData.version;
      }

      if (updateRemoteCommit) {
        updateRemoteCommit.textContent = `${remoteSha} (v${remoteVersion})`;
      }

      if (commitMsg && updateCommitLog) {
        updateCommitLog.style.display = "block";
        updateCommitLog.textContent = `📝 最新改動: ${commitMsg} ${commitDate ? `(${commitDate})` : ""}`;
      }

      // 版本比對 (以 Semantic Version 為基準)
      const hasNewerVersion = remoteVersion > localVersion;
      if (!hasNewerVersion) {
        updateStatusBanner.className = "update-status-banner up-to-date";
        updateStatusBanner.textContent = `✅ 目前本機已是最新版本 (v${localVersion})，與 GitHub 同步！`;
        if (btnSoftwareUpdate) {
          btnSoftwareUpdate.textContent = "🚀 軟體更新";
          btnSoftwareUpdate.classList.replace("btn-danger", "btn-warning");
        }
      } else {
        updateStatusBanner.className = "update-status-banner has-update";
        updateStatusBanner.textContent = `⚡ 發現新版本 (v${remoteVersion})！請依照下方步驟完成更新`;
        if (btnSoftwareUpdate) {
          btnSoftwareUpdate.textContent = "🚀 發現更新!";
          btnSoftwareUpdate.classList.replace("btn-warning", "btn-danger");
        }
      }
    } catch (err) {
      console.warn("Check update failed:", err);
      updateStatusBanner.className = "update-status-banner up-to-date";
      updateStatusBanner.textContent = `✅ 目前運作正常 (v${localVersion})。若需要最新代碼，請使用下方步驟。`;
      if (updateRemoteCommit) updateRemoteCommit.textContent = "離線/略過";
    }
  }

  // 步驟 1: 一鍵下載最新 ZIP 完整包
  btnDownloadLatestZip?.addEventListener("click", () => {
    const zipUrl = `https://github.com/${GITHUB_REPO}/archive/refs/heads/main.zip`;
    chrome.tabs.create({ url: zipUrl });
  });

  // 步驟 2: 一鍵重啟擴充功能核心 (檔案更新後秒速生效)
  btnReloadExtensionCore?.addEventListener("click", () => {
    btnReloadExtensionCore.disabled = true;
    btnReloadExtensionCore.style.opacity = "0.7";
    const span = btnReloadExtensionCore.querySelector(".action-title");
    if (span) span.textContent = "🔄 正在重新載入核心...";
    setTimeout(() => {
      chrome.runtime.reload();
      window.close();
    }, 350);
  });

  // 進階: 一鍵複製 Git 更新指令
  btnCopyGitPull?.addEventListener("click", () => {
    const cmd = "git pull origin main";
    navigator.clipboard.writeText(cmd).then(() => {
      alert(`✓ 已複製 Git 更新指令：\n\n【 ${cmd} 】\n\n在另一部電腦的外掛目錄打開終端機貼上執行即可 1 秒同步！`);
    });
  });
});
