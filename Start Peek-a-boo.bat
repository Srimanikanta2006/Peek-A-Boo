@echo off
rem Shells opened from VS Code can carry this, which makes Electron run as plain Node.
set ELECTRON_RUN_AS_NODE=
cd /d "%~dp0desktop-app"
start "" "node_modules\electron\dist\electron.exe" .
