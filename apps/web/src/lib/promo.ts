import { db, recordOps } from "./db";
import { SERVICE_IDS, serviceById, servicesFor, type Service } from "./services";
import type { Locale } from "./locales";

/**
 * 10-22 进度表 58 ② — the 「也可以試試」 strip: the home page, the 解籤 page and the reading page each show one or two
 * services the owner picks on /admin/features (next to the switches), without a deploy. The pick is a list of service
 * ids per surface in the `site_settings` table; a service whose switch is not on for this request is simply left out.
 */
export type PromoSurface = "home" | "jieqian" | "reading" | "mingli" | "jiaobei" | "tarot" | "cast";
/** 10-22 进度表 76 ⑤: the 擲筊／求籤 pages and the tarot page carry the strip too (the product template's block 8) */
export const PROMO_SURFACES: PromoSurface[] = ["home", "jieqian", "reading", "mingli", "jiaobei", "tarot", "cast"];
export const PROMO_MAX = 2;
/** until the owner picks: what fits each page best today */
/** 10-22 进度表 86: the defaults follow the 承接地圖 (设计稿第 3 節) — 問事 tools do not point at each other; 六爻 for the days */
/** 10-29 (Neil: 推广也要带上新产品): the home strip carries 犯太歲 (the season, and the way into the 年書) and 姓名學 until the
 * owner picks; the 命理 pages (八字／紫微／星盤／合盤／年書) carry 姓名學 next to 六爻 */
const DEFAULTS: Record<PromoSurface, string[]> = { home: ["taisui", "name"], jieqian: ["jiaobei", "today-qian"], reading: ["zeri", "yunshi"], mingli: ["cast", "name"], jiaobei: ["cast", "today-qian"], tarot: ["cast", "zeri"], cast: ["zeri", "bazi"] };

let ready = false;
function ensure(): void {
  if (ready) return;
  db().exec("CREATE TABLE IF NOT EXISTS site_settings (k TEXT PRIMARY KEY, v TEXT NOT NULL, updated_at INTEGER NOT NULL)");
  ready = true;
}
export function getSetting(k: string): string | null {
  ensure();
  return (db().prepare("SELECT v FROM site_settings WHERE k = ?").get(k) as { v: string } | undefined)?.v ?? null;
}
export function setSetting(k: string, v: string, now = Date.now()): void {
  ensure();
  db().prepare("INSERT INTO site_settings (k, v, updated_at) VALUES (?,?,?) ON CONFLICT(k) DO UPDATE SET v = excluded.v, updated_at = excluded.updated_at").run(k, v, now);
}

export const isPromoSurface = (x: unknown): x is PromoSurface => typeof x === "string" && (PROMO_SURFACES as string[]).includes(x);

/** the owner's pick for a surface (ids), the default until set */
export function promoPick(surface: PromoSurface): { ids: string[]; set: boolean } {
  const raw = getSetting(`promo.${surface}`);
  if (raw) {
    try { const ids = (JSON.parse(raw) as unknown[]).filter((x): x is string => typeof x === "string" && SERVICE_IDS.includes(x)).slice(0, PROMO_MAX); return { ids, set: true }; } catch { /* default */ }
  }
  return { ids: DEFAULTS[surface], set: false };
}
export function setPromoPick(surface: PromoSurface, ids: string[]): void {
  const clean = [...new Set(ids.filter((x) => SERVICE_IDS.includes(x)))].slice(0, PROMO_MAX);
  setSetting(`promo.${surface}`, JSON.stringify(clean));
  recordOps("promo_set", `${surface} → ${clean.join(",") || "(none)"}`);
}

/** the services to show on this surface, for this locale and request (switches respected; `exclude` = the page's own service) */
export async function promoFor(surface: PromoSurface, locale: Locale, adminCookie: string | undefined, exclude: string[] = []): Promise<Service[]> {
  const visible = new Set((await servicesFor(locale, adminCookie)).map((s) => s.id));
  return promoPick(surface).ids.filter((id) => visible.has(id) && !exclude.includes(id)).map((id) => serviceById(id)!).filter(Boolean);
}
