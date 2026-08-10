import { pickFundingAsset, quoteSwap } from "./swap";
import { appendLedger, getStore, newId } from "./store";
import { computeFees, fakeTxHash } from "./x402";
import type { AgentWallet, FeeBreakdown, SettlementReceipt, SwapQuote } from "./types";

export type PayRequest = {
  buyer: AgentWallet;
  resourceId: string;
  intentId?: string;
};

export type PayResult =
  | { ok: true; receipt: SettlementReceipt; payload: unknown }
  | { ok: false; code: string; message: string; fee_breakdown?: FeeBreakdown };

export function settlePayment(req: PayRequest): PayResult {
  const store = getStore();
  const resource = store.resources.get(req.resourceId);
  if (!resource) {
    return { ok: false, code: "RESOURCE_NOT_FOUND", message: "Unknown resource" };
  }

  const intentId = req.intentId || newId("intent");
  if (store.intents.has(intentId)) {
    const existing = [...store.receipts.values()].find((r) => r.intent_id === intentId);
    if (existing?.status === "settled") {
      return { ok: true, receipt: existing, payload: resource.payload };
    }
    return { ok: false, code: "INTENT_REPLAY", message: "Intent already used" };
  }

  const price = resource.price_usd;
  const buyer = store.wallets.get(req.buyer.id);
  if (!buyer) {
    return { ok: false, code: "BUYER_NOT_FOUND", message: "Buyer wallet missing" };
  }

  if (price > buyer.policy.per_tx_cap_usd) {
    return { ok: false, code: "POLICY_PER_TX_CAP", message: "Exceeds per-tx cap" };
  }
  if (buyer.spent_today_usd + price > buyer.policy.daily_cap_usd) {
    return { ok: false, code: "POLICY_DAILY_CAP", message: "Exceeds daily cap" };
  }
  if (
    buyer.policy.allowlist[0] !== "*" &&
    !buyer.policy.allowlist.includes(resource.seller_agent_id)
  ) {
    return { ok: false, code: "POLICY_ALLOWLIST", message: "Seller not allowlisted" };
  }

  const seller = store.wallets.get(resource.seller_agent_id);
  if (!seller) {
    return { ok: false, code: "SELLER_NOT_FOUND", message: "Seller wallet missing" };
  }

  // Fees charged on top for autonomy premium transparency
  let swap: SwapQuote | null = null;
  const preliminaryFees = computeFees(price, 0);
  const totalDebitNeeded = price + preliminaryFees.total_fee;

  const funding = pickFundingAsset(
    buyer.balances,
    resource.asset,
    totalDebitNeeded,
    buyer.policy,
  );

  if ("error" in funding) {
    return {
      ok: false,
      code: funding.error,
      message: "Insufficient balance even after failover swap",
      fee_breakdown: preliminaryFees,
    };
  }

  if (funding.needSwap) {
    // Swap just enough (+buffer) from funding asset into required asset
    const requiredAsset = resource.asset;
    const fromBal = buyer.balances[funding.asset];
    // Estimate input needed
    let lo = 0;
    let hi = fromBal;
    let best = quoteSwap({
      from: funding.asset,
      to: requiredAsset,
      amountIn: fromBal,
      maxSlippageBps: buyer.policy.max_slippage_bps,
    });
    for (let i = 0; i < 16; i++) {
      const mid = (lo + hi) / 2;
      const q = quoteSwap({
        from: funding.asset,
        to: requiredAsset,
        amountIn: mid,
        maxSlippageBps: buyer.policy.max_slippage_bps,
      });
      if (q.amount_out >= totalDebitNeeded) {
        best = q;
        hi = mid;
      } else {
        lo = mid;
      }
    }
    if (best.amount_out < totalDebitNeeded) {
      return {
        ok: false,
        code: "SWAP_INSUFFICIENT",
        message: "Swap output below required amount",
      };
    }
    if (best.slippage_bps > buyer.policy.max_slippage_bps) {
      return {
        ok: false,
        code: "SWAP_SLIPPAGE_EXCEEDED",
        message: "Slippage exceeds policy",
      };
    }
    swap = best;
    buyer.balances[funding.asset] = Number(
      (buyer.balances[funding.asset] - best.amount_in).toFixed(6),
    );
    buyer.balances[requiredAsset] = Number(
      (buyer.balances[requiredAsset] + best.amount_out).toFixed(6),
    );
    appendLedger(store, {
      type: "swap",
      agent_id: buyer.id,
      asset: requiredAsset,
      amount: best.amount_out,
      meta: { swap: best },
    });
  }

  const fees = computeFees(price, swap?.fee_usd ?? 0);
  const debit = Number((price + fees.platform_fee + fees.network_fee + fees.facilitator_fee).toFixed(6));

  if (buyer.balances[resource.asset] < debit) {
    return {
      ok: false,
      code: "INSUFFICIENT_AFTER_FEES",
      message: "Balance too low after fees",
      fee_breakdown: fees,
    };
  }

  buyer.balances[resource.asset] = Number((buyer.balances[resource.asset] - debit).toFixed(6));
  seller.balances[resource.asset] = Number(
    (seller.balances[resource.asset] + price).toFixed(6),
  );
  buyer.spent_today_usd = Number((buyer.spent_today_usd + price).toFixed(6));

  appendLedger(store, {
    type: "debit",
    agent_id: buyer.id,
    asset: resource.asset,
    amount: -debit,
    meta: { resource_id: resource.id, intent_id: intentId },
  });
  appendLedger(store, {
    type: "credit",
    agent_id: seller.id,
    asset: resource.asset,
    amount: price,
    meta: { resource_id: resource.id, intent_id: intentId },
  });
  appendLedger(store, {
    type: "fee",
    agent_id: buyer.id,
    asset: resource.asset,
    amount: -(fees.platform_fee + fees.network_fee + fees.facilitator_fee),
    meta: { fee_breakdown: fees },
  });

  const receipt: SettlementReceipt = {
    receipt_id: newId("rcpt"),
    intent_id: intentId,
    status: "settled",
    buyer_agent_id: buyer.id,
    seller_agent_id: seller.id,
    resource_id: resource.id,
    asset_paid: resource.asset,
    amount_paid: price,
    fee_breakdown: fees,
    swap,
    tx_hash: fakeTxHash(),
    settled_at: new Date().toISOString(),
  };

  store.intents.add(intentId);
  store.receipts.set(receipt.receipt_id, receipt);
  store.wallets.set(buyer.id, buyer);
  store.wallets.set(seller.id, seller);

  return { ok: true, receipt, payload: resource.payload };
}
