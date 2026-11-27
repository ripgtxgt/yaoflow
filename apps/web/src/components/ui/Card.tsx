import type { ReactNode } from "react";

/** 10-22 进度表 76 A — the bordered card the product pages, the services list and the strips share */
export default function Card({ children, label, title, className = "", heat }: { children?: ReactNode; label?: string; title?: string; className?: string; heat?: string }) {
  return (
    <section className={`rounded-[6px] border border-[var(--ink-16)] p-4 ${className}`} data-heat={heat}>
      {label && <p className="t-label !text-[var(--gold-text)]">{label}</p>}
      {title && <h2 className={`t-d3 ${label ? "mt-1" : ""}`}>{title}</h2>}
      {children}
    </section>
  );
}
