import type { Foreign } from "./l10n/core";

/**
 * 10-29 进度表 128 尋物 in the seven foreign languages — the practical steps are not a translation of the Taiwan ones:
 * each language gets its own country's offices (or, where the readers are spread over many countries — English,
 * Spanish — what holds everywhere). Written by hand from the official pages (checked 10-29/30):
 *   ja マイナンバー総合フリーダイヤル 0120-95-0178 (一時利用停止 24 時間 365 日; municipal pages), 遺失届 at a 警察署・交番
 *      (online in some prefectures, 警察庁 警察国民向けポータル);
 *   ko 주민등록증 분실신고 at 정부24 or the 주민센터; police lost-and-found moved from LOST112 to 경찰민원24;
 *   fr carte d'identité / passeport: the loss is declared at the mairie with the renewal (pré-demande ANTS), theft at
 *      the commissariat / gendarmerie;
 *   de Personalausweis: Verlust beim Bürgeramt, Online-Ausweisfunktion über den Sperr-Notruf 116 116 (Sperrkennwort
 *      from the PIN letter); 116 116 also blocks most banks' cards;
 *   pt Brazil's federal Celular Seguro app (gov.br) blocks a registered phone's line and bank apps;
 *   Google's Find My Device has been "Find Hub" since May 2025.
 * No telephone number we could not check is written.
 */
export interface Market {
  urgentHead: { doc: string; wallet: string; phone: string };
  restHead: string;
  common: [string, string, string];
  police: string;
  doc: string[];
  wallet: string[];
  phone: string[];
  keys: string;
  first: { doc: string; card: string; phone: string };
  /** the compass's eight short labels, north first, clockwise */
  dirShort: [string, string, string, string, string, string, string, string];
}

