import { db, recordEmail, recordOps } from "@/lib/db";
import { isForeign } from "@/lib/l10n/core";
import { baziReportPath, ensureBaziReport, mailBaziOnce } from "./bazi/report";
import { ensureZiweiReport, mailZiweiOnce, ziweiReportPath } from "./ziwei/report";
import { astroReportPath, ensureAstroReport, mailAstroOnce } from "./astro/report";
import { ensureHepanReport, hepanReportPath, mailHepanOnce } from "./hepan/report";
import { ensureNianshu, mailNianshuOnce, nianshuPath } from "./nianshu/report";

/**
 * 10-22 (客服核对, Neil: 「客服对话里，你看看还有什么要修复的」): a paid report whose writing stopped half way is
 * finished here, on the server's own clock (cron → /api/reports/mend, every 10 minutes).
 *
 *  · new / retry, or writing with its lease run out: the writing only went on while someone had the page open.
 *    #2104's 八字 deep report (10-22, the afternoon the report pages answered 500) sat at retry — no report, no letter.
 *  · incomplete (its rounds used up and a chapter still refused by the checks): the page tells the reader
 *    「這一章這次沒寫成，我們會補上，寫好會寄信通知你」, and nothing ever did. #838's 星盤 deep report, 10-22, one chapter.
 *    Two more rounds, at least 20 minutes apart; when every chapter is in, one short letter says so.
 *
 * One report per run (each round calls the model), the stalest first; nothing older than 14 days, nothing made by the
 * preview tests (paid session test:…). A year report that is one 篇 of a 三合一年書 is mended through its 年書.
 */
export type MendSys = "bazi" | "ziwei" | "astro" | "hepan" | "nianshu";
interface Door {
  sys: MendSys;
  table: string;
  /** the module's own rounds before it gives up (its MAX_ROUNDS) */
  rounds: number;
  ensure: (token: string) => Promise<unknown>;
  mail: (token: string, site: string) => Promise<"sent" | "already" | "skip" | "failed">;
  path: (token: string, locale?: string) => string;
  hasKind: boolean;
}
const DOORS: Door[] = [
  { sys: "bazi", table: "bazi_reports", rounds: 2, ensure: ensureBaziReport, mail: mailBaziOnce, path: baziReportPath, hasKind: true },
  { sys: "ziwei", table: "ziwei_reports", rounds: 2, ensure: ensureZiweiReport, mail: mailZiweiOnce, path: ziweiReportPath, hasKind: true },
  { sys: "astro", table: "astro_reports", rounds: 2, ensure: ensureAstroReport, mail: mailAstroOnce, path: astroReportPath, hasKind: true },
  { sys: "hepan", table: "hepan_reports", rounds: 2, ensure: ensureHepanReport, mail: mailHepanOnce, path: hepanReportPath, hasKind: true },
  { sys: "nianshu", table: "nianshu_reports", rounds: 3, ensure: ensureNianshu, mail: mailNianshuOnce, path: nianshuPath, hasKind: false },
];
const doorOf = (sys: MendSys) => DOORS.find((d) => d.sys === sys)!;

/** two rounds more than the module's own */
export const MEND_EXTRA_ROUNDS = 2;
/** a report touched this recently may still be in a page's hands */
export const MEND_QUIET_MS = 3 * 60_000;
/** a writing lease older than this is dead (the modules' leases are 4 and 10 minutes) */
export const MEND_STALE_WRITING_MS = 12 * 60_000;
/** an incomplete report gets another round at most this often */
export const MEND_GAP_MS = 20 * 60_000;
export const MEND_WINDOW_MS = 14 * 86_400_000;

export interface MendPick { sys: MendSys; token: string; status: string; rounds: number; updatedAt: number }

type Row = { token: string; status: string; body_json: string | null; created_at: number; updated_at: number | null; lease_at: number | null; locale: string; kind: string | null; email: string | null; customer_id: number | null; paid_session: string | null };
const COLS = (d: Door) => `token, status, body_json, created_at, updated_at, lease_at, locale, ${d.hasKind ? "kind" : "NULL AS kind"}, email, customer_id, paid_session`;

function roundsOf(body: string | null): number {
  try { const b = JSON.parse(body ?? "{}") as { rounds?: unknown }; return typeof b.rounds === "number" ? b.rounds : 0; } catch { return 0; }
}

/** the 年書's three year reports — mended through the 年書, not on their own */
function bookChildren(): Set<string> {
  const out = new Set<string>();
  try {
    for (const r of db().prepare("SELECT bazi_token, ziwei_token, astro_token FROM nianshu_reports").all() as { bazi_token: string | null; ziwei_token: string | null; astro_token: string | null }[]) {
      for (const t of [r.bazi_token, r.ziwei_token, r.astro_token]) if (t) out.add(t);
    }
  } catch { /* no 年書 yet */ }
  return out;
}

function rowOf(d: Door, token: string): Row | null {
  try {
    return (db().prepare(`SELECT ${COLS(d)} FROM ${d.table} WHERE token = ?`).get(token) as Row | undefined) ?? null;
  } catch { return null; }
}

