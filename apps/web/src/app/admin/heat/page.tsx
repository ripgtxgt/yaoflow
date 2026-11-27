import { cookies } from "next/headers";
import { ADMIN_COOKIE, isAdmin } from "@/lib/admin-auth";
import { readEvents } from "@/lib/analytics-server";
import { heatReadings } from "@/lib/admin-heat";
import { afterTeaser, clickHeat, DEPTH_BANDS, HEAT_SINCE, scrollHeat } from "@/lib/heat";
import { homeDay } from "@/lib/clock";
import { bringNewStats, giftRewardsEarned, paidBrowserSessions } from "@/lib/db";
import { BRING_LABEL, bringNew } from "@/lib/bring-new";
import { AB_RUNS_FROM, endedTestStats } from "@/lib/ab-stats";
import { AdminLogin, AdminShell, Legend, Section, Stat } from "../ui";

export const dynamic = "force-dynamic";

/** 热区 (09-23, Neil: 「加上一个网页的热力图吧」) — see components/PageView for what is recorded and why no third-party recorder. */

const CLICK_LABEL: Record<string, string> = {
  "price-one": "轻解读按钮", "price-deep": "深断按钮", "teaser-blur": "点了模糊的那几行", currency: "换币种",
  "sub-upsell": "会员入口", "home-gua": "首页卦名",
  "sub-return": "回访日的会员提示", "gate-note": "闸门 → 记一笔进展", "gate-ask": "闸门 → 接着追问", "note-send": "记下进展",
  "member-card": "会员卡（09-26）", "gift-make": "生成送一卦链接", "gift-share": "分享送一卦", "gift-askdone": "追问用完 → 送一卦",
  // 09-27: buttons added since, which showed as raw (and 12-character-truncated) names. Both spellings are kept,
  // because clicks recorded before today were cut at 12 characters.
  situation: "选处境标签", "free-ask": "免费首读 · 填邮箱框", "free-go": "免费首读 · 确认领取", "invite-ask": "分享邀请 · 填邮箱框", "invite-go": "分享邀请 · 确认领取",
  "pair-ask": "合参 · 填邮箱框", "pair-go": "合参 · 确认领取", "followup-quick": "追问快捷问题", "followup-qui": "追问快捷问题",
  "gate-prior": "闸门 → 看上一卦", "case-publish": "公开卦例", "case-reward-gift": "卦例回礼 · 送人", "case-reward-self": "卦例回礼 · 自己用", "pack-buy": "买增购包（15 份）", "pack-buy-small": "买增购小包（5 份）", "pack-nudge-reading": "单买解读页 · 换成 15 份", "case-reward-": "卦例回礼（送人或自用）",
  "timing-hint": "应期提示", "member-daily": "会员 · 每日入口", "pass-buy": "买通卡", "pass-link": "通卡链接", "upgrade-credit": "单买抵首月", "upgrade-cred": "单买抵首月",
  "daily-react": "今日三卦 · 应验反馈", "daily-ask": "今日三卦 · 问自己的", "daily-ask-box": "今日三卦 · 提问框", "daily-ask-bo": "今日三卦 · 提问框", "daily-share": "今日三卦 · 分享", "daily-sub": "今日三卦 · 订阅邮件",
  "reply-go": "像回复 → 去追问", "reply-new": "像回复 → 仍起新卦", "reply-like": "像回复的提示", wallet: "Apple / Google Pay", "wallet-card": "钱包 → 改用卡",
  "second-single": "第二问 · 单买", "second-singl": "第二问 · 单买", "second-sub": "第二问 · 开会员", "second-pass": "第二问 · 通卡", "second-today": "第二问 · 今日提示",
  "teaser-odds": "预览里的五档倾向", "gift-recv": "收礼页 · 自己起卦", "gift-recv-done": "收礼 · 追问用完后的首次价卡", "price-one-link": "只给一个价格组 · 轻解读小字链接", "teaser-more": "预览整段（对照）", "second-cast": "第二卦提示", "proof-story": "应验卡 · 存竖图", "proof-here": "解读页 · 生成应验卡", "revisit-here": "解读页 · 回答应期", "sent-to": "改寄邮箱", "guarantee-line": "保障说明", "guarantee-li": "保障说明", "link-note": "Link 付款说明",
  "preview-deep": "x · 深断里还有 → 看深断", "save-cast-open": "y · 存到邮箱（展开）", "save-cast-go": "y · 存到邮箱（寄出）",
};
const CHAIN_LABEL: Record<string, string> = {"gift_paid": "送一卦（付费深断附带）", "gift_pool": "送一卦（会员送卦额度）", "gift_case": "送一卦（公开卦例回礼）", "case_light": "卦例回礼 · 自己用的轻解读", "invite_light": "分享卡新人首卦", "joint": "合参（对方那一卦）", "ab_free": "对照测试：首份轻解读免费", "ref_light": "推荐回馈（朋友第一卦，双方各一次轻解读）"};
const pct = (x: number) => `${Math.round(x * 100)}%`;
const secs = (ms: number | null) => (ms == null ? "—" : ms < 60_000 ? `${Math.round(ms / 1000)} 秒` : `${(ms / 60_000).toFixed(1)} 分`);

