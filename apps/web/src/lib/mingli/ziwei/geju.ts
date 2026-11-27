import { BRANCHES, sanFang, type ZiweiView, type ZPalace } from "./chart";

/**
 * 10-19 紫微「看懂這張盤」② — 格局 by fixed rules on the natal chart (iztro data, the zh-TW view as keys).
 *
 * Each 格 has: the conditions (`rule`), where it is written (`source`), and what spoils it (`breakRule`).
 * Status:
 *   成   — every condition met, nothing spoiling it
 *   半成 — the core is there but a supporting condition is missing, or a light spoiler (one 煞 in the key palace,
 *          化忌 in the 三方四正, three 煞 around, 羊陀／空劫 flanking)
 *   破   — the core is there but a heavy spoiler hits: 化忌 in the key palace or on one of the 格's own stars, 地空／地劫
 *          in the key palace, two or more of 羊陀火鈴 in the key palace, or four or more 煞 in its 三方四正
 * The key palace is 命宮 unless the 格 lives elsewhere (祿馬交馳: the palace where 祿 and 馬 meet).
 * Facts and spoilers come out as small records ({k, s, p, b, x}) so the page can word them in the reader's script.
 *
 * Sources: verses as commonly cited from 《紫微斗數全書》（〈骨髓賦〉〈格局〉諸篇） and 《紫微斗數全集》; the exact
 * wording follows the usual modern citations (not checked line by line against a scanned edition).
 */
export type GStatus = "成" | "半成" | "破";
/** a fact or spoiler: k = kind (worded on the page), s = star names, p = palace name, b = branch, x = extra value */
export interface GFact { k: string; s?: string[]; p?: string; b?: string; x?: string }
export interface GejuHit { id: string; name: string; tier: number; status: GStatus; facts: GFact[]; missing: GFact[]; breaks: (GFact & { heavy: boolean })[] }

interface Ctx {
  v: ZiweiView; S: string; sf: string[]; flank: [string, string]; opp: string; yearStem: string;
  at: (b: string) => ZPalace; has: (b: string, star: string) => boolean; where: (star: string) => string | null;
  star: (star: string) => { name: string; bright?: string; mut?: string } | null; name: (b: string) => string;
  majors: (b: string) => string[]; mut: (m: string) => { star: string; b: string } | null;
}
interface Test { facts: GFact[]; missing?: GFact[]; keys?: string[]; ignore?: string[]; core: string[] }
export interface GejuDef { id: string; name: string; tier: number; source: string; rule: string; breakRule: string; test: (c: Ctx) => Test | null }

const SHA = ["擎羊", "陀羅", "火星", "鈴星", "地空", "地劫"];
const BRIGHT = ["廟", "旺"];
const DIM = ["陷", "不"];
const STD_BREAK = "化忌、地空地劫入命為破；羊陀火鈴兩顆以上同宮為破，一顆為減分；三方四正煞多或化忌會照、羊陀／空劫夾命為減分。";
const off = (b: string, k: number) => BRANCHES[(BRANCHES.indexOf(b as (typeof BRANCHES)[number]) + k + 12) % 12]!;

function ctxOf(v: ZiweiView): Ctx {
  const S = v.soulBranch;
  const at = (b: string) => v.palaces.find((p) => p.branch === b)!;
  const all = (p: ZPalace) => [...p.major, ...p.minor];
  const has = (b: string, star: string) => all(at(b)).some((s) => s.name === star);
  const where = (star: string) => v.palaces.find((p) => all(p).some((s) => s.name === star))?.branch ?? null;
  const star = (n: string) => { for (const p of v.palaces) { const s = all(p).find((x) => x.name === n); if (s) return s; } return null; };
  const mut = (m: string) => { for (const p of v.palaces) { const s = all(p).find((x) => x.mut === m); if (s) return { star: s.name, b: p.branch }; } return null; };
  return {
    v, S, sf: sanFang(S), flank: [off(S, -1), off(S, 1)], opp: off(S, 6), yearStem: v.chineseDate.slice(0, 1),
    at, has, where, star, name: (b) => at(b).name, majors: (b) => at(b).major.map((s) => s.name), mut,
  };
}

