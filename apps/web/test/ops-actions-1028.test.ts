import { describe, expect, it } from "vitest";
import { ACTIONS, bridgeLook, bridgeTone, decide, getAction, listActions, measure, pendingCount, settleActions, storeProposals, TRIAL_DAYS } from "@/lib/ops-actions";
import { getSetting, promoPick, setPromoPick } from "@/lib/promo";
import { bridgeLine, lineOk } from "@/lib/bridge";
import { dayNumbers, tpeDayStart } from "@/lib/daily-insight";

/** 10-28 进度表 119 運營動作: a fixed catalog, the model's JSON checked, nothing on until 批准, a week then back */
const DAY = 86_400_000;

describe("運營動作 catalog + parsing", () => {
  it("keeps only clean actions from the catalog, with a reason, and skips a running duplicate", () => {
    const raw = JSON.stringify({ actions: [
      { kind: "bridge_tone", params: { tone: "person" }, reason: "推荐卡出现 252 次只点 7 次" },
      { kind: "price_cut", params: { pct: 50 }, reason: "不在清单里" },
      { kind: "promo_pick", params: { surface: "home", ids: ["zhengyuan", "nope", "tarot", "bazi"] }, reason: "正缘画像页只看了 7 次" },
    ] });
    const out = storeProposals("2026-10-27", raw);
    expect(out.map((a) => a.kind)).toEqual(["bridge_tone", "promo_pick"]);
    expect(out[1]!.params).toEqual({ surface: "home", ids: ["zhengyuan", "tarot"] });
    expect(pendingCount()).toBe(2);
    // the same kind again while one is open: dropped
    expect(storeProposals("2026-10-28", JSON.stringify({ actions: [{ kind: "bridge_tone", params: { tone: "place" }, reason: "x" }] }))).toEqual([]);
    expect(storeProposals("2026-10-29", "not json")).toEqual([]);
    expect(storeProposals("2026-10-30", JSON.stringify({ actions: [{ kind: "bridge_look", params: { look: "quiet" }, reason: "default is not a change" }] }))).toEqual([]);
  });

  it("every catalog entry describes itself and rejects the default", () => {
    expect(ACTIONS.bridge_tone.clean({ tone: "result" })).toBeNull();
    expect(ACTIONS.bridge_look.clean({ look: "strong" })).toEqual({ look: "strong" });
    expect(ACTIONS.promo_pick.clean({ surface: "moon", ids: ["tarot"] })).toBeNull();
    expect(ACTIONS.promo_pick.describe({ surface: "tarot", ids: ["zhengyuan"] })).toContain("塔羅頁");
  });
});

describe("批准 → 七天 → 還原", () => {
  it("bridge_tone: off until approved, the fixed line and cache key follow, revoke puts it back", async () => {
    const a = listActions().find((x) => x.kind === "bridge_tone" && x.status === "proposed")!;
    expect(bridgeTone()).toBe("result");
    const plain = await bridgeLine("他會回來嗎", "zhengyuan", "reading", "zh-hant", { model: false });
    expect(plain.line).toContain("這件事怎麼走看結果");
    const r = decide(a.id, "approve");
    expect(r).toEqual({ ok: true, status: "active" });
    expect(bridgeTone()).toBe("person");
    const toned = await bridgeLine("他會回來嗎", "zhengyuan", "reading", "zh-hant", { model: false });
    expect(toned.line.startsWith("容易和你走在一起的是哪一類人")).toBe(true);
    expect(lineOk(toned.line, "zhengyuan")).toBe(true);
    expect(getAction(a.id)!.ends_at! - tpeDayStart(Date.now())).toBe((TRIAL_DAYS + 1) * DAY);
    // a second of the same kind cannot start while this runs
    const again = storeProposals("2026-11-01", JSON.stringify({ actions: [{ kind: "bridge_tone", params: { tone: "place" }, reason: "x" }] }));
    expect(again).toEqual([]);
    expect(decide(a.id, "revoke")).toEqual({ ok: true, status: "revoked" });
    expect(bridgeTone()).toBe("result");
    expect(decide(a.id, "approve").ok).toBe(false);
  });

  it("promo_pick: replaces the strip for the trial and restores the owner's own pick after", () => {
    setPromoPick("home", ["bazi", "zeri"]);
    const a = listActions().find((x) => x.kind === "promo_pick" && x.status === "proposed")!;
    expect(decide(a.id, "approve").ok).toBe(true);
    expect(promoPick("home").ids).toEqual(["zhengyuan", "tarot"]);
    // the week is over: measured, switched back, verdict written
    const past = Date.now() + (TRIAL_DAYS + 2) * DAY;
    expect(settleActions(past)).toBe(1);
    const done = getAction(a.id)!;
    expect(done.status).toBe("done");
    expect(["better", "worse", "same", "unclear"]).toContain(done.verdict);
    expect(promoPick("home").ids).toEqual(["bazi", "zeri"]);
    // 長期保留 turns it on again; 停掉 restores once more
    expect(decide(a.id, "keep")).toEqual({ ok: true, status: "kept" });
    expect(promoPick("home").ids).toEqual(["zhengyuan", "tarot"]);
    expect(decide(a.id, "stop")).toEqual({ ok: true, status: "revoked" });
    expect(promoPick("home").ids).toEqual(["bazi", "zeri"]);
    expect(getSetting("ops:bridge_look")).not.toBe("strong");
    expect(bridgeLook()).toBe("quiet");
  });

  it("measure reads the summary's numbers (promoClicks is there, rates are per cent)", () => {
    const n = dayNumbers(tpeDayStart(Date.now()));
    expect(typeof n.promoClicks).toBe("object");
    const m = measure({ kind: "bridge_look", params: { look: "strong" } }, Date.now() - 2 * DAY, Date.now());
    expect(m.days).toBeGreaterThanOrEqual(2);
    expect(m.rate === null || (m.rate >= 0 && m.rate <= 100)).toBe(true);
  });
});
