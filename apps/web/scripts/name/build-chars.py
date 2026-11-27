#!/usr/bin/env python3
"""
10-29 进度表 122 姓名學 — the character base from Unicode Unihan (no dictionary text copied):
  · the 3,500 characters of 通用规范汉字表 level 1 (kTGH 2013 serial ≤ 3500), each with its traditional form;
  · 康熙筆劃: the traditional form's radical (kRSUnicode) counted as its full Kangxi radical (氵→水 4, 扌→手 4,
    艹→艸 6, 阝→阜 8 / 邑 7, 王→玉 5, 月(肉)→肉 6 …) plus the residual strokes; 一…十 counted by their value (the
    common 姓名學 rule, stated on the page);
  · 讀音: kMandarin (pinyin, converted to 注音 here), kCantonese (粵拼);
  · 字的五行: by radical when the radical is one of a short fixed list, otherwise by the initial sound (五音, marked 參考).
Usage: python3 build-chars.py <unihan dir> <out.json>
"""
import sys, json, re, unicodedata
D = sys.argv[1]; OUT = sys.argv[2]
# the traditional form of each simplified character, from OpenCC (scripts/name/hant-map.mjs) — Unihan's kTraditionalVariant lists 刘 as its own
HANT = json.load(open(sys.argv[3], encoding="utf8")) if len(sys.argv) > 3 else {}
LEVEL_MAX = 6500
def load(fn, keys):
    out = {}
    for line in open(f"{D}/{fn}", encoding="utf8"):
        if line.startswith("#") or not line.strip(): continue
        cp, k, v = line.rstrip("\n").split("\t", 2)
        if k in keys: out.setdefault(cp, {})[k] = v
    return out
irg = load("Unihan_IRGSources.txt", {"kRSUnicode", "kTotalStrokes"})
rd = load("Unihan_Readings.txt", {"kMandarin", "kCantonese"})
var = load("Unihan_Variants.txt", {"kTraditionalVariant", "kSimplifiedVariant"})
oth = load("Unihan_OtherMappings.txt", {"kTGH"})
ch = lambda cp: chr(int(cp[2:], 16))
cpof = lambda c: "U+%04X" % ord(c)
# radical number → its own stroke count (the character whose kRSUnicode is "n.0" with the lowest code point)
rad = {}
for cp, v in irg.items():
    rs = v.get("kRSUnicode", "").split(" ")[0]
    m = re.match(r"^(\d+)'?\.0$", rs)
    if m and "'" not in rs and "kTotalStrokes" in v:
        n = int(m.group(1)); s = int(v["kTotalStrokes"].split(" ")[0])
        if n not in rad or int(cp[2:], 16) < rad[n][1]: rad[n] = (s, int(cp[2:], 16))
RAD = {n: s for n, (s, _) in rad.items()}
# the radicals whose usual form is a short one but are counted as the full form
for n, full in {85: 4, 64: 4, 61: 4, 94: 4, 113: 5, 96: 5, 140: 6, 162: 7, 163: 7, 170: 8, 130: 6, 145: 6, 122: 6, 125: 6}.items(): RAD[n] = full
NUM = dict(zip("一二三四五六七八九十", range(1, 11)))
def kx(c):
    if c in NUM: return NUM[c], "數字依字義"
    v = irg.get(cpof(c), {}); rs = v.get("kRSUnicode", "").split(" ")[0]
    m = re.match(r"^(\d+)('?)\.(-?\d+)$", rs)
    if not m: return None, None
    n, simp, res = int(m.group(1)), m.group(2), int(m.group(3))
    if simp: return None, None
    return RAD.get(n, 0) + res, None
WX_RAD = {75: "木", 140: "木", 118: "木", 115: "木", 86: "火", 72: "火", 32: "土", 46: "土", 112: "土", 102: "土", 167: "金", 96: "金", 85: "水", 173: "水", 15: "水"}
def wx_of(c, py):
    v = irg.get(cpof(c), {}); rs = v.get("kRSUnicode", "").split(" ")[0]
    m = re.match(r"^(\d+)", rs)
    if m and int(m.group(1)) in WX_RAD: return WX_RAD[int(m.group(1))], "部首"
    p = unicodedata.normalize("NFD", py).encode("ascii", "ignore").decode()
    for ini, el in (("zh", "金"), ("ch", "金"), ("sh", "金")):
        if p.startswith(ini): return el, "讀音"
    first = p[:1]
    if first in "bpmf": return "水", "讀音"
    if first in "dtnl": return "火", "讀音"
    if first in "gkh": return "木", "讀音"
    if first in "jqxrzcs": return "金", "讀音"
    return "土", "讀音"
