import type { ZeroXgaslessSmartAccount } from "@0xgasless/smart-account-sdk";
import { type CurrencyType, estimateToJson } from "@zkp2p/cash";
import { z } from "zod";
import type { AgentkitAction } from "../../agentkit";
import { formatError, formatResult, getPeerCashClient, toUsdcBaseUnits } from "./client";

const PEER_CASH_ESTIMATE_PROMPT = `
Estimates the fiat a Base USDC cash-out receives at the live Chainlink oracle
rate, with a recent-fill ETA for the chosen platform and currency.

USAGE
  name : peer_cash_estimate
  args :
    • amount (string, required) - decimal USDC, e.g. "250" or "12.34"
    • currency (string, required) - ISO 4217 code from peer_cash_capabilities
    • platform (string, optional) - payout platform, for pair-specific fill timing

IMPORTANT
  • This is not a locked quote. Peer Cash charges no spread and the binding rate
    resolves when a buyer fills the order, so the fiat can move between the
    estimate and the fill.
  • The eta is a rolling 30-day median of how long similar orders waited for
    their first fill. It is evidence, not a guarantee.

Use peer_cash_prepare_cashout next to build the transactions that open the order.
`;

export const PeerCashEstimateInput = z
  .object({
    amount: z.string().describe("The Base USDC amount to estimate, as a decimal string"),
    currency: z.string().describe("The ISO 4217 fiat currency code to receive, e.g. USD"),
    platform: z
      .string()
      .optional()
      .nullable()
      .describe("Optional payout platform id, for pair-specific fill timing"),
  })
  .strip()
  .describe("Instructions for estimating a Peer Cash cash-out");

/**
 * Estimates the fiat received for a Base USDC cash-out.
 *
 * @param _wallet - Unused; estimating never touches the wallet.
 * @param args - The amount, currency, and optional payout platform.
 * @returns The oracle estimate as JSON, or a typed error message.
 */
export async function peerCashEstimate(
  _wallet: ZeroXgaslessSmartAccount,
  args: z.infer<typeof PeerCashEstimateInput>,
): Promise<string> {
  try {
    const estimate = await getPeerCashClient().estimate({
      amount: toUsdcBaseUnits(args.amount),
      currency: args.currency.trim().toUpperCase() as CurrencyType,
      ...(args.platform ? { platform: args.platform } : {}),
    });
    return formatResult(estimateToJson(estimate));
  } catch (error) {
    return formatError("estimate", error);
  }
}

/**
 * Peer Cash estimate action.
 */
export class PeerCashEstimateAction implements AgentkitAction<typeof PeerCashEstimateInput> {
  public name = "peer_cash_estimate";
  public description = PEER_CASH_ESTIMATE_PROMPT;
  public argsSchema = PeerCashEstimateInput;
  public func = peerCashEstimate;
  public walletOptional = true;
  public smartAccountRequired = false;
}
