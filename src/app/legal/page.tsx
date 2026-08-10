export default function LegalPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 pb-20 pt-6">
      <h1 className="font-display text-4xl text-ink">Legal & Compliance</h1>
      <div className="mt-6 space-y-4 text-sm leading-relaxed text-[var(--muted)]">
        <p>
          AgentRail 提供 Agent 可调用的支付操作系统。默认 <code>SETTLEMENT_MODE=local</code>{" "}
          使用本地 EVM 账本（真实 secp256k1 地址与可验证 tx hash）。配置{" "}
          <code>SPONSOR_PRIVATE_KEY</code> 后可切换 Base Sepolia 真实 USDC。测试网资金无主网价值。
        </p>
        <p>
          <strong className="text-ink">不能做：</strong>
          向中国大陆公众提供虚拟货币兑换/支付通道；无牌发行稳定币；匿名混币；协助制裁规避；主网无牌结算。
        </p>
        <p>
          <strong className="text-ink">KYA：</strong>
          Agent 必须绑定可识别 principal。运行时支付可无人值守；法律责任主体不可消除。
        </p>
        <p>
          本站不收集超出完成演示所必需的个人数据。生产主网部署须由持牌合作方完成 CIP/KYB 与 Travel
          Rule 义务。
        </p>
        <p>最终商业与法律决策权在人。本文不构成法律或投资意见。</p>
      </div>
    </div>
  );
}