/** What needs finishing now, the stalest first. */
export function mendCandidates(now = Date.now()): MendPick[] {
  const kids = bookChildren();
  const out: MendPick[] = [];
  for (const d of DOORS) {
    let rows: Row[] = [];
    try {
      rows = db().prepare(
        `SELECT ${COLS(d)} FROM ${d.table}
         WHERE paid_at IS NOT NULL AND created_at >= ? AND status IN ('new','retry','writing','incomplete')
           AND (paid_session IS NULL OR paid_session NOT LIKE 'test:%')`,
      ).all(now - MEND_WINDOW_MS) as Row[];
    } catch { continue; } // the table is made on first use
    for (const r of rows) {
      if (d.sys !== "nianshu" && kids.has(r.token)) continue;
      const rounds = roundsOf(r.body_json);
      const touched = r.updated_at ?? r.created_at; // a row nobody has written to yet has no updated_at
      const due = r.status === "incomplete" ? rounds < d.rounds + MEND_EXTRA_ROUNDS && touched <= now - MEND_GAP_MS
        : r.status === "writing" ? (r.lease_at ?? touched) <= now - MEND_STALE_WRITING_MS
        : touched <= now - MEND_QUIET_MS;
      if (due) out.push({ sys: d.sys, token: r.token, status: r.status, rounds, updatedAt: touched });
    }
  }
  return out.sort((a, b) => a.updatedAt - b.updatedAt);
}

/** The 「補好了」 letter — once per report (the emails row is the claim). */
async function mailMendedOnce(d: Door, r: Row, site: string): Promise<"sent" | "already" | "skip" | "failed"> {
  const email = (r.email ?? "").trim().toLowerCase();
  if (!email) return "skip";
  const key = `${d.sys}:${r.token}`;
  const claimed = (db().prepare("INSERT INTO emails (session_id, kind, email, sent_at, status, detail) VALUES (?, ?, ?, ?, 'sending', NULL) ON CONFLICT(session_id, kind) DO NOTHING")
    .run(key, `${d.sys}-mended`, email, Date.now()) as unknown as { changes?: number }).changes;
  if (!claimed) return "already";
  const { buildReportMendedEmail, sendEmail } = await import("@/lib/email");
  const { CONTACT_EMAIL } = await import("@/lib/trust");
  // 10-30 进度表 128 ④: a report written for a page in another language gets the letter in that language
  let foreign: { l: string; name: string; lang: string } | undefined;
  if (isForeign(r.locale)) {
    const { LOCALE_META } = await import("@/lib/locales");
    const name = d.sys === "bazi" ? (await import("@/lib/mingli/bazi/page-ui")).baziReportText(r.locale).kindLabel[r.kind === "love" ? "love" : "deep"]
      : d.sys === "ziwei" ? (await import("@/lib/mingli/ziwei/page-ui")).ziweiReportText(r.locale).kindLabel
      : d.sys === "hepan" ? (await import("@/lib/mingli/hepan/page-ui")).hepanT(r.locale).kindLabel ?? ""
      // 10-30 进度表 128 ④-5: the 年書 by its name in that language
      : d.sys === "nianshu" ? (await import("@/lib/mingli/nianshu/foreign-text")).nsForeignText(r.locale).ui.kindLabel
      : (await import("@/lib/mingli/astro/page-ui")).astroReportText(r.locale).kindLabel;
    foreign = { l: r.locale, name, lang: LOCALE_META[r.locale].htmlLang };
  }
  const m = buildReportMendedEmail({ sys: d.sys, kind: r.kind, url: `${site}${d.path(r.token, r.locale)}`, hans: r.locale === "zh", foreign });
  const res = await sendEmail(email, m.subject, m.html, m.text, { kind: "report_mended", sessionId: r.paid_session ?? key, customerId: r.customer_id ?? undefined, replyTo: CONTACT_EMAIL })
    .catch(() => ({ ok: false, error: "throw" } as { ok: boolean; error?: string; id?: string }));
  recordEmail(key, `${d.sys}-mended`, email, res.ok ? "sent" : "failed", res.ok ? res.id : res.error);
  return res.ok ? "sent" : "failed";
}

export interface MendResult { sys: MendSys; token: string; from: string; to: string; letter: string }

/** One round on one report; then the letter it is owed, if any. */
export async function mendOne(p: MendPick, site: string): Promise<MendResult> {
  const d = doorOf(p.sys);
  const was = p.status;
  if (was === "incomplete") {
    db().prepare(`UPDATE ${d.table} SET status = 'retry', lease_at = NULL WHERE token = ? AND status = 'incomplete'`).run(p.token);
    // a 年書 waits on its three year reports: the ones that gave up get their extra rounds with it
    if (d.sys === "nianshu") {
      const ns = db().prepare("SELECT bazi_token, ziwei_token, astro_token FROM nianshu_reports WHERE token = ?").get(p.token) as { bazi_token: string | null; ziwei_token: string | null; astro_token: string | null } | undefined;
      for (const [t, table] of [[ns?.bazi_token, "bazi_reports"], [ns?.ziwei_token, "ziwei_reports"], [ns?.astro_token, "astro_reports"]] as const) {
        if (t) try { db().prepare(`UPDATE ${table} SET status = 'retry', lease_at = NULL WHERE token = ? AND status = 'incomplete'`).run(t); } catch { /* table not made */ }
      }
    }
  }
  await d.ensure(p.token).catch(() => null);
  const r = rowOf(d, p.token);
  const to = r?.status ?? "gone";
  let letter = "none";
  if (r && (to === "done" || to === "incomplete")) {
    // the ordinary letter first, if it never went (the page that would have sent it was never opened at the end)
    const first = await d.mail(p.token, site).catch(() => "failed" as const);
    letter = first;
    if (to === "done" && was === "incomplete" && first === "already") letter = `mended:${await mailMendedOnce(d, r, site)}`;
  }
  recordOps("report_mend", `${p.sys} ${p.token.slice(-6)} ${was}→${to} r${p.rounds} ${letter}`);
  return { sys: p.sys, token: p.token, from: was, to, letter };
}

/** The cron's run: at most `max` reports (default one — each round is model calls). */
export async function runReportMend(site: string, now = Date.now(), max = 1): Promise<MendResult[]> {
  const out: MendResult[] = [];
  for (const p of mendCandidates(now).slice(0, max)) out.push(await mendOne(p, site));
  return out;
}
