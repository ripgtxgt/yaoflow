import { cookies } from "next/headers";
import { ADMIN_COOKIE, isAdmin } from "@/lib/admin-auth";
import { AdminLogin, AdminShell } from "../ui";
import { inboxList } from "@/lib/inbound";
import { ensureAutoColumns, supportAutoMode, type AutoRow } from "@/lib/support-auto";
import { homeMinute as when } from "@/lib/clock";
import ReplyOnceForm from "@/components/admin/ReplyOnceForm";

export const dynamic = "force-dynamic";

/**
 * 09-29 客服来信 (Neil: 用户发给 support 的信进了垃圾箱，没看到，最后变成拒付). Every letter to @yaoflow.com,
 * kept by us — not by anyone's spam filter. Open ones first; "已处理" once answered.
 */
export default async function InboxPage({ searchParams }: { searchParams: Promise<{ key?: string; denied?: string; open?: string; sent?: string; again?: string; other?: string }> }) {
  const { key, denied, open, sent, again, other } = await searchParams;
  if (!(await isAdmin((await cookies()).get(ADMIN_COOKIE)?.value, key))) return <AdminLogin denied={denied === "1"} back="/admin/inbox" />;
  ensureAutoColumns();
  const all = inboxList(200) as AutoRow[];
  // 10-23 进度表 100: directory / newsletter / verification mail (kind vendor) folds under 「其他」 at the bottom
  const rows = all.filter((r) => r.kind !== "vendor");
  const others = all.filter((r) => r.kind === "vendor");
  const mode = supportAutoMode();
  const openCount = rows.filter((r) => !r.handled_at).length;
  const card = (r: AutoRow) => {
    const isOpen = open === r.id;
    const atts = r.attachments ? (JSON.parse(r.attachments) as { filename?: string }[]) : [];
    return (
      <div key={r.id} className={`rounded-[2px] border px-4 py-3 text-sm ${r.handled_at || r.kind === "vendor" ? "border-black/10 opacity-60" : "border-[var(--cinnabar)]/50"}`}>
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <span className="font-medium break-all">{r.from_name ? `${r.from_name} · ` : ""}{r.from_addr}</span>
          <span className="text-xs opacity-60 tabular-nums">{when(r.received_at)} · 收件 {r.to_addrs}</span>
        </div>
        <p className="mt-1">{r.kind === "vendor" ? <span className="text-xs opacity-60 mr-2">[非读者]</span> : null}{r.subject || "（无标题）"}</p>
        <p className="text-xs opacity-60 mt-1">
          {r.customer_id ? <a href={`/admin/customers/${r.customer_id}`} className="underline underline-offset-4">客户 #{r.customer_id}</a> : "系统里没有这个邮箱"}
          {" · "}{r.forwarded_at ? "已转发到邮箱" : <span className="text-[var(--cinnabar)]">转发失败，cron 会重试{r.forward_error ? `（${r.forward_error.slice(0, 80)}）` : ""}</span>}
          {atts.length ? ` · 附件 ${atts.length} 个` : ""}
          {r.handled_at ? ` · ${when(r.handled_at)} 已处理` : ""}{r.note ? ` · ${r.note}` : ""}
        </p>
        {r.auto_at ? (
          <p className="text-xs opacity-60 mt-1">
            自动处理 {when(r.auto_at)} · 判 {r.auto_class ?? "?"} · {r.auto_action === "reply" || r.auto_action === "refund_reply" ? "已自动回" : r.auto_action === "ack" ? "标处理未回" : r.auto_action === "escalate" ? "转 Neil（草稿在下面）" : r.auto_action === "dry" ? "干跑" : r.auto_action === "error" ? "出错" : r.auto_action ?? ""}
            {r.auto_note ? ` · ${r.auto_note}` : ""}
          </p>
        ) : null}
        {r.auto_draft && !r.handled_at ? (
          /* 10-23 进度表 99: the button locks on the first tap; the route refuses a second copy within five minutes */
          <ReplyOnceForm id={r.id} draft={r.auto_draft} rows={Math.min(16, r.auto_draft.split("\n").length + 2)} />
        ) : null}
        {isOpen ? (
          <pre className="mt-3 whitespace-pre-wrap text-[13px] leading-relaxed bg-black/[0.03] rounded-[2px] p-3 max-h-[60vh] overflow-auto">{r.text ?? (r.html ?? "").replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<[^>]+>/g, " ").replace(/\s+\n/g, "\n").trim()}</pre>
        ) : (
          <p className="mt-2 text-xs opacity-70 line-clamp-2">{(r.text ?? (r.html ?? "").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").slice(0, 200)}</p>
        )}
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
          <a href={isOpen ? "/admin/inbox" : `/admin/inbox?open=${r.id}`} className="underline underline-offset-4">{isOpen ? "收起" : "看全文"}</a>
          <a href={`mailto:${r.from_addr}?subject=${encodeURIComponent(`Re: ${r.subject ?? ""}`)}`} className="underline underline-offset-4">回信</a>
          <form method="post" action="/api/admin/inbox" className="inline-flex items-center gap-2">
            <input type="hidden" name="id" value={r.id} />
            {r.handled_at ? (
              <><input type="hidden" name="action" value="reopen" /><button className="underline underline-offset-4 opacity-60">重新标为未处理</button></>
            ) : (
              <><input name="note" placeholder="备注（可不填）" className="bg-transparent border border-black/15 rounded-[2px] px-2 py-1 w-40" /><button className="px-2 py-1 rounded-[2px] bg-[var(--ink)] text-[var(--paper)]">标为已处理</button></>
            )}
          </form>
        </div>
      </div>
    );
  };
  return (
    <AdminShell title="客服来信" nav={[]}>
      <p className="text-sm opacity-60 mb-6">
        发到任何 @yaoflow.com 地址的信都在这里（经 Resend 收信），同时转发到你的两个邮箱，回复地址是读者本人。
        {openCount ? <span className="text-[var(--cinnabar)] ml-2">未处理 {openCount} 封</span> : <span className="ml-2">全部处理完了</span>}
        <span className="ml-2">· 自动处理：{mode === "on" ? "开" : mode === "dry" ? "干跑（只给你看会怎么做）" : "关"}（服务器 SUPPORT_AUTO）</span>
        {sent ? <span className="ml-2 text-[var(--ink)]">{again ? `这封五分钟内已经发过，没有再发（${sent}）` : `回信已发出（${sent}）`}</span> : null}
      </p>
      {rows.length === 0 && <p className="text-sm opacity-40">还没有来信。</p>}
      <div className="space-y-3">{rows.map(card)}</div>
      {/* 10-23 进度表 100: directory / newsletter / verification mail — kept and forwarded, folded here, never counted as unanswered */}
      {others.length > 0 && (
        <details id="other" open={other === "1" || (!!open && others.some((r) => r.id === open))} className="mt-8">
          <summary className="text-sm opacity-60 cursor-pointer mb-3">
            其他（非读者来信：目录站的确认与验证码、通讯、推销）{others.length} 封 —— 不算未处理，客服自动处理不读；照样转发到你的邮箱，主旨前面是「[非读者]」
          </summary>
          <div className="space-y-3">{others.map(card)}</div>
        </details>
      )}
    </AdminShell>
  );
}
