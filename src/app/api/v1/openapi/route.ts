import { json, options } from "@/lib/http";
import { getChainConfig } from "@/lib/chain";

export function OPTIONS() {
  return options();
}

/** Machine-readable API map — agents discover capabilities without human docs */
export async function GET() {
  const cfg = getChainConfig();
  return json({
    openapi: "3.0.3",
    info: {
      title: "AgentRail",
      version: "0.3.0",
      description: "Autonomous agent payment OS — Base Sepolia USDC / local EVM journal",
    },
    paths: {
      "/api/v1/principals": {
        post: { summary: "Create KYA principal (agent-callable)" },
        get: { summary: "List principals" },
      },
      "/api/v1/agents": {
        post: { summary: "Provision on-chain agent wallet + API key" },
        get: { summary: "Read own balances/policy/address" },
        put: { summary: "Faucet topup USDC or update policy" },
      },
      "/api/v1/resources": {
        get: { summary: "Discover paid resources + resource_token" },
        post: { summary: "Seller lists a paid resource (pay_to = address)" },
      },
      "/api/v1/resources/{id}": {
        get: { summary: "402 challenge or paid delivery (X-PAYMENT: auto)" },
      },
      "/api/v1/pay": {
        post: { summary: "Buyer settles with on-chain/local USDC transfer" },
      },
      "/api/v1/swap/quote": { post: { summary: "Failover swap quote (pool venue)" } },
      "/api/v1/ledger": { get: { summary: "Audit / seller collection verification" } },
      "/api/v1/agent/cycle": {
        post: { summary: "One-shot full autonomous pay+collect cycle" },
      },
      "/api/v1/chain/tx/{hash}": { get: { summary: "Verify settlement tx" } },
      "/api/v1/demo/e2e": { post: { summary: "Seeded demo e2e" } },
      "/api/v1/status": { get: { summary: "Health" } },
    },
    "x-agent-complete": true,
    "x-human-required": false,
    "x-settlement": cfg.mode === "base-sepolia" ? "base-sepolia-usdc" : "local-evm-usdc",
    "x-settlement-mode": cfg.mode,
    "x-usdc": cfg.usdc,
  });
}
