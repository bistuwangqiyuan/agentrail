import { getApiKey, json, options } from "@/lib/http";
import { getStore, getWalletByApiKey, newId } from "@/lib/store";
import type { Asset, WalletPolicy } from "@/lib/types";

export function OPTIONS() {
  return options();
}

export async function GET(req: Request) {
  const key = getApiKey(req);
  const me = getWalletByApiKey(key);
  if (!me) return json({ error: "UNAUTHORIZED" }, 401);
  return json({
    agent: {
      id: me.id,
      label: me.label,
      principal_id: me.principal_id,
      balances: me.balances,
      policy: me.policy,
      spent_today_usd: me.spent_today_usd,
    },
  });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const store = getStore();

  const principalId = String(body.principal_id || "prin_demo");
  const principal = store.principals.get(principalId);
  if (!principal || principal.kyc_status !== "verified") {
    return json(
      {
        error: "KYA_PRINCIPAL_REQUIRED",
        message: "Agent must bind to a verified principal (KYA). No anonymous wallets.",
      },
      400,
    );
  }

  const policy: WalletPolicy = {
    daily_cap_usd: Number(body.daily_cap_usd ?? 50),
    per_tx_cap_usd: Number(body.per_tx_cap_usd ?? 5),
    allowlist: Array.isArray(body.allowlist) ? body.allowlist.map(String) : ["*"],
    max_slippage_bps: Number(body.max_slippage_bps ?? 150),
    assets: (body.assets as Asset[]) || ["USDC", "USDT", "EURC"],
  };

  const apiKey = `ar_${newId("key")}`;
  const id = newId("agent");
  const wallet = {
    id,
    principal_id: principalId,
    api_key: apiKey,
    label: String(body.label || "agent"),
    balances: {
      USDC: Number(body.fund_usdc ?? 5),
      USDT: Number(body.fund_usdt ?? 0),
      EURC: Number(body.fund_eurc ?? 0),
    },
    policy,
    spent_today_usd: 0,
    created_at: new Date().toISOString(),
  };

  store.wallets.set(id, wallet);
  store.apiKeys.set(apiKey, id);

  return json({
    agent_id: id,
    api_key: apiKey,
    principal_id: principalId,
    balances: wallet.balances,
    policy: wallet.policy,
    note: "Store api_key securely. Agent uses X-Api-Key header — no human login form.",
  });
}
