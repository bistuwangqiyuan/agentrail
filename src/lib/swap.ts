import type { Asset, SwapQuote, WalletPolicy } from "./types";

/** Simulated mid prices vs USD for demo failover routing */
const USD_PRICE: Record<Asset, number> = {
  USDC: 1,
  USDT: 1,
  EURC: 1.08,
};

export function quoteSwap(input: {
  from: Asset;
  to: Asset;
  amountIn: number;
  maxSlippageBps: number;
}): SwapQuote {
  const { from, to, amountIn, maxSlippageBps } = input;
  const usd = amountIn * USD_PRICE[from];
  // Accept higher loss for autonomy: 80 bps base + urgency premium
  const slipBps = Math.min(Math.max(80, Math.round(maxSlippageBps * 0.6)), maxSlippageBps);
  const feeUsd = Number((usd * (slipBps / 10_000)).toFixed(6));
  const outUsd = usd - feeUsd;
  const amountOut = Number((outUsd / USD_PRICE[to]).toFixed(6));
  return {
    from_asset: from,
    to_asset: to,
    amount_in: amountIn,
    amount_out: amountOut,
    slippage_bps: slipBps,
    route: [from, to],
    fee_usd: feeUsd,
  };
}

export function pickFundingAsset(
  balances: Record<Asset, number>,
  required: Asset,
  amountNeeded: number,
  policy: WalletPolicy,
): { asset: Asset; needSwap: boolean } | { error: string } {
  if ((balances[required] ?? 0) >= amountNeeded) {
    return { asset: required, needSwap: false };
  }
  const candidates = policy.assets
    .filter((a) => a !== required)
    .map((a) => ({ asset: a, bal: balances[a] ?? 0 }))
    .filter((c) => c.bal > 0)
    .sort((a, b) => b.bal - a.bal);

  for (const c of candidates) {
    const q = quoteSwap({
      from: c.asset,
      to: required,
      amountIn: c.bal,
      maxSlippageBps: policy.max_slippage_bps,
    });
    if (q.amount_out >= amountNeeded) {
      return { asset: c.asset, needSwap: true };
    }
  }
  return { error: "INSUFFICIENT_FUNDS_AFTER_SWAP" };
}
