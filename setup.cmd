@echo off
rem Double-click launcher for setup.sh on Windows (installs Git Bash first if needed).
setlocal
set "BASH_EXE="
for %%P in ("%ProgramFiles%\Git\bin\bash.exe" "%LOCALAPPDATA%\Programs\Git\bin\bash.exe") do (
  if exist %%P if not defined BASH_EXE set "BASH_EXE=%%~P"
)
if not defined BASH_EXE (
  echo Git Bash not found - installing Git with winget...
  winget install -e --id Git.Git --accept-source-agreements --accept-package-agreements --silent
  if exist "%ProgramFiles%\Git\bin\bash.exe" set "BASH_EXE=%ProgramFiles%\Git\bin\bash.exe"
)
if not defined BASH_EXE (
  echo Could not find or install Git Bash. Install Git for Windows, then run setup.sh.
  pause
  exit /b 1
)
"%BASH_EXE%" "%~dp0setup.sh" %*
set "CODE=%ERRORLEVEL%"
echo.
pause
exit /b %CODE%
