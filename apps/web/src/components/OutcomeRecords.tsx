import Link from "next/link";
import { hexagramByNumber } from "@yaoflow/engine";
import { t, type Locale } from "@/lib/i18n";
import { hexName } from "@/lib/names";
import { LOCALE_META } from "@/lib/locales";
import { casePath } from "@/lib/cases";
import { TOPIC_NAMES, type Topic } from "@/lib/topic";
import { orT } from "@/lib/dict/outcome-records";
import type { OutcomeRecord } from "@/lib/outcome-records";

const INTL: Record<Locale, string> = { zh: "zh-CN", "zh-hant": "zh-TW", en: "en-US", ja: "ja-JP", ko: "ko-KR", fr: "fr-FR", de: "de-DE", es: "es-ES", pt: "pt-BR" };
const day = (ms: number, l: Locale) => new Date(ms).toLocaleDateString(INTL[l], { year: "numeric", month: "short", day: "numeric" });

/**
 * 匿名「應驗紀錄」(进度表 28). The pages call it only with records from recordsForPage(), which is empty while
 * SHOW_OUTCOME_RECORDS is off — and an empty list renders nothing at all, not a hidden block.
 */
/** 10-14 进度表 45: every answer has its own words */
export function stateLabel(st: OutcomeRecord["state"], l: Locale): string {
  return st === "hit" ? t(l, "caseOutcomeHit") : st === "miss" ? t(l, "caseOutcomeMiss") : st === "partial" ? orT(l, "stPartial") : st === "open" ? orT(l, "stOpen") : st === "unclear" ? orT(l, "stUnclear") : "";
}

export default function OutcomeRecords({ records, l, title }: { records: OutcomeRecord[]; l: Locale; title: string }) {
  if (records.length === 0) return null;
  return (
    <section className="mt-[var(--s-6)]" data-heat="outcome-records">
      <h2 className="t-sect mb-[var(--s-2)]">{title}</h2>
      <p className="t-small !text-[var(--ink-45)] mb-[var(--s-3)]">{orT(l, "lead")}</p>
      <ul className="flex flex-col">
        {records.map((r) => {
          const p = hexagramByNumber(r.primary);
          const ch = r.changed ? hexagramByNumber(r.changed) : null;
          const topic = TOPIC_NAMES[(r.topic && r.topic in TOPIC_NAMES ? r.topic : "other") as Topic][l];
          const quote = l === "zh" || l === "zh-hant" || l === "ja" ? ["「", "」"] : ["“", "”"];
          return (
            <li key={r.publicId} className="py-[var(--s-3)] border-t border-dotted border-[var(--ink-16)] first:border-t-0">
              <p className="t-label !text-[var(--ink-45)]">{hexName(p, l)}{ch ? ` → ${hexName(ch, l)}` : ""}<span className="mx-2">·</span>{topic}</p>
              {r.framing && <p className="t-body mt-1">{quote[0]}{r.framing}{quote[1]}</p>}
              {r.window && <p className="t-small mt-1 !text-[var(--ink-66)]">{t(l, "caseWindow")}{LOCALE_META[l].cjk ? "：" : ": "}{r.window}</p>}
              <p className="t-small mt-1 flex flex-wrap items-baseline gap-x-3">
                <span className={r.state === "hit" ? "!text-[var(--cinnabar)]" : r.state === "partial" ? "!text-[var(--gold-text)]" : "!text-[var(--ink)]"}>{stateLabel(r.state, l)}</span>
                {r.reportedAt ? <span className="!text-[var(--ink-45)] tabular-nums">{orT(l, "reported", { date: day(r.reportedAt, l) })}</span> : null}
                <Link href={casePath(l, r.publicId)} className="underline underline-offset-4 !text-[var(--ink-66)] hover:text-[var(--ink)]">{orT(l, "open")} →</Link>
              </p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
