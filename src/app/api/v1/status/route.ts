import { json, options } from "@/lib/http";
import { getStore, resetStore, fundSeedWallets } from "@/lib/store";
import { getChainConfig, getUsdcBalance } from "@/lib/chain";
import { getPublicClient } from "@/lib/chain/client";
import { privateKeyToAccount } from "viem/accounts";
import { formatEther } from "viem";

export function OPTIONS() {
  return options();
}

export async function GET() {
  const store = getStore();
  const cfg = getChainConfig();
  let sponsor: {
    address: string | null;
    eth: string | null;
    usdc: number | null;
    funded: boolean;
  } = { address: null, eth: null, usdc: null, funded: false };

  if (cfg.sponsorKey) {
    try {
      const account = privateKeyToAccount(cfg.sponsorKey);
      const publicClient = getPublicClient();
      const ethBal = await publicClient.getBalance({ address: account.address });
      const usdcBal = await getUsdcBalance(account.address);
      sponsor = {
        address: account.address,
        eth: formatEther(ethBal),
        usdc: usdcBal,
        funded: ethBal > 0n && usdcBal > 0,
      };
    } catch {
      sponsor = { address: null, eth: null, usdc: null, funded: false };
    }
  }

  return json({
    service: "agentrail",
    status: "ok",
    time: new Date().toISOString(),
    settlement_mode: cfg.mode,
    network: cfg.network,
    usdc: cfg.usdc,
    rpc: cfg.rpcUrl,
    sponsor,
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
