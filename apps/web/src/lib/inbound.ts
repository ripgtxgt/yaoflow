import { customerIdByEmail, db, recordOps } from "./db";
import { ownerRecipients } from "./email";

/**
 * 客服来信 (09-29, Neil: 「为什么用户发给 support 的邮件经转发会在 neil@linedo.io 邮箱的垃圾箱里面……
 * 你看看有什么解决方案能让我第一时间看到邮件」→「resend 那边不能直接收邮件吗？」→「要，你开始做吧」).
 *
 * Mail to any @yaoflow.com address now lands at Resend (MX), which tells us through the same signed
 * webhook as the delivery events (`email.received`). For each one we:
 *   1. fetch the full message (the webhook carries only metadata) and keep it — /admin/inbox, with the
 *      unanswered ones counted on the dashboard, so a letter never depends on anyone's spam filter;
 *   2. forward it to the owners from support@yaoflow.com — our own authenticated domain, the same road the
 *      daily reports take into the inbox — with Reply-To set to the reader, so "reply" answers them.
 * Resend keeps every received mail even if we are down, and the webhook retries until it gets a 2xx.
 */

const API = "https://api.resend.com";

/**
 * What each address does — the same six that Cloudflare Email Routing had (09-29 audit):
 *   support@            → kept as a 客服来信 + forwarded to the owners
 *   note@ hn@ ig@ jp@ x@ → sign-up addresses of the promotion accounts (verification codes): forwarded to Neil only
 *   anything else        → dropped, as the old catch-all did (logged)
 * SUPPORT_ALIASES / RELAY_ALIASES in .env.local override the lists without a redeploy.
 */
const list = (v: string | undefined, d: string) => (v ?? d).split(/[,\s]+/).map((x) => x.trim().toLowerCase()).filter(Boolean);
export const supportAliases = () => list(process.env.SUPPORT_ALIASES, "support");
export const relayAliases = () => list(process.env.RELAY_ALIASES, "note,hn,ig,jp,x");
export const RELAY_TO = () => list(process.env.RELAY_TO, "neil@linedo.io");
export function routeFor(to: string[]): "support" | "relay" | "drop" {
  const locals = to.map((a) => parseFrom(a).addr).filter((a) => a.endsWith("@yaoflow.com")).map((a) => a.split("@")[0]!);
  if (locals.some((l) => supportAliases().includes(l))) return "support";
  if (locals.some((l) => relayAliases().includes(l))) return "relay";
  return "drop";
}
const key = () => process.env.RESEND_API_KEY ?? "";
const site = () => (process.env.SITE_URL ?? "https://yaoflow.com").replace(/\/$/, "");

/**
 * 10-23 进度表 100 (Neil: 「要」): since the 10-19 directory submissions (外链总表.csv, all made with support@) the inbox
 * fills with their confirmations, verification codes, newsletters and upsells — 25 of 53 letters by 10-22, every one a
 * 「客服来信」 that the desk then had to read and set aside (and once drafted a reply to a robot). A letter is NOT a
 * reader's (`kind = vendor`) when all three hold:
 *   1. the sender is not one of our customers;
 *   2. neither subject nor body is written in Chinese, Japanese or Korean (our readers write in those first);
 *   3. it is bulk mail (List-Unsubscribe, List-Id, Precedence: bulk, a bulk sender's Feedback-ID …) or it comes from a
 *      directory we submitted to (the list below; VENDOR_DOMAINS in .env.local adds more without a deploy).
 * Such a letter is still kept and still forwarded — its subject says 「[非读者]」 — but the support desk does not read
 * it, it is folded under 「其他」 on /admin/inbox, and it does not count as unanswered. Nothing is deleted or bounced.
 */
