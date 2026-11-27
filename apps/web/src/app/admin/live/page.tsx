import { cookies } from "next/headers";
import { ADMIN_COOKIE, isAdmin } from "@/lib/admin-auth";
import { snapshot } from "@/lib/presence";
import { AdminLogin, AdminShell } from "../ui";
import LiveBoard from "./LiveBoard";

export const dynamic = "force-dynamic";

/**
 * 实时在线 (10-02, Neil: 「后台能做一个实时在线的监测功能吗？」): who is on the site right now — how many, member or
 * not, new or returning, which page, what they just did, how long they have been on it. The first snapshot renders
 * on the server; the board then polls /api/admin/live every 5 s (lib/presence.ts).
 */
export default async function LivePage({ searchParams }: { searchParams: Promise<{ key?: string; denied?: string }> }) {
  const { key, denied } = await searchParams;
  if (!(await isAdmin((await cookies()).get(ADMIN_COOKIE)?.value, key))) return <AdminLogin denied={denied === "1"} back="/admin/live" />;
  return (
    <AdminShell title="实时在线" nav={[]}>
      <LiveBoard initial={snapshot()} />
    </AdminShell>
  );
}
