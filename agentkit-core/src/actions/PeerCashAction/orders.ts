import type { ZeroXgaslessSmartAccount } from "@0xgasless/smart-account-sdk";
import { orderToJson } from "@zkp2p/cash";
import { z } from "zod";
import type { AgentkitAction } from "../../agentkit";
import { formatError, formatResult, getPeerCashClient } from "./client";

const PEER_CASH_ORDERS_PROMPT = `
Lists the Peer Cash orders belonging to a maker address, newest first.

USAGE
  name : peer_cash_orders
  args :
    • address (string, optional) - the maker wallet. Defaults to this agent's
      smart account when one is configured.
    • inFlight (boolean, optional) - only orders still needing attention
      (awaiting-buyer, matched, delivering). Defaults to false.
    • limit (number, optional) - maximum deposits to scan, 1 to 1000. Default 100.

A Peer Cash order is an on-chain deposit keyed by its depositor, so this reads
straight from the chain with no account linkage. Use peer_cash_order for the
full detail of a single order.
`;

export const PeerCashOrdersInput = z
  .object({
    address: z
      .string()
      .optional()
      .nullable()
      .describe("The maker wallet address; defaults to this agent's smart account"),
    inFlight: z
      .boolean()
      .optional()
      .nullable()
      .describe("Only return orders still awaiting a buyer, matched, or delivering"),
    limit: z.number().optional().nullable().describe("Maximum deposits to scan (default 100)"),
  })
  .strip()
  .describe("Instructions for listing Peer Cash orders");

/**
 * Lists the Peer Cash orders owned by a maker address.
 *
 * @param wallet - Used only to default the address; may be undefined.
 * @param args - The optional address, in-flight filter, and scan limit.
 * @returns The orders as JSON, or a typed error message.
 */
export async function peerCashOrders(
  wallet: ZeroXgaslessSmartAccount,
  args: z.infer<typeof PeerCashOrdersInput>,
): Promise<string> {
  try {
    const owner = args.address?.trim() || (await wallet?.getAddress());
    if (!owner) {
      return "Error: peer_cash_orders needs an address. Pass one, or configure Agentkit with a wallet so the agent's own smart account can be used.";
    }
    const orders = await getPeerCashClient().orders(owner, {
      ...(args.inFlight != null ? { inFlight: args.inFlight } : {}),
      ...(args.limit != null ? { limit: args.limit } : {}),
    });
    return formatResult(orders.map(orderToJson));
  } catch (error) {
    return formatError("orders", error);
  }
}

/**
 * Peer Cash order-listing action.
 */
export class PeerCashOrdersAction implements AgentkitAction<typeof PeerCashOrdersInput> {
  public name = "peer_cash_orders";
  public description = PEER_CASH_ORDERS_PROMPT;
  public argsSchema = PeerCashOrdersInput;
  public func = peerCashOrders;
  public walletOptional = true;
  public smartAccountRequired = false;
}
