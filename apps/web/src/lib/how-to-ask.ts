import { LOCALES, type Locale } from "./locales";
import { DE, ES, FR, KO, PT } from "./how-to-ask-more";

/**
 * 「怎麼問、怎麼看」 (进度表 23, 竞品观察 O14). A paying member (#838, 77 casts in three days) wrote on 09-30 asking
 * for exactly this: how to phrase a question, and what to do with a bad hexagram. Four parts — how to ask, what to
 * do when the hexagram is bad, when to ask again and when to stop, how to check — written in the reading's own
 * plain voice: short sentences, no jargon, no accuracy figures, no prices, and never the word AI. Traditional
 * Chinese is the original; the other eight are written by hand in how-to-ask-more.ts and below.
 */
export interface HowToAsk {
  title: string;
  metaTitle: string;
  /** the <head> description when it should differ from the lead on the page (10-02 进度表 27, 繁體) */
  metaDesc?: string;
  lead: string;
  ask: { h: string; rules: string[]; pairsLead: string; vague: string; specific: string; pairs: { topic: string; from: string; to: string }[]; after: string };
  bad: { h: string; intro: string[]; angles: { q: string; note: string }[]; after: string };
  again: { h: string; rules: string[] };
  check: { h: string; intro: string; steps: string[]; after: string };
  links: { cases: string; timing: string; glossary: string };
  /** the small links that bring people here */
  entry: { cast: string; followup: string; account: string; back: string };
}

const HANT: HowToAsk = {
  title: "六爻要怎麼問，卦不好要怎麼看",
  // 10-02 进度表 27: 卜卦 once in the head (lib/seo-head.ts); the page's own title and lead stay
  metaTitle: "卜卦怎麼問？六爻問事的問法與看法",
  metaDesc: "同一個卦，問法不同，能答的就不同。卜卦前先看這一頁：怎麼問、卦不好怎麼看、什麼時候再問、怎麼驗證。",
  lead: "同一個卦，問法不同，能答的就不同。這一頁講四件事：怎麼問、卦不好怎麼看、什麼時候再問、怎麼驗證。",
  ask: {
    h: "怎麼問",
    rules: [
      "一次只問一件事。兩件事擠在一句裡，卦不知道要答哪一件。",
      "把對象和期限說出來。有對象，卦才知道看誰；有期限，應期才有落點。",
      "問「會不會」「什麼時候」「該不該」，少問「為什麼」。卦看的是走向，不是動機。",
    ],
    pairsLead: "幾組對照，左邊是常見的問法，右邊是卦答得出來的問法：",
    vague: "模糊",
    specific: "具體",
    pairs: [
      { topic: "感情", from: "他到底怎麼想我？", to: "這個月內，他會主動聯絡我嗎？" },
      { topic: "感情", from: "我們還有沒有可能？", to: "年底前，我們會復合嗎？" },
      { topic: "感情", from: "這段感情該怎麼辦？", to: "我該在這個月跟他把話說清楚嗎？" },
      { topic: "工作", from: "我今年工作運怎樣？", to: "這份 offer，該接嗎？" },
      { topic: "工作", from: "該不該換工作？", to: "三個月內離職，下一份會比現在好嗎？" },
      { topic: "工作", from: "面試會過嗎？", to: "下週三這場面試，會拿到下一輪通知嗎？" },
      { topic: "財運", from: "今年財運好不好？", to: "這筆錢現在借出去，年底前拿得回來嗎？" },
      { topic: "財運", from: "要不要投資？", to: "這支股票，該在這個月出掉嗎？" },
      { topic: "學業", from: "我考得上嗎？", to: "明年二月這場考試，會過嗎？" },
      { topic: "學業", from: "該不該出國？", to: "明年秋天申請這個學程，會錄取嗎？" },
      { topic: "搬家", from: "要不要搬？", to: "年底前搬到那邊，住起來會順嗎？" },
      { topic: "決斷", from: "我該怎麼辦？", to: "A 和 B 只能選一個，選 A 這條路會順嗎？" },
    ],
    after: "還沒想清楚要問什麼，先不要急著搖。把事情寫成一句話，句子裡有人、有事、有時間，再開始。",
  },
  bad: {
    h: "卦不好，怎麼看",
    intro: [
      "卦不好，說的是這條路走下去會不順，不是判你有罪。同一件事，不只有一條路。",
      "這時候不用重新起卦。在同一份解讀下面用「追問」，換個角度問：",
    ],
    angles: [
      { q: "那我還能做什麼？", note: "卦裡通常已經寫了避什麼、盯什麼。先把這兩件問清楚。" },
      { q: "換一條路呢？", note: "不做、等一等、換個做法——各是什麼局面，可以逐一問。" },
      { q: "這件事對我真正的影響是什麼？", note: "很多時候卦說的「不順」，只是某一段不順，不是全盤。" },
    ],
    after: "這三個角度都在同一份解讀裡問，因為卦沒有變，變的是你看它的角度。重新起卦問同一件事，只會得到另一個不一定更好的卦。",
  },
  again: {
    h: "什麼時候再問，什麼時候停",
    rules: [
      "同一件事，一天一卦。今天問過了，卦已經答了，先去做那一步。",
      "換一種問法，卦不會換答案。「他會回來嗎」和「我們還有機會嗎」是同一件事。",
      "有新進展再問。他真的回了訊息、offer 真的來了——這時候在解讀頁「記一筆進展」，或者為新局面再起一卦。",
      "應期到了，先對一次。卦說十月中旬有動靜，就等到十月中旬，看有沒有，再決定要不要再問。",
      "什麼時候停：卦連續兩次都說「先別動」，而你只是想聽到「動」——那就停。答案已經有了。",
    ],
  },
  check: {
    h: "怎麼驗證",
    intro: "卦準不準，不用我們說，你自己對。三個動作：",
    steps: [
      "應期到了，我們會寄一封信問你：那件事，怎麼樣了。點一下就好。",
      "你的每一個回答都進「我的應驗記錄」——說中、部分對上、沒發生，一條不刪。",
      "公開卦例裡是別人的卦：問了什麼類型、卦怎麼說、應期過後怎麼樣了。可以先看，再問自己的。",
    ],
    after: "對過幾次，你就會知道卦在你這裡是怎麼回事。這比任何數字都可靠。",
  },
  links: { cases: "看看別人怎麼問（公開卦例）", timing: "應期是怎麼推出來的", glossary: "六爻術語對照" },
  entry: { cast: "不知道怎麼問？看這一頁", followup: "卦不好？換三個角度再問", account: "怎麼問、怎麼看", back: "六爻要怎麼問，卦不好要怎麼看" },
};

