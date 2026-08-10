import { getApiKey, json, options, paymentRequired } from "@/lib/http";
import { settlePayment } from "@/lib/settlement";
import { getStore, getWalletByApiKey } from "@/lib/store";
import { buildQuote, buildX402Requirements, fromAtomic } from "@/lib/x402";

type Ctx = { params: Promise<{ id: string }> };

export function OPTIONS() {
  return options();
}

export async function GET(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const store = getStore();
  const resource = store.resources.get(id);
  if (!resource) return json({ error: "NOT_FOUND" }, 404);

  const seller = store.wallets.get(resource.seller_agent_id);
  const payTo = seller?.id || resource.seller_agent_id;
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
  const apiKey = getApiKey(req);

  // If client already attaches payment proof (agentrail receipt id or "auto")
  if (paymentHeader === "auto" && apiKey) {
    const buyer = getWalletByApiKey(apiKey);
    if (!buyer) return json({ error: "UNAUTHORIZED" }, 401);
    const intentId = req.headers.get("x-intent-id") || undefined;
    const result = settlePayment({ buyer, resourceId: id, intentId });
    if (!result.ok) {
      return json(
        {
          error: result.code,
          message: result.message,
          fee_breakdown: result.fee_breakdown,
          accepts,
          quote,
        },
        402,
      );
    }
    return json({
      resource_id: id,
      title: resource.title,
      data: result.payload,
      receipt: result.receipt,
    });
  }

  if (paymentHeader && paymentHeader.startsWith("rcpt_")) {
    const receipt = store.receipts.get(paymentHeader);
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
    how_to_pay: {
      option_a: "POST /api/v1/pay with { resource_id } and X-Api-Key",
      option_b: "Retry GET with headers X-Api-Key and X-PAYMENT: auto",
      amount_usd: fromAtomic(accepts.maxAmountRequired),
    },
  });
}
