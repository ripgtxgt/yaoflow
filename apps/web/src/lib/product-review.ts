import { db } from "./db";
import { homeDay } from "./clock";
import { offerStats } from "./recover-offer";
import { todayQianStats } from "./today-qian";
import { featureRows, featureState } from "./features";
import { readEvents } from "./analytics-server";
import { tarotStats } from "./tarot";
import { preFunnel } from "./pre-cast";
import { xunwuStats } from "./xunwu-store";

/**
 * 10-16 进度表 59 (Neil 10-15: 「之后我们会上更多的产品」→ 定 55–60 → 10-16「52，59一起做好吧」): every new product is
 * launched with the numbers it will be judged by and a date to judge it — two weeks after it opens. The weekly report
 * prints one line per product here and, from that date on, says 「该定去留了」 until Neil's decision is written below.
 * The process itself: docs/新产品上线流程.md. (When 进度表 55's catalog exists this list moves into it.)
 */
export interface ProductReview {
  id: string;
  name: string;
  /** the feature switch it lives behind (lib/features.ts), when it has one */
  feature?: string;
  /** the Taipei day it opened to everyone */
  openedOn: string;
  /** the three numbers it is judged by, worked out fresh each time */
  numbers: (now: number) => string;
  /** keep / shrink / remove — in Neil's words once he has set them; until then our proposal, marked as such */
  rule: { keep: string; shrink: string; remove: string; set: boolean };
  /** 10-17 (Neil: 69–74「去留观察期改为 1–2 个月」): days before the decision, when not the default two weeks */
  reviewAfterDays?: number;
  /** the decision once made, e.g. "10-29 Neil：保留" */
  decided?: string;
}

export const REVIEW_AFTER_DAYS = 14;
const NOT_TEST = "(customer_id IS NULL OR customer_id NOT IN (SELECT id FROM customers WHERE test_flag = 1))";
const count = (sql: string, ...args: unknown[]): number => { try { return ((db().prepare(sql).get(...(args as never[])) as { n: number } | undefined)?.n ?? 0); } catch { return 0; } };

