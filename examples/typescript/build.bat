rem TypeScript build script for LittleJS by Frank Force

set BUILD_FOLDER=build

call npx tsc
if %ERRORLEVEL% NEQ 0 (
    pause
    exit /b %ERRORLEVEL%
)

rem copy output js file and remove build folder

copy %BUILD_FOLDER%\examples\typescript\game.js game.js
rmdir /s /q %BUILD_FOLDER%