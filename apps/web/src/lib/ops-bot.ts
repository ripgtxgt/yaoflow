import { randomUUID } from "node:crypto";
import { db } from "./db";
import { isCrisis } from "./crisis";
import { homeDay, homeDayStart } from "./clock";
import { featureState } from "./features";

/**
 * 11-27 运营 bot（Sakura：「我需要用 grokbot 新建另外一个 bot 去做自动运营」→「可以的」）.
 *
 * YaoFlow 自己的 Grok Bot（和 Tresora 的那个是两个 bot，互不相通）通过 /api/bot/mcp 接进来，做三件事：
 *   写稿 — 交到「待审」，管理员在 /admin/bot 批准并定时间后才会发；
 *   发帖 — 它在 Mac 上用电脑操控，把到点的已批稿发到 Threads／IG／FB 专页，再回报「已发」；
 *   回帖 — 每轮巡回先 check_reply（规矩＋当天名额），发了再 log_reply。回帖不逐条审，按 guidelines 的规矩自动回
 *          （以前 09-14 Neil 批过「回复按批过的规则自动回」，这里沿用）。
 * 它碰不到客户、订单、邮件；不能自己批准。每次调用都记进 bot_log。
 * 写作规范沿用《推广自动化运营方案》《推广经验库》的口径（不以 AI 名义、不承诺准确、第一条回复不放链接等）。
 */

export type BotPlatform = "threads" | "instagram" | "facebook";
export type BotLang = "zh-hant" | "zh";
export type PostStatus = "review" | "approved" | "posted" | "failed" | "rejected";
export type TaskStatus = "open" | "in_progress" | "submitted" | "done" | "cancelled";
export const PLATFORMS: BotPlatform[] = ["threads", "instagram", "facebook"];
export const PLATFORM_ZH: Record<BotPlatform, string> = { threads: "Threads @yaoflow_app", instagram: "Instagram @yaoflow_app", facebook: "FB 专页「YaoFlow 一事一卦」与繁體社團" };
export const STATUS_ZH: Record<PostStatus, string> = { review: "待审", approved: "已批准·待发", posted: "已发", failed: "发失败", rejected: "已退回" };

/** 每天每个平台最多回几条（以前每轮 6 个名额常用不满；FB 社團原规矩每天 ≤2） */
export const REPLY_DAILY_CAP: Record<BotPlatform, number> = { threads: 36, instagram: 6, facebook: 2 };
export const SUBMIT_DAILY_CAP = 30;
/** 每天各发几条（目标，list_schedule 按这个算缺口） */
export const DAILY_TARGET: { platform: BotPlatform; lang: BotLang; n: number }[] = [
  { platform: "threads", lang: "zh-hant", n: 2 },
  { platform: "threads", lang: "zh", n: 2 },
  { platform: "instagram", lang: "zh-hant", n: 1 },
  { platform: "facebook", lang: "zh-hant", n: 1 },
];
/**
 * 11-28 自动放行（Sakura：「每天发贴子为什么还要我逐一批准呢，太麻烦了」）：检查全过的稿自动排进下一个空档，
 * 至少留 AUTO_LEAD 给管理员在「已批准，等着发」里撤回；不看也照发。功能开关 ops-bot-auto 关掉＝回到逐条批准。
 * 档期（台北时间，对上 bot 发帖例行 09:30／12:30／20:30／22:00）：每平台每语言每天至多 DAILY_TARGET 条。
 */
export const AUTO_LEAD = 2 * 60 * 60_000;
export const SLOTS: Record<string, string[]> = {
  "threads/zh-hant": ["12:30", "20:30"],
  "threads/zh": ["12:30", "22:00"],
  "instagram/zh-hant": ["20:30"],
  "facebook/zh-hant": ["20:30"],
};
export const autoOn = () => featureState("ops-bot-auto") === "on";
const DAY = 86_400_000;
const LIMIT: Record<BotPlatform, number> = { threads: 500, instagram: 2200, facebook: 5000 };

