import { describe, expect, it } from "vitest";
import { forwardBody, inboxMark, inboxOpenCount, ensureInboxTable, parseFrom, routeFor, type InboxRow } from "../src/lib/inbound";
import { db } from "../src/lib/db";

describe("09-29 客服来信", () => {
  it("reads a From header either way", () => {
    expect(parseFrom("Sarah Li <Someone@Hotmail.com>")).toEqual({ addr: "someone@hotmail.com", name: "Sarah Li" });
    expect(parseFrom('"Li, Sarah" <a@b.co>')).toEqual({ addr: "a@b.co", name: "Li, Sarah" });
    expect(parseFrom("plain@x.org")).toEqual({ addr: "plain@x.org", name: null });
  });

  it("the forwarded letter says who, to where, whether it passed, and replies go to the reader", () => {
    const row: InboxRow = {
      id: "x", received_at: Date.UTC(2026, 8, 25, 5, 0), from_addr: "reader@hotmail.com", from_name: "Sarah Li", to_addrs: "support@yaoflow.com",
      subject: "會員", text: "你好已經付款$79 1年會員，為什麼深斷還要付$9.9?", html: null, auth: JSON.stringify({ spf: "pass", dkim: "pass", dmarc: "pass" }),
      attachments: null, customer_id: 291, forwarded_at: null, forward_error: null, handled_at: null, note: null,
    };
    const m = forwardBody(row);
    expect(m.subject).toBe("[客服来信] 會員");
    expect(m.text).toContain("Sarah Li <reader@hotmail.com>");
    expect(m.text).toContain("客户：#291");
    expect(m.text).toContain("SPF pass");
    expect(m.html).toContain('charset="utf-8"');
    expect(m.html).toContain("為什麼深斷還要付");
    // the reader's text is escaped, never injected
    expect(forwardBody({ ...row, text: "<script>x</script>" }).html).not.toContain("<script>x");
  });

  it("open letters are counted until marked handled", () => {
    ensureInboxTable();
    db().prepare("INSERT OR IGNORE INTO support_inbox (id, received_at, from_addr) VALUES ('11111111-2222-3333-4444-555555555555', ?, 'a@b.co')").run(Date.now());
    const before = inboxOpenCount();
    expect(before).toBeGreaterThan(0);
    inboxMark("11111111-2222-3333-4444-555555555555", true, "回了");
    expect(inboxOpenCount()).toBe(before - 1);
  });

  it("routes like the old Cloudflare rules: support kept, account addresses relayed, the rest dropped", () => {
    expect(routeFor(["support@yaoflow.com"])).toBe("support");
    expect(routeFor(["YaoFlow <Support@YaoFlow.com>"])).toBe("support");
    for (const a of ["note", "hn", "ig", "jp", "x"]) expect(routeFor([`${a}@yaoflow.com`])).toBe("relay");
    expect(routeFor(["random@yaoflow.com"])).toBe("drop");
    expect(routeFor(["x@other.com"])).toBe("drop");
  });
});
