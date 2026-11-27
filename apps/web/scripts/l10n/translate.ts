/**
 * 10-29 进度表 128 — fill src/data/l10n/<product>.json from a product's 繁體 tree (scripts/l10n/registry.ts).
 * Offline, on the server, resumable: a leaf is (re)translated only when its language has no translation yet or the
 * 繁體 changed since (`_src`). Every answer is checked (src/lib/l10n/check.ts) before it is written; a leaf that keeps
 * failing is left out and the tests name it. Never runs at request time.
 *
 *   cd ~/yaoflow/apps/web && set -a && . ./.env.local && set +a && \
 *     ../../node_modules/.bin/vite-node scripts/l10n/translate.ts <product> [en ja …] [--dry]
 *
 * Model: Anthropic (L10N_MODEL, default claude-sonnet-5-5) when ANTHROPIC_API_KEY is set, else DeepSeek.
 * The key is read from the environment and never printed.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { getPath, leaves, setPath } from "../../src/lib/l10n/core";
import { leafProblem } from "../../src/lib/l10n/check";
import { termsFor, type Lang } from "./glossary";
import { REGISTRY } from "./registry";

const ALL: Lang[] = ["en", "ja", "ko", "fr", "de", "es", "pt"];
const args = process.argv.slice(2);
const product = args[0];
const dry = args.includes("--dry");
const entry = product ? REGISTRY[product] : undefined;
if (!product || !entry) throw new Error(`usage: translate.ts <${Object.keys(REGISTRY).join("|")}> [langs…] [--dry]`);
// 10-30: "fr,ja" is two languages (a run once took it for one and translated the whole library into "fr,ja")
const langs = args.slice(1).filter((a) => !a.startsWith("--")).flatMap((a) => a.split(",")).map((a) => a.trim()).filter(Boolean) as Lang[];
const unknown = langs.filter((l) => !ALL.includes(l));
if (unknown.length) throw new Error(`unknown language ${unknown.join(", ")} — one of ${ALL.join(" ")}`);
const LANGS = langs.length ? langs : ALL;
const MODEL = process.env.L10N_MODEL ?? "claude-sonnet-5-5";
/** a leaf needs translating when it has Chinese characters or Chinese punctuation (「」：，＋ in a template, the doubled
 *  dash ——, the middle dot ·) */
const HAN = /[　-〿㐀-鿿豈-﫿＀-￯·]|——/;
/** --redo=<regex>: translate these paths again even when a translation exists (a note was improved) */
const REDO = (() => { const a = args.find((x) => x.startsWith("--redo=")); return a ? new RegExp(a.slice(7)) : null; })();
/** --par=<n>: batches of one language in flight at once (a large library; default 1) */
const PAR = (() => { const a = args.find((x) => x.startsWith("--par=")); return a ? Math.max(1, Math.min(4, Number(a.slice(6)) || 1)) : 1; })();

const LANG_NAME: Record<Lang, string> = { en: "English", ja: "Japanese", ko: "Korean", fr: "French", de: "German", es: "Spanish", pt: "Brazilian Portuguese" };
const LANG_RULES: Record<Lang, string> = {
  en: "Natural, native English (US spelling) — warm, direct, plain. Sentence case for buttons and labels. No Chinese characters.",
  ja: "自然な日本語。文章はです・ます調、ボタンやラベルは短く（体言止め可）。占いの言葉は日本の読者が普段目にする言い方にする（鑑定、卦、応期など）。「絶対」「必ず」「100%」「当たる」は使わない。中国語の簡体字・繁体字の字形は使わず日本の新字体で書く。中国語の直訳調（〜することが可能です、本件、当該、〜を行う）は避ける。",
  ko: "자연스러운 한국어. 설명 문장은 합니다체, 버튼·라벨은 짧게. 사이트의 풀이는 '해석'이 아니라 '풀이'. 한자는 쓰지 않습니다(꼭 필요할 때만 한글 뒤 괄호에). 날짜는 '9월 12일'처럼.",
  fr: "Français naturel et natif, au vouvoiement (vous) partout — jamais de tutoiement. Typographie française : guillemets « », espace insécable avant : ; ! ?. Aucun caractère chinois.",
  de: "Natürliches, muttersprachliches Deutsch in der Du-Form, wie die ganze Oberfläche. Kurze Bedienelemente. Keine chinesischen Schriftzeichen.",
  es: "Español neutro (válido en Latinoamérica y España), de tú; nunca vosotros ni voseo, sin modismos regionales. Sin caracteres chinos.",
  pt: "Português do Brasil natural, tratando o leitor por você (nunca tu nem formas de Portugal). Sem caracteres chineses.",
};

