/**
 * Terms & Privacy content. Written to match how the product actually behaves.
 *
 * zh and en are the source texts. Traditional Chinese is hand-written in
 * ./legal-hant.ts (09-24); ja / ko / fr / de / es / pt are authored here
 * (09-10, 切正式 ⑥) so no paying reader signs terms in a language they did
 * not buy in. Prices are quoted in USD everywhere — the local figure is the
 * one shown at checkout, as §1 says.
 */
import type { Authored } from "./content";

import { PRIVACY_HANT, TERMS_HANT } from "./legal-hant";
export const LEGAL_UPDATED = "2026-11-27"; // 11-27 T-007: the Google Ads click-ID cookie (yf_gc) and the purchase report to Google Ads
// earlier 2026-10-31: 10-31 进度表 130 (IP / location / device kept 180 days) and 131 (the cast log starts at the cast, no free line)

export type LegalText = { h: string; p: string[] };
export type LegalSection = Authored<LegalText>;

export const TERMS: LegalSection[] = [
  {
    zh: {
      h: "1. 你买的是什么",
      p: [
        "YaoFlow 提供的是数字内容。免费的部分：六爻起卦与完整排盘、《周易》经文、掷筊、求签、塔罗抽牌与每张牌的牌义、八字／紫微／星盘排盘、黄历与择日、每日运势与今日一签。付费的部分是放在你这件事上写的解读——六爻深断（含追问）、塔罗解读、解签个人解读、八字／紫微／星盘深度报告与命盘问答——以及单卖的三合一年书与合盘报告。价格依页面显示的本币，已含适用税费；结账页显示的金额即你实际支付的金额。",
        "通卡：一次付清、不自动续费的三种期限——1 日通卡 US$3.99（每个账号的第一张 US$2.99）、7 天通卡 US$7.99、30 天通卡 US$12.99（或页面显示的等值本币价格）。自付款起算 24 小时、7×24 小时、30×24 小时；期内可不限次使用六爻深断与追问（每卦最多 30 次）、塔罗解读、解签个人解读、八字／紫微／星盘深度报告的本命章节（八字的大运与今年、紫微的大限两组章节，以及星盘的「这个月的行运」，属会员内容）与命盘问答。为防止滥用，各项每天设有合理使用上限，正常使用不会碰到。通卡期内再买一张，从上一张结束时接着起算；期满自动结束，不会续费或再次扣款。通卡不含今日一签全文、按你八字算的每日内容（每日运势「你的今天」、黄历「今天对你」、择日按八字再筛）、年书与合盘的会员价、深度报告的每月更新与会员信。2026 年 10 月 22 日（含）以前买的通卡，到期前仍含今日一签全文与上述运势章节。",
        "会员：自动续费的订阅：US$9.99/月或 US$79/年（或页面显示的等值本币价格；续费按开通时的币种与金额扣款，不因日后调价而上涨）。首月价格：第一次开通月付会员的，第一个月按 US$12.99 收取，第二个月起按月费；会员到期后再开通的，同样从首月价格开始。会员期内享有通卡的全部内容（同样适用合理使用上限），另含：深度报告的运势章节（八字的大运与今年、紫微的大限、星盘的「这个月的行运」）与每月按当下流月更新一次、今日一签全文、按你八字算的每日内容（每日运势「你的今天」、黄历「今天对你」、择日按你与伴侣的八字再筛并可查一整年）、会员每日信与流月信、三合一年书与合盘报告 8 折，以及每月 5 张「送一卦」赠送链接（未使用者可累积，最多 15 张；每张 14 天内有效、限用一次，仅供赠送他人，会员本人不得领取；逾期未被领取者退回会员名下；关闭自动续费后不再发放，已送出的照常可用）。你可随时在账号页取消，取消后当期结束前仍可继续使用，之后不再扣款；已开始的周期不按比例退款。到期后，已写好的报告与记录仍可查看（运势章节停在最后一次更新的版本）；每日信、流月信、报告更新、今日一签全文、每日的个人内容、命盘问答与会员价不再提供。会员权益仅限本人账号使用，不得转让。",
        "单卖项目（均为一次性购买，不会自动续费）：三合一年书（八字＋紫微＋星盘同一年）US$36.99，早鸟期（每年 11 月 1 日至次年 1 月 31 日）US$27.99；合盘报告（两人一份）US$15.99；会员购买年书与合盘按 8 折（早鸟期取较低者）。塔罗解读、解签个人解读各 US$2.99，持通卡或会员者已含、无须另付。今日一签签卡自 2026 年 10 月 22 日起停售，已买的到期前照常看全文。以上均可换成页面显示的等值本币价格。",
        "2026 年 10 月 22 日前的方案：轻解读 US$2.99、深断 US$9.99 的单买、会员单月、会员增购包与会员每月 10 次深断的额度制已停售；在此之前购买的解读、次数与方案，依购买当时的条款继续有效，直到用完或到期。30 天通卡即原来的会员单月，价格不变。",
      ],
    },
    en: {
      h: "1. What you are buying",
      p: [
        "YaoFlow provides digital content. Free: casting a hexagram with its full chart and the classical texts, moon blocks, temple lots, drawing tarot cards with each card's meaning, Bazi, Zi Wei and natal charts, the almanac and date picking, the daily forecast and the daily lot. Paid: the readings written for your own matter — the full I Ching reading (with follow-up questions), the tarot reading, the personal lot reading, the Bazi, Zi Wei and natal-chart deep reports and chart Q&A — plus two things sold on their own: the year book and the pair report. Prices are the local-currency prices shown on the site and include applicable taxes; the amount on the checkout page is what you pay.",
        "Passes: three lengths, paid once, never renewed — a 1-day pass at US$3.99 (an account's first one US$2.99), a 7-day pass at US$7.99 and a 30-day pass at US$12.99 (or the local-currency prices shown). A pass runs 24 hours, 7×24 hours or 30×24 hours from payment. While it runs you may use, without counting: full I Ching readings and their follow-ups (up to 30 per cast), tarot readings, personal lot readings, the natal chapters of the Bazi, Zi Wei and natal-chart deep reports (the Bazi luck-period and this-year chapters, the Zi Wei decade chapters and the natal chart's month-ahead section belong to the membership), and chart Q&A. To prevent abuse each of these has a reasonable daily limit, which normal use never meets. A pass bought while one is running starts when that one ends; a pass ends by itself, with no renewal and no further charge. A pass does not include the daily lot's full text, the day read from your own chart (on the daily forecast, the almanac and date picking), the member price on the year book and pair report, the monthly refresh of deep reports, or the member letters. A pass bought on or before 22 October 2026 keeps the daily lot's full text and those chapters until it ends.",
        "Membership is an auto-renewing subscription: US$9.99 per month or US$79 per year (or the local-currency price shown; renewals are charged in the currency and at the amount you subscribed at, and do not rise with later price changes). First-month price: the first time you start a monthly membership the first month is charged at US$12.99 and the monthly fee applies from the second month; a membership that has ended starts again at the first-month price. Membership covers everything a pass does (with the same reasonable limits) and adds: the time-bound chapters of the deep reports (Bazi luck periods and this year, Zi Wei decades, the natal chart's month ahead) with a monthly rewrite for the current month, the daily lot's full text, the day read from your own chart (your day on the daily forecast, “today for you” on the almanac, date picking against your own and your partner's chart, up to a year ahead), the member's daily and monthly letters, 20% off the year book and the pair report, and 5 gift-reading links a month (unused ones accumulate up to 15; each is valid 14 days and usable once, only by someone else, never by the member; an unclaimed link returns to the member; no new links are issued once auto-renewal is turned off, while links already sent still work). You can cancel at any time on your account page; access continues to the end of the current period and nothing further is charged; a period already begun is not refunded pro rata. After it ends, reports already written and your records stay readable (the time-bound chapters as last rewritten); the daily and monthly letters, report rewrites, the daily lot's full text, the daily personal content, chart Q&A and member prices stop. Membership is for your own account and cannot be transferred.",
        "Sold on their own (each a single purchase, never renewed): the year book — Bazi, Zi Wei and natal chart for one year — at US$36.99, or US$27.99 during the early-bird period (1 November to 31 January); the pair report (one for two people) at US$15.99; members pay 20% less for both (during the early-bird period, whichever is lower). The tarot reading and the personal lot reading are US$2.99 each and already included for pass holders and members. The daily-lot card is no longer sold from 22 October 2026; cards already bought show the full text until they end. Each may be shown as the equivalent local-currency price.",
        "Before 22 October 2026: the single light reading (US$2.99) and full reading (US$9.99), the one-month membership, the member add-on packs and the membership's allowance of 10 full readings a month have been withdrawn; readings, allowances and plans bought before then keep the terms they were bought under until used up or ended. The 30-day pass is the former one-month membership at the same price.",
      ],
    },
    ja: {
      h: "1. 購入するもの",
      p: [
        "YaoFlow が提供するのはデジタルコンテンツです。無料：六爻の立卦と完全な排盤、『周易』の原文、擲筊（ポエ）、おみくじ、タロットのカード引きと各カードの意味、四柱推命・紫微斗数・ホロスコープの作成、暦と日取り、今日の運勢と今日のおみくじ。有料：あなたの一件に沿って書く鑑定——六爻の本格鑑定（追問つき）、タロット鑑定、おみくじの個人鑑定、四柱推命・紫微斗数・ホロスコープの詳細レポートと命盤への質問——および単品で販売する年運レポートと相性レポートです。価格はページに表示される現地通貨の価格で、適用される税を含みます。決済ページに表示される金額がお支払い額です。",
        "パス：一回払い・自動更新なしの 3 種類——1 日パス US$3.99（アカウント初回は US$2.99）、7 日パス US$7.99、30 日パス US$12.99（またはページに表示される現地通貨の同等価格）。お支払いから 24 時間、7×24 時間、30×24 時間有効です。期間中は六爻の本格鑑定と追問（一卦につき最大 30 回）、タロット鑑定、おみくじの個人鑑定、四柱推命・紫微斗数・ホロスコープの詳細レポートの本命の章（四柱推命の大運と今年、紫微斗数の大限の章、ホロスコープの「今月の運行」はメンバー向け）、命盤への質問を回数の制限なく利用できます。乱用防止のため各項目に一日あたりの合理的な上限があり、通常の利用で達することはありません。有効期間中にもう一枚買うと、前のパスの終了時から始まります。期間が終われば自動的に終了し、更新や再請求はありません。パスには今日のおみくじ全文、あなたの命式で読む毎日の内容（今日の運勢「あなたの今日」、暦の「今日のあなたへ」、命式による日取りの絞り込み）、年運・相性レポートの会員価格、詳細レポートの月次更新、会員向けレターは含まれません。2026 年 10 月 22 日以前に購入したパスは、終了まで今日のおみくじ全文と上記の章を含みます。",
        "メンバーシップは自動更新の定期購読です。月額 US$9.99 または年額 US$79（またはページに表示される現地通貨価格。更新時は加入時の通貨と金額で請求され、後の価格改定で上がることはありません）。初月価格：初めて月額メンバーになる場合、初月は US$12.99、2 か月目から月額料金です。メンバーシップが終了した後に再開する場合も、初月価格から始まります。メンバーシップはパスの内容すべて（同じ合理的な上限つき）に加えて、詳細レポートの運勢の章（四柱推命の大運と今年、紫微斗数の大限、ホロスコープの「今月の運行」）とその月に合わせた月 1 回の書き直し、今日のおみくじ全文、あなたの命式で読む毎日の内容（今日の運勢「あなたの今日」、暦の「今日のあなたへ」、本人と相手の命式による日取りの絞り込みと一年分の表示）、会員向けの毎日のレターと月のレター、年運レポートと相性レポートの 20% 割引、毎月 5 枚の「鑑定を贈る」リンク（未使用分は最大 15 枚まで繰り越し。各リンクは 14 日間有効で一回限り、他の人への贈り物専用でメンバー本人は受け取れません。受け取られなかったリンクはメンバーに戻ります。自動更新を止めると新たに発行されませんが、すでに送ったリンクは使えます）を含みます。アカウントページでいつでも解約でき、解約後も当期の終わりまで利用でき、以後は請求されません。開始済みの期間の日割り返金はありません。期間終了後も、作成済みのレポートと記録は引き続き閲覧できます（運勢の章は最後に書き直した版のまま）。毎日・月のレター、レポートの書き直し、今日のおみくじ全文、毎日の個人向け内容、命盤への質問と会員価格は終了します。メンバーシップは本人のアカウント専用で、譲渡できません。",
        "単品販売（いずれも一回限りの購入で自動更新なし）：年運レポート（四柱推命・紫微斗数・ホロスコープの一年分）US$36.99、早期割引期間（11 月 1 日〜翌年 1 月 31 日）は US$27.99。相性レポート（二人で一通）US$15.99。メンバーはいずれも 20% 割引（早期割引期間はいずれか低いほう）。タロット鑑定とおみくじの個人鑑定は各 US$2.99 で、パス保有者とメンバーには含まれています。今日のおみくじカードは 2026 年 10 月 22 日に販売を終了しました。購入済みのカードは終了まで全文を読めます。いずれもページに表示される現地通貨の同等価格になります。",
        "2026 年 10 月 22 日より前のプラン：ライト鑑定 US$2.99・本格鑑定 US$9.99 の単品、1 か月メンバー、会員追加パック、月 10 回の本格鑑定という会員の枠は販売を終了しました。それ以前に購入した鑑定・回数・プランは、使い切るか終了するまで購入時の条件のまま有効です。30 日パスは以前の 1 か月メンバーと同じもので、価格も同じです。",
      ],
    },
    ko: {
      h: "1. 무엇을 구매하는가",
      p: [
        "YaoFlow가 제공하는 것은 디지털 콘텐츠입니다. 무료: 육효 점괘와 전체 괘 도표, 『주역』 원문, 모과(擲筊), 제비뽑기, 타로 카드 뽑기와 각 카드의 의미, 사주·자미두수·출생 차트 작성, 달력과 날짜 고르기, 오늘의 운세와 오늘의 제비. 유료: 당신의 한 가지 일에 맞춰 쓰는 풀이——육효 심층 풀이(추가 질문 포함), 타로 풀이, 제비 개인 풀이, 사주·자미두수·출생 차트 심층 리포트와 차트 질문——그리고 따로 파는 연간 운세 책과 궁합 리포트입니다. 가격은 사이트에 표시되는 현지 통화 가격이며 해당 세금을 포함합니다. 결제 페이지에 표시되는 금액이 실제 지불 금액입니다.",
        "패스: 한 번 결제하고 자동 갱신되지 않는 세 가지——1일 패스 US$3.99(계정의 첫 패스는 US$2.99), 7일 패스 US$7.99, 30일 패스 US$12.99(또는 표시되는 현지 통화 환산 가격). 결제 시점부터 24시간, 7×24시간, 30×24시간 동안 유효합니다. 기간 중에는 육효 심층 풀이와 추가 질문(괘당 최대 30회), 타로 풀이, 제비 개인 풀이, 사주·자미두수·출생 차트 심층 리포트의 본명 장(사주의 대운과 올해, 자미두수의 대한 장, 출생 차트의 '이번 달의 운행'은 멤버 전용), 차트 질문을 횟수 제한 없이 쓸 수 있습니다. 남용을 막기 위해 항목마다 하루 합리적 상한이 있으며 정상적인 사용으로는 닿지 않습니다. 기간 중에 한 장 더 사면 앞 패스가 끝난 뒤부터 시작합니다. 기간이 끝나면 저절로 종료되며 갱신이나 추가 청구는 없습니다. 패스에는 오늘의 제비 전문, 내 명식으로 읽는 매일의 내용(오늘의 운세 '나의 오늘', 달력의 '오늘 나에게', 명식에 따른 날짜 거르기), 연간 운세 책·궁합 리포트의 회원 가격, 심층 리포트의 월간 갱신, 회원 편지가 포함되지 않습니다. 2026년 10월 22일 이전에 산 패스는 끝날 때까지 오늘의 제비 전문과 위의 장을 포함합니다.",
        "멤버십은 자동 갱신 구독입니다. 월 US$9.99 또는 연 US$79(또는 표시되는 현지 통화 가격. 갱신은 가입 당시의 통화와 금액으로 청구되며 이후 가격 변경으로 오르지 않습니다). 첫 달 가격: 월간 멤버십을 처음 시작하면 첫 달은 US$12.99, 둘째 달부터 월 요금입니다. 멤버십이 끝난 뒤 다시 시작할 때도 첫 달 가격부터입니다. 멤버십은 패스의 모든 내용(같은 합리적 상한 적용)에 더해 심층 리포트의 운세 장(사주의 대운과 올해, 자미두수의 대한, 출생 차트의 '이번 달의 운행')과 그달에 맞춘 월 1회 다시 쓰기, 오늘의 제비 전문, 내 명식으로 읽는 매일의 내용(오늘의 운세 '나의 오늘', 달력의 '오늘 나에게', 본인과 상대의 명식에 따른 날짜 거르기와 1년치 보기), 회원의 매일 편지와 월간 편지, 연간 운세 책과 궁합 리포트 20% 할인, 매달 5장의 '풀이 선물' 링크(쓰지 않은 것은 최대 15장까지 누적, 각 링크는 14일 동안 1회 사용, 다른 사람에게만 선물 가능하고 회원 본인은 받을 수 없음, 받지 않은 링크는 회원에게 되돌아옴, 자동 갱신을 끄면 새로 발급되지 않으나 이미 보낸 링크는 그대로 사용 가능)를 포함합니다. 계정 페이지에서 언제든 해지할 수 있고 해지 후에도 해당 기간 끝까지 이용 가능하며 이후 청구되지 않습니다. 이미 시작된 기간은 일할 환불되지 않습니다. 기간이 끝난 뒤에도 이미 쓰인 리포트와 기록은 계속 볼 수 있습니다(운세 장은 마지막으로 다시 쓴 판). 매일·월간 편지, 리포트 다시 쓰기, 오늘의 제비 전문, 매일의 개인 내용, 차트 질문과 회원 가격은 끝납니다. 멤버십은 본인 계정 전용이며 양도할 수 없습니다.",
        "단품 판매(모두 1회 구매, 자동 갱신 없음): 연간 운세 책(사주·자미두수·출생 차트 한 해분) US$36.99, 얼리버드 기간(11월 1일~다음 해 1월 31일) US$27.99. 궁합 리포트(두 사람에 한 부) US$15.99. 회원은 둘 다 20% 할인(얼리버드 기간에는 더 낮은 쪽). 타로 풀이와 제비 개인 풀이는 각 US$2.99이며 패스 보유자와 회원에게는 포함되어 있습니다. 오늘의 제비 카드는 2026년 10월 22일부터 판매하지 않으며, 이미 산 카드는 끝날 때까지 전문을 볼 수 있습니다. 모두 표시되는 현지 통화 환산 가격으로 나타날 수 있습니다.",
        "2026년 10월 22일 이전 플랜: 간단 풀이 US$2.99·심층 풀이 US$9.99 단건, 한 달 멤버십, 회원 추가 팩, 월 10회 심층 풀이라는 회원 한도제는 판매를 종료했습니다. 그 전에 구매한 풀이·횟수·플랜은 다 쓰거나 끝날 때까지 구매 당시 조건대로 유효합니다. 30일 패스는 예전의 한 달 멤버십과 같은 것이며 가격도 같습니다.",
      ],
    },
    fr: {
      h: "1. Ce que vous achetez",
      p: [
        "YaoFlow fournit du contenu numérique. Gratuit : le tirage d'un hexagramme avec son tableau complet et les textes classiques, les blocs de lune, les baguettes de temple, le tirage de cartes de tarot avec le sens de chaque carte, les thèmes Bazi, Zi Wei et astral, l'almanach et le choix de dates, la prévision du jour et la baguette du jour. Payant : les lectures écrites pour votre propre affaire — la lecture complète du Yi Jing (avec questions de suivi), la lecture de tarot, la lecture personnelle de la baguette, les rapports approfondis Bazi, Zi Wei et thème astral et les questions sur le thème — ainsi que deux produits vendus seuls : le livre de l'année et le rapport de couple. Les prix sont ceux affichés dans votre devise, taxes applicables comprises ; le montant affiché sur la page de paiement est celui que vous payez.",
        "Les pass : trois durées, payées une fois, jamais renouvelées — pass 1 jour à US$3.99 (le premier d'un compte à US$2.99), pass 7 jours à US$7.99, pass 30 jours à US$12.99 (ou le prix équivalent affiché dans votre devise). Un pass court 24 heures, 7×24 heures ou 30×24 heures à partir du paiement. Pendant ce temps vous utilisez sans compter : les lectures complètes du Yi Jing et leurs questions de suivi (jusqu'à 30 par tirage), les lectures de tarot, les lectures personnelles de baguette, les chapitres natals des rapports approfondis Bazi, Zi Wei et thème astral (les chapitres des cycles et de l'année du Bazi, ceux des décennies du Zi Wei et la section « ce mois-ci » du thème astral relèvent de l'abonnement) et les questions sur le thème. Pour éviter les abus, chaque élément a une limite quotidienne raisonnable qu'un usage normal n'atteint jamais. Un pass acheté pendant qu'un autre court commence quand celui-ci se termine ; un pass prend fin de lui-même, sans renouvellement ni nouveau débit. Le pass n'inclut pas le texte complet de la baguette du jour, la journée lue dans votre propre thème (prévision du jour, almanach, choix de dates), le prix membre du livre de l'année et du rapport de couple, la mise à jour mensuelle des rapports ni les lettres réservées aux membres. Un pass acheté le 22 octobre 2026 ou avant garde le texte complet de la baguette du jour et ces chapitres jusqu'à sa fin.",
        "L'abonnement se renouvelle automatiquement : US$9.99 par mois ou US$79 par an (ou le prix affiché dans votre devise ; les renouvellements sont débités dans la devise et au montant de votre souscription et n'augmentent pas avec les changements de prix ultérieurs). Prix du premier mois : la première fois que vous prenez un abonnement mensuel, le premier mois est facturé US$12.99 et le tarif mensuel s'applique dès le deuxième mois ; un abonnement terminé recommence lui aussi au prix du premier mois. L'abonnement couvre tout ce qu'un pass donne (avec les mêmes limites raisonnables) et ajoute : les chapitres liés au temps des rapports approfondis (cycles et année du Bazi, décennies du Zi Wei, « ce mois-ci » du thème astral) réécrits chaque mois pour le mois en cours, le texte complet de la baguette du jour, la journée lue dans votre propre thème (votre journée dans la prévision, « aujourd'hui pour vous » dans l'almanach, le choix de dates selon votre thème et celui de votre partenaire, jusqu'à un an), les lettres quotidienne et mensuelle des membres, 20 % de réduction sur le livre de l'année et le rapport de couple, et 5 liens-cadeaux par mois (les liens inutilisés s'accumulent jusqu'à 15 ; chacun vaut 14 jours et sert une fois, pour quelqu'un d'autre seulement, jamais pour le membre ; un lien non réclamé revient au membre ; plus aucun nouveau lien une fois le renouvellement automatique désactivé, les liens déjà envoyés restant valables). Vous pouvez résilier à tout moment depuis votre page de compte ; l'accès continue jusqu'à la fin de la période en cours et rien d'autre n'est débité ; une période entamée n'est pas remboursée au prorata. Après la fin, les rapports déjà écrits et vos historiques restent consultables (les chapitres liés au temps dans leur dernière version) ; les lettres, les réécritures, le texte complet de la baguette du jour, le contenu personnel quotidien, les questions sur le thème et les prix membres s'arrêtent. L'abonnement est propre à votre compte et ne se transfère pas.",
        "Vendus seuls (chacun un achat unique, jamais renouvelé) : le livre de l'année — Bazi, Zi Wei et thème astral pour une année — à US$36.99, ou US$27.99 en période de lancement (du 1er novembre au 31 janvier) ; le rapport de couple (un pour deux personnes) à US$15.99 ; les membres paient 20 % de moins pour les deux (en période de lancement, le moins cher des deux). La lecture de tarot et la lecture personnelle de baguette coûtent US$2.99 chacune et sont déjà comprises pour les détenteurs de pass et les membres. La carte de la baguette du jour n'est plus vendue depuis le 22 octobre 2026 ; les cartes déjà achetées montrent le texte complet jusqu'à leur fin. Chaque prix peut s'afficher dans votre devise.",
        "Avant le 22 octobre 2026 : la lecture express (US$2.99) et la lecture approfondie (US$9.99) à l'unité, l'abonnement d'un mois, les suppléments membres et le quota de 10 lectures approfondies par mois ont été retirés ; les lectures, quotas et formules achetés avant gardent les conditions de leur achat jusqu'à épuisement ou échéance. Le pass 30 jours est l'ancien abonnement d'un mois, au même prix.",
      ],
    },
    de: {
      h: "1. Was du kaufst",
      p: [
        "YaoFlow liefert digitale Inhalte. Kostenlos: der Wurf eines Hexagramms mit vollständigem Bild und den klassischen Texten, Mondblöcke, Tempellose, das Ziehen von Tarotkarten mit der Bedeutung jeder Karte, Bazi-, Zi-Wei- und Geburtshoroskope, der Almanach und die Terminwahl, die Tagesvorschau und das Tageslos. Kostenpflichtig: die für deine eigene Sache geschriebenen Deutungen – die volle I-Ging-Deutung (mit Nachfragen), die Tarot-Deutung, die persönliche Losdeutung, die Bazi-, Zi-Wei- und Geburtshoroskop-Berichte und die Fragen zum Horoskop – sowie zwei einzeln verkaufte Dinge: das Jahresbuch und der Paar-Bericht. Es gelten die auf der Seite in deiner Währung angezeigten Preise einschließlich anfallender Steuern; der Betrag auf der Zahlungsseite ist der, den du zahlst.",
        "Pässe: drei Laufzeiten, einmal bezahlt, nie verlängert – der 1-Tages-Pass für US$3.99 (der erste eines Kontos US$2.99), der 7-Tage-Pass für US$7.99 und der 30-Tage-Pass für US$12.99 (oder der angezeigte Gegenwert in deiner Währung). Ein Pass läuft 24 Stunden, 7×24 Stunden oder 30×24 Stunden ab Zahlung. Solange er läuft, nutzt du ohne Zählen: volle I-Ging-Deutungen und ihre Nachfragen (bis zu 30 je Wurf), Tarot-Deutungen, persönliche Losdeutungen, die Geburtskapitel der Bazi-, Zi-Wei- und Geburtshoroskop-Berichte (die Kapitel zu Glücksperioden und dem laufenden Jahr im Bazi, zu den Jahrzehnten im Zi Wei und der Abschnitt „dieser Monat“ im Geburtshoroskop gehören zur Mitgliedschaft) und Fragen zum Horoskop. Gegen Missbrauch hat jedes davon eine angemessene Tagesgrenze, die normale Nutzung nie erreicht. Ein Pass, der gekauft wird, während einer läuft, beginnt, wenn dieser endet; ein Pass endet von selbst, ohne Verlängerung und ohne weitere Abbuchung. Ein Pass enthält nicht den vollen Text des Tagesloses, den nach deinem eigenen Horoskop gelesenen Tag (Tagesvorschau, Almanach, Terminwahl), den Mitgliederpreis für Jahresbuch und Paar-Bericht, die monatliche Auffrischung der Berichte und die Mitgliederbriefe. Ein am oder vor dem 22. Oktober 2026 gekaufter Pass behält den vollen Text des Tagesloses und diese Kapitel bis zu seinem Ende.",
        "Die Mitgliedschaft ist ein sich automatisch verlängerndes Abonnement: US$9.99 im Monat oder US$79 im Jahr (oder der angezeigte Preis in deiner Währung; Verlängerungen werden in der Währung und zum Betrag deines Abschlusses abgebucht und steigen nicht mit späteren Preisänderungen). Preis im ersten Monat: beim ersten Abschluss einer Monatsmitgliedschaft kostet der erste Monat US$12.99, ab dem zweiten Monat gilt die Monatsgebühr; wer nach dem Ende einer Mitgliedschaft wieder beginnt, beginnt ebenfalls zum Preis des ersten Monats. Die Mitgliedschaft umfasst alles, was ein Pass bietet (mit denselben angemessenen Grenzen), und dazu: die zeitgebundenen Kapitel der Berichte (Glücksperioden und laufendes Jahr im Bazi, Jahrzehnte im Zi Wei, „dieser Monat“ im Geburtshoroskop), jeden Monat für den laufenden Monat neu geschrieben, den vollen Text des Tagesloses, den nach deinem eigenen Horoskop gelesenen Tag (dein Tag in der Tagesvorschau, „heute für dich“ im Almanach, Terminwahl nach deinem und dem Horoskop deines Partners, bis zu einem Jahr voraus), den täglichen und den monatlichen Mitgliederbrief, 20 % Nachlass auf Jahresbuch und Paar-Bericht sowie 5 Geschenk-Links im Monat (ungenutzte sammeln sich bis 15 an; jeder gilt 14 Tage und einmal, nur für jemand anderen, nie für das Mitglied selbst; ein nicht eingelöster Link geht ans Mitglied zurück; nach Abschalten der automatischen Verlängerung gibt es keine neuen Links, bereits verschickte bleiben gültig). Du kannst jederzeit auf deiner Kontoseite kündigen; der Zugang läuft bis zum Ende der laufenden Periode weiter, danach wird nichts mehr abgebucht; eine begonnene Periode wird nicht anteilig erstattet. Nach dem Ende bleiben bereits geschriebene Berichte und deine Aufzeichnungen lesbar (die zeitgebundenen Kapitel in der zuletzt geschriebenen Fassung); Briefe, Neufassungen, der volle Text des Tagesloses, die täglichen persönlichen Inhalte, die Fragen zum Horoskop und die Mitgliederpreise enden. Die Mitgliedschaft gilt für dein eigenes Konto und ist nicht übertragbar.",
        "Einzeln verkauft (jeweils ein einmaliger Kauf, nie verlängert): das Jahresbuch – Bazi, Zi Wei und Geburtshoroskop für ein Jahr – für US$36.99, im Frühbucherzeitraum (1. November bis 31. Januar) US$27.99; der Paar-Bericht (einer für zwei Personen) für US$15.99; Mitglieder zahlen für beides 20 % weniger (im Frühbucherzeitraum den niedrigeren Preis). Tarot-Deutung und persönliche Losdeutung kosten je US$2.99 und sind für Pass-Inhaber und Mitglieder schon enthalten. Die Tageslos-Karte wird seit dem 22. Oktober 2026 nicht mehr verkauft; bereits gekaufte Karten zeigen den vollen Text bis zu ihrem Ende. Jeder Preis kann als Gegenwert in deiner Währung angezeigt werden.",
        "Vor dem 22. Oktober 2026: die einzelne Kurzdeutung (US$2.99) und Tiefendeutung (US$9.99), die Ein-Monats-Mitgliedschaft, die Mitglieder-Zusatzpakete und das Kontingent von 10 Tiefendeutungen im Monat sind eingestellt; davor gekaufte Deutungen, Kontingente und Tarife behalten die Bedingungen ihres Kaufs, bis sie aufgebraucht oder abgelaufen sind. Der 30-Tage-Pass ist die frühere Ein-Monats-Mitgliedschaft zum selben Preis.",
      ],
    },
    es: {
      h: "1. Qué estás comprando",
      p: [
        "YaoFlow ofrece contenido digital. Gratis: la tirada de un hexagrama con su cuadro completo y los textos clásicos, los bloques lunares, las varillas de templo, la tirada de cartas de tarot con el significado de cada carta, las cartas Bazi, Zi Wei y natal, el almanaque y la elección de fechas, el pronóstico diario y la varilla del día. De pago: las lecturas escritas para tu propio asunto — la lectura completa del I Ching (con preguntas de seguimiento), la lectura de tarot, la lectura personal de la varilla, los informes profundos Bazi, Zi Wei y de carta natal y las preguntas sobre la carta — y dos productos que se venden sueltos: el libro del año y el informe de pareja. Los precios son los mostrados en tu moneda e incluyen los impuestos aplicables; el importe de la página de pago es el que pagas.",
        "Pases: tres duraciones, pagadas una vez, nunca renovadas — pase de 1 día a US$3.99 (el primero de una cuenta a US$2.99), pase de 7 días a US$7.99 y pase de 30 días a US$12.99 (o el precio equivalente en tu moneda). Un pase dura 24 horas, 7×24 horas o 30×24 horas desde el pago. Mientras dura usas sin contar: lecturas completas del I Ching y sus preguntas de seguimiento (hasta 30 por tirada), lecturas de tarot, lecturas personales de varilla, los capítulos natales de los informes profundos Bazi, Zi Wei y de carta natal (los capítulos de ciclos y del año del Bazi, los de las décadas del Zi Wei y la sección «este mes» de la carta natal son de la membresía) y preguntas sobre la carta. Para evitar abusos cada uno tiene un límite diario razonable que el uso normal nunca alcanza. Un pase comprado mientras otro está activo empieza cuando aquel termina; un pase termina por sí solo, sin renovación ni nuevo cobro. El pase no incluye el texto completo de la varilla del día, el día leído desde tu propia carta (pronóstico diario, almanaque, elección de fechas), el precio de miembro del libro del año y del informe de pareja, la actualización mensual de los informes ni las cartas de miembro. Un pase comprado el 22 de octubre de 2026 o antes conserva el texto completo de la varilla del día y esos capítulos hasta que termine.",
        "La membresía es una suscripción que se renueva automáticamente: US$9.99 al mes o US$79 al año (o el precio mostrado en tu moneda; las renovaciones se cobran en la moneda y por el importe con que te suscribiste y no suben con cambios de precio posteriores). Precio del primer mes: la primera vez que empiezas una membresía mensual el primer mes se cobra a US$12.99 y desde el segundo rige la cuota mensual; quien vuelve después de que su membresía terminó empieza también con el precio del primer mes. La membresía cubre todo lo que da un pase (con los mismos límites razonables) y añade: los capítulos ligados al tiempo de los informes profundos (ciclos y año del Bazi, décadas del Zi Wei, «este mes» de la carta natal), reescritos cada mes para el mes en curso, el texto completo de la varilla del día, el día leído desde tu propia carta (tu día en el pronóstico, «hoy para ti» en el almanaque, la elección de fechas según tu carta y la de tu pareja, hasta un año), las cartas diaria y mensual de miembro, 20 % de descuento en el libro del año y el informe de pareja, y 5 enlaces de regalo al mes (los no usados se acumulan hasta 15; cada uno vale 14 días y se usa una vez, solo para otra persona, nunca para el miembro; un enlace no reclamado vuelve al miembro; al desactivar la renovación automática no se emiten nuevos, y los ya enviados siguen valiendo). Puedes cancelar en cualquier momento desde tu página de cuenta; el acceso sigue hasta el final del periodo en curso y no se cobra nada más; un periodo ya empezado no se reembolsa a prorrata. Al terminar, los informes ya escritos y tus registros siguen disponibles (los capítulos ligados al tiempo en su última versión); las cartas, las reescrituras, el texto completo de la varilla del día, el contenido personal diario, las preguntas sobre la carta y los precios de miembro terminan. La membresía es para tu propia cuenta y no se transfiere.",
        "Vendidos sueltos (cada uno una compra única, nunca renovada): el libro del año — Bazi, Zi Wei y carta natal de un año — a US$36.99, o US$27.99 en el periodo anticipado (del 1 de noviembre al 31 de enero); el informe de pareja (uno para dos personas) a US$15.99; los miembros pagan un 20 % menos por ambos (en el periodo anticipado, el más bajo de los dos). La lectura de tarot y la lectura personal de varilla cuestan US$2.99 cada una y ya están incluidas para quien tiene pase o membresía. La tarjeta de la varilla del día ya no se vende desde el 22 de octubre de 2026; las ya compradas muestran el texto completo hasta que terminen. Cada precio puede mostrarse en tu moneda.",
        "Antes del 22 de octubre de 2026: la lectura breve (US$2.99) y la lectura profunda (US$9.99) sueltas, la membresía de un mes, los paquetes extra para miembros y el cupo de 10 lecturas profundas al mes se retiraron; lo comprado antes conserva las condiciones de su compra hasta agotarse o vencer. El pase de 30 días es la antigua membresía de un mes, al mismo precio.",
      ],
    },
    pt: {
      h: "1. O que você está comprando",
      p: [
        "O YaoFlow fornece conteúdo digital. Grátis: a tiragem de um hexagrama com o seu quadro completo e os textos clássicos, os blocos de lua, as varetas de templo, a tiragem de cartas de tarô com o significado de cada carta, os mapas Bazi, Zi Wei e natal, o almanaque e a escolha de datas, a previsão do dia e a vareta do dia. Pago: as leituras escritas para o seu próprio assunto — a leitura completa do I Ching (com perguntas de acompanhamento), a leitura de tarô, a leitura pessoal da vareta, os relatórios aprofundados Bazi, Zi Wei e de mapa natal e as perguntas sobre o mapa — e duas coisas vendidas à parte: o livro do ano e o relatório do casal. Os preços são os mostrados na sua moeda e incluem os impostos aplicáveis; o valor na página de pagamento é o que você paga.",
        "Passes: três durações, pagas uma vez, nunca renovadas — passe de 1 dia por US$3.99 (o primeiro de uma conta por US$2.99), passe de 7 dias por US$7.99 e passe de 30 dias por US$12.99 (ou o preço equivalente na sua moeda). Um passe vale 24 horas, 7×24 horas ou 30×24 horas a partir do pagamento. Enquanto vale, você usa sem contar: leituras completas do I Ching e as suas perguntas de acompanhamento (até 30 por tiragem), leituras de tarô, leituras pessoais de vareta, os capítulos natais dos relatórios aprofundados Bazi, Zi Wei e de mapa natal (os capítulos de ciclos e do ano do Bazi, os das décadas do Zi Wei e a seção «este mês» do mapa natal são da assinatura) e perguntas sobre o mapa. Para evitar abusos, cada item tem um limite diário razoável que o uso normal nunca alcança. Um passe comprado enquanto outro está ativo começa quando aquele termina; um passe termina sozinho, sem renovação nem nova cobrança. O passe não inclui o texto completo da vareta do dia, o dia lido no seu próprio mapa (previsão do dia, almanaque, escolha de datas), o preço de membro do livro do ano e do relatório do casal, a atualização mensal dos relatórios nem as cartas de membro. Um passe comprado em 22 de outubro de 2026 ou antes mantém o texto completo da vareta do dia e esses capítulos até terminar.",
        "A assinatura renova-se automaticamente: US$9.99 por mês ou US$79 por ano (ou o preço mostrado na sua moeda; as renovações são cobradas na moeda e pelo valor da sua adesão e não sobem com mudanças de preço posteriores). Preço do primeiro mês: na primeira vez que você começa uma assinatura mensal, o primeiro mês custa US$12.99 e a mensalidade vale a partir do segundo mês; quem volta depois de a assinatura ter terminado recomeça também pelo preço do primeiro mês. A assinatura cobre tudo o que um passe dá (com os mesmos limites razoáveis) e acrescenta: os capítulos ligados ao tempo dos relatórios aprofundados (ciclos e ano do Bazi, décadas do Zi Wei, «este mês» do mapa natal), reescritos todo mês para o mês corrente, o texto completo da vareta do dia, o dia lido no seu próprio mapa (o seu dia na previsão, «hoje para você» no almanaque, a escolha de datas pelo seu mapa e pelo do seu par, até um ano), as cartas diária e mensal de membro, 20 % de desconto no livro do ano e no relatório do casal, e 5 links de presente por mês (os não usados acumulam até 15; cada um vale 14 dias e serve uma vez, só para outra pessoa, nunca para o membro; um link não resgatado volta ao membro; ao desligar a renovação automática não saem novos links, e os já enviados continuam valendo). Você pode cancelar a qualquer momento na página da conta; o acesso continua até o fim do período em curso e nada mais é cobrado; um período já iniciado não é reembolsado proporcionalmente. Depois do fim, os relatórios já escritos e os seus registros continuam disponíveis (os capítulos ligados ao tempo na última versão); as cartas, as reescritas, o texto completo da vareta do dia, o conteúdo pessoal diário, as perguntas sobre o mapa e os preços de membro acabam. A assinatura é da sua própria conta e não se transfere.",
        "Vendidos à parte (cada um uma compra única, nunca renovada): o livro do ano — Bazi, Zi Wei e mapa natal de um ano — por US$36.99, ou US$27.99 no período de pré-venda (de 1 de novembro a 31 de janeiro); o relatório do casal (um para duas pessoas) por US$15.99; membros pagam 20 % a menos em ambos (na pré-venda, o menor dos dois). A leitura de tarô e a leitura pessoal de vareta custam US$2.99 cada e já estão incluídas para quem tem passe ou assinatura. O cartão da vareta do dia deixou de ser vendido em 22 de outubro de 2026; os já comprados mostram o texto completo até terminarem. Cada preço pode aparecer na sua moeda.",
        "Antes de 22 de outubro de 2026: a leitura breve (US$2.99) e a leitura completa (US$9.99) avulsas, a assinatura de um mês, os pacotes extra para membros e a cota de 10 leituras completas por mês foram retirados; o que foi comprado antes mantém as condições da compra até acabar ou vencer. O passe de 30 dias é a antiga assinatura de um mês, pelo mesmo preço.",
      ],
    },
  },
  {
    zh: {
      h: "2. 这不是专业建议",
      p: [
        "YaoFlow 是文化反思体验。它不构成、也不能替代医疗、心理、法律、财务或投资方面的专业建议，不预测未来，不保证任何结果。",
        "如果你或他人正面临紧急危险或严重的健康、安全问题，请立即联系当地急救或专业机构，不要依赖本站内容。",
        "解读文本由 AI 生成，可能出现不准确、不完整或不适合你具体情况的内容。是否采纳，以及由此产生的任何后果，由你自行判断和承担。",
      ],
    },
    en: {
      h: "2. This is not professional advice",
      p: [
        "YaoFlow is a cultural reflection experience. It does not constitute and cannot replace medical, psychological, legal, financial, or investment advice. It does not predict the future and guarantees no outcome.",
        "If you or someone else is in immediate danger or facing a serious health or safety situation, contact local emergency services or a qualified professional. Do not rely on anything here.",
        "Readings are generated by AI and may be inaccurate, incomplete, or unsuited to your circumstances. Whether to act on one — and any consequence of doing so — is your own judgment and responsibility.",
      ],
    },
    ja: {
      h: "2. 専門的な助言ではありません",
      p: [
        "YaoFlow は文化的な内省体験です。医療、心理、法律、金融、投資に関する専門的助言を構成するものではなく、それに代わるものでもありません。未来を予測せず、いかなる結果も保証しません。",
        "あなたや他の人が差し迫った危険にあるか、健康や安全に関わる深刻な状況にある場合は、直ちに地域の救急機関や専門家に連絡してください。本サイトの内容に頼らないでください。",
        "読み解きの文章は AI が生成しており、不正確、不完全、またはあなたの状況に合わない内容を含むことがあります。それを採用するかどうか、およびそれによって生じる結果は、あなた自身の判断と責任に委ねられます。",
      ],
    },
    ko: {
      h: "2. 전문적인 조언이 아닙니다",
      p: [
        "YaoFlow는 문화적 성찰 경험입니다. 의료, 심리, 법률, 재무, 투자에 관한 전문적 조언을 구성하지 않으며 이를 대체할 수도 없습니다. 미래를 예측하지 않고 어떤 결과도 보장하지 않습니다.",
        "당신이나 다른 사람이 긴급한 위험에 처해 있거나 심각한 건강·안전 문제에 직면했다면, 즉시 지역 응급 기관이나 전문가에게 연락하세요. 이 사이트의 내용에 의존하지 마세요.",
        "풀이 텍스트는 AI가 생성하며, 부정확하거나 불완전하거나 당신의 구체적 상황에 맞지 않는 내용이 있을 수 있습니다. 이를 받아들일지 여부와 그로 인한 모든 결과는 당신 자신의 판단과 책임입니다.",
      ],
    },
    fr: {
      h: "2. Ce n'est pas un conseil professionnel",
      p: [
        "YaoFlow est une expérience de réflexion culturelle. Elle ne constitue pas et ne remplace pas un conseil médical, psychologique, juridique, financier ou d'investissement. Elle ne prédit pas l'avenir et ne garantit aucun résultat.",
        "Si vous-même ou une autre personne êtes en danger immédiat ou face à une situation grave de santé ou de sécurité, contactez les services d'urgence locaux ou un professionnel qualifié. Ne vous fiez à rien de ce qui est écrit ici.",
        "Les lectures sont générées par une IA et peuvent être inexactes, incomplètes ou inadaptées à votre situation. Décider d'agir ou non selon une lecture — et toute conséquence de ce choix — relève de votre propre jugement et de votre responsabilité.",
      ],
    },
    de: {
      h: "2. Das ist keine fachliche Beratung",
      p: [
        "YaoFlow ist eine kulturelle Reflexionserfahrung. Sie stellt keine medizinische, psychologische, rechtliche, finanzielle oder Anlageberatung dar und kann eine solche nicht ersetzen. Sie sagt die Zukunft nicht voraus und garantiert kein Ergebnis.",
        "Wenn du oder jemand anderes in unmittelbarer Gefahr ist oder eine ernste gesundheitliche oder sicherheitsrelevante Situation vorliegt, wende dich sofort an den örtlichen Notdienst oder eine qualifizierte Fachperson. Verlass dich nicht auf Inhalte dieser Seite.",
        "Deutungen werden von einer KI erzeugt und können ungenau, unvollständig oder für deine Lage ungeeignet sein. Ob du danach handelst — und jede Folge daraus — liegt in deinem eigenen Urteil und deiner Verantwortung.",
      ],
    },
    es: {
      h: "2. Esto no es asesoramiento profesional",
      p: [
        "YaoFlow es una experiencia de reflexión cultural. No constituye ni sustituye el asesoramiento médico, psicológico, legal, financiero ni de inversión. No predice el futuro ni garantiza ningún resultado.",
        "Si tú u otra persona están en peligro inmediato o ante una situación grave de salud o seguridad, contacta a los servicios de emergencia locales o con un profesional cualificado. No te apoyes en nada de lo que aquí se dice.",
        "Las lecturas las genera una IA y pueden ser inexactas, incompletas o inadecuadas para tu situación. Actuar o no según una lectura, y cualquier consecuencia de hacerlo, es tu propio juicio y responsabilidad.",
      ],
    },
    pt: {
      h: "2. Isto não é aconselhamento profissional",
      p: [
        "O YaoFlow é uma experiência de reflexão cultural. Não constitui nem substitui aconselhamento médico, psicológico, jurídico, financeiro ou de investimento. Não prevê o futuro nem garante nenhum resultado.",
        "Se você ou outra pessoa estiver em perigo imediato ou diante de uma situação grave de saúde ou segurança, entre em contato imediatamente com os serviços de emergência locais ou com um profissional qualificado. Não confie em nada do que está aqui.",
        "As leituras são geradas por IA e podem ser imprecisas, incompletas ou inadequadas à sua situação. Agir ou não com base em uma leitura — e qualquer consequência disso — depende do seu próprio julgamento e é de sua responsabilidade.",
      ],
    },
  },
  {
    zh: {
      h: "3. 交付与访问",
      p: [
        "支付成功后，解读会在同一页面生成（通常十几秒到一分钟），并同时发送到你结账时使用的邮箱。该页面链接即为你的凭证，可保存并重复访问。",
        "用结账邮箱登录账号，你的所有付费解读都会归档在「我的」里，可以随时回看；没有登录的情况下，链接是找回解读的唯一途径，请妥善保存。",
      ],
    },
    en: {
      h: "3. Delivery and access",
      p: [
        "After successful payment your reading is generated on the return page, usually within a minute, and sent to the email you used at checkout. That page's link is your receipt: save it and you can return to the reading.",
        "Sign in with your checkout email and every paid reading is archived under “Mine”, where you can return to it at any time. Without signing in, the link is the only way back to a reading — please keep it.",
      ],
    },
    ja: {
      h: "3. 提供とアクセス",
      p: [
        "決済が完了すると、読み解きは同じページ上で生成され（通常は十数秒から一分程度）、決済時に使ったメールアドレスにも送られます。そのページのリンクがあなたの控えです。保存しておけば何度でも読み返せます。",
        "決済時のメールアドレスでログインすると、購入したすべての読み解きが「マイページ」に保管され、いつでも読み返せます。ログインしない場合、リンクが読み解きに戻る唯一の手段ですので、大切に保管してください。",
      ],
    },
    ko: {
      h: "3. 전달과 접근",
      p: [
        "결제가 완료되면 풀이가 같은 페이지에서 생성되고(보통 십여 초에서 1분), 결제 시 사용한 이메일로도 발송됩니다. 그 페이지의 링크가 당신의 증빙이며, 저장해 두면 언제든 다시 볼 수 있습니다.",
        "결제 이메일로 로그인하면 구매한 모든 풀이가 ‘내 정보’에 보관되어 언제든 다시 볼 수 있습니다. 로그인하지 않은 경우 링크가 풀이로 돌아가는 유일한 길이니 잘 보관하세요.",
      ],
    },
    fr: {
      h: "3. Livraison et accès",
      p: [
        "Une fois le paiement effectué, la lecture est générée sur la même page (généralement en moins d'une minute) et envoyée à l'adresse e-mail utilisée au paiement. Le lien de cette page est votre reçu\u00a0: gardez-le et vous pourrez revenir à la lecture.",
        "Connectez-vous avec l'e-mail du paiement et chaque lecture achetée est archivée dans «\u00a0Mon espace\u00a0», où vous pouvez y revenir à tout moment. Sans connexion, le lien est le seul chemin vers une lecture — conservez-le.",
      ],
    },
    de: {
      h: "3. Lieferung und Zugang",
      p: [
        "Nach erfolgreicher Zahlung wird die Deutung auf derselben Seite erzeugt (meist innerhalb einer Minute) und an die beim Bezahlen verwendete E-Mail-Adresse geschickt. Der Link dieser Seite ist dein Beleg: bewahre ihn auf, dann kannst du jederzeit zur Deutung zurückkehren.",
        "Melde dich mit deiner Bezahl-E-Mail an, und jede gekaufte Deutung liegt unter „Mein Bereich“ für dich bereit. Ohne Anmeldung ist der Link der einzige Weg zurück zu einer Deutung — bitte bewahre ihn auf.",
      ],
    },
    es: {
      h: "3. Entrega y acceso",
      p: [
        "Tras el pago, la lectura se genera en la misma página (normalmente en menos de un minuto) y se envía al correo que usaste al pagar. El enlace de esa página es tu comprobante: guárdalo y podrás volver a la lectura.",
        "Inicia sesión con el correo del pago y cada lectura comprada queda archivada en «Mi espacio», donde puedes volver a ella cuando quieras. Sin iniciar sesión, el enlace es el único camino de vuelta a una lectura: consérvalo.",
      ],
    },
    pt: {
      h: "3. Entrega e acesso",
      p: [
        "Após o pagamento, a leitura é gerada na página de retorno (normalmente em menos de um minuto) e enviada para o e-mail usado no pagamento. O link dessa página é o seu comprovante: guarde-o e você poderá voltar à leitura.",
        "Entre na sua conta com o e-mail usado no pagamento e todas as leituras compradas ficam arquivadas em “Meu espaço”, onde você pode voltar a elas a qualquer momento. Sem entrar na conta, o link é o único caminho de volta a uma leitura — guarde-o.",
      ],
    },
  },
  {
    zh: {
      h: "4. 退款",
      p: [
        "以下情况可以退款：重复扣款或计费错误；付款后由于我们的技术故障始终无法生成解读；解读内容明显损坏或无法阅读。",
        "首次付费保证：你在 YaoFlow 的第一笔一次性付费（2026 年 10 月 22 日前为单次解读；之后为在起卦页连同这一卦买的第一张 1 日通卡）如果不满意，可在付款后 24 小时内在解读页或「我的」页一键申请全额退款，无须说明理由，条件是这张通卡期内用掉的付费内容合计不超过两份（一份深断、一份塔罗或解签解读、一份深度报告各算一份；追问与命盘问答不算）；退款后该解读即关闭，那张通卡也同时结束，每人限用一次（同一账号、邮箱、浏览器，或同一张信用卡／借记卡、同一个支付宝账号，都算同一人）。年书、合盘、塔罗与解签的单买及会员订阅不适用。本项优先于下一段。",
        "以下情况通常不退款：解读已正常生成并交付，但你不认同其内容；提交了含糊或无法解读的问题；遗失了解读链接。",
        "需要退款请写信至 support@yaoflow.com，附上支付邮箱与大致时间。你所在国家或地区法律赋予的强制性消费者权利不受本条限制。",
        "如果你位于欧盟、欧洲经济区或英国：解读属于即时交付的数字内容。付款即表示你要求我们立即开始交付，并知悉交付开始后你将失去法定的 14 天撤回权。会员订阅在开通后 14 天内、且当期尚未使用任何解读时，仍可行使撤回权获得全额退款。付款按钮下方写明：点击付款即表示同意立即交付并知悉因此失去撤回权；交付邮件会再次载明这一确认。",
      ],
    },
    en: {
      h: "4. Refunds",
      p: [
        "Refundable: duplicate or incorrect charges; a technical failure on our side that prevents any reading from being generated after payment; delivered content that is corrupted or unreadable.",
        "First-purchase guarantee: if you are not satisfied with your first one-time payment to YaoFlow (a single reading before 22 October 2026; from then on, an account's first 1-day pass bought together with a cast on the cast page), you may ask for a full refund with one tap on the reading page or your account page within 24 hours of payment, no reason needed, provided the pass has served no more than two paid pieces so far (a deep reading, a tarot or lot reading and a deep chart report each count as one; follow-up questions and chart Q&A do not). The refund closes that reading and ends that pass; once per person (the same account, email address, browser, credit or debit card or Alipay account all count as the same person). It does not apply to the year book, the pair report, single tarot or lot readings, or membership subscriptions. This paragraph takes precedence over the next.",
        "Not normally refundable: a reading that was generated and delivered but that you disagree with; an unclear or uninterpretable question; a lost reading link.",
        "To request a refund, write to support@yaoflow.com with the email used at checkout and the approximate time of purchase. Nothing here limits mandatory consumer rights in your country or region.",
        "If you are in the EU, the EEA, or the UK: a reading is digital content delivered immediately. By paying you ask us to begin delivery at once and acknowledge that you lose the statutory 14-day right of withdrawal once delivery has begun. A membership can still be withdrawn from within 14 days of subscribing for a full refund, provided no reading has been used in that period. Right under the pay button we state that paying means agreeing to immediate delivery and acknowledging the loss of the right of withdrawal; the delivery email repeats this confirmation.",
      ],
    },
    ja: {
      h: "4. 返金",
      p: [
        "次の場合は返金します。二重請求や請求の誤り。決済後、当方の技術的な障害により読み解きがどうしても生成できなかった場合。提供された内容が明らかに壊れているか読めない場合。",
        "初回購入の保証：YaoFlow への初めての一回払い（2026 年 10 月 22 日より前は単発の鑑定、それ以降は立卦ページでその卦と一緒に買ったアカウント初回の 1 日パス）にご満足いただけない場合、お支払いから 24 時間以内に鑑定ページまたはマイページのボタン一つで全額返金を申請でき、理由は不要です。ただし、そのパスで利用した有料コンテンツが合計 2 件以内であることが条件です（深い鑑定、タロットまたはおみくじの鑑定、命盤の詳細レポートはそれぞれ 1 件と数え、追加質問と命盤 Q&A は数えません）。返金後はその鑑定は閉じられ、そのパスも同時に終了します。お一人様一回限りです（同じアカウント、メールアドレス、ブラウザ、同じクレジットカード／デビットカード、同じ Alipay アカウントは同一人物とみなします）。年運レポート、相性レポート、タロットやおみくじの単品、メンバーシップには適用されません。本項は次の段落に優先します。",
        "次の場合は通常返金しません。読み解きが正常に生成・提供されたが内容に同意できない場合。曖昧で読み解きようのない問いを送った場合。読み解きのリンクを紛失した場合。",
        "返金を希望される場合は、決済に使ったメールアドレスとおおよその購入時刻を添えて support@yaoflow.com までご連絡ください。お住まいの国や地域の法律が保障する消費者の権利は、本条によって制限されません。",
        "EU・EEA・英国にお住まいの場合：読み解きは即時に提供されるデジタルコンテンツです。お支払いにより、あなたは直ちに提供を開始することを求め、提供開始後は法定の 14 日間の撤回権を失うことを了承したものとします。メンバーシップは、加入後 14 日以内かつ当該期間に読み解きを一度も利用していなければ、撤回権を行使して全額返金を受けられます。お支払いボタンのすぐ下に、お支払いにより即時の提供に同意し、それにより撤回権を失うことを了承する旨を明記しています。提供のメールにもこの確認を再度記載します。",
      ],
    },
    ko: {
      h: "4. 환불",
      p: [
        "다음 경우 환불합니다. 중복 결제나 청구 오류. 결제 후 저희 쪽 기술 장애로 풀이가 끝내 생성되지 않은 경우. 전달된 내용이 명백히 손상되었거나 읽을 수 없는 경우.",
        "첫 결제 보장: YaoFlow에서의 첫 1회성 결제(2026년 10월 22일 이전은 단건 풀이, 그 이후는 점괘 페이지에서 그 괘와 함께 산 계정의 첫 1일 패스)가 만족스럽지 않다면 결제 후 24시간 안에 풀이 페이지나 내 계정 페이지에서 한 번의 탭으로 전액 환불을 신청할 수 있으며 이유는 필요 없습니다. 다만 그 패스로 사용한 유료 콘텐츠가 모두 두 건 이하여야 합니다(깊은 풀이, 타로·제비 풀이, 명반 심층 리포트는 각각 한 건으로 세고, 추가 질문과 명반 Q&A는 세지 않습니다). 환불되면 그 풀이는 닫히고 그 패스도 함께 종료됩니다. 1인 1회입니다(같은 계정, 이메일, 브라우저, 같은 신용/체크카드, 같은 Alipay 계정은 같은 사람으로 봅니다). 연간 운세 책, 궁합 리포트, 타로·제비 단건 구매, 멤버십 구독에는 적용되지 않습니다. 이 조항은 다음 단락보다 우선합니다.",
        "다음 경우는 보통 환불하지 않습니다. 풀이가 정상적으로 생성·전달되었으나 내용에 동의하지 않는 경우. 모호하거나 해석할 수 없는 질문을 제출한 경우. 풀이 링크를 분실한 경우.",
        "환불이 필요하면 결제에 사용한 이메일과 대략적인 구매 시각을 적어 support@yaoflow.com으로 보내 주세요. 거주 국가나 지역의 법률이 보장하는 강행적 소비자 권리는 이 조항으로 제한되지 않습니다.",
        "EU·EEA·영국에 거주하는 경우: 풀이는 즉시 전달되는 디지털 콘텐츠입니다. 결제함으로써 당신은 즉시 전달을 시작할 것을 요청하며, 전달이 시작되면 법정 14일 철회권을 잃는다는 점을 확인합니다. 멤버십은 가입 후 14일 이내이고 해당 기간에 풀이를 한 번도 이용하지 않았다면 철회권을 행사해 전액 환불받을 수 있습니다. 결제 버튼 바로 아래에 결제하면 즉시 전달에 동의하고 그로 인해 철회권을 잃는다는 점을 확인하는 것이라고 명시하며, 전달 이메일에 이 확인 내용이 다시 기재됩니다.",
      ],
    },
    fr: {
      h: "4. Remboursements",
      p: [
        "Remboursable\u00a0: un prélèvement en double ou erroné\u202f; une panne technique de notre côté qui empêche toute génération de lecture après le paiement\u202f; un contenu livré corrompu ou illisible.",
        "Garantie premier achat : si votre premier paiement unique à YaoFlow (une lecture à l'unité avant le 22 octobre 2026 ; depuis, le premier pass 1 jour d'un compte acheté avec un tirage sur la page de tirage) ne vous satisfait pas, vous pouvez demander un remboursement intégral d'un seul geste sur la page de la lecture ou sur votre page de compte dans les 24 heures suivant le paiement, sans motif, à condition que ce pass n'ait pas servi à plus de deux contenus payants (une lecture approfondie, une lecture de tarot ou de baguette et un rapport de thème approfondi comptent chacun pour un ; les questions de suivi et les questions-réponses sur le thème ne comptent pas). Le remboursement ferme cette lecture et met fin à ce pass ; une fois par personne (même compte, même adresse, même navigateur, même carte bancaire ou même compte Alipay comptent comme la même personne). Elle ne s'applique ni au livre de l'année, ni au rapport de couple, ni aux lectures de tarot ou de baguette à l'unité, ni aux abonnements. Ce paragraphe prime sur le suivant.",
        "Normalement non remboursable\u00a0: une lecture générée et livrée normalement mais avec laquelle vous n'êtes pas d'accord\u202f; une question vague ou impossible à interpréter\u202f; un lien de lecture perdu.",
        "Pour demander un remboursement, écrivez à support@yaoflow.com en indiquant l'e-mail utilisé au paiement et l'heure approximative de l'achat. Rien ici ne limite les droits impératifs des consommateurs dans votre pays ou votre région.",
        "Si vous êtes dans l'UE, l'EEE ou au Royaume-Uni\u00a0: une lecture est un contenu numérique fourni immédiatement. En payant, vous demandez que la fourniture commence aussitôt et vous reconnaissez perdre votre droit légal de rétractation de 14 jours dès que la fourniture a commencé. Un abonnement peut encore être rétracté dans les 14 jours suivant la souscription pour un remboursement intégral, à condition qu'aucune lecture n'ait été utilisée pendant cette période. Juste sous le bouton de paiement, nous indiquons qu'en payant vous acceptez la fourniture immédiate et reconnaissez la perte du droit de rétractation ; l'e-mail de livraison reprend cette confirmation.",
      ],
    },
    de: {
      h: "4. Erstattungen",
      p: [
        "Erstattet werden: doppelte oder fehlerhafte Abbuchungen; eine technische Störung auf unserer Seite, durch die nach der Zahlung keine Deutung erzeugt werden konnte; gelieferte Inhalte, die beschädigt oder unlesbar sind.",
        "Erstkauf-Garantie: Wenn du mit deiner ersten einmaligen Zahlung an YaoFlow (vor dem 22. Oktober 2026 eine einzelne Deutung; seither der erste 1-Tages-Pass eines Kontos, zusammen mit einem Wurf auf der Wurfseite gekauft) nicht zufrieden bist, kannst du innerhalb von 24 Stunden nach der Zahlung auf der Deutungsseite oder deiner Kontoseite mit einem Tipp die volle Erstattung verlangen, ohne Begründung – sofern über diesen Pass bisher höchstens zwei bezahlte Inhalte bezogen wurden (eine tiefe Deutung, eine Tarot- oder Losdeutung und ein ausführlicher Horoskopbericht zählen je als einer; Nachfragen und Horoskop-Fragen zählen nicht). Die Erstattung schließt diese Deutung und beendet diesen Pass; einmal pro Person (dasselbe Konto, dieselbe E-Mail-Adresse, derselbe Browser, dieselbe Kredit- oder Debitkarte oder dasselbe Alipay-Konto gelten als dieselbe Person). Sie gilt nicht für Jahresbuch, Paar-Bericht, einzelne Tarot- oder Losdeutungen oder Mitgliedschaften. Dieser Absatz geht dem nächsten vor.",
        "In der Regel nicht erstattet werden: eine ordnungsgemäß erzeugte und gelieferte Deutung, mit deren Inhalt du nicht einverstanden bist; eine unklare oder nicht deutbare Frage; ein verlorener Link zur Deutung.",
        "Für eine Erstattung schreib an support@yaoflow.com mit der beim Bezahlen verwendeten E-Mail-Adresse und dem ungefähren Kaufzeitpunkt. Zwingende Verbraucherrechte deines Landes oder deiner Region werden hierdurch nicht eingeschränkt.",
        "Wenn du in der EU, im EWR oder im Vereinigten Königreich bist: Eine Deutung ist ein sofort gelieferter digitaler Inhalt. Mit der Zahlung verlangst du, dass die Lieferung sofort beginnt, und bestätigst, dass du dein gesetzliches 14-tägiges Widerrufsrecht verlierst, sobald die Lieferung begonnen hat. Eine Mitgliedschaft kannst du innerhalb von 14 Tagen nach Abschluss weiterhin gegen volle Erstattung widerrufen, sofern in diesem Zeitraum keine Deutung genutzt wurde. Direkt unter dem Bezahl-Button steht, dass du mit der Zahlung der sofortigen Lieferung zustimmst und den Verlust des Widerrufsrechts bestätigst; die Liefer-E-Mail wiederholt diese Bestätigung.",
      ],
    },
    es: {
      h: "4. Reembolsos",
      p: [
        "Se reembolsa: un cobro duplicado o incorrecto; un fallo técnico por nuestra parte que impida generar cualquier lectura tras el pago; un contenido entregado corrupto o ilegible.",
        "Garantía de primera compra: si tu primer pago único a YaoFlow (una lectura suelta antes del 22 de octubre de 2026; desde entonces, el primer pase de 1 día de una cuenta comprado junto con una tirada en la página de tirada) no te satisface, puedes pedir el reembolso íntegro con un toque en la página de la lectura o en tu página de cuenta dentro de las 24 horas siguientes al pago, sin dar motivo, siempre que con ese pase no hayas usado más de dos contenidos de pago (una lectura profunda, una lectura de tarot o varilla y un informe de carta en profundidad cuentan uno cada uno; las preguntas de seguimiento y las preguntas sobre la carta no cuentan). El reembolso cierra esa lectura y termina ese pase; una vez por persona (la misma cuenta, correo, navegador, tarjeta de crédito o débito o cuenta de Alipay cuentan como la misma persona). No se aplica al libro del año, al informe de pareja, a lecturas sueltas de tarot o varilla ni a las suscripciones. Este párrafo prevalece sobre el siguiente.",
        "Normalmente no se reembolsa: una lectura generada y entregada con normalidad con la que no estás de acuerdo; una pregunta vaga o imposible de interpretar; un enlace de lectura perdido.",
        "Para pedir un reembolso, escribe a support@yaoflow.com indicando el correo usado al pagar y la hora aproximada de la compra. Nada de lo aquí dicho limita los derechos imperativos de los consumidores en tu país o región.",
        "Si estás en la UE, el EEE o el Reino Unido: una lectura es contenido digital entregado de inmediato. Al pagar solicitas que la entrega comience al momento y reconoces que pierdes el derecho legal de desistimiento de 14 días una vez iniciada la entrega. Una membresía aún puede desistirse en los 14 días siguientes a la suscripción con reembolso íntegro, siempre que no se haya usado ninguna lectura en ese periodo. Justo debajo del botón de pago indicamos que, al pagar, aceptas la entrega inmediata y reconoces la pérdida del derecho de desistimiento; el correo de entrega repite esta confirmación.",
      ],
    },
    pt: {
      h: "4. Reembolsos",
      p: [
        "Reembolsamos: cobranças duplicadas ou incorretas; uma falha técnica do nosso lado que impeça a geração de qualquer leitura após o pagamento; conteúdo entregue corrompido ou ilegível.",
        "Garantia da primeira compra: se o seu primeiro pagamento único ao YaoFlow (uma leitura avulsa antes de 22 de outubro de 2026; desde então, o primeiro passe de 1 dia de uma conta comprado junto com uma tiragem na página de tiragem) não o satisfizer, você pode pedir o reembolso integral com um toque na página da leitura ou na sua página de conta em até 24 horas após o pagamento, sem justificar, desde que esse passe não tenha sido usado para mais de dois conteúdos pagos (uma leitura profunda, uma leitura de tarô ou vareta e um relatório aprofundado do mapa contam um cada; perguntas de acompanhamento e perguntas sobre o mapa não contam). O reembolso fecha essa leitura e encerra esse passe; uma vez por pessoa (a mesma conta, e-mail, navegador, cartão de crédito ou débito ou conta Alipay contam como a mesma pessoa). Não se aplica ao livro do ano, ao relatório do casal, a leituras avulsas de tarô ou vareta nem às assinaturas. Este parágrafo prevalece sobre o seguinte.",
        "Normalmente não reembolsamos: uma leitura gerada e entregue normalmente com a qual você não concorda; uma pergunta vaga ou impossível de interpretar; um link de leitura perdido.",
        "Para pedir um reembolso, escreva para support@yaoflow.com informando o e-mail usado no pagamento e o horário aproximado da compra. Nada aqui limita os direitos obrigatórios do consumidor no seu país ou região.",
        "Se você está na UE, no EEE ou no Reino Unido: uma leitura é conteúdo digital entregue imediatamente. Ao pagar, você pede que a entrega comece de imediato e reconhece que perde o direito legal de arrependimento de 14 dias assim que a entrega começa. Uma assinatura ainda pode ser cancelada com reembolso integral nos 14 dias seguintes à contratação, desde que nenhuma leitura tenha sido usada nesse período. Logo abaixo do botão de pagamento informamos que, ao pagar, você concorda com a entrega imediata e reconhece a perda do direito de arrependimento; o e-mail de entrega repete essa confirmação.",
      ],
    },
  },
  {
    zh: {
      h: "5. 使用规范",
      p: [
        "你必须年满 18 岁。不得利用本站从事违法活动、骚扰或伤害他人、提交他人隐私信息，也不得批量抓取或转售本站内容。",
        "我们可能因滥用、欺诈或安全原因限制访问。",
      ],
    },
    en: {
      h: "5. Acceptable use",
      p: [
        "You must be 18 or older. Do not use the site to break the law, harass or harm anyone, submit other people's private information, or scrape and resell its content in bulk.",
        "We may restrict access in response to abuse, fraud, or security concerns.",
      ],
    },
    ja: {
      h: "5. 利用のルール",
      p: [
        "18 歳以上である必要があります。本サイトを違法行為、他者への嫌がらせや危害、他人の個人情報の送信に使ってはならず、コンテンツを大量に収集したり転売したりしてもいけません。",
        "濫用、不正、または安全上の理由により、アクセスを制限することがあります。",
      ],
    },
    ko: {
      h: "5. 이용 규범",
      p: [
        "만 18세 이상이어야 합니다. 이 사이트를 불법 행위, 타인에 대한 괴롭힘이나 위해, 타인의 개인정보 제출에 이용해서는 안 되며, 콘텐츠를 대량으로 수집하거나 재판매해서도 안 됩니다.",
        "남용, 사기 또는 보안상의 이유로 접근을 제한할 수 있습니다.",
      ],
    },
    fr: {
      h: "5. Usage acceptable",
      p: [
        "Vous devez avoir 18 ans ou plus. N'utilisez pas le site pour enfreindre la loi, harceler ou nuire à quelqu'un, soumettre les informations privées d'autrui, ni pour extraire et revendre son contenu en masse.",
        "Nous pouvons restreindre l'accès en cas d'abus, de fraude ou pour des raisons de sécurité.",
      ],
    },
    de: {
      h: "5. Zulässige Nutzung",
      p: [
        "Du musst mindestens 18 Jahre alt sein. Nutze die Seite nicht, um Gesetze zu brechen, jemanden zu belästigen oder zu schädigen, private Daten anderer einzureichen oder Inhalte massenhaft abzugreifen und weiterzuverkaufen.",
        "Bei Missbrauch, Betrug oder aus Sicherheitsgründen können wir den Zugang einschränken.",
      ],
    },
    es: {
      h: "5. Uso aceptable",
      p: [
        "Debes tener 18 años o más. No uses el sitio para infringir la ley, acosar o dañar a nadie, enviar información privada de otras personas, ni para extraer y revender su contenido de forma masiva.",
        "Podemos restringir el acceso ante abusos, fraude o motivos de seguridad.",
      ],
    },
    pt: {
      h: "5. Uso aceitável",
      p: [
        "Você precisa ter 18 anos ou mais. Não use o site para violar a lei, assediar ou prejudicar alguém, enviar informações privadas de terceiros, nem para extrair e revender o conteúdo dele em massa.",
        "Podemos restringir o acesso em caso de abuso, fraude ou por motivos de segurança.",
      ],
    },
  },
  {
    zh: {
      h: "6. 知识产权",
      p: [
        "《周易》经文属公有领域。本站的英文今译、界面、代码、编辑内容与品牌由运营者拥有。你交付的解读可自行留存和用于个人用途。",
      ],
    },
    en: {
      h: "6. Intellectual property",
      p: [
        "The Zhouyi text is in the public domain. Our English renderings, interface, code, editorial content, and brand belong to the operator. A reading delivered to you is yours to keep and use personally.",
      ],
    },
    ja: {
      h: "6. 知的財産",
      p: [
        "『周易』の原文はパブリックドメインです。本サイトの英訳、インターフェース、コード、編集コンテンツ、ブランドは運営者に帰属します。あなたに提供された読み解きは、保管して個人的に利用してかまいません。",
      ],
    },
    ko: {
      h: "6. 지식재산",
      p: [
        "『주역』 원문은 공공 영역에 속합니다. 이 사이트의 영어 번역, 인터페이스, 코드, 편집 콘텐츠와 브랜드는 운영자의 소유입니다. 당신에게 전달된 풀이는 보관하고 개인적으로 사용할 수 있습니다.",
      ],
    },
    fr: {
      h: "6. Propriété intellectuelle",
      p: [
        "Le texte du Zhouyi est dans le domaine public. Nos traductions anglaises, l'interface, le code, le contenu éditorial et la marque appartiennent à l'exploitant. Une lecture qui vous a été livrée vous appartient\u00a0: vous pouvez la conserver et l'utiliser à titre personnel.",
      ],
    },
    de: {
      h: "6. Geistiges Eigentum",
      p: [
        "Der Text des Zhouyi ist gemeinfrei. Unsere englischen Übertragungen, die Oberfläche, der Code, redaktionelle Inhalte und die Marke gehören dem Betreiber. Eine an dich gelieferte Deutung darfst du behalten und persönlich nutzen.",
      ],
    },
    es: {
      h: "6. Propiedad intelectual",
      p: [
        "El texto del Zhouyi es de dominio público. Nuestras versiones en inglés, la interfaz, el código, el contenido editorial y la marca pertenecen al operador. Una lectura que se te haya entregado es tuya para conservarla y usarla personalmente.",
      ],
    },
    pt: {
      h: "6. Propriedade intelectual",
      p: [
        "O texto do Zhouyi está em domínio público. Nossas versões em inglês, a interface, o código, o conteúdo editorial e a marca pertencem ao operador. Uma leitura entregue a você é sua para guardar e usar pessoalmente.",
      ],
    },
  },
  {
    zh: {
      h: "7. 责任限制与变更",
      p: [
        "在法律允许的最大范围内，我们对因使用本站或依赖解读内容而产生的间接、附带或后果性损失不承担责任；我们的总责任不超过你为相关那次解读实际支付的金额。",
        "条款可能更新。重大变更会在生效前至少 14 天通过邮件通知会员；如果你不同意，可以在变更生效前取消会员。其他变更直接在本页发布，并更新页首的日期。",
      ],
    },
    en: {
      h: "7. Liability and changes",
      p: [
        "To the maximum extent permitted by law, we are not liable for indirect, incidental, or consequential loss arising from use of the site or reliance on a reading, and our total liability will not exceed what you actually paid for the reading in question.",
        "These terms may be updated. Material changes are announced to members by email at least 14 days before they take effect; if you disagree, you may cancel before they apply. Other changes are posted here, with the date at the top updated.",
      ],
    },
    ja: {
      h: "7. 責任の制限と変更",
      p: [
        "法律が許す最大の範囲において、本サイトの利用や読み解きへの依拠から生じる間接的、付随的、結果的な損失について当方は責任を負いません。当方の責任の総額は、当該の読み解きに対してあなたが実際に支払った金額を超えません。",
        "本規約は更新されることがあります。重要な変更は、効力発生の少なくとも 14 日前にメールで会員に通知します。同意できない場合は、変更が適用される前に解約できます。その他の変更は本ページに掲載し、ページ上部の日付を更新します。",
      ],
    },
    ko: {
      h: "7. 책임 제한과 변경",
      p: [
        "법이 허용하는 최대 범위에서, 이 사이트의 이용이나 풀이에 대한 의존으로 발생한 간접적·부수적·결과적 손실에 대해 저희는 책임지지 않으며, 저희의 총 책임은 해당 풀이에 대해 당신이 실제로 지불한 금액을 넘지 않습니다.",
        "이 약관은 갱신될 수 있습니다. 중대한 변경은 효력 발생 최소 14일 전에 이메일로 멤버에게 알립니다. 동의하지 않으면 변경이 적용되기 전에 해지할 수 있습니다. 그 밖의 변경은 이 페이지에 게시하고 상단의 날짜를 갱신합니다.",
      ],
    },
    fr: {
      h: "7. Responsabilité et modifications",
      p: [
        "Dans toute la mesure permise par la loi, nous ne sommes pas responsables des pertes indirectes, accessoires ou consécutives découlant de l'utilisation du site ou de la confiance accordée à une lecture, et notre responsabilité totale ne dépassera pas ce que vous avez réellement payé pour la lecture en question.",
        "Ces conditions peuvent être mises à jour. Les modifications importantes sont annoncées aux abonnés par e-mail au moins 14 jours avant leur entrée en vigueur ; si vous n'êtes pas d'accord, vous pouvez résilier avant qu'elles s'appliquent. Les autres modifications sont publiées ici, avec la date en haut de page mise à jour.",
      ],
    },
    de: {
      h: "7. Haftung und Änderungen",
      p: [
        "Soweit gesetzlich zulässig, haften wir nicht für mittelbare, zufällige oder Folgeschäden aus der Nutzung der Seite oder dem Vertrauen auf eine Deutung; unsere Gesamthaftung übersteigt nicht den Betrag, den du für die betreffende Deutung tatsächlich bezahlt hast.",
        "Diese Bedingungen können aktualisiert werden. Wesentliche Änderungen kündigen wir Mitgliedern mindestens 14 Tage vor ihrem Inkrafttreten per E-Mail an; wenn du nicht einverstanden bist, kannst du vorher kündigen. Sonstige Änderungen werden hier veröffentlicht, mit aktualisiertem Datum oben.",
      ],
    },
    es: {
      h: "7. Responsabilidad y cambios",
      p: [
        "En la máxima medida permitida por la ley, no respondemos de pérdidas indirectas, incidentales o consecuentes derivadas del uso del sitio o de confiar en una lectura, y nuestra responsabilidad total no superará lo que realmente pagaste por la lectura en cuestión.",
        "Estos términos pueden actualizarse. Los cambios sustanciales se comunican a los miembros por correo al menos 14 días antes de que entren en vigor; si no estás de acuerdo, puedes cancelar antes de que se apliquen. Los demás cambios se publican aquí, actualizando la fecha del encabezado.",
      ],
    },
    pt: {
      h: "7. Responsabilidade e alterações",
      p: [
        "Na máxima medida permitida por lei, não respondemos por perdas indiretas, incidentais ou consequenciais decorrentes do uso do site ou da confiança em uma leitura, e nossa responsabilidade total não excederá o valor que você efetivamente pagou pela leitura em questão.",
        "Estes termos podem ser atualizados. Alterações relevantes são comunicadas aos assinantes por e-mail com pelo menos 14 dias de antecedência; se você não concordar, pode cancelar antes que passem a valer. As demais alterações são publicadas aqui, com a data no topo atualizada.",
      ],
    },
  },
  {
    zh: {
      h: "8. 经营者与联系",
      p: [
        "YaoFlow 由 Linedo LLC 经营，地址：312 W 2nd St, Unit A919, Casper, Wyoming 82601, USA。本条款是你与 Linedo LLC 之间的协议。",
        "任何问题请写信至 support@yaoflow.com。",
      ],
    },
    en: {
      h: "8. Who we are",
      p: [
        "YaoFlow is operated by Linedo LLC, 312 W 2nd St, Unit A919, Casper, Wyoming 82601, USA. These terms are an agreement between you and Linedo LLC.",
        "For any question, write to support@yaoflow.com.",
      ],
    },
    ja: {
      h: "8. 運営者とお問い合わせ",
      p: [
        "YaoFlow は Linedo LLC（所在地：312 W 2nd St, Unit A919, Casper, Wyoming 82601, USA）が運営しています。本規約はあなたと Linedo LLC との間の契約です。",
        "ご質問は support@yaoflow.com までお寄せください。",
      ],
    },
    ko: {
      h: "8. 운영자와 문의",
      p: [
        "YaoFlow는 Linedo LLC(주소: 312 W 2nd St, Unit A919, Casper, Wyoming 82601, USA)가 운영합니다. 본 약관은 귀하와 Linedo LLC 사이의 계약입니다.",
        "문의는 support@yaoflow.com으로 보내 주세요.",
      ],
    },
    fr: {
      h: "8. Qui sommes-nous",
      p: [
        "YaoFlow est exploité par Linedo LLC, 312 W 2nd St, Unit A919, Casper, Wyoming 82601, USA. Les présentes conditions constituent un contrat entre vous et Linedo LLC.",
        "Pour toute question, écrivez à support@yaoflow.com.",
      ],
    },
    de: {
      h: "8. Anbieter und Kontakt",
      p: [
        "YaoFlow wird betrieben von Linedo LLC, 312 W 2nd St, Unit A919, Casper, Wyoming 82601, USA. Diese Bedingungen sind ein Vertrag zwischen dir und Linedo LLC.",
        "Bei Fragen schreib an support@yaoflow.com.",
      ],
    },
    es: {
      h: "8. Quiénes somos",
      p: [
        "YaoFlow es operado por Linedo LLC, 312 W 2nd St, Unit A919, Casper, Wyoming 82601, USA. Estos términos son un acuerdo entre tú y Linedo LLC.",
        "Para cualquier pregunta, escribe a support@yaoflow.com.",
      ],
    },
    pt: {
      h: "8. Quem somos",
      p: [
        "O YaoFlow é operado por Linedo LLC, 312 W 2nd St, Unit A919, Casper, Wyoming 82601, USA. Estes termos são um acordo entre você e a Linedo LLC.",
        "Para qualquer dúvida, escreva para support@yaoflow.com.",
      ],
    },
  },
];

