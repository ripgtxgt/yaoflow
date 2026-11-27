import { describe, expect, it } from "vitest";
import { classifyTopic } from "../src/lib/topic";
import { questionScale } from "../src/lib/timing";

/** A question in any of the nine languages must land on the same deterministic topic and time scale. */
describe("topic keywords beyond zh/en", () => {
  it("career", () => {
    expect(classifyTopic("今の会社を辞めて転職すべきでしょうか")).toBe("career");
    expect(classifyTopic("이번에 승진할 수 있을까요")).toBe("career");
    expect(classifyTopic("Vais-je obtenir cette promotion ?")).toBe("career");
    expect(classifyTopic("Bekomme ich den Job nach dem Vorstellungsgespräch?")).toBe("career");
    expect(classifyTopic("¿Me darán el puesto después de la entrevista?")).toBe("career");
    expect(classifyTopic("Vou conseguir o emprego?")).toBe("career");
  });
  it("relationship", () => {
    expect(classifyTopic("彼女と復縁できますか")).toBe("relationship");
    expect(classifyTopic("헤어진 남자친구와 재회할 수 있을까요")).toBe("relationship");
    expect(classifyTopic("Est-ce qu'on peut se remettre ensemble, mon ex et moi ?")).toBe("relationship");
    expect(classifyTopic("Hat unsere Beziehung noch eine Zukunft?")).toBe("relationship");
    expect(classifyTopic("¿Volveré con mi ex?")).toBe("relationship");
    expect(classifyTopic("Meu namoro vai dar certo?")).toBe("relationship");
  });
  it("money / health / study / decision", () => {
    expect(classifyTopic("投資した株は上がりますか")).toBe("money");
    expect(classifyTopic("대출을 받아도 될까요")).toBe("money");
    expect(classifyTopic("Dois-je vendre mes actions ?")).toBe("money");
    expect(classifyTopic("Werde ich wieder gesund?")).toBe("health");
    expect(classifyTopic("¿Aprobaré el examen de la universidad?")).toBe("study");
    expect(classifyTopic("Devo me mudar para outra cidade?")).toBe("decision");
  });
});

describe("time-scale keywords beyond zh/en", () => {
  it("now", () => {
    expect(questionScale("今日の商談はうまくいきますか")).toBe("now");
    expect(questionScale("오늘 저녁 약속에 가도 될까요")).toBe("now");
    expect(questionScale("Est-ce que je dois y aller ce soir ?")).toBe("now");
    expect(questionScale("Soll ich ihn heute anrufen?")).toBe("now");
    expect(questionScale("¿Cierro la venta esta tarde?")).toBe("now");
    expect(questionScale("Consigo fechar a venda hoje à tarde?")).toBe("now");
  });
  it("day beats now, and 'this morning' is not 'tomorrow'", () => {
    expect(questionScale("明日の面接はうまくいきますか")).toBe("day");
    expect(questionScale("내일 면접 잘 볼 수 있을까요")).toBe("day");
    expect(questionScale("Mon entretien de demain va-t-il bien se passer ?")).toBe("day");
    expect(questionScale("Klappt das Gespräch morgen?")).toBe("day");
    expect(questionScale("Wie läuft es heute Morgen?")).toBe("now");
    expect(questionScale("¿Me irá bien mañana?")).toBe("day");
    expect(questionScale("¿Cómo me irá esta mañana?")).toBe("now");
    expect(questionScale("A reunião de amanhã vai correr bem?")).toBe("day");
  });
  it("choose and long", () => {
    expect(questionScale("いつ起業するのがいいですか")).toBe("choose");
    expect(questionScale("언제 가게를 열면 좋을까요")).toBe("choose");
    expect(questionScale("Quel est le meilleur moment pour lancer mon produit ?")).toBe("choose");
    expect(questionScale("Wann sollte ich kündigen?")).toBe("choose");
    expect(questionScale("¿Cuándo debería mudarme?")).toBe("choose");
    expect(questionScale("Qual é o melhor momento para vender a casa?")).toBe("choose");
    expect(questionScale("海外に移住したいのですが、うまくいきますか")).toBe("long");
    expect(questionScale("내년에 결혼할 수 있을까요")).toBe("long");
    expect(questionScale("Est-ce que je vais me marier un jour ?")).toBe("long");
    expect(questionScale("Soll ich nächstes Jahr nach Kanada auswandern?")).toBe("long");
    expect(questionScale("¿Lograré comprar una casa?")).toBe("long");
    expect(questionScale("Vou conseguir emigrar para Portugal?")).toBe("long");
  });
});