function system(lang: Lang, terms: string): string {
  return [
    `You translate the reader-facing copy of YaoFlow (yaoflow.com), a site for Chinese divination and related tools. The source is Traditional Chinese written for readers in Taiwan and Hong Kong. Translate into ${LANG_NAME[lang]} for readers of that language.`,
    `What this copy is: ${entry!.context}`,
    "Rules:",
    `- ${LANG_RULES[lang]}`,
    "- Translate meaning, not words: as short and plain as the source, nothing added, nothing dropped, no marketing tone. UI labels stay short.",
    "- Keep every {placeholder} exactly as written. Keep numbers, URLs, line breaks (\\n) and list structure.",
    "- The brand is YaoFlow (爻流 is always written YaoFlow).",
    "- Never promise outcomes or claim accuracy (no 'guaranteed', 'always right', 'accurate'). Never mention AI unless the source does.",
    "- Items marked keep_han may keep Chinese characters where the source quotes a classical text or names a stem/branch/trigram; otherwise use none (Korean/Latin glosses may add the Chinese in parentheses only when it helps).",
    terms ? `Use these renderings for site terms:\n${terms}` : "",
    "Input: a JSON object of id → {text, note?, keep_han?}. Output: ONE JSON object of id → translation (a string), with exactly the same ids. No commentary, no code fences.",
  ].filter(Boolean).join("\n");
}

async function anthropic(sys: string, user: string, maxTokens: number): Promise<string> {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": process.env.ANTHROPIC_API_KEY!, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      ...(/opus-5|sonnet-5|haiku-5|fable/.test(MODEL)
        ? { max_tokens: maxTokens + 6000, thinking: { type: "adaptive" }, output_config: { effort: "low" } }
        : { max_tokens: maxTokens, temperature: 0.2 }),
      system: sys,
      messages: [{ role: "user", content: user }],
    }),
    signal: AbortSignal.timeout(300_000),
  });
  if (!r.ok) throw new Error(`anthropic ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const j = (await r.json()) as { content?: { type: string; text?: string }[] };
  return (j.content ?? []).filter((c) => c.type === "text").map((c) => c.text ?? "").join("");
}

async function deepseek(sys: string, user: string, maxTokens: number): Promise<string> {
  const r = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: { authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({ model: "deepseek-chat", temperature: 0.2, max_tokens: Math.min(8000, maxTokens), response_format: { type: "json_object" }, messages: [{ role: "system", content: sys }, { role: "user", content: user }] }),
    signal: AbortSignal.timeout(300_000),
  });
  if (!r.ok) throw new Error(`deepseek ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const j = (await r.json()) as { choices?: { message?: { content?: string } }[] };
  return j.choices?.[0]?.message?.content ?? "";
}

/** the answer's JSON — and when a model sends two objects back to back (or a note after), every top-level object merged */
function parse(raw: string): Record<string, unknown> {
  const m = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = (m ? m[1]! : raw).trim();
  try { return JSON.parse(body) as Record<string, unknown>; } catch { /* below */ }
  const out: Record<string, unknown> = {};
  let depth = 0, start = -1, inStr = false, esc = false;
  for (let i = 0; i < body.length; i++) {
    const c = body[i]!;
    if (inStr) { if (esc) esc = false; else if (c === "\\") esc = true; else if (c === "\"") inStr = false; continue; }
    if (c === "\"") { inStr = true; continue; }
    if (c === "{") { if (depth === 0) start = i; depth++; }
    else if (c === "}" && depth > 0) {
      depth--;
      if (depth === 0 && start >= 0) {
        try { Object.assign(out, JSON.parse(body.slice(start, i + 1)) as Record<string, unknown>); } catch { /* skip a broken piece */ }
        start = -1;
      }
    }
  }
  if (!Object.keys(out).length) throw new Error(`no JSON in answer: ${body.slice(0, 120)}`);
  return out;
}

