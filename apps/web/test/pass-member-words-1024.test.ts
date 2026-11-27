import { describe, expect, it } from "vitest";
import type { PendingRow } from "../src/lib/recover-offer";
import type { ListedSession } from "../src/lib/stripe";

/**
 * 10-24 (Neil: 「为什么这封邮件的标题还是会员没有开通，这个不是通卡吗？…会员是会员，通卡是通卡，这是不同的」): a 通卡 is never
 * called a membership — the hour letter and its page, the account label, the tarot／解籤 buttons, the loading line. The word
 * each language uses for a membership must not appear in what a pass buyer or holder reads.
 */
const { buildRecoverOfferEmail, OFFER_T } = await import("../src/lib/recover-offer-mail");
const { OFFER_PAGE_T } = await import("../src/lib/dict/recover-offer-page");
const { tongkaT } = await import("../src/lib/tongka");
const { tarotUi } = await import("../src/lib/tarot-ui");
const { t } = await import("../src/lib/i18n");
const { planRecover } = await import("../src/lib/recover-once");

const MEMBER: Record<string, RegExp> = {
  "zh-hant": /會員/, zh: /会员/, en: /member/i, ja: /メンバー/, ko: /멤버/,
  fr: /abonnement|membre/i, de: /mitglied/i, es: /membres[ií]a|miembro/i, pt: /assinatura|membro/i,
};
const LOCALES = Object.keys(MEMBER);
const passRow = (days: 1 | 7 | 30) => ({ kind: "pass", meta_json: JSON.stringify({ days: String(days), tz: "480" }), product: "x" }) as unknown as PendingRow;

describe("通卡的挽回信：标题、开头、按钮都说通卡，不说会员", () => {
  for (const l of LOCALES) {
    it(`${l}: a 1-day pass checkout's letter names the pass and never the membership`, () => {
      const m = buildRecoverOfferEmail({ p: passRow(1), locale: l as never, url: "https://yaoflow.com/o/x", base: "NT$99", offer: "NT$69", until: "21:30", unsub: "https://yaoflow.com/u/x" });
      const name = tongkaT(l).name[1].toLowerCase();
      expect(m.subject.toLowerCase()).toContain(name);
      expect(m.text.toLowerCase()).toContain(name);
      expect(m.subject).not.toMatch(MEMBER[l]!);
      expect(m.text).not.toMatch(MEMBER[l]!);
      expect(m.text).not.toMatch(/\{\w+\}/);
    });
  }
  it("zh-hant reads as Neil would write it", () => {
    const m = buildRecoverOfferEmail({ p: passRow(7), locale: "zh-hant", url: "https://yaoflow.com/o/x", base: "NT$349", offer: "NT$244", until: "21:30", unsub: "https://yaoflow.com/u/x" });
    expect(m.subject).toBe("剛才的付款沒有完成：7 天通卡（1 小時內 7 折）");
    expect(m.text).toContain("剛才買7 天通卡的付款沒有完成。");
    expect(m.text).toContain("7 折買7 天通卡 · NT$244");
  });
  it("a membership's letter still says membership (the two are not mixed the other way)", () => {
    for (const l of LOCALES) expect(OFFER_T[l]!.subjectMember).toMatch(MEMBER[l]!);
  });
});

describe("挽回 7 折页、帐号页、读取中、塔罗、解籤：通卡的字", () => {
  for (const l of LOCALES) {
    it(`${l}: the offer page's pass words, the account label, the loading line`, () => {
      const p = OFFER_PAGE_T[l]!;
      for (const s of [p.btnPass, p.expiredPass, p.fullPass]) { expect(s).toContain("{name}"); expect(s).not.toMatch(MEMBER[l]!); }
      expect(tongkaT(l).activePass.length).toBeGreaterThan(1);
      expect(tongkaT(l).activePass).not.toMatch(MEMBER[l]!);
      const verify = t(l as never, "workVerifyPass");
      expect(verify).not.toMatch(MEMBER[l]!);
      expect(verify).not.toBe(t(l as never, "workVerifyMember"));
    });
  }
  it("塔羅: a pass holder's button and note say 通卡", () => {
    for (const hans of [false, true]) {
      const ui = tarotUi(hans);
      expect(ui.buyPass).toContain("通卡");
      expect(ui.buyPassNote).toContain("通卡");
      expect(ui.buyPass + ui.buyPassNote).not.toMatch(/會員|会员/);
    }
  });
});

describe("批量挽回信（recover-once）不给通卡写会员信", () => {
  it("a pass checkout is left to the hour offer, named for the pass", () => {
    const s = { id: "cs_test_pass1024", url: null, mode: "payment", payment_status: "unpaid", status: "expired", created: Math.floor((Date.now() - 2 * 86_400_000) / 1000),
      metadata: { kind: "pass", days: "1", locale: "zh-hant", tzname: "Asia/Taipei", country: "TW" }, customer_details: { email: "pass1024@reader1024.net" }, customer_email: null, currency: "twd", amount_total: 9900 } as unknown as ListedSession;
    const plan = planRecover([s], Date.now());
    expect(plan.items).toEqual([]);
    expect(plan.skipped).toMatchObject({ pass_offer: 1 });
  });
});
