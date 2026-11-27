import { describe, expect, it } from "vitest";
import { isCampaignTag, referrerTag } from "../src/lib/campaign";

describe("来源兜底：没有 ?c= 时按 referrer 的域名记来源（09-24 待定 11）", () => {
  it("maps the named platforms, marked with ~", () => {
    expect(referrerTag("https://www.pinterest.com/pin/123/")).toBe("~pinterest");
    expect(referrerTag("https://jp.pinterest.com/")).toBe("~pinterest");
    expect(referrerTag("https://pinterest.co.uk/")).toBe("~pinterest");
    expect(referrerTag("https://pin.it/abc")).toBe("~pinterest");
    expect(referrerTag("https://www.threads.net/@yaoflow")).toBe("~threads");
    expect(referrerTag("https://l.threads.com/?u=x")).toBe("~threads");
    expect(referrerTag("https://l.instagram.com/?u=x")).toBe("~ig");
    expect(referrerTag("https://lm.facebook.com/l.php?u=x")).toBe("~fbpage");
    expect(referrerTag("https://www.dcard.tw/f/talk/p/1")).toBe("~dcard");
    expect(referrerTag("https://www.quora.com/What-is")).toBe("~quora");
    expect(referrerTag("https://someone.pixnet.net/blog/post/1")).toBe("~pixnet");
  });
  it("other sites by domain only (never the path); nothing for ourselves, Stripe or junk", () => {
    expect(referrerTag("https://news.ycombinator.com/item?id=1")).toBe("~ref:news.ycombinator.com");
    expect(referrerTag("https://www.google.com/")).toBe("~ref:google.com");
    expect(referrerTag("https://yaoflow.com/en/cast")).toBeNull();
    expect(referrerTag("https://www.yaoflow.com/")).toBeNull();
    expect(referrerTag("https://checkout.stripe.com/c/pay/cs_x")).toBeNull();
    expect(referrerTag("http://127.0.0.1:3200/x", "127.0.0.1")).toBeNull();
    expect(referrerTag("")).toBeNull();
    expect(referrerTag("android-app://com.pinterest/")).toBeNull();
    expect(referrerTag("not a url")).toBeNull();
  });
  it("the API routes accept tagged, inferred and domain tags, and nothing else", () => {
    for (const ok of ["xhs", "x-ja", "~pinterest", "~ref:news.ycombinator.com"]) expect(isCampaignTag(ok), ok).toBe(true);
    for (const bad of ["", "~", "Pin", "~ref:", "a b", "~ref:x/y", "x".repeat(17), 3, null]) expect(isCampaignTag(bad), String(bad)).toBe(false);
  });
});
