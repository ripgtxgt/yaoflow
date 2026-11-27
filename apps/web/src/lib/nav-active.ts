import type { NavItem } from "./site-nav";

/**
 * Which of the four doors is lit for a path (the item's `match` prefixes, locale stripped). Plain code with no server
 * imports, so the client tab bar (components/SiteNav.tsx) and the tests share it.
 */
export function activeKey(pathname: string, locale: string, items: NavItem[]): string | null {
  const p = pathname.startsWith(`/${locale}`) ? pathname.slice(locale.length + 1) || "/" : pathname;
  for (const it of items) {
    for (const m of it.match) {
      if (m === "/" ? p === "/" : p === m || p.startsWith(`${m}/`) || p.startsWith(`${m}?`)) return it.key;
    }
  }
  return null;
}
