import { db } from "./db";
import { isContactQuestion } from "./contact-question";
import { toHans } from "./hant";
import { swr } from "./swr";

/**
 * 10-31 进度表 130 ③ 受众画像 (Neil: 「后期我投放广告的时候需要用」): who our readers are, by group — those who paid,
 * those who cast a lot (≥5) and never paid, and everyone who cast — across the dimensions an ad platform lets you
 * target: country/city (edge, from 10-31), the reader's own timezone and language, device and the app they opened us
 * in, the hour they ask, the topic, contact/复合 questions, age band and gender (saved birth profiles), first source,
 * and card country for payers. Internal only; built from our own tables over the last N days; test customers left out.
 */
export type Dist = { k: string; n: number }[];
export type Group = { name: string; people: number; casts: number; dims: Record<string, { rows: Dist; base: number }> };

const TOPIC_ZH: Record<string, string> = { relationship: "感情", career: "工作", decision: "抉择", study: "学业", money: "财", health: "健康", lost: "寻物", other: "其他" };
const DEV_ZH: Record<string, string> = { ios: "iPhone/iPad", android: "Android", desktop: "电脑", other: "其他" };
const APP_ZH: Record<string, string> = { threads: "Threads 内", instagram: "Instagram 内", facebook: "Facebook 内", line: "LINE 内", wechat: "微信内", xiaohongshu: "小红书内", browser: "浏览器" };
const LOC_ZH: Record<string, string> = { "zh-hant": "繁中", zh: "简中", en: "英", ja: "日", ko: "韩", fr: "法", de: "德", es: "西", pt: "葡" };
const tzName = (m: number) => (m === 480 ? "UTC+8（台港新马中）" : m === 540 ? "UTC+9（日韩）" : m === 420 ? "UTC+7（泰越印尼）" : m === 600 || m === 660 ? "UTC+10/11（澳东）" : m <= -240 && m >= -600 ? "美洲" : m >= -60 && m <= 180 ? "欧洲/非洲" : `UTC${m >= 0 ? "+" : ""}${m / 60}`);
const region = (cc: string) => { try { return new Intl.DisplayNames(["zh-CN"], { type: "region" }).of(cc) ?? cc; } catch { return cc; } };

function dist(m: Map<string, number>, total: number, n = 8): Dist {
  return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => ({ k, n: total ? v / total : 0 }));
}

export function audience(days = 60, now = Date.now()): { groups: Group[]; since: number } {
  return swr(`audience130|${days}`, 10 * 60_000, 60 * 60_000, () => compute(days, now));
}