# pinyin → 注音
INI = [("zh","ㄓ"),("ch","ㄔ"),("sh","ㄕ"),("b","ㄅ"),("p","ㄆ"),("m","ㄇ"),("f","ㄈ"),("d","ㄉ"),("t","ㄊ"),("n","ㄋ"),("l","ㄌ"),("g","ㄍ"),("k","ㄎ"),("h","ㄏ"),("j","ㄐ"),("q","ㄑ"),("x","ㄒ"),("r","ㄖ"),("z","ㄗ"),("c","ㄘ"),("s","ㄙ")]
FIN = {"iou":"ㄧㄡ","uei":"ㄨㄟ","uen":"ㄨㄣ","ueng":"ㄨㄥ","io":"ㄧㄛ","ê":"ㄝ","a":"ㄚ","o":"ㄛ","e":"ㄜ","ai":"ㄞ","ei":"ㄟ","ao":"ㄠ","ou":"ㄡ","an":"ㄢ","en":"ㄣ","ang":"ㄤ","eng":"ㄥ","ong":"ㄨㄥ","er":"ㄦ",
 "i":"ㄧ","ia":"ㄧㄚ","ie":"ㄧㄝ","iao":"ㄧㄠ","iu":"ㄧㄡ","ian":"ㄧㄢ","in":"ㄧㄣ","iang":"ㄧㄤ","ing":"ㄧㄥ","iong":"ㄩㄥ",
 "u":"ㄨ","ua":"ㄨㄚ","uo":"ㄨㄛ","uai":"ㄨㄞ","ui":"ㄨㄟ","uan":"ㄨㄢ","un":"ㄨㄣ","uang":"ㄨㄤ","ü":"ㄩ","üe":"ㄩㄝ","üan":"ㄩㄢ","ün":"ㄩㄣ","ue":"ㄩㄝ","v":"ㄩ"}
TONE = {"̄": 1, "́": 2, "̌": 3, "̀": 4}
def zhuyin(py):
    d = unicodedata.normalize("NFD", py); tone = 5
    for k, t in TONE.items():
        if k in d: tone = t
    p = "".join(x for x in d if x not in TONE).replace("ü", "ü")
    p = unicodedata.normalize("NFC", p)
    ini = ""
    for a, b in INI:
        if p.startswith(a): ini, p = b, p[len(a):]; break
    if ini in ("ㄐ", "ㄑ", "ㄒ") and p.startswith("u"): p = "ü" + p[1:]
    if not ini:
        if p.startswith("yu"): p = "ü" + p[2:]
        elif p.startswith("yi"): p = p[1:]
        elif p.startswith("y"): p = "i" + p[1:]
        elif p.startswith("wu"): p = p[1:]
        elif p.startswith("w"): p = "u" + p[1:]
    if ini in ("ㄓ","ㄔ","ㄕ","ㄖ","ㄗ","ㄘ","ㄙ") and p == "i": fin = ""
    else: fin = FIN.get(p)
    if fin is None: return None
    mark = {1: "", 2: "ˊ", 3: "ˇ", 4: "ˋ", 5: "˙"}[tone]
    return ("˙" + ini + fin) if tone == 5 else ini + fin + mark
lvl = []
for cp, v in oth.items():
    m = re.match(r"2013:(\d+)", v.get("kTGH", ""))
    if m and int(m.group(1)) <= LEVEL_MAX: lvl.append((int(m.group(1)), cp))
lvl.sort()
out = []
for serial, cp in lvl:
    hans = ch(cp)
    trad = [ch(x) for x in var.get(cp, {}).get("kTraditionalVariant", "").split(" ") if x]
    hant = HANT.get(hans) or (trad[0] if trad else hans)
    trad = [t for t in trad if t != hant and t != hans]
    r = rd.get(cpof(hant), rd.get(cp, {}))
    pys = r.get("kMandarin", "").split(" ")
    py = pys[0] if pys and pys[0] else None
    if not py: continue
    stroke, note = kx(hant)
    if stroke is None: continue
    el, by = wx_of(hant, py)
    out.append({"n": serial, "lv": 1 if serial <= 3500 else 2, "hans": hans, "hant": hant, "alt": trad[1:3], "kx": stroke, "kxNote": note, "total": int(irg.get(cpof(hant), {}).get("kTotalStrokes", "0").split(" ")[0] or 0),
                "py": py, "zy": zhuyin(py), "jp": (r.get("kCantonese", "").split(" ") or [""])[0], "wx": el, "wxBy": by})
# 后／後, 干／乾…: when the simplified form is itself a traditional character, it keeps a page of its own too
seen = {x["hant"] for x in out}
for x in list(out):
    if x["hans"] != x["hant"] and x["hans"] not in seen and x["hans"] in [ch(v) for v in var.get(cpof(x["hans"]), {}).get("kTraditionalVariant", "").split(" ") if v]:
        st, nt = kx(x["hans"]); el, by = wx_of(x["hans"], x["py"])
        if st: out.append({**x, "hant": x["hans"], "alt": [], "kx": st, "kxNote": nt, "wx": el, "wxBy": by}); seen.add(x["hans"])
json.dump(out, open(OUT, "w", encoding="utf8"), ensure_ascii=False, indent=0)
print(len(out), "chars;", sum(1 for x in out if x["zy"] is None), "without zhuyin;", sum(1 for x in out if x["wxBy"] == "部首"), "by radical")
