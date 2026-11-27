"use client";

import LoveBridge from "@/components/LoveBridge";
import { useEffect, useRef, useState } from "react";
import Jiaobei3D from "./Jiaobei3D";
import { cleanQuestion, confirmsNeeded, drawLot, REQUEST_TRIES, toss, type Sign } from "@/lib/jiaobei";
import type { JiaobeiUi } from "@/lib/jiaobei-ui";
import { qianPath } from "@/lib/qian-meta";
import { track } from "@/lib/track";

/**
 * 10-16 进度表 67: 擲筊問事 (mode "ask") and 線上求籤 (mode "qiuqian"), all in the browser — nothing is sent but the
 * anonymous counts (track "jiaobei"). The matter stays in localStorage only, so "one matter, the first sign" and
 * "one lot per matter a day" hold on this browser.
 */
const DAY = 86_400_000;
const ASK_KEY = "yf_jb_ask";
const QQ_KEY = "yf_jb_qq";
type AskRec = Record<string, { t: number; sign: Sign; seq?: Sign[]; rule?: 1 | 3; tk?: string }>;
type QqRec = Record<string, { t: number; set: string; num: number }>;
const read = <T,>(k: string): T => { try { return JSON.parse(localStorage.getItem(k) ?? "{}") as T; } catch { return {} as T; } };
const write = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } };
const fresh = <T extends { t: number }>(r: Record<string, T>) => Object.fromEntries(Object.entries(r).filter(([, v]) => Date.now() - v.t < DAY));
const fill = (s: string, m: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k: string) => String(m[k] ?? ""));
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const reduced = () => typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;

const POSE: Record<Sign, [boolean, boolean]> = { sheng: [true, false], xiao: [true, true], yin: [false, false] };

function useToss() {
  const [blocks, setBlocks] = useState<[boolean, boolean]>([false, false]);
  const [state, setState] = useState<"waiting" | "tossing" | "still">("waiting");
  const [key, setKey] = useState(0);
  const [instant, setInstant] = useState(false);
  const busy = useRef(false);
  const settle = useRef<(() => void) | null>(null);
  const run = async (): Promise<Sign | null> => {
    if (busy.current) return null;
    busy.current = true;
    const r = toss();
    setBlocks(r.blocks); setInstant(false); setKey((k) => k + 1); setState("tossing");
    // 10-17 3D: the result shows when the blocks have come to rest (a recorded fall lasts 1–2.5 s; never wait past 6 s)
    await new Promise<void>((res) => { settle.current = res; setTimeout(res, 6000); });
    settle.current = null;
    setState("still");
    busy.current = false;
    return r.sign;
  };
  /** the first sign of a matter asked again: the blocks shown at rest in that sign, no fall */
  const show = (sign: Sign) => { setBlocks(POSE[sign]); setInstant(true); setKey((k) => k + 1); setState("still"); };
  const onSettled = () => settle.current?.();
  return { blocks, state, key, instant, run, show, setState, onSettled };
}

const RULE_KEY = "yf_jb_rule";

/**
 * 10-17 (Neil: 「不是一般都是掷三次吗？」→「按照各地的风俗习惯来吧，福建那边也是三次为准」): two rules, the reader picks —
 * one toss, the first sign stands (the default since 10-17); or three 聖筊 for a bigger matter (Taiwan, 福建／閩南),
 * where a 陰筊 stops it and a 笑筊 means "say it more clearly, toss again". Each toss is its own tap, as at the temple.
 */
