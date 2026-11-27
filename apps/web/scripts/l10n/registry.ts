/**
 * 10-29 进度表 128 — the trees scripts/l10n/translate.ts knows: where the 繁體 comes from, where the translations go,
 * and what the translator should know about the copy. Run from apps/web.
 */
export interface Entry {
  load: () => Promise<unknown>;
  out: string;
  context: string;
  /** leaves that may keep Chinese characters (a classical quotation, a stem-branch name) */
  keepHan?: (path: string, text: string) => boolean;
  /** a hint for one leaf (what the words are for) */
  note?: (path: string) => string | undefined;
  /** 10-30: a large library — `out` is a folder of <lang>.json files and _src.json (scripts/l10n/translate.ts) */
  split?: boolean;
}

export const REGISTRY: Record<string, Entry> = {
  site: {
    load: async () => (await import("../../src/lib/l10n/site")).siteHant(),
    out: "src/data/l10n/site.json",
    context: "Site-wide navigation copy: each service's short name (label), its one-line description (line) and a short price note (priceNote) on the 'All services' page; the one-line description of each section ('ask' = ask about one matter, 'self' = your birth charts, 'daily' = something to look at every day); the sentence on a recommendation card at the bottom of a result page (cross.*: why the reader might try that product next); a card telling a signed-in reader that answers are owed (owed); the home page row of other things to try instead of casting (switchRow).",
    note: (p) => (p.endsWith(".label") ? "short product name, as on a menu" : p.startsWith("switchRow.") ? "a short link label on the home page" : undefined),
  },
  tarot: {
    load: async () => (await import("../../src/lib/tarot-text")).TAROT_HANT,
    out: "src/data/l10n/tarot.json",
    context: "The online tarot pages: the reader writes one matter, shuffles, picks one or three cards (positions: now / what is in the way / what comes next), the cards turn over with their upright or reversed meaning; a paid personal reading reads the cards for their matter, with one follow-up question and a revisit letter later. 'cards' are the 78 Rider–Waite card names; 'library' is the index page of all 78 meanings; 'card' is one card's meaning page; 'result' is the page of one spread; 'mail' are two short letters (the reading is ready; later: what happened?). Tarot here never gives dates — for dates the site offers casting a hexagram (Liu Yao).",
    note: (p) => {
      if (p.startsWith("cards.")) return "a tarot card's standard name in this language for the Rider–Waite deck (English: The Fool, The Magician, Ace of Wands, Two of Cups, Knight of Swords, Queen of Pentacles; Japanese: 愚者, 魔術師, ワンドのエース, カップの2; Korean: 바보, 마법사, 완드 에이스, 컵 2; French: Le Fou / Le Bateleur…, As de Bâton, Deux de Coupe; German: Der Narr, Der Magier, Ass der Stäbe, Zwei der Kelche; Spanish: El Loco, El Mago, As de Bastos, Dos de Copas; Portuguese: O Louco, O Mago, Ás de Paus, Dois de Copas) — the name only";
      if (p.startsWith("library.groups.")) return "the suit name as used in tarot books in this language (Wands/Cups/Swords/Pentacles; ワンド・カップ・ソード・ペンタクル; 완드·컵·소드·펜타클; Bâtons/Coupes/Épées/Deniers; Stäbe/Kelche/Schwerter/Münzen; Bastos/Copas/Espadas/Oros; Paus/Copas/Espadas/Ouros), or 'Major Arcana'";
      if (/^(ui\.(upright|reversed))$/.test(p)) return "tarot orientation label (Upright / Reversed; 正位置 / 逆位置; 정방향 / 역방향; à l'endroit / renversée; aufrecht / umgekehrt; al derecho / invertida; normal / invertida)";
      if (p === "ui.refuse_crisis") return "a crisis line: do not keep the Taiwan helpline number 1925 — write it without a number (the page adds the reader's local helpline elsewhere)";
      if (/^(card\.(metaTitle|majorName|metaDesc|keywordsLine|major)|result\.(cardHead|cardHeadNoPos|quote|castCard|castSep))$/.test(p)) return "a template: keep every {placeholder}; use this language's punctuation and word order";
      if (p.startsWith("positions.")) return "a tarot spread position label, two or three words";
      // 10-30: on the tarot pages a bare tirage / tirada / tiragem reads as drawing cards again
      if (/^(ui\.(buyList5|fuSub|fuCast|castBtn)|page\.(notes\.2\.p|fitNo\.0|boundary\.0)|card\.revNote|result\.(castHead|castLead)|mail\.readyCast)$/.test(p)) return "起卦／起一卦 here is casting a hexagram (Liu Yao), a different method from the tarot spread on this page: always say it with the word for hexagram — French 'tirer un hexagramme' (never a bare 'tirage'), Spanish 'hacer una tirada de hexagrama' / 'consultar un hexagrama' (never a bare 'tirada'), Portuguese 'fazer uma tiragem de hexagrama' (never a bare 'tiragem'), English 'cast a hexagram', German 'ein Hexagramm werfen'";
      if (p.startsWith("mail.")) return "a line in a short e-mail to the reader (subject, body line or button)";
      return undefined;
    },
  },
  "tarot-meanings": {
    load: async () => (await import("../../src/lib/tarot-meaning-text")).MEANINGS_HANT,
    out: "src/data/l10n/tarot-meanings.json",
    context: "The meaning library of the 78 Rider–Waite tarot cards, written for readers in Taiwan: per card, three keywords upright and three reversed, then upright and reversed: overall (what the card shows and means), love (for people in different love situations), work (job, collaboration, projects) and ask_next (one question back to the reader). Warm, concrete, plain; reversed is the same energy blocked or overdone, never an omen of doom. No dates, no promises.",
    note: (p) => (/\.keywords\./.test(p) ? "a keyword: one to four words" : p.endsWith("ask_next") ? "one question back to the reader, second person" : undefined),
  },
  birth: {
    load: async () => (await import("../../src/lib/mingli/birth/ui")).BIRTH_UI_HANT,
    out: "src/data/l10n/birth.json",
    context: "The birth-data form used by the birth-chart pages (BaZi, Zi Wei Dou Shu, the Western natal chart, compatibility, the year book): who the chart is for, a name, gender, the calendar (Gregorian or the Chinese lunar calendar), date and time of birth (exact time, an approximate two-hour period, or unknown), the birthplace (picked from a list by region, or searched), true solar time, daylight saving time, saved profiles, and error messages.",
    note: (p) => {
      if (p === "whoOpts") return "five short options separated by commas, keep the commas and the order: self, partner, family, friend, other";
      if (p === "branches") return "thirteen items separated by commas, keep the commas and the order: the Chinese double hours with their clock ranges (early Rat hour 00–01 … late Rat hour 23–24); write each as its animal name with the hours, e.g. English 'Rat (00–01)', 'Ox (01–03)'… 'Rat, late (23–24)'";
      if (/^cols_/.test(p)) return "column headings separated by commas, keep the commas and their number (country, state/province, city …)";
      if (p === "placeSearch") return "a search box placeholder; give two or three example cities a reader of this language would type (English 'e.g. Chicago, London, Toronto'; Japanese '例：東京、大阪、札幌'; Korean '예: Seoul, Busan'; French 'ex. Paris, Lyon, Montréal'; German 'z. B. Berlin, München, Wien'; Spanish 'p. ej. Madrid, Ciudad de México, Buenos Aires'; Portuguese 'ex.: São Paulo, Lisboa, Rio de Janeiro')";
      if (p === "solar") return "the Gregorian calendar (as opposed to the lunar one)";
      if (p === "lunar") return "the Chinese lunar calendar";
      if (/^reg_/.test(p)) return "a region tab in the birthplace picker: Taiwan / Hong Kong & Macau / mainland China / other countries";
      if (p === "quickPh") return "a placeholder: the date and time can also be typed as digits, e.g. 199303270255 (keep the digits)";
      if (/^col_/.test(p)) return "a short column heading over a date wheel: year / month / day / hour / minute";
      if (p === "namePh") return "the placeholder of the name field: 'me'";
      return undefined;
    },
  },
  astro: {
    load: async () => (await import("../../src/lib/mingli/astro/page-ui")).ASTRO_HANT,
    out: "src/data/l10n/astro.json",
    context: "The Western natal chart (星盤 = birth chart, tropical zodiac) pages: ui = the chart page (the wheel, the Sun / Moon / rising lines, the tables of planets, houses and aspects, 'reading this chart' — element and mode balance, dominant planets and sign, the chart ruler, chart patterns such as Grand Trine, T-square, Grand Cross, Kite, Yod and stelliums, hemispheres, the tightest aspects — the paid reports block, and links to ask a question by casting a hexagram); page = the product page, the chart page title and the library pages of planets in signs and houses; report = the paid in-depth report's own page (chapter titles, the fact chips above each chapter, the 'this month's transits' section of fixed lines, the letter saying the report is ready). Use the standard astrology terms of this language (houses, rising sign / ascendant, Midheaven, chart ruler, conjunction, sextile, square, trine, opposition, dignity: domicile, exaltation, detriment, fall; retrograde). 國曆 = the Gregorian calendar date; 通卡 = Pass; 會員 = membership; 深度報告 = in-depth report; 年報 = the year report. 起卦／起一卦 is casting a hexagram (Liu Yao), a different method from the chart: always say it with the word for hexagram — French 'tirer un hexagramme' (never a bare 'tirage'), Spanish 'consultar un hexagrama' (never a bare 'tirada'), Portuguese 'consultar um hexagrama' (never a bare 'tiragem'), English 'cast a hexagram', German 'ein Hexagramm werfen'.",
    note: (p) => {
      if (/^report\.(title|titleAsc)$/.test(p)) return "the report's title: {s} the Sun's sign, {m} the Moon's sign, {a} the rising sign — e.g. English 'Sun in {s} · Moon in {m} · {a} rising'";
      if (p.startsWith("report.chip.")) return "a short fact label above a chapter; keep every {placeholder}: {e} element, {m} mode, {p} planet, {s} sign, {d} degree, {n} house number or aspect name, {k} pattern name, {ps} its planets, {a}/{b} planets, {o} orb — e.g. English '{e}-heavy', 'little {e}', 'dominant: {p}', 'chart ruler: {p}', '{p} {s} {d}°', 'house {n}', 'retrograde', 'Ascendant {s} {d}°', 'MC {s}', '{a} {n} {b} {o}°', '{a} or {b}', ', '";
      if (/^report\.(el|md|dignity|patterns|aspectGroups)\./.test(p)) return "the standard astrology term in this language (elements fire / earth / air / water; modes cardinal / fixed / mutable; dignity domicile / exaltation / detriment / fall; patterns Grand Trine, T-square, Grand Cross, Kite, Yod, stellium; aspect groups conjunctions / harmonious / tense)";
      if (p.startsWith("report.chapters.")) return "a chapter title of the report";
      if (p === "report.sky.head") return "a short label that starts a line, not a full sentence: {p} a transiting planet, {a} the aspect name (conjunction, square…), {pt} a point of the reader's birth chart as written in sky.pt, {d} a date already written in this language. No word may need to agree with {p}, {a} or {pt} (gender, case, particles) — use the astrologers' shorthand: English '{p} {a} {pt} (strongest around {d}): ', French '{p} {a} {pt} (plus sensible vers le {d}) : ', German '{p} {a} {pt} (am deutlichsten um den {d}): ', Spanish '{p} {a} {pt} (más intenso hacia el {d}): ', Japanese '{p}が{pt}に{a}（{d}前後が最も強い）：', Korean '트랜짓 {p} – {pt} {a} ({d} 전후 가장 뚜렷함): '";
      if (p.startsWith("report.sky.pt.")) return "a point of the reader's birth chart as a short label, used only inside sky.head: English 'natal Sun' / 'natal Moon' / 'natal Venus' / 'natal Ascendant', French 'Soleil natal' / 'Lune natale' / 'Vénus natale' / 'Ascendant natal', German 'Radix-Sonne' / 'Radix-Mond' / 'Radix-Venus' / 'Radix-Aszendent', Spanish 'Sol natal' / 'Luna natal', Portuguese 'Sol natal' / 'Lua natal', Japanese '出生図の太陽', Korean '출생 차트 태양'";
      if (p.startsWith("report.sky.area.")) return "a noun phrase that goes into {area} in the sky lines (English 'your plans and direction', 'your feelings and daily rhythm', 'love and money', 'the impression you give and your daily routine')";
      if (/^report\.sky\.(jup|sat|mars)/.test(p)) return "the rest of the line after the head; {area} is one of sky.area — build the sentence so it fits (e.g. English 'In {area}, …')";
      if (/^report\.sky\.retro/.test(p)) return "a whole line; {from}–{to} are dates already written in this language";
      if (p === "report.sky.quiet") return "{pts} is a list of natal points (Sun, Moon, Venus, Ascendant) already joined";
      if (p === "report.sky.label") return "{m} is a month and year already written in this language (e.g. 'November 2026')";
      if (p === "report.sky.asc") return "the Ascendant as a point of the birth chart";
      if (p.startsWith("report.mail.")) return "a line in a short e-mail to the reader (subject, body line or button)";
      // 10-30 进度表 128 ④-5: the year book's astrology part (the 星盤年報)
      if (p === "report.book.kindLabel") return "the name of the Western-astrology part of the year book (English 'Your year in astrology')";
      if (p === "report.book.srAscIn") return "{n} a house number: the solar return's Ascendant falls in that house of the birth chart";
      if (p === "report.book.jsRetro") return "{a}–{b} dates already written in this language: a retrograde period";
      if (p === "report.book.enter" || p === "report.book.back") return "a short line after a planet's name: {d} a date already written in this language, {x} a sign or a house already named — English '{d} enters {x}' / '{d} moves back into {x}'";
      if (p === "report.book.natal") return "a point of the birth chart: {p} a planet or a point already named — English 'natal {p}', French '{p} natal', German 'Radix-{p}', Spanish '{p} natal', Japanese '出生図の{p}', Korean '출생 차트 {p}'";
      if (p === "report.book.exactMark") return "a two- or three-word mark: the aspect is exact on that day";
      if (p === "report.book.rxStart" || p === "report.book.rxEnd") return "{p} a planet, {s} a sign: the planet turns retrograde (in that sign) / turns direct again";
      if (p === "report.book.touch") return "{x} points of the birth chart already named and joined: the eclipse touches them";
      if (p === "report.book.retroTag") return "{p} a planet: '{p} retrograde'";
      if (p.startsWith("report.book.flag.")) return "a short mark on a month, two to four words (Jupiter's support, Saturn's pressure, Mercury retrograde, an eclipse touching the birth chart…)";
      if (p.startsWith("report.book.eclipse.")) return "the kind of eclipse: total / annular / partial solar eclipse; total / partial / penumbral lunar eclipse";
      if (p.startsWith("report.book.levelWord.")) return "one or two words for how much a month flows (1 = slow down … 3 = steady … 5 = strong momentum)";
      if (p.startsWith("report.book.")) return "a label or line on the year report's page (chapter titles, short row labels, notes)";
      if (p === "ui.planetNames" || p === "ui.aspectNames" || p === "ui.topics" || p === "ui.topicQ") return "items separated by commas — keep the commas, their number and their order (an empty last item stays empty)";
      if (p === "ui.asks") return "items separated by | , each 'label~kind~arg': translate the label and, where kind is cast, the arg (the reader's question); keep '~jump~' / '~cast~', the anchors (astro-dom, astro-el, astro-pat) and the | separators exactly";
      if (p === "ui.zuo") return "the suffix Chinese puts after a sign name ('座'); write it as an empty-looking short word only if this language needs one — usually leave a single space";
      if (/^ui\.(fPS|fRising|fAspName|fAsp|fAspText)$/.test(p)) return "a template for joining names: {p} planet, {s} sign, {r} the word 'rising', {a}/{b} planets, {n} the aspect, {o} the orb in degrees, {ak}/{bk} what each planet stands for, {t} what the aspect does — e.g. English '{p} in {s}', '{s} rising', '{a} {n} {b}', '{a} {n} {b} ({o}°)', '{a} ({ak}) and {b} ({bk}): {t}'";
      if (/^ui\.(colon|gap|slash|listSep)$/.test(p)) return "a punctuation piece: colon (English ': '), the gap between two items on a line (English ' · '), a slash between alternatives (English ' / '), the separator in a list (English ', ') — keep the spaces this language uses";
      if (/^ui\.sk_/.test(p)) return "two short traits of a zodiac sign, as a parenthesis";
      if (/^ui\.(el|md)_/.test(p)) return "an element (fire, earth, air, water) or a mode (cardinal, fixed, mutable)";
      if (/^ui\.(pt_|w_)/.test(p)) return "keep every {placeholder}; chart-pattern names in this language's astrology usage";
      if (/^ui\.hs_\d+$/.test(p)) return "what a house stands for, a few words";
      if (/^ui\.pk_/.test(p)) return "what a planet stands for, a few words";
      if (/^page\.(tPS|tPH|tRising|houseShort|libSuffix)$/.test(p)) return "a page-title template: {p} planet, {s} sign, {h}/{n} house number, {t} the title — e.g. English '{p} in {s}', '{p} in the {h}th house', '{s} rising', 'House {n}', '{t} | Natal chart meanings'";
      return undefined;
    },
  },
  xingpan: {
    load: async () => (await import("../../src/lib/mingli/astro/content")).XINGPAN_HANT,
    out: "src/data/l10n/xingpan",
    split: true,
    context: "The plain-language library of the Western natal chart: ps = each of the ten planets in each of the twelve signs (title, plain, love, work, watch), ph = each planet in each of the twelve houses, rising = each rising sign (plain and two questions and answers), aspects = short lines for major aspects between personal planets, node = the North Node in each sign, planets = what each planet stands for, intro and faq = the chart page's introduction and questions. Keys name the planet and sign in Chinese; translate the text only. Use this language's standard astrology terms and sign and planet names (English: Sun, Moon, Mercury … Aries, Taurus …; Japanese: 太陽, 月, 牡羊座 …; Korean: 태양, 달, 양자리 …). Tendencies, never fate; no health, money-product or legal advice.",
    note: (p) => (p.endsWith(".title") ? "a short title for this planet-in-sign placement" : undefined),
  },
  qa: {
    load: async () => (await import("../../src/lib/mingli/qa-text")).QA_HANT,
    out: "src/data/l10n/qa.json",
    context: "'Ask this chart': under a birth chart (BaZi, Zi Wei Dou Shu or the Western natal chart) a reader with a Pass or a membership types one question about their own chart and gets a short written answer. ui = the words around the box (heading, lead, placeholder, buttons, the line for readers without a Pass, a link to cast a hexagram about one matter, a link to the chart's in-depth report, errors, the note that answers describe tendencies). pool = suggested questions per chart system, written as the reader asking about their own chart (first person). 通卡 = Pass; 會員 = membership. BaZi terms: 大運 = the ten-year luck period. Zi Wei Dou Shu terms: 命宮 = Life palace, 夫妻宮 = Spouse palace, 財帛宮 = Wealth palace, 福德宮 = Fortune / Well-being palace, 遷移宮 = Travel palace, 四化 = the Four Transformations, 流年 = the year's palace. Western chart: 太陽 Sun, 月亮 Moon, 上升 rising sign / Ascendant, 金星 Venus, 土星 Saturn, 水星 Mercury, 第七宮 the 7th house. 起一卦 is casting a hexagram (Liu Yao) — always say it with the word for hexagram (French 'tirer un hexagramme', Spanish 'consultar un hexagrama', Portuguese 'consultar um hexagrama').",
    note: (p) => (p.startsWith("pool.") ? "a question the reader asks about their own chart, first person, as they would type it" : p === "ui.ph" ? "a placeholder: an example question and the length limit (200 characters)" : p === "ui.locked" ? "ends with a colon: the Pass offer follows" : undefined),
  },
  selfrev: {
    load: async () => (await import("../../src/lib/self-revisit-text")).SELF_REV_HANT,
    out: "src/data/l10n/selfrev.json",
    context: "'We'll ask you when the time comes': after a paid birth-chart report (BaZi, Zi Wei Dou Shu, the Western natal chart), the year book, a date picked for an event, or a free hexagram reading, the reader picks a day (in 3 months, in half a year, at the end of this year…) and we write one letter then asking how things turned out, with four one-tap answers (it happened / something stirred / it did not happen / not yet). ui = the block on the report page and the list on the account page; opt = the choices of when; kind = the names of the things asked about; review = the link back; mail = that letter (subject, the line saying why it came, thanks). Warm and short; the letter is not marketing. 流月 = the lunar month of the Zi Wei Dou Shu chart; 農曆 = the Chinese lunar calendar; 六爻起卦 = a Liu Yao hexagram reading; 擇日 = picking an auspicious date; 三合一年書 = the three-in-one year book.",
    note: (p) => {
      if (/^opt\.ly/.test(p)) return "keep {lunar} (the lunar month's name) and {d} (a date)";
      if (p === "mail.subject") return "an e-mail subject; {label} is the name of the thing asked about";
      if (p.startsWith("ui.a")) return "a one-tap answer: it happened / something stirred / it did not happen / not yet";
      if (/^ui\.(outcomePh|planPh)$/.test(p)) return "an example in a placeholder, first person";
      return undefined;
    },
  },
  dream: {
    load: async () => (await import("../../src/lib/dream-text")).DREAM_UI_HANT,
    out: "src/data/l10n/dream.json",
    context: "The words around the free dream-meaning pages: the index of 200 common dreams by kind (cats = the kinds: animals, people, the body, actions, nature, objects, places, situations), and one dream's page (section headings: the traditional sayings from Chinese folk dream books, a plain reading, common variations, frequently asked questions; a button to cast a hexagram about the matter behind the dream; a link for when something was really lost; the note that dreams are a reference, not a prediction).",
    note: (p) => (p.startsWith("cats.") ? "a kind of dream, one or two words, as a section heading" : /metaTitle$/.test(p) ? "a page title for search results: keep every {placeholder}" : p === "page.likeSep" ? "the separator between items of a list in this language (e.g. ', ')" : undefined),
  },
  dreams: {
    load: async () => (await import("../../src/lib/dream-text")).DREAMS_HANT,
    out: "src/data/l10n/dreams",
    split: true,
    context: "A library of 200 common dreams, one free page each, keyed by the dream (snake, teeth-falling, ex-partner…). Per dream: name (the dream's subject, short, as a reader would type it into a search box), chip (a link label 'Dreaming of …' / 'Dream about …' in this language's natural form), title (the page's question, e.g. 'What does it mean to dream about a snake?'), lead, trad (what the traditional Chinese folk dream books say — e.g. the many versions of the Duke of Zhou's dream book, 周公解夢 — keep it as that Chinese tradition, translate the book's name: English 'the Duke of Zhou's Book of Dreams', French 'la Clé des songes du duc de Zhou', German 'das Traumbuch des Herzogs von Zhou', Spanish 'el libro de los sueños del duque de Zhou', Portuguese 'o livro dos sonhos do duque de Zhou', Japanese 『周公解夢』, Korean 《주공해몽》 — Korean uses 《 》 for a book title, never 『』), plain (a plain reading: what the dream is often about in waking life), variants (q = a variation as a reader would search it, a = its reading), ask (an invitation to cast a hexagram about the matter behind the dream), askQ (that matter as the reader's own question, first person), faq. Warm, plain, calm; never a prophecy, never good or bad luck as a verdict, never death or illness foretold; where the source suggests talking to a doctor, keep it.",
    note: (p) => (p.endsWith(".chip") ? "a short link label for the dream, in this language's natural form for 'dreaming of X' (English 'Dreaming of a snake', Japanese '蛇の夢', Korean '뱀 꿈', French 'Rêver d'un serpent', German 'Von einer Schlange träumen', Spanish 'Soñar con una serpiente', Portuguese 'Sonhar com cobra')" : p.endsWith(".name") ? "the dream's subject, one to three words (no article in English: 'snake', 'teeth falling out', 'ex-partner')" : p.endsWith(".askQ") ? "the reader's own question to cast a hexagram on, first person" : /\.variants\.\d+\.q$/.test(p) ? "a variation of the dream as a reader would search it ('Dreaming of a snake biting you')" : undefined),
  },
  bazi: {
    load: async () => (await import("../../src/lib/mingli/bazi/page-ui")).BAZI_HANT,
    out: "src/data/l10n/bazi.json",
    context: "The BaZi (Four Pillars) pages — call it 'BaZi' or 'Four Pillars' (never 'destiny'): ui = the chart page (the professional chart table: columns for the annual pillar, the luck pillar and the year / month / day / hour pillars; rows: ten god, stem, branch, hidden stems, life stage, own stage, Void, Na Yin, symbolic stars; when the luck pillars start; strips of luck pillars, annual pillars and monthly pillars; the relations between stems and branches; the basic-info tab — Chinese zodiac sign, the Chinese lunar date, the Gregorian date, true solar time, birthplace, solar term, Western sun sign, Conception pillar …; the 'reading this chart' layer — structure, five-element energy, ten-god distribution, strong or weak Day Master, favorable elements with their colours, directions and numbers, groups of symbolic stars, the relations diagram; suggested questions; the share card; the paid reports block; the plain reading of the day pillar and the current year); page = the product page, the chart page title and the library of the sixty day pillars; report = the paid in-depth report's own page (chapter titles, the Partner portrait page — its sections and the chart reasons shown above each part — and the letter saying the report is ready); zy = the Partner portrait product page (from the chart's spouse star and spouse palace, a portrait of the kind of person the reader tends to be drawn to and get along with; a free first line; one purchase; members 20 % off). Stem and branch names: Latin languages write them in pinyin (甲 Jia, 乙 Yi … 子 Zi, 丑 Chou …; 甲子 = Jia Zi), Japanese in kanji, Korean in hangul (갑, 을 … 자, 축 …; 갑자). 國曆 = the Gregorian calendar; 農曆 = the Chinese lunar calendar; 通卡 = Pass; 會員 = membership; 深度報告 = in-depth report. 起卦／起一卦 is casting a hexagram (Liu Yao), a different method from the chart: always say it with the word for hexagram — French 'tirer un hexagramme', Spanish 'consultar un hexagrama', Portuguese 'consultar um hexagrama', English 'cast a hexagram', German 'ein Hexagramm werfen'. TA is a gender-neutral 'that person' (English 'they', never he or she). Tendencies, never fate.",
    note: (p) => {
      if (p === "ui.asks") return "items separated by | , each 'label~kind~arg': translate the label and, where kind is cast, the arg (the reader's question, first person); keep '~jump~' / '~cast~', the anchors (geju, xiji, decade) and the | separators exactly";
      if (p === "ui.branchNames" || p === "ui.topics" || p === "ui.topicQ") return "items separated by commas — keep the commas, their number and their order (an empty last item stays empty)";
      if (/^ui\.(mainStar|stem|branch|hidden|terrain|self|kong|nayin|shensha|date|p_year|p_month|p_day|p_hour|dmMale|dmFemale|xiaoyun|dayun|liunian|liuyue)$/.test(p)) return "a short label in a narrow chart table or strip: one or two words";
      if (p === "ui.age") return "an age under a year in a narrow strip ({a} the age): as short as possible (English '{a}', 'age {a}')";
      if (p === "ui.qiyun") return "when the luck pillars start: {y} years, {m} months, {d} days after birth";
      if (p === "ui.jiaoyun" || p === "ui.lunarLine" || p === "ui.silingV") return "a short template: keep every {placeholder} ({t} a sentence about when luck pillars change, {at} a date; {l} a lunar date; {s} a stem)";
      if (p === "ui.siling") return "{s} is one or two Heavenly Stems";
      if (p === "ui.jiaoyunF") return "when each luck pillar begins: in years whose stem is {a} or {b}, on the {d}th day after the solar term {t} — e.g. English 'Luck pillars change in {a} and {b} years, {d} days after {t}'";
      if (p === "ui.ageNote") return "a note under the luck-pillar strip: ages here are counted the traditional Chinese way";
      if (p === "ui.legend") return "a short label before a list of abbreviations ('Abbreviations')";
      if (p === "ui.termV") return "{a} the solar term before the birth, {ad} days {ah} hours after it; {b} the next solar term, {bd} days {bh} hours before it";
      if (p === "ui.extra") return "{f} Conception Pillar, {o} Life Palace, {b} Body Palace — each a stem-branch pair";
      if (/^ui\.el_/.test(p)) return "the everyday side of a favorable element: colours · direction · numbers — keep the ' · ' separators";
      if (/^ui\.geju_/.test(p)) return "one line on what this structure (named by its ten god) tends to be like";
      if (/^ui\.lv_/.test(p)) return "one line on this strength level of the Day Master";
      if (/^ui\.ss_/.test(p)) return "a group of symbolic stars, two or three words: nobles who help / talent and study / charm and popularity / prosperity and provision / travel and leadership";
      if (/^ui\.grp_/.test(p)) return "one of the five ten-god groups: Resource, Companion, Output, Wealth, Power (Japanese 印星・比劫・食傷・財星・官星; Korean 인성・비겁・식상・재성・관성)";
      if (p === "ui.strengthLine" || p === "ui.dmHead") return "{dm} is the Day Master already named (e.g. 'Jia (Yang Wood)'), {lv} a strength level (strong, balanced, weak…)";
      if (p === "ui.gejuShown" || p === "ui.gejuHidden") return "{b} the month branch, {s} the stem that gives the structure — both already named in this language";
      if (p === "ui.relFortune") return "a row label: the relations the luck pillar and the annual pillar of {y} bring";
      if (/^ui\.(decadeHead|yearHead)$/.test(p)) return "{gz} a stem-branch pair, {t} its ten god, {y} a year";
      if (p === "ui.rizhu") return "{p} is a day pillar already named (Jia Zi / 甲子 / 갑자)";
      if (p === "ui.repRewriteNext") return "{d} is a date already written in this language";
      if (p === "page.tPillar" || p === "page.tPillarMeta") return "a page title: {p} the day pillar (Jia Zi / 甲子 / 갑자), {t} its short title — e.g. English '{p} day pillar', '{p} day pillar | {t}'";
      if (p === "page.libDesc") return "甲子 to 癸亥 = Jia Zi to Gui Hai (Japanese 甲子から癸亥まで, Korean 갑자부터 계해까지)";
      if (p === "report.title" || p === "report.titleNoGeju") return "the report's title: {dm} the Day Master (e.g. 'Jia (Yang Wood)'), {g} the structure — e.g. English 'Day Master {dm} · {g}'";
      if (p === "report.decadeHead") return "a luck pillar's heading: {gz} the pillar, {t} its ten god, {a}–{b} the ages, {y1}–{y2} the years";
      if (p.startsWith("report.chip.")) return "a short reason label above a part of the portrait; keep every {placeholder}: {t} a ten god, {e} an element, {b} a branch, {p} a pillar or stem/branch name (e.g. 'year stem', 'month branch'), {s} how strongly it shows, {d} a direction";
      if (p.startsWith("report.chapters.") || p.startsWith("report.love.sections.")) return "a chapter or section title of the report";
      if (p.startsWith("report.mail.")) return "a line in a short e-mail to the reader (subject, body line or button)";
      // 10-30 进度表 128 ④-5: the year book's BaZi part (one year, month by month)
      if (p === "report.book.kindLabel") return "the name of the BaZi part of the year book (English 'Your year in BaZi')";
      if (p === "report.book.title") return "the part's title: {y} the year, {gz} its stem-branch pair (Ding Wei / 丁未 / 정미), {t} its Ten God — keep the placeholders";
      if (p === "report.book.from") return "a month that begins on a date: {d} is a date already written in this language (e.g. 'Feb 4') — English 'from {d}', Japanese '{d}から', Korean '{d}부터', French 'à partir du {d}', German 'ab {d}', Spanish 'desde el {d}', Portuguese 'a partir de {d}'";
      if (p === "report.book.flagRel") return "a short mark on a month: the month's branch against a branch of the birth chart — {r} the relation, a noun already written in this language (combination / clash / penalty / harm), {p} 'day branch' or 'month branch' — e.g. English '{r} with your {p}'";
      if (p.startsWith("report.book.flag.")) return "a short mark on a month, a few words";
      if (p.startsWith("report.book.palace.")) return "what this pillar of the birth chart stands for in a year reading, a short noun phrase (0 = year pillar, 1 = month pillar, 2 = day pillar, 3 = hour pillar)";
      if (p.startsWith("report.book.colours.")) return "a colour, one word";
      if (p.startsWith("report.book.dirs.")) return "a compass direction (中央 = the centre), one or two words";
      if (p.startsWith("report.book.levelWord.")) return "one or two words for how much a month flows (1 = slow down … 3 = steady … 5 = strong momentum)";
      if (p === "report.book.monthsNote") return "節氣 = the solar terms, the 24 points of the sun's path the Chinese calendar uses; 立春 = Start of Spring";
      if (/^report\.book\.(tenLine|role|decade|natal|noble|easy|colour|direction|number)$/.test(p)) return "a short row label in a fact table, one to three words";
      if (p.startsWith("report.book.")) return "a label or line on the year report's page (chapter titles, short labels, notes)";
      if (p === "zy.inside") return "items separated by | — keep the | separators and their number; the first item says the illustration is AI-generated: keep that";
      if (p === "zy.buy") return "a button: {p} is the price";
      if (p === "zy.productName" || p === "zy.productNameHans") return "the product name on the payment page and receipt: 'YaoFlow Partner portrait (digital content)' in this language";
      if (p === "zy.metaTitle") return "the page title for search results";
      return undefined;
    },
  },
  zycopy: {
    load: async () => (await import("../../src/lib/mingli/bazi/zhengyuan-in")).zyCopyHant(),
    out: "src/data/l10n/zycopy.json",
    context: "The fixed sentences of the Partner portrait (正緣畫像): from a BaZi chart's spouse star and spouse palace, a portrait of the TYPE of person the reader tends to be drawn to — their air, bearing, undertone, expression, how being together feels, the feel of the bond, where they might cross paths. 'TA' is that person, gender-neutral: English 'they' (never he or she), French 'cette personne' (or a neutral turn), German 'diese Person', Spanish 'esa persona', Portuguese 'essa pessoa', Japanese 'その人', Korean '그 사람'. Keys: qiyun = the overall air, by element (木 Wood, 火 Fire, 土 Earth, 金 Metal, 水 Water); shape = bearing, by element — a short phrase with no full stop at the end; density = how strongly that air shows (鲜明 vivid, 适中 moderate, 隐约 faint, 不见 not shown); dise = the undertone, by the spouse palace's earthly branch (an image of a season and its element); shentai = expression and tension, by the palace's relations (冲 clash, 刑 penalty, 害 harm, 合 combination, 破 break, 无 none); xiangchu = how being together feels, by the ten god sitting in the spouse palace; slow / near / both = sentences added after density; flower* = the feel of the bond (Peach Blossom; Red Phoenix and Heavenly Joy; needing one's own space; quiet); meetPillar = where the bond tends to come from, by the pillar the spouse star sits in (year, month, day, hour); meetNone = when the star is not in the chart; meetScene = kinds of places, by element; labels = section titles. Warm, vivid, plain; no ages, years or dates; no verdict on the reader's love life; no judgement of a face or a body.",
    note: (p) => {
      if (p === "meet") return "a template: {pillar} is a whole sentence (from meetPillar / meetNone, ending with a full stop), {scene} a phrase from meetScene, {dir} a compass direction already written in this language (north, south-east…) — e.g. English '{pillar} Perhaps at {scene}; and places to the {dir} may be worth noticing.'";
      if (p.startsWith("meetScene.")) return "a noun phrase of kinds of places, used inside 'Perhaps at {scene}' (English 'bookshops, classrooms or parks — places with a scholarly or green feel')";
      if (p.startsWith("shape.")) return "a short phrase about bearing, no full stop at the end (English 'tall and upright')";
      if (p.startsWith("labels.")) return "a short section title";
      return undefined;
    },
  },
  ziwei: {
    load: async () => (await import("../../src/lib/mingli/ziwei/page-ui")).ZIWEI_HANT,
    out: "src/data/l10n/ziwei.json",
    context: "The Zi Wei Dou Shu (紫微斗數) pages — call it 'Zi Wei Dou Shu' (never 'destiny'): ui = the chart page (a 4×4 board of the twelve palaces, each with its main stars, their brightness and the Four Transformations; switches for natal / decade / annual period / monthly period; a summary card 'reading this chart' — Life Palace, Body Palace, the Five Element Bureau, the Life Lord and Body Lord stars, the birth-year Four Transformations, this decade, this year; classical star patterns with what supports them, what is missing and what spoils them, and the book they come from; a palace's stem sending its Four Transformations to other palaces (self-transformation when it stays); a table comparing the hours before and after; suggested questions; the share card; the paid reports block; the plain reading of each palace); page = the product page, the chart page title and the library of the fourteen main stars (one page per star and one per star in each palace); report = the paid in-depth report's own page (chapter titles, the chart facts shown above the chapters, the cross-reading with BaZi, the letter saying the report is ready). Star names: Latin languages write them in pinyin (紫微 Zi Wei, 天機 Tian Ji, 太陽 Tai Yang, 武曲 Wu Qu, 天同 Tian Tong, 廉貞 Lian Zhen, 天府 Tian Fu, 太陰 Tai Yin, 貪狼 Tan Lang, 巨門 Ju Men, 天相 Tian Xiang, 天梁 Tian Liang, 七殺 Qi Sha, 破軍 Po Jun; 左輔 Zuo Fu, 右弼 You Bi, 文昌 Wen Chang, 文曲 Wen Qu, 天魁 Tian Kui, 天鉞 Tian Yue, 祿存 Lu Cun, 天馬 Tian Ma, 擎羊 Qing Yang, 陀羅 Tuo Luo, 火星 Huo Xing, 鈴星 Ling Xing, 地空 Di Kong, 地劫 Di Jie), Japanese in kanji (新字体: 禄存, 官禄宮, 福徳宮), Korean in hangul (자미, 천기, 명궁, 부처궁). The twelve palaces: Life, Siblings, Spouse, Children, Wealth, Health (read only as daily rhythm), Travel, Friends, Career, Property, Well-being, Parents. 化祿 / 化權 / 化科 / 化忌 = Hua Lu (flow), Hua Quan (drive), Hua Ke (recognition), Hua Ji (attachment — what one holds onto, never misfortune); 亮度 = brightness (廟 旺 = fully expressed, 得 利 = moderately, 平 = steadily, 不 陷 = held in, comes out with practice — never weak or bad). 大限 = a decade (ten-year period); 流年 / 流月 = the annual / monthly period. 格局 = a classical star pattern. 國曆 = the Gregorian calendar; 農曆 = the Chinese lunar calendar; 通卡 = Pass; 會員 = membership; 深度報告 = in-depth report. 起卦／起一卦 is casting a hexagram (Liu Yao), a different method from the chart: always say it with the word for hexagram — French 'tirer un hexagramme', Spanish 'consultar un hexagrama', Portuguese 'consultar um hexagrama', English 'cast a hexagram', German 'ein Hexagramm werfen'. Tendencies, never fate.",
    note: (p) => {
      if (p === "ui.asks") return "items separated by | , each 'label~kind~arg': translate the label and, where kind is cast, the arg (the reader's question, first person); keep '~jump~' / '~cast~', the anchors (zw-sum, zw-geju, zw-now) and the | separators exactly";
      if (p === "ui.branchNames" || p === "ui.topics" || p === "ui.topicQ") return "items separated by commas — keep the commas, their number and their order (an empty last item stays empty)";
      if (/^ui\.(natal|decadal|yearly|monthly)$/.test(p)) return "a short switch label: natal chart / decade / annual period / monthly period — one or two words";
      if (p === "ui.age") return "a unit after an age range on a narrow board (' 歲' = years old): as short as possible, with a leading space where the language puts one (English ' yrs')";
      if (p === "ui.lunarMonth") return "a lunar month in a drop-down: {m} its number (English 'Lunar month {m}')";
      if (p === "ui.bodyMark" || p === "ui.selfMark") return "a one-letter or one-character mark on a narrow board (身 = this palace is the Body Palace; 自 = self-transformation)";
      if (/^ui\.(soulAt|bodyAt)$/.test(p)) return "{b} is an earthly branch already named in this language (Si / 巳 / 사)";
      if (/^ui\.(soulStar|bodyStar)$/.test(p)) return "a short label before a star name: the Life Lord star / the Body Lord star";
      if (p === "ui.mutIn") return "{m} is the full name of a transformation already written in this language (Hua Lu…; Japanese 化禄; Korean 화록) — do not add 'Hua' or 化 again; {p} a palace's full name";
      if (/^ui\.f_/.test(p)) return "a short fact behind a star pattern; keep every placeholder: {s} star names (already written in this language), {p} a palace's full name, {b} an earthly branch, {x} a brightness word, a transformation's full name (Hua Lu…) or a Heavenly Stem — never add 化 or 'Hua' before {x}";
      if (/^ui\.gjn_/.test(p)) return "the name of a classical Zi Wei Dou Shu star pattern: Latin languages give a short descriptive name with the stars in pinyin (e.g. English 'Zi Wei and Tian Fu Together', 'Moon in the Hai Palace'); Japanese keeps the kanji name (新字体); Korean gives the hangul reading (자부동궁격)";
      if (/^ui\.gjs_/.test(p)) return "the classical book (and chapter) a pattern comes from: Latin languages translate the title (《紫微斗數全書》 = 'The Complete Book of Zi Wei Dou Shu'; 《紫微斗數全集》 = 'The Collected Works of Zi Wei Dou Shu'; 〈骨髓賦〉 = 'Ode to the Marrow'; 格局 = 'Patterns'), Japanese and Korean keep the title in their own script";
      if (/^ui\.gjp_/.test(p)) return "one or two lines on what this star pattern tends to mean for the reader";
      if (/^ui\.gjSt_/.test(p)) return "a pattern's status: all conditions met / partly met / met, but weakened";
      if (/^ui\.star_/.test(p)) return "a short phrase on the temperament of this main star (it follows the star's name and a colon)";
      if (/^ui\.bright_/.test(p)) return "a short phrase on how fully a star's nature comes out at this brightness";
      if (/^ui\.topic_/.test(p)) return "what this palace is about, as a short noun phrase";
      if (/^ui\.mut_/.test(p)) return "a short phrase on what this transformation brings to that area of life (it follows 'this area')";
      if (/^ui\.(soulLine|soulEmpty|starLine|bodyLine|fiveLine|lordsLine|mutLine|decLine|decChild|yearLine)$/.test(p)) return "a template in the summary card; keep every placeholder: {b} a branch, {s} star names with brightness, {t} a topic phrase, {p} a palace's full name, {f} a Five Element Bureau (e.g. 'Metal 4'), {n} an age, {a} {b} star names or ages, {m} a transformation's full name, {u} a phrase from mut_*, {y} a year, {gz} a stem-branch pair";
      if (/^ui\.(flyHead|flyTo)$/.test(p)) return "{g} a Heavenly Stem (already named), {p} a palace's full name";
      if (p === "ui.legendBright" || p === "ui.legendMut") return "a short label before a legend under the board (Brightness / Transformations)";
      if (p === "ui.lunarLine") return "{l} is a Chinese lunar date already written in this language";
      if (p === "ui.borrowFrom") return "{s} star names: an empty palace is read through the stars across";
      if (/^ui\.cmp/.test(p)) return "a column label or line in a small table comparing the hours before and after the birth hour";
      if (p === "ui.repRewriteNext") return "{d} is a date already written in this language";
      if (/^page\.(starTitle|starMetaTitle|pairTitle|pairMetaTitle|inPalaces)$/.test(p)) return "a page title: {s} a main star's name (Zi Wei / 紫微 / 자미), {p} a palace's full name (Spouse Palace / 夫妻宮 / 부처궁), {t} the page's short title — e.g. English '{s}', '{s} | Zi Wei Dou Shu main star in plain words', '{s} in the {p}', '{s} in the {p} | {t}', '{s} in the twelve palaces'";
      if (p === "page.starsDesc") return "the fourteen main stars are named in this language (pinyin / kanji / hangul)";
      if (p === "report.ages") return "an age range: {a}–{b} years old";
      if (p === "report.borrowed") return "{s} star names: the palace has no main star and is read through the stars across";
      if (/^report\.(crossLine|crossDm|crossShare|crossSpouse)$/.test(p)) return "a short line in the Zi Wei × BaZi table; keep every placeholder: {z} / {b} the reasons on each side, {dm} a Day Master already named, {s} a strength level, {g} a ten-god group (Power, Wealth…), {n} a percentage";
      if (p === "report.dmLine") return "{dm} a Day Master already named (e.g. 'Geng (Yang Metal)'), {s} a strength level";
      if (p.startsWith("report.chapters.")) return "a chapter title of the report";
      if (p.startsWith("report.crossArea.")) return "an area of life in a short table row: self / career / money / love / talent and expression / people";
      if (p.startsWith("report.mail.")) return "a line in a short e-mail to the reader (subject, body line or button)";
      // 10-30 进度表 128 ④-5: the year book's Zi Wei part (one lunar year, month by month)
      if (p === "report.book.kindLabel") return "the name of the Zi Wei Dou Shu part of the year book (English 'Your year in Zi Wei Dou Shu')";
      if (p === "report.book.span") return "{a} {b} dates already written in this language, {age} a number; 虛歲 = age counted the traditional East Asian way (one at birth, one more at each lunar new year)";
      if (p === "report.book.lunarMonth") return "a month of the Chinese lunar calendar by its number {m} (English 'Lunar month {m}', French 'mois lunaire {m}', German 'Mondmonat {m}', Spanish 'mes lunar {m}', Portuguese 'mês lunar {m}', Japanese '旧暦{m}月', Korean '음력 {m}월')";
      if (p === "report.book.leapFirst" || p === "report.book.leapSecond") return "{m} a lunar month's number: this month also takes in the first / the second half of the leap month after lunar month {m}";
      if (p === "report.book.monthPalace") return "{p} a palace's full name, {s} its stars already named: the month's Life palace falls there";
      if (p === "report.book.decadeAges") return "{p} a palace's full name, {a}–{b} ages";
      if (p.startsWith("report.book.rel.")) return "how this year's Life palace sits to the Life palace of the current decade (same palace / opposite palace / in a trine / unrelated) — a short phrase";
      if (p === "report.book.overlapLine") return "{m1} {m2} a transformation's full name already written (Hua Lu…) — never add 化 or 'Hua' again, {s1} {s2} star names, {p} a palace's full name: the year's and the decade's transformations land in the same palace";
      if (p === "report.book.yearly" || p === "report.book.monthly") return "{s} a star's name: the annual / the monthly version of that star (English 'yearly {s}', 'monthly {s}')";
      if (p.startsWith("report.book.flag.") || p === "report.book.flagLu" || p === "report.book.flagJi") return "a short mark on a month, a few words; {p} a palace's full name; 化祿 = Hua Lu (flow), 化忌 = Hua Ji (attachment); 流月命宮 = the month's Life palace";
      if (p.startsWith("report.book.tag.")) return "a short reason line under a month; keep every placeholder: {m} a transformation's full name already written (Hua Lu…) — never add 化 or 'Hua' again, {s} a star's name, {p} a palace's full name";
      if (p.startsWith("report.book.levelWord.")) return "one or two words for how much a month flows (1 = slow down … 3 = steady … 5 = strong momentum)";
      if (p.startsWith("report.book.")) return "a label or line on the year report's page (chapter titles, short labels, notes)";
      return undefined;
    },
  },
  nianshu: {
    load: async () => (await import("../../src/lib/mingli/nianshu/foreign-text")).NS_FOREIGN_HANT,
    out: "src/data/l10n/nianshu.json",
    context: "The year book (年書 — the product name, see the glossary): one year of the reader's life read three ways — BaZi (八字, the Four Pillars), Zi Wei Dou Shu (紫微斗數) and Western astrology (星盤 / 西洋星盤, the birth chart) — bought once for one year. The book has its own chapters that put the three side by side (the year in one picture, where all three point the same way, where they differ, the four seasons, five areas of life, three suggestions) and three parts (八字篇 / 紫微篇 / 星盤篇: one part per system, month by month), plus an answer to one question the reader may ask. ui = the product page (buying it: whose birth details, an optional question, the price, the early-bird price, the member discount) and the book's own page; mail = two letters (payment received — the book takes minutes to write; the book is written); km = a letter when one of the three key months the book singled out begins; rev = the line of the reminder two days after a key month ('was it like that?'). Tendencies, never fate; no health, money-product or legal advice. 國曆 = the Gregorian calendar; 農曆 = the Chinese lunar calendar; 會員 = membership; 起一卦 is casting a hexagram (Liu Yao) — always say it with the word for hexagram (French 'tirer un hexagramme', Spanish 'consultar un hexagrama', Portuguese 'consultar um hexagrama', English 'cast a hexagram', German 'ein Hexagramm werfen').",
    note: (p) => {
      if (p === "ui.inside") return "items separated by | — keep the | separators and their number";
      if (p === "ui.year") return "{y} the year, {gz} its stem-branch pair (Ding Wei / 丁未 / 정미), {a} its zodiac animal — e.g. English '{y} · {gz}, the year of the {a}'";
      if (p === "ui.buy" || p === "ui.regular") return "{p} is the price";
      if (p === "ui.earlyUntil" || p === "ui.askOn") return "{d} is a date already written in this language";
      if (p === "ui.productName") return "the product name on the payment page and receipt; {y} the year — 'YaoFlow Year Book {y}: BaZi, Zi Wei Dou Shu and astrology read together (digital content)' in this language";
      if (/^ui\.(bazi|ziwei|astro)$/.test(p)) return "the title of one part of the book: the BaZi part / the Zi Wei part / the astrology part";
      if (/^ui\.ch/.test(p)) return "a chapter title of the book";
      if (/^ui\.(career|money|love|rhythm|people)$/.test(p)) return "an area of life, as a short heading";
      if (/^ui\.reask/.test(p)) return "the small form at the end of the book for asking one more question about the year: heading, placeholder, the button (send, rewrite this chapter), the sending state, an error, and a note that the buyer's account must sign in";
      if (p === "ui.metaTitle" || p === "ui.metaReport") return "a page title in the browser and in search results";
      if (p.startsWith("mail.")) return "a line in a short e-mail to the reader";
      if (p === "km.head" || p === "km.subject") return "an e-mail heading or subject: {y} the year, {k} one of km.kind";
      if (p === "km.p1") return "{y} the year, {m} the month's dates already written in this language (e.g. 'Jun 5 – Jul 6'), {k} one of km.kind";
      if (p.startsWith("km.kind.")) return "how the book named this month: the month with the most going on / the month to slow down most / the month that runs most smoothly — a noun phrase";
      if (p.startsWith("km.flag.")) return "a month's mark in plain words, one sentence without a full stop (they are joined with semicolons)";
      if (p === "km.marks") return "a short lead before the month's marks (ends with a colon)";
      if (p === "rev.label") return "the name of a reminder: {y} the year, {m} the month's dates already written in this language";
      if (p === "rev.hint") return "{k} is one of km.kind; the month is over — was it like that?";
      return undefined;
    },
  },
  hepan: {
    load: async () => (await import("../../src/lib/mingli/hepan/page-ui")).HEPAN_HANT,
    out: "src/data/l10n/hepan.json",
    context: "The 合盤 pages — the product is called as the glossary says (English 'Compatibility reading', Japanese 相性鑑定, Korean 궁합, French Compatibilité, German Partnerschaftsvergleich, Spanish Compatibilidad, Portuguese Compatibilidade), but it NEVER promises compatibility or gives a verdict: it describes how two people tend to get along, read from three systems: BaZi (八字 = the Four Pillars), Zi Wei Dou Shu (紫微) and Western astrology (星盤 = the birth chart). '你' / '我' is the reader; 'TA' / '對方' is the other person, gender-neutral and never named: English 'they / them / their' (never he or she), French « l'autre » (or a neutral turn), German « die andere Person » / « dein Gegenüber », Spanish « la otra persona », Portuguese « a outra pessoa », Japanese 「相手」, Korean 「상대」 — never write 'TA'. ui = the free page (two birth entries, an overview: zodiac animals and day pillars, the day masters' elements, Sun / Moon / Venus, the two strongest themes with their facts as chips), the buy box, the invite link (the reader sends a link so the other person fills in their own birth), the report page and the share card; f_* = one computed fact of the pair (templates); r_* = a relation between two stems or branches (combine, clash, the Six Harmony, half-combination, punishment, harm, break, same branch, self-punishment); y_* = this year's facts; ov_* = the overview's sentences; theme = the six themes (attraction, rhythm of being together, friction, communication, money and daily life, the long run); line = one line on a theme by its lean (順 easy, 磨 friction, 混 mixed, 中 neutral); dm = how the two day masters' elements meet; ch = the report's chapter titles; house = the twelve houses of the Western chart; mail = the letter when the report is written. Chart words are named the way this site's BaZi, Zi Wei and astrology pages name them (Day Master, Spouse Palace, Hua Lu, trine…). No scores, no percentages, no verdict, no fate words.",
    note: (p) => {
      if (p === "ui.asks") return "items separated by commas — questions the reader might cast a hexagram about, first person; keep the commas and their number";
      if (p === "ui.me" || p === "ui.you" || p === "ui.taName") return "a short label for one of the two people (the reader / the other person) — one or two words";
      if (p === "ui.pairHead") return "a very short heading: the reader × the other person (English 'You × Them')";
      if (p === "ui.card_lead") return "a very short heading on the image the reader shares, first person: 'Me × Them'";
      if (/^ui\.card_dm_/.test(p)) return "a chip on the image the reader shares, first person ('my … their …'); {a} {b} are the two elements; keep both placeholders";
      if (p === "ui.card_zodiac" || p === "ui.card_pillar" || p === "ui.card_dmLabel") return "a one- or two-word label on the share image: the Chinese zodiac sign / the day pillar / the Day Master";
      if (p === "ui.metaReport") return "the browser title of the pair's report page";
      if (/^ui\.reask/.test(p)) return "the small form at the end of the report for asking one more question: the button (send, rewrite this chapter), the sending state, an error, and a note that the buyer's account must sign in";
      if (p === "ui.buy") return "a button: {p} is the price";
      if (p === "ui.landHeadNamed") return "{n} is the name the inviter gave themselves";
      if (p === "ui.productName") return "the product name on the payment page and receipt: 'YaoFlow Compatibility reading: how two people get along (digital content)' in this language";
      if (/^ui\.f_/.test(p)) return "one computed fact, as a short phrase; keep every placeholder: {a} {b} the two people's day masters, stems, branches or zodiac animals (already named in this language), {e} an element, {t} {t2} a Ten God, {dm} a Day Master, {fav} favorable elements, {z} a zodiac animal with its branch, {d} a branch, {r} a relation already written in this language, {s} {s1} {s2} star names, {link} a short phrase, {g} a star group, {m} a transformation's full name (Hua Lu…), {p} {q} a palace or a planet, {asp} an aspect, {o} an orb in degrees, {n} a house number, {w} what that house is about";
      if (/^ui\.r_/.test(p)) return "a relation between two stems or branches, as in BaZi books: {e} an element, {g} the three branches of the frame";
      if (/^ui\.y_/.test(p)) return "one of this year's facts, a short phrase; keep every placeholder: {s} {d} stems, {b} a branch, {r} a relation, {z} a zodiac animal, {e} an element, {m} a transformation's full name, {p} {q} a palace or planet, {asp} an aspect, {gz} a stem-branch pair";
      if (/^ui\.(ov_|card_dm_)/.test(p)) return "a template; keep every placeholder: {za} {zb} zodiac animals, {pa} {pb} day pillars, {r} relations, {a} {b} signs or elements, {p} {q} planets, {asp} an aspect";
      if (/^ui\.(soul_|el_|sys_)/.test(p)) return "a short word or phrase used inside a fact";
      if (p === "ui.row_zodiacV") return "{z} a zodiac animal, {p} a day pillar (Jia Zi / 甲子 / 갑자)";
      if (p.startsWith("line.")) return "one line on this theme of the pair, by its lean (順 easy, 磨 friction, 混 mixed, 中 neutral)";
      if (p.startsWith("dm.")) return "a line on how the two day masters' elements meet; {ea} the reader's element, {eb} the other person's";
      if (p.startsWith("ch.")) return "a chapter title of the report";
      if (p.startsWith("house.")) return "what this house of the Western chart is about, a short noun phrase";
      if (p.startsWith("mail.")) return "a line in a short e-mail to the reader (subject, title, body line or button)";
      return undefined;
    },
  },
  ziweilib: {
    load: async () => (await import("../../src/lib/mingli/ziwei/content")).ZIWEI_LIB_HANT,
    out: "src/data/l10n/ziweilib",
    split: true,
    context: "The plain-language library of Zi Wei Dou Shu (紫微斗數): pairs = each of the fourteen main stars in each of the twelve palaces (title, plain, strength = when it goes well, watch = what to watch, ask_next = one question back to the reader); overview = each main star (intro, personality, love, work); empty = a palace with no main star (read through the stars across); mutagen = each of the Four Transformations (plain) and what it does in each palace; minor = the helper and friction stars; yearly = this year's period falling in each palace (plain, ask_next); monthly = this month's period in each palace; intro and faq = the product page's introduction and questions. Keys name things in Chinese; translate the text only. Star names: Latin languages in pinyin (紫微 Zi Wei, 天機 Tian Ji, 太陽 Tai Yang, 武曲 Wu Qu, 天同 Tian Tong, 廉貞 Lian Zhen, 天府 Tian Fu, 太陰 Tai Yin, 貪狼 Tan Lang, 巨門 Ju Men, 天相 Tian Xiang, 天梁 Tian Liang, 七殺 Qi Sha, 破軍 Po Jun; 左輔 Zuo Fu, 右弼 You Bi, 文昌 Wen Chang, 文曲 Wen Qu, 天魁 Tian Kui, 天鉞 Tian Yue, 祿存 Lu Cun, 天馬 Tian Ma, 擎羊 Qing Yang, 陀羅 Tuo Luo, 火星 Huo Xing, 鈴星 Ling Xing, 地空 Di Kong, 地劫 Di Jie), Japanese in kanji (新字体), Korean in hangul. Palaces: Life, Siblings, Spouse, Children, Wealth, Health (read only as daily rhythm, never illness), Travel, Friends, Career, Property, Well-being, Parents — with the word for palace as in the glossary. 化祿 / 化權 / 化科 / 化忌 = Hua Lu, Hua Quan, Hua Ke, Hua Ji. Warm, plain, concrete; tendencies, never fate; no health, money-product or legal advice.",
    note: (p) => (/^pairs\.[^.]+\.title$/.test(p) ? "a short title for this star in this palace" : /\.ask_next$/.test(p) ? "one question back to the reader, second person" : p.startsWith("faq.") ? "a question or answer on the product page" : undefined),
  },
  bazilib: {
    load: async () => (await import("../../src/lib/mingli/bazi/content")).BAZI_LIB_HANT,
    out: "src/data/l10n/bazilib",
    split: true,
    context: "The plain-language library of BaZi (Four Pillars): stems = what each Day Master (甲 … 癸) is like; gods = each of the ten gods (plain; in_month = when it stands on the month pillar; in_hour = on the hour pillar); strength = each strength level of the Day Master (plain, tips); elements = each favorable element in daily life; dayun = a ten-year luck pillar of each ten god; liunian = a year of each ten god (plain; ask_next = one question back to the reader); nayin = the thirty Na Yin images; howto = how strength is read; intro and faq = the product page's introduction and questions; rizhu = the sixty day pillars (title, plain, love, work, watch, ask_next). Keys name things in Chinese; translate the text only. Stems and branches: Latin languages write them in pinyin (甲 Jia … 癸 Gui; 子 Zi … 亥 Hai; 甲子 Jia Zi; a stem with its element: 甲木 = Jia Wood), Japanese in kanji, Korean in hangul (갑목, 갑자). The five elements: Wood, Fire, Earth, Metal, Water (Japanese 木・火・土・金・水; Korean 목・화・토・금・수). Warm, plain, concrete; tendencies, never fate; no health, money-product or legal advice.",
    note: (p) => (/^rizhu\.[^.]+\.title$/.test(p) ? "a short evocative title for this day pillar (an image of the stem on its branch)" : /\.ask_next$/.test(p) ? "one question back to the reader, second person" : undefined),
  },
  // 10-30 进度表 128 ⑤ (Neil 10-29: 韓國띠별 운세；欧美和日本的每日运势加星座)
  yunshipage: {
    load: async () => (await import("../../src/lib/mingli/yunshi/foreign-text")).YS_PAGE_HANT,
    out: "src/data/l10n/yunshipage.json",
    context: "The free daily-fortune pages: today for the twelve Western sun signs (read from where today's Moon is, counted from the reader's sign) and for the twelve Chinese zodiac animals (read from today's day stem-branch against the reader's birth-year animal). The index page lets the reader pick a sign or an animal (or work it out from a birthday); each sign or animal has its own page with today's rhythm, what suits today, what to hold off on, and a short explanation. Calm and practical; it is today's rhythm, never a verdict of good or bad luck, never a prediction.",
    keepHan: () => false,
    note: (p) => {
      if (/\{\w+\}/.test(p)) return undefined;
      if (/^(starTitle|animalTitle|starMeta|animalMeta|relHead|aboutStar|aboutAnimal|starResult|result|moonLine|relLine|starDates|lead|leadAnimals|zodiacNote|tomorrow)$/.test(p)) return "a template: keep every {placeholder} ({z} a sign or animal name, {d} dates, {gz} a day's stem-branch name, {s} a zodiac sign, {h} a house number, {b} an earthly branch, {rel} a relation, {t} a tier name, {date} today's date); 屬{z} = 'born in the year of the {z}' (Korean '{z}띠', Japanese '{z}年生まれ')";
      if (p.startsWith("rel.")) return "the relation of the day's earthly branch to the reader's birth-year branch, a few words (clash, punishment, harm, break, six harmony, three harmony, same branch, no special relation)";
      if (/^(y|m|d)$/.test(p)) return "a short label over a date wheel: year / month / day";
      return undefined;
    },
  },
  yunshi: {
    load: async () => (await import("../../src/lib/mingli/yunshi/zodiac")).C,
    out: "src/data/l10n/yunshi.json",
    context: "The copy of the Chinese-zodiac daily fortune: three tiers of today's rhythm (順手 smooth / 平穩 steady / 多留意 take care) with a plain explanation; for each relation between today's day branch and the reader's birth-year branch (clash, punishment, harm, break, six harmony, three harmony, same branch, no relation) many variants of a line, what suits today (yi) and what to hold off on (ji); a line for each day stem (甲…癸) about the day's rhythm; plain paragraphs per relation; per animal an introduction and two FAQ answers; the general FAQ. Written for readers in Taiwan — translate for a reader who knows the Chinese zodiac only a little: keep the traditional terms explained, keep it a tradition, never a verdict of good or bad luck. Never write 'lucky'/'unlucky' as a verdict.",
    keepHan: (p) => /\.branch$/.test(p),
    note: (p) => {
      if (/^zodiac\.\w+\.name$/.test(p)) return "the animal's name only, as this language names the Chinese zodiac animal (English Rat, Ox, Tiger, Rabbit, Dragon, Snake, Horse, Goat, Monkey, Rooster, Dog, Pig; Japanese ねずみ, うし, とら, うさぎ, たつ, へび, うま, ひつじ, さる, とり, いぬ, いのしし; Korean 쥐, 소, 호랑이, 토끼, 용, 뱀, 말, 양, 원숭이, 닭, 개, 돼지)";
      if (/^zodiac\.\w+\.branch$/.test(p)) return "keep the single Chinese character as it is";
      if (/\.(yi|ji)$/.test(p)) return "a short phrase, three to eight words";
      if (/^tiers\.\w+\.name$/.test(p)) return "a tier name, one or two words (Smooth / Steady / Take care)";
      return undefined;
    },
  },
  qianui: {
    load: async () => (await import("../../src/lib/qian-foreign")).QIAN_UI_HANT,
    out: "src/data/l10n/qianui.json",
    context: "The page words of the temple-lot (籤, 'fortune stick' / 'oracle lot') pages: a set's index of all its lots, one lot's page (the poem as printed, then the plain reading, overall, love, work, what suits now, what to hold off — the reading is for readers with a Pass or a membership), drawing a lot online in the temple's order (write one matter, toss the moon blocks to ask, shake the bamboo cylinder for one stick, toss again to confirm the number), today's lot (one a day, the same all day), and entering the number of a lot drawn at a temple. 'set' sections describe the two sets: the Sensō-ji (浅草寺, Tokyo) Kannon lots — what Japanese readers call おみくじ — and the Guanyin hundred lots of Taiwanese Guanyin temples. {set} is the set's name, already in this language (e.g. 'Guanyin oracle', '浅草寺のおみくじ'); 籤 = lot (Japanese 籤 or おみくじ, Korean 첨 or 제비); 擲筊 = tossing the moon blocks (jiaobei); 聖筊 = a yes (one flat, one round side up). 通卡 = Pass; 會員 = membership. 起一卦 = cast a hexagram (always with the word hexagram). Never a verdict of good or bad luck.",
    keepHan: () => false,
    note: (p) => {
      if (/\{\w+\}/.test(p)) return undefined;
      if (/(metaTitle|metaDesc|label|h1|prev|next|all|lead|numLabel|bad|browse)$/.test(p)) return "a template: keep every {placeholder} ({set} the set's name, {n} a lot number, {t} the lot's title line, {c} how many lots, {date} today's date); write 第 {n} 籤 as this language says 'lot {n}' (Japanese 第{n}番, Korean 제{n}첨)";
      return undefined;
    },
  },
  qianja: {
    load: async () => (await import("../../src/lib/qian-foreign-src")).QIAN_JA_HANT,
    out: "src/data/l10n/qianja",
    split: true,
    context: "The hundred lots (おみくじ) of Sensō-ji (浅草寺, Asakusa, Tokyo) — the Kannon lots Japanese readers know from the temple — with YaoFlow's own plain readings, keyed by the lot's number. The 漢詩 itself is shown as printed on the slip and is not part of this text. Each lot has: title (one line naming the picture the poem paints, e.g. ‘The pagoda stands on the mountain top’), plain (what the poem says, in plain words), overall (what the lot means for the reader's matter in general), love (for someone in a flirtation, someone who lost contact, someone hoping to get back together, someone in a relationship — keep those situations), work (job seekers, those thinking of changing jobs, those negotiating a deal), ask_next (an invitation to cast a hexagram about the timing — keep it a question to the reader), yi (what suits now, a short phrase), ji (what to avoid now, a short phrase). Warm, plain, second person; a direction and an attitude, never a prophecy, never a verdict of good or bad luck, never health, money or legal advice. 起一卦 = casting a hexagram (Liu Yao), always with the word hexagram. Japanese: natural, warm です・ます; refer to the temple as 浅草寺 and to the lot as おみくじ or 観音籤.",
    note: (p) => (p.endsWith(".title") ? "one short line, the picture the poem paints" : /\.(yi|ji)$/.test(p) ? "a short phrase, under 15 characters" : undefined),
  },
  qiangy: {
    load: async () => (await import("../../src/lib/qian-foreign-src")).QIAN_GY_HANT,
    out: "src/data/l10n/qiangy",
    split: true,
    context: "The Guanyin hundred lots (觀音一百籤, the 'Kuan Yin oracle' drawn at Guanyin temples such as Lungshan Temple in Taipei), with YaoFlow's own plain readings, keyed by the lot's number. The Chinese poem itself is shown as it is and is not part of this text. Each lot has: title (one line naming the picture the poem paints, e.g. ‘The pagoda stands on the mountain top’), plain (what the poem says, in plain words), overall (what the lot means for the reader's matter in general), love (for someone in a flirtation, someone who lost contact, someone hoping to get back together, someone in a relationship — keep those situations), work (job seekers, those thinking of changing jobs, those negotiating a deal), ask_next (an invitation to cast a hexagram about the timing — keep it a question to the reader), yi (what suits now, a short phrase), ji (what to avoid now, a short phrase). Warm, plain, second person; a direction and an attitude, never a prophecy, never a verdict of good or bad luck, never health, money or legal advice. 起一卦 = casting a hexagram (Liu Yao), always with the word hexagram. Guanyin = the bodhisattva of compassion; Korean 관음, write the lot as 관음 영첨 or 관음첨.",
    note: (p) => (p.endsWith(".title") ? "one short line, the picture the poem paints" : /\.(yi|ji)$/.test(p) ? "a short phrase, three to eight words" : undefined),
  },
  almanac: {
    load: async () => (await import("../../src/lib/mingli/calendar/almanac-west")).ALMANAC_HANT,
    out: "src/data/l10n/almanac.json",
    context: "The Chinese almanac (黃曆 / 通書, 'Tung Shing') pages for Western readers who have never seen one: each day shows the lunar date, the day's stem-branch, the solar term, the activities the almanac marks as suitable (宜) and those it suggests moving to another day (忌), each with a plain explanation, which zodiac animal the day clashes with, and the favourable two-hour periods; plus a date picker ('擇日') listing the coming three months of days the almanac marks suitable for a wedding, a move or opening a business. 'yiji' = the almanac's activity words: 'name' is the activity in a few words (translate the meaning, e.g. 嫁娶 → Wedding, 移徙 → Moving house, 開市 → Opening a business, 動土 → Breaking ground, 祭祀 → Ancestor offerings), 'plain' its plain explanation; 'duty' = the twelve day officers (建除十二神): give each a short English-style name (建 Establish, 除 Remove, 滿 Full, 平 Balance, 定 Stable, 執 Initiate, 破 Destruction, 危 Danger, 成 Success, 收 Receive, 開 Open, 閉 Close, in this language) and translate the note; 'terms' = the 24 solar terms by their usual names in this language (English: Start of Spring, Rain Water, Awakening of Insects, Spring Equinox, Pure Brightness, Grain Rain, Start of Summer, Grain Buds, Grain in Ear, Summer Solstice, Minor Heat, Major Heat, Start of Autumn, End of Heat, White Dew, Autumn Equinox, Cold Dew, Frost's Descent, Start of Winter, Minor Snow, Major Snow, Winter Solstice, Minor Cold, Major Cold); 'dirs' = compass directions. It describes a cultural tradition, calmly: never a prediction, never a verdict of good or bad luck. Taiwan-specific customs stay as they are, said to be Taiwanese customs.",
    keepHan: () => false,
    note: (p) => {
      if (/\{\w+\}/.test(p)) return undefined;
      if (/^(page\.(lead|lunarDate|lunarLeap|gzLine|termToday|termNow|chongLine|hourItem|dayTitle|dayMeta|dayDesc|monthTitle|monthMeta|monthDesc|clashShort)|zeri\.(matched|clash|count)|zeri\.purposes\.\w+\.title)$/.test(p)) return "a template: keep every {placeholder} ({date} a full date, {month} a month and year, {m} {d} lunar month and day numbers, {gz} a stem-branch name, {t} a solar term name, {z} a zodiac animal name, {dir} a direction, {span} a time span like 23–01, {lunar} a lunar date, {yi} a list of activities, {w} activities, {n} a number, {y} a year, {months} month names)";
      if (/^yiji\.[^.]+\.name$/.test(p)) return "the activity in one to four words, title-free, plain (no Chinese characters)";
      if (/^duty\.[^.]+\.name$/.test(p)) return "the day officer's name: 'X day' in this language (e.g. English 'Establish day')";
      if (/^terms\.\d+$/.test(p)) return "one solar term's usual name in this language";
      if (p.startsWith("dirs.")) return "a compass direction, one word";
      if (/^page\.(yi|ji)$/.test(p)) return "one or two words: 宜 = 'Suitable' / 'Good for', 忌 = 'Avoid'";
      return undefined;
    },
  },
  horoscope: {
    load: async () => (await import("../../src/lib/mingli/yunshi/horoscope")).H,
    out: "src/data/l10n/horoscope.json",
    context: "The copy of the daily sun-sign horoscope: 'houses' = for each of the twelve solar houses the Moon can be in today (counted from the reader's sun sign) three variants of a line, what suits today (yi) and what to hold off on (ji); 'plain' = two short paragraphs per house explaining it; 'phases' = a line for each of the eight Moon phases; 'signs' = the twelve sun signs: name, birth dates (M/D), element, introduction and two FAQ answers; 'faq' = general questions. Use this language's standard astrology terms (house, trine, square, sun sign, Moon sign). Calm and practical; today's rhythm, never a prediction, never a verdict of good or bad luck.",
    keepHan: () => false,
    note: (p) => {
      if (/^signs\.\w+\.name$/.test(p)) return "the sign's standard name in this language (English Aries … Pisces; Japanese 牡羊座 … 魚座 (おひつじ座 etc. also fine, keep one style); Korean 양자리, 황소자리, 쌍둥이자리, 게자리, 사자자리, 처녀자리, 천칭자리, 전갈자리, 사수자리, 염소자리, 물병자리, 물고기자리; French Bélier…; German Widder…; Spanish Aries…; Portuguese Áries…)";
      if (/^signs\.\w+\.dates$/.test(p)) return "a date span: write it the way this language writes month and day (English Mar 21 – Apr 19; Japanese 3月21日〜4月19日; Korean 3월 21일~4월 19일; French 21 mars – 19 avril; German 21. März – 19. April; Spanish 21 de marzo – 19 de abril; Portuguese 21 de março – 19 de abril)";
      if (/^signs\.\w+\.element$/.test(p)) return "the element's name, one word (Fire / Earth / Air / Water)";
      if (/\.(yi|ji)$/.test(p)) return "a short phrase, three to eight words";
      return undefined;
    },
  },
  // 10-30 进度表 128 ⑤ (Neil 10-29: 擲筊照原样翻译介绍)
  jiaobei: {
    load: async () => (await import("../../src/lib/jiaobei-text")).JB_HANT,
    out: "src/data/l10n/jiaobei.json",
    context: "The online moon-block page (擲筊, jiaobei / 'poe'): a practice from temples in Taiwan and southern China. Two crescent-shaped wooden blocks, each with a flat side and a round side, are dropped to ask about one matter: one flat and one round up = 聖筊 'yes' (the direction is confirmed), both flat up = 笑筊 'laughing blocks' (the question is not clear yet), both round up = 陰筊 'no' (not confirmed for now). Explain it as what it is, for a reader who has never seen it — keep it a Taiwanese temple practice, do not turn it into a local custom. 'page' = the product page; 'ui' = the toss flow and the temple fortune-stick flow (asking permission with the blocks, drawing a numbered stick, confirming the number); 'signs' = the three results; 'examples' = ways to narrow a vague question; 'notes' = the page's explanations (FAQ). Calm and plain; a result is a direction, never a guarantee; never say a deity says or promises anything.",
    keepHan: () => false,
    note: (p) => {
      if (/^signs\.\w+\.name$/.test(p) || /^ui\.(threeOk|ruleThreeTw|ruleThreeCn|ruleThreeHk)$/.test(p)) return "name the result in this language and keep the romanized Taiwanese/Mandarin term in brackets the first time is not needed here: use one fixed name — English 'Yes (sheng bei)' / 'Laughing (xiao bei)' / 'No (yin bei)'; Japanese 聖筊（せいこう）/笑筊/陰筊 with a short gloss is fine; keep the same three names everywhere in this language";
      if (p.startsWith("examples.")) return "a vague question → a narrowed one, as two quoted questions joined by →; keep the form; replace places, apps and job words with ones natural for a reader of this language (no Taiwanese cities)";
      if (p === "page.disclaimer") return "a source line: a school science fair in Chiayi City, Taiwan; keep the project title in quotes as a translation";
      if (/\{\w+\}/.test(p)) return undefined;
      return undefined;
    },
  },
  xunwu: {
    load: async () => (await import("../../src/lib/xunwu-text")).XW_HANT,
    out: "src/data/l10n/xunwu.json",
    context: "The free 'Lost something?' page: the reader taps what they lost, where it was last seen and how long ago, rolls three dice, and gets a card from the classical Plum Blossom method (Meihua Yishu, chapter on lost things): the chance of finding it (three bands), which compass direction to look in from where it was last seen, and which kinds of places to search, plus practical steps. Plain, calm, practical; never promise it will be found; never say it is gone for good. 'cat' = categories of lost things; 'place' = last seen at home / outside / not sure; 'ago' = today / these few days / longer; 'castQ' = the question carried into a full Liu Yao reading (first person, the reader asking). 'trigram' = the eight trigram names; 'element' = the five phases; 'why' = templates explaining the result ({U}/{L} upper/lower trigram, {Y} the trigram for the thing, {T} the trigram for the reader, {ey}/{et} their elements, {name} the relation's name, {move} which line moves). 'places' = for each trigram: dir (compass direction), orig (a quotation from the classical text), home / out (kinds of places at home / outside).",
    keepHan: () => false,
    note: (p) => {
      if (p === "castQ") return "the reader's own question, first person; {thing} is filled with one of catInQ, {place} with placeInQ, {ago} with agoInQ — build the sentence so {thing} fits without gender or case agreement problems (it carries its own article/possessive, see catInQ)";
      if (p.startsWith("catInQ.")) return "the lost thing as it sits inside castQ — include the possessive/article this language needs there (English 'wallet' after 'my'; German 'meinen Ausweis', 'mein Portemonnaie'; French 'mes papiers', 'mon portefeuille'; Spanish 'mis documentos'; Portuguese 'meus documentos'; Korean with its object particle, e.g. '지갑을'; Japanese the bare noun)";
      if (/^ui\.(diceLine|urgentLine|quote|labelLine|sourceLine|trigramLine)$/.test(p)) return "a punctuation template: keep every {placeholder} and change only the punctuation to this language's own (quotation marks, colon, plus/equals signs, dash, separator) — e.g. English “{q}”, French « {q} », German „{q}“, Japanese 「{q}」";
      if (/^places\.\w+\.orig$/.test(p) || p === "shiwu.orig") return "a quotation from the classical book (Meihua Yishu): translate faithfully and keep it short; in Japanese give a 書き下し文 style reading; in Korean a plain 한글 rendering";
      if (p === "shiwu.source") return "the book and chapter the quotation comes from";
      if (p.startsWith("trigram.")) return "a trigram's name: Japanese keeps the kanji (乾・兌・離・震・巽・坎・艮・坤); Korean writes it in hangul (건, 태, 리, 진, 손, 감, 간, 곤); Latin languages give the pinyin with the image in brackets, e.g. Qian (Heaven), Dui (Lake), Li (Fire), Zhen (Thunder), Xun (Wind), Kan (Water), Gen (Mountain), Kun (Earth)";
      if (p.startsWith("element.")) return "one of the five phases (Wood, Fire, Earth, Metal, Water)";
      if (p.startsWith("hour.")) return "a Chinese double hour; add its clock range for readers outside Chinese, e.g. 子時 → 'Rat hour (23:00–00:59)', 丑時 → 'Ox hour (01:00–02:59)'; Japanese 子の刻（23時〜1時）";
      if (p.startsWith("dirs.") || /^places\.\w+\.dir$/.test(p)) return "a compass direction, one or two words (Japanese uses 北東 / 南西 order, Korean 북동 / 남서)";
      if (p.startsWith("move.")) return "which line of the six moves: first (bottom) … top";
      if (p.startsWith("rel.")) return "name = the classical name of the relation between the two trigrams' elements (give a short plain rendering); line = what it means for finding the thing";
      return undefined;
    },
  },
};
