/**
 * 10-02 (Neil: 「领过免费的，也应该能查到是谁吧」): the browser tab's session id (lib/track.ts, the `s` of every event),
 * as a request body carries it in `bs`. Paid checkouts stored it on the order since 09-23; free claims, gifts, rewards,
 * pairs and members' allowance readings did not — so the board could never join those readers to their events.
 */
export function browserSessionOf(body: unknown): string | undefined {
  const v = (body as { bs?: unknown } | null)?.bs;
  return typeof v === "string" && /^[a-z0-9]{6,24}$/.test(v) && v !== "nosession" ? v : undefined;
}
