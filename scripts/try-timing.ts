/**
 * 应期 v2 现场试跑：4 个不同问题/卦走真实生成管线，看 timing 是否脱离"九月十月"复读。
 *   cd ~/yaoflow/apps/web && DEEPSEEK_API_KEY=... npx -y tsx ../../scripts/try-timing.ts
 */
import { generateReading } from "../apps/web/src/lib/generate";
import { resolveServerChart, resolveTiming, type ReadingInput } from "../apps/web/src/lib/reading";
import type { DeepReading } from "../apps/web/src/lib/reading";

const now = Date.now();
const cases: { label: string; input: ReadingInput }[] = [
  { label: "事业·跳槽", input: { question: "我该不该接受这个跳槽的 offer", values: [7, 8, 9, 8, 7, 8], castAtMs: now, tzOffsetMinutes: 480 } },
  { label: "财运·回款", input: { question: "客户欠的那笔款什么时候能收回来", values: [8, 8, 6, 7, 7, 9], castAtMs: now, tzOffsetMinutes: 480 } },
  { label: "短期·明天面试", input: { question: "明天下午的面试能过吗", values: [9, 7, 8, 8, 7, 7], castAtMs: now, tzOffsetMinutes: 480 } },
  { label: "感情·复合", input: { question: "和前任还有可能复合吗", values: [7, 6, 8, 8, 9, 8], castAtMs: now, tzOffsetMinutes: -240 } },
  { label: "当下·午觉（Neil 实例：山火贲→地天泰）", input: { question: "我现在能睡一个质量很好的午觉吗", values: [7, 8, 9, 8, 6, 7], castAtMs: now, tzOffsetMinutes: 480 } },
  { label: "大事·妹夫出国（Neil 实例：雷泽归妹→震为雷）", input: { question: "我妹夫准备出国去发展，这个事情能不能成？会不会顺利？", values: [7, 9, 8, 7, 8, 8], castAtMs: now, tzOffsetMinutes: 480 } },
  { label: "择时·产品推广（Neil 实例：风山渐→天山遁）", input: { question: "我的算卦产品大概要在什么时候去做推广呢？", values: [8, 8, 7, 6, 7, 7], castAtMs: now, tzOffsetMinutes: 480 } },
];

async function run(c: (typeof cases)[number]) {
  const chart = resolveServerChart(c.input);
  const plan = resolveTiming(c.input, chart);
  const head = `\n=== ${c.label} · ${chart.cast.primary.fullZh}${chart.cast.changed ? "→" + chart.cast.changed.fullZh : ""} · 今天 ${plan.today_label_zh}\n`
    + `用神：${plan.focal.how_zh} 第${plan.focal.pos}爻 ${plan.focal.branch} ${plan.focal.strength}`
    + `${plan.focal.void ? " 旬空" : ""}${plan.focal.month_clash ? " 月破" : ""}${plan.focal.changing ? " 动" : " 静"}${plan.focal.day_clash ? " 日冲" : ""} · horizon=${plan.horizon} · scale=${plan.question_scale} · now=${plan.now_local}(${plan.now_hour_branch}时)\n`
    + [...plan.today_hours, ...plan.candidates].map((x) => `  [${x.kind}] ${x.rule_zh} → ${x.windows.map((w) => w.label_zh).join("；")}`).join("\n");
  const t0 = Date.now();
  const r = (await generateReading("deep", c.input)) as DeepReading;
  return `${head}\n  ⏱ ${((Date.now() - t0) / 1000).toFixed(0)}s\n  timing: ${r.timing.zh}\n  basis : ${r.basis.zh.slice(0, 160)}…`;
}

void Promise.all(cases.map(run)).then((outs) => { for (const o of outs) console.log(o); });
