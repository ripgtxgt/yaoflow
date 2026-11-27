import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { checkEmail, confirmEmailAsTyped, emailNeedsAttention, emailTypoPending, normalizeEmail, suggestEmail } from "../src/lib/email-check";

describe("邮箱校对（09-26）", () => {
  it("catches the typos actually seen in the customer table", () => {
    expect(suggestEmail("amy@gamil.com")).toBe("amy@gmail.com");
    expect(suggestEmail("amy@gmaol.com")).toBe("amy@gmail.com");
    expect(suggestEmail("amy@gmail.comu")).toBe("amy@gmail.com");
    expect(suggestEmail("amy@hotmail.con")).toBe("amy@hotmail.com");
    expect(suggestEmail("amy@hitmaik.com")).toBe("amy@hotmail.com");
    expect(suggestEmail("amy@mail.nknu.edu-tw")).toBe("amy@mail.nknu.edu.tw");
    expect(suggestEmail("amy@yahoo.com.te")).toBe("amy@yahoo.com.tw");
  });

  it("leaves real domains alone — including ones close to each other", () => {
    for (const e of ["a@gmail.com", "a@126.com", "a@163.com", "a@kimo.com", "a@zelnro.com", "a@ms25.hinet.net", "a@gm.pu.edu.tw", "a@linedo.io", "a@gold.ac.uk", "a@taipower.com.tw", "a@yahoo.com.hk", "a@duck.com", "a@naver.com"]) {
      expect(suggestEmail(e), e).toBeNull();
      expect(checkEmail(e).ok, e).toBe(true);
    }
  });

  it("normalises what an IME types", () => {
    expect(normalizeEmail(" Amy＠Gmail。com ")).toBe("amy@gmail.com");
    expect(checkEmail("amy＠gmail．com").ok).toBe(true);
  });

  it("rejects a broken shape", () => {
    for (const e of ["amy", "amy@", "amy@gmail", "amy@@gmail.com", "amy@gmail..com", ".amy@gmail.com"]) {
      expect(checkEmail(e).ok, e).toBe(false);
    }
  });

  it("10-23 emailTypoPending: true exactly while the 「是不是 …？」 line shows — a wrong shape is not its business", () => {
    expect(emailTypoPending("cara@gmail.con")).toBe(true);
    expect(emailTypoPending("cara@icloud.con")).toBe(true);
    expect(emailTypoPending("cara@gmail.com")).toBe(false);
    expect(emailTypoPending("cara@gmail")).toBe(false); // not finished: the hint is quiet, the form judges the shape
    expect(emailTypoPending("")).toBe(false);
    confirmEmailAsTyped("cara@gmail.con");
    expect(emailTypoPending("cara@gmail.con")).toBe(false);
  });

  it("lets a confirmed typo through, once the reader says it is right", () => {
    expect(emailNeedsAttention("bob@gmial.com")).toBe(true);
    confirmEmailAsTyped("bob@gmial.com");
    expect(emailNeedsAttention("bob@gmial.com")).toBe(false);
  });

  it("uses no lookbehind (runs in the browser)", () => {
    expect(readFileSync(new URL("../src/lib/email-check.ts", import.meta.url), "utf8")).not.toMatch(/\(\?<[=!]/);
  });
});
