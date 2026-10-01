@echo off
REM Sube el proyecto a GitHub y activa GitHub Pages.
REM Si Windows pregunta por permisos, elige "Si".
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0publicar.ps1"
echo.
pause