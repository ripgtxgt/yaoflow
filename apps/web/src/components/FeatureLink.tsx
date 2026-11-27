"use client";

import { useEffect, useState } from "react";
import { track } from "@/lib/track";
import type { EventName } from "@/lib/analytics-server";

/**
 * 10-17 承接: a small entry to a product behind a switch (lib/features.ts), on a page that stays static — it asks
 * /api/features/visible once and renders nothing until the switch is open for this browser.
 */
export default function FeatureLink({ name, href, text, from, locale, className = "" }: { name: string; href: string; text: string; from: string; locale: string; className?: string }) {
  const [on, setOn] = useState(false);
  useEffect(() => {
    fetch(`/api/features/visible?n=${encodeURIComponent(name)}`).then((r) => r.json()).then((j: Record<string, boolean>) => setOn(!!j[name])).catch(() => {});
  }, [name]);
  if (!on) return null;
  return (
    <p className={`t-small ${className}`}>
      <a href={href} data-heat={`${from}-to-${name}`} onClick={() => track(name as EventName, { locale, method: `from_${from}` })}
        className="underline underline-offset-4 !text-[var(--ink-66)] hover:!text-[var(--ink)]">{text}</a>
    </p>
  );
}
