rem Simple build script for LittleJS by Frank Force
rem Minfies and combines index.html and index.js and zips the result
rem Run engine\buildSetup.bat first to install dependencies

set NAME=game
set BUILD_FOLDER=build
set BUILD_FILENAME=index.js

rem rebuild engine first
cd engine
call engineBuild.bat
if %ERRORLEVEL% NEQ 0 (
    pause
    exit /b %ERRORLEVEL%
)
cd ..

rem remove old files
del %NAME%.zip
rmdir /s /q %BUILD_FOLDER%

rem copy engine release build
mkdir %BUILD_FOLDER%
cd %BUILD_FOLDER%
type ..\engine\engine.all.release.js >> %BUILD_FILENAME%
echo. >> %BUILD_FILENAME%

rem add your game's files to include here
type ..\game.js >> %BUILD_FILENAME%
echo. >> %BUILD_FILENAME%

rem copy images to build folder
copy ..\tiles.png tiles.png

rem minify code with closure
move %BUILD_FILENAME% %BUILD_FILENAME%.temp
call google-closure-compiler --js %BUILD_FILENAME%.temp --js_output_file %BUILD_FILENAME% --compilation_level ADVANCED --language_out ECMASCRIPT_2019 --warning_level VERBOSE --jscomp_off * --assume_function_wrapper
if %ERRORLEVEL% NEQ 0 (
    pause
    exit /b %ERRORLEVEL%
)
del %BUILD_FILENAME%.temp

rem more minification with uglify or terser (they both do about the same)
call uglifyjs -o %BUILD_FILENAME% --compress --mangle -- %BUILD_FILENAME%
rem call terser -o %BUILD_FILENAME% --compress --mangle -- %BUILD_FILENAME%
if %ERRORLEVEL% NEQ 0 (
    pause
    exit /b %ERRORLEVEL%
)

rem roadroaller compresses the code better then zip
copy %BUILD_FILENAME% roadroller_%BUILD_FILENAME%
call roadroller roadroller_%BUILD_FILENAME% -o roadroller_%BUILD_FILENAME%
if %ERRORLEVEL% NEQ 0 (
    pause
    exit /b %ERRORLEVEL%
)

rem build the html
echo ^<body^>^<meta charset=utf-8^>^<script^> >> index.html
type roadroller_%BUILD_FILENAME% >> index.html
echo ^</script^> >> index.html

rem zip the result, ect is recommended
call ect -9 -strip -zip ..\%NAME%.zip index.html tiles.png
if %ERRORLEVEL% NEQ 0 (
    pause
    exit /b %ERRORLEVEL%
)

cd ..

rem pause to see result