const HANS: HowToAsk = {
  title: "六爻要怎么问，卦不好要怎么看",
  metaTitle: "六爻要怎么问才问得准？卦不好怎么看、什么时候再问",
  lead: "同一个卦，问法不同，能答的就不同。这一页讲四件事：怎么问、卦不好怎么看、什么时候再问、怎么验证。",
  ask: {
    h: "怎么问",
    rules: [
      "一次只问一件事。两件事挤在一句里，卦不知道要答哪一件。",
      "把对象和期限说出来。有对象，卦才知道看谁；有期限，应期才有落点。",
      "问「会不会」「什么时候」「该不该」，少问「为什么」。卦看的是走向，不是动机。",
    ],
    pairsLead: "几组对照，左边是常见的问法，右边是卦答得出来的问法：",
    vague: "模糊",
    specific: "具体",
    pairs: [
      { topic: "感情", from: "他到底怎么想我？", to: "这个月内，他会主动联系我吗？" },
      { topic: "感情", from: "我们还有没有可能？", to: "年底前，我们会复合吗？" },
      { topic: "感情", from: "这段感情该怎么办？", to: "我该在这个月跟他把话说清楚吗？" },
      { topic: "工作", from: "我今年工作运怎样？", to: "这份 offer，该接吗？" },
      { topic: "工作", from: "该不该换工作？", to: "三个月内离职，下一份会比现在好吗？" },
      { topic: "工作", from: "面试会过吗？", to: "下周三这场面试，会拿到下一轮通知吗？" },
      { topic: "财运", from: "今年财运好不好？", to: "这笔钱现在借出去，年底前拿得回来吗？" },
      { topic: "财运", from: "要不要投资？", to: "这支股票，该在这个月出掉吗？" },
      { topic: "学业", from: "我考得上吗？", to: "明年二月这场考试，会过吗？" },
      { topic: "学业", from: "该不该出国？", to: "明年秋天申请这个项目，会录取吗？" },
      { topic: "搬家", from: "要不要搬？", to: "年底前搬到那边，住起来会顺吗？" },
      { topic: "决断", from: "我该怎么办？", to: "A 和 B 只能选一个，选 A 这条路会顺吗？" },
    ],
    after: "还没想清楚要问什么，先不要急着摇。把事情写成一句话，句子里有人、有事、有时间，再开始。",
  },
  bad: {
    h: "卦不好，怎么看",
    intro: [
      "卦不好，说的是这条路走下去会不顺，不是判你有罪。同一件事，不只有一条路。",
      "这时候不用重新起卦。在同一份解读下面用「追问」，换个角度问：",
    ],
    angles: [
      { q: "那我还能做什么？", note: "卦里通常已经写了避什么、盯什么。先把这两件问清楚。" },
      { q: "换一条路呢？", note: "不做、等一等、换个做法——各是什么局面，可以逐一问。" },
      { q: "这件事对我真正的影响是什么？", note: "很多时候卦说的「不顺」，只是某一段不顺，不是全盘。" },
    ],
    after: "这三个角度都在同一份解读里问，因为卦没有变，变的是你看它的角度。重新起卦问同一件事，只会得到另一个不一定更好的卦。",
  },
  again: {
    h: "什么时候再问，什么时候停",
    rules: [
      "同一件事，一天一卦。今天问过了，卦已经答了，先去做那一步。",
      "换一种问法，卦不会换答案。「他会回来吗」和「我们还有机会吗」是同一件事。",
      "有新进展再问。他真的回了消息、offer 真的来了——这时候在解读页「记一笔进展」，或者为新局面再起一卦。",
      "应期到了，先对一次。卦说十月中旬有动静，就等到十月中旬，看有没有，再决定要不要再问。",
      "什么时候停：卦连续两次都说「先别动」，而你只是想听到「动」——那就停。答案已经有了。",
    ],
  },
  check: {
    h: "怎么验证",
    intro: "卦准不准，不用我们说，你自己对。三个动作：",
    steps: [
      "应期到了，我们会寄一封信问你：那件事，怎么样了。点一下就好。",
      "你的每一个回答都进「我的应验记录」——说中、部分对上、没发生，一条不删。",
      "公开卦例里是别人的卦：问了什么类型、卦怎么说、应期过后怎么样了。可以先看，再问自己的。",
    ],
    after: "对过几次，你就会知道卦在你这里是怎么回事。这比任何数字都可靠。",
  },
  links: { cases: "看看别人怎么问（公开卦例）", timing: "应期是怎么推出来的", glossary: "六爻术语对照" },
  entry: { cast: "不知道怎么问？看这一页", followup: "卦不好？换三个角度再问", account: "怎么问、怎么看", back: "六爻要怎么问，卦不好要怎么看" },
};

