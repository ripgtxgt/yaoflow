/**
 * 复现单卦的应期推算（不调模型）：看候选窗口与规则。
 *   cd ~/yaoflow/apps/web && npx -y tsx ../../scripts/try-one.ts "问题" 8,8,7,6,7,7 [tz]
 */
import { resolveServerChart, resolveTiming } from "../apps/web/src/lib/reading";
import type { LineValue } from "@yaoflow/engine";

const [q, v, tzArg] = process.argv.slice(2);
const values = v!.split(",").map(Number) as LineValue[];
const input = { question: q!, values, castAtMs: Date.now(), tzOffsetMinutes: Number(tzArg ?? 480) };
const chart = resolveServerChart(input);
const plan = resolveTiming(input, chart);
console.log(`${chart.cast.primary.fullZh}${chart.cast.changed ? "→" + chart.cast.changed.fullZh : ""} · ${plan.today_label_zh} · scale=${plan.question_scale} horizon=${plan.horizon}`);
console.log(`用神：${plan.focal.how_zh} 第${plan.focal.pos}爻 ${plan.focal.branch}(${chart.lines[plan.focal.pos - 1]!.phase}) ${plan.focal.strength}${plan.focal.void ? " 旬空" : ""}${plan.focal.month_clash ? " 月破" : ""}${plan.focal.changing ? " 动" : " 静"}${plan.focal.day_clash ? " 日冲" : ""}`);
for (const l of chart.lines) console.log(`  ${l.position}爻 ${l.stem}${l.branch} ${l.phase} ${l.relation} ${l.strength}${l.isWorld ? " 世" : ""}${l.isResponse ? " 应" : ""}${l.changing ? " 动" : ""}${l.isVoid ? " 空" : ""}${l.monthClash ? " 月破" : ""}${l.dayClash ? " 日冲" : ""}`);
for (const c of [...plan.today_hours, ...plan.candidates]) console.log(`  [${c.kind}] ${c.rule_zh} → ${c.windows.map((w) => w.label_zh).join("；")}`);
