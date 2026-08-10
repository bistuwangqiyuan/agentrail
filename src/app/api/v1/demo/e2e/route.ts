import { json, options } from "@/lib/http";
import { sealReceipt, sealWallet } from "@/lib/crypto-state";
import { persistDurable } from "@/lib/durable";
import { settlePayment } from "@/lib/settlement";
import { getStore, getWalletByApiKey, resetStore } from "@/lib/store";

export function OPTIONS() {
  return options();
}

/** One-shot end-to-end demo: Agent A pays Agent B with failover swap, zero human clicks */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  if (body.reset) resetStore();

  const store = getStore();
  const buyer = getWalletByApiKey("ar_buyer_demo_key_0001");
  const seller = store.wallets.get("agent_seller_demo");
  const resource = store.resources.get("res_market_alpha");

  if (!buyer || !seller || !resource) {
    return json({ error: "DEMO_SEED_MISSING" }, 500);
  }

  const before = {
    buyer: { ...buyer.balances },
    seller: { ...seller.balances },
  };

  const result = settlePayment({
    buyer,
    resourceId: resource.id,
    intentId: body.intent_id,
  });

  if (!result.ok) {
    return json({ ok: false, step: "settle", error: result }, 402);
  }

  await persistDurable(store);
  const afterBuyer = store.wallets.get(buyer.id)!;

  return json({
    ok: true,
    demo: "Agent A → paid → Agent B resource, autonomous failover if needed",
    human_clicks: 0,
    before,
    after: {
      buyer: afterBuyer.balances,
      seller: store.wallets.get(seller.id)?.balances,
    },
    receipt: result.receipt,
    receipt_token: sealReceipt(result.receipt),
    wallet_state: sealWallet(afterBuyer),
    data: result.payload,
    x402_compatible: true,
    failover_swap_used: Boolean(result.receipt.swap),
  });
}

export async function GET() {
  return json({
    endpoint: "POST /api/v1/demo/e2e",
    body: { reset: true },
    description: "Runs full unpaid→402-pattern→swap-if-needed→settle→deliver flow",
  });
}
