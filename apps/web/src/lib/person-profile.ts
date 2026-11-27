import { db } from "./db";
import { netOf, type NetRow } from "./browser-net";
import { isContactQuestion } from "./contact-question";
import { toHans } from "./hant";

/**
 * 10-31 进度表 130 ③ (Neil: 「像这种起了很多卦的人，我需要很详细的客户画像……后期我投放广告的时候需要用」): one reader
 * — a browser, or every browser of a customer — summed up as the facts an ad audience is built from: where (country,
 * city, timezone, language), on what (device, system, which app they opened us in), how they found us (first referrer,
 * campaign), when (hours, weekdays, how often), what about (topics, who the question is about, how many matters, how
 * many casts each), who (age band, gender, zodiac — from a birth profile they saved), and money (price seen, checkout
 * started, paid, how much, card country). Plus plain tags. Internal only: nothing here is sent to any ad platform.
 */

export type Count = [string, number][];
export interface Profile {
  where: { countries: Count; cities: Count; tz: Count; langs: Count; cardCountry: Count };
  device: { models: Count; os: Count; apps: Count; classes: Count };
  source: { firstRef: string | null; firstCampaign: string | null; firstPath: string | null; firstLocale: string | null; firstAt: number | null };
  when: { hours: number[]; weekdays: number[]; days: number; firstAt: number | null; lastAt: number | null; castsPerDay: number; nightShare: number };
  asks: { casts: number; matters: number; maxPerMatter: number; topics: Count; about: Count; contactShare: number; sensitive: number; leanBad: number; leanGood: number; capped: number; samples: string[] };
  who: { age: number | null; band: string | null; gender: string | null; zodiac: string | null; profiles: number; forOthers: Count };
  money: { teased: number; clicks: number; checkouts: number; paidOrders: number; spend: Count; lastPaidAt: number | null; member: boolean; products: Count };
  tags: string[];
}

const TOPIC_ZH: Record<string, string> = { relationship: "感情", career: "工作", decision: "抉择", study: "学业", money: "财", health: "健康", lost: "寻物", other: "其他" };
// who the question is about — the counterpart, read from the words (Simplified)
const ABOUT: [string, RegExp][] = [
  ["前任", /前任|前男友|前女友|ex\b|复合|挽回|分手/i], ["暧昧对象", /暧昧|喜欢的人|心动|crush|他喜欢我|她喜欢我/i],
  ["伴侣/配偶", /老公|老婆|丈夫|妻子|男朋友|女朋友|男友|女友|另一半|伴侣|婚姻|结婚/], ["第三者/外遇", /小三|外遇|劈腿|出轨|第三者/],
  ["工作/老板", /工作|老板|主管|面试|离职|辞职|升职|跳槽|offer|公司|同事/i], ["考试/学业", /考试|考上|学校|录取|成绩|论文|留学/],
  ["钱/投资", /钱|投资|股票|买房|卖房|借钱|还钱|生意|创业|收入/], ["家人", /妈妈|爸爸|父母|家人|孩子|儿子|女儿|婆婆/], ["健康", /病|手术|身体|怀孕|健康/],
];
const ZODIAC = ["鼠", "牛", "虎", "兔", "龙", "蛇", "马", "羊", "猴", "鸡", "狗", "猪"];
const top = (m: Map<string, number>, n = 6): Count => [...m.entries()].filter(([k]) => k).sort((a, b) => b[1] - a[1]).slice(0, n);
const inc = (m: Map<string, number>, k: string | null | undefined, by = 1) => { if (k) m.set(k, (m.get(k) ?? 0) + by); };
const region = (cc: string) => { try { return new Intl.DisplayNames(["zh-CN"], { type: "region" }).of(cc) ?? cc; } catch { return cc; } };

