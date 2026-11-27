import { cookies } from "next/headers";
import { ADMIN_COOKIE, isAdmin } from "@/lib/admin-auth";
import { homeMinute } from "@/lib/clock";
import { listPhotos, PHOTO_KEEP_MS } from "@/lib/qian-photo-store";
import { AdminLogin, AdminShell, Legend, Section } from "../../ui";

export const dynamic = "force-dynamic";

/** 10-14 拍照找籤留存: the photos we could not name, with what was read off them — for working out why. */
const KIND_ZH: Record<string, string> = { none: "认不出", some: "给了几首让读者选", fail: "读取失败（模型没回）" };

export default async function QianPhotosPage({ searchParams }: { searchParams: Promise<{ key?: string; denied?: string; deleted?: string }> }) {
  const { key, denied, deleted } = await searchParams;
  if (!(await isAdmin((await cookies()).get(ADMIN_COOKIE)?.value, key))) return <AdminLogin denied={denied === "1"} back="/admin/qian/photos" />;
  const photos = listPhotos();
  const now = Date.now();
  return (
    <AdminShell title="解籤 · 认不出的照片" nav={[]} right={<a href="/admin/qian" className="underline underline-offset-4">← 解籤</a>}>
      <Section id="photos" title="认不出的照片" sub={`${photos.length} 张 · 每张留 30 天后自动删除`}>
        {deleted && <p className="text-sm text-emerald-700 mb-3">已删除。</p>}
        {photos.length === 0 && <p className="text-sm opacity-50">还没有（10-14 起才留）。</p>}
        <div className="grid md:grid-cols-2 gap-6">
          {photos.map((p) => (
            <div key={p.id} className="border border-black/10 rounded-lg p-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <a href={`/api/admin/qian-photo?id=${p.id}`} target="_blank" rel="noreferrer"><img src={`/api/admin/qian-photo?id=${p.id}`} alt="" className="w-full max-h-[420px] object-contain bg-black/5 rounded" /></a>
              <p className="text-xs mt-2"><b>{KIND_ZH[p.kind] ?? p.kind}</b> · {homeMinute(p.at)} · {Math.round(p.ms / 100) / 10} 秒 · {p.model?.split("/")[1] ?? "—"} · 还剩 {Math.max(0, Math.ceil((p.at + PHOTO_KEEP_MS - now) / 86_400_000))} 天</p>
              <p className="text-xs opacity-70">读出的籤号：{p.number ?? "—"} · 廟名：{p.temple || "—"} · 比对前几名：{p.top || "—"}</p>
              {p.text && <pre className="text-xs mt-1 whitespace-pre-wrap opacity-80 bg-black/[0.03] p-2 rounded">{p.text}</pre>}
              <form method="post" action="/api/admin/qian-photo" className="mt-2">
                <input type="hidden" name="id" value={p.id} />
                <button className="text-xs underline underline-offset-2 opacity-60 hover:opacity-100">删除这张</button>
              </form>
            </div>
          ))}
        </div>
        <Legend>只留没能直接认出的照片（认不出、读取失败、给了几首让读者选），认出来的和「不是籤诗」的一张都不留。照片不连到读者的信箱、账号或浏览器；手机端上传前重新压缩过，服务器存之前又去掉了照片里的拍摄信息。30 天后由补单任务每小时检查删除。</Legend>
      </Section>
    </AdminShell>
  );
}
