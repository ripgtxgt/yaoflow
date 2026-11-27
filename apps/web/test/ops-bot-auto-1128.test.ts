import { describe, expect, it } from "vitest";

/** 11-28 自动放行（Sakura：「每天发贴子为什么还要我逐一批准呢，太麻烦了」） */
describe("ops bot auto-approve", async () => {
  const bot = await import("../src/lib/ops-bot");
  const { setFeature } = await import("../src/lib/features");
  const { homeDayStart } = await import("../src/lib/clock");
  setFeature("ops-bot-auto", "on");
  // 台北 2026-12-01 09:00
  const now = Date.parse("2026-12-01T01:00:00Z");
  const day = homeDayStart(now);
  const at = (hhmm: string, d = 0) => { const [h, m] = hhmm.split(":").map(Number); return day + d * 86_400_000 + (h * 60 + m) * 60_000; };
  const sub = (lang: "zh-hant" | "zh", title: string, body: string, platform: "threads" | "instagram" | "facebook" = "threads") => {
    const r = bot.submitPost({ platform, lang, title, body, rationale: "自动放行测试" }, now);
    if (!r.ok) throw new Error(r.error);
    return bot.getPost(r.post.id)!;
  };

  it("flags simplified characters in a traditional post, title included", () => {
    const rules = (title: string, body: string) => bot.checkText("threads", body, { kind: "post", lang: "zh-hant", title }).filter((f) => f.level === "block").map((f) => f.rule);
    expect(rules("可照抄的問法", "問得窄一點，感情與面試都一樣。逢沖、範圍、聖筊笑筊陰筊。")).toEqual([]);
    expect(rules("可照抄的問法", "感情與面试都一樣")).toContain("simplified-in-hant");
    expect(rules("测试任务：問法", "問得窄一點")).toContain("simplified-in-hant");
    expect(bot.checkText("threads", "问得窄一点", { kind: "post", lang: "zh" }).length).toBe(0);
    expect(bot.submitPost({ platform: "threads", lang: "zh-hant", title: "x", body: "这样问比较好", rationale: "r" }, now).ok).toBe(false);
  });

  it("fills the next free slots at least 2 hours out, per platform and language", () => {
    const a = sub("zh-hant", "繁一", "把問題問窄一點。");
    const b = sub("zh-hant", "繁二", "先想清楚要問哪一件事。");
    const c = sub("zh-hant", "繁三", "一件事，一卦。");
    const d = sub("zh", "简一", "把问题问窄一点。");
    const ig = sub("zh-hant", "IG 一", "一件事，一卦。", "instagram");
    expect([a, b, c, d, ig].every((p) => p.status === "approved" && p.decided_reason === "自动放行")).toBe(true);
    expect(a.scheduled_at).toBe(at("12:30"));
    expect(b.scheduled_at).toBe(at("20:30"));
    expect(c.scheduled_at).toBe(at("12:30", 1));
    expect(d.scheduled_at).toBe(at("12:30"));
    expect(ig.scheduled_at).toBe(at("20:30"));
    expect(bot.duePosts(at("12:25")).map((p) => p.id)).toEqual(expect.arrayContaining([a.id, d.id]));
  });

  it("skips test titles, admin-unscheduled posts and posts waiting on an admin note", () => {
    const t = sub("zh-hant", "測試任務", "一件事，一卦。");
    expect(t.status).toBe("review");
    expect(t.decided_reason).toContain("测试");
    const u = sub("zh", "简二", "先想清楚要问哪一件事。");
    expect(u.status).toBe("approved");
    expect(bot.unschedulePost(u.id, "这篇语气不对", now).ok).toBe(true);
    bot.autoSchedule(now);
    expect(bot.getPost(u.id)!.status).toBe("review");
    bot.addNote(u.id, "改短一点", true, now);
    expect(bot.revisePost(u.id, { body: "想清楚要问哪件事。", reply: "改短了" }, now).ok).toBe(true);
    expect(bot.getPost(u.id)!.status).toBe("approved");
  });

  it("does nothing when the switch is off", () => {
    setFeature("ops-bot-auto", "off");
    const p = sub("zh", "简三", "一件事，一卦。");
    expect(p.status).toBe("review");
    setFeature("ops-bot-auto", "on");
  });
});
