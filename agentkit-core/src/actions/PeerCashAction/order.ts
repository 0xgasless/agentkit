import type { ZeroXgaslessSmartAccount } from "@0xgasless/smart-account-sdk";
import { orderToJson } from "@zkp2p/cash";
import { z } from "zod";
import type { AgentkitAction } from "../../agentkit";
import { formatError, formatResult, getPeerCashClient } from "./client";

const PEER_CASH_ORDER_PROMPT = `
Reads the current state of one Peer Cash order.

USAGE
  name : peer_cash_order
  args :
    • depositId (string, required) - "escrowAddress_onchainId", e.g.
      "0x777777779d229cdf3110e9de47943791c26300ef_3936"

RETURNS
  - state: awaiting-buyer | matched | delivering | delivered | returned
  - totalAmount, filledAmount, pendingAmount, returnedAmount in USDC base units
  - fills: each buyer's locked rate, fiat owed, verified fiat paid, and latency
  - nextActions: wait | withdraw

An order is resumable from its id alone, so this works in a fresh session with
no prior state. A brief ORDER_NOT_FOUND right after the deposit confirms is
indexer lag: retry this read, never the transaction. Use peer_cash_orders to
find the id.
`;

export const PeerCashOrderInput = z
  .object({
    depositId: z.string().describe("The composite Peer Cash order id, escrowAddress_onchainId"),
  })
  .strip()
  .describe("Instructions for reading one Peer Cash order");

/**
 * Reads one Peer Cash order by its composite deposit id.
 *
 * @param _wallet - Unused; reading an order never touches the wallet.
 * @param args - The composite deposit id.
 * @returns The order state as JSON, or a typed error message.
 */
export async function peerCashOrder(
  _wallet: ZeroXgaslessSmartAccount,
  args: z.infer<typeof PeerCashOrderInput>,
): Promise<string> {
  try {
    return formatResult(orderToJson(await getPeerCashClient().order(args.depositId.trim())));
  } catch (error) {
    return formatError("order", error);
  }
}

/**
 * Peer Cash order-read action.
 */
export class PeerCashOrderAction implements AgentkitAction<typeof PeerCashOrderInput> {
  public name = "peer_cash_order";
  public description = PEER_CASH_ORDER_PROMPT;
  public argsSchema = PeerCashOrderInput;
  public func = peerCashOrder;
  public walletOptional = true;
  public smartAccountRequired = false;
}
