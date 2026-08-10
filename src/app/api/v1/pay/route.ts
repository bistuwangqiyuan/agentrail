import { json, options } from "@/lib/http";
import { openResource, sealReceipt, sealWallet } from "@/lib/crypto-state";
import { hydrateResource, persistDurable } from "@/lib/durable";
import { resolveBuyer } from "@/lib/agent-context";
import { settlePayment } from "@/lib/settlement";
import { getStore } from "@/lib/store";
import { createAgentKey } from "@/lib/chain/keys";
import type { PaidResource } from "@/lib/types";

export function OPTIONS() {
  return options();
}

function ensureSellerStub(sellerId: string) {
  const store = getStore();
  if (store.wallets.has(sellerId)) {
    const w = store.wallets.get(sellerId)!;
    if (w.address) return;
  }
  const { address, keyId } = createAgentKey(sellerId);
  store.wallets.set(sellerId, {
    id: sellerId,
    principal_id: "prin_external",
    api_key: `stub_${sellerId}`,
    label: "external-seller",
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

function resolveResource(body: Record<string, unknown>): PaidResource | null {
  const store = getStore();
  if (body.resource_token) {
    const embedded = openResource(String(body.resource_token));
    if (embedded) {
      hydrateResource(embedded);
      return embedded;
    }
  }
  const id = body.resource_id ? String(body.resource_id) : "";
  if (id && store.resources.has(id)) return store.resources.get(id)!;
  return null;
}

export async function POST(req: Request) {
  const buyer = await resolveBuyer(req);
  if (!buyer) {
    return json(
      { error: "UNAUTHORIZED", message: "X-Api-Key or X-Wallet-State required" },
      401,
    );
  }

  const body = await req.json().catch(() => ({}));
  const resource = resolveResource(body);
  if (!resource) return json({ error: "RESOURCE_NOT_FOUND" }, 404);

  ensureSellerStub(resource.seller_agent_id);

  const store = getStore();
  const result = await settlePayment({
    buyer,
    resourceId: resource.id,
    intentId: body.intent_id ? String(body.intent_id) : undefined,
  });

  if (!result.ok) {
    return json(
      {
        ok: false,
        error: result.code,
        message: result.message,
        fee_breakdown: result.fee_breakdown,
        wallet_state: sealWallet(store.wallets.get(buyer.id) || buyer),
      },
      402,
    );
  }

  await persistDurable(store);
  const freshBuyer = store.wallets.get(buyer.id)!;
  const freshSeller = store.wallets.get(resource.seller_agent_id);

  return json({
    ok: true,
    receipt: result.receipt,
    receipt_token: sealReceipt(result.receipt),
    data: result.payload,
    wallet_state: sealWallet(freshBuyer),
    seller_balances: freshSeller?.balances,
    seller_address: freshSeller?.address,
  });
}
