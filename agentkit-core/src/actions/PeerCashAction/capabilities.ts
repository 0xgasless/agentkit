import type { ZeroXgaslessSmartAccount } from "@0xgasless/smart-account-sdk";
import { capabilitiesToJson } from "@zkp2p/cash";
import { z } from "zod";
import type { AgentkitAction } from "../../agentkit";
import { formatError, formatResult, getPeerCashClient } from "./client";

const PEER_CASH_CAPABILITIES_PROMPT = `
Discovers what Peer Cash can do before you name a payout rail or currency.

Peer Cash turns Base USDC into fiat: your wallet's USDC becomes a protocol-held
order, a buyer pays the fiat to your own payment handle and proves it, and the
escrow releases the USDC at the live Chainlink oracle rate with zero spread.

USAGE
  name : peer_cash_capabilities
  args : none

RETURNS
  - platforms: payout platform ids with the fiat currencies each can pay, the
    handle format it expects, and whether it needs an identity attestation
  - destination: always Base USDC (chain 8453)
  - amount: the protocol minimum and the recommended minimum, in USDC base units
  - pricing: the oracle model and spread in basis points

Call this first. peer_cash_estimate and peer_cash_prepare_cashout only accept a
platform and currency listed here.
`;

export const PeerCashCapabilitiesInput = z
  .object({})
  .strip()
  .describe("No arguments; Peer Cash capabilities are static");

/**
 * Reads the Peer Cash capability catalog.
 *
 * @param _wallet - Unused; capability discovery never touches the wallet.
 * @param _args - Unused; the action takes no arguments.
 * @returns The capability catalog as JSON, or a typed error message.
 */
export async function peerCashCapabilities(
  _wallet: ZeroXgaslessSmartAccount,
  _args: z.infer<typeof PeerCashCapabilitiesInput>,
): Promise<string> {
  try {
    return formatResult(capabilitiesToJson(getPeerCashClient().capabilities()));
  } catch (error) {
    return formatError("capabilities", error);
  }
}

/**
 * Peer Cash capability discovery action.
 */
export class PeerCashCapabilitiesAction
  implements AgentkitAction<typeof PeerCashCapabilitiesInput>
{
  public name = "peer_cash_capabilities";
  public description = PEER_CASH_CAPABILITIES_PROMPT;
  public argsSchema = PeerCashCapabilitiesInput;
  public func = peerCashCapabilities;
  public walletOptional = true;
  public smartAccountRequired = false;
}
