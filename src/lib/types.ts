export type Asset = "USDC" | "USDT" | "EURC";
export type Network = "base-sepolia" | "base" | "solana-devnet";

export type FeeBreakdown = {
  network_fee: number;
  platform_fee: number;
  swap_slippage: number;
  facilitator_fee: number;
  total_fee: number;
};

export type Principal = {
  id: string;
  name: string;
  kyc_status: "verified" | "pending";
  created_at: string;
};

export type WalletPolicy = {
  daily_cap_usd: number;
  per_tx_cap_usd: number;
  allowlist: string[];
  max_slippage_bps: number;
  assets: Asset[];
};

export type AgentWallet = {
  id: string;
  principal_id: string;
  api_key: string;
  label: string;
  balances: Record<Asset, number>;
  policy: WalletPolicy;
  spent_today_usd: number;
  created_at: string;
};

export type PaymentRequirements = {
  x402Version: 1;
  scheme: "exact";
  network: Network;
  maxAmountRequired: string;
  resource: string;
  description: string;
  mimeType: string;
  payTo: string;
  asset: Asset;
  maxTimeoutSeconds: number;
  extra?: Record<string, unknown>;
};

export type Quote = {
  quote_id: string;
  resource_id: string;
  seller_agent_id: string;
  price_usd: number;
  asset: Asset;
  network: Network;
  pay_to: string;
  expires_at: string;
  description: string;
};

export type SwapQuote = {
  from_asset: Asset;
  to_asset: Asset;
  amount_in: number;
  amount_out: number;
  slippage_bps: number;
  route: string[];
  fee_usd: number;
};

export type SettlementReceipt = {
  receipt_id: string;
  intent_id: string;
  status: "settled" | "failed";
  buyer_agent_id: string;
  seller_agent_id: string;
  resource_id: string;
  asset_paid: Asset;
  amount_paid: number;
  fee_breakdown: FeeBreakdown;
  swap?: SwapQuote | null;
  tx_hash: string;
  settled_at: string;
  reason?: string;
};

export type LedgerEntry = {
  id: string;
  type: "credit" | "debit" | "fee" | "swap";
  agent_id: string;
  asset: Asset;
  amount: number;
  meta: Record<string, unknown>;
  created_at: string;
};

export type PaidResource = {
  id: string;
  seller_agent_id: string;
  title: string;
  description: string;
  price_usd: number;
  asset: Asset;
  network: Network;
  payload: unknown;
};
