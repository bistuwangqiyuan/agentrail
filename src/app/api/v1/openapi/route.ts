import { json, options } from "@/lib/http";

export function OPTIONS() {
  return options();
}

/** Machine-readable API map — agents discover capabilities without human docs */
export async function GET() {
  return json({
    openapi: "3.0.3",
    info: {
      title: "AgentRail",
      version: "0.2.0",
      description: "Autonomous agent payment OS — no human checkout",
    },
    paths: {
      "/api/v1/principals": {
        post: { summary: "Create KYA principal (agent-callable)" },
        get: { summary: "List principals" },
      },
      "/api/v1/agents": {
        post: { summary: "Provision agent wallet + API key" },
        get: { summary: "Read own balances/policy" },
        put: { summary: "Top-up or update policy (action=topup|policy)" },
      },
      "/api/v1/resources": {
        get: { summary: "Discover paid resources + resource_token" },
        post: { summary: "Seller lists a paid resource" },
      },
      "/api/v1/resources/{id}": {
        get: { summary: "402 challenge or paid delivery (X-PAYMENT: auto)" },
      },
      "/api/v1/pay": {
        post: { summary: "Buyer auto-settles (supports resource_token + X-Wallet-State)" },
      },
      "/api/v1/swap/quote": { post: { summary: "Failover swap quote" } },
      "/api/v1/ledger": { get: { summary: "Audit / seller collection verification" } },
      "/api/v1/agent/cycle": {
        post: { summary: "One-shot full autonomous pay+collect cycle" },
      },
      "/api/v1/demo/e2e": { post: { summary: "Seeded demo e2e" } },
      "/api/v1/status": { get: { summary: "Health" } },
    },
    "x-agent-complete": true,
    "x-human-required": false,
  });
}
