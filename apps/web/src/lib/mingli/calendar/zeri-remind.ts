import { letterOn } from "@/lib/letter-switch";
import { randomBytes } from "node:crypto";
import { db, recordOps } from "@/lib/db";
import { homeDay } from "@/lib/clock";
import { huangliDay, parseYmd, term } from "./day";
import { matterBySlug } from "./zeri";
import { cancelZeriRevisit, scheduleZeriRevisit } from "@/lib/self-revisit";

/**
 * 10-17 进度表 70 擇日「提醒我這一天」: the reader picks a day and leaves an address; the day before, one letter.
 * Only the address, the day and the matter are kept — never the 生肖. The letter carries a one-tap cancel.
 * 10-22 进度表 80: the reminder also sets a 看自己 revisit three days after the day (「那天的事，辦得順不順？」); cancelling
 * the reminder cancels it. `ask: false` sets the reminder alone.
 */
let ready = false;
function ensure() {
  if (ready) return;
  db().exec(`CREATE TABLE IF NOT EXISTS zeri_reminds (
    token TEXT PRIMARY KEY, email TEXT NOT NULL, ymd TEXT NOT NULL, slug TEXT NOT NULL, locale TEXT NOT NULL,
    created_at INTEGER NOT NULL, sent_at INTEGER, cancelled_at INTEGER);
    CREATE INDEX IF NOT EXISTS idx_zeri_due ON zeri_reminds(ymd) WHERE sent_at IS NULL AND cancelled_at IS NULL;`);
  ready = true;
}

export function addZeriRemind(i: { email: string; ymd: string; slug: string; locale: string; ask?: boolean; customerId?: number | null }, now = Date.now()): { ok: true; token?: string } | { ok: false; why: "bad" | "past" | "many" } {
  ensure();
  if (!parseYmd(i.ymd) || !matterBySlug(i.slug)) return { ok: false, why: "bad" };
  if (i.ymd <= homeDay(now)) return { ok: false, why: "past" };
  const n = (db().prepare("SELECT COUNT(*) n FROM zeri_reminds WHERE email = ? AND created_at > ?").get(i.email, now - 86_400_000) as { n: number }).n;
  // 10-18: the same day for the same matter is kept once
  const dup = db().prepare("SELECT 1 FROM zeri_reminds WHERE email = ? AND ymd = ? AND slug = ? AND sent_at IS NULL AND cancelled_at IS NULL").get(i.email, i.ymd, i.slug);
  if (dup) return { ok: true };
  if (n >= 10) return { ok: false, why: "many" };
  const token = randomBytes(12).toString("hex");
  db().prepare("INSERT INTO zeri_reminds (token, email, ymd, slug, locale, created_at) VALUES (?,?,?,?,?,?)").run(token, i.email, i.ymd, i.slug, i.locale === "zh" ? "zh" : "zh-hant", now);
  if (i.ask !== false) try { scheduleZeriRevisit({ remindToken: token, ymd: i.ymd, slug: i.slug, email: i.email, locale: i.locale, customerId: i.customerId ?? null }, now); } catch { /* the reminder stands */ }
  return { ok: true, token };
}

export function cancelZeriRemind(token: string, now = Date.now()): boolean {
  ensure();
  const row = db().prepare("SELECT ymd, slug FROM zeri_reminds WHERE token = ?").get(token) as { ymd: string; slug: string } | undefined;
  const ok = Number((db().prepare("UPDATE zeri_reminds SET cancelled_at = ? WHERE token = ? AND cancelled_at IS NULL").run(now, token) as { changes?: number | bigint }).changes ?? 0) > 0;
  if (ok && row) try { cancelZeriRevisit(token, row.ymd, row.slug); } catch { /* best effort */ }
  return ok;
}

/** 10-18: a signed-in reader's pending reminders for one matter (days still ahead) */
export function myZeriReminds(email: string, slug: string, now = Date.now()): string[] {
  ensure();
  return (db().prepare("SELECT DISTINCT ymd FROM zeri_reminds WHERE email = ? AND slug = ? AND ymd > ? AND sent_at IS NULL AND cancelled_at IS NULL ORDER BY ymd").all(email, slug, homeDay(now)) as { ymd: string }[]).map((r) => r.ymd);
}

