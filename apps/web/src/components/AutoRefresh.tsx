"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { startAutoRefresh } from "@/lib/auto-refresh";

/**
 * 10-17: while something is still being written on the server, refresh the page quietly every few seconds (bounded).
 * 11-04: skips while the page is hidden and catches up on return (see lib/auto-refresh.ts) — a refresh sent from a
 * backgrounded iPhone tab failed with "Load failed" and dropped a reader who had just paid onto the error page.
 */
export default function AutoRefresh({ every = 6000, max = 30 }: { every?: number; max?: number }) {
  const router = useRouter();
  useEffect(
    () => startAutoRefresh(() => router.refresh(), { every, max, doc: typeof document === "undefined" ? undefined : document }),
    [router, every, max],
  );
  return null;
}