export function JiaobeiAsk({ locale, ui, region = "tw", initialQ = "", qiuqian = true }: { locale: string; ui: JiaobeiUi; region?: "tw" | "hk" | "cn"; /** 10-22 进度表 86: no longer read (陰筊 no longer points at the tarot) */ tarotOn?: boolean; initialQ?: string; /** 10-30 进度表 128 ⑤: 求籤 is open in this language (else a 聖筊 leads to the cast) */ qiuqian?: boolean }) {
  const [q, setQ] = useState(initialQ);
  const [tk, setTk] = useState<string | null>(null); // 10-17 承接: the kept result, carried into the cast
  const [rule, setRule] = useState<1 | 3>(1);
  const [seq, setSeq] = useState<Sign[]>([]);
  const [done, setDone] = useState(false);
  const [locked, setLocked] = useState(false);
  const [retossed, setRetossed] = useState(false);
  const allowOnce = useRef(false);
  const t = useToss();
  useEffect(() => { try { const r = localStorage.getItem(RULE_KEY); if (r === "3") setRule(3); } catch { /* */ } }, []);
  const pickRule = (r: 1 | 3) => { setRule(r); try { localStorage.setItem(RULE_KEY, String(r)); } catch { /* */ } track("jiaobei", { locale, method: `rule:${r}` }); };

  const last = seq[seq.length - 1] ?? null;
  // the outcome: three 聖 in a row; or the sign that ended it (with three, the first that was not 聖)
  const final: Sign | null = done ? last : null;
  const sheng = seq.filter((x) => x === "sheng").length;
  const confirmed3 = done && rule === 3 && sheng === 3;

  const go = async () => {
    const key = cleanQuestion(q);
    const rec = fresh(read<AskRec>(ASK_KEY));
    if (seq.length === 0 && key && rec[key] && !allowOnce.current) {
      // the same matter within a day: what it came to the first time stands
      const r = rec[key]!;
      setSeq(r.seq ?? [r.sign]); setRule(r.rule ?? 1); setDone(true); setLocked(true); setTk(r.tk ?? null); t.show(r.sign);
      track("jiaobei", { locale, method: "same" });
      return;
    }
    const s = await t.run();
    if (!s) return;
    allowOnce.current = false;
    const next = [...seq, s];
    setSeq(next);
    // 10-17 (Neil: 「三次圣筊的几率太少了」→ A+C): with three, a 笑筊 does not break the run — the question is made clearer
    // and the tossing goes on; a 陰筊 ends it; three 笑筊 end it too (the question needs rewriting first)
    const nS = next.filter((x) => x === "sheng").length, nX = next.filter((x) => x === "xiao").length;
    const over = rule === 1 || s === "yin" || nS === 3 || nX === 3;
    if (!over) return;
    setDone(true); setLocked(false);
    let token: string | null = null;
    if (key) {
      // 10-17 承接: kept on our side so the cast that follows can carry it
      try {
        const r = await fetch("/api/jiaobei/ask", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question: key, rule, seq: next, locale }) });
        const j = (await r.json().catch(() => ({}))) as { token?: string };
        if (r.ok && j.token) token = j.token;
      } catch { /* the links still carry the question */ }
      setTk(token);
      rec[key] = { t: Date.now(), sign: s, seq: next, rule, ...(token ? { tk: token } : {}) }; write(ASK_KEY, rec);
    }
    track("jiaobei", { locale, method: rule === 1 ? `ask:${s}` : nS === 3 ? "ask3:sheng3" : `ask3:${s}@${next.length}` });
  };
  const retoss = () => { allowOnce.current = true; setRetossed(true); setSeq([]); setDone(false); t.setState("waiting"); track("jiaobei", { locale, method: "retoss" }); };
  const reset = () => { setQ(""); setTk(null); setSeq([]); setDone(false); setLocked(false); setRetossed(false); t.setState("waiting"); };
  const qs = cleanQuestion(q);
  // the cast page shows what was tossed (jbs, words only) and the request carries the kept result (jb)
  const jbs = final === "sheng" ? (rule === 3 ? "s3" : "s") : final === "yin" ? "y" : "x";
  const castHref = `/${locale}/cast?${new URLSearchParams({ ...(qs ? { q: qs } : {}), ...(tk ? { jb: tk, jbs } : {}), c: "jiaobei" }).toString()}`;
  const qqHref = `/${locale}/qiuqian${qs ? `?q=${encodeURIComponent(qs)}` : ""}`;
  const threeLabel = region === "cn" ? ui.ruleThreeCn : region === "hk" ? ui.ruleThreeHk : ui.ruleThreeTw;
  const started = seq.length > 0;
  const head = final === null ? null
    : confirmed3 ? { name: ui.threeOk, line: ui.threeOkLine }
    : rule === 3 && final === "sheng" ? null
    : { name: rule === 3 ? `${ui.signs[final].name}（${fill(ui.stopAt, { n: seq.length })}）` : ui.signs[final].name, line: rule === 3 && final === "yin" ? ui.yinStop : ui.signs[final].line };
  const goodEnd = final === "sheng"; // one 聖筊 (rule 1) or three in a row

  return (
    <div className="mt-[var(--s-5)]">
      <label className="t-small block text-[var(--ink-66)]" htmlFor="jb-q">{ui.qLabel}</label>
      <input id="jb-q" value={q} onChange={(e) => { setQ(e.target.value); if (done && final !== "xiao") { setSeq([]); setDone(false); setLocked(false); } }}
        placeholder={ui.qPh} maxLength={80} disabled={started && !done && last !== "xiao"}
        className="mt-2 w-full border border-[var(--ink-16)] rounded-[2px] px-3 py-2.5 bg-transparent t-body" />
      <fieldset className="mt-[var(--s-3)]" disabled={started && !done}>
        <legend className="t-small text-[var(--ink-66)]">{ui.ruleLabel}</legend>
        <div className="mt-1 flex flex-col sm:flex-row gap-x-5 gap-y-1">
          {([1, 3] as const).map((r) => (
            <label key={r} className="t-small flex items-center gap-2 cursor-pointer">
              <input type="radio" name="jb-rule" checked={rule === r} onChange={() => pickRule(r)} />
              {r === 3 ? threeLabel : ui.ruleOneAsk}
            </label>
          ))}
        </div>
      </fieldset>
      <Jiaobei3D blocks={t.blocks} state={t.state} tossKey={t.key} instant={t.instant} onSettled={t.onSettled} sound={[ui.soundOn, ui.soundOff]} />
      {rule === 3 && started && (
        <p className="text-center t-small !text-[var(--ink-66)] tracking-[0.1em]" aria-live="polite">
          {seq.map((x, i) => <span key={i} className={x === "sheng" ? "!text-[var(--cinnabar)]" : ""}>{i ? " · " : ""}{ui.signs[x].name}</span>)}
        </p>
      )}
      {!done && rule === 3 && last === "xiao" && t.state === "still" && (
        <p className="text-center t-body mt-2" aria-live="polite">{ui.xiaoGoOn}</p>
      )}
      {!done && (
        <div className="text-center mt-[var(--s-4)]">
          <button type="button" onClick={go} disabled={t.state === "tossing"}
            className="min-h-[var(--s-6)] px-8 py-3 rounded-[2px] bg-[var(--ink)] text-[var(--paper)] text-[14px] tracking-[0.14em]" data-heat="jiaobei-toss">
            {t.state === "tossing" ? ui.tossing : started ? fill(ui.nextToss, { have: sheng, n: seq.length + 1 }) : ui.tossBtn}
          </button>
        </div>
      )}
      {head && final && t.state === "still" && (
        <div className="mt-[var(--s-4)] text-center" aria-live="polite">
          <p className="t-d2 !text-[var(--cinnabar)]">{head.name}</p>
          <p className="t-body mt-2">{head.line}</p>
          {locked && <p className="t-small mt-2 !text-[var(--ink-45)]">{ui.same}</p>}
          {/* 10-22 进度表 86 承接地圖 (设计稿第 3 節): 聖筊 → 求籤 first (「聖筊了，抽一支籤看更多」), the cast a quiet second;
              陰筊 → 六爻 (「方向還沒確認，起一卦看哪幾天有動靜」); 笑筊 → only the rewritten question. 問事 tools never point at each
              other for the same matter, so the tarot link after a 陰筊 is gone. */}
          {goodEnd && (
            <>
              {qiuqian ? <><p className="t-small mt-[var(--s-4)] !text-[var(--ink-66)]">{ui.shengLead}</p>
              <p className="mt-[var(--s-2)]">
                <a href={qqHref} data-heat="jiaobei-qiuqian-sheng" onClick={() => track("jiaobei", { locale, method: "to_qiuqian" })}
                  className="inline-block min-h-[var(--s-6)] px-7 py-3 rounded-[2px] bg-[var(--ink)] text-[var(--paper)] tracking-[0.12em] text-[13px] hover:opacity-90 transition">{ui.toQiuqianBtn}</a>
              </p>
              <p className="mt-[var(--s-3)]"><a href={castHref} data-heat="jiaobei-cast-sheng" onClick={() => track("jiaobei", { locale, method: `to_cast:${jbs}` })} className="t-small underline underline-offset-4">{ui.toCastQuiet}</a></p></>
              : <p className="mt-[var(--s-4)]"><a href={castHref} data-heat="jiaobei-cast-sheng" onClick={() => track("jiaobei", { locale, method: `to_cast:${jbs}` })}
                className="inline-block min-h-[var(--s-6)] px-7 py-3 rounded-[2px] bg-[var(--ink)] text-[var(--paper)] tracking-[0.12em] text-[13px] hover:opacity-90 transition">{ui.toCastSheng}</a></p>}
            </>
          )}
          {final === "yin" && (
            <p className="mt-[var(--s-4)]">
              <a href={castHref} data-heat="jiaobei-cast-yin" onClick={() => track("jiaobei", { locale, method: `to_cast:${jbs}` })}
                className="inline-block min-h-[var(--s-6)] px-7 py-3 rounded-[2px] bg-[var(--ink)] text-[var(--paper)] tracking-[0.12em] text-[13px] hover:opacity-90 transition">{ui.toCastYin}</a>
            </p>
          )}
          {final === "xiao" && (
            <div className="mt-[var(--s-4)] text-left max-w-[30rem] mx-auto">
              <p className="t-small text-[var(--ink-66)]">{ui.examplesHead}</p>
              <ul className="t-small mt-2 flex flex-col gap-1 text-[var(--ink-66)]">{ui.examples.map((x) => <li key={x}>{x}</li>)}</ul>
              {!retossed && !locked && <p className="mt-[var(--s-3)] text-center"><button type="button" onClick={retoss} className="underline underline-offset-4 t-body">{ui.again}</button></p>}
              <p className="mt-[var(--s-2)] text-center"><a href={`/${locale}/how-to-ask`} onClick={() => track("jiaobei", { locale, method: "to_howto" })} className="t-small underline underline-offset-4 !text-[var(--ink-66)]">{ui.howToAsk}</a></p>
            </div>
          )}
          {/* 10-26: a love question → 正緣畫像 (or 合盤), with a sentence written for it */}
          {final !== "xiao" && <div className="text-left max-w-[30rem] mx-auto"><LoveBridge locale={locale} question={q} surface="jiaobei" /></div>}
          <p className="mt-[var(--s-4)]"><button type="button" onClick={reset} className="t-small underline underline-offset-4 !text-[var(--ink-45)]">{ui.newMatter}</button></p>
        </div>
      )}
    </div>
  );
}

