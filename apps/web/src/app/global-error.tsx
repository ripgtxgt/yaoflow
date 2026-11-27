"use client";

import { useEffect } from "react";

/**
 * 10-02: the last net — an error in a root layout itself (no dictionary, no stylesheet to lean on). Three languages
 * at once, a reload button, and one automatic reload when the cause was a script missing after a deploy.
 * The ordinary case is [locale]/error.tsx.
 */
const NET = /^(?:TypeError: )?(?:Load failed|Failed to fetch|NetworkError when attempting to fetch resource\.?|network error|Connection closed\.?)$/i;
const CHUNK = /ChunkLoadError|Loading (?:CSS )?chunk|Importing a module script failed|Failed to fetch dynamically imported module|error loading dynamically imported module/i;

export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    const message = String(error?.message ?? "").replace(/\s+/g, " ");
    try {
      // 10-29: the root layout failed before lib/track made the tab's id — make it here (as lib/err-capture.ts does), so
      // the report joins the tab's own trail instead of a shared "nosession"
      let sid = sessionStorage.getItem("yaoflow:sid");
      if (!sid) { sid = Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4); sessionStorage.setItem("yaoflow:sid", sid); }
      void fetch("/api/track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        keepalive: true,
        body: JSON.stringify({ e: "client_error", s: sid, path: location.pathname.slice(0, 80), method: `global:${message}`.slice(0, 24), msg: `${error?.name ?? "Error"}: ${message}${error?.digest ? ` #${error.digest}` : ""}`.slice(0, 160) }),
      }).catch(() => {});
    } catch { /* ignore */ }
    // 11-08: the same one reload when the page broke on the network — a navigation's fetch that failed (Safari 「Load failed」,
    // Chrome 「Failed to fetch」) left the reader on this screen; the page itself loads fine a moment later
    if (CHUNK.test(message) || NET.test(message)) {
      try {
        if (!sessionStorage.getItem("yf_chunk_reload")) { sessionStorage.setItem("yf_chunk_reload", "1"); window.location.reload(); }
      } catch { /* ignore */ }
    }
  }, [error]);

  return (
    <html lang="zh-Hant">
      <body style={{ margin: 0, background: "#f4f2ec", color: "#14151c", fontFamily: "-apple-system, BlinkMacSystemFont, 'PingFang TC', 'Noto Sans TC', 'Segoe UI', sans-serif" }}>
        <div style={{ maxWidth: 520, margin: "0 auto", padding: "96px 24px", textAlign: "center", lineHeight: 1.8 }}>
          <p style={{ fontSize: 18, margin: 0 }}>這一頁沒能打開 · 这一页没能打开</p>
          <p style={{ fontSize: 15, margin: "4px 0 0", opacity: 0.66 }}>This page didn&apos;t load.</p>
          <button type="button" onClick={() => window.location.reload()} style={{ marginTop: 32, minHeight: 48, padding: "12px 24px", border: 0, borderRadius: 2, background: "#14151c", color: "#f4f2ec", fontSize: 14, letterSpacing: "0.14em" }}>
            重新載入 · Reload
          </button>
          <p style={{ fontSize: 13, marginTop: 32, opacity: 0.55 }}>
            如果一直這樣，請用 Safari 或 Chrome 打開 yaoflow.com。<br />If it keeps happening, open yaoflow.com in Safari or Chrome.
          </p>
        </div>
      </body>
    </html>
  );
}
