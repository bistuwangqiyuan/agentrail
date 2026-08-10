"use client";

import { useEffect, useState } from "react";

export default function StatusPage() {
  const [data, setData] = useState<unknown>(null);

  useEffect(() => {
    fetch("/api/v1/status")
      .then((r) => r.json())
      .then(setData)
      .catch((e) => setData({ error: String(e) }));
  }, []);

  return (
    <div className="mx-auto max-w-5xl px-6 pb-20 pt-6">
      <h1 className="font-display text-4xl text-ink">Status</h1>
      <p className="mt-3 text-[var(--muted)]">自动化状态页 · GET /api/v1/status</p>
      <pre className="mt-8 overflow-x-auto rounded-sm border border-[var(--line)] bg-white/70 p-4 font-mono text-xs">
        {data ? JSON.stringify(data, null, 2) : "loading…"}
      </pre>
    </div>
  );
}
