import { cookies } from "next/headers";
import { ADMIN_COOKIE, isAdmin } from "@/lib/admin-auth";
import { homeMinute } from "@/lib/clock";
import { monthLetterSplit } from "@/lib/month-letter-generic";
import { AUTO_LETTERS, autoLetterSends, autoLetters, letterStops, MAIL_NAME, mailKinds, mailsOfKind } from "@/lib/admin-letters";
import { AUTO_MAILS, autoMail, autoMailStats, renderSample, SAMPLE_READER, sampleReaders, switchState } from "@/lib/auto-mail";
import { AdminLogin, AdminShell, Legend, Section, Stat } from "../ui";

export const dynamic = "force-dynamic";

/**
 * 10-22 进度表 94 第三批 「信件」: the letters that go out by themselves — sent, opened, stopped — and every kind of mail
 * under its current name. A line opens the letters behind it. Opens are a hint only (Gmail preloads images; Apple Mail
 * marks every letter opened).
 */

const th = "py-2 pr-3 font-normal text-xs opacity-50 whitespace-nowrap text-left";
const td = "py-2 pr-3 whitespace-nowrap align-top tabular-nums";
const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "—");
const SEND_STATUS: Record<string, string> = { sent: "已寄", failed: "失败", skipped: "跳过", pending: "寄送中" };
const SKIP_WHY: Record<string, string> = { no_change: "这年没有换大运", no_chart: "没有盘", write: "没写出来", inactive: "已经不是会员" };

