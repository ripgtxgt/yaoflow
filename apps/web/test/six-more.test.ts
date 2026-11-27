import { describe, expect, it } from "vitest";
import type { LineValue } from "@yaoflow/engine";
import { castsTodayInMatter, createMatter, heavyClaimGivers, saveCast, setCastMatter, upsertCustomer, PAUSE_AT } from "../src/lib/db";
import { acceptableLine } from "../src/lib/daily-line";
import { normalizeSource } from "../src/lib/admin-customer-channels";
import { mintClaimReward, CLAIM_REWARD_WATCH } from "../src/lib/referral";
import { followupStateBlock } from "../src/lib/followup-state";
import { followupSystem, resolveServerChart } from "../src/lib/reading";
import { SHARE_STORY_T } from "../src/lib/dict/share-story";
import { MATTER_T } from "../src/lib/dict/matter";
import { LOCALES } from "../src/lib/locales";

const V: LineValue[] = [7, 8, 9, 7, 8, 8];

describe("09-29 six more", () => {
  it("today's note never reads the other person's heart, names a date or uses chart words", () => {
    expect(acceptableLine("今天適合把自己的事做好，留意訊息但不急著回；別在今晚追問他的想法。", "zh-hant")).toBe(true);
    expect(acceptableLine("今天他會想你，晚上可能會傳訊息。", "zh-hant")).toBe(false);
    expect(acceptableLine("今天要留意，10月3日前後會有消息。", "zh-hant")).toBe(false);
    expect(acceptableLine("今天用神旺相，宜主動。", "zh-hant")).toBe(false);
    expect(acceptableLine("短", "zh-hant")).toBe(false);
  });

  it("customer channels fold the tags into a few names", () => {
    expect(normalizeSource("threads-zh")).toBe("Threads");
    expect(normalizeSource("~threads")).toBe("Threads");
    expect(normalizeSource("~ref:google.com")).toBe("搜索");
    expect(normalizeSource("ig")).toBe("Instagram");
    expect(normalizeSource(null)).toBe("（没有标记）");
    expect(normalizeSource("story")).toBe("分享图 / 应验卡");
  });

  it("the fifth cast of the day on one matter; an upgraded light reading counts once", () => {
    const cid = upsertCustomer("pause@example.com", "zh-hant");
    const m = createMatter(cid, "t", "model", "relationship");
    const now = Date.now();
    for (let i = 0; i < 4; i++) {
      const q = `問題 ${i}`;
      const chart = resolveServerChart({ question: q, values: V, castAtMs: now, tzOffsetMinutes: 480 }, true) as unknown as Record<string, unknown>;
      const id = saveCast({ customerId: cid, castAtMs: now, tzOffsetMinutes: 480, locale: "zh-hant", question: q, topic: "relationship", values: V, chart });
      setCastMatter(id, m, "model");
      if (i === 3) { // the same cast upgraded: a second row, same figure and question
        const id2 = saveCast({ customerId: cid, castAtMs: now, tzOffsetMinutes: 480, locale: "zh-hant", question: q, topic: "relationship", values: V, chart });
        setCastMatter(id2, m, "model");
      }
    }
    expect(castsTodayInMatter(m)).toBe(4);
    expect(PAUSE_AT).toBe(5);
  });

  it("a giver is thanked every time a gift is claimed — no monthly ceiling, once per friend", () => {
    const giver = upsertCustomer("giver-claim@example.com", "zh-hant");
    const links: (string | null)[] = [];
    for (let i = 0; i < CLAIM_REWARD_WATCH + 2; i++) {
      const friend = upsertCustomer(`friend-claim-${i}@example.com`, "zh-hant");
      links.push(mintClaimReward({ token: `tok${i}`.padEnd(36, "0"), from_customer_id: giver, claimed_customer_id: friend }, `gr_claim_${i}`, "https://yaoflow.com", "zh-hant"));
    }
    expect(links.every((u) => u && u.includes("/cast?reward="))).toBe(true);
    expect(heavyClaimGivers(Date.now() - 86_400_000, CLAIM_REWARD_WATCH).map((h) => h.customer_id)).toContain(giver);
    // the same friend twice: once
    const again = upsertCustomer("friend-claim-0@example.com", "zh-hant");
    expect(mintClaimReward({ token: "y".repeat(36), from_customer_id: giver, claimed_customer_id: again }, "gr_claim_again", "https://yaoflow.com", "zh-hant")).toBeNull();
    // never for yourself
    expect(mintClaimReward({ token: "x".repeat(36), from_customer_id: giver, claimed_customer_id: giver }, "gr_self", "https://yaoflow.com", "zh-hant")).toBeNull();
  });

  it("the follow-up knows how often the matter was cast today, and the rule says what to do with it", () => {
    const b = followupStateBlock({ n: 1, allowance: 30, earlier: [], said: "", today: "2026-09-29", noteName: "n", castsToday: 6 });
    expect(b).toContain("matter_casts_today: 6");
    expect(followupSystem("deep", "zh-hant", { staged: true })).toContain("matter_casts_today");
  });

  it("new copy exists in every language", () => {
    for (const l of LOCALES) {
      const s = (SHARE_STORY_T as Record<string, Record<string, string>>)[l]!;
      expect(Object.keys(s).sort(), l).toEqual(Object.keys(SHARE_STORY_T.zh).sort());
      const m = (MATTER_T as Record<string, Record<string, string>>)[l]!;
      for (const k of ["nudgeBody", "nudgeCta", "pauseTitle", "pauseBody", "pauseNext", "pauseNoNext"]) expect(m[k]!.length, `${l}.${k}`).toBeGreaterThan(0);
    }
  });
});