type Temple = { id: string; name: string; set: string; setName: string; count: number };
type Step = "ask" | "request" | "draw" | "confirm" | "done" | "out";

export function Qiuqian({ locale, ui, temples, initialQ }: { locale: string; ui: JiaobeiUi; temples: Temple[]; initialQ: string }) {
  const [temple, setTemple] = useState(temples[0]!.id);
  const [q, setQ] = useState(initialQ);
  const [step, setStep] = useState<Step>("ask");
  const [tries, setTries] = useState(0);
  // 10-23 进度表 106 ②: lots put back before one was confirmed — filed with the confirmed lot
  const [redraws, setRedraws] = useState(0);
  const [num, setNum] = useState<number | null>(null);
  const [have, setHave] = useState(0);
  const [msg, setMsg] = useState<string | null>(null);
  const [prior, setPrior] = useState<{ set: string; num: number } | null>(null);
  const t = useToss();
  const T = temples.find((x) => x.id === temple)!;
  const need = confirmsNeeded(temple);
  const qs = cleanQuestion(q);

  useEffect(() => {
    if (!qs) { setPrior(null); return; }
    const r = fresh(read<QqRec>(QQ_KEY))[qs];
    setPrior(r ? { set: r.set, num: r.num } : null);
  }, [qs]);

  const request = async () => {
    setStep("request");
    const s = await t.run();
    if (!s) return;
    const n = tries + 1; setTries(n);
    if (s === "sheng") { setMsg(ui.requestOk); setStep("draw"); track("jiaobei", { locale, method: "qq_request:ok", tier: T.set }); return; }
    if (n >= REQUEST_TRIES) { setMsg(ui.requestOut); setStep("out"); track("jiaobei", { locale, method: "qq_request:out", tier: T.set }); return; }
    setMsg(fill(ui.requestNo, { n })); track("jiaobei", { locale, method: "qq_request:no", tier: T.set });
  };
  const draw = async () => {
    const n = drawLot(T.count);
    if (!reduced()) await wait(700);
    setNum(n); setHave(0); setMsg(null); setStep("confirm"); t.setState("waiting");
    track("jiaobei", { locale, method: "qq_draw", tier: T.set });
  };
  const confirm = async () => {
    const s = await t.run();
    if (!s) return;
    if (s !== "sheng") { setMsg(ui.confirmFail); setNum(null); setHave(0); setRedraws((r) => r + 1); setStep("draw"); track("jiaobei", { locale, method: "qq_confirm:fail", tier: T.set }); return; }
    const h = have + 1; setHave(h);
    track("jiaobei", { locale, method: "qq_confirm:ok", tier: T.set });
    if (h >= need) {
      setMsg(ui.confirmed); setStep("done");
      if (qs) { const r = fresh(read<QqRec>(QQ_KEY)); r[qs] = { t: Date.now(), set: T.set, num: num! }; write(QQ_KEY, r); }
      track("jiaobei", { locale, method: "qq_done", tier: T.set });
      // 10-23 进度表 106 ②: the confirmed lot is filed on our side (temple, lot, 请示几次, lots put back, the matter if written)
      void fetch("/api/qiuqian/log", { method: "POST", headers: { "Content-Type": "application/json" }, keepalive: true,
        body: JSON.stringify({ temple: T.id, num, asks: tries, redraws, question: qs || null, locale }) }).catch(() => undefined);
    } else setMsg(fill(ui.progress, { have: h, need }));
  };
  // 10-30 进度表 128 ⑤: in another language the lot page is that language's own (/ja/qian/sensoji/n, /en/qian/guanyin/n)
  const lotHref = (set: string, n: number) => (locale === "zh" || locale === "zh-hant" ? `${qianPath(n, set)}?c=qiuqian` : `/${locale}/qian/${set}/${n}?c=qiuqian`);

  return (
    <div className="mt-[var(--s-5)]">
      <label className="t-small block text-[var(--ink-66)]" htmlFor="qq-t">{ui.templeLabel}</label>
      <select id="qq-t" value={temple} disabled={step !== "ask"} onChange={(e) => setTemple(e.target.value)}
        className="mt-2 w-full border border-[var(--ink-16)] rounded-[2px] px-3 py-2.5 bg-transparent t-body">
        {temples.map((x) => <option key={x.id} value={x.id}>{locale === "zh" || locale === "zh-hant" ? `${x.name}（${x.setName}）` : x.setName ? `${x.name} (${x.setName})` : x.name}</option>)}
      </select>
      <label className="t-small block mt-[var(--s-4)] text-[var(--ink-66)]" htmlFor="qq-q">{ui.qqLabel}</label>
      <input id="qq-q" value={q} disabled={step !== "ask"} onChange={(e) => setQ(e.target.value)} placeholder={ui.qqPh} maxLength={80}
        className="mt-2 w-full border border-[var(--ink-16)] rounded-[2px] px-3 py-2.5 bg-transparent t-body" />

      {prior && step === "ask" ? (
        <p className="t-body mt-[var(--s-5)]">{ui.sameDay}<a className="underline underline-offset-4 ml-1" href={lotHref(prior.set, prior.num)} onClick={() => track("jiaobei", { locale, method: "qq_same" })}>{fill(ui.goLot, { n: prior.num })}</a></p>
      ) : (
        <>
          <p className="t-small mt-[var(--s-5)] text-[var(--ink-66)]">{step === "confirm" && num ? `${fill(ui.drawn, { n: num })} · ${need === 3 ? ui.ruleThree : ui.ruleOne}` : ui.step1}</p>
          <Jiaobei3D blocks={t.blocks} state={t.state} tossKey={t.key} instant={t.instant} onSettled={t.onSettled} sound={[ui.soundOn, ui.soundOff]} />
          {msg && <p className="t-body text-center mt-[var(--s-3)]" aria-live="polite">{msg}</p>}
          <div className="text-center mt-[var(--s-4)]">
            {(step === "ask" || step === "request") && (
              <button type="button" onClick={request} disabled={t.state === "tossing"} className="min-h-[var(--s-6)] px-8 py-3 rounded-[2px] bg-[var(--ink)] text-[var(--paper)] text-[14px] tracking-[0.14em]" data-heat="qiuqian-request">
                {t.state === "tossing" ? ui.tossing : ui.requestBtn}
              </button>
            )}
            {step === "draw" && (
              <button type="button" onClick={draw} className="min-h-[var(--s-6)] px-8 py-3 rounded-[2px] bg-[var(--cinnabar)] text-[var(--paper)] text-[14px] tracking-[0.14em]" data-heat="qiuqian-draw">{ui.drawBtn}</button>
            )}
            {step === "confirm" && (
              <button type="button" onClick={confirm} disabled={t.state === "tossing"} className="min-h-[var(--s-6)] px-8 py-3 rounded-[2px] bg-[var(--ink)] text-[var(--paper)] text-[14px] tracking-[0.14em]" data-heat="qiuqian-confirm">
                {t.state === "tossing" ? ui.tossing : ui.confirmBtn}
              </button>
            )}
            {step === "done" && num && (
              <a href={lotHref(T.set, num)} className="inline-block min-h-[var(--s-6)] px-8 py-3 rounded-[2px] bg-[var(--cinnabar)] text-[var(--paper)] text-[14px] tracking-[0.1em]" data-heat="qiuqian-go">{fill(ui.goLot, { n: num })}</a>
            )}
          </div>
        </>
      )}
      <p className="t-small mt-[var(--s-5)] !text-[var(--ink-45)]">{ui.notReplace}</p>
    </div>
  );
}
