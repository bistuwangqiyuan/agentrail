import { json, options } from "@/lib/http";
import { ensureDurableLoaded } from "@/lib/agent-context";
import { openReceipt } from "@/lib/crypto-state";
import { hydrateReceipt } from "@/lib/durable";
import { getStore } from "@/lib/store";

export function OPTIONS() {
  return options();
}

export async function GET(req: Request) {
  await ensureDurableLoaded();
  const store = getStore();
  const url = new URL(req.url);
  const agentId = url.searchParams.get("agent_id");
  const limit = Math.min(Number(url.searchParams.get("limit") || 100), 500);
  const receiptToken = url.searchParams.get("receipt_token");
  if (receiptToken) {
    const r = openReceipt(receiptToken);
    if (r) hydrateReceipt(r);
  }

  let entries = store.ledger.slice().reverse();
  if (agentId) entries = entries.filter((e) => e.agent_id === agentId);
  entries = entries.slice(0, limit);

  return json({
    count: entries.length,
    receipts: [...store.receipts.values()].slice(-50).reverse(),
    ledger: entries,
    export_format: "application/json",
    note: "Machine-readable audit export. Seller agents verify collection here — no human ticket.",
  });
}
