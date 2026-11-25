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
  let activeLang = "zh-TW";
  let singleShortBtnState = { url: "", title: "", thumb: "", videoEl: null };
  let isMouseOverShortFloating = false;

  // 依作業系統/使用者偏好載入語言
  if (typeof getCurrentLanguage === "function") {
    getCurrentLanguage().then((l) => { activeLang = l; });
  }

  function ci18n(key, params = {}) {
    return typeof getTranslation === "function" ? getTranslation(activeLang, key, params) : key;
  }

  // 回應 Popup「加入當前分頁」或「呼叫 YouTube 儲存清單面板」指令
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg?.action === "GET_ACTIVE_SHORT_INFO") {
      const st = singleShortBtnState;
      const thumb = st.thumb || captureVideoFrame(st.videoEl);
      const dur = extractShortVideoDuration(st.videoEl || findVisibleCenterVideo(), document);
      sendResponse({
        url: st.url || location.href.split("?")[0],
        title: st.title || document.title,
        thumbnail: thumb || "",
        duration: dur || ""
      });
      return true;
    }

    if (msg?.action === "OPEN_YT_SAVE_PANEL") {
      openYouTubeSavePlaylistPanel();
      sendResponse({ success: true });
      return true;
    }
  });

  // 檢查網址是否帶有 dali_save 參數 (從外掛清單點擊「存至清單」自動叫出 YouTube 原生儲存面板)
  if (
    location.hostname.includes("youtube.com") &&
    (location.search.includes("dali_save") || location.hash.includes("dali_save"))
  ) {
    setTimeout(openYouTubeSavePlaylistPanel, 1200);
    window.addEventListener("yt-navigate-finish", () => {
      setTimeout(openYouTubeSavePlaylistPanel, 800);
    }, { once: true });
  }

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

    // 定時守護進程（每 600ms 輪詢一次，徹底解決 YouTube Polymer 延遲綁定與 TikTok/FB 滑動切換反應）
    setInterval(scanAndInjectButtons, 600);

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
    const isTikTok = location.hostname.includes("tiktok.com");
    const isFacebook = location.hostname.includes("facebook.com");

    if (isYouTube) {
      injectYouTubeCards();
    } else if (isBilibili) {
      injectBilibiliCards();
    } else if (isTikTok) {
      injectTikTokCards();
    } else if (isFacebook) {
      injectFacebookCards();
    }
  }

  /**
   * YouTube 卡片掃描與按鈕注入
   */
  function injectYouTubeCards() {
    // 0. YouTube Shorts 專屬滑動播放頁 (/shorts/...)：使用單一無侵入浮動按鈕貼齊目前播放影片左上角
    if (location.pathname.includes("/shorts/")) {
      const activeVideo = findVisibleCenterVideo();
      const shortsMatch = location.pathname.match(/\/shorts\/([^/?#]+)/);
      if (activeVideo && shortsMatch) {
        const vid = shortsMatch[1];
        const fullUrl = `https://www.youtube.com/shorts/${vid}`;
        const titleEl = document.querySelector(
          "ytd-reel-video-renderer[is-active] h2, ytd-reel-video-renderer[is-active] .title, yt-shorts-video-title-view-model h2, ytd-reel-player-header-renderer .title"
        );
        const title = titleEl?.textContent?.trim() || document.title.replace(/ - YouTube$/, "") || `YouTube Shorts (${vid})`;
        const thumbUrl = `https://i.ytimg.com/vi/${vid}/hqdefault.jpg`;
        updateSingleShortFloatingButton(activeVideo, fullUrl, title, thumbUrl);
      } else {
        updateSingleShortFloatingButton(null, "", "", "");
      }
    } else {
      updateSingleShortFloatingButton(null, "", "", "");
    }

    // 涵蓋 YouTube 所有版面與新舊版渲染器容器 (包含右側推薦欄新版 yt-lockup-view-model 與 Shorts 卡片)
    const cardSelectors = [
      "ytd-rich-item-renderer",
      "ytd-video-renderer",
      "ytd-compact-video-renderer",
      "ytd-grid-video-renderer",
      "ytd-playlist-video-renderer",
      "ytd-reel-item-renderer",
      "ytd-rich-grid-media",
      "ytd-grid-media",
      "yt-lockup-view-model",
      "ytm-shorts-lockup-view-model",
      "ytm-shorts-lockup-view-model-v2",
      "a.ytp-videowall-still"
    ];

    const cards = document.querySelectorAll(cardSelectors.join(","));

    cards.forEach((card) => {
      if (card.querySelector(".cppd-thumb-btn-wrapper")) return;

      // 1. 穿透搜尋影片連結：支援卡片本身就是 <a> (如片尾推薦) 或內部帶有 /watch?v= / /shorts/ 的 <a>
      let linkElem = card.matches("a[href*='/watch?v='], a[href*='/shorts/']")
        ? card
        : card.querySelector("a[href*='/watch?v='], a[href*='/shorts/']");
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

      // 2. 搜尋影片標題與時長 (相容新版 yt-lockup-view-model 與片尾推薦)
      const titleElem = card.querySelector(
        "#video-title, #video-title-link, .yt-lockup-metadata-view-model__title, a.yt-lockup-metadata-view-model-wiz__title, .ytp-videowall-still-info-title, .title, h3 a, h3 span"
      );
      let title = titleElem?.getAttribute("title") || titleElem?.textContent?.trim() || "";
      if (!title) {
        title = linkElem.getAttribute("title") || linkElem.getAttribute("aria-label") || "";
      }

      // 擷取 YouTube 封面上的時長標籤 (相容新版 .yt-badge-shape__text 與舊版 renderer)
      const durationElem = card.querySelector(
        "#overlays ytd-thumbnail-overlay-time-status-renderer #text, span#text.ytd-thumbnail-overlay-time-status-renderer, .yt-badge-shape__text, .badge-shape-wiz__text, ytd-thumbnail-overlay-time-status-renderer, .ytp-videowall-still-info-duration"
      );
      const rawDur = durationElem?.textContent?.trim() || "";
      const duration = /^(?:\d{1,2}:)?\d{1,2}:\d{2}$/.test(rawDur) ? rawDur : "";

      // 擷取 YouTube 封面上的真實縮圖
      const ytImg = card.querySelector("yt-thumbnail-view-model img, ytd-thumbnail img, #thumbnail img, img");
      let thumbUrl = ytImg?.getAttribute("src") || ytImg?.currentSrc || "";

      // 3. 尋找縮圖容器掛載點 (優先鎖定新版 yt-thumbnail-view-model、Shorts 縮圖容器與舊版 ytd-thumbnail)
      const thumbContainer = card.querySelector(
        ".shortsLockupViewModelHostThumbnailContainer, .ytm-shorts-lockup-view-model-wiz__thumbnail-container, yt-thumbnail-view-model, a.yt-lockup-view-model__content-image, ytd-thumbnail, a#thumbnail, #thumbnail, .ytd-thumbnail"
      ) || card;

      // 標記已注入，避免重複處理
      card.dataset.cppdInjected = "true";

      // 建立按鈕元件
      createThumbnailButton(thumbContainer, fullUrl, title, duration, card, thumbUrl);
    });

    // 4. 針對 YouTube 首頁懸停自動預覽播放器 (<ytd-video-preview>) 同步注入按鈕，防止預覽播放時按鈕被覆蓋消失
    syncYouTubeVideoPreview();
  }

  /**
   * 守護 YouTube 首頁全域懸停預覽播放器 (<ytd-video-preview>) 上的「加入稍後連播」按鈕
   */
  function syncYouTubeVideoPreview() {
    const previews = document.querySelectorAll("ytd-video-preview");
    previews.forEach((previewEl) => {
      // 綁定屬性監聽器：一旦 active / playing / style / hidden 變化立即同步，零延遲
      if (!previewEl.dataset.cppdPreviewObserved) {
        previewEl.dataset.cppdPreviewObserved = "true";
        const attrObserver = new MutationObserver(() => {
          syncYouTubeVideoPreview();
        });
        attrObserver.observe(previewEl, {
          attributes: true,
          attributeFilter: ["active", "playing", "hidden", "style", "class"]
        });
      }

      const style = window.getComputedStyle(previewEl);
      const rect = previewEl.getBoundingClientRect();
      const isVisible =
        !previewEl.hasAttribute("hidden") &&
        style.display !== "none" &&
        style.visibility !== "hidden" &&
        parseFloat(style.opacity || "1") > 0 &&
        rect.width >= 120 &&
        rect.height >= 80;

      if (!isVisible) return;

      // 優先從預覽器內部連結取得影片網址，若無則反查目前滑鼠懸停的卡片
      const hoveredCard = document.querySelector(
        "ytd-rich-item-renderer:hover, ytd-rich-grid-media:hover, yt-lockup-view-model:hover, ytd-video-renderer:hover, ytd-grid-video-renderer:hover"
      );
      const previewLink = previewEl.querySelector("a[href*='/watch?v='], a[href*='/shorts/']");
      const cardLink = hoveredCard?.querySelector("a[href*='/watch?v='], a[href*='/shorts/']");
      const href = previewLink?.getAttribute("href") || cardLink?.getAttribute("href") || "";
      if (!href) return;

      const fullUrl = href.startsWith("http") ? href : new URL(href, location.origin).href;
      const cleanUrl = fullUrl.split("&")[0];

      // 擷取標題、時長與縮圖
      const sourceCard = hoveredCard || previewEl;
      const titleElem = sourceCard.querySelector(
        "#video-title, #video-title-link, .yt-lockup-metadata-view-model__title, .title, h3 a, h3 span"
      );
      let title =
        titleElem?.getAttribute("title") ||
        titleElem?.textContent?.trim() ||
        previewLink?.getAttribute("aria-label") ||
        previewLink?.getAttribute("title") ||
        cardLink?.getAttribute("title") ||
        "YouTube 影片";

      const durationElem = sourceCard.querySelector(
        "#overlays ytd-thumbnail-overlay-time-status-renderer #text, span#text.ytd-thumbnail-overlay-time-status-renderer, .yt-badge-shape__text, ytd-thumbnail-overlay-time-status-renderer"
      );
      const rawDur = durationElem?.textContent?.trim() || "";
      const duration = /^(?:\d{1,2}:)?\d{1,2}:\d{2}$/.test(rawDur) ? rawDur : "";

      const ytImg = sourceCard.querySelector("yt-thumbnail-view-model img, ytd-thumbnail img, #thumbnail img, img");
      const thumbUrl = ytImg?.getAttribute("src") || ytImg?.currentSrc || "";

      // 掛載容器：優先鎖定 #video-preview-container 或 #media-container，退而求其次為 previewEl 本身
      const targetContainer =
        previewEl.querySelector("#video-preview-container, #media-container") || previewEl;

      let existingWrapper = targetContainer.querySelector(":scope > .cppd-thumb-btn-wrapper") || previewEl.querySelector(".cppd-thumb-btn-wrapper");
      if (existingWrapper && existingWrapper.dataset.cppdUrl !== cleanUrl) {
        existingWrapper.remove();
        existingWrapper = null;
      }

      if (!existingWrapper) {
        createThumbnailButton(targetContainer, cleanUrl, title, duration, sourceCard, thumbUrl);
        existingWrapper = targetContainer.querySelector(":scope > .cppd-thumb-btn-wrapper");
        if (existingWrapper) {
          existingWrapper.dataset.cppdUrl = cleanUrl;
        }
      }

      if (existingWrapper) {
        existingWrapper.style.setProperty("display", "block", "important");
        existingWrapper.style.setProperty("visibility", "visible", "important");
        existingWrapper.style.setProperty("opacity", "1", "important");
        existingWrapper.style.setProperty("z-index", "2147483640", "important");
        if (targetContainer.lastElementChild !== existingWrapper) {
          targetContainer.appendChild(existingWrapper);
        }
      }
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
      if (card.querySelector(".cppd-thumb-btn-wrapper")) return;

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
   * 嘗試從 <video> 擷取即時畫面縮圖 (JPEG DataURL，供 TikTok / FB Reels 使用)
   */
  function captureVideoFrame(container) {
    try {
      const video = container?.querySelector("video") || (container?.tagName === "VIDEO" ? container : null);
      if (!video) return "";
      if (video.poster && !video.poster.startsWith("data:")) return video.poster;
      if (video.readyState < 2 || video.videoWidth === 0) return "";

      const w = 160;
      const h = Math.max(90, Math.round((video.videoHeight / video.videoWidth) * w));
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(video, 0, 0, w, h);
      return canvas.toDataURL("image/jpeg", 0.7);
    } catch (e) {
      return "";
    }
  }

  /**
   * 將秒數轉換為 MM:SS 或 H:MM:SS 格式
   */
  function formatSecondsToTimeStr(sec) {
    if (!Number.isFinite(sec) || sec <= 0) return "";
    const total = Math.round(sec);
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    const sStr = s < 10 ? `0${s}` : `${s}`;
    return h > 0 ? `${h}:${m < 10 ? "0" : ""}${m}:${sStr}` : `${m}:${sStr}`;
  }

  /**
   * 讀取短片 <video> 元素的真實總片長 (支援 TikTok 與 Facebook Reels)
   */
  function extractShortVideoDuration(videoEl, rootEl) {
    try {
      const targetVideo = videoEl || findVisibleCenterVideo();
      if (targetVideo && Number.isFinite(targetVideo.duration) && targetVideo.duration > 0) {
        return formatSecondsToTimeStr(targetVideo.duration);
      }

      // 備援：從頁面上常見的時間指示文字提取總長度 (如 "00:12 / 00:45")
      const scope = rootEl || document;
      const candidates = scope.querySelectorAll(
        "[data-e2e='video-duration'], [class*='SeekBarTime'], [class*='TimeContainer'], [class*='duration'], span, div"
      );
      for (const el of candidates) {
        if (el.children.length > 0) continue;
        const txt = (el.textContent || "").trim();
        if (!txt || txt.length > 22) continue;
        // 若是 "0:10 / 0:45" 取斜線後方的總長
        const slashMatch = txt.match(/^\d{1,2}:\d{2}\s*\/\s*((?:\d{1,2}:)?\d{1,2}:\d{2})$/);
        if (slashMatch) return slashMatch[1];
      }
    } catch (e) {}
    return "";
  }

  /**
   * 找到目前畫面正中央 / 正在播放的單一主 <video>（不改動平台內部 DOM）
   */
  function findVisibleCenterVideo() {
    const videos = Array.from(document.querySelectorAll("video"));
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let best = null;
    let bestScore = -Infinity;

    for (const v of videos) {
      const rect = v.getBoundingClientRect();
      if (rect.width < 100 || rect.height < 100) continue;
      if (rect.bottom < 20 || rect.top > vh - 20 || rect.right < 20 || rect.left > vw - 20) continue;
      const style = window.getComputedStyle(v);
      if (style.display === "none" || style.visibility === "hidden") continue;

      // 計算距離螢幕中心的接近程度，正在播放的優先 (支援任何長寬比與暫停中影片)
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dist = Math.hypot(cx - vw / 2, cy - vh / 2);
      const score = (v.paused ? 0 : 10000) - dist;
      if (score > bestScore) {
        bestScore = score;
        best = v;
      }
    }

    // 備援：若平台將 <video> 置於 Shadow DOM 或隱藏渲染，改以可見的 feed-video 容器定位
    if (!best && location.hostname.includes("tiktok.com")) {
      const containers = Array.from(document.querySelectorAll("[data-e2e='feed-video'], [data-e2e='recommend-list-item-container']"));
      for (const c of containers) {
        const rect = c.getBoundingClientRect();
        if (rect.width < 150 || rect.height < 150) continue;
        if (rect.bottom < 50 || rect.top > vh - 50) continue;
        const cy = rect.top + rect.height / 2;
        const dist = Math.abs(cy - vh / 2);
        const score = 5000 - dist;
        if (score > bestScore) {
          bestScore = score;
          best = c;
        }
      }
    }

    return best;
  }

  /**
   * 掛載於 document.body 的單一無侵入浮動加入按鈕 (專用於 TikTok / FB Reels / Shorts)
   */
  function updateSingleShortFloatingButton(videoEl, fullUrl, title, thumbUrl) {
    let wrapper = document.getElementById("cppd-short-floating-wrapper");
    if (!videoEl || !fullUrl) {
      if (wrapper) {
        wrapper.style.display = "none";
        wrapper.classList.add("cppd-playing-hidden");
      }
      return;
    }

    const rect = videoEl.getBoundingClientRect();
    if (!wrapper) {
      wrapper = document.createElement("div");
      wrapper.id = "cppd-short-floating-wrapper";

      const btn = document.createElement("button");
      btn.id = "cppd-short-floating-btn";
      btn.className = "cppd-thumb-add-btn";

      const sp = document.createElement("span");
      sp.textContent = "➕";
      btn.replaceChildren(sp, document.createTextNode(" " + ci18n("btnWatchLater")));
      btn.title = ci18n("btnWatchLaterTitle");

      ["mousedown", "mouseup", "pointerdown", "pointerup", "touchstart", "touchend"].forEach((evt) => {
        btn.addEventListener(evt, (e) => e.stopPropagation());
      });

      btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (btn.classList.contains("cppd-added")) return;

        const st = singleShortBtnState;
        const thumb = st.thumb || captureVideoFrame(st.videoEl);
        const dur = extractShortVideoDuration(st.videoEl, document);

        try {
          chrome.runtime.sendMessage(
            { action: "PARSE_AND_ADD", url: st.url, title: st.title, duration: dur, thumbnail: thumb },
            (res) => {
              if (chrome.runtime.lastError || !res || !res.success) {
                btn.classList.remove("cppd-added");
                const spRetry = document.createElement("span");
                spRetry.textContent = "➕";
                btn.replaceChildren(spRetry, document.createTextNode(" " + ci18n("btnWatchLater")));
                showToast(chrome.runtime.lastError ? ci18n("toastNeedReload") : (res?.error || "加入失敗"));
                return;
              }
              btn.classList.add("cppd-added");
              const spOk = document.createElement("span");
              spOk.textContent = "✓";
              btn.replaceChildren(spOk, document.createTextNode(" " + ci18n("btnWatchLaterAdded")));
              btn.title = ci18n("btnWatchLaterInList");
              const finalTitle = res?.item?.title || st.title || "Video";
              showToast(ci18n("toastAdded", { title: finalTitle }));
            }
          );
        } catch (err) {
          btn.classList.remove("cppd-added");
          showToast(ci18n("toastNeedReload"));
        }
      });

      // 滑鼠懸停守護：滑鼠移入時暫時顯示，移出且播放時自動消失
      wrapper.addEventListener("mouseenter", () => {
        isMouseOverShortFloating = true;
        wrapper.classList.remove("cppd-playing-hidden");
      });
      wrapper.addEventListener("mouseleave", () => {
        isMouseOverShortFloating = false;
        if (singleShortBtnState.videoEl && !singleShortBtnState.videoEl.paused && !singleShortBtnState.videoEl.ended) {
          wrapper.classList.add("cppd-playing-hidden");
        }
      });

      wrapper.appendChild(btn);
      document.body.appendChild(wrapper);
    }

    // 綁定 videoEl 播放與暫停事件 (Facebook Reels 保持常駐不消失，其他平台播放中自動消失)
    if (videoEl && videoEl.tagName === "VIDEO" && !videoEl.dataset.cppdBoundPlayback) {
      videoEl.dataset.cppdBoundPlayback = "true";
      const syncPlayState = () => {
        const wrap = document.getElementById("cppd-short-floating-wrapper");
        if (!wrap) return;
        const isFB = location.hostname.includes("facebook.com") && location.pathname.includes("/reel");
        if (isFB) {
          wrap.classList.remove("cppd-playing-hidden");
          return;
        }
        if (!videoEl.paused && !videoEl.ended) {
          if (!isMouseOverShortFloating) {
            wrap.classList.add("cppd-playing-hidden");
          }
        } else {
          wrap.classList.remove("cppd-playing-hidden");
        }
      };

      videoEl.addEventListener("play", syncPlayState);
      videoEl.addEventListener("playing", syncPlayState);
      videoEl.addEventListener("pause", syncPlayState);
      videoEl.addEventListener("ended", syncPlayState);
      videoEl.addEventListener("timeupdate", syncPlayState);
    }

    // 若切換到了不同的短片網址，重設按鈕為「➕ 稍後連播」
    const btn = document.getElementById("cppd-short-floating-btn");
    if (singleShortBtnState.url !== fullUrl && btn) {
      btn.classList.remove("cppd-added");
      const sp = document.createElement("span");
      sp.textContent = "➕";
      btn.replaceChildren(sp, document.createTextNode(" " + ci18n("btnWatchLater")));
      btn.title = ci18n("btnWatchLaterTitle");
    }

    singleShortBtnState = { url: fullUrl, title, thumb: thumbUrl, videoEl };

    // Facebook Reels 專屬置中定位：避免遮擋左上方音量鍵，自動精準錨定於影片正上方正中間
    const isFBReels = location.hostname.includes("facebook.com") && location.pathname.includes("/reel");
    wrapper.style.setProperty("display", "block", "important");
    wrapper.style.setProperty("position", "fixed", "important");
    wrapper.style.setProperty("z-index", "2147483647", "important");

    if (isFBReels) {
      const centerX = Math.round(rect.left + rect.width / 2);
      wrapper.style.setProperty("left", `${centerX}px`, "important");
      wrapper.style.setProperty("transform", "translateX(-50%)", "important");
      wrapper.style.setProperty("top", `${Math.max(14, Math.round(rect.top + 14))}px`, "important");
      // Facebook Reels 依指示：播放時不要消失，維持常駐
      wrapper.classList.remove("cppd-playing-hidden");
    } else {
      const isTT = location.hostname.includes("tiktok.com");
      const leftOffset = isTT && rect.width > 260 ? 48 : 14;
      wrapper.style.setProperty("left", `${Math.max(12, Math.round(rect.left + leftOffset))}px`, "important");
      wrapper.style.setProperty("transform", "none", "important");
      wrapper.style.setProperty("top", `${Math.max(12, Math.round(rect.top + 12))}px`, "important");

      // 其他平台播放中自動消失隱藏；暫停時自動顯示
      const isPlaying = videoEl.tagName === "VIDEO" ? (!videoEl.paused && !videoEl.ended) : false;
      if (isPlaying && !isMouseOverShortFloating) {
        wrapper.classList.add("cppd-playing-hidden");
      } else {
        wrapper.classList.remove("cppd-playing-hidden");
      }
    }
  }

  /**
   * TikTok 卡片與滑動影片注入 (無侵入單一浮動按鈕 + 個人頁格狀縮圖)
   */
  function injectTikTokCards() {
    // 1. 推薦流 / 單支影片：僅針對畫面中心唯一的主 <video> 顯示左上角按鈕，絕不碰播放器內部 DOM
    const activeVideo = findVisibleCenterVideo();
    if (activeVideo) {
      const article =
        activeVideo.closest("article, [data-e2e='recommend-list-item-container'], [data-e2e='feed-video'], div[class*='DivItemContainer']") ||
        activeVideo.parentElement?.parentElement ||
        document;

      let fullUrl = "";
      const linkElem = article.querySelector("a[href*='/video/']");
      if (linkElem) {
        const href = linkElem.getAttribute("href");
        if (href) fullUrl = href.startsWith("http") ? href : new URL(href, location.origin).href;
      } else if (location.pathname.includes("/video/")) {
        fullUrl = location.href.split("?")[0];
      } else {
        // 廣度搜尋任何包含 17~21 位數字影片 ID 的元素 id（新版 TikTok 推薦流）
        const authorHref = article.querySelector("a[href^='/@']")?.getAttribute("href")?.split("?")[0] || "/@i";
        const idHolder =
          activeVideo.closest("[id]") ||
          article.querySelector("[id*='xgwrapper'], [id*='video']");
        let vidMatch = idHolder?.id?.match(/(\d{17,21})/);
        if (!vidMatch) {
          const allWithId = article.querySelectorAll("[id]");
          for (const el of allWithId) {
            const m = el.id.match(/(\d{17,21})/);
            if (m) {
              vidMatch = m;
              break;
            }
          }
        }
        if (vidMatch) {
          fullUrl = `https://www.tiktok.com${authorHref}/video/${vidMatch[1]}`;
        } else {
          // 檢查 canonical 或直接使用作者/當前頁網址作為保底，確保按鈕必現
          const canonical = document.querySelector("link[rel='canonical']")?.getAttribute("href") || "";
          if (canonical.includes("/video/")) {
            fullUrl = canonical.split("?")[0];
          } else {
            fullUrl = authorHref !== "/@i" ? `https://www.tiktok.com${authorHref}` : location.href.split("?")[0];
          }
        }
      }

      const titleEl = article.querySelector("[data-e2e='video-desc'], [data-e2e='browse-video-desc'], [data-e2e='search-card-desc']");
      const title = titleEl?.textContent?.trim() || document.title.replace(/\s*\|\s*TikTok$/, "") || "TikTok 影片";

      // 優先尋找非頭像的大型封面圖，若無則讀取 video.poster
      let thumbUrl = activeVideo.poster || "";
      if (!thumbUrl) {
        const imgs = article.querySelectorAll("img");
        for (const im of imgs) {
          if (im.clientWidth >= 100 && im.clientHeight >= 100 && im.src && !im.src.startsWith("data:")) {
            thumbUrl = im.src;
            break;
          }
        }
      }
      updateSingleShortFloatingButton(activeVideo, fullUrl.split("?")[0], title, thumbUrl);
      return;
    }

    // 2. 個人主頁 / 搜尋頁 / 探索頁縮圖格狀卡片 (無主播放影片時)
    updateSingleShortFloatingButton(null, "", "", "");
    const gridCards = document.querySelectorAll("[data-e2e='user-post-item'], [data-e2e='search_top-item'], [data-e2e='explore-item']");
    gridCards.forEach((card) => {
      if (card.dataset.cppdInjected) return;
      if (card.querySelector("video")) return; // 略過動態播放器以免影響播放
      const linkElem = card.querySelector("a[href*='/video/']");
      const imgElem = card.querySelector("img");
      if (!linkElem || !imgElem || imgElem.clientWidth < 80) return;

      const href = linkElem.getAttribute("href");
      const fullUrl = href.startsWith("http") ? href : new URL(href, location.origin).href;
      const thumbContainer = imgElem.parentElement || card;
      if (thumbContainer.querySelector(".cppd-thumb-btn-wrapper")) return;

      const title =
        card.querySelector("[data-e2e='video-desc'], [data-e2e='search-card-desc']")?.textContent?.trim() ||
        imgElem.getAttribute("alt") ||
        "TikTok 影片";
      const thumbUrl = imgElem.getAttribute("src") || "";

      card.dataset.cppdInjected = "true";
      createThumbnailButton(thumbContainer, fullUrl.split("?")[0], title, "", card, thumbUrl);
    });
  }

  /**
   * Facebook Reels / Watch 影片注入 (無侵入單一浮動按鈕，絕不洗版也不影響播放)
   */
  function injectFacebookCards() {
    // 1. Reels 獨立/滑動檢視模式 (/reel/... 或 /reels/...)：僅對畫面中心唯一的主 <video> 顯示中央置頂按鈕
    if (location.pathname.includes("/reel")) {
      const activeVideo = findVisibleCenterVideo();
      if (activeVideo) {
        const cleanUrl = location.href.split("?")[0];
        const title = document.title && document.title !== "Facebook" ? document.title.replace(/\s*\|\s*Facebook$/, "") : "Facebook Reels";
        const poster = activeVideo.poster || "";
        updateSingleShortFloatingButton(activeVideo, cleanUrl, title, poster);
      } else {
        updateSingleShortFloatingButton(null, "", "", "");
      }
      return;
    }

    // 2. Facebook 動態時報 / Watch 列表：掛載於每個 Reel 卡片上，縮圖動畫預覽播放時保證常駐不消失且置頂可點
    updateSingleShortFloatingButton(null, "", "", "");
    const links = document.querySelectorAll("a[href*='/reel/'], a[href*='/watch/?v=']");
    links.forEach((linkElem) => {
      const href = linkElem.getAttribute("href");
      if (!href || href.includes("comment_id=")) return;

      // 檢查卡片尺寸：包含 video 或 img，或 linkElem 本身具備卡片大小（寬度>=90, 高度>=100）
      const mediaEl = linkElem.querySelector("video, img");
      const rect = mediaEl ? mediaEl.getBoundingClientRect() : linkElem.getBoundingClientRect();
      const linkRect = linkElem.getBoundingClientRect();
      const w = Math.max(rect.width, linkRect.width);
      const h = Math.max(rect.height, linkRect.height);
      if (w < 90 || h < 100) return;

      const fullUrl = href.startsWith("http") ? href : new URL(href, location.origin).href;
      const cleanUrl = fullUrl.split("?")[0].split("&")[0];

      // 擷取標題
      let title = linkElem.getAttribute("aria-label") || "";
      if (!title) {
        const titleEl = linkElem.querySelector("span, div[dir='auto'], strong");
        title = titleEl?.textContent?.trim() || "";
      }
      const imgEl = linkElem.querySelector("img");
      if (!title && imgEl) {
        title = imgEl.getAttribute("alt") || "";
      }
      if (!title) {
        title = "Facebook Reels";
      }

      // 擷取封面縮圖
      let thumbUrl = imgEl?.getAttribute("src") || "";

      // 確保 linkElem 具有相對定位上下文
      if (window.getComputedStyle(linkElem).position === "static") {
        linkElem.style.position = "relative";
      }

      // 檢查 linkElem 內是否已有按鈕
      let existingWrapper = linkElem.querySelector(".cppd-thumb-btn-wrapper");
      if (existingWrapper) {
        // 若之前被掛在內部將被隱藏的 img.parentElement，提昇至 linkElem 本身
        if (existingWrapper.parentElement !== linkElem) {
          linkElem.appendChild(existingWrapper);
        }
        // 強制可見與置頂
        existingWrapper.style.setProperty("display", "block", "important");
        existingWrapper.style.setProperty("visibility", "visible", "important");
        existingWrapper.style.setProperty("opacity", "1", "important");
        existingWrapper.style.setProperty("z-index", "2147483640", "important");

        // 若 Facebook 預覽播放時動態掛載了 <video> 或覆蓋層，移至最末子元素維持最高堆疊順序
        if (linkElem.lastElementChild !== existingWrapper) {
          linkElem.appendChild(existingWrapper);
        }
      } else {
        // 直接將按鈕注入於 linkElem（確保縮圖動畫播放時絕不隨 img 被移除或隱藏）
        createThumbnailButton(linkElem, cleanUrl, title, "", linkElem, thumbUrl);
      }

      // 綁定卡片 hover 與即時播放監聽，確保滑鼠移入或影片開始播放時按鈕 100% 常駐且置頂
      if (!linkElem.dataset.cppdReelBound) {
        linkElem.dataset.cppdReelBound = "true";

        const keepBtnAlive = () => {
          let btnWrap = linkElem.querySelector(".cppd-thumb-btn-wrapper");
          if (!btnWrap) {
            createThumbnailButton(linkElem, cleanUrl, title, "", linkElem, thumbUrl);
            btnWrap = linkElem.querySelector(".cppd-thumb-btn-wrapper");
          }
          if (btnWrap) {
            btnWrap.style.setProperty("display", "block", "important");
            btnWrap.style.setProperty("visibility", "visible", "important");
            btnWrap.style.setProperty("opacity", "1", "important");
            btnWrap.style.setProperty("z-index", "2147483640", "important");
            if (linkElem.lastElementChild !== btnWrap) {
              linkElem.appendChild(btnWrap);
            }
          }
        };

        linkElem.addEventListener("mouseenter", keepBtnAlive, { passive: true });
        linkElem.addEventListener("mouseover", keepBtnAlive, { passive: true });
      }

      // 針對卡片內部產生的 <video> 監聽 play/playing 事件
      const cardVideo = linkElem.querySelector("video");
      if (cardVideo && !cardVideo.dataset.cppdCardPlayBound) {
        cardVideo.dataset.cppdCardPlayBound = "true";
        const onVideoPlay = () => {
          let btnWrap = linkElem.querySelector(".cppd-thumb-btn-wrapper");
          if (!btnWrap) {
            createThumbnailButton(linkElem, cleanUrl, title, "", linkElem, thumbUrl);
            btnWrap = linkElem.querySelector(".cppd-thumb-btn-wrapper");
          }
          if (btnWrap) {
            btnWrap.style.setProperty("display", "block", "important");
            btnWrap.style.setProperty("visibility", "visible", "important");
            btnWrap.style.setProperty("opacity", "1", "important");
            btnWrap.style.setProperty("z-index", "2147483640", "important");
            if (linkElem.lastElementChild !== btnWrap) {
              linkElem.appendChild(btnWrap);
            }
          }
        };
        cardVideo.addEventListener("play", onVideoPlay, { passive: true });
        cardVideo.addEventListener("playing", onVideoPlay, { passive: true });
      }
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

    function setBtnLabel(el, icon, text) {
      const sp = document.createElement("span");
      sp.textContent = icon;
      el.replaceChildren(sp, document.createTextNode(" " + text));
    }

    const btn = document.createElement("button");
    btn.className = "cppd-thumb-add-btn";
    setBtnLabel(btn, "➕", ci18n("btnWatchLater"));
    btn.title = ci18n("btnWatchLaterTitle");

    // 徹底防穿透：在 wrapper 與 btn 上精確阻斷所有會觸發 YouTube/B 站/FB 底層跳轉的指針與滑鼠事件冒泡
    const stopEvents = ["mousedown", "mouseup", "pointerdown", "pointerup", "touchstart", "touchend"];
    stopEvents.forEach((evtName) => {
      wrapper.addEventListener(evtName, (e) => {
        e.stopPropagation();
      });
      btn.addEventListener(evtName, (e) => {
        e.stopPropagation();
      });
    });
    wrapper.addEventListener("click", (e) => {
      e.stopPropagation();
    });

    // 核心點擊處理函式：阻止默認跳轉並執行加入清單邏輯
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();

      if (btn.classList.contains("cppd-added")) return;

      btn.classList.add("cppd-added");
      setBtnLabel(btn, "✓", ci18n("btnWatchLaterAdded"));
      btn.title = ci18n("btnWatchLaterInList");

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

      // 點擊當下動態複查最新封面縮圖 (優先擷取 <img>，若無則直接從 <video> 截取即時畫面幀)
      let finalThumb = videoThumb;
      if (!finalThumb && card) {
        const img = card.querySelector(".bili-video-card__image--wrap img, picture img, ytd-thumbnail img, img");
        let src = img?.getAttribute("src") || img?.getAttribute("data-src") || "";
        if (src.startsWith("//")) src = "https:" + src;
        else if (src.startsWith("http://")) src = src.replace("http://", "https://");
        if (src && !src.includes("data:image")) finalThumb = src;
      }
      if (!finalThumb) {
        finalThumb = captureVideoFrame(card || container);
      }

      // 呼叫 Background 加入清單（附帶時長與縮圖）
      try {
        chrome.runtime.sendMessage(
          { action: "PARSE_AND_ADD", url: videoUrl, title: videoTitle, duration: finalDuration, thumbnail: finalThumb },
          (res) => {
            if (chrome.runtime.lastError) {
              console.warn("sendMessage error:", chrome.runtime.lastError);
              btn.classList.remove("cppd-added");
              setBtnLabel(btn, "➕", ci18n("btnWatchLater"));
              showToast(ci18n("toastNeedReload"));
              return;
            }
            const finalTitle = res?.item?.title || videoTitle || "影片";
            showToast(ci18n("toastAdded", { title: finalTitle }));
          }
        );
      } catch (err) {
        btn.classList.remove("cppd-added");
        setBtnLabel(btn, "➕", ci18n("btnWatchLater"));
        showToast(ci18n("toastNeedReload"));
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

    const iconSpan = document.createElement("span");
    iconSpan.className = "cppd-toast-icon";
    iconSpan.textContent = "✓";
    const msgSpan = document.createElement("span");
    msgSpan.textContent = message;
    toast.replaceChildren(iconSpan, document.createTextNode(" "), msgSpan);
    toast.classList.add("show");

    if (toastTimeout) clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => {
      toast.classList.remove("show");
    }, 2400);
  }

  /**
   * 自動尋找並觸發 YouTube 原生「儲存至播放清單」面板 (截圖 42)
   */
  function openYouTubeSavePlaylistPanel() {
    if (!location.hostname.includes("youtube.com")) return;

    // 1. 若已經開啟儲存彈窗，提示即可
    const existingDialog = document.querySelector(
      "ytd-add-to-playlist-renderer, tp-yt-paper-dialog[aria-label*='儲存'], tp-yt-paper-dialog[aria-label*='Save']"
    );
    if (existingDialog && existingDialog.offsetParent !== null) {
      showToast(ci18n("ytSavePanelOpened"));
      return;
    }

    let attempts = 0;
    const maxAttempts = 24; // 約 8 秒持續重試以應對 SPA 動態渲染

    const poller = setInterval(() => {
      attempts++;

      // 檢查直接露出的「儲存」按鈕 (包含各國語言與各種 YouTube 樣式)
      const directButtons = document.querySelectorAll(
        "ytd-watch-metadata button, #top-level-buttons-computed button, ytd-menu-renderer button"
      );
      for (const btn of directButtons) {
        const aria = (btn.getAttribute("aria-label") || "").toLowerCase();
        const txt = (btn.textContent || "").toLowerCase();
        if (
          aria.includes("儲存至播放清單") ||
          aria.includes("save to playlist") ||
          aria.includes("儲存") ||
          aria.includes("save") ||
          txt.includes("儲存") ||
          txt.includes("save")
        ) {
          clearInterval(poller);
          btn.click();
          showToast(ci18n("ytSavePanelOpened"));
          return;
        }
      }

      // 檢查具有播放清單圖示的按鈕 (playlist / add_to_playlist)
      const icons = document.querySelectorAll(
        "ytd-watch-metadata yt-icon, #top-level-buttons-computed yt-icon"
      );
      for (const icon of icons) {
        const iconType = icon.getAttribute("icon") || "";
        if (iconType.includes("playlist") || iconType.includes("add_to_playlist")) {
          const b = icon.closest("button");
          if (b && b.offsetParent !== null) {
            clearInterval(poller);
            b.click();
            showToast(ci18n("ytSavePanelOpened"));
            return;
          }
        }
      }

      // 嘗試展開「更多操作 (...)」選單並尋找儲存項目
      const overflowBtn = document.querySelector(
        "ytd-watch-metadata ytd-menu-renderer ytd-menu-overflow-button-renderer button, " +
        "#top-level-buttons-computed ytd-menu-overflow-button-renderer button, " +
        "ytd-watch-metadata button[aria-label*='更多操作'], " +
        "ytd-watch-metadata button[aria-label*='更多'], " +
        "ytd-watch-metadata button[aria-label*='More actions'], " +
        "#top-level-buttons-computed button[aria-label*='更多'], " +
        "#top-level-buttons-computed button[aria-label*='More actions']"
      );

      if (overflowBtn && overflowBtn.offsetParent !== null) {
        overflowBtn.click();
        setTimeout(() => {
          const menuItems = document.querySelectorAll(
            "ytd-menu-service-item-renderer, tp-yt-paper-item, ytd-menu-navigation-item-renderer, yt-list-item-view-model"
          );
          for (const item of menuItems) {
            const tText = (item.textContent || "").trim();
            const aText = (item.getAttribute("aria-label") || "").trim();
            if (tText.includes("儲存") || tText.includes("Save") || aText.includes("儲存") || aText.includes("Save")) {
              item.click();
              clearInterval(poller);
              showToast(ci18n("ytSavePanelOpened"));
              return;
            }
          }
        }, 250);
      }

      if (attempts >= maxAttempts) {
        clearInterval(poller);
      }
    }, 350);
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
    const nextTitle = state.nextItem ? ci18n("dockNext", { title: state.nextItem.title }) : ci18n("dockLastVideo");
    const currentNum = (state.currentIndex || 0) + 1;
    const totalNum = state.total || 1;

    const mainBox = document.createElement("div");
    mainBox.className = "cppd-container";
    mainBox.id = "cppd-main-box";

    const badge = document.createElement("div");
    badge.className = "cppd-badge";
    badge.id = "cppd-toggle-min";
    badge.title = ci18n("dockToggleTitle");
    const pulseDot = document.createElement("span");
    pulseDot.className = "cppd-pulse-dot";
    const countSpan = document.createElement("span");
    countSpan.textContent = `${currentNum} / ${totalNum}`;
    badge.append(pulseDot, countSpan);

    const infoBox = document.createElement("div");
    infoBox.className = "cppd-info";
    infoBox.id = "cppd-info-box";
    const titleDiv = document.createElement("div");
    titleDiv.className = "cppd-title";
    titleDiv.title = currentTitle;
    titleDiv.textContent = currentTitle;
    const nextDiv = document.createElement("div");
    nextDiv.className = "cppd-next";
    nextDiv.title = nextTitle;
    nextDiv.textContent = nextTitle;
    infoBox.append(titleDiv, nextDiv);

    const actionsBox = document.createElement("div");
    actionsBox.className = "cppd-actions";
    actionsBox.id = "cppd-actions-box";

    const makeDockBtn = (id, className, title, text) => {
      const b = document.createElement("button");
      b.className = className;
      b.id = id;
      b.title = title;
      b.textContent = text;
      return b;
    };

    actionsBox.append(
      makeDockBtn("cppd-btn-prev", "cppd-btn", ci18n("dockPrevTitle"), "⏮"),
      makeDockBtn("cppd-btn-next", "cppd-btn", ci18n("dockNextTitle"), "⏭"),
      makeDockBtn("cppd-btn-fs", "cppd-btn", ci18n("dockFsTitle"), "⛶"),
      makeDockBtn("cppd-btn-stop", "cppd-btn cppd-btn-stop", ci18n("dockStopTitle"), "⏹")
    );

    mainBox.append(badge, infoBox, actionsBox);
    dockElement.appendChild(mainBox);

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
   * 自動解除 TikTok / Facebook Reels 靜音並開啟音量
   */
  function tryUnmuteShortVideo(video) {
    if (!video) return;
    try {
      if (video.muted) {
        video.muted = false;
      }
      if (video.volume < 0.1) {
        video.volume = 1.0;
      }

      // 1. Facebook Reels 解除靜音按鈕
      if (location.hostname.includes("facebook.com")) {
        const fbUnmuteSelectors = [
          "[aria-label='Unmute']",
          "[aria-label='取消靜音']",
          "[aria-label='取消静音']",
          "[aria-label='開啟音效']",
          "[aria-label='Turn on sound']",
          "div[role='button'][aria-label*='Unmute']",
          "div[role='button'][aria-label*='取消靜音']",
          "div[role='button'][aria-label*='取消静音']"
        ];
        for (const sel of fbUnmuteSelectors) {
          const btn = document.querySelector(sel);
          if (btn && btn.offsetParent !== null) {
            btn.click();
            break;
          }
        }
      }

      // 2. TikTok 解除靜音按鈕 (僅在目前處於靜音狀態時點擊，避免誤關聲音)
      if (location.hostname.includes("tiktok.com")) {
        const ttSoundBtn = document.querySelector("[data-e2e='video-sound'], button[aria-label*='Unmute'], button[aria-label*='取消靜音'], button[aria-label*='取消静音']");
        if (ttSoundBtn) {
          const label = (ttSoundBtn.getAttribute("aria-label") || "").toLowerCase();
          const isCurrentlyMuted = video.muted || label.includes("unmute") || label.includes("取消靜音") || label.includes("取消静音");
          if (isCurrentlyMuted) {
            ttSoundBtn.click();
          }
        }
      }
    } catch (e) {
      console.warn("tryUnmuteShortVideo error:", e);
    }
  }

  /**
   * 綁定 video 結束事件、進度輪詢、自動開播、全螢幕與初始倍速
   */
  function bindVideoEvents(video, state) {
    const isShortPlatform =
      location.hostname.includes("tiktok.com") ||
      location.hostname.includes("facebook.com") ||
      location.pathname.includes("/shorts/");

    // TikTok 與 Facebook Reels 預設為循環播放且常預設靜音：在連播模式下自動解除靜音、開啟音量並關閉循環
    if (isShortPlatform) {
      video.loop = false;
      tryUnmuteShortVideo(video);

      // 防止平台腳本在載入後數秒內又把影片設回靜音，前 3 秒守護解除靜音
      let unmuteChecks = 0;
      const unmuteGuard = setInterval(() => {
        unmuteChecks++;
        if (video.muted || video.volume < 0.1) {
          tryUnmuteShortVideo(video);
        }
        if (unmuteChecks >= 6) {
          clearInterval(unmuteGuard);
        }
      }, 500);
    }

    setTimeout(() => {
      if (video.paused && !isAdPlaying()) {
        video.play().catch(() => {
          // 若瀏覽器阻擋有聲自動播放，先靜音開播並在首次互動後立刻開啟聲音
          video.muted = true;
          video.play().catch(() => {
            console.log("[稍後觀看播放器] 等待使用者交互以啟動視訊播放");
          });
          if (isShortPlatform) {
            const unmuteOnInteract = () => {
              tryUnmuteShortVideo(video);
              window.removeEventListener("click", unmuteOnInteract);
              window.removeEventListener("keydown", unmuteOnInteract);
            };
            window.addEventListener("click", unmuteOnInteract, { once: true });
            window.addEventListener("keydown", unmuteOnInteract, { once: true });
          }
        });
      }

      // 自動全螢幕 (TikTok 與 Facebook Reels 依需求不強制全螢幕，僅 YouTube 與 B站啟用)
      if (state?.autoFullscreen !== false && !isShortPlatform) {
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
      nextElem.textContent = ci18n("dockSwitching");
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
