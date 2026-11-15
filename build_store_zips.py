"""
一鍵打包 Microsoft Edge Add-ons 與 Mozilla Firefox (AMO) 商店上架專用 ZIP 檔
執行方式：python build_store_zips.py
產出位置：dist/edge_chrome_store.zip 與 dist/firefox_amo_store.zip
"""

import os
import zipfile

ROOT = os.path.dirname(os.path.abspath(__file__))
DIST_DIR = os.path.join(ROOT, "dist")
os.makedirs(DIST_DIR, exist_ok=True)

COMMON_FILES = [
    "background.js",
    "cloud_sync.js",
    "content.css",
    "content.js",
    "i18n.js",
    "popup.css",
    "popup.html",
    "popup.js",
    "icons/icon16.png",
    "icons/icon48.png",
    "icons/icon128.png",
]

def build_zip(out_name, manifest_src):
    out_path = os.path.join(DIST_DIR, out_name)
    with zipfile.ZipFile(out_path, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.write(os.path.join(ROOT, manifest_src), "manifest.json")
        for rel in COMMON_FILES:
            full = os.path.join(ROOT, rel)
            if os.path.exists(full):
                zf.write(full, rel)
    print(f"Created {out_path} ({os.path.getsize(out_path)} bytes)")

if __name__ == "__main__":
    build_zip("edge_chrome_store.zip", "manifest.json")
    build_zip("firefox_amo_store.zip", "manifest.firefox.json")
