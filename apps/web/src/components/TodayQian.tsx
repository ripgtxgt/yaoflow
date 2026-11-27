"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { track } from "@/lib/track";
import { useCurrency } from "@/lib/use-currency";
import { firstMonthMinor, formatMoney, priceMinor } from "@/lib/money";
import TodayQianDraw from "./TodayQianDraw";

/**
 * 10-14 进度表 50 今日一籤 — the page's moving parts: draw, the lot card (poem set vertically), the month calendar, 「我常去的廟」,
 * and for members / 籤卡 holders the words for their matter, 今日宜／忌, past days and the 07:30 letter. Everyone else sees
 * what those add and the 籤卡 (NT$59 for 30 days, never renewed). The next step is always a cast with an empty question.
 * 10-22 进度表 92: the 籤卡 is no longer sold — the full lot is the membership's (a 通卡 bought before the split keeps it to
 * its end: access "pass"); the box offers the membership instead.
 */
type Section = "love" | "work" | "overall";
interface Lot { set: string; setName: string; num: number; tag: string; title: string; poem: string[]; full?: { section: Section; text: string; askNext: string; yi: string | null; ji: string | null } }
type L = "zh-hant" | "zh";

const T = {
  "zh-hant": {
    draw: "抽今天的籤", drawing: "搖籤中…", drawn: "今天抽到", num: (n: number) => `第 ${n} 籤`, sect: { love: "放在你的感情上", work: "放在你的工作上", overall: "放在你最近的事上" } as Record<Section, string>,
    yi: "今日宜", ji: "今日忌", next: "今天的籤看大方向；你心裡那件事會落在哪幾天，起一卦看日子。", cast: "起一卦看日子 →",
    cal: "本月的籤", calNote: "抽過的日子會亮起來。", calLocked: "會員可以回看過去的籤。", streak: (n: number) => `已連續 ${n} 天`,
    temple: "我常去的廟", templeNote: "明天起從這間廟的籤裡抽。", templeDefault: "不指定（六十甲子籤）",
    more: "會員多看到", moreList: ["針對你那件事的白話（感情、工作或其他）", "今日宜／忌各一句", "日曆上任何一天都能點開回看", "每天早上 7:30 寄到信箱（可關）", "按你的八字算的「你的今天」"],
    memberLine: (first: string, month: string) => `會員首月 ${first}，之後 ${month}／月；問事與看自己不限次，每天一封信。`, toMember: "看會員方案 →",
    have: (d: string) => `你的籤卡到 ${d}`, member: "你是會員，每日一籤的全部內容都包含在內。", pass: "你的通卡到期前，每日一籤的全部內容照常可看。",
    mail: "每天早上 7:30 寄到我的信箱", mailOn: "已開：每天早上寄給你", mailOff: "已關閉每天寄信。", mailBad: "這個連結已失效，可以在這裡直接關。",
    cardNo: "好的，籤卡到期後，抽籤和日曆照常可以用。", synced: "籤卡已開通。", syncFail: "付款完成了，籤卡稍後會自動開通；重新整理看看。",
    close: "收起", failed: "沒抽成，再試一次。", lockedDay: "這一天的籤要會員才能回看。",
  },
  zh: {
    draw: "抽今天的签", drawing: "摇签中…", drawn: "今天抽到", num: (n: number) => `第 ${n} 签`, sect: { love: "放在你的感情上", work: "放在你的工作上", overall: "放在你最近的事上" } as Record<Section, string>,
    yi: "今日宜", ji: "今日忌", next: "今天的签看大方向；你心里那件事会落在哪几天，起一卦看日子。", cast: "起一卦看日子 →",
    cal: "本月的签", calNote: "抽过的日子会亮起来。", calLocked: "会员可以回看过去的签。", streak: (n: number) => `已连续 ${n} 天`,
    temple: "我常去的庙", templeNote: "明天起从这间庙的签里抽。", templeDefault: "不指定（六十甲子签）",
    more: "会员多看到", moreList: ["针对你那件事的白话（感情、工作或其他）", "今日宜／忌各一句", "日历上任何一天都能点开回看", "每天早上 7:30 寄到邮箱（可关）", "按你的八字算的「你的今天」"],
    memberLine: (first: string, month: string) => `会员首月 ${first}，之后 ${month}／月；问事与看自己不限次，每天一封信。`, toMember: "看会员方案 →",
    have: (d: string) => `你的签卡到 ${d}`, member: "你是会员，每日一签的全部内容都包含在内。", pass: "你的通卡到期前，每日一签的全部内容照常可看。",
    mail: "每天早上 7:30 寄到我的邮箱", mailOn: "已开：每天早上寄给你", mailOff: "已关闭每天寄信。", mailBad: "这个链接已失效，可以在这里直接关。",
    cardNo: "好的，签卡到期后，抽签和日历照常可以用。", synced: "签卡已开通。", syncFail: "付款完成了，签卡稍后会自动开通；刷新看看。",
    close: "收起", failed: "没抽成，再试一次。", lockedDay: "这一天的签要会员才能回看。",
  },
};

