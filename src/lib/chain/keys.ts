import { createHmac } from "crypto";
import { privateKeyToAccount } from "viem/accounts";
import type { Address, Hex } from "viem";

declare global {
  var __agentrail_keys: Map<string, Hex> | undefined;
}

function keyStore(): Map<string, Hex> {
  if (!globalThis.__agentrail_keys) {
    globalThis.__agentrail_keys = new Map();
  }
  return globalThis.__agentrail_keys;
}

const SECRET = process.env.AGENTRAIL_HMAC_SECRET || "agentrail-mvp-dev-secret-change-me";

/** Deterministic key for seeded demo agents (still real secp256k1). */
export function deterministicPrivateKey(agentId: string): Hex {
  const digest = createHmac("sha256", SECRET).update(`agent-key:${agentId}`).digest("hex");
  return `0x${digest}` as Hex;
}

/**
 * Always derive from agentId when provided so cold-start can rehydrate keys
 * without embedding private keys in client-carried wallet_state.
 */
export function createAgentKey(agentId: string): { privateKey: Hex; address: Address; keyId: string } {
  const privateKey = deterministicPrivateKey(agentId);
  const account = privateKeyToAccount(privateKey);
  const keyId = `key_${agentId}`;
  keyStore().set(keyId, privateKey);
  keyStore().set(account.address.toLowerCase(), privateKey);
  return { privateKey, address: account.address, keyId };
}

export function rehydrateKeyForWallet(wallet: { id: string; key_id: string; address: string }): void {
  const { privateKey, address } = createAgentKey(wallet.id);
  keyStore().set(wallet.key_id, privateKey);
  keyStore().set(address.toLowerCase(), privateKey);
  if (wallet.address && wallet.address.toLowerCase() !== address.toLowerCase()) {
    // keep mapping for stated address if deterministic matches agent id
    keyStore().set(wallet.address.toLowerCase(), privateKey);
  }
}

export function rememberKey(keyId: string, privateKey: Hex): Address {
  const account = privateKeyToAccount(privateKey);
  keyStore().set(keyId, privateKey);
  keyStore().set(account.address.toLowerCase(), privateKey);
  return account.address;
}

export function getPrivateKeyByKeyId(keyId: string): Hex | null {
  return keyStore().get(keyId) || null;
}

export function getPrivateKeyByAddress(address: string): Hex | null {
  return keyStore().get(address.toLowerCase()) || null;
}

export function ensureDemoKeys(agentId: string, keyId: string): { address: Address; keyId: string } {
  const existing = getPrivateKeyByKeyId(keyId);
  if (existing) {
    return { address: privateKeyToAccount(existing).address, keyId };
  }
  const created = createAgentKey(agentId);
  // normalize keyId to provided if seeding
  keyStore().set(keyId, created.privateKey);
  keyStore().set(created.address.toLowerCase(), created.privateKey);
  return { address: created.address, keyId };
}
