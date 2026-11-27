/**
 * 10-02 (a reader on iOS 16.2 in the Threads browser got 「Application error」 on the cast page; we saw it only because
 * she had come through the home page first). Errors used to be caught by PageView — a React component, which never
 * mounts when the page's own script fails to load or to run, i.e. exactly when it matters most. This tiny script
 * goes in <head> as is, ahead of every chunk, and reports for the page's whole life:
 *   js:  an uncaught error (message, and the file:line:column it came from)
 *   pr:  an unhandled promise rejection (a failed chunk import shows up here)
 *   res: a script or stylesheet that failed to load (an old chunk after a deploy, a blocked CDN) — one of ours is
 *        named by file ("SCRIPT 3122-8d7f83bb442f8856.js"), a third party's with its host ("SCRIPT js.stripe.com/v3")
 * At most five a page. Same session tag as every other event; never anything the reader typed. Kept ES5 — it has
 * to run on the browsers that fail.
 *
 * 10-02 evening (Neil: 「mandykong0420 页面报错 res:SCRIPT v31edd6df95cf」). Three things that are not the page
 * breaking, and that nothing on our side can change, are not reported:
 *   · Cloudflare's own analytics beacon — static.cloudflareinsights.com/beacon.min.js/v<hash><ms>, which the edge
 *     injects into every HTML response — failing to load. That is a content blocker (uBlock, AdGuard, Brave, an iOS
 *     blocker, a filtering DNS) at work; the page is unaffected. The first day of this script logged 15 of them
 *     across Windows Chrome, iOS Safari and Android Threads, every page fine. Any non-http(s) URL (an extension's
 *     own script) is skipped for the same reason.
 *   · "Script error." with no file: an opaque error from a cross-origin script we did not load (extensions, in-app
 *     browser injections) — the browser hides everything about it on purpose.
 *   · "Object Not Found Matching Id:N, MethodName:update, ParamCount:4": Microsoft Outlook's link protection
 *     talking to itself inside the page it opened.
 * api/track drops the same three (isNoiseClientError) for pages that still run the morning's script.
 *
 * 10-05 (Neil: 「访客 kk4q 页面报错 res:SCRIPT 3176-862a0de4 / page-1021d938」): one of OUR files "failing" once the app
 * is already up on this document (PageView sets window.__yfUp on mount) is a load the browser cancelled — the share
 * page's <Link> had started prefetching the cast page's chunks and the tap that navigated cut them short; iPhone/WebKit
 * reports a cancelled script load as an error. Three days, 25 such reports: all iPhone (Safari, Threads, LINE, iOS
 * Chrome), the files current and served 200, and every navigating visitor landed on the next page and carried on. So
 * after the app is up, only a third party's failure is reported (Stripe.js going missing matters); before it is up —
 * the page never started — our own files are reported as before. A lazy chunk that really fails mid-session still
 * reports itself, as pr: ChunkLoadError or through the error page.
 *
 * 10-03 (Neil, the live board: 「linda522213 页面报错 js:Error: Minified React」). React #418 — the server's HTML and the
 * browser's first render disagree, React throws the server markup away and renders again; the page works, slower.
 * Ten in four days, on the cast page mostly, from Threads (iOS and Android), WeChat, Chrome, Safari; not reproducible
 * in a clean browser. Production React says only "#418 HTML" or "#418 text", never where. So on that error the
 * script fetches the page's HTML once more and compares the shallow shape — the children of body / header / footer,
 * main's with class — against the live DOM, and reports which container differs and how, plus any script on the
 * page that is neither ours nor Cloudflare's (an in-app browser's or an extension's injection). "hy:" kind; the
 * reader's words are never in it (tags and class names only).
 *
 * 10-16 (Neil, on the board: 「你得修复这些问题啊」):
 *   · A file of OURS that fails before the app is up (the page never started: a dropped connection, a chunk timing
 *     out — 「ChunkLoadError … timeout」, one macOS Chrome losing every script of a hexagram page at once) and a
 *     ChunkLoadError later in the visit now reload the page once, after 1.5 s, if the tab is still on that page and
 *     visible — the reader gets a working page instead of a dead one. At most once a minute per tab (sessionStorage),
 *     so a page that truly cannot load is not reloaded in a loop. The report says "→reload".
 *   · Not reported (nothing of ours, nothing we can change; the page is unaffected): Stripe's own helper
 *     js.stripe.com/trusted-types-checker failing (stripe.js itself still loads, or the checkout falls back to the
 *     ordinary page), and Threads' / Facebook's in-app browser scripts calling window.webkit.messageHandlers.
 *   · React #418: the shape is now taken when the document is first parsed (before React), and the report says the
 *     browser's language and whether the page has been machine-translated (Chrome / Samsung translate rewrite the text
 *     into <font> elements, which React cannot reconcile) — 30 of 31 reports in a week were "body differs" on Windows
 *     Chrome and Samsung Internet, the browsers that translate pages.
 *
 * 10-28 (Neil: 「页面报错 res:SCRIPT www.googletag」): Google Analytics (lib/ga.ts, live since 10-27) failing to load —
 * www.googletagmanager.com/gtag/js, or google-analytics.com — is the same as the Cloudflare beacon: a blocker at work
 * (iOS Safari's tracking protection, iCloud Private Relay, a content blocker). The first day: 59 reports from 18
 * iPhones, all Safari, every page fine — GA is loaded async after the page and nothing waits on it. Not reported, and
 * GA's own script is not counted as a "foreign" injection in the React #418 report either.
 */