const WEEK = ["日", "一", "二", "三", "四", "五", "六"];

function LotCard({ lot, locale }: { lot: Lot; locale: L }) {
  const w = T[locale];
  return (
    <div className="mt-[var(--s-5)] fade-in">
      <p className="t-label !text-[var(--gold-text)]">{lot.setName} · {w.num(lot.num)}{lot.tag ? ` · ${lot.tag}` : ""}</p>
      <h2 className="t-d2 mt-2">{lot.title}</h2>
      <div className="mt-[var(--s-4)] flex justify-center">
        <div className="border border-[var(--ink-16)] rounded-[2px] px-6 py-6 bg-[var(--paper)]" style={{ writingMode: "vertical-rl" }}>
          {lot.poem.map((line, k) => <p key={k} className="t-d3 leading-[2.1] tracking-[0.18em] mx-1">{line}</p>)}
        </div>
      </div>
      {lot.full && (
        <div className="mt-[var(--s-5)]">
          <p className="t-label">{w.sect[lot.full.section]}</p>
          <p className="t-body mt-2 leading-relaxed">{lot.full.text}</p>
          {(lot.full.yi || lot.full.ji) && (
            <dl className="mt-[var(--s-4)] grid grid-cols-[4.5rem_1fr] gap-y-2 t-body">
              {lot.full.yi && <><dt className="!text-[var(--gold-text)]">{w.yi}</dt><dd>{lot.full.yi}</dd></>}
              {lot.full.ji && <><dt className="!text-[var(--cinnabar)]">{w.ji}</dt><dd>{lot.full.ji}</dd></>}
            </dl>
          )}
          <p className="t-body mt-[var(--s-4)] text-[var(--ink-66)]">{lot.full.askNext}</p>
        </div>
      )}
    </div>
  );
}

