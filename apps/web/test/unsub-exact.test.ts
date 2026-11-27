import { describe, expect, it } from "vitest";

/**
 * 10-23 进度表 103: an unsubscribe is kept by the exact address (mail_unsubs). The old masked ops line 「a…@gmail.com」
 * used to stop every reader with that first letter and domain (15 clicks stopped 273 readers). When the table first
 * appears, earlier clicks are carried over on the side of not writing: addresses that fit the mask, had been sent a
 * letter carrying the link before the click, and have not said yes since.
 */
const db = await import("../src/lib/db");
const T = Date.UTC(2026, 8, 29, 5, 0);

// history before the table exists: three gmail readers starting with "a", one with "b"; one unsubscribe click from "a…@gmail.com"
for (const [email, ok] of [["alice-x@gmail.com", 0], ["andy-y@gmail.com", 0], ["amy-z@gmail.com", 1], ["bob-w@gmail.com", 0]] as const) {
  const id = db.upsertCustomer(email, "zh-hant");
  db.db().prepare("UPDATE customers SET marketing_ok = ? WHERE id = ?").run(ok, id);
}
db.logMailSent({ id: "re_l1", kind: "launch", email: "alice-x@gmail.com", subject: "launch" });   // got the link
db.logMailSent({ id: "re_l2", kind: "reading", email: "andy-y@gmail.com", subject: "reading" });  // never got a letter with the link
db.logMailSent({ id: "re_l3", kind: "launch", email: "amy-z@gmail.com", subject: "launch" });     // got it, but said yes since
db.logMailSent({ id: "re_l4", kind: "launch", email: "bob-w@gmail.com", subject: "launch" });     // another letter of the alphabet
db.db().prepare("UPDATE mail_log SET created_at = ?").run(T - 3_600_000);
db.db().prepare("INSERT INTO ops_events (at, kind, detail) VALUES (?, 'unsub', 'a…@gmail.com')").run(T);

describe("退订按确切信箱", () => {
  it("the old masked clicks carry over only to the addresses that could have made them", () => {
    expect(db.mailOptedOut("alice-x@gmail.com")).toBe(true);
    expect(db.mailOptedOut("andy-y@gmail.com")).toBe(false);
    expect(db.mailOptedOut("amy-z@gmail.com")).toBe(false);
    expect(db.mailOptedOut("bob-w@gmail.com")).toBe(false);
  });

  it("a new click stops that address only", () => {
    db.recordOps("unsub", "b…@gmail.com");
    expect(db.mailOptedOut("bob-w@gmail.com")).toBe(false); // the masked line alone stops no one now
    db.recordUnsub("Bob-W@gmail.com");
    expect(db.mailOptedOut("bob-w@gmail.com")).toBe(true);
    expect(db.unsubscribedAddress("BOB-W@GMAIL.COM")).toBe(true);
    expect(db.mailOptedOut("andy-y@gmail.com")).toBe(false);
  });
});
