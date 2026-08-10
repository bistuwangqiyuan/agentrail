#!/usr/bin/env node
/**
 * AgentRail — Full autonomous agent payment/collection loop (no human).
 * Usage: node scripts/agent-autonomy-loop.mjs [baseUrl]
 */
const base = (process.argv[2] || "https://paiusdtai.vercel.app").replace(/\/$/, "");

const results = [];
function ok(name, detail) {
  results.push({ name, pass: true, detail });
  console.log(`PASS  ${name}`, detail || "");
}
function fail(name, detail) {
  results.push({ name, pass: false, detail });
  console.error(`FAIL  ${name}`, detail || "");
}

async function api(method, path, { key, body, headers } = {}) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(key ? { "X-Api-Key": key } : {}),
      ...(headers || {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }
  return { status: res.status, data, headers: res.headers };
}

async function main() {
  console.log(`\n=== Agent autonomy test @ ${base} ===\n`);

  // 1) Status — machine readable
  {
    const r = await api("GET", "/api/v1/status");
    if (r.status === 200 && r.data?.status === "ok") ok("status", r.data.time);
    else fail("status", r);
  }

  // 2) Seller agent creates principal (no human KYC form)
  let principalId;
  {
    const r = await api("POST", "/api/v1/principals", {
      body: { name: `Autonomous Seller Principal ${Date.now()}` },
    });
    if (r.status === 200 && r.data?.principal?.id) {
      principalId = r.data.principal.id;
      ok("create_principal", principalId);
    } else fail("create_principal", r);
  }

  // 3) Seller agent self-provisions wallet
  let sellerKey, sellerId;
  {
    const r = await api("POST", "/api/v1/agents", {
      body: {
        principal_id: principalId || "prin_demo",
        label: "seller-bot",
        fund_usdc: 1,
        daily_cap_usd: 1000,
        per_tx_cap_usd: 100,
      },
    });
    if (r.status === 200 && r.data?.api_key) {
      sellerKey = r.data.api_key;
      sellerId = r.data.agent_id;
      ok("seller_provision", sellerId);
    } else fail("seller_provision", r);
  }

  // 4) Seller publishes paid resource (collection side)
  let resourceId;
  {
    const r = await api("POST", "/api/v1/resources", {
      key: sellerKey,
      body: {
        title: "Autonomous API Packet",
        description: "Paid data for agents only",
        price_usd: 0.12,
        asset: "USDC",
        payload: { secret: "agent-only-payload", ts: Date.now() },
      },
    });
    if (r.status === 200 && r.data?.resource?.id) {
      resourceId = r.data.resource.id;
      ok("seller_list_resource", resourceId);
    } else fail("seller_list_resource", r);
  }

  // 5) Buyer principal + wallet (USDT only → forces failover swap)
  let buyerKey, buyerId;
  {
    const p = await api("POST", "/api/v1/principals", {
      body: { name: `Autonomous Buyer Principal ${Date.now()}` },
    });
    const pid = p.data?.principal?.id || "prin_demo";
    const r = await api("POST", "/api/v1/agents", {
      body: {
        principal_id: pid,
        label: "buyer-bot",
        fund_usdc: 0,
        fund_usdt: 20,
        daily_cap_usd: 50,
        per_tx_cap_usd: 5,
        max_slippage_bps: 200,
      },
    });
    if (r.status === 200 && r.data?.api_key) {
      buyerKey = r.data.api_key;
      buyerId = r.data.agent_id;
      ok("buyer_provision", { buyerId, balances: r.data.balances });
    } else fail("buyer_provision", r);
  }

  // 6) Buyer discovers resource → must get 402 (no free ride)
  {
    const r = await api("GET", `/api/v1/resources/${resourceId}`);
    if (r.status === 402 && r.data?.error === "PAYMENT_REQUIRED") {
      ok("buyer_gets_402", { quote: r.data.quote?.price_usd });
    } else fail("buyer_gets_402", r);
  }

  // 7) Buyer auto-pays (payment)
  let receiptId;
  {
    const r = await api("POST", "/api/v1/pay", {
      key: buyerKey,
      body: { resource_id: resourceId, intent_id: `intent_auto_${Date.now()}` },
    });
    if (r.status === 200 && r.data?.ok && r.data?.receipt?.status === "settled") {
      receiptId = r.data.receipt.receipt_id;
      ok("buyer_autopay", {
        receiptId,
        swap: Boolean(r.data.receipt.swap),
        amount: r.data.receipt.amount_paid,
        fees: r.data.receipt.fee_breakdown,
      });
    } else fail("buyer_autopay", r);
  }

  // 8) Buyer retrieves paid content with receipt
  {
    const r = await api("GET", `/api/v1/resources/${resourceId}`, {
      key: buyerKey,
      headers: { "X-PAYMENT": receiptId },
    });
    if (r.status === 200 && r.data?.data?.secret === "agent-only-payload") {
      ok("buyer_receive_payload", r.data.data);
    } else fail("buyer_receive_payload", r);
  }

  // 9) X-PAYMENT: auto path (single agent fetch)
  {
    // new resource for clean pay
    const listed = await api("POST", "/api/v1/resources", {
      key: sellerKey,
      body: {
        title: "Auto header resource",
        price_usd: 0.08,
        payload: { via: "x-payment-auto" },
      },
    });
    const rid = listed.data?.resource?.id;
    const r = await api("GET", `/api/v1/resources/${rid}`, {
      key: buyerKey,
      headers: { "X-PAYMENT": "auto", "X-Intent-Id": `auto_${Date.now()}` },
    });
    if (r.status === 200 && r.data?.data?.via === "x-payment-auto") {
      ok("x_payment_auto_header", r.data.receipt?.receipt_id);
    } else fail("x_payment_auto_header", r);
  }

  // 10) Seller verifies collection via ledger (receivable side)
  {
    const r = await api("GET", `/api/v1/ledger?agent_id=${sellerId}`);
    const credits = (r.data?.ledger || []).filter((e) => e.type === "credit");
    if (r.status === 200 && credits.length >= 1) {
      ok("seller_sees_credits", { credits: credits.length, receipts: (r.data.receipts || []).length });
    } else fail("seller_sees_credits", r);
  }

  // 11) Buyer self-check balances via GET /agents
  {
    const r = await api("GET", "/api/v1/agents", { key: buyerKey });
    if (r.status === 200 && r.data?.agent?.id === buyerId) {
      ok("buyer_balance_query", r.data.agent.balances);
    } else fail("buyer_balance_query", r);
  }

  // 12) Idempotent replay of same intent must not double-charge
  {
    const intent = `idem_${Date.now()}`;
    const listed = await api("POST", "/api/v1/resources", {
      key: sellerKey,
      body: { title: "Idem", price_usd: 0.05, payload: { n: 1 } },
    });
    const rid = listed.data?.resource?.id;
    const a = await api("POST", "/api/v1/pay", {
      key: buyerKey,
      body: { resource_id: rid, intent_id: intent },
    });
    const b = await api("POST", "/api/v1/pay", {
      key: buyerKey,
      body: { resource_id: rid, intent_id: intent },
    });
    if (a.data?.ok && b.data?.ok && a.data.receipt.receipt_id === b.data.receipt.receipt_id) {
      ok("idempotent_intent", a.data.receipt.receipt_id);
    } else fail("idempotent_intent", { a, b });
  }

  // 13) Catalog discovery without human UI
  {
    const r = await api("GET", "/api/v1/resources");
    if (r.status === 200 && Array.isArray(r.data?.resources) && r.data.resources.length >= 1) {
      ok("catalog_discovery", r.data.resources.length);
    } else fail("catalog_discovery", r);
  }

  // 14) Demo e2e still green
  {
    const r = await api("POST", "/api/v1/demo/e2e", { body: { reset: true } });
    if (r.status === 200 && r.data?.ok && r.data?.human_clicks === 0) {
      ok("demo_e2e_zero_human", {
        swap: r.data.failover_swap_used,
        receipt: r.data.receipt?.receipt_id,
      });
    } else fail("demo_e2e_zero_human", r);
  }

  const passed = results.filter((r) => r.pass).length;
  const failed = results.filter((r) => !r.pass).length;
  console.log(`\n=== SUMMARY: ${passed} passed, ${failed} failed / ${results.length} ===`);
  if (failed) {
    console.log(JSON.stringify(results.filter((r) => !r.pass), null, 2));
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
