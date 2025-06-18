import { z } from "zod";
import { AgentkitAction } from "../../agentkit";
import { ZeroXgaslessSmartAccount } from "@0xgasless/smart-account";

const GET_LATEST_BOOSTED_TOKENS_PROMPT = `
Fetches the latest boosted tokens from DexScreener API.

This tool retrieves information about recently boosted tokens including:
- Token URL
- Chain ID
- Token address
- Boost amount
- Total boost amount
- Icon URL
- Header image URL
- Description
- Social links

This endpoint has a rate limit of 60 requests per minute.
`;

/**
 * Input schema for getting latest boosted tokens.
 * No parameters required for this endpoint.
 */
export const GetLatestBoostedTokensInput = z
  .object({})
  .strip()
  .describe("Get the latest boosted tokens from DexScreener");

/**
 * Response interface for boosted token data.
 */
interface BoostedToken {
  url: string;
  chainId: string;
  tokenAddress: string;
  amount: number;
  totalAmount: number;
  icon: string | null;
  header: string | null;
  description: string | null;
  links: Array<{
    type: string | null;
    label: string | null;
    url: string;
  }> | null;
}

/**
 * Fetches the latest boosted tokens from DexScreener API.
 *
 * @param _wallet - The smart account (not used for this action).
 * @param _args - The input arguments (empty for this endpoint).
 * @returns A formatted string containing the latest boosted tokens.
 */
export async function getLatestBoostedTokens(
  _wallet: ZeroXgaslessSmartAccount,
  _args: z.infer<typeof GetLatestBoostedTokensInput>,
): Promise<string> {
  try {
    const response = await fetch("https://api.dexscreener.com/token-boosts/latest/v1", {
      method: "GET",
      headers: {
        Accept: "application/json",
        "User-Agent": "0xGasless-AgentKit/1.0",
      },
    });

    if (!response.ok) {
      return `Error fetching boosted tokens: ${response.status} ${response.statusText}`;
    }

    const data: BoostedToken[] = await response.json();

    if (!Array.isArray(data) || data.length === 0) {
      return "No boosted tokens found.";
    }

    let result = "🚀 Latest Boosted Tokens:\n\n";

    data.slice(0, 10).forEach((token, index) => {
      result += `${index + 1}. Boosted Token\n`;
      result += `   • Chain: ${token.chainId}\n`;
      result += `   • Address: ${token.tokenAddress}\n`;
      result += `   • URL: ${token.url}\n`;
      result += `   • Boost Amount: ${token.amount}\n`;
      result += `   • Total Boost Amount: ${token.totalAmount}\n`;

      if (token.description) {
        const shortDesc =
          token.description.length > 100
            ? `${token.description.substring(0, 100)}...`
            : token.description;
        result += `   • Description: ${shortDesc}\n`;
      }

      if (token.links && token.links.length > 0) {
        result += `   • Links: ${token.links.length} social link(s)\n`;
      }

      result += "\n";
    });

    if (data.length > 10) {
      result += `... and ${data.length - 10} more boosted tokens\n`;
    }

    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred";
    return `Error fetching latest boosted tokens: ${errorMessage}`;
  }
}

/**
 * Get Latest Boosted Tokens action.
 */
export class GetLatestBoostedTokensAction
  implements AgentkitAction<typeof GetLatestBoostedTokensInput>
{
  public name = "get_latest_boosted_tokens";
  public description = GET_LATEST_BOOSTED_TOKENS_PROMPT;
  public argsSchema = GetLatestBoostedTokensInput;
  public func = getLatestBoostedTokens;
  public smartAccountRequired = false;
}
