#!/usr/bin/env python3
"""
10-01 (Neil: 「现在优化呗」): one core font file per CJK face instead of ~60 Google slices per page.

Google slices Noto Serif by its own idea of frequency, ~100 files per family. A zh-hant reading page touched 63 of
them — 3.8 MB on a first visit, most of it glyphs the page never showed. This builds, for each face, ONE woff2 of the
characters our pages and readings actually use, cut to the weights we use (400–600):

  - every character on the live pages of that language (crawled from the running site, sitemap + the app pages),
  - the characters of the readings, questions and follow-ups written in it, most frequent first, until 99.97% of all
    character occurrences are covered.

fetch-cjk-fonts.mjs then puts the core first and takes its characters out of the Google slices' unicode-range, so a
slice downloads only when a page has a character outside the core (a rare name in a question, say).

Run on the server (it reads the live DB and the running site), then copy public/fonts/cjk-core/ back and commit it:
    python3 apps/web/scripts/build-cjk-core.py
Needs fontTools + brotli (pip3 install --user --break-system-packages brotli).
"""
import json, os, re, sqlite3, sys, urllib.request
from collections import Counter
from fontTools.ttLib import TTFont
from fontTools import subset
from fontTools.varLib import instancer

HERE = os.path.dirname(os.path.abspath(__file__))
# tracked in git (public/fonts/cjk/ is the build-time slice cache and is ignored)
OUT = os.path.join(HERE, "..", "public", "fonts", "cjk-core")
SRC = os.path.expanduser("~/yaoflow-data/font-src")
DB = os.path.expanduser("~/yaoflow-data/yaoflow.db")
SITE = os.environ.get("CORE_SITE", "http://localhost:3200")
COVER = 0.9997

FAMILIES = {
    # key: (google/fonts path, page locale, DB locale)
    "tc": ("notoseriftc/NotoSerifTC%5Bwght%5D.ttf", "zh-hant", "zh-hant"),
    "sc": ("notoserifsc/NotoSerifSC%5Bwght%5D.ttf", "zh", "zh"),
    "jp": ("notoserifjp/NotoSerifJP%5Bwght%5D.ttf", "ja", "ja"),
    "kr": ("notoserifkr/NotoSerifKR%5Bwght%5D.ttf", "ko", "ko"),
}
APP_PAGES = ["", "/cast", "/about", "/terms", "/privacy", "/login", "/cases", "/gua", "/gua/table", "/for", "/glossary", "/timing", "/how-to-ask", "/today"]
LOCALES = ["zh", "zh-hant", "en", "ja", "ko", "fr", "de", "es", "pt"]


def cjk(s):
    # every printable character, not only CJK: on a Chinese page the CJK face comes first in the stack, so digits,
    # Latin, arrows and dashes (← — → ▾) come from it too — each of those in its own slice otherwise
    return {ch for ch in s if ord(ch) >= 0x20}


# always in the core when the face has them: ASCII, Latin-1, punctuation, arrows, shapes, CJK punctuation, full-width forms
ALWAYS = set(chr(c) for r in [(0x20, 0x7E), (0xA0, 0xFF), (0x2000, 0x206F), (0x2190, 0x21FF), (0x25A0, 0x25FF), (0x3000, 0x303F), (0xFF00, 0xFFEF)] for c in range(r[0], r[1] + 1))


def get(url):
    try:
        with urllib.request.urlopen(url, timeout=30) as r:
            return r.read().decode("utf-8", "replace")
    except Exception as e:
        print("  skip", url, e, file=sys.stderr)
        return ""


def crawl():
    sm = get(f"{SITE}/sitemap.xml")
    paths = {re.sub(r"^https?://[^/]+", "", u) for u in re.findall(r"<loc>([^<]+)</loc>", sm)}
    # the sitemap leaves some languages' pages out (noindex ones); every page that exists in one language is tried in all
    tails = {re.sub(r"^/[a-z]{2}(-hant)?", "", p) for p in paths} | set(APP_PAGES)
    for l in LOCALES:
        for t in tails:
            paths.add(f"/{l}{t}")
    by_locale = {l: set() for l in LOCALES}
    for i, p in enumerate(sorted(paths)):
        l = p.split("/")[1] if p.count("/") >= 1 else ""
        if l not in by_locale:
            continue
        by_locale[l] |= cjk(get(SITE + p))
        if i % 100 == 0:
            print(f"  crawled {i}/{len(paths)}", flush=True)
    return by_locale


def db_freq():
    con = sqlite3.connect(f"file:{DB}?mode=ro", uri=True)
    freq = {l: Counter() for l in LOCALES}
    q = [
        "SELECT r.locale, r.body_json FROM readings r",
        "SELECT c.locale, c.question FROM casts c",
        "SELECT c.locale, f.content FROM followups f JOIN casts c ON c.id = f.cast_id",
    ]
    for sql in q:
        for loc, text in con.execute(sql):
            if loc in freq and text:
                freq[loc].update(ch for ch in text if ord(ch) >= 0x20)
    return freq


def covering(counter):
    total = sum(counter.values())
    out, acc = [], 0
    for ch, n in counter.most_common():
        if total and acc / total >= COVER:
            break
        out.append(ch)
        acc += n
    return set(out)


def build_font(key, chars):
    path, _, _ = FAMILIES[key]
    os.makedirs(SRC, exist_ok=True)
    src = os.path.join(SRC, f"{key}-VF.ttf")
    if not os.path.exists(src):
        print(f"  downloading {key} source font", flush=True)
        urllib.request.urlretrieve(f"https://github.com/google/fonts/raw/main/ofl/{path}", src)
    f = TTFont(src)
    cmap = f.getBestCmap()
    chars = {c for c in (chars | ALWAYS) if ord(c) in cmap}
    o = subset.Options()
    o.layout_features = ["*"]
    o.name_IDs = ["*"]
    o.notdef_outline = True
    o.hinting = False
    s = subset.Subsetter(o)
    s.populate(unicodes=[ord(c) for c in chars])
    s.subset(f)
    f = instancer.instantiateVariableFont(f, {"wght": (400, 600)})
    f.flavor = "woff2"
    out = os.path.join(OUT, f"{key}-core.woff2")
    f.save(out)
    with open(os.path.join(OUT, f"{key}-core.json"), "w", encoding="utf-8") as fh:
        json.dump({"chars": "".join(sorted(chars)), "file": f"{key}-core.woff2"}, fh, ensure_ascii=False)
    return len(chars), os.path.getsize(out)


def main():
    os.makedirs(OUT, exist_ok=True)
    print("crawling the site…", flush=True)
    pages = crawl()
    print("reading the DB…", flush=True)
    freq = db_freq()
    # classical text on non-Chinese pages is set in the TC face (altLang) — its characters belong to the TC core
    han_elsewhere = set().union(*(pages[l] for l in ["en", "fr", "de", "es", "pt", "ja", "ko"]))
    han_elsewhere = {c for c in han_elsewhere if 0x3400 <= ord(c) <= 0x9FFF or 0xF900 <= ord(c) <= 0xFAFF}
    want = {
        "tc": pages["zh-hant"] | covering(freq["zh-hant"]) | han_elsewhere,
        "sc": pages["zh"] | covering(freq["zh"]),
        "jp": pages["ja"] | covering(freq["ja"]),
        "kr": pages["ko"] | covering(freq["ko"]),
    }
    only = sys.argv[1:] or list(FAMILIES)
    for key in only:
        n, size = build_font(key, want[key])
        print(f"[core] {key}: {n} chars, {size // 1024} KB", flush=True)


if __name__ == "__main__":
    main()
