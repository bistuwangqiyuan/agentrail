import { createPublicClient, createWalletClient, http, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { getChainConfig } from "./config";

export function getPublicClient() {
  const cfg = getChainConfig();
  return createPublicClient({
    chain: cfg.chain,
    transport: http(cfg.rpcUrl),
  });
}

export function getWalletClient(privateKey: Hex) {
  const cfg = getChainConfig();
  const account = privateKeyToAccount(privateKey);
  return createWalletClient({
    account,
    chain: cfg.chain,
    transport: http(cfg.rpcUrl),
  });
}

/** Ensure agent has gas on Sepolia (sponsor sends tiny ETH) */
export async function ensureGas(address: Address): Promise<Hex | null> {
  const cfg = getChainConfig();
  if (cfg.mode === "local") return null;
  if (!cfg.sponsorKey) return null;
  const publicClient = getPublicClient();
  const bal = await publicClient.getBalance({ address });
  if (bal > BigInt("10000000000000")) return null;
  const wallet = getWalletClient(cfg.sponsorKey);
  const hash = await wallet.sendTransaction({
    to: address,
    value: BigInt("100000000000000"),
  });
  await publicClient.waitForTransactionReceipt({ hash });
  return hash;
}
