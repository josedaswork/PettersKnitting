@echo off
echo === Iniciando limpieza de Peter's Knitting ===
echo.
powershell -ExecutionPolicy Bypass -File "%~dp0desinstalar_todo.ps1"
echo.
pause
