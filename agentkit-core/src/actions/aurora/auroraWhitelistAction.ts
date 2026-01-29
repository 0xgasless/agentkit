import { z } from "zod";
import { AgentkitAction } from "../../agentkit";
import { ZeroXgaslessSmartAccount } from "@0xgasless/smart-account";

const AURORA_WHITELIST_PROMPT = `
Manage access whitelists for an Aurora Virtual Chain.
This action allows adding or removing an address from the transaction or deployment whitelist of a specific chain.

USAGE
  name: aurora_whitelist
  args:
    • chainId (number, required) - The Chain ID of the Aurora Virtual Chain.
    • address (string, required) - The wallet address to whitelist/block.
    • allow (boolean, required) - Set to true to add to whitelist, false to remove.
    • type (string, optional) - "transaction" (default) or "deployment".

REQUIREMENTS
  • AURORA_API_KEY must be set in the environment variables.
`;

export const AuroraWhitelistInput = z.object({
  chainId: z.number().describe("The Chain ID to manage."),
  address: z.string().describe("The address to manage."),
  allow: z.boolean().describe("True to add to whitelist, false to remove."),
  type: z.enum(["transaction", "deployment"]).optional().default("transaction").describe("The type of whitelist to modify."),
});

export async function auroraWhitelistAction(
  _wallet: ZeroXgaslessSmartAccount,
  args: z.infer<typeof AuroraWhitelistInput>,
): Promise<string> {
  const apiKey = process.env.AURORA_API_KEY;
  if (!apiKey) {
    return "Error: AURORA_API_KEY is not set in environment variables.";
  }

  const endpoint = `https://api.aurora.dev/v1/chain/${args.chainId}/whitelist/${args.type}`; // Constructed based on standard REST patterns for Aurora

  try {
    const method = args.allow ? "POST" : "DELETE";
    const body = args.allow ? JSON.stringify({ address: args.address }) : undefined;

    const response = await fetch(endpoint, {
      method: method,
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: body,
    });

    if (!response.ok) {
      const text = await response.text();
      return `Error managing whitelist: ${response.status} ${response.statusText} - ${text}`;
    }

    return `Successfully ${args.allow ? "added" : "removed"} ${args.address} ${args.allow ? "to" : "from"} the ${args.type} whitelist for chain ${args.chainId}.`;
  } catch (error) {
    return `Error executing Aurora Whitelist Action: ${error instanceof Error ? error.message : String(error)}`;
  }
}

export class AuroraWhitelistAction implements AgentkitAction<typeof AuroraWhitelistInput> {
  public name = "aurora_whitelist";
  public description = AURORA_WHITELIST_PROMPT;
  public argsSchema = AuroraWhitelistInput;
  public func = auroraWhitelistAction;
  public smartAccountRequired = false;
}