export const DIRECTORY_DOMAINS: readonly string[] = [
  // where the 10-19→ submissions went (外链总表.csv directory_url)
  "aiforme.wiki", "ailib.ai", "aipulse.fyi", "aisocialtools.co", "aitogrow.com", "aitoolsdirectory.com", "aitoolsup.com", "alternativeto.net",
  "10words.io", "awesomeindie.com", "bestofai.io", "bufferapps.com", "businesstoolvault.com", "capterra.com", "ctrlalt.cc", "curlie.org", "dev.to",
  "easywithai.com", "ebool.com", "f6s.com", "feedmystartup.com", "firsto.co", "futuretools.io", "g2.com", "getmakerlog.com", "getworm.com",
  "dodopayments.com", "indiehackers.com", "indiemaker.co", "indiemaker.com", "insidr.ai", "land-book.com", "ignlab.net", "launching.today",
  "launchingnext.com", "magicbox.tools", "microlaunch.net", "neilpatel.com", "nextaitool.com", "open-launch.com", "orbic.ai", "paggu.com",
  "peerlist.io", "peerpush.com", "pitchwall.co", "producthunt.com", "saasbaba.com", "saashub.com", "saaspa.ge", "saasyboard.com",
  "shareyourstartup.com", "sideprojectors.com", "sitelike.org", "softwaresuggest.com", "stackviv.ai", "startupbase.io", "startupbuffer.com",
  "startupdope.com", "startupguys.net", "startuplist.ing", "startupranking.com", "startups.fyi", "startups.gallery", "startupslab.site",
  "startupstash.com", "submitmysaas.com", "taalk.com", "techpluto.com", "thehackstack.com", "therundown.ai", "thestartupinc.com",
  "tinystartups.com", "tipseason.com", "toolai.io", "tooltrove.net", "toplistly.com", "uneed.best", "victrays.com", "webdesignernews.com",
  "websitehunt.co", "whattheai.tech", "youmightnotneed.co", "zearches.com",
  // the addresses they actually write from (support_inbox 10-19→22)
  "celikovic.xyz", "paperform.co", "beehiiv.com",
];
const vendorDomains = (): string[] => [...DIRECTORY_DOMAINS, ...list(process.env.VENDOR_DOMAINS, "")];
const CJK = /[぀-ヿ㐀-鿿豈-﫿가-힯]/;

/** bulk mail by its headers (Resend's received-mail header map, names lower-cased; it files List-Unsubscribe as `list`) */
export function bulkHeaders(headers: Record<string, unknown> | null | undefined): boolean {
  if (!headers) return false;
  const h = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), String(v ?? "").toLowerCase()]));
  if (["list-unsubscribe", "list-unsubscribe-post", "list-id", "x-list-id", "list", "feedback-id", "x-campaign", "x-campaign-id", "x-mc-user", "x-mailgun-tag", "x-sg-id", "x-sg-eid"].some((k) => k in h)) return true;
  if (Object.keys(h).some((k) => k.startsWith("x-beehiiv-") || k.startsWith("x-mailchimp-"))) return true;
  if (/^(bulk|list|junk)$/.test((h.precedence ?? "").trim())) return true;
  const auto = (h["auto-submitted"] ?? "").trim();
  return !!auto && auto !== "no";
}

export function directoryDomain(addr: string): boolean {
  const dom = (addr.split("@")[1] ?? "").toLowerCase();
  return !!dom && vendorDomains().some((d) => dom === d || dom.endsWith(`.${d}`));
}

/** the verdict above, pure — the webhook, the backfill and the tests use the same one */
export function isVendorLetter(i: { customerId: number | null; fromAddr: string; subject: string | null; text: string | null; html?: string | null; headers?: Record<string, unknown> | null }): boolean {
  if (i.customerId) return false;
  const words = `${i.subject ?? ""}\n${i.text ?? (i.html ?? "").replace(/<[^>]+>/g, " ")}`;
  if (CJK.test(words)) return false;
  return bulkHeaders(i.headers) || directoryDomain(i.fromAddr);
}

export function ensureInboxTable(): void {
  db().exec(`CREATE TABLE IF NOT EXISTS support_inbox (
      id              TEXT PRIMARY KEY,
      received_at     INTEGER NOT NULL,
      from_addr       TEXT NOT NULL,
      from_name       TEXT,
      to_addrs        TEXT,
      subject         TEXT,
      text            TEXT,
      html            TEXT,
      auth            TEXT,
      attachments     TEXT,
      customer_id     INTEGER,
      forwarded_at    INTEGER,
      forward_error   TEXT,
      handled_at      INTEGER,
      note            TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_support_inbox_open ON support_inbox(handled_at, received_at);`);
  // 10-23 进度表 100: who the letter is from — null a reader (or anyone we cannot tell), 'vendor' a directory / bulk sender.
  // The first time the column appears, the letters already kept are judged by what we stored (no headers then).
  const cols = new Set((db().prepare("PRAGMA table_info(support_inbox)").all() as { name: string }[]).map((c) => c.name));
  if (!cols.has("kind")) {
    db().exec("ALTER TABLE support_inbox ADD COLUMN kind TEXT");
    const old = db().prepare("SELECT id, from_addr, subject, text, html, customer_id FROM support_inbox WHERE customer_id IS NULL").all() as { id: string; from_addr: string; subject: string | null; text: string | null; html: string | null; customer_id: number | null }[];
    const set = db().prepare("UPDATE support_inbox SET kind = 'vendor' WHERE id = ?");
    let n = 0;
    for (const r of old) if (isVendorLetter({ customerId: r.customer_id, fromAddr: r.from_addr, subject: r.subject, text: r.text, html: r.html })) { set.run(r.id); n += 1; }
    if (n) recordOps("support_vendor_backfill", `${n} of ${old.length} letters from non-customers judged vendor`);
  }
}

