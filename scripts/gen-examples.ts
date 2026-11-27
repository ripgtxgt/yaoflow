/**
 * 推广卦例批量生成：真实引擎起卦 + 真实深断管线（DeepSeek），输出 JSON 供推广素材使用。
 *   cd ~/yaoflow/apps/web && npx -y tsx ../../scripts/gen-examples.ts spec.json > out.json
 * spec.json: [{ "locale": "en", "question": "...", "tz": -240, "values": [7,8,9,8,7,8]? }]
 * values 省略时按三枚铜钱真实概率随机起卦（6/9 各 1/8，7/8 各 3/8）。
 */
import { readFileSync, appendFileSync } from "node:fs";
import { generateReading } from "../apps/web/src/lib/generate";
import { pick, resolveServerChart } from "../apps/web/src/lib/reading";
import { hexName } from "../apps/web/src/lib/names";
import type { LineValue } from "@yaoflow/engine";
import type { Locale } from "../apps/web/src/lib/locales";

interface Spec { locale: Locale; question: string; tz?: number; values?: LineValue[]; topic?: string }

function coins(): LineValue {
  let heads = 0;
  for (let i = 0; i < 3; i++) if (Math.random() < 0.5) heads++;
  // 三枚背(heads)=老阳 9，三枚字=老阴 6，两背一字=少阴 8，一背两字=少阳 7（按常见约定）
  return heads === 3 ? 9 : heads === 0 ? 6 : heads === 2 ? 8 : 7;
}

async function main() {
  const specs = JSON.parse(readFileSync(process.argv[2]!, "utf8")) as Spec[];
  const out: unknown[] = [];
  for (const s of specs) {
    const values = s.values ?? Array.from({ length: 6 }, coins);
    const castAtMs = Date.now();
    const input = { question: s.question, values, castAtMs, tzOffsetMinutes: s.tz ?? 0 };
    const chart = resolveServerChart(input);
    const r = (await generateReading("deep", input, false, s.locale)) as Record<string, Record<string, string>>;
    const item = {
      locale: s.locale,
      topic: s.topic ?? null,
      question: s.question,
      code: values.join(""),
      cast_at: new Date(castAtMs).toISOString(),
      tz: s.tz ?? 0,
      primary: hexName(chart.cast.primary, s.locale),
      primary_zh: chart.cast.primary.fullZh,
      changed: chart.cast.changed ? hexName(chart.cast.changed, s.locale) : null,
      changed_zh: chart.cast.changed?.fullZh ?? null,
      moving: chart.lines.filter((l) => l.changing).map((l) => l.position),
      verdict: pick(r.verdict, s.locale),
      timing: pick(r.timing, s.locale),
      basis: pick(r.basis, s.locale),
    };
    out.push(item);
    appendFileSync("/tmp/gen-examples.progress", `${s.locale} ${item.code} ${item.primary}${item.changed ? " → " + item.changed : ""}\n`);
  }
  console.log(JSON.stringify(out, null, 2));
}
void main();
