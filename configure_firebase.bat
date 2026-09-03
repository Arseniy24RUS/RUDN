@echo off
setlocal
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0configure_firebase.ps1"
set ERR=%ERRORLEVEL%
if not "%ERR%"=="0" (
  echo.
  echo Настройка Firebase завершилась с ошибкой %ERR%.
  pause
  exit /b %ERR%
)
echo.
echo Правила Firebase развернуты.
pause
