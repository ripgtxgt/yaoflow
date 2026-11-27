"use client";

import { useEffect, useState } from "react";
import { fill, tongkaT, type TongkaDays } from "@/lib/tongka";

/**
 * 10-22 通卡: back from Stripe on any page with ?pass=cs_… — records the pass (POST /api/pass/sync), signs the paying
 * browser in when the address is new, shows one line, drops the parameter and reloads so the page sees the entitlement.
 * An address that already has an account is told to sign in by email instead.
 */
export default function PassReturn({ locale }: { locale: string }) {
  const [line, setLine] = useState<string | null>(null);
  useEffect(() => {
    const u = new URL(window.location.href);
    const sid = u.searchParams.get("pass");
    if (!sid || !/^cs_[A-Za-z0-9_]+$/.test(sid)) return;
    const t = tongkaT(locale);
    void fetch("/api/pass/sync", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ session: sid }) })
      .then((r) => r.json())
      .then((j: { ok?: boolean; signedIn?: boolean; reason?: string; pass?: { days: TongkaDays; endsAt: number | null; scheduled?: boolean } }) => {
        u.searchParams.delete("pass");
        window.history.replaceState(null, "", u.toString());
        if (!j.ok || !j.pass) return;
        const date = j.pass.endsAt ? new Date(j.pass.endsAt).toLocaleDateString(locale === "zh" ? "zh-CN" : locale === "zh-hant" ? "zh-TW" : locale, { month: "numeric", day: "numeric" }) : "";
        if (j.signedIn) {
          setLine(fill(t.active, { name: t.name[j.pass.days], date }));
          setTimeout(() => window.location.reload(), 1200);
        } else {
          setLine(`${fill(t.active, { name: t.name[j.pass.days], date })} — ${t.loginToUse}`);
        }
      })
      .catch(() => {});
  }, [locale]);
  if (!line) return null;
  return <p className="t-small mb-[var(--s-3)] p-[var(--s-3)] border border-[var(--gold)] rounded-[2px]" data-heat="pass-return">{line}</p>;
}
