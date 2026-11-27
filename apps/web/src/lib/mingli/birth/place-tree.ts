// server-side only: never import from a client component (~0.8 MB of place data); the client fetches /api/places/tree
import RAW from "@/data/mingli/place-tree.json";
import { isForeign } from "@/lib/l10n/core";
import { countryOfGeoId, placeByGeoId } from "./gazetteer";
import { ADMIN_EN, countryName, MARKET } from "./place-names";

/**
 * 出生地點滾輪選擇器的資料（問真八字式：先選地區分頁，再逐欄選）. Built offline into data/mingli/place-tree.json:
 *  - "tw"   縣市 (22, 臺北市 新北市 桃園市 臺中市 臺南市 高雄市 基隆市 新竹市 嘉義市, then the counties) → 鄉鎮市區 (368,
 *           in postal-code order). Official 臺 names. Coordinates: the GeoNames ADM3 feature of each 鄉鎮市區.
 *  - "hkmo" 香港 → 18 區 (official order: 港島, 九龍, 新界); 澳門 → 7 堂區 + 路氹填海區. Coordinates: GeoNames ADM1.
 *  - "cn"   省級 (31, GB/T 2260 order, short names: 北京 河北 … 新疆) → 地級 (prefecture-level 市/地區/自治州/盟; a 直轄市
 *           is its own single second level, 北京 → 北京市 → 東城區…; a county-level city under direct provincial control
 *           (仙桃市, 五指山市, 石河子市…) and a prefecture-level city without 區縣 (東莞市, 中山市, 儋州市, 嘉峪關市) are a second
 *           level holding just itself) → 縣級 (區/縣/縣級市/旗). Divisions and names: GB/T 2260 (via the province-city-china
 *           package, MIT); coordinates: the matching GeoNames ADM3 / county seat, a handful of renamed or new units placed by
 *           their predecessor or seat, and three counties created in 2024 plus four 兵團 cities placed at their host
 *           prefecture's seat.
 *  - "intl" 國家/地區 (every country with places in places.json besides TW/HK/MO/CN: 美國 加拿大 馬來西亞 新加坡 日本 韓國
 *           澳洲 紐西蘭 英國 泰國 菲律賓 印尼 越南 德國 法國 first, then by population) → state/province for 美國 / 加拿大 /
 *           澳洲 (up to 25 places each, neighbourhoods folded into the city they sit in), or a single entry named after
 *           the country for every other country → cities (up to 60, by population, rows of places.json).
 * So "tw" and "hkmo" are two levels deep and "cn" and "intl" three; within a tree every branch has the same depth.
 * GeoNames data is CC BY 4.0, see THIRD_PARTY_NOTICES.md.
 *
 * File layout (compact on purpose):
 *   { v: 1, tz: { tw, hkmo, cn }, tw: Node[], hkmo: Node[], cn: Node[], intl: Node[] }
 *   Node = [nameHant, nameHans, (Node | Leaf)[]]
 *   Leaf = [nameHant, nameHans, lat, lon, tz | 0, rawId]   (0 = the tree's default tz; intl leaves always carry one)
 * rawId is a GeoNames id (tw, hkmo, intl — intl ids are places.json ids, so the same as the city search) or the
 * six-digit GB/T 2260 code (cn).
 */
type Leaf = [string, string, number, number, string | 0, string];
type Node = [string, string, (Node | Leaf)[]];
interface Raw { v: number; tz: Record<string, string>; tw: Node[]; hkmo: Node[]; cn: Node[]; intl: Node[] }
const DATA = RAW as unknown as Raw;

export type TreeRegion = "tw" | "hkmo" | "cn" | "intl";
/** 10-30 进度表 128 ④: a foreign page reads the "intl" tree — countries in its own language, states and cities in English */
export type TreeLocale = "zh-hant" | "zh" | "en" | "ja" | "ko" | "fr" | "de" | "es" | "pt";
export const TREE_REGIONS: readonly TreeRegion[] = ["tw", "hkmo", "cn", "intl"];

