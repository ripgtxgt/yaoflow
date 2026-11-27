/**
 * 10-29 进度表 122 姓名學: for each character of the base (build-chars.py), in our own plain words — what it means, three
 * common words, how it sits in a name, and a 諧音 to watch for — written by the ops model (Claude) in 繁體, 40 at a time,
 * checked here; 简体 by OpenCC. Resumable. Never 吉凶 / 旺 / 改運 / 化解 about a character.
 *   vite-node scripts/name/gen-char-text.ts <base.json> <out.json> [workers]
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { opsJson } from "../../src/lib/support-llm";
import { toHans } from "../../src/lib/hant";

type Base = { hant: string; hans: string; py: string };
type Text = { def: string; words: string[]; pos: string; warn: string; ok: 0 | 1 | 2; defHans: string; wordsHans: string[]; posHans: string; warnHans: string };
const [, , baseFile, outFile, w = "4"] = process.argv;
const base = JSON.parse(readFileSync(baseFile!, "utf8")) as Base[];
const out: Record<string, Text> = existsSync(outFile!) ? JSON.parse(readFileSync(outFile!, "utf8")) : {};
export const CHAR_BANNED = /吉凶|大吉|兇|凶字|旺財|旺夫|招財|改運|改运|化解|剋夫|克夫|不祥|開運|开运|靈驗|AI/;
const SYSTEM = [
  "你在為一個中文姓名學網站寫「每個字」的說明，讀者是要幫孩子取名、或想了解自己名字的人。全部用繁體中文（台灣用語）。",
  "每個字給：def 字義（白話，15–45 字，先講最常用的意思，可帶一個常見引申）；words 三個常見詞語（每個 2–4 字，真實常用的詞）；",
  "pos 放在名字裡（10–35 字：常見放在名字的哪個位置、給人什麼感覺；不常用於名字的字直說「較少用於名字」並說原因，例如意思偏負面或易生誤會）；",
  "warn 諧音或字形提醒（0–30 字：常見的不雅或容易被取笑的諧音、容易寫錯唸錯；沒有就空字串）；ok 適合取名的程度 2 常用、1 可用、0 不建議。",
  "不可以：說這個字吉或凶、旺財旺夫、招財、改運、化解、剋夫、不祥、開運；不編典故出處；不寫英文。",
  `只輸出 JSON：{"chars":{"字":{"def":"…","words":["…","…","…"],"pos":"…","warn":"…","ok":2}, …}}，每個給定的字都要有。`,
].join("\n");
const ok = (t: Partial<Text> | undefined) => !!t && typeof t.def === "string" && [...t.def].length >= 8 && [...t.def].length <= 70
  && Array.isArray(t.words) && t.words.length >= 2 && typeof t.pos === "string" && typeof t.warn === "string" && [0, 1, 2].includes(t.ok as number)
  && !CHAR_BANNED.test(`${t.def}${t.pos}${t.warn}${t.words.join("")}`);

async function batch(list: Base[]): Promise<void> {
  const user = list.map((b) => `${b.hant}（${b.py}）`).join("、");
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const { text } = await opsJson(SYSTEM, `請寫這 ${list.length} 個字：${user}`, { maxTokens: 9000, temperature: 0.3, timeoutMs: 240_000 });
      const j = JSON.parse(text) as { chars?: Record<string, Partial<Text>> };
      let got = 0;
      for (const b of list) {
        const t = j.chars?.[b.hant];
        if (!ok(t)) continue;
        out[b.hant] = { def: t!.def!, words: t!.words!.slice(0, 3), pos: t!.pos!, warn: t!.warn ?? "", ok: t!.ok as 0 | 1 | 2,
          defHans: toHans(t!.def!), wordsHans: t!.words!.slice(0, 3).map(toHans), posHans: toHans(t!.pos!), warnHans: toHans(t!.warn ?? "") };
        got++;
      }
      if (got >= list.length * 0.9) return;
      list = list.filter((b) => !out[b.hant]);
    } catch (e) { console.log("error", attempt, e instanceof Error ? e.message.slice(0, 100) : e); }
  }
}

(async () => {
  const todo = base.filter((b) => !out[b.hant]);
  const chunks: Base[][] = [];
  for (let i = 0; i < todo.length; i += 40) chunks.push(todo.slice(i, i + 40));
  let next = 0, done = 0;
  const worker = async () => { while (next < chunks.length) { const c = chunks[next++]!; await batch(c); done++; writeFileSync(outFile!, JSON.stringify(out)); console.log(new Date().toISOString().slice(11, 19), `${done}/${chunks.length}`, Object.keys(out).length); } };
  await Promise.all(Array.from({ length: Number(w) }, worker));
  console.log("DONE", Object.keys(out).length, "of", base.length);
})();