export const ERR_CAPTURE_SCRIPT = `(function(){try{
var n=0,K="yaoflow:sid",L0=null;try{L0=document.documentElement.getAttribute("lang")}catch(e){}
function sid(){try{var s=sessionStorage.getItem(K);if(!s){s=Math.random().toString(36).slice(2,10)+Date.now().toString(36).slice(-4);sessionStorage.setItem(K,s)}return s}catch(e){return "nosession"}}
function clean(x){return String(x==null?"":x).replace(/\\s+/g," ")}
function send(kind,msg){if(n>=5)return;n++;try{var p=location.pathname,l=p.split("/")[1]||"",m=clean(msg);
fetch("/api/track",{method:"POST",headers:{"Content-Type":"application/json"},keepalive:true,
body:JSON.stringify({e:"client_error",s:sid(),path:p.slice(0,80),locale:l.slice(0,8),method:(kind+":"+m).slice(0,24),msg:m.slice(0,160)})})["catch"](function(){})}catch(e){}}
function sigs(el,deep){var out=[],k=el?el.children:[],i;for(i=0;i<k.length&&i<14;i++){var c=k[i],t=String(c.tagName||"").toLowerCase();if(t==="script"||t==="next-route-announcer")continue;
if(deep){var cl=typeof c.className==="string"?c.className.split(/\\s+/)[0]:"";t+=(c.id?"#"+c.id:"")+(cl?"."+cl.slice(0,10):"")}out.push(t)}return out.join(",")}
function shape(d){return{body:sigs(d.body),header:sigs(d.querySelector("header")),footer:sigs(d.querySelector("footer")),main:sigs(d.querySelector("main"),true)}}
function texts(){var out=[],m=document.querySelector("main")||document.body;if(!m)return out;var w=document.createTreeWalker(m,4),x,i=0;while((x=w.nextNode())&&i<4000){i++;var v=String(x.nodeValue||"").replace(/\\s+/g," ").trim();if(!v)continue;var e=x.parentNode,pt=[],h="",j;for(j=0;e&&e!==m&&j<6;j++){if(!h&&e.getAttribute)h=e.getAttribute("data-heat")||"";if(j<3){var c=typeof e.className==="string"?e.className.split(/\\s+/)[0]:"";pt.unshift(String(e.tagName||"").toLowerCase()+(c?"."+c.slice(0,12):""))}if(e.closest&&e.closest("[hidden],script,template"))break;e=e.parentNode}out.push([(h?"["+h+"]":"")+pt.join(">"),v])}return out}
var pre=null,preT=null;function snap(){try{if(!pre&&document.body){pre=shape(document);preT=texts()}}catch(e){}}
function where(){try{if(!preT)return"";var a=preT,b=texts(),i,n=Math.max(a.length,b.length),d=0,first="";for(i=0;i<n;i++){var p=a[i],q=b[i];if(p&&q&&p[1]===q[1])continue;d++;if(!first){var k=!p?"extra":!q?"missing":p[1].replace(/\\d/g,"")===q[1].replace(/\\d/g,"")?"digits":p[1].length===q[1].length?"samelen":"len"+p[1].length+"/"+q[1].length;first=" at "+((p||q)[0]||"main")+" "+k}}return d?first+" n"+d:" text-same"}catch(e){return ""}}
if(document.readyState!=="loading")snap();else document.addEventListener("DOMContentLoaded",snap);
function again(){try{var k="yaoflow:reload",p=location.pathname,v=sessionStorage.getItem(k),now=Date.now();
if(v&&now-Number(v)<60000)return false;sessionStorage.setItem(k,String(now));
setTimeout(function(){if(location.pathname===p&&document.visibilityState==="visible"&&!window.__yfUp)location.reload()},1500);return true}catch(e){return false}}
function againLate(){try{var k="yaoflow:reload",v=sessionStorage.getItem(k),now=Date.now();if(v&&now-Number(v)<60000)return false;sessionStorage.setItem(k,String(now));
setTimeout(function(){if(document.visibilityState==="visible")location.reload()},1500);return true}catch(e){return false}}
function tr(){try{var h=document.documentElement;return /translated/.test(String(h.className))||!!document.querySelector("font[style*='vertical-align']")||h.getAttribute("lang")!==L0}catch(e){return false}}
function hydro(m){try{var kind=/#418/.test(m)?"418 "+((/args\\[\\]=(\\w+)/.exec(m)||[])[1]||"?"):/#423/.test(m)?"423":"425";
var wh=where(),live=pre||shape(document),f=[],sc=document.scripts,i;for(i=0;i<sc.length;i++){var src=String(sc[i].src||"");if(src&&!/\\/_next\\//.test(src)&&!/cloudflareinsights\\.com|googletagmanager\\.com|google-analytics\\.com/.test(src)&&src.indexOf("//"+location.host+"/")<0)f.push(src.replace(/^[a-z]+:\\/\\//i,"").split("/")[0])}
var tail=(f.length?" foreign["+f.slice(0,4).join(",")+"]":"")+" nl="+String(typeof navigator!=="undefined"&&navigator.language||"?").slice(0,5)+(tr()?" translated":"")+(pre?"":" late");
fetch(location.href,{credentials:"include",headers:{"Accept":"text/html"}}).then(function(r){return r.text()}).then(function(html){
var srv=shape(new DOMParser().parseFromString(html,"text/html")),parts=[],k;for(k in srv){if(srv[k]!==live[k])parts.push(k+" S["+srv[k]+"] C["+live[k]+"]")}
send("hy","React #"+kind+wh+" "+(parts.length?parts.join(" "):"same-shallow")+tail)})["catch"](function(){send("hy","React #"+kind+" nofetch"+tail)})}catch(e){send("js",m)}}
window.addEventListener("error",function(e){var t=e&&e.target;
if(t&&t!==window&&t.tagName&&(t.tagName==="SCRIPT"||t.tagName==="LINK")){var u=String(t.src||t.href||"");
if(!/^https?:\\/\\//i.test(u))return;
var h=u.replace(/^https?:\\/\\//i,"").split("/")[0];
if(/cloudflareinsights\\.com$/i.test(h)||/(^|\\.)(googletagmanager|google-analytics)\\.com$/i.test(h))return;
if(h==="js.stripe.com"&&/trusted-types/.test(u))return;
if(h===location.host&&window.__yfUp)return;
var own=h===location.host&&/\\/_next\\/static\\//.test(u)&&t.tagName==="SCRIPT";
send("res",t.tagName+" "+(h!==location.host?h+"/":"")+u.replace(/\\/+$/,"").split("/").pop()+(own&&again()?" →reload":""));return}
if(t&&t!==window&&t.tagName){var w=String(t.currentSrc||t.src||"");if(!/^https?:\\/\\//i.test(w))return;var wh=w.replace(/^https?:\\/\\//i,"").split("/")[0],wp=w.replace(/^https?:\\/\\/[^\\/]+/i,"").split("?")[0].split("/").filter(Boolean).slice(-3).join("/");send("res",t.tagName+" "+(wh!==location.host?wh+"/":"")+wp);return}
var m=e&&e.message||"?",f=e&&e.filename?String(e.filename).split("/").pop().split("?")[0]:"";
if(!f&&/^Script error\\.?$/.test(m))return;
if(/window\\.webkit\\.messageHandlers/.test(m))return;
if(/Minified React error #4(18|23|25)\\b/.test(m)){hydro(m);return}
send("js",m+(f?" @"+f+":"+e.lineno+":"+e.colno:"")+(/ChunkLoadError|Loading chunk \\d+ failed/.test(m)&&againLate()?" →reload":""))},true);
window.addEventListener("unhandledrejection",function(e){var r=e&&e.reason,m=r&&r.message?(r.name?r.name+": ":"")+r.message:r;
if(/Object Not Found Matching Id:\\d+, MethodName:\\w+, ParamCount:\\d+$/.test(String(m)))return;
send("pr",String(m)+(/ChunkLoadError|Loading chunk|Failed to fetch dynamically imported module|Importing a module script failed/.test(String(m))&&againLate()?" →reload":""))});
}catch(e){}})();`;