let ready = false;
function ensure(): void {
  if (ready) return;
  db().exec(`
    CREATE TABLE IF NOT EXISTS bot_posts (
      id TEXT PRIMARY KEY, topic_id TEXT NOT NULL, platform TEXT NOT NULL, lang TEXT NOT NULL,
      title TEXT NOT NULL, body TEXT NOT NULL, media_notes TEXT, rationale TEXT, task_id TEXT,
      suggested_at INTEGER, status TEXT NOT NULL, scheduled_at INTEGER, posted_at INTEGER, external_url TEXT,
      error TEXT, attempts INTEGER NOT NULL DEFAULT 0, text_version INTEGER NOT NULL DEFAULT 1,
      decided_reason TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS bot_posts_status ON bot_posts (status, scheduled_at);
    CREATE TABLE IF NOT EXISTS bot_notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT, post_id TEXT NOT NULL, author TEXT NOT NULL, body TEXT NOT NULL,
      resolved INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS bot_tasks (
      id TEXT PRIMARY KEY, title TEXT NOT NULL, brief TEXT NOT NULL, platforms TEXT NOT NULL, due_at INTEGER,
      status TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS bot_replies (
      id INTEGER PRIMARY KEY AUTOINCREMENT, platform TEXT NOT NULL, lang TEXT NOT NULL, target_url TEXT NOT NULL,
      target_excerpt TEXT, body TEXT NOT NULL, has_link INTEGER NOT NULL, external_url TEXT, day TEXT NOT NULL, created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS bot_replies_day ON bot_replies (day, platform);
    CREATE TABLE IF NOT EXISTS bot_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT, at INTEGER NOT NULL, action TEXT NOT NULL, ref TEXT, detail TEXT NOT NULL
    );
  `);
  ready = true;
}

export function botLog(action: string, detail: Record<string, unknown>, ref: string | null = null, now = Date.now()): void {
  ensure();
  db().prepare("INSERT INTO bot_log (at, action, ref, detail) VALUES (?,?,?,?)").run(now, action, ref, JSON.stringify(detail).slice(0, 4000));
}

// ───────────────────────── 规矩检查 ─────────────────────────

export interface Finding { level: "block" | "warn"; rule: string; message: string }

const AI_WORDS = /(?:^|[^A-Za-z])AI(?![A-Za-z])|人工智[慧能]|大模型|語言模型|语言模型|LLM|GPT|ChatGPT|Claude|Grok|機器人|机器人/i;
const PROMISE = /一定[準准會会]|百分之百|100\s*%\s*[準准]|保[證证]|包[準准中]|絕對[準准會会]|绝对[准会]|必定應驗|必定应验|鐵口直斷|铁口直断/;
const FORBIDDEN = /賭|赌|彩票|樂透|乐透|博彩|六合彩|股票|股價|股价|幣價|币价|期貨|期货|病情|癌|腫瘤|肿瘤|手術|手术|開刀|开刀|會不會死|会不会死|壽命|寿命|死期/;
const URL_RE = /https?:\/\/[^\s)）」』]+/gi;

