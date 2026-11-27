"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { NavItem } from "@/lib/site-nav";
import { activeKey } from "@/lib/nav-active";

/**
 * 10-22 进度表 76 C: the four doors — a row of links in the masthead on a desktop, a fixed tab bar at the bottom of a
 * phone. The active door is read from the path (lib/nav-active.ts).
 */

/**
 * 11-08 (Neil, the board: 访客 scoa on a 公开卦例 page — four taps on 「看自己」 that went nowhere, then the site's error
 * screen): iOS Chrome 156 on iOS 27 threw 「Maximum call stack size exceeded」 from a script of its own injected into the
 * page, and the app's in-page navigation stopped working. Whatever breaks the router, a tap on one of the four doors
 * still has to open the door: if the address has not changed 2.5 s after the tap, the page is opened the plain way.
 */
const WATCH_MS = 2_500;
export function watchTap(href: string) {
  return () => {
    try {
      const from = window.location.pathname;
      const target = new URL(href, window.location.href).pathname;
      if (target === from) return;
      window.setTimeout(() => { if (window.location.pathname === from) window.location.assign(href); }, WATCH_MS);
    } catch { /* the plain link still works */ }
  };
}

export default function SiteNav({ items, locale, where }: { items: NavItem[]; locale: string; where: "top" | "bottom" }) {
  const pathname = usePathname() ?? "/";
  const active = activeKey(pathname, locale, items);
  if (where === "top") {
    return (
      <nav aria-label="sections" className="hidden md:flex items-center gap-6">
        {items.map((it) => (
          <Link key={it.key} href={it.href} data-heat={`nav-${it.key}`} onClick={watchTap(it.href)} aria-current={active === it.key ? "page" : undefined}
            className={`t-label transition-colors ${active === it.key ? "!text-[var(--ink)]" : "hover:text-[var(--ink)]"}`}>{it.label}</Link>
        ))}
      </nav>
    );
  }
  return (
    <nav aria-label="sections" className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-[var(--paper)] border-t border-[var(--ink-16)]" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
      <ul className="grid" style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
        {items.map((it) => (
          <li key={it.key}>
            <Link href={it.href} data-heat={`tab-${it.key}`} onClick={watchTap(it.href)} aria-current={active === it.key ? "page" : undefined}
              className={`flex items-center justify-center h-11 text-[13px] leading-tight border-t-2 -mt-px transition-colors ${active === it.key ? "border-[var(--ink)] text-[var(--ink)]" : "border-transparent text-[var(--ink-66)]"}`}>{it.label}</Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
