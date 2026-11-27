import { createHash } from "node:crypto";
import { db, recordOps } from "./db";
import { ADS_CLICK_DAYS, adsClickAllowed, parseClickCookie, type ClickKind } from "./ads-click";
import { ZERO_DECIMAL, type Currency } from "./money";

/**
 * 11-27 T-007 收尾 — Google Ads 付费转化（离线点击转化，服务端）。
 *
 * 为什么不在成功页放 gtag：付款成功页常常没人看到（Stripe 跳回、关标签页），且站内 ad_storage 全局 denied；我们的
 * orders 表才是真账。做法：
 *   ① 进站：广告点击的落地 URL 带 gclid / gbraid / wbraid，middleware 把它放进一个只记点击编号的 Cookie（yf_gc，90 天，
 *      httpOnly）；EEA / 英国 / 瑞士访客不记（没有同意横幅）。
 *   ② 结账：checkout_start（/api/track）与结账接口按标签页会话 sid 记下这个编号（ads_clicks），与 orders.browser_sid 同一把钥匙。
 *   （①② 的纯函数在 lib/ads-click.ts，middleware 在 edge 上跑，不能碰数据库）
 *   ③ 上报：/api/ads/conversions.csv 按 Google Ads「离线点击转化」模板列出近 60 天已付款订单（带点击编号的那些），
 *      Google Ads 后台「定期上传 → HTTPS」每天来取（Basic Auth）。Order ID 是订单号的哈希，同一笔只算一次。
 * 送出去的只有：点击编号、转化名、付款时间、金额与币种、订单号哈希。从不送邮箱、问题、姓名。
 * 退款不自动撤回（Ads 需另传调整文件）；测试单不上报。
 */

let ready = false;
function ensure(): void {
  if (ready) return;
  db().exec(`CREATE TABLE IF NOT EXISTS ads_clicks (sid TEXT PRIMARY KEY, kind TEXT NOT NULL, click_id TEXT NOT NULL, clicked_at INTEGER NOT NULL, at INTEGER NOT NULL)`);
  ready = true;
}

/** 结账开始时：这个标签页会话来自哪次广告点击（超过 90 天的点击不算） */
export function noteAdsClick(sid: string | null | undefined, cookie: string | null | undefined, country: string | null | undefined, now = Date.now()): boolean {
  try {
    if (!sid || sid === "anon" || sid === "nosession" || !adsClickAllowed(country)) return false;
    const c = parseClickCookie(cookie);
    if (!c || now - c.at > ADS_CLICK_DAYS * 86_400_000 || c.at > now + 3_600_000) return false;
    ensure();
    db().prepare(`INSERT INTO ads_clicks (sid, kind, click_id, clicked_at, at) VALUES (?,?,?,?,?)
        ON CONFLICT(sid) DO UPDATE SET kind = excluded.kind, click_id = excluded.click_id, clicked_at = excluded.clicked_at, at = excluded.at`)
      .run(sid, c.kind, c.id, c.at, now);
    return true;
  } catch {
    return false; // never in the way of a checkout
  }
}

export interface AdsConversionRow { kind: ClickKind; click_id: string; clicked_at: number; session_id: string; created_at: number; amount_cents: number; currency: string; edge_country: string | null }

const major = (cents: number, cur: string) => ((ZERO_DECIMAL as Set<Currency | string>).has(cur.toUpperCase()) ? cents : cents / 100);

/** UTC 的 "yyyy-MM-dd HH:mm:ss+00:00"（Google Ads 模板接受带时区偏移的时间） */
export function adsTime(ms: number): string {
  return `${new Date(ms).toISOString().slice(0, 19).replace("T", " ")}+00:00`;
}

/** 订单号的哈希：用来去重，不暴露 Stripe 会话号 */
function orderHash(sessionId: string): string {
  return createHash("sha256").update(`yf-ads:${sessionId}`).digest("hex").slice(0, 20);
}

/** 近 `days` 天带广告点击的已付款订单（测试单、0 元单、退款/争议单除外；点击须早于付款、且在 90 天内） */
export function adsConversions(now = Date.now(), days = 60): AdsConversionRow[] {
  ensure();
  const NOT_TEST = "(o.customer_id IS NULL OR o.customer_id NOT IN (SELECT id FROM customers WHERE test_flag = 1)) AND COALESCE(o.test_flag, 0) = 0";
  const rows = db().prepare(`SELECT a.kind, a.click_id, a.clicked_at, o.session_id, o.created_at, o.amount_cents, o.currency, o.edge_country
      FROM orders o JOIN ads_clicks a ON a.sid = o.browser_sid
      WHERE o.created_at >= ? AND o.amount_cents > 0 AND o.currency IS NOT NULL AND o.status = 'paid' AND ${NOT_TEST}
        AND a.clicked_at <= o.created_at AND o.created_at - a.clicked_at <= ?
      ORDER BY o.created_at`).all(now - days * 86_400_000, ADS_CLICK_DAYS * 86_400_000) as unknown as AdsConversionRow[];
  return rows.filter((r) => adsClickAllowed(r.edge_country));
}

const csvCell = (s: string | number) => {
  const v = String(s);
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
};

/**
 * Google Ads「离线点击转化」CSV。gclid 一列；gbraid / wbraid（iOS 隐私点击）各有自己的列——Google 规定一行只填一种。
 */
export function adsConversionsCsv(conversionName: string, now = Date.now()): { csv: string; rows: number } {
  const rows = adsConversions(now);
  const head = ["Google Click ID", "GBRAID", "WBRAID", "Conversion Name", "Conversion Time", "Conversion Value", "Conversion Currency", "Order ID"];
  const lines = [head.join(",")];
  for (const r of rows) {
    const cur = r.currency.toUpperCase();
    lines.push([
      r.kind === "gclid" ? r.click_id : "", r.kind === "gbraid" ? r.click_id : "", r.kind === "wbraid" ? r.click_id : "",
      conversionName, adsTime(r.created_at), major(r.amount_cents, cur), cur, orderHash(r.session_id),
    ].map(csvCell).join(","));
  }
  return { csv: `${lines.join("\n")}\n`, rows: rows.length };
}

/** 后台看一眼：近 30 天有多少结账带了广告点击、多少成了付款 */
export function adsClickStats(now = Date.now()): { clicksAtCheckout: number; paid: number } {
  ensure();
  const since = now - 30 * 86_400_000;
  const clicksAtCheckout = (db().prepare("SELECT COUNT(*) AS n FROM ads_clicks WHERE at >= ?").get(since) as { n: number }).n;
  return { clicksAtCheckout, paid: adsConversions(now, 30).length };
}

export const noteAdsFetch = (rows: number, ok: boolean): void => recordOps("ads_csv", `${ok ? "served" : "refused"} ${rows}`);
