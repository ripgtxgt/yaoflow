import { describe, expect, it } from "vitest";
import { placeTree, TREE_REGIONS, type TreeNode } from "@/lib/mingli/birth/place-tree";

const leaves = (list: TreeNode[]): TreeNode[] => list.flatMap((n) => (n.children ? leaves(n.children) : [n]));
const pick = (list: TreeNode[], ...path: string[]): TreeNode | undefined => {
  let cur: TreeNode | undefined;
  let level = list;
  for (const name of path) {
    cur = level.find((n) => n.name === name);
    if (!cur) return undefined;
    level = cur.children ?? [];
  }
  return cur;
};

describe("出生地點滾輪 place tree", () => {
  it("tw: 22 縣市 in official order, 368 鄉鎮市區, 臺 names", () => {
    const tw = placeTree("tw", "zh-hant");
    expect(tw).toHaveLength(22);
    expect(tw.slice(0, 9).map((n) => n.name)).toEqual(["臺北市", "新北市", "桃園市", "臺中市", "臺南市", "高雄市", "基隆市", "新竹市", "嘉義市"]);
    expect(tw.at(-1)!.name).toBe("連江縣");
    expect(leaves(tw)).toHaveLength(368);
    expect(pick(tw, "臺北市")!.children!.map((n) => n.name)).toContain("中正區");
    expect(pick(tw, "臺中市", "霧峰區")!.tz).toBe("Asia/Taipei");
    expect(pick(placeTree("tw", "zh"), "台北市", "万华区")).toBeDefined();
  });

  it("hkmo: 香港 18 區, 澳門 堂區", () => {
    const t = placeTree("hkmo", "zh-hant");
    expect(t.map((n) => n.name)).toEqual(["香港", "澳門"]);
    expect(t[0]!.children).toHaveLength(18);
    expect(t[0]!.children!.every((n) => n.tz === "Asia/Hong_Kong")).toBe(true);
    expect(t[1]!.children!.length).toBeGreaterThanOrEqual(7);
    expect(t[1]!.children!.every((n) => n.tz === "Asia/Macau")).toBe(true);
    expect(pick(placeTree("hkmo", "zh"), "香港", "观塘区")).toBeDefined();
  });

  it("cn: 31 省級 in standard order, ≥330 地級, ≥2700 縣級", () => {
    const cn = placeTree("cn", "zh");
    expect(cn).toHaveLength(31);
    expect(cn.map((n) => n.name).join(" ")).toBe(
      "北京 天津 河北 山西 内蒙古 辽宁 吉林 黑龙江 上海 江苏 浙江 安徽 福建 江西 山东 河南 湖北 湖南 广东 广西 海南 重庆 四川 贵州 云南 西藏 陕西 甘肃 青海 宁夏 新疆",
    );
    expect(cn.reduce((n, p) => n + p.children!.length, 0)).toBeGreaterThanOrEqual(330);
    expect(leaves(cn).length).toBeGreaterThanOrEqual(2700);
    expect(leaves(cn).every((l) => l.tz === "Asia/Shanghai")).toBe(true);
  });

  const SPOTS: Record<"zh" | "zh-hant", string[][]> = {
    zh: [
      ["广东", "梅州市", "梅县区"], ["福建", "莆田市", "仙游县"], ["新疆", "喀什地区", "疏附县"], ["浙江", "温州市", "乐清市"],
      ["四川", "凉山彝族自治州", "西昌市"], ["河北", "石家庄市", "正定县"], ["北京", "北京市", "朝阳区"],
    ],
    "zh-hant": [
      ["廣東", "梅州市", "梅縣區"], ["福建", "莆田市", "仙遊縣"], ["新疆", "喀什地區", "疏附縣"], ["浙江", "溫州市", "樂清市"],
      ["四川", "涼山彝族自治州", "西昌市"], ["河北", "石家莊市", "正定縣"], ["北京", "北京市", "朝陽區"],
    ],
  };
  for (const locale of ["zh", "zh-hant"] as const) {
    it(`cn spot checks (${locale})`, () => {
      const cn = placeTree("cn", locale);
      for (const path of SPOTS[locale]) {
        const leaf = pick(cn, ...path);
        expect(leaf, path.join("→")).toBeDefined();
        expect(leaf!.children).toBeUndefined();
        expect(leaf!.id).toMatch(/^cn:\d{6}$/);
      }
      // coordinates in the right place: 梅縣區 is just west of 梅州 city, 疏附 next to 喀什
      const mei = pick(cn, ...SPOTS[locale][0]!)!;
      expect(Math.abs(mei.lat! - 24.3)).toBeLessThan(0.4);
      expect(Math.abs(mei.lon! - 116.1)).toBeLessThan(0.4);
      const shufu = pick(cn, ...SPOTS[locale][2]!)!;
      expect(Math.abs(shufu.lon! - 75.8)).toBeLessThan(0.6);
    });
  }

  it("intl: the agreed countries first, US/CA/AU by state, ≤60 cities elsewhere, no TW/HK/MO/CN", () => {
    const t = placeTree("intl", "zh-hant");
    expect(t.slice(0, 4).map((n) => n.name)).toEqual(["美國", "加拿大", "馬來西亞", "新加坡"]);
    expect(t.map((n) => n.name)).not.toContain("臺灣");
    expect(pick(t, "美國", "加利福尼亞州", "洛杉磯")).toBeDefined();
    for (const c of t) for (const mid of c.children!) expect(mid.children!.length).toBeLessThanOrEqual(60);
    expect(pick(t, "日本", "日本", "東京")!.tz).toBe("Asia/Tokyo");
  });

  it("every leaf has finite lat/lon, a tz and a unique id; shapes are uniform per tree", () => {
    for (const r of TREE_REGIONS) {
      for (const locale of ["zh", "zh-hant"] as const) {
        const t = placeTree(r, locale);
        const ls = leaves(t);
        expect(ls.length).toBeGreaterThan(0);
        for (const l of ls) {
          expect(Number.isFinite(l.lat) && Number.isFinite(l.lon), l.name).toBe(true);
          expect(Math.abs(l.lat!)).toBeLessThanOrEqual(90);
          expect(Math.abs(l.lon!)).toBeLessThanOrEqual(180);
          expect(l.tz).toMatch(/^[A-Za-z_]+\/[A-Za-z_\-/]+$/);
          expect(l.id!.startsWith(r + ":")).toBe(true);
        }
        expect(new Set(ls.map((l) => l.id)).size).toBe(ls.length);
        const depth = r === "tw" || r === "hkmo" ? 2 : 3;
        const depthOf = (n: TreeNode): number => (n.children ? 1 + Math.max(...n.children.map(depthOf)) : 0);
        for (const n of t) expect(depthOf(n)).toBe(depth - 1);
      }
    }
  });

  it("the two scripts line up leaf for leaf", () => {
    for (const r of TREE_REGIONS) {
      const a = leaves(placeTree(r, "zh")), b = leaves(placeTree(r, "zh-hant"));
      expect(a.map((l) => l.id)).toEqual(b.map((l) => l.id));
    }
  });
});
