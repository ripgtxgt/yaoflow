import { timingSafeEqual } from "node:crypto";
import {
  assignments, botLog, checkReply, checkText, duePosts, getPost, hasBlock, listPosts, logReply, markFailed, markPosted, notesFor,
  PLATFORMS, REPLY_DAILY_CAP, repliesToday, revisePost, schedule, startTask, submitPost, SUBMIT_DAILY_CAP,
  type BotLang, type BotPlatform, type PostStatus,
} from "./ops-bot";
import { promoNumbers } from "./promo-stats";

/**
 * 11-27 运营 bot 的 MCP 服务器（Streamable HTTP，无状态，JSON 回应）——YaoFlow 自己的 Grok Bot 在「插件 → 自定义远程 MCP」里接这里。
 * 鉴权：Authorization: Bearer BOT_MCP_TOKEN（≥ 32 字）。每分钟 60 次。它只能看规范与排期、交稿改稿、领已批稿去发并回报、
 * 回帖前检查与回帖后登记、看各来源带来的访客；不能批准、不能碰客户与订单。
 */
export const PROTOCOL = "2025-06-18";

export function authorized(req: Request): boolean {
  const token = process.env.BOT_MCP_TOKEN ?? "";
  const got = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  return token.length >= 32 && got.length === token.length && timingSafeEqual(Buffer.from(got), Buffer.from(token));
}

const hits: number[] = [];
export function rateLimited(now = Date.now()): boolean {
  while (hits.length && hits[0]! < now - 60_000) hits.shift();
  if (hits.length >= 60) return true;
  hits.push(now);
  return false;
}

const BRAND = {
  "zh-hant": "一件事，一卦。排盤按老規矩算，解讀講人話，應期到了會回來問你",
  zh: "一件事，一卦。排盘按老规矩算，解读讲人话，应期到了会回来问你",
};

