"use client";

import type { ReactNode } from "react";
import EmailField from "@/components/EmailField";
import { t, type Locale } from "@/lib/i18n";
import { cv } from "@/lib/dict/convert";
import type { SaveState } from "@/lib/cast-ui/words";

/**
 * 10-22 进度表 76 (CastFlow 拆分): the "send this to me" box's insides — the matter kept on the 3rd/4th cast
 * (10-12 B②) and the cast saved for later (10-02 y1) both render it: a line or two of why, the address, the error in
 * words, one button. The caller draws the frame and makes the server call; this only draws the state it is given.
 */
export default function SaveBox({ locale, title, body, note, value, onChange, state, go, goLabel, goHeat, required, tracking = "0.16em" }: {
  locale: Locale;
  title?: string;
  body: ReactNode;
  /** a line under the button (why we keep it) */
  note?: string;
  value: string;
  onChange: (v: string) => void;
  state: SaveState;
  go: () => void;
  goLabel: string;
  goHeat?: string;
  required?: boolean;
  tracking?: "0.12em" | "0.16em";
}) {
  return (
    <>
      {title && <p className="t-body !text-[15px]">{title}</p>}
      <p className={`t-small !text-[var(--ink-66)] ${title ? "mt-1" : ""}`}>{body}</p>
      <div className="mt-[var(--s-3)]">
        <EmailField locale={locale} required={required} value={value} placeholder={t(locale, "loginEmailPlaceholder")}
          onChange={onChange} onEnter={go} />
      </div>
      {state && state !== "busy" && state !== "done" && (
        <p className="t-small mt-1 !text-[var(--cinnabar)]">
          {state === "bad" ? t(locale, "emailBad") : state === "domain" ? t(locale, "emailNoDomain") : state === "many" ? cv(locale, "svMany") : cv(locale, "svErr")}
        </p>
      )}
      <button type="button" data-heat={goHeat} onClick={go} disabled={state === "busy"}
        className={`mt-[var(--s-3)] min-h-[var(--s-6)] px-6 py-3 rounded-[2px] border border-[var(--ink)] text-[13px] ${tracking === "0.12em" ? "tracking-[0.12em]" : "tracking-[0.16em]"} disabled:opacity-50`}>
        {goLabel}
      </button>
      {note && <p className="t-small mt-2 !text-[var(--ink-45)]">{note}</p>}
    </>
  );
}
