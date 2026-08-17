import type { ZeroXgaslessSmartAccount } from "@0xgasless/smart-account-sdk";
import { preparedStepToJson, preparedTxToJson } from "@zkp2p/cash";
import { z } from "zod";
import type { AgentkitAction } from "../../agentkit";
import { formatError, formatResult, getPeerCashClient, toUsdcBaseUnits } from "./client";

const PEER_CASH_PREPARE_WITHDRAW_PROMPT = `
Builds the transactions that pull USDC back out of a Peer Cash order.

USAGE
  name : peer_cash_prepare_withdraw
  args :
    • depositId (string, required) - "escrowAddress_onchainId"
    • amount (string, optional) - decimal USDC to withdraw. Omit to close the
      order and take back everything still unlocked.

CUSTODY
  This action returns UNSIGNED transactions and never accepts or reads a private
  key. Submit each entry of txs with send_transaction, in the given order, from
  the maker address that owns the order.

BEHAVIOUR
  • Without amount the order is closed, and the plan includes a
    pruneExpiredIntents transaction first when expired buyer intents are in the
    way.
  • A live buyer intent locks the matched funds and fails a full close with
    ACTIVE_INTENT_BLOCKS_WITHDRAWAL until it expires; that error is retryable.
  • With amount it is a partial withdrawal of the unlocked balance, which a live
    buyer intent does not block.

Use peer_cash_order first to check that withdraw is in nextActions.
`;

export const PeerCashPrepareWithdrawInput = z
  .object({
    depositId: z.string().describe("The composite Peer Cash order id, escrowAddress_onchainId"),
    amount: z
      .string()
      .optional()
      .nullable()
      .describe("Decimal USDC to withdraw; omit to close the order entirely"),
  })
  .strip()
  .describe("Instructions for preparing a Peer Cash withdrawal");

/**
 * Prepares the unsigned transactions that unwind a Peer Cash order.
 *
 * @param _wallet - Unused; the prepare path never signs or reads the wallet.
 * @param args - The order id and an optional partial amount.
 * @returns The unsigned plan as JSON, or a typed error message.
 */
export async function peerCashPrepareWithdraw(
  _wallet: ZeroXgaslessSmartAccount,
  args: z.infer<typeof PeerCashPrepareWithdrawInput>,
): Promise<string> {
  try {
    const { txs, steps } = await getPeerCashClient().prepareWithdraw(
      args.depositId.trim(),
      args.amount ? { amount: toUsdcBaseUnits(args.amount) } : undefined,
    );
    return formatResult({
      txs: txs.map(preparedTxToJson),
      steps: steps.map(preparedStepToJson),
    });
  } catch (error) {
    return formatError("prepare withdraw", error);
  }
}

/**
 * Peer Cash prepare-withdraw action.
 */
export class PeerCashPrepareWithdrawAction
  implements AgentkitAction<typeof PeerCashPrepareWithdrawInput>
{
  public name = "peer_cash_prepare_withdraw";
  public description = PEER_CASH_PREPARE_WITHDRAW_PROMPT;
  public argsSchema = PeerCashPrepareWithdrawInput;
  public func = peerCashPrepareWithdraw;
  public walletOptional = true;
  public smartAccountRequired = false;
}
