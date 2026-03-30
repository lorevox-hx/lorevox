@echo off
setlocal

set LOREVOX_REPO=/mnt/c/Users/chris/lorevox

where wt >nul 2>nul
if errorlevel 1 goto :fallback

wt ^
  new-tab --title "Lorevox API" wsl.exe bash --login %LOREVOX_REPO%/scripts/start_api_visible.sh ; ^
  new-tab --title "Lorevox TTS" wsl.exe bash --login %LOREVOX_REPO%/scripts/start_tts_visible.sh ; ^
  new-tab --title "Lorevox UI"  wsl.exe bash --login %LOREVOX_REPO%/scripts/start_ui_visible.sh ; ^
  new-tab --title "Lorevox Logs" wsl.exe bash --login %LOREVOX_REPO%/scripts/logs_visible.sh

goto :done

:fallback
echo Windows Terminal not found - falling back to shell-native launcher.
wsl bash -lc "cd %LOREVOX_REPO% && bash scripts/start_all.sh"
pause

:done
endlocal
exit /b 0
