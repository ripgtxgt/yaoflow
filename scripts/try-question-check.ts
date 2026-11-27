/**
 * 09-20 问题把关 · 语义层验收：把库里所有真实问题过一遍模型（0 误拦是及格线），
 * 再过一组垃圾样本（应全部 NO）。服务器上跑：
 *   cd apps/web && while read line; do [ -n "$line" ] && [[ "$line" != \#* ]] && export "$line"; done < .env.local \
 *     && npx -y tsx ../../scripts/try-question-check.ts [--all]
 * 默认只跑垃圾样本 + 30 条真实问题抽样；--all 跑全部真实问题（约 440 次一词调用）。
 */
import { DatabaseSync } from "node:sqlite";
import { questionIssue } from "../apps/web/src/lib/question-check";
import { judgeMatter } from "../apps/web/src/lib/question-judge";
import type { Locale } from "../apps/web/src/lib/locales";

const GARBAGE: [string, Locale][] = [
  // rules should take these before the model — listed to see which layer fires
  ["ああ", "ja"], ["你好", "zh"], ["test", "en"], ["Him", "en"],
  // the model's own cases
  ["帮我算一下", "zh"], ["幫我看下運勢", "zh-hant"], ["你是谁", "zh"], ["這個準嗎", "zh-hant"], ["怎么用", "zh"], ["今天天气真好", "zh"], ["我今年三十岁", "zh"], ["床前明月光", "zh"],
  ["我想試試看", "zh-hant"], ["隨便問問看", "zh-hant"], ["就想看看会出什么", "zh"], ["哈哈哈好玩", "zh"],
  ["何か教えて", "ja"], ["占ってみて", "ja"], ["今日はいい天気ですね", "ja"], ["あなたは誰ですか", "ja"], ["よろしくお願いします！", "ja"],
  ["그냥 해봤어요", "ko"], ["뭐든지 알려줘", "ko"], ["오늘 날씨 좋다", "ko"], ["너는 누구니", "ko"],
  ["what is this", "en"], ["tell me something", "en"], ["just testing this out", "en"], ["the weather is nice today", "en"], ["I am thirty years old", "en"], ["who are you", "en"], ["how does this work", "en"], ["read my fortune please", "en"],
  ["c'est quoi ce site", "fr"], ["dis-moi quelque chose", "fr"], ["was ist das hier", "de"], ["sag mir irgendwas", "de"], ["qué es esto", "es"], ["dime algo", "es"], ["o que é isso", "pt"], ["me diz alguma coisa", "pt"],
];

async function main() {
  const all = process.argv.includes("--all");
  const db = new DatabaseSync("/home/ubuntu/yaoflow-data/yaoflow.db", { readOnly: true });
  const rows = db.prepare("SELECT DISTINCT locale, question FROM casts WHERE length(trim(question)) >= 2 ORDER BY id").all() as { locale: string; question: string }[];
  const mine = /E2E|演练|算卦产品|算卦的项目/; // my own test casts
  const real = rows.filter((r) => !mine.test(r.question));
  const sample = all ? real : real.filter((_, i) => i % Math.ceil(real.length / 30) === 0);

  console.log(`--- garbage (${GARBAGE.length}) ---`);
  let gRule = 0, gNo = 0, gYes = 0, gUnsure = 0;
  for (const [q, l] of GARBAGE) {
    const rule = questionIssue(q, l);
    if (rule) { gRule++; console.log(`RULE  ${rule.padEnd(6)} ${l.padEnd(7)} ${q}`); continue; }
    const v = await judgeMatter(q, l);
    if (v === "no") gNo++; else if (v === "yes") gYes++; else gUnsure++;
    console.log(`MODEL ${v.padEnd(6)} ${l.padEnd(7)} ${q}`);
  }
  console.log(`garbage: rule ${gRule} · model no ${gNo} · model YES (missed) ${gYes} · unsure ${gUnsure}`);

  console.log(`\n--- real (${sample.length} of ${real.length}) ---`);
  let rRule = 0, rNo = 0, rYes = 0, rUnsure = 0;
  const t0 = Date.now();
  for (const r of sample) {
    const l = r.locale as Locale;
    const rule = questionIssue(r.question, l);
    if (rule) { rRule++; console.log(`RULE-BLOCKED  ${rule} ${l} ${r.question}`); continue; }
    const v = await judgeMatter(r.question, l);
    if (v === "no") { rNo++; console.log(`MODEL-NO      ${l} ${r.question}`); }
    else if (v === "yes") rYes++;
    else { rUnsure++; console.log(`MODEL-UNSURE  ${l} ${r.question}`); }
  }
  const ms = (Date.now() - t0) / Math.max(sample.length, 1);
  console.log(`real: rule-blocked ${rRule} · model no ${rNo} · yes ${rYes} · unsure ${rUnsure} · ${Math.round(ms)} ms/call`);
}
void main();
