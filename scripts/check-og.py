#!/usr/bin/env python3
"""
OG-card geometry check. Renders lie; pixels don't.

Fetches share cards for known casts and asserts, per drawn line:
  - yang rows are ONE segment spanning the full figure width
  - yin rows are TWO equal segments with a real notch between them
  - all rows share the same left and right extents

This exists because satori silently ignored justify-content and fused the
yin halves into one short bar — four visual reviews missed it; a user who
could read the figure caught it. Run after every deploy that touches OG:

    python3 scripts/check-og.py https://yaoflow.com
"""
import sys
import urllib.request
from io import BytesIO

from PIL import Image

BASE = sys.argv[1] if len(sys.argv) > 1 else "https://yaoflow.com"

# code → expected row kinds top-down (S=solid, B=broken)
CASES = {
    "777777": "SSSSSS",
    "888888": "BBBBBB",
    "778997": "SSSBSS",  # 履: broken only at line 3
    "789878": "BSBSBS",  # 既济
}

def dark(p):
    r, g, b = p[:3]
    return (r < 80 and g < 80 and b < 80) or (120 < r < 210 and g < 95 and b < 95)

def rows_of(im):
    w, h = im.size
    px = im.load()
    out, y = [], 0
    while y < h:
        if any(dark(px[x, y]) for x in range(620, w, 3)):
            y2 = y
            while y2 + 1 < h and any(dark(px[x, y2 + 1]) for x in range(620, w, 3)):
                y2 += 1
            mid = (y + y2) // 2
            xs = [x for x in range(620, w) if dark(px[x, mid])]
            segs, s, prev = [], xs[0], xs[0]
            for x in xs[1:]:
                if x - prev > 4:
                    segs.append((s, prev)); s = x
                prev = x
            segs.append((s, prev))
            out.append(segs)
            y = y2 + 3
        else:
            y += 1
    return out

fails = 0
for code, kinds in CASES.items():
    url = f"{BASE}/en/share/{code}/opengraph-image"
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (og-check)"})
    im = Image.open(BytesIO(urllib.request.urlopen(req, timeout=30).read())).convert("RGB")
    rows = rows_of(im)
    if len(rows) != 6:
        print(f"✗ {code}: found {len(rows)} rows, want 6"); fails += 1; continue
    lefts = {r[0][0] for r in rows}
    rights = {r[-1][1] for r in rows}
    if max(lefts) - min(lefts) > 2 or max(rights) - min(rights) > 2:
        print(f"✗ {code}: rows not aligned L{sorted(lefts)} R{sorted(rights)}"); fails += 1
    for i, (segs, kind) in enumerate(zip(rows, kinds)):
        if kind == "S" and len(segs) != 1:
            print(f"✗ {code} row{i+1}: want solid, got {len(segs)} segs"); fails += 1
        if kind == "B":
            if len(segs) != 2:
                print(f"✗ {code} row{i+1}: want broken, got {len(segs)} seg(s)"); fails += 1
            else:
                gap = segs[1][0] - segs[0][1] - 1
                a, b = segs[0][1] - segs[0][0], segs[1][1] - segs[1][0]
                if gap < 20:
                    print(f"✗ {code} row{i+1}: notch only {gap}px"); fails += 1
                if abs(a - b) > 3:
                    print(f"✗ {code} row{i+1}: halves uneven {a} vs {b}"); fails += 1
    if fails == 0:
        print(f"✓ {code} {kinds}")

sys.exit(1 if fails else 0)
