@echo off
setlocal
cd /d "%~dp0.."
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Install-Mosaic-Helper.ps1"
if errorlevel 1 pause
