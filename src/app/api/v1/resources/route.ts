import { json, options } from "@/lib/http";
import { sealResource, sealWallet } from "@/lib/crypto-state";
import { persistDurable } from "@/lib/durable";
import { ensureDurableLoaded, resolveSeller } from "@/lib/agent-context";
import { getStore, newId } from "@/lib/store";
import type { Asset, Network } from "@/lib/types";

export function OPTIONS() {
  return options();
}

export async function GET() {
  await ensureDurableLoaded();
  const store = getStore();
  return json({
    resources: [...store.resources.values()].map((r) => ({
      id: r.id,
      title: r.title,
      description: r.description,
      price_usd: r.price_usd,
      asset: r.asset,
      network: r.network,
      seller_agent_id: r.seller_agent_id,
      url: `/api/v1/resources/${r.id}`,
      resource_token: sealResource(r),
    })),
  });
}

export async function POST(req: Request) {
  const seller = await resolveSeller(req);
  if (!seller) return json({ error: "UNAUTHORIZED" }, 401);

  const body = await req.json().catch(() => ({}));
  const store = getStore();
  const id = newId("res");
  const resource = {
    id,
    seller_agent_id: seller.id,
    title: String(body.title || "Untitled resource"),
    description: String(body.description || ""),
    price_usd: Number(body.price_usd ?? 0.1),
    asset: (body.asset as Asset) || "USDC",
    network: (body.network as Network) || "base-sepolia",
    payload: body.payload ?? { ok: true },
  };
  store.resources.set(id, resource);
  // Ensure seller wallet present for settlement credit
  store.wallets.set(seller.id, seller);
  store.apiKeys.set(seller.api_key, seller.id);
  await persistDurable(store);

  return json({
    resource,
    url: `/api/v1/resources/${id}`,
    resource_token: sealResource(resource),
    wallet_state: sealWallet(seller),
    note: "Buyers may pay with resource_token even across cold starts.",
  });
}