export default async function HeatPage({ searchParams }: { searchParams: Promise<{ key?: string; denied?: string; days?: string }> }) {
  const { key, denied, days } = await searchParams;
  if (!(await isAdmin((await cookies()).get(ADMIN_COOKIE)?.value, key))) return <AdminLogin denied={denied === "1"} back="/admin/heat" />;
  const d = Math.min(30, Math.max(1, Number(days) || 7));
  // 10-14 后台变卡: the heat tables read the whole event log — kept 3 minutes, served stale up to 30 while recomputed (lib/swr.ts)
  const { at, scroll, clicks, brought, chains, giftThanks, ended } = heatReadings(d);
  const ab = ended;
  const homeAb = ended.home;

  return (
    <AdminShell
      title="热区"
      nav={[{ href: "#ab", label: "对照测试" }, { href: "#bring", label: "带新" }, { href: "#teaser", label: "预览之后" }, { href: "#scroll", label: "滚动深度" }, { href: "#clicks", label: "点了什么" }]}
      right={<>{[1, 7, 30].map((n) => <a key={n} href={`/admin/heat?days=${n}`} className={`px-2 py-1 rounded-[2px] ${d === n ? "bg-[var(--ink)] text-[var(--paper)]" : "opacity-60 hover:opacity-100"}`}>{n} 天</a>)}</>}
    >
      <p className="text-xs opacity-50 mb-8">从 {homeDay(HEAT_SINCE)} 起才开始记录。只记三样东西：每页滑到多深、停了多久、点了哪些有名字的按钮——不录屏、不记文字、不记坐标，读者的问题与解读从不离开浏览器。</p>

      <Section id="ab" title="对照测试" sub="09-26 起 · 浏览器随机分两组 · 每个测试只算它进行的那几天（不受右上角天数影响；结束后所有人都记在原样那组，混进来会失真）">
        {([["preview", "x · 免费那一句下面列出「这一卦的深断里还有」（应期只露月份）+ 价格按钮新话术（10-02 至 10-05 对照，10-05 起全开：按人算 x1 付费 10.7% 对 x0 5.6%；之后所有会话都记 x1）", "x"], ["save", "y · 「还没想好？把这一卦存到邮箱」+ 一天后一封提醒（10-02 至 10-07，已停：982 人里 6 个用）", "y"], ["free", "首份轻解读免费（留邮箱）（09-26 至 10-07 对照，10-08 起全开：付费 5.0% 对 5.4% 没差别，15 天多留 283 个邮箱）", "f"], ["odds", "预览先给五档倾向（09-26 至 10-07，已停：付费 5.0% 对 5.5% 没差别）", "o"], ["onePrice", "首次用户只给一个价格（09-28 至 10-02，已停）", "p"], ["verdict", "预览多露一点：断语整段公开（09-28 至 10-02，已停）", "v"]] as const).map(([k, title, p]) => (
          <div key={k} className="mb-6">
            <p className="text-sm mb-2">{title}</p>
            <table className="text-sm w-full max-w-2xl">
              <thead><tr className="text-left text-xs opacity-50"><th className="py-1 font-normal">组</th><th className="font-normal">会话</th><th className="font-normal">看到预览</th><th className="font-normal">点价格</th><th className="font-normal">去付款</th><th className="font-normal">领免费</th>
                {k === "preview" && <th className="font-normal">点「看深断」</th>}
                {k === "save" && <><th className="font-normal">存到信箱</th><th className="font-normal">从信回来</th><th className="font-normal">回来后付了</th></>}
                <th className="font-normal">付了钱</th><th className="font-normal">付费 / 预览</th></tr></thead>
              <tbody>{ab[k].map((r) => (
                <tr key={r.arm} className="border-t border-black/5"><td className="py-1">{p}{r.arm}{r.arm === "1" ? "（新）" : "（原样）"}</td><td>{r.sessions}</td><td>{r.teased}</td><td>{r.clicked}</td><td>{r.checkout}</td><td>{r.free}</td>
                  {k === "preview" && <td>{r.previewTaps}</td>}
                  {k === "save" && <><td>{r.saved}</td><td>{r.returned}</td><td>{r.returnPaid}</td></>}
                  <td>{r.paid}</td><td>{r.teased ? pct(r.paid / r.teased) : "—"}</td></tr>
              ))}</tbody>
            </table>
          </div>
        ))}
        <div className="mb-6">
          <p className="text-sm mb-2">首页首屏：「心里悬着一件事？」+ 一点就起卦的例题（09-30 至 10-07，已停、回到原首屏：起卦率 63% 对 64%、付费 3.1% 对 3.7%；只算落在首页的会话）</p>
          <table className="text-sm w-full max-w-2xl">
            <thead><tr className="text-left text-xs opacity-50"><th className="py-1 font-normal">组</th><th className="font-normal">落在首页</th><th className="font-normal">开始起卦</th><th className="font-normal">摇完卦</th><th className="font-normal">点价格</th><th className="font-normal">付了钱</th><th className="font-normal">起卦率</th></tr></thead>
            <tbody>{homeAb.map((r) => (
              <tr key={r.arm} className="border-t border-black/5"><td className="py-1">h{r.arm}{r.arm === "1" ? "（新）" : "（原样）"}</td><td>{r.landed}</td><td>{r.started}</td><td>{r.cast}</td><td>{r.clicked}</td><td>{r.paid}</td><td>{r.landed ? pct(r.cast / r.landed) : "—"}</td></tr>
            ))}</tbody>
          </table>
        </div>
        <Legend>首页那一组比「起卦率」，再看「付了钱」有没有跟着涨（例题带进来的人会不会只摇不买）。开关：构建时 AB_HOME=off。其余几组：比「付费 / 预览」。免费那组还要看下面「带新」表里「对照测试：首份轻解读免费」一行的「用后付费」——领了免费的人之后有没有付钱。样本太小时差几个百分点不算数，至少等每组有几百个「看到预览」再下结论。开关：服务器 AB_FREE_LIGHT / AB_TEASER_ODDS / AB_PREVIEW / AB_SAVE 设为 off 即停（AB_SAVE=off 只停入口；已存的卦的那一封提醒另由 SAVED_FOLLOWUP=off 停）。x 组看「付费 / 预览」有没有比 x0 高；y 组除了「付费 / 预览」，再看「存到信箱」的人里有多少「从信回来」、回来后付了多少——存了却不回来，说明那封提醒没用。「只给一个价格」那组要一起看轻解读的付费单有没有少、深断有没有多；「断语整段」那组要看轻解读会不会被免费的那段吃掉。</Legend>
      </Section>

      <Section id="bring" title="带新" sub="读者转出去的东西，带来了多少人、多少人起卦、多少人付了钱">
        <table className="text-sm w-full max-w-2xl mb-6">
          <thead><tr className="text-left text-xs opacity-50"><th className="py-1 font-normal">从哪来（首次接触）</th><th className="font-normal">来访</th><th className="font-normal">起卦</th><th className="font-normal">去付款</th><th className="font-normal">付了钱</th></tr></thead>
          <tbody>{brought.length === 0 ? <tr><td className="py-1 opacity-40">—</td></tr> : brought.map((r) => (
            <tr key={r.source} className="border-t border-black/5"><td className="py-1">{BRING_LABEL[r.source]}</td><td>{r.visits}</td><td>{r.casts}{r.visits ? <span className="opacity-40 text-xs"> {pct(r.casts / r.visits)}</span> : null}</td><td>{r.checkout}</td><td>{r.paid}</td></tr>
          ))}</tbody>
        </table>
        <table className="text-sm w-full max-w-2xl">
          <thead><tr className="text-left text-xs opacity-50"><th className="py-1 font-normal">链条（数据库）</th><th className="font-normal">发出</th><th className="font-normal">被用</th><th className="font-normal">其中新人</th><th className="font-normal">用后付费</th></tr></thead>
          <tbody>{chains.map((r) => (
            <tr key={r.key} className="border-t border-black/5"><td className="py-1">{CHAIN_LABEL[r.key] ?? r.key}</td><td>{r.sent}</td><td>{r.used}</td><td>{r.newPeople}</td><td>{r.paidAfter}</td></tr>
          ))}</tbody>
        </table>
        <p className="text-xs opacity-60 mt-3">送一卦谢礼（朋友首次付费 → 送的人得一次深断）：区间内发出 {giftThanks} 次。</p>
        <Legend>怎么读：上表按浏览器会话算，「付了钱」只认同一个浏览器里的付款；下表按人算，「用后付费」是用了之后任何时候、任何设备的第一次付费或开会员。两边都不含我们自己的测试账号。</Legend>
      </Section>

      <Section id="teaser" title="预览之后" sub="起卦 → 看到免费那一句 → 价格按钮进入视野 → 点">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          <Stat label="看到预览" value={at.teased} />
          <Stat label="价格进入视野" value={at.teased ? pct(at.seen / at.teased) : "—"} sub={`${at.seen} 人 · 预览出现后中位 ${secs(at.medianMsToPrice)}`} />
          <Stat label="点了价格" value={at.teased ? pct(at.clicked / at.teased) : "—"} sub={`${at.clicked} 人`} />
          <Stat label="看到价格却没点" value={at.seen ? pct(at.seenNotClicked / at.seen) : "—"} sub={`没点的人中位停留 ${secs(at.medianDwellNotClicked)}`} />
        </div>
        {/* 09-26: the funnel used to stop at the click; the biggest leak turned out to be after it, on Stripe's page */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          <Stat label="去了 Stripe 付款页" value={at.checkout} sub={at.clicked ? `点了价格的 ${pct(at.checkout / at.clicked)}（其余是会员额度）` : undefined} />
          <Stat label="付款完成" value={at.checkout ? pct(at.bought / at.checkout) : "—"} sub={`${at.bought} 人`} />
          <Stat label="到了 Stripe 又退回来" value={at.checkout ? pct(at.checkoutBack / at.checkout) : "—"} sub={`${at.checkoutBack} 人没付款、回到了网站`} />
          <Stat label="预览 → 付款" value={at.teased ? pct(at.bought / at.teased) : "—"} />
        </div>
        {at.bySource.length > 0 && (
          <table className="text-sm w-full max-w-xl">
            <thead><tr className="text-left text-xs opacity-50"><th className="py-1 font-normal">来源 ?c=</th><th className="font-normal">看到预览</th><th className="font-normal">价格进视野</th><th className="font-normal">点了</th></tr></thead>
            <tbody>{at.bySource.map((r) => <tr key={r.c} className="border-t border-black/5"><td className="py-1">{r.c}</td><td>{r.teased}</td><td>{pct(r.seen / r.teased)}</td><td>{pct(r.clicked / r.teased)}</td></tr>)}</tbody>
          </table>
        )}
        <Legend>怎么读：「价格进入视野」低 → 很多人根本没滑到按钮，先把按钮往上挪；「看到价格却没点」高 → 看到了也不买，要改预览那一句或价格。</Legend>
      </Section>

      <Section id="scroll" title="滚动深度" sub="每类页面，离开时滑到了哪里（颜色越深，到达的人越多）">
        {scroll.length === 0 ? <p className="text-sm opacity-50">还没有数据。</p> : (
          <table className="text-sm w-full">
            <thead><tr className="text-left text-xs opacity-50"><th className="py-1 font-normal">页面</th><th className="font-normal">离开次数</th>{DEPTH_BANDS.map((b) => <th key={b} className="font-normal">到 {b}%</th>)}<th className="font-normal">中位停留</th></tr></thead>
            <tbody>
              {scroll.map((g) => (
                <tr key={g.name} className="border-t border-black/5">
                  <td className="py-1.5 pr-3 whitespace-nowrap">{g.name}</td>
                  <td className="pr-3">{g.n}</td>
                  {g.bands.map((v, i) => (
                    <td key={i} className="pr-1"><span className="inline-block w-full text-center rounded-[2px] py-1 text-xs" style={{ background: `rgba(176,64,60,${(0.08 + v * 0.8).toFixed(2)})`, color: v > 0.55 ? "#f4f2ec" : "#14151c" }}>{pct(v)}</span></td>
                  ))}
                  <td className="pl-2 whitespace-nowrap">{secs(g.medianMs)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      <Section id="clicks" title="点了什么" sub="带名字的按钮，按点过的人数">
        {clicks.length === 0 ? <p className="text-sm opacity-50">还没有数据。</p> : (
          <ul className="text-sm flex flex-col gap-1 max-w-md">
            {clicks.map((c) => (
              <li key={c.name} className="flex items-center gap-3">
                <span className="w-36 shrink-0">{CLICK_LABEL[c.name] ?? c.name}</span>
                <span className="h-2 rounded-full bg-[var(--cinnabar)]" style={{ width: `${Math.max(4, (c.sessions / clicks[0]!.sessions) * 200)}px` }} />
                <span className="opacity-60">{c.sessions}</span>
              </li>
            ))}
          </ul>
        )}
        <Legend>「点了模糊的那几行」= 读者去点被遮住的解读——说明想看，是付费意向的信号。</Legend>
      </Section>
    </AdminShell>
  );
}
