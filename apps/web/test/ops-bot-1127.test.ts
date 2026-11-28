import { describe, expect, it } from "vitest";

/** 11-27 社媒运营 bot：检查规矩、待审→批准→到点领→回报、回帖名额、MCP 鉴权 */
describe("ops bot", async () => {
  const bot = await import("../src/lib/ops-bot");
  const mcp = await import("../src/lib/ops-bot-mcp");
  // 这组测的是逐条批准的流程；自动放行在 ops-bot-auto-1128.test.ts
  (await import("../src/lib/features")).setFeature("ops-bot-auto", "off");

  it("blocks AI words, promises, forbidden topics, foreign links, crisis", () => {
    const rules = (t: string) => bot.checkText("threads", t).filter((f) => f.level === "block").map((f) => f.rule);
    expect(rules("一件事，一卦。")).toEqual([]);
    expect(rules("這是 AI 幫你解的")).toContain("no-ai");
    expect(rules("用 ChatGPT 解卦")).toContain("no-ai");
    expect(rules("包準，一定準")).toContain("no-promise");
    expect(rules("這支股票會漲嗎")).toContain("forbidden-topic");
    expect(rules("看這裡 https://example.com/x")).toContain("foreign-link");
    expect(rules("我不想活了")).toContain("crisis");
    expect(rules("x".repeat(501))).toContain("length");
    expect(bot.checkText("threads", "https://yaoflow.com/zh-hant").map((f) => f.rule)).toContain("link-tag");
    expect(bot.checkText("threads", "https://yaoflow.com/zh-hant?c=threads").length).toBe(0);
  });

  it("replies: no link or site name on the first reply, skip crisis targets", () => {
    const r = (body: string, follow = false, target = "他會不會回來") => bot.checkText("threads", body, { kind: "reply", targetText: target, followUp: follow }).filter((f) => f.level === "block").map((f) => f.rule);
    expect(r("先別急，問題可以問窄一點")).toEqual([]);
    expect(r("可以去 https://yaoflow.com/zh-hant?c=threads-reply 起一卦")).toContain("reply-link");
    expect(r("可以去 https://yaoflow.com/zh-hant?c=threads-reply 起一卦", true)).toEqual([]);
    expect(r("YaoFlow 可以算")).toContain("reply-name");
    expect(r("抱抱你", false, "好累，想死")).toContain("crisis-target");
  });

  it("review → approve → due → posted; nothing is due before approval", () => {
    const now = Date.now();
    const s = bot.submitPost({ platform: "threads", lang: "zh-hant", title: "t1", body: "今天的一籤：先把問題問窄。", rationale: "測試用的稿件" }, now);
    expect(s.ok).toBe(true);
    if (!s.ok) return;
    expect(bot.duePosts(now).some((p) => p.id === s.post.id)).toBe(false);
    expect(bot.submitPost({ platform: "threads", lang: "zh-hant", title: "bad", body: "AI 算命", rationale: "測試用的稿件" }, now).ok).toBe(false);
    expect(bot.markPosted(s.post.id, null, now).ok).toBe(false);
    expect(bot.approvePost(s.post.id, now + 5 * 60_000, "ok", now).ok).toBe(true);
    expect(bot.duePosts(now).some((p) => p.id === s.post.id)).toBe(true);
    expect(bot.markPosted(s.post.id, "https://www.threads.com/@yaoflow_app/post/abc", now).ok).toBe(true);
    expect(bot.getPost(s.post.id)!.status).toBe("posted");
    expect(bot.duePosts(now).some((p) => p.id === s.post.id)).toBe(false);
  });

  it("a note asking for a revision sends it back and shows in assignments", () => {
    const now = Date.now();
    const s = bot.submitPost({ platform: "threads", lang: "zh", title: "t2", body: "今天适合把一件事想清楚。", rationale: "測試用的稿件" }, now);
    if (!s.ok) throw new Error(s.error);
    bot.addNote(s.post.id, "开头再短一点", true, now);
    expect(bot.getPost(s.post.id)!.status).toBe("rejected");
    expect(bot.assignments().revisions.some((r) => r.post_id === s.post.id)).toBe(true);
    const r = bot.revisePost(s.post.id, { body: "把一件事想清楚。", reply: "开头删短了" }, now);
    expect(r.ok && r.post.status).toBe("review");
    expect(bot.assignments().revisions.some((x) => x.post_id === s.post.id)).toBe(false);
  });

  it("reply caps and same-target limit", () => {
    const now = Date.now();
    const url = "https://www.facebook.com/groups/1/posts/2";
    expect(bot.checkReply({ platform: "facebook", target_url: url, body: "先看用神", target_text: "幫看這卦" }, now).ok).toBe(true);
    bot.logReply({ platform: "facebook", lang: "zh-hant", target_url: url, body: "先看用神" }, now);
    bot.logReply({ platform: "facebook", lang: "zh-hant", target_url: url + "?x=1", body: "再補一句" }, now);
    const c = bot.checkReply({ platform: "facebook", target_url: "https://www.facebook.com/groups/1/posts/3", body: "先看用神" }, now);
    expect(c.ok).toBe(false);
    expect(c.findings.map((f) => f.rule)).toContain("daily-cap");
    expect(bot.checkReply({ platform: "threads", target_url: url, body: "先看用神" }, now).findings.map((f) => f.rule)).toContain("same-target");
  });

  it("MCP: token required, tools callable", async () => {
    process.env.BOT_MCP_TOKEN = "t".repeat(40);
    expect(mcp.authorized(new Request("https://x/api/bot/mcp", { method: "POST", headers: { authorization: `Bearer ${"t".repeat(40)}` } }))).toBe(true);
    expect(mcp.authorized(new Request("https://x/api/bot/mcp", { method: "POST", headers: { authorization: "Bearer nope" } }))).toBe(false);
    const g = await mcp.callTool("get_guidelines", {});
    expect(g.content[0]!.text).toContain("不以 AI 名义");
    const sub = await mcp.callTool("submit_draft", { platform: "threads", lang: "zh-hant", title: "t3", body: "問法可以照抄：這個月他會不會主動找我？", rationale: "讀者常問怎麼問" });
    expect(sub.isError).toBeFalsy();
    const sched = JSON.parse((await mcp.callTool("list_schedule", { days_ahead: 1 })).content[0]!.text) as { days: unknown[] };
    expect(sched.days.length).toBe(8); // 2 天 × 4 个平台语言（11-28 加了 IG、FB）
    expect((await mcp.callTool("nope", {})).isError).toBe(true);
  });

  it("wakeBot posts the payload with source yaoflow, and is a no-op without a URL", async () => {
    delete process.env.BOT_WEBHOOK_URL;
    expect((await bot.wakeBot({ kind: "task" })).ok).toBe(false);
    process.env.BOT_WEBHOOK_URL = "https://hooks.example/abc";
    let sent: unknown = null;
    const fake = (async (_u: string, init: RequestInit) => { sent = JSON.parse(String(init.body)); return new Response("ok"); }) as unknown as typeof fetch;
    expect((await bot.wakeBot({ kind: "task", task_id: "x" }, fake)).ok).toBe(true);
    expect(sent).toMatchObject({ source: "yaoflow", kind: "task", task_id: "x" });
    delete process.env.BOT_WEBHOOK_URL;
  });

  it("a 401 from the webhook is logged as wake_failed against the task; double-click tasks are deduped", async () => {
    process.env.BOT_WEBHOOK_URL = "https://hooks.example/abc";
    const deny = (async () => new Response("no", { status: 401 })) as unknown as typeof fetch;
    const r = await bot.wakeBot({ kind: "task", task_id: "t401" }, deny);
    expect(r).toMatchObject({ ok: false, status: 401 });
    const w = bot.botActivity(20).find((a) => a.ref === "t401");
    expect(w?.action).toBe("wake_failed");
    expect(w?.detail).toContain("401");
    delete process.env.BOT_WEBHOOK_URL;
    const a = bot.createTask({ title: "同一条", brief: "写 1 条试稿", platforms: ["threads"] }, 1_000_000);
    const b = bot.createTask({ title: "同一条", brief: "写 1 条试稿", platforms: ["threads"] }, 1_000_500) as { id: string; duplicate?: boolean };
    expect(b.id).toBe(a.id);
    expect(b.duplicate).toBe(true);
    const c = bot.createTask({ title: "同一条", brief: "写 1 条试稿", platforms: ["threads"] }, 1_100_000);
    expect(c.id).not.toBe(a.id);
  });
});
