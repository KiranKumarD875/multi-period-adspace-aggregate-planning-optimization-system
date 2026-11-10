@echo off
cd /d "%~dp0"
title Ad-Space Planner Server

rem 1. Free port 8010 if any previous instance is still running
powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort 8010 -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }"

rem 2. Wait 2 seconds for uvicorn to start listening, then open the browser
start "" cmd /c "timeout /t 2 /nobreak >nul & start http://127.0.0.1:8010"

echo =========================================================================
echo   Ad-Space Planner Server Starting on http://127.0.0.1:8010
echo   Browser will open automatically in 2 seconds.
echo   NOTE: If your browser shows an older cached page, press Ctrl+F5 to reload.
echo   Press Ctrl+C to stop the server.
echo =========================================================================
python -m uvicorn backend.api:app --host 127.0.0.1 --port 8010
pause