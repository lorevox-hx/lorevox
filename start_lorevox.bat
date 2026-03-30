@echo off
setlocal

REM Change this if your repo is elsewhere
set LOREVOX_REPO=/mnt/c/Users/chris/lorevox

where wt >nul 2>nul
if errorlevel 1 goto :fallback

wt ^
  new-tab --title "Lorevox API" wsl.exe bash -lc "cd %LOREVOX_REPO% && bash scripts/start_api_visible.sh; exec bash" ; ^
  new-tab --title "Lorevox TTS" wsl.exe bash -lc "cd %LOREVOX_REPO% && bash scripts/start_tts_visible.sh; exec bash" ; ^
  new-tab --title "Lorevox UI"  wsl.exe bash -lc "cd %LOREVOX_REPO% && bash scripts/start_ui_visible.sh; exec bash" ; ^
  new-tab --title "Lorevox Logs" wsl.exe bash -lc "cd %LOREVOX_REPO% && bash scripts/logs_visible.sh; exec bash"

goto :done

:fallback
echo Windows Terminal not found — falling back to shell-native launcher.
wsl bash -lc "cd %LOREVOX_REPO% && bash scripts/start_all.sh"
pause

:done
endlocal
exit /b 0
