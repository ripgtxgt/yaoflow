import SENSOJI from "../data/qian-sensoji.json";
import GUANYIN from "../data/qian-guanyin.json";

/**
 * 10-30 进度表 128 ⑤ (Neil 10-29: 籤類——日文おみくじ（淺草寺）、其他語言觀音籤翻譯) — the 繁體 sources the lot library is
 * translated from: Japanese readers get the 淺草寺觀音籤 (the おみくじ of Sensō-ji, the Japanese temple's own hundred lots),
 * every other foreign language the 觀音一百籤. The poem stays as written (Japanese readers read the 漢詩 as it is printed on
 * the slip; the others get it with the plain reading). Translated by scripts/l10n (`qianja`, `qiangy`).
 */
type Entry = { num: number; title: string; plain: string; overall: string; love: string; work: string; ask_next: string; yi: string; ji: string };
const pick = (es: Entry[]) => Object.fromEntries(es.map((e) => [String(e.num), { title: e.title, plain: e.plain, overall: e.overall, love: e.love, work: e.work, ask_next: e.ask_next, yi: e.yi, ji: e.ji }]));
export const QIAN_JA_HANT = pick((SENSOJI as unknown as { entries: Entry[] }).entries);
export const QIAN_GY_HANT = pick((GUANYIN as unknown as { entries: Entry[] }).entries);