type Item = { id: string; path: string; text: string; keepHan: boolean; note?: string };

async function ask(lang: Lang, items: Item[], feedback?: Record<string, string>): Promise<Record<string, unknown>> {
  const payload: Record<string, { text: string; note?: string; keep_han?: true; previous_problem?: string }> = {};
  for (const it of items) payload[it.id] = { text: it.text, ...(it.note ? { note: it.note } : {}), ...(it.keepHan ? { keep_han: true as const } : {}), ...(feedback?.[it.id] ? { previous_problem: feedback[it.id] } : {}) };
  const sys = system(lang, termsFor(items.map((i) => i.text), lang, product));
  const user = JSON.stringify(payload);
  // 10-30: a long batch of the 星盤 library came back cut off (Japanese and French: the answer did not parse, the same
  // batch failed three times) — room for the longer languages; and a retry asks for half as much at a time (below)
  const budget = Math.min(24000, 600 + Math.ceil(items.reduce((n, i) => n + i.text.length, 0) * (lang === "ja" || lang === "ko" ? 3 : 4.2)));
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const raw = process.env.ANTHROPIC_API_KEY ? await anthropic(sys, user, budget) : await deepseek(sys, user, budget);
      const out = parse(raw);
      // 10-30: a batch answered in the input's own shape ({"t12": {"text": "…"}}) — the same batch, every time — is unwrapped
      for (const [k, v] of Object.entries(out)) {
        if (v && typeof v === "object" && !Array.isArray(v)) { const o = v as Record<string, unknown>; const t = o.translation ?? o.text; if (typeof t === "string") out[k] = t; }
      }
      // L10N_DEBUG=1: keep the raw answer of a batch that came back short, to see why
      if (process.env.L10N_DEBUG && items.filter((i) => typeof out[i.id] === "string").length < items.length) writeFileSync(`/tmp/l10n-debug-${lang}-${Date.now()}.txt`, `${items.length} asked, ${Object.keys(out).length} parsed, ${raw.length} chars\n${raw}`);
      return out;
    } catch (e) {
      console.error(`  ${lang} batch failed (${attempt + 1}/3): ${e instanceof Error ? e.message.slice(0, 160) : e}`);
      await new Promise((r) => setTimeout(r, 4000 * (attempt + 1)));
    }
  }
  return {};
}

type File = Record<string, unknown> & { _src?: Record<string, Record<string, string>> };

