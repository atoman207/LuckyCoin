@echo off
REM ============================================================
REM  Lucky Coin -- daily bot drip (double-click to run)
REM
REM  Self-contained: this .bat, daily_bots.py and .env all live in
REM  THIS folder. Copy the whole folder to any device with Python 3
REM  and double-click this file. Nothing else from the repo is needed.
REM ============================================================
chcp 65001 >nul
cd /d "%~dp0"

REM Prefer the `python` command; fall back to the `py` launcher.
set "PYEXE=python"
where python >nul 2>nul
if errorlevel 1 set "PYEXE=py"
where %PYEXE% >nul 2>nul
if errorlevel 1 goto :nopython

if not exist "%~dp0.env" goto :noenv

echo Running the Lucky Coin daily-bot drip...
echo.
%PYEXE% "%~dp0daily_bots.py"
echo.
echo ------------------------------------------------------------
echo Done. Press any key to close this window.
pause >nul
exit /b 0

:noenv
echo.
echo No .env file found in this folder.
echo  1) Copy ".env.example" to ".env"
echo  2) Fill in NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY
echo Then run this again.
echo.
pause >nul
exit /b 1

:nopython
echo.
echo Python was not found on this computer.
echo Install Python 3 from https://www.python.org/downloads/
echo (tick "Add python.exe to PATH" during setup), then run this again.
echo.
pause >nul
exit /b 1
