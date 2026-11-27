/** 用真实管线生成某语言的一份深断，打印 basis（看术语用词）。 tsx scripts/try-lang.ts de "Frage" 7,8,9,8,7,8 */
import { generateReading } from "../apps/web/src/lib/generate";
import { pick } from "../apps/web/src/lib/reading";
import type { LineValue } from "@yaoflow/engine";
import type { Locale } from "../apps/web/src/lib/locales";
async function main() {
  const [l, q, v] = process.argv.slice(2);
  const values = v!.split(",").map(Number) as LineValue[];
  const r = await generateReading("deep", { question: q!, values, castAtMs: Date.now(), tzOffsetMinutes: 120 }, false, l as Locale) as Record<string, Record<string, string>>;
  for (const k of ["verdict", "timing", "basis"]) console.log(`${k}: ${pick(r[k], l as Locale)}\n`);
}
void main();
