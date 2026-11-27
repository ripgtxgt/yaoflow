/**
 * 外链资源页三件（进度表 12, 推广 09-26）：六爻術語對照、應期怎麼推、六十四卦速查表的九语文案。
 *   cd ~/yaoflow && KEY=$(grep '^DEEPSEEK_API_KEY=' apps/web/.env.local | cut -d= -f2-) \
 *     && DEEPSEEK_API_KEY=$KEY npx -y tsx scripts/gen-reference.ts <master.json> <locale>
 * 繁體是底稿（人写）；简体走 OpenCC；其余七语由模型"用目标语言重写"同一份 JSON，形状不变，
 * 中文术语原词（zh 字段）保留。写入 apps/web/src/data/reference.<locale>.json，线上不调模型。
 */
import { readFileSync, writeFileSync } from "node:fs";
import { toHans } from "../apps/web/src/lib/hant";

const [master, locale] = [process.argv[2]!, process.argv[3]!];
const src = JSON.parse(readFileSync(master, "utf8"));
const out = `apps/web/src/data/reference.${locale}.json`;

const LANG: Record<string, string> = {
  en: "English — plain, warm, precise; keep the Chinese term in `zh` untouched and, where a common English rendering exists (Six Lines / Liu Yao, moving line, hexagram, trigram, Useful God / 用神, Void / 旬空, Month Break / 月破), give it once in the definition.",
  ja: "日本語 — です・ます調。中国語の術語（zh 欄）はそのまま残し、定義の中で日本の断易の呼び方（用神・旬空・月破・世爻・応爻…）を使う。",
  ko: "한국어 — 합니다체. zh 칸의 한자 용어는 그대로 두고, 설명에서는 한국 육효에서 쓰는 표기(용신·순공·월파·세효·응효…)를 씁니다.",
  fr: "français — tutoiement, naturel, précis ; garde le terme chinois du champ `zh` tel quel et donne une fois une traduction française usuelle dans la définition.",
  de: "Deutsch — Du-Form, natürlich, präzise; den chinesischen Begriff im Feld `zh` unverändert lassen und in der Definition einmal eine gängige deutsche Wiedergabe nennen.",
  es: "español — tuteo, natural, preciso; conserva el término chino del campo `zh` tal cual y da una vez una traducción usual en la definición.",
  pt: "português — você, natural, preciso; mantenha o termo chinês do campo `zh` como está e dê uma vez uma tradução usual na definição.",
};

function hansDeep(x: unknown): unknown {
  if (typeof x === "string") return toHans(x);
  if (Array.isArray(x)) return x.map(hansDeep);
  if (x && typeof x === "object") return Object.fromEntries(Object.entries(x).map(([k, v]) => [k, k === "zh" || k === "code" ? v : hansDeep(v)]));
  return x;
}

async function main() {
  if (locale === "zh-hant") { writeFileSync(out, JSON.stringify(src, null, 1)); console.error("zh-hant: copied"); return; }
  if (locale === "zh") { writeFileSync(out, JSON.stringify(hansDeep(src), null, 1)); console.error("zh: converted"); return; }
  const { chatJson } = await import("../apps/web/src/lib/llm");
  const system = `You rewrite a JSON document about Liu Yao (六爻) divination into ${LANG[locale]}
Rules:
- Output ONLY valid JSON with EXACTLY the same structure and keys as the input. Do not add, drop or reorder keys or array items.
- Translate every string value EXCEPT: the "zh" fields (Chinese terms — copy verbatim), the "code" field, hexagram/branch/stem characters that appear inside text (澤雷隨, 風火家人, 未土, 卯木, 丁酉, 酉月, 午, 未 …) — keep those Chinese characters, and you may add a short gloss in parentheses the first time.
- Dates stay as dates in the target language's usual format (e.g. "September 29" / "9月29日"). Years stay.
- Never add claims about accuracy, never add advice, never mention AI or models. This is a reference page, not marketing.
- Keep the length close to the original.`;
  const raw = await chatJson([{ role: "system", content: system }, { role: "user", content: JSON.stringify(src) }], { temperature: 0.2, maxTokens: 12000, timeoutMs: 300_000 });
  const text = raw.trim().replace(/^```json\s*/i, "").replace(/```$/, "");
  const parsed = JSON.parse(text);
  // shape check: same keys, same counts
  const shape = (o: unknown): string => Array.isArray(o) ? `[${o.map(shape).join(",")}]` : o && typeof o === "object" ? `{${Object.keys(o).sort().map((k) => `${k}:${shape((o as Record<string, unknown>)[k])}`).join(",")}}` : typeof o;
  if (shape(parsed) !== shape(src)) throw new Error("shape mismatch");
  writeFileSync(out, JSON.stringify(parsed, null, 1));
  console.error(`${locale}: ok`);
}
void main();
