"use client";

import { useEffect } from "react";
import { FIRST_DEEP_COOKIE } from "@/lib/money";

/**
 * Rendered on a reading page that was paid for as a deep reading: marks this
 * browser as having used the first-time price, so the next one is full price
 * even when nobody signs in. (Accounts are checked against their orders
 * instead; this cookie is only the anonymous fallback.)
 */
export default function FirstDeepMark() {
  useEffect(() => {
    const secure = location.protocol === "https:" ? "; Secure" : "";
    document.cookie = `${FIRST_DEEP_COOKIE}=1; Path=/; Max-Age=31536000; SameSite=Lax${secure}`;
  }, []);
  return null;
}