export interface InboxRow {
  id: string; received_at: number; from_addr: string; from_name: string | null; to_addrs: string | null; subject: string | null;
  text: string | null; html: string | null; auth: string | null; attachments: string | null; customer_id: number | null;
  forwarded_at: number | null; forward_error: string | null; handled_at: number | null; note: string | null;
  /** 10-23 进度表 100: 'vendor' — a directory or bulk sender, not a reader */
  kind?: string | null;
}

interface Received {
  id: string; from: string; to?: string[]; subject?: string | null; html?: string | null; text?: string | null;
  created_at?: string; headers?: Record<string, string>; authentication?: { spf?: string; dkim?: string; dmarc?: string } | null;
  attachments?: { id: string; filename?: string; content_type?: string; size?: number }[];
}

async function api<T>(path: string): Promise<T> {
  const r = await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${key()}` }, signal: AbortSignal.timeout(20_000) });
  if (!r.ok) throw new Error(`resend ${path.split("?")[0]} ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return (await r.json()) as T;
}

/** "Sarah Li <someone@hotmail.com>" → { addr, name } */
export function parseFrom(raw: string): { addr: string; name: string | null } {
  const m = raw.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
  if (m) return { addr: m[2]!.trim().toLowerCase(), name: m[1]!.trim() || null };
  return { addr: raw.trim().toLowerCase(), name: null };
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));

/** The letter the owners get: who wrote, to which address, whether it passed SPF/DKIM/DMARC, who they are to us, then the letter itself. */
export function forwardBody(row: InboxRow): { subject: string; html: string; text: string } {
  const who = row.from_name ? `${row.from_name} <${row.from_addr}>` : row.from_addr;
  const auth = row.auth ? (JSON.parse(row.auth) as Record<string, string>) : null;
  const authLine = auth ? `SPF ${auth.spf ?? "?"} · DKIM ${auth.dkim ?? "?"} · DMARC ${auth.dmarc ?? "?"}` : "";
  const cust = row.customer_id ? `${site()}/admin/customers/${row.customer_id}` : null;
  const when = new Date(row.received_at + 8 * 3_600_000).toISOString().slice(0, 16).replace("T", " ");
  const atts = row.attachments ? (JSON.parse(row.attachments) as { filename?: string }[]) : [];
  const head = [
    `发件人：${who}`,
    `收件地址：${row.to_addrs ?? ""}`,
    `时间：${when}（台北）`,
    cust ? `客户：#${row.customer_id} ${cust}` : "客户：系统里没有这个邮箱（可能用别的邮箱付的款）",
    ...(authLine ? [`验证：${authLine}`] : []),
    ...(atts.length ? [`附件：${atts.map((a) => a.filename ?? "?").join("、")}（见本信附件）`] : []),
    `后台：${site()}/admin/inbox`,
    "直接点「回复」就是回给读者。",
  ];
  const original = row.html ?? (row.text ? `<pre style="white-space:pre-wrap;font-family:inherit;">${esc(row.text)}</pre>` : "<p>(无正文)</p>");
  const html = `<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:0;padding:0;font-family:-apple-system,'Segoe UI','PingFang TC','Microsoft JhengHei',sans-serif;">
<div style="max-width:680px;margin:0 auto;padding:20px;">
<div style="background:#f4f2ec;border:1px solid #d0cfcb;border-radius:4px;padding:12px 16px;font-size:13px;line-height:1.7;color:#333439;">${head.map((l) => esc(l)).join("<br>")}</div>
<div style="padding:18px 4px;">${original}</div>
</div></body></html>`;
  const text = [...head, "", "———", "", row.text ?? "(无正文，见 HTML)"].join("\n");
  // 10-23 进度表 100: a directory / bulk sender's letter still reaches the owners (verification codes live there), marked
  return { subject: `${row.kind === "vendor" ? "[非读者]" : "[客服来信]"} ${row.subject ?? "(无标题)"}`, html, text };
}

