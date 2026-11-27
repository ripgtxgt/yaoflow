import { describe, expect, it } from "vitest";
import { looksLikeReply } from "../src/lib/reply-like";

describe("接话式问题（09-26）", () => {
  it("recognises replies to the last reading, and leaves ordinary questions alone", () => {
    for (const q of ["所以我窒息感要給她知道？", "那就不用給他知道呀？", "你不是說今晚有時機", "還是他只在意工作 要什麼時候開口隨意聊", "So should I text him?", "But you said this week"]) expect(looksLikeReply(q), q).toBe(true);
    for (const q of ["公司年底前會組織變動嗎？", "我跟她的關係，什麼時間點把話說開比較適合？", "Will my ex come back?", "這份合約能簽下來嗎"]) expect(looksLikeReply(q), q).toBe(false);
  });
});