function compute(days: number, now: number): { groups: Group[]; since: number } {
  const d = db();
  const since = now - days * 86_400_000;
  type C = { bid: string; at: number; tz: number; locale: string | null; question: string | null; topic: string | null; device: string | null; app: string | null };
  const casts = d.prepare(`SELECT bid, at, tz, locale, question, topic, device, app FROM cast_log WHERE at >= ? AND COALESCE(member, 0) = 0`).all(since) as C[];
  const byBid = new Map<string, C[]>();
  for (const c of casts) { const l = byBid.get(c.bid) ?? []; l.push(c); byBid.set(c.bid, l); }

  // browser → customer; test customers out; payers = a customer with a paid order
  const link = new Map<string, number>();
  for (const r of d.prepare("SELECT bid, customer_id FROM browser_links").all() as { bid: string; customer_id: number }[]) link.set(r.bid, r.customer_id);
  const test = new Set((d.prepare("SELECT id FROM customers WHERE test_flag = 1").all() as { id: number }[]).map((r) => r.id));
  const paid = new Set((d.prepare("SELECT DISTINCT customer_id FROM orders WHERE status = 'paid' AND amount_cents > 0 AND customer_id IS NOT NULL").all() as { customer_id: number }[]).map((r) => r.customer_id));
  const card = new Map<number, string>();
  for (const r of d.prepare("SELECT customer_id, card_country FROM orders WHERE status = 'paid' AND card_country IS NOT NULL AND customer_id IS NOT NULL").all() as { customer_id: number; card_country: string }[]) card.set(r.customer_id, r.card_country.toUpperCase());
  const birth = new Map<number, { y: number | null; g: string | null }>();
  try {
    for (const r of d.prepare("SELECT customer_id, gender, input FROM birth_profiles WHERE who = 'self'").all() as { customer_id: number; gender: string | null; input: string }[]) {
      try { const i = JSON.parse(r.input) as { y?: number; gender?: string }; birth.set(r.customer_id, { y: i.y ?? null, g: r.gender ?? i.gender ?? null }); } catch { /* skip */ }
    }
  } catch { /* no table */ }
  const src = new Map<string, string>();
  for (const r of d.prepare("SELECT bid, first_ref, first_c FROM browsers WHERE last_at >= ?").all(since) as { bid: string; first_ref: string | null; first_c: string | null }[])
    src.set(r.bid, r.first_c ? `推广 ${r.first_c}` : r.first_ref ? r.first_ref.replace(/^~ref:/, "").replace(/^www\./, "") : "直接打开");
  const net = new Map<string, { country: string | null; city: string | null; model: string | null }>();
  try {
    for (const r of d.prepare("SELECT bid, country, city, model FROM browser_net WHERE last_at >= ? AND device IS NOT 'bot' ORDER BY last_at").all(since) as { bid: string; country: string | null; city: string | null; model: string | null }[]) net.set(r.bid, r);
  } catch { /* table appears with the first visit after 10-31 */ }

  // people: a customer (all their browsers) or a lone browser
  type P = { key: string; cid: number | null; bids: string[]; casts: C[] };
  const people = new Map<string, P>();
  for (const [bid, cs] of byBid) {
    const cid = link.get(bid) ?? null;
    if (cid !== null && test.has(cid)) continue;
    const key = cid !== null ? `c${cid}` : bid;
    const p = people.get(key) ?? { key, cid, bids: [], casts: [] };
    p.bids.push(bid); p.casts.push(...cs);
    people.set(key, p);
  }
  const all = [...people.values()];
  const groups: [string, P[]][] = [
    ["付费读者", all.filter((p) => p.cid !== null && paid.has(p.cid))],
    ["高频没付（≥5 卦）", all.filter((p) => (p.cid === null || !paid.has(p.cid)) && p.casts.length >= 5)],
    ["全部起卦的人", all],
  ];

  const yr = new Date(now).getUTCFullYear();
  const out: Group[] = groups.map(([name, ps]) => {
    const m: Record<string, Map<string, number>> = {};
    const add = (dim: string, k: string | null | undefined, w = 1) => { if (!k) return; (m[dim] ??= new Map()).set(k, (m[dim]!.get(k) ?? 0) + w); };
    let castN = 0;
    for (const p of ps) {
      castN += p.casts.length;
      const w = 1; // per person, not per cast
      const c0 = p.casts[0]!;
      add("时区（他自己的钟）", tzName(c0.tz ?? 480), w);
      add("语言", LOC_ZH[c0.locale ?? ""] ?? c0.locale ?? "?", w);
      const nr = p.bids.map((b) => net.get(b)).find(Boolean);
      add("国家／地区（10-31 起）", nr?.country ? region(nr.country) : null, w);
      add("城市（10-31 起）", nr?.city ?? null, w);
      add("设备", DEV_ZH[c0.device ?? ""] ?? null, w);
      add("型号（10-31 起）", nr?.model?.split(" · ")[0] ?? null, w);
      add("在哪打开", APP_ZH[c0.app ?? ""] ?? null, w);
      add("第一次从哪来", src.get(p.bids[0]!) ?? null, w);
      // what they ask: each person's main topic; contact questions; hours (per cast, weighted to 1 per person)
      const tm = new Map<string, number>();
      let contact = 0;
      for (const c of p.casts) {
        tm.set(c.topic ?? "other", (tm.get(c.topic ?? "other") ?? 0) + 1);
        if (c.question && isContactQuestion(toHans(c.question))) contact += 1;
        const h = new Date(c.at + (c.tz ?? 480) * 60_000).getUTCHours();
        add("几点起卦（按卦）", h < 6 ? "0–6 点" : h < 12 ? "6–12 点" : h < 18 ? "12–18 点" : h < 23 ? "18–23 点" : "23–24 点");
      }
      const topT = [...tm.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "other";
      add("主要问", TOPIC_ZH[topT] ?? topT, w);
      add("问对方会不会联络/复合", contact / p.casts.length >= 0.4 ? "多半是" : contact ? "偶尔" : "没有", w);
      add("起卦数", p.casts.length >= 10 ? "10+" : p.casts.length >= 5 ? "5–9" : p.casts.length >= 2 ? "2–4" : "1", w);
      const b = p.cid !== null ? birth.get(p.cid) : undefined;
      if (b?.y) { const age = yr - b.y; add("年龄（有生辰档案的）", age < 25 ? "18–24" : age < 35 ? "25–34" : age < 45 ? "35–44" : age < 55 ? "45–54" : "55+", w); }
      if (b?.g) add("性别（有生辰档案的）", b.g === "male" ? "男" : b.g === "female" ? "女" : b.g, w);
      if (p.cid !== null && card.has(p.cid)) add("银行卡国家（付过款的）", region(card.get(p.cid)!), w);
    }
    const dims: Record<string, { rows: Dist; base: number }> = {};
    for (const [k, mm] of Object.entries(m)) {
      const total = [...mm.values()].reduce((a, v) => a + v, 0);
      dims[k] = { rows: dist(mm, total), base: total };
    }
    return { name, people: ps.length, casts: castN, dims };
  });
  return { groups: out, since };
}
