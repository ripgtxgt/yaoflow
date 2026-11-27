import Link from "next/link";
import { t, type Locale } from "@/lib/i18n";
import { GUA, guaLocales, guaSlug } from "@/lib/gua";
import { hexName } from "@/lib/names";

/**
 * 我的卦谱 (09-21, A3 — 裂变玩法调研 §2.5, the Wrapped lesson: the artifact
 * shows the reader, not us). Sixty-four cells; the ones they have cast are
 * filled in ink. No points, no streak, no prize — collecting is the pleasure,
 * and the empty cells are the invitation.
 */
export default function HexAtlas({ locale, drawn }: { locale: Locale; drawn: Set<number> }) {
  const linked = guaLocales().includes(locale);
  return (
    <>
      <p className="t-small !text-[var(--ink-66)] mb-[var(--s-4)]">
        {drawn.size >= 64 ? t(locale, "atlasAll") : t(locale, "atlasLead", { n: drawn.size })}
      </p>
      <div className="grid grid-cols-8 gap-1.5 sm:gap-2 max-w-[28rem]">
        {GUA.map((h) => {
          const on = drawn.has(h.number);
          const cell = (
            <span
              className={`flex items-center justify-center aspect-square rounded-[2px] text-[11px] tabular-nums border transition-colors ${
                on
                  ? "bg-[var(--ink)] text-[var(--paper)] border-[var(--ink)]"
                  : "border-[var(--ink-16)] text-[var(--ink-45)]"
              }`}
            >
              {h.number}
            </span>
          );
          const label = `${h.number} · ${hexName(h, locale)}`;
          return linked ? (
            <Link key={h.number} href={`/${locale}/gua/${guaSlug(h)}`} title={label} aria-label={label} className="block">
              {cell}
            </Link>
          ) : (
            <span key={h.number} title={label} aria-label={label} className="block">
              {cell}
            </span>
          );
        })}
      </div>
    </>
  );
}
