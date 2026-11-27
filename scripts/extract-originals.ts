/**
 * 从 gua-seo.<locale>.json 抽出各语言的经文译文（卦辞/六爻/用九用六），
 * 写成小文件 apps/web/src/data/originals.<locale>.json，供起卦页按语言懒加载、
 * 分享页服务端读取。改了 gua-seo 数据后重跑：
 *   npx -y tsx scripts/extract-originals.ts
 */
import { readFileSync, writeFileSync } from "node:fs";

const LOCALES = ["ja", "ko", "fr", "de", "es", "pt"] as const;
interface Side { judgment?: string; originals?: string[]; extraOriginal?: string }

for (const l of LOCALES) {
  const src = new URL(`../apps/web/src/data/gua-seo.${l}.json`, import.meta.url).pathname;
  const dst = new URL(`../apps/web/src/data/originals.${l}.json`, import.meta.url).pathname;
  const d = JSON.parse(readFileSync(src, "utf8")) as Record<string, Side>;
  const out: Record<string, { j: string; l: string[]; x?: string }> = {};
  for (let n = 1; n <= 64; n++) {
    const e = d[String(n)];
    if (!e?.judgment || !e.originals || e.originals.length !== 6) throw new Error(`${l}: hexagram ${n} incomplete`);
    out[String(n)] = { j: e.judgment, l: e.originals, ...(e.extraOriginal ? { x: e.extraOriginal } : {}) };
  }
  writeFileSync(dst, JSON.stringify(out), "utf8");
  console.log(`${l}: ${Object.keys(out).length} hexagrams → ${dst} (${readFileSync(dst).length} bytes)`);
}
