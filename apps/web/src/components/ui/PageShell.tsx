import type { ReactNode } from "react";

/**
 * 10-22 进度表 76 A — the one page frame. Until now pages picked their own width (34 / 36 / 40 / 42 / 46 / 52 rem) and
 * padding; new pages take this and the width question goes away. `narrow` is the reading column, `default` the product
 * pages, `wide` the tables and charts.
 */
const WIDTH = { narrow: "max-w-[40rem]", default: "max-w-[46rem]", wide: "max-w-[52rem]" } as const;
export default function PageShell({ children, width = "default", className = "" }: { children: ReactNode; width?: keyof typeof WIDTH; className?: string }) {
  return <div className={`mx-auto w-full ${WIDTH[width]} px-[var(--s-4)] md:px-8 pt-10 pb-24 ${className}`}>{children}</div>;
}

/** the preview banner every switched product shows while only the admin browser sees it */
export function PreviewNote({ on, children }: { on: boolean; children?: ReactNode }) {
  if (!on) return null;
  return <p className="t-small mb-[var(--s-4)] p-[var(--s-3)] border border-[var(--gold)] rounded-[2px]">{children ?? "預覽中：只有登入後台的瀏覽器看得到，確認後到 /admin/features 開放。"}</p>;
}
