@echo off
setlocal

set HORNELORE_REPO=/mnt/c/Users/chris/lorevox/hornelore

where wt >nul 2>nul
if errorlevel 1 goto :fallback

wt new-tab --title "Hornelore Logs" wsl.exe bash --login %HORNELORE_REPO%/scripts/logs_visible.sh

goto :done

:fallback
echo Windows Terminal not found - falling back to shell-native log tail.
wsl bash -lc "cd %HORNELORE_REPO% && bash scripts/logs_visible.sh"
pause

:done
endlocal
exit /b 0
