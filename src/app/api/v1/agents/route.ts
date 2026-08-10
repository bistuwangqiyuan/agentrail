import { json, options } from "@/lib/http";
import { sealWallet } from "@/lib/crypto-state";
import { persistDurable } from "@/lib/durable";
import { ensureDurableLoaded, publicWalletView, resolveBuyer } from "@/lib/agent-context";
import { getStore, newId } from "@/lib/store";
import type { Asset, WalletPolicy } from "@/lib/types";

export function OPTIONS() {
  return options();
}

export async function GET(req: Request) {
  const me = await resolveBuyer(req);
  if (!me) return json({ error: "UNAUTHORIZED" }, 401);
  return json({
    agent: publicWalletView(me),
    wallet_state: sealWallet(me),
  });
}

export async function POST(req: Request) {
  await ensureDurableLoaded();
  const body = await req.json().catch(() => ({}));
  const store = getStore();

  const principalId = String(body.principal_id || "prin_demo");
  let principal = store.principals.get(principalId);

  // Allow agent to auto-create principal inline (still KYA-bound, no human form)
  if (!principal && body.auto_principal) {
    principal = {
      id: principalId.startsWith("prin_") ? principalId : newId("prin"),
      name: String(body.principal_name || "Auto Principal"),
      kyc_status: "verified",
      created_at: new Date().toISOString(),
    };
    store.principals.set(principal.id, principal);
  }

  principal = store.principals.get(principalId) || principal;
  if (!principal || principal.kyc_status !== "verified") {
    return json(
      {
        error: "KYA_PRINCIPAL_REQUIRED",
        message: "Agent must bind to a verified principal (KYA). Use auto_principal:true or POST /principals.",
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
    principal_id: principal.id,
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
  await persistDurable(store);

  return json({
    agent_id: id,
    api_key: apiKey,
    principal_id: principal.id,
    balances: wallet.balances,
    policy: wallet.policy,
    wallet_state: sealWallet(wallet),
    note: "Carry X-Wallet-State on later calls for cold-start autonomy. No human login.",
  });
}

/** Agent self-service top-up / policy update via same path with method override body.action */
export async function PUT(req: Request) {
  const me = await resolveBuyer(req);
  if (!me) return json({ error: "UNAUTHORIZED" }, 401);
  const body = await req.json().catch(() => ({}));
  const store = getStore();
  const wallet = store.wallets.get(me.id);
  if (!wallet) return json({ error: "NOT_FOUND" }, 404);

  if (body.action === "topup") {
    wallet.balances.USDC = Number(
      (wallet.balances.USDC + Number(body.fund_usdc || 0)).toFixed(6),
    );
    wallet.balances.USDT = Number(
      (wallet.balances.USDT + Number(body.fund_usdt || 0)).toFixed(6),
    );
    wallet.balances.EURC = Number(
      (wallet.balances.EURC + Number(body.fund_eurc || 0)).toFixed(6),
    );
  } else if (body.action === "policy") {
    wallet.policy = {
      ...wallet.policy,
      ...(body.daily_cap_usd != null ? { daily_cap_usd: Number(body.daily_cap_usd) } : {}),
      ...(body.per_tx_cap_usd != null ? { per_tx_cap_usd: Number(body.per_tx_cap_usd) } : {}),
      ...(body.max_slippage_bps != null
        ? { max_slippage_bps: Number(body.max_slippage_bps) }
        : {}),
      ...(Array.isArray(body.allowlist) ? { allowlist: body.allowlist.map(String) } : {}),
    };
  } else {
    return json({ error: "action must be topup|policy" }, 400);
  }

  store.wallets.set(wallet.id, wallet);
  await persistDurable(store);
  return json({
    ok: true,
    agent: publicWalletView(wallet),
    wallet_state: sealWallet(wallet),
  });
}
