import { nanoid } from "nanoid";
import type {
  AgentWallet,
  Asset,
  LedgerEntry,
  PaidResource,
  Principal,
  Quote,
  SettlementReceipt,
} from "./types";

export type Store = {
  principals: Map<string, Principal>;
  wallets: Map<string, AgentWallet>;
  apiKeys: Map<string, string>;
  resources: Map<string, PaidResource>;
  quotes: Map<string, Quote>;
  receipts: Map<string, SettlementReceipt>;
  ledger: LedgerEntry[];
  intents: Set<string>;
};

declare global {
  var __agentrail_store: Store | undefined;
}

function seedStore(): Store {
  const store: Store = {
    principals: new Map(),
    wallets: new Map(),
    apiKeys: new Map(),
    resources: new Map(),
    quotes: new Map(),
    receipts: new Map(),
    ledger: [],
    intents: new Set(),
  };

  const principal: Principal = {
    id: "prin_demo",
    name: "Demo Principal LLC",
    kyc_status: "verified",
    created_at: new Date().toISOString(),
  };
  store.principals.set(principal.id, principal);

  const sellerKey = "ar_seller_demo_key_0001";
  const buyerKey = "ar_buyer_demo_key_0001";

  const seller: AgentWallet = {
    id: "agent_seller_demo",
    principal_id: principal.id,
    api_key: sellerKey,
    label: "Seller Agent B",
    balances: { USDC: 10, USDT: 0, EURC: 0 },
    policy: {
      daily_cap_usd: 1000,
      per_tx_cap_usd: 100,
      allowlist: ["*"],
      max_slippage_bps: 150,
      assets: ["USDC", "USDT", "EURC"],
    },
    spent_today_usd: 0,
    created_at: new Date().toISOString(),
  };

  const buyer: AgentWallet = {
    id: "agent_buyer_demo",
    principal_id: principal.id,
    api_key: buyerKey,
    label: "Buyer Agent A",
    // Intentionally holds USDT so failover swap path can be demonstrated
    balances: { USDC: 0.05, USDT: 25, EURC: 0 },
    policy: {
      daily_cap_usd: 50,
      per_tx_cap_usd: 5,
      allowlist: ["*"],
      max_slippage_bps: 150,
      assets: ["USDC", "USDT", "EURC"],
    },
    spent_today_usd: 0,
    created_at: new Date().toISOString(),
  };

  store.wallets.set(seller.id, seller);
  store.wallets.set(buyer.id, buyer);
  store.apiKeys.set(sellerKey, seller.id);
  store.apiKeys.set(buyerKey, buyer.id);

  const resource: PaidResource = {
    id: "res_market_alpha",
    seller_agent_id: seller.id,
    title: "Market Alpha Signal",
    description: "Machine-readable market brief for agent consumers",
    price_usd: 0.25,
    asset: "USDC",
    network: "base-sepolia",
    payload: {
      signal: "neutral-bullish",
      confidence: 0.72,
      as_of: new Date().toISOString(),
      note: "Synthetic demo payload — not financial advice",
    },
  };
  store.resources.set(resource.id, resource);

  return store;
}

export function getStore(): Store {
  if (!globalThis.__agentrail_store) {
    globalThis.__agentrail_store = seedStore();
  }
  return globalThis.__agentrail_store;
}

export function resetStore(): Store {
  globalThis.__agentrail_store = seedStore();
  return globalThis.__agentrail_store;
}

export function newId(prefix: string): string {
  return `${prefix}_${nanoid(10)}`;
}

export function appendLedger(
  store: Store,
  entry: Omit<LedgerEntry, "id" | "created_at">,
): LedgerEntry {
  const full: LedgerEntry = {
    ...entry,
    id: newId("led"),
    created_at: new Date().toISOString(),
  };
  store.ledger.push(full);
  return full;
}

export function getWalletByApiKey(apiKey: string | null): AgentWallet | null {
  if (!apiKey) return null;
  const store = getStore();
  const id = store.apiKeys.get(apiKey);
  if (!id) return null;
  return store.wallets.get(id) ?? null;
}

export function listBalances(wallet: AgentWallet): Record<Asset, number> {
  return { ...wallet.balances };
}
