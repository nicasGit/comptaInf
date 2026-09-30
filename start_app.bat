
@echo off

REM ✅ récupère le dossier du .bat automatiquement
set SCRIPT_DIR=%~dp0

REM ✅ Node embarqué dans ton projet
set NODE_PATH=%SCRIPT_DIR%node-v24.16.0-win-x64
set PATH=%NODE_PATH%;%PATH%

REM ✅ se déplacer dans le dossier du projet automatiquement
cd /d %SCRIPT_DIR%

REM ✅ lance le serveur dans une autre fenêtre
start "ComptaInf Server" cmd /k node server.js

REM ✅ attendre un peu que Node démarre
timeout /t 2 /nobreak > nul
 
REM ✅ ouvrir Edge sur ComptaInf
start chrome http://localhost:3000

exit