async function forward(row: InboxRow): Promise<string | null> {
  const m = forwardBody(row);
  // attachments travel as the temporary download URLs Resend hands out (Resend fetches them when sending)
  // (inline images keep their cid: references in the kept HTML, so they ride along with their content_id)
  let attachments: { filename: string; path: string; content_id?: string }[] = [];
  try {
    const list = await api<{ data: { filename?: string; download_url: string; size?: number; content_id?: string | null }[] }>(`/emails/receiving/${row.id}/attachments`);
    attachments = list.data.filter((a) => (a.size ?? 0) < 15_000_000)
      .map((a) => ({ filename: a.filename ?? "attachment", path: a.download_url, ...(a.content_id ? { content_id: a.content_id } : {}) }));
  } catch { /* no attachments or not listed: the letter still goes */ }
  const from = process.env.SUPPORT_FROM ?? "YaoFlow 客服 <support@yaoflow.com>";
  const r = await fetch(`${API}/emails`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key()}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from, to: ownerRecipients(), reply_to: [row.from_addr], subject: m.subject, html: m.html, text: m.text,
      ...(attachments.length ? { attachments } : {}),
      tags: [{ name: "kind", value: "support_forward" }],
    }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!r.ok) return `${r.status} ${(await r.text()).slice(0, 200)}`;
  return null;
}

/** A promotion account's mail (verification codes and the like): straight on to Neil, nothing kept. */
async function relay(e: Received): Promise<string | null> {
  const f = parseFrom(e.headers?.from ?? e.from);
  const to = (e.to ?? []).join(", ");
  const note = `<p style="font-size:12px;color:#606063;margin:0 0 12px;">转自 ${esc(to)} · 发件人 ${esc(f.name ? `${f.name} <${f.addr}>` : f.addr)}</p>`;
  let attachments: { filename: string; path: string; content_id?: string }[] = [];
  try {
    const l = await api<{ data: { filename?: string; download_url: string; size?: number; content_id?: string | null }[] }>(`/emails/receiving/${e.id}/attachments`);
    attachments = l.data.filter((a) => (a.size ?? 0) < 15_000_000).map((a) => ({ filename: a.filename ?? "attachment", path: a.download_url, ...(a.content_id ? { content_id: a.content_id } : {}) }));
  } catch { /* none */ }
  const r = await fetch(`${API}/emails`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key()}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: `YaoFlow 转发 <${(e.to ?? [])[0] && parseFrom((e.to ?? [])[0]!).addr.endsWith("@yaoflow.com") ? parseFrom((e.to ?? [])[0]!).addr : "support@yaoflow.com"}>`,
      to: RELAY_TO(), reply_to: [f.addr], subject: `[${to}] ${e.subject ?? "(无标题)"}`,
      html: `<!doctype html><html><head><meta charset="utf-8"></head><body>${note}${e.html ?? (e.text ? `<pre style="white-space:pre-wrap;font-family:inherit;">${esc(e.text)}</pre>` : "")}</body></html>`,
      text: `转自 ${to} · 发件人 ${f.addr}\n\n${e.text ?? ""}`,
      ...(attachments.length ? { attachments } : {}),
      tags: [{ name: "kind", value: "relay_forward" }],
    }),
    signal: AbortSignal.timeout(30_000),
  });
  return r.ok ? null : `${r.status} ${(await r.text()).slice(0, 200)}`;
}

