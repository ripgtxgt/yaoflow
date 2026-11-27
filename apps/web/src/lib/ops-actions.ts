import { db, recordOps } from "./db";
import { opsJson } from "./support-llm";
import { getSetting, isPromoSurface, PROMO_MAX, PROMO_SURFACES, promoPick, setSetting, type PromoSurface } from "./promo";
import { SERVICE_IDS } from "./services";
import { dayNumbers, tpeDayStart, tpeYmd, type DayNumbers } from "./daily-insight";

/**
 * 10-28 进度表 119 (Neil, on the 運營摘要's 「今天可以試什麼」: 「自動化運營會根據這個去做調整嗎？」→「要做」) — the summary's
 * suggestions become ACTIONS, but only from a short fixed list of small, reversible switches, and nothing moves until
 * the owner taps 批准 on the admin home. Each approved action runs seven days, then its one number (the thing it was
 * meant to move) is set beside the seven days before, the switch goes back, and the owner sees 有用／沒用 with a
 * 「長期保留」 button. The model never touches prices, products, letters or anything about a reader.
 *
 * The switches live in site_settings (`ops:<key>`), read by lib/bridge.ts, components/LoveBridge.tsx and lib/promo.ts.
 */
const DAY = 86_400_000;
export const TRIAL_DAYS = 7;

export type ActionKind = "bridge_tone" | "bridge_look" | "promo_pick";
export interface ActionDef {
  kind: ActionKind;
  /** for the owner */
  label: string;
  /** for the model: what it does and what the parameters are */
  doc: string;
  /** the number it is meant to move, for the owner */
  metric: string;
  /** parameter check → cleaned params, or null */
  clean(p: Record<string, unknown>): Record<string, unknown> | null;
  /** one line for the owner from the params */
  describe(p: Record<string, unknown>): string;
}

export const BRIDGE_TONES = ["result", "person", "place"] as const;
export type BridgeTone = (typeof BRIDGE_TONES)[number];
export const BRIDGE_LOOKS = ["quiet", "strong"] as const;
export type BridgeLook = (typeof BRIDGE_LOOKS)[number];
const TONE_ZH: Record<BridgeTone, string> = { result: "先接結果（預設）", person: "先說「容易和你走在一起的是哪一類人」", place: "先說「可能在哪裡遇見」" };
const LOOK_ZH: Record<BridgeLook, string> = { quiet: "細框（預設）", strong: "金底加粗" };
const SURFACE_ZH: Record<PromoSurface, string> = { home: "首頁", jieqian: "解籤頁", reading: "解讀頁", mingli: "命盤頁", jiaobei: "擲筊頁", tarot: "塔羅頁", cast: "起卦頁" };

export const ACTIONS: Record<ActionKind, ActionDef> = {
  bridge_tone: {
    kind: "bridge_tone", label: "感情推薦卡的文案方向", metric: "推薦卡點擊率（點擊／出現）",
    doc: `bridge_tone {tone: "person" | "place"}：感情題結果下方那張「正緣畫像」推薦卡，句子先說什麼。person＝先說「容易和你走在一起的是哪一類人」；place＝先說「可能在哪裡遇見」。預設是先接讀者問的那件事。`,
    clean: (p) => (typeof p.tone === "string" && BRIDGE_TONES.includes(p.tone as BridgeTone) && p.tone !== "result" ? { tone: p.tone } : null),
    describe: (p) => `推薦卡文案改成：${TONE_ZH[p.tone as BridgeTone] ?? String(p.tone)}`,
  },
  bridge_look: {
    kind: "bridge_look", label: "感情推薦卡的樣式", metric: "推薦卡點擊率（點擊／出現）",
    doc: `bridge_look {look: "strong"}：同一張推薦卡改成金底、字大一號，更顯眼。預設是細框。`,
    clean: (p) => (p.look === "strong" ? { look: "strong" } : null),
    describe: (p) => `推薦卡樣式改成：${LOOK_ZH[p.look as BridgeLook] ?? String(p.look)}`,
  },
  promo_pick: {
    kind: "promo_pick", label: "「也可以試試」推哪兩樣", metric: "從那一欄點進去的人數（?c=promo-欄位）",
    doc: `promo_pick {surface: ${PROMO_SURFACES.map((s) => `"${s}"`).join(" | ")}, ids: [最多兩個產品 id]}：每頁底下「也可以試試」那一欄推哪兩樣。產品 id 可選：${SERVICE_IDS.join(", ")}（zhengyuan＝正緣畫像、hepan＝合盤、nianshu＝年書、bazi/ziwei/xingpan＝三種命盤、tarot＝塔羅、jiaobei＝擲筊、jieqian＝解籤、cast＝六爻、zeri＝擇日、yunshi＝運勢、today-qian＝今日一籤、huangli＝黃曆、name＝姓名學（免費查詢＋寶寶取名／改名參考單買）、dream＝解夢、taisui＝犯太歲查詢（接年書）、xunwu＝尋物「東西不見了？」（免登入擲骰子看方向和先找的地方，接六爻細看）、bmg＝本命卦小測（12 題、免登入免生辰，得到自己的本命卦，可邀朋友合卦，接六爻問事））。`,
    clean: (p) => {
      if (!isPromoSurface(p.surface) || !Array.isArray(p.ids)) return null;
      const ids = [...new Set(p.ids.filter((x): x is string => typeof x === "string" && SERVICE_IDS.includes(x)))].slice(0, PROMO_MAX);
      return ids.length ? { surface: p.surface, ids } : null;
    },
    describe: (p) => `${SURFACE_ZH[p.surface as PromoSurface] ?? String(p.surface)}的「也可以試試」改推：${(p.ids as string[]).join("、")}`,
  },
};
export const ACTION_KINDS = Object.keys(ACTIONS) as ActionKind[];