/** 坐命: every star in 命宮 (optionally only in the given branches) */
const sits = (c: Ctx, stars: string[], branches?: string[]): Test | null => {
  if (branches && !branches.includes(c.S)) return null;
  if (!stars.every((s) => c.has(c.S, s))) return null;
  return { facts: [{ k: stars.length > 1 ? "same" : "in", s: stars, p: c.name(c.S), b: c.S }], core: stars };
};
/** two stars on both sides of 命宮 */
const flanks = (c: Ctx, a: string, b: string): Test | null => {
  const [l, r] = c.flank;
  if (!((c.has(l, a) && c.has(r, b)) || (c.has(l, b) && c.has(r, a)))) return null;
  return { facts: [{ k: "flank", s: [a, b], p: c.name(c.S) }], core: [a, b] };
};
/** every star somewhere in 命宮's 三方四正 */
const meets = (c: Ctx, stars: string[]) => stars.every((s) => { const w = c.where(s); return w !== null && c.sf.includes(w); });
const brightFact = (c: Ctx, s: string): GFact | null => { const x = c.star(s)?.bright; return x ? { k: "bright", s: [s], x } : null; };
const notDim = (c: Ctx, stars: string[]): GFact[] => stars.filter((s) => DIM.includes(c.star(s)?.bright ?? "")).map((s) => ({ k: "dim", s: [s], x: c.star(s)!.bright! }));