export function personProfile(bids: string[], customerId: number | null, now = Date.now()): Profile {
  const d = db();
  const ph = bids.map(() => "?").join(",") || "''";
  const net: NetRow[] = netOf(bids);
  const countries = new Map<string, number>(), cities = new Map<string, number>(), tz = new Map<string, number>(), langs = new Map<string, number>();
  const models = new Map<string, number>(), os = new Map<string, number>(), apps = new Map<string, number>(), classes = new Map<string, number>();
  for (const r of net) {
    inc(countries, r.country ? region(r.country) : null, r.hits);
    inc(cities, r.city ? [r.city, r.region].filter(Boolean).join("，") : null, r.hits);
    inc(tz, r.tz, r.hits); inc(langs, r.lang, r.hits);
    inc(models, r.model?.split(" · ")[0] ?? null, r.hits); inc(os, r.os, r.hits);
    inc(apps, r.app ? (/Threads|Instagram|Facebook|LINE|WeChat|小红书/.test(r.app) ? `${r.app} 内开` : r.app) : null, r.hits);
    inc(classes, r.device === "phone" ? "手机" : r.device === "tablet" ? "平板" : r.device === "desktop" ? "电脑" : r.device, r.hits);
  }

  // first touch: the earliest browser
  const br = bids.length ? d.prepare(`SELECT first_at, first_ref, first_c, first_path, first_locale, days, casts, teased, clicks, checkouts FROM browsers WHERE bid IN (${ph}) ORDER BY first_at`).all(...bids) as { first_at: number; first_ref: string | null; first_c: string | null; first_path: string | null; first_locale: string | null; days: number; casts: number; teased: number; clicks: number; checkouts: number }[] : [];
  const first = br[0];
  const sum = (k: "days" | "teased" | "clicks" | "checkouts") => br.reduce((a, r) => a + (r[k] ?? 0), 0);

  // the casts
  const casts = bids.length ? d.prepare(`SELECT at, tz, locale, question, sensitive, topic, thread_id, lean, capped, paid_sid, member FROM cast_log WHERE bid IN (${ph}) ORDER BY at`).all(...bids) as { at: number; tz: number; locale: string | null; question: string | null; sensitive: string | null; topic: string | null; thread_id: number | null; lean: string | null; capped: number; paid_sid: string | null; member: number | null }[] : [];
  const hours = Array(24).fill(0) as number[], weekdays = Array(7).fill(0) as number[];
  const topics = new Map<string, number>(), about = new Map<string, number>(), perThread = new Map<number, number>(), castDays = new Set<string>();
  let contact = 0, sensitive = 0, bad = 0, good = 0, capped = 0, night = 0;
  const samples: string[] = [];
  for (const c of casts) {
    // their own clock: the cast's timezone offset (minutes east of UTC)
    const local = new Date(c.at + (c.tz ?? 480) * 60_000);
    const h = local.getUTCHours();
    hours[h]! += 1; weekdays[local.getUTCDay()]! += 1; castDays.add(local.toISOString().slice(0, 10));
    if (h >= 23 || h < 4) night += 1;
    inc(topics, TOPIC_ZH[c.topic ?? "other"] ?? c.topic ?? "其他");
    if (c.thread_id) perThread.set(c.thread_id, (perThread.get(c.thread_id) ?? 0) + 1);
    if (c.sensitive) sensitive += 1;
    if (c.lean === "bad") bad += 1; else if (c.lean === "good") good += 1;
    if (c.capped) capped += 1;
    const q = c.question ? toHans(c.question) : "";
    if (q) {
      if (isContactQuestion(q)) contact += 1;
      for (const [k, re] of ABOUT) if (re.test(q)) { inc(about, k); break; }
      if (samples.length < 5 && !samples.includes(q)) samples.push(q.slice(0, 40));
    }
  }

  // who: a saved birth profile marked as themselves
  let age: number | null = null, gender: string | null = null, zodiac: string | null = null, profiles = 0;
  const forOthers = new Map<string, number>();
  if (customerId) {
    try {
      const ps = d.prepare("SELECT who, gender, input FROM birth_profiles WHERE customer_id = ?").all(customerId) as { who: string; gender: string | null; input: string }[];
      profiles = ps.length;
      const WHO_ZH: Record<string, string> = { partner: "伴侣/对象", family: "家人", friend: "朋友", other: "别人" };
      for (const p of ps) {
        if (p.who !== "self") { inc(forOthers, WHO_ZH[p.who] ?? p.who); continue; }
        const inp = JSON.parse(p.input) as { y?: number; gender?: string };
        if (inp.y && inp.y > 1900) { age = new Date(now).getUTCFullYear() - inp.y; zodiac = ZODIAC[(((inp.y - 4) % 12) + 12) % 12]!; }
        const g = p.gender ?? inp.gender;
        gender = g === "male" ? "男" : g === "female" ? "女" : gender;
      }
    } catch { /* no table yet */ }
  }
  const band = age === null ? null : age < 18 ? "18 岁以下" : age < 25 ? "18–24" : age < 35 ? "25–34" : age < 45 ? "35–44" : age < 55 ? "45–54" : "55+";

  // money
  const spend = new Map<string, number>(), products = new Map<string, number>(), cardCountry = new Map<string, number>();
  let paidOrders = 0, lastPaidAt: number | null = null, member = false;
  if (customerId) {
    const os2 = d.prepare("SELECT tier, amount_cents, currency, status, created_at, card_country FROM orders WHERE customer_id = ? ORDER BY created_at").all(customerId) as { tier: string; amount_cents: number | null; currency: string | null; status: string; created_at: number; card_country: string | null }[];
    for (const o of os2) {
      if (o.status !== "paid" || !o.amount_cents) continue;
      paidOrders += 1; lastPaidAt = o.created_at;
      inc(spend, (o.currency ?? "").toUpperCase(), o.amount_cents);
      inc(products, o.tier);
      inc(cardCountry, o.card_country ? region(o.card_country.toUpperCase()) : null);
    }
    try { member = !!d.prepare("SELECT 1 FROM subscriptions WHERE customer_id = ? AND status IN ('active','trialing') LIMIT 1").get(customerId); } catch { member = false; }
  }

  const days = Math.max(sum("days"), castDays.size);
  const maxPer = Math.max(0, ...perThread.values());
  const p: Profile = {
    where: { countries: top(countries), cities: top(cities), tz: top(tz, 3), langs: top(langs, 3), cardCountry: top(cardCountry, 3) },
    device: { models: top(models, 4), os: top(os, 4), apps: top(apps, 4), classes: top(classes, 3) },
    source: { firstRef: first?.first_ref ?? null, firstCampaign: first?.first_c ?? null, firstPath: first?.first_path ?? null, firstLocale: first?.first_locale ?? null, firstAt: first?.first_at ?? null },
    when: { hours, weekdays, days, firstAt: casts[0]?.at ?? first?.first_at ?? null, lastAt: casts.at(-1)?.at ?? null, castsPerDay: castDays.size ? Math.round((casts.length / castDays.size) * 10) / 10 : 0, nightShare: casts.length ? night / casts.length : 0 },
    asks: { casts: casts.length, matters: perThread.size, maxPerMatter: maxPer, topics: top(topics), about: top(about), contactShare: casts.length ? contact / casts.length : 0, sensitive, leanBad: bad, leanGood: good, capped, samples },
    who: { age, band, gender, zodiac, profiles, forOthers: top(forOthers, 4) },
    money: { teased: sum("teased"), clicks: sum("clicks"), checkouts: sum("checkouts"), paidOrders, spend: top(spend, 4), lastPaidAt, member, products: top(products, 6) },
    tags: [],
  };
  p.tags = profileTags(p);
  return p;
}