export const PRODUCT_REVIEWS: ProductReview[] = [
  {
    id: "today-qian", name: "今日一籤", feature: "today-qian", openedOn: "2026-10-15",
    numbers: () => {
      const q = todayQianStats();
      const r7 = q.return7.base ? `${Math.round((100 * q.return7.back) / q.return7.base)}%（${q.return7.back}/${q.return7.base}）` : "还没有满 8 天的人";
      return `近 7 天抽籤 ${q.week} 人 · 7 日回访率 ${r7} · 籤卡在用 ${q.cards} · 开每天寄信 ${q.mailOn} 人`;
    },
    rule: { keep: "7 日回访率 ≥ 15%：保留，加入口", shrink: "5%–15%：保留页面，只留小入口", remove: "< 5%：撤掉入口，页面留着不推", set: false },
  },
  {
    id: "recover-offer", name: "挽回信（离开 5 分钟后、1 小时内 7 折）", feature: "recover-offer", openedOn: "2026-10-15",
    numbers: (now) => {
      const o = offerStats(now - 14 * 86_400_000);
      const rate = o.sent ? `${Math.round((1000 * o.paid) / o.sent) / 10}%` : "—";
      return `近 14 天寄出 ${o.sent} · 打开 ${o.opened} · 付成 ${o.paid}（付成率 ${rate}）· 过期没用 ${o.expired}`;
    },
    rule: { keep: "付成率 ≥ 5%：保留", shrink: "2%–5%：保留，改信的写法再看两周", remove: "< 2%：停掉，回到不寄信", set: false },
  },
  {
    id: "jiaobei", name: "線上擲筊＋線上求籤", feature: "jiaobei", openedOn: "2099-01-01", reviewAfterDays: 42, // 10-22 进度表 82 ①: 1–2 months to judge, as the other eight (Neil 10-17) — set the real day when it opens
    numbers: (now) => {
      const ev = readEvents(7, { only: ["jiaobei"] });
      const ppl = (m: (x: string) => boolean) => new Set(ev.filter((e) => m(e.method ?? "")).map((e) => e.b ?? e.s)).size;
      // 10-17 承接: of the 擲筊 written down, how many went on to cast and how many of those paid — by how it ended
      let f = "";
      try {
        const j = preFunnel(now - 7 * 86_400_000).jb;
        const row = (k: string, name: string) => { const r = j[k]; return r ? `${name} ${r.cast}/${r.asks} 起卦、${r.paid} 付费` : `${name} 0`; };
        f = ` · 写了问题的：${row("sheng3", "三聖")}；${row("sheng", "聖")}；${row("yin", "陰")}；${row("xiao", "笑")}`;
      } catch { /* */ }
      return `近 7 天擲筊 ${ppl((m) => m.startsWith("ask"))} 人 · 求籤开始 ${ppl((m) => m.startsWith("qq_request"))} 人、抽到并确认 ${ppl((m) => m === "qq_done")} 人 · 转去起卦 ${ppl((m) => m.startsWith("to_cast"))}、转去求籤 ${ppl((m) => m === "to_qiuqian")}、转去塔羅 ${ppl((m) => m === "to_tarot")}${f}`;
    },
    rule: { keep: "求籤或擲筊日均 ≥30 人：保留", shrink: "10–30 人：保留，只留解籤页入口", remove: "<10 人：撤入口，页面留着吃搜索", set: false },
  },
  {
    // 10-29 进度表 127 验收③: two weeks after it opens, by the daily casts (同 67⑤); opened to everyone 10-29 (Neil「你直接上线吧」)
    id: "xunwu", name: "尋物（東西不見了？）", feature: "xunwu", openedOn: "2026-10-29", reviewAfterDays: 14,
    numbers: (now) => {
      const s = xunwuStats(now - 7 * 86_400_000, now);
      return `近 7 天擲骰 ${s.casts} 次（日均 ${Math.round((s.casts / 7) * 10) / 10}）、${s.people} 人 · 点六爻细看 ${s.clicked} · 登入起卦 ${s.castAfter} · 看了深断 ${s.deep}（对照约 46%）· 回访找到 ${Object.values(s.back).reduce((a, b) => a + b.found, 0)}／还没 ${Object.values(s.back).reduce((a, b) => a + b.not, 0)}`;
    },
    rule: { keep: "日均起课 ≥30：留在服务页主推", shrink: "10–30：保留入口", remove: "<10：撤入口，页面留着接搜索", set: true },
  },
  {
    id: "tarot", name: "線上塔羅", feature: "tarot", openedOn: "2099-01-01", reviewAfterDays: 42, // 10-22 进度表 82 ①: 1–2 months to judge, as the other eight (Neil 10-17) — set the real day when it opens
    numbers: (now) => {
      const t = tarotStats(now - 7 * 86_400_000);
      const rate = t.people ? `${Math.round((1000 * t.paid) / t.people) / 10}%` : "—";
      let f = "";
      try { const p = preFunnel(now - 7 * 86_400_000).tarot; f = ` · 抽完去起卦 ${p.cast}/${p.draws}、其中起卦付费 ${p.paid}`; } catch { /* */ }
      return `近 7 天抽牌 ${t.people} 人（日均 ${Math.round(t.people / 7)}）· 付费解读 ${t.paid} 单（抽牌→付费 ${rate}）· 填了回访 ${t.revisitSet}、到期答了 ${t.answered}${f}`;
    },
    rule: { keep: "日均抽牌 ≥30 且付费 ≥3 单/周：保留", shrink: "日均 10–30 或付费 1–2 单/周：保留，只留塔罗页本身的入口", remove: "更低：撤首页入口，牌义页留着吃搜索", set: false },
  },
  {
    id: "huangli", name: "黃曆", feature: "huangli", openedOn: "2099-01-01", reviewAfterDays: 42,
    numbers: () => {
      const ev = readEvents(7, { only: ["huangli"] });
      const ppl = (m: (x: string) => boolean) => new Set(ev.filter((e) => m(e.method ?? "")).map((e) => e.b ?? e.s)).size;
      const z = readEvents(7, { only: ["zeri"] }).filter((e) => (e.method ?? "").startsWith("from_huangli"));
      return `近 7 天看黃曆 ${ppl((m) => m.startsWith("view"))} 人 · 點開宜忌詞 ${ppl((m) => m.startsWith("term:"))} 人 · 黃曆→擇日 ${new Set(z.map((e) => e.b ?? e.s)).size} 人`;
    },
    rule: { keep: "日均 ≥200 访问或 7 日回访 ≥15%：保留，首页「今天」卡长期带黄历", shrink: "日均 50–200：保留页面，只留「每天」组入口", remove: "<50：撤导航入口，日页留着吃搜索", set: false },
  },
  {
    id: "zeri", name: "擇日", feature: "zeri", openedOn: "2099-01-01", reviewAfterDays: 42,
    numbers: () => {
      const ev = readEvents(7, { only: ["zeri"] });
      const ppl = (m: (x: string) => boolean) => new Set(ev.filter((e) => m(e.method ?? "")).map((e) => e.b ?? e.s)).size;
      return `近 7 天查日子 ${ppl((m) => m.startsWith("query:"))} 人 · 設「提醒我這一天」${ppl((m) => m === "remind")} 人 · 擇日→起卦 ${ppl((m) => m === "to_cast")} 人`;
    },
    rule: { keep: "日均查询 ≥30：保留，评估二期擇日报告", shrink: "10–30：保留，只留黄历页和六爻结果页入口", remove: "<10：撤导航入口，事项落地页留着吃搜索", set: false },
  },
  {
    id: "yunshi", name: "每日運勢", feature: "yunshi", openedOn: "2099-01-01", reviewAfterDays: 42,
    numbers: () => {
      const ev = readEvents(7, { only: ["yunshi"] });
      const ppl = (m: (x: string) => boolean) => new Set(ev.filter((e) => m(e.method ?? "")).map((e) => e.b ?? e.s)).size;
      const days = new Map<string, Set<string>>();
      for (const e of ev) { const who = e.b ?? e.s; if (!who) continue; const k = new Date(e.t).toISOString().slice(0, 10); (days.get(who) ?? days.set(who, new Set()).get(who)!).add(k); }
      const back = [...days.values()].filter((s) => s.size >= 2).length;
      return `近 7 天看運勢 ${ppl((m) => m.startsWith("view"))} 人 · 其中 7 天內回來看第二天的 ${back} 人 · 運勢→起卦 ${ppl((m) => m === "to_cast")} 人`;
    },
    rule: { keep: "7 日回访率 ≥15%：保留，做日主版", shrink: "5–15%：保留，只留今日一籤页分页", remove: "<5%：撤导航入口，12 生肖页留着吃搜索", set: false },
  },
  {
    id: "ziwei", name: "紫微斗數", feature: "ziwei", openedOn: "2099-01-01", reviewAfterDays: 42,
    numbers: () => {
      const ev = readEvents(7, { only: ["ziwei"] });
      const ppl = (m: (x: string) => boolean) => new Set(ev.filter((e) => m(e.method ?? "")).map((e) => e.b ?? e.s)).size;
      return `近 7 天看产品页 ${ppl((m) => m === "view")} 人 · 排盘 ${ppl((m) => m.startsWith("chart"))} 人 · →起卦 ${ppl((m) => m === "to_cast")} 人`;
    },
    rule: { keep: "日均排盘 ≥50 且付费转化 ≥2%：保留，做 2027 流年与命书", shrink: "日均 15–50：保留，暂不做大件", remove: "<15：撤首页与导航主位，主星页留着吃搜索", set: false },
  },
  {
    id: "bazi", name: "八字", feature: "bazi", openedOn: "2099-01-01", reviewAfterDays: 42,
    numbers: () => {
      const ev = readEvents(7, { only: ["bazi"] });
      const ppl = (m: (x: string) => boolean) => new Set(ev.filter((e) => m(e.method ?? "")).map((e) => e.b ?? e.s)).size;
      return `近 7 天看产品页 ${ppl((m) => m === "view")} 人 · 排盘 ${ppl((m) => m.startsWith("chart"))} 人 · →起卦 ${ppl((m) => m === "to_cast")} 人`;
    },
    rule: { keep: "日均排盘 ≥20 且转化 ≥2%：保留，做大件", shrink: "日均 5–20：保留，不加推", remove: "<5：撤导航主位，日柱页留着吃搜索", set: false },
  },
  {
    id: "astro", name: "星盤", feature: "astro", openedOn: "2099-01-01", reviewAfterDays: 42,
    numbers: () => {
      const ev = readEvents(7, { only: ["astro"] });
      const ppl = (m: (x: string) => boolean) => new Set(ev.filter((e) => m(e.method ?? "")).map((e) => e.b ?? e.s)).size;
      return `近 7 天看产品页 ${ppl((m) => m === "view")} 人 · 排盘 ${ppl((m) => m.startsWith("chart"))} 人 · →起卦 ${ppl((m) => m === "to_cast")} 人`;
    },
    rule: { keep: "日均 ≥20 且转化 ≥1.5%：保留，做行运与合盘", shrink: "5–20：保留，不加推", remove: "<5：撤导航主位，行星内容页留着", set: false },
  },
  // 10-22 (进度表 75 ⑧ 第二批收尾): the three that opened with the 通卡 — registered so the weekly report follows them too
  {
    id: "hepan", name: "合盤", feature: "hepan", openedOn: "2099-01-01", reviewAfterDays: 42,
    numbers: (now) => {
      const ev = readEvents(7, { only: ["hepan"] });
      const ppl = (m: (x: string) => boolean) => new Set(ev.filter((e) => m(e.method ?? "")).map((e) => e.b ?? e.s)).size;
      const paid = count("SELECT COUNT(*) AS n FROM hepan_reports WHERE paid_at >= ? AND COALESCE(amount_minor, 0) > 0", now - 7 * 86_400_000);
      return `近 7 天看产品页 ${ppl((m) => m === "view")} 人 · 排出两人盘 ${ppl((m) => m.startsWith("pair"))} 人 · 发邀请 ${ppl((m) => m === "invite_make")}、TA 填了 ${ppl((m) => m === "invite_filled")} · 付费 ${paid} 单`;
    },
    rule: { keep: "周付费 ≥3 单：保留，做邀请裂变", shrink: "1–2 单：保留，只留三个排盘页的入口", remove: "0 单连续四周：撤首页入口，页面留着吃搜索", set: false },
  },
  {
    id: "nianshu", name: "三合一年書", feature: "nianshu", openedOn: "2099-01-01", reviewAfterDays: 42,
    numbers: (now) => {
      const ev = readEvents(7, { only: ["nianshu"] });
      const ppl = (m: (x: string) => boolean) => new Set(ev.filter((e) => m(e.method ?? "")).map((e) => e.b ?? e.s)).size;
      const paid = count("SELECT COUNT(*) AS n FROM nianshu_reports WHERE paid_at >= ? AND COALESCE(amount_minor, 0) > 0", now - 7 * 86_400_000);
      return `近 7 天看产品页 ${ppl((m) => m === "view")} 人 · 点购买 ${ppl((m) => m.startsWith("buy"))} 人 · 付费 ${paid} 本（11/1 起卖明年、早鸟到 1/31）`;
    },
    rule: { keep: "早鸟期周付费 ≥5 本：保留，春节前加推", shrink: "1–4 本：保留，只在三个排盘页与报告里带", remove: "0 本连续四周：撤首页入口，页面留着", set: false },
  },
  {
    id: "tongka", name: "通卡（1 日／7 天／30 天）＋会员不限次", feature: "tongka", openedOn: "2099-01-01", reviewAfterDays: 28,
    numbers: (now) => {
      const wk = now - 7 * 86_400_000;
      const sold = (t: string) => count("SELECT COUNT(*) AS n FROM orders WHERE status = 'paid' AND tier = ? AND created_at >= ? AND " + NOT_TEST, t, wk);
      const live = count("SELECT COUNT(*) AS n FROM subscriptions WHERE status = 'active' AND substr(stripe_subscription_id,1,5) = 'pass_' AND period_end > ? AND customer_id NOT IN (SELECT id FROM customers WHERE test_flag = 1)", now);
      const members = count("SELECT COUNT(*) AS n FROM subscriptions WHERE status IN ('active','trialing','past_due') AND substr(stripe_subscription_id,1,4) = 'sub_' AND customer_id NOT IN (SELECT id FROM customers WHERE test_flag = 1)");
      const hits = count("SELECT COUNT(*) AS n FROM ops_events WHERE kind = 'cap_hit' AND at >= ?", wk);
      const single = count("SELECT COUNT(*) AS n FROM orders WHERE status = 'paid' AND tier IN ('deep','light','one') AND created_at >= ? AND " + NOT_TEST, wk);
      return `近 7 天卖出 1 日 ${sold("pass_1d")} · 7 天 ${sold("pass_7d")} · 30 天 ${sold("pass_30d")} 张（单买旧路径 ${single} 单）· 通卡在用 ${live} 张 · 会员 ${members} 人 · 碰到每日上限 ${hits} 次`;
    },
    rule: { keep: "买过的人 30 天回访率 ≥20%（周报北极星行）或通卡周销 ≥10 张：保留", shrink: "回访率 10–20%：保留，调上限与信的内容再看四周", remove: "回访率 <10% 且通卡周销 <3 张连续四周：回到单买", set: false },
  },
];


