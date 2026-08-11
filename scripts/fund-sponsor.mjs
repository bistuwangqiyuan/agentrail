#!/usr/bin/env node
/**
 * Fund sponsor wallet on Base Sepolia.
 * Tries Circle faucet API and/or Coinbase CDP faucet when credentials exist.
 *
 * Env:
 *   SPONSOR_PRIVATE_KEY (required) — derives address
 *   CIRCLE_API_KEY — optional, POST /v1/faucet/drips
 *   CDP_API_KEY_ID / CDP_API_KEY_SECRET / CDP_WALLET_SECRET — optional CDP SDK
 */
import { createPublicClient, formatEther, formatUnits, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";

const USDC = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
const RPC = process.env.CHAIN_RPC_URL || "https://base-sepolia-rpc.publicnode.com";
const pk = process.env.SPONSOR_PRIVATE_KEY;
if (!pk) {
  console.error("Set SPONSOR_PRIVATE_KEY first (or run vercel env pull).");
  process.exit(1);
}

const account = privateKeyToAccount(pk);
const client = createPublicClient({ chain: baseSepolia, transport: http(RPC) });

async function balances() {
  const eth = await client.getBalance({ address: account.address });
  const usdc = await client.readContract({
    address: USDC,
    abi: [
      {
        type: "function",
        name: "balanceOf",
        stateMutability: "view",
        inputs: [{ name: "account", type: "address" }],
        outputs: [{ type: "uint256" }],
      },
    ],
    functionName: "balanceOf",
    args: [account.address],
  });
  return { eth: formatEther(eth), usdc: formatUnits(usdc, 6) };
}

async function tryCircle() {
  const key = process.env.CIRCLE_API_KEY;
  if (!key) return { skipped: true, reason: "CIRCLE_API_KEY missing" };
  const res = await fetch("https://api.circle.com/v1/faucet/drips", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      address: account.address,
      blockchain: "BASE-SEPOLIA",
      usdc: true,
      native: true,
    }),
  });
  const body = await res.text();
  return { ok: res.ok, status: res.status, body };
}

async function tryCdp() {
  if (!process.env.CDP_API_KEY_ID || !process.env.CDP_API_KEY_SECRET) {
    return { skipped: true, reason: "CDP credentials missing" };
  }
  try {
    const { CdpClient } = await import("@coinbase/cdp-sdk");
    const cdp = new CdpClient();
    const eth = await cdp.evm.requestFaucet({
      address: account.address,
      network: "base-sepolia",
      token: "eth",
    });
    const usdc = await cdp.evm.requestFaucet({
      address: account.address,
      network: "base-sepolia",
      token: "usdc",
    });
    return { ok: true, eth, usdc };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

console.log("Sponsor:", account.address);
console.log("Before:", await balances());
console.log("Circle:", await tryCircle());
console.log("CDP:", await tryCdp());
console.log("After:", await balances());
console.log(`
If still empty, claim manually (CAPTCHA required):
  ETH:  https://faucet.zalalena.com/base
  USDC: https://faucet.circle.com/  (network: Base Sepolia)
  Address: ${account.address}
`);
