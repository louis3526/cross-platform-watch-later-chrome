/**
 * 跨平台稍後觀看自動播放器 - Google Drive 雲端同步模組 (Manifest V3)
 * 支援：
 * 1. 透過 OAuth2 (chrome.identity.launchWebAuthFlow) 取得 Google 官方授權 Token
 * 2. 於使用者的 Google Drive 建立/更新「cross_platform_playlist.json」
 * 3. 雙向同步：一鍵上傳覆蓋、一鍵下載同步至本地
 */

const DRIVE_FILE_NAME = "cross_platform_playlist.json";
const GOOGLE_AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const DRIVE_API_FILES = "https://www.googleapis.com/drive/v3/files";
const DRIVE_API_UPLOAD = "https://www.googleapis.com/upload/drive/v3/files";
const SCOPES = ["https://www.googleapis.com/auth/drive.file"];

// 讀取/儲存 Google 認證資訊
async function getDriveAuthConfig() {
  return new Promise((resolve) => {
    chrome.storage.local.get(["drive_client_id", "drive_access_token", "drive_token_expires"], (res) => {
      resolve(res || {});
    });
  });
}

async function setDriveAuthConfig(config) {
  return new Promise((resolve) => {
    chrome.storage.local.set(config, resolve);
  });
}

/**
 * 啟動 Google 帳號授權登入
 */
async function authorizeGoogleDrive(clientId) {
  if (!clientId || typeof clientId !== "string" || !clientId.trim()) {
    throw new Error("請先填入您的 Google Client ID！");
  }

  const cleanClientId = clientId.trim();
  const redirectUri = chrome.identity.getRedirectURL();

  const authUrl = new URL(GOOGLE_AUTH_ENDPOINT);
  authUrl.searchParams.set("client_id", cleanClientId);
  authUrl.searchParams.set("response_type", "token");
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("scope", SCOPES.join(" "));
  authUrl.searchParams.set("prompt", "consent");

  return new Promise((resolve, reject) => {
    chrome.identity.launchWebAuthFlow(
      { url: authUrl.toString(), interactive: true },
      async (redirectUrl) => {
        if (chrome.runtime.lastError || !redirectUrl) {
          return reject(new Error(chrome.runtime.lastError?.message || "使用者取消了授權登入"));
        }

        // 解析回傳的 URL hash (#access_token=...&expires_in=...)
        const hash = new URL(redirectUrl).hash.substring(1);
        const urlParams = new URLSearchParams(hash);
        const accessToken = urlParams.get("access_token");
        const expiresIn = parseInt(urlParams.get("expires_in") || "3600", 10);

        if (!accessToken) {
          return reject(new Error("未能從 Google 獲取有效的 Access Token"));
        }

        const expiresAt = Date.now() + (expiresIn - 60) * 1000;
        await setDriveAuthConfig({
          drive_client_id: cleanClientId,
          drive_access_token: accessToken,
          drive_token_expires: expiresAt
        });

        resolve({ accessToken, expiresAt });
      }
    );
  });
}

/**
 * 獲取有效的 Access Token (過期則重新啟動授權)
 */
async function getValidAccessToken() {
  const config = await getDriveAuthConfig();
  if (config.drive_access_token && config.drive_token_expires && Date.now() < config.drive_token_expires) {
    return config.drive_access_token;
  }
  if (config.drive_client_id) {
    const authRes = await authorizeGoogleDrive(config.drive_client_id);
    return authRes.accessToken;
  }
  throw new Error("尚未設定 Google Drive Client ID，請點擊上方「☁️ Google Drive 設定」輸入！");
}

/**
 * 在 Google Drive 中尋找 cross_platform_playlist.json
 */
async function findPlaylistFileOnDrive(token) {
  const query = encodeURIComponent(`name = '${DRIVE_FILE_NAME}' and trashed = false`);
  const resp = await fetch(`${DRIVE_API_FILES}?q=${query}&fields=files(id,name,modifiedTime)`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`查詢 Google Drive 失敗: ${errText}`);
  }
  const data = await resp.json();
  return data.files?.[0] || null;
}

/**
 * 上傳/覆蓋播放清單至 Google Drive
 */
async function uploadPlaylistToGoogleDrive(playlist) {
  const token = await getValidAccessToken();
  const existingFile = await findPlaylistFileOnDrive(token);
  const jsonContent = JSON.stringify(playlist, null, 2);

  if (existingFile) {
    // 檔案已存在，使用 PATCH 覆蓋內容
    const updateResp = await fetch(`${DRIVE_API_UPLOAD}/${existingFile.id}?uploadType=media`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json; charset=UTF-8"
      },
      body: jsonContent
    });
    if (!updateResp.ok) throw new Error("覆蓋 Google Drive 檔案失敗");
    return { success: true, action: "updated", fileId: existingFile.id };
  } else {
    // 建立新檔案 (Multipart Upload)
    const boundary = "-------314159265358979323846";
    const delimiter = "\r\n--" + boundary + "\r\n";
    const closeDelim = "\r\n--" + boundary + "--";

    const metadata = {
      name: DRIVE_FILE_NAME,
      mimeType: "application/json"
    };

    const multipartRequestBody =
      delimiter +
      "Content-Type: application/json; charset=UTF-8\r\n\r\n" +
      JSON.stringify(metadata) +
      delimiter +
      "Content-Type: application/json; charset=UTF-8\r\n\r\n" +
      jsonContent +
      closeDelim;

    const createResp = await fetch(`${DRIVE_API_UPLOAD}?uploadType=multipart`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": `multipart/related; boundary=${boundary}`
      },
      body: multipartRequestBody
    });
    if (!createResp.ok) throw new Error("建立 Google Drive 檔案失敗");
    const newFile = await createResp.json();
    return { success: true, action: "created", fileId: newFile.id };
  }
}

/**
 * 從 Google Drive 下載最新播放清單
 */
async function downloadPlaylistFromGoogleDrive() {
  const token = await getValidAccessToken();
  const file = await findPlaylistFileOnDrive(token);
  if (!file) {
    return { success: false, error: "Google Drive 上尚未找到播放清單檔案！請先從另一台電腦點擊上傳備份。" };
  }

  const downloadResp = await fetch(`${DRIVE_API_FILES}/${file.id}?alt=media`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!downloadResp.ok) throw new Error("從 Google Drive 下載內容失敗");

  const playlist = await downloadResp.json();
  if (!Array.isArray(playlist)) throw new Error("Google Drive 檔案格式不正確，非陣列格式");

  return { success: true, playlist, modifiedTime: file.modifiedTime };
}
