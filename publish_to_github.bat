@echo off
setlocal
cd /d "%~dp0"
where powershell >nul 2>nul || (
  echo PowerShell не найден.
  exit /b 1
)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0publish_to_github.ps1"
set ERR=%ERRORLEVEL%
if not "%ERR%"=="0" (
  echo.
  echo Публикация завершилась с ошибкой %ERR%.
  pause
  exit /b %ERR%
)
echo.
echo Готово. Окно можно закрыть.
pause
