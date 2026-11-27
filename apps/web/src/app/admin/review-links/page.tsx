import { cookies } from "next/headers";
import { ADMIN_COOKIE, isAdmin } from "@/lib/admin-auth";
import { readEvents } from "@/lib/analytics-server";
import { homeDay } from "@/lib/clock";
import { ensureReviewLinks, REVIEW_DAYS, REVIEW_SITES, reviewLinks, reviewTag } from "@/lib/review-links";
import { AdminLogin, AdminShell, Section } from "../ui";

export const dynamic = "force-dynamic";

/**
 * 10-16 进度表 52: the review sites' trial links (lib/review-links.ts) — made once on the first visit here, then listed
 * with their state, and what each site's tag has brought in (visitors whose first link carried rv-<site>).
 */
export default async function ReviewLinksPage({ searchParams }: { searchParams: Promise<{ key?: string; denied?: string }> }) {
  const { key, denied } = await searchParams;
  if (!(await isAdmin((await cookies()).get(ADMIN_COOKIE)?.value, key))) return <AdminLogin denied={denied === "1"} back="/admin/review-links" />;
  const made = ensureReviewLinks();
  const links = reviewLinks();
  // first-touch tag per tab session (lib/track.ts campaignTag), over the links' lifetime and a little more
  const evs = readEvents(REVIEW_DAYS + 15, { only: ["page_view", "cast_complete", "purchase"] });
  const by = new Map<string, { sessions: Set<string>; casters: Set<string>; buyers: Set<string> }>();
  for (const e of evs) {
    if (!e.c?.startsWith("rv-")) continue;
    const b = by.get(e.c) ?? { sessions: new Set<string>(), casters: new Set<string>(), buyers: new Set<string>() };
    by.set(e.c, b);
    b.sessions.add(e.s);
    if (e.e === "cast_complete") b.casters.add(e.s);
    if (e.e === "purchase" && e.method === "paid") b.buyers.add(e.s);
  }
  const STATE = { open: "可用", used: "已用", expired: "已过期" } as const;
  return (
    <AdminShell title="评测试用链接" nav={[]}>
      <p className="text-sm opacity-60 mb-6">
        每家 3 个，每个是一份完整深断，{REVIEW_DAYS} 天有效、只能用一次。对方点开 → 起自己的卦 → 点「深斷」直接看，不用付钱。
        链接带来源标记 <span className="font-mono">rv-站名</span>（标记最长 16 个字，所以不是 review-…），渠道表里也看得到。{made ? ` 刚生成 ${made} 个。` : ""}
      </p>
      <Section id="sites" title="各家带来了什么">
        <table className="text-sm w-full">
          <thead><tr className="text-left opacity-50"><th className="py-1 pr-4">网站</th><th className="pr-4">链接已用</th><th className="pr-4">带标记的访客（会话）</th><th className="pr-4">其中起卦</th><th>其中付费</th></tr></thead>
          <tbody>
            {REVIEW_SITES.map((s) => {
              const b = by.get(reviewTag(s.id));
              const used = links.filter((l) => l.site === s.id && l.state === "used").length;
              return (
                <tr key={s.id} className="border-t border-black/5">
                  <td className="py-1 pr-4">{s.name}</td>
                  <td className="pr-4 tabular-nums">{used} / {links.filter((l) => l.site === s.id).length}</td>
                  <td className="pr-4 tabular-nums">{b?.sessions.size ?? 0}</td>
                  <td className="pr-4 tabular-nums">{b?.casters.size ?? 0}</td>
                  <td className="tabular-nums">{b?.buyers.size ?? 0}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Section>
      {REVIEW_SITES.map((s) => (
        <Section key={s.id} id={`site-${s.id}`} title={s.name}>
          <ol className="space-y-3 text-sm">
            {links.filter((l) => l.site === s.id).map((l) => (
              <li key={l.token}>
                <span className="opacity-50 mr-2">#{l.n}</span>
                <span className={l.state === "open" ? "text-emerald-700" : "opacity-50"}>{STATE[l.state]}</span>
                <span className="opacity-50"> · {l.state === "used" && l.usedAt ? `${homeDay(l.usedAt)} 用掉` : `到 ${homeDay(l.expiresAt)}`}</span>
                <div className="font-mono text-xs break-all mt-1 select-all">{l.url}</div>
              </li>
            ))}
          </ol>
        </Section>
      ))}
    </AdminShell>
  );
}
