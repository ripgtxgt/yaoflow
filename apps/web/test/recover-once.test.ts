import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/**
 * 10-04 挽回信 (Neil: 「91人你现在全部补发一封」): one letter, once, to everyone who left an address on the way to Stripe
 * and never paid. Who is written to, which letter they get, what it says, and that the figure comes back from its link.
 */
const llm = vi.hoisted(() => ({ text: [] as string[] }));
vi.mock("../src/lib/llm", async (orig) => {
  const real = await orig<typeof import("../src/lib/llm")>();
  return { ...real, chatText: vi.fn(async () => { const v = llm.text.shift(); if (v === undefined) throw new Error("no model in tests"); return v; }) };
});

const { db, upsertCustomer, savedCastsDue, savedCastsByEmailSince, savedCastByToken, recordEmail } = await import("../src/lib/db");
const { planRecover, recoverMailFor, sendRecover, castDateLabel, normLocale, quoteOf, RECOVER_ONCE_KIND } = await import("../src/lib/recover-once");
const { buildRecoverEmail } = await import("../src/lib/email");
const { RECOVER_T } = await import("../src/lib/dict/recover");
const { LOCALES } = await import("../src/lib/locales");
const { GET: savedGET } = await import("../src/app/api/cast/saved/route");
import type { ListedSession } from "../src/lib/stripe";

const DAY = 86_400_000;
const NOW = Date.now();
const SITE = "https://yaoflow.com";
const CAST_AT = NOW - 6 * DAY;
const VALUES = "7,8,9,7,8,8";

let n = 0;
function session(email: string | null, meta: Record<string, string>, over: Partial<ListedSession> = {}): ListedSession {
  n += 1;
  return {
    id: `cs_test_${n}`, url: null, mode: "payment", payment_status: "unpaid", status: "expired", created: Math.floor((NOW - 5 * DAY) / 1000) + n,
    metadata: meta, customer_details: email ? { email } : null, customer_email: null, currency: "twd", amount_total: 7500, ...over,
  } as ListedSession;
}
const cast = (extra: Record<string, string> = {}) => ({ tier: "deep", locale: "zh-hant", question: "這次面試能過嗎", values: VALUES, castAtMs: String(CAST_AT), tz: "480", tzname: "Asia/Taipei", country: "TW", ...extra });

beforeAll(() => {
  const d = db();
  // a light reading given free (a grant) whose upgrade showed US$2.99
  const up = upsertCustomer("up@example.com", "zh-hant");
  d.prepare("INSERT INTO grants (token, kind, tier, created_at, expires_at, used_at, redeem_session_id, input_json, claimed_email, claimed_customer_id) VALUES (?,?,?,?,?,?,?,?,?,?)")
    .run("tok_up", "invite_light", "one", CAST_AT, CAST_AT + DAY, CAST_AT, "gr_tok_up", JSON.stringify({ question: "這次面試能過嗎", values: [7, 8, 9, 7, 8, 8], castAtMs: CAST_AT, tzOffsetMinutes: 480 }), "up@example.com", up);
  // someone who paid since — never written to
  const paid = upsertCustomer("paid@example.com", "zh-hant");
  d.prepare("INSERT INTO orders (session_id, customer_id, created_at, tier, amount_cents, currency, email, status, payment_state) VALUES (?,?,?,?,?,?,?,?,?)")
    .run("cs_paid", paid, NOW - DAY, "deep", 7500, "TWD", "paid@example.com", "paid", "paid");
  // a reader in the UK: one who said yes to our mail, one who did not
  upsertCustomer("uk-yes@example.com", "en");
  d.prepare("UPDATE customers SET marketing_ok = 1, marketing_at = ? WHERE email = ?").run(NOW - 9 * DAY, "uk-yes@example.com");
  upsertCustomer("uk-no@example.com", "en");
  // unsubscribed (unticked after saying yes)
  upsertCustomer("out@example.com", "zh-hant");
  d.prepare("UPDATE customers SET marketing_ok = 0, marketing_at = ? WHERE email = ?").run(NOW - 9 * DAY, "out@example.com");
  // already written to
  recordEmail("recover:cs_old", RECOVER_ONCE_KIND, "done@example.com", "sent", "re_x");
  // saved this cast to their own mailbox — that letter promised one reminder only
  d.prepare("INSERT INTO saved_casts (token, email, locale, question, values_json, cast_at, tz_offset, created_at) VALUES (?,?,?,?,?,?,?,?)")
    .run("a".repeat(48), "saver@example.com", "zh-hant", "這次面試能過嗎", "[7,8,9,7,8,8]", CAST_AT, 480, NOW - 5 * DAY);
});

