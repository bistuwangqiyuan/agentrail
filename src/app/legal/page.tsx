export default function LegalPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 pb-20 pt-6">
      <h1 className="font-display text-4xl text-ink">Legal & Compliance</h1>
      <div className="mt-6 space-y-4 text-sm leading-relaxed text-[var(--muted)]">
        <p>
          AgentRail MVP 为演示与软件原型。账本与兑换为模拟流动性，不构成受监管的托管、兑换或法币支付服务。
        </p>
        <p>
          <strong className="text-ink">不能做：</strong>
          向中国大陆公众提供虚拟货币兑换/支付通道；无牌发行稳定币；匿名混币；协助制裁规避。
        </p>
        <p>
          <strong className="text-ink">KYA：</strong>
          Agent 必须绑定可识别 principal。运行时支付可无人值守；法律责任主体不可消除。
        </p>
        <p>
          本站不收集超出完成演示所必需的个人数据。生产部署须由持牌合作方完成 CIP/KYB 与 Travel Rule
          义务。
        </p>
        <p>最终商业与法律决策权在人。本文不构成法律或投资意见。</p>
      </div>
    </div>
  );
}
