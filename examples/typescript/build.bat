rem LittleJS Build Script
call node build.js

@echo off
if %ERRORLEVEL% neq 0 ( pause )