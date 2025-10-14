import { z } from "zod";
import { AgentkitAction } from "../../../agentkit";
import { ZeroXgaslessSmartAccount } from "@0xgasless/smart-account";

const GET_TOKEN_SCREENER_PROMPT = `
Retrieve comprehensive token information and analytics for a specific token across multiple blockchains. This endpoint provides detailed token data including market metrics, holder information, and trading activity.

Key Features:
- Comprehensive token information and analytics
- Multi-chain support
- Market metrics and holder information
- Trading activity and volume data
- Detailed token metadata

This endpoint requires a Nansen API key to be configured.
`;

/**
 * Input schema for getting token screener data.
 */
export const GetTokenScreenerInput = z
  .object({
    token_address: z.string().describe("The token address to get screener data for"),

    chains: z
      .array(
        z.enum([
          "all",
          "arbitrum",
          "avalanche",
          "base",
          "berachain",
          "blast",
          "bnb",
          "ethereum",
          "goat",
          "hyperevm",
          "iotaevm",
          "linea",
          "mantle",
          "optimism",
          "plasma",
          "polygon",
          "ronin",
          "sei",
          "scroll",
          "sonic",
          "unichain",
          "zksync",
          "solana",
        ])
      )
      .describe("Chains to include in the analysis. Use 'all' to include all available chains."),

    filters: z
      .object({
        token_symbol: z.string().optional().describe("Token symbol filter"),
        token_sectors: z.array(z.string()).optional().describe("Token sectors filter"),
        market_cap_usd: z
          .object({
            min: z.number().optional(),
            max: z.number().optional(),
          })
          .optional()
          .describe("Market cap range filter in USD"),
        volume_24h_usd: z
          .object({
            min: z.number().optional(),
            max: z.number().optional(),
          })
          .optional()
          .describe("24h volume range filter in USD"),
        holders_count: z
          .object({
            min: z.number().optional(),
            max: z.number().optional(),
          })
          .optional()
          .describe("Holders count range filter"),
        token_age_days: z
          .object({
            min: z.number().optional(),
            max: z.number().optional(),
          })
          .optional()
          .describe("Token age range filter in days"),
        timestamp: z
          .object({
            from: z.string().optional(),
            to: z.string().optional(),
          })
          .optional()
          .describe("Timestamp range filter"),
      })
      .optional()
      .describe("Additional filters to apply"),

    pagination: z
      .object({
        page: z.number().min(1).default(1).describe("Page number (1-based)"),
        per_page: z.number().min(1).max(1000).default(10).describe("Number of records per page (max 1000)"),
      })
      .optional()
      .describe("Pagination parameters"),

    order_by: z
      .array(
        z.object({
          field: z
            .enum([
              "chain",
              "token_address",
              "token_symbol",
              "token_sectors",
              "market_cap_usd",
              "volume_24h_usd",
              "holders_count",
              "token_age_days",
              "timestamp",
            ])
            .describe("Field to sort by"),
          direction: z.enum(["ASC", "DESC"]).describe("Sort direction"),
        })
      )
      .optional()
      .describe("Custom sort order to override the endpoint's default ordering"),
  })
  .strip()
  .describe("Instructions for getting token screener data");

/**
 * Response interface for token screener data.
 */
interface TokenScreener {
  chain: string;
  token_address: string;
  token_symbol: string;
  token_sectors: string[];
  market_cap_usd?: number;
  volume_24h_usd?: number;
  holders_count: number;
  token_age_days: number;
  timestamp: string;
}

interface TokenScreenerResponse {
  data: TokenScreener[];
  pagination: {
    page: number;
    per_page: number;
    is_last_page: boolean;
  };
}

/**
 * Fetches token screener data from Nansen API.
 *
 * @param _wallet - The smart account (not used for this action).
 * @param args - The input arguments containing token address, chains, filters, pagination, and sorting options.
 * @returns A formatted string containing the token screener data.
 */
export async function getTokenScreener(
  _wallet: ZeroXgaslessSmartAccount,
  args: z.infer<typeof GetTokenScreenerInput>,
): Promise<string> {
  try {
    const apiKey = process.env.NANSEN_API_KEY;
    if (!apiKey) {
      return "Error: NANSEN_API_KEY environment variable is required but not set.";
    }

    const requestBody = {
      token_address: args.token_address,
      chains: args.chains,
      ...(args.filters && { filters: args.filters }),
      ...(args.pagination && { pagination: args.pagination }),
      ...(args.order_by && { order_by: args.order_by }),
    };

    const response = await fetch("https://api.nansen.ai/api/v1/token-god-mode/token-screener", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apiKey: apiKey,
        "User-Agent": "0xGasless-AgentKit/1.0",
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      if (response.status === 401) {
        return "Error: Invalid Nansen API key. Please check your NANSEN_API_KEY environment variable.";
      }
      if (response.status === 403) {
        return "Error: Insufficient subscription tier for this endpoint.";
      }
      if (response.status === 429) {
        return "Error: Rate limit exceeded. Please wait before making another request.";
      }
      return `Error fetching token screener: ${response.status} ${response.statusText}`;
    }

    const data: TokenScreenerResponse = await response.json();

    if (!data.data || data.data.length === 0) {
      return `No token screener data found for token ${args.token_address}.`;
    }

    let result = `🔍 Token Screener for ${args.token_address}:\n\n`;

    data.data.forEach((token, index) => {
      const timestamp = new Date(token.timestamp).toLocaleString();
      const marketCapEmoji = token.market_cap_usd && token.market_cap_usd > 1000000000 ? "🚀" : 
                            token.market_cap_usd && token.market_cap_usd > 100000000 ? "📈" : "📊";
      
      result += `${index + 1}. Token Data ${marketCapEmoji}\n`;
      result += `   • Symbol: ${token.token_symbol}\n`;
      result += `   • Chain: ${token.chain}\n`;
      result += `   • Address: ${token.token_address}\n`;
      if (token.market_cap_usd) {
        result += `   • Market Cap: $${token.market_cap_usd.toLocaleString()}\n`;
      }
      if (token.volume_24h_usd) {
        result += `   • 24h Volume: $${token.volume_24h_usd.toLocaleString()}\n`;
      }
      result += `   • Holders: ${token.holders_count.toLocaleString()}\n`;
      result += `   • Age: ${token.token_age_days} days\n`;
      if (token.token_sectors && token.token_sectors.length > 0) {
        result += `   • Sectors: ${token.token_sectors.join(", ")}\n`;
      }
      result += `   • Updated: ${timestamp}\n`;
      result += "\n";
    });

    if (!data.pagination.is_last_page) {
      result += `Page ${data.pagination.page} of results. Use pagination to get more results.\n`;
    }

    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred";
    return `Error fetching token screener: ${errorMessage}`;
  }
}

/**
 * Get Token Screener action.
 */
export class GetTokenScreenerAction implements AgentkitAction<typeof GetTokenScreenerInput> {
  public name = "get_token_screener";
  public description = GET_TOKEN_SCREENER_PROMPT;
  public argsSchema = GetTokenScreenerInput;
  public func = getTokenScreener;
  public smartAccountRequired = false;
}
