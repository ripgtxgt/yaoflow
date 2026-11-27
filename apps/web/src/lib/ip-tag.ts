import { createHash } from "node:crypto";

/**
 * 09-25 合规: the ops log used to keep the raw IP of a reader who hit a free
 * cap. The log only needs to tell "same address again" apart from "another
 * one", so it keeps a short salted hash instead — nothing in it can be turned
 * back into an address, and the privacy policy's "no IP stored" stays true.
 */
export function ipTag(ip: string | null | undefined): string {
  if (!ip) return "ip:-";
  const salt = process.env.IP_TAG_SALT ?? process.env.ADMIN_KEY ?? "yaoflow";
  return "ip:" + createHash("sha256").update(`${salt}:${ip}`).digest("hex").slice(0, 10);
}
