import { CRISIS_T, HELPLINE_DIRECTORY } from "@/lib/crisis";
import type { Locale } from "@/lib/locales";

/** 09-26 危机词闸门: no cast, no price — a helpline in their language instead. */
export default function CrisisNote({ locale }: { locale: Locale }) {
  const c = CRISIS_T[locale];
  return (
    <div className="mt-[var(--s-3)] border-l-2 border-[var(--gold)] pl-[var(--s-3)] fade-in" role="alert">
      <p className="t-body mb-[var(--s-2)]">{c.lead}</p>
      <p className="t-small opacity-80 mb-[var(--s-1)]">{c.call}</p>
      <ul className="t-small mb-[var(--s-2)]">
        {c.lines.map((h) => (
          <li key={h.tel + h.where}>
            {h.where} · {h.name}：<a href={`tel:${h.tel.replace(/[^0-9+]/g, "")}`} className="underline underline-offset-4 tabular-nums">{h.tel}</a>
          </li>
        ))}
      </ul>
      <p className="t-small opacity-80 mb-[var(--s-1)]">
        {c.more} <a href={HELPLINE_DIRECTORY} target="_blank" rel="noopener noreferrer" className="underline underline-offset-4">findahelpline.com</a>
      </p>
      <p className="t-small opacity-70 mb-[var(--s-1)]">{c.emergency}</p>
      <p className="t-small opacity-60">{c.edit}</p>
    </div>
  );
}

