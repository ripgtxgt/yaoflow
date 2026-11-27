import { describe, expect, it } from "vitest";
import * as t from "../src/lib/tarot";
import { fulfilTarotPayment, matterTerms, offTopic, tarotOffense, tarotSystem, tarotUser } from "../src/lib/tarot-personal";
import { tierOf } from "../src/lib/checkout-audit";
import { tarotUi } from "../src/lib/tarot-ui";
import { tarotText } from "../src/lib/tarot-text";
import { buildTarotEmail, buildTarotRevisitEmail } from "../src/lib/email";
import type { CheckoutSession } from "../src/lib/stripe";
import { existsSync } from "node:fs";
import { join } from "node:path";

/** 10-16 进度表 68 線上塔羅 */
const BANNED = /準|准|靈驗|灵验|\bAI\b|神諭|保證|一定會|必定|命中注定|註定/;

describe("線上塔羅 · library", () => {
  it("78 cards, unique slugs, every card has a meaning, both faces and both images", () => {
    expect(t.TAROT_CARDS).toHaveLength(78);
    expect(t.TAROT_CARDS.filter((c) => c.arcana === "major")).toHaveLength(22);
    const slugs = new Set(t.TAROT_CARDS.map(t.tarotSlug));
    expect(slugs.size).toBe(78);
    expect(t.tarotSlug(t.cardById("06-lovers")!)).toBe("lovers");
    expect(t.cardBySlug("cups-02")?.zh).toBe("聖杯二");
    for (const c of t.TAROT_CARDS) {
      const m = t.meaningOf(c.id)!;
      expect(m, c.id).toBeTruthy();
      for (const side of [m.upright, m.reversed]) for (const k of ["overall", "love", "work", "ask_next"] as const) {
        expect(side[k].length, `${c.id} ${k}`).toBeGreaterThan(10);
        expect(BANNED.test(side[k]), `${c.id} ${k}`).toBe(false);
      }
      expect(m.keywords.upright.length).toBeGreaterThanOrEqual(3);
      for (const small of [false, true]) expect(existsSync(join(__dirname, "../public", t.cardImage(c, small))), c.id).toBe(true);
    }
  });

  it("deals distinct cards, about half reversed", () => {
    let rev = 0, n = 0;
    for (let i = 0; i < 2000; i++) {
      const d = t.deal(3);
      expect(new Set(d.map((x) => x.id)).size).toBe(3);
      for (const x of d) { n++; if (x.rev) rev++; }
    }
    expect(rev / n).toBeGreaterThan(0.45); expect(rev / n).toBeLessThan(0.55);
    expect(t.deal(1)).toHaveLength(1);
  });

  it("kind of question and the questions it does not answer", () => {
    expect(t.kindOf("他還會主動聯絡我嗎")).toBe("love");
    expect(t.kindOf("這份工作要不要接")).toBe("work");
    expect(t.refusalOf("這支股票會漲嗎")).toBe("money");
    expect(t.refusalOf("我媽的病會好嗎")).toBe("health");
    expect(t.refusalOf("我跟他還有可能嗎")).toBeNull();
  });
});

describe("線上塔羅 · one matter, one spread", () => {
  it("same matter from the same browser within 24h → the first spread; another matter → a new one", () => {
    const now = Date.UTC(2026, 9, 16, 4);
    const a = t.createDraw({ question: "他會不會回來找我？", spread: 3, locale: "zh-hant", bid: "tarot-b1", customerId: null, register: null }, now);
    expect(a.again).toBe(false);
    const b = t.createDraw({ question: "他會不會 回來找我", spread: 1, locale: "zh-hant", bid: "tarot-b1", customerId: null, register: null }, now + 3_600_000);
    expect(b).toEqual({ token: a.token, again: true });
    expect(t.dealtOf(t.tarotDraw(a.token)!)).toHaveLength(3);
    const c = t.createDraw({ question: "這份工作要不要接", spread: 1, locale: "zh-hant", bid: "tarot-b1", customerId: null, register: null }, now + 3_600_000);
    expect(c.again).toBe(false);
    const d = t.createDraw({ question: "他會不會回來找我？", spread: 3, locale: "zh-hant", bid: "tarot-b1", customerId: null, register: null }, now + 25 * 3_600_000);
    expect(d.again).toBe(false);
  });

  it("payment is recorded once; revisit day, the due sweep, the answer", () => {
    const now = Date.UTC(2026, 9, 16, 5);
    const { token } = t.createDraw({ question: "這段曖昧接下來會怎樣", spread: 1, locale: "zh-hant", bid: "tarot-b2", customerId: null, register: null }, now);
    expect(t.setTarotRevisit(token, 30, "他約我")).toBe(false); // unpaid
    const s = { id: "cs_test_tarot_000001", payment_status: "paid", currency: "twd", amount_total: 7500, metadata: { kind: "tarot", tarot: token, currency: "TWD" }, customer_details: { email: "tarot-buyer@example.com" } } as unknown as CheckoutSession;
    const r1 = fulfilTarotPayment(s);
    expect(r1).toMatchObject({ ok: true, created: true, token });
    expect(fulfilTarotPayment(s)).toMatchObject({ ok: true, created: false });
    expect(fulfilTarotPayment({ ...s, metadata: { kind: "qian" } } as unknown as CheckoutSession)).toMatchObject({ ok: false, why: "not_tarot" });
    expect(t.setTarotRevisit(token, 7, "")).toBe(false);
    expect(t.setTarotRevisit(token, 14, "他約我", now)).toBe(true);
    expect(t.dueTarotRevisits(now + 13 * 86_400_000).some((d) => d.token === token)).toBe(false);
    expect(t.dueTarotRevisits(now + 15 * 86_400_000).some((d) => d.token === token)).toBe(true);
    expect(t.markTarotRevisitSent(token, now)).toBe(true);
    expect(t.markTarotRevisitSent(token, now)).toBe(false);
    expect(t.setTarotRevisit(token, 30, "x")).toBe(false); // already sent
    t.setTarotPublic(token, true);
    expect(t.tarotDraw(token)!.public_ok).toBe(0); // no answer yet → not public
    expect(t.setTarotAnswer(token, "moving")).toBe(true);
    t.setTarotPublic(token, true);
    expect(t.tarotDraw(token)!.public_ok).toBe(1);
    expect(tierOf({ kind: "tarot" }, "payment")).toBe("tarot");
  });
});

