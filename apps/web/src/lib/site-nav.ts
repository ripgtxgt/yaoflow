import { featureVisible } from "./features";
import { servicesFor } from "./services";
import type { Locale } from "./locales";

/**
 * 10-22 进度表 76 C — the site's four doors, by intent (调研结论 §三: 「導航按意圖，網址按體系」): 問事 / 看自己 / 每天 /
 * 我的. The same four in the header on a desktop and as the bottom tab bar on a phone (components/SiteNav.tsx). A door
 * whose group has nothing open in this language (看自己, 每天 outside Chinese) is left out.
 */
export type NavKey = "ask" | "self" | "daily" | "mine";
export interface NavItem { key: NavKey; label: string; href: string; /** path prefixes (locale-less) that light it up */ match: string[] }

const LABEL: Record<NavKey, Record<Locale, string>> = {
  ask: { zh: "问事", "zh-hant": "問事", en: "Ask", ja: "問う", ko: "묻기", fr: "Demander", de: "Fragen", es: "Preguntar", pt: "Perguntar" },
  self: { zh: "看自己", "zh-hant": "看自己", en: "Your chart", ja: "自分を知る", ko: "나를 보기", fr: "Votre thème", de: "Dein Horoskop", es: "Tu carta", pt: "Seu mapa" },
  daily: { zh: "每天", "zh-hant": "每天", en: "Every day", ja: "毎日", ko: "매일", fr: "Chaque jour", de: "Jeden Tag", es: "Cada día", pt: "Todo dia" },
  mine: { zh: "我的", "zh-hant": "我的", en: "Mine", ja: "マイページ", ko: "내 정보", fr: "Mon espace", de: "Mein Bereich", es: "Mi espacio", pt: "Meu espaço" },
};
// 10-23 (Neil: 「看自己和每天這兩欄是一樣的啊，你怎麼不定位呢」): each door has its own page (/services/self,
// /services/daily — app/[locale]/services/[group]) and is lit there; they used to open /services#self and #daily,
// which both showed the top of the same page
const MATCH: Record<NavKey, string[]> = {
  ask: ["/", "/cast", "/reading", "/tarot", "/jieqian", "/qian", "/jiaobei", "/qiuqian", "/ask", "/for", "/gua", "/cases", "/share", "/proof"],
  self: ["/services/self", "/bazi", "/ziwei", "/xingpan", "/hepan", "/nianshu"],
  daily: ["/services/daily", "/today-qian", "/huangli", "/zeri", "/yunshi", "/today"],
  mine: ["/account", "/matter", "/login", "/timing"],
};

export async function navItemsFor(locale: Locale, adminCookie: string | undefined): Promise<NavItem[]> {
  const groups = new Set((await servicesFor(locale, adminCookie)).map((s) => s.group));
  const hub = await featureVisible("services", adminCookie);
  const items: NavItem[] = [{ key: "ask", label: LABEL.ask[locale], href: `/${locale}`, match: MATCH.ask }];
  if (hub && groups.has("self")) items.push({ key: "self", label: LABEL.self[locale], href: `/${locale}/services/self`, match: MATCH.self });
  if (hub && groups.has("daily")) items.push({ key: "daily", label: LABEL.daily[locale], href: `/${locale}/services/daily`, match: MATCH.daily });
  items.push({ key: "mine", label: LABEL.mine[locale], href: `/${locale}/account`, match: MATCH.mine });
  return items;
}
