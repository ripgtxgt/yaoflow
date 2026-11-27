/**
 * 10-23 进度表 114「我的報告」(#838: 「介面複雜，合盤找不到要去信箱，深入紫微每次要再點」): the words of the list on
 * 「我的」 and of the line at the top of a chart page that already has its report. Nine languages; the reports themselves
 * are Chinese, so outside zh／zh-hant only the frame is translated.
 */
export type MyReportName =
  | "bazi_deep" | "bazi_love" | "bazi_year" | "ziwei_deep" | "ziwei_year" | "astro_deep" | "astro_year"
  | "hepan" | "nianshu" | "tarot" | "jieqian"
  // 10-29 进度表 122: 姓名學's two paid references
  | "name_baby" | "name_rename";
export type MyReportFilter = "bazi" | "ziwei" | "astro" | "zhengyuan" | "hepan" | "nianshu" | "tarot" | "jieqian" | "name";
export type MyReportState = "done" | "writing" | "mended" | "mending";

export interface MyReportsCopy {
  title: string; lead: string; recent: string; all: string; seeAll: string; open: string; filterAll: string;
  names: Record<MyReportName, string>;
  filters: Record<MyReportFilter, string>;
  states: Record<MyReportState, string>;
  /** the chart page: 「你這張盤的深度報告」 and its 正緣畫像 */
  chartDeep: string; chartLove: string;
}

