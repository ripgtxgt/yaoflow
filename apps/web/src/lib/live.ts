import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

/**
 * 切正式 (09-21). The painted door closed and real money started at
 * **14:50 UTC+8 on 2026-09-21** — the last free claim landed 14:42, the first
 * sale 14:59, so the cut sits between them. Everything before it was
 * PAYWALL=gift: a tap on a priced button handed the reading over for free, so
 * mixing the two eras makes 付费÷起卦 meaningless.
 *
 * PAYWALL_LIVE_AT (epoch ms) overrides without a code change.
 */
export const LIVE_SINCE = Number(process.env.PAYWALL_LIVE_AT) || Date.UTC(2026, 8, 21, 6, 50, 0);
export const LIVE_DAY = "2026-09-21";

/**
 * Rates for showing one bottom line; the ledger itself is always Stripe's own
 * settlement currency. 09-23: the table below was typed in on 09-02 and never
 * moved — it is now only the fallback. `refreshFx()` pulls the day's rates
 * (open.er-api.com, USD base, updated daily) at most twice a day, keeps them in
 * DATA_DIR/fx.json so a restart does not lose them, and every caller of
 * `toUsdCents` reads the fresh table once it is there.
 */
export const FX_TO_USD: Record<string, number> = {
  USD: 1, CNY: 0.141, TWD: 0.0314, HKD: 0.1282, JPY: 0.0067, KRW: 0.00072,
  EUR: 1.08, GBP: 1.27, CAD: 0.73, AUD: 0.66, SGD: 0.77, BRL: 0.19, MXN: 0.05, CHF: 1.13, MYR: 0.245,
};

/** Stripe minor units per whole unit — yen and won have no cents (09-23: ¥980 was counted as 980 "cents" × rate). */
const ZERO_DECIMAL = new Set(["JPY", "KRW"]);

let live: { at: number; rates: Record<string, number> } | null = null;

function fxFile(): string {
  return join(process.env.DATA_DIR ?? join(process.cwd(), ".data"), "fx.json");
}

function loadFromDisk(): void {
  if (live) return;
  try {
    const j = JSON.parse(readFileSync(fxFile(), "utf8")) as { at: number; rates: Record<string, number> };
    if (j && typeof j.at === "number" && j.rates) live = j;
  } catch { /* first run, or no file yet */ }
}

/** USD per one whole unit of `currency`: today's rate when we have one, else the table. */
export function usdPerUnit(currency: string): number {
  loadFromDisk();
  const c = currency.toUpperCase();
  return live?.rates[c] ?? FX_TO_USD[c] ?? 1;
}

/** When the rates in use were fetched, or null when the fallback table is in use. */
export function fxAsOf(): number | null {
  loadFromDisk();
  return live?.at ?? null;
}

export function toUsdCents(minor: number, currency: string): number {
  const c = currency.toUpperCase();
  const whole = ZERO_DECIMAL.has(c) ? minor : minor / 100;
  return Math.round(whole * usdPerUnit(c) * 100);
}

/** Fetch the day's rates (cron + admin pages). Twice a day at most; failures keep what we had. */
export async function refreshFx(force = false): Promise<boolean> {
  loadFromDisk();
  if (!force && live && Date.now() - live.at < 12 * 3_600_000) return false;
  try {
    const r = await fetch("https://open.er-api.com/v6/latest/USD", { signal: AbortSignal.timeout(8_000) });
    const j = (await r.json()) as { result?: string; rates?: Record<string, number> };
    if (j.result !== "success" || !j.rates) return false;
    const rates: Record<string, number> = {};
    for (const c of Object.keys(FX_TO_USD)) {
      const perUsd = j.rates[c];
      if (typeof perUsd === "number" && perUsd > 0) rates[c] = 1 / perUsd;
    }
    live = { at: Date.now(), rates };
    try { mkdirSync(dirname(fxFile()), { recursive: true }); writeFileSync(fxFile(), JSON.stringify(live)); } catch { /* memory still has it */ }
    return true;
  } catch {
    return false;
  }
}
