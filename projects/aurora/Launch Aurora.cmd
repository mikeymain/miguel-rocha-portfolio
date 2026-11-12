@echo off
cd /d "%~dp0"
if exist "release\Aurora-0.1.0.exe" (
  start "" "release\Aurora-0.1.0.exe"
  exit /b
)
if exist "release\win-unpacked\Aurora.exe" (
  start "" "release\win-unpacked\Aurora.exe"
  exit /b
)
call npm run desktop
