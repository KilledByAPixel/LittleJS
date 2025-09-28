rem LittleJS Build Script
call node build.js
if %errorlevel% neq 0 (
    echo Build failed with error level %errorlevel%
    pause
    exit /b %errorlevel%
)