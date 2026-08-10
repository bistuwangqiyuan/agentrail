#!/usr/bin/env node
/**
 * Smoke test against a running AgentRail base URL.
 * Usage: node scripts/e2e-smoke.mjs [baseUrl]
 */
const base = process.argv[2] || "http://127.0.0.1:3000";

async function main() {
  const status = await fetch(`${base}/api/v1/status`).then((r) => r.json());
  console.log("status", status);

  const e2e = await fetch(`${base}/api/v1/demo/e2e`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reset: true }),
  }).then((r) => r.json());

  if (!e2e.ok) {
    console.error("E2E failed", e2e);
    process.exit(1);
  }
  console.log("e2e ok", {
    human_clicks: e2e.human_clicks,
    failover_swap_used: e2e.failover_swap_used,
    receipt_id: e2e.receipt?.receipt_id,
    amount_paid: e2e.receipt?.amount_paid,
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
