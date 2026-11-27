import { homeDay } from "@/lib/clock";
import { parseYmd } from "./day";

/** 10-17 进度表 69: helpers shared by the almanac pages */
export const HL_LOCALES = new Set(["zh-hant", "zh"]);
export const todayYmd = () => homeDay(Date.now());
export function shiftDay(ymd: string, n: number): string {
  const p = parseYmd(ymd)!;
  const t = Date.UTC(p.y, p.m - 1, p.d) + n * 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
}
export function shiftMonth(ym: string, n: number): string {
  const [y, m] = ym.split("-").map(Number) as [number, number];
  const t = new Date(Date.UTC(y, m - 1 + n, 1));
  return t.toISOString().slice(0, 7);
}

/** the almanac's pages for the sitemap: today, ±1 year of days, ±1 year of months, the term pages */
export function huangliSitemap(site: string, termNames: string[], built: Date): { url: string; lastModified: Date; changeFrequency: "daily" | "monthly" | "yearly"; priority: number }[] {
  const out: { url: string; lastModified: Date; changeFrequency: "daily" | "monthly" | "yearly"; priority: number }[] = [];
  const today = todayYmd();
  for (const l of ["zh-hant", "zh"]) {
    out.push({ url: `${site}/${l}/huangli`, lastModified: built, changeFrequency: "daily", priority: 0.8 });
    for (let i = -365; i <= 365; i++) out.push({ url: `${site}/${l}/huangli/${shiftDay(today, i)}`, lastModified: built, changeFrequency: "yearly", priority: 0.3 });
    for (let i = -12; i <= 12; i++) out.push({ url: `${site}/${l}/huangli/${shiftMonth(today.slice(0, 7), i)}`, lastModified: built, changeFrequency: "monthly", priority: 0.4 });
    for (const t of termNames) out.push({ url: `${site}/${l}/huangli/terms/${encodeURIComponent(t)}`, lastModified: built, changeFrequency: "yearly", priority: 0.5 });
  }
  return out;
}