afterEach(() => vi.unstubAllGlobals());

function sessions(): ListedSession[] {
  return [
    session("up@example.com", { ...cast(), upgrade: "1", currency: "USD" }, { currency: "usd", amount_total: 299 }),
    session("deep@example.com", cast({ teaser: "這件事會成，但要等對方先開口。", pageLocale: "zh-hant" })),
    session("cn@example.com", cast({ locale: "zh", tzname: "Asia/Shanghai", country: "JP", mp_reason: "cn-tz" }), { currency: "cny", amount_total: 990 }),
    session("member@example.com", { kind: "sub", locale: "zh-hant", tzname: "Asia/Hong_Kong", country: "HK" }, { mode: "subscription", currency: "hkd" }),
    session("pack@example.com", { kind: "pack", locale: "zh-hant", country: "TW" }),
    session("paid@example.com", cast()),
    session("open@example.com", cast(), { status: "open", created: Math.floor((NOW - 2 * 3_600_000) / 1000) }),
    session("uk-no@example.com", cast({ country: "GB", tzname: "Europe/London", locale: "en" }), { currency: "gbp" }),
    session("uk-yes@example.com", cast({ country: "GB", tzname: "Europe/London", locale: "en" }), { currency: "gbp" }),
    session("out@example.com", cast()),
    session("done@example.com", cast()),
    session("saver@example.com", cast()),
    session("health@example.com", cast({ question: "我手術後的病什麼時候會好" })),
    session(null, cast()),
  ];
}

