"use client";

import { track } from "@/lib/track";
import type { EventName } from "@/lib/analytics-server";

/** 10-18: a plain link that records one event when tapped (e.g. 擇日／運勢 → 起卦 as method "to_cast") */
export default function TrackLink({ href, event, locale, method, className, children }: { href: string; event: EventName; locale: string; method: string; className?: string; children: React.ReactNode }) {
  return <a href={href} className={className} onClick={() => track(event, { locale, method })}>{children}</a>;
}