import { createGrant as _cg } from "../src/lib/db";
import { grantInviteLight } from "../src/lib/grants";
import { grantByRedeemSession, shareRefForSession, shareRefOwner } from "../src/lib/db";

describe("09-29 分享者回礼", () => {
  it("a share ref is stable per reading and traces a newcomer's free reading to the sharer — never to themselves", () => {
    void _cg;
    const sharer = upsertCustomer("sharer-ref@example.com", "zh-hant");
    const ref = shareRefForSession("cs_share_ref_1", sharer, "a".repeat(24));
    expect(ref).toMatch(/^[a-z2-9]{8}$/);
    expect(shareRefForSession("cs_share_ref_1", sharer, null)).toBe(ref);
    expect(shareRefOwner(ref)?.customer_id).toBe(sharer);

    const friend = upsertCustomer("newcomer-ref@example.com", "zh-hant");
    const sid = grantInviteLight("787878", "{}", "newcomer-ref@example.com", friend, "zh-hant", "deep", ref, "b".repeat(24));
    expect(grantByRedeemSession(sid)?.ref).toBe(ref);
    expect(grantByRedeemSession(sid)?.tier).toBe("deep");

    // the sharer's own browser, own address: the reading is still free, the thank-you is not
    const own = grantInviteLight("787878", "{}", "alt-ref@example.com", null, "zh-hant", "deep", ref, "a".repeat(24));
    expect(grantByRedeemSession(own)?.ref ?? null).toBeNull();
    const own2 = grantInviteLight("787878", "{}", "sharer-ref@example.com", null, "zh-hant", "deep", ref, null);
    expect(grantByRedeemSession(own2)?.ref ?? null).toBeNull();
    // a made-up ref is ignored
    const bad = grantInviteLight("787878", "{}", "x-ref@example.com", null, "zh-hant", "deep", "zzzzzzzz", null);
    expect(grantByRedeemSession(bad)?.ref ?? null).toBeNull();

    // the thank-you itself goes through the same path as a gift's, on the share thread
    const url = mintClaimReward({ token: "s".repeat(36), from_customer_id: sharer, claimed_customer_id: friend }, sid, "https://yaoflow.com", "zh-hant", "share");
    expect(url).toContain("/cast?reward=");
  });
});
