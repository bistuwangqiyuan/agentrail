const endpoints = [
  ["POST", "/api/v1/principals", "创建 principal（KYA 锚点，Agent 可调）"],
  ["POST", "/api/v1/agents", "创建 Agent 钱包 + API Key + wallet_state"],
  ["PUT", "/api/v1/agents", "Agent 自助 topup / 更新 policy"],
  ["GET", "/api/v1/resources", "列出可购买资源 + resource_token"],
  ["GET", "/api/v1/resources/:id", "无支付返回 HTTP 402 + x402 accepts"],
  ["POST", "/api/v1/pay", "Agent 自动支付（支持 resource_token + X-Wallet-State）"],
  ["POST", "/api/v1/agent/cycle", "一键全自动：开户→上架→支付→收款"],
  ["POST", "/api/v1/swap/quote", "Failover 兑换询价"],
  ["GET", "/api/v1/ledger", "审计导出 / 卖方核对入账"],
  ["GET", "/api/v1/openapi", "机器可读能力发现"],
  ["POST", "/api/v1/demo/e2e", "一键端到端无人演示"],
  ["GET", "/api/v1/status", "服务状态"],
];

export default function DocsPage() {
  return (
    <div className="mx-auto max-w-5xl px-6 pb-20 pt-6">
      <h1 className="font-display text-4xl text-ink">Docs</h1>
      <p className="mt-3 text-[var(--muted)]">
        产品是 API。网站只提供文档与状态。所有关键路径均有机器可调用接口。
      </p>

      <h2 className="mt-10 font-display text-2xl">Demo 密钥</h2>
      <ul className="mt-3 space-y-1 font-mono text-sm">
        <li>Buyer: ar_buyer_demo_key_0001</li>
        <li>Seller: ar_seller_demo_key_0001</li>
        <li>Resource: res_market_alpha （$0.25 USDC）</li>
      </ul>

      <h2 className="mt-10 font-display text-2xl">Endpoints</h2>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-[var(--line)] text-[var(--muted)]">
              <th className="py-2 pr-4">Method</th>
              <th className="py-2 pr-4">Path</th>
              <th className="py-2">说明</th>
            </tr>
          </thead>
          <tbody>
            {endpoints.map(([m, p, d]) => (
              <tr key={p} className="border-b border-[var(--line)]">
                <td className="py-2 pr-4 font-mono">{m}</td>
                <td className="py-2 pr-4 font-mono">{p}</td>
                <td className="py-2 text-[var(--muted)]">{d}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="mt-10 font-display text-2xl">SDK（browser / node）</h2>
      <pre className="mt-4 overflow-x-auto rounded-sm bg-ink p-4 font-mono text-xs text-[#d7e3f4]">
{`import { AgentRailClient } from "@/sdk/agentrail";

const client = new AgentRailClient({
  baseUrl: "https://YOUR_HOST",
  apiKey: process.env.AGENTRAIL_KEY!,
});

// 自动处理 402 / 支付 / 重试
const data = await client.fetchPaid("/api/v1/resources/res_market_alpha");`}
      </pre>

      <h2 className="mt-10 font-display text-2xl">费率（MVP）</h2>
      <p className="mt-3 text-sm text-[var(--muted)]">
        platform take 2.5%（最低 $0.001）+ network $0.002 + facilitator $0.001 +
        swap 价差（透明写入 fee_breakdown）。自动性优先于费率最优。
      </p>
    </div>
  );
}
