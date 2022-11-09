echo off
@echo Max allowed for js13k: 13,312 bytes
@echo Your file size: %~z1
if %~z1 LSS 13312 echo You have room 
if %~z1 EQU 13312 echo Exact match!
if %~z1 GTR 13312 echo Too big!