/** Idempotent per received email: a retried webhook, or the sweep, finds it already kept and forwarded. */
export async function handleReceived(emailId: string): Promise<"kept" | "known" | "error"> {
  ensureInboxTable();
  const d = db();
  const have = d.prepare("SELECT * FROM support_inbox WHERE id = ?").get(emailId) as InboxRow | undefined;
  if (have?.forwarded_at) return "known";
  try {
    let row = have;
    let freshHeaders: Record<string, unknown> | null | undefined;
    if (!row) {
      const e = await api<Received>(`/emails/receiving/${encodeURIComponent(emailId)}?html_format=cid`);
      const route = routeFor(e.to ?? []);
      if (route !== "support") {
        // relays are claimed once through ops_events so a retried webhook does not forward twice
        const done = d.prepare("SELECT 1 FROM ops_events WHERE kind = 'mail_relay' AND detail LIKE ?").get(`${emailId}%`);
        if (done) return "known";
        if (route === "drop") { recordOps("mail_relay", `${emailId} dropped (${(e.to ?? []).join(",")})`); return "kept"; }
        const err = await relay(e);
        if (err) { recordOps("mail_relay_fail", `${emailId}: ${err}`); return "error"; }
        recordOps("mail_relay", `${emailId} → ${(e.to ?? []).join(",")}`);
        return "kept";
      }
      const f = parseFrom(e.headers?.from ?? e.from);
      const at = e.created_at ? Date.parse(e.created_at) : Date.now();
      const cid = customerIdByEmail(f.addr);
      // 10-23 进度表 100: a directory / bulk sender is kept and forwarded, but not as a reader's letter
      const vendor = isVendorLetter({ customerId: cid, fromAddr: f.addr, subject: e.subject ?? null, text: e.text ?? null, html: e.html ?? null, headers: e.headers ?? null });
      d.prepare(
        `INSERT OR IGNORE INTO support_inbox (id, received_at, from_addr, from_name, to_addrs, subject, text, html, auth, attachments, customer_id, kind)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      ).run(e.id, Number.isFinite(at) ? at : Date.now(), f.addr, f.name, (e.to ?? []).join(", "), e.subject ?? null,
        e.text ? e.text.slice(0, 100_000) : null, e.html ? e.html.slice(0, 400_000) : null,
        e.authentication ? JSON.stringify(e.authentication) : null,
        e.attachments?.length ? JSON.stringify(e.attachments.map((a) => ({ filename: a.filename, content_type: a.content_type, size: a.size }))) : null,
        cid, vendor ? "vendor" : null);
      row = d.prepare("SELECT * FROM support_inbox WHERE id = ?").get(e.id) as unknown as InboxRow;
      freshHeaders = e.headers ?? null;
      recordOps("support_in", `${f.addr.replace(/^(.).*@/, "$1…@")} → ${(e.to ?? []).join(",")}${vendor ? " vendor" : ""}`);
    }
    const err = await forward(row!);
    d.prepare("UPDATE support_inbox SET forwarded_at = ?, forward_error = ? WHERE id = ?").run(err ? null : Date.now(), err, row!.id);
    if (err) recordOps("support_forward_fail", `${row!.id}: ${err}`);
    // 10-23 进度表 111 ②: with the desk off nobody reads it right away — the reader hears it arrived (lib/support-ack.ts).
    // With the desk on or dry, the desk sends it once it has read the letter (not to a thank-you or a revisit reply).
    if (freshHeaders !== undefined) {
      try {
        const { supportAutoMode, sendReaderReply } = await import("./support-auto");
        if (supportAutoMode() === "off") await (await import("./support-ack")).sendSupportAck(row!, sendReaderReply, freshHeaders);
      } catch (e) { recordOps("support_ack", `${row!.id.slice(0, 8)} failed: ${e instanceof Error ? e.message.slice(0, 120) : "?"}`); }
    }
    return "kept";
  } catch (e) {
    recordOps("support_in_fail", `${emailId}: ${e instanceof Error ? e.message.slice(0, 200) : "?"}`);
    return "error";
  }
}

/** Letters kept but not forwarded (a send that failed) get another try from the cron. */
export async function retryUnforwarded(): Promise<number> {
  ensureInboxTable();
  const rows = db().prepare("SELECT id FROM support_inbox WHERE forwarded_at IS NULL AND received_at > ?").all(Date.now() - 3 * 86_400_000) as { id: string }[];
  let n = 0;
  for (const r of rows) if ((await handleReceived(r.id)) === "kept") n += 1;
  return n;
}

export function inboxList(limit = 100): InboxRow[] {
  ensureInboxTable();
  return db().prepare("SELECT * FROM support_inbox ORDER BY (handled_at IS NULL) DESC, received_at DESC LIMIT ?").all(limit) as unknown as InboxRow[];
}
/** unanswered READERS' letters — a directory's or a newsletter's (kind vendor) never waits for an answer (10-23 进度表 100) */
export function inboxOpenCount(): number {
  ensureInboxTable();
  return (db().prepare("SELECT COUNT(*) AS n FROM support_inbox WHERE handled_at IS NULL AND kind IS NOT 'vendor'").get() as { n: number }).n;
}
export function inboxOldestOpen(): number | null {
  ensureInboxTable();
  return (db().prepare("SELECT MIN(received_at) AS t FROM support_inbox WHERE handled_at IS NULL AND kind IS NOT 'vendor'").get() as { t: number | null }).t;
}
export function inboxMark(id: string, handled: boolean, note?: string | null): void {
  ensureInboxTable();
  db().prepare("UPDATE support_inbox SET handled_at = ?, note = COALESCE(?, note) WHERE id = ?").run(handled ? Date.now() : null, note ?? null, id);
}
export function inboxGet(id: string): InboxRow | null {
  ensureInboxTable();
  return (db().prepare("SELECT * FROM support_inbox WHERE id = ?").get(id) ?? null) as InboxRow | null;
}
