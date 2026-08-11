#!/usr/bin/env node
/**
 * Fully configure Vercel for Base Sepolia settlement:
 * - generate sponsor key (or reuse SPONSOR_PRIVATE_KEY)
 * - set SETTLEMENT_MODE / CHAIN_RPC_URL / USDC / FEE_RECIPIENT / HMAC / sponsor key
 * - print funding instructions + optional balance check
 * - optional: vercel --prod
 *
 * Usage:
 *   node scripts/setup-base-sepolia-vercel.mjs
 *   node scripts/setup-base-sepolia-vercel.mjs --deploy
 *   SPONSOR_PRIVATE_KEY=0x... node scripts/setup-base-sepolia-vercel.mjs --deploy
 */
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { createPublicClient, formatEther, formatUnits, http } from "viem";
import { baseSepolia } from "viem/chains";

const USDC = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
const RPC = process.env.CHAIN_RPC_URL || "https://base-sepolia-rpc.publicnode.com";
const wantDeploy = process.argv.includes("--deploy");

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, {
    encoding: "utf8",
    shell: process.platform === "win32",
    stdio: ["pipe", "pipe", "pipe"],
    ...opts,
  });
  if (r.status !== 0) {
    throw new Error(
      `${cmd} ${args.join(" ")} failed:\n${r.stdout || ""}\n${r.stderr || ""}`,
    );
  }
  return (r.stdout || "").trim();
}

function vercelEnvAdd(name, environments, value, sensitive) {
  const args = [
    "vercel",
    "env",
    "add",
    name,
    environments,
    "--value",
    value,
    "--yes",
    "--force",
  ];
  args.push(sensitive ? "--sensitive" : "--no-sensitive");
  run("npx", args);
}

async function balances(address) {
  const client = createPublicClient({
    chain: baseSepolia,
    transport: http(RPC),
  });
  const eth = await client.getBalance({ address });
  const usdcRaw = await client.readContract({
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
    args: [address],
  });
  return { eth: formatEther(eth), usdc: formatUnits(usdcRaw, 6) };
}

const pk = (process.env.SPONSOR_PRIVATE_KEY || generatePrivateKey());
if (!pk.startsWith("0x") || pk.length !== 66) {
  throw new Error("SPONSOR_PRIVATE_KEY must be 0x + 64 hex chars");
}
const account = privateKeyToAccount(pk);
const hmac =
  process.env.AGENTRAIL_HMAC_SECRET || randomBytes(32).toString("hex");

console.log("Sponsor address:", account.address);
console.log("RPC:", RPC);

console.log("Writing Vercel env vars...");
vercelEnvAdd("SETTLEMENT_MODE", "production,preview,development", "base-sepolia", false);
vercelEnvAdd("CHAIN_RPC_URL", "production,preview,development", RPC, false);
vercelEnvAdd("USDC_ADDRESS", "production,preview,development", USDC, false);
vercelEnvAdd("FEE_RECIPIENT", "production,preview,development", account.address, false);
vercelEnvAdd("AGENTRAIL_HMAC_SECRET", "production,preview", hmac, true);
vercelEnvAdd("AGENTRAIL_HMAC_SECRET", "development", hmac, false);
vercelEnvAdd("SPONSOR_PRIVATE_KEY", "production,preview", pk, true);
vercelEnvAdd("SPONSOR_PRIVATE_KEY", "development", pk, false);

const bal = await balances(account.address);
console.log("On-chain balances:", bal);
console.log(`
Fund this sponsor (required for real topup/gas):
  ETH:  https://www.alchemy.com/faucets/base-sepolia  or CDP Portal faucet
  USDC: https://faucet.circle.com/  (Base Sepolia) or CDP faucet (token=usdc)
  Address: ${account.address}
`);

if (wantDeploy) {
  console.log("Deploying production...");
  console.log(run("npx", ["vercel", "--prod", "--yes"]));
}

console.log("Done. Verify: curl https://paiusdtai.xyz/api/v1/status");
