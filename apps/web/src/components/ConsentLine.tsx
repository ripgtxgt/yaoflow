import Link from "next/link";
import { t, type DictKey, type Locale } from "@/lib/i18n";

/**
 * 09-25 合规: the one line under a pay / subscribe button that a consumer law
 * wants "adjacent to the request for consent" — immediate-delivery consent and
 * loss of the 14-day withdrawal right (CRD Art.16(m)), or the auto-renewal
 * terms (California ARL, CRD Art.6). The dictionary string carries `<a>…</a>`
 * around the words that link to the Terms page.
 */
export default function ConsentLine({ locale, k, vars, text }: { locale: Locale; k: DictKey; vars?: Record<string, string | number>; /** 10-10: a line prepared elsewhere (same <a>…</a> convention) */ text?: string }) {
  const s = text ?? t(locale, k, vars);
  const m = /^(.*?)<a>(.*?)<\/a>(.*)$/s.exec(s);
  return (
    <p className="t-small !text-[var(--ink-45)] leading-relaxed">
      {m ? (
        <>
          {m[1]}
          <Link href={`/${locale}/terms`} className="underline decoration-[var(--ink-16)] underline-offset-4 hover:decoration-current hover:text-[var(--ink)]" target="_blank">{m[2]}</Link>
          {m[3]}
        </>
      ) : s}
    </p>
  );
}
