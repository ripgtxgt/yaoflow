// 09-29 PageSpeed: the four CJK faces came in through next/font in the shared
// locale layout, so every page — English included — carried four render-blocking
// stylesheets (~95 KB each over the wire, ~370 KB in all) for faces it never used.
//
// Now each face is a plain stylesheet under public/fonts/cjk/, and the layout
// links only the one(s) a page needs. This script builds them before `next build`:
// the Google Fonts CSS for each family, every woff2 slice downloaded next to it
// (self-hosted — Google Fonts is blocked in mainland China), one @font-face per
// slice with a weight RANGE (the families are variable, so 400/500/600 share one
// file — a third of the CSS next/font wrote).
//
// Files already on disk are kept, so a redeploy only fetches what changed. If the
// network is down the build goes on; pages fall back to the system serif.
import { mkdir, readFile, writeFile, access } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(here, "..", "public", "fonts", "cjk");
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
export const FAMILIES = {
  sc: { google: "Noto+Serif+SC", name: "yf-serif-sc" },
  tc: { google: "Noto+Serif+TC", name: "yf-serif-tc" },
  jp: { google: "Noto+Serif+JP", name: "yf-serif-jp" },
  kr: { google: "Noto+Serif+KR", name: "yf-serif-kr" },
};

const exists = (p) => access(p).then(() => true, () => false);

async function fetchRetry(url, as = "text", tries = 3) {
  for (let i = 0; ; i++) {
    try {
      const r = await fetch(url, { headers: { "user-agent": UA } });
      if (!r.ok) throw new Error(`${r.status} ${url}`);
      return as === "text" ? await r.text() : Buffer.from(await r.arrayBuffer());
    } catch (e) {
      if (i + 1 >= tries) throw e;
      await new Promise((ok) => setTimeout(ok, 1000 * (i + 1)));
    }
  }
}

async function build(key, { google, name }) {
  const dir = path.join(OUT, key);
  await mkdir(dir, { recursive: true });
  const css = await fetchRetry(`https://fonts.googleapis.com/css2?family=${google}:wght@400;500;600&display=swap`);
  // one rule per distinct file: the three weight blocks point at the same variable slice
  const seen = new Map();
  for (const block of css.split("@font-face").slice(1)) {
    const url = /url\((https:[^)]+\.woff2)\)/.exec(block)?.[1];
    const range = /unicode-range:\s*([^;]+);/.exec(block)?.[1];
    if (url && range && !seen.has(url)) seen.set(url, range.trim().replace(/,\s+/g, ","));
  }
  if (!seen.size) throw new Error(`no slices for ${key}`);
  const urls = [...seen.keys()];
  let fetched = 0;
  // a few at a time: the server is small and shares its link
  for (let i = 0; i < urls.length; i += 8) {
    await Promise.all(urls.slice(i, i + 8).map(async (u) => {
      const file = createHash("sha1").update(u).digest("hex").slice(0, 16) + ".woff2";
      const dest = path.join(dir, file);
      if (!(await exists(dest))) { await writeFile(dest, await fetchRetry(u, "buf")); fetched++; }
    }));
  }
  // 10-01: the core file (scripts/build-cjk-core.py) — the characters our pages and readings use, in one woff2.
  // It goes first, and its characters leave the slices' ranges, so a slice loads only for a character outside it.
  const core = await loadCore(key);
  const rules = [];
  if (core) {
    rules.push(`@font-face{font-family:"${name}";font-style:normal;font-weight:400 600;font-display:swap;src:url(/fonts/cjk-core/${core.file}) format("woff2");unicode-range:${encodeRange(core.cps)}}`);
  }
  let kept = 0;
  for (const u of urls) {
    const file = createHash("sha1").update(u).digest("hex").slice(0, 16) + ".woff2";
    let range = seen.get(u);
    if (core) {
      // below U+2E80 (Latin, punctuation, arrows, shapes) the core already has what this face draws; a slice
      // claiming that block only downloads itself for a ▾ or a line break (10-01: 4 slices on every page)
      const left = decodeRange(range).filter((cp) => cp >= 0x2e80 && !core.cps.has(cp));
      if (!left.length) continue;
      range = encodeRange(left);
    }
    kept++;
    rules.push(`@font-face{font-family:"${name}";font-style:normal;font-weight:400 600;font-display:swap;src:url(/fonts/cjk/${key}/${file}) format("woff2");unicode-range:${range}}`);
  }
  const sheet = rules.join("\n") + "\n";
  await writeFile(path.join(OUT, `${key}.css`), sheet);
  // the slices alone, for pages where this face only sets a few lines (the classical text on an English or Japanese
  // page): five characters should cost a few small slices, not the whole core
  const plain = urls.map((u) => {
    const file = createHash("sha1").update(u).digest("hex").slice(0, 16) + ".woff2";
    return `@font-face{font-family:"${name}";font-style:normal;font-weight:400 600;font-display:swap;src:url(/fonts/cjk/${key}/${file}) format("woff2");unicode-range:${seen.get(u)}}`;
  }).join("\n") + "\n";
  await writeFile(path.join(OUT, `${key}-slices.css`), plain);
  versions[key] = createHash("sha1").update(sheet).digest("hex").slice(0, 10);
  versions[`${key}-slices`] = createHash("sha1").update(plain).digest("hex").slice(0, 10);
  return { key, slices: kept, fetched, core: core ? core.cps.size : 0 };
}

