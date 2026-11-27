/**
 * 09-30 (a reader: 「我的卦那邊是否可以就單純是我的卦，分享卦是另外分頁呢？手機操作不太好使用」).
 * 10-22 进度表 76 ⑤ (「我的」四分頁): the account page in four tabs — 回訪 (what needs you: the windows waiting for an
 * answer, the next ones, today's line, the next question) · 記錄 (every matter and cast, the record, the atlas, your
 * sharing) · 生辰檔案 (the birth profiles the chart pages use) · 額度與方案 (membership, pass, gifts, payments).
 */
export type AccountTab = "revisit" | "record" | "profiles" | "plan";
export const ACCOUNT_TABS: readonly AccountTab[] = ["revisit", "record", "profiles", "plan"];

export const ACCOUNT_TAB_T: Record<string, Record<AccountTab, string> & { all: string; shareLead: string; profilesLead: string; profilesEmpty: string; profilesAdd: string; profilesUse: string; profilesDel: string; profilesDelAll: string; profilesNote: string; profilesBazi: string; profilesZiwei: string; profilesAstro: string; profilesNoTime: string }> = {
  zh: { revisit: "回访", record: "记录", profiles: "生辰档案", plan: "额度与方案", all: "全部的卦", shareLead: "送朋友一卦、分享你的卦、公开卦例，都在这里。",
    profilesLead: "存过的生辰，八字、紫微、星盘三个页面直接用，不用再填。只用来排盘，不会公开。", profilesEmpty: "还没有存过生辰。到任一排盘页填一次，就会记在这里。", profilesAdd: "新增一份", profilesUse: "用这份看", profilesDel: "删除", profilesDelAll: "全部删除", profilesNote: "删除后这份生辰会从帐号里移走；这个浏览器里的副本也一起清掉。", profilesBazi: "八字", profilesZiwei: "紫微", profilesAstro: "星盘", profilesNoTime: "时辰未知" },
  "zh-hant": { revisit: "回訪", record: "記錄", profiles: "生辰檔案", plan: "額度與方案", all: "全部的卦", shareLead: "送朋友一卦、分享你的卦、公開卦例，都在這裡。",
    profilesLead: "存過的生辰，八字、紫微、星盤三個頁面直接用，不用再填。只用來排盤，不會公開。", profilesEmpty: "還沒有存過生辰。到任一排盤頁填一次，就會記在這裡。", profilesAdd: "新增一份", profilesUse: "用這份看", profilesDel: "刪除", profilesDelAll: "全部刪除", profilesNote: "刪除後這份生辰會從帳號裡移走；這個瀏覽器裡的副本也一起清掉。", profilesBazi: "八字", profilesZiwei: "紫微", profilesAstro: "星盤", profilesNoTime: "時辰未知" },
  en: { revisit: "Revisits", record: "Record", profiles: "Birth profiles", plan: "Plan & allowance", all: "All casts", shareLead: "Gift a reading to a friend, share your casts, and your public cases — all here.",
    profilesLead: "Births you have saved; the Bazi, Ziwei and astrology pages use them with nothing to type. Used only to draw the chart, never shown to anyone.", profilesEmpty: "No birth saved yet. Fill one in on any chart page and it will be kept here.", profilesAdd: "Add one", profilesUse: "Use this one", profilesDel: "Delete", profilesDelAll: "Delete all", profilesNote: "Deleting removes the birth from your account; the copy in this browser goes with it.", profilesBazi: "Bazi", profilesZiwei: "Ziwei", profilesAstro: "Astrology", profilesNoTime: "time unknown" },
  ja: { revisit: "再訪", record: "記録", profiles: "生年月日の記録", plan: "プランと残り回数", all: "すべての卦", shareLead: "友だちへの贈り物、卦のシェア、公開した卦例はここに。",
    profilesLead: "保存した生年月日は、四柱推命・紫微斗数・ホロスコープの各ページでそのまま使えます。鑑定にだけ使い、公開はしません。", profilesEmpty: "まだ保存した生年月日はありません。どの鑑定ページでも一度入力すれば、ここに残ります。", profilesAdd: "追加する", profilesUse: "これで見る", profilesDel: "削除", profilesDelAll: "すべて削除", profilesNote: "削除するとアカウントから消え、このブラウザの控えも消えます。", profilesBazi: "四柱推命", profilesZiwei: "紫微斗数", profilesAstro: "ホロスコープ", profilesNoTime: "時刻不明" },
  ko: { revisit: "재방문", record: "기록", profiles: "생년월일 보관", plan: "플랜과 남은 횟수", all: "모든 괘", shareLead: "친구에게 선물하기, 괘 공유, 공개한 괘 사례가 모두 여기 있습니다.",
    profilesLead: "저장한 생년월일은 사주·자미두수·점성술 페이지에서 바로 씁니다. 차트를 그리는 데만 쓰고 공개하지 않습니다.", profilesEmpty: "아직 저장한 생년월일이 없습니다. 아무 차트 페이지에서 한 번 입력하면 여기에 남습니다.", profilesAdd: "추가", profilesUse: "이것으로 보기", profilesDel: "삭제", profilesDelAll: "모두 삭제", profilesNote: "삭제하면 계정에서 지워지고, 이 브라우저의 사본도 함께 지워집니다.", profilesBazi: "사주", profilesZiwei: "자미두수", profilesAstro: "점성술", profilesNoTime: "시간 미상" },
  fr: { revisit: "Retours", record: "Historique", profiles: "Naissances", plan: "Formule et crédits", all: "Tous les tirages", shareLead: "Offrir une lecture à un ami, partager vos tirages, vos cas publics : tout est ici.",
    profilesLead: "Les naissances enregistrées ; les pages Bazi, Ziwei et astrologie les utilisent sans rien saisir. Servent uniquement à dresser le thème, jamais montrées.", profilesEmpty: "Aucune naissance enregistrée. Renseignez-en une sur une page de thème et elle restera ici.", profilesAdd: "En ajouter une", profilesUse: "Utiliser celle-ci", profilesDel: "Supprimer", profilesDelAll: "Tout supprimer", profilesNote: "La suppression retire la naissance de votre compte ; la copie de ce navigateur part avec.", profilesBazi: "Bazi", profilesZiwei: "Ziwei", profilesAstro: "Astrologie", profilesNoTime: "heure inconnue" },
  de: { revisit: "Rückblick", record: "Verlauf", profiles: "Geburtsdaten", plan: "Tarif & Guthaben", all: "Alle Würfe", shareLead: "Einem Freund eine Deutung schenken, Würfe teilen, deine öffentlichen Fälle – alles hier.",
    profilesLead: "Gespeicherte Geburtsdaten; die Bazi-, Ziwei- und Astrologieseiten nutzen sie ohne Eingabe. Nur zum Erstellen des Horoskops, nie sichtbar für andere.", profilesEmpty: "Noch keine Geburtsdaten gespeichert. Einmal auf einer Horoskopseite eingeben, dann bleiben sie hier.", profilesAdd: "Hinzufügen", profilesUse: "Diese verwenden", profilesDel: "Löschen", profilesDelAll: "Alle löschen", profilesNote: "Beim Löschen verschwinden die Daten aus dem Konto; die Kopie in diesem Browser geht mit.", profilesBazi: "Bazi", profilesZiwei: "Ziwei", profilesAstro: "Astrologie", profilesNoTime: "Uhrzeit unbekannt" },
  es: { revisit: "Revisitas", record: "Historial", profiles: "Nacimientos", plan: "Plan y saldo", all: "Todas las tiradas", shareLead: "Regalar una lectura a un amigo, compartir tus tiradas y tus casos públicos: todo aquí.",
    profilesLead: "Nacimientos guardados; las páginas de Bazi, Ziwei y astrología los usan sin escribir nada. Solo sirven para levantar la carta, nunca se muestran.", profilesEmpty: "Aún no hay nacimientos guardados. Rellena uno en cualquier página de carta y quedará aquí.", profilesAdd: "Añadir uno", profilesUse: "Usar este", profilesDel: "Eliminar", profilesDelAll: "Eliminar todos", profilesNote: "Al eliminar, el nacimiento sale de tu cuenta; la copia de este navegador se va con él.", profilesBazi: "Bazi", profilesZiwei: "Ziwei", profilesAstro: "Astrología", profilesNoTime: "hora desconocida" },
  pt: { revisit: "Retornos", record: "Histórico", profiles: "Nascimentos", plan: "Plano e saldo", all: "Todas as tiragens", shareLead: "Presentear um amigo, compartilhar suas tiragens e seus casos públicos: tudo aqui.",
    profilesLead: "Nascimentos guardados; as páginas de Bazi, Ziwei e astrologia usam-nos sem digitar nada. Servem só para montar o mapa, nunca aparecem a ninguém.", profilesEmpty: "Nenhum nascimento guardado ainda. Preencha um em qualquer página de mapa e ele ficará aqui.", profilesAdd: "Adicionar um", profilesUse: "Usar este", profilesDel: "Apagar", profilesDelAll: "Apagar todos", profilesNote: "Ao apagar, o nascimento sai da sua conta; a cópia neste navegador vai junto.", profilesBazi: "Bazi", profilesZiwei: "Ziwei", profilesAstro: "Astrologia", profilesNoTime: "hora desconhecida" },
};

export const tabT = (locale: string) => ACCOUNT_TAB_T[locale] ?? ACCOUNT_TAB_T.en!;

/** Which tab an old link's #hash lives in now (emails and other pages still link to /account#membership etc.). */
export const HASH_TAB: Record<string, AccountTab> = {
  membership: "plan", payments: "plan", gift: "plan", invite: "plan",
  referrals: "record", cases: "record", record: "record", atlas: "record", reports: "record",
  today: "revisit", await: "revisit",
  profiles: "profiles",
};

/** The tab a request lands on: an explicit ?tab=, else anything coming back from a payment goes to the plan. */
export function pickTab(sp: Record<string, string | undefined>): AccountTab {
  if (sp.tab && (ACCOUNT_TABS as readonly string[]).includes(sp.tab)) return sp.tab as AccountTab;
  // 09-30 … 10-22: the old names still open the tab they became
  if (sp.tab === "mine") return "revisit";
  if (sp.tab === "share" || sp.tab === "member") return sp.tab === "member" ? "plan" : "record";
  if (sp.sub || sp.pass || sp.pack || sp.packed || sp.sync || sp.want) return "plan";
  return "revisit";
}
