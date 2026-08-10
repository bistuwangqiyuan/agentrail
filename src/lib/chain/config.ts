import { baseSepolia } from "viem/chains";

/** Circle USDC on Base Sepolia */
export const BASE_SEPOLIA_USDC =
  (process.env.USDC_ADDRESS as `0x${string}` | undefined) ||
  "0x036CbD53842c5426634e7929541eC2318f3dCF7e";

export type SettlementMode = "base-sepolia" | "local";

export function getSettlementMode(): SettlementMode {
  const forced = process.env.SETTLEMENT_MODE as SettlementMode | undefined;
  if (forced === "base-sepolia" || forced === "local") return forced;
  if (process.env.SPONSOR_PRIVATE_KEY && process.env.CHAIN_RPC_URL) return "base-sepolia";
  // Default local EVM journal — real secp256k1 wallets + verifiable tx hashes, no human
  return "local";
}

export function getChainConfig() {
  const mode = getSettlementMode();
  return {
    mode,
    chain: baseSepolia,
    chainId: baseSepolia.id,
    network: "base-sepolia" as const,
    rpcUrl:
      process.env.CHAIN_RPC_URL ||
      process.env.BASE_SEPOLIA_RPC ||
      "https://sepolia.base.org",
    usdc: BASE_SEPOLIA_USDC,
    sponsorKey: process.env.SPONSOR_PRIVATE_KEY as `0x${string}` | undefined,
    feeRecipient:
      (process.env.FEE_RECIPIENT as `0x${string}` | undefined) || undefined,
    explorerTx: (hash: string) =>
      mode === "base-sepolia"
        ? `https://sepolia.basescan.org/tx/${hash}`
        : `/api/v1/chain/tx/${hash}`,
  };
}

export const ERC20_ABI = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "transfer",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "decimals",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint8" }],
  },
] as const;

export const USDC_DECIMALS = 6;

export function toUsdcUnits(amount: number): bigint {
  return BigInt(Math.round(amount * 10 ** USDC_DECIMALS));
}

export function fromUsdcUnits(units: bigint): number {
  return Number(units) / 10 ** USDC_DECIMALS;
}
