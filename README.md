# AgentRail（智轨支付）

专为 AI Agent 的全自动支付 OS MVP：x402 兼容、稳定币优先、支付不通时自动 token↔token。

## 线上地址

- **生产站：** https://paiusdtai.vercel.app
- **GitHub：** https://github.com/bistuwangqiyuan/agentrail
- **Demo：** https://paiusdtai.vercel.app/demo
- **Docs：** https://paiusdtai.vercel.app/docs

```bash
curl -X POST https://paiusdtai.vercel.app/api/v1/demo/e2e \
  -H "Content-Type: application/json" \
  -d '{"reset":true}'
```

## 本地运行

```bash
npm install
npm run dev
```

打开 http://localhost:3000

## 无人支付验收

```bash
npm run test:e2e
npm run test:autonomy
npm run test:rounds   # 10 轮全自动支付/收款
# 生产：
node scripts/autonomy-10rounds.mjs https://paiusdtai.vercel.app
```

Demo 密钥见 `/docs`。Agent 亦可直接：

```bash
curl -X POST https://paiusdtai.vercel.app/api/v1/agent/cycle \
  -H "Content-Type: application/json" \
  -d '{"price_usd":0.15,"buyer_usdt":20}'
```

## 商业计划与模型

- `AgentRail_商业计划书.md`
- `python models/agentrail_financial_model.py`

## 合规边界

运行时支付可无人；Agent 须绑定 principal（KYA）。不向中国大陆公众提供虚拟货币兑换/支付通道。
