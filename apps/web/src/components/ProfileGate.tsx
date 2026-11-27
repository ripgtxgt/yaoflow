"use client";

import { useEffect, useState, type ReactNode } from "react";
import { loadProfiles } from "@/lib/mingli/birth/profiles";

/**
 * 10-22 进度表 86 承接地圖: a 命盤 card is shown only to a reader who already has a birth profile — on the account
 * (`server`, known at render) or on this device (localStorage, known after the page wakes). Nothing flashes in later
 * for a reader without one.
 */
export default function ProfileGate({ server, children }: { server: boolean; children: ReactNode }) {
  const [ok, setOk] = useState(server);
  useEffect(() => { if (!server) { try { setOk(loadProfiles().length > 0); } catch { setOk(false); } } }, [server]);
  return ok ? <>{children}</> : null;
}
