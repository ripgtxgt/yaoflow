"use client";

import { useEffect, useState } from "react";
import { deleteProfile, loadProfiles, setCurrent, syncProfiles, type Profile, type Who } from "@/lib/mingli/birth/profiles";
import { tabT } from "@/lib/dict/account-tabs";
import { track } from "@/lib/track";

/**
 * 10-22 进度表 76 ⑤ 生辰檔案 — the account page's third tab: every birth this reader saved (the account's list, merged
 * with this browser's), one tap to delete one or all, and the three chart pages opened on any of them with nothing
 * typed. The birth itself is shown as a date line only; nothing here goes into a URL.
 */
const WHO_KEYS: Who[] = ["self", "partner", "family", "friend", "other"];
const WHO_T: Record<string, string[]> = {
  zh: ["自己", "伴侣", "家人", "朋友", "其他"], "zh-hant": ["自己", "伴侶", "家人", "朋友", "其他"], en: ["me", "partner", "family", "friend", "other"],
  ja: ["自分", "パートナー", "家族", "友人", "その他"], ko: ["나", "파트너", "가족", "친구", "기타"], fr: ["moi", "partenaire", "famille", "ami", "autre"],
  de: ["ich", "Partner", "Familie", "Freund", "andere"], es: ["yo", "pareja", "familia", "amistad", "otro"], pt: ["eu", "parceiro", "família", "amigo", "outro"],
};
const pad = (n: number) => String(n).padStart(2, "0");

function birthLine(p: Profile, locale: string, noTime: string): string {
  const i = p.input;
  const cal = i.calendar === "lunar" ? (locale === "zh" ? "农历 " : locale === "zh-hant" ? "農曆 " : "lunar ") : locale === "zh" ? "国历 " : locale === "zh-hant" ? "國曆 " : "";
  const date = `${i.y}-${pad(i.m)}-${pad(i.d)}${i.leap ? (locale.startsWith("zh") ? "（閏）" : " (leap)") : ""}`;
  const time = i.timeMode === "exact" && i.h !== undefined ? ` ${pad(i.h)}:${pad(i.mi ?? 0)}` : i.timeMode === "branch" && i.branch !== undefined ? ` ${["子", "丑", "寅", "卯", "辰", "巳", "午", "未", "申", "酉", "戌", "亥", "子"][i.branch] ?? ""}` : ` ${noTime}`;
  const place = i.place?.name ?? "";
  return `${cal}${date}${time}${place ? ` · ${place}` : ""}`;
}

export default function ProfilesPanel({ locale }: { locale: string }) {
  const T = tabT(locale);
  const [list, setList] = useState<Profile[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => {
    setList(loadProfiles());
    void syncProfiles().then((m) => setList(m ?? loadProfiles()));
  }, []);
  const who = (w: Who) => (WHO_T[locale] ?? WHO_T.en!)[WHO_KEYS.indexOf(w)] ?? w;
  const open = (p: Profile, page: "bazi" | "ziwei" | "xingpan") => {
    setCurrent(p.id);
    track(page === "xingpan" ? "astro" : page, { locale, method: "profile_open" }); // counted under the chart it opens
    window.location.assign(`/${locale}/${page}/chart`);
  };
  const del = (id: string) => {
    setBusy(id);
    deleteProfile(id);
    setList(loadProfiles());
    setBusy(null);
  };
  const delAll = async () => {
    setBusy("all");
    for (const p of loadProfiles()) deleteProfile(p.id);
    try { await fetch("/api/profiles?all=1", { method: "DELETE" }); } catch { /* the one-by-one deletes above already went */ }
    setList([]);
    setBusy(null);
  };
  return (
    <section id="profiles" className="mt-[var(--s-5)] scroll-mt-20" data-heat="acct-profiles">
      <p className="t-small !text-[var(--ink-66)]">{T.profilesLead}</p>
      {list === null ? (
        <p className="t-small mt-[var(--s-4)] !text-[var(--ink-45)]">…</p>
      ) : list.length === 0 ? (
        <p className="t-body mt-[var(--s-4)]">{T.profilesEmpty}</p>
      ) : (
        <ul className="mt-[var(--s-4)] divide-y divide-[var(--ink-16)] border-y border-[var(--ink-16)]">
          {list.map((p) => (
            <li key={p.id} className="py-[var(--s-3)] flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="t-body !text-[15px]">{p.name}<span className="t-small ml-2 !text-[var(--ink-45)]">{who(p.who)}{p.gender ? ` · ${p.gender === "male" ? (locale.startsWith("zh") ? "男" : "M") : locale.startsWith("zh") ? "女" : "F"}` : ""}</span></p>
                <p className="t-small !text-[var(--ink-66)] tabular-nums">{birthLine(p, locale, T.profilesNoTime)}</p>
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 shrink-0">
                <span className="t-label !text-[var(--ink-45)]">{T.profilesUse}</span>
                {([["bazi", T.profilesBazi], ["ziwei", T.profilesZiwei], ["xingpan", T.profilesAstro]] as const).map(([pg, label]) => (
                  <button key={pg} type="button" onClick={() => open(p, pg)} disabled={pg !== "xingpan" && !p.gender} data-heat={`acct-profile-${pg}`}
                    className="t-small px-3 py-1 rounded-[2px] border border-[var(--ink-16)] hover:border-[var(--ink)] disabled:opacity-40">{label}</button>
                ))}
                <button type="button" onClick={() => del(p.id)} disabled={busy === p.id} data-heat="acct-profile-del" className="t-small underline underline-offset-4 !text-[var(--ink-45)] hover:!text-[var(--cinnabar)] disabled:opacity-40">{T.profilesDel}</button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-[var(--s-4)] flex flex-wrap items-center gap-x-6 gap-y-2">
        <a href={`/${locale}/bazi`} data-heat="acct-profile-add" className="inline-block min-h-[var(--s-6)] px-5 py-2.5 rounded-[2px] bg-[var(--ink)] !text-[var(--paper)] text-[13px] tracking-[0.12em] no-underline">{T.profilesAdd}</a>
        {list && list.length > 1 && <button type="button" onClick={() => void delAll()} disabled={busy === "all"} className="t-small underline underline-offset-4 !text-[var(--ink-45)] hover:!text-[var(--cinnabar)] disabled:opacity-40">{T.profilesDelAll}</button>}
      </div>
      <p className="t-small mt-[var(--s-3)] !text-[var(--ink-45)]">{T.profilesNote}</p>
    </section>
  );
}
