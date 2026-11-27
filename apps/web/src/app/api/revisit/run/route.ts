import { NextRequest, NextResponse } from "next/server";
import { letterOn } from "@/lib/letter-switch";
import { castOwnerMatter, qianDrawForCast, qianDrawsForMatter, outcomeHintFor } from "@/lib/db";
import { QIAN_SET, qianByNum, qianSet, qianSetName } from "@/lib/qian";
import { CONTACT_EMAIL } from "@/lib/trust";
import { orderBySession } from "@/lib/db";
import { LOCALE_META, asLocale } from "@/lib/locales";
import { dueCheckpoints, markCheckpoint, dueRevisitEmails, dueRevisitsForEmail, markRevisit, markRevisitReminded, markSealWatcherNotified, recordOps, revisitCastContext, revisitsToRemind, sealData, sealWatchersToNotify, skipStaleRevisits, stalePendingRevisits, type RevisitRow } from "@/lib/db";
import { buildCheckpointEmail, buildRevisitDigestEmail, buildRevisitEmail, buildSealEmail, buildSelfRevisitEmail, sendEmail, type RevisitDigestItem } from "@/lib/email";
import { backfillSelfRevisits, selfKindName, selfReportUrl, selfReviewLabel } from "@/lib/self-revisit";
import { formatSpan, nextStretch } from "@/lib/dict/checkpoint";
import { checkpointUrl, outcomeUrl, sealUrl } from "@/lib/outcome-token";
import { resolveCast, type LineValue } from "@yaoflow/engine";
import { hexName } from "@/lib/names";
import { REVISIT_STALE_MS, revisitRemindOn, timingMailGate } from "@/lib/timing-mail";

export const runtime = "nodejs";

/**
 * 应期回访 runner. Hit daily by the server's own cron (localhost, never the
 * public internet): finds revisits whose window has closed and sends each
 * its follow-up. Guarded by ADMIN_KEY; ?dry=1 lists without sending.
 * 09-21: a second pass sends ONE reminder to revisits mailed ≥ 5 days ago
 * that got no answer (the mail's footer promises at most one).
 * 10-07 收口 (lib/timing-mail.ts): the letter yields to the family's cap
 * (one of heads-up / day-of / revisit a day, three a week) — a capped revisit
 * stays pending and is tried again tomorrow; one whose window closed over two
 * weeks ago is skipped instead of asked late; the reminder pass is off unless
 * REVISIT_REMIND=on (52 reminders had brought 3 answers).
 * 10-22 进度表 77 回访积压 (357 due revisits in 171 inboxes, 6–18 letters a day): the
 * run goes BY ADDRESS — the addresses with a due revisit, the longest-waiting
 * first, at most MAX_EMAILS a run; everything due for one address goes in ONE
 * letter (buildRevisitDigestEmail) that counts once under the cap. The 10-07 caps
 * themselves are unchanged. ?max=N widens a run, ?stale=DAYS widens the
 * too-late line for a one-off clearing of the backlog (the cron keeps 14).
 */
