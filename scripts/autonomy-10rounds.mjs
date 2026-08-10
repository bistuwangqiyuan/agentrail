#!/usr/bin/env node
/**
 * 10-round test→fix verification for fully autonomous on-chain/local USDC pay/collect.
 * Usage: node scripts/autonomy-10rounds.mjs [baseUrl]
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

async function verifyTx(hash) {
  assert(hash && typeof hash === "string" && hash.startsWith("0x") && hash.length >= 66, "tx_hash shape", hash);
  const r = await api("GET", `/api/v1/chain/tx/${hash}`);
  assert(r.status === 200 && r.data?.tx?.status === "success", "tx verify", r.data);
  return r.data;
}

async function round(n) {
  const tag = `R${n}`;
  const checks = [];

  {
    const r = await api("GET", "/api/v1/openapi");
    assert(r.status === 200 && r.data?.["x-agent-complete"] === true, `${tag} openapi`);
    assert(r.data?.["x-settlement"], `${tag} x-settlement`);
    checks.push("openapi");
  }

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
    assert(r.data.seller?.address?.startsWith("0x"), `${tag} seller address`);
    assert(r.data.buyer?.address?.startsWith("0x"), `${tag} buyer address`);
    assert(r.data.after.seller.USDC > r.data.before.seller.USDC, `${tag} seller credited`);
    await verifyTx(r.data.receipt.tx_hash);
    checks.push("cycle_onchain");
  }

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
    assert(sa.data?.api_key && sa.data?.wallet_state && sa.data?.address, `${tag} seller provision`, sa.data);
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
    assert(listed.data.resource.pay_to?.startsWith("0x"), `${tag} pay_to`);
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
    assert(ba.data?.api_key && ba.data?.wallet_state && ba.data?.address, `${tag} buyer provision`, ba.data);
    buyerKey = ba.data.api_key;
    buyerState = ba.data.wallet_state;
    checks.push("buyer_provision");
  }

  {
    const challenge = await api(
      "GET",
      `/api/v1/resources/${resourceId}?resource_token=${encodeURIComponent(resourceToken)}`,
    );
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
    await verifyTx(pay.data.receipt.tx_hash);
    receiptId = pay.data.receipt.receipt_id;
    buyerState = pay.data.wallet_state;
    checks.push("pay_verify_tx");
  }

  {
    const got = await api("GET", `/api/v1/resources/${resourceId}`, {
      key: buyerKey,
      walletState: buyerState,
      headers: { "X-PAYMENT": receiptId },
    });
    assert(got.status === 200 && got.data?.data?.multi === n, `${tag} deliver`, got.data);
    checks.push("deliver");
  }

  {
    const listed = await api("POST", "/api/v1/resources", {
      key: sellerKey,
      walletState: sellerState,
      body: { title: `auto-${n}`, price_usd: 0.07, payload: { auto: n } },
    });
    const rid = listed.data.resource.id;
    const rtoken = listed.data.resource_token;
    sellerState = listed.data.wallet_state || sellerState;

    const auto = await api(
      "GET",
      `/api/v1/resources/${rid}?resource_token=${encodeURIComponent(rtoken)}`,
      {
        key: buyerKey,
        walletState: buyerState,
        headers: { "X-PAYMENT": "auto", "X-Intent-Id": `auto-${n}-${Date.now()}` },
      },
    );
    assert(auto.status === 200 && auto.data?.data?.auto === n, `${tag} x-payment-auto`, auto.data);
    await verifyTx(auto.data.receipt.tx_hash);
    buyerState = auto.data.wallet_state || buyerState;
    checks.push("x_payment_auto");
  }

  {
    const top = await api("PUT", "/api/v1/agents", {
      key: buyerKey,
      walletState: buyerState,
      body: { action: "topup", fund_usdc: 0.05 },
    });
    assert(top.status === 200 && top.data?.ok && top.data?.tx_hash, `${tag} faucet topup`, top.data);
    await verifyTx(top.data.tx_hash);
    buyerState = top.data.wallet_state;
    checks.push("faucet_topup");
  }

  {
    const led = await api("GET", `/api/v1/ledger?agent_id=${encodeURIComponent(sellerId)}`);
    const credits = (led.data?.ledger || []).filter((e) => e.type === "credit");
    assert(led.status === 200 && credits.length >= 1, `${tag} seller credits`, {
      credits: credits.length,
    });
    checks.push("seller_credits");
  }

  {
    const demo = await api("POST", "/api/v1/demo/e2e", { body: { reset: true } });
    assert(demo.status === 200 && demo.data?.ok && demo.data.human_clicks === 0, `${tag} demo`, demo.data);
    await verifyTx(demo.data.receipt.tx_hash);
    checks.push("demo");
  }

  return checks;
}

async function main() {
  console.log(`\n=== 10-round chain autonomy loop @ ${base} ===\n`);
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
