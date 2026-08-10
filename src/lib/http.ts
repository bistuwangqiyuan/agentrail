import { NextResponse } from "next/server";

export function json(data: unknown, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Api-Key, X-PAYMENT, X-Intent-Id",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    },
  });
}

export function paymentRequired(body: unknown) {
  return NextResponse.json(body, {
    status: 402,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Api-Key, X-PAYMENT, X-Intent-Id",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "X-Payment-Required": "agentrail-x402",
    },
  });
}

export function options() {
  return json({ ok: true });
}

export function getApiKey(req: Request): string | null {
  const h = req.headers.get("x-api-key") || req.headers.get("authorization");
  if (!h) return null;
  if (h.toLowerCase().startsWith("bearer ")) return h.slice(7).trim();
  return h.trim();
}