describe("挽回信：写给谁、写哪一封", () => {
  it("plans one letter per never-paid reader, and says why the others get none", () => {
    const plan = planRecover(sessions(), NOW);
    const by = Object.fromEntries(plan.items.map((x) => [x.email, x]));
    expect(Object.keys(by).sort()).toEqual(["cn@example.com", "deep@example.com", "health@example.com", "member@example.com", "uk-yes@example.com", "up@example.com"]);
    expect(plan.skipped).toEqual({ pack: 1, paid: 1, still_open: 1, consent_region: 1, opted_out: 1, already_sent: 1, saved_promise: 1 });
    // the upgrade goes back to its light reading, in the reader's own money, with the US-dollar apology
    expect(by["up@example.com"]).toMatchObject({ group: "upgrade", lightSid: "gr_tok_up", currency: "TWD", usdSorry: true, locale: "zh-hant" });
    expect(by["deep@example.com"]).toMatchObject({ group: "deep", currency: "TWD", usdSorry: false, alipay: false });
    expect(by["deep@example.com"]!.cast!.teaser).toContain("要等對方先開口");
    // a mainland reader behind a Japanese exit: Simplified, yuan, Alipay
    expect(by["cn@example.com"]).toMatchObject({ group: "deep", locale: "zh", currency: "CNY", alipay: true });
    expect(by["member@example.com"]).toMatchObject({ group: "member", currency: "HKD" });
    // a health question is never quoted
    expect(by["health@example.com"]!.q).toBeNull();
    expect(by["deep@example.com"]!.q).toBe("這次面試能過嗎");
  });

  it("10-23 进度表 101: with the 通卡 open to everyone no single reading is sold, so a reading gets no letter — a membership still does", () => {
    const plan = planRecover(sessions(), NOW, true);
    expect(plan.items.map((x) => x.email)).toEqual(["member@example.com"]);
    expect(plan.skipped).toMatchObject({ single_retired: 6, pack: 1, paid: 1, still_open: 1, consent_region: 1, opted_out: 1, already_sent: 1 });
  });

  it("the letters: the right shape, prices in their money, nothing left unfilled, the question kept out of the subject", () => {
    const plan = planRecover(sessions(), NOW);
    const by = Object.fromEntries(plan.items.map((x) => [x.email, x]));
    const up = recoverMailFor(by["up@example.com"]!, SITE, false, NOW);
    expect(up.url).toBe(`${SITE}/zh-hant/reading?sid=gr_tok_up&c=recover1`);
    expect(up.text).toContain("幣別標價"); // 10-17: no longer retells the USD mistake
    expect(up.text).toContain("NT$75");
    expect(up.text).toContain("NT$269");
    expect(up.subject).not.toContain("面試");
    const cn = recoverMailFor(by["cn@example.com"]!, SITE, false, NOW);
    expect(cn.text).toContain("支付宝");
    expect(cn.text).toMatch(/¥9\.90|CN¥9\.90|¥9\.9/);
    const mem = recoverMailFor(by["member@example.com"]!, SITE, false, NOW);
    expect(mem.url).toBe(`${SITE}/zh-hant/account?tab=member&c=recover1`);
    expect(mem.text).toContain("HK$68");
    expect(mem.text).toContain("HK$88");
    for (const m of [up, cn, mem]) {
      expect(m.text).not.toMatch(/\{\w+\}/);
      expect(m.html).toContain("/api/unsub?");
    }
  });

  it("every language has every line, and each letter renders without a hole", () => {
    const keys = Object.keys(RECOVER_T.zh);
    for (const l of LOCALES) {
      const t = (RECOVER_T as unknown as Record<string, Record<string, string>>)[l]!;
      expect(Object.keys(t).sort(), l).toEqual([...keys].sort());
      for (const kind of ["upgrade", "deep", "member"] as const) {
        const m = buildRecoverEmail({ locale: l, kind, date: castDateLabel(CAST_AT, 480, l), q: "x?", hex: "X", url: "https://u", unsubUrl: "https://s", price: "1", full: "2", n: 5, month: "3", pass: "4", deep: 10, fu: 30, usdSorry: true, alipay: true });
        expect(m.text, `${l}/${kind}`).not.toMatch(/\{\w+\}/);
        expect(m.subject.length, `${l}/${kind}`).toBeGreaterThan(4);
      }
    }
    expect(castDateLabel(Date.UTC(2026, 8, 26, 20), 480, "zh-hant")).toBe("9月27日");
    expect(castDateLabel(Date.UTC(2026, 8, 26, 20), 480, "en")).toBe("September 27");
    expect(normLocale("zh-TW")).toBe("zh-hant");
    expect(normLocale("zh-CN")).toBe("zh");
    expect(normLocale("pt-BR")).toBe("pt");
    expect(quoteOf("x".repeat(80), "zh")!.length).toBe(31);
  });

  it("sends each letter once; the cast comes back from its link, with a free line written at the cast's own instant", async () => {
    process.env.RESEND_API_KEY = "re_test";
    const sent: { to: string; subject: string }[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: { body?: string }) => {
      if (String(url).includes("resend")) { const b = JSON.parse(init?.body ?? "{}"); sent.push({ to: b.to[0], subject: b.subject }); return new Response(JSON.stringify({ id: `re_${sent.length}` }), { status: 200 }); }
      throw new Error(`unexpected fetch ${url}`);
    }));
    const plan = planRecover(sessions(), NOW);
    const out = await sendRecover(plan, SITE, 500, 0);
    expect(out.sent).toBe(6);
    expect(out.byGroup).toEqual({ upgrade: 1, deep: 4, member: 1 });
    expect(sent.find((s) => s.to === "deep@example.com")!.subject).toContain("深斷還在");
    // a second run writes to no one
    const again = planRecover(sessions(), NOW);
    expect(again.items.length).toBe(0);
    expect(again.skipped.already_sent).toBe(7);

    // the deep reader's link: a saved-cast row of origin 'recover' — never counted as their own save, never followed up
    const row = db().prepare("SELECT * FROM saved_casts WHERE email = ? AND origin = 'recover'").get("cn@example.com") as { token: string; teaser: string | null; id: number };
    expect(row.token).toMatch(/^[0-9a-f]{48}$/);
    expect(savedCastsByEmailSince("cn@example.com", NOW - DAY)).toBe(0);
    expect(savedCastsDue(NOW + DAY, NOW - 30 * DAY).some((r) => r.token === row.token)).toBe(false);
    // it had no free line: one is written on first open (stored instant) and kept
    llm.text.push("这件事能成，但不会马上有结果。");
    const res = await savedGET(new NextRequest(`http://localhost/api/cast/saved?t=${row.token}`));
    const body = await res.json() as { origin: string; teaser: string; castAtMs: number };
    expect(body.origin).toBe("recover");
    expect(body.castAtMs).toBe(CAST_AT);
    expect(body.teaser).toBeTruthy();
    expect(savedCastByToken(row.token)!.teaser).toBe(body.teaser);
    // the reader's own saved cast still reads as before
    const own = await (await savedGET(new NextRequest(`http://localhost/api/cast/saved?t=${"a".repeat(48)}`))).json() as { origin: string };
    expect(own.origin).toBe("saved");
  });
});