export const MARKETS: Record<Foreign, Market> = {
  en: {
    urgentHead: { doc: "Report the lost ID first, then keep looking", wallet: "Freeze your cards first", phone: "Locate and lock it first" },
    restHead: "Do these first",
    common: [
      "Think back to the last time you were sure you had it — when and where — and work forward from there.",
      "Walk the same route again: the usual spots, pockets, bag compartments, between seat cushions.",
      "Call the last shops you were in; if you took a bus, train or taxi, contact its lost and found.",
    ],
    police: "If it is valuable or you think it was stolen, report it to the local police.",
    doc: [
      "Passport or national ID: report the loss to the office that issued it — most have an online form or a hotline. If it was stolen, file a police report as well.",
      "Driver's license and other documents: each issuing office's website explains how to report a loss and get a replacement.",
    ],
    wallet: [
      "Credit and debit cards: freeze or cancel them right away — most banking apps can freeze a card in seconds; otherwise call the number on your bank's website.",
      "If your ID or driver's license was in the wallet, report those too.",
      "A registered transit card can usually be blocked and its balance moved to a new card.",
    ],
    phone: [
      "iPhone or iPad: open Find My on another Apple device, or go to icloud.com/find, to see where it is, play a sound and mark it as lost.",
      "Android: open Google's Find Hub (formerly Find My Device) on another phone, or go to google.com/android/find, to see where it is, ring it and lock it.",
      "Other brands: use the find-my-device feature of your phone account (the name differs by brand).",
      "Ask your carrier to suspend the number so nobody else can use it.",
    ],
    keys: "Have access cards and fobs switched off by your building's management; if the keys carried your address or plate number, consider changing the locks.",
    first: { doc: "Report a lost ID or passport to the office that issued it.", card: "Freeze or cancel bank cards in your bank's app or by phone.", phone: "Locate and lock your phone with Find My (iPhone) or Find Hub (Android)." },
    dirShort: ["N", "NE", "E", "SE", "S", "SW", "W", "NW"],
  },
  ja: {
    urgentHead: { doc: "身分証は先に止めて届け出る", wallet: "カードを先に止める", phone: "まず「探す」で場所を確認・ロック" },
    restHead: "まずやること",
    common: [
      "最後に確かに持っていた・使ったのはいつ、どこかを思い出して、そこからたどります。",
      "同じ道をもう一度歩いてみます。いつもの置き場所の近く、ポケット、カバンの内ポケット、座席のすき間も見てください。",
      "最後に立ち寄ったお店に電話し、電車・バス・タクシーを使ったなら各社の忘れ物窓口に問い合わせます。",
    ],
    police: "貴重品や盗まれた疑いがあるときは、近くの警察署か交番に届け出ます。都道府県によってはオンラインでも遺失届を出せます。",
    doc: [
      "マイナンバーカード：マイナンバー総合フリーダイヤル（0120-95-0178、24時間365日）で一時利用停止を。警察に遺失届を出し、再発行はお住まいの市区町村の窓口で申請します。",
      "運転免許証：警察に遺失届を出し、運転免許センターや警察署で再交付を申請します。",
      "パスポートなどほかの証明書は、それぞれの発行元の公式サイトで届け出の方法を確認してください。",
    ],
    wallet: [
      "クレジットカード・キャッシュカード：すぐにカード会社や銀行の紛失・盗難窓口に連絡して止めます。アプリで一時停止できるカードも多いです。",
      "財布に運転免許証やマイナンバーカードが入っていたら、そちらの手続きも一緒に。",
      "記名式のSuica・PASMOなどは、駅の窓口で利用停止と再発行ができます。",
    ],
    phone: [
      "iPhone・iPad：ほかのApple製品の「探す」アプリか、パソコンで icloud.com/find を開くと、場所の確認・音を鳴らす・紛失としてマークができます。",
      "Android：ほかのスマホの「Find Hub」（旧「デバイスを探す」）アプリか、パソコンで google.com/android/find を開くと、場所の確認・音を鳴らす・ロックができます。",
      "ほかのメーカーの端末は、端末のアカウントの探す機能を使います（名前はメーカーごとに違います）。",
      "携帯会社に連絡して回線を一時停止し、不正利用を防ぎます。",
    ],
    keys: "カードキーなどは管理会社に連絡して止めてもらいます。住所や車のナンバーがわかる物と一緒になくしたときは、鍵の交換も考えます。",
    first: { doc: "身分証は先に止めて届け出る：マイナンバーカードは 0120-95-0178（24時間）、運転免許証は警察へ遺失届。", card: "クレジットカード・キャッシュカードはカード会社や銀行に連絡して止める。", phone: "スマホは「探す」（iPhone）や「Find Hub」（Android）で場所を確認・ロック。" },
    dirShort: ["北", "北東", "東", "南東", "南", "南西", "西", "北西"],
  },
  ko: {
    urgentHead: { doc: "신분증은 먼저 분실신고부터", wallet: "카드부터 정지하세요", phone: "먼저 '찾기'로 위치 확인·잠금" },
    restHead: "먼저 할 일",
    common: [
      "마지막으로 확실히 갖고 있었던 때와 장소를 떠올리고, 거기서부터 거슬러 찾아봅니다.",
      "같은 길을 한 번 더 걸어 봅니다. 늘 두는 곳 근처, 주머니, 가방 안쪽 칸, 의자 틈도 살펴보세요.",
      "마지막에 들른 가게에 전화하고, 지하철·버스·택시를 탔다면 유실물센터에 문의합니다.",
    ],
    police: "귀중품이거나 도난이 의심되면 가까운 경찰서나 지구대에 신고합니다. 분실물 신고와 습득물 조회는 '경찰민원24'에서도 할 수 있습니다.",
    doc: [
      "주민등록증: 정부24에서 온라인으로 분실신고를 하거나 가까운 주민센터(행정복지센터)에 신고하고, 재발급은 주민센터에서 신청합니다.",
      "운전면허증·여권 등 다른 신분증은 각 발급 기관의 공식 안내에서 분실신고 방법을 확인하세요.",
    ],
    wallet: [
      "신용카드·체크카드: 바로 카드사에 분실신고를 해서 사용을 정지하세요. 카드사 앱에서 바로 정지할 수 있는 경우가 많습니다.",
      "지갑에 신분증이 있었다면 함께 분실신고를 합니다.",
      "기명식 교통카드는 발급사에 분실신고를 하면 잔액을 옮겨 받을 수 있는 경우가 있습니다.",
    ],
    phone: [
      "아이폰·아이패드: 다른 애플 기기의 '나의 찾기' 앱이나 컴퓨터에서 icloud.com/find에 접속하면 위치 확인, 소리 재생, 분실 표시를 할 수 있습니다.",
      "안드로이드: 다른 휴대폰의 'Find Hub'(구 '내 기기 찾기') 앱이나 컴퓨터에서 google.com/android/find를 열면 위치 확인, 벨 울리기, 잠금을 할 수 있습니다.",
      "다른 제조사 휴대폰은 기기 계정의 찾기 기능을 씁니다(이름은 제조사마다 다릅니다).",
      "통신사에 분실신고를 해서 회선을 정지하고 도용을 막습니다.",
    ],
    keys: "공동현관 카드키 등은 관리사무소에 정지를 요청합니다. 주소나 차량 번호를 알 수 있는 물건과 함께 잃어버렸다면 열쇠 교체도 생각해 보세요.",
    first: { doc: "신분증은 먼저 분실신고: 주민등록증은 정부24나 주민센터에서.", card: "신용카드·체크카드는 카드사에 분실신고를 해서 정지.", phone: "휴대폰은 '나의 찾기'(아이폰)나 'Find Hub'(안드로이드)로 위치 확인·잠금." },
    dirShort: ["북", "북동", "동", "남동", "남", "남서", "서", "북서"],
  },
  fr: {
    urgentHead: { doc: "Déclarez d'abord la perte de vos papiers", wallet: "Faites d'abord opposition sur vos cartes", phone: "Localisez et verrouillez d'abord le téléphone" },
    restHead: "À faire d'abord",
    common: [
      "Rappelez-vous la dernière fois où vous étiez sûr de l'avoir — quand et où — et repartez de là.",
      "Refaites le même trajet : l'endroit habituel, les poches, les compartiments du sac, entre les coussins.",
      "Appelez les derniers commerces où vous êtes passé ; si vous avez pris le bus, le métro, le train ou un taxi, contactez leur service des objets trouvés.",
    ],
    police: "Pour un objet de valeur ou en cas de vol, adressez-vous au commissariat ou à la gendarmerie.",
    doc: [
      "Carte d'identité ou passeport (en France) : la perte se déclare en mairie au moment de la demande de renouvellement (pré-demande possible sur le site de l'ANTS) ; en cas de vol, déposez plainte au commissariat ou à la gendarmerie.",
      "Permis de conduire et autres documents : le site officiel de chaque service explique comment déclarer la perte et obtenir un nouveau titre.",
    ],
    wallet: [
      "Cartes bancaires : faites opposition tout de suite — la plupart des applis bancaires bloquent une carte en quelques secondes ; sinon, appelez le numéro d'opposition de votre banque.",
      "Si votre carte d'identité ou votre permis étaient dans le portefeuille, déclarez-les aussi.",
      "Une carte de transport nominative peut en général être bloquée et remplacée.",
    ],
    phone: [
      "iPhone ou iPad : ouvrez l'app Localiser sur un autre appareil Apple, ou allez sur icloud.com/find, pour voir où il est, le faire sonner et le signaler comme perdu.",
      "Android : ouvrez Find Hub de Google (anciennement Localiser mon appareil) sur un autre téléphone, ou allez sur google.com/android/find, pour le localiser, le faire sonner et le verrouiller.",
      "Autres marques : utilisez la fonction de localisation du compte de votre téléphone (son nom varie selon la marque).",
      "Demandez à votre opérateur de suspendre la ligne pour que personne ne l'utilise.",
    ],
    keys: "Faites désactiver badges et cartes d'accès par votre syndic ou votre gardien ; si les clés portaient votre adresse ou votre plaque d'immatriculation, pensez à changer les serrures.",
    first: { doc: "Papiers d'identité : déclarez la perte (en mairie avec le renouvellement en France ; au commissariat en cas de vol).", card: "Cartes bancaires : faites opposition via l'appli ou le numéro de votre banque.", phone: "Téléphone : localisez-le et verrouillez-le avec Localiser (iPhone) ou Find Hub (Android)." },
    dirShort: ["N", "NE", "E", "SE", "S", "SO", "O", "NO"],
  },
  de: {
    urgentHead: { doc: "Ausweis zuerst als verloren melden", wallet: "Karten zuerst sperren", phone: "Zuerst orten und sperren" },
    restHead: "Das zuerst tun",
    common: [
      "Erinnere dich, wann und wo du es zuletzt sicher bei dir hattest, und geh von dort aus weiter.",
      "Geh denselben Weg noch einmal: der übliche Platz, Hosentaschen, Fächer in der Tasche, Ritzen zwischen Sitzpolstern.",
      "Ruf die letzten Geschäfte an, in denen du warst; bist du Bus, Bahn oder Taxi gefahren, frag beim Fundservice nach.",
    ],
    police: "Bei Wertsachen oder Verdacht auf Diebstahl: Anzeige bei der Polizei erstatten. Gefundenes landet oft im Fundbüro der Stadt.",
    doc: [
      "Personalausweis: Verlust beim Bürgeramt (Ausweisbehörde) melden. Die Online-Ausweisfunktion sperrst du sofort über den Sperr-Notruf 116 116 – dafür brauchst du das Sperrkennwort aus deinem PIN-Brief.",
      "Reisepass, Führerschein und andere Dokumente: Auf der Website der ausstellenden Behörde steht, wie du den Verlust meldest und Ersatz beantragst.",
    ],
    wallet: [
      "Bank- und Kreditkarten: sofort sperren – in der Banking-App, über den Sperr-Notruf 116 116 (gilt für die meisten Banken) oder über die Sperrnummer deiner Bank.",
      "Waren Ausweis oder Führerschein im Portemonnaie, meldest du auch diese als verloren.",
      "Personalisierte Fahrkarten und Abos lassen sich meist sperren und ersetzen.",
    ],
    phone: [
      "iPhone oder iPad: Öffne „Wo ist?“ auf einem anderen Apple-Gerät oder icloud.com/find, um es zu orten, einen Ton abzuspielen und es als verloren zu markieren.",
      "Android: Öffne Googles Find Hub (früher „Mein Gerät finden“) auf einem anderen Handy oder google.com/android/find, um es zu orten, klingeln zu lassen und zu sperren.",
      "Andere Marken: Nutze die Ortungsfunktion deines Geräte-Kontos (der Name ist je nach Hersteller anders).",
      "Lass die SIM-Karte bei deinem Mobilfunkanbieter sperren, damit niemand deine Nummer nutzt.",
    ],
    keys: "Transponder und Zugangskarten bei der Hausverwaltung sperren lassen; hingen Adresse oder Kennzeichen am Schlüsselbund, solltest du das Schloss tauschen lassen.",
    first: { doc: "Ausweis: Verlust beim Bürgeramt melden, die Online-Funktion über 116 116 sperren.", card: "Bankkarten in der App, über den Sperr-Notruf 116 116 oder die Nummer deiner Bank sperren.", phone: "Handy mit „Wo ist?“ (iPhone) oder Find Hub (Android) orten und sperren." },
    dirShort: ["N", "NO", "O", "SO", "S", "SW", "W", "NW"],
  },
  es: {
    urgentHead: { doc: "Primero reporta la pérdida del documento", wallet: "Primero bloquea las tarjetas", phone: "Primero ubícalo y bloquéalo" },
    restHead: "Haz esto primero",
    common: [
      "Recuerda la última vez que estabas seguro de tenerlo —cuándo y dónde— y sigue desde ahí.",
      "Recorre el mismo camino otra vez: el lugar de siempre, los bolsillos, los compartimentos del bolso, entre los cojines.",
      "Llama a los últimos negocios donde estuviste; si tomaste autobús, metro, tren o taxi, consulta su servicio de objetos perdidos.",
    ],
    police: "Si es algo de valor o crees que te lo robaron, denúncialo en la comisaría o estación de policía más cercana.",
    doc: [
      "Documento de identidad o pasaporte: reporta la pérdida ante la autoridad que lo emitió (muchas tienen formulario en línea o línea telefónica); si te lo robaron, haz también la denuncia policial.",
      "Licencia de conducir y otros documentos: la web oficial de cada organismo explica cómo reportar la pérdida y pedir un duplicado.",
    ],
    wallet: [
      "Tarjetas de crédito y débito: bloquéalas de inmediato; la mayoría de las apps bancarias lo hacen en segundos, o llama al número de tu banco.",
      "Si en la cartera tenías tu documento de identidad o tu licencia, repórtalos también.",
      "Las tarjetas de transporte personalizadas suelen poder bloquearse y reponerse.",
    ],
    phone: [
      "iPhone o iPad: abre la app Buscar en otro dispositivo Apple, o entra en icloud.com/find, para ver dónde está, hacerlo sonar y marcarlo como perdido.",
      "Android: abre Find Hub de Google (antes Encontrar mi dispositivo) en otro teléfono, o entra en google.com/android/find, para ubicarlo, hacerlo sonar y bloquearlo.",
      "Otras marcas: usa la función de búsqueda de la cuenta de tu teléfono (el nombre cambia según la marca).",
      "Pide a tu operador que suspenda la línea para que nadie la use.",
    ],
    keys: "Pide a la administración del edificio que desactive las tarjetas y llaveros de acceso; si las llaves llevaban tu dirección o tu matrícula, considera cambiar la cerradura.",
    first: { doc: "Documentos: reporta la pérdida ante la autoridad que los emitió.", card: "Tarjetas: bloquéalas desde la app o llamando a tu banco.", phone: "Teléfono: ubícalo y bloquéalo con Buscar (iPhone) o Find Hub (Android)." },
    dirShort: ["N", "NE", "E", "SE", "S", "SO", "O", "NO"],
  },
  pt: {
    urgentHead: { doc: "Primeiro comunique a perda do documento", wallet: "Primeiro bloqueie os cartões", phone: "Primeiro localize e bloqueie" },
    restHead: "Faça isto primeiro",
    common: [
      "Lembre a última vez em que você tinha certeza de estar com ele — quando e onde — e siga a partir daí.",
      "Refaça o mesmo caminho: o lugar de sempre, os bolsos, os compartimentos da bolsa, entre as almofadas.",
      "Ligue para as últimas lojas onde você passou; se pegou ônibus, metrô, trem ou táxi, procure o achados e perdidos.",
    ],
    police: "Se for algo de valor ou houver suspeita de furto, registre um boletim de ocorrência — em muitos estados dá para fazer pela delegacia online.",
    doc: [
      "RG, CNH ou passaporte: registre um boletim de ocorrência (em muitos estados, pela delegacia online) e peça a segunda via ao órgão emissor.",
      "Outros documentos: o site oficial de cada órgão explica como comunicar a perda e tirar a segunda via.",
    ],
    wallet: [
      "Cartões de crédito e débito: bloqueie na hora — a maioria dos apps de banco faz isso em segundos; ou ligue para o número do seu banco.",
      "Se o RG ou a CNH estavam na carteira, comunique a perda deles também.",
      "Cartões de transporte cadastrados geralmente podem ser bloqueados e reemitidos.",
    ],
    phone: [
      "iPhone ou iPad: abra o app Buscar em outro aparelho Apple, ou acesse icloud.com/find, para ver onde está, tocar um som e marcar como perdido.",
      "Android: abra o Find Hub do Google (antigo Encontre Meu Dispositivo) em outro celular, ou acesse google.com/android/find, para localizar, tocar e bloquear.",
      "Se você cadastrou o aparelho no app Celular Seguro, do governo federal, faça o alerta por lá: ele avisa a operadora e os bancos.",
      "Peça à operadora o bloqueio da linha para ninguém usar o seu número.",
    ],
    keys: "Peça à administração do prédio para desativar cartões e tags de acesso; se as chaves estavam com o seu endereço ou a placa do carro, pense em trocar a fechadura.",
    first: { doc: "Documentos: registre um boletim de ocorrência e peça a segunda via ao órgão emissor.", card: "Cartões: bloqueie pelo app ou ligando para o banco.", phone: "Celular: localize e bloqueie com Buscar (iPhone) ou Find Hub (Android); se usa o Celular Seguro, faça o alerta por lá." },
    dirShort: ["N", "NE", "L", "SE", "S", "SO", "O", "NO"],
  },
};