export type ActionStatus = "proposed" | "rejected" | "active" | "revoked" | "done" | "kept";
export interface ActionRow {
  id: number; day: string; kind: ActionKind; params: Record<string, unknown>; reason: string; status: ActionStatus;
  proposed_at: number; decided_at: number | null; ends_at: number | null; before: string | null; result: string | null; verdict: string | null;
}

let ready = false;
function ensure(): void {
  if (ready) return;
  db().exec(`CREATE TABLE IF NOT EXISTS ops_actions (
    id INTEGER PRIMARY KEY AUTOINCREMENT, day TEXT NOT NULL, kind TEXT NOT NULL, params_json TEXT NOT NULL, reason TEXT NOT NULL,
    status TEXT NOT NULL, proposed_at INTEGER NOT NULL, decided_at INTEGER, ends_at INTEGER, before_json TEXT, result_json TEXT, verdict TEXT
  )`);
  db().exec("CREATE TABLE IF NOT EXISTS site_settings (k TEXT PRIMARY KEY, v TEXT NOT NULL, updated_at INTEGER NOT NULL)");
  ready = true;
}
const parse = (s: string | null): Record<string, unknown> => { try { return s ? (JSON.parse(s) as Record<string, unknown>) : {}; } catch { return {}; } };
function row(r: Record<string, unknown>): ActionRow {
  return {
    id: Number(r.id), day: String(r.day), kind: r.kind as ActionKind, params: parse(r.params_json as string), reason: String(r.reason), status: r.status as ActionStatus,
    proposed_at: Number(r.proposed_at), decided_at: (r.decided_at as number | null) ?? null, ends_at: (r.ends_at as number | null) ?? null,
    before: (r.before_json as string | null) ?? null, result: (r.result_json as string | null) ?? null, verdict: (r.verdict as string | null) ?? null,
  };
}
export function listActions(limit = 30): ActionRow[] {
  ensure();
  return (db().prepare("SELECT * FROM ops_actions ORDER BY id DESC LIMIT ?").all(limit) as Record<string, unknown>[]).map(row);
}
export function getAction(id: number): ActionRow | null {
  ensure();
  const r = db().prepare("SELECT * FROM ops_actions WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  return r ? row(r) : null;
}
const activeOfKind = (kind: ActionKind, surface?: string): ActionRow | null =>
  listActions(200).find((a) => a.kind === kind && (a.status === "active" || a.status === "kept") && (!surface || a.params.surface === surface)) ?? null;

/* ---------------------------------------------------------------- the switches, as the pages read them ---- */
export function bridgeTone(): BridgeTone { const v = getSetting("ops:bridge_tone"); return BRIDGE_TONES.includes(v as BridgeTone) ? (v as BridgeTone) : "result"; }
export function bridgeLook(): BridgeLook { return getSetting("ops:bridge_look") === "strong" ? "strong" : "quiet"; }

/** turn one action on or off (promo_pick remembers the owner's own pick to put back) */
function apply(a: ActionRow, on: boolean): void {
  if (a.kind === "bridge_tone") setSetting("ops:bridge_tone", on ? String(a.params.tone) : "result");
  else if (a.kind === "bridge_look") setSetting("ops:bridge_look", on ? "strong" : "quiet");
  else if (a.kind === "promo_pick") {
    const surface = a.params.surface as PromoSurface;
    if (on) {
      const prev = promoPick(surface);
      setSetting(`ops:promo_prev.${surface}`, prev.set ? JSON.stringify(prev.ids) : "");
      setSetting(`promo.${surface}`, JSON.stringify(a.params.ids));
    } else {
      const prev = getSetting(`ops:promo_prev.${surface}`);
      if (prev) setSetting(`promo.${surface}`, prev);
      else db().prepare("DELETE FROM site_settings WHERE k = ?").run(`promo.${surface}`);
    }
  }
}

/* ---------------------------------------------------------------- the one number each action is meant to move ---- */
export interface Measure { shown: number; hit: number; rate: number | null; days: number }
/** over the Taipei days [from, to): the action's hits and the base they are a rate of */
export function measure(a: Pick<ActionRow, "kind" | "params">, from: number, to: number): Measure {
  let shown = 0, hit = 0, days = 0;
  for (let d = tpeDayStart(from); d < to; d += DAY) {
    const n = dayNumbers(d);
    days++;
    if (a.kind === "promo_pick") {
      const c = (n.promoClicks ?? {}) as Record<string, number>;
      hit += c[String(a.params.surface)] ?? 0;
      shown += n.casts as number; // the day's size, so the rate reads as taps per hundred casts
    } else {
      shown += Object.values((n.bridgeShown ?? {}) as Record<string, number>).reduce((x, y) => x + y, 0);
      hit += Object.values((n.bridgeClicked ?? {}) as Record<string, number>).reduce((x, y) => x + y, 0);
    }
  }
  return { shown, hit, rate: shown > 0 ? Math.round((hit / shown) * 10000) / 100 : null, days };
}

/* ---------------------------------------------------------------- the owner's buttons ---- */
export type Decision = "approve" | "reject" | "revoke" | "keep" | "stop";
export function decide(id: number, what: Decision, now = Date.now()): { ok: true; status: ActionStatus } | { ok: false; why: string } {
  ensure();
  const a = getAction(id);
  if (!a) return { ok: false, why: "沒有這一條" };
  const set = (status: ActionStatus, extra: Record<string, unknown> = {}) => {
    db().prepare("UPDATE ops_actions SET status = ?, decided_at = ?, ends_at = COALESCE(?, ends_at), before_json = COALESCE(?, before_json), result_json = COALESCE(?, result_json), verdict = COALESCE(?, verdict) WHERE id = ?")
      .run(status, now, (extra.ends_at as number) ?? null, (extra.before as string) ?? null, (extra.result as string) ?? null, (extra.verdict as string) ?? null, id);
    recordOps("ops_action", `#${id} ${a.kind} ${status}`);
    return { ok: true as const, status };
  };
  if (what === "approve") {
    if (a.status !== "proposed") return { ok: false, why: "不是待批的" };
    const clash = activeOfKind(a.kind, a.kind === "promo_pick" ? String(a.params.surface) : undefined);
    if (clash) return { ok: false, why: `同類的 #${clash.id} 還在跑` };
    const before = measure(a, now - TRIAL_DAYS * DAY, tpeDayStart(now));
    apply(a, true);
    return set("active", { ends_at: tpeDayStart(now) + (TRIAL_DAYS + 1) * DAY, before: JSON.stringify(before) });
  }
  if (what === "reject") return a.status === "proposed" ? set("rejected") : { ok: false, why: "不是待批的" };
  if (what === "revoke") { if (a.status !== "active" && a.status !== "kept") return { ok: false, why: "沒在跑" }; apply(a, false); return set("revoked"); }
  if (what === "keep") { if (a.status !== "done") return { ok: false, why: "還沒跑完" }; apply(a, true); return set("kept"); }
  if (what === "stop") { if (a.status !== "kept") return { ok: false, why: "不是長期保留的" }; apply(a, false); return set("revoked"); }
  return { ok: false, why: "?" };
}

/** the morning sweep: every active action past its week is measured and switched back */
export function settleActions(now = Date.now()): number {
  ensure();
  let n = 0;
  for (const a of listActions(200)) {
    if (a.status !== "active" || !a.ends_at || a.ends_at > now) continue;
    const start = a.decided_at ? tpeDayStart(a.decided_at) + DAY : a.ends_at - TRIAL_DAYS * DAY;
    const during = measure(a, start, Math.min(a.ends_at, tpeDayStart(now)));
    const before = a.before ? (JSON.parse(a.before) as Measure) : null;
    const verdict = before?.rate != null && during.rate != null
      ? during.rate >= before.rate * 1.15 && during.hit >= 5 ? "better" : during.rate <= before.rate * 0.85 ? "worse" : "same"
      : "unclear";
    apply(a, false);
    db().prepare("UPDATE ops_actions SET status = 'done', result_json = ?, verdict = ? WHERE id = ?").run(JSON.stringify(during), verdict, a.id);
    recordOps("ops_action", `#${a.id} ${a.kind} done ${verdict} ${before?.rate ?? "—"}→${during.rate ?? "—"}`);
    n++;
  }
  return n;
}

/* ---------------------------------------------------------------- the model's proposals ---- */
const PROMPT = () => [
  "你是一個問事網站的運營助理。下面是昨天的數字和前七天的日平均。你只能從這份固定清單裡挑「小調整」，最多兩條，也可以一條都不挑（數字沒有明顯問題時就不要挑）。",
  "可選的動作（每條都是可逆的開關，試七天後會自動還原並對比效果）：",
  ...ACTION_KINDS.map((k) => `- ${ACTIONS[k].doc}`),
  "挑的依據必須是數字裡看得到的事：例如推薦卡出現很多但點的很少才改推薦卡；某產品頁看的人少才把它放進「也可以試試」。不要為了改而改。",
  `只輸出 JSON：{"actions":[{"kind":"…","params":{…},"reason":"一句话（简体中文，30 字內，說依據哪個數字）"}]}`,
].join("\n");

/** ask the model for today's proposals from the summary's numbers; stored as 待批. Skips kinds already proposed or running. */
export async function proposeActions(day: string, numbers: DayNumbers, prev: DayNumbers, now = Date.now()): Promise<ActionRow[]> {
  ensure();
  if (db().prepare("SELECT 1 FROM ops_actions WHERE day = ?").get(day)) return [];
  let raw = "";
  try {
    raw = (await opsJson(PROMPT(), JSON.stringify({ yesterday: numbers, avg7: prev }), { maxTokens: 500, temperature: 0.3, timeoutMs: 60_000 })).text;
  } catch (e) { recordOps("ops_action_fail", (e instanceof Error ? e.message : "?").slice(0, 100)); return []; }
  return storeProposals(day, raw, now);
}

/** parse + check the model's answer; only clean, non-duplicate actions are kept */
export function storeProposals(day: string, raw: string, now = Date.now()): ActionRow[] {
  ensure();
  let list: unknown[] = [];
  try {
    const j = JSON.parse(raw.replace(/^```(?:json)?\s*|\s*```$/g, "")) as { actions?: unknown };
    list = Array.isArray(j.actions) ? j.actions : [];
  } catch { recordOps("ops_action_fail", "bad json"); return []; }
  const out: ActionRow[] = [];
  const open = listActions(200).filter((a) => a.status === "proposed" || a.status === "active" || a.status === "kept");
  for (const x of list) {
    if (out.length >= 2) break;
    if (!x || typeof x !== "object") continue;
    const { kind, params, reason } = x as { kind?: unknown; params?: unknown; reason?: unknown };
    const def = ACTIONS[kind as ActionKind];
    if (!def || !params || typeof params !== "object") continue;
    const clean = def.clean(params as Record<string, unknown>);
    if (!clean) continue;
    if (open.some((a) => a.kind === def.kind && (def.kind !== "promo_pick" || a.params.surface === clean.surface))) continue;
    const why = typeof reason === "string" ? reason.trim().slice(0, 120) : "";
    if (!why) continue;
    const r = db().prepare("INSERT INTO ops_actions (day, kind, params_json, reason, status, proposed_at) VALUES (?,?,?,?,?,?)").run(day, def.kind, JSON.stringify(clean), why, "proposed", now) as unknown as { lastInsertRowid: number | bigint };
    out.push(getAction(Number(r.lastInsertRowid))!);
  }
  if (out.length) recordOps("ops_action", `${day} proposed ${out.map((a) => a.kind).join(",")}`);
  return out;
}

export const pendingCount = (): number => listActions(50).filter((a) => a.status === "proposed").length;
export const describeAction = (a: ActionRow): string => ACTIONS[a.kind]?.describe(a.params) ?? a.kind;
