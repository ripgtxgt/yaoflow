/**
 * 10-04 (Neil: 「你定个日期吧，观察一个星期后再做决定」): the numbers behind four pending decisions, for one window.
 * Read-only. Run on the server, where the data lives:
 *
 *   scp scripts/free-users-review.js ubuntu@<server>:/tmp/ && ssh ubuntu@<server> \
 *     'node /tmp/free-users-review.js /home/ubuntu/yaoflow-data /home/ubuntu/yaoflow/apps/web/.env.local 2026-10-05 2026-10-12'
 *
 * Window: [from 00:00, to 00:00) Taipei time. Prints counts only — no address, no question, no reading text.
 *   1. people who cast (a browser, joined with every browser filed under the same account): paid share by number of casts,
 *      casts before the first payment, heavy users (≥5 casts) who paid vs did not;
 *   2. a daily cap on free lines, simulated (进度表 §四 31);
 *   3. the Apple Pay / Google Pay sheet: opened → paid / closed and never paid (proposal ①);
 *   4. the one-off recovery letter of 10-05 (emails kind recover-1): who came back and paid;
 *   5. the free first light reading (arm f1 vs f0) and the save-to-mailbox offer (y1).
 */
const { DatabaseSync } = require("node:sqlite");
const fs = require("fs"), path = require("path");
const [DIR, ENV, FROM, TO] = process.argv.slice(2);
if (!DIR || !ENV || !FROM || !TO) { console.error("usage: node free-users-review.js <DATA_DIR> <.env.local> <from YYYY-MM-DD> <to YYYY-MM-DD>"); process.exit(1); }
const env = Object.fromEntries(fs.readFileSync(ENV, "utf8").split("\n").map((l) => /^([A-Z0-9_]+)=(.*)$/.exec(l.trim())).filter(Boolean).map((m) => [m[1], m[2].replace(/^["']|["']$/g, "")]));
const OWNER = new Set(String(env.DIGEST_TO ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean));
let d;
try { d = new DatabaseSync(path.join(DIR, "yaoflow.db"), { readOnly: true }); } catch { d = new DatabaseSync(path.join(DIR, "yaoflow.db")); }
const T8 = 8 * 3600e3;
const W0 = Date.parse(`${FROM}T00:00:00+08:00`), W1 = Date.parse(`${TO}T00:00:00+08:00`);
const localDay = (t) => new Date(t + T8).toISOString().slice(0, 10);
const pct = (a, b) => (b ? `${((100 * a) / b).toFixed(1)}%` : "-");
const tally = (arr, f) => arr.reduce((o, x) => { const k = f(x); o[k] = (o[k] ?? 0) + 1; return o; }, {});
const bucket = (n) => (n === 1 ? "1" : n === 2 ? "2" : n === 3 ? "3" : n <= 5 ? "4-5" : n <= 9 ? "6-9" : "10+");
console.log(`window ${FROM} → ${TO} (Taipei)`);

// ---- events in the window (UTC day files; one extra day each side)
const evs = [];
for (const f of fs.readdirSync(path.join(DIR, "events")).sort()) {
  if (!f.endsWith(".jsonl")) continue;
  const fd = Date.parse(f.slice(0, 10));
  if (!Number.isFinite(fd) || fd < W0 - 2 * 86400e3 || fd > W1 + 86400e3) continue;
  for (const line of fs.readFileSync(path.join(DIR, "events", f), "utf8").split("\n")) {
    if (!line) continue;
    try { const e = JSON.parse(line); if (e.t >= W0 && e.t < W1) evs.push(e); } catch { /* skip */ }
  }
}
evs.sort((a, b) => a.t - b.t);
console.log(`events ${evs.length}`);

// ---- who paid, who is a member, test / owner accounts
const cust = new Map(d.prepare("SELECT id, lower(email) AS e, test_flag AS t FROM customers").all().map((r) => [r.id, r]));
const cidByEmail = new Map([...cust.values()].map((r) => [r.e, r.id]));
const testCust = new Set([...cust.values()].filter((r) => r.t === 1 || OWNER.has(r.e)).map((r) => r.id));
const orders = d.prepare("SELECT customer_id AS cid, lower(email) AS e, browser_sid AS bs, created_at AS t, tier, amount_cents AS a FROM orders WHERE payment_state IN ('paid','refunded','disputed') AND COALESCE(amount_cents,0) > 0 AND COALESCE(test_flag,0) = 0").all();
const subs = d.prepare("SELECT customer_id AS cid, stripe_subscription_id AS sid, status, created_at AS t, period_end AS pe FROM subscriptions WHERE status NOT IN ('incomplete','incomplete_expired')").all();
const links = d.prepare("SELECT bid, customer_id AS cid FROM browser_links").all();
const custOfBid = new Map(); for (const l of links) custOfBid.set(l.bid, [...(custOfBid.get(l.bid) ?? []), l.cid]);
const tabsOfBid = new Map(); for (const r of d.prepare("SELECT s, bid FROM tab_browsers").all()) tabsOfBid.set(r.bid, [...(tabsOfBid.get(r.bid) ?? []), r.s]);
const ordersByTab = new Map(); for (const o of orders) if (o.bs) ordersByTab.set(o.bs, [...(ordersByTab.get(o.bs) ?? []), o]);

// ---- people: browsers joined through shared accounts
const parent = new Map();
const find = (x) => { while (parent.get(x) !== x) { parent.set(x, parent.get(parent.get(x))); x = parent.get(x); } return x; };
const add = (x) => { if (!parent.has(x)) parent.set(x, x); };
const union = (a, b) => { add(a); add(b); const ra = find(a), rb = find(b); if (ra !== rb) parent.set(ra, rb); };
for (const l of links) union(`b${l.bid}`, `c${l.cid}`);
const P = new Map();
for (const e of evs) {
  if (!e.b) continue;
  add(`b${e.b}`);
  const r = find(`b${e.b}`);
  if (!P.has(r)) P.set(r, { bids: new Set(), ev: [] });
  const p = P.get(r); p.bids.add(e.b); p.ev.push(e);
}
const people = [];
for (const p of P.values()) {
  const castTimes = p.ev.filter((e) => e.e === "cast_complete").map((e) => e.t);
  if (!castTimes.length) continue;
  const cids = new Set(); for (const b of p.bids) for (const c of custOfBid.get(b) ?? []) cids.add(c);
  if ([...cids].some((c) => testCust.has(c))) continue;
  const tabs = new Set(); for (const b of p.bids) for (const s of tabsOfBid.get(b) ?? []) tabs.add(s);
  const pays = [
    ...orders.filter((o) => (o.cid && cids.has(o.cid)) || (o.bs && tabs.has(o.bs))).map((o) => ({ t: o.t, what: o.tier })),
    ...subs.filter((s) => cids.has(s.cid) && /^(sub|pass)_/.test(s.sid)).map((s) => ({ t: s.t, what: s.sid.startsWith("pass_") ? "pass" : "sub" })),
  ].sort((a, b) => a.t - b.t);
  const memberAtStart = subs.some((s) => cids.has(s.cid) && s.t < W0 && (s.status === "active" || s.status === "trialing" || (s.pe ?? 0) > W0));
  if (memberAtStart || pays.some((x) => x.t < W0)) continue; // members, and anyone who had paid before: not "free users"
  const inWin = pays.filter((x) => x.t >= W0 && x.t < W1);
  const first = inWin[0]?.t ?? null;
  const count = (name, pred = () => true) => p.ev.filter((e) => e.e === name && pred(e)).length;
  people.push({
    bids: p.bids, tabs, cids, casts: castTimes.length, castTimes, paid: inWin.length > 0, bought: inWin.map((x) => x.what),
    castsBeforePay: first ? castTimes.filter((t) => t < first).length : null,
    teasers: p.ev.filter((e) => e.e === "teaser_shown").map((e) => e.t), firstPay: first,
    email: cids.size > 0, clicks: count("reading_click"), wallet: count("reading_click", (e) => e.method === "wallet_open"),
    checkout: count("checkout_start"), days: new Set(castTimes.map(localDay)).size,
    arm: p.ev.find((e) => e.ab)?.ab ?? null,
  });
}
const payers = people.filter((p) => p.paid);
console.log(`\n== 1. PEOPLE who cast (non-members, never paid before): ${people.length}; paid in window ${payers.length} (${pct(payers.length, people.length)})`);
const allTeasers = people.reduce((s, p) => s + p.teasers.length, 0);
for (const b of ["1", "2", "3", "4-5", "6-9", "10+"]) {
  const g = people.filter((p) => bucket(p.casts) === b);
  const tz = g.reduce((s, p) => s + p.teasers.length, 0);
  console.log(`  casts ${b.padEnd(4)} ${String(g.length).padStart(5)} people · paid ${String(g.filter((p) => p.paid).length).padStart(3)} (${pct(g.filter((p) => p.paid).length, g.length)}) · free lines ${tz} (${pct(tz, allTeasers)})`);
}
console.log(`  payers: casts before the first payment ${JSON.stringify(tally(payers, (p) => (p.castsBeforePay <= 1 ? "1" : p.castsBeforePay === 2 ? "2" : p.castsBeforePay === 3 ? "3" : "4+")))}`);
const mins = payers.map((p) => (p.firstPay - p.castTimes[0]) / 60000).sort((a, b) => a - b);
console.log(`  minutes from first cast to first payment: median ${mins.length ? mins[Math.floor(mins.length / 2)].toFixed(0) : "-"}, within 30 min ${mins.filter((m) => m <= 30).length}/${mins.length}`);
const heavy = people.filter((p) => p.casts >= 5);
for (const [name, g] of [["≥5 casts, paid", heavy.filter((p) => p.paid)], ["≥5 casts, not paid", heavy.filter((p) => !p.paid)]]) {
  const sh = (f) => pct(g.filter(f).length, g.length);
  console.log(`  ${name}: ${g.length} · left an email ${sh((p) => p.email)} · clicked a price ${sh((p) => p.clicks > 0)} · opened the wallet sheet ${sh((p) => p.wallet > 0)} · reached checkout ${sh((p) => p.checkout > 0)} · 2+ days ${sh((p) => p.days >= 2)}`);
}
console.log(`  heavy payers bought: ${JSON.stringify(heavy.filter((p) => p.paid).map((p) => `${p.bought.join("+")}@cast${p.castsBeforePay}/${p.casts}`))}`);
console.log(`  ≥10 casts, not paid: ${people.filter((p) => p.casts >= 10 && !p.paid).length}; most casts by one person ${Math.max(0, ...people.map((p) => p.casts))}`);

// ---- 2. a daily cap on free lines (每人每天上限), simulated
console.log(`\n== 2. DAILY CAP on free lines (${allTeasers} shown)`);
for (const cap of [2, 3, 5]) {
  let cut = 0, hit = 0, hurt = 0;
  for (const p of people) {
    const perDay = {}; const kept = new Set();
    for (const t of p.teasers) { const k = localDay(t); perDay[k] = (perDay[k] ?? 0) + 1; if (perDay[k] <= cap) kept.add(t); else cut++; }
    if (Object.values(perDay).some((v) => v > cap)) hit++;
    if (p.paid) { const last = p.teasers.filter((t) => t < p.firstPay).at(-1); if (last !== undefined && !kept.has(last)) hurt++; }
  }
  console.log(`  cap ${cap}/day: cut ${cut} (${pct(cut, allTeasers)}) · people who hit it ${hit} · payers whose last free line before paying would be cut ${hurt}/${payers.length}`);
}

// ---- 3. the wallet sheet (tabs)
const tabRows = new Map();
for (const e of evs) {
  if (!e.s) continue;
  let t = tabRows.get(e.s); if (!t) { t = { wallet: 0, card: 0, co: 0 }; tabRows.set(e.s, t); }
  if (e.e === "reading_click" && e.method === "wallet_open") t.wallet++;
  if (e.e === "reading_click" && e.method === "wallet_card") t.card++;
  if (e.e === "checkout_start") t.co++;
}
const walletTabs = [...tabRows.entries()].filter(([, t]) => t.wallet > 0).map(([s, t]) => ({ ...t, paid: (ordersByTab.get(s) ?? []).some((o) => o.t >= W0) }));
console.log(`\n== 3. WALLET SHEET: opened in ${walletTabs.length} tabs · paid ${walletTabs.filter((t) => t.paid).length} (${pct(walletTabs.filter((t) => t.paid).length, walletTabs.length)}) · closed and never paid nor went to card checkout ${walletTabs.filter((t) => !t.paid && t.co === 0).length} · used the card link ${walletTabs.filter((t) => t.card > 0).length}`);

// ---- 4. the one-off recovery letter (10-05, emails kind recover-1)
const rec = d.prepare("SELECT lower(email) AS e, sent_at AS t, session_id AS sid FROM emails WHERE kind = 'recover-1' AND status = 'sent'").all();
if (rec.length) {
  let back = 0, paidAfter = 0; const paidWhat = {};
  const visits = new Set(evs.filter((e) => e.c === "recover1" && e.e === "page_view").map((e) => e.b ?? e.s));
  for (const r of rec) {
    const cid = cidByEmail.get(r.e);
    const after = orders.filter((o) => o.t > r.t && (o.e === r.e || (cid && o.cid === cid))).map((o) => o.tier)
      .concat(subs.filter((s) => cid && s.cid === cid && s.t > r.t && /^(sub|pass)_/.test(s.sid)).map((s) => (s.sid.startsWith("pass_") ? "pass" : "sub")));
    if (after.length) { paidAfter++; for (const w of after) paidWhat[w] = (paidWhat[w] ?? 0) + 1; }
  }
  const unsub = d.prepare("SELECT detail FROM ops_events WHERE kind = 'unsub' AND at >= ?").all(Math.min(...rec.map((r) => r.t))).map((r) => r.detail);
  const unsubbed = rec.filter((r) => unsub.some((u) => { const m = /^(.)…(@.+)$/.exec(u); return m && r.e.startsWith(m[1].toLowerCase()) && r.e.endsWith(m[2].toLowerCase()); })).length;
  void back;
  console.log(`\n== 4. RECOVERY LETTER: sent ${rec.length} · browsers/tabs that came in through its links ${visits.size} · paid anything after it ${paidAfter} (${pct(paidAfter, rec.length)}) ${JSON.stringify(paidWhat)} · unsubscribed after it ${unsubbed}`);
} else console.log("\n== 4. RECOVERY LETTER: none sent yet");

// ---- 5. free first light reading (f arm) and the save-to-mailbox offer (y arm)
for (const arm of ["f0", "f1"]) {
  const g = people.filter((p) => p.arm && p.arm.startsWith(arm));
  console.log(`  arm ${arm}: ${g.length} people · paid ${g.filter((p) => p.paid).length} (${pct(g.filter((p) => p.paid).length, g.length)}) · left an email ${pct(g.filter((p) => p.email).length, g.length)}`);
}
const freeLight = d.prepare("SELECT COUNT(*) AS n FROM grants WHERE kind = 'invite_light' AND via = 'ab_free' AND used_at >= ? AND used_at < ?").get(W0, W1).n;
console.log(`  free first light readings claimed in window: ${freeLight}`);
const saved = d.prepare("SELECT lower(email) AS e, created_at AS t FROM saved_casts WHERE origin IS NULL AND created_at >= ? AND created_at < ?").all(W0, W1);
const savedPaid = saved.filter((s) => orders.some((o) => o.t > s.t && (o.e === s.e || o.cid === cidByEmail.get(s.e)))).length;
console.log(`== 5b. SAVE TO MAILBOX (y1): ${saved.length} saved · paid afterwards ${savedPaid}`);