/** Plain tags an audience can be cut by. */
export function profileTags(p: Profile): string[] {
  const t: string[] = [];
  const topTopic = p.asks.topics[0]?.[0];
  if (p.asks.casts >= 10) t.push("高频起卦（≥10 卦）");
  else if (p.asks.casts >= 5) t.push("常来起卦（5–9 卦）");
  if (topTopic && p.asks.casts >= 3 && (p.asks.topics[0]![1] / p.asks.casts) >= 0.6) t.push(`专问${topTopic}`);
  if (p.asks.contactShare >= 0.4 && p.asks.casts >= 3) t.push("等对方联络/想复合");
  if (p.asks.about[0]?.[0] === "前任") t.push("前任题");
  if (p.asks.maxPerMatter >= 4) t.push(`同一件事反复问（最多 ${p.asks.maxPerMatter} 卦）`);
  if (p.when.nightShare >= 0.4 && p.asks.casts >= 3) t.push("深夜起卦（23–4 点占多）");
  if (p.when.days >= 7) t.push(`回访多（${p.when.days} 天）`);
  if (p.money.paidOrders === 0 && p.money.clicks >= 2) t.push("看价没买（价格敏感）");
  if (p.money.paidOrders === 0 && p.money.checkouts >= 1) t.push("开了付款没付完");
  if (p.money.paidOrders >= 2) t.push("复购");
  else if (p.money.paidOrders === 1) t.push("付过一次");
  if (p.money.member) t.push("会员");
  const app = p.device.apps[0]?.[0];
  if (app && /内开/.test(app)) t.push(`从 ${app.replace(" 内开", "")} 来`);
  if (p.device.models[0]?.[0]?.startsWith("iPhone")) t.push("iPhone");
  if (p.who.band) t.push(`${p.who.gender ?? ""}${p.who.band}`.trim());
  if (p.who.forOthers.length) t.push("替别人排盘");
  return t;
}