describe("線上塔羅 · personal reading", () => {
  it("the prompt carries only the library's text for the cards, and the kind part for the question", () => {
    const { token } = t.createDraw({ question: "我跟前任還有機會復合嗎", spread: 3, locale: "zh-hant", bid: "tarot-b3", customerId: null, register: null });
    const d = t.tarotDraw(token)!;
    const u = JSON.parse(tarotUser(d)) as { cards: { position: string; meaning: Record<string, string> }[] };
    expect(u.cards.map((c) => c.position)).toEqual(["現在", "卡住的地方", "接下來"]);
    expect(u.cards.every((c) => c.meaning.love && !c.meaning.work)).toBe(true);
    expect(tarotSystem(null, 3)).toMatch(/卡住的地方/);
  });

  it("rejects a reading with a date, a deity, a redraw or no cast", () => {
    const ok = { reading: "這三張牌放在一起看，".repeat(12), cards: ["一", "二", "三"], watch: "先把想說的話整理好。", next: "這件事哪幾天會有動靜，為它起一卦看看？" };
    expect(tarotOffense(ok, 3)).toBeNull();
    expect(tarotOffense({ ...ok, watch: "下週他會聯絡你" }, 3)).toMatch(/^date/);
    expect(tarotOffense({ ...ok, watch: "這很準" }, 3)).toMatch(/^forbidden/);
    expect(tarotOffense({ ...ok, next: "再抽一張牌看看" }, 3)).toMatch(/redraw|no-cast/);
    expect(tarotOffense({ ...ok, cards: ["一"] }, 3)).toBe("cards");
  });

  it("letters and UI words carry no banned words; 简体 is converted", () => {
    const tm = tarotText("zh-hant").mail;
    const m = buildTarotEmail({ t: tm, locale: "zh-hant", cards: "戀人（逆位）", url: "https://yaoflow.com/zh-hant/tarot/r/x" });
    const rv = buildTarotRevisitEmail({ t: tm, locale: "zh-hant", question: "他會回來嗎", outcome: null, links: [{ label: "發生了", url: "https://x" }], pageUrl: "https://x" });
    for (const s of [m.text, rv.text, ...Object.values(tarotUi(false))]) expect(BANNED.test(s), s).toBe(false);
    expect(tarotUi(true).shuffleBtn).toBe("洗牌");
    expect(tarotUi(true).spread3Sub).toContain("现在");
  });

  it("10-17: a business question reads the work side, and a reading that drifts off the matter is caught", () => {
    expect(t.kindOf("yaoflow的流量什么时候会有起势")).toBe("work");
    expect(t.kindOf("前任會不會回來找我")).toBe("love");
    expect(matterTerms("yaoflow的流量什么时候会有起势")).toEqual(expect.arrayContaining(["yaoflow", "流量"]));
    const base = { cards: ["一", "二", "三"], watch: "先做一件事。", next: "起一卦看看。" };
    expect(offTopic({ ...base, reading: "卡住的是還沒收乾淨的爭執，先把姿態放低，對話才接得回來。" }, "yaoflow的流量什么时候会有起势")).toBe(true);
    expect(offTopic({ ...base, reading: "網站的流量現在有一股往前衝的動能，但內容還沒收尾。" }, "yaoflow的流量什么时候会有起势")).toBe(false);
    // 準備、標準 are ordinary words; 很準、準不準 are claims
    const ok = { reading: "這三張牌放在一起看，".repeat(12), cards: ["一", "二", "三"], watch: "先把下一波內容準備好。", next: "流量哪幾天會動起來？起一卦看看。" };
    expect(tarotOffense(ok, 3)).toBeNull();
    expect(tarotOffense({ ...ok, watch: "這幾張牌很準" }, 3)).toMatch(/^forbidden/);
  });
});
