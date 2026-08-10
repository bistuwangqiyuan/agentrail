import { json, options } from "@/lib/http";
import { getTx, getChainConfig } from "@/lib/chain";

type Ctx = { params: Promise<{ hash: string }> };

export function OPTIONS() {
  return options();
}

export async function GET(_req: Request, ctx: Ctx) {
  const { hash } = await ctx.params;
  const cfg = getChainConfig();
  const tx = await getTx(hash);
  if (!tx) return json({ error: "TX_NOT_FOUND", hash }, 404);
  return json({
    tx,
    explorer_url: cfg.explorerTx(hash),
    settlement_mode: cfg.mode,
  });
}
