@echo off
setlocal

set LOREVOX_REPO=/mnt/c/Users/chris/lorevox

where wt >nul 2>nul
if errorlevel 1 (
  echo Windows Terminal (wt.exe) not found.
  pause
  exit /b 1
)

wt new-tab --title "Lorevox API Reload" wsl.exe bash -lc "cd %LOREVOX_REPO% && bash scripts/restart_api_visible.sh; exec bash"

endlocal
exit /b 0
