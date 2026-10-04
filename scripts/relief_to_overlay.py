#!/usr/bin/env python3
"""Convert a Blender greyscale relief render into a transparent shade/highlight overlay for the map."""
import json, os, sys
import numpy as np
from PIL import Image
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
for k in sys.argv[1:] or ["trent", "argo"]:
    r = np.array(Image.open(f"{ROOT}/blender/renders/relief_{k}.png").convert("L")).astype(float) / 255
    flat, lo = np.percentile(r, 60), np.percentile(r, 0.5)
    sh = np.clip((flat - r) / (flat - lo + 1e-6), 0, 1) ** 0.8
    hi = np.clip((r - flat) / (1 - flat + 1e-6), 0, 1)
    rgba = np.zeros(r.shape + (4,), np.uint8)
    rgba[..., 0] = np.where(sh > 0, 24, 255); rgba[..., 1] = np.where(sh > 0, 38, 255); rgba[..., 2] = np.where(sh > 0, 52, 250)
    rgba[..., 3] = (np.maximum(sh * 0.62, hi * 0.25) * 255).astype(np.uint8)
    Image.fromarray(rgba, "RGBA").quantize(colors=64, method=Image.FASTOCTREE).save(f"{ROOT}/site/relief_{k}.png", optimize=True)
    print("overlay", k)
