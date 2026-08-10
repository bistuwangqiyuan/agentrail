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
import { ensureDemoKeys } from "./chain/keys";
import { fundUsdc } from "./chain";
import { resetLocalChain } from "./chain/local";
import type { Address } from "viem";

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

function makeWallet(input: {
  id: string;
  principal_id: string;
  api_key: string;
  label: string;
  policy: AgentWallet["policy"];
  usdt?: number;
  eurc?: number;
}): AgentWallet {
  const keyId = `key_${input.id}`;
  const { address } = ensureDemoKeys(input.id, keyId);
  return {
    id: input.id,
    principal_id: input.principal_id,
    api_key: input.api_key,
    label: input.label,
    address: address as `0x${string}`,
    key_id: keyId,
    balances: { USDC: 0, USDT: input.usdt ?? 0, EURC: input.eurc ?? 0 },
    policy: input.policy,
    spent_today_usd: 0,
    created_at: new Date().toISOString(),
  };
}

function seedStore(): Store {
  resetLocalChain();
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

  const seller = makeWallet({
    id: "agent_seller_demo",
    principal_id: principal.id,
    api_key: sellerKey,
    label: "Seller Agent B",
    policy: {
      daily_cap_usd: 1000,
      per_tx_cap_usd: 100,
      allowlist: ["*"],
      max_slippage_bps: 150,
      assets: ["USDC", "USDT", "EURC"],
    },
  });

  const buyer = makeWallet({
    id: "agent_buyer_demo",
    principal_id: principal.id,
    api_key: buyerKey,
    label: "Buyer Agent A",
    usdt: 25,
    policy: {
      daily_cap_usd: 50,
      per_tx_cap_usd: 5,
      allowlist: ["*"],
      max_slippage_bps: 150,
      assets: ["USDC", "USDT", "EURC"],
    },
  });

  store.wallets.set(seller.id, seller);
  store.wallets.set(buyer.id, buyer);
  store.apiKeys.set(sellerKey, seller.id);
  store.apiKeys.set(buyerKey, buyer.id);

  // Async fund not available in sync seed — mark pending; demo/e2e will fund
  store.resources.set("res_market_alpha", {
    id: "res_market_alpha",
    seller_agent_id: seller.id,
    title: "Market Alpha Signal",
    description: "Machine-readable market brief for agent consumers",
    price_usd: 0.25,
    asset: "USDC",
    network: "base-sepolia",
    pay_to: seller.address,
    payload: {
      signal: "neutral-bullish",
      confidence: 0.72,
      as_of: new Date().toISOString(),
      note: "Synthetic demo payload — not financial advice",
    },
  });

  return store;
}

/** Fund seeded demo wallets on-chain/local after reset */
export async function fundSeedWallets(): Promise<void> {
  const store = getStore();
  const seller = store.wallets.get("agent_seller_demo");
  const buyer = store.wallets.get("agent_buyer_demo");
  if (seller) {
    await fundUsdc(seller.address as Address, 10);
    seller.balances.USDC = 10;
  }
  if (buyer) {
    await fundUsdc(buyer.address as Address, 0.05);
    buyer.balances.USDC = 0.05;
    buyer.balances.USDT = 25;
  }
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
