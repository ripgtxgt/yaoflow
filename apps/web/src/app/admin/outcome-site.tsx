import type { ReactNode } from "react";
import { outcomeStats, revisitCounts } from "@/lib/db";
import { resultsCounts } from "@/lib/results-line";
import { allRecords, outcomeTotals, type OutcomeTotals } from "@/lib/outcome-records";
import { Legend, Stat } from "./ui";

/**
 * 10-23 应验记录 (Neil: 「我框起来的这个不是应验记录吗？」→「为什么我看到的还是这个呢」): one block for the whole site's
 * record, shown on the dashboard (/admin#outcomes) and at the top of the 应验记录 page (/admin/outcomes). Its first four
 * figures are read by the same function as the top line of /outcomes (lib/results-line.ts resultsCounts) and use the
 * same words — 应了／部分／没应／不确定／还没定 — so the back office and the reader's page cannot disagree. Then the public
 * cases' sentence (the second line of /outcomes) and what only we look at.
 */

/** the public cases of both Chinese pages added up — the counts /outcomes prints under the site line */
export function publicTotals(records = allRecords()): OutcomeTotals {
  const [a, b] = [outcomeTotals("zh-hant", records), outcomeTotals("zh", records)];
  return Object.fromEntries((Object.keys(a) as (keyof OutcomeTotals)[]).map((k) => [k, a[k] + b[k]])) as unknown as OutcomeTotals;
}

export function OutcomeSite({ withPublic = true, more }: { withPublic?: boolean; more?: ReactNode }) {
  let site: ReturnType<typeof resultsCounts> | null = null;
  try { site = resultsCounts(); } catch { /* no database */ }
  let pub: OutcomeTotals | null = null;
  if (withPublic) { try { pub = publicTotals(); } catch { /* no database */ } }
  const o = outcomeStats();
  const rv = revisitCounts();
  const pct = (h: number, m: number) => (h + m > 0 ? `${Math.round((h / (h + m)) * 100)}%` : null);
  const all = pct(o.hit, o.miss);
  if (!site) return <p className="text-sm opacity-40">—</p>;
  const j = site.judged, f = site.facts;
  return (
    <>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="已问（件）" value={site.asked} sub={`回来作答 ${site.answered} 件`} />
        <Stat label="六爻 · 应了" value={j.hit} sub={`部分 ${j.partial} · 没应 ${j.miss}`} />
        <Stat label="六爻 · 不确定 / 还没定" value={`${j.unclear} / ${j.open}`} sub={`六爻共答 ${j.hit + j.partial + j.miss + j.unclear + j.open} 次`} />
        <Stat label="塔罗与免费起卦" value={f.happened + f.stirred + f.nothing + f.open} sub={`发生了 ${f.happened} · 有动静 ${f.stirred} · 没动静 ${f.nothing} · 还没定 ${f.open}`} />
      </div>
      {pub && (
        <p className="text-xs opacity-60 mt-3 tabular-nums">
          公开卦例（读者自己选择公开的，繁简两页合计）：应期已过 {pub.due} 件——应了 {pub.hit} · 部分 {pub.partial} · 没应 {pub.miss} · 不确定 {pub.unclear} · 还没定 {pub.open} · 未回报 {pub.notReported} · 已到期待问 {pub.queued}；另有 {pub.waiting} 件应期未到
        </p>
      )}
      <p className="text-xs opacity-60 mt-1 tabular-nums">
        只有我们看的：回访排队 {rv.pending} · 已发 {rv.sent} · 发了还没回答 {o.unanswered}
        {all ? ` · 自报准确率 ${all}（只算应了与没应）` : ""}
        {o.byTier.filter((t) => t.hit + t.miss > 0).map((t) => ` · ${t.tier === "deep" ? "深断" : "轻解读"} ${pct(t.hit, t.miss)}（${t.hit}/${t.hit + t.miss}）`).join("")}
      </p>
      <Legend>
        六爻从 10-07 起按解读自己的倾向计分——只问发生没发生，判「难」的卦没发生算应了；塔罗和免费起卦只记读者说发生了什么，不分对错。准确率只给我们看，读者页面从不出百分比。
        {more ? <> {more}</> : null}
      </Legend>
    </>
  );
}
