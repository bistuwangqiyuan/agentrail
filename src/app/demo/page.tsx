"use client";

import { useState } from "react";

type DemoResult = {
  ok: boolean;
  human_clicks?: number;
  failover_swap_used?: boolean;
  before?: unknown;
  after?: unknown;
  receipt?: unknown;
  data?: unknown;
  error?: unknown;
};

export default function DemoPage() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<DemoResult | null>(null);
  const [log, setLog] = useState<string[]>([]);

  async function run() {
    setLoading(true);
    setLog([]);
    const steps = [
      "重置演示账本",
      "Buyer Agent 发现付费资源 → 402",
      "余额为 USDT，资源要 USDC → Failover Swap",
      "Facilitator 结算并交付 payload",
      "写入可审计 ledger",
    ];
    for (const s of steps) {
      setLog((prev) => [...prev, s]);
      await new Promise((r) => setTimeout(r, 180));
    }
    try {
      const res = await fetch("/api/v1/demo/e2e", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reset: true }),
      });
      const data = await res.json();
      setResult(data);
    } catch (e) {
      setResult({ ok: false, error: String(e) });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-6 pb-20 pt-6">
      <h1 className="font-display text-4xl text-ink">无人支付 Demo</h1>
      <p className="mt-3 max-w-2xl text-[var(--muted)]">
        一次请求完成：询价 → 自动换币 → 结算 → 交付。页面按钮仅用于展示；Agent
        可直接调用同一 API，无需人类点击。
      </p>

      <button
        type="button"
        onClick={run}
        disabled={loading}
        className="mt-8 rounded-sm bg-pine px-5 py-2.5 text-sm text-white disabled:opacity-60"
      >
        {loading ? "Agent 执行中…" : "运行 Agent A → Agent B 全链路"}
      </button>

      <ol className="mt-6 space-y-2 font-mono text-sm text-[var(--muted)]">
        {log.map((l) => (
          <li key={l}>→ {l}</li>
        ))}
      </ol>

      {result && (
        <pre className="mt-8 overflow-x-auto rounded-sm border border-[var(--line)] bg-white/70 p-4 font-mono text-xs leading-relaxed">
          {JSON.stringify(result, null, 2)}
        </pre>
      )}
    </div>
  );
}
