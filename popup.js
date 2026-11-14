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

  // 1. 載入狀態
  function loadState() {
    chrome.runtime.sendMessage({ action: "GET_STATE" }, (res) => {
      if (res) {
        currentPlaylist = res.playlist || [];
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
      btnOpenTab.innerHTML = `↙ 縮小返回小視窗`;
      btnOpenTab.title = "關閉此獨立分頁，恢復為原本的小視窗";
      btnOpenTab.className = "btn btn-danger btn-sm";
    } else {
      btnOpenTab.innerHTML = `⤢ 開啟全螢幕大分頁`;
      btnOpenTab.title = "在新分頁開啟全螢幕大視窗檢視";
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
    batchCountText.textContent = `已選取 ${count} 部`;
    btnBatchDelete.disabled = count === 0;
    btnBatchDelete.textContent = `🗑️ 刪除所選影片 (${count})`;
    if (chkSelectAll) {
      chkSelectAll.checked = currentPlaylist.length > 0 && selectedIds.size === currentPlaylist.length;
    }
  }

  // 5. 渲染清單
  function renderPlaylist() {
    listCounter.textContent = `${currentPlaylist.length} 部影片`;

    // 控制播放按鈕
    if (currentPlayState.isPlaying && currentPlaylist.length > 0) {
      btnStopPlay.style.display = "inline-flex";
      playBtnText.textContent = `播放中 (${currentPlayState.currentIndex + 1}/${currentPlaylist.length})`;
      btnPlayAll.classList.replace("btn-success", "btn-secondary");
    } else {
      btnStopPlay.style.display = "none";
      playBtnText.textContent = currentPlaylist.length > 0 ? "▶ 從頭自動播放" : "清單尚無影片";
      btnPlayAll.classList.replace("btn-secondary", "btn-success");
    }

    if (currentPlaylist.length === 0) {
      emptyState.style.display = "block";
      playlistUl.innerHTML = "";
      return;
    }

    emptyState.style.display = "none";
    playlistUl.innerHTML = "";

    currentPlaylist.forEach((item, index) => {
      const isCurrentPlaying = currentPlayState.isPlaying && currentPlayState.currentIndex === index;
      const li = document.createElement("li");
      li.className = `playlist-item ${isCurrentPlaying ? "is-playing" : ""}`;
      li.dataset.index = index;
      li.dataset.id = item.id;

      // 支援滑鼠左鍵拖曳排序
      li.draggable = !isSelectionMode;

      const platformLabel = item.platform === "youtube" ? "YouTube" : "B站";
      const platformBadgeClass = item.platform === "youtube" ? "badge-youtube" : "badge-bilibili";
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

      const durationMetaHtml = cleanDuration
        ? `<span class="item-duration-tag">⏱️ 片長: <b>${escapeHtml(cleanDuration)}</b></span><span class="meta-dot">•</span>`
        : "";

      const checkboxHtml = isSelectionMode
        ? `<input type="checkbox" class="item-checkbox" data-id="${item.id}" ${selectedIds.has(item.id) ? "checked" : ""}>`
        : "";

      const dragHandleHtml = !isSelectionMode
        ? `<div class="item-drag-handle" title="按住滑鼠左鍵拖曳重新排列順序">⋮⋮</div>`
        : "";

      li.innerHTML = `
        ${checkboxHtml}
        ${dragHandleHtml}
        <div class="item-index">${index + 1}</div>
        <div class="item-thumb-box" title="按兩下滑鼠左鍵立即播放此影片">
          <img src="${item.thumbnail}" referrerpolicy="no-referrer" alt="thumb">
          <span class="item-platform-badge ${platformBadgeClass}">${platformLabel}</span>
          <div class="thumb-play-overlay" title="按兩下立即播放">▶</div>
        </div>
        <div class="item-info">
          <a href="${item.url}" target="_blank" class="item-title" title="${escapeHtml(item.title)}">
            ${isCurrentPlaying ? "▶ " : ""}${escapeHtml(item.title)}
          </a>
          <div class="item-meta">
            ${durationMetaHtml}
            <span>加入時間: ${formattedDate}</span>
          </div>
        </div>
        <div class="item-actions">
          <button class="btn-icon btn-action-top" data-index="${index}" title="移至最上方 (置頂)" ${index === 0 ? "disabled style='opacity:0.25;cursor:default;'" : ""}>⤒</button>
          <button class="btn-icon delete btn-remove" data-index="${index}" title="刪除此影片">✕</button>
          <button class="btn-icon btn-action-bottom" data-index="${index}" title="移至最下方 (置底)" ${index === currentPlaylist.length - 1 ? "disabled style='opacity:0.25;cursor:default;'" : ""}>⤓</button>
        </div>
      `;

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
                  tag.innerHTML = `⏱️ 片長: <b>${escapeHtml(realDur)}</b>`;
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
                tag.innerHTML = `⏱️ 片長: <b>${escapeHtml(realDur)}</b>`;
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

  // 8. 一鍵加入目前瀏覽中的分頁
  btnAddCurrent.addEventListener("click", () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const activeTab = tabs[0];
      if (!activeTab || !activeTab.url) return;

      setStatus("正在收納當前分頁影片...", "info");
      chrome.runtime.sendMessage(
        { action: "PARSE_AND_ADD", url: activeTab.url, title: activeTab.title },
        (res) => {
          if (res && res.success) {
            setStatus(`已收納當前影片: ${res.item.title}`, "success");
          } else {
            setStatus("目前分頁非 YouTube 或 Bilibili 影片頁面", "error");
          }
        }
      );
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

    statusBar.innerHTML = `<span style="color:${color}; font-weight:600;">${escapeHtml(msg)}</span>`;
    setTimeout(() => {
      statusBar.innerHTML = `<span>💡 按住滑鼠左鍵可直接拖曳上下排列順序</span>`;
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
});
