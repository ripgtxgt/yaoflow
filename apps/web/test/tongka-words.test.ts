import { describe, expect, it } from "vitest";
import { buildPassNoticeEmail } from "../src/lib/pass-notice";
import { PASS_T, passT } from "../src/lib/dict/pass";
import { PASS_NAMES } from "../src/lib/pass";
import { buildRecoverOfferEmail } from "../src/lib/recover-offer-mail";
import { offerPassName, type PendingRow } from "../src/lib/recover-offer";
import { OFFER_PAGE_T } from "../src/lib/dict/recover-offer-page";
import { RECOVER_T } from "../src/lib/dict/recover";
import { FIRST_MONTH_T as FIRST_T } from "../src/lib/dict/first-month";

/** 10-22 (Neil: 「要」): what a reader sees calls the one-off month a 通卡 — never 單月會員 */
process.env.REVISIT_SECRET ??= "tongka-words-test-secret";
const OLD = /單月|单月|one-month membership|One month of membership|1か月メンバー|한 달 멤버십|mois d'abonnement|Einzelmonat|mes suelto|mês avulso/;
const pending = (meta: Record<string, string>) => ({
  co: "co", session_id: "cs_x", kind: "pass", created: 0, left_at: null, letter_at: null, letter_state: null, email: "a@example.com", remind: 1,
  locale: "zh-hant", currency: "TWD", amount: 34900, product: "x", managed: 0, methods: null, card_hint: 1, meta_json: JSON.stringify(meta), cancel_url: "", success_url: "",
}) as unknown as PendingRow;

describe("通卡的說法 (10-22)", () => {
  it("the pass letters and panels never say 單月會員 in any language", () => {
    for (const [l, t] of Object.entries(PASS_T)) for (const [k, v] of Object.entries(t)) if (k !== "body2nd" && k !== "title2nd") expect(v, `${l}.${k}`).not.toMatch(OLD);
    for (const [l, t] of Object.entries(RECOVER_T as unknown as Record<string, Record<string, string>>)) for (const k of ["memPass", "memAlipay"]) expect(t[k], `${l}.${k}`).not.toMatch(OLD);
    for (const [l, t] of Object.entries(FIRST_T)) expect(t.optSubSave, l).not.toMatch(OLD);
    for (const [l, t] of Object.entries(OFFER_PAGE_T)) expect(t.titlePass, l).toContain("{name}");
    for (const [l, n] of Object.entries(PASS_NAMES)) expect(n, l).not.toMatch(OLD);
    expect(PASS_NAMES["zh-hant"]).toBe("YaoFlow 30 天通卡（數位內容，不續訂）");
    expect(passT("zh-hant", "consentPre")).toContain("通卡一次付清");
  });

  it("the reminder names the pass: an old one-off month is a 30 天通卡, a 7-day one says 這幾天", () => {
    const base = { passId: "pass_abc", end: Date.UTC(2026, 9, 26, 5), currency: "TWD" as const, asked: 0, revisitDates: [] };
    const old = buildPassNoticeEmail({ ...base, locale: "zh-hant" });
    expect(old.subject).toContain("你的 30 天通卡將在");
    expect(old.text).toContain("再買一張 30 天通卡");
    expect(old.text).toContain("這個月你還沒問事");
    expect(old.text + old.subject).not.toMatch(OLD);
    expect(old.text + old.subject).not.toMatch(/\{\w+\}/);
    const week = buildPassNoticeEmail({ ...base, locale: "zh", passDays: 7, asked: 2 });
    expect(week.subject).toContain("你的 7 天通卡将在");
    expect(week.text).toContain("这几天你问了 2 件事");
    expect(week.text).toContain("再买一张 30 天通卡");
    const en = buildPassNoticeEmail({ ...base, locale: "en", currency: "USD" });
    expect(en.subject).toBe(`Your 30-day pass ends on ${en.subject.replace("Your 30-day pass ends on ", "")}`);
    expect(en.text).toContain("Another 30-day pass");
    const ja = buildPassNoticeEmail({ ...base, locale: "ja", currency: "JPY" });
    expect(ja.subject).toContain("30-day pass"); // the letter is in English for Japanese readers — the name follows the words
  });

  it("the recovery letter names the pass the reader was buying", () => {
    const mk = (locale: "zh-hant" | "fr", meta: Record<string, string>) => buildRecoverOfferEmail({ p: pending(meta), locale, url: "https://yaoflow.com/x", base: "NT$99", offer: "NT$69", until: "21:30", unsub: "https://yaoflow.com/u" });
    expect(mk("zh-hant", { days: "1" }).text).toContain("1 日通卡打 7 折");
    expect(mk("zh-hant", {}).text).toContain("30 天通卡打 7 折");
    expect(mk("fr", { days: "7" }).text).toContain("au pass 7 jours");
    expect(mk("zh-hant", { days: "7" }).text).not.toMatch(OLD);
    expect(offerPassName(pending({ days: "30" }), "es", true)).toBe("pase de 30 días");
    expect(offerPassName(pending({ days: "30" }), "es")).toBe("Pase de 30 días");
  });
});
