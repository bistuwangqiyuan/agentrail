import type { Address, Hex } from "viem";
import { getChainConfig } from "./config";
import { getPublicClient } from "./client";
import { localGetTx, type ChainTxRecord } from "./local";

/** Wait/confirm and fetch settlement transaction */
export async function getTx(hash: string): Promise<ChainTxRecord | null> {
  const cfg = getChainConfig();
  if (cfg.mode === "local") return localGetTx(hash);
  try {
    const client = getPublicClient();
    const receipt = await client.getTransactionReceipt({ hash: hash as Hex });
    const tx = await client.getTransaction({ hash: hash as Hex });
    return {
      hash: hash as Hex,
      from: tx.from,
      to: (tx.to || "0x0000000000000000000000000000000000000000") as Address,
      amount: "0",
      asset: "USDC",
      blockNumber: Number(receipt.blockNumber),
      status: "success",
      created_at: new Date().toISOString(),
      mode: "base-sepolia",
    };
  } catch {
    return null;
  }
}

export async function waitForTx(hash: Hex): Promise<ChainTxRecord> {
  const cfg = getChainConfig();
  if (cfg.mode === "local") {
    const tx = localGetTx(hash);
    if (!tx) throw new Error("TX_NOT_FOUND");
    return tx;
  }
  const client = getPublicClient();
  const receipt = await client.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error("TX_REVERTED");
  const found = await getTx(hash);
  if (!found) throw new Error("TX_NOT_FOUND");
  return found;
}
