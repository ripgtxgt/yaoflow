import { describe, expect, it } from "vitest";
// DATA_DIR is a fresh temp dir (test/setup.ts)
import type { LineValue } from "@yaoflow/engine";
import { grantByToken, pairByToken, pairsForCustomer, pairStats, recordOrder, saveCast, saveReading, storedReadingForSession, upsertCustomer } from "../src/lib/db";
import { canInvite, cleanFraming, isTwoParty, mintPair, pairInfo, pairLink, pairRole, pairStatus, redeemPair } from "../src/lib/pairs";
import { jointPayload, jointSystem } from "../src/lib/joint";
import { buildPairEmail } from "../src/lib/email";
import { verifyPaidSession } from "../src/lib/paid-store";
import { resolveServerChart } from "../src/lib/reading";

/** §14 ⑫ 同题合参: two people cast on the same matter. */
const A: LineValue[] = [7, 8, 9, 8, 7, 8];
const B: LineValue[] = [8, 8, 7, 7, 6, 8];
const AT = Date.UTC(2026, 8, 10, 3);

function reading(sid: string, email: string, question: string, topic: string, tier = "deep", status = "paid", values = A) {
  const cid = upsertCustomer(email, "zh");
  const input = { question, values, castAtMs: AT, tzOffsetMinutes: 480 };
  const chart = resolveServerChart(input, true) as unknown as Record<string, unknown>;
  const castId = saveCast({ customerId: cid, castAtMs: AT, tzOffsetMinutes: 480, locale: "zh", question, topic, values, chart });
  saveReading(castId, cid, tier, "zh", { verdict: { zh: "可成" } } as never);
  recordOrder({ sessionId: sid, customerId: cid, castId, tier, amountCents: status === "paid" ? 999 : 0, currency: "USD", email, status });
  return cid;
}

