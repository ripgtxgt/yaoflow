import { describe, expect, it } from "vitest";
import { buildQianLaunchEmail, QIAN_MENTION_UNTIL, withQianMention } from "../src/lib/email";
import { customersForQianLaunch, db, upsertCustomer } from "../src/lib/db";

/** 10-13 解籤上线信: the group letter only to 繁體 readers who said yes to news; one line in the other letters for two weeks. */
describe("解籤上线信", () => {
  it("says what the reader can do, links with a tag, offers unsubscribe, avoids the banned words", () => {
    const m = buildQianLaunchEmail({ url: "https://yaoflow.com/zh-hant/jieqian?c=launch-qian", unsubUrl: "https://yaoflow.com/api/unsub?x" });
    expect(m.subject).toBe("在廟裡求了籤，看不懂籤詩？");
    expect(m.html).toContain("c=launch-qian");
    expect(m.html).toContain("退訂");
    expect(m.text).toContain("14 套");
    expect(m.text).toContain("包含在會員權益裡");
    expect(`${m.html}${m.text}`).not.toMatch(/準|\bAI\b|靈驗|神明說|改運/);
  });

  it("the one-line mention: 繁體, the letters they get anyway, two weeks, once", () => {
    const html = "<html><body><p>你的解讀</p></body></html>";
    const before = QIAN_MENTION_UNTIL - 1000;
    const on = withQianMention(html, "t", { kind: "reading", locale: "zh-hant" }, before);
    expect(on.html).toContain("c=mail-qian");
    expect(on.html.indexOf("c=mail-qian")).toBeLessThan(on.html.indexOf("</body>"));
    expect(withQianMention(html, "t", { kind: "reading", locale: "zh" }, before).html).toBe(html);
    expect(withQianMention(html, "t", { kind: "login", locale: "zh-hant" }, before).html).toBe(html);
    expect(withQianMention(html, "t", { kind: "reading", locale: "zh-hant" }, QIAN_MENTION_UNTIL + 1).html).toBe(html);
    expect(withQianMention(on.html, on.text, { kind: "reading", locale: "zh-hant" }, before).html).toBe(on.html);
  });

  it("goes only to 繁體 readers who kept the news box ticked", () => {
    const yes = upsertCustomer("qianlaunch-yes@example.org", "zh-hant");
    const no = upsertCustomer("qianlaunch-no@example.org", "zh-hant");
    const hans = upsertCustomer("qianlaunch-hans@example.org", "zh");
    db().prepare("UPDATE customers SET marketing_ok = 1, marketing_at = ? WHERE id IN (?, ?)").run(Date.now(), yes, hans);
    db().prepare("UPDATE customers SET marketing_ok = 0 WHERE id = ?").run(no);
    const ids = customersForQianLaunch("launch-qian", 5000).map((p) => p.id);
    expect(ids).toContain(yes);
    expect(ids).not.toContain(no);
    expect(ids).not.toContain(hans);
  });
});
