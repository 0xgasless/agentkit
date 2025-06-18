import { z } from "zod";
import { AgentkitAction } from "../../agentkit";
import { ZeroXgaslessSmartAccount } from "@0xgasless/smart-account";

const GET_TOP_BOOSTED_TOKENS_PROMPT = `
Fetches the tokens with most active boosts from DexScreener API.

This tool retrieves information about the top boosted tokens including:
- Token URL
- Chain ID
- Token address
- Boost amount
- Total boost amount
- Icon URL
- Header image URL
- Description
- Social links

This endpoint returns tokens ranked by their total boost amounts and has a rate limit of 60 requests per minute.
`;

/**
 * Input schema for getting top boosted tokens.
 * No parameters required for this endpoint.
 */
export const GetTopBoostedTokensInput = z
  .object({})
  .strip()
  .describe("Get the tokens with most active boosts from DexScreener");

/**
 * Response interface for top boosted token data.
 */
interface TopBoostedToken {
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
 * Fetches the tokens with most active boosts from DexScreener API.
 *
 * @param _wallet - The smart account (not used for this action).
 * @param _args - The input arguments (empty for this endpoint).
 * @returns A formatted string containing the top boosted tokens.
 */
export async function getTopBoostedTokens(
  _wallet: ZeroXgaslessSmartAccount,
  _args: z.infer<typeof GetTopBoostedTokensInput>,
): Promise<string> {
  try {
    const response = await fetch("https://api.dexscreener.com/token-boosts/top/v1", {
      method: "GET",
      headers: {
        Accept: "application/json",
        "User-Agent": "0xGasless-AgentKit/1.0",
      },
    });

    if (!response.ok) {
      return `Error fetching top boosted tokens: ${response.status} ${response.statusText}`;
    }

    const data: TopBoostedToken[] = await response.json();

    if (!Array.isArray(data) || data.length === 0) {
      return "No top boosted tokens found.";
    }

    let result = "🏆 Top Boosted Tokens (Most Active Boosts):\n\n";

    data.slice(0, 15).forEach((token, index) => {
      result += `${index + 1}. ${getBoostRankEmoji(index)} Top Boosted Token\n`;
      result += `   • Chain: ${token.chainId}\n`;
      result += `   • Address: ${token.tokenAddress}\n`;
      result += `   • URL: ${token.url}\n`;
      result += `   • Current Boost: ${token.amount}\n`;
      result += `   • Total Boost Amount: ${token.totalAmount}\n`;

      if (token.description) {
        const shortDesc =
          token.description.length > 80
            ? `${token.description.substring(0, 80)}...`
            : token.description;
        result += `   • Description: ${shortDesc}\n`;
      }

      if (token.links && token.links.length > 0) {
        result += `   • Social Links: ${token.links.length} link(s)\n`;
      }

      result += "\n";
    });

    if (data.length > 15) {
      result += `... and ${data.length - 15} more top boosted tokens\n`;
    }

    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred";
    return `Error fetching top boosted tokens: ${errorMessage}`;
  }
}

/**
 * Helper function to get rank emoji for top positions.
 */
function getBoostRankEmoji(index: number): string {
  if (index === 0) return "🥇";
  if (index === 1) return "🥈";
  if (index === 2) return "🥉";
  if (index < 10) return "🔥";
  return "⭐";
}

/**
 * Get Top Boosted Tokens action.
 */
export class GetTopBoostedTokensAction implements AgentkitAction<typeof GetTopBoostedTokensInput> {
  public name = "get_top_boosted_tokens";
  public description = GET_TOP_BOOSTED_TOKENS_PROMPT;
  public argsSchema = GetTopBoostedTokensInput;
  public func = getTopBoostedTokens;
  public smartAccountRequired = false;
}
