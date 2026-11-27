import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { ERR_CAPTURE_SCRIPT, isNoiseClientError } from "../src/lib/err-capture";
import { POST as trackPOST } from "../src/app/api/track/route";
import { readEvents } from "../src/lib/analytics-server";

type Listener = (e: unknown) => void;
type Sent = { e: string; s: string; path: string; locale: string; method: string; msg: string };

/** Runs the <head> script against a stand-in window and returns whatever it would have POSTed to /api/track. */
function boot(host = "yaoflow.com", page?: { live: FakeDoc; server: FakeDoc; unreadable?: boolean }) {
  const listeners: Record<string, Listener[]> = {};
  const sent: Sent[] = [];
  const win: { addEventListener: (k: string, fn: Listener) => void; __yfUp?: number } = { addEventListener: (k: string, fn: Listener) => { (listeners[k] ??= []).push(fn); } };
  const location = { pathname: "/zh-hant/reading", host, href: `https://${host}/zh-hant/reading?sid=abc` };
  const fetched: string[] = [];
  const fetch = (url: string, init: { body?: string }) => {
    if (url === "/api/track") { sent.push(JSON.parse(init.body!)); return { catch() { /* noop */ } }; }
    fetched.push(url); // the page itself, re-read for the hydration diff
    if (page?.unreadable) return Promise.reject(new Error("offline"));
    return Promise.resolve({ text: () => Promise.resolve("<html>…</html>") });
  };
  const DOMParser = function () { return { parseFromString: () => page?.server ?? doc([]) }; };
  const store = new Map<string, string>();
  const sessionStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };
  // eslint-disable-next-line no-new-func
  new Function("window", "location", "fetch", "sessionStorage", "document", "DOMParser", ERR_CAPTURE_SCRIPT)(win, location, fetch, sessionStorage, page?.live ?? doc([]), DOMParser);
  const fire = (kind: string, e: unknown) => { for (const fn of listeners[kind] ?? []) fn(e); };
  const failed = (tagName: "SCRIPT" | "LINK", url: string) =>
    fire("error", { target: { tagName, src: tagName === "SCRIPT" ? url : "", href: tagName === "LINK" ? url : "" } });
  const thrown = (message: string, filename = "", lineno = 1, colno = 1) => fire("error", { message, filename, lineno, colno });
  const rejected = (reason: unknown) => fire("unhandledrejection", { reason });
  /** what PageView does on mount (10-05): the app is up on this document */
  const up = () => { win.__yfUp = Date.now(); };
  const element = (tagName: string, src: string) => fire("error", { target: { tagName, src, currentSrc: src } });
  return { sent, fetched, failed, thrown, rejected, up, element };
}

/** The little DOM the hydration probe looks at: body / header / main / footer and their children, plus document.scripts. */
type FakeEl = { tagName: string; className: string; id: string; children: FakeEl[]; src?: string };
type FakeDoc = { body: FakeEl; scripts: FakeEl[]; querySelector: (sel: string) => FakeEl | null };
const el = (tag: string, cls = "", children: FakeEl[] = [], id = ""): FakeEl => ({ tagName: tag.toUpperCase(), className: cls, id, children });
function doc(mainKids: FakeEl[], opts: { bodyExtra?: FakeEl[]; headerKids?: FakeEl[]; scripts?: string[] } = {}): FakeDoc {
  const header = el("header", "site-chrome", opts.headerKids ?? [el("a", "flex"), el("div", "flex")]);
  const main = el("main", "flex-1", mainKids);
  const footer = el("footer", "site-chrome", [el("nav", "flex")]);
  const scripts = ["https://yaoflow.com/_next/static/chunks/main-app.js", "https://static.cloudflareinsights.com/beacon.min.js/v31edd6df95cf", ...(opts.scripts ?? [])].map((src) => ({ ...el("script"), src }));
  const body = el("body", "min-h-screen", [el("script"), header, main, footer, ...(opts.bodyExtra ?? []), el("next-route-announcer"), ...scripts]);
  return { body, scripts, querySelector: (sel) => (sel === "main" ? main : sel === "header" ? header : sel === "footer" ? footer : null) };
}
const tick = () => new Promise((r) => setTimeout(r, 0));
/** 10-16: the hydration report now ends with the browser's language (and "translated" when it is) */
const noLang = (m: string) => m.replace(/ nl=\S+( translated)?( late)?$/, "");
const REACT_418 = "Error: Minified React error #418; visit https://react.dev/errors/418?args[]=HTML&args[]= for the full message or use the non-minified dev environment for full errors and additional helpful warnings.";

