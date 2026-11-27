import { randomBytes } from "node:crypto";
import { questionIssue } from "./question-check";
import {
  claimPair, createGrant, createPair, customerEmailById, grantByToken, pairBySession, pairByToken, redeemGrant, setGrantClaimDevice, storedReadingForSession,
  type PairRow, type StoredReading,
} from "./db";
import { record } from "./analytics-server";
import { TOKEN_RE } from "./grants";
import { classifyTopic, type Topic } from "./topic";
import { toHans } from "./hant";
import type { Locale } from "./locales";

/**
 * 同题合参 (总方案 §5.3 ⑥, 设计方案 2026-09-10): two people cast on the same
 * matter. The inviter's reading mints one invite (14 days, one use); the
 * other person casts on the shared wording — the framing — and their reading
 * is a grant of kind `joint` at the inviter's tier, on us. Neither side's own
 * question ever crosses over: the framing is the only text both see.
 */
export const PAIR_DAYS = 14;
export const FRAMING_MAX = 120;

/** Two-party matters: relationships always; work / money / decisions when the wording names another party. */
const TWO_PARTY = /合作|合伙|合夥|談判|谈判|签约|簽約|對方|对方|他们|她们|他們|她們|伙伴|夥伴|搭档|搭檔|客户|客戶|老板|老闆|上司|同事|朋友|前任|复合|復合|分手|和好|结婚|結婚|离婚|離婚|(?<!其)他|她|partner|deal|negotiat|contract|co-?found|client|boss|colleague|friend|ex\b|marry|marriage|divorce|\bhe\b|\bshe\b|\bhim\b|\bher\b|\bthey\b|\bthem\b|パートナー|協力|提携|交渉|契約|相手|彼|彼女|上司|同僚|友達|復縁|結婚|離婚|파트너|협력|협상|계약|상대|그\b|그녀|상사|동료|친구|재결합|결혼|이혼|partenaire|négoci|contrat|associ|collègue|\bami|\bil\b|\belle\b|\blui\b|partnerin|verhandl|vertrag|kolleg|freund|\ber\b|\bsie\b|\bihn\b|\bihr\b|socio|negoci|contrato|colega|amig|\bél\b|\bella\b|sócio|parceir|negocia|\bele\b|\bela\b/i;

/**
 * 09-26 (Neil: 「目前我们的用户的感情问题都是不能公开的」): most love questions
 * are one-sided — an ex, a crush, a message unanswered — and the other person
 * must never see them. The invite is offered on a relationship only when the
 * wording says it is a couple asking about their own shared matter, and never
 * when it reads as one-sided or estranged.
 */
const PARTNER_ZH = "老公|老婆|丈夫|妻子|先生|太太|男朋友|女朋友|男友|女友|伴侣|伴侶|未婚夫|未婚妻|另一半";
const COUPLE = new RegExp([
  `我(?:和|跟|与|與)(?:我的)?(?:${PARTNER_ZH})`, `(?:${PARTNER_ZH})(?:和|跟|与|與)我`,
  "(?:我们|我們|我俩|我倆)[^，,。？?！!]{0,6}(?:婚姻|婚礼|婚禮|结婚|結婚|家庭|孩子|备孕|備孕|买房|買房|搬家|同居|婚后|婚後)",
  "\\bmy (?:husband|wife|partner|boyfriend|girlfriend|fianc\\w*) and i\\b", "\\bour (?:marriage|wedding|family|baby|home)\\b", "\\bwe (?:get married|marry|move in|buy a)",
  "(?:夫|妻|彼氏|パートナー)と(?:私|わたし)", "私たちの(?:結婚|家庭|新居)",
  "(?:남편|아내|남자친구|여자친구)(?:와|과|랑|하고)\\s?(?:나|저)", "우리(?:의)?\\s?(?:결혼|가정)",
  "(?:mon mari|ma femme|mon copain|ma copine|mon partenaire|ma partenaire) et moi", "notre (?:mariage|couple|famille)",
  "(?:mein mann|meine frau|mein freund|meine freundin|mein partner|meine partnerin) und ich", "unsere (?:ehe|hochzeit|familie)",
  "mi (?:marido|esposo|esposa|novio|novia|pareja) y yo", "nuestr[oa] (?:matrimonio|boda|familia)",
  "(?:meu (?:marido|esposo|namorado)|minha (?:esposa|namorada|mulher)) e eu", "(?:nosso casamento|nossa família|nossa familia)",
].join("|"), "i");
const ONE_SIDED = /前任|前男友|前女友|复合|復合|复联|復聯|挽回|和好|分手|离婚|離婚|已读不回|已讀不回|不回|冷淡|冷战|冷戰|暗恋|暗戀|单恋|單戀|心仪|心儀|喜欢我|喜歡我|爱我|愛我|想我|想起我|联系我|聯繫我|聯絡我|回来|回來|还爱|還愛|断联|斷聯|拉黑|出轨|出軌|外遇|小三|第三者|他跟他|她跟她|他和他|她和她|他会不会|她会不会|他會不會|她會不會|他心里|她心里|他心裡|她心裡|\bex\b|get back|come back|text me|still love|love me|like me|crush|cheat|affair|divorce|break ?up|元彼|元カノ|復縁|片思い|既読|浮気|離婚|전\s?남친|전\s?여친|재결합|짝사랑|읽씹|바람|이혼|\bmon ex\b|reconqu|divorc|\bmein ex|zurückgewinn|scheidung|\bmi ex\b|volver conmigo|\bmeu ex\b|voltar|traici|infidel/i;