/** 10-18: a signed-in reader takes a reminder back from the page */
export function cancelMyZeriRemind(email: string, ymd: string, slug: string, now = Date.now()): boolean {
  ensure();
  const toks = (db().prepare("SELECT token FROM zeri_reminds WHERE email = ? AND ymd = ? AND slug = ? AND sent_at IS NULL AND cancelled_at IS NULL").all(email, ymd, slug) as { token: string }[]).map((r) => r.token);
  const ok = Number((db().prepare("UPDATE zeri_reminds SET cancelled_at = ? WHERE email = ? AND ymd = ? AND slug = ? AND sent_at IS NULL AND cancelled_at IS NULL").run(now, email, ymd, slug) as { changes?: number | bigint }).changes ?? 0) > 0;
  for (const t of toks) try { cancelZeriRevisit(t, ymd, slug); } catch { /* best effort */ }
  return ok;
}

/** 10-18: the note sent as soon as a reminder is set (only for a new one, not a repeat tap) */
export async function sendZeriSetNote(site: string, i: { email: string; ymd: string; slug: string; token: string }, now = Date.now()): Promise<boolean> {
  const m = matterBySlug(i.slug), p = parseYmd(i.ymd);
  if (!m || !p) return false;
  const d = huangliDay(p.y, p.m, p.d);
  const eve = homeDay(Date.UTC(p.y, p.m - 1, p.d) - 86_400_000 + 12 * 3_600_000);
  const sendOn = eve === homeDay(now) ? "今天" : eve === homeDay(now + 86_400_000) ? "明天" : `${+eve.slice(5, 7)}/${+eve.slice(8)}`;
  const { buildZeriSetEmail, sendEmail } = await import("@/lib/email");
  const mail = buildZeriSetEmail({ matter: m.tw, date: `${p.m}/${p.d}`, lunar: `${term(d.lunar.month)}${term(d.lunar.day)}`, sendOn, dayUrl: `${site}/zh-hant/huangli/${i.ymd}`, cancelUrl: `${site}/api/zeri/remind?cancel=${i.token}` });
  const r = await sendEmail(i.email, mail.subject, mail.html, mail.text, { kind: "zeri", sessionId: `zeri-set:${i.token}` }).catch(() => ({ ok: false }));
  return r.ok;
}

/** the letters due: tomorrow's days, sent from 09:00 Taipei */
export async function runZeriReminds(site: string, now = Date.now()): Promise<{ sent: number; failed: number }> {
  ensure();
  if (!letterOn("zeri")) return { sent: 0, failed: 0 }; // 10-23 进度表 108
  const taipeiHour = new Date(now + 8 * 3_600_000).getUTCHours();
  if (taipeiHour < 9) return { sent: 0, failed: 0 };
  const tomorrow = homeDay(now + 86_400_000);
  const rows = db().prepare("SELECT * FROM zeri_reminds WHERE ymd = ? AND sent_at IS NULL AND cancelled_at IS NULL LIMIT 200").all(tomorrow) as { token: string; email: string; ymd: string; slug: string; locale: string }[];
  if (!rows.length) return { sent: 0, failed: 0 };
  const { buildZeriRemindEmail, sendEmail } = await import("@/lib/email");
  let sent = 0, failed = 0;
  for (const r of rows) {
    const claimed = Number((db().prepare("UPDATE zeri_reminds SET sent_at = ? WHERE token = ? AND sent_at IS NULL").run(now, r.token) as { changes?: number | bigint }).changes ?? 0);
    if (!claimed) continue;
    const m = matterBySlug(r.slug); const p = parseYmd(r.ymd);
    if (!m || !p) continue;
    const d = huangliDay(p.y, p.m, p.d);
    const mail = buildZeriRemindEmail({
      matter: m.tw, date: `${p.m}/${p.d}`, lunar: `${term(d.lunar.month)}${term(d.lunar.day)}`, yi: d.yi.slice(0, 4).map((k) => term(k)).join("、") || "—",
      dayUrl: `${site}/${r.locale}/huangli/${r.ymd}`, castUrl: `${site}/${r.locale}/cast?c=zeri`, cancelUrl: `${site}/api/zeri/remind?cancel=${r.token}`,
    });
    const res = await sendEmail(r.email, mail.subject, mail.html, mail.text, { kind: "zeri", sessionId: `zeri:${r.token}` }).catch(() => ({ ok: false }));
    if (res.ok) sent++; else failed++;
  }
  if (sent || failed) recordOps("zeri_remind", `sent ${sent} failed ${failed}`);
  return { sent, failed };
}
