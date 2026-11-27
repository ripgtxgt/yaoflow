import { canSee } from "@/lib/features";
import { fill, tongkaT } from "@/lib/tongka";
import { firstPassEligible, passCredit } from "@/lib/pass";
import type { Metadata } from "next";
import { caseRewardable } from "@/lib/case-reward";
import { orderBySession } from "@/lib/db";
import type { ReactNode } from "react";
import Link from "next/link";
import { cv } from "@/lib/dict/convert";
import { notFound, redirect } from "next/navigation";
import { hexagramByNumber, type LineValue } from "@yaoflow/engine";
import { isLocale, t, type Locale } from "@/lib/i18n";
import { asLocale } from "@/lib/locales";
import { currentCustomer } from "@/lib/auth";
import { cookies, headers } from "next/headers";
import { CURRENCY_COOKIE, detectCurrency } from "@/lib/money";
import { edgeCountry } from "@/lib/geo";
import { cachedQuestionInfo } from "@/lib/matter-questions";
import { startsAtMonthlyFee, latestSubscription, mattersForCustomer, paymentsForCustomer, myReferralStats, threadCastsForCustomer, type ThreadCast } from "@/lib/db";
import { invoicesFor } from "@/lib/stripe";
import { formatMoney, isCurrency } from "@/lib/money";
import { tt } from "@/lib/dict/thread";
import { mt } from "@/lib/dict/matter";
import { outcomeUrl, proofUrl } from "@/lib/outcome-token";
import { threadStatus } from "@/components/ThreadPanel";
import { DEEP_PER_MONTH, entitlementFor, syncSubscription } from "@/lib/subscription";
import { hexName } from "@/lib/names";
import FigureMark, { changedYangs, primaryYangs } from "@/components/FigureMark";
import { LogoutButton, ManageButton, PackSync, PassSync, SubSync, SubscribeButtons } from "@/components/AccountActions";
import PackBuy from "@/components/PackBuy";
import { passT } from "@/lib/dict/pass";
import AskAgain from "@/components/AskAgain";
import InviteCard from "@/components/InviteCard";
import HashOpen from "@/components/HashOpen";
import ProfilesPanel from "@/components/ProfilesPanel";
import BmgMine from "@/components/bmg/BmgMine";
import MyReferrals, { type RefView } from "@/components/MyReferrals";
import HexAtlas from "@/components/HexAtlas";
import GiftCastPanel from "@/components/GiftCastPanel";
import { giftPoolFor, MEMBER_FOLLOWUP_LIMIT } from "@/lib/membership";
import { myReferrals } from "@/lib/my-referrals";
import { liveCasesForSessions } from "@/lib/db";
import { caseImpact } from "@/lib/case-impact";
import { casePath } from "@/lib/cases";
import { focusCast, memberDaily } from "@/lib/member-daily";
import { dailyLineOrWarm } from "@/lib/daily-line";
import DailyShare from "@/components/DailyShare";
import { creditCurrency, upgradeCredit } from "@/lib/upgrade-credit";
import { mg } from "@/lib/dict/member-gift";
import { priceMinor, yearlySavePct } from "@/lib/money";
import { yearlyOn } from "@/lib/subscription";
import { retainUrl } from "@/lib/retain";
import { rp } from "@/lib/dict/renew-perks";
import { OWN_CARRY_MAX } from "@/lib/sub-plan";
import { ACCOUNT_TABS, pickTab, tabT, type AccountTab } from "@/lib/dict/account-tabs";
import { howToAskFor } from "@/lib/how-to-ask";
import { guaranteeCheck, latestPassOrderSid, revisitPlans, selfRevisitsForCustomer } from "@/lib/db";
import GuaranteePanel from "@/components/GuaranteePanel";
import { selfReportUrl, selfRevisitUi } from "@/lib/self-revisit";
import { brandName } from "@/lib/brand";
import { myReports } from "@/lib/my-reports";
import type { MyReportFilter } from "@/lib/dict/my-reports";
import { MyReportsFull, MyReportsRecent } from "@/components/MyReports";

const REPORT_FILTERS = ["bazi", "ziwei", "astro", "zhengyuan", "hepan", "nianshu", "tarot", "jieqian", "name"] as const;

// 10-07 回访改问法: the one-tap links carry the fact, never a verdict (lib/revisit-judge.ts)
const FACT = { hit: "happened", partial: "stirred", miss: "nothing", open: "open" } as const;

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  return { title: `${t(asLocale(locale), "accountTitle")} · ${brandName(locale)}`, robots: { index: false } };
}

const fmtDate = (ms: number, locale: Locale) =>
  new Date(ms).toLocaleDateString(locale === "zh" ? "zh-CN" : locale === "zh-hant" ? "zh-TW" : locale, { year: "numeric", month: "short", day: "numeric" });

