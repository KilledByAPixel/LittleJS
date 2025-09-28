rem LittleJS Build Script
call npm run build
if %errorlevel% neq 0 (
    echo Build failed with error level %errorlevel%
    pause
    exit /b %errorlevel%
)