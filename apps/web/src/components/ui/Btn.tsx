import Link from "next/link";
import type { ReactNode } from "react";

/**
 * 10-22 进度表 76 A — the button. Three looks the site already uses, written once: `primary` (ink block, letter-spaced),
 * `secondary` (outlined pill), `chip` (small outlined choice). An `href` renders a link, otherwise a <button>.
 */
const LOOK = {
  primary: "inline-block text-center min-h-[var(--s-6)] px-6 py-3 rounded-[2px] bg-[var(--ink)] !text-[var(--paper)] text-[13px] tracking-[0.16em] no-underline disabled:opacity-45",
  secondary: "inline-block px-4 py-2 rounded-full border border-[var(--ink-16)] hover:border-[var(--ink)] text-[14px] no-underline disabled:opacity-45",
  chip: "inline-block px-3.5 py-2 rounded-full border border-[var(--ink-16)] hover:border-[var(--ink)] text-[14px] text-left no-underline disabled:opacity-45",
} as const;
export type BtnLook = keyof typeof LOOK;
type Common = { look?: BtnLook; className?: string; children: ReactNode; "data-heat"?: string; block?: boolean };
type AsLink = Common & { href: string; onClick?: never; type?: never; disabled?: never };
type AsButton = Common & { href?: undefined; onClick?: () => void; type?: "button" | "submit"; disabled?: boolean };

export default function Btn(p: AsLink | AsButton) {
  const cls = `${LOOK[p.look ?? "primary"]} ${p.block ? "block w-full" : ""} ${p.className ?? ""}`;
  if (p.href) return <Link href={p.href} data-heat={p["data-heat"]} className={cls}>{p.children}</Link>;
  return <button type={p.type ?? "button"} onClick={p.onClick} disabled={p.disabled} data-heat={p["data-heat"]} className={cls}>{p.children}</button>;
}