const BEACON = "https://static.cloudflareinsights.com/beacon.min.js/v31edd6df95cf4e85bb4c19e7a9bdbcba1788362987495";
const OUTLOOK = "Object Not Found Matching Id:5, MethodName:update, ParamCount:4";

/**
 * 10-02 evening (Neil: 「mandykong0420 页面报错 res:SCRIPT v31edd6df95cf」): the error reporter had logged a reader's
 * content blocker stopping Cloudflare's analytics beacon as a page error — 15 times in its first day. What is not
 * the page breaking is not reported; what is still is, and a third party's script is named with its host.
 */
/**
 * 10-05 (Neil: 「访客 kk4q 页面报错 res:SCRIPT 3176-862a0de4 / page-1021d938」): the share page's <Link> had started
 * prefetching the cast page's chunks; the tap that navigated cut them short and iPhone/WebKit reported the cancelled
 * loads as errors. Once the app is up on a document, our own file "failing" is that — not a broken page.
 */
describe("after the app is up, a cancelled load of our own file is not a page error", () => {
  it("kk4q: the cast page's chunks cut short by the tap on the share page — not reported", () => {
    const w = boot();
    w.up();
    w.failed("SCRIPT", "https://yaoflow.com/_next/static/chunks/3176-862a0de4322d4393.js");
    w.failed("SCRIPT", "https://yaoflow.com/_next/static/chunks/app/%5Blocale%5D/cast/page-1021d938267e8229.js");
    w.failed("LINK", "https://yaoflow.com/fonts/cjk/tc.css?v=37c6514cad");
    expect(w.sent).toEqual([]);
  });

  it("a third party failing after the app is up is still reported (Stripe.js going missing matters)", () => {
    const w = boot();
    w.up();
    w.failed("SCRIPT", "https://js.stripe.com/v3/");
    expect(w.sent.map((s) => s.msg)).toEqual(["SCRIPT js.stripe.com/v3"]);
  });

  it("before the app is up — the page never started — our own files are reported, as before", () => {
    const w = boot();
    w.failed("SCRIPT", "https://yaoflow.com/_next/static/chunks/webpack-5611fed0a89b5e.js");
    w.failed("SCRIPT", "https://yaoflow.com/_next/static/chunks/3176-862a0de4322d4393.js");
    // 10-16: the first also asks the page to reload itself once
    expect(w.sent.map((s) => s.msg)).toEqual(["SCRIPT webpack-5611fed0a89b5e.js →reload", "SCRIPT 3176-862a0de4322d4393.js"]);
  });
});

