"use client";

import { useEffect } from "react";
import { track } from "@/lib/track";
import type { EventName } from "@/lib/analytics-server";

/** 10-17: one event when a server-rendered product page is seen (e.g. 黃曆 view) — nothing about the reader */
export default function TrackOnce({ event, locale, method }: { event: EventName; locale: string; method: string }) {
  useEffect(() => { track(event, { locale, method }); }, [event, locale, method]);
  return null;
}
