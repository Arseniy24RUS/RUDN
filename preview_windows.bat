@echo off
cd /d "%~dp0"
where py >nul 2>nul && (py preview_local.py & goto :eof)
where python >nul 2>nul && (python preview_local.py & goto :eof)
echo Python не найден. Установите Python 3 или откройте проект через Live Server.
pause
