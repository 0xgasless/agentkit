import { z } from "zod";
import { AgentkitAction } from "../../agentkit";
import { ZeroXgaslessSmartAccount } from "@0xgasless/smart-account-sdk";

const AURORA_GAS_POLICY_PROMPT = `
Manage Borealis Gas Station policies on Aurora.
This action allows adding or removing a user's address from a specific free gas policy.

USAGE
  name: aurora_gas_policy
  args:
    • policyId (string, required) - The ID of the Borealis Gas Policy.
    • address (string, required) - The user wallet address to sponsor.
    • action (string, optional) - "add" (default) or "remove".

REQUIREMENTS
  • AURORA_API_KEY must be set in the environment variables.
`;

export const AuroraGasPolicyInput = z.object({
  policyId: z.string().describe("The ID of the Gas Policy to manage."),
  address: z.string().describe("The user address to manage."),
  action: z
    .enum(["add", "remove"])
    .optional()
    .default("add")
    .describe("Whether to add or remove the user from the policy."),
});

export async function auroraGasPolicyAction(
  _wallet: ZeroXgaslessSmartAccount,
  args: z.infer<typeof AuroraGasPolicyInput>,
): Promise<string> {
  const apiKey = process.env.AURORA_API_KEY;
  if (!apiKey) {
    return "Error: AURORA_API_KEY is not set in environment variables.";
  }

  // Borealis API endpoint structure
  const endpoint = `https://api.aurora.dev/v1/borealis/policies/${args.policyId}/users`;

  try {
    const method = args.action === "add" ? "POST" : "DELETE";
    const body = JSON.stringify({ address: args.address });

    const response = await fetch(endpoint, {
      method: method,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: method === "POST" ? body : undefined, // DELETE might pass address in URL or body depending on API, using safer body approach for now or query param if needed.
      // Note: If DELETE requires address in path, it would be .../users/{address}.
      // Assuming standard REST collection manipulation where body defines the resource.
      // If this fails, we can adjust to URL param.
    });

    if (!response.ok) {
      // Handle the case where DELETE needs address in URL
      if (method === "DELETE" && response.status === 404) {
        // Retry with URL param style just in case
        const retryEndpoint = `${endpoint}/${args.address}`;
        const retryResponse = await fetch(retryEndpoint, {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
        });
        if (retryResponse.ok) {
          return `Successfully removed ${args.address} from gas policy ${args.policyId}.`;
        }
      }

      const text = await response.text();
      return `Error managing gas policy: ${response.status} ${response.statusText} - ${text}`;
    }

    return `Successfully ${args.action}ed ${args.address} ${args.action === "add" ? "to" : "from"} gas policy ${args.policyId}.`;
  } catch (error) {
    return `Error executing Aurora Gas Policy Action: ${error instanceof Error ? error.message : String(error)}`;
  }
}

export class AuroraGasPolicyAction implements AgentkitAction<typeof AuroraGasPolicyInput> {
  public name = "aurora_gas_policy";
  public description = AURORA_GAS_POLICY_PROMPT;
  public argsSchema = AuroraGasPolicyInput;
  public func = auroraGasPolicyAction;
  public smartAccountRequired = false;
}