export default async function LettersPage({ searchParams }: { searchParams: Promise<{ key?: string; denied?: string; test?: string; l?: string; k?: string; p?: string; r?: string; done?: string; failed?: string }> }) {
  const { key, denied, test, l, k, p, r: readerParam, done, failed } = await searchParams;
  if (!(await isAdmin((await cookies()).get(ADMIN_COOKIE)?.value, key))) return <AdminLogin denied={denied === "1"} back="/admin/letters" />;
  const now = Date.now();
  // 10-23 进度表 108 ①: every letter that goes out by itself — its switch, its sample, its week
  const site = (process.env.SITE_URL ?? "https://yaoflow.com").replace(/\/$/, "");
  const readers = sampleReaders();
  const reader = readers.find((x) => String(x.id) === readerParam) ?? readers[0] ?? SAMPLE_READER;
  const shown = p ? autoMail(p) : null;
  const sample = shown ? await renderSample(shown, reader, site, now) : null;
  const groups = [...new Set(AUTO_MAILS.map((m) => m.group))];
  const showTest = test === "1";
  const auto = autoLetters(now, showTest);
  const stops = letterStops(now);
  const mo = monthLetterSplit(new Date(now + 8 * 3_600_000).toISOString().slice(0, 7));
  const kinds = mailKinds(now, showTest);
  const q = (extra: Record<string, string | null>) => {
    const u = new URLSearchParams();
    if (showTest) u.set("test", "1");
    if (l) u.set("l", l);
    if (k) u.set("k", k);
    for (const [kk, v] of Object.entries(extra)) { if (v == null) u.delete(kk); else u.set(kk, v); }
    const s = u.toString();
    return `/admin/letters${s ? `?${s}` : ""}`;
  };
  const letter = l ? AUTO_LETTERS.find((x) => x.id === l) ?? null : null;
  const sends = letter ? autoLetterSends(letter.id, showTest) : null;
  const mails = k && /^[a-z_]{1,40}$/.test(k) ? mailsOfKind(k, showTest) : null;
  return (
    <AdminShell
      title="自动寄的信"
      nav={[{ href: "#manage", label: "开关与样信" }, ...(shown ? [{ href: "#preview", label: `样信 · ${shown.name}` }] : []), { href: "#auto", label: "每天／每月的信" }, ...(sends ? [{ href: "#sends", label: letter!.name }] : []), { href: "#kinds", label: "所有信件" }, ...(mails ? [{ href: "#mails", label: MAIL_NAME[k!] ?? k! }] : [])]}
      right={<a href={q({ test: showTest ? null : "1" })} className="opacity-60 underline underline-offset-4">{showTest ? "隐藏自测" : "含自测"}</a>}
    >
      {done && <p className="text-sm mb-6 text-emerald-700">{done}</p>}
      {failed && <p className="text-sm mb-6 text-[var(--cinnabar)]">{failed}</p>}

      {/* 10-23 进度表 108 ①: one line per letter — when, its week, its switch, its sample */}
      <Section id="manage" title="开关与样信" sub="近 7 天 · 不含测试帐号 · 退订＝收到这封信以后一周内退订的 · 点「样信」看这一封现在长什么样">
        {groups.map((g) => (
          <div key={g} className="mb-6">
            <p className="text-xs opacity-50 mb-1">{g}</p>
            <div className="overflow-x-auto -mx-4 px-4">
              <table className="w-full text-sm min-w-[52rem]">
                <thead><tr><th className={th}>信</th><th className={th}>什么时候寄</th><th className={th}>寄出</th><th className={th}>打开</th><th className={th}>退订</th><th className={th}>退信／投诉</th><th className={th}>失败</th><th className={th}>开关</th></tr></thead>
                <tbody>
                  {AUTO_MAILS.filter((m) => m.group === g).map((m) => {
                    const s = autoMailStats(m, now);
                    const sw = switchState(m);
                    const firstOfSwitch = !!m.switchId && AUTO_MAILS.find((x) => x.switchId === m.switchId)!.id === m.id;
                    return (
                      <tr key={m.id} className={`border-t border-black/5 align-top ${p === m.id ? "bg-[var(--gold)]/[0.08]" : ""} ${sw && !sw.on ? "opacity-60" : ""}`}>
                        <td className="py-2 pr-3"><a className="underline underline-offset-4" href={`${q({ p: m.id, r: reader.id ? String(reader.id) : null })}#preview`}>{m.name}</a><span className="ml-2 text-xs opacity-50">样信</span>{m.statsNote ? <span className="block text-[11px] opacity-40">{m.statsNote}</span> : null}</td>
                        <td className="py-2 pr-3 text-xs opacity-60 max-w-[14rem]">{m.when}</td>
                        <td className={td}>{s.sent || "—"}</td>
                        <td className={td}>{s.sent ? `${s.opened}（${pct(s.opened, s.sent)}）` : "—"}</td>
                        <td className={`${td} ${s.unsub ? "" : "opacity-40"}`}>{s.unsub || "—"}</td>
                        <td className={`${td} ${s.bad ? "text-[var(--cinnabar)]" : "opacity-40"}`}>{s.bad || "—"}</td>
                        <td className={`${td} ${s.failed ? "text-[var(--cinnabar)]" : "opacity-40"}`}>{s.failed || "—"}</td>
                        <td className="py-2 pr-3 text-xs">
                          {!sw ? <span className="opacity-50" title={m.noSwitch}>不能关 · {m.noSwitch}</span>
                            : !firstOfSwitch ? <span className="opacity-50">跟上面一起{sw.on ? "开着" : "关着"}</span>
                            : (
                              <details>
                                <summary className={`cursor-pointer ${sw.on ? "text-emerald-700" : "text-[var(--cinnabar)]"}`}>{sw.on ? "开着" : `关着${sw.since ? `（${homeMinute(sw.since).slice(5)} 起）` : ""}`} ▾</summary>
                                <form method="post" action="/api/admin/letters" className="mt-2 flex flex-col gap-1.5 w-56">
                                  <input type="hidden" name="id" value={m.switchId!} />
                                  <input type="hidden" name="on" value={sw.on ? "0" : "1"} />
                                  <input name="reason" required minLength={2} placeholder="为什么（进操作记录）" className="bg-transparent border border-black/20 rounded-[2px] px-2 py-1" />
                                  <label className="flex items-center gap-1.5"><input type="checkbox" name="confirm" value="yes" required /> 确认{sw.on ? "关掉" : "打开"}</label>
                                  <button className={`px-2 py-1 rounded-[2px] border ${sw.on ? "border-[var(--cinnabar)] text-[var(--cinnabar)]" : "border-emerald-600 text-emerald-700"}`}>{sw.on ? "关掉这封信" : "打开这封信"}</button>
                                </form>
                              </details>
                            )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ))}
        <Legend>关掉以后这封信的定时任务什么都不寄（15 秒内生效、不用部署）；再打开时，按各自的规矩接着寄——每天的信那几天就没有了，排着的回访会在打开后的下一轮寄出（应期过了两周以上的照旧不再补问）。开通信、关续订确认、年付续费预告是读者做了一件事或法规要求的信，不在这里关。信的文字改动照旧走开发。</Legend>
      </Section>

      {shown && (
        <Section id="preview" title={`样信 · ${shown.name}`} sub={reader.id ? `写给测试帐号 #${reader.id}（${reader.locale === "zh" ? "简体" : "繁体"} · ${reader.currency}）` : "没有测试帐号，用样本读者"}>
          <form method="get" action="/admin/letters" className="flex flex-wrap items-center gap-2 text-sm mb-3">
            <input type="hidden" name="p" value={shown.id} />
            {showTest && <input type="hidden" name="test" value="1" />}
            <span className="text-xs opacity-50">换一位测试读者</span>
            <select name="r" defaultValue={reader.id ? String(reader.id) : ""} className="bg-transparent border border-black/20 rounded-[2px] px-2 py-1">
              {readers.map((x) => <option key={x.id!} value={String(x.id)}>#{x.id} · {x.locale === "zh" ? "简体" : "繁体"} · {x.currency}</option>)}
            </select>
            <button className="px-2 py-1 rounded-[2px] border border-black/30">换</button>
            <a className="ml-auto text-xs underline underline-offset-4 opacity-60" href={q({ p: null, r: null })}>收起</a>
          </form>
          {sample && "error" in sample
            ? <p className="text-sm text-[var(--cinnabar)]">这封样信生成不出来：{sample.error}</p>
            : sample && (
              <>
                <p className="text-sm mb-2">主旨：{sample.subject}</p>
                <iframe srcDoc={sample.html} sandbox="" title={shown.name} className="w-full max-w-2xl h-[640px] border border-black/10 rounded-[2px] bg-white" />
              </>
            )}
          <Legend>用这位测试读者自己的卦（回访、应期、存卦那几封）或自己的籤（今日一籤）来写；他没有的，用样本内容。信尾的公司地址在寄出时才加上。</Legend>
        </Section>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-10">
        <Stat label="会员信一键停了" value={stops.off} sub={`近 30 天 ${stops.off30} 人 · 每日信、流月信、大运交接、年书关键月一起停`} />
        <Stat label="订了今日一籤信" value={stops.tqOn} sub="会员的那一封由每日信带，不重复寄" />
        <Stat label="近 7 天寄出（这几种）" value={auto.reduce((a, r) => a + r.sent7, 0)} sub={`失败 ${auto.reduce((a, r) => a + r.failed7, 0)}`} good={auto.every((r) => r.failed7 === 0)} />
      </div>
      <Section id="auto" title="每天／每月的信" sub="寄出 · 打开（30 天）· 失败与跳过（7 天）· 点一行看这封信寄给了谁">
        <div className="overflow-x-auto -mx-4 px-4">
          <table className="w-full text-sm min-w-[48rem]">
            <thead><tr><th className={th}>信</th><th className={th}>什么时候寄</th><th className={th}>7 天寄出</th><th className={th}>30 天寄出</th><th className={th}>30 天打开</th><th className={th}>7 天失败</th><th className={th}>7 天跳过</th></tr></thead>
            <tbody>
              {auto.map((r) => (
                <tr key={r.id} className={`border-t border-black/5 ${l === r.id ? "bg-[var(--gold)]/[0.08]" : ""}`}>
                  <td className={`${td} font-sans`}><a className="underline underline-offset-4" href={`${q({ l: r.id })}#sends`}>{r.name}</a></td>
                  <td className="py-2 pr-3 align-top text-xs opacity-60">{r.when}</td>
                  <td className={td}>{r.sent7 || "—"}</td><td className={td}>{r.sent30 || "—"}</td>
                  <td className={td}>{r.sent30 ? `${r.opened30}（${pct(r.opened30, r.sent30)}）` : "—"}</td>
                  <td className={`${td} ${r.failed7 ? "text-[var(--cinnabar)]" : "opacity-40"}`}>{r.failed7 || "—"}</td>
                  <td className={`${td} opacity-60`}>{r.skipped7 || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {/* 11-01 进度表 133: the month letter by version — personal (their own chart) or shared (no chart; with the 「補上出生資料」 button) */}
        <p className="text-sm mt-3">流月信 · {mo.ym}：个人版 <b>{mo.personal}</b> · 通用版 <b>{mo.generic}</b> · 跳过 <b>{mo.skipped}</b> <span className="opacity-60">· 通用版「补上出生资料」点了 {mo.clicked} 人，点后 7 天内有了命盘 {mo.charted} 人</span></p>
        <Legend>跳过 = 到了该寄的时候没寄（例如大运那年没有换运、没有八字档案）。这几封信在邮件服务商那边同属「每天寄的信」一类，打开数按每封信自己的编号对回来。打开只作参考：Gmail 会预载图片、Apple 邮件会把所有信标成已打开。{showTest ? "现在含测试账号。" : "不含测试账号。"}</Legend>
      </Section>
      {sends && (
        <Section id="sends" title={letter!.name} sub={`最近 ${sends.length} 封`}>
          {sends.length === 0 ? <p className="text-sm opacity-50">还没寄过。</p> : (
            <div className="overflow-x-auto -mx-4 px-4">
              <table className="w-full text-sm min-w-[36rem]">
                <thead><tr><th className={th}>时间</th><th className={th}>客户</th><th className={th}>结果</th><th className={th}>打开</th></tr></thead>
                <tbody>
                  {sends.map((s, i) => (
                    <tr key={i} className="border-t border-black/5">
                      <td className={`${td} opacity-70`}>{homeMinute(s.at).slice(5)}</td>
                      <td className={td}>{s.customerId ? <a className="underline underline-offset-4" href={`/admin/customers/${s.customerId}`}>#{s.customerId}</a> : <span className="opacity-40">—</span>}</td>
                      <td className={`${td} ${s.status === "failed" ? "text-[var(--cinnabar)]" : ""}`}>{SEND_STATUS[s.status] ?? s.status}{s.detail ? <span className="opacity-50 ml-1">（{SKIP_WHY[s.detail] ?? s.detail.slice(0, 40)}）</span> : null}</td>
                      <td className={`${td} opacity-70`}>{s.opened ? homeMinute(s.opened).slice(5) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="text-sm mt-3"><a className="underline underline-offset-4" href={q({ l: null })}>收起</a></p>
        </Section>
      )}
      <Section id="kinds" title="所有信件" sub="近 7 天与 30 天 · 按现在的名字 · 点一行看最近寄出的">
        <div className="overflow-x-auto -mx-4 px-4">
          <table className="w-full text-sm min-w-[44rem]">
            <thead><tr><th className={th}>信件</th><th className={th}>7 天</th><th className={th}>30 天</th><th className={th}>送达</th><th className={th}>打开</th><th className={th}>退信／投诉／失败</th></tr></thead>
            <tbody>
              {kinds.map((r) => (
                <tr key={r.kind} className={`border-t border-black/5 ${k === r.kind ? "bg-[var(--gold)]/[0.08]" : ""}`}>
                  <td className="py-2 pr-3 align-top"><a className="underline underline-offset-4" href={`${q({ k: r.kind })}#mails`}>{r.name}</a>{r.name === r.kind ? null : <span className="ml-2 text-[11px] opacity-30 font-mono">{r.kind}</span>}</td>
                  <td className={td}>{r.n7 || "—"}</td><td className={td}>{r.n30}</td>
                  <td className={td}>{pct(r.delivered30, r.n30)}</td><td className={td}>{pct(r.opened30, r.n30)}</td>
                  <td className={`${td} ${r.bad30 ? "text-[var(--cinnabar)]" : "opacity-40"}`}>{r.bad30 || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Legend>来自邮件服务商的回报（Resend webhook）。「额度刷新」10-22 起已停（会员不限次，没有额度可刷新）；「单月到期提醒」现在叫「通卡到期提醒」。</Legend>
      </Section>
      {mails && (
        <Section id="mails" title={MAIL_NAME[k!] ?? k!} sub={`最近 ${mails.length} 封`}>
          {mails.length === 0 ? <p className="text-sm opacity-50">没有。</p> : (
            <div className="overflow-x-auto -mx-4 px-4">
              <table className="w-full text-sm min-w-[40rem]">
                <tbody>
                  {mails.map((m, i) => (
                    <tr key={i} className="border-t border-black/5 align-top">
                      <td className={`${td} opacity-70`}>{homeMinute(m.at).slice(5)}</td>
                      <td className={td}>{m.customerId ? <a className="underline underline-offset-4" href={`/admin/customers/${m.customerId}`}>#{m.customerId}</a> : <span className="opacity-40">—</span>}</td>
                      <td className="py-2 pr-3 text-xs opacity-70 max-w-[22rem] truncate">{m.subject ?? ""}</td>
                      <td className={`${td} ${m.bad ? "text-[var(--cinnabar)]" : "opacity-70"}`}>{m.state}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="text-sm mt-3"><a className="underline underline-offset-4" href={q({ k: null })}>收起</a></p>
        </Section>
      )}
    </AdminShell>
  );
}
