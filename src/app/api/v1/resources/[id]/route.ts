import { json, options, paymentRequired } from "@/lib/http";
import { sealReceipt, sealResource, sealWallet, openReceipt, openResource } from "@/lib/crypto-state";
import { persistDurable, hydrateReceipt, hydrateResource } from "@/lib/durable";
import { ensureDurableLoaded, resolveBuyer } from "@/lib/agent-context";
import { settlePayment } from "@/lib/settlement";
import { getStore } from "@/lib/store";
import { buildQuote, buildX402Requirements, fromAtomic } from "@/lib/x402";
import { createAgentKey } from "@/lib/chain/keys";

type Ctx = { params: Promise<{ id: string }> };

export function OPTIONS() {
  return options();
}

function ensureSeller(sellerId: string) {
  const store = getStore();
  if (store.wallets.get(sellerId)?.address) return;
  const { address, keyId } = createAgentKey(sellerId);
  store.wallets.set(sellerId, {
    id: sellerId,
    principal_id: "prin_demo",
    api_key: `stub_${sellerId}`,
    label: "seller-stub",
    address: address as `0x${string}`,
    key_id: keyId,
    balances: { USDC: 0, USDT: 0, EURC: 0 },
    policy: {
      daily_cap_usd: 1e9,
      per_tx_cap_usd: 1e9,
      allowlist: ["*"],
      max_slippage_bps: 500,
      assets: ["USDC", "USDT", "EURC"],
    },
    spent_today_usd: 0,
    created_at: new Date().toISOString(),
  });
}

export async function GET(req: Request, ctx: Ctx) {
  await ensureDurableLoaded();
  const { id } = await ctx.params;
  const store = getStore();

  const url = new URL(req.url);
  const token = url.searchParams.get("resource_token");
  if (token) {
    const embedded = openResource(token);
    if (embedded) hydrateResource(embedded);
  }

  const resource = store.resources.get(id);
  if (!resource) return json({ error: "NOT_FOUND" }, 404);

  ensureSeller(resource.seller_agent_id);
  const seller = store.wallets.get(resource.seller_agent_id)!;
  const payTo = resource.pay_to || seller.address;
  const accepts = buildX402Requirements({
    resource: `/api/v1/resources/${id}`,
    description: resource.description,
    priceUsd: resource.price_usd,
    asset: resource.asset,
    network: resource.network,
    payTo,
  });
  const quote = buildQuote({
    resourceId: resource.id,
    sellerAgentId: resource.seller_agent_id,
    priceUsd: resource.price_usd,
    asset: resource.asset,
    network: resource.network,
    payTo,
    description: resource.description,
  });
  store.quotes.set(quote.quote_id, quote);

  const paymentHeader = req.headers.get("x-payment");
  const buyer = await resolveBuyer(req);

  if (paymentHeader === "auto" && buyer) {
    const intentId = req.headers.get("x-intent-id") || undefined;
    const result = await settlePayment({ buyer, resourceId: id, intentId });
    if (!result.ok) {
      return json(
        {
          error: result.code,
          message: result.message,
          fee_breakdown: result.fee_breakdown,
          accepts,
          quote,
          resource_token: sealResource(resource),
        },
        402,
      );
    }
    await persistDurable(store);
    const freshBuyer = store.wallets.get(buyer.id)!;
    return json({
      resource_id: id,
      title: resource.title,
      data: result.payload,
      receipt: result.receipt,
      receipt_token: sealReceipt(result.receipt),
      wallet_state: sealWallet(freshBuyer),
    });
  }

  if (paymentHeader) {
    const fromToken = openReceipt(paymentHeader);
    if (fromToken) hydrateReceipt(fromToken);
    const receipt = store.receipts.get(paymentHeader) || fromToken;
    if (receipt && receipt.status === "settled" && receipt.resource_id === id) {
      return json({
        resource_id: id,
        title: resource.title,
        data: resource.payload,
        receipt,
      });
    }
  }

  return paymentRequired({
    x402Version: 1,
    error: "PAYMENT_REQUIRED",
    accepts: [accepts],
    quote,
    resource_token: sealResource(resource),
    how_to_pay: {
      option_a: "POST /api/v1/pay with { resource_id, resource_token? } and X-Api-Key / X-Wallet-State",
      option_b: "Retry GET with X-PAYMENT: auto",
      amount_usd: fromAtomic(accepts.maxAmountRequired),
      pay_to_address: payTo,
    },
  });
}