export const GUIDELINES = {
  who: "你是 YaoFlow（yaoflow.com，繁體「YaoFlow 一事一卦」）的社媒运营。读者主要在台湾、香港（繁體），简体面向马来西亚、新加坡与海外华人。产品是六爻起卦、解籤、擲筊、本命卦、尋物等东方占问工具，定位是「帮人把一件事想清楚」，不是宿命论。",
  brand_line: BRAND,
  red_lines: [
    "不以 AI 名义：帖子、回帖里不出现 AI、人工智慧、模型、GPT、机器人；被问「是不是 AI」不回那一句，其余照常。",
    "不承诺准确：不说一定、保证、百分之百、包准。被问准不准：排盘是确定的，解读只照盘面讲，应期到了会回来问你应没应。",
    "不碰：生死、疾病手术、投资股票币价、赌博彩票、第三者隐私；不评价同行；宗教政治、争议、攻击一律不回。",
    "对方的话里有轻生、自伤的意思：不回卦，不回籤，跳过，并用 send_report 告诉管理员。",
    "不编当事人、不编应验、不编数据；卦例只用真实排出来的，应期日期必须晚于发布日。",
    "不发私信，不加好友，不注册、不输密码、不过验证码、不点同意条款；掉登录就停下并 send_report。",
    "不向读者解释我们内部怎么设计、怎么限流、怎么存数据；只告诉他下一步怎么做。",
    "简体帖用新马与海外华人熟悉的说法，不去任何大陆平台。",
  ],
  platforms: {
    threads: "Threads @yaoflow_app：每天繁體 2 条＋简体 2 条（list_schedule 看缺口）。短、口语、第一行就是钩子；带卡卦例、今日一籤、「可照抄的問法」、本命卦、节气节日帖。正文≤500 字。帖子可以带一个 yaoflow.com 链接，必须带来源标签：繁體 ?c=threads，简体 ?c=threads-zh。",
    instagram: "Instagram @yaoflow_app：带图的条目同步一条，文案改写，结尾「連結在簡介」＋3–5 个繁體标签；纯文字条目不发 IG。",
    facebook: "FB 专页「YaoFlow 一事一卦」：每周 3 条（一、三、五），与 Threads 同源改写，链接带 ?c=fbpage。FB 繁體社團只以专页身份留言答卦，不发帖、不放链接，每天最多 2 条。",
  },
  replies: {
    who_to_reply: "真人公开提问：六爻、易經、卜卦、求籤解籤、擲筊、塔羅、黃曆擇日、紫微八字、星盤、生肖運勢；也可以回没提占卜的感情求助帖（該不該等、要不要主動、斷聯、已讀不回、他會不會回來）。不回竞品账号、营销号、讨论「AI 算命準不準」的帖。找不到合适对象就照实少回，不要为凑数降低标准。",
    first_reply: "第一条 2–4 行：先接住他的情绪和这件事，教他把问题问窄（「他心裡怎麼想我」→「這個月他會不會主動找我」），末句留钩子「想知道哪幾天會有動靜，可以為這件事起一卦」。不放链接、不提站名、不推产品、不说免费、不自称老师。",
    second_reply: "对方在我们的回覆下接话（哪怕只说谢谢）→ 第二条可以给一次链接：繁體 https://yaoflow.com/zh-hant?c=threads-reply，简体 https://yaoflow.com/zh?c=threads-reply。每人只给一次。调用 check_reply 时 follow_up=true。",
    interpret: "Threads、IG 上不直接替人解卦、解籤（不讲卦象、爻、用神、应期，不讲籤诗吉凶），只答问法、步骤、术语。FB 繁體社團可以按对方贴出的卦来解：用神、旺衰、动变、应期，先说结论；资料不全只问一句补什么；不放链接、不提站名。",
    caps: REPLY_DAILY_CAP,
    language: "语言随对方：繁體问就回繁體，简体问就回简体。",
  },
  workflow: [
    "被 Webhook 唤醒或例行运行时，先 get_assignments：有任务就 start_task → 写稿 → check_draft → submit_draft（带 task_id）；有批注就 revise_draft。",
    "写稿例行：get_guidelines → list_schedule 看未来 7 天缺口 → 写 → check_draft 到 0 个 block → submit_draft（suggested_time 填建议发布时间）。检查全过的稿会自动排进下一个空档（台北 Threads 繁 12:30／20:30、简 12:30／22:00，IG、FB 20:30，至少 2 小时后），管理员可在发出前撤回；繁体稿不能混简体字，标题带「测试」的不会自动排；同一选题的 Threads 繁、简两版会自动错开到不同天，繁简两版最好也写成不同的切入角度，别只是字形转换。",
    "发帖例行：get_due_posts 拿到点的已批稿 → 在 Mac 的 YaoFlow 专用 Chrome 里发到对应平台 → mark_posted（填帖子网址）；发不出去 mark_failed 写原因，不要反复重试。只发 get_due_posts 给你的稿件，一个字都不改。",
    "回帖巡回：每轮在各平台找对象 → 每条先 check_reply（0 个 block 才能发）→ 发出后马上 log_reply。名额用完或连续找不到对象就结束这一轮。",
    "每轮结束用 send_report 汇报三行以内：发了什么、回了几条、遇到什么问题（掉登录、验证码、被平台提示）。",
  ],
  submit_daily_cap: SUBMIT_DAILY_CAP,
};

const S = { type: "string" } as const;
const platformProp = { type: "string", enum: PLATFORMS } as const;
const langProp = { type: "string", enum: ["zh-hant", "zh"], description: "zh-hant 繁體 · zh 简体" } as const;
const obj = (properties: Record<string, unknown>, required: string[] = []) => ({ type: "object", properties, required, additionalProperties: false });

