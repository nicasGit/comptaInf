@echo off

set NODE_HOME=%CD%\node-v24.16.0-win-x64
set PATH=%NODE_HOME%;%PATH%

echo Node:
node -v

echo NPM:
call npm -v

echo Installation...

call npm install express multer googleapis pdf-parse@1.1.1 tesseract.js pdf-poppler pdf2pic


echo.
echo ===== Packages =====

call npm list --depth=0

pause