import { createHmac, timingSafeEqual } from "crypto";
import type { AgentWallet, PaidResource, SettlementReceipt } from "./types";

const SECRET = process.env.AGENTRAIL_HMAC_SECRET || "agentrail-mvp-dev-secret-change-me";

function b64url(input: Buffer | string): string {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(input);
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function fromB64url(input: string): Buffer {
  const pad = input.length % 4 === 0 ? "" : "=".repeat(4 - (input.length % 4));
  const b64 = input.replace(/-/g, "+").replace(/_/g, "/") + pad;
  return Buffer.from(b64, "base64");
}

function sign(payloadB64: string): string {
  return b64url(createHmac("sha256", SECRET).update(payloadB64).digest());
}

function verify(payloadB64: string, sig: string): boolean {
  const expected = sign(payloadB64);
  const a = Buffer.from(expected);
  const b = Buffer.from(sig);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export type SignedEnvelope<T> = {
  token: string;
  payload: T;
};

export function seal<T>(payload: T): SignedEnvelope<T> {
  const payloadB64 = b64url(JSON.stringify(payload));
  const sig = sign(payloadB64);
  return { token: `${payloadB64}.${sig}`, payload };
}

export function open<T>(token: string | null | undefined): T | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [payloadB64, sig] = parts;
  if (!verify(payloadB64, sig)) return null;
  try {
    return JSON.parse(fromB64url(payloadB64).toString("utf8")) as T;
  } catch {
    return null;
  }
}

export function sealWallet(wallet: AgentWallet): string {
  return seal(wallet).token;
}

export function openWallet(token: string | null | undefined): AgentWallet | null {
  return open<AgentWallet>(token);
}

export function sealResource(resource: PaidResource): string {
  return seal(resource).token;
}

export function openResource(token: string | null | undefined): PaidResource | null {
  return open<PaidResource>(token);
}

export function sealReceipt(receipt: SettlementReceipt): string {
  return seal(receipt).token;
}

export function openReceipt(token: string | null | undefined): SettlementReceipt | null {
  return open<SettlementReceipt>(token);
}
