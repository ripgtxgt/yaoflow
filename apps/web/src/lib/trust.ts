import type { Locale } from "./i18n";
import { contentFor } from "./content";
import { TRUST_L10N } from "./dict/trust-l10n";

/** 首页信任区块 + About 页共用的内容。所有引用均为真实公开来源。 */

type Extra<T> = Partial<Record<"ja" | "ko" | "fr" | "de" | "es" | "pt", T>>;

export interface TrustPoint extends Extra<{ title: string; body: string }> {
  k: string;
  "zh-hant"?: { title: string; body: string };
  zh: { title: string; body: string };
  en: { title: string; body: string };
}

const TRUST_POINTS_SRC: TrustPoint[] = [
  {
    k: "text",
    zh: {
      title: "文本是真的",
      body: "六十四卦的卦辞、三百八十四条爻辞，全部照录通行本《周易》原文（维基文库公有领域），繁体原样保留，简体经转换校订。你在这里读到的每一句经文，都能在古籍里逐字对上。",
    },
    en: {
      title: "The text is the real text",
      body: "All 64 judgments and 384 line statements are the received Zhouyi, transcribed from the public-domain Chinese Wikisource edition — not paraphrased, not invented. English renderings are our own editorial work, informed by Legge's 1882 public-domain translation.",
    },
  },
  {
    k: "engine",
    zh: {
      title: "盘照古法排",
      body: "纳甲、八宫世应、六亲六神、旬空月破、旺衰，全照《卜筮正宗》《京氏易传》的老规矩排。你看到的每一条，古书里都查得到。",
    },
    // 10-12 进度表 39 (Neil: 首页不出现「AI」，分工只在 /about): the 繁體 wording as written, not left to the converter
    "zh-hant": {
      title: "盤照古法排",
      body: "納甲、八宮世應、六親六神、旬空月破、旺衰，全照《卜筮正宗》《京氏易傳》的老規矩排。你看到的每一條，古書裡都查得到。",
    },
    en: {
      title: "The chart follows the old rules",
      body: "Najia stems and branches, the eight palaces with their self and other lines, the six relations and six spirits, voids and month clashes, seasonal strength — all laid out by the old rules of the classical manuals Bushi Zhengzong and Jingshi Yizhuan. Every item you see can be looked up in those books.",
    },
  },
  {
    k: "honest",
    zh: {
      title: "不承诺预测，只帮你看清",
      body: "我们不说「你一定会」，不卖开运，不做医疗、法律、投资建议。这是一套有三千年文献传统的符号系统，用来给悬而未决的事一个可以思考的结构——最后的决定始终是你自己的。",
    },
    en: {
      title: "No promises about your future",
      body: "We don't tell you what will happen, we don't sell luck, and we give no medical, legal, or financial advice. This is a symbolic system with three millennia of textual tradition behind it, used here to give an unresolved question a structure you can think inside. The decision stays yours.",
    },
  },
];

export interface SourceLink extends Extra<{ title: string; note: string }> {
  href: string;
  zh: { title: string; note: string };
  en: { title: string; note: string };
}

const SOURCES_SRC: SourceLink[] = [
  {
    href: "https://plato.stanford.edu/entries/chinese-change/",
    zh: { title: "Chinese Philosophy of Change", note: "斯坦福哲学百科 · 《易》的文本层次与思想史" },
    en: { title: "Chinese Philosophy of Change", note: "Stanford Encyclopedia of Philosophy — textual layers and reception" },
  },
  {
    href: "https://ctext.org/book-of-changes",
    zh: { title: "《周易》原文", note: "中国哲学书电子化计划 · 经文与历代注疏" },
    en: { title: "The Book of Changes", note: "Chinese Text Project — source text and commentaries" },
  },
  {
    href: "https://zh.wikisource.org/wiki/%E5%91%A8%E6%98%93",
    zh: { title: "维基文库《周易》", note: "本站卦爻辞的直接来源（公有领域）" },
    en: { title: "Zhouyi on Wikisource", note: "The direct source of our hexagram and line texts (public domain)" },
  },
  {
    href: "https://www.metmuseum.org/art/collection/search/42025",
    zh: { title: "商代卜骨", note: "大都会艺术博物馆藏 · 中国占卜最早的物质证据" },
    en: { title: "Fragment of a divining bone, Shang dynasty", note: "The Metropolitan Museum of Art — the earliest material record of Chinese divination" },
  },
  {
    href: "https://www.gutenberg.org/ebooks/16061",
    zh: { title: "Legge 英译《易经》(1882)", note: "古登堡计划 · 英文今译的参考底本（公有领域）" },
    en: { title: "Legge's I Ching (1882)", note: "Project Gutenberg — the public-domain translation informing our English" },
  },
];

export interface AboutSection extends Extra<{ h: string; p: string[] }> {
  zh: { h: string; p: string[] };
  en: { h: string; p: string[] };
}

