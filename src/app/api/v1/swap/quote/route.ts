import { json, options } from "@/lib/http";
import { getStore } from "@/lib/store";
import { quoteSwap } from "@/lib/swap";
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
    note: "MVP uses simulated liquidity. Production routes via licensed venues / DEX aggregators.",
  });
}

export async function GET() {
  const store = getStore();
  return json({
    supported_assets: ["USDC", "USDT", "EURC"],
    demo_hint: "Buyer demo wallet holds USDT; resource prices in USDC → auto failover swap",
    wallets: [...store.wallets.values()].map((w) => ({
      id: w.id,
      balances: w.balances,
    })),
  });
}