const EN: HowToAsk = {
  title: "How to ask, and what to do with a bad hexagram",
  metaTitle: "How to ask the I Ching a question that gets answered — and what to do when the hexagram is bad",
  lead: "The same hexagram answers a different question differently. Four things on this page: how to ask, what to do when the hexagram is bad, when to ask again, and how to check.",
  ask: {
    h: "How to ask",
    rules: [
      "One matter per question. Two matters in one sentence, and the hexagram does not know which to answer.",
      "Name the person and the time frame. With a person, the hexagram knows whom to look at; with a time frame, the date it gives has somewhere to land.",
      "Ask “will it”, “when”, “should I” — rarely “why”. A hexagram reads where things are heading, not motives.",
    ],
    pairsLead: "A few pairs — on the left, how people usually ask; on the right, how a hexagram can answer:",
    vague: "Vague",
    specific: "Specific",
    pairs: [
      { topic: "Love", from: "What does he really think of me?", to: "Will he reach out to me within this month?" },
      { topic: "Love", from: "Is there still a chance for us?", to: "Will we get back together before the end of the year?" },
      { topic: "Love", from: "What should I do about this relationship?", to: "Should I have the talk with him this month?" },
      { topic: "Work", from: "How is my career this year?", to: "Should I take this offer?" },
      { topic: "Work", from: "Should I change jobs?", to: "If I leave within three months, will the next job be better than this one?" },
      { topic: "Work", from: "Will the interview go well?", to: "Will next Wednesday’s interview lead to a next round?" },
      { topic: "Money", from: "Is my luck with money good this year?", to: "If I lend this money now, will I get it back by year end?" },
      { topic: "Money", from: "Should I invest?", to: "Should I sell this stock this month?" },
      { topic: "Study", from: "Will I pass?", to: "Will I pass the exam this February?" },
      { topic: "Study", from: "Should I go abroad?", to: "If I apply to this program next autumn, will I be admitted?" },
      { topic: "Moving", from: "Should I move?", to: "If I move there before the end of the year, will living there go smoothly?" },
      { topic: "A decision", from: "What should I do?", to: "It is A or B — will the road go smoothly if I choose A?" },
    ],
    after: "If you have not yet worked out what you are asking, do not rush to throw. Write the matter as one sentence — a person, a thing, a time — and then begin.",
  },
  bad: {
    h: "When the hexagram is bad",
    intro: [
      "A bad hexagram says this road will be rough if you keep walking it. It is not a sentence passed on you. One matter has more than one road.",
      "Do not cast again. Under the same reading, use the follow-up box and ask from another angle:",
    ],
    angles: [
      { q: "Then what can I still do?", note: "The reading usually already says what to avoid and what to watch. Ask about those two first." },
      { q: "What about another road?", note: "Not doing it, waiting, doing it differently — ask what each one looks like, one at a time." },
      { q: "What does this really change for me?", note: "Often the “rough” the hexagram means is one stretch, not the whole picture." },
    ],
    after: "All three angles are asked inside the same reading, because the hexagram has not changed — only the angle you look from. Casting again on the same matter only gets you another hexagram, not necessarily a better one.",
  },
  again: {
    h: "When to ask again, and when to stop",
    rules: [
      "One matter, one cast a day. You asked today; the hexagram has answered; go and take that step.",
      "Rewording the question does not change the answer. “Will he come back” and “is there still a chance for us” are the same matter.",
      "Ask again when something has actually happened. He really did write back, the offer really did come — then add a progress note on the reading page, or cast for the new situation.",
      "When the date arrives, check first. If the hexagram said mid-October, wait for mid-October, see what happened, and only then decide whether to ask again.",
      "When to stop: the hexagram has said “don’t move yet” twice, and you only want to hear “move” — stop. The answer is already there.",
    ],
  },
  check: {
    h: "How to check",
    intro: "Whether a hexagram was right is for you to see, not for us to say. Three actions:",
    steps: [
      "When the date arrives, we send you one email: how did that matter turn out? One tap answers it.",
      "Every answer goes into your own record — came true, partly, did not happen — and none is ever removed.",
      "The public cases are other people’s hexagrams: what kind of question, what the hexagram said, what happened after the date. You can read those first, then ask your own.",
    ],
    after: "After checking a few times, you will know for yourself how hexagrams work out for you. That is worth more than any number.",
  },
  links: { cases: "See how others ask (public cases)", timing: "Where the date in a reading comes from", glossary: "Glossary of terms" },
  entry: { cast: "Not sure how to ask? Read this", followup: "Bad hexagram? Three other angles to ask from", account: "How to ask, how to read", back: "How to ask, and what to do with a bad hexagram" },
};

