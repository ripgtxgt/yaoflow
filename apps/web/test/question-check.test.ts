import { describe, expect, it } from "vitest";
import { matterKey, matterPrompt, parseVerdict, questionIssue } from "../src/lib/question-check";
import { cleanFraming } from "../src/lib/pairs";
import type { Locale } from "../src/lib/locales";

/**
 * 09-20, Neil: 「用户输入的根本不是问题」 — a reader in Japan typed 「ああ」,
 * the site cast, teased and delivered a whole reading on it. The rules layer
 * must refuse what a person refuses on sight, and must NOT refuse a single
 * real question: every wording below the line was typed by a real reader.
 */
describe("the question check — rules", () => {
  it("refuses a sigh, a repeated letter, and anything with no letters at all", () => {
    expect(questionIssue("ああ", "ja")).toBe("noise");
    expect(questionIssue("ああああ", "ja")).toBe("noise");
    expect(questionIssue("哈哈哈", "zh")).toBe("noise");
    expect(questionIssue("呵呵呵呵", "zh-hant")).toBe("noise");
    expect(questionIssue("aaaa", "en")).toBe("noise");
    expect(questionIssue("hahaha", "en")).toBe("noise");
    expect(questionIssue("ㅋㅋㅋ", "ko")).toBe("noise");
    expect(questionIssue("うんうん", "ja")).toBe("noise");
    expect(questionIssue("???", "en")).toBe("noise");
    expect(questionIssue("。。。", "zh")).toBe("noise");
    expect(questionIssue("12345", "en")).toBe("noise");
    expect(questionIssue("😂😂😂", "en")).toBe("noise");
    expect(questionIssue("asdf", "en")).toBe("noise");
    expect(questionIssue("qwerty qwerty", "en")).toBe("noise");
    expect(questionIssue("hjkl", "en")).toBe("noise");
  });

  it("treats fewer than two characters as the old empty gate did", () => {
    expect(questionIssue("", "zh")).toBe("empty");
    expect(questionIssue("   ", "zh")).toBe("empty");
    expect(questionIssue("我", "zh")).toBe("empty");
    expect(questionIssue("?", "en")).toBe("empty");
  });

  it("refuses greetings, test strings, and the request aimed at the site itself", () => {
    for (const [q, l] of [
      ["你好", "zh"], ["您好", "zh"], ["测试", "zh"], ["測試一下", "zh-hant"], ["随便", "zh"], ["帮我算一卦", "zh"], ["幫我算卦", "zh-hant"], ["算命", "zh"], ["在吗", "zh"], ["好吗", "zh"], ["没有", "zh"], ["是的", "zh"], ["他嗎", "zh-hant"],
      ["こんにちは", "ja"], ["テスト", "ja"], ["占ってください", "ja"], ["わからない", "ja"], ["はい", "ja"], ["そうだね", "ja"], ["何か", "ja"],
      ["안녕하세요", "ko"], ["테스트", "ko"], ["아니요", "ko"], ["점봐줘", "ko"], ["모르겠어요", "ko"],
      ["hi", "en"], ["hello there", "en"], ["test", "en"], ["Him", "en"], ["is it", "en"], ["ok thanks", "en"], ["read my fortune", "en"], ["idk", "en"],
      ["bonjour", "fr"], ["merci", "fr"], ["hallo", "de"], ["danke", "de"], ["hola", "es"], ["gracias", "es"], ["olá", "pt"], ["obrigado", "pt"], ["teste", "pt"],
    ] as [string, Locale][]) {
      expect(questionIssue(q, l), q).toBe("filler");
    }
  });

  it("lets every real question through, including the short and the vague ones", () => {
    const real: [string, Locale][] = [
      ["工作压力大", "zh"], ["怀孕了？", "zh"], ["该不该离开现在的公司", "zh"], ["我会拥有房子吗", "zh"], ["为什么心情不好", "zh"], ["我老公能赚大钱吗", "zh"], ["什么时候有小孩和房子", "zh"],
      ["他愛我嗎", "zh-hant"], ["他在乎我嗎", "zh-hant"], ["我長得怎麼樣", "zh-hant"], ["該不該放棄了", "zh-hant"], ["我們會復合嗎", "zh-hant"], ["這段關係的狀態", "zh-hant"], ["目前感情的發展", "zh-hant"],
      ["我早餐要喝奶茶嗎", "zh-hant"], ["今天1234567堂課我要上哪一堂", "zh-hant"], ["幾時有confirm的offer(s)?", "zh-hant"], ["This dynamic is ended?", "zh-hant"], ["Why I think that guy likes me?", "zh-hant"],
      ["點樣可以放低舊人", "zh-hant"], ["宋生而家會唔會諗起我？", "zh-hant"], ["依家份工好辛苦好想轉工，但出面市道都唔好", "zh-hant"], ["我想知我應唔應該再諗呢個人？", "zh-hant"], ["FXW 會追求我嗎", "zh-hant"], ["我該不該在放下K", "zh-hant"],
      ["工作", "zh"], ["搬家", "zh"], ["前任", "zh-hant"], ["考试能过吗", "zh"], ["钱吗", "zh"],
      ["元彼と復縁できますか", "ja"], ["転職すべきか", "ja"], ["かれはわたしをすきですか", "ja"], ["オファーは来る？", "ja"], ["彼女の気持ち", "ja"],
      ["전 남자친구와 재결합할 수 있을까요", "ko"], ["취업", "ko"], ["이직할까", "ko"], ["그 사람 마음", "ko"],
      ["Will my ex and I get back together?", "en"], ["should I change the job?", "en"], ["when can I pay off the debt", "en"], ["job", "en"], ["money", "en"], ["is she into me", "en"], ["what about the offer", "en"], ["exam", "en"],
      ["Kommen mein Ex und ich wieder zusammen?", "de"], ["Job wechseln?", "de"], ["¿Volveremos mi ex y yo?", "es"], ["trabajo", "es"], ["Eu e o meu ex vamos voltar?", "pt"], ["emprego", "pt"], ["Vais-je avoir ce poste ?", "fr"], ["mon ex", "fr"],
    ];
    for (const [q, l] of real) expect(questionIssue(q, l), q).toBeNull();
  });

  it("keys a verdict on the wording alone", () => {
    expect(matterKey("他愛我嗎？", "zh-hant")).toBe(matterKey("他愛我嗎", "zh-hant"));
    expect(matterKey("Will he text?", "en")).toBe(matterKey("will he text", "en"));
    expect(matterKey("x", "en")).not.toBe(matterKey("x", "fr"));
  });

  it("a joint-reading framing that names nothing falls back to the question the reading was made on", () => {
    expect(cleanFraming("ああ", "我們會復合嗎", "ja")).toBe("我們會復合嗎");
    expect(cleanFraming("test", "我們會復合嗎", "en")).toBe("我們會復合嗎");
    expect(cleanFraming("我們要不要復合", "x", "zh-hant")).toBe("我們要不要復合");
  });
});

describe("the question check — the model's word", () => {
  it("reads YES / NO and nothing else", () => {
    expect(parseVerdict("YES")).toBe("yes");
    expect(parseVerdict("yes.")).toBe("yes");
    expect(parseVerdict("NO")).toBe("no");
    expect(parseVerdict("No, this is a greeting.")).toBe("no");
    expect(parseVerdict("Answer: NO")).toBe("no");
    expect(parseVerdict("")).toBe("unsure");
    expect(parseVerdict("maybe")).toBe("unsure");
    expect(parseVerdict("YES or NO")).toBe("unsure");
  });

  it("asks for a matter, leans YES, and wants one word back", () => {
    const p = matterPrompt();
    expect(p).toMatch(/If in doubt, answer YES/);
    expect(p).toMatch(/exactly one word: YES or NO/);
    expect(p).toMatch(/aimed at the site itself/);
    expect(p).toMatch(/single topic word/);
  });
});
