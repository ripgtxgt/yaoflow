import { afterEach, describe, expect, it, vi } from "vitest";
import { createHmac, randomBytes } from "node:crypto";
// DATA_DIR is a fresh temp dir (test/setup.ts)
import { applyMailEvent, claimMailEvent, logMailSent, mailStats, mailsForCustomer, upsertCustomer } from "../src/lib/db";
import { parseMailEvent, verifySvix } from "../src/lib/resend-webhook";
import { sendEmail } from "../src/lib/email";

/** 邮件追踪 (09-11): what Resend tells us about each mail, folded into mail_log; nothing else kept. */

const SECRET = `whsec_${randomBytes(24).toString("base64")}`;
function sign(payload: string, id = "msg_1", ts = Math.floor(Date.now() / 1000)) {
  const key = Buffer.from(SECRET.slice(6), "base64");
  const sig = createHmac("sha256", key).update(`${id}.${ts}.${payload}`).digest("base64");
  return { id, timestamp: String(ts), signature: `v1,${sig}` };
}

function event(type: string, emailId: string, extra: Record<string, unknown> = {}, tags: unknown = { kind: "reading" }) {
  return {
    type,
    created_at: new Date().toISOString(),
    data: { email_id: emailId, from: "YaoFlow <noreply@yaoflow.com>", to: ["Someone@Example.com"], subject: "Hello", tags, ...extra },
  };
}

describe("Svix signature", () => {
  it("accepts a correctly signed body and rejects tampering, stale timestamps and missing headers", () => {
    const payload = JSON.stringify(event("email.delivered", "em_sig"));
    const h = sign(payload);
    expect(verifySvix(payload, h, SECRET)).toBe(true);
    expect(verifySvix(payload + " ", h, SECRET)).toBe(false);
    expect(verifySvix(payload, { ...h, signature: "v1,AAAA" }, SECRET)).toBe(false);
    expect(verifySvix(payload, { ...h, signature: null }, SECRET)).toBe(false);
    expect(verifySvix(payload, sign(payload, "msg_old", Math.floor(Date.now() / 1000) - 600), SECRET)).toBe(false);
    expect(verifySvix(payload, h, `whsec_${randomBytes(24).toString("base64")}`)).toBe(false);
  });

  it("walks a multi-signature header and ignores unknown versions", () => {
    const payload = "{}";
    const h = sign(payload);
    expect(verifySvix(payload, { ...h, signature: `v1a,zzzz ${h.signature}` }, SECRET)).toBe(true);
    expect(verifySvix(payload, { ...h, signature: "v1a,zzzz" }, SECRET)).toBe(false);
  });
});

describe("event parsing", () => {
  it("keeps only what the log needs, reading the kind tag in either shape", () => {
    const a = parseMailEvent(event("email.opened", "em_1"));
    expect(a).toMatchObject({ type: "email.opened", emailId: "em_1", to: "Someone@Example.com", subject: "Hello", kind: "reading", note: null });
    const b = parseMailEvent(event("email.opened", "em_2", {}, [{ name: "kind", value: "login" }]));
    expect(b?.kind).toBe("login");
    const c = parseMailEvent(event("email.bounced", "em_3", { bounce: { type: "Permanent", subType: "Suppressed", message: "on the suppression list" } }, null));
    expect(c?.kind).toBeNull();
    expect(c?.note).toBe("Permanent · Suppressed · on the suppression list");
    expect(parseMailEvent({ type: "domain.updated", created_at: "", data: { id: "x" } })).toBeNull();
    expect(parseMailEvent({ type: "email.sent", data: {} })).toBeNull();
    expect(parseMailEvent("nope")).toBeNull();
  });
});

