@echo off
setlocal
cd /d "%~dp0"
title mizan23 Bootstrap
color 0B

echo.
echo =============================================================
echo                      mizan23 Bootstrap
echo =============================================================
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\run-all.ps1" %*
set EXIT_CODE=%ERRORLEVEL%

if not "%EXIT_CODE%"=="0" (
  echo.
  echo mizan23 baslatma islemi %EXIT_CODE% kodu ile sonlandi.
  pause
)

exit /b %EXIT_CODE%