const ZH_HANT: MyReportsCopy = {
  title: "我的報告", lead: "買過、寫好的報告和解讀都在這裡，點了直接打開，不用回信箱找。", recent: "最近的報告", all: "全部報告", seeAll: "全部報告", open: "打開", filterAll: "全部",
  names: {
    bazi_deep: "八字深度報告", bazi_love: "正緣畫像", bazi_year: "八字流年報告", ziwei_deep: "紫微深度報告", ziwei_year: "紫微流年報告",
    astro_deep: "星盤深度報告", astro_year: "星盤流年報告", hepan: "合盤報告", nianshu: "{y} 年書", tarot: "塔羅個人解讀", jieqian: "解籤個人解讀", name_baby: "寶寶取名參考", name_rename: "改名參考",
  },
  filters: { bazi: "八字", ziwei: "紫微", astro: "星盤", zhengyuan: "正緣畫像", hepan: "合盤", nianshu: "年書", tarot: "塔羅", jieqian: "解籤", name: "姓名學" },
  states: { done: "寫好了", writing: "正在寫", mended: "補好了", mending: "正在補寫" },
  chartDeep: "你這張盤的深度報告", chartLove: "這張盤的正緣畫像",
};
const ZH: MyReportsCopy = {
  title: "我的报告", lead: "买过、写好的报告和解读都在这里，点了直接打开，不用回信箱找。", recent: "最近的报告", all: "全部报告", seeAll: "全部报告", open: "打开", filterAll: "全部",
  names: {
    bazi_deep: "八字深度报告", bazi_love: "正缘画像", bazi_year: "八字流年报告", ziwei_deep: "紫微深度报告", ziwei_year: "紫微流年报告",
    astro_deep: "星盘深度报告", astro_year: "星盘流年报告", hepan: "合盘报告", nianshu: "{y} 年书", tarot: "塔罗个人解读", jieqian: "解签个人解读", name_baby: "宝宝取名参考", name_rename: "改名参考",
  },
  filters: { bazi: "八字", ziwei: "紫微", astro: "星盘", zhengyuan: "正缘画像", hepan: "合盘", nianshu: "年书", tarot: "塔罗", jieqian: "解签", name: "姓名学" },
  states: { done: "写好了", writing: "正在写", mended: "补好了", mending: "正在补写" },
  chartDeep: "你这张盘的深度报告", chartLove: "这张盘的正缘画像",
};
const EN: MyReportsCopy = {
  title: "My reports", lead: "Every report and reading you have, written and ready — one tap opens it, no digging through your inbox.", recent: "Latest reports", all: "All reports", seeAll: "All reports", open: "Open", filterAll: "All",
  names: {
    bazi_deep: "BaZi in-depth report", bazi_love: "Partner portrait", bazi_year: "BaZi year report", ziwei_deep: "Ziwei in-depth report", ziwei_year: "Ziwei year report",
    astro_deep: "Astrology in-depth report", astro_year: "Astrology year report", hepan: "Compatibility report", nianshu: "{y} Year Book", tarot: "Personal tarot reading", jieqian: "Personal fortune-stick reading", name_baby: "Baby-name reference", name_rename: "Rename reference",
  },
  filters: { bazi: "Bazi", ziwei: "Ziwei", astro: "Astrology", zhengyuan: "Ideal partner", hepan: "Compatibility", nianshu: "Year Book", tarot: "Tarot", jieqian: "Fortune sticks", name: "Names" },
  states: { done: "Ready", writing: "Being written", mended: "Completed", mending: "Being completed" },
  chartDeep: "Your in-depth report for this chart", chartLove: "The ideal-partner portrait for this chart",
};
const JA: MyReportsCopy = {
  title: "わたしのレポート", lead: "購入して書き上がったレポートと鑑定はここにまとめてあります。メールを探さなくても、押せばすぐ開けます。", recent: "最近のレポート", all: "すべてのレポート", seeAll: "すべてのレポート", open: "開く", filterAll: "すべて",
  names: {
    bazi_deep: "四柱推命 詳細レポート", bazi_love: "運命の相手の肖像", bazi_year: "四柱推命 年運レポート", ziwei_deep: "紫微斗数 詳細レポート", ziwei_year: "紫微斗数 年運レポート",
    astro_deep: "ホロスコープ 詳細レポート", astro_year: "ホロスコープ 年運レポート", hepan: "相性レポート", nianshu: "{y}年 年運レポート", tarot: "タロット 個人鑑定", jieqian: "おみくじ 個人鑑定", name_baby: "赤ちゃんの名付け参考", name_rename: "改名の参考",
  },
  filters: { bazi: "四柱推命", ziwei: "紫微斗数", astro: "ホロスコープ", zhengyuan: "運命の相手像", hepan: "相性", nianshu: "年運レポート", tarot: "タロット", jieqian: "おみくじ", name: "姓名学" },
  states: { done: "完成", writing: "作成中", mended: "補完済み", mending: "補完中" },
  chartDeep: "この命盤の詳細レポート", chartLove: "この命盤の運命の相手像",
};
const KO: MyReportsCopy = {
  title: "내 리포트", lead: "구매해서 완성된 리포트와 풀이가 모두 여기 있습니다. 메일을 찾지 않아도 누르면 바로 열립니다.", recent: "최근 리포트", all: "전체 리포트", seeAll: "전체 리포트", open: "열기", filterAll: "전체",
  names: {
    bazi_deep: "사주 심층 리포트", bazi_love: "인연 초상", bazi_year: "사주 연운 리포트", ziwei_deep: "자미두수 심층 리포트", ziwei_year: "자미두수 연운 리포트",
    astro_deep: "점성술 심층 리포트", astro_year: "점성술 연운 리포트", hepan: "궁합 리포트", nianshu: "{y}년 연간 운세 책", tarot: "타로 개인 풀이", jieqian: "첨(籤) 개인 풀이", name_baby: "아기 이름 참고", name_rename: "개명 참고",
  },
  filters: { bazi: "사주", ziwei: "자미두수", astro: "점성술", zhengyuan: "인연 초상", hepan: "궁합", nianshu: "연간 운세 책", tarot: "타로", jieqian: "첨", name: "성명학" },
  states: { done: "완성", writing: "작성 중", mended: "보완 완료", mending: "보완 중" },
  chartDeep: "이 차트의 심층 리포트", chartLove: "이 차트의 인연 초상",
};
const FR: MyReportsCopy = {
  title: "Mes rapports", lead: "Tous vos rapports et lectures, rédigés et prêts : un geste les ouvre, sans fouiller votre boîte mail.", recent: "Derniers rapports", all: "Tous les rapports", seeAll: "Tous les rapports", open: "Ouvrir", filterAll: "Tous",
  names: {
    bazi_deep: "Rapport BaZi approfondi", bazi_love: "Portrait de l'âme sœur", bazi_year: "Rapport BaZi de l'année", ziwei_deep: "Rapport Ziwei approfondi", ziwei_year: "Rapport Ziwei de l'année",
    astro_deep: "Rapport astrologique approfondi", astro_year: "Rapport astrologique de l'année", hepan: "Rapport de compatibilité", nianshu: "Livre de l'année {y}", tarot: "Lecture de tarot personnelle", jieqian: "Lecture de bâtonnet personnelle", name_baby: "Idées de prénom", name_rename: "Idées de nouveau nom",
  },
  filters: { bazi: "Bazi", ziwei: "Ziwei", astro: "Astrologie", zhengyuan: "Partenaire idéal", hepan: "Compatibilité", nianshu: "Livre de l'année", tarot: "Tarot", jieqian: "Bâtonnets", name: "Prénoms" },
  states: { done: "Prêt", writing: "En cours de rédaction", mended: "Complété", mending: "En cours de complément" },
  chartDeep: "Votre rapport approfondi pour ce thème", chartLove: "Le portrait du partenaire idéal pour ce thème",
};
const DE: MyReportsCopy = {
  title: "Meine Berichte", lead: "Alle deine Berichte und Deutungen, fertig geschrieben – ein Tipp öffnet sie, ohne im Postfach zu suchen.", recent: "Neueste Berichte", all: "Alle Berichte", seeAll: "Alle Berichte", open: "Öffnen", filterAll: "Alle",
  names: {
    bazi_deep: "BaZi-Tiefenbericht", bazi_love: "Partnerporträt", bazi_year: "BaZi-Jahresbericht", ziwei_deep: "Ziwei-Tiefenbericht", ziwei_year: "Ziwei-Jahresbericht",
    astro_deep: "Astrologischer Tiefenbericht", astro_year: "Astrologischer Jahresbericht", hepan: "Partnerschaftsbericht", nianshu: "Jahresbuch {y}", tarot: "Persönliche Tarot-Deutung", jieqian: "Persönliche Losstäbchen-Deutung", name_baby: "Namensideen fürs Baby", name_rename: "Ideen zur Namensänderung",
  },
  filters: { bazi: "Bazi", ziwei: "Ziwei", astro: "Astrologie", zhengyuan: "Idealer Partner", hepan: "Partnerschaft", nianshu: "Jahresbuch", tarot: "Tarot", jieqian: "Losstäbchen", name: "Namen" },
  states: { done: "Fertig", writing: "Wird geschrieben", mended: "Ergänzt", mending: "Wird ergänzt" },
  chartDeep: "Dein Tiefenbericht zu diesem Horoskop", chartLove: "Das Porträt des idealen Partners zu diesem Horoskop",
};
const ES: MyReportsCopy = {
  title: "Mis informes", lead: "Todos tus informes y lecturas, ya escritos: un toque los abre, sin buscar en tu correo.", recent: "Últimos informes", all: "Todos los informes", seeAll: "Todos los informes", open: "Abrir", filterAll: "Todos",
  names: {
    bazi_deep: "Informe BaZi a fondo", bazi_love: "Retrato de pareja", bazi_year: "Informe BaZi del año", ziwei_deep: "Informe Ziwei a fondo", ziwei_year: "Informe Ziwei del año",
    astro_deep: "Informe astrológico a fondo", astro_year: "Informe astrológico del año", hepan: "Informe de compatibilidad", nianshu: "Libro del año {y}", tarot: "Lectura de tarot personal", jieqian: "Lectura de varilla personal", name_baby: "Ideas de nombre para el bebé", name_rename: "Ideas para cambiar de nombre",
  },
  filters: { bazi: "Bazi", ziwei: "Ziwei", astro: "Astrología", zhengyuan: "Pareja ideal", hepan: "Compatibilidad", nianshu: "Libro del año", tarot: "Tarot", jieqian: "Varillas", name: "Nombres" },
  states: { done: "Listo", writing: "Escribiéndose", mended: "Completado", mending: "Completándose" },
  chartDeep: "Tu informe a fondo de esta carta", chartLove: "El retrato de la pareja ideal de esta carta",
};
const PT: MyReportsCopy = {
  title: "Meus relatórios", lead: "Todos os seus relatórios e leituras, já escritos: um toque abre, sem procurar no e-mail.", recent: "Relatórios recentes", all: "Todos os relatórios", seeAll: "Todos os relatórios", open: "Abrir", filterAll: "Todos",
  names: {
    bazi_deep: "Relatório BaZi aprofundado", bazi_love: "Retrato do par", bazi_year: "Relatório BaZi do ano", ziwei_deep: "Relatório Ziwei aprofundado", ziwei_year: "Relatório Ziwei do ano",
    astro_deep: "Relatório astrológico aprofundado", astro_year: "Relatório astrológico do ano", hepan: "Relatório de compatibilidade", nianshu: "Livro do ano {y}", tarot: "Leitura de tarô pessoal", jieqian: "Leitura de varetas pessoal", name_baby: "Ideias de nome para o bebê", name_rename: "Ideias para mudar de nome",
  },
  filters: { bazi: "Bazi", ziwei: "Ziwei", astro: "Astrologia", zhengyuan: "Par ideal", hepan: "Compatibilidade", nianshu: "Livro do ano", tarot: "Tarô", jieqian: "Varetas", name: "Nomes" },
  states: { done: "Pronto", writing: "Sendo escrito", mended: "Completado", mending: "Sendo completado" },
  chartDeep: "Seu relatório aprofundado deste mapa", chartLove: "O retrato do par ideal deste mapa",
};

export const MY_REPORTS_T: Record<string, MyReportsCopy> = { "zh-hant": ZH_HANT, zh: ZH, en: EN, ja: JA, ko: KO, fr: FR, de: DE, es: ES, pt: PT };
export const myReportsT = (locale: string): MyReportsCopy => MY_REPORTS_T[locale] ?? EN;
