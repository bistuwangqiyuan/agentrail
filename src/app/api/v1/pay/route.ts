import { getApiKey, json, options } from "@/lib/http";
import { settlePayment } from "@/lib/settlement";
import { getWalletByApiKey } from "@/lib/store";

export function OPTIONS() {
  return options();
}

/** Agent-native pay endpoint — no human UI required */
export async function POST(req: Request) {
  const apiKey = getApiKey(req);
  const buyer = getWalletByApiKey(apiKey);
  if (!buyer) return json({ error: "UNAUTHORIZED", message: "X-Api-Key required" }, 401);

  const body = await req.json().catch(() => ({}));
  const resourceId = String(body.resource_id || "");
  if (!resourceId) return json({ error: "resource_id required" }, 400);

  const result = settlePayment({
    buyer,
    resourceId,
    intentId: body.intent_id ? String(body.intent_id) : undefined,
  });

  if (!result.ok) {
    return json(
      {
        ok: false,
        error: result.code,
        message: result.message,
        fee_breakdown: result.fee_breakdown,
      },
      402,
    );
  }

  return json({
    ok: true,
    receipt: result.receipt,
    data: result.payload,
  });
}
