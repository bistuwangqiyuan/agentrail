import { json, options } from "@/lib/http";
import { getStore } from "@/lib/store";
import { quoteSwap } from "@/lib/swap";
import { getChainConfig } from "@/lib/chain";
import type { Asset } from "@/lib/types";

export function OPTIONS() {
  return options();
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const from = body.from_asset as Asset;
  const to = body.to_asset as Asset;
  const amountIn = Number(body.amount_in);
  const maxSlippageBps = Number(body.max_slippage_bps ?? 150);

  if (!from || !to || !Number.isFinite(amountIn) || amountIn <= 0) {
    return json({ error: "Invalid swap quote request" }, 400);
  }

  const quote = quoteSwap({ from, to, amountIn, maxSlippageBps });
  return json({
    quote,
    settlement_mode: getChainConfig().mode,
    note: "Failover via funding-pool/local-pool when Uniswap depth unavailable. Autonomy > cheapest price.",
  });
}

export async function GET() {
  const store = getStore();
  return json({
    supported_assets: ["USDC", "USDT", "EURC"],
    settlement_mode: getChainConfig().mode,
    demo_hint: "Buyer may hold USDT credits; resource prices in USDC → auto failover pool swap + on-chain USDC pay",
    wallets: [...store.wallets.values()].map((w) => ({
      id: w.id,
      address: w.address,
      balances: w.balances,
    })),
  });
}
