rem Simple build script for LittleJS by Frank Force
rem Minfies and combines index.html and index.js and zips the result

set NAME=game
set BUILD_FOLDER=build
set BUILD_FILENAME=index.js

rem remove old files
rmdir /s /q %BUILD_FOLDER%
mkdir %BUILD_FOLDER%
pushd %BUILD_FOLDER%

rem copy engine release build
type ..\..\..\build\littlejs.release.js >> %BUILD_FILENAME%
echo. >> %BUILD_FILENAME%

rem add your game's files to include here
type ..\game.js >> %BUILD_FILENAME%
echo. >> %BUILD_FILENAME%

rem copy images to build folder
copy ..\tiles.png tiles.png

rem minify code with uglify
call npx uglifyjs -o %BUILD_FILENAME% --compress --mangle -- %BUILD_FILENAME%
if %ERRORLEVEL% NEQ 0 (
    pause
    exit /b %ERRORLEVEL%
)

rem build the html, you can add html header and footers here
rem type ..\header.html >> index.html
echo ^<body^>^<script^> >> index.html
type %BUILD_FILENAME% >> index.html
echo ^</script^> >> index.html

rem delete intermediate files
del %BUILD_FILENAME%

rem copy elecron files to build folder
copy ..\electron.js electron.js
copy ..\package.json package.json

popd

rem build with electron
call npx electron-packager ./%BUILD_FOLDER% --overwrite
if %ERRORLEVEL% NEQ 0 (
    pause
    exit /b %ERRORLEVEL%
)
pause