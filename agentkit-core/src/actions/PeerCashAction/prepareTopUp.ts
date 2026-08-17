import type { ZeroXgaslessSmartAccount } from "@0xgasless/smart-account-sdk";
import { preparedStepToJson, preparedTxToJson } from "@zkp2p/cash";
import { z } from "zod";
import type { AgentkitAction } from "../../agentkit";
import { formatError, formatResult, getPeerCashClient, toUsdcBaseUnits } from "./client";

const PEER_CASH_PREPARE_TOP_UP_PROMPT = `
Builds the transactions that add more Base USDC to a live Peer Cash order,
keeping the same payee and the same live oracle rate.

USAGE
  name : peer_cash_prepare_topup
  args :
    • depositId (string, required) - "escrowAddress_onchainId"
    • amount (string, required) - decimal USDC to add, e.g. "250"

CUSTODY
  This action returns UNSIGNED transactions and never accepts or reads a private
  key. Submit each entry of txs with send_transaction, in the given order
  ([approve, addFunds]), from the maker address that owns the order.

Topping up an order that has already delivered or been returned fails with
ORDER_NOT_ACTIVE; check peer_cash_order first, or open a new order with
peer_cash_prepare_cashout instead.
`;

export const PeerCashPrepareTopUpInput = z
  .object({
    depositId: z.string().describe("The composite Peer Cash order id, escrowAddress_onchainId"),
    amount: z.string().describe("The additional Base USDC to add, as a decimal string"),
  })
  .strip()
  .describe("Instructions for preparing a Peer Cash top-up");

/**
 * Prepares the unsigned transactions that add USDC to a live Peer Cash order.
 *
 * @param _wallet - Unused; the prepare path never signs or reads the wallet.
 * @param args - The order id and the amount to add.
 * @returns The unsigned plan as JSON, or a typed error message.
 */
export async function peerCashPrepareTopUp(
  _wallet: ZeroXgaslessSmartAccount,
  args: z.infer<typeof PeerCashPrepareTopUpInput>,
): Promise<string> {
  try {
    const { txs, steps } = await getPeerCashClient().prepareTopUp(
      args.depositId.trim(),
      toUsdcBaseUnits(args.amount),
    );
    return formatResult({
      txs: txs.map(preparedTxToJson),
      steps: steps.map(preparedStepToJson),
    });
  } catch (error) {
    return formatError("prepare top-up", error);
  }
}

/**
 * Peer Cash prepare-top-up action.
 */
export class PeerCashPrepareTopUpAction
  implements AgentkitAction<typeof PeerCashPrepareTopUpInput>
{
  public name = "peer_cash_prepare_topup";
  public description = PEER_CASH_PREPARE_TOP_UP_PROMPT;
  public argsSchema = PeerCashPrepareTopUpInput;
  public func = peerCashPrepareTopUp;
  public walletOptional = true;
  public smartAccountRequired = false;
}
