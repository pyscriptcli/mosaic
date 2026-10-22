@echo off
setlocal
cd /d "%~dp0.."
node scripts\mosaic-helper.cjs
if errorlevel 1 pause
