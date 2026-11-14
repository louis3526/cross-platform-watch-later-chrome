# 跨平台稍後觀看自動播放器 (YouTube & Bilibili)
### Cross-Platform Watch Later Autoplayer for Chrome

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Manifest V3](https://img.shields.io/badge/Chrome%20Extension-Manifest%20V3-success.svg)](manifest.json)
[![Platform](https://img.shields.io/badge/Platform-YouTube%20%7C%20Bilibili-red.svg)](#)

專為 Google Chrome 打造的開源影音神器！混合收納 YouTube 🔴 與 Bilibili 🔵 影片，自由拖曳排序、一鍵雙向置頂置底，支援跨平台全自動無縫連播、沉浸式全螢幕與自訂倍速，並提供 24 小時雙電腦非同步雲端同步！

A powerful open-source Google Chrome extension that seamlessly unifies your "Watch Later" playlists across **YouTube 🔴 and Bilibili 🔵**. Supports custom drag-and-drop ordering, instant top/bottom reordering, automated sequential autoplay, immersive edge-to-edge fullscreen, speed control integration, and 24/7 cross-device asynchronous cloud sync without third-party software!

---

## 📑 目錄 / Table of Contents
- [繁體中文說明 (Traditional Chinese)](#-繁體中文說明)
  - [核心特色功能](#-核心特色功能)
  - [30 秒極速安裝指引](#-30-秒極速安裝指引)
  - [使用操作指南](#-使用操作指南)
  - [雙機非同步雲端同步使用方式](#-雙機非同步雲端同步使用方式)
- [English Documentation](#-english-documentation)
  - [Key Features](#-key-features)
  - [Quick Installation (30 Seconds)](#-quick-installation-30-seconds)
  - [User Guide](#-user-guide)
  - [Cross-Device Asynchronous Cloud Sync](#-cross-device-asynchronous-cloud-sync)
- [開源許可證 / License](#-開源許可證--license)

---

## 🇹🇼 繁體中文說明

### 🌟 核心特色功能

1. **雙平台混合跨界收納**：
   - 完美支援 YouTube（長影片、Shorts、播放清單）與 B站（BV號、AV號、分P劇集）。
   - 自動即時向官方資料庫抓取高畫質封面縮圖與精確片長（時長）。
2. **影片封面「➕ 稍後連播」懸浮按鈕**：
   - 瀏覽 YouTube 或 B站首頁、搜尋頁或推薦時，每個影片縮圖左上方自動浮現按鈕。
   - 點擊一秒入庫並變為綠色「✓ 已加入」，具備雙層防穿透保護，**絕對不會誤開新分頁**。
3. **滑鼠左鍵直覺拖曳排序 ＆ 快速置頂/置底**：
   - 滑鼠按住任一部影片直接上下拖曳即可調整順序，手感順暢自帶對齊線。
   - 右側配備快捷按鈕：點 `⤒` 一秒置頂到第一部、點 `⤓` 一秒置底到最後一部。
4. **全自動跨平台無縫連續播放**：
   - 按下「▶ 從頭自動播放」，外掛接管專用分頁。
   - 播完一部影片後，自動在 1 秒內無縫切換至下一部（YouTube 播完自動跳 B站，B站播完自動跳 YouTube）。
5. **純淨沉浸式全螢幕（無視窗外框、無干擾）**：
   - 開播時自動將 Chrome 視窗升級為全螢幕，消滅分頁標籤與網址列外框。
   - 自動隱藏頂部搜尋列與底部標題/推薦，100% 畫面撐滿整個螢幕，換片部部維持全螢幕。
6. **自訂倍速播放 ＆ 完美相容 Video Speed Controller 插件**：
   - 支援勾選預設倍速（例如 1.5x、1.8x），開播時自動套用。
   - 播放中仍可自由按下 `R`（重設 1.0x）、`D`（加速）、`S`（減速）隨時微調。
7. **智慧懸浮控制面板（自動隱藏防遮擋）**：
   - 影片剛開播或換片時浮現 3.5 秒展示片名與進度，隨後自動淡出隱藏。
   - 碰到滑鼠移動或按鍵盤任意鍵立即喚醒，滑鼠移開後 2.8 秒再度隱藏。
8. **24 小時雙電腦非同步雲端同步（免裝軟體、免開同機）**：
   - 專屬「雲端同步碼 (Sync Code)」，A 電腦存好影片點上傳即可關機。
   - B 電腦任何時候開機輸入代碼，一秒拉取最新播放清單！
   - 同時支援 DeskIn 剪貼簿「一鍵貼上同步」與 JSON 檔案匯出入備份。

---

### 🚀 30 秒極速安裝指引

1. 下載或複製本倉庫代碼至電腦本地資料夾（例如 `D:\跨平台稍後觀看_Chrome外掛`）。
2. 打開 **Google Chrome 瀏覽器**，在網址列輸入：
   ```text
   chrome://extensions
   ```
3. 在頁面右上角，將 **「開發者模式 (Developer mode)」開關打開**。
4. 點擊左上角的 **「載入未封裝項目 (Load unpacked)」** 按鈕。
5. 選取本專案資料夾，點擊「選擇資料夾」，外掛立刻安裝啟用！
6. 點擊 Chrome 右上角拼圖圖示，將「跨平台稍後觀看」旁邊的 **📌 大頭針釘選** 至工具列。

---

### 📖 使用操作指南

| 功能操作 | 說明 |
| :--- | :--- |
| **首頁一鍵收納** | 逛 YouTube / B站時，滑鼠移至封面左上角點擊 `➕ 稍後連播` |
| **手動加入影片** | 在外掛彈窗頂部輸入框貼上網址，點擊 `➕ 新增` |
| **收納當前分頁** | 在外掛彈窗點擊 `📌 加入當前分頁` |
| **雙擊縮圖立即播放** | 在清單中對著任一部影片縮圖「連按兩下滑鼠左鍵」即可直接播放該片 |
| **拖曳自訂順序** | 按住影片任一處上下拖曳調整播放優先順序 |
| **一鍵置頂/置底** | 點擊影片右側的 `⤒` (移至最前) 或 `⤓` (移至最後) |
| **選擇式批次刪除** | 點擊 `☑ 選擇式刪除` ➔ 勾選欲刪除的影片 ➔ 點擊紅色 `🗑️ 刪除所選影片` |
| **全螢幕切換** | 點擊播放器右上角懸浮條的 `⛶` 或隨時按鍵盤 `F` 鍵 |
| **放大成全螢幕網頁** | 點擊外掛彈窗右上角 `⤢ 開啟全螢幕大分頁`，享受大螢幕滿版體驗 |

---

### ☁️ 雙機非同步雲端同步使用方式

> 適用於兩台電腦（例如工作機 A 與客廳/隔壁機 B），且**兩台電腦不需要同時開機**！

1. **在 A 電腦**：
   - 點擊外掛頂部的 **`☁️ 雲端同步`**。
   - 點擊 **`☁️ 上傳備份到雲端 (A電腦)`**，系統會生成並顯示一組專屬同步碼（例如 `dl-8877`）。
   - 點擊 `📋 複製代碼`。A 電腦隨時可以關機！
2. **在 B 電腦**：
   - 任何時候開機，打開外掛點擊 **`☁️ 雲端同步`**。
   - 貼入剛才的同步碼，點擊 **`📥 從雲端下載同步 (B電腦)`**。
   - 清單立即同步到位！之後兩台電腦只要點主畫面的 **`[ 🔄 刷新 ]`** 即可在背景自動連動。

---

## 🇺🇸 English Documentation

### 🌟 Key Features

1. **Unified Cross-Platform Playlist**:
   - Seamlessly mix videos from both **YouTube 🔴** (Videos, Shorts, Playlists) and **Bilibili 🔵** (BV/AV numbers, Multi-Part series).
   - Automatically retrieves official high-resolution thumbnails and exact runtimes directly from platform servers.
2. **One-Click Thumbnail Hover Button**:
   - Floating `➕ Watch Later` button automatically mounts onto video cards across YouTube and Bilibili homepages, search results, and recommendations.
   - Click once to save with visual feedback (`✓ Added`), fortified with event-capture stopping to prevent unwanted tab navigation.
3. **Native Drag-and-Drop Reordering & Quick Top/Bottom**:
   - Effortlessly reorder items by left-click dragging any row with intuitive alignment guidelines.
   - Dedicated action buttons: `⤒` (Move to Top) and `⤓` (Move to Bottom) for instant single-click relocation.
4. **Fully Automated Sequential Cross-Platform Playback**:
   - Click `▶ Start Autoplay` to let the extension manage the playback tab.
   - When a video finishes, it automatically navigates to the next video within 1 second—transitioning smoothly between YouTube and Bilibili without manual intervention.
5. **Immersive Edge-to-Edge Fullscreen Experience**:
   - Maximizes the Chrome window into borderless fullscreen, hiding tabs, URL bars, and desktop window frames.
   - Cleanses the viewing arena by suppressing headers, search bars, titles, and comments, yielding a cinematic 100% full-screen presentation.
6. **Custom Playback Speed & Video Speed Controller Compatibility**:
   - Toggle default playback speeds (e.g., 1.5x, 1.8x) applied automatically upon video start.
   - Fully compatible with the popular *Video Speed Controller* extension—adjust speed anytime on the fly using `R` (Reset), `D` (Speed up), and `S` (Slow down).
7. **Intelligent Auto-Hiding Controller Dock**:
   - Floats in the top-right corner displaying current index and title for 3.5 seconds upon video load, then smoothly fades out.
   - Awakens instantly upon mouse movement, scrolling, or any keystroke, and auto-hides after 2.8 seconds of inactivity.
8. **24/7 Asynchronous Cross-Device Cloud Sync**:
   - Uses dedicated Sync Codes (e.g., `dl-xxxxxx` or custom keys) allowing PC A to upload and power down, while PC B downloads anytime later.
   - Zero software installation, zero third-party accounts, and zero cloud console setup required. Also supports DeskIn clipboard one-click paste and JSON export/import.

---

### 🚀 Quick Installation (30 Seconds)

1. Clone or download this repository to your local drive (e.g., `D:\CrossPlatform_WatchLater_Extension`).
2. Open **Google Chrome** and navigate to:
   ```text
   chrome://extensions
   ```
3. In the top-right corner, switch on **"Developer mode"**.
4. Click the **"Load unpacked"** button in the top-left corner.
5. Select the project folder and click "Select Folder". The extension is now active!
6. Click the Chrome Extensions puzzle icon and **pin 📌** the extension to your toolbar.

---

### 📖 User Guide

| Action | Description |
| :--- | :--- |
| **Add from Feed** | Hover over any YouTube or Bilibili card and click `➕ Watch Later` |
| **Manual Add** | Paste any YouTube or Bilibili URL into the input bar and click `➕ Add` |
| **Add Current Tab** | Click `📌 Add Current Tab` to save the video you are actively watching |
| **Double-Click Play** | Double-click any thumbnail image in the list to immediately start playback from that video |
| **Drag & Drop** | Left-click and drag any video row up or down to reorder the playlist |
| **Move to Top/Bottom** | Click `⤒` (Move to Top) or `⤓` (Move to Bottom) on the right of any item |
| **Selective Batch Delete** | Click `☑ Batch Select` ➔ check unwanted items ➔ click red `🗑️ Delete Selected` |
| **Fullscreen Toggle** | Click `⛶` on the floating dock or press `F` anytime during playback |
| **Full-Tab Dashboard** | Click `⤢ Open Full-Tab View` to expand the manager into a full-page widescreen dashboard |

---

### ☁️ Cross-Device Asynchronous Cloud Sync

> Perfect for syncing between multiple computers (e.g., Office PC A and Living Room PC B) **without needing both computers powered on simultaneously**!

1. **On PC A**:
   - Open the extension and click **`☁️ Cloud Sync`**.
   - Click **`☁️ Upload to Cloud (PC A)`**; the extension generates a unique sync code (e.g., `dl-8877`).
   - Click `📋 Copy Code`. You can now shut down PC A!
2. **On PC B**:
   - Power on PC B whenever convenient, open the extension and click **`☁️ Cloud Sync`**.
   - Paste the sync code and click **`📥 Download from Cloud (PC B)`**.
   - The entire playlist loads in seconds! Future updates sync seamlessly by clicking **`[ 🔄 Reload ]`** on the main toolbar.

---

## 📜 開源許可證 / License

本專案基於 [MIT License](LICENSE) 開源協議發布。
This project is open-sourced under the terms of the MIT License.
