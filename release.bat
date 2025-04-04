@echo off

set ZIP=C:\Program Files\7-Zip\7z.exe
set OUTDIR=dist
set RELDIR=release

mkdir "%RELDIR%"
"%ZIP%" a "%RELDIR%\wch-web-isp.zip" "%OUTDIR%\*" "README.md" "LICENSE.txt"
