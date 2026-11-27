/**
 * 10-05 农历与港台说法：看问题里的时间词被读成哪一段公历、候选日子落不落在里面；带 LLM=1 走真实深断看 timing 怎么说。
 *   cd ~/yaoflow/apps/web && npx -y tsx ../../scripts/try-lunar.ts                       # 只看窗口与候选（不调模型）
 *   cd ~/yaoflow/apps/web && export $(grep -E "^(DEEPSEEK|SILICONFLOW|ARK|LLM_)[A-Z_]*=" .env.local | xargs) && LLM=1 npx -y tsx ../../scripts/try-lunar.ts
 *   可选：CAST_AT=<ms> VALUES=8,6,8,7,8,8 Q="自己的问题" ONLY=<序号>
 */
import { generateReading } from "../apps/web/src/lib/generate";
import { resolveServerChart, resolveTiming, type ReadingInput, type DeepReading } from "../apps/web/src/lib/reading";
import { pick } from "../apps/web/src/lib/reading-keys";
import type { LineValue } from "@yaoflow/engine";

const castAt = Number(process.env.CAST_AT ?? Date.now());
const values = (process.env.VALUES ?? "8,6,8,7,8,8").split(",").map(Number) as LineValue[];
const cases: { label: string; q: string; tz: number; locale: "zh-hant" | "zh"; yue?: boolean }[] = process.env.Q
  ? [{ label: "自定义", q: process.env.Q, tz: 480, locale: "zh-hant" }]
  : [
    { label: "原问（CAST#2342，10-05 误读成公历十月）", q: "農曆10月紫微命盤的動像是不是可以有offer、確定入職？", tz: 480, locale: "zh-hant" },
    { label: "香港说法（粤语）", q: "舊曆年前會唔會有offer？", tz: 480, locale: "zh-hant", yue: true },
    { label: "台湾说法", q: "國曆11月底前會確定入職嗎？", tz: 480, locale: "zh-hant" },
    { label: "過年前（CAST#2325 同型）", q: "在過年前他會主動聯繫我嗎？", tz: 480, locale: "zh-hant" },
    { label: "民國年", q: "115年底前能升職嗎？", tz: 480, locale: "zh-hant" },
    { label: "簡體·农历", q: "农历十月初八前能拿到offer吗？", tz: 480, locale: "zh" },
    { label: "过去不是窗口", q: "三天前他说自己适合独处，今年年底前他还会主动找我吗？", tz: 480, locale: "zh" },
  ];
const only = process.env.ONLY ? Number(process.env.ONLY) : null;

async function run(c: (typeof cases)[number]) {
  const input: ReadingInput = { question: c.q, values, castAtMs: castAt, tzOffsetMinutes: c.tz, ...(c.yue ? { register: "yue" as const } : {}) };
  const chart = resolveServerChart(input);
  const plan = resolveTiming(input, chart);
  const head = `\n=== ${c.label} · ${chart.cast.primary.fullZh}${chart.cast.changed ? "→" + chart.cast.changed.fullZh : ""} · 今天 ${plan.today_label_zh}\n`
    + `ask_window: ${plan.ask_window ? `${plan.ask_window.phrase} → ${plan.ask_window.start}~${plan.ask_window.end} (${plan.ask_window.kind}) hit=${plan.ask_hit}` : "none"}\n`
    + `calendar: ${plan.ask_window?.calendar?.zh ?? "-"}\n`
    + `用神：${plan.focal.how_zh} 第${plan.focal.pos}爻 ${plan.focal.branch} ${plan.focal.strength}${plan.focal.void ? " 旬空" : ""}${plan.focal.month_clash ? " 月破" : ""}${plan.focal.changing ? " 动" : " 静"}${plan.focal.day_clash ? " 日冲" : ""} · horizon=${plan.horizon} · scale=${plan.question_scale}\n`
    + plan.candidates.map((x) => `  [${x.kind}] ${x.rule_zh} → ${x.windows.map((w) => `${w.label_zh}${w.in_ask ? " ✓in_ask" : ""}`).join("；")}`).join("\n")
    + `\n  lunar: ${plan.lunar.months_hant}`;
  if (!process.env.LLM) return head;
  const t0 = Date.now();
  const r = (await generateReading("deep", input, false, c.locale)) as DeepReading;
  return `${head}\n  ⏱ ${((Date.now() - t0) / 1000).toFixed(0)}s\n  timing: ${pick(r.timing, c.locale)}\n  verdict: ${pick(r.verdict, c.locale)}\n  basis : ${pick(r.basis, c.locale).slice(0, 220)}…`;
}

void Promise.all(cases.filter((_, i) => only === null || i === only).map(run)).then((outs) => { for (const o of outs) console.log(o); });
