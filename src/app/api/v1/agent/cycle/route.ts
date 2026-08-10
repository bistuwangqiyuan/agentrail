import { json, options } from "@/lib/http";
import { sealReceipt, sealResource, sealWallet } from "@/lib/crypto-state";
import { persistDurable } from "@/lib/durable";
import { ensureDurableLoaded } from "@/lib/agent-context";
import { settlePayment } from "@/lib/settlement";
import { getStore, newId } from "@/lib/store";
import { createAgentKey } from "@/lib/chain/keys";
import { fundUsdc, getUsdcBalance } from "@/lib/chain";
import type { Asset, WalletPolicy } from "@/lib/types";
import type { Address } from "viem";

export function OPTIONS() {
  return options();
}

export async function POST(req: Request) {
  await ensureDurableLoaded();
  const body = await req.json().catch(() => ({}));
  const store = getStore();

  const sellerPrin = {
    id: newId("prin"),
    name: String(body.seller_principal_name || "Cycle Seller Principal"),
    kyc_status: "verified" as const,
    created_at: new Date().toISOString(),
  };
  const buyerPrin = {
    id: newId("prin"),
    name: String(body.buyer_principal_name || "Cycle Buyer Principal"),
    kyc_status: "verified" as const,
    created_at: new Date().toISOString(),
  };
  store.principals.set(sellerPrin.id, sellerPrin);
  store.principals.set(buyerPrin.id, buyerPrin);

  const policy = (over: Partial<WalletPolicy> = {}): WalletPolicy => ({
    daily_cap_usd: 100,
    per_tx_cap_usd: 20,
    allowlist: ["*"],
    max_slippage_bps: 250,
    assets: ["USDC", "USDT", "EURC"],
    ...over,
  });

  const sellerId = newId("agent");
  const buyerId = newId("agent");
  const sellerKey = `ar_${newId("key")}`;
  const buyerKey = `ar_${newId("key")}`;
  const sellerChain = createAgentKey(sellerId);
  const buyerChain = createAgentKey(buyerId);

  await fundUsdc(sellerChain.address, 1);
  // Buyer starts USDT-heavy to force failover swap → on-chain USDC fund then pay
  const buyerUsdt = Number(body.buyer_usdt ?? 15);
  const buyerUsdcInit = Number(body.buyer_usdc ?? 0);
  if (buyerUsdcInit > 0) await fundUsdc(buyerChain.address, buyerUsdcInit);

  const seller = {
    id: sellerId,
    principal_id: sellerPrin.id,
    api_key: sellerKey,
    label: "cycle-seller",
    address: sellerChain.address as `0x${string}`,
    key_id: sellerChain.keyId,
    balances: {
      USDC: await getUsdcBalance(sellerChain.address),
      USDT: 0,
      EURC: 0,
    },
    policy: policy(),
    spent_today_usd: 0,
    created_at: new Date().toISOString(),
  };
  const buyer = {
    id: buyerId,
    principal_id: buyerPrin.id,
    api_key: buyerKey,
    label: "cycle-buyer",
    address: buyerChain.address as `0x${string}`,
    key_id: buyerChain.keyId,
    balances: {
      USDC: await getUsdcBalance(buyerChain.address as Address),
      USDT: buyerUsdt,
      EURC: 0,
    },
    policy: policy({ max_slippage_bps: 250 }),
    spent_today_usd: 0,
    created_at: new Date().toISOString(),
  };

  store.wallets.set(sellerId, seller);
  store.wallets.set(buyerId, buyer);
  store.apiKeys.set(sellerKey, sellerId);
  store.apiKeys.set(buyerKey, buyerId);

  const price = Number(body.price_usd ?? 0.15);
  const resource = {
    id: newId("res"),
    seller_agent_id: sellerId,
    title: String(body.title || "Cycle Paid Resource"),
    description: "Created and settled entirely by agents in one call",
    price_usd: price,
    asset: "USDC" as Asset,
    network: "base-sepolia" as const,
    pay_to: seller.address,
    payload: body.payload ?? { cycle: true, at: Date.now() },
  };
  store.resources.set(resource.id, resource);

  const before = {
    buyer: { ...buyer.balances },
    seller: { ...seller.balances },
  };

  const result = await settlePayment({
    buyer,
    resourceId: resource.id,
    intentId: body.intent_id ? String(body.intent_id) : newId("intent"),
  });

  if (!result.ok) {
    return json({ ok: false, human_clicks: 0, error: result }, 402);
  }

  await persistDurable(store);
  const afterBuyer = store.wallets.get(buyerId)!;
  const afterSeller = store.wallets.get(sellerId)!;

  return json({
    ok: true,
    human_clicks: 0,
    failover_swap_used: Boolean(result.receipt.swap),
    settlement_mode: result.receipt.settlement_mode,
    seller: {
      agent_id: sellerId,
      api_key: sellerKey,
      address: afterSeller.address,
      wallet_state: sealWallet(afterSeller),
      balances: afterSeller.balances,
    },
    buyer: {
      agent_id: buyerId,
      api_key: buyerKey,
      address: afterBuyer.address,
      wallet_state: sealWallet(afterBuyer),
      balances: afterBuyer.balances,
    },
    resource: {
      ...resource,
      resource_token: sealResource(resource),
    },
    before,
    after: {
      buyer: afterBuyer.balances,
      seller: afterSeller.balances,
    },
    receipt: result.receipt,
    receipt_token: sealReceipt(result.receipt),
    data: result.payload,
  });
}

export async function GET() {
  return json({
    endpoint: "POST /api/v1/agent/cycle",
    description: "Fully autonomous provision→list→pay→deliver→credit with on-chain/local USDC",
  });
}
