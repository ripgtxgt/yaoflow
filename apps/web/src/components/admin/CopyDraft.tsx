"use client";

import { useState } from "react";

/** Admin: copy a ready Threads draft in one tap. */
export default function CopyDraft({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <button type="button" className="text-xs underline underline-offset-2 opacity-70 hover:opacity-100"
      onClick={() => { void navigator.clipboard.writeText(text).then(() => { setDone(true); setTimeout(() => setDone(false), 1500); }).catch(() => undefined); }}>
      {done ? "已复制" : "复制草稿"}
    </button>
  );
}