export const TOOLS = [
  { name: "get_guidelines", description: "YaoFlow 的品牌口径、红线、各平台写法、回帖规矩和工作流程。每次运行先调用。", inputSchema: obj({}) },
  { name: "list_schedule", description: "未来 N 天（默认 7）每天各平台各语言该发几条、已有几条（待审＋已批＋已发）、差几条，和已排的稿件。", inputSchema: obj({ days_ahead: { type: "integer", minimum: 0, maximum: 14 } }) },
  { name: "check_draft", description: "帖子发布前检查（不保存）。返回 block（必须改）和 warn（建议改）。交稿前先自查到 0 个 block。带上 lang 和 title，繁体稿会查有没有混简体字。", inputSchema: obj({ platform: platformProp, lang: langProp, title: S, body: S }, ["platform", "body"]) },
  { name: "submit_draft", description: "交一篇帖子。检查全过就自动排进下一个空档，到点出现在 get_due_posts 里；没过的留在待审等管理员。同一选题多平台／多语言版本传同一个 topic_id（第一次交稿返回的）。每天最多 30 篇。", inputSchema: obj({ platform: platformProp, lang: langProp, title: { type: "string", description: "给管理员看的短标题" }, body: { type: "string", description: "要发出去的正文，原样" }, media_notes: { type: "string", description: "配图：用哪张卡（网址）或怎么做图" }, suggested_time: { type: "string", description: "建议发布时间，ISO 8601 带时区，例 2026-12-01T09:30:00+08:00" }, topic_id: S, task_id: S, rationale: { type: "string", description: "为什么写这篇：依据的读者问题、节气、数据" } }, ["platform", "lang", "title", "body", "rationale"]) },
  { name: "get_assignments", description: "派给你的任务（open／in_progress）和需要按批注修改的稿件。被唤醒或例行运行时先调用。", inputSchema: obj({}) },
  { name: "start_task", description: "开始处理某个任务（open → in_progress），防止重复做。", inputSchema: obj({ task_id: S }, ["task_id"]) },
  { name: "get_feedback", description: "读某篇稿件的全部批注。", inputSchema: obj({ post_id: S }, ["post_id"]) },
  { name: "revise_draft", description: "按批注修改你交的稿件（待审或被退回的）。改完回到待审，reply 逐条说明改了什么。", inputSchema: obj({ post_id: S, title: S, body: S, reply: S }, ["post_id", "reply"]) },
  { name: "list_my_posts", description: "你交过的稿件和状态：review 待审 / approved 已批准待发 / posted 已发 / failed 发失败 / rejected 退回。", inputSchema: obj({ status: { type: "string", enum: ["review", "approved", "posted", "failed", "rejected"] }, limit: { type: "integer", minimum: 1, maximum: 100 } }) },
  { name: "get_due_posts", description: "现在该发的已批稿（到点或 10 分钟内到点）：平台、语言、正文原文、配图。发帖例行先调用。", inputSchema: obj({}) },
  { name: "mark_posted", description: "回报一篇已经发出去了，填帖子网址。", inputSchema: obj({ post_id: S, external_url: S }, ["post_id"]) },
  { name: "mark_failed", description: "回报一篇没发出去和原因（掉登录、验证码、平台拒绝…）。不要反复重试。", inputSchema: obj({ post_id: S, error: S }, ["post_id", "error"]) },
  { name: "check_reply", description: "回帖前检查（不保存）：规矩、对方帖子内容、今天还剩几个名额、这一帖是不是回过了。0 个 block 才能发。", inputSchema: obj({ platform: platformProp, target_url: { type: "string", description: "要回的那一帖的网址" }, target_text: { type: "string", description: "对方帖子的原文（用来查危机词与不回的话题）" }, body: { type: "string", description: "你要回的内容" }, follow_up: { type: "boolean", description: "对方是不是在我们的回覆下接话（第二条起才可以带链接）" } }, ["platform", "target_url", "body"]) },
  { name: "log_reply", description: "回帖发出后马上登记。", inputSchema: obj({ platform: platformProp, lang: langProp, target_url: S, target_excerpt: { type: "string", description: "对方帖子开头一句" }, body: S, external_url: { type: "string", description: "我们这条回覆的网址（拿得到就填）" } }, ["platform", "lang", "target_url", "body"]) },
  { name: "get_performance", description: "近 N 天（7／14／28）各来源标签带来的访客、起卦、付费（只看社媒相关标签），以及发帖数、回帖数。用来调整写什么、回什么。", inputSchema: obj({ days: { type: "integer", enum: [7, 14, 28] } }) },
  { name: "send_report", description: "给管理员留言：每轮结束的汇报、遇到的问题（掉登录、验证码、平台警告、需要人决定的事）。显示在 /admin/bot。", inputSchema: obj({ body: S, level: { type: "string", enum: ["info", "problem"] } }, ["body"]) },
] as const;

