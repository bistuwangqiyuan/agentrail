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

type DurableSnapshot = {
  principals: Principal[];
  wallets: AgentWallet[];
  resources: PaidResource[];
  quotes: Quote[];
  receipts: SettlementReceipt[];
  ledger: LedgerEntry[];
  intents: string[];
};

function durablePath(): string {
  return path.join(os.tmpdir(), "agentrail-durable-store.json");
}

export async function loadDurableIntoMemory(): Promise<void> {
  try {
    const raw = await fs.readFile(durablePath(), "utf8");
    const snap = JSON.parse(raw) as DurableSnapshot;
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
  } catch {
    // no durable file yet — fine
  }
}

export async function persistDurable(store: Store = getStore()): Promise<void> {
  const snap: DurableSnapshot = {
    principals: [...store.principals.values()],
    wallets: [...store.wallets.values()],
    resources: [...store.resources.values()],
    quotes: [...store.quotes.values()],
    receipts: [...store.receipts.values()],
    ledger: store.ledger,
    intents: [...store.intents],
  };
  try {
    await fs.writeFile(durablePath(), JSON.stringify(snap), "utf8");
  } catch {
    // serverless may deny — signed portable state still works
  }
}

/** Ensure wallet from signed header is merged into memory store */
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
