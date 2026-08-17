import type { ZeroXgaslessSmartAccount } from "@0xgasless/smart-account-sdk";
import { type CurrencyType, prepareResultToJson } from "@zkp2p/cash";
import { z } from "zod";
import type { AgentkitAction } from "../../agentkit";
import { formatError, formatResult, getPeerCashClient, toUsdcBaseUnits } from "./client";

const PEER_CASH_PREPARE_CASHOUT_PROMPT = `
Builds the transactions that open a Peer Cash order, turning Base USDC into fiat
paid by a buyer at the live Chainlink oracle rate.

USAGE
  name : peer_cash_prepare_cashout
  args :
    • amount (string, required) - decimal USDC, e.g. "250" or "12.34"
    • platform (string, required) - payout platform id from peer_cash_capabilities
    • currency (string, required) - ISO 4217 code the platform supports
    • payee (string, required) - your handle on that platform, e.g. "@andrew-w"
      for Venmo. peer_cash_capabilities gives the exact format per platform.

CUSTODY
  This action returns UNSIGNED transactions and never accepts or reads a private
  key. Submit each entry of txs with send_transaction, in the given order, and
  confirm each with get_transaction_status before submitting the next. The order
  belongs to whichever address submits them, and every transaction targets Base
  (chain 8453), so the agent must be configured on Base.

RETURNS
  - txs: ordered [approve, createDeposit] as { to, data, value, chainId }
  - steps: a human label for each transaction, at the same index
  - accessPolicyRequired: when true the platform is Venmo, Cash App, or PayPal
    and peer_cash_prepare_access_policy MUST be run once createDeposit confirms,
    otherwise no buyer can fill the order

Peer validates the payee handle with the platform before returning anything, so
a handle that does not resolve fails here rather than after funds are committed.
`;

export const PeerCashPrepareCashoutInput = z
  .object({
    amount: z.string().describe("The Base USDC amount to cash out, as a decimal string"),
    platform: z.string().describe("The payout platform id, e.g. venmo"),
    currency: z.string().describe("The ISO 4217 fiat currency code to receive, e.g. USD"),
    payee: z.string().describe("Your payee handle on the selected platform"),
  })
  .strip()
  .describe("Instructions for preparing a Peer Cash cash-out");

/**
 * Prepares the unsigned transactions that open a Peer Cash order.
 *
 * @param _wallet - Unused; the prepare path never signs or reads the wallet.
 * @param args - The amount, platform, currency, and payee handle.
 * @returns The unsigned plan as JSON, or a typed error message.
 */
export async function peerCashPrepareCashout(
  _wallet: ZeroXgaslessSmartAccount,
  args: z.infer<typeof PeerCashPrepareCashoutInput>,
): Promise<string> {
  try {
    const plan = await getPeerCashClient().prepare({
      amount: toUsdcBaseUnits(args.amount),
      receive: {
        platform: args.platform.trim(),
        currency: args.currency.trim().toUpperCase() as CurrencyType,
        payee: args.payee.trim(),
      },
    });
    return formatResult(prepareResultToJson(plan));
  } catch (error) {
    return formatError("prepare cashout", error);
  }
}

/**
 * Peer Cash prepare-cashout action.
 */
export class PeerCashPrepareCashoutAction
  implements AgentkitAction<typeof PeerCashPrepareCashoutInput>
{
  public name = "peer_cash_prepare_cashout";
  public description = PEER_CASH_PREPARE_CASHOUT_PROMPT;
  public argsSchema = PeerCashPrepareCashoutInput;
  public func = peerCashPrepareCashout;
  public walletOptional = true;
  public smartAccountRequired = false;
}
