@echo off
setlocal
cd /d "%~dp0"
chcp 65001 >nul
set PYTHONUTF8=1
title mizan23 Bootstrap
color 0B
mode con: cols=108 lines=34 >nul 2>nul

echo.
echo #############################################################
echo #                                                           #
echo #   mizan23                                                 #
echo #   Local Market Intelligence Bootstrap                     #
echo #                                                           #
echo #############################################################
echo.
echo [INFO] Baslatiliyor...
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\run-all.ps1" %*
set EXIT_CODE=%ERRORLEVEL%

if not "%EXIT_CODE%"=="0" (
  echo.
  echo [FAIL] mizan23 baslatma islemi %EXIT_CODE% kodu ile sonlandi.
  echo [WARN] Gerekirse mizan23.bat dosyasini Yonetici olarak calistirin.
  pause
)

exit /b %EXIT_CODE%
