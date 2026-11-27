/**
 * 11-04（自动巡检）：付费后等年书/报告写好的页面，AutoRefresh 每 6 秒 router.refresh() 一次。iPhone 上读者切到别的
 * App（页面隐藏）时那次刷新照样发出，后台网络被系统掐断，RSC 读到一半报「TypeError: Load failed」，整页掉进错误页
 * 「這一頁沒能打開」——11-04 03:27 一位刚付完年书的读者就是这样（nginx：03:27:29 离开、03:27:32 刷新、03:27:36 回来即错误页）。
 * 现在：页面隐藏时不刷新（这一次不计数），回到前台 1 秒后补刷一次。
 */
export type VisDoc = {
  visibilityState: string;
  addEventListener(type: "visibilitychange", fn: () => void): void;
  removeEventListener(type: "visibilitychange", fn: () => void): void;
};

export function startAutoRefresh(refresh: () => void, opts: { every: number; max: number; doc?: VisDoc; resumeDelay?: number }): () => void {
  const { every, max, doc, resumeDelay = 1000 } = opts;
  let n = 0;
  let missed = false;
  let resume: ReturnType<typeof setTimeout> | undefined;
  const hidden = () => !!doc && doc.visibilityState === "hidden";
  const fire = () => { if (n >= max || hidden()) return false; n += 1; refresh(); return true; };
  const tick = () => {
    if (n >= max) { stop(); return; }
    if (hidden()) { missed = true; return; }
    fire();
  };
  const onVis = () => {
    if (hidden() || !missed) return;
    missed = false;
    if (resume) clearTimeout(resume);
    resume = setTimeout(() => { resume = undefined; fire(); }, resumeDelay);
  };
  const id = setInterval(tick, every);
  doc?.addEventListener("visibilitychange", onVis);
  function stop() {
    clearInterval(id);
    if (resume) clearTimeout(resume);
    doc?.removeEventListener("visibilitychange", onVis);
  }
  return stop;
}
