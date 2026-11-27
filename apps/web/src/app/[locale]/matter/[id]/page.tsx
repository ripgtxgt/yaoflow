import { canSee } from "@/lib/features";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { hexagramByNumber, type LineValue } from "@yaoflow/engine";
import { isLocale, t, type Locale } from "@/lib/i18n";
import { asLocale } from "@/lib/locales";
import { currentCustomer } from "@/lib/auth";
import { qianDrawsForMatter } from "@/lib/db";
import { qianByNum, qianOrdinal, qianPath, qianPoemAt, qianTag } from "@/lib/qian";
import { castsInMatter, castsTodayInMatter, followupsForCast, PAUSE_AT, myReferralStats, matterById, matterForSession, mattersForCustomer, notesInMatter, readingBodyForCast, type ThreadCast } from "@/lib/db";
import { matterDates, type DateSource } from "@/lib/matter-dates";
import { mt } from "@/lib/dict/matter";
import { tt } from "@/lib/dict/thread";
import { hexName } from "@/lib/names";
import { pick } from "@/lib/reading";
import { localDay } from "@/lib/clock";
import { outcomeUrl } from "@/lib/outcome-token";
import { threadStatus } from "@/components/ThreadPanel";
import { activeMembership } from "@/lib/membership";
import { focusCast, memberDaily } from "@/lib/member-daily";
import { dailyLineOrWarm } from "@/lib/daily-line";
import PauseNote from "@/components/PauseNote";
import TimingTimeline from "@/components/TimingTimeline";
import { buildTimeline } from "@/lib/timeline";
import InviteCard from "@/components/InviteCard";
import FigureMark, { primaryYangs } from "@/components/FigureMark";
import { collapseUpgrades } from "@/lib/matters";
import { matterQuestionGroups } from "@/lib/matter-questions";
import { preForMatter } from "@/lib/pre-cast";
import { toHans } from "@/lib/hant";
import { brandName } from "@/lib/brand";

// 10-07 回访改问法: the one-tap links carry the fact, never a verdict (lib/revisit-judge.ts)
const FACT = { hit: "happened", partial: "stirred", miss: "nothing", open: "open" } as const;

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  return { title: `${tt(asLocale(locale), "threadTitle")} · ${brandName(locale)}`, robots: { index: false } };
}

