import { describe, expect, it } from "vitest";
import { buildLoginEmail, buildReadingEmail } from "../src/lib/email";
import { LOCALES } from "../src/lib/locales";
import { emailAlreadySent, recordEmail } from "../src/lib/db";

const base = {
  question: "我在考虑要不要从现在的公司离职去创业，时机合适吗？",
  values: [9, 7, 7, 7, 7, 7], // 乾，初爻动 → the figure is drawn from these
  hexName: "乾为天",
  changedName: "天风姤",
  headline: "此事可成，但成在让步之后。",
  url: "https://yaoflow.com/zh/reading?sid=cs_test_abc",
};

describe("reading email", () => {
  it("builds a bilingual email with the figure, question and link", () => {
    const zh = buildReadingEmail({ ...base, locale: "zh", tier: "deep" });
    expect(zh.subject).toContain("乾为天");
    expect(zh.subject).toContain("解读已就绪");
    // the figure is drawn, never a Unicode glyph (tofu in too many clients)
    expect(zh.subject).not.toMatch(/[䷀-䷿]/);
    expect(zh.html).not.toMatch(/[䷀-䷿]/);
    // six drawn rows: the moving first line in cinnabar, the rest paper
    expect(zh.html.match(/#b0403c/g)?.length).toBeGreaterThanOrEqual(1);
    // paper ground like the login mail and the site (09-07): no ink body, no
    // opacity (Outlook ignores it), the still lines drawn in ink
    expect(zh.html).toContain("background:#f4f2ec;color:#14151c");
    expect(zh.html).not.toContain('<body style="margin:0;padding:0;background:#14151c'); // the button is ink, the page is not
    expect(zh.html).not.toContain("opacity:");
    expect(zh.html.match(/background:#14151c;border-radius:2px/g)?.length).toBe(5); // 乾 minus the moving first line
    expect(zh.html).toContain(base.url);
    expect(zh.html).toContain("天风姤");
    expect(zh.html).toContain("深断");
    expect(zh.text).toContain(base.headline);

    const en = buildReadingEmail({
      ...base, locale: "en", tier: "one",
      hexName: "The Creative", changedName: "Coming to Meet",
      headline: "This can be done — after a concession.",
    });
    expect(en.subject).toContain("your reading is ready");
    expect(en.html).toContain("Light reading");
    expect(en.html).toContain("Open your reading");
  });

  it("escapes user text so a question cannot inject markup", () => {
    const m = buildReadingEmail({
      ...base, locale: "en", tier: "one",
      question: '<script>alert("x")</script> & "quoted"',
    });
    expect(m.html).not.toContain("<script>");
    expect(m.html).toContain("&lt;script&gt;");
    expect(m.html).toContain("&amp;");
  });

  it("handles a static cast with no changed hexagram", () => {
    const m = buildReadingEmail({ ...base, locale: "zh", tier: "one", changedName: null });
    expect(m.html).toContain("乾为天");
    expect(m.html).not.toContain("变 ");
  });

  it("records delivery once per session so a refresh cannot resend", () => {
    const sid = "cs_test_email_dedupe";
    expect(emailAlreadySent(sid, "reading")).toBe(false);
    recordEmail(sid, "reading", "neil@linedo.io", "sent", "id_1");
    expect(emailAlreadySent(sid, "reading")).toBe(true);
    // a retry updates the row rather than creating a second send
    recordEmail(sid, "reading", "neil@linedo.io", "sent", "id_2");
    expect(emailAlreadySent(sid, "reading")).toBe(true);
  });

  it("marks failures as not-sent so they can be retried", () => {
    const sid = "cs_test_email_failed";
    recordEmail(sid, "reading", "x@example.com", "failed", "http 500");
    expect(emailAlreadySent(sid, "reading")).toBe(false);
  });
});

describe("login email", () => {
  const link = "https://yaoflow.com/api/auth/verify?t=" + "a".repeat(64) + "&l=zh";

  it("is a paper page with one button, the same link again under a copy-this line, and who it was sent to and why", () => {
    const m = buildLoginEmail("zh", link, "neil@example.com");
    expect(m.subject).toBe("登录 YaoFlow");
    expect(m.html).toContain("background:#f4f2ec;color:#14151c");
    const shown = link.replace("&", "&amp;");
    expect(m.html.split(shown).length - 1).toBe(3); // button href, fallback href, fallback text
    expect(m.html).toContain("按钮打不开时");
    expect(m.html).toContain("这封邮件发给 neil@example.com");
    // a login mail is not a reading: no medical disclaimer, no bare auto-linkable URL
    expect(m.html).not.toContain("不构成医疗");
    expect(m.html).not.toMatch(/[^">]https:\/\/yaoflow\.com\/api\/auth\/verify/);
    expect(m.text).toContain(link);
    expect(m.text).toContain("neil@example.com");
  });

  it("renders in every locale with no leftover placeholders", () => {
    for (const l of LOCALES) {
      const m = buildLoginEmail(l, link, "x@example.com");
      expect(m.html, l).not.toMatch(/\{[a-z]+\}/);
      expect(m.text, l).not.toMatch(/\{[a-z]+\}/);
      expect(m.html, l).toContain("x@example.com");
    }
    expect(buildLoginEmail("zh-hant", link, "x@example.com").html).toContain("登入");
    expect(buildLoginEmail("ja", link, "x@example.com").subject).toBe("YaoFlow にログイン");
  });
});
