@echo off
setlocal

set LOREVOX_REPO=/mnt/c/Users/chris/lorevox

where wt >nul 2>nul
if errorlevel 1 goto :fallback

wt new-tab --title "Lorevox API Reload" wsl.exe bash --login %LOREVOX_REPO%/scripts/restart_api_visible.sh

goto :done

:fallback
echo Windows Terminal not found - falling back to shell-native restart.
wsl bash -lc "cd %LOREVOX_REPO% && bash scripts/restart_api.sh"
pause

:done
endlocal
exit /b 0
