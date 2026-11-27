"use client";

import { useEffect, useState } from "react";
import { t, type DictKey, type Locale } from "@/lib/i18n";

/**
 * Shown while a reading is being written — typically 20–60s.
 *
 * The stages are the real pipeline, in order, so the wait doubles as the
 * clearest statement of how the product works: the chart is already fixed,
 * and the model is only reading it back. A spinner would waste that.
 */
const STAGES: DictKey[] = ["workChart", "workTexts", "workWeigh", "workWrite", "workPlain"];

/** what the server is actually checking before it writes: a card payment, a member's allowance, or a gift token */
export type Verify = "payment" | "member" | "pass" | "reward";
// 10-24 (Neil: 「会员是会员，通卡是通卡」): a 通卡 holder's first step is the pass, not 「確認會員權益」
const VERIFY_KEY: Record<Verify, DictKey> = { payment: "workVerify", member: "workVerifyMember", pass: "workVerifyPass", reward: "workVerifyReward" };

export default function WorkingPanel(
  { locale, verify }: { locale: Locale; verify?: Verify },
) {
  const [stage, setStage] = useState(0);
  const [secs, setSecs] = useState(0);
  const withPayment = Boolean(verify);
  const stages: DictKey[] = verify ? [VERIFY_KEY[verify], ...STAGES] : STAGES;

  useEffect(() => {
    // stages advance on a schedule; the last one holds until the reply lands
    const marks = withPayment
      ? [2500, 8000, 15000, 24000, 36000]
      : [5000, 12000, 21000, 33000];
    const timers = marks.map((ms, i) => setTimeout(() => setStage(i + 1), ms));
    const tick = setInterval(() => setSecs((s) => s + 1), 1000);
    return () => {
      timers.forEach(clearTimeout);
      clearInterval(tick);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="mt-[var(--s-4)] panel px-[var(--s-4)] py-[var(--s-5)]" aria-live="polite">
      <div className="flex items-baseline justify-between gap-4 mb-[var(--s-4)]">
        <p className="t-sect">{t(locale, "workTitle")}</p>
        <p className="t-label tabular-nums shrink-0">{secs}s</p>
      </div>

      <ul className="flex flex-col gap-[var(--s-2)]">
        {stages.map((k, i) => {
          const done = i < stage;
          const now = i === stage;
          return (
            <li key={k} className="flex items-baseline gap-3">
              {/* a yao line as the progress mark: solid once done, broken while
                  in progress, faint before it starts */}
              <span className={`w-6 shrink-0 ${done ? "text-[var(--cinnabar)]" : now ? "text-[var(--ink)]" : "text-[var(--ink-16)]"}`}>
                {done ? (
                  <span className="yao" />
                ) : now ? (
                  <span className="yao-yin work-pulse"><span /><span /><span /></span>
                ) : (
                  <span className="yao opacity-40" />
                )}
              </span>
              <span
                className={`t-small transition-colors ${
                  now ? "!text-[var(--ink)]" : done ? "!text-[var(--ink-66)]" : "!text-[var(--ink-45)]"
                }`}
              >
                {t(locale, k)}
              </span>
            </li>
          );
        })}
      </ul>

      <p className="t-label mt-[var(--s-4)] !normal-case !tracking-[0.04em]">{t(locale, "workNote")}</p>
    </div>
  );
}