const text = (o: unknown) => ({ content: [{ type: "text", text: typeof o === "string" ? o : JSON.stringify(o, null, 2) }] });
const err = (m: string, extra?: unknown) => ({ ...text(extra ? { error: m, ...((extra as object) ?? {}) } : m), isError: true });
const str = (v: unknown, max = 20_000) => (typeof v === "string" ? v.slice(0, max) : "");
const isPlatform = (v: unknown): v is BotPlatform => typeof v === "string" && (PLATFORMS as string[]).includes(v);
const isLang = (v: unknown): v is BotLang => v === "zh-hant" || v === "zh";
const SOCIAL_TAG = /^(?:threads|ig|fbpage|fb|~threads|~ref:(?:l\.)?(?:facebook|instagram|threads))/;

function slim(p: NonNullable<ReturnType<typeof getPost>>) {
  return { post_id: p.id, topic_id: p.topic_id, platform: p.platform, lang: p.lang, title: p.title, status: p.status, scheduled_at: p.scheduled_at ? new Date(p.scheduled_at).toISOString() : null, posted_at: p.posted_at ? new Date(p.posted_at).toISOString() : null, external_url: p.external_url, error: p.error, text_version: p.text_version, open_notes: notesFor(p.id).filter((n) => !n.resolved).length };
}

