rem Simple build script for LittleJS Engine by Frank Force
rem minfies and combines index.html and index.js and zips the result

rem --- BUILD ENGINE DEBUG ---

set OUTPUT_FILENAME=engine.all.js

rem remove old files
del %OUTPUT_FILENAME%

rem combine code
type engineDebug.js >> %OUTPUT_FILENAME%
echo.>> %OUTPUT_FILENAME%
type engineUtil.js >> %OUTPUT_FILENAME%
echo.>> %OUTPUT_FILENAME%
type engineConfig.js >> %OUTPUT_FILENAME%
echo.>> %OUTPUT_FILENAME%
type engine.js >> %OUTPUT_FILENAME%
echo.>> %OUTPUT_FILENAME%
type engineAudio.js >> %OUTPUT_FILENAME%
echo.>> %OUTPUT_FILENAME%
type engineObject.js >> %OUTPUT_FILENAME%
echo.>> %OUTPUT_FILENAME%
type engineTileLayer.js >> %OUTPUT_FILENAME%
echo.>> %OUTPUT_FILENAME%
type engineInput.js >> %OUTPUT_FILENAME%
echo.>> %OUTPUT_FILENAME%
type engineParticle.js >> %OUTPUT_FILENAME%
echo.>> %OUTPUT_FILENAME%
type engineWebGL.js >> %OUTPUT_FILENAME%
echo.>> %OUTPUT_FILENAME%
type engineDraw.js >> %OUTPUT_FILENAME%
echo.>> %OUTPUT_FILENAME%

rem --- BUILD ENGINE MINFIED RELEASE ---

set OUTPUT_FILENAME=engine.all.min.js

rem remove old files
del %OUTPUT_FILENAME%

rem combine code
type engineRelease.js >> %OUTPUT_FILENAME%
echo.>> %OUTPUT_FILENAME%
type engineUtil.js >> %OUTPUT_FILENAME%
echo.>> %OUTPUT_FILENAME%
type engineConfig.js >> %OUTPUT_FILENAME%
echo.>> %OUTPUT_FILENAME%
type engine.js >> %OUTPUT_FILENAME%
echo.>> %OUTPUT_FILENAME%
type engineAudio.js >> %OUTPUT_FILENAME%
echo.>> %OUTPUT_FILENAME%
type engineObject.js >> %OUTPUT_FILENAME%
echo.>> %OUTPUT_FILENAME%
type engineTileLayer.js >> %OUTPUT_FILENAME%
echo.>> %OUTPUT_FILENAME%
type engineInput.js >> %OUTPUT_FILENAME%
echo.>> %OUTPUT_FILENAME%
type engineParticle.js >> %OUTPUT_FILENAME%
echo.>> %OUTPUT_FILENAME%
type engineWebGL.js >> %OUTPUT_FILENAME%
echo.>> %OUTPUT_FILENAME%
type engineDraw.js >> %OUTPUT_FILENAME%
echo.>> %OUTPUT_FILENAME%

rem check code with closure
MOVE %OUTPUT_FILENAME% %OUTPUT_FILENAME%.temp
call google-closure-compiler --js %OUTPUT_FILENAME%.temp --js_output_file %OUTPUT_FILENAME% --language_out ECMASCRIPT_2019 --warning_level VERBOSE --jscomp_off *
del %OUTPUT_FILENAME%.temp
if %ERRORLEVEL% NEQ 0 (
    pause
    exit /b %ERRORLEVEL%
)

rem lightly minify with uglify
call uglifyjs -o  %OUTPUT_FILENAME% -- %OUTPUT_FILENAME%
if %ERRORLEVEL% NEQ 0 (
    pause
    exit /b %ERRORLEVEL%
)