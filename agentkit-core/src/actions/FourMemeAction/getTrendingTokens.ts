/**
 * Four.meme Get Trending Tokens Action
 *
 * Fetches trending/popular meme tokens on Four.meme platform
 *
 * Features:
 * - Latest token launches
 * - Top volume tokens
 * - Recently completed bonding curves
 * - Trending tokens by activity
 */

import { z } from "zod";
import { ZeroXgaslessSmartAccount } from "@0xgasless/smart-account";
import { AgentkitAction } from "../../agentkit";
import axios from "axios";
import { FOUR_MEME_API_BASE } from "./constants";

const GET_TRENDING_TOKENS_PROMPT = `
This tool retrieves trending and popular meme tokens on the Four.meme platform.

Information Provided:
- Latest token launches
- Top trading volume tokens
- Recently completed bonding curves
- Trending tokens by activity
- Token metadata and stats

Inputs:
- limit: Number of tokens to return (default: 10, max: 50)
- sortBy: How to sort results - "latest", "volume", "completed", "trending" (default: "trending")

Returns:
- List of tokens with details
- Trading activity
- Bonding curve status
- Launch information

Important Notes:
- Works on BNB Chain (Chain ID: 56)
- Read-only operation (no transaction needed)
- Data refreshed every few minutes
- Useful for discovering new launches

Example usage:
"Show me the latest 10 tokens on Four.meme"
"What are the top volume tokens?"
"Show trending Four.meme tokens"
`;

// Input schema
export const GetTrendingTokensInput = z
  .object({
    limit: z
      .number()
      .min(1)
      .max(50)
      .default(10)
      .describe("Number of tokens to return (1-50, default: 10)"),
    sortBy: z
      .enum(["latest", "volume", "completed", "trending"])
      .default("trending")
      .describe("Sort order: latest, volume, completed, or trending"),
  })
  .strip()
  .describe("Get trending meme tokens on Four.meme");

/**
 * Interface for token data from API
 */
interface TrendingToken {
  address: string;
  name: string;
  symbol: string;
  description?: string;
  logoUrl?: string;
  quoteToken: string;
  marketCap: string;
  volume24h: string;
  bondingCurveProgress: number;
  isListed: boolean;
  creator: string;
  createdAt: number;
  holders?: number;
  trades24h?: number;
}

/**
 * Get trending tokens from Four.meme
 */
export async function getTrendingTokens(
  _wallet: ZeroXgaslessSmartAccount,
  args: z.infer<typeof GetTrendingTokensInput>,
): Promise<string> {
  try {
    // Note: This is a placeholder implementation
    // The actual Four.meme API endpoint may differ
    // You'll need to update the endpoint based on official API documentation

    const endpoint = `${FOUR_MEME_API_BASE}/tokens/trending`;

    try {
      const response = await axios.get(endpoint, {
        params: {
          limit: args.limit,
          sortBy: args.sortBy,
        },
        timeout: 10000,
      });

      const tokens = response.data.tokens as TrendingToken[];

      if (!tokens || tokens.length === 0) {
        return `No trending tokens found. The Four.meme platform might be experiencing low activity.`;
      }

      // Format output
      let result = `🔥 Trending Tokens on Four.meme\n`;
      result += `Showing ${tokens.length} tokens sorted by ${args.sortBy}\n\n`;

      tokens.forEach((token, index) => {
        result += `${index + 1}. ${token.name} (${token.symbol})\n`;
        result += `   Address: ${token.address}\n`;

        if (token.description) {
          const desc =
            token.description.length > 80
              ? token.description.substring(0, 77) + "..."
              : token.description;
          result += `   Description: ${desc}\n`;
        }

        result += `   Quote Token: ${token.quoteToken}\n`;
        result += `   Market Cap: ${token.marketCap}\n`;

        if (token.volume24h) {
          result += `   24h Volume: ${token.volume24h}\n`;
        }

        result += `   Bonding Curve: ${token.bondingCurveProgress}%\n`;
        result += `   Status: ${token.isListed ? "✅ Listed on PancakeSwap" : "🔄 In Bonding Curve"}\n`;

        if (token.holders) {
          result += `   Holders: ${token.holders}\n`;
        }

        if (token.trades24h) {
          result += `   24h Trades: ${token.trades24h}\n`;
        }

        const createdDate = new Date(token.createdAt * 1000);
        result += `   Created: ${createdDate.toLocaleDateString()}\n`;

        if (token.logoUrl) {
          result += `   Logo: ${token.logoUrl}\n`;
        }

        result += `\n`;
      });

      result += `💡 Use 'fourmeme_get_token_info' to get detailed information about a specific token.\n`;
      result += `💡 Use 'fourmeme_buy_token' to purchase tokens during bonding curve phase.`;

      return result;
    } catch (apiError: unknown) {
      // If API call fails, return mock data for demonstration
      const error = apiError as { code?: string };
      if (error.code === "ENOTFOUND" || error.code === "ECONNREFUSED") {
        return getMockTrendingTokens(args);
      }
      throw apiError;
    }
  } catch (error) {
    return `Error fetching trending tokens: ${error instanceof Error ? error.message : String(error)}`;
  }
}

/**
 * Mock trending tokens data (fallback when API is unavailable)
 * In production, this should be removed once the real API is integrated
 */
function getMockTrendingTokens(_args: z.infer<typeof GetTrendingTokensInput>): string {
  let result = `🔥 Trending Tokens on Four.meme\n`;
  result += `⚠️ Note: API endpoint not configured. Showing example data.\n\n`;
  result += `To integrate with real Four.meme API:\n`;
  result += `1. Get API documentation from https://four-meme.gitbook.io/four.meme/protocol-integration\n`;
  result += `2. Update FOUR_MEME_API_BASE constant with actual endpoint\n`;
  result += `3. Implement proper API authentication if required\n\n`;

  result += `Example Token Format:\n`;
  result += `1. Super Pepe (SPEPE)\n`;
  result += `   Address: 0x1234567890123456789012345678901234567890\n`;
  result += `   Quote Token: BNB\n`;
  result += `   Market Cap: 15.5 BNB\n`;
  result += `   24h Volume: 8.2 BNB\n`;
  result += `   Bonding Curve: 86%\n`;
  result += `   Status: 🔄 In Bonding Curve\n`;
  result += `   Holders: 234\n`;
  result += `   24h Trades: 156\n`;
  result += `   Created: ${new Date().toLocaleDateString()}\n\n`;

  result += `💡 This is placeholder data. Integrate with Four.meme API for real-time information.`;

  return result;
}

// Action class
export class GetTrendingTokensAction implements AgentkitAction<typeof GetTrendingTokensInput> {
  public name = "fourmeme_get_trending_tokens";
  public description = GET_TRENDING_TOKENS_PROMPT;
  public argsSchema = GetTrendingTokensInput;
  public func = getTrendingTokens;
  public smartAccountRequired = false; // Read-only, no wallet needed
}