export function isCoupleMatter(question: string): boolean {
  return COUPLE.test(question) && !ONE_SIDED.test(question);
}

export function isTwoParty(question: string, topic: string | null | undefined): boolean {
  if (topic === "relationship") return isCoupleMatter(question);
  if (ONE_SIDED.test(question)) return false;
  if (topic === "health" || topic === "study") return false;
  return TWO_PARTY.test(question);
}

export type PairStatus = "open" | "claimed" | "expired" | "dissolved";

export function pairStatus(p: PairRow, now = Date.now()): PairStatus {
  if (p.dissolved_at) return "dissolved";
  if (p.b_session_id) return "claimed";
  if (p.expires_at < now) return "expired";
  return "open";
}

/**
 * A reading that may send an invite. 09-27 赠送审核 C (Neil: 「A,B,C 一起做吧」): only a reading someone
 * paid for — bought, a membership's, or a referral reward — and only on a matter between two people,
 * checked here and not just on the page. A free reading could otherwise mint a free reading for a second
 * address, which in turn could be published for more.
 */
export const PAIR_SOURCE = new Set(["paid", "subscription", "reward"]);

export function canInvite(sid: string): StoredReading | null {
  const stored = storedReadingForSession(sid);
  if (!stored) return null;
  if (!PAIR_SOURCE.has(stored.status ?? "")) return null;
  const topic = stored.topic ?? classifyTopic(toHans(stored.question));
  if (!isTwoParty(stored.question, topic)) return null;
  return stored;
}

export function cleanFraming(raw: unknown, fallback: string, locale: Locale = "zh"): string {
  const s = (typeof raw === "string" ? raw : "").replace(/\s+/g, " ").trim();
  // 09-20: a framing that names no matter (a sigh, "test") falls back to the question the reading was made on
  const f = s.length >= 2 && !questionIssue(s, locale) ? s : fallback.replace(/\s+/g, " ").trim();
  return f.slice(0, FRAMING_MAX);
}

/** Mint the invite for a reading — idempotent: the second ask returns the first invite. */
export function mintPair(sid: string, framing: string, locale: Locale, customerId: number | null, fromDevice: string | null = null): PairRow | null {
  const existing = pairBySession(sid);
  if (existing && existing.a_session_id === sid) return existing;
  const stored = canInvite(sid);
  if (!stored) return null;
  const token = randomBytes(18).toString("hex");
  const expiresAt = Date.now() + PAIR_DAYS * 86_400_000;
  const topic = stored.topic ?? "other";
  createPair({ token, expiresAt, topic, framing: cleanFraming(framing, stored.question, locale), aSessionId: sid, aCustomerId: customerId ?? stored.customerId, aLocale: locale });
  // the invitee's reading rides the grants path: same tier as the inviter, attributed to the inviter's cast
  createGrant({
    token, kind: "joint", tier: stored.tier === "deep" ? "deep" : "one", expiresAt,
    fromSessionId: sid, fromCustomerId: customerId ?? stored.customerId, via: stored.values.join(""), locale, fromDevice,
  });
  record({ t: Date.now(), e: "pair_sent", s: sid.slice(-12), locale, tier: stored.tier, path: "/reading" });
  return pairByToken(token);
}