/**
 * The same three, as they arrive at api/track from a page that was served the morning's script (which named the
 * beacon by its file only, "SCRIPT v31edd6df95cf4e85…", and sent the other two as they were). Pages stay open for
 * hours; this keeps them off the board meanwhile. Everything else is recorded as before.
 */
export function isNoiseClientError(method?: string, msg?: string): boolean {
  const m = msg ?? "";
  if (/^SCRIPT (?:[a-z0-9.-]*cloudflareinsights\.com\/)?v[0-9a-f]{32}\d{13}$/i.test(m)) return true; // the beacon
  if (/Object Not Found Matching Id:\d+, MethodName:\w+, ParamCount:\d+$/.test(m)) return true;       // Outlook
  if (/^js:Script error\.?$/.test(method ?? "") && (!m || /^Script error\.?$/.test(m))) return true;  // opaque
  if (/window\.webkit\.messageHandlers/.test(m)) return true;                                      // 10-16 in-app browsers' own scripts
  if (/^SCRIPT js\.stripe\.com\/trusted-types-checker/.test(m)) return true;                        // 10-16 Stripe's helper, blocked
  if (/^SCRIPT (?:[a-z0-9-]+\.)*(?:googletagmanager|google-analytics)\.com\//i.test(m)) return true;    // 10-28 Google Analytics, blocked
  return false;
}