describe("the head error script: what it reports and what it leaves alone", () => {
  it("a blocked Cloudflare beacon is not a page error", () => {
    const w = boot();
    w.failed("SCRIPT", BEACON);
    w.failed("SCRIPT", "https://cloudflareinsights.com/beacon.min.js/v0000000000000000000000000000000000000000000000");
    expect(w.sent).toEqual([]);
  });

  it("10-28: a blocked Google Analytics script is not a page error either", () => {
    const w = boot();
    w.failed("SCRIPT", "https://www.googletagmanager.com/gtag/js?id=G-JD3RZN5P2R");
    w.failed("SCRIPT", "https://www.google-analytics.com/analytics.js");
    expect(w.sent).toEqual([]);
  });

  it("one of our own chunks failing to load is reported by file, as before", () => {
    const w = boot();
    w.failed("SCRIPT", "https://yaoflow.com/_next/static/chunks/3122-8d7f83bb442f8856.js");
    w.failed("LINK", "https://yaoflow.com/_next/static/css/83d99d8de139e1b5.css");
    expect(w.sent.map((s) => [s.e, s.method, s.msg])).toEqual([
      ["client_error", "res:SCRIPT 3122-8d7f83bb", "SCRIPT 3122-8d7f83bb442f8856.js →reload"], // 10-16
      ["client_error", "res:LINK 83d99d8de139e1b", "LINK 83d99d8de139e1b5.css"],
    ]);
    expect(w.sent[0].path).toBe("/zh-hant/reading");
    expect(w.sent[0].locale).toBe("zh-hant");
  });

  it("a third party's script is named with its host — Stripe.js failing is something to see", () => {
    const w = boot();
    w.failed("SCRIPT", "https://js.stripe.com/v3/");
    expect(w.sent.map((s) => s.msg)).toEqual(["SCRIPT js.stripe.com/v3"]);
  });

  it("an extension's own script (not http) is nobody's business", () => {
    const w = boot();
    w.failed("SCRIPT", "chrome-extension://abcdefghijklmnop/content.js");
    w.failed("SCRIPT", "");
    expect(w.sent).toEqual([]);
  });

  it("an opaque cross-origin 'Script error.' is dropped; a real error keeps its file:line:column", () => {
    const w = boot();
    w.thrown("Script error.");
    w.thrown("Script error");
    expect(w.sent).toEqual([]);
    w.thrown("Uncaught TypeError: x is not a function", "https://yaoflow.com/_next/static/chunks/app/page-abc.js?dpl=1", 1, 2345);
    expect(w.sent.map((s) => [s.method, s.msg])).toEqual([["js:Uncaught TypeError: x", "Uncaught TypeError: x is not a function @page-abc.js:1:2345"]]);
  });

  it("Outlook's rejection is dropped; a failed chunk import is reported with its name", () => {
    const w = boot();
    w.rejected(OUTLOOK);
    w.rejected(Object.assign(new Error("Object Not Found Matching Id:4, MethodName:update, ParamCount:4"), { name: "Error" }));
    expect(w.sent).toEqual([]);
    w.rejected(Object.assign(new Error("Loading chunk 138 failed."), { name: "ChunkLoadError" }));
    expect(w.sent.map((s) => [s.method, s.msg])).toEqual([["pr:ChunkLoadError: Loadi", "ChunkLoadError: Loading chunk 138 failed. →reload"]]);
  });

  it("still at most five a page, and the dropped ones do not use up the five", () => {
    const w = boot();
    for (let i = 0; i < 3; i++) w.failed("SCRIPT", BEACON);
    for (let i = 0; i < 7; i++) w.thrown(`Error number ${i}`, "https://yaoflow.com/x.js");
    expect(w.sent).toHaveLength(5);
    expect(w.sent[4].msg).toBe("Error number 4 @x.js:1:1");
  });

  it("stays plain ES5 without lookbehind (it must run on the browsers that fail)", () => {
    expect(ERR_CAPTURE_SCRIPT).not.toMatch(/=>|\bconst\b|\blet\b|`|\?\.|\?\?|\(\?<[!=]/);
  });
});

/**
 * 10-03 (Neil, the live board: 「linda522213 页面报错 js:Error: Minified React」): React #418 says the server HTML and
 * the first render disagreed, and production React never says where. The probe re-reads the page and reports the
 * container whose shallow shape differs, plus any script that is neither ours nor Cloudflare's.
 */
describe("a hydration mismatch (React #418) is reported with where the page differs", () => {
  it("names the container that differs — an element some in-app browser or extension put into body", async () => {
    const server = doc([el("div", "min-h-[70vh]")]);
    const live = doc([el("div", "cast-flow")], { bodyExtra: [el("div", "gtx-trans", [], "goog-gt-tt")], scripts: ["https://translate.googleapis.com/translate_a/element.js"] });
    const w = boot("yaoflow.com", { live, server });
    w.thrown(REACT_418, "https://yaoflow.com/_next/static/chunks/main-app.js", 1, 1);
    await tick(); await tick();
    expect(w.fetched).toEqual(["https://yaoflow.com/zh-hant/reading?sid=abc"]);
    expect(w.sent).toHaveLength(1);
    expect(w.sent[0].method).toBe("hy:React #418 HTML body ");
    expect(noLang(w.sent[0].msg)).toBe("React #418 HTML body S[header,main,footer] C[header,main,footer,div] main S[div.min-h-[70v] C[div.cast-flow] foreign[translate.googleapis.com]");
  });

  it("says so when the shallow shape is the same (the difference is deeper — text, most likely)", async () => {
    const same = doc([el("article", "reading")]);
    const w = boot("yaoflow.com", { live: same, server: doc([el("article", "reading")]) });
    w.thrown(REACT_418.replace("args[]=HTML", "args[]=text"));
    await tick(); await tick();
    expect(w.sent.map((s) => noLang(s.msg))).toEqual(["React #418 text same-shallow"]);
  });

  it("still reports the kind when the page cannot be re-read (offline, blocked)", async () => {
    const live = doc([el("div", "cast-flow")], { scripts: ["https://connect.facebook.net/en_US/pcm.js"] });
    const w = boot("yaoflow.com", { live, server: live, unreadable: true });
    w.thrown("Error: Minified React error #423; visit https://react.dev/errors/423 for the full message");
    await tick(); await tick();
    expect(w.sent.map((s) => noLang(s.msg))).toEqual(["React #423 nofetch foreign[connect.facebook.net]"]);
  });

  it("only those three React errors take this path; other React errors are reported as before", () => {
    const w = boot();
    w.thrown("Error: Minified React error #31; visit https://react.dev/errors/31?args[]=object", "https://yaoflow.com/_next/static/chunks/app.js", 2, 3);
    expect(w.sent.map((s) => s.method)).toEqual(["js:Error: Minified React"]);
  });
});

describe("api/track drops the same three for pages still running the morning's script", () => {
  it("the rule", () => {
    expect(isNoiseClientError("res:SCRIPT v31edd6df95cf", "SCRIPT v31edd6df95cf4e85bb4c19e7a9bdbcba1788362987495")).toBe(true);
    expect(isNoiseClientError("res:SCRIPT static.cloudf", "SCRIPT static.cloudflareinsights.com/v31edd6df95cf4e85bb4c19e7a9bdbcba1788362987495")).toBe(true);
    expect(isNoiseClientError("pr:Object Not Found Matc", OUTLOOK)).toBe(true);
    expect(isNoiseClientError("js:Script error.", "Script error.")).toBe(true);
    expect(isNoiseClientError("js:Script error.", undefined)).toBe(true);
    expect(isNoiseClientError("res:SCRIPT www.googletag", "SCRIPT www.googletagmanager.com/js?id=G-JD3RZN5P2R")).toBe(true); // 10-28
    // what stays
    expect(isNoiseClientError("res:SCRIPT 3122-8d7f83bb", "SCRIPT 3122-8d7f83bb442f8856.js")).toBe(false);
    expect(isNoiseClientError("res:SCRIPT js.stripe.com", "SCRIPT js.stripe.com/v3")).toBe(false);
    expect(isNoiseClientError("pr:Invalid regular expre", "SyntaxError: Invalid regular expression: invalid group specifier name")).toBe(false);
    expect(isNoiseClientError("js:Script error. @x.js:1", "Script error. @x.js:1:1")).toBe(false);
    expect(isNoiseClientError("cast:409", undefined)).toBe(false);
  });

  it("through the route: the beacon is answered ok but not recorded, a real error is", async () => {
    process.env.TRACK_ERROR_HOLD_MS = "0";
    const s = "errcap" + Date.now().toString(36).slice(-6);
    const post = (body: Record<string, unknown>) => trackPOST(new NextRequest("http://localhost/api/track", {
      method: "POST", headers: { "Content-Type": "application/json", "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36" },
      body: JSON.stringify(body),
    }));
    const a = await post({ e: "client_error", s, path: "/zh-hant/reading", locale: "zh-hant", method: "res:SCRIPT v31edd6df95cf", msg: "SCRIPT v31edd6df95cf4e85bb4c19e7a9bdbcba1788362987495" });
    expect(a.status).toBe(200);
    expect(await a.json()).toEqual({ ok: true });
    const b = await post({ e: "client_error", s, path: "/zh-hant/reading", locale: "zh-hant", method: "res:SCRIPT 3122-8d7f83bb", msg: "SCRIPT 3122-8d7f83bb442f8856.js" });
    expect(b.status).toBe(200);
    const mine = readEvents(1).filter((ev) => ev.s === s && ev.e === "client_error");
    expect(mine.map((ev) => ev.msg)).toEqual(["SCRIPT 3122-8d7f83bb442f8856.js"]);
    expect(mine[0].ua).toBe("Windows · Chrome 154");
  });
});

/**
 * 10-15 (Neil：「23:42:55 访客 ur5f 页面报错 js:?」): the share sheet's card preview <img> failed (the story route
 * died on a bad font, nginx 502). An image's error event has no message, so the board showed "js:?". Element loads
 * other than SCRIPT/LINK now say what failed — first-party too, even after the app is up (a broken card is real).
 */
describe("an image that fails to load says which image (not js:?)", () => {
  it("reports res:IMG with the path's tail, without the query, even after the app is up", () => {
    const w = boot();
    w.up();
    w.element("IMG", "https://yaoflow.com/api/share/889896/story?l=zh-hant&q=%E4%BB%96");
    w.element("IMG", "https://cdn.example.com/a/b.png");
    expect(w.sent.map((s) => s.msg)).toEqual(["IMG share/889896/story", "IMG cdn.example.com/a/b.png"]);
    expect(w.sent.every((s) => s.method.startsWith("res:IMG "))).toBe(true);
  });
  it("an element with no http source (data:, blob:, none) is not reported", () => {
    const w = boot();
    w.element("IMG", "data:image/png;base64,AAAA");
    w.element("VIDEO", "");
    expect(w.sent).toEqual([]);
  });
});

/** 10-16 (Neil: 「你得修复这些问题啊」): a page whose own scripts never arrived reloads itself once; two outside scripts are not ours to report. */
describe("10-16 reload and outside noise", () => {
  it("our chunk failing before the app is up: reported with →reload, once a minute at most", () => {
    const b = boot();
    b.failed("SCRIPT", "https://yaoflow.com/_next/static/chunks/main-app-43b498e5cbd2cb2d.js");
    b.failed("SCRIPT", "https://yaoflow.com/_next/static/chunks/page-61d03e80fb11e3d9.js");
    expect(b.sent[0]!.msg).toBe("SCRIPT main-app-43b498e5cbd2cb2d.js →reload");
    expect(b.sent[1]!.msg).toBe("SCRIPT page-61d03e80fb11e3d9.js"); // the second within the minute does not reload again
  });
  it("a ChunkLoadError later in the visit asks for a reload too", () => {
    const b = boot();
    b.up();
    b.rejected({ name: "ChunkLoadError", message: "Loading chunk 1386 failed." });
    expect(b.sent[0]!.msg).toBe("ChunkLoadError: Loading chunk 1386 failed. →reload");
  });
  it("Stripe's trusted-types helper and the in-app browsers' webkit bridge are not reported", () => {
    const b = boot();
    b.failed("SCRIPT", "https://js.stripe.com/trusted-types-checker-e80b3cae3b1db2e27d3062d4e7b03473.js");
    b.thrown("TypeError: undefined is not an object (evaluating 'window.webkit.messageHandlers')", "cast", 1, 1325);
    b.failed("SCRIPT", "https://js.stripe.com/v3/");
    expect(b.sent.map((x) => x.msg)).toEqual(["SCRIPT js.stripe.com/v3"]);
    expect(isNoiseClientError("js:TypeError: undefined", "TypeError: undefined is not an object (evaluating 'window.webkit.messageHandlers') @cast:1:1325")).toBe(true);
    expect(isNoiseClientError("res:SCRIPT js.stripe.com", "SCRIPT js.stripe.com/trusted-types-checker-e80b3cae3b1db2e27d3062d4e7b03473.js")).toBe(true);
  });
});
