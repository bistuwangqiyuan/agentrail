import { json, options } from "@/lib/http";
import { getStore, resetStore } from "@/lib/store";

export function OPTIONS() {
  return options();
}

export async function GET() {
  const store = getStore();
  return json({
    service: "agentrail",
    status: "ok",
    time: new Date().toISOString(),
    agents: store.wallets.size,
    resources: store.resources.size,
    receipts: store.receipts.size,
    ledger_entries: store.ledger.length,
  });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  if (body.action === "reset") {
    resetStore();
    return json({ ok: true, reset: true });
  }
  return json({ error: "Unknown action" }, 400);
}
