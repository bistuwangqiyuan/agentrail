import { json, options } from "@/lib/http";
import { getStore, resetStore, fundSeedWallets } from "@/lib/store";
import { getChainConfig } from "@/lib/chain";

export function OPTIONS() {
  return options();
}

export async function GET() {
  const store = getStore();
  const cfg = getChainConfig();
  return json({
    service: "agentrail",
    status: "ok",
    time: new Date().toISOString(),
    settlement_mode: cfg.mode,
    network: cfg.network,
    usdc: cfg.usdc,
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
    await fundSeedWallets();
    return json({ ok: true, reset: true, settlement_mode: getChainConfig().mode });
  }
  return json({ error: "Unknown action" }, 400);
}