const CORE_DIR = path.join(here, "..", "public", "fonts", "cjk-core");
async function loadCore(key) {
  try {
    const j = JSON.parse(await readFile(path.join(CORE_DIR, `${key}-core.json`), "utf8"));
    const buf = await readFile(path.join(CORE_DIR, j.file));
    // the file name carries its hash, so a rebuilt core is a new URL (the folder is cached as immutable)
    const hash = createHash("sha1").update(buf).digest("hex").slice(0, 10);
    const file = `${key}-core.${hash}.woff2`;
    if (!(await exists(path.join(CORE_DIR, file)))) await writeFile(path.join(CORE_DIR, file), buf);
    return { file, cps: new Set([...j.chars].map((c) => c.codePointAt(0))) };
  } catch {
    return null;
  }
}

/** "U+4e00-4e0f,U+3000" → code points */
export function decodeRange(s) {
  const out = [];
  for (const part of s.split(",")) {
    const m = /U\+([0-9a-f?]+)(?:-([0-9a-f]+))?/i.exec(part.trim());
    if (!m) continue;
    if (m[1].includes("?")) {
      const lo = parseInt(m[1].replace(/\?/g, "0"), 16), hi = parseInt(m[1].replace(/\?/g, "f"), 16);
      for (let c = lo; c <= hi; c++) out.push(c);
      continue;
    }
    const lo = parseInt(m[1], 16), hi = m[2] ? parseInt(m[2], 16) : lo;
    for (let c = lo; c <= hi; c++) out.push(c);
  }
  return out;
}

/** code points → "U+4e00-4e0f,U+3000", runs merged */
export function encodeRange(cps) {
  const a = [...new Set(cps)].sort((x, y) => x - y);
  const parts = [];
  for (let i = 0; i < a.length; ) {
    let j = i;
    while (j + 1 < a.length && a[j + 1] === a[j] + 1) j++;
    parts.push(i === j ? `U+${a[i].toString(16)}` : `U+${a[i].toString(16)}-${a[j].toString(16)}`);
    i = j + 1;
  }
  return parts.join(",");
}

// 10-01: the sheets are cached a day at Cloudflare and in browsers; the layout asks for `?v=<content hash>` so a
// changed sheet reaches everyone on the next deploy (src/lib/cjk-fonts.json, read by [locale]/layout.tsx)
const versions = {};
const VERSIONS = path.join(here, "..", "src", "lib", "cjk-fonts.json");

try {
  await mkdir(OUT, { recursive: true });
  for (const [k, f] of Object.entries(FAMILIES)) {
    try {
      const r = await build(k, f);
      console.log(`[cjk-fonts] ${r.key}: core ${r.core} chars + ${r.slices} slices, ${r.fetched} downloaded`);
    } catch (e) {
      const have = await exists(path.join(OUT, `${k}.css`));
      console.warn(`[cjk-fonts] ${k}: ${e.message}${have ? " — keeping the copy on disk" : " — pages fall back to the system serif"}`);
    }
  }
} catch (e) {
  console.warn("[cjk-fonts] skipped:", e.message);
}
// keep the old version for a face whose fetch failed this time (its sheet on disk is unchanged)
try {
  const prev = JSON.parse(await readFile(VERSIONS, "utf8"));
  await writeFile(VERSIONS, JSON.stringify({ ...prev, ...versions }, null, 2) + "\n");
} catch {
  await writeFile(VERSIONS, JSON.stringify(versions, null, 2) + "\n").catch(() => {});
}