const MAX_EMAILS = 80;
const REMIND_AFTER_DAYS = 5;
const CHECKPOINT_STALE_DAYS = 4;
export async function POST(req: NextRequest) {
  const key = req.headers.get("x-cron-key");
  if (!process.env.ADMIN_KEY || key !== process.env.ADMIN_KEY) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const dry = req.nextUrl.searchParams.get("dry") === "1";
  // 10-23 进度表 108: the revisit letters (and their mid-window and seal letters) can be turned off in /admin/letters — a
  // revisit due meanwhile stays in the queue and goes out the first run after they are on again (the 14-day rule holds)
  if (!dry && !letterOn("revisit")) return NextResponse.json({ off: true });
  const now = Date.now();
  const site = (process.env.SITE_URL ?? "https://yaoflow.com").replace(/\/$/, "");
  const replyTo = process.env.REVISIT_REPLY_TO ?? CONTACT_EMAIL;

  const q = req.nextUrl.searchParams;
  const maxQ = Number(q.get("max")), staleQ = Number(q.get("stale"));
  const maxEmails = maxQ >= 1 && maxQ <= 500 ? Math.floor(maxQ) : MAX_EMAILS;
  // 10-22 进度表 77 ④: while the backlog clears (the caps let a capped address wait up to a week), a window is not
  // stale before 21 days; from 11-05 the 14-day rule (10-07) is back on its own
  const BACKLOG_UNTIL = Date.UTC(2026, 10, 5);
  const staleMs = staleQ >= 1 && staleQ <= 60 ? Math.floor(staleQ) * 86_400_000 : now < BACKLOG_UNTIL ? 21 * 86_400_000 : REVISIT_STALE_MS;
  const results: { id: number; email: string; status: string }[] = [];
  // 10-22 进度表 85: paid 看自己 reports that have no day yet (paid before the defaults, or a path that missed them) get theirs
  const backfilled = dry ? 0 : await backfillSelfRevisits(now);
  // 10-07: too long after the window to ask (the cap may have held it back for days, but not for weeks) — one sweep
  const staleRows = stalePendingRevisits(now, staleMs);
  const stale = dry ? staleRows.length : skipStaleRevisits(now, staleMs);
  for (const r of staleRows) results.push({ id: r.id, email: r.email, status: "skipped_stale" });
  const emails = dueRevisitEmails(now, maxEmails, staleMs);
  // a dry run writes no mail_log row, so it remembers for itself who already "got" today's letter
  const dryToday = new Set<string>();
  let capped = 0, letters = 0, due = 0;

  const build = (r: RevisitRow, ctx: NonNullable<ReturnType<typeof revisitCastContext>>, reminder: boolean) => {
    const values = ctx.values_str.split(",").map(Number) as LineValue[];
    const locale = asLocale(r.locale);
    // the stored names are Simplified Chinese; the email must name the figure the way the reader's language does
    const cast = resolveCast(values);
    return buildRevisitEmail({
      reminder,
      locale,
      question: ctx.question,
      values,
      hexName: hexName(cast.primary, locale),
      changedName: cast.changed ? hexName(cast.changed, locale) : null,
      timingQuote: r.timing_quote,
      windowDays: r.window_days,
      readingUrl: `${site}/${locale}/reading?sid=${encodeURIComponent(r.session_id)}`,
      castUrl: `${site}/${locale}`,
      giftUrl: r.tier === "deep" && ["paid", "subscription"].includes(orderBySession(r.session_id)?.status ?? "")
        ? `${site}/${locale}/reading?sid=${encodeURIComponent(r.session_id)}#gift`
        : null,
      // 10-07: the links carry the fact (lib/revisit-judge.ts); the score is derived when the tap comes in
      outcomeUrls: {
        hit: outcomeUrl(site, r.id, "happened", locale),
        partial: outcomeUrl(site, r.id, "stirred", locale),
        miss: outcomeUrl(site, r.id, "nothing", locale),
        open: outcomeUrl(site, r.id, "open", locale),
      },
      ask: r.ask === "signals" ? "signals" : "event",
      qianLine: qianLineFor(r.cast_id, locale),
      hint: outcomeHintFor(r.cast_id),
      plan: r.plan ?? null,
    });
  };

  /** the day the cast was made, in the reader's own words — the digest's label over each item */
  const askedOn = (ms: number, locale: string) => {
    const d = new Date(ms + 8 * 3_600_000); // the letter is read in UTC+8 for the Chinese readers; a day off elsewhere does no harm
    if (locale === "zh" || locale === "zh-hant" || locale === "ja") return `${d.getUTCMonth() + 1}月${d.getUTCDate()}日`;
    if (locale === "ko") return `${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일`;
    try { return new Intl.DateTimeFormat(LOCALE_META[asLocale(locale)].htmlLang, { month: "short", day: "numeric", timeZone: "UTC" }).format(d); } catch { return d.toISOString().slice(5, 10); }
  };
  for (const email of emails) {
    const rows = dueRevisitsForEmail(email, now, staleMs);
    const items: { r: RevisitRow; ctx: NonNullable<ReturnType<typeof revisitCastContext>> }[] = [];
    for (const r of rows) {
      // 10-22 进度表 80: a 看自己 revisit has no cast — its context is the report's name and its own words
      const ctx = r.kind ? { question: r.label ?? selfKindName(r.kind, r.locale), values_str: "", primary_name: "", changed_name: null, cast_at: r.created_at } : r.cast_id ? revisitCastContext(r.cast_id) : null;
      if (!ctx) {
        if (!dry) markRevisit(r.id, "skipped");
        results.push({ id: r.id, email: r.email, status: "skipped_no_cast" });
        continue;
      }
      items.push({ r, ctx });
    }
    if (!items.length) continue;
    due += items.length;
    const gate = dry && dryToday.has(email) ? "today" : timingMailGate(email, now);
    if (gate !== "ok") {
      capped += items.length;
      for (const { r } of items) results.push({ id: r.id, email: r.email, status: `capped_${gate}` }); // stay pending: tomorrow again
      continue;
    }
    if (dry) {
      dryToday.add(email);
      for (const { r } of items) results.push({ id: r.id, email: r.email, status: items.length > 1 ? `would_send_in_${items.length}` : "would_send" });
      continue;
    }
    const first = items[0]!;
    const locale = asLocale(first.r.locale);
    let mail: { subject: string; html: string; text: string };
    const selfUrls = (r: RevisitRow) => ({ hit: outcomeUrl(site, r.id, "happened", locale), partial: outcomeUrl(site, r.id, "stirred", locale), miss: outcomeUrl(site, r.id, "nothing", locale), open: outcomeUrl(site, r.id, "open", locale) });
    if (items.length === 1 && first.r.kind) {
      mail = buildSelfRevisitEmail({ locale, kind: first.r.kind, label: first.ctx.question, hint: first.r.hint ?? null, plan: first.r.plan ?? null, reportUrl: selfReportUrl(site, first.r.kind, first.r.ref ?? "", locale), castUrl: `${site}/${locale}`, outcomeUrls: selfUrls(first.r) });
    } else if (items.length === 1) mail = build(first.r, first.ctx, false);
    else {
      // 10-22 进度表 77: everything due for this address in one letter, each reading with its own answers
      const giftUrl = items.map(({ r }) => (r.tier === "deep" && ["paid", "subscription"].includes(orderBySession(r.session_id)?.status ?? "")
        ? `${site}/${locale}/reading?sid=${encodeURIComponent(r.session_id)}#gift` : null)).find(Boolean) ?? null;
      const digest: RevisitDigestItem[] = items.map(({ r, ctx }) => {
        if (r.kind) return {
          question: ctx.question, values: [], hexName: selfKindName(r.kind, locale), changedName: null, timingQuote: null, windowDays: r.window_days,
          readingUrl: selfReportUrl(site, r.kind, r.ref ?? "", locale), outcomeUrls: selfUrls(r), ask: "event" as const, qianLine: null, hint: r.hint ?? null, askedOn: askedOn(ctx.cast_at, locale),
          plan: r.plan ?? null, reviewLabel: selfReviewLabel(r.kind, locale),
        };
        const values = ctx.values_str.split(",").map(Number) as LineValue[];
        const cast = resolveCast(values);
        return {
          question: ctx.question, values, hexName: hexName(cast.primary, locale), changedName: cast.changed ? hexName(cast.changed, locale) : null,
          timingQuote: r.timing_quote, windowDays: r.window_days,
          readingUrl: `${site}/${locale}/reading?sid=${encodeURIComponent(r.session_id)}`,
          outcomeUrls: { hit: outcomeUrl(site, r.id, "happened", locale), partial: outcomeUrl(site, r.id, "stirred", locale), miss: outcomeUrl(site, r.id, "nothing", locale), open: outcomeUrl(site, r.id, "open", locale) },
          ask: r.ask === "signals" ? "signals" : "event",
          qianLine: qianLineFor(r.cast_id, locale), hint: outcomeHintFor(r.cast_id),
          askedOn: askedOn(ctx.cast_at, locale), plan: r.plan ?? null,
        };
      });
      mail = buildRevisitDigestEmail({ locale, items: digest, castUrl: `${site}/${locale}`, giftUrl });
    }
    // replies land in the owner's inbox — the outcome-feedback channel; one mail_log row for the letter (the cap counts letters)
    const sent = await sendEmail(email, mail.subject, mail.html, mail.text, { kind: "revisit", replyTo, sessionId: items.length > 1 ? `${first.r.session_id}:digest${items.length}` : first.r.session_id, customerId: first.r.customer_id });
    if (sent.ok) letters += 1;
    for (const { r } of items) {
      markRevisit(r.id, sent.ok ? "sent" : "failed");
      results.push({ id: r.id, email: r.email, status: sent.ok ? (items.length > 1 ? `sent_in_${items.length}` : "sent") : `failed:${sent.error}` });
    }
  }

  // 10-12 多段应期 (进度表 §四 29): the check-in after each earlier window — under the same family cap, after the revisits
  // (a closing verdict outranks an in-between question); not once the reading has been asked about or answered, and not
  // late: a check-in held back more than CHECKPOINT_STALE_DAYS is dropped, the next window is already near
  let cps = 0;
  for (const k of dueCheckpoints(50)) {
    const r = k.revisit;
    const ctx = r.cast_id ? revisitCastContext(r.cast_id) : null;
    if (!ctx || r.status !== "pending" || r.outcome || now - k.due_at > CHECKPOINT_STALE_DAYS * 86_400_000) {
      if (!dry) markCheckpoint(k.id, "skipped");
      results.push({ id: r.id, email: r.email, status: `cp${k.seq}_skipped` });
      continue;
    }
    const gate = dry && dryToday.has(r.email.toLowerCase()) ? "today" : timingMailGate(r.email, now);
    if (gate !== "ok") { capped += 1; results.push({ id: r.id, email: r.email, status: `cp${k.seq}_capped_${gate}` }); continue; }
    if (dry) { dryToday.add(r.email.toLowerCase()); results.push({ id: r.id, email: r.email, status: `cp${k.seq}_would_send` }); continue; }
    const locale = asLocale(r.locale);
    const lang = LOCALE_META[locale].htmlLang;
    const cast = resolveCast(ctx.values_str.split(",").map(Number) as LineValue[]);
    const readingUrl = `${site}/${locale}/reading?sid=${encodeURIComponent(r.session_id)}`;
    const mail = buildCheckpointEmail({
      locale, question: ctx.question,
      hexName: hexName(cast.primary, locale) + (cast.changed ? ` → ${hexName(cast.changed, locale)}` : ""),
      timingQuote: r.timing_quote,
      range: formatSpan(new Date(k.start_at), new Date(k.end_at), lang),
      next: nextStretch(r, k.seq, lang),
      urls: { seen: checkpointUrl(site, k.id, "seen", locale), none: checkpointUrl(site, k.id, "none", locale), unsure: checkpointUrl(site, k.id, "unsure", locale) },
      readingUrl, noteUrl: `${readingUrl}#progress`,
      hint: outcomeHintFor(r.cast_id),
    });
    // kind "revisit": one family, one cap — and its own session key, so the final revisit's mail log row stays its own
    const sent = await sendEmail(r.email, mail.subject, mail.html, mail.text, { kind: "revisit", replyTo, sessionId: `${r.session_id}:cp${k.seq}`, customerId: r.customer_id });
    markCheckpoint(k.id, sent.ok ? "sent" : "failed");
    if (sent.ok) cps += 1;
    results.push({ id: r.id, email: r.email, status: sent.ok ? `cp${k.seq}_sent` : `cp${k.seq}_failed:${sent.error}` });
  }

  // the one reminder — off since 10-07 unless REVISIT_REMIND=on
  const remind = revisitRemindOn() ? revisitsToRemind(REMIND_AFTER_DAYS, 20) : [];
  for (const r of remind) {
    const ctx = r.cast_id ? revisitCastContext(r.cast_id) : null;
    if (!ctx) { if (!dry) markRevisitReminded(r.id); continue; }
    if (dry) { results.push({ id: r.id, email: r.email, status: "would_remind" }); continue; }
    const mail = build(r, ctx, true);
    const sent = await sendEmail(r.email, mail.subject, mail.html, mail.text, { kind: "revisit", replyTo, sessionId: `${r.session_id}:remind`, customerId: r.customer_id });
    markRevisitReminded(r.id); // once, sent or not — never nag
    results.push({ id: r.id, email: r.email, status: sent.ok ? "reminded" : `remind_failed:${sent.error}` });
  }

  // 封卦揭晓 (09-21, A1): strangers who asked to be told when a sealed
  // prediction settles. One letter each, then the row is marked for good.
  const watchers = sealWatchersToNotify(50);
  for (const w of watchers) {
    const d = sealData(w.revisit_id);
    if (!d || (d.outcome !== "hit" && d.outcome !== "miss")) { if (!dry) markSealWatcherNotified(w.id); continue; }
    if (dry) { results.push({ id: w.revisit_id, email: w.email, status: "would_reveal" }); continue; }
    const locale = asLocale(w.locale);
    const values = d.values_str.split(",").map(Number) as LineValue[];
    const mail = buildSealEmail({
      locale,
      hexName: hexName(resolveCast(values).primary, locale),
      timingQuote: d.timing_quote,
      hit: d.outcome === "hit",
      sealUrl: sealUrl(site, d.id, locale),
      castUrl: `${site}/${locale}?c=seal`,
    });
    const sent = await sendEmail(w.email, mail.subject, mail.html, mail.text, { kind: "seal", replyTo, sessionId: `seal:${d.id}:${w.id}` });
    markSealWatcherNotified(w.id); // once, sent or not — this is the single letter we promised
    results.push({ id: w.revisit_id, email: w.email, status: sent.ok ? "revealed" : `reveal_failed:${sent.error}` });
  }

  if (!dry) recordOps("cron_revisit", `emails=${emails.length} due=${due} letters=${letters} cp=${cps} capped=${capped} stale=${stale} remind=${remind.length} reveal=${watchers.length} self_backfill=${backfilled}`);
  return NextResponse.json({ emails: emails.length, due, letters, checkpoints: cps, capped, stale, remind: remind.length, reveal: watchers.length, backfilled, dry, results });
}

/** 10-12 承接 ⑨: the lot this matter began with, as one line of the revisit letter (繁體 / 简体 readers only). */
function qianLineFor(castId: number | null, locale: string): string | null {
  if (!castId || (locale !== "zh-hant" && locale !== "zh")) return null;
  try {
    const own = qianDrawForCast(castId);
    const mid = own ? null : castOwnerMatter(castId)?.matter_id ?? null;
    const d = own ?? (mid ? qianDrawsForMatter(mid)[0] ?? null : null);
    const e = d ? qianByNum(d.num, d.set_name) : null;
    if (!e) return null;
    const other = e.set !== QIAN_SET; // 10-12 籤系: name the set when it is not the 六十甲子籤
    return locale === "zh" ? `当初抽到的是${other ? qianSet(e.set).nameHans : ""}第 ${e.num} 签〈${e.title}〉。` : `當初抽到的是${other ? qianSetName(e) : ""}第 ${e.num} 籤〈${e.title}〉。`;
  } catch { return null; }
}