export const PRIVACY: LegalSection[] = [
  {
    zh: {
      h: "1. 账号很轻，也不投广告",
      p: [
        "YaoFlow 的账号只是一个邮箱：登录靠邮件里的一次性链接，没有密码。登录后浏览器里会有一个会话 Cookie（只用来认出你，不用于追踪，180 天有效，退出即清除）和一个只表示「已登录」的标记 Cookie（yf_in）；如果你手动切换过界面语言或货币，还会有只记这两项偏好的 Cookie（一年）；买过一次深断后有一个只用来记住「首次优惠已用」的标记 Cookie；用过新人免费轻解读后有一个只记住「已用过」的标记 Cookie（yf_il，一年）。没登录就付款时，会有一个只在付款后把这台浏览器登录到新账号用的 Cookie（yf_pl，3 小时，用过即清除）；这样登录的会话 30 天有效。在这台浏览器付过款、领过解读或登录过之后，会有一个只写着「这是哪位客户」的标记 Cookie（yf_who，180 天，有签名防伪造），只给我们自己的后台实时面板认出回来的老客户用：它不会让你登录，也不会让任何人看到你的卦。从活动链接进站时，会有一个只记住那个优惠码的 Cookie（yf_promo，7 天），结账时用来折抵。站内不放广告，也不做再营销。我们在 Google 上投放搜索广告：从广告点进来时，会有一个只记广告点击编号的 Cookie（yf_gc，90 天）；之后如果付款，我们只把这个点击编号、付款时间和金额告诉 Google Ads，用来知道哪条广告带来了购买——从不发你的邮箱、问题或生辰；欧洲经济区、英国、瑞士的访客不写入这个 Cookie。网站统计主要是自建的（数据不出我们的服务器）；另外用 Google Analytics 4 统计来访量和来源（Cookie _ga，约 14 个月；只发页面路径与按钮名称，从不发你的问题、邮箱或生辰；广告功能全部关闭；欧洲经济区、英国、瑞士的访客默认不写入这个 Cookie）。",
        "付费之后我们会保存你的解读（见第 4 节），这样你才能凭链接回看；但我们不会为了广告投放去分析你写下的问题。",
      ],
    },
    en: {
      h: "1. A light account, no advertising",
      p: [
        "A YaoFlow account is just an email address: you sign in with a one-time link from your inbox, and there is no password. Once signed in, your browser holds a session cookie (used only to recognize you, never for tracking; valid 180 days, cleared when you sign out) and a marker cookie that only says you are signed in (yf_in); if you switch the interface language or currency by hand, cookies remember only those two choices (one year); after your first full reading a marker cookie only records that the first-time price has been used; after you use the newcomer's free light reading, a marker cookie only records that it has been used (yf_il, one year). If you pay without being signed in, a cookie used only to sign this browser in to the new account after payment is set (yf_pl, 3 hours, cleared once used); a session started this way lasts 30 days. After you pay, claim a reading or sign in on a browser, a marker cookie records only which customer that browser belongs to (yf_who, 180 days, signed against forgery); it is used only so our own staff live board can recognize a returning customer — it never signs you in and shows your casts to no one. If you arrive through a campaign link, a cookie remembers only its promo code (yf_promo, 7 days) so the discount is applied at checkout. There are no ads on the site and no remarketing. We do run search ads on Google: if you arrive through one, a cookie keeps only the ad's click ID (yf_gc, 90 days); if you later pay, we tell Google Ads only that click ID, the time and the amount, so we know which ad led to a purchase — never your email, question or birth details. Visitors in the EEA, the UK and Switzerland get no such cookie. Our site analytics is mostly self-hosted (that data never leaves our server); we also use Google Analytics 4 to count visits and where they come from (cookie _ga, about 14 months; it receives page paths and button names only — never your question, email or birth details; all advertising features are off; visitors in the EEA, the UK and Switzerland get no _ga cookie by default).",
        "After a purchase we do keep your reading (see §4) so you can return to it via your link, but we do not mine your questions for ad targeting.",
      ],
    },
    ja: {
      h: "1. 軽いアカウント、広告なし",
      p: [
        "YaoFlow のアカウントはメールアドレスひとつです。ログインは受信箱に届く一回限りのリンクで行い、パスワードはありません。ログインするとブラウザにセッション Cookie が保存されます（あなたを識別するためだけに使い、追跡には使いません。有効期間 180 日、ログアウトで消去されます）。あわせて、「ログイン済み」であることだけを示すマーカー Cookie（yf_in）も置かれます。表示言語や通貨を手動で切り替えた場合は、その二つの設定だけを記憶する Cookie（一年）が保存されます。初めての本格鑑定の後は、「初回価格は使用済み」と記録するだけのマーカー Cookie が置かれます。新規の方向けの無料ライト鑑定を使った後は、「使用済み」と記録するだけのマーカー Cookie（yf_il、一年）が置かれます。ログインせずに支払った場合は、支払い後にこのブラウザを新しいアカウントにログインさせるためだけの Cookie（yf_pl、3 時間、使用後に消去）が置かれます。この方法で始まったセッションの有効期間は 30 日です。このブラウザでお支払い・解読の受け取り・ログインのいずれかをすると、「どのお客様のブラウザか」だけを記す標記 Cookie（yf_who、180 日、改ざん防止の署名付き）が保存されます。運営者用のリアルタイム画面で再訪したお客様を見分けるためだけに使い、これでログインされることはなく、あなたの卦が誰かに見えることもありません。キャンペーンのリンクから来た場合は、その割引コードだけを記す Cookie（yf_promo、7 日）が保存され、お支払い時の割引に使われます。サイト内に広告は掲載せず、リマーケティングも行いません。Google で検索広告を出しており、広告から来た場合は広告のクリック ID だけを記す Cookie（yf_gc、90 日）が保存されます。その後お支払いがあった場合、Google 広告に伝えるのはそのクリック ID、支払い日時と金額だけで、どの広告が購入につながったかを知るために使います。メールアドレス、問い、生年月日は送りません。EEA・英国・スイスからの訪問者にはこの Cookie を保存しません。サイトの統計は主に自前で運用しており（そのデータは当方のサーバーの外に出ません）、加えて訪問数と流入元を知るために Google Analytics 4 を使っています（Cookie _ga、約 14 か月。送るのはページのパスとボタン名だけで、あなたの問い、メールアドレス、生年月日は送りません。広告機能はすべて無効。EEA・英国・スイスからの訪問者には既定で _ga Cookie を保存しません）。",
        "購入後は読み解きを保存します（第 4 条参照）。リンクから読み返せるようにするためで、広告配信のためにあなたの問いを分析することはありません。",
      ],
    },
    ko: {
      h: "1. 가벼운 계정, 광고 없음",
      p: [
        "YaoFlow 계정은 이메일 주소 하나뿐입니다. 로그인은 받은편지함의 일회성 링크로 하며 비밀번호는 없습니다. 로그인하면 브라우저에 세션 쿠키가 저장됩니다(당신을 알아보는 데만 쓰이고 추적에는 쓰이지 않으며, 180일 유효, 로그아웃 시 삭제). 또한 ‘로그인됨’만 나타내는 표시 쿠키(yf_in)도 있습니다. 인터페이스 언어나 통화를 직접 바꾼 경우 그 두 가지 선택만 기억하는 쿠키(1년)가 저장됩니다. 첫 심층 풀이 후에는 ‘첫 구매 가격 사용됨’만 기록하는 표시 쿠키가 있습니다. 신규 방문자용 무료 간단 풀이를 사용한 뒤에는 ‘사용됨’만 기록하는 표시 쿠키(yf_il, 1년)가 있습니다. 로그인하지 않고 결제하면, 결제 후 이 브라우저를 새 계정에 로그인시키는 데만 쓰는 쿠키(yf_pl, 3시간, 사용 후 삭제)가 저장됩니다. 이렇게 시작된 세션은 30일 동안 유효합니다. 이 브라우저에서 결제하거나 풀이를 받거나 로그인하면, ‘어느 고객의 브라우저인지’만 적힌 표시 쿠키(yf_who, 180일, 위조 방지 서명)가 남습니다. 운영자용 실시간 화면에서 다시 찾아온 고객을 알아보는 데만 쓰이며, 이것으로 로그인되지 않고 누구에게도 당신의 괘를 보여 주지 않습니다. 캠페인 링크로 들어오면 그 할인 코드만 기억하는 쿠키(yf_promo, 7일)가 저장되어 결제할 때 할인에 쓰입니다. 사이트 안에 광고를 싣지 않고 리마케팅도 하지 않습니다. Google에 검색 광고를 내고 있어, 광고를 통해 들어오면 광고 클릭 ID만 기억하는 쿠키(yf_gc, 90일)가 저장됩니다. 이후 결제하면 그 클릭 ID와 결제 시각, 금액만 Google Ads에 알려 어떤 광고가 구매로 이어졌는지 확인합니다. 이메일, 질문, 생년월일은 보내지 않습니다. EEA·영국·스위스 방문자에게는 이 쿠키를 저장하지 않습니다. 사이트 통계는 주로 자체 운영하며(그 데이터는 저희 서버 밖으로 나가지 않습니다), 방문 수와 유입 경로를 알기 위해 Google Analytics 4도 사용합니다(쿠키 _ga, 약 14개월. 페이지 경로와 버튼 이름만 보내며 질문, 이메일, 생년월일은 보내지 않습니다. 광고 기능은 모두 꺼져 있고, EEA·영국·스위스 방문자에게는 기본적으로 _ga 쿠키를 저장하지 않습니다).",
        "구매 후에는 풀이를 보관합니다(제4조 참조). 링크로 다시 볼 수 있게 하기 위한 것이며, 광고 타기팅을 위해 당신의 질문을 분석하지 않습니다.",
      ],
    },
    fr: {
      h: "1. Un compte léger, sans publicité",
      p: [
        "Un compte YaoFlow n'est qu'une adresse e-mail\u00a0: vous vous connectez avec un lien à usage unique reçu dans votre boîte, sans mot de passe. Une fois connecté, votre navigateur conserve un cookie de session (utilisé seulement pour vous reconnaître, jamais pour vous suivre\u202f; valable 180 jours, effacé à la déconnexion), ainsi qu'un cookie marqueur qui indique seulement que vous êtes connecté (yf_in)\u202f; si vous changez manuellement la langue ou la devise, des cookies ne retiennent que ces deux choix (un an)\u202f; après votre première lecture approfondie, un cookie marqueur note seulement que le prix de première fois a été utilisé ; après avoir utilisé la lecture express gratuite offerte aux nouveaux venus, un cookie marqueur note seulement qu'elle a été utilisée (yf_il, un an). Si vous payez sans être connecté, un cookie sert uniquement à connecter ce navigateur au nouveau compte après le paiement (yf_pl, 3 heures, effacé une fois utilisé)\u202f; une session ouverte ainsi dure 30 jours. Après un paiement, une lecture reçue ou une connexion sur un navigateur, un cookie marqueur n'y note que le client auquel ce navigateur appartient (yf_who, 180 jours, signé contre la falsification)\u202f; il sert seulement à notre tableau interne en temps réel pour reconnaître un client qui revient — il ne vous connecte jamais et ne montre vos tirages à personne. Si vous arrivez par un lien de campagne, un cookie retient seulement son code promo (yf_promo, 7 jours) pour appliquer la remise au paiement. Aucune publicité sur le site et aucun reciblage. Nous diffusons des annonces sur la recherche Google\u00a0: si vous arrivez par l'une d'elles, un cookie ne retient que l'identifiant de clic de l'annonce (yf_gc, 90 jours)\u202f; si vous payez ensuite, nous ne transmettons à Google Ads que cet identifiant, l'heure et le montant, pour savoir quelle annonce a mené à un achat — jamais votre e-mail, votre question ni vos données de naissance. Aucun cookie de ce type pour les visiteurs de l’EEE, du Royaume-Uni et de Suisse. Nos statistiques de site sont surtout auto-hébergées (ces données ne quittent pas notre serveur)\u202f; nous utilisons aussi Google Analytics 4 pour compter les visites et leur provenance (cookie _ga, environ 14 mois\u202f; il ne reçoit que les chemins de page et les noms de boutons — jamais votre question, votre e-mail ni vos données de naissance\u202f; toutes les fonctions publicitaires sont désactivées\u202f; aucun cookie _ga par défaut pour les visiteurs de l’EEE, du Royaume-Uni et de Suisse).",
        "Après un achat, nous conservons votre lecture (voir §4) pour que vous puissiez y revenir par votre lien, mais nous n'exploitons pas vos questions pour du ciblage publicitaire.",
      ],
    },
    de: {
      h: "1. Ein leichtes Konto, keine Werbung",
      p: [
        "Ein YaoFlow-Konto ist nur eine E-Mail-Adresse: Du meldest dich mit einem Einmal-Link aus deinem Postfach an, ein Passwort gibt es nicht. Nach der Anmeldung hält dein Browser ein Sitzungs-Cookie (nur um dich wiederzuerkennen, nie zum Tracking; 180 Tage gültig, beim Abmelden gelöscht) sowie ein Markierungs-Cookie, das nur besagt, dass du angemeldet bist (yf_in); wenn du Sprache oder Währung von Hand umstellst, merken sich Cookies nur diese zwei Entscheidungen (ein Jahr); nach deiner ersten Tiefendeutung hält ein Markierungs-Cookie nur fest, dass der Erstpreis genutzt wurde; nachdem du die kostenlose Kurzdeutung für Neulinge genutzt hast, hält ein Markierungs-Cookie nur fest, dass sie genutzt wurde (yf_il, ein Jahr). Bezahlst du, ohne angemeldet zu sein, setzen wir ein Cookie, das nur dazu dient, diesen Browser nach der Zahlung beim neuen Konto anzumelden (yf_pl, 3 Stunden, nach Gebrauch gelöscht); eine so begonnene Sitzung gilt 30 Tage. Nachdem du in einem Browser bezahlt, eine Deutung erhalten oder dich angemeldet hast, hält ein Markierungs-Cookie nur fest, welchem Kunden dieser Browser gehört (yf_who, 180 Tage, gegen Fälschung signiert); es dient nur unserer internen Live-Ansicht, um wiederkehrende Kunden zu erkennen — es meldet dich nie an und zeigt niemandem deine Würfe. Kommst du über einen Aktionslink, merkt sich ein Cookie nur dessen Rabattcode (yf_promo, 7 Tage), damit der Rabatt beim Bezahlen abgezogen wird. Auf der Website gibt es keine Werbung und kein Remarketing. Wir schalten Suchanzeigen bei Google: Kommst du über eine davon, merkt sich ein Cookie nur die Klick-ID der Anzeige (yf_gc, 90 Tage); bezahlst du später, übermitteln wir Google Ads nur diese Klick-ID, den Zeitpunkt und den Betrag, um zu sehen, welche Anzeige zu einem Kauf geführt hat — nie deine E-Mail, deine Frage oder deine Geburtsdaten. Besucher aus dem EWR, dem Vereinigten Königreich und der Schweiz erhalten dieses Cookie nicht. Unsere Seitenstatistik läuft überwiegend auf eigenen Servern (diese Daten verlassen sie nicht); zusätzlich nutzen wir Google Analytics 4, um Besuche und ihre Herkunft zu zählen (Cookie _ga, etwa 14 Monate; übermittelt werden nur Seitenpfade und Schaltflächennamen — nie deine Frage, deine E-Mail oder deine Geburtsdaten; alle Werbefunktionen sind aus; Besucher aus dem EWR, dem Vereinigten Königreich und der Schweiz erhalten standardmäßig kein _ga-Cookie).",
        "Nach einem Kauf bewahren wir deine Deutung auf (siehe §4), damit du über deinen Link zu ihr zurückkehren kannst; deine Fragen werten wir aber nicht für Werbezwecke aus.",
      ],
    },
    es: {
      h: "1. Una cuenta ligera, sin publicidad",
      p: [
        "Una cuenta de YaoFlow es solo una dirección de correo: inicias sesión con un enlace de un solo uso que llega a tu bandeja, y no hay contraseña. Una vez dentro, tu navegador guarda una cookie de sesión (solo para reconocerte, nunca para rastrearte; válida 180 días, se borra al cerrar sesión) y una cookie marcadora que solo indica que has iniciado sesión (yf_in); si cambias a mano el idioma o la moneda, unas cookies recuerdan solo esas dos elecciones (un año); tras tu primera lectura completa, una cookie marcadora solo registra que el precio de primera vez ya se usó; tras usar la lectura breve gratuita para recién llegados, una cookie marcadora solo registra que ya se usó (yf_il, un año). Si pagas sin haber iniciado sesión, se guarda una cookie que solo sirve para iniciar sesión en la cuenta nueva desde este navegador después del pago (yf_pl, 3 horas, se borra al usarse); una sesión iniciada así dura 30 días. Después de pagar, recibir una lectura o iniciar sesión en un navegador, una cookie marcador guarda solo a qué cliente pertenece ese navegador (yf_who, 180 días, firmada contra falsificaciones); solo la usa nuestro panel interno en tiempo real para reconocer a un cliente que vuelve: nunca inicia tu sesión ni muestra tus tiradas a nadie. Si llegas por un enlace de campaña, una cookie recuerda solo su código promocional (yf_promo, 7 días) para aplicar el descuento al pagar. No hay publicidad en el sitio ni remarketing. Publicamos anuncios en la búsqueda de Google: si llegas por uno, una cookie guarda solo el identificador de clic del anuncio (yf_gc, 90 días); si después pagas, solo comunicamos a Google Ads ese identificador, la hora y el importe, para saber qué anuncio llevó a una compra, nunca tu correo, tu pregunta ni tus datos de nacimiento. A los visitantes del EEE, el Reino Unido y Suiza no se les guarda esta cookie. Nuestras estadísticas están alojadas sobre todo en nuestro propio servidor (esos datos no salen de él); además usamos Google Analytics 4 para contar visitas y su procedencia (cookie _ga, unos 14 meses; solo recibe rutas de página y nombres de botones, nunca tu pregunta, tu correo ni tus datos de nacimiento; todas las funciones publicitarias están desactivadas; a los visitantes del EEE, el Reino Unido y Suiza no se les guarda la cookie _ga por defecto).",
        "Tras una compra sí guardamos tu lectura (ver §4) para que puedas volver a ella con tu enlace, pero no explotamos tus preguntas para segmentar publicidad.",
      ],
    },
    pt: {
      h: "1. Uma conta simples, sem publicidade",
      p: [
        "Uma conta YaoFlow é apenas um endereço de e-mail: você entra com um link de uso único recebido na sua caixa de entrada, e não há senha. Depois de entrar, seu navegador guarda um cookie de sessão (usado apenas para reconhecer você, nunca para rastreamento; válido por 180 dias, apagado ao sair da conta) e um cookie marcador que indica apenas que você está conectado (yf_in); se você mudar manualmente o idioma ou a moeda, cookies guardam apenas essas duas escolhas (por um ano); após a sua primeira leitura completa, um cookie marcador registra apenas que o preço de primeira compra já foi usado; depois de usar a leitura breve gratuita para novatos, um cookie marcador registra apenas que ela já foi usada (yf_il, um ano). Se você pagar sem estar conectado, é gravado um cookie que serve apenas para conectar este navegador à nova conta depois do pagamento (yf_pl, 3 horas, apagado depois de usado); uma sessão iniciada assim vale por 30 dias. Depois de pagar, receber uma leitura ou entrar num navegador, um cookie marcador guarda apenas a qual cliente esse navegador pertence (yf_who, 180 dias, assinado contra falsificação); ele serve só para o nosso painel interno em tempo real reconhecer um cliente que volta — nunca faz você entrar na conta e não mostra suas tiragens a ninguém. Se você chegar por um link de campanha, um cookie guarda só o código promocional dele (yf_promo, 7 dias) para aplicar o desconto no pagamento. Não há publicidade no site nem remarketing. Fazemos anúncios na pesquisa do Google: se você chegar por um deles, um cookie guarda apenas o identificador de clique do anúncio (yf_gc, 90 dias); se depois você pagar, informamos ao Google Ads apenas esse identificador, a hora e o valor, para saber qual anúncio levou a uma compra — nunca o seu e-mail, a sua pergunta ou os seus dados de nascimento. Visitantes do EEE, do Reino Unido e da Suíça não recebem esse cookie. Nossas estatísticas de acesso ficam sobretudo no nosso próprio servidor (esses dados não saem dele); além disso usamos o Google Analytics 4 para contar visitas e de onde vêm (cookie _ga, cerca de 14 meses; recebe apenas caminhos de página e nomes de botões — nunca a sua pergunta, o seu e-mail ou os seus dados de nascimento; todas as funções de publicidade estão desligadas; visitantes do EEE, do Reino Unido e da Suíça não recebem o cookie _ga por padrão).",
        "Depois de uma compra, guardamos a sua leitura (ver §4) para que você possa voltar a ela pelo link, mas não exploramos as suas perguntas para segmentação de anúncios.",
      ],
    },
  },
  {
    zh: {
      h: "2. 我们处理哪些数据",
      p: [
        "**你提交的问题与卦象**：用来写免费的那一句和解读。每一卦都会进入下面说的起卦记录；付费解读的问题、爻值与解读结果，另随该次支付记录保存，以便你凭链接重复访问。",
        "**起卦记录**：每一卦成卦时，不论有没有登录、有没有付款，我们都会在服务器上保存：你的问题、六个爻值与卦象、起卦的时间与时区、语言、你看到的免费那一句、我们对那一句偏吉还是偏凶的判断、你用的是手机还是电脑和在哪个 App 里打开（例如 Threads），以及这台浏览器的随机编号（yf_bid，见下）和当时的标签页编号。用途有两个：一是把你就同一件事起的几卦连起来（由 AI 判断是不是同一件事），让之后的免费那一句、付款前给你看的那段说明（可能由 AI 读你这件事的前几卦专门写给你）和你买的解读，都能把前几卦一起考虑进去；二是改进付款前显示的说明文字和免费那一句的写法——我们比较看到不同说明的人之后有没有购买（也按问题类别、来源、设备等分组比较）；每周还会让 AI 逐条读一遍最近两周的起卦记录（问题、免费那一句、看到的说明、之后有没有购买），找出大家在哪一步、为什么没有买，再起草新的说明。给 AI 读的记录只用代号，不含邮箱、账号或浏览器编号。这台浏览器归到你账号下之后（付款、领取解读、用会员额度或登录），它的起卦记录也和你的账号连在一起。与健康医疗、性生活或犯罪前科有关的问题，我们只记类别、卦象和时间，不保存原文和免费那一句。起卦记录保存 365 天后自动删除；删除账号时，归到你名下的浏览器的起卦记录一并删除；没有账号的，写信告诉我们起卦的大概时间和问题，我们会删除。我们的工作人员可以在后台查看起卦记录，用于客服与改进服务。",
        "**支付信息**：由 Stripe 处理。我们不接触、不存储你的银行卡信息。Stripe 会收集你的邮箱与支付方式信息，适用其自身隐私政策。开通会员后，我们保存 Stripe 的客户与订阅编号、订阅状态和周期，以及每次会员解读的记录，用来判断权益和显示剩余次数。为了在付款后生成解读，你的问题与卦象会临时附在 Stripe 的结账会话上（适用 Stripe 自身的隐私政策）。",
        "**订单归因信息**：随每笔订单，我们还会保存你设备的时区名称、网络边缘节点看到的国家、Stripe 报告的银行卡所属国家，以及带你来到本站的分享码、推广标签与浏览器会话编号。这些只用于核对货币与归因，不用于其他目的。",
        "**首次付费保证的「每人一次」**：判断是不是同一个人时，我们会把这一单的账号、邮箱、浏览器编号，以及 Stripe 为这次付款给出的支付方式识别码（由 Stripe 生成，用来分辨是不是同一张卡、同一个钱包或同一个支付宝账号，无法还原成卡号）与过去的订单比对。只用于决定能不能一键退款，不用于拒绝购买或其他用途。",
        "**账号数据**：你的邮箱、登录链接的哈希值（链接本身不保存）、会话记录，以及登录状态下起的卦与解读（归档到你的账号，方便回看）。付款购买解读时，如果这个邮箱还没有账号，付款的那个浏览器会直接登录这个新账号，有效 30 天（只凭解读链接不会登录任何人；之后用邮件链接登录时，用这种方式在其他浏览器上的登录会被结束）。登录状态下，我们自己的后台能看到你的账号此刻在网站上、在哪个页面；这些只存在内存里，最多 30 分钟，不写进任何记录。没登录时，如果这个浏览器带着上面说的 yf_who 标记，这个后台也会显示是哪位客户、在哪个页面，同样只在内存里。后台还会显示浏览器自己报出的设备型号与系统版本（例如在 Threads 里打开时的 iPhone 型号）；这一项另按下面「服务器日志与来访网络信息」保存。登录也可以用登录邮件里的 6 位登录码（与链接一样 15 分钟内有效、只能用一次），我们只保存它的哈希值。",
        "**分享与合参**：分享链接和分享卡只带卦象，不带你的问题。当你邀请另一个人就同一件事起卦（同题合参）时，对方能看到的只有你写给对方的公开题目、你的卦象与卦名，以及同一段合参；你的原问题、解读全文和邮箱不会给对方看，反之亦然。合参记录（两份卦象的关联与合参文字）随两份解读一同保存，任一方都可以随时解除；解除后合参页对双方失效，各自的解读保留。",
        "**「一事一占」记录**：为提醒你不要重复占问，最近的问题与卦名也会保存在你自己浏览器的 localStorage 中，提醒就在你的浏览器里完成。清除浏览器数据会删除这一份，但不会删除服务器上的起卦记录（见上）。",
        "**来访日期与进展记录**：为了知道有多少人会隔天再回来，你的浏览器会在 localStorage 里记下你第一次和上一次来访的日期与来过几天；每天第一次打开网站时，这两个日期会随统计发给我们。浏览器里还有一个随机编号的 Cookie（yf_bid，约一年），我们用它把这台浏览器在本站的动作串起来：哪天来、从哪个网站或推广标签来、看了哪些页面、停留多久、滚动多深、点了哪些具名按钮、起了几卦——这些统计本身不带问题文本（问题在上面说的起卦记录里）。你在这台浏览器付款、领取解读、用会员额度或登录后，这些记录会归到你的账号下，用来了解读者怎样使用和购买；删除账号时这层对应一并删除。清除浏览器数据会删掉这些日期，并换一个新编号。你在解读页「记一笔进展」写下的文字，随那份解读一起保存，用来在同一卦里回应你。",
        "**服务器日志与来访网络信息**：服务器日志包含 IP 与请求时间。此外，每次来访我们会把这台浏览器（上面说的 yf_bid 编号）的 IP、网络边缘服务商 Cloudflare 据 IP 判定的国家／地区、城市与时区、浏览器与系统、设备型号、在哪个 App 里打开（例如 Threads、LINE）和浏览器语言保存在我们的服务器上。用途：防止滥用、客服核对（例如认出同一个人换了浏览器或 App）、了解读者从哪里来、用什么设备，以决定在哪里介绍我们的服务。这些数据只在我们自己的后台使用，不提供给任何广告平台。IP 保存 180 天后删除，只留城市与设备；删除账号时，归到你名下的浏览器的这些记录一并删除。",
        "**生辰资料**：八字、紫微、星盘、合盘与年书需要出生资料（公历或农历的日期、几点几分或时辰、出生地、性别，以及你给这份档案的称呼和它是谁的）。这些先存在你自己的浏览器里（最多 10 份；排盘页直接读它，不经网址）。登录后，同一份清单也会存在你的账号里（最多 10 份），换一台设备登录就不必重填；你可以在账号页「生辰档案」分页一键删除其中一份或全部，删除账号时一并删除。免费的排盘在你的浏览器里算；购买深度报告、年书或合盘时，我们会和付费解读一样保存由生辰算出的盘面、报告全文、订单信息与结账邮箱。",
        "**合盘的另一个人**：你为另一个人填生辰，须先取得对方同意。改用邀请链接时，对方自己填生辰；生辰只放在链接的 # 片段里、不会以网址形式发到我们的服务器，服务器只在该链接的编号下保存由生辰算出的盘面，30 天后删除。合盘报告保存两份盘面与订单信息；除报告本身写出的内容外，任一方都看不到另一方填写的原始生辰。",
        "**命盘问答**：你对自己盘面提的问题，连同这张盘的要点（不含你的称呼与原始生辰）一起发到第 3 节所述的模型处理；问题与回答和付费解读一样保存在你的账号下（未登录时记在这个浏览器的编号下），删除账号时一并删除。",
        "**正缘画像**：八字深度报告里的插图，是依盘面的五行与宫位关系，由 SiliconFlow（中国大陆）的图像接口生成的一位虚构成年人的画像；发出的只有这几个盘面要点的文字描述，不含你的称呼、生辰、照片或任何真人的样貌。画像和报告一起保存。",
      ],
    },
    en: {
      h: "2. What we process",
      p: [
        "**Your question and cast**: used to write the free line and the reading. Every cast goes into the cast log described below; for paid readings, the question, line values, and resulting text are also retained with that payment record so you can revisit the reading via your link.",
        "**Cast log**: whenever a cast is completed, whether or not you are signed in or have paid, we keep on our server: your question, the six line values and the figure, the time and time zone of the cast, its language, the free line you saw, our reading of whether that line leans good or bad, whether you are on a phone or a computer and which app you opened the site in (Threads, for example), and this browser's random number (yf_bid, see below) with the tab's id. It serves two purposes. First, to join up the casts you make about the same matter (an AI decides whether two questions are the same matter), so that later free lines, the note shown to you before the price (which an AI may write for you from your earlier casts on the matter) and any reading you buy can take the earlier casts into account. Second, to improve the words shown before the price and the way the free line is written: we compare whether people who saw different wordings went on to buy (also by kind of question, source, device and the like), and once a week an AI reads the last two weeks of the cast log entry by entry (questions, free lines, the wording each person saw and whether they bought) to find at which step and why people did not buy, and drafts new wording. What the AI reads is under codes, without email addresses, accounts or browser numbers. Once this browser is filed under your account (you pay, claim a reading, use a membership allowance or sign in), its cast log is linked to your account too. For questions about health or medical matters, sex life or criminal records, we keep only the category, the figure and the time — never the words or the free line. The cast log is deleted automatically after 365 days; deleting your account deletes the cast log of every browser filed under you; without an account, write to us with roughly when you cast and what you asked, and we will delete it. Our staff can view the cast log in our admin pages, for support and to improve the service.",
        "**Payment information**: handled by Stripe. We never see or store your card details. Stripe collects your email and payment method under its own privacy policy. With a membership we keep Stripe's customer and subscription identifiers, the subscription status and period, and a record of each reading it covered — to decide entitlement and show what remains. To generate the reading after payment, your question and cast are temporarily attached to the Stripe checkout session (Stripe's own privacy policy applies).",
        "**Order attribution**: with each order we also keep your device's time-zone name, the country seen at our network edge, the card's country as reported by Stripe, and the share code, campaign tag, and browser session id that brought you here. These are used only to reconcile currency and attribution, and for nothing else.",
        "**“Once per person” for the first-purchase guarantee**: to tell whether it is the same person, we compare the order's account, email address and browser id, and the payment-method identifier Stripe gives for this payment (generated by Stripe to recognise the same card, wallet or Alipay account; it cannot be turned back into a card number), with earlier orders. It is used only to decide whether the one-tap refund applies — never to refuse a purchase, and for nothing else.",
        "**Account data**: your email address, a hash of each sign-in link (never the link itself), your sessions, and the casts and readings you make while signed in (filed under your account so you can return to them). When you pay for a reading with an address that has no account yet, the browser you paid in is signed in to that new account for 30 days (a reading link on its own never signs anyone in; signing in later with an email link ends sign-ins made this way on other browsers). While you are signed in, our own staff page can see that your account is on the site right now and which page it is on; this is held in memory for at most 30 minutes and never written down. When you are not signed in but the browser carries the yf_who marker described above, that page also shows which customer it is and which page they are on — again in memory only. It also shows the device model and system version your browser reports itself (for example the iPhone model when you open the site inside Threads); that item is also kept as described under “Server logs and visit network details” below. You can also sign in with the 6-digit code in the sign-in email (valid for 15 minutes and once, like the link); we keep only a hash of it.",
        "**Sharing and joint readings**: share links and share cards carry only the figure, never your question. When you invite another person to cast on the same matter (a joint reading), they see only the wording you wrote for them, your figure and its name, and the same joint reading; your original question, your full reading and your email are not shown to them, nor theirs to you. The joint record (the link between the two casts and the joint text) is kept with the two readings, and either side can end it at any time; after that the joint page stops working for both, and each reading stays.",
        "**One-matter-one-cast history**: to remind you not to re-ask the same question, your recent questions and hexagram names are also kept in your own browser's localStorage, where the reminder itself is worked out. Clearing your browser data deletes that copy, but not the cast log on our server (see above).",
        "**Visit dates and progress notes**: to learn how many people come back on a later day, your browser keeps in localStorage the date of your first and your last visit and how many days you have visited; the first time you open the site each day, those two dates are sent with our statistics. Your browser also holds a cookie with a random number (yf_bid, about a year), which we use to join up what this browser does on the site: which days it comes, from which site or campaign tag, which pages it views, how long it stays, how far it scrolls, which named buttons it taps and how many casts it makes — these statistics never carry the text of a question (questions are in the cast log described above). Once you pay, claim a reading, use a membership allowance or sign in on this browser, these records are filed under your account, so we can understand how readers use and buy; deleting your account removes that link. Clearing your browser data deletes the dates and gives the browser a new number. What you write under “Note what happened” on a reading page is kept with that reading, so it can be answered within the same cast.",
        "**Server logs and visit network details**: server logs hold the IP address and request time. In addition, on each visit we store on our server, for this browser (the yf_bid number above), its IP address, the country or region, city and timezone that our network edge provider Cloudflare derives from that address, the browser and system, the device model, the app it was opened in (for example Threads or LINE) and the browser language. We use them to prevent abuse, to help with support (for example to recognize the same person on another browser or app), and to understand where readers come from and what devices they use, so we can decide where to introduce our service. They are used only in our own back office and are never given to any advertising platform. IP addresses are deleted after 180 days, keeping only the city and device; deleting your account deletes these records for the browsers filed under you.",
        "**Birth details**: Bazi, Zi Wei, the natal chart, the pair report and the year book need a birth (a solar or lunar date, the clock time or the Chinese hour, the place, the gender, plus the label you give the profile and whom it is for). These live in your own browser first (up to 10; the chart pages read them there, never through a URL). Signed in, the same list is also kept with your account (up to 10), so another device needs nothing typed again; you can delete any one of them, or all, with one tap on the Birth profiles tab of your account page, and they go when the account is deleted. The free charts are computed in your browser; when you buy a deep report, the year book or the pair report we keep, as with a paid reading, the chart computed from the birth, the report text, the order details and the checkout email.",
        "**The other person in a pair report**: enter someone else's birth only with their consent. With an invite link the other person enters their own birth; it travels only in the link's # fragment, never reaches our server as a URL, and the server keeps only the chart computed from it, under the link's id, for 30 days. The pair report keeps both charts with the order; beyond what the report itself says, neither side sees the raw birth the other entered.",
        "**Chart Q&A**: a question you ask about your own chart is sent, together with that chart's key facts (not your label or raw birth), to the model described in section 3; the question and the answer are kept with your account like a paid reading (under this browser's id when signed out) and go when the account is deleted.",
        "**Partner portrait**: the illustration in the Bazi deep report is a picture of an invented adult, generated by SiliconFlow's image interface (mainland China) from the chart's element and palace relations; what is sent is a short written description of those chart facts only — never your label, birth, a photo or any real person's likeness. The picture is kept with the report.",
      ],
    },
    ja: {
      h: "2. 扱うデータ",
      p: [
        "**あなたの問いと卦**：無料の一言と読み解きの生成に使います。すべての卦は下記の「卦の記録」に入ります。有料の読み解きについては、問い、爻の値、生成された文章を当該の決済記録とともにも保存し、リンクから読み返せるようにします。",
        "**卦の記録**：卦が立ったとき、ログインや支払いの有無にかかわらず、次のものをサーバーに保存します：あなたの問い、六つの爻の値と卦、立卦の時刻とタイムゾーン、言語、表示された無料の一言、その一言が吉寄りか凶寄りかの判定、スマートフォンかパソコンか・どのアプリで開いたか（例：Threads）、このブラウザのランダムな番号（yf_bid、下記参照）とその時のタブの番号。目的は二つです。一つは、同じ件について立てた卦をつなげること（同じ件かどうかは AI が判断します）。これにより、その後の無料の一言、価格の前に表示する説明文（その件で前に立てた卦をもとに AI があなた向けに書くことがあります）、購入した読み解きが、前の卦もあわせて考えられます。もう一つは、価格の前に表示する説明文と無料の一言の書き方の改善です。異なる説明を見た人がその後購入したかを比べ（問いの種類・流入元・端末などのグループ別にも比べます）、週に一度、AI が直近二週間の卦の記録を一件ずつ読み（問い、無料の一言、表示された説明、その後の購入の有無）、どの段階で、なぜ購入に至らなかったかを調べて新しい説明文を起草します。AI が読む記録は符号だけで、メールアドレス・アカウント・ブラウザ番号は含みません。このブラウザがあなたのアカウントに紐づいた後（お支払い・読み解きの受け取り・会員枠の利用・ログイン）は、その卦の記録もアカウントに紐づきます。健康・医療、性生活、犯罪歴に関する問いは、種類・卦・時刻のみを記録し、問いの文章と無料の一言は保存しません。卦の記録は 365 日後に自動で削除されます。アカウントを削除すると、あなたに紐づいたブラウザの卦の記録も削除されます。アカウントがない場合は、立卦のおおよその日時と問いを添えてご連絡いただければ削除します。当方のスタッフは、サポートとサービス改善のために管理画面で卦の記録を閲覧できます。",
        "**決済情報**：Stripe が処理します。当方はカード情報に触れることも保存することもありません。Stripe はそのプライバシーポリシーに基づき、メールアドレスと支払い方法の情報を収集します。メンバーシップに加入すると、Stripe の顧客 ID と定期購読 ID、購読の状態と期間、メンバーシップで読んだ各回の記録を保存し、権利の判定と残り回数の表示に使います。決済後に読み解きを生成するため、あなたの問いと卦は Stripe の決済セッションに一時的に添付されます（Stripe 自身のプライバシーポリシーが適用されます）。",
        "**注文の帰属情報**：各注文には、あなたの端末のタイムゾーン名、ネットワークのエッジで観測された国、Stripe が報告するカードの国、そしてあなたを本サイトに導いた共有コード・キャンペーンタグ・ブラウザのセッション ID もあわせて保存します。これらは通貨の照合と帰属の確認にのみ使い、他の目的には使いません。",
        "**初回購入の保証の「お一人様1回」**：同じ方かどうかを判断するため、この注文のアカウント、メールアドレス、ブラウザ ID、そして Stripe がこのお支払いについて示す支払い方法の識別子（同じカード・ウォレット・Alipay アカウントかを見分けるために Stripe が生成するもので、カード番号に戻すことはできません）を、過去の注文と照合します。ワンタップ返金の可否の判断にのみ使い、購入をお断りすることやその他の目的には使いません。",
        "**アカウントデータ**：メールアドレス、ログインリンクのハッシュ値（リンクそのものは保存しません）、セッション記録、ログイン中に立てた卦と読み解き（読み返せるようにアカウントに保管）。アカウントのないメールアドレスで読み解きを購入すると、支払いをしたブラウザがその新しいアカウントに 30 日間ログインした状態になります（読み解きのリンクだけで誰かがログインすることはありません。後でメールのリンクからログインすると、この方法による他のブラウザでのログインは終了します）。ログイン中は、運営者用の管理画面で、あなたのアカウントがいまサイトにいることと、どのページにいるかが分かります。これはメモリ上に最長 30 分だけ保持され、記録には残りません。ログインしていなくても、ブラウザに上記の yf_who 標記があれば、その画面にはどのお客様がどのページにいるかが表示されます（同じくメモリ上のみ）。また、ブラウザ自身が知らせる端末の機種とシステムのバージョン（例：Threads 内で開いたときの iPhone の機種）も表示されます。この項目は下記「サーバーログと来訪時のネットワーク情報」のとおり保存されます。ログインメールの 6 桁のログインコード（リンクと同じく 15 分間・一回限り有効）でもログインでき、当社はそのハッシュ値だけを保存します。",
        "**共有と合参**：共有リンクと共有カードには卦象だけが含まれ、あなたの問いは含まれません。同じ件について相手を卦立てに招いた場合（合参）、相手に見えるのは、あなたが相手向けに書いた題目、あなたの卦象と卦名、そして同じ合参の文章だけです。あなたの元の問い、読み解きの全文、メールアドレスは相手に表示されず、その逆も同様です。合参の記録（二つの卦の関連付けと合参の文章）は二つの読み解きとともに保存され、どちらの側もいつでも解除できます。解除後は合参ページが双方に対して無効になり、それぞれの読み解きは残ります。",
        "**「一事一占」の記録**：同じことを繰り返し占わないよう、直近の問いと卦名はあなたのブラウザの localStorage にも保存され、お知らせはブラウザの中で判定されます。ブラウザのデータを消去するとこの分は削除されますが、サーバー上の卦の記録（上記）は削除されません。",
        "**来訪日と経過の記録**：別の日に戻ってくる人がどれくらいいるかを知るため、あなたのブラウザの localStorage に初回と前回の来訪日、来訪した日数を記録します。毎日最初にサイトを開いたとき、この二つの日付が統計とともに送られます。また、ブラウザにはランダムな番号の Cookie（yf_bid、約 1 年）があり、このブラウザがサイトで何をしたかをつなげて記録するのに使います。いつ来たか、どのサイトやキャンペーンタグから来たか、どのページを見たか、滞在時間、スクロールの深さ、どの名前付きボタンを押したか、何回卦を立てたか——この統計自体には問いの文章は含まれません（問いは上記の卦の記録にあります）。このブラウザでお支払い・解読の受け取り・会員枠の利用・ログインのいずれかをすると、これらの記録はあなたのアカウントに紐づけられ、読者がどのように使い、購入しているかを知るために使います。アカウントを削除すると、この紐づけも削除されます。ブラウザのデータを消去すると日付は削除され、番号も新しくなります。読み解きページの「経過を書き留める」に書いた文章は、その読み解きとともに保存され、同じ卦の中で応えるために使います。",
        "**サーバーログと来訪時のネットワーク情報**：サーバーログには IP アドレスとリクエスト時刻が含まれます。さらに来訪のたびに、このブラウザ（上記の yf_bid 番号）について、IP アドレス、ネットワーク事業者 Cloudflare が IP から判定した国・地域、都市、タイムゾーン、ブラウザとシステム、端末の機種、どのアプリ内で開いたか（例：Threads、LINE）、ブラウザの言語を当方のサーバーに保存します。用途は、濫用の防止、サポートでの確認（例：同じ方が別のブラウザやアプリから来たと見分ける）、読者がどこから、どんな端末で来ているかを知り、サービスを紹介する場所を決めることです。これらは当方の管理画面の中だけで使い、どの広告プラットフォームにも提供しません。IP アドレスは 180 日後に削除し、都市と端末だけを残します。アカウントを削除すると、あなたに紐づくブラウザのこれらの記録も削除されます。",
        "**出生データ**：四柱推命、紫微斗数、ホロスコープ、相性レポート、年運レポートには出生データ（新暦または旧暦の日付、時刻または時辰、出生地、性別、そしてそのプロフィールに付けた名前と誰のものか）が必要です。これらはまずあなたのブラウザに保存されます（最大 10 件。鑑定ページはそこから読み、URL を経由しません）。ログインすると同じ一覧がアカウントにも保存され（最大 10 件）、別の端末でログインしても再入力は不要です。アカウントページの「生年月日の記録」タブから 1 件または全件をワンタップで削除でき、アカウント削除時にも削除されます。無料の作成はブラウザ内で計算します。詳細レポート・年運レポート・相性レポートを購入した場合は、有料鑑定と同様に、出生データから計算した命盤、レポート本文、注文情報、決済時のメールアドレスを保存します。",
        "**相性レポートの相手**：他の人の出生データを入力するには、本人の同意が必要です。招待リンクを使う場合は相手が自分で出生データを入力し、それはリンクの # 部分にのみ置かれ、URL として当社サーバーに届くことはありません。サーバーはそこから計算した命盤だけをリンクの ID の下に 30 日間保存します。相性レポートは二人分の命盤と注文情報を保存します。レポート本文に書かれる内容以外に、相手が入力した生の出生データをどちらも見ることはできません。",
        "**命盤への質問**：自分の命盤について尋ねた質問は、その命盤の要点（あなたの名前や生の出生データは含みません）とともに第 3 節のモデルに送られます。質問と回答は有料鑑定と同様にアカウントに（ログアウト時はこのブラウザの ID の下に）保存され、アカウント削除時に削除されます。",
        "**パートナーの肖像**：四柱推命の詳細レポートのイラストは、命盤の五行と宮の関係から SiliconFlow（中国本土）の画像インターフェースが生成した架空の成人の肖像です。送られるのはこれらの命盤の要点を短く記した文章だけで、あなたの名前、出生データ、写真、実在の人物の容姿は含まれません。肖像はレポートとともに保存されます。",
      ],
    },
    ko: {
      h: "2. 처리하는 데이터",
      p: [
        "**당신의 질문과 괘**: 무료 한 줄과 풀이를 쓰는 데 사용합니다. 모든 괘는 아래의 ‘점괘 기록’에 들어갑니다. 유료 풀이의 질문, 효의 값, 생성된 텍스트는 해당 결제 기록과 함께도 보관되어 링크로 다시 볼 수 있습니다.",
        "**점괘 기록**: 괘가 세워지면, 로그인이나 결제 여부와 상관없이 다음을 서버에 보관합니다: 당신의 질문, 여섯 효의 값과 괘, 괘를 뽑은 시각과 시간대, 언어, 보신 무료 한 줄, 그 한 줄이 길한 쪽인지 흉한 쪽인지에 대한 판단, 휴대폰인지 컴퓨터인지와 어느 앱에서 열었는지(예: Threads), 이 브라우저의 무작위 번호(yf_bid, 아래 참고)와 그때의 탭 번호. 목적은 두 가지입니다. 첫째, 같은 일로 뽑은 괘들을 이어 붙이는 것입니다(같은 일인지는 AI가 판단합니다). 그래야 이후의 무료 한 줄, 가격 앞에 보여 드리는 안내 문구(그 일로 앞서 뽑은 괘들을 바탕으로 AI가 당신에게 맞춰 쓸 수 있습니다), 구매하신 풀이가 앞의 괘들을 함께 고려할 수 있습니다. 둘째, 가격 앞에 보여 드리는 안내 문구와 무료 한 줄의 표현을 개선하는 것입니다. 서로 다른 문구를 본 사람들이 이후 구매했는지를 비교하고(질문 분류·유입 경로·기기 등 그룹별로도 비교합니다), 매주 한 번 AI가 최근 2주간의 점괘 기록을 한 건씩 읽어(질문, 무료 한 줄, 본 안내 문구, 이후 구매 여부) 어느 단계에서 왜 구매하지 않았는지 찾아 새 문구를 씁니다. AI가 읽는 기록은 코드로만 되어 있으며 이메일·계정·브라우저 번호는 포함하지 않습니다. 이 브라우저가 당신의 계정에 연결된 뒤에는(결제, 풀이 받기, 회원 이용권 사용, 로그인) 그 점괘 기록도 계정에 연결됩니다. 건강·의료, 성생활, 범죄 경력에 관한 질문은 분류, 괘, 시각만 기록하고 질문 원문과 무료 한 줄은 보관하지 않습니다. 점괘 기록은 365일 뒤 자동으로 삭제됩니다. 계정을 삭제하면 당신에게 연결된 브라우저의 점괘 기록도 함께 삭제됩니다. 계정이 없으면 괘를 뽑은 대략의 시각과 질문을 적어 연락해 주시면 삭제합니다. 저희 직원은 고객 지원과 서비스 개선을 위해 관리 화면에서 점괘 기록을 볼 수 있습니다.",
        "**결제 정보**: Stripe가 처리합니다. 저희는 카드 정보를 보지도 저장하지도 않습니다. Stripe는 자체 개인정보 처리방침에 따라 이메일과 결제 수단 정보를 수집합니다. 멤버십에 가입하면 Stripe의 고객·구독 식별자, 구독 상태와 기간, 멤버십으로 본 각 풀이의 기록을 보관하여 권한을 판단하고 남은 횟수를 표시합니다. 결제 후 풀이를 생성하기 위해 당신의 질문과 괘는 Stripe 결제 세션에 일시적으로 첨부됩니다(Stripe 자체의 개인정보 처리방침이 적용됩니다).",
        "**주문 귀속 정보**: 각 주문과 함께 당신 기기의 시간대 이름, 네트워크 엣지에서 확인된 국가, Stripe가 보고한 카드 발급 국가, 그리고 당신을 이 사이트로 이끈 공유 코드·캠페인 태그·브라우저 세션 ID도 보관합니다. 이는 통화 확인과 귀속 파악에만 쓰이며 다른 용도로는 쓰지 않습니다.",
        "**첫 결제 보장의 ‘1인 1회’**: 같은 사람인지 판단하기 위해 이 주문의 계정, 이메일, 브라우저 ID, 그리고 Stripe가 이 결제에 대해 제공하는 결제 수단 식별자(같은 카드·지갑·Alipay 계정인지 구분하려고 Stripe가 만드는 값으로, 카드 번호로 되돌릴 수 없습니다)를 이전 주문과 대조합니다. 한 번에 환불 가능 여부를 정하는 데에만 쓰며, 구매를 거절하거나 다른 목적으로 쓰지 않습니다.",
        "**계정 데이터**: 이메일 주소, 로그인 링크의 해시값(링크 자체는 저장하지 않음), 세션 기록, 로그인 상태에서 친 괘와 풀이(다시 볼 수 있도록 계정에 보관). 아직 계정이 없는 이메일 주소로 풀이를 결제하면, 결제한 브라우저가 그 새 계정에 30일 동안 로그인됩니다(풀이 링크만으로는 누구도 로그인되지 않으며, 나중에 이메일 링크로 로그인하면 이렇게 된 다른 브라우저의 로그인은 끝납니다). 로그인한 동안에는 운영자용 관리 화면에서 계정이 지금 사이트에 있다는 것과 어느 페이지에 있는지 볼 수 있습니다. 이 정보는 메모리에 최대 30분만 머물고 기록으로 남지 않습니다. 로그인하지 않았더라도 브라우저에 위의 yf_who 표시가 있으면, 그 화면에 어느 고객이 어느 페이지에 있는지 표시됩니다(역시 메모리에만). 브라우저가 스스로 알려 주는 기기 모델과 시스템 버전(예: Threads 안에서 열었을 때의 iPhone 모델)도 표시되며, 이 항목은 아래 「서버 로그와 방문 네트워크 정보」에 적힌 대로 보관됩니다. 로그인 메일의 6자리 로그인 코드(링크와 같이 15분, 한 번만 유효)로도 로그인할 수 있으며, 저희는 그 해시값만 보관합니다.",
        "**공유와 함께 풀이**: 공유 링크와 공유 카드에는 괘만 담기고 당신의 질문은 담기지 않습니다. 같은 일로 다른 사람을 초대해 점을 치게 할 때(함께 풀이), 상대에게 보이는 것은 당신이 상대를 위해 쓴 제목, 당신의 괘와 괘 이름, 그리고 함께 풀이 글뿐입니다. 당신의 원래 질문, 풀이 전문, 이메일은 상대에게 보이지 않으며, 그 반대도 마찬가지입니다. 함께 풀이 기록(두 괘의 연결과 함께 풀이 글)은 두 풀이와 함께 보관되며, 어느 쪽이든 언제든지 해제할 수 있습니다. 해제 후 함께 풀이 페이지는 양쪽 모두에게 열리지 않고, 각자의 풀이는 남습니다.",
        "**‘한 가지 일에 한 번’ 기록**: 같은 질문을 되풀이하지 않도록 최근 질문과 괘 이름은 당신의 브라우저 localStorage에도 저장되며, 안내는 브라우저 안에서 판단됩니다. 브라우저 데이터를 지우면 이 사본은 삭제되지만, 서버의 점괘 기록(위 참고)은 삭제되지 않습니다.",
        "**방문 날짜와 경과 기록**: 다른 날 다시 오는 사람이 얼마나 되는지 알기 위해, 브라우저 localStorage에 처음 방문한 날짜와 지난번 방문 날짜, 방문한 날수를 기록합니다. 매일 처음 사이트를 열 때 이 두 날짜가 통계와 함께 전송됩니다. 브라우저에는 무작위 번호가 담긴 쿠키(yf_bid, 약 1년)도 있으며, 이 브라우저가 사이트에서 한 일을 이어 붙이는 데 씁니다. 언제 왔는지, 어느 사이트나 캠페인 태그에서 왔는지, 어떤 페이지를 봤는지, 얼마나 머물렀는지, 얼마나 스크롤했는지, 어떤 이름의 버튼을 눌렀는지, 괘를 몇 번 뽑았는지——이 통계 자체에는 질문 내용이 담기지 않습니다(질문은 위의 점괘 기록에 있습니다). 이 브라우저에서 결제하거나 풀이를 받거나 회원 이용권을 쓰거나 로그인하면 이 기록은 당신의 계정에 연결되어, 독자가 어떻게 이용하고 구매하는지 이해하는 데 쓰입니다. 계정을 삭제하면 이 연결도 삭제됩니다. 브라우저 데이터를 지우면 날짜가 삭제되고 번호도 새로 바뀝니다. 풀이 페이지의 ‘경과 적어 두기’에 쓴 글은 그 풀이와 함께 보관되어, 같은 괘 안에서 답하는 데 쓰입니다.",
        "**서버 로그와 방문 네트워크 정보**: 서버 로그에는 IP 주소와 요청 시각이 포함됩니다. 또한 방문할 때마다 이 브라우저(위의 yf_bid 번호)에 대해 IP 주소, 네트워크 사업자 Cloudflare가 IP로 판정한 국가·지역, 도시와 시간대, 브라우저와 시스템, 기기 모델, 어느 앱 안에서 열었는지(예: Threads, LINE), 브라우저 언어를 저희 서버에 저장합니다. 용도는 남용 방지, 고객 지원 시 확인(예: 같은 분이 다른 브라우저나 앱으로 왔는지 알아보기), 그리고 독자가 어디에서 어떤 기기로 오는지 파악해 서비스를 어디에 소개할지 정하는 것입니다. 이 정보는 저희 관리 화면에서만 쓰며 어떤 광고 플랫폼에도 제공하지 않습니다. IP 주소는 180일 뒤 삭제하고 도시와 기기만 남깁니다. 계정을 삭제하면 회원님 앞으로 연결된 브라우저의 이 기록도 함께 삭제됩니다.",
        "**출생 정보**: 사주, 자미두수, 출생 차트, 궁합 리포트, 연간 운세 책에는 출생 정보(양력 또는 음력 날짜, 시각 또는 시진, 출생지, 성별, 그리고 그 프로필에 붙인 이름과 누구의 것인지)가 필요합니다. 이것은 먼저 당신의 브라우저에 저장됩니다(최대 10개. 차트 페이지는 거기서 읽고 URL을 거치지 않습니다). 로그인하면 같은 목록이 계정에도 저장되어(최대 10개) 다른 기기에서 로그인해도 다시 입력할 필요가 없습니다. 계정 페이지의 '생년월일 보관' 탭에서 하나 또는 전부를 한 번에 삭제할 수 있고, 계정을 삭제하면 함께 삭제됩니다. 무료 차트는 브라우저에서 계산합니다. 심층 리포트·연간 운세 책·궁합 리포트를 구매하면 유료 풀이와 마찬가지로 출생 정보로 계산한 차트, 리포트 본문, 주문 정보, 결제 이메일을 보관합니다.",
        "**궁합 리포트의 상대방**: 다른 사람의 출생 정보를 입력하려면 먼저 그 사람의 동의를 받아야 합니다. 초대 링크를 쓰면 상대방이 직접 입력하며, 그 정보는 링크의 # 부분에만 담겨 URL로 저희 서버에 오지 않습니다. 서버는 거기서 계산한 차트만 링크 ID 아래 30일간 보관합니다. 궁합 리포트는 두 사람의 차트와 주문 정보를 보관합니다. 리포트 본문에 적힌 내용 외에는 어느 쪽도 상대가 입력한 원래 출생 정보를 볼 수 없습니다.",
        "**차트 질문**: 자신의 차트에 대해 묻는 질문은 그 차트의 핵심 사실(이름이나 원래 출생 정보는 제외)과 함께 3절의 모델로 보내집니다. 질문과 답변은 유료 풀이처럼 계정에(로그아웃 상태에서는 이 브라우저의 ID 아래) 보관되고 계정 삭제 시 함께 삭제됩니다.",
        "**인연 초상**: 사주 심층 리포트의 삽화는 차트의 오행과 궁의 관계를 바탕으로 SiliconFlow(중국 본토)의 이미지 인터페이스가 만든 가상의 성인 초상입니다. 보내지는 것은 그 차트 요점을 짧게 적은 글뿐이며 이름, 출생 정보, 사진, 실존 인물의 모습은 포함되지 않습니다. 초상은 리포트와 함께 보관됩니다.",
      ],
    },
    fr: {
      h: "2. Ce que nous traitons",
      p: [
        "**Votre question et votre tirage**\u00a0: servent à écrire la ligne offerte et la lecture. Chaque tirage entre dans le journal des tirages décrit ci-dessous\u202f; pour les lectures payantes, la question, les valeurs des traits et le texte produit sont aussi conservés avec l'enregistrement du paiement pour que vous puissiez revenir à la lecture par votre lien.",
        "**Journal des tirages**\u00a0: dès qu'un tirage est fait, que vous soyez connecté ou non, que vous ayez payé ou non, nous conservons sur notre serveur\u00a0: votre question, les six valeurs des traits et la figure, l'heure et le fuseau horaire du tirage, sa langue, la ligne offerte que vous avez vue, notre lecture de cette ligne (plutôt favorable ou défavorable), si vous êtes sur téléphone ou ordinateur et dans quelle application vous avez ouvert le site (Threads, par exemple), ainsi que le numéro aléatoire de ce navigateur (yf_bid, voir plus bas) et l'identifiant de l'onglet. Cela sert à deux choses. D'abord, relier les tirages que vous faites sur une même affaire (une IA décide si deux questions portent sur la même affaire), pour que les lignes offertes suivantes, le texte affiché avant le prix (qu'une IA peut rédiger pour vous à partir de vos tirages précédents sur cette affaire) et la lecture que vous achetez éventuellement tiennent compte des tirages précédents. Ensuite, améliorer le texte affiché avant le prix et la manière d'écrire la ligne offerte\u00a0: nous comparons si les personnes qui ont vu différents textes ont ensuite acheté (aussi par type de question, provenance, appareil, etc.), et une fois par semaine une IA lit, entrée par entrée, les deux dernières semaines du journal des tirages (questions, lignes offertes, texte vu par chacun, achat ou non) pour comprendre à quelle étape et pourquoi les gens n'ont pas acheté, puis rédige de nouveaux textes. Ce que l'IA lit est sous des codes, sans adresse e-mail, compte ni numéro de navigateur. Dès que ce navigateur est rattaché à votre compte (vous payez, recevez une lecture, utilisez une lecture comprise dans l'abonnement ou vous connectez), son journal des tirages l'est aussi. Pour les questions touchant à la santé, à la vie sexuelle ou aux antécédents judiciaires, nous ne gardons que la catégorie, la figure et l'heure — jamais les mots ni la ligne offerte. Le journal des tirages est supprimé automatiquement au bout de 365 jours\u202f; supprimer votre compte supprime le journal de chaque navigateur rattaché à vous\u202f; sans compte, écrivez-nous en indiquant à peu près quand vous avez tiré et ce que vous avez demandé, et nous le supprimerons. Notre équipe peut consulter le journal des tirages dans nos pages d'administration, pour le support et pour améliorer le service.",
        "**Informations de paiement**\u00a0: traitées par Stripe. Nous ne voyons ni ne stockons jamais vos données de carte. Stripe collecte votre e-mail et votre moyen de paiement selon sa propre politique de confidentialité. Avec un abonnement, nous conservons les identifiants client et abonnement de Stripe, l'état et la période de l'abonnement, et une trace de chaque lecture couverte — pour décider des droits et afficher ce qu'il reste. Pour générer la lecture après le paiement, votre question et votre tirage sont temporairement joints à la session de paiement Stripe (la politique de confidentialité de Stripe s'applique).",
        "**Attribution des commandes** : avec chaque commande, nous conservons aussi le nom du fuseau horaire de votre appareil, le pays observé à la périphérie de notre réseau, le pays de la carte tel que Stripe le rapporte, ainsi que le code de partage, l'étiquette de campagne et l'identifiant de session du navigateur qui vous ont amené ici. Ils servent uniquement à rapprocher la devise et l'attribution, et à rien d'autre.",
        "**« Une fois par personne » pour la garantie premier achat** : pour savoir s'il s'agit de la même personne, nous comparons le compte, l'e-mail et l'identifiant de navigateur de la commande, ainsi que l'identifiant du moyen de paiement que Stripe fournit pour ce paiement (généré par Stripe pour reconnaître une même carte, un même portefeuille ou un même compte Alipay ; il ne permet pas de retrouver le numéro de carte), avec les commandes précédentes. Il sert uniquement à décider si le remboursement en un clic s'applique — jamais à refuser un achat, ni à autre chose.",
        "**Données de compte**\u00a0: votre adresse e-mail, un hachage de chaque lien de connexion (jamais le lien lui-même), vos sessions, et les tirages et lectures faits en étant connecté (rangés sous votre compte pour y revenir). Lorsque vous payez une lecture avec une adresse qui n'a pas encore de compte, le navigateur avec lequel vous payez est connecté à ce nouveau compte pendant 30 jours (un lien de lecture seul ne connecte jamais personne\u202f; une connexion ultérieure par lien e-mail met fin aux connexions ainsi ouvertes sur d'autres navigateurs). Tant que vous êtes connecté, notre page d'administration peut voir que votre compte est sur le site en ce moment et sur quelle page\u202f; ces informations restent en mémoire 30 minutes au plus et ne sont jamais enregistrées. Si vous n'êtes pas connecté mais que le navigateur porte le marqueur yf_who décrit plus haut, cette page indique aussi de quel client il s'agit et sur quelle page il se trouve — là encore en mémoire seulement. Elle affiche aussi le modèle d'appareil et la version du système que votre navigateur annonce lui-même (par exemple le modèle d'iPhone quand vous ouvrez le site dans Threads) ; cet élément est aussi conservé comme indiqué plus bas sous « Journaux du serveur et données réseau de visite ». Vous pouvez aussi vous connecter avec le code à 6 chiffres de l'e-mail de connexion (valable 15 minutes et une seule fois, comme le lien)\u202f; nous n'en gardons qu'un hachage.",
        "**Partage et lecture croisée**\u00a0: les liens et cartes de partage ne portent que la figure, jamais votre question. Quand vous invitez une autre personne à tirer sur la même question (lecture croisée), elle ne voit que la formulation que vous avez écrite pour elle, votre figure et le nom de cet hexagramme, et la même lecture croisée\u202f; votre question d'origine, votre lecture complète et votre e-mail ne lui sont pas montrés, et réciproquement. L'enregistrement croisé (le lien entre les deux tirages et le texte croisé) est conservé avec les deux lectures, et chaque côté peut y mettre fin à tout moment\u202f; la page croisée cesse alors de fonctionner pour les deux, et chaque lecture reste.",
        "**Historique «\u00a0une question, un tirage\u00a0»**\u00a0: pour vous rappeler de ne pas reposer la même question, vos questions récentes et les noms d'hexagrammes sont aussi gardés dans le localStorage de votre propre navigateur, où le rappel lui-même est calculé. Effacer les données du navigateur supprime cette copie, mais pas le journal des tirages sur notre serveur (voir plus haut).",
        "**Dates de visite et notes de suivi**\u00a0: pour savoir combien de personnes reviennent un autre jour, votre navigateur garde dans son localStorage la date de votre première et de votre dernière visite et le nombre de jours de visite\u202f; la première fois que vous ouvrez le site chaque jour, ces deux dates sont envoyées avec nos statistiques. Votre navigateur porte aussi un cookie à numéro aléatoire (yf_bid, environ un an), qui nous sert à relier ce que ce navigateur fait sur le site\u00a0: quels jours il vient, de quel site ou de quelle campagne, quelles pages il consulte, combien de temps, jusqu'où il fait défiler, quels boutons nommés il touche et combien de tirages il fait — ces statistiques ne contiennent jamais le texte d'une question (les questions sont dans le journal des tirages décrit plus haut). Dès que vous payez, recevez une lecture, utilisez une lecture comprise dans l'abonnement ou vous connectez sur ce navigateur, ces données sont rattachées à votre compte, pour comprendre comment les lecteurs utilisent et achètent\u202f; supprimer votre compte supprime ce rattachement. Effacer les données du navigateur supprime les dates et donne au navigateur un nouveau numéro. Ce que vous écrivez sous «\u00a0Noter ce qui s'est passé\u00a0» sur une page de lecture est conservé avec cette lecture, pour y répondre dans le même tirage.",
        "**Journaux du serveur et données réseau de visite**\u00a0: les journaux du serveur contiennent l'adresse IP et l'heure de la requête. En outre, à chaque visite, nous conservons sur notre serveur, pour ce navigateur (le numéro yf_bid ci-dessus), son adresse IP, le pays ou la région, la ville et le fuseau horaire que notre prestataire réseau Cloudflare déduit de cette adresse, le navigateur et le système, le modèle d'appareil, l'application dans laquelle le site a été ouvert (par exemple Threads ou LINE) et la langue du navigateur. Nous les utilisons pour prévenir les abus, pour le support (par exemple reconnaître une même personne sur un autre navigateur ou une autre application) et pour comprendre d'où viennent les lecteurs et avec quels appareils, afin de décider où présenter notre service. Elles ne servent que dans notre propre interface interne et ne sont transmises à aucune plateforme publicitaire. Les adresses IP sont supprimées au bout de 180 jours\u202f; seuls la ville et l'appareil restent. Supprimer votre compte supprime ces données pour les navigateurs rattachés à vous.",
        "**Données de naissance** : Bazi, Zi Wei, thème astral, rapport de couple et livre de l'année demandent une naissance (date solaire ou lunaire, heure ou heure chinoise, lieu, sexe, ainsi que le nom que vous donnez au profil et pour qui il est). Elles vivent d'abord dans votre navigateur (jusqu'à 10 ; les pages de thème les y lisent, jamais par une URL). Connecté, la même liste est aussi conservée avec votre compte (jusqu'à 10), de sorte qu'un autre appareil n'a rien à ressaisir ; vous pouvez en supprimer une, ou toutes, d'un geste dans l'onglet Naissances de votre page de compte, et elles disparaissent avec le compte. Les thèmes gratuits sont calculés dans votre navigateur ; quand vous achetez un rapport approfondi, le livre de l'année ou le rapport de couple, nous conservons, comme pour une lecture payée, le thème calculé à partir de la naissance, le texte du rapport, les détails de commande et l'adresse de paiement.",
        "**L'autre personne d'un rapport de couple** : ne saisissez la naissance de quelqu'un d'autre qu'avec son accord. Avec un lien d'invitation, l'autre personne saisit elle-même sa naissance ; elle ne voyage que dans le fragment # du lien, n'atteint jamais notre serveur sous forme d'URL, et le serveur ne garde que le thème qui en est calculé, sous l'identifiant du lien, pendant 30 jours. Le rapport de couple garde les deux thèmes avec la commande ; au-delà de ce que dit le rapport, aucune des deux personnes ne voit la naissance brute saisie par l'autre.",
        "**Questions sur le thème** : une question posée sur votre propre thème est envoyée, avec les points clés de ce thème (ni votre nom de profil ni la naissance brute), au modèle décrit en section 3 ; la question et la réponse sont conservées avec votre compte comme une lecture payée (sous l'identifiant de ce navigateur si vous n'êtes pas connecté) et disparaissent avec le compte.",
        "**Portrait du partenaire** : l'illustration du rapport Bazi approfondi est le portrait d'un adulte inventé, généré par l'interface d'images de SiliconFlow (Chine continentale) à partir de l'élément et des relations de palais du thème ; seule une courte description écrite de ces points du thème est envoyée — jamais votre nom de profil, votre naissance, une photo ou l'apparence d'une personne réelle. Le portrait est conservé avec le rapport.",
      ],
    },
    de: {
      h: "2. Was wir verarbeiten",
      p: [
        "**Deine Frage und dein Wurf**: dienen dazu, die kostenlose Zeile und die Deutung zu schreiben. Jeder Wurf kommt in das unten beschriebene Wurfprotokoll; bei bezahlten Deutungen werden Frage, Linienwerte und der erzeugte Text außerdem zusammen mit dem Zahlungsdatensatz aufbewahrt, damit du über deinen Link zur Deutung zurückkehren kannst.",
        "**Wurfprotokoll**: Sobald ein Wurf fertig ist, speichern wir auf unserem Server – ob du angemeldet bist oder nicht, ob du bezahlt hast oder nicht: deine Frage, die sechs Linienwerte und das Bild, Zeitpunkt und Zeitzone des Wurfs, die Sprache, die kostenlose Zeile, die du gesehen hast, unsere Einschätzung, ob diese Zeile eher günstig oder ungünstig ausfällt, ob du am Handy oder am Computer bist und in welcher App du die Seite geöffnet hast (zum Beispiel Threads), sowie die Zufallsnummer dieses Browsers (yf_bid, siehe unten) und die Kennung des Tabs. Das dient zwei Zwecken. Erstens, die Würfe zu derselben Sache zu verbinden (ob zwei Fragen dieselbe Sache betreffen, entscheidet eine KI), damit spätere kostenlose Zeilen, der Text vor dem Preis (den eine KI aus deinen früheren Würfen zu der Sache für dich schreiben kann) und eine Deutung, die du kaufst, die früheren Würfe mit einbeziehen können. Zweitens, die Worte vor dem Preis und die Art, wie die kostenlose Zeile geschrieben wird, zu verbessern: Wir vergleichen, ob Menschen, die unterschiedliche Formulierungen gesehen haben, danach gekauft haben (auch nach Art der Frage, Herkunft, Gerät und Ähnlichem), und einmal pro Woche liest eine KI die letzten zwei Wochen des Wurfprotokolls Eintrag für Eintrag (Fragen, kostenlose Zeilen, die gesehene Formulierung, ob gekauft wurde), um herauszufinden, an welcher Stelle und warum nicht gekauft wurde, und entwirft neue Formulierungen. Was die KI liest, steht unter Codes, ohne E-Mail-Adressen, Konten oder Browsernummern. Sobald dieser Browser deinem Konto zugeordnet ist (du bezahlst, erhältst eine Deutung, nutzt ein Mitglieds-Kontingent oder meldest dich an), ist auch sein Wurfprotokoll mit deinem Konto verbunden. Bei Fragen zu Gesundheit oder Medizin, Sexualleben oder Vorstrafen speichern wir nur die Kategorie, das Bild und die Zeit – nie den Wortlaut oder die kostenlose Zeile. Das Wurfprotokoll wird nach 365 Tagen automatisch gelöscht; das Löschen deines Kontos löscht das Wurfprotokoll aller Browser, die dir zugeordnet sind; ohne Konto schreib uns ungefähr, wann du geworfen und was du gefragt hast, dann löschen wir es. Unser Team kann das Wurfprotokoll in unserem Verwaltungsbereich einsehen, für den Support und um den Dienst zu verbessern.",
        "**Zahlungsdaten**: verarbeitet Stripe. Wir sehen und speichern deine Kartendaten nie. Stripe erhebt deine E-Mail-Adresse und Zahlungsmethode nach seiner eigenen Datenschutzerklärung. Bei einer Mitgliedschaft speichern wir Stripes Kunden- und Abonnementkennungen, Status und Zeitraum des Abonnements sowie einen Eintrag für jede damit abgedeckte Deutung — um Ansprüche zu prüfen und den Rest anzuzeigen. Um die Deutung nach der Zahlung zu erzeugen, werden deine Frage und dein Wurf vorübergehend an die Stripe-Checkout-Sitzung angehängt (es gilt Stripes eigene Datenschutzerklärung).",
        "**Bestellzuordnung**: Zu jeder Bestellung speichern wir außerdem den Zeitzonennamen deines Geräts, das an unserem Netzwerkrand erkannte Land, das von Stripe gemeldete Land der Karte sowie den Teil-Code, das Kampagnen-Tag und die Browser-Sitzungskennung, die dich hierher gebracht haben. Sie dienen nur dem Abgleich von Währung und Zuordnung, sonst nichts.",
        "**„Einmal pro Person“ bei der Erstkauf-Garantie**: Um zu erkennen, ob es dieselbe Person ist, vergleichen wir Konto, E-Mail-Adresse und Browserkennung der Bestellung sowie die Kennung der Zahlungsmethode, die Stripe für diese Zahlung liefert (von Stripe erzeugt, um dieselbe Karte, dasselbe Wallet oder dasselbe Alipay-Konto zu erkennen; sie lässt sich nicht in eine Kartennummer zurückverwandeln), mit früheren Bestellungen. Sie dient nur der Entscheidung, ob die Ein-Tipp-Erstattung gilt – nie dazu, einen Kauf abzulehnen, und zu nichts anderem.",
        "**Kontodaten**: deine E-Mail-Adresse, ein Hash jedes Anmeldelinks (nie der Link selbst), deine Sitzungen sowie die Würfe und Deutungen, die du angemeldet machst (unter deinem Konto abgelegt, damit du zu ihnen zurückkehren kannst). Wenn du eine Deutung mit einer Adresse bezahlst, zu der es noch kein Konto gibt, wird der Browser, mit dem du bezahlst, für 30 Tage bei diesem neuen Konto angemeldet (ein Deutungslink allein meldet nie jemanden an; meldest du dich später per E-Mail-Link an, enden so entstandene Anmeldungen in anderen Browsern). Solange du angemeldet bist, kann unsere eigene Verwaltungsseite sehen, dass dein Konto gerade auf der Website ist und auf welcher Seite; das liegt höchstens 30 Minuten im Arbeitsspeicher und wird nie gespeichert. Bist du nicht angemeldet, trägt der Browser aber das oben beschriebene yf_who-Merkmal, zeigt diese Seite ebenfalls, welcher Kunde es ist und auf welcher Seite — ebenfalls nur im Arbeitsspeicher. Sie zeigt auch das Gerätemodell und die Systemversion, die dein Browser selbst meldet (zum Beispiel das iPhone-Modell, wenn du die Seite in Threads öffnest); diese Angabe wird außerdem wie unten unter „Serverprotokolle und Netzwerkdaten des Besuchs“ beschrieben gespeichert. Du kannst dich auch mit dem 6-stelligen Code aus der Anmelde-E-Mail anmelden (wie der Link 15 Minuten und einmal gültig); wir speichern nur einen Hash davon.",
        "**Teilen und gemeinsame Deutung**: Teil-Links und Teil-Karten tragen nur die Figur, nie deine Frage. Wenn du eine andere Person einlädst, zur selben Sache zu werfen (gemeinsame Deutung), sieht sie nur die Formulierung, die du für sie geschrieben hast, deine Figur mit ihrem Namen und dieselbe gemeinsame Deutung; deine ursprüngliche Frage, deine vollständige Deutung und deine E-Mail werden ihr nicht gezeigt, und umgekehrt ebenso wenig. Der gemeinsame Eintrag (die Verknüpfung der beiden Würfe und der gemeinsame Text) wird mit den beiden Deutungen aufbewahrt, und jede Seite kann ihn jederzeit beenden; danach funktioniert die gemeinsame Seite für beide nicht mehr, und jede Deutung bleibt.",
        "**Verlauf „eine Sache, ein Wurf“**: Damit du dieselbe Frage nicht erneut stellst, werden deine letzten Fragen und Hexagrammnamen auch im localStorage deines eigenen Browsers gespeichert, wo der Hinweis selbst berechnet wird. Das Löschen der Browserdaten entfernt diese Kopie, aber nicht das Wurfprotokoll auf unserem Server (siehe oben).",
        "**Besuchsdaten und Verlaufsnotizen**: Um zu wissen, wie viele Menschen an einem anderen Tag wiederkommen, speichert dein Browser im localStorage das Datum deines ersten und deines letzten Besuchs und an wie vielen Tagen du da warst; beim ersten Öffnen der Website an einem Tag werden diese beiden Daten mit unserer Statistik gesendet. Dein Browser trägt außerdem ein Cookie mit einer Zufallsnummer (yf_bid, etwa ein Jahr), mit dem wir verbinden, was dieser Browser auf der Website tut: an welchen Tagen er kommt, von welcher Seite oder welchem Kampagnen-Tag, welche Seiten er aufruft, wie lange er bleibt, wie weit er scrollt, welche benannten Schaltflächen er antippt und wie viele Würfe er macht — diese Statistik enthält nie den Text einer Frage (die Fragen stehen im oben beschriebenen Wurfprotokoll). Sobald du in diesem Browser bezahlst, eine Deutung erhältst, ein Mitglieds-Kontingent nutzt oder dich anmeldest, werden diese Aufzeichnungen deinem Konto zugeordnet, damit wir verstehen, wie Leser die Seite nutzen und kaufen; das Löschen deines Kontos entfernt diese Zuordnung. Das Löschen der Browserdaten entfernt die Daten und gibt dem Browser eine neue Nummer. Was du auf einer Deutungsseite unter „Festhalten, was geschehen ist“ schreibst, wird mit dieser Deutung aufbewahrt, damit sie im selben Wurf beantwortet werden kann.",
        "**Serverprotokolle und Netzwerkdaten des Besuchs**: Serverprotokolle enthalten IP-Adresse und Zeitpunkt der Anfrage. Zusätzlich speichern wir bei jedem Besuch auf unserem Server für diesen Browser (die yf_bid-Nummer oben) die IP-Adresse, das Land bzw. die Region, die Stadt und die Zeitzone, die unser Netzwerkdienstleister Cloudflare aus der Adresse ableitet, Browser und System, das Gerätemodell, die App, in der die Seite geöffnet wurde (zum Beispiel Threads oder LINE), und die Browsersprache. Wir nutzen sie, um Missbrauch zu verhindern, im Support (zum Beispiel um dieselbe Person in einem anderen Browser oder einer anderen App zu erkennen) und um zu verstehen, woher Leser kommen und mit welchen Geräten, damit wir entscheiden können, wo wir unseren Dienst vorstellen. Sie werden nur in unserem eigenen Verwaltungsbereich genutzt und an keine Werbeplattform weitergegeben. IP-Adressen werden nach 180 Tagen gelöscht; nur Stadt und Gerät bleiben. Das Löschen deines Kontos löscht diese Daten für die dir zugeordneten Browser.",
        "**Geburtsdaten**: Bazi, Zi Wei, das Geburtshoroskop, der Paar-Bericht und das Jahresbuch brauchen eine Geburt (Datum nach Sonnen- oder Mondkalender, Uhrzeit oder chinesische Stunde, Ort, Geschlecht sowie die Bezeichnung, die du dem Profil gibst, und für wen es ist). Sie liegen zuerst in deinem Browser (bis zu 10; die Horoskopseiten lesen sie dort, nie über eine URL). Angemeldet wird dieselbe Liste auch bei deinem Konto geführt (bis zu 10), sodass auf einem anderen Gerät nichts erneut einzugeben ist; auf dem Reiter Geburtsdaten deiner Kontoseite löschst du einen Eintrag oder alle mit einem Tipp, und mit dem Konto verschwinden sie ebenfalls. Die kostenlosen Horoskope werden in deinem Browser berechnet; kaufst du einen Bericht, das Jahresbuch oder den Paar-Bericht, bewahren wir wie bei einer bezahlten Deutung das aus der Geburt berechnete Horoskop, den Berichtstext, die Bestelldaten und die Zahlungs-E-Mail-Adresse auf.",
        "**Die andere Person im Paar-Bericht**: Gib die Geburt einer anderen Person nur mit deren Einverständnis ein. Bei einem Einladungslink gibt die andere Person ihre Geburt selbst ein; sie reist nur im #-Teil des Links, erreicht unseren Server nie als URL, und der Server behält nur das daraus berechnete Horoskop, unter der Kennung des Links, 30 Tage lang. Der Paar-Bericht bewahrt beide Horoskope mit der Bestellung; über das hinaus, was der Bericht selbst sagt, sieht keine Seite die rohen Geburtsdaten der anderen.",
        "**Fragen zum Horoskop**: Eine Frage zu deinem eigenen Horoskop geht zusammen mit dessen Kernfakten (nicht deiner Bezeichnung oder der rohen Geburt) an das in Abschnitt 3 beschriebene Modell; Frage und Antwort werden wie eine bezahlte Deutung bei deinem Konto aufbewahrt (abgemeldet unter der Kennung dieses Browsers) und mit dem Konto gelöscht.",
        "**Partnerporträt**: Die Illustration im Bazi-Bericht ist das Bild eines erfundenen Erwachsenen, erzeugt von der Bildschnittstelle von SiliconFlow (Festlandchina) aus dem Element und den Palastbeziehungen des Horoskops; gesendet wird nur eine kurze schriftliche Beschreibung dieser Horoskopfakten – nie deine Bezeichnung, deine Geburt, ein Foto oder das Aussehen eines echten Menschen. Das Bild wird mit dem Bericht aufbewahrt.",
      ],
    },
    es: {
      h: "2. Qué datos tratamos",
      p: [
        "**Tu pregunta y tu tirada**: se usan para escribir la línea gratuita y la lectura. Cada tirada entra en el registro de tiradas descrito abajo; en las lecturas de pago, la pregunta, los valores de las líneas y el texto resultante también se conservan con el registro del pago para que puedas volver a la lectura con tu enlace.",
        "**Registro de tiradas**: cuando se completa una tirada, hayas iniciado sesión o no, hayas pagado o no, guardamos en nuestro servidor: tu pregunta, los seis valores de las líneas y la figura, la hora y la zona horaria de la tirada, el idioma, la línea gratuita que viste, nuestra lectura de si esa línea es más bien favorable o desfavorable, si usas un teléfono o un ordenador y en qué aplicación abriste el sitio (Threads, por ejemplo), y el número aleatorio de este navegador (yf_bid, ver abajo) con el identificador de la pestaña. Sirve para dos cosas. Primero, para unir las tiradas que haces sobre un mismo asunto (una IA decide si dos preguntas son el mismo asunto), de modo que las líneas gratuitas siguientes, el texto que ves antes del precio (que una IA puede escribir para ti a partir de tus tiradas anteriores sobre ese asunto) y la lectura que compres tengan en cuenta las tiradas anteriores. Segundo, para mejorar el texto que se muestra antes del precio y la forma de escribir la línea gratuita: comparamos si las personas que vieron textos distintos compraron después (también por tipo de pregunta, procedencia, dispositivo y similares), y una vez por semana una IA lee, registro por registro, las dos últimas semanas del registro de tiradas (preguntas, líneas gratuitas, el texto que vio cada persona y si compró) para entender en qué paso y por qué la gente no compró, y redacta textos nuevos. Lo que lee la IA va bajo códigos, sin correos, cuentas ni números de navegador. Cuando este navegador queda vinculado a tu cuenta (pagas, recibes una lectura, usas una lectura de tu membresía o inicias sesión), su registro de tiradas también. En las preguntas sobre salud o temas médicos, vida sexual o antecedentes penales, guardamos solo la categoría, la figura y la hora, nunca las palabras ni la línea gratuita. El registro de tiradas se borra automáticamente a los 365 días; borrar tu cuenta borra el registro de cada navegador vinculado a ti; sin cuenta, escríbenos con la fecha aproximada de la tirada y lo que preguntaste, y lo borraremos. Nuestro equipo puede ver el registro de tiradas en nuestras páginas de administración, para dar soporte y mejorar el servicio.",
        "**Información de pago**: la gestiona Stripe. Nunca vemos ni guardamos los datos de tu tarjeta. Stripe recoge tu correo y tu método de pago bajo su propia política de privacidad. Con una membresía conservamos los identificadores de cliente y suscripción de Stripe, el estado y el periodo de la suscripción y un registro de cada lectura cubierta, para decidir los derechos y mostrar lo que queda. Para generar la lectura tras el pago, tu pregunta y tu tirada se adjuntan temporalmente a la sesión de pago de Stripe (se aplica la política de privacidad de Stripe).",
        "**Atribución del pedido**: con cada pedido conservamos también el nombre de la zona horaria de tu dispositivo, el país observado en el borde de nuestra red, el país de la tarjeta según lo informa Stripe, y el código de compartir, la etiqueta de campaña y el identificador de sesión del navegador que te trajeron aquí. Se usan solo para conciliar moneda y atribución, y para nada más.",
        "**«Una vez por persona» en la garantía de primera compra**: para saber si es la misma persona, comparamos la cuenta, el correo y el identificador del navegador del pedido, y el identificador del método de pago que Stripe da para este pago (lo genera Stripe para reconocer la misma tarjeta, billetera o cuenta de Alipay; no permite reconstruir el número de tarjeta), con pedidos anteriores. Solo sirve para decidir si aplica el reembolso con un toque; nunca para rechazar una compra ni para otra cosa.",
        "**Datos de cuenta**: tu dirección de correo, un hash de cada enlace de inicio de sesión (nunca el enlace en sí), tus sesiones y las tiradas y lecturas que hagas con la sesión iniciada (archivadas en tu cuenta para que puedas volver a ellas). Cuando pagas una lectura con una dirección que aún no tiene cuenta, el navegador con el que pagas inicia sesión en esa cuenta nueva durante 30 días (un enlace de lectura por sí solo nunca inicia sesión a nadie; si después inicias sesión con un enlace por correo, terminan las sesiones abiertas así en otros navegadores). Mientras tienes la sesión iniciada, nuestra página de administración puede ver que tu cuenta está ahora en el sitio y en qué página; esto se guarda en memoria como máximo 30 minutos y nunca se registra. Si no has iniciado sesión pero el navegador lleva el marcador yf_who descrito arriba, esa página también muestra qué cliente es y en qué página está, igualmente solo en memoria. También muestra el modelo de dispositivo y la versión del sistema que informa el propio navegador (por ejemplo, el modelo de iPhone cuando abres el sitio dentro de Threads); ese dato también se guarda como se describe abajo en «Registros del servidor y datos de red de la visita». También puedes entrar con el código de 6 dígitos del correo de inicio de sesión (válido 15 minutos y una sola vez, como el enlace); solo guardamos un hash de él.",
        "**Compartir y lectura conjunta**: los enlaces y tarjetas para compartir llevan solo la figura, nunca tu pregunta. Cuando invitas a otra persona a tirar sobre el mismo asunto (lectura conjunta), esa persona ve solo la formulación que escribiste para ella, tu figura con su nombre y la misma lectura conjunta; tu pregunta original, tu lectura y tu correo no se le muestran, ni los suyos a ti. El registro conjunto (el vínculo entre las dos tiradas y el texto conjunto) se conserva con las dos lecturas, y cualquiera de las partes puede finalizarlo en cualquier momento; después, la página conjunta deja de funcionar para ambas y cada lectura se conserva.",
        "**Historial «un asunto, una tirada»**: para recordarte que no repitas la misma pregunta, tus preguntas recientes y los nombres de los hexagramas también se guardan en el localStorage de tu propio navegador, donde se calcula el propio aviso. Borrar los datos del navegador elimina esa copia, pero no el registro de tiradas de nuestro servidor (ver arriba).",
        "**Fechas de visita y notas de avance**: para saber cuántas personas vuelven otro día, tu navegador guarda en su localStorage la fecha de tu primera y de tu última visita y cuántos días has venido; la primera vez que abres el sitio cada día, esas dos fechas se envían con nuestras estadísticas. Tu navegador lleva además una cookie con un número aleatorio (yf_bid, cerca de un año), que usamos para unir lo que este navegador hace en el sitio: qué días viene, desde qué sitio o etiqueta de campaña, qué páginas ve, cuánto tiempo se queda, cuánto se desplaza, qué botones con nombre pulsa y cuántas tiradas hace; estas estadísticas nunca llevan el texto de una pregunta (las preguntas están en el registro de tiradas descrito arriba). Cuando pagas, recibes una lectura, usas una lectura de tu membresía o inicias sesión en este navegador, estos registros se vinculan a tu cuenta, para entender cómo usan y compran los lectores; borrar tu cuenta elimina ese vínculo. Borrar los datos del navegador elimina las fechas y le da al navegador un número nuevo. Lo que escribes en «Anotar lo que pasó» en una página de lectura se guarda con esa lectura, para responderte dentro de la misma tirada.",
        "**Registros del servidor y datos de red de la visita**: los registros del servidor contienen la dirección IP y la hora de la petición. Además, en cada visita guardamos en nuestro servidor, para este navegador (el número yf_bid de arriba), su dirección IP, el país o región, la ciudad y la zona horaria que nuestro proveedor de red Cloudflare deduce de esa dirección, el navegador y el sistema, el modelo de dispositivo, la app en la que se abrió el sitio (por ejemplo Threads o LINE) y el idioma del navegador. Los usamos para prevenir abusos, para la atención al cliente (por ejemplo, reconocer a la misma persona en otro navegador o app) y para entender de dónde vienen los lectores y con qué dispositivos, y así decidir dónde presentar nuestro servicio. Solo se usan en nuestro propio panel interno y nunca se entregan a ninguna plataforma publicitaria. Las direcciones IP se borran a los 180 días y solo quedan la ciudad y el dispositivo; borrar tu cuenta borra estos registros de los navegadores vinculados a ti.",
        "**Datos de nacimiento**: Bazi, Zi Wei, la carta natal, el informe de pareja y el libro del año necesitan un nacimiento (fecha solar o lunar, hora del reloj u hora china, lugar, sexo, además del nombre que des al perfil y para quién es). Primero viven en tu propio navegador (hasta 10; las páginas de carta los leen ahí, nunca a través de una URL). Con sesión iniciada, la misma lista se guarda también en tu cuenta (hasta 10), así que otro dispositivo no necesita nada escrito de nuevo; puedes borrar uno o todos con un toque en la pestaña Nacimientos de tu página de cuenta, y se van al borrar la cuenta. Las cartas gratuitas se calculan en tu navegador; cuando compras un informe profundo, el libro del año o el informe de pareja guardamos, como con una lectura pagada, la carta calculada a partir del nacimiento, el texto del informe, los datos del pedido y el correo de pago.",
        "**La otra persona del informe de pareja**: introduce el nacimiento de otra persona solo con su consentimiento. Con un enlace de invitación la otra persona introduce su propio nacimiento; viaja solo en el fragmento # del enlace, nunca llega a nuestro servidor como URL, y el servidor guarda solo la carta calculada a partir de él, bajo el identificador del enlace, durante 30 días. El informe de pareja guarda ambas cartas con el pedido; más allá de lo que dice el propio informe, ninguna de las dos partes ve el nacimiento en bruto que introdujo la otra.",
        "**Preguntas sobre la carta**: una pregunta sobre tu propia carta se envía, junto con los datos clave de esa carta (no tu nombre de perfil ni el nacimiento en bruto), al modelo descrito en la sección 3; la pregunta y la respuesta se guardan con tu cuenta como una lectura pagada (bajo el identificador de este navegador si no has iniciado sesión) y se van al borrar la cuenta.",
        "**Retrato de la pareja**: la ilustración del informe Bazi profundo es la imagen de un adulto inventado, generada por la interfaz de imágenes de SiliconFlow (China continental) a partir del elemento y las relaciones de palacio de la carta; solo se envía una breve descripción escrita de esos datos de la carta — nunca tu nombre de perfil, tu nacimiento, una foto ni el aspecto de una persona real. La imagen se guarda con el informe.",
      ],
    },
    pt: {
      h: "2. Quais dados tratamos",
      p: [
        "**Sua pergunta e sua tiragem**: usadas para escrever a linha grátis e a leitura. Toda tiragem entra no registro de tiragens descrito abaixo; nas leituras pagas, a pergunta, os valores das linhas e o texto resultante também são mantidos junto com o registro do pagamento para que você possa voltar à leitura pelo link.",
        "**Registro de tiragens**: quando uma tiragem é concluída, com ou sem login, paga ou não, guardamos no nosso servidor: sua pergunta, os seis valores das linhas e a figura, o horário e o fuso horário da tiragem, o idioma, a linha grátis que você viu, nossa leitura de se essa linha é mais favorável ou desfavorável, se você está num celular ou num computador e em qual aplicativo abriu o site (Threads, por exemplo), e o número aleatório deste navegador (yf_bid, veja abaixo) com o identificador da aba. Isso serve a dois propósitos. Primeiro, ligar as tiragens que você faz sobre um mesmo assunto (uma IA decide se duas perguntas são o mesmo assunto), para que as próximas linhas grátis, o texto mostrado antes do preço (que uma IA pode escrever para você a partir das suas tiragens anteriores sobre o assunto) e a leitura que você comprar levem em conta as tiragens anteriores. Segundo, melhorar o texto mostrado antes do preço e a forma de escrever a linha grátis: comparamos se as pessoas que viram textos diferentes compraram depois (também por tipo de pergunta, origem, dispositivo e afins), e uma vez por semana uma IA lê, registro por registro, as duas últimas semanas do registro de tiragens (perguntas, linhas grátis, o texto que cada pessoa viu e se comprou) para entender em que etapa e por que as pessoas não compraram, e redige textos novos. O que a IA lê fica sob códigos, sem e-mails, contas ou números de navegador. Quando este navegador passa a ficar vinculado à sua conta (você paga, recebe uma leitura, usa uma leitura da assinatura ou entra na conta), o registro de tiragens dele também fica. Para perguntas sobre saúde ou questões médicas, vida sexual ou antecedentes criminais, guardamos apenas a categoria, a figura e o horário — nunca as palavras nem a linha grátis. O registro de tiragens é apagado automaticamente após 365 dias; excluir a conta apaga o registro de todos os navegadores vinculados a você; sem conta, escreva para nós dizendo mais ou menos quando tirou e o que perguntou, e nós o apagaremos. Nossa equipe pode ver o registro de tiragens nas nossas páginas de administração, para suporte e para melhorar o serviço.",
        "**Informações de pagamento**: tratadas pela Stripe. Nunca vemos nem armazenamos os dados do seu cartão. A Stripe coleta seu e-mail e o meio de pagamento segundo a própria política de privacidade. Com uma assinatura, guardamos os identificadores de cliente e de assinatura da Stripe, o status e o período da assinatura e um registro de cada leitura coberta — para determinar a que você tem direito e mostrar o que resta. Para gerar a leitura após o pagamento, sua pergunta e sua tiragem ficam temporariamente anexadas à sessão de checkout da Stripe (aplica-se a política de privacidade da própria Stripe).",
        "**Atribuição do pedido**: com cada pedido, guardamos também o nome do fuso horário do seu dispositivo, o país observado na borda da nossa rede, o país do cartão conforme informado pela Stripe, e o código de compartilhamento, a etiqueta de campanha e o identificador de sessão do navegador que trouxeram você até aqui. Servem apenas para conciliar moeda e atribuição, e para nada mais.",
        "**«Uma vez por pessoa» na garantia de primeira compra**: para saber se é a mesma pessoa, comparamos a conta, o e-mail e o identificador do navegador do pedido, e o identificador do meio de pagamento que a Stripe fornece para este pagamento (gerado pela Stripe para reconhecer o mesmo cartão, carteira ou conta Alipay; não permite reconstruir o número do cartão), com pedidos anteriores. Serve apenas para decidir se o reembolso com um toque se aplica — nunca para recusar uma compra nem para outra coisa.",
        "**Dados da conta**: seu endereço de e-mail, um hash de cada link de acesso (nunca o link em si), suas sessões e as tiragens e leituras que você faz com a conta conectada (arquivadas na sua conta para que você possa voltar a elas). Quando você paga uma leitura com um endereço que ainda não tem conta, o navegador em que você pagou fica conectado a essa nova conta por 30 dias (um link de leitura sozinho nunca conecta ninguém; se depois você entrar por um link de e-mail, as sessões abertas assim em outros navegadores terminam). Enquanto você está conectado, nossa própria página de administração pode ver que sua conta está no site agora e em qual página; isso fica na memória por no máximo 30 minutos e nunca é registrado. Se você não estiver conectado, mas o navegador tiver o marcador yf_who descrito acima, essa página também mostra qual cliente é e em qual página está — também só em memória. Ela também mostra o modelo do aparelho e a versão do sistema que o próprio navegador informa (por exemplo, o modelo do iPhone quando você abre o site dentro do Threads); esse item também é guardado como descrito abaixo em «Registros do servidor e dados de rede da visita». Você também pode entrar com o código de 6 dígitos do e-mail de acesso (válido por 15 minutos e uma única vez, como o link); guardamos apenas um hash dele.",
        "**Compartilhamento e leitura conjunta**: os links e cartões de compartilhamento levam apenas a figura, nunca a sua pergunta. Quando você convida outra pessoa para fazer uma tiragem sobre o mesmo assunto (leitura conjunta), essa pessoa vê apenas a formulação que você escreveu para ela, a sua figura com o nome e a mesma leitura conjunta; a sua pergunta original, a sua leitura inteira e o seu e-mail não são mostrados a ela, nem os dela a você. O registro conjunto (a ligação entre as duas tiragens e o texto conjunto) é guardado com as duas leituras, e qualquer um dos lados pode encerrá-lo a qualquer momento; depois disso, a página conjunta deixa de funcionar para os dois, e cada leitura permanece.",
        "**Histórico “um assunto, uma tiragem”**: para lembrar você de não repetir a mesma pergunta, suas perguntas recentes e os nomes dos hexagramas também ficam guardados no localStorage do seu próprio navegador, onde o próprio aviso é calculado. Limpar os dados do navegador apaga essa cópia, mas não o registro de tiragens no nosso servidor (veja acima).",
        "**Datas de visita e anotações de andamento**: para saber quantas pessoas voltam em outro dia, seu navegador guarda no localStorage a data da sua primeira e da sua última visita e em quantos dias você veio; na primeira vez que você abre o site em cada dia, essas duas datas são enviadas com nossas estatísticas. Seu navegador também guarda um cookie com um número aleatório (yf_bid, cerca de um ano), que usamos para ligar o que este navegador faz no site: em que dias vem, de qual site ou etiqueta de campanha, quais páginas vê, quanto tempo fica, quanto rola, quais botões nomeados toca e quantas tiragens faz — essas estatísticas nunca levam o texto de uma pergunta (as perguntas ficam no registro de tiragens descrito acima). Quando você paga, recebe uma leitura, usa uma leitura da assinatura ou entra na conta neste navegador, esses registros passam a ficar vinculados à sua conta, para entendermos como os leitores usam e compram; excluir a conta remove esse vínculo. Limpar os dados do navegador apaga as datas e dá ao navegador um número novo. O que você escreve em “Anotar o que aconteceu” em uma página de leitura fica guardado com essa leitura, para que possamos responder dentro da mesma tiragem.",
        "**Registros do servidor e dados de rede da visita**: os registros do servidor contêm o endereço IP e o horário da solicitação. Além disso, a cada visita guardamos no nosso servidor, para este navegador (o número yf_bid acima), o endereço IP, o país ou região, a cidade e o fuso horário que o nosso provedor de rede Cloudflare deduz desse endereço, o navegador e o sistema, o modelo do aparelho, o app em que o site foi aberto (por exemplo Threads ou LINE) e o idioma do navegador. Usamos esses dados para prevenir abusos, para o atendimento (por exemplo, reconhecer a mesma pessoa em outro navegador ou app) e para entender de onde vêm os leitores e com quais aparelhos, para decidir onde apresentar o nosso serviço. Eles são usados só no nosso próprio painel interno e nunca são entregues a nenhuma plataforma de publicidade. Os endereços IP são apagados após 180 dias, ficando só a cidade e o aparelho; apagar a sua conta apaga esses registros dos navegadores vinculados a você.",
        "**Dados de nascimento**: Bazi, Zi Wei, o mapa natal, o relatório do casal e o livro do ano precisam de um nascimento (data solar ou lunar, hora do relógio ou hora chinesa, lugar, sexo, além do nome que você dá ao perfil e para quem ele é). Eles ficam primeiro no seu próprio navegador (até 10; as páginas de mapa os leem ali, nunca por URL). Com sessão iniciada, a mesma lista fica também na sua conta (até 10), então outro aparelho não precisa de nada digitado de novo; você pode apagar um ou todos com um toque na aba Nascimentos da página da conta, e eles vão embora ao apagar a conta. Os mapas grátis são calculados no seu navegador; ao comprar um relatório aprofundado, o livro do ano ou o relatório do casal, guardamos, como com uma leitura paga, o mapa calculado a partir do nascimento, o texto do relatório, os dados do pedido e o e-mail de pagamento.",
        "**A outra pessoa do relatório do casal**: informe o nascimento de outra pessoa só com o consentimento dela. Com um link de convite a outra pessoa informa o próprio nascimento; ele viaja só no fragmento # do link, nunca chega ao nosso servidor como URL, e o servidor guarda apenas o mapa calculado a partir dele, sob o identificador do link, por 30 dias. O relatório do casal guarda os dois mapas com o pedido; além do que o próprio relatório diz, nenhum dos lados vê o nascimento bruto informado pelo outro.",
        "**Perguntas sobre o mapa**: uma pergunta sobre o seu próprio mapa é enviada, junto com os fatos principais desse mapa (não o seu nome de perfil nem o nascimento bruto), ao modelo descrito na seção 3; a pergunta e a resposta ficam guardadas na sua conta como uma leitura paga (sob o identificador deste navegador se não houver sessão) e vão embora ao apagar a conta.",
        "**Retrato do par**: a ilustração do relatório Bazi aprofundado é a imagem de um adulto inventado, gerada pela interface de imagens da SiliconFlow (China continental) a partir do elemento e das relações de palácio do mapa; só é enviada uma breve descrição escrita desses fatos do mapa — nunca o seu nome de perfil, o nascimento, uma foto ou a aparência de uma pessoa real. A imagem fica guardada com o relatório.",
      ],
    },
  },
  {
    zh: {
      h: "3. 第三方",
      p: [
        "**DeepSeek** 提供解读文本的生成模型。你的问题与排盘结果会发送给它进行处理；判断几卦是不是同一件事、把它们连起来写的时候，你之前就这件事问过的问题、卦象和免费那一句也会一起发送；每周分析起卦记录时，最近两周的起卦记录（只用代号，不含邮箱、账号或浏览器编号）也会发给它。适用其隐私政策。请不要在问题中填写姓名、身份证号、病历、账号密码等敏感信息——描述处境即可，不需要身份信息。",
        "**备用 AI 通道**：正常情况下，你的问题与排盘结果会发送到 DeepSeek 的接口（中国大陆）；当它不可用时，同一模型会改经 SiliconFlow（中国大陆）或火山引擎 Ark（中国大陆）处理。SiliconFlow 另外负责两件事：生成正缘画像的插图（见第 2 节）和识别你上传的签诗照片（见第 4 节）。三者均不会将这些数据用于广告，并各自适用其隐私政策。",
        "**Stripe** 处理支付、税务与欺诈防护。",
        "**Resend**（美国）：代我们发送邮件；解读交付邮件的正文含你的问题与一句断语。",
        "**Cloudflare**（美国及全球节点）：提供网络接入与防护，会看到你的 IP 与所在国家；寄到 support@ 的来信经 Cloudflare 转发给我们。",
        "除上述必要的服务提供方外，我们不出售、不出租、不交换你的数据。",
      ],
    },
    en: {
      h: "3. Third parties",
      p: [
        "**DeepSeek** provides the language model that writes the reading. Your question and the computed chart are sent to it for processing under its privacy policy; when it decides whether casts are about the same matter and writes them together, your earlier questions, figures and free lines on that matter are sent as well; for the weekly analysis, the last two weeks of the cast log (under codes, without email addresses, accounts or browser numbers) are sent to it too. Please do not include names, government IDs, medical records, passwords, or similar sensitive details in your question — describe the situation; identity is never needed.",
        "**Fallback AI routes**: normally your question and chart go to DeepSeek's own interface (mainland China); when it is unavailable the same model is reached through SiliconFlow (mainland China) or Volcano Engine Ark (mainland China). SiliconFlow also does two other things: it generates the partner-portrait illustration (section 2) and reads the lot-slip photos you upload (section 4). None of the three uses this data for advertising, and each has its own privacy policy.",
        "**Stripe** handles payment, tax, and fraud protection.",
        "**Resend** (United States) sends our email on our behalf; the body of the delivery email contains your question and one verdict line.",
        "**Cloudflare** (United States and global edge) provides network access and protection and sees your IP address and country; mail sent to support@ is forwarded to us through Cloudflare.",
        "Beyond these necessary providers, we do not sell, rent, or trade your data.",
      ],
    },
    ja: {
      h: "3. 第三者",
      p: [
        "**DeepSeek** は読み解きの文章を生成する言語モデルを提供しています。あなたの問いと計算された卦盤は、同社のプライバシーポリシーのもとで処理のために送信されます。複数の卦が同じ件かどうかを判断し、つなげて書くときには、その件について以前に立てた問い・卦・無料の一言もあわせて送信されます。週に一度の分析では、直近二週間の卦の記録（符号のみで、メールアドレス・アカウント・ブラウザ番号は含みません）も送信されます。問いには氏名、身分証番号、病歴、パスワードなどの機微な情報を書かないでください。状況を説明すれば十分で、身元は必要ありません。",
        "**予備の AI 経路**：通常、あなたの問いと命盤は DeepSeek のインターフェース（中国本土）に送られます。利用できない場合、同じモデルを SiliconFlow（中国本土）または火山引擎 Ark（中国本土）経由で利用します。SiliconFlow はさらに二つの役割を担います：パートナーの肖像のイラスト生成（第 2 節）と、アップロードされたおみくじ写真の読み取り（第 4 節）です。三者ともこれらのデータを広告に使わず、それぞれのプライバシーポリシーが適用されます。",
        "**Stripe** は決済、税務、不正防止を担います。",
        "**Resend**（米国）は当方に代わってメールを送信します。読み解きの提供メールの本文には、あなたの問いと一行の断語が含まれます。",
        "**Cloudflare**（米国および世界各地のエッジ）はネットワーク接続と防護を提供し、あなたの IP アドレスと国を把握します。support@ 宛のメールは Cloudflare を経由して当方に転送されます。",
        "これら必要な提供者以外に、あなたのデータを販売、貸与、交換することはありません。",
      ],
    },
    ko: {
      h: "3. 제3자",
      p: [
        "**DeepSeek**는 풀이 텍스트를 쓰는 언어 모델을 제공합니다. 당신의 질문과 계산된 괘 배치는 해당 회사의 개인정보 처리방침에 따라 처리를 위해 전송됩니다. 여러 괘가 같은 일인지 판단하고 이어서 쓸 때는, 그 일에 대해 이전에 물은 질문·괘·무료 한 줄도 함께 전송됩니다. 매주 분석할 때는 최근 2주간의 점괘 기록(코드로만, 이메일·계정·브라우저 번호 제외)도 전송됩니다. 질문에 이름, 신분증 번호, 병력, 비밀번호 등 민감한 정보를 적지 마세요. 상황만 설명하면 되고 신원은 필요 없습니다.",
        "**예비 AI 경로**: 평소에는 질문과 차트가 DeepSeek의 인터페이스(중국 본토)로 보내집니다. 이용할 수 없을 때는 같은 모델을 SiliconFlow(중국 본토) 또는 Volcano Engine Ark(중국 본토)를 통해 씁니다. SiliconFlow는 그 밖에 두 가지를 맡습니다: 인연 초상 삽화 생성(2절)과 업로드한 제비 사진 판독(4절). 셋 다 이 데이터를 광고에 쓰지 않으며 각자의 개인정보 정책이 적용됩니다.",
        "**Stripe**는 결제, 세금, 사기 방지를 담당합니다.",
        "**Resend**(미국)는 저희를 대신해 이메일을 보냅니다. 풀이 전달 이메일 본문에는 당신의 질문과 한 줄의 단언이 담깁니다.",
        "**Cloudflare**(미국 및 전 세계 엣지)는 네트워크 접속과 보호를 제공하며 당신의 IP 주소와 국가를 봅니다. support@로 보낸 메일은 Cloudflare를 거쳐 저희에게 전달됩니다.",
        "이러한 필수 제공자 외에는 당신의 데이터를 판매·대여·교환하지 않습니다.",
      ],
    },
    fr: {
      h: "3. Tiers",
      p: [
        "**DeepSeek** fournit le modèle de langage qui rédige la lecture. Votre question et le tableau calculé lui sont envoyés pour traitement selon sa politique de confidentialité\u202f; quand il décide si des tirages portent sur la même affaire et les relie, vos questions, figures et lignes offertes précédentes sur cette affaire lui sont aussi envoyées\u202f; pour l'analyse hebdomadaire, les deux dernières semaines du journal des tirages (sous des codes, sans adresse e-mail, compte ni numéro de navigateur) lui sont aussi envoyées. N'incluez pas de noms, de numéros d'identité, de dossiers médicaux, de mots de passe ni d'autres données sensibles dans votre question — décrivez la situation\u202f; l'identité n'est jamais nécessaire.",
        "**Voies IA de secours** : normalement, votre question et votre thème vont à l'interface de DeepSeek (Chine continentale) ; quand elle est indisponible, le même modèle est atteint via SiliconFlow (Chine continentale) ou Volcano Engine Ark (Chine continentale). SiliconFlow assure aussi deux autres tâches : générer l'illustration du portrait du partenaire (section 2) et lire les photos de baguettes que vous téléversez (section 4). Aucun des trois n'utilise ces données à des fins publicitaires, et chacun applique sa propre politique de confidentialité.",
        "**Stripe** gère le paiement, la fiscalité et la protection contre la fraude.",
        "**Resend** (États-Unis) envoie nos e-mails pour notre compte ; le corps de l'e-mail de livraison contient votre question et une ligne de verdict.",
        "**Cloudflare** (États-Unis et périphérie mondiale) fournit l'accès réseau et la protection, et voit votre adresse IP et votre pays ; le courrier envoyé à support@ nous est transmis via Cloudflare.",
        "En dehors de ces prestataires nécessaires, nous ne vendons, ne louons ni n'échangeons vos données.",
      ],
    },
    de: {
      h: "3. Dritte",
      p: [
        "**DeepSeek** stellt das Sprachmodell bereit, das die Deutung schreibt. Deine Frage und das berechnete Diagramm werden zur Verarbeitung nach dessen Datenschutzerklärung dorthin übermittelt; wenn es entscheidet, ob Würfe dieselbe Sache betreffen, und sie zusammen schreibt, werden auch deine früheren Fragen, Bilder und kostenlosen Zeilen zu dieser Sache übermittelt; für die wöchentliche Auswertung werden auch die letzten zwei Wochen des Wurfprotokolls übermittelt (unter Codes, ohne E-Mail-Adressen, Konten oder Browsernummern). Bitte nenne in deiner Frage keine Namen, Ausweisnummern, Krankenakten, Passwörter oder ähnlich sensible Angaben — beschreibe die Situation; eine Identität wird nie gebraucht.",
        "**Ersatzwege für die KI**: Normalerweise gehen deine Frage und dein Horoskop an die Schnittstelle von DeepSeek (Festlandchina); ist sie nicht erreichbar, wird dasselbe Modell über SiliconFlow (Festlandchina) oder Volcano Engine Ark (Festlandchina) angesprochen. SiliconFlow übernimmt außerdem zwei weitere Aufgaben: die Erzeugung der Partnerporträt-Illustration (Abschnitt 2) und das Lesen der hochgeladenen Losfotos (Abschnitt 4). Keiner der drei nutzt diese Daten für Werbung; für jeden gilt seine eigene Datenschutzerklärung.",
        "**Stripe** übernimmt Zahlung, Steuern und Betrugsschutz.",
        "**Resend** (USA) versendet unsere E-Mails in unserem Auftrag; der Text der Liefer-E-Mail enthält deine Frage und eine Zeile Urteil.",
        "**Cloudflare** (USA und weltweite Netzwerkränder) stellt Netzzugang und Schutz bereit und sieht deine IP-Adresse und dein Land; Post an support@ wird über Cloudflare an uns weitergeleitet.",
        "Über diese notwendigen Dienstleister hinaus verkaufen, vermieten oder tauschen wir deine Daten nicht.",
      ],
    },
    es: {
      h: "3. Terceros",
      p: [
        "**DeepSeek** proporciona el modelo de lenguaje que escribe la lectura. Tu pregunta y la figura calculada se le envían para su tratamiento bajo su propia política de privacidad; cuando decide si varias tiradas son el mismo asunto y las escribe juntas, también se le envían tus preguntas, figuras y líneas gratuitas anteriores sobre ese asunto; para el análisis semanal también se le envían las dos últimas semanas del registro de tiradas (bajo códigos, sin correos, cuentas ni números de navegador). No incluyas nombres, números de identificación, historiales médicos, contraseñas ni datos sensibles similares en tu pregunta: describe la situación; la identidad nunca hace falta.",
        "**Rutas de IA de reserva**: normalmente tu pregunta y tu carta van a la interfaz de DeepSeek (China continental); cuando no está disponible, el mismo modelo se alcanza a través de SiliconFlow (China continental) o Volcano Engine Ark (China continental). SiliconFlow hace además otras dos cosas: genera la ilustración del retrato de la pareja (sección 2) y lee las fotos de varillas que subes (sección 4). Ninguno de los tres usa estos datos para publicidad, y cada uno aplica su propia política de privacidad.",
        "**Stripe** gestiona el pago, los impuestos y la protección contra el fraude.",
        "**Resend** (Estados Unidos) envía nuestros correos en nuestro nombre; el cuerpo del correo de entrega contiene tu pregunta y una línea de veredicto.",
        "**Cloudflare** (Estados Unidos y red global) proporciona el acceso a la red y la protección, y ve tu dirección IP y tu país; el correo enviado a support@ nos llega reenviado a través de Cloudflare.",
        "Más allá de estos proveedores necesarios, no vendemos, alquilamos ni intercambiamos tus datos.",
      ],
    },
    pt: {
      h: "3. Terceiros",
      p: [
        "A **DeepSeek** fornece o modelo de linguagem que escreve a leitura. Sua pergunta e a figura calculada são enviadas a ela para processamento, segundo a política de privacidade dela; quando ela decide se várias tiragens são o mesmo assunto e as escreve juntas, suas perguntas, figuras e linhas grátis anteriores sobre esse assunto também são enviadas; para a análise semanal, as duas últimas semanas do registro de tiragens (sob códigos, sem e-mails, contas ou números de navegador) também são enviadas. Não inclua nomes, números de documentos, prontuários médicos, senhas ou dados sensíveis semelhantes na sua pergunta — descreva a situação; a identidade nunca é necessária.",
        "**Rotas de IA de reserva**: normalmente a sua pergunta e o seu mapa vão para a interface da DeepSeek (China continental); quando ela não está disponível, o mesmo modelo é alcançado pela SiliconFlow (China continental) ou pela Volcano Engine Ark (China continental). A SiliconFlow faz ainda duas outras coisas: gera a ilustração do retrato do par (seção 2) e lê as fotos de varetas que você envia (seção 4). Nenhuma das três usa esses dados para publicidade, e cada uma aplica a sua própria política de privacidade.",
        "A **Stripe** cuida do pagamento, dos impostos e da proteção contra fraudes.",
        "A **Resend** (Estados Unidos) envia nossos e-mails em nosso nome; o corpo do e-mail de entrega contém sua pergunta e uma linha de veredito.",
        "A **Cloudflare** (Estados Unidos e rede global) fornece o acesso à rede e a proteção, e vê seu endereço IP e seu país; as mensagens enviadas para support@ chegam a nós encaminhadas pela Cloudflare.",
        "Além desses fornecedores necessários, não vendemos, alugamos nem trocamos os seus dados.",
      ],
    },
  },
  {
    zh: {
      h: "4. 保留与删除",
      p: [
        "**起卦记录保存 365 天。**每一卦成卦后都会进入起卦记录（见第 2 节），不论有没有登录、有没有付款，365 天后自动删除。另外，如果你自己点「把这一卦存到邮箱」，我们会为这封信保存这一卦的问题、卦象和你看到的免费那一句，寄给你，并在大约一天后再寄一封提醒（只这一封，信里可退订）；这样存下的卦 30 天后删除，也不会因此建立账号。",
        "**付费解读会长期保存**：包括你的问题、卦象与排盘、解读全文、追问对话、以及与之关联的订单信息和结账邮箱。这样你才能凭链接随时回看自己的解读，我们也才能在你来信询问时找到那一卦。内测期间免费领取的解读按同样方式保存；你在领取时留下的邮箱只用于发送这份解读和它的应期提醒；领取轻解读赠礼不需要邮箱，领取深断赠礼则需要邮箱。只有当你在领取、付款或登录时保留勾选「告诉我新功能和动态」，我们才会给你发送这类邮件（每周最多一封，每封都可一键退订；2026 年 9 月 23 日之前勾选的，仍按当时说的，总共不超过三封）。这一项在多数地区默认勾选，你可以直接取消；在欧盟、英国、瑞士、加拿大与韩国则默认不勾，需要你自己勾选。「每日三卦」邮件只寄给在「今天的三卦」页填写邮箱、并点了确认信里按钮的人；每天一封，每封都能一键退订，退订后不再寄送。付款时勾选「没付完时寄信提醒我」的，付款没完成会收到一封提醒信（只寄这一封）：在付款页点「返回」约 5 分钟后寄，直接关掉付款页约 15 分钟后寄。信里的链接自寄出起 1 小时内有效：通卡在这段时间内付款按原价 7 折，过了 1 小时就恢复原价；会员、合盘、年书只提醒、不打折，链接 1 小时内可以按原价接着付。同一个邮箱 30 天内最多收到一封；付了款或退订就不寄。",
        "我们用这些数据改进解读质量和付款前的说明文字，并了解用户通常关心哪一类问题（事业、感情、财运等）。我们不会把你写下的问题内容出售、公开或提供给广告商。",
        "**你随时可以要求删除。**写信至 support@yaoflow.com，附上你的解读链接或结账邮箱，我们会删除对应的全部记录并回复确认。",
        "**你的其他权利与保存期限。**你可以要求访问、更正、导出或删除你的数据，或反对某项处理：写信至 support@yaoflow.com，我们会在 30 天内答复。如果你位于欧盟或英国，你也可以向当地的数据保护机构投诉。保存期限：我们在提供服务、改进产品、防止滥用和履行法律与记账义务所需的期间内保存数据；你要求删除时，除法律要求保留的交易记录外，我们会删除。",
        "**会员每日信与流月信**：会员每天会收到一封信（今日一签、按你八字算的今天与黄历「今天对你」、生肖一句、你正在问的那件事的一句、到期的应期与这个月的流月），每月另有一封流月信；内容由你账号里的卦与盘面写成。「你的今天」（每日运势页、黄历页与这封信）和择日按八字再筛，用的是你在生辰档案里标成「自己」（择日的结婚、订婚、提亲另用标成「伴侣」）的那一份，没有时用你最近一份八字报告的盘面；每次打开时当场算，不另存结果，页面上只显示当天与你日柱的关系，不显示你的生辰。信里的链接或账号页都能一键停止，停止后不影响解读交付信与回访信。通卡不寄这两种信。",
        "**塔罗**：你抽牌时写的问题、牌阵与抽到的牌，购买的专属解读与一次追问，以及你设置的回访（怎样算有结果、什么时候回来问你）和回访的回答，都保存在这次抽牌的链接编号下，连同你购买或设置回访时留下的邮箱；问题不会公开，回访信只寄一封。未付费的抽牌记录也会保存；想删除，来信即可。",
      ],
    },
    en: {
      h: "4. Retention and deletion",
      p: [
        "**The cast log is kept for 365 days.** Every completed cast goes into the cast log (see section 2), signed in or not, paid for or not, and is deleted automatically after 365 days. Separately, if you choose “Email yourself this cast”, we keep that cast’s question, figure and the free line you saw for that letter, send it to you, and send one reminder about a day later (only that one, with an unsubscribe link); a cast saved this way is deleted after 30 days and does not create an account.",
        "**Paid readings are kept indefinitely**: your question, the cast and its full chart, the reading text, any follow-up conversation, and the associated order and checkout email. This is what lets you return to your reading via your link, and lets us find that cast if you write to us about it. Readings claimed free during the beta are kept the same way; an email you leave when claiming one is used only to send that reading and its timing reminder; a gifted light reading can be claimed without an email address, while a gifted full reading requires one. We send news and feature emails only if “send me news and new features” is ticked when you claim, pay or sign in (at most one a week, each with a one-click unsubscribe; if you ticked it before 23 September 2026, the promise you were given stands: no more than three in all). In most places the box starts ticked and you can untick it; in the EU, the UK, Switzerland, Canada and Korea it starts empty and you tick it yourself. The “daily three” email goes only to people who entered their address on the Today page and clicked the button in the confirmation email; one a day, each with a one-click unsubscribe, after which it stops. If you tick “remind me if I don’t finish paying”, an unfinished payment gets one reminder email (only that one): about 5 minutes after you press “back” on the payment page, or about 15 minutes after the page was opened if you simply close it. Its link works for one hour from when it is sent: a pass bought within that hour is 30% off, after which the usual price applies again; a membership (and the other things bought once) is only reminded, at the usual price, with no discount. At most one such email per address in 30 days; none once you have paid or unsubscribed.",
        "We use this data to improve the quality of readings and the wording shown before the price, and to understand which kinds of questions people bring (career, relationships, money, and so on). We do not sell, publish, or hand your questions to advertisers.",
        "**You can ask us to delete it at any time.** Write to support@yaoflow.com with your reading link or checkout email, and we will delete the corresponding records and confirm.",
        "**Your other rights, and how long we keep things.** You can ask to access, correct, export, or delete your data, or object to a particular processing: write to support@yaoflow.com and we will answer within 30 days. If you are in the EU or the UK, you may also complain to your local data-protection authority. Retention: we keep data for as long as we need it to provide the service, improve the product, prevent abuse, and meet legal and accounting obligations; when you ask us to delete it, we do, except transaction records the law requires us to keep.",
        "**The member's daily and monthly letters**: members get a letter each day (the daily lot, a line for their zodiac sign, a line on the matter they are asking about, the timing windows now due and this month's course) and a monthly letter; both are written from the casts and charts on your account. Either stops with one tap from the link in the letter or on the account page; stopping does not affect delivery letters or revisit letters. Passes do not bring these letters.",
        "**Tarot**: the question you wrote when drawing, the spread and the cards drawn, the personal reading and the one follow-up you bought, the revisit you set (what would count, and when to ask you) and your answer to it are kept under the draw's link id, together with the email address you left when buying or setting the revisit; the question is never public, and the revisit letter goes once. Draws that were never paid for are kept too; write to us to delete one.",
      ],
    },
    ja: {
      h: "4. 保持と削除",
      p: [
        "**卦の記録は 365 日保存します。**立った卦はすべて卦の記録に入り（第 2 節参照）、ログインや支払いの有無にかかわらず、365 日後に自動で削除されます。それとは別に「この卦をメールで保存」を選んだ場合は、そのメールのためにその卦の問い・卦・表示された無料の一言を保存してお送りし、約一日後にお知らせを一通だけお送りします（配信停止できます）。こうして保存した卦は30日後に削除され、アカウントも作られません。",
        "**有料の読み解きは長期間保存します**。問い、卦と卦盤、読み解きの全文、追加質問のやり取り、それに紐づく注文情報と決済時のメールアドレスが含まれます。これによってあなたはリンクからいつでも読み返すことができ、当方もお問い合わせの際にその卦を見つけることができます。ベータ期間中に無料で受け取った読み解きも同じ方法で保存します。受け取り時に残したメールアドレスは、その読み解きと応期のリマインダーを送るためだけに使います。贈られたライト鑑定はメールアドレスなしで受け取れますが、贈られた本格鑑定の受け取りにはメールアドレスが必要です。受け取り時・お支払い時・ログイン時に「新機能やお知らせを受け取る」にチェックが入っている場合に限り、そうしたメールを送ります（週に最大 1 通、いずれもワンクリックで配信停止できます。2026 年 9 月 23 日より前にチェックした方には、当時のお約束どおり合計 3 通までとします）。この項目は多くの地域で最初からチェックが入っており、外すこともできます。EU・英国・スイス・カナダ・韓国では最初は空欄で、ご自身でチェックしていただく形です。「毎日の三卦」メールは、「今日の三卦」ページでメールアドレスを入力し、確認メールのボタンを押した方にのみ、1日1通お送りします。毎回ワンクリックで配信停止でき、停止後は送りません。お支払い時に「支払いが終わらなかったら知らせてください」にチェックを入れた場合、お支払いが完了しなかったときに一通だけお知らせのメールを送ります（支払いページで「戻る」を押してから約 5 分後、ページを閉じた場合は開いてから約 15 分後）。メールのリンクは送信から 1 時間有効です。パスはその 1 時間のあいだ 30% オフ、その後は通常価格に戻ります。メンバーシップ（とその他の単品）はお知らせだけで割引はなく、通常価格で続きからお支払いいただけます。同じアドレスへは 30 日に一通までで、お支払い後や配信停止後は送りません。",
        "これらのデータは、読み解きの品質と価格の前に表示する説明文の向上、そしてどのような種類の問い（仕事、恋愛、金運など）が多いかを知るために使います。あなたが書いた問いの内容を販売、公開、または広告主に提供することはありません。",
        "**いつでも削除を求めることができます。**読み解きのリンクまたは決済時のメールアドレスを添えて support@yaoflow.com にご連絡ください。該当する記録をすべて削除し、確認の返信をします。",
        "**その他の権利と保存期間。**あなたは自分のデータへのアクセス、訂正、エクスポート、削除を求めること、または特定の処理に異議を申し立てることができます。support@yaoflow.com にご連絡いただければ、30 日以内に回答します。EU または英国にお住まいの場合は、お住まいの地域のデータ保護機関に申し立てることもできます。保存期間：サービスの提供、製品の改善、濫用の防止、法令と会計上の義務の履行に必要な期間、データを保存します。削除を求められた場合は、法令で保存が義務づけられた取引記録を除き削除します。",
        "**会員向けの毎日のレターと月のレター**：メンバーには毎日一通（今日のおみくじ、干支の一言、いま問うている一件についての一言、期限を迎えた時期、今月の流れ）と、月に一通の月のレターが届きます。いずれもアカウント内の卦と命盤から書かれます。レター内のリンクまたはアカウントページからワンタップで停止でき、停止しても鑑定の配信メールや再訪のメールには影響しません。パスではこれらのレターは届きません。",
        "**タロット**：カードを引くときに書いた問い、スプレッドと引いたカード、購入した個人鑑定と一回の追問、設定した再訪（何をもって結果とするか、いつ尋ねるか）とその回答は、購入時または再訪設定時に残したメールアドレスとともに、その引きのリンク ID の下に保存されます。問いが公開されることはなく、再訪のメールは一通だけです。未購入の引きの記録も保存されます。削除したい場合はご連絡ください。",
      ],
    },
    ko: {
      h: "4. 보관과 삭제",
      p: [
        "**점괘 기록은 365일 보관합니다.** 세워진 괘는 로그인이나 결제 여부와 상관없이 모두 점괘 기록에 들어가며(제2조 참고), 365일 뒤 자동으로 삭제됩니다. 이와 별도로 ‘이 괘를 메일로 저장’을 직접 선택하면, 그 메일을 위해 그 괘의 질문·괘·보신 무료 한 줄을 저장해 보내 드리고, 약 하루 뒤에 안내 메일을 한 번만 보냅니다(수신 거부 가능). 이렇게 저장한 괘는 30일 뒤 삭제되며 계정이 만들어지지 않습니다.",
        "**유료 풀이는 장기간 보관합니다.** 질문, 괘와 괘 배치, 풀이 전문, 추가 질문 대화, 관련 주문 정보와 결제 이메일이 포함됩니다. 그래야 당신이 링크로 언제든 다시 볼 수 있고, 문의하실 때 저희가 그 괘를 찾을 수 있습니다. 베타 기간에 무료로 받은 풀이도 같은 방식으로 보관합니다. 받을 때 남긴 이메일은 그 풀이와 응기 알림을 보내는 데만 쓰입니다. 선물받은 간단 풀이는 이메일 없이 받을 수 있지만, 선물받은 심층 풀이를 받으려면 이메일이 필요합니다. 받을 때, 결제할 때 또는 로그인할 때 ‘새 기능과 소식 받기’에 체크되어 있는 경우에만 그런 메일을 보냅니다(주 1통 이하, 각 메일에서 한 번의 클릭으로 수신 거부 가능. 2026년 9월 23일 이전에 체크하신 분께는 당시 약속대로 모두 합쳐 세 통 이하로 보냅니다). 이 항목은 대부분의 지역에서 기본으로 체크되어 있어 해제할 수 있으며, EU·영국·스위스·캐나다·한국에서는 비어 있어 직접 체크하셔야 합니다. '매일 세 괘' 메일은 '오늘의 세 괘' 페이지에서 이메일을 입력하고 확인 메일의 버튼을 누른 분께만 하루 한 통 보내며, 매번 한 번에 수신 거부할 수 있고 거부 후에는 보내지 않습니다. 결제할 때 ‘결제를 마치지 못하면 알려 주세요’에 체크하면, 결제가 완료되지 않았을 때 알림 메일을 한 통만 보냅니다(결제 페이지에서 ‘뒤로’를 누른 지 약 5분 후, 페이지를 그냥 닫은 경우에는 연 지 약 15분 후). 메일의 링크는 보낸 때부터 1시간 동안 유효합니다. 패스는 그 1시간 동안 30% 할인되고 이후에는 정가로 돌아가며, 멤버십(과 그 밖의 단품)은 알림만 보내고 할인 없이 정가로 이어서 결제할 수 있습니다. 같은 주소로는 30일에 한 통까지이며, 결제했거나 수신 거부한 뒤에는 보내지 않습니다.",
        "이 데이터는 풀이의 품질과 가격 앞의 안내 문구를 개선하고, 사람들이 어떤 종류의 질문(일, 관계, 돈 등)을 가져오는지 이해하는 데 사용합니다. 당신이 쓴 질문 내용을 판매·공개하거나 광고주에게 넘기지 않습니다.",
        "**언제든 삭제를 요청할 수 있습니다.** 풀이 링크나 결제 이메일을 적어 support@yaoflow.com으로 보내 주시면 해당 기록을 모두 삭제하고 확인 답장을 드립니다.",
        "**그 밖의 권리와 보관 기간.** 당신은 자신의 데이터에 대한 열람, 정정, 내보내기, 삭제를 요청하거나 특정 처리에 반대할 수 있습니다. support@yaoflow.com으로 보내 주시면 30일 이내에 답변합니다. EU나 영국에 거주하는 경우 현지 개인정보 보호 기관에 불만을 제기할 수도 있습니다. 보관 기간: 서비스 제공, 제품 개선, 남용 방지, 법적·회계상 의무 이행에 필요한 기간 동안 데이터를 보관합니다. 삭제를 요청하시면 법으로 보관해야 하는 거래 기록을 제외하고 삭제합니다.",
        "**회원의 매일 편지와 월간 편지**: 회원은 매일 한 통(오늘의 제비, 띠 한 줄, 지금 묻고 있는 일에 대한 한 줄, 기한이 된 시기, 이달의 흐름)과 매달 한 통의 월간 편지를 받습니다. 둘 다 계정에 있는 괘와 차트로 씁니다. 편지의 링크나 계정 페이지에서 한 번에 멈출 수 있고, 멈춰도 풀이 전달 편지와 재방문 편지에는 영향이 없습니다. 패스에는 이 편지가 오지 않습니다.",
        "**타로**: 카드를 뽑을 때 쓴 질문, 스프레드와 뽑은 카드, 구매한 개인 풀이와 1회 추가 질문, 설정한 재방문(무엇을 결과로 볼지, 언제 물을지)과 그 답변은 구매하거나 재방문을 설정할 때 남긴 이메일과 함께 그 뽑기의 링크 ID 아래 보관됩니다. 질문은 공개되지 않으며 재방문 편지는 한 통만 갑니다. 결제하지 않은 뽑기 기록도 보관됩니다. 삭제를 원하시면 메일을 주세요.",
      ],
    },
    fr: {
      h: "4. Conservation et suppression",
      p: [
        "**Le journal des tirages est conservé 365 jours.** Chaque tirage fait y entre (voir la section 2), connecté ou non, payé ou non, et il est supprimé automatiquement au bout de 365 jours. Par ailleurs, si vous choisissez «\u00a0Envoyez-vous ce tirage par e-mail\u00a0», nous gardons pour ce message la question, la figure et la ligne offerte que vous avez vue, nous vous les envoyons, puis un seul rappel environ un jour plus tard (avec un lien de désabonnement)\u202f; un tirage gardé ainsi est supprimé après 30 jours et ne crée pas de compte.",
        "**Les lectures payantes sont conservées sans limite de durée**\u00a0: votre question, le tirage et son tableau complet, le texte de la lecture, toute conversation de suivi, ainsi que la commande et l'e-mail de paiement associés. C'est ce qui vous permet de revenir à votre lecture par votre lien, et ce qui nous permet de retrouver ce tirage si vous nous écrivez à son sujet. Les lectures obtenues gratuitement pendant la bêta sont conservées de la même façon\u202f; un e-mail que vous laissez en la réclamant sert uniquement à envoyer cette lecture et son rappel d'échéance ; une lecture express offerte peut être réclamée sans adresse e-mail, alors qu'une lecture approfondie offerte en exige une. Nous ne vous enverrons des nouvelles du lancement et des nouveautés que si la case «\u00a0m'envoyer les nouveautés et les actualités\u00a0» est cochée quand vous réclamez une lecture, payez ou vous connectez (un e-mail par semaine au plus, chacun avec désabonnement en un clic\u202f; si vous l'avez cochée avant le 23 septembre 2026, la promesse faite alors tient\u00a0: trois au plus en tout). Dans la plupart des pays la case est cochée d'avance et vous pouvez la décocher\u202f; dans l'UE, au Royaume-Uni, en Suisse, au Canada et en Corée elle est vide et c'est à vous de la cocher. L'e-mail « trois du jour » n'est envoyé qu'aux personnes qui ont saisi leur adresse sur la page du jour et cliqué sur le bouton de l'e-mail de confirmation\u00a0; un par jour, chacun avec désabonnement en un clic, après quoi il s'arrête. Si vous cochez « me le rappeler si je ne termine pas le paiement », un paiement inachevé donne lieu à un seul e-mail de rappel : environ 5 minutes après avoir cliqué sur « retour » sur la page de paiement, ou environ 15 minutes après son ouverture si vous la fermez simplement. Son lien est valable une heure à partir de l’envoi : un pass acheté pendant cette heure est à -30 %, puis le prix habituel s’applique de nouveau ; un abonnement (et les autres achats ponctuels) fait seulement l’objet d’un rappel, au prix habituel, sans remise. Au plus un tel e-mail par adresse sur 30 jours ; aucun une fois le paiement fait ou après désinscription.",
        "Nous utilisons ces données pour améliorer la qualité des lectures et le texte affiché avant le prix, et pour comprendre quels types de questions les gens posent (carrière, relations, argent, etc.). Nous ne vendons, ne publions ni ne transmettons vos questions à des annonceurs.",
        "**Vous pouvez demander la suppression à tout moment.** Écrivez à support@yaoflow.com avec votre lien de lecture ou votre e-mail de paiement\u202f; nous supprimerons les enregistrements correspondants et vous le confirmerons.",
        "**Vos autres droits, et nos durées de conservation.** Vous pouvez demander l'accès à vos données, leur rectification, leur export ou leur suppression, ou vous opposer à un traitement particulier : écrivez à support@yaoflow.com et nous vous répondrons sous 30 jours. Si vous êtes dans l'UE ou au Royaume-Uni, vous pouvez aussi déposer une réclamation auprès de votre autorité locale de protection des données. Durées de conservation : nous conservons les données aussi longtemps que nécessaire pour fournir le service, améliorer le produit, prévenir les abus et respecter nos obligations légales et comptables ; si vous demandez leur suppression, nous les supprimons, à l'exception des enregistrements de transactions que la loi nous impose de garder.",
        "**Lettres quotidienne et mensuelle des membres** : les membres reçoivent une lettre chaque jour (la baguette du jour, une ligne pour leur signe, une ligne sur l'affaire qu'ils posent, les fenêtres arrivées à échéance et le cours du mois) et une lettre mensuelle ; toutes deux sont écrites à partir des tirages et thèmes de votre compte. L'une et l'autre s'arrêtent d'un geste depuis le lien de la lettre ou la page de compte ; l'arrêt ne touche ni les courriels de livraison ni les courriels de retour. Les pass n'apportent pas ces lettres.",
        "**Tarot** : la question écrite au moment du tirage, le tirage et les cartes sorties, la lecture personnelle et l'unique question de suivi achetées, le retour que vous avez réglé (ce qui compterait, et quand vous demander) et votre réponse sont conservés sous l'identifiant du lien du tirage, avec l'adresse laissée à l'achat ou au réglage du retour ; la question n'est jamais publique, et le courriel de retour part une seule fois. Les tirages jamais payés sont conservés aussi ; écrivez-nous pour en supprimer un.",
      ],
    },
    de: {
      h: "4. Aufbewahrung und Löschung",
      p: [
        "**Das Wurfprotokoll wird 365 Tage aufbewahrt.** Jeder fertige Wurf kommt in das Wurfprotokoll (siehe Abschnitt 2) – angemeldet oder nicht, bezahlt oder nicht – und wird nach 365 Tagen automatisch gelöscht. Unabhängig davon: Wählst du „Schick dir diesen Wurf per E-Mail“, speichern wir für diese E-Mail Frage, Bild und die kostenlose Zeile, die du gesehen hast, schicken sie dir und etwa einen Tag später eine einzige Erinnerung (mit Abmeldelink); ein so gespeicherter Wurf wird nach 30 Tagen gelöscht und legt kein Konto an.",
        "**Bezahlte Deutungen werden dauerhaft aufbewahrt**: deine Frage, der Wurf mit vollständigem Diagramm, der Deutungstext, jede Nachfrage sowie die zugehörige Bestellung und Bezahl-E-Mail. Nur so kannst du über deinen Link zu deiner Deutung zurückkehren, und nur so finden wir diesen Wurf, wenn du uns dazu schreibst. In der Beta kostenlos erhaltene Deutungen werden genauso aufbewahrt; eine E-Mail-Adresse, die du beim Abholen angibst, dient nur dazu, diese Deutung und ihre Terminerinnerung zu schicken; eine geschenkte Kurzdeutung lässt sich ohne E-Mail-Adresse abholen, eine geschenkte Tiefendeutung braucht eine. Nur wenn „Neuigkeiten und neue Funktionen schicken“ beim Abholen, Bezahlen oder Anmelden angekreuzt ist, schicken wir dir solche E-Mails (höchstens eine pro Woche, jede mit Abbestellung per Klick; wer vor dem 23. September 2026 angekreuzt hat, für den gilt die damalige Zusage: insgesamt höchstens drei). In den meisten Ländern ist das Kästchen vorausgewählt und lässt sich abwählen; in der EU, im Vereinigten Königreich, in der Schweiz, in Kanada und in Korea ist es leer und du kreuzt es selbst an. Die Mail „Die drei des Tages“ geht nur an Personen, die ihre Adresse auf der Tagesseite eingetragen und den Button in der Bestätigungsmail geklickt haben; eine pro Tag, jede mit Abmeldung per Klick, danach endet sie. Wenn du „Erinnere mich, falls ich nicht fertig bezahle“ ankreuzt, bekommst du bei einer nicht abgeschlossenen Zahlung eine einzige Erinnerungs-E-Mail: etwa 5 Minuten nachdem du auf der Zahlungsseite „Zurück“ gedrückt hast, oder etwa 15 Minuten nach dem Öffnen, wenn du die Seite einfach schließt. Ihr Link gilt eine Stunde ab dem Versand: Ein Pass ist in dieser Stunde 30 % günstiger, danach gilt wieder der normale Preis; bei einer Mitgliedschaft (und anderen Einzelkäufen) gibt es nur die Erinnerung zum normalen Preis, ohne Rabatt. Höchstens eine solche E-Mail pro Adresse in 30 Tagen; keine mehr, sobald du bezahlt oder dich abgemeldet hast.",
        "Wir nutzen diese Daten, um die Qualität der Deutungen und die Worte vor dem Preis zu verbessern und um zu verstehen, welche Arten von Fragen Menschen mitbringen (Beruf, Beziehungen, Geld und so weiter). Wir verkaufen, veröffentlichen oder übergeben deine Fragen nicht an Werbetreibende.",
        "**Du kannst jederzeit die Löschung verlangen.** Schreib an support@yaoflow.com mit deinem Deutungslink oder deiner Bezahl-E-Mail; wir löschen die zugehörigen Datensätze und bestätigen es dir.",
        "**Deine weiteren Rechte und unsere Aufbewahrungsfristen.** Du kannst Auskunft über deine Daten, ihre Berichtigung, ihren Export oder ihre Löschung verlangen oder einer bestimmten Verarbeitung widersprechen: Schreib an support@yaoflow.com, und wir antworten innerhalb von 30 Tagen. Wenn du in der EU oder im Vereinigten Königreich bist, kannst du dich auch bei deiner örtlichen Datenschutzbehörde beschweren. Aufbewahrung: Wir bewahren Daten so lange auf, wie wir sie brauchen, um den Dienst zu erbringen, das Produkt zu verbessern, Missbrauch zu verhindern und gesetzliche sowie buchhalterische Pflichten zu erfüllen; wenn du die Löschung verlangst, löschen wir sie – außer Transaktionsdaten, die wir gesetzlich aufbewahren müssen.",
        "**Täglicher und monatlicher Mitgliederbrief**: Mitglieder bekommen täglich einen Brief (das Tageslos, eine Zeile zum Tierkreiszeichen, eine Zeile zur Sache, die sie gerade fragen, die fällig gewordenen Zeitfenster und den Verlauf des Monats) und monatlich einen Monatsbrief; beide werden aus den Würfen und Horoskopen deines Kontos geschrieben. Beide enden mit einem Tipp über den Link im Brief oder auf der Kontoseite; das berührt weder Zustellungs- noch Rückblick-Mails. Pässe bringen diese Briefe nicht.",
        "**Tarot**: Die beim Ziehen geschriebene Frage, die Legung und die gezogenen Karten, die gekaufte persönliche Deutung mit der einen Nachfrage, der eingestellte Rückblick (was zählen würde und wann wir fragen) und deine Antwort darauf werden unter der Kennung des Ziehungs-Links aufbewahrt, zusammen mit der beim Kauf oder beim Einstellen des Rückblicks hinterlassenen E-Mail-Adresse; die Frage ist nie öffentlich, und die Rückblick-Mail geht einmal. Nie bezahlte Ziehungen werden ebenfalls aufbewahrt; schreib uns, um eine zu löschen.",
      ],
    },
    es: {
      h: "4. Conservación y eliminación",
      p: [
        "**El registro de tiradas se conserva 365 días.** Toda tirada completada entra en el registro de tiradas (ver la sección 2), con o sin sesión, pagada o no, y se borra automáticamente a los 365 días. Aparte, si eliges «Envíate esta tirada por correo», guardamos para ese correo la pregunta, la figura y la línea gratuita que viste, te las enviamos y, un día después más o menos, un único recordatorio (con enlace para darte de baja); una tirada guardada así se borra a los 30 días y no crea ninguna cuenta.",
        "**Las lecturas de pago se conservan indefinidamente**: tu pregunta, la tirada y su figura completa, el texto de la lectura, cualquier conversación de seguimiento y el pedido y correo de pago asociados. Es lo que te permite volver a tu lectura con tu enlace, y lo que nos permite encontrar esa tirada si nos escribes sobre ella. Las lecturas obtenidas gratis durante la beta se conservan del mismo modo; el correo que dejes al reclamar una se usa solo para enviarte esa lectura y su recordatorio de plazo; una lectura breve regalada puede reclamarse sin correo, mientras que una lectura completa regalada lo requiere. Solo te enviaremos esos correos si «quiero recibir también novedades» está marcado al reclamar, pagar o iniciar sesión (uno a la semana como máximo, cada uno con baja en un clic; si lo marcaste antes del 23 de septiembre de 2026, vale lo que se te prometió entonces: tres como máximo en total). En la mayoría de países la casilla viene marcada y puedes desmarcarla; en la UE, el Reino Unido, Suiza, Canadá y Corea viene vacía y la marcas tú. El correo «las tres del día» solo se envía a quien escribió su dirección en la página del día y pulsó el botón del correo de confirmación; uno al día, cada uno con baja en un clic, tras la cual deja de enviarse. Si marcas «avísame si no termino de pagar», un pago sin terminar recibe un único correo de recordatorio: unos 5 minutos después de pulsar «volver» en la página de pago, o unos 15 minutos después de abrirla si simplemente la cierras. Su enlace vale una hora desde el envío: un pase comprado en esa hora tiene un 30 % de descuento y después vuelve el precio normal; una membresía (y las demás compras sueltas) solo recibe el recordatorio, al precio normal y sin descuento. Como máximo un correo así por dirección cada 30 días; ninguno si ya pagaste o te diste de baja.",
        "Usamos estos datos para mejorar la calidad de las lecturas y el texto que se muestra antes del precio, y para entender qué tipos de preguntas trae la gente (trabajo, relaciones, dinero, etc.). No vendemos, publicamos ni entregamos tus preguntas a anunciantes.",
        "**Puedes pedir la eliminación en cualquier momento.** Escribe a support@yaoflow.com con tu enlace de lectura o tu correo de pago; borraremos los registros correspondientes y te lo confirmaremos.",
        "**Tus demás derechos y cuánto tiempo conservamos los datos.** Puedes pedir acceder a tus datos, corregirlos, exportarlos o eliminarlos, u oponerte a un tratamiento concreto: escribe a support@yaoflow.com y responderemos en un plazo de 30 días. Si estás en la UE o el Reino Unido, también puedes presentar una reclamación ante tu autoridad local de protección de datos. Plazos de conservación: guardamos los datos mientras los necesitemos para prestar el servicio, mejorar el producto, prevenir abusos y cumplir obligaciones legales y contables; si pides su eliminación, los eliminamos, salvo los registros de transacciones que la ley nos obliga a conservar.",
        "**Cartas diaria y mensual de miembro**: los miembros reciben una carta cada día (la varilla del día, una línea para su signo, una línea sobre el asunto que están preguntando, las ventanas ya vencidas y el curso del mes) y una carta mensual; ambas se escriben a partir de las tiradas y cartas de tu cuenta. Cualquiera se detiene con un toque desde el enlace de la carta o la página de cuenta; detenerlas no afecta a los correos de entrega ni a los de revisita. Los pases no traen estas cartas.",
        "**Tarot**: la pregunta que escribiste al tirar, la tirada y las cartas salidas, la lectura personal y la única pregunta de seguimiento compradas, la revisita que fijaste (qué contaría, y cuándo preguntarte) y tu respuesta se guardan bajo el identificador del enlace de la tirada, junto con el correo dejado al comprar o fijar la revisita; la pregunta nunca es pública, y el correo de revisita se envía una sola vez. Las tiradas nunca pagadas también se guardan; escríbenos para borrar una.",
      ],
    },
    pt: {
      h: "4. Retenção e exclusão",
      p: [
        "**O registro de tiragens é mantido por 365 dias.** Toda tiragem concluída entra no registro de tiragens (veja a seção 2), com ou sem login, paga ou não, e é apagada automaticamente após 365 dias. À parte disso, se você escolher “Envie esta tiragem para o seu e-mail”, guardamos para esse e-mail a pergunta, a figura e a linha grátis que você viu, enviamos para você e, cerca de um dia depois, um único lembrete (com link para descadastrar); uma tiragem salva assim é apagada após 30 dias e não cria conta.",
        "**Leituras pagas são mantidas por tempo indeterminado**: sua pergunta, a tiragem e a figura completa dela, o texto da leitura, qualquer conversa de perguntas adicionais e o pedido e o e-mail de pagamento associados. É isso que permite que você volte à leitura pelo link, e que nós encontremos essa tiragem se você nos escrever sobre ela. As leituras obtidas gratuitamente durante o beta são mantidas da mesma forma; um e-mail que você deixe ao resgatá-las serve apenas para enviar essa leitura e o lembrete do prazo; uma leitura breve de presente pode ser resgatada sem e-mail, enquanto uma leitura completa de presente exige um. Só enviaremos esses e-mails se a opção “Quero receber também novidades e notícias” estiver marcada quando você resgatar, pagar ou entrar na conta (no máximo um por semana, cada um com cancelamento em um clique; se você marcou antes de 23 de setembro de 2026, vale o que foi prometido então: no máximo três no total). Na maioria dos países a caixa já vem marcada e você pode desmarcá-la; na UE, no Reino Unido, na Suíça, no Canadá e na Coreia ela vem desmarcada e é você quem a marca. O e-mail “as três do dia” só é enviado a quem informou o endereço na página do dia e clicou no botão do e-mail de confirmação; um por dia, cada um com cancelamento em um clique, após o qual para. Se você marcar “me avise se eu não terminar de pagar”, um pagamento não concluído recebe um único e-mail de lembrete: cerca de 5 minutos depois de você tocar em “voltar” na página de pagamento, ou cerca de 15 minutos depois de abri-la se você simplesmente fechar. O link vale por uma hora a partir do envio: um passe comprado nessa hora tem 30% de desconto e depois volta o preço normal; uma assinatura (e as demais compras avulsas) recebe só o lembrete, pelo preço normal, sem desconto. No máximo um e-mail assim por endereço a cada 30 dias; nenhum depois que você pagou ou cancelou a inscrição.",
        "Usamos esses dados para melhorar a qualidade das leituras e o texto mostrado antes do preço, e para entender que tipos de pergunta as pessoas trazem (trabalho, relacionamentos, dinheiro etc.). Não vendemos, publicamos nem repassamos suas perguntas a anunciantes.",
        "**Você pode pedir a exclusão a qualquer momento.** Escreva para support@yaoflow.com com o link da sua leitura ou o e-mail de pagamento; apagaremos os registros correspondentes e confirmaremos.",
        "**Seus outros direitos e por quanto tempo guardamos os dados.** Você pode pedir para acessar, corrigir, exportar ou excluir seus dados, ou se opor a um tratamento específico: escreva para support@yaoflow.com e responderemos em até 30 dias. Se você está na UE ou no Reino Unido, também pode reclamar junto à autoridade local de proteção de dados. Prazos de retenção: guardamos os dados pelo tempo necessário para prestar o serviço, melhorar o produto, prevenir abusos e cumprir obrigações legais e contábeis; se você pedir a exclusão, excluímos, exceto os registros de transações que a lei nos obriga a manter.",
        "**Cartas diária e mensal de membro**: membros recebem uma carta por dia (a vareta do dia, uma linha para o seu signo, uma linha sobre o assunto que estão perguntando, as janelas já vencidas e o rumo do mês) e uma carta mensal; ambas são escritas a partir das tiragens e mapas da sua conta. Qualquer uma para com um toque pelo link da carta ou na página da conta; parar não afeta os e-mails de entrega nem os de retorno. Passes não trazem essas cartas.",
        "**Tarô**: a pergunta escrita ao tirar, a tiragem e as cartas saídas, a leitura pessoal e a única pergunta de acompanhamento compradas, o retorno que você definiu (o que contaria, e quando perguntar) e a sua resposta ficam guardados sob o identificador do link da tiragem, junto com o e-mail deixado ao comprar ou definir o retorno; a pergunta nunca é pública, e o e-mail de retorno vai uma só vez. Tiragens nunca pagas também ficam guardadas; escreva-nos para apagar uma.",
      ],
    },
  },
  {
    zh: {
      h: "5. 跨境处理",
      p: [
        "本站服务器位于日本，AI 处理由 DeepSeek 完成（中国大陆；备用通道 SiliconFlow 与火山引擎 Ark 同在中国大陆），支付由 Stripe 完成（美国及其全球基础设施），邮件由 Resend 发送（美国），网络接入与防护由 Cloudflare 提供（美国及全球节点）。使用本站即表示你了解并同意这一处理方式。如果你不希望自己的问题被这样处理，请不要提交。",
      ],
    },
    en: {
      h: "5. Cross-border processing",
      p: [
        "Our server is in Japan; AI processing is performed by DeepSeek (mainland China; the fallback hosts SiliconFlow and Volcengine Ark are also in mainland China); payment by Stripe (United States and its global infrastructure); email is sent by Resend (United States); and network access and protection are provided by Cloudflare (United States and global edge). Using the site means you understand and accept this. If you would rather your question not be processed this way, please do not submit it.",
      ],
    },
    ja: {
      h: "5. 国境を越える処理",
      p: [
        "当方のサーバーは日本にあり、AI 処理は DeepSeek（中国本土。予備経路の SiliconFlow と Volcengine Ark も中国本土）、決済は Stripe（米国およびそのグローバルなインフラ）、メール送信は Resend（米国）、ネットワーク接続と防護は Cloudflare（米国および世界各地のエッジ）が行います。本サイトを利用することは、この処理方法を理解し同意したものとみなします。自分の問いをこのように処理されたくない場合は、送信しないでください。",
      ],
    },
    ko: {
      h: "5. 국경 간 처리",
      p: [
        "저희 서버는 일본에 있으며, AI 처리는 DeepSeek(중국 본토. 예비 경로인 SiliconFlow와 Volcengine Ark도 중국 본토), 결제는 Stripe(미국과 그 글로벌 인프라), 이메일 발송은 Resend(미국), 네트워크 접속과 보호는 Cloudflare(미국 및 전 세계 엣지)가 수행합니다. 이 사이트를 이용하는 것은 이러한 처리 방식을 이해하고 동의함을 뜻합니다. 질문이 이렇게 처리되는 것을 원치 않으면 제출하지 마세요.",
      ],
    },
    fr: {
      h: "5. Traitement transfrontalier",
      p: [
        "Notre serveur est au Japon ; le traitement par IA est effectué par DeepSeek (Chine continentale ; les hébergeurs de secours SiliconFlow et Volcengine Ark sont aussi en Chine continentale), le paiement par Stripe (États-Unis et son infrastructure mondiale), l'envoi des e-mails par Resend (États-Unis), et l'accès réseau et la protection par Cloudflare (États-Unis et périphérie mondiale). Utiliser le site signifie que vous comprenez et acceptez cela. Si vous préférez que votre question ne soit pas traitée ainsi, ne la soumettez pas.",
      ],
    },
    de: {
      h: "5. Grenzüberschreitende Verarbeitung",
      p: [
        "Unser Server steht in Japan; die KI-Verarbeitung übernimmt DeepSeek (Festlandchina; die Ausweichanbieter SiliconFlow und Volcengine Ark sitzen ebenfalls in Festlandchina), die Zahlung Stripe (USA und dessen weltweite Infrastruktur), den E-Mail-Versand Resend (USA) und Netzzugang und Schutz Cloudflare (USA und weltweite Netzwerkränder). Wer die Seite nutzt, versteht und akzeptiert das. Wenn du nicht möchtest, dass deine Frage so verarbeitet wird, reiche sie bitte nicht ein.",
      ],
    },
    es: {
      h: "5. Tratamiento transfronterizo",
      p: [
        "Nuestro servidor está en Japón; el procesamiento de IA lo realiza DeepSeek (China continental; los proveedores de respaldo SiliconFlow y Volcengine Ark también están en China continental), el pago Stripe (Estados Unidos y su infraestructura global), el envío de correos Resend (Estados Unidos), y el acceso a la red y la protección Cloudflare (Estados Unidos y red global). Usar el sitio significa que lo entiendes y lo aceptas. Si prefieres que tu pregunta no se trate así, no la envíes.",
      ],
    },
    pt: {
      h: "5. Transferência internacional de dados",
      p: [
        "Nosso servidor fica no Japão; o processamento de IA é feito pela DeepSeek (China continental; os provedores de reserva SiliconFlow e Volcengine Ark também ficam na China continental), o pagamento pela Stripe (Estados Unidos e sua infraestrutura global), o envio de e-mails pela Resend (Estados Unidos), e o acesso à rede e a proteção pela Cloudflare (Estados Unidos e rede global). Ao usar o site, você entende e aceita isso. Se preferir que a sua pergunta não seja tratada dessa forma, não a envie.",
      ],
    },
  },
  {
    zh: {
      h: "6. 联系",
      p: ["YaoFlow 由 Linedo LLC 经营（地址：312 W 2nd St, Unit A919, Casper, Wyoming 82601, USA），它是本政策所述个人数据的控制者。", "隐私相关的任何问题，请写信至 support@yaoflow.com。"],
    },
    en: {
      h: "6. Contact",
      p: ["YaoFlow is operated by Linedo LLC, 312 W 2nd St, Unit A919, Casper, Wyoming 82601, USA, which is the controller of the personal data described in this policy.", "For any privacy question, write to support@yaoflow.com."],
    },
    ja: {
      h: "6. お問い合わせ",
      p: ["YaoFlow は Linedo LLC（所在地：312 W 2nd St, Unit A919, Casper, Wyoming 82601, USA）が運営しており、本ポリシーに記載の個人データの管理者です。", "プライバシーに関するご質問は support@yaoflow.com までお寄せください。"],
    },
    ko: {
      h: "6. 문의",
      p: ["YaoFlow는 Linedo LLC(주소: 312 W 2nd St, Unit A919, Casper, Wyoming 82601, USA)가 운영하며, 본 방침에 기재된 개인정보의 관리자입니다.", "개인정보에 관한 문의는 support@yaoflow.com으로 보내 주세요."],
    },
    fr: {
      h: "6. Contact",
      p: ["YaoFlow est exploité par Linedo LLC, 312 W 2nd St, Unit A919, Casper, Wyoming 82601, USA, responsable du traitement des données personnelles décrites dans la présente politique.", "Pour toute question relative à la confidentialité, écrivez à support@yaoflow.com."],
    },
    de: {
      h: "6. Kontakt",
      p: ["YaoFlow wird betrieben von Linedo LLC, 312 W 2nd St, Unit A919, Casper, Wyoming 82601, USA; Linedo LLC ist Verantwortlicher für die in dieser Erklärung beschriebenen personenbezogenen Daten.", "Bei Fragen zum Datenschutz schreib an support@yaoflow.com."],
    },
    es: {
      h: "6. Contacto",
      p: ["YaoFlow es operado por Linedo LLC, 312 W 2nd St, Unit A919, Casper, Wyoming 82601, USA, responsable del tratamiento de los datos personales descritos en esta política.", "Para cualquier pregunta sobre privacidad, escribe a support@yaoflow.com."],
    },
    pt: {
      h: "6. Contato",
      p: ["O YaoFlow é operado pela Linedo LLC, 312 W 2nd St, Unit A919, Casper, Wyoming 82601, USA, controladora dos dados pessoais descritos nesta política.", "Para qualquer dúvida sobre privacidade, escreva para support@yaoflow.com."],
    },
  },
];

/**
 * 09-24 (Neil): Traditional Chinese Terms & Privacy are hand-written in
 * ./legal-hant.ts (台港 register) instead of converted from zh on the fly.
 * contentFor() prefers an explicit "zh-hant" entry over deepHant(zh).
 */
TERMS.forEach((s, i) => { s["zh-hant"] = TERMS_HANT[i]; });
PRIVACY.forEach((s, i) => { s["zh-hant"] = PRIVACY_HANT[i]; });
