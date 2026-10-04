#!/usr/bin/env python3
"""Assemble site/index.html from src/ (concatenates src/js/*.js in order, inlines MapLibre CSS)."""
import glob, hashlib, json, os, shutil
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
src = lambda *p: os.path.join(ROOT, "src", *p)
js = "\n".join(open(f).read() for f in sorted(glob.glob(src("js", "*.js"))))
body = open(src("app.src.html")).read().replace("/*MAPLIBRE_CSS*/", open(src("maplibre.css")).read()).replace("/*APP_JS*/", js)
head = ('<!doctype html><html lang="en"><head><meta charset="utf-8">'
        '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover,interactive-widget=resizes-content">'
        '<meta name="color-scheme" content="light dark">'
        '<meta name="mobile-web-app-capable" content="yes"><meta name="apple-mobile-web-app-capable" content="yes">'
        '<meta name="theme-color" content="#F4F6F6" media="(prefers-color-scheme: light)">'
        '<meta name="theme-color" content="#0B1115" media="(prefers-color-scheme: dark)"><link rel="manifest" href="manifest.webmanifest">'
        '<link rel="icon" href="icon-192.png"><link rel="apple-touch-icon" href="apple-touch-icon.png"></head><body style="margin:0">')
open(os.path.join(ROOT, "site", "index.html"), "w").write(head + body + "</body></html>")
print("site/index.html written")

# PWA: copy the manifest, then write sw.js with a precache list of everything in site/ and a content-hash version.
shutil.copy(src("manifest.webmanifest"), os.path.join(ROOT, "site", "manifest.webmanifest"))
site = os.path.join(ROOT, "site")
files = sorted(f for f in os.listdir(site) if f != "sw.js" and os.path.isfile(os.path.join(site, f)))
h = hashlib.sha256()
for f in files: h.update(f.encode()); h.update(open(os.path.join(site, f), "rb").read())
sw = open(src("sw.js")).read().replace("/*VERSION*/", h.hexdigest()[:10]).replace("/*PRECACHE*/", json.dumps(["./"] + [f for f in files if f != "manifest.webmanifest"]))
open(os.path.join(site, "sw.js"), "w").write(sw)
print("site/sw.js written,", len(files), "files precached")
