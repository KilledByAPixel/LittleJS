rem Build documentation for LittleJS

call jsdoc -c config.json
if %ERRORLEVEL% NEQ 0 (
    pause
    exit /b %ERRORLEVEL%
)