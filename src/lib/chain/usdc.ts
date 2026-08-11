import type { Address, Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { ERC20_ABI, fromUsdcUnits, getChainConfig, toUsdcUnits } from "./config";
import { ensureGas, getPublicClient, getWalletClient } from "./client";
import { getPrivateKeyByAddress, getPrivateKeyByKeyId } from "./keys";
import {
  localGetUsdc,
  localMintUsdc,
  localTransferUsdc,
  type ChainTxRecord,
} from "./local";

export async function getUsdcBalance(address: Address): Promise<number> {
  const cfg = getChainConfig();
  if (cfg.mode === "local") return localGetUsdc(address);
  const client = getPublicClient();
  const raw = await client.readContract({
    address: cfg.usdc,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: [address],
  });
  return fromUsdcUnits(raw);
}

export async function transferUsdc(params: {
  fromAddress: Address;
  fromKeyId?: string;
  privateKey?: Hex;
  to: Address;
  amount: number;
}): Promise<ChainTxRecord> {
  const cfg = getChainConfig();
  if (cfg.mode === "local") {
    return localTransferUsdc(params.fromAddress, params.to, params.amount);
  }

  const pk =
    params.privateKey ||
    (params.fromKeyId && getPrivateKeyByKeyId(params.fromKeyId)) ||
    getPrivateKeyByAddress(params.fromAddress);
  if (!pk) throw new Error("AGENT_KEY_NOT_FOUND");

  const account = privateKeyToAccount(pk);
  await ensureGas(account.address);
  const wallet = getWalletClient(pk);
  const publicClient = getPublicClient();
  const hash = await wallet.writeContract({
    address: cfg.usdc,
    abi: ERC20_ABI,
    functionName: "transfer",
    args: [params.to, toUsdcUnits(params.amount)],
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error("TX_REVERTED");
  return {
    hash: hash as Hex,
    from: account.address,
    to: params.to,
    amount: params.amount.toFixed(6),
    asset: "USDC",
    blockNumber: Number(receipt.blockNumber),
    status: "success",
    created_at: new Date().toISOString(),
    mode: "base-sepolia",
  };
}

/** Funding pool / faucet: mint local or sponsor-transfer on Sepolia */
export async function fundUsdc(to: Address, amount: number): Promise<ChainTxRecord> {
  const cfg = getChainConfig();
  if (cfg.mode === "local") {
    return localMintUsdc(to, amount);
  }
  if (!cfg.sponsorKey) throw new Error("SPONSOR_PRIVATE_KEY_REQUIRED");
  const account = privateKeyToAccount(cfg.sponsorKey);
  return transferUsdc({
    fromAddress: account.address,
    privateKey: cfg.sponsorKey,
    to,
    amount,
  });
}