async function main() {
  const hant = await entry!.load();
  const out = entry!.out;
  // 10-30: a large library is kept as one file per language (`split`: <out>/<lang>.json and <out>/_src.json), so a page
  // loads only the translations, never the 繁體 records of what each leaf was translated from
  const read = (p: string) => JSON.parse(readFileSync(p, "utf8")) as Record<string, unknown>;
  const file: File = entry!.split
    ? Object.assign({}, existsSync(`${out}/_src.json`) ? { _src: read(`${out}/_src.json`) } : {}, ...ALL.filter((l) => existsSync(`${out}/${l}.json`)).map((l) => ({ [l]: read(`${out}/${l}.json`) })))
    : existsSync(out) ? JSON.parse(readFileSync(out, "utf8")) : {};
  file._src ??= {};
  const all = leaves(hant);
  const put = (p: string, v: unknown) => { writeFileSync(`${p}.tmp`, `${JSON.stringify(v, null, 1)}\n`); renameSync(`${p}.tmp`, p); };
  let lastSave = 0;
  const save = (force = true) => {
    if (dry) return;
    if (!force && Date.now() - lastSave < 15_000) return; // a large library: not after every batch
    lastSave = Date.now();
    if (entry!.split) {
      mkdirSync(out, { recursive: true });
      put(`${out}/_src.json`, file._src);
      for (const l of ALL) if (file[l] !== undefined) put(`${out}/${l}.json`, file[l]);
      return;
    }
    // keep the file's language order stable: _src first, then the seven languages
    const ordered: File = { _src: file._src };
    for (const l of ALL) if (file[l] !== undefined) ordered[l] = file[l];
    put(out, ordered);
  };
  let failed = 0;
  await Promise.all(LANGS.map(async (lang) => {
    const old = (file[lang] ?? {}) as Record<string, unknown>;
    const src = (file._src![lang] ??= {});
    const tree: Record<string, unknown> = Array.isArray(hant) ? ([] as unknown as Record<string, unknown>) : {};
    const todo: Item[] = [];
    all.forEach((l, i) => {
      const prev = getPath(old, l.path);
      if (!HAN.test(l.text)) { setPath(tree, l.path, l.text, hant); return; } // numbers, URLs, Latin names: as written
      const keepHan = entry!.keepHan?.(l.path, l.text) ?? false;
      // kept when it is current and still passes today's checks (a check made stricter sends the old answer back)
      if (typeof prev === "string" && prev && src[l.path] === l.text && !REDO?.test(l.path) && !leafProblem(lang, l.text, prev, keepHan)) { setPath(tree, l.path, prev, hant); return; }
      todo.push({ id: `t${i}`, path: l.path, text: l.text, keepHan, note: entry!.note?.(l.path) });
    });
    // drop source records of leaves that no longer exist
    const live = new Set(all.map((l) => l.path));
    for (const p of Object.keys(src)) if (!live.has(p)) delete src[p];
    file[lang] = tree;
    console.log(`${product} ${lang}: ${todo.length} to translate (${all.length} leaves)`);
    if (dry || !todo.length) { save(); return; }
    const batches: Item[][] = [];
    let cur: Item[] = [], size = 0;
    for (const it of todo) {
      if (cur.length && (cur.length >= 45 || size + it.text.length > 2600)) { batches.push(cur); cur = []; size = 0; }
      cur.push(it); size += it.text.length;
    }
    if (cur.length) batches.push(cur);
    let done = 0;
    const runBatch = async (bi: number, batch: Item[]) => {
      let pending = batch;
      let feedback: Record<string, string> = {};
      let emptyLast = false;
      for (let round = 0; round < 3 && pending.length; round++) {
        // a round where nothing came back (the answer was cut off and did not parse) is asked again in halves
        const halves = emptyLast && pending.length > 1 ? [pending.slice(0, Math.ceil(pending.length / 2)), pending.slice(Math.ceil(pending.length / 2))] : [pending];
        const res: Record<string, unknown> = {};
        for (const part of halves) Object.assign(res, await ask(lang, part, round ? feedback : undefined));
        emptyLast = !Object.keys(res).length;
        const next: Item[] = [];
        feedback = {};
        for (const it of pending) {
          const v = res[it.id];
          const why = leafProblem(lang, it.text, v, it.keepHan);
          if (why) { next.push(it); feedback[it.id] = `${why}; your answer was: ${typeof v === "string" ? v.slice(0, 200) : "(none)"}`; continue; }
          setPath(tree, it.path, (v as string).trim(), hant);
          src[it.path] = it.text;
        }
        pending = next.length && round < 2 ? next : next;
        if (next.length && round === 2) {
          failed += next.length;
          for (const it of next) console.error(`  ✗ ${lang} ${it.path}: ${feedback[it.id]}`);
        }
      }
      save(PAR === 1 && !entry!.split);
      console.log(`  ${lang} batch ${bi + 1}/${batches.length} done (${++done})`);
    };
    // PAR batches in flight at once, in order
    let nextBatch = 0;
    await Promise.all(Array.from({ length: Math.min(PAR, batches.length) }, async () => {
      while (nextBatch < batches.length) { const bi = nextBatch++; await runBatch(bi, batches[bi]!); }
    }));
  }));
  save();
  console.log(failed ? `done with ${failed} leaves left out — rerun to retry them` : "done");
}

main().catch((e) => { console.error(e); process.exit(1); });