const fmt = (ms: number, l: Locale) =>
  new Date(ms).toLocaleDateString(l === "zh" ? "zh-CN" : l === "zh-hant" ? "zh-TW" : l, { month: "short", day: "numeric" });

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)}…` : s);

/**
 * 09-29 「一件事」 (用户数据与需求全面分析-0929.md §4.1): one matter, whole — every
 * cast on it and what each said, the reader's own notes between them, where it
 * stands now and the next day to watch. The reading page is a point on this line.
 *
 * Who may look: the signed-in owner, or anyone holding the link to one of the
 * matter's readings (?sid=) — the same key that opens the reading itself.
 */
export default async function MatterPage(
  { params, searchParams }: { params: Promise<{ locale: string; id: string }>; searchParams: Promise<{ sid?: string }> },
) {
  const { locale, id } = await params;
  if (!isLocale(locale)) notFound();
  const l = locale as Locale;
  const sp = await searchParams;
  const matterId = Number(id);
  const m = Number.isInteger(matterId) && matterId > 0 ? matterById(matterId) : null;
  const me = await currentCustomer();
  const sid = typeof sp.sid === "string" && sp.sid.length < 120 ? sp.sid : null;
  const bySid = sid ? matterForSession(sid) === matterId : false;
  const byOwner = !!(m && me && me.customerId === m.customer_id);
  if (!m || (!byOwner && !bySid)) {
    if (!me && !sid) redirect(`/${l}/login?next=${encodeURIComponent(`/${l}/matter/${id}`)}`);
    return (
      <div className="max-w-xl mx-auto px-6 pt-24 text-center">
        <p className="opacity-60 mb-6">{mt(l, "notFound")}</p>
        <Link href={me ? `/${l}/account` : `/${l}`} className="underline underline-offset-4">{me ? mt(l, "back") : t(l, "backHome")}</Link>
      </div>
    );
  }

  // newest first. A light reading upgraded to a full one is stored as two casts of the same figure a minute apart:
  // on the timeline they are one cast, shown at its fullest
  const casts = collapseUpgrades(castsInMatter(m.id));
  const notes = notesInMatter(m.id);
  const now = Date.now();
  const q = sid ? `?sid=${encodeURIComponent(sid)}` : "";
  // a refunded or disputed reading's link only says it is gone — no link to it
  const readingHref = (c: ThreadCast) => (c.session_id && !["refunded", "disputed"].includes(c.order_status ?? "") ? `/${l}/reading?sid=${encodeURIComponent(c.session_id)}` : null);
  // 10-26 「我的」: a cast kept with its free line only opens back on the cast page — for its owner
  const openHref = (c: ThreadCast) => readingHref(c) ?? (!c.session_id && byOwner ? `/${l}/cast?mine=${c.id}` : null);
  const site = (process.env.SITE_URL ?? "https://yaoflow.com").replace(/\/$/, "");

  // where it stands: the latest full reading's call, and the reader's latest note if it came after
  const latestDeep = casts.find((c) => c.tier === "deep");
  const deepBody = latestDeep ? readingBodyForCast(latestDeep.id) : null;
  const latestCall = deepBody ? pick((deepBody.body.verdict ?? deepBody.body.summary) as never, asLocale(latestDeep!.locale)) : "";
  const latestNote = notes.length ? notes[notes.length - 1]! : null;
  const showNote = latestNote && (!latestDeep || latestNote.created_at > latestDeep.created_at);

  // the next day to watch: the nearest window still ahead; windows that came and wait for an answer
  // 10-01 (#838: 「如果有更多應期，是否可以統一整理」): every dated sentence from the readings' timing and the follow-up
  // replies on this matter, in date order — the page's own timeline of days to watch
  const dateSources: DateSource[] = casts.flatMap((c) => {
    const body = c.tier === "deep" ? readingBodyForCast(c.id) : null;
    const timing = body ? pick(body.body.timing as never, asLocale(c.locale)) : "";
    const replies = followupsForCast(c.id).filter((f) => f.role === "assistant");
    return [
      ...(timing ? [{ kind: "reading" as const, castId: c.id, sessionId: c.session_id, at: c.created_at, text: timing }] : []),
      ...replies.map((f) => ({ kind: "followup" as const, castId: c.id, sessionId: c.session_id, at: f.created_at, text: f.content })),
    ];
  });
  const allDates = matterDates(dateSources, now);
  const DATES_SHOWN = 8;
  // the past ones that matter least fold away: keep everything from now on, plus the latest past few up to DATES_SHOWN
  const upcoming = allDates.filter((d) => d.status !== "past");
  const past = allDates.filter((d) => d.status === "past");
  const pastShown = past.slice(Math.max(0, past.length - Math.max(2, DATES_SHOWN - upcoming.length)));
  const pastHidden = past.slice(0, past.length - pastShown.length);
  const windows = casts.filter((c) => c.revisit_id && c.due_at);
  const ahead = windows.filter((c) => !c.outcome && (c.due_at ?? 0) > now).sort((a, b) => (a.due_at ?? 0) - (b.due_at ?? 0));
  const awaiting = windows.filter((c) => !c.outcome && (c.due_at ?? 0) <= now).sort((a, b) => (b.due_at ?? 0) - (a.due_at ?? 0));

  // today's line, for members and pass holders: rules on the matter's own chart, no model call
  // (10-22 Neil: 「改回来吧」 — 92 had made it the membership's alone; a 通卡 sees it again, like before the split)
  const member = !!activeMembership(m.customer_id);
  const todayN = castsTodayInMatter(m.id, now);
  const focus = member ? focusCast(casts, now) : null;
  const daily = focus ? memberDaily(focus, now) : null;
  // 09-29: the written note for this matter today, when the morning sweep (or a first view) has made it
  const dailyLine = focus && daily ? dailyLineOrWarm(m.customer_id, focus, daily, now) : null;

  // the timeline, newest first: casts and notes interleaved by time; a long matter folds its older part
  type Row = { at: number; cast?: ThreadCast; note?: (typeof notes)[number] };
  const rows: Row[] = [...casts.map((c) => ({ at: c.created_at, cast: c })), ...notes.map((n) => ({ at: n.created_at, note: n }))].sort((a, b) => b.at - a.at);
  const SHOWN = 12;
  const shown = rows.slice(0, SHOWN);
  const older = rows.slice(SHOWN);
  const tz = casts[0]?.tz_offset ?? 0;
  const others = byOwner ? mattersForCustomer(m.customer_id, 40).filter((x) => x.id !== m.id) : [];
  const back = `/${l}/matter/${m.id}${q}`;
  const title = m.title || clip(casts[casts.length - 1]?.question ?? "", 24);

  // 10-01 子題: the few real questions inside this matter, each with how often it was asked (#838: 「我是不是重複問了」)
  const SUB_AT = 4;
  const castById = new Map(casts.map((c) => [c.id, c]));
  const subGroups = casts.length >= SUB_AT
    ? (await matterQuestionGroups(m.id, casts.map((c) => ({ id: c.id, question: c.question, created_at: c.created_at, locale: c.locale })))).groups
        .map((g) => {
          const cs = g.ids.map((i) => castById.get(i)).filter((c): c is ThreadCast => !!c).sort((a, b) => b.created_at - a.created_at);
          return { label: g.label || clip(cs[0]?.question ?? "", 24), casts: cs };
        })
        .filter((g) => g.casts.length)
        .sort((a, b) => b.casts.length - a.casts.length || b.casts[0]!.created_at - a.casts[0]!.created_at)
    : [];
  // a matter of many single questions is shown as its timeline; the grouping earns its place when something repeats
  const showSub = subGroups.length > 0 && subGroups.length < casts.length;
  const SUB_SHOWN = 8;
  const foldTimeline = showSub && casts.length > 12;

  return (
    <div className="mx-auto w-full max-w-[46rem] px-[var(--s-4)] md:px-8 pt-10 pb-20">
      {byOwner && <p className="t-label mb-[var(--s-4)]"><Link href={`/${l}/account`} className="hover:text-[var(--ink)]">← {mt(l, "back")}</Link></p>}

      {/* ---- the matter ---- */}
      <h1 className="t-d1 break-words">{title}</h1>
      <p className="t-label !text-[var(--ink-45)] mt-2">{mt(l, "since", { date: fmt(casts[casts.length - 1]?.created_at ?? m.created_at, l), n: casts.length })}</p>
      {/* 10-14 进度表 50 */}
      {(l === "zh-hant" || l === "zh") && (await canSee("today-qian")) && <p className="t-small mt-2"><Link href={`/${l}/today-qian`} data-heat="matter-tq" className="underline underline-offset-4 !text-[var(--ink-45)] hover:!text-[var(--ink)]">{l === "zh" ? "今日一签：每天抽一支，看今天的大方向 →" : "今日一籤：每天抽一支，看今天的大方向 →"}</Link></p>}
      {/* 10-12 解籤 (进度表 §四 36): the lots this matter began with — the poem's page, never the reader's question */}
      {/* 10-12 承接 ⑨: the lots on this matter as small upright cards (the poem, read top to bottom, right to left), and —
          for the owner, in 繁體 — a way to add one */}
      {(() => { let qs: ReturnType<typeof qianDrawsForMatter> = []; try { qs = qianDrawsForMatter(m.id); } catch { /* */ } return (
        <>
          {qs.length > 0 && (
            <div className="mt-[var(--s-4)] flex flex-wrap gap-[var(--s-4)]">
              {qs.map((q) => { const e = qianByNum(q.num, q.set_name); return e ? (
                <Link key={q.id} href={qianPath(e.num, e.set)} className="group block" data-heat="matter-qian-card">
                  <div className="border border-[var(--cinnabar)] rounded-[2px] p-[3px]">
                    <div className="border border-[var(--ink-16)] px-3 py-3 flex flex-col gap-2 items-start" style={{ writingMode: "vertical-rl" }}>
                      <span className="text-[11px] tracking-[0.2em] !text-[var(--cinnabar)]">第{qianOrdinal(e.num)}籤　{qianTag(e)}</span>
                      {qianPoemAt(e, q.temple).map((line, i) => <span key={i} className="text-[14px] leading-[1.5] tracking-[0.2em] text-[var(--ink)]">{line}</span>)}
                    </div>
                  </div>
                  <span className="t-small block mt-1 max-w-[12rem] !text-[var(--ink-66)] group-hover:text-[var(--cinnabar)]">{e.title}</span>
                </Link>
              ) : null; })}
            </div>
          )}
          {byOwner && l === "zh-hant" && (
            <p className="t-small mt-2 !text-[var(--ink-45)]"><Link href={`/zh-hant/jieqian?m=${m.id}`} data-heat="matter-add-qian" className="underline underline-offset-4 hover:text-[var(--ink)]">{qs.length ? "再加一支籤" : "加一支籤"} →</Link></p>
          )}
        </>
      ); })()}
      {/* 10-17 承接: the 擲筊 and tarot spreads this matter began with — the result only, never the question */}
      {(l === "zh-hant" || l === "zh") && (() => { const ps = preForMatter(m.id); return ps.length ? (
        <ul className="mt-[var(--s-3)] flex flex-col gap-1">
          {ps.map((p) => {
            const day = new Date(p.at).toLocaleDateString(l === "zh" ? "zh-CN" : "zh-TW", { month: "numeric", day: "numeric", timeZone: "Asia/Taipei" });
            const what = p.kind === "jb"
              ? `擲筊 · ${p.rule === 3 && p.sign === "sheng" ? "三個聖筊" : p.sign === "sheng" ? "聖筊" : p.sign === "yin" ? "陰筊" : "笑筊"}`
              : `塔羅 · ${(p.cards ?? []).join("、")}`;
            return <li key={p.token} className="t-small !text-[var(--ink-66)]">{l === "zh" ? toHans(`${day}　${what}`) : `${day}　${what}`}</li>;
          })}
        </ul>
      ) : null; })()}
      {/* 10-01: the questions sit below the dates; on a phone that is several screens down — a way straight there */}
      {showSub && (
        <a href="#questions" data-heat="matter-q-jump" className="inline-block mt-[var(--s-3)] t-small px-3 py-1.5 rounded-[2px] border border-[var(--gold)]/60 !text-[var(--gold-text)] hover:border-[var(--gold)]">
          {mt(l, "acctQs", { k: subGroups.length })}{subGroups[0] && subGroups[0].casts.length > 2 ? ` · ${mt(l, "subRepeat", { n: subGroups[0].casts.length })}` : ""} ↓
        </a>
      )}
      {byOwner && (
        <details className="mt-2">
          <summary className="t-small cursor-pointer !text-[var(--ink-45)] hover:text-[var(--ink)] list-none">{mt(l, "rename")}</summary>
          <form method="post" action="/api/matter" className="mt-2 flex flex-wrap gap-2 items-center">
            <input type="hidden" name="action" value="rename" />
            <input type="hidden" name="id" value={m.id} />
            <input type="hidden" name="back" value={back} />
            <input name="title" defaultValue={title} maxLength={40} className="t-body !text-[15px] border-b border-[var(--ink-16)] bg-transparent px-1 py-1 min-w-0 flex-1 focus:outline-none focus:border-[var(--ink)]" />
            <button className="t-small px-3 py-1.5 rounded-[2px] border border-[var(--ink-16)] hover:border-[var(--ink)]">{mt(l, "save")}</button>
          </form>
        </details>
      )}
      {/* 10-04 进度表 30: the reader's switch — whether readings on this matter may look at its earlier casts and notes */}
      {byOwner && (
        <details className="mt-1" open={!!m.no_context}>
          <summary className={`t-small cursor-pointer list-none hover:text-[var(--ink)] ${m.no_context ? "!text-[var(--gold-text)]" : "!text-[var(--ink-45)]"}`}>
            {m.no_context ? mt(l, "ctxOffBadge") : mt(l, "ctxTitle")}
          </summary>
          <div className="mt-2 pl-3 border-l border-[var(--ink-16)]">
            <p className="t-small !text-[var(--ink-66)]">{m.no_context ? mt(l, "ctxOff") : mt(l, "ctxOn")}</p>
            <form method="post" action="/api/matter" className="mt-2">
              <input type="hidden" name="action" value="context" />
              <input type="hidden" name="id" value={m.id} />
              <input type="hidden" name="back" value={back} />
              <input type="hidden" name="off" value={m.no_context ? "0" : "1"} />
              <button data-heat={m.no_context ? "matter-ctx-on" : "matter-ctx-off"} className="t-small px-3 py-1.5 rounded-[2px] border border-[var(--ink-16)] hover:border-[var(--ink)]">{m.no_context ? mt(l, "ctxTurnOn") : mt(l, "ctxTurnOff")}</button>
            </form>
          </div>
        </details>
      )}

      {/* ---- where it stands ---- */}
      {(latestCall || showNote) && (
        <section className="mt-[var(--s-5)] border-t border-[var(--ink-16)] pt-[var(--s-4)]">
          <p className="t-sect mb-[var(--s-2)]">{mt(l, "now")}</p>
          {latestCall && (
            <>
              <p className="t-label !text-[var(--ink-45)]">{mt(l, "lastCall", { date: fmt(latestDeep!.created_at, l) })}</p>
              <p className="t-body !text-[17px] mt-1">{latestCall}</p>
            </>
          )}
          {showNote && (
            <div className={latestCall ? "mt-[var(--s-3)]" : ""}>
              <p className="t-label !text-[var(--ink-45)]">{mt(l, "lastNote", { date: fmt(latestNote!.created_at, l) })}</p>
              <p className="t-body !text-[15px] mt-1 text-[var(--ink-86)]">{clip(latestNote!.note, 200)}</p>
            </div>
          )}
        </section>
      )}

      {/* ---- the next day to watch / windows waiting for an answer ---- */}
      <section className="mt-[var(--s-5)] border border-[var(--gold)]/60 rounded-[2px] px-[var(--s-4)] py-[var(--s-4)]">
        <p className="t-sect !text-[var(--gold-text)] mb-1">{mt(l, "next")}</p>
        {ahead.length ? (
          <>
            <p className="t-body !text-[17px]">{fmt(ahead[0]!.due_at!, l)}</p>
            {ahead[0]!.timing_quote && <p className="t-small mt-1 !text-[var(--ink-66)]">{clip(ahead[0]!.timing_quote, 160)}</p>}
            {/* 10-14 进度表 44 ⑤: the same line as on the reading, short */}
            {(() => {
              const c = ahead[0]!;
              const tl = buildTimeline({ timing: c.timing_quote, castAtMs: c.cast_at, tzOffsetMinutes: c.tz_offset, revisitDueAt: c.due_at });
              return tl ? <TimingTimeline data={tl} locale={l} kind="" link="" today={new Date(Date.now() + c.tz_offset * 60_000).toISOString().slice(0, 10)} surface="matter" compact /> : null;
            })()}
          </>
        ) : (
          <p className="t-small !text-[var(--ink-66)]">{mt(l, "nextNone")}</p>
        )}
        {awaiting.slice(0, 2).map((c) => (
          <div key={c.id} className="mt-[var(--s-3)] pt-[var(--s-3)] border-t border-[var(--gold)]/30">
            <p className="t-small">{mt(l, "awaiting")} <span className="!text-[var(--ink-45)]">· {clip(c.question, 40)}</span></p>
            <p className="mt-2 flex flex-wrap gap-x-3 gap-y-2">
              {(["hit", "partial", "open", "miss"] as const).map((v) => (
                <a key={v} href={outcomeUrl(site, c.revisit_id!, FACT[v], l)} className="t-small px-3 py-1 rounded-[2px] border border-[var(--ink-16)] hover:border-[var(--ink)] hover:text-[var(--ink)] transition-colors">
                  {tt(l, v === "hit" ? "ansHit" : v === "partial" ? "ansPartial" : v === "miss" ? "ansMiss" : "ansOpen")}
                </a>
              ))}
            </p>
          </div>
        ))}
      </section>

      {/* ---- 10-01: every date named on this matter, readings and follow-ups together ---- */}
      {allDates.length > 1 && (
        <section id="dates" className="mt-[var(--s-3)] scroll-mt-20 border border-[var(--ink-16)] rounded-[2px] px-[var(--s-4)] py-[var(--s-4)]" data-heat="matter-dates">
          <p className="t-sect mb-1">{mt(l, "datesTitle")}</p>
          <p className="t-small !text-[var(--ink-45)] mb-[var(--s-3)]">{mt(l, "datesLead")}</p>
          {pastHidden.length > 0 && (
            <details className="mb-1">
              <summary className="t-label cursor-pointer py-1 list-none [&::-webkit-details-marker]:hidden">{mt(l, "datesEarlier", { n: pastHidden.length })} ›</summary>
              <ol className="flex flex-col">{pastHidden.map((d, i) => <DateRow key={`h${i}`} d={d} l={l} />)}</ol>
            </details>
          )}
          <ol className="flex flex-col">{[...pastShown, ...upcoming].map((d, i) => <DateRow key={i} d={d} l={l} />)}</ol>
        </section>
      )}

      {/* ---- today (members) ---- */}
      {daily ? (
        <section className="mt-[var(--s-3)] border border-[var(--gold)] bg-[var(--gold)]/[0.06] rounded-[2px] px-[var(--s-4)] py-[var(--s-4)]" data-heat="matter-daily">
          <p className="t-label !text-[var(--gold-text)]">{tt(l, "dailyTitle", { gz: daily.dayGanzhi })}</p>
          <p className="t-body !text-[17px] mt-[var(--s-2)]">{dailyLine ?? tt(l, `dK_${daily.kind}` as Parameters<typeof tt>[1])}</p>
          {daily.inWindow && !dailyLine && <p className="t-small mt-[var(--s-2)] !text-[var(--cinnabar)]">{tt(l, "dailyWindow")}</p>}
        </section>
      ) : byOwner && !member ? (
        <p className="t-small mt-[var(--s-3)] !text-[var(--ink-45)]">
          {mt(l, "dailyTease")} <Link href={`/${l}/account#membership`} className="underline underline-offset-4">{mt(l, "memberLink")} →</Link>
        </p>
      ) : null}

      {/* 09-29: the fifth cast of the day on one matter — one kind sentence and the next real date */}
      {byOwner && todayN >= PAUSE_AT && <PauseNote locale={l} n={todayN} nextDate={ahead.length ? fmt(ahead[0]!.due_at!, l) : null} />}

      {/* ---- what to do next ---- */}
      <div className="mt-[var(--s-5)] flex flex-wrap items-center gap-x-6 gap-y-3">
        <Link href={`/${l}/cast?c=matter`} data-heat="matter-ask" className="inline-block min-h-[var(--s-6)] px-6 py-3 rounded-[2px] bg-[var(--ink)] text-[var(--paper)] text-[13px] tracking-[0.14em]">
          {mt(l, "ask")}
        </Link>
        {latestDeep?.session_id && (
          <Link href={`/${l}/reading?sid=${encodeURIComponent(latestDeep.session_id)}#progress`} data-heat="matter-note" className="t-small underline underline-offset-4">
            {mt(l, "note")} →
          </Link>
        )}
      </div>

      {/* ---- 10-01 子題: the questions inside this matter ---- */}
      {showSub && (
        <section id="questions" className="mt-[var(--s-6)] pt-[var(--s-5)] border-t border-[var(--ink-16)] scroll-mt-20" data-heat="matter-questions">
          <p className="t-sect mb-1">{mt(l, "subTitle", { n: subGroups.length })}</p>
          <p className="t-small !text-[var(--ink-45)] mb-[var(--s-3)]">{mt(l, "subLead")}</p>
          <ol className="flex flex-col">
            {subGroups.slice(0, SUB_SHOWN).map((g, i) => <SubRow key={i} g={g} />)}
          </ol>
          {subGroups.length > SUB_SHOWN && (
            <details className="mt-1">
              <summary className="t-label cursor-pointer !text-[var(--ink-45)] hover:text-[var(--ink)] py-2 list-none [&::-webkit-details-marker]:hidden">{mt(l, "subOther")} · {subGroups.length - SUB_SHOWN} ›</summary>
              <ol className="flex flex-col">{subGroups.slice(SUB_SHOWN).map((g, i) => <SubRow key={`o${i}`} g={g} />)}</ol>
            </details>
          )}
        </section>
      )}

      {/* 09-29 推荐入口: someone else is stuck on something like this — bring them */}
      {byOwner && latestDeep?.session_id && (
        <InviteCard locale={l} giftHref={`/${l}/reading?sid=${encodeURIComponent(latestDeep.session_id)}#gift`} shareHref={`/${l}/reading?sid=${encodeURIComponent(latestDeep.session_id)}#share`} stats={myReferralStats(m.customer_id)} mineHref={`/${l}/account#referrals`} />
      )}

      {/* ---- the whole line ---- */}
      {foldTimeline ? (
        <details id="timeline" className="mt-[var(--s-6)] pt-[var(--s-5)] border-t border-[var(--ink-16)]">
          <summary className="t-sect cursor-pointer list-none [&::-webkit-details-marker]:hidden hover:text-[var(--ink)]">{mt(l, "timelineFold", { n: casts.length })} ›</summary>
          <ol className="flex flex-col mt-[var(--s-4)]">{rows.map((r) => renderRow(r))}</ol>
        </details>
      ) : (
      <section className="mt-[var(--s-6)] pt-[var(--s-5)] border-t border-[var(--ink-16)]">
        <p className="t-sect mb-[var(--s-4)]">{tt(l, "threadTitle")}</p>
        <ol className="flex flex-col">
          {shown.map((r) => renderRow(r))}
        </ol>
        {older.length > 0 && (
          <details className="mt-2">
            <summary className="t-label cursor-pointer !text-[var(--ink-45)] hover:text-[var(--ink)] py-2">{tt(l, "showMore", { n: older.length })}</summary>
            <ol className="flex flex-col">{older.map((r) => renderRow(r))}</ol>
          </details>
        )}
      </section>
      )}
    </div>
  );

  function SubRow({ g }: { g: { label: string; casts: ThreadCast[] } }) {
    // the latest reading that still opens
    const latest = g.casts.find((c) => readingHref(c)) ?? g.casts[0]!;
    const n = g.casts.length;
    const p = hexagramByNumber(latest.primary_num);
    const rb = readingBodyForCast(latest.id);
    const call = rb ? pick((rb.body.verdict ?? rb.body.summary) as never, asLocale(latest.locale)) : "";
    const href = openHref(latest);
    return (
      <li className="py-[var(--s-3)] border-t border-dotted border-[var(--ink-16)] first:border-t-0">
        <div className="flex items-baseline justify-between gap-3">
          <p className="t-body !text-[16px] break-words min-w-0">{g.label}</p>
          <span className={`t-small shrink-0 tabular-nums ${n > 2 ? "!text-[var(--cinnabar)]" : "!text-[var(--ink-45)]"}`}>{mt(l, "subAsked", { n })}</span>
        </div>
        <p className="t-label !text-[var(--ink-45)] mt-1">{mt(l, "subLatest", { date: fmt(latest.created_at, l) })} · {p ? hexName(p, l) : ""}</p>
        {call && <p className="t-small mt-1 !text-[var(--ink-66)]">{clip(call, 110)}</p>}
        {n > 2 && <p className="t-small mt-1 !text-[var(--gold-text)]">{mt(l, "subRepeat", { n })}</p>}
        <p className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
          {href && <Link href={href} className="t-small underline underline-offset-4">{mt(l, "subOpen")} →</Link>}
        </p>
        {n > 1 && (
          <details className="mt-1">
            <summary className="t-small cursor-pointer !text-[var(--ink-45)] hover:text-[var(--ink)] list-none [&::-webkit-details-marker]:hidden">{mt(l, "subAll", { n })} ›</summary>
            <ul className="mt-1 flex flex-col gap-1 pl-3 border-l border-[var(--ink-16)]">
              {g.casts.map((c) => {
                const h = openHref(c);
                const ph = hexagramByNumber(c.primary_num);
                const line = <><span className="!text-[var(--ink-45)] tabular-nums">{localDay(c.created_at, c.tz_offset)} · {ph ? hexName(ph, l) : ""}</span> {clip(c.question, 60)}</>;
                return <li key={c.id} className="t-small">{h ? <Link href={h} className="hover:text-[var(--cinnabar)]">{line}</Link> : line}</li>;
              })}
            </ul>
          </details>
        )}
      </li>
    );
  }

  function renderRow(r: Row) {
          {
            if (r.note) {
              return (
                <li key={`n${r.note.cast_id}-${r.note.created_at}`} className="py-[var(--s-2)] pl-4 border-l border-dashed border-[var(--gold)]/60">
                  <p className="t-label !text-[var(--gold-text)]">{localDay(r.note.created_at, tz)} · {mt(l, "noteRow")}</p>
                  <p className="t-small mt-1 !text-[var(--ink-86)]">{clip(r.note.note, 160)}</p>
                </li>
              );
            }
            const c = r.cast!;
            const p = hexagramByNumber(c.primary_num);
            const ch = c.changed_num ? hexagramByNumber(c.changed_num) : null;
            const rb = readingBodyForCast(c.id);
            const call = rb ? pick((rb.body.verdict ?? rb.body.summary) as never, asLocale(c.locale)) : "";
            const status = threadStatus(c, l, (ms) => fmt(ms, l), now);
            const meta = [
              c.tier ? t(l, c.tier === "deep" ? "accountTierDeep" : "accountTierOne") : null,
              c.followups > 0 ? tt(l, "threadAsks", { n: c.followups }) : null,
              status,
            ].filter(Boolean).join(" · ");
            const href = openHref(c);
            const values = c.values_str.split(",").map(Number) as LineValue[];
            return (
              <li key={c.id} className="py-[var(--s-3)] pl-4 border-l border-[var(--ink-16)]">
                <div className="flex items-start justify-between gap-3">
                  <p className="t-label !text-[var(--ink-45)]">
                    {localDay(c.created_at, c.tz_offset)}<span className="mx-2">·</span>{p ? hexName(p, l) : ""}{ch ? ` → ${hexName(ch, l)}` : ""}
                  </p>
                  <FigureMark yangs={primaryYangs(values)} width={16} className="opacity-50 shrink-0" />
                </div>
                {href ? (
                  <Link href={href} className="group block">
                    <p className="t-body mt-1 group-hover:text-[var(--cinnabar)] transition-colors">{c.question}</p>
                  </Link>
                ) : <p className="t-body mt-1">{c.question}</p>}
                {call && <p className="t-small mt-1 !text-[var(--ink-66)]">{clip(call, 120)}</p>}
                {meta && <p className="t-small mt-1 !text-[var(--ink-45)]">{meta}</p>}
                {/* 10-23 进度表 98 ② (客服 #510): a matter with ONE cast still offers the move when the reader has other
                    matters to move it into — a cast split off by mistake had no way back. 「另開一件事」 only when the cast
                    has company here (alone, it would only go round in a circle). */}
                {byOwner && (casts.length > 1 || others.length > 0) && (
                  <details className="mt-1">
                    <summary className="t-small cursor-pointer !text-[var(--ink-45)] hover:text-[var(--ink)] list-none">{mt(l, "moveQ")}</summary>
                    <form method="post" action="/api/matter" className="mt-2 flex flex-wrap gap-2 items-center">
                      <input type="hidden" name="action" value="move" />
                      <input type="hidden" name="cast" value={c.id} />
                      <input type="hidden" name="back" value={back} />
                      <select name="to" className="t-small bg-transparent border border-[var(--ink-16)] rounded-[2px] px-2 py-1 max-w-[16rem]">
                        {casts.length > 1 && <option value="new">{mt(l, "moveNew")}</option>}
                        {others.map((o) => <option key={o.id} value={o.id}>{clip(o.title || o.last_q || "", 24)}</option>)}
                      </select>
                      <button className="t-small px-3 py-1 rounded-[2px] border border-[var(--ink-16)] hover:border-[var(--ink)]">{mt(l, "moveGo")}</button>
                    </form>
                  </details>
                )}
              </li>
            );
          }
  }
}

