import type { ProfileView, UsageGroup } from "@/lib/admin-usage";
import { homeMinute } from "@/lib/clock";

/**
 * 10-23 进度表 115 (Neil: 「我还需要知道用户使用每个产品的记录和详情，然后要做到我能读懂」): each product this person used,
 * opened by its name — every time, newest first, in words — then the check-ins, the letters that come by themselves,
 * and the birth profiles written out (they were raw JSON). Server-rendered; no client code.
 */
const TONE = { ok: "text-emerald-700", wait: "text-amber-700", bad: "text-[var(--cinnabar)]", dim: "opacity-50" } as const;

export default function Usage({ groups, unused, profiles, revisits, letters }: {
  groups: UsageGroup[]; unused: string[]; profiles: ProfileView[];
  revisits: { product: string; pending: number; sent: number; answered: number }[];
  letters: { name: string; state: string }[];
}) {
  return (
    <section id="usage" className="mb-8">
      <h2 className="text-xs uppercase tracking-widest opacity-40 mb-1">各产品使用记录</h2>
      <p className="text-xs opacity-40 mb-3 leading-relaxed">点产品名展开：每一次都列出来——什么时候、问了什么或抽到什么、拿到什么、怎么拿到的（单买／通卡／会员／免费）、写好没有、回访答了没有；「打开 →」是读者自己看到的那一页，「看内容」是解读和回答的原文。</p>
      <div className="flex flex-col gap-2">
        {groups.map((g) => (
          <details key={g.key} id={`u-${g.key}`} className="border border-black/10 rounded-[2px]">
            <summary className="cursor-pointer px-3 py-2 text-sm">
              <span className="font-medium mr-3">{g.name}</span><span className="text-xs opacity-60">{g.summary}</span>
            </summary>
            <ol className="px-3 pb-2">
              {g.items.map((it, i) => (
                <li key={i} className="border-t border-black/5 py-2 text-sm">
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
                    <span className="text-xs opacity-50 tabular-nums whitespace-nowrap">{homeMinute(it.at)}</span>
                    <span className="min-w-0 break-words">{it.title}</span>
                    {it.state && <span className={`text-xs ${TONE[it.state.tone]}`}>{it.state.text}</span>}
                    {it.how && <span className="text-xs opacity-60">{it.how}</span>}
                    {it.anchor && <a href={`#${it.anchor}`} className="text-xs underline underline-offset-2 opacity-60 hover:opacity-100">解读和追问 ↓</a>}
                    {it.href && <a href={it.href} target="_blank" rel="noreferrer" className="text-xs underline underline-offset-2 opacity-60 hover:opacity-100">打开 →</a>}
                  </div>
                  {it.lines.map((l, j) => <p key={j} className="text-xs opacity-70 mt-0.5 break-words">{l}</p>)}
                  {it.sections && it.sections.length > 0 && (
                    <details className="mt-1">
                      <summary className="cursor-pointer text-xs underline underline-offset-2 opacity-60">看内容</summary>
                      <div className="mt-1.5 flex flex-col gap-2 border-l-2 border-[var(--gold)]/40 pl-3">
                        {it.sections.map((s, j) => (
                          <div key={j}>
                            <p className="text-[11px] opacity-50">{s.label}</p>
                            <p className="text-xs leading-relaxed whitespace-pre-line break-words">{s.text}</p>
                          </div>
                        ))}
                      </div>
                    </details>
                  )}
                </li>
              ))}
            </ol>
            {g.more && <p className="px-3 pb-2 text-xs opacity-40">{g.more}</p>}
          </details>
        ))}
      </div>
      {groups.length === 0 && <p className="text-sm opacity-40">还没用过任何产品。</p>}
      {unused.length > 0 && <p className="text-xs opacity-40 mt-2">没用过：{unused.join("、")}</p>}

      <div className="grid sm:grid-cols-2 gap-6 mt-5 text-sm">
        <div>
          <p className="text-[11px] opacity-50 mb-1">回访（待寄／已寄未答／已答）</p>
          {revisits.length === 0 ? <p className="opacity-30">没有</p> : (
            <ul className="flex flex-col gap-0.5 tabular-nums">
              {revisits.map((r) => <li key={r.product}>{r.product}<span className="opacity-50 ml-2">{r.pending} / {r.sent} / {r.answered}</span></li>)}
            </ul>
          )}
        </div>
        <div>
          <p className="text-[11px] opacity-50 mb-1">自动寄的信</p>
          <ul className="flex flex-col gap-0.5">
            {letters.map((l) => <li key={l.name}>{l.name}<span className="opacity-50 ml-2">{l.state}</span></li>)}
          </ul>
        </div>
      </div>

      <div className="mt-5 text-sm">
        <p className="text-[11px] opacity-50 mb-1">生辰档案（读者存在帐号里的，{profiles.length} 份）</p>
        {profiles.length === 0 ? <p className="opacity-30">没有</p> : (
          <ul className="flex flex-col gap-1">
            {profiles.map((p, i) => (
              <li key={i} className="break-words">
                <span className="font-medium">{p.name}</span><span className="opacity-50">（{p.who}）</span>
                <span className="ml-2">{p.text}</span>
                <span className="ml-2 text-xs opacity-40 whitespace-nowrap">存于 {homeMinute(p.at)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
