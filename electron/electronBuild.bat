rem Simple build script for LittleJS Electron Builds by Frank Force
rem Calls the normal build and then packages it with electron
rem Run electronSetup.bat first to install electron

rem do the normal build first
cd ..
call build.bat
if %ERRORLEVEL% NEQ 0 (
    pause
    exit /b %ERRORLEVEL%
)
cd electron

rem remove old electron build folder
rmdir /s /q build
mkdir build
copy electron.js build\electron.js
copy package.json build\package.json

rem build the html and copy files
echo ^<body^>^<script^> >> build\index.html
type ..\build\index.js >> build\index.html
echo ^</script^> >> build\index.html
copy ..\tiles.png build\tiles.png

rem build with electron
call electron-packager build --overwrite
if %ERRORLEVEL% NEQ 0 (
    pause
    exit /b %ERRORLEVEL%
)