/** The account: who you are, what your membership covers, and every cast you have made. */
export default async function AccountPage(
  { params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ sub?: string; sync?: string; pass?: string; pack?: string; packed?: string; tab?: string; want?: string; rp?: string }> },
) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const l = locale as Locale;
  const me = await currentCustomer();
  if (!me) redirect(`/${l}/login?next=${encodeURIComponent(`/${l}/account`)}`);

  const sp = await searchParams;
  const tqVisible = await canSee("today-qian"); // 10-15 功能开关
  const tongka = await canSee("tongka"); // 10-22 通卡 (lib/tongka.ts)
  const tk = tongkaT(l);
  // 09-30 分页 (a reader: 「我的卦那邊是否可以就單純是我的卦，分享卦是另外分頁呢？手機操作不太好使用」)
  const tab: AccountTab = pickTab(sp);
  const tabHref = (x: AccountTab) => `/${l}/account${x === "revisit" ? "" : `?tab=${x}`}`;
  const syncSession = sp.sub && /^cs_[a-zA-Z0-9_]+$/.test(sp.sub) ? sp.sub : null;
  const passSession = sp.pass && /^cs_[a-zA-Z0-9_]+$/.test(sp.pass) ? sp.pass : null;
  const packSession = sp.pack && /^cs_[a-zA-Z0-9_]+$/.test(sp.pack) ? sp.pack : null;
  if (sp.sync === "1") {
    // back from Stripe's portal: a cancellation or card change must show right now, not after the next cron
    const latest = latestSubscription(me.customerId);
    if (latest) { try { await syncSubscription(latest.stripe_subscription_id, me.customerId); } catch { /* mirror stands */ } }
  }
  const ent = await entitlementFor(me.customerId);
  const pool = ent.active ? giftPoolFor(me.customerId) : null; // 09-24 M3
  const casts = threadCastsForCustomer(me.customerId);
  // 10-23 进度表 114「我的報告」(#838: 合盤找不到要去信箱): every report and personal reading — all of them on 記錄 (by
  // product), the newest three on 回訪
  const reports = tab === "record" || tab === "revisit" ? await myReports(me.customerId, l).catch(() => []) : [];
  const reportFilter = (REPORT_FILTERS as readonly string[]).includes(sp.rp ?? "") ? (sp.rp as MyReportFilter) : null;
  // 我的卦谱 + 个人应验记录 (09-21, A3): what this account has walked, and its own track record
  const drawn = new Set(casts.map((c) => c.primary_num));
  // 09-23 粘性: the casts grouped by matter, and the record told as matters — asked, reached their window, came true
  // 09-29 「一件事」: the stored matters (a cast not filed yet stands alone); newest matter first
  const matterTitles = new Map(mattersForCustomer(me.customerId).map((m) => [m.id, m.title]));
  const matters = (() => {
    const by = new Map<string, ThreadCast[]>();
    for (const c of casts) {
      const k = c.matter_id && matterTitles.has(c.matter_id) ? `m${c.matter_id}` : `c${c.id}`;
      (by.get(k) ?? by.set(k, []).get(k)!).push(c);
    }
    return [...by.values()];
  })();
  const nowMs = Date.now();
  const windows = casts.filter((c) => c.revisit_id && c.due_at).sort((a, b) => (b.due_at ?? 0) - (a.due_at ?? 0));
  const reached = windows.filter((c) => (c.due_at ?? 0) <= nowMs || c.outcome);
  const record = {
    matters: matters.length,
    due: reached.length,
    hit: windows.filter((c) => c.outcome === "hit").length,
    miss: windows.filter((c) => c.outcome === "miss").length,
  };
  // 我的推荐: what this account's sharing has done (dates formatted here so hydration matches)
  const site = (process.env.SITE_URL ?? "https://yaoflow.com").replace(/\/$/, "");
  const mine = myReferrals(me.customerId, l, site);
  // 09-25 付款记录: every charge with Stripe's receipt, and the membership invoices
  const payments = paymentsForCustomer(me.customerId, me.email ?? null);
  const latestSub = latestSubscription(me.customerId);
  const invoices = latestSub?.stripe_customer_id ? await invoicesFor(latestSub.stripe_customer_id) : [];
  const money = (cur: string | null, minor: number | null) => { const c = (cur ?? "").toUpperCase(); return minor != null && isCurrency(c) ? formatMoney(c, minor, l) : ""; };
  const now = Date.now();
  const refView: RefView = {
    broughtCasts: mine.broughtCasts,
    inviteLights: mine.inviteLights,
    gifts: mine.gifts.map((g) => ({
      token: g.token, url: g.url, created: fmtDate(g.createdAt, l), expires: fmtDate(g.expiresAt, l),
      used: g.usedAt ? fmtDate(g.usedAt, l) : null, expired: !g.usedAt && g.expiresAt < now,
    })),
    rewards: mine.rewards.map((r) => ({ id: r.id, href: r.href, expires: fmtDate(r.expiresAt, l), used: r.usedAt ? fmtDate(r.usedAt, l) : null })),
    giftable: mine.giftable.map((g) => {
      const p = hexagramByNumber(g.primaryNum);
      const c = g.changedNum ? hexagramByNumber(g.changedNum) : null;
      return { sid: g.sid, date: fmtDate(g.castAt, l), title: `${p ? hexName(p, l) : ""}${c ? ` → ${hexName(c, l)}` : ""}`, question: g.question };
    }),
  };
  // first guess at the buyer's currency without the device clock (the client refines with it after mount)
  const h = await headers();
  const country = edgeCountry(h);
  const initialCurrency = detectCurrency({
    chosen: (await cookies()).get(CURRENCY_COOKIE)?.value,
    language: h.get("accept-language"),
    edgeCountry: country,
  });

  // 09-23 (Neil: 「account页面太乱了……什么东西最重要放在最上面」): what needs the reader comes first —
  // the next question, the windows waiting for an answer, the matters in play. The long lists fold away.
  const awaiting = windows.filter((c) => !c.outcome && (c.due_at ?? 0) <= nowMs);
  const upcoming = windows.filter((c) => !c.outcome && (c.due_at ?? 0) > nowMs).sort((a, b) => (a.due_at ?? 0) - (b.due_at ?? 0));
  // 10-22 进度表 80 看自己的回訪: the reports, the 年書 months and the picked days that will ask (or asked) — Chinese pages only
  // 10-30 进度表 128 ④: a 星盤 report bought on a page in another language asks too — the list shows on every page
  const selfRows = selfRevisitsForCustomer(me.customerId).filter((r) => r.status !== "skipped");
  const su = selfRevisitUi(l);
  // 10-22 进度表 89 (设计稿 M1): 「你當時打算：…」 under the windows still to come
  const plans = (l === "zh" || l === "zh-hant") ? revisitPlans(upcoming.slice(0, 5).map((c) => c.revisit_id ?? 0)) : new Map<number, string>();
  const daysLeft = (ms: number) => Math.max(0, Math.ceil((ms - nowMs) / 86_400_000));
  const recent = matters.slice(0, RECENT);
  const answerLinks = (c: ThreadCast) => (
    <span className="flex flex-wrap gap-x-4 gap-y-1 items-baseline">
      {(["hit", "partial", "open", "miss"] as const).map((v) => (
        <a key={v} href={outcomeUrl(site, c.revisit_id!, FACT[v], l)}
          className="t-small px-3 py-1 rounded-[2px] border border-[var(--ink-16)] hover:border-[var(--ink)] hover:text-[var(--ink)] transition-colors">
          {tt(l, v === "hit" ? "ansHit" : v === "partial" ? "ansPartial" : v === "miss" ? "ansMiss" : "ansOpen")}
        </a>
      ))}
    </span>
  );
  // 10-26: a cast kept with its free line only (no reading) opens back on the cast page
  const readingHref = (c: ThreadCast) => (c.session_id ? `/${l}/reading?sid=${encodeURIComponent(c.session_id)}` : `/${l}/cast?mine=${c.id}`);
  const recordList = (
              <ol className="flex flex-col">
                {windows.map((c) => {
                  const href = readingHref(c);
                  const open = !c.outcome && (c.due_at ?? 0) <= nowMs;
                  return (
                    <li key={c.id} className="py-[var(--s-3)] border-t border-dotted border-[var(--ink-16)] first:border-t-0">
                      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                        {href
                          ? <Link href={href} className="t-body !text-[15px] min-w-0 flex-1 truncate hover:text-[var(--cinnabar)] transition-colors">{c.question}</Link>
                          : <p className="t-body !text-[15px] min-w-0 flex-1 truncate">{c.question}</p>}
                        {/* 10-01 审计: the status is now the reading's own timing sentence (进度表 25 ①) — it can be long, so it wraps
                            under the question instead of running off a phone screen */}
                        <span className={`t-label min-w-0 max-w-full line-clamp-2 break-words ${c.outcome === "hit" ? "!text-[var(--cinnabar)]" : "!text-[var(--ink-45)]"}`}>{threadStatus(c, l, (ms) => fmtShort(ms, l), nowMs)}</span>
                      </div>
                      {open && c.revisit_id && <div className="mt-2 hidden sm:block">{answerLinks(c)}</div>}
                      {open && c.revisit_id && href && <p className="mt-1 sm:hidden"><Link href={`${href}#revisit`} className="t-small underline underline-offset-4 !text-[var(--gold-text)]">{tt(l, "recordAnswer")} →</Link></p>}
                      {/* 09-28 (进度表 15 ①): a hit can be made into a card from here too */}
                      {c.outcome === "hit" && c.revisit_id && <p className="mt-2"><Link href={proofUrl(site, c.revisit_id, l).replace(site, "")} className="t-small underline underline-offset-4 !text-[var(--cinnabar)]">{tt(l, "proofMake")} →</Link></p>}
                    </li>
                  );
                })}
              </ol>);

  return (
    <div className="mx-auto w-full max-w-[46rem] px-[var(--s-4)] md:px-8 pt-10 pb-28 md:pb-20">
      {syncSession && <SubSync session={syncSession} />}
      {passSession && <PassSync session={passSession} />}
      {packSession && <PackSync session={packSession} />}

      {/* ---- who ---- */}
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
        <h1 className="t-d1">{t(l, "accountTitle")}</h1>
        <p className="t-label">
          <span className="!normal-case !tracking-normal text-[var(--ink-66)]">{me.email}</span>
          <span className="mx-3 text-[var(--ink-16)]">·</span>
          <LogoutButton locale={l} />
        </p>
      </div>

      {/* ---- 09-30 分页 → 10-22 进度表 76 ⑤: four tabs (回訪／記錄／生辰檔案／額度與方案), pinned on a phone ---- */}
      <nav aria-label={tabT(l).revisit} className="sticky top-0 z-20 -mx-[var(--s-4)] px-[var(--s-4)] md:mx-0 md:px-0 mt-[var(--s-4)] bg-[var(--paper)] border-b border-[var(--ink-16)]">
        <ul className="grid grid-cols-4">
          {ACCOUNT_TABS.map((x) => (
            <li key={x}>
              <Link href={tabHref(x)} scroll={false} data-heat={`acct-tab-${x}`} aria-current={tab === x ? "page" : undefined}
                className={`block text-center py-3 text-[14px] leading-tight border-b-2 -mb-px transition-colors ${tab === x ? "border-[var(--ink)] text-[var(--ink)]" : "border-transparent text-[var(--ink-45)] hover:text-[var(--ink)]"}`}>
                {tabT(l)[x]}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <HashOpen />

      {/* 10-22 进度表 76 ⑤ 生辰檔案: the births the chart pages use, kept with the account */}
      {tab === "profiles" && <ProfilesPanel locale={l} />}
      {/* 11-05 进度表 136 本命卦: the latest one, the earlier ones, and a re-take (no birth data needed) */}
      {tab === "profiles" && <BmgMine locale={l} customerId={me.customerId} />}

      {tab === "revisit" && (<>
      {/* ---- the numbers, one line ---- */}
      <dl className="mt-[var(--s-4)] grid grid-cols-3 border-y border-[var(--ink-16)] divide-x divide-[var(--ink-16)]">
        <StatCell label={tt(l, "statMatters")} value={String(record.matters)} />
        <StatCell label={tt(l, "statRecord")} value={record.due ? `${record.hit} / ${record.due}` : "—"} href={awaiting.length > 0 ? "#await" : `${tabHref("record")}#record`} />
        {/* 10-24: under the 通卡 model nothing is counted (a pass or a member is unlimited) — 「本月深斷剩餘 999」 was nonsense */}
        {ent.active && !ent.unlimited
          ? <StatCell label={tt(l, "statDeep")} value={ent.comp ? "∞" : String(ent.deepLeft)} href={`${tabHref("plan")}#membership`} />
          : <StatCell label={tt(l, "statAtlas")} value={`${drawn.size} / 64`} href={`${tabHref("record")}#atlas`} />}
      </dl>

      {/* ---- 10-23 进度表 114: the newest three reports, one tap away (the rest on 記錄) ---- */}
      <MyReportsRecent locale={l} reports={reports} allHref={`${tabHref("record")}#reports`} />

      {/* ---- 09-26 会员今日一卦: one line a day about the matter they carry (rules, not dice) ---- */}
      {ent.active && (() => {
        const fc = focusCast(casts);
        const d = fc ? memberDaily(fc) : null;
        const line = fc && d ? dailyLineOrWarm(me.customerId, fc, d) : null; // 09-29: the written note, once it exists
        const site = (process.env.SITE_URL ?? "https://yaoflow.com").replace(/\/$/, "");
        return (
          <section id="today" className="mt-[var(--s-5)] border border-[var(--gold)] bg-[var(--gold)]/[0.06] rounded-[2px] px-[var(--s-4)] py-[var(--s-4)]" data-heat="member-daily">
            {d ? (
              <>
                <p className="t-label !text-[var(--gold-text)]">{tt(l, "dailyTitle", { gz: d.dayGanzhi })}</p>
                <p className="t-small mt-1 !text-[var(--ink-45)]">{tt(l, "dailyAbout", { q: d.question.length > 40 ? d.question.slice(0, 40) + "…" : d.question })}</p>
                <p className="t-body !text-[17px] mt-[var(--s-2)]">{line ?? tt(l, `dK_${d.kind}` as Parameters<typeof tt>[1])}</p>
                {d.inWindow && !line && <p className="t-small mt-[var(--s-2)] !text-[var(--cinnabar)]">{tt(l, "dailyWindow")}</p>}
                <div className="mt-[var(--s-3)] flex flex-wrap items-center gap-x-6 gap-y-2">
                  {fc?.matter_id && matterTitles.has(fc.matter_id)
                    ? <a href={`/${l}/matter/${fc.matter_id}`} className="t-small underline underline-offset-4">{mt(l, "open")} →</a>
                    : d.sessionId && <a href={`/${l}/reading?sid=${encodeURIComponent(d.sessionId)}`} className="t-small underline underline-offset-4">{tt(l, "dailyOpen")} →</a>}
                  <DailyShare locale={l} text={tt(l, `dK_${d.kind}` as Parameters<typeof tt>[1])} url={`${site}/${l}`} />
                </div>
              </>
            ) : (
              <>
                <p className="t-label !text-[var(--gold-text)]">{tt(l, "dailyTitle", { gz: "" }).split(" · ")[0]}</p>
                <p className="t-small mt-1">{tt(l, "dailyNone")}</p>
              </>
            )}
          </section>
        );
      })()}

      {/* ---- the next question: the page's one call to action ---- */}
      <div className="mt-[var(--s-2)]">
        <AskAgain locale={l} />
        {/* 09-30 (进度表 23): the guide a member asked for, one line under the next question */}
        <p className="t-small mt-[var(--s-2)]"><Link href={`/${l}/how-to-ask`} data-heat="hta-account" className="underline underline-offset-4 !text-[var(--ink-45)] hover:!text-[var(--ink)]">{howToAskFor(l).entry.account} →</Link></p>
      </div>
      </>)}


      {tab === "revisit" && (<>
      {/* ---- waiting for an answer ---- */}
      {/* 09-30 (进度表 25 ②, #838: 「應驗紀錄頂部一次、往下又一次」): this block IS the record on a phone — the 「我的應驗記錄」
          fold below hides there (sm:block), and the stat cell up top points here */}
      {awaiting.length > 0 && (
        <section id="await" className="mt-[var(--s-6)] scroll-mt-20 border border-[var(--gold)]/60 rounded-[2px] px-[var(--s-4)] py-[var(--s-4)]">
          <h2 className="t-sect !text-[var(--gold-text)]">{tt(l, "awaitTitle")}</h2>
          <p className="t-small !text-[var(--ink-66)] mt-1 mb-[var(--s-3)]">{tt(l, "awaitLead")}</p>
          <ul className="flex flex-col">
            {awaiting.slice(0, 3).map((c) => <AwaitRow key={c.id} c={c} href={readingHref(c)} answers={answerLinks(c)} ask={tt(l, "recordAnswer")} />)}
          </ul>
          {awaiting.length > 3 && (
            <details className="mt-1">
              <summary className="t-label cursor-pointer hover:text-[var(--ink)] py-2">{tt(l, "showMore", { n: awaiting.length - 3 })}</summary>
              <ul className="flex flex-col">
                {awaiting.slice(3).map((c) => <AwaitRow key={c.id} c={c} href={readingHref(c)} answers={answerLinks(c)} ask={tt(l, "recordAnswer")} />)}
              </ul>
            </details>
          )}
          {/* 10-01 (#838: 「希望應驗那邊可以整理一下」): one record on every screen — the full 「我的應驗記錄」 lives inside this
              block (folded), and the separate fold further down is gone while there is something to answer */}
          {windows.length > awaiting.length && (
            <details id="record-all" className="mt-[var(--s-3)] pt-[var(--s-2)] border-t border-[var(--gold)]/30 scroll-mt-20">
              <summary className="t-label cursor-pointer hover:text-[var(--ink)] py-2 list-none [&::-webkit-details-marker]:hidden flex items-baseline justify-between gap-3">
                <span>{t(l, "recordTitle")}</span><span className="!text-[var(--ink-45)] truncate">{tt(l, "recordSummary", record)} ›</span>
              </summary>
              {recordList}
            </details>
          )}
        </section>
      )}

      {/* 10-22 进度表 76 C → ⑤ (「我的」默認頁＝回訪): the next windows, with their days */}
      {upcoming.length > 0 && (
        <section className="mt-[var(--s-6)]">
          <h2 className="t-sect mb-[var(--s-3)]">{tt(l, "upcomingTitle")}</h2>
          <ul className="flex flex-col divide-y divide-[var(--ink-16)] border-y border-[var(--ink-16)]" data-heat="acct-upcoming">
            {upcoming.slice(0, 5).map((c) => (
              <li key={c.id} className="py-2">
                <div className="flex items-baseline justify-between gap-4">
                  {readingHref(c) ? <Link href={readingHref(c)!} className="t-small truncate hover:text-[var(--ink)]">{c.question.slice(0, 40) || "—"}</Link> : <span className="t-small truncate">{c.question.slice(0, 40) || "—"}</span>}
                  <span className="t-label !text-[var(--ink-45)] shrink-0">{fmtShort(c.due_at!, l)}{(l === "zh" || l === "zh-hant") ? ` · ${su.daysLeft.replace("{n}", String(daysLeft(c.due_at!)))}` : ""}</span>
                </div>
                {c.revisit_id && plans.get(c.revisit_id) && <p className="t-small mt-0.5 !text-[var(--ink-45)] truncate">{su.planShow.replace("{p}", plans.get(c.revisit_id)!)}</p>}
              </li>
            ))}
          </ul>
        </section>
      )}
      {/* 10-22 进度表 80: 看自己 — what the reports, the 年書 and the picked days will ask, and what the reader said */}
      {selfRows.length > 0 && (
        <section className="mt-[var(--s-6)]" data-heat="acct-self-revisit">
          <h2 className="t-sect mb-1">{su.listHead}</h2>
          <p className="t-small !text-[var(--ink-45)] mb-[var(--s-3)]">{su.listNote}</p>
          <ol className="flex flex-col divide-y divide-[var(--ink-16)] border-y border-[var(--ink-16)]">
            {selfRows.map((r) => {
              const href = selfReportUrl("", r.kind!, r.ref ?? "", r.locale || l); // the report's own page (its language)
              const waiting = r.status === "sent" && !r.outcome;
              const said = r.event === "happened" ? su.aHappened : r.event === "stirred" ? su.aStirred : r.event === "nothing" ? su.aNothing : r.event === "open" ? su.aOpen : null;
              return (
                <li key={r.id} className="py-[var(--s-3)]">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                    <Link href={href} className="t-body !text-[15px] min-w-0 flex-1 truncate hover:text-[var(--cinnabar)] transition-colors">{r.label || r.kind}</Link>
                    <span className="t-label !text-[var(--ink-45)] shrink-0">
                      {r.status === "pending" ? su.willAsk.replace("{date}", fmtShort(r.due_at, l)) : waiting ? su.askedWaiting : said ? `${su.said}${l === "zh" || l === "zh-hant" || l === "ja" ? "：" : ": "}${said}` : fmtShort(r.due_at, l)}
                    </span>
                  </div>
                  {r.hint && <p className="t-small !text-[var(--ink-45)] mt-1 truncate">{r.hint}</p>}
                  {r.plan && <p className="t-small !text-[var(--ink-45)] mt-0.5 truncate">{su.planShow.replace("{p}", r.plan)}</p>}
                  {waiting && (
                    <span className="mt-2 flex flex-wrap gap-x-3 gap-y-1 items-baseline">
                      {(["happened", "stirred", "open", "nothing"] as const).map((v) => (
                        <a key={v} href={outcomeUrl(site, r.id, v, l)} className="t-small px-3 py-1 rounded-[2px] border border-[var(--ink-16)] hover:border-[var(--ink)] hover:text-[var(--ink)] transition-colors">
                          {v === "happened" ? su.aHappened : v === "stirred" ? su.aStirred : v === "nothing" ? su.aNothing : su.aOpen}
                        </a>
                      ))}
                    </span>
                  )}
                </li>
              );
            })}
          </ol>
        </section>
      )}
      {/* 09-30 (进度表 25 ②, #838: 「問問題可以獨立一個按鈕」): on a phone the door to the next question stays pinned at the bottom */}
      <div className="md:hidden fixed inset-x-0 bottom-[calc(2.75rem+env(safe-area-inset-bottom))] z-20 px-[var(--s-4)] pb-3 pt-3 bg-[var(--paper)]/95 backdrop-blur border-t border-[var(--ink-16)]">
        <Link href={`/${l}/cast?c=account`} data-heat="acct-ask-bar" className="block w-full text-center min-h-[var(--s-6)] px-6 py-3 rounded-[2px] bg-[var(--ink)] text-[var(--paper)] text-[13px] tracking-[0.16em]">{t(l, "askAgainLabel")}</Link>
      </div>
      </>)}

      {/* ---- 10-23 进度表 114「我的報告」: every report and personal reading, by product — first thing on 記錄 ---- */}
      {tab === "record" && (
        <MyReportsFull locale={l} reports={reports} filter={reportFilter}
          href={(f) => `/${l}/account?tab=record${f ? `&rp=${f}` : ""}#reports`} />
      )}

      {tab === "record" && (<>
      {/* ---- what they have been asking, by matter ---- */}
      <section className="mt-[var(--s-6)]">
        <div className="flex items-baseline justify-between gap-4 mb-[var(--s-3)]">
          <h2 className="t-sect">{tt(l, "recentTitle")}</h2>
          {upcoming.length > 0 && (
            <p className="t-label !text-[var(--ink-45)]">{tt(l, "upcomingTitle")} · {fmtShort(upcoming[0]!.due_at!, l)}</p>
          )}
        </div>
        {recent.some((g) => g.length > 1) && <p className="t-small !text-[var(--ink-45)] -mt-1 mb-[var(--s-3)]">{mt(l, "acctHint")}</p>}
        {casts.length === 0 ? (
          <p className="t-body text-[var(--ink-66)]">
            {t(l, "accountNoCasts")}{" "}
            <Link href={`/${l}/cast`} className="underline underline-offset-4">{t(l, "begin")}</Link>
          </p>
        ) : (
          <ul className="grid sm:grid-cols-2 gap-3">
            {recent.map((group) => {
              const c = group[0]!;
              const mTitle = c.matter_id ? matterTitles.get(c.matter_id) ?? null : null;
              // 09-29: a card is a matter now — it opens the matter page; a lone unfiled cast still opens its reading
              const href = c.matter_id && matterTitles.has(c.matter_id) ? `/${l}/matter/${c.matter_id}` : readingHref(c);
              const withWindow = group.find((x) => x.revisit_id);
              const status = withWindow ? threadStatus(withWindow, l, (ms) => fmtShort(ms, l), nowMs) : null;
              const p = hexagramByNumber(c.primary_num);
              const values = c.values_str.split(",").map(Number) as LineValue[];
              const card = (
                <div className="h-full flex flex-col gap-2 rounded-[2px] border border-[var(--ink-16)] p-[var(--s-4)] transition-colors group-hover:border-[var(--ink-45)]">
                  <div className="flex items-center justify-between gap-3">
                    <p className="flex items-center gap-2 min-w-0"><TierTag tier={group.some((x) => x.tier === "deep") ? "deep" : group.some((x) => x.tier === "one") ? "one" : c.tier} l={l} /><span className="t-small !text-[var(--ink-45)] truncate">{fmtShort(c.created_at, l)}{group.length > 1 ? ` · ${tt(l, "castsN", { n: group.length })}` : ""}</span></p>
                    <FigureMark yangs={primaryYangs(values)} width={18} className="opacity-60 shrink-0" />
                  </div>
                  <p className="t-body !text-[15px] leading-snug line-clamp-2 group-hover:text-[var(--cinnabar)] transition-colors">{mTitle || c.question}</p>
                  {mTitle && <p className="t-small !text-[var(--ink-45)] line-clamp-1">{c.question}</p>}
                  <p className="t-small !text-[var(--ink-45)] mt-auto">
                    {p ? hexName(p, l) : ""}
                    {status ? <span className={withWindow?.outcome === "hit" ? "!text-[var(--cinnabar)]" : ""}> · {status}</span> : null}
                  </p>
                  {/* 10-01 (Neil: 「入口明显一点」): a matter card says what it opens */}
                  {mTitle && c.matter_id && (() => {
                    const qi = group.length > 3 ? cachedQuestionInfo(c.matter_id, null) : null;
                    return (
                      <p className="t-small !text-[var(--gold-text)] pt-2 border-t border-dotted border-[var(--ink-16)] flex items-baseline justify-between gap-2">
                        <span className="underline underline-offset-4">{mt(l, "acctOpen")} →</span>
                        {qi && qi.questions < group.length ? <span className="!text-[var(--ink-45)]">{mt(l, "acctQs", { k: qi.questions })}</span> : null}
                      </p>
                    );
                  })()}
                </div>
              );
              return <li key={c.id}>{href ? <Link href={href} className="group block h-full">{card}</Link> : card}</li>;
            })}
          </ul>
        )}
        {casts.length > 0 && (
          <details className="mt-[var(--s-4)] group/all">
            <summary className="flex items-center justify-between cursor-pointer list-none [&::-webkit-details-marker]:hidden min-h-[48px] px-[var(--s-4)] rounded-[2px] border border-[var(--ink-16)] hover:border-[var(--ink-45)] t-body !text-[15px]">
              <span>{tt(l, "showAll", { n: casts.length })}</span> <span className="inline-block transition-transform group-open/all:rotate-90 text-[var(--ink-45)]">›</span>
            </summary>
            <div className="flex flex-col mt-2">
              {matters.map((group, gi) => (
                <div key={group[0]!.id} className={gi > 0 ? "border-t border-[var(--ink-16)]" : ""}>
                  {group.length > 1 && (
                    <p className="t-label !text-[var(--gold-text)] pt-[var(--s-4)]">
                      {group[0]!.matter_id && matterTitles.get(group[0]!.matter_id)
                        ? <Link href={`/${l}/matter/${group[0]!.matter_id}`} className="hover:text-[var(--ink)]">{matterTitles.get(group[0]!.matter_id)} · {tt(l, "castsN", { n: group.length })} →</Link>
                        : tt(l, "matterLabel", { n: group.length })}
                    </p>
                  )}
                  <ol className={`flex flex-col ${group.length > 1 ? "pl-4 border-l border-[var(--gold)]/50 my-[var(--s-2)]" : ""}`}>
                    {group.map((c, i) => <CastRow key={c.id} c={c} l={l} first={i === 0} />)}
                  </ol>
                </div>
              ))}
            </div>
          </details>
        )}
      </section>

      {/* 09-30 分页: what is left of 「更多」 on this tab — the record and the atlas */}
      <section className="mt-[var(--s-6)]">
        <div className="border-t border-[var(--ink-16)]">
          {windows.length > 0 && (
            <Fold id="record" title={t(l, "recordTitle")} aside={tt(l, "recordSummary", record)} className={awaiting.length > 0 ? "hidden" : ""}>
              {recordList}
            </Fold>
          )}
          <Fold id="atlas" title={t(l, "atlasTitle")} aside={`${drawn.size} / 64`}>
            <HexAtlas locale={l} drawn={drawn} />
          </Fold>
        </div>
      </section>
      </>)}

      {/* ---- 09-26 公开卦例: what your cases did, and how many more could help someone ---- */}
      {tab === "record" && (() => {
        const sids = casts.filter((c) => c.session_id && c.tier).map((c) => c.session_id!);
        const live = liveCasesForSessions(sids);
        const liveSet = new Set(live.map((c) => c.session_id));
        // 09-27: only readings that still earn a reading back (not the free light ones) — the line below promises one
        const open = casts.filter((c) => c.session_id && c.tier && !liveSet.has(c.session_id) && caseRewardable(orderBySession(c.session_id)?.status, c.session_id));
        if (!live.length && !open.length) return null;
        return (
          <section id="cases" className="mt-[var(--s-6)] scroll-mt-20">
            <h2 className="t-sect mb-[var(--s-2)]">{tt(l, "acctCasesTitle")}</h2>
            {live.slice(0, 8).map((c) => {
              const im = caseImpact(c.public_id);
              return (
                <p key={c.public_id} className="t-small py-1.5 border-t border-[var(--ink-16)]">
                  <a href={casePath(asLocale(c.locale), c.public_id)} className="underline underline-offset-4">{new Date(c.published_at).toISOString().slice(0, 10)}</a>
                  <span className="ml-3 !text-[var(--gold-text)]">{tt(l, "impact", { reads: im.reads, casts: im.casts })}</span>
                </p>
              );
            })}
            {open.length > 0 && (
              <p className="t-small mt-[var(--s-2)] !text-[var(--gold-text)]">
                <a href={`/${l}/reading?sid=${encodeURIComponent(open[0]!.session_id!)}#case`} className="underline underline-offset-4">{tt(l, "acctCasesMore", { n: open.length })} →</a>
              </p>
            )}
          </section>
        );
      })()}

      {tab === "plan" && (<>
      {/* ---- membership ---- */}
      <section id="membership" className="mt-[var(--s-6)] scroll-mt-20 panel px-[var(--s-4)] py-[var(--s-4)]">
        {/* 09-26: two single purchases this month count toward the first month; a member of 40+ days sees the yearly switch once */}
        {(() => {
          if (!ent.active) {
            const cur = creditCurrency(me.customerId);
            const cr = cur ? upgradeCredit(me.customerId, cur) : null;
            return cr ? <p className="t-small mb-[var(--s-3)] !text-[var(--gold-text)]">{tt(l, "crAccount", { credit: formatMoney(cr.currency, cr.amountMinor, l) })}</p> : null;
          }
          const sub = latestSubscription(me.customerId);
          if (!yearlyOn() || !sub || sub.plan !== "month" || ent.cancelAtPeriodEnd || ent.comp || Date.now() - sub.created_at < 40 * 86_400_000) return null;
          const cur = (sub.currency ?? "").toUpperCase();
          if (!isCurrency(cur)) return null;
          const site = (process.env.SITE_URL ?? "https://yaoflow.com").replace(/\/$/, "");
          return (
            <p className="t-small mb-[var(--s-3)] !text-[var(--gold-text)]">
              {tt(l, "yrLine", { price: formatMoney(cur, priceMinor(cur, "year"), l), pct: yearlySavePct(cur) })}{" "}
              <a href={retainUrl(site, sub.stripe_subscription_id, "year", l)} className="underline underline-offset-4">{tt(l, "yrGo")} →</a>
            </p>
          );
        })()}
        {ent.active ? (
          <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
            <div>
              {/* 10-24 (Neil: 「会员是会员，通卡是通卡」): a pass holder is not told 「會員生效中」 */}
              <p className="t-label">{ent.pass ? tk.activePass : t(l, "subActive")}</p>
              <p className="t-body !text-[15px] mt-1">
                {/* 10-22 通卡: no monthly count — a pass says its name and end, a member that everything is included */}
                {ent.unlimited ? (ent.pass && ent.passDays ? fill(tk.active, { name: tk.name[ent.passDays], date: ent.periodEnd ? fmtDate(ent.periodEnd, l) : "" }) : tk.activeMember) : t(l, "subDeepLeft", { n: ent.comp ? "∞" : ent.deepLeft })}
                {/* 09-29 会员裂变: thank-you readings from friends land here, not as a link */}
                {!ent.comp && (ent.friendBonus ?? 0) > 0 && <span className="!text-[var(--gold-text)]">{mg(l, "friendPlus", { n: ent.friendBonus! })}</span>}
                {/* 09-30 续订专属: unused readings the last period left, carried once */}
                {!ent.comp && (ent.carried ?? 0) > 0 && <span className="!text-[var(--gold-text)]">{rp(l, "carried", { n: ent.carried! })}</span>}
                {!ent.comp && (ent.packLeft ?? 0) > 0 && <span className="!text-[var(--gold-text)]">{mg(l, "packIncl", { n: ent.packLeft! })}</span>}
                {ent.resetsAt && !ent.comp && !ent.unlimited && !ent.pass && <span className="text-[var(--ink-45)]"> · {t(l, "subResets", { date: fmtDate(ent.resetsAt, l) })}</span>}
              </p>
              {/* a pass already says its end above (「1 日通卡 · {date} 到期」); 「到期，不再續費」 is a membership's line */}
              {ent.periodEnd && !ent.pass && (
                <p className="t-small !text-[var(--ink-45)] mt-0.5">{t(l, ent.cancelAtPeriodEnd ? "subEnds" : "subRenews", { date: fmtDate(ent.periodEnd, l) })}</p>
              )}
              {ent.status === "past_due" && <p className="t-small !text-[var(--cinnabar)] mt-1">{t(l, "subPastDue")}</p>}
              {/* 09-30 续订专属: renewal off — say what stopped, and the one tap that brings it all back */}
              {ent.cancelAtPeriodEnd && !ent.comp && !ent.pass && latestSub?.stripe_subscription_id.startsWith("sub_") && (
                <div className="mt-1">
                  {/* 10-22 进度表 93: until the end everything carries on; after it, what stays and what stops */}
                  {ent.periodEnd && <p className="t-small !text-[var(--ink-66)]">{rp(l, "offNote", { date: fmtDate(ent.periodEnd, l) })}</p>}
                  <p className="t-small !text-[var(--ink-66)] mt-0.5" data-heat="acct-after-end">{rp(l, "afterEnd")}</p>
                  <a href={retainUrl((process.env.SITE_URL ?? "https://yaoflow.com").replace(/\/$/, ""), latestSub.stripe_subscription_id, "resume", l)}
                    data-heat="acct-resume" className="t-small underline underline-offset-4 !text-[var(--gold-text)]">{rp(l, "resume")} →</a>
                </div>
              )}
              {sp.packed === "1" && <p className="t-small !text-[var(--gold-text)] mt-1">{mg(l, "packDone")}</p>}
              {/* 09-29 会员增购包: offered here once the period's own readings are down to 2 (the letter links here) */}
              {!ent.comp && ent.deepLeft - (ent.packLeft ?? 0) <= 2 && ent.packBuyable && (
                <div className="mt-[var(--s-3)]"><PackBuy locale={l} quotes={ent.packQuotes} singles={ent.singlesThisPeriod ?? 0} /></div>
              )}
              {/* 09-26 会员单月: say plainly it ends, and what continuing would cost */}
              {ent.pass && ent.periodEnd && !ent.unlimited && (
                <p className="t-small !text-[var(--gold-text)] mt-1">{passT(l, "active", { date: fmtDate(ent.periodEnd, l) })} · {(() => { const cur = (latestSub?.currency ?? "").toUpperCase(); return isCurrency(cur) ? passT(l, "after", { month: formatMoney(cur, priceMinor(cur, "month"), l) }) : null; })()}</p>
              )}
            </div>
            {/* 09-30 续订专属: card and invoices go straight to Stripe; cancelling goes through our page first */}
            {!ent.comp && !ent.pass && (
              <div className="flex flex-col items-start gap-2">
                <ManageButton locale={l} label={rp(l, "manageCard")} />
                {!ent.cancelAtPeriodEnd && (
                  <a href={`/${l}/account/cancel`} data-heat="cancel-page" className="t-label hover:text-[var(--ink)] transition-colors">{rp(l, "manageCancel")} →</a>
                )}
              </div>
            )}
          </div>
        ) : null}
        {/* 10-22 进度表 78 ② 首次付費保證: the account's first 1-day pass can be returned here too, not only on the reading page */}
        {ent.active && ent.pass && ent.passDays === 1 && (() => {
          const sid = latestPassOrderSid(me.customerId, "pass_1d");
          const g = sid && /^(cs|pi)_/.test(sid) ? guaranteeCheck(sid) : null;
          if (!sid || !g || !g.ok) return null;
          const cur = (g.currency ?? "").toUpperCase();
          return (
            <div className="mt-[var(--s-4)]">
              <GuaranteePanel locale={l} sid={sid} until={g.until} amount={formatMoney(isCurrency(cur) ? cur : initialCurrency, g.amountCents, l)} />
            </div>
          );
        })()}
        {/* 10-22 升級會員差額折抵: a 通卡 holder sees the membership here, with what is left of the pass coming off the first month */}
        {ent.active && ent.pass && tongka && (() => {
          const pc = passCredit(me.customerId, initialCurrency);
          return (
            <div className="mt-[var(--s-5)] pt-[var(--s-4)] border-t border-[var(--ink-16)] flex flex-col gap-[var(--s-3)]">
              <div>
                <h2 className="t-sect">{t(l, "subTitle")}</h2>
                <p className="t-small !text-[var(--ink-66)] mt-1">{tk.memberLine}</p>
                {pc && <p className="t-small !text-[var(--gold-text)] mt-1">{(l === "zh" ? "通卡还剩的 {p} 会直接折抵第一个月。" : "通卡還剩的 {p} 會直接折抵第一個月。").replace("{p}", formatMoney(initialCurrency, pc.amountMinor, l))}</p>}
              </div>
              <SubscribeButtons locale={l} initialCurrency={initialCurrency} edgeCountry={country} yearly={yearlyOn()} firstMonth={!startsAtMonthlyFee(me.customerId)} tongka={false} />
            </div>
          );
        })()}
        {ent.active ? null : (
          <div className="flex flex-col gap-[var(--s-3)]">
            <div>
              <h2 className="t-sect">{t(l, "subTitle")}</h2>
              {/* 09-29 「一件事」: what membership is for, before what it counts */}
              <p className="t-body !text-[17px] mt-1">{t(l, "subPromise")}</p>
              <p className="t-small !text-[var(--ink-66)] mt-1">
                {tongka ? tk.memberLine : <>{t(l, "subBenefit1")} · {t(l, "subBenefit2", { n: DEEP_PER_MONTH, f: MEMBER_FOLLOWUP_LIMIT })} · {t(l, "subBenefit3")} · {t(l, "subBenefit4")}</>}
              </p>
              {/* 09-30 续订专属: what renewing adds over the one-off month, said before anyone pays */}
              <p className="t-small !text-[var(--ink-45)] mt-1">{rp(l, "joinPerks", { carry: OWN_CARRY_MAX })}</p>
              {/* 10-14 进度表 50: the daily lot comes with the membership */}
              {(l === "zh-hant" || l === "zh") && tqVisible && <p className="t-small !text-[var(--ink-66)] mt-1" data-heat="card-tq">{l === "zh" ? "每日一签（含日历回看、每天寄给你）" : "每日一籤（含日曆回看、每天寄給你）"} · <a href={`/${l}/today-qian`} className="underline underline-offset-4">{l === "zh" ? "今日一签" : "今日一籤"} →</a></p>}
            </div>
            <SubscribeButtons locale={l} initialCurrency={initialCurrency} edgeCountry={country} yearly={yearlyOn()} firstMonth={!startsAtMonthlyFee(me.customerId)} tongka={tongka} firstTongka={tongka && firstPassEligible(me.customerId, me.email)} />
            {/* 10-14 进度表 43 ③: the membership card's trust line, and what it is not */}
            <div>
              <p className="t-small !text-[var(--ink-66)]" data-heat="card-trust-member">{cv(l, "cdTrustMember")}</p>
              <p className="t-label mt-1 !normal-case !tracking-[0.04em]">{cv(l, "cdNot")}</p>
            </div>
            {ent.status && ent.status !== "canceled" && ent.stripeCustomerId && (
              <div>
                {ent.status === "past_due" || ent.status === "unpaid" ? <p className="t-small !text-[var(--cinnabar)] mb-2">{t(l, "subPastDue")}</p> : null}
                <ManageButton locale={l} />
              </div>
            )}
          </div>
        )}
      </section>

      {/* ---- 09-30 分页: payments sit with the membership ---- */}
      <section className="mt-[var(--s-6)]">
        <div className="border-t border-[var(--ink-16)]">
          <Fold id="payments" title={tt(l, "payTitle")} aside={payments.length + invoices.length ? String(payments.length + invoices.length) : undefined}>
            {payments.length + invoices.length === 0 ? (
              <p className="t-small !text-[var(--ink-45)]">{tt(l, "payEmpty")}</p>
            ) : (
              <ul className="divide-y divide-[var(--ink-16)]">
                {[
                  ...invoices.map((inv) => ({ at: inv.created, kind: tt(l, "payMembership"), amount: money(inv.currency, inv.total), state: inv.status, links: [inv.hosted ? { href: inv.hosted, label: tt(l, "payInvoice") } : null, inv.pdf ? { href: inv.pdf, label: tt(l, "payPdf") } : null] })),
                  ...payments.map((p) => ({ at: p.created_at, kind: tt(l, p.tier === "deep" ? "payDeep" : "payOne"), amount: money(p.currency, p.amount_cents), state: p.payment_state ?? "paid", links: [p.receipt_url ? { href: p.receipt_url, label: tt(l, "payReceipt") } : null] })),
                ].sort((a, b) => b.at - a.at).map((row, i) => (
                  <li key={i} className="flex flex-wrap items-baseline gap-x-4 gap-y-1 py-[var(--s-3)]">
                    <span className="t-small !text-[var(--ink-45)] tabular-nums w-[7.5rem] shrink-0">{fmtDate(row.at, l)}</span>
                    <span className="t-body !text-[14px] w-[6rem] shrink-0">{row.kind}</span>
                    <span className="t-body !text-[14px] tabular-nums">{row.amount}{row.state === "refunded" ? <span className="t-small !text-[var(--ink-45)] ml-2">{tt(l, "payRefunded")}</span> : null}</span>
                    <span className="ml-auto flex gap-4">
                      {row.links.filter((x): x is { href: string; label: string } => !!x).map((x) => (
                        <a key={x.href} href={x.href} target="_blank" rel="noreferrer" className="t-small underline decoration-[var(--ink-16)] underline-offset-4 hover:decoration-current">{x.label} →</a>
                      ))}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <p className="t-small !text-[var(--ink-45)] mt-[var(--s-3)]">{tt(l, "payNote")}</p>
          </Fold>
        </div>
      </section>
      </>)}
      {/* 09-30 分页 → 10-22: gifts and the friend door sit with the allowance they draw on */}
      {tab === "plan" && (<>
      <p className="t-small !text-[var(--ink-66)] mt-[var(--s-5)]">{tabT(l).shareLead}</p>
      {/* 09-29 推荐入口: bring a friend — near the top, not folded at the bottom */}
      {(() => {
        const giftFrom = refView.giftable[0]?.sid ?? null;
        const latest = casts.find((c) => c.session_id && c.tier)?.session_id ?? null;
        return (
          <InviteCard
            locale={l}
            giftHref={giftFrom ? `/${l}/reading?sid=${encodeURIComponent(giftFrom)}#gift` : pool && pool.available > 0 ? "#gift" : null}
            shareHref={latest ? `/${l}/reading?sid=${encodeURIComponent(latest)}#share` : null}
            stats={myReferralStats(me.customerId)}
            mineHref="#referrals"
          />
        );
      })()}
      {/* 09-30 分页: the member's monthly gifts live with the other gifts now */}
      {ent.active && pool && !pool.renewOff && (
        <div className="mt-[var(--s-5)] panel px-[var(--s-4)] py-[var(--s-4)]">
          <GiftCastPanel locale={l} poolLeft={pool.available} compact />
        </div>
      )}
      </>)}

      {/* ---- 09-30 分页: what your sharing has done — with the record ---- */}
      {tab === "record" && (
        <section id="referrals" className="mt-[var(--s-6)] scroll-mt-20">
          <h2 className="t-sect mb-[var(--s-3)]">{t(l, "refTitle")}</h2>
          <MyReferrals locale={l} view={refView} />
        </section>
      )}
    </div>
  );
}

const RECENT = 4;

const fmtShort = (ms: number, locale: Locale) =>
  new Date(ms).toLocaleDateString(locale === "zh" ? "zh-CN" : locale === "zh-hant" ? "zh-TW" : locale, { month: "short", day: "numeric" });

function StatCell({ label, value, href }: { label: string; value: string; href?: string }) {
  const inner = (
    <>
      <dt className="t-label !text-[var(--ink-45)]">{label}</dt>
      <dd className="t-d2 mt-1 tabular-nums">{value}</dd>
    </>
  );
  return href
    ? <a href={href} className="block px-[var(--s-3)] py-[var(--s-3)] first:pl-0 hover:bg-[var(--ink-035)] transition-colors">{inner}</a>
    : <div className="px-[var(--s-3)] py-[var(--s-3)] first:pl-0">{inner}</div>;
}

/** 09-30 (进度表 25 ②, #838: 「每題底下一排按鈕」): on a phone the row is one tap to the reading, which asks there; the four buttons stay on wide screens */
function AwaitRow({ c, href, answers, ask }: { c: ThreadCast; href: string | null; answers: ReactNode; ask: string }) {
  return (
    <li className="py-[var(--s-3)] border-t border-dotted border-[var(--ink-16)] first:border-t-0 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
      {href
        ? <Link href={`${href}#revisit`} className="t-body !text-[15px] min-w-0 line-clamp-2 sm:truncate hover:text-[var(--cinnabar)] transition-colors">{c.question}<span className="sm:hidden !text-[var(--gold-text)]"> · {ask} →</span></Link>
        : <p className="t-body !text-[15px] min-w-0 truncate">{c.question}</p>}
      <div className="shrink-0 hidden sm:block">{answers}</div>
    </li>
  );
}

function Fold({ id, title, aside, children, className = "" }: { id: string; title: string; aside?: string; children: ReactNode; className?: string }) {
  return (
    <details id={id} className={`group/fold border-b border-[var(--ink-16)] scroll-mt-20 ${className}`}>
      <summary className="flex items-baseline justify-between gap-4 py-[var(--s-4)] cursor-pointer list-none [&::-webkit-details-marker]:hidden">
        <span className="t-body !text-[16px]">{title}</span>
        <span className="flex items-baseline gap-3 min-w-0">
          {aside && <span className="t-small !text-[var(--ink-45)] truncate hidden sm:inline">{aside}</span>}
          <span className="t-label transition-transform group-open/fold:rotate-90">›</span>
        </span>
      </summary>
      <div className="pb-[var(--s-5)]">{children}</div>
    </details>
  );
}

/** 09-30 (手機不好用): which kind of reading a cast has — a tag you can tell apart at a glance, not grey words in a line */
function TierTag({ tier, l }: { tier: string | null; l: Locale }) {
  const cls = tier === "deep"
    ? "bg-[var(--gold)]/15 border-[var(--gold)]/60 text-[var(--gold-text)]"
    : tier === "one" ? "border-[var(--ink-16)] text-[var(--ink-66)]" : "border-transparent text-[var(--ink-45)]";
  return (
    <span className={`inline-block shrink-0 px-2 py-[1px] rounded-[2px] border text-[12px] leading-[18px] ${cls}`}>
      {tier === "deep" ? t(l, "accountTierDeep") : tier === "one" ? t(l, "accountTierOne") : t(l, "accountCastOnly")}
    </span>
  );
}

function CastRow({ c, l, first }: { c: ThreadCast; l: Locale; first: boolean }) {
  const values = c.values_str.split(",").map(Number) as LineValue[];
  const primary = hexagramByNumber(c.primary_num);
  const changed = c.changed_num ? hexagramByNumber(c.changed_num) : null;
  const href = c.session_id ? `/${l}/reading?sid=${encodeURIComponent(c.session_id)}` : `/${l}/cast?mine=${c.id}`;
  const meta = [
    c.followups > 0 ? tt(l, "threadAsks", { n: c.followups }) : null,
    c.notes > 0 ? tt(l, "threadNotes", { n: c.notes }) : null,
    threadStatus(c, l, (ms) => fmtDate(ms, l)),
  ].filter(Boolean).join(" · ");
  // 09-30 (a reader: 手機真的非常不好使用): the whole row is the tap target; the question gets two lines, not one
  // cut short; the kind of reading is a tag at the front; one small figure instead of two
  return (
    <li className={first ? "" : "border-t border-dotted border-[var(--ink-16)]"}>
      <Link href={href} className="group flex gap-3 items-start py-[var(--s-4)] min-h-[64px] active:bg-[var(--ink-035)]">
        <FigureMark yangs={primaryYangs(values)} width={22} className="opacity-70 group-hover:opacity-100 shrink-0 mt-1" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <TierTag tier={c.tier} l={l} />
            <span className="t-small !text-[var(--ink-45)] tabular-nums">{fmtShort(c.cast_at, l)}</span>
            <span className="t-small !text-[var(--ink-45)] truncate">{primary ? hexName(primary, l) : ""}{changed ? ` → ${hexName(changed, l)}` : ""}</span>
          </div>
          <p className="t-body !text-[15px] leading-snug mt-1.5 line-clamp-2 group-hover:text-[var(--cinnabar)] transition-colors">{c.question}</p>
          {meta && <p className="t-small mt-1 !text-[var(--ink-45)]">{meta}</p>}
        </div>
        <span className="t-label self-center shrink-0 text-[var(--ink-45)]">›</span>
      </Link>
    </li>
  );
}
