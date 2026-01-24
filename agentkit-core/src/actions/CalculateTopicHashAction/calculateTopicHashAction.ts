import { z } from "zod";
import { ZeroXgaslessSmartAccount } from "@0xgasless/smart-account";
import { AgentkitAction } from "../../agentkit";
import { keccak256, toBytes } from "viem";

const CALCULATE_TOPIC_HASH_PROMPT = `
This tool calculates the Keccak256 hash of a given string (usually an event signature).
Useful for generating topic hashes for Chainlink CRE Log Triggers.

Required parameters:
- eventSignature: The event signature string (e.g., "ReportReceived(bytes32,address,string)").
`;

export const CalculateTopicHashInput = z
  .object({
    eventSignature: z.string().describe("The event signature to hash e.g. 'Transfer(address,address,uint256)'"),
  })
  .strip()
  .describe("Instructions for calculating topic hash");

async function calculateTopicHash(
  wallet: ZeroXgaslessSmartAccount,
  args: z.infer<typeof CalculateTopicHashInput>,
): Promise<string> {
  try {
    const hash = keccak256(toBytes(args.eventSignature));
    return `
Event Signature: ${args.eventSignature}
Topic Hash: ${hash}
    `;
  } catch (error: any) {
    return `Error calculating hash: ${error.message}`;
  }
}

export class CalculateTopicHashAction implements AgentkitAction<typeof CalculateTopicHashInput> {
  public name = "calculate_topic_hash";
  public description = CALCULATE_TOPIC_HASH_PROMPT;
  public argsSchema = CalculateTopicHashInput;
  public func = calculateTopicHash;
  public smartAccountRequired = false;
}
