"use client";

import { useEffect, useMemo, useState } from "react";
import BirthForm, { type Picked } from "./BirthForm";
import ShareSheet from "@/components/ShareSheet";
import { currentProfile, loadProfiles, saveProfile, setCurrent, syncProfiles } from "@/lib/mingli/birth/profiles";
import type { BirthUi } from "@/lib/mingli/birth/ui";
import { overviewOf, pairFacts, type HepanFacts } from "@/lib/mingli/hepan/facts";
import { cardSrc } from "@/lib/mingli/hepan/card-params";
import { hpNameOf, type HepanNames } from "@/lib/mingli/hepan/names";
import { overviewIn } from "@/lib/mingli/hepan/text-in";
import { isLocale } from "@/lib/locales";
import {
  INVITE_TTL_MS, decodeInvite, encodeInvite, forgetInvite, invitePath, loadInvites, newInviteId, rememberInvite, saveInvites,
  type InviteMemo, type InvitePayload,
} from "@/lib/mingli/hepan/invite-link";
import { useCurrency } from "@/lib/use-currency";
import { formatMoney, hepanMinor, memberDiscountMinor } from "@/lib/money";
import { useTongka } from "@/lib/use-tongka";
import { track } from "@/lib/track";
import { checkoutV2 } from "@/lib/checkout-client";
import RemindTick from "@/components/RemindTick";

/**
 * 10-20 合盤 — the free overview. Two birth entries (我: a saved profile or a new one; TA: a new entry or another saved
 * profile, kept on this device only), the pair's facts worked out here in the browser (lib/mingli/hepan/facts.ts), and
 * the overview cards: 生肖與日柱, 日主五行, 星盤日月金星, the two strongest themes with their facts as chips. Nothing about
 * either birth goes to the server unless the reader buys the report; then only the two birth inputs and genders are sent
 * (never a name) and the server keeps only the computed facts.
 *
 * 10-21 邀請連結 (lib/mingli/hepan/invite-link.ts): instead of typing TA's birth, 我 can send TA a link.
 *   - the inviter's side (this page): 「邀請 TA 自己填」 makes a link carrying the inviter's own birth in the fragment and
 *     remembers its id here; when TA has filled in, the facts the server computed appear under 「TA 填好了」, the overview
 *     shows from them (TA's birth never came here) and the report is bought with {invite: id}.
 *   - TA's side (`invite` prop, /hepan/i#…): the inviter is read from the fragment and kept as a local profile, TA picks
 *     or enters their own birth, and once the pair is complete both births are sent ONCE to POST /api/hepan/invite so
 *     the server can compute and keep the facts for the inviter (it stores no birth — see invite.ts).
 * 10-21 兩人分享卡: the pair as a 1080×1920 card (/api/hepan/card, chart words only in the URL).
 */
const QUESTION_MAX = 200;
type Ui = Record<string, string>;
type Remote = { id: string; facts: HepanFacts; at: number };

