import { getApiKey } from "./http";
import { openWallet, openResource, openReceipt } from "./crypto-state";
import { hydrateWallet, hydrateResource, hydrateReceipt, loadDurableIntoMemory } from "./durable";
import { getStore, getWalletByApiKey } from "./store";
import type { AgentWallet, PaidResource } from "./types";

let durableLoaded = false;

export async function ensureDurableLoaded(): Promise<void> {
  if (durableLoaded) return;
  await loadDurableIntoMemory();
  durableLoaded = true;
}

export async function resolveBuyer(req: Request): Promise<AgentWallet | null> {
  await ensureDurableLoaded();
  const key = getApiKey(req);
  const stateHeader = req.headers.get("x-wallet-state");
  const fromHeader = openWallet(stateHeader);
  if (fromHeader && (!key || fromHeader.api_key === key)) {
    hydrateWallet(fromHeader);
    return fromHeader;
  }
  return getWalletByApiKey(key);
}

export async function resolveSeller(req: Request): Promise<AgentWallet | null> {
  return resolveBuyer(req);
}

export function resolveResourceFromBody(body: Record<string, unknown>): PaidResource | null {
  const token = body.resource_token ? String(body.resource_token) : null;
  const embedded = openResource(token);
  if (embedded) {
    hydrateResource(embedded);
    return embedded;
  }
  if (body.resource && typeof body.resource === "object") {
    const r = body.resource as PaidResource;
    if (r.id && r.seller_agent_id && typeof r.price_usd === "number") {
      hydrateResource(r);
      return r;
    }
  }
  return null;
}

export function resolveReceiptToken(token: string | null): void {
  const receipt = openReceipt(token);
  if (receipt) hydrateReceipt(receipt);
}

export function publicWalletView(wallet: AgentWallet) {
  return {
    id: wallet.id,
    label: wallet.label,
    principal_id: wallet.principal_id,
    balances: wallet.balances,
    policy: wallet.policy,
    spent_today_usd: wallet.spent_today_usd,
  };
}

export { getStore };
