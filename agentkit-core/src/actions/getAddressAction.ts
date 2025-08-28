import { z } from "zod";
import { ZeroXgaslessSmartAccount } from "@0xgasless/smart-account";
import { AgentkitAction } from "../agentkit";

const GET_ADDRESS_PROMPT = `
This tool retrieves the smart account address that is already configured with the SDK.
No additional wallet setup or private key generation is needed.

USAGE GUIDANCE:
- When a user asks for their wallet address, account address, or smart account address, use this tool immediately
- No parameters are needed to retrieve the address
- The address can be used for receiving tokens or for verification purposes
- This is a read-only operation that doesn't modify any blockchain state

Note: This action works on all supported networks (Base, Sonic, Moonbeam, Avalanche, BSC).
`;

export const GetAddressInput = z
  .object({})
  .strip()
  .describe("No input required to get the smart account address");

/**
 * Gets the smart account address.
 *
 * @returns A message containing the smart account address.
 */
export async function getAddress(
  wallet: ZeroXgaslessSmartAccount,
  args: z.infer<typeof GetAddressInput>,
): Promise<string> {
  try {
    const smartAccount = await wallet.getAddress(args);

    return `Smart Account: ${smartAccount}`;
  } catch (error) {
    console.error("Error getting address:", error);
    return `Error getting address: ${error instanceof Error ? error.message : String(error)}`;
  }
}

/**
 * Get smart account address action.
 */
export class GetAddressAction implements AgentkitAction<typeof GetAddressInput> {
  public name = "get_address";
  public description = GET_ADDRESS_PROMPT;
  public argsSchema = GetAddressInput;
  public func = getAddress;
  public smartAccountRequired = true;
}