export const GEJU: GejuDef[] = [
  {
    id: "zifu-tonggong", name: "紫府同宮格", tier: 1, source: "《紫微斗數全書》〈骨髓賦〉：「紫府同宮，終身福厚。」",
    rule: "命宮在寅或申，紫微、天府同坐命宮。", breakRule: STD_BREAK, test: (c) => sits(c, ["紫微", "天府"]),
  },
  {
    id: "zifu-chaoyuan", name: "紫府朝垣格", tier: 1, source: "《紫微斗數全書》格局：紫府朝垣（「紫府朝垣，食祿萬鍾」）。",
    rule: "命宮不坐紫微、天府，紫微與天府分在財帛、官祿兩宮，從三方拱照命宮。", breakRule: STD_BREAK,
    test: (c) => {
      const w = [c.where("紫微"), c.where("天府")];
      if (w.includes(c.S) || !w.every((b) => b && b !== c.S && c.sf.slice(1, 3).includes(b))) return null;
      return { facts: [{ k: "trine", s: ["紫微", "天府"], p: c.name(c.S) }], core: ["紫微", "天府"] };
    },
  },
  {
    id: "fuxiang-chaoyuan", name: "府相朝垣格", tier: 1, source: "《紫微斗數全書》〈骨髓賦〉：「府相朝垣，千鍾食祿。」",
    rule: "命宮不坐天府、天相，天府與天相分在財帛、官祿兩宮，從三方拱照命宮。", breakRule: STD_BREAK,
    test: (c) => {
      const w = [c.where("天府"), c.where("天相")];
      if (!w.every((b) => b && b !== c.S && c.sf.slice(1, 3).includes(b))) return null;
      return { facts: [{ k: "trine", s: ["天府", "天相"], p: c.name(c.S) }], core: ["天府", "天相"] };
    },
  },
  {
    id: "jiyue-tongliang", name: "機月同梁格", tier: 3, source: "《紫微斗數全書》〈骨髓賦〉：「機月同梁作吏人。」",
    rule: "天機、太陰、天同、天梁四星都在命宮的三方四正。", breakRule: STD_BREAK,
    test: (c) => (meets(c, ["天機", "太陰", "天同", "天梁"]) ? { facts: [{ k: "sanfang", s: ["天機", "太陰", "天同", "天梁"], p: c.name(c.S) }], core: ["天機", "太陰", "天同", "天梁"] } : null),
  },
  {
    id: "shapolang", name: "殺破狼格", tier: 3, source: "《紫微斗數全書》諸星問答：七殺、破軍、貪狼三星在三方相會。",
    rule: "命宮坐七殺、破軍或貪狼，另外兩顆必在三方會照。", breakRule: STD_BREAK,
    test: (c) => {
      const s = ["七殺", "破軍", "貪狼"].find((x) => c.majors(c.S).includes(x));
      return s ? { facts: [{ k: "in", s: [s], p: c.name(c.S), b: c.S }, { k: "sanfang", s: ["七殺", "破軍", "貪狼"], p: c.name(c.S) }], core: ["七殺", "破軍", "貪狼"] } : null;
    },
  },
  {
    id: "riyue-bingming", name: "日月並明格", tier: 1, source: "《紫微斗數全書》：「日月並明，佐九重於堯殿。」",
    rule: "太陽、太陰都在命宮三方四正（不同宮），而且都在廟旺之位。", breakRule: `${STD_BREAK}太陽或太陰化忌為破。`,
    test: (c) => {
      const a = c.where("太陽"), b = c.where("太陰");
      if (!a || !b || a === b || !c.sf.includes(a) || !c.sf.includes(b)) return null;
      if (!BRIGHT.includes(c.star("太陽")?.bright ?? "") || !BRIGHT.includes(c.star("太陰")?.bright ?? "")) return null;
      return { facts: [{ k: "sanfang", s: ["太陽", "太陰"], p: c.name(c.S) }, brightFact(c, "太陽")!, brightFact(c, "太陰")!], core: ["太陽", "太陰"] };
    },
  },
  {
    id: "rizhao-leimen", name: "日照雷門格", tier: 2, source: "《紫微斗數全書》：「日照雷門，富貴榮華。」（太陽在卯）",
    rule: "太陽在卯宮坐命。", breakRule: `${STD_BREAK}太陽化忌為破。`, test: (c) => sits(c, ["太陽"], ["卯"]),
  },
  {
    id: "yuelang-tianmen", name: "月朗天門格", tier: 2, source: "《紫微斗數全書》：「月朗天門，進爵封侯。」（太陰在亥）",
    rule: "太陰在亥宮坐命。", breakRule: `${STD_BREAK}太陰化忌為破。`, test: (c) => sits(c, ["太陰"], ["亥"]),
  },
  {
    id: "mingzhu-chuhai", name: "明珠出海格", tier: 1, source: "《紫微斗數全書》：「明珠出海，財官雙美。」",
    rule: "命宮在未、沒有主星，太陽在卯、太陰在亥，從三合拱照。", breakRule: `${STD_BREAK}太陽或太陰化忌為破。`,
    test: (c) => (c.S === "未" && c.majors("未").length === 0 && c.has("卯", "太陽") && c.has("亥", "太陰")
      ? { facts: [{ k: "empty", p: c.name(c.S), b: "未" }, { k: "in", s: ["太陽"], p: c.name("卯"), b: "卯" }, { k: "in", s: ["太陰"], p: c.name("亥"), b: "亥" }], core: ["太陽", "太陰"] } : null),
  },
  {
    id: "riyue-jiaming", name: "日月夾命格", tier: 2, source: "《紫微斗數全書》〈骨髓賦〉：「日月夾命，不權則富。」",
    rule: "太陽、太陰分在命宮兩旁的兄弟、父母宮；兩星不落陷才完整。", breakRule: `${STD_BREAK}太陽或太陰化忌為破。`,
    test: (c) => { const t = flanks(c, "太陽", "太陰"); return t && { ...t, missing: notDim(c, ["太陽", "太陰"]) }; },
  },
  {
    id: "shizhong-yinyu", name: "石中隱玉格", tier: 2, source: "《紫微斗數全書》：「巨門子午科權祿，石中隱玉福興隆。」",
    rule: "巨門在子或午坐命；巨門帶化祿、化權或化科才完整。", breakRule: `${STD_BREAK}巨門化忌為破。`,
    test: (c) => {
      const t = sits(c, ["巨門"], ["子", "午"]);
      if (!t) return null;
      const m = c.star("巨門")?.mut;
      return { ...t, facts: m && m !== "忌" ? [...t.facts, { k: "mut", s: ["巨門"], x: m }] : t.facts, missing: m && m !== "忌" ? [] : [{ k: "needMut", s: ["巨門"] }] };
    },
  },
  {
    id: "yingxing-rumiao", name: "英星入廟格", tier: 2, source: "《紫微斗數全書》：「破軍子午為官清顯。」（英星即破軍）",
    rule: "破軍在子或午坐命（入廟）。", breakRule: STD_BREAK, test: (c) => sits(c, ["破軍"], ["子", "午"]),
  },
  {
    id: "qisha-chaodou", name: "七殺朝斗格", tier: 2, source: "《紫微斗數全書》〈骨髓賦〉：「七殺朝斗，爵祿榮昌。」",
    rule: "七殺在寅、申、子、午坐命，紫微在對宮相照（寅申為朝斗，子午為仰斗）。", breakRule: STD_BREAK,
    test: (c) => {
      const t = sits(c, ["七殺"], ["寅", "申", "子", "午"]);
      if (!t || !c.has(c.opp, "紫微")) return null;
      return { ...t, facts: [...t.facts, { k: "opp", s: ["紫微"], p: c.name(c.opp), b: c.opp }], core: ["七殺", "紫微"] };
    },
  },
  {
    id: "jixiang-liming", name: "極向離明格", tier: 1, source: "《紫微斗數全書》：「紫微居午無刑忌，甲丁己生人位至公卿。」",
    rule: "紫微在午宮坐命；生年天干為甲、丁、己才完整。", breakRule: `${STD_BREAK}擎羊（刑）、化忌同宮為破。`,
    test: (c) => {
      const t = sits(c, ["紫微"], ["午"]);
      if (!t) return null;
      return { ...t, facts: [...t.facts, { k: "stem", x: c.yearStem }], missing: "甲丁己".includes(c.yearStem) ? [] : [{ k: "stemNot", x: c.yearStem }] };
    },
  },
  {
    id: "junchen-qinghui", name: "君臣慶會格", tier: 1, source: "《紫微斗數全書》〈骨髓賦〉：「紫微輔弼同宮，一呼百諾居上品。」",
    rule: "紫微坐命，左輔、右弼都在命宮的三方四正（或夾命）。", breakRule: STD_BREAK,
    test: (c) => {
      const t = sits(c, ["紫微"]);
      if (!t) return null;
      const ok = ["左輔", "右弼"].every((s) => { const w = c.where(s); return w && (c.sf.includes(w) || c.flank.includes(w)); });
      return ok ? { ...t, facts: [...t.facts, { k: "sanfang", s: ["左輔", "右弼"], p: c.name(c.S) }], core: ["紫微", "左輔", "右弼"] } : null;
    },
  },
  {
    id: "wutan-tongxing", name: "武貪同行格", tier: 2, source: "《紫微斗數全書》：「武曲貪狼同行」（武貪丑未同宮，「武貪不發少年人」）。",
    rule: "武曲、貪狼在丑或未同坐命宮。", breakRule: `${STD_BREAK}武曲或貪狼化忌為破。`, test: (c) => sits(c, ["武曲", "貪狼"]),
  },
  {
    id: "huotan", name: "火貪格", tier: 2, source: "《紫微斗數全書》：「貪狼火星居廟旺，名鎮諸邦。」",
    rule: "貪狼坐命，火星同宮；火星在對宮相照為次。貪狼不落陷才完整。", breakRule: `${STD_BREAK}（火星本身不算煞）貪狼化忌為破。`,
    test: (c) => {
      if (!c.majors(c.S).includes("貪狼")) return null;
      const same = c.has(c.S, "火星"), across = c.has(c.opp, "火星");
      if (!same && !across) return null;
      return {
        facts: [{ k: same ? "same" : "in", s: same ? ["貪狼", "火星"] : ["貪狼"], p: c.name(c.S), b: c.S }, ...(same ? [] : [{ k: "opp", s: ["火星"], p: c.name(c.opp), b: c.opp }])],
        missing: [...(same ? [] : [{ k: "notSame", s: ["火星"] }]), ...notDim(c, ["貪狼"])], ignore: ["火星"], core: ["貪狼"],
      };
    },
  },
  {
    id: "lingtan", name: "鈴貪格", tier: 2, source: "《紫微斗數全書》：「貪狼鈴星，武職權威」（鈴貪並論）。",
    rule: "貪狼坐命，鈴星同宮；鈴星在對宮相照為次。貪狼不落陷才完整。", breakRule: `${STD_BREAK}（鈴星本身不算煞）貪狼化忌為破。`,
    test: (c) => {
      if (!c.majors(c.S).includes("貪狼")) return null;
      const same = c.has(c.S, "鈴星"), across = c.has(c.opp, "鈴星");
      if (!same && !across) return null;
      return {
        facts: [{ k: same ? "same" : "in", s: same ? ["貪狼", "鈴星"] : ["貪狼"], p: c.name(c.S), b: c.S }, ...(same ? [] : [{ k: "opp", s: ["鈴星"], p: c.name(c.opp), b: c.opp }])],
        missing: [...(same ? [] : [{ k: "notSame", s: ["鈴星"] }]), ...notDim(c, ["貪狼"])], ignore: ["鈴星"], core: ["貪狼"],
      };
    },
  },
  {
    id: "changqu-jiaming", name: "昌曲夾命格", tier: 2, source: "《紫微斗數全書》：「昌曲夾命最為奇。」",
    rule: "文昌、文曲分在命宮兩旁的兄弟、父母宮。", breakRule: `${STD_BREAK}文昌或文曲化忌為破。`, test: (c) => flanks(c, "文昌", "文曲"),
  },
  {
    id: "zuoyou-jiaming", name: "左右夾命格", tier: 2, source: "《紫微斗數全書》：「左右夾命」（輔弼夾命，為貴）。",
    rule: "左輔、右弼分在命宮兩旁的兄弟、父母宮。", breakRule: STD_BREAK, test: (c) => flanks(c, "左輔", "右弼"),
  },
  {
    id: "kuiyue-jiaming", name: "魁鉞夾命格", tier: 2, source: "《紫微斗數全書》：天乙貴人魁鉞夾命。",
    rule: "天魁、天鉞分在命宮兩旁的兄弟、父母宮。", breakRule: STD_BREAK, test: (c) => flanks(c, "天魁", "天鉞"),
  },
  {
    id: "zuogui-xianggui", name: "坐貴向貴格", tier: 2, source: "《紫微斗數全書》：「坐貴向貴」（魁鉞一坐命一在遷移）。",
    rule: "天魁、天鉞一顆坐命，另一顆在對宮遷移。", breakRule: STD_BREAK,
    test: (c) => {
      const k = c.has(c.S, "天魁") && c.has(c.opp, "天鉞") ? ["天魁", "天鉞"] : c.has(c.S, "天鉞") && c.has(c.opp, "天魁") ? ["天鉞", "天魁"] : null;
      return k ? { facts: [{ k: "in", s: [k[0]!], p: c.name(c.S), b: c.S }, { k: "opp", s: [k[1]!], p: c.name(c.opp), b: c.opp }], core: k } : null;
    },
  },
  {
    id: "luma-jiaochi", name: "祿馬交馳格", tier: 2, source: "《紫微斗數全書》〈骨髓賦〉：「祿馬交馳，發財遠郡。」",
    rule: "天馬與祿存或化祿同宮，這一宮在命宮的三方四正。", breakRule: `${STD_BREAK}（看祿馬所在的那一宮）`,
    test: (c) => {
      const b = c.where("天馬");
      if (!b || !c.sf.includes(b)) return null;
      const lu = c.has(b, "祿存") ? "祿存" : [...c.at(b).major, ...c.at(b).minor].find((s) => s.mut === "祿")?.name;
      if (!lu) return null;
      return { facts: [{ k: "same", s: ["天馬", lu === "祿存" ? lu : `${lu}化祿`], p: c.name(b), b }], keys: [b], core: ["天馬", lu] };
    },
  },
  {
    id: "shuanglu-chaoyuan", name: "雙祿朝垣格", tier: 2, source: "《紫微斗數全書》：「雙祿朝垣」（祿存、化祿拱命）。",
    rule: "祿存與化祿都在命宮的三方四正。", breakRule: STD_BREAK,
    test: (c) => {
      const a = c.where("祿存"), m = c.mut("祿");
      if (!a || !m || !c.sf.includes(a) || !c.sf.includes(m.b)) return null;
      return { facts: [{ k: "sanfang", s: ["祿存", `${m.star}化祿`], p: c.name(c.S) }], core: ["祿存", m.star] };
    },
  },
  {
    id: "sanqi-jiahui", name: "三奇加會格", tier: 1, source: "《紫微斗數全書》：「科權祿拱，名譽昭彰。」",
    rule: "生年化祿、化權、化科三顆都在命宮的三方四正。", breakRule: STD_BREAK,
    test: (c) => {
      const ms = ["祿", "權", "科"].map((m) => c.mut(m));
      if (!ms.every((m) => m && c.sf.includes(m.b))) return null;
      return { facts: [{ k: "sanfang", s: ms.map((m, i) => `${m!.star}化${"祿權科"[i]}`), p: c.name(c.S) }], core: ms.map((m) => m!.star) };
    },
  },
  {
    id: "yangliang-changlu", name: "陽梁昌祿格", tier: 1, source: "《紫微斗數全書》：「陽梁昌祿，傳臚第一名。」",
    rule: "太陽、天梁、文昌、祿存（或化祿）都在命宮的三方四正。", breakRule: `${STD_BREAK}文昌化忌為破。`,
    test: (c) => {
      if (!meets(c, ["太陽", "天梁", "文昌"])) return null;
      const r = c.where("祿存"), m = c.mut("祿");
      const lu = r && c.sf.includes(r) ? "祿存" : m && c.sf.includes(m.b) ? `${m.star}化祿` : null;
      return lu ? { facts: [{ k: "sanfang", s: ["太陽", "天梁", "文昌", lu], p: c.name(c.S) }], core: ["太陽", "天梁", "文昌"] } : null;
    },
  },
  {
    id: "wengui-wenhua", name: "文桂文華格", tier: 2, source: "《紫微斗數全書》：「文桂文華」（昌曲丑未坐命）。",
    rule: "文昌、文曲在丑或未同坐命宮。", breakRule: `${STD_BREAK}文昌或文曲化忌為破。`, test: (c) => sits(c, ["文昌", "文曲"], ["丑", "未"]),
  },
  {
    id: "rili-zhongtian", name: "日麗中天格", tier: 2, source: "《紫微斗數全書》：太陽居午，「日麗中天」（又稱金燦光輝）。",
    rule: "太陽在午宮坐命。", breakRule: `${STD_BREAK}太陽化忌為破。`, test: (c) => sits(c, ["太陽"], ["午"]),
  },
  {
    id: "yuesheng-canghai", name: "月生滄海格", tier: 2, source: "《紫微斗數全書》：「月生滄海」（同陰在子）。",
    rule: "太陰、天同在子宮同坐命宮。", breakRule: `${STD_BREAK}太陰或天同化忌為破。`, test: (c) => sits(c, ["天同", "太陰"], ["子"]),
  },
  {
    id: "shouxing-rumiao", name: "壽星入廟格", tier: 2, source: "《紫微斗數全書》：「壽星入廟」（天梁在午）。",
    rule: "天梁在午宮坐命。", breakRule: STD_BREAK, test: (c) => sits(c, ["天梁"], ["午"]),
  },
  {
    id: "shanyin-chaogang", name: "善蔭朝綱格", tier: 2, source: "《紫微斗數全書》〈骨髓賦〉：「機梁善談兵。」（機梁辰戌）",
    rule: "天機、天梁在辰或戌同坐命宮。", breakRule: `${STD_BREAK}天機化忌為破。`, test: (c) => sits(c, ["天機", "天梁"], ["辰", "戌"]),
  },
  {
    id: "juri-tonggong", name: "巨日同宮格", tier: 2, source: "《紫微斗數全書》〈骨髓賦〉：「巨日同宮，官封三代。」",
    rule: "巨門、太陽同坐命宮；在寅最完整，在申次之。", breakRule: `${STD_BREAK}巨門或太陽化忌為破。`,
    test: (c) => { const t = sits(c, ["太陽", "巨門"]); return t && { ...t, missing: c.S === "寅" ? [] : [{ k: "branchNot", b: c.S, x: "寅" }] }; },
  },
  {
    id: "jiju-tonglin", name: "機巨同臨格", tier: 2, source: "《紫微斗數全書》〈骨髓賦〉：「巨機同臨，公卿之位。」",
    rule: "天機、巨門同坐命宮；在卯最完整，在酉次之。", breakRule: `${STD_BREAK}天機或巨門化忌為破。`,
    test: (c) => { const t = sits(c, ["天機", "巨門"]); return t && { ...t, missing: c.S === "卯" ? [] : [{ k: "branchNot", b: c.S, x: "卯" }] }; },
  },
  {
    id: "xiongsu-chaoyuan", name: "雄宿朝元格", tier: 2, source: "《紫微斗數全書》：「雄宿朝元」（廉貞寅申坐命）。",
    rule: "廉貞在寅或申坐命（獨坐，入廟）。", breakRule: `${STD_BREAK}廉貞化忌為破。`, test: (c) => sits(c, ["廉貞"], ["寅", "申"]),
  },
  {
    id: "jiangxing-dedi", name: "將星得地格", tier: 2, source: "《紫微斗數全書》〈骨髓賦〉：「武曲廟垣，威名赫奕。」",
    rule: "武曲在辰或戌坐命（入廟）。", breakRule: `${STD_BREAK}武曲化忌為破。`, test: (c) => sits(c, ["武曲"], ["辰", "戌"]),
  },
];

