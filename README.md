# AgentRail（智轨支付）

专为 AI Agent 的全自动支付 OS：x402 兼容、USDC（Base Sepolia / local EVM）、支付不通时自动 pool 换币。

## 线上地址

- **生产站：** https://paiusdtai.vercel.app
- **GitHub：** https://github.com/bistuwangqiyuan/agentrail

## 结算模式

| Mode | 说明 |
|------|------|
| `local`（默认） | 本地 EVM 账本 + 真实 secp256k1 钱包地址 + 可验证 `tx_hash` |
| `base-sepolia` | 真实 Base Sepolia USDC（需 `SPONSOR_PRIVATE_KEY` + RPC） |

见 [`.env.example`](.env.example)。

## 本地运行

```bash
npm install
npm run dev
```

## 无人支付验收（含链上 tx 校验）

```bash
npm run build && npx next start -p 3002
node scripts/autonomy-10rounds.mjs http://127.0.0.1:3002
```

Agent 一键闭环：

```bash
curl -X POST http://127.0.0.1:3002/api/v1/agent/cycle \
  -H "Content-Type: application/json" \
  -d '{"price_usd":0.15,"buyer_usdt":20}'
```

## 合规边界

仅测试网/本地演示资金；不向中国大陆公众提供虚拟货币兑换/支付通道。Agent 须绑定 principal（KYA）。
