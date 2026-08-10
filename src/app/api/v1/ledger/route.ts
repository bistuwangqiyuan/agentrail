import { json, options } from "@/lib/http";
import { getStore } from "@/lib/store";

export function OPTIONS() {
  return options();
}

export async function GET(req: Request) {
  const store = getStore();
  const url = new URL(req.url);
  const agentId = url.searchParams.get("agent_id");
  const limit = Math.min(Number(url.searchParams.get("limit") || 100), 500);

  let entries = store.ledger.slice().reverse();
  if (agentId) entries = entries.filter((e) => e.agent_id === agentId);
  entries = entries.slice(0, limit);

  return json({
    count: entries.length,
    receipts: [...store.receipts.values()].slice(-50).reverse(),
    ledger: entries,
    export_format: "application/json",
    note: "Machine-readable audit export. No human ticket required.",
  });
}
