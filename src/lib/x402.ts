import type { Asset, FeeBreakdown, Network, PaymentRequirements, Quote } from "./types";
import { newId } from "./store";

export const PLATFORM_TAKE_RATE = 0.025;
export const FACILITATOR_FEE_USD = 0.001;
export const NETWORK_FEE_USD = 0.002;
export const MIN_PLATFORM_FEE_USD = 0.001;

export function computeFees(amountUsd: number, swapSlippageUsd = 0): FeeBreakdown {
  const platform_fee = Math.max(amountUsd * PLATFORM_TAKE_RATE, MIN_PLATFORM_FEE_USD);
  const network_fee = NETWORK_FEE_USD;
  const facilitator_fee = FACILITATOR_FEE_USD;
  const swap_slippage = Number(swapSlippageUsd.toFixed(6));
  const total_fee = Number(
    (platform_fee + network_fee + facilitator_fee + swap_slippage).toFixed(6),
  );
  return {
    network_fee,
    platform_fee: Number(platform_fee.toFixed(6)),
    swap_slippage,
    facilitator_fee,
    total_fee,
  };
}

export function toAtomic(amount: number): string {
  // 6 decimals like USDC
  return Math.round(amount * 1_000_000).toString();
}

export function fromAtomic(atomic: string): number {
  return Number(atomic) / 1_000_000;
}

export function buildX402Requirements(input: {
  resource: string;
  description: string;
  priceUsd: number;
  asset: Asset;
  network: Network;
  payTo: string;
}): PaymentRequirements {
  return {
    x402Version: 1,
    scheme: "exact",
    network: input.network,
    maxAmountRequired: toAtomic(input.priceUsd),
    resource: input.resource,
    description: input.description,
    mimeType: "application/json",
    payTo: input.payTo,
    asset: input.asset,
    maxTimeoutSeconds: 60,
    extra: {
      facilitator: "agentrail",
      take_rate: PLATFORM_TAKE_RATE,
    },
  };
}

export function buildQuote(input: {
  resourceId: string;
  sellerAgentId: string;
  priceUsd: number;
  asset: Asset;
  network: Network;
  payTo: string;
  description: string;
}): Quote {
  return {
    quote_id: newId("quote"),
    resource_id: input.resourceId,
    seller_agent_id: input.sellerAgentId,
    price_usd: input.priceUsd,
    asset: input.asset,
    network: input.network,
    pay_to: input.payTo,
    expires_at: new Date(Date.now() + 60_000).toISOString(),
    description: input.description,
  };
}

export function fakeTxHash(): string {
  return `0x${Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join("")}`;
}
