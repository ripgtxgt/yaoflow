"use client";

import { useEffect, useState } from "react";
import { CURRENCY_COOKIE, DEFAULT_CURRENCY, detectCurrencyWithSource, isCurrency, type Currency, type CurrencySource } from "./money";

const EVENT = "yf:currency";

function cookie(name: string): string | null {
  const m = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return m ? decodeURIComponent(m[1]!) : null;
}

/** The device's own time zone name — the one signal a proxy cannot rewrite. */
export function deviceTimeZone(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone ?? null;
  } catch {
    return null;
  }
}

/**
 * The currency prices are shown in. Starts from what the server could tell
 * (a preference cookie, the language region, the edge country) so the first
 * paint is usually right, then refines with the device clock after mount.
 * Choosing by hand is remembered for a year and broadcast to every price on
 * the page.
 */
export function useCurrency(initial?: Currency, edgeCountry?: string | null): [Currency, (c: Currency) => void, CurrencySource] {
  const [current, setCurrent] = useState<Currency>(initial ?? DEFAULT_CURRENCY);
  // which signal settled it — travels with the claim so the dashboard can say why (09-18)
  const [source, setSource] = useState<CurrencySource>("default");

  useEffect(() => {
    const d = detectCurrencyWithSource({
      chosen: cookie(CURRENCY_COOKIE),
      timeZone: deviceTimeZone(),
      language: navigator.language,
      edgeCountry: edgeCountry ?? null,
      // 09-23: a Hong Kong Windows PC reports Asia/Shanghai; the page language tells them apart
      uiLocale: document.documentElement.lang || null,
    });
    setCurrent(d.currency);
    setSource(d.source);
    const onChange = (e: Event) => {
      const c = (e as CustomEvent<Currency>).detail;
      if (isCurrency(c)) { setCurrent(c); setSource("chosen"); }
    };
    window.addEventListener(EVENT, onChange);
    return () => window.removeEventListener(EVENT, onChange);
  }, [edgeCountry]);

  const choose = (c: Currency) => {
    if (!isCurrency(c)) return;
    const secure = location.protocol === "https:" ? "; Secure" : "";
    document.cookie = `${CURRENCY_COOKIE}=${c}; Path=/; Max-Age=31536000; SameSite=Lax${secure}`;
    setCurrent(c);
    setSource("chosen");
    window.dispatchEvent(new CustomEvent(EVENT, { detail: c }));
  };

  return [current, choose, source];
}
