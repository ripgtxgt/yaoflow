"use client";

import { usePathname, useSearchParams } from "next/navigation";
import WorkingPanel, { type Verify } from "@/components/WorkingPanel";
import { asLocale } from "@/lib/locales";
import { t } from "@/lib/i18n";

/**
 * Streams immediately while the server verifies the session and writes the
 * reading. Without this, the moment right after paying — the most anxious
 * point in the whole flow — was a blank browser tab for up to a minute.
 * The first stage names what is really being checked: a payment for a
 * checkout session, the allowance for a member (sub_), the gift for a
 * referral reward (rw_) — a member never paid on this page.
 */
export default function ReadingLoading() {
  const path = usePathname();
  const params = useSearchParams();
  const sid = params?.get("sid") ?? "";
  const locale = asLocale(path?.split("/")[1]);
  // Only the first arrival (fresh=1 on the delivery link) is a reading being
  // written. Everything else — the account page, the email link, a refresh —
  // is a reading that already exists, and saying "verifying payment" there
  // would be a lie.
  const fresh = params?.get("fresh") === "1";
  if (!fresh) {
    return (
      <div className="mx-auto w-full max-w-[46rem] px-[var(--s-4)] md:px-8 pt-10 pb-20">
        <div className="panel px-[var(--s-4)] py-[var(--s-5)]" aria-live="polite">
          <p className="t-sect">{t(locale, "workOpening")}</p>
        </div>
      </div>
    );
  }
  // 10-24: `via=pass` (set by the redeem routes) — a 通卡 holder is not told 「確認會員權益」
  const verify: Verify = sid.startsWith("sub_") ? (params?.get("via") === "pass" ? "pass" : "member") : sid.startsWith("rw_") || sid.startsWith("gf_") ? "reward" : "payment";
  return (
    <div className="mx-auto w-full max-w-[46rem] px-[var(--s-4)] md:px-8 pt-10 pb-20">
      <WorkingPanel locale={locale} verify={verify} />
    </div>
  );
}
