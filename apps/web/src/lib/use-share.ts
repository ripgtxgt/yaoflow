"use client";

import { useEffect, useState } from "react";
import { track } from "./track";
import type { EventName } from "./analytics-server";
import type { ShareChannel, ShareSurface } from "./share-meta";
import { ssh } from "./dict/share-sheet";

/**
 * 10-22 进度表 76 (分享 13 合 1) — the one way anything on the site is shared. Every share button and the full share sheet
 * run this hook: the phone's share sheet (with the 9:16 picture when the browser allows), LINE, Threads, an IG story
 * (the picture to the sheet, else saved), save, copy — each tap one event. The default event is `share_click` with
 * `method` = the channel and `sf` = the surface (the weekly report's share table); a caller that always counted its
 * shares under another name (seal_sent, proof_share, the referral panel's `gift`) keeps that name through `event` and
 * `methods`, so the old numbers still add up.
 */
export interface ShareInput {
  locale: string;
  surface: ShareSurface;
  url: string;
  text: string;
  /** the 9:16 card (same origin); without it only the link travels */
  image?: string | null;
  fileName?: string;
  /** the event the taps are counted under (default share_click with sf = surface) */
  event?: EventName;
  /** per-channel method names when they must stay as they were (default: the channel itself) */
  methods?: Partial<Record<ShareChannel, string>>;
  onShared?: (ch: ShareChannel) => void;
}

export function useShare(i: ShareInput) {
  const [canNative, setCanNative] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  useEffect(() => { setCanNative(typeof navigator !== "undefined" && typeof navigator.share === "function"); }, []);

  /** the message as it travels: text + link, or the text alone when the link is already inside it (url "") */
  const message = i.url ? `${i.text} ${i.url}` : i.text;
  const done = (ch: ShareChannel) => {
    const method = i.methods?.[ch] ?? ch;
    if (i.event && i.event !== "share_click") track(i.event, { locale: i.locale, method });
    else track("share_click", { locale: i.locale, method, sf: i.surface });
    i.onShared?.(ch);
  };
  const imageFile = async (): Promise<File | null> => {
    if (!i.image) return null;
    try {
      const r = await fetch(i.image);
      if (!r.ok) return null;
      const b = await r.blob();
      return new File([b], i.fileName ?? "yaoflow.png", { type: b.type || "image/png" });
    } catch { return null; }
  };
  const save = () => {
    if (!i.image) return;
    const a = document.createElement("a");
    a.href = i.image; a.download = i.fileName ?? "yaoflow.png"; a.rel = "noopener";
    document.body.appendChild(a); a.click(); a.remove();
  };
  const flashCopied = () => { setCopied(true); setNote(ssh(i.locale, "copied")); setTimeout(() => { setCopied(false); setNote(null); }, 2000); };
  /** the phone's sheet; false when it was closed or is not there */
  const native = async (): Promise<boolean> => {
    if (typeof navigator === "undefined" || typeof navigator.share !== "function") return false;
    try {
      const f = await imageFile();
      if (f && navigator.canShare?.({ files: [f] })) await navigator.share({ files: [f], text: message });
      else if (i.url) await navigator.share({ title: "YaoFlow", text: i.text, url: i.url });
      else await navigator.share({ text: i.text });
      done("native");
      return true;
    } catch { return false; }
  };
  const copy = async () => {
    try { await navigator.clipboard.writeText(message); } catch { /* blocked: the field, when there is one, still works */ }
    done("copy"); flashCopied();
  };
  /** the one-tap button: the sheet where there is one, otherwise the picture to the sheet, otherwise copy */
  const shareOrCopy = async () => {
    if (canNative) { if (await native()) return; return; }
    if (i.image) { await ig(); return; }
    await copy();
  };
  const ig = async () => {
    // there is no web link into an IG story: hand the picture to the share sheet (IG is in it), else save it
    const f = await imageFile();
    try {
      if (f && navigator.canShare?.({ files: [f] })) { await navigator.share({ files: [f] }); done("ig"); return; }
    } catch { return; }
    save(); done("ig"); setNote(ssh(i.locale, "saved"));
  };
  const download = () => { save(); done("download"); };
  const line = () => { done("line"); window.open(`https://line.me/R/share?text=${encodeURIComponent(i.url ? `${i.text}\n${i.url}` : i.text)}`, "_blank", "noopener"); };
  const threads = () => { done("threads"); window.open(`https://www.threads.net/intent/post?text=${encodeURIComponent(message)}`, "_blank", "noopener"); };

  return { canNative, note, copied, native, copy, shareOrCopy, ig, download, line, threads, setNote };
}