/** what spoils a 格 at its key palace(s) */
function breaksOf(c: Ctx, keys: string[], ignore: string[], core: string[]): GejuHit["breaks"] {
  const out: GejuHit["breaks"] = [];
  const sha = SHA.filter((s) => !ignore.includes(s));
  const scope = [...new Set(keys.flatMap((k) => sanFang(k)))];
  for (const b of keys) {
    const pal = c.at(b), all = [...pal.major, ...pal.minor];
    for (const s of all) if (s.mut === "忌") out.push({ k: "ji", s: [s.name], p: pal.name, heavy: true });
    const kj = all.filter((s) => (s.name === "地空" || s.name === "地劫") && sha.includes(s.name)).map((s) => s.name);
    if (kj.length) out.push({ k: "sha", s: kj, p: pal.name, heavy: true });
    const sh = all.filter((s) => ["擎羊", "陀羅", "火星", "鈴星"].includes(s.name) && sha.includes(s.name)).map((s) => s.name);
    if (sh.length) out.push({ k: "sha", s: sh, p: pal.name, heavy: sh.length >= 2 });
    for (const [x, y] of [["擎羊", "陀羅"], ["地空", "地劫"]] as const) {
      const [l, r] = [off(b, -1), off(b, 1)];
      if (sha.includes(x) && ((c.has(l, x) && c.has(r, y)) || (c.has(l, y) && c.has(r, x)))) out.push({ k: "jia", s: [x, y], p: pal.name, heavy: false });
    }
  }
  for (const b of scope.filter((x) => !keys.includes(x))) {
    const pal = c.at(b);
    for (const s of [...pal.major, ...pal.minor]) if (s.mut === "忌") out.push({ k: core.includes(s.name) ? "jiCore" : "jiSf", s: [s.name], p: pal.name, heavy: core.includes(s.name) });
  }
  // the 格's own stars turned 忌 wherever they sit (a flanking 文昌化忌, a 太陽化忌 across …)
  for (const s of core) {
    const m = c.mut("忌");
    if (m && m.star === s && !out.some((x) => x.s?.[0] === s && (x.k === "ji" || x.k === "jiCore"))) {
      out.push({ k: "jiCore", s: [s], p: c.name(m.b), heavy: true });
      const i = out.findIndex((x) => x.k === "jiSf" && x.s?.[0] === s);
      if (i >= 0) out.splice(i, 1);
    }
  }
  const n = scope.reduce((a, b) => a + [...c.at(b).minor].filter((s) => sha.includes(s.name)).length, 0);
  if (n >= 3) out.push({ k: "shaMany", x: String(n), heavy: n >= 4 });
  return out;
}

const ORDER: Record<GStatus, number> = { 成: 0, 半成: 1, 破: 2 };

/** every 格 the chart shows, strongest first (成 before 半成 before 破, then the better-known ones) */
export function gejuOf(v: ZiweiView): GejuHit[] {
  const c = ctxOf(v);
  const hits: (GejuHit & { i: number })[] = [];
  GEJU.forEach((d, i) => {
    const t = d.test(c);
    if (!t) return;
    const breaks = breaksOf(c, t.keys ?? [c.S], t.ignore ?? [], t.core);
    const missing = t.missing ?? [];
    const status: GStatus = breaks.some((b) => b.heavy) ? "破" : breaks.length || missing.length ? "半成" : "成";
    hits.push({ id: d.id, name: d.name, tier: d.tier, status, facts: t.facts, missing, breaks, i });
  });
  return hits.sort((a, b) => ORDER[a.status] - ORDER[b.status] || a.tier - b.tier || a.i - b.i).map(({ i: _i, ...h }) => h);
}

export const gejuById = (id: string) => GEJU.find((g) => g.id === id) ?? null;