/** A column entry: a branch has children; a leaf (a pickable place) has id, lat, lon and tz. */
export interface TreeNode { name: string; children?: TreeNode[]; id?: string; lat?: number; lon?: number; tz?: string }

const isLeaf = (x: Node | Leaf): x is Leaf => typeof x[2] === "number";
const CACHE = new Map<string, TreeNode[]>();

/**
 * The tree for one region with names in one script ("zh" = Simplified, "zh-hant" = Traditional). Leaf ids are stable
 * across rebuilds: "<region>:<rawId>", e.g. "tw:1678974" (臺北市中正區), "cn:441403" (梅州市梅縣區).
 * The result is cached and shared: treat it as read-only.
 */
export function placeTree(region: TreeRegion, locale: TreeLocale): TreeNode[] {
  const key = region + "|" + locale;
  const hit = CACHE.get(key);
  if (hit) return hit;
  if (isForeign(locale)) {
    const out = foreignTree(region, locale);
    CACHE.set(key, out);
    return out;
  }
  const t = locale === "zh-hant" ? 0 : 1;
  const defTz = DATA.tz[region] ?? "UTC";
  const walk = (list: (Node | Leaf)[]): TreeNode[] =>
    list.map((x) =>
      isLeaf(x)
        ? { name: x[t], id: `${region}:${x[5]}`, lat: x[2], lon: x[3], tz: x[4] || defTz }
        : { name: x[t], children: walk(x[2]) },
    );
  const out = walk(DATA[region] ?? []);
  CACHE.set(key, out);
  return out;
}

/** the tree outside Chinese: a place keeps its id, so a profile reads the same in every language */
function foreignTree(region: TreeRegion, locale: Exclude<TreeLocale, "zh" | "zh-hant">): TreeNode[] {
  const defTz = DATA.tz[region] ?? "UTC";
  const walk = (list: (Node | Leaf)[], depth: number, parent = ""): TreeNode[] =>
    list.map((x) => {
      if (isLeaf(x)) {
        const p = region === "intl" ? placeByGeoId(x[5], locale) : null;
        return { name: p?.name ?? x[0], id: `${region}:${x[5]}`, lat: x[2], lon: x[3], tz: x[4] || defTz };
      }
      // a country node is named from its places' country code; a state keeps its English name; the single entry under
      // a country with no states is named after the country, as in Chinese
      if (region === "intl" && depth === 0) {
        const first = firstLeaf(x);
        const cc = first ? countryOfGeoId(first[5]) ?? "" : "";
        const name = cc ? countryName(cc, locale) : x[0];
        return { name, children: walk(x[2], depth + 1, name), cc } as TreeNode & { cc?: string };
      }
      return { name: ADMIN_EN[x[0]] ?? (parent || x[0]), children: walk(x[2], depth + 1) };
    });
  const tree = walk(DATA[region] ?? [], 0);
  if (region !== "intl") return tree;
  // the reader's own countries first, in the market's order; the rest as they were (by population)
  const order = MARKET[locale];
  const rank = (n: TreeNode & { cc?: string }) => { const i = order.indexOf(n.cc ?? ""); return i < 0 ? order.length : i; };
  return tree.map((n, i) => ({ n: n as TreeNode & { cc?: string }, i })).sort((a, b) => rank(a.n) - rank(b.n) || a.i - b.i).map(({ n }) => { const { cc: _c, ...rest } = n; return rest; });
}
const firstLeaf = (n: Node): Leaf | null => {
  for (const c of n[2]) { if (isLeaf(c)) return c; const f = firstLeaf(c); if (f) return f; }
  return null;
};

export function isTreeRegion(s: string | null | undefined): s is TreeRegion {
  return !!s && (TREE_REGIONS as readonly string[]).includes(s);
}
