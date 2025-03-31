@echo off

set ESBUILD=tools\esbuild\esbuild.exe
set OUTDIR=dist

mkdir "%OUTDIR%"
copy "banner.txt" "%OUTDIR%\wchisp.js"
"%ESBUILD%" --bundle "wchisp.js" >> "%OUTDIR%\wchisp.js"
copy "banner.txt" "%OUTDIR%\style.css"
"%ESBUILD%" --bundle "style.css" --loader:.svg=dataurl >> "%OUTDIR%\style.css"
copy "index.html" "%OUTDIR%\index.html"
