import { createHash } from "node:crypto";
import { chatJson, parseJsonLoose } from "@/lib/llm";
import { db, recordOps } from "@/lib/db";
import { toHans } from "@/lib/hant";
import { baziOf } from "@/lib/mingli/bazi/chart";
import { avoidOf } from "@/lib/mingli/bazi/report-facts";
import type { Gender, Normalized } from "@/lib/mingli/birth/normalize";
import { pairFacts, type Person } from "@/lib/mingli/hepan/facts";

/**
 * 10-29 进度表 126 娛樂小品 — two written pieces for a 通卡 or a 會員 (right `chart_report`):
 *   ① 前世今生: a short story written from the 八字 (日主、強弱、喜用、四柱十神); the page opens with
 *      「這是依命盤寫的一段故事，供娛樂參考」. Never a real historical person, never a claim about reincarnation.
 *   ② 渣男鑑定 (Neil 10-29: the product keeps that name; what is written is how the two of you get on — 相處): the pair's computed facts (lib/mingli/hepan/facts.ts) → how the
 *      two of you get on — what flows, where it snags, what you can do. Only the two charts; no label on TA, no verdict on
 *      the pair, nothing about a third person.
 * One text per chart (or pair) and locale is kept (fun_texts, keyed by a hash of the computed facts — never the birth);
 * asking again returns it.
 */
export type FunKind = "pastlife" | "together";
export const FUN_BANNED = /渣|劈腿|出軌|出轨|小三|第三者|外遇|轉世|转世|輪迴|轮回|投胎|真實發生|真实发生|一定會|一定会|保證|保证|吉凶|大凶|化解|改運|改运|靈驗|灵验|很準|很准|AI|人工智慧|模型|分手吧|不適合|不适合|適合在一起/;

let ready = false;
function ensure(): void {
  if (ready) return;
  db().exec(`CREATE TABLE IF NOT EXISTS fun_texts (key TEXT PRIMARY KEY, kind TEXT NOT NULL, locale TEXT NOT NULL, customer_id INTEGER, body_json TEXT NOT NULL, created_at INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS idx_fun_texts_cust ON fun_texts(customer_id, created_at);`);
  ready = true;
}
const keyOf = (kind: FunKind, locale: string, facts: unknown) => createHash("sha256").update(JSON.stringify({ kind, locale, facts })).digest("hex").slice(0, 40);

export interface PastLife { title: string; story: string; keep: string }
export interface Together { flow: string; snag: string; doit: string; line: string }

const lang = (locale: string) => (locale === "zh" ? "全部用繁體中文寫（之後轉成简体）。" : "全部用繁體中文（台灣用語）。");
const len = (s: unknown) => (typeof s === "string" ? [...s].length : 0);

/** the chart facts a past-life story is written from (no birth date, no place) */
export function pastLifeFacts(n: Normalized, gender: Gender) {
  const v = baziOf(n, gender, new Date().getFullYear(), false);
  return { dayMaster: v.dayMaster, dmEl: v.dmEl, strength: v.strength.level, favour: v.favour, avoid: avoidOf(v), pillars: v.pillars.map((p) => `${p.label}${p.gz}（${p.ten}）`), counts: v.counts, gender };
}

async function writeJson<T>(system: string, user: string, check: (j: Record<string, unknown>) => T | string): Promise<T | null> {
  const messages = [{ role: "system" as const, content: system }, { role: "user" as const, content: user }];
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const raw = await chatJson(messages, { temperature: 0.9 - attempt * 0.15, maxTokens: 3000 });
      let j: Record<string, unknown> | null = null;
      try { j = parseJsonLoose<Record<string, unknown>>(raw).value; } catch { j = null; }
      const r = j ? check(j) : "parse";
      if (typeof r !== "string") return r;
      messages.push({ role: "assistant", content: raw } as never, { role: "user", content: `REWRITE REQUIRED (${r}). Follow every rule and output the ENTIRE JSON again.` } as never);
    } catch { /* retry */ }
  }
  return null;
}

const toScript = <T extends Record<string, string>>(v: T, locale: string): T => (locale === "zh" ? (Object.fromEntries(Object.entries(v).map(([k, x]) => [k, toHans(x)])) as T) : v);

function cached<T>(key: string): T | null {
  ensure();
  const r = db().prepare("SELECT body_json FROM fun_texts WHERE key = ?").get(key) as { body_json: string } | undefined;
  return r ? (JSON.parse(r.body_json) as T) : null;
}
function keep(key: string, kind: FunKind, locale: string, customerId: number | null, body: unknown): void {
  ensure();
  db().prepare("INSERT OR REPLACE INTO fun_texts (key, kind, locale, customer_id, body_json, created_at) VALUES (?,?,?,?,?,?)").run(key, kind, locale, customerId, JSON.stringify(body), Date.now());
}

