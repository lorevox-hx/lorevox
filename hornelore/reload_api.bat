@echo off
setlocal

set HORNELORE_REPO=/mnt/c/Users/chris/lorevox/hornelore

where wt >nul 2>nul
if errorlevel 1 goto :fallback

wt new-tab --title "Hornelore API Reload" wsl.exe bash --login %HORNELORE_REPO%/scripts/restart_api_visible.sh

goto :done

:fallback
echo Windows Terminal not found - falling back to shell-native restart.
wsl bash -lc "cd %HORNELORE_REPO% && bash scripts/restart_api.sh"
pause

:done
endlocal
exit /b 0
