import { json, options } from "@/lib/http";
import { getStore, newId } from "@/lib/store";
import type { Asset, Network } from "@/lib/types";
import { getApiKey } from "@/lib/http";
import { getWalletByApiKey } from "@/lib/store";

export function OPTIONS() {
  return options();
}

export async function GET() {
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
    })),
  });
}

export async function POST(req: Request) {
  const apiKey = getApiKey(req);
  const seller = getWalletByApiKey(apiKey);
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
  return json({ resource, url: `/api/v1/resources/${id}` });
}