export default function HepanFree({ locale, ui, birthUi, hansMap, castHref, invite = false, names = null }: {
  locale: string; ui: Ui; birthUi: BirthUi; hansMap: Record<string, string> | null; castHref: string; invite?: boolean;
  /** 10-30 进度表 128 ④: a page in another language — its names; the overview is said with its own templates (ui) */
  names?: HepanNames | null;
}) {
  const H = useMemo(() => (names ? hpNameOf(names) : null), [names]);
  const [a, setA] = useState<Picked | null>(null);
  const [b, setB] = useState<Picked | null>(null);
  const [editing, setEditing] = useState<"a" | "b" | null>(null);
  const [err, setErr] = useState("");
  const [tester, setTester] = useState(false);
  const [busy, setBusy] = useState(false);
  const [remind, setRemind] = useState(false); // 10-23 进度表 111 ③
  const [buyErr, setBuyErr] = useState("");
  const [question, setQuestion] = useState("");
  const [currency] = useCurrency();
  // the inviter's side
  const [memos, setMemos] = useState<InviteMemo[]>([]);
  const [filled, setFilled] = useState<Record<string, Remote | "gone">>({});
  const [remote, setRemote] = useState<Remote | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  // TA's side
  const [land, setLand] = useState<InvitePayload | "bad" | null>(null);
  const [sent, setSent] = useState<"idle" | "sending" | "sent" | "failed">("idle");
  /** fact text and chart words are Traditional; a zh page maps them character by character */
  const h = (s: string) => (hansMap ? [...s].map((c) => hansMap[c] ?? c).join("") : s);
  const origin = typeof window === "undefined" ? "https://yaoflow.com" : window.location.origin;

  useEffect(() => {
    const cur = currentProfile();
    if (cur?.gender) setA({ id: cur.id, name: cur.name, gender: cur.gender, input: cur.input, who: cur.who });
    else { setEditing("a"); void syncProfiles().then((m) => { const c = m && currentProfile(); if (c?.gender) { setA({ id: c.id, name: c.name, gender: c.gender, input: c.input, who: c.who }); setEditing(null); } }); } // 10-22 生辰檔案
    void fetch("/api/hepan/checkout").then((r) => r.json()).then((j: { tester?: boolean }) => setTester(!!j.tester)).catch(() => {});
    if (invite) {
      const p = decodeInvite(window.location.hash);
      if (!p) { setLand("bad"); track("hepan", { locale, method: "invite_bad" }); return; }
      setLand(p);
      // the inviter becomes a saved profile on this device (once per link), never the current one
      let pid: string | null = null;
      try { pid = localStorage.getItem(`yf_hepan_from_${p.id}`); } catch { /* */ }
      let prof = pid ? loadProfiles().find((x) => x.id === pid) ?? null : null;
      if (!prof) {
        prof = saveProfile({ who: "partner", name: p.n ?? ui.inviterName ?? "TA", gender: p.g, input: p.i }, { current: false });
        try { localStorage.setItem(`yf_hepan_from_${p.id}`, prof.id); } catch { /* */ }
      }
      setB({ id: prof.id, name: prof.name, gender: prof.gender, input: prof.input, who: prof.who });
      try { if (localStorage.getItem(`yf_hepan_sent_${p.id}`)) setSent("sent"); } catch { /* */ }
      track("hepan", { locale, method: "invite_open" });
      return;
    }
    // the inviter: which links were made here, and which TA has filled in
    const list = loadInvites();
    setMemos(list);
    for (const m of list.slice(0, 5)) {
      if (Date.now() - m.at > INVITE_TTL_MS) continue;
      void fetch(`/api/hepan/invite?id=${m.id}`).then((r) => r.json()).then((j: { filled?: boolean; facts?: HepanFacts; at?: number }) => {
        if (j.filled && j.facts) setFilled((f) => ({ ...f, [m.id]: { id: m.id, facts: j.facts!, at: j.at ?? Date.now() } }));
      }).catch(() => {});
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { if (a && !b && !remote && editing === null && land === null) setEditing("b"); }, [a, b, remote, editing, land]);

  const same = !!a && !!b && a.id === b.id;
  const localFacts = useMemo((): HepanFacts | null => {
    if (!a?.gender || !b?.gender || same) return null;
    try { return pairFacts({ input: a.input, gender: a.gender }, { input: b.input, gender: b.gender }); } catch { return null; }
  }, [a, b, same]);
  const facts = remote ? remote.facts : localFacts;
  const ov = useMemo(() => (facts ? (H ? overviewIn(facts, ui, H) : overviewOf(facts)) : null), [facts, H, ui]);
  useEffect(() => {
    if (!facts) return;
    track("hepan", { locale, method: `pair:${facts.ziwei ? "zw" : "-"}:${facts.a.astro.timeKnown ? "t" : "n"}${facts.b.astro.timeKnown ? "t" : "n"}${remote ? ":invite" : land && land !== "bad" ? ":landed" : ""}` });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [facts]);

  // TA's side: once the pair is complete, both births go to the server ONCE, which keeps only the facts for the inviter
  useEffect(() => {
    if (!land || land === "bad" || !localFacts || !a?.gender || !b?.gender || sent !== "idle") return;
    setSent("sending");
    void fetch("/api/hepan/invite", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: land.id, a: { input: b.input, gender: b.gender }, b: { input: a.input, gender: a.gender }, locale }),
    }).then((r) => {
      if (!r.ok) throw new Error(String(r.status));
      try { localStorage.setItem(`yf_hepan_sent_${land.id}`, String(Date.now())); } catch { /* */ }
      setSent("sent");
      track("hepan", { locale, method: "invite_filled" });
    }).catch(() => setSent("failed"));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [land, localFacts]);

  const pick = (slot: "a" | "b") => (p: Picked) => {
    setErr("");
    if (!p.gender) { setErr(ui.needGender ?? ""); return; }
    if (slot === "b" || remote) setRemote(null);
    if (slot === "a") setCurrent(p.id); // 我 is the device's current profile (BirthForm with onPick does not switch it)
    (slot === "a" ? setA : setB)(p);
    setEditing(null);
  };

  const buy = async () => {
    if (!facts || (!remote && (!a?.gender || !b?.gender))) return;
    setBusy(true); setBuyErr("");
    track("hepan", { locale, method: tester ? "buy:tester" : remote ? "buy:invite" : "buy" });
    try {
      const common = { currency, locale, question: [...question.trim()].slice(0, QUESTION_MAX).join("") || undefined, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone, tzOffsetMinutes: -new Date().getTimezoneOffset(), ...(remind && !tester ? { remind: true } : {}) };
      const body = remote ? { invite: remote.id, ...common } : { a: { input: a!.input, gender: a!.gender }, b: { input: b!.input, gender: b!.gender }, ...common };
      const r = await checkoutV2("hepan", body); // 10-22 进度表 57
      const j = (await r.json()) as { url?: string; error?: string };
      if (j.url) { window.location.assign(j.url); return; }
      if (j.error === "no_invite" && remote) { setFilled((f) => ({ ...f, [remote.id]: "gone" })); setRemote(null); }
      setBuyErr(ui.buyErr ?? "");
    } catch { setBuyErr(ui.buyErr ?? ""); }
    setBusy(false);
  };

  /** the inviter makes (or re-makes) a link: their own birth in the fragment, the id kept here */
  const makeLink = (id = newInviteId()) => {
    if (!a?.gender) return;
    const url = `${origin}${invitePath(locale, encodeInvite({ id, gender: a.gender, input: a.input, name: a.name }))}`;
    rememberInvite({ id, at: Date.now(), aId: a.id });
    setMemos(loadInvites());
    setLink(url); setCopied(false);
    setEditing(null);
    track("hepan", { locale, method: "invite_make" });
  };
  const copyLink = async () => {
    if (!link) return;
    try { await navigator.clipboard.writeText(link); setCopied(true); track("hepan", { locale, method: "invite_copy" }); } catch { /* the box is selectable */ }
  };
  const shareLink = async () => {
    if (!link) return;
    const nav = navigator as Navigator & { share?: (d: { text?: string; url?: string }) => Promise<void> };
    if (nav.share) { try { await nav.share({ text: ui.inviteShareText, url: link }); track("hepan", { locale, method: "invite_share" }); return; } catch { /* dismissed */ } }
    void copyLink();
  };
  const openRemote = (r: Remote) => {
    // 我 is the profile the link was made from (the facts were computed for that birth)
    const memo = memos.find((m) => m.id === r.id), prof = memo ? loadProfiles().find((x) => x.id === memo.aId) : null;
    if (prof?.gender) setA({ id: prof.id, name: prof.name, gender: prof.gender, input: prof.input, who: prof.who });
    setRemote(r); setB(null); setEditing(null); setLink(null);
    saveInvites(loadInvites().map((m) => (m.id === r.id ? { ...m, seen: true } : m)));
    track("hepan", { locale, method: "invite_view" });
  };

  const slot = (k: "a" | "b") => {
    const p = k === "a" ? a : b;
    const fixed = k === "b" && land !== null && land !== "bad"; // TA's page: the inviter is set by the link
    const label = k === "a" ? ui.me : names ? ui.taName : ui.ta;
    const name = k === "b" && remote ? ui.inviteFilledTa : p ? p.name : "—";
    return (
      <div className={`rounded-[10px] border p-4 flex items-center gap-3 ${editing === k ? "border-[var(--ink)]" : "border-[var(--ink-16)]"}`}>
        <span className={`t-label shrink-0 ${names ? "min-w-8" : "w-8"} !text-[var(--gold-text)]`}>{label}</span>
        <span className="t-body flex-1 truncate">{name}</span>
        {!fixed && <button type="button" onClick={() => { setErr(""); setLink(null); setEditing(editing === k ? null : k); }} className="t-small underline underline-offset-4 shrink-0">{p || (k === "b" && remote) ? ui.change : k === "a" ? ui.pickMe : ui.pickTa}</button>}
      </div>
    );
  };
  const card = (title: string, body: React.ReactNode) => (
    <section className="rounded-[6px] border border-[var(--ink-16)] p-4">
      <h2 className="t-sect">{title}</h2>
      <div className="mt-[var(--s-2)]">{body}</div>
    </section>
  );
  // 10-22 會員 8 折 (Neil: 只給會員)
  const tk = useTongka();
  const price = formatMoney(currency, tk.member ? memberDiscountMinor(currency, hepanMinor(currency)) : hepanMinor(currency), isLocale(locale) ? locale : "zh-hant");
  const pending = memos.filter((m) => !filled[m.id] || filled[m.id] === "gone");
  const ready = memos.map((m) => filled[m.id]).filter((x): x is Remote => !!x && x !== "gone");
  const landing = land !== null && land !== "bad" ? land : null;

  if (land === "bad") {
    return (
      <div>
        <p className="t-body">{ui.landBad}</p>
        <a href={`/${locale}/hepan`} className="inline-block mt-[var(--s-3)] t-small underline underline-offset-4">{ui.head} →</a>
      </div>
    );
  }

  return (
    <div>
      {landing && (
        <section className="mb-[var(--s-4)] rounded-[6px] border border-[var(--gold)] p-4">
          <h2 className="t-sect">{landing.n ? (ui.landHeadNamed ?? "").replace("{n}", landing.n) : ui.landHead}</h2>
          <p className="t-small mt-1 !text-[var(--ink-66)]">{ui.landLead}</p>
          {sent !== "idle" && <p className={`t-small mt-2 ${sent === "failed" ? "!text-[var(--cinnabar)]" : "!text-[var(--gold-text)]"}`}>{sent === "sending" ? ui.landSending : sent === "sent" ? ui.landSent : ui.landSendFail}</p>}
        </section>
      )}

      {/* the inviter: TA has filled in */}
      {!landing && ready.length > 0 && !remote && (
        <div className="mb-[var(--s-4)] grid gap-2">
          {ready.map((r) => (
            <section key={r.id} className="rounded-[6px] border border-[var(--gold)] p-4 flex items-center gap-3">
              <div className="flex-1">
                <p className="t-sect">{ui.inviteReady}</p>
                <p className="t-small mt-1 !text-[var(--ink-66)]">{ui.inviteTaNote}</p>
              </div>
              <button type="button" onClick={() => openRemote(r)} className="px-4 py-2 rounded-full bg-[var(--ink)] !text-[var(--paper)] text-[14px] shrink-0">{ui.inviteOpen}</button>
            </section>
          ))}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">{slot("a")}{slot("b")}</div>
      {err && <p className="t-small mt-2 !text-[var(--cinnabar)]">{err}</p>}
      {same && <p className="t-small mt-2 !text-[var(--cinnabar)]">{ui.sameOne}</p>}
      {remote && <p className="t-small mt-2 !text-[var(--ink-66)]">{ui.inviteTaNote}</p>}

      {/* the inviter: make a link instead of typing TA's birth */}
      {!landing && a?.gender && !b && !remote && !link && (
        <div className="mt-[var(--s-3)]">
          <button type="button" onClick={() => makeLink()} className="px-4 py-2 rounded-full border border-[var(--ink)] text-[14px]">{ui.inviteBtn}</button>
        </div>
      )}
      {link && (
        <section className="mt-[var(--s-4)] rounded-[6px] border border-[var(--gold)] p-4">
          <h2 className="t-sect">{ui.inviteHead}</h2>
          <p className="t-small mt-1 !text-[var(--ink-66)]">{ui.inviteLead}</p>
          <input readOnly value={link} onFocus={(e) => e.currentTarget.select()} className="mt-3 w-full rounded-[6px] border border-[var(--ink-16)] bg-transparent px-3 py-2 t-small text-[14px]" />
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={() => void shareLink()} className="px-4 py-2 rounded-full bg-[var(--ink)] !text-[var(--paper)] text-[14px]">{ui.inviteShare}</button>
            <button type="button" onClick={() => void copyLink()} className="px-4 py-2 rounded-full border border-[var(--ink)] text-[14px]">{copied ? ui.inviteCopied : ui.inviteCopy}</button>
          </div>
          <p className="t-small mt-3 !text-[var(--ink-45)]">{ui.inviteWaiting}</p>
        </section>
      )}
      {!landing && !link && pending.length > 0 && !b && !remote && (
        <div className="mt-[var(--s-3)] grid gap-2">
          {pending.slice(0, 3).map((m) => {
            const expired = Date.now() - m.at > INVITE_TTL_MS || filled[m.id] === "gone";
            return (
              <div key={m.id} className="rounded-[6px] border border-[var(--ink-16)] px-4 py-3 flex items-center gap-3">
                <p className="t-small flex-1 !text-[var(--ink-66)]">{expired ? ui.inviteExpired : names
                  ? `${ui.inviteMade} (${new Date(m.at).toLocaleDateString(locale, { month: "short", day: "numeric" })}) · ${ui.inviteWaiting}`
                  : `${ui.inviteMade}（${new Date(m.at).toLocaleDateString(locale === "zh" ? "zh-CN" : "zh-TW", { month: "numeric", day: "numeric" })}）· ${ui.inviteWaiting}`}</p>
                {!expired && a?.id === m.aId && <button type="button" onClick={() => makeLink(m.id)} className="t-small underline underline-offset-4 shrink-0">{ui.inviteAgain}</button>}
                <button type="button" onClick={() => { forgetInvite(m.id); setMemos(loadInvites()); }} className="t-small underline underline-offset-4 shrink-0 !text-[var(--ink-45)]">{ui.inviteForget}</button>
              </div>
            );
          })}
        </div>
      )}

      {editing && (
        <div className="mt-[var(--s-4)]">
          <p className="t-sect mb-2">{editing === "a" ? ui.pickMe : ui.pickTa}</p>
          <BirthForm key={editing} locale={locale} ui={birthUi} chartHref={`/${locale}/hepan`} event="hepan" initialWho={editing === "a" ? "self" : "partner"}
            goLabel={editing === "a" ? ui.pickMe : ui.pickTa} onPick={pick(editing)} />
        </div>
      )}

      {facts && ov && !editing && (
        <div className="mt-[var(--s-5)] grid gap-3">
          {card(ui.zodiacHead ?? "", <p className="t-body leading-relaxed">{h(ov.zodiac)}</p>)}
          {card(ui.dmHead ?? "", <p className="t-body leading-relaxed">{h(ov.dm)}</p>)}
          {card(ui.astroHead ?? "", <p className="t-body leading-relaxed">{h(ov.astro)}</p>)}
          {card(ui.themesHead ?? "", (
            <div className="grid gap-[var(--s-3)]">
              {ov.themes.map((t) => (
                <div key={t.key}>
                  {names
                    ? <p className="t-body"><span className="font-medium block">{t.title}</span>{t.line}</p>
                    : <p className="t-body"><span className="font-medium">{h(t.title)}</span>　{h(t.line)}</p>}
                  {t.chips.length > 0 && (
                    <p className="mt-1.5 flex flex-wrap gap-1.5">
                      {t.chips.map((c, i) => <span key={i} className="t-small inline-block rounded-[2px] border border-[var(--ink-16)] px-2 py-[1px] !text-[var(--ink-66)]">{h(c)}</span>)}
                    </p>
                  )}
                </div>
              ))}
            </div>
          ))}
          {!facts.ziwei && <p className="t-small !text-[var(--ink-66)]">{ui.noZiwei}</p>}
          {(!facts.a.astro.timeKnown || !facts.b.astro.timeKnown) && <p className="t-small !text-[var(--ink-66)]">{ui.noTimeAstro}</p>}

          <section className="mt-[var(--s-3)] rounded-[6px] border border-[var(--gold)] p-4">
            <h2 className="t-sect">{ui.buyHead}</h2>
            <p className="t-small mt-1 !text-[var(--ink-66)]">{ui.buyLine}</p>
            <label className="mt-[var(--s-3)] block">
              <span className="t-small !text-[var(--ink-66)]">{ui.ask}</span>
              <textarea value={question} onChange={(e) => setQuestion([...e.target.value].slice(0, QUESTION_MAX).join(""))} maxLength={QUESTION_MAX} rows={2} placeholder={ui.askHint}
                className="mt-1 w-full rounded-[6px] border border-[var(--ink-16)] bg-transparent px-3 py-2 t-body text-[16px] leading-relaxed resize-y focus:outline-none focus:border-[var(--ink-45)]" />
              <span className="t-small block text-right !text-[var(--ink-45)]">{[...question].length}/{QUESTION_MAX}</span>
            </label>
            <button type="button" disabled={busy} onClick={() => void buy()} className="mt-2 px-5 py-2.5 rounded-full bg-[var(--ink)] !text-[var(--paper)] text-[14px] disabled:opacity-45">
              {busy ? (tester ? ui.writing : ui.going) : tester ? ui.test : (ui.buy ?? "").replace("{p}", price)}
            </button>
            {buyErr && <p className="t-small mt-2 !text-[var(--cinnabar)]">{buyErr}</p>}
            {!tester && <RemindTick locale={locale} checked={remind} onChange={setRemind} />}
            <p className="t-small mt-[var(--s-3)] !text-[var(--ink-45)]">{ui.buyNote}</p>
          </section>

          <section className="mt-[var(--s-3)]">
            <p className="t-small mb-2 !text-[var(--ink-66)]">{ui.cardLead}</p>
            <ShareSheet locale={locale} surface="hepan" compact
              url={`${origin}/${locale}/hepan?c=hepan-share`}
              text={ui.cardText}
              image={cardSrc(facts, locale)}
              fileName="yaoflow-hepan.png" />
          </section>

          <section className="mt-[var(--s-3)]">
            <p className="t-sect">{ui.askHead}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {(ui.asks ?? "").split(",").filter(Boolean).map((q) => (
                <a key={q} href={`${castHref}?${new URLSearchParams({ q, c: "hepan" })}`} onClick={() => track("hepan", { locale, method: "ask_cast" })}
                  className="px-3.5 py-2 rounded-full border border-[var(--ink-16)] hover:border-[var(--ink)] text-[14px]">{q}</a>
              ))}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