const JA: HowToAsk = {
  title: "易の問い方と、卦が悪いときの見方",
  metaTitle: "易占いはどう問えば答えが出るのか——卦が悪いときの見方、また問うタイミング",
  lead: "同じ卦でも、問い方が違えば答えられることが変わります。このページでは四つのことをお話しします：どう問うか、卦が悪いときにどう見るか、いつまた問うか、どう確かめるか。",
  ask: {
    h: "どう問うか",
    rules: [
      "一問一答。一度にひとつのことだけ。ふたつを一文に詰めると、卦はどちらに答えるべきか分かりません。",
      "相手と期限を言葉にします。相手がいれば卦は誰を見るか分かり、期限があれば応期（時期の目安）に着地点ができます。",
      "「〜なりますか」「いつ」「〜すべきか」と問い、「なぜ」はなるべく避けます。卦が見るのは流れであって、動機ではありません。",
    ],
    pairsLead: "いくつか並べます。左はよくある問い方、右は卦が答えられる問い方です：",
    vague: "あいまい",
    specific: "具体的",
    pairs: [
      { topic: "恋愛", from: "彼は私のことをどう思っている？", to: "今月中に、彼から連絡は来ますか？" },
      { topic: "恋愛", from: "私たちにまだ可能性はある？", to: "年内に、復縁しますか？" },
      { topic: "恋愛", from: "この関係、どうすればいい？", to: "今月、彼にはっきり話すべきですか？" },
      { topic: "仕事", from: "今年の仕事運は？", to: "この内定、受けるべきですか？" },
      { topic: "仕事", from: "転職すべき？", to: "三か月以内に辞めたら、次の職場は今より良くなりますか？" },
      { topic: "仕事", from: "面接はうまくいく？", to: "来週水曜の面接、次の連絡は来ますか？" },
      { topic: "お金", from: "今年の金運はいい？", to: "このお金を今貸したら、年内に戻ってきますか？" },
      { topic: "お金", from: "投資すべき？", to: "この株、今月手放すべきですか？" },
      { topic: "学業", from: "受かる？", to: "来年二月の試験に向けた準備は、実る時期に入っていますか？" },
      { topic: "学業", from: "留学すべき？", to: "来年秋にこの課程へ出願したら、道は開けますか？" },
      { topic: "引っ越し", from: "引っ越すべき？", to: "年内にあちらへ移ったら、暮らしは落ち着きますか？" },
      { topic: "決断", from: "どうすればいい？", to: "A か B のどちらか——A を選んだ道は、順調に進みますか？" },
    ],
    after: "何を問うかまだ決まっていないなら、急いで振らないでください。相手・こと・時期が入った一文に書けてから、始めましょう。",
  },
  bad: {
    h: "卦が悪いとき、どう見るか",
    intro: [
      "悪い卦は、この道をこのまま進むと難しい、と言っているだけです。あなたへの判決ではありません。ひとつのことに、道はひとつではありません。",
      "ここで卦を立て直す必要はありません。同じ鑑定の下にある「追加質問」で、角度を変えて問います：",
    ],
    angles: [
      { q: "それでも、私にできることは？", note: "鑑定にはたいてい、避けること・見ておくことが書いてあります。まずその二つを確かめます。" },
      { q: "別の道なら？", note: "やらない、待つ、やり方を変える——それぞれどんな局面になるか、ひとつずつ問えます。" },
      { q: "このことは、私に本当は何をもたらす？", note: "卦の言う「難しい」は、ある一区間のことで、全体ではないことが多いのです。" },
    ],
    after: "三つの角度はどれも同じ鑑定の中で問います。卦は変わっておらず、変わるのはあなたの見る角度だからです。同じことで卦を立て直しても、別の卦が出るだけで、良くなるとは限りません。",
  },
  again: {
    h: "いつまた問うか、いつ止めるか",
    rules: [
      "同じことは、一日に一卦。今日問えば、卦はもう答えています。まずその一歩を。",
      "問い方を変えても、答えは変わりません。「彼は戻ってくる？」と「私たちにまだ可能性は？」は同じことです。",
      "動きがあったら、また問う。本当に返事が来た、本当に内定が出た——そのときは鑑定ページの「経過を記す」に書くか、新しい局面で一卦を立てます。",
      "応期が来たら、まず照らし合わせる。卦が十月中旬頃と言ったら、十月中旬まで待って、どうなったかを見てから、また問うかを決めます。",
      "止めるとき：卦が二度続けて「まだ動かない」と言い、あなたは「動く」と聞きたいだけ——そのときは止めます。答えはもう出ています。",
    ],
  },
  check: {
    h: "どう確かめるか",
    intro: "卦がその通りになったかどうかは、私たちが言うことではなく、あなたが照らし合わせることです。三つの動作：",
    steps: [
      "応期が過ぎたら、こちらから一通お尋ねします：あのことは、その後どうなりましたか。ワンタップで答えられます。",
      "答えはすべてあなたの「的中記録」に残ります——その通り、一部その通り、起きなかった。一件も消しません。",
      "公開卦例は、ほかの人の卦です。どんな種類の問いで、卦は何と言い、応期の後どうなったか。先に読んでから、自分のことを問えます。",
    ],
    after: "何度か照らし合わせれば、卦があなたのところでどう働くか、自分で分かってきます。それはどんな数字よりも確かです。",
  },
  links: { cases: "ほかの人の問い方を見る（公開卦例）", timing: "応期はどこから来るのか", glossary: "六爻の用語集" },
  entry: { cast: "どう問えばいいか迷ったら、このページ", followup: "卦が悪い？三つの角度で問い直す", account: "問い方と見方", back: "易の問い方と、卦が悪いときの見方" },
};

const DATA: Record<Locale, HowToAsk> = { "zh-hant": HANT, zh: HANS, en: EN, ja: JA, ko: KO, fr: FR, de: DE, es: ES, pt: PT };

/** Traditional Chinese is the original; every language has its own version (09-30, Neil: 「所有的语言版本都上吧」). */
export const howToAskFor = (l: Locale): HowToAsk => DATA[l];
export const HOW_TO_ASK_LOCALES: readonly Locale[] = LOCALES;
export const HOW_TO_ASK_DATE = new Date("2026-09-30");
