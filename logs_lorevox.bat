@echo off
REM Opens three Windows Terminal tabs tailing the live log for each service.
REM Run this any time after start_lorevox.bat to watch what the services are doing.
wt new-tab --title "Lorevox API" -- wsl bash -c "tail -f /mnt/c/Users/chris/lorevox/.runtime/logs/api.log 2>/dev/null || (echo 'Waiting for api.log...'; sleep 3; tail -f /mnt/c/Users/chris/lorevox/.runtime/logs/api.log)" ^
; new-tab --title "Lorevox TTS" -- wsl bash -c "tail -f /mnt/c/Users/chris/lorevox/.runtime/logs/tts.log 2>/dev/null || (echo 'Waiting for tts.log...'; sleep 3; tail -f /mnt/c/Users/chris/lorevox/.runtime/logs/tts.log)" ^
; new-tab --title "Lorevox UI"  -- wsl bash -c "tail -f /mnt/c/Users/chris/lorevox/.runtime/logs/ui.log  2>/dev/null || (echo 'Waiting for ui.log...';  sleep 3; tail -f /mnt/c/Users/chris/lorevox/.runtime/logs/ui.log)"