const ABOUT_SRC: AboutSection[] = [
  {
    zh: {
      h: "这是什么",
      p: [
        "爻流（YaoFlow）是一个用六爻起卦来整理思绪的地方。你把一件悬而未决的事写下来，掷六次卦，得到一个卦象，然后读它——先读三千年前留下的经文，再读一份把这个卦象和你的处境连起来的现代解读。",
        "它做的是把一个古老的符号系统，用它本来的规矩，摆在你的问题旁边，让你换一个结构去看自己已经知道但没想清楚的事。",
      ],
    },
    en: {
      h: "What this is",
      p: [
        "YaoFlow is a place to think through an unresolved question using the I Ching. You write down the one thing you keep circling, cast six lines, and receive a figure — first the received text from three thousand years ago, then a modern reading that connects that figure to your situation.",
        "What it does is set an old symbolic system beside your question, played by its own rules, so you can look at something you already half-know from a different structure.",
      ],
    },
  },
  {
    zh: {
      h: "盘怎么来",
      p: [
        "盘面照古法排，同一刻起的卦盘面一样；解读只讲这个盘，不另外编。",
      ],
    },
    en: {
      h: "Where the chart comes from",
      p: [
        "The chart is laid out by the old rules — the same cast at the same moment gives the same chart. The reading speaks only to that chart and adds nothing of its own.",
      ],
    },
  },
  {
    zh: {
      h: "一事一占",
      p: [
        "《易经·蒙》里有一句：「初筮告，再三渎，渎则不告。」第一次问，卦会回答你；同一件事反复问，就不作数了。",
        "同一件事，问一次就好。真有新的进展，再为新局面起一卦。",
      ],
    },
    en: {
      h: "One matter, one cast",
      p: [
        "Hexagram 4 of the I Ching says: the first casting answers; asking again and again wears the answer out.",
        "Ask once about the same matter. When something genuinely new happens, cast again for the new situation.",
      ],
    },
  },
  {
    zh: {
      h: "谁在做这个",
      p: [
        "爻流 YaoFlow 由一个独立开发者构建和运营，没有投资人。做它的起因很简单：我自己需要一个能安静下来想事情的地方，而市面上的同类产品要么胡编，要么把人当傻子。",
        "有任何问题、发现任何错误（尤其是排盘或经文的错误，我很在意这个），欢迎写信给我。",
      ],
    },
    en: {
      h: "Who makes this",
      p: [
        "YaoFlow is built and run by one independent developer, with no investors. The reason it exists is plain enough: I wanted somewhere quiet to think a decision through, and the similar products I found either made things up or talked to their users like fools.",
        "If you have a question, or you find an error — especially in the chart computation or the classical text, which I care about a great deal — please write to me.",
      ],
    },
  },
];

/* ---- merge the six other languages in (lib/dict/trust-l10n.ts) so contentFor() finds them ---- */
const L10N = Object.entries(TRUST_L10N) as [keyof typeof TRUST_L10N, (typeof TRUST_L10N)[keyof typeof TRUST_L10N]][];

export const TRUST_POINTS: TrustPoint[] = TRUST_POINTS_SRC.map((p) => ({
  ...p,
  ...Object.fromEntries(L10N.map(([l, x]) => [l, x.points[p.k as keyof typeof x.points]])),
}));

export const SOURCES: SourceLink[] = SOURCES_SRC.map((s) => ({
  ...s,
  ...Object.fromEntries(L10N.flatMap(([l, x]) => (x.sources[s.href] ? [[l, x.sources[s.href]]] : []))),
}));

export const ABOUT: AboutSection[] = ABOUT_SRC.map((sec, i) => ({
  ...sec,
  ...Object.fromEntries(L10N.flatMap(([l, x]) => (x.about[i] ? [[l, x.about[i]]] : []))),
}));

/** One-sentence description of the About page, per language. */
export const ABOUT_META: { zh: string; en: string } & Extra<string> = {
  zh: "爻流 YaoFlow 是一个用六爻整理思绪的地方：盘照古法排，文献来源全部公开可查。",
  en: "YaoFlow is a place to think things through with Liu Yao: the chart follows the old rules, and every source is public and checkable.",
  ...Object.fromEntries(L10N.map(([l, x]) => [l, x.aboutMeta])),
};

/**
 * The one support address. Inbound lands on Cloudflare Email Routing and is
 * forwarded on; outbound replies go out through Gmail's "send mail as" via
 * Resend SMTP (set up 09-07). Every page, email Reply-To and legal text reads
 * this constant — never a personal mailbox.
 */
export const CONTACT_EMAIL = "support@yaoflow.com";

export function pick<T extends { zh: unknown; en: unknown }>(item: T, locale: Locale): T["zh"] {
  return contentFor(item as { zh: T["zh"]; en: T["zh"] }, locale);
}
