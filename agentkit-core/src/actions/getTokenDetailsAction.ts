import { z } from "zod";
import { ZeroXgaslessSmartAccount } from "@0xgasless/smart-account-sdk";
import { fetchTokenDetails } from "../services";
import { AgentkitAction } from "../agentkit";

const GET_TOKEN_DETAILS_PROMPT = `
This tool will fetch details about an ERC20 token including:
- Token name
- Token symbol
- Decimals
- Contract address
- Chain ID

Provide the token contract address to get its details.
`;

export const GetTokenDetailsInput = z
  .object({
    tokenAddress: z.string().describe("The ERC20 token contract address"),
  })
  .strip()
  .describe("Instructions for getting token details");

/**
 * Gets details about an ERC20 token.
 *
 * @param wallet - The smart account to use for querying.
 * @param args - The input arguments containing the token address.
 * @returns A message containing the token details.
 */
export async function getTokenDetails(
  wallet: ZeroXgaslessSmartAccount,
  args: z.infer<typeof GetTokenDetailsInput>,
): Promise<string> {
  try {
    const details = await fetchTokenDetails(wallet, args.tokenAddress);
    if (!details) {
      return "Error getting token details";
    }
    return `
    Token Details:
            Name: ${details.name}
            Symbol: ${details.symbol}
            Decimals: ${details.decimals}
            Address: ${details.address}
            Chain ID: ${details.chainId}
    `;
  } catch (error) {
    return `Error getting token details: ${error}`;
  }
}

/**
 * Get token details action.
 */
export class GetTokenDetailsAction implements AgentkitAction<typeof GetTokenDetailsInput> {
  public name = "get_token_details";
  public walletOptional = true;
  public description = GET_TOKEN_DETAILS_PROMPT;
  public argsSchema = GetTokenDetailsInput;
  public func = getTokenDetails;
  public smartAccountRequired = true;
}