function links(text: string): string[] {
  return text.match(URL_RE) ?? [];
}
const ours = (u: string) => /^https?:\/\/(?:www\.)?yaoflow\.com(?:[/?#]|$)/i.test(u);

/** 帖子（post）和回帖（reply）共用的检查。replyContext 只在回帖时传。 */
/** 只在简体里出现、繁体不会用的常见字（11-28：一篇繁体 Threads 稿混了「面试」）。宁少勿错：两边通用的字不收。 */
const SIMPLIFIED_ONLY = "这们说时会对发经过还进没问题书关点门间现应开动头见长两实东车买卖钱气单网让认识请读试员务观运话语论边层场处备难爱带术态尽听写学习觉医药价费报纸简级结给继续线练组织绿细终统总节约为国际图样谁该缘财运运势吗么谢阴圣笔记录选择变缘恋离复们刚岁归问应验验虑断这样让过时间较总从";
const SIMP_RE = new RegExp(`[${[...new Set(SIMPLIFIED_ONLY)].join("")}]`, "g");
export function simplifiedChars(text: string): string[] {
  return [...new Set(text.match(SIMP_RE) ?? [])];
}

export function checkText(platform: BotPlatform, text: string, opts: { kind: "post" | "reply"; targetText?: string; followUp?: boolean; lang?: BotLang; title?: string } = { kind: "post" }): Finding[] {
  const f: Finding[] = [];
  const t = text.trim();
  if (!t) f.push({ level: "block", rule: "empty", message: "正文是空的" });
  if ([...t].length > LIMIT[platform]) f.push({ level: "block", rule: "length", message: `超过 ${platform} 的 ${LIMIT[platform]} 字上限（现在 ${[...t].length}）` });
  if (AI_WORDS.test(t)) f.push({ level: "block", rule: "no-ai", message: "不出现 AI、人工智慧、模型、机器人、GPT 等字样，也不拿 AI 当卖点" });
  if (PROMISE.test(t)) f.push({ level: "block", rule: "no-promise", message: "不承诺准确、不说保证／一定／百分之百" });
  if (FORBIDDEN.test(t)) f.push({ level: "block", rule: "forbidden-topic", message: "不碰赌博、股票币价、疾病手术、生死寿命" });
  if (isCrisis(t)) f.push({ level: "block", rule: "crisis", message: "内容涉及自伤／轻生，不能发" });
  for (const u of links(t)) {
    if (!ours(u)) f.push({ level: "block", rule: "foreign-link", message: `只能放 yaoflow.com 的链接：${u.slice(0, 80)}` });
    else if (!/[?&]c=[a-z0-9-]+/i.test(u)) f.push({ level: "warn", rule: "link-tag", message: `链接要带来源标签 ?c=…（例 c=threads、c=threads-zh、c=threads-reply）：${u.slice(0, 80)}` });
  }
  if (opts.lang === "zh-hant") {
    const simp = simplifiedChars(`${opts.title ?? ""}\n${t}`);
    if (simp.length) f.push({ level: "block", rule: "simplified-in-hant", message: `繁体稿里有简体字：${simp.slice(0, 12).join("、")}（标题也算）` });
  }
  if (opts.kind === "post" && opts.title !== undefined && /测试|測試|test/i.test(opts.title)) f.push({ level: "warn", rule: "test-title", message: "标题带「测试」，自动放行会跳过这篇" });
  if (opts.kind === "reply") {
    if (opts.targetText && isCrisis(opts.targetText)) f.push({ level: "block", rule: "crisis-target", message: "对方的帖子涉及自伤／轻生：不要回卦相关内容，跳过这一帖" });
    if (opts.targetText && FORBIDDEN.test(opts.targetText)) f.push({ level: "block", rule: "forbidden-target", message: "对方问的是赌博、股票、疾病或生死，跳过" });
    if (links(t).length && !opts.followUp) f.push({ level: "block", rule: "reply-link", message: "回帖不放链接、不提站名；对方在我们的回覆下接话（第二条起），才可以给一次链接" });
    if (/yaoflow|爻流/i.test(t) && !opts.followUp) f.push({ level: "block", rule: "reply-name", message: "回帖不提站名；对方接话后才可以说" });
  }
  return f;
}
export const hasBlock = (f: Finding[]) => f.some((x) => x.level === "block");

// ───────────────────────── 稿件 ─────────────────────────

export interface BotPost {
  id: string; topic_id: string; platform: BotPlatform; lang: BotLang; title: string; body: string; media_notes: string | null; rationale: string | null;
  task_id: string | null; suggested_at: number | null; status: PostStatus; scheduled_at: number | null; posted_at: number | null; external_url: string | null;
  error: string | null; attempts: number; text_version: number; decided_reason: string | null; created_at: number; updated_at: number;
}

export function getPost(id: string): BotPost | null {
  ensure();
  return (db().prepare("SELECT * FROM bot_posts WHERE id = ?").get(id) as BotPost | undefined) ?? null;
}

export function submitPost(i: { platform: BotPlatform; lang: BotLang; title: string; body: string; media_notes?: string | null; rationale: string; suggested_at?: number | null; topic_id?: string | null; task_id?: string | null }, now = Date.now()):
  { ok: true; post: BotPost } | { ok: false; error: string; findings?: Finding[] } {
  ensure();
  const findings = checkText(i.platform, i.body, { kind: "post", lang: i.lang, title: i.title });
  if (hasBlock(findings)) return { ok: false, error: "检查没过，改完再交", findings };
  const today = (db().prepare("SELECT COUNT(*) AS n FROM bot_posts WHERE created_at >= ?").get(homeDayStart(now)) as { n: number }).n;
  if (today >= SUBMIT_DAILY_CAP) return { ok: false, error: `今天已经交了 ${today} 篇，上限 ${SUBMIT_DAILY_CAP}` };
  if (i.task_id) {
    const t = db().prepare("SELECT id FROM bot_tasks WHERE id = ?").get(i.task_id);
    if (!t) return { ok: false, error: "task_id 不存在" };
  }
  const id = randomUUID();
  db().prepare(`INSERT INTO bot_posts (id, topic_id, platform, lang, title, body, media_notes, rationale, task_id, suggested_at, status, created_at, updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?, 'review', ?, ?)`).run(id, i.topic_id || id, i.platform, i.lang, i.title.trim(), i.body.trim(), i.media_notes ?? null, i.rationale, i.task_id ?? null, i.suggested_at ?? null, now, now);
  if (i.task_id) db().prepare("UPDATE bot_tasks SET status = 'submitted', updated_at = ? WHERE id = ? AND status IN ('open','in_progress')").run(now, i.task_id);
  botLog("submit_draft", { platform: i.platform, lang: i.lang, title: i.title }, id, now);
  autoSchedule(now);
  return { ok: true, post: getPost(id)! };
}

export function revisePost(id: string, i: { title?: string; body?: string; reply: string }, now = Date.now()): { ok: true; post: BotPost } | { ok: false; error: string; findings?: Finding[] } {
  ensure();
  const p = getPost(id);
  if (!p) return { ok: false, error: "稿件不存在" };
  if (p.status !== "review" && p.status !== "rejected") return { ok: false, error: `「${STATUS_ZH[p.status]}」的稿件不能改` };
  const body = i.body?.trim() || p.body;
  const findings = checkText(p.platform, body, { kind: "post", lang: p.lang, title: i.title?.trim() || p.title });
  if (hasBlock(findings)) return { ok: false, error: "检查没过，改完再交", findings };
  const changed = body !== p.body || (i.title?.trim() && i.title.trim() !== p.title);
  db().prepare("UPDATE bot_posts SET title = ?, body = ?, status = 'review', decided_reason = NULL, text_version = text_version + ?, updated_at = ? WHERE id = ?")
    .run(i.title?.trim() || p.title, body, changed ? 1 : 0, now, id);
  db().prepare("UPDATE bot_notes SET resolved = 1 WHERE post_id = ? AND resolved = 0").run(id);
  db().prepare("INSERT INTO bot_notes (post_id, author, body, resolved, created_at) VALUES (?, 'bot', ?, 1, ?)").run(id, i.reply, now);
  botLog("revise_draft", { reply: i.reply }, id, now);
  autoSchedule(now);
  return { ok: true, post: getPost(id)! };
}

export function listPosts(status?: PostStatus | PostStatus[], limit = 50): BotPost[] {
  ensure();
  const st = status ? (Array.isArray(status) ? status : [status]) : null;
  const order = st && st.every((s) => s === "approved") ? "scheduled_at ASC" : "updated_at DESC";
  return db().prepare(`SELECT * FROM bot_posts ${st ? `WHERE status IN (${st.map(() => "?").join(",")})` : ""} ORDER BY ${order} LIMIT ?`).all(...(st ?? []), limit) as BotPost[];
}

export function notesFor(postId: string): { id: number; author: string; body: string; resolved: number; created_at: number }[] {
  ensure();
  return db().prepare("SELECT id, author, body, resolved, created_at FROM bot_notes WHERE post_id = ? ORDER BY created_at").all(postId) as { id: number; author: string; body: string; resolved: number; created_at: number }[];
}

/** 管理员：批准（定发布时间）／退回／写批注（可要求它改） */
export function approvePost(id: string, scheduledAt: number, reason: string, now = Date.now()): { ok: boolean; error?: string } {
  ensure();
  const p = getPost(id);
  if (!p) return { ok: false, error: "稿件不存在" };
  if (p.status !== "review" && p.status !== "failed") return { ok: false, error: `「${STATUS_ZH[p.status]}」不能批准` };
  if (!Number.isFinite(scheduledAt)) return { ok: false, error: "要填发布时间" };
  db().prepare("UPDATE bot_posts SET status = 'approved', scheduled_at = ?, decided_reason = ?, error = NULL, updated_at = ? WHERE id = ?").run(Math.max(scheduledAt, now), reason, now, id);
  botLog("admin_approve", { scheduled_at: scheduledAt, reason }, id, now);
  return { ok: true };
}
export function rejectPost(id: string, reason: string, now = Date.now()): { ok: boolean; error?: string } {
  ensure();
  const p = getPost(id);
  if (!p) return { ok: false, error: "稿件不存在" };
  if (p.status === "posted") return { ok: false, error: "已经发出去了，要撤请到平台上删" };
  db().prepare("UPDATE bot_posts SET status = 'rejected', decided_reason = ?, updated_at = ? WHERE id = ?").run(reason, now, id);
  botLog("admin_reject", { reason }, id, now);
  return { ok: true };
}
export function unschedulePost(id: string, reason: string, now = Date.now()): { ok: boolean; error?: string } {
  ensure();
  const p = getPost(id);
  if (!p || p.status !== "approved") return { ok: false, error: "只有已批准、还没发的能撤回" };
  // 「撤回：」开头的不会再被自动放行，等管理员自己批或 bot 按批注改完
  db().prepare("UPDATE bot_posts SET status = 'review', scheduled_at = NULL, decided_reason = ?, updated_at = ? WHERE id = ?").run(`撤回：${reason}`, now, id);
  botLog("admin_unschedule", { reason }, id, now);
  return { ok: true };
}
export function addNote(postId: string, body: string, askRevision: boolean, now = Date.now()): { ok: boolean; error?: string } {
  ensure();
  const p = getPost(postId);
  if (!p) return { ok: false, error: "稿件不存在" };
  db().prepare("INSERT INTO bot_notes (post_id, author, body, resolved, created_at) VALUES (?, 'admin', ?, 0, ?)").run(postId, body, now);
  if (askRevision && p.status !== "posted") db().prepare("UPDATE bot_posts SET status = 'rejected', updated_at = ? WHERE id = ?").run(now, postId);
  botLog("admin_note", { body: body.slice(0, 300), ask_revision: askRevision }, postId, now);
  return { ok: true };
}

/** 发帖：到点的已批稿（提前 10 分钟就给），它发完回报 */
export function duePosts(now = Date.now()): BotPost[] {
  ensure();
  autoSchedule(now);
  return db().prepare("SELECT * FROM bot_posts WHERE status = 'approved' AND scheduled_at <= ? ORDER BY scheduled_at LIMIT 20").all(now + 10 * 60_000) as BotPost[];
}
export function markPosted(id: string, externalUrl: string | null, now = Date.now()): { ok: boolean; error?: string } {
  ensure();
  const p = getPost(id);
  if (!p) return { ok: false, error: "稿件不存在" };
  if (p.status !== "approved" && p.status !== "failed") return { ok: false, error: `「${STATUS_ZH[p.status]}」不是待发的稿件` };
  if (p.scheduled_at && p.scheduled_at > now + 15 * 60_000) return { ok: false, error: "还没到发布时间" };
  db().prepare("UPDATE bot_posts SET status = 'posted', posted_at = ?, external_url = ?, error = NULL, attempts = attempts + 1, updated_at = ? WHERE id = ?").run(now, externalUrl, now, id);
  botLog("mark_posted", { external_url: externalUrl }, id, now);
  return { ok: true };
}
export function markFailed(id: string, error: string, now = Date.now()): { ok: boolean; error?: string } {
  ensure();
  const p = getPost(id);
  if (!p || (p.status !== "approved" && p.status !== "failed")) return { ok: false, error: "不是待发的稿件" };
  db().prepare("UPDATE bot_posts SET status = 'failed', error = ?, attempts = attempts + 1, updated_at = ? WHERE id = ?").run(error.slice(0, 500), now, id);
  botLog("mark_failed", { error }, id, now);
  return { ok: true };
}

/** 台北某天 HH:MM 的毫秒时间 */
function slotAt(dayStart: number, hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return dayStart + (h * 60 + m) * 60_000;
}

/**
 * 自动放行：把「待审」里检查全过、管理员没写过要改的批注、标题不带「测试」的稿，排进最早的空档（≥ now + AUTO_LEAD）。
 * bot 有建议时间就优先排在建议的那一天。没过的留在待审，原因写进 decided_reason。返回排上的篇数。
 */
export function autoSchedule(now = Date.now(), maxDays = 21): number {
  ensure();
  if (!autoOn()) return 0;
  const pending = db().prepare(`SELECT * FROM bot_posts p WHERE status = 'review' AND COALESCE(decided_reason, '') NOT LIKE '撤回：%'
    AND NOT EXISTS (SELECT 1 FROM bot_notes n WHERE n.post_id = p.id AND n.author = 'admin' AND n.resolved = 0)
    ORDER BY COALESCE(suggested_at, created_at), created_at`).all() as BotPost[];
  if (!pending.length) return 0;
  const taken = new Set((db().prepare("SELECT platform, lang, scheduled_at FROM bot_posts WHERE status IN ('approved','posted','failed') AND scheduled_at IS NOT NULL").all() as { platform: string; lang: string; scheduled_at: number }[])
    .map((r) => `${r.platform}/${r.lang}@${r.scheduled_at}`));
  // 11-28 Sakura：同一选题的繁體、简体 Threads 不在同一天发（同一个账号，几乎一样的两条会像刷屏）
  const threadsDays = new Map<string, Set<number>>();
  const markThreadsDay = (topic: string, lang: string, t: number) => {
    const k = `${topic}/${lang}`;
    if (!threadsDays.has(k)) threadsDays.set(k, new Set());
    threadsDays.get(k)!.add(homeDayStart(t));
  };
  for (const r of db().prepare("SELECT topic_id, lang, scheduled_at FROM bot_posts WHERE platform = 'threads' AND status IN ('approved','posted','failed') AND scheduled_at IS NOT NULL").all() as { topic_id: string; lang: string; scheduled_at: number }[])
    markThreadsDay(r.topic_id, r.lang, r.scheduled_at);
  const otherLangSameDay = (p: BotPost, t: number) => p.platform === "threads"
    && [...threadsDays.entries()].some(([k, days]) => k.startsWith(`${p.topic_id}/`) && k !== `${p.topic_id}/${p.lang}` && days.has(homeDayStart(t)));
  const start = homeDayStart(now);
  let n = 0;
  for (const p of pending) {
    const key = `${p.platform}/${p.lang}`;
    const slots = SLOTS[key];
    const f = checkText(p.platform, p.body, { kind: "post", lang: p.lang, title: p.title });
    const why = !slots ? `${key} 没有固定档期，要人工排` : hasBlock(f) ? f.filter((x) => x.level === "block").map((x) => x.message).join("；") : f.some((x) => x.rule === "test-title") ? "标题带「测试」" : null;
    if (why) {
      if (p.decided_reason !== `自动放行没过：${why}`) db().prepare("UPDATE bot_posts SET decided_reason = ?, updated_at = ? WHERE id = ?").run(`自动放行没过：${why}`, now, p.id);
      continue;
    }
    const earliest = now + AUTO_LEAD;
    const firstDay = p.suggested_at && p.suggested_at > earliest ? homeDayStart(p.suggested_at) : start;
    let at: number | null = null;
    for (let d = 0; d <= maxDays && at === null; d++) {
      const dayStart = firstDay + d * DAY;
      for (const hhmm of slots) {
        const t = slotAt(dayStart, hhmm);
        if (t >= earliest && !taken.has(`${key}@${t}`) && !otherLangSameDay(p, t)) { at = t; break; }
      }
    }
    if (at === null) continue;
    taken.add(`${key}@${at}`);
    if (p.platform === "threads") markThreadsDay(p.topic_id, p.lang, at);
    db().prepare("UPDATE bot_posts SET status = 'approved', scheduled_at = ?, decided_reason = '自动放行', error = NULL, updated_at = ? WHERE id = ? AND status = 'review'").run(at, now, p.id);
    botLog("auto_approve", { scheduled_at: at, platform: p.platform, lang: p.lang }, p.id, now);
    n++;
  }
  return n;
}

// ───────────────────────── 任务 ─────────────────────────

export interface BotTask { id: string; title: string; brief: string; platforms: string; due_at: number | null; status: TaskStatus; created_at: number; updated_at: number }

export function createTask(i: { title: string; brief: string; platforms: BotPlatform[]; due_at?: number | null }, now = Date.now()): BotTask {
  ensure();
  // 11-27：按钮连点三下会派出三个一样的任务；一分钟内同标题同说明的直接返回已有那条
  const dup = db().prepare("SELECT * FROM bot_tasks WHERE title = ? AND brief = ? AND created_at > ? ORDER BY created_at DESC LIMIT 1").get(i.title.trim(), i.brief.trim(), now - 60_000) as BotTask | undefined;
  if (dup) return { ...dup, duplicate: true } as BotTask & { duplicate?: boolean };
  const id = randomUUID();
  db().prepare("INSERT INTO bot_tasks (id, title, brief, platforms, due_at, status, created_at, updated_at) VALUES (?,?,?,?,?, 'open', ?, ?)")
    .run(id, i.title.trim(), i.brief.trim(), JSON.stringify(i.platforms), i.due_at ?? null, now, now);
  botLog("admin_task", { title: i.title }, id, now);
  return db().prepare("SELECT * FROM bot_tasks WHERE id = ?").get(id) as BotTask;
}
export function listTasks(status?: TaskStatus[], limit = 50): BotTask[] {
  ensure();
  return db().prepare(`SELECT * FROM bot_tasks ${status ? `WHERE status IN (${status.map(() => "?").join(",")})` : ""} ORDER BY created_at DESC LIMIT ?`).all(...(status ?? []), limit) as BotTask[];
}
export function startTask(id: string, now = Date.now()): BotTask | null {
  ensure();
  db().prepare("UPDATE bot_tasks SET status = 'in_progress', updated_at = ? WHERE id = ? AND status = 'open'").run(now, id);
  const t = db().prepare("SELECT * FROM bot_tasks WHERE id = ?").get(id) as BotTask | undefined;
  if (t?.status === "in_progress") botLog("start_task", { title: t.title }, id, now);
  return t ?? null;
}
export function setTaskStatus(id: string, status: TaskStatus, now = Date.now()): void {
  ensure();
  db().prepare("UPDATE bot_tasks SET status = ?, updated_at = ? WHERE id = ?").run(status, now, id);
  botLog("admin_task_status", { status }, id, now);
}

/** 它被唤醒或例行运行时先看的待办 */
export function assignments(): { tasks: BotTask[]; revisions: { post_id: string; platform: BotPlatform; lang: BotLang; title: string; body: string; notes: string[] }[] } {
  ensure();
  const tasks = listTasks(["open", "in_progress"]);
  const rows = db().prepare(`SELECT p.id, p.platform, p.lang, p.title, p.body FROM bot_posts p
    WHERE p.status IN ('review','rejected') AND EXISTS (SELECT 1 FROM bot_notes n WHERE n.post_id = p.id AND n.resolved = 0) ORDER BY p.updated_at LIMIT 30`).all() as { id: string; platform: BotPlatform; lang: BotLang; title: string; body: string }[];
  return {
    tasks,
    revisions: rows.map((r) => ({ post_id: r.id, platform: r.platform, lang: r.lang, title: r.title, body: r.body, notes: notesFor(r.id).filter((n) => !n.resolved).map((n) => n.body) })),
  };
}

// ───────────────────────── 回帖 ─────────────────────────

export function repliesToday(now = Date.now()): Record<BotPlatform, number> {
  ensure();
  const out: Record<BotPlatform, number> = { threads: 0, instagram: 0, facebook: 0 };
  for (const r of db().prepare("SELECT platform, COUNT(*) AS n FROM bot_replies WHERE day = ? GROUP BY platform").all(homeDay(now)) as { platform: BotPlatform; n: number }[]) out[r.platform] = r.n;
  return out;
}

const normUrl = (u: string) => u.trim().replace(/[?#].*$/, "").replace(/\/$/, "").toLowerCase();

export function checkReply(i: { platform: BotPlatform; target_url: string; target_text?: string; body: string; follow_up?: boolean }, now = Date.now()):
  { ok: boolean; remaining_today: number; findings: Finding[] } {
  ensure();
  const findings = checkText(i.platform, i.body, { kind: "reply", targetText: i.target_text, followUp: i.follow_up });
  const used = repliesToday(now)[i.platform];
  const remaining = Math.max(0, REPLY_DAILY_CAP[i.platform] - used);
  if (remaining === 0) findings.push({ level: "block", rule: "daily-cap", message: `${i.platform} 今天的回帖名额（${REPLY_DAILY_CAP[i.platform]}）用完了，这一轮停` });
  const recent = db().prepare("SELECT COUNT(*) AS n FROM bot_replies WHERE target_url = ? AND created_at >= ?").get(normUrl(i.target_url), now - DAY) as { n: number };
  if (recent.n >= 2) findings.push({ level: "block", rule: "same-target", message: "这一帖 24 小时内已经回过两次，不要连续回同一个人" });
  return { ok: !hasBlock(findings), remaining_today: remaining, findings };
}

export function logReply(i: { platform: BotPlatform; lang: BotLang; target_url: string; target_excerpt?: string; body: string; external_url?: string | null }, now = Date.now()): { ok: boolean; error?: string; remaining_today: number } {
  ensure();
  const hasLink = links(i.body).length > 0;
  db().prepare("INSERT INTO bot_replies (platform, lang, target_url, target_excerpt, body, has_link, external_url, day, created_at) VALUES (?,?,?,?,?,?,?,?,?)")
    .run(i.platform, i.lang, normUrl(i.target_url), (i.target_excerpt ?? "").slice(0, 300), i.body, hasLink ? 1 : 0, i.external_url ?? null, homeDay(now), now);
  botLog("log_reply", { platform: i.platform, has_link: hasLink }, null, now);
  return { ok: true, remaining_today: Math.max(0, REPLY_DAILY_CAP[i.platform] - repliesToday(now)[i.platform]) };
}

export function recentReplies(limit = 50): { platform: BotPlatform; lang: BotLang; target_url: string; target_excerpt: string | null; body: string; has_link: number; external_url: string | null; created_at: number }[] {
  ensure();
  return db().prepare("SELECT platform, lang, target_url, target_excerpt, body, has_link, external_url, created_at FROM bot_replies ORDER BY created_at DESC LIMIT ?").all(limit) as never;
}

// ───────────────────────── 排期缺口 ─────────────────────────

export function schedule(daysAhead = 7, now = Date.now()): { days: { day: string; platform: BotPlatform; lang: BotLang; target: number; have: number; gap: number }[]; upcoming: Pick<BotPost, "id" | "platform" | "lang" | "title" | "status" | "scheduled_at" | "suggested_at">[] } {
  ensure();
  const start = homeDayStart(now);
  const end = start + (daysAhead + 1) * DAY;
  const posts = db().prepare(`SELECT id, platform, lang, title, status, scheduled_at, suggested_at FROM bot_posts
    WHERE status IN ('review','approved','posted') AND COALESCE(scheduled_at, posted_at, suggested_at) >= ? AND COALESCE(scheduled_at, posted_at, suggested_at) < ? ORDER BY COALESCE(scheduled_at, suggested_at)`)
    .all(start, end) as Pick<BotPost, "id" | "platform" | "lang" | "title" | "status" | "scheduled_at" | "suggested_at">[];
  const days: { day: string; platform: BotPlatform; lang: BotLang; target: number; have: number; gap: number }[] = [];
  for (let d = 0; d <= daysAhead; d++) {
    const dayStart = start + d * DAY;
    for (const t of DAILY_TARGET) {
      const have = posts.filter((p) => p.platform === t.platform && p.lang === t.lang && (p.scheduled_at ?? p.suggested_at ?? 0) >= dayStart && (p.scheduled_at ?? p.suggested_at ?? 0) < dayStart + DAY).length;
      days.push({ day: homeDay(dayStart), platform: t.platform, lang: t.lang, target: t.n, have, gap: Math.max(0, t.n - have) });
    }
  }
  return { days, upcoming: posts };
}

// ───────────────────────── 唤醒 bot（Webhook） ─────────────────────────

/** 派任务、要它改稿时，POST 到 Grok Bot 那个「YaoFlow 任务执行」例行任务的 Webhook。没配就只记一笔。 */
export async function wakeBot(payload: Record<string, unknown>, fetcher: typeof fetch = fetch): Promise<{ ok: boolean; status?: number; error?: string }> {
  const url = process.env.BOT_WEBHOOK_URL;
  const ref = typeof payload.task_id === "string" ? payload.task_id : typeof payload.post_id === "string" ? payload.post_id : null;
  if (!url) { botLog("wake_skipped", { reason: "BOT_WEBHOOK_URL 未配置", kind: payload.kind }, ref); return { ok: false, error: "BOT_WEBHOOK_URL 未配置" }; }
  try {
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (process.env.BOT_WEBHOOK_TOKEN) headers.authorization = `Bearer ${process.env.BOT_WEBHOOK_TOKEN}`;
    const r = await fetcher(url, { method: "POST", headers, body: JSON.stringify({ source: "yaoflow", ...payload }), signal: AbortSignal.timeout(8000) });
    // 11-27 修：对方返回 401 之类也要记成失败（之前一律记 wake，后台看不出没叫醒）
    if (r.ok) botLog("wake", { kind: payload.kind, status: r.status }, ref);
    else botLog("wake_failed", { kind: payload.kind, status: r.status, error: `HTTP ${r.status}${r.status === 401 || r.status === 403 ? "（密钥不对：核对 BOT_WEBHOOK_TOKEN）" : ""}` }, ref);
    return { ok: r.ok, status: r.status };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    botLog("wake_failed", { kind: payload.kind, error }, ref);
    return { ok: false, error };
  }
}

// ───────────────────────── 后台用 ─────────────────────────

export function botActivity(limit = 60): { at: number; action: string; ref: string | null; detail: string }[] {
  ensure();
  return db().prepare("SELECT at, action, ref, detail FROM bot_log ORDER BY id DESC LIMIT ?").all(limit) as { at: number; action: string; ref: string | null; detail: string }[];
}
export function lastBotCall(): number | null {
  ensure();
  const r = db().prepare("SELECT MAX(at) AS at FROM bot_log WHERE action NOT LIKE 'admin_%' AND action NOT LIKE 'wake%'").get() as { at: number | null };
  return r.at ?? null;
}
