import { isCurrency, packMinor, priceMinor } from "./money";
import { memberSinglesSince, packsSince } from "./db";
import { PACK_BANK_MAX, PACK_MAX_PER_PERIOD, PACK_SMALL_UNITS, PACK_UNITS, type PackQuote } from "./sub-plan";

/**
 * 10-02 小包与单买抵扣 (Neil: 「1，出一个小包」「2，3 都做吧」): what each pack costs this member right now.
 *
 *   - small: 5 readings at its own price — never takes credit (it is already the cheap way to a few more).
 *   - large: 15 readings. Before this period's first large pack, the period's single extras (at the light price) and
 *     small packs, in the pack's currency, count towards it: it costs the difference and adds what is still missing
 *     from 15. Small packs go in first, then singles oldest first, while the price stays at least one single's and at
 *     least one reading is still added — so the charge is never trivial and the pack never adds nothing.
 *   - either needs a renewing membership (`buyable`), fewer than 2 packs this period, and room under the 20 held.
 */
export function packQuotes(i: { customerId: number; since: number; currency: string | null | undefined; packLeft: number; buyable: boolean }):
  { small: PackQuote | null; large: PackQuote | null; singles: number } {
  const cur = (i.currency ?? "").toUpperCase();
  if (!isCurrency(cur)) return { small: null, large: null, singles: 0 };
  const light = priceMinor(cur, "one");
  const singles = memberSinglesSince(i.customerId, i.since, cur, light);
  if (!i.buyable) return { small: null, large: null, singles: singles.length };
  const packs = packsSince(i.customerId, i.since);
  if (packs.length >= PACK_MAX_PER_PERIOD) return { small: null, large: null, singles: singles.length };
  const room = PACK_BANK_MAX - Math.max(0, i.packLeft);

  const smallFull = packMinor(cur, "small");
  const small: PackQuote | null = room >= PACK_SMALL_UNITS
    ? { size: "small", units: PACK_SMALL_UNITS, minor: smallFull, currency: cur, fullMinor: smallFull, fullUnits: PACK_SMALL_UNITS, creditMinor: 0, creditUnits: 0, creditSingles: 0 }
    : null;

  const largeFull = packMinor(cur, "large");
  let creditMinor = 0, creditUnits = 0, creditSingles = 0;
  if (!packs.some((p) => p.size === "large")) {
    const items = [
      ...packs.filter((p) => p.size === "small" && (p.currency ?? "").toUpperCase() === cur && (p.amount_minor ?? 0) > 0)
        .map((p) => ({ minor: p.amount_minor ?? 0, units: p.units, single: false })),
      ...singles.map((x) => ({ minor: x.minor, units: 1, single: true })),
    ];
    for (const it of items) {
      if (largeFull - (creditMinor + it.minor) < light || PACK_UNITS - (creditUnits + it.units) < 1) continue;
      creditMinor += it.minor; creditUnits += it.units; if (it.single) creditSingles += 1;
    }
  }
  const largeUnits = PACK_UNITS - creditUnits;
  const large: PackQuote | null = room >= largeUnits
    ? { size: "large", units: largeUnits, minor: largeFull - creditMinor, currency: cur, fullMinor: largeFull, fullUnits: PACK_UNITS, creditMinor, creditUnits, creditSingles }
    : null;
  return { small, large, singles: singles.length };
}