/** The invite link carries the inviter's share code so the invitee's session is attributed like any referral. */
export function pairLink(site: string, locale: Locale, p: PairRow): string {
  const g = grantByToken(p.token);
  const via = g?.via && /^[6789]{6}$/.test(g.via) ? `&via=${g.via}` : "";
  return `${site}/${locale}/cast?pair=${p.token}${via}`;
}

export function pairPagePath(locale: Locale, token: string, sid?: string | null): string {
  return `/${locale}/pair/${token}${sid ? `?sid=${encodeURIComponent(sid)}` : ""}`;
}

/** What the invitee may know before casting. Never the inviter's question, email or reading. */
export function pairInfo(token: string): { status: PairStatus; framing: string; topic: string; tier: "one" | "deep"; locale: string } | null {
  if (!TOKEN_RE.test(token)) return null;
  const p = pairByToken(token);
  if (!p) return null;
  const g = grantByToken(token);
  return { status: pairStatus(p), framing: p.framing, topic: p.topic, tier: g?.tier === "deep" ? "deep" : "one", locale: p.a_locale };
}

export type PairRedeem = { ok: true; sid: string; pair: PairRow } | { ok: false; error: "unknown_token" | "already_used" | "expired" | "dissolved" | "self" };

/** The invitee's cast: burn the grant, attach the session to the pair. */
export function redeemPair(token: string, inputJson: string, claimedEmail: string | null, claimedCustomerId: number | null, locale: Locale, claimDevice: string | null = null): PairRedeem {
  if (!TOKEN_RE.test(token)) return { ok: false, error: "unknown_token" };
  const p = pairByToken(token);
  const g = grantByToken(token);
  if (!p || !g || g.kind !== "joint") return { ok: false, error: "unknown_token" };
  const status = pairStatus(p);
  if (status === "dissolved") return { ok: false, error: "dissolved" };
  if (status === "claimed" || g.used_at) return { ok: false, error: "already_used" };
  if (status === "expired") return { ok: false, error: "expired" };
  // the inviter cannot answer their own invite (account-level; the page also warns)
  if (claimedCustomerId && p.a_customer_id && claimedCustomerId === p.a_customer_id) return { ok: false, error: "self" };
  // 09-27 赠送审核 C: by address too (a guest types their own). No same-browser check here: a couple
  // passing one phone across the table is exactly who this is for, and a joint reading earns nothing further.
  const inviterEmail = (p.a_customer_id ? customerEmailById(p.a_customer_id) : null) ?? storedReadingForSession(p.a_session_id)?.email ?? null;
  if (claimedEmail && inviterEmail && claimedEmail.toLowerCase() === inviterEmail.toLowerCase()) return { ok: false, error: "self" };
  const sid = `gr_${token}`;
  if (!redeemGrant(token, sid, inputJson, claimedEmail, claimedCustomerId)) return { ok: false, error: "already_used" };
  setGrantClaimDevice(token, claimDevice);
  if (!claimPair(token, sid, claimedCustomerId, locale)) return { ok: false, error: "already_used" };
  record({ t: Date.now(), e: "pair_claimed", s: sid.slice(-12), locale, tier: g.tier, path: "/cast", via: g.via ?? undefined });
  return { ok: true, sid, pair: pairByToken(token)! };
}

/** Which side of the pair a reading session is, if any. */
export function pairRole(p: PairRow, sid: string | null | undefined): "a" | "b" | null {
  if (!sid) return null;
  if (sid === p.a_session_id) return "a";
  if (sid === p.b_session_id) return "b";
  return null;
}
