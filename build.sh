#!/bin/sh

ESBUILD="tools/esbuild/bin/esbuild"
OUTDIR="dist"

mkdir -p "$OUTDIR"
cp "banner.txt" "$OUTDIR/wchisp.js"
"$ESBUILD" --bundle "wchisp.js" >> "$OUTDIR/wchisp.js"
cp "banner.txt" "$OUTDIR/style.css"
"$ESBUILD" --bundle "style.css" --loader:.svg=dataurl >> "$OUTDIR/style.css"
cp "index.html" "$OUTDIR/index.html"
