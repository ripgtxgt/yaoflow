import GEN from "../data/l10n/jiaobei.json";
import type { Foreign, Generated } from "./l10n/core";
import { localize } from "./l10n/server";
import { NARROW_EXAMPLES, NOTES, SIGN_TEXT } from "./jiaobei";
import { JB_UI_HANT, type JiaobeiUi } from "./jiaobei-ui";

/**
 * 10-30 进度表 128 ⑤ (Neil 10-29: 擲筊照原样翻译介绍) — the 擲筊 page in the seven other languages: the same practice as a
 * Taiwanese temple does it, explained for a reader who has never held moon blocks. The 繁體 copy stays where it is
 * (lib/jiaobei.ts, lib/jiaobei-ui.ts); this tree collects it with the page's own lines for the translator
 * (scripts/l10n/registry.ts `jiaobei`). Server only.
 */
const PAGE = {
  metaTitle: "線上擲筊｜聖筊、笑筊、陰筊是什麼，一件事擲一次",
  metaDesc: "免費線上擲筊：先寫下想問的一件事，擲一次，或問大事擲到三個聖筊。聖筊約一半、笑筊與陰筊各約四分之一，附正確擲筊步驟、求籤要幾個聖筊、連續笑筊怎麼辦。",
  title: "線上擲筊",
  lead: "心裡先想好一件具體的事再擲。聖筊可以接著抽一支籤；陰筊可以起一卦看這件事哪幾天有動靜。",
  leadNoQian: "心裡先想好一件具體的事再擲。結果是一個方向；想知道這件事哪幾天會有動靜，可以接著起一卦。",
  toQiuqian: "直接線上求籤（先擲筊請示，再抽籤、確認籤號）→",
  toTarot: "用塔羅看這件事現在怎樣 →",
  toXunwu: "東西不見了？擲三顆骰子，看先往哪裡找 →",
  fitYes: ["一件具體的事：誰、什麼事、什麼時間範圍", "去廟裡之前，先把想問的事想清楚", "日常小事擲一次；問大事擲到三個聖筊"],
  fitNo: ["一次問好幾件事，或問法還很模糊", "為了想要的結果一直重擲", "取代到廟裡親手擲筊"],
  how: ["寫下想問的一件事。", "擲一次，接受第一個杯象；問大事可以擲到三個聖筊，中途出現陰筊就停。", "聖筊可以接著抽一支籤；陰筊或笑筊，可以起一卦看這件事哪幾天有動靜。"],
  howNoQian: ["寫下想問的一件事。", "擲一次，接受第一個杯象；問大事可以擲到三個聖筊，中途出現陰筊就停。", "想知道這件事哪幾天會有動靜，可以接著起一卦。"],
  free: "擲筊免費，登入就能用。",
  boundary: ["結果是給你參考的方向，不是保證。", "連續笑筊，先把問題縮到一件事、一個時間範圍再擲。"],
  disclaimer: "機率出處：台灣嘉義市第 37 屆科展國小組「擲出我的幸福滿杯」等科展實測。",
};

export const JB_HANT = {
  page: PAGE,
  ui: JB_UI_HANT,
  signs: SIGN_TEXT,
  examples: [...NARROW_EXAMPLES],
  notes: NOTES,
};
type Widen<T> = T extends string ? string : T extends readonly (infer U)[] ? Widen<U>[] : { [K in keyof T]: Widen<T[K]> };
export type JbText = Widen<typeof JB_HANT>;
/** the 擲筊 page's words in one of the seven other languages */
export const jbText = (l: Foreign): JbText => localize(JB_HANT as unknown as JbText, GEN as unknown as Generated, l);

/** the flow's words (components/JiaobeiFlow.tsx) for a foreign page — the same shape as jiaobeiUi() */
export function jiaobeiUiIn(l: Foreign): JiaobeiUi {
  const T = jbText(l);
  return { ...(T.ui as unknown as JiaobeiUi), signs: T.signs as JiaobeiUi["signs"], examples: T.examples };
}
