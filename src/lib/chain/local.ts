import { createHash } from "crypto";
import type { Address, Hex } from "viem";
import { keccak256, encodePacked, toBytes } from "viem";
import { fromUsdcUnits, getChainConfig, toUsdcUnits } from "./config";

export type ChainTxRecord = {
  hash: Hex;
  from: Address;
  to: Address;
  amount: string;
  asset: "USDC";
  blockNumber: number;
  status: "success";
  created_at: string;
  mode: "local" | "base-sepolia";
};

declare global {
  var __agentrail_local_chain:
    | {
        usdc: Map<string, bigint>;
        txs: Map<string, ChainTxRecord>;
        block: number;
      }
    | undefined;
}

function state() {
  if (!globalThis.__agentrail_local_chain) {
    globalThis.__agentrail_local_chain = {
      usdc: new Map(),
      txs: new Map(),
      block: 1,
    };
  }
  return globalThis.__agentrail_local_chain;
}

export function localGetUsdc(address: Address): number {
  const raw = state().usdc.get(address.toLowerCase()) || BigInt(0);
  return fromUsdcUnits(raw);
}

export function localMintUsdc(address: Address, amount: number): ChainTxRecord {
  const s = state();
  const key = address.toLowerCase();
  const add = toUsdcUnits(amount);
  s.usdc.set(key, (s.usdc.get(key) || BigInt(0)) + add);
  return recordTx("0x0000000000000000000000000000000000000000" as Address, address, amount);
}

export function localTransferUsdc(
  from: Address,
  to: Address,
  amount: number,
): ChainTxRecord {
  const s = state();
  const fromKey = from.toLowerCase();
  const toKey = to.toLowerCase();
  const units = toUsdcUnits(amount);
  const bal = s.usdc.get(fromKey) || BigInt(0);
  if (bal < units) {
    throw new Error(`LOCAL_INSUFFICIENT_USDC: have ${fromUsdcUnits(bal)} need ${amount}`);
  }
  s.usdc.set(fromKey, bal - units);
  s.usdc.set(toKey, (s.usdc.get(toKey) || BigInt(0)) + units);
  return recordTx(from, to, amount);
}

function recordTx(from: Address, to: Address, amount: number): ChainTxRecord {
  const s = state();
  s.block += 1;
  const packed = encodePacked(
    ["address", "address", "uint256", "uint256"],
    [from, to, toUsdcUnits(amount), BigInt(s.block)],
  );
  const hash = keccak256(packed);
  const tx: ChainTxRecord = {
    hash,
    from,
    to,
    amount: amount.toFixed(6),
    asset: "USDC",
    blockNumber: s.block,
    status: "success",
    created_at: new Date().toISOString(),
    mode: "local",
  };
  s.txs.set(hash.toLowerCase(), tx);
  // also store by digest for lookup
  s.txs.set(createHash("sha256").update(toBytes(hash)).digest("hex"), tx);
  return tx;
}

export function localGetTx(hash: string): ChainTxRecord | null {
  return state().txs.get(hash.toLowerCase()) || null;
}

export function resetLocalChain() {
  globalThis.__agentrail_local_chain = {
    usdc: new Map(),
    txs: new Map(),
    block: 1,
  };
}

export function isLocalMode(): boolean {
  return getChainConfig().mode === "local";
}
