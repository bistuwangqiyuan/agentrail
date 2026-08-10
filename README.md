# AgentRail（智轨支付）

专为 AI Agent 的全自动支付 OS MVP：x402 兼容、稳定币优先、支付不通时自动 token↔token。

## 本地运行

```bash
npm install
npm run dev
```

打开 http://localhost:3000

## 无人支付验收

```bash
# 终端 1
npm run dev

# 终端 2
npm run test:e2e
```

或：

```bash
curl -X POST http://localhost:3000/api/v1/demo/e2e \
  -H "Content-Type: application/json" \
  -d '{"reset":true}'
```

Demo 密钥见 `/docs`。

## 商业计划与模型

- `AgentRail_商业计划书.md`
- `python models/agentrail_financial_model.py`

## 合规边界

运行时支付可无人；Agent 须绑定 principal（KYA）。不向中国大陆公众提供虚拟货币兑换/支付通道。
