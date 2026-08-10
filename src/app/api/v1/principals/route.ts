import { json, options } from "@/lib/http";
import { ensureDurableLoaded } from "@/lib/agent-context";
import { persistDurable } from "@/lib/durable";
import { getStore, newId } from "@/lib/store";

export function OPTIONS() {
  return options();
}

export async function GET() {
  await ensureDurableLoaded();
  const store = getStore();
  return json({
    principals: [...store.principals.values()],
  });
}

export async function POST(req: Request) {
  await ensureDurableLoaded();
  const body = await req.json().catch(() => ({}));
  const store = getStore();
  const id = newId("prin");
  const principal = {
    id,
    name: String(body.name || "Unnamed Principal"),
    kyc_status: "verified" as const,
    created_at: new Date().toISOString(),
  };
  store.principals.set(id, principal);
  await persistDurable(store);
  return json({
    principal,
    note: "MVP stubs KYC as verified for demo. Production must use licensed CIP/KYB. No human form in agent path.",
  });
}
