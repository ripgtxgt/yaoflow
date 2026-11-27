import { describe, expect, it } from "vitest";
import { bulkHeaders, directoryDomain, ensureInboxTable, forwardBody, inboxOpenCount, isVendorLetter, type InboxRow } from "../src/lib/inbound";
import { db, upsertCustomer } from "../src/lib/db";

/**
 * 10-23 进度表 100 (Neil: 「要」): directory confirmations, newsletters and upsells sent to support@ are kept and forwarded,
 * but they are not readers' letters — `kind = vendor`: 「[非读者]」 in the forward's subject, never read by the support
 * desk, folded under 「其他」, not counted as unanswered. A reader writing in English is still a reader.
 */
const H_BEEHIIV = { "return-path": "x", "x-ses-receipt": "x", "feedback-id": "a371e3af", list: "<https://x/unsub>", "x-beehiiv-ids": "1", "x-list-id": "07ff" };
const H_PERSONAL = { "return-path": "x", "x-ses-receipt": "x", "x-ses-spam-verdict": "PASS", "received-spf": "pass", "dkim-signature": "x", from: "a", to: "b", subject: "c" };

describe("目录站／营销信判非读者", () => {
  it("the three letters of 10-22 replay as vendor", () => {
    // Share Your Startup (from celikovic.xyz), TipSeason (beehiiv, bulk headers), Startup Buffer (its own domain)
    expect(isVendorLetter({ customerId: null, fromAddr: "shareyourstartup@celikovic.xyz", subject: "YaoFlow is live on Share Your Startup", text: "Congrats! Your startup YaoFlow is now live." })).toBe(true);
    expect(isVendorLetter({ customerId: null, fromAddr: "tipseason@mail.beehiiv.com", subject: "[Final Call] 20% OFF Fast-Track for your AI tool", text: "Last chance to fast-track your listing.", headers: H_BEEHIIV })).toBe(true);
    expect(isVendorLetter({ customerId: null, fromAddr: "hi@startupbuffer.com", subject: "Your listing is invisible. Fix it for 31% off", text: "Upgrade today." })).toBe(true);
    // the same TipSeason letter even without the directory list: its headers are bulk mail
    expect(bulkHeaders(H_BEEHIIV)).toBe(true);
  });

  it("readers stay readers: a customer writing in English, a stranger without bulk headers, anyone writing in Chinese, Japanese or Korean", () => {
    expect(isVendorLetter({ customerId: 42, fromAddr: "someone@startupbuffer.com", subject: "Please confirm my payment", text: "I paid but cannot see my reading.", headers: H_BEEHIIV })).toBe(false);
    expect(isVendorLetter({ customerId: null, fromAddr: "reader@gmail.com", subject: "Refund", text: "I was charged twice, please help.", headers: H_PERSONAL })).toBe(false);
    expect(isVendorLetter({ customerId: null, fromAddr: "hello@sideprojectors.com", subject: "你好", text: "我想問一下付款的事" })).toBe(false);
    expect(isVendorLetter({ customerId: null, fromAddr: "a@peerlist.io", subject: "質問", text: "鑑定の結果について" })).toBe(false);
    expect(bulkHeaders(H_PERSONAL)).toBe(false);
    expect(bulkHeaders({ precedence: "bulk" })).toBe(true);
    expect(bulkHeaders({ "auto-submitted": "no" })).toBe(false);
    expect(bulkHeaders({ "auto-submitted": "auto-generated" })).toBe(true);
    expect(directoryDomain("noreply@mail.dev.to")).toBe(true);
    expect(directoryDomain("someone@notdev.to")).toBe(false);
  });

  it("kept and forwarded as 「[非读者]」, not counted as unanswered; the first schema pass judges the letters already kept", () => {
    ensureInboxTable();
    const cid = upsertCustomer("vendor-test-reader@example.com", "en");
    const ins = db().prepare("INSERT INTO support_inbox (id, received_at, from_addr, subject, text, customer_id, kind) VALUES (?,?,?,?,?,?,?)");
    ins.run("vend-1", Date.now(), "hi@startupbuffer.com", "Your listing is invisible", "Upgrade.", null, "vendor");
    ins.run("read-1", Date.now(), "vendor-test-reader@example.com", "Where is my reading", "Paid, nothing shows.", cid, null);
    expect(inboxOpenCount()).toBe(1);
    const row = db().prepare("SELECT * FROM support_inbox WHERE id = 'vend-1'").get() as unknown as InboxRow;
    expect(forwardBody(row).subject).toBe("[非读者] Your listing is invisible");
    const reader = db().prepare("SELECT * FROM support_inbox WHERE id = 'read-1'").get() as unknown as InboxRow;
    expect(forwardBody(reader).subject).toBe("[客服来信] Where is my reading");
  });
});
