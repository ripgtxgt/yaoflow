import { describe, expect, it } from "vitest";
import { _resetSendOnce, draftKey, REPLY_ONCE_MS, sendOnce, sentRecently } from "../src/lib/reply-once";

/**
 * 10-23 进度表 99 (客服 #510, 10-22 21:24): the back office sent the same reply twice. One letter per draft — a second tap
 * joins the send in flight; a resend of the same words within five minutes is refused by the row itself.
 */
describe("后台回信只发一次", () => {
  it("two taps on the same draft → one send; the second caller joins it", async () => {
    _resetSendOnce();
    let sends = 0;
    const send = () => new Promise<{ ok: boolean; id: string }>((res) => setTimeout(() => res({ ok: true, id: `re_${++sends}` }), 20));
    const k = draftKey("abcdef0123456789abcdef", "你好，\n已經處理好了。");
    const a = sendOnce(k, send);
    const b = sendOnce(k, send);
    expect(a.joined).toBe(false);
    expect(b.joined).toBe(true);
    expect(await a.result).toEqual({ ok: true, id: "re_1" });
    expect(await b.result).toEqual({ ok: true, id: "re_1" });
    expect(sends).toBe(1);
    // the finished send is remembered for the window: a third tap still joins it
    expect(sendOnce(k, send).joined).toBe(true);
    // different words → a different letter
    expect(sendOnce(draftKey("abcdef0123456789abcdef", "你好，\n另一封。"), send).joined).toBe(false);
    await new Promise((r) => setTimeout(r, 30));
    expect(sends).toBe(2);
  });

  it("a failed send is forgotten at once, so it can be tried again", async () => {
    _resetSendOnce();
    let n = 0;
    const send = async () => ({ ok: ++n === 1 ? false : true, id: `re_${n}` });
    const k = draftKey("abcdef0123456789abcdef", "第一次會失敗的那封信。");
    expect(await sendOnce(k, send).result).toMatchObject({ ok: false });
    const again = sendOnce(k, send);
    expect(again.joined).toBe(false);
    expect(await again.result).toMatchObject({ ok: true, id: "re_2" });
  });

  it("the row remembers: the same draft within five minutes is already sent; other words, an older send, or an automatic reply are not", () => {
    const now = Date.now();
    const row = { handled_at: now - 60_000, auto_draft: "你好，\r\n已經處理好了。\r\n", note: "Neil 从后台发出回信 Resend 01a1-x", auto_reply_id: "01a1-x" };
    expect(sentRecently(row, "你好，\n已經處理好了。", now)).toBe("01a1-x");
    expect(sentRecently(row, "你好，\n改了一個字。", now)).toBeNull();
    expect(sentRecently(row, "你好，\n已經處理好了。", now + REPLY_ONCE_MS + 1)).toBeNull();
    expect(sentRecently({ ...row, note: "自动处理" }, "你好，\n已經處理好了。", now)).toBeNull();
    expect(sentRecently({ ...row, handled_at: null }, "你好，\n已經處理好了。", now)).toBeNull();
  });
});
