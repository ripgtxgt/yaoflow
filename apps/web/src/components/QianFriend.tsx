"use client";

import { useEffect, useState } from "react";
import ShareSheet from "@/components/ShareSheet";
import { JIEQIAN_PATH } from "@/lib/qian-meta";
import { SHARE_TAGS, type ShareSurface } from "@/lib/share-meta";
import { ssh } from "@/lib/dict/share-sheet";

/** 10-13 进度表 41 ④: 「朋友也抽到籤？傳給他」 — the entry with no number filled in, tagged qian-friend. */
export default function QianFriend({ surface }: { surface: ShareSurface }) {
  const [origin, setOrigin] = useState("https://yaoflow.com");
  useEffect(() => setOrigin(window.location.origin), []);
  return (
    <div className="mt-[var(--s-5)] pt-[var(--s-4)] border-t border-dotted border-[var(--ink-16)]">
      <p className="t-body !text-[15px]">{ssh("zh-hant", "friendAsk")}</p>
      <p className="t-small !text-[var(--ink-66)] mb-2">{ssh("zh-hant", "friendBody")}</p>
      <ShareSheet locale="zh-hant" surface={surface} url={`${origin}${JIEQIAN_PATH}?c=${SHARE_TAGS.friend}`} text={ssh("zh-hant", "friendText")} primary="line" compact />
    </div>
  );
}
