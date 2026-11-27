"use client";

import ShareSheet from "@/components/ShareSheet";
import type { ShareSurface } from "@/lib/share-meta";

/**
 * 10-12 解籤 (进度表 §四 36 ④): share the lot — the lot's own page and its card, never the reader's question.
 * 10-13 进度表 41 ②: the 9:16 card leads (`image` is the square card; ?f=story makes it the story size), every channel is
 * counted with its surface, and the link already carries c=qian-share (qianShareUrl).
 */
export default function QianShare({ num, title, url, image, setName = "六十甲子籤", surface = "lot", primary = "native" }: {
  num: number; title: string; url: string; image: string; setName?: string; surface?: ShareSurface; primary?: "native" | "line";
}) {
  const story = `${image}${image.includes("?") ? "&" : "?"}f=story`;
  return (
    <div className="mt-[var(--s-4)]">
      <ShareSheet locale="zh-hant" surface={surface} url={url} text={`${setName}第 ${num} 籤：${title}`} image={story} fileName={`qian-${num}.png`} primary={primary} />
    </div>
  );
}