describe("mail_log", () => {
  it("logs a send, folds delivered/opened into the row, counts opens, and answers the customer page", () => {
    const cid = upsertCustomer("Reader@Example.com", "zh");
    logMailSent({ id: "em_a", kind: "reading", email: "Reader@Example.com", subject: "你的解读", sessionId: "cs_1", customerId: cid });
    const t0 = Date.now();
    expect(applyMailEvent({ type: "email.sent", emailId: "em_a", at: t0, to: null, subject: null, kind: null })).toBe("applied");
    expect(applyMailEvent({ type: "email.delivered", emailId: "em_a", at: t0 + 1000, to: null, subject: null, kind: null })).toBe("applied");
    expect(applyMailEvent({ type: "email.opened", emailId: "em_a", at: t0 + 5000, to: null, subject: null, kind: null })).toBe("applied");
    expect(applyMailEvent({ type: "email.opened", emailId: "em_a", at: t0 + 9000, to: null, subject: null, kind: null })).toBe("applied");
    expect(applyMailEvent({ type: "email.clicked", emailId: "em_a", at: t0 + 9500, to: null, subject: null, kind: null })).toBe("ignored");

    const rows = mailsForCustomer(cid, "reader@example.com");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: "em_a", kind: "reading", subject: "你的解读", delivered_at: t0 + 1000, opened_at: t0 + 5000, opens: 2, bounced_at: null });
  });

  it("creates the row from the event when the send was never logged (Gmail via Resend SMTP), kind from the tag or 'other'", () => {
    applyMailEvent({ type: "email.delivered", emailId: "em_smtp", at: Date.now(), to: "Cust@Example.com", subject: "Re: 关于退款", kind: null });
    applyMailEvent({ type: "email.bounced", emailId: "em_tag", at: Date.now(), to: "gone@example.com", subject: "x", kind: "login", note: "Permanent · General" });
    const cid = upsertCustomer("cust@example.com", "zh");
    const rows = mailsForCustomer(cid, "cust@example.com");
    expect(rows.map((r) => r.kind)).toEqual(["other"]);
    expect(rows[0]!.delivered_at).not.toBeNull();
    // a send logged after its first event keeps the event's timestamps and takes the send's kind/session
    logMailSent({ id: "em_smtp", kind: "refund", email: "cust@example.com", subject: "退款通知", sessionId: "cs_r" });
    const again = mailsForCustomer(cid, "cust@example.com");
    expect(again[0]).toMatchObject({ kind: "refund", subject: "退款通知" });
    expect(again[0]!.delivered_at).not.toBeNull();
  });

  it("applies each Svix delivery once", () => {
    expect(claimMailEvent("svix_1", "em_a", "email.opened", Date.now())).toBe(true);
    expect(claimMailEvent("svix_1", "em_a", "email.opened", Date.now())).toBe(false);
    expect(claimMailEvent("svix_2", "em_a", "email.opened", Date.now())).toBe(true);
  });

  it("summarises the window per kind, lists trouble, and reports the webhook's last sign of life", () => {
    const s = mailStats(Date.now() - 60_000);
    const reading = s.byKind.find((k) => k.kind === "reading");
    expect(reading).toMatchObject({ sent: 1, delivered: 1, opened: 1, bounced: 0 });
    const login = s.byKind.find((k) => k.kind === "login");
    expect(login).toMatchObject({ sent: 1, delivered: 0, bounced: 1 });
    expect(s.total.sent).toBe(s.byKind.reduce((a, k) => a + k.sent, 0));
    expect(s.problems.map((p) => p.what)).toEqual(["bounced"]);
    expect(s.problems[0]).toMatchObject({ kind: "login", email: "gone@example.com", note: "Permanent · General" });
    expect(s.lastEventAt).not.toBeNull();
    expect(mailStats(Date.now() + 60_000).total.sent).toBe(0);
  });
});

describe("sendEmail", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("tags the mail with its kind and logs Resend's id the moment the send is accepted", async () => {
    process.env.RESEND_API_KEY = "re_test";
    const calls: { url: string; body: string }[] = [];
    vi.stubGlobal("fetch", async (url: string, init: { body: string }) => {
      calls.push({ url, body: init.body });
      return new Response(JSON.stringify({ id: "em_sent_1" }), { status: 200, headers: { "content-type": "application/json" } });
    });
    const cid = upsertCustomer("pair@example.com", "en");
    const r = await sendEmail("pair@example.com", "The other side has cast", "<p>hi</p>", "hi", { kind: "pair", sessionId: "cs_p", customerId: cid });
    expect(r).toEqual({ ok: true, id: "em_sent_1" });
    expect(calls[0]!.url).toBe("https://api.resend.com/emails");
    const body = JSON.parse(calls[0]!.body) as { tags: { name: string; value: string }[]; reply_to: string[] };
    expect(body.tags).toEqual([{ name: "kind", value: "pair" }]);
    expect(body.reply_to).toEqual(["support@yaoflow.com"]);
    const rows = mailsForCustomer(cid, "pair@example.com");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: "em_sent_1", kind: "pair", subject: "The other side has cast", delivered_at: null, opens: 0 });
  });

  it("logs nothing when Resend refuses the send", async () => {
    process.env.RESEND_API_KEY = "re_test";
    vi.stubGlobal("fetch", async () => new Response("nope", { status: 422 }));
    const cid = upsertCustomer("refused@example.com", "en");
    const r = await sendEmail("refused@example.com", "x", "<p>x</p>", "x", { kind: "login" });
    expect(r.ok).toBe(false);
    expect(mailsForCustomer(cid, "refused@example.com")).toHaveLength(0);
  });
});