describe("同题合参", () => {
  it("knows a two-person matter: relationships always, other topics when the wording names another party", () => {
    // 09-26: love questions are private unless they are a couple's shared matter
    expect(isTwoParty("他还会回来吗", "relationship")).toBe(false);
    expect(isTwoParty("前任会不会和我复合", "relationship")).toBe(false);
    expect(isTwoParty("他已读不回，他心里还有我吗", "relationship")).toBe(false);
    expect(isTwoParty("我们今年适合结婚吗", "relationship")).toBe(true);
    expect(isTwoParty("我和老公的关系接下来会怎样", "relationship")).toBe(true);
    expect(isTwoParty("我們還能和好如初嗎", "relationship")).toBe(false);
    expect(isTwoParty("和喜歡的對象會在一起嗎", "relationship")).toBe(false);
    expect(isTwoParty("他跟他老婆年底前會離婚嗎？", "relationship")).toBe(false);
    expect(isTwoParty("Will my husband and I get through this year?", "relationship")).toBe(true);
    expect(isTwoParty("Will my ex come back?", "relationship")).toBe(false);
    expect(isTwoParty("这个项目和对方合作能成吗", "career")).toBe(true);
    expect(isTwoParty("Should I take the deal with my partner?", "money")).toBe(true);
    expect(isTwoParty("我该换工作吗", "career")).toBe(false);
    expect(isTwoParty("我的身体什么时候好", "health")).toBe(false);
    expect(isTwoParty("还有其他机会吗", "career")).toBe(false); // 其他 is not 他
    expect(cleanFraming("   我们  要不要复合 ", "x")).toBe("我们 要不要复合");
    expect(cleanFraming("", "原问题")).toBe("原问题");
    expect(cleanFraming("我們要不要復合，".repeat(40), "x")).toHaveLength(120);
    expect(cleanFraming("很".repeat(300), "原问题")).toBe("原问题"); // 09-20: one character repeated names nothing
  });

  it("mints one invite per reading at the inviter's tier, and the invitee's cast becomes a joint grant on the same matter", async () => {
    const aCid = reading("cs_pair_a", "a@example.com", "我和老公的关系接下来会怎样", "relationship");
    expect(canInvite("cs_pair_a")).not.toBeNull();
    const p = mintPair("cs_pair_a", "我们要不要复合", "zh", aCid)!;
    expect(p).not.toBeNull();
    expect(p.framing).toBe("我们要不要复合");
    expect(p.topic).toBe("relationship");
    expect(pairStatus(p)).toBe("open");
    expect(mintPair("cs_pair_a", "another", "zh", aCid)!.token).toBe(p.token); // idempotent
    const g = grantByToken(p.token)!;
    expect(g.kind).toBe("joint"); expect(g.tier).toBe("deep"); expect(g.via).toBe("789878");
    expect(pairLink("https://yaoflow.com", "zh", p)).toBe(`https://yaoflow.com/zh/cast?pair=${p.token}&via=789878`);
    // what the invitee may see: the framing and the tier, nothing else
    const info = pairInfo(p.token)!;
    expect(info).toEqual({ status: "open", framing: "我们要不要复合", topic: "relationship", tier: "deep", locale: "zh" });
    expect(JSON.stringify(info)).not.toContain("复合吗"); expect(JSON.stringify(info)).not.toContain("a@example.com");
    // the inviter cannot answer their own invite
    const input = JSON.stringify({ question: "我们要不要复合", values: B, castAtMs: AT, tzOffsetMinutes: 480, locale: "zh" });
    expect(redeemPair(p.token, input, "a@example.com", aCid, "zh")).toEqual({ ok: false, error: "self" });
    // the other person casts
    const r = redeemPair(p.token, input, "b@example.com", null, "en");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.sid).toBe(`gr_${p.token}`);
    expect(pairStatus(r.pair)).toBe("claimed");
    expect(r.pair.b_session_id).toBe(r.sid); expect(r.pair.b_locale).toBe("en");
    expect(redeemPair(p.token, input, "c@example.com", null, "zh")).toEqual({ ok: false, error: "already_used" });
    // downstream, the invitee's session is a reward of kind joint: deep, no charge, attributed to the inviter's cast
    const rec = await verifyPaidSession(r.sid);
    expect(rec?.tier).toBe("deep"); expect(rec?.reward).toBe(true); expect(rec?.grantKind).toBe("joint");
    expect(rec?.amountCents).toBe(0); expect(rec?.via).toBe("789878"); expect(rec?.input.question).toBe("我们要不要复合");
    expect(pairRole(r.pair, "cs_pair_a")).toBe("a"); expect(pairRole(r.pair, r.sid)).toBe("b"); expect(pairRole(r.pair, "cs_other")).toBeNull();
    expect(pairStats(0)).toEqual({ sent: 1, claimed: 1 });
    expect(pairsForCustomer(aCid).map((x) => x.role)).toEqual(["a"]);
  });

  it("refuses an invitee's reading, a refund, and a reading that is not stored as the inviter", () => {
    reading("cs_pair_ref", "r@example.com", "和他合作", "career", "deep", "refunded");
    expect(canInvite("cs_pair_ref")).toBeNull();
    expect(canInvite("cs_nothing")).toBeNull();
    const cid = reading("cs_pair_j", "j@example.com", "合作", "career", "one", "joint");
    expect(mintPair("cs_pair_j", "合作", "zh", cid)).toBeNull();
  });

  it("09-27 赠送审核 C: only a paid-for reading on a two-person matter may invite, checked on the server; the inviter's own address is refused", () => {
    for (const st of ["invite_light", "case_light", "gift_cast", "comp", "revisit_light", "gift"]) {
      reading(`cs_pair_free_${st}`, `free-${st}@example.com`, "这个项目和对方合作能成吗", "career", "one", st);
      expect(canInvite(`cs_pair_free_${st}`), st).toBeNull();
    }
    reading("cs_pair_solo", "solo@example.com", "我该换工作吗", "career");
    expect(canInvite("cs_pair_solo")).toBeNull();
    reading("cs_pair_ex", "ex@example.com", "前任会不会和我复合", "relationship");
    expect(canInvite("cs_pair_ex")).toBeNull();
    const cid = reading("cs_pair_sub", "sub-pair@example.com", "这个项目和对方合作能成吗", "career", "deep", "subscription");
    const p = mintPair("cs_pair_sub", "合作能成吗", "zh", cid)!;
    expect(p).not.toBeNull();
    // a guest typing the inviter's own address is the inviter
    expect(redeemPair(p.token, "{}", "SUB-PAIR@example.com", null, "zh")).toEqual({ ok: false, error: "self" });
  });

  it("gives the model both charts and the framing only, addressed to the reader", () => {
    reading("cs_pair_x", "x@example.com", "我私下想问的话", "relationship");
    reading("gr_pair_y", "y@example.com", "我们要不要复合", "relationship", "deep", "joint", B);
    const you = resolveServerChart({ question: "q", values: A, castAtMs: AT, tzOffsetMinutes: 480 }, true);
    const other = resolveServerChart({ question: "q", values: B, castAtMs: AT, tzOffsetMinutes: 480 }, true);
    const payload = jointPayload("我们要不要复合", you, other);
    expect(payload).toContain('"matter":"我们要不要复合"');
    expect(payload).not.toContain("私下");
    expect(payload).toContain('"chart_you"'); expect(payload).toContain('"chart_other"');
    const sys = jointSystem("en", "relationship");
    expect(sys).toContain("Address the reader as \"you\"");
    expect(sys).toContain("No dates, no timing windows");
    expect(jointSystem("zh", "career")).toContain("work between them");
  });

  it("writes the inviter a paper-ground note when the other side has cast", () => {
    const m = buildPairEmail({ locale: "zh", framing: "我们要不要复合", url: "https://yaoflow.com/zh/pair/abc?sid=cs_x" });
    expect(m.subject).toContain("合参");
    expect(m.html).toContain("我们要不要复合");
    expect(m.html).toContain("https://yaoflow.com/zh/pair/abc?sid=cs_x");
    expect(m.html).toContain("background:#f4f2ec");
    const en = buildPairEmail({ locale: "en", framing: "Should we get back together", url: "https://yaoflow.com/en/pair/abc" });
    expect(en.text).toContain("See the joint reading: https://yaoflow.com/en/pair/abc");
    void storedReadingForSession;
    void pairByToken;
  });
});
