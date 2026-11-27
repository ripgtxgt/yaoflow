/**
 * Our own addresses: orders under them are ours, not customers'. Kept out of
 * revenue and the per-market numbers (09-12 test_flag; 09-21 marked in bulk).
 */
export const INTERNAL_EMAILS = (process.env.INTERNAL_EMAILS ?? "ripgtxgt@gmail.com,ripgtxgt@126.com,neil@linedo.io,*@linedo.io,*@resend.dev,*@example.com")
  .split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);

export function isInternalEmail(email: string | null): boolean {
  if (!email) return false;
  const e = email.toLowerCase();
  return INTERNAL_EMAILS.some((p) => (p.startsWith("*@") ? e.endsWith(p.slice(1)) : e === p));
}
