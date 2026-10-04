#!/usr/bin/env python3
"""Assemble site/index.html from src/ (concatenates src/js/*.js in order, inlines MapLibre CSS)."""
import glob, os
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
src = lambda *p: os.path.join(ROOT, "src", *p)
js = "\n".join(open(f).read() for f in sorted(glob.glob(src("js", "*.js"))))
body = open(src("app.src.html")).read().replace("/*MAPLIBRE_CSS*/", open(src("maplibre.css")).read()).replace("/*APP_JS*/", js)
head = ('<!doctype html><html lang="en"><head><meta charset="utf-8">'
        '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">'
        '<meta name="theme-color" content="#0B6E82"></head><body style="margin:0">')
open(os.path.join(ROOT, "site", "index.html"), "w").write(head + body + "</body></html>")
print("site/index.html written")
