import type { ZeroXgaslessSmartAccount } from "@0xgasless/smart-account-sdk";
import { preparedTxToJson } from "@zkp2p/cash";
import { z } from "zod";
import type { AgentkitAction } from "../../agentkit";
import { formatError, formatResult, getPeerCashClient } from "./client";

const PEER_CASH_PREPARE_ACCESS_POLICY_PROMPT = `
Builds the verified-buyer access-policy transaction a Venmo, Cash App, or PayPal
order needs before any buyer can fill it.

USAGE
  name : peer_cash_prepare_access_policy
  args :
    • depositId (string, required) - "escrowAddress_onchainId"

WHEN TO USE
  Only after peer_cash_prepare_cashout returned accessPolicyRequired: true and
  its createDeposit transaction has confirmed, because the policy applies to the
  order that deposit created. Orders on every other platform never need this.

CUSTODY
  This action returns one UNSIGNED transaction and never accepts or reads a
  private key. Submit it with send_transaction from the maker address that owns
  the order.
`;

export const PeerCashPrepareAccessPolicyInput = z
  .object({
    depositId: z.string().describe("The composite Peer Cash order id, escrowAddress_onchainId"),
  })
  .strip()
  .describe("Instructions for preparing a Peer Cash order access policy");

/**
 * Prepares the unsigned access-policy transaction for a restricted order.
 *
 * @param _wallet - Unused; the prepare path never signs or reads the wallet.
 * @param args - The order id.
 * @returns The unsigned transaction as JSON, or a typed error message.
 */
export async function peerCashPrepareAccessPolicy(
  _wallet: ZeroXgaslessSmartAccount,
  args: z.infer<typeof PeerCashPrepareAccessPolicyInput>,
): Promise<string> {
  try {
    const tx = getPeerCashClient().prepareAccessPolicy(args.depositId.trim());
    return formatResult(preparedTxToJson(tx));
  } catch (error) {
    return formatError("prepare access policy", error);
  }
}

/**
 * Peer Cash prepare-access-policy action.
 */
export class PeerCashPrepareAccessPolicyAction
  implements AgentkitAction<typeof PeerCashPrepareAccessPolicyInput>
{
  public name = "peer_cash_prepare_access_policy";
  public description = PEER_CASH_PREPARE_ACCESS_POLICY_PROMPT;
  public argsSchema = PeerCashPrepareAccessPolicyInput;
  public func = peerCashPrepareAccessPolicy;
  public walletOptional = true;
  public smartAccountRequired = false;
}