/** One dated sentence: when, how close, where it was said (a link back to that reading or its conversation). */
function DateRow({ d, l }: { d: import("@/lib/matter-dates").MatterDate; l: Locale }) {
  // a date in another year says which year (「2027年2月4日」), so next spring is not read as last spring
  const thisYear = new Date().getFullYear();
  const day = (ms: number) => new Date(ms).toLocaleDateString(l === "zh" ? "zh-CN" : l === "zh-hant" ? "zh-TW" : l, { ...(new Date(ms).getFullYear() !== thisYear ? { year: "numeric" } : {}), month: "short", day: "numeric" });
  const span = new Date(d.start).toDateString() === new Date(d.end).toDateString() ? day(d.start) : `${day(d.start)} – ${day(d.end)}`;
  const tone = d.status === "past" ? "text-[var(--ink-45)]" : d.status === "now" ? "!text-[var(--cinnabar)]" : d.status === "soon" ? "!text-[var(--gold-text)]" : "text-[var(--ink-66)]";
  const label = mt(l, d.status === "past" ? "datesPast" : d.status === "now" ? "datesNow" : d.status === "soon" ? "datesSoon" : "datesLater");
  const src = mt(l, d.kind === "reading" ? "datesSrcReading" : "datesSrcAsk", { date: day(d.at) });
  const href = d.sessionId ? `/${l}/reading?sid=${encodeURIComponent(d.sessionId)}${d.kind === "followup" ? "#followup" : ""}` : null;
  return (
    <li className={`py-[var(--s-2)] border-t border-dotted border-[var(--ink-16)] first:border-t-0 ${d.status === "past" ? "opacity-60" : ""}`}>
      <p className="flex flex-wrap items-baseline gap-x-2">
        <span className="t-body !text-[15px] tabular-nums">{span}</span>
        <span className={`t-small ${tone}`}>{label}</span>
      </p>
      <p className="t-small mt-0.5 !text-[var(--ink-66)]">{d.sentence}</p>
      <p className="t-small mt-0.5 !text-[var(--ink-45)]">{href ? <Link href={href} className="underline underline-offset-4">{src} →</Link> : src}</p>
    </li>
  );
}
