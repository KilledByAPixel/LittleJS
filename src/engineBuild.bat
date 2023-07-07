rem Simple build script for LittleJS Engine by Frank Force
rem Minfies and combines index.html and index.js and zips the result
rem Run npm install first to install required dependencies

rem --- BUILD ENGINE DEBUG ---

set BUILD_FOLDER=build
set ENGINE_NAME=littlejs

cd ..
rem remove old files
rmdir /s /q %BUILD_FOLDER%
mkdir %BUILD_FOLDER%
pushd %BUILD_FOLDER%

rem --- BUILD ENGINE ALL ---

set OUTPUT_FILENAME=%ENGINE_NAME%.js

rem combine code
type ..\src\engineDebug.js >> %OUTPUT_FILENAME%
echo.>> %OUTPUT_FILENAME%
type ..\src\engineUtilities.js >> %OUTPUT_FILENAME%
echo.>> %OUTPUT_FILENAME%
type ..\src\engineSettings.js >> %OUTPUT_FILENAME%
echo.>> %OUTPUT_FILENAME%
type ..\src\engineObject.js >> %OUTPUT_FILENAME%
echo.>> %OUTPUT_FILENAME%
type ..\src\engineDraw.js >> %OUTPUT_FILENAME%
echo.>> %OUTPUT_FILENAME%
type ..\src\engineInput.js >> %OUTPUT_FILENAME%
echo.>> %OUTPUT_FILENAME%
type ..\src\engineAudio.js >> %OUTPUT_FILENAME%
echo.>> %OUTPUT_FILENAME%
type ..\src\engineTileLayer.js >> %OUTPUT_FILENAME%
echo.>> %OUTPUT_FILENAME%
type ..\src\engineParticles.js >> %OUTPUT_FILENAME%
echo.>> %OUTPUT_FILENAME%
type ..\src\engineMedals.js >> %OUTPUT_FILENAME%
echo.>> %OUTPUT_FILENAME%
type ..\src\engineWebGL.js >> %OUTPUT_FILENAME%
echo.>> %OUTPUT_FILENAME%
type ..\src\engine.js >> %OUTPUT_FILENAME%
echo.>> %OUTPUT_FILENAME%

rem --- BUILD ENGINE RELEASE ---

set OUTPUT_FILENAME=%ENGINE_NAME%.release.js

rem combine code
type ..\src\engineRelease.js >> %OUTPUT_FILENAME%
echo.>> %OUTPUT_FILENAME%
type ..\src\engineUtilities.js >> %OUTPUT_FILENAME%
echo.>> %OUTPUT_FILENAME%
type ..\src\engineSettings.js >> %OUTPUT_FILENAME%
echo.>> %OUTPUT_FILENAME%
type ..\src\engine.js >> %OUTPUT_FILENAME%
echo.>> %OUTPUT_FILENAME%
type ..\src\engineObject.js >> %OUTPUT_FILENAME%
echo.>> %OUTPUT_FILENAME%
type ..\src\engineDraw.js >> %OUTPUT_FILENAME%
echo.>> %OUTPUT_FILENAME%
type ..\src\engineInput.js >> %OUTPUT_FILENAME%
echo.>> %OUTPUT_FILENAME%
type ..\src\engineAudio.js >> %OUTPUT_FILENAME%
echo.>> %OUTPUT_FILENAME%
type ..\src\engineTileLayer.js >> %OUTPUT_FILENAME%
echo.>> %OUTPUT_FILENAME%
type ..\src\engineParticles.js >> %OUTPUT_FILENAME%
echo.>> %OUTPUT_FILENAME%
type ..\src\engineMedals.js >> %OUTPUT_FILENAME%
echo.>> %OUTPUT_FILENAME%
type ..\src\engineWebGL.js >> %OUTPUT_FILENAME%
echo.>> %OUTPUT_FILENAME%

rem --- BUILD ENGINE MINIFIED ---

set OUTPUT_FILENAME=%ENGINE_NAME%.min.js

rem start with release build
copy %ENGINE_NAME%.release.js %OUTPUT_FILENAME%

rem check code with closure
move %OUTPUT_FILENAME% %OUTPUT_FILENAME%.temp
call npx google-closure-compiler --js=%OUTPUT_FILENAME%.temp --js_output_file=%OUTPUT_FILENAME% --language_out=ECMASCRIPT_2021 --warning_level=VERBOSE --jscomp_off=*
del %OUTPUT_FILENAME%.temp
if %ERRORLEVEL% NEQ 0 (
    pause
    exit /b %ERRORLEVEL%
)

rem lightly minify with uglify
call npx uglifyjs -o %OUTPUT_FILENAME% -- %OUTPUT_FILENAME%
if %ERRORLEVEL% NEQ 0 (
    pause
    exit /b %ERRORLEVEL%
)

rem --- BUILD ENGINE ESM MODULE ---

set OUTPUT_FILENAME=%ENGINE_NAME%.esm.js
type %ENGINE_NAME%.js >> %OUTPUT_FILENAME%
echo.>> %OUTPUT_FILENAME%
type ..\src\engineExport.js >> %OUTPUT_FILENAME%
echo.>> %OUTPUT_FILENAME%

rem --- BUILD ENGINE ESM MODULE RELEASE ---

set OUTPUT_FILENAME=%ENGINE_NAME%.esm.min.js
type %ENGINE_NAME%.min.js >> %OUTPUT_FILENAME%
echo.>> %OUTPUT_FILENAME%
type ..\src\engineExport.js >> %OUTPUT_FILENAME%
echo.>> %OUTPUT_FILENAME%

rem lightly minify with uglify
call npx uglifyjs -o %OUTPUT_FILENAME% -- %OUTPUT_FILENAME%
if %ERRORLEVEL% NEQ 0 (
    pause
    exit /b %ERRORLEVEL%
)

rem --- BUILD TYPESCRIPT DEFINITIONS ---

call npx tsc %ENGINE_NAME%.esm.js --declaration --allowJs --emitDeclarationOnly --outFile %ENGINE_NAME%.d.ts
if %ERRORLEVEL% NEQ 0 (
    pause
    exit /b %ERRORLEVEL%
)

popd