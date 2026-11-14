/**
 * 跨平台稍後觀看自動播放器 - Content Script
 * 注入目標：YouTube 與 Bilibili (包含首頁、搜尋頁、頻道頁與影片頁)
 * 負責：
 * 1. 在影片封面卡片上動態注入浮動「➕ 稍後連播」按鈕，支援點擊一秒入庫
 * 2. 專用播放分頁掛載頂層懸浮控制器、監聽影片結束並自動跳下一部、跳過 YouTube 廣告
 */

(function () {
  let hasTriggeredEnd = false;
  let dockElement = null;
  let isMinimized = false;

  // 1. 全域初始化：在所有影片卡片上注入「封面浮動按鈕」
  initCardThumbnailButtons();

  // 2. 向 Background 查詢此分頁是否為「專用連續播放分頁」
  chrome.runtime.sendMessage({ action: "CHECK_TAB_STATUS" }, (res) => {
    if (chrome.runtime.lastError || !res || !res.isPlayerTab) {
      return; // 不是連續播放專用分頁，安靜完成卡片按鈕掛載即可
    }

    // 是專用播放分頁，掛載頂部懸浮控制器與啟動視訊監聽
    initPlayerTabFeatures(res);
  });

  /* ==========================================================================
     功能一：影片封面卡片懸浮按鈕注入 (YouTube & Bilibili 封面一鍵加入)
     ========================================================================== */

  function initCardThumbnailButtons() {
    // 首次掃描
    scanAndInjectButtons();

    // 監聽滾動與 DOM 動態載入（無限滾動防抖掃描）
    let scanTimeout = null;
    const scheduleScan = () => {
      if (scanTimeout) clearTimeout(scanTimeout);
      scanTimeout = setTimeout(scanAndInjectButtons, 200);
    };

    window.addEventListener("scroll", scheduleScan, { passive: true });

    // 定時守護進程（每 1.2 秒輪詢一次，徹底解決 YouTube Polymer 延遲綁定與 SPA 導航卡片漏載問題）
    setInterval(scanAndInjectButtons, 1200);

    // 監聽 YouTube SPA 專屬導航與頁面更新自訂事件
    window.addEventListener("yt-navigate-finish", scheduleScan);
    window.addEventListener("yt-page-data-updated", scheduleScan);
    window.addEventListener("spfdone", scheduleScan);

    const observer = new MutationObserver((mutations) => {
      let shouldScan = false;
      for (const m of mutations) {
        if (m.addedNodes.length > 0) {
          shouldScan = true;
          break;
        }
      }
      if (shouldScan) scheduleScan();
    });

    observer.observe(document.body, { childList: true, subtree: true });
  }

  /**
   * 掃描頁面上的影片卡片並插入浮動按鈕
   */
  function scanAndInjectButtons() {
    const isYouTube = location.hostname.includes("youtube.com");
    const isBilibili = location.hostname.includes("bilibili.com");

    if (isYouTube) {
      injectYouTubeCards();
    } else if (isBilibili) {
      injectBilibiliCards();
    }
  }

  /**
   * YouTube 卡片掃描與按鈕注入
   */
  function injectYouTubeCards() {
    // 涵蓋 YouTube 所有版面與新舊版渲染器容器
    const cardSelectors = [
      "ytd-rich-item-renderer",
      "ytd-video-renderer",
      "ytd-compact-video-renderer",
      "ytd-grid-video-renderer",
      "ytd-playlist-video-renderer",
      "ytd-reel-item-renderer",
      "ytd-rich-grid-media",
      "ytd-grid-media"
    ];

    const cards = document.querySelectorAll(cardSelectors.join(","));

    cards.forEach((card) => {
      if (card.dataset.cppdInjected) return;

      // 1. 穿透搜尋影片連結：優先尋找帶有 /watch?v= 或 /shorts/ 的 <a> 標籤
      let linkElem = card.querySelector("a[href*='/watch?v='], a[href*='/shorts/']");
      if (!linkElem) {
        // 若直接選擇器未命中，廣度掃描 card 內部所有 <a> 標籤
        const allAnchors = card.querySelectorAll("a[href]");
        for (const a of allAnchors) {
          const h = a.getAttribute("href") || "";
          if (h.includes("/watch?v=") || h.includes("/shorts/")) {
            linkElem = a;
            break;
          }
        }
      }

      // 如果尚未綁定出有效連結（仍為骨架屏），暫不標記，等待定時輪詢再次嘗試
      if (!linkElem) return;

      const href = linkElem.getAttribute("href");
      if (!href) return;
      const fullUrl = href.startsWith("http") ? href : new URL(href, location.origin).href;

      // 2. 搜尋影片標題與時長 (時間)
      const titleElem = card.querySelector("#video-title, #video-title-link, .title, h3 a");
      let title = titleElem?.getAttribute("title") || titleElem?.textContent?.trim() || "";
      if (!title) {
        title = linkElem.getAttribute("title") || linkElem.getAttribute("aria-label") || "";
      }

      // 擷取 YouTube 封面上的時長標籤 (例如 "4:57", "15:04")
      const durationElem = card.querySelector(
        "#overlays ytd-thumbnail-overlay-time-status-renderer #text, span#text.ytd-thumbnail-overlay-time-status-renderer, .badge-shape-wiz__text, ytd-thumbnail-overlay-time-status-renderer"
      );
      const duration = durationElem?.textContent?.trim() || "";

      // 擷取 YouTube 封面上的真實縮圖
      const ytImg = card.querySelector("ytd-thumbnail img, #thumbnail img, img");
      let thumbUrl = ytImg?.getAttribute("src") || ytImg?.currentSrc || "";

      // 3. 尋找縮圖容器掛載點 (掛載於 ytd-thumbnail 頂層)
      const thumbContainer = card.querySelector("ytd-thumbnail, a#thumbnail, #thumbnail, .ytd-thumbnail") || card;

      // 標記已注入，避免重複處理
      card.dataset.cppdInjected = "true";

      // 建立按鈕元件
      createThumbnailButton(thumbContainer, fullUrl, title, duration, card, thumbUrl);
    });
  }

  /**
   * Bilibili 卡片掃描與按鈕注入
   */
  function injectBilibiliCards() {
    // 涵蓋 B站首頁、搜尋頁、個人空間、相關推薦等
    const cardSelectors = [
      ".bili-video-card",
      ".video-card",
      ".feed-card",
      ".bili-video-card__wrap"
    ];

    const cards = document.querySelectorAll(cardSelectors.join(","));

    cards.forEach((card) => {
      if (card.dataset.cppdInjected) return;

      const thumbContainer = card.querySelector(".bili-video-card__image--wrap, .bili-video-card__image, .pic-box") || card;
      const linkElem = card.querySelector("a[href*='/video/BV'], a[href*='/video/av']");
      if (!linkElem) return;

      let href = linkElem.getAttribute("href");
      if (!href) return;
      if (href.startsWith("//")) href = "https:" + href;
      const fullUrl = href.startsWith("http") ? href : new URL(href, location.origin).href;

      const titleElem = card.querySelector(".bili-video-card__info--tit, h3, a[title]");
      const title = titleElem?.getAttribute("title") || titleElem?.textContent?.trim() || "";

      // 擷取 B站封面真實時長 (必須包含時間冒號格式，嚴格排除 557 等純數字觀看/彈幕數)
      let duration = "";
      const timeSpans = card.querySelectorAll(".bili-video-card__stats--duration, .bili-video-card__stats__duration, span, em");
      for (const el of timeSpans) {
        const txt = el.textContent.trim();
        if (/^(?:\d{1,2}:)?\d{1,2}:\d{2}$/.test(txt)) {
          if (txt !== "00:00" && txt !== "00:01" && txt !== "00:29" && txt !== "0:01" && txt !== "0:29") {
            duration = txt;
            break;
          }
        }
      }

      // 擷取 B站卡片真實封面縮圖
      const imgElem = card.querySelector(".bili-video-card__image--wrap img, picture img, img");
      let thumbUrl = imgElem?.getAttribute("src") || imgElem?.getAttribute("data-src") || "";
      if (thumbUrl.startsWith("//")) thumbUrl = "https:" + thumbUrl;
      else if (thumbUrl.startsWith("http://")) thumbUrl = thumbUrl.replace("http://", "https://");

      card.dataset.cppdInjected = "true";
      createThumbnailButton(thumbContainer, fullUrl, title, duration, card, thumbUrl);
    });
  }

  /**
   * 建立並掛載封面浮動按鈕 (雙重捕獲階段攔截，徹底杜絕點擊穿透問題)
   */
  function createThumbnailButton(container, videoUrl, videoTitle, videoDuration = "", card = null, videoThumb = "") {
    if (container.querySelector(".cppd-thumb-btn-wrapper")) return;

    // 確保容器具有相對定位
    const computedPos = window.getComputedStyle(container).position;
    if (computedPos === "static") {
      container.style.position = "relative";
    }

    const wrapper = document.createElement("div");
    wrapper.className = "cppd-thumb-btn-wrapper";

    const btn = document.createElement("button");
    btn.className = "cppd-thumb-add-btn";
    btn.innerHTML = `<span>➕</span> 稍後連播`;
    btn.title = "加入跨平台稍後觀看清單";

    // 徹底防穿透：在 btn 上精確阻斷所有會觸發 YouTube/B 站底層跳轉的指針與滑鼠事件冒泡
    const stopEvents = ["mousedown", "mouseup", "pointerdown", "pointerup", "touchstart", "touchend"];
    stopEvents.forEach((evtName) => {
      btn.addEventListener(evtName, (e) => {
        e.stopPropagation();
      });
    });

    // 核心點擊處理函式：阻止默認跳轉並執行加入清單邏輯
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();

      if (btn.classList.contains("cppd-added")) return;

      btn.classList.add("cppd-added");
      btn.innerHTML = `<span>✓</span> 已加入`;
      btn.title = "已在清單中";

      // 點擊當下動態複查最新時長 (必須包含時間冒號格式，嚴格排除純數字如 557)
      let finalDuration = videoDuration;
      if ((!finalDuration || !finalDuration.includes(":") || /^\d+$/.test(finalDuration)) && card) {
        const timeSpans = card.querySelectorAll(".bili-video-card__stats--duration, .bili-video-card__stats__duration, span, em");
        for (const el of timeSpans) {
          const txt = el.textContent.trim();
          if (/^(?:\d{1,2}:)?\d{1,2}:\d{2}$/.test(txt)) {
            if (txt !== "00:00" && txt !== "00:01" && txt !== "00:29" && txt !== "0:01" && txt !== "0:29") {
              finalDuration = txt;
              break;
            }
          }
        }
      }

      // 點擊當下動態複查最新封面縮圖
      let finalThumb = videoThumb;
      if (!finalThumb && card) {
        const img = card.querySelector(".bili-video-card__image--wrap img, picture img, ytd-thumbnail img, img");
        let src = img?.getAttribute("src") || img?.getAttribute("data-src") || "";
        if (src.startsWith("//")) src = "https:" + src;
        else if (src.startsWith("http://")) src = src.replace("http://", "https://");
        if (src && !src.includes("data:image")) finalThumb = src;
      }

      // 呼叫 Background 加入清單（附帶時長與縮圖）
      try {
        chrome.runtime.sendMessage(
          { action: "PARSE_AND_ADD", url: videoUrl, title: videoTitle, duration: finalDuration, thumbnail: finalThumb },
          (res) => {
            if (chrome.runtime.lastError) {
              console.warn("sendMessage error:", chrome.runtime.lastError);
              btn.classList.remove("cppd-added");
              btn.innerHTML = `<span>➕</span> 稍後連播`;
              showToast("⚠️ 外掛核心已更新，請按 F5 重新整理頁面！");
              return;
            }
            const finalTitle = res?.item?.title || videoTitle || "影片";
            showToast(`已加入跨平台清單: ${finalTitle}`);
          }
        );
      } catch (err) {
        btn.classList.remove("cppd-added");
        btn.innerHTML = `<span>➕</span> 稍後連播`;
        showToast("⚠️ 外掛核心已更新，請按 F5 重新整理頁面！");
      }
    });

    wrapper.appendChild(btn);
    container.appendChild(wrapper);
  }

  /**
   * 顯示螢幕中央底部 Toast 成功提示
   */
  let toastTimeout = null;
  function showToast(message) {
    let toast = document.getElementById("cppd-toast-notify");
    if (!toast) {
      toast = document.createElement("div");
      toast.id = "cppd-toast-notify";
      document.body.appendChild(toast);
    }

    toast.innerHTML = `<span class="cppd-toast-icon">✓</span> <span>${escapeHtml(message)}</span>`;
    toast.classList.add("show");

    if (toastTimeout) clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => {
      toast.classList.remove("show");
    }, 2400);
  }

  /* ==========================================================================
     功能二：專用連續播放分頁（懸浮條、跳廣告、影片結束跳下一部）
     ========================================================================== */

  function initPlayerTabFeatures(state) {
    injectFloatingDock(state);
    startVideoWatcher(state);
  }

  /**
   * 掛載高質感懸浮控制器
   */
  function injectFloatingDock(state) {
    if (document.getElementById("cross-platform-player-dock")) return;

    dockElement = document.createElement("div");
    dockElement.id = "cross-platform-player-dock";

    const currentTitle = state.currentItem?.title || document.title;
    const nextTitle = state.nextItem ? `下一部: ${state.nextItem.title}` : "（此為最後一部）";
    const currentNum = (state.currentIndex || 0) + 1;
    const totalNum = state.total || 1;

    dockElement.innerHTML = `
      <div class="cppd-container" id="cppd-main-box">
        <div class="cppd-badge" id="cppd-toggle-min" title="點擊收合/展開控制器">
          <span class="cppd-pulse-dot"></span>
          <span>${currentNum} / ${totalNum}</span>
        </div>
        <div class="cppd-info" id="cppd-info-box">
          <div class="cppd-title" title="${escapeHtml(currentTitle)}">${escapeHtml(currentTitle)}</div>
          <div class="cppd-next" title="${escapeHtml(nextTitle)}">${escapeHtml(nextTitle)}</div>
        </div>
        <div class="cppd-actions" id="cppd-actions-box">
          <button class="cppd-btn" id="cppd-btn-prev" title="上一部">⏮</button>
          <button class="cppd-btn" id="cppd-btn-next" title="下一部">⏭</button>
          <button class="cppd-btn" id="cppd-btn-fs" title="一鍵進入最高原生全螢幕 (F)">⛶</button>
          <button class="cppd-btn cppd-btn-stop" id="cppd-btn-stop" title="停止自動播放">⏹</button>
        </div>
      </div>
    `;

    document.body.appendChild(dockElement);

    // 綁定按鈕事件
    document.getElementById("cppd-btn-prev")?.addEventListener("click", () => {
      chrome.runtime.sendMessage({ action: "SKIP_PREV" });
    });

    document.getElementById("cppd-btn-next")?.addEventListener("click", () => {
      triggerNextVideo("手動切換至下一部");
    });

    // 懸浮條原生全螢幕按鈕 (使用者真實手勢授權，100% 進入最高原生全螢幕)
    document.getElementById("cppd-btn-fs")?.addEventListener("click", () => {
      const ytBtn = document.querySelector(".ytp-fullscreen-button");
      if (ytBtn) {
        ytBtn.click();
        return;
      }
      const biliBtn = document.querySelector(".bpx-player-ctrl-full") || document.querySelector(".squirtle-video-fullscreen");
      if (biliBtn) {
        biliBtn.click();
        return;
      }
      const video = findActiveVideoElement();
      if (video) {
        if (document.fullscreenElement) {
          document.exitFullscreen?.().catch(() => {});
        } else {
          video.requestFullscreen?.().catch(() => {});
        }
      }
    });

    document.getElementById("cppd-btn-stop")?.addEventListener("click", () => {
      chrome.runtime.sendMessage({ action: "STOP_PLAYLIST" }, () => {
        dockElement?.remove();
      });
    });

    // 點擊數字標籤切換收合/展開
    document.getElementById("cppd-toggle-min")?.addEventListener("click", () => {
      isMinimized = !isMinimized;
      const infoBox = document.getElementById("cppd-info-box");
      const actionsBox = document.getElementById("cppd-actions-box");
      const mainBox = document.getElementById("cppd-main-box");

      if (isMinimized) {
        if (infoBox) infoBox.style.display = "none";
        if (actionsBox) actionsBox.style.display = "none";
        mainBox?.classList.add("cppd-minimized");
      } else {
        if (infoBox) infoBox.style.display = "flex";
        if (actionsBox) actionsBox.style.display = "flex";
        mainBox?.classList.remove("cppd-minimized");
      }
    });

    // 智慧自動隱藏機制：開播顯示 3.5 秒後自動淡出，滑鼠移動或鍵盤按鍵時自動喚醒浮現
    setupDockAutoHide();
  }

  let dockHideTimer = null;
  let isMouseOverDock = false;

  function showDockTemporarily(durationMs = 2800) {
    if (!dockElement) return;
    dockElement.classList.remove("cppd-dock-hidden");

    if (dockHideTimer) clearTimeout(dockHideTimer);
    if (isMouseOverDock) return; // 滑鼠停留在控制器上方時保持可見，永不隱藏

    dockHideTimer = setTimeout(() => {
      if (!isMouseOverDock && dockElement) {
        dockElement.classList.add("cppd-dock-hidden");
      }
    }, durationMs);
  }

  function setupDockAutoHide() {
    if (!dockElement) return;

    // 滑鼠移入控制器時保持可見，移出時重新計時隱藏
    dockElement.addEventListener("mouseenter", () => {
      isMouseOverDock = true;
      if (dockHideTimer) clearTimeout(dockHideTimer);
      dockElement.classList.remove("cppd-dock-hidden");
    });

    dockElement.addEventListener("mouseleave", () => {
      isMouseOverDock = false;
      showDockTemporarily(2000);
    });

    // 視窗全域監聽：滑鼠移動、滑鼠點擊、滾輪滾動、鍵盤按鍵時立即喚醒浮現
    const wakeEvents = ["mousemove", "mousedown", "keydown", "wheel", "touchstart"];
    wakeEvents.forEach((evtName) => {
      window.addEventListener(evtName, () => showDockTemporarily(2800), { passive: true });
    });

    // 影片剛載入開播時：浮現 3.5 秒讓使用者看清當前片名與集數，隨後優雅淡出
    showDockTemporarily(3500);
  }

  /**
   * 監聽網頁內底層 <video> 元素生命週期
   */
  function startVideoWatcher(state) {
    let checkAttempts = 0;
    const maxAttempts = 30; // 最多嘗試 30 秒尋找 video 元素

    const finderInterval = setInterval(() => {
      checkAttempts++;
      const video = findActiveVideoElement();

      if (video) {
        clearInterval(finderInterval);
        bindVideoEvents(video, state);
      } else if (checkAttempts >= maxAttempts) {
        clearInterval(finderInterval);
        console.warn("[稍後觀看播放器] 未能於時限內找到 <video> 標籤");
      }
    }, 1000);
  }

  /**
   * 尋找目前播放中的 video
   */
  function findActiveVideoElement() {
    const ytVideo = document.querySelector("video.html5-main-video");
    if (ytVideo) return ytVideo;

    const biliVideo = document.querySelector(".bpx-player-video-wrap video") || document.querySelector("bwp-video");
    if (biliVideo) return biliVideo;

    return document.querySelector("video");
  }

  let hasMaximizedCurrentVideo = false;

  /**
   * 播放器滿版最大化 (視窗級完全全螢幕 + YouTube 劇院滿版 + B 站官方原生網頁全屏，無黑屏無外框、絕不反覆跳動)
   */
  function maximizePlayer() {
    if (hasMaximizedCurrentVideo) return;

    try {
      // 1. 通知 Background 將 Chrome 瀏覽器視窗切換為全螢幕
      chrome.runtime.sendMessage({ action: "WINDOW_FULLSCREEN" });

      const isYouTube = location.hostname.includes("youtube.com");
      const isBilibili = location.hostname.includes("bilibili.com");

      if (isYouTube) {
        // 套用沉浸式滿版全螢幕樣式：徹底隱藏頂部搜尋列與底部所有標題、按讚與留言
        document.body.classList.add("cppd-theater-active");

        // 頂部 56px 間距強制歸零 (徹底消滅頂部黑邊缺口)
        const pm = document.querySelector("#page-manager, ytd-page-manager");
        if (pm) {
          pm.style.setProperty("margin-top", "0px", "important");
          pm.style.setProperty("padding-top", "0px", "important");
        }
        const flexy = document.querySelector("ytd-watch-flexy");
        if (flexy) {
          flexy.style.setProperty("--ytd-watch-flexy-masthead-height", "0px", "important");
          flexy.style.setProperty("margin-top", "0px", "important");
          flexy.style.setProperty("padding-top", "0px", "important");
        }

        const isTheater = document.querySelector("ytd-watch-flexy[theater]");
        if (!isTheater) {
          const sizeBtn = document.querySelector(".ytp-size-button");
          if (sizeBtn) {
            sizeBtn.click();
            hasMaximizedCurrentVideo = true;
          }
        } else {
          hasMaximizedCurrentVideo = true;
        }
        window.scrollTo(0, 0);
        window.dispatchEvent(new Event("resize"));
      }

      if (isBilibili) {
        document.body.classList.add("cppd-theater-active");
        const isWebFull = document.querySelector(".bpx-player-container[data-screen='web'], .bpx-state-entered, .mode-webfullscreen");
        if (!isWebFull) {
          const biliWebBtn = document.querySelector(
            ".bpx-player-ctrl-web, [aria-label='网页全屏'], .squirtle-video-pagefullscreen, .bilibili-player-video-btn-widescreen"
          );
          if (biliWebBtn) {
            biliWebBtn.click();
            hasMaximizedCurrentVideo = true;
          }
        } else {
          hasMaximizedCurrentVideo = true;
        }
      }
    } catch (e) {
      console.warn("maximizePlayer error:", e);
    }
  }

  // 監聽鍵盤 Esc 鍵，允許使用者隨時退出沉浸式滿版模式
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      document.body.classList.remove("cppd-theater-active");
      const pm = document.querySelector("#page-manager, ytd-page-manager");
      if (pm) {
        pm.style.removeProperty("margin-top");
        pm.style.removeProperty("padding-top");
      }
    }
  });

  /**
   * 平滑啟動全螢幕 (開播後延遲執行單次，徹底終結反覆切換跳動)
   */
  function ensureFullscreen() {
    setTimeout(() => {
      maximizePlayer();
    }, 1200);
  }

  /**
   * 綁定 video 結束事件、進度輪詢、自動開播、全螢幕與初始倍速
   */
  function bindVideoEvents(video, state) {
    setTimeout(() => {
      if (video.paused && !isAdPlaying()) {
        video.play().catch(() => {
          console.log("[稍後觀看播放器] 等待使用者交互以啟動視訊播放");
        });
      }

      // 自動全螢幕 (多次守護觸發，確保影片切換後必定全螢幕)
      if (state?.autoFullscreen !== false) {
        ensureFullscreen();
      }

      // 自動套用指定倍速 (開播時設定一次，相容 Video Speed Controller 之 R/D/S 鍵調整)
      if (state?.autoSpeedEnabled && state?.playbackSpeed) {
        const rate = parseFloat(state.playbackSpeed);
        if (rate > 0 && rate <= 5.0) {
          video.playbackRate = rate;
          console.log(`[稍後觀看播放器] 已自動套用預設播放速度: ${rate}x (可隨時按 R/D/S 鍵調整)`);
        }
      }
    }, 1200);

    // 1. 監聽標準 ended 事件
    video.addEventListener("ended", () => {
      if (!isAdPlaying()) {
        triggerNextVideo("影片標準結束 (ended)");
      }
    });

    // 2. 監聽每秒進度與廣告檢查
    const progressWatchdog = setInterval(() => {
      if (hasTriggeredEnd) {
        clearInterval(progressWatchdog);
        return;
      }

      trySkipYouTubeAd();

      if (isAdPlaying()) return;

      if (video.duration > 3 && video.currentTime >= (video.duration - 0.6)) {
        clearInterval(progressWatchdog);
        triggerNextVideo("視訊進度達到尾端 (progress threshold)");
      }
    }, 800);
  }

  /**
   * 檢查當前是否正在播放廣告 (針對 YouTube)
   */
  function isAdPlaying() {
    return document.querySelector(".ad-showing, .ad-interrupting, .ytp-ad-player-overlay") !== null;
  }

  /**
   * 自動點擊 YouTube 略過廣告按鈕
   */
  function trySkipYouTubeAd() {
    const skipSelectors = [
      ".ytp-ad-skip-button",
      ".ytp-skip-ad-button",
      ".ytp-ad-skip-button-modern",
      "button.ytp-ad-skip-button"
    ];
    for (const sel of skipSelectors) {
      const btn = document.querySelector(sel);
      if (btn && btn.offsetParent !== null) {
        btn.click();
        console.log("[稍後觀看播放器] 自動略過 YouTube 廣告");
        break;
      }
    }
  }

  /**
   * 觸發切換至下一部影片
   */
  function triggerNextVideo(reason) {
    if (hasTriggeredEnd) return;
    hasTriggeredEnd = true;

    console.log(`[稍後觀看播放器] 觸發換片！原因: ${reason}`);

    const nextElem = document.querySelector(".cppd-next");
    if (nextElem) {
      nextElem.textContent = "⌛ 即將為您自動換片，請稍候...";
      nextElem.style.color = "#38bdf8";
    }

    setTimeout(() => {
      chrome.runtime.sendMessage({ action: "VIDEO_ENDED" });
    }, 800);
  }

  function escapeHtml(str) {
    if (!str) return "";
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  // 換影片時自動重新掛載全螢幕與換片監聽 (保證換到下一部影片時重置防抖並再次全螢幕)
  let currentUrl = location.href;
  setInterval(() => {
    if (location.href !== currentUrl) {
      currentUrl = location.href;
      hasTriggeredEnd = false;
      hasMaximizedCurrentVideo = false;
      chrome.runtime.sendMessage({ action: "CHECK_TAB_STATUS" }, (res) => {
        if (res && res.isPlayerTab) {
          initPlayerTabFeatures(res);
          showDockTemporarily(3500);
        }
      });
    }
  }, 1000);

  window.addEventListener("yt-navigate-finish", () => {
    hasTriggeredEnd = false;
    hasMaximizedCurrentVideo = false;
    chrome.runtime.sendMessage({ action: "CHECK_TAB_STATUS" }, (res) => {
      if (res && res.isPlayerTab) {
        initPlayerTabFeatures(res);
        showDockTemporarily(3500);
      }
    });
  });
})();
