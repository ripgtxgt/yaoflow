import { qianOrdinal, QIAN_SET_NAME } from "@/lib/qian-meta";

/**
 * 10-12 解籤 (进度表 §四 36 ④): the lot as it is printed — paper, ink, a thin cinnabar frame, the four lines read top
 * to bottom, right to left (vertical-rl: in that writing mode a flex column runs right to left). Server-rendered; the
 * PNG of the same card is /api/qian/card/<n>.
 */
export default function QianCard({ num, ganzhi, poem, title, setName = QIAN_SET_NAME }: { num: number; /** the 干支, or a 黃大仙 lot's 籤題 */ ganzhi: string; poem: string[]; title?: string; setName?: string }) {
  return (
    <figure className="mx-auto w-fit">
      <div className="border border-[var(--cinnabar)] rounded-[2px] p-[5px] bg-[var(--paper)]">
        <div className="border border-[var(--ink-16)] px-7 py-7 flex flex-col gap-5 items-start" style={{ writingMode: "vertical-rl" }} aria-label={`${setName}第${num}籤 ${ganzhi}：${poem.join("，")}`}>
          <p className="t-label !text-[var(--cinnabar)] tracking-[0.25em]">{setName}　第{qianOrdinal(num)}籤{ganzhi ? `　${ganzhi}` : ""}</p>
          {poem.map((line, i) => (
            <p key={i} className="text-[22px] md:text-[26px] leading-[1.5] tracking-[0.3em] text-[var(--ink)]">{line}</p>
          ))}
        </div>
      </div>
      {title ? <figcaption className="t-small text-center mt-3 !text-[var(--ink-66)]">{title}</figcaption> : null}
    </figure>
  );
}
