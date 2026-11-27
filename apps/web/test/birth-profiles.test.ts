import { describe, expect, it } from "vitest";
import { PROFILE_MAX, cleanProfile, deleteAllProfiles, deleteProfile, listProfiles, saveProfiles } from "../src/lib/birth-profiles";
import { ACCOUNT_TABS, HASH_TAB, pickTab, tabT } from "../src/lib/dict/account-tabs";
import { LOCALES } from "../src/lib/locales";

/** 10-22 进度表 76 ⑤ — 生辰檔案 kept with the account, and the four tabs of 「我的」 */
const birth = (y: number, extra: Record<string, unknown> = {}) => ({ id: `p${y}abc`, who: "self", name: "我", gender: "female", input: { calendar: "solar", y, m: 3, d: 27, timeMode: "exact", h: 2, mi: 55, placeId: "tw-tpe", trueSolar: true, zi: "next" }, at: y, ...extra });

describe("生辰檔案 (76 ⑤)", () => {
  it("cleanProfile: a real birth passes with only the chart fields kept; junk, a bad id, a bad date or an unknown `who` do not", () => {
    const ok = cleanProfile({ ...birth(1993), input: { ...birth(1993).input, extra: "x", place: { id: "g1", name: "竹北", lat: 24.8, lon: 121.0, tz: "Asia/Taipei", junk: 1 } } });
    expect(ok).toBeTruthy();
    expect(ok!.input).not.toHaveProperty("extra");
    expect(ok!.input.place).toEqual({ id: "g1", name: "竹北", lat: 24.8, lon: 121.0, tz: "Asia/Taipei" });
    expect(ok!.gender).toBe("female");
    expect(cleanProfile(null)).toBeNull();
    expect(cleanProfile("x")).toBeNull();
    expect(cleanProfile(birth(1993, { id: "../etc" }))).toBeNull();
    expect(cleanProfile(birth(1993, { who: "boss" }))).toBeNull();
    expect(cleanProfile({ ...birth(1993), input: { calendar: "solar", y: 1993, m: 2, d: 31, timeMode: "unknown" } })).toBeNull();
    expect(cleanProfile(birth(1993, { gender: "x" }))!.gender).toBeUndefined();
    expect(cleanProfile(birth(1993, { name: "" }))!.name).toBe("我");
  });

  it("the account keeps at most PROFILE_MAX, newest first; one tap deletes one, one tap deletes all; another account sees none of it", () => {
    const me = 7001, other = 7002;
    const list = Array.from({ length: PROFILE_MAX + 3 }, (_, i) => cleanProfile(birth(1980 + i))!);
    const kept = saveProfiles(me, list);
    expect(kept).toHaveLength(PROFILE_MAX);
    expect(kept[0]!.at).toBe(1980 + PROFILE_MAX + 2);
    expect(listProfiles(me).map((p) => p.at)).toEqual(kept.map((p) => p.at));
    expect(listProfiles(other)).toEqual([]);
    // an upsert of the same id replaces, not duplicates
    saveProfiles(me, [cleanProfile({ ...birth(1980 + PROFILE_MAX + 2), name: "改名", at: 3000 })!]);
    expect(listProfiles(me)).toHaveLength(PROFILE_MAX);
    expect(listProfiles(me)[0]!.name).toBe("改名");
    expect(deleteProfile(me, kept[1]!.id)).toBe(true);
    expect(deleteProfile(me, kept[1]!.id)).toBe(false);
    expect(deleteProfile(other, kept[0]!.id)).toBe(false);
    expect(listProfiles(me)).toHaveLength(PROFILE_MAX - 1);
    expect(deleteAllProfiles(me)).toBe(PROFILE_MAX - 1);
    expect(listProfiles(me)).toEqual([]);
  });

  it("「我的」four tabs: names in nine languages, the old tab and hash names still land on the tab they became, a payment return opens the plan", () => {
    expect(ACCOUNT_TABS).toEqual(["revisit", "record", "profiles", "plan"]);
    for (const l of LOCALES) for (const k of ACCOUNT_TABS) expect(tabT(l)[k].length).toBeGreaterThan(0);
    expect(tabT("zh-hant")).toMatchObject({ revisit: "回訪", record: "記錄", profiles: "生辰檔案", plan: "額度與方案" });
    expect(tabT("zh-hant").profilesLead).not.toMatch(/準|AI|靈驗|神明說/);
    expect(pickTab({})).toBe("revisit");
    expect(pickTab({ tab: "mine" })).toBe("revisit");
    expect(pickTab({ tab: "member" })).toBe("plan");
    expect(pickTab({ tab: "share" })).toBe("record");
    expect(pickTab({ tab: "profiles" })).toBe("profiles");
    expect(pickTab({ sub: "cs_x" })).toBe("plan");
    expect(pickTab({ want: "pass" })).toBe("plan");
    expect(HASH_TAB.membership).toBe("plan"); expect(HASH_TAB.gift).toBe("plan"); expect(HASH_TAB.referrals).toBe("record"); expect(HASH_TAB.atlas).toBe("record"); expect(HASH_TAB.profiles).toBe("profiles");
  });
});
