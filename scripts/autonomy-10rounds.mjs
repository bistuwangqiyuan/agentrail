#!/usr/bin/env node
/**
 * 10-round test→fix verification loop for fully autonomous agent pay/collect.
 * Usage: node scripts/autonomy-10rounds.mjs [baseUrl]
 *
 * Exit 0 only if all 10 rounds pass every assertion.
 */
const base = (process.argv[2] || "http://127.0.0.1:3000").replace(/\/$/, "");
const ROUNDS = 10;

async function api(method, path, { key, walletState, body, headers } = {}) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(key ? { "X-Api-Key": key } : {}),
      ...(walletState ? { "X-Wallet-State": walletState } : {}),
      ...(headers || {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => null);
  return { status: res.status, data };
}

function assert(cond, msg, detail) {
  if (!cond) {
    const err = new Error(msg);
    err.detail = detail;
    throw err;
  }
}

async function round(n) {
  const tag = `R${n}`;
  const checks = [];

  // A) Machine discovery
  {
    const r = await api("GET", "/api/v1/openapi");
    assert(r.status === 200 && r.data?.["x-agent-complete"] === true, `${tag} openapi`);
    checks.push("openapi");
  }

  // B) One-shot cycle (pay + collect)
  {
    const r = await api("POST", "/api/v1/agent/cycle", {
      body: {
        price_usd: 0.11 + n * 0.01,
        buyer_usdc: 0,
        buyer_usdt: 20,
        payload: { round: n, secret: `s-${n}` },
      },
    });
    assert(r.status === 200 && r.data?.ok === true, `${tag} cycle`, r.data);
    assert(r.data.human_clicks === 0, `${tag} cycle human_clicks`);
    assert(r.data.failover_swap_used === true, `${tag} cycle swap`);
    assert(r.data.data?.secret === `s-${n}`, `${tag} cycle payload`);
    assert(r.data.after.seller.USDC > r.data.before.seller.USDC, `${tag} seller credited`);
    checks.push("cycle");
  }

  // C) Multi-step with portable wallet_state (simulates cold start)
  let sellerKey, sellerId, sellerState, buyerKey, buyerState, resourceId, resourceToken, receiptId;
  {
    const sp = await api("POST", "/api/v1/principals", {
      body: { name: `seller-p-${n}-${Date.now()}` },
    });
    assert(sp.data?.principal?.id, `${tag} seller principal`, sp.data);

    const sa = await api("POST", "/api/v1/agents", {
      body: {
        principal_id: sp.data.principal.id,
        label: "seller",
        fund_usdc: 0.5,
        per_tx_cap_usd: 50,
        daily_cap_usd: 500,
      },
    });
    assert(sa.data?.api_key && sa.data?.wallet_state, `${tag} seller provision`, sa.data);
    sellerKey = sa.data.api_key;
    sellerId = sa.data.agent_id;
    sellerState = sa.data.wallet_state;

    const listed = await api("POST", "/api/v1/resources", {
      key: sellerKey,
      walletState: sellerState,
      body: {
        title: `res-${n}`,
        price_usd: 0.09,
        payload: { multi: n },
      },
    });
    assert(listed.data?.resource?.id && listed.data?.resource_token, `${tag} list`, listed.data);
    resourceId = listed.data.resource.id;
    resourceToken = listed.data.resource_token;
    sellerState = listed.data.wallet_state || sellerState;
    checks.push("seller_list");
  }

  {
    const ba = await api("POST", "/api/v1/agents", {
      body: {
        auto_principal: true,
        principal_name: `buyer-p-${n}`,
        label: "buyer",
        fund_usdc: 0,
        fund_usdt: 12,
        max_slippage_bps: 300,
        per_tx_cap_usd: 10,
      },
    });
    assert(ba.data?.api_key && ba.data?.wallet_state, `${tag} buyer provision`, ba.data);
    buyerKey = ba.data.api_key;
    buyerState = ba.data.wallet_state;
    checks.push("buyer_provision");
  }

  // 402 then pay using ONLY wallet_state + resource_token (no reliance on prior memory)
  {
    const challenge = await api("GET", `/api/v1/resources/${resourceId}?resource_token=${encodeURIComponent(resourceToken)}`);
    assert(challenge.status === 402, `${tag} 402`, challenge.data);

    const pay = await api("POST", "/api/v1/pay", {
      key: buyerKey,
      walletState: buyerState,
      body: {
        resource_id: resourceId,
        resource_token: resourceToken,
        intent_id: `intent-${n}-${Date.now()}`,
      },
    });
    assert(pay.status === 200 && pay.data?.ok, `${tag} pay`, pay.data);
    assert(pay.data.receipt?.swap, `${tag} pay swap used`);
    assert(pay.data.data?.multi === n, `${tag} pay payload`);
    receiptId = pay.data.receipt.receipt_id;
    buyerState = pay.data.wallet_state;
    checks.push("pay_with_portable_state");
  }

  // Deliver with receipt id
  {
    const got = await api("GET", `/api/v1/resources/${resourceId}`, {
      key: buyerKey,
      walletState: buyerState,
      headers: { "X-PAYMENT": receiptId },
    });
    assert(got.status === 200 && got.data?.data?.multi === n, `${tag} deliver`, got.data);
    checks.push("deliver");
  }

  // X-PAYMENT auto
  {
    const listed = await api("POST", "/api/v1/resources", {
      key: sellerKey,
      walletState: sellerState,
      body: { title: `auto-${n}`, price_usd: 0.07, payload: { auto: n } },
    });
    const rid = listed.data.resource.id;
    const rtoken = listed.data.resource_token;
    sellerState = listed.data.wallet_state || sellerState;

    const auto = await api("GET", `/api/v1/resources/${rid}?resource_token=${encodeURIComponent(rtoken)}`, {
      key: buyerKey,
      walletState: buyerState,
      headers: { "X-PAYMENT": "auto", "X-Intent-Id": `auto-${n}-${Date.now()}` },
    });
    assert(auto.status === 200 && auto.data?.data?.auto === n, `${tag} x-payment-auto`, auto.data);
    buyerState = auto.data.wallet_state || buyerState;
    checks.push("x_payment_auto");
  }

  // Top-up without human
  {
    const top = await api("PUT", "/api/v1/agents", {
      key: buyerKey,
      walletState: buyerState,
      body: { action: "topup", fund_usdt: 1 },
    });
    assert(top.status === 200 && top.data?.ok, `${tag} topup`, top.data);
    buyerState = top.data.wallet_state;
    checks.push("topup");
  }

  // Seller verifies credits
  {
    const led = await api("GET", `/api/v1/ledger?agent_id=${encodeURIComponent(sellerId)}`);
    const credits = (led.data?.ledger || []).filter((e) => e.type === "credit");
    assert(led.status === 200 && credits.length >= 1, `${tag} seller credits`, {
      credits: credits.length,
      ledger: led.data,
    });
    checks.push("seller_credits");
  }

  // Demo e2e
  {
    const demo = await api("POST", "/api/v1/demo/e2e", { body: { reset: true } });
    assert(demo.status === 200 && demo.data?.ok && demo.data.human_clicks === 0, `${tag} demo`, demo.data);
    checks.push("demo");
  }

  return checks;
}

async function main() {
  console.log(`\n=== 10-round autonomy loop @ ${base} ===\n`);
  const summary = [];
  for (let i = 1; i <= ROUNDS; i++) {
    try {
      const checks = await round(i);
      summary.push({ round: i, pass: true, checks });
      console.log(`PASS round ${i}/${ROUNDS} — ${checks.join(", ")}`);
    } catch (e) {
      summary.push({ round: i, pass: false, error: e.message, detail: e.detail });
      console.error(`FAIL round ${i}/${ROUNDS} — ${e.message}`);
      if (e.detail) console.error(JSON.stringify(e.detail, null, 2));
      console.log(JSON.stringify({ summary }, null, 2));
      process.exit(1);
    }
  }
  console.log(`\n=== ALL ${ROUNDS} ROUNDS PASSED ===`);
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