export async function pastLife(n: Normalized, gender: Gender, locale: string, customerId: number | null): Promise<PastLife | null> {
  const f = pastLifeFacts(n, gender);
  const key = keyOf("pastlife", locale, f);
  const have = cached<PastLife>(key);
  if (have) return have;
  const system = [
    "你在為一個命理網站寫一段「前世今生」的小故事，純屬娛樂。第二人稱「你」。" + lang(locale),
    "依下面的八字特質寫：日主五行與強弱化成這個人的性情，喜用五行化成他身邊的環境或讓他自在的東西，十神化成他做的事和人際。",
    "故事設定在一個虛構的古代或異地的小地方，主角是普通人（例如手藝人、商隊帳房、渡口船家、書院抄書人），有一件具體的小事和一個轉折。",
    "不可以：用真實的歷史人物或真實事件；說這是真的前世、說輪迴轉世是真的；吉凶、化解、改運、保證；寫英文；提到你是怎麼產生這段內容的。",
    `只輸出 JSON：{"title":"故事標題 6–14 字","story":"故事 350–600 字，分 3–5 段，用\\n\\n分段","keep":"一句話 25–60 字：這段故事裡，哪一點可以帶到這一世"}`,
  ].join("\n");
  const user = `八字特質：日主${f.dayMaster}（${f.dmEl}），${f.strength}；喜用${f.favour.join("、") || "無明顯"}；四柱：${f.pillars.join("、")}；性別：${gender === "female" ? "女" : "男"}。`;
  const out = await writeJson<PastLife>(system, user, (j) => {
    const t = { title: String(j.title ?? "").trim(), story: String(j.story ?? "").trim(), keep: String(j.keep ?? "").trim() };
    if (len(t.title) < 4 || len(t.story) < 300 || len(t.keep) < 15) return "short";
    const bad = `${t.title}${t.story}${t.keep}`.match(FUN_BANNED); if (bad) return `banned:${bad[0]}`;
    if (/[A-Za-z]{3,}/.test(t.story)) return "english";
    return t;
  });
  if (!out) { recordOps("fun_pastlife_fail", locale); return null; }
  const body = toScript(out as unknown as Record<string, string>, locale) as unknown as PastLife;
  keep(key, "pastlife", locale, customerId, body);
  recordOps("fun_pastlife", locale);
  return body;
}

export async function together(a: Person, b: Person, locale: string, customerId: number | null): Promise<Together | null> {
  const f = pairFacts(a, b, { year: false });
  const facts = f.facts.map((x) => `[${x.sys}] ${x.text}`).slice(0, 30);
  const key = keyOf("together", locale, { a: f.a.dayPillar, b: f.b.dayPillar, facts });
  const have = cached<Together>(key);
  if (have) return have;
  const system = [
    "你在為一個命理網站寫「相處鑑定」：看兩個人的命盤，寫你和 TA 相處時的節奏。第二人稱「你」，對方一律寫 TA。" + lang(locale),
    "只根據下面列出的兩人命盤事實寫。說的是相處的方式，不是給 TA 貼標籤：不評斷 TA 的人品、忠不忠誠，不說你們適不適合、會不會分手，不提第三個人。",
    "不可以：渣、劈腿、出軌、小三、吉凶、化解、改運、保證、一定會；不寫英文；不提到你是怎麼產生這段內容的。",
    `只輸出 JSON：{"flow":"相處順的地方 120–220 字","snag":"容易卡住的地方 120–220 字，說的是兩個人的節奏差在哪","doit":"你可以怎麼做 100–200 字，具體的做法","line":"一句話總結 20–45 字，不下結論，只說節奏"}`,
  ].join("\n");
  const user = `兩人命盤事實：\n${facts.join("\n")}`;
  const out = await writeJson<Together>(system, user, (j) => {
    const t = { flow: String(j.flow ?? "").trim(), snag: String(j.snag ?? "").trim(), doit: String(j.doit ?? "").trim(), line: String(j.line ?? "").trim() };
    if (len(t.flow) < 90 || len(t.snag) < 90 || len(t.doit) < 70 || len(t.line) < 12) return "short";
    const all = `${t.flow}${t.snag}${t.doit}${t.line}`;
    const bad = all.match(FUN_BANNED); if (bad) return `banned:${bad[0]}`;
    if (/[他她]們?(?!人)/.test(all.replace(/其他|他人|他處/g, ""))) return "pronoun: only TA";
    if (/[A-Za-z]{3,}/.test(all.replace(/TA/g, ""))) return "english";
    return t;
  });
  if (!out) { recordOps("fun_together_fail", locale); return null; }
  const body = toScript(out as unknown as Record<string, string>, locale) as unknown as Together;
  keep(key, "together", locale, customerId, body);
  recordOps("fun_together", locale);
  return body;
}
