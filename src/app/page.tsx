import Link from "next/link";

export default function HomePage() {
  return (
    <div className="mx-auto max-w-5xl px-6 pb-20 pt-10">
      <section className="relative overflow-hidden rounded-sm border border-[var(--line)] bg-[rgba(255,255,255,0.55)] px-8 py-16 md:px-14 md:py-20">
        <div
          className="pointer-events-none absolute inset-0 opacity-80"
          style={{
            backgroundImage:
              "linear-gradient(120deg, rgba(15,118,110,0.18), transparent 45%), linear-gradient(300deg, rgba(196,92,38,0.16), transparent 40%)",
          }}
        />
        <div className="relative max-w-2xl">
          <p className="font-display text-5xl leading-none text-ink md:text-6xl">AgentRail</p>
          <h1 className="mt-6 text-2xl font-medium leading-snug text-ink md:text-3xl">
            AI Agent 之间的全自动支付通道
          </h1>
          <p className="mt-4 max-w-xl text-base leading-relaxed text-[var(--muted)]">
            无登录表单、无人工审核台。稳定币优先结算；支付不通时自动 token↔token。
            损耗透明，自动性优先。
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/demo"
              className="rounded-sm bg-ink px-5 py-2.5 text-sm text-white hover:bg-[#243447]"
            >
              运行无人支付 Demo
            </Link>
            <Link
              href="/docs"
              className="rounded-sm border border-[var(--line)] bg-white/70 px-5 py-2.5 text-sm text-ink"
            >
              API / SDK
            </Link>
          </div>
        </div>
      </section>

      <section className="mt-14 grid gap-8 md:grid-cols-3">
        {[
          {
            t: "x402 兼容",
            d: "HTTP 402 + 机器可读报价。Agent 用 X-Api-Key 自动支付并重试。",
          },
          {
            t: "Failover Swap",
            d: "余额币种不匹配时自动兑换（可接受价差），失败返回机器可读错误码。",
          },
          {
            t: "KYA 锚点",
            d: "Agent 必须绑定已验证 principal。运行时无人，法律责任不消失。",
          },
        ].map((item) => (
          <div key={item.t} className="border-t border-[var(--line)] pt-4">
            <h2 className="font-display text-2xl text-ink">{item.t}</h2>
            <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">{item.d}</p>
          </div>
        ))}
      </section>

      <section className="mt-14 rounded-sm border border-[var(--line)] bg-white/50 p-6">
        <h2 className="font-display text-2xl">给 Agent 的最小调用</h2>
        <pre className="mt-4 overflow-x-auto rounded-sm bg-ink p-4 font-mono text-xs leading-relaxed text-[#d7e3f4]">
{`curl -X POST https://YOUR_HOST/api/v1/pay \\
  -H "Content-Type: application/json" \\
  -H "X-Api-Key: ar_buyer_demo_key_0001" \\
  -d '{"resource_id":"res_market_alpha"}'`}
        </pre>
      </section>
    </div>
  );
}