/**
 * 09-22 (Neil: 「neil@linedo.io 再加上这个邮箱吧」). Owner mail — the weekly
 * digest and the membership alerts — used to fall back to one hard-coded
 * address, so changing it meant a deploy, and a single inbox means one full
 * mailbox or one spam rule loses every alert.
 */
describe("站长邮件的收件人", () => {
  const withEnv = async (v: string | undefined, fn: (r: string[]) => void) => {
    const { DIGEST_TO } = process.env;
    if (v === undefined) delete process.env.DIGEST_TO; else process.env.DIGEST_TO = v;
    const { ownerRecipients } = await import("../src/lib/email");
    try { fn(ownerRecipients()); } finally { if (DIGEST_TO === undefined) delete process.env.DIGEST_TO; else process.env.DIGEST_TO = DIGEST_TO; }
  };

  it("takes several addresses, comma separated", async () => {
    await withEnv("a@x.com, b@y.io", (r) => expect(r).toEqual(["a@x.com", "b@y.io"]));
  });

  it("trims, lower-cases and de-duplicates", async () => {
    await withEnv(" A@x.com ;a@X.COM , b@y.io ", (r) => expect(r).toEqual(["a@x.com", "b@y.io"]));
  });

  it("drops anything that is not an address rather than sending nowhere", async () => {
    await withEnv("a@x.com, not-an-email, b@y.io", (r) => expect(r).toEqual(["a@x.com", "b@y.io"]));
  });

  it("never returns empty — an alert with no recipient is worse than a wrong one", async () => {
    await withEnv("nonsense", (r) => expect(r.length).toBe(1));
    await withEnv(undefined, (r) => expect(r.length).toBeGreaterThan(0));
  });
});

describe("10-23 a spam complaint", () => {
  it("is recorded as an unsubscribe, so every optional letter stops — not only the mass letters", async () => {
    process.env.RESEND_WEBHOOK_SECRET = SECRET;
    const { NextRequest } = await import("next/server");
    const { POST } = await import("../src/app/api/resend/webhook/route");
    const { mailOptedOut } = await import("../src/lib/db");
    const post = async (body: unknown, id: string) => {
      const payload = JSON.stringify(body);
      const h = sign(payload, id);
      return POST(new NextRequest("http://localhost/api/resend/webhook", { method: "POST", body: payload, headers: { "svix-id": h.id, "svix-timestamp": h.timestamp, "svix-signature": h.signature } }));
    };
    logMailSent({ id: "em_spam_1", kind: "reading", email: "spam-reader@example.com", subject: "x" });
    expect(mailOptedOut("spam-reader@example.com")).toBe(false);
    // the event's own `to` may be missing: the address is read from the sent letter
    expect((await post(event("email.complained", "em_spam_1", { to: [] }), "msg_spam_1")).status).toBe(200);
    expect(mailOptedOut("spam-reader@example.com")).toBe(true);
    // a bounce is not a complaint: it is skipped by the mass letters, not unsubscribed
    logMailSent({ id: "em_bounce_2", kind: "reading", email: "bounce-reader@example.com", subject: "x" });
    await post(event("email.bounced", "em_bounce_2", { to: ["bounce-reader@example.com"], bounce: { type: "Permanent", subType: "General", message: "no such user" } }), "msg_bounce_2");
    expect(mailOptedOut("bounce-reader@example.com")).toBe(false);
  });
});
