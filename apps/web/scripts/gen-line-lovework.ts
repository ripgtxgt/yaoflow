/**
 * 10-28 进度表 117 ④ (卦页逐爻小标题): for each of the 384 lines, one plain sentence for 感情 and one for 工作, written by
 * the ops model (Claude, lib/support-llm.ts opsJson) from the line text and our own plain gloss, checked here, and kept
 * in src/data/gua-line-lovework.json (hans + hant). Resumable: hexagrams already in the file are skipped.
 *
 *   DATA_DIR=… ../../node_modules/.bin/vite-node --config vitest.config.ts scripts/gen-line-lovework.ts [from] [to]
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { textsFor } from "@yaoflow/engine";
import { GUA, guaSeoFor } from "../src/lib/gua";
import { opsJson } from "../src/lib/support-llm";
import { toHant } from "../src/lib/hant";

const OUT = join(__dirname, "../src/data/gua-line-lovework.json");
type Line = { loveHans: string; workHans: string; loveHant: string; workHant: string };
const data: Record<string, Line[]> = existsSync(OUT) ? JSON.parse(readFileSync(OUT, "utf8")) : {};

export const LINE_BANNED = /準確|很準|準不準|算得準|准确|准不准|很准|靈驗|灵验|AI|人工智能|神明|化解|改運|改运|注定|一定會|一定会|保證|保证|必定|大吉|大凶|凶兆|吉兆|分手吧|離開他|离开他/;
const ok = (s: unknown) => typeof s === "string" && [...s].length >= 18 && [...s].length <= 60 && !LINE_BANNED.test(s) && !/\n/.test(s);

const SYSTEM = [
  "你在为一个周易网站的卦页写「每一爻放在感情、工作上怎么读」。读者是搜到这一爻的普通人，不懂术语。",
  "每一爻写两句简体中文：love 一句、work 一句，各 22–45 个字。",
  "要求：从这一爻的爻辞和它在卦里的位置出发，用白话说它提醒人在感情上／工作上处于什么情境、适合怎么做；提到对方一律写「TA」；具体，不空泛；六爻之间不要用同样的开头。",
  "不可以：下吉凶断语（不写「吉」「凶」「大吉」「好运」「坏运」）；说准、灵验、AI、神明、化解、改运、注定、一定、保证；劝人分手或离开；预测具体日期；用感叹号。",
  `只输出 JSON：{"lines":[{"love":"…","work":"…"}, …]}，按初爻到上爻的顺序，正好六项。`,
].join("\n");

async function one(n: number): Promise<Line[] | null> {
  const hex = GUA[n - 1]!;
  const seo = guaSeoFor(n, "zh")!;
  const t = textsFor(n);
  const lines = t.zh.lines.map((z, i) => `${z.label}：${z.hans}　（白话：${seo.lines[i] ?? ""}）`).join("\n");
  const user = `第 ${n} 卦 ${hex.zh}。卦意：${seo.summary?.slice(0, 160) ?? ""}\n六爻：\n${lines}`;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const { text } = await opsJson(SYSTEM, user, { maxTokens: 1400, temperature: 0.5, timeoutMs: 120_000 });
      const j = JSON.parse(text) as { lines?: { love?: string; work?: string }[] };
      const ls = j.lines ?? [];
      if (ls.length !== 6 || !ls.every((x) => ok(x.love) && ok(x.work))) { console.log(n, "rejected", attempt, JSON.stringify(ls).slice(0, 200)); continue; }
      return ls.map((x) => ({ loveHans: x.love!.trim(), workHans: x.work!.trim(), loveHant: toHant(x.love!.trim()), workHant: toHant(x.work!.trim()) }));
    } catch (e) { console.log(n, "error", attempt, e instanceof Error ? e.message.slice(0, 120) : e); }
  }
  return null;
}

(async () => {
  const from = Number(process.argv[2] ?? 1), to = Number(process.argv[3] ?? 64);
  for (let n = from; n <= to; n++) {
    if (data[String(n)]) continue;
    const r = await one(n);
    if (r) { data[String(n)] = r; writeFileSync(OUT, JSON.stringify(data, null, 1)); console.log(n, "ok"); }
    else console.log(n, "FAILED");
  }
  console.log("DONE", Object.keys(data).length);
})();