export async function callTool(name: string, raw: unknown, now = Date.now()): Promise<{ content: { type: string; text: string }[]; isError?: boolean }> {
  const a = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  switch (name) {
    case "get_guidelines": return text(GUIDELINES);
    case "list_schedule": {
      const n = Number.isInteger(a.days_ahead) ? Math.min(14, Math.max(0, Number(a.days_ahead))) : 7;
      const s = schedule(n, now);
      return text({ gaps: s.days.filter((d) => d.gap > 0), days: s.days, upcoming: s.upcoming.map((p) => ({ ...p, scheduled_at: p.scheduled_at ? new Date(p.scheduled_at).toISOString() : null, suggested_at: p.suggested_at ? new Date(p.suggested_at).toISOString() : null })) });
    }
    case "check_draft": {
      if (!isPlatform(a.platform)) return err("platform 要是 threads／instagram／facebook");
      const f = checkText(a.platform, str(a.body), { kind: "post", lang: isLang(a.lang) ? a.lang : undefined, title: a.title === undefined ? undefined : str(a.title, 120) });
      return text({ ok: !hasBlock(f), findings: f });
    }
    case "submit_draft": {
      if (!isPlatform(a.platform) || !isLang(a.lang)) return err("platform、lang 不对");
      const title = str(a.title, 120).trim(), body = str(a.body).trim(), rationale = str(a.rationale, 500).trim();
      if (!title || !body || rationale.length < 5) return err("title、body、rationale（≥5 字）都要填");
      const t = a.suggested_time ? Date.parse(str(a.suggested_time, 40)) : NaN;
      const r = submitPost({ platform: a.platform, lang: a.lang, title, body, media_notes: str(a.media_notes, 1500) || null, rationale, suggested_at: Number.isFinite(t) ? t : null, topic_id: str(a.topic_id, 64) || null, task_id: str(a.task_id, 64) || null }, now);
      return r.ok ? text({ accepted: true, post_id: r.post.id, topic_id: r.post.topic_id, status: "review" }) : err(r.error, { findings: r.findings });
    }
    case "get_assignments": return text(assignments());
    case "start_task": {
      const t = startTask(str(a.task_id, 64), now);
      if (!t) return err("任务不存在");
      return t.status === "in_progress" ? text({ started: t }) : err(`任务现在是 ${t.status}，不用再做`);
    }
    case "get_feedback": {
      const p = getPost(str(a.post_id, 64));
      if (!p) return err("稿件不存在");
      return text({ ...slim(p), body: p.body, notes: notesFor(p.id).map((n) => ({ by: n.author, text: n.body, resolved: !!n.resolved })) });
    }
    case "revise_draft": {
      const reply = str(a.reply, 500).trim();
      if (reply.length < 2) return err("reply 要说明改了什么");
      const r = revisePost(str(a.post_id, 64), { title: str(a.title, 120) || undefined, body: str(a.body) || undefined, reply }, now);
      return r.ok ? text({ revised: true, ...slim(r.post) }) : err(r.error, { findings: r.findings });
    }
    case "list_my_posts": {
      const st = ["review", "approved", "posted", "failed", "rejected"].includes(String(a.status)) ? (a.status as PostStatus) : undefined;
      const lim = Number.isInteger(a.limit) ? Math.min(100, Math.max(1, Number(a.limit))) : 50;
      return text(listPosts(st, lim).map(slim));
    }
    case "get_due_posts": {
      const due = duePosts(now);
      botLog("get_due_posts", { n: due.length }, null, now);
      return text(due.map((p) => ({ post_id: p.id, platform: p.platform, lang: p.lang, scheduled_at: new Date(p.scheduled_at!).toISOString(), body: p.body, media_notes: p.media_notes, retry: p.status === "failed" })));
    }
    case "mark_posted": {
      const u = str(a.external_url, 500).trim();
      const r = markPosted(str(a.post_id, 64), /^https:\/\//.test(u) ? u : null, now);
      return r.ok ? text({ ok: true }) : err(r.error!);
    }
    case "mark_failed": {
      const r = markFailed(str(a.post_id, 64), str(a.error, 500) || "未写原因", now);
      return r.ok ? text({ ok: true }) : err(r.error!);
    }
    case "check_reply": {
      if (!isPlatform(a.platform)) return err("platform 不对");
      const url = str(a.target_url, 500).trim();
      if (!/^https:\/\//.test(url)) return err("target_url 要填对方帖子的网址");
      return text(checkReply({ platform: a.platform, target_url: url, target_text: str(a.target_text, 5000), body: str(a.body, 5000), follow_up: a.follow_up === true }, now));
    }
    case "log_reply": {
      if (!isPlatform(a.platform) || !isLang(a.lang)) return err("platform、lang 不对");
      const url = str(a.target_url, 500).trim(), body = str(a.body, 5000).trim();
      if (!/^https:\/\//.test(url) || !body) return err("target_url、body 要填");
      const ext = str(a.external_url, 500).trim();
      return text(logReply({ platform: a.platform, lang: a.lang, target_url: url, target_excerpt: str(a.target_excerpt, 300), body, external_url: /^https:\/\//.test(ext) ? ext : null }, now));
    }
    case "get_performance": {
      const days = [7, 14, 28].includes(Number(a.days)) ? Number(a.days) : 7;
      let campaigns: unknown[] = [];
      try {
        const n = promoNumbers(now - days * 86_400_000, now) as { byCampaign?: { c: string }[] };
        campaigns = (n.byCampaign ?? []).filter((x) => SOCIAL_TAG.test(x.c));
      } catch { /* 事件文件读不到时只给发帖回帖数 */ }
      const posted = listPosts("posted", 500).filter((p) => (p.posted_at ?? 0) >= now - days * 86_400_000);
      return text({ days, by_source_tag: campaigns, posts_published: posted.length, replies_today: repliesToday(now), note: "threads／threads-zh＝帖子，threads-reply＝回帖第二条的链接，ig、fbpage 同理。" });
    }
    case "send_report": {
      const body = str(a.body, 2000).trim();
      if (!body) return err("body 要填");
      botLog(a.level === "problem" ? "report_problem" : "report", { body }, null, now);
      return text({ ok: true });
    }
    default: return err(`unknown tool: ${name}`);
  }
}
