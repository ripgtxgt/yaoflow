/** 10-30 进度表 128 ⑥: how two of the five elements meet — shared by the server and the name form in the browser */
/** how two elements meet (生 = the first feeds the second, 剋 = the first checks the second) */
const SHENG: Record<string, string> = { 木: "火", 火: "土", 土: "金", 金: "水", 水: "木" };
const KE: Record<string, string> = { 木: "土", 土: "水", 水: "火", 火: "金", 金: "木" };
export function relation(a: string, b: string): "same" | "gives" | "gets" | "checks" | "checked" {
  if (a === b) return "same";
  if (SHENG[a] === b) return "gives";
  if (SHENG[b] === a) return "gets";
  if (KE[a] === b) return "checks";
  return "checked";
}
