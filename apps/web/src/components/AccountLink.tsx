"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { FLAG_COOKIE_NAME } from "@/lib/auth-flag";
import { t } from "@/lib/i18n";
import type { Locale } from "@/lib/locales";

/**
 * "Sign in" in the masthead for a visitor, decided from the readable flag cookie after mount — the layout stays static
 * and never reads the session. 10-23 (Neil: 「為什麼在登錄後，右上角還有我的卦呢？這個要做到頁面統一」): signed in, it
 * shows nothing — the way in is the site nav's 「我的」 (header on a desktop, bottom tab bar on a phone), one name
 * everywhere; the effects below (time zone, kept tokens) still run.
 */
export default function AccountLink({ locale }: { locale: Locale }) {
  const [signedIn, setSignedIn] = useState(false);
  const [keep, setKeep] = useState("");
  const pathname = usePathname();
  // 10-02 付款后自动登录: a sign-in (or sign-out) that happens on the page itself says so with this event
  useEffect(() => {
    const recheck = () => setSignedIn(document.cookie.split(";").some((c) => c.trim().startsWith(`${FLAG_COOKIE_NAME}=1`)));
    window.addEventListener("yf:auth", recheck);
    return () => window.removeEventListener("yf:auth", recheck);
  }, []);
  useEffect(() => {
    const inNow = document.cookie.split(";").some((c) => c.trim().startsWith(`${FLAG_COOKIE_NAME}=1`));
    setSignedIn(inNow);
    // 09-26 客户时区: a signed-in device reports its IANA zone at most once a day (or when it changes — travel)
    if (inNow) {
      try {
        const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
        const mark = `${new Date().toISOString().slice(0, 10)}|${tz}`;
        if (tz && localStorage.getItem("yf_tzb") !== mark) {
          fetch(`/api/me?tz=${encodeURIComponent(tz)}`, { cache: "no-store" }).then(() => { try { localStorage.setItem("yf_tzb", mark); } catch { /* private mode */ } }).catch(() => undefined);
        }
      } catch { /* storage or Intl unavailable: skip */ }
    }
    // 09-24: a friend's gift (or a reward / aftermath / joint link) must survive signing in — only the tokens,
    // never the question, which would otherwise ride in the stored login link
    const from = new URLSearchParams(location.search);
    const kept = new URLSearchParams();
    for (const k of ["gift", "reward", "after", "pair"]) { const v = from.get(k); if (v && /^[0-9a-f]{36}$/.test(v)) kept.set(k, v); }
    setKeep(kept.toString());
  }, [pathname]);
  // signing in from the cast page brings you back to the cast page (the figure waits there), not to an empty archive
  const onCast = pathname === `/${locale}/cast`;
  if (signedIn) return null;
  const href = onCast ? `/${locale}/login?next=${encodeURIComponent(keep ? `${pathname}?${keep}` : pathname)}` : `/${locale}/login`;
  return (
    <Link
      href={href}
      className="t-label hover:text-[var(--ink)] transition-colors whitespace-nowrap"
    >
      {t(locale, "navLogin")}
    </Link>
  );
}
