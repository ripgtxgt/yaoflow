import { customerLocaleById, db, recordOps } from "./db";
import { letterOn } from "./letter-switch";
import { bulkHeaders, type InboxRow } from "./inbound";
import { toHant } from "./hant";

/**
 * 10-23 进度表 111 ② 客服回执 (Neil: 「……客服回执等」): a reader who writes to support@ hears, within the minute, that the
 * letter arrived — until now nothing came back until a person answered (the desk is in dry mode: 31 letters answered by
 * hand in the 30 days to 10-23). It says only that: received, we will answer, no need to send it again. Nothing about
 * a reading, a refund or a date.
 *
 * Not sent: to a directory / newsletter (kind vendor) or any bulk or automatic sender; to our own addresses; to someone
 * we wrote to in the last two days (they are mid-conversation); to a letter that needs no answer (a thank-you, a reply to
 * a revisit letter — the desk's classes A and E); more than once a day to the same address; when the desk itself
 * answers (SUPPORT_AUTO=on and an automatic reply goes out). Switch: support_ack on /admin/letters.
 */

const DAY = 86_400_000;
const OURS = /@(yaoflow\.com|linedo\.io)$/i;
const ROBOT = /^(no-?reply|do-?not-?reply|mailer-daemon|postmaster|bounces?|notifications?|alerts?)([+.@-]|$)/i;

export type AckLang = "zh-hant" | "zh" | "en";

/** the reader's language: their account's, else what the letter is written in */
export function ackLanguage(row: Pick<InboxRow, "customer_id" | "subject" | "text">): AckLang {
  const l = row.customer_id ? customerLocaleById(row.customer_id) : null;
  if (l === "zh" || l === "zh-hant") return l;
  const words = `${row.subject ?? ""}\n${row.text ?? ""}`.slice(0, 4000);
  // Chinese (no kana, no hangul): Simplified only when it has a character Traditional writes differently — most readers write 繁體
  if (/[㐀-鿿]/.test(words) && !/[぀-ヿ가-힯]/.test(words)) return toHant(words) !== words ? "zh" : "zh-hant";
  return "en";
}

export function ackText(lang: AckLang): string {
  if (lang === "zh-hant") return "您好，\n\n這封是自動回覆：您的來信我們收到了，會盡快回覆您。\n\n不用再寄一次，我們會照這一封處理；有要補充的，直接回這封信就好。\n\n爻流 YaoFlow 客服";
  if (lang === "zh") return "您好，\n\n这封是自动回复：您的来信我们收到了，会尽快回复您。\n\n不用再寄一次，我们会照这一封处理；有要补充的，直接回这封信就好。\n\n爻流 YaoFlow 客服";
  return "Hello,\n\nThis is an automatic reply to let you know your message has reached us. We'll answer as soon as we can.\n\nNo need to send it again; if you'd like to add anything, just reply to this email.\n\nYaoFlow Support";
}

/** exported for the tests: why this letter gets no receipt, or null when it does */
export function ackSkipReason(row: Pick<InboxRow, "from_addr" | "kind">, headers: Record<string, unknown> | null | undefined, now = Date.now()): string | null {
  const addr = (row.from_addr ?? "").trim().toLowerCase();
  if (!addr.includes("@")) return "no address";
  if (row.kind === "vendor") return "vendor";
  if (OURS.test(addr)) return "ours";
  if (ROBOT.test(addr.split("@")[0]! + "@")) return "robot";
  if (bulkHeaders(headers)) return "bulk";
  const wrote = db().prepare("SELECT 1 FROM mail_log WHERE lower(email) = ? AND kind IN ('support','support_auto','support_manual','support_reply','support_comp','support_revisit') AND created_at > ? LIMIT 1").get(addr, now - 2 * DAY);
  if (wrote) return "mid-conversation";
  return null;
}

/**
 * Send the receipt, at most once a day per address. `send` is the desk's own threaded reply (lib/support-auto
 * sendReaderReply), passed in so this file does not pull the desk in.
 */
export async function sendSupportAck(
  row: InboxRow,
  send: (row: InboxRow, text: string, kind: "support_ack") => Promise<{ ok: boolean; id?: string; error?: string }>,
  headers?: Record<string, unknown> | null,
  now = Date.now(),
): Promise<"sent" | "off" | "skipped" | "already" | "failed"> {
  if (!letterOn("support_ack")) return "off";
  const why = ackSkipReason(row, headers, now);
  if (why) { recordOps("support_ack", `${row.id.slice(0, 8)} skipped: ${why}`); return "skipped"; }
  const addr = row.from_addr.trim().toLowerCase();
  // one a day per address: the claim is taken again only once the last one is a day old
  const claim = db().prepare("INSERT INTO emails (session_id, kind, email, sent_at, status, detail) VALUES (?, 'support_ack', ?, ?, 'sending', ?) ON CONFLICT(session_id, kind) DO UPDATE SET sent_at = excluded.sent_at, status = 'sending', detail = excluded.detail WHERE emails.sent_at < ? OR emails.status = 'failed'")
    .run(`support-ack:${addr}`, addr, now, row.id, now - DAY) as unknown as { changes?: number };
  if (!Number(claim.changes ?? 0)) return "already";
  const r = await send(row, ackText(ackLanguage(row)), "support_ack").catch((e) => ({ ok: false, error: e instanceof Error ? e.message : "?" } as { ok: boolean; id?: string; error?: string }));
  db().prepare("UPDATE emails SET status = ?, detail = ? WHERE session_id = ? AND kind = 'support_ack'").run(r.ok ? "sent" : "failed", `${row.id} ${r.ok ? r.id ?? "" : r.error ?? ""}`.slice(0, 300), `support-ack:${addr}`);
  recordOps("support_ack", `${row.id.slice(0, 8)} ${r.ok ? "sent" : "failed: " + (r.error ?? "?").slice(0, 80)}`);
  return r.ok ? "sent" : "failed";
}
