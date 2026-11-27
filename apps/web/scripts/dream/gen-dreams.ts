/**
 * 10-29 进度表 124 解夢: 200 common dreams, each a free page — the traditional sayings (marked as such: 民間解夢書／
 * 《周公解夢》流傳本的常見說法), a plain reading of what such a dream often goes with in daily life, a few variants, and
 * the way in: 「放不下那件事，可以為那件事起一卦」. Written by the ops model (Claude) in 繁體, checked here; 简体 by OpenCC.
 * Never a 吉凶 verdict, never a prophecy of death or illness. Resumable.
 *   vite-node scripts/dream/gen-dreams.ts <out.json> [workers]
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { opsJson } from "../../src/lib/support-llm";
import { toHans } from "../../src/lib/hant";

type Topic = { slug: string; name: string; cat: string };
type Dream = Topic & { title: string; lead: string; trad: string; plain: string; variants: { q: string; a: string }[]; ask: string; askQ: string; faq: { q: string; a: string }[] };
const [, , outFile, w = "4"] = process.argv;
const store: { topics: Topic[]; dreams: Record<string, Dream & { hans: Omit<Dream, "slug" | "cat"> }> } = existsSync(outFile!) ? JSON.parse(readFileSync(outFile!, "utf8")) : { topics: [], dreams: {} };
export const DREAM_BANNED = /大吉|大凶|吉兆|凶兆|不祥|必定|(?<!不)一定會|注定|預示.{0,6}(死|病|災)|會死|會生病|血光|化解|改運|開運|靈驗|AI|算命師/;
const RULES = [
  "全部用繁體中文（台灣用語），寫給剛做完夢、想知道「這代表什麼」的普通人。",
  "不可以：下吉凶斷語（不寫吉、凶、吉兆、凶兆、不祥）；預言死亡、疾病、災難（夢到死人、生病、掉牙等，寫成「傳統上的說法是…，現實裡不代表會發生」）；說化解、改運、開運、靈驗；編造具體書名頁碼或古人原句；寫醫療建議（反覆惡夢、睡不好只說「可以和醫師聊聊」）。",
].join("\n");

async function topics(): Promise<void> {
  if (store.topics.length >= 200) return;
  const { text } = await opsJson(`${RULES}\n你要列出網路上最常被搜尋的 200 個夢境主題。`,
    `列 200 個常見夢境主題（例：掉牙、蛇、前任、考試、懷孕、死人、飛、被追、掉落、洪水、狗、貓、魚、錢、結婚、迷路…），涵蓋動物、人物、身體、行為、自然、物品、場所、情境八類，不重複、不涉及性。每個給 slug（小寫英文或拼音，用 - 連接，唯一）、name（2–6 字，例「掉牙」「被蛇咬」「前任」）、cat（上面八類之一）。只輸出 JSON：{"topics":[{"slug":"…","name":"…","cat":"…"}]}`,
    { maxTokens: 12000, temperature: 0.3, timeoutMs: 240_000 });
  const t = (JSON.parse(text) as { topics: Topic[] }).topics.filter((x) => /^[a-z0-9-]{2,40}$/.test(x.slug) && x.name);
  const seen = new Set<string>();
  store.topics = t.filter((x) => (seen.has(x.slug) ? false : (seen.add(x.slug), true))).slice(0, 200);
  writeFileSync(outFile!, JSON.stringify(store));
  console.log("topics", store.topics.length);
}

const okDream = (d: Partial<Dream>) => {
  const all = JSON.stringify(d);
  const len = (s: unknown, a: number, b: number) => typeof s === "string" && [...s].length >= a && [...s].length <= b;
  return len(d.title, 4, 30) && len(d.lead, 30, 120) && len(d.trad, 60, 320) && len(d.plain, 80, 420) && len(d.ask, 15, 80) && len(d.askQ, 6, 40)
    && Array.isArray(d.variants) && d.variants.length >= 3 && Array.isArray(d.faq) && d.faq.length >= 2 && !DREAM_BANNED.test(all);
};

async function write(list: Topic[]): Promise<void> {
  const ask = list.map((t) => `${t.slug}：夢到${t.name}`).join("\n");
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const { text } = await opsJson(`${RULES}\n每個夢寫成一個網頁的內容。`,
        `寫下面 ${list.length} 個夢：\n${ask}\n每個夢給：title（頁面標題，像讀者搜的「夢到蛇是什麼意思」）；lead（30–100 字，第一段直接回答）；trad（傳統說法，60–280 字，開頭註明出處類型，如「民間流傳的解夢書（如《周公解夢》的各種流傳本）常見說法是…」，可列兩三種常見說法；不同版本說法不同就直說）；plain（白話，80–380 字：這種夢常和白天的哪些心情、壓力、在意的事一起出現，用「可能」「常見」，不當成預言）；variants（3–5 個常見變化，如「夢到蛇咬你」「夢到很多蛇」，各 q＋a，a 40–120 字）；ask（20–70 字，結尾引導：夢到某個人、放不下那件事，可以為那件事起一卦，看接下來哪幾天會有動靜）；askQ（一句可直接拿去起卦的問題，6–30 字，例「我和前任還有沒有可能？」）；faq（2 題，q＋a，a 40–140 字）。
只輸出 JSON：{"dreams":{"slug":{…}, …}}`,
        { maxTokens: 14000, temperature: 0.5, timeoutMs: 300_000 });
      const j = JSON.parse(text) as { dreams?: Record<string, Partial<Dream>> };
      for (const t of list) {
        const d = j.dreams?.[t.slug];
        if (!d || !okDream(d)) { if (d) console.log("rejected", t.slug, DREAM_BANNED.exec(JSON.stringify(d))?.[0] ?? "length"); continue; }
        const full = { ...t, ...(d as Dream) };
        const h = (s: string) => toHans(s);
        store.dreams[t.slug] = { ...full, hans: { name: h(t.name), title: h(full.title), lead: h(full.lead), trad: h(full.trad), plain: h(full.plain), variants: full.variants.map((v) => ({ q: h(v.q), a: h(v.a) })), ask: h(full.ask), askQ: h(full.askQ), faq: full.faq.map((f) => ({ q: h(f.q), a: h(f.a) })) } };
      }
      list = list.filter((t) => !store.dreams[t.slug]);
      if (!list.length) return;
    } catch (e) { console.log("error", attempt, e instanceof Error ? e.message.slice(0, 100) : e); }
  }
}

(async () => {
  await topics();
  const todo = store.topics.filter((t) => !store.dreams[t.slug]);
  const chunks: Topic[][] = [];
  for (let i = 0; i < todo.length; i += 5) chunks.push(todo.slice(i, i + 5));
  let next = 0, done = 0;
  const worker = async () => { while (next < chunks.length) { const c = chunks[next++]!; await write(c); done++; writeFileSync(outFile!, JSON.stringify(store)); console.log(new Date().toISOString().slice(11, 19), `${done}/${chunks.length}`, Object.keys(store.dreams).length); } };
  await Promise.all(Array.from({ length: Number(w) }, worker));
  console.log("DONE", Object.keys(store.dreams).length, "of", store.topics.length);
})();