const dayNum = (d: string) => Date.parse(`${d}T00:00:00+08:00`);
const featureSetDay = (name: string): string | null => { const at = featureRows().find((f) => f.name === name)?.updatedAt; return at ? homeDay(at) : null; };

export interface ReviewLine { id: string; name: string; day: number; reviewOn: string; due: boolean; line: string }

/** One line per product that is open to everyone; `due` once two weeks have passed without a decision. */
export function productReviewLines(now = Date.now()): ReviewLine[] {
  const out: ReviewLine[] = [];
  for (const p of PRODUCT_REVIEWS) {
    if (p.feature && featureState(p.feature) !== "on") continue;
    // 10-22: a product still carrying the placeholder date opened the day its switch was last set (the features table)
    const openedOn = p.openedOn.startsWith("2099") && p.feature ? featureSetDay(p.feature) ?? p.openedOn : p.openedOn;
    const day = Math.floor((now - dayNum(openedOn)) / 86_400_000) + 1;
    const reviewOn = homeDay(dayNum(openedOn) + (p.reviewAfterDays ?? REVIEW_AFTER_DAYS) * 86_400_000 + 12 * 3_600_000);
    const due = !p.decided && homeDay(now) >= reviewOn;
    let numbers: string;
    try { numbers = p.numbers(now); } catch { numbers = "（数没取到）"; }
    const rule = `${p.rule.set ? "去留标准" : "去留标准（建议，待 Neil 定）"}：${p.rule.keep}；${p.rule.shrink}；${p.rule.remove}`;
    const head = p.decided ? `已定：${p.decided}` : due ? `⚠ 到两周了（${reviewOn}），该定去留了` : `${reviewOn} 定去留`;
    out.push({ id: p.id, name: p.name, day, reviewOn, due, line: `${p.name}（${openedOn.slice(5)} 开放，第 ${day} 天 · ${head}）\n  ${numbers}\n  ${rule}` });
  }
  return out;
}