export default function TodayQian(p: {
  locale: L; day: string; lot: Lot | null; month: { day: string; set: string; num: number }[];
  prefs: { set: string; temple: string | null; mail: boolean }; access: "member" | "pass" | "card" | null; signedIn: boolean; cardEnds: number | null;
  sets: { id: string; name: string }[]; temples: { id: string; name: string; set: string }[]; streak: number;
  notice: "mail_off" | "mail_bad" | "card_no" | null; cardSession: string | null; wantBuy: boolean;
}) {
  const w = T[p.locale];
  const [lot, setLot] = useState<Lot | null>(p.lot);
  const [month, setMonth] = useState(p.month);
  const [temple, setTemple] = useState<string>(p.prefs.temple ?? "");
  const [mail, setMail] = useState(p.prefs.mail);
  const [past, setPast] = useState<{ day: string; lot: Lot } | null>(null);
  const [note, setNote] = useState<string | null>(p.notice === "mail_off" ? w.mailOff : p.notice === "mail_bad" ? w.mailBad : p.notice === "card_no" ? w.cardNo : null);
  const [currency] = useCurrency();
  const cardRef = useRef<HTMLElement | null>(null);

  // back from Checkout with ?card=cs_…: record the card at once, then reload with the full lot
  useEffect(() => {
    if (!p.cardSession) return;
    fetch("/api/today-qian/card-sync", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ session: p.cardSession }) })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { setNote(d?.ok ? w.synced : w.syncFail); if (d?.ok) setTimeout(() => location.replace(`/${p.locale}/today-qian`), 900); })
      .catch(() => setNote(w.syncFail));
  }, [p.cardSession, p.locale, w.synced, w.syncFail]);
  useEffect(() => { if (p.wantBuy) cardRef.current?.scrollIntoView({ behavior: "smooth" }); }, [p.wantBuy]);

  // 10-15: the request leaves on the tap and the animation covers its time (components/TodayQianDraw.tsx)
  const requestDraw = async (): Promise<Lot> => {
    const r = await fetch("/api/today-qian/draw", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ locale: p.locale }) });
    const d = r.ok ? ((await r.json()) as { day: string; lot: Lot | null }) : null;
    if (!d?.lot) throw new Error("no lot");
    drawnDay.current = d.day;
    return d.lot;
  };
  const drawnDay = useRef<string>(p.day);
  const landed = (l: Lot) => {
    const day = drawnDay.current;
    setLot(l);
    setMonth((m) => (m.some((x) => x.day === day) ? m : [...m, { day, set: l.set, num: l.num }]));
  };

  const chooseTemple = async (id: string) => {
    setTemple(id);
    await fetch("/api/today-qian/prefs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(id ? { temple: id } : { set: "liushi-jiazi" }) }).catch(() => null);
  };
  const toggleMail = async (on: boolean) => {
    setMail(on);
    const r = await fetch("/api/today-qian/prefs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mail: on }) }).catch(() => null);
    if (!r?.ok) setMail(!on);
  };
  const openDay = async (day: string) => {
    track("today_qian", { locale: p.locale, method: "cal_click" });
    if (day === p.day) { setPast(null); return; }
    if (!p.access) { setPast(null); setNote(w.lockedDay); return; }
    const r = await fetch(`/api/today-qian/day?d=${day}&l=${p.locale}`, { cache: "no-store" }).catch(() => null);
    const d = r?.ok ? ((await r.json()) as { day: string; lot: Lot }) : null;
    if (d?.lot) setPast(d); else setNote(w.lockedDay);
  };

  // the month grid (Taipei days; today and the future as the page sees them)
  const grid = useMemo(() => {
    const [y, m] = p.day.split("-").map(Number) as [number, number];
    const first = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
    const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const by = new Map(month.map((x) => [x.day, x]));
    const cells: ({ day: string; d: number; num: number | null; future: boolean } | null)[] = Array.from({ length: first }, () => null);
    for (let d = 1; d <= days; d++) {
      const key = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      cells.push({ day: key, d, num: by.get(key)?.num ?? null, future: key > p.day });
    }
    return cells;
  }, [month, p.day]);

  const firstLabel = formatMoney(currency, firstMonthMinor(currency), p.locale);
  const monthLabel = formatMoney(currency, priceMinor(currency, "month"), p.locale);
  const endsLabel = p.cardEnds ? (() => { const t = new Date(p.cardEnds + 8 * 3_600_000); return `${t.getUTCMonth() + 1}月${t.getUTCDate()}日`; })() : "";

  return (
    <div>
      {note && <p className="t-small mt-[var(--s-4)] p-[var(--s-3)] border border-[var(--gold)] rounded-[2px]">{note}</p>}

      {/* ---- today's lot ---- */}
      <section className="mt-[var(--s-5)]" data-heat="tq-today">
        {lot ? (
          <>
            <p className="t-small text-[var(--ink-45)]">{w.drawn}{p.streak > 1 ? ` · ${w.streak(p.streak)}` : ""}</p>
            <LotCard lot={lot} locale={p.locale} />
          </>
        ) : (
          <TodayQianDraw label={w.draw} busyLabel={w.drawing} failed={w.failed} numLabel={w.num} request={requestDraw} onDone={landed} seal={p.locale === "zh" ? "签" : "籤"} />
        )}
        {lot && (
          <div className="mt-[var(--s-5)] pt-[var(--s-4)] border-t border-[var(--ink-16)]">
            <p className="t-body">{w.next}</p>
            <a href={`/${p.locale}/cast?c=tq`} onClick={() => track("today_qian", { locale: p.locale, method: "cast" })} data-heat="tq-cast"
              className="inline-block mt-[var(--s-3)] min-h-[var(--s-6)] px-5 py-2.5 rounded-[2px] bg-[var(--ink)] text-[var(--paper)] text-[13px] tracking-[0.14em]">{w.cast}</a>
          </div>
        )}
      </section>

      {/* ---- the month ---- */}
      <section className="mt-[var(--s-6)]" data-heat="tq-calendar">
        <h2 className="t-sect mb-[var(--s-2)]">{w.cal}</h2>
        <p className="t-small text-[var(--ink-45)] mb-[var(--s-3)]">{w.calNote}{p.access ? "" : ` ${w.calLocked}`}</p>
        <div className="grid grid-cols-7 gap-1 text-center max-w-[24rem]">
          {WEEK.map((x) => <span key={x} className="t-label !text-[10px] opacity-60 py-1">{x}</span>)}
          {grid.map((c, k) => c === null ? <span key={`e${k}`} /> : (
            <button key={c.day} type="button" disabled={c.future || c.num === null} onClick={() => openDay(c.day)}
              className={`aspect-square rounded-[2px] text-[12px] leading-tight flex flex-col items-center justify-center border ${c.day === p.day ? "border-[var(--ink)]" : "border-transparent"} ${c.num !== null ? "bg-[var(--gold)]/20 text-[var(--ink)]" : c.future ? "opacity-25" : "opacity-50"}`}>
              <span>{c.d}</span>
              {c.num !== null && <span className="text-[10px] !text-[var(--gold-text)] tabular-nums">{c.num}</span>}
            </button>
          ))}
        </div>
        {past && (
          <div className="mt-[var(--s-4)] p-[var(--s-4)] border border-[var(--ink-16)] rounded-[2px]">
            <p className="t-label">{past.day}</p>
            <LotCard lot={past.lot} locale={p.locale} />
            <button type="button" onClick={() => setPast(null)} className="t-small underline underline-offset-4 mt-[var(--s-3)]">{w.close}</button>
          </div>
        )}
      </section>

      {/* ---- where I usually go ---- */}
      <section className="mt-[var(--s-6)]">
        <h2 className="t-sect mb-[var(--s-2)]">{w.temple}</h2>
        <select value={temple} onChange={(e) => chooseTemple(e.target.value)} className="t-body bg-transparent border border-[var(--ink-16)] rounded-[2px] px-3 py-2 max-w-full">
          <option value="">{w.templeDefault}</option>
          {p.sets.map((s) => (
            <optgroup key={s.id} label={s.name}>
              {p.temples.filter((t) => t.set === s.id).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </optgroup>
          ))}
        </select>
        <p className="t-small text-[var(--ink-45)] mt-2">{w.templeNote}</p>
      </section>

      {/* ---- members and card holders ---- */}
      <section ref={cardRef} id="card" className="mt-[var(--s-6)] p-[var(--s-5)] border border-[var(--gold)] rounded-[2px]" data-heat="tq-card">
        {p.access ? (
          <>
            <p className="t-body">{p.access === "member" ? w.member : p.access === "pass" ? w.pass : w.have(endsLabel)}</p>
            {p.signedIn && (
              <label className="flex items-center gap-2 mt-[var(--s-3)] t-body cursor-pointer">
                <input type="checkbox" checked={mail} onChange={(e) => toggleMail(e.target.checked)} className="accent-[var(--ink)]" />
                <span>{w.mail}</span>
              </label>
            )}
          </>
        ) : (
          <>
            <h2 className="t-sect">{w.more}</h2>
            <ul className="mt-[var(--s-3)] t-body list-disc pl-5 space-y-1">{w.moreList.map((x) => <li key={x}>{x}</li>)}</ul>
            <p className="t-body mt-[var(--s-4)]">{w.memberLine(firstLabel, monthLabel)}</p>
            <a href={`/${p.locale}/account#membership`} onClick={() => track("today_qian", { locale: p.locale, method: "member_click" })} data-heat="tq-member"
              className="inline-block mt-[var(--s-3)] min-h-[var(--s-6)] px-5 py-2.5 rounded-[2px] bg-[var(--ink)] text-[var(--paper)] text-[13px] tracking-[0.14em]">{w.toMember}</a>
          </>
        )}
      </section>
    </div>
  );
}
