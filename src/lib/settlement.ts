import { pickFundingAsset, quoteSwap } from "./swap";
import { appendLedger, getStore, newId } from "./store";
import { computeFees } from "./x402";
import type { AgentWallet, FeeBreakdown, SettlementReceipt, SwapQuote } from "./types";
import {
  fundUsdc,
  getChainConfig,
  getUsdcBalance,
  transferUsdc,
  type ChainTxRecord,
} from "./chain";
import { createAgentKey } from "./chain/keys";
import type { Address } from "viem";

function platformFeeAddress(): Address {
  return createAgentKey("platform_fee_sink").address;
}

export type PayRequest = {
  buyer: AgentWallet;
  resourceId: string;
  intentId?: string;
};

export type PayResult =
  | { ok: true; receipt: SettlementReceipt; payload: unknown }
  | { ok: false; code: string; message: string; fee_breakdown?: FeeBreakdown };

/**
 * On-chain (or local EVM journal) settlement.
 * Prefer autonomy over cheapest path; fees disclosed in fee_breakdown.
 */
export async function settlePayment(req: PayRequest): Promise<PayResult> {
  const store = getStore();
  const cfg = getChainConfig();
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
  if (!buyer.address || !buyer.key_id) {
    return { ok: false, code: "WALLET_NOT_ONCHAIN", message: "Buyer missing chain wallet" };
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
  if (!seller?.address) {
    return { ok: false, code: "SELLER_NOT_FOUND", message: "Seller wallet missing address" };
  }

  // Refresh USDC from chain
  try {
    buyer.balances.USDC = await getUsdcBalance(buyer.address as Address);
    seller.balances.USDC = await getUsdcBalance(seller.address as Address);
  } catch (e) {
    return {
      ok: false,
      code: "CHAIN_BALANCE_READ_FAILED",
      message: e instanceof Error ? e.message : "balance read failed",
    };
  }

  let swap: SwapQuote | null = null;
  const preliminaryFees = computeFees(price, 0);
  const totalDebitNeeded = price + preliminaryFees.platform_fee + preliminaryFees.network_fee + preliminaryFees.facilitator_fee;

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

  try {
    if (funding.needSwap) {
      const fromBal = buyer.balances[funding.asset];
      let lo = 0;
      let hi = fromBal;
      let best = quoteSwap({
        from: funding.asset,
        to: resource.asset,
        amountIn: fromBal,
        maxSlippageBps: buyer.policy.max_slippage_bps,
      });
      for (let i = 0; i < 16; i++) {
        const mid = (lo + hi) / 2;
        const q = quoteSwap({
          from: funding.asset,
          to: resource.asset,
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
      if (!best.executable || best.amount_out < totalDebitNeeded) {
        return { ok: false, code: "SWAP_INSUFFICIENT", message: "Swap output below required amount" };
      }
      if (best.slippage_bps > buyer.policy.max_slippage_bps) {
        return { ok: false, code: "SWAP_SLIPPAGE_EXCEEDED", message: "Slippage exceeds policy" };
      }

      // Execute pool swap: burn credit asset, fund USDC on-chain to buyer
      buyer.balances[funding.asset] = Number(
        (buyer.balances[funding.asset] - best.amount_in).toFixed(6),
      );
      const fundTx = await fundUsdc(buyer.address as Address, best.amount_out);
      buyer.balances.USDC = await getUsdcBalance(buyer.address as Address);
      swap = best;
      appendLedger(store, {
        type: "swap",
        agent_id: buyer.id,
        asset: resource.asset,
        amount: best.amount_out,
        meta: { swap: best, fund_tx: fundTx.hash },
      });
    }

    const fees = computeFees(price, swap?.fee_usd ?? 0);
    const platformAndFacilitator = Number(
      (fees.platform_fee + fees.network_fee + fees.facilitator_fee).toFixed(6),
    );
    const usdcBal = await getUsdcBalance(buyer.address as Address);
    if (usdcBal < price + platformAndFacilitator) {
      return {
        ok: false,
        code: "INSUFFICIENT_AFTER_FEES",
        message: `On-chain USDC ${usdcBal} < required ${price + platformAndFacilitator}`,
        fee_breakdown: fees,
      };
    }

    // Pay seller price on-chain
    const payTx: ChainTxRecord = await transferUsdc({
      fromAddress: buyer.address as Address,
      fromKeyId: buyer.key_id,
      to: (resource.pay_to || seller.address) as Address,
      amount: price,
    });

    // Platform fee → dedicated sink (disclosed autonomy cost; not seller revenue)
    let feeTx: ChainTxRecord | null = null;
    if (platformAndFacilitator > 0) {
      const feeTo = (cfg.feeRecipient as Address | undefined) || platformFeeAddress();
      feeTx = await transferUsdc({
        fromAddress: buyer.address as Address,
        fromKeyId: buyer.key_id,
        to: feeTo,
        amount: platformAndFacilitator,
      });
    }

    buyer.balances.USDC = await getUsdcBalance(buyer.address as Address);
    seller.balances.USDC = await getUsdcBalance(seller.address as Address);
    buyer.spent_today_usd = Number((buyer.spent_today_usd + price).toFixed(6));

    appendLedger(store, {
      type: "debit",
      agent_id: buyer.id,
      asset: resource.asset,
      amount: -(price + platformAndFacilitator),
      meta: { resource_id: resource.id, intent_id: intentId, tx_hash: payTx.hash },
    });
    appendLedger(store, {
      type: "credit",
      agent_id: seller.id,
      asset: resource.asset,
      amount: price,
      meta: { resource_id: resource.id, intent_id: intentId, tx_hash: payTx.hash },
    });
    appendLedger(store, {
      type: "fee",
      agent_id: buyer.id,
      asset: resource.asset,
      amount: -platformAndFacilitator,
      meta: { fee_breakdown: fees, fee_tx: feeTx?.hash },
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
      tx_hash: payTx.hash,
      explorer_url: cfg.explorerTx(payTx.hash),
      settled_at: new Date().toISOString(),
      settlement_mode: cfg.mode,
    };

    store.intents.add(intentId);
    store.receipts.set(receipt.receipt_id, receipt);
    store.wallets.set(buyer.id, buyer);
    store.wallets.set(seller.id, seller);

    return { ok: true, receipt, payload: resource.payload };
  } catch (e) {
    return {
      ok: false,
      code: "CHAIN_SETTLEMENT_FAILED",
      message: e instanceof Error ? e.message : "settlement failed",
      fee_breakdown: preliminaryFees,
    };
  }
}
