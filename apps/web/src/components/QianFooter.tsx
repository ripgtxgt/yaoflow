import { CONTACT_EMAIL } from "@/lib/trust";

/** 10-12 解籤 (进度表 §四 36 ④): the line under every lot page — whose text this is and where to send a correction. */
export default function QianFooter({ source }: { source?: string }) {
  return (
    <p className="t-small mt-[var(--s-6)] pt-[var(--s-4)] border-t border-[var(--ink-16)] !text-[var(--ink-45)] leading-relaxed">
      本站非宮廟代表；籤詩照廟方流傳的原文，白話與感情、工作的解說是本站自己寫的。
      <a href={`mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent("解籤勘誤")}`} className="underline underline-offset-4">出處與勘誤</a>
      {source ? <span className="block mt-1">{source}</span> : null}
    </p>
  );
}
