@echo off
chcp 65001 >nul
title 跨平台稍後觀看 - 一鍵更新軟體
echo ========================================================
echo   跨平台稍後觀看 Chrome 外掛 - 正在從 GitHub 拉取最新版本...
echo ========================================================
echo.
git pull origin main
echo.
if %ERRORLEVEL% EQU 0 (
    echo [OK] 程式代碼已成功更新為最新版本！
    echo 請在瀏覽器擴充功能頁面點擊「重新載入」即可生效。
) else (
    echo [提示] 尚未安裝 Git 或本地檔案有所衝突。
    echo 正在嘗試直接開啟 GitHub 最新發布頁面...
    start https://github.com/louis3526/cross-platform-watch-later-chrome/archive/refs/heads/main.zip
)
echo.
pause
