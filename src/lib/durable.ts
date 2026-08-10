import { promises as fs } from "fs";
import path from "path";
import os from "os";
import type {
  AgentWallet,
  LedgerEntry,
  PaidResource,
  Principal,
  Quote,
  SettlementReceipt,
} from "./types";
import { getStore, type Store } from "./store";
import { rememberKey } from "./chain/keys";
import type { Hex } from "viem";

type DurableSnapshot = {
  principals: Principal[];
  wallets: AgentWallet[];
  resources: PaidResource[];
  quotes: Quote[];
  receipts: SettlementReceipt[];
  ledger: LedgerEntry[];
  intents: string[];
  /** keyId -> privateKey (server-only durability) */
  keys?: Record<string, string>;
};

function durablePath(): string {
  return path.join(os.tmpdir(), "agentrail-durable-store.json");
}

function kvConfigured(): boolean {
  return Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
}

async function kvGet(key: string): Promise<string | null> {
  if (!kvConfigured()) return null;
  const url = `${process.env.KV_REST_API_URL}/get/${encodeURIComponent(key)}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}` },
    cache: "no-store",
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { result?: string | null };
  return data.result ?? null;
}

async function kvSet(key: string, value: string): Promise<void> {
  if (!kvConfigured()) return;
  const url = `${process.env.KV_REST_API_URL}/set/${encodeURIComponent(key)}`;
  await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(value),
  });
}

function applySnapshot(snap: DurableSnapshot): void {
  const store = getStore();
  for (const p of snap.principals || []) store.principals.set(p.id, p);
  for (const w of snap.wallets || []) {
    store.wallets.set(w.id, w);
    store.apiKeys.set(w.api_key, w.id);
  }
  for (const r of snap.resources || []) store.resources.set(r.id, r);
  for (const q of snap.quotes || []) store.quotes.set(q.quote_id, q);
  for (const rc of snap.receipts || []) store.receipts.set(rc.receipt_id, rc);
  if (Array.isArray(snap.ledger)) store.ledger = snap.ledger;
  for (const i of snap.intents || []) store.intents.add(i);
  if (snap.keys) {
    for (const [keyId, pk] of Object.entries(snap.keys)) {
      rememberKey(keyId, pk as Hex);
    }
  }
}

export async function loadDurableIntoMemory(): Promise<void> {
  try {
    const fromKv = await kvGet("agentrail:store");
    if (fromKv) {
      applySnapshot(JSON.parse(fromKv) as DurableSnapshot);
      return;
    }
  } catch {
    // fall through to file
  }
  try {
    const raw = await fs.readFile(durablePath(), "utf8");
    applySnapshot(JSON.parse(raw) as DurableSnapshot);
  } catch {
    // no durable file yet
  }
}

export async function persistDurable(store: Store = getStore()): Promise<void> {
  // Collect keys from global key store via wallet key_ids — keys module doesn't export all;
  // persist key material only when attached on wallet via side map in keys.ts
  const { getPrivateKeyByKeyId } = await import("./chain/keys");
  const keys: Record<string, string> = {};
  for (const w of store.wallets.values()) {
    const pk = getPrivateKeyByKeyId(w.key_id);
    if (pk) keys[w.key_id] = pk;
  }

  const snap: DurableSnapshot = {
    principals: [...store.principals.values()],
    wallets: [...store.wallets.values()],
    resources: [...store.resources.values()],
    quotes: [...store.quotes.values()],
    receipts: [...store.receipts.values()],
    ledger: store.ledger,
    intents: [...store.intents],
    keys,
  };
  const payload = JSON.stringify(snap);
  try {
    await kvSet("agentrail:store", payload);
  } catch {
    // ignore kv errors
  }
  try {
    await fs.writeFile(durablePath(), payload, "utf8");
  } catch {
    // serverless may deny — signed portable state still works
  }
}

export function hydrateWallet(wallet: AgentWallet): void {
  const store = getStore();
  store.wallets.set(wallet.id, wallet);
  store.apiKeys.set(wallet.api_key, wallet.id);
}

export function hydrateResource(resource: PaidResource): void {
  getStore().resources.set(resource.id, resource);
}

export function hydrateReceipt(receipt: SettlementReceipt): void {
  const store = getStore();
  store.receipts.set(receipt.receipt_id, receipt);
  store.intents.add(receipt.intent_id);
}
